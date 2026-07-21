#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_PORT = 17888;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DB_PATH = path.join(os.homedir(), ".codex", "codex-live-token-cost-helper.json");
const DEFAULT_CC_SWITCH_DB_PATH = path.join(os.homedir(), ".cc-switch", "cc-switch.db");
const CACHE_TTL_MS = 60000;
const CC_SWITCH_CACHE_TTL_MS = 60000;
const CC_SWITCH_ERROR_CACHE_TTL_MS = 5000;

function normalizeText(value, max = 120) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function readFileText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function writeJson(file, payload) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  } catch {
    // The bridge remains live when its optional metadata cache cannot be written.
  }
}

function readJson(file, fallback = {}) {
  const value = safeJsonParse(readFileText(file), fallback);
  return value && typeof value === "object" ? value : fallback;
}

function pythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const python = spawnSync("python", ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
    windowsHide: true,
  });
  return python.error || python.status !== 0 ? "python3" : "python";
}

function collectCcSwitchTurns(options = {}) {
  const dbPath = options.ccSwitchDbPath || DEFAULT_CC_SWITCH_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    return { ok: true, source: "cc-switch", db_path: dbPath, turns: [], imported: 0, skipped: 0, error: "missing_db" };
  }
  const script = String.raw`
import json, sqlite3, sys
db = sys.argv[1]
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
cur = con.cursor()
def table_exists(name):
    return cur.execute("select 1 from sqlite_master where type = 'table' and name = ?", (name,)).fetchone() is not None

turns = []
rollup_max_date = None
rollup_rows = []
proxy_rows = []

if table_exists("usage_daily_rollups"):
    rollup_rows = cur.execute("""
    select
      date as day,
      date || 'T12:00:00.000Z' as bucket_at,
      'day' as time_granularity,
      coalesce(nullif(model, ''), nullif(request_model, ''), 'unknown') as model,
      coalesce(request_model, '') as request_model,
      coalesce(pricing_model, '') as pricing_model,
      sum(coalesce(request_count, success_count, 0)) as request_count,
      sum(coalesce(input_tokens, 0)) as input_tokens,
      sum(coalesce(output_tokens, 0)) as output_tokens,
      sum(coalesce(cache_read_tokens, 0)) as cached_tokens,
      sum(coalesce(cache_creation_tokens, 0)) as cache_write_tokens,
      sum(cast(coalesce(total_cost_usd, '0') as real)) as total_cost_usd,
      0 as duration_ms
    from usage_daily_rollups
    where app_type = 'codex' or provider_id = '_codex_session'
    group by day, model, request_model, pricing_model
    order by day, model, request_model, pricing_model
    """).fetchall()
    max_row = cur.execute("""
      select max(date) as day
      from usage_daily_rollups
      where app_type = 'codex' or provider_id = '_codex_session'
    """).fetchone()
    rollup_max_date = max_row["day"] if max_row else None

if table_exists("proxy_request_logs"):
    proxy_rows = cur.execute("""
    select
      date(created_at, 'unixepoch') as day,
      strftime('%Y-%m-%dT%H:00:00.000Z', created_at, 'unixepoch') as bucket_at,
      'hour' as time_granularity,
      coalesce(nullif(model, ''), nullif(request_model, ''), 'unknown') as model,
      coalesce(request_model, '') as request_model,
      coalesce(pricing_model, '') as pricing_model,
      count(*) as request_count,
      sum(coalesce(input_tokens, 0)) as input_tokens,
      sum(coalesce(output_tokens, 0)) as output_tokens,
      sum(coalesce(cache_read_tokens, 0)) as cached_tokens,
      sum(coalesce(cache_creation_tokens, 0)) as cache_write_tokens,
      sum(cast(coalesce(total_cost_usd, '0') as real)) as total_cost_usd,
      max(coalesce(duration_ms, latency_ms, 0)) as duration_ms
    from proxy_request_logs
    where
      (app_type = 'codex' or data_source = 'codex_session' or provider_id = '_codex_session' or provider_type = 'codex_session')
      and coalesce(status_code, 0) between 200 and 299
      and (? is null or date(created_at, 'unixepoch') > ?)
    group by day, bucket_at, model, request_model, pricing_model
    order by bucket_at, model, request_model, pricing_model
    """, (rollup_max_date, rollup_max_date)).fetchall()

for row in list(rollup_rows) + list(proxy_rows):
    day = row["day"] or "1970-01-01"
    bucket_at = row["bucket_at"] or day + "T12:00:00.000Z"
    time_granularity = row["time_granularity"] or "day"
    model = row["model"] or "unknown"
    request_model = row["request_model"] or ""
    pricing_model = row["pricing_model"] or ""
    input_tokens = int(row["input_tokens"] or 0)
    output_tokens = int(row["output_tokens"] or 0)
    cached_tokens = int(row["cached_tokens"] or 0)
    cache_write_tokens = int(row["cache_write_tokens"] or 0)
    total = input_tokens + output_tokens
    if total <= 0:
        continue
    key = ":".join([day if time_granularity == "day" else bucket_at, model, request_model, pricing_model])
    usage = {
        "input": input_tokens,
        "output": output_tokens,
        "cached": cached_tokens,
        "total": total,
    }
    if cache_write_tokens > 0:
        usage["cacheWriteTokens"] = cache_write_tokens
    turns.append({
        "turnId": "cc-switch:" + key,
        "source": "cc-switch",
        "importSource": "cc-switch",
        "model": model,
        "request_model": request_model,
        "pricing_model": pricing_model,
        "createdAt": bucket_at,
        "timeGranularity": time_granularity,
        "cacheWriteAvailable": cache_write_tokens > 0,
        "callCount": int(row["request_count"] or 0),
        "usage": usage,
        "costUsd": float(row["total_cost_usd"] or 0),
        "durationMs": int(row["duration_ms"] or 0),
        "durationSec": int(round((row["duration_ms"] or 0) / 1000)),
    })
print(json.dumps({
    "turns": turns,
    "metadata": {
        "rollup_rows": len(rollup_rows),
        "proxy_rows": len(proxy_rows),
        "rollup_max_date": rollup_max_date,
    },
}, ensure_ascii=False))
con.close()
`;
  const result = spawnSync(pythonExecutable(), ["-", dbPath], {
    input: script,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      source: "cc-switch",
      db_path: dbPath,
      turns: [],
      imported: 0,
      skipped: 0,
      error: normalizeText(result.stderr || result.error?.message || "python_sqlite_failed", 500),
    };
  }
  const parsed = safeJsonParse(result.stdout, {});
  const turns = Array.isArray(parsed.turns) ? parsed.turns : [];
  const metadata = parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {};
  return {
    ok: true,
    source: "cc-switch",
    db_path: dbPath,
    turns,
    imported: turns.length,
    skipped: 0,
    metadata,
    updated_at: new Date().toISOString(),
  };
}

