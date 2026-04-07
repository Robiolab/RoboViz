import * as THREE from 'three';

export function createLighting(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  scene.add(sun);
}

export function createGroundPlane(scene: THREE.Scene): void {
  const grid = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
  scene.add(grid);
}

export function fitCamera(
  camera: THREE.PerspectiveCamera,
  robotGroup: THREE.Group,
  controls: { target: THREE.Vector3; update(): void }
): void {
  const box = new THREE.Box3().setFromObject(robotGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.0;
  controls.target.copy(center);
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist);
  controls.update();
}
