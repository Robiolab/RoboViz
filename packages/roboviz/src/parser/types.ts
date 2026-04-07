// Joint types supported by both MJCF and URDF
export type JointType = 'hinge' | 'slide' | 'ball' | 'free' | 'fixed';

// Geom/visual primitive types
export type GeomType = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'ellipsoid' | 'mesh';

// DOF per joint type for qpos indexing (per D-09)
export const QPOS_DOF: Record<JointType, number> = {
  free: 7,
  ball: 4,
  hinge: 1,
  slide: 1,
  fixed: 0,
};

// Geom types where MJCF stores half-sizes (per D-07)
// box: all 3 values are half-extents
// cylinder: size[1] is half-length (size[0] is radius, unchanged)
// capsule: size[1] is half-length of cylindrical section (size[0] is radius, unchanged)
// sphere: size[0] is radius — NOT a half-size, no conversion needed
export const HALF_SIZE_GEOM_TYPES = new Set<GeomType>(['box', 'cylinder', 'capsule']);

export interface Pose {
  position: [number, number, number];
  quaternion: [number, number, number, number]; // (x,y,z,w) Three.js order
}

export interface Geom {
  type: GeomType;
  name: string;
  pos: [number, number, number];       // relative to parent body
  quat: [number, number, number, number]; // (x,y,z,w) Three.js order
  size: number[];
  // box: [width, depth, height] (full sizes)
  // sphere: [radius]
  // cylinder: [radius, length] (full length)
  // capsule: [radius, length] (full cylindrical section length)
  // ellipsoid: [rx, ry, rz]
  rgba: [number, number, number, number];
  meshRef?: string;   // mesh type only — file path
  meshScale?: [number, number, number]; // mesh type only
}

export interface Joint {
  name: string;
  type: JointType;
  axis: [number, number, number];     // unit vector, default [0,0,1]
  range: [number, number] | null;     // radians; null for continuous/free/ball/fixed
  qposIndex: number;                  // offset into qpos array
  qposDim: number;                    // number of qpos values this joint uses
}

export interface Body {
  name: string;
  pose: Pose;
  geoms: Geom[];
  joints: Joint[];
  children: Body[];
}

export interface QposEntry {
  jointName: string;
  qposOffset: number;
  dof: number;   // 0 | 1 | 4 | 7
}

export interface RobotModel {
  name: string;
  format: 'mjcf' | 'urdf';
  root: Body;
  joints: Joint[];                     // flat list of all joints (for iteration)
  jointIndex: Map<string, Joint>;      // named lookup
  qposMap: QposEntry[];                // indexed lookup for qpos array
  totalQpos: number;                   // total size of qpos array
}
