#!/usr/bin/env node
/**
 * Frame budget bench for the dsh-jump label overlay.
 *
 * The interactive cost of a round lives in one browser realm: hint collection,
 * badge minting and the repaint of every stroke that follows. jsdom has neither
 * layout nor frames, so the only honest way to put a number on it is to open a
 * real page and time `dispatchEvent` plus the gap to the next paint. This
 * script builds that page out of the shipped client source, so the bench cannot
 * silently measure a copy of the app that has drifted from `src/`.
 *
 * The page is self-contained on purpose: the IIFE bundle is inlined, no host,
 * no loader, no network. Opening the file is the whole setup.
 */
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const CLIENT_ROOT = join(PACKAGE_ROOT, "src", "client");
const GLOBAL_NAME = "__DSH_JUMP_BENCH__";
const OUTPUT_DIR = join(tmpdir(), "dsh-jump-bench");

export const DEFAULT_CANDIDATES = [80, 300, 600];
export const DEFAULT_RUNS = 20;

/**
 * Nearest-rank percentile, deliberately not interpolated.
 *
 * The readings go into a diff between two runs, so the definition has to be
 * one a human can recompute by hand from the printed samples: sort, take the
 * ceiling rank. Interpolation would make a one-sample change move every
 * percentile a little and hide which run actually got slower.
 */
export function nearestRankPercentile(samples, percentile) {
  if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
  if (typeof percentile !== "number" || !Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
    throw new RangeError(`percentile must be within 0..100, got ${String(percentile)}`);
  }
  if (samples.length === 0) return null;
  for (const sample of samples) {
    if (typeof sample !== "number" || !Number.isFinite(sample)) {
      throw new TypeError(`samples must be finite numbers, got ${String(sample)}`);
    }
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function parseCandidates(raw) {
  const parts = raw.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === "")) {
    throw new Error(`--candidates expects comma-separated positive integers, got "${raw}"`);
  }
  const values = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error(`--candidates expects comma-separated positive integers, got "${raw}"`);
    }
    const value = Number(part);
    if (!Number.isSafeInteger(value) || value <= 0 || value > 5000) {
      throw new Error(`--candidates entries must be integers within 1..5000, got "${part}"`);
    }
    return value;
  });
  return [...new Set(values)];
}

