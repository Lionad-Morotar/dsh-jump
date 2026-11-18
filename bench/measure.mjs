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
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const CLIENT_ROOT = join(PACKAGE_ROOT, "src", "client");
const GLOBAL_NAME = "__DSH_JUMP_BENCH__";
const OUTPUT_DIR = join(tmpdir(), "dsh-jump-bench");

export const DEFAULT_CANDIDATES = [80, 300, 600];
export const DEFAULT_RUNS = 20;
export const DEFAULT_WARMUP_CAP = 10;

/**
 * Below this many samples nearest-rank p95 is literally the maximum, so the
 * reading says nothing about the tail and must not be compared across runs.
 */
export const MIN_RELIABLE_RUNS = 20;

/** The sample count the README points readers at when they plan a comparison. */
export const RECOMMENDED_RUNS = 50;

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

function parseWarmup(raw) {
  if (!/^\d+$/.test(raw)) throw new Error(`--warmup expects a non-negative integer, got "${raw}"`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
    throw new Error(`--warmup must be an integer within 0..1000, got "${raw}"`);
  }
  return value;
}

function parseLabel(raw) {
  if (raw.trim() === "") throw new Error("--label expects a non-empty name");
  return raw;
}

/**
 * Warmup defaults to ten cycles but never more than the sample count: a tier
 * with three samples should not spend three times as long getting warm as it
 * spends measuring. An explicit `--warmup 0` stays an escape hatch for
 * debugging the bench itself, and the protocol block records the zero.
 */
export function resolveWarmup(runs, warmup) {
  if (warmup === null || warmup === undefined) return Math.min(DEFAULT_WARMUP_CAP, runs);
  return warmup;
}

export function sampleFloorWarning(runs) {
  if (runs >= MIN_RELIABLE_RUNS) return null;
  return (
    `dsh-jump bench: 样本偏少：--runs ${runs} 时 nearest-rank p95 会等于最大值，读数只能作参考；` +
    `建议 --runs ${RECOMMENDED_RUNS} 及以上再做跨运行比较。`
  );
}

export function parseArgs(argv) {
  const options = {
    check: false,
    help: false,
    candidates: DEFAULT_CANDIDATES,
    runs: DEFAULT_RUNS,
    warmup: null,
    label: null,
    out: null,
    archive: null,
  };
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
    if (
      flag === "--candidates" ||
      flag === "--runs" ||
      flag === "--warmup" ||
      flag === "--label" ||
      flag === "--out" ||
      flag === "--archive"
    ) {
      const value = argv[index + 1];
      if (value === undefined || value === "") throw new Error(`${flag} needs a value`);
      index += 1;
      if (flag === "--candidates") options.candidates = parseCandidates(value);
      else if (flag === "--runs") options.runs = parseRuns(value);
      else if (flag === "--warmup") options.warmup = parseWarmup(value);
      else if (flag === "--label") options.label = parseLabel(value);
      else if (flag === "--archive") options.archive = value;
      else options.out = value;
      continue;
    }
    throw new Error(`unknown option "${flag}"`);
  }
  return options;
}

/**
 * Bundle the pieces the measurement page drives.
 *
 * `entry.ts` is deliberately not the entry: it expects the host ModuleLoader
 * and a seeded React, neither of which exists on the bench page. `app.ts` is
 * the whole DOM-facing surface and depends on no host module, so a virtual
 * entry around it produces an app that a bare page can call. `collectHints`,
 * `createLabelMemory` and `identityKey` are exported for the identity
 * calibration: the app owns its memory privately, so the page measures the
 * same pure collection call directly instead of guessing at a count.
 */
