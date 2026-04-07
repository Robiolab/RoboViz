// Client-side copy of RobotModel types.
// Do NOT import from the server package — that creates a circular dev dependency.

export type JointType = 'hinge' | 'slide' | 'ball' | 'free' | 'fixed';
export type GeomType = 'box' | 'sphere' | 'cylinder' | 'capsule' | 'ellipsoid' | 'mesh';

export interface Pose {
  position: [number, number, number];
  quaternion: [number, number, number, number]; // (x,y,z,w) Three.js order
}

export interface Geom {
  type: GeomType;
  name: string;
  pos: [number, number, number];
  quat: [number, number, number, number]; // (x,y,z,w) Three.js order
  size: number[];
  // box: [width, depth, height] (full sizes)
  // sphere: [radius]
  // cylinder: [radius, length] (full length)
  // capsule: [radius, length] (full cylindrical section length)
  // ellipsoid: [rx, ry, rz]
  rgba: [number, number, number, number];
  meshRef?: string;
  meshScale?: [number, number, number];
}

export interface Joint {
  name: string;
  type: JointType;
  axis: [number, number, number];
  range: [number, number] | null;
  qposIndex: number;
  qposDim: number;
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
  dof: number;
}

// Client receives this as plain JSON (Map already converted to object by server)
export interface SerializedRobotModel {
  name: string;
  format: 'mjcf' | 'urdf';
  root: Body;
  joints: Joint[];
  jointIndex: Record<string, Joint>; // plain object, NOT Map
  qposMap: QposEntry[];
  totalQpos: number;
}
