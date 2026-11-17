import { WIDTH, HEIGHT, INSET, BUMPERS, clamp } from "/shared/arena.js";

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

function buildCourt() {
  const tile = document.createElement("canvas");
  tile.width = WIDTH;
  tile.height = HEIGHT;
  const ctx = tile.getContext("2d");
  ctx.fillStyle = "#25223b";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  roundRect(ctx, 7, 9, WIDTH - 14, HEIGHT - 15, 22, "#17162b");
  roundRect(ctx, 9, 5, WIDTH - 18, HEIGHT - 19, 21, "#44375b", "#5a4b73", 3);
  roundRect(ctx, 17, 14, WIDTH - 34, HEIGHT - 34, 14, "#27243f");
  roundRect(ctx, INSET, INSET, WIDTH - INSET * 2, HEIGHT - INSET * 2, 6, "#366582", "#211e39", 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(INSET + 3, INSET + 3, WIDTH - 2 * (INSET + 3), HEIGHT - 2 * (INSET + 3));
  ctx.clip();
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 19; col++) {
      const x = 29 + col * 59, y = 29 + row * 59;
      ctx.fillStyle = (col + row) % 2 ? "#3f6e88" : "#426f8b";
      ctx.fillRect(x, y, 59, 59);
      if ((col * 17 + row * 13) % 9 < 3) {
        star(ctx, x + 32, y + 29, 3.5, "#6894a5");
        ctx.fillStyle = "#678da0";
        ctx.fillRect(x + 40, y + 23, 2, 2);
      }
    }
  }
  ctx.globalAlpha = 0.42;
  roundRect(ctx, 64, 62, WIDTH - 128, HEIGHT - 124, 26, null, "#9ec9c7", 4);
  line(ctx, WIDTH / 2, 64, WIDTH / 2, HEIGHT - 64, "#a4d2d0", 3);
  ellipse(ctx, WIDTH / 2, HEIGHT / 2, 143, 143, null, "#a4d2d0", 4);
  ctx.beginPath();
  ctx.arc(64, HEIGHT / 2, 133, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(WIDTH - 64, HEIGHT / 2, 133, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  for (const x of [128, WIDTH - 128]) {
    star(ctx, x, HEIGHT / 2, 33, "#93bfbb");
    ellipse(ctx, x, HEIGHT / 2, 48, 48, null, "#a4d2d0", 3);
  }
  ctx.restore();
  for (let x = 85; x < WIDTH - 65; x += 90) {
    roundRect(ctx, x, 15, 39, 6, 2, "#8970ad");
    roundRect(ctx, x, HEIGHT - 27, 39, 6, 2, "#8970ad");
  }
  for (const b of BUMPERS) {
    ellipse(ctx, b.x + 5, b.y + 9, b.r + 6, b.r + 4, "#2126446e");
    ellipse(ctx, b.x, b.y, b.r, b.r, "#332640", "#231c32", 5);
    ellipse(ctx, b.x, b.y - 9, b.r - 1, b.r - 6, "#d08845", "#29213a", 4);
    ellipse(ctx, b.x, b.y - 13, b.r - 5, b.r - 11, "#ffce68", "#985c4e", 3);
    ellipse(ctx, b.x, b.y - 13, b.r - 11, b.r - 17, "#e6a84e", "#ffd983", 3);
    star(ctx, b.x, b.y - 13, b.r * 0.5, "#ffda85");
    for (const sign of [-1, 1]) {
      ellipse(ctx, b.x + sign * b.r * 0.58, b.y - 13, 3.5, 3.5, "#633b49");
    }
  }
  return tile;
}

export class ArenaView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.court = buildCourt();
    this.poses = new Map();
    this.shots = new Map();
    this.camera = { x: 0, y: 0, scale: 1 };
  }

  reset() {
    this.poses.clear();
    this.shots.clear();
    this.camera = { x: 0, y: 0, scale: 1 };
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
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const blend = 1 - Math.exp(-dt * 24);
    const players = state.players.map(p => this.pose(p, blend));
    const me = players.find(p => p.id === self && p.hp);
    const focus = me ?? players.find(p => p.hp) ?? { x: WIDTH / 2, y: HEIGHT / 2 };
    const fit = Math.min(width / WIDTH, height / HEIGHT);
    const scale = width / height < 0.83 ? Math.max(fit, Math.min(width / 525, height / 680)) : fit;
    const center = (screen, world, pos) => world * scale <= screen
      ? (screen - world * scale) / 2 : clamp(screen / 2 - pos * scale, screen - world * scale, 0);
    const x = center(width, WIDTH, focus.x);
    const y = center(height, HEIGHT, focus.y);
    this.camera = { x, y, scale };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#25223b";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.drawImage(this.court, 0, 0);
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
  }

  drawAim(p, aim, fighter) {
    const { ctx } = this;
    const range = fighter.attack.range ?? 52 * fighter.stats.range + 3;
    const x = Math.cos(aim.angle), y = Math.sin(aim.angle);
    ctx.setLineDash([9, 10]);
    line(ctx, p.x + x * 36, p.y + y * 36, p.x + x * range, p.y + y * range, "#f4f9f688", 2.5);
    ctx.setLineDash([]);
    if (p.charge >= 100 && fighter.super.type === "lob") {
      const r = Math.min(fighter.super.range, aim.reach);
      const px = clamp(p.x + x * r, INSET, WIDTH - INSET);
      const py = clamp(p.y + y * r, INSET, HEIGHT - INSET);
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
    ctx.translate(p.x, p.y);
    ellipse(ctx, 0, 5, 27, 13, "#1725369b");
    if (p.hp) ellipse(ctx, 0, 3, 25, 11, local ? "#1f8e83" : "#292b44", shadowColor, 3);
    const stateImage = config.sprite.states?.[p.state];
    const image = sprite(stateImage ?? config.sprite.path);
    const walk = !reduced && !stateImage && p.state === "walk";
    const bob = reduced ? 0 : walk ? Math.abs(Math.sin(time * 13)) * 5 : Math.sin(time * 4 + p.x) * 1.2;
    ctx.save();
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

