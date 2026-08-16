import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { zipSync } from "fflate";
const projectRoot = process.cwd();
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const releaseName = `DriveLens-v${packageJson.version}`;
const releaseDirectory = resolve(projectRoot, "release");
const stagingDirectory = resolve(releaseDirectory, releaseName);
const archivePath = resolve(releaseDirectory, `${releaseName}.zip`);
const archiveChecksumPath = `${archivePath}.sha256`;
const whitelist = [
  ".env.example",
  ".gitignore",
  ".openai",
  "README.md",
  "app",
  "build",
  "docs",
  "eslint.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "public",
  "real data",
  "scripts",
  "submission",
  "tests",
  "tsconfig.app.json",
  "tsconfig.json",
  "video/drivelens-demo/.media",
  "video/drivelens-demo/assets",
  "video/drivelens-demo/BRIEF.md",
  "video/drivelens-demo/frame.md",
  "video/drivelens-demo/hyperframes.json",
  "video/drivelens-demo/index.html",
  "video/drivelens-demo/index.motion.json",
  "video/drivelens-demo/meta.json",
  "video/drivelens-demo/narration.json",
  "video/drivelens-demo/package.json",
  "video/drivelens-demo/SCRIPT.md",
  "video/drivelens-demo/scripts/build-composition.mjs",
  "video/drivelens-demo/scripts/encode-captured-frames.ps1",
  "video/drivelens-demo/scripts/generate-voice.ps1",
  "video/drivelens-demo/STORYBOARD.md",
  "video/drivelens-demo/timeline.json",
  "vite.config.ts",
  "worker",
  "启动演示.ps1",
  "【双击这里】启动DriveLens演示.cmd",
  "提交说明.txt",
  "dist",
];
const optionalReleaseItems = [
  "video/DriveLens_复赛Demo.mp4",
];
const buildInputItems = [
  ".openai",
  "app",
  "build",
  "public",
  "worker",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.app.json",
  "tsconfig.json",
  "vite.config.ts",
];

function isInside(parent, candidate) {
  const normalizedParent = `${resolve(parent)}${sep}`;
  return resolve(candidate).startsWith(normalizedParent);
}

async function assertExists(path) {
  try {
    await stat(path);
  } catch {
    throw new Error(`Required release item is missing: ${relative(projectRoot, path)}`);
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function newestFileMtime(directory) {
  const files = await listFiles(directory);
  let newest = 0;
  for (const file of files) newest = Math.max(newest, (await stat(file)).mtimeMs);
  return newest;
}

async function sha256(path) {
  return await new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

for (const item of whitelist) {
  await assertExists(resolve(projectRoot, item));
}
for (const item of optionalReleaseItems) {
  try {
    await stat(resolve(projectRoot, item));
    whitelist.push(item);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await assertExists(resolve(projectRoot, "dist", "server", "index.js"));
await assertExists(resolve(projectRoot, "dist", "client", "assets"));

const sourceMtimes = [];
for (const item of buildInputItems) {
  const sourcePath = resolve(projectRoot, item);
  const sourceStat = await stat(sourcePath);
  sourceMtimes.push(sourceStat.isDirectory() ? await newestFileMtime(sourcePath) : sourceStat.mtimeMs);
}
const newestSourceMtime = Math.max(...sourceMtimes);
const newestDistMtime = await newestFileMtime(resolve(projectRoot, "dist"));
if (newestDistMtime < newestSourceMtime) {
  throw new Error("dist is older than the current build inputs. Run npm run build before creating the release package.");
}

if (!isInside(projectRoot, releaseDirectory) || !isInside(releaseDirectory, stagingDirectory)) {
  throw new Error("Release output resolved outside the project release directory.");
}

await rm(stagingDirectory, { recursive: true, force: true });
await rm(archivePath, { force: true });
await rm(archiveChecksumPath, { force: true });
await mkdir(stagingDirectory, { recursive: true });

for (const item of whitelist) {
  const source = resolve(projectRoot, item);
  const destination = resolve(stagingDirectory, item);
  if (!isInside(stagingDirectory, destination)) {
    throw new Error(`Unsafe release destination: ${item}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

const manifest = {
  schemaVersion: 1,
  project: packageJson.name,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  startup: {
    node: packageJson.engines?.node ?? "unspecified",
    install: "npm ci",
    command: "双击【双击这里】启动DriveLens演示.cmd 或 npm start",
    url: "http://localhost:3001/",
  },
  whitelist,
};
await writeFile(resolve(stagingDirectory, "RELEASE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const stagedFiles = await listFiles(stagingDirectory);
const checksumLines = [];
for (const file of stagedFiles) {
  const pathInPackage = relative(stagingDirectory, file).split(sep).join("/");
  checksumLines.push(`${await sha256(file)}  ${pathInPackage}`);
}
await writeFile(resolve(stagingDirectory, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`, "utf8");

try {
  const archiveEntries = {};
  const archiveFiles = await listFiles(stagingDirectory);
  for (const file of archiveFiles) {
    const pathInPackage = relative(stagingDirectory, file).split(sep).join("/");
    archiveEntries[`${releaseName}/${pathInPackage}`] = await readFile(file);
  }
  await writeFile(archivePath, zipSync(archiveEntries, { level: 6 }));
  await writeFile(archiveChecksumPath, `${await sha256(archivePath)}  ${basename(archivePath)}\n`, "utf8");
  console.log(`[release:package] Created ${relative(projectRoot, archivePath)} and ${relative(projectRoot, archiveChecksumPath)}.`);
} catch (error) {
  await rm(stagingDirectory, { recursive: true, force: true });
  await rm(archivePath, { force: true });
  await rm(archiveChecksumPath, { force: true });
  throw error;
}
