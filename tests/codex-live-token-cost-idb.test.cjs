"use strict";

// Regression tests for the IndexedDB profile-ledger write path:
// - snapshot writes are append-only for turns/calls/invocations: a stale
//   in-memory ledger (leftover hot-reload instance, second window) must never
//   delete records that already reached IndexedDB
// - a failing snapshot transaction degrades to localStorage-fallback and warns
// - importLocalUsageTurns counts a turn as imported only when the upsert succeeds
//
// Harness copied from codex-live-token-cost-backfill.test.cjs, plus an in-memory
// fake IndexedDB so the script runs in "indexeddb" storage mode.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { TextDecoder } = require("node:util");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-live-token-cost.js");
const code = fs.readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

const PROFILE_LEDGER_SNAPSHOT_KEY = "__codexLiveTokenCostProfileLedgerV2";
const PROFILE_DB_NAME = "codex-live-token-cost-profile";

// --- fake IndexedDB ---------------------------------------------------------

function createFakeIndexedDB() {
  const databases = new Map(); // name -> { version, stores: Map<name, { keyPath, records: Map }> }
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
      _listeners: new Map(),
      _pending: 0,
      _finished: false,
      _failed: false,
      addEventListener(type, handler) {
        const list = tx._listeners.get(type) || [];
        list.push(handler);
        this._listeners.set(type, list);
      },
      _fire(type) {
        const handler = this[`on${type}`];
        if (typeof handler === "function") handler.call(this, { target: tx });
        for (const listener of this._listeners.get(type) || []) listener.call(this, { target: tx });
      },
      _settle() {
        if (this._finished) return;
        this._finished = true;
        this._fire(this._failed ? "error" : "complete");
      },
      _run(handler) {
        const request = new FakeRequest();
        this._pending += 1;
        schedule(() => {
          if (this._failed) {
            // A failed transaction stops mutating; later requests just error out.
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
      objectStore(storeName) {
        const store = entry.stores.get(storeName);
        if (!store) throw new Error(`NotFoundError: store ${storeName}`);
        const handle = makeStoreHandle(store);
        const failable = (storeName) =>
          state.failNextPut && state.failNextPut.store === storeName ? state.failNextPut.error : null;
        return {
          clear: () => tx._run(() => handle.clear()),
          put: (value, key) =>
            tx._run(() => {
              const failure = failable(storeName);
              if (failure) {
                state.failNextPut = null;
                throw failure;
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
  const seedRecord = (name, storeName, value) => {
    const entry = databases.get(name);
    assert.ok(entry, `db ${name} must exist`);
    const store = entry.stores.get(storeName);
    assert.ok(store, `store ${storeName} must exist`);
    store.records.set(store.keyPath ? value[store.keyPath] : undefined, JSON.parse(JSON.stringify(value)));
  };

  return { indexedDB, dumpStore, seedRecord, state };
}

// --- script harness ---------------------------------------------------------

const listeners = new Map();
const windowListeners = new Map();
const storage = new Map();
const bridgeCalls = [];
const delayedTimers = [];
const warnings = [];
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

const fake = createFakeIndexedDB();

const context = {
  console: {
    ...console,
    warn(...args) {
      warnings.push(args.map(String).join(" "));
    },
  },
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
  indexedDB: fake.indexedDB,
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
const settle = async (rounds = 30) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const makeRow = (turnId, threadId, total) => {
  const observed = Date.parse("2026-06-25T10:00:20.000Z");
  const usage = { input: total - 2, output: 2, cached: 0, total };
  return {
    turnId,
    threadKey: `local:${threadId}`,
    sessionKey: `local:${threadId}`,
    source: "codex-usage-backfill",
    importSource: "codex-usage-backfill",
    model: "gpt-5.5",
    startedAt: "2026-06-25T10:00:00.000Z",
    finishedAt: "2026-06-25T10:01:00.000Z",
    createdAt: "2026-06-25T10:00:00.000Z",
    callCount: 1,
    usage,
    calls: [{ usage: { ...usage }, observedAt: observed }],
  };
};

(async () => {
  await settle();

  // --- 1. idb-mode import persists the turn + call rows ---
  const importA = api.importLocalUsageTurns([makeRow("idb-turn-a", "idb-thread-a", 100)], {
    replaceSource: "codex-usage-backfill",
    idbOnly: true,
    dedupeAgainstLedger: true,
  });
  assert.equal(importA.imported, 1);
  await settle();
  const turnsAfterA = fake.dumpStore(PROFILE_DB_NAME, "profileTurns");
  assert.ok(
    turnsAfterA.some((turn) => turn.turnId === "idb-turn-a"),
    "imported turn must be persisted to IndexedDB",
  );
  assert.equal(readJson(PROFILE_LEDGER_SNAPSHOT_KEY).storage, "indexeddb");
  assert.equal(warnings.length, 0, "healthy writes must not warn");

  // --- 2. stale-instance writes are append-only: external records survive ---
  fake.seedRecord(PROFILE_DB_NAME, "profileTurns", {
    turnId: "external-turn-1",
    threadKey: "local:external-thread",
    threadAttributionStatus: "reliable",
    startedAt: "2026-06-01T00:00:00.000Z",
    completedAt: "",
    durationMs: 0,
    durationStatus: "incomplete",
    model: "gpt-5.5",
    usage: { input: 5, output: 5, cached: 0, total: 10, exact: true },
    callCount: 1,
    source: "codex-usage-backfill",
    capturedAt: "2026-06-01T00:00:00.000Z",
    persistReason: "import",
    invocationIds: [],
    invocations: [],
  });
  fake.seedRecord(PROFILE_DB_NAME, "profileUsageCalls", {
    id: "external-turn-1\u0001ext",
    turnId: "external-turn-1",
    usageKey: "ext",
    usage: { input: 5, output: 5, cached: 0, total: 10, exact: true },
    observedAt: Date.parse("2026-06-01T00:00:10.000Z"),
    source: "codex-usage-backfill",
  });

  const importB = api.importLocalUsageTurns([makeRow("idb-turn-b", "idb-thread-b", 200)], {
    replaceSource: "codex-usage-backfill",
    idbOnly: true,
    dedupeAgainstLedger: true,
  });
  assert.equal(importB.imported, 1);
  await settle();
  const turnsAfterB = fake.dumpStore(PROFILE_DB_NAME, "profileTurns").map((turn) => turn.turnId).sort();
  assert.deepEqual(
    turnsAfterB,
    ["external-turn-1", "idb-turn-a", "idb-turn-b"],
    "stale full-snapshot writes must not delete external turn records",
  );
  const callsAfterB = fake.dumpStore(PROFILE_DB_NAME, "profileUsageCalls").map((call) => call.id);
  assert.ok(callsAfterB.includes("external-turn-1\u0001ext"), "external call records must survive snapshot writes");
  assert.ok(callsAfterB.some((id) => id.startsWith("idb-turn-b\u0001")), "imported call rows must be persisted");
  assert.equal(warnings.length, 0);

  // --- 3. failing write degrades to fallback + warns, memory keeps the turn ---
  fake.state.failNextPut = { store: "profileTurns", error: new Error("simulated quota") };
  const importC = api.importLocalUsageTurns([makeRow("idb-turn-c", "idb-thread-c", 300)], {
    replaceSource: "codex-usage-backfill",
    idbOnly: true,
    dedupeAgainstLedger: true,
  });
  assert.equal(importC.imported, 1);
  await settle();
  assert.equal(warnings.length, 1, "a failed snapshot transaction must warn exactly once");
  assert.match(warnings[0], /degraded to localStorage/);
  assert.ok(
    api.profileLedgerTurns().some((turn) => turn.turnId === "idb-turn-c"),
    "degraded mode keeps the turn in memory",
  );
  const fallbackSnapshot = readJson(PROFILE_LEDGER_SNAPSHOT_KEY);
  assert.equal(fallbackSnapshot.storage, "localStorage-fallback");
  assert.ok(
    Array.isArray(fallbackSnapshot.turns) && fallbackSnapshot.turns.some((turn) => turn.turnId === "idb-turn-c"),
    "fallback snapshot must carry the turn payload",
  );
  const turnsAfterC = fake.dumpStore(PROFILE_DB_NAME, "profileTurns").map((turn) => turn.turnId);
  assert.ok(!turnsAfterC.includes("idb-turn-c"), "no IndexedDB write happens after degradation");

  console.log("idb write-path regression tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
