import * as THREE from 'three';

const BODY_RADIUS = 0.34;
const LOW_FURNITURE_RADIUS = 0.25;
const SWEEP_STEP = 0.045;
const positionInBoxFrame = new THREE.Vector3();

export function canStand(x, z, room, obstacles, scale = 1) {
  const bodyRadius = BODY_RADIUS * scale;
  if (x < room.min.x + bodyRadius || x > room.max.x - bodyRadius ||
      z < room.min.z + bodyRadius || z > room.max.z - bodyRadius) return false;

  return obstacles.every((obstacle) => {
    const { box = obstacle, toLocal } = obstacle;
    positionInBoxFrame.set(x, 0, z);
    if (toLocal) positionInBoxFrame.applyMatrix4(toLocal);
    const { x: localX, z: localZ } = positionInBoxFrame;
    const nearestX = Math.max(box.min.x, Math.min(localX, box.max.x));
    const nearestZ = Math.max(box.min.z, Math.min(localZ, box.max.z));
    // Use shoulder clearance for walls and tall furniture, and a narrower footprint below waist height.
    const radius = box.max.y > scale ? bodyRadius : LOW_FURNITURE_RADIUS * scale;
    return (localX - nearestX) ** 2 + (localZ - nearestZ) ** 2 >= radius ** 2;
  });
}

export function move(position, yaw, side, forward, distance, room, obstacles, scale = 1) {
  const inputLength = Math.max(1, Math.hypot(side, forward));
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const dx = (cos * side - sin * forward) * distance / inputLength;
  const dz = (-sin * side - cos * forward) * distance / inputLength;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (SWEEP_STEP * scale)));

  for (let step = 0; step < steps; step += 1) {
    const x = position.x + dx / steps;
    const z = position.z + dz / steps;
    if (canStand(x, position.z, room, obstacles, scale)) position.x = x;
    if (canStand(position.x, z, room, obstacles, scale)) position.z = z;
  }
}
