const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const helper = require("../scripts/codex-local-usage-helper.cjs");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function requestJson(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname, timeout: 5000, headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
  });
}

async function waitForTurnCount(port, count) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await requestJson(port, "/cc-switch/turns");
    if (response.body.turns?.length === count && response.body.refreshing === false) return response;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return requestJson(port, "/cc-switch/turns");
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cltc-helper-test-"));
  try {
    const ccSwitchDb = path.join(root, "cc-switch.db");
    const createDb = spawnSync("python", ["-", ccSwitchDb], {
      input: String.raw`
import sqlite3, sys
db=sys.argv[1]
con=sqlite3.connect(db)
cur=con.cursor()
cur.execute("""create table proxy_request_logs (
  request_id text primary key,
  provider_id text not null,
  app_type text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  total_cost_usd text not null default '0',
  latency_ms integer not null,
  duration_ms integer,
  status_code integer not null,
  session_id text,
  provider_type text,
  created_at integer not null,
  request_model text,
  data_source text not null default 'proxy',
  pricing_model text
)""")
cur.execute("""create table usage_daily_rollups (
  date text not null,
  app_type text,
  provider_id text,
  model text,
  request_model text,
  pricing_model text,
  request_count integer,
  success_count integer,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_creation_tokens integer,
  total_cost_usd text
)""")
cur.execute("insert into usage_daily_rollups values (?,?,?,?,?,?,?,?,?,?,?,?,?)", ('2026-07-03','codex','_codex_session','gpt-5.5','gpt-5.5','',4,4,1000,100,500,0,'10'))
rows=[
 ('r1','_codex_session','codex','gpt-5.5',100,20,40,0,'1.5',0,0,200,'s1','codex_session',1783152000,'gpt-5.5','codex_session',''),
 ('r2','_codex_session','codex','gpt-5.5',50,10,20,0,'0.5',0,0,200,'s1','codex_session',1783153800,'gpt-5.5','codex_session',''),
 ('other','other','gemini','gemini',999,999,0,0,'9',0,0,200,'s2','proxy',1783153800,'gemini','proxy',''),
]
cur.executemany("insert into proxy_request_logs values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
con.commit()
con.close()
`,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(createDb.status, 0, createDb.stderr);

    const ccSwitch = helper.collectCcSwitchTurns({ ccSwitchDbPath: ccSwitchDb });
    assert.equal(ccSwitch.ok, true);
    assert.equal(ccSwitch.imported, 2);
    assert.deepEqual(
      ccSwitch.turns.map((turn) => turn.turnId),
      [
        "cc-switch:2026-07-03:gpt-5.5:gpt-5.5:",
        "cc-switch:2026-07-04T08:00:00.000Z:gpt-5.5:gpt-5.5:",
      ],
    );
    assert.equal(ccSwitch.turns[0].callCount, 4);
    assert.deepEqual(ccSwitch.turns[0].usage, { input: 1000, output: 100, cached: 500, total: 1100 });
    assert.equal(ccSwitch.turns[1].callCount, 2);
    assert.deepEqual(ccSwitch.turns[1].usage, { input: 150, output: 30, cached: 60, total: 180 });
    assert.equal(ccSwitch.turns[1].costUsd, 2);
    assert.equal(ccSwitch.turns[1].durationMs, 0);
    assert.equal(ccSwitch.metadata.rollup_rows, 1);
    assert.equal(ccSwitch.metadata.proxy_rows, 1);
    assert.equal(ccSwitch.metadata.rollup_max_date, "2026-07-03");
    assert.equal(ccSwitch.turns.every((turn) => turn.source === "cc-switch" && turn.importSource === "cc-switch"), true);
    assert.equal(ccSwitch.turns.some((turn) => Object.hasOwn(turn, "prompt") || Object.hasOwn(turn, "sessionKey")), false);
    assert.equal(typeof helper.collectStats, "undefined");
    assert.equal(typeof helper.collectThreadContent, "undefined");

    const missing = helper.collectCcSwitchTurns({ ccSwitchDbPath: path.join(root, "missing.db") });
    assert.equal(missing.ok, true);
    assert.equal(missing.error, "missing_db");
    assert.deepEqual(missing.turns, []);
    assert.equal(helper.ccSwitchStatus({ ccSwitchDbPath: ccSwitchDb }).profile_authority, "userscript-profile-ledger");

    const serverDb = path.join(root, "helper-meta.json");
    const port = await freePort();
    let refreshCount = 0;
    const server = helper.startServer({
      ccSwitchDbPath: ccSwitchDb,
      dbPath: serverDb,
      port,
      ccSwitchRefreshDelayMs: 25,
      onCcSwitchRefresh() {
        refreshCount += 1;
      },
    });
    try {
      const stats = await requestJson(port, "/stats");
      assert.equal(stats.status, 200);
      assert.equal(stats.body.bridge, "cc-switch");
      assert.equal(stats.body.profile_authority, "userscript-profile-ledger");
      assert.equal(Object.hasOwn(stats.body, "stats"), false);
      assert.equal(Object.hasOwn(stats.body, "turns"), false);

      const blockedStats = await requestJson(port, "/stats", { Origin: "https://example.com" });
      assert.equal(blockedStats.status, 403);
      assert.equal(blockedStats.body.error, "forbidden_origin");
      const removedSessionEndpoint = await requestJson(port, "/codex/thread-content?threadId=thread-a");
      assert.equal(removedSessionEndpoint.status, 404);

      const first = await requestJson(port, "/cc-switch/turns?refresh=1");
      assert.equal(first.status, 202);
      assert.equal(first.body.refreshing, true);
      const concurrent = await Promise.all([
        requestJson(port, "/cc-switch/turns?refresh=1"),
        requestJson(port, "/cc-switch/turns?refresh=true"),
      ]);
      assert.equal(concurrent[0].body.refreshing, true);
      assert.equal(concurrent[1].body.refreshing, true);
      assert.equal(refreshCount, 1);
      const ready = await waitForTurnCount(port, 2);
      assert.equal(ready.status, 200);
      assert.equal(ready.body.turns.length, 2);
      assert.equal(ready.body.turns[1].durationSec, 0);
      assert.equal(Object.hasOwn(ready.body, "stats"), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    const missingDb = path.join(root, "missing-cc-switch.db");
    const missingPort = await freePort();
    const missingServer = helper.startServer({ ccSwitchDbPath: missingDb, dbPath: path.join(root, "missing-meta.json"), port: missingPort });
    try {
      const firstMissing = await requestJson(missingPort, "/cc-switch/turns?refresh=1");
      assert.equal(firstMissing.body.refreshing, true);
      const missingReady = await waitForTurnCount(missingPort, 0);
      assert.equal(missingReady.status, 200);
      assert.equal(missingReady.body.error, "missing_db");
      fs.copyFileSync(ccSwitchDb, missingDb);
      await requestJson(missingPort, "/cc-switch/turns?refresh=1");
      const recovered = await waitForTurnCount(missingPort, 2);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.body.turns.length, 2);
    } finally {
      await new Promise((resolve) => missingServer.close(resolve));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("codex-local-usage-helper tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
