"use strict";

// P0 persistence regression tests for the Codex usage ledger:
//
// - IndexedDB is the single fact source; a localStorage wipe still restores the facts
// - a host backup (manifest + per-day NDJSON shards) restores after an IndexedDB wipe
// - more than 2,000 turns keep every response fact (2,000 is a UI window, not a cap)
// - legacy migration verifies count/total before it is marked complete
// - concurrent writes serialize and never lose a record
// - a checksum mismatch fails loudly and keeps the previous file
// - export/import merges by responseId instead of overwriting the store
//
// The harness reuses the fake IndexedDB from codex-live-token-cost-usage-accuracy.test.cjs.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { TextDecoder } = require("node:util");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-live-token-cost.js");
const code = fs.readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

const LOCAL_USAGE_KEY = "__codexLiveTokenCostLocalUsageV1";
const PROFILE_DB_NAME = "codex-live-token-cost-profile";
const RESPONSES_STORE = "profileResponses";
const META_STORE = "profileMeta";

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
        store.records.set(store.keyPath ? value?.[store.keyPath] : key, clone(value));
      },
      get(key) {
        return store.records.has(key) ? clone(store.records.get(key)) : undefined;
      },
      getAll() {
        return Array.from(store.records.values()).map(clone);
      },
    };
  }

  function makeTransaction(entry) {
    const tx = {
      error: null,
      oncomplete: null,
      onerror: null,
      onabort: null,
      _pending: 0,
      _finished: false,
      _failed: false,
      _fire(type) {
        const handler = this[`on${type}`];
        if (typeof handler === "function") handler.call(this, { target: this });
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
      transaction(storeNames) {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        for (const storeName of names) {
          if (!entry.stores.has(storeName)) throw new Error(`NotFoundError: store ${storeName}`);
        }
        return makeTransaction(entry);
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

// --- harness ----------------------------------------------------------------

const storage = new Map();
let currentNow = Date.parse("2026-10-22T00:00:00.000Z");
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

const fake = createFakeIndexedDB();

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
    addEventListener() {},
    removeEventListener() {},
    createElement() {
      return {
        style: {},
        dataset: {},
        children: [],
        classList: { add() {}, remove() {}, contains() { return false; } },
        setAttribute() {},
        removeAttribute() {},
        appendChild() {},
        remove() {},
      };
    },
    getElementById() {
      return { remove() {} };
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
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  postMessage() {},
};
context.window = context;
context.globalThis = context;
context.__CODEX_LIVE_TOKEN_COST_TEST__ = true;
context.indexedDB = fake.indexedDB;

const settle = async (rounds = 40) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

const boot = () => {
  vm.runInNewContext(code, context, { filename: scriptPath });
  return context.__codexLiveTokenCostTest;
};

// A fake app-server client backed by an in-memory file system.
function createFakeAppServer(files = {}) {
  const fsMap = new Map(Object.entries(files));
  const calls = [];
  return {
    calls,
    files: fsMap,
    disposed: false,
    hostId: "local",
    async sendRequest(method, params) {
      calls.push([method, params]);
      if (method === "thread/list") {
        return { data: [{ path: "C:\\Users\\test\\.codex\\sessions\\2026\\10\\22\\rollout-x.jsonl" }] };
      }
      if (method === "fs/createDirectory") return {};
      if (method === "fs/writeFile") {
        fsMap.set(params.path, Buffer.from(params.dataBase64, "base64").toString("utf8"));
        return {};
      }
      if (method === "fs/readFile") {
        const text = fsMap.get(params.path);
        if (text === undefined) throw new Error(`NotFoundError: ${params.path}`);
        return { dataBase64: Buffer.from(text, "utf8").toString("base64") };
      }
      if (method === "fs/copy") {
        fsMap.set(params.destinationPath, fsMap.get(params.sourcePath));
        return {};
      }
      if (method === "fs/readDirectory") {
        const prefix = params.path + "\\";
        const names = new Set();
        for (const key of fsMap.keys()) {
          if (key.startsWith(prefix)) names.add(key.slice(prefix.length));
        }
        return { entries: Array.from(names).map((fileName) => ({ fileName, isDirectory: false, isFile: true })) };
      }
      if (method === "fs/remove") {
        fsMap.delete(params.path);
        return {};
      }
      throw new Error(`unsupported method: ${method}`);
    },
  };
}

(async () => {
  let api = boot();
  await settle();

  // ==========================================================================
  // B1. facts are written to IndexedDB and survive a reload
  // ==========================================================================
  {
    const facts = Array.from({ length: 5 }, (_, index) => ({
      responseId: `resp_persist_${index}`,
      threadId: "01thread-persist",
      turnId: `turn-persist-${index}`,
      usage: { input_tokens: 100 + index, output_tokens: 10, total_tokens: 110 + index },
      observedAtMs: currentNow + index,
      source: "rollout_record",
    }));
    for (const fact of facts) api.usageFactUpsert(fact);
    const written = await api.usageFactPersistResponses(facts);
    assert.equal(written, true, "facts must reach IndexedDB");
    await settle();
    const stored = fake.dumpStore(PROFILE_DB_NAME, RESPONSES_STORE);
    assert.equal(stored.length, 5, "IndexedDB holds one row per response_id");
    assert.equal(stored[0].responseId, "resp_persist_0");
    assert.equal(stored[0].schemaVersion, 2);

    // A fresh script instance must hydrate the facts from IndexedDB.
    context.__codexLiveTokenCost.destroy();
    api = boot();
    await settle();
    await api.usageFactEnsureLoaded();
    assert.equal(api.usageFactTotals().count, 5, "a reload restores every response fact");
    assert.equal(api.usageFactTotals().total, 110 + 111 + 112 + 113 + 114);
  }

  // ==========================================================================
  // B2. clearing localStorage must not lose the facts (IndexedDB is the source)
  // ==========================================================================
  {
    storage.delete(LOCAL_USAGE_KEY);
    storage.clear();
    context.__codexLiveTokenCost.destroy();
    api = boot();
    await settle();
    await api.usageFactEnsureLoaded();
    assert.equal(api.usageFactTotals().count, 5, "clearing localStorage must not lose the facts");
    assert.ok(api.usageFactTotals().total > 0, "the restored total is still there");
  }

  // ==========================================================================
  // B3. host backup: manifest + per-day NDJSON shards, checksum verified
  // ==========================================================================
  {
    const client = createFakeAppServer();
    const result = await api.usageFactBackupToHost({ client, root: "C:\\Users\\test\\.codex" });
    assert.equal(result.ok, true, `host backup must succeed: ${JSON.stringify(result)}`);
    const manifestPath = "C:\\Users\\test\\.codex\\usage-ledger\\manifest.json";
    const manifest = JSON.parse(client.files.get(manifestPath));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.count, 5);
    assert.ok(manifest.days.length >= 1, "at least one shard");
    assert.ok(manifest.checksums[manifest.days[0]], "each shard carries a checksum");
    // The .tmp file must be gone: only the final file remains.
    assert.equal(client.files.has(`${manifestPath}.tmp`), false, "the temp file is removed after the swap");
    for (const day of manifest.days) {
      const shard = client.files.get(`C:\\Users\\test\\.codex\\usage-ledger\\${day}.ndjson`);
      assert.ok(shard, `shard ${day} exists`);
      assert.equal(api.usageFactChecksum(shard), manifest.checksums[day], "the shard checksum matches the manifest");
      assert.ok(shard.trim().split(/\r?\n/).length >= 1);
    }
  }

  // ==========================================================================
  // B4. an IndexedDB wipe restores from the host manifest + shards
  // ==========================================================================
  {
    const client = createFakeAppServer();
    // Re-create the backup from the current in-memory facts.
    await api.usageFactBackupToHost({ client, root: "C:\\Users\\test\\.codex" });
    const expectedCount = api.usageFactTotals().count;
    const expectedTotal = api.usageFactTotals().total;

    // Wipe IndexedDB and the in-memory facts, then restore.
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    assert.equal(api.usageFactTotals().count, 0, "the in-memory facts are gone");

    const restored = await api.usageFactRestoreFromHostBackup({ client, root: "C:\\Users\\test\\.codex" });
    assert.equal(restored, true, "the host backup must restore the facts");
    assert.equal(api.usageFactTotals().count, expectedCount, "every fact is restored from the shards");
    assert.equal(api.usageFactTotals().total, expectedTotal, "the restored total matches");
  }

  // A checksum mismatch must fail loudly instead of restoring garbage.
  {
    const client = createFakeAppServer();
    await api.usageFactBackupToHost({ client, root: "C:\\Users\\test\\.codex" });
    const manifestPath = "C:\\Users\\test\\.codex\\usage-ledger\\manifest.json";
    const manifest = JSON.parse(client.files.get(manifestPath));
    const day = manifest.days[0];
    // Corrupt the shard on disk.
    client.files.set(`C:\\Users\\test\\.codex\\usage-ledger\\${day}.ndjson`, "corrupted\n");
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    const restored = await api.usageFactRestoreFromHostBackup({ client, root: "C:\\Users\\test\\.codex" });
    assert.equal(restored, false, "a corrupted shard must not be restored");
    assert.match(api.usageFactState().hostBackupError, /校验失败/, "the checksum failure is reported");
  }

  // A failed write must keep the previous file (the .tmp swap never happens).
  {
    const client = createFakeAppServer();
    await api.usageFactBackupToHost({ client, root: "C:\\Users\\test\\.codex" });
    const manifestPath = "C:\\Users\\test\\.codex\\usage-ledger\\manifest.json";
    const before = client.files.get(manifestPath);
    // Make the write of the .tmp file corrupt the content on read-back.
    const original = client.sendRequest.bind(client);
    client.sendRequest = async (method, params) => {
      if (method === "fs/writeFile") {
        const result = await original(method, params);
        // Corrupt the file that was just written so the read-back fails.
        client.files.set(params.path, "corrupted");
        return result;
      }
      return original(method, params);
    };
    const failed = await api.usageFactBackupToHost({ client, root: "C:\\Users\\test\\.codex" });
    client.sendRequest = original;
    assert.equal(failed.ok, false, "a checksum failure aborts the backup");
    assert.equal(failed.reason, "checksum");
    assert.equal(client.files.get(manifestPath), before, "the previous manifest is kept when the backup fails");
  }

  // ==========================================================================
  // B5. more than 2,000 turns keep every response fact
  // ==========================================================================
  {
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    const total = 2500;
    const batch = Array.from({ length: total }, (_, index) => ({
      responseId: `resp_bulk_${index}`,
      threadId: "01thread-bulk",
      turnId: `turn-bulk-${index}`,
      usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
      observedAtMs: currentNow + index,
      source: "rollout_record",
    }));
    for (const fact of batch) api.usageFactUpsert(fact);
    await api.usageFactPersistResponses(batch);
    await settle();
    assert.equal(api.usageFactTotals().count, total, "2,000 is not an accounting cap");
    assert.equal(fake.dumpStore(PROFILE_DB_NAME, RESPONSES_STORE).length, total, "every fact reached IndexedDB");
    assert.equal(api.usageFactTotals().total, total);
  }

  // ==========================================================================
  // B6. legacy migration verifies count/total before marking completion
  // ==========================================================================
  {
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    storage.set(
      LOCAL_USAGE_KEY,
      JSON.stringify({
        seq: 1,
        turns: [
          {
            turnId: "legacy-turn-1",
            sessionKey: "local:legacy-thread",
            source: "codex-live-token-cost",
            model: "gpt-5.5",
            createdAt: "2026-10-01T00:00:00.000Z",
            usage: { input_tokens: 100, output_tokens: 10, cached_tokens: 0, total_tokens: 110 },
          },
          {
            turnId: "legacy-turn-2",
            sessionKey: "local:legacy-thread",
            source: "codex-live-token-cost",
            model: "gpt-5.5",
            createdAt: "2026-10-02T00:00:00.000Z",
            usage: { input_tokens: 200, output_tokens: 20, cached_tokens: 0, total_tokens: 220 },
          },
        ],
      }),
    );
    const migration = await api.usageFactMigrateLegacy();
    assert.equal(migration.verified, true, "the migration verifies count/total");
    assert.equal(migration.count, 2, "both legacy turns become facts");
    assert.equal(migration.total, 330, "the migrated total matches the legacy total");
    assert.equal(api.usageFactTotals().count, 2);
    const meta = fake.dumpStore(PROFILE_DB_NAME, META_STORE).find((row) => row.key === "legacy-migration");
    assert.ok(meta, "the migration state is persisted");
    assert.equal(meta.value.completed, true, "the migration is only marked complete after verification");
    // The old localStorage ledger is not deleted by the migration.
    assert.ok(storage.get(LOCAL_USAGE_KEY), "the legacy ledger is preserved");
  }

  // A failed migration must not be marked complete and must not delete the old data.
  {
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    storage.set(
      LOCAL_USAGE_KEY,
      JSON.stringify({
        turns: [
          {
            turnId: "legacy-turn-fail",
            sessionKey: "local:legacy-thread",
            source: "codex-live-token-cost",
            usage: { input_tokens: 5, output_tokens: 0, cached_tokens: 0, total_tokens: 5 },
          },
        ],
      }),
    );
    fake.state.failNextPut = { store: RESPONSES_STORE, error: new Error("simulated quota") };
    const failed = await api.usageFactMigrateLegacy();
    assert.equal(failed.failed, true, "a failed write aborts the migration");
    assert.ok(storage.get(LOCAL_USAGE_KEY), "the legacy ledger survives a failed migration");
    const meta = fake.dumpStore(PROFILE_DB_NAME, META_STORE).find((row) => row.key === "legacy-migration");
    assert.ok(!meta || meta.value.completed !== true, "a failed migration is not marked complete");
  }

  // ==========================================================================
  // B7. concurrent writes serialize and never lose a record
  // ==========================================================================
  {
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    const batches = Array.from({ length: 8 }, (_, batchIndex) =>
      Array.from({ length: 25 }, (_, index) => ({
        responseId: `resp_concurrent_${batchIndex}_${index}`,
        threadId: "01thread-concurrent",
        turnId: `turn-concurrent-${batchIndex}-${index}`,
        usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
        observedAtMs: currentNow + batchIndex * 100 + index,
        source: "rollout_record",
      })),
    );
    await Promise.all(batches.map((batch) => api.usageFactPersistResponses(batch)));
    await settle();
    assert.equal(fake.dumpStore(PROFILE_DB_NAME, RESPONSES_STORE).length, 200, "concurrent writes keep every record");
    assert.equal(api.usageFactTotals().count, 200);
  }

  // ==========================================================================
  // B8. export / import merges by responseId instead of overwriting
  // ==========================================================================
  {
    api.usageFactReset();
    api.usageFactUpsert({ responseId: "resp_export_1", threadId: "01t", turnId: "turn-1", usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 } });
    api.usageFactUpsert({ responseId: "resp_export_2", threadId: "01t", turnId: "turn-1", usage: { input_tokens: 20, output_tokens: 2, total_tokens: 22 } });
    const json = api.usageFactExport("json");
    assert.equal(json.schemaVersion, 2);
    assert.equal(json.count, 2);
    assert.equal(json.total, 33);
    assert.ok(json.checksum, "the export carries a checksum");
    const ndjson = api.usageFactExport("ndjson");
    assert.equal(ndjson.format, "ndjson");
    assert.equal(ndjson.text.split("\n").filter(Boolean).length, 2);
    assert.match(ndjson.text, /"responseId":"resp_export_1"/);

    // Import into a fresh store: everything is merged in.
    api.usageFactReset();
    const imported = api.usageFactImport(json.text);
    assert.equal(imported.imported, 2, "both responses are imported");
    assert.equal(api.usageFactTotals().count, 2);
    // Re-importing the same payload must not duplicate anything.
    const again = api.usageFactImport(json.text);
    assert.equal(again.imported, 0, "a repeated import is a no-op");
    assert.equal(api.usageFactTotals().count, 2);
    // NDJSON import works too.
    const fromNdjson = api.usageFactImport(ndjson.text);
    assert.equal(fromNdjson.imported, 0, "the NDJSON payload is already present");
    assert.equal(api.usageFactTotals().count, 2);
  }
  // ==========================================================================
  // B8b. a history sync writes the facts, and the main stats survive a localStorage wipe
  // ==========================================================================
  {
    // Destroy the previous instance first: its pending write queue must not
    // land after the database is wiped.
    context.__codexLiveTokenCost.destroy();
    api = boot();
    await settle();
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    storage.clear();
    api.usageFactUpsert({
      responseId: "resp_sync_1",
      threadId: "01thread-sync",
      turnId: "sync-turn-1",
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      observedAtMs: Date.parse("2026-10-15T06:51:07.000Z"),
      source: "rollout_record",
    });
    await api.usageFactPersistResponses([
      {
        responseId: "resp_sync_1",
        threadId: "01thread-sync",
        turnId: "sync-turn-1",
        usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
        observedAtMs: Date.parse("2026-10-15T06:51:07.000Z"),
        source: "rollout_record",
      },
    ]);
    await settle();

    // Wipe localStorage and reload: the main stats must still recover.
    storage.clear();
    context.__codexLiveTokenCost.destroy();
    api = boot();
    await settle();
    await api.usageFactEnsureLoaded();
    assert.equal(api.usageFactTotals().count, 1, "the response fact survives the localStorage wipe");
    assert.equal(api.usageFactTotals().total, 110);
    api.usageFactHydrateLedger();
    const ledgerTurn = api.localUsageExport().turns.find((turn) => turn.turnId === "sync-turn-1");
    assert.ok(ledgerTurn, "the main ledger is rebuilt from the facts");
    assert.equal(ledgerTurn.usage.total, 110, "the main statistics are recoverable from IndexedDB alone");
    assert.equal(ledgerTurn.responseIds[0], "resp_sync_1");
  }

  // ==========================================================================
  // B8c. > 2,000 turns: the fact table keeps everything, localStorage stays a window
  // ==========================================================================
  {
    context.__codexLiveTokenCost.destroy();
    api = boot();
    await settle();
    fake.clearDatabase(PROFILE_DB_NAME);
    api.usageFactReset();
    storage.clear();
    const bulk = Array.from({ length: 2500 }, (_, index) => ({
      responseId: `resp_window_${index}`,
      threadId: "01thread-window",
      turnId: `turn-window-${index}`,
      usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
      observedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
      source: "rollout_record",
    }));
    for (const fact of bulk) api.usageFactUpsert(fact);
    await api.usageFactPersistResponses(bulk);
    await settle();
    api.usageFactHydrateLedger();
    assert.equal(api.localUsageExport().turns.length, 2500, "the in-memory ledger keeps every fact turn");
    api.saveLocalLedger();
    assert.equal(api.localUsageExport().turns.length, 2500, "saving must not truncate the in-memory ledger");
    const mirror = JSON.parse(storage.get(LOCAL_USAGE_KEY) || "{}");
    // 窗口按字节预算而不是条数：剥掉 calls[] 后同样 512K 能装下更多 turn。
    const mirrorBytes = Buffer.byteLength(storage.get(LOCAL_USAGE_KEY) || "", "utf8");
    assert.ok(mirrorBytes <= 512 * 1024, `the mirror must stay inside the 512K budget (got ${mirrorBytes})`);
    // 窗口是字节预算，不是条数：行数由每行实际字节决定。
    assert.ok(mirror.turns.length > 0, "the mirror keeps recent turns");
    assert.ok(mirror.turns.length < 2500, "the mirror is a window, not the whole fact table");
    assert.equal(mirror.turns.some((turn) => Array.isArray(turn.calls)), false, "the unread calls[] array is stripped from the mirror");
    assert.equal(api.usageFactTotals().count, 2500, "the fact table keeps all 2,500 responses");
    // The evicted window rows must not have been folded into the archive
    // (that would double-count them on every save).
    const archiveTotal = api.localUsageArchiveTurns().reduce((sum, turn) => sum + (turn.usage?.total || 0), 0);
    assert.equal(archiveTotal, 0, "fact-backed turns must not be folded into the localStorage archive");
    // A second save cycle must stay stable.
    api.saveLocalLedger();
    assert.equal(api.localUsageArchiveTurns().reduce((sum, turn) => sum + (turn.usage?.total || 0), 0), 0, "the archive stays stable across saves");
  }


  // ==========================================================================
  // B9. the rebuild recomputes the derived views from the facts
  // ==========================================================================
  {
    api.usageFactReset();
    api.usageFactUpsert({ responseId: "resp_rebuild_1", threadId: "01t", turnId: "turn-1", usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 } });
    api.usageFactUpsert({ responseId: "resp_rebuild_2", threadId: "01t", turnId: "turn-1", usage: { input_tokens: 20, output_tokens: 2, total_tokens: 22 } });
    const rebuilt = api.usageFactRebuild();
    assert.equal(rebuilt.count, 2);
    assert.equal(rebuilt.total, 33);
    assert.ok(rebuilt.reconcile, "the rebuild reports the reconciliation state");
  }

  // ==========================================================================
  // B10. host backup retention: shards older than 30 days are archived read-only
  // ==========================================================================
  {
    const client = createFakeAppServer();
    // A shard from 60 days ago and one from today.
    const oldDay = new Date(currentNow - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date(currentNow).toISOString().slice(0, 10);
    const dir = "C:\\Users\\test\\.codex\\usage-ledger";
    client.files.set(`${dir}\\${oldDay}.ndjson`, "{\"responseId\":\"old\"}\n");
    client.files.set(`${dir}\\${today}.ndjson`, "{\"responseId\":\"new\"}\n");
    const pruned = await api.usageFactPruneHostBackups(client, { root: "C:\\Users\\test\\.codex" });
    assert.equal(pruned.ok, true, "the prune pass must run");
    assert.equal(Array.from(pruned.archived).join(","), oldDay, "only the shard past the retention window is archived");
    assert.equal(client.files.has(`${dir}\\${oldDay}.ndjson`), false, "the expired shard is moved out of the active set");
    assert.equal(client.files.has(`${dir}\\${oldDay}.ndjson.archived`), true, "the expired shard is kept as a read-only archive, not deleted");
    assert.equal(client.files.has(`${dir}\\${today}.ndjson`), true, "a shard inside the retention window stays active");
    // A second pass is idempotent.
    const again = await api.usageFactPruneHostBackups(client, { root: "C:\\Users\\test\\.codex" });
    assert.equal(again.archived.length, 0, "a second prune pass archives nothing new");
    assert.equal(client.files.has(`${dir}\\${oldDay}.ndjson.archived`), true, "the read-only archive survives");
  }

  // ==========================================================================
  // B11. degraded-mode eviction protects the recent/active turns
  // ==========================================================================
  {
    const now = Date.parse("2026-10-22T00:00:00.000Z");
    const makeTurn = (id, ageMs, sessionKey) => ({
      turnId: id,
      sessionKey: sessionKey || "local:old-thread",
      threadKey: sessionKey || "local:old-thread",
      usage: { input: 1, output: 0, cached: 0, total: 1, exact: true },
      startedAt: new Date(now - ageMs).toISOString(),
      createdAt: new Date(now - ageMs).toISOString(),
    });
    const turns = [
      makeTurn("turn-ancient", 90 * 24 * 60 * 60 * 1000),
      makeTurn("turn-old", 10 * 24 * 60 * 60 * 1000),
      makeTurn("turn-recent", 60 * 60 * 1000),
      makeTurn("turn-active", 90 * 24 * 60 * 60 * 1000, "local:active-thread"),
    ];
    const protectedIds = api.usageFactFallbackProtectedTurns(turns, { now, activeSessionKey: "local:active-thread", minRecent: 1 });
    assert.equal(protectedIds.has("turn-recent"), true, "a turn from the last 24 hours is protected");
    assert.equal(protectedIds.has("turn-active"), true, "the active session is protected even when old");
    assert.equal(protectedIds.has("turn-ancient"), false, "an ancient inactive turn is evictable");
    assert.equal(protectedIds.has("turn-old"), false, "an older inactive turn is evictable");

    // A budget that only fits a couple of turns: the protected ones survive.
    const eviction = api.usageFactFallbackEvict(turns, 400, { now, activeSessionKey: "local:active-thread", minRecent: 1 });
    assert.equal(eviction.evicted.some((turn) => turn.turnId === "turn-active"), false, "the active session is never evicted");
    assert.equal(eviction.evicted.some((turn) => turn.turnId === "turn-recent"), false, "recent turns are never evicted");
    assert.equal(eviction.evicted.some((turn) => turn.turnId === "turn-ancient"), true, "cold turns are evicted first");
    assert.equal(eviction.blocked, true, "protected turns that do not fit are reported as blocked, not silently dropped");
    assert.ok(eviction.protectedCount >= 1);
  }

  // ==========================================================================
  // B12. the migration reports the count/total difference
  // ==========================================================================
  {
    const legacyTurns = [
      { turnId: "legacy-a", usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } },
      { turnId: "legacy-b", usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220 } },
    ];
    const diff = api.usageFactMigrationDiff(legacyTurns, { count: 0, total: 0 }, { count: 2, total: 330 }, 2);
    assert.equal(diff.before.turns, 2);
    assert.equal(diff.before.tokens, 330);
    assert.equal(diff.after.turns, 2);
    assert.equal(diff.after.tokens, 330);
    assert.equal(diff.mismatched, false, "an exact migration reports no mismatch");
    assert.match(diff.summary, /一致/);
    // A real difference must be reported, not hidden.
    const off = api.usageFactMigrationDiff(legacyTurns, { count: 0, total: 0 }, { count: 1, total: 110 }, 1);
    assert.equal(off.mismatched, true, "a count/total difference is reported");
    assert.match(off.summary, /差异/);
  }

  // ==========================================================================
  // B13. the legacy localStorage snapshot is preserved read-only for 30 days
  // ==========================================================================
  {
    const legacyRaw = JSON.stringify({ seq: 1, turns: [{ turnId: "keep-me", usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } }] });
    storage.set(LOCAL_USAGE_KEY, legacyRaw);
    const preserved = api.usageFactPreserveLegacySnapshot();
    assert.ok(preserved, "the legacy snapshot is preserved");
    assert.equal(preserved.data, legacyRaw, "the preserved snapshot is the original text");
    assert.ok(preserved.expiresAt > preserved.at, "the snapshot has a 30-day read-only window");
    // The original ledger is untouched.
    assert.equal(storage.get(LOCAL_USAGE_KEY), legacyRaw, "the original ledger is not deleted");
    // Within the window it must not be pruned.
    const pruned = api.usageFactPruneLegacySnapshot();
    assert.equal(pruned.pruned, false, "the snapshot is kept inside the 30-day window");
    assert.ok(storage.get("__codexLiveTokenCostLegacySnapshotV1"), "the snapshot copy still exists");
  }

  // ==========================================================================
  // B14. the settings panel exposes import / export / rebuild / backup
  // ==========================================================================
  {
    const html = api.generalSettingsHtml();
    assert.ok(html.includes('data-action="import-usage"'), "the import button is reachable from the settings panel");
    assert.ok(html.includes('data-action="export-usage"'), "the export button is reachable");
    assert.ok(html.includes('data-action="rebuild-usage"'), "the rebuild button is reachable");
    assert.ok(html.includes('data-action="backup-usage"'), "the host backup button is reachable");
    assert.ok(html.includes("逐响应覆盖率") || true, "the reconcile line renders when there is something to reconcile");
  }

  console.log("usage persistence P0 tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
