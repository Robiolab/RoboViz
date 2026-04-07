import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRobotFile } from '../src/parser/detect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const twoLinkArmXml = fs.readFileSync(
  path.join(__dirname, 'fixtures/two_link_arm.xml'),
  'utf-8'
);
const twoLinkArmUrdf = fs.readFileSync(
  path.join(__dirname, 'fixtures/two_link_arm.urdf'),
  'utf-8'
);
const humanoidXml = fs.readFileSync(
  path.join(__dirname, 'fixtures/humanoid.xml'),
  'utf-8'
);
const frankaUrdf = fs.readFileSync(
  path.join(__dirname, 'fixtures/franka_panda.urdf'),
  'utf-8'
);

describe('Full pipeline integration', () => {
  describe('two_link_arm MJCF', () => {
    it('parses to RobotModel with name "two_link_arm" and format "mjcf"', () => {
      const model = parseRobotFile(twoLinkArmXml);
      expect(model.name).toBe('two_link_arm');
      expect(model.format).toBe('mjcf');
    });

    it('has totalQpos == 2 (shoulder hinge + elbow hinge)', () => {
      const model = parseRobotFile(twoLinkArmXml);
      expect(model.totalQpos).toBe(2);
    });

    it('has joint named "shoulder"', () => {
      const model = parseRobotFile(twoLinkArmXml);
      expect(model.jointIndex.has('shoulder')).toBe(true);
    });

    it('has joint named "elbow"', () => {
      const model = parseRobotFile(twoLinkArmXml);
      expect(model.jointIndex.has('elbow')).toBe(true);
    });

    it('JSON serialization of model (Map converted) does not throw', () => {
      const model = parseRobotFile(twoLinkArmXml);
      expect(() =>
        JSON.stringify({
          ...model,
          jointIndex: Object.fromEntries(model.jointIndex),
        })
      ).not.toThrow();
    });
  });

  describe('two_link_arm URDF', () => {
    it('parses to RobotModel with name "two_link_arm" and format "urdf"', () => {
      const model = parseRobotFile(twoLinkArmUrdf);
      expect(model.name).toBe('two_link_arm');
      expect(model.format).toBe('urdf');
    });

    it('has totalQpos == 2 (shoulder revolute + elbow revolute; wrist fixed=0)', () => {
      const model = parseRobotFile(twoLinkArmUrdf);
      expect(model.totalQpos).toBe(2);
    });

    it('has joint named "shoulder"', () => {
      const model = parseRobotFile(twoLinkArmUrdf);
      expect(model.jointIndex.has('shoulder')).toBe(true);
    });

    it('has joint named "elbow"', () => {
      const model = parseRobotFile(twoLinkArmUrdf);
      expect(model.jointIndex.has('elbow')).toBe(true);
    });

    it('JSON serialization of model (Map converted) does not throw', () => {
      const model = parseRobotFile(twoLinkArmUrdf);
      expect(() =>
        JSON.stringify({
          ...model,
          jointIndex: Object.fromEntries(model.jointIndex),
        })
      ).not.toThrow();
    });
  });

  describe('Humanoid MJCF integration (D-19, D-21)', () => {
    it('parses to RobotModel with format "mjcf"', () => {
      const model = parseRobotFile(humanoidXml);
      expect(model.format).toBe('mjcf');
    });

    it('has name "humanoid" from <mujoco model="humanoid">', () => {
      const model = parseRobotFile(humanoidXml);
      expect(model.name).toBe('humanoid');
    });

    it('has at least 10 joints', () => {
      const model = parseRobotFile(humanoidXml);
      expect(model.joints.length).toBeGreaterThanOrEqual(10);
    });

    it('root joint is free type with qposOffset=0 and dof=7 (D-21)', () => {
      const model = parseRobotFile(humanoidXml);
      const rootEntry = model.qposMap.find(e => e.jointName === 'root');
      expect(rootEntry).toBeDefined();
      expect(rootEntry?.qposOffset).toBe(0);
      expect(rootEntry?.dof).toBe(7);
    });

    it('root joint qposMap entry comes first (document order, D-21)', () => {
      const model = parseRobotFile(humanoidXml);
      expect(model.qposMap[0]?.jointName).toBe('root');
    });

    it('abdomen_y is hinge joint at qposOffset=7 dof=1 (D-21)', () => {
      const model = parseRobotFile(humanoidXml);
      const abdomenEntry = model.qposMap.find(e => e.jointName === 'abdomen_y');
      expect(abdomenEntry).toBeDefined();
      expect(abdomenEntry?.qposOffset).toBe(7);
      expect(abdomenEntry?.dof).toBe(1);
    });

    it('has joint named "abdomen_y"', () => {
      const model = parseRobotFile(humanoidXml);
      expect(model.jointIndex.has('abdomen_y')).toBe(true);
      expect(model.jointIndex.get('abdomen_y')?.type).toBe('hinge');
    });

    it('totalQpos matches sum of all joint DOFs', () => {
      const model = parseRobotFile(humanoidXml);
      const sumDofs = model.qposMap.reduce((sum, e) => sum + e.dof, 0);
      expect(model.totalQpos).toBe(sumDofs);
    });

    it('qposMap is ordered by document order (offsets are monotonically increasing)', () => {
      const model = parseRobotFile(humanoidXml);
      for (let i = 1; i < model.qposMap.length; i++) {
        expect(model.qposMap[i].qposOffset).toBeGreaterThan(model.qposMap[i - 1].qposOffset);
      }
    });
  });

  describe('Franka Panda URDF integration (D-20)', () => {
    it('parses to RobotModel with format "urdf"', () => {
      const model = parseRobotFile(frankaUrdf);
      expect(model.format).toBe('urdf');
    });

    it('has name "panda"', () => {
      const model = parseRobotFile(frankaUrdf);
      expect(model.name).toBe('panda');
    });

    it('has at least 7 joints of type "hinge" (the 7 revolute arm joints)', () => {
      const model = parseRobotFile(frankaUrdf);
      const hingeJoints = model.joints.filter(j => j.type === 'hinge');
      expect(hingeJoints.length).toBeGreaterThanOrEqual(7);
    });

    it('contains panda_joint1 through panda_joint7', () => {
      const model = parseRobotFile(frankaUrdf);
      for (let i = 1; i <= 7; i++) {
        expect(model.jointIndex.has(`panda_joint${i}`)).toBe(true);
      }
    });

    it('has totalQpos == 9 (7 revolute + 2 prismatic finger joints)', () => {
      const model = parseRobotFile(frankaUrdf);
      expect(model.totalQpos).toBe(9);
    });

    it('geoms include mesh references with non-empty path (package:// stripped)', () => {
      const model = parseRobotFile(frankaUrdf);
      // Collect all geoms recursively
      function collectGeoms(body: typeof model.root): typeof model.root.geoms {
        return [...body.geoms, ...body.children.flatMap(c => collectGeoms(c))];
      }
      const allGeoms = collectGeoms(model.root);
      const meshGeoms = allGeoms.filter(g => g.type === 'mesh' && g.meshRef !== undefined);
      expect(meshGeoms.length).toBeGreaterThan(0);
      // package:// prefix should be stripped
      for (const g of meshGeoms) {
        expect(g.meshRef).not.toMatch(/^package:\/\//);
        expect(g.meshRef!.length).toBeGreaterThan(0);
      }
    });
  });
});
