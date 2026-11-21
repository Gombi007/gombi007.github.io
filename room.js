import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { Reflector } from './vendor/objects/Reflector.js';
import { createFurnitureFrame, createMeasurementLayer } from './measurements.js?v=2';
import { canStand, move } from './movement.js?v=4';
import { formatMeasures, messages } from './translations.js?v=6';

const byId = (id) => document.getElementById(id);
const viewport = byId('viewport');
const play = byId('play');
const lighting = byId('lighting');
const pause = byId('pause');
const restart = byId('restart');
const joystick = byId('joystick');
const touch = matchMedia('(pointer: coarse)');
const entranceYaw = Math.PI;
const entrancePitch = -0.075;
const wallColors = { 1: null, 2: 0x7d93a9, 3: 0x899d8a, 4: 0x686a6d, 5: 0x34373d };
const moveKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);
const languageButtons = document.querySelectorAll('[data-lang]');
let language = 'hu';
let loadFailure;
let roomSize = [2.9, 4.1];
let refreshLanguage = () => {};
try {
  if (localStorage.getItem('room-language') === 'en') language = 'en';
} catch {
  // The language selector is still usable when storage is unavailable.
}

const text = (key) => messages[language][key];

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = text('pageTitle');
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = text(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-label]')) {
    element.setAttribute('aria-label', text(element.dataset.i18nLabel));
  }
  for (const button of languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === language));
  }
  byId('room-size').textContent = formatMeasures(roomSize, language);
  if (play.disabled) {
    byId('play-label').textContent = text(loadFailure ? 'unavailable' : 'loading');
    byId('intro-copy').textContent = text('intro');
    byId('lighting-label').textContent = text('night');
  }
  if (loadFailure) byId('load-error').textContent = text(loadFailure);
  refreshLanguage();
}

for (const button of languageButtons) {
  button.addEventListener('click', () => {
    language = button.dataset.lang;
    try { localStorage.setItem('room-language', language); } catch { /* Session only. */ }
    applyLanguage();
  });
}
applyLanguage();

