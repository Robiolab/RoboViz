import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMjcf } from '../src/parser/mjcf.js';

const FIXTURE_DIR = join(new URL('.', import.meta.url).pathname, 'fixtures');

// --- Inline MJCF strings for targeted pitfall tests ---

const QUAT_TEST_MJCF = `
<mujoco model="quat_test">
  <worldbody>
    <body name="b1" quat="1 0 0 0">
      <geom type="sphere" size="0.1"/>
    </body>
  </worldbody>
</mujoco>
`;

const QPOS_TEST_MJCF = `
<mujoco model="qpos_test">
  <worldbody>
    <body name="base">
      <joint name="root" type="free"/>
      <body name="arm">
        <joint name="j1" type="hinge" axis="0 0 1"/>
        <joint name="j2" type="hinge" axis="0 1 0"/>
      </body>
    </body>
  </worldbody>
</mujoco>
`;

const RADIAN_COMPILER_MJCF = `
<mujoco model="radian_test">
  <compiler angle="radian"/>
  <worldbody>
    <body name="link">
      <joint name="j1" type="hinge" axis="0 0 1" range="-1.5708 1.5708"/>
    </body>
  </worldbody>
</mujoco>
`;

const DEGREE_COMPILER_MJCF = `
<mujoco model="degree_test">
  <compiler angle="degree"/>
  <worldbody>
    <body name="link">
      <joint name="j1" type="hinge" axis="0 0 1" range="-90 90"/>
    </body>
  </worldbody>
</mujoco>
`;

const SKIPPED_ELEMENTS_MJCF = `
<mujoco model="skip_test">
  <worldbody>
    <body name="b">
      <geom type="sphere" size="0.1"/>
    </body>
  </worldbody>
  <actuator/>
  <tendon/>
  <sensor/>
</mujoco>
`;

// --- Two-link arm fixture (main integration fixture) ---

describe('parseMjcf - happy path (two_link_arm.xml)', () => {
  const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
  let model: ReturnType<typeof parseMjcf>;

  it('returns a RobotModel with the correct name', () => {
    model = parseMjcf(xml);
    expect(model.name).toBe('two_link_arm');
    expect(model.format).toBe('mjcf');
  });

  it('root body is worldbody with one child (upper_arm)', () => {
    model = parseMjcf(xml);
    expect(model.root.name).toBe('worldbody');
    expect(model.root.children).toHaveLength(1);
    expect(model.root.children[0].name).toBe('upper_arm');
  });

  it('body hierarchy — upper_arm has lower_arm as child', () => {
    model = parseMjcf(xml);
    const upperArm = model.root.children[0];
    expect(upperArm.children).toHaveLength(1);
    expect(upperArm.children[0].name).toBe('lower_arm');
  });

  it('upper_arm body pose position is [0, 0, 1]', () => {
    model = parseMjcf(xml);
    const upperArm = model.root.children[0];
    expect(upperArm.pose.position).toEqual([0, 0, 1]);
  });
});

// --- Pitfall 5: Compiler angle settings ---

describe('parseMjcf - Pitfall 5: compiler angle settings', () => {
  it('compiler angle="radian" — joint range stored as radians without conversion', () => {
    const model = parseMjcf(RADIAN_COMPILER_MJCF);
    const joint = model.joints[0];
    expect(joint.range).not.toBeNull();
    expect(joint.range![0]).toBeCloseTo(-1.5708, 3);
    expect(joint.range![1]).toBeCloseTo(1.5708, 3);
  });

  it('compiler angle="degree" — joint range converted from degrees to radians', () => {
    const model = parseMjcf(DEGREE_COMPILER_MJCF);
    const joint = model.joints[0];
    expect(joint.range).not.toBeNull();
    // -90 degrees = -PI/2
    expect(joint.range![0]).toBeCloseTo(-Math.PI / 2, 5);
    // 90 degrees = PI/2
    expect(joint.range![1]).toBeCloseTo(Math.PI / 2, 5);
  });

  it('two_link_arm uses degree — shoulder joint range stored in radians', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const shoulder = model.joints.find(j => j.name === 'shoulder');
    expect(shoulder).toBeDefined();
    expect(shoulder!.range![0]).toBeCloseTo(-Math.PI / 2, 5);  // -90 degrees
    expect(shoulder!.range![1]).toBeCloseTo(Math.PI / 2, 5);   // 90 degrees
  });
});

// --- Pitfall 4: Default class inheritance ---

