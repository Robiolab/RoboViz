import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadMesh(
  url: string,
  rgba: [number, number, number, number]
): Promise<THREE.Object3D> {
  const ext = url.split('.').pop()?.toLowerCase() ?? '';
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
    transparent: rgba[3] < 1.0,
    opacity: rgba[3],
    roughness: 0.7,
    metalness: 0.1,
  });

  switch (ext) {
    case 'stl': {
      const loader = new STLLoader();
      const geometry = await loader.loadAsync(url);
      return new THREE.Mesh(geometry, material);
    }
    case 'obj': {
      const loader = new OBJLoader();
      const group = await loader.loadAsync(url);
      group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = material;
        }
      });
      return group;
    }
    case 'dae': {
      const loader = new ColladaLoader();
      const result = await loader.loadAsync(url);
      if (!result) {
        console.warn('[roboviz] ColladaLoader returned null for: ' + url + ', using placeholder sphere');
        return new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), material);
      }
      return result.scene;
    }
    case 'gltf':
    case 'glb': {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      return gltf.scene;
    }
    default:
      console.warn('[roboviz] Unknown mesh format: ' + ext + ', using placeholder sphere');
      return new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        material
      );
  }
}
