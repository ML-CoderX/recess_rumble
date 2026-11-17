const STORAGE = "recess-rumble-audio";
const DEFAULTS = { music: 0.24, effects: 0.70, voices: 0.65, muted: false };
const tone = (wave, from, to, length, gain, at = 0) => ({ wave, from, to, length, gain, at });
const noise = (filter, hz, length, gain, at = 0) => ({ filter, hz, length, gain, at });
const notes = (pitches, length = 0.16, spacing = 0.095, gain = 0.18) =>
  pitches.map((hz, i) => tone("triangle", hz, hz, length, gain, i * spacing));

const CUES = {
  click: [tone("square", 520, 775, 0.045, 0.12)],
  count: notes([440], 0.19),
  go: notes([660, 880, 1109], 0.21, 0.07),
  end: notes([587, 523, 392], 0.17, 0.09),
  win: notes([523, 659, 784, 1047, 1319], 0.23, 0.09),
  lose: notes([523, 466, 392, 277], 0.23, 0.13),
  ready: notes([988, 1319, 1760], 0.19, 0.055),
  ko: notes([880, 587], 0.12, 0.07),
  ring: [tone("sine", 1650, 1250, 0.23, 0.2), tone("triangle", 1100, 1090, 0.15, 0.09, 0.055)],
  tap: [tone("triangle", 350, 155, 0.1, 0.24), noise("bandpass", 1050, 0.055, 0.17)],
  thud: [tone("sine", 112, 45, 0.28, 0.34), noise("lowpass", 330, 0.18, 0.34)],
  boing: [tone("triangle", 200, 455, 0.11, 0.16), tone("sine", 420, 190, 0.13, 0.12, 0.055)],
  tumble: [tone("triangle", 640, 365, 0.14, 0.24), tone("triangle", 360, 140, 0.24, 0.22, 0.12),
    tone("sine", 200, 62, 0.21, 0.23, 0.29)],
  whoosh: [noise("bandpass", 1180, 0.19, 0.35), tone("sine", 640, 180, 0.12, 0.13)],
  splat: [noise("lowpass", 510, 0.14, 0.44), tone("sine", 270, 76, 0.16, 0.25)],
  rise: [tone("triangle", 160, 760, 0.49, 0.32), tone("sine", 260, 1100, 0.44, 0.16, 0.06)],
  slam: [tone("sine", 140, 40, 0.34, 0.56), noise("lowpass", 660, 0.22, 0.40),
    tone("triangle", 185, 64, 0.18, 0.22)],
  snore: [tone("triangle", 63, 105, 0.45, 0.18), noise("lowpass", 380, 0.52, 0.23),
    tone("triangle", 93, 57, 0.64, 0.14, 0.7), noise("lowpass", 235, 0.57, 0.26, 0.7)],
  servo: [tone("sawtooth", 84, 201, 0.14, 0.14), tone("square", 270, 590, 0.09, 0.1, 0.01)],
  clunk: [tone("square", 165, 90, 0.075, 0.25), noise("bandpass", 770, 0.12, 0.23)],
  hum: [tone("triangle", 112, 308, 0.20, 0.25), tone("sine", 144, 440, 0.19, 0.14)],
  zap: [tone("sawtooth", 1480, 100, 0.18, 0.27), noise("bandpass", 2500, 0.15, 0.31)],
  peel: [noise("highpass", 1900, 0.076, 0.31), tone("triangle", 790, 490, 0.09, 0.18, 0.055)]
};

const MELODY = [
  72, 76, 79, null, 81, 79, 76, 74, 72, null, 76, 79, 74, 76, 77, null,
  74, 77, 81, null, 83, 81, 77, 76, 74, null, 79, 77, 76, 74, 71, 67
];
const BASS = [48, 48, 45, 45, 50, 50, 43, 43];
const STEP = 60 / 136 / 2;
const midi = note => 440 * 2 ** ((note - 69) / 12);

function readSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch { /* storage is optional */ }
  const settings = { ...DEFAULTS };
  for (const channel of ["music", "effects", "voices"]) {
    if (typeof saved?.[channel] === "number") settings[channel] = Math.min(1, Math.max(0, saved[channel]));
  }
  settings.muted = saved?.muted === true;
  return settings;
}

export class GameAudio {
  constructor() {
    this.settings = readSettings();
    this.clips = new Map();
    this.naps = new Map();
    this.voiceToken = 0;
    this.trackStep = 0;
  }

  async unlock() {
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (!Context) return;
    if (!this.context) {
      const ctx = this.context = new Context();
      this.effects = ctx.createGain();
      this.music = ctx.createGain();
      this.duck = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -15;
      limiter.ratio.value = 5;
      limiter.connect(ctx.destination);
      this.effects.connect(limiter);
      this.music.connect(this.duck).connect(limiter);
      const buffer = this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.applySettings();
      this.nextNote = 0;
      setInterval(() => this.scheduleMusic(), 40);
    }
    await this.context.resume();
  }

  set(key, value) {
    this.settings[key] = value;
    this.applySettings();
    try { localStorage.setItem(STORAGE, JSON.stringify(this.settings)); } catch { /* storage is optional */ }
    if (this.settings.muted || !this.settings.voices) this.stopVoice();
  }

