import { clamp, rectangleImpact } from "/shared/arena.js";
import { AnimatedSprites } from "./animated-sprites.js";

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const imageCache = new Map();
const motionReduced = matchMedia("(prefers-reduced-motion: reduce)");

function sprite(path) {
  if (!imageCache.has(path)) {
    const image = new Image();
    image.src = path;
    imageCache.set(path, image);
  }
  return imageCache.get(path);
}

export function preload(fighters) {
  for (const fighter of fighters) {
    sprite(fighter.sprite.path);
    for (const path of Object.values(fighter.sprite.states ?? {})) sprite(path);
  }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function line(ctx, x, y, tx, ty, color, width) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function star(ctx, x, y, size, color, points = 4) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = i * Math.PI / points - Math.PI / 2;
    const r = size * (i % 2 ? 0.35 : 1);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, width = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

const FURNITURE = {
  board: ["#466063", "#b4cfb6", "#f7f1d0"], podium: ["#773b42", "#d28d5b", "#ffbc71"],
  desk: ["#70404a", "#d99a64", "#f2bd7d"], chair: ["#574052", "#b88373", "#dfad8a"],
  table: ["#29494c", "#b3c896", "#e3d99a"], counter: ["#33454d", "#7fbcad", "#cde2cd"],
  bed: ["#38334e", "#7773ae", "#b2abd3"], locker: ["#342e4e", "#64648c", "#a6a6c2"]
};

function drawCover(ctx, box) {
  const { x, y, w, h, kind } = box;
  const [base, top, detail] = FURNITURE[kind] ?? FURNITURE.locker;
  const edge = "#282237";
  roundRect(ctx, x + 5, y + 10, w, h, 9, "#201a354d");
  roundRect(ctx, x, y - 3, w, h + 4, 7, base, edge, 4);
  roundRect(ctx, x + 3, y - 7, w - 6, h - 6, 6, top, base, 3);
  line(ctx, x + 8, y - 3, x + w - 8, y - 3, detail, 2);
  if (kind === "board") {
    roundRect(ctx, x + 7, y - 2, w - 14, h - 7, 3, "#fcf2d8");
    ctx.fillStyle = "#614054";
    ctx.font = "italic 900 17px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("POP QUIZ", x + w / 2, y + 16);
    return;
  }
  if (kind === "bed") {
    roundRect(ctx, x + 12, y + 5, 35, h - 26, 7, "#f1dfdb", base, 2);
    roundRect(ctx, x + 53, y + 3, w - 65, h - 22, 5, "#8d7cca", base, 2);
    line(ctx, x + 64, y + 7, x + 64, y + h - 23, detail, 3);
    return;
  }
  if (kind === "counter" || kind === "table") {
    const count = kind === "counter" ? 4 : 3;
    for (let i = 1; i <= count; i++) {
      const px = x + w * i / (count + 1);
      ellipse(ctx, px, y + h * 0.46, 15, 12, "#fff0c7", base, 2);
      ellipse(ctx, px, y + h * 0.46, 7, 5, i % 2 ? "#e4ab64" : "#ebcb87");
    }
    return;
  }
  if (kind === "desk" || kind === "podium") {
    roundRect(ctx, x + w * 0.36, y + h * 0.18, w * 0.28, h * 0.44, 3, "#f5deaa", base);
    for (let i = 1; i < 4; i++) line(ctx, x + w * 0.41, y + h * (0.2 + i / 10), x + w * 0.58,
      y + h * (0.2 + i / 10), "#af766d", 1.7);
    return;
  }
  if (kind === "locker") {
    for (let i = 1; i < 4; i++) {
      const px = x + w * i / 4;
      line(ctx, px, y + 1, px, y + h - 17, base, 2);
      line(ctx, px - 11, y + h * 0.45, px - 6, y + h * 0.45, detail, 2);
    }
    return;
  }
  line(ctx, x + 8, y + h * 0.55, x + w - 8, y + h * 0.55, base, 3);
}

function drawBush(ctx, { x, y, w, h, kind }) {
  if (kind === "blanket") {
    roundRect(ctx, x, y + 2, w, h, 12, "#3c3159", "#322a45", 3);
    roundRect(ctx, x, y, w, h - 6, 10, "#71608e", "#4f3e69", 3);
    for (let i = 14; i < w - 7; i += 13) line(ctx, x + i, y + 6, x + i + 3, y + h - 13, "#ae8fc784", 4);
    return;
  }
  roundRect(ctx, x + 4, y + 6, w, h, 18, "#25383269");
  roundRect(ctx, x, y, w, h, 18, "#3c6652", "#304e46", 3);
  for (let i = 0; i < 8; i++) {
    const px = x + w * (0.18 + (i % 4) * 0.21), py = y + h * (i < 4 ? 0.34 : 0.68);
    ellipse(ctx, px, py, w * 0.13, h * 0.18, i % 2 ? "#5b966a" : "#6ca871", "#416b58", 2);
  }
}

function buildCourt(map, image) {
  const { width, height, inset } = map.size;
  const { ground, edge, mark } = map.background;
  const tile = document.createElement("canvas");
  tile.width = width;
  tile.height = height;
  const ctx = tile.getContext("2d");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
  roundRect(ctx, 7, 7, width - 14, height - 14, 19, edge, "#211b2c", 5);
  const { size, colors, layout } = map.tiles;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, 8);
  ctx.clip();
  for (let row = 0, y = inset; y < height - inset; row++, y += size) {
    const pattern = layout[row % layout.length];
    for (let col = 0, x = inset; x < width - inset; col++, x += size) {
      ctx.fillStyle = colors[pattern[col % pattern.length]] ?? edge;
      ctx.fillRect(x, y, size, size);
    }
  }
  if (image?.naturalWidth) ctx.drawImage(image, inset, inset, width - inset * 2, height - inset * 2);
  ctx.restore();
  ctx.globalAlpha = 0.45;
  roundRect(ctx, inset + 15, inset + 15, width - inset * 2 - 30, height - inset * 2 - 30, 14, null, mark, 3);
  for (const [x, y] of map.spawns) {
    ellipse(ctx, x, y, 25, 22, null, mark, 2);
    star(ctx, x, y, 13, mark);
  }
  ctx.globalAlpha = 1;
  for (const hazard of map.hazards.filter(h => h.type === "slide")) {
    for (const z of hazard.zones) {
      ellipse(ctx, z.x + z.w / 2, z.y + z.h / 2, z.w / 2, z.h / 2, "#ad7249a9", "#d69965bc", 3);
      line(ctx, z.x + z.w * 0.27, z.y + z.h * 0.36, z.x + z.w * 0.63, z.y + z.h * 0.29, "#f1c49ba8", 4);
    }
  }
  for (const bush of map.bushes) drawBush(ctx, bush);
  for (const cover of map.obstacles) drawCover(ctx, cover);
  return tile;
}

