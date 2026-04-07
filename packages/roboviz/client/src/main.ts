import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { io } from 'socket.io-client';
import { buildScene } from './buildScene.js';
import { createLighting, createGroundPlane, fitCamera } from './sceneHelpers.js';
import { applyJointState } from './applyJointState.js';
import { createHUD, createConnectionStatus } from './hud.js';
import type { RobotState } from './applyJointState.js';
import type { SerializedRobotModel } from './types.js';

// Declare global for static build mode
declare global {
  interface Window {
    __ROBOVIZ_MODEL__?: SerializedRobotModel;
  }
}

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 1000);
camera.position.set(2, 2, 4);

// WebGL Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// CSS2DRenderer for joint labels (REND-08)
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0px';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Scene helpers
createLighting(scene);
createGroundPlane(scene);

// HUD overlays (REND-09, REND-10)
const hud = createHUD();
const setConnectionStatus = createConnectionStatus();

// --- STRM-09: Latest-state buffer ---
// Socket event handler ONLY writes to this variable.
// The rAF animate() callback reads and applies it once per frame.
// This decouples the Python simulation rate (up to 500Hz) from browser render rate (60Hz).
let latestJointState: { qpos?: number[]; joints?: Record<string, number> } | null = null;
let robotState: RobotState | null = null;

// --- Static build vs live mode ---
const isStaticBuild = import.meta.env.VITE_STATIC_BUILD === 'true';

if (isStaticBuild && window.__ROBOVIZ_MODEL__) {
  // Static build: load embedded model, no socket connection
  const data = window.__ROBOVIZ_MODEL__;
  buildScene(data, scene).then(({ robotGroup, jointGroupMap, restPositions }) => {
    fitCamera(camera, robotGroup, controls);
    robotState = { model: data, jointGroupMap, restPositions };
  });
  setConnectionStatus('disconnected');
} else {
  // Live mode: connect via Socket.IO
  const socket = io();

  socket.on('init', async (data: SerializedRobotModel) => {
    const { robotGroup, jointGroupMap, restPositions } = await buildScene(data, scene);
    fitCamera(camera, robotGroup, controls);
    robotState = { model: data, jointGroupMap, restPositions };
  });

  // STRM-09: Buffer joint state — NEVER apply Three.js transforms here
  socket.on('joint_state', (data: { qpos?: number[]; joints?: Record<string, number> }) => {
    latestJointState = data;
    hud.recordUpdate();
  });

  // Connection status events (REND-10)
  socket.on('connect', () => setConnectionStatus('connected'));
  socket.on('disconnect', () => setConnectionStatus('disconnected'));
  socket.on('connect_error', () => setConnectionStatus('reconnecting'));
}

// Resize handler — update both renderers
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
let lastTime = performance.now();

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;

  controls.update();

  // STRM-09: Apply latest joint state once per frame, then clear buffer
  if (latestJointState !== null && robotState !== null) {
    applyJointState(latestJointState, robotState);
    latestJointState = null;
  }

  // REND-09: Update FPS display
  hud.updateFPS(dt);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
