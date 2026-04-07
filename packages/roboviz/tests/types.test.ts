import { describe, it, expect } from 'vitest';
import { QPOS_DOF, HALF_SIZE_GEOM_TYPES } from '../src/parser/types.js';

describe('QPOS_DOF', () => {
  it('free joint has 7 DOF', () => { expect(QPOS_DOF.free).toBe(7); });
  it('ball joint has 4 DOF', () => { expect(QPOS_DOF.ball).toBe(4); });
  it('hinge joint has 1 DOF', () => { expect(QPOS_DOF.hinge).toBe(1); });
  it('slide joint has 1 DOF', () => { expect(QPOS_DOF.slide).toBe(1); });
  it('fixed joint has 0 DOF', () => { expect(QPOS_DOF.fixed).toBe(0); });
});

describe('HALF_SIZE_GEOM_TYPES', () => {
  it('includes box, cylinder, capsule', () => {
    expect(HALF_SIZE_GEOM_TYPES.has('box')).toBe(true);
    expect(HALF_SIZE_GEOM_TYPES.has('cylinder')).toBe(true);
    expect(HALF_SIZE_GEOM_TYPES.has('capsule')).toBe(true);
  });
  it('does NOT include sphere', () => {
    expect(HALF_SIZE_GEOM_TYPES.has('sphere')).toBe(false);
  });
});
