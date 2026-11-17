import { LIMIT, clamp } from "/shared/arena.js";
import { Battle } from "/shared/battle.js";
import { ArenaView, preload } from "./render.js";
import { ArenaAudio } from "./arena-audio.js";

const $ = id => document.getElementById(id);
const element = (tag, value, className) => {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
};
const text = (id, value) => {
  if ($(id).textContent !== String(value)) $(id).textContent = value;
};

const canvas = $("arena");
const view = new ArenaView(canvas);
const audio = new ArenaAudio();
const keys = new Set();
const moves = new Map([
  ["KeyW", [0, -1]], ["ArrowUp", [0, -1]], ["KeyA", [-1, 0]], ["ArrowLeft", [-1, 0]],
  ["KeyS", [0, 1]], ["ArrowDown", [0, 1]], ["KeyD", [1, 0]], ["ArrowRight", [1, 0]]
]);

const offlineCopy = Array.isArray(window.offlineFighters);
const SOLO_ID = "solo-player";
let socket, self, room, battle, chosen, mode, solo;
let catalog = {};
let gotBattleAt = 0;
let feedKey = "";
let currentVoice;
let voiceUntil = 0;
let attackQueued = false;
let superQueued = false;
let aim = { angle: 0, reach: 300 };
let pointer = null;
let soundConfig = window.offlineAudio ?? {};
let readyUntil = 0;

function send(type, data = {}) {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 8192) {
    socket.send(JSON.stringify({ type, ...data }));
    return true;
  }
  return false;
}

function error(message = "") {
  text("error", message);
  $("error").hidden = !message;
}

function status(label, online = false) {
  text("connection", label);
  $("connection").hidden = !label;
  $("connection").classList.toggle("online", online);
  $("create").disabled = !online;
  $("join").disabled = !online;
}

function connect() {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const connecting = new WebSocket(scheme + "//" + location.host + "/play");
  socket = connecting;
  status("Connecting");
  connecting.addEventListener("message", event => {
    if (socket === connecting) receive(JSON.parse(event.data));
  });
  connecting.addEventListener("close", () => {
    if (socket !== connecting) return;
    socket = null;
    if (room) error("Connection lost. Join again when the server is back.");
    room = null;
    displayRoom();
    status("Reconnecting");
    setTimeout(() => {
      if (mode === "multi" && !socket) connect();
    }, 1600);
  });
}

function setMode(next) {
  if (mode === next || room || offlineCopy && next === "multi") return;
  mode = next;
  error();
  if (mode === "multi") {
    connect();
  } else {
    const previous = socket;
    socket = null;
    previous?.close();
    status("Solo · Offline");
  }
  displayRoom();
}

function setCatalog(fighters) {
  catalog = Object.fromEntries(fighters.map(fighter => [fighter.id, fighter]));
  chosen = catalog[chosen]?.id ?? catalog.muawiz?.id ?? fighters[0].id;
  preload(fighters);
  audio.loadSounds(soundConfig, catalog);
  buildFighters();
  $("start-solo").disabled = false;
}

function portrait(fighter) {
  const img = element("img");
  img.src = fighter.sprite.path;
  img.alt = "";
  img.draggable = false;
  return img;
}

function buildFighters() {
  const fighters = Object.values(catalog).sort((a, b) =>
    Number(b.id === "muawiz") - Number(a.id === "muawiz"));
  text("fighter-count", fighters.length + (fighters.length === 1 ? " fighter" : " fighters"));
  $("fighters").replaceChildren(...fighters.map(fighter => {
    const button = element("button", undefined, "fighter");
    button.type = "button";
    button.dataset.id = fighter.id;
    button.style.setProperty("--fighter", fighter.color ?? "#ffe686");
    const pick = element("span", "✓", "picked");
    pick.setAttribute("aria-hidden", "true");
    button.append(portrait(fighter), element("strong", fighter.name),
      element("span", fighter.class, "role"), pick);
    button.addEventListener("click", () => {
      error();
      choose(fighter.id);
      if (room) send("select", { fighter: fighter.id });
    });
    return button;
  }));
  choose(chosen);
}

