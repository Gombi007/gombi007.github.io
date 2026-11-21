import * as THREE from 'three';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { Reflector } from './vendor/objects/Reflector.js';
import { canStand, move } from './movement.js?v=2';
import { formatMeasures, messages } from './translations.js';

const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const viewport = byId('viewport');
const play = byId('play');
const lighting = byId('lighting');
const showOverview = byId('overview');
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
let roomSize = [5.8, 8.2];
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
    byId('stage-tip').textContent = text(touch.matches ? 'orbitTouch' : 'orbit');
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

  const [{ scene: model }, measures] = await Promise.all([
    new GLTFLoader().loadAsync(new URL('./assets/room.glb?v=2', import.meta.url).href),
    fetch(new URL('./assets/dimensions.json?v=2', import.meta.url)).then((response) => {
      if (!response.ok) throw new Error('The dimensions file could not be loaded.');
      return response.json();
    }),
  ]);
  const scale = measures.scale;
  roomSize = measures.items.find((item) => item.id === 'room').dimensions.slice(0, 2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2d3cc);
  const cutaway = new THREE.PerspectiveCamera(36, 1, 0.025 * scale, 100 * scale);
  const eye = new THREE.PerspectiveCamera(61, 1, 0.028 * scale, 45 * scale);
  eye.rotation.order = 'YXZ';
  const spawn = new THREE.Vector3(1.45, 1.56, 0.40).multiplyScalar(scale);
  const overviewDirection = new THREE.Vector3(-6.33, 2.46, 0.37).normalize();
  const orbit = new OrbitControls(cutaway, canvas);
  orbit.target.set(1.45, 1.02, 2.05).multiplyScalar(scale);
  orbit.enableDamping = true;
  orbit.enablePan = false;
  orbit.minDistance = 2.9 * scale;
  orbit.maxDistance = 22 * scale;
  orbit.minPolarAngle = 0.16;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.enabled = false;

  const hemisphere = new THREE.HemisphereLight(0xf0f6ff, 0x87755e, 1.9);
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.35);
  sun.position.set(-1.15, 6.1, 1.1).multiplyScalar(scale);
  sun.target.position.set(1.45, 0, 2.05).multiplyScalar(scale);
  sun.castShadow = true;
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

  function fitOverview(recenter) {
    const vertical = Math.tan(THREE.MathUtils.degToRad(cutaway.fov / 2));
    const distance = Math.min(orbit.maxDistance,
      Math.max(6.9, 2.72 / (vertical * cutaway.aspect)) * scale);
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
    const tip = mode === 'overview' ? (touch.matches ? 'orbitTouch' : 'orbit')
      : mode === 'paused' ? 'paused' : touch.matches ? 'looking' : locked ? 'escape' : 'dragEscape';
    byId('stage-tip').textContent = text(tip);
    joystick.hidden = mode !== 'playing' || !touch.matches;
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
    const inside = mode !== 'overview';
    const playing = mode === 'playing';
    enclosure.forEach((object) => { object.visible = inside; });
    orbit.enabled = !inside;
    pause.hidden = !playing;
    showOverview.hidden = mode !== 'paused';
    restart.hidden = mode !== 'paused';
    byId('view-label').hidden = inside;
    byId('reticle').hidden = !playing;
    refreshControls();
    renderer.shadowMap.needsUpdate = true;
    if (mode === 'overview') fitOverview(true);
    dirty = true;
  }

  function start() {
    if (mode === 'overview') resetEye();
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
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
  stage.classList.add('is-ready');
  play.disabled = lighting.disabled = dimensionToggle.disabled = false;
  resetEye();
  resize();
  changeMode('overview');
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
      if (side || forward) {
        const speed = held('ShiftLeft', 'ShiftRight') ? 2.35 : 1.55;
        move(eye.position, eye.rotation.y, side, forward, delta * speed * scale, bounds, obstacles, scale);
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
  loadFailure ||= 'loadError';
  applyLanguage();
  byId('load-error').hidden = false;
  byId('stage-tip').hidden = true;
  console.error(error);
});
