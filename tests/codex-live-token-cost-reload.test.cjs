"use strict";

const assert = require("node:assert");
const { extractDebugPortFromCommandLine, pickPageTarget, cleanupExpression } = require("../scripts/codex-live-token-cost-reload.cjs");

assert.equal(
  extractDebugPortFromCommandLine('"C:\\x\\ChatGPT.exe" --remote-debugging-port=55666 --remote-allow-origins=http://127.0.0.1:55666'),
  55666,
);
assert.equal(extractDebugPortFromCommandLine("no port"), null);

const page = { type: "page", url: "app://-/index.html", webSocketDebuggerUrl: "ws://x" };
assert.deepEqual(pickPageTarget([page]), page);
assert.equal(
  pickPageTarget([
    { type: "page", url: "app://-/index.html?initialRoute=%2Fchatgpt%2Fquick-chat" },
    page,
  ]).webSocketDebuggerUrl,
  "ws://x",
);
assert.equal(
  pickPageTarget([{ type: "page", url: "app://-/index.html?initialRoute=%2Favatar-overlay" }, page]).webSocketDebuggerUrl,
  "ws://x",
);
assert.equal(pickPageTarget([{ type: "webview", url: "app://-/index.html" }]), null);

assert.match(cleanupExpression(), /destroy/);
assert.match(cleanupExpression(), /electronBridge/);
console.log("reload helper tests passed");
