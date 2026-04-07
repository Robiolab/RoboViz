import {
  RobotModel,
  Body,
  Joint,
  Geom,
  QposEntry,
  JointType,
  GeomType,
  QPOS_DOF,
  HALF_SIZE_GEOM_TYPES,
} from './types.js';
import { createXMLParser } from './xml.js';

// ---------------------------------------------------------------------------
// 1. Compiler Context (D-02, Pattern 1)
// ---------------------------------------------------------------------------

interface CompilerContext {
  angle: 'radian' | 'degree'; // default: 'degree'
  eulerseq: string;            // default: 'xyz'
  meshdir: string;             // default: ''
  autolimits: boolean;         // default: false
}

function parseCompiler(compilerEl: Record<string, unknown> | undefined): CompilerContext {
  if (!compilerEl) {
    return { angle: 'degree', eulerseq: 'xyz', meshdir: '', autolimits: false };
  }
  return {
    angle: (compilerEl['@_angle'] as 'radian' | 'degree') ?? 'degree',
    eulerseq: (compilerEl['@_eulerseq'] as string) ?? 'xyz',
    meshdir: (compilerEl['@_meshdir'] as string) ?? '',
    autolimits: compilerEl['@_autolimits'] === 'true' || compilerEl['@_autolimits'] === true,
  };
}

function toRadians(value: number, ctx: CompilerContext): number {
  return ctx.angle === 'degree' ? (value * Math.PI) / 180 : value;
}

// ---------------------------------------------------------------------------
// 2. Defaults Resolver (D-03, Pattern 2)
// ---------------------------------------------------------------------------

// Map from class name ('' = main class) to a nested map: tag -> attr map
// e.g. DefaultsMap.get('arm')?.get('geom') = { '@_rgba': '0.8 0.2 0.2 1', ... }
type ClassAttrMap = Map<string, Record<string, unknown>>; // tag -> attrs
type DefaultsMap = Map<string, ClassAttrMap>;             // class -> tag -> attrs

function buildDefaultsMap(
  defaultEls: unknown[],
  parentTagAttrs: ClassAttrMap = new Map(),
  map: DefaultsMap = new Map()
): DefaultsMap {
  for (const defaultEl of defaultEls) {
    if (typeof defaultEl !== 'object' || defaultEl === null) continue;
    const el = defaultEl as Record<string, unknown>;

    const className = (el['@_class'] as string) ?? '';

    // Collect per-tag attributes for this default class.
    // Each element child of <default> (e.g., <geom>, <joint>) defines attrs for that tag.
    const tagAttrs: ClassAttrMap = new Map();

    const ELEMENT_TAGS = ['geom', 'joint', 'site', 'tendon', 'motor', 'general', 'mesh', 'material'];
    for (const tag of ELEMENT_TAGS) {
      if (el[tag] !== undefined) {
        // fast-xml-parser returns repeated tags as arrays; inside <default>, take first element.
        const rawTagVal = el[tag];
        const rawTagEl: Record<string, unknown> = Array.isArray(rawTagVal)
          ? (rawTagVal[0] as Record<string, unknown>)
          : (rawTagVal as Record<string, unknown>);
        // Merge parent defaults for this tag (parent class overrides come first)
        const parentAttrs = parentTagAttrs.get(tag) ?? {};
        const merged: Record<string, unknown> = { ...parentAttrs, ...rawTagEl };
        tagAttrs.set(tag, merged);
      }
    }

    // Also copy parent tag attrs for tags not present in this class
    for (const [tag, attrs] of parentTagAttrs) {
      if (!tagAttrs.has(tag)) {
        tagAttrs.set(tag, { ...attrs });
      }
    }

    map.set(className, tagAttrs);

    // Recurse into nested <default> elements (they inherit from this class)
    if (Array.isArray(el['default'])) {
      buildDefaultsMap(el['default'] as unknown[], tagAttrs, map);
    }
  }
  return map;
}

function resolveAttrs(
  tag: string,
  element: Record<string, unknown>,
  defaults: DefaultsMap
): Record<string, unknown> {
  const className = (element['@_class'] as string) ?? '';

  // Get named class defaults for this tag
  const namedClassAttrs = defaults.get(className)?.get(tag) ?? {};
  // Get main class defaults for this tag
  const mainClassAttrs = defaults.get('')?.get(tag) ?? {};

  // Priority: element attrs > named class defaults > main class defaults
  return { ...mainClassAttrs, ...namedClassAttrs, ...element };
}

// ---------------------------------------------------------------------------
// 3. Quaternion helpers (D-08, Pitfall 2)
// ---------------------------------------------------------------------------

/** Convert MuJoCo quaternion (w,x,y,z) to Three.js order (x,y,z,w). */
function mjQuatToThree(
  wxyz: [number, number, number, number]
): [number, number, number, number] {
  return [wxyz[1], wxyz[2], wxyz[3], wxyz[0]];
}

