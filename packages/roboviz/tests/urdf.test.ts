import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUrdf } from '../src/parser/urdf.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper to build minimal URDF string with one joint
function makeUrdf(
  linkXml: string,
  jointXml: string,
  robotName = 'test_robot',
): string {
  return `<?xml version="1.0"?>
<robot name="${robotName}">
  <link name="base"/>
  ${linkXml}
  ${jointXml}
</robot>`;
}

// -------------------------------------------------------------------------
// Fixture tests: two_link_arm.urdf
// -------------------------------------------------------------------------

describe('parseUrdf — two_link_arm fixture', () => {
  const fixturePath = join(__dirname, 'fixtures', 'two_link_arm.urdf');
  const xml = readFileSync(fixturePath, 'utf-8');
  const model = parseUrdf(xml);

  it('returns RobotModel with name from robot element', () => {
    expect(model.name).toBe('two_link_arm');
  });

  it('format field is urdf', () => {
    expect(model.format).toBe('urdf');
  });

  it('root body is world link', () => {
    expect(model.root.name).toBe('world');
  });

  it('upper_arm is a child of root (world)', () => {
    const upperArm = model.root.children.find((c) => c.name === 'upper_arm');
    expect(upperArm).toBeDefined();
  });

  it('lower_arm is a child of upper_arm', () => {
    const upperArm = model.root.children.find((c) => c.name === 'upper_arm')!;
    const lowerArm = upperArm.children.find((c) => c.name === 'lower_arm');
    expect(lowerArm).toBeDefined();
  });

  it('hand is a child of lower_arm', () => {
    const upperArm = model.root.children.find((c) => c.name === 'upper_arm')!;
    const lowerArm = upperArm.children.find((c) => c.name === 'lower_arm')!;
    const hand = lowerArm.children.find((c) => c.name === 'hand');
    expect(hand).toBeDefined();
  });

  it('shoulder joint: type=hinge', () => {
    const shoulder = model.jointIndex.get('shoulder');
    expect(shoulder).toBeDefined();
    expect(shoulder!.type).toBe('hinge');
  });

  it('shoulder joint: axis [0,1,0]', () => {
    const shoulder = model.jointIndex.get('shoulder')!;
    expect(shoulder.axis).toEqual([0, 1, 0]);
  });

  it('shoulder joint: range close to [-1.5708, 1.5708]', () => {
    const shoulder = model.jointIndex.get('shoulder')!;
    expect(shoulder.range).not.toBeNull();
    expect(shoulder.range![0]).toBeCloseTo(-1.5708, 3);
    expect(shoulder.range![1]).toBeCloseTo(1.5708, 3);
  });

  it('elbow joint: type=hinge, range close to [-2.0944, 0]', () => {
    const elbow = model.jointIndex.get('elbow')!;
    expect(elbow.type).toBe('hinge');
    expect(elbow.range).not.toBeNull();
    expect(elbow.range![0]).toBeCloseTo(-2.0944, 3);
    expect(elbow.range![1]).toBeCloseTo(0, 3);
  });

  it('wrist joint: type=fixed, qposDim=0', () => {
    const wrist = model.jointIndex.get('wrist')!;
    expect(wrist.type).toBe('fixed');
    expect(wrist.qposDim).toBe(0);
  });

  it('upper_arm body pose position is [0,0,1] (from joint origin)', () => {
    const upperArm = model.root.children.find((c) => c.name === 'upper_arm')!;
    expect(upperArm.pose.position[0]).toBeCloseTo(0, 5);
    expect(upperArm.pose.position[1]).toBeCloseTo(0, 5);
    expect(upperArm.pose.position[2]).toBeCloseTo(1, 5);
  });

  it('upper_arm visual geom pos is [0,0,0.25] (from visual origin, separate from joint)', () => {
    const upperArm = model.root.children.find((c) => c.name === 'upper_arm')!;
    const geom = upperArm.geoms[0];
    expect(geom).toBeDefined();
    expect(geom.pos[0]).toBeCloseTo(0, 5);
    expect(geom.pos[1]).toBeCloseTo(0, 5);
    expect(geom.pos[2]).toBeCloseTo(0.25, 5);
  });

  it('upper_arm visual geom is cylinder with correct size', () => {
    const upperArm = model.root.children.find((c) => c.name === 'upper_arm')!;
    const geom = upperArm.geoms[0];
    expect(geom.type).toBe('cylinder');
    // radius=0.04, length=0.5
    expect(geom.size[0]).toBeCloseTo(0.04, 5);
    expect(geom.size[1]).toBeCloseTo(0.5, 5);
  });

  it('flat joints list has 3 joints', () => {
    expect(model.joints.length).toBe(3);
  });

  it('qpos map has entries for revolute joints only (fixed joints excluded)', () => {
    const nonZero = model.qposMap.filter((e) => e.dof > 0);
    expect(nonZero.length).toBe(2); // shoulder and elbow
  });

  it('totalQpos is 2 (shoulder + elbow each contribute 1)', () => {
    expect(model.totalQpos).toBe(2);
  });
});

