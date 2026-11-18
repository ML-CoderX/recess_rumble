import { readFile, readdir } from "node:fs/promises";
import { inside, onFloor, LIMIT, PLAYER_RADIUS } from "../shared/arena.js";

export const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path.slice(1), root));
const source = async path => (await read(path)).toString("utf8");
const dataUrl = (mime, data) => "data:" + mime + ";base64," + Buffer.from(data).toString("base64");
const spriteTypes = { svg: "image/svg+xml", png: "image/png", webp: "image/webp" };
const audioTypes = { mp3: "audio/mpeg", ogg: "audio/ogg" };
export const loadAudio = async () => JSON.parse(await source("/assets/audio.json"));

export async function loadFighters() {
  const dataDir = new URL("assets/characters/", root);
  const fighters = Object.create(null);
  for (const file of (await readdir(dataDir)).sort()) {
    if (!file.endsWith(".json")) continue;
    const fighter = JSON.parse(await readFile(new URL(file, dataDir), "utf8"));
    if (!/^[a-z0-9-]+$/.test(fighter.id) || fighters[fighter.id] || typeof fighter.class !== "string" ||
        !fighter.sprite?.path || !fighter.stats || !fighter.attack || !fighter.super) {
      throw new Error("Invalid fighter config in " + file);
    }
    fighters[fighter.id] = fighter;
  }
  if (!Object.keys(fighters).length) throw new Error("Add at least one character in assets/characters.");
  return fighters;
}

export async function loadMaps() {
  const dir = new URL("assets/maps/", root);
  const maps = [];
  const validRect = box => [box?.x, box?.y, box?.w, box?.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".json")) continue;
    const map = JSON.parse(await readFile(new URL(file, dir), "utf8"));
    if (!/^[a-z0-9-]+$/.test(map.id) || map.id === "random" || maps.some(m => m.id === map.id) ||
        typeof map.name !== "string" || !map.background ||
        ![map.size?.width, map.size?.height, map.size?.inset, map.tiles?.size].every(Number.isFinite) ||
        map.tiles.size <= 0 || map.size.width <= 0 || map.size.height <= 0 || map.size.inset < 0 ||
        !map.tiles.layout?.length || !map.tiles.layout.every(row => typeof row === "string" && row.length) ||
        !map.tiles.colors || !map.obstacles?.every(validRect) || !map.bushes?.every(validRect) ||
        !map.hazards?.every(h => h.zones?.length && h.zones.every(validRect)) || !Array.isArray(map.pickups) ||
        !map.spawns?.every(([x, y]) => onFloor({ x, y }, map.size, PLAYER_RADIUS) &&
          map.obstacles.every(box => !inside({ x, y }, box, PLAYER_RADIUS))) || map.spawns.length < LIMIT) {
      throw new Error("Invalid map config in " + file);
    }
    maps.push(map);
  }
  if (!maps.length) throw new Error("Add at least one map in assets/maps.");
  return maps;
}

