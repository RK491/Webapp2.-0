import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { isIP } from 'node:net';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import {
  ADMIN_PASSCODE_VAULT_UID,
  buildReferralBotNotificationMessage,
  calculateBuyerPoints,
  calculateTotalChickens,
  coinsToUsd,
  createDefaultProfile,
  DEFAULT_CHANNELS_CONFIG,
  DEFAULT_GRAM_DEPOSIT_ADDRESS,
  DEFAULT_GRAM_JETTON_MASTER,
  DEFAULT_MAINTENANCE_CONFIG,
  DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
  encodeAchievementsWithAds,
  extractTelegramNumericUserId,
  formatReferralHandle,
  formatShortTonWallet,
  getActiveRequiredChannels,
  isAdminPlayerId,
  isTelegramMemberStatusJoined,
  MAX_DEPOSIT_COINS,
  MIN_DEPOSIT_COINS,
  normalizeTelegramChannelEntry,
  normalizeTelegramChannelHandle,
  PRIMARY_ADMIN_TELEGRAM_ID,
  PROMO_CODES,
  REFERRED_WELCOME_BONUS_COINS,
  REFERRER_SIGNUP_BONUS_COINS,
  renderPayoutChannelApproveMessage,
  renderWithdrawApproveMessage,
  resolveMaintenanceConfig,
  SIGNUP_BONUS_COINS,
} from './src/game/economy.ts';
import type {
  ChannelCheckDiagnosticLog,
  ChannelsConfig,
  MaintenanceConfig,
  RequiredTelegramChannel,
  SystemDiagnosticsSnapshot,
  SystemServerLogEntry,
  WithdrawApproveMessageTemplate,
} from './src/types/farm.ts';
import {
  buildAcceptedDepositMemos,
  friendlyTonAddressToRaw,
  getPrimaryDepositMemo,
  matchGramTransfersFromTonApiEvents,
  matchGramTransfersFromTonCenter,
  normalizeTxHash,
  OFFICIAL_GRAM_RAW_MASTER,
  type RejectedGramTransfer,
  type TonApiEvent,
  type TonCenterJettonTransfer,
} from './src/game/tonGram.ts';
import {
  DEFAULT_TELEGRAM_BOT_USERNAME,
  DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME,
  normalizeTelegramBotUsername,
  normalizeTelegramMiniAppShortName,
} from './src/utils/telegram.ts';
import {
  getMergedReferralsForUser,
  resetReferralStorage,
  saveReferral,
} from './src/server/referralStorage.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function initServerFirestore(): Firestore | null {
  try {
    const candidates = [
      path.resolve(__dirname, 'firebase-applet-config.json'),
      path.resolve(__dirname, '..', 'firebase-applet-config.json'),
      path.resolve(process.cwd(), 'firebase-applet-config.json'),
    ];
    const configPath = candidates.find((p) => fs.existsSync(p));
    if (!configPath) return null;
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw) as Record<string, string>;
    const app = initializeApp(cfg, 'chickenland-server');
    return getFirestore(app, cfg.firestoreDatabaseId);
  } catch {
    return null;
  }
}

const serverDb = initServerFirestore();

function normalizeTelegramChannel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '@AG_PAYOUTS';
  const match = trimmed.match(/^https?:\/\/t\.me\/([a-zA-Z0-9_]+)/i);
  if (match) return `@${match[1]}`;
  return trimmed.startsWith('@') || /^-?\d+$/.test(trimmed) ? trimmed : `@${trimmed}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function redactBotToken(message: string): string {
  const activeToken = getTelegramBotToken();
  let out = String(message || '');
  if (TELEGRAM_BOT_TOKEN_ENV) {
    out = out.replaceAll(TELEGRAM_BOT_TOKEN_ENV, '[redacted]');
  }
  if (activeToken) {
    out = out.replaceAll(activeToken, '[redacted]');
  }
  return out;
}

function isValidSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(id.trim());
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // Link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (isIP(v4) === 4) return isPrivateOrReservedIpv4(v4);
    return true;
  }
  if (/^(fc|fd|fe8|fe9|fea|feb|ff)/i.test(lower)) return true;
  return false;
}

function isSafePublicHttpsUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 512) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const rawHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!rawHost) return false;
    // Block decimal / hex / octal shorthand IP literals
    if (/^\d+$/.test(rawHost) || /^0x[0-9a-f.]+$/i.test(rawHost)) return false;
    const ipType = isIP(rawHost);
    if (ipType === 4) return !isPrivateOrReservedIpv4(rawHost);
    if (ipType === 6) return !isPrivateOrReservedIpv6(rawHost);
    if (!rawHost.includes('.')) return false;
    if (
      rawHost === 'localhost' ||
      rawHost.endsWith('.local') ||
      rawHost.endsWith('.internal') ||
      rawHost.endsWith('.localhost')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function getClientIp(req: express.Request): string {
  const sockIp = String(req.socket?.remoteAddress || 'unknown').trim().slice(0, 64);
  const rawFwd = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  if (rawFwd && isIP(rawFwd)) {
    return `${rawFwd.slice(0, 48)}`;
  }
  return sockIp;
}

const rateLimitBuckets = new Map<string, number[]>();

function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (rateLimitBuckets.get(key) || []).filter((ts) => ts > cutoff);
  if (recent.length >= maxRequests) {
    const oldest = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    rateLimitBuckets.set(key, recent);
    return { allowed: false, retryAfterSec };
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);
  if (rateLimitBuckets.size > 5000) {
    for (const [k, list] of rateLimitBuckets.entries()) {
      if (list.every((ts) => ts <= cutoff)) {
        rateLimitBuckets.delete(k);
      }
    }
  }
  return { allowed: true, retryAfterSec: 0 };
}

const PORT = Number(process.env.PORT || 3000);
const GRAM_DEPOSIT_ADDRESS =
  process.env.GRAM_DEPOSIT_ADDRESS || DEFAULT_GRAM_DEPOSIT_ADDRESS;
const GRAM_JETTON_MASTER =
  process.env.GRAM_JETTON_MASTER || DEFAULT_GRAM_JETTON_MASTER;
const TELEGRAM_PAYOUT_CHANNEL = normalizeTelegramChannel(
  process.env.TELEGRAM_PAYOUT_CHANNEL || '@AG_PAYOUTS',
);
function sanitizeBotTokenInput(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^bot(?=\d+:)/i, '');
}

const DEFAULT_BACKEND_TELEGRAM_BOT_TOKEN = sanitizeBotTokenInput(
  '9048180333:AAHXOeaRz85sPRT57pyhNteKBZJ0j4gGREE',
);

const TELEGRAM_BOT_TOKEN_ENV = sanitizeBotTokenInput(
  process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TG_BOT_TOKEN ||
    DEFAULT_BACKEND_TELEGRAM_BOT_TOKEN,
);
const BONUS_PER_REFERRAL = Math.max(
  1,
  Math.round(
    Number(process.env.BONUS_PER_REFERRAL || REFERRER_SIGNUP_BONUS_COINS) ||
      REFERRER_SIGNUP_BONUS_COINS,
  ),
);
const TELEGRAM_BOT_USERNAME_ENV = normalizeTelegramBotUsername(
  process.env.TELEGRAM_BOT_USERNAME || process.env.VITE_TELEGRAM_BOT_USERNAME || '',
);
const TELEGRAM_MINIAPP_SHORT_NAME =
  normalizeTelegramMiniAppShortName(
    process.env.TELEGRAM_MINIAPP_SHORT_NAME ||
      process.env.VITE_TELEGRAM_MINIAPP_SHORT_NAME ||
      '',
  ) || DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME;

let cachedBotMenuWebAppUrl = (() => {
  const raw = (process.env.WEBAPP_URL || process.env.VITE_WEBAPP_URL || '').trim();
  return /^https:\/\/[^\s]+$/i.test(raw) ? raw : '';
})();

function buildTelegramMiniAppLink(botUsername: string, startParam?: string): string {
  const cleanBot = normalizeTelegramBotUsername(botUsername) || DEFAULT_TELEGRAM_BOT_USERNAME;
  const base = TELEGRAM_MINIAPP_SHORT_NAME
    ? `https://t.me/${cleanBot}/${TELEGRAM_MINIAPP_SHORT_NAME}`
    : `https://t.me/${cleanBot}`;
  const cleanParam = String(startParam || '').trim();
  return cleanParam ? `${base}?startapp=${encodeURIComponent(cleanParam)}` : base;
}

function buildDirectPrivateMiniAppButton(
  text: string,
  botUsername: string,
  startParam?: string,
): { text: string; web_app?: { url: string }; url?: string } {
  const cleanParam = String(startParam || '').trim();
  if (cachedBotMenuWebAppUrl) {
    try {
      const target = new URL(cachedBotMenuWebAppUrl);
      if (cleanParam) {
        target.searchParams.set('startapp', cleanParam);
      } else {
        target.searchParams.delete('startapp');
      }
      return { text, web_app: { url: target.toString() } };
    } catch {
      // Fallback to t.me link
    }
  }
  return { text, url: buildTelegramMiniAppLink(botUsername, cleanParam || undefined) };
}
const TONCENTER_API_KEY = (process.env.TONCENTER_API_KEY || '').trim();
const ADMIN_TELEGRAM_IDS = (process.env.ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const BOT_CONFIG_FILE = path.resolve(__dirname, '.data', 'bot_config.json');

interface RuntimeBotConfig {
  token: string;
  botUsername: string;
  botId: number | null;
  updatedAtMs: number;
}

function loadRuntimeBotConfigFromDisk(): RuntimeBotConfig | null {
  try {
    if (!fs.existsSync(BOT_CONFIG_FILE)) return null;
    const raw = fs.readFileSync(BOT_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RuntimeBotConfig>;
    const cleanToken = sanitizeBotTokenInput(parsed.token);
    if (cleanToken) {
      return {
        token: cleanToken,
        botUsername: normalizeTelegramBotUsername(parsed.botUsername) || '',
        botId: typeof parsed.botId === 'number' ? parsed.botId : null,
        updatedAtMs: Number(parsed.updatedAtMs ?? 0) || Date.now(),
      };
    }
  } catch {
    // Ignore read errors on startup
  }
  return null;
}

let runtimeBotConfig: RuntimeBotConfig | null = loadRuntimeBotConfigFromDisk();

function saveRuntimeBotConfigToDisk(cfg: RuntimeBotConfig): void {
  runtimeBotConfig = cfg;
  const dir = path.dirname(BOT_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(cfg), { encoding: 'utf8', mode: 0o600 });
}

function clearRuntimeBotConfigOnDisk(): void {
  runtimeBotConfig = null;
  try {
    if (fs.existsSync(BOT_CONFIG_FILE)) {
      fs.unlinkSync(BOT_CONFIG_FILE);
    }
  } catch {
    // Ignore unlink errors
  }
}

function getTelegramBotToken(): string {
  return runtimeBotConfig?.token || TELEGRAM_BOT_TOKEN_ENV || '';
}

function getBotTokenSource(): 'runtime' | 'env' | 'none' {
  if (runtimeBotConfig?.token) return 'runtime';
  if (TELEGRAM_BOT_TOKEN_ENV) return 'env';
  return 'none';
}

function maskBotToken(token: string): string {
  const clean = token.trim();
  if (!clean) return '';
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 0 && clean.length > colonIdx + 8) {
    return `${clean.slice(0, colonIdx + 4)}...${clean.slice(-4)}`;
  }
  if (clean.length <= 10) return '••••';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

// ============================================================================
// ADMIN PASSCODE CONFIGURATION (LOCKED IN CODE)
// Passcode is strictly locked in `/server.ts` -> `DEFAULT_ADMIN_PASSCODE` ('924429').
// Admin Panel passcode modifications are disabled.
// ============================================================================
export const DEFAULT_ADMIN_PASSCODE = '924429';

async function getFreshDoc(ref: DocumentReference<DocumentData>): Promise<DocumentSnapshot<DocumentData>> {
  try {
    return await getDocFromServer(ref);
  } catch {
    return getDoc(ref);
  }
}

async function loadActiveAdminSecurity(): Promise<{
  custom: null;
  source: 'default';
  updatedAtMs: number;
}> {
  return {
    custom: null,
    source: 'default',
    updatedAtMs: 0,
  };
}

function normalizePasscodeInput(raw: string): string {
  const withoutSpaces = String(raw || '').replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  let out = '';
  for (const ch of withoutSpaces) {
    const code = ch.charCodeAt(0);
    // Full-width digits ０-９
    if (code >= 0xff10 && code <= 0xff19) {
      out += String(code - 0xff10);
    // Arabic-Indic digits ٠-٩
    } else if (code >= 0x0660 && code <= 0x0669) {
      out += String(code - 0x0660);
    // Extended Arabic-Indic digits ۰-۹
    } else if (code >= 0x06f0 && code <= 0x06f9) {
      out += String(code - 0x06f0);
    // Devanagari digits ०-९
    } else if (code >= 0x0966 && code <= 0x096f) {
      out += String(code - 0x0966);
    } else {
      out += ch;
    }
  }
  return out;
}

async function verifyAdminPasscodeAsync(provided: string): Promise<{
  ok: boolean;
  source: 'default';
  updatedAtMs: number;
}> {
  const cleanProvided = normalizePasscodeInput(provided);
  if (!cleanProvided) {
    return { ok: false, source: 'default', updatedAtMs: 0 };
  }
  const a = Buffer.from(cleanProvided, 'utf8');
  const b = Buffer.from(DEFAULT_ADMIN_PASSCODE, 'utf8');
  return {
    ok: a.length === b.length && crypto.timingSafeEqual(a, b),
    source: 'default',
    updatedAtMs: 0,
  };
}

const SESSION_SECRET_FILE = path.resolve(__dirname, '.data', 'session_secret.key');

function resolveSessionSigningSecret(): string {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 32) {
    return envSecret;
  }
  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
      if (existing.length >= 32) {
        return existing;
      }
    }
    const fresh = crypto.randomBytes(32).toString('hex');
    const dir = path.dirname(SESSION_SECRET_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SESSION_SECRET_FILE, fresh, { encoding: 'utf8', mode: 0o600 });
    return fresh;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SIGNING_SECRET = resolveSessionSigningSecret();

let cachedBotUsername = runtimeBotConfig?.botUsername || TELEGRAM_BOT_USERNAME_ENV || '';
let lastBotLookupAttemptMs = 0;

async function refreshBotMenuWebAppUrl(botToken: string): Promise<void> {
  if (!botToken) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getChatMenuButton`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { type?: string; web_app?: { url?: string } };
    } | null;
    const rawUrl = String(data?.result?.web_app?.url || '').trim();
    if (data?.ok && /^https:\/\/[^\s]+$/i.test(rawUrl)) {
      cachedBotMenuWebAppUrl = rawUrl;
    }
  } catch {
    // Non-fatal
  }
}

async function resolveTelegramBotUsername(): Promise<string> {
  if (runtimeBotConfig?.botUsername) return runtimeBotConfig.botUsername;
  if (TELEGRAM_BOT_USERNAME_ENV) return TELEGRAM_BOT_USERNAME_ENV;
  if (cachedBotUsername) return cachedBotUsername;

  const botToken = getTelegramBotToken();
  const now = Date.now();
  if (!botToken || now - lastBotLookupAttemptMs < 10 * 60 * 1000) {
    return DEFAULT_TELEGRAM_BOT_USERNAME;
  }

  lastBotLookupAttemptMs = now;
  try {
    const [res] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(5000),
      }),
      !cachedBotMenuWebAppUrl ? refreshBotMenuWebAppUrl(botToken) : Promise.resolve(),
    ]);
    if (res.ok) {
      const data = (await res.json()) as {
        ok?: boolean;
        result?: { username?: string };
      };
      const detected = normalizeTelegramBotUsername(data?.result?.username);
      if (data?.ok && detected) {
        cachedBotUsername = detected;
        return detected;
      }
    }
  } catch {
    // Fallback to default bot username
  }

  return DEFAULT_TELEGRAM_BOT_USERNAME;
}

function signSessionToken(payload: Record<string, unknown>, ttlMs = 12 * 3_600_000): string {
  const body = {
    ...payload,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): Record<string, unknown> | null {
  try {
    const [encoded, sig] = token.trim().split('.');
    if (!encoded || !sig) return null;
    const expected = crypto
      .createHmac('sha256', SESSION_SIGNING_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function verifyTelegramInitData(
  rawInitData: string,
  botToken: string,
  options?: { allowClockSkew?: boolean },
): { valid: boolean; playerId?: string; user?: Record<string, unknown>; reason?: string } {
  const trimmed = rawInitData.trim();
  if (!trimmed || !botToken) {
    return { valid: false, reason: 'missing_init_data_or_token' };
  }
  const params = new URLSearchParams(trimmed);
  const hash = params.get('hash') || '';
  if (!hash) {
    return { valid: false, reason: 'missing_hash' };
  }

  const entries: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      entries.push(`${key}=${value}`);
    }
  });
  entries.sort();
  const dataCheckString = entries.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const a = Buffer.from(computedHash.toLowerCase(), 'utf8');
  const b = Buffer.from(hash.toLowerCase(), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'hash_mismatch' };
  }

  const authDateSec = Number(params.get('auth_date') || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!options?.allowClockSkew) {
    if (
      !Number.isFinite(authDateSec) ||
      authDateSec <= 0 ||
      nowSec - authDateSec > 86_400 ||
      authDateSec > nowSec + 300
    ) {
      return { valid: false, reason: 'expired_or_invalid_auth_date' };
    }
  } else if (!Number.isFinite(authDateSec) || authDateSec <= 0) {
    return { valid: false, reason: 'expired_or_invalid_auth_date' };
  }

  let parsedUser: Record<string, unknown> | undefined;
  const userJson = params.get('user');
  if (userJson) {
    try {
      parsedUser = JSON.parse(userJson) as Record<string, unknown>;
    } catch {
      parsedUser = undefined;
    }
  }
  const rawId = parsedUser?.id ? String(parsedUser.id).replace(/[^a-zA-Z0-9_-]/g, '') : '';
  return {
    valid: true,
    playerId: rawId ? `tg_${rawId}` : undefined,
    user: parsedUser,
  };
}

function resolveVerifiedAdminActor(params: {
  req: express.Request;
  token?: string;
  initData?: string;
  extraAdminIds: readonly string[];
}): string | null {
  const authHeader = String(params.req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const candidateToken = String(params.token || authHeader || '').trim();
  if (candidateToken) {
    const verified = verifySessionToken(candidateToken);
    if (
      verified?.role === 'admin' &&
      typeof verified.playerId === 'string' &&
      isAdminPlayerId(verified.playerId, params.extraAdminIds)
    ) {
      return verified.playerId;
    }
  }

  const headerInitData = String(params.req.headers['x-telegram-init-data'] || '').trim();
  const rawInitData = String(params.initData || headerInitData || '').trim();
  const botToken = getTelegramBotToken();
  if (rawInitData && botToken) {
    const verifiedInit = verifyTelegramInitData(rawInitData, botToken, {
      allowClockSkew: true,
    });
    if (
      verifiedInit.valid &&
      verifiedInit.playerId &&
      isAdminPlayerId(verifiedInit.playerId, params.extraAdminIds)
    ) {
      return verifiedInit.playerId;
    }
  }

  return null;
}

function resolveVerifiedPlayerActor(params: {
  req: express.Request;
  token?: string;
  initData?: string;
}): string | null {
  const authHeader = String(params.req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const candidateToken = String(params.token || authHeader || '').trim();
  if (candidateToken) {
    const verified = verifySessionToken(candidateToken);
    if (
      verified &&
      (verified.role === 'player' || verified.role === 'admin') &&
      typeof verified.playerId === 'string' &&
      isValidSafeId(verified.playerId)
    ) {
      return verified.playerId;
    }
  }

  const rawInitData = String(params.initData || '').trim();
  const botToken = getTelegramBotToken();
  if (rawInitData && botToken) {
    const verifiedInit = verifyTelegramInitData(rawInitData, botToken, {
      allowClockSkew: true,
    });
    if (verifiedInit.valid && verifiedInit.playerId && isValidSafeId(verifiedInit.playerId)) {
      return verifiedInit.playerId;
    }
  }

  return null;
}

const REMINDERS_FILE = path.resolve(__dirname, '.data', 'reminders.json');

interface PlayerReminderRecord {
  playerId: string;
  telegramChatId: string;
  enabled: boolean;
  basketFullAtMs: number;
  feedBoostUntilMs: number;
  coopFeverUntilMs: number;
  autoHarvestUntilMs: number;
  lastBasketSentForAt: number;
  lastFeedSentForAt: number;
  lastFeverSentForAt: number;
  lastDroneSentForAt: number;
  updatedAtMs: number;
}

const reminderStore = new Map<string, PlayerReminderRecord>();

function loadRemindersFromDisk(): void {
  try {
    if (!fs.existsSync(REMINDERS_FILE)) return;
    const raw = fs.readFileSync(REMINDERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object' && isValidSafeId(item.playerId)) {
          const rec = item as PlayerReminderRecord;
          if (rec.telegramChatId) {
            reminderStore.set(rec.playerId, rec);
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }
}

function persistRemindersToDisk(): void {
  try {
    const dir = path.dirname(REMINDERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const items = Array.from(reminderStore.values()).slice(-2000);
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(items), 'utf8');
  } catch {
    // Ignore filesystem errors on read-only containers
  }
}

loadRemindersFromDisk();

let reminderSweepRunning = false;
async function processDueReminders(): Promise<void> {
  const botToken = getTelegramBotToken();
  if (!botToken || reminderSweepRunning || reminderStore.size === 0) return;
  reminderSweepRunning = true;
  const now = Date.now();
  const maxStaleMs = 4 * 3_600_000;
  let dirty = false;

  try {
    const botUsername = await resolveTelegramBotUsername();
    const collectButton = buildDirectPrivateMiniAppButton('🐔 Collect & Manage Farm', botUsername);

    const sendReminderDm = async (chatId: string, label: string, text: string) => {
      try {
        let tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[collectButton]],
            },
          }),
          signal: AbortSignal.timeout(7000),
        });
        let tgData = (await tgRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error_code?: number;
          description?: string;
        };
        if (!tgData.ok && tgData.error_code === 400) {
          tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: text.replace(/<\/?[^>]+>/g, ''),
            }),
            signal: AbortSignal.timeout(7000),
          });
          tgData = (await tgRes.json().catch(() => ({}))) as typeof tgData;
        }
        if (tgData.ok) {
          void upsertBotSubscriber({ chatId, source: 'miniapp', isBotBlocked: false });
          recordServerLog('info', 'reminders', `${label} DM sent to ${chatId}`);
        } else {
          if (tgData.error_code === 403) {
            void markBotSubscriberBlocked(chatId, true);
          }
          recordServerLog(
            'warn',
            'reminders',
            `${label} DM failed for ${chatId}`,
            redactBotToken(tgData.description || 'Telegram API error'),
          );
        }
      } catch (err) {
        recordServerLog(
          'warn',
          'reminders',
          `${label} DM error for ${chatId}`,
          redactBotToken(err instanceof Error ? err.message : 'Network error'),
        );
      }
    };

    for (const rec of reminderStore.values()) {
      if (!rec.enabled || !rec.telegramChatId) continue;

      const droneActiveAtBasketFull =
        rec.autoHarvestUntilMs > 0 &&
        rec.basketFullAtMs > 0 &&
        rec.autoHarvestUntilMs >= rec.basketFullAtMs;

      if (
        !droneActiveAtBasketFull &&
        rec.basketFullAtMs > 0 &&
        now >= rec.basketFullAtMs &&
        now - rec.basketFullAtMs <= maxStaleMs &&
        rec.lastBasketSentForAt !== rec.basketFullAtMs
      ) {
        rec.lastBasketSentForAt = rec.basketFullAtMs;
        dirty = true;
        await sendReminderDm(
          rec.telegramChatId,
          'Basket Full',
          [
            '🧺 <b>Egg Basket 100% Full — Harvest Ready!</b>',
            '',
            'Your hens have filled your entire basket and paused laying until you collect!',
            '',
            '🥚 <b>Eggs Waiting:</b> Tap below to harvest your fresh eggs and restart production — or swap eggs into <b>GRAM</b> or <b>+5% Coins</b>!',
            '',
            '⚡ Keep your Alpha Gram coop earning 24/7 🐔💚',
          ].join('\n'),
        );
      }

      if (
        rec.feedBoostUntilMs > 0 &&
        now >= rec.feedBoostUntilMs &&
        now - rec.feedBoostUntilMs <= maxStaleMs &&
        rec.lastFeedSentForAt !== rec.feedBoostUntilMs
      ) {
        rec.lastFeedSentForAt = rec.feedBoostUntilMs;
        dirty = true;
        await sendReminderDm(
          rec.telegramChatId,
          '2x Feed Expired',
          '⚡ <b>2× Laying Feed Boost Expired!</b>\n\nActivate 2× Feed again to double your egg laying rate.',
        );
      }

      if (
        rec.coopFeverUntilMs > 0 &&
        now >= rec.coopFeverUntilMs &&
        now - rec.coopFeverUntilMs <= maxStaleMs &&
        rec.lastFeverSentForAt !== rec.coopFeverUntilMs
      ) {
        rec.lastFeverSentForAt = rec.coopFeverUntilMs;
        dirty = true;
        await sendReminderDm(
          rec.telegramChatId,
          'Coop Fever Ended',
          '🔥 <b>Coop Fever 3× Rush Ended!</b>\n\nCollect your boosted harvest and charge up another 25 ads for 3× Golden Rush.',
        );
      }

      if (
        rec.autoHarvestUntilMs > 0 &&
        now >= rec.autoHarvestUntilMs &&
        now - rec.autoHarvestUntilMs <= maxStaleMs &&
        rec.lastDroneSentForAt !== rec.autoHarvestUntilMs
      ) {
        rec.lastDroneSentForAt = rec.autoHarvestUntilMs;
        dirty = true;
        await sendReminderDm(
          rec.telegramChatId,
          'Drone Pass Expired',
          '🤖 <b>Auto-Harvest Drone Pass Expired!</b>\n\nRenew your Farm Drone pass to keep auto-harvesting with zero basket cap loss.',
        );
      }
    }
  } finally {
    if (dirty) persistRemindersToDisk();
    reminderSweepRunning = false;
  }
}

function buildTxLedgerId(txHash: string): string {
  const clean = txHash.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `tx_${clean.slice(0, 56)}`;
}

let cachedRawDepositAddress: string | null = null;
const processedServerTxHashes = new Set<string>();

async function loadFirestoreClaimedTxHashes(): Promise<string[]> {
  if (!serverDb) return [];
  try {
    const q = query(
      collection(serverDb, 'processed_tx_hashes'),
      orderBy('createdAtMs', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    const hashes: string[] = [];
    for (const d of snap.docs) {
      const h = String(d.data().txHash || '').trim();
      if (h) {
        hashes.push(h);
        processedServerTxHashes.add(h.toLowerCase());
        const norm = normalizeTxHash(h);
        if (norm) processedServerTxHashes.add(norm);
      }
    }
    return hashes;
  } catch {
    return [];
  }
}

async function persistServerTxHashToFirestore(
  txHash: string,
  playerId: string,
  coinsAmount: number,
): Promise<boolean> {
  if (!serverDb) return true;
  const cleanHash = txHash.trim().slice(0, 128);
  if (cleanHash.length < 4) return true;
  const txKey = buildTxLedgerId(cleanHash);
  const clampedCoins = Math.min(MAX_DEPOSIT_COINS, Math.max(MIN_DEPOSIT_COINS, Math.round(coinsAmount)));
  try {
    let inserted = false;
    await runTransaction(serverDb, async (transaction) => {
      const ref = doc(serverDb, 'processed_tx_hashes', txKey);
      const snap = await transaction.get(ref);
      if (snap.exists()) {
        inserted = false;
        return;
      }
      inserted = true;
      transaction.set(ref, {
        txHash: cleanHash,
        playerId,
        coinsAmount: clampedCoins,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });
    });
    return inserted;
  } catch {
    return false;
  }
}

async function resolveRawDepositAddress(): Promise<string> {
  if (cachedRawDepositAddress) return cachedRawDepositAddress;
  const decoded = friendlyTonAddressToRaw(GRAM_DEPOSIT_ADDRESS);
  if (decoded) {
    cachedRawDepositAddress = decoded;
    return decoded;
  }
  try {
    const res = await fetch(
      `https://tonapi.io/v2/accounts/${encodeURIComponent(GRAM_DEPOSIT_ADDRESS)}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (res.ok) {
      const data = (await res.json()) as { address?: string };
      if (data.address) {
        cachedRawDepositAddress = data.address;
        return data.address;
      }
    }
  } catch {
    // Fallback handled below
  }
  return '';
}

async function loadChannelsConfigWithSourceFromFirestore(): Promise<{
  config: ChannelsConfig;
  fromFirestore: boolean;
}> {
  if (!serverDb) return { config: DEFAULT_CHANNELS_CONFIG, fromFirestore: false };
  try {
    const snap = await getFreshDoc(doc(serverDb, 'app_config', 'channels'));
    if (!snap.exists()) return { config: DEFAULT_CHANNELS_CONFIG, fromFirestore: false };
    const d = snap.data();
    const rawList = Array.isArray(d.channels) ? d.channels : [];
    const parsedChannels: RequiredTelegramChannel[] = rawList
      .map((item, idx) =>
        item && typeof item === 'object'
          ? normalizeTelegramChannelEntry(item as Partial<RequiredTelegramChannel>, idx)
          : null,
      )
      .filter((item): item is RequiredTelegramChannel => Boolean(item))
      .slice(0, 10);

    return {
      config: {
        enabled: d.enabled !== false,
        channels: parsedChannels,
        getCodeChannelUrl:
          typeof d.getCodeChannelUrl === 'string' && d.getCodeChannelUrl.trim()
            ? String(d.getCodeChannelUrl).trim().slice(0, 256)
            : DEFAULT_CHANNELS_CONFIG.getCodeChannelUrl,
        updatedAtMs: Number(d.updatedAtMs ?? 0),
      },
      fromFirestore: true,
    };
  } catch {
    return { config: DEFAULT_CHANNELS_CONFIG, fromFirestore: false };
  }
}

async function loadChannelsConfigFromFirestore(): Promise<ChannelsConfig> {
  const res = await loadChannelsConfigWithSourceFromFirestore();
  return res.config;
}