/** Rotate Z-axis (0,0,1) to align with `dir`. Returns Three.js (x,y,z,w). */
function quaternionFromZAxis(
  dir: [number, number, number]
): [number, number, number, number] {
  const [dx, dy, dz] = dir;
  // Length check
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return [0, 0, 0, 1]; // degenerate — identity

  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;

  // Special case: dir is (0,0,1) — identity
  if (Math.abs(nz - 1) < 1e-7) return [0, 0, 0, 1];

  // Special case: dir is (0,0,-1) — 180 degrees around X
  if (Math.abs(nz + 1) < 1e-7) return [1, 0, 0, 0];

  // General case: rotation from (0,0,1) to (nx,ny,nz)
  // cross product: (0,0,1) x (nx,ny,nz) = (-ny, nx, 0) — not normalized
  const cx = -ny;
  const cy = nx;
  const cz = 0;
  const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);

  // sin(angle) = |cross|, cos(angle) = dot = nz
  // quaternion: axis = cross / |cross|, half-angle
  const sinHalf = Math.sqrt((1 - nz) / 2);
  const cosHalf = Math.sqrt((1 + nz) / 2);

  const ax = cx / crossLen;
  const ay = cy / crossLen;
  // az = 0

  return [ax * sinHalf, ay * sinHalf, 0, cosHalf];
}

// ---------------------------------------------------------------------------
// 4. fromto geometry derivation (D-04, Pattern 3)
// ---------------------------------------------------------------------------

function fromtoToGeom(fromto: number[]): {
  pos: [number, number, number];
  quat: [number, number, number, number];
  halfLength: number;
} {
  const p1: [number, number, number] = [fromto[0], fromto[1], fromto[2]];
  const p2: [number, number, number] = [fromto[3], fromto[4], fromto[5]];

  const pos: [number, number, number] = [
    (p1[0] + p2[0]) / 2,
    (p1[1] + p2[1]) / 2,
    (p1[2] + p2[2]) / 2,
  ];

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];
  const fullLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const halfLength = fullLength / 2;

  const dir: [number, number, number] =
    fullLength > 1e-10
      ? [dx / fullLength, dy / fullLength, dz / fullLength]
      : [0, 0, 1];

  // Quaternion is computed in Three.js (x,y,z,w) order directly — no mjQuatToThree needed
  const quat = quaternionFromZAxis(dir);

  return { pos, quat, halfLength };
}

// ---------------------------------------------------------------------------
// 5. Half-size conversion (D-07, Pitfall 1)
// ---------------------------------------------------------------------------

