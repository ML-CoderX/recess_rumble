const atlases = new Map();
const pages = new Map();
const MAX_PAGES = 6;

function atlasFor(sprite) {
  if (sprite.atlasData) return sprite.atlasData;
  const path = sprite.atlas;
  if (!path) return null;
  if (!atlases.has(path)) {
    const record = { data: null };
    atlases.set(path, record);
    fetch(path).then(response => {
      if (!response.ok) throw new Error("Sprite atlas unavailable");
      return response.json();
    }).then(data => { record.data = data; }).catch(() => {});
  }
  return atlases.get(path).data;
}

function pageFor(path) {
  if (!path) return null;
  let image = pages.get(path);
  if (image) {
    pages.delete(path);
    pages.set(path, image);
    return image;
  }
  image = new Image();
  image.src = path;
  pages.set(path, image);
  while (pages.size > MAX_PAGES) {
    const oldest = pages.keys().next().value;
    pages.get(oldest).src = "";
    pages.delete(oldest);
  }
  return image;
}

export class AnimatedSprites {
  constructor() {
    this.actors = new Map();
  }

  reset() {
    this.actors.clear();
  }

  draw(ctx, player, sprite, angle, now, reduced) {
    const atlas = atlasFor(sprite);
    if (!atlas) return false;
    const state = player.napping ? "nap" : player.state === "defeated" ? "defeat" : player.state;
    const animation = atlas.animations?.[state] ?? atlas.animations?.idle;
    const direction = Math.round(angle / (Math.PI / 4) + 8) % 8;
    const frames = animation?.directions?.[direction];
    if (!frames?.length) return false;
    let actor = this.actors.get(player.id);
    if (!actor || actor.state !== state) {
      actor = { state, start: now };
      this.actors.set(player.id, actor);
    }
    const elapsed = Math.floor((now - actor.start) * animation.fps);
    const index = reduced ? (state === "defeat" ? frames.length - 1 : 0)
      : animation.loop ? elapsed % frames.length : Math.min(elapsed, frames.length - 1);
    const [x, y, width, height, page, frameX, frameY, frameScale = 1] = frames[index];
    const image = pageFor(atlas.images?.[page]);
    if (!image?.complete || !image.naturalWidth) return false;
    const size = (atlas.drawSize ?? 115) * frameScale;
    const [ax, ay] = Number.isFinite(frameX) ? [frameX, frameY] : atlas.anchor ?? [0.5, 0.84];
    ctx.drawImage(image, x, y, width, height, -size * ax, -size * ay, size, size);
    return true;
  }
}
