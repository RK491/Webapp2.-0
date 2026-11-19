export interface TelegramWebAppUser {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface DetectedUserIdentity {
  playerId: string | null;
  displayName: string;
  handle: string;
  photoUrl: string;
  startParam: string;
  isTelegramDetected: boolean;
}

interface TelegramWindow {
  Telegram?: {
    WebApp?: {
      ready?: () => void;
      expand?: () => void;
      openTelegramLink?: (url: string) => void;
      onEvent?: (eventType: string, callback: () => void) => void;
      offEvent?: (eventType: string, callback: () => void) => void;
      platform?: string;
      initData?: string;
      initDataUnsafe?: {
        user?: TelegramWebAppUser;
        start_param?: string;
      };
      HapticFeedback?: {
        impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged?: () => void;
      };
    };
  };
}

export function normalizeStartParam(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
}

export type StartAppActionTab = 'friends' | 'tasks' | 'packs' | 'wallet' | 'farm';

export function parseStartAppAction(raw?: string | null): {
  actionTab: StartAppActionTab | null;
  referralCode: string | null;
} {
  const clean = normalizeStartParam(raw);
  if (!clean) {
    return { actionTab: null, referralCode: null };
  }
  const lower = clean.toLowerCase();
  if (lower === 'friends' || lower === 'invite') {
    return { actionTab: 'friends', referralCode: null };
  }
  if (lower === 'tasks' || lower === 'earn') {
    return { actionTab: 'tasks', referralCode: null };
  }
  if (lower === 'packs' || lower === 'shop' || lower === 'market') {
    return { actionTab: 'packs', referralCode: null };
  }
  if (lower === 'wallet' || lower === 'deposit' || lower === 'withdraw') {
    return { actionTab: 'wallet', referralCode: null };
  }
  if (lower === 'farm' || lower === 'home') {
    return { actionTab: 'farm', referralCode: null };
  }

  const stripped = clean.replace(/^(?:ref|r)_/i, '').trim();
  if (stripped.length >= 3 && /^[a-zA-Z0-9_-]{3,64}$/.test(stripped)) {
    return { actionTab: null, referralCode: stripped };
  }
  return { actionTab: null, referralCode: null };
}

export const DEFAULT_TELEGRAM_BOT_USERNAME = 'AlphaGramAiBot';
export const DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME = '';

const BOT_USERNAME_CACHE_KEY = 'chickenland_tg_bot_username_v1';
const APP_SHORT_NAME_CACHE_KEY = 'chickenland_tg_app_short_name_v2';

export interface TelegramBotConfig {
  botUsername: string;
  appShortName: string;
  source: 'url' | 'referrer' | 'server' | 'env' | 'cache' | 'default';
}

export function normalizeTelegramBotUsername(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  const tmeMatch = trimmed.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,64})/i);
  const candidate = (tmeMatch ? tmeMatch[1] : trimmed)
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim();

  if (!/^[a-zA-Z0-9_]{3,64}$/.test(candidate)) {
    return '';
  }
  return candidate;
}