export function drawMapPreview(canvas, map) {
  const paint = () => canvas.getContext("2d").drawImage(buildCourt(map, image), 0, 0, canvas.width, canvas.height);
  const image = map.background.path && sprite(map.background.path);
  paint();
  if (image && !image.complete) image.addEventListener("load", paint, { once: true });
}

export class ArenaView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.animations = new AnimatedSprites();
    this.poses = new Map();
    this.shots = new Map();
    this.camera = { x: 0, y: 0, scale: 1 };
  }

  reset() {
    this.animations.reset();
    this.poses.clear();
    this.shots.clear();
    this.camera = { x: 0, y: 0, scale: 1 };
  }

  setMap(map) {
    this.map = map;
    const image = map.background.path && sprite(map.background.path);
    this.court = buildCourt(map, image);
    if (image && !image.complete) image.addEventListener("load", () => {
      if (this.map === map) this.court = buildCourt(map, image);
    }, { once: true });
  }

  point(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y, scale } = this.camera;
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale };
  }

  pose(player, blend) {
    const old = this.poses.get(player.id) ?? player;
    const next = { x: mix(old.x, player.x, blend), y: mix(old.y, player.y, blend) };
    this.poses.set(player.id, next);
    return { ...player, ...next };
  }

  render(state, configs, self, aim, time, dt, localNow) {
    const { canvas, ctx } = this;
    if (!this.map) return;
    const { width: worldWidth, height: worldHeight } = this.map.size;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const blend = 1 - Math.exp(-dt * 24);
    for (const id of this.poses.keys()) {
      if (!state.players.some(player => player.id === id)) this.poses.delete(id);
    }
    const players = state.players.map(p => this.pose(p, blend));
    const me = players.find(p => p.id === self && p.hp);
    const focus = me ?? players.find(p => p.hp) ?? { x: worldWidth / 2, y: worldHeight / 2 };
    const fit = Math.min(width / worldWidth, height / worldHeight);
    const scale = width / height < 0.83 ? Math.max(fit, Math.min(width / (worldWidth * 0.47), height / worldHeight)) : fit;
    const center = (screen, world, pos) => world * scale <= screen
      ? (screen - world * scale) / 2 : clamp(screen / 2 - pos * scale, screen - world * scale, 0);
    const x = center(width, worldWidth, focus.x);
    const y = center(height, worldHeight, focus.y);
    this.camera = { x, y, scale };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.map.background.ground;
    ctx.fillRect(0, 0, width, height);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, worldWidth, worldHeight);
    ctx.clip();
    ctx.drawImage(this.court, 0, 0);
    this.drawMapFeatures(state, localNow);
    ctx.lineCap = "round";
    const age = Math.min(0.075, Math.max(0, localNow - state.now));
    const visibleShots = new Set(state.projectiles.map(shot => shot.id));
    for (const id of this.shots.keys()) {
      if (!visibleShots.has(id)) this.shots.delete(id);
    }
    for (const sticker of state.stickers) this.drawSticker(sticker);
    if (me && !state.result) this.drawAim(me, aim, configs[me.fighter]);
    for (const p of players.sort((a, b) => a.y - b.y)) {
      this.drawPlayer(p, configs[p.fighter], p.id === self ? aim.angle : p.angle, p.id === self, time);
    }
    for (const shot of state.projectiles) this.drawShot(shot, age, blend);
    for (const effect of state.effects) this.drawEffect(effect, localNow);
    ctx.restore();
  }

  drawMapFeatures(state, now) {
    const { ctx } = this;
    for (const hazard of this.map.hazards) {
      if (hazard.type !== "dark") continue;
      const pulse = motionReduced.matches ? 0 : Math.sin(now * 3.1) * Math.sin(now * 1.33);
      for (const [index, z] of hazard.zones.entries()) {
        ctx.globalAlpha = 0.28 + (index % 2 ? -pulse : pulse) * (hazard.flicker ?? 0) * 0.36;
        roundRect(ctx, z.x, z.y, z.w, z.h, 12, "#14152f");
      }
      ctx.globalAlpha = 1;
    }
    for (const q of state.quizzes) {
      const active = now >= q.liveAt;
      if (!active) ctx.setLineDash([9, 8]);
      roundRect(ctx, q.x, q.y, q.w, q.h, 14, active ? "#e44b6773" : "#ffd66f34",
        active ? "#ffc1ba" : "#ffe08c", 4);
      ctx.setLineDash([]);
      ctx.fillStyle = active ? "#fff0dc" : "#ffe498";
      ctx.font = "900 22px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(active ? "POP QUIZ!" : "QUIZ INCOMING", q.x + q.w / 2, q.y + q.h / 2 + 7, q.w - 12);
    }
    for (const p of state.pickups) {
      ellipse(ctx, p.x, p.y + 4, 23, 13, "#2d23375f", "#ffe1a8", 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.type === "heal") {
        ctx.beginPath();
        ctx.moveTo(0, -21);
        ctx.lineTo(17, 4);
        ctx.quadraticCurveTo(0, 13, -17, 4);
        ctx.closePath();
        ctx.fillStyle = "#ffc16b";
        ctx.strokeStyle = "#673e46";
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();
        star(ctx, 0, 0, 6, "#fff1b4");
      } else {
        roundRect(ctx, -10, -18, 20, 23, 4, "#efab7e", "#633f47", 3);
        roundRect(ctx, -12, -22, 24, 6, 3, "#fff4ca", "#633f47", 2);
        line(ctx, -6, -7, 6, -7, "#fff4ca", 3);
      }
      ctx.restore();
    }
  }

  drawAim(p, aim, fighter) {
    const { ctx } = this;
    const range = fighter.attack.range ?? 52 * fighter.stats.range + 3;
    const x = Math.cos(aim.angle), y = Math.sin(aim.angle);
    const end = { x: p.x + x * range, y: p.y + y * range };
    const reach = Math.min(1, ...this.map.obstacles.map(box => rectangleImpact(p, end, box, 7))) * range;
    ctx.setLineDash([9, 10]);
    if (reach > 36) line(ctx, p.x + x * 36, p.y + y * 36, p.x + x * reach, p.y + y * reach, "#f4f9f688", 2.5);
    ctx.setLineDash([]);
    if (p.charge >= 100 && fighter.super.type === "lob") {
      const r = Math.min(fighter.super.range, aim.reach);
      const { inset, width, height } = this.map.size;
      const px = clamp(p.x + x * r, inset, width - inset);
      const py = clamp(p.y + y * r, inset, height - inset);
      ellipse(ctx, px, py, 11, 11, null, "#ffe69d", 2.5);
    }
  }

  drawSticker(sticker) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(sticker.x, sticker.y);
    ctx.rotate(sticker.id * 0.63);
    const side = sticker.r * 1.27;
    roundRect(ctx, -side / 2, -side / 2, side, side, 7, "#f4a0bf", "#643b62", 3.5);
    star(ctx, 0, 0, side * 0.36, "#fff1ab", 5);
    ctx.restore();
  }

  drawPlayer(p, config, angle, local, time) {
    const { ctx } = this;
    const reduced = motionReduced.matches;
    const shadowColor = local ? "#9cffe9" : p.color;
    ctx.save();
    if (p.hidden) ctx.globalAlpha = 0.64;
    ctx.translate(p.x, p.y);
    ellipse(ctx, 0, 5, 27, 13, "#1725369b");
    if (p.hp) ellipse(ctx, 0, 3, 25, 11, local ? "#1f8e83" : "#292b44", shadowColor, 3);
    if (p.boosted) star(ctx, 23, -7, 10, "#ffe68a");
    const stateImage = config.sprite.states?.[p.state];
    const image = sprite(stateImage ?? config.sprite.path);
    const walk = !reduced && !stateImage && p.state === "walk";
    const bob = reduced ? 0 : walk ? Math.abs(Math.sin(time * 13)) * 5 : Math.sin(time * 4 + p.x) * 1.2;
    ctx.save();
    const direction = p.state === "walk" && Number.isFinite(p.moveAngle) ? p.moveAngle : angle;
    const animated = this.animations.draw(ctx, p, config.sprite, direction, time, reduced);
    if (!animated) {
      ctx.translate(0, -4 - bob);
      if (!stateImage && p.state === "defeated") { ctx.rotate(-1.05); ctx.globalAlpha = 0.44; ctx.scale(0.81, 0.81); }
      else if (!stateImage && p.state === "hurt") { ctx.rotate(0.18); ctx.filter = "brightness(1.35)"; }
      else if (!stateImage && p.state === "attack") { ctx.rotate(0.13 * Math.sign(Math.cos(angle))); ctx.scale(1.07, 0.94); }
      else if (!stateImage && p.state === "super") ctx.scale(1.17, 1.13);
      else if (walk) ctx.rotate(Math.sin(time * 13) * 0.10);
      if (p.napping) ctx.scale(1.04, 0.89);
      if (Math.cos(angle) < -0.15) ctx.scale(-1, 1);
      if (image.complete && image.naturalWidth) {
        const h = 84, w = h * image.naturalWidth / image.naturalHeight;
        ctx.drawImage(image, -w / 2, -h + 9, w, h);
      } else {
        ellipse(ctx, 0, -23, 24, 31, config.color, "#251e34", 4);
      }
    }
    ctx.restore();
    if (p.hp) {
      const bar = this.camera.y + (p.y - 101) * this.camera.scale < 38 ? 33 : -78;
      roundRect(ctx, -27, bar, 54, 7, 3, "#252139", "#191527", 2);
      roundRect(ctx, -26, bar + 1, Math.max(1, 52 * p.hp / p.maxHp), 5, 2, shadowColor);
      ctx.font = "800 16px system-ui";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#211932";
      ctx.lineWidth = 4;
      ctx.strokeText(p.name, 0, bar - 7, 185);
      ctx.fillStyle = "#fff7e9";
      ctx.fillText(p.name, 0, bar - 7, 185);
      if (p.napping || p.stunned || p.charge >= 100) {
        const icon = p.napping ? "zZ" : p.stunned ? "✶" : "✦";
        ctx.font = "900 20px system-ui";
        ctx.strokeText(icon, 0, bar - 25);
        ctx.fillStyle = p.napping ? "#b8e4ff" : "#ffe484";
        ctx.fillText(icon, 0, bar - 25);
      }
    }
    ctx.restore();
  }

  drawShot(shot, age, blend) {
    const { ctx } = this;
    const old = this.shots.get(shot.id) ?? shot;
    const x = mix(old.x, shot.x + shot.vx * age, blend);
    const y = mix(old.y, shot.y + shot.vy * age, blend);
    this.shots.set(shot.id, { x, y });
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(shot.vy, shot.vx) + x * 0.037);
    ellipse(ctx, 0, 0, 11, 7, "#fff0c8", "#8c5b48", 2);
    ellipse(ctx, -3, -1, 2.2, 1.6, "#d79c63");
    ellipse(ctx, 3, 2, 1.9, 1.3, "#d79c63");
    ctx.restore();
  }

  drawEffect(e, now) {
    const { ctx } = this;
    const t = clamp((now - e.born) / (e.until - e.born), 0, 1);
    ctx.save();
    if (e.type === "lob") {
      ellipse(ctx, e.tx, e.ty, e.r, e.r, "#ffedbd38", "#ffe7ad", 2);
      const x = mix(e.x, e.tx, t), y = mix(e.y, e.ty, t);
      ellipse(ctx, x, y + 1, 20, 9, "#27223e88");
      ellipse(ctx, x, y - Math.sin(t * Math.PI) * 73 - 9, 24, 18, "#fff5dd", "#bb835b", 3);
    } else if (e.type === "burst") {
      ctx.globalAlpha = 1 - t;
      ellipse(ctx, e.x, e.y, e.r * (0.5 + 0.55 * t), e.r * (0.5 + 0.55 * t), "#ffedb27f", "#fff7de", 6);
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7;
        star(ctx, e.x + Math.cos(a) * e.r * t, e.y + Math.sin(a) * e.r * t, 12, "#ffda8d");
      }
    } else if (e.type === "beam") {
      ctx.globalAlpha = 1 - t * 0.87;
      line(ctx, e.x, e.y, e.tx, e.ty, "#65335c", 43 - t * 16);
      line(ctx, e.x, e.y, e.tx, e.ty, "#ff6c9e", 28 - t * 14);
      line(ctx, e.x, e.y, e.tx, e.ty, "#fff0d5", 12 - t * 8);
      star(ctx, e.x, e.y, 31 - t * 20, "#fff1c6");
    } else if (e.type === "slam") {
      ctx.globalAlpha = 1 - t;
      const mx = mix(e.x, e.tx, 0.53), my = mix(e.y, e.ty, 0.53) - 14;
      line(ctx, e.x, e.y - 20, mx, my, "#212039", 16);
      line(ctx, mx, my, e.tx, e.ty, "#212039", 16);
      line(ctx, e.x, e.y - 20, mx, my, "#9e9cb4", 9);
      line(ctx, mx, my, e.tx, e.ty, "#9e9cb4", 9);
      ellipse(ctx, mx, my, 8, 8, "#8dffe3", "#22233d", 3);
      star(ctx, e.tx, e.ty, e.hit ? 24 : 12, "#ffdb7c", 5);
    } else if (e.type === "hit") {
      ctx.globalAlpha = 1 - t;
      star(ctx, e.x + 12, e.y - 24, 19 * (1 - t), "#fff0b5", 5);
      ctx.font = "900 26px system-ui";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#372039";
      ctx.lineWidth = 5;
      ctx.strokeText(e.damage, e.x + 19, e.y - 65 - t * 38);
      ctx.fillStyle = "#ffe5a1";
      ctx.fillText(e.damage, e.x + 19, e.y - 65 - t * 38);
    }
    ctx.restore();
  }
}

