import { createBuilder } from "vite";

// Restricted Windows environments cannot spawn Wrangler's esbuild service.
// The native Vite loader keeps the local production build in-process.
process.env.DRIVELENS_NATIVE_BUILD = "1";

const builder = await createBuilder({
  root: process.cwd(),
  configLoader: "native",
});
await builder.buildApp();
