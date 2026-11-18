import { clamp } from "/shared/arena.js";

const KEY = "recess-rumble-controls";
const NAMES = { move: "Move", attack: "Attack", super: "Super" };
const IDS = { move: "move-stick", attack: "aim-stick", super: "super-button" };
const defaults = () => ({
  scale: 1, move: 1, attack: 1, super: 1, opacity: 0.85,
  leftHanded: false, floating: false, assist: true, positions: {}
});
const clone = value => JSON.parse(JSON.stringify(value));
const coarse = matchMedia("(pointer: coarse)");

function load() {
  const value = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    for (const key of ["scale", "move", "attack", "super", "opacity"]) {
      if (Number.isFinite(saved?.[key])) value[key] = clamp(saved[key], key === "opacity" ? 0.2 : 0.6, key === "opacity" ? 1 : 1.8);
    }
    for (const key of ["leftHanded", "floating", "assist"]) {
      if (typeof saved?.[key] === "boolean") value[key] = saved[key];
    }
    for (const key of Object.keys(IDS)) {
      const p = saved?.positions?.[key];
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) value.positions[key] = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
    }
  } catch { /* Settings can be unavailable in private browsing. */ }
  return value;
}

export class TouchControls {
  constructor({ canPlay, move, aim, tapAttack, superAttack, clear }) {
    Object.assign(this, { canPlay, move, aim, tapAttack, superAttack, clear });
    this.settings = load();
    this.active = new Map();
    this.nodes = Object.fromEntries(Object.entries(IDS).map(([key, id]) => [key, document.getElementById(id)]));
    this.editor = document.getElementById("layout-editor");
    this.preview = document.getElementById("layout-preview");
    for (const key of Object.keys(IDS)) {
      this.bind(this.nodes[key], key, false);
      const copy = document.createElement(key === "super" ? "button" : "div");
      copy.className = key === "super" ? "layout-control layout-super" : "layout-control stick";
      copy.dataset.control = key;
      copy.innerHTML = key === "super" ? "Super" : "<i></i><span>" + NAMES[key] + "</span>";
      if (key === "super") copy.type = "button";
      this.preview.append(copy);
      this.bind(copy, key, true);
    }
    document.getElementById("arena").addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" || !this.settings.floating || !this.canPlay() || this.active.has("move")) return;
      const half = event.clientX < innerWidth / 2;
      if (half === !this.settings.leftHanded) this.start(event, "move", this.nodes.move, true);
    });
    for (const key of ["scale", "move", "attack", "super", "opacity"]) {
      const input = document.getElementById("control-" + key);
      input.addEventListener("input", () => {
        this.settings[key] = Number(input.value) / 100;
        this.save();
        this.apply();
        this.refresh();
      });
    }
    for (const key of ["leftHanded", "floating", "assist"]) {
      document.getElementById("control-" + key).addEventListener("change", event => {
        this.settings[key] = event.target.checked;
        this.resetInput();
        this.save();
        this.apply();
      });
    }
    document.getElementById("edit-layout").addEventListener("click", () => {
      this.clear();
      this.draft = clone(this.settings);
      this.editor.showModal();
      this.apply();
    });
    document.getElementById("layout-reset").addEventListener("click", () => {
      this.draft.positions = {};
      this.draft.leftHanded = false;
      this.apply();
    });
    document.getElementById("layout-save").addEventListener("click", () => {
      this.settings = this.draft;
      this.save();
      this.editor.close();
      this.refresh();
    });
    this.editor.addEventListener("close", () => { this.draft = null; this.apply(); });
    window.addEventListener("resize", () => { this.resetInput(); this.apply(); });
    coarse.addEventListener("change", () => { this.resetInput(); this.apply(); });
    this.refresh();
    this.apply();
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* Optional persistence. */ }
  }

  refresh() {
    for (const key of ["scale", "move", "attack", "super", "opacity"]) {
      const percent = Math.round(this.settings[key] * 100);
      document.getElementById("control-" + key).value = percent;
      document.getElementById("control-" + key + "-value").textContent = percent + "%";
    }
    for (const key of ["leftHanded", "floating", "assist"]) document.getElementById("control-" + key).checked = this.settings[key];
  }

  bounds() {
    const style = getComputedStyle(document.getElementById("control-safe-area"));
    return {
      left: parseFloat(style.paddingLeft) + 10,
      right: innerWidth - parseFloat(style.paddingRight) - 10,
      top: parseFloat(style.paddingTop) + 67,
      bottom: innerHeight - parseFloat(style.paddingBottom) - 10
    };
  }

  layout(settings) {
    const b = this.bounds();
    const shorter = Math.min(innerWidth, innerHeight);
    const base = Math.max(140, shorter * 0.22);
    const result = {};
    for (const key of Object.keys(IDS)) {
      const wanted = (key === "super" ? Math.max(80, shorter * 0.125) : base) * settings.scale * settings[key];
      const size = Math.min(wanted, b.bottom - b.top, (b.right - b.left) * 0.46);
      const mirror = settings.leftHanded;
      const left = key === "move" ? !mirror : mirror;
      const saved = settings.positions[key];
      let x = saved ? saved.x * innerWidth : left ? b.left + size / 2 + 5 : b.right - size / 2 - 5;
      if (saved && mirror) x = innerWidth - x;
      const y = saved ? saved.y * innerHeight : key === "super"
        ? result.attack.y - result.attack.size / 2 - size / 2 - 17 : b.bottom - size / 2 - 3;
      result[key] = this.clampPosition(x, y, size);
    }
    return result;
  }

  clampPosition(x, y, size) {
    const b = this.bounds();
    // Keep the full top HUD band and the centered super meter free.
    x = clamp(x, b.left + size / 2, b.right - size / 2);
    y = clamp(y, b.top + size / 2, b.bottom - size / 2);
    const meter = { left: innerWidth / 2 - 85, right: innerWidth / 2 + 85, top: b.bottom - 57 };
    if (x + size / 2 > meter.left && x - size / 2 < meter.right && y + size / 2 > meter.top) {
      y = Math.max(b.top + size / 2, meter.top - size / 2 - 8);
    }
    return { x, y, size };
  }

  place(node, p, opacity) {
    Object.assign(node.style, {
      left: p.x + "px", top: p.y + "px", width: p.size + "px", height: p.size + "px",
      opacity: String(opacity)
    });
  }

  apply() {
    const layout = this.layout(this.settings);
    for (const [key, node] of Object.entries(this.nodes)) this.place(node, layout[key], this.settings.opacity);
    if (this.draft) {
      const preview = this.layout(this.draft);
      for (const node of this.preview.querySelectorAll("[data-control]")) this.place(node, preview[node.dataset.control], this.draft.opacity);
    }
  }

  bind(node, key, editing) {
    node.addEventListener("pointerdown", event => {
      if (editing) {
        event.preventDefault();
        if (this.drag) return;
        this.drag = { id: event.pointerId, key, node };
        node.setPointerCapture(event.pointerId);
        return;
      }
      this.start(event, key, node);
    });
    node.addEventListener("pointermove", event => {
      if (editing && this.drag?.id === event.pointerId) {
        const size = node.getBoundingClientRect().width;
        const p = this.clampPosition(event.clientX, event.clientY, size);
        this.draft.positions[key] = { x: (this.draft.leftHanded ? innerWidth - p.x : p.x) / innerWidth, y: p.y / innerHeight };
        this.apply();
      } else if (!editing) this.position(event, key);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      node.addEventListener(type, event => {
        if (editing && this.drag?.id === event.pointerId) this.drag = null;
        else if (!editing) this.end(event, key, type === "pointerup");
      });
    }
  }

  start(event, key, node, floating = false) {
    if (event.pointerType !== "touch" || !this.canPlay() || this.active.has(key) || node.disabled) return;
    event.preventDefault();
    if (floating) {
      const size = node.getBoundingClientRect().width;
      this.place(node, this.clampPosition(event.clientX, event.clientY, size), this.settings.opacity);
    }
    const gesture = { id: event.pointerId, node, started: performance.now(), distance: 0 };
    this.active.set(key, gesture);
    node.setPointerCapture(event.pointerId);
    if (key === "super") this.superAttack();
    else this.position(event, key);
  }

  position(event, key) {
    const active = this.active.get(key);
    if (!active || active.id !== event.pointerId || key === "super") return;
    const box = active.node.getBoundingClientRect();
    const radius = box.width * 0.275;
    const dx = event.clientX - box.left - box.width / 2;
    const dy = event.clientY - box.top - box.height / 2;
    active.distance = Math.max(active.distance, Math.hypot(dx, dy));
    const length = Math.max(radius, Math.hypot(dx, dy));
    const x = dx / length, y = dy / length;
    active.node.querySelector("i").style.transform = "translate(" + x * radius + "px," + y * radius + "px)";
    if (key === "move") this.move(x, y);
    else this.aim(x, y);
  }

  end(event, key, released) {
    const active = this.active.get(key);
    if (!active || active.id !== event.pointerId) return;
    this.active.delete(key);
    if (key === "attack" && released && performance.now() - active.started < 230 && active.distance < 14) {
      this.tapAttack(this.settings.assist);
    }
    if (active.node.hasPointerCapture(active.id)) active.node.releasePointerCapture(active.id);
    if (key !== "super") active.node.querySelector("i").style.transform = "";
    if (key === "move") { this.move(0, 0); this.apply(); }
    if (key === "attack") this.aim(0, 0);
  }

  resetInput() {
    for (const [key, active] of this.active) this.end({ pointerId: active.id }, key, false);
  }
}
