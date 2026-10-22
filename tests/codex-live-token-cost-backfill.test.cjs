"use strict";

// Regression tests for the usage backfill pipeline:
// - quota trim-retry for the local mirror + daily ledger (no silent data loss)
// - idb-first imports (idbOnly) that leave the localStorage mirror untouched
// - per-request call rows + invocation rows reaching the profile ledger/rollup
// - cross-source dedupe (thread + time window + usage signature)
//
// Harness copied from codex-live-token-cost.test.cjs (localStorage-fallback mode).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { TextDecoder } = require("node:util");
const zlib = require("node:zlib");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-live-token-cost.js");
const code = fs.readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

const LOCAL_USAGE_KEY = "__codexLiveTokenCostLocalUsageV1";
const DAILY_USAGE_KEY = "__codexLiveTokenCostDailyUsageV1";
const PROFILE_LEDGER_SNAPSHOT_KEY = "__codexLiveTokenCostProfileLedgerV2";

const listeners = new Map();
const windowListeners = new Map();
const storage = new Map();
const bridgeCalls = [];
const delayedTimers = [];
const FIXED_NOW = Date.parse("2026-07-04T12:00:00.000Z");
let currentNow = FIXED_NOW;
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [currentNow]));
  }

  static now() {
    return currentNow;
  }

  static parse(value) {
    return Date.parse(value);
  }

  static UTC(...args) {
    return Date.UTC(...args);
  }
}
const electronBridge = {};
Object.defineProperty(electronBridge, "sendMessageFromView", {
  value(message) {
    bridgeCalls.push(message);
    return Promise.resolve();
  },
  writable: false,
  configurable: false,
});

function addWindowListener(type, handler) {
  const handlers = windowListeners.get(type) || [];
  handlers.push(handler);
  windowListeners.set(type, handlers);
}

function removeWindowListener(type, handler) {
  windowListeners.set(
    type,
    (windowListeners.get(type) || []).filter((item) => item !== handler),
  );
}

function dispatchWindowEvent(event) {
  const handlers = (windowListeners.get(event.type) || []).slice();
  event.preventDefault ||= function preventDefault() {
    this.defaultPrevented = true;
  };
  event.stopImmediatePropagation ||= function stopImmediatePropagation() {
    this.__stopped = true;
  };
  for (const handler of handlers) {
    handler.call(context, event);
    if (event.__stopped) break;
  }
  return !event.defaultPrevented;
}