export async function buildSoloPage(fighters, audio = null, maps = null) {
  const modules = new Map();
  const assets = new Map();
  async function embedModule(path) {
    if (modules.has(path)) return modules.get(path);
    let code = await source(path);
    const imports = [...code.matchAll(/\bfrom ("([^"]+)")/g)];
    for (const [, quoted, specifier] of imports) {
      const dependency = new URL(specifier, "https://recess.invalid" + path).pathname;
      code = code.replace(quoted, JSON.stringify(await embedModule(dependency)));
    }
    const url = dataUrl("text/javascript", code);
    modules.set(path, url);
    return url;
  }

  async function embedSprite(path) {
    if (!assets.has(path)) {
      if (!/^\/assets\/(?:sprites|maps)\/[a-z0-9_-]+\.(svg|png|webp)$/i.test(path)) {
        throw new Error("Invalid image path: " + path);
      }
      const type = spriteTypes[path.split(".").pop().toLowerCase()];
      assets.set(path, dataUrl(type, await read(path)));
    }
    return assets.get(path);
  }

  async function embedSounds(sounds = {}) {
    const embedded = {};
    for (const [key, cue] of Object.entries(sounds)) {
      if (!cue?.file) {
        embedded[key] = cue;
        continue;
      }
      const path = cue.file;
      if (!/^\/assets\/sounds\/[a-z0-9_-]+\.(mp3|ogg)$/i.test(path)) {
        throw new Error("Invalid audio clip path: " + path);
      }
      if (!assets.has(path)) {
        const type = audioTypes[path.split(".").pop().toLowerCase()];
        assets.set(path, dataUrl(type, await read(path)));
      }
      embedded[key] = { ...cue, file: assets.get(path) };
    }
    return embedded;
  }

  const roster = [];
  for (const fighter of Object.values(fighters)) {
    const sprite = { path: await embedSprite(fighter.sprite.path), states: {} };
    if (fighter.sprite.atlas) {
      const path = fighter.sprite.atlas;
      if (!/^\/assets\/sprites\/[a-z0-9_-]+\.json$/i.test(path)) throw new Error("Invalid atlas path: " + path);
      try {
        const atlas = JSON.parse(await source(path));
        sprite.atlasData = { ...atlas, images: await Promise.all(atlas.images.map(embedSprite)) };
      } catch {
        // Keep the 2D fallback usable if an optional sheet has not been built.
      }
    }
    for (const [state, path] of Object.entries(fighter.sprite.states ?? {})) {
      sprite.states[state] = await embedSprite(path);
    }
    const voiceFiles = {};
    const voiceLines = { ...fighter.voiceLines };
    for (const key of new Set([...Object.keys(voiceLines), ...Object.keys(fighter.voiceFiles ?? {})])) {
      const value = voiceLines[key];
      const file = fighter.voiceFiles?.[key] ?? (typeof value === "string" && /\.(mp3|ogg)$/i.test(value) ? value : null);
      if (!file) continue;
      const path = "/" + file.replace(/^\//, "");
      if (!/^\/assets\/voices\/[a-z0-9_-]+\/[a-z0-9_-]+\.(mp3|ogg)$/i.test(path)) throw new Error("Invalid voice path: " + file);
      try {
        const type = audioTypes[path.split(".").pop().toLowerCase()];
        voiceFiles[key] = dataUrl(type, await read(path));
        if (file === value) voiceLines[key] = "";
      } catch {
        // Keep optional recordings unavailable so their text placeholders can play.
        if (file === value) voiceLines[key] = "";
      }
    }
    roster.push({ ...fighter, sprite, voiceLines, voiceFiles, sounds: await embedSounds(fighter.sounds) });
  }
  const html = await source("/public/index.html");
  const css = await source("/public/styles.css");
  const app = await embedModule("/public/app.js");
  const config = JSON.stringify(roster).replaceAll("<", "\\u003c");
  const sounds = JSON.stringify(await embedSounds(audio ?? await loadAudio())).replaceAll("<", "\\u003c");
  const stages = await Promise.all((maps ?? await loadMaps()).map(async map => map.background.path
    ? { ...map, background: { ...map.background, path: await embedSprite(map.background.path) } }
    : map));
  const mapConfig = JSON.stringify(stages).replaceAll("<", "\\u003c");
  return html.replace(/  <link rel="manifest" href="\/public\/manifest\.webmanifest">\r?\n/, "")
    .replace('<link rel="stylesheet" href="/public/styles.css">', () => "<style>" + css + "</style>")
    .replace('<script type="module" src="/public/app.js"></script>',
      () => '<script>window.offlineFighters = ' + config + '; window.offlineAudio = ' + sounds +
        '; window.offlineMaps = ' + mapConfig + ';</script>\n  <script type="module" src="' + app + '"></script>');
}
