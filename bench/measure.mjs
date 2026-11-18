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
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const CLIENT_ROOT = join(PACKAGE_ROOT, "src", "client");
const GLOBAL_NAME = "__DSH_JUMP_BENCH__";
const OUTPUT_DIR = join(tmpdir(), "dsh-jump-bench");

export const DEFAULT_CANDIDATES = [80, 300, 600];
export const DEFAULT_RUNS = 20;
export const DEFAULT_WARMUP_CAP = 10;

/** The page samples this many animation frames to learn the display budget. */
export const FRAME_BUDGET_SAMPLES = 240;

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

function assertFiniteNumbers(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${label} must be finite numbers, got ${String(value)}`);
    }
  }
}

/**
 * Median of the frame intervals, used only to learn the display budget.
 *
 * The budget is the cadence the page really runs at, not a nominal 60/120/144:
 * a 143Hz panel reports gaps around 6.99ms, and a machine under load reports
 * whatever it can actually hold. A mean would let one long frame drag the
 * budget up and forgive exactly the hitch this bench is looking for.
 */
export function medianOf(values) {
  assertFiniteNumbers(values, "frame intervals");
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Frame budget in milliseconds, rounded up to 0.1ms.
 *
 * Rounding up keeps the budget from floating just below the real cadence
 * (6.999 => 7), which would mark every single frame as over budget.
 */
export function frameBudgetMsOf(intervals) {
  const median = medianOf(intervals);
  if (median === null) return null;
  return Math.ceil(median * 10 - 1e-9) / 10;
}

/**
 * The worst single frame in a tier.
 *
 * Deliberately the maximum, not a percentile: the acceptance question is
 * whether every frame met the budget, so one 39ms hitch must survive the
 * summary even when 95% of frames are fast.
 */
export function maxFrameIntervalMs(intervals) {
  assertFiniteNumbers(intervals, "frame intervals");
  if (intervals.length === 0) return null;
  let max = intervals[0];
  for (const value of intervals) if (value > max) max = value;
  return max;
}

/**
 * Share of a window's frames that exceeded a budget, in percent.
 *
 * Counts and totals are both printed, so any reader can recompute this by
 * hand; one decimal is enough to compare two windows without pretending the
 * measurement is more precise than a frame timestamp.
 */
export function overBudgetPct(overBudgetFrames, frameCount) {
  if (!Number.isInteger(frameCount) || frameCount < 0) {
    throw new TypeError(`frameCount must be a non-negative integer, got ${String(frameCount)}`);
  }
  if (frameCount === 0) {
    if (overBudgetFrames !== null && overBudgetFrames !== 0) {
      throw new RangeError(`overBudgetFrames ${String(overBudgetFrames)} has no window to belong to`);
    }
    return null;
  }
  if (!Number.isInteger(overBudgetFrames) || overBudgetFrames < 0) {
    throw new TypeError(`overBudgetFrames must be a non-negative integer, got ${String(overBudgetFrames)}`);
  }
  if (overBudgetFrames > frameCount) {
    throw new RangeError(`overBudgetFrames ${String(overBudgetFrames)} exceeds frameCount ${String(frameCount)}`);
  }
  return Math.round((overBudgetFrames / frameCount) * 1000) / 10;
}

/** The verdict is relative to the idle control, not to an absolute zero. */
export const NOISE_BAND_PCT = 5;

/**
 * Active over-budget rate minus the blank control's rate, in percentage points.
 *
 * A quiet page under load already misses frames, and the budget is a median,
 * so an absolute `overBudgetFrames === 0` gate would fail every machine forever.
 * Subtracting the same-page idle window is the only comparison that answers
 * whether the plugin added the misses. A negative value means the active window
 * was calmer than the control.
 */
export function excessOverBudgetPct(
  activeOverBudgetFrames,
  activeFrameCount,
  idleOverBudgetFrames,
  idleFrameCount,
) {
  const active = overBudgetPct(activeOverBudgetFrames, activeFrameCount);
  const idle = overBudgetPct(idleOverBudgetFrames, idleFrameCount);
  if (active === null || idle === null) return null;
  return Math.round((active - idle) * 10) / 10;
}

/**
 * Pass when the active window did not add more than a noise band of misses.
 *
 * Five percentage points is smaller than the difference one real hitch makes
 * in a 240-frame window, while a quiet machine's run-to-run drift stays below
 * it. A window with no frames is not a pass.
 */
export function frameVerdict(excessPct) {
  if (excessPct === null || !Number.isFinite(excessPct)) return "fail";
  return excessPct <= NOISE_BAND_PCT ? "pass" : "fail";
}

/** Share of the frame the plugin may own; the rest belongs to the host. */
export const ATTRIBUTION_BUDGET_SHARE = 0.5;

/** Why the differential verdict remains in the JSON without deciding acceptance. */
export const VERDICT_LEGACY_NOTE =
  "legacy differential verdict: pass when the active over-budget rate minus the idle control rate is at most " +
  String(NOISE_BAND_PCT) +
  " percentage points. A loaded machine misses frames with the plugin idle, so this fails with zero plugin work; " +
  "it is kept as a trend only.";

/** Milliseconds rounded to three decimals; null stays null instead of becoming 0. */
export function roundMillis(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

/** Frames of plugin probe history the bench reads; the plugin keeps the same window. */
export const PERF_SAMPLE_LIMIT = 512;

/**
 * The most recent `limit` samples, in order.
 *
 * The plugin already bounds its own rings; repeating the cap here keeps the
 * aggregation bounded if a host hands over a longer array, and lets `--check`
 * prove the 512-frame window without a browser.
 */
export function boundedSamples(values, limit = PERF_SAMPLE_LIMIT) {
  if (!Array.isArray(values)) return [];
  const finite = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return finite.length <= limit ? finite : finite.slice(finite.length - limit);
}

function summarizeSeries(values) {
  return {
    p50: roundMillis(nearestRankPercentile(values, 50)),
    p99: roundMillis(nearestRankPercentile(values, 99)),
    max: roundMillis(maxFrameIntervalMs(values)),
  };
}

/**
 * The plugin's own per-frame occupancy, from `app.perfStats()`.
 *
 * `samples.collect` and `samples.paint` are frame-aligned: the probe flushes
 * one pair per observed frame, with 0 where that stage did not run. Index i of
 * both arrays therefore describes one frame and the two values can be added.
 * If a host reports different lengths (an older build, a future probe), the
 * arrays are not frame-aligned; the combined series stays null instead of
 * pairing by index and inventing frames neither stage observed, and only the
 * separate collect and paint readings stand.
 */
export function summarizePluginFrame(perfStats, limit = PERF_SAMPLE_LIMIT) {
  const collect = boundedSamples(perfStats?.samples?.collect, limit);
  const paint = boundedSamples(perfStats?.samples?.paint, limit);
  const aligned = collect.length === paint.length;
  const frames = aligned ? collect.map((value, index) => value + paint[index]) : [];
  return {
    pluginFrameMs: { ...summarizeSeries(frames), samples: frames.length, aligned: aligned },
    pluginCollectMs: { ...summarizeSeries(collect), samples: collect.length },
    pluginPaintMs: { ...summarizeSeries(paint), samples: paint.length },
  };
}

/** Why the coarse observers cannot decide a 7ms budget. */
export const LOAF_EVIDENCE_NOTE =
  "coarse corroboration only: long-animation-frame entries exist only for frames over 50ms, " +
  "so a 2ms plugin handler on a 7ms display produces no attribution at all; used to explain slow frames, never to decide the verdict.";
export const EVENT_TIMING_EVIDENCE_NOTE =
  "coarse corroboration only: Event Timing floors observation at 16ms even with durationThreshold 0, " +
  "so a fast activation leaves no entry; used to describe interaction latency, never to decide the verdict.";

/**
 * The plugin bundle's scripts inside one long-animation-frame entry.
 *
 * Only an exact file-name match on the URL path counts. A query string that
 * merely mentions the bundle name belongs to some other script, and the page's
 * own inline harness must never be attributed to the plugin just because it
 * shares the document URL.
 */
export function pluginScriptEntries(entry, bundleName) {
  const scripts = entry !== null && typeof entry === "object" && Array.isArray(entry.scripts) ? entry.scripts : [];
  const cleanBundle = String(bundleName === null || bundleName === undefined ? "" : bundleName).split(/[?#]/)[0];
  const slash = cleanBundle.lastIndexOf("/");
  const fileName = slash === -1 ? cleanBundle : cleanBundle.slice(slash + 1);
  if (fileName === "") return [];
  const matched = [];
  for (const script of scripts) {
    if (script === null || typeof script !== "object") continue;
    const source = typeof script.sourceURL === "string" ? script.sourceURL.split(/[?#]/)[0] : "";
    if (source === "") continue;
    const sourceSlash = source.lastIndexOf("/");
    const sourceName = sourceSlash === -1 ? source : source.slice(sourceSlash + 1);
    if (sourceName !== fileName) continue;
    matched.push(script);
  }
  return matched;
}

/**
 * Attribute long frames to the plugin.
 *
 * A long frame with no plugin script is system preemption, not plugin cost:
 * counting it as a zero would dilute the percentile and counting its duration
 * would blame the plugin for a stalled compositor. Such frames are counted
 * separately as `excludedLongFrames`. A frame that did run the bundle sums every
 * plugin entry in it, so two slices in one frame are one frame cost.
 */
export function summarizeScriptAttribution(entries, bundleName) {
  const list = Array.isArray(entries) ? entries : [];
  const frames = [];
  let excludedLongFrames = 0;
  for (const entry of list) {
    const scripts = pluginScriptEntries(entry, bundleName);
    if (scripts.length === 0) {
      excludedLongFrames += 1;
      continue;
    }
    let pluginMs = 0;
    let forcedLayoutMs = 0;
    for (const script of scripts) {
      if (Number.isFinite(script.duration)) pluginMs += script.duration;
      if (Number.isFinite(script.forcedStyleAndLayoutDuration)) forcedLayoutMs += script.forcedStyleAndLayoutDuration;
    }
    frames.push({ pluginMs: pluginMs, forcedLayoutMs: forcedLayoutMs });
  }
  const summarize = (field) => {
    const values = frames.map((frame) => frame[field]);
    return {
      p50: roundMillis(nearestRankPercentile(values, 50)),
      p99: roundMillis(nearestRankPercentile(values, 99)),
      max: roundMillis(maxFrameIntervalMs(values)),
      // Preemption inflates wall clock, so the smallest frame is the closest
      // reading to the plugin's intrinsic cost; p50 is the stable estimator.
      min: roundMillis(
        values.length === 0 ? null : values.reduce((smallest, value) => Math.min(smallest, value), Infinity),
      ),
    };
  };
  return {
    attributedPluginMs: summarize("pluginMs"),
    attributedForcedLayoutMs: summarize("forcedLayoutMs"),
    excludedLongFrames: excludedLongFrames,
    attributedFrames: frames.length,
    loafFrames: list.length,
  };
}

/**
 * Activation keydown durations reported by Event Timing.
 *
 * `duration` is input to next paint, which is the latency a reader feels. The
 * p50/p95/max shape mirrors the other gates; an empty window is nulls, never
 * zeros, because "no sample" and "zero milliseconds" are different claims.
 */
export function summarizeEventDurations(durations) {
  const values = Array.isArray(durations) ? durations.filter((value) => Number.isFinite(value)) : [];
  return {
    p50: roundMillis(nearestRankPercentile(values, 50)),
    p95: roundMillis(nearestRankPercentile(values, 95)),
    max: roundMillis(maxFrameIntervalMs(values)),
  };
}

/**
 * Whether a tier's numbers can decide acceptance.
 *
 * The plugin probes its own synchronous work, so a real sample exists even
 * when no frame was long enough for LoAF and no keydown cleared Event Timing's
 * 16ms floor. Sample count is the whole test: a measured display budget plus
 * at least one frame of `pluginFrameMs`. LoAF and Event Timing are structural
 * corroboration now, not judgeability gates.
 */
export function isJudgeable({ frameBudgetMs, pluginFrameMs }) {
  if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) return false;
  if (pluginFrameMs === null || pluginFrameMs === undefined) return false;
  return Number.isFinite(pluginFrameMs.p99);
}

/**
 * The attributed acceptance rule.
 *
 * The plugin's own frame occupancy at p99 must stay within half a frame. That
 * one condition decides: Event Timing is floored at 16ms, so letting it veto a
 * fast plugin would bring back the bug this rule replaces. A non-judgeable
 * environment is `smoke-only`, never a pass.
 */
export function attributedVerdict({ judgeable, frameBudgetMs, pluginFrameMs }) {
  if (!judgeable) return "smoke-only";
  if (!Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0) return "fail";
  const pluginP99 = pluginFrameMs === null || pluginFrameMs === undefined ? null : pluginFrameMs.p99;
  if (!Number.isFinite(pluginP99)) return "fail";
  return pluginP99 <= frameBudgetMs * ATTRIBUTION_BUDGET_SHARE ? "pass" : "fail";
}

/**
 * The calibration invariant: the identity walk, the pure collection and the
 * painted labels must describe the same round.
 *
 * Reading badges before stage A settles used to leave this check comparing 300
 * hints against the 96 badges of the first two frames. The bench now polls
 * `app.visibleLabels()` until the painted count reaches the expected total;
 * this function makes the invariant explicit and lets `--check` prove that a
 * partial read is rejected.
 */
export function identityCalibrationDrift(identityCalls, identityHints, paintedLabels) {
  if (identityCalls === paintedLabels && identityHints === paintedLabels) return null;
  return (
    "identity calibration drifted: " + String(identityCalls) + " calls, " +
    String(identityHints) + " hints, " + String(paintedLabels) + " painted labels"
  );
}

/**
 * How long a round may stay in stage A before the bench calls it broken.
 *
 * Two limits, because they fail for different reasons: a loaded machine can
 * spend seconds inside 200 frames, and a background-throttled tab can starve
 * animation frames for a full second between them. A round that crosses either
 * while its label count is still short is reported unfinished, never compared
 * as a zero-badge round.
 */
export const SETTLE_FRAME_LIMIT = 200;
export const SETTLE_TIMEOUT_MS = 3000;

/**
 * The settle gate, as a pure decision so `--check` can exercise both limits.
 *
 * Stage A paints nothing until it commits, and an oversized round keeps
 * painting after that, so only `visibleLabels()` reaches the expected total.
 * Polling it is the only readiness signal the bench has; without this gate a
 * 300-candidate round that has not started painting looks exactly like a
 * fixture whose identity count drifted to zero.
 */
export function collectionSettleFailure(expected, actual, frames, elapsedMs) {
  if (actual === expected) return null;
  if (frames < SETTLE_FRAME_LIMIT && elapsedMs < SETTLE_TIMEOUT_MS) return null;
  return (
    "collection did not settle: expected " + String(expected) + " labels, saw " +
    String(actual) + " after " + String(frames) + " frames / " +
    String(Math.round(elapsedMs * 1000) / 1000) + "ms"
  );
}

/**
 * The readiness gate over both round counts.
 *
 * `assigned` is `app.labels()`, which `finish()` fills in one synchronous step.
 * `painted` is `app.visibleLabels()`, the only count that grows frame by frame
 * when a round is too large for one paint. Readiness is painted, never
 * assigned: a 2001-candidate round assigns all labels in the commit frame while
 * the canvas still shows the first 1000, and reading the assigned count there
 * would call a half-painted round usable. Both counts stay in the diagnostic
 * because "assigned 2001, painted 1000" is a different bug from "assigned 0".
 */
export function collectionReadiness(expected, assigned, painted, frames, elapsedMs) {
  if (painted >= expected) return null;
  const failure = collectionSettleFailure(expected, painted, frames, elapsedMs);
  if (failure === null) return null;
  if (assigned >= expected) {
    return (
      "collection assigned " + String(assigned) + " labels but painted " +
      String(painted) + " after " + String(frames) + " frames / " +
      String(Math.round(elapsedMs * 1000) / 1000) + "ms"
    );
  }
  return failure;
}

/**
 * timeToUsable summary, split into wall clock and frames.
 *
 * The wall clock is the honest duration, but a background tab throttles
 * animation frames and inflates it; the frame count is the quantity that stays
 * comparable across machines. Both are printed so neither is silently promoted
 * to the only story.
 */
export function summarizeTimeToUsable(samples) {
  const round = (value) => (value === null ? null : Math.round(value * 1000) / 1000);
  const ms = samples.map((sample) => sample.ms);
  const frames = samples.map((sample) => sample.frames);
  return {
    ms: {
      p50: round(nearestRankPercentile(ms, 50)),
      p95: round(nearestRankPercentile(ms, 95)),
      max: round(maxFrameIntervalMs(ms)),
    },
    frames: {
      p50: nearestRankPercentile(frames, 50),
      max: maxFrameIntervalMs(frames),
    },
  };
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
    verifyFresh: false,
    noBrowser: false,
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
    if (flag === "--verify-fresh") {
      options.verifyFresh = true;
      continue;
    }
    if (flag === "--no-browser") {
      options.noBrowser = true;
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
  const FRAME_BUDGET_SAMPLES = ${FRAME_BUDGET_SAMPLES};
  const nearestRankPercentile = ${nearestRankPercentile.toString()};
  const assertFiniteNumbers = ${assertFiniteNumbers.toString()};
  const medianOf = ${medianOf.toString()};
  const frameBudgetMsOf = ${frameBudgetMsOf.toString()};
  const maxFrameIntervalMs = ${maxFrameIntervalMs.toString()};
  const overBudgetPct = ${overBudgetPct.toString()};
  const excessOverBudgetPct = ${excessOverBudgetPct.toString()};
  const NOISE_BAND_PCT = ${NOISE_BAND_PCT};
  const frameVerdict = ${frameVerdict.toString()};
  const identityCalibrationDrift = ${identityCalibrationDrift.toString()};
  const SETTLE_FRAME_LIMIT = ${SETTLE_FRAME_LIMIT};
  const SETTLE_TIMEOUT_MS = ${SETTLE_TIMEOUT_MS};
  const collectionSettleFailure = ${collectionSettleFailure.toString()};
  const collectionReadiness = ${collectionReadiness.toString()};
  const summarizeTimeToUsable = ${summarizeTimeToUsable.toString()};
  const roundMillis = ${roundMillis.toString()};
  const pluginScriptEntries = ${pluginScriptEntries.toString()};
  const summarizeScriptAttribution = ${summarizeScriptAttribution.toString()};
  const summarizeEventDurations = ${summarizeEventDurations.toString()};
  const PERF_SAMPLE_LIMIT = ${PERF_SAMPLE_LIMIT};
  const boundedSamples = ${boundedSamples.toString()};
  const summarizeSeries = ${summarizeSeries.toString()};
  const summarizePluginFrame = ${summarizePluginFrame.toString()};
  const isJudgeable = ${isJudgeable.toString()};
  const attributedVerdict = ${attributedVerdict.toString()};
  const ATTRIBUTION_BUDGET_SHARE = ${ATTRIBUTION_BUDGET_SHARE};
  const LOAF_EVIDENCE_NOTE = ${JSON.stringify(LOAF_EVIDENCE_NOTE)};
  const EVENT_TIMING_EVIDENCE_NOTE = ${JSON.stringify(EVENT_TIMING_EVIDENCE_NOTE)};
  const VERDICT_LEGACY_NOTE = ${JSON.stringify(VERDICT_LEGACY_NOTE)};
  const root = document.querySelector("[data-bench-root]");
  const status = document.querySelector("[data-bench-status]");
  const output = document.querySelector("[data-bench-output]");
  let app = null;
  let disposeApp = () => undefined;

  /**
   * Mount the app for one tier.
   *
   * apply() reads the published display budget once, so the tier must
   * publish its own measurement before mounting; otherwise every tier silently
   * collects against the 60Hz fallback while the verdict talks about another
   * budget.
   */
  function mountApp(budget) {
    disposeApp();
    app = window.${GLOBAL_NAME}.createApp({ platform: "macos", frameBudgetMs: budget });
    disposeApp = app.apply();
  }

  // Freshness is decided from facts this realm can prove: whether a result was
  // already sitting on the global before this script ran, and whether this
  // document was reached by a navigation. A repeated navigation inside one
  // browser tab used to let the poller read the previous realm's JSON.
  const navigationEntry = performance.getEntriesByType("navigation")[0] || null;
  const navigationType = navigationEntry === null ? "unknown" : navigationEntry.type;
  const navigationStartMs = performance.timeOrigin + (navigationEntry === null ? 0 : navigationEntry.startTime);
  const hadResultAtLoad = Object.prototype.hasOwnProperty.call(window, "__BENCH_RESULT__");
  const openedAtMs = Date.now();
  delete window.__BENCH_RESULT__;

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

  /**
   * Event Timing only reports trusted events, so an automated activation has
   * to come from the driver rather than from dispatchEvent. The page publishes
   * a request and waits; a page opened without a driver falls back to the
   * synthetic path after this budget so a manual reader is never blocked.
   */
  const DRIVE_TRUSTED_INPUT = new URLSearchParams(window.location.search).get("drive") === "1";
  const TRUSTED_INPUT_TIMEOUT_MS = 1500;
  let trustedPending = null;
  let trustedSequence = 0;
  window.addEventListener(
    "keydown",
    (event) => {
      if (trustedPending === null) return;
      if (!event.isTrusted) return;
      if (event.key !== "h" || event.metaKey !== true) return;
      const pending = trustedPending;
      trustedPending = null;
      window.__BENCH_TRUSTED_REQUEST__ = null;
      pending.resolve({ startedAt: performance.now() });
    },
    true,
  );

  function requestTrustedActivation() {
    return new Promise((resolve) => {
      const id = ++trustedSequence;
      const timer = setTimeout(() => {
        if (trustedPending === null || trustedPending.id !== id) return;
        trustedPending = null;
        window.__BENCH_TRUSTED_REQUEST__ = null;
        resolve(null);
      }, TRUSTED_INPUT_TIMEOUT_MS);
      trustedPending = {
        id: id,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      };
      window.__BENCH_TRUSTED_REQUEST__ = { id: id, key: "h", metaKey: true };
    });
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

  /**
   * Painted labels of the current round.
   *
   * The canvas overlay owns them; there is no DOM node per badge anymore, so
   * reading [data-jump-label] would always count zero and turn every
   * calibration into a false drift report. app.visibleLabels() is also the
   * readiness signal: it is the only count that grows while an oversized round
   * is still painting.
   */
  function roundLabels() {
    return app.visibleLabels();
  }

  function labelCount() {
    return app.visibleLabels().length;
  }

  /** Assigned labels: full as soon as finish() commits, painted or not. */
  function assignedCount() {
    return app.labels().length;
  }

  function overlayCount() {
    return document.querySelectorAll("[data-dsh-jump-overlay]").length;
  }

  function roundMs(value) {
    // An empty phase has no reading at all; rounding null would print 0ms.
    if (value === null || value === undefined) return null;
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

  /**
   * Wait until the round has painted every label.
   *
   * sinceMs is the moment dispatchEvent returned, so the reading answers
   * how long a reader has to wait before the first label stroke can land.
   * Frames are counted as animation frames actually observed: a throttled tab
   * can inflate the wall clock by a second, but it cannot inflate this count.
   */
  function waitForUsable(expected, sinceMs) {
    let frames = 0;
    return new Promise((resolve, reject) => {
      function check() {
        const painted = labelCount();
        const elapsed = performance.now() - sinceMs;
        const failure = collectionReadiness(expected, assignedCount(), painted, frames, elapsed);
        if (failure !== null) {
          reject(new Error(failure));
          return;
        }
        if (painted >= expected) {
          resolve({ ms: elapsed, frames: frames });
          return;
        }
        requestAnimationFrame(() => {
          frames += 1;
          check();
        });
      }
      check();
    });
  }

  /**
   * Dispatch one activation and open the two readings it owns.
   *
   * The synchronous handler cost feeds the activate phase, while the
   * readiness wait feeds timeToUsable. They share one dispatch but not one
   * clock: the second-frame gap is sampled beside the poll so a long collection
   * cannot move the phase reading.
   */
  async function beginActivation(expected) {
    let startedAt = null;
    let dispatchedAt = null;
    let trusted = false;
    if (DRIVE_TRUSTED_INPUT) {
      const requested = await requestTrustedActivation();
      if (requested !== null) {
        startedAt = requested.startedAt;
        dispatchedAt = performance.now();
        trusted = true;
      }
    }
    if (!trusted) {
      const event = keydown("h", { metaKey: true });
      startedAt = performance.now();
      window.dispatchEvent(event);
      dispatchedAt = performance.now();
    }
    const nextFrameMs = new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(performance.now() - dispatchedAt));
      });
    });
    return {
      handlerMs: dispatchedAt - startedAt,
      nextFrameMs: nextFrameMs,
      trusted: trusted,
      usable: waitForUsable(expected, dispatchedAt),
    };
  }

  function exitRound() {
    window.dispatchEvent(keydown("Escape"));
  }

  /**
   * The display's real cadence.
   *
   * 240 intervals are sampled with no bench work in flight, then the median is
   * rounded up to 0.1ms. A nominal 60/120/143 is not good enough: the machine
   * may be running at a different rate, and the acceptance rule is stated
   * against the frames this display actually produces.
   */
  function measureFrameBudget() {
    return new Promise((resolve) => {
      const intervals = [];
      let previous = null;
      let remaining = FRAME_BUDGET_SAMPLES;
      function tick(now) {
        if (previous !== null) {
          intervals.push(now - previous);
          remaining -= 1;
        }
        previous = now;
        if (remaining <= 0) {
          resolve(intervals);
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /**
   * Every frame gap during the measured window.
   *
   * This runs continuously alongside the timed rounds, so the gap that
   * contains a synchronous activation or a repaint is the gap that is counted.
   * A sampler that only looked at the two frames following a dispatch would
   * miss a hitch that landed between samples.
   */
  function startFrameSampler() {
    const intervals = [];
    let previous = null;
    let running = true;
    function tick(now) {
      if (!running) return;
      if (previous !== null) intervals.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return {
      stop: () => {
        running = false;
        return intervals;
      },
    };
  }

  /**
   * Long frames with their script attribution.
   *
   * The entry is snapshotted because entry.scripts is a live-ish view that
   * the caller keeps after the observer is disconnected, and the aggregation
   * needs every script's URL and forced-layout time. Attribution is the whole
   * point: a frame with no plugin script is system preemption and must not be
   * blamed on the plugin.
   */
  function startLoafObserver() {
    const unsupported = { supported: false, entries: [], stop: () => {} };
    if (typeof PerformanceObserver !== "function") return unsupported;
    const supportedTypes = PerformanceObserver.supportedEntryTypes;
    if (!Array.isArray(supportedTypes) || !supportedTypes.includes("long-animation-frame")) return unsupported;
    const entries = [];
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          entries.push({
            duration: entry.duration,
            blockingDuration: entry.blockingDuration,
            renderStart: entry.renderStart,
            startTime: entry.startTime,
            scripts: Array.isArray(entry.scripts)
              ? entry.scripts.map((script) => ({
                  invoker: typeof script.invoker === "string" ? script.invoker : "",
                  sourceURL: typeof script.sourceURL === "string" ? script.sourceURL : "",
                  sourceFunctionName:
                    typeof script.sourceFunctionName === "string" ? script.sourceFunctionName : "",
                  duration: Number.isFinite(script.duration) ? script.duration : 0,
                  forcedStyleAndLayoutDuration: Number.isFinite(script.forcedStyleAndLayoutDuration)
                    ? script.forcedStyleAndLayoutDuration
                    : 0,
                  pauseDuration: Number.isFinite(script.pauseDuration) ? script.pauseDuration : 0,
                }))
              : [],
          });
        }
      });
      observer.observe({ type: "long-animation-frame", buffered: false });
    } catch {
      return unsupported;
    }
    return {
      supported: true,
      entries: entries,
      stop: () => {
        observer.disconnect();
      },
    };
  }

  /**
   * Activation keydown latency from Event Timing.
   *
   * duration is input to next paint, including the wait for the next frame,
   * which is why the gate allows two frames instead of one. durationThreshold:
   * 0 is the lowest value the API accepts; Chrome still floors observation at
   * 16ms, so a fast activation leaves no entry and the sample count is reported
   * beside the percentiles.
   */
  function startEventObserver() {
    const unsupported = { supported: false, durations: [], stop: () => {} };
    if (typeof PerformanceObserver !== "function") return unsupported;
    const supportedTypes = PerformanceObserver.supportedEntryTypes;
    if (!Array.isArray(supportedTypes) || !supportedTypes.includes("event")) return unsupported;
    const durations = [];
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType !== "event" || entry.name !== "keydown") continue;
          if (Number.isFinite(entry.duration)) durations.push(entry.duration);
        }
      });
      observer.observe({ type: "event", durationThreshold: 0, buffered: false });
    } catch {
      return unsupported;
    }
    return {
      supported: true,
      durations: durations,
      stop: () => {
        observer.disconnect();
      },
    };
  }

  function worstLoafOf(entries) {
    let worst = null;
    let worstDuration = -1;
    for (const entry of entries) {
      if (entry.duration <= worstDuration) continue;
      worstDuration = entry.duration;
      worst = {
        duration: roundMs(entry.duration),
        blockingDuration: roundMs(Number.isFinite(entry.blockingDuration) ? entry.blockingDuration : 0),
        renderStart: roundMs(Number.isFinite(entry.renderStart) ? entry.renderStart : 0),
        startTime: roundMs(Number.isFinite(entry.startTime) ? entry.startTime : 0),
      };
    }
    return worst;
  }

  async function runTier(candidates) {
    buildGrid(candidates);
    await settle(2);

    // Learned per tier because the driver gives every tier its own browser
    // context; repeating it also warms the compositor before warmup starts.
    const budgetSamples = await measureFrameBudget();
    const frameBudgetMs = frameBudgetMsOf(budgetSamples);
    // Publish the tier's own measurement to the app. The plugin would sample
    // the display again on its own; handing it the same number the verdict
    // uses keeps the batch controller and the gate talking about one budget.
    window.__DSH_JUMP_FRAME_BUDGET_MS__ = frameBudgetMs;
    mountApp(frameBudgetMs);

    // Blank control: the same tier, the same page, no activation. A busy
    // machine misses frames with the plugin idle, so this window is what the
    // active window's miss rate is compared against.
    const idleSamples = await measureFrameBudget();
    const idleFrameBudgetMs = frameBudgetMsOf(idleSamples);
    // Counted against the active tier's budget so both rates answer the same
    // threshold; idleFrameBudgetMs records whether the idle cadence drifted.
    const idleOverBudgetFrames = idleSamples.filter((gap) => gap > frameBudgetMs).length;

    const identity = measureIdentity();
    // One activation per round; counted rather than derived so the identity
    // total below multiplies a measured unit by an observed round count.
    let rounds = 0;
    let trustedActivations = 0;
    const activateRound = async () => {
      rounds += 1;
      const activation = await beginActivation(identity.labels);
      if (activation.trusted) trustedActivations += 1;
      // Stage A is interruptible and an oversized round paints across frames,
      // so the painted label count, not a frame count, is the readiness
      // signal. A round that never reaches the expected count rejects with
      // "collection did not settle" instead of yielding a half-round that the
      // calibration would then blame on the fixture.
      const usable = await activation.usable;
      return {
        handlerMs: activation.handlerMs,
        nextFrameMs: await activation.nextFrameMs,
        usable: usable,
      };
    };

    // Every tier gets its own cold start: a new grid invalidates layout, the
    // first round pays JIT and the first label mint pays allocation. Those
    // cycles run the exact measured shape so the warm path is the same path.
    let warmed = 0;
    for (let index = 0; index < CONFIG.warmup; index += 1) {
      await activateRound();
      const warmBadges = roundLabels();
      const warmFirst = warmBadges[0];
      if (warmFirst === undefined || warmFirst === "") throw new Error("warmup activation produced no label");
      await stroke(warmFirst.slice(0, 1));
      exitRound();
      await settle(1);
      warmed += 1;
    }

    // Warmup trusted activations must not enter the interaction sample; they
    // exist to warm the path, not to describe it.
    trustedActivations = 0;
    const frameSampler = startFrameSampler();
    const loaf = startLoafObserver();
    const eventTiming = startEventObserver();

    const activate = [];
    const firstStroke = [];
    const secondStroke = [];
    const timeToUsable = [];
    let labels = 0;
    let overlays = 0;

    for (let index = 0; index < CONFIG.runs; index += 1) {
      const activation = await activateRound();
      activate.push(activation);
      timeToUsable.push(activation.usable);
      const badges = roundLabels();
      if (index === 0) {
        labels = badges.length;
        overlays = overlayCount();
        // The calibration must describe the round the app really painted; the
        // activation above only returned after that count was reached.
        const drift = identityCalibrationDrift(identity.calls, identity.labels, labels);
        if (drift !== null) throw new Error(drift);
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
      const labelsNow = roundLabels();
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
    const closeNodes = roundLabels().length;
    const close = await stroke("Escape");

    const frameIntervals = frameSampler.stop();
    // Let both observers deliver entries queued by the final frame. Event
    // Timing entries are delivered after the next paint, which is later than a
    // microtask; dropping them would undercount the interaction tail.
    await new Promise((resolve) => setTimeout(resolve, 120));
    loaf.stop();
    eventTiming.stop();
    const perf = app.perfStats ? app.perfStats() : null;
    const plugin = summarizePluginFrame(perf);
    // The app was handed this tier's own measurement, so both numbers answer
    // the same display; prefer the app's copy so the source travels with it.
    const perfFrameBudgetMs = Number.isFinite(perf?.frameBudgetMs) ? perf.frameBudgetMs : frameBudgetMs;
    const budgetSource = typeof perf?.budgetSource === "string" ? perf.budgetSource : null;
    const attribution = summarizeScriptAttribution(loaf.entries, CONFIG.pluginBundle);
    const activationEventDurationMs = summarizeEventDurations(eventTiming.durations);
    const judgeable = isJudgeable({
      frameBudgetMs: perfFrameBudgetMs,
      pluginFrameMs: plugin.pluginFrameMs,
    });
    const loafEvidence = {
      note: LOAF_EVIDENCE_NOTE,
      supported: loaf.supported,
      longFrames: attribution.loafFrames,
      attributedPluginMs: attribution.attributedPluginMs,
      attributedForcedLayoutMs: attribution.attributedForcedLayoutMs,
      attributedFrames: attribution.attributedFrames,
      excludedLongFrames: attribution.excludedLongFrames,
      worst: worstLoafOf(loaf.entries),
    };
    const eventTimingEvidence = {
      note: EVENT_TIMING_EVIDENCE_NOTE,
      supported: eventTiming.supported,
      samples: eventTiming.durations.length,
      durationMs: activationEventDurationMs,
    };
    const maxFrameMs = roundMs(maxFrameIntervalMs(frameIntervals));
    const overBudgetFrames =
      frameIntervals.length === 0 ? null : frameIntervals.filter((gap) => gap > frameBudgetMs).length;
    const activeOverBudgetPct = overBudgetPct(overBudgetFrames, frameIntervals.length);
    const idleOverBudgetPct = overBudgetPct(idleOverBudgetFrames, idleSamples.length);
    const excess = excessOverBudgetPct(
      overBudgetFrames,
      frameIntervals.length,
      idleOverBudgetFrames,
      idleSamples.length,
    );
    const finishedAtMs = Date.now();

    // Freshness is only enforced under --verify-fresh, but the facts are
    // always recorded so a stale tier can be explained after the fact.
    const staleReasons = [];
    if (CONFIG.verifyFresh) {
      if (hadResultAtLoad) staleReasons.push("window.__BENCH_RESULT__ already existed before this page ran");
      if (navigationType !== "navigate") staleReasons.push('navigation.type is "' + navigationType + '"');
      if (!(finishedAtMs > navigationStartMs)) staleReasons.push("result timestamp is not after navigation start");
    }
    const verdict = staleReasons.length > 0 ? "stale" : frameVerdict(excess);
    const verdictAttributed =
      staleReasons.length > 0
        ? "stale"
        : attributedVerdict({
            judgeable: judgeable,
            frameBudgetMs: perfFrameBudgetMs,
            pluginFrameMs: plugin.pluginFrameMs,
          });

    return {
      candidates: candidates,
      labels: labels,
      overlayCount: overlays,
      warmup: warmed,
      identityKeys: identity.calls * rounds,
      identityKeysPerRound: identity.calls,
      identityRounds: rounds,
      identityPath: identity.calls > 0 && identity.remembered > 0 ? "active" : "inactive",
      frameBudgetMs: perfFrameBudgetMs,
      budgetSource: budgetSource,
      perfFrames: perf === null ? 0 : perf.frames,
      pluginFrameMs: plugin.pluginFrameMs,
      pluginCollectMs: plugin.pluginCollectMs,
      pluginPaintMs: plugin.pluginPaintMs,
      maxFrameMs: maxFrameMs,
      overBudgetFrames: overBudgetFrames,
      overBudgetPct: activeOverBudgetPct,
      frameCount: frameIntervals.length,
      frameBudgetSamples: budgetSamples.length,
      idleFrameBudgetMs: idleFrameBudgetMs,
      idleOverBudgetFrames: idleOverBudgetFrames,
      idleOverBudgetPct: idleOverBudgetPct,
      idleFrameCount: idleSamples.length,
      excessOverBudgetPct: excess,
      noiseBandPct: NOISE_BAND_PCT,
      verdict: verdict,
      verdictLegacyNote: VERDICT_LEGACY_NOTE,
      verdictAttributed: verdictAttributed,
      judgeable: judgeable,
      loafEvidence: loafEvidence,
      eventTimingEvidence: eventTimingEvidence,
      trustedActivations: trustedActivations,
      staleReasons: staleReasons,
      finishedAtMs: finishedAtMs,
      activate: phase(activate),
      firstStroke: phase(firstStroke),
      secondStroke: phase(secondStroke),
      complete: phase(complete),
      close: { ...phase([close]), nodes: closeNodes },
      timeToUsable: summarizeTimeToUsable(timeToUsable),
    };
  }

  function queryInteger(name) {
    const raw = new URLSearchParams(window.location.search).get(name);
    if (raw === null || raw === "") return null;
    if (!/^\\d+$/.test(raw)) throw new Error("query " + name + " must be a positive integer");
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error("query " + name + " must be a positive integer");
    }
    return value;
  }

  async function run() {
    const requestedTier = queryInteger("tier");
    const runToken = new URLSearchParams(window.location.search).get("r") || null;
    let tiers = CONFIG.candidates;
    if (requestedTier !== null) {
      if (!CONFIG.candidates.includes(requestedTier)) {
        throw new Error("query tier " + String(requestedTier) + " is not one of the configured candidates");
      }
      tiers = [requestedTier];
    }

    const startedAt = performance.now();
    const runs = [];
    for (let index = 0; index < tiers.length; index += 1) {
      const candidates = tiers[index];
      status.textContent =
        "running tier " + String(index + 1) + "/" + String(tiers.length) +
        " (" + String(candidates) + " candidates)" + (runToken === null ? "" : " run " + runToken);
      runs.push(await runTier(candidates));
      await settle(1);
    }
    const finishedAtMs = Date.now();
    const result = {
      viewport: [window.innerWidth, window.innerHeight],
      dpr: window.devicePixelRatio || 1,
      label: CONFIG.label,
      protocol: {
        runs: CONFIG.runs,
        warmup: CONFIG.warmup,
        percentileMethod: "nearest-rank",
        frameBudgetSamples: FRAME_BUDGET_SAMPLES,
        idleFrameBudgetSamples: FRAME_BUDGET_SAMPLES,
        verdictRule:
          "legacy differential rule, trend only: pass when active over-budget rate minus idle control rate is at most " +
          String(NOISE_BAND_PCT) +
          " percentage points",
        attributionRule:
          "pluginFrameMs.p99 <= frameBudgetMs * " +
          String(ATTRIBUTION_BUDGET_SHARE) +
          ", where pluginFrameMs adds the plugin's collect and paint samples of the same frame",
        judgeableRule:
          "judgeable when the display budget is finite and app.perfStats() produced at least one frame sample; " +
          "LoAF and Event Timing are coarse corroboration only",
        pluginProbeRule:
          "the plugin times each stage A collect slice and each paint with performance.now, flushes one pair per observed frame " +
          "and keeps the latest " +
          String(PERF_SAMPLE_LIMIT) +
          " frames",
        evidenceNote: LOAF_EVIDENCE_NOTE + " " + EVENT_TIMING_EVIDENCE_NOTE,
        headlessNote:
          "headless Chrome with --disable-gpu exercises software raster, not the GPU presentation path; " +
          "the probe still measures the plugin's own synchronous work, but treat headless numbers as a regression smoke test",
        timeToUsableRule:
          "wall clock from dispatchEvent return to every label of the round being painted, " +
          "sampled with performance.now; frames counted as animation frames observed in the same wait. " +
          "The ms reading is affected by background throttling, the frame count is the steadier relative quantity.",
        note:
          "Readings are sensitive to system load: the idle control window is measured on the same tier before activation, and only the excess over it decides the verdict.",
      },
      page: {
        url: window.location.href,
        runToken: runToken,
        requestedTier: requestedTier,
        navigationType: navigationType,
        navigationStartMs: navigationStartMs,
        timeOriginMs: performance.timeOrigin,
        hadResultAtLoad: hadResultAtLoad,
        openedAtMs: openedAtMs,
        finishedAtMs: finishedAtMs,
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

/** The bundle file name carried into the page for LoAF URL attribution. */
export function bundleFileNameOf(url) {
  const clean = String(url).split(/[?#]/)[0];
  const slash = clean.lastIndexOf("/");
  return slash === -1 ? clean : clean.slice(slash + 1);
}

export function pageHtml({ bundleUrl, candidates, runs, warmup, label, verifyFresh = false }) {
  const config = {
    candidates,
    runs,
    warmup,
    label,
    identityPath: "active",
    verifyFresh,
    pluginBundle: bundleFileNameOf(bundleUrl),
  };
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
  /* The frame budget is sampled under continuous animation, not on a static
     page: a composited pulse keeps the display committing frames without
     adding main-thread work that would contaminate the reading. */
  [data-bench-pulse] {
    position: fixed;
    left: 0;
    top: 0;
    width: 2px;
    height: 2px;
    pointer-events: none;
    will-change: transform, opacity;
    animation: bench-pulse 1s linear infinite;
  }
  @keyframes bench-pulse {
    from { transform: translate3d(0, 0, 0); opacity: 0.01; }
    to { transform: translate3d(4px, 0, 0); opacity: 0.02; }
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
<div data-bench-pulse aria-hidden="true"></div>
<div id="bench-status" data-bench-status>starting</div>
<pre id="bench-output" data-bench-output></pre>
<script src="${bundleUrl}"></script>
<script>${pageScript(config)}</script>
</body>
</html>
`;
}

