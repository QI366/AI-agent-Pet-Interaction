import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "assets/manifest.json"), "utf8"));
const assetRoot = resolve(root, "assets");
const files = new Set();
const add = (file) => { if (typeof file === "string") files.add(file); };
for (const pose of manifest.characters.poodle.poses) if (pose.file && pose.status !== "todo") add(pose.file);
for (const entry of manifest.characters.poodle.expressions) if (entry.status !== "todo") for (const file of entry.files || []) add(file);
for (const set of manifest.characters.poodle.layers.sets) if (set.status !== "todo") Object.values(set.files || {}).forEach(add);
for (const entry of [...manifest.props, ...manifest.fx]) {
  add(entry.file);
  if (Array.isArray(entry.files)) entry.files.forEach(add);
}
const missing = [];
for (const relative of files) {
  const path = resolve(assetRoot, relative);
  if (!path.startsWith(`${assetRoot}${sep}`)) { missing.push(`${relative} (unsafe path)`); continue; }
  try { await access(path); } catch { missing.push(relative); }
}
console.log(`Manifest assets checked: ${files.size}; missing or unsafe: ${missing.length}`);
for (const file of missing) console.error(`MISSING ${file}`);
if (missing.length) process.exitCode = 1;