const context = {
  console,
  setTimeout(handler, delay = 0) {
    if (typeof handler === "function" && !delay) handler();
    else if (typeof handler === "function") delayedTimers.push({ handler, delay });
    return delayedTimers.length || 1;
  },
  clearTimeout() {},
  setInterval() {
    return 0;
  },
  clearInterval() {},
  Promise,
  Array,
  Map,
  Proxy,
  Reflect,
  WeakSet,
  Response,
  AbortController,
  TextDecoder,
  JSON,
  Date: FixedDate,
  Math,
  Number,
  String,
  RegExp,
  URL,
  atob(value) {
    return Buffer.from(value, "base64").toString("binary");
  },
  btoa(value) {
    return Buffer.from(value, "binary").toString("base64");
  },
  NodeFilter: { SHOW_TEXT: 4 },
  getComputedStyle() {
    return { display: "block", visibility: "visible", opacity: "1" };
  },
  localStorage: {
    get length() {
      return storage.size;
    },
    getItem() {
      return storage.get(arguments[0]) ?? null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    key() {
      return Array.from(storage.keys())[arguments[0]] ?? null;
    },
  },
  document: {
    readyState: "loading",
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener() {},
    createElement(tagName) {
      return {
        tagName: String(tagName || "").toUpperCase(),
        id: "",
        dataset: {},
        style: {},
        children: [],
        parentElement: null,
        classList: { add() {}, remove() {}, contains() { return false; } },
        setAttribute() {},
        removeAttribute() {},
        appendChild(child) {
          this.children.push(child);
          child.parentElement = this;
          return child;
        },
        remove() {},
      };
    },
    getElementById() {
      return {};
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  },
  history: {
    state: null,
    pushState() {},
  },
  location: { pathname: "/", href: "app://-/" },
  electronBridge,
  addEventListener: addWindowListener,
  removeEventListener: removeWindowListener,
  dispatchEvent: dispatchWindowEvent,
  postMessage(message, origin) {
    dispatchWindowEvent({ type: "message", data: message, origin, source: context });
  },
};
context.window = context;
context.globalThis = context;
context.__CODEX_LIVE_TOKEN_COST_TEST__ = true;

vm.runInNewContext(code, context, { filename: scriptPath });

const api = context.__codexLiveTokenCostTest;
assert.ok(api, "test api must be exposed");

const readJson = (key) => {
  const raw = context.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};

const rolloutTurnRow = {
  turnId: "rollout-turn-1",
  threadKey: "local:rollout-thread",
  sessionKey: "local:rollout-thread",
  source: "codex-rollout-backfill",
  importSource: "codex-rollout-backfill",
  model: "gpt-5.5",
  startedAt: "2026-06-25T10:00:00.000Z",
  finishedAt: "2026-06-25T10:01:00.000Z",
  createdAt: "2026-06-25T10:00:00.000Z",
  callCount: 2,
  usage: { input: 300, output: 60, cached: 0, total: 360 },
  calls: [
    { usage: { input: 100, output: 20, cached: 0, total: 120 }, observedAt: Date.parse("2026-06-25T10:00:20.000Z") },
    { usage: { input: 200, output: 40, cached: 0, total: 240 }, observedAt: Date.parse("2026-06-25T10:00:50.000Z") },
  ],
  invocations: [
    { type: "skill", skill_id: "quota-skill", skill_name: "Quota Skill", invocationId: "rollout-turn-1:skill:quota-skill" },
    { type: "plugin", plugin_id: "github", plugin_name: "GitHub", invocationId: "rollout-turn-1:mcp:github:1" },
  ],
};

(async () => {
  await new Promise((resolve) => setImmediate(resolve));

  // --- 1. rollout backfill import: idbOnly + per-request calls + invocations ---
  const mirrorBefore = context.localStorage.getItem(LOCAL_USAGE_KEY);
  const firstImport = api.importLocalUsageTurns([rolloutTurnRow], {
    replaceSource: "codex-rollout-backfill",
    idbOnly: true,
    dedupeAgainstLedger: true,
  });
  assert.equal(firstImport.imported, 1);
  assert.equal(firstImport.deduped, 0);
  assert.equal(firstImport.skipped, 0);
  assert.equal(firstImport.total, 1);
  assert.equal(context.localStorage.getItem(LOCAL_USAGE_KEY), mirrorBefore, "idbOnly import must not touch the local mirror");

  const profileTurn = api.profileLedgerTurns().find((turn) => turn.turnId === "rollout-turn-1");
  assert.ok(profileTurn, "imported turn must reach the profile ledger");
  assert.equal(profileTurn.usage.total, 360);
  assert.equal(profileTurn.callCount, 2);
  assert.equal(profileTurn.invocationIds.length, 2);

  const turnCalls = Object.values(api.profileLedgerUsageCalls()).filter((call) => call.turnId === "rollout-turn-1");
  assert.equal(turnCalls.length, 2);
  assert.deepEqual(
    turnCalls.map((call) => call.usage.total).sort((a, b) => a - b),
    [120, 240],
  );

  const turnInvocations = Object.values(api.profileLedgerInvocations()).filter((invocation) => invocation.turnId === "rollout-turn-1");
  assert.equal(turnInvocations.length, 2);

  const stats = api.localProfileResponse().stats;
  assert.equal(stats.lifetime_tokens, 360);
  assert.equal(stats.total_threads, 1);
  assert.equal(stats.unique_skills_used, 1);
  assert.equal(stats.total_skills_used, 1);
  assert.equal(stats.unique_plugins_used, 1);
  assert.equal(stats.total_plugins_used, 1);
  assert.equal(stats.most_used_plugin, "GitHub");
  assert.equal(stats.most_used_plugin_usage_count, 1);
  const backfillDay = stats.daily_usage_buckets.find((day) => day.start_date === "2026-06-25");
  assert.equal(backfillDay.tokens, 360);
  assert.equal(backfillDay.requests, 2);

  const snapshotAfterImport = readJson(PROFILE_LEDGER_SNAPSHOT_KEY);
  assert.ok(Array.isArray(snapshotAfterImport.usageCalls));
  assert.equal(snapshotAfterImport.usageCalls.filter((call) => call.turnId === "rollout-turn-1").length, 2);
  assert.equal((snapshotAfterImport.invocations || []).filter((invocation) => invocation.turnId === "rollout-turn-1").length, 2);

  // --- 2. re-import is idempotent (same turnId + replaceSource) ---
  const reimport = api.importLocalUsageTurns([rolloutTurnRow], {
    replaceSource: "codex-rollout-backfill",
    idbOnly: true,
    dedupeAgainstLedger: true,
  });
  assert.equal(reimport.imported, 1);
  assert.equal(api.localProfileResponse().stats.lifetime_tokens, 360);
  assert.equal(api.profileLedgerTurns().length, 1);
  assert.equal(Object.values(api.profileLedgerUsageCalls()).filter((call) => call.turnId === "rollout-turn-1").length, 2);
  assert.equal(Object.values(api.profileLedgerInvocations()).filter((invocation) => invocation.turnId === "rollout-turn-1").length, 2);

  // --- 3. cross-source dedupe: same thread + 90s window + usage signature ---
  const dedupeAttempt = api.importLocalUsageTurns(
    [
      {
        turnId: "rollout-turn-1-shadow",
        threadKey: "local:rollout-thread",
        sessionKey: "local:rollout-thread",
        source: "codex-legacy-import",
        importSource: "codex-legacy-import",
        model: "gpt-5.5",
        startedAt: "2026-06-25T10:00:30.000Z",
        usage: { input: 300, output: 60, cached: 0, total: 360 },
      },
    ],
    { replaceSource: "codex-legacy-import", idbOnly: true, dedupeAgainstLedger: true },
  );
  assert.equal(dedupeAttempt.imported, 0);
  assert.equal(dedupeAttempt.deduped, 1);
  assert.equal(api.localProfileResponse().stats.lifetime_tokens, 360);

  // a different usage signature in the same window is a different turn
  const distinctImport = api.importLocalUsageTurns(
    [
      {
        turnId: "rollout-turn-1-distinct",
        threadKey: "local:rollout-thread",
        sessionKey: "local:rollout-thread",
        source: "codex-legacy-import",
        importSource: "codex-legacy-import",
        model: "gpt-5.5",
        startedAt: "2026-06-25T10:00:40.000Z",
        usage: { input: 301, output: 60, cached: 0, total: 361 },
      },
    ],
    { replaceSource: "codex-legacy-import", idbOnly: true, dedupeAgainstLedger: true },
  );
  assert.equal(distinctImport.imported, 1);
  assert.equal(api.localProfileResponse().stats.lifetime_tokens, 721);

  // the same signature outside the window is a different turn
  const farImport = api.importLocalUsageTurns(
    [
      {
        turnId: "rollout-turn-1-far",
        threadKey: "local:rollout-thread",
        sessionKey: "local:rollout-thread",
        source: "codex-legacy-import",
        importSource: "codex-legacy-import",
        model: "gpt-5.5",
        startedAt: "2026-06-25T10:20:00.000Z",
        usage: { input: 300, output: 60, cached: 0, total: 360 },
      },
    ],
    { replaceSource: "codex-legacy-import", idbOnly: true, dedupeAgainstLedger: true },
  );
  assert.equal(farImport.imported, 1);
  assert.equal(api.localProfileResponse().stats.lifetime_tokens, 1081);

  // without the opt-in flag the same cross-source row imports again
  const controlImport = api.importLocalUsageTurns(
    [
      {
        turnId: "rollout-turn-1-shadow",
        threadKey: "local:rollout-thread",
        sessionKey: "local:rollout-thread",
        source: "codex-legacy-import",
        importSource: "codex-legacy-import",
        model: "gpt-5.5",
        startedAt: "2026-06-25T10:00:30.000Z",
        usage: { input: 300, output: 60, cached: 0, total: 360 },
      },
    ],
    { replaceSource: "codex-legacy-import", idbOnly: true },
  );
  assert.equal(controlImport.imported, 1);
  assert.equal(api.localProfileResponse().stats.lifetime_tokens, 1441);

  // --- 4. quota trim-retry on the localStorage mirror ---
  const quotaRows = [];
  const quotaBase = Date.parse("2026-06-20T04:00:00.000Z");
  for (let index = 0; index < 300; index += 1) {
    quotaRows.push({
      turnId: `quota-retry-turn-${index}`,
      sessionKey: "local:quota-retry-thread",
      source: "quota-retry-source",
      importSource: "quota-retry-source",
      model: "gpt-5.5",
      createdAt: new Date(quotaBase + index * 60000).toISOString(),
      usage: { input: 100 + index, output: 10, cached: 5, total: 110 + index },
    });
  }
  const seedImport = api.importLocalUsageTurns(quotaRows);
  assert.equal(seedImport.imported, 300);
  const fullMirror = context.localStorage.getItem(LOCAL_USAGE_KEY);
  assert.ok(fullMirror && fullMirror.length > 0);
  const mirrorByteBudget = Math.floor(fullMirror.length * 0.3);
  const originalSetItem = context.localStorage.setItem;
  context.localStorage.setItem = function quotaLimitedMirror(key, value) {
    if (key === LOCAL_USAGE_KEY && String(value).length > mirrorByteBudget) {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    return originalSetItem.call(this, key, value);
  };
  const afterQuota = api.importLocalUsageTurns([
    {
      turnId: "quota-retry-turn-extra",
      sessionKey: "local:quota-retry-thread",
      source: "quota-retry-source",
      importSource: "quota-retry-source",
      model: "gpt-5.5",
      createdAt: new Date(quotaBase + 301 * 60000).toISOString(),
      usage: { input: 500, output: 20, cached: 0, total: 520 },
    },
  ]);
  context.localStorage.setItem = originalSetItem;
  assert.equal(afterQuota.imported, 1);
  const trimmedMirror = readJson(LOCAL_USAGE_KEY);
  assert.ok(trimmedMirror.turns.length >= 1 && trimmedMirror.turns.length < seedImport.total + 1, "quota retry must persist a trimmed mirror");
  assert.equal(api.storageSaveErrors().localLedger, "");
  assert.ok(Object.keys(trimmedMirror.archive?.days || {}).includes("2026-06-20"), "evicted mirror turns must fold into the archive");
  const quotaThreadTurns = api.profileLedgerTurns().filter((turn) => String(turn.turnId).startsWith("quota-retry-turn"));
  assert.equal(quotaThreadTurns.length, 301, "profile ledger keeps every imported turn even when the mirror trims");

  // --- 5. hard quota exhaustion: flag set, mirror + memory preserved, recovery clears flag ---
  const mirrorBeforeFailure = context.localStorage.getItem(LOCAL_USAGE_KEY);
  const localTurnsBeforeFailure = api.localUsageExport().turns.length;
  context.localStorage.setItem = function hardQuotaMirror(key, value) {
    if (key === LOCAL_USAGE_KEY) {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    return originalSetItem.call(this, key, value);
  };
  const failedSave = api.saveLocalLedger();
  context.localStorage.setItem = originalSetItem;
  assert.equal(failedSave, false);
  assert.equal(api.storageSaveErrors().localLedger, "quota");
  assert.equal(context.localStorage.getItem(LOCAL_USAGE_KEY), mirrorBeforeFailure);
  assert.equal(api.localUsageExport().turns.length, localTurnsBeforeFailure);
  assert.equal(api.saveLocalLedger(), true);
  assert.equal(api.storageSaveErrors().localLedger, "");

  // non-quota storage errors set a distinct flag and never trim
  context.localStorage.setItem = function blockedMirror(key, value) {
    if (key === LOCAL_USAGE_KEY) {
      const error = new Error("denied");
      error.name = "SecurityError";
      throw error;
    }
    return originalSetItem.call(this, key, value);
  };
  assert.equal(api.saveLocalLedger(), false);
  context.localStorage.setItem = originalSetItem;
  assert.equal(api.storageSaveErrors().localLedger, "storage");
  assert.equal(api.localUsageExport().turns.length, localTurnsBeforeFailure);
  assert.equal(api.saveLocalLedger(), true);
  assert.equal(api.storageSaveErrors().localLedger, "");

  // --- 6. daily ledger trim-retry ---
  const dailyItems = [];
  for (let index = 0; index < 400; index += 1) {
    dailyItems.push({
      key: `daily-quota-${index}`,
      turnId: `daily-quota-turn-${index}`,
      usage: { input: 100, output: 10, cached: 0, total: 110, exact: true },
    });
  }
  const dailyPayload = JSON.stringify({ date: "2026-06-20", items: dailyItems });
  const dailyByteBudget = Math.floor(dailyPayload.length * 0.3);
  context.localStorage.setItem = function quotaLimitedDaily(key, value) {
    if (key === DAILY_USAGE_KEY && String(value).length > dailyByteBudget) {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    return originalSetItem.call(this, key, value);
  };
  assert.equal(api.saveDailyLedger({ date: "2026-06-20", items: dailyItems }), true);
  context.localStorage.setItem = originalSetItem;
  const trimmedDaily = readJson(DAILY_USAGE_KEY);
  assert.equal(trimmedDaily.date, "2026-06-20");
  assert.ok(trimmedDaily.items.length >= 1 && trimmedDaily.items.length < 400, "daily quota retry must persist trimmed items");
  assert.ok(trimmedDaily.items.length <= 200);
  assert.equal(api.storageSaveErrors().daily, "");

  // --- 7. scanner-shaped row: raw codex usage fields + occurrence aggregation ---
  const scannerImport = api.importLocalUsageTurns(
    [
      {
        turnId: "01a12e4d-d582-7491-92ba-79857d5f38e3",
        sessionKey: "local:01a12e4d-d582-7491-92ba-79857d5f38e3",
        threadKey: "local:01a12e4d-d582-7491-92ba-79857d5f38e3",
        threadAttributionStatus: "reliable",
        model: "gpt-5.6-sol",
        effort: "high",
        createdAt: "2026-07-01T08:00:00.000Z",
        startedAt: "2026-07-01T08:00:00.000Z",
        finishedAt: "2026-07-01T08:02:00.000Z",
        durationMs: 120000,
        callCount: 2,
        usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 60, reasoning_output_tokens: 20, total_tokens: 1060 },
        calls: [
          { usage: { input_tokens: 400, cached_input_tokens: 100, output_tokens: 20, total_tokens: 420 }, observedAt: "2026-07-01T08:00:30.000Z" },
          { usage: { input_tokens: 600, cached_input_tokens: 300, output_tokens: 40, total_tokens: 640 }, observedAt: "2026-07-01T08:01:40.000Z" },
        ],
        invocations: [
          { type: "skill", skill_id: "reload-test", skill_name: "reload-test", invocationId: "skill:reload-test", occurrence: 2 },
        ],
        source: "codex-usage-backfill",
        importSource: "codex-usage-backfill",
      },
    ],
    { replaceSource: "codex-usage-backfill", idbOnly: true },
  );
  assert.equal(scannerImport.imported, 1);
  const scannerTurn = api.profileLedgerTurns().find((turn) => turn.turnId === "01a12e4d-d582-7491-92ba-79857d5f38e3");
  assert.ok(scannerTurn, "scanner turn must reach the profile ledger");
  assert.equal(scannerTurn.model, "gpt-5.6-sol");
  assert.equal(scannerTurn.effort, "high");
  assert.equal(scannerTurn.usage.exact, true);
  assert.equal(scannerTurn.usage.input, 1000, "cached tokens must not inflate input");
  assert.equal(scannerTurn.usage.cached, 400);
  assert.equal(scannerTurn.usage.output, 60);
  assert.equal(scannerTurn.usage.total, 1060);
  const scannerCalls = Object.values(api.profileLedgerUsageCalls()).filter((call) => call.turnId === scannerTurn.turnId);
  assert.equal(scannerCalls.length, 2);
  const scannerInvocations = Object.values(api.profileLedgerInvocations()).filter((invocation) => invocation.turnId === scannerTurn.turnId);
  assert.equal(scannerInvocations.length, 1);
  assert.equal(scannerInvocations[0].occurrence, 2);
  const scannerStats = api.localProfileResponse().stats;
  assert.equal(scannerStats.unique_skills_used, 2);
  assert.equal(scannerStats.total_skills_used, 3, "occurrence weight must be preserved on import");
  const scannerDay = scannerStats.daily_usage_buckets.find((day) => day.start_date === "2026-07-01");
  assert.equal(scannerDay.tokens, 1060);
  assert.equal(scannerDay.input_tokens, 1000);
  assert.equal(scannerDay.cached_tokens, 400);
  assert.equal(scannerDay.requests, 2);

  // --- 8. usage sync: rollout parse (parity with codex-usage-backfill.cjs) ---
  const syncStartedUnix = Date.parse("2026-07-01T08:00:00.000Z") / 1000;
  const syncCompletedUnix = Date.parse("2026-07-01T08:02:00.000Z") / 1000;
  const syncSampleLines = [
    JSON.stringify({ timestamp: "2026-07-01T08:00:00.000Z", type: "session_meta", payload: { id: "01sync-thread", session_id: "01sync-thread", cwd: "C:\\proj" } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "sync-turn-1", model: "gpt-5.5", effort: "high" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "sync-turn-1", started_at: syncStartedUnix } }),
    JSON.stringify({ timestamp: "2026-07-01T08:00:30.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 400, cached_input_tokens: 100, output_tokens: 20, total_tokens: 420 } } } }),
    JSON.stringify({ timestamp: "2026-07-01T08:01:40.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 600, cached_input_tokens: 300, output_tokens: 40, total_tokens: 640 } } } }),
    JSON.stringify({ type: "event_msg", payload: { type: "mcp_tool_call_end", invocation: { server: "github" } } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "shell", arguments: JSON.stringify({ command: "type C:\\Users\\ovo\\.codex\\skills\\sync-skill\\SKILL.md" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "mcp__plugin-tools__search", arguments: "{}" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "sync-turn-1", duration_ms: 120000, completed_at: syncCompletedUnix } }),
    "{broken json}",
  ];
  const parseSummary = { lineErrors: 0 };
  const parsedThread = api.usageSyncParseLines(syncSampleLines, parseSummary);
  assert.ok(parsedThread, "rollout with session_meta must parse into a thread");
  assert.equal(parsedThread.threadId, "01sync-thread");
  assert.equal(parseSummary.lineErrors, 1, "broken lines must be counted, not fatal");
  const syncTurnRecord = parsedThread.turns.get("sync-turn-1");
  assert.ok(syncTurnRecord, "token_count calls must register under the active turn");
  assert.equal(syncTurnRecord.model, "gpt-5.5");
  assert.equal(syncTurnRecord.effort, "high");
  // token_count 不再直接进 calls：它是会重复的心跳，只能作为无 record 时的降级来源。
  assert.equal(syncTurnRecord.calls.length, 0, "token_count must not land in the call list directly");
  assert.equal(syncTurnRecord.fallbackCalls.length, 2, "each distinct token_count is one fallback entry");
  assert.equal(syncTurnRecord.responses.size, 0, "no token_usage_record in this fixture");
  assert.equal(syncTurnRecord.skillCounts.get("sync-skill"), 1);
  assert.equal(syncTurnRecord.pluginCounts.get("github"), 1);
  assert.equal(syncTurnRecord.pluginCounts.get("plugin-tools"), 1);
  const syncTurnRow = api.usageSyncFinalizeTurnRow("01sync-thread", syncTurnRecord);
  assert.equal(syncTurnRow.turnId, "sync-turn-1");
  assert.equal(syncTurnRow.sessionKey, "local:01sync-thread");
  assert.equal(syncTurnRow.callCount, 2);
  assert.equal(syncTurnRow.usage.input_tokens, 1000);
  assert.equal(syncTurnRow.usage.cached_input_tokens, 400);
  assert.equal(syncTurnRow.usage.total_tokens, 1060);
  assert.equal(syncTurnRow.durationMs, 120000);
  assert.equal(syncTurnRow.usageSource, "token_count_fallback");
  assert.equal(syncTurnRow.source, "codex-usage-backfill");
  assert.equal(syncTurnRow.invocations.length, 3, "skill + mcp server + mcp function call must all map to invocations");

  // orphan calls (no task_started) land on the dedicated orphan row
  const orphanThread = api.usageSyncParseLines([
    JSON.stringify({ type: "session_meta", payload: { session_id: "01sync-orphan" } }),
    JSON.stringify({ timestamp: "2026-07-01T09:00:00.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 } } } }),
  ]);
  assert.equal(orphanThread.turns.size, 0);
  assert.equal(orphanThread.orphanCalls.length, 1);
  const orphanRow = api.usageSyncFinalizeTurnRow("01sync-orphan", {
    turnId: "01sync-orphan:orphan",
    calls: orphanThread.orphanCalls,
    skillCounts: new Map(),
    pluginCounts: new Map(),
  });
  assert.equal(orphanRow.turnId, "01sync-orphan:orphan");
  assert.equal(orphanRow.callCount, 1);

  // zstd payloads decode through the embedded fzstd (Codex compresses old rollouts)
  const syncRolloutText = syncSampleLines.filter((line) => line !== "{broken json}").join("\n") + "\n";
  assert.equal(api.usageSyncDecodeBytes(Buffer.from(syncRolloutText, "utf8")), syncRolloutText, "plain jsonl bytes must decode as-is");
  if (typeof zlib.zstdCompressSync === "function") {
    const compressed = zlib.zstdCompressSync(Buffer.from(syncRolloutText, "utf8"));
    assert.equal(api.usageSyncDecodeBytes(compressed), syncRolloutText, "zstd bytes must decode via embedded fzstd");
  } else {
    console.log("note: node zlib.zstdCompressSync unavailable; zstd decode test skipped");
  }

  // --- 9. usage sync: directory-handle end-to-end (mock File System Access) ---
  function mockFileHandle(name, text, lastModified) {
    const bytes = Buffer.from(text, "utf8");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return {
      kind: "file",
      name,
      getFile: async () => ({
        size: bytes.length,
        lastModified,
        arrayBuffer: async () => buffer.slice(0),
      }),
    };
  }
  function mockDirectoryHandle(name, children) {
    return {
      kind: "directory",
      name,
      entries: () => children.slice(),
      getDirectoryHandle: async (childName) => {
        const found = (children || []).find((entry) => entry[0] === childName);
        if (!found || !found[1] || found[1].kind !== "directory") throw new Error("NotFoundError");
        return found[1];
      },
    };
  }
  const syncFileName = "rollout-2026-07-01T08-00-00-01sync-thread.jsonl";
  const syncFileHandle = mockFileHandle(syncFileName, syncRolloutText, 1750000000000);
  const syncDayHandle = mockDirectoryHandle("01", [[syncFileName, syncFileHandle]]);
  const syncMonthHandle = mockDirectoryHandle("07", [["01", syncDayHandle]]);
  const syncYearHandle = mockDirectoryHandle("2026", [["07", syncMonthHandle]]);
  const syncSessionsHandle = mockDirectoryHandle("sessions", [["2026", syncYearHandle]]);
  const syncRootHandle = mockDirectoryHandle(".codex", [["sessions", syncSessionsHandle]]);

  const syncRun = await api.usageSyncRun({ dirHandle: syncRootHandle });
  assert.equal(syncRun.busy, false);
  assert.ok(syncRun.result, "sync run must record a result");
  assert.equal(syncRun.result.imported, 1);
  assert.equal(syncRun.result.files, 1);
  assert.equal(syncRun.result.turns, 1);
  assert.ok(String(syncRun.status).startsWith("同步完成：写入 1 轮"), "status must report success: " + syncRun.status);
  assert.equal(syncRun.handleStored, true, "dir handle must be kept for the next run");
  const syncedTurn = api.profileLedgerTurns().find((turn) => turn.turnId === "sync-turn-1");
  assert.ok(syncedTurn, "synced turn must reach the profile ledger");
  assert.equal(syncedTurn.usage.total, 1060);
  const syncedCalls = Object.values(api.profileLedgerUsageCalls()).filter((call) => call.turnId === "sync-turn-1");
  assert.equal(syncedCalls.length, 2, "per-request rows must reach the ledger");
  const syncedInvocations = Object.values(api.profileLedgerInvocations()).filter((invocation) => invocation.turnId === "sync-turn-1");
  assert.equal(syncedInvocations.length, 3);

  // unchanged files (stamp cache) are skipped without re-import
  const stampKey = `sessions/2026/07/01/${syncFileName}`;
  const stampOnly = await api.usageSyncCollectRows(syncRootHandle, {
    stamps: { [stampKey]: { lastModified: 1750000000000, size: Buffer.byteLength(syncRolloutText, "utf8") } },
  });
  assert.equal(stampOnly.scannedFiles, 1);
  assert.equal(stampOnly.skippedFiles, 1);
  assert.equal(stampOnly.rows.length, 0);

  // re-running the sync is idempotent even without a stamp cache
  const syncRerun = await api.usageSyncRun();
  assert.equal(syncRerun.result.imported, 1);
  assert.equal(api.profileLedgerTurns().filter((turn) => turn.turnId === "sync-turn-1").length, 1);
  assert.equal(Object.values(api.profileLedgerUsageCalls()).filter((call) => call.turnId === "sync-turn-1").length, 2);

  // an empty/wrong folder reports a friendly miss instead of throwing
  const syncMiss = await api.usageSyncRun({ dirHandle: mockDirectoryHandle(".codex-empty", []) });
  assert.equal(syncMiss.busy, false);
  assert.ok(String(syncMiss.status).includes("未找到会话记录"), "miss status expected: " + syncMiss.status);

  // --- 10. usage sync: app-server auto channel (silent backfill, no picker) ---
  // auto mode without a usable channel stays quiet: no picker, no throw
  const autoQuiet = await api.usageSyncRun({ auto: true });
  assert.equal(autoQuiet.busy, false);
  assert.ok(String(autoQuiet.status).startsWith("自动同步暂不可用"), "quiet auto status expected: " + autoQuiet.status);

  // root derivation from rollout paths (visible + archived, extended-length prefix stripped)
  assert.equal(
    api.usageSyncRootFromRolloutPath("\\\\?\\C:\\Users\\ovo\\.codex\\sessions\\2026\\10\\15\\rollout-2026-10-15T14-49-58-01a13e53-2008-71c0-b385-bb92f2431c54.jsonl"),
    "C:\\Users\\ovo\\.codex",
  );
  assert.equal(api.usageSyncRootFromRolloutPath("C:\\Users\\x\\.codex\\archived_sessions\\rollout-1.jsonl.zst"), "C:\\Users\\x\\.codex");
  assert.equal(api.usageSyncRootFromRolloutPath("C:\\Users\\x\\sessions\\rollout-1.jsonl"), "");
  assert.equal(api.usageSyncRootFromRolloutPath(""), "");
  assert.equal(api.usageSyncJoinPath("C:\\Users\\x\\.codex\\", "sessions"), "C:\\Users\\x\\.codex\\sessions");
  assert.deepEqual(Array.from(api.usageSyncBase64ToBytes("aGVsbG8=")), Array.from(Buffer.from("hello", "utf8")));

  const autoStartedUnix = Date.parse("2026-07-02T09:00:00.000Z") / 1000;
  const autoCompletedUnix = Date.parse("2026-07-02T09:01:30.000Z") / 1000;
  const autoRolloutText =
    [
      JSON.stringify({ timestamp: "2026-07-02T09:00:00.000Z", type: "session_meta", payload: { session_id: "01auto-thread", cwd: "C:\\proj" } }),
      JSON.stringify({ type: "turn_context", payload: { turn_id: "auto-turn-1", model: "gpt-5.5", effort: "medium" } }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "auto-turn-1", started_at: autoStartedUnix } }),
      JSON.stringify({ timestamp: "2026-07-02T09:00:20.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 300, cached_input_tokens: 50, output_tokens: 25, total_tokens: 325 } } } }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "auto-turn-1", duration_ms: 90000, completed_at: autoCompletedUnix } }),
    ].join("\n") + "\n";
  const autoFileName = "rollout-2026-07-02T09-00-00-01auto-thread.jsonl";
  const autoDir = "C:\\Users\\auto\\.codex";
  const autoFilePath = `${autoDir}\\sessions\\2026\\07\\02\\${autoFileName}`;
  const autoModifiedAt = 1751450000000;
  const autoEntries = new Map([
    [`${autoDir}\\sessions`, [{ fileName: "2026", isDirectory: true }]],
    [`${autoDir}\\sessions\\2026`, [{ fileName: "07", isDirectory: true }]],
    [`${autoDir}\\sessions\\2026\\07`, [{ fileName: "02", isDirectory: true }]],
    [`${autoDir}\\sessions\\2026\\07\\02`, [{ fileName: autoFileName, isFile: true }]],
    [`${autoDir}\\archived_sessions`, []],
  ]);
  const autoRequests = [];
  const autoClient = {
    hostId: "local",
    async sendRequest(method, params) {
      autoRequests.push({ method, params });
      if (method === "thread/list") return { data: [{ id: "01auto-thread", path: `\\\\?\\${autoFilePath}` }] };
      if (method === "fs/readDirectory") {
        if (!autoEntries.has(params.path)) throw new Error("ENOENT " + params.path);
        return { entries: autoEntries.get(params.path) };
      }
      if (method === "fs/getMetadata") {
        if (params.path !== autoFilePath) throw new Error("ENOENT " + params.path);
        return { isFile: true, modifiedAtMs: autoModifiedAt };
      }
      if (method === "fs/readFile") {
        if (params.path !== autoFilePath) throw new Error("ENOENT " + params.path);
        return { dataBase64: Buffer.from(autoRolloutText, "utf8").toString("base64") };
      }
      throw new Error("unexpected app-server method: " + method);
    },
  };

  // client discovery through the Codex++ native host client map (WeakRef entry)
  context.__codexPlusNativeHostClients = new Map([["local", { hostId: "local", ref: { deref: () => autoClient } }]]);
  assert.equal(api.usageSyncResolveClient(), autoClient);
  assert.equal(api.usageSyncResolveClient(), autoClient, "resolved client must be cached");
  assert.equal(await api.usageSyncResolveCodexRoot(autoClient), autoDir);

  // collector: directory walk + metadata + base64 read + decode + parse
  const autoCollect = await api.usageSyncCollectRowsViaAppServer(autoClient, { root: autoDir });
  assert.equal(autoCollect.scannedFiles, 1);
  assert.equal(autoCollect.parsedFiles, 1);
  assert.equal(autoCollect.readErrors.length, 0);
  assert.equal(autoCollect.rows.length, 1);
  const autoRow = autoCollect.rows[0];
  assert.equal(autoRow.turnId, "auto-turn-1");
  assert.equal(autoRow.sessionKey, "local:01auto-thread");
  assert.equal(autoRow.callCount, 1);
  assert.equal(autoRow.usage.total_tokens, 325);
  assert.equal(autoRow.durationMs, 90000);
  const autoStampKey = `sessions/2026/07/02/${autoFileName}`;
  const autoStamp = autoCollect.nextStamps[autoStampKey];
  assert.equal(autoStamp.lastModified, autoModifiedAt);
  assert.equal(autoStamp.size, Buffer.byteLength(autoRolloutText, "utf8"));

  // unchanged metadata is skipped without reading the rollout again
  const autoReadsBefore = autoRequests.filter((request) => request.method === "fs/readFile").length;
  const autoStamped = await api.usageSyncCollectRowsViaAppServer(autoClient, {
    root: autoDir,
    stamps: { [autoStampKey]: { lastModified: autoModifiedAt, size: Buffer.byteLength(autoRolloutText, "utf8") } },
  });
  assert.equal(autoStamped.skippedFiles, 1);
  assert.equal(autoStamped.rows.length, 0);
  assert.equal(autoRequests.filter((request) => request.method === "fs/readFile").length, autoReadsBefore, "stamped files must not be re-read");

  // full silent run: no directory handle, no picker, root auto-resolved through the app
  autoRequests.length = 0;
  const autoRun = await api.usageSyncRun({ client: autoClient, auto: true });
  assert.equal(autoRun.busy, false);
  assert.equal(autoRun.result.imported, 1);
  assert.equal(autoRun.result.files, 1);
  assert.ok(String(autoRun.status).startsWith("自动同步完成：写入 1 轮"), "auto status expected: " + autoRun.status);
  assert.ok(autoRequests.some((request) => request.method === "thread/list"), "auto run must resolve .codex through the app");
  assert.ok(autoRequests.some((request) => request.method === "fs/readFile"), "auto run must read rollouts through the app");
  const autoTurn = api.profileLedgerTurns().find((turn) => turn.turnId === "auto-turn-1");
  assert.ok(autoTurn, "auto-synced turn must reach the profile ledger");
  assert.equal(autoTurn.usage.total, 325);

  // rerunning stays idempotent (replace-source import, single ledger turn)
  const autoRerun = await api.usageSyncRun({ client: autoClient, auto: true });
  assert.equal(autoRerun.result.imported, 1);
  assert.equal(api.profileLedgerTurns().filter((turn) => turn.turnId === "auto-turn-1").length, 1);

  // analytics merge: ledger backfill reaches source turns, same turnId / same usage tuple never double counts
  const mergedBackfill = api.mergeProfileLedgerTurns([]);
  assert.ok(mergedBackfill.some((turn) => turn.turnId === "auto-turn-1"), "ledger backfill must reach analytics source turns");
  assert.ok(mergedBackfill.length >= 2, "ledger must contribute multiple turns");
  const mergedDedupe = api.mergeProfileLedgerTurns([
    { turnId: "auto-turn-1", threadKey: "local:01auto-thread", usage: { input: 300, cached: 50, output: 25, total: 325 } },
    { turnId: "kept-turn-1", threadKey: "local:kept-thread", usage: { input: 9, cached: 1, output: 6, total: 15 } },
  ]);
  assert.equal(mergedDedupe.filter((turn) => turn.turnId === "auto-turn-1").length, 1, "same turnId must not double count");
  assert.ok(mergedDedupe.some((turn) => turn.turnId === "kept-turn-1"), "non-duplicate base turns must be preserved");
  assert.ok(mergedDedupe.length > 2, "non-duplicate ledger turns must still append");
  const mergedKeyDedupe = api.mergeProfileLedgerTurns([
    { turnId: "synthetic-twin-1", threadKey: "local:synthetic", usage: { input: 300, cached: 50, output: 25, total: 325 } },
  ]);
  assert.equal(mergedKeyDedupe.some((turn) => turn.turnId === "auto-turn-1"), false, "same usage tuple must not double count");

  delete context.__codexPlusNativeHostClients;

  // --- 11. client discovery fallback: React fiber trees (host map unavailable) ---
  const fallbackClient = { hostId: "local", disposed: false, async sendRequest() {} };
  const fiberLeaf = {
    child: null,
    sibling: null,
    return: null,
    memoizedProps: null,
    memoizedState: { memoizedState: fallbackClient, next: null },
    dependencies: null,
  };
  const fiberRoot = { child: fiberLeaf, sibling: null, return: null, memoizedProps: null, memoizedState: null, dependencies: null };

  // host map wins over fiber discovery; channel is reported for diagnostics
  api.usageSyncResetClient();
  context.__codexPlusNativeHostClients = new Map([["local", { ref: { deref: () => autoClient } }]]);
  context.__codexRoot = { _internalRoot: { current: fiberRoot } };
  assert.equal(api.usageSyncResolveClient(), autoClient, "host map must take precedence over fiber discovery");
  assert.equal(api.usageSyncState().clientChannel, "host-map");
  delete context.__codexPlusNativeHostClients;

  // no host map: downward scan from the React root finds the client in hook state
  api.usageSyncResetClient();
  assert.equal(api.usageSyncResolveClient(), fallbackClient, "react root scan must find the app-server client");
  assert.equal(api.usageSyncState().clientChannel, "fiber-tree");
  assert.equal(api.usageSyncResolveClient(), fallbackClient, "fiber discovery result must be cached");

  // disposed clients are skipped; later hooks in the same component still resolve
  api.usageSyncResetClient();
  const disposedClient = { hostId: "local", disposed: true, async sendRequest() {} };
  const liveClient = { hostId: "local", disposed: false, async sendRequest() {} };
  const chainedLeaf = {
    child: null,
    sibling: null,
    return: null,
    memoizedProps: null,
    memoizedState: { memoizedState: disposedClient, next: { memoizedState: liveClient, next: null } },
    dependencies: null,
  };
  context.__codexRoot = { _internalRoot: { current: { child: chainedLeaf, sibling: null, return: null, memoizedProps: null, memoizedState: null, dependencies: null } } };
  assert.equal(api.usageSyncResolveClient(), liveClient, "disposed clients must be skipped");

  // DOM anchors are tried before the root scan (cheap ancestor walk)
  api.usageSyncResetClient();
  const anchorClient = { hostId: "local", disposed: false, async sendRequest() {} };
  const anchorNode = { __reactFiber$test: { memoizedProps: { value: anchorClient }, memoizedState: null, dependencies: null, return: null } };
  const originalQuerySelector = context.document.querySelector;
  context.document.querySelector = (selector) => (selector === "[data-codex-composer-root]" ? anchorNode : null);
  assert.equal(api.usageSyncResolveClient(), anchorClient, "DOM anchor ancestor walk must be used before the root scan");
  assert.equal(api.usageSyncState().clientChannel, "fiber-ancestor");
  context.document.querySelector = originalQuerySelector;

  // react container keys on DOM nodes are an independent root source
  api.usageSyncResetClient();
  context.__codexRoot = null;
  const containerRoot = { child: fiberLeaf, sibling: null, return: null, memoizedProps: null, memoizedState: null, dependencies: null };
  const containerNode = { __reactContainer$test: containerRoot };
  const originalQuerySelectorAll = context.document.querySelectorAll;
  context.document.querySelectorAll = (selector) => (String(selector).includes("#root") ? [containerNode] : []);
  assert.equal(api.usageSyncResolveClient(), fallbackClient, "react container keys must provide a root fallback");
  assert.equal(api.usageSyncState().clientChannel, "fiber-tree");
  context.document.querySelectorAll = originalQuerySelectorAll;
  context.__codexRoot = undefined;

  console.log("backfill + quota regression tests passed");
})().catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
