import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  absWorkingDir: extensionRoot,
  entryPoints: ["src/index.tsx"],
  outfile: "assets/countdown-timer.js",
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  charset: "utf8",
});
