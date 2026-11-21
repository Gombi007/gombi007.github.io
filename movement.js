const RADIUS = 0.15;
const SWEEP_STEP = 0.045;

export function canStand(x, z, room, obstacles) {
  if (x < room.min.x + RADIUS || x > room.max.x - RADIUS ||
      z < room.min.z + RADIUS || z > room.max.z - RADIUS) return false;

  return obstacles.every((box) => {
    const nearestX = Math.max(box.min.x, Math.min(x, box.max.x));
    const nearestZ = Math.max(box.min.z, Math.min(z, box.max.z));
    return (x - nearestX) ** 2 + (z - nearestZ) ** 2 >= RADIUS ** 2;
  });
}

export function move(position, yaw, side, forward, distance, room, obstacles) {
  const inputLength = Math.max(1, Math.hypot(side, forward));
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const dx = (cos * side - sin * forward) * distance / inputLength;
  const dz = (-sin * side - cos * forward) * distance / inputLength;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SWEEP_STEP));

  for (let step = 0; step < steps; step += 1) {
    const x = position.x + dx / steps;
    const z = position.z + dz / steps;
    if (canStand(x, position.z, room, obstacles)) position.x = x;
    if (canStand(position.x, z, room, obstacles)) position.z = z;
  }
}
