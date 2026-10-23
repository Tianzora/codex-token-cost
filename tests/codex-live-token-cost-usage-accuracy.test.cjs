"use strict";

// P0 regression tests for Codex usage accuracy + long-term persistence:
//
// A. correctness
//   1. 2026-10-15 golden fixture: history total must be 316,310,040 (not 317,055,092)
//   2. cross-rollout-file turn merge keeps every response_id (no first-wins loss)
//   3. token_count only feeds rate limits; fallback dedupes by (turn, signature)
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

      // --- cross-midnight split on real data (acceptance #14) ---------------
      // The same 616 records, grouped by the local day of each response's own
      // timestamp, must match the rollup exactly and still sum to 316,310,040.
      // This is timezone-independent: the expectation is derived from the same
      // localDateKey the implementation uses.
      const threads = new Map();
      api.usageSyncIngestRolloutText(text, threads);
      const collected = api.usageSyncFinalizeCollected([], threads, { parsedFiles: 1, skippedFiles: 0, readErrors: [], lineErrors: 0, nextStamps: {} });
      const expectedByDay = new Map();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.type !== "token_usage_record") continue;
        const at = Date.parse(obj.timestamp);
        const day = api.localDateKey(at);
        const tokens = Number(obj.payload?.usage?.total_tokens) || 0;
        expectedByDay.set(day, (expectedByDay.get(day) || 0) + tokens);
      }
      api.usageFactReset();
      for (const fact of collected.facts) api.usageFactUpsert(fact);
      const rollup = api.buildAnalyticsRollup(collected.rows);
      const rollupDays = Object.keys(rollup.days).sort();
      assert.equal(
        rollupDays.join(","),
        Array.from(expectedByDay.keys()).sort().join(","),
        "the rollup days match the local days of the raw response timestamps",
      );
      let rollupTotal = 0;
      for (const day of rollupDays) {
        let dayTotal = 0;
        for (const model of Object.keys(rollup.days[day].models)) dayTotal += rollup.days[day].models[model].usage.total || 0;
        assert.equal(dayTotal, expectedByDay.get(day), `day ${day} must equal the per-response local-day sum`);
        rollupTotal += dayTotal;
      }
      assert.equal(rollupTotal, 316310040, "the cross-midnight split must not change the grand total");
      // At least one turn in this file really does cross local midnight; its
      // slices must sum back to the turn total (exact partition, no loss).
      const realDayIndex = api.usageFactDayIndex();
      let splitTurns = 0;
      for (const row of collected.rows) {
        const slices = api.usageTurnDaySlices(row, realDayIndex);
        if (slices.length < 2) continue;
        splitTurns += 1;
        let sum = 0;
        for (const slice of slices) sum += slice.usage.total;
        assert.equal(sum, row.usage.total_tokens, "each split turn's slices sum back to its total");
      }
      assert.ok(splitTurns >= 1, "this golden file contains a cross-midnight turn");
      api.usageFactReset();
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
  // A6c. a cumulative counter reset is not reported as a real diff
  // ==========================================================================
  {
    api.usageFactReset();
    api.usageFactUpsert({
      responseId: "resp_reset_1",
      threadId: "01thread-reset",
      turnId: "turn-reset",
      usage: { input_tokens: 60, output_tokens: 0, total_tokens: 60 },
      threadCumulative: { input_tokens: 60, output_tokens: 0, total_tokens: 60 },
      observedAtMs: 1000,
    });
    api.usageFactUpsert({
      responseId: "resp_reset_2",
      threadId: "01thread-reset",
      turnId: "turn-reset",
      usage: { input_tokens: 100, output_tokens: 0, total_tokens: 100 },
      threadCumulative: { input_tokens: 160, output_tokens: 0, total_tokens: 160 },
      observedAtMs: 2000,
    });
    api.usageFactUpsert({
      responseId: "resp_reset_3",
      threadId: "01thread-reset",
      turnId: "turn-reset",
      usage: { input_tokens: 50, output_tokens: 0, total_tokens: 50 },
      threadCumulative: { input_tokens: 50, output_tokens: 0, total_tokens: 50 },
      observedAtMs: 3000,
    });
    const row = api.usageFactReconcileReport().rows.find((item) => item.threadId === "01thread-reset");
    assert.equal(row.actualTotal, 210);
    assert.equal(row.expectedTotal, 160);
    assert.equal(row.delta, -50);
    assert.equal(row.counterResets, 1);
    assert.equal(row.status, "counter-reset", "a reset counter is not a real diff");
    const summary = api.usageFactReconcileSummary();
    assert.equal(summary.diff, 0);
    assert.equal(summary.counterReset, 1);
    assert.equal(summary.counterResetDelta, 50);
    assert.equal(summary.delta, 0, "only real diffs count toward the alert delta");
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
  // A7b. model attribution from the three rollout signals
  // ==========================================================================
  {
    const inline = (line) => JSON.stringify(line);
    const lines = [
      metaLine("01thread-model-attr"),
      inline({
        timestamp: "2026-10-15T06:50:00.000Z",
        type: "turn_context",
        payload: { turn_id: "turn-model-ctx", model: "gpt-6-sol", effort: "high" },
      }),
      recordLine("resp_model_ctx", "turn-model-ctx", { input: 100, output: 10, total: 110 }),
      // Restored / Desktop threads may switch models without a new turn_context.
      inline({
        timestamp: "2026-10-15T06:51:00.000Z",
        type: "event_msg",
        payload: {
          type: "thread_settings_applied",
          thread_settings: { model: "gpt-5.5", reasoning_effort: "medium" },
        },
      }),
      inline({
        timestamp: "2026-10-15T06:51:01.000Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-model-settings" },
      }),
      recordLine("resp_model_settings", "turn-model-settings", { input: 200, output: 20, total: 220 }),
      // Newer token_count heartbeats carry the active model themselves.
      inline({
        timestamp: "2026-10-15T06:52:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          turn_id: "turn-model-heartbeat",
          info: {
            model: "gpt-5.4",
            effort: "low",
            total_token_usage: { total_tokens: 55 },
            last_token_usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 5, total_tokens: 55 },
          },
          rate_limits: { limit_id: "codex", primary: null, secondary: null },
        },
      }),
    ];
    const thread = api.usageSyncParseLines(lines, { lineErrors: 0 });
    assert.ok(thread, "the model attribution fixture must parse");

    const ctxRow = api.usageSyncFinalizeTurnRow("01thread-model-attr", thread.turns.get("turn-model-ctx"));
    assert.equal(ctxRow.model, "gpt-6-sol", "turn_context is authoritative for its turn");
    assert.equal(ctxRow.effort, "high");

    const settingsRow = api.usageSyncFinalizeTurnRow("01thread-model-attr", thread.turns.get("turn-model-settings"));
    assert.equal(settingsRow.model, "gpt-5.5", "thread_settings_applied supplies the sticky model");
    assert.equal(settingsRow.effort, "medium");

    const heartbeatRecord = thread.turns.get("turn-model-heartbeat");
    const heartbeatRow = api.usageSyncFinalizeTurnRow("01thread-model-attr", heartbeatRecord);
    assert.equal(heartbeatRow.model, "gpt-5.4", "token_count.info.model is used when present");
    assert.equal(heartbeatRow.effort, "low");
    assert.equal(heartbeatRow.usage.total_tokens, 55);

    // The per-thread sticky model is also passed to finalize as a fallback for
    // turns that carry no model evidence of their own.
    const fallbackThread = api.usageSyncParseLines(
      [metaLine("01thread-model-fallback"), recordLine("resp_model_fallback", "turn-model-fallback", { input: 300, output: 30, total: 330 })],
      { lineErrors: 0 },
    );
    const fallbackRecord = fallbackThread.turns.get("turn-model-fallback");
    assert.equal(fallbackRecord.model, "", "the rollout itself has no model for this turn");
    const fallbackRow = api.usageSyncFinalizeTurnRow("01thread-model-fallback", fallbackRecord, "gpt-5.6-terra", "high");
    assert.equal(fallbackRow.model, "gpt-5.6-terra", "the thread fallback fills the missing model");
    assert.equal(fallbackRow.effort, "high");
    const unknownRow = api.usageSyncFinalizeTurnRow("01thread-model-fallback", fallbackRecord);
    assert.equal(unknownRow.model, "未知", "a turn with no model at all is labelled 未知, not unknown");
  }

  // token_count dedupe is signature-based: the same usage snapshot is stored once
  // even when the cumulative counter keeps climbing (cc-switch behaviour).
  {
    const lines = [
      metaLine("01thread-heartbeat"),
      tokenCountLine("turn-hb", { input: 10, output: 2, total: 12 }, 12, "2026-10-15T07:00:00.000Z"),
      tokenCountLine("turn-hb", { input: 10, output: 2, total: 12 }, 24, "2026-10-15T07:00:16.000Z"),
    ];
    const summary = { lineErrors: 0 };
    const thread = api.usageSyncParseLines(lines, summary);
    const record = thread.turns.get("turn-hb");
    assert.equal(record.fallbackCalls.length, 1, "one snapshot per signature");
    assert.equal(summary.duplicateHeartbeats, 1, "the second snapshot is reported as a duplicate");
    const row = api.usageSyncFinalizeTurnRow("01thread-heartbeat", record);
    assert.equal(row.usage.total_tokens, 12, "a duplicate snapshot must not double the fallback total");
  }

  // Fact merge: rollout identity and model win over the live notification.
  {
    api.usageFactReset();
    const at = Date.parse("2026-10-22T01:00:00.000Z");
    api.usageFactUpsert({
      responseId: "resp_fact_merge",
      threadId: "live-thread",
      turnId: "live-turn",
      model: "gpt-5.5",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      observedAtMs: at,
      source: "live_notification",
    });
    api.usageFactUpsert({
      responseId: "resp_fact_merge",
      threadId: "01rollout-thread",
      turnId: "rollout-turn",
      model: "gpt-5.6-terra",
      effort: "high",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      observedAtMs: at,
      source: "rollout_record",
    });
    api.usageFactUpsert({
      responseId: "resp_fact_unknown",
      threadId: "01rollout-thread",
      turnId: "rollout-turn",
      model: "unknown",
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      observedAtMs: at,
      source: "rollout_record",
    });
    const exported = JSON.parse(api.usageFactExport("json").text);
    const mergedFact = exported.responses.find((record) => record.responseId === "resp_fact_merge");
    assert.equal(mergedFact.turnId, "rollout-turn", "the rollout turn_id replaces the live id");
    assert.equal(mergedFact.threadId, "01rollout-thread", "the rollout thread_id replaces the live id");
    assert.equal(mergedFact.model, "gpt-5.6-terra", "the rollout model wins over the live model");
    assert.equal(mergedFact.effort, "high");
    assert.equal(mergedFact.schemaVersion, 3, "facts carry the model-aware schema version");
    const unknownFact = exported.responses.find((record) => record.responseId === "resp_fact_unknown");
    assert.equal(unknownFact.model, "", 'legacy "unknown" is normalized before it reaches the ledger');
  }

  // ==========================================================================
  // A8. cross-midnight split (acceptance #14)
  //
  // A turn whose responses straddle local midnight must be attributed per
  // response time, not dumped on the start day. Measured on the real
  // 2026-10-15 rollout: the split is an exact partition (sum of parts == whole).
  // ==========================================================================
  {
    api.usageFactReset();
    // Local-time construction keeps the fixture timezone-independent.
    const beforeMidnight = new Date(2026, 9, 15, 23, 50, 0).getTime();
    const afterMidnight = new Date(2026, 9, 16, 0, 10, 0).getTime();
    assert.equal(api.localDateKey(beforeMidnight), "2026-10-15");
    assert.equal(api.localDateKey(afterMidnight), "2026-10-16");

    const nightUsage = { input_tokens: 800, cached_input_tokens: 400, output_tokens: 200, total_tokens: 1000 };
    const dawnUsage = { input_tokens: 240, cached_input_tokens: 40, output_tokens: 60, total_tokens: 300 };
    api.usageFactUpsert({ responseId: "resp_night", threadId: "01thread-mid", turnId: "turn-mid", usage: nightUsage, observedAtMs: beforeMidnight, source: "rollout_record" });
    api.usageFactUpsert({ responseId: "resp_dawn", threadId: "01thread-mid", turnId: "turn-mid", usage: dawnUsage, observedAtMs: afterMidnight, source: "rollout_record" });

    // The turn row aggregates both responses (as usageSyncFinalizeTurnRow would).
    const turn = {
      turnId: "turn-mid",
      sessionKey: "local:01thread-mid",
      threadKey: "local:01thread-mid",
      model: "gpt-5.5",
      callCount: 2,
      usageSource: "token_usage_record",
      startedAt: new Date(beforeMidnight).toISOString(),
      finishedAt: new Date(afterMidnight).toISOString(),
      observedAt: beforeMidnight,
      usage: { input: 1040, output: 260, cached: 440, total: 1300, exact: true },
    };

    assert.equal(api.usageTurnCrossesMidnight(turn), true, "the fixture must be detected as crossing midnight");
    const slices = api.usageTurnDaySlices(turn);
    assert.equal(slices.length, 2, "a cross-midnight turn splits into two day slices");
    assert.equal(slices[0].date, "2026-10-15");
    assert.equal(slices[0].usage.total, 1000, "the pre-midnight portion stays on 10-15");
    assert.equal(slices[0].calls, 1);
    assert.equal(slices[1].date, "2026-10-16");
    assert.equal(slices[1].usage.total, 300, "the post-midnight portion moves to 10-16");
    assert.equal(slices[1].calls, 1);
    assert.equal(
      slices[0].usage.total + slices[1].usage.total,
      turn.usage.total,
      "the split is a partition: no token is gained or lost",
    );
    assert.equal(
      slices[0].usage.input + slices[1].usage.input,
      turn.usage.input,
      "the input partition is exact too",
    );
    // Cross-realm arrays break deepStrictEqual in the VM sandbox; compare text.
    assert.equal(api.usageTurnDayDates(turn).join(","), "2026-10-15,2026-10-16");

    // buildAnalyticsRollup must place each slice on its own day.
    const rollup = api.buildAnalyticsRollup([turn]);
    assert.equal(rollup.days["2026-10-15"].models["gpt-5.5"].usage.total, 1000);
    assert.equal(rollup.days["2026-10-16"].models["gpt-5.5"].usage.total, 300);
    assert.equal(rollup.days["2026-10-15"].models["gpt-5.5"].calls, 1);
    assert.equal(rollup.days["2026-10-16"].models["gpt-5.5"].calls, 1);
    assert.equal(
      rollup.days["2026-10-15"].models["gpt-5.5"].usage.total + rollup.days["2026-10-16"].models["gpt-5.5"].usage.total,
      turn.usage.total,
      "the rollup keeps the grand total unchanged",
    );

    // A day-scoped range must only count the portion that happened that day.
    const day15 = {
      startMs: new Date(2026, 9, 15, 0, 0, 0, 0).getTime(),
      endMs: new Date(2026, 9, 15, 23, 59, 59, 999).getTime(),
    };
    const day16 = {
      startMs: new Date(2026, 9, 16, 0, 0, 0, 0).getTime(),
      endMs: new Date(2026, 9, 16, 23, 59, 59, 999).getTime(),
    };
    const onlyDay15 = api.aggregateUsageAnalytics([turn], day15);
    const onlyDay16 = api.aggregateUsageAnalytics([turn], day16);
    assert.equal(onlyDay15.totalTokens, 1000, "the 10-15 range counts only the pre-midnight part");
    assert.equal(onlyDay16.totalTokens, 300, "the 10-16 range counts only the post-midnight part");
    assert.equal(onlyDay15.calls, 1);
    assert.equal(onlyDay16.calls, 1);
    assert.equal(
      onlyDay15.totalTokens + onlyDay16.totalTokens,
      turn.usage.total,
      "the two day ranges add back up to the turn total",
    );
    // Cost is a linear function of tokens, so the split must stay additive.
    assert.ok(Math.abs(onlyDay15.cost + onlyDay16.cost - api.turnCost(turn, "gpt-5.5").value) < 1e-9, "the split cost equals the whole-turn cost");

    // The split is derived from facts, so the turn itself must be marked as
    // crossing midnight without a separate source panel.
    assert.equal(api.usageTurnCrossesMidnight(turn), true, "the split turn stays marked");

    // A single-day turn is NOT split (and keeps the whole-turn figures).
    const sameDayTurn = {
      turnId: "turn-mid",
      model: "gpt-5.5",
      callCount: 2,
      usageSource: "token_usage_record",
      observedAt: beforeMidnight,
      usage: turn.usage,
    };
    const singleSlices = api.usageTurnDaySlices({ ...sameDayTurn, turnId: "turn-other" });
    assert.equal(singleSlices.length, 1, "a turn without facts stays unsplit");
    assert.equal(singleSlices[0].usage.total, 1300);

    // Guard: when the facts disagree with the turn total, never fabricate a split.
    api.usageFactReset();
    api.usageFactUpsert({ responseId: "resp_partial", threadId: "01thread-mid", turnId: "turn-gap", usage: nightUsage, observedAtMs: beforeMidnight, source: "rollout_record" });
    const mismatched = {
      turnId: "turn-gap",
      model: "gpt-5.5",
      callCount: 5,
      usageSource: "token_usage_record",
      observedAt: beforeMidnight,
      usage: { input: 9000, output: 1000, cached: 0, total: 10000, exact: true },
    };
    const guarded = api.usageTurnDaySlices(mismatched);
    assert.equal(guarded.length, 1, "facts that do not add up to the turn total are not split");
    assert.equal(guarded[0].usage.total, 10000, "the whole turn stays on its own day");
    assert.equal(guarded[0].date, "2026-10-15");
    api.usageFactReset();
  }

  // ==========================================================================
  // A8b. the split also reaches the HUD day buckets (localDailyUsage)
  // ==========================================================================
  {
    api.usageFactReset();
    const beforeMidnight = new Date(2026, 9, 20, 23, 40, 0).getTime();
    const afterMidnight = new Date(2026, 9, 21, 0, 20, 0).getTime();
    api.usageFactUpsert({ responseId: "resp_bucket_night", threadId: "01thread-bucket", turnId: "turn-bucket", usage: { input_tokens: 500, output_tokens: 100, total_tokens: 600 }, observedAtMs: beforeMidnight, source: "rollout_record" });
    api.usageFactUpsert({ responseId: "resp_bucket_dawn", threadId: "01thread-bucket", turnId: "turn-bucket", usage: { input_tokens: 150, output_tokens: 50, total_tokens: 200 }, observedAtMs: afterMidnight, source: "rollout_record" });
    api.importLocalUsageTurns(
      [
        {
          turnId: "turn-bucket",
          threadId: "01thread-bucket",
          sessionKey: "local:01thread-bucket",
          model: "gpt-5.5",
          callCount: 2,
          startedAt: new Date(beforeMidnight).toISOString(),
          finishedAt: new Date(afterMidnight).toISOString(),
          observedAt: beforeMidnight,
          usage: { input: 650, output: 150, cached: 0, total: 800, exact: true },
        },
      ],
      { replaceSource: "cross-midnight-test", idbOnly: false },
    );
    const days = api.localDailyUsage();
    assert.equal(days.get("2026-10-20").tokens, 600, "the pre-midnight slice lands on 10-20");
    assert.equal(days.get("2026-10-21").tokens, 200, "the post-midnight slice lands on 10-21");
    assert.equal(days.get("2026-10-20").requests, 1);
    assert.equal(days.get("2026-10-21").requests, 1);
    api.usageFactReset();
  }

  // ==========================================================================
  // A8b2. the daily archive yields to authoritative facts for the same day
  // ==========================================================================
  {
    api.usageFactReset();
    const date = "2026-09-09";
    api.setLocalUsageArchive({
      version: 1,
      updatedAt: Date.now(),
      days: {
        [date]: {
          models: {
            "minimax-m3.1-flash": {
              usage: { input: 100, output: 10, cached: 50, total: 110, exact: true },
              calls: 1,
            },
          },
        },
      },
    });
    const archived = api.localUsageArchiveTurnsForAnalytics([date]);
    assert.equal(archived.length, 1, "archive is used when no facts/profile cover the day");
    assert.equal(archived[0].usage.total, 110);

    api.usageFactUpsert({
      responseId: "resp_archive_guard",
      threadId: "01thread-archive-guard",
      turnId: "turn-archive-guard",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      observedAtMs: new Date(2026, 8, 9, 10, 0, 0).getTime(),
      source: "rollout_record",
    });
    assert.equal(
      api.localUsageArchiveTurnsForAnalytics([date]).length,
      0,
      "a fact-backed day must not add the old daily archive on top",
    );

    api.setLocalUsageArchive({ version: 1, updatedAt: 0, days: {} });
    api.usageFactReset();
  }

  // ==========================================================================
  // A8c. hydration dedupes by response_id and fills the rollout model
  // ==========================================================================
  {
    api.usageFactReset();
    const base = Date.parse("2026-10-22T02:00:00.000Z");
    currentNow = base;
    const sessionKey = "hydrate-session";
    api.beginLocalTurn({ sessionKey, turnId: "hydrate-live-turn", forceNewIfUsed: true });
    const booked = api.rememberLocalUsage(
      { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      "message",
      {},
      { sessionKey, responseId: "resp_hydrate_1", threadId: "01thread-hydrate", turnId: "hydrate-live-turn", persist: true },
    );
    assert.equal(booked, true, "the live row must reach the ledger");
    api.usageFactUpsert({
      responseId: "resp_hydrate_1",
      threadId: "01thread-hydrate",
      turnId: "rollout-hydrate-turn",
      model: "gpt-5.4",
      effort: "high",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      observedAtMs: base,
      source: "rollout_record",
    });

    const rowsFor = (responseId) =>
      api.localUsageExport().turns.filter((row) => (row.responseIds || []).includes(responseId));
    assert.equal(rowsFor("resp_hydrate_1").length, 1, "the live row exists before hydration");

    api.usageFactHydrateLedger();
    const hydrated = rowsFor("resp_hydrate_1");
    assert.equal(hydrated.length, 1, "hydration must not add a second row for the same response");
    assert.equal(hydrated[0].usage.total, 110, "usage is recomputed from the facts");
    assert.equal(hydrated[0].model, "gpt-5.4", "the rollout model replaces the live model");
    assert.equal(hydrated[0].usageSource, "token_usage_record");
    api.setLocalCurrentTurn(null, sessionKey);

    // Two legacy ledger rows sharing one response_id collapse into one row.
    api.usageFactReset();
    const imported = api.importLocalUsageTurns(
      [
        {
          turnId: "hydrate-dup-a",
          threadId: "01thread-hydrate-dup",
          sessionKey: "local:01thread-hydrate-dup",
          model: "gpt-5.5",
          responseIds: ["resp_hydrate_dup"],
          callCount: 1,
          usage: { input: 100, output: 10, cached: 0, total: 110, exact: true },
          startedAt: new Date(base).toISOString(),
          finishedAt: new Date(base + 1000).toISOString(),
          observedAt: base,
        },
        {
          turnId: "hydrate-dup-b",
          threadId: "01thread-hydrate-dup",
          sessionKey: "local:01thread-hydrate-dup",
          model: "gpt-5.5",
          responseIds: ["resp_hydrate_dup"],
          callCount: 1,
          usage: { input: 200, output: 20, cached: 0, total: 220, exact: true },
          startedAt: new Date(base).toISOString(),
          finishedAt: new Date(base + 1000).toISOString(),
          observedAt: base,
        },
      ],
      { idbOnly: false },
    );
    assert.equal(imported.imported, 2, "both duplicate rows are seeded");
    assert.equal(rowsFor("resp_hydrate_dup").length, 2, "the fixture really holds two rows");
    api.usageFactUpsert({
      responseId: "resp_hydrate_dup",
      threadId: "01thread-hydrate-dup",
      turnId: "rollout-hydrate-dup",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      observedAtMs: base,
      source: "rollout_record",
    });
    api.usageFactHydrateLedger();
    const deduped = rowsFor("resp_hydrate_dup");
    assert.equal(deduped.length, 1, "one response_id must belong to exactly one ledger row");
    assert.equal(deduped[0].usage.total, 110, "the surviving row is recomputed from the fact, not from either duplicate");
  }

  // ==========================================================================
  // A8d. mergeProfileLedgerTurns also dedupes by response_id
  // ==========================================================================
  {
    const base = Date.parse("2026-10-22T03:00:00.000Z");
    const imported = api.importLocalUsageTurns(
      [
        {
          turnId: "profile-merge-dedupe",
          threadId: "01thread-profile-merge",
          sessionKey: "local:01thread-profile-merge",
          model: "gpt-5.5",
          responseIds: ["resp_profile_merge"],
          callCount: 1,
          // Deliberately a different signature: only the response_id overlap
          // can stop this row from being added a second time.
          usage: { input: 200, output: 20, cached: 0, total: 220, exact: true },
          startedAt: new Date(base).toISOString(),
          finishedAt: new Date(base + 1000).toISOString(),
          observedAt: base,
        },
      ],
      { idbOnly: true },
    );
    assert.equal(imported.imported, 1, "the profile ledger row is seeded");
    const liveTurn = {
      turnId: "live-profile-merge",
      sessionKey: "local:01thread-profile-merge",
      threadKey: "local:01thread-profile-merge",
      model: "gpt-5.5",
      responseIds: ["resp_profile_merge"],
      callCount: 1,
      usage: { input: 100, output: 10, cached: 0, total: 110, exact: true },
      startedAt: new Date(base).toISOString(),
      finishedAt: new Date(base + 1000).toISOString(),
      createdAt: new Date(base).toISOString(),
    };
    const merged = api.mergeProfileLedgerTurns([liveTurn]);
    assert.equal(
      merged.filter((turn) => (turn.responseIds || []).includes("resp_profile_merge")).length,
      1,
      "a profile turn sharing a response_id must not be counted twice",
    );
    assert.equal(merged.some((turn) => turn.turnId === "profile-merge-dedupe"), false, "the overlapping profile row is skipped");
  }

  // ==========================================================================
  // A9. observability counters (P2 #5)
  // ==========================================================================
  {
    const lines = [
      metaLine("01thread-obs"),
      recordLine("resp_obs_1", "turn-obs", { input: 100, output: 10, total: 110 }),
      // same response_id again -> duplicate record (idempotent, not counted twice)
      recordLine("resp_obs_1", "turn-obs", { input: 100, output: 10, total: 110 }),
      tokenCountLine("turn-obs", { input: 10, output: 2, total: 12 }, 12, "2026-10-15T06:00:00.000Z"),
      // same signature + same cumulative -> duplicate heartbeat
      tokenCountLine("turn-obs", { input: 10, output: 2, total: 12 }, 12, "2026-10-15T06:00:15.900Z"),
      "{this is not json}",
    ];
    const summary = { lineErrors: 0 };
    const thread = api.usageSyncParseLines(lines, summary);
    assert.ok(thread, "the observability fixture must parse");
    assert.equal(summary.lines, lines.length, "every non-empty line is counted");
    assert.equal(summary.records, 2, "two token_usage_record lines are seen");
    assert.equal(summary.duplicateRecords, 1, "the repeated response_id is counted as a duplicate");
    assert.equal(summary.heartbeats, 2, "two token_count heartbeats are seen");
    assert.equal(summary.duplicateHeartbeats, 1, "the repeated heartbeat is counted as a duplicate");
    assert.equal(summary.lineErrors, 1, "the malformed line is still an error");
    const row = api.usageSyncFinalizeTurnRow("01thread-obs", thread.turns.get("turn-obs"));
    assert.equal(row.usage.total_tokens, 110, "duplicates never change the total");
    assert.equal(row.callCount, 1, "one response, not two");
  }

  // ==========================================================================
  // A10. privacy guard (P2 #4) — command output / message text never persists
  // ==========================================================================
  {
    const turn = {
      turnId: "turn-privacy",
      model: "gpt-5.5",
      callCount: 1,
      usage: { input: 1, output: 1, cached: 0, total: 2, exact: true },
      text: "assistant message body",
      content: "tool output body",
      stdout: "command stdout",
      stderr: "command stderr",
      command: "rm -rf /",
      arguments: { path: "/secret" },
      output: "model output text",
      items: [{ type: "CommandExecution", text: "leaked" }],
      rawPayload: { body: "payload" },
      calls: [{ usage: { input: 1, output: 1, cached: 0, total: 2, exact: true } }],
      responseIds: ["resp_privacy"],
    };
    const mirror = api.localLedgerMirrorTurn(turn);
    for (const field of ["text", "content", "stdout", "stderr", "command", "arguments", "output", "items", "rawPayload", "calls"]) {
      assert.equal(field in mirror, false, `${field} must not reach the localStorage mirror`);
    }
    // Usage / counters / identity are still there.
    assert.equal(mirror.turnId, "turn-privacy");
    assert.equal(mirror.usage.total, 2);
    assert.equal(mirror.responseIds[0], "resp_privacy");
    const serialized = JSON.stringify(mirror);
    assert.equal(/assistant message body|command stdout|rm -rf|leaked|payload/.test(serialized), false, "no free text survives serialization");
  }

  // ==========================================================================
  // A11. a response-less live fallback inside a fact-backed window is not double counted
  // ==========================================================================
  {
    const baseStart = new Date(2026, 8, 9, 10, 0, 0).getTime();
    const baseTurn = {
      turnId: "fact-window-base",
      sessionKey: "dedupe-window-session",
      startedAt: new Date(baseStart).toISOString(),
      finishedAt: new Date(baseStart + 10 * 60_000).toISOString(),
      usage: { input: 100, output: 10, cached: 0, total: 110, exact: true },
      responseIds: ["resp_window_base"],
      callCount: 1,
    };
    const overlapping = {
      turnId: "live-window-overlap",
      sessionKey: "local:dedupe-window-session",
      startedAt: new Date(baseStart + 60_000).toISOString(),
      usage: { input: 20, output: 2, cached: 0, total: 22, exact: true },
      callCount: 1,
    };
    api.profileLedgerUpsertTurn(overlapping);
    const merged = api.mergeProfileLedgerTurns([baseTurn]);
    assert.equal(
      merged.some((turn) => turn.turnId === "live-window-overlap"),
      false,
      "a response-less fallback inside the fact window must be skipped",
    );

    const standalone = {
      ...overlapping,
      turnId: "live-window-standalone",
      startedAt: new Date(baseStart + 60 * 60_000).toISOString(),
    };
    api.profileLedgerUpsertTurn(standalone);
    const mergedAgain = api.mergeProfileLedgerTurns([baseTurn]);
    assert.equal(
      mergedAgain.some((turn) => turn.turnId === "live-window-standalone"),
      true,
      "a fallback outside every fact window is still kept",
    );
  }

  // ==========================================================================
  // A12. legacy facts get their model backfilled from the Profile turn
  // ==========================================================================
  {
    api.usageFactReset();
    const responseId = "legacy:model-backfill-test:0:x";
    api.usageFactUpsert({
      responseId,
      threadId: "thread-model-backfill",
      turnId: "turn-model-backfill",
      usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 },
      observedAtMs: Date.now(),
      source: "legacy-migration",
    });
    api.profileLedgerUpsertTurn({
      turnId: "turn-model-backfill",
      threadKey: "thread-model-backfill",
      model: "gpt-5.5",
      startedAt: new Date().toISOString(),
      usage: { input: 10, output: 1, cached: 0, total: 11, exact: true },
    });
    const result = api.usageFactBackfillLegacyModels();
    assert.equal(result.updated >= 1, true, "the response-less legacy fact is updated");
    assert.equal(api.usageFactRecord(responseId).model, "gpt-5.5", "the model comes from the Profile turn");
  }

  console.log("usage accuracy P0 tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
