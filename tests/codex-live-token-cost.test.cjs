const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-live-token-cost.js");
const priceSourcePath = path.join(__dirname, "..", "scripts", "codex-live-token-cost-prices.js");
const code = fs.readFileSync(scriptPath, "utf8").replace(/\r\n/g, "\n");
const priceSourceCode = fs.readFileSync(priceSourcePath, "utf8").replace(/\r\n/g, "\n");

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
assert.equal(code.includes('const VERSION = "0.7.7"'), true);
assert.equal(code.includes("Flatpickr 4.6.13 + zh locale"), true);
assert.equal(code.includes("--cltc-calendar-accent: rgb(76, 78, 80)"), true);
assert.equal(code.includes("#10a37f !important"), false);
assert.equal(code.includes("width: 672px !important"), true);
assert.equal(code.includes("height: 42px !important"), true);
assert.match(code, /\.flatpickr-day\.inRange::before,[\s\S]*?top: 5px;[\s\S]*?bottom: 5px;/);
assert.match(code, /\.flatpickr-day\.selected::after,[\s\S]*?width: 34px;[\s\S]*?background: var\(--cltc-calendar-accent\)/);
assert.match(code, /\.flatpickr-day:focus-visible::after \{[\s\S]*?var\(--cltc-calendar-accent\)/);
assert.equal(code.includes("-5px 0 0 color-mix"), false);
assert.equal(code.includes('if (state.analyticsPreset === "custom") window.setTimeout(() => void openAnalyticsCalendar(), 0);'), false);
assert.equal(code.includes("cltc-analytics-tooltip"), true);
assert.match(code, /rect\[data-chart-index\][\s\S]*?stroke: transparent !important;/);
assert.match(code, /rect\[data-chart-index\]:focus-visible[\s\S]*?stroke: rgb\(76, 78, 80\) !important;/);
assert.equal(code.includes("@keyframes cltc-analytics-bar-grow"), true);
assert.equal(code.includes("transform-box: fill-box;"), true);
assert.equal(code.includes("transform-origin: center bottom;"), true);
assert.equal(code.includes("transform: scaleY(0);"), true);
assert.equal(code.includes("animation: cltc-analytics-bar-grow 720ms cubic-bezier(.16, 1, .3, 1) var(--cltc-chart-bar-delay, 0ms) both;"), true);
assert.equal(code.includes('style="--cltc-chart-bar-delay:${index * stagger}ms"'), true);
assert.match(code, /prefers-reduced-motion: reduce[\s\S]*?\.cltc-settings-overlay \.cltc-analytics-chart rect\[data-chart-index\][\s\S]*?animation: none;[\s\S]*?transform: scaleY\(1\);/);
assert.equal(code.includes("refreshUsageAnalyticsFromHelper"), true);
assert.equal(code.includes("__FLATPICKR_JS_GZIP_BASE64__"), false);
assert.equal(code.includes("__FLATPICKR_CSS_GZIP_BASE64__"), false);
assert.equal(code.includes('data-settings-panel="usage"'), true);
assert.equal(code.includes("使用统计"), true);
assert.equal(code.includes("@description  在 Codex 输入框上方显示 Token 与金额，解锁官方个人资料页并替换为本地统计；通过设置按钮管理价格和伪装资料。"), true);
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
assert.equal(code.includes("grid-template-columns: 176px minmax(0, 1fr)"), true);
assert.equal(code.includes("@media (max-width: 680px)"), true);
assert.equal(code.includes(".cltc-profile-select:open"), true);
assert.equal(code.includes(".cltc-profile-select option"), true);
assert.equal(code.includes("appearance: base-select"), true);
assert.equal(code.includes("::picker(select)"), true);
assert.equal(code.includes("::picker-icon"), true);
assert.equal(code.includes("border-radius: 8px"), true);
assert.equal(code.includes("html.electron-dark .cltc-settings-overlay"), true);
assert.equal(code.includes("background: rgba(0, 0, 0, .28)"), false);
assert.equal(code.includes("scrollbar-width: thin"), true);
assert.equal(code.includes("color-scheme: light dark"), true);
assert.equal(code.includes("--cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5))"), true);
assert.equal(code.includes("--cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)))"), true);
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
assert.equal(code.includes("--cltc-arc-bg: rgb(31, 31, 31)"), true);
assert.equal(code.includes("--cltc-text: #d4d4d8"), true);
assert.equal(code.includes("--cltc-muted: rgba(255, 255, 255, .498)"), true);
assert.equal(code.includes("--cltc-muted: rgba(26, 28, 31, .494)"), true);
assert.equal(code.includes("--cltc-arc-bg: rgb(246, 246, 246)"), true);
assert.equal(code.includes("--cltc-arc-bg: rgba(0, 0, 0, 1)"), false);
assert.equal(code.includes("--cltc-arc-bg: rgba(0, 0, 0, .07)"), false);
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
  /\.cltc-settings-overlay \{\n([\s\S]*?)\n      \}\n      html\.electron-dark \.cltc-settings-overlay \{/,
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
const headerSettingsTokenBlock = code.match(
  /\.cltc-header-settings \{\n([\s\S]*?)\n      \}\n      \.cltc-header-settings\[data-floating="true"\] \{/,
);
assert.ok(headerSettingsTokenBlock);
for (const declaration of [
  "--cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);",
  "--cltc-duration-press: 160ms;",
]) assert.equal(headerSettingsTokenBlock[1].includes(declaration), true);
assert.match(code, /syncHubVisibility\(root\);\s+if \(!state\.settingsOverlay\?\.isConnected \|\| !state\.priceEditorOpen\) renderSettingsOverlay\(snap\);/);
const syncCcSwitchSource = code.match(/async function syncCcSwitchFromSettings\(\) \{[\s\S]*?\n  \}\n\n  function ccSwitchSettingsHtml/)?.[0];
assert.ok(syncCcSwitchSource);
assert.match(syncCcSwitchSource, /syncCcSwitchUsageFromHelper\(\{ refresh: true \}\)/);
assert.match(syncCcSwitchSource, /if \(result\.ok\) \{[\s\S]*?renderSettingsOverlay\(liveSnapshot\(\)\);\s+setCcSwitchSyncStatus\([\s\S]*?\);\s+\} else if \(result\.skipped\)/);
assert.doesNotMatch(syncCcSwitchSource, /if \(result\.ok\) \{[\s\S]*?render\(true\);/);
const syncCcSwitchUsageSource = code.match(/async function syncCcSwitchUsageFromHelper\(options = \{\}\) \{[\s\S]*?\n  \}\n\n  function refreshProfileData/)?.[0];
assert.ok(syncCcSwitchUsageSource);
assert.match(syncCcSwitchUsageSource, /if \(state\.ccSwitchSyncInFlight\) \{\s+if \(!options\.refresh\) return state\.ccSwitchSyncPromise \|\| \{ ok: false, skipped: true \};\s+const inFlightPromise = state\.ccSwitchSyncPromise;\s+if \(inFlightPromise\) await inFlightPromise;\s+if \(state\.ccSwitchSyncInFlight\) return \{ ok: false, skipped: true, refreshing: true \};\s+\}/);
assert.doesNotMatch(syncCcSwitchUsageSource, /\.then\(\(\) => syncCcSwitchUsageFromHelper\(options\)\)/);
assert.match(code, /let entering = false;\s+if \(!state\.settingsOverlay\) \{\s+entering = true;[\s\S]*?state\.settingsOverlay\.dataset\.cltcEntering = "true";/);
assert.match(code, /if \(entering\) \{\s+const overlay = state\.settingsOverlay;\s+const settle = \(\) => overlay\?\.removeAttribute\("data-cltc-entering"\);\s+if \(typeof window\.requestAnimationFrame === "function"\) window\.requestAnimationFrame\(settle\);\s+else settle\(\);\s+\}/);
assert.match(code, /if \(!state\.settingsOverlay\.isConnected\)[\s\S]*?if \(entering\) \{[\s\S]*?else settle\(\);\s+\}[\s\S]*?if \(state\.analyticsCalendar\?\.isOpen\) return;/);
assert.match(
  code,
  /#\$\{ROOT_ID\} \.cltc-button,\s+#\$\{ROOT_ID\} \.cltc-price-head button,\s+#\$\{ROOT_ID\} \.cltc-price-actions button,\s+\.cltc-settings-overlay button,\s+\.cltc-header-settings \{\s+transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?border-color var\(--cltc-duration-press\) var\(--cltc-ease-out\);\s+\}\s+#\$\{ROOT_ID\} \.cltc-button:active,/,
);
assert.match(code, /\.cltc-settings-modal \{[\s\S]*?opacity: 1;[\s\S]*?transform: translateY\(0\) scale\(1\);[\s\S]*?transition: opacity var\(--cltc-duration-modal\) var\(--cltc-ease-out\),\s+transform var\(--cltc-duration-modal\) var\(--cltc-ease-out\);/);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-entering="true"\] \.cltc-settings-modal \{[\s\S]*?opacity: 0;[\s\S]*?transform: translateY\(4px\) scale\(\.97\);/);
assert.match(code, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.cltc-settings-modal \{[\s\S]*?transform: none;[\s\S]*?transition: opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\);[\s\S]*?\.cltc-settings-overlay\[data-cltc-entering="true"\] \.cltc-settings-modal \{[\s\S]*?transform: none;/);
assert.equal(code.includes("const SETTINGS_MODAL_EXIT_MS = 160;"), true);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-closing="true"\] \{[\s\S]*?pointer-events: none;/);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-closing="true"\] \.cltc-settings-modal \{[\s\S]*?opacity: 0;[\s\S]*?transform: translateY\(2px\) scale\(\.98\);[\s\S]*?transition: opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?transform var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.match(code, /\.cltc-settings-overlay\[data-cltc-closing="true"\] \.cltc-settings-modal \{[\s\S]*?transform: none;[\s\S]*?transition: opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.match(code, /function closeSettingsEditor\(\) \{[\s\S]*?state\.priceEditorOpen = false;[\s\S]*?render\(true\);\s+\}/);
assert.match(code, /function handleSettingsKeydown\(event\) \{\s+if \(event\.key === "Escape"\) \{[\s\S]*?event\.preventDefault\?\.\(\);[\s\S]*?closeSettingsEditor\(\);/);
assert.match(code, /state\.settingsOverlayCloseTimer = window\.setTimeout\(remove, SETTINGS_MODAL_EXIT_MS\);/);
assert.match(code, /state\.settingsButton\?\.focus\?\.\(\);/);
assert.match(code, /state\.settingsOverlay\.addEventListener\("keydown", handleSettingsKeydown\);/);
assert.match(code, /if \(event\.target\?\.classList\?\.contains\("cltc-settings-overlay"\)\) \{\s+closeSettingsEditor\(\);/);
assert.match(code, /if \(event\.target\.closest\?\.\("\[data-action='close-price'\]"\)\) \{\s+closeSettingsEditor\(\);/);
assert.match(code, /const SETTINGS_FOCUS_ATTRIBUTES = \[[\s\S]*?"data-settings-panel"[\s\S]*?"data-chart-index"[\s\S]*?\];/);
assert.match(code, /function settingsFocusKey\(node, root\) \{[\s\S]*?root\?\.contains\?\.\(node\)[\s\S]*?return \{ attribute, value \};/);
assert.match(code, /function isSettingsFocusable\(node\) \{[\s\S]*?node\.disabled[\s\S]*?tabIndex[\s\S]*?return \/\^\(A\|BUTTON\|INPUT\|SELECT\|TEXTAREA\)\$\//);
assert.match(code, /function restoreSettingsFocus\(root, key\) \{[\s\S]*?querySelectorAll\?\.\(SETTINGS_FOCUS_SELECTOR\)[\s\S]*?target\?\.focus\?\.\(\);/);
assert.match(code, /function renderSettingsOverlay\(snap, options = \{\}\) \{\s+const animate = options\.animate === true;/);
assert.match(code, /const focusKey = settingsFocusKey\(document\.activeElement, state\.settingsOverlay\);/);
assert.equal(code.includes("settingsFocusFrame: 0"), true);
assert.match(code, /function cancelSettingsFocusFrame\(\) \{[\s\S]*?cancelAnimationFrame\(state\.settingsFocusFrame\)[\s\S]*?state\.settingsFocusFrame = 0;/);
assert.match(code, /if \(!state\.priceEditorOpen\) \{\s+cancelSettingsFocusFrame\(\);/);
assert.match(code, /const focusRoot = state\.settingsOverlay;[\s\S]*?const restoreFocus = \(\) => \{[\s\S]*?restoreSettingsFocus\(focusRoot, focusKey\);[\s\S]*?state\.settingsFocusFrame = window\.requestAnimationFrame\(restoreFocus\);/);
assert.match(code, /else if \([\s\S]*?state\.settingsFocusFrame[\s\S]*?document\.activeElement !== document\.body[\s\S]*?cancelSettingsFocusFrame\(\);/);
assert.match(code, /if \(animate && content\) \{[\s\S]*?content\.dataset\.cltcSwitching = "true";[\s\S]*?requestAnimationFrame\(settle\);/);
assert.match(code, /\.cltc-settings-overlay \.cltc-settings-content\[data-cltc-switching="true"\] \{[\s\S]*?opacity: \.45;[\s\S]*?transform: translateY\(4px\);/);
assert.match(code, /renderSettingsOverlay\(liveSnapshot\(\), \{ animate: true \}\);/);
assert.match(code, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?#\$\{ROOT_ID\} \.cltc-button:active,[\s\S]*?\.cltc-header-settings:active \{[\s\S]*?transition: none;[\s\S]*?transform: none;/);
assert.equal(code.includes("transition: transform var(--transition-duration-relaxed, .3s) cubic-bezier(.16, 1, .3, 1)"), false);
assert.equal(code.includes("transition: transform var(--cltc-duration-data) var(--cltc-ease-out);"), true);
assert.equal(code.includes("will-change: transform;"), false);
assert.equal(code.includes('stack.style.willChange = "transform";'), true);
assert.equal(code.includes('stack.style.willChange = "";'), true);
assert.equal(code.includes("transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out), transform var(--cltc-duration-popover) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-popover);"), true);
assert.match(code, /\.cltc-toggle-field input,[\s\S]*?transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?background var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?border-color var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.equal(code.includes("transition: transform var(--cltc-duration-press) var(--cltc-ease-out);"), true);
assert.equal(code.includes("transition: rotate var(--cltc-duration-press) var(--cltc-ease-in-out);"), true);
assert.equal(code.includes("transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);"), true);
assert.equal(code.includes("analyticsRangeSwitchFrame: 0"), true);
assert.equal(code.includes("analyticsRangeSwitchTimer: 0"), true);
assert.match(code, /\.cltc-settings-overlay \.cltc-segmented button \{[\s\S]*?transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?opacity var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?background var\(--cltc-duration-press\) var\(--cltc-ease-out\),[\s\S]*?color var\(--cltc-duration-press\) var\(--cltc-ease-out\);/);
assert.match(code, /\.cltc-settings-overlay \.cltc-segmented\[data-cltc-range-switching="true"\] button\[data-active="true"\] \{[\s\S]*?opacity: \.72;[\s\S]*?transform: translateY\(2px\);/);
assert.match(code, /renderSettingsOverlay\(liveSnapshot\(\), \{ animate: true, analyticsRange: true \}\);/);
assert.match(code, /const animateAnalyticsRange = options\.analyticsRange === true;[\s\S]*?const activate = \(\) => \{[\s\S]*?rangeGroup\.dataset\.cltcRangeSwitching = "true";\s+void rangeGroup\.offsetWidth;[\s\S]*?setTimeout\(settle, SETTINGS_MODAL_EXIT_MS\);[\s\S]*?requestAnimationFrame\(activate\);/);
assert.match(code, /\.cltc-settings-overlay \.cltc-segmented\[data-cltc-range-switching="true"\] button\[data-active="true"\] \{[\s\S]*?transition: none;[\s\S]*?opacity: 1;[\s\S]*?transform: none;/);
assert.match(code, /\.cltc-settings-overlay \.cltc-sync-status \{[\s\S]*?transition: opacity var\(--cltc-duration-tooltip\) var\(--cltc-ease-out\);[\s\S]*?\}/);
assert.match(code, /\.cltc-settings-overlay \.cltc-sync-status\[data-cltc-status-pulse="true"\] \{[\s\S]*?opacity: \.48;/);
assert.match(code, /function pulseSettingsStatus\(node\) \{[\s\S]*?node\.dataset\.cltcStatusPulse = "true";\s+void node\.offsetWidth;/);
assert.match(code, /function pulseSettingsStatus\(node\) \{[\s\S]*?cancelAnimationFrame\([\s\S]*?requestAnimationFrame\([\s\S]*?removeAttribute\?\.\("data-cltc-status-pulse"\)/);
assert.match(code, /function setCcSwitchSyncStatus\(message\) \{[\s\S]*?status\.textContent = state\.ccSwitchSyncStatus;\s+pulseSettingsStatus\(status\);/);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{\s+\.cltc-settings-overlay \.cltc-analytics-chart rect\[data-chart-index\]:hover/);
assert.match(code, /\.cltc-settings-overlay \.cltc-analytics-bar:focus-within \.cltc-analytics-tooltip \{[\s\S]*?opacity: 1;[\s\S]*?\}\s+@media \(hover: hover\) and \(pointer: fine\)/);
assert.equal(code.includes("transition: width var(--cltc-duration-tooltip)"), false);
assert.equal(code.includes("transition: height var(--cltc-duration-tooltip)"), false);
assert.equal(code.includes("transition: opacity .18s ease, transform .18s ease, visibility 0s linear .18s;"), false);
assert.equal(code.includes("transition: background .15s ease, border-color .15s ease;"), false);
assert.equal(code.includes("transition: transform .15s ease;"), false);
assert.equal(code.includes("transition: rotate .16s ease;"), false);
assert.equal(code.includes("transition: opacity .15s ease;"), false);
assert.equal(code.includes("transition: opacity .12s ease;"), false);
assert.equal(code.includes("transition: all"), false);
assert.match(code, /\.cltc-settings-overlay \.cltc-settings-nav button,\s+\.cltc-settings-overlay \.cltc-price-row \{[\s\S]*?transition: transform var\(--cltc-duration-press\) var\(--cltc-ease-out\),/);
assert.match(code, /\.cltc-settings-overlay \.cltc-toggle-field input:active \{\s+transform: scale\(\.97\);/);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.cltc-settings-overlay \.cltc-settings-nav button:hover/);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.cltc-header-settings:hover/);
assert.doesNotMatch(code, /\.cltc-settings-overlay \.cltc-settings-nav button:hover,\s+\.cltc-settings-overlay \.cltc-settings-nav button:focus-visible/);
assert.doesNotMatch(code, /\.cltc-header-settings:hover,\s+\.cltc-header-settings:focus-visible/);
assert.match(code, /\.cltc-settings-overlay \.cltc-toggle-field input,[\s\S]*?\.cltc-settings-overlay \.cltc-toggle-field input:active,[\s\S]*?\.cltc-settings-overlay \.cltc-profile-select,[\s\S]*?transition: none;[\s\S]*?transform: none;/);
assert.match(code, /#\$\{ROOT_ID\} \.cltc-button:active,[\s\S]*?\.cltc-header-settings:active \{[\s\S]*?transform: scale\(\.97\);/);
assert.match(code, /\.cltc-settings-overlay \.cltc-analytics-bar:focus-within \.cltc-analytics-tooltip \{[\s\S]*?opacity: 1;/);
assert.match(code, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.cltc-settings-overlay \.cltc-analytics-chart rect\[data-chart-index\]:hover \{[\s\S]*?opacity: \.66;[\s\S]*?\.cltc-settings-overlay \.cltc-analytics-bar:hover \.cltc-analytics-tooltip \{[\s\S]*?opacity: 1;/);
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
assert.equal(code.includes('data-action="delete-price" data-variant="danger">删除</button>'), true);
assert.equal(code.includes('data-action="close-price">取消</button>'), false);
assert.equal(code.includes('data-settings-panel="profile"'), true);
assert.equal(code.includes('data-settings-panel="general"'), true);
assert.equal(code.includes('data-settings-panel="pricing"'), true);
assert.equal(code.includes("state.settingsPanel = panel"), true);
assert.equal(code.includes('<span class="cltc-price-title">Codex Token Cost</span>'), true);
assert.equal(code.includes('<span class="cltc-settings-version">v${VERSION}</span>'), true);
assert.equal(code.includes("cltc-settings-owner"), false);
assert.equal(code.includes("cltc-settings-kicker"), false);
assert.equal(code.includes('<h2>个人资料</h2>'), true);
assert.equal(code.includes('<h2>数据与显示</h2>'), true);
assert.equal(code.includes('<h2>模型价格</h2>'), true);
assert.equal(code.includes('"gpt-5.3-codex"'), true);
assert.equal(code.includes('"gpt-5.4-nano":'), true);
assert.equal(code.includes('"gpt-5.4-pro"'), true);
assert.equal(code.includes('"gpt-5.6-sol"'), true);
assert.equal(code.includes('"gpt-5.6-terra"'), true);
assert.equal(code.includes('"gpt-5.6-luna"'), true);
assert.equal(priceSourceCode.includes('"gpt-5.6-sol"'), true);
assert.equal(priceSourceCode.includes('"gpt-5.4-nano"'), true);
assert.equal(code.includes('data-price-field="cacheWrite"'), true);
assert.equal(code.includes("<span>写缓存</span>"), true);
assert.equal(code.includes('{ value: "free", label: "Free" }'), true);
assert.equal(code.includes('{ value: "pro_5x", label: "Pro 5x" }'), true);
assert.equal(code.includes('{ value: "pro_20x", label: "Pro 20x" }'), true);
assert.equal(code.includes('{ value: "pro", label: "Pro" }'), false);
assert.equal(code.includes('{ value: "business", label: "Business" }'), true);
assert.equal(code.includes('{ value: "enterprise", label: "Enterprise" }'), true);
assert.equal(code.includes('{ value: "edu", label: "Edu" }'), true);
assert.equal(code.includes('{ value: "staff", label: "Staff" }'), true);
assert.equal(code.includes('{ value: "founder", label: "Founder" }'), true);
assert.equal(code.includes('<h2>数据与显示</h2>'), true);
assert.equal(code.includes("显示 HUB"), true);
assert.equal(code.includes('data-misc-field="hubVisible"'), true);
assert.equal(code.includes('data-misc-field="outputRateVisible"'), true);
assert.match(code, /显示 HUB[\s\S]*?data-misc-field="hubVisible"[\s\S]*?显示 Token 输出速率[\s\S]*?data-misc-field="outputRateVisible"[\s\S]*?启用本地 Profile 解锁/);
assert.equal(code.includes('grid-template-columns: minmax(0, 1.55fr) minmax(0, .70fr) minmax(0, 1fr) minmax(0, .82fr) minmax(0, .82fr) minmax(0, 1.51fr);'), true);
assert.equal(code.includes('grid-template-columns: minmax(0, 2.05fr) repeat(4, minmax(0, .755fr)) minmax(0, 1.20fr);'), true);
assert.equal(code.includes('data-cltc-output-rate-visible="true"'), true);
assert.equal(code.includes("grid-template-columns: minmax(0, 1fr) auto"), true);
assert.equal(code.includes("cltc-price-actions-left"), true);
assert.equal(code.includes('花费 ${valueSlot("session-cost")}${textSlot("session-priced-label")}'), true);
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
assert.equal(code.includes("helperJsonUntilReady"), true);
assert.equal(code.includes("HELPER_STATUS_DEGRADED"), true);
assert.equal(code.includes("HELPER_BRIDGE_RETRY_DELAYS_MS"), true);
assert.match(code, /helperJsonViaBridgeWithRetry\(url\)/);
assert.equal(code.includes('data-field="helper-status"'), true);
assert.equal(code.includes("https://github.com/Tianzora/codex-token-cost/blob/main/scripts/codex-local-usage-helper.cjs"), true);
assert.equal(code.includes(">查看脚本</a>"), true);
assert.equal(code.includes("startCcSwitchStartupSync()"), true);
assert.equal(code.includes("const HELPER_POLL_MS"), false);
assert.equal(code.includes("const HELPER_STATS_REFRESH_URL = `${HELPER_STATS_URL}?refresh=1`;"), false);
assert.equal(code.includes("void refreshProfileData();"), true);
assert.equal(code.includes("function openSettingsEditor() {\n    state.priceEditorOpen = true;\n    state.priceEditorModel = modelName();\n    render(true);"), true);
assert.match(code, /function openSettingsEditor\(\) \{[\s\S]*?render\(true\);\s+const focusModal = \(\) => state\.settingsOverlay\?\.querySelector\("\[data-action='close-price'\]"\)\?\.focus\?\.\(\);[\s\S]*?requestAnimationFrame\(focusModal\);/);
assert.equal(code.includes("function refreshCcSwitchUsageFromHelper()"), false);
assert.equal(code.includes('const PROFILE_USAGE_QUERY_KEY = ["profile", "usage"]'), true);
assert.equal(code.includes('const PROFILE_ACCOUNTS_CHECK_QUERY_KEY = ["accounts", "check"]'), true);
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
assert.equal(code.includes('addEventListener("input", handleInput'), false);
assert.equal(code.includes("installHubVisibilityObserver"), true);
assert.equal(code.includes("isHubEntryNode"), false);
assert.equal(code.includes("contentScrollTop"), true);
assert.equal(code.includes("listScrollTop"), true);
assert.equal(code.includes("installProfileRequestClientPatch"), true);
assert.equal(code.includes("installProfileAuthContextPatch"), true);
assert.equal(code.includes("installProfilePhotoUploadPatch"), true);
assert.equal(code.includes("installElectronBridgeHook"), true);
assert.equal(code.includes("__codexLiveTokenCostProfileLocal"), true);
assert.equal(code.includes("handleProfileFetchResponseEvent"), true);
assert.equal(code.includes("syncOpenProfileAccountMenuIdentity"), false);
assert.equal(code.includes("accountTarget.textContent"), false);
assert.equal(code.includes("data-cltc-profile-account-label"), false);

const listeners = new Map();
const windowListeners = new Map();
const storage = new Map();
const bridgeCalls = [];
const helperFetchCalls = [];
const delayedTimers = [];
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

vm.runInNewContext(priceSourceCode, context, { filename: priceSourcePath });
context.__CODEX_LIVE_TOKEN_COST_PRICES__["gpt-test-data-source"] = { input: 9, cachedInput: 0.9, output: 90 };

vm.runInNewContext(code, context, { filename: scriptPath });

const api = context.__codexLiveTokenCostTest;
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
assert.equal(typeof api.spoofProfileAuthContextValue, "function");
assert.equal(typeof api.patchProfileReactAuthContext, "function");
assert.equal(typeof api.installLocalMessageCapture, "function");
assert.equal(typeof api.localMessageHandler, "function");
assert.equal(typeof api.localProfileResponse, "function");
assert.equal(typeof api.mergeHelperStats, "function");
assert.equal(typeof api.isProfileFetchMessage, "function");
assert.equal(typeof api.extractProfilePhotoDataUrl, "function");
assert.equal(typeof api.applyLocalProfilePhotoUpload, "function");
assert.equal(typeof api.inspectLocalPayload, "function");
assert.equal(typeof api.importLocalUsageTurns, "function");
assert.equal(typeof api.syncCcSwitchUsageFromHelper, "function");
assert.equal(typeof api.refreshProfileData, "function");
assert.equal(typeof api.extractFastMode, "function");
assert.equal(typeof api.collectProfileInvocations, "function");
assert.equal(typeof api.isComposerDraftPayload, "function");
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
assert.equal(typeof api.syncSidebarProfileIdentity, "function");
assert.equal(typeof api.syncVisibleProfilePhotoIdentity, "function");
assert.equal(typeof api.isCodexPlusText, "function");
assert.equal(typeof api.findCodexPlusMenu, "function");
assert.equal(typeof api.ensureHeaderSettingsButton, "function");
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
assert.equal(typeof api.mergeHelperThreadContent, "function");
assert.equal(typeof api.startupBlankConversationSessionKey, "function");
assert.equal(typeof api.rememberSidebarThreadClick, "function");
assert.equal(typeof api.rememberNewConversationClick, "function");
assert.equal(typeof api.migrateLegacyLocationSessionTurns, "function");
assert.equal(typeof api.currentSessionTurns, "function");
assert.equal(typeof api.localProfileThreadCount, "function");
assert.equal(typeof api.localDailyUsage, "function");
assert.equal(typeof api.todayUsage, "function");
assert.equal(typeof api.todayCost, "function");
assert.equal(typeof api.syncCcSwitchFromSettings, "function");
assert.equal(typeof api.ccSwitchSettingsHtml, "function");
assert.equal(typeof api.helperStatusText, "function");
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
assert.equal(api.ccSwitchSettingsHtml().includes('data-misc-field="outputRateVisible" checked'), true);
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
assert.equal(typeof api.refreshUsageAnalyticsFromHelper, "function");
assert.equal(typeof api.localProfileAccountsCheckResponse, "function");
const dataSourcePrice = api.priceFor("gpt-test-data-source");
assert.equal(dataSourcePrice.input, 9);
assert.equal(dataSourcePrice.cachedInput, 0.9);
assert.equal(dataSourcePrice.output, 90);
assert.equal(api.visiblePrices()["gpt-test-data-source"].output, 90);
assert.equal(api.priceModelKey("GPT-TEST-DATA-SOURCE"), "gpt-test-data-source");
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
  ["cc-day", "local-after-import"],
);
const analytics = api.aggregateUsageAnalytics(visibleAnalyticsTurns, {
  startMs: new Date(2026, 6, 11, 0, 0).getTime(),
  endMs: new Date(2026, 6, 11, 23, 59, 59, 999).getTime(),
});
assert.equal(analytics.totalTokens, 155);
assert.equal(analytics.calls, 6);
assert.equal(analytics.input, 130);
assert.equal(analytics.output, 25);
assert.equal(analytics.cacheRead, 46);
assert.equal(analytics.cacheWrite, 14);
assert.equal(analytics.cacheWriteAvailable, true);
assert.equal(analytics.regularInput, 70);
assert.equal(analytics.cacheHitRate, Math.round((46 / 130) * 100));
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
    endMs: new Date(2026, 6, 11, 15, 0).getTime(),
  },
);
assert.equal(futureDatedCcDayAggregate.totalTokens, 120);
assert.equal(futureDatedCcDayAggregate.calls, 3);
const analyticsRollup = api.buildAnalyticsRollup(visibleAnalyticsTurns);
assert.equal(analyticsRollup.days["2026-07-11"].models["gpt-5.6-sol"].calls, 4);
assert.equal(analyticsRollup.days["2026-07-11"].models["unknown-test-model"].usage.cacheWriteTokens, 4);
const analyticsRollupTurns = api.analyticsTurnsFromRollup(analyticsRollup);
assert.equal(analyticsRollupTurns.length, 2);
assert.equal(analyticsRollupTurns.find((turn) => turn.model === "gpt-5.6-sol").callCount, 4);
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
assert.equal(cappedLedger.filter((turn) => turn.source === "codex-live-token-cost").length, 2000);
assert.deepEqual(
  cappedLedger.filter((turn) => turn.source === "cc-switch").map((turn) => turn.turnId),
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
assert.equal(todayBuckets[0].value, 155);
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
assert.equal(dailyOnlyBuckets[0].value, 55);
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
assert.equal(analyticsHtml.includes("总 Token"), true);
assert.equal(analyticsHtml.includes("总花费"), true);
assert.equal(analyticsHtml.includes("模型调用"), true);
assert.equal(analyticsHtml.includes("缓存命中率"), true);
assert.equal(analyticsHtml.includes('data-analytics-chart="true"'), true);
assert.equal(analyticsHtml.includes("cltc-analytics-tooltip"), true);
assert.equal(analyticsHtml.includes('viewBox="0 0 720 230"'), true);
assert.match(analyticsHtml, /data-chart-index="0"[^>]* y="36"/);
assert.match(analyticsHtml, /cltc-analytics-tooltip[\s\S]*?<rect[^>]* y="11"/);
assert.equal(analyticsHtml.includes("Token 构成"), true);
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
assert.equal(context.__codexLiveTokenCost.version, "0.7.7");
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
assert.equal(api.ccSwitchSettingsHtml().includes('data-action="sync-cc-switch"'), true);
assert.equal(api.ccSwitchSettingsHtml().includes("查看脚本"), true);
assert.equal(api.ccSwitchSettingsHtml().includes("数据与显示"), true);
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
assert.equal(savedProfilePrefs.email, "custom@example.com");
assert.equal(savedProfilePrefs.accountStructure, "workspace");
assert.equal(savedProfilePrefs.workspaceName, "Tian Workspace");
assert.equal(savedProfilePrefs.planType, "Team Enterprise");
assert.equal(savedProfilePrefs.planLabel, "Team Enterprise");
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfileDefaultsV1")).email, "custom@example.com");
assert.equal(code.includes("function profileSaveToastHtml()"), true);
assert.equal(code.includes("PROFILE_SAVE_STATUS_DURATION_MS = 1800"), true);
assert.match(code, /\.cltc-settings-overlay \.cltc-profile-save-toast \{[\s\S]*?position: fixed;/);
assert.equal(api.profileSettingsHtml().includes('data-field="profile-save-status"'), false);
assert.equal(api.profileSettingsHtml().includes("官方新版本的账号菜单不再显示邮箱"), true);
assert.equal(api.profileSettingsHtml().includes("这里修改的是本地伪装资料"), true);
assert.equal(api.profileSaveToastHtml().includes('class="cltc-profile-save-toast"'), true);
assert.equal(api.profileSaveToastHtml().includes('role="status"'), true);
assert.equal(api.profileSaveToastHtml().includes('aria-live="polite"'), true);
assert.equal(api.profileSaveToastHtml().includes('data-visible="true"'), true);
assert.equal(api.profileSaveToastHtml().includes('data-tone="success"'), true);
profileEditorFields["[data-profile-field='email']"].value = "";
assert.equal(
  api.saveProfilePrefsFromEditor({
    querySelector(selector) {
      return profileEditorFields[selector] || null;
    },
  }),
  false,
);
assert.equal(api.profileSettingsHtml().includes("邮箱格式无效"), false);
assert.equal(api.profileSaveToastHtml().includes('data-tone="error"'), true);
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "custom@example.com");
api.applyLocalProfilePatch({ email: "sama@openai.com" });
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "custom@example.com");
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfileDefaultsV1")).email, "custom@example.com");
api.applyLocalProfilePatch({ email: "sama@openai.com", planType: "pro_20x" });
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "custom@example.com");
storage.set(
  "__codexLiveTokenCostProfilePrefsV1",
  JSON.stringify({ ...JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")), email: "sama@openai.com" }),
);
api.applyLocalProfilePatch({ planType: "pro_20x" });
assert.equal(JSON.parse(storage.get("__codexLiveTokenCostProfilePrefsV1")).email, "custom@example.com");
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
assert.equal(api.ccSwitchSettingsHtml().includes("显示 HUB"), true);
assert.equal(api.ccSwitchSettingsHtml().includes("cltc-settings-row"), true);
assert.equal(api.ccSwitchSettingsHtml().includes("立即同步"), true);
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
assert.equal(api.mergeHelperThreadContent({ ok: true, threadId: "detected-content-thread", exists: true, hasContent: true, hasMessages: true, hasUsage: false }), true);
assert.equal(api.conversationContentState("detected-content-thread", startupDom()).state, "non_empty");
assert.equal(api.mergeHelperThreadContent({ ok: true, threadId: "detected-empty-thread", exists: true, hasContent: false, hasMessages: false, hasUsage: false }), true);
assert.equal(api.conversationContentState("detected-empty-thread", startupDom()).state, "empty");
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
assert.equal(api.ccSwitchSettingsHtml().includes('data-field="cc-switch-sync-status"'), true);
assert.equal(api.ccSwitchSettingsHtml().includes('data-field="helper-status"'), true);
assert.equal(api.ccSwitchSettingsHtml().includes("Helper 可选"), true);
Promise.resolve(api.syncCcSwitchUsageFromHelper()).then((result) => {
  assert.equal(result.ok, false);
  assert.equal(result.helperUnavailable, true);
});
assert.equal(api.helperStatusText().includes("无法同步 CC Switch"), true);
assert.equal(api.ccSwitchSettingsHtml().includes('data-helper-unavailable="true"'), true);
assert.equal(api.ccSwitchSettingsHtml().includes("今日统计仅使用本地捕获"), true);
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
assert.equal(api.priceFor("gpt-5.6-sol").input, 5);
assert.equal(api.priceFor("gpt-5.6-sol").cachedInput, 0.5);
assert.equal(api.priceFor("gpt-5.6-sol").cacheWrite, 6.25);
assert.equal(api.priceFor("gpt-5.6-sol").output, 30);
assert.equal(api.priceFor("gpt-5.6-terra").input, 2.5);
assert.equal(api.priceFor("gpt-5.6-terra").cachedInput, 0.25);
assert.equal(api.priceFor("gpt-5.6-terra").cacheWrite, 3.125);
assert.equal(api.priceFor("gpt-5.6-terra").output, 15);
assert.equal(api.priceFor("gpt-5.6-luna").input, 1);
assert.equal(api.priceFor("gpt-5.6-luna").cachedInput, 0.1);
assert.equal(api.priceFor("gpt-5.6-luna").cacheWrite, 1.25);
assert.equal(api.priceFor("gpt-5.6-luna").output, 6);
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
assert.equal(spoofedProfileAccount.account.structure, "personal");
assert.equal(spoofedProfileAccount.account.plan_type, "pro_20x");
const spoofedAccountsCheck = api.spoofProfileAccountsCheckPayload({
  account_ordering: ["acc-personal"],
  accounts: [{ id: "acc-personal", type: "chatgpt", structure: "workspace", name: "Workspace" }],
});
assert.equal(spoofedAccountsCheck.account_ordering[0], "acc-personal");
assert.equal(spoofedAccountsCheck.accounts[0].structure, "personal");
assert.equal(spoofedAccountsCheck.accounts[0].plan_type, "pro_20x");
const localAccountsCheck = api.localProfileAccountsCheckResponse();
assert.equal(localAccountsCheck.account_ordering.length, 1);
assert.equal(localAccountsCheck.account_ordering[0], "local-profile-account");
assert.equal(localAccountsCheck.accounts[0].structure, "personal");
profileEditorFields["[data-profile-field='accountStructure']"].value = "workspace";
profileEditorFields["[data-profile-field='workspaceName']"].value = "OpenAI Workspace";
assert.equal(api.saveProfilePrefsFromEditor({
  querySelector(selector) {
    return profileEditorFields[selector] || null;
  },
}), true);
const workspaceAccountsCheck = api.localProfileAccountsCheckResponse();
assert.equal(workspaceAccountsCheck.accounts[0].structure, "workspace");
assert.equal(workspaceAccountsCheck.accounts[0].name, "OpenAI Workspace");
const workspaceProfile = api.localProfileResponse().profile;
assert.equal(workspaceProfile.display_name, "Local Usage");
const workspaceAuth = api.spoofProfileAuthContextValue({ authMethod: "apikey" });
assert.equal(workspaceAuth.authMethod, "chatgpt");
assert.equal(workspaceAuth.email, "sama@openai.com");
const currentReact = { useContext() {} };
assert.equal(
  api.profileReactAssetUrl([
    "app://-/assets/react-dom-client-test.js",
    "app://-/assets/react-CELMljbn.js",
  ]),
  "app://-/assets/react-CELMljbn.js",
);
assert.equal(api.profileReactFromModule({ t: () => currentReact }), currentReact);
const currentAuthContext = { Provider: {}, Consumer: {}, _currentValue: undefined, _currentValue2: undefined };
const currentAuthNonceContext = { Provider: {}, Consumer: {}, _currentValue: null, _currentValue2: null };
assert.equal(api.profileAuthContextFromModule({ c: currentAuthContext, o: currentAuthNonceContext }), currentAuthContext);
assert.equal(api.profileAuthContextFromModule({ l: currentAuthContext }), currentAuthContext);
const sidebarProfileName = {
  className: "min-w-0 flex-1 truncate",
  textContent: "雪天",
  querySelector() {
    return null;
  },
};
const sidebarProfileButton = {
  innerText: "雪天",
  textContent: "雪天",
  getAttribute(name) {
    return name === "aria-label" ? "打开个人资料菜单" : "";
  },
  getBoundingClientRect() {
    return { top: 704, left: 8, width: 252, height: 29 };
  },
  querySelector() {
    return null;
  },
  querySelectorAll(selector) {
    return selector === "span" ? [sidebarProfileName] : [];
  },
};
assert.equal(api.syncSidebarProfileIdentity({
  defaultView: { innerHeight: 742 },
  querySelector(selector) {
    return selector.includes("打开个人资料菜单") ? sidebarProfileButton : null;
  },
}), false);
assert.equal(sidebarProfileName.textContent, "雪天");
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
assert.equal(api.priceFor("gpt-5.6-sol").cacheWrite, 6.25);
assert.equal(api.priceFor("custom-migration-model").input, 7);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.4-nano"), true);
assert.equal(api.cleanupAutoZeroPriceModels(), false);
assert.equal(api.deletePriceForModel("gpt-5.4-nano"), true);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "gpt-5.4-nano"), false);
const hiddenNanoCost = api.costForModelUsage({ input: 1, output: 0, cached: 0, total: 1 }, "gpt-5.4-nano", { ensure: true });
assert.equal(hiddenNanoCost.hidden, true);
assert.equal(hiddenNanoCost.priced, true);
assert.equal(api.costPricedLabel(hiddenNanoCost, { input: 1, output: 0, cached: 0, total: 1 }), "");
assert.equal(api.restoreDefaultPrices(), true);
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
assert.equal(context.__codexLiveTokenCost.setModelPrice("zero-price-model", { input: 0, cachedInput: 0, output: 0 }), false);
assert.equal(Object.hasOwn(context.__codexLiveTokenCost.prices(), "zero-price-model"), false);
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
assert.equal(pricedZeroTurnCost.value, ((800 * 5 + 200 * 0.5 + 100 * 30) / 1_000_000));
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
assert.equal(api.restoreDefaultPrices(), true);
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
  (500 * 5 + 200 * 0.5 + 300 * 6.25 + 100 * 30) / 1_000_000,
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
const dataSourceFastCost = api.costForModelUsage(baseFastUsage, "gpt-test-data-source", { fastMode: true });
assert.equal(dataSourceFastCost.value, api.costForModelUsage(baseFastUsage, "gpt-test-data-source").value);
assert.equal(api.isCodexPlusText("Codex++"), true);
assert.equal(api.isCodexPlusText("Codex Token Cost 设置"), false);
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
  account: { type: "apiKey", planType: "api" },
  requiresOpenaiAuth: true,
});
assert.equal(spoofed.account.type, "chatgpt");
assert.equal(spoofed.requiresOpenaiAuth, false);
assert.equal(spoofed.account.planType, "pro_20x");
assert.equal(spoofed.account.email, "sama@openai.com");
const spoofedAuth = api.spoofProfileAuthContextValue({ authMethod: "apikey", isLoading: true, setAuthMethod() {} });
assert.equal(spoofedAuth.authMethod, "chatgpt");
assert.equal(spoofedAuth.requiresAuth, true);
assert.equal(spoofedAuth.accountId, "local-profile-account");
assert.equal(spoofedAuth.userId, "local-profile-user");
assert.equal(spoofedAuth.isLoading, false);
assert.equal(spoofedAuth.planAtLogin, "pro_20x");
const authContext = { name: "auth" };
const otherContext = { name: "other" };
const react = {
  useContext(context) {
    return context === authContext ? { authMethod: "apikey" } : "other-value";
  },
};
assert.equal(api.patchProfileReactAuthContext(react, authContext), true);
assert.equal(react.useContext(authContext).authMethod, "chatgpt");
assert.equal(react.useContext(otherContext), "other-value");
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
const profileAndHelperTest = Promise.resolve()
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
assert.equal(spoofedNamed.account.name, "Tian Envelope");
assert.equal(spoofedNamed.account.displayName, "Tian Envelope");
const spoofedChatgptNamed = api.spoofProfileAccountPayload({
  account: { type: "chatgpt", name: "设置", displayName: "设置", imageUrl: "" },
  requiresOpenaiAuth: true,
});
assert.equal(spoofedChatgptNamed.account.name, "Tian Envelope");
assert.equal(spoofedChatgptNamed.account.displayName, "Tian Envelope");
assert.equal(spoofedChatgptNamed.requiresOpenaiAuth, false);
const spoofedNamedAuth = api.spoofProfileAuthContextValue({ authMethod: "apikey" });
assert.equal(spoofedNamedAuth.displayName, "Tian Envelope");
assert.equal(spoofedNamedAuth.account.displayName, "Tian Envelope");

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
const beforeCcThreadProfile = api.localProfileResponse();
api.importLocalUsageTurns(
  [
    {
      turnId: "cc-switch:request-count-is-not-thread-count",
      source: "cc-switch",
      importSource: "cc-switch",
      model: "gpt-5.5",
      createdAt: "2026-07-04T12:00:00.000Z",
      callCount: 47091,
      usage: { input_tokens: 47091, output_tokens: 1, total_tokens: 47092 },
    },
  ],
  { replaceSource: "cc-switch" },
);
const afterCcThreadProfile = api.localProfileResponse();
assert.equal(afterCcThreadProfile.stats.total_threads, beforeCcThreadProfile.stats.total_threads);
const mergedCcDay = api.localDailyUsage().get("2026-07-04");
assert.equal(mergedCcDay.tokens, 47092);
const hubRealtimeToday = api.localDailyUsage({ includeLocalWithCcDates: true }).get("2026-07-04");
assert.equal(hubRealtimeToday.tokens, 47092);
const profileRealtimeDay = afterCcThreadProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-07-04");
assert.equal(profileRealtimeDay.tokens, 47092);
assert.equal(api.todayUsage().total, 47092);

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
assert.equal(api.todayUsage().total, 47092);
assert.equal(activityProfile.stats.fast_mode_usage_percentage, 67);
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
assert.equal(splitActivityProfile.stats.fast_mode_usage_percentage, 32);
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
api.mergeHelperStats({
  stats: {
    unique_skills_used: 4,
    total_skills_used: 9,
    total_threads: 42,
    codex_threads: { total_threads: 42, source: "sqlite" },
    top_invocations: [
      { type: "plugin", plugin_id: "$github", plugin_name: "$GitHub", usage_count: 3 },
      { type: "skill", skill_id: "systematic-debugging", skill_name: "systematic-debugging", usage_count: 2 },
    ],
    top_plugins: [{ type: "plugin", plugin_id: "$github", plugin_name: "$GitHub", usage_count: 3 }],
  },
});
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
      turnId: "cc-switch:2026-06-01:gpt-5.5",
      importSource: "cc-switch",
      source: "cc-switch",
      model: "gpt-5.5",
      createdAt: "2026-06-01T12:00:00.000Z",
      durationMs: 62000,
      callCount: 3,
      usage: { input: 100, output: 20, cached: 40, total: 120 },
      costUsd: 1.23,
    },
    {
      turnId: "cc-switch:2026-06-15:gpt-5.5",
      importSource: "cc-switch",
      source: "cc-switch",
      model: "gpt-5.5",
      createdAt: "2026-06-15T12:00:00.000Z",
      callCount: 4,
      usage: { input: 1700, output: 600, cached: 250, total: 2300 },
    },
  ],
  { replaceSource: "cc-switch" },
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
const ccSwitchDedupeDay = importedProfile.stats.daily_usage_buckets.find((day) => day.start_date === "2026-06-15");
assert.equal(ccSwitchDedupeDay.tokens, 5500);
assert.equal(ccSwitchDedupeDay.requests, 4);
const ccSwitchResidual = api.localUsageExport().turns.find((turn) => turn.turnId === "cc-switch:2026-06-15:gpt-5.5");
assert.equal(JSON.stringify(ccSwitchResidual.usage), JSON.stringify({ input: 1700, output: 600, cached: 250, total: 2300, exact: true }));
assert.equal(ccSwitchResidual.callCount, 4);
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
assert.equal(finalStreamProfile.stats.lifetime_tokens, beforeFinalStreamProfile.stats.lifetime_tokens);
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
const spoofedChatgptPhoto = api.spoofProfileAccountPayload({
  account: { type: "chatgpt", name: "设置", imageUrl: "" },
});
assert.equal(spoofedChatgptPhoto.account.imageUrl, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.image, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.avatar, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.profileImageUrl, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.profilePictureUrl, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.profilePhotoUrl, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.photoUrl, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(spoofedChatgptPhoto.account.profile_picture_url, "data:image/png;base64,UE5HREFUQQ==");
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
const nameSpan = fakeSpan("设置", "truncate text-base leading-5");
const planSpan = fakeSpan("Plus", "truncate text-xs leading-4 text-token-text-tertiary");
const sidebarButton = {
  innerText: "设\n设置\nPlus",
  textContent: "设\n设置\nPlus",
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
assert.equal(api.syncSidebarProfileIdentity(sidebarDoc), true);
assert.equal(nameSpan.textContent, "设置");
assert.equal(planSpan.textContent, "Plus");
assert.equal(sidebarAvatarImage.src, "data:image/png;base64,UE5HREFUQQ==");
assert.equal(sidebarAvatarImage.alt, "T");
assert.equal(sidebarAvatarImage.style.display, undefined);
assert.equal(avatarSpan.textContent, "设");
assert.equal(avatarSpan.style.backgroundImage, undefined);
assert.equal(api.syncSidebarProfileIdentity(sidebarDoc), true);
assert.equal(avatarSpan.children.length, 1);
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
assert.equal(api.syncVisibleProfilePhotoIdentity(profilePhotoDoc), false);
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
assert.equal(
  api.syncSidebarProfileIdentity({
    defaultView: { innerHeight: 1080 },
    querySelectorAll(selector) {
      return selector.includes("aside button") ? [settingsSidebarButton] : [];
    },
    createElement(tagName) {
      return fakeNode(tagName, "", "", { left: 0, top: 0, width: 0, height: 0 });
    },
  }),
  false,
);
assert.equal(settingsSidebarButton.textContent, "Chat 设置");
function headerNode(tagName, textContent = "") {
  return {
    tagName: tagName.toUpperCase(),
    textContent,
    children: [],
    parentElement: null,
    attributes: new Map(),
    style: {},
    get nextSibling() {
      if (!this.parentElement) return null;
      const index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index + 1] || null;
    },
    get previousSibling() {
      if (!this.parentElement) return null;
      const index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index - 1] || null;
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    addEventListener(type, handler) {
      this[`on${type}`] = handler;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 96, height: 30, right: 96, bottom: 30 };
    },
    appendChild(child) {
      if (child.parentElement) {
        const oldIndex = child.parentElement.children.indexOf(child);
        if (oldIndex >= 0) child.parentElement.children.splice(oldIndex, 1);
      }
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    remove() {
      if (!this.parentElement) return;
      const index = this.parentElement.children.indexOf(this);
      if (index >= 0) this.parentElement.children.splice(index, 1);
      this.parentElement = null;
    },
  };
}
const headerParent = headerNode("div");
const plusMenu = headerNode("button", "Codex++");
plusMenu.id = "codex-plus-menu";
headerParent.children.push(plusMenu);
plusMenu.parentElement = headerParent;
headerParent.insertBefore = function insertBefore(child, reference) {
  if (child.parentElement) {
    const oldIndex = child.parentElement.children.indexOf(child);
    if (oldIndex >= 0) child.parentElement.children.splice(oldIndex, 1);
  }
  const index = reference ? this.children.indexOf(reference) : -1;
  const insertAt = index >= 0 ? index : this.children.length;
  this.children.splice(insertAt, 0, child);
  child.parentElement = this;
  return child;
};
const headerDoc = {
  getElementById(id) {
    return id === "codex-plus-menu" ? plusMenu : null;
  },
  querySelectorAll() {
    return [];
  },
  createElement(tagName) {
    return headerNode(tagName);
  },
};
assert.equal(api.findCodexPlusMenu(headerDoc), plusMenu);
const settingsButton = api.ensureHeaderSettingsButton(headerDoc);
assert.equal(settingsButton.id, "codex-live-token-cost-settings");
assert.equal(String(settingsButton.className).includes("no-drag"), true);
assert.equal(String(settingsButton.className).includes("cursor-interaction"), true);
assert.equal(settingsButton.previousSibling, plusMenu);
assert.equal(settingsButton.textContent.startsWith("今日 "), true);
assert.equal(settingsButton.textContent.includes("$"), false);
assert.equal(settingsButton.getAttribute("aria-label"), "打开 Codex Token Cost 设置");
assert.equal(api.ensureHeaderSettingsButton(headerDoc), settingsButton);
assert.equal(headerParent.children.filter((child) => child.id === "codex-live-token-cost-settings").length, 1);
const noIdHeaderParent = headerNode("div");
const noIdPlusMenu = headerNode("button", "Codex++");
noIdHeaderParent.children.push(noIdPlusMenu);
noIdPlusMenu.parentElement = noIdHeaderParent;
noIdHeaderParent.insertBefore = headerParent.insertBefore;
const noIdHeaderDoc = {
  getElementById() {
    return null;
  },
  querySelectorAll() {
    return [noIdPlusMenu];
  },
  createElement(tagName) {
    return headerNode(tagName);
  },
};
assert.equal(api.findCodexPlusMenu(noIdHeaderDoc), noIdPlusMenu);
assert.equal(api.ensureHeaderSettingsButton(noIdHeaderDoc), settingsButton);
assert.equal(settingsButton.previousSibling, noIdPlusMenu);
assert.equal(noIdHeaderParent.children.filter((child) => child.id === "codex-live-token-cost-settings").length, 1);
noIdPlusMenu.remove();
assert.equal(api.ensureHeaderSettingsButton(noIdHeaderDoc), settingsButton);
assert.equal(settingsButton.parentElement, noIdHeaderParent);
assert.equal(noIdHeaderParent.children.includes(settingsButton), true);
const floatingHtml = headerNode("html");
const floatingBody = headerNode("body");
const floatingMenu = headerNode("div", "Codex++ 1.2.32");
floatingMenu.id = "codex-plus-menu";
floatingMenu.className = "codex-plus-menu-floating";
floatingMenu.getBoundingClientRect = () => ({ left: 1644, top: 0, width: 138, height: 36, right: 1782, bottom: 36 });
floatingHtml.children.push(floatingMenu);
floatingMenu.parentElement = floatingHtml;
const floatingDoc = {
  body: floatingBody,
  documentElement: floatingHtml,
  defaultView: { innerWidth: 1922 },
  getElementById(id) {
    return id === "codex-plus-menu" ? floatingMenu : null;
  },
  querySelectorAll() {
    return [];
  },
  createElement(tagName) {
    return headerNode(tagName);
  },
};
assert.equal(api.ensureHeaderSettingsButton(floatingDoc), settingsButton);
assert.equal(settingsButton.parentElement, floatingBody);
assert.equal(settingsButton.getAttribute("data-floating"), "true");
assert.equal(settingsButton.style.left, "1544px");
assert.equal(settingsButton.style.top, "3px");
api.applyLocalProfilePatch({ email: "local@example.com", planType: "business" });
const businessProfile = api.localProfileResponse().profile;
assert.equal(businessProfile.email, "local@example.com");
assert.equal(businessProfile.plan_type, "business");
assert.equal(businessProfile.plan_label, "Business");
const spoofedBusiness = api.spoofProfileAccountPayload({ account: { type: "apiKey", planType: "api" } });
assert.equal(spoofedBusiness.account.email, "local@example.com");
assert.equal(spoofedBusiness.account.planType, "business");
api.applyLocalProfilePatch({ planType: "Team Enterprise", planLabel: "Team Enterprise" });
const customPlanProfile = api.localProfileResponse().profile;
assert.equal(customPlanProfile.plan_type, "Team Enterprise");
assert.equal(customPlanProfile.plan_label, "Team Enterprise");
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
  assert.equal(value.account.type, "chatgpt");
});
Promise.resolve({ plain: true }).then((value) => {
  assert.deepEqual(value, { plain: true });
});

const profileClient = {
  async safeGet() {
    throw new Error("Unauthorized");
  },
  async safePatch() {
    throw new Error("Unauthorized");
  },
};
assert.equal(api.patchProfileRequestClient(profileClient), true);
context.fetch = async function helperStatsFetch(url) {
  helperFetchCalls.push(String(url));
  return {
    ok: true,
    async json() {
      return {
        stats: {
          unique_skills_used: 6,
          total_skills_used: 12,
          unique_plugins_used: 2,
          total_plugins_used: 7,
          top_plugins: [{ type: "plugin", plugin_id: "github", plugin_name: "GitHub", usage_count: 7 }],
          top_invocations: [{ type: "plugin", plugin_id: "github", plugin_name: "GitHub", usage_count: 7 }],
        },
      };
    },
  };
};
api.mergeHelperStats({
  stats: {
    unique_skills_used: 1,
    total_skills_used: 1,
    unique_plugins_used: 1,
    total_plugins_used: 1,
    top_plugins: [{ type: "plugin", plugin_id: "old", plugin_name: "Old", usage_count: 1 }],
  },
});
const helperRefreshRequestsBeforeDuplicateMerge = api.profileUsageRefreshRequests();
api.mergeHelperStats({
  stats: {
    unique_skills_used: 1,
    total_skills_used: 1,
    unique_plugins_used: 1,
    total_plugins_used: 1,
    top_plugins: [{ type: "plugin", plugin_id: "old", plugin_name: "Old", usage_count: 1 }],
  },
});
assert.equal(api.profileUsageRefreshRequests(), helperRefreshRequestsBeforeDuplicateMerge);
const profileLifecycleTest = Promise.resolve()
  .then(() => profileClient.safeGet("/wham/profiles/me"))
  .then((patchedGet) => {
    const helperBridgeUrls = bridgeCalls.map((message) => String(message.url || "")).filter(Boolean);
    assert.equal(helperBridgeUrls.some((url) => url === "http://127.0.0.1:17888/stats?refresh=1"), false);
    assert.equal(helperBridgeUrls.some((url) => url === "http://127.0.0.1:17888/cc-switch/turns?refresh=1"), true);
    assert.equal(patchedGet.stats.unique_skills_used, 2);
    assert.equal(patchedGet.stats.total_skills_used, 2);
    assert.equal(
      JSON.stringify(patchedGet.stats.top_plugins),
      JSON.stringify([{ type: "plugin", plugin_id: "plugin-1", plugin_name: "GitHub", usage_count: 1 }]),
    );
    assert.equal(patchedGet.stats.most_used_plugin_usage_count, 1);
    assert.equal(patchedGet.profile.display_name, "Tian Envelope");
    const helperRefreshRequestsBeforeNewStats = api.profileUsageRefreshRequests();
    api.mergeHelperStats({
      stats: {
        unique_skills_used: 6,
        total_skills_used: 12,
        unique_plugins_used: 2,
        total_plugins_used: 7,
        top_plugins: [{ type: "plugin", plugin_id: "github", plugin_name: "GitHub", usage_count: 7 }],
        top_invocations: [{ type: "plugin", plugin_id: "github", plugin_name: "GitHub", usage_count: 7 }],
      },
    });
    assert.equal(api.profileUsageRefreshRequests(), helperRefreshRequestsBeforeNewStats);
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
assert.equal(context.__codexLiveTokenCostMessageCapture, "0.7.7");
    context.document.getElementById = () => null;
    context.__codexLiveTokenCost.destroy();
    assert.equal((windowListeners.get("message") || []).includes(localMessageHandler), false);
    assert.equal(context.__codexLiveTokenCostMessageCapture, undefined);
  })
  .then(async () => {
    const originalLocation = context.location;
    const originalBridge = context.electronBridge;
    const originalFetch = context.fetch;
    const originalSetTimeout = context.setTimeout;
    const profileRefreshCalls = [];
    const profileCcResponses = [
      { ok: true, refreshing: true, turns: [] },
      {
        ok: true,
        refreshing: false,
        turns: [
          {
            turnId: "cc-switch:2026-07-13:gpt-5.5",
            source: "cc-switch",
            importSource: "cc-switch",
            model: "gpt-5.5",
            createdAt: "2026-07-13T12:00:00.000Z",
            usage: { input: 2, output: 1, cached: 0, total: 3 },
          },
        ],
      },
    ];
    context.location = { pathname: "/", href: "http://localhost/", protocol: "http:", origin: "http://localhost" };
    context.electronBridge = {
      sendMessageFromView() {
        return Promise.reject(new Error("bridge unavailable"));
      },
    };
    context.document.getElementById = () => ({});
    context.fetch = async function profileRefreshFetch(url) {
      const text = String(url);
      profileRefreshCalls.push(text);
      const queue = profileCcResponses;
      return { ok: true, async json() { return queue.shift() || queue.at(-1); } };
    };
    context.setTimeout = function immediateRefreshTimer(handler) {
      if (typeof handler === "function") handler();
      return 1;
    };
    const firstProfileRefresh = api.refreshProfileData({ force: true, pollIntervalMs: 0, maxPolls: 2 });
    const secondProfileRefresh = api.refreshProfileData({ force: true, pollIntervalMs: 0, maxPolls: 2 });
    assert.strictEqual(firstProfileRefresh, secondProfileRefresh);
    const profileRefreshResult = await firstProfileRefresh;
    assert.equal(profileRefreshResult.ok, true);
    assert.equal(profileRefreshResult.helperStats, false);
    assert.equal(profileRefreshResult.ccSwitch.ok, true);
    assert.equal(profileRefreshCalls.filter((url) => url.endsWith("/cc-switch/turns?refresh=1")).length, 1);
    assert.equal(profileRefreshCalls.filter((url) => url.endsWith("/cc-switch/turns")).length, 1);
    assert.equal(api.localProfileResponse().stats.unique_skills_used, 2);
    assert.equal(api.localProfileResponse().stats.total_skills_used, 2);

    context.location = originalLocation;
    context.fetch = async function blockedAppFetch(url) {
      helperFetchCalls.push(String(url));
      throw new Error("CSP blocked");
    };
    context.setTimeout = function testHelperRetryTimer(handler, delay = 0) {
      if (delay < 2000) {
        if (typeof handler === "function") handler();
        return 1;
      }
      return originalSetTimeout(handler, delay);
    };
    let bridgeAttempts = 0;
    context.electronBridge = {
      sendMessageFromView(message) {
        bridgeAttempts += 1;
        if (bridgeAttempts === 1) return Promise.reject(new Error("bridge warming up"));
        context.postMessage({
          type: "fetch-response",
          requestId: message.requestId,
          responseType: "success",
          status: 200,
          bodyJsonString: JSON.stringify({ ok: true, stats: { total_skills_used: 3 } }),
        }, "app://-/index.html");
        return Promise.resolve();
      },
    };
    const helperFetchCallsBeforeRetry = helperFetchCalls.length;
    let retryPayload;
    try {
      retryPayload = await api.helperJson("http://127.0.0.1:17888/stats");
    } catch (error) {
      retryPayload = { error: error.message };
    }
    context.electronBridge = originalBridge;
    context.fetch = originalFetch;
    context.setTimeout = originalSetTimeout;
    assert.equal(retryPayload.ok, true);
    assert.equal(retryPayload.stats.total_skills_used, 3);
    assert.equal(bridgeAttempts, 2);
    assert.equal(helperFetchCalls.length, helperFetchCallsBeforeRetry);

    context.location = { pathname: "/", href: "http://localhost/", protocol: "http:", origin: "http://localhost" };
    context.electronBridge = {
      sendMessageFromView() {
        return Promise.reject(new Error("bridge unavailable"));
      },
    };
    context.fetch = async function missingCcDatabaseFetch() {
      return { ok: true, async json() { return { ok: true, error: "missing_db", turns: [] }; } };
    };
    const missingCcDatabaseSync = await api.syncCcSwitchUsageFromHelper({ refresh: false });
    assert.equal(missingCcDatabaseSync.ok, false);
    assert.equal(missingCcDatabaseSync.error, "missing_db");
    assert.equal(missingCcDatabaseSync.helperUnavailable, true);
    assert.match(api.helperStatusText(), /CC Switch 同步不可用/);
    context.location = originalLocation;
    context.electronBridge = originalBridge;
    context.fetch = originalFetch;
  });

profileLifecycleTest.then(async () => {
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
        turnId: "cc-switch:2026-07-04:baseline",
        source: "cc-switch",
        importSource: "cc-switch",
        model: "gpt-5.5",
        createdAt: "2026-07-04T12:00:00.000Z",
        callCount: 5,
        usage: { input: 40000, output: 7092, cached: 20000, total: 47092 },
      },
      {
        turnId: "cc-switch:2026-07-05:smaller",
        source: "cc-switch",
        importSource: "cc-switch",
        model: "gpt-5.5",
        createdAt: "2026-07-05T12:00:00.000Z",
        callCount: 4,
        usage: { input: 30000, output: 8000, cached: 10000, total: 38000 },
      },
    ],
    { replaceSource: "cc-switch" },
  );
  const localLargerDay = api.localDailyUsage().get("2026-07-05");
  assert.equal(localLargerDay.tokens, 50000);
  assert.equal(localLargerDay.requests, 6);

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
  const messageTurnInvocations = api.localUsageExport().currentTurn.invocations;
  assert.equal(messageTurnInvocations.some((item) => item.plugin_id === "chrome_devtools"), true);
  assert.equal(messageTurnInvocations.some((item) => item.skill_id === "systematic-debugging"), true);
  api.rememberLocalUsage(
    { input_tokens: 8, output_tokens: 2, total_tokens: 10 },
    "message",
    {},
    { sessionKey: messageInvocationSession, persist: true },
  );
  api.finishLocalTurn(0, { reason: "profile-ledger-message-invocation-complete", force: true, sessionKey: messageInvocationSession });
  const messageInvocationProfile = api.localProfileResponse();
  assert.equal(
    messageInvocationProfile.stats.top_plugins.find((item) => item.plugin_id === "chrome_devtools")?.usage_count,
    1,
  );
  assert.equal(
    messageInvocationProfile.stats.top_invocations.find((item) => item.skill_id === "systematic-debugging")?.usage_count,
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
}).catch((error) => {
  setImmediate(() => {
    throw error;
  });
});
