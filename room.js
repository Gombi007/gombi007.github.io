import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { Reflector } from './vendor/objects/Reflector.js';
import { canStand, move } from './movement.js?v=3';
import { formatMeasures, messages } from './translations.js?v=2';

const byId = (id) => document.getElementById(id);
const viewport = byId('viewport');
const play = byId('play');
const lighting = byId('lighting');
const cameraToggle = byId('camera-toggle');
const pause = byId('pause');
const restart = byId('restart');
const joystick = byId('joystick');
const dimensionToggle = byId('dimensions-toggle');
const dimensionPanel = byId('dimensions-panel');
const touch = matchMedia('(pointer: coarse)');
const moveKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);
const languageButtons = document.querySelectorAll('[data-lang]');
let language = 'en';
let loadFailure;
let roomSize = [2.9, 4.1];
let refreshLanguage = () => {};
try {
  if (localStorage.getItem('room-language') === 'hu') language = 'hu';
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
    byId('lighting-label').textContent = text('evening');
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
    loader.loadAsync(new URL('./assets/room.glb?v=3', import.meta.url).href),
    fetch(new URL('./assets/dimensions.json?v=3', import.meta.url)).then((response) => {
      if (!response.ok) throw new Error('The dimensions file could not be loaded.');
      return response.json();
    }),
    loader.loadAsync(new URL('./assets/player.glb?v=1', import.meta.url).href),
  ]);
  const scale = measures.scale;
  const [roomWidth, roomDepth, roomHeight] = measures.items.find((item) => item.id === 'room').dimensions;
  roomSize = [roomWidth, roomDepth];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2d3cc);
  const eye = new THREE.PerspectiveCamera(61, 1, 0.028 * scale, 45 * scale);
  eye.rotation.order = 'YXZ';
  const chase = new THREE.PerspectiveCamera(63, 1, 0.028 * scale, 45 * scale);
  const playerLayer = 1;
  const eyeHeight = 1.64 * scale;
  const spawn = new THREE.Vector3(1.45, 0, 0.40).multiplyScalar(scale);
  chase.layers.enable(playerLayer);

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
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe1eef6, roughness: 0.12, opacity: 0.14, transparent: true,
    depthWrite: false, metalness: 0,
  });
  let mirrorMesh;
  model.traverse((object) => {
    const role = object.userData.roomRole;
    if (role === 'collision') obstacles.push(new THREE.Box3().setFromObject(object));
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
  const cameraPadding = 0.11 * scale;
  const roomCameraBounds = bounds.clone();
  roomCameraBounds.min.y = spawn.y;
  roomCameraBounds.max.y = spawn.y + roomHeight * scale;
  roomCameraBounds.expandByScalar(-cameraPadding);
  const cameraObstacles = obstacles.map((box) => box.clone().expandByScalar(cameraPadding));
  const cameraRay = new THREE.Ray();
  const cameraHit = new THREE.Vector3();
  const cameraPivot = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const cameraAngles = [0, Math.PI / 3, -Math.PI / 3, Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI];

  let mode = 'ready';
  let thirdPerson = false;
  let evening = false;
  let dirty = true;
  let locked = false;
  let previousTime;
  let lookPointer = null;
  let stickPointer = null;
  let stickSide = 0;
  let stickForward = 0;
  const keys = new Set();
  const dimensionsOverlay = new THREE.Group();
  dimensionsOverlay.visible = false;
  scene.add(dimensionsOverlay);
  const dimensionRows = [];
  const structureIds = new Set(['room', 'sideWalls', 'entranceWall', 'windowWall', 'window', 'doorway']);
  let selectedDimension;
  for (const item of measures.items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'dimension-row';
    row.setAttribute('aria-pressed', 'false');
    const name = document.createElement('span');
    const value = document.createElement('span');
    row.append(name, value);
    byId(structureIds.has(item.id) ? 'structure-list' : 'furniture-list').append(row);
    dimensionRows.push({ row, name, value, item });
    row.addEventListener('click', () => selectDimension(item));
  }

  function selectDimension(item) {
    if (selectedDimension === item) {
      dirty = true;
      return;
    }
    selectedDimension = item;
    for (const helper of [...dimensionsOverlay.children]) {
      dimensionsOverlay.remove(helper);
      helper.geometry.dispose();
      helper.material.dispose();
    }
    for (const { min, max } of item.boxes) {
      const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
      const helper = new THREE.Box3Helper(box, 0x5edfdf);
      helper.material.depthTest = false;
      helper.material.depthWrite = false;
      helper.material.toneMapped = false;
      helper.renderOrder = 5;
      dimensionsOverlay.add(helper);
    }
    for (const entry of dimensionRows) {
      entry.row.setAttribute('aria-pressed', String(entry.item === item));
    }
    dirty = true;
  }

  function showDimensions(show) {
    if (show && mode === 'playing') pauseWalk();
    dimensionsOverlay.visible = show;
    dimensionPanel.hidden = !show;
    document.body.classList.toggle('shows-dimensions', show);
    dimensionToggle.setAttribute('aria-pressed', String(show));
    if (show && !selectedDimension) selectDimension(measures.items[0]);
    if (show) byId('dimensions-close').focus({ preventScroll: true });
    dirty = true;
  }

  dimensionToggle.addEventListener('click', () => showDimensions(dimensionPanel.hidden));
  byId('dimensions-close').addEventListener('click', () => {
    showDimensions(false);
    dimensionToggle.focus();
  });

  function updateCameras() {
    eye.position.copy(player.position);
    eye.position.y += eyeHeight;
    if (!thirdPerson) return;

    cameraPivot.copy(player.position);
    cameraPivot.y += 0.98 * scale;
    cameraRay.origin.copy(cameraPivot);
    const shoulder = 0.27;
    const elevation = 0.58 - Math.sin(eye.rotation.x) * 1.35;
    let bestDistance = -1;
    // Try nearby angles when walls or furniture crowd the camera.
    for (const angle of cameraAngles) {
      const yaw = eye.rotation.y + angle;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      cameraRay.direction.set(1.85 * sin + shoulder * cos, elevation, 1.85 * cos - shoulder * sin);
      let distance = cameraRay.direction.length() * scale;
      cameraRay.direction.normalize();
      if (cameraRay.intersectBox(roomCameraBounds, cameraHit)) {
        distance = Math.min(distance, cameraHit.distanceTo(cameraPivot));
      }
      for (const box of cameraObstacles) {
        if (!box.containsPoint(cameraPivot) && cameraRay.intersectBox(box, cameraHit)) {
          distance = Math.min(distance, cameraHit.distanceTo(cameraPivot));
        }
      }
      if (distance <= bestDistance) continue;
      bestDistance = distance;
      cameraRay.at(distance, cameraPosition);
      if (distance >= 1.18 * scale) break;
    }
    chase.position.copy(cameraPosition);
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
    eye.rotation.y -= deltaX * 0.0025;
    eye.rotation.x = THREE.MathUtils.clamp(eye.rotation.x - deltaY * 0.0025, -1.38, 1.38);
    if (!thirdPerson) player.rotation.y = eye.rotation.y + Math.PI;
    dirty = true;
  }

  function resetPlayer() {
    player.position.copy(spawn);
    player.rotation.y = 0;
    eye.rotation.set(-0.075, Math.PI, 0);
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  function refreshTip() {
    const stageTip = byId('stage-tip');
    stageTip.hidden = mode === 'ready';
    const tip = mode === 'paused' ? 'paused' : touch.matches ? 'looking' : locked ? 'escape' : 'dragEscape';
    stageTip.textContent = text(tip);
    joystick.hidden = mode !== 'playing' || !touch.matches;
  }

  function refreshCameraToggle() {
    cameraToggle.textContent = thirdPerson ? 'TPS' : 'FPS';
    cameraToggle.setAttribute('aria-pressed', String(thirdPerson));
    byId('reticle').hidden = mode !== 'playing' || thirdPerson;
  }

  function switchCamera() {
    thirdPerson = !thirdPerson;
    if (!thirdPerson) player.rotation.y = eye.rotation.y + Math.PI;
    refreshCameraToggle();
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  function refreshControls() {
    byId('play-label').textContent = text(mode === 'paused' ? 'resume' : 'play');
    byId('intro-copy').textContent = text(mode === 'paused' ? 'pausedIntro' : 'intro');
    byId('lighting-label').textContent = text(evening ? 'day' : 'evening');
    refreshTip();
  }

  refreshLanguage = () => {
    canvas.setAttribute('aria-label', text('canvas'));
    refreshControls();
    for (const { name, value, item } of dimensionRows) {
      name.textContent = text(item.id);
      value.textContent = formatMeasures(item.dimensions, language);
    }
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
    pause.hidden = mode !== 'playing';
    restart.hidden = mode !== 'paused';
    refreshCameraToggle();
    refreshControls();
    dirty = true;
  }

  function start() {
    showDimensions(false);
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
    windowLight.intensity = (evening ? 4.5 : 9.5) * scale ** 2;
    scene.background.setHex(evening ? 0x62636a : 0xd2d3cc);
    renderer.toneMappingExposure = evening ? 0.87 : 1.03;
    lighting.setAttribute('aria-pressed', String(evening));
    byId('lighting-label').textContent = text(evening ? 'day' : 'evening');
    renderer.shadowMap.needsUpdate = true;
    dirty = true;
  }

  play.addEventListener('click', start);
  cameraToggle.addEventListener('click', switchCamera);
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
  document.addEventListener('mousemove', (event) => {
    if (locked && mode === 'playing') aim(event.movementX, event.movementY);
  });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyV') {
      event.preventDefault();
      if (!event.repeat) switchCamera();
      return;
    }
    if (event.code === 'KeyM' && !event.repeat) {
      showDimensions(dimensionPanel.hidden);
      return;
    }
    if (event.code === 'Escape' && !dimensionPanel.hidden) {
      showDimensions(false);
      dimensionToggle.focus();
      return;
    }
    if (mode !== 'playing') return;
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
  play.disabled = lighting.disabled = dimensionToggle.disabled = cameraToggle.disabled = false;
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
        move(player.position, eye.rotation.y, side, forward, delta * speed * scale, bounds, obstacles, scale);
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
    updateCameras();
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