async function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    loadFailure = 'webgl';
    throw new Error('WebGL 2 is unavailable.');
  }

  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', text('canvas'));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  viewport.append(canvas);
  canvas.hidden = true;

  const loader = new GLTFLoader();
  const [{ scene: model }, measures, avatar] = await Promise.all([
    loader.loadAsync(new URL('./assets/room.glb?v=4', import.meta.url).href),
    fetch(new URL('./assets/dimensions.json?v=4', import.meta.url)).then((response) => {
      if (!response.ok) throw new Error('The dimensions file could not be loaded.');
      return response.json();
    }),
    loader.loadAsync(new URL('./assets/player.glb?v=1', import.meta.url).href),
  ]);
  const scale = measures.scale;
  const room = measures.items.find((item) => item.id === 'room');
  const [roomWidth, roomDepth] = room.dimensions;
  roomSize = [roomWidth, roomDepth];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2d3cc);
  const eye = new THREE.PerspectiveCamera(61, 1, 0.028 * scale, 45 * scale);
  eye.rotation.order = 'YXZ';
  const chase = new THREE.PerspectiveCamera(63, 1, 0.028 * scale, 45 * scale);
  const playerLayer = 1;
  const measurementLayer = 2;
  const eyeHeight = 1.64 * scale;
  const spawn = new THREE.Vector3(1.45, 0, 0.40).multiplyScalar(scale);

  const player = new THREE.Group();
  avatar.scene.scale.setScalar(scale);
  avatar.scene.traverse((object) => {
    if (!object.isMesh) return;
    object.layers.set(playerLayer);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  player.add(avatar.scene);
  scene.add(player);
  const mixer = new THREE.AnimationMixer(avatar.scene);
  const idle = mixer.clipAction(THREE.AnimationClip.findByName(avatar.animations, 'Idle'));
  const walk = mixer.clipAction(THREE.AnimationClip.findByName(avatar.animations, 'Walk'));
  idle.play();
  mixer.update(0);
  let activeAction = idle;

  const hemisphere = new THREE.HemisphereLight(0xf0f6ff, 0x87755e, 1.9);
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.35);
  sun.position.set(-1.15, 6.1, 1.1).multiplyScalar(scale);
  sun.target.position.set(1.45, 0, 2.05).multiplyScalar(scale);
  sun.castShadow = true;
  sun.shadow.camera.layers.enable(playerLayer);
  Object.assign(sun.shadow.camera, {
    left: -3.6 * scale, right: 3.6 * scale, bottom: -3.6 * scale, top: 3.6 * scale,
    far: 16 * scale,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(touch.matches ? 1024 : 2048, touch.matches ? 1024 : 2048);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.013 * scale;
  const windowLight = new THREE.PointLight(0xd8ecff, 9.5 * scale ** 2, 7 * scale, 2);
  windowLight.position.set(1.67, 1.91, 3.86).multiplyScalar(scale);
  scene.add(hemisphere, sun, sun.target, windowLight);

  scene.add(model);
  model.updateMatrixWorld(true);
  let floor;
  model.traverse((object) => {
    if (object.userData.roomRole === 'floor') floor = object;
  });
  if (!floor) throw new Error('The room export could not locate its floor.');
  const bounds = new THREE.Box3().setFromObject(floor);
  const obstacles = [];
  const wallPaints = new Map();
  const furnitureFrames = new Map(
    measures.items.filter((item) => item.rotationY).map((item) => [item.id, createFurnitureFrame(item, scale)]),
  );
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe1eef6, roughness: 0.12, opacity: 0.14, transparent: true,
    depthWrite: false, metalness: 0,
  });
  let mirrorMesh;
  model.traverse((object) => {
    const role = object.userData.roomRole;
    if (role === 'collision') {
      const id = object.userData.name?.replace(/^Move /, '');
      obstacles.push(furnitureFrames.get(id) ?? { box: new THREE.Box3().setFromObject(object) });
    }
    if (!object.isMesh) return;
    object.castShadow = object !== floor && role !== 'glass' && role !== 'mirror';
    object.receiveShadow = role !== 'glass';
    if (role === 'glass') object.material = glass;
    if (role === 'mirror') mirrorMesh = object;
    if (role === 'enclosure' && object.material.color) {
      const original = object.material;
      if (!wallPaints.has(original)) wallPaints.set(original, original.clone());
      object.material = wallPaints.get(original);
    }
    const maps = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of maps) {
      if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  });
  if (obstacles.length !== 6 ||
      Math.abs(bounds.max.x - bounds.min.x - roomSize[0]) > 0.01 ||
      !canStand(spawn.x, spawn.z, bounds, obstacles, scale)) {
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
    mirror.position.x = box.min.x - 0.003 * scale;
    mirror.rotateY(-Math.PI / 2);
    mirror.camera.layers.enable(playerLayer);
    mirrorMesh.visible = false;
    scene.add(mirror);
  }

  spawn.y = bounds.max.y;
  const ceilingHeight = room.boxes[0].max[1] - 0.001 * scale;
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z),
    new THREE.MeshStandardMaterial({ color: 0xebe7dd, roughness: 0.95 }),
  );
  ceiling.name = 'Ceiling';
  bounds.getCenter(ceiling.position);
  ceiling.position.y = ceilingHeight;
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);

  const fixture = new THREE.Group();
  fixture.name = 'Ceiling lamp';
  fixture.position.copy(ceiling.position);
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.184 * scale, 0.193 * scale, 0.034 * scale, 48),
    new THREE.MeshStandardMaterial({ color: 0xcfc6b5, roughness: 0.55, metalness: 0.18 }),
  );
  trim.position.y = -0.017 * scale;
  const diffuserMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff7e6, roughness: 0.38, emissive: 0xffce91, emissiveIntensity: 0,
  });
  const profile = [[0, -0.118], [0.09, -0.117], [0.138, -0.109], [0.17, -0.091],
    [0.185, -0.068], [0.19, -0.034]].map(([radius, y]) => new THREE.Vector2(radius * scale, y * scale));
  fixture.add(trim, new THREE.Mesh(new THREE.LatheGeometry(profile, 48), diffuserMaterial));
  scene.add(fixture);

  const lamp = new THREE.SpotLight(0xffcd98, 0, 5.5 * scale, 1.24, 0.55);
  lamp.name = 'Ceiling lamp light';
  lamp.position.copy(fixture.position);
  lamp.position.y -= 0.125 * scale;
  lamp.target.position.copy(fixture.position);
  lamp.target.position.y = spawn.y;
  const lampShadowSize = touch.matches ? 512 : 1024;
  lamp.shadow.mapSize.set(lampShadowSize, lampShadowSize);
  lamp.shadow.camera.layers.enable(playerLayer);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.normalBias = 0.012 * scale;
  scene.add(lamp, lamp.target);

  const cameraPadding = 0.11 * scale;
  const roomCameraBounds = bounds.clone();
  roomCameraBounds.min.y = spawn.y;
  roomCameraBounds.max.y = ceilingHeight;
  roomCameraBounds.expandByScalar(-cameraPadding);
  const cameraObstacles = obstacles.map(({ box, toLocal }) => ({
    box: box.clone().expandByScalar(cameraPadding), toLocal,
  }));
  const cameraRay = new THREE.Ray();
  const localRay = new THREE.Ray();
  const cameraHit = new THREE.Vector3();
  const cameraPivot = new THREE.Vector3();
  let chaseDistance;

  let mode = 'ready';
  let thirdPerson = false;
  let yaw = entranceYaw;
  let pitch = entrancePitch;
  let night = false;
  let dirty = true;
  let locked = false;
  let previousTime;
  let lookPointer = null;
  let stickPointer = null;
  let stickSide = 0;
  let stickForward = 0;
  let measurementsEnabled = false;
  const keys = new Set();
  const measurements = createMeasurementLayer(measures, furnitureFrames);
  measurements.group.traverse((object) => object.layers.set(measurementLayer));
  eye.layers.enable(measurementLayer);
  chase.layers.enable(measurementLayer);
  scene.add(measurements.group);

  function updateCameras(delta) {
    eye.position.copy(player.position);
    eye.position.y += eyeHeight;
    eye.rotation.set(pitch, yaw, 0);
    if (!thirdPerson) return;

    cameraPivot.copy(player.position);
    cameraPivot.y += 0.98 * scale;
    cameraRay.origin.copy(cameraPivot);
    const shoulder = 0.27;
    const elevation = 0.58 - Math.sin(pitch) * 1.35;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    cameraRay.direction.set(1.85 * sin + shoulder * cos, elevation, 1.85 * cos - shoulder * sin);
    let clearDistance = cameraRay.direction.length() * scale;
    cameraRay.direction.normalize();
    if (cameraRay.intersectBox(roomCameraBounds, cameraHit)) {
      clearDistance = Math.min(clearDistance, cameraHit.distanceTo(cameraPivot));
    }
    for (const { box, toLocal } of cameraObstacles) {
      const ray = toLocal ? localRay.copy(cameraRay).applyMatrix4(toLocal) : cameraRay;
      if (ray.intersectBox(box, cameraHit)) {
        clearDistance = Math.min(clearDistance, cameraHit.distanceTo(ray.origin));
      }
    }

    // Move in immediately at an obstruction and ease back out as space opens up.
    chaseDistance = Math.min(clearDistance, THREE.MathUtils.damp(chaseDistance ?? clearDistance, clearDistance, 12, delta));
    cameraRay.at(chaseDistance, chase.position);
    // Keep the view clear when the player would fill the frame.
    if (chaseDistance < 0.48 * scale) chase.layers.disable(playerLayer);
    else chase.layers.enable(playerLayer);
    chase.lookAt(cameraPivot);
  }

  function resize() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    chase.aspect = eye.aspect = width / height;
    eye.fov = width / height < 1 ? 76 : 61;
    chase.fov = width / height < 1 ? 77 : 63;
    chase.updateProjectionMatrix();
    eye.updateProjectionMatrix();
    dirty = true;
  }

  function aim(deltaX, deltaY) {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (!deltaX && !deltaY)) return;
    yaw -= deltaX * 0.0025;
    pitch = THREE.MathUtils.clamp(pitch - deltaY * 0.0025, -1.38, 1.38);
    if (!thirdPerson) player.rotation.y = yaw + Math.PI;
    dirty = true;
  }

  function resetPlayer() {
    player.position.copy(spawn);
    player.rotation.y = 0;
    yaw = entranceYaw;
    pitch = entrancePitch;
    chaseDistance = undefined;
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  function refreshTip() {
    const stageTip = byId('stage-tip');
    stageTip.hidden = mode === 'ready';
    const tip = mode === 'paused' ? 'paused' : touch.matches ? 'touchHint' : locked ? 'playHint' : 'dragHint';
    stageTip.textContent = text(tip);
    joystick.hidden = mode !== 'playing' || !touch.matches;
  }

  function refreshReticle() {
    byId('reticle').hidden = mode !== 'playing' || thirdPerson;
  }

  function switchCamera() {
    thirdPerson = !thirdPerson;
    chaseDistance = undefined;
    if (!thirdPerson) player.rotation.y = yaw + Math.PI;
    refreshReticle();
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  function refreshControls() {
    byId('play-label').textContent = text(mode === 'paused' ? 'resume' : 'play');
    byId('intro-copy').textContent = text(mode === 'paused' ? 'pausedIntro' : 'intro');
    byId('lighting-label').textContent = text(night ? 'day' : 'night');
    refreshTip();
  }

  refreshLanguage = () => {
    canvas.setAttribute('aria-label', text('canvas'));
    refreshControls();
    measurements.setLanguage(language);
    dirty = true;
  };

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
    measurements.group.visible = mode === 'playing' && measurementsEnabled;
    pause.hidden = mode !== 'playing';
    restart.hidden = mode !== 'paused';
    refreshReticle();
    refreshControls();
    dirty = true;
  }

  async function lockMouse() {
    if (touch.matches || !canvas.requestPointerLock) return;
    try {
      // Raw mouse input avoids cursor recentering in emulated pointer lock.
      await canvas.requestPointerLock({ unadjustedMovement: true });
    } catch (error) {
      if (error.name !== 'NotSupportedError' || mode !== 'playing') return;
      try {
        await canvas.requestPointerLock();
      } catch {
        refreshTip();
      }
    }
  }

  function start() {
    changeMode('playing');
    canvas.focus({ preventScroll: true });
    lockMouse();
  }

  function pauseWalk() {
    if (mode !== 'playing') return;
    changeMode('paused');
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    play.focus({ preventScroll: true });
  }

  function updateLighting() {
    night = !night;
    hemisphere.intensity = night ? 0.65 : 1.9;
    sun.intensity = night ? 0.24 : 2.35;
    sun.color.setHex(night ? 0xa5bbf1 : 0xfff1dd);
    sun.castShadow = !night;
    windowLight.intensity = (night ? 1.3 : 9.5) * scale ** 2;
    lamp.intensity = night ? 19 * scale ** 2 : 0;
    lamp.castShadow = night;
    diffuserMaterial.emissiveIntensity = night ? 1.8 : 0;
    scene.background.setHex(night ? 0x29334b : 0xd2d3cc);
    renderer.toneMappingExposure = night ? 0.94 : 1.03;
    lighting.setAttribute('aria-pressed', String(night));
    byId('lighting-label').textContent = text(night ? 'day' : 'night');
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  function changeWallPaint(key) {
    const color = wallColors[key];
    for (const [original, paint] of wallPaints) {
      if (color === null) paint.color.copy(original.color);
      else paint.color.setHex(color);
    }
    dirty = true;
  }

  play.addEventListener('click', start);
  lighting.addEventListener('click', updateLighting);
  pause.addEventListener('click', pauseWalk);
  restart.addEventListener('click', () => {
    resetPlayer();
    start();
  });
  document.addEventListener('pointerlockchange', () => {
    const wasLocked = locked;
    locked = document.pointerLockElement === canvas;
    if (locked && mode !== 'playing') document.exitPointerLock();
    else if (wasLocked && !locked) pauseWalk();
    refreshTip();
  });
  document.addEventListener('pointerlockerror', refreshTip);
  canvas.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas && mode === 'playing') {
      aim(event.movementX, event.movementY);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (mode !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (Object.hasOwn(wallColors, event.key)) {
      event.preventDefault();
      if (!event.repeat) changeWallPaint(event.key);
    } else if (event.code === 'KeyE') {
      event.preventDefault();
      if (!event.repeat) updateLighting();
    } else if (event.code === 'KeyV') {
      event.preventDefault();
      if (!event.repeat) switchCamera();
    } else if (event.code === 'KeyQ') {
      event.preventDefault();
      if (!event.repeat) {
        measurementsEnabled = !measurementsEnabled;
        measurements.group.visible = measurementsEnabled;
        dirty = true;
      }
    } else if (event.code === 'Escape') {
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
  play.disabled = lighting.disabled = false;
  resetPlayer();
  resize();
  changeMode('ready');
  applyLanguage();
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);

  const held = (...codes) => Number(codes.some((code) => keys.has(code)));
  renderer.setAnimationLoop((time) => {
    const delta = previousTime === undefined ? 0 : Math.min(0.05, (time - previousTime) / 1000);
    previousTime = time;
    if (mode === 'playing') {
      const side = stickSide + held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
      const forward = stickForward + held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
      const speed = held('ShiftLeft', 'ShiftRight') ? 2.35 : 1.55;
      const { x, z } = player.position;
      if (side || forward) {
        move(player.position, yaw, side, forward, delta * speed * scale, bounds, obstacles, scale);
      }
      const dx = player.position.x - x;
      const dz = player.position.z - z;
      const distance = Math.hypot(dx, dz);
      const nextAction = distance > 0 ? walk : idle;
      if (activeAction !== nextAction) {
        activeAction.fadeOut(0.14);
        nextAction.reset().fadeIn(0.14).play();
        activeAction = nextAction;
      }
      if (distance > 0) {
        walk.timeScale = Math.max(0.45, distance / (delta * 1.55 * scale));
        if (thirdPerson) {
          const turn = Math.atan2(dx, dz) - player.rotation.y;
          player.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, delta * 14);
        }
      }
      mixer.update(delta);
      if (thirdPerson) renderer.shadowMap.needsUpdate = true;
      dirty = true;
    }
    if (!dirty) return;
    updateCameras(delta);
    renderer.render(scene, thirdPerson ? chase : eye);
    dirty = false;
  });
}

init().catch((error) => {
  loadFailure ||= 'loadError';
  applyLanguage();
  byId('load-error').hidden = false;
  byId('stage-tip').hidden = true;
  console.error(error);
});