export async function bundleApp() {
  const result = await build({
    stdin: {
      contents:
        'export { createApp } from "./app.ts";' +
        'export { collectHints } from "./hints.ts";' +
        'export { createLabelMemory, identityKey } from "./identity.ts";' +
        'export { CANDIDATE_SELECTOR } from "./config.ts";',
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
  // A label is free text from the command line; escaping `<` keeps it from
  // closing the inline script tag, and `\u003c` still decodes to `<` in JS.
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");
  return `(() => {
  "use strict";
  const CONFIG = ${serializedConfig};
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
      // The identity path keys on a slot boundary plus the accessible name;
      // without both, every candidate reports an empty key and the memory
      // recall and write-back never run on this page.
      button.setAttribute("aria-label", "bench target " + String(index + 1));
      button.textContent = String(index + 1);
      fragment.append(button);
    }
    root.append(fragment);
  }

  /**
   * Count the identity path on this tier's grid.
   *
   * The app keeps its label memory and identity oracle private, and widening
   * createApp deps for a bench is out of scope. Running the same pure
   * collectHints on the same grid with a counting oracle gives the exact number
   * of identity calls one activation performs; the first measured activation
   * checks that count against the labels the app actually paints, so a drifted
   * fixture fails loudly instead of reporting a made-up number.
   */
  function measureIdentity() {
    if (root.getAttribute("data-slot") !== "bench.grid") {
      throw new Error("bench grid lost its data-slot boundary; identity keys would all be empty");
    }
    const bench = window.${GLOBAL_NAME};
    const memory = bench.createLabelMemory();
    let calls = 0;
    const hints = bench.collectHints(
      () => Array.from(document.querySelectorAll(bench.CANDIDATE_SELECTOR)),
      { width: window.innerWidth, height: window.innerHeight },
      {
        // The grid only holds visible buttons, and the result is checked
        // against the app's painted label count before it is reported.
        isVisible: () => true,
        memory: memory,
        identity: (element) => {
          calls += 1;
          return bench.identityKey(element);
        },
      },
    );
    return { calls: calls, labels: hints.length, remembered: memory.size };
  }

  function badgeLabels() {
    const badges = document.querySelectorAll("[data-jump-label]");
    return Array.from(badges, (badge) => badge.getAttribute("data-jump-label") ?? "");
  }

  function overlayCount() {
    return document.querySelectorAll("[data-dsh-jump-overlay]").length;
  }

  function roundMs(value) {
    // An empty phase has no reading at all; rounding null would print 0ms.
    if (value === null) return null;
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

    const identity = measureIdentity();
    // One activation per round; counted rather than derived so the identity
    // total below multiplies a measured unit by an observed round count.
    let rounds = 0;
    const activateRound = async () => {
      rounds += 1;
      return stroke("h", { metaKey: true });
    };

    // Every tier gets its own cold start: a new grid invalidates layout, the
    // first round pays JIT and the first label mint pays allocation. Those
    // cycles run the exact measured shape so the warm path is the same path.
    let warmed = 0;
    for (let index = 0; index < CONFIG.warmup; index += 1) {
      await activateRound();
      const warmBadges = badgeLabels();
      const warmFirst = warmBadges[0];
      if (warmFirst === undefined || warmFirst === "") throw new Error("warmup activation produced no label");
      await stroke(warmFirst.slice(0, 1));
      exitRound();
      await settle(1);
      warmed += 1;
    }

    const activate = [];
    const firstStroke = [];
    const secondStroke = [];
    let labels = 0;
    let overlays = 0;

    for (let index = 0; index < CONFIG.runs; index += 1) {
      activate.push(await activateRound());
      const badges = badgeLabels();
      if (index === 0) {
        labels = badges.length;
        overlays = overlayCount();
        // The calibration must describe the round the app really painted.
        if (identity.calls !== labels || identity.labels !== labels) {
          throw new Error(
            "identity calibration drifted: " + String(identity.calls) + " calls, " +
              String(identity.labels) + " hints, " + String(labels) + " painted labels",
          );
        }
      }
      const first = badges[0];
      if (first === undefined || first === "") throw new Error("activation produced no label");
      firstStroke.push(await stroke(first.slice(0, 1)));
      // The second stroke is where the dimmed batch really does its work: on a
      // three-key label it must stay untouched while the live prefix splits
      // further. A single-key label has no second stroke.
      const second = first.slice(1, 2);
      if (second !== "") secondStroke.push(await stroke(second));
      // Resetting outside the timed window keeps one sample's teardown out of
      // the next sample's handler cost.
      exitRound();
      await settle(1);
    }

    // One full label per sample, with a fresh activation each round, so the
    // completion reading has the same sample count as every other phase.
    const complete = [];
    for (let index = 0; index < CONFIG.runs; index += 1) {
      await activateRound();
      const labelsNow = badgeLabels();
      const completeLabel = labelsNow[0];
      if (completeLabel === undefined || completeLabel === "") {
        throw new Error("activation produced no completion label");
      }
      for (const key of completeLabel.slice(0, -1)) window.dispatchEvent(keydown(key));
      complete.push(await stroke(completeLabel.slice(-1)));
      await settle(1);
    }

    // Esc tears the whole round down, so the cost scales with the badge count
    // the previous phases painted. One deliberate exit gets its own reading
    // instead of hiding inside the untimed reset between samples.
    await activateRound();
    const closeNodes = badgeLabels().length;
    const close = await stroke("Escape");

    return {
      candidates: candidates,
      labels: labels,
      overlayCount: overlays,
      warmup: warmed,
      identityKeys: identity.calls * rounds,
      identityKeysPerRound: identity.calls,
      identityRounds: rounds,
      identityPath: identity.calls > 0 && identity.remembered > 0 ? "active" : "inactive",
      activate: phase(activate),
      firstStroke: phase(firstStroke),
      secondStroke: phase(secondStroke),
      complete: phase(complete),
      close: { ...phase([close]), nodes: closeNodes },
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
      label: CONFIG.label,
      protocol: {
        runs: CONFIG.runs,
        warmup: CONFIG.warmup,
        percentileMethod: "nearest-rank",
        note: "Readings are sensitive to system load: compare runs on the same machine in the same period, alternating between sources.",
      },
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

export function pageHtml({ bundle, candidates, runs, warmup, label }) {
  const config = { candidates, runs, warmup, label, identityPath: "active" };
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
<div id="bench-root" data-bench-root data-slot="bench.grid"></div>
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
 * Deterministic archive name.
 *
 * The label is part of the file name so two sources measured under one protocol
 * can be told apart without opening the JSON, and it is folded to a safe slug:
 * `--label` is free text and must not escape the archive directory.
 */
export function archiveFileName(label, at = new Date()) {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const slug =
    label === null || label === undefined
      ? "unlabeled"
      : label.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return `dsh-jump-bench-${slug === "" ? "unlabeled" : slug}-${stamp}.json`;
}

/** Write one archived result, creating the directory the reader named. */
export async function writeArchive(dir, fileName, payload) {
  const target = join(resolve(process.cwd(), dir), fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return target;
}

/**
 * Archive mode drives the page itself.
 *
 * The repo ships no browser driver and the page cannot write files, so the
 * only way to archive real readings is to run the generated page from here.
 * Playwright and Puppeteer are not dependencies, so this speaks the DevTools
 * protocol to a local Chrome over its loopback port; Node's built-in WebSocket
 * keeps the install surface untouched. Foreground runs stay the reference for
 * comparable numbers, while two archive runs share this automated protocol.
 */
async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === "") continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDevtoolsPort(profile) {
  const file = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(file, "utf8")).trim().split("\n");
      if (port !== undefined && port !== "") return Number(port);
    } catch {
      // Chrome is still writing the profile.
    }
    await sleep(100);
  }
  throw new Error("Chrome never published its DevTools port");
}

async function openCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("cannot open the DevTools socket")), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (waiter === undefined) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

async function collectResult(pagePath) {
  const chrome = await findChrome();
  if (chrome === null) {
    throw new Error("--archive needs a local Chrome; set CHROME_PATH to its executable");
  }
  const profile = await mkdtemp(join(tmpdir(), "dsh-jump-bench-chrome-"));
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--window-size=1440,900",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let cdp;
  try {
    const port = await readDevtoolsPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json();
    const target = Array.isArray(targets) ? targets.find((entry) => entry.type === "page") : undefined;
    if (target === undefined) throw new Error("Chrome exposes no page target");
    cdp = await openCdp(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Page.navigate", { url: pathToFileURL(pagePath).href });
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      await sleep(250);
      const evaluation = await cdp.send("Runtime.evaluate", {
        expression:
          "window.__BENCH_ERROR__ ? { error: window.__BENCH_ERROR__ } :" +
          " (window.__BENCH_RESULT__ ? { result: window.__BENCH_RESULT__ } : null)",
        returnByValue: true,
      });
      const value = evaluation?.result?.value;
      if (value === null || value === undefined) continue;
      if (value.error) throw new Error(`bench page failed: ${String(value.error)}`);
      return value.result;
    }
    throw new Error("bench page did not finish within 240s");
  } finally {
    cdp?.close();
    child.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
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
  "secondStroke: phase(",
  "complete: phase(",
  "close: {",
  "identityKeys:",
  "identityKeysPerRound:",
  "identityRounds:",
  "identityPath:",
  "data-slot=\"bench.grid\"",
  "bench target ",
  "aria-label",
  "warmup",
  "protocol",
  "percentileMethod",
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

function assertRunsBoundary() {
  const single = parseArgs(["--runs", "1"]);
  if (single.runs !== 1) throw new Error(`--runs 1 should be accepted, got ${String(single.runs)}`);
  if (resolveWarmup(single.runs, single.warmup) !== 1) {
    throw new Error("--runs 1 should default warmup to min(10, runs), which is 1");
  }
  const warning = sampleFloorWarning(single.runs);
  if (warning === null || !warning.includes("样本偏少")) {
    throw new Error("--runs 1 must warn that its p95 is not a valid sample");
  }
  if (sampleFloorWarning(MIN_RELIABLE_RUNS) !== null) {
    throw new Error(`${MIN_RELIABLE_RUNS} runs should sit above the warning floor`);
  }
  for (const raw of ["0", "-1", "1.5", "abc", ""]) {
    let rejected = false;
    try {
      parseRuns(raw);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`--runs "${raw}" should be rejected`);
  }
  const custom = parseArgs(["--runs", "10", "--warmup", "3", "--label", "smoke"]);
  if (custom.warmup !== 3) throw new Error("--warmup 3 should override the default");
  if (custom.label !== "smoke") throw new Error("--label smoke should reach the output");
  if (parseArgs([]).label !== null) throw new Error("label should default to null");
}

/**
 * Archive naming and writing, exercised without a browser.
 *
 * `--label` is free text from the command line and becomes part of a file name,
 * so separators are folded to a dash instead of being trusted; an unlabelled
 * run still gets a name that sorts beside the labelled ones.
 */
function assertArchiveContract() {
  const at = new Date("2026-01-02T03:04:05.000Z");
  const named = archiveFileName("smoke", at);
  if (named !== "dsh-jump-bench-smoke-20260102-030405.json") {
    throw new Error(`archive name for --label smoke is "${named}"`);
  }
  if (archiveFileName(null, at) !== "dsh-jump-bench-unlabeled-20260102-030405.json") {
    throw new Error("an unlabelled run must still produce a filename");
  }
  const hostile = archiveFileName("a/b c", at);
  if (hostile.includes("/") || hostile.includes(" ")) {
    throw new Error(`--label text leaked a path separator into the archive name: "${hostile}"`);
  }
  const parsed = parseArgs(["--archive", "temp/bench-archive"]);
  if (parsed.archive !== "temp/bench-archive") throw new Error("--archive should reach the output options");
}

async function assertArchiveWrite() {
  const dir = await mkdtemp(join(tmpdir(), "dsh-jump-archive-"));
  try {
    const payload = { label: "smoke", runs: [{ candidates: 80, identityKeys: 80, identityPath: "active" }] };
    const target = await writeArchive(dir, archiveFileName("smoke", new Date("2026-01-02T03:04:05.000Z")), payload);
    const written = JSON.parse(await readFile(target, "utf8"));
    if (written.label !== "smoke" || written.runs?.[0]?.identityKeys !== 80) {
      throw new Error("archived JSON did not round-trip");
    }
    if (dirname(target) !== dir) throw new Error("archive file was not written inside --archive");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertOfflineSource(source) {
  const specifiers = [...source.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)].map((match) => match[1]);
  const allowed = new Set(["esbuild", "node:child_process", "node:fs/promises", "node:os", "node:path", "node:url"]);
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

  const defaultWarmup = resolveWarmup(DEFAULT_RUNS, null);
  const html = pageHtml({
    bundle,
    candidates: DEFAULT_CANDIDATES,
    runs: DEFAULT_RUNS,
    warmup: defaultWarmup,
    label: null,
  });
  for (const hook of REQUIRED_HOOKS) {
    if (!html.includes(hook)) throw new Error(`generated page is missing the "${hook}" hook`);
  }
  if (
    !html.includes(JSON.stringify(DEFAULT_CANDIDATES)) ||
    !html.includes(`"runs":${DEFAULT_RUNS}`) ||
    !html.includes(`"warmup":${defaultWarmup}`) ||
    !html.includes('"label":null') ||
    !html.includes('"identityPath":"active"') ||
    !html.includes('"nearest-rank"')
  ) {
    throw new Error("generated page lost its candidate/run/warmup/label/protocol configuration");
  }
  console.log("check html hooks: ok");

  assertPercentileCases();
  console.log("check percentile: ok (9 cases, nearest rank)");

  assertRunsBoundary();
  console.log("check runs boundary: ok (--runs 1 accepted, p95 warned below the floor)");

  assertArchiveContract();
  await assertArchiveWrite();
  console.log("check archive: ok (label naming, directory creation, JSON round-trip)");

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
  node bench/measure.mjs --runs 60 --warmup 10 --label before
  node bench/measure.mjs --out temp/bench.html
  node bench/measure.mjs --label before --archive temp/bench-runs

Every tier discards min(10, runs) warmup cycles before sampling; --warmup
overrides that count. --label is copied into the JSON so two sources measured
under one protocol can be told apart.

Measurements are taken by opening the generated page in a real browser; the
page prints its JSON into window.__BENCH_RESULT__ and into the page itself.
--archive additionally runs that page in headless Chrome and writes the JSON
it produced to <dir>/dsh-jump-bench-<label>-<stamp>.json.`);
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

  const warning = sampleFloorWarning(options.runs);
  if (warning !== null) console.error(warning);

  const warmup = resolveWarmup(options.runs, options.warmup);
  const bundle = await bundleApp();
  const html = pageHtml({
    bundle,
    candidates: options.candidates,
    runs: options.runs,
    warmup,
    label: options.label,
  });
  const paths = await writeArtifacts({ bundle, html, out: options.out });
  console.log(`bundle: ${paths.bundlePath}`);
  console.log(`page: ${paths.htmlPath}`);

  if (options.archive !== null) {
    // The page is the only producer of readings, so archive mode runs it and
    // stores the JSON it publishes instead of inventing a result here.
    const result = await collectResult(paths.htmlPath);
    const archived = await writeArchive(options.archive, archiveFileName(options.label), result);
    console.log(`archive: ${archived}`);
    console.log("dsh-jump bench: archived the JSON the page produced in headless Chrome.");
    return;
  }

  const driver = await detectBrowserDriver();
  if (driver === null) {
    console.log("dsh-jump bench: no playwright or puppeteer installed, so no readings were taken.");
  } else {
    console.log(`dsh-jump bench: ${driver} is installed; --archive still uses the local Chrome driver.`);
  }
  console.log("用真实浏览器打开该文件采集读数：页面会自动跑完每一档并把 JSON 打在页面上。");
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`dsh-jump bench: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
