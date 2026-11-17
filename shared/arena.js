export const PLAYER_RADIUS = 22;
export const LIMIT = 5;
export const ROUND_SECONDS = 120;

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const inside = (p, box, padding = 0) =>
  p.x > box.x - padding && p.x < box.x + box.w + padding &&
  p.y > box.y - padding && p.y < box.y + box.h + padding;
export const insideEllipse = (p, box) =>
  ((p.x - box.x) / box.w * 2 - 1) ** 2 + ((p.y - box.y) / box.h * 2 - 1) ** 2 < 1;
export const onFloor = (p, { width, height, inset }, padding = 0) =>
  p.x >= inset + padding && p.x <= width - inset - padding &&
  p.y >= inset + padding && p.y <= height - inset - padding;

export function rectangleImpact(start, end, box, padding = 0) {
  let first = 0;
  let last = 1;
  for (const [axis, size] of [["x", "w"], ["y", "h"]]) {
    const low = box[axis] - padding;
    const high = box[axis] + box[size] + padding;
    const delta = end[axis] - start[axis];
    if (!delta) {
      if (start[axis] <= low || start[axis] >= high) return Infinity;
      continue;
    }
    const a = (low - start[axis]) / delta;
    const b = (high - start[axis]) / delta;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first >= last) return Infinity;
  }
  return first;
}

export function clearPath(map, start, end, padding = 0) {
  return map.obstacles.every(box => rectangleImpact(start, end, box, padding) === Infinity);
}

export function pickMap(maps, choice) {
  return maps.find(map => map.id === choice) ?? maps[Math.floor(Math.random() * maps.length)];
}
export const collideSegment = (start, end, circle, radius) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ox = start.x - circle.x;
  const oy = start.y - circle.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  const b = ox * dx + oy * dy;
  const discriminant = b * b - a * c;
  if (!a || discriminant < 0) return Infinity;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : Infinity;
};