function parseRuns(raw) {
  if (!/^\d+$/.test(raw)) throw new Error(`--runs expects a positive integer, got "${raw}"`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1000) {
    throw new Error(`--runs must be an integer within 1..1000, got "${raw}"`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = { check: false, help: false, candidates: DEFAULT_CANDIDATES, runs: DEFAULT_RUNS, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--check") {
      options.check = true;
      continue;
    }
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (flag === "--candidates" || flag === "--runs" || flag === "--out") {
      const value = argv[index + 1];
      if (value === undefined || value === "") throw new Error(`${flag} needs a value`);
      index += 1;
      if (flag === "--candidates") options.candidates = parseCandidates(value);
      else if (flag === "--runs") options.runs = parseRuns(value);
      else options.out = value;
      continue;
    }
    throw new Error(`unknown option "${flag}"`);
  }
  return options;
}

/**
 * Bundle `createApp` as a browser IIFE.
 *
 * `entry.ts` is deliberately not the entry: it expects the host ModuleLoader
 * and a seeded React, neither of which exists on the bench page. `app.ts` is
 * the whole DOM-facing surface and depends on no host module, so a virtual
 * entry around it produces an app that a bare page can call.
 */
export async function bundleApp() {
  const result = await build({
    stdin: {
      contents: 'export { createApp } from "./app.ts";',
      resolveDir: CLIENT_ROOT,
      loader: "ts",
      sourcefile: "bench-entry.ts",
    },
    bundle: true,
    format: "iife",
    globalName: GLOBAL_NAME,
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    write: false,
  });
  if (result.errors.length > 0) {
    throw new Error(`esbuild reported ${result.errors.length} error(s): ${result.errors[0]?.text ?? "unknown"}`);
  }
  const text = result.outputFiles?.[0]?.text ?? "";
  if (text === "") throw new Error("esbuild produced no bundle");
  return text;
}

/**
 * The measurement page.
 *
 * The grid is sized in fractions of the viewport from the candidate count so
 * every button is visible and non-zero at every tier, including 1200: hint
 * collection drops candidates that fall outside the viewport, and a tier that
 * silently measures fewer labels than it claims would make the readings
 * incomparable.
 */
function pageScript(config) {
  return `(() => {
  "use strict";
  const CONFIG = ${JSON.stringify(config)};
  const nearestRankPercentile = ${nearestRankPercentile.toString()};
  const root = document.querySelector("[data-bench-root]");
  const status = document.querySelector("[data-bench-status]");
  const output = document.querySelector("[data-bench-output]");
  const app = window.${GLOBAL_NAME}.createApp({ platform: "macos" });
  app.apply();

  function frame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function settle(frames) {
    for (let index = 0; index < frames; index += 1) await frame();
  }

  function keydown(key, modifiers) {
    const init = { key: key, bubbles: true, cancelable: true };
    if (modifiers !== undefined) Object.assign(init, modifiers);
    return new KeyboardEvent("keydown", init);
  }

  function buildGrid(count) {
    root.replaceChildren();
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const columns = Math.max(1, Math.ceil(Math.sqrt((count * width) / height)));
    const rows = Math.ceil(count / columns);
    root.style.gridTemplateColumns = "repeat(" + columns + ", minmax(0, 1fr))";
    root.style.gridTemplateRows = "repeat(" + rows + ", minmax(0, 1fr))";
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < count; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.benchCandidate = String(index);
      button.textContent = String(index + 1);
      fragment.append(button);
    }
    root.append(fragment);
  }

  function badgeLabels() {
    const badges = document.querySelectorAll("[data-jump-label]");
    return Array.from(badges, (badge) => badge.getAttribute("data-jump-label") ?? "");
  }

  function overlayCount() {
    return document.querySelectorAll("[data-dsh-jump-overlay]").length;
  }

  function roundMs(value) {
    return Math.round(value * 1000) / 1000;
  }

  function summarize(samples, field) {
    const values = samples.map((sample) => sample[field]);
    return {
      p50: roundMs(nearestRankPercentile(values, 50)),
      p95: roundMs(nearestRankPercentile(values, 95)),
    };
  }

  function phase(samples) {
    const handler = summarize(samples, "handlerMs");
    return {
      // p50/p95 are the synchronous handler cost, the number this bench is
      // asked to shrink; the frame gap keeps its own pair under nextFrameMs.
      p50: handler.p50,
      p95: handler.p95,
      handlerMs: handler,
      nextFrameMs: summarize(samples, "nextFrameMs"),
      samples: samples.length,
    };
  }

  // The gap is sampled across two animation frames so style and layout work
  // triggered by the dispatch lands before the reading instead of after it.
  function stroke(key, modifiers) {
    const event = keydown(key, modifiers);
    const start = performance.now();
    window.dispatchEvent(event);
    const dispatched = performance.now();
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve({ handlerMs: dispatched - start, nextFrameMs: performance.now() - dispatched });
        });
      });
    });
  }

  function exitRound() {
    window.dispatchEvent(keydown("Escape"));
  }

  async function runTier(candidates) {
    buildGrid(candidates);
    await settle(2);

    const activate = [];
    const firstStroke = [];
    let labels = 0;
    let overlays = 0;

    for (let index = 0; index < CONFIG.runs; index += 1) {
      activate.push(await stroke("h", { metaKey: true }));
      const badges = badgeLabels();
      if (index === 0) {
        labels = badges.length;
        overlays = overlayCount();
      }
      const first = badges[0];
      if (first === undefined || first === "") throw new Error("activation produced no label");
      firstStroke.push(await stroke(first.slice(0, 1)));
      // Resetting outside the timed window keeps one sample's teardown out of
      // the next sample's handler cost.
      exitRound();
      await settle(1);
    }

    // The completion round's activation is setup for the one stroke being
    // measured, so it stays out of the activation percentiles.
    await stroke("h", { metaKey: true });
    const labelsNow = badgeLabels();
    const completeLabel = labelsNow[0];
    if (completeLabel === undefined || completeLabel === "") throw new Error("activation produced no completion label");
    for (const key of completeLabel.slice(0, -1)) window.dispatchEvent(keydown(key));
    const complete = await stroke(completeLabel.slice(-1));

    return {
      candidates: candidates,
      labels: labels,
      overlayCount: overlays,
      activate: phase(activate),
      firstStroke: phase(firstStroke),
      complete: phase([complete]),
    };
  }

  async function run() {
    const startedAt = performance.now();
    const runs = [];
    for (let index = 0; index < CONFIG.candidates.length; index += 1) {
      const candidates = CONFIG.candidates[index];
      status.textContent = "running tier " + String(index + 1) + "/" + String(CONFIG.candidates.length) + " (" + String(candidates) + " candidates)";
      runs.push(await runTier(candidates));
      await settle(1);
    }
    const result = {
      viewport: [window.innerWidth, window.innerHeight],
      dpr: window.devicePixelRatio || 1,
      runs: runs,
    };
    window.__BENCH_RESULT__ = result;
    output.dataset.benchState = "done";
    output.textContent = JSON.stringify(result, null, 2);
    status.textContent = "done in " + String(Math.round(performance.now() - startedAt)) + "ms";
    console.log("BENCH_RESULT " + JSON.stringify(result));
    document.title = "dsh-jump bench done";
  }

  run().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    window.__BENCH_ERROR__ = message;
    output.dataset.benchState = "error";
    output.textContent = "BENCH FAILED\\n" + message;
    status.textContent = "failed";
    console.error(error);
    document.title = "dsh-jump bench failed";
  });
})();`;
}

export function pageHtml({ bundle, candidates, runs }) {
  const config = { candidates, runs };
  const inlined = bundle.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-jump frame budget bench</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
  [data-bench-root] {
    position: fixed;
    inset: 0;
    display: grid;
    gap: 0;
  }
  [data-bench-root] button {
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 1px solid #b9b9b9;
    background: #f6f6f6;
    color: #333;
    font: 9px/1 ui-monospace, Menlo, monospace;
    overflow: hidden;
  }
  [data-bench-status], [data-bench-output] {
    position: fixed;
    left: 8px;
    right: 8px;
    z-index: 2;
    margin: 0;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #ddd;
    border-radius: 4px;
    font: 11px/1.45 ui-monospace, Menlo, monospace;
    color: #111;
    pointer-events: none;
  }
  [data-bench-status] { bottom: 8px; }
  [data-bench-output] {
    top: 8px;
    max-height: 42vh;
    overflow: auto;
    white-space: pre-wrap;
    display: none;
  }
  [data-bench-output][data-bench-state="done"], [data-bench-output][data-bench-state="error"] { display: block; }
</style>
</head>
<body>
<div id="bench-root" data-bench-root></div>
<div id="bench-status" data-bench-status>starting</div>
<pre id="bench-output" data-bench-output></pre>
<script>${inlined}</script>
<script>${pageScript(config)}</script>
</body>
</html>
`;
}

async function writeArtifacts({ bundle, html, out }) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const bundlePath = join(OUTPUT_DIR, "dsh-jump-bench.bundle.js");
  await writeFile(bundlePath, bundle, "utf8");
  let htmlPath = join(OUTPUT_DIR, "dsh-jump-bench.html");
  await writeFile(htmlPath, html, "utf8");
  if (out !== null) {
    htmlPath = resolve(process.cwd(), out);
    await mkdir(dirname(htmlPath), { recursive: true });
    await writeFile(htmlPath, html, "utf8");
  }
  return { bundlePath, htmlPath };
}

/**
 * Optional automation probe.
 *
 * The repo ships no browser driver and adding one would change the install
 * surface for a measurement aid, so the normal path is manual. The probe still
 * runs: a machine that happens to have Playwright installed should be told that
 * automatic collection is not wired rather than being told it has no browser.
 */
async function detectBrowserDriver() {
  for (const name of ["playwright", "puppeteer"]) {
    try {
      await import(name);
      return name;
    } catch {
      // Not installed here; keep probing.
    }
  }
  return null;
}

const REQUIRED_HOOKS = [
  "data-bench-root",
  "data-bench-status",
  "data-bench-output",
  "data-bench-state",
  GLOBAL_NAME,
  "requestAnimationFrame",
  "KeyboardEvent",
  "dispatchEvent",
  "data-dsh-jump-overlay",
  "data-jump-label",
  "handlerMs",
  "nextFrameMs",
  "__BENCH_RESULT__",
  "nearestRankPercentile",
  "firstStroke",
  "complete",
];

function assertPercentileCases() {
  const cases = [
    { samples: [10, 20, 30, 40], p: 50, expected: 20 },
    { samples: [10, 20, 30, 40], p: 95, expected: 40 },
    { samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], p: 50, expected: 5 },
    { samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], p: 95, expected: 10 },
    { samples: [42], p: 50, expected: 42 },
    { samples: [42], p: 95, expected: 42 },
    { samples: [5, 1, 4, 2, 3], p: 0, expected: 1 },
    { samples: [5, 1, 4, 2, 3], p: 100, expected: 5 },
    { samples: [], p: 50, expected: null },
  ];
  for (const item of cases) {
    const actual = nearestRankPercentile(item.samples, item.p);
    if (actual !== item.expected) {
      throw new Error(
        `percentile p${item.p} of [${item.samples.join(",")}] is ${String(actual)}, expected ${String(item.expected)}`,
      );
    }
  }
}

function assertOfflineSource(source) {
  const specifiers = [...source.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]);
  const allowed = new Set(["esbuild", "node:fs/promises", "node:os", "node:path", "node:url"]);
  for (const specifier of specifiers) {
    if (!allowed.has(specifier)) throw new Error(`bench imports "${specifier}", which may reach the network`);
  }
  if (specifiers.length === 0) throw new Error("bench source exposes no imports; the offline assertion would pass vacuously");
}

function assertNoNetworkApis(text, label) {
  const patterns = [
    { name: "fetch(", re: /\bfetch\s*\(/ },
    { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
    { name: "WebSocket", re: /\bWebSocket\b/ },
    { name: "importScripts", re: /\bimportScripts\b/ },
    { name: "external script src", re: /<script[^>]+\ssrc\s*=/i },
    { name: "http(s) URL", re: /https?:\/\//i },
  ];
  for (const pattern of patterns) {
    if (pattern.re.test(text)) throw new Error(`${label} depends on ${pattern.name}`);
  }
}

export async function check() {
  const bundle = await bundleApp();
  if (!bundle.includes(GLOBAL_NAME)) throw new Error("bundle lost its IIFE global");
  if (!bundle.includes("createApp")) throw new Error("bundle does not export createApp");
  console.log(`check bundle: ok (${bundle.length} bytes)`);

  const html = pageHtml({ bundle, candidates: DEFAULT_CANDIDATES, runs: DEFAULT_RUNS });
  for (const hook of REQUIRED_HOOKS) {
    if (!html.includes(hook)) throw new Error(`generated page is missing the "${hook}" hook`);
  }
  if (!html.includes(JSON.stringify(DEFAULT_CANDIDATES)) || !html.includes(`"runs":${DEFAULT_RUNS}`)) {
    throw new Error("generated page lost its candidate/run configuration");
  }
  console.log("check html hooks: ok");

  assertPercentileCases();
  console.log("check percentile: ok (9 cases, nearest rank)");

  assertNoNetworkApis(html, "generated page");
  assertNoNetworkApis(bundle, "bundle");
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  assertOfflineSource(source);
  console.log("check offline: ok");

  console.log("BENCH CHECK OK");
}

function printHelp() {
  console.log(`dsh-jump frame budget bench

  node bench/measure.mjs                     generate the page, print its path
  node bench/measure.mjs --check             deterministic self-check, no browser
  node bench/measure.mjs --candidates 80,300,600,1200
  node bench/measure.mjs --runs 20
  node bench/measure.mjs --out temp/bench.html

Measurements are taken by opening the generated page in a real browser; the
page prints its JSON into window.__BENCH_RESULT__ and into the page itself.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.check) {
    await check();
    return;
  }

  const bundle = await bundleApp();
  const html = pageHtml({ bundle, candidates: options.candidates, runs: options.runs });
  const paths = await writeArtifacts({ bundle, html, out: options.out });

  const driver = await detectBrowserDriver();
  if (driver === null) {
    console.log("dsh-jump bench: no browser driver detected (playwright / puppeteer absent), no readings were taken.");
    console.log(`bundle: ${paths.bundlePath}`);
    console.log(`page: ${paths.htmlPath}`);
    console.log("用真实浏览器打开该文件采集读数：页面会自动跑完每一档并把 JSON 打在页面上。");
  } else {
    console.log(`dsh-jump bench: ${driver} is installed but automatic collection is not wired in this slice.`);
    console.log(`bundle: ${paths.bundlePath}`);
    console.log(`page: ${paths.htmlPath}`);
    console.log("用真实浏览器打开该文件采集读数：页面会自动跑完每一档并把 JSON 打在页面上。");
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`dsh-jump bench: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
