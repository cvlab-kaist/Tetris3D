const subtract = (a, b) => a.map((value, index) => value - b[index]);
const rotateY = ([x, y, z], angle) => [
  Math.cos(angle) * x + Math.sin(angle) * z,
  y,
  -Math.sin(angle) * x + Math.cos(angle) * z,
];
const frame = (base) => {
  const offset = subtract(base.position, base.target);
  return { yaw: Math.atan2(offset[0], offset[2]), distance: Math.max(Math.hypot(...offset), 1e-6) };
};

// Share camera motion about each frame's fitted target. Only cameras move;
// native mesh coordinates and the common world display transform stay intact.
export function linkView(view, base) {
  const { yaw, distance } = frame(base);
  const normalize = (point) => rotateY(subtract(point, base.target), -yaw).map((value) => value / distance);
  return { ...view, position: normalize(view.position), target: normalize(view.target), up: rotateY(view.up, -yaw) };
}

export function unlinkView(view, base) {
  const { yaw, distance } = frame(base);
  const restore = (point) => rotateY(point, yaw).map((value, index) => value * distance + base.target[index]);
  return { ...view, position: restore(view.position), target: restore(view.target), up: rotateY(view.up, yaw) };
}
