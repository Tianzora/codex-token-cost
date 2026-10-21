const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-live-token-cost.js");
const code = fs.readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");

// LiteLLM 上游价格表（model_prices_and_context_window.json）的最小 fixture：
// 覆盖 openai provider 过滤、mode/过期过滤、×1e6 取整与全零条目剔除。
const upstreamPriceFixture = {
  "gpt-5.6-sol": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0.000004,
    cache_read_input_token_cost: 0.0000004,
    cache_creation_input_token_cost: 0.000005,
    output_cost_per_token: 0.00002,
  },
  "gpt-5.6-terra": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0.000002,
    cache_read_input_token_cost: 0.0000002,
    cache_creation_input_token_cost: 0.0000025,
    output_cost_per_token: 0.000012,
  },
  "gpt-5.6-luna": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0.0000002,
    cache_read_input_token_cost: 0.00000002,
    cache_creation_input_token_cost: 0.00000025,
    output_cost_per_token: 0.0000012,
  },
  "gpt-5.3-codex": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.00000175,
    cache_read_input_token_cost: 0.000000175,
    output_cost_per_token: 0.000014,
    deprecation_date: "2027-04-01",
  },
  "gpt-5.4": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.0000025,
    cache_read_input_token_cost: 0.00000025,
    output_cost_per_token: 0.000015,
  },
  "gpt-5.4-mini": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.00000075,
    cache_read_input_token_cost: 0.000000075,
    output_cost_per_token: 0.0000045,
  },
  "gpt-5.4-nano": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.0000002,
    cache_read_input_token_cost: 0.00000002,
    output_cost_per_token: 0.00000125,
  },
  "gpt-5.4-pro": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.00003,
    output_cost_per_token: 0.00018,
  },
  "gpt-5.5": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0.000005,
    cache_read_input_token_cost: 0.0000005,
    output_cost_per_token: 0.00003,
  },
  "gpt-5.5-pro": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.00003,
    output_cost_per_token: 0.00018,
  },
  "gpt-5.2": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0.00000125,
    cache_read_input_token_cost: 0.000000125,
    output_cost_per_token: 0.00001,
    deprecation_date: "2026-06-30",
  },
  "gpt-image-2": {
    litellm_provider: "openai",
    mode: "image_generation",
    input_cost_per_token: 0.000005,
    cache_read_input_token_cost: 0.00000125,
    output_cost_per_token: 0.00004,
  },
  "o3": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.000002,
    cache_read_input_token_cost: 0.0000005,
    output_cost_per_token: 0.000008,
  },
  "codex-mini-latest": {
    litellm_provider: "openai",
    mode: "responses",
    input_cost_per_token: 0.0000015,
    cache_read_input_token_cost: 0.000000375,
    output_cost_per_token: 0.000006,
  },
  "container-free": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0,
    output_cost_per_token: 0,
  },
  "claude-sonnet-4": {
    litellm_provider: "anthropic",
    mode: "chat",
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
  },
  // gpt 对话模型但不在官方定价页：默认列表不应出现。
  "gpt-5.9-alias": {
    litellm_provider: "openai",
    mode: "chat",
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
  },
};

// priceUpstreamSnapshot 的期望输出（USD / 1M tokens），同时作为本地缓存种子。
const upstreamSnapshotFixture = {
  prices: {
    "gpt-5.6-sol": { input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20 },
    "gpt-5.6-terra": { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 },
    "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 },
    "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, cacheWrite: null, output: 14 },
    "gpt-5.4": { input: 2.5, cachedInput: 0.25, cacheWrite: null, output: 15 },
    "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, cacheWrite: null, output: 4.5 },
    "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, cacheWrite: null, output: 1.25 },
    "gpt-5.4-pro": { input: 30, cachedInput: null, cacheWrite: null, output: 180 },
    "gpt-5.5": { input: 5, cachedInput: 0.5, cacheWrite: null, output: 30 },
    "gpt-5.5-pro": { input: 30, cachedInput: null, cacheWrite: null, output: 180 },
    "gpt-5.2": { input: 1.25, cachedInput: 0.125, cacheWrite: null, output: 10 },
    "gpt-image-2": { input: 5, cachedInput: 1.25, cacheWrite: null, output: 40 },
    "o3": { input: 2, cachedInput: 0.5, cacheWrite: null, output: 8 },
    "codex-mini-latest": { input: 1.5, cachedInput: 0.375, cacheWrite: null, output: 6 },
    "gpt-5.9-alias": { input: 3, cachedInput: null, cacheWrite: null, output: 15 },
  },
  meta: {
    "gpt-5.6-sol": { mode: "chat", deprecationDate: "" },
    "gpt-5.6-terra": { mode: "chat", deprecationDate: "" },
    "gpt-5.6-luna": { mode: "chat", deprecationDate: "" },
    "gpt-5.3-codex": { mode: "responses", deprecationDate: "2027-04-01" },
    "gpt-5.4": { mode: "responses", deprecationDate: "" },
    "gpt-5.4-mini": { mode: "responses", deprecationDate: "" },
    "gpt-5.4-nano": { mode: "responses", deprecationDate: "" },
    "gpt-5.4-pro": { mode: "responses", deprecationDate: "" },
    "gpt-5.5": { mode: "chat", deprecationDate: "" },
    "gpt-5.5-pro": { mode: "responses", deprecationDate: "" },
    "gpt-5.2": { mode: "chat", deprecationDate: "2026-06-30" },
    "gpt-image-2": { mode: "image_generation", deprecationDate: "" },
    "o3": { mode: "responses", deprecationDate: "" },
    "codex-mini-latest": { mode: "responses", deprecationDate: "" },
    "gpt-5.9-alias": { mode: "chat", deprecationDate: "" },
  },
};

const seededPriceSnapshot = {
  version: 2,
  fetchedAt: Date.parse("2026-07-01T00:00:00.000Z"),
  prices: upstreamSnapshotFixture.prices,
  meta: upstreamSnapshotFixture.meta,
};

function createIndexedDbTestDouble() {
  const databases = new Map();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const databaseApi = (record) => ({
    objectStoreNames: { contains: (name) => record.stores.has(name) },
    createObjectStore(name, options = {}) {
      const store = { keyPath: options.keyPath, rows: new Map() };
      record.stores.set(name, store);
      return store;
    },
    transaction(names) {
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      const allowed = Array.isArray(names) ? names : [names];
      let operations = 0;
      let completed = 0;
      const schedule = (callback) => {
        operations += 1;
        queueMicrotask(() => {
          callback();
          completed += 1;
          if (completed === operations) tx.oncomplete?.();
        });
      };
      tx.objectStore = (name) => {
        assert.equal(allowed.includes(name), true);
        const store = record.stores.get(name);
        assert.ok(store);
        return {
          put(value) {
            const request = { result: undefined, onsuccess: null, onerror: null };
            schedule(() => {
              store.rows.set(String(value[store.keyPath]), clone(value));
              request.result = value;
              request.onsuccess?.({ target: request });
            });
            return request;
          },
          clear() {
            const request = { result: undefined, onsuccess: null, onerror: null };
            schedule(() => {
              store.rows.clear();
              request.onsuccess?.({ target: request });
            });
            return request;
          },
          getAll() {
            const request = { result: [], onsuccess: null, onerror: null };
            schedule(() => {
              request.result = Array.from(store.rows.values()).map(clone);
              request.onsuccess?.({ target: request });
            });
            return request;
          },
        };
      };
      return tx;
    },
    close() {},
  });
  return {
    open(name, version) {
      const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        let record = databases.get(name);
        const needsUpgrade = !record || Number(version) > record.version;
        if (!record) {
          record = { version: Number(version) || 1, stores: new Map() };
          databases.set(name, record);
        } else if (needsUpgrade) {
          record.version = Number(version);
        }
        request.result = databaseApi(record);
        if (needsUpgrade) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    },
  };
}

assert.equal(code.includes('data-settings-panel-slug", "codex-live-usage"'), false);
assert.equal(code.includes('pushState(history.state, "", "/settings/profile")'), false);
assert.equal(code.includes("@run-at       document-start"), true);
assert.equal(code.includes("window.postMessage(message"), true);
assert.equal(code.includes('"codex-message-from-view"'), true);
assert.equal(code.includes('const VERSION = "0.7.10-beta1"'), true);
assert.equal(code.includes("function syncSidebarProfileIdentity"), true);
assert.equal(code.includes("void installProfileAuthContextPatch();"), true);
assert.equal(code.includes("profileAuthValuePatches"), false);
assert.equal(code.includes("Flatpickr 4.6.13 + zh locale"), true);
assert.equal(code.includes("data-analytics-start"), false);
assert.equal(code.includes("data-analytics-end"), false);
assert.equal(code.includes('if (state.analyticsPreset === "custom") window.setTimeout(() => void openAnalyticsCalendar(), 0);'), false);
assert.equal(code.includes("cltc-analytics-tooltip"), true);
assert.equal(code.includes('container.addEventListener("pointerdown", handleEmbeddedControlPointerDown, true)'), true);
assert.equal(code.includes('button.addEventListener("pointerdown", handleEmbeddedProfileSavePointerDown)'), true);
assert.match(code, /rect\[data-chart-index\][\s\S]*?stroke: transparent !important;/);
assert.match(code, /rect\[data-chart-index\]:focus-visible[\s\S]*?stroke: var\(--cltc-text\) !important;/);
assert.equal(code.includes("@keyframes cltc-analytics-bar-grow"), true);
assert.equal(code.includes("transform-box: fill-box;"), true);
assert.equal(code.includes("transform-origin: center bottom;"), true);
assert.equal(code.includes("transform: scaleY(0);"), true);
assert.equal(code.includes("animation: cltc-analytics-bar-grow 520ms cubic-bezier(.16, 1, .3, 1) var(--cltc-chart-bar-delay, 0ms) both;"), true);
assert.equal(code.includes('style="--cltc-chart-bar-delay:${index * stagger}ms"'), true);
assert.match(code, /prefers-reduced-motion: reduce[\s\S]*?\.cltc-settings \.cltc-analytics-chart rect\[data-chart-index\][\s\S]*?animation: none;[\s\S]*?transform: scaleY\(1\);/);
assert.equal(code.includes("refreshUsageAnalyticsFromHelper"), false);
assert.equal(code.includes("__FLATPICKR_JS_GZIP_BASE64__"), false);
assert.equal(code.includes("__FLATPICKR_CSS_GZIP_BASE64__"), false);
assert.equal(code.includes('data-settings-panel="usage"'), true);
assert.equal(code.includes("使用统计"), true);
assert.equal(code.includes("@description  在 Codex 输入框上方显示 Token 与金额；ChatGPT 登录时可用本地统计覆盖官方个人资料页；通过设置按钮管理价格和资料。"), true);
assert.equal(code.includes("FAST_MODE_COST_MULTIPLIER = 1.5"), false);
assert.equal(code.includes("FAST_MODE_COST_MULTIPLIERS"), true);
assert.equal(code.includes("-webkit-app-region: no-drag"), true);
assert.equal(code.includes("cltc-settings-overlay"), true);
assert.equal(code.includes("cltc-settings-modal"), true);
assert.equal(code.includes("cltc-settings-sidebar"), true);
assert.equal(code.includes("cltc-settings-content"), true);
assert.equal(code.includes("cltc-settings-nav"), true);
assert.equal(code.includes('aria-modal="true"'), true);
assert.equal(code.includes("justify-content: center"), true);
assert.equal(code.includes("grid-template-columns: max-content minmax(0, 1fr)"), true);
assert.equal(code.includes("grid-template-columns: 176px minmax(0, 1fr)"), false);
const settingsSidebarRule = code.match(/\.cltc-settings \.cltc-settings-sidebar \{([\s\S]*?)\n      \}/)?.[1] || "";
assert.equal(settingsSidebarRule.includes("border-right"), false);
assert.equal(settingsSidebarRule.includes("border-radius"), false);
const settingsSidebarRules = [...code.matchAll(/\.cltc-settings \.cltc-settings-sidebar \{([^}]*)\}/g)].map((match) => match[1]);
assert.equal(settingsSidebarRules.some((rule) => rule.includes("border-right: 1px")), false);
assert.equal(code.includes("cltc-settings-footer"), false);
assert.equal(code.includes("cltc-settings-version"), false);
assert.equal(code.includes("cltc-update-cluster"), true);
assert.equal(code.includes("--cltc-muted: var(--color-token-text-secondary"), true);
assert.equal(code.includes("--cltc-muted: var(--codex-plus-text-tertiary"), false);
assert.equal(code.includes("font-weight: 650"), false);
assert.match(code, /\.cltc-settings \.cltc-price-row\[data-active="true"\] \{[\s\S]*?font-weight: 600;[\s\S]*?\}/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger \{[\s\S]{0,320}?border: 1px solid var\(--cltc-border\);/);
assert.match(code, /\.cltc-settings \.cltc-price-meta \{[\s\S]*?line-height: 17px;[\s\S]*?\}/);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-price-field span,[\s\S]*?line-height: 17px;[\s\S]*?\}/);
assert.match(code, /\.cltc-settings \.cltc-settings-row \.cltc-link-button \{[\s\S]{0,220}?min-height: 34px;/);
assert.equal(code.includes("const hasData = buckets.some((item) => item.value > 0);"), true);
assert.equal(code.includes('class="cltc-analytics-chart-empty"'), true);
assert.equal(code.includes("暂无数据"), true);
assert.match(code, /\.cltc-settings \.cltc-analytics-chart text \{\s*fill: var\(--cltc-muted\);\s*font-size: 11px;\s*\}/);
assert.match(code, /\.cltc-settings \.cltc-analytics-chart \.cltc-analytics-chart-empty \{[\s\S]*?font-size: 13px;[\s\S]*?\}/);
assert.match(code, /\.cltc-settings \.cltc-analytics-model-head \{[\s\S]*?font-size: 11px;[\s\S]*?\}/);
assert.match(code, /\.cltc-settings \.cltc-analytics-model-row span \{[\s\S]*?font-size: 12px;[\s\S]*?\}/);
assert.equal(code.includes('data-analytics-preset="today" data-active="${String(preset === "today")}" aria-pressed="${String(preset === "today")}"'), true);
assert.equal(code.includes('data-analytics-preset="7d" data-active="${String(preset === "7d")}" aria-pressed="${String(preset === "7d")}"'), true);
assert.equal(code.includes('data-analytics-preset="30d" data-active="${String(preset === "30d")}" aria-pressed="${String(preset === "30d")}"'), true);
assert.equal(code.includes('data-analytics-preset="custom" data-active="${String(preset === "custom")}" aria-pressed="${String(preset === "custom")}"'), true);
assert.equal(code.includes('data-analytics-metric="tokens" data-active="${String(metric === "tokens")}" aria-pressed="${String(metric === "tokens")}"'), true);
assert.equal(code.includes('data-analytics-metric="cost" data-active="${String(metric === "cost")}" aria-pressed="${String(metric === "cost")}"'), true);
assert.equal(code.includes('data-active="${String(name === model)}" aria-pressed="${String(name === model)}" aria-label="${escapeHtml(priceLabel)}"'), true);
assert.equal(code.includes('class="cltc-settings-content" role="region" aria-live="polite"'), false);
assert.equal(code.includes('tabindex="${index === 0 ? "0" : "-1"}"'), true);
assert.equal(code.includes('const chart = bar.ownerSVGElement || bar.closest?.(".cltc-analytics-chart");'), true);
assert.equal(code.includes('state.settingsOverlay?.querySelectorAll?.("[data-chart-index]")'), false);
assert.match(code, /bars\.forEach\(\(node\) => node\.setAttribute\?\.\("tabindex", node === next \? "0" : "-1"\)\);/);
assert.match(code, /<p class="cltc-sync-status" data-field="usage-sync-status" data-tone="\$\{statusTone\}" role="status">/);
assert.equal(code.includes("@media (max-width: 680px)"), true);
assert.equal(code.includes(".cltc-profile-select:open"), true);
assert.equal(code.includes(".cltc-profile-select option"), true);
assert.equal(code.includes("appearance: auto"), true);
assert.equal(code.includes("::picker(select)"), true);
assert.equal(code.includes("::picker-icon"), true);
assert.equal(code.includes("html.electron-dark .cltc-settings"), true);
assert.equal(code.includes("background: rgba(0, 0, 0, .28)"), false);
assert.equal(code.includes("scrollbar-width: thin"), true);
assert.equal(code.includes("color-scheme: light dark"), true);
assert.equal(code.includes("--cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5))"), true);
assert.equal(code.includes("--cltc-hover: var(--color-token-interactive-bg-secondary-hover, light-dark(rgba(0, 0, 0, .053), rgba(255, 255, 255, .078)))"), true);
assert.equal(code.includes("--cltc-border: var(--color-token-border, light-dark(rgba(0, 0, 0, .08), rgba(255, 255, 255, .085)))"), true);
assert.equal(code.includes("--cltc-surface-secondary: var(--color-token-bg-primary, light-dark(#f6f6f6, #141414))"), true);
assert.equal(code.includes("--cltc-popover: var(--color-token-dropdown-background, light-dark(#ffffff, #2d2d2d))"), true);
assert.equal(code.includes("--cltc-input: var(--color-token-bg-primary, light-dark(#f6f6f6, #141414))"), true);
assert.equal(code.includes("--cltc-chrome: var(--color-token-side-bar-background"), true);
assert.equal(code.includes("--cltc-canvas: var(--color-token-main-surface-primary"), true);
assert.equal(code.includes("--cltc-sidebar-surface: var(--cltc-chrome)"), true);
assert.equal(code.includes('html[data-theme="dark"] .cltc-settings-overlay'), true);
assert.equal(code.includes("background: var(--color-token-side-bar-background, #f6f6f6) !important"), true);
assert.equal(code.includes("color: var(--color-token-text-primary, #1a1c1f) !important"), true);
assert.equal(code.includes("background: #1e1e1e !important"), false);
assert.equal(code.includes("background: #141414 !important"), false);
assert.equal(code.includes("--cltc-active: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .053), rgba(255, 255, 255, .078)))"), true);
assert.equal(code.includes("--codex-plus-"), false);
assert.equal(code.includes("--cltc-font-family: var(--font-family-sans, var(--font-sans,"), true);
assert.equal(code.includes("--cltc-radius-control: var(--radius-lg, 8px)"), true);
assert.equal(code.includes("--cltc-focus-ring: var(--color-token-focus-border,"), true);
assert.equal(code.includes("--cltc-success: var(--color-token-success, #10a37f)"), true);
assert.equal(code.includes("--cltc-warning: var(--color-token-warning, light-dark(#b45309, #f0b35e))"), true);
assert.equal(code.includes('.cltc-settings .cltc-settings-actions button[data-variant="primary"]'), true);
assert.equal(code.includes('.cltc-settings .cltc-settings-row button[data-variant="primary"]'), true);
assert.match(
  code,
  /\.cltc-settings button\[data-variant="primary"\]:hover \{\s+border-color: var\(--cltc-primary\);\s+background: color-mix\(in srgb, var\(--cltc-primary\) 88%, var\(--cltc-canvas\)\);\s+color: var\(--cltc-primary-text\);\s+\}/,
);
assert.equal(code.includes(".cltc-settings *::before"), true);
assert.equal(code.includes("border-radius: var(--cltc-radius-modal)"), true);
assert.equal(code.includes("--cltc-arc-bg: light-dark(rgb(246, 246, 246), rgba(255, 255, 255, .08))"), true);
assert.equal(code.includes("--cltc-shimmer-contrast: #fff"), true);
assert.equal(code.includes("--cltc-shimmer-contrast: #0009"), false);
assert.equal(code.includes("margin: 0 auto -18px"), true);
assert.equal(code.includes("height: 61px"), true);
assert.equal(code.includes("padding: 8px 10px 25px"), true);
assert.equal(code.includes("border-radius: var(--cltc-arc-radius) var(--cltc-arc-radius) 0 0"), true);
assert.equal(code.includes("display: grid"), true);
assert.equal(code.includes("grid-template-columns: minmax(0, 2.05fr) repeat(4, minmax(0, .755fr)) minmax(0, 1.20fr)"), true);
assert.equal(code.includes("background: var(--cltc-input)"), true);
assert.equal(code.includes("background: var(--cltc-hover)"), true);
assert.equal(code.includes("#${ROOT_ID} .cltc-pill + .cltc-pill::before"), true);
assert.equal(code.includes("background: color-mix(in srgb, var(--cltc-muted) 30%, transparent)"), true);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-pill \{[\s\S]*?justify-content: center;[\s\S]*?min-width: 0;[\s\S]*?\}/);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-pill \+ \.cltc-pill::before \{[\s\S]*?position: absolute;[\s\S]*?transform: translateY\(-50%\);[\s\S]*?\}/);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-pill \{[\s\S]*?min-height: 28px;[\s\S]*?\}/);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-pill \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?\}/);
assert.equal(code.includes("@media (prefers-color-scheme: dark)"), true);
assert.equal(code.includes("html.electron-dark #${ROOT_ID}"), true);
assert.equal(code.includes("color-scheme: dark"), true);
assert.equal(code.includes("--cltc-surface: #2d2d2d"), true);
assert.equal(code.includes("--cltc-input: #2d2d2d"), true);
assert.equal(code.includes("--cltc-surface: rgb(22, 22, 22)"), false);
assert.equal(code.includes("--cltc-surface-secondary: rgb(30, 30, 30)"), false);
assert.equal(code.includes("--cltc-popover: rgb(22, 22, 22)"), false);
assert.equal(code.includes("--cltc-input: rgb(22, 22, 22)"), false);
assert.equal(code.includes("--cltc-sidebar-surface: rgb(30, 30, 30)"), false);
assert.equal(code.includes("--cltc-active: rgba(255, 255, 255, .08)"), false);
assert.equal(code.includes("--cltc-arc-bg: rgb(31, 31, 31)"), true);
assert.equal(code.includes("--cltc-text: #d4d4d8"), true);
assert.equal(code.includes("--cltc-muted: rgba(255, 255, 255, .498)"), true);
assert.equal(code.includes("--cltc-muted: rgba(26, 28, 31, .494)"), true);
assert.equal(code.includes("--cltc-arc-bg: rgb(246, 246, 246)"), true);
assert.equal(code.includes("--cltc-arc-bg: rgba(0, 0, 0, 1)"), false);
assert.equal(code.includes("--cltc-arc-bg: rgba(0, 0, 0, .07)"), false);
assert.match(code, /\.cltc-settings-modal \{[\s\S]*?background: var\(--cltc-popover\);/);
assert.match(code, /\.cltc-settings \.cltc-settings-sidebar \{[\s\S]*?background: var\(--cltc-sidebar-surface\);/);
assert.match(code, /\.cltc-settings \.cltc-settings-nav button\[data-active="true"\] \{[\s\S]*?background: var\(--cltc-active\);/);
assert.match(code, /\.cltc-settings button:focus-visible \{[\s\S]*?outline: 2px solid var\(--cltc-focus-ring\);/);
assert.match(code, /\.cltc-settings button:disabled \{[\s\S]*?cursor: not-allowed;[\s\S]*?opacity: \.5;/);
assert.match(code, /\.cltc-settings \.cltc-price-row\[data-active="true"\] \{[\s\S]*?background: var\(--cltc-active\);/);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-toggle-field input,[\s\S]*?background: color-mix\(in srgb, var\(--cltc-text\) 16%, transparent\);/);
assert.match(code, /\.cltc-settings \.cltc-toggle-field input::after \{[\s\S]*?background: var\(--cltc-muted\);/);
assert.match(code, /\.cltc-settings \.cltc-toggle-field input:checked::after \{\s*transform: translateX\(14px\);\s*background: var\(--cltc-surface\);\s*\}/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger\[data-empty="true"\] \{[\s\S]*?color: var\(--cltc-muted\);/);
assert.match(code, /\.cltc-settings \.cltc-analytics-filter \{[\s\S]*?background: var\(--cltc-surface-secondary\);/);
assert.match(code, /\.cltc-settings \.cltc-composition-bar \{[\s\S]*?background: var\(--cltc-surface-secondary\);/);
assert.equal(code.includes("function updateRollingValueSlot(slot, key, value)"), true);
assert.equal(code.includes("if (previous === text) return;"), false);
assert.equal(code.includes("function isTransientSessionKey(value)"), true);
assert.equal(code.includes("function isMainComposerSurfaceTarget(target)"), true);
assert.equal(code.includes("function createRollingDigitColumn()"), true);
assert.equal(code.includes("function updateRollingDigitColumn(column, char, shouldAnimate)"), true);
assert.equal(code.includes("function rollComparableValue(text)"), true);
assert.equal(code.includes("function rollTrend(previous, next)"), true);
assert.equal(code.includes('roll.className = "cltc-roll"'), true);
assert.equal(code.includes("cltc-roll-digit-column"), true);
assert.equal(code.includes("cltc-roll-digit-clip"), true);
assert.equal(code.includes("cltc-roll-digit-stack"), true);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-roll \{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?\}/);
assert.equal(code.includes("--cltc-roll-row: 16px"), true);
assert.equal(code.includes("height: var(--cltc-roll-row)"), true);
assert.equal(code.includes("line-height: var(--cltc-roll-row)"), true);
assert.equal(code.includes("--cltc-roll-to-y"), true);
assert.equal(code.includes("#${ROOT_ID} .cltc-roll::before"), true);
assert.equal(code.includes("flex: 0 0 0"), true);
assert.equal(code.includes("visibility: hidden"), true);
assert.equal(code.includes("* -1lh"), false);
assert.equal(code.includes("align-items: baseline"), false);
assert.equal(code.includes("--cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);"), true);
assert.equal(code.includes("--cltc-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);"), true);
assert.equal(code.includes("--cltc-duration-press: 160ms;"), true);
assert.equal(code.includes("--cltc-duration-tooltip: 125ms;"), true);
assert.equal(code.includes("--cltc-duration-popover: 180ms;"), true);
assert.equal(code.includes("--cltc-duration-modal: 200ms;"), true);
assert.equal(code.includes("--cltc-duration-data: 160ms;"), true);
const settingsOverlayTokenBlock = code.match(
  /\.cltc-settings-overlay \{\n([\s\S]*?)\n      \}\n      html\[data-theme="dark"\] \.cltc-settings-overlay,/,
);
assert.ok(settingsOverlayTokenBlock);
for (const declaration of [
  "--cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);",
  "--cltc-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);",
  "--cltc-duration-press: 160ms;",
  "--cltc-duration-tooltip: 125ms;",
  "--cltc-duration-popover: 180ms;",
  "--cltc-duration-modal: 200ms;",
  "--cltc-duration-data: 160ms;",
]) assert.equal(settingsOverlayTokenBlock[1].includes(declaration), true);
assert.match(code, /syncHubVisibility\(root\);\s+if \(!state\.settingsOverlay\?\.isConnected \|\| !state\.priceEditorOpen\) renderSettingsOverlay\(snap\);/);
assert.match(code, /const SETTINGS_BUTTON_ICON =/);
assert.equal(code.includes("syncCcSwitchFromSettings"), false);
assert.equal(code.includes("syncCcSwitchUsageFromHelper"), false);
assert.equal(code.includes("ccSwitchSettingsHtml"), false);
assert.equal(code.includes("generalSettingsHtml"), true);
assert.match(code, /let entering = false;\s+if \(!state\.settingsOverlay\) \{\s+entering = true;[\s\S]*?state\.settingsOverlay\.dataset\.cltcEntering = "true";/);
assert.match(code, /if \(entering\) \{\s+const overlay = state\.settingsOverlay;\s+const settle = \(\) => overlay\?\.removeAttribute\("data-cltc-entering"\);\s+if \(typeof window\.requestAnimationFrame === "function"\) window\.requestAnimationFrame\(settle\);\s+else settle\(\);\s+\}/);
assert.match(code, /if \(!state\.settingsOverlay\.isConnected\)[\s\S]*?if \(entering\) \{[\s\S]*?else settle\(\);\s+\}/);
assert.match(code, /\.cltc-settings-modal \{[\s\S]*?opacity: 1;[\s\S]*?transform: translateY\(0\) scale\(1\);[\s\S]*?transition: opacity var\(--cltc-duration-modal\) var\(--cltc-ease-out\),\s+transform var\(--cltc-duration-modal\) var\(--cltc-ease-out\);/);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-entering="true"\] \.cltc-settings-modal \{[\s\S]*?opacity: 0;[\s\S]*?transform: translateY\(4px\) scale\(\.97\);/);
assert.match(code, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.cltc-settings-modal \{[\s\S]*?transform: none;[\s\S]*?transition: opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\);[\s\S]*?\.cltc-settings-overlay\[data-cltc-entering="true"\] \.cltc-settings-modal \{[\s\S]*?transform: none;/);
assert.equal(code.includes("const SETTINGS_MODAL_EXIT_MS = 160;"), true);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-closing="true"\] \{[\s\S]*?pointer-events: none;/);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-closing="true"\] \.cltc-settings-modal \{[\s\S]*?opacity: 0;[\s\S]*?transform: translateY\(2px\) scale\(\.98\);[\s\S]*?transition: opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?transform var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-closing="true"\] \.cltc-settings-modal \{[\s\S]*?transform: none;[\s\S]*?transition: opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.match(code, /function closeSettingsEditor\(\) \{[\s\S]*?state\.priceEditorOpen = false;[\s\S]*?render\(true\);\s+\}/);
assert.match(code, /function handleSettingsKeydown\(event\) \{\s+if \(event\.key === "Escape"\) \{[\s\S]*?event\.preventDefault\?\.\(\);[\s\S]*?closeEmbeddedSettingsPage\(\);/);
assert.match(code, /state\.settingsOverlayCloseTimer = window\.setTimeout\(remove, SETTINGS_MODAL_EXIT_MS\);/);
assert.match(code, /state\.settingsOverlay\.addEventListener\("keydown", handleSettingsKeydown\);/);
assert.match(code, /if \(event\.target\?\.classList\?\.contains\("cltc-settings-overlay"\)\) \{\s+closeEmbeddedSettingsPage\(\);/);
assert.match(code, /function closeEmbeddedSettingsPage\(\) \{[\s\S]*?state\.embeddedPageContainer = null;[\s\S]*?embeddedPageClose\(\);/);
assert.match(code, /function handleDocumentPointerDown\(event\) \{[\s\S]*?if \(state\.embeddedPageContainer\) \{\s+if \(state\.embeddedPageContainer\.contains\?\.\(event\.target\)\) return;\s+if \(event\.target\?\.closest\?\.\("\.codex-plus-modal-content, \.codex-plus-page-overlay"\)\) return;\s+if \(state\.updateClusterEl\?\.contains\?\.\(event\.target\)\) return;\s+closeEmbeddedSettingsPage\(\);/);
assert.equal(code.includes('data-action="close-price"'), false);
assert.match(code, /function clearEmbeddedRailActiveAfterNavigation\(event\) \{[\s\S]*?closest\?\.\(\"nav\[data-app-navigation-rail\] button\[aria-label\]\"\)[\s\S]*?clearEmbeddedRailActive\(\);/);
assert.match(code, /rememberPendingInput\(event\);\s+clearEmbeddedRailActiveAfterNavigation\(event\);/);
assert.match(code, /function clearEmbeddedRailActive\(\) \{[\s\S]*?nav\[data-app-navigation-rail\] button\[aria-label\][\s\S]*?aria-current'\, 'data-active'\, 'data-selected'[\s\S]*?removeAttribute/);
assert.match(code, /function renderEmbeddedSettingsPage\(container, options = \{\}\) \{\s+(?:if \(options\.panel[\s\S]*?;\s+)?state\.priceEditorOpen = true;\s+state\.embeddedPageContainer = container;\s+container\.classList\.add\("cltc-settings-overlay", "cltc-settings-embedded", "cltc-settings"\);\s+renderUpdateCluster\(\);\s+if \(state\.analyticsCalendar\?\.isOpen\) return;/);
assert.match(code, /animateAnalyticsSegments\(container, options\);/);
assert.match(code, /button\.addEventListener\("pointerdown", handleSettingsNavPointerDown\)/);
assert.match(code, /function handleSettingsNavPointerDown\(event\) \{[\s\S]*?event\.preventDefault\?\.\(\);[\s\S]*?event\.stopPropagation\?\.\(\);[\s\S]*?selectSettingsPanel/);
assert.match(code, /container\.addEventListener\("click", handleSettingsClick, true\)/);
assert.match(code, /container\.addEventListener\("change", handleSettingsChange, true\)/);
assert.match(code, /function installCodexPlusEmbeddedPage\(\) \{[\s\S]*?typeof window\.codexPlus\?\.registerPage !== "function"/);
assert.match(code, /state\.embeddedPageDispose = window\.codexPlus\.registerPage\(/);
assert.match(code, /render: \(\{ container, close \}\) => \{[\s\S]*?embeddedPageClose = typeof close === "function" \? close : null;[\s\S]*?renderEmbeddedSettingsPage\(container\);/);
assert.match(code, /\.cltc-settings-overlay\.cltc-settings-embedded \{[\s\S]*?position: static;[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
assert.match(code, /\.codex-plus-modal-body:has\(> \.cltc-settings-embedded\) \{[\s\S]*?padding: 0 !important;[\s\S]*?overflow: hidden !important;[\s\S]*?scrollbar-gutter: auto !important;/);
assert.match(code, /\.cltc-settings-overlay\.cltc-settings-embedded \{[\s\S]*?background: var\(--cltc-chrome\);/);
assert.equal(code.includes('html[data-theme="dark"] .cltc-settings-overlay.cltc-settings-embedded'), false);
assert.match(code, /\.cltc-settings-overlay\.cltc-settings-embedded \.cltc-settings-content \{[\s\S]*?background: var\(--cltc-canvas\);[\s\S]*?border-radius: var\(--cltc-radius-modal\) 8px 8px 8px;/);
assert.equal(code.includes('html[data-theme="dark"] .cltc-settings-overlay.cltc-settings-embedded .cltc-settings-content'), false);
assert.match(code, /\.cltc-settings-overlay\.cltc-settings-embedded \.cltc-price-head \{[\s\S]*?display: none;/);
assert.equal(code.includes("--cltc-text: var(--codex-plus-text"), false);
assert.equal(code.includes("--cltc-surface-secondary: var(--codex-plus-bg-secondary"), false);
assert.match(code, /const SETTINGS_FOCUS_ATTRIBUTES = \[[\s\S]*?"data-settings-panel"[\s\S]*?"data-chart-index"[\s\S]*?\];/);
assert.match(code, /function settingsFocusKey\(node, root\) \{[\s\S]*?root\?\.contains\?\.\(node\)[\s\S]*?return \{ attribute, value \};/);
assert.match(code, /function isSettingsFocusable\(node\) \{[\s\S]*?node\.disabled[\s\S]*?tabIndex[\s\S]*?return \/\^\(A\|BUTTON\|INPUT\|SELECT\|TEXTAREA\)\$\//);
assert.match(code, /function restoreSettingsFocus\(root, key\) \{[\s\S]*?querySelectorAll\?\.\(SETTINGS_FOCUS_SELECTOR\)[\s\S]*?target\?\.focus\?\.\(\);/);
assert.match(code, /function renderSettingsOverlay\(snap, options = \{\}\) \{\s+if \(state\.embeddedPageContainer\) \{\s+renderEmbeddedSettingsPage\(state\.embeddedPageContainer, options\);\s+return;\s+\}[\s\S]*?if \(state\.priceEditorOpen\) \{[\s\S]*?state\.settingsOverlay\?\.remove\?\.\(\);[\s\S]*?state\.settingsOverlay = null;[\s\S]*?return;\s+\}[\s\S]*?const animate = options\.animate === true;/);
assert.match(code, /function animateAnalyticsSegments\(root, options = \{\}\) \{[\s\S]*?data-cltc-segment-from-index/);
assert.match(code, /function animateAnalyticsSegments\(root, options = \{\}\) \{[\s\S]*?if \(prefersReducedMotion\(\)\) return;[\s\S]*?data-cltc-segment-from-index/);
assert.match(code, /const CODEX_PLUS_SUPPORTED_API = 1;[\s\S]*?function codexPlusApiReady\(\) \{[\s\S]*?if \(typeof version !== "number"\) return true;[\s\S]*?return version === CODEX_PLUS_SUPPORTED_API;/);
assert.match(code, /function installCodexPlusEmbeddedPage\(\) \{[\s\S]*?if \(!codexPlusApiReady\(\)\) \{[\s\S]*?reportFailure\(new Error\("Codex\+\+ API version mismatch: " \+\s*window\.codexPlus\?\.apiVersion\)\);[\s\S]*?return;[\s\S]*?\}/);
assert.match(code, /if \(codexPlusApiReady\(\)\) window\.codexPlus\?\.onCleanup\?\.\(destroy\);/);
assert.equal(code.includes("--cltc-radius-pill: 999px"), true);
assert.match(code, /\.cltc-settings \.cltc-settings-content::-webkit-scrollbar-thumb[\s\S]*?\.cltc-price-list::-webkit-scrollbar-thumb \{[\s\S]*?border-radius: var\(--cltc-radius-pill\)/);
assert.equal(code.includes("border-radius: var(--cltc-radius-pill)"), true);
assert.equal(code.includes("border-radius: var(--cltc-radius-sm)"), true);
assert.match(code, /\.cltc-settings \*,[\s\S]*?\.cltc-settings \*::before,[\s\S]*?\.cltc-settings \*::after \{[\s\S]*?box-sizing: border-box;/);
assert.match(code, /container\.classList\.add\("cltc-settings-overlay", "cltc-settings-embedded", "cltc-settings"\)/);
assert.match(code, /state\.settingsOverlay\.className = "cltc-settings-overlay cltc-settings"/);
assert.match(code, /\.cltc-settings \.cltc-settings-content \{[^}]*?transition: opacity var\(--cltc-duration-popover\)/);
assert.match(code, /const disposers = \[\];[\s\S]*?function trackTimer\(id\) \{[\s\S]*?disposers\.push\(\(\) => \{[\s\S]*?window\.clearTimeout\(id\);[\s\S]*?window\.cancelAnimationFrame\(id\);[\s\S]*?\}\);[\s\S]*?return id;[\s\S]*?\}/);
assert.match(code, /function trackObserver\(observer\) \{[\s\S]*?disposers\.push\(\(\) => observer\?\.disconnect\?\.\(\)\);[\s\S]*?return observer;[\s\S]*?\}/);
assert.match(code, /function trackListener\(target, type, handler, options\) \{[\s\S]*?target\.addEventListener\(type, handler, options\);[\s\S]*?disposers\.push\(\(\) => target\.removeEventListener\(type, handler, options\)\);[\s\S]*?return handler;[\s\S]*?\}/);
assert.match(code, /trackListener\(document, "keydown", rememberPendingInput, true\);/);
assert.match(code, /while \(disposers\.length\) \{[\s\S]*?const dispose = disposers\.pop\(\);[\s\S]*?try \{[^\n]*dispose\(\);\s+\} catch \{\s+\}/);
assert.match(code, /if \(window\.__CODEX_LIVE_TOKEN_COST_TEST__ && disposers\.length !== 0\) \{\s+throw new Error\("Codex Token Cost: disposers not drained"\);\s+\}/);
assert.match(code, /const focusKey = settingsFocusKey\(document\.activeElement, state\.settingsOverlay\);/);
assert.equal(code.includes("settingsFocusFrame: 0"), true);
assert.match(code, /function cancelSettingsFocusFrame\(\) \{[\s\S]*?cancelAnimationFrame\(state\.settingsFocusFrame\)[\s\S]*?state\.settingsFocusFrame = 0;/);
assert.match(code, /if \(!state\.priceEditorOpen\) \{\s+cancelSettingsFocusFrame\(\);/);
assert.match(code, /const focusRoot = state\.settingsOverlay;[\s\S]*?const restoreFocus = \(\) => \{[\s\S]*?restoreSettingsFocus\(focusRoot, focusKey\);[\s\S]*?state\.settingsFocusFrame = window\.requestAnimationFrame\(restoreFocus\);/);
assert.match(code, /else if \([\s\S]*?state\.settingsFocusFrame[\s\S]*?document\.activeElement !== document\.body[\s\S]*?cancelSettingsFocusFrame\(\);/);
assert.match(code, /if \(animate && content\) \{[\s\S]*?content\.dataset\.cltcSwitching = "true";[\s\S]*?requestAnimationFrame\(settle\);/);
assert.match(code, /\.cltc-settings \.cltc-settings-content\[data-cltc-switching="true"\] \{[\s\S]*?opacity: \.45;[\s\S]*?transform: translateY\(4px\);/);
assert.match(code, /renderSettingsOverlay\(liveSnapshot\(\), \{ animate: true \}\);/);
assert.equal(code.includes("transition: transform var(--transition-duration-relaxed, .3s) cubic-bezier(.16, 1, .3, 1)"), false);
assert.equal(code.includes("transition: transform var(--cltc-duration-data) var(--cltc-ease-out);"), true);
assert.equal(code.includes("will-change: transform;"), false);
assert.equal(code.includes('stack.style.willChange = "transform";'), true);
assert.equal(code.includes('stack.style.willChange = "";'), true);
assert.equal(code.includes("transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out), transform var(--cltc-duration-popover) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-popover);"), true);
assert.match(code, /\.cltc-toggle-field input,[\s\S]*?transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?background var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?border-color var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.match(code, /\.cltc-settings \.cltc-toggle-field input::after \{[\s\S]*?transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),\s+background var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.equal(code.includes("transition: rotate var(--cltc-duration-press) var(--cltc-ease-in-out);"), true);
assert.equal(code.includes("transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);"), true);
assert.equal(code.includes("analyticsSegmentSwitchFrame: 0"), true);
assert.equal(code.includes("startTimer: 0"), true);
assert.match(code, /state\.startTimer = trackTimer\(window\.setTimeout\(start, 1200\)\);/);
assert.match(code, /function scheduleStart\(\) \{[\s\S]*?if \(state\.started \|\| state\.destroyed\) return;[\s\S]*?state\.startTimer = trackTimer\(window\.setTimeout\(start, 1200\)\);/);
assert.match(code, /function destroy\(\) \{[\s\S]*?window\.clearTimeout\(state\.startTimer\);\s+state\.startTimer = 0;/);
assert.match(code, /\.cltc-settings \.cltc-analytics-date-range \{/);
assert.equal(code.includes(".cltc-analytics-control"), false);
assert.match(code, /data-cltc-segment-index="/);
assert.match(code, /data-analytics-preset="today"/);
assert.match(code, /data-analytics-preset="7d"/);
assert.match(code, /data-analytics-preset="30d"/);
assert.match(code, /data-analytics-preset="custom"/);
assert.match(code, /data-action="open-analytics-calendar"/);
assert.match(code, /data-action="clear-analytics-range"/);
assert.match(code, /onClose\(selectedDates\) \{[\s\S]*?if \(complete\) \{[\s\S]*?state\.analyticsCustomStart = localDateKey\(selectedDates\[0\]\);[\s\S]*?state\.analyticsPreset = "custom";[\s\S]*?\}/);
assert.match(code, /data-analytics-metric="tokens"/);
assert.match(code, /data-analytics-metric="cost"/);
assert.match(code, /\.cltc-settings \.cltc-segmented \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger\[data-empty="true"\] \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger\[data-open="true"\] \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-icon \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-label \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-chevron \{/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger \{[\s\S]{0,320}?background: var\(--cltc-input\);/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger\[data-empty="false"\] \.cltc-date-range-label \{\s+font-weight: 500;\s+\}/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger\[data-open="true"\] \{\s+background: color-mix\(in srgb, var\(--cltc-text\) 12%, var\(--cltc-input\)\);\s+\}/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger\[data-open="true"\] \.cltc-date-range-chevron \{\s+transform: rotate\(180deg\);\s+\}/);
assert.match(code, /\.cltc-settings \.cltc-date-range-trigger:hover \{\s+background: color-mix\(in srgb, var\(--cltc-text\) 8%, var\(--cltc-input\)\);\s+\}/);
assert.match(code, /span\.flatpickr-weekday \{\s+line-height: 36px !important;\s+font-size: 12px !important;\s+font-weight: 500 !important;\s+color: var\(--color-token-text-secondary, #52525b\) !important;\s+\}/);
assert.match(code, /\.flatpickr-day\.inRange::before,\s+\.flatpickr-day\.startRange::before,\s+\.flatpickr-day\.endRange::before \{\s+content: "";\s+position: absolute;\s+z-index: -2;\s+top: 4px;\s+right: 0;\s+bottom: 4px;\s+left: 0;/);
assert.match(code, /\.flatpickr-day\.today:not\(\.selected\):not\(\.startRange\):not\(\.endRange\):not\(\.inRange\) \{/);
assert.match(code, /\.flatpickr-day\.today:not\(\.selected\):not\(\.startRange\):not\(\.endRange\):not\(\.inRange\)::before \{/);
assert.match(code, /\.flatpickr-day\.flatpickr-disabled:hover,\s+\.flatpickr-day\.flatpickr-disabled:focus \{\s+background: transparent !important;\s+\}/);
assert.match(code, /function openAnalyticsCalendar\(\)/);
assert.match(code, /function destroyAnalyticsCalendar\(\)/);
assert.match(code, /function ensureFlatpickr\(\)/);
assert.match(code, /data-cltc-segment-from-index/);
assert.equal(code.includes("data-cltc-range-switching"), false);
assert.match(code, /\.cltc-settings \.cltc-sync-status \{[\s\S]*?transition: opacity var\(--cltc-duration-tooltip\) var\(--cltc-ease-out\);[\s\S]*?\}/);
assert.equal(code.includes("data-cltc-status-pulse"), false);
assert.equal(code.includes("pulseSettingsStatus"), false);
assert.equal(code.includes("setCcSwitchSyncStatus"), false);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{\s+\.cltc-settings \.cltc-analytics-chart rect\[data-chart-index\]:hover/);
assert.match(code, /\.cltc-settings \.cltc-analytics-bar:focus-within \.cltc-analytics-tooltip \{[\s\S]*?opacity: 1;[\s\S]*?\}\s+@media \(hover: hover\) and \(pointer: fine\)/);
assert.equal(code.includes("transition: width var(--cltc-duration-tooltip)"), false);
assert.equal(code.includes("transition: height var(--cltc-duration-tooltip)"), false);
assert.equal(code.includes("transition: opacity .18s ease, transform .18s ease, visibility 0s linear .18s;"), false);
assert.equal(code.includes("transition: background .15s ease, border-color .15s ease;"), false);
assert.equal(code.includes("transition: transform .15s ease;"), false);
assert.equal(code.includes("transition: rotate .16s ease;"), false);
assert.equal(code.includes("transition: opacity .15s ease;"), false);
assert.equal(code.includes("transition: opacity .12s ease;"), false);
assert.equal(code.includes("transition: all"), false);
assert.match(code, /\.cltc-settings \.cltc-settings-nav button,\s+\.cltc-settings \.cltc-price-row \{[\s\S]*?transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),/);
assert.match(code, /\.cltc-settings \.cltc-toggle-field input:active \{\s+transform: scale\(\.97\);/);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.cltc-settings \.cltc-settings-nav button:hover/);
assert.doesNotMatch(code, /\.cltc-settings \.cltc-settings-nav button:hover,\s+\.cltc-settings \.cltc-settings-nav button:focus-visible/);
assert.match(code, /\.cltc-settings \.cltc-toggle-field input,[\s\S]*?\.cltc-settings \.cltc-toggle-field input:active,[\s\S]*?\.cltc-settings \.cltc-profile-select,[\s\S]*?transition: none;[\s\S]*?transform: none;/);
assert.match(code, /\.cltc-settings \.cltc-analytics-bar:focus-within \.cltc-analytics-tooltip \{[\s\S]*?opacity: 1;/);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.cltc-settings \.cltc-analytics-chart rect\[data-chart-index\]:hover \{[\s\S]*?opacity: \.66;[\s\S]*?\.cltc-settings \.cltc-analytics-bar:hover \.cltc-analytics-tooltip \{[\s\S]*?opacity: 1;/);
assert.equal(code.includes("transition: opacity var(--cltc-duration-press) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-press);"), true);
assert.equal(code.includes("--cltc-roll-stable-width"), false);
assert.equal(code.includes("function updateRollingStableWidth"), false);
assert.equal(code.includes("updateRollingStableWidth(roll, text);"), false);
assert.equal(code.includes("animation: cltc-digit-roll var(--transition-duration-relaxed, .3s) cubic-bezier(.16, 1, .3, 1) both"), false);
assert.equal(code.includes("@keyframes cltc-digit-roll"), false);
assert.equal(code.includes("function activateRollingDigitTransitions(slot)"), false);
assert.equal(code.includes('stack.style.transform = `translateY(${toY})`;'), true);
assert.equal(code.includes("oldDigits.set(column.dataset.cltcDigitPosition || \"\", column);"), true);
assert.equal(code.includes("roll.replaceChildren(...nodes);"), true);
assert.equal(code.includes("@keyframes cltc-number-roll-up"), false);
assert.equal(code.includes("@keyframes cltc-number-roll-down"), false);
assert.equal(code.includes("animation: cltc-number-roll .46s cubic-bezier(.16, 1, .3, 1)"), false);
assert.equal(code.includes("const SHIMMER_DELAY_MS = 600"), false);
assert.equal(code.includes("const SHIMMER_ACTIVE_MS = 1000"), true);
assert.equal(code.includes("const SHIMMER_ACTIVE_MS = 250"), false);
assert.equal(code.includes("const SHIMMER_INTERVAL_MS = 4000"), true);
assert.equal(code.includes("const LOCAL_TURN_IDLE_MS"), false);
assert.equal(code.includes("const LOCAL_TURN_RECHECK_MS"), false);
assert.equal(code.includes("const LOCAL_TURN_FINAL_SETTLE_MS"), false);
assert.equal(code.includes("cltc-cadenced-shimmer-active"), true);
assert.equal(code.includes("animation-duration: 1s"), true);
assert.equal(code.includes("animation-duration: 250ms"), false);
assert.equal(code.includes("animation-timing-function: steps(48, end)"), true);
assert.equal(code.includes("animation-delay: var(--cltc-shimmer-active-delay, 0ms)"), true);
assert.equal(code.includes("state.shimmerActiveStartedAt = Date.now()"), true);
assert.equal(code.includes("--cltc-shimmer-active-delay"), true);
assert.equal(code.includes("void state.root?.offsetWidth"), true);
const shimmerPulseBlock = code.match(/function pulseCadencedShimmer\(\) \{[\s\S]*?function stopCadencedShimmer/)?.[0] || "";
assert.equal(shimmerPulseBlock.includes("const activate = () =>"), false);
assert.equal(shimmerPulseBlock.includes("requestAnimationFrame"), false);
assert.equal(shimmerPulseBlock.includes("else activate();"), false);
assert.equal(code.includes("state.shimmerIntervalTimer = window.setInterval(pulseCadencedShimmer, SHIMMER_INTERVAL_MS)"), true);
assert.equal(code.includes('state.root?.removeAttribute("data-reduced-motion-running");'), false);
assert.equal(code.includes('state.root?.setAttribute("data-reduced-motion-running", "true");'), false);
assert.equal(code.includes("clearCadencedShimmerTimers();"), false);
assert.equal(code.includes("if (!state.shimmerIntervalTimer)"), false);
assert.equal(code.includes('data-reduced-motion-running="true"'), false);
assert.equal(code.includes("state.shimmerDelayTimer = window.setTimeout"), false);
assert.equal(code.includes("clearCadencedShimmerTimers({ clearActive: !finishActive })"), true);
assert.equal(code.includes("stopCadencedShimmer({ finishActive: true })"), true);
assert.equal(code.includes('finishLocalTurn(LOCAL_TURN_FINAL_SETTLE_MS'), false);
assert.equal(code.includes("clearLocalTurnTimer(taskCompleteSessionKey)"), true);
assert.equal(code.includes("turnShimmerRunning"), true);
assert.equal(code.includes("function startTurnShimmer(options = {})"), true);
assert.equal(code.includes("function beginLocalRequestTurn(options = {})"), true);
assert.equal(code.includes("function hasAssistantResultOutputStarted"), true);
assert.equal(code.includes("function isTokenCountPayload"), true);
assert.equal(code.includes("function isTaskCompletePayload"), true);
assert.equal(code.includes("const running = isTurnShimmerRunning(sessionKey) || isOfficialThreadRunning(sessionKey);"), true);
assert.equal(code.includes("const resultOutputStarted = hasAssistantResultOutputStarted(payload, source);"), true);
assert.equal(code.includes("if (resultOutputStarted) stopTurnShimmer"), false);
assert.equal(code.includes('persistLocalCurrentTurn("complete", taskCompleteSessionKey, {'), true);
assert.equal(code.includes('durationStatus: "completed",\n          completedAt: taskCompleteTiming.completedAtMs,'), true);
assert.equal(code.includes('persistLocalCurrentTurn("live", sessionKey)'), true);
assert.equal(code.includes("if (persist) turn.calls = [{ usage, source, observedAt: now }]"), false);
assert.equal(code.includes("animation: cltc-cadenced-shimmer-sweep 4s steps(48, end) .6s infinite"), false);
assert.equal(code.includes("animation: cltc-cadenced-shimmer-highlight 4s steps(48, end) .6s infinite"), false);
assert.equal(code.includes("@keyframes cltc-cadenced-shimmer-sweep"), true);
assert.equal(code.includes("@keyframes cltc-cadenced-shimmer-highlight"), true);
assert.equal(code.includes("animation: cltc-loading-shimmer 2s steps(48, end) infinite"), false);
assert.equal(code.includes("@keyframes cltc-loading-shimmer"), false);
assert.equal(code.includes("function cadencedShimmerText(text)"), true);
assert.equal(code.includes("function cadencedShimmerHtml(html)"), true);
assert.equal(code.includes("prefers-reduced-motion: reduce"), true);
assert.equal(code.includes('data-running="true"] .cltc-pill:first-child'), false);
assert.equal(code.includes('if (root.innerHTML !== html) root.innerHTML = html;'), false);
assert.equal(code.includes("function ensureHubSkeleton(root, showOutputRate = outputRateVisible())"), true);
assert.equal(code.includes("function updateValueSlot(root, key, value)"), true);
assert.equal(code.includes('const slot = root.querySelector?.(`[data-cltc-value-key="${key}"]`);'), false);
assert.equal(code.includes('root.innerHTML = hubSkeletonHtml(outputRateEnabled);'), true);
assert.equal(code.includes("root.dataset.cltcSkeletonVersion = VERSION"), true);
assert.equal(code.includes('if (isEditableTarget(event.target)) scheduleRender();'), false);
assert.equal(code.includes("function isCodexTaskRunningDom()"), true);
assert.equal(code.includes("function isCodexComposerCompleteDom()"), true);
assert.equal(code.includes('SEND_ARROW_ICON_PATH_MARKER = "L16.3034 8.69661"'), false);
assert.equal(code.includes("function shouldStartTurnFromRequestPayload"), true);
assert.equal(code.includes("function isComposerDraftPayload"), true);
assert.equal(code.includes("event.isComposing || event.keyCode === 229"), false);
assert.equal(code.includes("停止生成|停止响应|停止任务"), false);
assert.equal(code.includes("function scheduleLocalTurnCompletionCheck"), true);
assert.equal(code.includes("function installTaskRunningObserver()"), true);
assert.equal(code.includes("function finishActiveTurnFromDomIfStopped()"), true);
assert.equal(code.includes("stoppedChecks"), false);
assert.equal(code.includes('setLocalTurnTimer(sessionKey, window.setTimeout?.(check'), false);
assert.equal(code.includes('data-action="new-price">新建</button>'), true);
assert.equal(code.includes('data-action="delete-price" data-variant="danger">隐藏</button>'), true);
assert.equal(code.includes('data-action="close-price">取消</button>'), false);
assert.equal(code.includes('data-settings-panel="profile"'), true);
assert.equal(code.includes('data-settings-panel="general"'), true);
assert.equal(code.includes('data-settings-panel="pricing"'), true);
assert.equal(code.includes("state.settingsPanel = panel"), true);
assert.equal(code.includes('settingsPanel: "usage"'), true);
assert.equal(code.includes("data-cltc-panel-enter"), true);
assert.equal(code.includes("@keyframes cltc-settings-enter"), true);
assert.equal(code.includes('const allowedPanels = ["profile", "general", "usage", "pricing"]'), true);
assert.equal(code.includes('cltc-nav-group">监控'), true);
assert.equal(code.includes("data-profile-locked"), true);
assert.equal(code.includes('<span class="cltc-price-title">Codex Token Cost</span>'), true);
assert.equal(code.includes("cltc-settings-footer"), false);
assert.equal(code.includes("cltc-settings-version"), false);
assert.equal(code.includes('const UPDATE_REMOTE_URL = "https://raw.githubusercontent.com/Tianzora/codex-token-cost/main/scripts/codex-live-token-cost.js";'), true);
assert.equal(code.includes("updateScheduleAutoCheck();"), true);
assert.equal(code.includes('"cltc-update-cluster"'), true);
assert.equal(code.includes('data-action="check-update"'), true);
assert.equal(code.includes("一键更新 v${escapeHtml(state.updateRemoteVersion)}"), true);
assert.equal(code.includes("(0, eval)(sourceText)"), true);
assert.equal(code.includes("cltc-settings-owner"), false);
assert.equal(code.includes("cltc-settings-kicker"), false);
assert.equal(code.includes('<h2>个人资料</h2>'), true);
assert.equal(code.includes('<h2>常规</h2>'), true);
assert.equal(code.includes('<h2>模型价格</h2>'), true);
assert.equal(code.includes('"gpt-5.4-nano"'), true);
assert.equal(code.includes('"gpt-5.6-sol"'), true);
assert.equal(code.includes('data-price-field="cacheWrite"'), true);
assert.equal(code.includes("<span>写缓存</span>"), true);
assert.equal(code.includes("data-price-search"), true);
assert.equal(code.includes('data-price-filter="${value}"'), true);
assert.equal(code.includes('filterButton("all", "全部")'), true);
assert.equal(code.includes("function applyPriceFilter"), true);
assert.equal(code.includes("function syncPriceValidation"), true);
assert.equal(code.includes("cltc-analytics-grid"), true);
assert.equal(code.includes('{ value: "free", label: "Free" }'), true);
assert.equal(code.includes('{ value: "pro_5x", label: "Pro 5x" }'), true);
assert.equal(code.includes('{ value: "pro_20x", label: "Pro 20x" }'), true);
assert.equal(code.includes('{ value: "pro", label: "Pro" }'), false);
assert.equal(code.includes('{ value: "business", label: "Business" }'), true);
assert.equal(code.includes('{ value: "enterprise", label: "Enterprise" }'), true);
assert.equal(code.includes('{ value: "edu", label: "Edu" }'), true);
assert.equal(code.includes('{ value: "staff", label: "Staff" }'), true);
assert.equal(code.includes('{ value: "founder", label: "Founder" }'), true);
assert.equal(code.includes('<h2>常规</h2>'), true);
assert.equal(code.includes("显示 HUD"), true);
assert.equal(code.includes("显示 HUB"), false);
assert.equal(code.includes('data-misc-field="hubVisible"'), true);
assert.equal(code.includes('data-misc-field="outputRateVisible"'), true);
assert.match(code, /显示 HUD[\s\S]*?data-misc-field="hubVisible"[\s\S]*?显示 Token 输出速率[\s\S]*?data-misc-field="outputRateVisible"/);
assert.equal(code.includes('data-misc-field="profileUnlockEnabled"'), true);
assert.equal(code.includes('grid-template-columns: minmax(0, 1.55fr) minmax(0, .70fr) minmax(0, 1fr) minmax(0, .82fr) minmax(0, .82fr) minmax(0, 1.51fr);'), true);
assert.equal(code.includes('grid-template-columns: minmax(0, 2.05fr) repeat(4, minmax(0, .755fr)) minmax(0, 1.20fr);'), true);
assert.equal(code.includes('data-cltc-output-rate-visible="true"'), true);
assert.equal(code.includes("grid-template-columns: minmax(0, 1fr) auto"), true);
assert.equal(code.includes("cltc-price-actions-left"), false);
assert.equal(code.includes(".cltc-settings .cltc-sync-block"), true);
assert.equal(code.includes(".cltc-usage-sync-status"), false);
assert.match(code, /\.cltc-settings \.cltc-settings-section \+ \.cltc-settings-section \{\s*border-top: 1px solid var\(--cltc-border-subtle\);\s*margin-top: 20px;\s*\}/);
assert.match(code, /\.cltc-settings \.cltc-sync-row \{\s*border-top: none;\s*\}/);
assert.equal(code.includes(".cltc-settings-section + .cltc-settings-section .cltc-settings-section-heading h2"), false);
assert.equal(code.includes(".cltc-settings-section + .cltc-settings-section .cltc-settings-section-heading p"), false);
assert.equal(code.includes('busy ? "正在同步…" : "立即同步"'), true);
assert.equal(code.includes("已启用 · 上次静默检查"), false);
assert.equal(code.includes("usageSyncAutoStatusText"), false);
assert.equal(code.includes("自动读取本机 Codex 会话记录，回填缺失的 token 用量；重复同步不会重复计数。"), true);
assert.equal(code.includes("（无需选择文件夹）"), false);
assert.equal(code.includes("自动同步：已启用"), false);
assert.equal(code.includes("点「立即同步」可手动重试"), true);
assert.equal(code.includes('花费 ${valueSlot("session-cost")}'), true);
assert.equal(code.includes('今日 ${valueSlot("day-cost")}'), true);
assert.equal(code.includes('花费 ${valueSlot("session-cost")}${textSlot("session-priced-label")}'), false);
assert.equal(code.includes('今日 ${valueSlot("day-cost")}${textSlot("day-priced-label")}'), false);
assert.equal(code.includes("总消费 ${fmtMoney(snap.sessionCost.value)}"), false);
assert.equal(code.includes("const html = rollingValue(key, value);"), false);
assert.equal(code.includes("updateRollingValueSlot(slot, key, value);"), true);
assert.equal(code.includes('updateValueSlot(root, "session-cost", fmtMoney(snap.sessionCost.value));'), true);
assert.equal(code.includes('本轮 输入 ${valueSlot("current-input")}<span class="cltc-current-spacer" aria-hidden="true">&nbsp;&nbsp;</span>输出 ${valueSlot("current-output")}'), true);
assert.equal(code.includes('data-cltc-output-rate="live"'), true);
assert.equal(code.includes('data-cltc-output-rate="average"'), true);
assert.equal(code.includes('class="cltc-pill cltc-current-pill"><span class="cltc-current-flow">${cadencedShimmerHtml(currentFlow)}</span></span>'), true);
assert.equal(code.includes("FAST_MODE_ICON_PATH"), true);
assert.equal(code.includes("M11.9125 21.4125C11.5292 21.8625"), true);
assert.equal(code.includes('viewBox="0 0 24 24"'), true);
assert.equal(code.includes("M9.80999 17.8302C9.49666 18.1969"), true);
assert.equal(code.includes("OFFICIAL_MODEL_TRIGGER_SELECTOR"), true);
assert.equal(code.includes("function installOfficialModelObserver()"), true);
assert.equal(code.includes("function bindOfficialModelTrigger()"), true);
assert.equal(code.includes("function officialModelInfoFromText"), true);
assert.equal(code.includes("function officialTriggerFastMode"), true);
assert.equal(code.includes("state.detectedFastMode === true"), true);
assert.equal(code.includes("getBoundingClientRect"), true);
assert.equal(code.includes('attributeFilter: ["data-selected-reasoning-effort", "aria-label", "title", "data-state", "class", "style", "hidden", "aria-hidden"]'), true);
assert.equal(code.includes("data-cltc-fast-mode-icon=\"true\""), true);
assert.equal(code.includes('data-cltc-fast-mode-icon="true" hidden'), true);
assert.equal(code.includes("cltc-model-label"), true);
assert.equal(code.includes("cltc-model-text"), true);
assert.equal(code.includes("fastIcon.hidden = !snap.fastMode"), true);
assert.equal(code.includes('if (snap.fastMode) fastIcon.removeAttribute?.("hidden");'), true);
assert.equal(code.includes('else fastIcon.setAttribute?.("hidden", "");'), true);
assert.equal(code.includes("domFastModeActive"), false);
assert.equal(code.includes("|| domFastModeActive()"), false);
assert.equal(code.includes("const domInfo = needsFallback || needsEffort ? domModelInfo() : null"), false);
assert.equal(code.includes("const storedInfo = needsFallback || needsEffort ? storageModelInfo() : null"), false);
assert.equal(code.includes("function domModelInfo()"), false);
assert.equal(code.includes("function storageModelInfo()"), false);
assert.equal(code.includes("lastDomModel"), false);
assert.equal(code.includes("lastStorageModel"), false);
assert.equal(code.includes('modelPill.removeAttribute("title")'), true);
assert.equal(code.includes("自动识别的模型和思考强度"), false);
assert.equal(code.includes('data-cltc-value-key="${escapeHtml(key)}"'), true);
assert.equal(code.includes('updateValueSlot(root, "current-input", fmtCount(snap.current.input));'), true);
assert.equal(code.includes('cadencedShimmerText("本轮 输入")'), false);
assert.equal(code.includes('cadencedShimmerText("输出")'), false);
assert.equal(code.includes(' / ${cadencedShimmerText("输出")}'), false);
assert.equal(code.includes('会话 ${rollingValue("session-total", fmtCount(snap.session.total))} tokens'), false);
assert.equal(code.includes('会话 ${valueSlot("session-total")}'), true);
assert.equal(code.includes('updateValueSlot(root, "day-cost", fmtMoney(snap.dayCost.value));'), true);
assert.equal(code.includes("currentLabel"), false);
assert.equal(code.includes("estimateTokens(editableText())"), false);
assert.equal(code.includes("function estimateTokens("), false);
assert.equal(code.includes("state.pendingInputTokens = tokens"), false);
assert.equal(code.includes("state.lastAssistantText = text"), false);
assert.equal(code.includes(' / 输出 ${fmtCount(snap.current.output)}${currentLabel}'), false);
assert.equal(code.includes("state.helperPollTimer = window.setInterval"), false);
assert.equal(code.includes("helperJsonUntilReady"), false);
assert.equal(code.includes("HELPER_STATUS_DEGRADED"), false);
assert.equal(code.includes("HELPER_BRIDGE_RETRY_DELAYS_MS"), false);
assert.equal(code.includes("helperJsonViaBridgeWithRetry"), false);
assert.equal(code.includes('data-field="helper-status"'), false);
assert.equal(code.includes("codex-local-usage-helper.cjs"), false);
assert.equal(code.includes(">查看脚本</a>"), false);
assert.equal(code.includes("startCcSwitchStartupSync"), false);
assert.equal(code.includes("const HELPER_POLL_MS"), false);
assert.equal(code.includes("const HELPER_STATS_REFRESH_URL = `${HELPER_STATS_URL}?refresh=1`;"), false);
assert.equal(code.includes("profileLedgerRebuildRollup();"), true);
assert.equal(code.includes('const PROFILE_USAGE_QUERY_KEY = ["profile", "usage"]'), true);
assert.equal(code.includes('const PROFILE_ACCOUNT_INFO_QUERY_KEY = ["vscode", "account-info"]'), true);
assert.equal(code.includes('const PROFILE_ACCOUNTS_CHECK_QUERY_KEY = ["accounts", "check"]'), true);
assert.equal(code.includes("const PROFILE_WORKSPACE_ACCOUNT_ENABLED = true"), true);
assert.equal(code.includes("void scheduleProfileAccountsCheckRefresh();"), true);
assert.equal(code.includes("state.helperPollTimer = window.setInterval(() => {\n      void pollLocalHelperStats();"), false);
assert.equal(code.includes("pollLocalHelperStats({ refresh: true }).then(() => profileFetchBody(method, body))"), false);
assert.equal(code.includes("state.timer = window.setInterval(scheduleRender"), false);
assert.equal(code.includes("[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]"), true);
assert.equal(code.includes("[aria-selected='true'][data-app-action-sidebar-thread-id]"), true);
assert.equal(code.includes("lastClickedSidebarThreadKey"), true);
assert.equal(code.includes("rememberSidebarThreadClick"), true);
assert.equal(code.includes("observeSessionInfo(url)"), true);
assert.equal(
  code.indexOf("startupBlankConversationSessionKey() ||") < code.indexOf("recentUserSelectedSidebarThreadKey() ||"),
  true,
);
assert.equal(code.includes("cleanupDuplicateRoots"), true);
assert.equal(code.includes("migrateLegacyLocationSessionTurns(sessionKey)"), true);
assert.equal(code.includes("ensurePriceForModel"), false);
assert.equal(code.includes("priced: localBucket?.priced !== false"), true);
assert.equal(code.includes("state.root?.contains?.(node)"), true);
assert.equal(code.includes('tag === "select" || tag === "option"'), false);
assert.equal(code.includes("__codex(LiveTokenCost|DailyTokenUsage)"), false);
assert.equal(code.includes("recentLedgerModel()"), true);
assert.equal(code.includes("cleanupMisdetectedGpt5Model"), false);
assert.equal(code.includes("cltc-button"), true);
assert.equal(code.includes('addEventListener("change", handleSettingsChange)'), true);
assert.equal(code.includes('closest?.("[data-analytics-preset]")'), false);
assert.equal(code.includes('state.analyticsPreset = ["today", "7d", "30d", "custom"].includes('), false);
assert.equal(code.includes('const analyticsMetric = event.target?.closest?.("[data-analytics-metric]")'), false);
assert.equal(code.includes('closest?.("[data-analytics-start], [data-analytics-end]")'), false);
assert.equal(code.includes('trigger.dataset.open = "true";'), true);
assert.equal(code.includes("delete trigger.dataset.open;"), true);
assert.equal(code.includes('addEventListener("input", handleInput'), false);
assert.equal(code.includes("installHubVisibilityObserver"), true);
assert.equal(code.includes("isHubEntryNode"), false);
assert.equal(code.includes("contentScrollTop"), true);
assert.equal(code.includes("listScrollTop"), true);
assert.equal(code.includes("installProfileRequestClientPatch"), true);
assert.equal(code.includes("installProfileAuthContextPatch"), true);
assert.equal(code.includes("installProfilePhotoUploadPatch"), true);
assert.equal(code.includes("app-initial-"), true);
assert.equal(code.includes("pendingRequests"), true);
assert.equal(code.includes("installElectronBridgeHook"), true);
assert.equal(code.includes("__codexLiveTokenCostProfileLocal"), true);
assert.equal(code.includes("handleProfileFetchResponseEvent"), true);
assert.equal(code.includes("syncOpenProfileAccountMenuIdentity"), false);
assert.equal(code.includes("accountTarget.textContent"), false);
assert.equal(code.includes("data-cltc-profile-account-label"), false);
assert.equal(code.includes("fs/readDirectory"), true);
assert.equal(code.includes("fs/readFile"), true);
assert.equal(code.includes("fs/getMetadata"), true);
assert.equal(code.includes("__codexPlusNativeHostClients"), true);
assert.equal(code.includes("function appServerSyncClient"), true);
assert.equal(code.includes("function usageSyncCollectRowsViaAppServer"), true);
assert.equal(code.includes("function usageSyncResolveCodexRoot"), true);
assert.equal(code.includes("function usageSyncRootFromRolloutPath"), true);
assert.equal(code.includes("function usageSyncBase64ToBytes"), true);
assert.equal(code.includes("function usageSyncIngestRolloutText"), true);
assert.equal(code.includes("function usageSyncFinalizeCollected"), true);
assert.equal(code.includes("function mergeProfileLedgerTurns"), true);
assert.equal(code.includes("function usageAutoSyncTick"), true);
assert.equal(code.includes("function scheduleUsageAutoSync"), true);
assert.equal(code.includes("scheduleUsageAutoSync();"), true);
assert.equal(code.includes("自动同步暂不可用"), true);
assert.match(code, /mergeProfileLedgerTurns\(\s*mergeCodexppHistoryTurns\(/);
assert.equal(code.includes("FALLBACK_DEFAULT_PRICES"), false);
assert.equal(code.includes("model_prices_and_context_window.json"), true);
assert.equal(code.includes("__codexLiveTokenCostRemotePricesV2"), true);
assert.equal(code.includes("function priceUpstreamSnapshot"), true);
assert.equal(code.includes("function priceModelShownByDefault"), true);
assert.equal(code.includes("function priceSyncStatus"), true);
assert.equal(code.includes("litellm_provider"), true);
assert.equal(code.includes("OFFICIAL_PRICE_MODELS"), true);
assert.equal(code.includes("priceModelAtLeastMinVersion"), true);
assert.equal(code.includes('data-action="sync-prices"'), true);
assert.match(code, /\.cltc-settings \.cltc-price-sync \{[\s\S]*?font-size: 12px;[\s\S]*?\}/);

const listeners = new Map();
const windowListeners = new Map();
const storage = new Map();
const bridgeCalls = [];
const delayedTimers = [];
const registerPageCalls = [];
let domComposerState = "none";
const SEND_ARROW_PATH =
  "M9.33467 16.6663V4.93978L4.6374 9.63704L4.1667 9.16634L3.69599 8.69661L9.52998 2.86263L9.63447 2.77767C9.8925 2.60753 10.2433 2.63564 10.4704 2.86263L16.3034 8.69661";
function fakeComposerButton(state) {
  return {
    disabled: false,
    className:
      state === "complete-send"
        ? "cursor-interaction size-token-button-composer bg-token-foreground opacity-50"
        : "cursor-interaction size-token-button-composer bg-token-foreground",
    textContent: "",
    innerText: "",
    getAttribute(name) {
      if (name === "class") return this.className;
      if (name === "data-state") return "closed";
      if (name === "aria-disabled") return "";
      return null;
    },
    querySelector(selector) {
      if (selector !== "svg path") return null;
      return {
        getAttribute(name) {
          return name === "d" ? SEND_ARROW_PATH : null;
        },
      };
    },
    getBoundingClientRect() {
      return { width: 320, height: 28, x: 720, y: 690, bottom: 718, top: 690 };
    },
    contains(node) {
      return Boolean(node?.__composerChild);
    },
  };
}
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
storage.set(
  "__codexLiveTokenCostLocalUsageV1",
  JSON.stringify({
    seq: 1,
    turns: [
      {
        turnId: "turn-1",
        sessionKey: "/",
        source: "codex-live-token-cost",
        model: "gpt-5.5",
        createdAt: "2026-07-04T00:00:00.000Z",
        usage: { input_tokens: 1000, output_tokens: 500, cached_tokens: 200, total_tokens: 1500 },
      },
    ],
  }),
);
storage.set("__codexLiveTokenCostRemotePricesV2", JSON.stringify(seededPriceSnapshot));
const context = {
  console,
  setTimeout(handler, delay = 0) {
    if (typeof handler === "function" && !delay) handler();
    else if (typeof handler === "function") delayedTimers.push({ handler, delay });
    return delayedTimers.length || 1;
  },
  clearTimeout() {},
  setInterval,
  clearInterval,
  Promise,
  Array,
  Map,
  Proxy,
  Reflect,
  WeakSet,
  Response,
  AbortController,
  JSON,
  Date: FixedDate,
  Math,
  Number,
  String,
  RegExp,
  URL,
  TextEncoder,
  TextDecoder,
  atob(value) {
    return Buffer.from(value, "base64").toString("binary");
  },
  btoa(value) {
    return Buffer.from(value, "binary").toString("base64");
  },
  NodeFilter: { SHOW_TEXT: 4 },
  getComputedStyle(node) {
    return {
      display: "block",
      visibility: "visible",
      opacity: node?.className?.includes("opacity-50") ? "0.5" : "1",
    };
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
        appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
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
      if (domComposerState === "active-send" || domComposerState === "complete-send") {
        return [fakeComposerButton(domComposerState)];
      }
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
assert.equal(context.Promise.prototype.then.__codexLiveTokenCostProfileUnlock, undefined);
assert.equal(typeof api.analyticsComparisonText, "function");
assert.equal(api.analyticsComparisonText(0, 0), "暂无对比");
assert.equal(api.analyticsComparisonText(5, 0), "较上期新增");
assert.equal(api.analyticsComparisonText(5, 5), "与上期持平");
assert.equal(api.analyticsComparisonText(0, 5), "较上期 -100%");
assert.equal(typeof api.spoofProfileAccountPayload, "function");
assert.equal(typeof api.beginLocalTurn, "function");
assert.equal(typeof api.persistLocalCurrentTurn, "function");
assert.equal(typeof api.costForModelUsage, "function");
assert.equal(typeof api.costPricedLabel, "function");
assert.equal(typeof api.profileUnlockedSettingsSections, "function");
assert.equal(typeof api.profileUsernameAllowed, "function");
assert.equal(typeof api.applyLocalProfilePatch, "function");
assert.equal(typeof api.patchProfileRequestClient, "function");
assert.equal(typeof api.patchProfilePhotoUploadClient, "function");
assert.equal(typeof api.profileSyntheticEnabled, "function");
assert.equal(typeof api.isRealChatgptAccount, "function");
assert.equal(typeof api.codexAppAssetUrl, "function");
assert.equal(typeof api.spoofProfileAuthContextValue, "function");
assert.equal(typeof api.patchProfileReactAuthContext, "function");
assert.equal(typeof api.profileAuthContextFromFiberNode, "function");
assert.equal(typeof api.profileAuthContextFromDocument, "function");
assert.equal(typeof api.installLocalMessageCapture, "function");
assert.equal(typeof api.localMessageHandler, "function");
assert.equal(typeof api.localProfileResponse, "function");
assert.equal(typeof api.isProfileFetchMessage, "function");
assert.equal(typeof api.extractProfilePhotoDataUrl, "function");
assert.equal(typeof api.applyLocalProfilePhotoUpload, "function");
assert.equal(typeof api.inspectLocalPayload, "function");
assert.equal(typeof api.importLocalUsageTurns, "function");
assert.equal(typeof api.refreshProfileData, "function");
assert.equal(typeof api.profileUsageQueryData, "function");
assert.equal(typeof api.profileAccountInfoQueryData, "function");
assert.equal(typeof api.syncProfileAccountInfoQueryCache, "function");
assert.equal(typeof api.syncProfileUsageQueryCache, "function");
assert.equal(typeof api.extractFastMode, "function");
assert.equal(typeof api.collectProfileInvocations, "function");
assert.equal(typeof api.isComposerDraftPayload, "function");
assert.equal(typeof api.profileLedgerUpsertTurn, "function");
assert.equal(typeof api.profileLedgerObserveLocalTurn, "function");

const hydratedTurnIndex = api.profileLedgerRebuildTurnIndex(
  api.profileNormalizeSnapshot({
    version: 2,
    migrationComplete: true,
    turns: [
      { turnId: "hydrated-index-turn", source: "codex-live-token-cost", usage: { input: 1, output: 2, total: 3 } },
      { turnId: "hydrated-index-other", source: "codex-live-token-cost", usage: { input: 4, output: 5, total: 9 } },
    ],
  }),
);
assert.equal(hydratedTurnIndex.get("hydrated-index-turn"), 0);
assert.equal(hydratedTurnIndex.get("hydrated-index-other"), 1);
api.profileLedgerUpsertTurn({ turnId: "index-upsert-turn", source: "codex-live-token-cost", model: "gpt-5.5" });
api.profileLedgerUpsertTurn({ turnId: "index-upsert-turn", source: "codex-live-token-cost", fastMode: true });
api.profileLedgerUpsertTurn({ turnId: "index-upsert-other", source: "codex-live-token-cost", model: "gpt-5.5" });
const indexedTurns = api.profileLedgerTurns().filter((turn) => turn.turnId.startsWith("index-upsert-"));
assert.equal(indexedTurns.length, 2);
assert.equal(indexedTurns.find((turn) => turn.turnId === "index-upsert-turn").fastMode, true);
assert.equal(
  api.profileLedgerTurnIndex({ turns: api.profileLedgerTurns() }).get("index-upsert-turn"),
  api.profileLedgerTurns().findIndex((turn) => turn.turnId === "index-upsert-turn"),
);
assert.equal(typeof api.shouldStartTurnFromRequestPayload, "function");
assert.equal(typeof api.isTokenCountPayload, "function");
assert.equal(typeof api.isTaskCompletePayload, "function");
assert.equal(typeof api.observeOfficialRuntimePayload, "function");
assert.equal(typeof api.isOfficialThreadRunning, "function");
assert.equal(typeof api.outputTokenRate, "function");
assert.equal(typeof api.averageOutputTokenRate, "function");
assert.equal(typeof api.fmtAverageOutputTokenRate, "function");
assert.equal(typeof api.beginLocalRequestTurn, "function");
assert.equal(typeof api.finishLocalTurn, "function");
assert.equal(typeof api.scheduleLocalTurnCompletionCheck, "function");
assert.equal(typeof api.restoreRunningCurrentTurnFromLast, "function");
assert.equal(typeof api.setLocalCurrentTurn, "function");
assert.equal(typeof api.isCodexComposerCompleteDom, "function");
assert.equal(typeof api.isCodexTaskRunningDom, "function");
assert.equal(typeof api.rememberPendingInput, "function");
assert.equal(typeof api.isMainComposerSurfaceTarget, "function");
assert.equal(typeof api.trapSettingsFocus, "function");
const originalActiveElement = context.document.activeElement;
const modalFocuses = [];
const firstModalControl = { tagName: "BUTTON", focus: () => modalFocuses.push("first") };
const middleModalControl = { tagName: "INPUT", focus: () => modalFocuses.push("middle") };
const lastModalControl = { tagName: "INPUT", focus: () => modalFocuses.push("last") };
const modalFocusOverlay = {
  querySelectorAll: (selector) => {
    assert.match(selector, /a\[href\].*button.*input.*select.*textarea.*\[tabindex\]/);
    return [firstModalControl, middleModalControl, lastModalControl];
  },
};
let tabPrevented = false;
context.document.activeElement = middleModalControl;
assert.equal(api.trapSettingsFocus({ shiftKey: false, preventDefault: () => { tabPrevented = true; } }, modalFocusOverlay), false);
assert.equal(tabPrevented, false);
context.document.activeElement = lastModalControl;
assert.equal(
  api.trapSettingsFocus({ shiftKey: false, preventDefault: () => { tabPrevented = true; } }, modalFocusOverlay),
  true,
);
assert.equal(tabPrevented, true);
assert.deepEqual(modalFocuses, ["first"]);
tabPrevented = false;
context.document.activeElement = firstModalControl;
assert.equal(
  api.trapSettingsFocus({ shiftKey: true, preventDefault: () => { tabPrevented = true; } }, modalFocusOverlay),
  true,
);
assert.equal(tabPrevented, true);
assert.deepEqual(modalFocuses, ["first", "last"]);
context.document.activeElement = originalActiveElement;
assert.equal(typeof api.saveProfilePrefsFromEditor, "function");
assert.equal(typeof api.locationSessionKey, "function");
assert.equal(typeof api.activeSidebarThreadKey, "function");
assert.equal(typeof api.extractSessionKeyFromUrl, "function");
assert.equal(typeof api.extractSessionInfo, "function");
assert.equal(typeof api.extractSessionIdentity, "function");
assert.equal(typeof api.observeSessionInfo, "function");
assert.equal(typeof api.debugSessionState, "function");
assert.equal(typeof api.currentSessionKey, "function");
assert.equal(typeof api.conversationContentState, "function");
assert.equal(typeof api.startupBlankConversationSessionKey, "function");
assert.equal(typeof api.rememberSidebarThreadClick, "function");
assert.equal(typeof api.rememberNewConversationClick, "function");
assert.equal(typeof api.migrateLegacyLocationSessionTurns, "function");
assert.equal(typeof api.currentSessionTurns, "function");
assert.equal(typeof api.localProfileThreadCount, "function");
assert.equal(typeof api.codexppHistoryTurnsFromPayload, "function");
assert.equal(typeof api.mergeCodexppHistoryTurns, "function");
assert.equal(typeof api.localDailyUsage, "function");
const cachedSessionTurns = [{ sessionKey: "cache-thread", usage: { input: 1, output: 1, total: 2 } }];
assert.equal(api.currentSessionTurns(cachedSessionTurns, "cache-thread"), api.currentSessionTurns(cachedSessionTurns, "cache-thread"));
const firstDailyUsage = api.localDailyUsage();
assert.equal(firstDailyUsage, api.localDailyUsage());
assert.equal(typeof api.todayUsage, "function");
assert.equal(typeof api.todayCost, "function");
assert.equal(typeof api.generalSettingsHtml, "function");
assert.equal(typeof api.hubVisible, "function");
assert.equal(typeof api.saveHubVisible, "function");
assert.equal(typeof api.outputRateVisible, "function");
assert.equal(typeof api.saveOutputRateVisible, "function");
assert.equal(typeof api.hubSkeletonHtml, "function");
assert.equal(typeof api.hasCodexProjectContextRow, "function");
assert.equal(typeof api.syncHubVisibility, "function");
assert.equal(typeof api.hasAssistantResultOutputStarted, "function");
assert.equal(typeof api.startTurnShimmer, "function");
assert.equal(typeof api.stopTurnShimmer, "function");
assert.equal(typeof api.updateValueSlot, "function");

const rateNow = Date.now();
assert.equal(api.outputRateVisible(), false);
assert.equal(api.liveSnapshot().outputRateEnabled, false);
assert.equal(api.liveSnapshot().rate.visible, false);
assert.equal(api.currentFlowSkeleton().includes("data-cltc-output-rate"), false);
const legacyHub = api.hubSkeletonHtml(false);
assert.match(legacyHub, /缓存 <span[^>]*data-cltc-value-key="session-cached"[^>]*>[^<]*<\/span> \(<span[^>]*data-cltc-value-key="session-cache-percent"/);
const rateHub = api.hubSkeletonHtml(true);
assert.equal(rateHub.includes('data-cltc-value-key="session-cached"'), false);
assert.match(rateHub, /缓存 <span[^>]*data-cltc-value-key="session-cache-percent"/);
api.saveOutputRateVisible(true);
assert.equal(api.outputRateVisible(), true);
assert.equal(api.liveSnapshot().outputRateEnabled, true);
assert.equal(api.currentFlowSkeleton().includes('data-cltc-output-rate="live"'), true);
assert.equal(api.generalSettingsHtml().includes('data-misc-field="outputRateVisible" checked'), true);
api.saveOutputRateVisible(false);
assert.equal(api.outputRateVisible(), false);
assert.equal(api.currentFlowSkeleton().includes("data-cltc-output-rate"), false);
const liveOutputRate = api.outputTokenRate({ usage: { output: 200 }, outputStartedAt: rateNow - 1000 }, true, rateNow);
assert.equal(liveOutputRate.active, true);
assert.equal(liveOutputRate.visible, true);
assert.equal(liveOutputRate.value, 200);
const completedOutputRate = api.averageOutputTokenRate({ usage: { output: 200 }, startedAt: rateNow - 2000, finishedAt: rateNow }, false);
assert.equal(completedOutputRate.visible, true);
assert.equal(completedOutputRate.value, 100);
assert.equal(api.fmtAverageOutputTokenRate(100), "100.00");

let mirroredValueSlotUpdates = 0;
const fakeRollingRoll = () => ({
  classList: { contains: (name) => name === "cltc-roll" },
  dataset: { rollKey: "current-input" },
  setAttribute() {},
  querySelectorAll() { return []; },
  replaceChildren() { mirroredValueSlotUpdates += 1; },
});
const mirroredValueSlots = [
  { dataset: { cltcValueKey: "current-input" }, firstElementChild: fakeRollingRoll() },
  { dataset: { cltcValueKey: "current-input" }, firstElementChild: fakeRollingRoll() },
];
api.updateValueSlot(
  {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-cltc-value-key]");
      return mirroredValueSlots;
    },
  },
  "current-input",
  "",
);
assert.equal(mirroredValueSlotUpdates, 2);
api.updateValueSlot(
  {
    querySelectorAll() {
      return mirroredValueSlots;
    },
  },
  "current-input",
  "",
);
assert.equal(mirroredValueSlotUpdates, 2);

assert.equal(api.hasAssistantResultOutputStarted({ type: "response.reasoning_summary_text.delta", delta: "thinking" }, "websocket"), false);
assert.equal(api.hasAssistantResultOutputStarted({ type: "response.output_text.delta", delta: "Hello" }, "websocket"), true);
assert.equal(api.hasAssistantResultOutputStarted({ type: "response.output_text.delta", delta: "User prompt" }, "fetch-body"), false);
assert.equal(api.startTurnShimmer(), true);
assert.equal(api.liveSnapshot().running, true);
api.inspectLocalPayload({ type: "response.reasoning_summary_text.delta", delta: "thinking" }, "websocket");
assert.equal(api.liveSnapshot().running, true);
api.inspectLocalPayload({ type: "response.output_text.delta", delta: "Hello" }, "websocket");
assert.equal(api.liveSnapshot().running, true);
api.inspectLocalPayload({ type: "event_msg", payload: { type: "task_complete" } }, "message");
assert.equal(api.liveSnapshot().running, false);
assert.equal(api.isTaskCompletePayload({ type: "task_complete" }), true);
assert.equal(api.isTaskCompletePayload({ type: "event_msg", payload: { type: "task_complete" } }), true);
assert.equal(api.isTaskCompletePayload({ type: "mcp-notification", method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } }), true);
assert.equal(api.isTaskCompletePayload({ type: "mcp-notification", method: "thread/status/changed", params: { threadId: "thread-1", status: { type: "idle" } } }), false);
assert.equal(api.isTaskCompletePayload({ type: "message", data: { type: "event_msg", payload: { type: "task_complete" } } }), true);
assert.equal(typeof api.profileSettingsHtml, "function");
assert.equal(typeof api.pricePopoverHtml, "function");
assert.equal(typeof api.newPriceModelName, "function");
assert.equal(typeof api.deletePriceForModel, "function");
assert.equal(typeof api.restoreDefaultPrices, "function");
assert.equal(typeof api.refreshDefaultPrices, "function");
assert.equal(typeof api.priceUpstreamSnapshot, "function");
assert.equal(typeof api.priceModelShownByDefault, "function");
assert.equal(typeof api.priceSyncStatus, "function");
assert.equal(typeof api.priceSyncDownloadCommand, "function");
assert.equal(typeof api.visiblePrices, "function");
assert.equal(typeof api.priceFor, "function");
assert.equal(typeof api.priceModelKey, "function");
assert.equal(typeof api.priceListModels, "function");
assert.equal(typeof api.priceListModelLabel, "function");
assert.equal(typeof api.cleanupAutoZeroPriceModels, "function");
assert.equal(typeof api.recentLedgerModel, "function");
assert.equal(typeof api.emptyDailyUsageBucket, "function");
assert.equal(typeof api.addTurnToDailyBucket, "function");
assert.equal(typeof api.turnCost, "function");
assert.equal(typeof api.localDateKey, "function");
assert.equal(typeof api.analyticsRangeForPreset, "function");
assert.equal(typeof api.analyticsComparisonRange, "function");
assert.equal(typeof api.analyticsVisibleTurns, "function");
assert.equal(typeof api.aggregateUsageAnalytics, "function");
assert.equal(typeof api.buildAnalyticsRollup, "function");
assert.equal(typeof api.analyticsTurnsFromRollup, "function");
assert.equal(typeof api.loadAnalyticsRollup, "function");
assert.equal(typeof api.saveAnalyticsRollup, "function");
assert.equal(typeof api.usageAnalyticsHtml, "function");
assert.equal(typeof api.analyticsChartBuckets, "function");
assert.equal(typeof api.localProfileAccountsCheckResponse, "function");
assert.equal(typeof api.profileUiAuthContextValue, "function");
assert.deepEqual(JSON.parse(JSON.stringify(api.visiblePrices())), upstreamSnapshotFixture.prices);
assert.deepEqual(JSON.parse(JSON.stringify(api.priceUpstreamSnapshot(upstreamPriceFixture))), upstreamSnapshotFixture);
assert.equal(Object.hasOwn(api.visiblePrices(), "claude-sonnet-4"), false);
assert.equal(Object.hasOwn(api.visiblePrices(), "container-free"), false);
assert.equal(api.priceModelShownByDefault("gpt-5.6-sol"), true);
assert.equal(api.priceModelShownByDefault("gpt-5.4"), true);
assert.equal(api.priceModelShownByDefault("gpt-5.5"), true);
assert.equal(api.priceModelShownByDefault("gpt-5.3-codex"), false);
assert.equal(api.priceModelShownByDefault("gpt-5.2"), false);
assert.equal(api.priceModelShownByDefault("gpt-5.9-alias"), false);
assert.equal(api.priceModelShownByDefault("gpt-image-2"), false);
assert.equal(api.priceModelShownByDefault("o3"), false);
assert.equal(api.priceModelShownByDefault("claude-sonnet-4"), false);
assert.equal(api.priceListModels().includes("gpt-5.6-sol"), true);
assert.equal(api.priceListModels().includes("gpt-5.4"), true);
assert.equal(api.priceListModels().includes("gpt-5.3-codex"), false);
assert.equal(api.priceListModels().includes("gpt-5.2"), false);
assert.equal(api.priceListModels().includes("gpt-5.9-alias"), false);
assert.equal(api.priceListModels("gpt-5.9-alias").includes("gpt-5.9-alias"), true);
assert.equal(api.priceListModels().includes("gpt-image-2"), false);
assert.equal(api.priceListModels().includes("o3"), false);
assert.equal(api.priceListModels().includes("codex-mini-latest"), false);
assert.equal(api.priceListModels("o3").includes("o3"), true);
assert.deepEqual(api.priceListableUsedNames(["deepseek-v4-flash", "GPT-5.5", "gpt-5.3-codex", "gpt-5.4", "gpt-audio", null, ""]), ["GPT-5.5", "gpt-5.4"]);
assert.equal(api.priceSyncStatus().tone, "ok");
assert.match(api.priceSyncStatus().text, /^上游价格（LiteLLM）· 同步于 \d{2}-\d{2} \d{2}:\d{2}$/);
assert.equal(api.currentSessionKey().startsWith("new:startup:"), true);
assert.equal(api.currentSessionTurns(api.localUsageExport().turns).length, 0);
assert.equal(api.liveSnapshot().session.total, 0);
assert.equal(api.liveSnapshot().dayUsage.total, 1500);
assert.equal(api.liveSnapshot().dayCost.value > 0, true);
assert.equal(api.rollComparableValue("1.2M"), 1200000);
assert.equal(api.rollComparableValue("$4.18"), 4.18);
assert.equal(api.rollTrend("1K", "2K"), "up");
assert.equal(api.rollTrend("$2.00", "$1.00"), "down");
assert.equal(api.rollTrend("high", "low"), "same");
const localBoundaryTime = new Date(2026, 6, 11, 0, 30, 0, 0).getTime();
assert.equal(api.localDateKey(localBoundaryTime), "2026-07-11");
const todayRange = api.analyticsRangeForPreset("today", localBoundaryTime);
assert.equal(todayRange.startMs, new Date(2026, 6, 11, 0, 0, 0, 0).getTime());
assert.equal(todayRange.endMs, localBoundaryTime);
const previousTodayRange = api.analyticsComparisonRange(todayRange, "today");
assert.equal(previousTodayRange.startMs, new Date(2026, 6, 10, 0, 0, 0, 0).getTime());
assert.equal(previousTodayRange.endMs, new Date(2026, 6, 10, 0, 30, 0, 0).getTime());
const analyticsTurns = [
  {
    turnId: "cc-day",
    source: "cc-switch",
    importedAt: localBoundaryTime,
    createdAt: new Date(2026, 6, 11, 0, 0).toISOString(),
    timeGranularity: "hour",
    model: "gpt-5.6-sol",
    callCount: 4,
    usage: { input: 100, output: 20, cached: 40, cacheWriteTokens: 10, total: 120, exact: true },
  },
  {
    turnId: "local-before-import",
    source: "codex-live-token-cost",
    createdAt: new Date(localBoundaryTime - 60_000).toISOString(),
    observedAt: localBoundaryTime - 60_000,
    model: "gpt-5.6-sol",
    callCount: 1,
    usage: { input: 10, output: 1, cached: 2, total: 11, exact: true },
  },
  {
    turnId: "local-after-import",
    source: "codex-live-token-cost",
    createdAt: new Date(localBoundaryTime + 60_000).toISOString(),
    observedAt: localBoundaryTime + 60_000,
    model: "unknown-test-model",
    callCount: 2,
    usage: { input: 30, output: 5, cached: 6, cacheWriteTokens: 4, total: 35, exact: true },
  },
];
const visibleAnalyticsTurns = api.analyticsVisibleTurns(analyticsTurns);
assert.deepEqual(
  visibleAnalyticsTurns.map((turn) => turn.turnId),
  ["cc-day", "local-before-import", "local-after-import"],
);
const analytics = api.aggregateUsageAnalytics(visibleAnalyticsTurns, {
  startMs: new Date(2026, 6, 11, 0, 0).getTime(),
  endMs: new Date(2026, 6, 11, 23, 59, 59, 999).getTime(),
});
assert.equal(analytics.totalTokens, 166);
assert.equal(analytics.calls, 7);
assert.equal(analytics.input, 140);
assert.equal(analytics.output, 26);
assert.equal(analytics.cacheRead, 48);
assert.equal(analytics.cacheWrite, 14);
assert.equal(analytics.cacheWriteAvailable, true);
assert.equal(analytics.regularInput, 78);
assert.equal(analytics.cacheHitRate, Math.round((48 / 140) * 100));
assert.equal(analytics.priced, false);
assert.equal(analytics.models.length, 2);
assert.equal(analytics.models.find((item) => item.model === "unknown-test-model").priced, false);
const futureDatedCcDayAggregate = api.aggregateUsageAnalytics(
  [
    {
      turnId: "cc-future-same-day",
      source: "cc-switch",
      importSource: "cc-switch",
      createdAt: new Date(2026, 6, 11, 20, 0).toISOString(),
      observedAt: new Date(2026, 6, 11, 20, 0).getTime(),
      importedAt: new Date(2026, 6, 11, 15, 0).getTime(),
      model: "gpt-5.6-sol",
      callCount: 3,
      usage: { input: 100, output: 20, cached: 40, total: 120, exact: true },
    },
  ],
  {
    startMs: new Date(2026, 6, 11, 0, 0).getTime(),
    endMs: new Date(2026, 6, 11, 23, 59, 59, 999).getTime(),
  },
);
assert.equal(futureDatedCcDayAggregate.totalTokens, 120);
assert.equal(futureDatedCcDayAggregate.calls, 3);
const analyticsRollup = api.buildAnalyticsRollup(visibleAnalyticsTurns);
assert.equal(analyticsRollup.days["2026-07-11"].models["gpt-5.6-sol"].calls, 5);
assert.equal(analyticsRollup.days["2026-07-11"].models["unknown-test-model"].usage.cacheWriteTokens, 4);
const analyticsRollupTurns = api.analyticsTurnsFromRollup(analyticsRollup);
assert.equal(analyticsRollupTurns.length, 2);
assert.equal(analyticsRollupTurns.find((turn) => turn.model === "gpt-5.6-sol").callCount, 5);
assert.equal(api.saveAnalyticsRollup(analyticsRollup), true);
assert.equal(api.loadAnalyticsRollup().days["2026-07-11"].models["unknown-test-model"].calls, 2);
const cappedLedger = api.trimLocalLedger(
  [
    ...Array.from({ length: 2001 }, (_, index) => ({
      turnId: `local-cap-${index}`,
      source: "codex-live-token-cost",
      createdAt: new Date(Date.UTC(2026, 4, 3, 0, 0, index)).toISOString(),
      usage: { input: 1, output: 0, cached: 0, total: 1, exact: true },
    })),
    {
      turnId: "cc-history-ancient",
      source: "cc-switch",
      importSource: "cc-switch",
      createdAt: "2024-02-14T12:00:00.000Z",
      usage: { input: 100, output: 1, cached: 90, total: 101, exact: true },
    },
    {
      turnId: "cc-history-may",
      source: "cc-switch",
      importSource: "cc-switch",
      createdAt: "2026-05-02T12:00:00.000Z",
      usage: { input: 200, output: 2, cached: 180, total: 202, exact: true },
    },
  ],
);
assert.equal(cappedLedger.length, 2000);
assert.equal(cappedLedger.filter((turn) => turn.source === "codex-live-token-cost").length, 1998);
assert.equal(cappedLedger.some((turn) => turn.turnId === "cc-history-ancient"), true);
assert.equal(cappedLedger.some((turn) => turn.turnId === "cc-history-may"), true);
assert.deepEqual(
  cappedLedger.slice(-2).map((turn) => turn.turnId),
  ["cc-history-ancient", "cc-history-may"],
);
const compactedLedger = api.compactLocalLedger([
  ...Array.from({ length: 2001 }, (_, index) => ({
    turnId: `local-archive-${index}`,
    source: "codex-live-token-cost",
    model: "gpt-5.5",
    createdAt: new Date(Date.UTC(2024, 0, 1, 0, 0, index)).toISOString(),
    usage: { input: 1, output: 0, cached: 0, total: 1, exact: true },
  })),
]);
assert.equal(compactedLedger.turns.length, 2000);
assert.equal(compactedLedger.archived, 1);
assert.equal(api.localUsageArchiveTurns(compactedLedger.archive).reduce((sum, turn) => sum + turn.usage.total, 0), 1);
const recompactedLedger = api.compactLocalLedger(
  compactedLedger.turns.concat({
    turnId: "local-archive-next",
    source: "codex-live-token-cost",
    model: "gpt-5.5",
    createdAt: "2024-01-02T00:00:00.000Z",
    usage: { input: 2, output: 0, cached: 0, total: 2, exact: true },
  }),
  compactedLedger.archive,
);
assert.equal(recompactedLedger.turns.length, 2000);
assert.equal(api.localUsageArchiveTurns(recompactedLedger.archive).reduce((sum, turn) => sum + turn.usage.total, 0), 2);
const todayBuckets = api.analyticsChartBuckets(
  visibleAnalyticsTurns,
  { startMs: new Date(2026, 6, 11, 0, 0).getTime(), endMs: new Date(2026, 6, 11, 23, 59, 59, 999).getTime() },
  "tokens",
);
assert.equal(todayBuckets.length, 24);
assert.equal(todayBuckets[0].key, "hour:0");
assert.equal(todayBuckets[0].value, 166);
const dailyOnlyBuckets = api.analyticsChartBuckets(
  [
    {
      turnId: "cc-daily-only",
      source: "cc-switch",
      importSource: "cc-switch",
      timeGranularity: "day",
      createdAt: new Date(2026, 6, 11, 12, 0).toISOString(),
      model: "gpt-5.5",
      usage: { input: 50, output: 5, cached: 20, total: 55, exact: true },
    },
  ],
  { startMs: new Date(2026, 6, 11, 0, 0).getTime(), endMs: new Date(2026, 6, 11, 23, 59, 59, 999).getTime() },
  "tokens",
);
assert.equal(dailyOnlyBuckets.length, 24);
assert.equal(dailyOnlyBuckets[0].value, 0);
assert.equal(dailyOnlyBuckets[12].value, 55);
const weeklyBuckets = api.analyticsChartBuckets(
  [],
  { startMs: new Date(2026, 0, 1).getTime(), endMs: new Date(2026, 3, 30, 23, 59, 59, 999).getTime() },
  "tokens",
);
assert.equal(weeklyBuckets.length, 18);
const analyticsHtml = api.usageAnalyticsHtml({
  now: localBoundaryTime,
  preset: "today",
  turns: visibleAnalyticsTurns,
});
assert.equal(analyticsHtml.includes("<h2>使用统计</h2>"), true);
assert.equal(analyticsHtml.includes('data-analytics-preset="today"'), true);
assert.equal(analyticsHtml.includes('class="cltc-segmented"'), true);
assert.equal(analyticsHtml.includes('data-analytics-preset="7d"'), true);
assert.equal(analyticsHtml.includes('data-analytics-preset="30d"'), true);
assert.equal(analyticsHtml.includes('data-analytics-preset="custom"'), true);
assert.equal(analyticsHtml.includes('data-action="open-analytics-calendar"'), true);
assert.equal(analyticsHtml.includes('<div class="cltc-analytics-date-range" hidden>'), true);
assert.equal(analyticsHtml.includes('class="cltc-date-range-icon"'), true);
assert.equal(analyticsHtml.includes('class="cltc-date-range-label"'), true);
assert.equal(analyticsHtml.includes('class="cltc-date-range-chevron"'), true);
assert.equal(analyticsHtml.includes('data-empty="true"'), true);
assert.equal(analyticsHtml.includes("选择日期范围"), true);
assert.equal(analyticsHtml.includes('data-analytics-metric="tokens"'), true);
assert.equal(analyticsHtml.includes('data-analytics-metric="cost"'), true);
assert.equal(analyticsHtml.includes("总 Token"), true);
assert.equal(analyticsHtml.includes("总花费"), true);
assert.equal(analyticsHtml.includes("模型调用"), true);
assert.equal(analyticsHtml.includes("缓存命中率"), true);
assert.equal(analyticsHtml.includes('data-analytics-chart="true"'), true);
assert.equal(analyticsHtml.includes("· 部分统计"), false);
assert.equal(analyticsHtml.includes("cltc-analytics-split"), true);
assert.match(analyticsHtml, /cltc-analytics-grid[\s\S]*?<line/);
assert.equal(analyticsHtml.includes("cltc-analytics-tooltip"), true);
assert.equal(analyticsHtml.includes('viewBox="0 0 720 230"'), true);
assert.match(analyticsHtml, /data-chart-index="0"[^>]* y="36"/);
assert.match(analyticsHtml, /cltc-analytics-tooltip[\s\S]*?<rect[^>]* y="11"/);
assert.equal(analyticsHtml.includes("Token 构成"), true);
const costAnalyticsHtml = api.usageAnalyticsHtml({
  now: localBoundaryTime,
  preset: "7d",
  metric: "cost",
  turns: visibleAnalyticsTurns,
});
assert.equal(costAnalyticsHtml.includes('data-analytics-preset="7d"'), true);
assert.equal(costAnalyticsHtml.includes('<button type="button" data-analytics-preset="7d" data-active="true" aria-pressed="true">7 天</button>'), true);
assert.equal(costAnalyticsHtml.includes('<button type="button" data-analytics-metric="cost" data-active="true" aria-pressed="true">花费</button>'), true);
const customRangeHtml = api.usageAnalyticsHtml({
  now: localBoundaryTime,
  preset: "custom",
  customStart: "2026-07-01",
  customEnd: "2026-07-11",
  turns: visibleAnalyticsTurns,
});
assert.equal(customRangeHtml.includes('<div class="cltc-analytics-date-range">'), true);
assert.equal(customRangeHtml.includes('data-empty="false"'), true);
assert.equal(customRangeHtml.includes("2026-07-01 – 2026-07-11"), true);
assert.equal(customRangeHtml.includes('data-action="clear-analytics-range"'), true);
assert.equal(customRangeHtml.includes('<div class="cltc-analytics-date-range" hidden>'), false);
assert.equal(analyticsHtml.includes("写缓存"), true);
assert.equal(analyticsHtml.includes("模型明细"), true);
const unavailableCacheWriteHtml = api.usageAnalyticsHtml({
  now: new Date(2026, 6, 11, 15, 0).getTime(),
  preset: "today",
  turns: [
    {
      turnId: "cc-no-cache-write-field",
      source: "cc-switch",
      timeGranularity: "hour",
      createdAt: new Date(2026, 6, 11, 12, 0).toISOString(),
      model: "gpt-5.6-sol",
      usage: { input: 100, output: 10, cached: 80, total: 110, exact: true },
    },
  ],
});
assert.equal(unavailableCacheWriteHtml.includes("写缓存<strong>未提供</strong>"), true);
assert.equal(context.__codexLiveTokenCost.version, "0.7.10-beta1");
assert.equal(api.currentSessionKey().startsWith("new:startup:"), true);
assert.equal(api.extractSessionKeyFromUrl("/thread/thread-1"), "thread-1");
assert.equal(api.extractSessionKeyFromUrl("/api/conversation?conversationId=thread-1"), "thread-1");
assert.equal(api.extractSessionInfo({ bodyJsonString: JSON.stringify({ threadId: "thread-1" }) }), "thread-1");
assert.equal(api.extractSessionInfo({ turn: { threadId: "thread-turn" } }), "thread-turn");
assert.equal(api.extractSessionInfo({ params: { turn: { threadId: "thread-param-turn" } } }), "thread-param-turn");
assert.equal(api.extractSessionInfo({ thread: { id: "thread-object" } }), "thread-object");
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      api.extractSessionIdentity({
        threadId: "canonical-thread",
        sessionId: "runtime-session",
        turnId: "turn-1",
        requestId: "request-1",
        streamId: "stream-1",
      }),
    ),
  ),
  {
    threadKey: "canonical-thread",
    conversationKey: "",
    runtimeSessionKey: "runtime-session",
    turnId: "turn-1",
    requestId: "request-1",
    streamId: "stream-1",
  },
);
assert.equal(
  api.activeSidebarThreadKey({
    querySelector(selector) {
      if (selector === "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]") {
        return {
          getAttribute(name) {
            return name === "data-app-action-sidebar-thread-id" ? "local:thread-1" : "";
          },
        };
      }
      return null;
    },
  }),
  "local:thread-1",
);
assert.equal(
  api.activeSidebarThreadKey({
    querySelector(selector) {
      if (selector === "[aria-selected='true'][data-app-action-sidebar-thread-id]") {
        return {
          getAttribute(name) {
            return name === "data-app-action-sidebar-thread-id" ? "local:thread-selected" : "";
          },
        };
      }
      return null;
    },
  }),
  "local:thread-selected",
);
assert.equal(
  api.activeSidebarThreadKey({
    querySelector(selector) {
      if (selector === "[data-state='active'][data-app-action-sidebar-thread-id]") {
        return {
          getAttribute(name) {
            return name === "data-app-action-sidebar-thread-id" ? "local:thread-state-active" : "";
          },
        };
      }
      return null;
    },
  }),
  "local:thread-state-active",
);
storage.set("codex-host-model-settings", "GPT-5 from unrelated host text");
assert.equal(api.activeModelInfo().model, "未知");
const modelLedgerThreadNode = {
  getAttribute(name) {
    return name === "data-app-action-sidebar-thread-id" ? "/" : "";
  },
  closest(selector) {
    return selector === "[data-app-action-sidebar-thread-id]" ? this : null;
  },
};
api.rememberSidebarThreadClick({ type: "click", target: modelLedgerThreadNode });
assert.equal(api.activeModelInfo().model, "gpt-5.5");
api.rememberNewConversationClick({
  type: "click",
  target: {
    textContent: "New chat",
    innerText: "New chat",
    getAttribute() {
      return "";
    },
    closest() {
      return this;
    },
  },
});
assert.deepEqual(
  api.currentSessionTurns([
    { sessionKey: "/", usage: { input: 1, output: 1, total: 2 } },
    { sessionKey: "/other", usage: { input: 100, output: 100, total: 200 } },
    { usage: { input: 1000, output: 1000, total: 2000 } },
  ], "/").map((turn) => turn.sessionKey),
  ["/"],
);
assert.equal(
  api.currentSessionTurns([
    { sessionKey: "new:auto", usage: { input: 10, output: 2, cached: 8, total: 12 } },
  ], "new:auto").length,
  0,
);
assert.equal(api.generalSettingsHtml().includes("常规"), true);
assert.equal(api.generalSettingsHtml().includes("管理 HUD 显示、本地资料与历史数据同步"), true);
assert.equal(api.generalSettingsHtml().includes("自动读取本机会话记录，重复同步不会重复计数。"), false);
const syncSectionHtml = api.generalSettingsHtml();
assert.equal(syncSectionHtml.includes("<h2>历史数据同步</h2>"), false);
assert.equal(syncSectionHtml.includes("<strong>历史数据同步</strong>"), true);
assert.equal(syncSectionHtml.includes("自动读取本机 Codex 会话记录，回填缺失的 token 用量；重复同步不会重复计数。"), true);
assert.equal(syncSectionHtml.includes("cltc-settings-row cltc-sync-row"), true);
assert.equal(syncSectionHtml.includes("<strong>自动同步</strong>"), false);
assert.equal(syncSectionHtml.includes('data-field="usage-sync-auto"'), false);
assert.equal(syncSectionHtml.includes('data-action="sync-usage"'), true);
assert.equal(syncSectionHtml.includes("立即同步"), true);
assert.equal(syncSectionHtml.includes("正在同步"), false);
assert.equal(code.includes("handleDocumentSettingsChange"), false);
assert.equal(code.includes("data-profile-field=\"planCustom\""), true);
assert.equal(code.includes('data-action="save-profile"'), true);
assert.doesNotMatch(code, /\.cltc-settings-embedded \[data-profile-field\]/);
const profileEditorFields = {
  "[data-profile-field='email']": { value: "custom@example.com" },
  "[data-profile-field='accountStructure']": { value: "workspace" },
  "[data-profile-field='workspaceName']": { value: "Tian Workspace" },
  "[data-profile-field='planType']": { value: "custom" },
  "[data-profile-field='planCustom']": { value: "Team Enterprise" },
};
assert.equal(
  api.saveProfilePrefsFromEditor({
    querySelector(selector) {
      return profileEditorFields[selector] || null;
    },
  }),
  true,
);
const savedProfilePrefs = JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1"));
assert.equal(savedProfilePrefs.email, "sama@openai.com");
assert.equal(savedProfilePrefs.accountStructure, "personal");
assert.equal(savedProfilePrefs.workspaceName, "Codex Workspace");
assert.equal(savedProfilePrefs.planType, "Team Enterprise");
assert.equal(savedProfilePrefs.planLabel, "Team Enterprise");
assert.equal(storage.get("__codexLiveTokenCostProfileDefaultsV1"), undefined);
assert.equal(code.includes("function profileSaveToastHtml()"), true);
assert.equal(code.includes("PROFILE_SAVE_STATUS_DURATION_MS = 1800"), true);
assert.match(code, /\.cltc-settings-overlay \.cltc-profile-save-toast \{[\s\S]*?position: fixed;/);
assert.equal(api.profileSettingsHtml().includes('data-field="profile-save-status"'), false);
assert.equal(api.profileSettingsHtml().includes("data-profile-field=\"email\""), false);
assert.equal(api.profileSettingsHtml().includes("这里修改的是本地显示资料，不会修改真实订阅权限"), false);
assert.equal(api.profileSettingsHtml().includes('value="custom"'), true);
assert.equal(api.profileSettingsHtml().includes('data-profile-field="planCustom"'), true);
assert.doesNotMatch(api.profileSettingsHtml(), /data-profile-field="accountStructure"/);
assert.doesNotMatch(api.profileSettingsHtml(), /data-profile-field="workspaceName"/);
assert.equal(api.profileSettingsHtml().includes('<option value="workspace"'), false);
assert.equal(api.profileSettingsHtml().match(/title="新版本不再允许全局伪装账号"/g)?.length || 0, 0);
assert.equal(api.profileSaveToastHtml().includes('class="cltc-profile-save-toast"'), true);
assert.equal(api.profileSaveToastHtml().includes('role="status"'), true);
assert.equal(api.profileSaveToastHtml().includes('aria-live="polite"'), true);
assert.equal(api.profileSaveToastHtml().includes('data-visible="true"'), true);
assert.equal(api.profileSaveToastHtml().includes('data-tone="success"'), true);
profileEditorFields["[data-profile-field='planType']"].value = "pro_20x";
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "sama@openai.com");
api.applyLocalProfilePatch({ email: "sama@openai.com" });
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "sama@openai.com");
assert.equal(storage.get("__codexLiveTokenCostProfileDefaultsV1"), undefined);
api.applyLocalProfilePatch({ email: "sama@openai.com", planType: "pro_20x" });
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "sama@openai.com");
storage.set(
  "__codexLiveTokenCostProfilePrefsV1",
  JSON.stringify({ ...JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")), email: "sama@openai.com" }),
);
api.applyLocalProfilePatch({ planType: "pro_20x" });
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "sama@openai.com");
profileEditorFields["[data-profile-field='email']"].value = "sama@openai.com";
profileEditorFields["[data-profile-field='accountStructure']"].value = "personal";
profileEditorFields["[data-profile-field='workspaceName']"].value = "Tian Workspace";
profileEditorFields["[data-profile-field='planType']"].value = "pro_20x";
profileEditorFields["[data-profile-field='planCustom']"].value = "";
assert.equal(
  api.saveProfilePrefsFromEditor({
    querySelector(selector) {
      return profileEditorFields[selector] || null;
    },
  }),
  true,
);
assert.equal(api.generalSettingsHtml().includes("显示 HUD"), true);
assert.equal(api.generalSettingsHtml().includes("显示 HUB"), false);
assert.equal(api.generalSettingsHtml().includes('data-misc-field="hubVisible"'), true);
assert.equal(api.generalSettingsHtml().includes('data-misc-field="outputRateVisible"'), true);
assert.equal(api.generalSettingsHtml().includes('data-misc-field="profileUnlockEnabled"'), false);
assert.equal(api.profileSettingsHtml().includes('data-misc-field="profileUnlockEnabled"'), true);
function startupDom({ composer = true, activeThread = false, transcript = false } = {}) {
  const activeThreadNode = activeThread
    ? {
        getAttribute(name) {
          return name === "data-app-action-sidebar-thread-id" ? "local:active-thread" : "";
        },
        closest(selector) {
          return selector === "[data-app-action-sidebar-thread-id]" ? this : null;
        },
      }
    : null;
  const main = {
    querySelector(selector) {
      if (composer && String(selector).includes("data-codex-composer")) return { nodeType: 1 };
      if (transcript && String(selector).includes("data-turn-id")) return { nodeType: 1 };
      return null;
    },
  };
  return {
    querySelector(selector) {
      if (selector === "main") return main;
      if (activeThread && String(selector).includes("data-app-action-sidebar-thread-active")) return activeThreadNode;
      return null;
    },
  };
}
assert.equal(
  api.startupBlankConversationSessionKey(startupDom()),
  "new:auto",
);
assert.equal(
  api.startupBlankConversationSessionKey(startupDom({ composer: false })),
  "",
);
const startupBlankRunningSessionKey = "startup-blank-running-thread";
const startupBlankGuardTurn = api.beginLocalTurn({ sessionKey: startupBlankRunningSessionKey, forceNewIfUsed: true });
const startupBlankGuardSessionKey = startupBlankGuardTurn.sessionKey;
assert.equal(startupBlankGuardSessionKey, startupBlankRunningSessionKey);
assert.equal(
  api.startupBlankConversationSessionKey(startupDom()),
  "",
);
api.finishLocalTurn(0, { reason: "startup-blank-test", force: true, sessionKey: startupBlankGuardSessionKey });
currentNow = FIXED_NOW + 61000;
assert.equal(
  api.startupBlankConversationSessionKey(startupDom()),
  "new:auto",
);
assert.equal(
  api.startupBlankConversationSessionKey(startupDom({ activeThread: true })),
  "",
);
currentNow = FIXED_NOW;
assert.equal(
  api.startupBlankConversationSessionKey(startupDom({ transcript: true })),
  "",
);
api.observeSessionInfo({ threadId: "detected-content-thread" });
assert.equal(api.startupBlankConversationSessionKey(startupDom()), "new:auto");
assert.equal(api.conversationContentState("detected-content-thread", startupDom()).state, "unknown");
bridgeCalls.length = 0;
assert.equal(
  api.rememberNewConversationClick({
    type: "click",
    target: {
      textContent: "New chat",
      getAttribute() {
        return "";
      },
      closest() {
        return this;
      },
    },
  }),
  true,
);
const transientImportResult = api.importLocalUsageTurns([
  {
    turnId: "transient-new-auto",
    sessionKey: "new:auto",
    model: "gpt-5.5",
    createdAt: "2026-06-02T12:00:00.000Z",
    usage: { input: 10, output: 2, cached: 8, total: 12 },
  },
]);
assert.equal(transientImportResult.imported, 0);
assert.equal(transientImportResult.skipped, 1);
assert.equal(api.liveSnapshot().session.total, 0);
assert.equal(api.generalSettingsHtml().includes('data-field="cc-switch-sync-status"'), false);
assert.equal(api.generalSettingsHtml().includes('data-field="helper-status"'), false);
assert.equal(api.generalSettingsHtml().includes("Helper"), false);
function hubTestRoot() {
  const attributes = new Map();
  const style = {
    display: "",
    setProperty(name, value) {
      if (name === "display") this.display = value;
    },
    removeProperty(name) {
      if (name === "display") this.display = "";
    },
  };
  return {
    dataset: {},
    style,
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
  };
}
const hubRoot = hubTestRoot();
const projectContextRowDoc = {
  querySelector(selector) {
    return selector ===
      "[data-codex-composer-root] [data-composer-utility-bar-scroll-area] [data-composer-navigation-target='workspace-project']"
      ? {}
      : null;
  },
};
const legacyProjectContextRowDoc = {
  querySelector(selector) {
    return selector === ".composer-surface-chrome .flex.flex-wrap.items-center.gap-2.overflow-visible.pr-2.pl-2" ? {} : null;
  },
};
const noProjectContextRowDoc = {
  querySelector() {
    return null;
  },
};
assert.equal(api.hubVisible(), true);
assert.equal(api.hasCodexProjectContextRow(projectContextRowDoc), true);
assert.equal(api.hasCodexProjectContextRow(legacyProjectContextRowDoc), false);
assert.equal(api.hasCodexProjectContextRow(noProjectContextRowDoc), false);
assert.equal(api.syncHubVisibility(hubRoot, projectContextRowDoc), false);
assert.equal(hubRoot.style.display, "none");
assert.equal(hubRoot.dataset.cltcProjectContextRow, "true");
assert.equal(hubRoot.getAttribute("aria-hidden"), "true");
assert.equal(api.syncHubVisibility(hubRoot, noProjectContextRowDoc), true);
assert.equal(hubRoot.style.display, "");
assert.equal(hubRoot.dataset.cltcProjectContextRow, "false");
assert.equal(hubRoot.getAttribute("aria-hidden"), "false");
api.saveHubVisible(false);
assert.equal(api.syncHubVisibility(hubRoot, noProjectContextRowDoc), false);
assert.equal(hubRoot.style.display, "none");
assert.equal(hubRoot.dataset.cltcHubVisible, "false");
assert.equal(hubRoot.getAttribute("aria-hidden"), "true");
api.saveHubVisible(true);
assert.equal(api.syncHubVisibility(hubRoot, noProjectContextRowDoc), true);
assert.equal(hubRoot.style.display, "");
assert.equal(hubRoot.dataset.cltcHubVisible, "true");
assert.equal(hubRoot.getAttribute("aria-hidden"), "false");
assert.equal(api.newPriceModelName(), "new-model");
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.3-codex"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.4-nano"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.4-pro"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.5"), true);
assert.equal(api.priceFor("gpt-5.6-sol").input, 4);
assert.equal(api.priceFor("gpt-5.6-sol").cachedInput, 0.4);
assert.equal(api.priceFor("gpt-5.6-sol").cacheWrite, 5);
assert.equal(api.priceFor("gpt-5.6-sol").output, 20);
assert.equal(api.priceFor("gpt-5.6-terra").input, 2);
assert.equal(api.priceFor("gpt-5.6-terra").cachedInput, 0.2);
assert.equal(api.priceFor("gpt-5.6-terra").cacheWrite, 2.5);
assert.equal(api.priceFor("gpt-5.6-terra").output, 12);
assert.equal(api.priceFor("gpt-5.6-luna").input, 0.2);
assert.equal(api.priceFor("gpt-5.6-luna").cachedInput, 0.02);
assert.equal(api.priceFor("gpt-5.6-luna").cacheWrite, 0.25);
assert.equal(api.priceFor("gpt-5.6-luna").output, 1.2);
assert.equal(api.priceFor("gpt-5.4-nano").input, 0.2);
assert.equal(api.priceFor("gpt-5.4-nano").cachedInput, 0.02);
assert.equal(api.priceFor("gpt-5.4-nano").output, 1.25);
assert.equal(api.priceFor("gpt-5.4-pro").input, 30);
assert.equal(api.priceFor("gpt-5.4-pro").cachedInput, null);
assert.equal(api.priceFor("gpt-5.4-pro").output, 180);
assert.equal(api.priceModelKey("GPT-5.5"), "gpt-5.5");
assert.equal(api.priceFor("GPT-5.5").input, 5);
assert.equal(api.costPricedLabel({ value: 0, priced: false }, { input: 0, output: 0, cached: 0, total: 0 }), "");
assert.equal(api.costPricedLabel({ value: 0, priced: false }, { input: 1, output: 0, cached: 0, total: 1 }), " 未定价");
assert.equal(api.costPricedLabel({ value: 0, priced: true, hidden: true }, { input: 1, output: 0, cached: 0, total: 1 }), "");
assert.equal(api.costPricedLabel({ value: 0, priced: true }, { input: 1, output: 0, cached: 0, total: 1 }), "");
assert.equal(api.extractModelInfo("为什么产生了GPT-5，我实际使用的是gpt-5.5吗").model, "");
assert.equal(api.extractModelInfo({ model: "gpt-5.5" }).model, "gpt-5.5");
assert.equal(api.extractModelInfo(JSON.stringify({ model: "gpt-5.5" })).model, "gpt-5.5");
const official55 = api.officialModelInfoFromText("5.5\n高", "high");
assert.equal(official55.model, "gpt-5.5");
assert.equal(official55.effort, "high");
const official56Sol = api.officialModelInfoFromText("5.6 Sol\n极高", "xhigh");
assert.equal(official56Sol.model, "gpt-5.6-sol");
assert.equal(official56Sol.effort, "xhigh");
const official6SolShort = api.officialModelInfoFromText("6 Sol\n高", "high");
assert.equal(official6SolShort.model, "gpt-6-sol");
assert.equal(official6SolShort.effort, "high");
const official56SolUltra = api.officialModelInfoFromText("5.6 Sol\n极高", "ultra");
assert.equal(official56SolUltra.model, "gpt-5.6-sol");
assert.equal(official56SolUltra.effort, "ultra");
const official56SolUltraText = api.officialModelInfoFromText("gpt-5.6-sol · ultra", "");
assert.equal(official56SolUltraText.model, "gpt-5.6-sol");
assert.equal(official56SolUltraText.effort, "ultra");
assert.equal(code.includes('data-cltc-model-effort="true"'), true);
assert.equal(code.includes('#${ROOT_ID} .cltc-model-effort[data-effort="ultra"]'), true);
assert.equal(code.includes("var(--color-token-charts-purple, rgb(146, 79, 247))"), true);
const official56Terra = api.officialModelInfoFromText("gpt-5.6 Terra\n高", "high");
assert.equal(official56Terra.model, "gpt-5.6-terra");
assert.equal(official56Terra.effort, "high");
const official56Luna = api.officialModelInfoFromText("5.6Luna\n中", "medium");
assert.equal(official56Luna.model, "gpt-5.6-luna");
assert.equal(official56Luna.effort, "medium");
const officialMini = api.officialModelInfoFromText("5.4-mini\n低", "");
assert.equal(officialMini.model, "gpt-5.4-mini");
assert.equal(officialMini.effort, "low");
const officialCustom = api.officialModelInfoFromText("deepseek-v4-pro\n高", "high");
assert.equal(officialCustom.model, "deepseek-v4-pro");
assert.equal(officialCustom.effort, "high");
const officialQwen = api.officialModelInfoFromText("qwen3-coder\n中", "");
assert.equal(officialQwen.model, "qwen3-coder");
assert.equal(officialQwen.effort, "medium");
const officialSolidFastTrigger = api.officialModelTriggerInfo({
  innerText: "5.5\n高",
  getAttribute(name) {
    return name === "data-selected-reasoning-effort" ? "high" : "";
  },
  querySelectorAll(selector) {
    return selector === "svg path"
      ? [
          {
            getAttribute(name) {
              return name === "d"
                ? "M11.9125 21.4125C11.5292 21.8625 11.0292 22.0958 10.4125 22.1125L11.9125 21.4125Z"
                : "";
            },
            closest(selector) {
              return selector === "svg"
                ? {
                    className: "_WorkTriggerInlineFastIcon_1ec8o_157",
                    hidden: false,
                    hasAttribute() {
                      return false;
                    },
                    closest() {
                      return null;
                    },
                    getBoundingClientRect() {
                      return { width: 14, height: 14 };
                    },
                  }
                : null;
            },
          },
        ]
      : [];
  },
});
assert.equal(officialSolidFastTrigger.model, "gpt-5.5");
assert.equal(officialSolidFastTrigger.effort, "high");
assert.equal(officialSolidFastTrigger.fastMode, true);
const legacyFastTrigger = api.officialModelTriggerInfo({
  innerText: "5.4\n中",
  getAttribute(name) {
    return name === "data-selected-reasoning-effort" ? "medium" : "";
  },
  querySelectorAll(selector) {
    return selector === "svg path"
      ? [
          {
            getAttribute(name) {
              return name === "d" ? "M9.80999 17.8302C9.49666 18.1969" : "";
            },
            closest(selector) {
              return selector === "svg"
                ? {
                    hidden: false,
                    hasAttribute() {
                      return false;
                    },
                    closest() {
                      return null;
                    },
                    getBoundingClientRect() {
                      return { width: 14, height: 14 };
                    },
                  }
                : null;
            },
          },
        ]
      : [];
  },
});
assert.equal(legacyFastTrigger.model, "gpt-5.4");
assert.equal(legacyFastTrigger.effort, "medium");
assert.equal(legacyFastTrigger.fastMode, true);
const hiddenFastTrigger = api.officialModelTriggerInfo({
  innerText: "deepseek-v4-pro\n高",
  getAttribute(name) {
    return name === "data-selected-reasoning-effort" ? "high" : "";
  },
  querySelectorAll(selector) {
    return selector === "svg path"
      ? [
          {
            getAttribute(name) {
              return name === "d" ? "M9.80999 17.8302C9.49666 18.1969" : "";
            },
            closest(selectorName) {
              return selectorName === "svg"
                ? {
                    hidden: true,
                    hasAttribute(name) {
                      return name === "hidden";
                    },
                    closest() {
                      return null;
                    },
                    getBoundingClientRect() {
                      return { width: 0, height: 0 };
                    },
                  }
                : null;
            },
          },
        ]
      : [];
  },
});
assert.equal(hiddenFastTrigger.model, "deepseek-v4-pro");
assert.equal(hiddenFastTrigger.fastMode, false);
assert.equal(api.recentLedgerModel(), "");
const spoofedProfileAccount = api.spoofProfileAccountPayload({
  account: { id: "acc-personal", type: "chatgpt", structure: "workspace", name: "Workspace" },
});
assert.equal(spoofedProfileAccount.account.type, "chatgpt");
assert.equal(spoofedProfileAccount.account.structure, "workspace");
assert.equal(spoofedProfileAccount.account.plan_type, undefined);
const spoofedAccountsCheck = api.spoofProfileAccountsCheckPayload({
  account_ordering: ["acc-personal"],
  accounts: [{ id: "acc-personal", type: "chatgpt", structure: "workspace", name: "Workspace" }],
});
assert.equal(spoofedAccountsCheck.account_ordering[0], "acc-personal");
assert.equal(spoofedAccountsCheck.accounts[0].type, "chatgpt");
assert.equal(spoofedAccountsCheck.accounts[0].structure, "workspace");
assert.equal(spoofedAccountsCheck.accounts[0].plan_type, undefined);
const spoofedApiAccountsCheck = api.spoofProfileAccountsCheckPayload({
  account_ordering: ["acc-api"],
  accounts: [{ id: "acc-api", type: "apiKey", structure: "personal", planType: "api", name: "custom", email: "api@example.com" }],
});
assert.equal(spoofedApiAccountsCheck.account_ordering[0], "acc-api");
assert.equal(spoofedApiAccountsCheck.accounts[0].id, "acc-api");
assert.equal(spoofedApiAccountsCheck.accounts[0].type, "apiKey");
assert.equal(spoofedApiAccountsCheck.accounts[0].planType, "api");
assert.equal(spoofedApiAccountsCheck.accounts[0].name, "custom");
assert.equal(spoofedApiAccountsCheck.accounts[0].email, "api@example.com");
const localAccountsCheck = api.localProfileAccountsCheckResponse();
assert.equal(localAccountsCheck.account_ordering.length, 1);
assert.equal(localAccountsCheck.account_ordering[0], "local-profile-account");
assert.equal(localAccountsCheck.accounts[0].structure, undefined);
profileEditorFields["[data-profile-field='accountStructure']"].value = "workspace";
profileEditorFields["[data-profile-field='workspaceName']"].value = "OpenAI Workspace";
assert.equal(api.saveProfilePrefsFromEditor({
  querySelector(selector) {
    return profileEditorFields[selector] || null;
  },
}), true);
const workspaceAccountsCheck = api.localProfileAccountsCheckResponse();
assert.equal(workspaceAccountsCheck.accounts[0].structure, undefined);
// The dropdown's account row renders `account.name`; the synthesized account must carry the same
// identity as the footer instead of leaving it undefined.
assert.equal(workspaceAccountsCheck.accounts[0].name, "Local Usage");
assert.equal(workspaceAccountsCheck.accounts[0].display_name, "Local Usage");
const workspaceProfile = api.localProfileResponse().profile;
assert.equal(workspaceProfile.display_name, "Local Usage");
const workspaceAuth = api.spoofProfileAuthContextValue({ authMethod: "apikey" });
assert.equal(workspaceAuth.authMethod, "apikey");
assert.equal(workspaceAuth.email, undefined);
profileEditorFields["[data-profile-field='accountStructure']"].value = "personal";profileEditorFields["[data-profile-field='accountStructure']"].value = "personal";
assert.equal(api.saveProfilePrefsFromEditor({
  querySelector(selector) {
    return profileEditorFields[selector] || null;
  },
}), true);
context.localStorage.setItem(
  "__codexLiveTokenCostPriceOverridesV1",
  JSON.stringify({
    "gpt-5.4-nano": { input: 0, cachedInput: 0, output: 0 },
    "gpt-5.6-sol": { input: 5, cachedInput: 0.5, cacheWrite: 6, output: 30 },
    "custom-migration-model": { input: 7, cachedInput: 0.7, output: 70 },
  }),
);
context.localStorage.setItem("__codexLiveTokenCostHiddenPriceModelsV1", JSON.stringify(["gpt-5.4-nano"]));
assert.equal(api.cleanupAutoZeroPriceModels(), true);
assert.equal(api.priceFor("gpt-5.4-nano").input, 0.2);
assert.equal(api.priceFor("gpt-5.6-sol").cacheWrite, 5);
assert.equal(api.priceFor("custom-migration-model").input, 7);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.4-nano"), true);
assert.equal(api.cleanupAutoZeroPriceModels(), false);
assert.equal(api.deletePriceForModel("gpt-5.4-nano"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.4-nano"), false);
const hiddenNanoCost = api.costForModelUsage({ input: 1, output: 0, cached: 0, total: 1 }, "gpt-5.4-nano", { ensure: true });
assert.equal(hiddenNanoCost.hidden, true);
assert.equal(hiddenNanoCost.priced, true);
assert.equal(api.costPricedLabel(hiddenNanoCost, { input: 1, output: 0, cached: 0, total: 1 }), "");
const firstRestoreDefaultPromise = api.restoreDefaultPrices();
assert.equal(typeof firstRestoreDefaultPromise?.then, "function");
assert.equal(api.priceFor("gpt-5.4-nano").input, 0.2);
const unpricedUsage = { input: 100, output: 20, cached: 10, total: 120 };
const overridesBeforeUnpricedCost = context.localStorage.getItem("__codexLiveTokenCostPriceOverridesV1");
const unpricedCost = api.costForModelUsage(unpricedUsage, "gpt-5.4-cyber", { ensure: true });
assert.equal(unpricedCost.value, 0);
assert.equal(unpricedCost.priced, false);
assert.equal(context.localStorage.getItem("__codexLiveTokenCostPriceOverridesV1"), overridesBeforeUnpricedCost);
assert.equal(api.costPricedLabel(unpricedCost, unpricedUsage), " 未定价");
assert.equal(api.priceListModels("gpt-5.4-cyber").includes("gpt-5.4-cyber"), true);
assert.equal(api.priceListModelLabel("gpt-5.4-cyber"), "gpt-5.4-cyber · 未定价");
assert.equal(context.__codexLiveTokenCost.setModelPrice("zero-price-model", { input: 0, cachedInput: 0, output: 0 }), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "zero-price-model"), true);
assert.deepEqual(JSON.parse(JSON.stringify(api.priceFor("zero-price-model"))), { input: 0, cachedInput: 0, cacheWrite: null, output: 0 });
assert.equal(context.__codexLiveTokenCost.setModelPrice("negative-price-model", { input: -1, output: 0 }), false);
// —— 自定义价格编辑器：允许 0 价格；只有四个字段全空时才报错 ——
const priceEditorField = (value) => ({ value, setAttribute() {}, removeAttribute() {} });
const makePriceEditorRoot = (fields) => {
  const nodes = {};
  for (const [field, value] of Object.entries(fields)) nodes[`[data-price-field='${field}']`] = priceEditorField(value);
  nodes["[data-price-model]"] = null;
  const errorNode = { hidden: true, textContent: "" };
  nodes["[data-price-error]"] = errorNode;
  return { errorNode, querySelector(selector) { return nodes[selector] || null; } };
};
const emptyPriceRoot = makePriceEditorRoot({ input: "", cachedInput: "", cacheWrite: "", output: "" });
const emptyPriceError = api.priceSaveDraftError(emptyPriceRoot);
assert.equal(emptyPriceError.message, "请至少填写一个价格");
assert.equal(emptyPriceError.input, emptyPriceRoot.querySelector("[data-price-field='input']"));
assert.equal(api.priceSaveDraftError(makePriceEditorRoot({ input: "0", cachedInput: "", cacheWrite: "", output: "0" })), null);
assert.equal(api.priceSaveDraftError(makePriceEditorRoot({ input: "1.5", cachedInput: "", cacheWrite: "", output: "" })), null);
assert.equal(api.priceSaveDraftError(makePriceEditorRoot({ input: "abc", cachedInput: "", cacheWrite: "", output: "" })).message, "价格需为不小于 0 的数字");
assert.equal(api.priceSaveDraftError(makePriceEditorRoot({ input: "-1", cachedInput: "", cacheWrite: "", output: "" })).message, "价格需为不小于 0 的数字");
api.setPriceDraft(null);
api.capturePriceDraft(makePriceEditorRoot({ model: "custom-draft-model", input: "2", cachedInput: "", cacheWrite: "", output: "8" }));
assert.equal(
  JSON.stringify(api.priceDraftSnapshot()),
  JSON.stringify({ model: "custom-draft-model", input: "2", cachedInput: "", cacheWrite: "", output: "8" }),
);
api.setPriceDraft(null);
const zeroSaveRoot = makePriceEditorRoot({ model: "custom-zero-save", input: "", cachedInput: "", cacheWrite: "", output: "" });
const originalDocumentQuerySelectorForPrices = context.document.querySelector;
context.document.querySelector = function querySelectorForPrices(selector) {
  if (selector === ".cltc-settings-embedded") return zeroSaveRoot;
  return originalDocumentQuerySelectorForPrices.call(context.document, selector);
};
try {
  assert.equal(api.settingsEditorRoot(), zeroSaveRoot);
  assert.equal(api.savePriceFromEditor(), false);
  assert.equal(zeroSaveRoot.errorNode.hidden, false);
  assert.equal(zeroSaveRoot.errorNode.textContent, "请至少填写一个价格");
  assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "custom-zero-save"), false);
} finally {
  context.document.querySelector = originalDocumentQuerySelectorForPrices;
}
// 显式输入 0 可以保存：免费/本地模型应显示“自定义”而不是“未定价”
const zeroPricedRoot = makePriceEditorRoot({ model: "custom-zero-priced", input: "0", cachedInput: "0", cacheWrite: "0", output: "0" });
context.document.querySelector = function querySelectorForZeroPrice(selector) {
  if (selector === ".cltc-settings-embedded") return zeroPricedRoot;
  return originalDocumentQuerySelectorForPrices.call(context.document, selector);
};
try {
  assert.equal(api.savePriceFromEditor(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.priceFor("custom-zero-priced"))), { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 });
  const zeroPricedCost = api.costForModelUsage({ input: 1000, output: 100, cached: 0, total: 1100 }, "custom-zero-priced");
  assert.equal(zeroPricedCost.priced, true);
  assert.equal(zeroPricedCost.value, 0);
  assert.equal(api.priceListModelLabel("custom-zero-priced"), "custom-zero-priced");
} finally {
  context.document.querySelector = originalDocumentQuerySelectorForPrices;
}
const unpricedDailyBucket = api.addTurnToDailyBucket(
  api.emptyDailyUsageBucket("2026-07-04"),
  { model: "gpt-5.4-cyber" },
  unpricedUsage,
);
assert.equal(unpricedDailyBucket.priced, false);
assert.equal(api.costPricedLabel({ value: unpricedDailyBucket.cost, priced: unpricedDailyBucket.priced }, unpricedDailyBucket), " 未定价");
const pricedZeroCostTurn = {
  model: "gpt-5.6-sol",
  costUsd: 0,
  usage: { input: 1000, output: 100, cached: 200, total: 1100 },
};
const pricedZeroTurnCost = api.turnCost(pricedZeroCostTurn);
assert.equal(pricedZeroTurnCost.priced, true);
assert.equal(pricedZeroTurnCost.value, ((800 * 4 + 200 * 0.4 + 100 * 20) / 1_000_000));
const pricedZeroDailyBucket = api.addTurnToDailyBucket(
  api.emptyDailyUsageBucket("2026-07-04"),
  pricedZeroCostTurn,
  api.normalizeUsage(pricedZeroCostTurn.usage),
);
assert.equal(pricedZeroDailyBucket.priced, true);
assert.equal(pricedZeroDailyBucket.cost, pricedZeroTurnCost.value);
const unpricedZeroCostTurn = {
  model: "gpt-5.4-cyber",
  costUsd: 0,
  usage: unpricedUsage,
};
const unpricedZeroTurnCost = api.turnCost(unpricedZeroCostTurn);
assert.equal(unpricedZeroTurnCost.value, 0);
assert.equal(unpricedZeroTurnCost.priced, false);
const unpricedZeroDailyBucket = api.addTurnToDailyBucket(
  api.emptyDailyUsageBucket("2026-07-04"),
  unpricedZeroCostTurn,
  api.normalizeUsage(unpricedUsage),
);
assert.equal(unpricedZeroDailyBucket.cost, 0);
assert.equal(unpricedZeroDailyBucket.priced, false);
assert.equal(context.__codexLiveTokenCost.setModelPrice("custom-delete-model", { input: 1, output: 2 }), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "custom-delete-model"), true);
assert.equal(context.__codexLiveTokenCost.setModelPrice("gpt-5.5", { input: 99, cachedInput: 9, output: 199 }), true);
assert.equal(api.priceFor("gpt-5.5").input, 99);
assert.equal(api.deletePriceForModel("gpt-5.3-codex"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.3-codex"), false);
const secondRestoreDefaultPromise = api.restoreDefaultPrices();
assert.equal(typeof secondRestoreDefaultPromise?.then, "function");
assert.equal(api.priceFor("gpt-5.5").input, 5);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.3-codex"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "custom-delete-model"), true);
assert.equal(api.deletePriceForModel("custom-delete-model"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "custom-delete-model"), false);
const cacheReadUsage = api.normalizeUsage({
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 900,
  cache_creation_input_tokens: 40,
  total_tokens: 150,
});
assert.equal(cacheReadUsage.input, 1040);
assert.equal(cacheReadUsage.inputTokens, 100);
assert.equal(cacheReadUsage.inputTotalTokens, 1040);
assert.equal(cacheReadUsage.cached, 900);
assert.equal(cacheReadUsage.cacheReadTokens, 900);
assert.equal(cacheReadUsage.cacheCreationTokens, 40);
assert.equal(cacheReadUsage.output, 50);
assert.equal(cacheReadUsage.total, 150);
assert.equal(api.normalizeUsage({ inputTokens: 10, outputTokens: 2, cachedReadTokens: 50, totalTokens: 12 }).input, 60);
assert.equal(api.normalizeUsage({ inputTokens: 10, outputTokens: 2, cachedReadTokens: 50, totalTokens: 12 }).cached, 50);
const totalOnlyUsage = api.normalizeUsage({ total_tokens: 10, output_tokens: 0 });
assert.equal(totalOnlyUsage.input, 10);
assert.equal(totalOnlyUsage.output, 0);
assert.equal(totalOnlyUsage.total, 10);
const hydratedLegacyProfile = api.profileNormalizeSnapshot({
  version: 2,
  usageCalls: [{ id: "legacy-total-only-call", turnId: "hydrated-turn", usage: { total_tokens: 10, output_tokens: 0 } }],
  turns: [{ turnId: "hydrated-turn", createdAt: "2026-07-20T00:00:00.000Z", usage: { total_tokens: 10, output_tokens: 0 }, invocationIds: ["linked-invocation"] }],
  invocations: [
    { invocationId: "linked-invocation", turnId: "hydrated-turn", type: "skill", skill_id: "hydrated-skill", skill_name: "Hydrated" },
    { invocationId: "orphan-invocation", turnId: "missing-turn", type: "plugin", plugin_id: "orphan-plugin", plugin_name: "Orphan" },
  ],
});
const hydratedLegacyCalls = Object.values(hydratedLegacyProfile.usageCalls);
assert.equal(hydratedLegacyCalls.length, 1);
assert.equal(hydratedLegacyCalls[0].usage.input, 10);
assert.equal(hydratedLegacyCalls[0].usageKey, "10:0:0:10:0:0:0:0:0:0:0:0");
assert.equal(hydratedLegacyCalls[0].id, `hydrated-turn\u0001${hydratedLegacyCalls[0].usageKey}`);
assert.deepEqual(hydratedLegacyProfile.turns[0].invocationIds, ["linked-invocation"]);
assert.equal(hydratedLegacyProfile.invocations["orphan-invocation"].turnId, "missing-turn");
const mixedLocalBucket = { input: 70, output: 30, cached: 700, total: 100, cost: 0.01, requests: 7, turns: 1 };
const mixedCcBucket = { input: 10, output: 40, cached: 1, total: 90, cost: 0.02, requests: 2, turns: 1 };
assert.equal(
  JSON.stringify(api.profileDisplayedBucket({ date: "2026-07-20", local: mixedLocalBucket, ccSwitch: mixedCcBucket })),
  JSON.stringify({ date: "2026-07-20", tokens: 100, input: 70, output: 30, cached: 700, requests: 7, cost: 0.01 }),
);
const ccDominantBucket = { input: 90, output: 60, cached: 50, total: 150, cost: 0.03, requests: 9, turns: 2 };
assert.equal(
  JSON.stringify(api.profileDisplayedBucket({ date: "2026-07-20", local: mixedLocalBucket, ccSwitch: ccDominantBucket })),
  JSON.stringify({ date: "2026-07-20", tokens: 100, input: 70, output: 30, cached: 700, requests: 7, cost: 0.01 }),
);
const cacheWriteUsage = api.normalizeUsage({
  input_tokens: 1000,
  output_tokens: 100,
  input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
  total_tokens: 1100,
});
assert.equal(cacheWriteUsage.input, 1000);
assert.equal(cacheWriteUsage.cached, 200);
assert.equal(cacheWriteUsage.cacheWriteTokens, 300);
const officialTokenUsage = api.normalizeUsage({
  input_tokens: 1000,
  cached_input_tokens: 400,
  cache_write_input_tokens: 75,
  output_tokens: 100,
  reasoning_output_tokens: 12,
  total_tokens: 1100,
});
assert.equal(officialTokenUsage.input, 1000);
assert.equal(officialTokenUsage.cached, 400);
assert.equal(officialTokenUsage.cacheWriteTokens, 75);
assert.equal(officialTokenUsage.reasoningOutputTokens, 12);
assert.equal(
  api.costForModelUsage(cacheWriteUsage, "gpt-5.6-sol").value,
  (500 * 4 + 200 * 0.4 + 300 * 5 + 100 * 20) / 1_000_000,
);
const partialCacheReadUsage = api.normalizeUsage({
  input_tokens: 1000,
  output_tokens: 50,
  cache_read_input_tokens: 500,
  cache_creation_input_tokens: 200,
  total_tokens: 1050,
});
assert.equal(partialCacheReadUsage.input, 1700);
assert.equal(partialCacheReadUsage.inputTokens, 1000);
assert.equal(partialCacheReadUsage.inputTotalTokens, 1700);
assert.equal(partialCacheReadUsage.cached, 500);
assert.equal(partialCacheReadUsage.total, 1050);
const ccSwitchCachedUsage = api.normalizeUsage({ input: 1000, output: 50, cached: 500, total: 1050 });
assert.equal(ccSwitchCachedUsage.input, 1000);
assert.equal(ccSwitchCachedUsage.cached, 500);
const codexppHistory = api.codexppHistoryTurnsFromPayload(
  {
    history: [
      {
        turn_id: "turn-1",
        conversation_id: "thread-a",
        observed_at: "2026-07-11T08:00:00.000Z",
        inputTokens: 100,
        outputTokens: 20,
        cachedTokens: 40,
        totalTokens: 120,
      },
      {
        turn_id: "turn-2",
        conversation_id: "thread-a",
        observed_at: "2026-07-11T09:00:00.000Z",
        input_tokens: 200,
        output_tokens: 50,
        cached_tokens: 80,
        total_tokens: 250,
      },
      {
        turn_id: "turn-2",
        conversation_id: "thread-a",
        observed_at: "2026-07-11T10:00:00.000Z",
        input_tokens: 200,
        output_tokens: 60,
        cached_tokens: 80,
        total_tokens: 260,
      },
    ],
  },
  "thread-a",
);
assert.equal(codexppHistory.length, 2);
assert.equal(codexppHistory.every((turn) => turn.source === "codexpp-history" && turn.importSource === "codexpp-history"), true);
assert.equal(codexppHistory[0].usage.total, 120);
assert.equal(codexppHistory[0].sessionKey, "local:thread-a");
assert.equal(codexppHistory.find((turn) => turn.turnId === "turn-2").usage.total, 260);
api.setCodexppHistoryTurns(codexppHistory);
const mergedCodexppTurns = api.mergeCodexppHistoryTurns([
  {
    turnId: "local-turn-a",
    source: "codex-live-token-cost",
    usage: { input: 100, output: 20, cached: 40, total: 120, exact: true },
  },
  {
    turnId: "local-turn-b",
    source: "codex-live-token-cost",
    usage: { input: 300, output: 60, cached: 100, total: 360, exact: true },
  },
]);
assert.equal(mergedCodexppTurns.length, 3);
assert.equal(mergedCodexppTurns.some((turn) => turn.source === "codexpp-history" && turn.turnId === "turn-2"), true);
assert.equal(mergedCodexppTurns.some((turn) => turn.source === "codexpp-history" && turn.turnId === "turn-1"), false);
api.setCodexppHistoryTurns([]);
const contextOnlyUsage = api.normalizeUsage({ usedTokens: 151505, contextLimit: 272000 });
assert.equal(contextOnlyUsage.exact, false);
assert.equal(contextOnlyUsage.contextUsed, 151505);
assert.equal(contextOnlyUsage.contextLimit, 272000);
assert.equal(api.collectUsages({ contextUsage: { usedTokens: 151505, contextLimit: 272000 } }).length, 0);
const tokenCountEventUsages = api.collectUsages({
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      total_token_usage: {
        input_tokens: 912684,
        cached_input_tokens: 800384,
        output_tokens: 6217,
        reasoning_output_tokens: 890,
        total_tokens: 918901,
      },
      last_token_usage: {
        input_tokens: 120445,
        cached_input_tokens: 106880,
        output_tokens: 1051,
        reasoning_output_tokens: 59,
        total_tokens: 121496,
      },
      model_context_window: 272000,
    },
  },
});
assert.equal(tokenCountEventUsages.length, 1);
assert.equal(tokenCountEventUsages[0].input, 120445);
assert.equal(tokenCountEventUsages[0].output, 1051);
assert.equal(tokenCountEventUsages[0].cached, 106880);
assert.equal(tokenCountEventUsages[0].total, 121496);
assert.equal(tokenCountEventUsages[0].exact, true);
assert.equal(api.isTokenCountPayload({ type: "token_count", info: { last_token_usage: { total_tokens: 1 } } }), true);
assert.equal(api.isTokenCountPayload({ type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { total_tokens: 1 } } } }), true);
const cacheReadCost = api.costForModelUsage(cacheReadUsage, "gpt-5.5");
assert.equal(cacheReadCost.value, (140 * 5 + 900 * 0.5 + 50 * 30) / 1_000_000);
const baseFastUsage = { input: 100, output: 10, cached: 20, total: 110 };
const gpt55StandardCost = api.costForModelUsage(baseFastUsage, "gpt-5.5");
const gpt55FastCost = api.costForModelUsage(baseFastUsage, "GPT-5.5", { fastMode: true });
assert.equal(gpt55FastCost.value, gpt55StandardCost.value * 2.5);
const gpt55ProStandardCost = api.costForModelUsage(baseFastUsage, "gpt-5.5-pro");
const gpt55ProFastCost = api.costForModelUsage(baseFastUsage, "gpt-5.5-pro", { fastMode: true });
assert.equal(gpt55ProFastCost.value, gpt55ProStandardCost.value * 2.5);
const gpt54StandardCost = api.costForModelUsage(baseFastUsage, "gpt-5.4");
const gpt54FastCost = api.costForModelUsage(baseFastUsage, "GPT-5.4", { fastMode: true });
assert.equal(gpt54FastCost.value, gpt54StandardCost.value * 2);
const gpt54MiniStandardCost = api.costForModelUsage(baseFastUsage, "gpt-5.4-mini");
const gpt54MiniFastCost = api.costForModelUsage(baseFastUsage, "gpt-5.4-mini", { fastMode: true });
assert.equal(gpt54MiniFastCost.value, gpt54MiniStandardCost.value * 2);
const startupApiKeyQueryClient = {
  getQueryCache() {
    return {
      getAll() {
        return [
          {
            queryKey: ["accounts", "check"],
            state: {
              data: {
                account_ordering: ["api-startup"],
                accounts: [{ id: "api-startup", type: "apiKey", structure: "personal", planType: "api" }],
              },
            },
          },
        ];
      },
    };
  },
  invalidateQueries() {
    return Promise.resolve();
  },
};
// Production behavior: an API-key session must not install any profile patch. Codex only renders
// its profile surface for a real ChatGPT login, and the old synthetic path patched hot globals
// (Array.prototype.filter, RegExp.prototype.test, the auth context and the IPC bridge), which is
// what caused the whole app to stutter. Keep the production gate covered before opting tests in.
const filterBeforeProductionGate = Array.prototype.filter;
const bridgeSendBeforeProductionGate = context.electronBridge.sendMessageFromView;
api.setProfileUnlockEnabled(true);
api.installOfficialProfileUnlock();
assert.equal(api.profileSyntheticEnabled(), false);
assert.equal(api.profileUnlockInstalledMode(), "");
assert.equal(Array.prototype.filter, filterBeforeProductionGate);
assert.equal(context.electronBridge.sendMessageFromView, bridgeSendBeforeProductionGate);
api.setProfileUnlockEnabled(false);

// The API-key profile spoof is disabled in production (Codex gates the profile surface on a real
// ChatGPT login); the legacy coverage below opts into the test-only implementation explicitly.
api.setProfileSyntheticTestEnabled(true);
assert.equal(api.profileSyntheticEnabled(), false);
api.rememberProfileQueryClient(startupApiKeyQueryClient);
api.setProfileUnlockEnabled(true);
assert.equal(api.profileSyntheticEnabled(), true);
// Enabling the unlock installs the profile patches once; repeat installs in the same auth mode
// must be no-ops, otherwise the query-cache observer would reinstall (and re-invalidate
// accounts/check) on every auth event, producing a self-sustaining refetch loop.
assert.equal(api.profileUnlockInstalledMode(), "synthetic");
const unlockInstallsAfterEnable = api.profileUnlockInstallCount();
assert.ok(unlockInstallsAfterEnable > 0);
api.installOfficialProfileUnlock();
api.installOfficialProfileUnlock();
assert.equal(api.profileUnlockInstallCount(), unlockInstallsAfterEnable);
context.electronBridge.sendMessageFromView({ type: "fetch", method: "GET", url: "/wham/profiles/me", requestId: "profile-1" });
assert.equal(bridgeCalls.length, 0);
context.electronBridge.sendMessageFromView({ type: "fetch", method: "GET", url: "/v1/responses", requestId: "other-1" });
assert.equal(bridgeCalls.length, 1);

const profileResponses = [];
context.addEventListener("message", (event) => {
  if (event.data?.type === "fetch-response" && event.data.requestId === "profile-event-1") profileResponses.push(event.data);
}, true);
context.dispatchEvent({
  type: "codex-message-from-view",
  detail: { type: "fetch", method: "GET", url: "/wham/profiles/me", requestId: "profile-event-1" },
});
context.dispatchEvent({
  type: "message",
  data: { type: "fetch-response", requestId: "profile-event-1", responseType: "error", status: 401, error: "Unauthorized" },
  origin: "app://-",
  source: context,
});
assert.equal(profileResponses.length, 1);
assert.equal(profileResponses[0].status, 200);
assert.equal(profileResponses[0].__codexLiveTokenCostProfileLocal, true);

const spoofed = api.spoofProfileAccountPayload({
  account: { id: "api-account", type: "apiKey", planType: "api" },
  requiresOpenaiAuth: true,
});
assert.equal(spoofed.account.id, "api-account");
assert.equal(spoofed.account.type, "apiKey");
assert.equal(spoofed.requiresOpenaiAuth, true);
assert.equal(spoofed.account.planType, "api");
assert.equal(spoofed.account.email, undefined);
const spoofedAuth = api.spoofProfileAuthContextValue({
  authMethod: "apikey",
  openAIAuth: "api_key",
  requiresAuth: false,
  accountId: "api-account",
  userId: "api-user",
  account: { id: "api-account", type: "apiKey", planType: "api" },
  isLoading: true,
  setAuthMethod() {},
});
assert.equal(spoofedAuth.authMethod, "apikey");
assert.equal(spoofedAuth.openAIAuth, "api_key");
assert.equal(spoofedAuth.requiresAuth, false);
assert.equal(spoofedAuth.accountId, "api-account");
assert.equal(spoofedAuth.userId, "api-user");
assert.equal(spoofedAuth.account.type, "apiKey");
assert.equal(spoofedAuth.account.planType, "api");
assert.equal(spoofedAuth.isLoading, true);
const authContext = {
  name: "auth",
  _currentValue: null,
  _currentValue2: null,
};
const otherContext = { name: "other" };
const rawApiAuth = {
  authMethod: "apikey",
  openAIAuth: "apikey",
  requiresAuth: true,
  isLoading: false,
  accountId: null,
  userId: null,
};
authContext._currentValue = rawApiAuth;
authContext._currentValue2 = rawApiAuth;
const capturedUseContext = (context) => context._currentValue;
const authDependency = { context: authContext, memoizedValue: rawApiAuth, next: null };
const profileButton = {
  __reactFiber$profile: {
    dependencies: { firstContext: authDependency },
    return: null,
  },
  getBoundingClientRect() {
    return { width: 184, height: 29 };
  },
};
assert.equal(api.profileAuthContextFromFiberNode(profileButton), authContext);
assert.equal(api.profileAuthContextFromDocument({ querySelector: () => profileButton }), authContext);
assert.deepEqual(
  api.profileUiComponentNamesFromSource(
    "function K1l(){const x='codex.profileFooter.settingsFallback'}function I1l({sidebarFooter:e,triggerButton:t}){}",
  ),
  ["K1l"],
);
assert.deepEqual(
  api.profileUiComponentNamesFromSource(
    "function AHook(){throw new Error('useAuth must be used within AuthProvider')}"
    + "function FooterFn(){const x='codex.profileFooter.settingsFallback'}"
    + "function VisHook(){return{isProfileVisibilityLoading:!1,isProfileVisible:!0}}"
    + "function GuardFn(){return{pathname:'/settings/profile'}}",
  ),
  ["FooterFn", "VisHook", "AHook", "GuardFn"],
);
assert.equal(api.profileUiFunctionNameBefore("function Only(){}", "missing-marker"), "");
assert.equal(api.settingsSectionsCandidate([{ slug: "general-settings" }, { slug: "profile" }]), true);
assert.equal(api.settingsSectionsCandidate([{ slug: "general-settings" }]), false);
assert.equal(api.settingsSectionsCandidate(["a", "b"]), false);
assert.equal(api.settingsSectionsCandidate([]), false);
// Large arrays must be rejected without scanning, so the global filter patch stays O(1) on them.
assert.equal(
  api.settingsSectionsCandidate(Array.from({ length: 300 }, (_, index) => ({ slug: index === 299 ? "profile" : "other" }))),
  false,
);
assert.equal(api.isProfileUiAuthRead("at K1l (app-initial.js:1:1)", ["K1l"]), true);
assert.equal(api.isProfileUiAuthRead("at I1l (app-initial.js:1:1)", ["K1l"]), false);
assert.equal(api.isProfileUiAuthRead("at NotK1lSuffix (app-initial.js:1:1)", ["K1l"]), false);
assert.equal(api.patchProfileReactAuthContext(authContext, ["ProfileFooterHarness"]), true);
function ProfileFooterHarness() {
  return capturedUseContext(authContext);
}
const patchedProfileAuth = ProfileFooterHarness();
assert.notEqual(patchedProfileAuth, rawApiAuth);
assert.equal(patchedProfileAuth.authMethod, "chatgpt");
assert.equal(patchedProfileAuth.openAIAuth, "apikey");
assert.equal(patchedProfileAuth.requiresAuth, false);
assert.equal(patchedProfileAuth.accountId, "local-profile-account");
assert.equal(patchedProfileAuth.userId, "local-profile-user");
assert.equal(patchedProfileAuth.hasChatGptToken, true);
assert.equal(patchedProfileAuth.displayName, undefined);
assert.equal(capturedUseContext(authContext), rawApiAuth);
assert.equal(capturedUseContext(otherContext), undefined);
assert.equal(typeof api.installProfileUiReadinessCoordinator, "function");
const delayedProfileInvalidations = [];
const delayedProfileCacheWrites = [];
const delayedProfileQueryClient = {
  getQueryCache() {
    return { getAll: () => [{ queryKey: ["profile", "usage", "disabled"] }] };
  },
  setQueryData(queryKey, data) {
    delayedProfileCacheWrites.push({ queryKey, data });
  },
  invalidateQueries({ queryKey }) {
    delayedProfileInvalidations.push(queryKey);
    return Promise.resolve();
  },
};
const delayedRawApiAuth = {
  authMethod: "apikey",
  openAIAuth: "apikey",
  requiresAuth: true,
  isLoading: false,
  accountId: null,
  userId: null,
};
const delayedAuthContext = {
  _currentValue: delayedRawApiAuth,
  _currentValue2: delayedRawApiAuth,
};
let delayedProfileButton = null;
const delayedProfileDocument = {
  body: {},
  querySelector() {
    return delayedProfileButton;
  },
};
const realChatgptQueryClient = {
  getQueryCache() {
    return {
      getAll() {
        return [
          {
            queryKey: ["accounts", "check"],
            state: {
              data: {
                account_ordering: ["real-chatgpt-account"],
                accounts: [
                  {
                    id: "real-chatgpt-account",
                    account_user_id: "user-real",
                    account_owner_id: "user-real",
                    structure: "personal",
                    plan_type: "free",
                  },
                ],
              },
            },
          },
        ];
      },
    };
  },
  invalidateQueries() {
    return Promise.resolve();
  },
};
const apiKeyQueryClient = {
  getQueryCache() {
    return {
      getAll() {
        return [
          {
            queryKey: ["accounts", "check"],
            state: {
              data: {
                account_ordering: ["api-account"],
                accounts: [{ id: "api-account", type: "apiKey", structure: "personal", planType: "api" }],
              },
            },
          },
        ];
      },
    };
  },
};
    assert.equal(api.profileSyntheticEnabled(apiKeyQueryClient), true);
    assert.equal(api.profileSyntheticEnabled(realChatgptQueryClient), false);
    assert.equal(api.profileDataOverrideEnabledFor(realChatgptQueryClient), true);
    api.applyLocalProfilePatch({ display_name: "Tian Envelope", username: "Tian_003", planType: "pro_20x" });
    const realChatgptProfileData = {
      displayName: "Tian",
      username: "tianzora",
      imageUrl: "https://example.com/avatar.png",
      summary: {
        currentStreakDays: 0,
        longestStreakDays: 13,
        longestTaskDurationMs: 40934000,
        peakTokens: 98274845,
        totalTextTokens: 690833040,
      },
      dailyUsage: [{ credits: 98274845, date: "2026-04-15" }],
      activityInsights: {
        fastModePercent: 16.7,
        reasoningEffort: "high",
        reasoningEffortPercent: 52.7,
        skillsExplored: 1,
        totalSkillsUsed: 1,
        totalThreads: 339,
      },
    };
    const overriddenProfileData = api.applyProfileDataOverride(realChatgptProfileData);
    assert.equal(overriddenProfileData.displayName, "Tian");
    assert.equal(overriddenProfileData.username, "tianzora");
    assert.equal(overriddenProfileData.imageUrl, "https://example.com/avatar.png");
    assert.equal(overriddenProfileData.planType, "pro_20x");
    assert.equal(overriddenProfileData.planLabel, "Pro 20x");
    assert.equal(overriddenProfileData.summary.totalTextTokens, api.localProfileResponse().stats.lifetime_tokens);
    assert.equal(overriddenProfileData.dailyUsage.at(-1).credits, api.localProfileResponse().stats.daily_usage_buckets.at(-1).tokens);
    assert.equal(overriddenProfileData.activityInsights.totalThreads, api.localProfileResponse().stats.total_threads);
    const realChatgptPageData = {
      profile_details: { username: "tianzora", display_name: "Tian" },
      page: {
        stats: { current_streak_days: 0, longest_streak_days: 13, agentic: { lifetime_tokens: 690833040, peak_daily_tokens: 98274845 } },
        activity_graph: { daily_usage_buckets: [{ start_date: "2026-04-15", tokens: 98274845 }] },
        insights: { total_skills_used: 1, agentic: { total_threads: 339 } },
        top_plugins: [{ plugin_name: "official", usage_count: 8 }],
      },
    };
    const overriddenPageData = api.profilePageDataOverride(realChatgptPageData);
    assert.equal(overriddenPageData.profile_details.username, "tianzora");
    assert.equal(overriddenPageData.profile_details.display_name, "Tian");
    assert.equal(overriddenPageData.profile_details.plan_type, "pro_20x");
    assert.equal(overriddenPageData.profile_details.plan_label, "Pro 20x");
    assert.equal(overriddenPageData.page.stats.agentic.lifetime_tokens, api.localProfileResponse().stats.lifetime_tokens);
    assert.equal(overriddenPageData.page.stats.agentic.peak_daily_tokens, api.localProfileResponse().stats.peak_daily_tokens);
    assert.equal(overriddenPageData.page.activity_graph.daily_usage_buckets.at(-1).tokens, api.localProfileResponse().stats.daily_usage_buckets.at(-1).tokens);
    assert.equal(overriddenPageData.page.insights.agentic.total_threads, api.localProfileResponse().stats.total_threads);
    assert.equal(overriddenPageData.page.top_plugins[0].plugin_name, "official");
    const realChatgptOverrideWrites = [];
    const realChatgptOverrideQueryClient = {
      invalidateQueries() {},
      getQueryCache() {
        return {
          getAll() {
            return [
              {
                queryKey: ["accounts", "check"],
                state: {
                  data: {
                    accounts: [{ id: "real-chatgpt-account", account_user_id: "user-real" }],
                  },
                },
              },
              {
                queryKey: ["vscode", "account-info"],
                state: {
                  data: {
                    accountId: "real-chatgpt-account",
                    userId: "user-real",
                    authMethod: "chatgpt",
                    hasChatGptToken: true,
                    plan: "free",
                  },
                },
              },
              {
                queryKey: ["profile", "usage", "user-real", "real-chatgpt-account"],
                state: { data: realChatgptProfileData },
              },
              {
                queryKey: ["profile", "page", "user-real", "real-chatgpt-account", "tianzora"],
                state: { data: realChatgptPageData },
              },
            ];
          },
        };
      },
      setQueryData(queryKey, data) {
        realChatgptOverrideWrites.push({ queryKey, data });
      },
    };
    assert.equal(api.syncProfileUsageQueryCache(realChatgptOverrideQueryClient), true);
    const realChatgptSettingsContainer = {
      classList: { add() {} },
      dataset: {},
      innerHTML: "",
      querySelectorAll() { return []; },
      addEventListener() {},
    };
    api.setProfileUnlockEnabled(true);
    api.rememberProfileQueryClient(realChatgptOverrideQueryClient);
    api.renderEmbeddedSettingsPage(realChatgptSettingsContainer, { panel: "profile" });
    assert.equal(realChatgptSettingsContainer.innerHTML.includes('data-settings-panel="profile"'), true);
    assert.equal(realChatgptSettingsContainer.innerHTML.includes('data-profile-field="planType"'), true);
    assert.equal(realChatgptSettingsContainer.innerHTML.includes('value="custom"'), true);
    const realChatgptSynced = realChatgptOverrideWrites.find(({ queryKey }) => queryKey.join("/") === "profile/usage/user-real/real-chatgpt-account");
    assert.ok(realChatgptSynced);
    assert.equal(realChatgptSynced.data.displayName, "Tian");
    assert.equal(realChatgptSynced.data.username, "tianzora");
    assert.equal(realChatgptSynced.data.imageUrl, "https://example.com/avatar.png");
    assert.equal(realChatgptSynced.data.planType, "pro_20x");
    assert.equal(realChatgptSynced.data.planLabel, "Pro 20x");
    assert.equal(realChatgptSynced.data.summary.totalTextTokens, api.localProfileResponse().stats.lifetime_tokens);
    assert.equal(realChatgptSynced.data.dailyUsage.at(-1).credits, api.localProfileResponse().stats.daily_usage_buckets.at(-1).tokens);
    assert.equal(realChatgptSynced.data.activityInsights.totalThreads, api.localProfileResponse().stats.total_threads);
    const realChatgptPageSynced = realChatgptOverrideWrites.find(({ queryKey }) => queryKey.join("/") === "profile/page/user-real/real-chatgpt-account/tianzora");
    assert.ok(realChatgptPageSynced);
    assert.equal(realChatgptPageSynced.data.page.stats.agentic.lifetime_tokens, api.localProfileResponse().stats.lifetime_tokens);
    const realChatgptAccountInfoBeforeSave = realChatgptOverrideWrites.find(({ queryKey }) => queryKey.join("/") === "vscode/account-info");
    assert.equal(realChatgptAccountInfoBeforeSave, undefined);
    const realChatgptProfileEditorFields = {
      "[data-profile-field='email']": { value: "sama@openai.com" },
      "[data-profile-field='accountStructure']": { value: "personal" },
      "[data-profile-field='workspaceName']": { value: "" },
      "[data-profile-field='planType']": { value: "pro_20x" },
      "[data-profile-field='planCustom']": { value: "" },
    };
    realChatgptOverrideWrites.length = 0;
    assert.equal(
      api.saveProfilePrefsFromEditor({
        querySelector(selector) {
          return realChatgptProfileEditorFields[selector] || null;
        },
      }),
      true,
    );
    const realChatgptAccountInfoAfterSave = realChatgptOverrideWrites.find(({ queryKey }) => queryKey.join("/") === "vscode/account-info");
    assert.ok(realChatgptAccountInfoAfterSave);
    assert.equal(realChatgptAccountInfoAfterSave.data.plan, "pro_20x");
    assert.equal(realChatgptAccountInfoAfterSave.data.accountId, "real-chatgpt-account");
    assert.equal(realChatgptAccountInfoAfterSave.data.userId, "user-real");
    assert.equal(realChatgptAccountInfoAfterSave.data.authMethod, "chatgpt");
    assert.equal(realChatgptAccountInfoAfterSave.data.hasChatGptToken, true);
    const realChatgptAuthWithIdentity = {
      authMethod: "chatgpt",
      accountId: "real-chatgpt-account",
      userId: "user-real",
      hasChatGptToken: true,
      account: {
        id: "real-chatgpt-account",
        type: "chatgpt",
        planType: "free",
        plan_type: "free",
      },
    };
    const realChatgptAuthWithPlan = api.profileUiAuthContextValue(realChatgptAuthWithIdentity);
    assert.equal(realChatgptAuthWithPlan.accountId, "real-chatgpt-account");
    assert.equal(realChatgptAuthWithPlan.userId, "user-real");
    assert.equal(realChatgptAuthWithPlan.planAtLogin, "pro_20x");
    assert.equal(realChatgptAuthWithPlan.account.planType, "pro_20x");
    assert.equal(realChatgptAuthWithPlan.account.plan_type, "pro_20x");
    const realChatgptAuthStable = api.profileUiAuthContextValue(realChatgptAuthWithIdentity);
    assert.equal(realChatgptAuthStable, realChatgptAuthWithPlan, "real-account data-override auth must keep a stable reference while plan is unchanged");
    api.applyLocalProfilePatch({ planType: "plus" });
    const realChatgptAuthAfterPlan = api.profileUiAuthContextValue(realChatgptAuthWithIdentity);
    assert.notEqual(realChatgptAuthAfterPlan, realChatgptAuthStable);
    assert.equal(realChatgptAuthAfterPlan.planAtLogin, "plus");
    assert.equal(realChatgptAuthAfterPlan.account.planType, "plus");
    api.applyLocalProfilePatch({ planType: "pro_20x" });
    const realChatgptAuthContext = {
      name: "auth",
      _currentValue: {
        authMethod: "chatgpt",
        openAIAuth: null,
        requiresAuth: false,
        isLoading: false,
        accountId: "real-chatgpt-account",
        userId: "user-real",
        hasChatGptToken: true,
        account: {
          id: "real-chatgpt-account",
          type: "chatgpt",
          planType: "free",
          plan_type: "free",
        },
      },
      _currentValue2: null,
    };
    const realChatgptReadinessButton = {
      __reactFiber$real: {
        dependencies: {
          firstContext: {
            context: realChatgptAuthContext,
            memoizedValue: realChatgptAuthContext._currentValue,
            next: null,
          },
        },
        return: { memoizedProps: { value: realChatgptOverrideQueryClient }, return: null },
      },
      getBoundingClientRect() {
        return { width: 184, height: 29 };
      },
    };
    const realChatgptDocument = {
      body: {},
      querySelector(selector) {
        return selector.includes("个人资料") ? realChatgptReadinessButton : null;
      },
    };
    assert.equal(api.installProfileUiReadinessCoordinator(["ProfileFooterHarness"], realChatgptDocument), true);
    assert.equal(context.__codexLiveTokenCostProfileAuthPatch, "0.7.10-beta1");
    assert.equal(api.profileSyntheticAuth(), true);
    const realChatgptPatchedAuth = api.profileUiAuthContextValue(realChatgptAuthContext._currentValue);
    assert.equal(realChatgptPatchedAuth.accountId, "real-chatgpt-account");
    assert.equal(realChatgptPatchedAuth.userId, "user-real");
    assert.equal(realChatgptPatchedAuth.authMethod, "chatgpt");
    assert.equal(realChatgptPatchedAuth.hasChatGptToken, true);
    assert.equal(realChatgptPatchedAuth.planAtLogin, "pro_20x");
    assert.equal(realChatgptPatchedAuth.account.planType, "pro_20x");
    assert.equal(realChatgptPatchedAuth.account.plan_type, "pro_20x");
    const realChatgptEmptyWrites = [];
    const realChatgptEmptyQueryClient = {
      invalidateQueries() {},
      getQueryCache() {
        return {
          getAll() {
            return [
              {
                queryKey: ["accounts", "check"],
                state: { data: { accounts: [{ id: "real-chatgpt-account", account_user_id: "user-real" }] } },
              },
              {
                queryKey: ["profile", "usage", "user-real", "real-chatgpt-account"],
                state: { status: "pending", data: undefined },
              },
            ];
          },
        };
      },
      setQueryData(queryKey, data) {
        realChatgptEmptyWrites.push({ queryKey, data });
      },
    };
    assert.equal(api.syncProfileUsageQueryCache(realChatgptEmptyQueryClient), true);
    const realChatgptEmptySynced = realChatgptEmptyWrites.find(({ queryKey }) => queryKey.join("/") === "profile/usage/user-real/real-chatgpt-account");
    assert.ok(realChatgptEmptySynced);
    assert.equal(realChatgptEmptySynced.data.summary.totalTextTokens, api.localProfileResponse().stats.lifetime_tokens);
    assert.equal(realChatgptEmptySynced.data.dailyUsage.at(-1).credits, api.localProfileResponse().stats.daily_usage_buckets.at(-1).tokens);
    assert.equal(realChatgptEmptyWrites.some(({ queryKey }) => queryKey.join("/") === "vscode/account-info"), false);
    api.rememberProfileQueryClient(startupApiKeyQueryClient);
    api.refreshProfileRealChatgptCache(startupApiKeyQueryClient);
    assert.equal(api.isRealChatgptAccount({ id: "real-account", account_user_id: "user-real" }), true);
assert.equal(api.isRealChatgptAccount({ id: "api-account", type: "apiKey", plan_type: "api" }), false);
assert.equal(api.isRealChatgptAccount({ id: "local-profile-account", account_user_id: "user-local" }), false);
let realChatgptCacheScans = 0;
const cacheCountingQueryClient = {
  getQueryCache() {
    return {
      getAll() {
        realChatgptCacheScans += 1;
        return [];
      },
    };
  },
  invalidateQueries() {
    return Promise.resolve();
  },
};
assert.equal(api.profileRealChatgptCached(cacheCountingQueryClient), false);
assert.equal(api.profileRealChatgptCached(cacheCountingQueryClient), false);
assert.equal(realChatgptCacheScans, 1);
api.refreshProfileRealChatgptCache(cacheCountingQueryClient);
assert.equal(realChatgptCacheScans, 2);
assert.equal(api.profileRealChatgptCached(cacheCountingQueryClient), false);
assert.equal(realChatgptCacheScans, 2);
let profileReadinessObserver = null;
context.MutationObserver = class ProfileReadinessObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    profileReadinessObserver = this;
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
};
assert.equal(api.installProfileUiReadinessCoordinator(["ProfileFooterHarness"], delayedProfileDocument), false);
assert.equal(context.__codexLiveTokenCostProfileAuthPatch, "waiting");
assert.ok(profileReadinessObserver);
delayedProfileButton = {
  __reactFiber$delayedProfile: {
    dependencies: {
      firstContext: { context: delayedAuthContext, memoizedValue: delayedRawApiAuth, next: null },
    },
    return: { memoizedProps: { value: delayedProfileQueryClient }, return: null },
  },
  getBoundingClientRect() {
    return { width: 184, height: 29 };
  },
};
profileReadinessObserver.callback([{ addedNodes: [delayedProfileButton] }]);
assert.equal(context.__codexLiveTokenCostProfileAuthPatch, "0.7.10-beta1");
assert.equal(api.profileSyntheticAuth(), true);
assert.equal(profileReadinessObserver.disconnected, true);
assert.equal(delayedProfileCacheWrites.length > 0, true);
assert.deepEqual(delayedProfileCacheWrites[0].queryKey, ["profile", "usage", "disabled"]);
assert.equal(delayedProfileInvalidations.map((queryKey) => queryKey.join("/")).join(","), "accounts/check,profile/usage");
assert.equal(delayedAuthContext._currentValue.authMethod, "apikey");
api.installProfileUiReadinessCoordinator([], delayedProfileDocument);
assert.equal(api.profileSyntheticAuth(), false);
assert.equal(typeof api.invalidateProfileQueryWithClient, "function");
const profileQueryInvalidations = [];
const profileQueryClient = {
  getQueryCache() {
    return {};
  },
  invalidateQueries(options) {
    profileQueryInvalidations.push(options);
    return Promise.resolve();
  },
};
const profileQueryInvalidationTest = Promise.resolve()
  .then(() => api.invalidateProfileQueryWithClient(profileQueryClient, ["accounts", "check"]))
  .then((invalidated) => {
    assert.equal(invalidated, true);
    assert.equal(profileQueryInvalidations.length, 1);
    assert.equal(profileQueryInvalidations[0].queryKey.join("/"), "accounts/check");
  });
assert.equal(typeof api.profileQueryClientFromFiberNode, "function");
const profileQueryClientFiberNode = {};
profileQueryClientFiberNode.__reactFiber$test = { memoizedProps: { value: profileQueryClient }, return: null };
assert.equal(api.profileQueryClientFromFiberNode(profileQueryClientFiberNode), profileQueryClient);
const contextProfileQueryClientFiberNode = {};
contextProfileQueryClientFiberNode.__reactFiber$context = {
  dependencies: {
    firstContext: { memoizedValue: profileQueryClient, next: null },
  },
  return: null,
};
assert.equal(api.profileQueryClientFromFiberNode(contextProfileQueryClientFiberNode), profileQueryClient);

const newProfilePanelClient = {
  invalidateQueries() {},
  getQueryCache() {
    return { getAll: () => [] };
  },
};
const newProfilePanelNode = {};
newProfilePanelNode.__reactFiber$newProfile = { memoizedProps: { value: newProfilePanelClient }, return: null };
const newProfilePanelDoc = {
  querySelector(selector) {
    if (selector === "[data-settings-panel-slug='profile'], [aria-label='个人资料'], [aria-label='Profile']") return newProfilePanelNode;
    return null;
  },
};
assert.equal(api.profileQueryClientFromDocument(newProfilePanelDoc), newProfilePanelClient);
assert.equal(typeof api.chainProfileQueryRefresh, "function");
const profileRefreshOrder = [];
let releaseProfileRefresh;
const firstProfileRefresh = new Promise((resolve) => {
  releaseProfileRefresh = resolve;
});
const secondProfileRefresh = api.chainProfileQueryRefresh(firstProfileRefresh, async () => {
  profileRefreshOrder.push("second");
});
assert.equal(profileRefreshOrder.length, 0);
releaseProfileRefresh();
Promise.resolve(secondProfileRefresh).then(() => {
  assert.equal(profileRefreshOrder.join("/"), "second");
});

const sections = [
  { slug: "general-settings" },
  { slug: "profile" },
  { slug: "agent" },
];
const visible = [{ slug: "general-settings" }, { slug: "agent" }];
const unlocked = api.profileUnlockedSettingsSections(sections, visible);
assert.deepEqual(
  unlocked.map((section) => section.slug),
  ["general-settings", "profile", "agent"],
);

assert.equal(api.profileUsernameAllowed("Tian_001"), true);
assert.equal(api.profileUsernameAllowed("ab"), false);
assert.equal(api.isProfileFetchMessage({ type: "fetch", method: "PATCH", url: "/wham/profiles/me" }), true);
assert.equal(api.isProfileFetchMessage({ type: "fetch", method: "GET", url: "/wham/accounts/check" }), false);
assert.equal(api.isProfileFetchMessage({ type: "fetch", method: "PATCH", url: "/v1/responses" }), false);
api.applyLocalProfilePatch({ display_name: "Tian", username: "Tian_001" });
const profile = api.localProfileResponse().profile;
assert.equal(profile.display_name, "Tian");
assert.equal(profile.username, "Tian_001");
assert.equal(profile.email, "sama@openai.com");
assert.equal(profile.plan_type, "pro_20x");
assert.equal(profile.plan_label, "Pro 20x");
api.applyLocalProfilePatch({ profile: { displayName: "Tian Local", handle: "Tian_002" } });
const nestedProfile = api.localProfileResponse().profile;
assert.equal(nestedProfile.display_name, "Tian Local");
assert.equal(nestedProfile.username, "Tian_002");
api.applyLocalProfilePatch({ requestBody: { display_name: "Tian Envelope", username: "Tian_003" } });
const envelopeProfile = api.localProfileResponse().profile;
assert.equal(envelopeProfile.display_name, "Tian Envelope");
assert.equal(envelopeProfile.username, "Tian_003");
const spoofedNamed = api.spoofProfileAccountPayload({
  account: { type: "apiKey", planType: "api" },
  requiresOpenaiAuth: true,
});
assert.equal(spoofedNamed.account.name, undefined);
assert.equal(spoofedNamed.account.displayName, undefined);
const spoofedChatgptNamed = api.spoofProfileAccountPayload({
  account: { type: "chatgpt", name: "设置", displayName: "设置", imageUrl: "" },
  requiresOpenaiAuth: true,
});
assert.equal(spoofedChatgptNamed.account.name, "设置");
assert.equal(spoofedChatgptNamed.account.displayName, "设置");
assert.equal(spoofedChatgptNamed.requiresOpenaiAuth, true);
const spoofedNamedAuth = api.spoofProfileAuthContextValue({ authMethod: "apikey", account: { id: "api-account", type: "apiKey" } });
assert.equal(spoofedNamedAuth.displayName, undefined);
assert.equal(spoofedNamedAuth.account.displayName, undefined);
const profileUiAuth = api.profileUiAuthContextValue({
  authMethod: "apikey",
  openAIAuth: "api_key",
  requiresAuth: true,
  accountId: "api-account",
  userId: "api-user",
  account: { id: "api-account", type: "apiKey", planType: "api" },
});
assert.equal(profileUiAuth.authMethod, "chatgpt");
assert.equal(profileUiAuth.openAIAuth, "api_key");
assert.equal(profileUiAuth.requiresAuth, false);
assert.equal(profileUiAuth.accountId, "local-profile-account");
assert.equal(profileUiAuth.userId, "local-profile-user");
assert.equal(profileUiAuth.hasChatGptToken, true);
assert.equal(profileUiAuth.account.id, "local-profile-account");
assert.equal(profileUiAuth.account.type, "chatgpt");
const stableApiAuthSource = {
  authMethod: "apikey",
  openAIAuth: "api_key",
  requiresAuth: true,
  accountId: "api-account",
  userId: "api-user",
  account: { id: "api-account", type: "apiKey", planType: "api" },
};
const stableApiAuthFirst = api.profileUiAuthContextValue(stableApiAuthSource);
const stableApiAuthSecond = api.profileUiAuthContextValue(stableApiAuthSource);
assert.equal(
  stableApiAuthSecond,
  stableApiAuthFirst,
  "API-key auth spoof must keep a stable reference per source and prefs so broad useAuth reads do not churn context identity",
);
const realChatgptAuth = { authMethod: "chatgpt", accountId: "real-account" };
assert.equal(api.profileUiAuthContextValue(realChatgptAuth).accountId, "real-account");

const statsProfile = api.localProfileResponse();
assert.equal(statsProfile.metadata.stats_error, "");
assert.equal(statsProfile.stats.daily_usage_buckets[0].start_date, "2025-07-13");
assert.equal(statsProfile.stats.daily_usage_buckets.at(-1).start_date, "2026-07-04");
assert.equal(statsProfile.stats.daily_usage_buckets.at(-1).tokens, 1500);
assert.ok(statsProfile.stats.daily_usage_buckets.length > 300);
assert.equal(statsProfile.stats.lifetime_tokens, 1500);
assert.equal(statsProfile.stats.total_threads, 1);
assert.equal(api.localProfileThreadCount(), 1);
assert.equal(statsProfile.stats.fast_mode_usage_percentage, 0);
assert.equal(statsProfile.stats.longest_running_turn_sec, 0);
const beforeImportProfile = api.localProfileResponse();
api.importLocalUsageTurns(
  [
    {
      turnId: "local:request-count-is-not-thread-count",
      source: "codex-live-token-cost",
      model: "gpt-5.5",
      createdAt: "2026-07-04T12:00:00.000Z",
      callCount: 47091,
      usage: { input_tokens: 47091, output_tokens: 1, total_tokens: 47092 },
    },
  ],
);
const afterImportProfile = api.localProfileResponse();
assert.equal(afterImportProfile.stats.total_threads, beforeImportProfile.stats.total_threads);
const importedDay04 = api.localDailyUsage().get("2026-07-04");
assert.equal(importedDay04.tokens, 48592);
const profileImportedDay04 = afterImportProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-04");
assert.equal(profileImportedDay04.tokens, 48592);
assert.equal(api.todayUsage().total, 48592);

assert.equal(api.migrateLegacyLocationSessionTurns("local:thread-2"), 1);
assert.equal(api.currentSessionTurns(api.localUsageExport().turns, "local:thread-2").length, 1);

const activityPayload = {
  reasoning_effort: "high",
  speed_tier: "fast",
  tool_invocations: [
    { type: "skill", skill_name: "review" },
    { type: "plugin", plugin_id: "plugin-1", plugin_name: "GitHub" },
  ],
};
assert.equal(api.extractFastMode(activityPayload), true);
assert.equal(api.extractFastMode({ serviceTier: "priority" }), true);
assert.equal(api.extractFastMode({ params: { serviceTier: "priority" } }), true);
assert.equal(api.extractFastMode({ serviceTier: null }), false);
assert.equal(api.extractFastMode({ serviceTier: "standard" }), false);
assert.equal(api.extractFastMode({ service_tier: "fast" }), true);
assert.equal(api.extractFastMode({ message: "/fast hello" }), null);
assert.equal(
  JSON.stringify(
    api.collectProfileInvocations({
      type: "mcp-notification",
      method: "item/completed",
      params: {
        item: { type: "mcpToolCall", id: "mcp-call-1", server: "chrome_devtools", tool: "list_pages", status: "completed" },
      },
    }),
  ),
  JSON.stringify([{ type: "plugin", plugin_id: "chrome_devtools", plugin_name: "chrome_devtools", invocationId: "mcp-call-1" }]),
);
assert.equal(
  JSON.stringify(
    api.collectProfileInvocations({
      type: "mcp-notification",
      method: "item/completed",
      params: {
        item: {
          type: "commandExecution",
          id: "skill-call-1",
          command:
          'rtk read "C:\\\\Users\\\\ovo\\\\.skills-manager\\\\skills\\\\systematic-debugging\\\\SKILL.md"; rtk read "C:\\\\Users\\\\ovo\\\\.skills-manager\\\\skills\\\\gstack\\\\autoplan\\\\SKILL.md"',
        },
      },
    }),
  ),
  JSON.stringify([
    {
      type: "skill",
      skill_id: "systematic-debugging",
      skill_name: "systematic-debugging",
      invocationId: "skill-call-1:skill:systematic-debugging",
    },
    { type: "skill", skill_id: "autoplan", skill_name: "autoplan", invocationId: "skill-call-1:skill:autoplan" },
  ]),
);
assert.equal(api.collectProfileInvocations(activityPayload).length, 2);
api.rememberLocalUsage(
  { input_tokens: 2000, output_tokens: 1000, cached_tokens: 0, total_tokens: 3000 },
  "test",
  {
    effort: "high",
    fastMode: true,
    invocations: api.collectProfileInvocations(activityPayload),
  },
  { sessionKey: "local:activity-thread", persist: true },
);
const activityProfile = api.localProfileResponse();
assert.equal(api.todayUsage().total, 51592);
assert.equal(activityProfile.stats.fast_mode_usage_percentage, 6);
api.finishLocalTurn(0, { reason: "activity-test", force: true, sessionKey: "local:activity-thread" });
assert.equal(Object.hasOwn(activityProfile.stats, "fastModeUsagePercentage"), false);
assert.equal(Object.hasOwn(activityProfile.stats, "fast_mode_usage_percent"), false);
assert.equal(Object.hasOwn(activityProfile.stats, "fast_mode_usage_count"), false);
assert.equal(Object.hasOwn(activityProfile.stats, "fastModeUsed"), false);
assert.equal(Object.hasOwn(activityProfile.profile, "fast_mode_usage_percentage"), false);
assert.equal(activityProfile.stats.most_used_reasoning_effort, "high");
assert.equal(activityProfile.stats.most_used_reasoning_effort_percentage, 100);
assert.equal(activityProfile.stats.unique_skills_used, 1);
assert.equal(activityProfile.stats.total_skills_used, 1);
assert.equal(
  JSON.stringify(activityProfile.stats.top_invocations),
  JSON.stringify([
    { type: "plugin", plugin_id: "plugin-1", plugin_name: "GitHub", usage_count: 1 },
    { type: "skill", skill_name: "review", usage_count: 1 },
  ]),
);
api.inspectLocalPayload(
  {
    type: "send_message",
    threadId: "activity-thread",
    input: "run tests",
    reasoning_effort: "medium",
    serviceTier: "standard",
    tool_invocations: [{ type: "skill", skill_id: "skill-2", skill_name: "write-tests" }],
  },
  "fetch-body",
);
api.inspectLocalPayload({ threadId: "activity-thread", usage: { input_tokens: 4000, output_tokens: 1000, cached_tokens: 0, total_tokens: 5000 } }, "fetch");
const splitActivityProfile = api.localProfileResponse();
assert.equal(splitActivityProfile.stats.fast_mode_usage_percentage, 5);
assert.equal(splitActivityProfile.stats.unique_skills_used, 2);
assert.equal(splitActivityProfile.stats.total_skills_used, 2);
assert.equal(
  splitActivityProfile.stats.top_invocations.some((item) => item.type === "skill" && item.skill_id === "skill-2" && item.skill_name === "write-tests"),
  true,
);
assert.equal(
  api.countsTowardFastModeUsage({
    source: "codex-live-token-cost",
    fastMode: true,
    usage: { input: 10, output: 1, total: 11 },
  }),
  true,
);
assert.equal(
  api.countsTowardFastModeUsage({
    source: "codex-live-token-cost",
    fastMode: null,
    usage: { input: 10, output: 1, total: 11 },
  }),
  true,
);
assert.equal(
  api.localProfileActivityStats([
    {
      source: "codex-live-token-cost",
      sessionKey: "local:thread-1",
      observedAt: Date.parse("2026-07-04T10:59:59.000Z"),
      fastMode: null,
      usage: { input: 10, output: 1, total: 11 },
    },
    {
      source: "codex-live-token-cost",
      sessionKey: "local:thread-1",
      observedAt: Date.parse("2026-07-04T11:00:01.000Z"),
      fastMode: true,
      usage: { input: 10, output: 1, total: 11 },
    },
    {
      source: "codex-live-token-cost",
      sessionKey: "local:thread-1",
      observedAt: Date.parse("2026-07-04T11:00:02.000Z"),
      fastMode: false,
      usage: { input: 10, output: 1, total: 11 },
    },
  ]).fastModePercent,
  33,
);
assert.equal(
  api.localProfileActivityStats([
    {
      source: "cc-switch",
      importSource: "cc-switch",
      observedAt: Date.parse("2026-07-04T11:00:01.000Z"),
      fastMode: null,
      usage: { input: 10, output: 1, total: 11 },
    },
  ]).fastModePercent,
  null,
);
const canonicalActivity = api.localProfileActivityStats([
  {
    source: "codex-live-token-cost",
    fastMode: true,
    effort: "high",
    usage: { input: 70, output: 30, total: 100 },
    invocations: [
      { type: "skill", skill_id: "review", skill_name: "review" },
      { type: "plugin", plugin_id: "github", plugin_name: "GitHub" },
    ],
  },
  {
    source: "codex-live-token-cost",
    fastMode: false,
    effort: "high",
    usage: { input: 20, output: 80, total: 100 },
    invocations: [{ type: "plugin", plugin_id: "github", plugin_name: "GitHub" }],
  },
]);
assert.equal(canonicalActivity.fastModePercent, 50);
assert.equal(canonicalActivity.reasoningEffort, "high");
assert.equal(canonicalActivity.reasoningEffortPercent, 100);
assert.equal(canonicalActivity.uniqueSkillsUsed, 1);
assert.equal(canonicalActivity.totalSkillsUsed, 1);
assert.equal(canonicalActivity.uniquePluginsUsed, 1);
assert.equal(canonicalActivity.totalPluginsUsed, 2);
assert.equal(
  JSON.stringify(canonicalActivity.topInvocations),
  JSON.stringify([
    { type: "plugin", plugin_id: "github", plugin_name: "GitHub", usage_count: 2 },
    { type: "skill", skill_id: "review", skill_name: "review", usage_count: 1 },
  ]),
);
const helperProfile = api.localProfileResponse();
assert.equal(helperProfile.stats.unique_skills_used, 2);
assert.equal(helperProfile.stats.total_skills_used, 2);
assert.equal(helperProfile.stats.total_threads, 2);
assert.equal(
  JSON.stringify(helperProfile.stats.top_invocations),
  JSON.stringify([
    { type: "plugin", plugin_id: "plugin-1", plugin_name: "GitHub", usage_count: 1 },
    { type: "skill", skill_name: "review", usage_count: 1 },
    { type: "skill", skill_id: "skill-2", skill_name: "write-tests", usage_count: 1 },
  ]),
);
assert.equal(
  JSON.stringify(helperProfile.stats.top_plugins),
  JSON.stringify([{ type: "plugin", plugin_id: "plugin-1", plugin_name: "GitHub", usage_count: 1 }]),
);
assert.equal(helperProfile.stats.most_used_plugin, "GitHub");
assert.equal(helperProfile.stats.most_used_plugin_usage_count, 1);
api.importLocalUsageTurns([
  {
    turnId: "script:2026-06-10:gpt-5.5",
    source: "codex-live-token-cost",
    model: "gpt-5.5",
    createdAt: "2026-06-10T12:00:00.000Z",
    fastMode: true,
    usage: { input: 300, output: 21, cached: 100, total: 321 },
  },
  {
    turnId: "script:2026-06-15:gpt-5.5",
    source: "codex-live-token-cost",
    model: "gpt-5.5",
    createdAt: "2026-06-15T12:00:00.000Z",
    usage: { input: 1000, output: 500, cached: 200, total: 1500 },
  },
  {
    turnId: "script:2026-06-15:unknown",
    source: "codex-live-token-cost",
    model: "unknown",
    createdAt: "2026-06-15T12:05:00.000Z",
    usage: { input: 3000, output: 1000, cached: 1000, total: 4000 },
  },
]);
const importResult = api.importLocalUsageTurns(
  [
    {
      turnId: "import:2026-06-01:gpt-5.5",
      importSource: "local-import",
      source: "local-import",
      model: "gpt-5.5",
      createdAt: "2026-06-01T12:00:00.000Z",
      durationMs: 62000,
      callCount: 3,
      usage: { input: 100, output: 20, cached: 40, total: 120 },
      costUsd: 1.23,
    },
    {
      turnId: "import:2026-06-15:gpt-5.5",
      importSource: "local-import",
      source: "local-import",
      model: "gpt-5.5",
      createdAt: "2026-06-15T12:00:00.000Z",
      callCount: 4,
      usage: { input: 1700, output: 600, cached: 250, total: 2300 },
    },
  ],
);
assert.equal(importResult.imported, 2);
const importedProfile = api.localProfileResponse();
const localOnlyDay = importedProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-06-10");
assert.equal(localOnlyDay.tokens, 321);
assert.equal(localOnlyDay.requests, 1);
assert.equal(localOnlyDay.cost, ((200 * 5 + 100 * 0.5 + 21 * 30) / 1_000_000) * 2.5);
const importedDay = importedProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-06-01");
assert.equal(importedDay.tokens, 120);
assert.equal(importedDay.requests, 3);
assert.equal(importedDay.cost, 1.23);
assert.equal(importedProfile.stats.longest_running_turn_sec, 0);
const importedDay0615 = importedProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-06-15");
assert.equal(importedDay0615.tokens, 7800);
assert.equal(importedDay0615.requests, 6);
const hubImportedDay0615 = api.localDailyUsage().get("2026-06-15");
assert.equal(hubImportedDay0615.tokens, 7800);
assert.equal(hubImportedDay0615.input, 5700);
assert.equal(hubImportedDay0615.output, 2100);
assert.equal(hubImportedDay0615.cached, 1450);
assert.equal(hubImportedDay0615.requests, 6);
const importedResidual0615 = api.localUsageExport().turns.find((turn) => turn.turnId === "import:2026-06-15:gpt-5.5");
assert.equal(JSON.stringify(importedResidual0615.usage), JSON.stringify({ input: 1700, output: 600, cached: 250, total: 2300, exact: true }));
assert.equal(importedResidual0615.callCount, 4);
api.importLocalUsageTurns([
  {
    turnId: "network-session-thread",
    sessionKey: "local:thread-1",
    model: "gpt-5.5",
    createdAt: "2026-06-02T12:00:00.000Z",
    usage: { input: 1, output: 1, cached: 1, total: 2 },
  },
]);
assert.equal(api.observeSessionInfo({ threadId: "thread-1" }), true);
assert.equal(api.currentSessionKey(), "local:thread-1");
const originalDocumentQuerySelector = context.document.querySelector;
context.document.querySelector = function querySelector(selector) {
  return selector === "main" ? { innerText: "D:\\ovo\\Documents\\workspace\\project-007-codex-token-cost\\\n新对话 Ctrl+N 自定义 高" } : null;
};
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? "thread-1" : "";
            },
          }
        : null;
    },
  },
});
assert.equal(api.currentSessionKey(), "local:thread-1");
context.document.querySelector = originalDocumentQuerySelector;
const beforeLongStayNow = currentNow;
currentNow = beforeLongStayNow + 11 * 60 * 1000;
assert.equal(api.currentSessionKey(), "local:thread-1");
assert.equal(api.liveSnapshot().session.total > 0, true);
const blankStartupDomForStaleSidebarSelection = startupDom();
context.document.querySelector = blankStartupDomForStaleSidebarSelection.querySelector;
assert.equal(api.currentSessionKey(), "new:auto");
context.document.querySelector = originalDocumentQuerySelector;
context.document.querySelector = function querySelector(selector) {
  if (selector === "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]") {
    return {
      getAttribute(name) {
        return name === "data-app-action-sidebar-thread-id" ? "local:thread-2" : "";
      },
      closest() {
        return this;
      },
    };
  }
  return null;
};
assert.equal(api.activeSidebarThreadKey(), "local:thread-2");
assert.equal(api.currentSessionKey(), "local:thread-2");
context.document.querySelector = originalDocumentQuerySelector;
currentNow = beforeLongStayNow;
assert.equal(
  api.rememberNewConversationClick({
    type: "click",
    target: {
      textContent: "新建对话",
      getAttribute() {
        return "";
      },
      closest() {
        return this;
      },
    },
  }),
  true,
);
assert.equal(api.currentSessionKey().startsWith("new:"), true);
assert.equal(api.currentSessionTurns(api.localUsageExport().turns).length, 0);
assert.equal(api.observeSessionInfo({ threadId: "thread-1" }), true);
assert.equal(api.currentSessionKey(), "local:thread-1");
assert.deepEqual(
  api.currentSessionTurns(api.localUsageExport().turns).map((turn) => turn.sessionKey),
  ["local:thread-1"],
);

api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 20, output_tokens: 3, cached_tokens: 4, total_tokens: 23 }, "websocket");
assert.equal(api.liveSnapshot().running, true);
assert.equal(api.liveSnapshot().current.total, 23);
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? "thread-2" : "";
            },
          }
        : null;
    },
  },
});
const switchedBackgroundSnapshot = api.liveSnapshot();
assert.equal(switchedBackgroundSnapshot.sessionKey, "local:thread-2");
assert.equal(switchedBackgroundSnapshot.running, false);
assert.notEqual(switchedBackgroundSnapshot.current.total, 23);
api.inspectLocalPayload(
  {
    threadId: "thread-1",
    usage: { input_tokens: 30, output_tokens: 1, cached_tokens: 5, total_tokens: 31 },
  },
  "websocket",
);
const foregroundAfterBackgroundUsage = api.liveSnapshot();
assert.equal(foregroundAfterBackgroundUsage.sessionKey, "local:thread-2");
assert.equal(foregroundAfterBackgroundUsage.running, false);
assert.equal(foregroundAfterBackgroundUsage.current.total, switchedBackgroundSnapshot.current.total);
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? "thread-1" : "";
            },
          }
        : null;
    },
  },
});
const restoredBackgroundTurn = api.localUsageExport().currentTurn;
assert.equal(restoredBackgroundTurn.sessionKey, "local:thread-1");
assert.equal(restoredBackgroundTurn.usage.total, 54);
api.persistLocalCurrentTurn("background-switch-test");
api.finishLocalTurn(0, { reason: "background-switch-test", force: true });

api.importLocalUsageTurns([
  {
    turnId: "prefix-live-seed",
    sessionKey: "local:prefix-live-thread",
    model: "gpt-5.5",
    createdAt: "2026-06-02T12:00:00.000Z",
    usage: { input: 9, output: 1, cached: 0, total: 10 },
  },
]);
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? "prefix-live-thread" : "";
            },
          }
        : null;
    },
  },
});
api.rememberLocalUsage(
  { input_tokens: 70, output_tokens: 5, cached_tokens: 20, total_tokens: 75 },
  "websocket",
  {},
  { sessionKey: "prefix-live-thread" },
);
const prefixLiveSnapshot = api.liveSnapshot();
assert.equal(prefixLiveSnapshot.sessionKey, "local:prefix-live-thread");
assert.equal(prefixLiveSnapshot.current.total, 75);
api.finishLocalTurn(0, { reason: "prefix-live-test", force: true, sessionKey: "prefix-live-thread" });

const beforeBridgeUsageProfile = api.localProfileResponse();
api.inspectLocalPayload(
  {
    type: "fetch-response",
    status: 200,
    bodyJsonString: JSON.stringify({
      usage: { input_tokens: 777, output_tokens: 23, cached_tokens: 100, total_tokens: 800 },
    }),
  },
  "message",
);
const bridgeUsageProfile = api.localProfileResponse();
assert.equal(bridgeUsageProfile.stats.lifetime_tokens, beforeBridgeUsageProfile.stats.lifetime_tokens);
assert.equal(bridgeUsageProfile.stats.total_threads, beforeBridgeUsageProfile.stats.total_threads);

api.beginLocalTurn({ forceNewIfUsed: true });
const beforeStreamTurns = api.localUsageExport().turns.length;
const beforeStreamDayUsage = api.liveSnapshot().dayUsage.total;
const beforeStreamDayCost = api.liveSnapshot().dayCost.value;
api.rememberLocalUsage({ input_tokens: 120, output_tokens: 10, cached_tokens: 20, total_tokens: 130 }, "websocket");
api.rememberLocalUsage({ input_tokens: 30, output_tokens: 70, cached_tokens: 0, total_tokens: 100 }, "websocket");
const streamSnapshot = api.liveSnapshot();
assert.equal(streamSnapshot.current.input, 150);
assert.equal(streamSnapshot.current.output, 80);
assert.equal(streamSnapshot.current.cached, 20);
assert.equal(streamSnapshot.current.total, 230);
assert.equal(streamSnapshot.dayUsage.total, beforeStreamDayUsage + 230);
assert.equal(streamSnapshot.dayCost.value > beforeStreamDayCost, true);
const liveOnlyStreamExport = api.localUsageExport();
assert.equal(liveOnlyStreamExport.turns.length, beforeStreamTurns);
assert.equal(liveOnlyStreamExport.currentTurn.callCount, 2);
assert.equal(liveOnlyStreamExport.currentTurn.usage.output, 80);
api.inspectLocalPayload({ reasoning_effort: "high" }, "fetch-body");
api.rememberLocalUsage({ input_tokens: 50, output_tokens: 5, cached_tokens: 10, total_tokens: 55 }, "websocket");
const requestContinuationExport = api.localUsageExport();
assert.equal(requestContinuationExport.currentTurn.callCount, 3);
assert.equal(requestContinuationExport.currentTurn.usage.input, 200);
assert.equal(requestContinuationExport.currentTurn.usage.output, 85);
assert.equal(requestContinuationExport.currentTurn.usage.cached, 30);
assert.equal(requestContinuationExport.currentTurn.usage.total, 285);
assert.equal(api.liveSnapshot().dayUsage.total, beforeStreamDayUsage + 285);
const beforeIdleStreamProfile = api.localProfileResponse();
assert.equal(api.persistLocalCurrentTurn("idle"), true);
const idleStreamExport = api.localUsageExport();
assert.equal(idleStreamExport.turns.length, beforeStreamTurns + 1);
assert.equal(idleStreamExport.currentTurn.usage.total, 285);
assert.equal(api.liveSnapshot().current.total, 285);
assert.equal(api.liveSnapshot().dayUsage.total, beforeStreamDayUsage + 285);
const idleStreamProfile = api.localProfileResponse();
assert.equal(idleStreamProfile.stats.lifetime_tokens, beforeIdleStreamProfile.stats.lifetime_tokens);
const beforeFinalStreamProfile = api.localProfileResponse();
api.inspectLocalPayload(
  {
    type: "fetch-response",
    status: 200,
    bodyJsonString: JSON.stringify({
      usage: { input_tokens: 130, output_tokens: 85, cached_tokens: 20, total_tokens: 215 },
    }),
  },
  "message",
);
const finalStreamTurns = api.localUsageExport().turns;
assert.equal(finalStreamTurns.length, beforeStreamTurns + 1);
assert.equal(finalStreamTurns.at(-1).callCount, 4);
assert.equal(finalStreamTurns.at(-1).usage.input, 330);
assert.equal(finalStreamTurns.at(-1).usage.output, 170);
assert.equal(finalStreamTurns.at(-1).usage.cached, 50);
assert.equal(finalStreamTurns.at(-1).usage.total, 500);
assert.equal(api.localUsageExport().currentTurn.callCount, 4);
assert.equal(api.liveSnapshot().running, true);
const finalStreamProfile = api.localProfileResponse();
assert.equal(finalStreamProfile.stats.lifetime_tokens, beforeFinalStreamProfile.stats.lifetime_tokens + 215);
assert.equal(finalStreamProfile.stats.total_threads, beforeFinalStreamProfile.stats.total_threads);

api.beginLocalTurn({ forceNewIfUsed: true });
const beforeDomRunningIdleTurns = api.localUsageExport().turns.length;
api.rememberLocalUsage({ input_tokens: 40, output_tokens: 4, cached_tokens: 10, total_tokens: 44 }, "websocket");
domComposerState = "active-send";
api.scheduleLocalTurnCompletionCheck(1);
const domRunningIdleExport = api.localUsageExport();
assert.equal(domRunningIdleExport.turns.length, beforeDomRunningIdleTurns + 1);
assert.equal(domRunningIdleExport.turns.at(-1).persistReason, "live");
assert.equal(domRunningIdleExport.currentTurn.usage.total, 44);
assert.equal(api.liveSnapshot().running, true);
assert.equal(api.isCodexTaskRunningDom(), true);
domComposerState = "complete-send";
api.scheduleLocalTurnCompletionCheck(1);
const domFinishedIdleExport = api.localUsageExport();
assert.equal(domFinishedIdleExport.currentTurn.usage.total, 44);
assert.equal(domFinishedIdleExport.turns.at(-1).persistReason, "live");
assert.equal(api.liveSnapshot().running, true);
domComposerState = "active-send";
const restoredSnapshot = api.liveSnapshot();
assert.equal(restoredSnapshot.running, true);
assert.equal(api.localUsageExport().currentTurn.usage.total, 44);
api.inspectLocalPayload({ type: "event_msg", payload: { type: "task_complete" } }, "message");
assert.equal(api.localUsageExport().currentTurn.usage.total, 44);
assert.equal(api.liveSnapshot().running, false);
api.finishLocalTurn(0, { reason: "generic-complete-reset", force: true });
function composerSendClickTarget(label = "Send") {
  return {
    __composerChild: true,
    textContent: "",
    getAttribute(name) {
      return name === "aria-label" ? label : "";
    },
    closest() {
      return this;
    },
  };
}
function outsideSubmitClickTarget(label = "提交或推送") {
  return {
    textContent: label,
    getAttribute() {
      return "";
    },
    closest() {
      return this;
    },
  };
}
api.rememberPendingInput({ type: "click", target: composerSendClickTarget() });
const restoredRunningExport = api.localUsageExport();
assert.equal(restoredRunningExport.turns.length, beforeDomRunningIdleTurns + 1);
assert.equal(restoredRunningExport.currentTurn, null);
assert.equal(api.liveSnapshot().running, false);
domComposerState = "none";
api.stopTurnShimmer({ finishActive: false });

api.finishLocalTurn(0, { reason: "test-reset", force: true });
const beforeDraftTurns = api.localUsageExport().turns.length;
const draftMessage = {
  type: "persisted-atom-updated",
  key: "composer-prompt-drafts-v1",
  value: { "local:thread-draft": "只是输入草稿" },
};
assert.equal(api.isComposerDraftPayload(draftMessage), true);
assert.equal(api.inspectLocalPayload(draftMessage, "message"), false);
assert.equal(api.localUsageExport().turns.length, beforeDraftTurns);
assert.equal(api.localUsageExport().currentTurn, null);
api.rememberPendingInput({ type: "input", target: { textContent: "typing" } });
assert.equal(api.localUsageExport().currentTurn, null);
api.rememberPendingInput({ type: "keydown", key: "Enter", isComposing: true, target: {} });
assert.equal(api.localUsageExport().currentTurn, null);
domComposerState = "active-send";
api.rememberPendingInput({ type: "click", target: outsideSubmitClickTarget() });
assert.equal(api.localUsageExport().currentTurn, null);
domComposerState = "none";
api.inspectLocalPayload({ type: "generate_title", model: "gpt-5.3-codex", input: "title me" }, "fetch-body");
assert.equal(api.localUsageExport().currentTurn, null);
assert.equal(api.shouldStartTurnFromRequestPayload({ type: "send_message", model: "gpt-5.3-codex", input: "real turn" }), true);
api.inspectLocalPayload({ type: "send_message", model: "gpt-5.3-codex", input: "real turn" }, "fetch-body");
assert.equal(api.localUsageExport().currentTurn.callCount, 0);
assert.equal(api.liveSnapshot().running, true);
api.inspectLocalPayload({ type: "event_msg", payload: { type: "task_complete" } }, "message");
assert.equal(api.localUsageExport().currentTurn.callCount, 0);
assert.equal(api.liveSnapshot().running, false);
api.finishLocalTurn(0, { reason: "generic-start-complete-reset", force: true });
for (const sessionKey of api.currentLocalTurnSessionKeys()) api.setLocalCurrentTurn(null, sessionKey);

const beforeInterruptedTurns = api.localUsageExport().turns.length;
api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 90, output_tokens: 9, cached_tokens: 30, total_tokens: 99 }, "websocket");
assert.equal(api.localUsageExport().currentTurn.callCount, 1);
const runningTurnId = api.localUsageExport().currentTurn.turnId;
domComposerState = "active-send";
api.rememberPendingInput({ type: "click", target: composerSendClickTarget() });
const continuedRunningExport = api.localUsageExport();
assert.equal(continuedRunningExport.turns.length, beforeInterruptedTurns);
assert.equal(continuedRunningExport.currentTurn.turnId, runningTurnId);
assert.equal(continuedRunningExport.currentTurn.usage.total, 99);
api.rememberLocalUsage({ input_tokens: 11, output_tokens: 2, cached_tokens: 0, total_tokens: 13 }, "websocket");
assert.equal(api.localUsageExport().currentTurn.usage.total, 112);
api.stopTurnShimmer({ finishActive: false });
api.beginLocalTurn({ forceNewIfUsed: true });
const interruptedExport = api.localUsageExport();
assert.equal(interruptedExport.turns.length, beforeInterruptedTurns + 1);
assert.equal(interruptedExport.turns.at(-1).usage.total, 112);
assert.equal(interruptedExport.turns.at(-1).persistReason, "interrupted");
assert.equal(interruptedExport.currentTurn.callCount, 0);
api.rememberLocalUsage({ input_tokens: 12, output_tokens: 2, cached_tokens: 0, total_tokens: 14 }, "websocket");
assert.equal(api.localUsageExport().currentTurn.usage.total, 14);
domComposerState = "none";

api.beginLocalTurn({ forceNewIfUsed: true });
const beforeTokenCountTurns = api.localUsageExport().turns.length;
api.inspectLocalPayload(
  {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2, total_tokens: 12 },
        last_token_usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2, total_tokens: 12 },
      },
    },
  },
  "message",
);
const livePersistedTokenCount = api.localUsageExport();
assert.equal(livePersistedTokenCount.turns.length, beforeTokenCountTurns + 1);
assert.equal(livePersistedTokenCount.turns.at(-1).persistReason, "live");
assert.equal(livePersistedTokenCount.turns.at(-1).usage.total, 12);
assert.equal(livePersistedTokenCount.currentTurn.usage.total, 12);
api.inspectLocalPayload(
  {
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { input_tokens: 30, cached_input_tokens: 14, output_tokens: 5, total_tokens: 35 },
        last_token_usage: { input_tokens: 20, cached_input_tokens: 10, output_tokens: 3, total_tokens: 23 },
      },
    },
  },
  "message",
);
const mergedTokenCountTurn = api.localUsageExport();
assert.equal(mergedTokenCountTurn.turns.length, beforeTokenCountTurns + 1);
assert.equal(mergedTokenCountTurn.turns.at(-1).usage.input, 30);
assert.equal(mergedTokenCountTurn.turns.at(-1).usage.output, 5);
assert.equal(mergedTokenCountTurn.turns.at(-1).usage.cached, 14);
assert.equal(mergedTokenCountTurn.turns.at(-1).usage.total, 35);
assert.equal(mergedTokenCountTurn.currentTurn.usage.total, 35);

const boundary = "----codex-test-boundary";
const multipart = [
  `--${boundary}`,
  `Content-Disposition: form-data; name="file"; filename="avatar.png"`,
  `Content-Type: image/png`,
  ``,
  `PNGDATA`,
  `--${boundary}--`,
  ``,
].join("\r\n");
const multipartBase64 = Buffer.from(multipart, "binary").toString("base64");
assert.equal(api.extractProfilePhotoDataUrl(multipartBase64), "data:image/png;base64,UE5HREFUQQ==");
const longBinary = Array.from({ length: 40000 }, (_, i) => String.fromCharCode(i % 256)).join("");
const longMultipart = [
  `--${boundary}`,
  `Content-Disposition: form-data; name="file"; filename="avatar.jpg"`,
  `Content-Type: image/jpeg`,
  ``,
  longBinary,
  `--${boundary}--`,
  ``,
].join("\r\n");
const longExpected = `data:image/jpeg;base64,${Buffer.from(longBinary, "binary").toString("base64")}`;
assert.equal(api.extractProfilePhotoDataUrl(Buffer.from(longMultipart, "binary").toString("base64")), longExpected);
function legacyChunkedBase64(binary) {
  let out = "";
  for (let i = 0; i < binary.length; i += 0x8000) out += Buffer.from(binary.slice(i, i + 0x8000), "binary").toString("base64");
  return out;
}
api.applyLocalProfilePatch({ profile_picture_url: `data:image/jpeg;base64,${legacyChunkedBase64(longBinary)}` });
assert.equal(api.localProfileResponse().profile.profile_picture_url, longExpected);
api.applyLocalProfilePhotoUpload(multipartBase64);
assert.equal(api.localProfileResponse().profile.profile_picture_url, "data:image/png;base64,UE5HREFUQQ==");
const profileBeforeQuotaFailure = api.localProfileResponse().profile;
const originalProfileStorageSetItem = context.localStorage.setItem;
context.localStorage.setItem = function quotaLimitedProfileStorage(key, value) {
  if (key === "__codexLiveTokenCostProfilePrefsV1") {
    const error = new Error("quota exceeded");
    error.name = "QuotaExceededError";
    throw error;
  }
  return originalProfileStorageSetItem.call(this, key, value);
};
assert.throws(
  () => api.applyLocalProfilePatch({ display_name: "Unsaved Quota Name" }),
  /本地 Profile 存储空间不足/,
);
assert.equal(api.localProfileResponse().profile.display_name, profileBeforeQuotaFailure.display_name);
const quotaMultipart = [
  `--${boundary}`,
  `Content-Disposition: form-data; name="file"; filename="quota.png"`,
  `Content-Type: image/png`,
  ``,
  `QUOTA_IMAGE`,
  `--${boundary}--`,
  ``,
].join("\r\n");
assert.throws(
  () => api.applyLocalProfilePhotoUpload(Buffer.from(quotaMultipart, "binary").toString("base64")),
  /本地 Profile 存储空间不足/,
);
assert.equal(api.localProfileResponse().profile.profile_picture_url, profileBeforeQuotaFailure.profile_picture_url);
context.localStorage.setItem = originalProfileStorageSetItem;
api.applyLocalProfilePatch({ display_name: "Saved After Quota" });
assert.equal(api.localProfileResponse().profile.display_name, "Saved After Quota");
api.applyLocalProfilePatch({ display_name: profileBeforeQuotaFailure.display_name });
const spoofedChatgptPhoto = api.spoofProfileAccountPayload({
  account: { type: "chatgpt", name: "设置", imageUrl: "" },
});
assert.equal(spoofedChatgptPhoto.account.imageUrl, "");
assert.equal(spoofedChatgptPhoto.account.image, undefined);
assert.equal(spoofedChatgptPhoto.account.avatar, undefined);
assert.equal(spoofedChatgptPhoto.account.profileImageUrl, undefined);
assert.equal(spoofedChatgptPhoto.account.profilePictureUrl, undefined);
assert.equal(spoofedChatgptPhoto.account.profilePhotoUrl, undefined);
assert.equal(spoofedChatgptPhoto.account.photoUrl, undefined);
assert.equal(spoofedChatgptPhoto.account.profile_picture_url, undefined);
function fakeSpan(textContent, className, rect = { left: 0, top: 0, width: 80, height: 20 }) {
  return {
    textContent,

    className,
    style: {},
    children: [],
    getBoundingClientRect() {
      return rect;
    },
    querySelector(selector) {
      if (selector === "span,img,svg") return this.children[0] || null;
      if (selector === "img[data-cltc-profile-avatar]") return this.children.find((child) => child.tagName === "IMG") || null;
      return null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}
function fakeNode(tagName, textContent, className, rect = { left: 0, top: 0, width: 80, height: 20 }) {
  return {
    tagName: tagName.toUpperCase(),
    textContent,
    className,
    style: {},
    children: [],
    attributes: new Map(),
    getBoundingClientRect() {
      return rect;
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    querySelector(selector) {
      if (selector === "img[data-cltc-profile-avatar]" || selector === "img") {
        return this.children.find((child) => child.tagName === "IMG") || null;
      }
      if (selector === "span[class*='avatar']") {
        return this.children.find((child) => String(child.className || "").includes("avatar")) || null;
      }
      return null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}
const avatarSpan = fakeSpan("设", "flex size-7 shrink-0 items-center justify-center rounded-full", { left: 16, top: 1000, width: 28, height: 28 });
const sidebarAvatarImage = fakeNode("img", "", "", { left: 16, top: 1000, width: 28, height: 28 });
avatarSpan.children.push(sidebarAvatarImage);
const nameSpan = fakeSpan("custom", "min-w-0 flex-1 truncate text-base leading-5");
const planSpan = fakeSpan("Plus", "truncate text-xs leading-4 text-token-text-tertiary");
const sidebarButton = {
  innerText: "设\ncustom\nPlus",
  textContent: "设\ncustom\nPlus",
  getAttribute(name) {
    return name === "aria-label" ? "打开个人资料菜单" : null;
  },
  getBoundingClientRect() {
    return { left: 8, top: 1006, width: 224, height: 40 };
  },
  querySelector(selector) {
    return selector === "img[data-cltc-profile-avatar]" || selector === "img" ? sidebarAvatarImage : null;
  },
  querySelectorAll(selector) {
    return selector === "span" ? [avatarSpan, nameSpan, planSpan] : [];
  },
};
const sidebarDoc = {
  defaultView: { innerHeight: 1056 },
  querySelector(selector) {
    return selector.includes("打开个人资料菜单") ? sidebarButton : null;
  },
  querySelectorAll(selector) {
    return selector.includes("aside button") ? [sidebarButton] : [];
  },
  createElement(tagName) {
    return {
      tagName: tagName.toUpperCase(),
      style: {},
      setAttribute(name, value) {
        this[name] = value;
      },
    };
  },
};
assert.equal(nameSpan.textContent, "custom");
assert.equal(planSpan.textContent, "Plus");
assert.equal(sidebarAvatarImage.src, undefined);
assert.equal(sidebarAvatarImage.alt, undefined);
assert.equal(sidebarAvatarImage.style.display, undefined);
assert.equal(avatarSpan.textContent, "设");
assert.equal(avatarSpan.style.backgroundImage, undefined);
assert.equal(avatarSpan.children.length, 1);
const officialGear = fakeNode("svg", "", "icon-xs shrink-0");
const officialLabel = fakeSpan("设置", "min-w-0 flex-1 truncate");
const officialChildren = [officialGear, officialLabel];
const officialProfileButton = {
  id: "profile-trigger",
  attributes: new Map([
    ["aria-label", "打开个人资料菜单"],
    ["aria-controls", "profile-menu"],
  ]),
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  },
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  getBoundingClientRect() {
    return { left: 8, top: 1006, width: 184, height: 29 };
  },
  querySelector(selector) {
    if (selector === "[data-cltc-profile-identity-avatar]") {
      return officialChildren.find((child) => child.attributes?.has("data-cltc-profile-identity-avatar")) || null;
    }
    if (selector === "span.min-w-0.flex-1.truncate") return officialLabel;
    if (selector === "svg") return officialGear;
    return null;
  },
  insertBefore(child, reference) {
    const index = officialChildren.indexOf(reference);
    officialChildren.splice(index < 0 ? officialChildren.length : index, 0, child);
    child.remove = () => {
      const childIndex = officialChildren.indexOf(child);
      if (childIndex >= 0) officialChildren.splice(childIndex, 1);
    };
    return child;
  },
  get firstElementChild() {
    return officialChildren[0] || null;
  },
};
const officialMenuLabel = fakeSpan("custom", "flex-1 min-w-0 truncate");
const officialPlanLabel = fakeSpan("Free\ncustom", "min-w-0 text-xs leading-dense text-tertiary whitespace-normal");
const staleMenuAvatar = fakeNode("span", "", "inline-flex items-center justify-center leading-none icon-sm shrink-0");
staleMenuAvatar.setAttribute("data-cltc-profile-menu-identity-avatar", "");
const officialMenuAvatar = fakeNode("span", "", "inline-flex items-center justify-center leading-none icon-sm shrink-0");
const officialMenuAvatarImage = fakeNode("img", "", "icon-sm rounded-full");
officialMenuAvatarImage.src = "official-avatar";
officialMenuAvatar.children.push(officialMenuAvatarImage);
const officialMenuRowChildren = [staleMenuAvatar, officialMenuAvatar, officialMenuLabel];
staleMenuAvatar.remove = () => {
  const index = officialMenuRowChildren.indexOf(staleMenuAvatar);
  if (index >= 0) officialMenuRowChildren.splice(index, 1);
};
const officialMenuRow = {
  className: "flex w-full items-center gap-1.5",
  querySelector(selector) {
    if (selector === "span.flex-1.min-w-0.truncate, span.min-w-0.truncate") return officialMenuLabel;
    if (selector === "span.flex-1.min-w-0.truncate") return officialMenuLabel;
    if (selector === "[data-cltc-profile-menu-identity-avatar]") {
      return officialMenuRowChildren.find((child) => child.attributes?.has("data-cltc-profile-menu-identity-avatar")) || null;
    }
    return null;
  },
  insertBefore(child, reference) {
    const index = officialMenuRowChildren.indexOf(reference);
    officialMenuRowChildren.splice(index < 0 ? officialMenuRowChildren.length : index, 0, child);
    child.remove = () => {
      const childIndex = officialMenuRowChildren.indexOf(child);
      if (childIndex >= 0) officialMenuRowChildren.splice(childIndex, 1);
    };
    return child;
  },
};
const officialAccountMenuListeners = new Map();
const officialAccountMenuItem = {
  className:
    "no-drag text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm cursor-default opacity-50 opacity-100 flex flex-col",
  attributes: new Map([
    ["aria-disabled", "true"],
    ["data-disabled", ""],
    ["tabindex", "-1"],
  ]),
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  },
  hasAttribute(name) {
    return this.attributes.has(name);
  },
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  removeAttribute(name) {
    this.attributes.delete(name);
  },
  addEventListener(type, handler) {
    const handlers = officialAccountMenuListeners.get(type) || [];
    handlers.push(handler);
    officialAccountMenuListeners.set(type, handlers);
  },
  removeEventListener(type, handler) {
    officialAccountMenuListeners.set(
      type,
      (officialAccountMenuListeners.get(type) || []).filter((candidate) => candidate !== handler),
    );
  },
  get firstElementChild() {
    return officialMenuRow;
  },
};
let officialSettingsClicks = 0;
let officialProfileClicks = 0;
let officialProfileVisible = false;
const officialInteractiveMenuClass =
  "no-drag text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] py-[var(--padding-row-y)] text-sm group hover:bg-token-list-hover-background focus:bg-token-list-hover-background cursor-interaction flex flex-col";
const officialSettingsMenuItem = {
  textContent: "设置\nCtrl+,",
  innerText: "设置\nCtrl+,",
  className: officialInteractiveMenuClass,
  click() {
    officialSettingsClicks += 1;
    officialProfileVisible = true;
  },
};
const officialPetMenuItem = {
  textContent: "显示宠物",
  innerText: "显示宠物",
  className: officialInteractiveMenuClass,
  clickCount: 0,
  click() {
    this.clickCount += 1;
  },
};
const officialProfileSettingsButton = {
  textContent: "个人资料",
  innerText: "个人资料",
  getAttribute(name) {
    return name === "aria-label" ? "个人资料" : null;
  },
  getBoundingClientRect() {
    return { left: 100, top: 100, width: 120, height: 32 };
  },
  click() {
    officialProfileClicks += 1;
  },
};
const officialProfileMenu = {
  id: "profile-menu",
  getAttribute(name) {
    if (name === "role") return "menu";
    if (name === "aria-labelledby") return "profile-trigger";
    return null;
  },
  querySelector(selector) {
    if (selector === "span.min-w-0.text-xs.leading-dense.text-tertiary.whitespace-normal") return officialPlanLabel;
    return selector === "[role='menuitem']" ? officialAccountMenuItem : null;
  },
  querySelectorAll(selector) {
    if (selector === "*") return [officialPlanLabel];
    return selector === "[role='menuitem']" ? [officialAccountMenuItem, officialPetMenuItem, officialSettingsMenuItem] : [];
  },
  settingsItem: officialSettingsMenuItem,
};
const officialProfileDoc = {
  querySelector(selector) {
    return selector.includes("打开个人资料菜单") ? officialProfileButton : null;
  },
  getElementById(id) {
    return id === "profile-menu" ? officialProfileMenu : null;
  },
  createElement(tagName) {
    return fakeNode(tagName, "", "");
  },
  querySelectorAll(selector) {
    return selector === "button,a,[role='tab']" && officialProfileVisible ? [officialProfileSettingsButton] : [];
  },
};
const compactAvatar = {
  tagName: "SPAN",
  textContent: "6",
  className: "flex shrink-0 items-center justify-center font-normal text-avatar-foreground select-none rounded-full bg-avatar-yellow size-6 text-xs",
  innerHTML: "6",
  style: {},
  attributes: new Map(),
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  replaceWith(replacement) {
    this.replacement = replacement;
    if (this.button) this.button.replacement = replacement;
    this.textContent = "";
  },
};
const compactProfileButton = {
  replacement: null,
  attributes: new Map([["aria-label", "打开个人资料菜单"]]),
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  },
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  },
  getBoundingClientRect() {
    return { left: 8, top: 1006, width: 36, height: 36 };
  },
  querySelector(selector) {
    if (selector === "span.min-w-0.flex-1.truncate") return null;
    if (selector === "svg") return null;
    if (selector === "span[class*='avatar']") return compactAvatar;
    if (selector === "[data-cltc-profile-identity-avatar]") {
      return this.replacement || (compactAvatar.attributes.has("data-cltc-profile-identity-avatar") ? compactAvatar : null);
    }
    return null;
  },
};
compactAvatar.button = compactProfileButton;
const compactProfileDoc = {
  querySelector(selector) {
    return selector.includes("打开个人资料菜单") ? compactProfileButton : null;
  },
  createElement(tagName) {
    const node = fakeNode(tagName, "", "");
    node.replaceWith = (replacement) => {
      node.replacement = replacement;
      if (compactProfileButton.replacement === node) compactProfileButton.replacement = replacement;
      node.textContent = "";
    };
    node.setAttribute("data-cltc-profile-identity-avatar", "");
    return node;
  },
  querySelectorAll() {
    return [];
  },
};
api.applyLocalProfilePatch({ planType: "plus" });
assert.equal(api.syncSidebarProfileIdentity(officialProfileDoc), true);
assert.equal(officialProfileButton.getAttribute("aria-label"), "打开个人资料菜单");
assert.equal(officialLabel.textContent, api.localProfileResponse().profile.display_name);
assert.equal(officialGear.style.display, "none");
assert.equal(officialChildren[0].tagName, "IMG");
assert.equal(officialChildren[0].src, api.localProfileResponse().profile.profile_picture_url);
assert.equal(officialChildren[0].className, "shrink-0 object-cover rounded-full icon-sm");
// In synthetic (API-key) mode the official footer avatar is data-driven and must not be replaced:
// keeping bG's own wrapper/size is what makes the custom avatar match the official layout.
const officialAvatarImage = fakeNode("img", "", "shrink-0 object-cover rounded-full icon-sm", {
  left: 16,
  top: 1006,
  width: 20,
  height: 20,
});
officialAvatarImage.src = "https://example.com/official-avatar.png";
const dataDrivenLabel = fakeSpan("设置", "min-w-0 flex-1 truncate");
const dataDrivenGear = fakeNode("svg", "", "icon-xs shrink-0");
const dataDrivenChildren = [officialAvatarImage, dataDrivenLabel, dataDrivenGear];
const dataDrivenButton = {
  attributes: new Map([["aria-label", "打开个人资料菜单"]]),
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  },
  getBoundingClientRect() {
    return { left: 8, top: 1006, width: 184, height: 29 };
  },
  querySelector(selector) {
    if (selector === "img:not([data-cltc-profile-identity-avatar])") return officialAvatarImage;
    if (selector === "[data-cltc-profile-identity-avatar]") {
      return dataDrivenChildren.find((child) => child.attributes?.has("data-cltc-profile-identity-avatar")) || null;
    }
    if (selector === "span.min-w-0.flex-1.truncate") return dataDrivenLabel;
    if (selector === "svg") return dataDrivenGear;
    return null;
  },
  insertBefore(child, reference) {
    const index = dataDrivenChildren.indexOf(reference);
    dataDrivenChildren.splice(index < 0 ? dataDrivenChildren.length : index, 0, child);
    child.remove = () => {
      const childIndex = dataDrivenChildren.indexOf(child);
      if (childIndex >= 0) dataDrivenChildren.splice(childIndex, 1);
    };
    return child;
  },
};
const dataDrivenDoc = {
  querySelector(selector) {
    return selector.includes("打开个人资料菜单") ? dataDrivenButton : null;
  },
  querySelectorAll() {
    return [];
  },
  getElementById() {
    return null;
  },
  createElement(tagName) {
    return fakeNode(tagName, "", "");
  },
};
assert.equal(api.syncSidebarProfileIdentity(dataDrivenDoc), true);
assert.equal(dataDrivenButton.querySelector("[data-cltc-profile-identity-avatar]"), null);
assert.equal(officialAvatarImage.src, "https://example.com/official-avatar.png");
assert.equal(dataDrivenLabel.textContent, api.localProfileResponse().profile.display_name);
api.rememberProfileQueryClient(realChatgptQueryClient);
assert.equal(api.profileDataOverrideEnabledFor(), true);
assert.equal(api.syncSidebarProfileIdentity(officialProfileDoc), true);
assert.equal(officialChildren[0].tagName, "IMG");
assert.equal(officialChildren[0].src, api.localProfileResponse().profile.profile_picture_url);
assert.equal(officialLabel.textContent, api.localProfileResponse().profile.display_name);
api.rememberProfileQueryClient(realChatgptQueryClient);
assert.equal(api.profileDataOverrideEnabledFor(), true);
assert.equal(api.syncSidebarProfileIdentity(compactProfileDoc), true);
assert.ok(compactProfileButton.replacement);
assert.equal(compactProfileButton.replacement.tagName, "IMG");
assert.equal(compactProfileButton.replacement.src, api.localProfileResponse().profile.profile_picture_url);
assert.equal(compactProfileButton.replacement.alt, api.localProfileResponse().profile.display_name.slice(0, 1));
api.rememberProfileQueryClient(startupApiKeyQueryClient);
assert.equal(api.profileDataOverrideEnabledFor(), false);
// Switching back to an API-key session must undo the footer override instead of leaving the
// previous ChatGPT pass's copied name/avatar in place. Opt out of the synthetic test path for
// this check so it exercises the production gate.
api.setProfileSyntheticTestEnabled(false);
assert.equal(api.profileSyntheticEnabled(), false);
assert.equal(api.syncSidebarProfileIdentity(officialProfileDoc), false);
assert.equal(officialChildren[0], officialGear);
assert.equal(officialLabel.textContent, "设置");
assert.equal(officialGear.style.display, "");
assert.equal(officialChildren.some((child) => child.attributes?.has("data-cltc-profile-identity-avatar")), false);
assert.equal(api.syncSidebarProfileIdentity(compactProfileDoc), false);
assert.equal(compactProfileButton.replacement, compactAvatar);
assert.equal(compactAvatar.innerHTML, "6");
assert.equal(compactAvatar.attributes.has("data-cltc-profile-identity-avatar"), false);
api.setProfileSyntheticTestEnabled(true);
assert.equal(api.syncSidebarProfileMenuIdentity(officialProfileDoc, officialProfileButton), true);
assert.equal(officialProfileMenu, officialProfileDoc.getElementById("profile-menu"));
assert.equal(officialAccountMenuItem, officialProfileMenu.querySelector("[role='menuitem']"));
assert.equal(officialMenuLabel.textContent, api.localProfileResponse().profile.display_name);
assert.equal(officialPlanLabel.textContent, "Plus");
assert.equal(officialPlanLabel.textContent, "Plus");
assert.equal(officialMenuRowChildren.length, 2);
assert.equal(officialMenuRowChildren[0].tagName, "SPAN");
assert.equal(officialMenuRowChildren[0], officialMenuAvatar);
assert.equal(officialMenuAvatarImage.src, "official-avatar");
assert.equal(officialProfileMenu.settingsItem, officialSettingsMenuItem);
assert.equal(officialProfileMenu.querySelector("[role='menuitem']"), officialAccountMenuItem);
assert.equal(officialAccountMenuItem.getAttribute("aria-disabled"), null);
assert.equal(officialAccountMenuItem.hasAttribute("data-disabled"), false);
assert.equal(officialAccountMenuItem.getAttribute("tabindex"), "0");
assert.equal(officialAccountMenuItem.className, officialInteractiveMenuClass);
assert.equal(officialAccountMenuListeners.get("click")?.length, 1);
assert.equal(officialAccountMenuListeners.get("keydown")?.length, 1);
assert.equal(api.syncSidebarProfileMenuIdentity(officialProfileDoc, officialProfileButton), true);
assert.equal(officialMenuRowChildren.length, 2);
assert.equal(officialMenuRowChildren[0], officialMenuAvatar);
assert.equal(officialMenuAvatarImage.src, "official-avatar");
assert.equal(officialMenuRow.querySelector("[data-cltc-profile-menu-identity-avatar]"), null);
assert.equal(officialAccountMenuListeners.get("click")?.length, 1);
assert.equal(officialAccountMenuListeners.get("keydown")?.length, 1);
let accountClickPrevented = 0;
let accountClickStopped = 0;
officialAccountMenuListeners.get("click")[0]({
  preventDefault() {
    accountClickPrevented += 1;
  },
  stopPropagation() {
    accountClickStopped += 1;
  },
});
assert.equal(accountClickPrevented, 1);
assert.equal(accountClickStopped, 1);
assert.equal(officialSettingsClicks, 1);
assert.equal(officialProfileClicks, 1);
assert.equal(officialPetMenuItem.clickCount, 0);
officialAccountMenuListeners.get("keydown")[0]({
  key: "Enter",
  preventDefault() {},
  stopPropagation() {},
});
assert.equal(officialSettingsClicks, 2);
assert.equal(officialProfileClicks, 2);
assert.equal(typeof api.restoreSidebarProfileMenuIdentity, "function");
api.restoreSidebarProfileMenuIdentity();
assert.equal(officialAccountMenuItem.getAttribute("aria-disabled"), "true");
assert.equal(officialAccountMenuItem.hasAttribute("data-disabled"), true);
assert.equal(officialAccountMenuItem.getAttribute("tabindex"), "-1");
assert.match(officialAccountMenuItem.className, /cursor-default/);
assert.equal(officialAccountMenuListeners.get("click")?.length, 0);
assert.equal(officialAccountMenuListeners.get("keydown")?.length, 0);
assert.equal(officialMenuLabel.textContent, "custom");
assert.equal(officialPlanLabel.textContent, "Free\ncustom");
assert.equal(officialMenuRowChildren.length, 2);
assert.equal(officialMenuRowChildren[0], officialMenuAvatar);
assert.equal(
  code.includes("icon-sm flex shrink-0 items-center justify-center rounded-full bg-token-charts-purple/10 text-[10px] leading-none font-medium text-token-charts-purple"),
  true,
);
assert.equal(code.includes("size-7 shrink-0 rounded-full object-cover"), false);
const profileAvatarFallback = fakeNode(
  "div",
  "天",
  "flex size-32 items-center justify-center rounded-full bg-token-text-tertiary text-[40px] font-normal",
  { left: 900, top: 180, width: 128, height: 128 },
);
const profilePhotoLabel = fakeNode("label", "", "group relative flex size-32 rounded-full", { left: 900, top: 180, width: 128, height: 128 });
profileAvatarFallback.closest = (selector) => (selector === "label" ? profilePhotoLabel : null);
profilePhotoLabel.querySelector = (selector) => (selector.includes("input[type='file']") || selector.includes('input[type="file"]') ? { tagName: "INPUT" } : null);
const profilePhotoDoc = {
  querySelectorAll(selector) {
    return selector.includes("img") || selector.includes("div") || selector.includes("span") ? [profileAvatarFallback] : [];
  },
  createElement(tagName) {
    const node = fakeNode(tagName, "", "", { left: 0, top: 0, width: 0, height: 0 });
    if (String(tagName).toUpperCase() === "IMG") {
      node.complete = true;
      node.naturalWidth = 80;
      node.naturalHeight = 80;
    }
    return node;
  },
};
assert.equal(profileAvatarFallback.children.length, 0);
assert.equal(profileAvatarFallback.textContent, "天");
const settingsSidebarButton = {
  innerText: "Chat 设置",
  textContent: "Chat 设置",
  getAttribute() {
    return null;
  },
  getBoundingClientRect() {
    return { left: 420, top: 250, width: 180, height: 36 };
  },
  querySelectorAll(selector) {
    return selector === "span" ? [fakeSpan("Chat 设置", "truncate text-base leading-5")] : [];
  },
};
assert.equal(settingsSidebarButton.textContent, "Chat 设置");
api.applyLocalProfilePatch({ email: "local@example.com", planType: "business" });
const businessProfile = api.localProfileResponse().profile;
assert.equal(businessProfile.email, "local@example.com");
assert.equal(businessProfile.plan_type, "business");
assert.equal(businessProfile.plan_label, "Business");
const spoofedBusiness = api.spoofProfileAccountPayload({ account: { type: "apiKey", planType: "api" } });
assert.equal(spoofedBusiness.account.email, undefined);
assert.equal(spoofedBusiness.account.planType, "api");
api.applyLocalProfilePatch({ planType: "Team Enterprise", planLabel: "Team Enterprise" });
const customPlanProfile = api.localProfileResponse().profile;
assert.equal(customPlanProfile.plan_type, "Team Enterprise");
assert.equal(customPlanProfile.plan_label, "Team Enterprise");
assert.equal(api.profileAccountInfoQueryData().plan, "Team Enterprise");
api.applyLocalProfilePatch({ requestBody: { profile_asset_pointer: "local-profile-photo" } });
assert.equal(api.localProfileResponse().profile.profile_picture_url, "data:image/png;base64,UE5HREFUQQ==");
api.applyLocalProfilePatch({ requestBody: { profile_picture_url: `data:image/png;base64,${"A".repeat(2_100_000)}` } });
assert.equal(api.localProfileResponse().profile.profile_picture_url.length > 2_000_000, true);
const photoClient = {
  async post() {
    throw new Error("Unauthorized");
  },
};
assert.equal(api.patchProfilePhotoUploadClient(photoClient), true);
const functionPhotoClient = function functionPhotoClient() {};
functionPhotoClient.post = photoClient.post;
assert.equal(api.patchProfilePhotoUploadClient(functionPhotoClient), true);
Promise.resolve()
  .then(() => photoClient.post("/wham/profiles/me/photo", multipartBase64, {}))
  .then((uploadResult) => {
    assert.equal(uploadResult.body.asset_pointer, "local-profile-photo");
    assert.equal(api.localProfileResponse().profile.profile_picture_url, "data:image/png;base64,UE5HREFUQQ==");
  });

api.finishLocalTurn(0, { reason: "official-complete-reset", force: true });
api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 12, output_tokens: 2, total_tokens: 14 }, "websocket");
assert.equal(api.liveSnapshot().running, true);
const officialCompleteTurnId = api.localUsageExport().currentTurn.turnId;
api.inspectLocalPayload({ type: "mcp-notification", method: "turn/completed", params: { threadId: api.currentSessionKey(), turn: { id: officialCompleteTurnId, status: "completed" } } }, "message");
assert.equal(api.localUsageExport().currentTurn, null);
assert.equal(api.liveSnapshot().running, false);
const officialDurationSessionKey = api.currentSessionKey();
api.inspectLocalPayload(
  {
    method: "turn/started",
    params: {
      threadId: officialDurationSessionKey,
      turn: { id: "official-duration-running", status: "inProgress", turnStartedAtMs: FIXED_NOW - 42_000 },
    },
  },
  "message",
);
api.rememberLocalUsage({ input_tokens: 9, output_tokens: 1, total_tokens: 10 }, "websocket");
assert.equal(api.localUsageExport().currentTurn.turnId, "official-duration-running");
assert.equal(api.localUsageExport().currentTurn.durationMs, 42_000);
api.inspectLocalPayload(
  {
    method: "turn/completed",
    params: {
      threadId: officialDurationSessionKey,
      turn: {
        id: "official-duration-running",
        status: "completed",
        turnStartedAtMs: FIXED_NOW - 180_000,
        finalAssistantStartedAtMs: FIXED_NOW,
        durationMs: 180_000,
      },
    },
  },
  "message",
);
const officialDurationLast = api.localUsageExport().last;
assert.equal(officialDurationLast.turnId, "official-duration-running");
assert.equal(officialDurationLast.durationMs, 180_000);
assert.equal(officialDurationLast.durationSec, 180);
assert.equal(api.localProfileResponse().stats.longest_running_turn_sec, 180);

for (const sessionKey of api.currentLocalTurnSessionKeys()) api.setLocalCurrentTurn(null, sessionKey);
const sessionlessUniqueSession = "legacy-sessionless-unique";
const sessionlessUniqueTurn = "legacy-sessionless-unique-turn";
const sessionlessUniqueStartedAt = currentNow - 800000;
api.beginLocalTurn({ sessionKey: sessionlessUniqueSession, turnId: sessionlessUniqueTurn, startedAtMs: sessionlessUniqueStartedAt });
api.rememberLocalUsage(
  { input_tokens: 40, output_tokens: 4, total_tokens: 44 },
  "websocket",
  {},
  { sessionKey: sessionlessUniqueSession, persist: false },
);
assert.equal(
  api.extractSessionIdentity({ type: "task_complete", turn_id: sessionlessUniqueTurn }).turnId,
  sessionlessUniqueTurn,
);
assert.equal(api.sessionlessTaskCompleteSessionKey(sessionlessUniqueTurn), sessionlessUniqueSession);
api.inspectLocalPayload(
  {
    type: "event_msg",
    payload: {
      type: "task_complete",
      turn_id: sessionlessUniqueTurn,
      started_at: new Date(sessionlessUniqueStartedAt).toISOString(),
      completed_at: new Date(sessionlessUniqueStartedAt + 654321).toISOString(),
      duration_ms: 654321,
    },
  },
  "message",
);
const sessionlessUniqueProfile = api.localProfileResponse();
assert.equal(sessionlessUniqueProfile.stats.longest_running_turn_sec, 654);
api.finishLocalTurn(0, { reason: "sessionless-unique-cleanup", force: true, sessionKey: sessionlessUniqueSession });

const multipleSessionlessA = "legacy-sessionless-multiple-a";
const multipleSessionlessB = "legacy-sessionless-multiple-b";
api.beginLocalTurn({ sessionKey: multipleSessionlessA, turnId: "legacy-sessionless-multiple-turn-a", startedAtMs: currentNow - 900000 });
api.rememberLocalUsage(
  { input_tokens: 50, output_tokens: 5, total_tokens: 55 },
  "websocket",
  {},
  { sessionKey: multipleSessionlessA, persist: false },
);
api.beginLocalTurn({ sessionKey: multipleSessionlessB, turnId: "legacy-sessionless-multiple-turn-b", startedAtMs: currentNow - 910000 });
api.rememberLocalUsage(
  { input_tokens: 60, output_tokens: 6, total_tokens: 66 },
  "websocket",
  {},
  { sessionKey: multipleSessionlessB, persist: false },
);
const beforeAmbiguousSessionlessCompletion = api.localProfileResponse().stats.longest_running_turn_sec;
api.inspectLocalPayload(
  {
    type: "task_complete",
    turn_id: "legacy-sessionless-multiple-turn-a",
    started_at: new Date(currentNow - 900000).toISOString(),
    completed_at: new Date(currentNow + 1500000).toISOString(),
    duration_ms: 2400000,
  },
  "message",
);
assert.equal(api.localProfileResponse().stats.longest_running_turn_sec, beforeAmbiguousSessionlessCompletion);
api.finishLocalTurn(0, { reason: "sessionless-multiple-a-cleanup", force: true, sessionKey: multipleSessionlessA });
api.finishLocalTurn(0, { reason: "sessionless-multiple-b-cleanup", force: true, sessionKey: multipleSessionlessB });

const missingTurnIdSession = "legacy-sessionless-no-turn-id";
api.beginLocalTurn({ sessionKey: missingTurnIdSession, turnId: "legacy-sessionless-no-turn-id-turn", startedAtMs: currentNow - 920000 });
api.rememberLocalUsage(
  { input_tokens: 70, output_tokens: 7, total_tokens: 77 },
  "websocket",
  {},
  { sessionKey: missingTurnIdSession, persist: false },
);
const beforeMissingTurnIdCompletion = api.localProfileResponse().stats.longest_running_turn_sec;
api.inspectLocalPayload(
  {
    type: "task_complete",
    started_at: new Date(currentNow - 920000).toISOString(),
    completed_at: new Date(currentNow + 1900000).toISOString(),
    duration_ms: 2820000,
  },
  "message",
);
assert.equal(api.localProfileResponse().stats.longest_running_turn_sec, beforeMissingTurnIdCompletion);
api.finishLocalTurn(0, { reason: "sessionless-no-turn-id-cleanup", force: true, sessionKey: missingTurnIdSession });

const officialDetailsSession = api.currentSessionKey();
api.beginLocalTurn({ sessionKey: officialDetailsSession, turnId: "official-detail-dedupe-turn", startedAtMs: currentNow });
api.rememberLocalUsage(
  { input_tokens: 100, output_tokens: 10, cache_write_input_tokens: 7, reasoning_output_tokens: 1, total_tokens: 110 },
  "websocket",
  {},
  { sessionKey: officialDetailsSession, persist: false },
);
api.rememberLocalUsage(
  { input_tokens: 100, output_tokens: 10, cache_write_input_tokens: 8, reasoning_output_tokens: 2, total_tokens: 110 },
  "websocket",
  {},
  { sessionKey: officialDetailsSession, persist: false },
);
const officialDetailsExport = api.localUsageExport();
assert.equal(officialDetailsExport.currentTurn.callCount, 2);
assert.equal(officialDetailsExport.currentTurn.usage.cacheWriteTokens, 15);
assert.equal(officialDetailsExport.currentTurn.usage.reasoningOutputTokens, 3);
api.finishLocalTurn(0, { reason: "official-detail-dedupe-cleanup", force: true, sessionKey: officialDetailsSession });

const beforeCompleteWithUsageTurns = api.localUsageExport().turns.length;
api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 5, output_tokens: 1, total_tokens: 6 }, "websocket");
const completeWithUsageSessionKey = api.currentSessionKey();
const completeWithUsageTurnId = api.localUsageExport().currentTurn.turnId;
api.inspectLocalPayload(
  {
    type: "mcp-notification",
    method: "turn/completed",
    params: {
      threadId: completeWithUsageSessionKey,
      turn: { id: completeWithUsageTurnId, status: "completed" },
      usage: { input_tokens: 7, output_tokens: 2, total_tokens: 9 },
    },
  },
  "message",
);
const completeWithUsageExport = api.localUsageExport();
assert.equal(completeWithUsageExport.currentTurn, null);
assert.equal(completeWithUsageExport.turns.length, beforeCompleteWithUsageTurns + 1);
assert.equal(completeWithUsageExport.turns.at(-1).usage.input, 12);
assert.equal(completeWithUsageExport.turns.at(-1).usage.output, 3);
assert.equal(completeWithUsageExport.turns.at(-1).usage.total, 15);
assert.equal(completeWithUsageExport.turns.at(-1).persistReason, "complete");
api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 8, output_tokens: 2, total_tokens: 10 }, "websocket");
const noSessionIdleTurnId = api.localUsageExport().currentTurn.turnId;
assert.equal(api.inspectLocalPayload({ method: "thread/status/changed", params: { status: { type: "idle" } } }, "message"), false);
assert.equal(api.localUsageExport().currentTurn.turnId, noSessionIdleTurnId);
assert.equal(api.liveSnapshot().running, true);
api.finishLocalTurn(0, { reason: "no-session-idle-reset", force: true });
assert.equal(api.observeSessionInfo({ threadId: "official-runtime-thread" }), true);
const officialRuntimeSessionKey = "official-runtime-thread";
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? officialRuntimeSessionKey : "";
            },
          }
        : null;
    },
  },
});
assert.equal(api.currentSessionKey(), officialRuntimeSessionKey);
assert.equal(api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: officialRuntimeSessionKey, turn: { id: "official-turn-start" } } }, "message"), true);
assert.equal(api.isOfficialThreadRunning(officialRuntimeSessionKey), true);
assert.equal(api.liveSnapshot().running, true);
assert.equal(api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: officialRuntimeSessionKey, turn: { id: "official-turn-start", status: "interrupted" } } }, "message"), true);
assert.equal(api.isOfficialThreadRunning(officialRuntimeSessionKey), false);
assert.equal(api.liveSnapshot().running, false);
api.importLocalUsageTurns([
  {
    turnId: "official-runtime-local-map-ledger",
    sessionKey: "local:official-runtime-local-map",
    model: "gpt-5.5",
    createdAt: "2026-06-03T12:00:00.000Z",
    usage: { input: 1, output: 1, cached: 0, total: 2 },
  },
]);
assert.equal(api.observeOfficialRuntimePayload({ method: "thread/status/changed", params: { threadId: "official-runtime-local-map", status: { type: "active" } } }, "message"), true);
assert.equal(api.isOfficialThreadRunning("local:official-runtime-local-map"), true);
assert.equal(api.observeOfficialRuntimePayload({ method: "thread/status/changed", params: { threadId: "official-runtime-local-map", status: { type: "idle" } } }, "message"), true);
assert.equal(api.isOfficialThreadRunning("local:official-runtime-local-map"), false);
const backgroundRuntimeSessionKey = "official-background-runtime";
const foregroundRuntimeSessionKey = "official-foreground-runtime";
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? foregroundRuntimeSessionKey : "";
            },
          }
        : null;
    },
  },
});
assert.equal(api.currentSessionKey(), foregroundRuntimeSessionKey);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: backgroundRuntimeSessionKey, turn: { id: "official-background-turn" } } }, "message"),
  true,
);
const beforeBackgroundTokenCountTurns = api.localUsageExport().turns.length;
assert.equal(
  api.inspectLocalPayload(
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 70, cached_input_tokens: 20, output_tokens: 7, total_tokens: 77 },
        },
      },
    },
    "message",
  ),
  true,
);
const backgroundTokenCountExport = api.localUsageExport();
assert.equal(backgroundTokenCountExport.turns.length, beforeBackgroundTokenCountTurns + 1);
assert.equal(backgroundTokenCountExport.turns.at(-1).turnId, "official-background-turn");
assert.equal(backgroundTokenCountExport.turns.at(-1).sessionKey, backgroundRuntimeSessionKey);
assert.equal(backgroundTokenCountExport.turns.at(-1).persistReason, "live");
assert.equal(backgroundTokenCountExport.turns.at(-1).usage.total, 77);
assert.equal(backgroundTokenCountExport.currentTurn, null);
assert.equal(api.isOfficialThreadRunning(backgroundRuntimeSessionKey), true);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: backgroundRuntimeSessionKey, turn: { id: "official-background-turn", status: "completed" } } }, "message"),
  true,
);
assert.equal(api.isOfficialThreadRunning(backgroundRuntimeSessionKey), false);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: "official-ambiguous-bg-1", turn: { id: "official-ambiguous-turn-1" } } }, "message"),
  true,
);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: "official-ambiguous-bg-2", turn: { id: "official-ambiguous-turn-2" } } }, "message"),
  true,
);
const beforeAmbiguousSessionlessTurns = api.localUsageExport().turns.length;
assert.equal(
  api.inspectLocalPayload(
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { input_tokens: 13, cached_input_tokens: 0, output_tokens: 3, total_tokens: 16 },
        },
      },
    },
    "message",
  ),
  false,
);
const ambiguousSessionlessExport = api.localUsageExport();
assert.equal(ambiguousSessionlessExport.turns.length, beforeAmbiguousSessionlessTurns);
assert.equal(ambiguousSessionlessExport.currentTurn, null);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: "official-ambiguous-bg-1", turn: { id: "official-ambiguous-turn-1", status: "completed" } } }, "message"),
  true,
);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: "official-ambiguous-bg-2", turn: { id: "official-ambiguous-turn-2", status: "completed" } } }, "message"),
  true,
);
const officialRuntimeBarePayloadSessionKey = "official-runtime-bare-payload";
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? `local:${officialRuntimeBarePayloadSessionKey}` : "";
            },
          }
        : null;
    },
  },
});
assert.equal(api.currentSessionKey(), `local:${officialRuntimeBarePayloadSessionKey}`);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: officialRuntimeBarePayloadSessionKey, turn: { id: "official-bare-turn" } } }, "message"),
  true,
);
assert.equal(api.isOfficialThreadRunning(`local:${officialRuntimeBarePayloadSessionKey}`), true);
assert.equal(api.liveSnapshot().running, true);
assert.equal(
  api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: officialRuntimeBarePayloadSessionKey, turn: { id: "official-bare-turn", status: "completed" } } }, "message"),
  true,
);
assert.equal(api.isOfficialThreadRunning(`local:${officialRuntimeBarePayloadSessionKey}`), false);
assert.equal(api.liveSnapshot().running, false);
const previousRuntimeDocumentQuerySelector = context.document.querySelector;
const bindingThreadKey = "canonical-runtime-binding-thread";
const bindingRuntimeSessionKey = "runtime-session-without-thread";
const bindingTurnId = "runtime-binding-turn";
context.document.querySelector = (selector) =>
  selector === "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]"
    ? {
        getAttribute(name) {
          return name === "data-app-action-sidebar-thread-id" ? bindingThreadKey : "";
        },
      }
    : null;
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? bindingThreadKey : "";
            },
          }
        : null;
    },
  },
});
assert.equal(api.currentSessionKey(), bindingThreadKey);
api.inspectLocalPayload(
  {
    method: "turn/started",
    threadId: bindingThreadKey,
    sessionId: bindingRuntimeSessionKey,
    turnId: bindingTurnId,
    params: { turn: { id: bindingTurnId } },
  },
  "message",
);
api.inspectLocalPayload(
  {
    type: "event_msg",
    sessionId: bindingRuntimeSessionKey,
    turnId: bindingTurnId,
    payload: {
      type: "token_count",
      info: { last_token_usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 } },
    },
  },
  "message",
);
const boundRuntimeExport = api.localUsageExport();
assert.equal(api.currentSessionKey(), bindingThreadKey);
assert.equal(boundRuntimeExport.currentTurn.sessionKey, bindingThreadKey);
assert.equal(boundRuntimeExport.currentTurn.turnId, bindingTurnId);
assert.equal(boundRuntimeExport.currentTurn.usage.total, 15);
assert.equal(boundRuntimeExport.turns.at(-1).sessionKey, bindingThreadKey);

const newerBindingTurnId = "runtime-binding-turn-new";
api.inspectLocalPayload(
  {
    method: "turn/completed",
    threadId: bindingThreadKey,
    sessionId: bindingRuntimeSessionKey,
    params: { turn: { id: bindingTurnId, status: "completed" } },
  },
  "message",
);
api.inspectLocalPayload(
  {
    method: "turn/started",
    threadId: bindingThreadKey,
    sessionId: bindingRuntimeSessionKey,
    params: { turn: { id: newerBindingTurnId } },
  },
  "message",
);
api.inspectLocalPayload(
  {
    sessionId: bindingRuntimeSessionKey,
    turnId: newerBindingTurnId,
    usage: { input_tokens: 20, output_tokens: 4, total_tokens: 24 },
  },
  "websocket",
);
api.inspectLocalPayload(
  { type: "task_complete", threadId: bindingThreadKey, sessionId: bindingRuntimeSessionKey, turnId: bindingTurnId },
  "message",
);
assert.equal(api.localUsageExport().currentTurn.turnId, newerBindingTurnId);
assert.equal(api.localUsageExport().currentTurn.usage.total, 24);
api.inspectLocalPayload(
  { type: "task_complete", threadId: bindingThreadKey, sessionId: bindingRuntimeSessionKey, turnId: newerBindingTurnId },
  "message",
);
assert.equal(api.localUsageExport().currentTurn, null);

const ambiguousActiveThreadKey = "ambiguous-active-thread";
const ambiguousOtherThreadKey = "ambiguous-other-thread";
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? ambiguousActiveThreadKey : "";
            },
          }
        : null;
    },
  },
});
context.document.querySelector = (selector) =>
  selector === "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]"
    ? {
        getAttribute(name) {
          return name === "data-app-action-sidebar-thread-id" ? ambiguousActiveThreadKey : "";
        },
      }
    : null;
api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: ambiguousActiveThreadKey, turn: { id: "ambiguous-active-turn" } } }, "message");
api.observeOfficialRuntimePayload({ method: "turn/started", params: { threadId: ambiguousOtherThreadKey, turn: { id: "ambiguous-other-turn" } } }, "message");
const beforeAmbiguousActiveUsageTurns = api.localUsageExport().turns.length;
assert.equal(
  api.inspectLocalPayload(
    { type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 7, output_tokens: 1, total_tokens: 8 } } } },
    "message",
  ),
  false,
);
assert.equal(api.localUsageExport().turns.length, beforeAmbiguousActiveUsageTurns);
assert.equal(api.localUsageExport().currentTurn.usage.total, 0);
api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: ambiguousActiveThreadKey, turn: { id: "ambiguous-active-turn", status: "completed" } } }, "message");
api.observeOfficialRuntimePayload({ method: "turn/completed", params: { threadId: ambiguousOtherThreadKey, turn: { id: "ambiguous-other-turn", status: "completed" } } }, "message");
context.document.querySelector = previousRuntimeDocumentQuerySelector;
api.rememberSidebarThreadClick({
  type: "click",
  target: {
    closest(selector) {
      return selector === "[data-app-action-sidebar-thread-id]"
        ? {
            getAttribute(name) {
              return name === "data-app-action-sidebar-thread-id" ? "foreground-runtime-thread" : "";
            },
          }
        : null;
    },
  },
});
api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 20, output_tokens: 2, total_tokens: 22 }, "websocket");
const foregroundTurnId = api.localUsageExport().currentTurn.turnId;
api.inspectLocalPayload({ method: "turn/started", params: { threadId: "background-runtime-thread", turn: { id: "background-runtime-turn" } } }, "message");
api.inspectLocalPayload({ threadId: "background-runtime-thread", usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } }, "websocket");
api.inspectLocalPayload({ method: "turn/completed", params: { threadId: "background-runtime-thread", turn: { id: "background-runtime-turn", status: "completed" } } }, "message");
assert.equal(api.currentSessionKey(), "foreground-runtime-thread");
assert.equal(api.localUsageExport().currentTurn.turnId, foregroundTurnId);
assert.equal(api.localUsageExport().currentTurn.usage.total, 22);
assert.equal(api.isOfficialThreadRunning("background-runtime-thread"), false);
api.finishLocalTurn(0, { reason: "background-official-complete-reset", force: true });
const syntheticThreadKey = "local:client-new-thread:test-alias";
const realThreadKey = "real-thread-after-create";
context.document.querySelector = (selector) =>
  selector === "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]"
    ? {
        getAttribute(name) {
          return name === "data-app-action-sidebar-thread-id" ? syntheticThreadKey : "";
        },
      }
    : null;
assert.equal(api.currentSessionKey(), syntheticThreadKey);
api.beginLocalTurn({ forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 40, output_tokens: 4, total_tokens: 44 }, "websocket");
assert.equal(api.observeSessionInfo({ threadId: realThreadKey }), true);
assert.equal(api.currentSessionKey(), realThreadKey);
assert.equal(api.localUsageExport().currentTurn.sessionKey, realThreadKey);
assert.equal(api.localUsageExport().currentTurn.usage.total, 44);
assert.equal(
  JSON.parse(context.localStorage.getItem("__codexLiveTokenCostLocalUsageV1")).sessionAliases["client-new-thread:test-alias"],
  realThreadKey,
);
api.finishLocalTurn(0, { reason: "client-new-thread-alias-reset", force: true });
api.beginLocalTurn({ sessionKey: realThreadKey, turnId: "recent-live-reload-turn", forceNewIfUsed: true });
api.rememberLocalUsage({ input_tokens: 50, output_tokens: 5, total_tokens: 55 }, "websocket", {}, { sessionKey: realThreadKey });
api.persistLocalCurrentTurn("live", realThreadKey);
api.stopTurnShimmer({ finishActive: false, sessionKey: realThreadKey });
api.setLocalCurrentTurn(null, realThreadKey);
assert.equal(api.localUsageExport().currentTurn, null);
assert.equal(api.restoreRunningCurrentTurnFromLast(realThreadKey), true);
assert.equal(api.localUsageExport().currentTurn.turnId, "recent-live-reload-turn");
assert.equal(api.localUsageExport().currentTurn.usage.total, 55);
api.stopTurnShimmer({ finishActive: false, sessionKey: realThreadKey });
api.setLocalCurrentTurn(null, realThreadKey);
assert.equal(api.restoreRunningCurrentTurnFromLast(realThreadKey, Date.now() + 16 * 60 * 1000), false);
assert.equal(api.restoreRunningCurrentTurnFromLast(realThreadKey), true);
api.finishLocalTurn(0, { reason: "recent-live-reload-reset", force: true, sessionKey: realThreadKey });
assert.deepEqual([1, 2, 3].filter((value) => value > 1), [2, 3]);
assert.equal(/^[a-z0-9._-]+$/.test("UPPER"), true);
Promise.resolve({ account: { type: "apiKey", planType: "api" }, requiresOpenaiAuth: true }).then((value) => {
  assert.equal(value.account.type, "apiKey");
  assert.equal(value.requiresOpenaiAuth, true);
});
Promise.resolve({ plain: true }).then((value) => {
  assert.deepEqual(value, { plain: true });
});

let profileAccountsCheckUpstreamCalls = 0;
const profileClient = {
  async safeGet(url) {
    if (String(url).includes("/wham/accounts/check")) {
      profileAccountsCheckUpstreamCalls += 1;
      return {
        account_ordering: ["api-account"],
        accounts: [{ id: "api-account", type: "apiKey", structure: "personal", planType: "api", name: "custom", email: "api@example.com" }],
      };
    }
    throw new Error("Unauthorized");
  },
  async safePatch() {
    throw new Error("Unauthorized");
  },
};
assert.equal(api.patchProfileRequestClient(profileClient), true);
api.saveProfileUnlockEnabled(true);
const syntheticProfileAuth = api.profileUiAuthContextValue({
  authMethod: "apikey",
  account: { id: "api-account", type: "apiKey", planType: "api" },
});
assert.equal(syntheticProfileAuth.authMethod, "chatgpt");
const localProfileForAuth = api.localProfileResponse();
assert.equal(syntheticProfileAuth.nameAtLogin, localProfileForAuth.profile.display_name);
assert.equal(syntheticProfileAuth.profilePictureUrlAtLogin, localProfileForAuth.profile.profile_picture_url);
assert.equal(syntheticProfileAuth.profileIdentity.profileImageUrl, localProfileForAuth.profile.profile_picture_url);
const spoofedApiAccountCheckWithPhoto = api.spoofProfileAccountsCheckPayload({
  account_ordering: ["api-account"],
  accounts: [{ id: "api-account", type: "apiKey" }],
});
assert.equal(spoofedApiAccountCheckWithPhoto.accounts[0].profile_picture_url, localProfileForAuth.profile.profile_picture_url);
assert.equal(spoofedApiAccountCheckWithPhoto.accounts[0].picture, localProfileForAuth.profile.profile_picture_url);
const profileQueryData = api.profileUsageQueryData();
const localProfile = api.localProfileResponse();
assert.equal(profileQueryData.displayName, localProfile.profile.display_name);
assert.equal(profileQueryData.username, localProfile.profile.username);
assert.equal(profileQueryData.planType, localProfile.profile.plan_type);
assert.equal(profileQueryData.plan_type, localProfile.profile.plan_type);
assert.equal(profileQueryData.planLabel, localProfile.profile.plan_label);
assert.equal(profileQueryData.summary.totalTextTokens, localProfile.stats.lifetime_tokens);
assert.equal(profileQueryData.dailyUsage.at(-1).credits, localProfile.stats.daily_usage_buckets.at(-1).tokens);
const syncedProfileQueries = [];
const profileUsageCacheClient = {
  invalidateQueries() {},
  getQueryCache() {
    return {
      getAll() {
        return [{ queryKey: ["profile", "usage", "disabled"] }];
      },
    };
  },
  setQueryData(queryKey, data) {
    syncedProfileQueries.push({ queryKey, data });
  },
};
assert.equal(api.syncProfileUsageQueryCache(profileUsageCacheClient), true);
const syncedProfileQuery = syncedProfileQueries.find(({ queryKey }) => queryKey.join("/") === "profile/usage/disabled");
const syncedAccountInfoQuery = syncedProfileQueries.find(({ queryKey }) => queryKey.join("/") === "vscode/account-info");
assert.equal(syncedProfileQuery.data.displayName, localProfile.profile.display_name);
assert.equal(syncedAccountInfoQuery.data.accountId, "local-profile-account");
assert.equal(syncedAccountInfoQuery.data.userId, "local-profile-user");
assert.equal(syncedAccountInfoQuery.data.email, localProfile.profile.email);
assert.equal(syncedAccountInfoQuery.data.plan, localProfile.profile.plan_type);
assert.equal(syncedAccountInfoQuery.data.hasChatGptToken, false);
assert.equal(syncedProfileQueries.some(({ queryKey }) => queryKey.join("/") === "accounts/check"), false);
const syncedPageQuery = syncedProfileQueries.find(
  ({ queryKey }) => queryKey.join("/") === "profile/page/local-profile-user/local-profile-account",
);
assert.equal(syncedPageQuery.data.is_self, true);
assert.equal(syncedPageQuery.data.page.visibility.value, "private");
assert.equal(syncedPageQuery.data.profile_details.username, localProfile.profile.username);
const localProfilePage = api.localProfilePageResponse();
assert.equal(localProfilePage.is_self, true);
assert.equal(localProfilePage.can_edit, true);
assert.equal(Array.isArray(localProfilePage.page.pins.items), true);
assert.equal(localProfilePage.profile_details.display_name, localProfile.profile.display_name);
assert.equal(localProfilePage.profile_details.profile_picture_url, localProfile.profile.profile_picture_url);
assert.equal(api.isProfilePageUrl("/wham/profiles/me/page"), true);
assert.equal(api.isProfilePageUrl("/profiles/me/page?preview=1"), true);
assert.equal(api.isProfilePageUrl("/wham/profiles/me"), false);
assert.equal(api.isProfilePageUrl("/wham/profiles/me/photo"), false);
assert.equal(api.isProfilePinOptionsUrl("/wham/profiles/me/page/pin_options"), true);
assert.equal(api.isProfilePinOptionsUrl("/profiles/me/page/pin_options?kind=site"), true);
assert.equal(api.isProfilePinOptionsUrl("/wham/profiles/me/page"), false);
// The request client uses relative endpoints; the transport layer uses "/wham/...". Both must match,
// but sibling endpoints (page, pin options) must not be mistaken for the usage endpoint.
assert.equal(api.isProfileUsageUrl("/wham/profiles/me"), true);
assert.equal(api.isProfileUsageUrl("/profiles/me?fresh=1"), true);
assert.equal(api.isProfileUsageUrl("/profiles/me/page"), false);
assert.equal(api.isProfilePhotoUrl("/profiles/me/photo"), true);
assert.equal(api.isProfilePhotoUrl("/wham/profiles/me/photo"), true);
assert.equal(api.isProfilePhotoUrl("/profiles/me"), false);
assert.equal(api.isProfileAccountsCheckUrl("/accounts/check"), true);
assert.equal(api.isProfileAccountsCheckUrl("/wham/accounts/check?x=1"), true);
assert.equal(api.isProfileAccountsCheckUrl("/accounts/checkout"), false);
const localPinOptions = api.localProfilePinOptionsResponse();
assert.equal(Array.isArray(localPinOptions.items), true);
assert.equal(localPinOptions.items.length, 0);
assert.equal(localPinOptions.next_cursor, null);
const localPagePatch = api.localProfilePagePatchResponse({ requestBody: { display_settings: { theme: "dark" } } });
assert.equal(localPagePatch.display_settings.theme, "dark");
assert.equal(localPagePatch.page_version, localProfilePage.page_version + 1);
const profileLifecycleTest = Promise.resolve()
  .then(async () => {
    // —— 上游价格同步：native 通道（command/exec curl → fs/readFile base64 → fs/remove）——
    const priceTestNow = currentNow;
    const priceTempPath = "C:\\Users\\tester\\user_scripts\\market-codex-live-token-cost.js.prices.json";
    const priceCachePath = "C:\\Users\\tester\\user_scripts\\market-codex-live-token-cost.js.prices.cache.json";
    const priceCommandCalls = [];
    const priceReadCalls = [];
    const priceRemoveCalls = [];
    const priceWriteCalls = [];
    const priceHostState = { upstream: upstreamPriceFixture, cacheFile: null, failCommand: false };
    const priceHostClient = {
      hostId: "local",
      sendRequest(route, payload) {
        if (route === "command/exec") {
          priceCommandCalls.push(payload.command);
          if (priceHostState.failCommand) {
            return Promise.resolve({ exitCode: 22, stdout: "", stderr: "curl: (22) The requested URL returned error: 404" });
          }
          return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
        }
        if (route === "fs/readFile") {
          priceReadCalls.push(payload.path);
          if (String(payload.path).endsWith(".prices.cache.json")) {
            if (!priceHostState.cacheFile) return Promise.resolve({});
            return Promise.resolve({ dataBase64: Buffer.from(JSON.stringify(priceHostState.cacheFile), "utf8").toString("base64") });
          }
          return Promise.resolve({ dataBase64: Buffer.from(JSON.stringify(priceHostState.upstream), "utf8").toString("base64") });
        }
        if (route === "fs/writeFile") {
          priceWriteCalls.push({ path: payload.path, dataBase64: payload.dataBase64 });
          return Promise.resolve({});
        }
        if (route === "fs/remove") {
          priceRemoveCalls.push(payload.path);
          return Promise.resolve({});
        }
        return Promise.resolve({});
      },
    };
    const savedCodexPlusForPrices = context.codexPlus;
    // 共享 localStorage stub 故意不实现 removeItem（profile 账本指针回退依赖其缺失）；
    // 价格缓存清理只在本用例内补上真实浏览器行为。
    context.localStorage.removeItem = (key) => {
      storage.delete(String(key));
    };
    context.__codexPlusNativeHostClients = new Map([["local", { ref: { deref: () => priceHostClient } }]]);
    context.codexPlus = {
      apiVersion: 1,
      script: { key: "user:market-codex-live-token-cost.js" },
      call(route) {
        if (route === "/user-scripts/list") {
          return Promise.resolve({
            user_dir: "C:\\Users\\tester\\user_scripts",
            scripts: [{ key: "user:market-codex-live-token-cost.js", name: "market-codex-live-token-cost.js" }],
          });
        }
        return Promise.resolve({});
      },
    };
    storage.set("__codexLiveTokenCostRemotePricesV1", JSON.stringify({ version: 1, fetchedAt: 1, prices: { "gpt-legacy": { input: 1, output: 1 } } }));
    const syncedUpstream = {
      ...upstreamPriceFixture,
      "gpt-5.6-sol": { ...upstreamPriceFixture["gpt-5.6-sol"], input_cost_per_token: 0.0000045, output_cost_per_token: 0.000021 },
      "gpt-9-nebula": {
        litellm_provider: "openai",
        mode: "responses",
        input_cost_per_token: 0.00001,
        output_cost_per_token: 0.00005,
      },
    };

    // 0) localStorage 无缓存、本地文件缓存存在、上游不可达：沿用文件缓存，定价不丢。
    priceHostState.cacheFile = {
      version: 2,
      fetchedAt: Date.parse("2026-07-02T00:00:00.000Z"),
      prices: { ...upstreamSnapshotFixture.prices, "gpt-5.6-sol": { ...upstreamSnapshotFixture.prices["gpt-5.6-sol"], input: 4.2 } },
      meta: upstreamSnapshotFixture.meta,
    };
    storage.delete("__codexLiveTokenCostRemotePricesV2");
    priceHostState.failCommand = true;
    assert.equal(await api.refreshDefaultPrices(), false);
    assert.equal(api.priceFor("gpt-5.6-sol").input, 4.2);
    assert.equal(api.priceSyncStatus().tone, "warn");
    assert.equal(api.priceSyncStatus().text.includes("沿用"), true);
    priceHostState.failCommand = false;
    await api.priceCacheIdle();
    priceCommandCalls.length = 0;
    priceReadCalls.length = 0;
    priceRemoveCalls.length = 0;
    priceWriteCalls.length = 0;

    priceHostState.upstream = syncedUpstream;
    assert.equal(await api.refreshDefaultPrices(), true);
    assert.equal(priceCommandCalls.length, 1);
    const syncCommand = priceCommandCalls[0];
    assert.equal(syncCommand[0], "curl");
    assert.equal(syncCommand.includes("--fail"), true);
    // command/exec 对无输出命令约 10s 判超时；必须让 curl 协商 gzip 压缩传输。
    assert.equal(syncCommand.includes("--compressed"), true);
    assert.equal(syncCommand[syncCommand.indexOf("-o") + 1], priceTempPath);
    assert.equal(
      syncCommand.at(-1).startsWith("https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json?cltc_price="),
      true,
    );
    assert.deepEqual(priceReadCalls, [priceTempPath]);
    assert.deepEqual(priceRemoveCalls, [priceTempPath]);
    assert.equal(priceWriteCalls.length, 1);
    assert.equal(priceWriteCalls[0].path, priceCachePath);
    const writtenCache = JSON.parse(Buffer.from(priceWriteCalls[0].dataBase64, "base64").toString("utf8"));
    assert.equal(writtenCache.version, 3);
    assert.equal(writtenCache.prices["gpt-5.6-sol"].input, 4.5);
    assert.equal(writtenCache.meta["gpt-9-nebula"].mode, "responses");
    // 同步落盘的文件同时镜像自定义价格，供离线/清空 localStorage 时恢复。
    assert.equal(writtenCache.overrides["zero-price-model"].input, 0);
    // 模型名可能是中文：缓存写入必须按 UTF-8 编码，不能直接 btoa。
    const overridesBeforeUnicode = storage.get("__codexLiveTokenCostPriceOverridesV1");
    assert.equal(
      context.__codexLiveTokenCost.setModelPrice("模型-零价", { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 }),
      true,
    );
    await api.priceCacheFlush();
    const unicodeCache = JSON.parse(Buffer.from(priceWriteCalls.at(-1).dataBase64, "base64").toString("utf8"));
    assert.equal(unicodeCache.overrides["模型-零价"].output, 0);
    storage.set("__codexLiveTokenCostPriceOverridesV1", overridesBeforeUnicode);
    await api.priceCacheFlush();
    assert.equal(api.priceFor("gpt-5.6-sol").input, 4.5);
    assert.equal(api.priceFor("gpt-9-nebula").output, 50);
    // 价格已收录但不在官方模型列表：默认不展示，显式传入/使用过才出现。
    assert.equal(api.priceListModels().includes("gpt-9-nebula"), false);
    assert.equal(api.priceListModels("gpt-9-nebula").includes("gpt-9-nebula"), true);
    assert.equal(api.priceListModels().includes("gpt-5.6-sol"), true);
    assert.equal(api.priceListModels().includes("gpt-5.9-alias"), false);
    const cachedSnapshot = JSON.parse(storage.get("__codexLiveTokenCostRemotePricesV2"));
    assert.equal(cachedSnapshot.version, 2);
    assert.equal(cachedSnapshot.prices["gpt-5.6-sol"].input, 4.5);
    assert.equal(cachedSnapshot.meta["gpt-9-nebula"].mode, "responses");
    assert.equal(storage.has("__codexLiveTokenCostRemotePricesV1"), false);
    assert.equal(api.priceSyncStatus().tone, "ok");

    // 10 分钟节流窗口内的再次刷新不触发下载，也不覆盖现有价格。
    priceHostState.upstream = upstreamPriceFixture;
    assert.equal(await api.refreshDefaultPrices(), true);
    assert.equal(priceCommandCalls.length, 1);
    assert.equal(api.priceFor("gpt-5.6-sol").input, 4.5);
    assert.equal(api.priceFor("gpt-9-nebula").output, 50);

    // 窗口外的失败：保留现有价格与缓存，状态转为可重试的警告。
    currentNow = FIXED_NOW + 11 * 60 * 1000;
    priceHostState.failCommand = true;
    assert.equal(await api.refreshDefaultPrices(), false);
    assert.equal(api.priceFor("gpt-5.6-sol").input, 4.5);
    assert.deepEqual(JSON.parse(storage.get("__codexLiveTokenCostRemotePricesV2")), cachedSnapshot);
    assert.equal(api.priceSyncStatus().tone, "warn");
    assert.equal(api.priceSyncStatus().retry, true);
    assert.equal(api.priceSyncStatus().text.includes("同步失败"), true);

    // 窗口外返回无效上游表（条目数不足）：同样拒绝，价格不变。
    priceHostState.failCommand = false;
    priceHostState.upstream = {
      "gpt-only-one": { litellm_provider: "openai", mode: "chat", input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 },
    };
    assert.equal(await api.refreshDefaultPrices(), false);
    assert.equal(api.priceFor("gpt-5.6-sol").input, 4.5);
    assert.equal(api.priceSyncStatus().tone, "warn");

    // 恢复默认：清空自定义价并重新同步上游。
    priceHostState.upstream = syncedUpstream;
    assert.equal(context.__codexLiveTokenCost.setModelPrice("gpt-5.6-sol", { input: 99, output: 99 }), true);
    assert.equal(context.__codexLiveTokenCost.setModelPrice("gpt-9-nebula", { input: 99, output: 99 }), true);
    assert.equal(await api.restoreDefaultPrices(), true);
    assert.equal(api.priceFor("gpt-5.6-sol").input, 4.5);
    assert.equal(api.priceFor("gpt-9-nebula").output, 50);
    const restoredOverrides = JSON.parse(storage.get("__codexLiveTokenCostPriceOverridesV1"));
    assert.equal(Object.hasOwn(restoredOverrides, "gpt-5.6-sol"), false);
    assert.equal(Object.hasOwn(restoredOverrides, "gpt-9-nebula"), false);

    // 文件缓存可在 localStorage 丢失时恢复自定义价格；已有 localStorage 时以它为准。
    await api.priceCacheIdle();
    const overridesBeforeFileRestore = storage.get("__codexLiveTokenCostPriceOverridesV1");
    storage.delete("__codexLiveTokenCostPriceOverridesV1");
    assert.equal(
      api.priceCacheRestoreOverrides({ overrides: { "cached-custom-model": { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 } } }),
      true,
    );
    assert.equal(api.priceFor("cached-custom-model").input, 0);
    assert.equal(api.priceCacheRestoreOverrides({ overrides: { "cached-custom-model": { input: 9, output: 9 } } }), false);
    assert.equal(api.priceFor("cached-custom-model").input, 0);
    if (overridesBeforeFileRestore == null) storage.delete("__codexLiveTokenCostPriceOverridesV1");
    else storage.set("__codexLiveTokenCostPriceOverridesV1", overridesBeforeFileRestore);

    await api.priceCacheIdle();
    currentNow = priceTestNow;
    context.codexPlus = savedCodexPlusForPrices;
    delete context.localStorage.removeItem;
    delete context.__codexPlusNativeHostClients;

    const observedProfileQueryRows = [];
    const observedProfileCacheListeners = [];
    const observedProfileCacheWrites = [];
    const observedProfileCacheClient = {
      invalidateQueries() {},
      getQueryCache() {
        return {
          getAll() {
            return observedProfileQueryRows;
          },
          subscribe(listener) {
            observedProfileCacheListeners.push(listener);
            return () => {
              const index = observedProfileCacheListeners.indexOf(listener);
              if (index >= 0) observedProfileCacheListeners.splice(index, 1);
            };
          },
        };
      },
      setQueryData(queryKey, data) {
        observedProfileCacheWrites.push({ queryKey, data });
      },
    };
    assert.equal(api.syncProfileUsageQueryCache(observedProfileCacheClient), true);
    assert.equal(observedProfileCacheListeners.length, 1);
    const writesBeforeProfileQueryAdded = observedProfileCacheWrites.length;
    observedProfileQueryRows.push({ queryKey: ["profile", "usage", "disabled"] });
    observedProfileCacheListeners[0]({ type: "added", query: { queryKey: ["profile", "usage", "disabled"] } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(observedProfileCacheWrites.length > writesBeforeProfileQueryAdded, true);
    const writesBeforeProfileQueryUpdated = observedProfileCacheWrites.length;
    observedProfileCacheListeners[0]({
      type: "updated",
      query: { queryKey: ["profile", "usage", "disabled"] },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(observedProfileCacheWrites.length, writesBeforeProfileQueryUpdated);

    const lateRealAccountRows = [
      {
        queryKey: ["profile", "usage", "disabled"],
        state: { data: realChatgptProfileData },
      },
    ];
    const lateRealAccountListeners = [];
    const lateRealAccountWrites = [];
    const lateRealAccountClient = {
      invalidateQueries() {},
      getQueryCache() {
        return {
          getAll() {
            return lateRealAccountRows;
          },
          subscribe(listener) {
            lateRealAccountListeners.push(listener);
            return () => {
              const index = lateRealAccountListeners.indexOf(listener);
              if (index >= 0) lateRealAccountListeners.splice(index, 1);
            };
          },
        };
      },
      setQueryData(queryKey, data) {
        lateRealAccountWrites.push({ queryKey, data });
      },
    };
    assert.equal(api.syncProfileUsageQueryCache(lateRealAccountClient), true);
    assert.equal(lateRealAccountListeners.length, 1);
    const lateRealAccountWritesBeforeAuth = lateRealAccountWrites.length;
    assert.ok(lateRealAccountWritesBeforeAuth > 0);
    lateRealAccountRows.unshift({
      queryKey: ["accounts", "check"],
      state: {
        data: {
          account_ordering: ["real-chatgpt-account"],
          accounts: [{ id: "real-chatgpt-account", account_user_id: "user-real", structure: "personal", plan_type: "free" }],
        },
      },
    });
    lateRealAccountListeners[0]({
      type: "updated",
      query: { queryKey: ["accounts", "check"] },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(lateRealAccountWrites.length > lateRealAccountWritesBeforeAuth, true);
    const lateRealAccountWrite = lateRealAccountWrites
      .filter(({ queryKey }) => queryKey.join("/") === "profile/usage/disabled")
      .at(-1);
    assert.ok(lateRealAccountWrite);
    assert.equal(lateRealAccountWrite.data.displayName, "Tian");
    assert.equal(lateRealAccountWrite.data.summary.totalTextTokens, api.localProfileResponse().stats.lifetime_tokens);
    api.rememberProfileQueryClient(startupApiKeyQueryClient);
    assert.equal(api.profileSyntheticEnabled(), true);
    const originalScripts = context.document.scripts;
    const originalQuerySelectorAll = context.document.querySelectorAll;
    const originalPerformance = context.performance;
    const originalFetch = context.fetch;
    try {
      context.document.scripts = [{ src: "app://-/assets/index-test.js" }];
      context.document.querySelectorAll = (selector) =>
        selector === "link[href]" ? [{ href: "app://-/assets/app-initial-test.js" }] : [];
      context.performance = { getEntriesByType: () => [] };
      context.fetch = async (url) => ({
        ok: true,
        async text() {
          return String(url).includes("app-initial-test") ? 'const deps = ["./request-test.js"];' : "";
        },
      });
      assert.equal(await api.codexAppAssetUrl("request-"), "app://-/assets/request-test.js");
      context.document.scripts = [{ src: "app://-/assets/index-test.js" }];
      context.document.querySelectorAll = () => [];
      context.performance = { getEntriesByType: () => [] };
      context.fetch = async () => ({ ok: true, async text() { return 'const deps = ["./app-initial-test.js"];'; } });
      assert.equal(await api.codexAppAssetUrl("request-"), "app://-/assets/app-initial-test.js");
      context.document.scripts = [{ src: "app://-/assets/request-legacy.js" }];
      context.fetch = async () => { throw new Error("fetch should not run for direct asset"); };
      assert.equal(await api.codexAppAssetUrl("request-"), "app://-/assets/request-legacy.js");
      const cachedAssetFetches = [];
      context.document.scripts = [{ src: "app://-/assets/app-initial-cache.js" }];
      context.document.querySelectorAll = () => [];
      context.performance = { getEntriesByType: () => [] };
      context.fetch = async (url) => {
        cachedAssetFetches.push(String(url));
        return { ok: true, async text() { return 'const deps = ["./request-cache.js"];'; } };
      };
      assert.equal(await api.codexAppAssetUrl("request-"), "app://-/assets/request-cache.js");
      const cachedAssetFetchesAfterFirst = cachedAssetFetches.length;
      assert.ok(cachedAssetFetchesAfterFirst > 0);
      assert.equal(await api.codexAppAssetUrl("request-"), "app://-/assets/request-cache.js");
      assert.equal(cachedAssetFetches.length, cachedAssetFetchesAfterFirst, "asset URL results must be reused while the loaded asset set is unchanged");
    } finally {
      if (originalScripts === undefined) delete context.document.scripts;
      else context.document.scripts = originalScripts;
      context.document.querySelectorAll = originalQuerySelectorAll;
      if (originalPerformance === undefined) delete context.performance;
      else context.performance = originalPerformance;
      context.fetch = originalFetch;
    }
  })
  .then(async () => {
    api.installProfileUiReadinessCoordinator(["ProfileFooterHarness"], delayedProfileDocument);
    assert.equal(api.profileSyntheticAuth(), true);
    const patchedAccountsCheck = await profileClient.safeGet("/wham/accounts/check");
    const expectedIdentity = api.localProfileResponse().profile;
    assert.equal(patchedAccountsCheck.accounts[0].id, "api-account");
    assert.equal(patchedAccountsCheck.accounts[0].type, "apiKey");
    assert.equal(patchedAccountsCheck.accounts[0].planType, "api");
    assert.equal(patchedAccountsCheck.accounts[0].name, "custom");
    assert.equal(patchedAccountsCheck.accounts[0].email, "api@example.com");
    assert.equal(profileAccountsCheckUpstreamCalls, 1);
    api.profileUiAuthContextValue({ authMethod: "chatgpt", accountId: "real-account" });
    const passthroughAccountsCheck = await profileClient.safeGet("/wham/accounts/check");
    assert.equal(passthroughAccountsCheck.accounts[0].id, "api-account");
    assert.equal(passthroughAccountsCheck.accounts[0].type, "apiKey");
    assert.equal(passthroughAccountsCheck.accounts[0].planType, "api");
    assert.equal(profileAccountsCheckUpstreamCalls, 2);
    // API-key sessions get 401 from the ChatGPT-only accounts endpoint. Synthetic mode must still
    // render the dropdown's account row (name + avatar) instead of surfacing the failure.
    const failingAccountsClient = {
      async safeGet() {
        throw new Error("Unauthorized");
      },
    };
    assert.equal(api.patchProfileRequestClient(failingAccountsClient), true);
    const fallbackAccountsCheck = await failingAccountsClient.safeGet("/accounts/check");
    assert.equal(fallbackAccountsCheck.accounts.length, 1);
    assert.equal(fallbackAccountsCheck.accounts[0].id, "local-profile-account");
    assert.equal(fallbackAccountsCheck.accounts[0].type, "chatgpt");
    assert.equal(fallbackAccountsCheck.accounts[0].name, expectedIdentity.display_name);
    assert.equal(fallbackAccountsCheck.accounts[0].profile_picture_url, expectedIdentity.profile_picture_url);
    assert.equal(fallbackAccountsCheck.account_ordering[0], "local-profile-account");
    api.installProfileUiReadinessCoordinator([], delayedProfileDocument);
    return profileClient.safeGet("/wham/profiles/me");
  })
  .then((patchedGet) => {
    assert.equal(patchedGet.stats.unique_skills_used, 2);
    assert.equal(patchedGet.stats.total_skills_used, 2);
    assert.equal(
      JSON.stringify(patchedGet.stats.top_plugins),
      JSON.stringify([{ type: "plugin", plugin_id: "plugin-1", plugin_name: "GitHub", usage_count: 1 }]),
    );
    assert.equal(patchedGet.stats.most_used_plugin_usage_count, 1);
    assert.equal(patchedGet.profile.display_name, "Tian Envelope");
    return profileClient.safeGet("/wham/profiles/me");
  })
  .then((refreshedGet) => {
    assert.equal(refreshedGet.stats.unique_skills_used, 2);
    assert.equal(refreshedGet.stats.total_skills_used, 2);
    assert.equal(refreshedGet.stats.most_used_plugin_usage_count, 1);
    return profileClient.safePatch("/wham/profiles/me", { requestBody: { display_name: "Tian Patched", username: "Tian_004" } });
  })
  .then((patchedPatch) => {
    assert.equal(patchedPatch.profile.display_name, "Tian Patched");
    assert.equal(api.localProfileResponse().profile.username, "Tian_004");
    const messageListenersBeforeLocalCapture = (windowListeners.get("message") || []).length;
    api.installLocalMessageCapture();
    const localMessageHandler = api.localMessageHandler();
    assert.equal(typeof localMessageHandler, "function");
    assert.equal((windowListeners.get("message") || []).length, messageListenersBeforeLocalCapture + 1);
assert.equal(context.__codexLiveTokenCostMessageCapture, "0.7.10-beta1");
    context.document.getElementById = () => null;
    context.__codexLiveTokenCost.destroy();
    assert.equal((windowListeners.get("message") || []).includes(localMessageHandler), false);
    assert.equal(context.__codexLiveTokenCostMessageCapture, undefined);
  })
  .then(async () => {
    const firstProfileRefresh = api.refreshProfileData({ force: true });
    const secondProfileRefresh = api.refreshProfileData({ force: true });
    assert.strictEqual(firstProfileRefresh, secondProfileRefresh);
    const profileRefreshResult = await firstProfileRefresh;
    assert.equal(profileRefreshResult.ok, true);
    assert.equal(api.localProfileResponse().stats.unique_skills_used, 2);
    assert.equal(api.localProfileResponse().stats.total_skills_used, 2);
  });

profileLifecycleTest.then(async () => {
  const originalProfileImage = context.Image;
  const originalCreateElement = context.document.createElement;
  const profileCanvas = {
    width: 0,
    height: 0,
    getContext() {
      return { drawImage() {} };
    },
    toDataURL(type) {
      return `data:${type};base64,${"B".repeat(8000)}`;
    },
  };
  context.Image = class ProfileImageTestDouble {
    constructor() {
      this.naturalWidth = 1024;
      this.naturalHeight = 512;
    }

    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  };
  context.document.createElement = (tagName) => (tagName === "canvas" ? profileCanvas : null);
  const optimizedProfileImage = await api.optimizeProfileImageDataUrl(`data:image/png;base64,${"A".repeat(300000)}`);
  assert.equal(optimizedProfileImage.startsWith("data:image/webp;base64,"), true);
  assert.equal(optimizedProfileImage.length < 220000, true);
  assert.equal(profileCanvas.width, 512);
  assert.equal(profileCanvas.height, 256);
  if (originalProfileImage === undefined) delete context.Image;
  else context.Image = originalProfileImage;
  if (originalCreateElement === undefined) delete context.document.createElement;
  else context.document.createElement = originalCreateElement;

  api.importLocalUsageTurns([
    {
      turnId: "script:2026-07-05:local-larger",
      source: "codex-live-token-cost",
      model: "gpt-5.5",
      createdAt: "2026-07-05T12:00:00.000Z",
      callCount: 6,
      usage: { input: 40000, output: 10000, cached: 20000, total: 50000 },
    },
  ]);
  api.importLocalUsageTurns(
    [
      {
        turnId: "import:2026-07-04:baseline",
        source: "local-import",
        importSource: "local-import",
        model: "gpt-5.5",
        createdAt: "2026-07-04T12:00:00.000Z",
        callCount: 5,
        usage: { input: 40000, output: 7092, cached: 20000, total: 47092 },
      },
      {
        turnId: "import:2026-07-05:smaller",
        source: "local-import",
        importSource: "local-import",
        model: "gpt-5.5",
        createdAt: "2026-07-05T12:00:00.000Z",
        callCount: 4,
        usage: { input: 30000, output: 8000, cached: 10000, total: 38000 },
      },
    ],
  );
  const localLargerDay = api.localDailyUsage().get("2026-07-05");
  assert.equal(localLargerDay.tokens, 88000);
  assert.equal(localLargerDay.requests, 10);

  currentNow = Date.parse("2026-07-20T12:00:00.000Z");
  const multiCallSession = "profile-ledger-multi-call-thread";
  api.beginLocalTurn({ sessionKey: multiCallSession, turnId: "profile-ledger-multi-call-turn", startedAtMs: currentNow - 180000 });
  const multiCallFirst = { input_tokens: 100, output_tokens: 10, total_tokens: 110 };
  const multiCallSecond = { input_tokens: 200, output_tokens: 20, total_tokens: 220 };
  assert.equal(api.rememberLocalUsage(multiCallFirst, "websocket", {}, { sessionKey: multiCallSession, persist: true }), true);
  assert.equal(api.rememberLocalUsage(multiCallSecond, "websocket", {}, { sessionKey: multiCallSession, persist: true }), true);
  const multiCallProfile = api.localProfileResponse();
  const multiCallDay = multiCallProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-20");
  assert.equal(multiCallDay.tokens, 330);
  assert.equal(multiCallDay.requests, 2);
  assert.equal(api.rememberLocalUsage(multiCallFirst, "websocket", {}, { sessionKey: multiCallSession, persist: true }), false);
  assert.equal(api.localProfileResponse().stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-20").tokens, 330);
  api.finishLocalTurn(0, { reason: "profile-ledger-multi-call-complete", force: true, sessionKey: multiCallSession });

  const invocationSession = "profile-ledger-invocation-thread";
  api.beginLocalTurn({ sessionKey: invocationSession, turnId: "profile-ledger-invocation-turn", startedAtMs: currentNow - 60000 });
  const invocationBase = {
    threadId: invocationSession,
    turnId: "profile-ledger-invocation-turn",
    tool_invocations: [
      {
        type: "skill",
        skill_id: "skill-twice",
        skill_name: "Twice",
        invocation_id: "invocation-a",
        command: "RAW_COMMAND_SHOULD_NOT_PERSIST",
        api_key: "RAW_API_KEY_SHOULD_NOT_PERSIST",
      },
    ],
  };
  api.inspectLocalPayload(invocationBase, "websocket");
  api.inspectLocalPayload({ ...invocationBase }, "websocket");
  api.inspectLocalPayload(
    {
      ...invocationBase,
      tool_invocations: [{ ...invocationBase.tool_invocations[0], invocation_id: "invocation-b" }],
    },
    "websocket",
  );
  const invocationBefore = api.localProfileResponse();
  api.rememberLocalUsage(
    { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    "websocket",
    {},
    { sessionKey: invocationSession, persist: true },
  );
  api.finishLocalTurn(0, { reason: "profile-ledger-invocation-complete", force: true, sessionKey: invocationSession });
  const invocationAfter = api.localProfileResponse();
  const twiceSkill = invocationAfter.stats.top_invocations.find((item) => item.skill_id === "skill-twice");
  assert.ok(twiceSkill);
  assert.equal(twiceSkill.usage_count, 2);
  assert.equal(invocationAfter.stats.total_skills_used - invocationBefore.stats.total_skills_used, 2);

  const noIdInvocation = {
    type: "skill",
    skill_id: "skill-no-id",
    skill_name: "No ID",
  };
  const noIdInvocationEvent = {
    threadId: invocationSession,
    turnId: "profile-ledger-invocation-turn",
    requestId: "invocation-event-1",
    tool_invocations: [noIdInvocation],
  };
  api.beginLocalTurn({ sessionKey: invocationSession, turnId: "profile-ledger-invocation-turn", startedAtMs: currentNow - 30000 });
  api.inspectLocalPayload(noIdInvocationEvent, "websocket");
  api.inspectLocalPayload({ ...noIdInvocationEvent, tool_invocations: [{ ...noIdInvocation }] }, "websocket");
  api.inspectLocalPayload(
    {
      ...noIdInvocationEvent,
      requestId: "invocation-event-2",
      tool_invocations: [{ ...noIdInvocation }, { ...noIdInvocation }],
    },
    "websocket",
  );
  const noIdSkill = api.localProfileResponse().stats.top_invocations.find((item) => item.skill_id === "skill-no-id");
  assert.ok(noIdSkill);
  assert.equal(noIdSkill.usage_count, 3);

  const messageInvocationSession = "profile-ledger-message-invocation-thread";
  const messageInvocationTurn = "profile-ledger-message-invocation-turn";
  api.beginLocalTurn({ sessionKey: messageInvocationSession, turnId: messageInvocationTurn, startedAtMs: currentNow - 30000 });
  api.inspectLocalPayload(
    {
      threadId: messageInvocationSession,
      turnId: messageInvocationTurn,
      type: "mcp-notification",
      method: "item/completed",
      params: {
        threadId: messageInvocationSession,
        turnId: messageInvocationTurn,
        item: { type: "mcpToolCall", id: "message-mcp-call", server: "chrome_devtools", tool: "list_pages", status: "completed" },
      },
    },
    "message",
  );
  api.inspectLocalPayload(
    {
      threadId: messageInvocationSession,
      turnId: messageInvocationTurn,
      type: "mcp-notification",
      method: "item/completed",
      params: {
        threadId: messageInvocationSession,
        turnId: messageInvocationTurn,
        item: {
          type: "commandExecution",
          id: "message-skill-call",
          command: 'rtk read "C:\\\\Users\\\\ovo\\\\.skills-manager\\\\skills\\\\systematic-debugging\\\\SKILL.md"',
        },
      },
    },
    "message",
  );
  api.rememberLocalUsage(
    { input_tokens: 8, output_tokens: 2, total_tokens: 10 },
    "message",
    {},
    { sessionKey: messageInvocationSession, persist: true },
  );
  api.finishLocalTurn(0, { reason: "profile-ledger-message-invocation-complete", force: true, sessionKey: messageInvocationSession });
  const messageInvocationProfile = api.localProfileResponse();
  assert.equal(
    messageInvocationProfile.stats.top_invocations.find((item) => item.plugin_id === "chrome_devtools")?.usage_count,
    1,
  );

  const unknownBefore = api.localProfileResponse();
  const unknownDayBefore = unknownBefore.stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-20")?.tokens || 0;
  const unknownSession = "runtime-session-without-thread";
  api.beginLocalTurn({ sessionKey: unknownSession, turnId: "profile-ledger-unknown-turn", startedAtMs: currentNow - 30000 });
  assert.equal(
    api.rememberLocalUsage(
      { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
      "websocket",
      { effort: "low", fastMode: false },
      { sessionKey: unknownSession, persist: true, profileThreadKey: "", threadAttributionStatus: "unknown" },
    ),
    true,
  );
  api.finishLocalTurn(0, { reason: "profile-ledger-unknown-complete", force: true, sessionKey: unknownSession });
  const unknownAfter = api.localProfileResponse();
  assert.equal(unknownAfter.stats.total_threads, unknownBefore.stats.total_threads);
  assert.equal(unknownAfter.stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-20").tokens, unknownDayBefore + 15);

  const completedDurationSession = "profile-ledger-completed-duration-thread";
  api.beginLocalTurn({ sessionKey: completedDurationSession, turnId: "profile-ledger-completed-duration-turn", startedAtMs: currentNow - 125000 });
  api.rememberLocalUsage(
    { input_tokens: 16, output_tokens: 4, total_tokens: 20 },
    "websocket",
    {},
    { sessionKey: completedDurationSession, persist: true },
  );
  api.finishLocalTurn(0, { reason: "profile-ledger-duration-complete", force: true, sessionKey: completedDurationSession });
  const completedDurationProfile = api.localProfileResponse();
  const completedDurationSec = completedDurationProfile.stats.longest_running_turn_sec;
  assert.ok(completedDurationSec >= 125);

  const incompleteDurationSession = "profile-ledger-incomplete-duration-thread";
  api.beginLocalTurn({ sessionKey: incompleteDurationSession, turnId: "profile-ledger-incomplete-duration-turn", startedAtMs: currentNow - 400000 });
  api.rememberLocalUsage(
    { input_tokens: 6, output_tokens: 1, total_tokens: 7 },
    "websocket",
    {},
    { sessionKey: incompleteDurationSession, persist: false },
  );
  api.persistLocalCurrentTurn("incomplete", incompleteDurationSession, { durationStatus: "incomplete" });
  api.setLocalCurrentTurn(null, incompleteDurationSession);
  const incompleteDurationProfile = api.localProfileResponse();
  assert.equal(incompleteDurationProfile.stats.longest_running_turn_sec, completedDurationSec);
  assert.ok(incompleteDurationProfile.stats.longest_observed_turn_sec >= 400);

  const noUsageDurationSession = "profile-ledger-no-usage-duration-thread";
  api.beginLocalTurn({
    sessionKey: noUsageDurationSession,
    turnId: "profile-ledger-no-usage-duration-turn",
    startedAtMs: currentNow - 500000,
    profileThreadKey: noUsageDurationSession,
    threadAttributionStatus: "reliable",
  });
  api.finishLocalTurn(0, { reason: "profile-ledger-no-usage-duration-complete", force: true, sessionKey: noUsageDurationSession });
  assert.ok(api.localProfileResponse().stats.longest_running_turn_sec >= 500);

  const bulkBefore = api.localProfileResponse();
  const bulkRows = Array.from({ length: 2001 }, (_, index) => ({
    turnId: `profile-ledger-bulk:${index}`,
    source: "codex-live-token-cost",
    model: "gpt-5.5",
    createdAt: new Date(Date.parse("2010-01-01T00:00:00.000Z") + index * 86400000).toISOString(),
    usage: { input: 1, output: 0, total: 1 },
  }));
  const bulkResult = api.importLocalUsageTurns(bulkRows);
  assert.equal(bulkResult.imported, 2001);
  const bulkAfter = api.localProfileResponse();
  assert.equal(bulkAfter.stats.lifetime_tokens, bulkBefore.stats.lifetime_tokens + 2001);
  assert.ok(
    api.localUsageExport().turns.filter((turn) => turn.source !== "cc-switch" && turn.importSource !== "cc-switch").length <= 2000,
  );

  const profileBeforeSessionDelete = api.localProfileResponse();
  storage.delete("__codexLiveTokenCostLocalUsageV1");
  const profileAfterSessionDelete = api.localProfileResponse();
  assert.equal(profileAfterSessionDelete.stats.lifetime_tokens, profileBeforeSessionDelete.stats.lifetime_tokens);
  const profileSnapshot = context.localStorage.getItem("__codexLiveTokenCostProfileLedgerV2");
  assert.ok(profileSnapshot);
  assert.equal(JSON.parse(profileSnapshot).migrationComplete, true);
  assert.equal(profileSnapshot.includes("RAW_COMMAND_SHOULD_NOT_PERSIST"), false);
  assert.equal(profileSnapshot.includes("RAW_API_KEY_SHOULD_NOT_PERSIST"), false);

  storage.set(
    "__codexLiveTokenCostProfileLedgerV2",
    JSON.stringify({
      version: 2,
      storage: "indexeddb",
      migrationComplete: true,
      rollup: {
        version: 2,
        updatedAt: currentNow,
        days: {
          "2026-07-20": {
            date: "2026-07-20",
            local: { input: 10, output: 2, cached: 1, total: 12, cost: 0, requests: 1, turns: 1 },
            ccSwitch: { input: 0, output: 0, cached: 0, total: 0, cost: 0, requests: 0, turns: 0 },
            tokens: 12,
            input: 10,
            output: 2,
            cached: 1,
            cost: 0,
            requests: 1,
            totalTurns: 1,
            maxCompletedDurationMs: 123000,
            maxObservedDurationMs: 456000,
            fastModeTokens: 8,
            totalTokens: 12,
            fastModeTurns: 1,
            reasoningEffort: { high: 1 },
            invocationCounts: {
              "skill\u0001\u0001\u0001snapshot-skill\u0001Snapshot": {
                invocation: { type: "skill", skill_id: "snapshot-skill", skill_name: "Snapshot" },
                count: 2,
              },
            },
          },
        },
        threadKeys: ["snapshot-thread"],
        activity: {
          fastModeTokens: 8,
          totalTokens: 12,
          fastModeTurns: 1,
          totalTurns: 1,
          longestCompletedDurationMs: 123000,
          longestObservedDurationMs: 456000,
          effortCounts: { high: 1 },
          invocationCounts: {
            "skill\u0001\u0001\u0001snapshot-skill\u0001Snapshot": {
              invocation: { type: "skill", skill_id: "snapshot-skill", skill_name: "Snapshot" },
              count: 2,
            },
          },
        },
      },
    }),
  );
  context.indexedDB = createIndexedDbTestDouble();
  vm.runInNewContext(code, context, { filename: scriptPath });
  const hydratedSnapshotProfile = context.__codexLiveTokenCostTest.localProfileResponse();
  assert.equal(hydratedSnapshotProfile.stats.lifetime_tokens, 12);
  assert.equal(hydratedSnapshotProfile.stats.total_threads, 1);
  assert.equal(hydratedSnapshotProfile.stats.fast_mode_usage_percentage, 67);
  assert.equal(hydratedSnapshotProfile.stats.longest_running_turn_sec, 123);
  assert.equal(hydratedSnapshotProfile.stats.longest_observed_turn_sec, 456);
  assert.equal(hydratedSnapshotProfile.stats.most_used_reasoning_effort, "high");
  assert.equal(hydratedSnapshotProfile.stats.unique_skills_used, 1);
  assert.equal(hydratedSnapshotProfile.stats.total_skills_used, 2);

  const idbApi = context.__codexLiveTokenCostTest;
  idbApi.localProfileResponse();
  for (let index = 0; index < 3; index += 1) await new Promise((resolve) => setImmediate(resolve));
  idbApi.beginLocalTurn({
    sessionKey: "idb-roundtrip-thread",
    turnId: "idb-roundtrip-turn",
    startedAtMs: currentNow - 123000,
    profileThreadKey: "idb-roundtrip-thread",
    threadAttributionStatus: "reliable",
  });
  idbApi.rememberLocalUsage(
    { input_tokens: 30, output_tokens: 12, total_tokens: 42 },
    "websocket",
    { effort: "high", fastMode: true, invocations: [{ type: "skill", skill_id: "idb-skill", skill_name: "IDB" }] },
    {
      sessionKey: "idb-roundtrip-thread",
      persist: true,
      profileThreadKey: "idb-roundtrip-thread",
      threadAttributionStatus: "reliable",
      invocationEventId: "idb-roundtrip-event",
    },
  );
  idbApi.finishLocalTurn(0, { reason: "idb-roundtrip-complete", force: true, sessionKey: "idb-roundtrip-thread" });
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
  const idbDatabase = await new Promise((resolve, reject) => {
    const request = context.indexedDB.open("codex-live-token-cost-profile");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const request = idbDatabase.transaction("profileUsageCalls", "readwrite").objectStore("profileUsageCalls").put({
      id: "legacy-total-only-call",
      turnId: "idb-roundtrip-turn",
      usage: { total_tokens: 42, output_tokens: 0 },
      observedAt: currentNow,
      source: "legacy",
    });
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  idbDatabase.close();
  const persistedSnapshot = JSON.parse(storage.get("__codexLiveTokenCostProfileLedgerV2"));
  assert.equal(persistedSnapshot.storage, "indexeddb");
  assert.equal(persistedSnapshot.rollup.days["2026-07-20"].tokens, 42);
  storage.set(
    "__codexLiveTokenCostProfileLedgerV2",
    JSON.stringify({
      version: 2,
      storage: "indexeddb",
      migrationComplete: true,
      rollup: {
        version: 2,
        updatedAt: currentNow,
        days: {},
        threadKeys: [],
        activity: {
          fastModeTokens: 0,
          totalTokens: 0,
          fastModeTurns: 0,
          totalTurns: 0,
          longestCompletedDurationMs: 0,
          longestObservedDurationMs: 0,
          effortCounts: {},
          invocationCounts: {},
        },
      },
    }),
  );
  context.__codexLiveTokenCost.destroy();
  vm.runInNewContext(code, context, { filename: scriptPath });
  const beforeIdbHydration = context.__codexLiveTokenCostTest.localProfileResponse();
  assert.equal(beforeIdbHydration.stats.lifetime_tokens, 0);
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
  const afterIdbHydration = context.__codexLiveTokenCostTest.localProfileResponse();
  assert.equal(afterIdbHydration.stats.lifetime_tokens, 42);
  assert.equal(afterIdbHydration.stats.total_threads, 1);
  assert.equal(afterIdbHydration.stats.fast_mode_usage_percentage, 100);
  assert.equal(afterIdbHydration.stats.longest_running_turn_sec, 123);
  assert.equal(afterIdbHydration.stats.most_used_reasoning_effort, "high");
  assert.equal(afterIdbHydration.stats.unique_skills_used, 1);
  assert.equal(afterIdbHydration.stats.total_skills_used, 1);
  idbApi.profileLedgerUpsertTurn({
    turnId: "idb-roundtrip-turn",
    source: "codex-live-token-cost",
    usage: { input: 42, output: 0, total: 42 },
  });
  assert.equal(idbApi.profileLedgerTurns().filter((turn) => turn.turnId === "idb-roundtrip-turn").length, 1);
  const hydratedDatabase = await new Promise((resolve, reject) => {
    const request = context.indexedDB.open("codex-live-token-cost-profile");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const hydratedUsageCalls = await new Promise((resolve, reject) => {
    const request = hydratedDatabase.transaction("profileUsageCalls", "readonly").objectStore("profileUsageCalls").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  hydratedDatabase.close();
  assert.equal(hydratedUsageCalls.some((call) => call.turnId === "idb-roundtrip-turn"), true);
  const roundtripCall = hydratedUsageCalls.find((call) => call.usage?.input === 42 && call.usage?.output === 0 && call.usage?.total === 42);
  assert.ok(roundtripCall);
  assert.equal(roundtripCall.id, `idb-roundtrip-turn\u0001${roundtripCall.usageKey}`);

  const originalSnapshotSetItem = context.localStorage.setItem;
  context.localStorage.setItem = function quotaLimitedLedgerSnapshot(key, value) {
    if (key === "__codexLiveTokenCostProfileLedgerV2" && !String(value).includes('"hydrationRequired":true')) {
      const error = new Error("quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    return originalSnapshotSetItem.call(this, key, value);
  };
  assert.equal(idbApi.saveProfileLedgerSnapshot(), false);
  context.localStorage.setItem = originalSnapshotSetItem;
  const compactLedgerSnapshot = JSON.parse(storage.get("__codexLiveTokenCostProfileLedgerV2"));
  assert.equal(compactLedgerSnapshot.storage, "indexeddb");
  assert.equal(compactLedgerSnapshot.hydrationRequired, true);
  assert.equal(Object.hasOwn(compactLedgerSnapshot, "rollup"), false);
  context.localStorage.setItem = function blockedLedgerSnapshot(key, value) {
    if (key === "__codexLiveTokenCostProfileLedgerV2") throw new Error("quota exceeded");
    return originalSnapshotSetItem.call(this, key, value);
  };
  assert.equal(idbApi.saveProfileLedgerSnapshot(), false);
  context.localStorage.setItem = originalSnapshotSetItem;
  const optionalFallbackSnapshot = storage.has("__codexLiveTokenCostProfileLedgerV2") ? JSON.parse(storage.get("__codexLiveTokenCostProfileLedgerV2")) : null;
  if (optionalFallbackSnapshot) {
    assert.equal(optionalFallbackSnapshot.version, 2);
    assert.equal(Object.hasOwn(optionalFallbackSnapshot, "rollup"), false);
  }
  context.__codexLiveTokenCost.destroy();
  context.indexedDB = createIndexedDbTestDouble();
  vm.runInNewContext(code, context, { filename: scriptPath });
  assert.equal(context.__codexLiveTokenCostTest.localProfileResponse().stats.lifetime_tokens, 0);
  context.__codexLiveTokenCost.destroy();
  delete context.indexedDB;
  storage.set(
    "__codexLiveTokenCostProfileLedgerV2",
    JSON.stringify({
      version: 2,
      storage: "localStorage-fallback",
      migrationComplete: true,
      turns: [{ turnId: "hydrated-turn", createdAt: "2026-07-20T00:00:00.000Z", usage: { total_tokens: 10, output_tokens: 0 }, invocationIds: ["linked-invocation"] }],
      usageCalls: [{ id: "legacy-total-only-call", turnId: "hydrated-turn", usage: { total_tokens: 10, output_tokens: 0 } }],
      invocations: [
        { invocationId: "linked-invocation", turnId: "hydrated-turn", type: "skill", skill_id: "hydrated-skill", skill_name: "Hydrated" },
        { invocationId: "orphan-invocation", turnId: "missing-turn", type: "plugin", plugin_id: "orphan-plugin", plugin_name: "Orphan" },
      ],
    }),
  );
  vm.runInNewContext(code, context, { filename: scriptPath });
  const legacyHydrationProfile = context.__codexLiveTokenCostTest.localProfileResponse();
  const legacyHydrationDay = legacyHydrationProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-20");
  assert.equal(legacyHydrationDay.input_tokens, 10);
  assert.equal(legacyHydrationProfile.stats.total_skills_used, 1);
  assert.equal(legacyHydrationProfile.stats.total_plugins_used, 0);
  const legacyApi = context.__codexLiveTokenCostTest;
  legacyApi.profileLedgerUpsertTurn({
    turnId: "hydrated-turn",
    source: "codex-live-token-cost",
    usage: { input: 10, output: 0, total: 10 },
  });
  assert.equal(legacyApi.profileLedgerTurns().filter((turn) => turn.turnId === "hydrated-turn").length, 1);
})
  .then(async () => {
    const cleanups = [];
    context.__codexLiveTokenCostVersion = undefined;
    context.__codexLiveTokenCost = undefined;
    context.__codexLiveTokenCostActiveBridge = undefined;
    context.codexPlus = {
      script: { key: "user:market-codex-live-token-cost.js" },
      registerPage(definition, options) {
        registerPageCalls.push({ definition, options });
        return () => {};
      },
      onCleanup(cleanup) {
        cleanups.push(cleanup);
        return () => {};
      },
    };
    vm.runInNewContext(code, context, { filename: scriptPath });
    listeners.get("DOMContentLoaded")?.();
    assert.equal(cleanups.length, 1);
    assert.equal(typeof cleanups[0], "function");
    assert.equal(typeof context.__codexLiveTokenCost.destroy, "function");
    assert.equal(typeof context.__codexLiveTokenCostActiveBridge.profileSyntheticEnabled, "function");
    assert.equal(typeof context.__codexLiveTokenCostTest.renderEmbeddedSettingsPage, "function");
    assert.equal(typeof context.__codexLiveTokenCostTest.installCodexPlusEmbeddedPage, "function");
    assert.equal(registerPageCalls.length, 1);
    assert.equal(registerPageCalls[0].definition.title, "Codex Token Cost");
    assert.match(String(registerPageCalls[0].options.icon), /^<svg viewBox="0 0 24 24"/);
    assert.match(String(registerPageCalls[0].options.icon), /<path d="M12 17V7">/);
    assert.equal(typeof registerPageCalls[0].options.navLabel, "string");

    let embeddedInnerHtmlWrites = 0;
    const embeddedContainer = {
      dataset: {},
      classList: { add() {} },
      get innerHTML() {
        return embeddedInnerHtmlValue;
      },
      set innerHTML(value) {
        embeddedInnerHtmlValue = value;
        embeddedInnerHtmlWrites += 1;
      },
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
    };
    let embeddedInnerHtmlValue = "";
    context.__codexLiveTokenCostTest.renderEmbeddedSettingsPage(embeddedContainer);
    assert.equal(embeddedContainer.innerHTML.includes("cltc-settings-modal"), true);
    assert.equal(embeddedContainer.innerHTML.includes("Codex Token Cost"), true);
    assert.equal(embeddedInnerHtmlWrites, 1, "first embedded render must rebuild content");
    const firstHtml = embeddedContainer.innerHTML;
    context.__codexLiveTokenCostTest.renderEmbeddedSettingsPage(embeddedContainer);
    assert.equal(embeddedInnerHtmlWrites, 1, "unchanged embedded render must not rebuild content");
    assert.equal(embeddedContainer.innerHTML, firstHtml);

    const cleanupResult = cleanups[0]();
    assert.equal(cleanupResult, undefined, "cleanup must stay synchronous so Codex++ can hot reload in place");
    assert.equal(context.__codexLiveTokenCost, undefined);
    assert.equal(context.__codexLiveTokenCostActiveBridge, undefined);
    assert.equal(context.__codexLiveTokenCostVersion, undefined);

    cleanups[0]();

    vm.runInNewContext(code, context, { filename: scriptPath });
    assert.equal(cleanups.length, 2);
    assert.equal(typeof context.__codexLiveTokenCostActiveBridge.profileSyntheticEnabled, "function");
    assert.equal(context.__codexLiveTokenCostActiveBridge.profileSyntheticEnabled(), false);
    assert.equal(context.__codexLiveTokenCostVersion, "0.7.10-beta1");

    assert.equal(cleanups[1](), undefined);
    assert.equal(context.__codexLiveTokenCostActiveBridge, undefined);
    context.codexPlus = {
      apiVersion: 2,
      script: { key: "user:market-codex-live-token-cost.js" },
      registerPage(definition, options) {
        registerPageCalls.push({ definition, options });
        return () => {};
      },
      fail() {},
    };
    const registerPageCallsBeforeMismatch = registerPageCalls.length;
    vm.runInNewContext(code, context, { filename: scriptPath });
    assert.equal(registerPageCalls.length, registerPageCallsBeforeMismatch, "apiVersion mismatch must not register the page");
    delete context.codexPlus;
  })
  .then(async () => {
    context.__codexLiveTokenCostVersion = undefined;
    context.__codexLiveTokenCost = undefined;
    context.__codexLiveTokenCostActiveBridge = undefined;
    const updateToasts = [];
    const userScriptListResult = {
      enabled: true,
      user_dir: "C:\\Users\\tester\\user_scripts",
      scripts: [{ key: "user:market-codex-live-token-cost.js", name: "market-codex-live-token-cost.js", source: "user", enabled: true, status: "loaded" }],
    };
    context.codexPlus = {
      script: { key: "user:market-codex-live-token-cost.js" },
      fail() {},
      toast(message, options) {
        updateToasts.push({ message, options });
      },
      call(route) {
        if (route === "/user-scripts/list") return Promise.resolve(userScriptListResult);
        return Promise.resolve({});
      },
    };
    vm.runInNewContext(code, context, { filename: scriptPath });
    const updateApi = context.__codexLiveTokenCostTest;
    assert.equal(typeof updateApi.checkForUpdateNow, "function");
    assert.equal(typeof updateApi.runScriptUpdate, "function");
    assert.equal(typeof updateApi.updateClusterHtml, "function");
    assert.equal(typeof updateApi.updateStateSnapshot, "function");
    assert.match(code, /const ownsGlobals = window\.__codexLiveTokenCost\?\.destroy === destroy;/);
    assert.match(code, /if \(ownsGlobals\) document\.getElementById\(STYLE_ID\)\?\.remove\(\);/);
    assert.match(code, /if \(ownsGlobals\) \{\n      delete window\.__codexLiveTokenCost;\n      if \(window\.__codexLiveTokenCostVersion === VERSION\) delete window\.__codexLiveTokenCostVersion;\n    \}/);
    assert.match(code, /window\.__codexLiveTokenCostLastApply = trace;/);
    assert.match(code, /window\.requestAnimationFrame\(done\);\n[\s\S]{0,200}?window\.setTimeout\(done, 50\);/);
    assert.match(code, /const done = \(\) => \{\n        if \(settled\) return;\n        settled = true;\n        resolve\(\);\n      \};/);
    assert.match(code, /\.cltc-update-cluster \{\n        display: inline-flex;\n        align-items: center;\n        gap: 6px;\n        margin-left: 10px;/);
    assert.match(code, /\.cltc-update-cluster \.cltc-update-version \{\n        position: relative;\n      \}/);
    assert.match(code, /\.cltc-update-cluster\[data-phase="available"\] \.cltc-update-version::after \{\n        content: "";\n        position: absolute;\n        top: -2px;\n        right: -6px;\n        width: 6px;\n        height: 6px;\n        border-radius: 999px;\n        background: #e5484d;\n        pointer-events: none;\n      \}/);
    assert.match(code, /const UPDATE_REPO_URL = "https:\/\/github\.com\/Tianzora\/codex-token-cost";/);
    assert.equal(updateApi.updateParseVersion("// @version      0.7.11-beta1\n"), "0.7.11-beta1");
    assert.equal(updateApi.updateParseVersion("// no version header"), "");
    const compareVersions = updateApi.compareUpdateVersions;
    assert.equal(compareVersions("0.7.10-beta1", "0.7.10-beta1"), 0);
    assert.equal(compareVersions("0.7.10-beta1", "0.7.10"), -1);
    assert.equal(compareVersions("0.7.10", "0.7.10-beta1"), 1);
    assert.equal(compareVersions("0.7.9", "0.7.10-beta1"), -1);
    assert.equal(compareVersions("0.7.11-beta1", "0.7.10-beta1"), 1);
    assert.equal(compareVersions("0.7.10-beta2", "0.7.10-beta1"), 1);
    assert.equal(compareVersions("0.7.10-beta10", "0.7.10-beta9"), 1);
    assert.equal(compareVersions("1.0.0", "0.9.9"), 1);
    assert.equal(compareVersions("bogus", "0.7.10"), 0);
    const downloadArgs = updateApi.updateDownloadCommand("https://example.com/a.js?x=1", "C:\\tmp\\a.js.download");
    assert.equal(downloadArgs[0], "curl");
    assert.equal(downloadArgs[downloadArgs.indexOf("-o") + 1], "C:\\tmp\\a.js.download");
    assert.equal(downloadArgs[downloadArgs.length - 1], "https://example.com/a.js?x=1");
    assert.equal(downloadArgs.includes("--retry"), true);
    const checkArgs = updateApi.updateCheckCommand("https://example.com/a.js?x=1", "C:\\tmp\\a.js.download");
    assert.equal(checkArgs[0], "curl");
    assert.equal(checkArgs[checkArgs.indexOf("-r") + 1], "0-8191");
    assert.equal(checkArgs[checkArgs.indexOf("-o") + 1], "C:\\tmp\\a.js.download");
    assert.equal(checkArgs[checkArgs.length - 1], "https://example.com/a.js?x=1");
    assert.equal(updateApi.updateCommandPathJoin("C:\\Users\\tester\\user_scripts\\", "market-codex-live-token-cost.js"), "C:\\Users\\tester\\user_scripts\\market-codex-live-token-cost.js");
    assert.equal(updateApi.updateCommandPathJoin("/Users/tester/user_scripts", "a.js"), "/Users/tester/user_scripts/a.js");
    const fakeSource = (version) => [
      "// ==UserScript==",
      "// @name         Codex Live Token Cost",
      `// @version      ${version}`,
      "// ==/UserScript==",
      `// ${"x".repeat(110000)}`,
      "(() => {",
      '  "use strict";',
      `  window.__codexLiveTokenCostVersion = ${JSON.stringify(version)};`,
      "  window.__codexLiveTokenCost = { destroy() {} };",
      "})();",
    ].join("\n");
    assert.equal(updateApi.updateSourceLooksValid(fakeSource("0.7.11-beta1"), "0.7.11-beta1"), true);
    assert.equal(updateApi.updateSourceLooksValid(fakeSource("0.7.11-beta1"), "0.7.12"), false);
    assert.equal(updateApi.updateSourceLooksValid("// too short", "0.7.11-beta1"), false);

    updateApi.updateResetState();
    const savedCodexPlus = context.codexPlus;
    context.codexPlus = undefined;
    assert.equal(await updateApi.checkForUpdateNow({ auto: true }), false);
    assert.equal(updateApi.updateStateSnapshot().phase, "");
    assert.equal(updateApi.updateStateSnapshot().error, "Codex++ 通道不可用");
    assert.equal(await updateApi.checkForUpdateNow({ auto: false }), false);
    assert.equal(updateApi.updateStateSnapshot().phase, "error");
    assert.equal(updateApi.updateStateSnapshot().errorKind, "check");
    context.codexPlus = savedCodexPlus;

    const base64Of = (text) => Buffer.from(text, "utf8").toString("base64");
    const targetPath = "C:\\Users\\tester\\user_scripts\\market-codex-live-token-cost.js";
    const downloadPath = `${targetPath}.download`;
    const commandCalls = [];
    const readCalls = [];
    const writeCalls = [];
    const removeCalls = [];
    let remoteSource = fakeSource("0.7.10-beta1");
    let writtenBase64 = "";
    let corruptTargetRead = false;
    const hostClient = {
      hostId: "local",
      sendRequest(route, payload) {
        if (route === "command/exec") {
          commandCalls.push(payload.command);
          return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
        }
        if (route === "fs/readFile") {
          readCalls.push(payload.path);
          if (payload.path === downloadPath) return Promise.resolve({ dataBase64: base64Of(remoteSource) });
          if (payload.path === targetPath) return Promise.resolve({ dataBase64: corruptTargetRead ? base64Of("corrupt") : writtenBase64 || base64Of(code) });
          return Promise.resolve({ dataBase64: "" });
        }
        if (route === "fs/writeFile") {
          writeCalls.push({ path: payload.path, dataBase64: payload.dataBase64 });
          writtenBase64 = payload.dataBase64;
          return Promise.resolve({});
        }
        if (route === "fs/remove") {
          removeCalls.push(payload.path);
          return Promise.resolve({});
        }
        return Promise.resolve({});
      },
    };
    context.__codexPlusNativeHostClients = new Map([["local", { ref: { deref: () => hostClient } }]]);

    updateApi.updateResetState();
    assert.equal(await updateApi.checkForUpdateNow({ auto: true }), true);
    assert.equal(updateApi.updateStateSnapshot().phase, "");
    assert.equal(updateApi.updateStateSnapshot().remoteVersion, "");
    assert.equal(commandCalls.length, 1);
    assert.equal(commandCalls[0].includes("-r"), true);
    assert.equal(commandCalls[0][commandCalls[0].length - 1].includes("raw.githubusercontent.com/Tianzora/codex-token-cost/main/scripts/codex-live-token-cost.js"), true);

    updateApi.updateResetState();
    assert.equal(await updateApi.checkForUpdateNow({ auto: false }), true);
    assert.equal(updateApi.updateStateSnapshot().phase, "uptodate");
    assert.equal(updateApi.updateClusterHtml().includes("已是最新"), true);
    assert.equal(updateApi.updateClusterHtml().includes('data-action="open-repo"'), true);

    remoteSource = fakeSource("0.7.11-beta1");
    updateApi.updateResetState();
    assert.equal(await updateApi.checkForUpdateNow({ auto: true }), true);
    assert.equal(updateApi.updateStateSnapshot().phase, "available");
    assert.equal(updateApi.updateStateSnapshot().remoteVersion, "0.7.11-beta1");
    assert.equal(updateApi.updateClusterHtml().includes("一键更新 v0.7.11-beta1"), true);
    const availableHtml = updateApi.updateClusterHtml();
    assert.equal(availableHtml.includes('data-action="open-repo"'), true);
    assert.equal(availableHtml.includes('class="cltc-update-github"'), true);
    assert.equal(availableHtml.includes("<svg"), true);
    const openCalls = [];
    context.open = (url, target, features) => {
      openCalls.push([url, target, features]);
      return null;
    };
    updateApi.handleUpdateClusterClick({
      target: { closest: () => ({ getAttribute: (name) => (name === "data-action" ? "open-repo" : null) }) },
    });
    assert.equal(openCalls.length, 1);
    assert.equal(openCalls[0][0], "https://github.com/Tianzora/codex-token-cost");
    assert.equal(openCalls[0][1], "_blank");
    assert.equal(String(openCalls[0][2]).includes("noopener"), true);

    const previousInstance = context.__codexLiveTokenCost;
    const registryKey = "user:market-codex-live-token-cost.js";
    const registryEntry = {
      key: registryKey,
      name: "market-codex-live-token-cost.js",
      source: "user",
      status: "loaded",
      error: "",
      loadedAt: "2026-07-04T00:00:00.000Z",
      cleanups: [previousInstance.destroy],
    };
    context.__codexPlusUserScripts = { scripts: { [registryKey]: registryEntry } };
    const versionBeforeUpdate = context.__codexLiveTokenCostVersion;

    const freshRemoteSource = remoteSource;
    remoteSource = fakeSource("0.7.10-beta1");
    assert.equal(await updateApi.runScriptUpdate(), false);
    assert.equal(updateApi.updateStateSnapshot().phase, "error");
    assert.equal(updateApi.updateStateSnapshot().errorKind, "update");
    assert.equal(writeCalls.length, 0);
    assert.equal(context.__codexLiveTokenCostVersion, versionBeforeUpdate);
    remoteSource = freshRemoteSource;

    corruptTargetRead = true;
    assert.equal(await updateApi.runScriptUpdate(), false);
    assert.equal(updateApi.updateStateSnapshot().phase, "error");
    assert.equal(updateApi.updateStateSnapshot().errorKind, "update");
    assert.equal(context.__codexLiveTokenCostVersion, versionBeforeUpdate);
    assert.equal(context.__codexLiveTokenCost, previousInstance);
    corruptTargetRead = false;

    assert.equal(await updateApi.runScriptUpdate(), true);
    assert.equal(context.__codexLiveTokenCostVersion, "0.7.11-beta1");
    assert.equal(context.__codexLiveTokenCost === previousInstance, false);
    assert.equal(typeof context.__codexLiveTokenCost.destroy, "function");
    assert.equal(registryEntry.cleanups[0], context.__codexLiveTokenCost.destroy);
    assert.equal(registryEntry.loadedAt !== "2026-07-04T00:00:00.000Z", true);
    assert.equal(registryEntry.status, "loaded");
    assert.equal(writeCalls.length, 2);
    assert.equal(writeCalls[1].path, targetPath);
    assert.equal(writeCalls[1].dataBase64, base64Of(remoteSource));
    assert.equal(removeCalls.includes(downloadPath), true);
    assert.equal(readCalls.includes(targetPath), true);
    assert.equal(updateToasts.some((entry) => String(entry.message).includes("已更新到 v0.7.11-beta1")), true);
    const lastCommand = commandCalls[commandCalls.length - 1];
    assert.equal(lastCommand[0], "curl");
    assert.equal(lastCommand.includes("-r"), false);
    assert.equal(lastCommand[lastCommand.length - 1].includes("raw.githubusercontent.com/Tianzora/codex-token-cost/main/scripts/codex-live-token-cost.js"), true);
  })
  .catch((error) => {
  setImmediate(() => {
    throw error;
  });

});
