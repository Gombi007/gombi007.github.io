import * as THREE from 'three';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { Reflector } from './vendor/objects/Reflector.js';
import { canStand, move } from './movement.js';

const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const viewport = byId('viewport');
const play = byId('play');
const lighting = byId('lighting');
const showOverview = byId('overview');
const pause = byId('pause');
const restart = byId('restart');
const joystick = byId('joystick');
const touch = matchMedia('(pointer: coarse)');
const moveKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

async function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    throw new Error('This browser needs WebGL 2 to load the interactive room.');
  }

  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '3D room view. Use WASD or the arrow keys to walk during play.');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  viewport.append(canvas);
  canvas.hidden = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2d3cc);
  const cutaway = new THREE.PerspectiveCamera(36, 1, 0.025, 100);
  const eye = new THREE.PerspectiveCamera(61, 1, 0.028, 45);
  eye.rotation.order = 'YXZ';
  const spawn = new THREE.Vector3(1.45, 1.56, 0.40);
  const overviewDirection = new THREE.Vector3(-6.33, 2.46, 0.37).normalize();
  const orbit = new OrbitControls(cutaway, canvas);
  orbit.target.set(1.45, 1.02, 2.05);
  orbit.enableDamping = true;
  orbit.enablePan = false;
  orbit.minDistance = 2.9;
  orbit.maxDistance = 22;
  orbit.minPolarAngle = 0.16;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.enabled = false;

  const hemisphere = new THREE.HemisphereLight(0xf0f6ff, 0x87755e, 1.9);
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.35);
  sun.position.set(-1.15, 6.1, 1.1);
  sun.target.position.set(1.45, 0, 2.05);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -3.6, right: 3.6, bottom: -3.6, top: 3.6, far: 16 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(touch.matches ? 1024 : 2048, touch.matches ? 1024 : 2048);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.013;
  const windowLight = new THREE.PointLight(0xd8ecff, 9.5, 7, 2);
  windowLight.position.set(1.67, 1.91, 3.86);
  scene.add(hemisphere, sun, sun.target, windowLight);

  const { scene: model } = await new GLTFLoader().loadAsync(
    new URL('./assets/room.glb', import.meta.url).href,
  );
  scene.add(model);
  model.updateMatrixWorld(true);
  let floor;
  model.traverse((object) => {
    if (object.userData.roomRole === 'floor') floor = object;
  });
  if (!floor) throw new Error('The room export could not locate its floor.');
  const bounds = new THREE.Box3().setFromObject(floor);
  const obstacles = [];
  const enclosure = [];
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe1eef6, roughness: 0.12, opacity: 0.14, transparent: true,
    depthWrite: false, metalness: 0,
  });
  let mirrorMesh;
  model.traverse((object) => {
    const role = object.userData.roomRole;
    if (role === 'collision') obstacles.push(new THREE.Box3().setFromObject(object));
    if (role === 'enclosure') enclosure.push(object);
    if (!object.isMesh) return;
    object.castShadow = object !== floor && role !== 'glass' && role !== 'mirror';
    object.receiveShadow = role !== 'glass';
    if (role === 'glass') object.material = glass;
    if (role === 'mirror') mirrorMesh = object;
    const maps = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of maps) {
      if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  });
  if (obstacles.length !== 6 || enclosure.length !== 10 ||
      !canStand(spawn.x, spawn.z, bounds, obstacles)) {
    throw new Error('The exported room is missing its walkthrough layout.');
  }
  if (mirrorMesh) {
    const box = new THREE.Box3().setFromObject(mirrorMesh);
    const size = box.getSize(new THREE.Vector3());
    const mirror = new Reflector(new THREE.PlaneGeometry(size.z, size.y), {
      color: 0xafb5bd, textureWidth: touch.matches ? 256 : 512,
      textureHeight: touch.matches ? 512 : 768, clipBias: 0.0001, multisample: 0,
    });
    mirror.position.copy(box.getCenter(new THREE.Vector3()));
    mirror.position.x = box.min.x - 0.003;
    mirror.rotateY(-Math.PI / 2);
    mirrorMesh.visible = false;
    scene.add(mirror);
  }

  let mode = 'overview';
  let evening = false;
  let dirty = true;
  let locked = false;
  let previousTime;
  let lookPointer = null;
  let stickPointer = null;
  let stickSide = 0;
  let stickForward = 0;
  const keys = new Set();

  function fitOverview(recenter) {
    const vertical = Math.tan(THREE.MathUtils.degToRad(cutaway.fov / 2));
    const distance = Math.min(orbit.maxDistance, Math.max(6.9, 2.72 / (vertical * cutaway.aspect)));
    if (recenter) {
      cutaway.position.copy(orbit.target).addScaledVector(overviewDirection, distance);
    } else {
      const delta = cutaway.position.clone().sub(orbit.target);
      if (delta.length() < distance) cutaway.position.copy(orbit.target).add(delta.setLength(distance));
    }
    orbit.update();
    dirty = true;
  }

  function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    cutaway.aspect = eye.aspect = width / height;
    eye.fov = width / height < 1 ? 76 : 61;
    cutaway.updateProjectionMatrix();
    eye.updateProjectionMatrix();
    if (mode === 'overview') fitOverview(false);
    dirty = true;
  }

  function aim(deltaX, deltaY) {
    eye.rotation.y -= deltaX * 0.0025;
    eye.rotation.x = THREE.MathUtils.clamp(eye.rotation.x - deltaY * 0.0025, -1.38, 1.38);
    dirty = true;
  }

  function resetEye() {
    eye.position.copy(spawn);
    eye.rotation.set(-0.075, Math.PI, 0);
    dirty = true;
  }

  function refreshTip() {
    byId('stage-tip').textContent = mode === 'overview'
      ? (touch.matches ? 'Drag to orbit · Pinch to zoom' : 'Drag to orbit · Scroll to zoom')
      : (mode === 'paused' ? 'Walkthrough paused' : touch.matches
        ? 'Drag to look around'
        : locked ? 'Esc to pause' : 'Drag to look around · Esc to pause');
    joystick.hidden = mode !== 'playing' || !touch.matches;
  }

  function clearStick() {
    stickPointer = null;
    stickSide = stickForward = 0;
    byId('joystick-knob').style.translate = '';
  }

  function changeMode(next) {
    mode = next;
    document.body.dataset.mode = mode;
    keys.clear();
    lookPointer = null;
    clearStick();
    const inside = mode !== 'overview';
    const playing = mode === 'playing';
    enclosure.forEach((object) => { object.visible = inside; });
    orbit.enabled = !inside;
    pause.hidden = !playing;
    showOverview.hidden = mode !== 'paused';
    restart.hidden = mode !== 'paused';
    byId('view-label').hidden = inside;
    byId('reticle').hidden = !playing;
    byId('play-label').textContent = mode === 'paused' ? 'Resume' : 'Play';
    byId('intro-copy').textContent = mode === 'paused'
      ? 'Resume your walk or return to the entrance.'
      : 'Take a first-person walk through the furnished room.';
    refreshTip();
    renderer.shadowMap.needsUpdate = true;
    if (mode === 'overview') fitOverview(true);
    dirty = true;
  }

  function start() {
    if (mode === 'overview') resetEye();
    changeMode('playing');
    canvas.focus({ preventScroll: true });
    if (!touch.matches && canvas.requestPointerLock) {
      try {
        canvas.requestPointerLock()?.catch(refreshTip);
      } catch {
        refreshTip();
      }
    }
  }

  function pauseWalk() {
    if (mode !== 'playing') return;
    changeMode('paused');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    play.focus({ preventScroll: true });
  }

  function updateLighting() {
    evening = !evening;
    hemisphere.intensity = evening ? 0.78 : 1.9;
    sun.intensity = evening ? 1.63 : 2.35;
    sun.color.setHex(evening ? 0xffbd80 : 0xfff1dd);
    windowLight.intensity = evening ? 4.5 : 9.5;
    scene.background.setHex(evening ? 0x62636a : 0xd2d3cc);
    renderer.toneMappingExposure = evening ? 0.87 : 1.03;
    lighting.setAttribute('aria-pressed', String(evening));
    byId('lighting-label').textContent = evening ? 'Daylight' : 'Evening';
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  play.addEventListener('click', start);
  lighting.addEventListener('click', updateLighting);
  pause.addEventListener('click', pauseWalk);
  restart.addEventListener('click', () => {
    resetEye();
    start();
  });
  showOverview.addEventListener('click', () => {
    changeMode('overview');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    play.focus({ preventScroll: true });
  });
  document.addEventListener('pointerlockchange', () => {
    const wasLocked = locked;
    locked = document.pointerLockElement === canvas;
    if (locked && mode !== 'playing') document.exitPointerLock();
    else if (wasLocked && !locked) pauseWalk();
    refreshTip();
  });
  document.addEventListener('pointerlockerror', refreshTip);
  document.addEventListener('mousemove', (event) => {
    if (locked && mode === 'playing') aim(event.movementX, event.movementY);
  });
  document.addEventListener('keydown', (event) => {
    if (mode !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      pauseWalk();
    } else if (moveKeys.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', pauseWalk);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseWalk();
  });
  touch.addEventListener('change', refreshTip);

  canvas.addEventListener('pointerdown', (event) => {
    if (mode !== 'playing' || locked || lookPointer || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (lookPointer?.id !== event.pointerId || locked || mode !== 'playing') return;
    aim(event.clientX - lookPointer.x, event.clientY - lookPointer.y);
    lookPointer.x = event.clientX;
    lookPointer.y = event.clientY;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      if (lookPointer?.id === event.pointerId) lookPointer = null;
    });
    joystick.addEventListener(type, (event) => {
      if (stickPointer === event.pointerId) clearStick();
    });
  }

  function steer(event) {
    const rect = joystick.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / 36;
    const y = (event.clientY - rect.top - rect.height / 2) / 36;
    const magnitude = Math.max(1, Math.hypot(x, y));
    stickSide = x / magnitude;
    stickForward = -y / magnitude;
    byId('joystick-knob').style.translate = `${stickSide * 32}px ${-stickForward * 32}px`;
  }

  joystick.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    joystick.setPointerCapture(stickPointer);
    steer(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (stickPointer === event.pointerId) steer(event);
  });

  canvas.hidden = false;
  stage.classList.add('is-ready');
  play.disabled = lighting.disabled = false;
  resetEye();
  resize();
  changeMode('overview');
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);

  const held = (...codes) => Number(codes.some((code) => keys.has(code)));
  renderer.setAnimationLoop((time) => {
    const delta = previousTime === undefined ? 0 : Math.min(0.05, (time - previousTime) / 1000);
    previousTime = time;
    if (mode === 'playing') {
      const side = stickSide + held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
      const forward = stickForward + held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
      if (side || forward) {
        const speed = held('ShiftLeft', 'ShiftRight') ? 2.35 : 1.55;
        move(eye.position, eye.rotation.y, side, forward, delta * speed, bounds, obstacles);
        dirty = true;
      }
    } else if (mode === 'overview') {
      dirty = orbit.update() || dirty;
    }
    if (!dirty) return;
    renderer.render(scene, mode === 'overview' ? cutaway : eye);
    dirty = false;
  });
}

init().catch((error) => {
  byId('play-label').textContent = 'Walkthrough unavailable';
  byId('load-error').textContent = error instanceof Error ? error.message : 'The room could not load.';
  byId('load-error').hidden = false;
  byId('stage-tip').hidden = true;
  console.error(error);
});