async function loadExtraAdminIdsFromFirestore(): Promise<string[]> {
  if (!serverDb) return [];
  try {
    const snap = await getFreshDoc(doc(serverDb, 'app_config', 'admins'));
    if (!snap.exists()) return [];
    const d = snap.data();
    return Array.isArray(d.adminIds)
      ? d.adminIds
          .map((id) => String(id).trim())
          .filter((id) => Boolean(id) && id !== ADMIN_PASSCODE_VAULT_UID)
      : [];
  } catch {
    return [];
  }
}

const MAINTENANCE_CONFIG_FILE = path.resolve(__dirname, '.data', 'maintenance_config.json');

function loadMaintenanceConfigFromDisk(): MaintenanceConfig | null {
  try {
    if (!fs.existsSync(MAINTENANCE_CONFIG_FILE)) return null;
    const raw = fs.readFileSync(MAINTENANCE_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MaintenanceConfig>;
    return resolveMaintenanceConfig(parsed);
  } catch {
    return null;
  }
}

function persistMaintenanceConfigToDisk(cfg: MaintenanceConfig): void {
  try {
    const dir = path.dirname(MAINTENANCE_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MAINTENANCE_CONFIG_FILE, JSON.stringify(cfg), 'utf8');
  } catch {
    // Non-fatal on read-only containers
  }
}

const MAINTENANCE_PROFILE_DOC_ID = 'sys_maintenance_cfg';
const SYSTEM_RESET_PROFILE_DOC_ID = 'sys_system_reset';

function encodeMaintenanceMirrorTokens(cfg: MaintenanceConfig): string[] {
  const compact = JSON.stringify({
    e: cfg.enabled ? 1 : 0,
    t: cfg.title,
    m: cfg.message,
    r: cfg.estimatedReturn,
    b: cfg.updatedBy,
    u: cfg.updatedAtMs,
  });
  const encoded = encodeURIComponent(compact);
  const chunks: string[] = ['__maint_v1__'];
  for (let i = 0; i < encoded.length && chunks.length < 49; i += 52) {
    chunks.push(encoded.slice(i, i + 52));
  }
  return chunks;
}

function decodeMaintenanceMirrorDoc(d: DocumentData | undefined): MaintenanceConfig | null {
  if (!d) return null;
  const tokens = Array.isArray(d.claimedAchievementIds)
    ? (d.claimedAchievementIds as unknown[]).map((v) => String(v))
    : [];
  if (tokens[0] === '__maint_v1__' && tokens.length > 1) {
    try {
      const parsed = JSON.parse(decodeURIComponent(tokens.slice(1).join(''))) as {
        e?: number;
        t?: string;
        m?: string;
        r?: string;
        b?: string;
        u?: number;
      };
      return resolveMaintenanceConfig({
        enabled: parsed.e === 1,
        title: typeof parsed.t === 'string' ? parsed.t : undefined,
        message: typeof parsed.m === 'string' ? parsed.m : undefined,
        estimatedReturn: typeof parsed.r === 'string' ? parsed.r : undefined,
        updatedBy: typeof parsed.b === 'string' ? parsed.b : undefined,
        updatedAtMs: Math.max(0, Number(parsed.u ?? 0) || 0),
      });
    } catch {
      // Fallback below
    }
  }
  if (String(d.handle || '') === '@maint_cfg' && typeof d.referralActivated === 'boolean') {
    return resolveMaintenanceConfig({
      enabled: Boolean(d.referralActivated),
      title: typeof d.displayName === 'string' ? d.displayName : undefined,
      updatedBy: typeof d.referredBy === 'string' ? d.referredBy : undefined,
      updatedAtMs: Math.max(0, Number(d.lastCollectedAt ?? 0) || 0),
    });
  }
  return null;
}

async function upsertServerReservedPlayerDoc(params: {
  docId: string;
  referralCode: string;
  displayName: string;
  handle: string;
  xp: number;
  referredBy: string;
  referralActivated: boolean;
  lastCollectedAt: number;
  claimedAchievementIds: string[];
}): Promise<void> {
  if (!serverDb) return;
  const ref = doc(serverDb, 'players', params.docId);
  const snap = await getFreshDoc(ref);
  const nowMs = Date.now();
  const mutableFields = {
    displayName: params.displayName.slice(0, 60) || 'System Config',
    handle: params.handle.slice(0, 40) || '@sys_cfg',
    photoUrl: '',
    avatarColor: '#F59E0B',
    level: 1,
    xp: Math.max(0, Math.floor(params.xp)),
    coins: 0,
    eggs: 0,
    totalEggsCollected: 0,
    totalCashEarnedUsd: 0,
    totalWithdrawnUsd: 0,
    basketCapacity: 300,
    basketTierHours: 8,
    leghornCount: 0,
    rhodeCount: 0,
    orpingtonCount: 0,
    australorpCount: 0,
    boughtThisWeek: 0,
    dailyStreak: 0,
    lastDailyClaimDate: '',
    completedTaskIds: [] as string[],
    claimedPromoCodes: [] as string[],
    watchedAdsCount: 0,
    referredBy: params.referredBy.slice(0, 64),
    referralActivated: Boolean(params.referralActivated),
    referralCount: 0,
    referralCoinsEarned: 0,
    firstDepositBonusUsed: false,
    language: 'en',
    lastCollectedAt: Math.max(0, Number(params.lastCollectedAt) || 0),
    feedBoostUntilMs: 0,
    lastGoldenEggAtMs: 0,
    goldenEggsFound: 0,
    claimedAchievementIds: params.claimedAchievementIds.slice(0, 50),
    claimedReferralMilestones: [] as number[],
    updatedAt: serverTimestamp(),
  };

  if (snap.exists()) {
    await updateDoc(ref, mutableFields);
  } else {
    await setDoc(ref, {
      uid: params.docId,
      referralCode: params.referralCode.slice(0, 32),
      createdAtMs: nowMs,
      createdAt: serverTimestamp(),
      ...mutableFields,
    });
  }
}

async function loadMaintenanceConfigFromFirestore(): Promise<MaintenanceConfig> {
  const disk = loadMaintenanceConfigFromDisk();
  if (!serverDb) return disk || DEFAULT_MAINTENANCE_CONFIG;
  try {
    const [appSnap, mirrorSnap] = await Promise.all([
      getFreshDoc(doc(serverDb, 'app_config', 'maintenance')).catch(() => null),
      getFreshDoc(doc(serverDb, 'players', MAINTENANCE_PROFILE_DOC_ID)).catch(() => null),
    ]);
    const candidates: MaintenanceConfig[] = [];
    if (disk) candidates.push(disk);
    if (appSnap?.exists()) {
      candidates.push(resolveMaintenanceConfig(appSnap.data() as Partial<MaintenanceConfig>));
    }
    if (mirrorSnap?.exists()) {
      const parsedMirror = decodeMaintenanceMirrorDoc(mirrorSnap.data());
      if (parsedMirror) candidates.push(parsedMirror);
    }
    if (candidates.length === 0) return DEFAULT_MAINTENANCE_CONFIG;
    candidates.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    const best = candidates[0];
    persistMaintenanceConfigToDisk(best);
    return best;
  } catch {
    return disk || DEFAULT_MAINTENANCE_CONFIG;
  }
}

async function saveMaintenanceConfigOnServer(
  input: Partial<MaintenanceConfig>,
  updatedBy: string,
): Promise<MaintenanceConfig> {
  const resolved = resolveMaintenanceConfig({
    enabled: Boolean(input.enabled),
    title: input.title,
    message: input.message,
    estimatedReturn: input.estimatedReturn,
    updatedBy: updatedBy.slice(0, 64),
    updatedAtMs: Date.now(),
  });
  persistMaintenanceConfigToDisk(resolved);
  if (serverDb) {
    const [appRes, mirrorRes] = await Promise.allSettled([
      setDoc(doc(serverDb, 'app_config', 'maintenance'), {
        ...resolved,
        updatedAt: serverTimestamp(),
      }),
      upsertServerReservedPlayerDoc({
        docId: MAINTENANCE_PROFILE_DOC_ID,
        referralCode: '__MAINT__',
        displayName: resolved.title.slice(0, 60) || 'Scheduled Maintenance',
        handle: '@maint_cfg',
        xp: 0,
        referredBy: resolved.updatedBy.slice(0, 64),
        referralActivated: Boolean(resolved.enabled),
        lastCollectedAt: resolved.updatedAtMs,
        claimedAchievementIds: encodeMaintenanceMirrorTokens(resolved),
      }),
    ]);
    if (appRes.status === 'rejected' && mirrorRes.status === 'rejected') {
      recordServerLog(
        'warn',
        'maintenance',
        'Saved maintenance config to disk (Firestore sync skipped)',
        mirrorRes.reason instanceof Error ? mirrorRes.reason.message : 'Firestore write error',
      );
    }
  }
  return resolved;
}

const CHANNEL_CHECK_LOGS_FILE = path.resolve(__dirname, '.data', 'channel_check_logs.json');
const channelCheckLogs: ChannelCheckDiagnosticLog[] = [];

function loadChannelCheckLogsFromDisk(): void {
  try {
    if (!fs.existsSync(CHANNEL_CHECK_LOGS_FILE)) return;
    const raw = fs.readFileSync(CHANNEL_CHECK_LOGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed.slice(0, 20)) {
        if (item && typeof item === 'object' && typeof item.timestampMs === 'number') {
          channelCheckLogs.push(item as ChannelCheckDiagnosticLog);
        }
      }
    }
  } catch {
    // Non-fatal
  }
}

const serverDiagnosticLogs: SystemServerLogEntry[] = [];

function recordServerLog(
  level: SystemServerLogEntry['level'],
  source: string,
  message: string,
  detail?: string,
): void {
  const entry: SystemServerLogEntry = {
    id: `slog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestampMs: Date.now(),
    level,
    source: source.slice(0, 40),
    message: redactBotToken(message).slice(0, 220),
    ...(detail ? { detail: redactBotToken(detail).slice(0, 320) } : {}),
  };
  serverDiagnosticLogs.unshift(entry);
  if (serverDiagnosticLogs.length > 60) {
    serverDiagnosticLogs.length = 60;
  }
}

const botHeartbeatState: {
  lastHeartbeatAtMs: number;
  lastHeartbeatOk: boolean;
  latencyMs: number | null;
  username: string | null;
  botId: number | null;
  webhookUrl: string | null;
  pendingUpdateCount: number;
  error: string | null;
} = {
  lastHeartbeatAtMs: 0,
  lastHeartbeatOk: false,
  latencyMs: null,
  username: null,
  botId: null,
  webhookUrl: null,
  pendingUpdateCount: 0,
  error: null,
};

async function probeBotHeartbeat(forceFresh = false): Promise<typeof botHeartbeatState> {
  const botToken = getTelegramBotToken();
  if (!botToken) {
    botHeartbeatState.lastHeartbeatAtMs = Date.now();
    botHeartbeatState.lastHeartbeatOk = false;
    botHeartbeatState.latencyMs = null;
    botHeartbeatState.username = runtimeBotConfig?.botUsername || TELEGRAM_BOT_USERNAME_ENV || null;
    botHeartbeatState.botId = null;
    botHeartbeatState.webhookUrl = null;
    botHeartbeatState.pendingUpdateCount = 0;
    botHeartbeatState.error = 'TELEGRAM_BOT_TOKEN not configured on server. Add it in Admin Panel -> Channels / Diagnostics.';
    return botHeartbeatState;
  }

  const now = Date.now();
  if (!forceFresh && botHeartbeatState.lastHeartbeatAtMs > 0 && now - botHeartbeatState.lastHeartbeatAtMs < 15_000) {
    return botHeartbeatState;
  }

  const startedAt = Date.now();
  try {
    const [meRes, whRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(6000),
      }),
      fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
      refreshBotMenuWebAppUrl(botToken),
    ]);
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const meData = (await meRes.json()) as {
      ok?: boolean;
      description?: string;
      result?: { id?: number; username?: string };
    };

    let webhookUrl: string | null = null;
    let pendingUpdateCount = 0;
    if (whRes && whRes.ok) {
      const whData = (await whRes.json().catch(() => null)) as {
        ok?: boolean;
        result?: { url?: string; pending_update_count?: number };
      } | null;
      if (whData?.ok && whData.result) {
        webhookUrl = whData.result.url || null;
        pendingUpdateCount = Number(whData.result.pending_update_count ?? 0);
      }
    }

    botHeartbeatState.lastHeartbeatAtMs = Date.now();
    botHeartbeatState.latencyMs = latencyMs;
    botHeartbeatState.webhookUrl = webhookUrl;
    botHeartbeatState.pendingUpdateCount = pendingUpdateCount;

    if (meData.ok && meData.result) {
      const cleanUser = normalizeTelegramBotUsername(meData.result.username);
      if (cleanUser) {
        cachedBotUsername = cleanUser;
      }
      botHeartbeatState.lastHeartbeatOk = true;
      botHeartbeatState.username = cleanUser || cachedBotUsername || DEFAULT_TELEGRAM_BOT_USERNAME;
      botHeartbeatState.botId = typeof meData.result.id === 'number' ? meData.result.id : null;
      botHeartbeatState.error = null;
      recordServerLog(
        'info',
        'bot_heartbeat',
        `Bot @${botHeartbeatState.username} online (${latencyMs}ms)`,
        webhookUrl ? `Webhook active · pending=${pendingUpdateCount}` : `Polling mode · pending=${pendingUpdateCount}`,
      );
    } else {
      const errMsg = redactBotToken(meData.description || 'Telegram getMe returned negative');
      botHeartbeatState.lastHeartbeatOk = false;
      botHeartbeatState.error = errMsg;
      recordServerLog('error', 'bot_heartbeat', 'Bot heartbeat failed', errMsg);
    }
  } catch (err) {
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const errMsg = redactBotToken(err instanceof Error ? err.message : 'Telegram Bot API unreachable');
    botHeartbeatState.lastHeartbeatAtMs = Date.now();
    botHeartbeatState.lastHeartbeatOk = false;
    botHeartbeatState.latencyMs = latencyMs;
    botHeartbeatState.error = errMsg;
    recordServerLog('error', 'bot_heartbeat', 'Bot API connection failed', errMsg);
  }
  return botHeartbeatState;
}

function recordChannelCheckDiagnosticLog(
  entry: Omit<ChannelCheckDiagnosticLog, 'id' | 'timestampMs'>,
): ChannelCheckDiagnosticLog {
  const fullEntry: ChannelCheckDiagnosticLog = {
    id: `cclog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestampMs: Date.now(),
    ...entry,
  };
  channelCheckLogs.unshift(fullEntry);
  if (channelCheckLogs.length > 20) {
    channelCheckLogs.length = 20;
  }
  recordServerLog(
    fullEntry.error ? 'warn' : fullEntry.allJoined ? 'info' : 'warn',
    fullEntry.endpoint,
    `Channel check ${fullEntry.allJoined ? 'PASSED' : 'NEGATIVE'} (mode=${fullEntry.verificationMode}, user=${fullEntry.telegramUserId || 'none'})`,
    fullEntry.error ||
      fullEntry.channels.map((c) => `${c.handle}:${c.joined ? 'joined' : c.status}`).join(', '),
  );
  try {
    const dir = path.dirname(CHANNEL_CHECK_LOGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHANNEL_CHECK_LOGS_FILE, JSON.stringify(channelCheckLogs), 'utf8');
  } catch {
    // Non-fatal on read-only containers
  }
  return fullEntry;
}

function getRecentChannelCheckLogs(limitCount = 5): ChannelCheckDiagnosticLog[] {
  return channelCheckLogs.slice(0, Math.max(1, Math.min(20, limitCount)));
}

loadChannelCheckLogsFromDisk();

async function formatTelegramChannelCheckError(
  rawDescription: string | undefined,
  handle: string,
): Promise<string> {
  const desc = redactBotToken(String(rawDescription || '').trim());
  const low = desc.toLowerCase();
  if (
    low.includes('member list is inaccessible') ||
    low.includes('not enough rights') ||
    low.includes('chat_admin_required') ||
    low.includes('bot is not a member') ||
    low.includes('administrator')
  ) {
    const botUsername = await resolveTelegramBotUsername().catch(() => '');
    const botTag = botUsername ? `@${botUsername.replace(/^@+/, '')}` : 'the bot';
    return `Make ${botTag} an Admin in ${handle} to verify joins.`;
  }
  if (low.includes('chat not found') || low.includes('username not found')) {
    return `Channel ${handle} not found. Check the channel link or make sure it is public.`;
  }
  return desc || `Could not confirm ${handle} membership. Make sure our bot is Admin there.`;
}

