import { register } from "node:module";

// Node runs the TypeScript sources directly (type stripping, Node 22.6+), but
// its ESM resolver wants an explicit extension where TypeScript's bundler
// resolution does not. This maps "./voice" onto "./voice.ts" so the app's own
// files can be tested unmodified, with no build step and no test framework.
register("./resolve-ts.mjs", import.meta.url);
