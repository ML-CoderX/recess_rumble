import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const blender = process.env.BLENDER_PATH ?? (process.platform === "win32"
  ? "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" : "blender");
const python = process.env.PYTHON_PATH ?? "python";
const characters = ["muawiz", "firas"];
const author = process.argv.includes("--create-models");
const qaOnly = process.argv.includes("--qa-only");
const single = process.argv.find(arg => arg.startsWith("--character="))?.split("=")[1];
if (single && !characters.includes(single)) throw new Error("Unknown character: " + single);
const run = (command, args) => new Promise((done, fail) => {
  const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
  child.on("error", fail);
  child.on("exit", code => code === 0 ? done() : fail(new Error(command + " exited " + code)));
});
if (author) {
  await run(python, ["scripts/blender/prepare_faces.py"]);
  await run(blender, ["--background", "--factory-startup", "--python", "scripts/blender/build_models.py", "--",
    "--character", single ?? "all"]);
}
for (const character of single ? [single] : characters) {
  const file = resolve("assets/models/" + character + ".blend");
  if (!existsSync(file)) throw new Error("Missing " + file + ". Run with --create-models once to author the initial models.");
  await run(blender, ["--background", file, "--python", "scripts/blender/render_sprites.py", "--",
    "--out", resolve(".sprite-build/" + character), ...(qaOnly ? ["--qa-only"] : [])]);
  await run(python, ["scripts/blender/pack_sprites.py", "--character", character, ...(qaOnly ? ["--qa-only"] : [])]);
}