  applySettings() {
    if (!this.context) return;
    const { music, effects, muted } = this.settings;
    const t = this.context.currentTime;
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.52, t, 0.018);
    this.effects.gain.setTargetAtTime(muted ? 0 : effects, t, 0.018);
  }

  preload(cues) {
    if (!this.context) return;
    for (const cue of cues) {
      const file = cue?.file;
      if (!file || this.clips.has(file)) continue;
      this.clips.set(file, null);
      fetch(file).then(response => {
        if (!response.ok) throw new Error("Audio clip unavailable");
        return response.arrayBuffer();
      }).then(data => this.context.decodeAudioData(data))
        .then(buffer => this.clips.set(file, buffer)).catch(() => {});
    }
  }

  synth(part, at, output, volume, pitch = 1) {
    const ctx = this.context;
    const { length } = part;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, part.gain * volume), at + Math.min(0.018, length / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    envelope.connect(output);
    let source;
    if (part.wave) {
      source = ctx.createOscillator();
      source.type = part.wave;
      source.frequency.setValueAtTime(part.from * pitch, at);
      source.frequency.exponentialRampToValueAtTime(part.to * pitch, at + length);
      source.connect(envelope);
    } else {
      source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = part.filter;
      filter.frequency.value = part.hz * pitch;
      filter.Q.value = 0.8;
      source.connect(filter).connect(envelope);
      source.onended = () => filter.disconnect();
    }
    source.addEventListener("ended", () => envelope.disconnect(), { once: true });
    source.start(at);
    source.stop(at + length);
  }

  play(cue, { volume = 1, delay = 0, output = this.effects, vary = false } = {}) {
    if (!cue || !volume || this.settings.muted || !this.settings.effects || this.context?.state !== "running") return;
    const at = this.context.currentTime + delay + 0.008;
    const buffer = this.clips.get(cue.file);
    const pitch = vary ? 0.90 + Math.random() * 0.2 : 1;
    if (buffer) {
      const node = this.context.createBufferSource();
      const gain = this.context.createGain();
      node.buffer = buffer;
      node.playbackRate.value = pitch;
      gain.gain.value = volume;
      node.connect(gain).connect(output);
      node.onended = () => gain.disconnect();
      node.start(at);
      return buffer.duration / pitch;
    }
    const parts = CUES[typeof cue === "string" ? cue : cue.preset];
    if (!Array.isArray(parts)) return;
    for (const part of parts) this.synth(part, at + part.at, output, volume, pitch);
    return Math.max(...parts.map(part => part.at + part.length));
  }

  scheduleMusic() {
    if (this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (this.nextNote < now) this.nextNote = now + 0.03;
    while (this.nextNote < now + 0.14) {
      const step = this.trackStep;
      if (!this.settings.muted && this.settings.music) {
        const lead = MELODY[step];
        if (lead !== null) this.synth(tone("square", midi(lead), midi(lead), STEP * 0.82, 0.12), this.nextNote, this.music, 1);
        if (step % 2 === 0) {
          const hz = midi(BASS[Math.floor(step / 4)] + (step % 4 === 2 ? 12 : 0));
          this.synth(tone("triangle", hz, hz, STEP * 1.35, 0.19), this.nextNote, this.music, 1);
        }
        const beat = step % 4;
        if (beat === 0) this.synth(tone("sine", 92, 38, 0.12, 0.29), this.nextNote, this.music, 1);
        else this.synth(noise("highpass", beat === 2 ? 1500 : 5300, 0.077, 0.15), this.nextNote, this.music, 1);
      }
      this.trackStep = (step + 1) % MELODY.length;
      this.nextNote += STEP;
    }
  }

  updateNaps(players, cueFor, volumeFor) {
    if (this.context?.state !== "running") return;
    const now = this.context.currentTime;
    const active = new Set();
    for (const player of players) {
      if (!player.hp || !player.napping) continue;
      const cue = cueFor(player);
      const volume = volumeFor(player);
      if (!cue || !volume) continue;
      active.add(player.id);
      let nap = this.naps.get(player.id);
      if (!nap) {
        const gain = this.context.createGain();
        gain.gain.value = volume;
        gain.connect(this.effects);
        nap = { gain, next: now };
        this.naps.set(player.id, nap);
      }
      nap.gain.gain.setTargetAtTime(volume, now, 0.06);
      if (now >= nap.next) {
        const duration = this.play(cue, { output: nap.gain, volume: 0.65 }) ?? 1.3;
        nap.next = now + duration + 0.25;
      }
    }
    for (const [id, nap] of this.naps) {
      if (active.has(id)) continue;
      nap.gain.gain.setTargetAtTime(0, now, 0.035);
      setTimeout(() => nap.gain.disconnect(), 180);
      this.naps.delete(id);
    }
  }

  say(text, volume, delay, priority = false) {
    if (!text || !volume || this.settings.muted || !this.settings.voices || !("speechSynthesis" in window)) return;
    if (this.voiceBusy && !priority) return;
    this.stopVoice();
    const token = this.voiceToken;
    this.voiceBusy = true;
    this.voiceTimer = setTimeout(() => {
      const line = new SpeechSynthesisUtterance(text);
      line.volume = Math.min(1, volume * this.settings.voices);
      line.rate = 1.04;
      this.duckMusic(0.23);
      const finish = () => {
        if (this.voiceToken !== token) return;
        this.voiceBusy = false;
        clearTimeout(this.voiceTimer);
        this.duckMusic(1);
      };
      line.onend = finish;
      line.onerror = finish;
      this.voiceTimer = setTimeout(finish, 6000);
      try { speechSynthesis.speak(line); } catch { finish(); }
    }, delay);
  }

  duckMusic(value) {
    if (this.context) this.duck.gain.setTargetAtTime(value, this.context.currentTime, value < 1 ? 0.035 : 0.21);
  }

  stopVoice() {
    this.voiceToken++;
    clearTimeout(this.voiceTimer);
    if (this.voiceBusy) window.speechSynthesis?.cancel();
    this.voiceBusy = false;
    this.duckMusic(1);
  }
}
