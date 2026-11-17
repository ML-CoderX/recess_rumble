import { readFile, readdir } from "node:fs/promises";

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

export async function buildSoloPage(fighters, audio = null) {
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
      if (!/^\/assets\/sprites\/[a-z0-9_-]+\.(svg|png|webp)$/i.test(path)) {
        throw new Error("Invalid sprite path: " + path);
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
    for (const [state, path] of Object.entries(fighter.sprite.states ?? {})) {
      sprite.states[state] = await embedSprite(path);
    }
    roster.push({ ...fighter, sprite, sounds: await embedSounds(fighter.sounds) });
  }
  const html = await source("/public/index.html");
  const css = await source("/public/styles.css");
  const app = await embedModule("/public/app.js");
  const config = JSON.stringify(roster).replaceAll("<", "\\u003c");
  const sounds = JSON.stringify(await embedSounds(audio ?? await loadAudio())).replaceAll("<", "\\u003c");
  return html.replace('<link rel="stylesheet" href="/public/styles.css">', () => "<style>" + css + "</style>")
    .replace('<script type="module" src="/public/app.js"></script>',
      () => '<script>window.offlineFighters = ' + config + '; window.offlineAudio = ' + sounds +
        ';</script>\n  <script type="module" src="' + app + '"></script>');
}
