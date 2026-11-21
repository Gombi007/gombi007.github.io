import * as THREE from 'three';

const ink = 0xffdf40;
const furnitureWidthAxis = { bed: 2, wardrobe: 2, cabinet: 2, desk: 2, heater: 0, shelves: 2 };

export function createFurnitureFrame(item, scale) {
  const { min, max } = item.boxes[0];
  const [width, depth] = item.dimensions;
  const [sizeX, sizeZ] = furnitureWidthAxis[item.id] === 0 ? [width, depth] : [depth, width];
  const halfX = sizeX * scale / 2;
  const halfZ = sizeZ * scale / 2;
  const toWorld = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(item.rotationY));
  toWorld.setPosition((min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2);
  const box = new THREE.Box3(
    new THREE.Vector3(-halfX, min[1], -halfZ),
    new THREE.Vector3(halfX, max[1], halfZ),
  );
  return { box, toWorld, toLocal: toWorld.clone().invert() };
}

export function createMeasurementLayer({ scale, items }, frames) {
  const group = new THREE.Group();
  group.name = 'Measurements';
  group.visible = false;
  const segments = [];
  const labels = [];
  const offset = 0.03 * scale;
  const tick = 0.028 * scale;
  const labelHeight = 0.095 * scale;
  const labelPixelHeight = 64;
  const room = items.find(({ id }) => id === 'room');
  const { min: roomMin, max: roomMax } = room.boxes[0];
  const [roomWidth, roomDepth, roomHeight] = room.dimensions;
  const roomBounds = new THREE.Box3(
    new THREE.Vector3().fromArray(roomMin),
    new THREE.Vector3().fromArray(roomMax),
  );
  // Keep ruler ends clear of the walls, finished floor, and ceiling.
  const rulerBounds = roomBounds.clone().expandByScalar(-0.025 * scale);
  const trimRay = new THREE.Ray();

  function addSegment(start, end) {
    trimRay.set(start, end.clone().sub(start).normalize());
    if (!rulerBounds.containsPoint(start) && !trimRay.intersectBox(rulerBounds, start)) return false;
    trimRay.origin.copy(end);
    trimRay.direction.negate();
    if (!rulerBounds.containsPoint(end) && !trimRay.intersectBox(rulerBounds, end)) return false;
    if (start.distanceToSquared(end) < 1e-12) return false;
    segments.push([start, end]);
    return true;
  }

  function mark(axis, value, start, tickAxis, { labelAxis = 1, labelOffset = 0.071, toWorld, title } = {}) {
    const point = (coordinates) => {
      const vector = new THREE.Vector3().fromArray(coordinates);
      return toWorld ? vector.applyMatrix4(toWorld) : vector;
    };
    const end = [...start];
    end[axis] += value * scale;
    const first = point(start);
    const last = point(end);
    if (!addSegment(first, last)) return;
    const tickOffset = new THREE.Vector3().setComponent(tickAxis, 1);
    if (toWorld) tickOffset.transformDirection(toWorld);
    tickOffset.multiplyScalar(tick);
    for (const endpoint of [first, last]) {
      addSegment(endpoint.clone().sub(tickOffset), endpoint.clone().add(tickOffset));
    }

    const canvas = document.createElement('canvas');
    canvas.width = title ? 544 : 224;
    canvas.height = title ? 112 : labelPixelHeight;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false,
    }));
    const labelPoint = [...start];
    labelPoint[axis] = (start[axis] + end[axis]) / 2;
    const spriteHeight = labelHeight * canvas.height / labelPixelHeight;
    labelPoint[labelAxis] += labelOffset * scale + (spriteHeight - labelHeight) / 2;
    label.position.copy(point(labelPoint));
    label.scale.set(spriteHeight * canvas.width / canvas.height, spriteHeight, 1);
    group.add(label);
    labels.push({ canvas, context, texture, value, title });
  }

  const wallX = roomMin[0] + 2 * offset;
  const wallZ = roomMax[2] - 2 * offset;
  const wallY = roomMax[1] - 4 * offset;
  mark(0, roomWidth, [roomMin[0], wallY, wallZ], 1, { labelOffset: 0.064 });
  mark(2, roomDepth, [wallX, wallY, roomMin[2]], 1, { labelOffset: 0.064 });
  mark(1, roomHeight, [roomMax[0] - 2 * offset, roomMin[1], wallZ], 0,
    { labelAxis: 0, labelOffset: -0.13 });

  const roomCenter = roomBounds.getCenter(new THREE.Vector3());
  for (const { id, name, dimensions, boxes } of items) {
    const frame = frames.get(id);
    const { min, max } = frame ? { min: frame.box.min.toArray(), max: frame.box.max.toArray() } : boxes[0];
    const [width, depthOrHeight, height] = dimensions;
    if (id === 'window') {
      // Keep the window rulers on the room side of the curtains and above the heater.
      const z = min[2] - 0.20 * scale;
      mark(0, width, [min[0], max[1], z], 1);
      mark(1, depthOrHeight, [max[0], min[1], z], 0, { labelAxis: 0, labelOffset: -0.13 });
      continue;
    }
    if (id === 'doorway') {
      const z = max[2] + 2 * offset;
      mark(0, width, [min[0], min[1] + 2 * offset, z], 1);
      mark(1, depthOrHeight, [max[0] - offset, min[1], z], 0, { labelAxis: 0, labelOffset: -0.13 });
      continue;
    }

    const widthAxis = furnitureWidthAxis[id];
    if (widthAxis === undefined) continue;
    const depthAxis = widthAxis === 0 ? 2 : 0;
    const center = frame ? roomCenter.clone().applyMatrix4(frame.toLocal) : roomCenter;
    const nearMinX = (min[0] + max[0]) / 2 > center.x;
    const nearMinZ = (min[2] + max[2]) / 2 > center.z;
    const frontX = nearMinX ? min[0] : max[0];
    const frontZ = nearMinZ ? min[2] : max[2];
    const nearMinDepth = depthAxis === 0 ? nearMinX : nearMinZ;
    const nearMinWidth = widthAxis === 0 ? nearMinX : nearMinZ;
    const depthSide = nearMinDepth ? -1 : 1;
    const widthSide = nearMinWidth ? -1 : 1;
    const top = max[1] + offset;
    const widthStart = [frontX, top, frontZ];
    widthStart[widthAxis] = min[widthAxis];
    widthStart[depthAxis] += depthSide * offset;
    mark(widthAxis, width, widthStart, 1, { toWorld: frame?.toWorld, title: name });

    const depthStart = [frontX, top, frontZ];
    depthStart[depthAxis] = min[depthAxis];
    depthStart[widthAxis] += widthSide * offset;
    // Measure beside the heater below the projecting window sill.
    if (id === 'heater') depthStart[1] = max[1] - 0.095 * scale;
    mark(depthAxis, depthOrHeight, depthStart, 1, { toWorld: frame?.toWorld });

    const heightStart = [frontX, min[1], frontZ];
    heightStart[depthAxis] += depthSide * offset;
    heightStart[widthAxis] += widthSide * offset;
    mark(1, height, heightStart, widthAxis,
      { labelAxis: depthAxis, labelOffset: depthSide * 0.12, toWorld: frame?.toWorld });
  }

  const strokes = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0045 * scale, 0.0045 * scale, 1, 8),
    new THREE.MeshBasicMaterial({ color: ink, toneMapped: false }),
    segments.length,
  );
  const yAxis = new THREE.Vector3(0, 1, 0);
  const delta = new THREE.Vector3();
  const transform = new THREE.Object3D();
  segments.forEach(([start, end], index) => {
    delta.subVectors(end, start);
    transform.position.copy(start).addScaledVector(delta, 0.5);
    transform.scale.y = delta.length();
    transform.quaternion.setFromUnitVectors(yAxis, delta.normalize());
    transform.updateMatrix();
    strokes.setMatrixAt(index, transform.matrix);
  });
  group.add(strokes);

  function setLanguage(language) {
    const format = new Intl.NumberFormat(language === 'hu' ? 'hu-HU' : 'en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    });
    for (const { canvas, context, texture, value, title } of labels) {
      const caption = `${format.format(value)} m`;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = '700 43px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = 8;
      context.strokeStyle = '#191813';
      context.fillStyle = '#ffdf40';
      const centerX = canvas.width / 2;
      const dimensionY = canvas.height - 30;
      context.strokeText(caption, centerX, dimensionY);
      context.fillText(caption, centerX, dimensionY);
      if (title) {
        context.font = '700 34px system-ui, sans-serif';
        context.lineWidth = 7;
        context.strokeText(title, centerX, 31, canvas.width - 16);
        context.fillText(title, centerX, 31, canvas.width - 16);
      }
      texture.needsUpdate = true;
    }
  }

  return { group, setLanguage };
}
