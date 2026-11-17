import { clearPath, distance, inside, onFloor, PLAYER_RADIUS } from "./arena.js";

const gridCache = new WeakMap();
const STEP = 37;
const PAD = PLAYER_RADIUS + 2;

function grid(map) {
  const cached = gridCache.get(map);
  if (cached) return cached;
  const { inset, width, height } = map.size;
  const columns = Math.ceil(width / STEP);
  const rows = Math.ceil(height / STEP);
  const nodes = Array.from({ length: columns * rows }, (_, index) => {
    const x = (index % columns + 0.5) * STEP;
    const y = (Math.floor(index / columns) + 0.5) * STEP;
    const p = { x, y, index, neighbors: [] };
    return onFloor(p, { inset, width, height }, PAD) && !map.obstacles.some(box => inside(p, box, PAD))
      ? p : null;
  });
  for (const [i, node] of nodes.entries()) {
    if (!node) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = i % columns + dx, y = Math.floor(i / columns) + dy;
      const adjacent = x >= 0 && x < columns && nodes[y * columns + x];
      if (adjacent && clearPath(map, node, adjacent, PAD)) node.neighbors.push(adjacent);
    }
  }
  gridCache.set(map, nodes);
  return nodes;
}

function nearestNode(map, nodes, p) {
  let best;
  let d = Infinity;
  for (const node of nodes) {
    if (!node) continue;
    const gap = distance(p, node);
    if (gap < d && clearPath(map, p, node, PLAYER_RADIUS)) {
      d = gap;
      best = node;
    }
  }
  return best;
}

export function nextWaypoint(map, from, to) {
  if (clearPath(map, from, to, PLAYER_RADIUS)) return to;
  const nodes = grid(map);
  const start = nearestNode(map, nodes, from);
  const goal = nearestNode(map, nodes, to);
  if (!start || !goal) return null;
  const cameFrom = new Map([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length && !cameFrom.has(goal); i++) {
    for (const neighbor of queue[i].neighbors) {
      if (cameFrom.has(neighbor)) continue;
      cameFrom.set(neighbor, queue[i]);
      queue.push(neighbor);
    }
  }
  if (!cameFrom.has(goal)) return null;
  for (let node = goal; node; node = cameFrom.get(node)) {
    if (distance(from, node) > 5 && clearPath(map, from, node, PLAYER_RADIUS)) return node;
  }
  return null;
}

export function findCover(map, player, enemy) {
  let cover;
  let closest = 220;
  for (const point of grid(map)) {
    if (!point) continue;
    const d = distance(player, point);
    if (d < 28 || d >= closest || clearPath(map, enemy, point, 8) ||
        !clearPath(map, player, point, PLAYER_RADIUS)) continue;
    cover = point;
    closest = d;
  }
  return cover;
}
