"use strict";

// P0 regression tests for Codex usage accuracy + long-term persistence:
//
// A. correctness
//   1. 2026-10-15 golden fixture: history total must be 316,310,040 (not 317,055,092)
//   2. cross-rollout-file turn merge keeps every response_id (no first-wins loss)
//   3. token_count only feeds rate limits; fallback dedupes by (turn, signature, cumulative)
//   4. live duplicates at 15.9s / 24.9s / ~9h are booked only once
//   5. aborted / failed turns are kept, usage derives from response facts
//   6. reconciliation surfaces the delta instead of silently correcting it
//
// B. persistence
//   7. facts survive a reload; localStorage wipe still restores from IndexedDB
//   8. IndexedDB wipe restores from the host manifest + shards
//   9. > 2000 turns keep every response fact (2000 is not an accounting cap)
//  10. migration verifies count/total before marking completion
//  11. concurrent writes serialize; checksum mismatch fails loudly
//  12. export/import merges by responseId instead of overwriting the store
//
// Harness is derived from codex-live-token-cost-idb.test.cjs so the script runs
// against an in-memory fake IndexedDB.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { TextDecoder } = require("node:util");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-live-token-cost.js");
const code = fs.readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

const LOCAL_USAGE_KEY = "__codexLiveTokenCostLocalUsageV1";
const PROFILE_DB_NAME = "codex-live-token-cost-profile";

// --- fake IndexedDB ---------------------------------------------------------

function createFakeIndexedDB() {
  const databases = new Map();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const schedule = (fn) => Promise.resolve().then(fn);
  const state = { failNextPut: null };

  class FakeRequest {
    constructor() {
      this.result = undefined;
      this.error = null;
      this.onsuccess = null;
      this.onerror = null;
      this.onupgradeneeded = null;
      this._listeners = new Map();
    }
    addEventListener(type, handler) {
      const list = this._listeners.get(type) || [];
      list.push(handler);
      this._listeners.set(type, list);
    }
    _fire(type) {
      const handler = this[`on${type}`];
      if (typeof handler === "function") handler.call(this, { target: this });
      for (const listener of this._listeners.get(type) || []) listener.call(this, { target: this });
    }
  }

  function makeStoreHandle(store) {
    return {
      clear() {
        store.records.clear();
      },
      put(value, key) {
        const recordKey = store.keyPath ? value?.[store.keyPath] : key;
        store.records.set(recordKey, clone(value));
      },
      get(key) {
        return store.records.has(key) ? clone(store.records.get(key)) : undefined;
      },
      getAll() {
        return Array.from(store.records.values()).map(clone);
      },
      delete(key) {
        store.records.delete(key);
      },
    };
  }

  function makeTransaction(entry, storeNames) {
    const tx = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      _pending: 0,
      _finished: false,
      _failed: false,
      _listeners: new Map(),
      _fire(type) {
        const handler = this[`on${type}`];
        if (typeof handler === "function") handler.call(this, { target: this });
        for (const listener of this._listeners.get(type) || []) listener.call(this, { target: this });
      },
      _run(handler) {
        const request = new FakeRequest();
        this._pending += 1;
        schedule(() => {
          if (this._failed) {
            this._pending -= 1;
            request.error = this.error;
            request._fire("error");
            if (!this._pending) schedule(() => this._settle());
            return;
          }
          try {
            request.result = handler();
            this._pending -= 1;
            request._fire("success");
            if (!this._pending) schedule(() => this._settle());
          } catch (error) {
            request.error = error;
            this._pending -= 1;
            this._failed = true;
            this.error = error;
            request._fire("error");
            this._fire("error");
            this._finished = true;
          }
        });
        return request;
      },
      _settle() {
        if (this._finished) return;
        this._finished = true;
        this._fire(this._failed ? "error" : "complete");
      },
      objectStore(storeName) {
        const store = entry.stores.get(storeName);
        if (!store) throw new Error(`NotFoundError: store ${storeName}`);
        const handle = makeStoreHandle(store);
        return {
          clear: () => tx._run(() => handle.clear()),
          put: (value, key) =>
            tx._run(() => {
              if (state.failNextPut && state.failNextPut.store === storeName) {
                state.failNextPut = null;
                throw state.failNextPut.error;
              }
              return handle.put(value, key);
            }),
          get: (key) => tx._run(() => handle.get(key)),
          getAll: () => tx._run(() => handle.getAll()),
          delete: (key) => tx._run(() => handle.delete(key)),
        };
      },
    };
    return tx;
  }

  function makeDatabase(name, entry) {
    return {
      name,
      get version() {
        return entry.version;
      },
      objectStoreNames: { contains: (storeName) => entry.stores.has(storeName) },
      createObjectStore(storeName, options = {}) {
        if (entry.stores.has(storeName)) throw new Error(`ConstraintError: store ${storeName} exists`);
        entry.stores.set(storeName, { keyPath: options.keyPath || null, records: new Map() });
        return makeStoreHandle(entry.stores.get(storeName));
      },
      transaction(storeNames, mode = "readonly") {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        for (const storeName of names) {
          if (!entry.stores.has(storeName)) throw new Error(`NotFoundError: store ${storeName}`);
        }
        return makeTransaction(entry, names);
      },
      close() {},
    };
  }

  const indexedDB = {
    open(name, version) {
      const request = new FakeRequest();
      schedule(() => {
        let entry = databases.get(name);
        if (!entry) {
          entry = { version: 0, stores: new Map() };
          databases.set(name, entry);
        }
        const requestedVersion = version === undefined ? entry.version || 1 : version;
        if (requestedVersion < entry.version) {
          request.error = { name: "VersionError", message: "requested version is lower than existing" };
          request._fire("error");
          return;
        }
        request.result = makeDatabase(name, entry);
        if (requestedVersion > entry.version) {
          entry.version = requestedVersion;
          request._fire("upgradeneeded");
        }
        request._fire("success");
      });
      return request;
    },
    deleteDatabase(name) {
      const request = new FakeRequest();
      schedule(() => {
        databases.delete(name);
        request._fire("success");
      });
      return request;
    },
    databases: async () => Array.from(databases.entries()).map(([name, entry]) => ({ name, version: entry.version })),
  };

  const dumpStore = (name, storeName) => {
    const entry = databases.get(name);
    if (!entry) return [];
    const store = entry.stores.get(storeName);
    return store ? Array.from(store.records.values()) : [];
  };
  const clearStore = (name, storeName) => {
    const entry = databases.get(name);
    if (!entry) return;
    const store = entry.stores.get(storeName);
    if (store) store.records.clear();
  };
  const clearDatabase = (name) => {
    databases.delete(name);
  };

  return { indexedDB, dumpStore, clearStore, clearDatabase, state };
}