function choose(id) {
  chosen = id;
  const fighter = catalog[id];
  if (!fighter) return;
  for (const card of $("fighters").children) {
    card.setAttribute("aria-pressed", String(card.dataset.id === id));
  }
  const stats = element("div", undefined, "stats");
  for (const [key, label] of Object.entries({ health: "Health", speed: "Speed", damage: "Damage", range: "Range" })) {
    const stat = element("div", undefined, "stat");
    const meter = element("progress");
    meter.max = 10;
    meter.value = fighter.stats[key];
    meter.setAttribute("aria-label", label);
    stat.append(element("span", label), element("strong", fighter.stats[key]), meter);
    stats.append(stat);
  }
  const abilities = element("div", undefined, "abilities");
  for (const move of [fighter.attack, fighter.super, fighter.passive].filter(Boolean)) {
    const ability = element("div");
    ability.append(element("strong", move.name), element("span", move.description));
    abilities.append(ability);
  }
  $("loadout").hidden = false;
  $("loadout").replaceChildren(stats, abilities);
}

function displayRoom() {
  $("mode-choice").hidden = !!room;
  $("solo-setup").hidden = mode !== "solo";
  $("play-solo").setAttribute("aria-pressed", String(mode === "solo"));
  $("play-multi").setAttribute("aria-pressed", String(mode === "multi"));
  $("entry").hidden = !!room || mode !== "multi";
  $("room").hidden = !room;
  const running = !!room?.running || !!solo;
  $("menu").hidden = running;
  $("game").hidden = !running;
  document.body.classList.toggle("playing", running);
  if (!running) resetBattle();
  text("room-title", room ? "Your room" : "Play a match");
  text("room-description", room ? "Share this code with friends on the same Wi-Fi."
    : mode === "solo" || offlineCopy ? "Pick a fighter and take on four bots offline."
    : mode === "multi" ? "Host a room or join your friends on the same Wi-Fi."
    : "Take on four bots or challenge friends on the same Wi-Fi.");
  $("back").hidden = !!room && room.host !== self;
  $("result-waiting").hidden = !room || room.host === self;
  text("back", solo ? "Back to solo setup" : "Back to lobby");
  text("result-leave", solo ? "End solo session" : "Leave room");
  if (!room) return;
  const host = room.host === self;
  const mine = room.members.find(member => member.id === self);
  if (mine && chosen !== mine.fighter) choose(mine.fighter);
  text("room-code", room.code);
  text("room-count", room.members.length + " / " + LIMIT);
  $("roster").replaceChildren(...room.members.map(member => {
    const item = element("li");
    const label = member.name + (member.id === self ? " (you)" : "");
    item.append(portrait(catalog[member.fighter]), element("strong", label),
      element("span", member.id === room.host ? "Host" : ""));
    return item;
  }));
  $("bots").checked = room.bots;
  $("bots").disabled = !host;
  $("takeover").checked = room.takeover;
  $("takeover").disabled = !host;
  $("start").hidden = !host;
  $("waiting").hidden = host;
}

function resetBattle() {
  battle = null;
  feedKey = "";
  $("feed").replaceChildren();
  $("countdown").hidden = true;
  $("results").hidden = true;
  $("spectate").hidden = true;
  $("voice-line").hidden = true;
  $("super-button").disabled = true;
  currentVoice = null;
  readyUntil = 0;
  audio.resetRound();
  view.reset();
  pointer = null;
  aim = { angle: 0, reach: 300 };
  clearInput();
}

function receive(message) {
  if (message.type === "hello") {
    self = message.id;
    setCatalog(message.fighters);
    status("Online", true);
  } else if (message.type === "error") {
    error(message.message);
  } else if (message.type === "room") {
    error();
    room = message;
    displayRoom();
  } else if (message.type === "left") {
    room = null;
    error();
    displayRoom();
  } else if (message.type === "battle" && room?.running) {
    showBattle(message, performance.now() / 1000);
  }
}

function showBattle(snapshot, receivedAt) {
  const first = !battle;
  battle = snapshot;
  gotBattleAt = receivedAt;
  if (first) aim.angle = localPlayer()?.angle ?? 0;
  updateFeed();
  audio.update(snapshot, catalog, self, () => { readyUntil = performance.now() + 460; });
  if (battle.result && $("results").hidden) showResults(battle.result);
}

