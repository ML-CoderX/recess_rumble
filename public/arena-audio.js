import { GameAudio } from "./audio.js";

function attenuation(event, listener) {
  if (!listener) return 1;
  const distance = Math.hypot(event.x - listener.x, event.y - listener.y);
  return Math.max(0, 1 - distance / 1320) ** 1.65;
}

export class ArenaAudio extends GameAudio {
  constructor() {
    super();
    this.global = {};
    this.resetRound();
  }

  loadSounds(global, catalog) {
    this.global = global;
    this.preload([...Object.values(global), ...Object.values(catalog)
      .flatMap(fighter => Object.values(fighter.sounds ?? {}))]);
  }

  resetRound() {
    this.lastEvent = 0;
    this.count = null;
    this.finished = false;
    this.spawnSpoken = false;
    this.updateNaps([], () => {}, () => 0);
    this.stopVoice();
  }

  update(state, catalog, self, onReady) {
    const listener = state.players.find(player => player.id === self);
    const count = Math.ceil(state.startsAt - state.now);
    if (!state.result && count !== this.count && count >= 1 && count <= 3) {
      this.play(this.global.countdown);
    } else if (!state.result && count === 0 && this.count > 0) {
      this.play(this.global.start);
    }
    this.count = count;
    if (!this.spawnSpoken && listener) {
      this.spawnSpoken = true;
      this.characterLine(catalog[listener.fighter], "spawn", 1, 150);
    }

    for (const event of state.audio ?? []) {
      if (event.id <= this.lastEvent) continue;
      this.lastEvent = event.id;
      if (state.now - event.at > 0.65) continue;
      if (event.type === "ready" && event.player === self) onReady();
      this.playEvent(event, catalog, self, attenuation(event, listener));
    }

    this.updateNaps(state.result ? [] : state.players,
      player => catalog[player.fighter]?.sounds?.nap, player => attenuation(player, listener));
    if (state.result && !this.finished) {
      this.finished = true;
      this.play(this.global.end);
      if (state.result.winners.length === 1) {
        this.play(state.result.winners.includes(self) ? this.global.win : this.global.lose, { delay: 0.43 });
        if (listener) this.characterLine(catalog[listener.fighter],
          state.result.winners.includes(self) ? "win" : "lose", 1, 950, true);
      }
    }
  }

  playEvent(event, catalog, self, volume) {
    const fighter = catalog[event.fighter];
    const sounds = fighter?.sounds ?? {};
    const play = (cue, scale = 1, delay = 0) => this.play(cue, { volume: volume * scale, delay, vary: true });
    switch (event.type) {
      case "hit": {
        const attack = catalog[event.attacker]?.sounds ?? {};
        const hit = event.source === "super" ? attack.superHit : attack.attackHit;
        const timing = event.source === "attack" && attack.grab ? 0.13 : 0;
        play(event.heavy ? this.global.heavyHit : this.global.smallHit, hit ? 0.30 : 0.78, timing);
        play(hit, 0.8, timing);
        play(sounds.hurt ?? this.global.hurt, 0.43, timing + 0.04);
        if (event.stun) {
          play((event.source === "super" ? attack.superStun : attack.attackStun)
            ?? this.global.stun, event.heavy ? 0.75 : 0.33, timing + 0.06);
        }
        break;
      }
      case "slow":
        play(this.global.slow);
        break;
      case "pickup":
        play(this.global.pickup);
        break;
      case "ready":
        if (event.player === self) this.play(this.global.ready);
        break;
      case "ko":
        play(this.global.ko, 0.66);
        play(sounds.defeated, 1, 0.13);
        if (volume >= 0.32) this.characterLine(fighter, "lose", volume, 660, event.player === self);
        break;
      case "super":
        play(sounds.super);
        play(sounds.zap, 0.9, 0.17);
        if (volume >= 0.46) this.characterLine(fighter, "super", volume, 220);
        break;
      case "grab":
        play(sounds.grab, 0.85, 0.066);
        break;
      case "attack":
      case "impact":
      case "sticker":
        play(sounds[event.type]);
        break;
    }
  }
}
