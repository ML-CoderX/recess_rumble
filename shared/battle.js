import { PLAYER_RADIUS as R, LIMIT, ROUND_SECONDS, clamp, distance, collideSegment,
  rectangleImpact, clearPath, inside, onFloor } from "./arena.js";
import { findCover, nextWaypoint } from "./navigation.js";

const BOT_NAMES = ["Bot Sleepyhead", "Bot Stickerman", "Bot Lunchbox", "Bot Hall Monitor"];
const DIFFICULTIES = {
  easy: { reaction: 0.38, aim: 0.38, superDelay: 0.68, dodge: 0 },
  medium: { reaction: 0.17, aim: 0.16, superDelay: 0.24, dodge: 0.22 },
  hard: { reaction: 0.07, aim: 0.045, superDelay: 0.06, dodge: 0.36 }
};
const PALETTE = ["#58f6ce", "#ff747f", "#a693ff", "#ffe35c", "#82d4ff"];
const stepToward = (p, angle, length) => ({
  x: p.x + Math.cos(angle) * length, y: p.y + Math.sin(angle) * length
});
const closest = (origin, players) => players.reduce((best, p) =>
  !best || distance(p, origin) < distance(best, origin) ? p : best, null);
const moveRange = (fighter, move) => move.range ?? 52 * fighter.stats.range + 3;
const canWalk = (map, p, angle, length) => {
  const end = stepToward(p, angle, length);
  return onFloor(end, map.size, R) && clearPath(map, p, end, R);
};
const interval = ([min, max]) => min + Math.random() * (max - min);

export const neutralInput = () => ({ x: 0, y: 0, angle: 0, reach: 300, fire: false,
  attack: false, super: false });

export class Battle {
  constructor(members, fighters, fillBots, now, map, difficulty = "medium") {
    this.map = map;
    const { width, height } = map.size;
    this.startsAt = now + 3;
    this.endsAt = this.startsAt + ROUND_SECONDS;
    this.pickups = map.pickups.map(pickup => ({ ...pickup, readyAt: 0 }));
    this.quizzes = map.hazards.filter(hazard => hazard.type === "quiz").map(config => ({
      config, zone: null, warningAt: this.startsAt + interval(config.interval),
      nextHit: Infinity, liveAt: Infinity, endsAt: Infinity
    }));
    this.difficulty = Object.hasOwn(DIFFICULTIES, difficulty) ? DIFFICULTIES[difficulty] : DIFFICULTIES.medium;
    const roster = [...members];
    const ids = Object.keys(fighters);
    if (fillBots) {
      for (let i = 0; roster.length < LIMIT; i++) roster.push({
        id: "bot-" + i, name: BOT_NAMES[i], fighter: ids[Math.floor(Math.random() * ids.length)], bot: true
      });
    }
    this.players = roster.map((member, slot) => {
      const [x, y] = map.spawns[slot];
      const config = fighters[member.fighter];
      const hp = config.stats.health * 100;
      return { ...member, config, x, y, hp, maxHp: hp, color: PALETTE[slot],
        angle: Math.atan2(height / 2 - y, width / 2 - x), input: neutralInput(),
        charge: 0, kos: 0, cooldown: 0, stunUntil: 0, lastInput: now,
        lastActive: now + 3, actionUntil: 0, hurtUntil: 0,
        nextSticker: now + 3 + (config.passive?.delay ?? 0),
        moving: false, napping: false, action: "idle", botThink: now, botSuperAt: null,
        vx: 0, vy: 0, boostUntil: 0, boost: 1, revealedUntil: 0, roam: slot
      };
    });
    this.projectiles = [];
    this.stickers = [];
    this.lobs = [];
    this.effects = [];
    this.feed = [];
    this.audioEvents = [];
    this.serial = 0;
    this.result = null;
  }