// -------------------------------------------------------------------------
// Joint type tests: inline URDF strings
// -------------------------------------------------------------------------

describe('parseUrdf — joint types', () => {
  it('continuous joint maps to hinge with range=null', () => {
    const xml = makeUrdf(
      '<link name="child"/>',
      `<joint name="spin" type="continuous">
        <parent link="base"/>
        <child link="child"/>
        <axis xyz="0 0 1"/>
      </joint>`,
    );
    const model = parseUrdf(xml);
    const joint = model.jointIndex.get('spin')!;
    expect(joint.type).toBe('hinge');
    expect(joint.range).toBeNull();
  });

  it('prismatic joint maps to slide', () => {
    const xml = makeUrdf(
      '<link name="slider"/>',
      `<joint name="linear" type="prismatic">
        <parent link="base"/>
        <child link="slider"/>
        <axis xyz="1 0 0"/>
        <limit lower="-0.5" upper="0.5" effort="10" velocity="1"/>
      </joint>`,
    );
    const model = parseUrdf(xml);
    const joint = model.jointIndex.get('linear')!;
    expect(joint.type).toBe('slide');
    expect(joint.range).toEqual([-0.5, 0.5]);
    expect(joint.qposDim).toBe(1);
  });

  it('floating joint maps to free with qposDim=7', () => {
    const xml = makeUrdf(
      '<link name="floating_link"/>',
      `<joint name="body_joint" type="floating">
        <parent link="base"/>
        <child link="floating_link"/>
      </joint>`,
    );
    const model = parseUrdf(xml);
    const joint = model.jointIndex.get('body_joint')!;
    expect(joint.type).toBe('free');
    expect(joint.qposDim).toBe(7);
  });

  it('planar joint logs warning and is skipped', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const xml = makeUrdf(
      '<link name="plane_link"/>',
      `<joint name="plane_joint" type="planar">
        <parent link="base"/>
        <child link="plane_link"/>
      </joint>`,
    );
    const model = parseUrdf(xml);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('planar'));
    // The planar joint is skipped — plane_link may be absent or a childless body
    expect(model.jointIndex.has('plane_joint')).toBe(false);
    warnSpy.mockRestore();
  });

  it('fixed joint has type=fixed and qposDim=0', () => {
    const xml = makeUrdf(
      '<link name="fixed_link"/>',
      `<joint name="fixed_joint" type="fixed">
        <parent link="base"/>
        <child link="fixed_link"/>
        <origin xyz="0 0 0.1" rpy="0 0 0"/>
      </joint>`,
    );
    const model = parseUrdf(xml);
    const joint = model.jointIndex.get('fixed_joint')!;
    expect(joint.type).toBe('fixed');
    expect(joint.qposDim).toBe(0);
  });
});

// -------------------------------------------------------------------------
// Mesh path resolution tests
// -------------------------------------------------------------------------

