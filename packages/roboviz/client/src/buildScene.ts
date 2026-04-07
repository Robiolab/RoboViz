import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Body, Geom, SerializedRobotModel } from './types.js';
import { loadMesh } from './meshLoader.js';

export interface SceneResult {
  robotGroup: THREE.Group;
  jointGroupMap: Map<string, THREE.Group>;
  restPositions: Map<string, THREE.Vector3>;
}

function buildGeometry(geom: Geom): THREE.BufferGeometry {
  switch (geom.type) {
    case 'box':
      return new THREE.BoxGeometry(geom.size[0], geom.size[1], geom.size[2]);
    case 'sphere':
      return new THREE.SphereGeometry(geom.size[0], 32, 16);
    case 'cylinder':
      // radiusTop = radiusBottom = size[0], height = size[1]
      return new THREE.CylinderGeometry(geom.size[0], geom.size[0], geom.size[1], 32);
    case 'capsule':
      // radius = size[0], length = size[1] (cylindrical section only)
      return new THREE.CapsuleGeometry(geom.size[0], geom.size[1], 8, 16);
    case 'ellipsoid':
      // Unit sphere — scale applied on mesh
      return new THREE.SphereGeometry(1, 32, 16);
    default:
      // mesh/unknown — small placeholder sphere
      return new THREE.SphereGeometry(0.05, 8, 8);
  }
}

function buildMaterial(geom: Geom): THREE.MeshStandardMaterial {
  const [r, g, b, a] = geom.rgba;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(r, g, b),
    transparent: a < 1.0,
    opacity: a,
    roughness: 0.7,
    metalness: 0.1,
  });
}

function addGeomToGroup(geom: Geom, group: THREE.Group, meshPromises: Promise<void>[]): void {
  // Mesh geoms: async load via meshLoader, place in container group immediately
  if (geom.type === 'mesh' && geom.meshRef) {
    const container = new THREE.Group();
    container.position.set(geom.pos[0], geom.pos[1], geom.pos[2]);
    container.quaternion.set(geom.quat[0], geom.quat[1], geom.quat[2], geom.quat[3]);
    if (geom.meshScale) {
      container.scale.set(geom.meshScale[0], geom.meshScale[1], geom.meshScale[2]);
    }
    group.add(container);
    meshPromises.push(
      loadMesh(geom.meshRef, geom.rgba).then((obj) => {
        container.add(obj);
      })
    );
    return;
  }

  const geo = buildGeometry(geom);
  const mat = buildMaterial(geom);
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.set(geom.pos[0], geom.pos[1], geom.pos[2]);
  mesh.quaternion.set(geom.quat[0], geom.quat[1], geom.quat[2], geom.quat[3]);

  if (geom.type === 'ellipsoid') {
    mesh.scale.set(geom.size[0], geom.size[1], geom.size[2]);
  }

  // REND-02: Cylinder and capsule are Y-aligned in Three.js but Z-aligned in MuJoCo.
  // Wrap in a pivot Group that carries the body-space position/quaternion.
  // The inner mesh then applies the rotation.x = PI/2 axis fix independently.
  if (geom.type === 'cylinder' || geom.type === 'capsule') {
    const pivot = new THREE.Group();
    pivot.position.copy(mesh.position);
    pivot.quaternion.copy(mesh.quaternion);
    // Reset mesh to local origin — axis fix is applied in pivot-local space
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.rotation.x = Math.PI / 2;
    pivot.add(mesh);
    group.add(pivot);
    return;
  }

  group.add(mesh);
}

function buildBody(
  body: Body,
  jointGroupMap: Map<string, THREE.Group>,
  restPositions: Map<string, THREE.Vector3>,
  meshPromises: Promise<void>[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = body.name;

  group.position.set(body.pose.position[0], body.pose.position[1], body.pose.position[2]);
  group.quaternion.set(
    body.pose.quaternion[0],
    body.pose.quaternion[1],
    body.pose.quaternion[2],
    body.pose.quaternion[3]
  );

  // Register every joint on this body to point to this body's Group
  for (const joint of body.joints) {
    jointGroupMap.set(joint.name, group);
    restPositions.set(joint.name, group.position.clone());
  }

  // REND-08: Attach CSS2DObject labels for non-fixed joints
  for (const joint of body.joints) {
    if (joint.type === 'fixed') continue;
    const div = document.createElement('div');
    div.className = 'joint-label';
    div.textContent = joint.name;
    div.style.cssText = 'color:#fff;font-size:11px;background:rgba(0,0,0,0.5);padding:2px 4px;border-radius:3px;white-space:nowrap;';
    const label = new CSS2DObject(div);
    label.position.set(0, 0, 0);
    group.add(label);
  }

  for (const geom of body.geoms) {
    addGeomToGroup(geom, group, meshPromises);
  }

  for (const child of body.children) {
    group.add(buildBody(child, jointGroupMap, restPositions, meshPromises));
  }

  return group;
}

export async function buildScene(model: SerializedRobotModel, scene: THREE.Scene): Promise<SceneResult> {
  const jointGroupMap = new Map<string, THREE.Group>();
  const restPositions = new Map<string, THREE.Vector3>();
  const meshPromises: Promise<void>[] = [];
  const robotGroup = buildBody(model.root, jointGroupMap, restPositions, meshPromises);
  scene.add(robotGroup);
  await Promise.all(meshPromises);
  return { robotGroup, jointGroupMap, restPositions };
}