  input(id, value, now) {
    const p = this.players.find(p => p.id === id);
    if (!p?.hp || p.bot || !value || typeof value !== "object") return;
    const number = (n, fallback) => typeof n === "number" && Number.isFinite(n) ? n : fallback;
    p.input = {
      x: clamp(number(value.x, 0), -1, 1), y: clamp(number(value.y, 0), -1, 1),
      angle: clamp(number(value.angle, p.angle), -Math.PI, Math.PI),
      reach: clamp(number(value.reach, 300), 0, Math.max(this.map.size.width, this.map.size.height)),
      fire: value.fire === true,
      attack: p.input.attack || value.attack === true,
      super: p.input.super || value.super === true
    };
    p.lastInput = now;
  }

  remove(id, now, takeover = false) {
    const p = this.players.find(p => p.id === id);
    if (!p || p.bot || this.result) return;
    if (takeover && p.hp) {
      const name = p.name;
      p.name = "Bot " + name;
      p.bot = true;
      p.input = { ...neutralInput(), angle: p.angle };
      p.botThink = now;
      p.botSuperAt = null;
      this.addFeed(now, { text: name + " disconnected · bot took over" });
      return;
    }
    this.addFeed(now, { text: p.name + " left the arena" });
    this.players = this.players.filter(other => other !== p);
    this.projectiles = this.projectiles.filter(shot => shot.owner !== p);
    this.lobs = this.lobs.filter(lob => lob.owner !== p);
    this.stickers = this.stickers.filter(sticker => sticker.owner !== id);
    this.checkWinner(now);
  }

  addFeed(now, entry) {
    this.feed.push({ ...entry, id: ++this.serial, until: now + 7 });
    this.feed = this.feed.slice(-5);
  }

  effect(now, duration, event) {
    this.effects.push({ id: ++this.serial, born: now, until: now + duration, ...event });
  }

  audio(type, player, now, details = {}) {
    this.audioEvents.push({
      id: ++this.serial, at: now, type, player: player.id, fighter: player.fighter,
      x: player.x, y: player.y, ...details
    });
  }

  damage(owner, target, amount, now, charge = 0, stun = 0, source = "attack") {
    if (!target.hp) return;
    const damage = Math.round(amount * (target.napping ? target.config.passive.vulnerability : 1));
    target.hp = Math.max(0, target.hp - damage);
    target.hurtUntil = now + 0.23;
    target.stunUntil = Math.max(target.stunUntil, now + stun);
    target.lastActive = now;
    target.revealedUntil = now + 0.85;
    target.napping = false;
    if (owner) {
      const wasReady = owner.charge === 100;
      owner.charge = Math.min(100, owner.charge + charge);
      if (!wasReady && owner.charge === 100 && owner.hp) this.audio("ready", owner, now);
    }
    this.audio("hit", target, now, { attacker: owner?.fighter, source, heavy: source === "super" || damage >= 165, stun: stun > 0 });
    this.effect(now, 0.65, { type: "hit", x: target.x, y: target.y, damage });
    if (!target.hp) {
      if (owner) owner.kos++;
      target.moving = false;
      this.audio("ko", target, now);
      this.addFeed(now, { text: owner ? owner.name + " KO’d " + target.name : target.name + " flunked the quiz",
        voice: target.config.voiceLines?.defeated, speaker: target.id });
    }
  }