function ccSwitchStatus(options = {}) {
  const dbPath = options.ccSwitchDbPath || DEFAULT_CC_SWITCH_DB_PATH;
  return {
    ok: true,
    source: "codex-local-usage-helper",
    bridge: "cc-switch",
    db_path: dbPath,
    available: fs.existsSync(dbPath),
    profile_authority: "userscript-profile-ledger",
    profile_stats: "unsupported",
    updated_at: new Date().toISOString(),
  };
}

function isAllowedOrigin(origin) {
  const text = normalizeText(origin, 300);
  if (!text) return true;
  if (text === "null") return false;
  if (text === "app://-" || text.startsWith("app://-/")) return true;
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function corsOrigin(origin) {
  const text = normalizeText(origin, 300);
  return text && isAllowedOrigin(text) ? text : "*";
}

function sendJson(res, status, body, origin = "") {
  res.writeHead(status, {
    "access-control-allow-origin": corsOrigin(origin),
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function startServer(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  let cached = readJson(dbPath, null);
  let cachedAt = cached?.updated_at ? Date.parse(cached.updated_at) : 0;
  let ccSwitchCached = null;
  let ccSwitchCachedAt = 0;
  let ccSwitchRefreshing = false;
  const refreshCcSwitch = () => {
    if (ccSwitchRefreshing) return;
    ccSwitchRefreshing = true;
    if (typeof options.onCcSwitchRefresh === "function") options.onCcSwitchRefresh();
    setTimeout(() => {
      try {
        ccSwitchCached = collectCcSwitchTurns(options);
        ccSwitchCachedAt = Date.now();
        writeJson(dbPath, { ...ccSwitchStatus(options), cc_switch: ccSwitchCached });
      } catch (error) {
        ccSwitchCached = {
          ok: false,
          source: "cc-switch",
          db_path: options.ccSwitchDbPath || DEFAULT_CC_SWITCH_DB_PATH,
          turns: [],
          imported: 0,
          skipped: 0,
          error: normalizeText(error?.message || String(error), 500),
          updated_at: new Date().toISOString(),
        };
        ccSwitchCachedAt = Date.now();
      } finally {
        ccSwitchRefreshing = false;
      }
    }, Number(options.ccSwitchRefreshDelayMs || 0));
  };
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || "";
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const protectedPath = url.pathname === "/stats" || url.pathname === "/cc-switch/turns";
    if (protectedPath && !isAllowedOrigin(origin)) {
      sendJson(res, 403, { ok: false, error: "forbidden_origin" }, origin);
      return;
    }
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {}, origin);
      return;
    }
    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true, source: "codex-local-usage-helper", bridge: "cc-switch" }, origin);
      return;
    }
    if (url.pathname === "/stats") {
      const status = ccSwitchStatus(options);
      sendJson(res, 200, { ...status, cached: Boolean(cached?.cc_switch?.ok), refreshing: ccSwitchRefreshing }, origin);
      return;
    }
    if (url.pathname === "/cc-switch/turns") {
      const forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
      const cacheTtl = ccSwitchCached?.ok && !ccSwitchCached?.error ? CC_SWITCH_CACHE_TTL_MS : CC_SWITCH_ERROR_CACHE_TTL_MS;
      const stale = !ccSwitchCached || !ccSwitchCachedAt || Date.now() - ccSwitchCachedAt > cacheTtl;
      if (forceRefresh || stale) refreshCcSwitch();
      const payload = ccSwitchCached || {
        ok: true,
        source: "cc-switch",
        db_path: options.ccSwitchDbPath || DEFAULT_CC_SWITCH_DB_PATH,
        turns: [],
        imported: 0,
        skipped: 0,
      };
      sendJson(res, ccSwitchCached?.ok ? 200 : 202, { ...payload, refreshing: ccSwitchRefreshing }, origin);
      return;
    }
    sendJson(res, 404, { ok: false, error: "not_found" }, origin);
  });
  server.listen(port, host, () => {
    console.log(`codex-local-usage-helper listening on http://${host}:${port}`);
  });
  return server;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--host") options.host = argv[++i];
    else if (arg === "--db") options.dbPath = argv[++i];
    else if (arg === "--cc-switch-db") options.ccSwitchDbPath = argv[++i];
    else if (arg === "--serve") options.serve = true;
  }
  return options;
}

module.exports = {
  collectCcSwitchTurns,
  ccSwitchStatus,
  startServer,
};

if (require.main === module) startServer(parseArgs(process.argv.slice(2)));