export function normalizeTelegramMiniAppShortName(raw?: string | null): string {
  const trimmed = String(raw || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split(/[?#]/)[0]
    .trim();
  if (!trimmed) return '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

export function parseTelegramBotAndAppFromUrl(rawUrl?: string | null): {
  botUsername: string;
  appShortName: string;
} {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return { botUsername: '', appShortName: '' };

  const tmeMatch = trimmed.match(
    /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,64})(?:\/([a-zA-Z0-9_-]{1,64}))?/i,
  );
  if (tmeMatch) {
    return {
      botUsername: normalizeTelegramBotUsername(tmeMatch[1]),
      appShortName: normalizeTelegramMiniAppShortName(tmeMatch[2] || ''),
    };
  }

  const webTgHashMatch = trimmed.match(/web\.telegram\.org\/[^#]*#@([a-zA-Z0-9_]{3,64})/i);
  if (webTgHashMatch) {
    return {
      botUsername: normalizeTelegramBotUsername(webTgHashMatch[1]),
      appShortName: '',
    };
  }

  return { botUsername: '', appShortName: '' };
}

export function detectTelegramBotConfig(params?: {
  search?: string;
  hash?: string;
  referrer?: string;
  envBotUsername?: string;
  envAppShortName?: string;
  serverBotUsername?: string;
  serverAppShortName?: string;
  cachedBotUsername?: string;
  cachedAppShortName?: string;
}): TelegramBotConfig {
  const searchParams = new URLSearchParams(params?.search || '');
  const cleanHash = (params?.hash || '').startsWith('#')
    ? (params?.hash || '').slice(1)
    : (params?.hash || '');
  const hashParams = new URLSearchParams(cleanHash);

  const urlBot = normalizeTelegramBotUsername(
    searchParams.get('bot') ||
      searchParams.get('bot_username') ||
      searchParams.get('botUsername') ||
      searchParams.get('tg_bot') ||
      hashParams.get('bot') ||
      hashParams.get('bot_username') ||
      hashParams.get('botUsername'),
  );
  const urlApp = normalizeTelegramMiniAppShortName(
    searchParams.get('app') ||
      searchParams.get('app_name') ||
      searchParams.get('appName') ||
      searchParams.get('short_name') ||
      searchParams.get('miniapp') ||
      hashParams.get('app') ||
      hashParams.get('short_name'),
  );

  const refParsed = parseTelegramBotAndAppFromUrl(params?.referrer);
  const serverBot = normalizeTelegramBotUsername(params?.serverBotUsername);
  const serverApp = normalizeTelegramMiniAppShortName(params?.serverAppShortName);
  const envBot = normalizeTelegramBotUsername(params?.envBotUsername);
  const envApp = normalizeTelegramMiniAppShortName(params?.envAppShortName);
  const cachedBot = normalizeTelegramBotUsername(params?.cachedBotUsername);
  const cachedApp = normalizeTelegramMiniAppShortName(params?.cachedAppShortName);

  let botUsername = DEFAULT_TELEGRAM_BOT_USERNAME;
  let source: TelegramBotConfig['source'] = 'default';

  if (urlBot) {
    botUsername = urlBot;
    source = 'url';
  } else if (refParsed.botUsername) {
    botUsername = refParsed.botUsername;
    source = 'referrer';
  } else if (serverBot) {
    botUsername = serverBot;
    source = 'server';
  } else if (envBot) {
    botUsername = envBot;
    source = 'env';
  } else if (cachedBot) {
    botUsername = cachedBot;
    source = 'cache';
  }

  const appShortName =
    urlApp ||
    refParsed.appShortName ||
    (params?.serverAppShortName !== undefined
      ? serverApp
      : envApp || cachedApp || DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME);

  return {
    botUsername,
    appShortName,
    source,
  };
}

export function cacheDetectedTelegramBotConfig(
  botUsername?: string | null,
  appShortName?: string | null,
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const cleanBot = normalizeTelegramBotUsername(botUsername);
    if (cleanBot) {
      localStorage.setItem(BOT_USERNAME_CACHE_KEY, cleanBot);
    }
    const cleanApp = normalizeTelegramMiniAppShortName(appShortName);
    if (cleanApp) {
      localStorage.setItem(APP_SHORT_NAME_CACHE_KEY, cleanApp);
    }
  } catch {
    // Ignore storage errors
  }
}

export function detectBrowserTelegramBotConfig(overrides?: {
  serverBotUsername?: string;
  serverAppShortName?: string;
}): TelegramBotConfig {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  let cachedBotUsername = '';
  let cachedAppShortName = '';
  try {
    if (typeof localStorage !== 'undefined') {
      cachedBotUsername = localStorage.getItem(BOT_USERNAME_CACHE_KEY) || '';
      cachedAppShortName = localStorage.getItem(APP_SHORT_NAME_CACHE_KEY) || '';
    }
  } catch {
    // Ignore storage errors
  }

  const config = detectTelegramBotConfig({
    search: typeof window !== 'undefined' ? window.location.search : '',
    hash: typeof window !== 'undefined' ? window.location.hash : '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    envBotUsername: env?.VITE_TELEGRAM_BOT_USERNAME,
    envAppShortName: env?.VITE_TELEGRAM_MINIAPP_SHORT_NAME,
    serverBotUsername: overrides?.serverBotUsername,
    serverAppShortName: overrides?.serverAppShortName,
    cachedBotUsername,
    cachedAppShortName,
  });

  if (config.source !== 'default') {
    cacheDetectedTelegramBotConfig(config.botUsername, config.appShortName);
  }

  return config;
}

function parseInitDataUserParams(rawInitData: string): {
  user: TelegramWebAppUser | null;
  startParam: string;
} {
  try {
    const params = new URLSearchParams(rawInitData);
    const userJson = params.get('user');
    const startParam = normalizeStartParam(params.get('start_param') || '');
    if (userJson) {
      const parsed = JSON.parse(userJson) as TelegramWebAppUser;
      if (parsed && parsed.id !== undefined && parsed.id !== null) {
        return { user: parsed, startParam };
      }
    }
    return { user: null, startParam };
  } catch {
    return { user: null, startParam: '' };
  }
}

export function extractStartParamFromLocation(params?: {
  initDataUnsafeStartParam?: string;
  initData?: string;
  search?: string;
  hash?: string;
}): string {
  const direct = normalizeStartParam(params?.initDataUnsafeStartParam);
  if (direct) return direct;

  if (params?.initData) {
    const parsed = parseInitDataUserParams(params.initData);
    if (parsed.startParam) return parsed.startParam;
  }

  if (params?.search) {
    const query = new URLSearchParams(params.search);
    const fromSearch = normalizeStartParam(
      query.get('tgWebAppStartParam') ||
        query.get('startapp') ||
        query.get('start_param') ||
        query.get('start') ||
        query.get('ref'),
    );
    if (fromSearch) return fromSearch;
  }

  if (params?.hash) {
    const cleanHash = params.hash.startsWith('#') ? params.hash.slice(1) : params.hash;
    const hashParams = new URLSearchParams(cleanHash);
    const rawTgWebAppData = hashParams.get('tgWebAppData') || '';
    if (rawTgWebAppData) {
      const parsed = parseInitDataUserParams(rawTgWebAppData);
      if (parsed.startParam) return parsed.startParam;
    }
    const fromHash = normalizeStartParam(
      hashParams.get('tgWebAppStartParam') ||
        hashParams.get('startapp') ||
        hashParams.get('start_param') ||
        hashParams.get('start') ||
        hashParams.get('ref'),
    );
    if (fromHash) return fromHash;
  }

  return '';
}

export function getBrowserStartParam(): string {
  if (typeof window === 'undefined') return '';
  const win = window as unknown as TelegramWindow;
  const webApp = win.Telegram?.WebApp;
  return extractStartParamFromLocation({
    initDataUnsafeStartParam: webApp?.initDataUnsafe?.start_param,
    initData: getTelegramInitData(),
    search: window.location.search,
    hash: window.location.hash,
  });
}

export function hasTelegramRuntimeContext(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as TelegramWindow & {
    TelegramWebviewProxy?: unknown;
    Telegram?: TelegramWindow['Telegram'] & { WebView?: unknown };
  };
  const webApp = win.Telegram?.WebApp;
  const platform = String(webApp?.platform || '').trim().toLowerCase();
  const search = window.location.search || '';
  const hash = window.location.hash || '';

  return Boolean(
    (webApp?.initData && webApp.initData.trim()) ||
      webApp?.initDataUnsafe?.user?.id ||
      (platform && platform !== 'unknown') ||
      win.TelegramWebviewProxy ||
      (win.Telegram?.WebView && hash.includes('tgWebApp')) ||
      hash.includes('tgWebAppData=') ||
      hash.includes('tgWebAppStartParam=') ||
      search.includes('tgWebAppData=') ||
      search.includes('tgWebAppStartParam=') ||
      search.includes('tg_id='),
  );
}

export function ensureTelegramWebAppReady(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as TelegramWindow;
  const webApp = win.Telegram?.WebApp;
  if (webApp) {
    try {
      webApp.ready?.();
      webApp.expand?.();
    } catch {
      // Ignore outside Telegram
    }
  }
  return hasTelegramRuntimeContext();
}

export function resolveTelegramUserIdentity(params: {
  tgUser?: TelegramWebAppUser | null;
  initData?: string;
  startParam?: string;
  search?: string;
  hash?: string;
}): DetectedUserIdentity {
  let user = params.tgUser ?? null;
  let derivedStartParam = normalizeStartParam(params.startParam);

  if (params.initData) {
    const parsed = parseInitDataUserParams(params.initData);
    if (!user && parsed.user) user = parsed.user;
    if (!derivedStartParam && parsed.startParam) derivedStartParam = parsed.startParam;
  }

  if (params.hash) {
    const cleanHash = params.hash.startsWith('#') ? params.hash.slice(1) : params.hash;
    const hashParams = new URLSearchParams(cleanHash);
    const rawTgWebAppData = hashParams.get('tgWebAppData') || '';
    if (rawTgWebAppData) {
      const parsed = parseInitDataUserParams(rawTgWebAppData);
      if (!user && parsed.user) user = parsed.user;
      if (!derivedStartParam && parsed.startParam) derivedStartParam = parsed.startParam;
    }
    if (!derivedStartParam) {
      derivedStartParam = normalizeStartParam(
        hashParams.get('tgWebAppStartParam') ||
          hashParams.get('startapp') ||
          hashParams.get('start_param') ||
          hashParams.get('start') ||
          hashParams.get('ref'),
      );
    }
  }

  if (params.search) {
    const query = new URLSearchParams(params.search);
    if (!derivedStartParam) {
      derivedStartParam = normalizeStartParam(
        query.get('tgWebAppStartParam') ||
          query.get('startapp') ||
          query.get('start_param') ||
          query.get('start') ||
          query.get('ref'),
      );
    }
  }

  if (user && user.id !== undefined && user.id !== null) {
    const rawId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const fullName = [user.first_name, user.last_name]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(' ')
      .trim();
    const displayName = (fullName || user.username || `Farmer ${rawId.slice(-4)}`).slice(0, 60);
    const cleanUser = user.username ? user.username.replace(/^@/, '') : '';
    const handle = (cleanUser ? `@${cleanUser}` : `@tg_${rawId}`).slice(0, 40);
    const photoUrl = (user.photo_url || '').trim().slice(0, 512);

    return {
      playerId: rawId ? `tg_${rawId}` : null,
      displayName,
      handle,
      photoUrl,
      startParam: derivedStartParam,
      isTelegramDetected: true,
    };
  }

  // Optional URL query parameter auto-detection (for Telegram WebApp redirects or testing)
  if (params.search) {
    const query = new URLSearchParams(params.search);
    const qId =
      (query.get('tg_id') || query.get('tgId') || query.get('admin_id') || '')
        .replace(/[^a-zA-Z0-9_-]/g, '');
    const qName = query.get('tg_name')?.trim() || '';
    const qUser = query.get('tg_username')?.trim().replace(/^@/, '') || '';
    const qPhoto = query.get('tg_photo')?.trim() || '';

    if (qId || qName || qUser || qPhoto) {
      const displayName = (qName || qUser || `Farmer ${qId.slice(-4) || 'TG'}`).slice(0, 60);
      const handle = (qUser ? `@${qUser}` : qId ? `@tg_${qId}` : '@farmer').slice(0, 40);
      return {
        playerId: qId ? `tg_${qId}` : null,
        displayName,
        handle,
        photoUrl: qPhoto.slice(0, 512),
        startParam: derivedStartParam,
        isTelegramDetected: true,
      };
    }

    return {
      playerId: null,
      displayName: '',
      handle: '',
      photoUrl: '',
      startParam: derivedStartParam,
      isTelegramDetected: false,
    };
  }

  return {
    playerId: null,
    displayName: '',
    handle: '',
    photoUrl: '',
    startParam: derivedStartParam,
    isTelegramDetected: false,
  };
}

export function detectBrowserTelegramIdentity(): DetectedUserIdentity {
  if (typeof window === 'undefined') {
    return resolveTelegramUserIdentity({});
  }
  const win = window as unknown as TelegramWindow;
  const webApp = win.Telegram?.WebApp;
  ensureTelegramWebAppReady();

  return resolveTelegramUserIdentity({
    tgUser: webApp?.initDataUnsafe?.user ?? null,
    initData: getTelegramInitData(),
    startParam: webApp?.initDataUnsafe?.start_param ?? '',
    search: window.location.search,
    hash: window.location.hash,
  });
}

export function getTelegramInitData(): string {
  if (typeof window === 'undefined') return '';
  const win = window as unknown as TelegramWindow;
  const direct = (win.Telegram?.WebApp?.initData || '').trim();
  if (direct) return direct;
  try {
    const cleanHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashData = new URLSearchParams(cleanHash).get('tgWebAppData') || '';
    return hashData.trim();
  } catch {
    return '';
  }
}

const API_BASE_URL_STORAGE_KEY = 'chickenland_api_base_url_v1';

export function normalizeApiBaseUrl(raw?: string | null): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function getConfiguredApiBaseUrl(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = normalizeApiBaseUrl(localStorage.getItem(API_BASE_URL_STORAGE_KEY));
      if (stored) return stored;
    }
  } catch {
    // Ignore storage access errors
  }
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const envUrl = normalizeApiBaseUrl(env?.VITE_API_BASE_URL);
    if (envUrl) return envUrl;
  } catch {
    // Ignore non-Vite Node environments
  }
  return '';
}

