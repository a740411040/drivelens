import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const vinextPackagePath = resolve(projectRoot, "node_modules", "vinext", "package.json");
const staticCachePath = resolve(projectRoot, "node_modules", "vinext", "dist", "server", "static-file-cache.js");
const expectedVersion = "0.0.50";
// Vinext 0.0.50 leaves path.relative() backslashes in its URL cache on Windows.
const original = "relativePath: path.relative(base, batch[j]),";
const patched = "relativePath: path.relative(base, batch[j]).split(path.sep).join(\"/\"),";

const vinextPackage = JSON.parse(await readFile(vinextPackagePath, "utf8"));
if (vinextPackage.version !== expectedVersion) {
  throw new Error(`Unsupported vinext version ${vinextPackage.version}. Expected ${expectedVersion}; review the Windows static-cache patch before upgrading.`);
}

const source = await readFile(staticCachePath, "utf8");
if (source.includes(patched)) {
  console.log("[patch:vinext] Windows-safe static asset cache patch already applied.");
} else if (source.includes(original)) {
  await writeFile(staticCachePath, source.replace(original, patched), "utf8");
  console.log("[patch:vinext] Applied Windows-safe static asset cache patch.");
} else {
  throw new Error("Unable to locate the expected vinext static-cache implementation. Refusing to apply an unreviewed patch.");
}
