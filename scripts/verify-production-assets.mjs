import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startProdServer } from "vinext/server/prod-server";

const projectRoot = process.cwd();
const distDirectory = resolve(projectRoot, "dist");
const patchedStaticCache = resolve(projectRoot, "node_modules", "vinext", "dist", "server", "static-file-cache.js");
const requiredPatch = "relativePath: path.relative(base, batch[j]).split(path.sep).join(\"/\"),";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

await access(resolve(distDirectory, "server", "index.js"));
await access(resolve(distDirectory, "client", "assets"));

const staticCacheSource = await readFile(patchedStaticCache, "utf8");
assert(
  staticCacheSource.includes(requiredPatch),
  "vinext Windows static-asset patch is missing. Run npm ci without --ignore-scripts, or run npm run postinstall."
);

const started = await startProdServer({
  host: "127.0.0.1",
  outDir: distDirectory,
  port: 0,
});

try {
  const baseUrl = `http://127.0.0.1:${started.port}`;
  const pageResponse = await fetch(`${baseUrl}/`);
  assert(pageResponse.ok, `Production homepage returned HTTP ${pageResponse.status}.`);

  const html = await pageResponse.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+(?:\?[^"#]*)?)"/g)]
    .map((match) => match[1])
    .filter((asset, index, values) => values.indexOf(asset) === index);

  assert(assets.length > 0, "Production homepage does not reference any built assets.");

  for (const asset of assets) {
    const response = await fetch(`${baseUrl}${asset}`);
    assert(response.ok, `Production asset ${asset} returned HTTP ${response.status}.`);
    assert((await response.arrayBuffer()).byteLength > 0, `Production asset ${asset} was empty.`);
  }

  console.log(`[verify:production-assets] Verified ${assets.length} production assets at ${baseUrl}.`);
} finally {
  await closeServer(started.server);
}