export function setConfiguredApiBaseUrl(rawUrl: string): string {
  const clean = normalizeApiBaseUrl(rawUrl);
  try {
    if (typeof localStorage !== 'undefined') {
      if (clean) {
        localStorage.setItem(API_BASE_URL_STORAGE_KEY, clean);
      } else {
        localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return clean;
}

export function resolveApiUrl(endpointPath: string): string {
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const configuredBase = getConfiguredApiBaseUrl();
  if (configuredBase) {
    return `${configuredBase}${cleanPath}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(cleanPath, window.location.origin).toString();
  }
  return cleanPath;
}

export async function safeFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const targetUrl = url.startsWith('http://') || url.startsWith('https://') ? url : resolveApiUrl(url);
    const res = await fetch(targetUrl, init);
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export function triggerHapticFeedback(kind: HapticKind): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as TelegramWindow;
  const hf = win.Telegram?.WebApp?.HapticFeedback;
  if (!hf) return;

  try {
    if (kind === 'selection') {
      hf.selectionChanged?.();
    } else if (kind === 'success' || kind === 'warning' || kind === 'error') {
      hf.notificationOccurred?.(kind);
    } else {
      hf.impactOccurred?.(kind);
    }
  } catch {
    // Ignore unsupported Telegram client versions
  }
}

export function getTelegramChannelUrl(channelHandle: string): string {
  const clean = channelHandle.trim().replace(/^@/, '');
  return `https://t.me/${clean}`;
}

export function notifyTelegramOpenLink(channelUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as TelegramWindow;
  const openTg = win.Telegram?.WebApp?.openTelegramLink;
  if (typeof openTg === 'function') {
    try {
      openTg(channelUrl);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function subscribeTelegramAppActivated(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onFocusOrVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    callback();
  };

  window.addEventListener('focus', onFocusOrVisible);
  window.addEventListener('pageshow', onFocusOrVisible);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onFocusOrVisible);
  }

  const tgWebApp = (window as unknown as TelegramWindow).Telegram?.WebApp;
  const onTgActivated = () => callback();
  if (tgWebApp && typeof tgWebApp.onEvent === 'function') {
    try {
      tgWebApp.onEvent('activated', onTgActivated);
    } catch {
      // Ignore unsupported Telegram client event bindings
    }
  }

  return () => {
    window.removeEventListener('focus', onFocusOrVisible);
    window.removeEventListener('pageshow', onFocusOrVisible);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    }
    if (tgWebApp && typeof tgWebApp.offEvent === 'function') {
      try {
        tgWebApp.offEvent('activated', onTgActivated);
      } catch {
        // Ignore cleanup errors
      }
    }
  };
}


const LOCAL_ADMIN_BOT_STORAGE_KEY = 'chickenland_admin_local_bot_v1';
const LOCAL_CHANNEL_LOGS_STORAGE_KEY = 'chickenland_local_channel_logs_v1';

export interface LocalAdminBotConfig {
  token: string;
  maskedToken: string;
  botUsername: string;
  botId: number | null;
  updatedAtMs: number;
}

export function sanitizeTelegramBotTokenInput(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^bot(?=\d+:)/i, '');
}

export function maskTelegramBotToken(token: string): string {
  const clean = sanitizeTelegramBotTokenInput(token);
  if (!clean) return '';
  if (clean.length <= 12) return `${clean.slice(0, 4)}***`;
  return `${clean.slice(0, 8)}...${clean.slice(-6)}`;
}

export function getLocalAdminBotConfig(): LocalAdminBotConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOCAL_ADMIN_BOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAdminBotConfig> | null;
    const cleanToken = sanitizeTelegramBotTokenInput(parsed?.token);
    if (!cleanToken) return null;
    return {
      token: cleanToken,
      maskedToken: parsed?.maskedToken || maskTelegramBotToken(cleanToken),
      botUsername: normalizeTelegramBotUsername(parsed?.botUsername) || DEFAULT_TELEGRAM_BOT_USERNAME,
      botId: typeof parsed?.botId === 'number' ? parsed.botId : null,
      updatedAtMs: Number(parsed?.updatedAtMs || Date.now()),
    };
  } catch {
    return null;
  }
}