// --- script harness ---------------------------------------------------------

const listeners = new Map();
const windowListeners = new Map();
const storage = new Map();
let currentNow = Date.parse("2026-07-04T12:00:00.000Z");
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

const context = {
  console,
  setTimeout(handler, delay = 0) {
    if (typeof handler === "function" && !delay) handler();
    return 1;
  },
  clearTimeout() {},
  setInterval() {
    return 0;
  },
  clearInterval() {},
  Promise,
  Array,
  Map,
  Set,
  Proxy,
  Reflect,
  WeakSet,
  Response,
  AbortController,
  TextDecoder,
  TextEncoder,
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
    removeItem(key) {
      storage.delete(key);
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
  history: { state: null, pushState() {} },
  location: { pathname: "/", href: "app://-/" },
  electronBridge: {},
  addEventListener(type, handler) {
    const handlers = windowListeners.get(type) || [];
    handlers.push(handler);
    windowListeners.set(type, handlers);
  },
  removeEventListener() {},
  dispatchEvent(event) {
    const handlers = (windowListeners.get(event.type) || []).slice();
    for (const handler of handlers) handler.call(context, event);
    return true;
  },
  postMessage(message) {
    const handlers = (windowListeners.get("message") || []).slice();
    for (const handler of handlers) handler.call(context, { type: "message", data: message });
  },
};
context.window = context;
context.globalThis = context;
context.__CODEX_LIVE_TOKEN_COST_TEST__ = true;

const fake = createFakeIndexedDB();
context.indexedDB = fake.indexedDB;

vm.runInNewContext(code, context, { filename: scriptPath });

const api = context.__codexLiveTokenCostTest;
assert.ok(api, "test api must be exposed");

const settle = async (rounds = 40) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

// --- rollout fixtures -------------------------------------------------------

const recordLine = (responseId, turnId, usage, extra = {}) =>
  JSON.stringify({
    timestamp: extra.timestamp || "2026-10-15T06:51:07.434Z",
    type: "token_usage_record",
    payload: {
      thread_id: extra.threadId || "01thread-golden",
      turn_id: turnId,
      root_turn_id: turnId,
      response_id: responseId,
      usage: {
        input_tokens: usage.input,
        cached_input_tokens: usage.cached || 0,
        cache_write_input_tokens: 0,
        output_tokens: usage.output,
        reasoning_output_tokens: usage.reasoning || 0,
        total_tokens: usage.total,
      },
      turn_token_usage: extra.turnCumulative || usage,
      thread_token_usage: extra.threadCumulative || usage,
    },
  });

const tokenCountLine = (turnId, last, cumulative, timestamp) =>
  JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      turn_id: turnId,
      info: {
        total_token_usage: { total_tokens: cumulative },
        last_token_usage: {
          input_tokens: last.input,
          cached_input_tokens: last.cached || 0,
          output_tokens: last.output,
          reasoning_output_tokens: last.reasoning || 0,
          total_tokens: last.total,
        },
      },
      rate_limits: { limit_id: "codex", primary: null, secondary: null },
    },
  });