describe('parseMjcf - Pitfall 4: default class inheritance', () => {
  it('geom rgba inherited from default class "arm"', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const upperArm = model.root.children[0];
    const upperGeom = upperArm.geoms.find(g => g.name === 'upper_geom');
    expect(upperGeom).toBeDefined();
    // Default class "arm" has rgba="0.8 0.2 0.2 1"
    expect(upperGeom!.rgba[0]).toBeCloseTo(0.8, 3);
    expect(upperGeom!.rgba[1]).toBeCloseTo(0.2, 3);
    expect(upperGeom!.rgba[2]).toBeCloseTo(0.2, 3);
    expect(upperGeom!.rgba[3]).toBeCloseTo(1.0, 3);
  });

  it('geom type "capsule" inherited from default class "arm"', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const upperArm = model.root.children[0];
    const lowerArm = upperArm.children[0];
    const lowerGeom = lowerArm.geoms.find(g => g.name === 'lower_geom');
    expect(lowerGeom).toBeDefined();
    expect(lowerGeom!.type).toBe('capsule');
  });

  it('element-level rgba overrides default class (hand geom)', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const lowerArm = model.root.children[0].children[0];
    const hand = lowerArm.geoms.find(g => g.name === 'hand');
    expect(hand).toBeDefined();
    // hand has rgba="0 0.5 1 1" — overrides default
    expect(hand!.rgba[0]).toBeCloseTo(0, 3);
    expect(hand!.rgba[1]).toBeCloseTo(0.5, 3);
    expect(hand!.rgba[2]).toBeCloseTo(1.0, 3);
  });
});

// --- Pitfall 1: Half-sizes doubled ---

describe('parseMjcf - Pitfall 1: half-sizes are doubled', () => {
  it('box half-sizes doubled — size "0.5 0.5 0.5" becomes [1, 1, 1]', () => {
    const mjcf = `
      <mujoco model="box_test">
        <worldbody>
          <body name="b">
            <geom name="box1" type="box" size="0.5 0.5 0.5" rgba="1 0 0 1"/>
          </body>
        </worldbody>
      </mujoco>
    `;
    const model = parseMjcf(mjcf);
    const geom = model.root.children[0].geoms[0];
    expect(geom.size).toEqual([1, 1, 1]);
  });

  it('cylinder half-length doubled — size "0.05 0.3" becomes [0.05, 0.6] (radius unchanged)', () => {
    const mjcf = `
      <mujoco model="cyl_test">
        <worldbody>
          <body name="b">
            <geom name="cyl1" type="cylinder" size="0.05 0.3" rgba="1 0 0 1"/>
          </body>
        </worldbody>
      </mujoco>
    `;
    const model = parseMjcf(mjcf);
    const geom = model.root.children[0].geoms[0];
    expect(geom.size[0]).toBeCloseTo(0.05, 5);  // radius unchanged
    expect(geom.size[1]).toBeCloseTo(0.6, 5);   // half-length doubled
  });

  it('capsule half-length doubled — lower_geom size "0.04 0.2" becomes [0.04, 0.4]', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const lowerArm = model.root.children[0].children[0];
    const lowerGeom = lowerArm.geoms.find(g => g.name === 'lower_geom');
    expect(lowerGeom).toBeDefined();
    expect(lowerGeom!.size[0]).toBeCloseTo(0.04, 5);  // radius unchanged
    expect(lowerGeom!.size[1]).toBeCloseTo(0.4, 5);   // 0.2 * 2 = 0.4
  });

  it('sphere size unchanged — size "0.06" stays [0.06]', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const lowerArm = model.root.children[0].children[0];
    const hand = lowerArm.geoms.find(g => g.name === 'hand');
    expect(hand).toBeDefined();
    expect(hand!.type).toBe('sphere');
    expect(hand!.size[0]).toBeCloseTo(0.06, 5);  // NOT doubled
  });
});

// --- Pitfall 2: Quaternion reorder ---

describe('parseMjcf - Pitfall 2: quaternion (w,x,y,z) reordered to (x,y,z,w)', () => {
  it('identity quat "1 0 0 0" in MJCF becomes [0, 0, 0, 1] in RobotModel', () => {
    const model = parseMjcf(QUAT_TEST_MJCF);
    const b1 = model.root.children[0];
    // MJCF: quat="1 0 0 0" means w=1, x=0, y=0, z=0 (identity)
    // Three.js: (x,y,z,w) = [0, 0, 0, 1]
    expect(b1.pose.quaternion).toEqual([0, 0, 0, 1]);
  });

  it('90-degree rotation around Z: MJCF "0.707 0 0 0.707" -> Three.js [0, 0, 0.707, 0.707]', () => {
    const mjcf = `
      <mujoco model="quat_z90">
        <worldbody>
          <body name="b" quat="0.707 0 0 0.707">
            <geom type="sphere" size="0.1"/>
          </body>
        </worldbody>
      </mujoco>
    `;
    const model = parseMjcf(mjcf);
    const b = model.root.children[0];
    // MJCF w=0.707, x=0, y=0, z=0.707 -> Three.js x=0, y=0, z=0.707, w=0.707
    expect(b.pose.quaternion[0]).toBeCloseTo(0, 3);    // x
    expect(b.pose.quaternion[1]).toBeCloseTo(0, 3);    // y
    expect(b.pose.quaternion[2]).toBeCloseTo(0.707, 3); // z
    expect(b.pose.quaternion[3]).toBeCloseTo(0.707, 3); // w
  });
});