async function fetchTelegramChatMember(chatId: string, userId: string): Promise<{
  ok: boolean;
  userNotFound?: boolean;
  errorCode?: number;
  description?: string;
  targetChatIdUsed?: string;
  result?: { status?: string; is_member?: boolean };
}> {
  const tryLookup = async (targetChatId: string) => {
    const botToken = getTelegramBotToken();
    const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(
      targetChatId,
    )}&user_id=${encodeURIComponent(userId)}`;
    const tgRes = await fetch(url, { signal: AbortSignal.timeout(7000) });
    return (await tgRes.json()) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
      result?: { status?: string; is_member?: boolean };
    };
  };

  const cleanedInput = String(chatId || '').trim().replace(/\/+$/, '');
  const normalizedHandle = normalizeTelegramChannelHandle(cleanedInput).handle || cleanedInput;
  const primary = await tryLookup(normalizedHandle);
  if (primary.ok && primary.result) {
    return { ok: true, targetChatIdUsed: normalizedHandle, result: primary.result };
  }

  const isTelegramUserNotFoundDescription = (desc: string): boolean => {
    const low = desc.toLowerCase();
    return (
      low.includes('user not found') ||
      low.includes('user_id_invalid') ||
      low.includes('participant_id_invalid') ||
      low.includes('member not found')
    );
  };

  const primaryDesc = String(primary.description || '').toLowerCase();
  if (isTelegramUserNotFoundDescription(primaryDesc)) {
    return {
      ok: false,
      userNotFound: true,
      errorCode: primary.error_code,
      targetChatIdUsed: normalizedHandle,
      description: redactBotToken(primary.description || ''),
    };
  }

  // Retry with -100 prefix if admin saved positive numeric ID or -groupId for a channel/supergroup
  const needsSupergroupRetry =
    primaryDesc.includes('chat not found') || primaryDesc.includes('upgraded');
  if (needsSupergroupRetry) {
    const supergroupCandidate = /^\d{6,16}$/.test(normalizedHandle)
      ? `-100${normalizedHandle}`
      : /^-\d{6,16}$/.test(normalizedHandle) && !normalizedHandle.startsWith('-100')
        ? `-100${normalizedHandle.slice(1)}`
        : '';
    if (supergroupCandidate) {
      const retried = await tryLookup(supergroupCandidate);
      if (retried.ok && retried.result) {
        return { ok: true, targetChatIdUsed: supergroupCandidate, result: retried.result };
      }
      const retryDesc = String(retried.description || '').toLowerCase();
      if (isTelegramUserNotFoundDescription(retryDesc)) {
        return {
          ok: false,
          userNotFound: true,
          errorCode: retried.error_code,
          targetChatIdUsed: supergroupCandidate,
          description: redactBotToken(retried.description || ''),
        };
      }
      return {
        ok: false,
        errorCode: retried.error_code ?? primary.error_code,
        targetChatIdUsed: supergroupCandidate,
        description: redactBotToken(retried.description || primary.description || ''),
      };
    }
  }

  return {
    ok: false,
    errorCode: primary.error_code,
    targetChatIdUsed: normalizedHandle,
    description: redactBotToken(primary.description || ''),
  };
}

const referralNotifyDedup = new Map<string, number>();
const withdrawNotifyDedup = new Map<string, number>();

function toServerFirestorePlayerCreatePayload(
  profile: ReturnType<typeof createDefaultProfile>['profile'],
) {
  return {
    uid: profile.uid,
    displayName: (profile.displayName || '').trim().slice(0, 60) || 'Farmer',
    handle: (profile.handle || '').trim().slice(0, 40) || '@farmer',
    photoUrl: (profile.photoUrl || '').slice(0, 512),
    avatarColor: (profile.avatarColor || '#EF4444').slice(0, 20),
    level: Math.max(1, Math.min(999, Math.floor(Number(profile.level ?? 1) || 1))),
    xp: Math.max(0, Number(profile.xp ?? 0) || 0),
    coins: Math.max(-100_000_000, Math.min(100_000_000, Number(profile.coins ?? 0) || 0)),
    eggs: Math.max(0, Number(profile.eggs ?? 0) || 0),
    totalEggsCollected: Math.max(0, Number(profile.totalEggsCollected ?? 0) || 0),
    totalCashEarnedUsd: Math.max(0, Number(profile.totalCashEarnedUsd ?? 0) || 0),
    totalWithdrawnUsd: Math.max(0, Number(profile.totalWithdrawnUsd ?? 0) || 0),
    basketCapacity: Math.max(300, Number(profile.basketCapacity ?? 300) || 300),
    basketTierHours: Math.max(8, Math.min(72, Number(profile.basketTierHours ?? 8) || 8)),
    leghornCount: Math.max(0, Math.floor(Number(profile.leghornCount ?? 0) || 0)),
    rhodeCount: Math.max(0, Math.floor(Number(profile.rhodeCount ?? 0) || 0)),
    orpingtonCount: Math.max(0, Math.floor(Number(profile.orpingtonCount ?? 0) || 0)),
    australorpCount: Math.max(0, Math.floor(Number(profile.australorpCount ?? 0) || 0)),
    boughtThisWeek: Math.max(0, Math.floor(Number(profile.boughtThisWeek ?? 0) || 0)),
    dailyStreak: Math.max(0, Math.min(7, Math.floor(Number(profile.dailyStreak ?? 0) || 0))),
    lastDailyClaimDate: String(profile.lastDailyClaimDate || '').slice(0, 20),
    completedTaskIds: (profile.completedTaskIds ?? []).slice(0, 50),
    claimedPromoCodes: (profile.claimedPromoCodes ?? []).slice(0, 50),
    watchedAdsCount: Math.max(0, Math.min(10, Math.floor(Number(profile.watchedAdsCount ?? 0) || 0))),
    referralCode: String(profile.referralCode || profile.uid).slice(0, 32),
    referredBy: String(profile.referredBy || '').slice(0, 64),
    referralActivated: Boolean(profile.referralActivated),
    referralCount: Math.max(0, Math.floor(Number(profile.referralCount ?? 0) || 0)),
    referralCoinsEarned: Math.max(0, Number(profile.referralCoinsEarned ?? 0) || 0),
    firstDepositBonusUsed: Boolean(profile.firstDepositBonusUsed),
    language: String(profile.language || 'en').slice(0, 16) || 'en',
    lastCollectedAt: Math.max(0, Number(profile.lastCollectedAt ?? Date.now()) || Date.now()),
    createdAtMs: Math.max(0, Number(profile.createdAtMs ?? Date.now()) || Date.now()),
    feedBoostUntilMs: Math.max(0, Number(profile.feedBoostUntilMs ?? 0) || 0),
    lastGoldenEggAtMs: Math.max(0, Number(profile.lastGoldenEggAtMs ?? 0) || 0),
    goldenEggsFound: Math.max(0, Math.floor(Number(profile.goldenEggsFound ?? 0) || 0)),
    claimedAchievementIds: encodeAchievementsWithAds(
      profile.claimedAchievementIds ?? [],
      Math.max(0, Math.floor(Number(profile.totalAdsWatched ?? 0) || 0)),
      {
        withdrawAdsWatched: profile.withdrawAdsWatched ?? 0,
        coopFeverUntilMs: profile.coopFeverUntilMs ?? 0,
        coopFeverBaselineAds: profile.coopFeverBaselineAds ?? 0,
        coopFeverAdsWatched: profile.coopFeverAdsWatched ?? 0,
        autoHarvestUntilMs: profile.autoHarvestUntilMs ?? 0,
        telegramRemindersEnabled: profile.telegramRemindersEnabled,
      },
    ),
    claimedReferralMilestones: (profile.claimedReferralMilestones ?? []).slice(0, 20),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function toServerFirestorePlayerUpdatePayload(
  raw: Record<string, unknown>,
  uid: string,
  overrides: {
    coins?: number;
    referredBy?: string;
    referralActivated?: boolean;
    referralCount?: number;
    referralCoinsEarned?: number;
  } = {},
) {
  const safeName = String(raw.displayName || '').trim().slice(0, 60) || 'Farmer';
  const safeHandle = formatReferralHandle(String(raw.handle || ''), uid).slice(0, 40) || '@farmer';
  const rawColor = String(raw.avatarColor || '').trim().slice(0, 20);
  const safeColor = rawColor.length >= 4 ? rawColor : '#EF4444';
  const safeCompletedTasks = Array.isArray(raw.completedTaskIds)
    ? raw.completedTaskIds.filter((v): v is string => typeof v === 'string' && v.length <= 64).slice(0, 50)
    : [];
  const safeClaimedPromos = Array.isArray(raw.claimedPromoCodes)
    ? raw.claimedPromoCodes.filter((v): v is string => typeof v === 'string' && v.length <= 64).slice(0, 50)
    : [];
  const safeAchievements = Array.isArray(raw.claimedAchievementIds)
    ? raw.claimedAchievementIds.filter((v): v is string => typeof v === 'string' && v.length <= 64).slice(0, 50)
    : [];
  const safeMilestones = Array.isArray(raw.claimedReferralMilestones)
    ? raw.claimedReferralMilestones.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).slice(0, 20)
    : [];

  return {
    displayName: safeName,
    handle: safeHandle,
    photoUrl: String(raw.photoUrl || '').slice(0, 512),
    avatarColor: safeColor,
    level: Math.max(1, Math.min(999, Math.floor(Number(raw.level ?? 1) || 1))),
    xp: Math.max(0, Math.min(100_000_000, Number(raw.xp ?? 0) || 0)),
    coins: Math.max(-100_000_000, Math.min(100_000_000, Number(overrides.coins ?? raw.coins ?? 0) || 0)),
    eggs: Math.max(0, Math.min(100_000_000, Number(raw.eggs ?? 0) || 0)),
    totalEggsCollected: Math.max(0, Math.min(500_000_000, Number(raw.totalEggsCollected ?? 0) || 0)),
    totalCashEarnedUsd: Math.max(0, Math.min(10_000_000, Number(raw.totalCashEarnedUsd ?? 0) || 0)),
    totalWithdrawnUsd: Math.max(0, Math.min(10_000_000, Number(raw.totalWithdrawnUsd ?? 0) || 0)),
    basketCapacity: Math.max(300, Math.min(1_000_000, Number(raw.basketCapacity ?? 300) || 300)),
    basketTierHours: Math.max(8, Math.min(72, Number(raw.basketTierHours ?? 8) || 8)),
    leghornCount: Math.max(0, Math.min(100_000, Math.floor(Number(raw.leghornCount ?? 0) || 0))),
    rhodeCount: Math.max(0, Math.min(100_000, Math.floor(Number(raw.rhodeCount ?? 0) || 0))),
    orpingtonCount: Math.max(0, Math.min(100_000, Math.floor(Number(raw.orpingtonCount ?? 0) || 0))),
    australorpCount: Math.max(0, Math.min(100_000, Math.floor(Number(raw.australorpCount ?? 0) || 0))),
    boughtThisWeek: Math.max(0, Math.min(100_000, Math.floor(Number(raw.boughtThisWeek ?? 0) || 0))),
    dailyStreak: Math.max(0, Math.min(7, Math.floor(Number(raw.dailyStreak ?? 0) || 0))),
    lastDailyClaimDate: String(raw.lastDailyClaimDate || '').slice(0, 20),
    completedTaskIds: safeCompletedTasks,
    claimedPromoCodes: safeClaimedPromos,
    watchedAdsCount: Math.max(0, Math.min(10, Math.floor(Number(raw.watchedAdsCount ?? 0) || 0))),
    referredBy: String(overrides.referredBy ?? raw.referredBy ?? '').slice(0, 64),
    referralActivated: Boolean(overrides.referralActivated ?? raw.referralActivated),
    referralCount: Math.max(
      0,
      Math.min(1_000_000, Math.floor(Number(overrides.referralCount ?? raw.referralCount ?? 0) || 0)),
    ),
    referralCoinsEarned: Math.max(
      0,
      Math.min(100_000_000, Number(overrides.referralCoinsEarned ?? raw.referralCoinsEarned ?? 0) || 0),
    ),
    firstDepositBonusUsed: Boolean(raw.firstDepositBonusUsed),
    language: String(raw.language || 'en').slice(0, 16) || 'en',
    lastCollectedAt: Math.max(0, Number(raw.lastCollectedAt ?? Date.now()) || Date.now()),
    feedBoostUntilMs: Math.max(0, Number(raw.feedBoostUntilMs ?? 0) || 0),
    lastGoldenEggAtMs: Math.max(0, Number(raw.lastGoldenEggAtMs ?? 0) || 0),
    goldenEggsFound: Math.max(0, Math.min(10_000_000, Math.floor(Number(raw.goldenEggsFound ?? 0) || 0))),
    claimedAchievementIds: safeAchievements,
    claimedReferralMilestones: safeMilestones,
    updatedAt: serverTimestamp(),
  };
}

function toServerFirestoreLeaderboardUpdatePayload(
  existingLb: Record<string, unknown>,
  rawPlayer: Record<string, unknown>,
  uid: string,
  overrides: {
    inviterCount: number;
    buyerPoints: number;
    chickensCount: number;
  },
) {
  const safeName =
    String(existingLb.displayName || rawPlayer.displayName || '').trim().slice(0, 60) || 'Farmer';
  const safeHandle =
    formatReferralHandle(String(existingLb.handle || rawPlayer.handle || ''), uid).slice(0, 40) ||
    '@farmer';
  const rawColor = String(existingLb.avatarColor || rawPlayer.avatarColor || '').trim().slice(0, 20);
  const safeColor = rawColor.length >= 4 ? rawColor : '#EF4444';
  return {
    displayName: safeName,
    handle: safeHandle,
    photoUrl: String(existingLb.photoUrl ?? rawPlayer.photoUrl ?? '').slice(0, 512),
    avatarColor: safeColor,
    buyerPoints: Math.max(0, Math.min(10_000_000, Number(overrides.buyerPoints) || 0)),
    inviterCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(overrides.inviterCount) || 0))),
    eggs: Math.max(0, Math.min(100_000_000, Number(rawPlayer.eggs ?? existingLb.eggs ?? 0) || 0)),
    totalEggsCollected: Math.max(
      0,
      Math.min(500_000_000, Number(rawPlayer.totalEggsCollected ?? existingLb.totalEggsCollected ?? 0) || 0),
    ),
    chickensCount: Math.max(0, Math.min(1_000_000, Math.floor(Number(overrides.chickensCount) || 0))),
    updatedAt: serverTimestamp(),
  };
}

async function applyReferralInServerDb(params: {
  referredUid: string;
  refCode: string;
  displayName?: string;
  handle?: string;
  photoUrl?: string;
}): Promise<{
  ok: boolean;
  applied: boolean;
  activated?: boolean;
  alreadyLinked?: boolean;
  reason?: string;
  referrerUid?: string;
  referrerName?: string;
  coinsRewarded?: number;
  referredCoinsAwarded?: number;
  referredBonusCoins?: number;
  nextReferredCoins?: number;
  botDmSent?: boolean;
  botDmReason?: string;
  statusCode?: number;
}> {
  if (!serverDb) {
    return { ok: false, applied: false, reason: 'server_db_unavailable', statusCode: 503 };
  }

  const referredUid = String(params.referredUid || '').trim();
  const rawRefCode = String(params.refCode || '').trim();
  const strippedRef = rawRefCode.replace(/^(?:ref|r)_/i, '').trim();

  if (!isValidSafeId(referredUid) || !strippedRef || strippedRef.length < 3) {
    return { ok: false, applied: false, reason: 'invalid_code', statusCode: 400 };
  }

  const numericReferredId = extractTelegramNumericUserId(referredUid);
  const strippedNumeric = /^\d{4,20}$/.test(strippedRef)
    ? strippedRef
    : extractTelegramNumericUserId(strippedRef);

  if (
    strippedRef === referredUid ||
    (numericReferredId && strippedNumeric && numericReferredId === strippedNumeric)
  ) {
    return { ok: true, applied: false, reason: 'self_referral' };
  }

  try {
    const candidateIds = Array.from(
      new Set(
        [
          strippedNumeric ? `tg_${strippedNumeric}` : '',
          strippedRef,
          rawRefCode,
        ].filter((id): id is string => Boolean(id && /^[a-zA-Z0-9_-]{3,64}$/.test(id))),
      ),
    );

    let referrerUid = '';
    let referrerName = 'Farmer';

    for (const candidateId of candidateIds) {
      const pSnap = await getFreshDoc(doc(serverDb, 'players', candidateId));
      if (pSnap.exists()) {
        referrerUid = pSnap.id;
        referrerName = String(pSnap.data()?.displayName || 'Farmer');
        break;
      }
      const lbSnap = await getFreshDoc(doc(serverDb, 'leaderboard', candidateId));
      if (lbSnap.exists()) {
        referrerUid = lbSnap.id;
        referrerName = String(lbSnap.data()?.displayName || 'Farmer');
        break;
      }
    }

    if (!referrerUid) {
      for (const codeCandidate of Array.from(new Set([strippedRef, rawRefCode, rawRefCode.toUpperCase()])).filter(Boolean)) {
        const lbQuery = query(
          collection(serverDb, 'leaderboard'),
          where('referralCode', '==', codeCandidate),
          limit(1),
        );
        const lbMatches = await getDocs(lbQuery);
        if (!lbMatches.empty) {
          const matchSnap = lbMatches.docs[0];
          referrerUid = String(matchSnap.data()?.uid || matchSnap.id);
          referrerName = String(matchSnap.data()?.displayName || 'Farmer');
          break;
        }
        const playerQuery = query(
          collection(serverDb, 'players'),
          where('referralCode', '==', codeCandidate),
          limit(1),
        );
        const playerMatches = await getDocs(playerQuery);
        if (!playerMatches.empty) {
          const matchSnap = playerMatches.docs[0];
          referrerUid = String(matchSnap.data()?.uid || matchSnap.id);
          referrerName = String(matchSnap.data()?.displayName || 'Farmer');
          break;
        }
      }
    }

    if (!referrerUid) {
      const cleanNoAt = rawRefCode.replace(/^@+/, '').trim();
      const cleanLower = cleanNoAt.toLowerCase();
      if (cleanNoAt) {
        for (const handleCandidate of Array.from(
          new Set([`@${cleanNoAt}`, `@${cleanNoAt.toLowerCase()}`, `@${cleanNoAt.toUpperCase()}`, cleanNoAt]),
        )) {
          const pHandleMatches = await getDocs(
            query(collection(serverDb, 'players'), where('handle', '==', handleCandidate), limit(1)),
          );
          if (!pHandleMatches.empty) {
            const matchSnap = pHandleMatches.docs[0];
            referrerUid = String(matchSnap.data()?.uid || matchSnap.id);
            referrerName = String(matchSnap.data()?.displayName || 'Farmer');
            break;
          }
          const lbHandleMatches = await getDocs(
            query(collection(serverDb, 'leaderboard'), where('handle', '==', handleCandidate), limit(1)),
          );
          if (!lbHandleMatches.empty) {
            const matchSnap = lbHandleMatches.docs[0];
            referrerUid = String(matchSnap.data()?.uid || matchSnap.id);
            referrerName = String(matchSnap.data()?.displayName || 'Farmer');
            break;
          }
        }
      }
      if (!referrerUid && cleanLower) {
        const [playersSnap, lbSnap] = await Promise.all([
          getDocs(query(collection(serverDb, 'players'), orderBy('createdAtMs', 'desc'), limit(50))),
          getDocs(query(collection(serverDb, 'leaderboard'), limit(50))),
        ]);
        for (const docSnap of [...playersSnap.docs, ...lbSnap.docs]) {
          if (docSnap.id.startsWith('sys_') || docSnap.id.startsWith('__')) continue;
          const data = docSnap.data();
          const hLow = String(data?.handle || '').trim().replace(/^@+/, '').toLowerCase();
          const cLow = String(data?.referralCode || '').trim().toLowerCase();
          if (hLow === cleanLower || cLow === cleanLower) {
            referrerUid = String(data?.uid || docSnap.id);
            referrerName = String(data?.displayName || 'Farmer');
            break;
          }
        }
      }
    }

    if (!referrerUid) {
      return { ok: true, applied: false, reason: 'invalid_code' };
    }
    if (referrerUid === referredUid) {
      return { ok: true, applied: false, reason: 'self_referral' };
    }

    const referrerPlayerRef = doc(serverDb, 'players', referrerUid);
    const referrerLbRef = doc(serverDb, 'leaderboard', referrerUid);
    const referredPlayerRef = doc(serverDb, 'players', referredUid);
    const referredLbRef = doc(serverDb, 'leaderboard', referredUid);
    const referralDocRef = doc(serverDb, 'players', referrerUid, 'referrals', referredUid);

    const nowMs = Date.now();
    const rewardCoins = BONUS_PER_REFERRAL;
    let alreadyLinked = false;
    let existingReferralActivated = false;
    let existingReferrerUid = '';
    let activatedOnLink = false;
    let safeReferredName = String(params.displayName || '').trim().slice(0, 60) || 'Farmer';
    let safeReferredHandle = formatReferralHandle(String(params.handle || ''), referredUid).slice(0, 40);
    let nextReferredCoins = 0;
    let referrerTotalReferrals = 0;
    let referrerTotalCoinsEarned = 0;

    await runTransaction(serverDb, async (tx) => {
      const [referredSnap, referredLbSnap, referrerSnap, referrerLbSnap, existingRefSnap] =
        await Promise.all([
          tx.get(referredPlayerRef),
          tx.get(referredLbRef),
          tx.get(referrerPlayerRef),
          tx.get(referrerLbRef),
          tx.get(referralDocRef),
        ]);

      if (!referrerSnap.exists()) {
        throw new Error('REFERRER_MISSING');
      }

      if (
        existingRefSnap.exists() ||
        (referredSnap.exists() && String(referredSnap.data()?.referredBy || '').trim() !== '')
      ) {
        alreadyLinked = true;
        existingReferrerUid = String(
          referredSnap.exists() ? referredSnap.data()?.referredBy || referrerUid : referrerUid,
        ).trim();
        existingReferralActivated = referredSnap.exists()
          ? Boolean(referredSnap.data()?.referralActivated)
          : false;
        nextReferredCoins = referredSnap.exists() ? Number(referredSnap.data()?.coins ?? 0) : 0;
        return;
      }

      const existingChickenCount = referredSnap.exists()
        ? Number(referredSnap.data().leghornCount ?? 0) +
          Number(referredSnap.data().rhodeCount ?? 0) +
          Number(referredSnap.data().orpingtonCount ?? 0) +
          Number(referredSnap.data().australorpCount ?? 0)
        : 0;
      const hasOwnedChicken = existingChickenCount > 0;
      activatedOnLink = hasOwnedChicken;

      if (referredSnap.exists()) {
        const rd = referredSnap.data();
        safeReferredName =
          String(rd.displayName || params.displayName || 'Farmer').trim().slice(0, 60) || 'Farmer';
        safeReferredHandle = formatReferralHandle(
          String(rd.handle || params.handle || ''),
          referredUid,
        ).slice(0, 40);
        nextReferredCoins = Math.max(-100_000_000, (Number(rd.coins ?? 0) || 0) + REFERRED_WELCOME_BONUS_COINS);
        tx.update(
          referredPlayerRef,
          toServerFirestorePlayerUpdatePayload(rd, referredUid, {
            referredBy: referrerUid,
            referralActivated: hasOwnedChicken,
            coins: nextReferredCoins,
          }),
        );
      } else {
        const seeded = createDefaultProfile(
          referredUid,
          safeReferredName,
          safeReferredHandle,
          nowMs,
          String(params.photoUrl || ''),
        ).profile;
        nextReferredCoins = seeded.coins + REFERRED_WELCOME_BONUS_COINS;
        tx.set(
          referredPlayerRef,
          toServerFirestorePlayerCreatePayload({
            ...seeded,
            referredBy: referrerUid,
            referralActivated: hasOwnedChicken,
            coins: nextReferredCoins,
          }),
        );
        if (!referredLbSnap.exists()) {
          tx.set(referredLbRef, {
            uid: referredUid,
            displayName: safeReferredName,
            handle: safeReferredHandle,
            photoUrl: String(params.photoUrl || '').slice(0, 512),
            avatarColor: seeded.avatarColor,
            referralCode: seeded.referralCode,
            buyerPoints: 0,
            inviterCount: 0,
            eggs: 0,
            totalEggsCollected: 0,
            chickensCount: 0,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Link immediately with status 'pending'; +150 coin referrer bonus unlocks on 1st hen (miner) purchase.
      // If user already owns a hen (e.g. delayed recovery), activate and award immediately.
      tx.set(referralDocRef, {
        referrerUid,
        referredUid,
        referredName: safeReferredName,
        referredHandle: safeReferredHandle,
        status: hasOwnedChicken ? 'active' : 'pending',
        coinsEarned: hasOwnedChicken ? rewardCoins : 0,
        toppedUpUsd: 0,
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });

      tx.set(doc(serverDb, 'players', referredUid, 'transactions', `tx_ref_join_${nowMs}`), {
        userId: referredUid,
        type: 'referral',
        title: `Joined via ${referrerName}'s referral`.slice(0, 80),
        amount: REFERRED_WELCOME_BONUS_COINS,
        currency: 'coins',
        usdValue: coinsToUsd(REFERRED_WELCOME_BONUS_COINS),
        status: 'completed',
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });

      if (hasOwnedChicken) {
        const rp = referrerSnap.data();
        const nextReferrerCoins = Math.max(-100_000_000, (Number(rp.coins ?? 0) || 0) + rewardCoins);
        const nextReferrerCount = Math.max(0, Math.floor(Number(rp.referralCount ?? 0))) + 1;
        const nextReferrerCoinsEarned = Math.max(0, Number(rp.referralCoinsEarned ?? 0)) + rewardCoins;
        referrerTotalReferrals = nextReferrerCount;
        referrerTotalCoinsEarned = nextReferrerCoinsEarned;
        const referrerFakeProfile = {
          leghornCount: Number(rp.leghornCount ?? 0),
          rhodeCount: Number(rp.rhodeCount ?? 0),
          orpingtonCount: Number(rp.orpingtonCount ?? 0),
          australorpCount: Number(rp.australorpCount ?? 0),
          totalEggsCollected: Number(rp.totalEggsCollected ?? 0),
          referralCount: nextReferrerCount,
        };
        const nextBuyerPoints = Math.max(0, calculateBuyerPoints(referrerFakeProfile as Parameters<typeof calculateBuyerPoints>[0]));
        const nextChickensCount = Math.max(0, calculateTotalChickens(referrerFakeProfile as Parameters<typeof calculateTotalChickens>[0]));

        tx.update(
          referrerPlayerRef,
          toServerFirestorePlayerUpdatePayload(rp, referrerUid, {
            coins: nextReferrerCoins,
            referralCount: nextReferrerCount,
            referralCoinsEarned: nextReferrerCoinsEarned,
          }),
        );

        if (referrerLbSnap.exists()) {
          tx.update(
            referrerLbRef,
            toServerFirestoreLeaderboardUpdatePayload(referrerLbSnap.data(), rp, referrerUid, {
              inviterCount: nextReferrerCount,
              buyerPoints: nextBuyerPoints,
              chickensCount: nextChickensCount,
            }),
          );
        } else {
          tx.set(referrerLbRef, {
            uid: referrerUid,
            displayName: String(rp.displayName || referrerName || 'Farmer').trim().slice(0, 60) || 'Farmer',
            handle: formatReferralHandle(String(rp.handle || ''), referrerUid).slice(0, 40) || '@farmer',
            photoUrl: String(rp.photoUrl || '').slice(0, 512),
            avatarColor: String(rp.avatarColor || '#EF4444').trim().length >= 4 ? String(rp.avatarColor).slice(0, 20) : '#EF4444',
            referralCode: String(rp.referralCode || referrerUid).slice(0, 32) || referrerUid.slice(0, 32),
            buyerPoints: nextBuyerPoints,
            inviterCount: nextReferrerCount,
            eggs: Math.max(0, Number(rp.eggs ?? 0)),
            totalEggsCollected: Math.max(0, Number(rp.totalEggsCollected ?? 0)),
            chickensCount: nextChickensCount,
            updatedAt: serverTimestamp(),
          });
        }

        const refTxId = `tx_ref_earned_${referredUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16)}_${nowMs}`.slice(0, 64);
        tx.set(doc(serverDb, 'players', referrerUid, 'transactions', refTxId), {
          userId: referrerUid,
          type: 'referral',
          title: `Referral reward (+${rewardCoins} coins): ${safeReferredName}`.slice(0, 80),
          amount: rewardCoins,
          currency: 'coins',
          usdValue: coinsToUsd(rewardCoins),
          status: 'completed',
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        });
      }
    });

    if (alreadyLinked) {
      const resolvedRef = existingReferrerUid || referrerUid;
      saveReferral(referredUid, resolvedRef);
      return {
        ok: true,
        applied: false,
        activated: existingReferralActivated,
        alreadyLinked: true,
        reason: 'already_linked',
        referrerUid: resolvedRef,
        nextReferredCoins,
      };
    }

    saveReferral(referredUid, referrerUid);

    let botDmSent = false;
    let botDmReason: string | undefined;
    if (activatedOnLink) {
      const dmResult = await sendReferrerJoinedBotDm({
        referrerUid,
        referredUid,
        referredName: safeReferredName,
        referredHandle: safeReferredHandle,
        rewardCoins,
        totalReferrals: referrerTotalReferrals,
        totalReferralCoins: referrerTotalCoinsEarned,
      });
      botDmSent = dmResult.sent;
      botDmReason = dmResult.reason;
    }

    recordServerLog(
      'info',
      'referral_apply',
      `Referral linked: ${referredUid} -> ${referrerUid} (${activatedOnLink ? `activated +${rewardCoins}c` : 'pending 1st hen'})`,
      activatedOnLink ? `botDmSent=${botDmSent}${botDmReason ? ` (${botDmReason})` : ''}` : undefined,
    );

    return {
      ok: true,
      applied: true,
      activated: activatedOnLink,
      alreadyLinked: false,
      referrerUid,
      referrerName,
      coinsRewarded: activatedOnLink ? rewardCoins : 0,
      referredCoinsAwarded: REFERRED_WELCOME_BONUS_COINS,
      referredBonusCoins: REFERRED_WELCOME_BONUS_COINS,
      nextReferredCoins,
      botDmSent,
      ...(botDmReason ? { botDmReason } : {}),
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'REFERRER_MISSING') {
      return { ok: true, applied: false, reason: 'invalid_code' };
    }
    recordServerLog(
      'error',
      'referral_apply',
      'Failed to apply referral transaction',
      err instanceof Error ? err.message : 'Unknown error',
    );
    return {
      ok: false,
      applied: false,
      reason: 'transaction_failed',
      statusCode: 500,
    };
  }
}

async function sendReferrerJoinedBotDm(params: {
  referrerUid: string;
  referredUid: string;
  referredName: string;
  referredHandle: string;
  rewardCoins: number;
  totalReferrals?: number;
  totalReferralCoins?: number;
}): Promise<{ sent: boolean; reason?: string }> {
  const numericReferrerId = extractTelegramNumericUserId(params.referrerUid);
  const activeBotToken = getTelegramBotToken();
  if (!activeBotToken) {
    return { sent: false, reason: 'TELEGRAM_BOT_TOKEN not configured on server' };
  }
  if (!numericReferrerId) {
    return { sent: false, reason: 'Referrer has no numeric Telegram chat ID' };
  }

  const dedupKey = `referral_joined:${params.referrerUid}:${params.referredUid}`;
  const prevSentAt = referralNotifyDedup.get(dedupKey);
  if (prevSentAt && Date.now() - prevSentAt < 60_000) {
    return { sent: false, reason: 'Duplicate notification suppressed' };
  }

  const messageText = buildReferralBotNotificationMessage({
    event: 'referral_joined',
    referredName: params.referredName,
    referredHandle: params.referredHandle,
    rewardCoins: params.rewardCoins,
    totalReferrals: params.totalReferrals,
    totalReferralCoins: params.totalReferralCoins,
  });
  const botUsername = getFastBotUsername();
  const friendsButton = buildDirectPrivateMiniAppButton(
    '👥 View Friends & Rewards',
    botUsername,
    'friends',
  );

  try {
    let tgRes = await fetch(
      `https://api.telegram.org/bot${activeBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: numericReferrerId,
          text: messageText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[friendsButton]],
          },
        }),
        signal: AbortSignal.timeout(7000),
      },
    );
    let tgData = (await tgRes.json()) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
    };
    if (!tgData.ok && tgData.error_code === 400 && String(tgData.description || '').toLowerCase().includes('parse')) {
      tgRes = await fetch(
        `https://api.telegram.org/bot${activeBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: numericReferrerId,
            text: messageText.replace(/<\/?[^>]+>/g, ''),
          }),
          signal: AbortSignal.timeout(7000),
        },
      );
      tgData = (await tgRes.json()) as typeof tgData;
    }
    if (tgData.ok) {
      if (referralNotifyDedup.size > 1000) referralNotifyDedup.clear();
      referralNotifyDedup.set(dedupKey, Date.now());
      void upsertBotSubscriber({
        chatId: numericReferrerId,
        source: 'miniapp',
        isBotBlocked: false,
      });
      return { sent: true };
    }
    if (tgData.error_code === 403) {
      void markBotSubscriberBlocked(numericReferrerId, true);
    }
    return {
      sent: false,
      reason: redactBotToken(tgData.description || 'Telegram API error'),
    };
  } catch (err) {
    return {
      sent: false,
      reason: redactBotToken(err instanceof Error ? err.message : 'Telegram request failed'),
    };
  }
}

async function activateReferralInServerDb(params: {
  referredUid: string;
  referrerUidHint?: string;
  referredName?: string;
  referredHandle?: string;
}): Promise<{
  ok: boolean;
  activated: boolean;
  alreadyActivated?: boolean;
  referrerUid?: string;
  coinsRewarded: number;
  botDmSent: boolean;
  botDmReason?: string;
}> {
  if (!serverDb || !isValidSafeId(params.referredUid)) {
    return { ok: false, activated: false, coinsRewarded: 0, botDmSent: false };
  }

  const referredUid = params.referredUid.trim();
  const referredPlayerRef = doc(serverDb, 'players', referredUid);
  const referredLbRef = doc(serverDb, 'leaderboard', referredUid);
  const rewardCoins = BONUS_PER_REFERRAL;
  const nowMs = Date.now();

  try {
    const preSnap = await getFreshDoc(referredPlayerRef);
    const mergedDisk = getMergedReferralsForUser(referredUid);
    const preReferrerUid = String(
      (preSnap.exists() ? preSnap.data()?.referredBy : '') ||
        params.referrerUidHint ||
        mergedDisk.referrer ||
        '',
    ).trim();

    if (!preReferrerUid || !isValidSafeId(preReferrerUid) || preReferrerUid === referredUid) {
      return { ok: true, activated: false, coinsRewarded: 0, botDmSent: false };
    }

    const referrerPlayerRef = doc(serverDb, 'players', preReferrerUid);
    const referrerLbRef = doc(serverDb, 'leaderboard', preReferrerUid);
    const refDocRef = doc(serverDb, 'players', preReferrerUid, 'referrals', referredUid);

    let activatedNow = false;
    let alreadyActivated = false;
    let totalReferrals = 0;
    let totalReferralCoins = 0;
    let safeReferredName = String(params.referredName || '').trim().slice(0, 60) || 'Farmer';
    let safeReferredHandle = formatReferralHandle(String(params.referredHandle || ''), referredUid).slice(0, 40);

    await runTransaction(serverDb, async (tx) => {
      const [referredSnap, referredLbSnap, referrerSnap, referrerLbSnap, refSnap] = await Promise.all([
        tx.get(referredPlayerRef),
        tx.get(referredLbRef),
        tx.get(referrerPlayerRef),
        tx.get(referrerLbRef),
        tx.get(refDocRef),
      ]);

      if (!referrerSnap.exists()) return;

      const rd = referredSnap.exists() ? referredSnap.data() : undefined;
      if (rd) {
        safeReferredName =
          String(rd.displayName || params.referredName || 'Farmer').trim().slice(0, 60) || 'Farmer';
        safeReferredHandle = formatReferralHandle(
          String(rd.handle || params.referredHandle || ''),
          referredUid,
        ).slice(0, 40);
      }

      const rp = referrerSnap.data();
      totalReferrals = Math.max(0, Math.floor(Number(rp.referralCount ?? 0)));
      totalReferralCoins = Math.max(0, Number(rp.referralCoinsEarned ?? 0));

      const refStatus = refSnap.exists() ? String(refSnap.data()?.status || '') : '';
      if (refSnap.exists() && refStatus === 'active') {
        alreadyActivated = true;
        if (rd && !rd.referralActivated) {
          tx.update(
            referredPlayerRef,
            toServerFirestorePlayerUpdatePayload(rd, referredUid, {
              referredBy: String(rd.referredBy || preReferrerUid),
              referralActivated: true,
            }),
          );
        }
        return;
      }

      const ownedChickens = rd
        ? Number(rd.leghornCount ?? 0) +
          Number(rd.rhodeCount ?? 0) +
          Number(rd.orpingtonCount ?? 0) +
          Number(rd.australorpCount ?? 0)
        : 0;
      if (rd && ownedChickens <= 0) {
        return;
      }

      activatedNow = true;
      const nextReferrerCoins = Math.max(-100_000_000, (Number(rp.coins ?? 0) || 0) + rewardCoins);
      const nextReferrerCount = totalReferrals + 1;
      const nextReferrerCoinsEarned = totalReferralCoins + rewardCoins;
      totalReferrals = nextReferrerCount;
      totalReferralCoins = nextReferrerCoinsEarned;

      if (rd && (!rd.referralActivated || !rd.referredBy)) {
        tx.update(
          referredPlayerRef,
          toServerFirestorePlayerUpdatePayload(rd, referredUid, {
            referredBy: String(rd.referredBy || preReferrerUid),
            referralActivated: true,
          }),
        );
        if (referredLbSnap.exists()) {
          const fakeRef = {
            leghornCount: Number(rd.leghornCount ?? 0),
            rhodeCount: Number(rd.rhodeCount ?? 0),
            orpingtonCount: Number(rd.orpingtonCount ?? 0),
            australorpCount: Number(rd.australorpCount ?? 0),
            totalEggsCollected: Number(rd.totalEggsCollected ?? 0),
            referralCount: Number(rd.referralCount ?? 0),
          };
          tx.update(
            referredLbRef,
            toServerFirestoreLeaderboardUpdatePayload(referredLbSnap.data(), rd, referredUid, {
              inviterCount: Math.max(0, Math.floor(Number(rd.referralCount ?? 0))),
              buyerPoints: Math.max(0, calculateBuyerPoints(fakeRef as Parameters<typeof calculateBuyerPoints>[0])),
              chickensCount: Math.max(0, calculateTotalChickens(fakeRef as Parameters<typeof calculateTotalChickens>[0])),
            }),
          );
        }
      }

      if (refSnap.exists()) {
        tx.update(refDocRef, {
          status: 'active',
          coinsEarned: Number(refSnap.data()?.coinsEarned ?? 0) + rewardCoins,
        });
      } else {
        tx.set(refDocRef, {
          referrerUid: preReferrerUid,
          referredUid,
          referredName: safeReferredName,
          referredHandle: safeReferredHandle,
          status: 'active',
          coinsEarned: rewardCoins,
          toppedUpUsd: 0,
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        });
      }

      const referrerFakeProfile = {
        leghornCount: Number(rp.leghornCount ?? 0),
        rhodeCount: Number(rp.rhodeCount ?? 0),
        orpingtonCount: Number(rp.orpingtonCount ?? 0),
        australorpCount: Number(rp.australorpCount ?? 0),
        totalEggsCollected: Number(rp.totalEggsCollected ?? 0),
        referralCount: nextReferrerCount,
      };
      const nextBuyerPoints = Math.max(0, calculateBuyerPoints(referrerFakeProfile as Parameters<typeof calculateBuyerPoints>[0]));
      const nextChickensCount = Math.max(0, calculateTotalChickens(referrerFakeProfile as Parameters<typeof calculateTotalChickens>[0]));

      tx.update(
        referrerPlayerRef,
        toServerFirestorePlayerUpdatePayload(rp, preReferrerUid, {
          coins: nextReferrerCoins,
          referralCount: nextReferrerCount,
          referralCoinsEarned: nextReferrerCoinsEarned,
        }),
      );

      if (referrerLbSnap.exists()) {
        tx.update(
          referrerLbRef,
          toServerFirestoreLeaderboardUpdatePayload(referrerLbSnap.data(), rp, preReferrerUid, {
            inviterCount: nextReferrerCount,
            buyerPoints: nextBuyerPoints,
            chickensCount: nextChickensCount,
          }),
        );
      } else {
        tx.set(referrerLbRef, {
          uid: preReferrerUid,
          displayName: String(rp.displayName || 'Farmer').trim().slice(0, 60) || 'Farmer',
          handle: formatReferralHandle(String(rp.handle || ''), preReferrerUid).slice(0, 40) || '@farmer',
          photoUrl: String(rp.photoUrl || '').slice(0, 512),
          avatarColor: String(rp.avatarColor || '#EF4444').trim().length >= 4 ? String(rp.avatarColor).slice(0, 20) : '#EF4444',
          referralCode: String(rp.referralCode || preReferrerUid).slice(0, 32) || preReferrerUid.slice(0, 32),
          buyerPoints: nextBuyerPoints,
          inviterCount: nextReferrerCount,
          eggs: Math.max(0, Number(rp.eggs ?? 0)),
          totalEggsCollected: Math.max(0, Number(rp.totalEggsCollected ?? 0)),
          chickensCount: nextChickensCount,
          updatedAt: serverTimestamp(),
        });
      }

      const refTxId = `tx_ref_earned_${referredUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16)}_${nowMs}`.slice(0, 64);
      tx.set(doc(serverDb, 'players', preReferrerUid, 'transactions', refTxId), {
        userId: preReferrerUid,
        type: 'referral',
        title: `Referral reward (+${rewardCoins} coins): ${safeReferredName}`.slice(0, 80),
        amount: rewardCoins,
        currency: 'coins',
        usdValue: coinsToUsd(rewardCoins),
        status: 'completed',
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });
    });

    let botDmSent = false;
    let botDmReason: string | undefined;
    if (activatedNow || alreadyActivated) {
      const dm = await sendReferrerJoinedBotDm({
        referrerUid: preReferrerUid,
        referredUid,
        referredName: safeReferredName,
        referredHandle: safeReferredHandle,
        rewardCoins,
        totalReferrals,
        totalReferralCoins,
      });
      botDmSent = dm.sent;
      botDmReason = dm.reason;
    }

    return {
      ok: true,
      activated: activatedNow,
      alreadyActivated,
      referrerUid: preReferrerUid,
      coinsRewarded: activatedNow ? rewardCoins : 0,
      botDmSent,
      ...(botDmReason ? { botDmReason } : {}),
    };
  } catch {
    return { ok: false, activated: false, coinsRewarded: 0, botDmSent: false };
  }
}

