import * as THREE from 'three';

const ink = 0xffdf40;
const furnitureWidthAxis = { bed: 2, wardrobe: 2, cabinet: 2, desk: 2, heater: 0, shelves: 0 };

export function createMeasurementLayer({ scale, items }) {
  const group = new THREE.Group();
  group.name = 'Measurements';
  group.visible = false;
  const segments = [];
  const labels = [];
  const offset = 0.03 * scale;
  const tick = 0.028 * scale;
  const labelHeight = 0.095 * scale;

  function mark(axis, value, start, tickAxis, labelAxis = 1, labelOffset = 0.071) {
    const end = [...start];
    end[axis] += value * scale;
    segments.push([start, end]);
    for (const point of [start, end]) {
      const a = [...point];
      const b = [...point];
      a[tickAxis] -= tick;
      b[tickAxis] += tick;
      segments.push([a, b]);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false,
    }));
    label.position.fromArray(start);
    label.position.setComponent(axis, (start[axis] + end[axis]) / 2);
    label.position.setComponent(labelAxis, label.position.getComponent(labelAxis) + labelOffset * scale);
    label.scale.set(labelHeight * canvas.width / canvas.height, labelHeight, 1);
    group.add(label);
    labels.push({ canvas, context, texture, value });
  }

  const room = items.find(({ id }) => id === 'room');
  const { min: roomMin, max: roomMax } = room.boxes[0];
  const [roomWidth, roomDepth, roomHeight] = room.dimensions;
  const wallX = roomMin[0] + 2 * offset;
  const wallZ = roomMax[2] - 2 * offset;
  const wallY = roomMax[1] - 3 * offset;
  mark(0, roomWidth, [roomMin[0], wallY, wallZ], 1);
  mark(2, roomDepth, [wallX, wallY, roomMin[2]], 1);
  mark(1, roomHeight, [wallX, roomMin[1] + offset / 3, wallZ], 0, 0, 0.13);

  const roomCenterX = (roomMin[0] + roomMax[0]) / 2;
  const roomCenterZ = (roomMin[2] + roomMax[2]) / 2;
  for (const { id, dimensions, boxes: [{ min, max }] } of items) {
    const [width, depthOrHeight, height] = dimensions;
    if (id === 'window' || id === 'doorway') {
      const z = id === 'window' ? min[2] - offset : max[2] + 2 * offset;
      const y = Math.max(min[1], roomMin[1] + offset);
      mark(0, width, [min[0], y, z], 1);
      mark(1, depthOrHeight, [max[0] - offset, y, z], 0, 0, -0.13);
      continue;
    }

    const widthAxis = furnitureWidthAxis[id];
    if (widthAxis === undefined) continue;
    const depthAxis = widthAxis === 0 ? 2 : 0;
    const nearMinX = (min[0] + max[0]) / 2 > roomCenterX;
    const nearMinZ = (min[2] + max[2]) / 2 > roomCenterZ;
    const frontX = nearMinX ? min[0] : max[0];
    const frontZ = nearMinZ ? min[2] : max[2];
    const top = max[1] + offset;
    const widthStart = [frontX, top, frontZ];
    widthStart[widthAxis] = min[widthAxis];
    mark(widthAxis, width, widthStart, widthAxis === 0 ? 2 : 0);

    const depthStart = [frontX, top, frontZ];
    const nearMinDepth = depthAxis === 0 ? nearMinX : nearMinZ;
    depthStart[depthAxis] = nearMinDepth ? min[depthAxis] : max[depthAxis] - depthOrHeight * scale;
    mark(depthAxis, depthOrHeight, depthStart, widthAxis);

    const side = nearMinX ? -1 : 1;
    const heightZ = frontZ + (nearMinZ ? 1 : -1) * 1.5 * offset;
    mark(1, height, [frontX + side * offset, Math.max(min[1], roomMin[1] + offset / 3), heightZ],
      2, 0, side * 0.12);
  }

  const strokes = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0045 * scale, 0.0045 * scale, 1, 8),
    new THREE.MeshBasicMaterial({ color: ink, toneMapped: false }),
    segments.length,
  );
  const yAxis = new THREE.Vector3(0, 1, 0);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const transform = new THREE.Object3D();
  segments.forEach(([a, b], index) => {
    start.fromArray(a);
    end.fromArray(b);
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
    for (const { canvas, context, texture, value } of labels) {
      const caption = `${format.format(value)} m`;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = '700 43px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = 8;
      context.strokeStyle = '#191813';
      context.fillStyle = '#ffdf40';
      context.strokeText(caption, canvas.width / 2, canvas.height / 2 + 2);
      context.fillText(caption, canvas.width / 2, canvas.height / 2 + 2);
      texture.needsUpdate = true;
    }
  }

  return { group, setLanguage };
}
