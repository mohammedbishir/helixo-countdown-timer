import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetPath = resolve(
  packageRoot,
  "../extensions/countdown-timer/assets/countdown-timer.js"
);

await esbuild.build({
  absWorkingDir: packageRoot,
  entryPoints: ["src/index.tsx"],
  outfile: assetPath,
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
