import { createXMLParser } from './xml.js';
import type { Body, Geom, GeomType, Joint, JointType, Pose, QposEntry, RobotModel } from './types.js';
import { QPOS_DOF } from './types.js';

// Minimal path join that works in Node.js without requiring node:path types
// Joins two path segments, handling trailing/leading slashes
function pathJoin(dir: string, rest: string): string {
  const d = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  const r = rest.startsWith('/') ? rest.slice(1) : rest;
  return `${d}/${r}`;
}

// ---------------------------------------------------------------------------
// Joint type mapping: URDF type -> RobotModel JointType
// 'planar' is deliberately absent — log warning and skip
// ---------------------------------------------------------------------------
const URDF_JOINT_MAP: Record<string, JointType> = {
  revolute: 'hinge',
  continuous: 'hinge',
  prismatic: 'slide',
  fixed: 'fixed',
  floating: 'free',
};

// ---------------------------------------------------------------------------
// Joint types that have limit elements (revolute and prismatic only)
// continuous, fixed, floating: range = null (never access <limit>)
// ---------------------------------------------------------------------------
const JOINT_TYPES_WITH_LIMITS = new Set<string>(['revolute', 'prismatic']);

// ---------------------------------------------------------------------------
// RPY → Quaternion conversion (URDF extrinsic XYZ = fixed-axis)
// Returns [x, y, z, w] (Three.js order)
// ---------------------------------------------------------------------------
function rpyToQuat(rpy: [number, number, number]): [number, number, number, number] {
  const [r, p, y] = rpy;
  const cr = Math.cos(r / 2);
  const sr = Math.sin(r / 2);
  const cp = Math.cos(p / 2);
  const sp = Math.sin(p / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);

  const qw = cr * cp * cy + sr * sp * sy;
  const qx = sr * cp * cy - cr * sp * sy;
  const qy = cr * sp * cy + sr * cp * sy;
  const qz = cr * cp * sy - sr * sp * cy;

  return [qx, qy, qz, qw];
}

// ---------------------------------------------------------------------------
// Mesh path resolution (per D-14)
// ---------------------------------------------------------------------------
function resolveMeshPath(filename: string, meshDir?: string): string {
  const PACKAGE_PREFIX = 'package://';
  if (filename.startsWith(PACKAGE_PREFIX)) {
    const withoutPrefix = filename.slice(PACKAGE_PREFIX.length);
    if (!meshDir) {
      console.warn(
        `[roboviz] package:// mesh path found but no meshDir provided. ` +
          `Stripping prefix only: "${withoutPrefix}". ` +
          `Pass options.meshDir to resolve package:// paths.`,
      );
      return withoutPrefix;
    }
    return pathJoin(meshDir, withoutPrefix);
  }
  return filename;
}

// ---------------------------------------------------------------------------
// Parse XYZ attribute string → [number, number, number]
// ---------------------------------------------------------------------------
function parseXYZ(xyz: string | undefined, defaultVec: [number, number, number]): [number, number, number] {
  if (!xyz) return defaultVec;
  const parts = String(xyz).trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return defaultVec;
  return [parts[0], parts[1], parts[2]];
}

// ---------------------------------------------------------------------------
// Parse RGBA string → [r, g, b, a]
// ---------------------------------------------------------------------------
function parseRGBA(rgba: string | undefined): [number, number, number, number] {
  if (!rgba) return [0.5, 0.5, 0.5, 1.0];
  const parts = String(rgba).trim().split(/\s+/).map(Number);
  if (parts.length < 4) return [0.5, 0.5, 0.5, 1.0];
  return [parts[0], parts[1], parts[2], parts[3]];
}

// ---------------------------------------------------------------------------
// Parse material definitions: name → rgba
// ---------------------------------------------------------------------------
function parseMaterials(
  materialElements: unknown[] | undefined,
): Map<string, [number, number, number, number]> {
  const materials = new Map<string, [number, number, number, number]>();
  if (!materialElements) return materials;

  for (const mat of materialElements) {
    const m = mat as Record<string, unknown>;
    const name = String((m['@_name'] as string) ?? '');
    const colorEl = m['color'] as Record<string, unknown> | undefined;
    if (name && colorEl) {
      const rgba = parseRGBA(colorEl['@_rgba'] as string | undefined);
      materials.set(name, rgba);
    }
  }
  return materials;
}

// ---------------------------------------------------------------------------
// Internal types for intermediate parsing
// ---------------------------------------------------------------------------
interface LinkData {
  name: string;
  visuals: Array<{
    pos: [number, number, number];
    quat: [number, number, number, number];
    geom: Geom;
  }>;
}