  use(p, move, now, isSuper, enemies) {
    const { width, height, inset } = this.map.size;
    const { angle } = p.input;
    const origin = { x: p.x, y: p.y };
    const range = moveRange(p.config, move);
    const damage = move.damage ?? 14 * p.config.stats.damage;
    const charge = isSuper ? 0 : move.charge ?? 25;
    const rayEnd = stepToward(p, angle, range);
    this.audio(isSuper ? "super" : "attack", p, now);
    if (isSuper) {
      p.charge = 0;
      const voice = p.config.voiceLines?.super;
      if (voice) this.addFeed(now, { text: p.name + " · " + move.name, voice, speaker: p.id });
    } else {
      p.cooldown = now + move.cooldown;
    }
    p.actionUntil = now + (isSuper ? 0.52 : 0.25);
    p.action = isSuper ? "super" : "attack";
    p.napping = false;
    p.lastActive = now;
    p.revealedUntil = now + 0.9;

    switch (move.type) {
      case "projectile":
        this.projectiles.push({ id: ++this.serial, owner: p, ...origin,
          vx: Math.cos(angle) * move.speed, vy: Math.sin(angle) * move.speed,
          remaining: range, damage, charge });
        break;
      case "slam": {
        const target = closest(p, enemies.filter(other =>
          distance(p, other) <= range + R && clearPath(this.map, p, other)));
        const end = target ?? stepToward(p, angle, range * 0.56);
        if (target) {
          p.angle = Math.atan2(target.y - p.y, target.x - p.x);
          this.audio("grab", p, now, { x: target.x, y: target.y });
          this.damage(p, target, damage, now, charge, 0.16);
        }
        this.effect(now, 0.31, { type: "slam", ...origin, tx: end.x, ty: end.y, hit: !!target });
        break;
      }
      case "lob": {
        const end = stepToward(p, angle, Math.min(range, p.input.reach));
        const x = clamp(end.x, inset, width - inset);
        const y = clamp(end.y, inset, height - inset);
        this.lobs.push({ owner: p, x, y, radius: move.radius, damage, stun: move.stun,
          charge, lands: now + move.delay });
        this.effect(now, move.delay, { type: "lob", ...origin, tx: x, ty: y, r: move.radius });
        break;
      }
      case "beam": {
        const t = Math.min(1, ...this.map.obstacles.map(box => rectangleImpact(p, rayEnd, box)));
        const end = stepToward(p, angle, range * t);
        for (const target of enemies) {
          if (clearPath(this.map, p, target) && collideSegment(p, end, target, move.radius + R) !== Infinity) {
            this.damage(p, target, damage, now, charge, 0, "super");
          }
        }
        this.effect(now, 0.34, { type: "beam", ...origin, tx: end.x, ty: end.y, r: move.radius });
        break;
      }
    }
  }

  dodgeDirection(p) {
    const window = this.difficulty.dodge;
    if (!window) return undefined;
    let soonest = window;
    let dodge;
    for (const shot of this.projectiles) {
      if (shot.owner === p) continue;
      const speed = Math.hypot(shot.vx, shot.vy);
      const angle = Math.atan2(shot.vy, shot.vx);
      const duration = Math.min(shot.remaining / speed, window);
      const end = stepToward(shot, angle, speed * duration);
      const impact = collideSegment(shot, end, p, R + 13);
      if (impact * duration >= soonest ||
          this.map.obstacles.some(box => rectangleImpact(shot, end, box, 7) <= impact)) continue;
      const cross = shot.vx * (p.y - shot.y) - shot.vy * (p.x - shot.x);
      const turn = (cross < 0 ? -1 : 1) * Math.PI / 2;
      const clear = [angle + turn, angle - turn].find(dir => canWalk(this.map, p, dir, 48));
      if (clear !== undefined) {
        soonest = impact * duration;
        dodge = clear;
      }
    }
    return dodge;
  }

  driveBot(p, enemies, now, index) {
    const target = closest(p, enemies);
    if (!target) return;
    const { config } = p;
    const dist = distance(p, target);
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    const melee = config.attack.type === "slam";
    const ranged = config.class.toLowerCase() === "ranged";
    const canSee = clearPath(p, target, 5);
    const range = moveRange(config, config.attack);
    const superReady = p.charge >= 100 && dist <= moveRange(config, config.super);
    const desired = ranged ? range * 0.63 : Math.min(78, range * 0.75);
    const side = Math.floor(now / 3 + index) % 2 ? 1 : -1;
    let approach = angle + (ranged && canSee && dist < desired - 25 ? Math.PI : 0);
    if (canSee && Math.abs(dist - desired) < 27) approach = angle + Math.PI / 2 * side;
    approach += Math.sin(now * 2 + index) * 0.15;
    const dodge = this.dodgeDirection(p);
    if (dodge !== undefined) {
      approach = dodge;
    } else if (!canWalk(p, approach, 70)) {
      const options = [0.7, -0.7, 1.35, -1.35, 2, -2, Math.PI];
      const turn = options.find(change => canWalk(p, approach + change, 70));
      if (turn !== undefined) approach += turn;
    }
    const threatRange = moveRange(target.config, target.config.attack);
    const nap = config.passive?.type === "nap" && p.hp < p.maxHp && !superReady &&
      dodge === undefined && (dist > threatRange + 85 || !canSee && dist > 270);
    const speed = nap ? 0 : dodge === undefined ? 0.85 : 1;
    const aim = angle + (Math.random() * 2 - 1) * this.difficulty.aim;
    p.input.x = Math.cos(approach) * speed;
    p.input.y = Math.sin(approach) * speed;
    p.input.angle = Math.atan2(Math.sin(aim), Math.cos(aim));
    p.input.reach = dist;
    p.input.fire = !nap && canSee && dist <= range + (melee ? R : 0);
    if (!superReady) p.botSuperAt = null;
    else p.botSuperAt ??= now + this.difficulty.superDelay;
    p.input.super = p.botSuperAt !== null && now >= p.botSuperAt;
  }

