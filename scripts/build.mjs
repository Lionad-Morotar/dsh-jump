/**
 * Build the shipped `lib/` tree.
 *
 * The Harness serves the client half straight out of the installed package
 * (`exports["./client"]`) and never runs a build step, so `lib/` is a build
 * product that is committed, and this script is the only thing that writes it.
 *
 *   lib/index.js   Host half, plain ESM (Node imports it directly).
 *   lib/client.js  Browser half, CJS wrapped in a ModuleLoader factory.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const libRoot = join(packageRoot, "lib");
const require = createRequire(join(packageRoot, "package.json"));
const manifest = require(join(packageRoot, "package.json"));

/**
 * The ModuleLoader wrapper for the client half. `window.__ModuleLoader__.load`
 * accepts only `{id, factory}` and the id must equal the package name, because
 * the loader keys its module table on it. The factory must return the plugin
 * object `{name, inject, apply}`; an IIFE result is rejected at mount.
 *
 * The bundle text is inserted verbatim and deliberately NOT re-indented: the
 * minified code may contain multi-line template literals, and padding every
 * line would inject that padding into the string itself (the skin package
 * once shipped four phantom columns of garbage this way). esbuild emits a
 * lone default export as `module.exports.default`, hence the unwrap.
 */
function wrap(id, code) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports.default ?? module.exports;
  }
});
`;
}

/**
 * Bundle one entry to minified text. The halves differ in module system and
 * getting this wrong is a boot failure, not a warning: the host half is
 * imported by Node from an ESM package, while the client half is evaluated by
 * the browser as a classic script inside the factory.
 */
async function bundle(entry, format) {
  const host = format === "esm";
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format,
    platform: host ? "node" : "browser",
    target: "es2022",
    minify: true,
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const output = result.outputFiles?.[0];
  if (output === undefined) throw new Error(`esbuild produced nothing for ${entry}`);
  return output.text;
}

async function main() {
  await rm(libRoot, { recursive: true, force: true });
  await mkdir(libRoot, { recursive: true });

  await writeFile(join(libRoot, "index.js"), await bundle(join(packageRoot, "src", "index.ts"), "esm"), "utf8");

  const client = await bundle(join(packageRoot, "src", "client", "entry.ts"), "cjs");
  await writeFile(join(libRoot, "client.js"), wrap(manifest.name, client), "utf8");

  const written = ["index.js", "client.js"];
  const sizes = await Promise.all(
    written.map(async (file) => {
      const bytes = await readFile(join(libRoot, file));
      return `${file.padEnd(16)} ${String(bytes.length).padStart(8)} B`;
    }),
  );
  process.stdout.write(`${written.length} files\n${sizes.join("\n")}\n`);
}

await main();
