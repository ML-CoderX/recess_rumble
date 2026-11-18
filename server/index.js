import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { performance } from "node:perf_hooks";
import { WebSocketServer, WebSocket } from "ws";
import { Battle } from "../shared/battle.js";
import { LIMIT, pickMap } from "../shared/arena.js";
import { loadAudio, loadFighters, loadMaps, buildSoloPage, root } from "./game-files.js";

const time = () => performance.now() / 1000;
const fighters = await loadFighters();
const defaultFighter = fighters.muawiz?.id ?? Object.keys(fighters)[0];
const audio = await loadAudio();
const maps = await loadMaps();
const soloPage = await buildSoloPage(fighters, audio, maps);
const offlineVersion = createHash("sha256").update(soloPage).digest("hex").slice(0, 16);

const types = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", svg: "image/svg+xml", png: "image/png",
  webp: "image/webp", woff2: "font/woff2", mp3: "audio/mpeg", ogg: "audio/ogg",
  webmanifest: "application/manifest+json; charset=utf-8"
};
const files = /^\/(?:public\/[a-z0-9-]+\.(?:js|css|svg|png|webmanifest)|shared\/[a-z0-9-]+\.js|assets\/(?:sprites|fonts|maps)\/[a-z0-9_-]+\.(?:svg|png|webp|woff2)|assets\/sounds\/[a-z0-9_-]+\.(?:mp3|ogg)|assets\/voices\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:mp3|ogg))$/i;
const server = createServer(async (req, res) => {
  const path = req.url?.split("?")[0];
  const file = path === "/" ? "public/index.html" : files.test(path) ? path.slice(1) : null;
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    if (path === "/fighters.json") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" })
        .end(req.method === "HEAD" ? undefined : JSON.stringify(Object.values(fighters)));
      return;
    }
    if (path === "/audio.json") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" })
        .end(req.method === "HEAD" ? undefined : JSON.stringify(audio));
      return;
    }
    if (path === "/maps.json") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" })
        .end(req.method === "HEAD" ? undefined : JSON.stringify(maps));
      return;
    }
    if (path === "/solo.html" || path === "/offline-shell") {
      const headers = { "Content-Type": types.html, "Cache-Control": "no-cache" };
      if (path === "/solo.html") headers["Content-Disposition"] = 'attachment; filename="recess-rumble-solo.html"';
      res.writeHead(200, headers).end(req.method === "HEAD" ? undefined : soloPage);
      return;
    }
    if (path === "/offline-worker.js") {
      const code = await readFile(new URL("public/offline-worker.js", root), "utf8");
      res.writeHead(200, { "Content-Type": types.js, "Cache-Control": "no-cache" })
        .end(req.method === "HEAD" ? undefined : code.replace("__OFFLINE_VERSION__", offlineVersion));
      return;
    }
    if (!file) {
      res.writeHead(404).end("Not found");
      return;
    }
    const content = await readFile(new URL(file, root));
    res.writeHead(200, {
      "Content-Type": types[file.split(".").pop().toLowerCase()],
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"
    }).end(req.method === "HEAD" ? undefined : content);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

const sockets = new WebSocketServer({ server, path: "/play", maxPayload: 2048 });
const rooms = new Map();
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const memberInfo = ({ id, name, fighter }) => ({ id, name, fighter });

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024) {
    socket.send(typeof message === "string" ? message : JSON.stringify(message));
  }
}

function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const member of room.members.values()) send(member.socket, data);
}

function sync(room) {
  broadcast(room, {
    type: "room", code: room.code, host: room.host, bots: room.bots, takeover: room.takeover,
    map: room.map, running: !!room.battle, members: [...room.members.values()].map(memberInfo)
  });
}

function sendBattle(room, now) {
  for (const member of room.members.values()) {
    send(member.socket, room.battle.snapshot(now, member.id));
  }
}