interface JointData {
  name: string;
  urdfType: string; // original URDF type string
  mappedType: JointType;
  parentLink: string;
  childLink: string;
  origin: Pose; // <joint><origin> → goes into Body.pose of child link
  axis: [number, number, number];
  range: [number, number] | null;
}

// ---------------------------------------------------------------------------
// Parse <origin xyz="..." rpy="..."> element
// ---------------------------------------------------------------------------
function parseOrigin(originEl: Record<string, unknown> | undefined): Pose {
  if (!originEl) {
    return { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
  }
  const pos = parseXYZ(originEl['@_xyz'] as string | undefined, [0, 0, 0]);
  const rpyStr = originEl['@_rpy'] as string | undefined;
  const rpyParts = rpyStr
    ? (String(rpyStr)
        .trim()
        .split(/\s+/)
        .map(Number) as [number, number, number])
    : ([0, 0, 0] as [number, number, number]);
  const quat = rpyToQuat(rpyParts);
  return { position: pos, quaternion: quat };
}

// ---------------------------------------------------------------------------
// Parse <geometry> element into partial Geom fields
// ---------------------------------------------------------------------------
function parseGeometry(
  geomEl: Record<string, unknown> | undefined,
  meshDir: string | undefined,
  geomIndex: number,
): Partial<Geom> | null {
  if (!geomEl) return null;

  // box
  const boxEl = geomEl['box'] as Record<string, unknown> | undefined;
  if (boxEl) {
    const size = parseXYZ(boxEl['@_size'] as string | undefined, [1, 1, 1]);
    return { type: 'box' as GeomType, size: [size[0], size[1], size[2]] };
  }

  // cylinder
  const cylEl = geomEl['cylinder'] as Record<string, unknown> | undefined;
  if (cylEl) {
    const radius = Number(cylEl['@_radius'] ?? 0.1);
    const length = Number(cylEl['@_length'] ?? 1.0);
    return { type: 'cylinder' as GeomType, size: [radius, length] };
  }

  // sphere
  const sphereEl = geomEl['sphere'] as Record<string, unknown> | undefined;
  if (sphereEl) {
    const radius = Number(sphereEl['@_radius'] ?? 0.1);
    return { type: 'sphere' as GeomType, size: [radius] };
  }

  // capsule (not standard URDF but handle gracefully)
  const capsuleEl = geomEl['capsule'] as Record<string, unknown> | undefined;
  if (capsuleEl) {
    const radius = Number(capsuleEl['@_radius'] ?? 0.1);
    const length = Number(capsuleEl['@_length'] ?? 1.0);
    return { type: 'capsule' as GeomType, size: [radius, length] };
  }

  // mesh — 'mesh' is in ALWAYS_ARRAY_ELEMENTS so fast-xml-parser returns an array; take first element
  const meshRaw = geomEl['mesh'];
  const meshEl = Array.isArray(meshRaw)
    ? (meshRaw[0] as Record<string, unknown> | undefined)
    : (meshRaw as Record<string, unknown> | undefined);
  if (meshEl) {
    const filename = String(meshEl['@_filename'] ?? '');
    const meshRef = resolveMeshPath(filename, meshDir);
    const scaleStr = meshEl['@_scale'] as string | undefined;
    let meshScale: [number, number, number] | undefined;
    if (scaleStr) {
      const parts = String(scaleStr)
        .trim()
        .split(/\s+/)
        .map(Number);
      if (parts.length >= 3 && parts.every((v) => !isNaN(v))) {
        meshScale = [parts[0], parts[1], parts[2]];
      }
    }
    const result: Partial<Geom> = { type: 'mesh' as GeomType, size: [], meshRef };
    if (meshScale !== undefined) result.meshScale = meshScale;
    return result;
  }

  console.warn(`[roboviz] Unknown URDF geometry type at visual index ${geomIndex}`);
  return null;
}

// ---------------------------------------------------------------------------
// Parse all <link> elements into a flat map
// ---------------------------------------------------------------------------
function parseLinks(
  linkElements: unknown[],
  materials: Map<string, [number, number, number, number]>,
  meshDir: string | undefined,
): Map<string, LinkData> {
  const links = new Map<string, LinkData>();

  for (const linkRaw of linkElements) {
    const link = linkRaw as Record<string, unknown>;
    const name = String(link['@_name'] ?? '');
    if (!name) continue;

    const visuals: LinkData['visuals'] = [];

    // visual elements are always arrays (configured in xml.ts)
    const visualElements = link['visual'] as unknown[] | undefined;
    if (visualElements) {
      visualElements.forEach((vRaw, idx) => {
        const v = vRaw as Record<string, unknown>;

        // Parse visual origin — goes into Geom.pos/quat (NOT Body.pose)
        const visualOrigin = v['origin'] as Record<string, unknown> | undefined;
        const visualPose = parseOrigin(visualOrigin);

        // Parse geometry
        const geomEl = v['geometry'] as Record<string, unknown> | undefined;
        const geomPartial = parseGeometry(geomEl, meshDir, idx);
        if (!geomPartial) return;

        // Parse material color
        // 'material' is in ALWAYS_ARRAY_ELEMENTS so fast-xml-parser returns it as an array
        let rgba: [number, number, number, number] = [0.5, 0.5, 0.5, 1.0];
        const matRaw = v['material'];
        const matEl = Array.isArray(matRaw)
          ? (matRaw[0] as Record<string, unknown> | undefined)
          : (matRaw as Record<string, unknown> | undefined);
        if (matEl) {
          const matName = String(matEl['@_name'] ?? '');
          if (matName && materials.has(matName)) {
            rgba = materials.get(matName)!;
          } else {
            // Inline color
            const inlineColor = matEl['color'] as Record<string, unknown> | undefined;
            if (inlineColor) {
              rgba = parseRGBA(inlineColor['@_rgba'] as string | undefined);
            }
          }
        }

        const geom: Geom = {
          type: geomPartial.type ?? 'sphere',
          name: `${name}_visual_${idx}`,
          pos: visualPose.position,
          quat: visualPose.quaternion,
          size: geomPartial.size ?? [],
          rgba,
          ...(geomPartial.meshRef !== undefined ? { meshRef: geomPartial.meshRef } : {}),
          ...(geomPartial.meshScale !== undefined ? { meshScale: geomPartial.meshScale } : {}),
        };

        visuals.push({ pos: visualPose.position, quat: visualPose.quaternion, geom });
      });
    }

    links.set(name, { name, visuals });
  }

  return links;
}

// ---------------------------------------------------------------------------
// Parse all <joint> elements into a flat list
// ---------------------------------------------------------------------------
function parseJoints(jointElements: unknown[]): JointData[] {
  const joints: JointData[] = [];

  for (const jointRaw of jointElements) {
    const joint = jointRaw as Record<string, unknown>;
    const name = String(joint['@_name'] ?? '');
    const urdfType = String(joint['@_type'] ?? 'fixed');

    // Handle planar joint: warn and skip
    if (urdfType === 'planar') {
      console.warn(`[roboviz] Skipping planar joint: ${name} (planar joints not supported)`);
      continue;
    }

    const mappedType = URDF_JOINT_MAP[urdfType];
    if (!mappedType) {
      console.warn(`[roboviz] Unknown URDF joint type "${urdfType}" for joint "${name}", treating as fixed`);
    }
    const resolvedType: JointType = mappedType ?? 'fixed';

    // Parent/child links
    const parentEl = joint['parent'] as Record<string, unknown> | undefined;
    const childEl = joint['child'] as Record<string, unknown> | undefined;
    const parentLink = String(parentEl?.['@_link'] ?? '');
    const childLink = String(childEl?.['@_link'] ?? '');

    // Joint origin → becomes Body.pose of the child link
    const originEl = joint['origin'] as Record<string, unknown> | undefined;
    const origin = parseOrigin(originEl);

    // Axis — default [1,0,0] per URDF spec
    const axisEl = joint['axis'] as Record<string, unknown> | undefined;
    const axis = parseXYZ(axisEl?.['@_xyz'] as string | undefined, [1, 0, 0]);

    // Limits — ONLY for revolute and prismatic
    let range: [number, number] | null = null;
    if (JOINT_TYPES_WITH_LIMITS.has(urdfType)) {
      const limitEl = joint['limit'] as Record<string, unknown> | undefined;
      if (limitEl) {
        const lower = Number(limitEl['@_lower'] ?? 0);
        const upper = Number(limitEl['@_upper'] ?? 0);
        range = [lower, upper];
      }
    }

    joints.push({
      name,
      urdfType,
      mappedType: resolvedType,
      parentLink,
      childLink,
      origin,
      axis,
      range,
    });
  }

  return joints;
}

// ---------------------------------------------------------------------------
// Build hierarchical Body tree from flat link/joint data
// ---------------------------------------------------------------------------
function buildBodyTree(
  linkName: string,
  links: Map<string, LinkData>,
  jointsByParentLink: Map<string, JointData[]>,
  allJoints: Joint[],
  qposMap: QposEntry[],
  qposOffset: { value: number },
  jointOrigin: Pose | null,
): Body {
  const linkData = links.get(linkName);

  // Build geoms from link's visual elements
  const geoms: Geom[] = linkData?.visuals.map((v) => v.geom) ?? [];

  // Pose comes from the joint that connects this body to its parent
  const pose: Pose = jointOrigin ?? { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };

  // Find all joints where this link is the PARENT (connect to children)
  const outgoingJoints = jointsByParentLink.get(linkName) ?? [];

  // Build joints array for this body (joints "belong" to child body per RobotModel convention)
  // The joint for THIS body was already attached by the parent's call — here we process
  // children and attach joints to them.
  const childBodies: Body[] = [];
  const bodyJoints: Joint[] = [];

  for (const jd of outgoingJoints) {
    const joint: Joint = {
      name: jd.name,
      type: jd.mappedType,
      axis: jd.axis,
      range: jd.range,
      qposIndex: qposOffset.value,
      qposDim: QPOS_DOF[jd.mappedType],
    };

    // Add to flat joint list and qpos map
    allJoints.push(joint);
    qposMap.push({
      jointName: jd.name,
      qposOffset: qposOffset.value,
      dof: joint.qposDim,
    });
    qposOffset.value += joint.qposDim;

    // Recursively build child body
    const childBody = buildBodyTree(
      jd.childLink,
      links,
      jointsByParentLink,
      allJoints,
      qposMap,
      qposOffset,
      jd.origin, // child body's pose comes from joint origin
    );

    // Attach the joint to the child body (per RobotModel convention — joint is "on" the child)
    childBody.joints.push(joint);
    childBodies.push(childBody);
  }

  return {
    name: linkName,
    pose,
    geoms,
    joints: bodyJoints, // will have joints pushed onto it by parent's loop (see above)
    children: childBodies,
  };
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------
export function parseUrdf(xmlContent: string, options?: { meshDir?: string }): RobotModel {
  const meshDir = options?.meshDir;

  const parser = createXMLParser();
  const parsed = parser.parse(xmlContent) as Record<string, unknown>;

  // Extract <robot> root element
  const robotEl = parsed['robot'] as Record<string, unknown> | undefined;
  if (!robotEl) {
    throw new Error('[roboviz] URDF parse error: no <robot> root element found');
  }

  const name = String(robotEl['@_name'] ?? 'unnamed');

  // Parse materials (global material definitions)
  const materialElements = robotEl['material'] as unknown[] | undefined;
  const materials = parseMaterials(materialElements);

  // Parse links
  const linkElements = (robotEl['link'] as unknown[] | undefined) ?? [];
  const links = parseLinks(linkElements, materials, meshDir);

  // Parse joints
  const jointElements = (robotEl['joint'] as unknown[] | undefined) ?? [];
  const jointDataList = parseJoints(jointElements);

  // Build lookup structures for tree traversal
  const childLinkNames = new Set<string>();
  const jointsByParentLink = new Map<string, JointData[]>();

  for (const jd of jointDataList) {
    childLinkNames.add(jd.childLink);
    if (!jointsByParentLink.has(jd.parentLink)) {
      jointsByParentLink.set(jd.parentLink, []);
    }
    jointsByParentLink.get(jd.parentLink)!.push(jd);
  }

  // Find root link: any link NOT listed as a childLink
  let rootLinkName: string | undefined;
  for (const linkName of links.keys()) {
    if (!childLinkNames.has(linkName)) {
      rootLinkName = linkName;
      break;
    }
  }

  if (!rootLinkName) {
    throw new Error('[roboviz] URDF parse error: no root link found (circular joint tree?)');
  }

  // Build body tree
  const allJoints: Joint[] = [];
  const qposMap: QposEntry[] = [];
  const qposOffset = { value: 0 };

  const root = buildBodyTree(
    rootLinkName,
    links,
    jointsByParentLink,
    allJoints,
    qposMap,
    qposOffset,
    null, // root has no parent joint
  );

  // Build joint index map
  const jointIndex = new Map<string, Joint>();
  for (const j of allJoints) {
    jointIndex.set(j.name, j);
  }

  return {
    name,
    format: 'urdf',
    root,
    joints: allJoints,
    jointIndex,
    qposMap,
    totalQpos: qposOffset.value,
  };
}
