// ==UserScript==
// @name         Codex Live Token Cost
// @namespace    codex-plus-plus
// @version      0.6.0
// @description  在 Codex 输入框上方显示 Token 与金额，解锁官方个人资料页并替换为本地统计；通过设置按钮管理价格和伪装资料。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "0.6.0";
  const ROOT_ID = "codex-live-token-cost";
  const SETTINGS_BUTTON_ID = "codex-live-token-cost-settings";
  const STYLE_ID = "codex-live-token-cost-style";
  const CODEX_PLUS_MENU_ID = "codex-plus-menu";
  const OFFICIAL_MODEL_TRIGGER_SELECTOR = "[data-codex-intelligence-trigger='true']";
  const PRICE_OVERRIDES_KEY = "__codexLiveTokenCostPriceOverridesV1";
  const HIDDEN_PRICE_MODELS_KEY = "__codexLiveTokenCostHiddenPriceModelsV1";
  const DAILY_USAGE_KEY = "__codexLiveTokenCostDailyUsageV1";
  const LOCAL_USAGE_KEY = "__codexLiveTokenCostLocalUsageV1";
  const PROFILE_PREFS_KEY = "__codexLiveTokenCostProfilePrefsV1";
  const PROFILE_OVERRIDES_KEY = "__codexLiveTokenCostProfileOverridesV1";
  const PROFILE_DEFAULTS_KEY = "__codexLiveTokenCostProfileDefaultsV1";
  const HUB_VISIBLE_KEY = "__codexLiveTokenCostHubVisibleV1";
  const PROFILE_GATE_ID = "2478676115";
  const PROFILE_USAGE_QUERY_KEY = ["profile", "usage"];
  const LOCAL_PROFILE_ACCOUNT_ID = "local-profile-account";
  const LOCAL_PROFILE_USER_ID = "local-profile-user";
  const LOCAL_PROFILE_PLAN = "pro_20x";
  const LOCAL_PROFILE_EMAIL = "sama@openai.com";
  const PROFILE_PLAN_OPTIONS = [
    { value: "free", label: "Free" },
    { value: "go", label: "Go" },
    { value: "plus", label: "Plus" },
    { value: "pro_5x", label: "Pro 5x" },
    { value: "pro_20x", label: "Pro 20x" },
    { value: "business", label: "Business" },
    { value: "enterprise", label: "Enterprise" },
    { value: "edu", label: "Edu" },
    { value: "staff", label: "Staff" },
    { value: "founder", label: "Founder" },
  ];
  const PROFILE_IMAGE_MAX_LENGTH = 8_000_000;
  const PROFILE_HEATMAP_BASE_START = "2025-07-13";
  const PROFILE_HEATMAP_MAX_COLUMNS = 52;
  const LOCAL_LEDGER_LIMIT = 2000;
  const UNKNOWN_MODEL = "未知";
  const FAST_MODE_ICON_PATH =
    "M9.80999 17.8302C9.49666 18.1969 9.08999 18.3869 8.58999 18.4002C8.09666 18.4136 7.69666 18.2436 7.38999 17.8902C7.08999 17.5436 7.02666 17.0636 7.19999 16.4502L8.06999 13.2902H3.89999C3.43333 13.2902 3.06999 13.1602 2.80999 12.9002C2.55666 12.6336 2.42999 12.3136 2.42999 11.9402C2.42999 11.5602 2.55666 11.2169 2.80999 10.9102L10.16 2.18022C10.4733 1.81356 10.8767 1.62356 11.37 1.61022C11.87 1.59689 12.27 1.76689 12.57 2.12022C12.8767 2.47356 12.9433 2.95356 12.77 3.56023L11.87 6.78023H16.05C16.51 6.78023 16.87 6.91356 17.13 7.18023C17.3967 7.44023 17.53 7.76023 17.53 8.14023C17.53 8.52023 17.4 8.86023 17.14 9.16023L9.80999 17.8302ZM15.89 8.50023C15.93 8.44689 15.95 8.39356 15.95 8.34023C15.9567 8.28689 15.94 8.24356 15.9 8.21023C15.86 8.17023 15.8033 8.15023 15.73 8.15023H11.1C10.9133 8.15023 10.7533 8.10356 10.62 8.01023C10.4933 7.91689 10.4067 7.79023 10.36 7.63023C10.3133 7.47023 10.3167 7.29023 10.37 7.09023L11.33 3.62022C11.3567 3.52022 11.3467 3.44356 11.3 3.39022C11.2533 3.33022 11.19 3.30356 11.11 3.31022C11.0367 3.31689 10.9733 3.35356 10.92 3.42023L4.04999 11.5702C4.00999 11.6236 3.98666 11.6769 3.97999 11.7302C3.97999 11.7836 3.99999 11.8269 4.03999 11.8602C4.07999 11.8936 4.13999 11.9102 4.21999 11.9102H8.78999C9.00333 11.9102 9.17666 11.9569 9.30999 12.0502C9.44999 12.1436 9.54333 12.2736 9.58999 12.4402C9.63666 12.6002 9.63333 12.7802 9.57999 12.9802L8.63999 16.3902C8.61333 16.4902 8.62333 16.5702 8.66999 16.6302C8.71666 16.6836 8.77666 16.7069 8.84999 16.7002C8.92999 16.6936 8.99666 16.6602 9.04999 16.6002L15.89 8.50023Z";
  const RENDER_THROTTLE_MS = 250;
  const HELPER_STATS_URL = "http://127.0.0.1:17888/stats";
  const HELPER_STATS_REFRESH_URL = `${HELPER_STATS_URL}?refresh=1`;
  const CC_SWITCH_TURNS_URL = "http://127.0.0.1:17888/cc-switch/turns";
  const HELPER_GITHUB_URL = "https://github.com/Tianzora/codex-token-cost/blob/main/scripts/codex-local-usage-helper.cjs";
  const HELPER_STATUS_DEFAULT = "Helper 可选：未连接时使用本地捕获数据；CC Switch 同步、Codex SQLite 线程数、技能/插件统计会不可用。";
  const HELPER_STATUS_CONNECTED = "Helper 已连接：CC Switch 同步、Codex SQLite 线程数、技能/插件统计可用。";
  const HELPER_STATUS_DEGRADED = "Helper 未运行：已降级为本地捕获数据；CC Switch 同步、Codex SQLite 线程数、技能/插件统计不可用。";
  const HELPER_STATUS_CC_SWITCH_DEGRADED = "Helper 未运行：无法同步 CC Switch；今日统计仅使用本地捕获与已有本地记录。";
  const SHIMMER_DELAY_MS = 600;
  const SHIMMER_ACTIVE_MS = 1000;
  const SHIMMER_INTERVAL_MS = 4000;
  const FAST_MODE_COST_MULTIPLIERS = [
    { pattern: /^gpt-5\.5(?:$|[-_.])/, multiplier: 2.5 },
    { pattern: /^gpt-5\.4(?:$|[-_.])/, multiplier: 2 },
  ];
  const PRICE_DATA_SOURCE_KEY = "__CODEX_LIVE_TOKEN_COST_PRICES__";

  // Fallback USD / 1M tokens used when the optional price data source is absent.
  const FALLBACK_DEFAULT_PRICES = {
    "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
    "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
    "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
    "gpt-5.5-pro": { input: 30, cachedInput: null, output: 180 },
  };
  const DEFAULT_PRICES = loadDefaultPrices();

  if (window.__codexLiveTokenCostVersion && window.__codexLiveTokenCostVersion !== VERSION) {
    try {
      window.__codexLiveTokenCost?.destroy?.();
    } catch {
      // A stale userscript should not block the new version from loading.
    }
  }
  if (window.__codexLiveTokenCostVersion === VERSION) return;
  window.__codexLiveTokenCostVersion = VERSION;

  const state = {
    root: null,
    settingsButton: null,
    settingsOverlay: null,
    started: false,
    startedAt: Date.now(),
    renderTimer: 0,
    lastRenderAt: 0,
    mainEditable: null,
    mainEditableAt: 0,
    running: false,
    lastExactTurnId: "",
    lastClickedSidebarThreadKey: "",
    lastClickedSidebarThreadAt: 0,
    userSelectedSidebarThreadKey: "",
    userSelectedSidebarThreadAt: 0,
    detectedSessionKey: "",
    detectedSessionKeyAt: 0,
    newConversationSessionKey: "",
    newConversationSessionKeyAt: 0,
    startupSessionKey: `new:startup:${Date.now().toString(36)}`,
    localLedger: [],
    localLedgerLoaded: false,
    localLast: null,
    localCurrentTurn: null,
    localCurrentTurns: new Map(),
    localTurnTimer: 0,
    localTurnTimers: new Map(),
    localTurnSeq: 0,
    localSeenUsage: new Map(),
    localPersistedUsage: new Map(),
    legacySessionMigrations: new Set(),
    profileRequestIds: new Map(),
    codexModulePromises: new Map(),
    detectedModel: "",
    detectedEffort: "",
    detectedFastMode: false,
    priceEditorOpen: false,
    priceEditorModel: "",
    badProfileImageUrl: "",
    profilePrefs: null,
    profileIdentitySyncTimer: 0,
    profileIdentityObserver: null,
    profileUsageRefreshTimer: 0,
    hubVisibilityTimer: 0,
    profileAvatarSourceUrl: "",
    profileAvatarRenderUrl: "",
    officialModelObserver: null,
    officialModelRootObserver: null,
    officialModelTrigger: null,
    taskRunningObserver: null,
    taskRunningDom: false,
    helperStats: null,
    helperStatsAt: 0,
    helperStatus: HELPER_STATUS_DEFAULT,
    helperUnavailable: false,
    helperCheckedAt: 0,
    helperPollInFlight: false,
    helperPollPromise: null,
    ccSwitchSyncInFlight: false,
    ccSwitchStartupSyncStarted: false,
    ccSwitchSyncStatus: "",
    hubValueCache: new Map(),
    hubSkeletonVersion: "",
    shimmerDelayTimer: 0,
    shimmerIntervalTimer: 0,
    shimmerActiveTimer: 0,
    shimmerActiveStartedAt: 0,
    shimmerActiveUntil: 0,
    shimmerRunning: false,
    turnShimmerRunning: false,
    turnShimmerStartedAt: 0,
    turnShimmerOutputStartedAt: 0,
    turnShimmerSessions: new Map(),
  };

  function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function fmtCount(value) {
    const n = toCount(value);
    for (const [unit, suffix] of [
      [1_000_000_000, "B"],
      [1_000_000, "M"],
      [1_000, "K"],
    ]) {
      if (n >= unit) {
        return `${(n / unit).toFixed(n < unit * 10 ? 1 : 0).replace(/\\.0$/, "")}${suffix}`;
      }
    }
    return String(n);
  }

  function fmtMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "$0.00";
    return `$${n.toFixed(2)}`;
  }

  function fmtPercent(numerator, denominator) {
    const total = toCount(denominator);
    return total ? `${Math.round((toCount(numerator) / total) * 100)}%` : "0%";
  }

  function loadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function loadJsonFromString(value, fallback) {
    try {
      const parsed = JSON.parse(String(value || "null"));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function loadDefaultPrices() {
    return { ...FALLBACK_DEFAULT_PRICES, ...normalizePriceTable(globalThis?.[PRICE_DATA_SOURCE_KEY]) };
  }

  function normalizePriceTable(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(
      Object.entries(source)
        .map(([model, price]) => [normalizeText(model, 120), normalizePrice(price)])
        .filter(([model, price]) => model && price),
    );
  }

  function hubVisible() {
    try {
      return localStorage.getItem(HUB_VISIBLE_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function saveHubVisible(value) {
    try {
      localStorage.setItem(HUB_VISIBLE_KEY, value ? "true" : "false");
    } catch {
      // Keep the setting best-effort; DOM sync can still use the default.
    }
    return value;
  }

  function syncHubVisibility(root = state.root) {
    const visible = hubVisible();
    const target = root?.style ? root : state.root;
    if (!target?.style) return visible;
    target.dataset.cltcHubVisible = String(visible);
    target.setAttribute?.("aria-hidden", String(!visible));
    if (visible) {
      if (target.style.removeProperty) target.style.removeProperty("display");
      else target.style.display = "";
    } else if (target.style.setProperty) {
      target.style.setProperty("display", "none", "important");
    } else {
      target.style.display = "none";
    }
    return visible;
  }

  function scheduleHubVisibilitySync(delay = 50) {
    if (state.hubVisibilityTimer) return;
    state.hubVisibilityTimer = window.setTimeout(() => {
      state.hubVisibilityTimer = 0;
      syncHubVisibility();
    }, delay);
  }

  function installHubVisibilityObserver() {
    syncHubVisibility();
  }

  function todayKey(time = Date.now()) {
    const date = new Date(time);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  function isoDateUtc(time = Date.now()) {
    const date = new Date(time);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : todayKey();
  }

  function binaryStringToBase64(value) {
    const text = String(value || "");
    const chunkSize = 0x6000;
    let out = "";
    for (let i = 0; i < text.length; i += chunkSize) out += btoa(text.slice(i, i + chunkSize));
    return out;
  }

  function repairLegacyChunkedProfileImageUrl(value) {
    const text = String(value || "");
    const match = text.match(/^(data:image\/[^;,]+;base64,)([\s\S]+)$/i);
    if (!match) return text;
    const prefix = match[1];
    const body = match[2].replace(/\s/g, "");
    if (!body.slice(0, -2).includes("=")) return text;
    const oldChunkChars = Math.ceil(0x8000 / 3) * 4;
    let binary = "";
    try {
      for (let i = 0; i < body.length; i += oldChunkChars) binary += atob(body.slice(i, i + oldChunkChars));
    } catch {
      return text;
    }
    return `${prefix}${binaryStringToBase64(binary)}`;
  }

  function normalizeProfileImageUrl(value) {
    const text = normalizeText(value, PROFILE_IMAGE_MAX_LENGTH);
    if (!text) return null;
    return repairLegacyChunkedProfileImageUrl(text);
  }

  function isoDateAddDays(dateIso, days) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return isoDateUtc();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isoWeekStartUtc(dateIso) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return isoWeekStartUtc(isoDateUtc());
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  }

  function profileHeatmapColumnCount(todayIso = isoDateUtc()) {
    const currentWeek = new Date(`${isoWeekStartUtc(todayIso)}T00:00:00.000Z`).getTime();
    const baseWeek = new Date(`${PROFILE_HEATMAP_BASE_START}T00:00:00.000Z`).getTime();
    const weeks = Math.floor((currentWeek - baseWeek) / (7 * 24 * 60 * 60 * 1000));
    return Math.min(PROFILE_HEATMAP_MAX_COLUMNS, Math.max(1, weeks + 1));
  }

  function profileHeatmapStartDate(todayIso = isoDateUtc()) {
    return isoDateAddDays(isoWeekStartUtc(todayIso), -(profileHeatmapColumnCount(todayIso) - 1) * 7);
  }

  function localProfileDailyUsageBuckets(days, todayIso = isoDateUtc()) {
    const byDate = new Map(days.map((day) => [day.date, day]));
    const buckets = [];
    for (let date = profileHeatmapStartDate(todayIso); date <= todayIso; date = isoDateAddDays(date, 1)) {
      const day = byDate.get(date);
      buckets.push({
        start_date: date,
        tokens: toCount(day?.tokens),
        input_tokens: toCount(day?.input),
        output_tokens: toCount(day?.output),
        cached_tokens: toCount(day?.cached),
        requests: toCount(day?.requests),
        cost: Number(day?.cost || 0),
      });
    }
    return buckets;
  }

  function localProfileStreakStats(days, todayIso = isoDateUtc()) {
    const usageDates = new Set(days.filter((day) => toCount(day.tokens) > 0).map((day) => day.date));
    let current = 0;
    for (let date = todayIso; usageDates.has(date); date = isoDateAddDays(date, -1)) current++;

    let longest = 0;
    let running = 0;
    let previous = "";
    for (const date of Array.from(usageDates).sort()) {
      running = previous && isoDateAddDays(previous, 1) === date ? running + 1 : 1;
      longest = Math.max(longest, running);
      previous = date;
    }
    return { current, longest };
  }


  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeText(value, max = 120) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (!text || text.length > max || /^(null|undefined|default)$/i.test(text)) return "";
    return text;
  }

  function isTransientSessionKey(value) {
    return normalizeText(value, 240).startsWith("new:");
  }

  function stripProfileUsername(value) {
    return String(value || "").trim().replace(/^@+/, "").replace(/\s/g, "").slice(0, 20);
  }

  function profileUsernameAllowed(value) {
    const username = stripProfileUsername(value);
    return username.length >= 3 && username.length <= 20 && /^[A-Za-z0-9._-]+$/.test(username);
  }

  function validProfileEmail(value) {
    const email = normalizeText(value, 128);
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  }

  function profileDefaultEmail() {
    return validProfileEmail(loadJson(PROFILE_DEFAULTS_KEY, {}).email) || LOCAL_PROFILE_EMAIL;
  }

  function saveProfileDefaultEmail(email) {
    const normalized = validProfileEmail(email);
    if (!normalized) return false;
    const defaults = loadJson(PROFILE_DEFAULTS_KEY, {});
    localStorage.setItem(PROFILE_DEFAULTS_KEY, JSON.stringify({ ...defaults, email: normalized }));
    return true;
  }

  function normalizeProfileEmail(value, fallback = profileDefaultEmail()) {
    return validProfileEmail(value) || fallback || LOCAL_PROFILE_EMAIL;
  }

  function profilePlanOption(value) {
    const text = normalizeText(value, 64).toLowerCase();
    if (!text) return null;
    return PROFILE_PLAN_OPTIONS.find((option) => option.value.toLowerCase() === text || option.label.toLowerCase() === text) || null;
  }

  function normalizeProfilePlan(planType, planLabel) {
    const option = profilePlanOption(planType) || profilePlanOption(planLabel);
    if (option) return { planType: option.value, planLabel: option.label };
    const rawPlanType = normalizeText(planType, 64);
    const rawPlanLabel = normalizeText(planLabel, 64);
    const fallback = profilePlanOption(LOCAL_PROFILE_PLAN) || { value: LOCAL_PROFILE_PLAN, label: "Pro 20x" };
    const label = rawPlanLabel || rawPlanType || fallback.label;
    return { planType: rawPlanType || (rawPlanLabel ? rawPlanLabel : fallback.value), planLabel: label };
  }

  function localProfileIdentityFields(source = {}) {
    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const imageUrl = prefs.imageUrl || source.imageUrl || source.profilePictureUrl || source.profile_picture_url || source.avatarUrl || source.avatar_url || null;
    return {
      email: prefs.email,
      name: displayName,
      accountName: displayName,
      displayName,
      display_name: displayName,
      username: prefs.username || source.username,
      image: imageUrl,
      imageUrl,
      avatar: imageUrl,
      profilePictureUrl: imageUrl,
      profileImageUrl: imageUrl,
      profilePhotoUrl: imageUrl,
      photoUrl: imageUrl,
      profile_picture_url: imageUrl,
      avatarUrl: imageUrl,
      avatar_url: imageUrl,
      picture: imageUrl,
    };
  }

  function localProfileAccount(source = {}) {
    const prefs = localProfilePrefs();
    return {
      ...source,
      ...localProfileIdentityFields(source),
      type: "chatgpt",
      planType: prefs.planType,
    };
  }

  function spoofProfileAccountPayload(value) {
    if (!value || typeof value !== "object" || !value.account || typeof value.account !== "object") return value;
    const type = value.account.type;
    if (type !== "apiKey" && type !== "amazonBedrock" && type !== "chatgpt") return value;
    return {
      ...value,
      requiresOpenaiAuth: false,
      account: localProfileAccount(value.account),
    };
  }

  function spoofProfileAuthContextValue(value) {
    const source = value && typeof value === "object" ? value : {};
    if (source.__codexLiveTokenCostProfileAuthLocal === VERSION) return source;
    const account = localProfileAccount(source.account && typeof source.account === "object" ? source.account : {});
    const identity = localProfileIdentityFields(source);
    return {
      ...source,
      ...identity,
      __codexLiveTokenCostProfileAuthLocal: VERSION,
      openAIAuth: "chatgpt",
      authMethod: "chatgpt",
      requiresAuth: false,
      planAtLogin: account.planType,
      account,
      accountId: source.accountId || LOCAL_PROFILE_ACCOUNT_ID,
      userId: source.userId || LOCAL_PROFILE_USER_ID,
      computeResidency: source.computeResidency ?? null,
      isLoading: false,
      isCopilotApiAvailable: source.isCopilotApiAvailable ?? false,
      setAuthMethod: typeof source.setAuthMethod === "function" ? source.setAuthMethod : () => {},
    };
  }

  function patchProfileReactAuthContext(react, authContext) {
    if (!react || typeof react.useContext !== "function" || !authContext) return false;
    if (react.useContext.__codexLiveTokenCostProfileAuthPatch === VERSION) return true;
    const originalUseContext = react.__codexLiveTokenCostOriginalUseContext || react.useContext.bind(react);
    react.useContext = function codexLiveTokenCostProfileUseContext(context) {
      const value = originalUseContext(context);
      if (context === authContext) return spoofProfileAuthContextValue(value);
      return value;
    };
    react.useContext.__codexLiveTokenCostProfileAuthPatch = VERSION;
    react.__codexLiveTokenCostOriginalUseContext = originalUseContext;
    return true;
  }

  function isSettingsSectionsArray(value) {
    return (
      Array.isArray(value) &&
      value.some((item) => item?.slug === "general-settings") &&
      value.some((item) => item?.slug === "profile")
    );
  }

  function profileUnlockedSettingsSections(source, visible) {
    if (!isSettingsSectionsArray(source) || !Array.isArray(visible) || visible.some((item) => item?.slug === "profile")) return visible;
    const profile = source.find((item) => item?.slug === "profile");
    if (!profile) return visible;
    const next = visible.slice();
    const generalIndex = next.findIndex((item) => item?.slug === "general-settings");
    next.splice(generalIndex >= 0 ? generalIndex + 1 : 0, 0, profile);
    return next;
  }

  function parseModelEffortText(value) {
    const text = normalizeText(value, 500);
    const raw = text.match(/\b(gpt-[a-z0-9._-]+|o\d[a-z0-9._-]*)\b/i)?.[1] || "";
    if (!raw) return { model: "", effort: "" };
    const split = raw.match(/^(.*?)[._\s-]+(minimal|low|medium|high)$/i);
    if (split) return { model: split[1], effort: split[2].toLowerCase() };
    return { model: raw, effort: "" };
  }

  function normalizeOfficialEffort(value) {
    const text = normalizeText(String(value ?? ""), 80);
    if (!text) return "";
    const lower = text.toLowerCase().replace(/[\s-]+/g, "_");
    const mapped = {
      高: "high",
      中: "medium",
      低: "low",
      最小: "minimal",
      无: "none",
      快速: "low",
      none: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      extra_high: "xhigh",
      xhigh: "xhigh",
      max: "max",
      maximum: "max",
    }[text] || {
      none: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      extra_high: "xhigh",
      xhigh: "xhigh",
      max: "max",
      maximum: "max",
    }[lower];
    return mapped || "";
  }

  function officialModelInfoFromText(textValue, effortValue = "") {
    const text = normalizeText(String(textValue ?? ""), 500);
    const parsed = parseModelEffortText(text);
    let model = parsed.model;
    if (!model) {
      const numeric = text.match(/\b\d+(?:\.\d+)+(?:[._-]?(?:codex|mini|nano|pro))?\b/i)?.[0] || "";
      if (numeric) model = `gpt-${numeric.toLowerCase().replace(/\s+/g, "-")}`;
    }
    if (!model) {
      const candidate =
        text
          .split(/\r?\n/)
          .map((line) => normalizeText(line, 120))
          .find((line) => line && !normalizeOfficialEffort(line)) || text;
      const custom = candidate.match(/\b[a-z][a-z0-9._-]*(?:[._-][a-z0-9]+)+\b/i)?.[0] || candidate.match(/\b[a-z][a-z0-9._-]*\d[a-z0-9._-]*\b/i)?.[0] || "";
      if (custom && !normalizeOfficialEffort(custom)) model = custom.toLowerCase();
    }
    const effort = normalizeOfficialEffort(effortValue) || parsed.effort || normalizeOfficialEffort(text.match(/(高|中|低|最小|无|\bminimal\b|\blow\b|\bmedium\b|\bhigh\b)/i)?.[1]);
    return { model, effort };
  }

  function officialFastModeIconHtml() {
    return `<svg class="cltc-fast-mode-icon" data-cltc-fast-mode-icon="true" hidden width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${FAST_MODE_ICON_PATH}" fill="currentColor"></path></svg>`;
  }

  function officialTriggerFastMode(trigger) {
    if (!trigger || state.root?.contains?.(trigger) || state.settingsOverlay?.contains?.(trigger)) return false;
    const paths = Array.from(trigger.querySelectorAll?.("svg path") || []);
    return paths.some((path) => {
      if (!(path.getAttribute?.("d") || "").startsWith("M9.80999 17.8302")) return false;
      const svg = path.closest?.("svg");
      if (!svg || svg.hidden || svg.hasAttribute?.("hidden") || svg.closest?.("[hidden]")) return false;
      const rect = svg.getBoundingClientRect?.();
      const style = typeof getComputedStyle === "function" ? getComputedStyle(svg) : null;
      return (!rect || (rect.width > 0 && rect.height > 0)) && style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
    });
  }

  function officialModelTriggerInfo(trigger) {
    if (!trigger || state.root?.contains?.(trigger) || state.settingsOverlay?.contains?.(trigger)) {
      return { model: "", effort: "", fastMode: false };
    }
    const info = officialModelInfoFromText(trigger.innerText || trigger.textContent || "", trigger.getAttribute?.("data-selected-reasoning-effort") || "");
    return { ...info, fastMode: officialTriggerFastMode(trigger) };
  }

  function readOfficialModelTrigger(trigger = null) {
    const node = trigger || document.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR);
    const info = officialModelTriggerInfo(node);
    let changed = false;
    if (info.model && info.model !== state.detectedModel) {
      state.detectedModel = info.model;
      changed = true;
    }
    if (info.effort && info.effort !== state.detectedEffort) {
      state.detectedEffort = info.effort;
      changed = true;
    }
    if (info.fastMode !== state.detectedFastMode) {
      state.detectedFastMode = info.fastMode;
      changed = true;
    }
    return changed;
  }

  function modelName(ledgerModel = null) {
    const recentModel = ledgerModel === null ? recentLedgerModel() : ledgerModel;
    return state.detectedModel || recentModel || UNKNOWN_MODEL;
  }

  function activeModelInfo() {
    const ledgerModel = recentLedgerModel();
    return {
      model: modelName(ledgerModel),
      effort: state.detectedEffort || "",
      manual: false,
    };
  }

  function priceFor(model) {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const key = priceModelKey(model, overrides);
    if (!key || priceModelHidden(key)) return null;
    return normalizePrice(overrides[key]) || DEFAULT_PRICES[key] || null;
  }

  function priceModelKey(model, overrides = loadJson(PRICE_OVERRIDES_KEY, {})) {
    const name = normalizeText(model, 120);
    if (!name || name === UNKNOWN_MODEL) return "";
    if (Object.hasOwn(overrides, name) || Object.hasOwn(DEFAULT_PRICES, name)) return name;
    const lower = name.toLowerCase();
    const overrideKey = Object.keys(overrides).find((key) => normalizeText(key, 120).toLowerCase() === lower);
    if (overrideKey) return overrideKey;
    const defaultKey = Object.keys(DEFAULT_PRICES).find((key) => key.toLowerCase() === lower);
    return defaultKey || name;
  }

  function priceModelHidden(model) {
    const name = normalizeText(model, 120);
    const lower = name.toLowerCase();
    const hidden = hiddenPriceModels();
    return hidden.has(name) || Array.from(hidden).some((item) => item.toLowerCase() === lower);
  }

  function ensurePriceForModel(model) {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const key = priceModelKey(model, overrides);
    if (!key || priceModelHidden(key)) return null;
    const existing = normalizePrice(overrides[key]) || DEFAULT_PRICES[key] || null;
    if (existing) return existing;
    overrides[key] = { input: 0, cachedInput: 0, output: 0 };
    try {
      localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    } catch {
      return null;
    }
    return normalizePrice(overrides[key]);
  }

  function hiddenPriceModels() {
    const hidden = loadJson(HIDDEN_PRICE_MODELS_KEY, []);
    return new Set(Array.isArray(hidden) ? hidden.map((item) => normalizeText(item)).filter(Boolean) : []);
  }

  function saveHiddenPriceModels(hidden) {
    const list = Array.from(hidden).map((item) => normalizeText(item)).filter(Boolean).sort((a, b) => a.localeCompare(b));
    localStorage.setItem(HIDDEN_PRICE_MODELS_KEY, JSON.stringify(list));
  }

  function visibleDefaultPrices() {
    const hidden = hiddenPriceModels();
    return Object.fromEntries(Object.entries(DEFAULT_PRICES).filter(([model]) => !hidden.has(model)));
  }

  function visiblePrices() {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const visibleOverrides = Object.fromEntries(Object.entries(overrides).filter(([model]) => !priceModelHidden(model)));
    return { ...visibleDefaultPrices(), ...visibleOverrides };
  }

  function normalizePrice(price) {
    if (!price || typeof price !== "object") return null;
    const input = Number(price.input);
    const output = Number(price.output);
    if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
    const cachedInput = price.cachedInput == null || price.cachedInput === "" ? null : Number(price.cachedInput);
    return {
      input: Number.isFinite(input) && input >= 0 ? input : 0,
      cachedInput: Number.isFinite(cachedInput) && cachedInput >= 0 ? cachedInput : null,
      output: Number.isFinite(output) && output >= 0 ? output : 0,
    };
  }

  function normalizeUsage(raw) {
    const u = raw && typeof raw === "object" ? raw : {};
    const rawInput = toCount(u.inputTokens ?? u.input_tokens ?? u.prompt_tokens ?? u.promptTokens);
    const explicitInputTotal = toCount(u.input ?? u.inputTotalTokens ?? u.input_total_tokens ?? u.prompt_total_tokens ?? u.promptTotalTokens);
    const output = toCount(
      u.output ?? u.outputTotalTokens ?? u.output_total_tokens ?? u.outputTokens ?? u.output_tokens ?? u.completion_tokens,
    );
    const cachedTokens = toCount(
      u.cached ??
        u.cachedTokens ??
        u.cached_tokens ??
        u.cachedInputTokens ??
        u.cached_input_tokens ??
        u.inputTokensDetails?.cachedTokens ??
        u.input_tokens_details?.cached_tokens ??
        u.promptTokensDetails?.cachedTokens ??
        u.prompt_tokens_details?.cached_tokens,
    );
    const cacheReadTokens = toCount(
      u.cachedReadTokens ?? u.cached_read_tokens ?? u.cacheReadTokens ?? u.cache_read_tokens ?? u.cacheReadInputTokens ?? u.cache_read_input_tokens,
    );
    const cacheCreationTokens = toCount(u.cacheCreationTokens ?? u.cache_creation_tokens ?? u.cacheCreationInputTokens ?? u.cache_creation_input_tokens);
    const cachedReadTokens = cacheReadTokens || cachedTokens;
    const explicitTotal = toCount(u.total ?? u.requestTotalTokens ?? u.totalTokens ?? u.total_tokens);
    const contextUsed = toCount(u.contextUsed ?? u.context_used ?? u.usedTokens ?? u.used_tokens ?? u.used);
    const contextLimit = toCount(
      u.contextLimit ?? u.context_limit ?? u.modelContextWindow ?? u.model_context_window ?? u.contextWindow ?? u.context_window ?? u.limit,
    );
    const inputFromTotal = explicitTotal && output && explicitTotal > output ? explicitTotal - output : 0;
    const inputBase = Math.max(explicitInputTotal, rawInput, inputFromTotal);
    const hasSeparateCacheTokens = cacheReadTokens > 0 || cacheCreationTokens > 0;
    const baseForSeparateCache = rawInput || explicitInputTotal || inputFromTotal;
    let input = inputBase;
    if (hasSeparateCacheTokens) input = Math.max(inputBase, baseForSeparateCache + cacheReadTokens + cacheCreationTokens);
    const total = explicitTotal || input + output;
    const cached = cachedReadTokens;
    const hasTokenBreakdown = input > 0 || output > 0 || cached > 0 || cacheCreationTokens > 0 || explicitTotal > 0;
    const exact = hasTokenBreakdown;
    const normalized = { input, output, cached, total, exact };
    if (rawInput && rawInput !== input) normalized.inputTokens = rawInput;
    if (input && rawInput && input !== rawInput) normalized.inputTotalTokens = input;
    if (cachedTokens && cachedTokens !== cached) normalized.cachedTokens = cachedTokens;
    if (cacheReadTokens) normalized.cacheReadTokens = cacheReadTokens;
    if (cachedReadTokens && cachedReadTokens !== cached) normalized.cachedReadTokens = cachedReadTokens;
    if (cacheCreationTokens) normalized.cacheCreationTokens = cacheCreationTokens;
    if (explicitTotal && explicitTotal !== total) normalized.requestTotalTokens = explicitTotal;
    if (contextUsed) normalized.contextUsed = contextUsed;
    if (contextLimit) normalized.contextLimit = contextLimit;
    return normalized;
  }

  function calcCost(usage, price, options = {}) {
    if (!price) return { value: 0, priced: false };
    const input = toCount(usage.input);
    const output = toCount(usage.output);
    const cached = Math.min(input, toCount(usage.cached));
    const fresh = Math.max(0, input - cached);
    const cachedRate = price.cachedInput ?? price.input;
    const multiplier = options.fastMode === true ? fastModeCostMultiplier(options.model) : 1;
    return {
      value: ((fresh * price.input + cached * cachedRate + output * price.output) / 1_000_000) * multiplier,
      priced: true,
    };
  }

  function fastModeCostMultiplier(model) {
    const name = normalizeText(model, 120).toLowerCase();
    return FAST_MODE_COST_MULTIPLIERS.find((item) => item.pattern.test(name))?.multiplier || 1;
  }

  function costForModelUsage(usage, model, options = {}) {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const key = priceModelKey(model, overrides);
    if (key && priceModelHidden(key)) return { value: 0, priced: true, hidden: true };
    const price = options.ensure ? ensurePriceForModel(model) || priceFor(model) : priceFor(model);
    return calcCost(usage, price, { ...options, model });
  }

  function addUsage(a, b) {
    const result = {
      input: toCount(a.input) + toCount(b.input),
      output: toCount(a.output) + toCount(b.output),
      cached: toCount(a.cached) + toCount(b.cached),
      total: toCount(a.total) + toCount(b.total),
    };
    const inputTokens = toCount(a.inputTokens) + toCount(b.inputTokens);
    const inputTotalTokens = toCount(a.inputTotalTokens) + toCount(b.inputTotalTokens);
    const cachedTokens = toCount(a.cachedTokens) + toCount(b.cachedTokens);
    const cacheReadTokens = toCount(a.cacheReadTokens) + toCount(b.cacheReadTokens);
    const cachedReadTokens = toCount(a.cachedReadTokens) + toCount(b.cachedReadTokens);
    const cacheCreationTokens = toCount(a.cacheCreationTokens) + toCount(b.cacheCreationTokens);
    if (inputTokens) result.inputTokens = inputTokens;
    if (inputTotalTokens) result.inputTotalTokens = inputTotalTokens;
    if (cachedTokens) result.cachedTokens = cachedTokens;
    if (cacheReadTokens) result.cacheReadTokens = cacheReadTokens;
    if (cachedReadTokens) result.cachedReadTokens = cachedReadTokens;
    if (cacheCreationTokens) result.cacheCreationTokens = cacheCreationTokens;
    if (a.exact || b.exact) result.exact = true;
    return result;
  }

  function aggregateTurnUsage(turn) {
    return (Array.isArray(turn?.calls) ? turn.calls : []).reduce((sum, call) => addUsage(sum, normalizeUsage(call?.usage)), {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
      exact: true,
    });
  }

  function usageHasCostData(usage) {
    const u = normalizeUsage(usage);
    return toCount(u.total) > 0 || toCount(u.input) > 0 || toCount(u.output) > 0 || toCount(u.cached) > 0;
  }

  function costPricedLabel(cost, usage) {
    return !cost?.hidden && cost?.priced === false && usageHasCostData(usage) ? " 未定价" : "";
  }

  function usageKey(usage) {
    return [
      usage.input,
      usage.output,
      usage.cached,
      usage.total,
      usage.inputTokens || 0,
      usage.inputTotalTokens || 0,
      usage.cachedTokens || 0,
      usage.cacheReadTokens || 0,
      usage.cachedReadTokens || 0,
      usage.cacheCreationTokens || 0,
    ].join(":");
  }

  function pricedModelUsable(model) {
    const price = priceFor(model);
    if (!price) return false;
    return [price.input, price.cachedInput, price.output].some((value) => Number(value) > 0);
  }

  function recentLedgerModel() {
    ensureLocalLedgerLoaded();
    const sessionKey = currentSessionKey();
    for (let i = state.localLedger.length - 1; i >= 0; i -= 1) {
      const turn = state.localLedger[i];
      if (turnSessionKey(turn) !== sessionKey) continue;
      const model = normalizeText(turn?.model, 120);
      if (model && model !== UNKNOWN_MODEL && pricedModelUsable(model)) return model;
    }
    return "";
  }

  function cleanupAutoZeroPriceModels() {
    const autoZeroModels = ["gpt-5.4-nano"];
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const hidden = hiddenPriceModels();
    let changed = false;
    for (const model of autoZeroModels) {
      const key = Object.keys(overrides).find((item) => item.toLowerCase() === model.toLowerCase());
      const price = normalizePrice(key ? overrides[key] : null);
      if (!key || !price || price.input !== 0 || price.cachedInput !== 0 || price.output !== 0) continue;
      delete overrides[key];
      hidden.add(model);
      changed = true;
    }
    if (!changed) return false;
    try {
      localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
      saveHiddenPriceModels(hidden);
    } catch {
      // Best-effort cleanup; users can still hide it via delete after reload.
    }
    return true;
  }

  function metricUsageKey(metric) {
    return usageKey(normalizeUsage(metric?.usage));
  }

  function locationSessionKey() {
    const href = String(location?.href || "");
    try {
      const url = new URL(href || "app://-/");
      return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    } catch {
      return String(location?.pathname || "/") || "/";
    }
  }

  function activeSidebarThreadKey(doc = document) {
    if (recentNewConversationSessionKey()) return "";
    const activeElementKey = sidebarThreadKeyFromNode(doc?.activeElement);
    if (activeElementKey) {
      state.lastClickedSidebarThreadKey = resolveSessionKey(activeElementKey);
      state.lastClickedSidebarThreadAt = Date.now();
      return state.lastClickedSidebarThreadKey;
    }
    const selectors = [
      "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]",
      "[aria-current='page'][data-app-action-sidebar-thread-id]",
      "[aria-selected='true'][data-app-action-sidebar-thread-id]",
      "[data-state='active'][data-app-action-sidebar-thread-id]",
      "[data-active='true'][data-app-action-sidebar-thread-id]",
      "[data-selected='true'][data-app-action-sidebar-thread-id]",
    ];
    for (const selector of selectors) {
      const node = doc?.querySelector?.(selector);
      const id = sidebarThreadKeyFromNode(node);
      if (id) return resolveSessionKey(id);
    }
    if (state.lastClickedSidebarThreadKey && Date.now() - state.lastClickedSidebarThreadAt < 30000) return state.lastClickedSidebarThreadKey;
    return "";
  }

  function hasActiveSidebarThreadDom(doc = document) {
    const selectors = [
      "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]",
      "[aria-current='page'][data-app-action-sidebar-thread-id]",
      "[aria-selected='true'][data-app-action-sidebar-thread-id]",
      "[data-state='active'][data-app-action-sidebar-thread-id]",
      "[data-active='true'][data-app-action-sidebar-thread-id]",
      "[data-selected='true'][data-app-action-sidebar-thread-id]",
    ];
    return selectors.some((selector) => Boolean(sidebarThreadKeyFromNode(doc?.querySelector?.(selector))));
  }

  function sidebarThreadKeyFromNode(node) {
    const target = node?.closest?.("[data-app-action-sidebar-thread-id]") || node;
    return normalizeText(target?.getAttribute?.("data-app-action-sidebar-thread-id"), 240);
  }

  function resolveSessionKey(value) {
    const key = normalizeText(value, 240);
    if (!key) return "";
    ensureLocalLedgerLoaded();
    const known = new Set(state.localLedger.map(turnSessionKey).filter(Boolean));
    if (known.has(key)) return key;
    if (key.startsWith("local:")) {
      const stripped = key.slice("local:".length);
      if (known.has(stripped)) return stripped;
    } else {
      const localKey = `local:${key}`;
      if (known.has(localKey)) return localKey;
    }
    return key;
  }

  function recentDetectedSessionKey() {
    return state.detectedSessionKey && Date.now() - state.detectedSessionKeyAt < 10 * 60 * 1000 ? state.detectedSessionKey : "";
  }

  function recentNewConversationSessionKey() {
    return state.newConversationSessionKey && Date.now() - state.newConversationSessionKeyAt < 10 * 60 * 1000 ? state.newConversationSessionKey : "";
  }

  function recentUserSelectedSidebarThreadKey() {
    return state.userSelectedSidebarThreadKey || "";
  }

  function hasStartupComposerSurface(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    return Boolean(
      main.querySelector?.(
        [
          "[data-codex-composer]",
          ".ProseMirror[contenteditable='true']",
          "[role='textbox'][contenteditable='true']",
          "textarea",
        ].join(","),
      ),
    );
  }

  function hasConversationTranscriptDom(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    return Boolean(
      main.querySelector?.(
        [
          "article",
          "[data-message-author-role]",
          "[data-turn-id]",
          "[data-thread-id]",
          "[data-response-item-id]",
          "[data-codex-turn]",
          "[data-codex-message]",
          "[data-testid*='conversation-turn']",
          "[data-testid*='message-row']",
          "[data-testid*='chat-message']",
        ].join(","),
      ),
    );
  }

  function startupBlankConversationSessionKey(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return "";
    if (hasActiveSidebarThreadDom(doc)) return "";
    if (!hasStartupComposerSurface(doc)) return "";
    if (hasConversationTranscriptDom(doc)) return "";
    return "new:auto";
  }

  function startupResetSessionKey() {
    if (state.localCurrentTurn) return "";
    if (recentDetectedSessionKey() || recentNewConversationSessionKey()) return "";
    if (hasActiveSidebarThreadDom()) return "";
    if (state.lastClickedSidebarThreadKey && Date.now() - state.lastClickedSidebarThreadAt < 30000) return "";
    return state.startupSessionKey;
  }

  function currentSessionKey() {
    return (
      recentNewConversationSessionKey() ||
      recentUserSelectedSidebarThreadKey() ||
      startupBlankConversationSessionKey() ||
      recentDetectedSessionKey() ||
      startupResetSessionKey() ||
      activeSidebarThreadKey() ||
      locationSessionKey()
    );
  }

  function localStateSessionKey(sessionKey = currentSessionKey()) {
    return normalizeText(sessionKey, 240) || locationSessionKey();
  }

  function isActiveLocalStateSession(sessionKey = currentSessionKey()) {
    return sameSessionKey(localStateSessionKey(sessionKey), currentSessionKey());
  }

  function localCurrentTurn(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    return state.localCurrentTurns.get(key) || null;
  }

  function syncActiveLocalCurrentTurn() {
    state.localCurrentTurn = localCurrentTurn(currentSessionKey());
    return state.localCurrentTurn;
  }

  function setLocalCurrentTurn(turn, sessionKey = turn?.sessionKey || currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    if (turn) {
      turn.sessionKey = key;
      state.localCurrentTurns.set(key, turn);
    } else {
      state.localCurrentTurns.delete(key);
      if (sameSessionKey(state.localCurrentTurn?.sessionKey, key)) state.localCurrentTurn = null;
    }
    syncActiveLocalCurrentTurn();
    return turn || null;
  }

  function migrateLegacyLocationSessionTurns(sessionKey = currentSessionKey()) {
    const targetKey = normalizeText(sessionKey, 240);
    const legacyKey = normalizeText(locationSessionKey(), 240);
    if (targetKey.startsWith("new:")) return 0;
    if (!targetKey || !legacyKey || targetKey === legacyKey || state.legacySessionMigrations.has(targetKey)) return 0;
    state.legacySessionMigrations.add(targetKey);
    ensureLocalLedgerLoaded();
    if (state.localLedger.some((turn) => turnSessionKey(turn) === targetKey)) return 0;
    let migrated = 0;
    for (const turn of state.localLedger) {
      if (turn?.source !== "codex-live-token-cost" || turnSessionKey(turn) !== legacyKey) continue;
      turn.sessionKey = targetKey;
      migrated += 1;
    }
    if (state.localLast?.source === "codex-live-token-cost" && turnSessionKey(state.localLast) === legacyKey) {
      state.localLast.sessionKey = targetKey;
    }
    const legacyCurrentTurn = localCurrentTurn(legacyKey);
    if (legacyCurrentTurn) {
      setLocalCurrentTurn(null, legacyKey);
      setLocalCurrentTurn(legacyCurrentTurn, targetKey);
    }
    if (migrated > 0) saveLocalLedger();
    return migrated;
  }

  function turnSessionKey(turn) {
    return normalizeText(turn?.sessionKey || turn?.conversationKey || turn?.threadId || turn?.conversationId, 240);
  }

  function sameSessionKey(left, right) {
    const a = normalizeText(left, 240);
    const b = normalizeText(right, 240);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.replace(/^local:/, "") === b.replace(/^local:/, "");
  }

  function currentSessionTurns(turns, key = currentSessionKey()) {
    const sessionKey = normalizeText(key, 240);
    if (isTransientSessionKey(sessionKey)) return [];
    return (Array.isArray(turns) ? turns : []).filter((turn) => sameSessionKey(turnSessionKey(turn), sessionKey));
  }

  function loadDailyLedger() {
    const date = todayKey();
    const saved = loadJson(DAILY_USAGE_KEY, null);
    if (saved?.date === date && Array.isArray(saved.items)) {
      return { date, items: saved.items.slice(-500) };
    }
    return { date, items: [] };
  }

  function saveDailyLedger(ledger) {
    try {
      localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify({ date: ledger.date, items: ledger.items.slice(-500) }));
    } catch {
      // Ignore quota or privacy-mode failures.
    }
  }

  function loadLocalLedger() {
    const saved = loadJson(LOCAL_USAGE_KEY, null);
    state.localLedgerLoaded = true;
    if (!Array.isArray(saved?.turns)) return;
    const loaded = saved.turns.filter((item) => normalizeUsage(item?.usage).exact && !isTransientSessionKey(turnSessionKey(item))).slice(-LOCAL_LEDGER_LIMIT);
    const removedTransient = loaded.length !== saved.turns.filter((item) => normalizeUsage(item?.usage).exact).slice(-LOCAL_LEDGER_LIMIT).length;
    state.localLedger = loaded;
    state.localLast = state.localLedger[state.localLedger.length - 1] || null;
    state.localTurnSeq = toCount(saved.seq);
    if (removedTransient || isTransientSessionKey(turnSessionKey(saved.last))) saveLocalLedger();
  }

  function ensureLocalLedgerLoaded() {
    if (!state.localLedgerLoaded) loadLocalLedger();
  }

  function saveLocalLedger() {
    try {
      state.localLedger = state.localLedger.filter((item) => !isTransientSessionKey(turnSessionKey(item)));
      if (isTransientSessionKey(turnSessionKey(state.localLast))) state.localLast = state.localLedger[state.localLedger.length - 1] || null;
      localStorage.setItem(
        LOCAL_USAGE_KEY,
        JSON.stringify({ turns: state.localLedger.slice(-LOCAL_LEDGER_LIMIT), last: state.localLast, seq: state.localTurnSeq }),
      );
    } catch {
      // Ignore quota or privacy-mode failures.
    }
  }

  function normalizedDurationMs(raw, startedAt = 0, finishedAt = 0) {
    const explicitMs = Number(raw?.durationMs ?? raw?.duration_ms ?? raw?.elapsedMs ?? raw?.elapsed_ms ?? raw?.latencyMs ?? raw?.latency_ms);
    if (Number.isFinite(explicitMs) && explicitMs >= 0) return Math.round(explicitMs);
    const explicitSec = Number(raw?.durationSec ?? raw?.duration_sec ?? raw?.elapsedSec ?? raw?.elapsed_sec);
    if (Number.isFinite(explicitSec) && explicitSec >= 0) return Math.round(explicitSec * 1000);
    const start = toCount(startedAt);
    const finish = toCount(finishedAt);
    return start && finish >= start ? finish - start : 0;
  }

  function normalizeImportedUsageTurn(raw, index = 0, options = {}) {
    if (!raw || typeof raw !== "object") return null;
    const usage = normalizeUsage(raw.usage || raw);
    if (!usage.exact) return null;
    const createdAt = normalizeText(raw.createdAt || raw.created_at || raw.date, 40);
    const date = new Date(createdAt || Date.now());
    const observedAt = toCount(raw.observedAt || raw.observed_at || date.getTime());
    const startedAt = toCount(raw.startedAt || raw.started_at || raw.startTime || raw.start_time || date.getTime()) || observedAt || Date.now();
    const finishedAt = toCount(raw.finishedAt || raw.finished_at || raw.completedAt || raw.completed_at || raw.endTime || raw.end_time || observedAt) || startedAt;
    const durationMs = normalizedDurationMs(raw, startedAt, finishedAt);
    const sessionKey = resolveSessionKey(raw.sessionKey || raw.session_key || raw.threadId || raw.thread_id || raw.conversationId || raw.conversation_id || raw.sessionId || raw.session_id);
    if (isTransientSessionKey(sessionKey)) return null;
    const turnId =
      normalizeText(raw.turnId || raw.turn_id || raw.request_id, 240) ||
      `import:${isoDateUtc(date.getTime())}:${normalizeText(raw.model, 120) || UNKNOWN_MODEL}:${usageKey(usage)}:${index}`;
    const costUsd = Number(raw.costUsd ?? raw.cost_usd ?? raw.totalCostUsd ?? raw.total_cost_usd);
    return {
      usage,
      turnId,
      source: normalizeText(raw.source, 80) || "import",
      ...(sessionKey ? { sessionKey } : {}),
      callCount: toCount(raw.callCount ?? raw.call_count ?? raw.requestCount ?? raw.request_count) || 1,
      model: normalizeText(raw.model || raw.request_model || raw.pricing_model, 120) || UNKNOWN_MODEL,
      effort: normalizeReasoningEffort(raw.effort),
      fastMode: typeof raw.fastMode === "boolean" ? raw.fastMode : null,
      invocations: Array.isArray(raw.invocations) ? raw.invocations.map(normalizeProfileInvocation).filter(Boolean) : [],
      createdAt: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
      observedAt: observedAt || Date.now(),
      ...(toCount(raw.importedAt || raw.imported_at || options.importedAt) ? { importedAt: toCount(raw.importedAt || raw.imported_at || options.importedAt) } : {}),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs,
      durationSec: Math.round(durationMs / 1000),
      ...(Number.isFinite(costUsd) && costUsd >= 0 ? { costUsd } : {}),
      ...(normalizeText(raw.importSource, 80) ? { importSource: normalizeText(raw.importSource, 80) } : {}),
    };
  }

  function importLocalUsageTurns(rows, options = {}) {
    ensureLocalLedgerLoaded();
    const items = Array.isArray(rows) ? rows : [];
    const replaceSource = normalizeText(options.replaceSource, 80);
    const importedAt = toCount(options.importedAt) || Date.now();
    const existing = replaceSource ? state.localLedger.filter((turn) => turn.importSource !== replaceSource && turn.source !== replaceSource) : state.localLedger.slice();
    const byId = new Map(existing.map((turn) => [turn.turnId, turn]));
    let imported = 0;
    let skipped = 0;
    items.forEach((row, index) => {
      const turn = normalizeImportedUsageTurn(row, index, { importedAt });
      if (!turn) {
        skipped++;
        return;
      }
      byId.set(turn.turnId, turn);
      imported++;
    });
    state.localLedger = Array.from(byId.values())
      .filter((item) => normalizeUsage(item?.usage).exact)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.turnId || "").localeCompare(String(b.turnId || "")))
      .slice(-LOCAL_LEDGER_LIMIT);
    state.localLast = state.localLedger[state.localLedger.length - 1] || null;
    saveLocalLedger();
    scheduleProfileUsageRefresh();
    scheduleRender();
    return { imported, skipped, total: state.localLedger.length };
  }

  function rememberDailyUsage(metric) {
    const usage = normalizeUsage(metric?.usage);
    if (!usage.exact) return;
    const key = metricUsageKey(metric);
    const now = Date.now();
    const ledger = loadDailyLedger();
    const turnId = normalizeText(metric?.turnId, 120);
    const model = modelName();
    ensurePriceForModel(model);
    if (turnId) {
      const index = ledger.items.findIndex((item) => item.turnId === turnId);
      if (index >= 0) {
        ledger.items[index] = {
          ...ledger.items[index],
          key,
          turnId,
          usage,
          model,
          fastMode: typeof metric.fastMode === "boolean" ? metric.fastMode : ledger.items[index].fastMode,
          observedAt: now,
        };
        saveDailyLedger(ledger);
        return;
      }
    }
    if (ledger.items.some((item) => item.key === key && now - toCount(item.observedAt) < 10000)) return;
    ledger.items.push({
      key,
      turnId,
      usage,
      model,
      fastMode: typeof metric.fastMode === "boolean" ? metric.fastMode : null,
      observedAt: now,
    });
    saveDailyLedger(ledger);
  }

  function todayCost() {
    const localBucket = localDailyUsage().get(todayKey());
    if (toCount(localBucket?.tokens) > 0) return { value: Number(localBucket.cost) || 0, priced: true };
    const ledger = loadDailyLedger();
    return ledger.items.reduce(
      (sum, item) => {
        const cost = costForModelUsage(normalizeUsage(item.usage), item.model, { ensure: true, fastMode: item.fastMode === true });
        sum.value += cost.value;
        sum.priced = sum.priced && cost.priced;
        return sum;
      },
      { value: 0, priced: true },
    );
  }

  function isCodexApiUrl(url) {
    const text = String(url || "");
    return /\/(responses|chat\/completions|conversation|thread|api)\b/i.test(text) || /codex/i.test(text);
  }

  function isProfileUsageUrl(url) {
    return /\/wham\/profiles\/me(?:[?#].*)?$/i.test(String(url || ""));
  }

  function isProfilePhotoUrl(url) {
    return /\/wham\/profiles\/me\/photo(?:[?#].*)?$/i.test(String(url || ""));
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    return input?.url || String(input || "");
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function extractSessionKeyFromUrl(value) {
    const text = normalizeText(String(value || ""), 1000);
    if (!text) return "";
    try {
      const url = new URL(text, "app://-/");
      for (const key of ["threadId", "thread_id", "conversationId", "conversation_id", "sessionId", "session_id", "chatId", "chat_id"]) {
        const candidate = normalizeText(url.searchParams.get(key), 240);
        if (candidate) return candidate;
      }
      const path = decodeURIComponent(url.pathname || "");
      const pathMatch = path.match(/\/(?:c|chat|chats|conversation|conversations|thread|threads|session|sessions)\/([^/?#]+)/i);
      if (pathMatch?.[1]) return normalizeText(pathMatch[1], 240);
    } catch {
      // Fall through to regex parsing below.
    }
    const regexMatch = text.match(/[?&](?:threadId|thread_id|conversationId|conversation_id|sessionId|session_id|chatId|chat_id)=([^&#]+)/i);
    if (regexMatch?.[1]) return normalizeText(decodeURIComponent(regexMatch[1]), 240);
    return "";
  }

  function extractSessionInfo(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return "";
    if (typeof value === "string") {
      const fromUrl = extractSessionKeyFromUrl(value);
      if (fromUrl) return fromUrl;
      const parsed = parseMaybeJson(value);
      return parsed ? extractSessionInfo(parsed, depth + 1, seen) : "";
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const key = extractSessionInfo(item, depth + 1, seen);
        if (key) return key;
      }
      return "";
    }
    if (typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);

    const direct = normalizeText(
      value.threadId ??
        value.thread_id ??
        value.currentThreadId ??
        value.current_thread_id ??
        value.conversationId ??
        value.conversation_id ??
        value.currentConversationId ??
        value.current_conversation_id ??
        value.sessionId ??
        value.session_id ??
        value.chatId ??
        value.chat_id ??
        value.turn?.threadId ??
        value.turn?.thread_id ??
        value.turn?.conversationId ??
        value.turn?.conversation_id ??
        value.thread?.id ??
        value.thread?.threadId ??
        value.thread?.thread_id ??
        value.conversation?.id ??
        value.session?.id ??
        value.params?.threadId ??
        value.params?.thread_id ??
        value.params?.conversationId ??
        value.params?.conversation_id ??
        value.params?.sessionId ??
        value.params?.session_id ??
        value.params?.turn?.threadId ??
        value.params?.turn?.thread_id ??
        value.params?.turn?.conversationId ??
        value.params?.turn?.conversation_id ??
        value.params?.thread?.id ??
        value.params?.conversation?.id ??
        value.params?.session?.id ??
        value.request?.conversationId ??
        value.request?.conversation_id ??
        value.request?.threadId ??
        value.request?.thread_id ??
        value.request?.params?.conversationId ??
        value.request?.params?.conversation_id ??
        value.request?.params?.threadId ??
        value.request?.params?.thread_id ??
        value.request?.params?.sessionId ??
        value.request?.params?.session_id ??
        value.request?.params?.turn?.threadId ??
        value.request?.params?.turn?.thread_id ??
        value.request?.params?.thread?.id,
      240,
    );
    if (direct) return direct;
    for (const key of ["url", "href", "request", "params", "data", "payload", "message", "thread", "conversation", "session", "turn", "body", "bodyJsonString", "result", "response"]) {
      const found = extractSessionInfo(value[key], depth + 1, seen);
      if (found) return found;
    }
    return "";
  }

  function observeSessionInfo(value) {
    const raw = extractSessionInfo(value);
    if (!raw) return false;
    const key = resolveSessionKey(raw);
    if (!key) return false;
    state.detectedSessionKey = key;
    state.detectedSessionKeyAt = Date.now();
    state.newConversationSessionKey = "";
    state.newConversationSessionKeyAt = 0;
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    return true;
  }

  function shouldPersistUsagePayload(payload, source) {
    const text = String(source || "");
    if (/body|websocket/i.test(text)) return false;
    if (/^(fetch|xhr)$/i.test(text)) return true;
    if (/message/i.test(text)) {
      const status = toCount(payload?.status);
      return payload?.type === "fetch-response" && (!status || (status >= 200 && status < 300));
    }
    return true;
  }

  function isTokenCountPayload(payload, depth = 0) {
    if (!payload || depth > 2) return false;
    if (typeof payload === "string") {
      try {
        return isTokenCountPayload(JSON.parse(payload), depth + 1);
      } catch {
        return false;
      }
    }
    if (typeof payload !== "object") return false;
    const item = payload?.payload?.type === "token_count" ? payload.payload : payload;
    return item?.type === "token_count" && item.info && typeof item.info === "object";
  }

  function isTaskCompletePayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return false;
    if (typeof payload === "string") {
      try {
        return isTaskCompletePayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            if (isTaskCompletePayload(JSON.parse(fragment), depth + 1, seen)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(payload)) return payload.some((item) => isTaskCompletePayload(item, depth + 1, seen));
    if (typeof payload !== "object" || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.type === "task_complete" || payload.event === "task_complete") return true;
    if (payload.method === "turn/completed") {
      const status = normalizeText(payload.params?.turn?.status || payload.params?.status, 40);
      if (!status || status === "completed") return true;
    }
    if (payload.method === "thread/status/changed") {
      const status = payload.params?.status;
      if (normalizeText(status?.type || status, 40) === "idle") return true;
    }
    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload && isTaskCompletePayload(payload[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function extractJsonFragmentsFromSse(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
  }

  function collectUsages(value, depth = 0, out = [], seen = new WeakSet()) {
    if (!value || depth > 8) return out;
    if (typeof value === "string") {
      try {
        collectUsages(JSON.parse(value), depth + 1, out, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(value)) {
          try {
            collectUsages(JSON.parse(fragment), depth + 1, out, seen);
          } catch {
            // Ignore malformed stream fragments.
          }
        }
      }
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectUsages(item, depth + 1, out, seen));
      return out;
    }
    if (typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);

    for (const key of ["usage", "last", "lastUsage", "last_usage", "lastTokenUsage", "last_token_usage"]) {
      const usage = normalizeUsage(value[key]);
      if (usage.exact) out.push(usage);
    }
    const self = normalizeUsage(value);
    if (self.exact) {
      out.push(self);
      return out;
    }
    for (const key of [
      "response",
      "payload",
      "info",
      "data",
      "body",
      "bodyJsonString",
      "body_json_string",
      "bodyText",
      "body_text",
      "responseText",
      "response_text",
      "message",
      "result",
      "event",
      "params",
      "tokenUsage",
      "token_usage",
      "contextUsage",
      "context_usage",
      "response_metadata",
    ]) {
      collectUsages(value[key], depth + 1, out, seen);
    }
    return out;
  }

  function sourceMayContainAssistantResult(source) {
    return !/body/i.test(String(source || ""));
  }

  function textLooksBlockedForResult(text) {
    return /\b(reasoning|thinking|thought|analysis|tool|function|command|usage|context|status|progress|heartbeat|ping)\b/i.test(String(text || ""));
  }

  function textLooksLikeResultCarrier(text) {
    return /\b(output_text|output\.text|content|message|assistant_message|text_delta|content_delta|final_answer|answer)\b/i.test(String(text || ""));
  }

  function hasAssistantResultOutputStarted(value, source = "", depth = 0, seen = new WeakSet(), context = {}) {
    if (!sourceMayContainAssistantResult(source) || !value || depth > 8) return false;
    if (typeof value === "string") {
      try {
        return hasAssistantResultOutputStarted(JSON.parse(value), source, depth + 1, seen, context);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(value)) {
          try {
            if (hasAssistantResultOutputStarted(JSON.parse(fragment), source, depth + 1, seen, context)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(value)) {
      return value.some((item) => hasAssistantResultOutputStarted(item, source, depth + 1, seen, context));
    }
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    const descriptor = normalizeText(
      [
        value.type,
        value.event,
        value.name,
        value.kind,
        value.role,
        value.author?.role,
        value.message?.role,
        value.delta?.role,
      ]
        .filter(Boolean)
        .join(" "),
      400,
    ).toLowerCase();
    const blocked = Boolean(context.blocked || textLooksBlockedForResult(descriptor) || (/\b(user|system)\b/i.test(descriptor) && !/\bassistant\b/i.test(descriptor)));
    const assistant = Boolean(context.assistant || /\bassistant\b/i.test(descriptor));
    const resultCarrier = Boolean(context.resultCarrier || textLooksLikeResultCarrier(descriptor));
    const directTextKeys = ["delta", "text", "content", "output_text", "outputText", "markdown", "value"];

    if ((assistant || resultCarrier) && !blocked) {
      for (const key of directTextKeys) {
        if (typeof value[key] === "string" && normalizeText(value[key], 2000)) return true;
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const keyText = String(key || "");
      const nextContext = {
        assistant,
        resultCarrier: resultCarrier || /^(output|outputs|message|messages|content|delta|response|result)$/i.test(keyText),
        blocked: blocked || textLooksBlockedForResult(keyText),
      };
      if (hasAssistantResultOutputStarted(child, source, depth + 1, seen, nextContext)) return true;
    }
    return false;
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function isComposerDraftPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 5) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? isComposerDraftPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => isComposerDraftPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const type = normalizeText(value.type, 120);
    const key = normalizeText(value.key, 160);
    if (type === "persisted-atom-updated" && /^composer-prompt-drafts-v\d+$/i.test(key)) return true;
    return ["payload", "message", "data", "body"].some((field) => isComposerDraftPayload(value[field], depth + 1, seen));
  }

  function isBackgroundCodexPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 4) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? isBackgroundCodexPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => isBackgroundCodexPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const descriptor = [
      value.type,
      value.action,
      value.method,
      value.name,
      value.operation,
      value.op,
      value.key,
      value.url,
      value.path,
      value.endpoint,
    ]
      .map((item) => normalizeText(item, 160).toLowerCase())
      .filter(Boolean)
      .join(" ");
    if (/(composer-prompt-drafts|draft|title|summary|summariz|profile|sentry|telemetry)/i.test(descriptor)) return true;
    return ["request", "params", "data", "payload", "message", "body"].some((field) => isBackgroundCodexPayload(value[field], depth + 1, seen));
  }

  function hasUserTurnContent(value) {
    if (!value || typeof value !== "object") return false;
    for (const key of ["input", "prompt", "messages", "message", "user_message", "userMessage", "userInput", "content", "items"]) {
      if (!Object.hasOwn(value, key)) continue;
      const item = value[key];
      if (Array.isArray(item) ? item.length > 0 : item != null && item !== "") return true;
    }
    return false;
  }

  function shouldStartTurnFromRequestPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 6) return false;
    if (isComposerDraftPayload(value) || isBackgroundCodexPayload(value)) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? shouldStartTurnFromRequestPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => shouldStartTurnFromRequestPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    const type = normalizeText(value.type ?? value.event ?? value.action ?? value.method, 160).toLowerCase().replace(/[\s-]+/g, "_");
    if (/(^|_)(user_message|submit_message|send_message|create_turn|start_turn|turn_start|conversation_turn|codex_turn)(_|$)/i.test(type)) return true;
    if (hasUserTurnContent(value) && (extractSessionInfo(value) || extractModelInfo(value).model || extractFastMode(value) !== null)) return true;

    for (const key of ["request", "params", "data", "payload", "message", "turn", "body", "bodyJsonString"]) {
      if (shouldStartTurnFromRequestPayload(value[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function extractModelInfo(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return { model: "", effort: "" };
    if (typeof value === "string") {
      const parsed = extractModelInfo(parseMaybeJson(value), depth + 1, seen);
      return parsed.model || parsed.effort ? parsed : { model: "", effort: "" };
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const info = extractModelInfo(item, depth + 1, seen);
        if (info.model || info.effort) return info;
      }
      return { model: "", effort: "" };
    }
    if (typeof value !== "object" || seen.has(value)) return { model: "", effort: "" };
    seen.add(value);

    const body = parseMaybeJson(value.body);
    if (body && body !== value) {
      const info = extractModelInfo(body, depth + 1, seen);
      if (info.model || info.effort) return info;
    }

    const model = normalizeText(
      value.model ??
        value.modelId ??
        value.model_id ??
        value.toModel ??
        value.threadSettings?.model ??
        value.settings?.model ??
        value.collaborationMode?.settings?.model ??
        value.params?.model ??
        value.params?.threadSettings?.model ??
        value.params?.settings?.model ??
        value.params?.collaborationMode?.settings?.model ??
        value.request?.params?.model ??
        value.body?.model,
    );
    const effort = normalizeText(
      value.reasoning_effort ??
        value.reasoningEffort ??
        value.effort ??
        value.thinking?.type ??
        value.threadSettings?.reasoning_effort ??
        value.threadSettings?.effort ??
        value.settings?.reasoning_effort ??
        value.settings?.effort ??
        value.params?.reasoning_effort ??
        value.params?.effort ??
        value.params?.threadSettings?.effort ??
        value.request?.params?.reasoning_effort ??
        value.request?.params?.effort,
      60,
    );
    if (model || effort) return { model, effort };

    for (const key of ["request", "params", "data", "payload", "message", "threadSettings", "settings", "collaborationMode"]) {
      const info = extractModelInfo(value[key], depth + 1, seen);
      if (info.model || info.effort) return info;
    }
    return { model: "", effort: "" };
  }

  function todayUsage() {
    const localBucket = localDailyUsage().get(todayKey());
    if (toCount(localBucket?.tokens) > 0) {
      return {
        input: toCount(localBucket.input),
        output: toCount(localBucket.output),
        cached: toCount(localBucket.cached),
        total: toCount(localBucket.tokens),
        exact: true,
      };
    }
    const ledger = loadDailyLedger();
    return ledger.items.reduce((sum, item) => addUsage(sum, normalizeUsage(item.usage)), { input: 0, output: 0, cached: 0, total: 0, exact: true });
  }

  function normalizeReasoningEffort(value) {
    const text = normalizeText(String(value ?? ""), 60).toLowerCase().replace(/[\s-]+/g, "_");
    if (!text) return "";
    if (text === "extra_high" || text === "extra" || text === "very_high") return "xhigh";
    if (text === "maximum") return "max";
    if (["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(text)) return text;
    return text.slice(0, 60);
  }

  function extractFastMode(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return null;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed) return extractFastMode(parsed, depth + 1, seen);
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const detected = extractFastMode(item, depth + 1, seen);
        if (detected !== null) return detected;
      }
      return null;
    }
    if (typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);

    for (const key of ["fast_mode", "fastMode", "isFastMode", "useFastMode"]) {
      if (typeof value[key] === "boolean") return value[key];
    }
    for (const key of ["serviceTier", "service_tier", "speedTier", "speed_tier"]) {
      if (!Object.hasOwn(value, key)) continue;
      const raw = value[key];
      if (raw == null || raw === "") return false;
      const text = normalizeText(String(raw), 80).toLowerCase().replace(/[\s-]+/g, "_");
      if (text === "fast" || text === "fast_mode" || text === "priority") return true;
      if (["standard", "normal", "regular", "default"].includes(text)) return false;
    }
    for (const key of ["request", "params", "data", "payload", "message", "turnStartParams", "body"]) {
      const detected = extractFastMode(value[key], depth + 1, seen);
      if (detected !== null) return detected;
    }
    return null;
  }

  function countsTowardFastModeUsage(turn) {
    const usage = normalizeUsage(turn?.usage);
    return turn?.source === "codex-live-token-cost" && usage.exact && toCount(usage.total) > 0;
  }

  function normalizeProfileInvocation(value) {
    if (!value || typeof value !== "object") return null;
    const type = normalizeText(String(value.type ?? value.kind ?? ""), 30).toLowerCase();
    const pluginName = normalizeText(value.plugin_name ?? value.pluginName ?? (type === "plugin" ? value.name : ""), 80).replace(/^\$+/, "");
    const skillName = normalizeText(value.skill_name ?? value.skillName ?? (type === "skill" ? value.name : ""), 80);
    const pluginId = normalizeText(value.plugin_id ?? value.pluginId, 120).replace(/^\$+/, "");
    const skillId = normalizeText(value.skill_id ?? value.skillId, 120);
    if (pluginName || pluginId) {
      return { type: "plugin", ...(pluginId ? { plugin_id: pluginId } : {}), ...(pluginName ? { plugin_name: pluginName } : {}) };
    }
    if (skillName || skillId) {
      return { type: "skill", ...(skillId ? { skill_id: skillId } : {}), ...(skillName ? { skill_name: skillName } : {}) };
    }
    return null;
  }

  function collectProfileInvocations(value, depth = 0, out = [], seen = new WeakSet()) {
    if (!value || depth > 7) return out;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed) collectProfileInvocations(parsed, depth + 1, out, seen);
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectProfileInvocations(item, depth + 1, out, seen));
      return out;
    }
    if (typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);

    const invocation = normalizeProfileInvocation(value);
    if (invocation) out.push(invocation);
    for (const key of ["tool_invocations", "toolInvocations", "tool_calls", "toolCalls", "invocations", "plugins", "skills", "tools", "request", "params", "data", "payload", "message", "result", "body"]) {
      collectProfileInvocations(value[key], depth + 1, out, seen);
    }
    return out;
  }

  function profileInvocationKey(invocation) {
    return [invocation.type, invocation.plugin_id || "", invocation.plugin_name || "", invocation.skill_id || "", invocation.skill_name || ""].join("\u0001");
  }

  function localProfileActivityStats(turns) {
    const effortCounts = new Map();
    let effortTotal = 0;
    let fastTotal = 0;
    let fastCount = 0;
    const skillKeys = new Set();
    let totalSkillsUsed = 0;
    const pluginKeys = new Set();
    let totalPluginsUsed = 0;
    let longestRunningTurnSec = 0;
    const invocationCounts = new Map();

    for (const turn of turns) {
      const effort = normalizeReasoningEffort(turn?.effort);
      if (effort) {
        effortCounts.set(effort, (effortCounts.get(effort) || 0) + 1);
        effortTotal++;
      }
      if (countsTowardFastModeUsage(turn)) {
        const tokens = toCount(normalizeUsage(turn.usage).total);
        fastTotal += tokens;
        if (turn.fastMode === true) fastCount += tokens;
      }
      const durationMs = normalizedDurationMs(turn);
      if (durationMs > 0) longestRunningTurnSec = Math.max(longestRunningTurnSec, Math.round(durationMs / 1000));
      const invocations = Array.isArray(turn?.invocations) ? turn.invocations : [];
      for (const rawInvocation of invocations) {
        const invocation = normalizeProfileInvocation(rawInvocation);
        if (!invocation) continue;
        if (invocation.type === "skill") {
          totalSkillsUsed++;
          const skillKey = normalizeText(invocation.skill_id || invocation.skill_name, 120);
          if (skillKey) skillKeys.add(skillKey);
        }
        if (invocation.type === "plugin") {
          totalPluginsUsed++;
          const pluginKey = normalizeText(invocation.plugin_id || invocation.plugin_name, 120);
          if (pluginKey) pluginKeys.add(pluginKey);
        }
        const key = profileInvocationKey(invocation);
        const item = invocationCounts.get(key) || { ...invocation, usage_count: 0 };
        item.usage_count++;
        invocationCounts.set(key, item);
      }
    }

    let topEffort = null;
    let topEffortCount = 0;
    for (const [effort, count] of effortCounts) {
      if (count > topEffortCount || (count === topEffortCount && effort < String(topEffort || ""))) {
        topEffort = effort;
        topEffortCount = count;
      }
    }

    return {
      fastModePercent: fastTotal ? Math.round((fastCount / fastTotal) * 100) : null,
      fastModeCount: fastCount,
      fastModeTotal: fastTotal,
      longestRunningTurnSec,
      reasoningEffort: topEffort,
      reasoningEffortPercent: effortTotal && topEffortCount ? Math.round((topEffortCount / effortTotal) * 100) : null,
      uniqueSkillsUsed: skillKeys.size,
      totalSkillsUsed,
      uniquePluginsUsed: pluginKeys.size,
      totalPluginsUsed,
      topInvocations: Array.from(invocationCounts.values())
        .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)))
        .slice(0, 5),
      topPlugins: Array.from(invocationCounts.values())
        .filter((item) => item.type === "plugin")
        .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)))
        .slice(0, 5),
    };
  }

  function normalizeHelperStatsPayload(payload) {
    const stats = payload?.stats && typeof payload.stats === "object" ? payload.stats : payload;
    if (!stats || typeof stats !== "object") return null;
    const normalizeInvocations = (items) =>
      (Array.isArray(items) ? items : [])
      .map((item) => {
        const invocation = normalizeProfileInvocation(item);
        const usageCount = toCount(item?.usage_count ?? item?.usageCount ?? item?.count);
        return invocation && usageCount ? { ...invocation, usage_count: usageCount } : null;
      })
      .filter(Boolean)
      .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)))
      .slice(0, 5);
    const rawInvocations = Array.isArray(stats.top_invocations) ? stats.top_invocations : Array.isArray(stats.topInvocations) ? stats.topInvocations : [];
    const rawPlugins = Array.isArray(stats.top_plugins) ? stats.top_plugins : Array.isArray(stats.topPlugins) ? stats.topPlugins : [];
    const topInvocations = normalizeInvocations(rawInvocations);
    const topPlugins = normalizeInvocations(rawPlugins).filter((item) => item.type === "plugin");
    return {
      uniqueSkillsUsed: toCount(stats.unique_skills_used ?? stats.uniqueSkillsUsed),
      totalSkillsUsed: toCount(stats.total_skills_used ?? stats.totalSkillsUsed),
      uniquePluginsUsed: toCount(stats.unique_plugins_used ?? stats.uniquePluginsUsed),
      totalPluginsUsed: toCount(stats.total_plugins_used ?? stats.totalPluginsUsed),
      totalThreads: toCount(stats.total_threads ?? stats.totalThreads ?? stats.codex_total_threads ?? stats.codexThreadCount ?? stats.codex_threads?.total_threads),
      codexThreads: stats.codex_threads && typeof stats.codex_threads === "object" ? stats.codex_threads : null,
      topInvocations,
      topPlugins,
      source: normalizeText(payload?.source || stats.source || "local-helper", 80),
      updatedAt: normalizeText(payload?.updated_at || payload?.updatedAt || stats.updated_at || stats.updatedAt, 40),
    };
  }

  function mergeHelperStats(payload) {
    const normalized = normalizeHelperStatsPayload(payload);
    if (!normalized) return false;
    state.helperStats = normalized;
    state.helperStatsAt = Date.now();
    setHelperStatus(HELPER_STATUS_CONNECTED, false);
    scheduleRender();
    return true;
  }

  function helperStatusText() {
    return state.helperStatus || HELPER_STATUS_DEFAULT;
  }

  function setHelperStatus(message, unavailable = false) {
    state.helperStatus = normalizeText(message, 220) || HELPER_STATUS_DEFAULT;
    state.helperUnavailable = Boolean(unavailable);
    state.helperCheckedAt = Date.now();
    const status = settingsEditorRoot()?.querySelector("[data-field='helper-status']");
    if (status) {
      status.textContent = helperStatusText();
      status.setAttribute("data-helper-unavailable", state.helperUnavailable ? "true" : "false");
    }
    scheduleRender();
  }

  function mergeActivityWithHelperStats(activity) {
    const helper = state.helperStats;
    if (!helper) return activity;
    return {
      ...activity,
      uniqueSkillsUsed: helper.uniqueSkillsUsed || activity.uniqueSkillsUsed,
      totalSkillsUsed: helper.totalSkillsUsed || activity.totalSkillsUsed,
      uniquePluginsUsed: helper.uniquePluginsUsed || activity.uniquePluginsUsed,
      totalPluginsUsed: helper.totalPluginsUsed || activity.totalPluginsUsed,
      topInvocations: helper.topInvocations.length ? helper.topInvocations : activity.topInvocations,
      topPlugins: helper.topPlugins.length ? helper.topPlugins : activity.topPlugins,
    };
  }

  function observeModelInfo(payload) {
    const info = extractModelInfo(payload);
    let changed = false;
    if (info.model && info.model !== state.detectedModel) {
      state.detectedModel = info.model;
      changed = true;
    }
    if (info.effort && info.effort !== state.detectedEffort) {
      state.detectedEffort = info.effort;
      changed = true;
    }
    return changed;
  }

  function setLocalTurnTimer(sessionKey, timer) {
    const key = localStateSessionKey(sessionKey);
    if (timer) state.localTurnTimers.set(key, timer);
    else state.localTurnTimers.delete(key);
    state.localTurnTimer = isActiveLocalStateSession(key) ? timer || 0 : state.localTurnTimer;
  }

  function clearLocalTurnTimer(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    const timer = state.localTurnTimers.get(key) || (isActiveLocalStateSession(key) ? state.localTurnTimer : 0);
    if (!timer) return;
    try {
      window.clearTimeout?.(timer);
    } catch {
      // Timer cleanup is best effort.
    }
    state.localTurnTimers.delete(key);
    if (isActiveLocalStateSession(key)) state.localTurnTimer = 0;
  }

  function turnShimmerState(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    return state.turnShimmerSessions.get(key) || { running: false, startedAt: 0, outputStartedAt: 0 };
  }

  function syncActiveTurnShimmerState() {
    const item = turnShimmerState(currentSessionKey());
    state.turnShimmerRunning = Boolean(item.running);
    state.turnShimmerStartedAt = toCount(item.startedAt);
    state.turnShimmerOutputStartedAt = toCount(item.outputStartedAt);
    return item;
  }

  function setTurnShimmerState(sessionKey, item) {
    const key = localStateSessionKey(sessionKey);
    state.turnShimmerSessions.set(key, item);
    syncActiveTurnShimmerState();
    return item;
  }

  function isTurnShimmerRunning(sessionKey = currentSessionKey()) {
    return Boolean(turnShimmerState(sessionKey).running);
  }

  function startTurnShimmer(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const item = turnShimmerState(sessionKey);
    if (item.running) return false;
    setTurnShimmerState(sessionKey, { running: true, startedAt: Date.now(), outputStartedAt: 0 });
    scheduleRender(0);
    return true;
  }

  function stopTurnShimmer(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const item = turnShimmerState(sessionKey);
    if (!item.running) return false;
    setTurnShimmerState(sessionKey, { ...item, running: false, outputStartedAt: Date.now() });
    if (isActiveLocalStateSession(sessionKey)) stopCadencedShimmer({ finishActive: options.finishActive !== false });
    scheduleRender(0);
    return true;
  }

  function isVisibleElement(node) {
    try {
      const style = window.getComputedStyle?.(node);
      const rect = node.getBoundingClientRect?.();
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
      if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function isCodexComposerCompleteDom() {
    return false;
  }

  function isCodexTaskRunningDom() {
    const sessionKey = localStateSessionKey(currentSessionKey());
    return Boolean(localCurrentTurn(sessionKey) || isTurnShimmerRunning(sessionKey));
  }

  function finishActiveTurnFromDomIfStopped() {
    const running = isCodexTaskRunningDom();
    if (running !== state.taskRunningDom) {
      state.taskRunningDom = running;
      scheduleRender(0);
    }
    return false;
  }

  function installTaskRunningObserver() {
    state.taskRunningDom = isCodexTaskRunningDom();
  }

  function restoreRunningCurrentTurnFromLast(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    if (localCurrentTurn(key) || !isTurnShimmerRunning(key)) return false;
    const last = state.localLast;
    if (!last || last.source !== "codex-live-token-cost") return false;
    if (!sameSessionKey(turnSessionKey(last), key)) return false;
    const usage = normalizeUsage(last.usage);
    if (!usage.exact) return false;
    setLocalCurrentTurn({
      id: normalizeText(last.turnId, 120) || `${Date.now()}-${++state.localTurnSeq}`,
      sessionKey: key,
      startedAt: toCount(Date.parse(last.startedAt || last.createdAt)) || Date.now(),
      calls: [{ usage, source: "restored-idle", observedAt: toCount(last.observedAt) || Date.now() }],
      context: {
        effort: normalizeReasoningEffort(last.effort),
        fastMode: typeof last.fastMode === "boolean" ? last.fastMode : null,
        invocations: Array.isArray(last.invocations) ? last.invocations : [],
      },
    }, key);
    startTurnShimmer({ sessionKey: key });
    return true;
  }

  function finishLocalTurn(delay = 0, options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    clearLocalTurnTimer(sessionKey);
    if (!localCurrentTurn(sessionKey)) return;
    const reason = normalizeText(options.reason || "complete", 40) || "complete";
    void delay;
    persistLocalCurrentTurn(reason, sessionKey);
    setLocalCurrentTurn(null, sessionKey);
    stopTurnShimmer({ finishActive: true, sessionKey });
    scheduleRender();
  }

  function scheduleLocalTurnCompletionCheck(delay = 0, options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    clearLocalTurnTimer(sessionKey);
    if (!localCurrentTurn(sessionKey)) return;
    persistLocalCurrentTurn("live", sessionKey);
    if (!isActiveLocalStateSession(sessionKey)) {
      scheduleRender();
      return;
    }
    state.taskRunningDom = isCodexTaskRunningDom();
    scheduleRender();
  }

  function beginLocalTurn(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const forceNewIfUsed = Boolean(options?.forceNewIfUsed);
    clearLocalTurnTimer(sessionKey);
    const current = localCurrentTurn(sessionKey);
    if (current) {
      if (!forceNewIfUsed || !current.calls?.length) return current;
      persistLocalCurrentTurn("interrupted", sessionKey);
      setLocalCurrentTurn(null, sessionKey);
    }
    const turn = {
      id: `${Date.now()}-${++state.localTurnSeq}`,
      sessionKey,
      startedAt: Date.now(),
      calls: [],
      context: { effort: "", fastMode: null, invocations: [] },
    };
    setLocalCurrentTurn(turn, sessionKey);
    startTurnShimmer({ sessionKey });
    return turn;
  }

  function beginLocalRequestTurn(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const current = localCurrentTurn(sessionKey);
    const shimmer = turnShimmerState(sessionKey);
    const forceNewIfUsed = Boolean(current?.calls?.length && shimmer.outputStartedAt && !shimmer.running);
    return beginLocalTurn({ ...options, sessionKey, forceNewIfUsed });
  }

  function normalizeProfileContext(context = {}) {
    return {
      effort: normalizeReasoningEffort(context.effort),
      fastMode: typeof context.fastMode === "boolean" ? context.fastMode : null,
      invocations: Array.isArray(context.invocations) ? context.invocations.map(normalizeProfileInvocation).filter(Boolean) : [],
    };
  }

  function hasProfileContext(context = {}) {
    const normalized = normalizeProfileContext(context);
    return Boolean(normalized.effort || typeof normalized.fastMode === "boolean" || normalized.invocations.length);
  }

  function mergeProfileContext(base = {}, next = {}) {
    const left = normalizeProfileContext(base);
    const right = normalizeProfileContext(next);
    const seen = new Set();
    const invocations = [];
    for (const invocation of [...left.invocations, ...right.invocations]) {
      const key = profileInvocationKey(invocation);
      if (seen.has(key)) continue;
      seen.add(key);
      invocations.push(invocation);
    }
    return {
      effort: right.effort || left.effort,
      fastMode: typeof right.fastMode === "boolean" ? right.fastMode : left.fastMode,
      invocations,
    };
  }

  function localTurnMetric(turn, now = Date.now()) {
    if (!turn?.calls?.length) return null;
    const aggregate = aggregateTurnUsage(turn);
    if (!normalizeUsage(aggregate).exact) return null;
    const startedAt = toCount(turn.startedAt) || now;
    const durationMs = Math.max(0, now - startedAt);
    return {
      usage: aggregate,
      turnId: turn.id,
      sessionKey: turn.sessionKey,
      source: "codex-live-token-cost",
      callCount: turn.calls.length,
      model: modelName(),
      effort: normalizeReasoningEffort(turn.context?.effort || activeModelInfo().effort),
      fastMode: typeof turn.context?.fastMode === "boolean" ? turn.context.fastMode : null,
      invocations: Array.isArray(turn.context?.invocations) ? turn.context.invocations : [],
      createdAt: new Date(startedAt).toISOString(),
      observedAt: now,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(now).toISOString(),
      durationMs,
      durationSec: Math.round(durationMs / 1000),
    };
  }

  function persistLocalCurrentTurn(reason = "persist", sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    if (isTransientSessionKey(key)) return false;
    const metric = localTurnMetric(localCurrentTurn(key));
    if (!metric) return false;
    ensurePriceForModel(metric.model);
    state.localLast = { ...metric, persistReason: reason };
    state.localLedger = state.localLedger.filter((item) => item.turnId !== metric.turnId).concat(state.localLast).slice(-LOCAL_LEDGER_LIMIT);
    state.localPersistedUsage.set(usageKey(metric.usage), Date.now());
    saveLocalLedger();
    rememberDailyUsage(metric);
    scheduleProfileUsageRefresh();
    return true;
  }

  function rememberLocalUsage(rawUsage, source = "network", context = {}, options = {}) {
    const usage = normalizeUsage(rawUsage);
    if (!usage.exact) return false;
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const now = Date.now();
    const key = usageKey(usage);
    const persist = options.persist ?? shouldPersistUsagePayload(null, source);
    const previousAt = state.localSeenUsage.get(key) || 0;
    if (!persist && now - previousAt < 3000) return false;
    state.localSeenUsage.set(key, now);
    for (const [seenKey, seenAt] of state.localSeenUsage) {
      if (now - seenAt > 10000) state.localSeenUsage.delete(seenKey);
    }
    if (persist) {
      const persistedAt = state.localPersistedUsage.get(key) || 0;
      if (now - persistedAt < 10000) return false;
      state.localPersistedUsage.set(key, now);
      for (const [seenKey, seenAt] of state.localPersistedUsage) {
        if (now - seenAt > 30000) state.localPersistedUsage.delete(seenKey);
      }
    }
    const turn = beginLocalTurn({ sessionKey });
    turn.context = mergeProfileContext(turn.context, context);
    const existing = turn.calls.find((call) => usageKey(call.usage) === key);
    if (existing) {
      existing.source = source;
      existing.observedAt = now;
      existing.usage = usage;
    } else {
      turn.calls.push({ usage, source, observedAt: now });
    }
    const metric = localTurnMetric(turn, now);
    if (!metric) return false;
    ensurePriceForModel(metric.model);
    scheduleProfileUsageRefresh();
    if (!persist) return true;
    persistLocalCurrentTurn("final", sessionKey);
    scheduleRender();
    return true;
  }

  function inspectLocalPayload(payload, source) {
    if (isComposerDraftPayload(payload)) return false;
    const rawSessionKey = extractSessionInfo(payload);
    const payloadSessionKey = rawSessionKey ? resolveSessionKey(rawSessionKey) : "";
    const sessionKey = localStateSessionKey(payloadSessionKey || currentSessionKey());
    const sessionChanged = observeSessionInfo(payload);
    const info = extractModelInfo(payload);
    const modelChanged = observeModelInfo(payload);
    const resultOutputStarted = hasAssistantResultOutputStarted(payload, source);
    const tokenCountPayload = isTokenCountPayload(payload);
    const taskCompletePayload = isTaskCompletePayload(payload);
    const fastMode = extractFastMode(payload);
    const invocations = collectProfileInvocations(payload);
    const explicitContext = normalizeProfileContext({
      effort: info.effort,
      fastMode,
      invocations,
    });
    const requestStart = /body/i.test(String(source || "")) && shouldStartTurnFromRequestPayload(payload);
    if (requestStart) beginLocalRequestTurn({ sessionKey });
    if (hasProfileContext(explicitContext) && /body|websocket/i.test(String(source || ""))) {
      const turn = localCurrentTurn(sessionKey) || (requestStart ? beginLocalRequestTurn({ sessionKey }) : null);
      if (turn) turn.context = mergeProfileContext(turn.context, explicitContext);
    }
    const turnContext = localCurrentTurn(sessionKey)?.context || {};
    const context = normalizeProfileContext({
      effort: info.effort || turnContext.effort || state.detectedEffort || activeModelInfo().effort,
      fastMode: typeof fastMode === "boolean" ? fastMode : turnContext.fastMode,
      invocations: invocations.length ? invocations : turnContext.invocations,
    });
    let changed = false;
    const persistUsage = shouldPersistUsagePayload(payload, source);
    for (const usage of collectUsages(payload)) {
      changed = rememberLocalUsage(usage, source, context, { persist: persistUsage, sessionKey }) || changed;
    }
    if (taskCompletePayload) {
      persistLocalCurrentTurn("complete", sessionKey);
      stopTurnShimmer({ finishActive: true, sessionKey });
      finishLocalTurn(0, { reason: "complete", force: true, sessionKey });
    } else if (changed && !persistUsage && tokenCountPayload) persistLocalCurrentTurn("live", sessionKey);
    else if (changed && !persistUsage) scheduleLocalTurnCompletionCheck(0, { sessionKey });
    if (changed || modelChanged || sessionChanged || resultOutputStarted || taskCompletePayload) scheduleRender();
    return changed || modelChanged || sessionChanged || resultOutputStarted || taskCompletePayload;
  }

  function localUsageExport() {
    const current = localCurrentTurn(currentSessionKey());
    return {
      turns: state.localLedger.slice(),
      last: state.localLast,
      currentTurn: current
        ? {
            id: current.id,
            turnId: current.id,
            sessionKey: current.sessionKey,
            startedAt: current.startedAt,
            callCount: current.calls.length,
            durationMs: Math.max(0, Date.now() - toCount(current.startedAt)),
            usage: aggregateTurnUsage(current),
            model: modelName(),
            effort: normalizeReasoningEffort(current.context?.effort || activeModelInfo().effort),
            fastMode: typeof current.context?.fastMode === "boolean" ? current.context.fastMode : null,
            invocations: Array.isArray(current.context?.invocations) ? current.context.invocations : [],
          }
        : null,
    };
  }

  function debugSessionState() {
    ensureLocalLedgerLoaded();
    const counts = new Map();
    for (const turn of state.localLedger) {
      const key = turnSessionKey(turn) || "(none)";
      const usage = normalizeUsage(turn?.usage);
      const current = counts.get(key) || { sessionKey: key, turns: 0, total: 0, cached: 0 };
      current.turns += 1;
      current.total += toCount(usage.total);
      current.cached += toCount(usage.cached);
      counts.set(key, current);
    }
    return {
      version: VERSION,
      currentSessionKey: currentSessionKey(),
      activeSidebarThreadKey: activeSidebarThreadKey(),
      detectedSessionKey: recentDetectedSessionKey(),
      detectedModel: state.detectedModel,
      detectedEffort: state.detectedEffort,
      detectedFastMode: state.detectedFastMode,
      newConversationSessionKey: recentNewConversationSessionKey(),
      startupBlankConversationSessionKey: startupBlankConversationSessionKey(),
      lastClickedSidebarThreadKey: state.lastClickedSidebarThreadKey,
      ledgerSessions: Array.from(counts.values()).sort((a, b) => b.total - a.total || a.sessionKey.localeCompare(b.sessionKey)).slice(0, 20),
    };
  }

  function readTokenUsage() {
    return localUsageExport();
  }

  function sessionUsage(turns) {
    return turns.reduce((sum, turn) => addUsage(sum, normalizeUsage(turn?.usage)), {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
    });
  }

  function turnCost(turn, fallbackModel = modelName()) {
    const usage = normalizeUsage(turn?.usage);
    if (!usage.exact) return { value: 0, priced: true };
    const storedCost = Number(turn?.costUsd ?? turn?.totalCostUsd ?? turn?.total_cost_usd);
    if (Number.isFinite(storedCost) && storedCost >= 0) return { value: storedCost, priced: true };
    return costForModelUsage(usage, turn?.model || fallbackModel, { fastMode: turn?.fastMode === true });
  }

  function turnListCost(turns, fallbackUsage, fallbackModel = modelName()) {
    const items = Array.isArray(turns) ? turns : [];
    if (!items.length) return costForModelUsage(fallbackUsage, fallbackModel);
    return items.reduce(
      (sum, turn) => {
        const cost = turnCost(turn, fallbackModel);
        sum.value += cost.value;
        sum.priced = sum.priced && cost.priced;
        return sum;
      },
      { value: 0, priced: true },
    );
  }

  function mainEditable() {
    const now = Date.now();
    if (state.mainEditable && now - state.mainEditableAt < 1000 && state.mainEditable.isConnected !== false) return state.mainEditable;
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll("textarea,[contenteditable='true']"));
    } catch {
      nodes = [];
    }
    const height = window.innerHeight || document.documentElement?.clientHeight || 1000;
    const candidates = nodes
      .filter((node) => !state.root?.contains?.(node))
      .map((node) => ({ node, rect: node.getBoundingClientRect?.() || { width: 0, height: 0, bottom: 0, top: 0 } }))
      .filter(({ rect }) => rect.width >= 240 && rect.height >= 20 && rect.bottom > 0 && rect.top < height)
      .sort((a, b) => b.rect.bottom - a.rect.bottom);
    state.mainEditable = candidates[0]?.node || null;
    state.mainEditableAt = now;
    return state.mainEditable;
  }

  function isEditableTarget(target) {
    const editable = mainEditable();
    const closest = target?.closest?.("textarea,[contenteditable='true']");
    return Boolean(editable && (target === editable || closest === editable || editable.contains?.(target)));
  }

  function isMainComposerSurfaceTarget(target) {
    const editable = mainEditable();
    if (!editable || !target) return false;
    if (target === editable || editable.contains?.(target) || target.contains?.(editable)) return true;
    const form = editable.closest?.("form");
    if (form?.contains?.(target)) return true;
    const explicitSurface = editable.closest?.(".composer-surface-chrome,[data-codex-composer-surface],[data-testid*='composer']");
    if (explicitSurface?.contains?.(target)) return true;
    let node = editable.parentElement;
    for (let depth = 0; node && depth < 8; depth++) {
      if (node === document.body || node === document.documentElement || String(node.tagName || "").toUpperCase() === "MAIN") return false;
      if (node.contains?.(target)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function rememberPendingInput(event) {
    void event;
    return false;
  }

  function rememberSidebarThreadClick(event) {
    if (event?.type !== "click") return;
    const threadKey = sidebarThreadKeyFromNode(event.target);
    if (!threadKey) return;
    state.newConversationSessionKey = "";
    state.newConversationSessionKeyAt = 0;
    state.lastClickedSidebarThreadKey = resolveSessionKey(threadKey);
    state.lastClickedSidebarThreadAt = Date.now();
    state.userSelectedSidebarThreadKey = state.lastClickedSidebarThreadKey;
    state.userSelectedSidebarThreadAt = state.lastClickedSidebarThreadAt;
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    scheduleRender(0);
  }

  function rememberNewConversationClick(event) {
    if (event?.type !== "click") return false;
    const target = event.target?.closest?.("button,a,[role='button'],[aria-label],[title]") || event.target;
    const label = normalizeText(`${target?.getAttribute?.("aria-label") || ""} ${target?.getAttribute?.("title") || ""} ${target?.textContent || target?.innerText || ""}`, 160);
    if (!/(new\s*(chat|conversation|thread|task)|新建|新对话|新会话|新任务|新的对话|新的会话)/i.test(label)) return false;
    state.lastClickedSidebarThreadKey = "";
    state.lastClickedSidebarThreadAt = 0;
    state.userSelectedSidebarThreadKey = "";
    state.userSelectedSidebarThreadAt = 0;
    state.detectedSessionKey = "";
    state.detectedSessionKeyAt = 0;
    state.newConversationSessionKey = `new:${Date.now().toString(36)}`;
    state.newConversationSessionKeyAt = Date.now();
    scheduleRender(0);
    return true;
  }

  function handleDocumentClick(event) {
    if (rememberNewConversationClick(event)) return;
    rememberSidebarThreadClick(event);
    rememberPendingInput(event);
  }

  function liveSnapshot() {
    const sessionKey = currentSessionKey();
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    migrateLegacyLocationSessionTurns(sessionKey);
    if (!localCurrentTurn(sessionKey) && isCodexTaskRunningDom()) restoreRunningCurrentTurnFromLast(sessionKey);
    const source = readTokenUsage();
    const turns = currentSessionTurns(source.turns, sessionKey);
    const lastTurn = turnSessionKey(source.last) === sessionKey ? source.last : turns[turns.length - 1] || null;
    const currentTurn = source.currentTurn?.sessionKey === sessionKey ? source.currentTurn : null;
    const modelInfo = activeModelInfo();
    const model = modelInfo.model;
    const price = priceFor(model);
    const currentTurnUsage = normalizeUsage(currentTurn?.usage);
    const exactLast = normalizeUsage(lastTurn?.usage);
    const exactTurnId = lastTurn?.turnId || "";
    const hasNewExact = exactLast.exact && exactTurnId && exactTurnId !== state.lastExactTurnId;
    if (hasNewExact) state.lastExactTurnId = exactTurnId;

    const running = isTurnShimmerRunning(sessionKey);
    state.running = running;

    const zeroCurrent = { input: 0, output: 0, cached: 0, total: 0, exact: true };
    const current = currentTurnUsage.exact ? currentTurnUsage : running && !hasNewExact ? zeroCurrent : exactLast.exact ? exactLast : zeroCurrent;
    const confidence = "exact";

    const session = sessionUsage(turns);
    const lastIsInTurns = current.exact && turns.some((turn) => metricUsageKey(turn) === usageKey(current));
    const accountedSession = current.exact && !lastIsInTurns ? addUsage(session, current) : session;
    const displaySession = accountedSession;
    const sessionCostTurns = current.exact && currentTurn && !lastIsInTurns ? [...turns, currentTurn] : turns;
    const sessionCost = turnListCost(sessionCostTurns, displaySession, model);
    const dayCost = todayCost();
    const dayUsage = todayUsage();
    const fastMode = state.detectedFastMode === true;
    return { current, session: displaySession, turns: turns.length, sessionKey, model, modelInfo, price, sessionCost, dayCost, dayUsage, confidence, running, fastMode };
  }

  function emptyDailyUsageBucket(date = "") {
    return { date, tokens: 0, input: 0, output: 0, cached: 0, requests: 0, cost: 0 };
  }

  function addTurnToDailyBucket(bucket, turn, usage) {
    const model = turn.model || modelName();
    const cost = calcCost(usage, priceFor(model), { fastMode: turn.fastMode === true, model });
    const storedCost = Number(turn.costUsd ?? turn.totalCostUsd ?? turn.total_cost_usd);
    bucket.tokens += toCount(usage.total || usage.input + usage.output);
    bucket.input += toCount(usage.input);
    bucket.output += toCount(usage.output);
    bucket.cached += toCount(usage.cached);
    bucket.requests += toCount(turn.callCount) || 1;
    bucket.cost += Number.isFinite(storedCost) && storedCost >= 0 ? storedCost : cost.value;
    return bucket;
  }

  function addDailyBucket(target, source) {
    target.tokens += toCount(source?.tokens);
    target.input += toCount(source?.input);
    target.output += toCount(source?.output);
    target.cached += toCount(source?.cached);
    target.requests += toCount(source?.requests);
    target.cost += Number(source?.cost) || 0;
    return target;
  }

  function turnTimestampMs(turn) {
    const direct = toCount(turn?.observedAt || turn?.startedAt || turn?.finishedAt || turn?.createdAt);
    if (direct) return direct;
    const parsed = Date.parse(turn?.observedAt || turn?.startedAt || turn?.finishedAt || turn?.createdAt || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function localDailyUsage(options = {}) {
    const includeLocalWithCcDates = Boolean(options.includeLocalWithCcDates);
    ensureLocalLedgerLoaded();
    const byDayModel = new Map();
    const ccSwitchDates = new Set();
    const ccSwitchImportedAtByDate = new Map();
    const ledgerTurnIds = new Set();
    for (const turn of state.localLedger) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const turnId = normalizeText(turn?.turnId || turn?.id, 120);
      if (turnId) ledgerTurnIds.add(turnId);
      const date = isoDateUtc(turn.createdAt || turn.observedAt || Date.now());
      const model = normalizeText(turn.model || modelName(), 120).toLowerCase() || UNKNOWN_MODEL;
      const key = `${date}\u0001${model}`;
      const source = normalizeText(turn.source, 80);
      const importSource = normalizeText(turn.importSource, 80);
      const isCcSwitch = source === "cc-switch" || importSource === "cc-switch";
      if (isCcSwitch) {
        ccSwitchDates.add(date);
        ccSwitchImportedAtByDate.set(date, Math.max(toCount(ccSwitchImportedAtByDate.get(date)), toCount(turn.importedAt || turn.observedAt || turn.createdAt)));
      }
      const group = byDayModel.get(key) || {
        date,
        local: emptyDailyUsageBucket(date),
        ccSwitch: emptyDailyUsageBucket(date),
        other: emptyDailyUsageBucket(date),
        localTurns: [],
      };
      if (isCcSwitch) addTurnToDailyBucket(group.ccSwitch, turn, usage);
      else if (source === "codex-live-token-cost") {
        addTurnToDailyBucket(group.local, turn, usage);
        group.localTurns.push({ turn, usage });
      }
      else addTurnToDailyBucket(group.other, turn, usage);
      byDayModel.set(key, group);
    }

    const days = new Map();
    for (const group of byDayModel.values()) {
      const prev = days.get(group.date) || emptyDailyUsageBucket(group.date);
      if (ccSwitchDates.has(group.date)) {
        addDailyBucket(prev, group.ccSwitch);
        if (includeLocalWithCcDates) addDailyBucket(prev, group.local);
        else {
          const importedAt = toCount(ccSwitchImportedAtByDate.get(group.date));
          for (const item of group.localTurns) {
            if (importedAt && turnTimestampMs(item.turn) < importedAt) continue;
            addTurnToDailyBucket(prev, item.turn, item.usage);
          }
        }
      } else {
        addDailyBucket(prev, group.local);
      }
      addDailyBucket(prev, group.other);
      days.set(group.date, prev);
    }
    const currentMetric = localTurnMetric(localCurrentTurn(currentSessionKey()));
    if (currentMetric && !ledgerTurnIds.has(currentMetric.turnId)) {
      const date = isoDateUtc(currentMetric.createdAt || currentMetric.observedAt || Date.now());
      const bucket = days.get(date) || emptyDailyUsageBucket(date);
      const importedAt = toCount(ccSwitchImportedAtByDate.get(date));
      if (includeLocalWithCcDates || !ccSwitchDates.has(date) || !importedAt || turnTimestampMs(currentMetric) >= importedAt) {
        addTurnToDailyBucket(bucket, currentMetric, normalizeUsage(currentMetric.usage));
        days.set(date, bucket);
      }
    }
    return days;
  }

  function localProfileThreadCount() {
    ensureLocalLedgerLoaded();
    const keys = new Set();
    for (const turn of state.localLedger) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const source = normalizeText(turn?.source, 80);
      const importSource = normalizeText(turn?.importSource, 80);
      if (source === "cc-switch" || importSource === "cc-switch") continue;
      const key = turnSessionKey(turn);
      if (!key || key.startsWith("new:")) continue;
      keys.add(key);
    }
    return keys.size;
  }

  function localProfilePrefs() {
    if (state.profilePrefs) return state.profilePrefs;
    const saved = loadJson(PROFILE_PREFS_KEY, {});
    const overrides = loadJson(PROFILE_OVERRIDES_KEY, {});
    const overrideEmail = validProfileEmail(overrides.email);
    if (overrideEmail && !validProfileEmail(loadJson(PROFILE_DEFAULTS_KEY, {}).email)) saveProfileDefaultEmail(overrideEmail);
    const defaultEmail = profileDefaultEmail();
    const username = profileUsernameAllowed(saved.username) ? stripProfileUsername(saved.username) : "codex-local-usage";
    const plan = normalizeProfilePlan(saved.planType ?? saved.plan, saved.planLabel);
    const rawImageUrl = normalizeText(saved.imageUrl, PROFILE_IMAGE_MAX_LENGTH);
    const imageUrl = normalizeProfileImageUrl(rawImageUrl);
    const savedEmail = validProfileEmail(saved.email);
    if (savedEmail && savedEmail !== LOCAL_PROFILE_EMAIL && defaultEmail === LOCAL_PROFILE_EMAIL) saveProfileDefaultEmail(savedEmail);
    const email = savedEmail && !(savedEmail === LOCAL_PROFILE_EMAIL && defaultEmail !== LOCAL_PROFILE_EMAIL) ? savedEmail : defaultEmail;
    if (rawImageUrl && imageUrl && imageUrl !== rawImageUrl) {
      try {
        localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify({ ...saved, imageUrl }));
      } catch {
        // Keep the repaired value in memory even if persistence fails.
      }
    }
    state.profilePrefs = {
      displayName: normalizeText(saved.displayName, 64) || "Local Usage",
      username,
      email,
      planType: plan.planType,
      planLabel: plan.planLabel,
      imageUrl,
    };
    if (saved.email !== email) {
      try {
        localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify({ ...saved, email }));
      } catch {
        // Keep default-backed email active in memory even if repair fails.
      }
    }
    return state.profilePrefs;
  }

  function saveLocalProfilePrefs(prefs, options = {}) {
    const plan = normalizeProfilePlan(prefs?.planType ?? prefs?.plan, prefs?.planLabel);
    const next = {
      displayName: normalizeText(prefs?.displayName, 64) || "Local Usage",
      username: profileUsernameAllowed(prefs?.username) ? stripProfileUsername(prefs.username) : "codex-local-usage",
      email: normalizeProfileEmail(prefs?.email, profileDefaultEmail()),
      planType: plan.planType,
      planLabel: plan.planLabel,
      imageUrl: normalizeProfileImageUrl(prefs?.imageUrl),
    };
    localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(next));
    if (options.profileEditor) saveProfileDefaultEmail(next.email);
    state.profilePrefs = next;
    state.badProfileImageUrl = "";
    scheduleProfileIdentitySync(0);
    return next;
  }

  function extractProfilePhotoDataUrl(uploadBody) {
    if (!uploadBody) return "";
    let multipart = "";
    try {
      multipart = atob(String(uploadBody));
    } catch {
      multipart = String(uploadBody);
    }
    const headerEnd = multipart.indexOf("\r\n\r\n");
    if (headerEnd < 0) return "";
    const headers = multipart.slice(0, headerEnd);
    const contentType = headers.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1]?.trim() || "image/jpeg";
    if (!/^image\//i.test(contentType)) return "";
    const bodyStart = headerEnd + 4;
    const bodyEnd = multipart.indexOf("\r\n--", bodyStart);
    const fileBinary = multipart.slice(bodyStart, bodyEnd >= 0 ? bodyEnd : undefined);
    return fileBinary ? `data:${contentType};base64,${binaryStringToBase64(fileBinary)}` : "";
  }

  function applyLocalProfilePhotoUpload(uploadBody) {
    const imageUrl = extractProfilePhotoDataUrl(uploadBody);
    if (!imageUrl) return localProfilePrefs();
    const prefs = localProfilePrefs();
    prefs.imageUrl = imageUrl;
    return saveLocalProfilePrefs(prefs);
  }

  function normalizeProfilePatchPayload(rawPatch) {
    const raw = typeof rawPatch === "string" ? loadJsonFromString(rawPatch, {}) : rawPatch || {};
    let patch = raw;
    if (typeof patch.bodyJsonString === "string") patch = loadJsonFromString(patch.bodyJsonString, {});
    if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "body")) {
      patch = typeof patch.body === "string" ? loadJsonFromString(patch.body, {}) : patch.body || {};
    }
    if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "requestBody")) {
      patch = typeof patch.requestBody === "string" ? loadJsonFromString(patch.requestBody, {}) : patch.requestBody || {};
    }
    if (patch?.profile && typeof patch.profile === "object") patch = patch.profile;
    return patch && typeof patch === "object" ? patch : {};
  }

  function applyLocalProfilePatch(rawPatch) {
    const patch = normalizeProfilePatchPayload(rawPatch);
    const prefs = localProfilePrefs();
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    if (has("display_name") || has("displayName") || has("name")) {
      prefs.displayName = normalizeText(patch.display_name ?? patch.displayName ?? patch.name, 64) || "Local Usage";
    }
    if (has("username") || has("handle")) {
      const username = stripProfileUsername(patch.username ?? patch.handle);
      if (!profileUsernameAllowed(username)) throw new Error("Invalid username");
      prefs.username = username;
    }
    if (has("profile_picture_url") || has("profilePictureUrl") || has("avatar_url") || has("avatarUrl")) {
      prefs.imageUrl = normalizeProfileImageUrl(patch.profile_picture_url ?? patch.profilePictureUrl ?? patch.avatar_url ?? patch.avatarUrl);
    }
    if (has("email")) {
      const incomingEmail = validProfileEmail(patch.email);
      const defaultEmail = profileDefaultEmail();
      if (incomingEmail === LOCAL_PROFILE_EMAIL && validProfileEmail(prefs.email) && prefs.email !== LOCAL_PROFILE_EMAIL) {
        saveProfileDefaultEmail(prefs.email);
      } else if (incomingEmail && (incomingEmail !== LOCAL_PROFILE_EMAIL || defaultEmail === LOCAL_PROFILE_EMAIL)) {
        prefs.email = incomingEmail;
        if (incomingEmail !== LOCAL_PROFILE_EMAIL) saveProfileDefaultEmail(incomingEmail);
      } else {
        prefs.email = defaultEmail;
      }
    }
    if (has("plan_type") || has("planType") || has("plan") || has("planLabel")) {
      const plan = normalizeProfilePlan(patch.plan_type ?? patch.planType ?? patch.plan, patch.planLabel);
      prefs.planType = plan.planType;
      prefs.planLabel = plan.planLabel;
    }
    return saveLocalProfilePrefs(prefs);
  }

  function localProfilePlanLabel(prefs = localProfilePrefs()) {
    return prefs.planLabel || profilePlanOption(prefs.planType)?.label || prefs.planType || "Pro 20x";
  }

  function profileFallbackInitial(displayName) {
    return String(displayName || "Local Usage").trim().slice(0, 1) || "L";
  }

  function profileIdentitySignature(displayName, imageUrl) {
    const image = String(imageUrl || "");
    return `${VERSION}:${profileFallbackInitial(displayName)}:${image.length}:${image.slice(0, 48)}`;
  }

  function profileAvatarDisplayUrl(imageUrl) {
    const source = String(imageUrl || "");
    if (!source) return "";
    if (state.profileAvatarSourceUrl === source && state.profileAvatarRenderUrl) return state.profileAvatarRenderUrl;
    if (state.profileAvatarRenderUrl?.startsWith?.("blob:")) {
      try {
        URL.revokeObjectURL(state.profileAvatarRenderUrl);
      } catch {
        // Object URL cleanup is best-effort.
      }
    }
    state.profileAvatarSourceUrl = source;
    state.profileAvatarRenderUrl = source;
    if (!source.startsWith("data:image/") || typeof Blob !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return source;
    try {
      const [header, body] = source.split(",", 2);
      const contentType = header.match(/^data:([^;]+);base64$/i)?.[1] || "image/jpeg";
      const binary = atob(body || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      state.profileAvatarRenderUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
    } catch {
      state.profileAvatarRenderUrl = source;
    }
    return state.profileAvatarRenderUrl;
  }

  function removeProfileAvatarImages(avatar) {
    Array.from(avatar.querySelectorAll?.("img[data-cltc-profile-avatar]") || []).forEach((img) => img.remove?.());
  }

  function cssImageUrl(url) {
    return `url("${String(url || "").replace(/["\\\n\r\f]/g, "\\$&")}")`;
  }

  function clearProfileAvatarSurface(avatar) {
    if (!avatar?.style) return;
    avatar.style.backgroundImage = "";
    avatar.style.backgroundSize = "";
    avatar.style.backgroundPosition = "";
    avatar.style.backgroundRepeat = "";
    avatar.style.color = "";
    avatar.style.fontSize = "";
    avatar.style.lineHeight = "";
    avatar.style.overflow = "";
  }

  function setProfileAvatarSurface(avatar, renderUrl) {
    if (!avatar?.style || !renderUrl) return;
    avatar.style.backgroundImage = cssImageUrl(renderUrl);
    avatar.style.backgroundSize = "cover";
    avatar.style.backgroundPosition = "center";
    avatar.style.backgroundRepeat = "no-repeat";
    avatar.style.color = "transparent";
    avatar.style.fontSize = "0";
    avatar.style.lineHeight = "0";
    avatar.style.overflow = "hidden";
  }

  function clearProfileAvatarText(avatar, img) {
    Array.from(avatar.childNodes || []).forEach((node) => {
      if (node !== img && node.nodeType === 3) node.remove?.();
    });
    if (!avatar.childNodes && Array.isArray(avatar.children)) avatar.textContent = "";
  }

  function syncProfileAvatarFallback(avatar, displayName) {
    if (!avatar) return false;
    removeProfileAvatarImages(avatar);
    clearProfileAvatarSurface(avatar);
    const fallback = profileFallbackInitial(displayName);
    if (normalizeText(avatar.textContent || "", 20) !== fallback) avatar.textContent = fallback;
    return true;
  }

  function syncProfileAvatarElement(avatar, imageUrl, displayName, doc = document) {
    if (!avatar || !doc.createElement) return false;
    if (!imageUrl || state.badProfileImageUrl === imageUrl) return syncProfileAvatarFallback(avatar, displayName);
    const renderUrl = profileAvatarDisplayUrl(imageUrl);
    const signature = profileIdentitySignature(displayName, imageUrl);
    let img = avatar.querySelector?.("img[data-cltc-profile-avatar]");
    if (
      img &&
      (avatar.__codexLiveTokenCostProfileSig === signature || avatar.getAttribute?.("data-cltc-profile-sig") === signature) &&
      (img.getAttribute?.("src") === renderUrl || img.src === renderUrl) &&
      (!img.complete || img.naturalWidth > 0)
    ) {
      return true;
    }
    if (!img) {
      img = doc.createElement("img");
      img.setAttribute("data-cltc-profile-avatar", "true");
      avatar.appendChild?.(img);
    }
    setProfileAvatarSurface(avatar, renderUrl);
    clearProfileAvatarText(avatar, img);
    img.onerror = () => {
      if (img.src === renderUrl || img.getAttribute?.("src") === renderUrl) {
        state.badProfileImageUrl = imageUrl;
        syncProfileAvatarFallback(avatar, displayName);
      }
    };
    img.onload = () => {
      if (img.naturalWidth > 0) {
        state.badProfileImageUrl = "";
        clearProfileAvatarText(avatar, img);
        img.style.display = "block";
      }
    };
    if (img.getAttribute?.("src") !== renderUrl && img.src !== renderUrl) img.src = renderUrl;
    const alt = profileFallbackInitial(displayName);
    if (img.alt !== alt) img.alt = alt;
    if (img.style.width !== "100%") img.style.width = "100%";
    if (img.style.height !== "100%") img.style.height = "100%";
    if (img.style.objectFit !== "cover") img.style.objectFit = "cover";
    if (img.style.borderRadius !== "inherit") img.style.borderRadius = "inherit";
    if (img.complete && img.naturalWidth > 0) {
      state.badProfileImageUrl = "";
      clearProfileAvatarText(avatar, img);
      if (img.style.display !== "block") img.style.display = "block";
    } else if (img.complete && img.naturalWidth === 0 && img.src) {
      state.badProfileImageUrl = imageUrl;
      return syncProfileAvatarFallback(avatar, displayName);
    } else if (img.style.display !== "block") {
      img.style.display = "block";
    }
    avatar.__codexLiveTokenCostProfileSig = signature;
    avatar.setAttribute?.("data-cltc-profile-sig", signature);
    return true;
  }

  function findSidebarProfileButton(doc = document) {
    const nodes = Array.from(doc.querySelectorAll?.("aside button[aria-label], aside button[aria-haspopup='menu'], aside button") || []);
    const viewportHeight = doc.defaultView?.innerHeight || (typeof window !== "undefined" ? window.innerHeight : 0) || 1200;
    const candidates = nodes
      .map((button) => {
        const text = normalizeText(button.innerText || button.textContent || "", 240);
        const aria = normalizeText(button.getAttribute?.("aria-label") || "", 120);
        const rect = button.getBoundingClientRect?.() || { top: 0, left: 0, width: 0, height: 0 };
        const nearBottom = rect.top >= viewportHeight - 180;
        const inAppSidebar = rect.left < 320 || !button.getBoundingClientRect;
        const looksLikeAccount =
          /打开设置|open settings/i.test(aria) ||
          (/设置|settings/i.test(aria) && /Free|Go|Plus|Pro|Business|Enterprise|Edu|Local Usage/i.test(text)) ||
          /Free|Go|Plus|Pro|Business|Enterprise|Edu|Local Usage/i.test(text);
        return { button, text, aria, rect, score: (looksLikeAccount ? 10 : 0) + (nearBottom ? 5 : 0) + (inAppSidebar ? 1 : 0) + rect.top / 10000 };
      })
      .filter((item) => item.score >= 16 && item.rect.width !== 0 && item.rect.height !== 0);
    candidates.sort((a, b) => b.score - a.score || b.rect.top - a.rect.top);
    return candidates[0]?.button || null;
  }

  function syncSidebarProfileIdentity(doc = document) {
    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const planLabel = localProfilePlanLabel();
    const button = findSidebarProfileButton(doc);
    if (!button) return false;

    const spans = Array.from(button.querySelectorAll?.("span") || []);
    const avatar = spans.find((span) => {
      const className = String(span.className || "");
      const text = normalizeText(span.textContent || "", 20);
      const rect = span.getBoundingClientRect?.() || { width: 0, height: 0 };
      return (
        /rounded-full/.test(className) &&
        (/size-7|h-7|w-7/.test(className) || (rect.width >= 24 && rect.width <= 40 && rect.height >= 24 && rect.height <= 40) || text.length <= 2)
      );
    });
    if (avatar) {
      if (prefs.imageUrl && doc.createElement) {
        syncProfileAvatarElement(avatar, prefs.imageUrl, displayName, doc);
      } else if (normalizeText(avatar.textContent || "", 20) !== displayName.slice(0, 1)) {
        avatar.textContent = profileFallbackInitial(displayName);
      }
    }

    const leaves = spans.filter((span) => span !== avatar && !span.querySelector?.("span,img,svg"));
    const nameNode =
      leaves.find((span) => /text-base/.test(String(span.className || ""))) ||
      leaves.find((span) => ["设置", "Local Usage"].includes(normalizeText(span.textContent || "", 64))) ||
      leaves.find((span) => normalizeText(span.textContent || "", 64) && !/Free|Go|Plus|Pro|Business|Enterprise|Edu/.test(span.textContent || ""));
    if (nameNode && normalizeText(nameNode.textContent || "", 64) !== displayName) nameNode.textContent = displayName;

    const planNode =
      leaves.find((span) => /text-xs|tertiary/.test(String(span.className || ""))) ||
      leaves.find((span) => /Free|Go|Plus|Pro|Business|Enterprise|Edu|API/i.test(span.textContent || ""));
    if (planNode && normalizeText(planNode.textContent || "", 64) !== planLabel) planNode.textContent = planLabel;
    return true;
  }

  function syncVisibleProfilePhotoIdentity(doc = document) {
    const prefs = localProfilePrefs();
    if (!prefs.imageUrl) return false;
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const nodes = Array.from(doc.querySelectorAll?.("label,div,span") || []);
    let synced = false;
    for (const node of nodes) {
      const className = String(node.className || "");
      if (!/rounded-full/.test(className)) continue;
      if (!/(size-20|size-32|h-20|w-20|h-32|w-32|text-\[28px\]|text-\[40px\])/.test(className)) continue;
      const label = node.closest?.("label") || (node.tagName === "LABEL" ? node : null);
      if (!label?.querySelector?.("input[type='file'][accept*='image'],input[type=\"file\"][accept*=\"image\"],input[type='file'],input[type=\"file\"]")) continue;
      if (node === label) continue;
      const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
      if (rect.width < 64 || rect.height < 64 || rect.width > 160 || rect.height > 160) continue;
      const text = normalizeText(node.textContent || "", 16);
      const hasImg = Boolean(node.querySelector?.("img"));
      if (!hasImg && text && text.length > 2) continue;
      synced = syncProfileAvatarElement(node, prefs.imageUrl, displayName, doc) || synced;
    }
    return synced;
  }

  function syncProfileIdentity(doc = document) {
    return Boolean(syncSidebarProfileIdentity(doc) || syncVisibleProfilePhotoIdentity(doc));
  }

  function scheduleProfileIdentitySync(delay = 80) {
    if (state.profileIdentitySyncTimer || typeof window === "undefined" || typeof window.setTimeout !== "function") return;
    state.profileIdentitySyncTimer = window.setTimeout(() => {
      state.profileIdentitySyncTimer = 0;
      syncProfileIdentity();
    }, delay);
  }

  function installProfileIdentityObserver() {
    if (state.profileIdentityObserver || window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.profileIdentityObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== 1) continue;
          const element = node;
          const text = normalizeText(element.textContent || "", 120);
          const className = String(element.className || "");
          if (
            element.matches?.("aside,aside *,label,input[type='file']") ||
            element.querySelector?.("aside button,label input[type='file'],input[type='file']") ||
            /rounded-full|size-7|size-20|size-32/.test(className) ||
            /设置|settings|Free|Go|Plus|Pro|Business|Enterprise|Edu|Local Usage/i.test(text)
          ) {
            scheduleProfileIdentitySync(0);
            return;
          }
        }
      }
    });
    state.profileIdentityObserver.observe(target, { childList: true, subtree: true });
  }

  function bindOfficialModelTrigger() {
    const trigger = document.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR);
    if (trigger && trigger === state.officialModelTrigger) return readOfficialModelTrigger(trigger);
    state.officialModelObserver?.disconnect?.();
    state.officialModelObserver = null;
    state.officialModelTrigger = trigger || null;
    if (!trigger || typeof MutationObserver !== "function") {
      const changed = readOfficialModelTrigger(null);
      if (changed) scheduleRender(0);
      return changed;
    }
    const changed = readOfficialModelTrigger(trigger);
    state.officialModelObserver = new MutationObserver(() => {
      if (readOfficialModelTrigger(trigger)) scheduleRender(0);
    });
    state.officialModelObserver.observe(trigger, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-selected-reasoning-effort", "aria-label", "title", "data-state", "class", "style", "hidden", "aria-hidden"],
    });
    if (changed) scheduleRender(0);
    return changed;
  }

  function mutationTouchesOfficialModelTrigger(mutation) {
    const target = mutation?.target;
    if (target?.nodeType === 1 && (target.matches?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || target.closest?.(OFFICIAL_MODEL_TRIGGER_SELECTOR))) return true;
    for (const node of Array.from(mutation?.addedNodes || [])) {
      if (node.nodeType === 1 && (node.matches?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || node.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR))) return true;
    }
    for (const node of Array.from(mutation?.removedNodes || [])) {
      if (node === state.officialModelTrigger || (node.nodeType === 1 && node.contains?.(state.officialModelTrigger))) return true;
    }
    return false;
  }

  function installOfficialModelObserver() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    bindOfficialModelTrigger();
    if (state.officialModelRootObserver || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.officialModelRootObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesOfficialModelTrigger)) bindOfficialModelTrigger();
    });
    state.officialModelRootObserver.observe(target, { childList: true, subtree: true });
  }

  function localProfileResponse() {
    const days = Array.from(localDailyUsage().values()).sort((a, b) => a.date.localeCompare(b.date));
    const totalTokens = days.reduce((sum, day) => sum + day.tokens, 0);
    const peak = days.reduce((max, day) => Math.max(max, day.tokens), 0);
    const streak = localProfileStreakStats(days);
    const activity = mergeActivityWithHelperStats(localProfileActivityStats(state.localLedger));
    const totalThreads = toCount(state.helperStats?.totalThreads) || localProfileThreadCount();
    const topPlugin = activity.topPlugins?.[0] || null;
    const prefs = localProfilePrefs();
    const fastModePercent = activity.fastModePercent ?? 0;
    return {
      profile: {
        display_name: prefs.displayName,
        username: prefs.username,
        email: prefs.email,
        plan_type: prefs.planType,
        plan_label: prefs.planLabel,
        profile_picture_url: prefs.imageUrl,
      },
      metadata: { stats_error: "" },
      stats: {
        daily_usage_buckets: localProfileDailyUsageBuckets(days),
        lifetime_tokens: totalTokens,
        peak_daily_tokens: peak,
        current_streak_days: streak.current,
        longest_streak_days: streak.longest,
        longest_running_turn_sec: activity.longestRunningTurnSec || 0,
        fast_mode_usage_percentage: fastModePercent,
        top_invocations: activity.topInvocations,
        top_plugins: activity.topPlugins,
        most_used_plugin: topPlugin ? topPlugin.plugin_name || topPlugin.plugin_id || null : null,
        most_used_plugin_usage_count: toCount(topPlugin?.usage_count),
        most_used_reasoning_effort: activity.reasoningEffort || activeModelInfo().effort || null,
        most_used_reasoning_effort_percentage: activity.reasoningEffortPercent,
        unique_skills_used: activity.uniqueSkillsUsed,
        total_skills_used: activity.totalSkillsUsed,
        unique_plugins_used: activity.uniquePluginsUsed,
        total_plugins_used: activity.totalPluginsUsed,
        total_threads: totalThreads,
      },
    };
  }

  function statsigClients() {
    const root = window.__STATSIG__ || globalThis.__STATSIG__;
    if (!root || typeof root !== "object") return [];
    const clients = [root.firstInstance, typeof root.instance === "function" ? root.instance() : null];
    if (root.instances && typeof root.instances === "object") clients.push(...Object.values(root.instances));
    return clients.filter((client, index, all) => client && typeof client === "object" && all.indexOf(client) === index);
  }

  function patchProfileStatsigClient(client) {
    if (!client || typeof client !== "object" || client.__codexLiveTokenCostProfileGatePatched === VERSION) return;
    if (typeof client.checkGate === "function") {
      const originalCheckGate = client.__codexLiveTokenCostOriginalCheckGate || client.checkGate.bind(client);
      client.checkGate = (name, options) => (name === PROFILE_GATE_ID ? true : originalCheckGate(name, options));
      client.__codexLiveTokenCostOriginalCheckGate = originalCheckGate;
    }
    if (typeof client.getFeatureGate === "function") {
      const originalGetFeatureGate = client.__codexLiveTokenCostOriginalGetFeatureGate || client.getFeatureGate.bind(client);
      client.getFeatureGate = (name, options) => {
        const gate = originalGetFeatureGate(name, options);
        if (name !== PROFILE_GATE_ID) return gate;
        return gate && typeof gate === "object" ? { ...gate, value: true } : gate;
      };
      client.__codexLiveTokenCostOriginalGetFeatureGate = originalGetFeatureGate;
    }
    client.__codexLiveTokenCostProfileGatePatched = VERSION;
    try {
      if (typeof client.$emt === "function") client.$emt({ name: "values_updated" });
    } catch {
      // Statsig event emission is best-effort.
    }
  }

  function patchProfileStatsigGate() {
    statsigClients().forEach(patchProfileStatsigClient);
  }

  function installProfileUsernameUppercaseUnlock() {
    const originalTest = RegExp.prototype.__codexLiveTokenCostOriginalTest || RegExp.prototype.test;
    if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) return;
    const patchedTest = function codexLiveTokenCostProfileUsernameTest(value) {
      if (this?.source === "^[a-z0-9._-]+$" && this?.flags === "") return /^[A-Za-z0-9._-]+$/.test(String(value || ""));
      return originalTest.call(this, value);
    };
    patchedTest.__codexLiveTokenCostProfileUnlock = VERSION;
    RegExp.prototype.__codexLiveTokenCostOriginalTest = originalTest;
    RegExp.prototype.test = patchedTest;
  }

  function profileFetchBody(method, body) {
    if (method === "PATCH") applyLocalProfilePatch(body);
    if (method === "POST") {
      applyLocalProfilePhotoUpload(body);
      return { asset_pointer: "local-profile-photo" };
    }
    return localProfileResponse();
  }

  function profileFetchBodyWithHelperRefresh(method, body) {
    if (String(method || "GET").toUpperCase() !== "GET" || typeof window.fetch !== "function") return profileFetchBody(method, body);
    void pollLocalHelperStats();
    return profileFetchBody(method, body);
  }

  async function profileFetchBodyAsync(method, body) {
    return profileFetchBodyWithHelperRefresh(method, body);
  }

  function codexAppAssetUrls() {
    const scripts = Array.from(document.scripts || []).map((script) => script.src);
    const links = Array.from(document.querySelectorAll?.("link[href]") || []).map((link) => link.href);
    const resources = typeof performance?.getEntriesByType === "function" ? performance.getEntriesByType("resource").map((entry) => entry.name) : [];
    return Array.from(new Set([...scripts, ...links, ...resources].filter(Boolean).filter((url) => url.includes("/assets/") && url.split("?")[0].endsWith(".js"))));
  }

  function assetReferenceFromText(text, baseUrl, namePart) {
    const escaped = namePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(text || "").match(new RegExp(`["'](\\./(?:assets/)?${escaped}[^"']+\\.js)["']`));
    return match ? new URL(match[1], baseUrl).href : "";
  }

  async function codexAppAssetUrl(namePart) {
    const urls = codexAppAssetUrls();
    const direct = urls.find((url) => url.split("/").pop()?.startsWith(namePart));
    if (direct) return direct;
    for (const src of urls) {
      try {
        const text = await fetch(src).then((response) => (response.ok ? response.text() : ""));
        const found = assetReferenceFromText(text, src, namePart);
        if (found) return found;
      } catch {
        // Asset discovery is best-effort across Codex desktop versions.
      }
    }
    if (namePart === "request-") {
      const profileQueriesUrl = await codexAppAssetUrl("profile-queries-");
      if (profileQueriesUrl) {
        try {
          const text = await fetch(profileQueriesUrl).then((response) => (response.ok ? response.text() : ""));
          return assetReferenceFromText(text, profileQueriesUrl, "request-");
        } catch {
          return "";
        }
      }
    }
    return "";
  }

  async function loadCodexAppModule(namePart) {
    if (!state.codexModulePromises.has(namePart)) {
      const promise = Promise.resolve()
        .then(async () => {
          const url = await codexAppAssetUrl(namePart);
          if (!url) throw new Error(`Codex app asset not found: ${namePart}`);
          return import(url);
        })
        .catch((error) => {
          state.codexModulePromises.delete(namePart);
          throw error;
        });
      state.codexModulePromises.set(namePart, promise);
    }
    return state.codexModulePromises.get(namePart);
  }

  async function invalidateProfileUsageQuery() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return false;
    try {
      const module = await loadCodexAppModule("vscode-api-");
      const dispatcher = Object.values(module || {}).find((value) => value && typeof value.dispatchMessage === "function");
      if (!dispatcher) return false;
      dispatcher.dispatchMessage("query-cache-invalidate", { queryKey: PROFILE_USAGE_QUERY_KEY.slice() });
      return true;
    } catch {
      return false;
    }
  }

  function scheduleProfileUsageRefresh(delay = 1000) {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || state.profileUsageRefreshTimer || typeof window.setTimeout !== "function") return;
    state.profileUsageRefreshTimer = window.setTimeout(() => {
      state.profileUsageRefreshTimer = 0;
      void invalidateProfileUsageQuery();
    }, delay);
  }

  function patchProfileRequestClient(client) {
    if (!client || typeof client !== "object") return false;
    if (client.__codexLiveTokenCostProfileRequestPatch === VERSION) return true;
    if (typeof client.safeGet !== "function" && typeof client.safePatch !== "function") return false;
    const originalSafeGet = client.__codexLiveTokenCostOriginalSafeGet || client.safeGet?.bind(client);
    const originalSafePatch = client.__codexLiveTokenCostOriginalSafePatch || client.safePatch?.bind(client);
    if (typeof originalSafeGet === "function") {
      client.safeGet = async function codexLiveTokenCostProfileSafeGet(url, ...args) {
        if (isProfileUsageUrl(url)) return profileFetchBodyAsync("GET");
        return originalSafeGet(url, ...args);
      };
      client.__codexLiveTokenCostOriginalSafeGet = originalSafeGet;
    }
    if (typeof originalSafePatch === "function") {
      client.safePatch = async function codexLiveTokenCostProfileSafePatch(url, options, ...args) {
        if (isProfileUsageUrl(url)) {
          applyLocalProfilePatch(options);
          return localProfileResponse();
        }
        return originalSafePatch(url, options, ...args);
      };
      client.__codexLiveTokenCostOriginalSafePatch = originalSafePatch;
    }
    client.__codexLiveTokenCostProfileRequestPatch = VERSION;
    return true;
  }

  function patchProfilePhotoUploadClient(client) {
    if (!client || typeof client !== "object" || typeof client.post !== "function") return false;
    if (client.__codexLiveTokenCostProfilePhotoPatch === VERSION) return true;
    const originalPost = client.__codexLiveTokenCostOriginalPost || client.post.bind(client);
    client.post = async function codexLiveTokenCostProfilePhotoPost(url, body, headers, ...args) {
      if (isProfilePhotoUrl(url)) {
        applyLocalProfilePhotoUpload(body);
        return { status: 200, body: { asset_pointer: "local-profile-photo" }, headers: { "content-type": "application/json" } };
      }
      return originalPost(url, body, headers, ...args);
    };
    client.__codexLiveTokenCostOriginalPost = originalPost;
    client.__codexLiveTokenCostProfilePhotoPatch = VERSION;
    return true;
  }

  async function installProfileRequestClientPatch() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const module = await loadCodexAppModule("request-");
      let patched = 0;
      for (const value of Object.values(module || {})) {
        if (patchProfileRequestClient(value)) patched += 1;
      }
      window.__codexLiveTokenCostProfileRequestPatch = patched > 0 ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfileRequestPatch = "error";
      window.__codexLiveTokenCostProfileRequestPatchError = error?.message || String(error);
    }
  }

  async function installProfilePhotoUploadPatch() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const module = await loadCodexAppModule("vscode-api-");
      let patched = 0;
      for (const value of Object.values(module || {})) {
        try {
          const client = typeof value?.getInstance === "function" ? value.getInstance() : value;
          if (patchProfilePhotoUploadClient(client)) patched += 1;
        } catch {
          // Ignore non-client exports.
        }
      }
      window.__codexLiveTokenCostProfilePhotoPatch = patched > 0 ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfilePhotoPatch = "error";
      window.__codexLiveTokenCostProfilePhotoPatchError = error?.message || String(error);
    }
  }

  async function installProfileAuthContextPatch() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const [jsxModule, authModule] = await Promise.all([loadCodexAppModule("jsx-runtime-"), loadCodexAppModule("use-auth-")]);
      const reactFactory = jsxModule?.n;
      const react = typeof reactFactory === "function" ? reactFactory() : null;
      const patched = patchProfileReactAuthContext(react, authModule?.l);
      window.__codexLiveTokenCostProfileAuthPatch = patched ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfileAuthPatch = "error";
      window.__codexLiveTokenCostProfileAuthPatchError = error?.message || String(error);
    }
  }

  function isProfileFetchMessage(message) {
    return message?.type === "fetch" && (isProfileUsageUrl(message.url) || isProfilePhotoUrl(message.url));
  }

  function rememberProfileRequestId(requestId) {
    if (requestId == null || requestId === "") return;
    const now = Date.now();
    state.profileRequestIds.set(String(requestId), now);
    for (const [key, seenAt] of state.profileRequestIds) {
      if (now - seenAt > 30000) state.profileRequestIds.delete(key);
    }
  }

  function isRememberedProfileRequestId(requestId) {
    if (requestId == null || requestId === "") return false;
    return state.profileRequestIds.has(String(requestId));
  }

  function emitProfileFetchResponse(requestId, method, body) {
    rememberProfileRequestId(requestId);
    const sendPayload = (payload) => {
      const message = {
      type: "fetch-response",
      __codexLiveTokenCostProfileLocal: true,
      requestId,
      responseType: "success",
      status: 200,
      headers: { "content-type": "application/json" },
      bodyJsonString: JSON.stringify(payload),
      };
      if (typeof window.postMessage === "function") {
        window.postMessage(message, location.origin || "*");
        return;
      }
      window.dispatchEvent(new MessageEvent("message", { data: message, origin: location.origin, source: window }));
    };
    const payload = profileFetchBodyWithHelperRefresh(method, body);
    if (payload && typeof payload.then === "function") {
      payload.then(sendPayload);
      return;
    }
    sendPayload(payload);
  }

  function handleProfileFetchEvent(event) {
    const message = event?.detail;
    if (!isProfileFetchMessage(message)) return;
    rememberProfileRequestId(message.requestId);
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    window.setTimeout(() => {
      void emitProfileFetchResponse(message.requestId, String(message.method || "GET").toUpperCase(), message.body);
    }, 0);
  }

  function handleProfileFetchResponseEvent(event) {
    const data = event?.data;
    if (data?.type !== "fetch-response" || !isRememberedProfileRequestId(data.requestId)) return;
    if (data.__codexLiveTokenCostProfileLocal) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  function profileBridgeSendMessage(originalSend) {
    const patchedSend = (message) => {
      if (message?.type === "fetch" && (isProfileUsageUrl(message.url) || isProfilePhotoUrl(message.url))) {
        rememberProfileRequestId(message.requestId);
        window.setTimeout(() => {
          void emitProfileFetchResponse(message.requestId, String(message.method || "GET").toUpperCase(), message.body);
        }, 0);
        return Promise.resolve();
      }
      return originalSend(message);
    };
    patchedSend.__codexLiveTokenCostProfileUnlock = VERSION;
    return patchedSend;
  }

  function patchProfileElectronBridge() {
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function" || bridge.sendMessageFromView.__codexLiveTokenCostProfileUnlock === VERSION) {
      return Boolean(bridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION);
    }
    const originalSend = bridge.__codexLiveTokenCostOriginalSendMessageFromView || bridge.sendMessageFromView.bind(bridge);
    const patchedSend = profileBridgeSendMessage(originalSend);
    try {
      bridge.sendMessageFromView = patchedSend;
      bridge.__codexLiveTokenCostOriginalSendMessageFromView = originalSend;
      return bridge.sendMessageFromView === patchedSend || bridge.sendMessageFromView.__codexLiveTokenCostProfileUnlock === VERSION;
    } catch {
      return false;
    }
  }

  function profileBridgeProxy(bridge) {
    if (!bridge || typeof bridge.sendMessageFromView !== "function" || typeof Proxy !== "function") return bridge;
    if (bridge.__codexLiveTokenCostProfileProxy === VERSION) return bridge;
    const originalSend = bridge.__codexLiveTokenCostOriginalSendMessageFromView || bridge.sendMessageFromView.bind(bridge);
    const patchedSend = profileBridgeSendMessage(originalSend);
    const proxy = new Proxy(
      {},
      {
        get(_target, prop, receiver) {
        if (prop === "sendMessageFromView") return patchedSend;
        if (prop === "__codexLiveTokenCostOriginalSendMessageFromView") return originalSend;
        if (prop === "__codexLiveTokenCostProfileProxy") return VERSION;
        return Reflect.get(bridge, prop, receiver);
      },
        set(_target, prop, value, receiver) {
          return Reflect.set(bridge, prop, value, receiver);
        },
        has(_target, prop) {
          return prop in bridge;
        },
        ownKeys() {
          return Reflect.ownKeys(bridge);
        },
        getOwnPropertyDescriptor(_target, prop) {
          const descriptor = Reflect.getOwnPropertyDescriptor(bridge, prop);
          return descriptor ? { ...descriptor, configurable: true } : undefined;
        },
      },
    );
    return proxy;
  }

  function installElectronBridgeHook() {
    if (window.__codexLiveTokenCostBridgeHook === VERSION) return;
    window.__codexLiveTokenCostBridgeHook = VERSION;
    patchProfileElectronBridge();
    let current = profileBridgeProxy(window.electronBridge);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, "electronBridge");
      if (descriptor?.configurable === false) return;
      Object.defineProperty(window, "electronBridge", {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          current = profileBridgeProxy(value);
          window.setTimeout(patchProfileElectronBridge, 0);
        },
      });
      if (current) window.setTimeout(patchProfileElectronBridge, 0);
    } catch {
      // If the preload owns a non-configurable bridge, the interval fallback still tries.
    }
  }

  function installProfileMessageIntercept() {
    if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) return;
    window.addEventListener("codex-message-from-view", handleProfileFetchEvent, true);
    window.addEventListener("message", handleProfileFetchResponseEvent, true);
    window.__codexLiveTokenCostProfileMessageIntercept = VERSION;
  }

  function installOfficialProfileUnlock() {
    const originalFilter = Array.prototype.__codexLiveTokenCostOriginalFilter || Array.prototype.filter;
    if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock !== VERSION) {
      const patchedFilter = function codexLiveTokenCostProfileFilter(callback, thisArg) {
        const visible = originalFilter.call(this, callback, thisArg);
        return profileUnlockedSettingsSections(this, visible);
      };
      patchedFilter.__codexLiveTokenCostProfileUnlock = VERSION;
      Array.prototype.__codexLiveTokenCostOriginalFilter = originalFilter;
      Array.prototype.filter = patchedFilter;
    }

    const originalThen = Promise.prototype.__codexLiveTokenCostOriginalThen || Promise.prototype.then;
    if (Promise.prototype.then.__codexLiveTokenCostProfileUnlock !== VERSION) {
      const patchedThen = function codexLiveTokenCostProfileThen(onFulfilled, onRejected) {
        const wrappedFulfilled =
          typeof onFulfilled === "function"
            ? function codexLiveTokenCostProfileFulfilled(value) {
                return onFulfilled.call(this, spoofProfileAccountPayload(value));
              }
            : onFulfilled;
        return originalThen.call(this, wrappedFulfilled, onRejected);
      };
      patchedThen.__codexLiveTokenCostProfileUnlock = VERSION;
      Promise.prototype.__codexLiveTokenCostOriginalThen = originalThen;
      Promise.prototype.then = patchedThen;
    }

    installProfileUsernameUppercaseUnlock();
    installProfileMessageIntercept();
    installElectronBridgeHook();
    void installProfileRequestClientPatch();
    void installProfilePhotoUploadPatch();
    void installProfileAuthContextPatch();
    patchProfileElectronBridge();
    patchProfileStatsigGate();
  }

  function findComposerBox() {
    const editable = mainEditable();
    if (!editable) return null;
    let node = editable;
    let candidate = editable.parentElement || editable;
    for (let depth = 0; node?.parentElement && depth < 8; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width >= 320 && rect.height >= 36 && rect.height <= 260 && style.display !== "contents") candidate = node;
    }
    return candidate;
  }

  function isCodexPlusText(value) {
    return /(^|[\s([{<])Codex\+\+(?=$|[\s)\]}>:：·|/-])/i.test(normalizeText(value, 240));
  }

  function findCodexPlusMenu(doc = document) {
    const byId = doc.getElementById?.(CODEX_PLUS_MENU_ID);
    if (byId) return byId;
    const candidates = Array.from(
      doc.querySelectorAll?.("button,[role='button'],a,header *,nav *,.app-header-tint *,[id*='codex-plus'],[class*='codex-plus']") || [],
    );
    return (
      candidates.find((node) => {
        const text = normalizeText(`${node.getAttribute?.("aria-label") || ""} ${node.textContent || ""}`, 160);
        return isCodexPlusText(text);
      }) || null
    );
  }

  function openSettingsEditor() {
    state.priceEditorOpen = true;
    state.priceEditorModel = modelName();
    void pollLocalHelperStats();
    render(true);
  }

  function headerSettingsLabel(snap = null) {
    const usage = snap?.dayUsage || todayUsage();
    return `今日 ${fmtCount(usage.total)}`;
  }

  function updateHeaderSettingsButton(snap = null) {
    if (!state.settingsButton) return;
    const label = headerSettingsLabel(snap);
    state.settingsButton.textContent = label;
    state.settingsButton.title = `${label} · Codex Token Cost 设置`;
    state.settingsButton.setAttribute("aria-label", `${label}，打开 Codex Token Cost 设置`);
  }

  function ensureHeaderSettingsButton(doc = document) {
    ensureStyle();
    const menu = findCodexPlusMenu(doc);
    if (!menu?.parentElement) {
      state.settingsButton?.remove?.();
      state.settingsButton = null;
      return null;
    }
    const existingButton = doc.getElementById?.(SETTINGS_BUTTON_ID);
    if (existingButton && existingButton !== state.settingsButton) existingButton.remove?.();
    if (!state.settingsButton) {
      const button = doc.createElement("button");
      button.id = SETTINGS_BUTTON_ID;
      button.className = "cltc-header-settings no-drag cursor-interaction text-token-text-tertiary";
      button.type = "button";
      button.textContent = headerSettingsLabel();
      button.title = "Codex Token Cost 设置";
      button.setAttribute("aria-label", "打开 Codex Token Cost 设置");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSettingsEditor();
      });
      state.settingsButton = button;
    }
    const menuRect = menu.getBoundingClientRect?.();
    const floating = menu.parentElement === doc.documentElement || menu.parentElement === doc.body || /codex-plus-menu-floating/i.test(String(menu.className || ""));
    const setFloating = (value) => {
      if (state.settingsButton.dataset) state.settingsButton.dataset.floating = value;
      else state.settingsButton.setAttribute?.("data-floating", value);
    };
    if (floating && menuRect) {
      const parent = doc.body || doc.documentElement;
      if (state.settingsButton.parentElement !== parent) parent.appendChild(state.settingsButton);
      const gap = 4;
      setFloating("true");
      const buttonRect = state.settingsButton.getBoundingClientRect?.();
      const width = buttonRect?.width || 96;
      const height = buttonRect?.height || 30;
      const left = Math.max(gap, menuRect.left - width - gap);
      state.settingsButton.style.left = `${Math.round(left)}px`;
      state.settingsButton.style.top = `${Math.round(menuRect.top + (menuRect.height - height) / 2)}px`;
    } else {
      const parent = menu.parentElement;
      setFloating("false");
      state.settingsButton.style.left = "";
      state.settingsButton.style.top = "";
      if (state.settingsButton.parentElement !== parent || menu.nextSibling !== state.settingsButton) {
        parent.insertBefore(state.settingsButton, menu.nextSibling);
      }
    }
    return state.settingsButton;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        --cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5));
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-border: var(--color-token-border-light, light-dark(#d1d5db, #3f3f46));
        --cltc-border-subtle: var(--color-token-border-light, light-dark(#e5e7eb, #323238));
        --cltc-surface: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-surface-secondary: var(--color-token-main-surface-secondary, light-dark(#f3f4f6, #27272a));
        --cltc-popover: var(--color-token-dropdown-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-input: var(--color-token-input-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        --cltc-shadow: light-dark(rgba(0, 0, 0, .18), rgba(0, 0, 0, .48));
        --cltc-arc-bg: light-dark(rgb(246, 246, 246), rgba(255, 255, 255, .08));
        --cltc-arc-radius: var(--radius-2xl, 20px);
        --cltc-shimmer-contrast: #fff;
        box-sizing: border-box;
        color-scheme: light dark;
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(0, .78fr) minmax(0, 1.15fr) minmax(0, .92fr) minmax(0, .92fr) minmax(0, 1.08fr);
        align-items: center;
        gap: 0;
        width: min(100%, 760px);
        height: 61px;
        margin: 0 auto -18px;
        padding: 8px 10px 25px;
        border-radius: var(--cltc-arc-radius) var(--cltc-arc-radius) 0 0;
        background: var(--cltc-arc-bg);
        color: var(--cltc-muted);
        font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        z-index: 0;
      }
      @supports (corner-shape: superellipse(1.5)) {
        #${ROOT_ID} {
          corner-shape: var(--codex-corner-shape, round);
        }
      }
      #${ROOT_ID} .cltc-pill {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        position: relative;
        width: 100%;
        min-width: 0;
        min-height: 28px;
        max-width: 100%;
        padding: 0 8px;
        border: 0;
        border-radius: 0;
        background: transparent;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-pill + .cltc-pill::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        display: block;
        width: 1px;
        height: 11px;
        margin: 0;
        background: color-mix(in srgb, var(--cltc-muted) 30%, transparent);
        transform: translateY(-50%);
      }
      #${ROOT_ID} .cltc-current-flow {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      #${ROOT_ID} .cltc-model-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        max-width: 100%;
      }
      #${ROOT_ID} .cltc-model-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-fast-mode-icon {
        display: inline-block;
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        color: var(--color-token-link-foreground, currentColor);
      }
      #${ROOT_ID} .cltc-fast-mode-icon[hidden] {
        display: none;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer {
        --cltc-shimmer-text-primary: var(--cltc-muted);
        --cltc-shimmer-text-secondary: var(--cltc-shimmer-text-primary);
        position: relative;
        display: inline-block;
        color: var(--cltc-shimmer-text-secondary);
        -webkit-text-fill-color: currentColor;
        text-fill-color: currentColor;
        background: transparent;
        -webkit-background-clip: border-box;
        background-clip: border-box;
        animation: none;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-sweep {
        position: absolute;
        inset: 0 auto 0 0;
        width: 100%;
        overflow: hidden;
        pointer-events: none;
        transform: translate(-50%);
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 20% 30%, transparent 50% 100%);
        mask-image: linear-gradient(90deg, transparent 0%, #000 20% 30%, transparent 50% 100%);
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-highlight {
        display: block;
        width: 100%;
        color: var(--cltc-shimmer-contrast);
        -webkit-text-fill-color: currentColor;
        text-fill-color: currentColor;
        transform: translate(50%);
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep,
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
        animation-duration: 1s;
        animation-timing-function: steps(48, end);
        animation-iteration-count: 1;
        animation-delay: var(--cltc-shimmer-active-delay, 0ms);
        animation-fill-mode: both;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep {
        animation-name: cltc-cadenced-shimmer-sweep;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
        animation-name: cltc-cadenced-shimmer-highlight;
      }
      #${ROOT_ID} .cltc-muted {
        opacity: .68;
      }
      #${ROOT_ID} .cltc-roll {
        --cltc-roll-row: 16px;
        display: inline-flex;
        align-items: center;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-roll::before {
        content: "0";
        flex: 0 0 0;
        width: 0;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        overflow: hidden;
        visibility: hidden;
      }
      #${ROOT_ID} .cltc-roll-separator {
        display: inline-block;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
      }
      #${ROOT_ID} .cltc-roll-digit-column {
        position: relative;
        display: inline-block;
        width: 1ch;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        contain: layout paint style;
      }
      #${ROOT_ID} .cltc-roll-digit-column::before {
        content: "0";
        visibility: hidden;
      }
      #${ROOT_ID} .cltc-roll-digit-clip {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      #${ROOT_ID} .cltc-roll-digit-stack {
        display: flex;
        flex-direction: column;
        height: var(--cltc-roll-row);
        contain: layout size style;
        transform: translateY(var(--cltc-roll-to-y, 0px));
        transition: transform var(--transition-duration-relaxed, .3s) cubic-bezier(.16, 1, .3, 1);
        will-change: transform;
      }
      #${ROOT_ID} .cltc-roll-digit-stack > span {
        flex: 0 0 var(--cltc-roll-row);
        display: block;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
      }
      #${ROOT_ID} .cltc-roll-digit-stack[data-animate="true"] {
        transform: translateY(var(--cltc-roll-from-y, var(--cltc-roll-to-y, 0px)));
      }
      @keyframes cltc-cadenced-shimmer-sweep {
        0% { transform: translate(-50%); }
        to { transform: translate(125%); }
      }
      @keyframes cltc-cadenced-shimmer-highlight {
        0% { transform: translate(50%); }
        to { transform: translate(-125%); }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .cltc-roll-digit-stack,
        #${ROOT_ID} .cltc-roll-digit-stack[data-animate="true"],
        #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep,
        #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
          animation: none;
          transition: none;
        }
      }
      @media (prefers-color-scheme: light) {
        #${ROOT_ID} {
          color-scheme: light;
          --cltc-text: #111827;
          --cltc-muted: rgba(26, 28, 31, .494);
          --cltc-border: #d1d5db;
          --cltc-surface: #ffffff;
          --cltc-arc-bg: rgb(246, 246, 246);
          --cltc-shimmer-contrast: #fff;
        }
      }
      @media (prefers-color-scheme: dark) {
        #${ROOT_ID} {
          color-scheme: dark;
          --cltc-text: #d4d4d8;
          --cltc-muted: rgba(255, 255, 255, .498);
          --cltc-border: #3f3f46;
          --cltc-surface: #2d2d2d;
          --cltc-input: #2d2d2d;
          --cltc-arc-bg: rgb(31, 31, 31);
          --cltc-shimmer-contrast: #fff;
        }
      }
      html.electron-dark #${ROOT_ID} {
        color-scheme: dark;
        --cltc-text: #d4d4d8;
        --cltc-muted: rgba(255, 255, 255, .498);
        --cltc-border: #3f3f46;
        --cltc-surface: #2d2d2d;
        --cltc-input: #2d2d2d;
        --cltc-arc-bg: rgb(31, 31, 31);
        --cltc-shimmer-contrast: #fff;
      }
      .cltc-settings-overlay {
        --cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5));
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-border: var(--color-token-border-light, light-dark(#d1d5db, #3f3f46));
        --cltc-border-subtle: var(--color-token-border-light, light-dark(#e5e7eb, #323238));
        --cltc-surface: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-surface-secondary: var(--color-token-main-surface-secondary, light-dark(#f3f4f6, #27272a));
        --cltc-popover: var(--color-token-dropdown-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-input: var(--color-token-input-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        --cltc-shadow: light-dark(rgba(0, 0, 0, .18), rgba(0, 0, 0, .48));
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 20px;
        background: transparent;
        color: var(--cltc-text);
        color-scheme: light dark;
        -webkit-app-region: no-drag;
      }
      .cltc-settings-modal {
        position: relative;
        display: grid;
        gap: 10px;
        width: min(520px, calc(100vw - 40px));
        max-height: min(680px, calc(100vh - 96px));
        overflow: auto;
        padding: 14px;
        border: 1px solid var(--cltc-border);
        border-radius: 12px;
        background: var(--cltc-popover);
        box-shadow: 0 18px 55px var(--cltc-shadow);
        color: var(--cltc-text);
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--cltc-muted) 35%, transparent) transparent;
      }
      .cltc-settings-modal::-webkit-scrollbar,
      .cltc-settings-overlay .cltc-price-list::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .cltc-settings-modal::-webkit-scrollbar-track,
      .cltc-settings-overlay .cltc-price-list::-webkit-scrollbar-track {
        background: transparent;
      }
      .cltc-settings-modal::-webkit-scrollbar-thumb,
      .cltc-settings-overlay .cltc-price-list::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: color-mix(in srgb, var(--cltc-muted) 35%, transparent);
      }
      #${ROOT_ID} .cltc-price-head,
      .cltc-settings-overlay .cltc-price-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        min-height: 32px;
      }
      #${ROOT_ID} .cltc-price-title,
      .cltc-settings-overlay .cltc-price-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 650;
      }
      #${ROOT_ID} .cltc-price-head button,
      .cltc-settings-overlay .cltc-price-head button {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: 20px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ROOT_ID} .cltc-price-head button:hover,
      #${ROOT_ID} .cltc-price-head button:focus-visible,
      .cltc-settings-overlay .cltc-price-head button:hover,
      .cltc-settings-overlay .cltc-price-head button:focus-visible {
        background: var(--cltc-hover);
        outline: none;
      }
      #${ROOT_ID} .cltc-price-list,
      .cltc-settings-overlay .cltc-price-list {
        display: grid;
        max-height: 180px;
        overflow: auto;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: 6px;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--cltc-muted) 35%, transparent) transparent;
      }
      #${ROOT_ID} .cltc-settings-section,
      .cltc-settings-overlay .cltc-settings-section {
        display: grid;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      #${ROOT_ID} .cltc-settings-title,
      .cltc-settings-overlay .cltc-settings-title {
        font-weight: 650;
      }
      #${ROOT_ID} .cltc-sync-status,
      .cltc-settings-overlay .cltc-sync-status {
        min-height: 17px;
        color: var(--cltc-muted);
      }
      #${ROOT_ID} .cltc-sync-status[data-helper-unavailable="true"],
      .cltc-settings-overlay .cltc-sync-status[data-helper-unavailable="true"] {
        color: color-mix(in srgb, #b45309 75%, var(--cltc-text));
      }
      #${ROOT_ID} .cltc-price-row,
      .cltc-settings-overlay .cltc-price-row {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) repeat(3, minmax(44px, .45fr));
        gap: 6px;
        align-items: center;
        width: 100%;
        min-height: 26px;
        padding: 4px 6px;
        border: 0;
        border-bottom: 1px solid var(--cltc-border-subtle);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
      }
      #${ROOT_ID} .cltc-price-row[data-active="true"],
      .cltc-settings-overlay .cltc-price-row[data-active="true"] {
        background: var(--cltc-hover);
        font-weight: 650;
      }
      #${ROOT_ID} .cltc-price-row span,
      .cltc-settings-overlay .cltc-price-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-price-grid,
      .cltc-settings-overlay .cltc-price-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      #${ROOT_ID} .cltc-price-field-full,
      .cltc-settings-overlay .cltc-price-field-full {
        grid-column: 1 / -1;
      }
      #${ROOT_ID} .cltc-price-field,
      .cltc-settings-overlay .cltc-price-field {
        display: grid;
        gap: 3px;
      }
      #${ROOT_ID} .cltc-toggle-field,
      .cltc-settings-overlay .cltc-toggle-field {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        min-height: 28px;
        color: var(--cltc-text);
        cursor: pointer;
      }
      #${ROOT_ID} .cltc-toggle-field input,
      .cltc-settings-overlay .cltc-toggle-field input {
        appearance: none;
        position: relative;
        width: 34px;
        height: 20px;
        margin: 0;
        border: 1px solid var(--cltc-border);
        border-radius: 999px;
        background: var(--cltc-surface-secondary);
        cursor: pointer;
        transition: background .15s ease, border-color .15s ease;
      }
      #${ROOT_ID} .cltc-toggle-field input::after,
      .cltc-settings-overlay .cltc-toggle-field input::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--cltc-surface);
        box-shadow: 0 1px 3px rgba(0, 0, 0, .22);
        transition: transform .15s ease;
      }
      #${ROOT_ID} .cltc-toggle-field input:checked,
      .cltc-settings-overlay .cltc-toggle-field input:checked {
        border-color: var(--cltc-text);
        background: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-toggle-field input:checked::after,
      .cltc-settings-overlay .cltc-toggle-field input:checked::after {
        transform: translateX(14px);
      }
      #${ROOT_ID} .cltc-toggle-field input:focus-visible,
      .cltc-settings-overlay .cltc-toggle-field input:focus-visible {
        outline: 2px solid var(--cltc-muted);
        outline-offset: 2px;
      }
      #${ROOT_ID} .cltc-price-field span,
      .cltc-settings-overlay .cltc-price-field span {
        padding: 0;
        border: 0;
        background: transparent;
        opacity: .68;
      }
      #${ROOT_ID} .cltc-price-input,
      #${ROOT_ID} .cltc-profile-select,
      .cltc-settings-overlay .cltc-price-input,
      .cltc-settings-overlay .cltc-profile-select {
        min-width: 0;
        height: 28px;
        padding: 3px 6px;
        border: 1px solid var(--cltc-border);
        border-radius: 6px;
        background: var(--cltc-input);
        color: var(--cltc-text);
        font: inherit;
      }
      #${ROOT_ID} .cltc-price-actions,
      .cltc-settings-overlay .cltc-price-actions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
      }
      #${ROOT_ID} .cltc-price-actions-left,
      .cltc-settings-overlay .cltc-price-actions-left {
        justify-content: flex-start;
      }
      #${ROOT_ID} .cltc-price-actions button,
      #${ROOT_ID} .cltc-price-actions .cltc-link-button,
      .cltc-settings-overlay .cltc-price-actions button,
      .cltc-settings-overlay .cltc-price-actions .cltc-link-button {
        min-height: 26px;
        padding: 3px 8px;
        border: 1px solid var(--cltc-border);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-decoration: none;
      }
      #${ROOT_ID} .cltc-price-actions button:hover,
      #${ROOT_ID} .cltc-price-actions .cltc-link-button:hover,
      #${ROOT_ID} .cltc-price-row:hover,
      .cltc-settings-overlay .cltc-price-actions button:hover,
      .cltc-settings-overlay .cltc-price-actions .cltc-link-button:hover,
      .cltc-settings-overlay .cltc-price-row:hover {
        background: var(--cltc-hover);
      }
      .cltc-header-settings {
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        box-sizing: border-box;
        color-scheme: light dark;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 72px;
        height: 30px;
        margin-left: 4px;
        padding: 0 8px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        pointer-events: auto;
        -webkit-app-region: no-drag;
        white-space: nowrap;
        font: 13px/18px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }
      .cltc-header-settings[data-floating="true"] {
        position: fixed;
        z-index: 2147483647;
        margin-left: 0;
      }
      .cltc-header-settings:hover,
      .cltc-header-settings:focus-visible {
        background: var(--cltc-hover);
        outline: none;
      }
    `;
    document.head?.appendChild(style);
  }

  function ensureRoot() {
    ensureStyle();
    cleanupDuplicateRoots();
    const composer = findComposerBox();
    if (!composer?.parentElement) {
      state.root?.remove();
      cleanupDuplicateRoots();
      return null;
    }
    if (!state.root) {
      state.root = document.createElement("div");
      state.root.id = ROOT_ID;
      state.root.addEventListener("click", (event) => {
        handleSettingsClick(event);
      });
    }
    state.root.dataset.cltcVersion = VERSION;
    if (state.root.parentElement !== composer.parentElement || state.root.nextElementSibling !== composer) {
      composer.parentElement.insertBefore(state.root, composer);
    }
    cleanupDuplicateRoots(state.root);
    return state.root;
  }

  function cleanupDuplicateRoots(keep = state.root) {
    for (const node of Array.from(document.querySelectorAll?.(`#${ROOT_ID}`) || [])) {
      if (node !== keep) node.remove?.();
    }
  }

  function handleSettingsClick(event) {
    if (event.target?.classList?.contains("cltc-settings-overlay")) {
      state.priceEditorOpen = false;
      render(true);
      return;
    }
    const picked = event.target.closest?.("[data-price-pick]");
    if (event.target.closest?.("[data-action='save-price']")) {
      savePriceFromEditor();
      return;
    }
    if (event.target.closest?.("[data-action='delete-price']")) {
      deletePriceForModel(rootPriceModel());
      return;
    }
    if (picked) {
      state.priceEditorModel = picked.getAttribute("data-price-pick") || "";
      renderSettingsOverlay(liveSnapshot());
      return;
    }
    if (event.target.closest?.("[data-action='save-profile']")) {
      saveProfilePrefsFromEditor();
      return;
    }
    if (event.target.closest?.("[data-action='sync-cc-switch']")) {
      void syncCcSwitchFromSettings();
      return;
    }
    const hubToggle = event.target.closest?.("[data-misc-field='hubVisible']");
    if (hubToggle) {
      saveHubVisible(Boolean(hubToggle.checked));
      syncHubVisibility();
      return;
    }
    if (event.target.closest?.("[data-action='reset-price']")) {
      restoreDefaultPrices();
      renderSettingsOverlay(liveSnapshot());
      return;
    }
    if (event.target.closest?.("[data-action='new-price']")) {
      startNewPriceModel();
      return;
    }
    if (event.target.closest?.("[data-action='close-price']")) {
      state.priceEditorOpen = false;
      render(true);
      return;
    }
  }

  function settingsEditorRoot() {
    return state.settingsOverlay || state.root;
  }

  function rootPriceModel() {
    const root = settingsEditorRoot();
    return (
      normalizeText(root?.querySelector("[data-price-field='model']")?.value) ||
      normalizeText(root?.querySelector("[data-price-model]")?.getAttribute("data-price-model"))
    );
  }

  function restoreDefaultPrices() {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    for (const model of Object.keys(DEFAULT_PRICES)) delete overrides[model];
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    const hidden = hiddenPriceModels();
    for (const model of Object.keys(DEFAULT_PRICES)) hidden.delete(model);
    saveHiddenPriceModels(hidden);
    state.priceEditorModel = nextPriceEditorModel(modelName());
    return true;
  }

  function nextPriceEditorModel(preferred = "") {
    const models = Object.keys(visiblePrices()).sort((a, b) => a.localeCompare(b));
    return models.includes(preferred) ? preferred : models[0] || preferred || newPriceModelName();
  }

  function deletePriceForModel(model) {
    const name = normalizeText(model);
    if (!name) return false;
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    delete overrides[name];
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    const hidden = hiddenPriceModels();
    hidden.add(name);
    saveHiddenPriceModels(hidden);
    state.priceEditorModel = nextPriceEditorModel(modelName());
    renderSettingsOverlay(liveSnapshot());
    return true;
  }

  function newPriceModelName() {
    const prices = visiblePrices();
    let name = "new-model";
    let index = 2;
    while (prices[name]) {
      name = `new-model-${index}`;
      index += 1;
    }
    return name;
  }

  function startNewPriceModel() {
    state.priceEditorModel = newPriceModelName();
    renderSettingsOverlay(liveSnapshot());
  }

  function savePriceFromEditor() {
    const root = settingsEditorRoot();
    const model = rootPriceModel();
    if (!model) return false;
    const input = root.querySelector("[data-price-field='input']")?.value;
    const cachedInput = root.querySelector("[data-price-field='cachedInput']")?.value;
    const output = root.querySelector("[data-price-field='output']")?.value;
    const saved = window.__codexLiveTokenCost.setModelPrice(model, { input, cachedInput, output });
    if (saved) {
      state.priceEditorModel = model;
      renderSettingsOverlay(liveSnapshot());
    } else {
      render();
    }
    return saved;
  }

  function saveProfilePrefsFromEditor(rootOverride) {
    const root = rootOverride || settingsEditorRoot();
    if (!root) return false;
    const emailField = root.querySelector("[data-profile-field='email']");
    if (!emailField) return false;
    const email = normalizeText(emailField.value, 128);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    const planType = root.querySelector("[data-profile-field='planType']")?.value;
    const planCustom = root.querySelector("[data-profile-field='planCustom']")?.value;
    const selectedPlan = planType === "custom" ? planCustom : planType;
    const plan = normalizeProfilePlan(selectedPlan, planCustom);
    saveLocalProfilePrefs({
      ...localProfilePrefs(),
      email,
      planType: plan.planType,
      planLabel: plan.planLabel,
    }, { profileEditor: true });
    render();
    return true;
  }

  function setCcSwitchSyncStatus(message) {
    state.ccSwitchSyncStatus = normalizeText(message, 160);
    const status = settingsEditorRoot()?.querySelector("[data-field='cc-switch-sync-status']");
    if (status) status.textContent = state.ccSwitchSyncStatus;
  }

  async function syncCcSwitchFromSettings() {
    const button = settingsEditorRoot()?.querySelector("[data-action='sync-cc-switch']");
    if (button) button.disabled = true;
    setCcSwitchSyncStatus("正在同步 CC Switch...");
    const result = await syncCcSwitchUsageFromHelper();
    if (result.ok) {
      const imported = toCount(result.imported);
      const total = toCount(result.total ?? result.seen ?? result.rows);
      const suffix = total ? ` / ${fmtCount(total)} 条` : "";
      setCcSwitchSyncStatus(`已同步 ${fmtCount(imported)} 条${suffix}`);
      render(true);
    } else if (result.skipped) {
      setCcSwitchSyncStatus(result.helperUnavailable ? "同步已跳过：helper 不可用，本地统计继续可用" : "同步已跳过：已有同步任务正在执行");
    } else if (result.helperUnavailable) {
      setCcSwitchSyncStatus("同步失败：helper 未运行，今日统计仅使用本地捕获数据");
    } else {
      setCcSwitchSyncStatus(`同步失败：${normalizeText(result.error, 100) || "helper 不可用"}`);
    }
    if (button) button.disabled = false;
    return result;
  }

  function ccSwitchSettingsHtml() {
    return `
      <div class="cltc-settings-section">
        <div class="cltc-settings-title">杂项</div>
        <div class="cltc-sync-status" data-field="helper-status" data-helper-unavailable="${state.helperUnavailable ? "true" : "false"}">${escapeHtml(helperStatusText())}</div>
        <label class="cltc-toggle-field">
          <span>显示 HUB</span>
          <input type="checkbox" data-misc-field="hubVisible"${hubVisible() ? " checked" : ""}>
        </label>
        <div class="cltc-price-actions cltc-price-actions-left">
          <button type="button" data-action="sync-cc-switch">同步 CC Switch 统计数据</button>
          <a class="cltc-link-button" href="${escapeHtml(HELPER_GITHUB_URL)}" target="_blank" rel="noreferrer">查看 helper 脚本</a>
        </div>
        <div class="cltc-sync-status" data-field="cc-switch-sync-status">${escapeHtml(state.ccSwitchSyncStatus)}</div>
      </div>
    `;
  }

  function profileSettingsHtml() {
    const prefs = localProfilePrefs();
    const selectedOption = profilePlanOption(prefs.planType);
    const selectedValue = selectedOption?.value || "custom";
    const customValue = selectedOption ? "" : prefs.planLabel || prefs.planType;
    const optionHtml = PROFILE_PLAN_OPTIONS.map(
      (option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
    ).join("");
    return `
      <div class="cltc-settings-section">
        <div class="cltc-settings-title">伪装资料</div>
        <div class="cltc-price-grid">
          <label class="cltc-price-field cltc-price-field-full">
            <span>邮箱</span>
            <input class="cltc-price-input" data-profile-field="email" type="email" value="${escapeHtml(prefs.email)}">
          </label>
          <label class="cltc-price-field">
            <span>Plan 类型</span>
            <select class="cltc-profile-select" data-profile-field="planType">
              ${optionHtml}
              <option value="custom"${selectedValue === "custom" ? " selected" : ""}>自定义</option>
            </select>
          </label>
          <label class="cltc-price-field">
            <span>自定义</span>
            <input class="cltc-price-input" data-profile-field="planCustom" type="text" value="${escapeHtml(customValue)}" placeholder="Team Enterprise">
          </label>
        </div>
        <div class="cltc-price-actions">
          <button type="button" data-action="save-profile">保存资料</button>
        </div>
      </div>
    `;
  }

  function pricePopoverHtml(snap) {
    if (!state.priceEditorOpen) return "";
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const models = Object.keys(visiblePrices()).sort((a, b) => a.localeCompare(b));
    const model = normalizeText(state.priceEditorModel) || snap.model;
    const price = priceFor(model) || { input: "", cachedInput: "", output: "" };
    const value = (field) => (price[field] == null ? "" : String(price[field]));
    const source = normalizePrice(overrides[model]) ? "自定义" : DEFAULT_PRICES[model] ? "默认" : "新增";
    const row = (name) => {
      const item = priceFor(name) || {};
      const cell = (field) => (item[field] == null ? "-" : String(item[field]));
      return `
        <button class="cltc-price-row" type="button" data-price-pick="${escapeHtml(name)}" data-active="${String(name === model)}">
          <span title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <span>${escapeHtml(cell("input"))}</span>
          <span>${escapeHtml(cell("cachedInput"))}</span>
          <span>${escapeHtml(cell("output"))}</span>
        </button>
      `;
    };
    return `
      <div class="cltc-settings-modal" role="dialog" aria-modal="true" aria-label="Codex Token Cost 设置" data-price-model="${escapeHtml(model)}">
        <div class="cltc-price-head">
          <span class="cltc-price-title" title="${escapeHtml(model)}">Codex Token Cost 设置</span>
          <button type="button" data-action="close-price" aria-label="关闭">×</button>
        </div>
        ${profileSettingsHtml()}
        ${ccSwitchSettingsHtml()}
        <div class="cltc-settings-section">
          <div class="cltc-settings-title">模型价格</div>
          <div class="cltc-muted">${source} · USD/1M</div>
        </div>
        <div class="cltc-price-row" aria-hidden="true">
          <span>模型</span><span>输入</span><span>缓存</span><span>输出</span>
        </div>
        <div class="cltc-price-list">
          ${models.map(row).join("")}
        </div>
        <div class="cltc-price-grid">
          <label class="cltc-price-field cltc-price-field-full">
            <span>模型名</span>
            <input class="cltc-price-input" data-price-field="model" type="text" value="${escapeHtml(model)}">
          </label>
          <label class="cltc-price-field">
            <span>输入</span>
            <input class="cltc-price-input" data-price-field="input" type="number" min="0" step="0.000001" value="${escapeHtml(value("input"))}">
          </label>
          <label class="cltc-price-field">
            <span>缓存</span>
            <input class="cltc-price-input" data-price-field="cachedInput" type="number" min="0" step="0.000001" value="${escapeHtml(value("cachedInput"))}">
          </label>
          <label class="cltc-price-field">
            <span>输出</span>
            <input class="cltc-price-input" data-price-field="output" type="number" min="0" step="0.000001" value="${escapeHtml(value("output"))}">
          </label>
        </div>
        <div class="cltc-price-actions">
          <button type="button" data-action="reset-price">默认</button>
          <button type="button" data-action="new-price">新建</button>
          <button type="button" data-action="delete-price">删除</button>
          <button type="button" data-action="save-price">保存</button>
        </div>
      </div>
    `;
  }

  function renderSettingsOverlay(snap) {
    if (!state.priceEditorOpen) {
      state.settingsOverlay?.remove?.();
      state.settingsOverlay = null;
      return;
    }
    if (!state.settingsOverlay) {
      state.settingsOverlay = document.createElement("div");
      state.settingsOverlay.className = "cltc-settings-overlay";
      state.settingsOverlay.addEventListener("click", handleSettingsClick);
      state.settingsOverlay.addEventListener("change", handleSettingsChange);
    }
    if (!state.settingsOverlay.isConnected) (document.body || document.documentElement)?.appendChild(state.settingsOverlay);
    const modalScrollTop = state.settingsOverlay.querySelector(".cltc-settings-modal")?.scrollTop || 0;
    const listScrollTop = state.settingsOverlay.querySelector(".cltc-price-list")?.scrollTop || 0;
    state.settingsOverlay.innerHTML = pricePopoverHtml(snap);
    const modal = state.settingsOverlay.querySelector(".cltc-settings-modal");
    const list = state.settingsOverlay.querySelector(".cltc-price-list");
    if (modal) modal.scrollTop = modalScrollTop;
    if (list) list.scrollTop = listScrollTop;
  }

  function rollComparableValue(text) {
    const value = normalizeText(text, 80).replace(/,/g, "");
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const unit = value.slice(match.index + match[0].length).trim().toUpperCase();
    let multiplier = 1;
    if (unit.startsWith("K")) multiplier = 1_000;
    else if (unit.startsWith("M")) multiplier = 1_000_000;
    else if (unit.startsWith("B")) multiplier = 1_000_000_000;
    return Number(match[0]) * multiplier;
  }

  function rollTrend(previous, next) {
    const before = rollComparableValue(previous);
    const after = rollComparableValue(next);
    if (before == null || after == null || before === after) return "same";
    return after > before ? "up" : "down";
  }

  function digitChars(text) {
    return Array.from(normalizeText(text, 80));
  }

  function previousDigitByPosition(previous, digitPositionFromRight) {
    if (!previous) return null;
    let position = 0;
    const chars = digitChars(previous);
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      const char = chars[index];
      if (!/\d/.test(char)) continue;
      if (position === digitPositionFromRight) return char;
      position += 1;
    }
    return null;
  }

  function rollingTokens(text) {
    let digitPosition = digitChars(text).filter((char) => /\d/.test(char)).length;
    return digitChars(text).map((char, index) => {
      if (!/\d/.test(char)) return { type: "separator", char, index };
      digitPosition -= 1;
      return { type: "digit", char, digitPosition };
    });
  }

  function createRollingDigitColumn() {
    const column = document.createElement("span");
    column.className = "cltc-roll-digit-column";
    column.setAttribute("aria-hidden", "true");
    column.dataset.cltcTokenType = "digit";
    const clip = document.createElement("span");
    clip.className = "cltc-roll-digit-clip";
    const stack = document.createElement("span");
    stack.className = "cltc-roll-digit-stack";
    stack.dataset.animate = "false";
    "0123456789".split("").forEach((digit) => {
      const row = document.createElement("span");
      row.textContent = digit;
      stack.append(row);
    });
    clip.append(stack);
    column.append(clip);
    return column;
  }

  function updateRollingDigitColumn(column, char, shouldAnimate) {
    const to = Number(char);
    const toY = `-${to * 16}px`;
    const stack = column.querySelector(".cltc-roll-digit-stack");
    if (!stack) return;
    stack.style.setProperty("--cltc-roll-to", String(to));
    stack.style.setProperty("--cltc-roll-to-y", toY);
    stack.dataset.animate = shouldAnimate ? "true" : "false";
    if (!shouldAnimate) {
      stack.style.transform = `translateY(${toY})`;
      stack.dataset.animate = "false";
      return;
    }
    window.requestAnimationFrame?.(() => {
      stack.style.transform = `translateY(${toY})`;
      stack.dataset.animate = "false";
    });
  }

  function createRollingSeparator(char) {
    const separator = document.createElement("span");
    separator.className = "cltc-roll-separator";
    separator.setAttribute("aria-hidden", "true");
    separator.dataset.cltcTokenType = "separator";
    separator.textContent = char;
    return separator;
  }

  function updateRollingValueSlot(slot, key, value) {
    const cacheKey = normalizeText(key, 80);
    const text = normalizeText(value, 80);
    const previous = state.hubValueCache.get(cacheKey);
    const animate = Boolean(previous && previous !== text);
    let roll = slot.firstElementChild;
    if (!roll || !roll.classList?.contains("cltc-roll") || roll.dataset.rollKey !== cacheKey) {
      roll = document.createElement("span");
      roll.className = "cltc-roll";
      roll.dataset.rollKey = cacheKey;
      slot.replaceChildren(roll);
    }
    roll.setAttribute("aria-label", text);
    const oldDigits = new Map();
    Array.from(roll.querySelectorAll(".cltc-roll-digit-column")).forEach((column) => {
      oldDigits.set(column.dataset.cltcDigitPosition || "", column);
    });
    const oldSeparators = Array.from(roll.querySelectorAll(".cltc-roll-separator"));
    let separatorIndex = 0;
    const nodes = rollingTokens(text).map((token) => {
      if (token.type === "separator") {
        const separator = oldSeparators[separatorIndex++] || createRollingSeparator(token.char);
        separator.textContent = token.char;
        return separator;
      }
      const positionKey = String(token.digitPosition);
      const column = oldDigits.get(positionKey) || createRollingDigitColumn();
      const previousChar = previousDigitByPosition(previous, token.digitPosition);
      column.dataset.cltcDigitPosition = positionKey;
      updateRollingDigitColumn(column, token.char, animate && previousChar !== token.char);
      return column;
    });
    roll.replaceChildren(...nodes);
    state.hubValueCache.set(cacheKey, text);
  }

  function cadencedShimmerText(text) {
    const safe = escapeHtml(text);
    return `<span class="cltc-cadenced-shimmer">${safe}<span class="cltc-cadenced-shimmer-sweep" aria-hidden="true"><span class="cltc-cadenced-shimmer-highlight">${safe}</span></span></span>`;
  }

  function cadencedShimmerHtml(html) {
    return `<span class="cltc-cadenced-shimmer">${html}<span class="cltc-cadenced-shimmer-sweep" aria-hidden="true"><span class="cltc-cadenced-shimmer-highlight">${html}</span></span></span>`;
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch {
      return false;
    }
  }

  function applyCadencedShimmerActive(active) {
    const nodes = state.root?.querySelectorAll?.(".cltc-cadenced-shimmer");
    if (!nodes) return;
    const elapsed = active && state.shimmerActiveStartedAt ? Math.max(0, Math.min(Date.now() - state.shimmerActiveStartedAt, SHIMMER_ACTIVE_MS)) : 0;
    nodes.forEach((node) => {
      const isActive = node.classList.contains("cltc-cadenced-shimmer-active");
      if (active) {
        if (!isActive) {
          node.style.setProperty("--cltc-shimmer-active-delay", `-${elapsed}ms`);
          node.classList.add("cltc-cadenced-shimmer-active");
        }
      } else if (isActive) {
        node.style.removeProperty("--cltc-shimmer-active-delay");
        node.classList.remove("cltc-cadenced-shimmer-active");
      }
    });
  }

  function clearCadencedShimmerTimers(options = {}) {
    const clearActive = options.clearActive !== false;
    if (state.shimmerDelayTimer) {
      window.clearTimeout(state.shimmerDelayTimer);
      state.shimmerDelayTimer = 0;
    }
    if (state.shimmerIntervalTimer) {
      window.clearInterval(state.shimmerIntervalTimer);
      state.shimmerIntervalTimer = 0;
    }
    if (clearActive && state.shimmerActiveTimer) {
      window.clearTimeout(state.shimmerActiveTimer);
      state.shimmerActiveTimer = 0;
    }
  }

  function pulseCadencedShimmer() {
    if (!state.shimmerRunning || prefersReducedMotion()) return;
    if (state.shimmerActiveTimer) {
      window.clearTimeout(state.shimmerActiveTimer);
      state.shimmerActiveTimer = 0;
    }
    applyCadencedShimmerActive(false);
    void state.root?.offsetWidth;
    state.shimmerActiveStartedAt = Date.now();
    state.shimmerActiveUntil = Date.now() + SHIMMER_ACTIVE_MS;
    applyCadencedShimmerActive(true);
    state.shimmerActiveTimer = window.setTimeout(() => {
      state.shimmerActiveTimer = 0;
      state.shimmerActiveStartedAt = 0;
      state.shimmerActiveUntil = 0;
      applyCadencedShimmerActive(false);
    }, SHIMMER_ACTIVE_MS);
  }

  function stopCadencedShimmer(options = {}) {
    const finishActive = Boolean(options.finishActive);
    state.shimmerRunning = false;
    const remaining = Math.max(0, (state.shimmerActiveUntil || 0) - Date.now());
    clearCadencedShimmerTimers({ clearActive: !finishActive });
    if (finishActive && remaining > 0) {
      applyCadencedShimmerActive(true);
      if (!state.shimmerActiveTimer) {
        state.shimmerActiveTimer = window.setTimeout(() => {
          state.shimmerActiveTimer = 0;
          state.shimmerActiveStartedAt = 0;
          state.shimmerActiveUntil = 0;
          applyCadencedShimmerActive(false);
        }, remaining);
      }
      return;
    }
    state.shimmerActiveStartedAt = 0;
    state.shimmerActiveUntil = 0;
    applyCadencedShimmerActive(false);
  }

  function syncCadencedShimmer(running) {
    if (!running) {
      if (state.shimmerRunning || state.shimmerActiveUntil) stopCadencedShimmer({ finishActive: true });
      return;
    }
    if (state.shimmerRunning) {
      applyCadencedShimmerActive(state.shimmerActiveUntil > Date.now());
      return;
    }
    state.shimmerRunning = true;
    if (prefersReducedMotion()) return;
    state.shimmerDelayTimer = window.setTimeout(() => {
      state.shimmerDelayTimer = 0;
      pulseCadencedShimmer();
      state.shimmerIntervalTimer = window.setInterval(pulseCadencedShimmer, SHIMMER_INTERVAL_MS);
    }, SHIMMER_DELAY_MS);
  }

  function valueSlot(key) {
    return `<span class="cltc-value-slot" data-cltc-value-key="${escapeHtml(key)}"></span>`;
  }

  function textSlot(key) {
    return `<span class="cltc-text-slot" data-cltc-text-key="${escapeHtml(key)}"></span>`;
  }

  function currentFlowSkeleton() {
    return `本轮 输入 ${valueSlot("current-input")}<span class="cltc-current-spacer" aria-hidden="true">&nbsp;&nbsp;</span>输出 ${valueSlot("current-output")}`;
  }

  function hubSkeletonHtml() {
    const currentFlow = currentFlowSkeleton();
    return `
      <span class="cltc-pill cltc-current-pill"><span class="cltc-current-flow">${cadencedShimmerHtml(currentFlow)}</span></span>
      <span class="cltc-pill">会话 ${valueSlot("session-total")}</span>
      <span class="cltc-pill">缓存 ${valueSlot("session-cached")} (${valueSlot("session-cache-percent")})</span>
      <span class="cltc-pill">花费 ${valueSlot("session-cost")}${textSlot("session-priced-label")}</span>
      <span class="cltc-pill">今日 ${valueSlot("day-cost")}${textSlot("day-priced-label")}</span>
      <span class="cltc-pill" data-cltc-model-pill="true"><span class="cltc-model-label">${officialFastModeIconHtml()}<span class="cltc-model-text">${textSlot("model")}</span></span></span>
    `;
  }

  function ensureHubSkeleton(root) {
    if (root.dataset.cltcSkeletonVersion === VERSION && root.querySelector?.("[data-cltc-value-key='current-input']")) return;
    root.innerHTML = hubSkeletonHtml();
    root.dataset.cltcSkeletonVersion = VERSION;
  }

  function updateValueSlot(root, key, value) {
    root.querySelectorAll?.("[data-cltc-value-key]").forEach((slot) => {
      if (slot.dataset.cltcValueKey !== key) return;
      updateRollingValueSlot(slot, key, value);
    });
  }

  function updateTextSlot(root, key, value) {
    const text = String(value ?? "");
    root.querySelectorAll?.("[data-cltc-text-key]").forEach((slot) => {
      if (slot.dataset.cltcTextKey !== key) return;
      if (slot.textContent !== text) slot.textContent = text;
    });
  }

  function updateHubContent(root, snap, sessionPricedLabel, dayPricedLabel, effortLabel) {
    updateValueSlot(root, "current-input", fmtCount(snap.current.input));
    updateValueSlot(root, "current-output", fmtCount(snap.current.output));
    updateValueSlot(root, "session-total", fmtCount(snap.session.total));
    updateValueSlot(root, "session-cached", fmtCount(snap.session.cached));
    updateValueSlot(root, "session-cache-percent", fmtPercent(snap.session.cached, snap.session.input));
    updateValueSlot(root, "session-cost", fmtMoney(snap.sessionCost.value));
    updateValueSlot(root, "day-cost", fmtMoney(snap.dayCost.value));
    updateTextSlot(root, "session-priced-label", sessionPricedLabel);
    updateTextSlot(root, "day-priced-label", dayPricedLabel);
    updateTextSlot(root, "model", `${snap.model}${effortLabel}`);
    const modelPill = root.querySelector?.("[data-cltc-model-pill='true']");
    if (modelPill) modelPill.removeAttribute("title");
    const fastIcon = root.querySelector?.("[data-cltc-fast-mode-icon='true']");
    if (fastIcon) {
      fastIcon.hidden = !snap.fastMode;
      if (snap.fastMode) fastIcon.removeAttribute?.("hidden");
      else fastIcon.setAttribute?.("hidden", "");
    }
  }

  function render(force = false) {
    if (!force && state.priceEditorOpen && state.settingsOverlay?.contains(document.activeElement) && document.activeElement?.closest?.(".cltc-settings-modal")) {
      return;
    }
    state.lastRenderAt = Date.now();
    ensureHeaderSettingsButton();
    const root = ensureRoot();
    if (!root) return;
    const snap = liveSnapshot();
    updateHeaderSettingsButton(snap);
    const sessionPricedLabel = costPricedLabel(snap.sessionCost, snap.session);
    const dayPricedLabel = costPricedLabel(snap.dayCost, snap.dayUsage);
    const effortLabel = snap.modelInfo.effort ? ` · ${snap.modelInfo.effort}` : "";
    root.dataset.running = String(snap.running);
    ensureHubSkeleton(root);
    updateHubContent(root, snap, sessionPricedLabel, dayPricedLabel, effortLabel);
    syncCadencedShimmer(snap.running);
    syncHubVisibility(root);
    renderSettingsOverlay(snap);
  }

  function scheduleRender(delay = 0) {
    if (state.renderTimer) return;
    const wait = Math.max(delay, RENDER_THROTTLE_MS - (Date.now() - state.lastRenderAt), 0);
    state.renderTimer = window.setTimeout(() => {
      state.renderTimer = 0;
      render();
    }, wait);
  }

  function handleInput(event) {
    if (event.target?.closest?.("[data-profile-field]")) {
      saveProfilePrefsFromEditor();
      return;
    }
  }

  function handleSettingsChange(event) {
    const hubToggle = event.target?.closest?.("[data-misc-field='hubVisible']");
    if (hubToggle) {
      saveHubVisible(Boolean(hubToggle.checked));
      syncHubVisibility();
      scheduleHubVisibilitySync(0);
      return;
    }
    if (event.target?.closest?.("[data-profile-field]")) {
      saveProfilePrefsFromEditor();
    }
  }

  function handleDocumentPointerDown(event) {
    if (state.priceEditorOpen && !state.root?.contains(event.target) && !state.settingsOverlay?.contains(event.target)) {
      state.priceEditorOpen = false;
      render();
    }
  }

  function installLocalFetchCapture() {
    if (typeof window.fetch !== "function" || window.fetch.__codexLiveTokenCostWrapped === VERSION) return;
    const originalFetch = window.fetch.__codexLiveTokenCostOriginal || window.fetch;
    async function wrappedFetch(input, init) {
      const url = requestUrl(input);
      const method = requestMethod(input, init);
      if (isProfileUsageUrl(url) || isProfilePhotoUrl(url)) {
        return new Response(JSON.stringify(await profileFetchBodyAsync(method, init?.body)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const isCodexApi = isCodexApiUrl(url);
      if (isCodexApi) {
        observeSessionInfo(url);
        try {
          inspectLocalPayload(init?.body, "fetch-body");
        } catch {
          // Keep page fetch behavior untouched.
        }
      }
      const response = await originalFetch.call(this, input, init);
      if (response?.clone && isCodexApi) {
        response.clone().text().then((text) => inspectLocalPayload(text, "fetch")).catch(() => {});
      }
      return response;
    }
    wrappedFetch.__codexLiveTokenCostWrapped = VERSION;
    wrappedFetch.__codexLiveTokenCostOriginal = originalFetch;
    window.fetch = wrappedFetch;
  }

  function installLocalXhrCapture() {
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype || Xhr.prototype.__codexLiveTokenCostWrapped === VERSION) return;
    const originalOpen = Xhr.prototype.__codexLiveTokenCostOriginalOpen || Xhr.prototype.open;
    const originalSend = Xhr.prototype.__codexLiveTokenCostOriginalSend || Xhr.prototype.send;
    Xhr.prototype.open = function open(method, url, ...rest) {
      this.__codexLiveTokenCostUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function send(...args) {
      const url = this.__codexLiveTokenCostUrl || "";
      const isCodexApi = isCodexApiUrl(url);
      if (isCodexApi) {
        observeSessionInfo(url);
        try {
          inspectLocalPayload(args[0], "xhr-body");
        } catch {
          // Keep XHR behavior untouched.
        }
      }
      this.addEventListener?.("loadend", () => {
        if (!isCodexApiUrl(this.__codexLiveTokenCostUrl)) return;
        try {
          inspectLocalPayload(this.responseText || "", "xhr");
        } catch {
          // Ignore unreadable XHR bodies.
        }
      });
      return originalSend.apply(this, args);
    };
    Xhr.prototype.__codexLiveTokenCostOriginalOpen = originalOpen;
    Xhr.prototype.__codexLiveTokenCostOriginalSend = originalSend;
    Xhr.prototype.__codexLiveTokenCostWrapped = VERSION;
  }

  function installLocalWebSocketCapture() {
    if (typeof window.WebSocket !== "function" || window.WebSocket.__codexLiveTokenCostWrapped === VERSION) return;
    const NativeWebSocket = window.WebSocket.__codexLiveTokenCostOriginal || window.WebSocket;
    function WrappedWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener?.("message", (event) => {
        try {
          if (typeof event.data === "string") inspectLocalPayload(event.data, "websocket");
          else if (event.data instanceof Blob && event.data.size <= 512000) {
            event.data.text().then((text) => inspectLocalPayload(text, "websocket")).catch(() => {});
          }
        } catch {
          // Keep socket delivery untouched.
        }
      });
      return socket;
    }
    try {
      WrappedWebSocket.prototype = NativeWebSocket.prototype;
      Object.defineProperty(WrappedWebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
      Object.defineProperty(WrappedWebSocket, "OPEN", { value: NativeWebSocket.OPEN });
      Object.defineProperty(WrappedWebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
      Object.defineProperty(WrappedWebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });
    } catch {
      // Best-effort compatibility.
    }
    WrappedWebSocket.__codexLiveTokenCostWrapped = VERSION;
    WrappedWebSocket.__codexLiveTokenCostOriginal = NativeWebSocket;
    window.WebSocket = WrappedWebSocket;
  }

  function installLocalMessageCapture() {
    if (window.__codexLiveTokenCostMessageCapture === VERSION) return;
    window.addEventListener?.("message", (event) => inspectLocalPayload(event.data, "message"), true);
    window.__codexLiveTokenCostMessageCapture = VERSION;
  }

  function helperJsonViaBridge(url) {
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function") return Promise.reject(new Error("electronBridge unavailable"));
    const requestId = `cltc-helper-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let timer = 0;
      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        window.removeEventListener?.("message", handler, true);
      };
      const handler = (event) => {
        const data = event?.data;
        if (!data || data.requestId !== requestId || data.type !== "fetch-response") return;
        cleanup();
        if (data.responseType !== "success" || toCount(data.status) >= 400) {
          reject(new Error(`helper bridge fetch failed: ${data.status || data.responseType || "unknown"}`));
          return;
        }
        try {
          resolve(JSON.parse(data.bodyJsonString || "{}"));
        } catch (error) {
          reject(error);
        }
      };
      window.addEventListener?.("message", handler, true);
      timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("helper bridge fetch timeout"));
      }, 3000);
      Promise.resolve(bridge.sendMessageFromView({ type: "fetch", method: "GET", url, requestId })).catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  async function helperJson(url) {
    try {
      return await helperJsonViaBridge(url);
    } catch {
      const response = await window.fetch(url, { cache: "no-store" });
      if (!response?.ok) throw new Error(`helper fetch failed: ${response?.status || 0}`);
      return response.json();
    }
  }

  async function pollLocalHelperStats(options = {}) {
    if (state.helperPollInFlight) return state.helperPollPromise;
    if (typeof window.fetch !== "function") {
      setHelperStatus(HELPER_STATUS_DEGRADED, true);
      return false;
    }
    state.helperPollInFlight = true;
    state.helperPollPromise = (async () => {
      try {
        return mergeHelperStats(await helperJson(options.refresh ? HELPER_STATS_REFRESH_URL : HELPER_STATS_URL));
      } catch {
        // Helper is optional. Missing helper must not break Codex.
        setHelperStatus(HELPER_STATUS_DEGRADED, true);
        return false;
      } finally {
        state.helperPollInFlight = false;
        state.helperPollPromise = null;
      }
    })();
    return state.helperPollPromise;
  }

  async function syncCcSwitchUsageFromHelper() {
    if (state.ccSwitchSyncInFlight) return { ok: false, skipped: true };
    if (typeof window.fetch !== "function") {
      setHelperStatus(HELPER_STATUS_CC_SWITCH_DEGRADED, true);
      return { ok: false, skipped: true, helperUnavailable: true };
    }
    state.ccSwitchSyncInFlight = true;
    try {
      const payload = await helperJson(CC_SWITCH_TURNS_URL);
      const turns = Array.isArray(payload?.turns) ? payload.turns : [];
      const result = importLocalUsageTurns(turns, { replaceSource: "cc-switch" });
      setHelperStatus(HELPER_STATUS_CONNECTED, false);
      return { ok: true, ...result };
    } catch (error) {
      setHelperStatus(HELPER_STATUS_CC_SWITCH_DEGRADED, true);
      return { ok: false, helperUnavailable: true, error: error?.message || String(error) };
    } finally {
      state.ccSwitchSyncInFlight = false;
    }
  }

  function refreshLocalHelperStatsOnStart() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof window.fetch !== "function") return;
    void pollLocalHelperStats();
  }

  function startCcSwitchStartupSync() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || state.ccSwitchStartupSyncStarted || typeof window.fetch !== "function") return;
    state.ccSwitchStartupSyncStarted = true;
    window.setTimeout(() => {
      void syncCcSwitchUsageFromHelper().then((result) => {
        if (!result?.ok) return;
        const imported = toCount(result.imported);
        state.ccSwitchSyncStatus = imported ? `启动时已同步 ${fmtCount(imported)} 条 CC Switch 统计数据` : "启动时已检查 CC Switch 统计数据";
        scheduleRender();
      });
    }, 1500);
  }

  function installLocalCapture() {
    installLocalFetchCapture();
    installLocalXhrCapture();
    installLocalWebSocketCapture();
    installLocalMessageCapture();
  }

  function start() {
    if (state.started) return;
    state.started = true;
    loadLocalLedger();
    cleanupAutoZeroPriceModels();
    installLocalCapture();
    document.addEventListener("input", handleInput, true);
    document.addEventListener("keydown", rememberPendingInput, true);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("submit", rememberPendingInput, true);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    installOfficialModelObserver();
    installTaskRunningObserver();
    installProfileIdentityObserver();
    installHubVisibilityObserver();
    scheduleProfileIdentitySync(0);
    refreshLocalHelperStatsOnStart();
    startCcSwitchStartupSync();
    render();
  }

  function scheduleStart() {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    if (!window.__CODEX_LIVE_TOKEN_COST_TEST__) window.setTimeout(start, 1200);
  }

  function destroy() {
    state.started = false;
    if (state.renderTimer) window.clearTimeout(state.renderTimer);
    if (state.profileIdentitySyncTimer) window.clearTimeout(state.profileIdentitySyncTimer);
    if (state.profileUsageRefreshTimer) window.clearTimeout(state.profileUsageRefreshTimer);
    if (state.hubVisibilityTimer) window.clearTimeout(state.hubVisibilityTimer);
    state.officialModelObserver?.disconnect?.();
    state.officialModelRootObserver?.disconnect?.();
    state.taskRunningObserver?.disconnect?.();
    state.profileIdentityObserver?.disconnect?.();
    state.officialModelObserver = null;
    state.officialModelRootObserver = null;
    state.officialModelTrigger = null;
    state.taskRunningObserver = null;
    if (state.profileAvatarRenderUrl?.startsWith?.("blob:")) {
      try {
        URL.revokeObjectURL(state.profileAvatarRenderUrl);
      } catch {
        // Ignore object URL cleanup failures during script teardown.
      }
    }
    if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock === VERSION) {
      Array.prototype.filter = Array.prototype.__codexLiveTokenCostOriginalFilter;
    }
    if (Promise.prototype.then.__codexLiveTokenCostProfileUnlock === VERSION) {
      Promise.prototype.then = Promise.prototype.__codexLiveTokenCostOriginalThen;
    }
    if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) {
      RegExp.prototype.test = RegExp.prototype.__codexLiveTokenCostOriginalTest;
    }
    if (window.electronBridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION) {
      try {
        window.electronBridge.sendMessageFromView = window.electronBridge.__codexLiveTokenCostOriginalSendMessageFromView;
      } catch {
        // Read-only preload bridges cannot be restored by assignment.
      }
    }
    if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) {
      window.removeEventListener("codex-message-from-view", handleProfileFetchEvent, true);
      window.removeEventListener("message", handleProfileFetchResponseEvent, true);
      delete window.__codexLiveTokenCostProfileMessageIntercept;
    }
    state.profileRequestIds.clear();
    state.codexModulePromises.clear();
    if (window.__codexLiveTokenCostBridgeHook === VERSION) delete window.__codexLiveTokenCostBridgeHook;
    if (window.__codexLiveTokenCostProfileRequestPatch === VERSION) delete window.__codexLiveTokenCostProfileRequestPatch;
    if (window.__codexLiveTokenCostProfilePhotoPatch === VERSION) delete window.__codexLiveTokenCostProfilePhotoPatch;
    if (window.__codexLiveTokenCostProfileAuthPatch === VERSION) delete window.__codexLiveTokenCostProfileAuthPatch;
    if (window.fetch?.__codexLiveTokenCostWrapped === VERSION) window.fetch = window.fetch.__codexLiveTokenCostOriginal;
    if (window.WebSocket?.__codexLiveTokenCostWrapped === VERSION) window.WebSocket = window.WebSocket.__codexLiveTokenCostOriginal;
    const Xhr = window.XMLHttpRequest;
    if (Xhr?.prototype?.__codexLiveTokenCostWrapped === VERSION) {
      Xhr.prototype.open = Xhr.prototype.__codexLiveTokenCostOriginalOpen;
      Xhr.prototype.send = Xhr.prototype.__codexLiveTokenCostOriginalSend;
      delete Xhr.prototype.__codexLiveTokenCostWrapped;
    }
    document.removeEventListener("input", handleInput, true);
    document.removeEventListener("keydown", rememberPendingInput, true);
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("submit", rememberPendingInput, true);
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    for (const sessionKey of Array.from(state.localTurnTimers.keys())) clearLocalTurnTimer(sessionKey);
    clearLocalTurnTimer();
    stopCadencedShimmer();
    state.root?.remove();
    state.settingsButton?.remove?.();
    state.settingsOverlay?.remove?.();
    state.settingsOverlay = null;
    document.getElementById(STYLE_ID)?.remove();
    delete window.__codexLiveTokenCost;
    if (window.__codexLiveTokenCostVersion === VERSION) delete window.__codexLiveTokenCostVersion;
  }

  window.__codexLiveTokenCost = {
    version: VERSION,
    render,
    destroy,
    prices: visiblePrices,
    modelInfo: activeModelInfo,
    setModelPrice(model, price) {
      const name = String(model || "").trim();
      const normalized = normalizePrice(price);
      if (!name || !normalized) return false;
      const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
      overrides[name] = normalized;
      localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
      const hidden = hiddenPriceModels();
      hidden.delete(name);
      saveHiddenPriceModels(hidden);
      render();
      return true;
    },
    usage: localUsageExport,
    importLocalUsageTurns,
    syncCcSwitchUsageFromHelper,
    mergeHelperStats,
    debugSessionState,
  };

  if (window.__CODEX_LIVE_TOKEN_COST_TEST__) {
    window.__codexLiveTokenCostTest = {
      normalizeUsage,
      calcCost,
      costForModelUsage,
      addUsage,
      aggregateTurnUsage,
      usageHasCostData,
      costPricedLabel,
      shouldPersistUsagePayload,
      isComposerDraftPayload,
      shouldStartTurnFromRequestPayload,
      isTokenCountPayload,
      isTaskCompletePayload,
      collectUsages,
      hasAssistantResultOutputStarted,
      fmtCount,
      fmtMoney,
      fmtPercent,
      rollComparableValue,
      rollTrend,
      parseModelEffortText,
      officialModelInfoFromText,
      officialModelTriggerInfo,
      readOfficialModelTrigger,
      bindOfficialModelTrigger,
      extractModelInfo,
      extractFastMode,
      countsTowardFastModeUsage,
      collectProfileInvocations,
      localProfileActivityStats,
      observeModelInfo,
      mainEditable,
      isMainComposerSurfaceTarget,
      findComposerBox,
      isCodexPlusText,
      findCodexPlusMenu,
      ensureHeaderSettingsButton,
      readTokenUsage,
      liveSnapshot,
      locationSessionKey,
      activeSidebarThreadKey,
      extractSessionKeyFromUrl,
      extractSessionInfo,
      observeSessionInfo,
      currentSessionKey,
      startupBlankConversationSessionKey,
      rememberSidebarThreadClick,
      rememberNewConversationClick,
      migrateLegacyLocationSessionTurns,
      currentSessionTurns,
      localProfileThreadCount,
      localDailyUsage,
      todayUsage,
      todayCost,
      inspectLocalPayload,
      beginLocalTurn,
      beginLocalRequestTurn,
      finishLocalTurn,
      scheduleLocalTurnCompletionCheck,
      finishActiveTurnFromDomIfStopped,
      isCodexComposerCompleteDom,
      isCodexTaskRunningDom,
      rememberPendingInput,
      startTurnShimmer,
      stopTurnShimmer,
      rememberLocalUsage,
      persistLocalCurrentTurn,
      importLocalUsageTurns,
      syncCcSwitchUsageFromHelper,
      mergeHelperStats,
      normalizeHelperStatsPayload,
      saveProfilePrefsFromEditor,
      syncCcSwitchFromSettings,
      ccSwitchSettingsHtml,
      helperStatusText,
      hubVisible,
      saveHubVisible,
      syncHubVisibility,
      profileSettingsHtml,
      pricePopoverHtml,
      newPriceModelName,
      startNewPriceModel,
      restoreDefaultPrices,
      deletePriceForModel,
      visiblePrices,
      priceFor,
      priceModelKey,
      ensurePriceForModel,
      recentLedgerModel,
      cleanupAutoZeroPriceModels,
      localUsageExport,
      debugSessionState,
      activeModelInfo,
      spoofProfileAccountPayload,
      spoofProfileAuthContextValue,
      patchProfileReactAuthContext,
      profileUnlockedSettingsSections,
      profileUsernameAllowed,
      applyLocalProfilePatch,
      patchProfileRequestClient,
      patchProfilePhotoUploadClient,
      extractProfilePhotoDataUrl,
      applyLocalProfilePhotoUpload,
      localProfileResponse,
      isProfileFetchMessage,
      syncSidebarProfileIdentity,
      syncVisibleProfilePhotoIdentity,
      syncProfileIdentity,
    };
  }

  installOfficialProfileUnlock();

  scheduleStart();
})();