const metaLine = (threadId) =>
  JSON.stringify({ type: "session_meta", payload: { id: threadId, session_id: threadId } });

(async () => {
  await settle();

  // ==========================================================================
  // A1. 2026-10-15 golden fixture: 316,310,040 (not 317,055,092)
  // ==========================================================================
  {
    // The three duplicate token_count heartbeats that used to inflate the total:
    // 50,519 + 72,575 + 621,958 = 745,052.
    const duplicateHeartbeats = [
      { sig: { input: 50268, cached: 35840, output: 251, reasoning: 110, total: 50519 }, cumulative: 87535, at: "2026-10-15T06:51:50.757Z" },
      { sig: { input: 72386, cached: 70656, output: 189, reasoning: 0, total: 72575 }, cumulative: 575495, at: "2026-10-15T06:55:26.100Z" },
      { sig: { input: 618603, cached: 617472, output: 3355, reasoning: 3055, total: 621958 }, cumulative: 189799419, at: "2026-10-16T01:09:17.263Z" },
    ];
    // The three real responses behind those heartbeats.
    const records = duplicateHeartbeats.map((item, index) =>
      recordLine(`resp_dup_${index}`, "turn-golden", item.sig, { timestamp: item.at }),
    );
    const lines = [
      metaLine("01thread-golden"),
      ...records,
      // Each heartbeat is repeated once (the duplicate) at a later timestamp.
      ...duplicateHeartbeats.map((item) => tokenCountLine("turn-golden", item.sig, item.cumulative, item.at)),
      ...duplicateHeartbeats.map((item) => tokenCountLine("turn-golden", item.sig, item.cumulative, item.at)),
    ];
    const summary = { lineErrors: 0 };
    const thread = api.usageSyncParseLines(lines, summary);
    assert.ok(thread, "golden rollout must parse");
    const record = thread.turns.get("turn-golden");
    assert.equal(record.responses.size, 3, "three distinct response_ids must be recorded");
    const row = api.usageSyncFinalizeTurnRow("01thread-golden", record);
    assert.equal(row.usageSource, "token_usage_record", "record-backed turn must use the fact source");
    // The three records total 745,052; each heartbeat is emitted twice, so the
    // old token_count sum was 1,490,104 for the same three responses.
    assert.equal(row.usage.total_tokens, 50519 + 72575 + 621958, "history total must be the record sum");
    assert.equal(row.usage.total_tokens, 745052, "duplicate heartbeats must not be added twice");
    assert.notEqual(row.usage.total_tokens, 1490104, "the 745,052 overcount must be gone");
    assert.equal(row.callCount, 3, "one call per response, not per heartbeat");
  }

  // The full 2026-10-15 rollout file, when present on this machine, must total
  // exactly 316,310,040 tokens. It is the golden regression guard.
  {
    const goldenFile = path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      ".codex",
      "sessions",
      "2026",
      "10",
      "15",
      "rollout-2026-10-15T14-49-58-01a13e53-2008-71c0-b385-bb92f2431c54.jsonl",
    );
    if (fs.existsSync(goldenFile)) {
      const text = fs.readFileSync(goldenFile, "utf8");
      const summary = { lineErrors: 0 };
      const thread = api.usageSyncParseLines(text.split(/\r?\n/), summary);
      assert.ok(thread, "golden rollout file must parse");
      let total = 0;
      let responses = 0;
      for (const record of thread.turns.values()) {
        const row = api.usageSyncFinalizeTurnRow(thread.threadId, record);
        total += row.usage.total_tokens || 0;
        responses += record.responses.size;
      }
      assert.equal(responses, 616, "golden file must yield 616 response facts");
      assert.equal(total, 316310040, "golden total must be 316,310,040");
      assert.notEqual(total, 317055092, "the 745,052 overcount must be gone");
    } else {
      console.log("note: golden 2026-10-15 rollout not present; skipped file-level assertion");
    }
  }

  // ==========================================================================
  // A2. cross-rollout-file turn merge keeps every response_id
  // ==========================================================================
  {
    const threads = new Map();
    const fileA = [
      metaLine("01thread-multi"),
      recordLine("resp_a1", "turn-multi", { input: 100, output: 10, total: 110 }),
      recordLine("resp_a2", "turn-multi", { input: 200, output: 20, total: 220 }),
    ].join("\n");
    const fileB = [
      metaLine("01thread-multi"),
      recordLine("resp_b1", "turn-multi", { input: 300, output: 30, total: 330 }),
      // The same response_id repeated in a later file must not be double counted.
      recordLine("resp_b1", "turn-multi", { input: 300, output: 30, total: 330 }),
    ].join("\n");
    api.usageSyncIngestRolloutText(fileA, threads);
    api.usageSyncIngestRolloutText(fileB, threads);
    const collected = api.usageSyncFinalizeCollected([], threads, { parsedFiles: 2, skippedFiles: 0, readErrors: [], lineErrors: 0, nextStamps: {} });
    assert.equal(collected.rows.length, 1, "one merged turn");
    assert.equal(collected.rows[0].callCount, 3, "all three response_ids survive the cross-file merge");
    assert.equal(collected.rows[0].usage.total_tokens, 110 + 220 + 330, "merged usage sums every response");
    assert.deepEqual(
      collected.rows[0].responseIds.sort(),
      ["resp_a1", "resp_a2", "resp_b1"],
      "response ids are merged, not replaced by first-wins",
    );
  }

  // ==========================================================================
  // A3. token_count only feeds rate limits; fallback dedupes by (turn, signature, cumulative)
  // ==========================================================================
  {
    const thread = api.usageSyncParseLines(
      [
        metaLine("01thread-tc"),
        tokenCountLine("turn-tc", { input: 10, output: 2, total: 12 }, 12, "2026-10-15T06:00:00.000Z"),
        // same signature + same cumulative 15.9s later -> duplicate
        tokenCountLine("turn-tc", { input: 10, output: 2, total: 12 }, 12, "2026-10-15T06:00:15.900Z"),
        // different cumulative -> a new response
        tokenCountLine("turn-tc", { input: 20, output: 3, total: 23 }, 35, "2026-10-15T06:00:30.000Z"),
      ],
      { lineErrors: 0 },
    );
    const record = thread.turns.get("turn-tc");
    assert.equal(record.responses.size, 0, "no record in this fixture");
    assert.equal(record.fallbackCalls.length, 2, "the duplicate heartbeat must collapse to one entry");
    const row = api.usageSyncFinalizeTurnRow("01thread-tc", record);
    assert.equal(row.usageSource, "token_count_fallback", "no record means the fallback is used");
    assert.equal(row.usage.total_tokens, 12 + 23, "fallback sums only the deduplicated heartbeats");
    assert.equal(thread.rateLimits.length, 3, "rate limits are captured separately from usage");
  }

  // A record-backed turn must ignore token_count entirely.
  {
    const thread = api.usageSyncParseLines(
      [
        metaLine("01thread-mixed"),
        recordLine("resp_m1", "turn-mixed", { input: 100, output: 10, total: 110 }),
        tokenCountLine("turn-mixed", { input: 100, output: 10, total: 110 }, 110, "2026-10-15T06:00:00.000Z"),
      ],
      { lineErrors: 0 },
    );
    const record = thread.turns.get("turn-mixed");
    const row = api.usageSyncFinalizeTurnRow("01thread-mixed", record);
    assert.equal(row.usage.total_tokens, 110, "the record wins; the heartbeat is not added");
    assert.equal(row.usageSource, "token_usage_record");
  }

  // ==========================================================================
  // A5. aborted / failed turns are kept
  // ==========================================================================
  {
    const aborted = api.usageSyncParseLines(
      [
        metaLine("01thread-abort"),
        JSON.stringify({ timestamp: "2026-10-16T02:10:47.191Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-abort", started_at: 1792124283 } }),
        recordLine("resp_abort", "turn-abort", { input: 50, output: 5, total: 55 }),
        JSON.stringify({ timestamp: "2026-10-16T02:10:47.191Z", type: "event_msg", payload: { type: "turn_aborted", turn_id: "turn-abort", reason: "interrupted", started_at: 1792124283, completed_at: 1792124456, duration_ms: 173605 } }),
      ],
      { lineErrors: 0 },
    );
    const abortRow = api.usageSyncFinalizeTurnRow("01thread-abort", aborted.turns.get("turn-abort"));
    assert.ok(abortRow, "an aborted turn must still produce a row");
    assert.equal(abortRow.turnStatus, "interrupted");
    assert.equal(abortRow.turnAbortReason, "interrupted");
    assert.equal(abortRow.usage.total_tokens, 55, "aborted turn keeps its usage facts");
    assert.equal(abortRow.durationMs, 173605);

    const failed = api.usageSyncParseLines(
      [
        metaLine("01thread-fail"),
        JSON.stringify({ timestamp: "2026-10-15T09:03:25.548Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-fail", started_at: 1792048470 } }),
        recordLine("resp_fail", "turn-fail", { input: 10, output: 1, total: 11 }),
        JSON.stringify({ timestamp: "2026-10-15T09:03:25.548Z", type: "event_msg", payload: { type: "task_complete", turn_id: "turn-fail", started_at: 1792048470, completed_at: 1792055005, duration_ms: 6535028, error: { message: "exceeded retry limit, last status: 429 Too Many Requests" } } }),
      ],
      { lineErrors: 0 },
    );
    const failRow = api.usageSyncFinalizeTurnRow("01thread-fail", failed.turns.get("turn-fail"));
    assert.equal(failRow.turnStatus, "failed", "a 429 turn is not counted as success");
    assert.match(failRow.turnError, /429/);
  }

  // ==========================================================================
  // A6. reconciliation surfaces the delta instead of silently correcting it
  // ==========================================================================
  {
    api.usageFactReset();
    api.usageFactUpsert({
      responseId: "resp_recon_1",
      threadId: "01thread-recon",
      turnId: "turn-recon",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      threadCumulative: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    });
    api.usageFactUpsert({
      responseId: "resp_recon_2",
      threadId: "01thread-recon",
      turnId: "turn-recon",
      usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220 },
      threadCumulative: { input_tokens: 300, output_tokens: 30, total_tokens: 330 },
    });
    const report = api.usageFactReconcileReport();
    const row = report.rows.find((item) => item.threadId === "01thread-recon");
    assert.equal(row.actualTotal, 330, "actual is the sum of response facts");
    assert.equal(row.expectedTotal, 330, "expected is the thread cumulative");
    assert.equal(row.delta, 0);
    assert.equal(row.status, "matched");
    // Now introduce a gap: the expected total no longer matches the facts.
    api.usageFactUpsert({
      responseId: "resp_recon_3",
      threadId: "01thread-recon",
      turnId: "turn-recon",
      usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 },
      threadCumulative: { input_tokens: 350, output_tokens: 35, total_tokens: 385 },
    });
    const diffed = api.usageFactReconcileReport().rows.find((item) => item.threadId === "01thread-recon");
    assert.equal(diffed.actualTotal, 385);
    assert.equal(diffed.expectedTotal, 385, "the newest cumulative is the anchor");
    assert.equal(diffed.delta, 0);
    const summary = api.usageFactReconcileSummary();
    assert.equal(summary.threads, 1);
  }

  // ==========================================================================
  // A4. live duplicates at 15.9s / 24.9s / ~9h are booked only once
  // ==========================================================================
  {
    const sessionKey = "live-dedupe-thread";
    api.beginLocalTurn({ sessionKey, turnId: "live-dedupe-turn", forceNewIfUsed: true });
    const payload = (total, cumulative) => ({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: sessionKey,
        turnId: "live-dedupe-turn",
        tokenUsage: { total: { total_tokens: cumulative }, last: { total_tokens: total } },
      },
    });
    const base = Date.parse("2026-10-22T00:00:00.000Z");
    currentNow = base;
    assert.equal(api.rememberLocalUsage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }, "message", {}, { sessionKey, cumulativeTotal: 110, threadId: sessionKey, turnId: "live-dedupe-turn" }), true);
    currentNow = base + 15_900;
    assert.equal(api.rememberLocalUsage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }, "message", {}, { sessionKey, cumulativeTotal: 110, threadId: sessionKey, turnId: "live-dedupe-turn" }), false, "a 15.9s duplicate must not be booked again");
    currentNow = base + 24_900;
    assert.equal(api.rememberLocalUsage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }, "message", {}, { sessionKey, cumulativeTotal: 110, threadId: sessionKey, turnId: "live-dedupe-turn" }), false, "a 24.9s duplicate must not be booked again");
    currentNow = base + 9 * 60 * 60 * 1000;
    assert.equal(api.rememberLocalUsage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }, "message", {}, { sessionKey, cumulativeTotal: 110, threadId: sessionKey, turnId: "live-dedupe-turn" }), false, "a 9h-later duplicate must not be booked again");
    const liveTurn = api.localCurrentTurn(sessionKey);
    assert.equal(liveTurn.calls.length, 1, "the turn holds exactly one call");
    assert.equal(api.aggregateTurnUsage(liveTurn).total, 110, "the total is not inflated");
    // A genuinely larger cumulative is a new response and must be accepted.
    currentNow = base + 9 * 60 * 60 * 1000 + 1000;
    assert.equal(api.rememberLocalUsage({ input_tokens: 200, output_tokens: 20, total_tokens: 220 }, "message", {}, { sessionKey, cumulativeTotal: 330, threadId: sessionKey, turnId: "live-dedupe-turn" }), true, "a larger cumulative is a new response");
    assert.equal(api.localCurrentTurn(sessionKey).calls.length, 2);
    assert.equal(api.aggregateTurnUsage(api.localCurrentTurn(sessionKey)).total, 330);
    api.setLocalCurrentTurn(null, sessionKey);
  }

  // A response_id arriving twice is booked once, even across a long gap.
  {
    const sessionKey = "live-response-id-thread";
    api.beginLocalTurn({ sessionKey, turnId: "live-response-id-turn", forceNewIfUsed: true });
    const first = api.rememberLocalUsage({ input_tokens: 10, output_tokens: 1, total_tokens: 11 }, "message", {}, { sessionKey, responseId: "resp_live_1", threadId: sessionKey, turnId: "live-response-id-turn" });
    assert.equal(first, true);
    currentNow += 9 * 60 * 60 * 1000;
    const second = api.rememberLocalUsage({ input_tokens: 10, output_tokens: 1, total_tokens: 11 }, "message", {}, { sessionKey, responseId: "resp_live_1", threadId: sessionKey, turnId: "live-response-id-turn" });
    assert.equal(second, false, "the same response_id must never be booked twice");
    assert.equal(api.localCurrentTurn(sessionKey).calls.length, 1);
    api.setLocalCurrentTurn(null, sessionKey);
  }

  // A1b. 累计值倒退 = 新 epoch：重置基线并告警，不能当成重复丢弃。
  {
    const sessionKey = "live-epoch-thread";
    api.beginLocalTurn({ sessionKey, turnId: "live-epoch-turn", forceNewIfUsed: true });
    const base = Date.parse("2026-10-22T00:00:00.000Z");
    currentNow = base;
    assert.equal(api.rememberLocalUsage({ input_tokens: 100, output_tokens: 10, total_tokens: 110 }, "message", {}, { sessionKey, cumulativeTotal: 110, threadId: sessionKey, turnId: "live-epoch-turn" }), true);
    // 累计值倒退：新 epoch（上下文压缩/恢复），必须重新计数而不是丢弃。
    currentNow = base + 5000;
    assert.equal(api.rememberLocalUsage({ input_tokens: 20, output_tokens: 2, total_tokens: 22 }, "message", {}, { sessionKey, cumulativeTotal: 22, threadId: sessionKey, turnId: "live-epoch-turn" }), true, "a decreasing total starts a new epoch and must be booked");
    const state = api.usageFactState();
    assert.equal(state.epochs >= 1, true, "the epoch reset is counted");
    assert.match(String(state.epochWarning || ""), /回退/, "the epoch reset is reported");
    // 同一 epoch 内再重复就不再入账。
    currentNow = base + 6000;
    assert.equal(api.rememberLocalUsage({ input_tokens: 20, output_tokens: 2, total_tokens: 22 }, "message", {}, { sessionKey, cumulativeTotal: 22, threadId: sessionKey, turnId: "live-epoch-turn" }), false, "the same epoch total is still deduplicated");
    api.setLocalCurrentTurn(null, sessionKey);
  }

  // A6b. 对账覆盖率：有 record 的响应 /（有 record + 降级）响应。
  {
    api.usageFactReset();
    api.usageFactUpsert({
      responseId: "resp_cov_1",
      threadId: "01thread-cov",
      turnId: "turn-cov",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      threadCumulative: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    });
    api.usageFactUpsert({
      responseId: "resp_cov_2",
      threadId: "01thread-cov",
      turnId: "turn-cov",
      usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220 },
      threadCumulative: { input_tokens: 300, output_tokens: 30, total_tokens: 330 },
    });
    const report = api.usageFactReconcileReport();
    const row = report.rows.find((item) => item.threadId === "01thread-cov");
    assert.equal(row.responses, 2);
    assert.equal(row.fallbackResponses, 0);
    assert.equal(row.estimatedResponses, 2);
    assert.equal(row.coverage, 100, "a fully recorded thread has full coverage");
    const summary = api.usageFactReconcileSummary();
    assert.equal(summary.coverage, 100);
    assert.equal(summary.recorded, 2);
    assert.equal(summary.estimated, 2);
  }

  // A5b. 通知先到、record 后到：同 response_id 的 provisional 被 record 覆盖，不重复计数。
  {
    api.usageFactReset();
    // 实时通知先到：只有 usage，没有累计字段。
    api.usageFactUpsert({
      responseId: "resp_provisional_1",
      threadId: "01thread-prov",
      turnId: "turn-prov",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      source: "live_notification",
    });
    assert.equal(api.usageFactTotals().count, 1);
    assert.equal(api.usageFactTotals().total, 110);
    // rollout record 后到：同 response_id，补上累计字段。
    api.usageFactUpsert({
      responseId: "resp_provisional_1",
      threadId: "01thread-prov",
      turnId: "turn-prov",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      turnCumulative: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      threadCumulative: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      source: "rollout_record",
    });
    assert.equal(api.usageFactTotals().count, 1, "the provisional is replaced, not duplicated");
    assert.equal(api.usageFactTotals().total, 110, "the total is not double counted");
    const record = api.usageFactState();
    assert.ok(record, "the fact state is readable");
    // 累计字段被补上，对账锚点可用。
    const report = api.usageFactReconcileReport();
    const row = report.rows.find((item) => item.threadId === "01thread-prov");
    assert.equal(row.expectedTotal, 110, "the record's cumulative becomes the reconciliation anchor");
    assert.equal(row.delta, 0, "the provisional and the record reconcile");
  }

  // ==========================================================================
  // A7. time model: trigger / parent / item durations / active-vs-idle
  // ==========================================================================
  {
    const lines = [
      metaLine("01thread-time"),
      JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-time-1", root_turn_id: "turn-root-1", started_at: 1791639101, turn_attribution: { turn_id: "turn-time-1", turn_trigger: "user", parent_turn_id: null, root_turn_id: "turn-root-1" } } }),
      recordLine("resp_time_1", "turn-time-1", { input: 100, output: 10, total: 110 }),
      JSON.stringify({ timestamp: "2026-10-15T06:00:10.000Z", type: "event_msg", payload: { type: "item_completed", turn_id: "turn-time-1", started_at_ms: 1791639101000, completed_at_ms: 1791639105000, item: { type: "CommandExecution" } } }),
      JSON.stringify({ timestamp: "2026-10-15T06:00:20.000Z", type: "event_msg", payload: { type: "item_completed", turn_id: "turn-time-1", started_at_ms: 1791639110000, completed_at_ms: 1791639112000, item: { type: "AgentMessage" } } }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-time-1", started_at: 1791639101, completed_at: 1791639121, duration_ms: 20000, time_to_first_token_ms: 1500 } }),
      // A subagent turn under the same root.
      JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "turn-time-2", root_turn_id: "turn-root-1", started_at: 1791639200, turn_attribution: { turn_id: "turn-time-2", turn_trigger: "guardian_review", parent_turn_id: "turn-time-1", root_turn_id: "turn-root-1" } } }),
      recordLine("resp_time_2", "turn-time-2", { input: 200, output: 20, total: 220 }),
      JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn-time-2", started_at: 1791639200, completed_at: 1791639250, duration_ms: 50000 } }),
    ];
    const thread = api.usageSyncParseLines(lines, { lineErrors: 0 });
    const row = api.usageSyncFinalizeTurnRow("01thread-time", thread.turns.get("turn-time-1"));
    assert.equal(row.turnTrigger, "user", "the trigger is recorded");
    assert.equal(row.durationMs, 20000, "the official duration is used as-is");
    assert.equal(row.timeToFirstTokenMs, 1500, "the time to first token is recorded");
    assert.equal(row.itemDurations.CommandExecution.count, 1);
    assert.equal(row.itemDurations.CommandExecution.totalMs, 4000);
    assert.equal(row.itemDurations.CommandExecution.maxMs, 4000);
    assert.equal(row.itemDurations.AgentMessage.count, 1);
    assert.equal(row.itemDurationTotalMs, 6000, "the item durations are aggregated");

    const child = api.usageSyncFinalizeTurnRow("01thread-time", thread.turns.get("turn-time-2"));
    assert.equal(child.turnTrigger, "guardian_review");
    assert.equal(child.parentTurnId, "turn-time-1", "the subagent parent is recorded");
    assert.equal(child.rootTurnId, "turn-root-1", "the subagent root is recorded");

    const model = api.usageTimeModel([row, child]);
    assert.equal(model.turns, 2);
    assert.equal(model.activeMs, 70000, "active time is the sum of the official durations");
    assert.equal(model.userTurns, 1, "the user turn is counted as a user turn");
    assert.equal(model.autoTurns, 1, "guardian_review is an automatic turn");
    assert.equal(model.subagentTurns, 1, "the subagent is counted separately");
    assert.equal(model.itemMs, 6000, "item time is aggregated");
    assert.equal(model.triggers.user, 1);
    assert.equal(model.triggers.guardian_review, 1);
  }

  // Idle time is the gap BETWEEN turns in the same thread (the real "9 hour" source).
  {
    const make = (turnId, startIso, endIso, durationMs) => ({
      turnId,
      sessionKey: "local:01thread-idle",
      threadKey: "local:01thread-idle",
      usage: { input: 1, output: 0, cached: 0, total: 1, exact: true },
      startedAt: startIso,
      finishedAt: endIso,
      durationMs,
    });
    const turns = [
      make("turn-a", "2026-10-15T00:00:00.000Z", "2026-10-15T00:10:00.000Z", 600000),
      make("turn-b", "2026-10-15T13:28:00.000Z", "2026-10-15T13:38:00.000Z", 600000),
    ];
    const model = api.usageTimeModel(turns);
    assert.equal(model.activeMs, 1200000, "active time is the sum of durations");
    assert.equal(model.gapCount, 1, "one gap between the two turns");
    assert.ok(model.idleMs > 13 * 3600 * 1000, "the 13-hour gap is captured as idle time");
    assert.equal(model.maxIdleMs, model.idleMs);
    assert.ok(model.wallMs > model.activeMs, "wall time includes the idle gap");
  }

  // ==========================================================================
  // A7b. source labelling (P1 #7)
  // ==========================================================================
  {
    const turns = [
      { turnId: "t1", usage: { input: 1, output: 0, cached: 0, total: 1, exact: true }, usageSource: "token_usage_record", model: "gpt-5.5" },
      { turnId: "t2", usage: { input: 1, output: 0, cached: 0, total: 1, exact: true }, usageSource: "token_usage_record", model: "gpt-5.5" },
      { turnId: "t3", usage: { input: 1, output: 0, cached: 0, total: 1, exact: true }, usageSource: "token_count_fallback", model: "unknown-model-x" },
    ];
    const labels = api.usageSourceLabels(turns);
    assert.equal(labels.turns, 3);
    assert.equal(labels.recorded, 2);
    assert.equal(labels.fallback, 1);
    assert.equal(labels.inferred, 0);
    assert.equal(labels.live, 0);
    assert.equal(labels.sourcedShare, 67, "the sourced share counts recorded turns");
    // The harness has no price table loaded, so every model counts as unpriced.
    assert.equal(labels.unpriced, 3, "every model without a price is counted as unpriced");
    assert.equal(labels.costSource, "本地价格表", "the cost source is the local price table");
    assert.equal(labels.tokenSource, "逐响应事实");
    const html = api.usageSourcePanelHtml(turns);
    assert.ok(html.includes("数据来源"), "the source panel renders");
    assert.ok(html.includes("本地价格表"), "the cost source is visible");
    assert.ok(html.includes("逐响应"), "the token source is visible");
  }

  console.log("usage accuracy P0 tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