// --- Pitfall 6: fromto geometry ---

describe('parseMjcf - Pitfall 6: fromto geometry derivation', () => {
  it('capsule fromto="0 0 0 0 0 0.5" produces pos=[0, 0, 0.25] and size includes halfLength=0.25', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    const upperArm = model.root.children[0];
    const upperGeom = upperArm.geoms.find(g => g.name === 'upper_geom');
    expect(upperGeom).toBeDefined();
    // fromto="0 0 0 0 0 0.5" → center at [0, 0, 0.25]
    expect(upperGeom!.pos[0]).toBeCloseTo(0, 5);
    expect(upperGeom!.pos[1]).toBeCloseTo(0, 5);
    expect(upperGeom!.pos[2]).toBeCloseTo(0.25, 5);
  });

  it('capsule fromto="0 0 0 0 0 1" produces total length 1.0 (halfLength=0.5 doubled)', () => {
    const mjcf = `
      <mujoco model="fromto_test">
        <worldbody>
          <body name="b">
            <geom name="g1" type="capsule" fromto="0 0 0 0 0 1" size="0.05"/>
          </body>
        </worldbody>
      </mujoco>
    `;
    const model = parseMjcf(mjcf);
    const geom = model.root.children[0].geoms[0];
    // halfLength = 0.5, doubled = 1.0 for full length
    expect(geom.size[0]).toBeCloseTo(0.05, 5);  // radius
    expect(geom.size[1]).toBeCloseTo(1.0, 5);   // full length (doubled halfLength)
  });

  it('fromto orientation — vertical capsule has identity-like quaternion', () => {
    const mjcf = `
      <mujoco model="fromto_vert">
        <worldbody>
          <body name="b">
            <geom name="g1" type="capsule" fromto="0 0 0 0 0 1" size="0.05"/>
          </body>
        </worldbody>
      </mujoco>
    `;
    const model = parseMjcf(mjcf);
    const geom = model.root.children[0].geoms[0];
    // Direction is (0,0,1) which aligns with Z axis — identity quaternion
    expect(geom.quat[0]).toBeCloseTo(0, 5);  // x
    expect(geom.quat[1]).toBeCloseTo(0, 5);  // y
    expect(geom.quat[2]).toBeCloseTo(0, 5);  // z
    expect(geom.quat[3]).toBeCloseTo(1, 5);  // w
  });
});

// --- Pitfall 3: qpos index map ---

describe('parseMjcf - Pitfall 3: qpos index map', () => {
  it('free(7) + hinge(1) + hinge(1) → offsets [0, 7, 8], totalQpos=9', () => {
    const model = parseMjcf(QPOS_TEST_MJCF);
    expect(model.totalQpos).toBe(9);
    expect(model.qposMap).toHaveLength(3);

    const root = model.qposMap.find(e => e.jointName === 'root');
    const j1 = model.qposMap.find(e => e.jointName === 'j1');
    const j2 = model.qposMap.find(e => e.jointName === 'j2');

    expect(root).toBeDefined();
    expect(root!.qposOffset).toBe(0);
    expect(root!.dof).toBe(7);

    expect(j1).toBeDefined();
    expect(j1!.qposOffset).toBe(7);
    expect(j1!.dof).toBe(1);

    expect(j2).toBeDefined();
    expect(j2!.qposOffset).toBe(8);
    expect(j2!.dof).toBe(1);
  });

  it('jointIndex map contains all joints by name', () => {
    const model = parseMjcf(QPOS_TEST_MJCF);
    expect(model.jointIndex.has('root')).toBe(true);
    expect(model.jointIndex.has('j1')).toBe(true);
    expect(model.jointIndex.has('j2')).toBe(true);
  });

  it('two_link_arm: shoulder(1) + elbow(1) → offsets [0, 1], totalQpos=2', () => {
    const xml = readFileSync(join(FIXTURE_DIR, 'two_link_arm.xml'), 'utf-8');
    const model = parseMjcf(xml);
    expect(model.totalQpos).toBe(2);
    const shoulder = model.qposMap.find(e => e.jointName === 'shoulder');
    const elbow = model.qposMap.find(e => e.jointName === 'elbow');
    expect(shoulder!.qposOffset).toBe(0);
    expect(elbow!.qposOffset).toBe(1);
  });
});

// --- Skipped elements warnings ---

describe('parseMjcf - skipped elements', () => {
  it('model with actuator/tendon/sensor still parses successfully', () => {
    expect(() => parseMjcf(SKIPPED_ELEMENTS_MJCF)).not.toThrow();
    const model = parseMjcf(SKIPPED_ELEMENTS_MJCF);
    expect(model.name).toBe('skip_test');
  });
});