  movePlayers(now, dt) {
    for (const [index, p] of this.players.entries()) {
      if (!p.hp) continue;
      const enemies = this.players.filter(other => other !== p && other.hp);
      if (p.bot && now >= p.botThink) {
        this.driveBot(p, enemies, now, index);
        p.botThink = now + this.difficulty.reaction;
      } else if (!p.bot && now - p.lastInput > 0.45) {
        p.input = { ...neutralInput(), angle: p.angle };
      }
      const { input, config } = p;
      const stunned = p.stunUntil > now;
      p.moving = !stunned && Math.hypot(input.x, input.y) > 0.08;
      if (!stunned) p.angle = input.angle;
      const slow = this.stickers.reduce((factor, sticker) =>
        sticker.owner !== p.id && distance(p, sticker) < sticker.r + R * 0.65
          ? Math.min(factor, sticker.slow) : factor, 1);
      if (slow < 1 && !p.onSticker) this.audio("slow", p, now);
      p.onSticker = slow < 1;
      if (p.moving) {
        const length = Math.max(1, Math.hypot(input.x, input.y));
        const speed = (115 + config.stats.speed * 14) * slow * dt / length;
        p.x += input.x * speed;
        p.y += input.y * speed;
        this.resolveWalls(p);
        p.lastActive = now;
      }
      const passive = config.passive;
      p.napping = !stunned && passive?.type === "nap" && now - p.lastActive >= passive.delay;
      if (p.napping) p.hp = Math.min(p.maxHp, p.hp + passive.healing * dt);
      if (passive?.type === "sticker" && now >= p.nextSticker) {
        this.audio("sticker", p, now);
        this.stickers.push({ id: ++this.serial, owner: p.id, x: p.x, y: p.y,
          r: passive.radius, slow: passive.slow, until: now + passive.duration });
        p.nextSticker = now + passive.delay;
      }
    }
    for (const [index, p] of this.players.entries()) {
      if (!p.hp) continue;
      for (const other of this.players.slice(index + 1)) {
        if (!other.hp) continue;
        const d = distance(p, other);
        if (d >= R * 2) continue;
        const a = d > EPSILON ? Math.atan2(other.y - p.y, other.x - p.x) : 0;
        const push = (R * 2 - d) / 2;
        Object.assign(p, stepToward(p, a + Math.PI, push));
        Object.assign(other, stepToward(other, a, push));
        this.resolveWalls(p);
        this.resolveWalls(other);
      }
    }
    for (const p of this.players) {
      if (!p.hp) continue;
      const enemies = this.players.filter(other => other !== p && other.hp);
      if (p.stunUntil <= now) {
        if (p.input.super && p.charge >= 100) {
          this.use(p, p.config.super, now, true, enemies);
        } else if ((p.input.fire || p.input.attack) && p.cooldown <= now) {
          this.use(p, p.config.attack, now, false, enemies);
        }
      }
      p.input.super = false;
      p.input.attack = false;
    }
  }

