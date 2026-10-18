#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { readFileSync, writeFileSync, mkdirSync, watch } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const SOURCE = path.join(ROOT, "codex-live-token-cost.js");
const TARGET = path.join(
  process.env.APPDATA || "",
  "Codex++",
  "user_scripts",
  "market-codex-live-token-cost.js",
);
const RELOAD_DEBOUNCE_MS = 300;
const CDP_COMMAND_TIMEOUT_MS = 20_000;
const CDP_CONNECT_TIMEOUT_MS = 10_000;
const CDP_HTTP_TIMEOUT_MS = 5_000;

function debugLog(message) {
  if (process.env.CODEX_TOKEN_COST_RELOAD_DEBUG === "1") {
    console.error(`[reload-debug] ${message}`);
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
}

function extractDebugPortFromCommandLine(cmdline) {
  const match = String(cmdline || "").match(/--remote-debugging-port=(\d+)/i);
  return match ? Number(match[1]) : null;
}

function findCodexDebugPort() {
  let output;
  if (process.platform === "win32") {
    output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'remote-debugging-port' } | ForEach-Object { $_.CommandLine }",
      ],
      { encoding: "utf8", windowsHide: true },
    );
  } else {
    output = execFileSync("sh", ["-c", "ps -eo args | grep -oE -- '--remote-debugging-port=[0-9]+'"], {
      encoding: "utf8",
    });
  }
  for (const line of output.split(/\r?\n/)) {
    const port = extractDebugPortFromCommandLine(line);
    if (port) return port;
  }
  return null;
}

