import * as THREE from 'three';
import type { SerializedRobotModel, Joint } from './types.js';

export interface RobotState {
  model: SerializedRobotModel;
  jointGroupMap: Map<string, THREE.Group>;
  restPositions: Map<string, THREE.Vector3>;
}

// Pre-allocated temporaries to avoid GC pressure at 60fps
const _quat = new THREE.Quaternion();
const _axis = new THREE.Vector3();

export function applyJointState(
  data: { qpos?: number[]; joints?: Record<string, number> },
  state: RobotState
): void {
  const { model, jointGroupMap, restPositions } = state;

  if (data.qpos !== undefined) {
    // qpos-indexed path (STRM-03: MuJoCo qpos array)
    for (const entry of model.qposMap) {
      const group = jointGroupMap.get(entry.jointName);
      const joint = model.jointIndex[entry.jointName];
      if (!group || !joint) continue;
      applyJoint(joint, data.qpos, entry.qposOffset, group, restPositions);
    }
  } else if (data.joints !== undefined) {
    // Named path (STRM-04: ROS2/URDF named joints)
    for (const [name, value] of Object.entries(data.joints)) {
      const group = jointGroupMap.get(name);
      const joint = model.jointIndex[name];
      if (!group || !joint) continue;
      applyJoint(joint, [value], 0, group, restPositions);
    }
  }
}

function applyJoint(
  joint: Joint,
  qpos: number[],
  offset: number,
  group: THREE.Group,
  restPositions: Map<string, THREE.Vector3>
): void {
  _axis.set(joint.axis[0], joint.axis[1], joint.axis[2]);

  switch (joint.type) {
    case 'hinge': {
      // STRM-05: hinge/revolute rotation around axis
      const angle = qpos[offset];
      _quat.setFromAxisAngle(_axis, angle);
      group.quaternion.copy(_quat);
      break;
    }
    case 'slide': {
      // STRM-06: slide/prismatic translation along axis from rest position
      const dist = qpos[offset];
      const rest = restPositions.get(joint.name);
      if (rest) {
        group.position.copy(rest).addScaledVector(_axis, dist);
      }
      break;
    }
    case 'ball': {
      // STRM-07: ball joint quaternion (4 DOF from qpos)
      // MuJoCo data.qpos stores ball as (w,x,y,z) — convert to Three.js (x,y,z,w)
      _quat.set(qpos[offset + 1], qpos[offset + 2], qpos[offset + 3], qpos[offset]);
      group.quaternion.copy(_quat);
      break;
    }
    case 'free': {
      // STRM-08: free/floating joint: 7 DOF — position(3) + quaternion(4)
      // MuJoCo data.qpos stores free as (x,y,z, w,qx,qy,qz) — convert quat to Three.js (x,y,z,w)
      group.position.set(qpos[offset], qpos[offset + 1], qpos[offset + 2]);
      _quat.set(qpos[offset + 4], qpos[offset + 5], qpos[offset + 6], qpos[offset + 3]);
      group.quaternion.copy(_quat);
      break;
    }
    case 'fixed':
      break; // no-op
  }
}