describe('parseUrdf — mesh path resolution', () => {
  function meshUrdf(filename: string, scale?: string): string {
    const scaleAttr = scale ? ` scale="${scale}"` : '';
    return `<?xml version="1.0"?>
<robot name="mesh_bot">
  <link name="base"/>
  <link name="mesh_link">
    <visual>
      <geometry>
        <mesh filename="${filename}"${scaleAttr}/>
      </geometry>
    </visual>
  </link>
  <joint name="j1" type="fixed">
    <parent link="base"/>
    <child link="mesh_link"/>
  </joint>
</robot>`;
  }

  it('package:// prefix is stripped and joined with meshDir', () => {
    const xml = meshUrdf('package://robot_desc/meshes/link.stl');
    const model = parseUrdf(xml, { meshDir: '/opt/ros' });
    const geom = model.root.children[0].geoms[0];
    expect(geom.meshRef).toBe('/opt/ros/robot_desc/meshes/link.stl');
  });

  it('relative mesh path without package:// is returned as-is', () => {
    const xml = meshUrdf('meshes/link.stl');
    const model = parseUrdf(xml);
    const geom = model.root.children[0].geoms[0];
    expect(geom.meshRef).toBe('meshes/link.stl');
  });

  it('mesh scale is parsed correctly', () => {
    const xml = meshUrdf('package://robot_desc/meshes/link.stl', '0.001 0.001 0.001');
    const model = parseUrdf(xml, { meshDir: '/opt/ros' });
    const geom = model.root.children[0].geoms[0];
    expect(geom.meshScale).toEqual([0.001, 0.001, 0.001]);
  });

  it('mesh without scale has undefined meshScale', () => {
    const xml = meshUrdf('package://robot_desc/meshes/link.stl');
    const model = parseUrdf(xml, { meshDir: '/opt/ros' });
    const geom = model.root.children[0].geoms[0];
    expect(geom.meshScale).toBeUndefined();
  });

  it('package:// without meshDir logs warning and strips prefix only', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const xml = meshUrdf('package://robot_desc/meshes/link.stl');
    const model = parseUrdf(xml);
    expect(warnSpy).toHaveBeenCalled();
    const geom = model.root.children[0].geoms[0];
    // Should strip "package://" and return what remains
    expect(geom.meshRef).toBe('robot_desc/meshes/link.stl');
    warnSpy.mockRestore();
  });
});

// -------------------------------------------------------------------------
// qpos map tests: correct offsets accumulated for mixed joint types
// -------------------------------------------------------------------------

describe('parseUrdf — qpos map', () => {
  it('qpos offsets accumulate correctly for mixed joint types', () => {
    const xml = `<?xml version="1.0"?>
<robot name="qpos_test">
  <link name="base"/>
  <link name="link1"/>
  <link name="link2"/>
  <link name="link3"/>

  <joint name="revolute_j" type="revolute">
    <parent link="base"/>
    <child link="link1"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="10" velocity="1"/>
  </joint>

  <joint name="fixed_j" type="fixed">
    <parent link="link1"/>
    <child link="link2"/>
  </joint>

  <joint name="floating_j" type="floating">
    <parent link="link2"/>
    <child link="link3"/>
  </joint>
</robot>`;

    const model = parseUrdf(xml);

    const revolute = model.qposMap.find((e) => e.jointName === 'revolute_j')!;
    const fixed = model.qposMap.find((e) => e.jointName === 'fixed_j')!;
    const floating = model.qposMap.find((e) => e.jointName === 'floating_j')!;

    expect(revolute).toBeDefined();
    expect(revolute.qposOffset).toBe(0);
    expect(revolute.dof).toBe(1);

    expect(fixed).toBeDefined();
    expect(fixed.dof).toBe(0);
    // fixed joint offset is after revolute
    expect(fixed.qposOffset).toBe(1);

    expect(floating).toBeDefined();
    expect(floating.dof).toBe(7);
    // floating joint offset is after revolute (1) + fixed (0) = 1
    expect(floating.qposOffset).toBe(1);

    expect(model.totalQpos).toBe(8); // 1 + 0 + 7
  });
});