function pickPageTarget(targets) {
  const page = (targets || []).find((target) => {
    const url = String(target.url || "");
    if (target.type !== "page" || !/^app:\/\/-\/index\.html/i.test(url)) return false;
    const query = url.slice(url.indexOf("?") + 1);
    return !/initialRoute=.*(quick-chat|avatar-overlay)/i.test(query);
  });
  return page || null;
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP /json/list returned ${response.status}`);
  return response.json();
}

async function browserWebSocketUrl(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDP_HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: controller.signal });
    if (!response.ok) throw new Error(`CDP /json/version returned ${response.status}`);
    const info = await response.json();
    if (!info.webSocketDebuggerUrl) throw new Error("CDP /json/version has no browser websocket URL");
    return info.webSocketDebuggerUrl;
  } finally {
    clearTimeout(timer);
  }
}

function connectCdp(browserWsUrl, targetId) {
  if (typeof WebSocket !== "function") {
    throw new Error("This Node runtime has no global WebSocket");
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(browserWsUrl);
    const pending = new Map();
    let nextId = 1;
    let sessionId = null;
    let attached = false;
    let attachError = null;
    const connectTimer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error(`CDP browser websocket connect timed out: ${browserWsUrl}`));
    }, CDP_CONNECT_TIMEOUT_MS);
    const failAll = (error) => {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
    };
    const connectionError = () => new Error(`CDP websocket unavailable: ${browserWsUrl}`);
    ws.onerror = () => {
      clearTimeout(connectTimer);
      reject(connectionError());
      failAll(connectionError());
    };
    ws.onclose = () => {
      clearTimeout(connectTimer);
      const error = new Error(`CDP websocket closed: ${browserWsUrl}`);
      reject(error);
      failAll(error);
    };
    ws.onopen = () => {
      clearTimeout(connectTimer);
      ws.send(JSON.stringify({
        id: nextId++,
        method: "Target.attachToTarget",
        params: { targetId, flatten: true },
      }));
    };
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!attached && message.id === 1) {
        attached = true;
        if (message.error) {
          attachError = new Error(`Target.attachToTarget failed: ${message.error.code}: ${message.error.message}`);
          reject(attachError);
          return;
        }
        sessionId = message.result?.sessionId;
        if (!sessionId) {
          attachError = new Error("Target.attachToTarget returned no sessionId");
          reject(attachError);
          return;
        }
        ws.sendCommand = (method, params = {}) =>
          new Promise((res, rej) => {
            const id = nextId++;
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`CDP command timed out: ${method} id ${id}`));
            }, CDP_COMMAND_TIMEOUT_MS);
            pending.set(id, { res, rej, timer });
            try {
              ws.send(JSON.stringify({ id, sessionId, method, params }));
            } catch (error) {
              clearTimeout(timer);
              pending.delete(id);
              rej(error);
            }
          });
        resolve(ws);
        return;
      }
      if (message.sessionId && message.sessionId !== sessionId) return;
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) rej(new Error(`${message.error.code}: ${message.error.message}`));
      else res(message.result);
    };
  });
}

async function evaluate(ws, expression, { awaitPromise = true } = {}) {
  const result = await ws.sendCommand("Runtime.evaluate", {
    expression,
    awaitPromise,
    allowUnsafeEvalBlockedByCSP: true,
  });
  if (result?.exceptionDetails) {
    const detail = result.exceptionDetails;
    throw new Error(`Runtime.evaluate exception: ${detail.text || "unknown"} ${detail.exception?.description || ""}`.trim());
  }
  return result?.result?.value;
}

function cleanupExpression() {
  return `(() => {
    try { window.__codexLiveTokenCost?.destroy?.(); } catch {}
    try { delete window.__codexLiveTokenCost; } catch {}
    try { delete window.__codexLiveTokenCostVersion; } catch {}
    return !!(window.electronBridge && /^app:\\/\\/-\\//i.test(window.location.href));
  })()`;
}

function deploy() {
  mkdirSync(path.dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, readFileSync(SOURCE));
}

async function reloadOnce({ port, quiet = false }) {
  const resolvedPort = port || findCodexDebugPort();
  if (!resolvedPort) throw new Error("Could not find a Codex --remote-debugging-port");
  debugLog(`debug port ${resolvedPort}`);

  const browserWs = await browserWebSocketUrl(resolvedPort);
  const targets = await listTargets(resolvedPort);
  const page = pickPageTarget(targets);
  if (!page) throw new Error(`No injectable app://-/index.html page target on port ${resolvedPort}`);
  debugLog(`page target ${page.id}`);

  const source = readFileSync(SOURCE, "utf8");
  const sourceHash = sha256(SOURCE);
  deploy();
  const targetHash = sha256(TARGET);
  if (sourceHash !== targetHash) {
    throw new Error("Deploy mismatch after hot reload sync");
  }
  debugLog("deploy ok");

  const ws = await connectCdp(browserWs, page.id);
  debugLog("cdp connected");
  try {
    const bridgeOk = await evaluate(ws, cleanupExpression());
    if (!bridgeOk) throw new Error("electronBridge or app:// context not ready");
    debugLog("cleanup ok");
    await evaluate(ws, source, { awaitPromise: false });
    debugLog("inject ok");
    const version = await evaluate(ws, "window.__codexLiveTokenCostVersion || null");
    if (!version) throw new Error("reload did not register runtime version");
    if (!quiet) console.log(`runtime_version=${version}`);
  } finally {
    ws.close();
  }
  if (!quiet) {
    console.log(`reload ok: port=${resolvedPort} target=${page.id}`);
    console.log(`source_sha256=${sourceHash}`);
    console.log(`target_sha256=${targetHash}`);
  }
}

function watchAndReload() {
  let timer = null;
  const wanted = path.basename(SOURCE);
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      reloadOnce({})
        .then(() => console.log("reload ok"))
        .catch((error) => {
          console.error(`reload failed: ${error.message}`);
          if (process.env.CODEX_TOKEN_COST_RELOAD_EXIT_ON_ERROR === "1") process.exit(1);
      });
    }, RELOAD_DEBOUNCE_MS);
  };
  watch(path.dirname(SOURCE), (event, filename) => {
    if (!filename || path.basename(String(filename)) === wanted) schedule();
  });
  console.log(`watching ${SOURCE} (Ctrl+C to stop)`);
}

function parseArgs(argv) {
  const args = { port: null, once: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--once") args.once = true;
    else if (argv[i] === "--port" && argv[i + 1]) args.port = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.once) {
    await reloadOnce({ port: args.port });
  } else {
    if (args.port) throw new Error("--port is only supported with --once");
    watchAndReload();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  extractDebugPortFromCommandLine,
  pickPageTarget,
  cleanupExpression,
};