function convertHalfSizes(type: GeomType, rawSize: number[]): number[] {
  if (!HALF_SIZE_GEOM_TYPES.has(type)) {
    // sphere, ellipsoid, mesh — no conversion
    return rawSize;
  }
  if (type === 'box') {
    // All 3 values are half-extents
    return rawSize.map(v => v * 2);
  }
  // cylinder and capsule: size[0] is radius (unchanged), size[1] is half-length
  const result = [...rawSize];
  if (result.length >= 2) {
    result[1] = result[1] * 2;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 6. Euler-to-quaternion (for body poses with euler= attribute)
// ---------------------------------------------------------------------------

function eulerToQuat(
  euler: number[],
  seq: string
): [number, number, number, number] {
  const normalizedSeq = seq.toLowerCase();
  if (normalizedSeq !== 'xyz' && normalizedSeq !== 'rpy') {
    console.warn(`[roboviz] Euler sequence "${seq}" not supported; using identity quaternion`);
    return [0, 0, 0, 1];
  }

  // Intrinsic XYZ (or RPY which is the same as XYZ)
  const [ex, ey, ez] = euler;
  const c1 = Math.cos(ex / 2);
  const s1 = Math.sin(ex / 2);
  const c2 = Math.cos(ey / 2);
  const s2 = Math.sin(ey / 2);
  const c3 = Math.cos(ez / 2);
  const s3 = Math.sin(ez / 2);

  // Intrinsic XYZ → extrinsic ZYX composition
  const w = c1 * c2 * c3 - s1 * s2 * s3;
  const x = s1 * c2 * c3 + c1 * s2 * s3;
  const y = c1 * s2 * c3 - s1 * c2 * s3;
  const z = c1 * c2 * s3 + s1 * s2 * c3;

  // Return in Three.js (x,y,z,w) order
  return [x, y, z, w];
}

// ---------------------------------------------------------------------------
// 7. Parse helpers
// ---------------------------------------------------------------------------

function parseFloats(str: string | number | undefined | null): number[] {
  if (str === undefined || str === null) return [];
  if (typeof str === 'number') return [str];
  return String(str)
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter(n => !isNaN(n));
}

function parseVec3(
  str: string | number | undefined | null,
  defaultVal: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  const vals = parseFloats(str);
  if (vals.length >= 3) return [vals[0], vals[1], vals[2]];
  return defaultVal;
}

function parseQuat4(
  str: string | number | undefined | null
): [number, number, number, number] | null {
  const vals = parseFloats(str);
  if (vals.length >= 4) return [vals[0], vals[1], vals[2], vals[3]];
  return null;
}

function parseRgba(
  str: string | number | undefined | null,
  defaultVal: [number, number, number, number] = [0.5, 0.5, 0.5, 1]
): [number, number, number, number] {
  const vals = parseFloats(str);
  if (vals.length >= 4) return [vals[0], vals[1], vals[2], vals[3]];
  return defaultVal;
}

// ---------------------------------------------------------------------------
// 8. Parse body (recursive)
// ---------------------------------------------------------------------------

function parseGeom(
  geomEl: Record<string, unknown>,
  defaults: DefaultsMap
): Geom {
  const attrs = resolveAttrs('geom', geomEl, defaults);

  const name = (attrs['@_name'] as string) ?? '';
  const rawType = (attrs['@_type'] as string) ?? 'sphere';
  const type = rawType as GeomType;

  let pos: [number, number, number] = [0, 0, 0];
  let quat: [number, number, number, number] = [0, 0, 0, 1];
  let size: number[] = [0.05]; // default sphere radius

  const fromtoStr = attrs['@_fromto'] as string | number | undefined;
  if (fromtoStr !== undefined) {
    // fromto overrides pos/quat/size
    const fromto = parseFloats(fromtoStr);
    if (fromto.length >= 6) {
      const derived = fromtoToGeom(fromto);
      pos = derived.pos;
      quat = derived.quat;

      // For fromto capsule/cylinder: size has only radius; halfLength comes from fromto
      const rawSize = parseFloats(attrs['@_size'] as string | number | undefined);
      const radius = rawSize[0] ?? 0.05;
      // Full length = halfLength * 2 (already converted from half to full)
      size = [radius, derived.halfLength * 2];
    }
  } else {
    // Normal pos/quat/size
    const posVal = attrs['@_pos'] as string | number | undefined;
    if (posVal !== undefined) {
      pos = parseVec3(posVal);
    }

    const quatStr = attrs['@_quat'] as string | number | undefined;
    if (quatStr !== undefined) {
      const mjQuat = parseQuat4(quatStr);
      if (mjQuat) {
        quat = mjQuatToThree(mjQuat);
      }
    }

    const rawSize = parseFloats(attrs['@_size'] as string | number | undefined);
    if (rawSize.length > 0) {
      size = convertHalfSizes(type, rawSize);
    }
  }

  const rgba = parseRgba(attrs['@_rgba'] as string | number | undefined);

  const meshRef = attrs['@_mesh'] as string | undefined;
  const meshScaleStr = attrs['@_scale'] as string | undefined;
  let meshScale: [number, number, number] | undefined;
  if (meshScaleStr) {
    const sv = parseFloats(meshScaleStr);
    if (sv.length >= 3) meshScale = [sv[0], sv[1], sv[2]];
    else if (sv.length === 1) meshScale = [sv[0], sv[0], sv[0]];
  }

  return { type, name, pos, quat, size, rgba, meshRef, meshScale };
}

function parseJoint(
  jointEl: Record<string, unknown>,
  defaults: DefaultsMap,
  ctx: CompilerContext,
  qposOffset: { value: number }
): Joint {
  const attrs = resolveAttrs('joint', jointEl, defaults);

  const name = (attrs['@_name'] as string) ?? '';
  const rawType = (attrs['@_type'] as string) ?? 'hinge';
  const type = rawType as JointType;

  const axisStr = attrs['@_axis'] as string | number | undefined;
  const axis = parseVec3(axisStr, [0, 0, 1]) as [number, number, number];

  let range: [number, number] | null = null;
  const rangeStr = attrs['@_range'] as string | number | undefined;
  if (rangeStr !== undefined) {
    const vals = parseFloats(rangeStr);
    if (vals.length >= 2) {
      range = [toRadians(vals[0], ctx), toRadians(vals[1], ctx)];
    }
  }

  const dof = QPOS_DOF[type] ?? 1;
  const qposIndex = qposOffset.value;
  qposOffset.value += dof;

  return { name, type, axis, range, qposIndex, qposDim: dof };
}

function parseBody(
  bodyEl: Record<string, unknown>,
  ctx: CompilerContext,
  defaults: DefaultsMap,
  joints: Joint[],
  qposOffset: { value: number }
): Body {
  const name = (bodyEl['@_name'] as string) ?? 'unnamed';

  // Parse pose
  const posStr = bodyEl['@_pos'] as string | number | undefined;
  const position = parseVec3(posStr);

  let quaternion: [number, number, number, number] = [0, 0, 0, 1];

  const quatStr = bodyEl['@_quat'] as string | number | undefined;
  const eulerStr = bodyEl['@_euler'] as string | number | undefined;

  if (quatStr !== undefined) {
    const mjQuat = parseQuat4(quatStr);
    if (mjQuat) {
      quaternion = mjQuatToThree(mjQuat);
    }
  } else if (eulerStr !== undefined) {
    const eulerVals = parseFloats(eulerStr);
    if (eulerVals.length >= 3) {
      const eulerRad = eulerVals.map(v => toRadians(v, ctx));
      quaternion = eulerToQuat(eulerRad, ctx.eulerseq);
    }
  }

  // Parse geoms
  const geomEls = (bodyEl['geom'] as Record<string, unknown>[] | undefined) ?? [];
  const geoms: Geom[] = geomEls.map(geomEl => parseGeom(geomEl, defaults));

  // Parse joints
  const jointEls = (bodyEl['joint'] as Record<string, unknown>[] | undefined) ?? [];
  const bodyJoints: Joint[] = jointEls.map(jointEl =>
    parseJoint(jointEl, defaults, ctx, qposOffset)
  );
  joints.push(...bodyJoints);

  // Recurse into child bodies
  const childBodyEls = (bodyEl['body'] as Record<string, unknown>[] | undefined) ?? [];
  const children: Body[] = childBodyEls.map(child =>
    parseBody(child, ctx, defaults, joints, qposOffset)
  );

  return {
    name,
    pose: { position, quaternion },
    geoms,
    joints: bodyJoints,
    children,
  };
}

// ---------------------------------------------------------------------------
// 9. qpos map builder (D-09, Pattern 4)
// ---------------------------------------------------------------------------

function buildQposMap(joints: Joint[]): QposEntry[] {
  return joints.map(joint => ({
    jointName: joint.name,
    qposOffset: joint.qposIndex,
    dof: joint.qposDim,
  }));
}

// ---------------------------------------------------------------------------
// 10. parseMjcf — public entry point
// ---------------------------------------------------------------------------

export function parseMjcf(xmlContent: string): RobotModel {
  const parser = createXMLParser();
  const parsed = parser.parse(xmlContent) as Record<string, unknown>;

  const mujoco = parsed['mujoco'] as Record<string, unknown> | undefined;
  if (!mujoco) {
    throw new Error('[roboviz] parseMjcf: no <mujoco> root element found');
  }

  const modelName = (mujoco['@_model'] as string) ?? 'unnamed';

  // 1. Parse compiler settings first (D-02)
  const compilerEl = mujoco['compiler'] as Record<string, unknown> | undefined;
  const ctx = parseCompiler(compilerEl);

  // 2. Build defaults map (D-03)
  const rawDefaults = mujoco['default'];
  let defaultEls: unknown[] = [];
  if (Array.isArray(rawDefaults)) {
    defaultEls = rawDefaults;
  } else if (rawDefaults && typeof rawDefaults === 'object') {
    defaultEls = [rawDefaults];
  }
  const defaults = buildDefaultsMap(defaultEls);

  // 3. Warn about skipped elements (D-05, D-06)
  const SKIPPED = ['include', 'composite', 'tendon', 'actuator', 'sensor'];
  for (const tag of SKIPPED) {
    if (mujoco[tag] !== undefined) {
      console.warn(`[roboviz] parseMjcf: <${tag}> is not supported in v1 and will be ignored`);
    }
  }

  // 4. Parse worldbody recursively
  const worldbodyEl = mujoco['worldbody'] as Record<string, unknown> | undefined;
  if (!worldbodyEl) {
    throw new Error('[roboviz] parseMjcf: no <worldbody> element found');
  }

  const joints: Joint[] = [];
  const qposOffset = { value: 0 };

  // worldbody itself becomes the root body (no joints, no geoms at root level)
  const bodyEls = (worldbodyEl['body'] as Record<string, unknown>[] | undefined) ?? [];
  const children: Body[] = bodyEls.map(bodyEl =>
    parseBody(bodyEl, ctx, defaults, joints, qposOffset)
  );

  const root: Body = {
    name: 'worldbody',
    pose: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    geoms: [],
    joints: [],
    children,
  };

  // 5. Build joint lookup structures
  const jointIndex = new Map<string, Joint>();
  for (const joint of joints) {
    jointIndex.set(joint.name, joint);
  }

  const qposMap = buildQposMap(joints);
  const totalQpos = qposOffset.value;

  return {
    name: modelName,
    format: 'mjcf',
    root,
    joints,
    jointIndex,
    qposMap,
    totalQpos,
  };
}
