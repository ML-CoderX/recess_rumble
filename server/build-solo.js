import { writeFile } from "node:fs/promises";
import { buildSoloPage, loadFighters, root } from "./game-files.js";

const file = "recess-rumble-solo.html";
await writeFile(new URL(file, root), await buildSoloPage(await loadFighters()));
console.log("Built " + file + ". Open it in a browser to play offline.");
