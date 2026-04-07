import { describe, it, expect } from 'vitest';
import { detectFormat, parseRobotFile } from '../src/parser/detect.js';

// Sample XML strings for testing
const MJCF_XML = `<mujoco model="test_robot">
  <worldbody>
    <body name="link1">
      <joint name="j1" type="hinge"/>
      <geom type="box" size="0.1 0.1 0.1"/>
    </body>
  </worldbody>
</mujoco>`;

const URDF_XML = `<?xml version="1.0"?>
<robot name="test_robot">
  <link name="base_link"/>
  <link name="link1">
    <visual>
      <geometry><box size="0.1 0.1 0.1"/></geometry>
    </visual>
  </link>
  <joint name="j1" type="revolute">
    <parent link="base_link"/>
    <child link="link1"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.57" upper="1.57" effort="10" velocity="1"/>
  </joint>
</robot>`;

const SDF_XML = `<sdf version="1.6">
  <model name="test">
    <link name="link1"/>
  </model>
</sdf>`;

const EMPTY_XML = ``;

describe('detectFormat', () => {
  it('returns "mjcf" for XML with <mujoco> root', () => {
    expect(detectFormat(MJCF_XML)).toBe('mjcf');
  });

  it('returns "urdf" for XML with <robot> root', () => {
    expect(detectFormat(URDF_XML)).toBe('urdf');
  });

  it('throws Error with "Unknown robot description format" for <sdf> root', () => {
    expect(() => detectFormat(SDF_XML)).toThrow('Unknown robot description format');
  });

  it('throws for unknown root element', () => {
    const xml = '<something><child/></something>';
    expect(() => detectFormat(xml)).toThrow('Unknown robot description format');
  });

  it('throws for empty/invalid XML', () => {
    expect(() => detectFormat(EMPTY_XML)).toThrow();
  });
});

describe('parseRobotFile', () => {
  it('returns RobotModel with format "mjcf" for MJCF content', () => {
    const model = parseRobotFile(MJCF_XML);
    expect(model.format).toBe('mjcf');
    expect(model.name).toBe('test_robot');
  });

  it('returns RobotModel with format "urdf" for URDF content', () => {
    const model = parseRobotFile(URDF_XML);
    expect(model.format).toBe('urdf');
    expect(model.name).toBe('test_robot');
  });

  it('returned model has required fields', () => {
    const model = parseRobotFile(MJCF_XML);
    expect(model).toHaveProperty('root');
    expect(model).toHaveProperty('joints');
    expect(model).toHaveProperty('jointIndex');
    expect(model).toHaveProperty('qposMap');
    expect(model).toHaveProperty('totalQpos');
  });

  it('throws for unknown format', () => {
    expect(() => parseRobotFile(SDF_XML)).toThrow('Unknown robot description format');
  });
});