function startSolo() {
  if (solo || room || !catalog[chosen]) return;
  self = SOLO_ID;
  const now = performance.now() / 1000;
  solo = new Battle([{ id: self, name: "You", fighter: chosen }], catalog, true, now, $("difficulty").value);
  displayRoom();
  showBattle(solo.snapshot(now), now);
}

function endSolo() {
  solo = null;
  displayRoom();
}

function updateFeed() {
  const list = battle.feed;
  const signature = list.map(e => e.id).join(",");
  if (signature === feedKey) return;
  feedKey = signature;
  $("feed").replaceChildren(...[...list].reverse().map(item => element("div", item.text)));
  const latest = [...list].reverse().find(item => item.speaker === self && item.voice);
  if (latest && (currentVoice === null || latest.id > currentVoice)) {
    currentVoice = latest.id;
    text("voice-line", "“" + latest.voice + "”");
    $("voice-line").hidden = false;
    voiceUntil = performance.now() + 2800;
  }
}

function showResults(result) {
  const won = result.winners.includes(self);
  const tie = result.winners.length > 1 || !result.winners.length;
  const winner = solo && won ? "You" : result.names[0];
  text("outcome", tie ? "Draw" : won ? "You win!" : "You lose");
  text("result-caption", result.timeout
    ? tie ? result.names.join(", ") + " tied on KOs." : winner + " scored the most KOs."
    : tie ? "No fighters left standing." : winner + (solo && won ? " are" : " is") + " the last fighter standing.");
  $("scores").replaceChildren(...[...result.scores].sort((a, b) =>
    Number(result.winners.includes(b.id)) - Number(result.winners.includes(a.id))
  ).map(row => {
    const line = element("li", row.name + (row.id === self && !solo ? " (you)" : ""));
    line.append(element("span", row.kos + (row.kos === 1 ? " KO" : " KOs")));
    return line;
  }));
  $("results").hidden = false;
  clearInput();
}

$("entry").noValidate = true;
$("code").addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  if (!$("join").disabled) $("entry").requestSubmit($("join"));
});
$("entry").addEventListener("submit", event => {
  event.preventDefault();
  const action = event.submitter?.value ?? "create";
  const name = $("name").value.trim();
  const code = $("code").value.trim();
  if (!name) { error("Enter a player name."); $("name").focus(); return; }
  if (action === "join" && code.length !== 5) {
    error("Enter the five-character room code.");
    $("code").focus();
    return;
  }
  error();
  send(action, { name, code, fighter: chosen });
});
$("bots").addEventListener("change", () => send("bots", { enabled: $("bots").checked }));
$("takeover").addEventListener("change", () => send("takeover", { enabled: $("takeover").checked }));
$("play-solo").addEventListener("click", () => setMode("solo"));
$("play-multi").addEventListener("click", () => setMode("multi"));
$("start-solo").addEventListener("click", startSolo);
$("start").addEventListener("click", () => send("start"));
$("back").addEventListener("click", () => solo ? endSolo() : send("lobby"));
$("leave").addEventListener("click", () => send("leave"));
$("exit").addEventListener("click", () => solo ? endSolo() : send("leave"));
$("result-leave").addEventListener("click", () => solo ? endSolo() : send("leave"));
$("copy").addEventListener("click", async () => {
  if (!room) return;
  try {
    if (!navigator.clipboard) {
      const field = element("textarea");
      field.value = room.code;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) throw new Error();
    } else {
      await navigator.clipboard.writeText(room.code);
    }
    text("copy", "Copied!");
    setTimeout(() => text("copy", "Copy code"), 1000);
  } catch {
    window.prompt("Copy the room code", room?.code ?? "");
  }
});
function refreshAudioSettings() {
  for (const channel of ["music", "effects", "voices"]) {
    const percent = Math.round(audio.settings[channel] * 100);
    $("volume-" + channel).value = percent;
    text(channel + "-value", percent + "%");
  }
  $("audio-mute").checked = audio.settings.muted;
}

