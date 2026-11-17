const touchPrimary = matchMedia("(pointer: coarse)");
const installed = () => matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
let landscapeLocked = false;

export async function enterMobilePresentation(event) {
  if (event.pointerType !== "touch" && !touchPrimary.matches) return;
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !installed()) {
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
    }
  } catch {
    // The rotate hint handles unsupported fullscreen and embedded browser tabs.
  }
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
      landscapeLocked = true;
    }
  } catch {
    // The OS controls orientation when locking is unavailable.
  }
}

function releaseOrientation() {
  if (!landscapeLocked || document.fullscreenElement || document.webkitFullscreenElement) return;
  screen.orientation?.unlock?.();
  landscapeLocked = false;
}

document.addEventListener("fullscreenchange", releaseOrientation);
document.addEventListener("webkitfullscreenchange", releaseOrientation);