  resolveWalls(p) {
    p.x = clamp(p.x, INSET + R, WIDTH - INSET - R);
    p.y = clamp(p.y, INSET + R, HEIGHT - INSET - R);
    for (const b of BUMPERS) {
      if (distance(p, b) >= R + b.r) continue;
      Object.assign(p, stepToward(b, Math.atan2(p.y - b.y, p.x - b.x), R + b.r + EPSILON));
    }
  }

  update(now, dt) {
    this.audioEvents = this.audioEvents.filter(event => now - event.at <= 1.4);
    if (this.result || now < this.startsAt) return;
    if (now >= this.endsAt) {
      this.checkWinner(now);
      return;
    }
    this.effects = this.effects.filter(effect => effect.until > now);
    this.feed = this.feed.filter(event => event.until > now);
    this.stickers = this.stickers.filter(sticker => sticker.until > now);
    this.movePlayers(now, dt);
    this.projectiles = this.projectiles.filter(shot => {
      const step = Math.min(shot.remaining, Math.hypot(shot.vx, shot.vy) * dt);
      const end = stepToward(shot, Math.atan2(shot.vy, shot.vx), step);
      let first = Math.min(Infinity, ...BUMPERS.map(b => collideSegment(shot, end, b, b.r + 7)));
      let target = null;
      for (const p of this.players) {
        if (!p.hp || p === shot.owner) continue;
        const t = collideSegment(shot, end, p, R + 7);
        if (t < first) { first = t; target = p; }
      }
      if (target) this.damage(shot.owner, target, shot.damage, now, shot.charge);
      if (first !== Infinity) return false;
      Object.assign(shot, end);
      shot.remaining -= step;
      return shot.remaining > EPSILON && end.x > INSET && end.x < WIDTH - INSET
        && end.y > INSET && end.y < HEIGHT - INSET;
    });
    this.lobs = this.lobs.filter(lob => {
      if (now < lob.lands) return true;
      this.audio("impact", lob.owner, now, { x: lob.x, y: lob.y });
      this.effect(now, 0.48, { type: "burst", x: lob.x, y: lob.y, r: lob.radius });
      for (const target of this.players) {
        if (target !== lob.owner && distance(lob, target) < lob.radius + R) {
          this.damage(lob.owner, target, lob.damage, now, lob.charge, lob.stun, "super");
        }
      }
      return false;
    });
    this.checkWinner(now);
  }

  checkWinner(now) {
    if (this.result) return;
    const living = this.players.filter(p => p.hp);
    if (living.length > 1 && now < this.endsAt) return;
    const ranked = [...this.players].sort((a, b) => b.kos - a.kos || b.hp - a.hp);
    const timeout = now >= this.endsAt;
    const winners = timeout ? ranked.filter(p => p.kos === ranked[0]?.kos) : living;
    this.result = { winners: winners.map(p => p.id), timeout, finishedAt: now,
      names: winners.map(p => p.name),
      scores: ranked.map(({ id, name, kos, hp }) => ({ id, name, kos, alive: hp > 0 })) };
  }

  snapshot(now) {
    return {
      type: "battle", now, startsAt: this.startsAt, endsAt: this.endsAt, result: this.result,
      players: this.players.map(p => ({
        id: p.id, name: p.name, fighter: p.fighter, color: p.color, bot: !!p.bot,
        x: p.x, y: p.y, hp: Math.ceil(p.hp), maxHp: p.maxHp, angle: p.angle, kos: p.kos,
        charge: p.charge, napping: p.napping, stunned: p.stunUntil > now,
        state: !p.hp ? "defeated" : p.hurtUntil > now ? "hurt"
          : p.actionUntil > now ? p.action : p.moving ? "walk" : "idle"
      })),
      projectiles: this.projectiles.map(({ id, x, y, vx, vy }) => ({ id, x, y, vx, vy })),
      stickers: this.stickers.map(({ id, x, y, r, until }) => ({ id, x, y, r, until })),
      effects: this.effects, feed: this.feed, audio: this.audioEvents
    };
  }
}