async function ensurePlayerInServerDb(tgUser: {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}): Promise<{ uid: string; playerData: Record<string, unknown> } | null> {
  const numericId = extractTelegramNumericUserId(String(tgUser.id || ''));
  if (!numericId) return null;
  const uid = `tg_${numericId}`;
  const fullName = [String(tgUser.first_name || '').trim(), String(tgUser.last_name || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  const displayName =
    fullName.slice(0, 60) ||
    (tgUser.username ? `@${String(tgUser.username).replace(/^@+/, '').slice(0, 50)}` : `Farmer ${numericId.slice(-4)}`);
  const handle = formatReferralHandle(
    tgUser.username ? `@${String(tgUser.username).replace(/^@+/, '')}` : '',
    uid,
  ).slice(0, 40);
  const photoUrl = String(tgUser.photo_url || '').slice(0, 512);

  void upsertBotSubscriber({
    chatId: numericId,
    username: tgUser.username || '',
    firstName: tgUser.first_name || displayName,
    source: 'miniapp',
  });

  if (!serverDb) {
    return {
      uid,
      playerData: {
        uid,
        displayName,
        handle,
        photoUrl,
        referralCount: 0,
        referralCoinsEarned: 0,
        referredBy: '',
      },
    };
  }

  try {
    const playerRef = doc(serverDb, 'players', uid);
    const lbRef = doc(serverDb, 'leaderboard', uid);
    const snap = await getFreshDoc(playerRef);
    const nowMs = Date.now();
    if (!snap.exists()) {
      const seeded = createDefaultProfile(uid, displayName, handle, nowMs, photoUrl).profile;
      const createPayload = toServerFirestorePlayerCreatePayload(seeded);
      await setDoc(playerRef, createPayload);
      const lbSnap = await getFreshDoc(lbRef);
      if (!lbSnap.exists()) {
        await setDoc(lbRef, {
          uid,
          displayName,
          handle,
          photoUrl,
          avatarColor: seeded.avatarColor,
          referralCode: seeded.referralCode,
          buyerPoints: 0,
          inviterCount: 0,
          eggs: 0,
          totalEggsCollected: 0,
          chickensCount: 0,
          updatedAt: serverTimestamp(),
        });
      }
      return { uid, playerData: createPayload as unknown as Record<string, unknown> };
    }
    const existing = snap.data() as Record<string, unknown>;
    const needsProfileSync =
      (displayName && existing.displayName !== displayName) ||
      (tgUser.username && existing.handle !== handle) ||
      (photoUrl && !existing.photoUrl);
    if (needsProfileSync) {
      const nextPayload = toServerFirestorePlayerUpdatePayload(
        {
          ...existing,
          displayName: displayName || existing.displayName,
          handle: tgUser.username ? handle : existing.handle,
          photoUrl: photoUrl || existing.photoUrl,
        },
        uid,
      );
      await updateDoc(playerRef, nextPayload);
      return { uid, playerData: { ...existing, ...nextPayload } };
    }
    return { uid, playerData: existing };
  } catch (err) {
    recordServerLog(
      'warn',
      'ensure_player',
      `Failed to sync player ${uid}`,
      err instanceof Error ? err.message : 'Firestore error',
    );
    return {
      uid,
      playerData: {
        uid,
        displayName,
        handle,
        photoUrl,
        referralCount: 0,
        referralCoinsEarned: 0,
        referredBy: '',
      },
    };
  }
}

function resolveTelegramUserFromRequest(
  req: express.Request,
  body?: { initData?: string; token?: string },
): {
  valid: boolean;
  playerId?: string;
  user?: {
    id: number | string;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  error?: string;
} {
  const activeBotToken = getTelegramBotToken();
  const headerInit = String(req.headers['x-telegram-init-data'] || '').trim();
  const bodyInit = String(body?.initData || '').trim();
  const queryInit = typeof req.query.initData === 'string' ? req.query.initData.trim() : '';
  const rawInitData = headerInit || bodyInit || queryInit;

  if (rawInitData) {
    const check = verifyTelegramInitData(rawInitData, activeBotToken);
    if (check.valid && check.playerId && check.user?.id) {
      return {
        valid: true,
        playerId: check.playerId,
        user: check.user as {
          id: number | string;
          first_name?: string;
          last_name?: string;
          username?: string;
          photo_url?: string;
        },
      };
    }
    return {
      valid: false,
      error: check.reason || 'Invalid Telegram initData',
    };
  }

  const verifiedActor = resolveVerifiedPlayerActor({
    req,
    token: body?.token || (typeof req.query.token === 'string' ? req.query.token : undefined),
  });
  const numericId = verifiedActor ? extractTelegramNumericUserId(verifiedActor) : null;
  if (verifiedActor && numericId) {
    return {
      valid: true,
      playerId: verifiedActor,
      user: { id: Number(numericId) || numericId },
    };
  }

  return {
    valid: false,
    error: 'Missing or invalid Telegram initData',
  };
}

const BOT_SUBSCRIBERS_FILE = path.resolve(__dirname, '.data', 'bot_subscribers.json');
const TELEGRAM_OFFSET_FILE = path.resolve(__dirname, '.data', 'telegram_update_offset.txt');
const PAYOUT_TEMPLATE_FILE = path.resolve(__dirname, '.data', 'payout_template.json');
const PENDING_REFERRALS_FILE = path.resolve(__dirname, '.data', 'pending_referrals.json');

export interface PendingReferralRecord {
  chatId: string;
  refCode: string;
  displayName: string;
  handle: string;
  createdAtMs: number;
}

const pendingReferralMap = new Map<string, PendingReferralRecord>();

function loadPendingReferralsFromDisk(): void {
  try {
    if (!fs.existsSync(PENDING_REFERRALS_FILE)) return;
    const raw = fs.readFileSync(PENDING_REFERRALS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const chatId = extractTelegramNumericUserId(String(item.chatId || ''));
      const refCode = String(item.refCode || '').trim().slice(0, 64);
      if (!chatId || !refCode) continue;
      pendingReferralMap.set(chatId, {
        chatId,
        refCode,
        displayName: String(item.displayName || 'Farmer').slice(0, 60),
        handle: String(item.handle || `@tg_${chatId}`).slice(0, 40),
        createdAtMs: Math.max(0, Number(item.createdAtMs) || Date.now()),
      });
    }
  } catch {
    // Non-fatal
  }
}

function persistPendingReferralsToDisk(): void {
  try {
    const dir = path.dirname(PENDING_REFERRALS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const items = Array.from(pendingReferralMap.values()).slice(-2000);
    fs.writeFileSync(PENDING_REFERRALS_FILE, JSON.stringify(items), 'utf8');
  } catch {
    // Non-fatal
  }
}

function savePendingReferral(rec: PendingReferralRecord): void {
  pendingReferralMap.set(rec.chatId, rec);
  persistPendingReferralsToDisk();
}

function deletePendingReferral(chatId: string): void {
  if (pendingReferralMap.delete(chatId)) {
    persistPendingReferralsToDisk();
  }
}

loadPendingReferralsFromDisk();

export interface BotSubscriberRecord {
  chatId: string;
  username: string;
  firstName: string;
  source: 'bot_start' | 'bot_message' | 'miniapp';
  isBotBlocked: boolean;
  joinedAtMs: number;
  lastSeenAtMs: number;
}

const botSubscriberMap = new Map<string, BotSubscriberRecord>();
let cachedTelegramUpdateOffset = 0;

function loadBotSubscribersFromDisk(): void {
  try {
    if (fs.existsSync(BOT_SUBSCRIBERS_FILE)) {
      const raw = fs.readFileSync(BOT_SUBSCRIBERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            const chatId = extractTelegramNumericUserId(String(item.chatId || ''));
            if (chatId && isValidSafeId(chatId)) {
              const src =
                item.source === 'bot_start' || item.source === 'bot_message'
                  ? item.source
                  : 'miniapp';
              botSubscriberMap.set(chatId, {
                chatId,
                username: String(item.username || '').slice(0, 40),
                firstName: String(item.firstName || '').slice(0, 60),
                source: src,
                isBotBlocked: Boolean(item.isBotBlocked),
                joinedAtMs: Math.max(0, Number(item.joinedAtMs) || Date.now()),
                lastSeenAtMs: Math.max(0, Number(item.lastSeenAtMs) || Date.now()),
              });
            }
          }
        }
      }
    }
    if (fs.existsSync(TELEGRAM_OFFSET_FILE)) {
      const off = Number(fs.readFileSync(TELEGRAM_OFFSET_FILE, 'utf8').trim());
      if (Number.isFinite(off) && off > 0) {
        cachedTelegramUpdateOffset = Math.floor(off);
      }
    }
  } catch {
    // Non-fatal
  }
}

function persistBotSubscribersToDisk(): void {
  try {
    const dir = path.dirname(BOT_SUBSCRIBERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const items = Array.from(botSubscriberMap.values()).slice(-10_000);
    fs.writeFileSync(BOT_SUBSCRIBERS_FILE, JSON.stringify(items), 'utf8');
  } catch {
    // Non-fatal on read-only containers
  }
}

function persistTelegramUpdateOffset(nextOffset: number): void {
  cachedTelegramUpdateOffset = nextOffset;
  try {
    const dir = path.dirname(TELEGRAM_OFFSET_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TELEGRAM_OFFSET_FILE, String(nextOffset), 'utf8');
  } catch {
    // Non-fatal
  }
}

loadBotSubscribersFromDisk();

async function upsertBotSubscriber(params: {
  chatId: string;
  username?: string;
  firstName?: string;
  source?: 'bot_start' | 'bot_message' | 'miniapp';
  isBotBlocked?: boolean;
}): Promise<BotSubscriberRecord | null> {
  const cleanChatId = extractTelegramNumericUserId(params.chatId);
  if (!cleanChatId || !isValidSafeId(cleanChatId) || cleanChatId.length > 32) {
    return null;
  }
  const now = Date.now();
  const prev = botSubscriberMap.get(cleanChatId);
  const nextSource =
    params.source === 'bot_start' || params.source === 'bot_message'
      ? params.source
      : prev?.source || 'miniapp';
  const next: BotSubscriberRecord = {
    chatId: cleanChatId,
    username: String(params.username ?? prev?.username ?? '').replace(/^@+/, '').slice(0, 40),
    firstName: String(params.firstName ?? prev?.firstName ?? '').slice(0, 60),
    source: nextSource,
    isBotBlocked:
      typeof params.isBotBlocked === 'boolean'
        ? params.isBotBlocked
        : Boolean(prev?.isBotBlocked),
    joinedAtMs: prev?.joinedAtMs || now,
    lastSeenAtMs: now,
  };
  botSubscriberMap.set(cleanChatId, next);
  persistBotSubscribersToDisk();

  if (serverDb) {
    try {
      await setDoc(doc(serverDb, 'bot_subscribers', cleanChatId), {
        chatId: next.chatId,
        username: next.username,
        firstName: next.firstName,
        source: next.source,
        isBotBlocked: next.isBotBlocked,
        joinedAtMs: next.joinedAtMs,
        lastSeenAtMs: next.lastSeenAtMs,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Disk record already saved
    }
  }
  return next;
}

async function markBotSubscriberBlocked(chatId: string, blocked: boolean): Promise<void> {
  const clean = extractTelegramNumericUserId(chatId);
  if (!clean) return;
  const existing = botSubscriberMap.get(clean);
  if (!existing && !blocked) return;
  await upsertBotSubscriber({
    chatId: clean,
    isBotBlocked: blocked,
  });
}

function loadWithdrawApproveTemplateFromDisk(): WithdrawApproveMessageTemplate | null {
  try {
    if (!fs.existsSync(PAYOUT_TEMPLATE_FILE)) return null;
    const raw = fs.readFileSync(PAYOUT_TEMPLATE_FILE, 'utf8');
    const d = JSON.parse(raw) as Partial<WithdrawApproveMessageTemplate>;
    if (!d || typeof d.messageTemplate !== 'string' || !d.messageTemplate.trim()) return null;
    return {
      messageTemplate: d.messageTemplate.slice(0, 1500),
      buttonText: String(d.buttonText ?? DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonText).slice(0, 48),
      buttonUrlTemplate:
        String(d.buttonUrlTemplate || DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate).slice(0, 256),
      updatedAtMs: Math.max(0, Number(d.updatedAtMs ?? 0)),
    };
  } catch {
    return null;
  }
}

function persistWithdrawApproveTemplateToDisk(template: WithdrawApproveMessageTemplate): void {
  try {
    const dir = path.dirname(PAYOUT_TEMPLATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PAYOUT_TEMPLATE_FILE, JSON.stringify(template), 'utf8');
  } catch {
    // Non-fatal
  }
}

async function loadWithdrawApproveTemplate(): Promise<WithdrawApproveMessageTemplate> {
  const disk = loadWithdrawApproveTemplateFromDisk();
  if (!serverDb) return disk || DEFAULT_WITHDRAW_APPROVE_TEMPLATE;
  try {
    const snap = await getFreshDoc(doc(serverDb, 'app_config', 'payout_template'));
    if (!snap.exists()) return disk || DEFAULT_WITHDRAW_APPROVE_TEMPLATE;
    const d = snap.data();
    const remote: WithdrawApproveMessageTemplate = {
      messageTemplate:
        typeof d.messageTemplate === 'string' && d.messageTemplate.trim()
          ? d.messageTemplate.slice(0, 1500)
          : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate,
      buttonText:
        typeof d.buttonText === 'string'
          ? d.buttonText.slice(0, 48)
          : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonText,
      buttonUrlTemplate:
        typeof d.buttonUrlTemplate === 'string' && d.buttonUrlTemplate.trim()
          ? d.buttonUrlTemplate.trim().slice(0, 256)
          : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate,
      updatedAtMs: Math.max(0, Number(d.updatedAtMs ?? 0)),
    };
    if (disk && disk.updatedAtMs > remote.updatedAtMs) {
      return disk;
    }
    return remote;
  } catch {
    return disk || DEFAULT_WITHDRAW_APPROVE_TEMPLATE;
  }
}

async function saveWithdrawApproveTemplateServer(
  input: Omit<WithdrawApproveMessageTemplate, 'updatedAtMs'>,
): Promise<WithdrawApproveMessageTemplate> {
  const nowMs = Date.now();
  const template: WithdrawApproveMessageTemplate = {
    messageTemplate:
      String(input.messageTemplate || '').trim().slice(0, 1500) ||
      DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate,
    buttonText: String(input.buttonText ?? '').trim().slice(0, 48),
    buttonUrlTemplate:
      String(input.buttonUrlTemplate || '').trim().slice(0, 256) ||
      DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate,
    updatedAtMs: nowMs,
  };
  persistWithdrawApproveTemplateToDisk(template);
  if (serverDb) {
    try {
      await setDoc(doc(serverDb, 'app_config', 'payout_template'), {
        ...template,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      recordServerLog(
        'warn',
        'payout_template',
        'Saved payout template to server disk (Firestore write failed)',
        err instanceof Error ? err.message : 'Firestore write error',
      );
    }
  }
  return template;
}

interface TelegramUpdatePayload {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number | string; type?: string };
    from?: { id?: number | string; is_bot?: boolean; username?: string; first_name?: string };
  };
  my_chat_member?: {
    chat?: { id?: number | string; type?: string };
    from?: { id?: number | string; username?: string; first_name?: string };
    new_chat_member?: { status?: string };
  };
}

function getFastBotUsername(): string {
  return (
    runtimeBotConfig?.botUsername ||
    TELEGRAM_BOT_USERNAME_ENV ||
    cachedBotUsername ||
    DEFAULT_TELEGRAM_BOT_USERNAME
  );
}

function buildStartWelcomeText(params: {
  greetName: string;
  referralStatusLine?: string;
}): string {
  const refSection = params.referralStatusLine ? `\n\n${params.referralStatusLine}` : '';
  return [
    `🐔 <b>Welcome to Alpha Gram, ${params.greetName}!</b>`,
    '',
    '🐣 <b>Starter Pack:</b> <b>+1,000 Coins</b> ready to hatch your first hens',
    '🥚 <b>24/7 Mining:</b> Collect eggs hourly &amp; charge <b>3× Coop Fever</b>',
    `👥 <b>Invite &amp; Earn:</b> <b>+${BONUS_PER_REFERRAL} Coins</b> per friend + <b>5%</b> deposit &amp; egg share`,
    '💎 <b>TON Payouts:</b> Swap eggs directly for <b>GRAM</b> on TON',
    refSection,
    '👇 Tap below to open your farm &amp; start earning!',
  ].join('\n');
}

async function processTelegramUpdate(update: TelegramUpdatePayload): Promise<boolean> {
  if (!update || typeof update !== 'object') return false;
  let captured = false;

  const msg = update.message;
  if (msg && msg.from && !msg.from.is_bot && msg.chat?.type === 'private') {
    const rawChatId = String(msg.chat.id ?? msg.from.id ?? '');
    const numericChatId = extractTelegramNumericUserId(rawChatId);
    const text = String(msg.text || '').trim();
    const startMatch = text.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+([^\s]+))?/i);
    const isStart = Boolean(startMatch);
    let rawStartArg = String(startMatch?.[1] || '').trim();
    try {
      rawStartArg = decodeURIComponent(rawStartArg);
    } catch {
      // Ignore malformed URI components
    }
    const startPayload = rawStartArg.replace(/^(?:ref|r)_/i, '').trim();
    const hasStartRef = Boolean(isStart && startPayload.length >= 3 && numericChatId);
    const botToken = getTelegramBotToken();
    const botUsername = getFastBotUsername();
    if (isStart && botToken && !cachedBotMenuWebAppUrl) {
      await refreshBotMenuWebAppUrl(botToken);
    }
    const greetName = escapeHtml(
      String(msg.from.first_name || msg.from.username || 'Farmer').trim().slice(0, 50) || 'Farmer',
    );
    const replyMarkup = {
      inline_keyboard: [
        [
          buildDirectPrivateMiniAppButton(
            '🐔 Open Alpha Gram Farm',
            botUsername,
            startPayload || undefined,
          ),
        ],
        [
          buildDirectPrivateMiniAppButton(
            `👥 Invite & Earn +${BONUS_PER_REFERRAL} Coins`,
            botUsername,
            'friends',
          ),
        ],
      ],
    };

    // Send /start welcome reply IMMEDIATELY without blocking on Firestore I/O
    const sentMessagePromise: Promise<number | null> =
      isStart && botToken && numericChatId
        ? fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: numericChatId,
              text: buildStartWelcomeText({
                greetName,
                referralStatusLine: hasStartRef
                  ? `🎁 <i>Checking invite link &amp; crediting +${REFERRED_WELCOME_BONUS_COINS} Welcome Coins...</i>`
                  : undefined,
              }),
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            }),
            signal: AbortSignal.timeout(6000),
          })
            .then(async (res) => {
              const data = (await res.json().catch(() => null)) as {
                ok?: boolean;
                result?: { message_id?: number };
              } | null;
              return data?.ok && typeof data.result?.message_id === 'number'
                ? data.result.message_id
                : null;
            })
            .catch(() => null)
        : Promise.resolve(null);

    const subscriberPromise = upsertBotSubscriber({
      chatId: rawChatId,
      username: msg.from.username,
      firstName: msg.from.first_name,
      source: isStart ? 'bot_start' : 'bot_message',
      isBotBlocked: false,
    });

    if (hasStartRef && numericChatId) {
      const tgDisplayName =
        String(msg.from.first_name || msg.from.username || `Farmer ${numericChatId.slice(-4)}`)
          .trim()
          .slice(0, 60) || 'Farmer';
      const tgHandle = msg.from.username
        ? `@${msg.from.username.replace(/^@+/, '')}`
        : `@tg_${numericChatId}`;

      savePendingReferral({
        chatId: numericChatId,
        refCode: startPayload,
        displayName: tgDisplayName,
        handle: tgHandle,
        createdAtMs: Date.now(),
      });

      const [saved, sentMsgId, refResult] = await Promise.all([
        subscriberPromise,
        sentMessagePromise,
        applyReferralInServerDb({
          referredUid: `tg_${numericChatId}`,
          refCode: startPayload,
          displayName: tgDisplayName,
          handle: tgHandle,
        }),
      ]);
      if (saved) captured = true;

      let updatedRefStatus = '';
      if (refResult.ok && refResult.applied) {
        deletePendingReferral(numericChatId);
        updatedRefStatus = refResult.activated
          ? `🎁 <b>Referral Applied!</b> Joined via <b>${escapeHtml(
              refResult.referrerName || 'your friend',
            )}</b> — <b>+${REFERRED_WELCOME_BONUS_COINS} Welcome Coins</b> credited to your farm!`
          : `🎁 <b>Referral Linked!</b> Joined via <b>${escapeHtml(
              refResult.referrerName || 'your friend',
            )}</b> — <b>+${REFERRED_WELCOME_BONUS_COINS} Welcome Coins</b> credited! Buy your first hen in the Mini App to unlock their <b>+${BONUS_PER_REFERRAL} Coin</b> bonus.`;
      } else if (
        refResult.ok &&
        (refResult.reason === 'already_linked' ||
          refResult.reason === 'self_referral' ||
          refResult.reason === 'invalid_code')
      ) {
        deletePendingReferral(numericChatId);
      }

      if (botToken && sentMsgId) {
        void fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: numericChatId,
            message_id: sentMsgId,
            text: buildStartWelcomeText({
              greetName,
              referralStatusLine: updatedRefStatus || undefined,
            }),
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => undefined);
      }
    } else {
      const [saved] = await Promise.all([subscriberPromise, sentMessagePromise]);
      if (saved) captured = true;
    }

    if (isStart && botToken && numericChatId && !cachedBotUsername) {
      void resolveTelegramBotUsername();
    }
  }

  const memberEvt = update.my_chat_member;
  if (memberEvt && memberEvt.chat?.type === 'private' && memberEvt.from) {
    const rawChatId = String(memberEvt.chat.id ?? memberEvt.from.id ?? '');
    const status = String(memberEvt.new_chat_member?.status || '').toLowerCase();
    const blocked = status === 'kicked' || status === 'left';
    const saved = await upsertBotSubscriber({
      chatId: rawChatId,
      username: memberEvt.from.username,
      firstName: memberEvt.from.first_name,
      source: 'bot_message',
      isBotBlocked: blocked,
    });
    if (saved) captured = true;
  }

  return captured;
}