async function writeArtifacts({ bundle, html, out, bundleName }) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const htmlPath = out === null ? join(OUTPUT_DIR, "dsh-jump-bench.html") : resolve(process.cwd(), out);
  await mkdir(dirname(htmlPath), { recursive: true });
  // The bundle must stay an external same-directory script: LoAF only
  // attributes scripts with a real source URL, never the inline document.
  const bundlePath = join(dirname(htmlPath), bundleName);
  await writeFile(bundlePath, bundle, "utf8");
  await writeFile(htmlPath, html, "utf8");
  return { bundlePath, htmlPath };
}

/** The bundle file that sits beside a generated page. */
export function pageBundleName(htmlPath) {
  return `${basename(htmlPath, extname(htmlPath))}.bundle.js`;
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
 * The repo ships no third-party browser driver and the page cannot write files, so the
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
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const message = { id, method, params };
      if (sessionId !== undefined) message.sessionId = sessionId;
      socket.send(JSON.stringify(message));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

const RESULT_EXPRESSION =
  "(() => {" +
  " const request = window.__BENCH_TRUSTED_REQUEST__ || null;" +
  " const error = window.__BENCH_ERROR__ || null;" +
  " const result = window.__BENCH_RESULT__ || null;" +
  " return { request: request, error: error, result: result };" +
  "})()";

async function evaluateValue(cdp, sessionId, expression) {
  const evaluation = await cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  return evaluation?.result?.value;
}

/**
 * Send the activation as a real input event.
 *
 * Event Timing ignores `dispatchEvent`, so the page cannot measure an
 * activation it synthesizes itself. The page publishes a request; the driver
 * answers with CDP key input, which Chrome treats as trusted. The id set
 * prevents a second poll from double-pressing while the page is still handing
 * the first event to its listener.
 */
async function sendTrustedActivation(cdp, sessionId, request, dispatched) {
  if (request === null || request === undefined || dispatched.has(request.id)) return;
  dispatched.add(request.id);
  const key = typeof request.key === "string" && request.key !== "" ? request.key : "h";
  const params = {
    type: "keyDown",
    key: key,
    code: `Key${key.toUpperCase()}`,
    modifiers: request.metaKey === true ? 4 : 0,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  };
  await cdp.send("Input.dispatchKeyEvent", params, sessionId).catch(() => undefined);
  await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" }, sessionId).catch(() => undefined);
}

async function waitForPageResult(cdp, sessionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const dispatched = new Set();
  while (Date.now() < deadline) {
    await sleep(100);
    let value;
    try {
      value = await evaluateValue(cdp, sessionId, RESULT_EXPRESSION);
    } catch {
      // A navigation commits by destroying the old execution context; the
      // next poll lands in the new document.
      continue;
    }
    if (value === null || value === undefined) continue;
    if (value.request) await sendTrustedActivation(cdp, sessionId, value.request, dispatched);
    if (value.error) throw new Error(`bench page failed: ${String(value.error)}`);
    if (value.result) return value.result;
  }
  throw new Error(`bench page did not finish within ${String(Math.round(timeoutMs / 1000))}s`);
}

/**
 * Why a tier's JSON cannot be trusted as this navigation's reading.
 *
 * The structural checks always run, because the whole point of the rewrite is
 * that no cached result may be merged silently. The `--verify-fresh` flag adds
 * the full contract: the global must have been empty before the page ran, the
 * document must have been reached by a navigation, and the result timestamp
 * must be later than that navigation.
 */
function tierFreshnessFailures(result, live, token, verifyFresh) {
  const failures = [];
  const page = result?.page;
  if (page === undefined || page === null) return ["result carries no page metadata"];
  if (page.runToken !== token) failures.push("result belongs to a different bench run token");
  if (live !== undefined && live.timeOriginMs !== page.timeOriginMs) {
    failures.push("result belongs to a different document (timeOrigin mismatch)");
  }
  if (verifyFresh) {
    if (page.hadResultAtLoad !== false) failures.push("window.__BENCH_RESULT__ already existed before the page ran");
    if (page.navigationType !== "navigate") failures.push(`navigation.type is "${String(page.navigationType)}"`);
    if (typeof page.finishedAtMs !== "number" || !(page.finishedAtMs > page.navigationStartMs)) {
      failures.push("result timestamp is not after navigation start");
    }
    if (live !== undefined && live.navigationType !== "navigate") {
      failures.push(`live navigation.type is "${String(live.navigationType)}"`);
    }
  }
  return failures;
}

/**
 * Serve the generated page over loopback HTTP.
 *
 * LoAF reports script attribution only for HTTP(S) scripts; a file:// bundle
 * arrives with no source URL, which would make attributedPluginMs null on
 * every automated run. The driver owns this server so the page and its bundle
 * stay a two-file unit wherever the driver runs.
 */
async function startPageServer(pagePath, bundleName) {
  const dir = dirname(pagePath);
  const files = new Map([
    [basename(pagePath), { body: await readFile(pagePath), type: "text/html; charset=utf-8" }],
    [bundleName, { body: await readFile(join(dir, bundleName)), type: "text/javascript; charset=utf-8" }],
  ]);
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    const name = decodeURIComponent(path.replace(/^\/+/, ""));
    const file = files.get(name);
    if (file === undefined) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": file.type, "cache-control": "no-store" });
    response.end(file.body);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Drive one fresh Chrome browser context per tier.
 *
 * The defect this replaces was a single tab reused across tiers, where a
 * poller could read the previous run's `window.__BENCH_RESULT__`. A new
 * browser context per tier makes storage, the JS realm and the compositor
 * state start clean, and the random query on every navigation makes a cached
 * document impossible to mistake for the new one.
 */
async function runTiersInChrome({ chrome, pagePath, bundleName, candidates, verifyFresh }) {
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
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let cdp;
  let pageServer;
  try {
    pageServer = await startPageServer(pagePath, bundleName);
    const port = await readDevtoolsPort(profile);
    const version = await (await fetch(`http://127.0.0.1:${String(port)}/json/version`)).json();
    if (typeof version?.webSocketDebuggerUrl !== "string") {
      throw new Error("Chrome exposes no browser DevTools socket");
    }
    cdp = await openCdp(version.webSocketDebuggerUrl);

    const tiers = [];
    const staleReasons = [];
    for (const count of candidates) {
      const context = await cdp.send("Target.createBrowserContext", { disposeOnDetach: true });
      const browserContextId = context.browserContextId;
      let targetId;
      let sessionId;
      try {
        const target = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId });
        targetId = target.targetId;
        const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        sessionId = attached.sessionId;
        await cdp.send("Page.enable", {}, sessionId);
        await cdp.send("Runtime.enable", {}, sessionId);
        await cdp.send("Page.bringToFront", {}, sessionId).catch(() => undefined);

        const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        const url =
          `${pageServer.origin}/${encodeURIComponent(basename(pagePath))}` +
          `?tier=${String(count)}&r=${encodeURIComponent(token)}&drive=1`;
        await cdp.send("Page.navigate", { url }, sessionId);
        const result = await waitForPageResult(cdp, sessionId, 240000);
        if (!Array.isArray(result.runs) || result.runs.length !== 1 || result.runs[0]?.candidates !== count) {
          throw new Error(`tier ${String(count)} returned an unexpected result shape`);
        }
        const live = await evaluateValue(
          cdp,
          sessionId,
          "(() => { const entry = performance.getEntriesByType('navigation')[0] || null;" +
            " return { timeOriginMs: performance.timeOrigin, navigationType: entry === null ? 'unknown' : entry.type };" +
            " })()",
        );
        const failures = tierFreshnessFailures(result, live, token, verifyFresh);
        const tier = result.runs[0];
        // The page runs the same freshness check from inside the realm; honor
        // its stale verdict even when the driver's own checks found nothing.
        let reasons = [];
        if (failures.length > 0) reasons = failures;
        else if (tier.verdict === "stale") reasons = tier.staleReasons ?? ["page marked the result stale"];
        const tierStale = reasons.length > 0;
        tier.realm = {
          timeOriginMs: result.page.timeOriginMs,
          navigationType: result.page.navigationType,
          hadResultAtLoad: result.page.hadResultAtLoad,
          runToken: result.page.runToken,
          url: result.page.url,
          freshVerified: !tierStale,
        };
        if (tierStale) {
          tier.verdict = "stale";
          tier.staleReasons = reasons;
          staleReasons.push(`tier ${String(count)}: ${reasons.join("; ")}`);
        }
        tiers.push(result);
      } finally {
        if (sessionId !== undefined) {
          await cdp.send("Target.detachFromTarget", { sessionId }).catch(() => undefined);
        }
        if (targetId !== undefined) {
          await cdp.send("Target.closeTarget", { targetId }).catch(() => undefined);
        }
        if (browserContextId !== undefined) {
          await cdp.send("Target.disposeBrowserContext", { browserContextId }).catch(() => undefined);
        }
      }
    }

    const first = tiers[0];
    return {
      result: {
        viewport: first.viewport,
        dpr: first.dpr,
        label: first.label,
        protocol: {
          ...first.protocol,
          driver: "chrome-cdp",
          browserContextPerTier: true,
          verifyFresh: verifyFresh,
          tiers: candidates,
        },
        page: first.page,
        runs: tiers.flatMap((tier) => tier.runs),
      },
      staleReasons,
    };
  } finally {
    cdp?.close();
    child.kill("SIGKILL");
    await pageServer?.close();
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

const REQUIRED_HOOKS = [
  "data-bench-root",
  "data-bench-pulse",
  "data-bench-status",
  "data-bench-output",
  "data-bench-state",
  "requestAnimationFrame",
  "KeyboardEvent",
  "dispatchEvent",
  "data-dsh-jump-overlay",
  "app.labels()",
  "app.visibleLabels()",
  "timeToUsable",
  "collection did not settle",
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
  "frameBudgetMs:",
  "maxFrameMs:",
  "overBudgetFrames:",
  "overBudgetPct:",
  "idleFrameBudgetMs:",
  "idleOverBudgetFrames:",
  "idleOverBudgetPct:",
  "idleFrameCount:",
  "excessOverBudgetPct:",
  "noiseBandPct:",
  "verdict:",
  "verdictRule",
  "timeToUsable:",
  "timeToUsableRule",
  "identityCalibrationDrift",
  "staleReasons",
  "perfStats",
  "pluginFrameMs:",
  "pluginCollectMs:",
  "pluginPaintMs:",
  "budgetSource:",
  "PERF_SAMPLE_LIMIT",
  "summarizePluginFrame",
  "loafEvidence",
  "eventTimingEvidence",
  "long-animation-frame",
  "sourceURL",
  "sourceFunctionName",
  "forcedStyleAndLayoutDuration",
  "pauseDuration",
  "attributedPluginMs:",
  "attributedForcedLayoutMs:",
  "attributedFrames:",
  "excludedLongFrames:",
  "trustedActivations:",
  "durationThreshold: 0",
  "__BENCH_TRUSTED_REQUEST__",
  "pluginBundle",
  "judgeable:",
  "verdictAttributed:",
  "verdictLegacyNote:",
  "attributionRule",
  "judgeableRule",
  "pluginProbeRule",
  "evidenceNote",
  "headlessNote",
  "verifyFresh",
  "navigationType",
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

/**
 * Frame budget contract.
 *
 * The acceptance rule is "no frame may exceed the budget", so the reading has
 * to be the maximum interval, not a percentile: a single hitch is exactly what
 * p95 was hiding. The budget itself comes from the display, measured as the
 * median of 240 animation frames and rounded up to 0.1ms so a 143Hz panel
 * reports 7.0 rather than a binary-float neighbour.
 */
function assertFrameBudgetContract() {
  const cases = [
    { intervals: Array.from({ length: 240 }, () => 6.94), expected: 7 },
    { intervals: [16.6, 16.7, 16.8, 16.9], expected: 16.8 },
    { intervals: [7.01, 7.02, 7.03], expected: 7.1 },
    { intervals: [5, 1, 3], expected: 3 },
    { intervals: [], expected: null },
  ];
  for (const item of cases) {
    const actual = frameBudgetMsOf(item.intervals);
    if (actual !== item.expected) {
      throw new Error(
        `frame budget of ${String(item.intervals.length)} intervals is ${String(actual)}, expected ${String(item.expected)}`,
      );
    }
  }
  if (frameBudgetMsOf([3, 1, 2]) !== 2) {
    throw new Error("frame budget must take the median, not the mean or the max");
  }

  if (frameVerdict(0) !== "pass") throw new Error("no excess over the idle control must pass");
  if (frameVerdict(NOISE_BAND_PCT) !== "pass") throw new Error("the noise band itself must pass");
  if (frameVerdict(NOISE_BAND_PCT + 0.1) !== "fail") throw new Error("one tenth over the noise band must fail");
  if (frameVerdict(-3) !== "pass") throw new Error("an active window calmer than the control must pass");
  if (frameVerdict(null) !== "fail") throw new Error("a window with no frames must not pass");

  // 100 samples: nearest-rank p95 is 5, but a single 40ms hitch must still win.
  const tail = [...Array.from({ length: 99 }, () => 5), 40];
  const max = maxFrameIntervalMs(tail);
  if (max !== 40) throw new Error(`maxFrameMs must be 40, got ${String(max)}`);
  if (nearestRankPercentile(tail, 95) !== 5) {
    throw new Error("fixture is wrong: p95 of 99 fast frames and one hitch should be 5");
  }
  if (max === nearestRankPercentile(tail, 95)) {
    throw new Error("maxFrameMs must not collapse into a percentile");
  }
  if (maxFrameIntervalMs([]) !== null) throw new Error("maxFrameMs of no frames must be null");
}

/**
 * Blank control contract.
 *
 * The gate is a difference, so the arithmetic has to be fixed and hand
 * checkable: active 10/100 against idle 4/100 is 6 percentage points and must
 * fail, active 9/100 against 4/100 is exactly the 5-point band and must pass.
 * The counts stay in the result so a reader can recompute every percentage.
 */
function assertIdleControlContract() {
  if (overBudgetPct(10, 100) !== 10) throw new Error("10/100 over-budget frames must print as 10%");
  if (overBudgetPct(0, 0) !== null) throw new Error("an empty window has no percentage");
  const cases = [
    { active: 10, activeCount: 100, idle: 4, idleCount: 100, expectedPct: 6, expectedVerdict: "fail" },
    { active: 9, activeCount: 100, idle: 4, idleCount: 100, expectedPct: 5, expectedVerdict: "pass" },
    { active: 6, activeCount: 100, idle: 4, idleCount: 100, expectedPct: 2, expectedVerdict: "pass" },
    { active: 4, activeCount: 100, idle: 10, idleCount: 100, expectedPct: -6, expectedVerdict: "pass" },
    { active: 0, activeCount: 240, idle: 0, idleCount: 240, expectedPct: 0, expectedVerdict: "pass" },
  ];
  for (const item of cases) {
    const pct = excessOverBudgetPct(item.active, item.activeCount, item.idle, item.idleCount);
    if (pct !== item.expectedPct) {
      throw new Error(
        `excess of ${String(item.active)}/${String(item.activeCount)} over ` +
          `${String(item.idle)}/${String(item.idleCount)} is ${String(pct)}, expected ${String(item.expectedPct)}`,
      );
    }
    if (frameVerdict(pct) !== item.expectedVerdict) {
      throw new Error(`excess ${String(pct)} must verdict ${item.expectedVerdict}`);
    }
  }
  if (excessOverBudgetPct(0, 0, 0, 10) !== null) throw new Error("an empty active window must not produce a difference");
}

/**
 * LoAF attribution contract.
 *
 * The gate asks what the plugin did inside a long frame, not how long the
 * frame was. A fixed fixture pins the three traps: vendor scripts must not be
 * summed, frames without any plugin script must be excluded rather than
 * counted as zero-cost plugin work, and the per-frame total must add every
 * plugin entry in that frame.
 */
function assertAttributionContract() {
  const bundle = "dsh-jump-bench.bundle.js";
  const entries = [
    {
      duration: 60,
      scripts: [
        {
          invoker: "BUTTON#a.onclick",
          sourceURL: "http://127.0.0.1:7810/dsh-jump-bench.bundle.js?cache=1",
          sourceFunctionName: "onActivate",
          duration: 12.5,
          forcedStyleAndLayoutDuration: 3.5,
          pauseDuration: 0,
        },
        {
          invoker: "BUTTON#a.onclick",
          sourceURL: "http://127.0.0.1:7810/vendor.js",
          sourceFunctionName: "",
          duration: 40,
          forcedStyleAndLayoutDuration: 10,
          pauseDuration: 0,
        },
      ],
    },
    {
      duration: 80,
      scripts: [
        {
          invoker: "FrameRequestCallback",
          sourceURL: "http://127.0.0.1:7810/vendor.js",
          sourceFunctionName: "",
          duration: 70,
          forcedStyleAndLayoutDuration: 20,
          pauseDuration: 0,
        },
      ],
    },
    {
      duration: 100,
      scripts: [
        {
          invoker: "FrameRequestCallback",
          sourceURL: "http://127.0.0.1:7810/dsh-jump-bench.bundle.js",
          sourceFunctionName: "paint",
          duration: 4,
          forcedStyleAndLayoutDuration: 1,
          pauseDuration: 2,
        },
        {
          invoker: "FrameRequestCallback",
          sourceURL: "http://127.0.0.1:7810/dsh-jump-bench.bundle.js",
          sourceFunctionName: "paint",
          duration: 2,
          forcedStyleAndLayoutDuration: 0.5,
          pauseDuration: 0,
        },
      ],
    },
    { duration: 55, scripts: [] },
  ];
  const summary = summarizeScriptAttribution(entries, bundle);
  const expected = {
    attributedPluginMs: { p50: 6, p99: 12.5, max: 12.5, min: 6 },
    attributedForcedLayoutMs: { p50: 1.5, p99: 3.5, max: 3.5, min: 1.5 },
    excludedLongFrames: 2,
    attributedFrames: 2,
    loafFrames: 4,
  };
  if (JSON.stringify(summary) !== JSON.stringify(expected)) {
    throw new Error(
      `LoAF attribution summary is ${JSON.stringify(summary)}, expected ${JSON.stringify(expected)}`,
    );
  }
  const onlyBundle = pluginScriptEntries(entries[0], bundle);
  if (onlyBundle.length !== 1 || onlyBundle[0].duration !== 12.5) {
    throw new Error("pluginScriptEntries must keep exactly the plugin bundle entry");
  }
  const lookalike = summarizeScriptAttribution(
    [
      {
        duration: 70,
        scripts: [
          { sourceURL: "http://127.0.0.1:7810/other.js?file=dsh-jump-bench.bundle.js", duration: 70 },
        ],
      },
    ],
    bundle,
  );
  if (lookalike.attributedFrames !== 0 || lookalike.excludedLongFrames !== 1) {
    throw new Error("a query string carrying the bundle name must not attribute a foreign script");
  }
  const empty = summarizeScriptAttribution([], bundle);
  if (empty.attributedPluginMs.p99 !== null || empty.attributedFrames !== 0 || empty.excludedLongFrames !== 0) {
    throw new Error("an empty LoAF window must report nulls and zero frames");
  }
}

/**
 * Plugin occupancy contract.
 *
 * The probe flushes one pair per observed frame, so a fixed series pins the
 * aggregation: p50/p99/max are nearest-rank over the paired sums, and the
 * 600-frame fixture proves the 512-frame window keeps the newest samples. A
 * host that reports mismatched array lengths is not frame-aligned; the
 * combined series must stay null instead of pairing invented frames.
 */
function assertPerfProbeContract() {
  const fixed = summarizePluginFrame({
    samples: { collect: [0, 1, 2, 3], paint: [3, 4, 5, 6] },
    frames: 4,
  });
  const expected = JSON.stringify({
    pluginFrameMs: { p50: 5, p99: 9, max: 9, samples: 4, aligned: true },
    pluginCollectMs: { p50: 1, p99: 3, max: 3, samples: 4 },
    pluginPaintMs: { p50: 4, p99: 6, max: 6, samples: 4 },
  });
  if (JSON.stringify(fixed) !== expected) {
    throw new Error(`plugin occupancy summary is ${JSON.stringify(fixed)}, expected ${expected}`);
  }

  const long = {
    samples: {
      collect: Array.from({ length: 600 }, (_, index) => index),
      paint: Array.from({ length: 600 }, (_, index) => index),
    },
  };
  const capped = summarizePluginFrame(long);
  if (capped.pluginFrameMs.samples !== PERF_SAMPLE_LIMIT) {
    throw new Error(`600 frames must keep ${PERF_SAMPLE_LIMIT} samples, got ${String(capped.pluginFrameMs.samples)}`);
  }
  if (capped.pluginFrameMs.max !== 1198) {
    throw new Error(`the 600-frame window must keep the newest frame pair, got max ${String(capped.pluginFrameMs.max)}`);
  }
  const kept = boundedSamples(long.samples.collect);
  if (kept.length !== PERF_SAMPLE_LIMIT || kept[0] !== 88 || kept[kept.length - 1] !== 599) {
    throw new Error("the bounded window must drop the oldest samples first");
  }

  const empty = summarizePluginFrame({ samples: { collect: [], paint: [] } });
  if (empty.pluginFrameMs.p99 !== null || empty.pluginFrameMs.samples !== 0) {
    throw new Error("an empty perfStats window must report nulls, not zeros");
  }
  if (summarizePluginFrame(null).pluginFrameMs.p99 !== null) {
    throw new Error("a host without perfStats must not fabricate a plugin frame reading");
  }

  const misaligned = summarizePluginFrame({ samples: { collect: [1, 2], paint: [1] } });
  if (misaligned.pluginFrameMs.aligned !== false || misaligned.pluginFrameMs.p99 !== null) {
    throw new Error("mismatched arrays are not frame-aligned and must not be added");
  }
}

/**
 * Attributed verdict boundary.
 *
 * The plugin p99 at exactly half the frame budget passes and one hundredth
 * over fails. Event Timing is not an input, so a tier with a fast plugin
 * cannot fail on a coarse interaction sample; a missing plugin sample is never
 * a pass.
 */
function assertAttributedVerdictContract() {
  const budget = 7;
  const plugin = { p50: 1, p99: 3.5, max: 3.5, samples: 20, aligned: true };
  const verdict = (patch) =>
    attributedVerdict({
      judgeable: true,
      frameBudgetMs: budget,
      pluginFrameMs: plugin,
      ...patch,
    });
  if (verdict({}) !== "pass") throw new Error("p99 at exactly half the budget must pass");
  if (verdict({ pluginFrameMs: { ...plugin, p99: 3.5001 } }) !== "fail") {
    throw new Error("a plugin p99 just over half the budget must fail");
  }
  if (verdict({ pluginFrameMs: null }) !== "fail") {
    throw new Error("a tier with no plugin frame sample must not pass");
  }
  if (verdict({ judgeable: false }) !== "smoke-only") {
    throw new Error("a non-judgeable tier must report smoke-only instead of pass or fail");
  }
}

/**
 * Judgeability contract.
 *
 * The plugin's own probe is the only input beyond the display budget: LoAF
 * reporting nothing and Event Timing flooring at 16ms are exactly the defect
 * this layer exists to fix, so neither may make a tier non-judgeable.
 */
function assertJudgeableContract() {
  const plugin = { p50: 1, p99: 2, max: 2, samples: 20, aligned: true };
  if (isJudgeable({ frameBudgetMs: 7, pluginFrameMs: plugin }) !== true) {
    throw new Error("a measured budget and one plugin frame sample must be judgeable");
  }
  if (isJudgeable({ frameBudgetMs: 7, pluginFrameMs: null }) !== false) {
    throw new Error("no plugin frame sample must not be judgeable");
  }
  if (isJudgeable({ frameBudgetMs: 7, pluginFrameMs: { p50: null, p99: null, max: null, samples: 0 } }) !== false) {
    throw new Error("an empty plugin sample must not be judgeable");
  }
  if (isJudgeable({ frameBudgetMs: null, pluginFrameMs: plugin }) !== false) {
    throw new Error("an unmeasured display budget must not be judgeable");
  }
  if (isJudgeable({ frameBudgetMs: 0, pluginFrameMs: plugin }) !== false) {
    throw new Error("a zero frame budget must not be judgeable");
  }
}

/**
 * Calibration invariant for a settled round.
 *
 * A complete round has calls === hints === painted labels. The old bench read
 * the DOM badge count two frames after activation; on 300 candidates that is
 * about 96 labels, and the calibration must reject that partial round rather
 * than call the fixture drifted or, worse, pass.
 */
function assertIdentityCalibrationContract() {
  if (identityCalibrationDrift(300, 300, 300) !== null) {
    throw new Error("a complete 300-label round must pass the identity calibration");
  }
  if (identityCalibrationDrift(300, 300, 96) === null) {
    throw new Error("reading labels before stage A commits must not pass calibration");
  }
  if (identityCalibrationDrift(299, 300, 300) === null) {
    throw new Error("a round with a missing identity call must not pass calibration");
  }
}

/**
 * timeToUsable contract.
 *
 * The shape is fixed because the README table and the acceptance diff both
 * read it: ms carries p50/p95/max, frames carries p50/max. A frame count is a
 * small integer, so a p95 there would usually just duplicate the max on ten
 * samples while pretending to describe a tail.
 */
function assertTimeToUsableContract() {
  const summary = summarizeTimeToUsable([
    { ms: 12.3456, frames: 2 },
    { ms: 20, frames: 9 },
    { ms: 30, frames: 10 },
    { ms: 40, frames: 12 },
  ]);
  const expected = {
    ms: { p50: 20, p95: 40, max: 40 },
    frames: { p50: 9, max: 12 },
  };
  if (JSON.stringify(summary) !== JSON.stringify(expected)) {
    throw new Error(
      `timeToUsable summary is ${JSON.stringify(summary)}, expected ${JSON.stringify(expected)}`,
    );
  }
  const single = summarizeTimeToUsable([{ ms: 7.5555, frames: 4 }]);
  if (single.ms.p50 !== 7.556 || single.ms.p95 !== 7.556 || single.ms.max !== 7.556) {
    throw new Error("timeToUsable ms must round to three decimals");
  }
  if (single.frames.p50 !== 4 || single.frames.max !== 4) {
    throw new Error("a single timeToUsable sample must report itself for both frame percentiles");
  }
  const empty = summarizeTimeToUsable([]);
  if (empty.ms.p50 !== null || empty.ms.max !== null || empty.frames.p50 !== null) {
    throw new Error("an empty timeToUsable window must report nulls, not zeros");
  }
}

/**
 * Settle guard contract.
 *
 * Both limits must be able to fail on their own: a throttled tab starves
 * frames long past the wall clock, and a machine under load can spend three
 * seconds inside 199 frames. A round that did reach the expected count must
 * pass even after both limits, otherwise the guard would reject the very
 * round that proves it works.
 */
function assertSettleContract() {
  if (collectionSettleFailure(300, 299, 0, 0) !== null) {
    throw new Error("a round still inside both limits must not be declared unfinished");
  }
  if (collectionSettleFailure(300, 0, SETTLE_FRAME_LIMIT - 1, SETTLE_TIMEOUT_MS - 1) !== null) {
    throw new Error("a round one frame and one millisecond short of both limits must still wait");
  }
  const byFrames = collectionSettleFailure(300, 0, SETTLE_FRAME_LIMIT, 10);
  if (byFrames === null || !byFrames.includes("collection did not settle")) {
    throw new Error("a round past the frame limit must fail with collection did not settle");
  }
  const byTime = collectionSettleFailure(300, 96, 3, SETTLE_TIMEOUT_MS);
  if (byTime === null || !byTime.includes("300") || !byTime.includes("96")) {
    throw new Error("the settle failure must name the expected and painted label counts");
  }
  if (collectionSettleFailure(300, 300, SETTLE_FRAME_LIMIT, SETTLE_TIMEOUT_MS) !== null) {
    throw new Error("a round that reached its expected count must pass even after the limits");
  }
}

/**
 * Readiness contract.
 *
 * `finish()` fills `app.labels()` in one synchronous step, so its count says
 * the round exists, not that a reader can see it. Only `visibleLabels()` grows
 * with painted frames on the oversized path. The gate must therefore read the
 * painted count: a round whose assignment is complete but whose paint is not
 * keeps waiting, then fails, and never resolves as usable.
 */
function assertReadinessContract() {
  if (collectionReadiness(2001, 2001, 1000, 0, 0) !== null) {
    throw new Error("an assigned-but-unpainted round must keep waiting, not resolve");
  }
  const late = collectionReadiness(2001, 2001, 1000, SETTLE_FRAME_LIMIT, 10);
  if (late === null || !late.includes("2001") || !late.includes("1000")) {
    throw new Error("an assigned-but-unpainted round must fail after the settle limits");
  }
  if (collectionReadiness(2001, 2000, 2001, SETTLE_FRAME_LIMIT, SETTLE_TIMEOUT_MS) !== null) {
    throw new Error("a fully painted round must pass even after both limits");
  }
}

/**
 * Freshness contract.
 *
 * A fresh tier is a result produced by this navigation in this document. The
 * cases below are the exact ways the old bench could hand back the previous
 * run's JSON: a result that already existed, a reload instead of a navigation,
 * a timestamp from before the navigation, or a different document realm.
 */
function assertFreshnessContract() {
  const base = {
    runToken: "token-a",
    timeOriginMs: 1000,
    navigationType: "navigate",
    hadResultAtLoad: false,
    navigationStartMs: 1000,
    finishedAtMs: 2000,
  };
  const live = { timeOriginMs: 1000, navigationType: "navigate" };
  function failuresWith(patch, token = "token-a", liveValue = live) {
    return tierFreshnessFailures({ page: { ...base, ...patch } }, liveValue, token, true);
  }
  if (failuresWith({}).length !== 0) throw new Error("a fresh result must pass the freshness contract");

  const staleCases = [
    { name: "pre-existing result", patch: { hadResultAtLoad: true } },
    { name: "reload instead of navigation", patch: { navigationType: "reload" } },
    { name: "timestamp before navigation", patch: { finishedAtMs: 999 } },
  ];
  for (const item of staleCases) {
    if (failuresWith(item.patch).length === 0) throw new Error(`--verify-fresh must reject ${item.name}`);
  }
  if (failuresWith({}, "token-b").length === 0) throw new Error("--verify-fresh must reject a result from another run");
  if (failuresWith({}, "token-a", { timeOriginMs: 2000, navigationType: "navigate" }).length === 0) {
    throw new Error("--verify-fresh must reject a result from another document");
  }
  // Without the flag only identity checks run, so a fresh context is still
  // required and a cached result cannot be merged silently.
  if (tierFreshnessFailures({ page: { ...base, runToken: "token-b" } }, live, "token-a", false).length === 0) {
    throw new Error("the structural run-token check must run even without --verify-fresh");
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
  const custom = parseArgs(["--runs", "10", "--warmup", "3", "--label", "smoke", "--verify-fresh"]);
  if (custom.warmup !== 3) throw new Error("--warmup 3 should override the default");
  if (custom.label !== "smoke") throw new Error("--label smoke should reach the output");
  if (custom.verifyFresh !== true) throw new Error("--verify-fresh should reach the page configuration");
  if (parseArgs([]).label !== null) throw new Error("label should default to null");
  if (parseArgs([]).verifyFresh !== false) throw new Error("freshness verification should default to off");
  if (parseArgs(["--no-browser"]).noBrowser !== true) throw new Error("--no-browser should force page-only mode");
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
  const allowed = new Set([
    "esbuild",
    "node:child_process",
    "node:fs/promises",
    "node:http",
    "node:os",
    "node:path",
    "node:url",
  ]);
  for (const specifier of specifiers) {
    if (!allowed.has(specifier)) throw new Error(`bench imports "${specifier}", which may reach the network`);
  }
  if (specifiers.length === 0) throw new Error("bench source exposes no imports; the offline assertion would pass vacuously");
}

function assertNoNetworkApis(text, label, allowedScriptSrc = null) {
  const patterns = [
    { name: "fetch(", re: /\bfetch\s*\(/ },
    { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
    { name: "WebSocket", re: /\bWebSocket\b/ },
    { name: "importScripts", re: /\bimportScripts\b/ },
    { name: "http(s) URL", re: /https?:\/\//i },
  ];
  for (const pattern of patterns) {
    if (pattern.re.test(text)) throw new Error(`${label} depends on ${pattern.name}`);
  }
  for (const match of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)) {
    if (allowedScriptSrc !== null && match[1] === allowedScriptSrc) continue;
    throw new Error(`${label} depends on an external script: ${match[1]}`);
  }
}

export async function check() {
  const bundle = await bundleApp();
  if (!bundle.includes(GLOBAL_NAME)) throw new Error("bundle lost its IIFE global");
  if (!bundle.includes("createApp")) throw new Error("bundle does not export createApp");
  console.log(`check bundle: ok (${bundle.length} bytes)`);

  const defaultWarmup = resolveWarmup(DEFAULT_RUNS, null);
  const checkBundleUrl = "dsh-jump-bench.bundle.js";
  const html = pageHtml({
    bundleUrl: checkBundleUrl,
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
    !html.includes('"verifyFresh":false') ||
    !html.includes(`"pluginBundle":"${checkBundleUrl}"`) ||
    !html.includes(`<script src="${checkBundleUrl}"></script>`) ||
    !html.includes('"nearest-rank"') ||
    !html.includes("legacy differential rule") ||
    !html.includes("pluginFrameMs.p99 <= frameBudgetMs *") ||
    !html.includes("app.perfStats() produced at least one frame sample") ||
    !html.includes("background throttling, the frame count is the steadier relative quantity") ||
    !html.includes("idleOverBudgetFrames:")
  ) {
    throw new Error("generated page lost its candidate/run/warmup/label/protocol/idle-control configuration");
  }
  const freshHtml = pageHtml({
    bundleUrl: checkBundleUrl,
    candidates: DEFAULT_CANDIDATES,
    runs: DEFAULT_RUNS,
    warmup: defaultWarmup,
    label: null,
    verifyFresh: true,
  });
  if (!freshHtml.includes('"verifyFresh":true')) {
    throw new Error("--verify-fresh did not reach the generated page configuration");
  }
  console.log("check html hooks: ok");

  assertPercentileCases();
  console.log("check percentile: ok (9 cases, nearest rank)");

  assertFrameBudgetContract();
  console.log("check frame budget: ok (median ceil to 0.1ms, max not percentile, noise-band verdict boundary)");

  assertIdleControlContract();
  console.log("check idle control: ok (fixed inputs, excess percentage, 5-point band)");

  assertAttributionContract();
  console.log("check attribution: ok (bundle-only sums, excluded frames, empty window nulls)");

  assertPerfProbeContract();
  console.log("check perf probe: ok (paired p50/p99/max, 600 frames keep 512, empty and unaligned windows null)");

  assertAttributedVerdictContract();
  console.log("check attributed verdict: ok (half-budget p99 boundary, missing sample fails)");

  assertJudgeableContract();
  console.log("check judgeable: ok (plugin samples decide, missing budget and missing samples rejected)");

  assertIdentityCalibrationContract();
  console.log("check identity calibration: ok (complete round passes, partial 96/300 rejected)");

  assertTimeToUsableContract();
  console.log("check time to usable: ok (ms p50/p95/max, frames p50/max, empty window nulls)");

  assertSettleContract();
  console.log("check settle guard: ok (frame and wall-clock limits, a settled round passes)");

  assertReadinessContract();
  console.log("check readiness: ok (assigned full but painted short is not ready)");

  assertFreshnessContract();
  console.log("check freshness: ok (pre-existing result, reload, timestamp, foreign realm rejected)");

  assertRunsBoundary();
  console.log("check runs boundary: ok (--runs 1 accepted, p95 warned below the floor)");

  assertArchiveContract();
  await assertArchiveWrite();
  console.log("check archive: ok (label naming, directory creation, JSON round-trip)");

  assertNoNetworkApis(html, "generated page", checkBundleUrl);
  assertNoNetworkApis(bundle, "bundle");
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  assertOfflineSource(source);
  const directEntry = source.slice(source.indexOf("if (invokedDirectly)"));
  if (!directEntry.includes("main().catch") || !directEntry.includes("process.exitCode = 1")) {
    throw new Error("bench failure path must reject and set a non-zero exit code");
  }
  console.log("check offline: ok");

  console.log("BENCH CHECK OK");
}

function printHelp() {
  console.log(`dsh-jump frame budget bench

  node bench/measure.mjs                     generate the page and run it if Chrome exists
  node bench/measure.mjs --check             deterministic self-check, no browser
  node bench/measure.mjs --candidates 80,300,600,1200
  node bench/measure.mjs --runs 60 --warmup 10 --label before
  node bench/measure.mjs --out temp/bench.html
  node bench/measure.mjs --label before --archive temp/bench-runs
  node bench/measure.mjs --verify-fresh      require proof of a fresh navigation per tier
  node bench/measure.mjs --no-browser        generate the page without launching Chrome

Every tier discards min(10, runs) warmup cycles before sampling; --warmup
overrides that count. --label is copied into the JSON so two sources measured
under one protocol can be told apart.

When a local Chrome is found, every candidate tier runs in its own headless
browser context, navigated to a uniquely tagged URL and verified before its
reading is accepted. Without Chrome the page is only generated and printed, and
the JSON is collected by opening it in a real browser foreground tab.

Acceptance is the plugin's own frame occupancy: app.perfStats() pairs the
collect slice and the paint of each observed frame, and pluginFrameMs.p99 must
stay within half of frameBudgetMs. frameBudgetMs is the median of 240
animation-frame gaps rounded up to 0.1ms. LoAF and Event Timing are printed as
coarse corroboration only: LoAF reports only frames over 50ms and Event Timing
floors at 16ms, so neither can resolve a 2ms plugin handler on a 7ms display.
The legacy differential verdict is still printed but is a trend only. Headless
Chrome with --disable-gpu draws through software raster; treat its numbers as a
regression smoke test even when judgeable is true.`);
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
  const pagePath = options.out === null ? join(OUTPUT_DIR, "dsh-jump-bench.html") : resolve(process.cwd(), options.out);
  const bundleName = pageBundleName(pagePath);
  const html = pageHtml({
    bundleUrl: bundleName,
    candidates: options.candidates,
    runs: options.runs,
    warmup,
    label: options.label,
    verifyFresh: options.verifyFresh,
  });
  const paths = await writeArtifacts({ bundle, html, out: options.out, bundleName });
  console.log(`bundle: ${paths.bundlePath}`);
  console.log(`page: ${paths.htmlPath}`);

  const chrome = options.noBrowser ? null : await findChrome();
  if (chrome === null) {
    if (options.archive !== null) {
      throw new Error("--archive needs a local Chrome; set CHROME_PATH to its executable");
    }
    console.log(
      options.noBrowser
        ? "dsh-jump bench: 已按 --no-browser 跳过浏览器驱动，未采集读数。"
        : "dsh-jump bench: 未检测到本机 Chrome，未采集读数。",
    );
    console.log(
      "用真实浏览器打开上面的页面：页面会自动跑完每一档，把含 pluginFrameMs / collect / paint / " +
        "budgetSource / verdictAttributed / judgeable 的 JSON 打在页面上。",
    );
    if (options.verifyFresh) {
      console.log("--verify-fresh 的新鲜度自检由页面在每档结束时执行；没有脚本可驱动的浏览器时脚本以 0 退出。");
    }
    return;
  }

  const collected = await runTiersInChrome({
    chrome,
    pagePath: paths.htmlPath,
    bundleName,
    candidates: options.candidates,
    verifyFresh: options.verifyFresh,
  });
  const result = collected.result;
  console.log("driver: chrome-cdp (headless, fresh browser context per tier)");
  for (const tier of result.runs) {
    const plugin = tier.pluginFrameMs;
    console.log(
      `tier ${String(tier.candidates)}: frameBudgetMs ${String(tier.frameBudgetMs)}` +
        ` budgetSource ${String(tier.budgetSource)}` +
        ` pluginFrameMs p50/p99/max ${String(plugin.p50)}/${String(plugin.p99)}/${String(plugin.max)}ms` +
        ` samples ${String(plugin.samples)} aligned ${String(plugin.aligned)}` +
        ` collect p50/p99/max ${String(tier.pluginCollectMs.p50)}/${String(tier.pluginCollectMs.p99)}/${String(tier.pluginCollectMs.max)}ms` +
        ` paint p50/p99/max ${String(tier.pluginPaintMs.p50)}/${String(tier.pluginPaintMs.p99)}/${String(tier.pluginPaintMs.max)}ms` +
        ` judgeable ${String(tier.judgeable)} verdictAttributed ${String(tier.verdictAttributed)}`,
    );
    const loaf = tier.loafEvidence;
    const events = tier.eventTimingEvidence;
    console.log(
      `tier ${String(tier.candidates)}: loafEvidence longFrames ${String(loaf.longFrames)}` +
        ` attributed p50/p99/max ${String(loaf.attributedPluginMs.p50)}/${String(loaf.attributedPluginMs.p99)}/${String(loaf.attributedPluginMs.max)}ms` +
        ` samples ${String(events.samples)}` +
        ` (coarse corroboration only)`,
    );
    console.log(
      `tier ${String(tier.candidates)}: legacy overBudget ${String(tier.overBudgetFrames)}/${String(tier.frameCount)}` +
        ` idle ${String(tier.idleOverBudgetFrames)}/${String(tier.idleFrameCount)}` +
        ` excess ${String(tier.excessOverBudgetPct)}pp verdict ${String(tier.verdict)} (trend only)`,
    );
  }
  if (options.archive !== null) {
    const archived = await writeArchive(options.archive, archiveFileName(options.label), result);
    console.log(`archive: ${archived}`);
  }
  console.log("BENCH_RESULT " + JSON.stringify(result));
  if (collected.staleReasons.length > 0) {
    console.error(`dsh-jump bench: stale reading: ${collected.staleReasons.join("; ")}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`dsh-jump bench: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