export function setLocalAdminBotConfig(cfg: LocalAdminBotConfig): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LOCAL_ADMIN_BOT_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearLocalAdminBotConfig(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LOCAL_ADMIN_BOT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export async function verifyTelegramBotTokenDirect(rawToken: string): Promise<{
  ok: boolean;
  token?: string;
  maskedToken?: string;
  botUsername?: string;
  botId?: number | null;
  latencyMs?: number;
  error?: string;
}> {
  const cleanToken = sanitizeTelegramBotTokenInput(rawToken);
  if (!cleanToken) {
    return { ok: false, error: 'Enter a Telegram Bot Token.' };
  }
  if (!/^\d{6,15}:[A-Za-z0-9_-]{20,80}$/.test(cleanToken)) {
    return {
      ok: false,
      error: 'Invalid bot token format. Expected format like 123456789:ABCdef... from @BotFather.',
    };
  }
  const startedAt = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
      cache: 'no-store',
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: { id?: number; username?: string };
    };
    if (!res.ok || !data.ok || !data.result?.id) {
      return {
        ok: false,
        latencyMs,
        error: (data.description || 'Telegram rejected this Bot Token.').replaceAll(cleanToken, '[redacted]'),
      };
    }
    const botUsername =
      normalizeTelegramBotUsername(data.result.username) || DEFAULT_TELEGRAM_BOT_USERNAME;
    return {
      ok: true,
      token: cleanToken,
      maskedToken: maskTelegramBotToken(cleanToken),
      botUsername,
      botId: typeof data.result.id === 'number' ? data.result.id : null,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      error: (err instanceof Error ? err.message : 'Unable to reach Telegram API.').replaceAll(
        cleanToken,
        '[redacted]',
      ),
    };
  }
}

export function loadLocalChannelLogs(): Array<Record<string, unknown>> {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_CHANNEL_LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function appendLocalChannelLog(entry: Record<string, unknown>): Array<Record<string, unknown>> {
  const next = [entry, ...loadLocalChannelLogs()].slice(0, 20);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_CHANNEL_LOGS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage errors
  }
  return next;
}