let lastLoggedActiveWebhookUrl = '';
let lastWebhookCheckAtMs = 0;
let cachedExternalWebhookUrl = '';
let botPollInFlight = false;
async function pollTelegramBotUpdates(longPollSeconds = 0): Promise<{
  ok: boolean;
  webhookActive: boolean;
  newUpdates: number;
  error?: string;
}> {
  const botToken = getTelegramBotToken();
  if (!botToken) {
    return { ok: false, webhookActive: false, newUpdates: 0, error: 'Bot token not configured' };
  }
  if (botPollInFlight) {
    return { ok: true, webhookActive: Boolean(cachedExternalWebhookUrl), newUpdates: 0 };
  }
  botPollInFlight = true;
  try {
    const now = Date.now();
    // Only check getWebhookInfo once every 60s (or before initial poll) to eliminate per-cycle latency
    if (lastWebhookCheckAtMs === 0 || now - lastWebhookCheckAtMs >= 60_000) {
      lastWebhookCheckAtMs = now;
      const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (infoRes && infoRes.ok) {
        const infoData = (await infoRes.json().catch(() => ({}))) as {
          ok?: boolean;
          result?: { url?: string };
        };
        cachedExternalWebhookUrl = infoData.ok ? String(infoData.result?.url || '') : '';
      }
    }

    if (cachedExternalWebhookUrl) {
      if (lastLoggedActiveWebhookUrl !== cachedExternalWebhookUrl) {
        lastLoggedActiveWebhookUrl = cachedExternalWebhookUrl;
        recordServerLog(
          'warn',
          'bot_poller',
          'External Telegram webhook is active; /start getUpdates polling is paused',
          cachedExternalWebhookUrl,
        );
      }
      botHeartbeatState.lastHeartbeatAtMs = Date.now();
      botHeartbeatState.lastHeartbeatOk = true;
      botHeartbeatState.webhookUrl = cachedExternalWebhookUrl;
      botHeartbeatState.error = null;
      return { ok: true, webhookActive: true, newUpdates: 0 };
    }
    lastLoggedActiveWebhookUrl = '';

    const safeWaitSec = Math.max(0, Math.min(25, Math.floor(longPollSeconds)));
    const params = new URLSearchParams({
      limit: '100',
      timeout: String(safeWaitSec),
      allowed_updates: JSON.stringify(['message', 'my_chat_member']),
    });
    if (cachedTelegramUpdateOffset > 0) {
      params.set('offset', String(cachedTelegramUpdateOffset));
    }
    const updRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?${params.toString()}`,
      { signal: AbortSignal.timeout((safeWaitSec + 8) * 1000) },
    );
    const updData = (await updRes.json()) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
      result?: TelegramUpdatePayload[];
    };
    if (!updData.ok || !Array.isArray(updData.result)) {
      if (updData.error_code === 409) {
        lastWebhookCheckAtMs = 0; // Force refresh getWebhookInfo next cycle
      }
      const errMsg = redactBotToken(updData.description || 'Failed to poll updates');
      botHeartbeatState.lastHeartbeatAtMs = Date.now();
      botHeartbeatState.lastHeartbeatOk = false;
      botHeartbeatState.error = errMsg;
      recordServerLog('warn', 'bot_poller', 'Telegram getUpdates returned error', errMsg);
      return {
        ok: false,
        webhookActive: false,
        newUpdates: 0,
        error: errMsg,
      };
    }

    let highestId = cachedTelegramUpdateOffset - 1;
    for (const u of updData.result) {
      if (typeof u.update_id === 'number' && u.update_id > highestId) {
        highestId = u.update_id;
      }
    }
    if (highestId >= cachedTelegramUpdateOffset) {
      persistTelegramUpdateOffset(highestId + 1);
    }

    let newUpdates = 0;
    if (updData.result.length > 0) {
      const processedFlags = await Promise.all(
        updData.result.map((u) => processTelegramUpdate(u).catch(() => false)),
      );
      newUpdates = processedFlags.filter(Boolean).length;
    }

    botHeartbeatState.lastHeartbeatAtMs = Date.now();
    botHeartbeatState.lastHeartbeatOk = true;
    botHeartbeatState.error = null;
    if (newUpdates > 0) {
      recordServerLog('info', 'bot_poller', `Processed ${newUpdates} new Telegram bot update(s)`);
    }
    return { ok: true, webhookActive: false, newUpdates };
  } catch (err) {
    const errMsg = redactBotToken(err instanceof Error ? err.message : 'Poll failed');
    botHeartbeatState.lastHeartbeatAtMs = Date.now();
    botHeartbeatState.lastHeartbeatOk = false;
    botHeartbeatState.error = errMsg;
    recordServerLog('warn', 'bot_poller', 'Telegram update poll failed', errMsg);
    return {
      ok: false,
      webhookActive: false,
      newUpdates: 0,
      error: errMsg,
    };
  } finally {
    botPollInFlight = false;
  }
}

async function collectBroadcastAudienceDetails(excludeBanned: boolean): Promise<{
  recipients: string[];
  botSubscriberCount: number;
  blockedBotCount: number;
  playerRecipientCount: number;
}> {
  const uniqueChatIds = new Set<string>();
  const bannedSet = new Set<string>();
  const blockedByBotSet = new Set<string>();
  const activeBotSet = new Set<string>();
  const playerSet = new Set<string>();

  for (const sub of botSubscriberMap.values()) {
    if (sub.isBotBlocked) {
      blockedByBotSet.add(sub.chatId);
    } else {
      activeBotSet.add(sub.chatId);
      uniqueChatIds.add(sub.chatId);
    }
  }

  for (const rec of reminderStore.values()) {
    const clean = extractTelegramNumericUserId(rec.telegramChatId);
    if (clean) {
      uniqueChatIds.add(clean);
    }
  }

  if (serverDb) {
    if (excludeBanned) {
      try {
        let lastBanDoc: QueryDocumentSnapshot<DocumentData> | null = null;
        for (let page = 0; page < 25; page += 1) {
          const banQuery: Query<DocumentData> = lastBanDoc
            ? query(collection(serverDb, 'banned_users'), orderBy('bannedAtMs', 'desc'), startAfter(lastBanDoc), limit(100))
            : query(collection(serverDb, 'banned_users'), orderBy('bannedAtMs', 'desc'), limit(100));
          const banSnap: QuerySnapshot<DocumentData> = await getDocs(banQuery);
          if (banSnap.empty) break;
          for (const d of banSnap.docs) {
            const uid = String(d.data()?.uid || d.id || '').trim();
            const num = extractTelegramNumericUserId(uid);
            if (num) bannedSet.add(num);
          }
          if (banSnap.docs.length < 100) break;
          lastBanDoc = banSnap.docs[banSnap.docs.length - 1];
        }
      } catch {
        // Non-fatal
      }
    }

    try {
      let lastSubDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      for (let page = 0; page < 40; page += 1) {
        const subQuery: Query<DocumentData> = lastSubDoc
          ? query(collection(serverDb, 'bot_subscribers'), orderBy('lastSeenAtMs', 'desc'), startAfter(lastSubDoc), limit(100))
          : query(collection(serverDb, 'bot_subscribers'), orderBy('lastSeenAtMs', 'desc'), limit(100));
        const subSnap: QuerySnapshot<DocumentData> = await getDocs(subQuery);
        if (subSnap.empty) break;
        for (const d of subSnap.docs) {
          const chatId = extractTelegramNumericUserId(String(d.data()?.chatId || d.id || ''));
          if (!chatId) continue;
          if (d.data()?.isBotBlocked) {
            blockedByBotSet.add(chatId);
            uniqueChatIds.delete(chatId);
          } else {
            activeBotSet.add(chatId);
            uniqueChatIds.add(chatId);
          }
        }
        if (subSnap.docs.length < 100) break;
        lastSubDoc = subSnap.docs[subSnap.docs.length - 1];
      }
    } catch {
      // Non-fatal
    }

    try {
      let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      for (let page = 0; page < 40; page += 1) {
        const q: Query<DocumentData> = lastDoc
          ? query(collection(serverDb, 'players'), orderBy('createdAtMs', 'asc'), startAfter(lastDoc), limit(50))
          : query(collection(serverDb, 'players'), orderBy('createdAtMs', 'asc'), limit(50));
        const snap: QuerySnapshot<DocumentData> = await getDocs(q);
        if (snap.empty) break;
        for (const docSnap of snap.docs) {
          const uid = String(docSnap.data()?.uid || docSnap.id || '').trim();
          const tgId = extractTelegramNumericUserId(uid);
          if (tgId) {
            playerSet.add(tgId);
            uniqueChatIds.add(tgId);
          }
        }
        if (snap.docs.length < 50) break;
        lastDoc = snap.docs[snap.docs.length - 1];
      }
    } catch {
      // Fallback to leaderboard collection
    }

    try {
      let lastLbDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      for (let page = 0; page < 10; page += 1) {
        const lbQuery: Query<DocumentData> = lastLbDoc
          ? query(collection(serverDb, 'leaderboard'), orderBy('buyerPoints', 'desc'), startAfter(lastLbDoc), limit(50))
          : query(collection(serverDb, 'leaderboard'), orderBy('buyerPoints', 'desc'), limit(50));
        const lbSnap: QuerySnapshot<DocumentData> = await getDocs(lbQuery);
        if (lbSnap.empty) break;
        for (const d of lbSnap.docs) {
          const tgId = extractTelegramNumericUserId(String(d.data()?.uid || d.id || ''));
          if (tgId) {
            playerSet.add(tgId);
            uniqueChatIds.add(tgId);
          }
        }
        if (lbSnap.docs.length < 50) break;
        lastLbDoc = lbSnap.docs[lbSnap.docs.length - 1];
      }
    } catch {
      // Non-fatal
    }
  }

  const recipients = Array.from(uniqueChatIds).filter(
    (id) => !blockedByBotSet.has(id) && (!excludeBanned || !bannedSet.has(id)),
  );

  return {
    recipients,
    botSubscriberCount: activeBotSet.size,
    blockedBotCount: blockedByBotSet.size,
    playerRecipientCount: playerSet.size,
  };
}

async function collectBroadcastRecipients(excludeBanned: boolean): Promise<string[]> {
  const details = await collectBroadcastAudienceDetails(excludeBanned);
  return details.recipients;
}

const ALLOWED_BROADCAST_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/3gpp': '3gp',
};

const EXT_TO_BROADCAST_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
};

function parseBroadcastMediaDataUrl(
  dataUrl: string,
  filenameHint?: string,
): {
  ok: true;
  mime: string;
  buffer: Buffer;
  ext: string;
} | { ok: false; error: string } {
  const trimmed = String(dataUrl || '').trim();
  const match = trimmed.match(/^data:([a-z0-9/+.-]*)(?:;[^,;]+=[^,;]*)*;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    return { ok: false, error: 'Invalid uploaded media payload format.' };
  }
  let mime = (match[1] || '').toLowerCase().trim();
  if (!mime || mime === 'application/octet-stream') {
    const extMatch = String(filenameHint || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    const extMime = extMatch ? EXT_TO_BROADCAST_MIME[extMatch[1]] : undefined;
    if (extMime) mime = extMime;
  }
  const ext = ALLOWED_BROADCAST_MIME_EXT[mime];
  if (!ext) {
    return {
      ok: false,
      error: `Unsupported media file type (${mime || 'unknown'}). Use JPG, PNG, WebP, GIF, or MP4.`,
    };
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) {
    return { ok: false, error: 'Uploaded media file is empty.' };
  }
  if (buffer.length > 10 * 1024 * 1024) {
    return { ok: false, error: 'Uploaded media exceeds 10 MB limit.' };
  }
  return { ok: true, mime, buffer, ext };
}

let botPollLoopRunning = false;

function ensureBotPollerRunning(): void {
  if (!getTelegramBotToken() || botPollLoopRunning) return;
  botPollLoopRunning = true;

  const runLongPollCycle = async () => {
    while (botPollLoopRunning) {
      if (!getTelegramBotToken()) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      const res = await pollTelegramBotUpdates(20).catch(() => ({
        ok: false,
        webhookActive: false,
        newUpdates: 0,
      }));
      const delayMs = res.webhookActive ? 15_000 : res.ok ? 80 : 2_000;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  };

  void runLongPollCycle();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const origin = String(req.headers.origin || '').trim();
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-telegram-init-data');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Mount broadcast route with a 15 MB JSON parser BEFORE the global 100 KB limit
  // so device-uploaded images/videos/GIFs are accepted cleanly while all other routes stay 100 KB capped.
  app.post('/api/admin/broadcast', express.json({ limit: '15mb' }), async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`admin_bcast:${ip}`, 10, 15 * 60_000);
    if (!rl.allowed) {
      res.status(429).json({
        ok: false,
        error: `Broadcast rate limit reached. Retry in ${rl.retryAfterSec}s.`,
      });
      return;
    }

    const body = req.body as {
      token?: string;
      initData?: string;
      title?: string;
      message?: string;
      mediaType?: 'none' | 'photo' | 'video' | 'animation';
      mediaUrl?: string;
      mediaDataUrl?: string;
      mediaFilename?: string;
      buttonText?: string;
      buttonUrl?: string;
      excludeBanned?: boolean;
      testOnlyToAdmin?: boolean;
    };

    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });

    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required to send broadcasts.' });
      return;
    }

    const activeBotToken = getTelegramBotToken();
    if (!activeBotToken) {
      res.status(400).json({
        ok: false,
        error: 'Bot token is not configured. Save your Telegram Bot Token in Admin Panel -> Channels or Diagnostics first.',
      });
      return;
    }

    const rawTitle = String(body.title || '').trim().slice(0, 100);
    const rawMessage = String(body.message || '').trim().slice(0, 2000);
    if (!rawTitle && !rawMessage) {
      res.status(400).json({ ok: false, error: 'Enter a broadcast title or message.' });
      return;
    }

    const mediaType =
      body.mediaType === 'photo' || body.mediaType === 'video' || body.mediaType === 'animation'
        ? body.mediaType
        : 'none';
    const mediaUrl = String(body.mediaUrl || '').trim();
    const mediaDataUrl = String(body.mediaDataUrl || '').trim();

    let uploadedMedia: { mime: string; buffer: Buffer; ext: string; filename: string } | null = null;
    if (mediaType !== 'none') {
      if (mediaDataUrl) {
        const parsedMedia = parseBroadcastMediaDataUrl(mediaDataUrl, body.mediaFilename);
        if (!parsedMedia.ok) {
          res.status(400).json({ ok: false, error: parsedMedia.error });
          return;
        }
        const safeName =
          String(body.mediaFilename || '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 48) || `broadcast.${parsedMedia.ext}`;
        uploadedMedia = {
          mime: parsedMedia.mime,
          buffer: parsedMedia.buffer,
          ext: parsedMedia.ext,
          filename: safeName,
        };
      } else if (!isSafePublicHttpsUrl(mediaUrl)) {
        res.status(400).json({
          ok: false,
          error: 'Upload a file or enter a valid public HTTPS media URL.',
        });
        return;
      }
    }

    const buttonText = String(body.buttonText || '').trim().slice(0, 32);
    const buttonUrl = String(body.buttonUrl || '').trim();
    if (buttonText && !isSafePublicHttpsUrl(buttonUrl)) {
      res.status(400).json({
        ok: false,
        error: 'CTA button URL must be a valid public HTTPS URL.',
      });
      return;
    }

    const htmlParts: string[] = [];
    if (rawTitle) htmlParts.push(`📢 <b>${escapeHtml(rawTitle)}</b>`);
    if (rawMessage) htmlParts.push(escapeHtml(rawMessage));
    const formattedText = htmlParts.join('\n\n').slice(0, mediaType === 'none' ? 4096 : 1024);
    const plainFallbackText = [rawTitle ? `📢 ${rawTitle}` : '', rawMessage]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, mediaType === 'none' ? 4096 : 1024);

    const botUsername = await resolveTelegramBotUsername();
    const replyMarkup =
      buttonText && buttonUrl
        ? { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] }
        : {
            inline_keyboard: [
              [buildDirectPrivateMiniAppButton('🐔 Open Alpha Gram', botUsername)],
            ],
          };

    const adminNumericId = extractTelegramNumericUserId(resolvedPlayerId);
    const targetChatIds = body.testOnlyToAdmin
      ? (adminNumericId ? [adminNumericId] : [])
      : await collectBroadcastRecipients(body.excludeBanned !== false);

    if (targetChatIds.length === 0) {
      res.json({
        ok: true,
        totalTargets: 0,
        sentCount: 0,
        failedCount: 0,
        blockedCount: 0,
        testOnlyToAdmin: Boolean(body.testOnlyToAdmin),
        sampleError: body.testOnlyToAdmin
          ? 'Your active Admin ID is not a numeric Telegram chat ID.'
          : 'No Telegram bot subscribers or player chat IDs found yet.',
      });
      return;
    }

    let sentCount = 0;
    let failedCount = 0;
    let blockedCount = 0;
    let sampleError = '';
    let cachedTelegramFileId = '';
    let attemptedRemoteMediaFetch = false;

    const endpoint =
      mediaType === 'photo'
        ? 'sendPhoto'
        : mediaType === 'video'
          ? 'sendVideo'
          : mediaType === 'animation'
            ? 'sendAnimation'
            : 'sendMessage';

    const mediaField =
      mediaType === 'photo'
        ? 'photo'
        : mediaType === 'video'
          ? 'video'
          : 'animation';

    type TgSendResp = {
      ok?: boolean;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
      result?: {
        photo?: Array<{ file_id?: string }>;
        video?: { file_id?: string };
        animation?: { file_id?: string };
      };
    };

    const dispatchSingleBroadcast = async (chatId: string): Promise<TgSendResp> => {
      const sendMultipart = async (
        mediaBlob: { mime: string; buffer: Buffer; filename: string },
        useHtml: boolean,
      ): Promise<TgSendResp> => {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append(
          mediaField,
          new Blob([new Uint8Array(mediaBlob.buffer)], { type: mediaBlob.mime }),
          mediaBlob.filename,
        );
        if (useHtml) {
          form.append('caption', formattedText);
          form.append('parse_mode', 'HTML');
        } else {
          form.append('caption', plainFallbackText);
        }
        form.append('reply_markup', JSON.stringify(replyMarkup));

        const tgRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/${endpoint}`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(25_000),
        });
        return (await tgRes.json()) as TgSendResp;
      };

      if (mediaType !== 'none' && uploadedMedia && !cachedTelegramFileId) {
        let tgData = await sendMultipart(uploadedMedia, true);
        if (!tgData.ok && tgData.error_code === 400 && String(tgData.description || '').toLowerCase().includes('parse')) {
          tgData = await sendMultipart(uploadedMedia, false);
        }
        return tgData;
      }

      const sendJsonPayload = async (useHtml: boolean): Promise<TgSendResp> => {
        const mediaValue = cachedTelegramFileId || mediaUrl;
        const payload: Record<string, unknown> =
          mediaType === 'none'
            ? {
                chat_id: chatId,
                text: useHtml ? formattedText : plainFallbackText,
                ...(useHtml ? { parse_mode: 'HTML' } : {}),
                reply_markup: replyMarkup,
              }
            : {
                chat_id: chatId,
                [mediaField]: mediaValue,
                caption: useHtml ? formattedText : plainFallbackText,
                ...(useHtml ? { parse_mode: 'HTML' } : {}),
                reply_markup: replyMarkup,
              };

        const tgRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12_000),
        });
        return (await tgRes.json()) as TgSendResp;
      };

      let tgData = await sendJsonPayload(true);
      if (!tgData.ok && tgData.error_code === 400 && String(tgData.description || '').toLowerCase().includes('parse')) {
        tgData = await sendJsonPayload(false);
      }

      // If Telegram couldn't fetch a remote HTTPS media URL directly, download once to buffer & upload via FormData
      if (
        !tgData.ok &&
        mediaType !== 'none' &&
        !cachedTelegramFileId &&
        !uploadedMedia &&
        !attemptedRemoteMediaFetch &&
        mediaUrl &&
        tgData.error_code === 400
      ) {
        attemptedRemoteMediaFetch = true;
        try {
          const mediaFetch = await fetch(mediaUrl, { signal: AbortSignal.timeout(12_000) });
          if (mediaFetch.ok) {
            const arr = await mediaFetch.arrayBuffer();
            if (arr.byteLength > 0 && arr.byteLength <= 10 * 1024 * 1024) {
              const rawCt = (mediaFetch.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
              const defaultMime =
                mediaType === 'video' ? 'video/mp4' : mediaType === 'animation' ? 'image/gif' : 'image/jpeg';
              const resolvedMime = ALLOWED_BROADCAST_MIME_EXT[rawCt] ? rawCt : defaultMime;
              const resolvedExt = ALLOWED_BROADCAST_MIME_EXT[resolvedMime] || 'bin';
              uploadedMedia = {
                mime: resolvedMime,
                buffer: Buffer.from(arr),
                ext: resolvedExt,
                filename: `broadcast.${resolvedExt}`,
              };
              let formRetry = await sendMultipart(uploadedMedia, true);
              if (!formRetry.ok && formRetry.error_code === 400 && String(formRetry.description || '').toLowerCase().includes('parse')) {
                formRetry = await sendMultipart(uploadedMedia, false);
              }
              return formRetry;
            }
          }
        } catch {
          // Return original Telegram error
        }
      }

      return tgData;
    };

    for (const chatId of targetChatIds) {
      try {
        let tgData = await dispatchSingleBroadcast(chatId);
        if (tgData.error_code === 429 && tgData.parameters?.retry_after) {
          const waitMs = Math.min(5000, Math.max(500, tgData.parameters.retry_after * 1000));
          await new Promise((r) => setTimeout(r, waitMs));
          tgData = await dispatchSingleBroadcast(chatId);
        }

        if (tgData.ok) {
          sentCount += 1;
          if (!cachedTelegramFileId && uploadedMedia && tgData.result) {
            if (mediaType === 'photo' && Array.isArray(tgData.result.photo) && tgData.result.photo.length > 0) {
              cachedTelegramFileId = String(tgData.result.photo[tgData.result.photo.length - 1]?.file_id || '');
            } else if (mediaType === 'video' && tgData.result.video?.file_id) {
              cachedTelegramFileId = String(tgData.result.video.file_id);
            } else if (mediaType === 'animation' && tgData.result.animation?.file_id) {
              cachedTelegramFileId = String(tgData.result.animation.file_id);
            }
          }
        } else {
          failedCount += 1;
          const desc = String(tgData.description || '');
          const low = desc.toLowerCase();
          if (tgData.error_code === 403 || low.includes('blocked') || low.includes('chat not found') || low.includes('deactivated')) {
            blockedCount += 1;
            await markBotSubscriberBlocked(chatId, true);
          }
          if (!sampleError && desc) {
            sampleError = redactBotToken(desc);
          }
        }
      } catch (err) {
        failedCount += 1;
        if (!sampleError) {
          sampleError = redactBotToken(err instanceof Error ? err.message : 'Telegram API error');
        }
      }

      if (targetChatIds.length > 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    recordServerLog(
      failedCount > 0 && sentCount === 0 ? 'error' : failedCount > 0 ? 'warn' : 'info',
      'broadcast',
      `Broadcast finished: ${sentCount}/${targetChatIds.length} sent (${failedCount} failed, ${blockedCount} blocked)`,
      sampleError || (body.testOnlyToAdmin ? 'Admin test broadcast' : 'All subscribers'),
    );

    res.json({
      ok: true,
      totalTargets: targetChatIds.length,
      sentCount,
      failedCount,
      blockedCount,
      testOnlyToAdmin: Boolean(body.testOnlyToAdmin),
      ...(sampleError ? { sampleError } : {}),
    });
  });

  app.use(express.json({ limit: '100kb' }));

  app.use((req, _res, next) => {
    if (!cachedBotMenuWebAppUrl) {
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '')
        .split(',')[0]
        ?.trim()
        .toLowerCase();
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
        .split(',')[0]
        ?.trim();
      if (proto === 'https' && host) {
        const candidate = `https://${host}`;
        if (isSafePublicHttpsUrl(candidate)) {
          cachedBotMenuWebAppUrl = candidate;
        }
      }
    }
    next();
  });

  app.get('/api/config', async (_req, res) => {
    const [channelsCfg, telegramBotUsername, adminSecurity, maintenanceCfg] = await Promise.all([
      loadChannelsConfigFromFirestore(),
      resolveTelegramBotUsername(),
      loadActiveAdminSecurity(),
      loadMaintenanceConfigFromFirestore(),
    ]);
    const activeChannels = getActiveRequiredChannels(channelsCfg);
    res.json({
      gramDepositAddress: GRAM_DEPOSIT_ADDRESS,
      gramJettonMaster: GRAM_JETTON_MASTER,
      minDepositCoins: MIN_DEPOSIT_COINS,
      maxDepositCoins: MAX_DEPOSIT_COINS,
      payoutChannel: TELEGRAM_PAYOUT_CHANNEL,
      channelCheckEnabled: channelsCfg.enabled,
      requiredChannels: activeChannels.map((c) => c.handle),
      telegramBotConfigured: Boolean(getTelegramBotToken()),
      telegramBotUsername,
      telegramAppShortName: TELEGRAM_MINIAPP_SHORT_NAME,
      persistentLedgerEnabled: Boolean(serverDb),
      adminPasscodeSource: adminSecurity.source,
      adminPasscodeUpdatedAtMs: adminSecurity.updatedAtMs,
      maintenance: maintenanceCfg,
    });
  });

  const handleCheckChannelsRequest = async (req: express.Request, res: express.Response) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`chk_ch:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: `Too many requests. Retry in ${rl.retryAfterSec}s.` });
      return;
    }
    const body = req.body as {
      initData?: string;
      token?: string;
      playerId?: string;
      requiredChannels?: Array<Partial<RequiredTelegramChannel>>;
    };
    const rawInitData = String(body.initData || '').trim();
    const rawPlayerId = String(body.playerId || '').trim();

    const { config: channelsCfg, fromFirestore } = await loadChannelsConfigWithSourceFromFirestore();
    let targetChannels = getActiveRequiredChannels(channelsCfg);
    if (!fromFirestore && Array.isArray(body.requiredChannels) && channelsCfg.enabled) {
      targetChannels = body.requiredChannels
        .map((ch, idx) => normalizeTelegramChannelEntry(ch, idx))
        .filter((ch): ch is RequiredTelegramChannel => Boolean(ch && ch.enabled !== false))
        .slice(0, 10);
    }

    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: rawInitData,
    });

    // getChatMember is a strictly read-only Telegram lookup:
    // accept verified actor first, and gracefully fall back to initData user.id or tg_<id>
    let numericUserId: string | null = verifiedActor
      ? extractTelegramNumericUserId(verifiedActor)
      : null;
    let userIdSource: 'verified' | 'init_user' | 'player_id' | 'none' = numericUserId
      ? 'verified'
      : 'none';

    if (!numericUserId && rawInitData) {
      try {
        const initParams = new URLSearchParams(rawInitData);
        const userJson = initParams.get('user');
        if (userJson) {
          const parsedUser = JSON.parse(userJson) as { id?: number | string };
          const parsedId = extractTelegramNumericUserId(parsedUser?.id);
          if (parsedId) {
            numericUserId = parsedId;
            userIdSource = 'init_user';
          }
        }
      } catch {
        // Ignore malformed initData user JSON
      }
    }

    if (!numericUserId) {
      const fallbackTgId = extractTelegramNumericUserId(rawPlayerId);
      if (fallbackTgId) {
        numericUserId = fallbackTgId;
        userIdSource = 'player_id';
      }
    }

    if (!channelsCfg.enabled || targetChannels.length === 0) {
      res.json({
        ok: true,
        allJoined: true,
        verificationMode: 'disabled',
        telegramUserId: numericUserId,
        channels: [],
        checkedAtMs: Date.now(),
      });
      return;
    }

    const activeBotToken = getTelegramBotToken();
    if (!numericUserId) {
      const channelsOut = targetChannels.map((ch) => ({
        ...ch,
        joined: false,
        status: 'no_telegram_user',
      }));
      recordChannelCheckDiagnosticLog({
        endpoint: 'check-channels',
        userIdSource,
        telegramUserId: null,
        verificationMode: 'guest_browser',
        allJoined: false,
        fromFirestore,
        botConfigured: Boolean(activeBotToken),
        error: 'No Telegram numeric user ID detected on request',
        channels: channelsOut.map((c) => ({
          handle: c.handle,
          joined: false,
          status: c.status,
          rawTelegramOk: false,
          rawDescription: 'No Telegram user ID detected (guest browser / non-Telegram context)',
        })),
      });
      res.json({
        ok: true,
        allJoined: false,
        verificationMode: 'guest_browser',
        telegramUserId: null,
        channels: channelsOut,
        checkedAtMs: Date.now(),
      });
      return;
    }

    if (!activeBotToken) {
      const channelsOut = targetChannels.map((ch) => ({
        ...ch,
        joined: false,
        status: 'bot_unconfigured',
        error: 'TELEGRAM_BOT_TOKEN not configured on server',
      }));
      recordChannelCheckDiagnosticLog({
        endpoint: 'check-channels',
        userIdSource,
        telegramUserId: numericUserId,
        verificationMode: 'bot_unconfigured',
        allJoined: false,
        fromFirestore,
        botConfigured: false,
        error: 'TELEGRAM_BOT_TOKEN not configured on server',
        channels: channelsOut.map((c) => ({
          handle: c.handle,
          joined: false,
          status: c.status,
          rawTelegramOk: false,
          rawDescription: c.error,
        })),
      });
      res.json({
        ok: true,
        allJoined: false,
        verificationMode: 'bot_unconfigured',
        telegramUserId: numericUserId,
        channels: channelsOut,
        checkedAtMs: Date.now(),
      });
      return;
    }

    const logChannelRows: ChannelCheckDiagnosticLog['channels'] = [];
    const checks = await Promise.all(
      targetChannels.map(async (ch) => {
        try {
          const tgData = await fetchTelegramChatMember(ch.handle, numericUserId!);

          if (!tgData.ok || !tgData.result) {
            if (tgData.userNotFound) {
              logChannelRows.push({
                handle: ch.handle,
                joined: false,
                status: 'left',
                rawTelegramOk: false,
                errorCode: tgData.errorCode,
                rawDescription: tgData.description || 'User not found in channel',
                targetChatIdUsed: tgData.targetChatIdUsed,
              });
              return {
                ...ch,
                joined: false,
                status: 'left',
              };
            }
            const errText = await formatTelegramChannelCheckError(tgData.description, ch.handle);
            logChannelRows.push({
              handle: ch.handle,
              joined: false,
              status: 'api_error',
              rawTelegramOk: false,
              errorCode: tgData.errorCode,
              rawDescription: errText,
              targetChatIdUsed: tgData.targetChatIdUsed,
            });
            return {
              ...ch,
              joined: false,
              status: 'api_error',
              error: errText,
            };
          }

          const status = String(tgData.result.status || 'left');
          const joined = isTelegramMemberStatusJoined(status, tgData.result.is_member);
          logChannelRows.push({
            handle: ch.handle,
            joined,
            status,
            rawTelegramOk: true,
            rawStatus: status,
            rawIsMember:
              typeof tgData.result.is_member === 'boolean' ? tgData.result.is_member : null,
            targetChatIdUsed: tgData.targetChatIdUsed,
          });
          return {
            ...ch,
            joined,
            status,
          };
        } catch (err) {
          const errText = err instanceof Error ? err.message : 'Telegram API timeout';
          logChannelRows.push({
            handle: ch.handle,
            joined: false,
            status: 'network_error',
            rawTelegramOk: false,
            rawDescription: errText,
          });
          return {
            ...ch,
            joined: false,
            status: 'network_error',
            error: errText,
          };
        }
      }),
    );

    const allJoined = checks.every((c) => c.joined);
    recordChannelCheckDiagnosticLog({
      endpoint: 'check-channels',
      userIdSource,
      telegramUserId: numericUserId,
      verificationMode: 'telegram_bot',
      allJoined,
      fromFirestore,
      botConfigured: true,
      channels: logChannelRows,
    });
    console.info(
      '[channel-check]',
      JSON.stringify({
        userIdSource,
        numericUserId,
        fromFirestore,
        allJoined,
        channels: checks.map((c) => ({
          handle: c.handle,
          joined: c.joined,
          status: c.status,
          error: 'error' in c && c.error ? redactBotToken(String(c.error)) : undefined,
        })),
      }),
    );

    res.json({
      ok: true,
      allJoined,
      verificationMode: 'telegram_bot',
      telegramUserId: numericUserId,
      channels: checks,
      checkedAtMs: Date.now(),
    });
  };

  app.post('/api/telegram/check-channels', handleCheckChannelsRequest);
  app.post('/api/telegram/check-membership', handleCheckChannelsRequest);

  app.post('/api/telegram/check-task-channel', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`chk_task_ch:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: `Too many requests. Retry in ${rl.retryAfterSec}s.` });
      return;
    }
    const body = req.body as {
      initData?: string;
      token?: string;
      playerId?: string;
      actionUrl?: string;
      requireChannelCheck?: boolean;
    };
    if (body.requireChannelCheck === false) {
      res.json({ ok: true, enforced: false, joined: true, reason: 'channel_check_disabled_by_sponsor' });
      return;
    }
    const actionUrl = String(body.actionUrl || '').trim();
    if (!actionUrl) {
      res.json({ ok: true, enforced: false, joined: true, reason: 'not_applicable' });
      return;
    }
    // Skip bot start links & private invite links (t.me/bot?start=..., t.me/+...)
    if (
      /[?&]start(app)?=/i.test(actionUrl) ||
      /t\.me\/(\+|joinchat\/)/i.test(actionUrl)
    ) {
      res.json({ ok: true, enforced: false, joined: true, reason: 'non_public_channel' });
      return;
    }
    const normalized = normalizeTelegramChannelHandle(actionUrl);
    if (!normalized.handle) {
      res.json({ ok: true, enforced: false, joined: true, reason: 'not_telegram_channel' });
      return;
    }

    if (!getTelegramBotToken()) {
      res.json({
        ok: true,
        enforced: true,
        joined: false,
        handle: normalized.handle,
        status: 'bot_unconfigured',
        reason: 'Bot verification not configured on server',
      });
      return;
    }

    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: String(body.initData || '').trim(),
    });
    const numericUserId =
      extractTelegramNumericUserId(verifiedActor) ||
      extractTelegramNumericUserId(String(body.playerId || '').trim());
    if (!numericUserId) {
      res.json({
        ok: true,
        enforced: true,
        joined: false,
        handle: normalized.handle,
        status: 'no_telegram_user',
        reason: 'Open inside Telegram to verify channel membership',
      });
      return;
    }

    try {
      const tgData = await fetchTelegramChatMember(normalized.handle, numericUserId);
      if (tgData.userNotFound) {
        recordChannelCheckDiagnosticLog({
          endpoint: 'check-task-channel',
          userIdSource: verifiedActor ? 'verified' : 'player_id',
          telegramUserId: numericUserId,
          verificationMode: 'telegram_bot',
          allJoined: false,
          botConfigured: true,
          channels: [
            {
              handle: normalized.handle,
              joined: false,
              status: 'left',
              rawTelegramOk: false,
              errorCode: tgData.errorCode,
              rawDescription: tgData.description || 'User not found in channel',
              targetChatIdUsed: tgData.targetChatIdUsed,
            },
          ],
        });
        res.json({
          ok: true,
          enforced: true,
          joined: false,
          handle: normalized.handle,
          status: 'left',
          reason: 'Not joined yet',
        });
        return;
      }
      if (!tgData.ok || !tgData.result) {
        const friendlyErr = await formatTelegramChannelCheckError(
          tgData.description,
          normalized.handle,
        );
        recordChannelCheckDiagnosticLog({
          endpoint: 'check-task-channel',
          userIdSource: verifiedActor ? 'verified' : 'player_id',
          telegramUserId: numericUserId,
          verificationMode: 'telegram_bot',
          allJoined: false,
          botConfigured: true,
          error: friendlyErr,
          channels: [
            {
              handle: normalized.handle,
              joined: false,
              status: 'api_error',
              rawTelegramOk: false,
              errorCode: tgData.errorCode,
              rawDescription: tgData.description || friendlyErr,
              targetChatIdUsed: tgData.targetChatIdUsed,
            },
          ],
        });
        res.json({
          ok: true,
          enforced: true,
          joined: false,
          handle: normalized.handle,
          status: 'api_error',
          reason: friendlyErr,
        });
        return;
      }
      const status = String(tgData.result.status || 'left');
      const joined = isTelegramMemberStatusJoined(status, tgData.result.is_member);
      recordChannelCheckDiagnosticLog({
        endpoint: 'check-task-channel',
        userIdSource: verifiedActor ? 'verified' : 'player_id',
        telegramUserId: numericUserId,
        verificationMode: 'telegram_bot',
        allJoined: joined,
        botConfigured: true,
        channels: [
          {
            handle: normalized.handle,
            joined,
            status,
            rawTelegramOk: true,
            rawStatus: status,
            rawIsMember:
              typeof tgData.result.is_member === 'boolean' ? tgData.result.is_member : null,
            targetChatIdUsed: tgData.targetChatIdUsed,
          },
        ],
      });
      res.json({
        ok: true,
        enforced: true,
        joined,
        handle: normalized.handle,
        status,
        ...(!joined ? { reason: `Not joined ${normalized.handle} yet — tap Join, then Retry.` } : {}),
      });
    } catch {
      res.json({
        ok: true,
        enforced: true,
        joined: false,
        handle: normalized.handle,
        status: 'network_error',
        reason: 'Network error checking channel join',
      });
    }
  });

  app.post('/api/telegram/audit-claimed-channels', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`audit_ch:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: `Too many requests. Retry in ${rl.retryAfterSec}s.` });
      return;
    }
    const body = (req.body || {}) as {
      initData?: string;
      token?: string;
      playerId?: string;
      claimedTasks?: Array<{ taskId?: string; handle?: string; actionUrl?: string }>;
    };
    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: String(body.initData || '').trim(),
    });
    const numericUserId =
      extractTelegramNumericUserId(verifiedActor) ||
      extractTelegramNumericUserId(String(body.playerId || '').trim());

    if (!getTelegramBotToken() || !numericUserId) {
      res.json({ ok: true, audited: false, leftTaskIds: [] });
      return;
    }

    const rawItems = Array.isArray(body.claimedTasks) ? body.claimedTasks.slice(0, 25) : [];
    const items: Array<{ taskId: string; handle: string }> = [];
    for (const item of rawItems) {
      const taskId = String(item?.taskId || '').trim().slice(0, 64);
      const rawHandle = String(item?.handle || item?.actionUrl || '').trim();
      const norm = normalizeTelegramChannelHandle(rawHandle);
      if (taskId && norm.handle) {
        items.push({ taskId, handle: norm.handle });
      }
    }

    if (items.length === 0) {
      res.json({ ok: true, audited: true, leftTaskIds: [] });
      return;
    }

    const uniqueHandles = Array.from(new Set(items.map((i) => i.handle))).slice(0, 15);
    const leftHandles = new Set<string>();

    await Promise.all(
      uniqueHandles.map(async (handle) => {
        try {
          const tgData = await fetchTelegramChatMember(handle, numericUserId);
          if (tgData.userNotFound) {
            leftHandles.add(handle);
            return;
          }
          if (tgData.ok && tgData.result) {
            const status = String(tgData.result.status || 'left');
            if (!isTelegramMemberStatusJoined(status, tgData.result.is_member)) {
              leftHandles.add(handle);
            }
          }
        } catch {
          // Do not false-penalize on transient network timeouts
        }
      }),
    );

    const leftTaskIds = items.filter((i) => leftHandles.has(i.handle)).map((i) => i.taskId);
    if (leftTaskIds.length > 0) {
      recordServerLog(
        'warn',
        'channel_audit',
        `User ${numericUserId} left ${leftHandles.size} channel(s): ${Array.from(leftHandles).join(', ')}`,
        `Penalizing tasks: ${leftTaskIds.join(', ')}`,
      );
    }

    res.json({
      ok: true,
      audited: true,
      leftTaskIds,
      leftHandles: Array.from(leftHandles),
    });
  });

  app.post('/api/telegram/test-channels', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`test_ch:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: `Too many requests. Retry in ${rl.retryAfterSec}s.` });
      return;
    }

    const body = req.body as {
      initData?: string;
      token?: string;
      requiredChannels?: Array<Partial<RequiredTelegramChannel>>;
    };

    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });

    if (!resolvedPlayerId) {
      res.status(403).json({
        ok: false,
        error: 'Admin session token or verified Telegram Admin session required.',
      });
      return;
    }

    const channelsCfg = await loadChannelsConfigFromFirestore();
    const targetChannels = Array.isArray(body.requiredChannels)
      ? body.requiredChannels
          .map((ch, idx) => normalizeTelegramChannelEntry(ch, idx))
          .filter((ch): ch is RequiredTelegramChannel => Boolean(ch && ch.enabled !== false))
          .slice(0, 10)
      : getActiveRequiredChannels(channelsCfg);

    const activeBotToken = getTelegramBotToken();
    if (!activeBotToken) {
      const channelsOut = targetChannels.map((ch) => ({
        id: ch.id,
        handle: ch.handle,
        botIsAdmin: false,
        botStatus: 'bot_unconfigured',
        error: 'TELEGRAM_BOT_TOKEN not configured on server',
      }));
      recordChannelCheckDiagnosticLog({
        endpoint: 'test-channels',
        userIdSource: 'admin_session',
        telegramUserId: extractTelegramNumericUserId(resolvedPlayerId),
        verificationMode: 'bot_unconfigured',
        allJoined: false,
        botConfigured: false,
        error: 'TELEGRAM_BOT_TOKEN is not set. Save your Bot Token in Admin Panel.',
        channels: channelsOut.map((c) => ({
          handle: c.handle,
          joined: false,
          status: c.botStatus,
          botIsAdmin: false,
          botStatus: c.botStatus,
          rawTelegramOk: false,
          rawDescription: c.error,
        })),
      });
      res.json({
        ok: true,
        botConfigured: false,
        botUsername: null,
        botError: 'TELEGRAM_BOT_TOKEN is not set. Save your Bot Token below.',
        channels: channelsOut,
        recentLogs: getRecentChannelCheckLogs(5),
      });
      return;
    }

    try {
      const meRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/getMe`, {
        signal: AbortSignal.timeout(6000),
      });
      const meData = (await meRes.json()) as {
        ok?: boolean;
        error_code?: number;
        description?: string;
        result?: { id?: number | string; username?: string };
      };
      if (!meData.ok || !meData.result?.id) {
        const channelsOut = targetChannels.map((ch) => ({
          id: ch.id,
          handle: ch.handle,
          botIsAdmin: false,
          botStatus: 'token_invalid',
          error: meData.description || 'Bot token rejected by Telegram',
        }));
        recordChannelCheckDiagnosticLog({
          endpoint: 'test-channels',
          userIdSource: 'admin_session',
          telegramUserId: extractTelegramNumericUserId(resolvedPlayerId),
          verificationMode: 'telegram_bot',
          allJoined: false,
          botConfigured: true,
          error: redactBotToken(meData.description || 'Invalid TELEGRAM_BOT_TOKEN (getMe failed)'),
          channels: channelsOut.map((c) => ({
            handle: c.handle,
            joined: false,
            status: c.botStatus,
            botIsAdmin: false,
            botStatus: c.botStatus,
            rawTelegramOk: false,
            errorCode: meData.error_code,
            rawDescription: c.error,
          })),
        });
        res.json({
          ok: true,
          botConfigured: true,
          botUsername: null,
          botError: meData.description || 'Invalid TELEGRAM_BOT_TOKEN (getMe failed)',
          channels: channelsOut,
          recentLogs: getRecentChannelCheckLogs(5),
        });
        return;
      }

      const botId = String(meData.result.id);
      const botUsername = meData.result.username || '';
      const adminNumericId = extractTelegramNumericUserId(resolvedPlayerId);
      const diagLogChannels: ChannelCheckDiagnosticLog['channels'] = [];

      const results = await Promise.all(
        targetChannels.map(async (ch) => {
          try {
            const botMember = await fetchTelegramChatMember(ch.handle, botId);
            if (!botMember.ok || !botMember.result) {
              const errMsg = botMember.description || 'Could not inspect bot status in channel';
              diagLogChannels.push({
                handle: ch.handle,
                joined: false,
                status: 'api_error',
                botIsAdmin: false,
                botStatus: 'api_error',
                rawTelegramOk: false,
                errorCode: botMember.errorCode,
                rawDescription: errMsg,
                targetChatIdUsed: botMember.targetChatIdUsed,
              });
              return {
                id: ch.id,
                handle: ch.handle,
                botIsAdmin: false,
                botStatus: 'api_error',
                error: errMsg,
              };
            }
            const botStatus = String(botMember.result.status || 'left').toLowerCase();
            const botIsAdmin = botStatus === 'administrator' || botStatus === 'creator';
            let userJoined: boolean | null = null;
            let userStatus: string | null = null;
            let userRawDesc: string | undefined;
            let userRawOk: boolean | undefined;
            let userErrorCode: number | undefined;
            if (adminNumericId) {
              const adminCheck = await fetchTelegramChatMember(ch.handle, adminNumericId);
              if (adminCheck.userNotFound) {
                userStatus = 'left';
                userJoined = false;
                userRawOk = false;
                userErrorCode = adminCheck.errorCode;
                userRawDesc = adminCheck.description || 'User not found in channel';
              } else if (adminCheck.ok && adminCheck.result) {
                userStatus = String(adminCheck.result.status || 'left');
                userJoined = isTelegramMemberStatusJoined(userStatus, adminCheck.result.is_member);
                userRawOk = true;
              } else {
                userRawOk = false;
                userErrorCode = adminCheck.errorCode;
                userRawDesc = adminCheck.description;
              }
            }
            diagLogChannels.push({
              handle: ch.handle,
              joined: Boolean(userJoined),
              status: userStatus || (botIsAdmin ? 'bot_admin_ready' : botStatus),
              botIsAdmin,
              botStatus,
              rawTelegramOk: userRawOk ?? true,
              errorCode: userErrorCode,
              rawStatus: userStatus || botStatus,
              rawDescription:
                userRawDesc ||
                (!botIsAdmin ? `Bot status is "${botStatus}" — promote bot to Admin` : undefined),
              targetChatIdUsed: botMember.targetChatIdUsed,
            });
            return {
              id: ch.id,
              handle: ch.handle,
              botIsAdmin,
              botStatus,
              userJoined,
              userStatus,
              error: botIsAdmin ? undefined : `Bot status is "${botStatus}" — promote bot to Admin in ${ch.handle}`,
            };
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Telegram API timeout';
            diagLogChannels.push({
              handle: ch.handle,
              joined: false,
              status: 'network_error',
              botIsAdmin: false,
              botStatus: 'network_error',
              rawTelegramOk: false,
              rawDescription: errMsg,
            });
            return {
              id: ch.id,
              handle: ch.handle,
              botIsAdmin: false,
              botStatus: 'network_error',
              error: errMsg,
            };
          }
        }),
      );

      recordChannelCheckDiagnosticLog({
        endpoint: 'test-channels',
        userIdSource: 'admin_session',
        telegramUserId: adminNumericId,
        verificationMode: 'telegram_bot',
        allJoined: results.every((r) => r.botIsAdmin && r.userJoined !== false),
        botConfigured: true,
        botUsername,
        channels: diagLogChannels,
      });

      res.json({
        ok: true,
        botConfigured: true,
        botUsername,
        channels: results,
        recentLogs: getRecentChannelCheckLogs(5),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to Telegram API';
      recordChannelCheckDiagnosticLog({
        endpoint: 'test-channels',
        userIdSource: 'admin_session',
        telegramUserId: extractTelegramNumericUserId(resolvedPlayerId),
        verificationMode: 'telegram_bot',
        allJoined: false,
        botConfigured: true,
        error: redactBotToken(errMsg),
        channels: [],
      });
      res.json({
        ok: true,
        botConfigured: true,
        botUsername: null,
        botError: errMsg,
        channels: [],
        recentLogs: getRecentChannelCheckLogs(5),
      });
    }
  });

  app.post('/api/admin/channel-logs', async (req, res) => {
    const body = (req.body || {}) as { token?: string; initData?: string };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    res.json({
      ok: true,
      logs: getRecentChannelCheckLogs(5),
      totalRecorded: channelCheckLogs.length,
    });
  });

  app.get('/api/admin/channel-logs', async (req, res) => {
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: typeof req.query.token === 'string' ? req.query.token : undefined,
      initData: typeof req.query.initData === 'string' ? req.query.initData : undefined,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    res.json({
      ok: true,
      logs: getRecentChannelCheckLogs(5),
      totalRecorded: channelCheckLogs.length,
    });
  });

  const handleSystemDiagnosticsRequest = async (
    req: express.Request,
    res: express.Response,
    params: { token?: string; initData?: string; forceHeartbeat?: boolean },
  ) => {
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: params.token,
      initData: params.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }

    const heartbeat = await probeBotHeartbeat(Boolean(params.forceHeartbeat));

    let firestoreReadOk = false;
    let firestoreLatencyMs: number | null = null;
    let firestoreError: string | null = serverDb ? null : 'Firestore client not initialized on server';
    let projectId = '';
    let databaseId = '';
    try {
      const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
          projectId?: string;
          firestoreDatabaseId?: string;
        };
        projectId = cfg.projectId || '';
        databaseId = cfg.firestoreDatabaseId || '';
      }
    } catch {
      // Ignore config read issues
    }

    if (serverDb) {
      const dbStart = Date.now();
      try {
        await getFreshDoc(doc(serverDb, 'app_config', 'channels'));
        firestoreReadOk = true;
        firestoreLatencyMs = Math.max(1, Date.now() - dbStart);
      } catch (err) {
        firestoreReadOk = false;
        firestoreLatencyMs = Math.max(1, Date.now() - dbStart);
        firestoreError = err instanceof Error ? err.message : 'Firestore read probe failed';
        recordServerLog('error', 'firestore', 'Firestore heartbeat read failed', firestoreError);
      }
    }

    const mem = process.memoryUsage();
    const snapshot: SystemDiagnosticsSnapshot = {
      ok: true,
      serverTimeMs: Date.now(),
      uptimeSec: Math.floor(process.uptime()),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
      memoryMb: {
        rss: Math.round(mem.rss / (1024 * 1024)),
        heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotal: Math.round(mem.heapTotal / (1024 * 1024)),
      },
      bot: {
        configured: Boolean(getTelegramBotToken()),
        username: heartbeat.username || runtimeBotConfig?.botUsername || cachedBotUsername || (TELEGRAM_BOT_USERNAME_ENV || null),
        botId: heartbeat.botId,
        lastHeartbeatAtMs: heartbeat.lastHeartbeatAtMs,
        lastHeartbeatOk: heartbeat.lastHeartbeatOk,
        latencyMs: heartbeat.latencyMs,
        error: heartbeat.error,
        webhookUrl: heartbeat.webhookUrl,
        pendingUpdateCount: heartbeat.pendingUpdateCount,
        subscriberCount: botSubscriberMap.size,
        activePollIntervalSec: 20,
      },
      firestore: {
        connected: Boolean(serverDb) && firestoreReadOk,
        databaseId,
        projectId,
        readOk: firestoreReadOk,
        latencyMs: firestoreLatencyMs,
        error: firestoreError,
      },
      channelCheckStats: {
        totalLogsRecorded: channelCheckLogs.length,
        lastCheckAtMs: channelCheckLogs[0]?.timestampMs ?? null,
      },
      rateLimitBucketsCount: rateLimitBuckets.size,
      serverLogs: serverDiagnosticLogs.slice(0, 40),
    };

    res.json(snapshot);
  };

  app.post('/api/admin/system-diagnostics', async (req, res) => {
    const body = (req.body || {}) as {
      token?: string;
      initData?: string;
      forceHeartbeat?: boolean;
    };
    await handleSystemDiagnosticsRequest(req, res, body);
  });

  app.get('/api/admin/system-diagnostics', async (req, res) => {
    await handleSystemDiagnosticsRequest(req, res, {
      token: typeof req.query.token === 'string' ? req.query.token : undefined,
      initData: typeof req.query.initData === 'string' ? req.query.initData : undefined,
      forceHeartbeat: req.query.forceHeartbeat === '1' || req.query.forceHeartbeat === 'true',
    });
  });

  app.post('/api/admin/bot-config/get', async (req, res) => {
    const body = (req.body || {}) as { token?: string; initData?: string };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const activeToken = getTelegramBotToken();
    const botUsername = activeToken ? await resolveTelegramBotUsername() : null;
    res.json({
      ok: true,
      configured: Boolean(activeToken),
      source: getBotTokenSource(),
      maskedToken: activeToken ? maskBotToken(activeToken) : '',
      botUsername,
      updatedAtMs: runtimeBotConfig?.updatedAtMs ?? 0,
    });
  });

  app.get('/api/admin/bot-config', async (req, res) => {
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: typeof req.query.token === 'string' ? req.query.token : undefined,
      initData: typeof req.query.initData === 'string' ? req.query.initData : undefined,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const activeToken = getTelegramBotToken();
    const botUsername = activeToken ? await resolveTelegramBotUsername() : null;
    res.json({
      ok: true,
      configured: Boolean(activeToken),
      source: getBotTokenSource(),
      maskedToken: activeToken ? maskBotToken(activeToken) : '',
      botUsername,
      updatedAtMs: runtimeBotConfig?.updatedAtMs ?? 0,
    });
  });

  app.post('/api/admin/bot-config', async (req, res) => {
    const body = (req.body || {}) as {
      token?: string;
      initData?: string;
      botToken?: string;
    };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }

    const cleanToken = sanitizeBotTokenInput(body.botToken);
    if (!cleanToken) {
      res.status(400).json({ ok: false, error: 'Enter a Telegram Bot Token.' });
      return;
    }
    if (!/^\d{6,15}:[A-Za-z0-9_-]{20,80}$/.test(cleanToken)) {
      res.status(400).json({
        ok: false,
        error: 'Invalid bot token format. Expected format like 123456789:ABCdef... from @BotFather.',
      });
      return;
    }

    try {
      const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
        signal: AbortSignal.timeout(7000),
      });
      const meData = (await meRes.json()) as {
        ok?: boolean;
        description?: string;
        result?: { id?: number; username?: string };
      };
      if (!meRes.ok || !meData.ok || !meData.result?.id) {
        res.status(400).json({
          ok: false,
          error: (meData.description || 'Telegram rejected this Bot Token.').replaceAll(cleanToken, '[redacted]'),
        });
        return;
      }

      const detectedUsername =
        normalizeTelegramBotUsername(meData.result.username) ||
        TELEGRAM_BOT_USERNAME_ENV ||
        DEFAULT_TELEGRAM_BOT_USERNAME;
      const nowMs = Date.now();
      saveRuntimeBotConfigToDisk({
        token: cleanToken,
        botUsername: detectedUsername,
        botId: typeof meData.result.id === 'number' ? meData.result.id : null,
        updatedAtMs: nowMs,
      });
      cachedBotUsername = detectedUsername;
      lastBotLookupAttemptMs = nowMs;
      ensureBotPollerRunning();
      void probeBotHeartbeat(true);
      recordServerLog(
        'info',
        'bot_config',
        `Bot token updated by ${resolvedPlayerId}: @${detectedUsername}`,
        `masked=${maskBotToken(cleanToken)}`,
      );
      res.json({
        ok: true,
        configured: true,
        source: 'runtime',
        maskedToken: maskBotToken(cleanToken),
        botUsername: detectedUsername,
        botId: meData.result.id,
        updatedAtMs: nowMs,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          (err instanceof Error ? err.message : 'Unable to reach Telegram API to verify token.').replaceAll(
            cleanToken,
            '[redacted]',
          ),
      });
    }
  });

  const handleClearRuntimeBotConfig = async (req: express.Request, res: express.Response) => {
    const body = (req.body || {}) as { token?: string; initData?: string };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token || (typeof req.query.token === 'string' ? req.query.token : undefined),
      initData: body.initData || (typeof req.query.initData === 'string' ? req.query.initData : undefined),
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    clearRuntimeBotConfigOnDisk();
    cachedBotUsername = TELEGRAM_BOT_USERNAME_ENV || '';
    lastBotLookupAttemptMs = 0;
    botHeartbeatState.lastHeartbeatAtMs = 0;
    botHeartbeatState.lastHeartbeatOk = false;
    botHeartbeatState.username = TELEGRAM_BOT_USERNAME_ENV || null;
    botHeartbeatState.botId = null;
    botHeartbeatState.error = null;
    const fallbackToken = getTelegramBotToken();
    const fallbackUsername = fallbackToken ? await resolveTelegramBotUsername() : null;
    recordServerLog('info', 'bot_config', `Runtime bot token cleared by ${resolvedPlayerId}`);
    res.json({
      ok: true,
      configured: Boolean(fallbackToken),
      source: getBotTokenSource(),
      maskedToken: fallbackToken ? maskBotToken(fallbackToken) : '',
      botUsername: fallbackUsername,
      updatedAtMs: 0,
    });
  };

  app.delete('/api/admin/bot-config', handleClearRuntimeBotConfig);
  app.post('/api/admin/bot-config/clear', handleClearRuntimeBotConfig);

  app.post('/api/auth/verify-telegram', (req, res) => {
    const body = req.body as { initData?: string };
    const rawInitData = String(body.initData || '').trim();
    const activeBotToken = getTelegramBotToken();
    if (!rawInitData || !activeBotToken) {
      res.json({ ok: true, verified: false, mode: 'guest' });
      return;
    }

    const check = verifyTelegramInitData(rawInitData, activeBotToken, {
      allowClockSkew: true,
    });
    if (!check.valid || !check.playerId) {
      res.status(401).json({
        ok: false,
        verified: false,
        error: 'Invalid Telegram initData signature.',
      });
      return;
    }

    const sessionToken = signSessionToken({
      role: 'player',
      playerId: check.playerId,
    });
    const tgUser = check.user as { username?: unknown; first_name?: unknown } | undefined;
    void upsertBotSubscriber({
      chatId: check.playerId,
      username: typeof tgUser?.username === 'string' ? tgUser.username : '',
      firstName: typeof tgUser?.first_name === 'string' ? tgUser.first_name : '',
      source: 'miniapp',
    });
    res.json({
      ok: true,
      verified: true,
      mode: 'telegram',
      playerId: check.playerId,
      user: check.user,
      sessionToken,
    });
  });

  app.post('/api/telegram/webhook', async (req, res) => {
    const expectedSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (expectedSecret) {
      const providedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '').trim();
      if (providedSecret !== expectedSecret) {
        res.status(401).json({ ok: false });
        return;
      }
    }
    try {
      const processed = await processTelegramUpdate(req.body as TelegramUpdatePayload);
      if (processed) {
        recordServerLog('info', 'telegram_webhook', 'Processed Telegram webhook subscriber update');
      }
    } catch (err) {
      recordServerLog(
        'warn',
        'telegram_webhook',
        'Telegram webhook handler error',
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/auth', async (req, res) => {
    const ip = getClientIp(req);
    const body = req.body as {
      playerId?: string;
      initData?: string;
      passcode?: string;
      token?: string;
    };
    const rawPlayerId = String(body.playerId || '').trim();
    const rawInitData = String(body.initData || '').trim();
    const rawPasscode = String(body.passcode || '').trim();
    const authHeader = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const candidateToken = String(body.token || authHeader || '').trim();

    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];

    if (candidateToken) {
      const verified = verifySessionToken(candidateToken);
      if (verified?.role === 'admin' && isAdminPlayerId(verified.playerId, effectiveExtraAdmins)) {
        res.json({ ok: true, method: 'token', token: candidateToken });
        return;
      }
    }

    const sockAddr = String(req.socket?.remoteAddress || 'unknown').slice(0, 64);
    const failIpKey = `admin_auth_fail:${ip}:${sockAddr}`;
    const existingIpFails = (rateLimitBuckets.get(failIpKey) || []).filter(
      (ts) => ts > Date.now() - 15 * 60_000,
    );
    if (existingIpFails.length >= 15) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(((existingIpFails[0] ?? Date.now()) + 15 * 60_000 - Date.now()) / 1000),
      );
      res.status(429).json({
        ok: false,
        requiresPasscode: true,
        error: `Too many wrong passcode attempts. Wait ${retryAfterSec}s before trying again.`,
      });
      return;
    }

    const activeBotToken = getTelegramBotToken();
    let resolvedPlayerId = rawPlayerId;
    let initDataValid: boolean | null = null;
    let initDataReason: string | undefined;
    if (rawInitData && activeBotToken) {
      const verifiedInit = verifyTelegramInitData(rawInitData, activeBotToken, {
        allowClockSkew: true,
      });
      initDataValid = verifiedInit.valid;
      initDataReason = verifiedInit.reason;
      if (verifiedInit.valid && verifiedInit.playerId) {
        resolvedPlayerId = verifiedInit.playerId;
      } else if (!isValidSafeId(resolvedPlayerId) || !isAdminPlayerId(resolvedPlayerId, effectiveExtraAdmins)) {
        console.warn('[admin-auth] rejected_initdata', {
          ip,
          rawPlayerId,
          initDataValid,
          initDataReason,
          botTokenConfigured: Boolean(activeBotToken),
        });
        res.status(401).json({
          ok: false,
          error: 'Invalid or expired Telegram session signature.',
        });
        return;
      }
    }

    const isAuthorizedId =
      isValidSafeId(resolvedPlayerId) && isAdminPlayerId(resolvedPlayerId, effectiveExtraAdmins);

    if (!isAuthorizedId) {
      console.warn('[admin-auth] rejected_unauthorized_id', {
        ip,
        rawPlayerId,
        resolvedPlayerId,
        hasInitData: Boolean(rawInitData),
        initDataValid,
        initDataReason,
        botTokenConfigured: Boolean(activeBotToken),
      });
      res.status(403).json({
        ok: false,
        error: `Restricted to authorized Admin IDs (Primary: ${PRIMARY_ADMIN_TELEGRAM_ID}).`,
      });
      return;
    }

    const failIdKey = `admin_auth_fail_id:${resolvedPlayerId}`;
    const existingIdFails = (rateLimitBuckets.get(failIdKey) || []).filter(
      (ts) => ts > Date.now() - 15 * 60_000,
    );
    if (existingIdFails.length >= 15) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(((existingIdFails[0] ?? Date.now()) + 15 * 60_000 - Date.now()) / 1000),
      );
      res.status(429).json({
        ok: false,
        requiresPasscode: true,
        error: `Too many wrong passcode attempts for this Admin ID. Wait ${retryAfterSec}s.`,
      });
      return;
    }

    if (!rawPasscode) {
      res.status(401).json({
        ok: false,
        requiresPasscode: true,
        error: 'Enter your Admin Passcode to unlock the Admin Console.',
      });
      return;
    }

    const normalizedProvidedLen = normalizePasscodeInput(rawPasscode).length;
    const authResult = await verifyAdminPasscodeAsync(rawPasscode);
    console.info('[admin-auth] passcode_check', {
      ip,
      rawPlayerId,
      resolvedPlayerId,
      hasInitData: Boolean(rawInitData),
      initDataValid,
      initDataReason,
      botTokenConfigured: Boolean(activeBotToken),
      providedLen: normalizedProvidedLen,
      expectedLen: DEFAULT_ADMIN_PASSCODE.length,
      matched: authResult.ok,
    });
    if (!authResult.ok) {
      checkRateLimit(failIpKey, 15, 15 * 60_000);
      checkRateLimit(failIdKey, 15, 15 * 60_000);
      recordServerLog('warn', 'admin_auth', `Rejected admin passcode for ${resolvedPlayerId}`, `source=${authResult.source}`);
      res.status(403).json({
        ok: false,
        requiresPasscode: true,
        passcodeSource: authResult.source,
        error: 'Incorrect Admin Passcode. Please check and try again.',
      });
      return;
    }

    rateLimitBuckets.delete(failIpKey);
    rateLimitBuckets.delete(failIdKey);
    recordServerLog('info', 'admin_auth', `Admin Console unlocked by ${resolvedPlayerId}`, `source=${authResult.source}`);

    const token = signSessionToken({
      role: 'admin',
      playerId: resolvedPlayerId,
      method: 'passcode',
    });
    res.json({
      ok: true,
      method: 'passcode',
      token,
      passcodeSource: authResult.source,
      passcodeUpdatedAtMs: authResult.updatedAtMs,
    });
  });

  app.post('/api/admin/change-passcode', async (_req, res) => {
    res.status(403).json({
      ok: false,
      error: 'Admin passcode is locked in server.ts and cannot be changed from the Admin Panel.',
    });
  });

  app.post('/api/admin/broadcast/stats', async (req, res) => {
    const body = (req.body || {}) as {
      token?: string;
      initData?: string;
      excludeBanned?: boolean;
    };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const stats = await collectBroadcastAudienceDetails(body.excludeBanned !== false);
    res.json({
      ok: true,
      totalRecipients: stats.recipients.length,
      botSubscriberCount: stats.botSubscriberCount,
      blockedBotCount: stats.blockedBotCount,
      playerRecipientCount: stats.playerRecipientCount,
    });
  });

  app.get('/api/admin/broadcast/stats', async (req, res) => {
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: typeof req.query.token === 'string' ? req.query.token : undefined,
      initData: typeof req.query.initData === 'string' ? req.query.initData : undefined,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const excludeBanned = req.query.excludeBanned !== 'false';
    const stats = await collectBroadcastAudienceDetails(excludeBanned);
    res.json({
      ok: true,
      totalRecipients: stats.recipients.length,
      botSubscriberCount: stats.botSubscriberCount,
      blockedBotCount: stats.blockedBotCount,
      playerRecipientCount: stats.playerRecipientCount,
    });
  });

  app.post('/api/admin/telegram/sync-bot', async (req, res) => {
    const body = (req.body || {}) as { token?: string; initData?: string };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const poll = await pollTelegramBotUpdates();
    const stats = await collectBroadcastAudienceDetails(true);
    recordServerLog(
      poll.ok ? 'info' : 'warn',
      'bot_sync',
      `Manual bot subscriber sync: +${poll.newUpdates} updates, ${stats.recipients.length} total reachable`,
      poll.error,
    );
    res.json({
      ok: true,
      poll,
      totalRecipients: stats.recipients.length,
      botSubscriberCount: stats.botSubscriberCount,
      blockedBotCount: stats.blockedBotCount,
      playerRecipientCount: stats.playerRecipientCount,
    });
  });

  app.post('/api/admin/payout-template', async (req, res) => {
    const body = (req.body || {}) as {
      token?: string;
      initData?: string;
      messageTemplate?: string;
      buttonText?: string;
      buttonUrlTemplate?: string;
    };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const saved = await saveWithdrawApproveTemplateServer({
      messageTemplate: String(body.messageTemplate || ''),
      buttonText: String(body.buttonText ?? ''),
      buttonUrlTemplate: String(body.buttonUrlTemplate || ''),
    });
    recordServerLog('info', 'payout_template', `Payout approval DM template updated by ${resolvedPlayerId}`);
    res.json({ ok: true, template: saved });
  });

  app.post('/api/reminders/sync', (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`rem_sync:${ip}`, 40, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: 'Too many reminder sync requests.' });
      return;
    }

    const body = req.body as {
      playerId?: string;
      initData?: string;
      token?: string;
      enabled?: boolean;
      basketFullAtMs?: number;
      feedBoostUntilMs?: number;
      coopFeverUntilMs?: number;
      autoHarvestUntilMs?: number;
    };

    const activeBotToken = getTelegramBotToken();
    const rawPlayerId = String(body.playerId || '').trim();
    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: body.initData,
    });
    if ((body.initData || body.token) && !verifiedActor && activeBotToken) {
      res.status(401).json({ ok: false, error: 'Invalid Telegram session.' });
      return;
    }

    let playerId = verifiedActor || rawPlayerId;
    if (verifiedActor && rawPlayerId && verifiedActor !== rawPlayerId) {
      res.status(403).json({ ok: false, error: 'Session mismatch for reminder sync.' });
      return;
    }

    if (!isValidSafeId(playerId)) {
      res.status(400).json({ ok: false, error: 'Valid playerId required.' });
      return;
    }

    const telegramChatId = extractTelegramNumericUserId(playerId);
    if (!telegramChatId) {
      res.json({ ok: true, registered: false, reason: 'no_telegram_chat_id' });
      return;
    }

    if (activeBotToken && !verifiedActor) {
      res.status(401).json({
        ok: false,
        error: 'Verified Telegram session required to register push reminders.',
      });
      return;
    }

    const prev = reminderStore.get(playerId);
    const maxFutureMs = Date.now() + 31 * 86_400_000;
    const clampMs = (v: unknown) => {
      const n = Math.floor(Number(v) || 0);
      return Number.isFinite(n) && n > 0 ? Math.min(maxFutureMs, n) : 0;
    };

    const next: PlayerReminderRecord = {
      playerId,
      telegramChatId,
      enabled: body.enabled !== false,
      basketFullAtMs: clampMs(body.basketFullAtMs),
      feedBoostUntilMs: clampMs(body.feedBoostUntilMs),
      coopFeverUntilMs: clampMs(body.coopFeverUntilMs),
      autoHarvestUntilMs: clampMs(body.autoHarvestUntilMs),
      lastBasketSentForAt: prev?.lastBasketSentForAt ?? 0,
      lastFeedSentForAt: prev?.lastFeedSentForAt ?? 0,
      lastFeverSentForAt: prev?.lastFeverSentForAt ?? 0,
      lastDroneSentForAt: prev?.lastDroneSentForAt ?? 0,
      updatedAtMs: Date.now(),
    };

    reminderStore.set(playerId, next);
    persistRemindersToDisk();
    void upsertBotSubscriber({ chatId: telegramChatId, source: 'miniapp' });
    if (
      next.enabled &&
      ((next.basketFullAtMs > 0 && Date.now() >= next.basketFullAtMs) ||
        (next.feedBoostUntilMs > 0 && Date.now() >= next.feedBoostUntilMs) ||
        (next.coopFeverUntilMs > 0 && Date.now() >= next.coopFeverUntilMs) ||
        (next.autoHarvestUntilMs > 0 && Date.now() >= next.autoHarvestUntilMs))
    ) {
      void processDueReminders();
    }
    res.json({ ok: true, registered: true, enabled: next.enabled });
  });

  app.post('/api/referrals', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_direct:${ip}`, 40, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many requests.' });
      return;
    }
    const { userId, referrerId, displayName, handle, photoUrl } = (req.body || {}) as {
      userId?: string;
      referrerId?: string;
      displayName?: string;
      handle?: string;
      photoUrl?: string;
    };
    const cleanUserId = String(userId || '').trim();
    const cleanReferrerId = String(referrerId || '').trim();
    if (!cleanUserId || !cleanReferrerId) {
      res.status(400).json({ error: 'Missing userId or referrerId' });
      return;
    }

    const normUser = cleanUserId.replace(/^tg_/, '');
    const normRef = cleanReferrerId.replace(/^tg_/, '');
    if (cleanUserId === cleanReferrerId || (normUser && normRef && normUser === normRef)) {
      res.status(400).json({ error: 'Cannot refer yourself' });
      return;
    }

    saveReferral(cleanUserId, cleanReferrerId);

    // Best-effort sync with Firestore reward ledger & Bot DM notification
    let applyResult: Awaited<ReturnType<typeof applyReferralInServerDb>> | null = null;
    if (isValidSafeId(cleanUserId)) {
      const targetUid = /^\d{4,20}$/.test(cleanUserId) ? `tg_${cleanUserId}` : cleanUserId;
      applyResult = await applyReferralInServerDb({
        referredUid: targetUid,
        refCode: cleanReferrerId,
        displayName,
        handle,
        photoUrl,
      }).catch(() => null);
    }

    res.json({
      success: true,
      verified: true,
      status: 'verified',
      ...(applyResult?.applied
        ? {
            applied: true,
            referrerUid: applyResult.referrerUid,
            referrerName: applyResult.referrerName,
            coinsRewarded: applyResult.coinsRewarded,
          }
        : {}),
    });
  });

  app.get('/api/referrals', (req, res) => {
    const userId = String(req.query.userId || '').trim();
    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }
    const merged = getMergedReferralsForUser(userId);
    res.json({
      referrals: merged.referrals,
      referrer: merged.referrer,
      status: 'verified',
    });
  });

  // Synced Express Referral API (compatible with Telegram initData header/body & Firestore players/referrals schema)
  app.post('/api/referral/claim', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_claim:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: 'Too many referral attempts.' });
      return;
    }

    const body = (req.body || {}) as {
      initData?: string;
      token?: string;
      referrerId?: string | number;
      refCode?: string;
      displayName?: string;
      handle?: string;
      photoUrl?: string;
    };

    const auth = resolveTelegramUserFromRequest(req, body);
    if (!auth.valid || !auth.user || !auth.playerId) {
      res.status(401).json({ ok: false, error: auth.error || 'Invalid Telegram initData' });
      return;
    }

    const ensured = await ensurePlayerInServerDb(auth.user);
    const currentUid = ensured?.uid || auth.playerId;
    const currentUserId = extractTelegramNumericUserId(currentUid) || String(auth.user.id);

    const rawInviter = String(body.referrerId ?? body.refCode ?? '').trim();
    const strippedInviter = rawInviter.replace(/^(?:ref|r)_/i, '').trim();
    const inviterNumeric = /^\d{4,20}$/.test(strippedInviter)
      ? strippedInviter
      : extractTelegramNumericUserId(strippedInviter);

    if (!strippedInviter || strippedInviter.length < 3) {
      res.status(400).json({ ok: false, error: 'Invalid referrerId' });
      return;
    }

    if (
      strippedInviter === currentUid ||
      (inviterNumeric && currentUserId && inviterNumeric === currentUserId)
    ) {
      res.status(400).json({ ok: false, error: 'Self-referral not allowed' });
      return;
    }

    const tgFirst = String(auth.user.first_name || '').trim();
    const tgLast = String(auth.user.last_name || '').trim();
    const tgName = [tgFirst, tgLast].filter(Boolean).join(' ').trim();
    const tgHandle = auth.user.username ? `@${String(auth.user.username).replace(/^@+/, '')}` : '';

    const result = await applyReferralInServerDb({
      referredUid: currentUid,
      refCode: rawInviter,
      displayName: body.displayName || tgName,
      handle: body.handle || tgHandle,
      photoUrl: body.photoUrl || (typeof auth.user.photo_url === 'string' ? auth.user.photo_url : ''),
    });

    if (result.ok && result.alreadyLinked) {
      if (result.referrerUid) {
        saveReferral(currentUid, result.referrerUid);
      }
      deletePendingReferral(currentUserId);
      res.json({
        ok: true,
        claimed: false,
        applied: false,
        activated: Boolean(result.activated),
        referralActivated: Boolean(result.activated),
        alreadyLinked: true,
        reason: 'already_linked',
        message: 'Already referred',
        referrerUid: result.referrerUid,
        nextReferredCoins: result.nextReferredCoins,
      });
      return;
    }

    if (result.ok && result.applied) {
      if (result.referrerUid) {
        saveReferral(currentUid, result.referrerUid);
      }
      deletePendingReferral(currentUserId);
      res.json({
        ok: true,
        claimed: true,
        applied: true,
        activated: Boolean(result.activated),
        referralActivated: Boolean(result.activated),
        status: result.activated ? 'verified' : 'pending',
        bonusAwarded: result.coinsRewarded ?? 0,
        coinsRewarded: result.coinsRewarded ?? 0,
        referredBonusCoins: result.referredBonusCoins ?? REFERRED_WELCOME_BONUS_COINS,
        nextReferredCoins: result.nextReferredCoins,
        referrerUid: result.referrerUid,
        referrerName: result.referrerName,
        botDmSent: result.botDmSent,
      });
      return;
    }

    if (result.reason === 'self_referral') {
      deletePendingReferral(currentUserId);
      res.status(400).json({ ok: false, error: 'Self-referral not allowed' });
      return;
    }

    if (result.reason === 'invalid_code') {
      deletePendingReferral(currentUserId);
      res.status(404).json({ ok: false, error: 'Referrer not found', reason: 'invalid_code' });
      return;
    }

    res.status(result.statusCode || 500).json({
      ok: false,
      error: 'Referral claim failed',
      reason: result.reason,
    });
  });

  app.get('/api/referral/stats', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_stats:${ip}`, 60, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: 'Too many requests.' });
      return;
    }

    const auth = resolveTelegramUserFromRequest(req);
    if (!auth.valid || !auth.user || !auth.playerId) {
      res.status(401).json({ ok: false, error: auth.error || 'Missing Telegram initData' });
      return;
    }

    const ensured = await ensurePlayerInServerDb(auth.user);
    const currentUid = ensured?.uid || auth.playerId;
    const currentUserId = extractTelegramNumericUserId(currentUid) || String(auth.user.id);

    let playerData: Record<string, unknown> = ensured?.playerData || {};
    const fsReferrals = new Map<
      string,
      {
        id: string;
        uid: string;
        name: string;
        handle: string;
        bonus: number;
        coinsEarned: number;
        status: string;
        toppedUpUsd: number;
        date: string;
        createdAtMs: number;
      }
    >();

    if (serverDb) {
      try {
        const [playerSnap, refsSnap] = await Promise.all([
          getFreshDoc(doc(serverDb, 'players', currentUid)),
          getDocs(
            query(
              collection(serverDb, 'players', currentUid, 'referrals'),
              orderBy('createdAtMs', 'desc'),
              limit(200),
            ),
          ),
        ]);
        if (playerSnap.exists()) {
          playerData = playerSnap.data() as Record<string, unknown>;
        }
        for (const rDoc of refsSnap.docs) {
          const d = rDoc.data();
          const refUid = String(d.referredUid || rDoc.id || '').trim();
          if (!refUid) continue;
          const createdAtMs = Math.max(0, Number(d.createdAtMs ?? 0) || Date.now());
          const numId = extractTelegramNumericUserId(refUid);
          fsReferrals.set(numId || refUid, {
            id: numId || refUid,
            uid: refUid,
            name: String(d.referredName || 'Farmer'),
            handle: String(d.referredHandle || '@farmer'),
            bonus: Number(d.coinsEarned ?? BONUS_PER_REFERRAL),
            coinsEarned: Number(d.coinsEarned ?? BONUS_PER_REFERRAL),
            status: String(d.status || 'active'),
            toppedUpUsd: Number(d.toppedUpUsd ?? 0),
            date: new Date(createdAtMs).toISOString(),
            createdAtMs,
          });
        }
      } catch {
        // Merge gracefully with referralStorage below
      }
    }

    const mergedDisk = getMergedReferralsForUser(currentUid);
    for (const id of mergedDisk.referrals) {
      const cleanId = String(id || '').trim();
      if (!cleanId) continue;
      const numId = extractTelegramNumericUserId(cleanId) || cleanId;
      if (!fsReferrals.has(numId)) {
        const refUid = /^\d{4,20}$/.test(cleanId) ? `tg_${cleanId}` : cleanId;
        fsReferrals.set(numId, {
          id: numId,
          uid: refUid,
          name: `Farmer ${numId.slice(-4)}`,
          handle: `@tg_${numId}`,
          bonus: 0,
          coinsEarned: 0,
          status: 'pending',
          toppedUpUsd: 0,
          date: new Date().toISOString(),
          createdAtMs: Date.now(),
        });
      }
    }

    const referralsList = Array.from(fsReferrals.values()).sort(
      (a, b) => b.createdAtMs - a.createdAtMs,
    );
    const referralCount = Math.max(
      Number(playerData.referralCount ?? 0) || 0,
      referralsList.length,
    );
    const bonus = Number(playerData.referralCoinsEarned ?? 0) || 0;
    const invitedByRaw = String(playerData.referredBy || mergedDisk.referrer || '').trim();

    res.json({
      ok: true,
      userId: Number(currentUserId) || currentUserId,
      playerUid: currentUid,
      bonus,
      totalReferrals: referralsList.length,
      referralCount,
      invitedBy: invitedByRaw || null,
      referrals: referralsList,
    });
  });

  app.post('/api/referrals/apply', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_apply:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, applied: false, error: 'Too many referral attempts.' });
      return;
    }

    const body = (req.body || {}) as {
      playerId?: string;
      refCode?: string;
      displayName?: string;
      handle?: string;
      photoUrl?: string;
      initData?: string;
      token?: string;
    };

    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: body.initData,
    });
    const rawPlayerId = String(body.playerId || '').trim();
    const referredUid = verifiedActor || rawPlayerId;

    const result = await applyReferralInServerDb({
      referredUid,
      refCode: String(body.refCode || ''),
      displayName: body.displayName,
      handle: body.handle,
      photoUrl: body.photoUrl,
    });

    if (result.ok && result.referrerUid && referredUid) {
      saveReferral(referredUid, result.referrerUid);
    }

    const numId = extractTelegramNumericUserId(referredUid);
    if (
      numId &&
      result.ok &&
      (result.applied ||
        result.reason === 'already_linked' ||
        result.reason === 'self_referral' ||
        result.reason === 'invalid_code')
    ) {
      deletePendingReferral(numId);
    }

    const { statusCode, ...payload } = result;
    if (statusCode && statusCode >= 400) {
      res.status(statusCode).json({
        ...payload,
        ...(statusCode === 500 ? { error: 'Failed to apply referral.' } : {}),
      });
      return;
    }
    res.json({
      ...payload,
      ...(payload.applied || payload.alreadyLinked ? { status: 'verified' } : {}),
    });
  });

  app.post('/api/referrals/claim-pending', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_claim_pend:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, applied: false, error: 'Too many requests.' });
      return;
    }

    const body = (req.body || {}) as {
      playerId?: string;
      displayName?: string;
      handle?: string;
      photoUrl?: string;
      initData?: string;
      token?: string;
    };

    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: body.initData,
    });
    const rawPlayerId = String(body.playerId || '').trim();
    const targetUid = verifiedActor || (isValidSafeId(rawPlayerId) ? rawPlayerId : '');
    const numericId = extractTelegramNumericUserId(targetUid);
    if (!numericId) {
      res.json({ ok: true, applied: false, reason: 'no_telegram_user' });
      return;
    }
    const resolvedUid = `tg_${numericId}`;

    // If user tapped bottom-left "Open" immediately after /start, flush pending bot updates right now
    if (!pendingReferralMap.has(numericId) && getTelegramBotToken()) {
      await pollTelegramBotUpdates();
    }

    const pending = pendingReferralMap.get(numericId);
    if (pending) {
      const result = await applyReferralInServerDb({
        referredUid: resolvedUid,
        refCode: pending.refCode,
        displayName: body.displayName || pending.displayName,
        handle: body.handle || pending.handle,
        photoUrl: body.photoUrl,
      });
      if (
        result.ok &&
        (result.applied ||
          result.reason === 'already_linked' ||
          result.reason === 'self_referral' ||
          result.reason === 'invalid_code')
      ) {
        deletePendingReferral(numericId);
      }
      if (result.ok && result.applied) {
        res.json({
          ok: true,
          applied: true,
          alreadyApplied: false,
          activated: Boolean(result.activated),
          referralActivated: Boolean(result.activated),
          referrerUid: result.referrerUid,
          referrerName: result.referrerName,
          coinsRewarded: result.coinsRewarded ?? 0,
          referredBonusCoins: result.referredBonusCoins ?? REFERRED_WELCOME_BONUS_COINS,
          nextReferredCoins: result.nextReferredCoins,
        });
        return;
      }
    }

    // Check if /start already wrote referredBy into Firestore before Mini App loaded
    if (serverDb) {
      try {
        const snap = await getFreshDoc(doc(serverDb, 'players', resolvedUid));
        if (snap.exists()) {
          const data = snap.data();
          const referredBy = String(data?.referredBy || '').trim();
          if (referredBy) {
            deletePendingReferral(numericId);
            res.json({
              ok: true,
              applied: false,
              alreadyApplied: true,
              activated: Boolean(data?.referralActivated),
              referralActivated: Boolean(data?.referralActivated),
              referrerUid: referredBy,
              nextReferredCoins: Number(data?.coins ?? 0),
            });
            return;
          }
        }
      } catch {
        // Non-fatal
      }
    }

    res.json({ ok: true, applied: false, alreadyApplied: false });
  });

  app.post('/api/referrals/activate', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_activate:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, error: 'Too many requests.' });
      return;
    }

    const body = (req.body || {}) as {
      referredUid?: string;
      referrerUid?: string;
      referredName?: string;
      referredHandle?: string;
      initData?: string;
      token?: string;
    };

    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: body.initData,
    });
    const rawReferredUid = String(body.referredUid || '').trim();
    const targetUid = verifiedActor || (isValidSafeId(rawReferredUid) ? rawReferredUid : '');
    if (!targetUid) {
      res.status(400).json({ ok: false, error: 'Valid referredUid required' });
      return;
    }

    const result = await activateReferralInServerDb({
      referredUid: targetUid,
      referrerUidHint: body.referrerUid,
      referredName: body.referredName,
      referredHandle: body.referredHandle,
    });

    res.json(result);
  });

  app.post('/api/referrals/notify', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ref_notify:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, sent: false, reason: 'Rate limit exceeded' });
      return;
    }

    const body = req.body as {
      event?: 'referral_joined' | 'deposit_commission';
      referrerUid?: string;
      referredUid?: string;
      referredName?: string;
      referredHandle?: string;
      rewardCoins?: number;
      depositGram?: string;
      depositUsd?: number;
      initData?: string;
      token?: string;
    };

    const referrerUid = String(body.referrerUid || '').trim();
    const referredUid = String(body.referredUid || '').trim();
    const numericReferrerId = extractTelegramNumericUserId(referrerUid);
    const event = body.event === 'deposit_commission' ? 'deposit_commission' : 'referral_joined';
    const rewardCoins =
      event === 'referral_joined'
        ? REFERRER_SIGNUP_BONUS_COINS
        : Math.min(10_000, Math.max(0, Math.round(Number(body.rewardCoins ?? 0))));

    if (!isValidSafeId(referrerUid) || !numericReferrerId) {
      res.json({
        ok: true,
        sent: false,
        reason: 'Referrer does not have a Telegram numeric chat ID',
      });
      return;
    }

    if (!isValidSafeId(referredUid)) {
      res.status(400).json({ ok: false, sent: false, reason: 'Valid referredUid required' });
      return;
    }

    const verifiedActor = resolveVerifiedPlayerActor({
      req,
      token: body.token,
      initData: body.initData,
    });
    const activeBotToken = getTelegramBotToken();

    if (serverDb) {
      try {
        const refSnap = await getFreshDoc(doc(serverDb, 'players', referrerUid, 'referrals', referredUid));
        if (!refSnap.exists()) {
          const referredSnap = await getFreshDoc(doc(serverDb, 'players', referredUid));
          const linkedReferrer = referredSnap.exists() ? String(referredSnap.data()?.referredBy || '') : '';
          if (linkedReferrer !== referrerUid) {
            res.status(403).json({ ok: false, sent: false, reason: 'Unverified referral relationship' });
            return;
          }
        }
      } catch {
        res.status(503).json({
          ok: false,
          sent: false,
          reason: 'Database verification temporarily unavailable',
        });
        return;
      }
    } else if (activeBotToken && (!verifiedActor || verifiedActor !== referredUid)) {
      res.status(401).json({ ok: false, sent: false, reason: 'Verified session required' });
      return;
    }

    const dedupKey = `${event}:${referrerUid}:${referredUid || rewardCoins}:${String(body.depositGram || '')}`;
    const prevSentAt = referralNotifyDedup.get(dedupKey);
    if (prevSentAt && Date.now() - prevSentAt < 60_000) {
      res.json({ ok: true, sent: false, reason: 'Duplicate notification suppressed' });
      return;
    }

    if (!activeBotToken) {
      res.json({
        ok: true,
        sent: false,
        reason: 'TELEGRAM_BOT_TOKEN not configured on server',
      });
      return;
    }

    let referrerTotalReferrals: number | undefined;
    let referrerTotalCoins: number | undefined;
    if (serverDb) {
      try {
        const refPlayerSnap = await getFreshDoc(doc(serverDb, 'players', referrerUid));
        if (refPlayerSnap.exists()) {
          const rpd = refPlayerSnap.data();
          const rc = Number(rpd.referralCount ?? 0);
          const re = Number(rpd.referralCoinsEarned ?? 0);
          if (Number.isFinite(rc) && rc > 0) referrerTotalReferrals = rc;
          if (Number.isFinite(re) && re > 0) referrerTotalCoins = re;
        }
      } catch {
        // Optional enrichment
      }
    }

    const messageText = buildReferralBotNotificationMessage({
      event,
      referredName: body.referredName,
      referredHandle: body.referredHandle,
      rewardCoins,
      depositGram: body.depositGram,
      depositUsd: body.depositUsd,
      totalReferrals: referrerTotalReferrals,
      totalReferralCoins: referrerTotalCoins,
    });

    const botUsername = getFastBotUsername();
    const friendsButton = buildDirectPrivateMiniAppButton(
      '👥 View Friends & Rewards',
      botUsername,
      'friends',
    );

    try {
      let tgRes = await fetch(
        `https://api.telegram.org/bot${activeBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: numericReferrerId,
            text: messageText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[friendsButton]],
            },
          }),
          signal: AbortSignal.timeout(7000),
        },
      );
      let tgData = (await tgRes.json()) as {
        ok?: boolean;
        error_code?: number;
        description?: string;
      };
      if (!tgData.ok && tgData.error_code === 400 && String(tgData.description || '').toLowerCase().includes('parse')) {
        tgRes = await fetch(
          `https://api.telegram.org/bot${activeBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: numericReferrerId,
              text: messageText.replace(/<\/?[^>]+>/g, ''),
            }),
            signal: AbortSignal.timeout(7000),
          },
        );
        tgData = (await tgRes.json()) as typeof tgData;
      }
      if (tgData.ok) {
        if (referralNotifyDedup.size > 1000) referralNotifyDedup.clear();
        referralNotifyDedup.set(dedupKey, Date.now());
        void upsertBotSubscriber({
          chatId: numericReferrerId,
          source: 'miniapp',
          isBotBlocked: false,
        });
      } else if (tgData.error_code === 403) {
        void markBotSubscriberBlocked(numericReferrerId, true);
      }
      const errReason = tgData.ok
        ? undefined
        : redactBotToken(tgData.description || 'Telegram API error');
      recordServerLog(
        tgData.ok ? 'info' : 'warn',
        'referral_notify',
        `Referral DM (${event}) to ${numericReferrerId}: ${tgData.ok ? 'sent' : 'failed'}`,
        errReason,
      );
      res.json({
        ok: true,
        sent: Boolean(tgData.ok),
        reason: errReason,
      });
    } catch (err) {
      const errReason = redactBotToken(err instanceof Error ? err.message : 'Telegram request failed');
      recordServerLog('warn', 'referral_notify', `Referral DM (${event}) error for ${numericReferrerId}`, errReason);
      res.json({
        ok: true,
        sent: false,
        reason: errReason,
      });
    }
  });

  app.post('/api/economy/validate-promo', async (req, res) => {
    const body = req.body as { code?: string };
    const code = String(body.code || '').trim().toUpperCase();
    if (!code || code.length < 2) {
      res.status(400).json({ valid: false, error: 'Promo code is required.' });
      return;
    }

    if (serverDb) {
      try {
        const snap = await getDoc(doc(serverDb, 'promo_codes', code));
        if (snap.exists()) {
          const d = snap.data();
          const maxUses = Number(d.maxUses ?? 0);
          const usedCount = Number(d.usedCount ?? 0);
          const expiresAtMs = Number(d.expiresAtMs ?? 0);
          if (d.isActive === false) {
            res.json({ valid: false, error: `Promo code ${code} is paused.` });
            return;
          }
          if (expiresAtMs > 0 && Date.now() > expiresAtMs) {
            res.json({ valid: false, error: `Promo code ${code} has expired.` });
            return;
          }
          if (maxUses > 0 && usedCount >= maxUses) {
            res.json({ valid: false, error: `Promo code ${code} reached max redemptions.` });
            return;
          }
          res.json({
            valid: true,
            source: 'dynamic',
            code,
            coins: Number(d.coins ?? 0),
            label: String(d.label || 'Promo Bonus'),
          });
          return;
        }
      } catch {
        // Fall through to static promo catalog
      }
    }

    const staticMatch = PROMO_CODES[code];
    if (staticMatch) {
      res.json({
        valid: true,
        source: 'builtin',
        code,
        coins: staticMatch.coins,
        label: staticMatch.label,
      });
      return;
    }

    res.json({ valid: false, error: 'Invalid promo code.' });
  });

  app.post('/api/deposits/check-gram', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`dep_chk:${ip}`, 35, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ error: `Too many deposit checks. Retry in ${rl.retryAfterSec}s.` });
      return;
    }

    const body = req.body as {
      playerId?: string;
      claimedTxHashes?: string[];
    };

    const playerId = String(body.playerId || '').trim();
    if (!isValidSafeId(playerId)) {
      res.status(400).json({ error: 'Valid User ID is required.' });
      return;
    }
    const memo = getPrimaryDepositMemo(playerId);
    const acceptedMemos = buildAcceptedDepositMemos(playerId);
    const clientClaimed = Array.isArray(body.claimedTxHashes)
      ? body.claimedTxHashes.slice(0, 100).map((s) => String(s).slice(0, 128))
      : [];
    const dbClaimed = await loadFirestoreClaimedTxHashes();
    const allClaimed = [...clientClaimed, ...dbClaimed, ...Array.from(processedServerTxHashes)];

    if (acceptedMemos.length === 0) {
      res.status(400).json({ error: 'Valid User ID memo is required for automatic deposit detection.' });
      return;
    }

    try {
      const rawDepositAddress = await resolveRawDepositAddress();
      const rawJettonMaster =
        friendlyTonAddressToRaw(GRAM_JETTON_MASTER) || OFFICIAL_GRAM_RAW_MASTER;
      const events: TonApiEvent[] = [];
      const rejected: RejectedGramTransfer[] = [];

      try {
        const listRes = await fetch(
          `https://tonapi.io/v2/accounts/${encodeURIComponent(GRAM_DEPOSIT_ADDRESS)}/events?limit=25`,
          { signal: AbortSignal.timeout(7000) },
        );
        if (listRes.ok) {
          const payload = (await listRes.json()) as { events?: TonApiEvent[] };
          events.push(...(payload.events || []));
        }
      } catch {
        // Continue to TON Center fallback
      }

      let matched = matchGramTransfersFromTonApiEvents({
        events,
        rawDepositAddress,
        memo,
        acceptedMemos,
        claimedTxHashes: allClaimed,
        gramJettonRawOrFriendly: GRAM_JETTON_MASTER,
        onRejected: (info) => rejected.push(info),
      });

      if (matched.length === 0 && TONCENTER_API_KEY) {
        try {
          const tcUrl = `https://toncenter.com/api/v3/jetton/transfers?owner_address=${encodeURIComponent(
            GRAM_DEPOSIT_ADDRESS,
          )}&jetton_master=${encodeURIComponent(GRAM_JETTON_MASTER)}&direction=in&limit=25`;
          const tcRes = await fetch(tcUrl, {
            headers: { 'X-API-Key': TONCENTER_API_KEY },
            signal: AbortSignal.timeout(7000),
          });
          if (tcRes.ok) {
            const tcPayload = (await tcRes.json()) as {
              jetton_transfers?: TonCenterJettonTransfer[];
            };
            matched = matchGramTransfersFromTonCenter({
              transfers: tcPayload.jetton_transfers || [],
              rawDepositAddress,
              memo,
              acceptedMemos,
              claimedTxHashes: allClaimed,
              gramJettonMasterRaw: rawJettonMaster,
              onRejected: (info) => rejected.push(info),
            });
          }
        } catch {
          // Ignore TON Center transient errors
        }
      }

      const freshlyMatched = [];
      for (const m of matched) {
        processedServerTxHashes.add(m.txHash.toLowerCase());
        const norm = normalizeTxHash(m.txHash);
        if (norm) processedServerTxHashes.add(norm);
        const isNewOnLedger = await persistServerTxHashToFirestore(
          m.txHash,
          playerId,
          m.coinsToCredit,
        );
        if (isNewOnLedger) {
          freshlyMatched.push(m);
        }
      }

      let scannerWarning: string | undefined;
      if (freshlyMatched.length === 0 && rejected.length > 0) {
        if (rejected.some((r) => r.reason === 'pending')) {
          scannerWarning =
            'Payment detected on TON and awaiting blockchain finality — coins will credit once confirmed.';
        } else if (rejected.some((r) => r.reason === 'below_min')) {
          scannerWarning = `Transfer detected, but it is below the ${MIN_DEPOSIT_COINS.toLocaleString()} coins minimum deposit.`;
        } else if (rejected.some((r) => r.reason === 'above_max')) {
          scannerWarning = `Transfer detected, but it exceeds the ${MAX_DEPOSIT_COINS.toLocaleString()} coins maximum deposit.`;
        } else if (rejected.some((r) => r.reason === 'spam' || r.reason === 'fake_token')) {
          scannerWarning =
            'Ignored unverified or spam token transfer — only official GRAM Jetton transfers are accepted.';
        }
      }

      res.json({
        checkedAt: Date.now(),
        depositAddress: GRAM_DEPOSIT_ADDRESS,
        found: freshlyMatched.length > 0,
        transfers: freshlyMatched,
        ...(scannerWarning ? { scannerWarning } : {}),
      });
    } catch {
      res.json({
        checkedAt: Date.now(),
        depositAddress: GRAM_DEPOSIT_ADDRESS,
        found: false,
        transfers: [],
        scannerWarning: 'TON network check timed out; retrying automatically.',
      });
    }
  });

  app.post('/api/withdraw/notify', async (req, res) => {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`wd_notify:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      res.status(429).json({ ok: false, sent: false, reason: 'Too many requests' });
      return;
    }

    const body = req.body as {
      withdrawalId?: string;
      token?: string;
      initData?: string;
      displayName?: string;
      handle?: string;
      playerId?: string;
      eggsAmount?: number;
      gramAmount?: string;
      usdValue?: number;
      walletAddress?: string;
      memo?: string;
      status?: 'pending' | 'approved' | 'rejected';
      adminNote?: string;
    };

    const status = body.status === 'approved' || body.status === 'rejected' ? body.status : 'pending';
    const withdrawalId = String(body.withdrawalId || '').trim();

    if (status === 'approved' || status === 'rejected') {
      const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
      const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
      const verifiedAdmin = resolveVerifiedAdminActor({
        req,
        token: body.token,
        initData: body.initData,
        extraAdminIds: effectiveExtraAdmins,
      });
      if (!verifiedAdmin) {
        res.status(403).json({
          ok: false,
          sent: false,
          reason: 'Admin authorization required for payout approval notifications.',
        });
        return;
      }
    }

    let authUserId = String(body.playerId || '').slice(0, 64);
    let authTxId = String(withdrawalId || '').slice(0, 64);
    let authDisplayName = String(body.displayName || 'Farmer').slice(0, 60);
    let authHandle = String(body.handle || '@farmer').slice(0, 40);
    let authEggs = Number(body.eggsAmount || 0);
    let authGram = String(body.gramAmount || '0');
    let authUsd = Number(body.usdValue || 0);
    let authWallet = String(body.walletAddress || '').slice(0, 128);
    let authMemo = String(body.memo || '').slice(0, 64);

    const activeBotToken = getTelegramBotToken();
    if (serverDb) {
      if (!isValidSafeId(withdrawalId)) {
        res.status(400).json({ ok: false, sent: false, reason: 'Valid withdrawalId required.' });
        return;
      }
      try {
        let wdSnap = await getFreshDoc(doc(serverDb, 'withdraw_requests', withdrawalId));
        if (
          (!wdSnap.exists() || String(wdSnap.data()?.status || '') !== status) &&
          (status === 'approved' || status === 'rejected')
        ) {
          await new Promise((r) => setTimeout(r, 350));
          wdSnap = await getFreshDoc(doc(serverDb, 'withdraw_requests', withdrawalId));
        }

        let wdData: Record<string, unknown> | null = wdSnap.exists() ? wdSnap.data() : null;
        if (!wdData && authUserId && isValidSafeId(authUserId)) {
          const userWdSnap = await getFreshDoc(doc(serverDb, 'players', authUserId, 'withdrawals', withdrawalId));
          if (userWdSnap.exists()) {
            wdData = userWdSnap.data();
          }
        }
        if (!wdData) {
          res.status(403).json({ ok: false, sent: false, reason: 'Withdrawal record not found in database.' });
          return;
        }
        if (String(wdData.status || '') !== status) {
          res.status(403).json({ ok: false, sent: false, reason: 'Withdrawal status mismatch.' });
          return;
        }
        authUserId = String(wdData.userId || authUserId);
        authTxId = String(wdData.txId || withdrawalId || authTxId);
        authDisplayName = String(wdData.displayName || authDisplayName);
        authHandle = String(wdData.handle || authHandle);
        authEggs = Number(wdData.eggsAmount ?? authEggs);
        authGram = String(wdData.gramAmount || authGram);
        authUsd = Number(wdData.usdValue ?? authUsd);
        authWallet = String(wdData.walletAddress || authWallet);
        authMemo = String(wdData.memo || authMemo);
      } catch {
        res.status(503).json({
          ok: false,
          sent: false,
          reason: 'Database verification temporarily unavailable.',
        });
        return;
      }
    } else if (status === 'pending' && activeBotToken) {
      const verifiedPlayer = resolveVerifiedPlayerActor({
        req,
        token: body.token,
        initData: body.initData,
      });
      if (!verifiedPlayer) {
        res.status(401).json({ ok: false, sent: false, reason: 'Invalid session' });
        return;
      }
    }

    const dedupKey = `${withdrawalId || authWallet}:${status}`;
    const prevWd = withdrawNotifyDedup.get(dedupKey);
    if (prevWd && Date.now() - prevWd < 60_000) {
      res.json({ ok: true, sent: false, channel: TELEGRAM_PAYOUT_CHANNEL, reason: 'Duplicate suppressed' });
      return;
    }
    withdrawNotifyDedup.set(dedupKey, Date.now());
    if (withdrawNotifyDedup.size > 1000) withdrawNotifyDedup.clear();

    const displayName = escapeHtml(authDisplayName);
    const eggsAmount = Math.max(0, Math.floor(authEggs));
    const gramAmount = escapeHtml(authGram);
    const usdValue = Math.max(0, authUsd).toFixed(4);
    const maskedWallet = formatShortTonWallet(authWallet);
    const safeMaskedWallet = escapeHtml(maskedWallet || 'TON Wallet');
    const rawAdminNote = String(body.adminNote || '').slice(0, 120);
    const adminNote = escapeHtml(rawAdminNote);
    const isPublicTxNote =
      /^[a-fA-F0-9]{64}$/.test(rawAdminNote.trim()) || /^https:\/\/[^\s]+$/i.test(rawAdminNote.trim());

    if (!activeBotToken) {
      res.json({
        ok: true,
        sent: false,
        userDmSent: false,
        userDmReason: 'TELEGRAM_BOT_TOKEN not configured on server',
        channel: TELEGRAM_PAYOUT_CHANNEL,
        reason: 'TELEGRAM_BOT_TOKEN not configured on server',
      });
      return;
    }

    const activeTemplate = status === 'approved' ? await loadWithdrawApproveTemplate() : null;
    const botUsername = await resolveTelegramBotUsername();
    const miniAppUrl = buildTelegramMiniAppLink(botUsername);

    let channelPayload: Record<string, unknown>;
    let channelPlainFallback = '';
    if (status === 'approved') {
      const chRendered = renderPayoutChannelApproveMessage({
        template: activeTemplate,
        gramAmount: authGram,
        eggsAmount,
        walletAddress: authWallet,
        usdValue: Math.max(0, authUsd),
        displayName: authDisplayName,
        txId: authTxId,
        adminNote: rawAdminNote,
        miniAppUrl,
      });
      channelPlainFallback = chRendered.plainText;
      channelPayload = {
        chat_id: TELEGRAM_PAYOUT_CHANNEL,
        text: chRendered.htmlText,
        parse_mode: 'HTML',
        ...(chRendered.buttonText && /^https:\/\//i.test(chRendered.buttonUrl)
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: chRendered.buttonText, url: chRendered.buttonUrl }]],
              },
            }
          : {}),
      };
    } else {
      const statusLine =
        status === 'rejected'
          ? '❌ <b>Status:</b> Rejected (Eggs Refunded)'
          : '⏳ <b>Status:</b> Pending Admin Approval';
      const chLines = [
        status === 'rejected'
          ? '⚠️ <b>Alpha Gram Payout Rejected</b>'
          : '🐔 <b>Alpha Gram Payout Request</b>',
        '',
        `👤 <b>Farmer:</b> ${displayName}`,
        `🥚 <b>Eggs:</b> ${eggsAmount.toLocaleString()}`,
        `💎 <b>Amount:</b> ${gramAmount} GRAM ($${usdValue})`,
        `🏦 <b>TON Wallet:</b> <code>${safeMaskedWallet}</code>`,
        ...(isPublicTxNote && adminNote ? [`💬 <b>Ref:</b> ${adminNote}`] : []),
        statusLine,
      ];
      channelPlainFallback = chLines.join('\n').replace(/<\/?[^>]+>/g, '');
      channelPayload = {
        chat_id: TELEGRAM_PAYOUT_CHANNEL,
        text: chLines.join('\n'),
        parse_mode: 'HTML',
      };
    }

    let channelSent = false;
    let channelReason: string | undefined;
    try {
      let tgRes = await fetch(
        `https://api.telegram.org/bot${activeBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(channelPayload),
          signal: AbortSignal.timeout(7000),
        },
      );
      let tgData = (await tgRes.json()) as {
        ok?: boolean;
        error_code?: number;
        description?: string;
      };
      if (!tgData.ok && tgData.error_code === 400) {
        tgRes = await fetch(
          `https://api.telegram.org/bot${activeBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: TELEGRAM_PAYOUT_CHANNEL,
              text: channelPlainFallback || String(channelPayload.text || '').replace(/<\/?[^>]+>/g, ''),
            }),
            signal: AbortSignal.timeout(7000),
          },
        );
        tgData = (await tgRes.json()) as typeof tgData;
      }
      channelSent = Boolean(tgData.ok);
      channelReason = tgData.ok ? undefined : redactBotToken(tgData.description || 'Telegram API error');
    } catch (err) {
      channelReason = redactBotToken(err instanceof Error ? err.message : 'Telegram request failed');
    }

    let userDmSent = false;
    let userDmReason: string | undefined;
    const userNumericId = extractTelegramNumericUserId(authUserId);
    if ((status === 'approved' || status === 'rejected') && userNumericId) {
      try {
        let dmPayload: Record<string, unknown>;
        let plainFallbackText = '';
        if (status === 'approved') {
          const rendered = renderWithdrawApproveMessage({
            template: activeTemplate,
            gramAmount: authGram,
            eggsAmount,
            walletAddress: authWallet,
            usdValue: Math.max(0, authUsd),
            displayName: authDisplayName,
            handle: authHandle,
            txId: authTxId,
            memo: authMemo,
            adminNote: rawAdminNote,
          });
          plainFallbackText = rendered.plainText;
          dmPayload = {
            chat_id: userNumericId,
            text: rendered.htmlText,
            parse_mode: 'HTML',
            ...(rendered.buttonText && /^https:\/\//i.test(rendered.buttonUrl)
              ? {
                  reply_markup: {
                    inline_keyboard: [[{ text: rendered.buttonText, url: rendered.buttonUrl }]],
                  },
                }
              : {}),
          };
        } else {
          const rejLines = [
            '❌ <b>Withdrawal Rejected</b>',
            '',
            `Your withdrawal request of <b>${gramAmount} GRAM</b> could not be processed and <b>${eggsAmount.toLocaleString()} Eggs</b> have been refunded to your farm balance.`,
            ...(adminNote ? ['', `💬 <b>Note:</b> ${adminNote}`] : []),
          ];
          plainFallbackText = rejLines.join('\n').replace(/<\/?[^>]+>/g, '');
          dmPayload = {
            chat_id: userNumericId,
            text: rejLines.join('\n'),
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '🐔 Open Alpha Gram', url: miniAppUrl }]],
            },
          };
        }

        let dmRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dmPayload),
          signal: AbortSignal.timeout(7000),
        });
        let dmData = (await dmRes.json()) as { ok?: boolean; error_code?: number; description?: string };
        if (!dmData.ok && dmData.error_code === 400) {
          // Retry with plain text and without reply_markup in case HTML entities or button URL caused Telegram 400
          dmRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: userNumericId,
              text: plainFallbackText || String(dmPayload.text || '').replace(/<\/?[^>]+>/g, ''),
            }),
            signal: AbortSignal.timeout(7000),
          });
          dmData = (await dmRes.json()) as { ok?: boolean; error_code?: number; description?: string };
        }
        userDmSent = Boolean(dmData.ok);
        if (!dmData.ok) {
          userDmReason = redactBotToken(dmData.description || 'User DM failed');
          if (dmData.error_code === 403) {
            await markBotSubscriberBlocked(userNumericId, true);
          }
        } else {
          await upsertBotSubscriber({ chatId: userNumericId, source: 'miniapp', isBotBlocked: false });
        }
      } catch (err) {
        userDmReason = redactBotToken(err instanceof Error ? err.message : 'User DM request failed');
      }
    } else if (status === 'approved' || status === 'rejected') {
      userDmReason = 'User does not have a Telegram numeric chat ID';
    }

    recordServerLog(
      channelSent || userDmSent ? 'info' : 'warn',
      'withdraw_notify',
      `Withdrawal ${status} notification (${authGram} GRAM): channel=${channelSent ? 'sent' : 'failed'}${status !== 'pending' ? `, dm=${userDmSent ? 'sent' : 'failed'}` : ''}`,
      [channelReason, userDmReason].filter(Boolean).join(' · ') || undefined,
    );

    res.json({
      ok: true,
      sent: channelSent,
      channel: TELEGRAM_PAYOUT_CHANNEL,
      userDmSent,
      ...(userDmReason ? { userDmReason } : {}),
      ...(channelReason ? { reason: channelReason } : {}),
    });
  });

  app.post('/api/admin/maintenance', async (req, res) => {
    const body = (req.body || {}) as {
      token?: string;
      initData?: string;
      enabled?: boolean;
      title?: string;
      message?: string;
      estimatedReturn?: string;
    };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    const saved = await saveMaintenanceConfigOnServer(
      {
        enabled: Boolean(body.enabled),
        title: body.title,
        message: body.message,
        estimatedReturn: body.estimatedReturn,
      },
      resolvedPlayerId,
    );
    recordServerLog(
      saved.enabled ? 'warn' : 'info',
      'maintenance',
      `Maintenance Mode ${saved.enabled ? 'ENABLED' : 'DISABLED'} by ${resolvedPlayerId}`,
      saved.title,
    );
    res.json({ ok: true, maintenance: saved });
  });

  app.post('/api/admin/data-reset', async (req, res) => {
    const body = (req.body || {}) as { token?: string; initData?: string; confirm?: string };
    const firestoreAdminIds = await loadExtraAdminIdsFromFirestore();
    const effectiveExtraAdmins = [...ADMIN_TELEGRAM_IDS, ...firestoreAdminIds];
    const resolvedPlayerId = resolveVerifiedAdminActor({
      req,
      token: body.token,
      initData: body.initData,
      extraAdminIds: effectiveExtraAdmins,
    });
    if (!resolvedPlayerId) {
      res.status(403).json({ ok: false, error: 'Verified Admin session required.' });
      return;
    }
    if (String(body.confirm || '').trim().toUpperCase() !== 'RESET') {
      res.status(400).json({ ok: false, error: 'Confirmation text "RESET" is required.' });
      return;
    }

    const nowMs = Date.now();
    const deadlineMs = nowMs + 15_000;
    const isTimedOut = () => Date.now() >= deadlineMs;
    const resetTokens = encodeAchievementsWithAds([], 0, { resetEpochMs: nowMs });
    let playersResetCount = 0;
    let referralsDeletedCount = 0;
    let tasksDeletedCount = 0;
    let promosDeletedCount = 0;
    let bansDeletedCount = 0;
    let withdrawalsRejectedCount = 0;

    const withResetStepTimeout = <T>(
      promise: Promise<T>,
      ms: number,
      label: string,
    ): Promise<T> => {
      let timerId: ReturnType<typeof setTimeout> | null = null;
      return Promise.race([
        promise.finally(() => {
          if (timerId) clearTimeout(timerId);
        }),
        new Promise<never>((_, reject) => {
          timerId = setTimeout(
            () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
            ms,
          );
        }),
      ]);
    };

    try {
      if (serverDb) {
        const runConcurrent = async <T>(
          items: readonly T[],
          concurrency: number,
          worker: (item: T) => Promise<void>,
        ): Promise<void> => {
          for (let i = 0; i < items.length; i += concurrency) {
            if (isTimedOut()) break;
            await Promise.allSettled(items.slice(i, i + concurrency).map((item) => worker(item)));
          }
        };

        const deleteCollectionPaged = async (colName: string, pageSize: number): Promise<number> => {
          let removed = 0;
          let lastCursor: QueryDocumentSnapshot<DocumentData> | null = null;
          for (let page = 0; page < 50; page++) {
            if (isTimedOut()) break;
            const colQ: Query<DocumentData> = lastCursor
              ? query(
                  collection(serverDb!, colName),
                  orderBy('__name__'),
                  startAfter(lastCursor),
                  limit(pageSize),
                )
              : query(collection(serverDb!, colName), orderBy('__name__'), limit(pageSize));
            const snap: QuerySnapshot<DocumentData> = await withResetStepTimeout(
              getDocs(colQ),
              6_000,
              `Reading ${colName}`,
            );
            if (snap.empty) break;
            await runConcurrent(snap.docs, 20, async (d) => {
              try {
                await deleteDoc(d.ref);
                removed += 1;
              } catch {
                // Best-effort skip on individual doc error
              }
            });
            lastCursor = snap.docs[snap.docs.length - 1];
            if (snap.size < pageSize) break;
          }
          return removed;
        };

        const [delTasks, delPromos, delBans] = await Promise.all([
          deleteCollectionPaged('tasks', 100),
          deleteCollectionPaged('promo_codes', 50),
          deleteCollectionPaged('banned_users', 100),
        ]);
        tasksDeletedCount = delTasks;
        promosDeletedCount = delPromos;
        bansDeletedCount = delBans;

        // Reject any pending withdraw_requests (rules forbid deletion on withdraw_requests)
        let lastWdCursor: QueryDocumentSnapshot<DocumentData> | null = null;
        for (let page = 0; page < 50; page++) {
          if (isTimedOut()) break;
          const wdQ: Query<DocumentData> = lastWdCursor
            ? query(
                collection(serverDb, 'withdraw_requests'),
                orderBy('__name__'),
                startAfter(lastWdCursor),
                limit(100),
              )
            : query(collection(serverDb, 'withdraw_requests'), orderBy('__name__'), limit(100));
          const wdSnap: QuerySnapshot<DocumentData> = await withResetStepTimeout(
            getDocs(wdQ),
            6_000,
            'Reading withdraw_requests',
          );
          if (wdSnap.empty) break;
          const pendingDocs = wdSnap.docs.filter(
            (d) => String(d.data()?.status || '') === 'pending',
          );
          await runConcurrent(pendingDocs, 20, async (d) => {
            try {
              await updateDoc(d.ref, {
                status: 'rejected',
                adminNote: 'System reset by Admin',
                reviewedAtMs: nowMs,
                updatedAt: serverTimestamp(),
              });
              withdrawalsRejectedCount += 1;
            } catch {
              // Best-effort
            }
          });
          lastWdCursor = wdSnap.docs[wdSnap.docs.length - 1];
          if (wdSnap.size < 100) break;
        }

        // Reset every player document & clean subcollections concurrently (preserve __admin_vault__)
        let lastPlayerCursor: QueryDocumentSnapshot<DocumentData> | null = null;
        for (let page = 0; page < 100; page++) {
          if (isTimedOut()) break;
          const pQ: Query<DocumentData> = lastPlayerCursor
            ? query(
                collection(serverDb, 'players'),
                orderBy('__name__'),
                startAfter(lastPlayerCursor),
                limit(50),
              )
            : query(collection(serverDb, 'players'), orderBy('__name__'), limit(50));
          const pSnap: QuerySnapshot<DocumentData> = await withResetStepTimeout(
            getDocs(pQ),
            6_000,
            'Reading players',
          );
          if (pSnap.empty) break;

          const playerDocs = pSnap.docs.filter(
            (d) =>
              d.id !== ADMIN_PASSCODE_VAULT_UID &&
              d.id !== MAINTENANCE_PROFILE_DOC_ID &&
              d.id !== SYSTEM_RESET_PROFILE_DOC_ID &&
              !d.id.startsWith('__') &&
              !d.id.startsWith('sys_'),
          );
          await runConcurrent(playerDocs, 10, async (d) => {
            const cleanReferrals = async () => {
              let lastRefCursor: QueryDocumentSnapshot<DocumentData> | null = null;
              for (let rPage = 0; rPage < 40; rPage++) {
                if (isTimedOut()) break;
                const rQ: Query<DocumentData> = lastRefCursor
                  ? query(
                      collection(serverDb!, 'players', d.id, 'referrals'),
                      orderBy('__name__'),
                      startAfter(lastRefCursor),
                      limit(50),
                    )
                  : query(
                      collection(serverDb!, 'players', d.id, 'referrals'),
                      orderBy('__name__'),
                      limit(50),
                    );
                const refSnap: QuerySnapshot<DocumentData> = await getDocs(rQ);
                if (refSnap.empty) break;
                await runConcurrent(refSnap.docs, 15, async (rDoc) => {
                  try {
                    await deleteDoc(rDoc.ref);
                    referralsDeletedCount += 1;
                  } catch {
                    // Best-effort
                  }
                });
                lastRefCursor = refSnap.docs[refSnap.docs.length - 1];
                if (refSnap.size < 50) break;
              }
            };

            const rejectPendingWithdrawals = async () => {
              let lastUserWdCursor: QueryDocumentSnapshot<DocumentData> | null = null;
              for (let wPage = 0; wPage < 20; wPage++) {
                if (isTimedOut()) break;
                const uWdQ: Query<DocumentData> = lastUserWdCursor
                  ? query(
                      collection(serverDb!, 'players', d.id, 'withdrawals'),
                      orderBy('__name__'),
                      startAfter(lastUserWdCursor),
                      limit(40),
                    )
                  : query(
                      collection(serverDb!, 'players', d.id, 'withdrawals'),
                      orderBy('__name__'),
                      limit(40),
                    );
                const uWdSnap: QuerySnapshot<DocumentData> = await getDocs(uWdQ);
                if (uWdSnap.empty) break;
                const pendingWds = uWdSnap.docs.filter((wDoc) => {
                  const st = String(wDoc.data()?.status || '');
                  return st === 'pending' || st === 'processing';
                });
                await runConcurrent(pendingWds, 10, async (wDoc) => {
                  try {
                    await updateDoc(wDoc.ref, {
                      status: 'rejected',
                      adminNote: 'System reset by Admin',
                      reviewedAtMs: nowMs,
                    });
                  } catch {
                    // Best-effort
                  }
                });
                lastUserWdCursor = uWdSnap.docs[uWdSnap.docs.length - 1];
                if (uWdSnap.size < 40) break;
              }
            };

            const rejectPendingTransactions = async () => {
              let lastUserTxCursor: QueryDocumentSnapshot<DocumentData> | null = null;
              for (let tPage = 0; tPage < 20; tPage++) {
                if (isTimedOut()) break;
                const uTxQ: Query<DocumentData> = lastUserTxCursor
                  ? query(
                      collection(serverDb!, 'players', d.id, 'transactions'),
                      orderBy('__name__'),
                      startAfter(lastUserTxCursor),
                      limit(60),
                    )
                  : query(
                      collection(serverDb!, 'players', d.id, 'transactions'),
                      orderBy('__name__'),
                      limit(60),
                    );
                const uTxSnap: QuerySnapshot<DocumentData> = await getDocs(uTxQ);
                if (uTxSnap.empty) break;
                const pendingTxs = uTxSnap.docs.filter(
                  (tDoc) => String(tDoc.data()?.status || '') === 'pending',
                );
                await runConcurrent(pendingTxs, 15, async (tDoc) => {
                  try {
                    await updateDoc(tDoc.ref, { status: 'rejected' });
                  } catch {
                    // Best-effort
                  }
                });
                lastUserTxCursor = uTxSnap.docs[uTxSnap.docs.length - 1];
                if (uTxSnap.size < 60) break;
              }
            };

            await Promise.all([
              cleanReferrals(),
              rejectPendingWithdrawals(),
              rejectPendingTransactions(),
            ]);

            const pd = d.data();
            const safeName = String(pd.displayName || '').trim().slice(0, 60) || 'Farmer';
            const safeHandle = formatReferralHandle(String(pd.handle || ''), d.id).slice(0, 40) || '@farmer';
            const rawColor = String(pd.avatarColor || '').trim().slice(0, 20);
            const safeColor = rawColor.length >= 4 ? rawColor : '#EF4444';
            const rawLang = String(pd.language || 'en').trim().slice(0, 16);
            const safeLang = rawLang.length >= 2 ? rawLang : 'en';

            try {
              await updateDoc(d.ref, {
                displayName: safeName,
                handle: safeHandle,
                photoUrl: String(pd.photoUrl || '').slice(0, 512),
                avatarColor: safeColor,
                language: safeLang,
                level: 1,
                xp: 0,
                coins: SIGNUP_BONUS_COINS,
                eggs: 0,
                totalEggsCollected: 0,
                totalCashEarnedUsd: 0,
                totalWithdrawnUsd: 0,
                basketCapacity: 300,
                basketTierHours: 8,
                leghornCount: 0,
                rhodeCount: 0,
                orpingtonCount: 0,
                australorpCount: 0,
                boughtThisWeek: 0,
                dailyStreak: 0,
                lastDailyClaimDate: '',
                completedTaskIds: [],
                claimedPromoCodes: [],
                watchedAdsCount: 0,
                totalAdsWatched: 0,
                referredBy: '',
                referralActivated: false,
                referralCount: 0,
                referralCoinsEarned: 0,
                firstDepositBonusUsed: false,
                lastCollectedAt: nowMs,
                feedBoostUntilMs: 0,
                lastGoldenEggAtMs: 0,
                goldenEggsFound: 0,
                claimedAchievementIds: resetTokens,
                claimedReferralMilestones: [],
                updatedAt: serverTimestamp(),
              });
              playersResetCount += 1;
            } catch {
              // Best-effort on individual malformed legacy doc
            }
          });
          lastPlayerCursor = pSnap.docs[pSnap.docs.length - 1];
          if (pSnap.size < 50) break;
        }

        // Reset leaderboard stats
        let lastLbCursor: QueryDocumentSnapshot<DocumentData> | null = null;
        for (let page = 0; page < 100; page++) {
          if (isTimedOut()) break;
          const lbQ: Query<DocumentData> = lastLbCursor
            ? query(
                collection(serverDb, 'leaderboard'),
                orderBy('__name__'),
                startAfter(lastLbCursor),
                limit(50),
              )
            : query(collection(serverDb, 'leaderboard'), orderBy('__name__'), limit(50));
          const lbSnap: QuerySnapshot<DocumentData> = await withResetStepTimeout(
            getDocs(lbQ),
            5_000,
            'Reading leaderboard',
          );
          if (lbSnap.empty) break;
          const lbDocs = lbSnap.docs.filter(
            (d) =>
              d.id !== ADMIN_PASSCODE_VAULT_UID &&
              d.id !== MAINTENANCE_PROFILE_DOC_ID &&
              d.id !== SYSTEM_RESET_PROFILE_DOC_ID &&
              !d.id.startsWith('__') &&
              !d.id.startsWith('sys_'),
          );
          await runConcurrent(lbDocs, 20, async (d) => {
            try {
              await updateDoc(d.ref, {
                buyerPoints: 0,
                inviterCount: 0,
                eggs: 0,
                totalEggsCollected: 0,
                chickensCount: 0,
                updatedAt: serverTimestamp(),
              });
            } catch {
              // Best-effort
            }
          });
          lastLbCursor = lbSnap.docs[lbSnap.docs.length - 1];
          if (lbSnap.size < 50) break;
        }

        // Reset season back to Season 1 & bump app_config/system_reset + mirror doc epoch
        let prevCount = 0;
        try {
          const [resetSnap, mirrorSnap] = await withResetStepTimeout(
            Promise.all([
              getFreshDoc(doc(serverDb, 'app_config', 'system_reset')).catch(() => null),
              getFreshDoc(doc(serverDb, 'players', SYSTEM_RESET_PROFILE_DOC_ID)).catch(() => null),
            ]),
            4_000,
            'Reading reset epoch',
          );
          const appCount = resetSnap?.exists()
            ? Math.max(0, Math.floor(Number(resetSnap.data()?.resetCount ?? 0) || 0))
            : 0;
          const mirrorCount = mirrorSnap?.exists()
            ? Math.max(0, Math.floor(Number(mirrorSnap.data()?.xp ?? 0) || 0))
            : 0;
          prevCount = Math.max(appCount, mirrorCount);
        } catch {
          prevCount = 0;
        }
        const nextResetCount = prevCount + 1;
        await withResetStepTimeout(
          Promise.allSettled([
            setDoc(doc(serverDb, 'app_config', 'season'), {
              seasonNumber: 1,
              title: 'Harvest Cup Season 1',
              prizePoolCoins: 25000,
              endsAtMs: nowMs + 4 * 86_400_000,
              lastWinners: [],
              updatedAtMs: nowMs,
              updatedAt: serverTimestamp(),
            }),
            setDoc(doc(serverDb, 'app_config', 'system_reset'), {
              resetEpochMs: nowMs,
              resetCount: nextResetCount,
              resetBy: String(resolvedPlayerId || 'admin').slice(0, 64),
              updatedAtMs: nowMs,
              updatedAt: serverTimestamp(),
            }),
            upsertServerReservedPlayerDoc({
              docId: SYSTEM_RESET_PROFILE_DOC_ID,
              referralCode: '__RESET__',
              displayName: 'System Reset Epoch',
              handle: '@sys_reset',
              xp: nextResetCount,
              referredBy: String(resolvedPlayerId || 'admin').slice(0, 64),
              referralActivated: false,
              lastCollectedAt: nowMs,
              claimedAchievementIds: ['__sys_reset_v1__', String(nowMs)],
            }),
          ]),
          6_000,
          'Saving global system reset epoch',
        );
      }

      // Clear server in-memory runtime caches (preserve bot config & session secret)
      pendingReferralMap.clear();
      resetReferralStorage();
      reminderStore.clear();
      channelCheckLogs.length = 0;
      processedServerTxHashes.clear();
      referralNotifyDedup.clear();
      withdrawNotifyDedup.clear();
      rateLimitBuckets.clear();
      botSubscriberMap.clear();

      for (const fileToClear of [
        PENDING_REFERRALS_FILE,
        REMINDERS_FILE,
        CHANNEL_CHECK_LOGS_FILE,
        BOT_SUBSCRIBERS_FILE,
      ]) {
        try {
          if (fs.existsSync(fileToClear)) {
            fs.writeFileSync(fileToClear, '[]', 'utf8');
          }
        } catch {
          // Non-fatal
        }
      }

      const summary = `${playersResetCount} players reset · ${tasksDeletedCount} tasks, ${promosDeletedCount} promos, ${bansDeletedCount} bans, ${referralsDeletedCount} referrals cleared · ${withdrawalsRejectedCount} pending withdrawals closed`;
      recordServerLog('info', 'admin_data_reset', `System data reset executed by ${resolvedPlayerId}`, summary);

      res.json({
        ok: true,
        resetEpochMs: nowMs,
        playersResetCount,
        tasksDeletedCount,
        promosDeletedCount,
        bansDeletedCount,
        referralsDeletedCount,
        withdrawalsRejectedCount,
        summary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Data reset failed';
      recordServerLog('error', 'admin_data_reset', `System data reset failed (${resolvedPlayerId})`, msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  const reminderInterval = setInterval(() => {
    void processDueReminders();
  }, 30_000);
  if (typeof reminderInterval.unref === 'function') {
    reminderInterval.unref();
  }

  if (getTelegramBotToken()) {
    ensureBotPollerRunning();
  }

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ ok: false, error: 'API route not found' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const httpServer = http.createServer(app);
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Alpha Gram server running on http://0.0.0.0:${PORT}`);
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (
            filePath.endsWith('index.html') ||
            filePath.endsWith('sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('manifest.webmanifest')
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Alpha Gram server running on http://0.0.0.0:${PORT}`);
    });
  }
  const hasInitialBotToken = Boolean(getTelegramBotToken());
  recordServerLog(
    'info',
    'server',
    `Alpha Gram server initialized on port ${PORT} (${process.env.NODE_ENV || 'development'})`,
    `botToken=${hasInitialBotToken} (${getBotTokenSource()}) · firestore=${Boolean(serverDb)}`,
  );
  if (hasInitialBotToken) {
    if (!cachedBotMenuWebAppUrl) {
      void refreshBotMenuWebAppUrl(getTelegramBotToken());
    }
    void probeBotHeartbeat(true);
  }
}

startServer();
