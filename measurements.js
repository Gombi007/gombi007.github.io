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

  function mark(axis, value, start, tickAxis, { labelAxis = 1, labelOffset = 0.071, toWorld, title } = {}) {
    const point = (coordinates) => {
      const vector = new THREE.Vector3().fromArray(coordinates);
      return toWorld ? vector.applyMatrix4(toWorld) : vector;
    };
    const end = [...start];
    end[axis] += value * scale;
    segments.push([point(start), point(end)]);
    for (const endpoint of [start, end]) {
      const a = [...endpoint];
      const b = [...endpoint];
      a[tickAxis] -= tick;
      b[tickAxis] += tick;
      segments.push([point(a), point(b)]);
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

  const room = items.find(({ id }) => id === 'room');
  const { min: roomMin, max: roomMax } = room.boxes[0];
  const [roomWidth, roomDepth, roomHeight] = room.dimensions;
  const wallX = roomMin[0] + 2 * offset;
  const wallZ = roomMax[2] - 2 * offset;
  const wallY = roomMax[1] - 3 * offset;
  mark(0, roomWidth, [roomMin[0], wallY, wallZ], 1);
  mark(2, roomDepth, [wallX, wallY, roomMin[2]], 1);
  mark(1, roomHeight, [wallX, roomMin[1] + offset / 3, wallZ], 0, { labelAxis: 0, labelOffset: 0.13 });

  const roomCenter = new THREE.Vector3().fromArray(roomMin).lerp(new THREE.Vector3().fromArray(roomMax), 0.5);
  for (const { id, name, dimensions, boxes } of items) {
    const frame = frames.get(id);
    const { min, max } = frame ? { min: frame.box.min.toArray(), max: frame.box.max.toArray() } : boxes[0];
    const [width, depthOrHeight, height] = dimensions;
    if (id === 'window' || id === 'doorway') {
      const z = id === 'window' ? min[2] - offset : max[2] + 2 * offset;
      const y = Math.max(min[1], roomMin[1] + offset);
      mark(0, width, [min[0], y, z], 1);
      mark(1, depthOrHeight, [max[0] - offset, y, z], 0, { labelAxis: 0, labelOffset: -0.13 });
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
    const top = max[1] + offset;
    const widthStart = [frontX, top, frontZ];
    widthStart[widthAxis] = min[widthAxis];
    mark(widthAxis, width, widthStart, depthAxis, { toWorld: frame?.toWorld, title: name });

    const depthStart = [frontX, top, frontZ];
    const nearMinDepth = depthAxis === 0 ? nearMinX : nearMinZ;
    depthStart[depthAxis] = nearMinDepth ? min[depthAxis] : max[depthAxis] - depthOrHeight * scale;
    mark(depthAxis, depthOrHeight, depthStart, widthAxis, { toWorld: frame?.toWorld });

    const side = nearMinX ? -1 : 1;
    const heightZ = frontZ + (nearMinZ ? 1 : -1) * 1.5 * offset;
    mark(1, height, [frontX + side * offset, Math.max(min[1], roomMin[1] + offset / 3), heightZ], 2,
      { labelAxis: 0, labelOffset: side * 0.12, toWorld: frame?.toWorld });
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
