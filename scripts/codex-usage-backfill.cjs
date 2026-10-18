#!/usr/bin/env node
"use strict";

/*
 * codex-usage-backfill.cjs
 *
 * Scans local Codex rollout logs (per-request `token_count` events) and the
 * local Codex state DBs (coarse per-thread totals for threads whose rollout
 * files are gone) and exports a `usage-backfill.json` payload in the shape
 * accepted by the userscript's `importLocalUsageTurns` pipeline. Kept as the
 * Node-side reference for the in-page "历史数据同步" parser (file-based
 * settings-panel import has been removed).
 *
 * Read-only: never writes into Codex's own directories. The output file is
 * consumed by the userscript import (idempotent `replaceSource` upserts).
 *
 * Usage:
 *   node scripts/codex-usage-backfill.cjs [--out <file>] [--no-sqlite]
 *       [--no-archived] [--sessions <dir>] [--archived <dir>] [--quiet]
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const BACKFILL_SOURCE = "codex-usage-backfill";
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const USAGE_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_write_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

function asText(value, max = 400) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > max) return "";
  return text;
}

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function unixToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n < 10_000_000_000 ? n * 1000 : n);
}

function parseTimestampMs(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return Math.round(n < 10_000_000_000 ? n * 1000 : n);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoOrNull(ms) {
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

function localDayKey(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function parseArgs(argv) {
  const home = os.homedir();
  const options = {
    sessionsDir: path.join(home, ".codex", "sessions"),
    archivedDir: path.join(home, ".codex", "archived_sessions"),
    stateDbs: [path.join(home, ".codex", "state_5.sqlite"), path.join(home, ".codex", "sqlite", "state_5.sqlite")],
    out: path.join(__dirname, "..", "usage-backfill.json"),
    sqlite: true,
    archived: true,
    quiet: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") options.out = path.resolve(argv[++index] || options.out);
    else if (arg === "--sessions") options.sessionsDir = path.resolve(argv[++index] || options.sessionsDir);
    else if (arg === "--archived") options.archivedDir = path.resolve(argv[++index] || options.archivedDir);
    else if (arg === "--no-sqlite") options.sqlite = false;
    else if (arg === "--no-archived") options.archived = false;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: node scripts/codex-usage-backfill.cjs [--out <file>] [--no-sqlite] [--no-archived] [--sessions <dir>] [--archived <dir>] [--quiet]");
      process.exit(0);
    } else {
      console.warn(`ignoring unknown argument: ${arg}`);
    }
  }
  return options;
}

function walkRolloutFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRolloutFiles(full, out);
    else if (entry.isFile() && /\.(jsonl|jsonl\.zst|jsonl\.zstd)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function readRolloutLines(file) {
  const buffer = fs.readFileSync(file);
  const isZstd = buffer.length >= 4 && buffer.subarray(0, 4).equals(ZSTD_MAGIC);
  const text = (isZstd ? zlib.zstdDecompressSync(buffer) : buffer).toString("utf8");
  return text.split(/\r?\n/);
}

function rawUsageShape(info) {
  if (!info || typeof info !== "object") return null;
  const usage = {};
  let sum = 0;
  for (const field of USAGE_FIELDS) {
    const value = toPositiveInt(info[field]);
    if (value) usage[field] = value;
    sum += value;
  }
  return sum > 0 ? usage : null;
}

function sumRawUsage(target, usage) {
  for (const field of USAGE_FIELDS) target[field] = (target[field] || 0) + (usage[field] || 0);
  return target;
}

function collectStrings(node, out, depth = 0) {
  if (node == null || depth > 6) return out;
  if (typeof node === "string") {
    if (node.length <= 20000) out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) collectStrings(value, out, depth + 1);
  }
  return out;
}

function bumpSkill(record, name, count = 1) {
  const skill = asText(name, 120);
  if (!skill) return;
  record.skillCounts.set(skill, (record.skillCounts.get(skill) || 0) + count);
}

function bumpPlugin(record, server, count = 1) {
  const plugin = asText(server, 120).replace(/^\$+/, "");
  if (!plugin) return;
  record.pluginCounts.set(plugin, (record.pluginCounts.get(plugin) || 0) + count);
}

function collectSkillReads(text, record) {
  const matches = String(text || "").match(/[\\/]skills[\\/][^"'\r\n]{0,300}?SKILL\.md/gi);
  if (!matches) return;
  for (const match of matches) {
    const parts = match.split(/[\\/]+/).filter(Boolean);
    const name = parts[parts.length - 2];
    if (name && name.toLowerCase() !== "skill.md") bumpSkill(record, name);
  }
}

function collectToolInvocations(payload, record) {
  if (!record) return;
  const type = asText(payload?.type, 40);
  if (type === "function_call" || type === "custom_tool_call") {
    const name = asText(payload?.name, 120);
    const mcpMatch = /^mcp__([A-Za-z0-9_$.-]+?)__/.exec(name);
    if (mcpMatch) bumpPlugin(record, mcpMatch[1]);
    const strings = collectStrings(payload?.arguments ?? payload?.input ?? payload?.action, []);
    for (const text of strings) collectSkillReads(text, record);
  }
}

function createTurnRecord(turnId) {
  return {
    turnId,
    model: "",
    effort: "",
    startedAtMs: 0,
    finishedAtMs: 0,
    durationMs: 0,
    calls: [],
    skillCounts: new Map(),
    pluginCounts: new Map(),
  };
}

function scanRolloutLines(lines, fileSummary) {
  const thread = {
    threadId: "",
    turns: new Map(),
    orphanCalls: [],
    fallbackModel: "",
    fallbackEffort: "",
  };
  let lastTurnId = "";
  let lastTurn = null;
  const ensureTurn = (turnId) => {
    if (!turnId) return null;
    let record = thread.turns.get(turnId);
    if (!record) {
      record = createTurnRecord(turnId);
      thread.turns.set(turnId, record);
    }
    return record;
  };
  const attachCall = (call) => {
    const record = lastTurnId ? ensureTurn(lastTurnId) : null;
    if (record) record.calls.push(call);
    else thread.orphanCalls.push(call);
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      fileSummary.lineErrors += 1;
      continue;
    }
    const type = obj?.type;
    const payload = obj?.payload || {};
    if (type === "session_meta") {
      thread.threadId = thread.threadId || asText(payload.session_id || payload.id, 120);
      continue;
    }
    if (type === "turn_context") {
      const turnId = asText(payload.turn_id, 120) || lastTurnId;
      const record = ensureTurn(turnId);
      const model = asText(payload.model, 120);
      const effort = asText(payload.effort, 40);
      if (model) {
        thread.fallbackModel = model;
        if (record) record.model = record.model || model;
      }
      if (effort) {
        thread.fallbackEffort = effort;
        if (record) record.effort = record.effort || effort;
      }
      continue;
    }
    if (type === "event_msg") {
      const ptype = asText(payload.type, 60);
      if (ptype === "task_started") {
        const turnId = asText(payload.turn_id || payload.turn_attribution?.turn_id, 120);
        if (turnId) {
          lastTurnId = turnId;
          lastTurn = ensureTurn(turnId);
          const startedAtMs = unixToMs(payload.started_at);
          if (startedAtMs) lastTurn.startedAtMs = lastTurn.startedAtMs || startedAtMs;
        }
        continue;
      }
      if (ptype === "task_complete") {
        const turnId = asText(payload.turn_id || payload.root_turn_id, 120) || lastTurnId;
        const record = ensureTurn(turnId);
        if (record) {
          const durationMs = toPositiveInt(payload.duration_ms);
          if (durationMs) record.durationMs = Math.max(record.durationMs, durationMs);
          const finishedAtMs = unixToMs(payload.completed_at);
          if (finishedAtMs) record.finishedAtMs = Math.max(record.finishedAtMs, finishedAtMs);
          const startedAtMs = unixToMs(payload.started_at);
          if (startedAtMs) record.startedAtMs = record.startedAtMs || startedAtMs;
        }
        continue;
      }
      if (ptype === "token_count") {
        const usage = rawUsageShape(payload.info?.last_token_usage);
        if (usage) {
          const observedAtMs = parseTimestampMs(obj.timestamp);
          attachCall({ usage, observedAtMs });
        }
        continue;
      }
      if (ptype === "mcp_tool_call_end") {
        const record = lastTurnId ? ensureTurn(lastTurnId) : null;
        if (record) bumpPlugin(record, asText(payload.invocation?.server || payload.server, 120));
        continue;
      }
      continue;
    }
    if (type === "response_item") {
      collectToolInvocations(payload, lastTurnId ? ensureTurn(lastTurnId) : null);
      continue;
    }
  }

  if (!thread.threadId) return null;
  return thread;
}

function finalizeTurnRow(threadId, record) {
  if (!record.calls.length) return null;
  const calls = record.calls
    .map((call) => ({
      usage: call.usage,
      observedAtMs: call.observedAtMs || 0,
    }))
    .sort((left, right) => left.observedAtMs - right.observedAtMs);
  const usage = calls.reduce((acc, call) => sumRawUsage(acc, call.usage), {});
  const firstMs = record.startedAtMs || calls[0].observedAtMs;
  const lastMs = record.finishedAtMs || calls[calls.length - 1].observedAtMs || firstMs;
  const durationMs = record.durationMs || Math.max(0, lastMs - firstMs);
  const invocations = [];
  for (const [name, count] of record.skillCounts) {
    invocations.push({ type: "skill", skill_id: name, skill_name: name, invocationId: `skill:${name}`, occurrence: count });
  }
  for (const [server, count] of record.pluginCounts) {
    invocations.push({ type: "plugin", plugin_id: server, plugin_name: server, invocationId: `plugin:${server}`, occurrence: count });
  }
  return {
    turnId: record.turnId,
    sessionKey: `local:${threadId}`,
    threadKey: `local:${threadId}`,
    threadAttributionStatus: "reliable",
    model: record.model || "unknown",
    ...(record.effort ? { effort: record.effort } : {}),
    createdAt: isoOrNull(firstMs) || new Date(0).toISOString(),
    startedAt: isoOrNull(firstMs) || new Date(0).toISOString(),
    finishedAt: isoOrNull(lastMs) || isoOrNull(firstMs) || new Date(0).toISOString(),
    durationMs,
    callCount: calls.length,
    usage,
    calls: calls.map((call) => ({ usage: call.usage, observedAt: isoOrNull(call.observedAtMs) || undefined })),
    ...(invocations.length ? { invocations } : {}),
    source: BACKFILL_SOURCE,
    importSource: BACKFILL_SOURCE,
  };
}

function collectSqliteBackfillRows(options, coveredThreadIds, summary) {
  const rows = new Map();
  let DatabaseSync = null;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    summary.sqliteUnavailable = true;
    return [];
  }
  for (const dbPath of options.stateDbs) {
    if (!fs.existsSync(dbPath)) continue;
    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const list = db
        .prepare("SELECT id, rollout_path, created_at, created_at_ms, updated_at, updated_at_ms, tokens_used, model, reasoning_effort FROM threads WHERE tokens_used > 0")
        .all();
      db.close();
      summary.stateDbs.push({ path: dbPath, threads: list.length });
      for (const row of list) {
        const threadId = asText(String(row.id || ""), 120);
        if (!threadId || coveredThreadIds.has(threadId)) continue;
        const rolloutPath = typeof row.rollout_path === "string" ? row.rollout_path : "";
        if (rolloutPath && fs.existsSync(rolloutPath)) {
          summary.skippedSqliteThreads += 1;
          continue;
        }
        const tokens = toPositiveInt(row.tokens_used);
        if (!tokens) continue;
        const existing = rows.get(threadId);
        const updatedMs = toPositiveInt(row.updated_at_ms) || unixToMs(row.updated_at);
        if (existing && existing.updatedMs >= updatedMs) continue;
        rows.set(threadId, {
          threadId,
          tokens,
          updatedMs,
          createdMs: toPositiveInt(row.created_at_ms) || unixToMs(row.created_at),
          model: asText(row.model, 120) || "unknown",
          effort: asText(row.reasoning_effort, 40),
        });
      }
    } catch (error) {
      summary.stateDbErrors.push(`${dbPath}: ${error.message}`);
    }
  }
  const out = [];
  for (const item of rows.values()) {
    const startedAt = isoOrNull(item.createdMs) || new Date(0).toISOString();
    const finishedAt = isoOrNull(item.updatedMs) || startedAt;
    out.push({
      turnId: `sqlite:${item.threadId}`,
      sessionKey: `local:${item.threadId}`,
      threadKey: `local:${item.threadId}`,
      threadAttributionStatus: "reliable",
      model: item.model,
      ...(item.effort ? { effort: item.effort } : {}),
      createdAt: startedAt,
      startedAt,
      finishedAt,
      durationMs: Math.max(0, (item.updatedMs || 0) - (item.createdMs || 0)),
      callCount: 1,
      usage: { total_tokens: item.tokens },
      timeGranularity: "day",
      source: BACKFILL_SOURCE,
      importSource: BACKFILL_SOURCE,
    });
  }
  return out;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = {
    files: 0,
    fileErrors: [],
    lineErrors: 0,
    threads: 0,
    turns: 0,
    calls: 0,
    tokens: 0,
    orphanCalls: 0,
    sqliteTurns: 0,
    skippedSqliteThreads: 0,
    stateDbs: [],
    stateDbErrors: [],
    sqliteUnavailable: false,
  };
  const threads = new Map();
  const files = walkRolloutFiles(options.sessionsDir);
  if (options.archived && options.archivedDir) files.push(...walkRolloutFiles(options.archivedDir));
  summary.files = files.length;

  for (const file of files) {
    try {
      const fileSummary = { lineErrors: 0 };
      const thread = scanRolloutLines(readRolloutLines(file), fileSummary);
      summary.lineErrors += fileSummary.lineErrors;
      if (!thread) continue;
      const target = threads.get(thread.threadId) || { turns: new Map(), orphanCalls: [] };
      for (const [turnId, record] of thread.turns) {
        if (!target.turns.has(turnId)) target.turns.set(turnId, record);
      }
      if (thread.orphanCalls.length) target.orphanCalls.push(...thread.orphanCalls);
      threads.set(thread.threadId, target);
    } catch (error) {
      summary.fileErrors.push(`${path.basename(file)}: ${error.message}`);
    }
  }

  const rows = [];
  const coveredThreadIds = new Set();
  for (const [threadId, info] of threads) {
    let threadTurns = 0;
    for (const record of info.turns.values()) {
      const row = finalizeTurnRow(threadId, record);
      if (!row) continue;
      rows.push(row);
      threadTurns += 1;
    }
    if (info.orphanCalls.length) {
      const orphanRow = finalizeTurnRow(threadId, {
        turnId: `${threadId}:orphan`,
        model: "",
        effort: "",
        startedAtMs: 0,
        finishedAtMs: 0,
        durationMs: 0,
        calls: info.orphanCalls,
        skillCounts: new Map(),
        pluginCounts: new Map(),
      });
      if (orphanRow) {
        summary.orphanCalls += info.orphanCalls.length;
        rows.push(orphanRow);
        threadTurns += 1;
      }
    }
    if (threadTurns > 0) coveredThreadIds.add(threadId);
  }

  let sqliteRows = [];
  if (options.sqlite) sqliteRows = collectSqliteBackfillRows(options, coveredThreadIds, summary);
  for (const row of sqliteRows) {
    rows.push(row);
    summary.sqliteTurns += 1;
  }

  rows.sort((left, right) => String(left.startedAt).localeCompare(String(right.startedAt)) || String(left.turnId).localeCompare(String(right.turnId)));

  const days = new Set();
  for (const row of rows) {
    summary.turns += 1;
    summary.calls += row.callCount || 0;
    summary.tokens += row.usage?.total_tokens || 0;
    const day = localDayKey(parseTimestampMs(row.startedAt));
    if (day) days.add(day);
  }
  summary.threads = new Set(rows.map((row) => row.sessionKey)).size;

  const payload = {
    format: "codex-live-token-cost.usage-backfill",
    version: 1,
    generatedAt: new Date().toISOString(),
    source: BACKFILL_SOURCE,
    replaceSource: BACKFILL_SOURCE,
    summary: {
      ...summary,
      firstDay: Array.from(days).sort()[0] || "",
      lastDay: Array.from(days).sort().at(-1) || "",
    },
    turns: rows,
  };

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(payload, null, 1)}\n`, "utf8");

  if (!options.quiet) {
    console.log(`rollout files scanned: ${summary.files}${summary.fileErrors.length ? ` (${summary.fileErrors.length} errors)` : ""}`);
    console.log(`threads: ${summary.threads}, turns: ${summary.turns}, calls: ${summary.calls}, total tokens: ${summary.tokens}`);
    console.log(`orphan calls: ${summary.orphanCalls}; sqlite fallback turns: ${summary.sqliteTurns} (skipped: ${summary.skippedSqliteThreads})`);
    if (summary.firstDay) console.log(`date range: ${summary.firstDay} .. ${summary.lastDay}`);
    for (const entry of summary.stateDbs) console.log(`state db: ${entry.path} (${entry.threads} threads)`);
    for (const error of summary.fileErrors.slice(0, 5)) console.warn(`file error: ${error}`);
    for (const error of summary.stateDbErrors) console.warn(`state db error: ${error}`);
    console.log(`wrote ${options.out}`);
  }
}

main();