async function beginAudio(mute) {
  if (mute) audio.set("muted", true);
  const unlocked = audio.unlock();
  $("audio-start").close();
  try {
    await unlocked;
    audio.loadSounds(soundConfig, catalog);
    audio.play(audio.global.menu);
  } catch { /* the game can continue before the device allows audio */ }
}

$("audio-unlock").addEventListener("click", () => beginAudio(false));
$("audio-silent").addEventListener("click", () => beginAudio(true));
$("audio-start").addEventListener("cancel", event => event.preventDefault());
for (const id of ["audio-menu", "audio-match"]) {
  $(id).addEventListener("click", () => {
    clearInput();
    refreshAudioSettings();
    $("audio-settings").showModal();
  });
}
for (const channel of ["music", "effects", "voices"]) {
  $("volume-" + channel).addEventListener("input", event => {
    audio.set(channel, Number(event.target.value) / 100);
    text(channel + "-value", event.target.value + "%");
  });
}
$("audio-mute").addEventListener("change", event => audio.set("muted", event.target.checked));
document.addEventListener("click", event => {
  const button = event.target.closest("button, a");
  if (!button || button.disabled || button.closest("#audio-start") || button.id === "super-button") return;
  audio.play(audio.global.menu);
}, true);
document.addEventListener("pointerdown", () => {
  if (audio.context && audio.context.state !== "running") audio.unlock().catch(() => {});
}, true);

if (!offlineCopy) {
  fetch("/audio.json").then(response => {
    if (!response.ok) throw new Error("Audio config unavailable");
    return response.json();
  }).then(config => {
    soundConfig = config;
    audio.loadSounds(config, catalog);
  }).catch(() => {});
}

