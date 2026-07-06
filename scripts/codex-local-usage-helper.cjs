#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const DEFAULT_PORT = 17888;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DB_PATH = path.join(os.homedir(), ".codex", "codex-live-token-cost-helper.json");
const DEFAULT_CC_SWITCH_DB_PATH = path.join(os.homedir(), ".cc-switch", "cc-switch.db");
const SESSION_LIMIT = 80;
const CACHE_TTL_MS = 60000;
const skillPathPatternCache = new WeakMap();

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

function walkFiles(root, predicate, out = []) {
  if (!root || !fs.existsSync(root)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (!predicate || predicate(full, entry)) out.push(full);
  }
  return out;
}

function readInstalledPlugins(codexHome) {
  const root = path.join(codexHome, "plugins", "cache");
  const files = walkFiles(root, (file) => path.basename(file) === "plugin.json");
  const byId = new Map();
  for (const file of files) {
    const data = safeJsonParse(readFileText(file));
    const id = normalizeText(data?.name || path.basename(path.dirname(path.dirname(file))), 80).toLowerCase();
    if (!id || byId.has(id)) continue;
    const name = normalizeText(data?.interface?.displayName || data?.displayName || data?.name || id, 80);
    byId.set(id, { id, name });
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function frontmatterName(text) {
  const match = String(text || "").match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  const body = match ? match[1] : String(text || "");
  const name = body.match(/(?:^|\n)name:\s*["']?([^"'\r\n]+)["']?/);
  return normalizeText(name?.[1], 100);
}

function readInstalledSkills(codexHome) {
  const roots = [
    path.join(codexHome, "skills"),
    path.join(os.homedir(), ".skills-manager", "skills"),
    path.join(os.homedir(), ".agents", "skills"),
  ];
  const byId = new Map();
  for (const root of roots) {
    const files = walkFiles(root, (file) => path.basename(file).toLowerCase() === "skill.md");
    for (const file of files) {
      const dirName = normalizeText(path.basename(path.dirname(file)), 100);
      const name = frontmatterName(readFileText(file)) || dirName;
      const id = normalizeText(name || dirName, 100);
      if (id && !byId.has(id.toLowerCase())) byId.set(id.toLowerCase(), { id, name: id, file });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function latestSessionFiles(codexHome, limit = SESSION_LIMIT) {
  const root = path.join(codexHome, "sessions");
  return walkFiles(root, (file) => file.endsWith(".jsonl"))
    .map((file) => {
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(file).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { file, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((item) => item.file);
}

function invocationKey(item) {
  return [item.type, item.plugin_id || "", item.plugin_name || "", item.skill_id || "", item.skill_name || ""].join("\u0001");
}

function addInvocation(counts, item) {
  const key = invocationKey(item);
  const current = counts.get(key) || { ...item, usage_count: 0 };
  current.usage_count += 1;
  counts.set(key, current);
}

function extractCommandText(payload) {
  const pieces = [];
  for (const key of ["arguments", "input"]) {
    const value = payload?.[key];
    if (typeof value === "string") pieces.push(value);
    else if (value && typeof value === "object") pieces.push(JSON.stringify(value));
  }
  return pieces.join("\n");
}

function detectSkillFromText(text, skills) {
  const haystack = String(text || "").replace(/\\\\/g, "\\").replace(/\//g, "\\");
  for (const skill of skills) {
    const pathPattern = skillPathPattern(skill);
    if (pathPattern?.test(haystack)) {
      return { type: "skill", skill_id: skill.id, skill_name: skill.name };
    }
  }
  return null;
}

function skillPathPattern(skill) {
  if (!skill || typeof skill !== "object") return null;
  const cached = skillPathPatternCache.get(skill);
  if (cached) return cached;
  const id = normalizeText(skill.id, 160).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!id) return null;
  const pattern = new RegExp(`[\\\\/]skills[\\\\/]${id}[\\\\/]SKILL\\.md`, "i");
  skillPathPatternCache.set(skill, pattern);
  return pattern;
}

function detectPluginFromToolName(name, plugins) {
  const text = normalizeText(name, 160);
  if (!text) return null;
  const mcpMatch = text.match(/^mcp__([^_]+)__/) || text.match(/^mcp[.:/-]([^.:/-]+)[.:/-]/i);
  const id = normalizeText(mcpMatch?.[1], 80).replace(/^\$+/, "").toLowerCase();
  if (!id) return null;
  const plugin = plugins instanceof Map ? plugins.get(id) : plugins.find((item) => item.id.toLowerCase() === id);
  return { type: "plugin", plugin_id: id, plugin_name: plugin?.name || id };
}

function collectInvocationsFromSession(file, skills, plugins, counts) {
  const lines = readFileText(file).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const item = safeJsonParse(line);
    const payload = item?.payload;
    if (!payload || typeof payload !== "object") continue;
    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      const plugin = detectPluginFromToolName(payload.name, plugins);
      if (plugin) addInvocation(counts, plugin);
      const commandText = extractCommandText(payload);
      const skill = commandText ? detectSkillFromText(commandText, skills) : null;
      if (skill) addInvocation(counts, skill);
    }
  }
}

function latestCodexStateDb(codexHome) {
  const files = walkFiles(codexHome, (file, entry) => entry.name && /^state_\d+\.sqlite$/i.test(entry.name));
  return files
    .map((file) => {
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(file).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { file, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.file.localeCompare(a.file))[0]?.file || "";
}

function countSessionIndexThreads(codexHome) {
  const file = path.join(codexHome, "session_index.jsonl");
  const ids = new Set();
  for (const line of readFileText(file).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = safeJsonParse(line);
    const id = normalizeText(item?.id, 120);
    if (id) ids.add(id);
  }
  return ids.size;
}

function collectCodexThreadStats(options = {}) {
  const codexHome = options.codexHome || path.join(os.homedir(), ".codex");
  const dbPath = options.codexStateDbPath || latestCodexStateDb(codexHome);
  const sessionIndexCount = countSessionIndexThreads(codexHome);
  if (!dbPath || !fs.existsSync(dbPath)) {
    return {
      total_threads: sessionIndexCount,
      source: sessionIndexCount ? "session_index" : "missing",
      db_path: dbPath || "",
      session_index_threads: sessionIndexCount,
    };
  }
  const script = String.raw`
import json, sqlite3, sys
db = sys.argv[1]
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
cur = con.cursor()
def table_exists(name):
    return cur.execute("select 1 from sqlite_master where type = 'table' and name = ?", (name,)).fetchone() is not None

if not table_exists("threads"):
    print(json.dumps({"error": "missing_threads_table"}))
    con.close()
    raise SystemExit(0)

total_records = int(cur.execute("select count(*) as n from threads").fetchone()["n"] or 0)
archived_records = 0
subagent_threads = 0
visible_threads = total_records
if table_exists("thread_spawn_edges"):
    subagent_threads = int(cur.execute("select count(*) as n from threads where id in (select child_thread_id from thread_spawn_edges)").fetchone()["n"] or 0)
    visible_threads = int(cur.execute("select count(*) as n from threads where id not in (select child_thread_id from thread_spawn_edges)").fetchone()["n"] or 0)
try:
    archived_records = int(cur.execute("select count(*) as n from threads where archived = 1").fetchone()["n"] or 0)
except Exception:
    archived_records = 0
print(json.dumps({
    "total_threads": visible_threads,
    "total_thread_records": total_records,
    "subagent_threads": subagent_threads,
    "archived_thread_records": archived_records,
}, ensure_ascii=False))
con.close()
`;
  const result = spawnSync(pythonExecutable(), ["-", dbPath], {
    input: script,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    return {
      total_threads: sessionIndexCount,
      source: sessionIndexCount ? "session_index" : "sqlite_error",
      db_path: dbPath,
      session_index_threads: sessionIndexCount,
      error: normalizeText(result.stderr || result.error?.message || "python_sqlite_failed", 500),
    };
  }
  const parsed = safeJsonParse(result.stdout, {});
  const totalThreads = Number.isFinite(Number(parsed.total_threads)) && Number(parsed.total_threads) >= 0 ? Math.round(Number(parsed.total_threads)) : sessionIndexCount;
  return {
    total_threads: totalThreads,
    source: parsed.error ? (sessionIndexCount ? "session_index" : "sqlite_error") : "sqlite",
    db_path: dbPath,
    session_index_threads: sessionIndexCount,
    total_thread_records: Number(parsed.total_thread_records) || 0,
    subagent_threads: Number(parsed.subagent_threads) || 0,
    archived_thread_records: Number(parsed.archived_thread_records) || 0,
    ...(parsed.error ? { error: normalizeText(parsed.error, 200) } : {}),
  };
}

function readDb(dbPath) {
  const data = safeJsonParse(readFileText(dbPath));
  return data && typeof data === "object" ? data : {};
}

function writeDb(dbPath, payload) {
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(payload, null, 2));
  } catch {
    // API still returns live stats if DB write fails.
  }
}

function collectStatsWorkerArgs(options = {}, dbPath = DEFAULT_DB_PATH) {
  const args = [__filename, "--once", "--db", dbPath];
  if (options.codexHome) args.push("--codex-home", options.codexHome);
  if (options.ccSwitchDbPath) args.push("--cc-switch-db", options.ccSwitchDbPath);
  if (options.codexStateDbPath) args.push("--codex-state-db", options.codexStateDbPath);
  if (options.sessionLimit) args.push("--session-limit", String(options.sessionLimit));
  return args;
}

function collectStatsInWorker(options = {}, dbPath = DEFAULT_DB_PATH, callback = () => {}) {
  const child = spawn(process.execPath, collectStatsWorkerArgs(options, dbPath), {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.on("error", (error) => {
    callback(error);
  });
  child.on("close", (code) => {
    if (code !== 0) {
      callback(new Error(normalizeText(stderr || `worker exited with code ${code}`, 500)));
      return;
    }
    const parsed = safeJsonParse(stdout);
    if (!parsed?.ok) {
      callback(new Error(normalizeText(parsed?.error || stderr || "worker returned invalid stats", 500)));
      return;
    }
    callback(null, parsed);
  });
  return child;
}

function collectStats(options = {}) {
  const codexHome = options.codexHome || path.join(os.homedir(), ".codex");
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const now = options.now instanceof Date ? options.now : new Date();
  const plugins = readInstalledPlugins(codexHome);
  const skills = readInstalledSkills(codexHome);
  const pluginById = new Map(plugins.map((plugin) => [plugin.id.toLowerCase(), plugin]));
  const counts = new Map();
  const files = latestSessionFiles(codexHome, options.sessionLimit || SESSION_LIMIT);
  for (const file of files) collectInvocationsFromSession(file, skills, pluginById, counts);
  const invocations = Array.from(counts.values()).sort((a, b) => b.usage_count - a.usage_count || invocationKey(a).localeCompare(invocationKey(b)));
  const skillInvocations = invocations.filter((item) => item.type === "skill");
  const uniqueSkillIds = new Set(skillInvocations.map((item) => item.skill_id || item.skill_name).filter(Boolean));
  const pluginInvocations = invocations.filter((item) => item.type === "plugin");
  const uniquePluginIds = new Set(pluginInvocations.map((item) => item.plugin_id || item.plugin_name).filter(Boolean));
  const codexThreads = collectCodexThreadStats({ ...options, codexHome });
  const payload = {
    ok: true,
    source: "codex-local-usage-helper",
    updated_at: now.toISOString(),
    codex_home: codexHome,
    db_path: dbPath,
    stats: {
      unique_skills_used: uniqueSkillIds.size,
      total_skills_used: skillInvocations.reduce((sum, item) => sum + item.usage_count, 0),
      unique_plugins_used: uniquePluginIds.size,
      total_plugins_used: pluginInvocations.reduce((sum, item) => sum + item.usage_count, 0),
      top_invocations: invocations.slice(0, 5),
      top_plugins: pluginInvocations.slice(0, 5),
      installed_plugins: plugins,
      installed_plugins_count: plugins.length,
      installed_skills_count: skills.length,
      scanned_session_files: files.length,
      total_threads: codexThreads.total_threads,
      codex_threads: codexThreads,
    },
  };
  writeDb(dbPath, payload);
  return payload;
}

function pythonExecutable() {
  return process.env.PYTHON || "python";
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
      coalesce(nullif(model, ''), nullif(request_model, ''), 'unknown') as model,
      coalesce(request_model, '') as request_model,
      coalesce(pricing_model, '') as pricing_model,
      sum(coalesce(request_count, success_count, 0)) as request_count,
      sum(coalesce(input_tokens, 0)) as input_tokens,
      sum(coalesce(output_tokens, 0)) as output_tokens,
      sum(coalesce(cache_read_tokens, 0) + coalesce(cache_creation_tokens, 0)) as cached_tokens,
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
      coalesce(nullif(model, ''), nullif(request_model, ''), 'unknown') as model,
      coalesce(request_model, '') as request_model,
      coalesce(pricing_model, '') as pricing_model,
      count(*) as request_count,
      sum(coalesce(input_tokens, 0)) as input_tokens,
      sum(coalesce(output_tokens, 0)) as output_tokens,
      sum(coalesce(cache_read_tokens, 0) + coalesce(cache_creation_tokens, 0)) as cached_tokens,
      sum(cast(coalesce(total_cost_usd, '0') as real)) as total_cost_usd,
      max(coalesce(duration_ms, latency_ms, 0)) as duration_ms
    from proxy_request_logs
    where
      (app_type = 'codex' or data_source = 'codex_session' or provider_id = '_codex_session' or provider_type = 'codex_session')
      and coalesce(status_code, 0) between 200 and 299
      and (? is null or date(created_at, 'unixepoch') > ?)
    group by day, model, request_model, pricing_model
    order by day, model, request_model, pricing_model
    """, (rollup_max_date, rollup_max_date)).fetchall()

for row in list(rollup_rows) + list(proxy_rows):
    day = row["day"] or "1970-01-01"
    model = row["model"] or "unknown"
    request_model = row["request_model"] or ""
    pricing_model = row["pricing_model"] or ""
    input_tokens = int(row["input_tokens"] or 0)
    output_tokens = int(row["output_tokens"] or 0)
    cached_tokens = int(row["cached_tokens"] or 0)
    total = input_tokens + output_tokens
    if total <= 0:
        continue
    key = ":".join([day, model, request_model, pricing_model])
    turns.append({
        "turnId": "cc-switch:" + key,
        "source": "cc-switch",
        "importSource": "cc-switch",
        "model": model,
        "request_model": request_model,
        "pricing_model": pricing_model,
        "createdAt": day + "T12:00:00.000Z",
        "callCount": int(row["request_count"] or 0),
        "usage": {
            "input": input_tokens,
            "output": output_tokens,
            "cached": cached_tokens,
            "total": total,
        },
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

function sendJson(res, status, body) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
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
  let cached = readDb(dbPath);
  let cachedAt = cached?.updated_at ? Date.parse(cached.updated_at) : 0;
  let refreshing = false;
  const refresh = () => {
    if (refreshing) return;
    refreshing = true;
    collectStatsInWorker(options, dbPath, (error, payload) => {
      if (payload) {
        cached = payload;
        cachedAt = Date.now();
      } else if (error) {
        cached = { ok: false, source: "codex-local-usage-helper", error: error?.message || String(error), updated_at: new Date().toISOString() };
        cachedAt = Date.now();
      }
      refreshing = false;
    });
  };
  if (!cached?.ok) refresh();
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (url.pathname === "/health") {
      sendJson(res, 200, { ok: true, source: "codex-local-usage-helper" });
      return;
    }
    if (url.pathname === "/stats") {
      const forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
      if (forceRefresh) {
        refresh();
        sendJson(res, cached?.ok ? 200 : 202, { ...(cached?.ok ? cached : { ok: false, source: "codex-local-usage-helper" }), refreshing });
        return;
      }
      const stale = !cached?.ok || Date.now() - cachedAt > CACHE_TTL_MS;
      if (stale) refresh();
      sendJson(res, cached?.ok ? 200 : 202, { ...(cached?.ok ? cached : { ok: false, source: "codex-local-usage-helper" }), refreshing });
      return;
    }
    if (url.pathname === "/cc-switch/turns") {
      sendJson(res, 200, collectCcSwitchTurns(options));
      return;
    }
    sendJson(res, 404, { ok: false, error: "not_found" });
  });
  server.listen(port, host, () => {
    console.log(`codex-local-usage-helper listening on http://${host}:${port}`);
  });
  return server;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--host") options.host = argv[++i];
    else if (arg === "--codex-home") options.codexHome = argv[++i];
    else if (arg === "--db") options.dbPath = argv[++i];
    else if (arg === "--cc-switch-db") options.ccSwitchDbPath = argv[++i];
    else if (arg === "--codex-state-db") options.codexStateDbPath = argv[++i];
    else if (arg === "--session-limit") options.sessionLimit = Number(argv[++i]);
    else if (arg === "--once") options.once = true;
    else if (arg === "--serve") options.serve = true;
  }
  return options;
}

module.exports = {
  collectStats,
  collectStatsInWorker,
  startServer,
  readInstalledPlugins,
  readInstalledSkills,
  latestSessionFiles,
  detectSkillFromText,
  detectPluginFromToolName,
  collectCcSwitchTurns,
};

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.once) {
    console.log(JSON.stringify(collectStats(options), null, 2));
  } else {
    startServer(options);
  }
}