function roomCode() {
  let candidate;
  do {
    candidate = Array.from({ length: 5 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join("");
  } while (rooms.has(candidate));
  return candidate;
}

function leave(member) {
  const room = member.room;
  member.room = null;
  if (!room) return;
  room.members.delete(member.id);
  if (!room.members.size) {
    rooms.delete(room.code);
    return;
  }
  if (room.host === member.id) room.host = room.members.keys().next().value;
  room.battle?.remove(member.id, time(), room.takeover);
  sync(room);
}

function entry(member, message) {
  const name = typeof message.name === "string" ?
    message.name.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 18) : "";
  if (!name) throw new Error("Enter a player name.");
  if (member.room) throw new Error("Leave your current room first.");
  let room;
  if (message.type === "create") {
    const code = roomCode();
    room = { code, host: member.id, bots: true, takeover: false, map: "random", members: new Map(), battle: null };
    rooms.set(code, room);
  } else {
    const code = typeof message.code === "string" ? message.code.toUpperCase().trim() : "";
    room = rooms.get(code);
    if (!room) throw new Error("Room code not found.");
    if (room.battle) throw new Error("A match is in progress. Join from the lobby between rounds.");
    if (room.members.size >= LIMIT) throw new Error("This room is full.");
  }
  member.name = name;
  member.fighter = typeof message.fighter === "string" && fighters[message.fighter]
    ? message.fighter : defaultFighter;
  member.room = room;
  room.members.set(member.id, member);
  sync(room);
}

sockets.on("connection", socket => {
  const member = { id: randomUUID(), socket, room: null, name: "", fighter: defaultFighter };
  socket.alive = true;
  socket.on("pong", () => { socket.alive = true; });
  socket.on("error", () => {});
  socket.on("close", () => leave(member));
  send(socket, { type: "hello", id: member.id, fighters: Object.values(fighters), maps });
  let windowEnds = 0;
  let count = 0;
  socket.on("message", raw => {
    const now = time();
    if (now >= windowEnds) { count = 0; windowEnds = now + 1; }
    if (++count > 90) return;
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message !== "object") return;
      if (message.type === "create" || message.type === "join") {
        entry(member, message);
        return;
      }
      const room = member.room;
      if (!room) return;
      if (message.type === "input") {
        room.battle?.input(member.id, message, now);
      } else if (message.type === "leave") {
        leave(member);
        send(socket, { type: "left" });
      } else if (message.type === "select" && !room.battle &&
          typeof message.fighter === "string" && fighters[message.fighter]) {
        member.fighter = message.fighter;
        sync(room);
      } else if (room.host === member.id) {
        if (message.type === "bots" && !room.battle) {
          room.bots = message.enabled === true;
          sync(room);
        } else if (message.type === "takeover" && !room.battle) {
          room.takeover = message.enabled === true;
          sync(room);
        } else if (message.type === "map" && !room.battle &&
            (message.map === "random" || maps.some(map => map.id === message.map))) {
          room.map = message.map;
          sync(room);
        } else if (message.type === "start" && !room.battle) {
          if (!room.bots && room.members.size < 2) {
            throw new Error("Invite another player or turn on bots.");
          }
          room.battle = new Battle([...room.members.values()].map(memberInfo), fighters, room.bots, now,
            pickMap(maps, room.map));
          sync(room);
          sendBattle(room, now);
        } else if (message.type === "lobby" && room.battle?.result) {
          room.battle = null;
          sync(room);
        }
      }
    } catch (error) {
      send(socket, { type: "error", message: error instanceof SyntaxError ? "Invalid message." : error.message });
    }
  });
});

let previous = time();
let lastBroadcast = previous;
setInterval(() => {
  const now = time();
  const dt = Math.min(now - previous, 0.05);
  previous = now;
  const shouldBroadcast = now - lastBroadcast >= 0.046;
  for (const room of rooms.values()) {
    if (!room.battle) continue;
    room.battle.update(now, dt);
    if (shouldBroadcast) sendBattle(room, now);
  }
  if (shouldBroadcast) lastBroadcast = now;
}, 1000 / 60).unref();

setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.alive) socket.terminate();
    else { socket.alive = false; socket.ping(); }
  }
}, 8000).unref();

const port = Number(process.env.PORT ?? 3000);
server.listen(port, "0.0.0.0", () => {
  const actualPort = server.address().port;
  console.log("Recess Rumble: http://localhost:" + actualPort);
  for (const address of Object.values(networkInterfaces()).flat()) {
    if (address.family === "IPv4" && !address.internal) {
      console.log("Same Wi-Fi:    http://" + address.address + ":" + actualPort);
    }
  }
});