const localPlayer = () => battle?.players.find(p => p.id === self);
const canPlay = () => (solo || room?.running) && battle && !battle.result && localPlayer()?.hp > 0;
window.addEventListener("keydown", event => {
  if ($("audio-settings").open || !canPlay() || !moves.has(event.code) && event.code !== "Space") return;
  if (event.code === "Space" && (event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  keys.add(event.code);
  if (event.code === "Space" && !event.repeat) superQueued = true;
});
window.addEventListener("keyup", event => keys.delete(event.code));

function updatePointer() {
  const player = localPlayer();
  if (!pointer || !player) return;
  const target = view.point(pointer.x, pointer.y);
  const dx = target.x - player.x, dy = target.y - player.y;
  aim.angle = Math.atan2(dy, dx);
  aim.reach = Math.hypot(dx, dy);
}

function mouseAim(event) {
  if (event.pointerType === "touch") return;
  pointer = { x: event.clientX, y: event.clientY };
  updatePointer();
}
canvas.addEventListener("pointermove", mouseAim);
canvas.addEventListener("pointerdown", event => {
  if (!canPlay() || event.pointerType === "touch" || event.button !== 0) return;
  mouseAim(event);
  attackQueued = true;
});
canvas.addEventListener("contextmenu", event => event.preventDefault());

function joystick(id, update) {
  const node = $(id);
  const knob = node.querySelector("i");
  let pointerId = null;
  function position(event) {
    const box = node.getBoundingClientRect();
    const radius = box.width * 0.32;
    const x = (event.clientX - box.left - box.width / 2) / radius;
    const y = (event.clientY - box.top - box.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y));
    const dx = x / length, dy = y / length;
    knob.style.transform = "translate(" + dx * radius + "px," + dy * radius + "px)";
    update(dx, dy);
  }
  function reset() {
    if (pointerId !== null && node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    pointerId = null;
    knob.style.transform = "";
    update(0, 0);
  }
  node.addEventListener("pointerdown", event => {
    if (!canPlay() || pointerId !== null) return;
    pointerId = event.pointerId;
    node.setPointerCapture(pointerId);
    position(event);
  });
  node.addEventListener("pointermove", event => {
    if (pointerId === event.pointerId) position(event);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    node.addEventListener(type, event => {
      if (pointerId === event.pointerId) reset();
    });
  }
  return reset;
}

let movement = { x: 0, y: 0 };
let touchFire = false;
const resetMove = joystick("move-stick", (x, y) => { movement = { x, y }; });
const resetAim = joystick("aim-stick", (x, y) => {
  const tilt = Math.hypot(x, y);
  const firing = tilt > 0.22;
  if (firing) {
    pointer = null;
    aim.angle = Math.atan2(y, x);
    const range = catalog[chosen]?.super.range ?? 490;
    aim.reach = range * clamp(tilt, 0.25, 1);
    if (!touchFire) attackQueued = true;
  }
  touchFire = firing;
});
$("super-button").addEventListener("pointerdown", () => {
  if (canPlay() && !$("super-button").disabled) superQueued = true;
});
$("super-button").addEventListener("click", event => {
  if (event.detail === 0 && canPlay()) superQueued = true;
});

function clearInput() {
  keys.clear();
  resetMove();
  resetAim();
  attackQueued = false;
  superQueued = false;
}
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInput();
});

function readInput() {
  updatePointer();
  let x = movement.x, y = movement.y;
  for (const key of keys) {
    const direction = moves.get(key);
    if (direction) { x += direction[0]; y += direction[1]; }
  }
  const length = Math.max(1, Math.hypot(x, y));
  return { x: x / length, y: y / length, ...aim, attack: attackQueued, fire: touchFire, super: superQueued };
}

function consumeActions() {
  attackQueued = false;
  superQueued = false;
}

setInterval(() => {
  if (room?.running && canPlay() && send("input", readInput())) consumeActions();
}, 1000 / 30);

let last = performance.now() / 1000;
function frame(ms) {
  const now = ms / 1000;
  if (solo && !solo.result) {
    if (canPlay()) {
      solo.input(self, readInput(), now);
      consumeActions();
    }
    solo.update(now, Math.min(0.05, now - last));
    showBattle(solo.snapshot(now), now);
  }
  if (battle) {
    const current = battle.now + Math.min(0.15, Math.max(0, now - gotBattleAt));
    const me = localPlayer();
    const remaining = Math.max(0, Math.min(120, Math.ceil(battle.endsAt - (battle.result?.finishedAt ?? current))));
    text("clock", Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0"));
    text("alive", battle.players.filter(p => p.hp).length);
    text("kos", me?.kos ?? 0);
    const count = Math.ceil(battle.startsAt - current);
    const activeCountdown = count > 0 || current - battle.startsAt < 0.6;
    $("countdown").hidden = !activeCountdown || !!battle.result;
    if (activeCountdown) text("countdown", count > 0 ? count : "RUMBLE!");
    $("spectate").hidden = !!me?.hp || !!battle.result;
    if (ms >= voiceUntil) $("voice-line").hidden = true;
    const charge = me?.charge ?? 0;
    const superReady = charge >= 100 && me?.hp > 0 && !battle.result;
    $("super-meter").value = charge;
    text("super-label", me ? catalog[me.fighter].super.name : "Super");
    text("super-percent", superReady ? "Ready" : charge + "%");
    $("super-button").disabled = !superReady;
    $("super-meter").parentElement.classList.toggle("ready", superReady);
    $("super-meter").parentElement.classList.toggle("flash", superReady && ms < readyUntil);
    $("super-button").classList.toggle("flash", superReady && ms < readyUntil);
    view.render(battle, catalog, self, aim, now, Math.min(0.08, now - last), current);
  }
  last = now;
  requestAnimationFrame(frame);
}

if (offlineCopy) {
  $("play-multi").disabled = true;
  $("download-solo").hidden = true;
  setCatalog(window.offlineFighters);
  status("Solo · Offline");
} else {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/offline-worker.js").catch(() => {
      // The downloadable build also works on origins without offline caching.
    });
  }
  fetch("/fighters.json")
    .then(response => {
      if (!response.ok) throw new Error("Roster unavailable");
      return response.json();
    })
    .then(fighters => {
      if (!chosen) setCatalog(fighters);
    })
    .catch(() => {
      if (!chosen) error("Could not load the fighters. Reload this page when the host server is available.");
    });
}
displayRoom();
$("audio-start").showModal();
requestAnimationFrame(frame);

