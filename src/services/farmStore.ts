import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ADMIN_PASSCODE_VAULT_UID,
  buildDeterministicDepositIds,
  calculateBuyerPoints,
  calculateTotalChickens,
  canAddAdminPlayerId,
  canBanPlayerId,
  canRemoveAdminPlayerId,
  claimGoldenEggDrop,
  coinsToUsd,
  computeAdminCoinAdjustment,
  computeAdminReferralCountAdjustment,
  computeAdminWithdrawAdsAdjustment,
  computeAdminWithdrawAdsTarget,
  createDefaultProfile,
  createDefaultSeasonConfig,
  createReferralCodeFromUid,
  decodeAchievementsAndAds,
  decodePromoLabelMeta,
  decodeTaskSubtitleMeta,
  DEFAULT_AD_CONFIG,
  DEFAULT_ADMINS_CONFIG,
  DEFAULT_CHANNELS_CONFIG,
  DEFAULT_MAINTENANCE_CONFIG,
  DEFAULT_TASK_PRICING_CONFIG,
  DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
  eggsToUsd,
  encodeAchievementsWithAds,
  encodePromoLabelMeta,
  encodeTaskSubtitleMeta,
  extractTelegramNumericUserId,
  filterPlayersBySearchQuery,
  formatGoldenEggCooldownWait,
  formatReferralHandle,
  getEffectiveAdminIds,
  getGoldenEggCooldownRemainingMs,
  GOLDEN_EGG_COOLDOWN_MS,
  isAdminPlayerId,
  matchesAdminRecord,
  normalizePlayerBanId,
  normalizeTelegramChannelEntry,
  REFERRAL_DEPOSIT_COMMISSION_RATE,
  REFERRED_WELCOME_BONUS_COINS,
  REFERRER_SIGNUP_BONUS_COINS,
  resolveMaintenanceConfig,
  resolveTaskPricingConfig,
  SIGNUP_BONUS_COINS,
  USER_TASK_MAX_REWARD_COINS,
  USER_TASK_MAX_SLOTS,
  USER_TASK_MIN_REWARD_COINS,
  USER_TASK_MIN_SLOTS,
  USER_TASK_MIN_TOTAL_COST_COINS,
} from '../game/economy';
import type {
  AdConfig,
  AdminRoleEntry,
  AdminsConfig,
  BannedUserRecord,
  ChannelsConfig,
  ChickenBreedId,
  DepositOrder,
  DynamicPromoCode,
  LeaderboardEntry,
  MaintenanceConfig,
  PromoRewardType,
  ReferralRecord,
  RequiredTelegramChannel,
  SeasonConfig,
  SeasonWinnerRecord,
  SystemResetConfig,
  TaskDefinition,
  TaskPricingConfig,
  TransactionEntry,
  UserFarmProfile,
  WithdrawApproveMessageTemplate,
  WithdrawalOrder,
  WithdrawRequestRecord,
} from '../types/farm';
import { detectBrowserTelegramIdentity, type DetectedUserIdentity } from '../utils/telegram';

const PLAYER_ID_KEY = 'chickenland_player_id_v1';
const PLAYER_ID_COOKIE = 'chickenland_uid_v1';
const PROFILE_CACHE_PREFIX = 'chickenland_profile_cache_v1_';
const GOLDEN_EGG_CLAIM_CACHE_PREFIX = 'chickenland_golden_egg_at_v1_';
const BAN_CACHE_PREFIX = 'chickenland_ban_cache_v1_';

function readCookiePlayerId(): string {
  try {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|;\s*)chickenland_uid_v1=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

export function createFreshPlayerId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36).slice(-4);
  return `player_${ts}${rand}`;
}

export function getStoredPlayerId(): string {
  try {
    const existing =
      localStorage.getItem(PLAYER_ID_KEY) ||
      sessionStorage.getItem(PLAYER_ID_KEY) ||
      readCookiePlayerId();
    if (existing && /^[a-zA-Z0-9_-]{3,64}$/.test(existing)) {
      setStoredPlayerId(existing);
      return existing;
    }
  } catch {
    // Ignore storage errors
  }
  const fresh = createFreshPlayerId();
  setStoredPlayerId(fresh);
  return fresh;
}

export function setStoredPlayerId(playerId: string): void {
  try {
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  } catch {
    // Ignore storage errors
  }
  try {
    sessionStorage.setItem(PLAYER_ID_KEY, playerId);
  } catch {
    // Ignore storage errors
  }
  try {
    if (typeof document !== 'undefined') {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const sameSite = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
      document.cookie = `${PLAYER_ID_COOKIE}=${encodeURIComponent(playerId)}; max-age=31536000; path=/; ${sameSite}`;
    }
  } catch {
    // Ignore cookie errors
  }
}

export function getStoredGoldenEggClaimAtMs(playerId: string): number {
  try {
    if (typeof localStorage === 'undefined' || !playerId) return 0;
    const raw = localStorage.getItem(`${GOLDEN_EGG_CLAIM_CACHE_PREFIX}${playerId}`);
    const parsed = Number(raw || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setStoredGoldenEggClaimAtMs(playerId: string, timestampMs: number): void {
  try {
    if (typeof localStorage === 'undefined' || !playerId) return;
    const safeTs = Number(timestampMs || 0);
    if (Number.isFinite(safeTs) && safeTs > 0) {
      localStorage.setItem(`${GOLDEN_EGG_CLAIM_CACHE_PREFIX}${playerId}`, String(Math.floor(safeTs)));
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearStoredGoldenEggClaimAtMs(playerId: string): void {
  try {
    if (typeof localStorage === 'undefined' || !playerId) return;
    localStorage.removeItem(`${GOLDEN_EGG_CLAIM_CACHE_PREFIX}${playerId}`);
  } catch {
    // Ignore storage errors
  }
}

export function loadCachedPlayerProfile(playerId: string): UserFarmProfile | null {
  try {
    if (typeof localStorage === 'undefined' || !playerId) return null;
    const raw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${playerId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const profile = parseProfileDoc(parsed, playerId);
    const localGoldenAt = getStoredGoldenEggClaimAtMs(playerId);
    if (localGoldenAt > (profile.lastGoldenEggAtMs ?? 0)) {
      return { ...profile, lastGoldenEggAtMs: localGoldenAt };
    }
    return profile;
  } catch {
    return null;
  }
}

export function saveCachedPlayerProfile(profile: UserFarmProfile): void {
  try {
    if (typeof localStorage === 'undefined' || !profile?.uid) return;
    const localGoldenAt = getStoredGoldenEggClaimAtMs(profile.uid);
    const profileGoldenAt = Math.max(0, Number(profile.lastGoldenEggAtMs ?? 0) || 0);
    const mergedGoldenAt = Math.max(profileGoldenAt, localGoldenAt);
    const toSave =
      mergedGoldenAt > profileGoldenAt ? { ...profile, lastGoldenEggAtMs: mergedGoldenAt } : profile;
    if (mergedGoldenAt > 0) {
      setStoredGoldenEggClaimAtMs(profile.uid, mergedGoldenAt);
    }
    localStorage.setItem(`${PROFILE_CACHE_PREFIX}${profile.uid}`, JSON.stringify(toSave));
  } catch {
    // Ignore quota/storage errors
  }
}

export function resolveActivePlayerIdentity(): DetectedUserIdentity {
  const detected = detectBrowserTelegramIdentity();
  if (detected.playerId) {
    setStoredPlayerId(detected.playerId);
    return detected;
  }
  const fallbackId = getStoredPlayerId();
  const shortTag = fallbackId.slice(-4).toUpperCase();
  return {
    playerId: fallbackId,
    displayName: detected.displayName || `Farmer ${shortTag}`,
    handle: detected.handle || `@farmer_${fallbackId.slice(-4).toLowerCase()}`,
    photoUrl: detected.photoUrl || '',
    startParam: detected.startParam || '',
    isTelegramDetected: detected.isTelegramDetected,
  };
}

function isFirestorePermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return String(error || '').toLowerCase().includes('missing or insufficient permissions');
  }
  const rec = error as { code?: unknown; message?: unknown };
  const code = String(rec.code || '').toLowerCase();
  const msg = String(rec.message || '').toLowerCase();
  return code === 'permission-denied' || msg.includes('missing or insufficient permissions');
}

function isTransientOfflineFirestoreError(error: unknown): boolean {
  const rec = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : null;
  const code = String(rec?.code || '').toLowerCase();
  const msg = String(rec?.message || error || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    code === 'deadline-exceeded' ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document') ||
    msg.includes('network') ||
    msg.includes('unavailable')
  );
}

function logSubscriptionError(path: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`[Firestore subscription error] ${path}: ${message}`);
}

function safeNonNegativeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function safeBoundedCoins(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-100_000_000, Math.min(100_000_000, n));
}

function toFirestoreProfilePayload(profile: UserFarmProfile, isCreate: boolean) {
  const cumulativeAds = Math.max(
    0,
    Math.floor(safeNonNegativeNum(profile.totalAdsWatched ?? profile.watchedAdsCount, 0)),
  );
  const base = {
    uid: profile.uid,
    displayName: (profile.displayName || '').trim().slice(0, 60) || 'Farmer',
    handle: (profile.handle || '').trim().slice(0, 40) || '@farmer',
    photoUrl: (profile.photoUrl || '').slice(0, 512),
    avatarColor: (profile.avatarColor || '#EF4444').slice(0, 20),
    level: Math.max(1, Math.min(999, Math.floor(safeNonNegativeNum(profile.level, 1)))),
    xp: safeNonNegativeNum(profile.xp, 0),
    coins: safeBoundedCoins(profile.coins, 0),
    eggs: safeNonNegativeNum(profile.eggs, 0),
    totalEggsCollected: safeNonNegativeNum(profile.totalEggsCollected, 0),
    totalCashEarnedUsd: safeNonNegativeNum(profile.totalCashEarnedUsd, 0),
    totalWithdrawnUsd: safeNonNegativeNum(profile.totalWithdrawnUsd, 0),
    basketCapacity: Math.max(300, safeNonNegativeNum(profile.basketCapacity, 300)),
    basketTierHours: Math.max(8, Math.min(72, safeNonNegativeNum(profile.basketTierHours, 8))),
    leghornCount: Math.floor(safeNonNegativeNum(profile.leghornCount, 0)),
    rhodeCount: Math.floor(safeNonNegativeNum(profile.rhodeCount, 0)),
    orpingtonCount: Math.floor(safeNonNegativeNum(profile.orpingtonCount, 0)),
    australorpCount: Math.floor(safeNonNegativeNum(profile.australorpCount, 0)),
    boughtThisWeek: Math.floor(safeNonNegativeNum(profile.boughtThisWeek, 0)),
    dailyStreak: Math.max(0, Math.min(7, Math.floor(safeNonNegativeNum(profile.dailyStreak, 0)))),
    lastDailyClaimDate: String(profile.lastDailyClaimDate || '').slice(0, 20),
    completedTaskIds: (profile.completedTaskIds ?? []).slice(0, 50),
    claimedPromoCodes: (profile.claimedPromoCodes ?? []).slice(0, 50),
    watchedAdsCount: Math.max(0, Math.min(10, Math.floor(safeNonNegativeNum(profile.watchedAdsCount, 0)))),
    referralCode: (profile.referralCode || createReferralCodeFromUid(profile.uid)).slice(0, 32),
    referredBy: (profile.referredBy || '').slice(0, 64),
    referralActivated: Boolean(profile.referralActivated),
    referralCount: Math.floor(safeNonNegativeNum(profile.referralCount, 0)),
    referralCoinsEarned: safeNonNegativeNum(profile.referralCoinsEarned, 0),
    firstDepositBonusUsed: Boolean(profile.firstDepositBonusUsed),
    language: (profile.language || 'en').slice(0, 16),
    lastCollectedAt: safeNonNegativeNum(profile.lastCollectedAt, Date.now()),
    createdAtMs: safeNonNegativeNum(profile.createdAtMs, Date.now()),
    feedBoostUntilMs: Math.max(0, safeNonNegativeNum(profile.feedBoostUntilMs, 0)),
    lastGoldenEggAtMs: Math.max(0, safeNonNegativeNum(profile.lastGoldenEggAtMs, 0)),
    goldenEggsFound: Math.max(0, Math.floor(safeNonNegativeNum(profile.goldenEggsFound, 0))),
    claimedAchievementIds: encodeAchievementsWithAds(
      profile.claimedAchievementIds ?? [],
      cumulativeAds,
      {
        withdrawAdsWatched: profile.withdrawAdsWatched,
        coopFeverUntilMs: profile.coopFeverUntilMs,
        coopFeverBaselineAds: profile.coopFeverBaselineAds,
        coopFeverAdsWatched: profile.coopFeverAdsWatched,
        autoHarvestUntilMs: profile.autoHarvestUntilMs,
        telegramRemindersEnabled: profile.telegramRemindersEnabled,
        lastReinvestDate: profile.lastReinvestDate,
        resetEpochMs: profile.resetEpochMs,
      },
    ),
    claimedReferralMilestones: (profile.claimedReferralMilestones ?? []).slice(0, 20),
    updatedAt: serverTimestamp(),
  };

  if (isCreate) {
    return {
      ...base,
      createdAt: serverTimestamp(),
    };
  }
  return base;
}

function toLeaderboardPayload(profile: UserFarmProfile) {
  return {
    uid: profile.uid,
    displayName: (profile.displayName || '').trim().slice(0, 60) || 'Farmer',
    handle: (profile.handle || '').trim().slice(0, 40) || '@farmer',
    photoUrl: (profile.photoUrl || '').slice(0, 512),
    avatarColor: (profile.avatarColor || '#EF4444').slice(0, 20),
    referralCode: (profile.referralCode || createReferralCodeFromUid(profile.uid)).slice(0, 32),
    buyerPoints: Math.max(0, calculateBuyerPoints(profile)),
    inviterCount: Math.max(0, Math.floor(safeNonNegativeNum(profile.referralCount, 0))),
    eggs: Math.max(0, safeNonNegativeNum(profile.eggs, 0)),
    totalEggsCollected: Math.max(0, safeNonNegativeNum(profile.totalEggsCollected, 0)),
    chickensCount: Math.max(0, calculateTotalChickens(profile)),
    updatedAt: serverTimestamp(),
  };
}

function buildUpdatedPlayerFromRaw(
  raw: Record<string, unknown>,
  uid: string,
  patch: Partial<UserFarmProfile>,
): { updatedProfile: UserFarmProfile; firestorePayload: ReturnType<typeof toFirestoreProfilePayload> } {
  const parsed = parseProfileDoc(raw, uid);
  const updatedProfile: UserFarmProfile = {
    ...parsed,
    ...patch,
    uid: parsed.uid,
    createdAtMs: Number(raw.createdAtMs ?? parsed.createdAtMs),
    referralCode: String(raw.referralCode || parsed.referralCode),
  };
  return {
    updatedProfile,
    firestorePayload: toFirestoreProfilePayload(updatedProfile, false),
  };
}

function buildUpdatedLeaderboardFromRaw(
  lbRaw: Record<string, unknown> | undefined,
  updatedProfile: UserFarmProfile,
) {
  const payload = toLeaderboardPayload(updatedProfile);
  return {
    ...payload,
    referralCode: String(lbRaw?.referralCode || payload.referralCode).slice(0, 32),
  };
}

function parseProfileDoc(d: Record<string, unknown>, fallbackId: string): UserFarmProfile {
  const {
    claimedAchievementIds,
    totalAdsWatched,
    withdrawAdsWatched,
    coopFeverUntilMs,
    coopFeverBaselineAds,
    coopFeverAdsWatched,
    autoHarvestUntilMs,
    telegramRemindersEnabled,
    lastReinvestDate,
    resetEpochMs,
  } = decodeAchievementsAndAds(
    d.claimedAchievementIds,
    d.totalAdsWatched,
    d.watchedAdsCount,
    {
      withdrawAdsWatched: typeof d.withdrawAdsWatched === 'number' ? d.withdrawAdsWatched : undefined,
      coopFeverAdsWatched: typeof d.coopFeverAdsWatched === 'number' ? d.coopFeverAdsWatched : undefined,
      lastReinvestDate: typeof d.lastReinvestDate === 'string' ? d.lastReinvestDate : undefined,
      resetEpochMs: typeof d.resetEpochMs === 'number' ? d.resetEpochMs : undefined,
    },
  );
  return {
    uid: String(d.uid || fallbackId),
    displayName: String(d.displayName || 'Farmer'),
    handle: String(d.handle || '@farmer'),
    photoUrl: String(d.photoUrl || ''),
    avatarColor: String(d.avatarColor || '#EF4444'),
    level: Number(d.level ?? 1),
    xp: Number(d.xp ?? 0),
    coins: Number(d.coins ?? 0),
    eggs: Number(d.eggs ?? 0),
    totalEggsCollected: Number(d.totalEggsCollected ?? 0),
    totalCashEarnedUsd: Number(d.totalCashEarnedUsd ?? 0),
    totalWithdrawnUsd: Number(d.totalWithdrawnUsd ?? 0),
    basketCapacity: Number(d.basketCapacity ?? 300),
    basketTierHours: Number(d.basketTierHours ?? 8),
    leghornCount: Number(d.leghornCount ?? 0),
    rhodeCount: Number(d.rhodeCount ?? 0),
    orpingtonCount: Number(d.orpingtonCount ?? 0),
    australorpCount: Number(d.australorpCount ?? 0),
    boughtThisWeek: Number(d.boughtThisWeek ?? 0),
    dailyStreak: Number(d.dailyStreak ?? 0),
    lastDailyClaimDate: String(d.lastDailyClaimDate ?? ''),
    lastReinvestDate,
    completedTaskIds: Array.isArray(d.completedTaskIds) ? (d.completedTaskIds as string[]) : [],
    claimedPromoCodes: Array.isArray(d.claimedPromoCodes) ? (d.claimedPromoCodes as string[]) : [],
    watchedAdsCount: Number(d.watchedAdsCount ?? 0),
    totalAdsWatched,
    withdrawAdsWatched,
    coopFeverUntilMs,
    coopFeverBaselineAds,
    coopFeverAdsWatched,
    autoHarvestUntilMs,
    telegramRemindersEnabled,
    referralCode: String(d.referralCode ?? createReferralCodeFromUid(fallbackId)),
    referredBy: String(d.referredBy ?? ''),
    referralActivated: Boolean(d.referralActivated),
    referralCount: Number(d.referralCount ?? 0),
    referralCoinsEarned: Number(d.referralCoinsEarned ?? 0),
    firstDepositBonusUsed: Boolean(d.firstDepositBonusUsed),
    language: (d.language as UserFarmProfile['language']) ?? 'en',
    lastCollectedAt: Number(d.lastCollectedAt ?? Date.now()),
    createdAtMs: Number(d.createdAtMs ?? Date.now()),
    feedBoostUntilMs: Number(d.feedBoostUntilMs ?? 0),
    lastGoldenEggAtMs: Number(d.lastGoldenEggAtMs ?? 0),
    goldenEggsFound: Number(d.goldenEggsFound ?? 0),
    claimedAchievementIds,
    claimedReferralMilestones: Array.isArray(d.claimedReferralMilestones)
      ? (d.claimedReferralMilestones as number[])
      : [],
    resetEpochMs: resetEpochMs > 0 ? resetEpochMs : undefined,
  };
}

export async function ensurePlayerInFirestore(
  playerId: string,
  detected?: { displayName?: string; handle?: string; photoUrl?: string; isTelegramDetected?: boolean },
): Promise<{ profile: UserFarmProfile; isNewPlayer: boolean; fromCache?: boolean }> {
  const playerRef = doc(db, 'players', playerId);
  try {
    let snap;
    try {
      snap = await getDocFromServer(playerRef);
    } catch (serverErr) {
      if (isTransientOfflineFirestoreError(serverErr)) {
        try {
          const cachedSnap = await getDocFromCache(playerRef);
          if (cachedSnap.exists()) {
            const rawCached = parseProfileDoc(cachedSnap.data(), playerId);
            const localGoldenAt = getStoredGoldenEggClaimAtMs(playerId);
            const cachedProfile =
              localGoldenAt > (rawCached.lastGoldenEggAtMs ?? 0)
                ? { ...rawCached, lastGoldenEggAtMs: localGoldenAt }
                : rawCached;
            saveCachedPlayerProfile(cachedProfile);
            return { profile: cachedProfile, isNewPlayer: false, fromCache: true };
          }
        } catch {
          // Cache miss
        }
        const localFallback = loadCachedPlayerProfile(playerId);
        if (localFallback) {
          return { profile: localFallback, isNewPlayer: false, fromCache: true };
        }
      }
      throw serverErr;
    }

    if (snap.exists()) {
      const existing = parseProfileDoc(snap.data(), playerId);
      saveCachedPlayerProfile(existing);
      const lbRef = doc(db, 'leaderboard', playerId);
      const lbSnap = await getDocFromServer(lbRef).catch(() => null);
      if (detected?.isTelegramDetected) {
        const nextName = (detected.displayName || existing.displayName).slice(0, 60);
        const nextHandle = (detected.handle || existing.handle).slice(0, 40);
        const nextPhoto = (detected.photoUrl ?? existing.photoUrl).slice(0, 512);
        if (
          nextName !== existing.displayName ||
          nextHandle !== existing.handle ||
          nextPhoto !== existing.photoUrl
        ) {
          const synced: UserFarmProfile = {
            ...existing,
            displayName: nextName,
            handle: nextHandle,
            photoUrl: nextPhoto,
          };
          const batch = writeBatch(db);
          batch.update(playerRef, toFirestoreProfilePayload(synced, false));
          batch.set(lbRef, toLeaderboardPayload(synced));
          await batch.commit();
          saveCachedPlayerProfile(synced);
          return { profile: synced, isNewPlayer: false };
        }
      }
      if (!lbSnap?.exists() || Number(lbSnap.data()?.inviterCount ?? -1) !== existing.referralCount) {
        await setDoc(lbRef, toLeaderboardPayload(existing)).catch(() => {});
      }
      return { profile: existing, isNewPlayer: false };
    }

    const nowMs = Date.now();
    const shortTag = playerId.slice(-4).toUpperCase();
    const displayName = detected?.displayName?.trim() || `Farmer ${shortTag}`;
    const handle = detected?.handle?.trim() || `@farmer_${playerId.slice(-4).toLowerCase()}`;
    const photoUrl = detected?.photoUrl?.trim() || '';
    const seed = createDefaultProfile(playerId, displayName, handle, nowMs, photoUrl);

    const batch = writeBatch(db);
    batch.set(playerRef, toFirestoreProfilePayload(seed.profile, true));
    batch.set(doc(db, 'leaderboard', playerId), toLeaderboardPayload(seed.profile));

    for (const tx of seed.transactions) {
      const txId = tx.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      batch.set(doc(db, 'players', playerId, 'transactions', txId), {
        userId: playerId,
        type: tx.type,
        title: tx.title.slice(0, 80),
        amount: tx.amount,
        currency: tx.currency,
        usdValue: tx.usdValue,
        status: tx.status,
        createdAtMs: tx.createdAtMs,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    saveCachedPlayerProfile(seed.profile);
    return { profile: seed.profile, isNewPlayer: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `players/${playerId}`);
  }
}

export async function applyReferralCodeInFirestore(
  currentProfile: UserFarmProfile,
  rawCodeOrId: string,
): Promise<
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      referrerUid: string;
      referrerName: string;
      coinsRewarded: number;
      activated: boolean;
    }
  | { error: string }
> {
  const rawTrimmed = rawCodeOrId.trim();
  const strippedParam = rawTrimmed.replace(/^(?:ref|r)_/i, '').trim();
  const codeUpper = rawTrimmed.toUpperCase();
  if (!rawTrimmed || rawTrimmed.length < 3) {
    return { error: 'Enter a valid referral ID or code.' };
  }
  if (currentProfile.referredBy) {
    return { error: 'You have already used a referral link on this account.' };
  }

  const currentCanonicalUid = normalizePlayerBanId(currentProfile.uid) || currentProfile.uid;
  const candidateUid =
    normalizePlayerBanId(strippedParam) || normalizePlayerBanId(rawTrimmed);
  if (
    codeUpper === currentProfile.referralCode.toUpperCase() ||
    rawTrimmed === currentProfile.uid ||
    strippedParam === currentProfile.uid ||
    (candidateUid && candidateUid === currentCanonicalUid)
  ) {
    return { error: 'You cannot refer yourself.' };
  }

  try {
    let referrerUid = '';
    let referrerName = 'Farmer';

    // 1. Resolve directly by auto-detected Telegram ID / User ID (e.g. ?startapp=7508911853 or player_...)
    const candidateIds = Array.from(
      new Set(
        [candidateUid, strippedParam, rawTrimmed].filter(
          (id): id is string => Boolean(id && /^[a-zA-Z0-9_-]{3,64}$/.test(id)),
        ),
      ),
    );

    for (const id of candidateIds) {
      const playerSnap = await getDoc(doc(db, 'players', id));
      if (playerSnap.exists()) {
        referrerUid = playerSnap.id;
        referrerName = String(playerSnap.data().displayName || 'Farmer');
        break;
      }
      const lbSnap = await getDoc(doc(db, 'leaderboard', id));
      if (lbSnap.exists()) {
        referrerUid = lbSnap.id;
        referrerName = String(lbSnap.data().displayName || 'Farmer');
        break;
      }
    }

    // 2. Fallback to stored referralCode lookup across leaderboard and players (supports unified IDs & legacy codes)
    if (!referrerUid) {
      for (const codeCandidate of Array.from(new Set([strippedParam, rawTrimmed, codeUpper])).filter(Boolean)) {
        const lbQ = query(
          collection(db, 'leaderboard'),
          where('referralCode', '==', codeCandidate),
          limit(1),
        );
        const lbMatches = await getDocs(lbQ);
        if (!lbMatches.empty) {
          const referrerSnap = lbMatches.docs[0];
          const referrerData = referrerSnap.data();
          referrerUid = String(referrerData.uid || referrerSnap.id);
          referrerName = String(referrerData.displayName || 'Farmer');
          break;
        }
        const playerQ = query(
          collection(db, 'players'),
          where('referralCode', '==', codeCandidate),
          limit(1),
        );
        const playerMatches = await getDocs(playerQ);
        if (!playerMatches.empty) {
          const referrerSnap = playerMatches.docs[0];
          const referrerData = referrerSnap.data();
          referrerUid = String(referrerData.uid || referrerSnap.id);
          referrerName = String(referrerData.displayName || 'Farmer');
          break;
        }
      }
    }

    if (!referrerUid) {
      const resolvedByHandleOrScan = await fetchPlayerByIdOrCodeFromFirestore(rawTrimmed);
      if (resolvedByHandleOrScan) {
        referrerUid = resolvedByHandleOrScan.uid;
        referrerName = String(resolvedByHandleOrScan.displayName || 'Farmer');
      }
    }

    if (!referrerUid) {
      return { error: `Referral ID "${rawTrimmed}" not found.` };
    }

    if (referrerUid === currentProfile.uid) {
      return { error: 'You cannot refer yourself.' };
    }

    const nowMs = Date.now();
    const rewardCoins = REFERRER_SIGNUP_BONUS_COINS;
    const playerRef = doc(db, 'players', currentProfile.uid);
    const playerLbRef = doc(db, 'leaderboard', currentProfile.uid);
    const referrerPlayerRef = doc(db, 'players', referrerUid);
    const referrerLbRef = doc(db, 'leaderboard', referrerUid);
    const referralDocRef = doc(db, 'players', referrerUid, 'referrals', currentProfile.uid);

    let nextProfile: UserFarmProfile = {
      ...currentProfile,
      referredBy: referrerUid,
      referralActivated: calculateTotalChickens(currentProfile) > 0,
      coins: currentProfile.coins + REFERRED_WELCOME_BONUS_COINS,
    };

    const userTx: TransactionEntry = {
      id: `tx_ref_join_${nowMs}`,
      userId: currentProfile.uid,
      type: 'referral',
      title: `Joined via ${referrerName}'s referral`,
      amount: REFERRED_WELCOME_BONUS_COINS,
      currency: 'coins',
      usdValue: 0.01,
      status: 'completed',
      createdAtMs: nowMs,
    };

    let alreadyLinked = false;
    let activatedOnLink = false;
    await runTransaction(db, async (transaction) => {
      const [playerSnap, playerLbSnap, referrerPlayerSnap, referrerLbSnap, existingRefSnap] =
        await Promise.all([
          transaction.get(playerRef),
          transaction.get(playerLbRef),
          transaction.get(referrerPlayerRef),
          transaction.get(referrerLbRef),
          transaction.get(referralDocRef),
        ]);

      if (existingRefSnap.exists() || (playerSnap.exists() && playerSnap.data().referredBy)) {
        alreadyLinked = true;
        return;
      }

      if (!referrerPlayerSnap.exists()) {
        throw new Error('REFERRER_MISSING');
      }

      const existingChickenCount = playerSnap.exists()
        ? Number(playerSnap.data().leghornCount ?? 0) +
          Number(playerSnap.data().rhodeCount ?? 0) +
          Number(playerSnap.data().orpingtonCount ?? 0) +
          Number(playerSnap.data().australorpCount ?? 0)
        : calculateTotalChickens(currentProfile);
      const hasOwnedChicken = existingChickenCount > 0;
      activatedOnLink = hasOwnedChicken;

      if (playerSnap.exists()) {
        const liveCoins = Number(playerSnap.data().coins ?? currentProfile.coins);
        const { updatedProfile, firestorePayload } = buildUpdatedPlayerFromRaw(
          playerSnap.data(),
          currentProfile.uid,
          {
            referredBy: referrerUid,
            referralActivated: hasOwnedChicken,
            coins: liveCoins + REFERRED_WELCOME_BONUS_COINS,
          },
        );
        nextProfile = updatedProfile;
        transaction.update(playerRef, firestorePayload);
      } else {
        nextProfile = {
          ...nextProfile,
          referralActivated: hasOwnedChicken,
        };
        transaction.set(playerRef, toFirestoreProfilePayload(nextProfile, true));
      }

      if (playerLbSnap.exists()) {
        transaction.update(
          playerLbRef,
          buildUpdatedLeaderboardFromRaw(playerLbSnap.data(), nextProfile),
        );
      } else {
        transaction.set(playerLbRef, toLeaderboardPayload(nextProfile));
      }
      transaction.set(doc(db, 'players', currentProfile.uid, 'transactions', userTx.id), {
        userId: currentProfile.uid,
        type: userTx.type,
        title: userTx.title,
        amount: userTx.amount,
        currency: userTx.currency,
        usdValue: userTx.usdValue,
        status: userTx.status,
        createdAtMs: userTx.createdAtMs,
        createdAt: serverTimestamp(),
      });

      const rawName = (nextProfile.displayName || currentProfile.displayName || '').trim();
      const safeReferredName = (rawName || `Farmer ${currentProfile.uid.slice(-4)}`).slice(0, 60);
      const rawHandle = formatReferralHandle(nextProfile.handle || currentProfile.handle, currentProfile.uid).trim();
      const safeReferredHandle = (rawHandle || `@farmer_${currentProfile.uid.slice(-4)}`).slice(0, 40);

      // Link immediately as 'pending'; +150 coin referrer reward unlocks when referred user buys their first hen (miner).
      // If user already owns a hen (delayed recovery), activate immediately.
      transaction.set(referralDocRef, {
        referrerUid,
        referredUid: currentProfile.uid,
        referredName: safeReferredName,
        referredHandle: safeReferredHandle,
        status: hasOwnedChicken ? 'active' : 'pending',
        coinsEarned: hasOwnedChicken ? rewardCoins : 0,
        toppedUpUsd: 0,
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });

      if (hasOwnedChicken) {
        const rp = referrerPlayerSnap.data();
        const nextRefPlayerCoins = Number(rp.coins ?? 0) + rewardCoins;
        const nextRefCount = Number(rp.referralCount ?? 0) + 1;
        const nextRefCoinsEarned = Number(rp.referralCoinsEarned ?? 0) + rewardCoins;
        const { updatedProfile: updatedReferrer, firestorePayload } = buildUpdatedPlayerFromRaw(
          rp,
          referrerUid,
          {
            coins: nextRefPlayerCoins,
            referralCount: nextRefCount,
            referralCoinsEarned: nextRefCoinsEarned,
          },
        );

        transaction.update(referrerPlayerRef, firestorePayload);

        if (referrerLbSnap.exists()) {
          transaction.update(
            referrerLbRef,
            buildUpdatedLeaderboardFromRaw(referrerLbSnap.data(), updatedReferrer),
          );
        } else {
          transaction.set(referrerLbRef, toLeaderboardPayload(updatedReferrer));
        }

        const refRewardTxId = `tx_ref_earned_${currentProfile.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16)}_${nowMs}`.slice(0, 64);
        transaction.set(doc(db, 'players', referrerUid, 'transactions', refRewardTxId), {
          userId: referrerUid,
          type: 'referral',
          title: `Referral reward (+${rewardCoins} coins): ${safeReferredName}`.slice(0, 80),
          amount: rewardCoins,
          currency: 'coins',
          usdValue: Number((rewardCoins / 10000).toFixed(4)),
          status: 'completed',
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        });
      }
    });

    if (alreadyLinked) {
      return { error: 'You have already used a referral link on this account.' };
    }

    saveCachedPlayerProfile(nextProfile);
    return {
      profile: nextProfile,
      transaction: userTx,
      referrerUid,
      referrerName,
      coinsRewarded: activatedOnLink ? rewardCoins : 0,
      activated: activatedOnLink,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'REFERRER_MISSING') {
      return { error: `Referral ID "${rawTrimmed}" not found.` };
    }
    handleFirestoreError(error, OperationType.WRITE, `referrals/${rawTrimmed}`);
  }
}

export async function commitPlayerMutation(params: {
  profile: UserFarmProfile;
  transaction?: TransactionEntry;
  deposit?: DepositOrder;
  withdrawal?: WithdrawalOrder;
  referrerCommissionCoins?: number;
  referralEggCommission?: number;
  activateReferral?: boolean;
}): Promise<boolean> {
  const uid = params.profile.uid;
  saveCachedPlayerProfile(params.profile);

  if (params.activateReferral && params.profile.referredBy) {
    const refUid = params.profile.referredBy;
    const txId = params.transaction?.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const nowMs = params.transaction?.createdAtMs ?? Date.now();

    const refDocRef = doc(db, 'players', refUid, 'referrals', uid);
    const referrerPlayerRef = doc(db, 'players', refUid);
    const referrerLbRef = doc(db, 'leaderboard', refUid);

    try {
      await runTransaction(db, async (transaction) => {
        const [refSnap, referrerPlayerSnap, referrerLbSnap] = await Promise.all([
          transaction.get(refDocRef),
          transaction.get(referrerPlayerRef),
          transaction.get(referrerLbRef),
        ]);

        transaction.update(doc(db, 'players', uid), toFirestoreProfilePayload(params.profile, false));
        transaction.set(doc(db, 'leaderboard', uid), toLeaderboardPayload(params.profile));

        if (params.transaction && txId) {
          transaction.set(doc(db, 'players', uid, 'transactions', txId), {
            userId: uid,
            type: params.transaction.type,
            title: params.transaction.title.slice(0, 80),
            amount: params.transaction.amount,
            currency: params.transaction.currency,
            usdValue: params.transaction.usdValue,
            status: params.transaction.status,
            createdAtMs: params.transaction.createdAtMs,
            createdAt: serverTimestamp(),
          });
        }

        const shouldCreditReferrer =
          referrerPlayerSnap.exists() &&
          (!refSnap.exists() || refSnap.data().status === 'pending');

        if (shouldCreditReferrer) {
          const rp = referrerPlayerSnap.data();
          const nextCoins = Number(rp.coins ?? 0) + REFERRER_SIGNUP_BONUS_COINS;
          const nextRefCount = Number(rp.referralCount ?? 0) + 1;
          const nextRefCoinsEarned = Number(rp.referralCoinsEarned ?? 0) + REFERRER_SIGNUP_BONUS_COINS;
          const { updatedProfile: updatedReferrer, firestorePayload } = buildUpdatedPlayerFromRaw(
            rp,
            refUid,
            {
              coins: nextCoins,
              referralCount: nextRefCount,
              referralCoinsEarned: nextRefCoinsEarned,
            },
          );

          if (refSnap.exists()) {
            transaction.update(refDocRef, {
              status: 'active',
              coinsEarned: Number(refSnap.data().coinsEarned ?? 0) + REFERRER_SIGNUP_BONUS_COINS,
            });
          } else {
            const safeReferredName = (params.profile.displayName || `Farmer ${uid.slice(-4)}`).trim().slice(0, 60) || 'Farmer';
            const safeReferredHandle = formatReferralHandle(params.profile.handle, uid).slice(0, 40);
            transaction.set(refDocRef, {
              referrerUid: refUid,
              referredUid: uid,
              referredName: safeReferredName,
              referredHandle: safeReferredHandle,
              status: 'active',
              coinsEarned: REFERRER_SIGNUP_BONUS_COINS,
              toppedUpUsd: 0,
              createdAtMs: nowMs,
              createdAt: serverTimestamp(),
            });
          }

          transaction.update(referrerPlayerRef, firestorePayload);

          if (referrerLbSnap.exists()) {
            transaction.update(
              referrerLbRef,
              buildUpdatedLeaderboardFromRaw(referrerLbSnap.data(), updatedReferrer),
            );
          } else {
            transaction.set(referrerLbRef, toLeaderboardPayload(updatedReferrer));
          }

          transaction.set(doc(db, 'players', refUid, 'transactions', `tx_ref_earned_${uid}_${nowMs}`.slice(0, 64)), {
            userId: refUid,
            type: 'referral',
            title: `Referral bonus (+${REFERRER_SIGNUP_BONUS_COINS} coins): ${params.profile.displayName}`.slice(0, 80),
            amount: REFERRER_SIGNUP_BONUS_COINS,
            currency: 'coins',
            usdValue: Number((REFERRER_SIGNUP_BONUS_COINS / 10000).toFixed(4)),
            status: 'completed',
            createdAtMs: nowMs,
            createdAt: serverTimestamp(),
          });
        }
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `players/${uid}`);
    }
  }

  if (
    params.referralEggCommission &&
    params.referralEggCommission > 0 &&
    params.profile.referredBy
  ) {
    const refUid = params.profile.referredBy;
    const eggCommission = Math.max(1, Math.floor(params.referralEggCommission));
    const txId = params.transaction?.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const nowMs = params.transaction?.createdAtMs ?? Date.now();
    const referrerPlayerRef = doc(db, 'players', refUid);
    const referrerLbRef = doc(db, 'leaderboard', refUid);

    try {
      await runTransaction(db, async (transaction) => {
        const [referrerPlayerSnap, referrerLbSnap] = await Promise.all([
          transaction.get(referrerPlayerRef),
          transaction.get(referrerLbRef),
        ]);

        transaction.update(doc(db, 'players', uid), toFirestoreProfilePayload(params.profile, false));
        transaction.set(doc(db, 'leaderboard', uid), toLeaderboardPayload(params.profile));

        if (params.transaction && txId) {
          transaction.set(doc(db, 'players', uid, 'transactions', txId), {
            userId: uid,
            type: params.transaction.type,
            title: params.transaction.title.slice(0, 80),
            amount: params.transaction.amount,
            currency: params.transaction.currency,
            usdValue: params.transaction.usdValue,
            status: params.transaction.status,
            createdAtMs: params.transaction.createdAtMs,
            createdAt: serverTimestamp(),
          });
        }

        if (referrerPlayerSnap.exists()) {
          const rp = referrerPlayerSnap.data();
          const nextEggs = Number(rp.eggs ?? 0) + eggCommission;
          const nextTotalEggs = Number(rp.totalEggsCollected ?? 0) + eggCommission;
          const { updatedProfile: updatedReferrer, firestorePayload } = buildUpdatedPlayerFromRaw(
            rp,
            refUid,
            {
              eggs: nextEggs,
              totalEggsCollected: nextTotalEggs,
            },
          );

          transaction.update(referrerPlayerRef, firestorePayload);

          if (referrerLbSnap.exists()) {
            transaction.update(
              referrerLbRef,
              buildUpdatedLeaderboardFromRaw(referrerLbSnap.data(), updatedReferrer),
            );
          } else {
            transaction.set(referrerLbRef, toLeaderboardPayload(updatedReferrer));
          }

          const refTxId = `tx_regg_${uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(-12)}_${nowMs}`.slice(0, 64);
          const refFriendHandle = formatReferralHandle(params.profile.handle, uid).slice(0, 32);
          const refFriendName = (params.profile.displayName || 'Farmer').trim().slice(0, 30);
          transaction.set(doc(db, 'players', refUid, 'transactions', refTxId), {
            userId: refUid,
            type: 'referral',
            title: `5% eggs · ${refFriendHandle} (${refFriendName})`.slice(0, 80),
            amount: eggCommission,
            currency: 'eggs',
            usdValue: eggsToUsd(eggCommission),
            status: 'completed',
            createdAtMs: nowMs,
            createdAt: serverTimestamp(),
          });
        }
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `players/${uid}`);
    }
  }

  if (params.deposit) {
    const dep = params.deposit;
    const depId = dep.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const txId = (params.transaction?.id || `tx_dep_${dep.createdAtMs}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const depRef = doc(db, 'players', uid, 'deposits', depId);
    const cleanTxHash = (dep.txHash || '').trim().slice(0, 128);
    const txLedgerRef =
      cleanTxHash.length >= 4
        ? doc(db, 'processed_tx_hashes', buildTxHashLedgerId(cleanTxHash))
        : null;
    const playerRef = doc(db, 'players', uid);
    const lbRef = doc(db, 'leaderboard', uid);
    let refUid = (params.profile.referredBy || '').trim();
    if (!refUid) {
      const remotePlayerSnap = await getDocFromServer(playerRef).catch(() =>
        getDoc(playerRef).catch(() => null),
      );
      if (remotePlayerSnap?.exists()) {
        refUid = String(remotePlayerSnap.data()?.referredBy || '').trim();
      }
    }
    const computedCommission = refUid
      ? Math.max(
          1,
          params.referrerCommissionCoins && params.referrerCommissionCoins > 0
            ? Math.round(params.referrerCommissionCoins)
            : Math.round(dep.coinsAmount * REFERRAL_DEPOSIT_COMMISSION_RATE),
        )
      : 0;
    const hasCommission = Boolean(refUid && computedCommission > 0);
    const refPlayerRef = hasCommission ? doc(db, 'players', refUid) : null;
    const refRelRef = hasCommission ? doc(db, 'players', refUid, 'referrals', uid) : null;

    try {
      let applied = false;
      await runTransaction(db, async (transaction) => {
        const [depSnap, txLedgerSnap, playerSnap, refPlayerSnap, refRelSnap] = await Promise.all([
          transaction.get(depRef),
          txLedgerRef ? transaction.get(txLedgerRef) : Promise.resolve(null),
          transaction.get(playerRef),
          refPlayerRef ? transaction.get(refPlayerRef) : Promise.resolve(null),
          refRelRef ? transaction.get(refRelRef) : Promise.resolve(null),
        ]);

        if (depSnap.exists() || txLedgerSnap?.exists()) {
          applied = false;
          return;
        }
        applied = true;

        const playerRaw = playerSnap.exists() ? playerSnap.data() : undefined;
        const currentCoins = playerRaw ? Number(playerRaw.coins ?? 0) : params.profile.coins;
        const remoteReferredBy = playerRaw ? String(playerRaw.referredBy || '').trim() : '';
        const syncedProfile: UserFarmProfile = {
          ...params.profile,
          coins: currentCoins + dep.coinsAmount,
          firstDepositBonusUsed: true,
          ...(remoteReferredBy && !params.profile.referredBy
            ? {
                referredBy: remoteReferredBy,
                referralActivated: Boolean(playerRaw?.referralActivated ?? false),
              }
            : {}),
          ...(playerRaw?.createdAtMs !== undefined
            ? { createdAtMs: Number(playerRaw.createdAtMs) }
            : {}),
        };

        transaction.update(playerRef, toFirestoreProfilePayload(syncedProfile, false));
        transaction.set(lbRef, toLeaderboardPayload(syncedProfile));

        if (params.transaction) {
          transaction.set(doc(db, 'players', uid, 'transactions', txId), {
            userId: uid,
            type: params.transaction.type,
            title: params.transaction.title.slice(0, 80),
            amount: params.transaction.amount,
            currency: params.transaction.currency,
            usdValue: params.transaction.usdValue,
            status: params.transaction.status,
            createdAtMs: params.transaction.createdAtMs,
            createdAt: serverTimestamp(),
          });
        }

        transaction.set(depRef, {
          userId: uid,
          coinsAmount: dep.coinsAmount,
          bonusCoins: dep.bonusCoins,
          usdAmount: dep.usdAmount,
          network: dep.network,
          cryptoAmount: dep.cryptoAmount,
          depositAddress: dep.depositAddress,
          txHash: dep.txHash,
          status: dep.status,
          createdAtMs: dep.createdAtMs,
          createdAt: serverTimestamp(),
        });

        if (txLedgerRef && cleanTxHash.length >= 4) {
          transaction.set(txLedgerRef, {
            txHash: cleanTxHash,
            playerId: uid,
            coinsAmount: Math.min(15000, Math.max(1000, Math.round(dep.coinsAmount))),
            createdAtMs: dep.createdAtMs,
            createdAt: serverTimestamp(),
          });
        }

        if (hasCommission && refPlayerRef && refRelRef && refPlayerSnap?.exists()) {
          const commission = computedCommission;
          const refCoins = Number(refPlayerSnap.data().coins ?? 0);
          const refEarned = Number(refPlayerSnap.data().referralCoinsEarned ?? 0);
          const ids = buildDeterministicDepositIds(dep.txHash || depId);
          const { firestorePayload: refFirestorePayload } = buildUpdatedPlayerFromRaw(
            refPlayerSnap.data(),
            refUid,
            {
              coins: refCoins + commission,
              referralCoinsEarned: refEarned + commission,
            },
          );

          transaction.update(refPlayerRef, refFirestorePayload);

          if (refRelSnap?.exists()) {
            const preservedStatus =
              refRelSnap.data().status === 'pending' ? 'pending' : 'active';
            transaction.update(refRelRef, {
              status: preservedStatus,
              coinsEarned: Number(refRelSnap.data().coinsEarned ?? 0) + commission,
              toppedUpUsd: Number(refRelSnap.data().toppedUpUsd ?? 0) + dep.usdAmount,
            });
          } else {
            const safeReferredName = (syncedProfile.displayName || `Farmer ${uid.slice(-4)}`).trim().slice(0, 60) || 'Farmer';
            const safeReferredHandle = formatReferralHandle(syncedProfile.handle, uid).slice(0, 40);
            transaction.set(refRelRef, {
              referrerUid: refUid,
              referredUid: uid,
              referredName: safeReferredName,
              referredHandle: safeReferredHandle,
              status: syncedProfile.referralActivated ? 'active' : 'pending',
              coinsEarned: commission,
              toppedUpUsd: dep.usdAmount,
              createdAtMs: dep.createdAtMs,
              createdAt: serverTimestamp(),
            });
          }

          transaction.set(doc(db, 'players', refUid, 'transactions', ids.refCommissionTxId), {
            userId: refUid,
            type: 'referral',
            title: `5% commission from ${params.profile.displayName}`.slice(0, 80),
            amount: commission,
            currency: 'coins',
            usdValue: Number((commission / 10000).toFixed(3)),
            status: 'completed',
            createdAtMs: dep.createdAtMs,
            createdAt: serverTimestamp(),
          });
        }
      });
      return applied;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `players/${uid}`);
    }
  }

  const playerRef = doc(db, 'players', uid);
  const existingSnap = await getDoc(playerRef).catch(() => null);
  const playerDocExists = Boolean(existingSnap?.exists());

  const batch = writeBatch(db);

  if (playerDocExists && existingSnap?.exists()) {
    const existingRaw = existingSnap.data();
    const remoteReferredBy = String(existingRaw.referredBy || '').trim();
    const shouldPreserveConcurrentReferral = Boolean(remoteReferredBy && !params.profile.referredBy);
    const syncedProfile: UserFarmProfile = {
      ...params.profile,
      createdAtMs: Number(existingRaw.createdAtMs ?? params.profile.createdAtMs),
      ...(shouldPreserveConcurrentReferral
        ? {
            referredBy: remoteReferredBy,
            referralActivated: Boolean(existingRaw.referralActivated ?? false),
            coins: safeBoundedCoins(
              params.profile.coins + REFERRED_WELCOME_BONUS_COINS,
              params.profile.coins,
            ),
          }
        : {}),
    };
    if (shouldPreserveConcurrentReferral) {
      saveCachedPlayerProfile(syncedProfile);
    }
    batch.update(playerRef, toFirestoreProfilePayload(syncedProfile, false));
  } else {
    batch.set(playerRef, toFirestoreProfilePayload(params.profile, true));
  }
  batch.set(doc(db, 'leaderboard', uid), toLeaderboardPayload(params.profile));

  if (params.transaction) {
    const txId = params.transaction.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    batch.set(doc(db, 'players', uid, 'transactions', txId), {
      userId: uid,
      type: params.transaction.type,
      title: params.transaction.title.slice(0, 80),
      amount: params.transaction.amount,
      currency: params.transaction.currency,
      usdValue: params.transaction.usdValue,
      status: params.transaction.status,
      createdAtMs: params.transaction.createdAtMs,
      createdAt: serverTimestamp(),
    });
  }

  if (params.withdrawal) {
    const wdId = params.withdrawal.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const txId = (
      params.transaction?.id ||
      params.withdrawal.txId ||
      `tx_wd_${params.withdrawal.createdAtMs}`
    ).replace(/[^a-zA-Z0-9_-]/g, '_');
    batch.set(doc(db, 'players', uid, 'withdrawals', wdId), {
      userId: uid,
      txId,
      eggsAmount: params.withdrawal.eggsAmount,
      gramAmount: params.withdrawal.gramAmount,
      usdValue: params.withdrawal.usdValue,
      walletAddress: params.withdrawal.walletAddress,
      memo: params.withdrawal.memo,
      network: params.withdrawal.network,
      status: params.withdrawal.status,
      adminNote: '',
      reviewedAtMs: 0,
      createdAtMs: params.withdrawal.createdAtMs,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'withdraw_requests', wdId), {
      withdrawalId: wdId,
      txId,
      userId: uid,
      displayName: params.profile.displayName.slice(0, 60) || 'Farmer',
      handle: params.profile.handle.slice(0, 40) || '@farmer',
      eggsAmount: params.withdrawal.eggsAmount,
      gramAmount: params.withdrawal.gramAmount,
      usdValue: params.withdrawal.usdValue,
      walletAddress: params.withdrawal.walletAddress,
      memo: params.withdrawal.memo,
      network: params.withdrawal.network,
      status: 'pending',
      adminNote: '',
      createdAtMs: params.withdrawal.createdAtMs,
      reviewedAtMs: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `players/${uid}`);
  }
}

export async function claimGoldenEggInFirestore(
  currentProfile: UserFarmProfile,
  nowMs = Date.now(),
): Promise<
  | {
      ok: true;
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      bonusCoins: number;
      xpGained: number;
    }
  | {
      ok: false;
      error: string;
      lastGoldenEggAtMs?: number;
      remainingMs?: number;
    }
> {
  const uid = currentProfile.uid;
  const playerRef = doc(db, 'players', uid);
  const lbRef = doc(db, 'leaderboard', uid);

  let cooldownBlocked: { lastGoldenEggAtMs: number; remainingMs: number; error: string } | null = null;
  let claimedResult: {
    profile: UserFarmProfile;
    transaction: TransactionEntry;
    bonusCoins: number;
    xpGained: number;
  } | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const [playerSnap, lbSnap] = await Promise.all([tx.get(playerRef), tx.get(lbRef)]);
      const remoteRaw = playerSnap.exists() ? (playerSnap.data() as Record<string, unknown>) : null;
      const baseProfile: UserFarmProfile = remoteRaw ? parseProfileDoc(remoteRaw, uid) : currentProfile;

      const authoritativeLastAt = Math.max(
        0,
        Number(baseProfile.lastGoldenEggAtMs ?? 0) || 0,
        Number(currentProfile.lastGoldenEggAtMs ?? 0) || 0,
        getStoredGoldenEggClaimAtMs(uid),
      );
      const mergedProfile: UserFarmProfile = {
        ...baseProfile,
        lastGoldenEggAtMs: authoritativeLastAt,
      };

      const remainingMs = getGoldenEggCooldownRemainingMs(mergedProfile, nowMs);
      if (remainingMs > 0) {
        cooldownBlocked = {
          lastGoldenEggAtMs: authoritativeLastAt,
          remainingMs,
          error: `Golden egg recharging (${formatGoldenEggCooldownWait(remainingMs)}).`,
        };
        return;
      }

      const dropRes = claimGoldenEggDrop(mergedProfile, nowMs);
      if ('error' in dropRes) {
        cooldownBlocked = {
          lastGoldenEggAtMs: authoritativeLastAt,
          remainingMs: dropRes.remainingMs ?? GOLDEN_EGG_COOLDOWN_MS,
          error: dropRes.error,
        };
        return;
      }

      claimedResult = dropRes;

      if (playerSnap.exists()) {
        tx.update(playerRef, toFirestoreProfilePayload(dropRes.profile, false));
      } else {
        tx.set(playerRef, toFirestoreProfilePayload(dropRes.profile, true));
      }

      if (lbSnap.exists()) {
        tx.update(lbRef, buildUpdatedLeaderboardFromRaw(lbSnap.data(), dropRes.profile));
      } else {
        tx.set(lbRef, toLeaderboardPayload(dropRes.profile));
      }

      const txId = dropRes.transaction.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      tx.set(doc(db, 'players', uid, 'transactions', txId), {
        userId: uid,
        type: dropRes.transaction.type,
        title: dropRes.transaction.title.slice(0, 80),
        amount: dropRes.transaction.amount,
        currency: dropRes.transaction.currency,
        usdValue: dropRes.transaction.usdValue,
        status: dropRes.transaction.status,
        createdAtMs: dropRes.transaction.createdAtMs,
        createdAt: serverTimestamp(),
      });
    });

    if (cooldownBlocked) {
      const blocked = cooldownBlocked as { lastGoldenEggAtMs: number; remainingMs: number; error: string };
      setStoredGoldenEggClaimAtMs(uid, blocked.lastGoldenEggAtMs);
      return {
        ok: false,
        error: blocked.error,
        lastGoldenEggAtMs: blocked.lastGoldenEggAtMs,
        remainingMs: blocked.remainingMs,
      };
    }

    if (claimedResult) {
      const res = claimedResult as {
        profile: UserFarmProfile;
        transaction: TransactionEntry;
        bonusCoins: number;
        xpGained: number;
      };
      setStoredGoldenEggClaimAtMs(uid, res.profile.lastGoldenEggAtMs ?? nowMs);
      saveCachedPlayerProfile(res.profile);
      return { ok: true, ...res };
    }

    return { ok: false, error: 'Could not claim Golden Egg right now. Please retry.' };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `players/${uid}`);
  }
}

export function subscribeToPlayer(
  playerId: string,
  callbacks: {
    onProfile: (profile: UserFarmProfile, meta?: { fromCache: boolean }) => void;
    onTransactions: (items: TransactionEntry[]) => void;
    onReferralTransactions?: (items: TransactionEntry[]) => void;
    onDeposits: (items: DepositOrder[]) => void;
    onWithdrawals: (items: WithdrawalOrder[]) => void;
    onReferrals: (items: ReferralRecord[]) => void;
  },
): () => void {
  const unsubProfile = onSnapshot(
    doc(db, 'players', playerId),
    (snap) => {
      if (snap.exists()) {
        const parsed = parseProfileDoc(snap.data(), playerId);
        const localGoldenAt = getStoredGoldenEggClaimAtMs(playerId);
        const merged =
          localGoldenAt > (parsed.lastGoldenEggAtMs ?? 0)
            ? { ...parsed, lastGoldenEggAtMs: localGoldenAt }
            : parsed;
        saveCachedPlayerProfile(merged);
        callbacks.onProfile(merged, { fromCache: snap.metadata.fromCache });
      }
    },
    (err) => logSubscriptionError(`players/${playerId}`, err),
  );

  const txQuery = query(
    collection(db, 'players', playerId, 'transactions'),
    orderBy('createdAtMs', 'desc'),
    limit(60),
  );
  const unsubTx = onSnapshot(
    txQuery,
    (snap) => {
      callbacks.onTransactions(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: d.userId,
            type: d.type,
            title: d.title,
            amount: d.amount,
            currency: d.currency,
            usdValue: d.usdValue,
            status: d.status,
            createdAtMs: d.createdAtMs,
          };
        }),
      );
    },
    (err) => logSubscriptionError(`players/${playerId}/transactions`, err),
  );

  const refTxQuery = query(
    collection(db, 'players', playerId, 'transactions'),
    where('type', '==', 'referral'),
    limit(60),
  );
  const unsubRefTx = callbacks.onReferralTransactions
    ? onSnapshot(
        refTxQuery,
        (snap) => {
          callbacks.onReferralTransactions?.(
            snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                userId: d.userId,
                type: d.type,
                title: d.title,
                amount: d.amount,
                currency: d.currency,
                usdValue: d.usdValue,
                status: d.status,
                createdAtMs: d.createdAtMs,
              };
            }),
          );
        },
        (err) => logSubscriptionError(`players/${playerId}/transactions(referral)`, err),
      )
    : () => {};

  const depQuery = query(
    collection(db, 'players', playerId, 'deposits'),
    orderBy('createdAtMs', 'desc'),
    limit(40),
  );
  const unsubDep = onSnapshot(
    depQuery,
    (snap) => {
      callbacks.onDeposits(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: d.userId,
            coinsAmount: d.coinsAmount,
            bonusCoins: d.bonusCoins,
            usdAmount: d.usdAmount,
            network: d.network,
            cryptoAmount: d.cryptoAmount,
            depositAddress: d.depositAddress,
            txHash: d.txHash ?? '',
            status: d.status,
            createdAtMs: d.createdAtMs,
          };
        }),
      );
    },
    (err) => logSubscriptionError(`players/${playerId}/deposits`, err),
  );

  const wdQuery = query(
    collection(db, 'players', playerId, 'withdrawals'),
    orderBy('createdAtMs', 'desc'),
    limit(40),
  );
  const unsubWd = onSnapshot(
    wdQuery,
    (snap) => {
      callbacks.onWithdrawals(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            txId: d.txId ? String(d.txId) : undefined,
            userId: d.userId,
            eggsAmount: d.eggsAmount,
            gramAmount: d.gramAmount,
            usdValue: d.usdValue,
            walletAddress: d.walletAddress,
            memo: d.memo ?? '',
            network: d.network,
            status: d.status,
            adminNote: d.adminNote ? String(d.adminNote) : undefined,
            reviewedAtMs: d.reviewedAtMs ? Number(d.reviewedAtMs) : undefined,
            createdAtMs: d.createdAtMs,
          };
        }),
      );
    },
    (err) => logSubscriptionError(`players/${playerId}/withdrawals`, err),
  );

  const refQuery = query(
    collection(db, 'players', playerId, 'referrals'),
    orderBy('createdAtMs', 'desc'),
    limit(50),
  );
  const unsubRef = onSnapshot(
    refQuery,
    (snap) => {
      callbacks.onReferrals(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            referrerUid: d.referrerUid,
            referredUid: d.referredUid,
            referredName: d.referredName,
            referredHandle: d.referredHandle,
            status: d.status === 'pending' ? 'pending' : 'active',
            coinsEarned: d.coinsEarned ?? 0,
            toppedUpUsd: d.toppedUpUsd ?? 0,
            createdAtMs: d.createdAtMs ?? 0,
          };
        }),
      );
    },
    (err) => logSubscriptionError(`players/${playerId}/referrals`, err),
  );

  return () => {
    unsubProfile();
    unsubTx();
    unsubRefTx();
    unsubDep();
    unsubWd();
    unsubRef();
  };
}

function parseLeaderboardEntryDoc(docSnap: { id: string; data: () => Record<string, unknown> }): LeaderboardEntry {
  const d = docSnap.data();
  return {
    uid: String(d.uid || docSnap.id),
    displayName: String(d.displayName || 'Farmer'),
    handle: String(d.handle || '@farmer'),
    photoUrl: String(d.photoUrl || ''),
    avatarColor: String(d.avatarColor || '#EF4444'),
    referralCode: String(d.referralCode || ''),
    buyerPoints: Number(d.buyerPoints ?? 0),
    inviterCount: Number(d.inviterCount ?? 0),
    eggs: Number(d.eggs ?? 0),
    totalEggsCollected: Number(d.totalEggsCollected ?? 0),
    chickensCount: Number(d.chickensCount ?? 0),
  };
}

export function subscribeToLeaderboard(
  onUpdate: (entries: LeaderboardEntry[]) => void,
): () => void {
  let buyerEntries: LeaderboardEntry[] = [];
  let inviterEntries: LeaderboardEntry[] = [];
  let minerEntries: LeaderboardEntry[] = [];

  const emitMerged = () => {
    const merged = new Map<string, LeaderboardEntry>();
    for (const entry of buyerEntries) {
      merged.set(entry.uid, entry);
    }
    for (const entry of inviterEntries) {
      const existing = merged.get(entry.uid);
      if (!existing || entry.inviterCount > existing.inviterCount) {
        merged.set(entry.uid, entry);
      }
    }
    for (const entry of minerEntries) {
      const existing = merged.get(entry.uid);
      if (!existing || (entry.totalEggsCollected ?? entry.eggs) > (existing.totalEggsCollected ?? existing.eggs)) {
        merged.set(entry.uid, entry);
      }
    }
    onUpdate(Array.from(merged.values()));
  };

  const buyerQuery = query(
    collection(db, 'leaderboard'),
    orderBy('buyerPoints', 'desc'),
    limit(50),
  );
  const inviterQuery = query(
    collection(db, 'leaderboard'),
    orderBy('inviterCount', 'desc'),
    limit(50),
  );
  const minerQuery = query(
    collection(db, 'leaderboard'),
    orderBy('eggs', 'desc'),
    limit(50),
  );

  const unsubBuyers = onSnapshot(
    buyerQuery,
    (snap) => {
      buyerEntries = snap.docs.map(parseLeaderboardEntryDoc);
      emitMerged();
    },
    (err) => logSubscriptionError('leaderboard(buyers)', err),
  );

  const unsubInviters = onSnapshot(
    inviterQuery,
    (snap) => {
      inviterEntries = snap.docs.map(parseLeaderboardEntryDoc);
      emitMerged();
    },
    (err) => logSubscriptionError('leaderboard(inviters)', err),
  );

  const unsubMiners = onSnapshot(
    minerQuery,
    (snap) => {
      minerEntries = snap.docs.map(parseLeaderboardEntryDoc);
      emitMerged();
    },
    (err) => logSubscriptionError('leaderboard(miners)', err),
  );

  return () => {
    unsubBuyers();
    unsubInviters();
    unsubMiners();
  };
}

export async function fetchReferralLeaderboardFromFirestore(
  maxEntries = 50,
): Promise<LeaderboardEntry[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(maxEntries)));
  const q = query(
    collection(db, 'leaderboard'),
    orderBy('inviterCount', 'desc'),
    limit(safeLimit),
  );
  try {
    const snap = await getDocsFromServer(q);
    return snap.docs.map(parseLeaderboardEntryDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'leaderboard');
  }
}

export function subscribeToAllWithdrawRequests(
  onUpdate: (items: WithdrawRequestRecord[]) => void,
): () => void {
  const q = query(
    collection(db, 'withdraw_requests'),
    orderBy('createdAtMs', 'desc'),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            txId: String(d.txId || `tx_wd_${d.createdAtMs || 0}`),
            userId: String(d.userId || ''),
            displayName: String(d.displayName || 'Farmer'),
            handle: String(d.handle || '@farmer'),
            eggsAmount: Number(d.eggsAmount ?? 0),
            gramAmount: String(d.gramAmount || '0'),
            usdValue: Number(d.usdValue ?? 0),
            walletAddress: String(d.walletAddress || ''),
            memo: String(d.memo || ''),
            network: 'GRAM_TON',
            status: (d.status as WithdrawRequestRecord['status']) || 'pending',
            adminNote: String(d.adminNote || ''),
            createdAtMs: Number(d.createdAtMs ?? 0),
            reviewedAtMs: Number(d.reviewedAtMs ?? 0),
          };
        }),
      );
    },
    (err) => logSubscriptionError('withdraw_requests', err),
  );
}

export async function reviewWithdrawalInFirestore(params: {
  request: WithdrawRequestRecord;
  decision: 'approved' | 'rejected';
  adminNote?: string;
}): Promise<void> {
  const { request, decision } = params;
  const cleanNote = String(params.adminNote || '').trim().slice(0, 160);
  const nowMs = Date.now();
  const reqRef = doc(db, 'withdraw_requests', request.id);
  const playerWdRef = doc(db, 'players', request.userId, 'withdrawals', request.id);
  const playerTxRef = doc(db, 'players', request.userId, 'transactions', request.txId);
  const playerRef = doc(db, 'players', request.userId);
  const lbRef = doc(db, 'leaderboard', request.userId);

  try {
    await runTransaction(db, async (transaction) => {
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists()) {
        throw new Error('Withdrawal request no longer exists.');
      }
      if (reqSnap.data().status !== 'pending') {
        throw new Error(`Withdrawal already ${reqSnap.data().status}.`);
      }

      const [wdSnap, txSnap, playerSnap, lbSnap] = await Promise.all([
        transaction.get(playerWdRef),
        transaction.get(playerTxRef),
        decision === 'rejected' ? transaction.get(playerRef) : Promise.resolve(null),
        decision === 'rejected' ? transaction.get(lbRef) : Promise.resolve(null),
      ]);

      transaction.update(reqRef, {
        status: decision,
        adminNote: cleanNote,
        reviewedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      });

      if (wdSnap.exists()) {
        transaction.update(playerWdRef, {
          status: decision,
          adminNote: cleanNote,
          reviewedAtMs: nowMs,
        });
      }

      if (txSnap.exists()) {
        transaction.update(playerTxRef, {
          status: decision,
        });
      }

      if (decision === 'rejected' && playerSnap && playerSnap.exists()) {
        const rawPlayer = playerSnap.data();
        const currentEggs = Number(rawPlayer.eggs ?? 0);
        const currentWithdrawnUsd = Number(rawPlayer.totalWithdrawnUsd ?? 0);
        const nextEggs = currentEggs + request.eggsAmount;
        const nextWithdrawnUsd = Math.max(
          0,
          Number((currentWithdrawnUsd - request.usdValue).toFixed(4)),
        );
        const { updatedProfile, firestorePayload } = buildUpdatedPlayerFromRaw(
          rawPlayer,
          request.userId,
          {
            eggs: nextEggs,
            totalWithdrawnUsd: nextWithdrawnUsd,
          },
        );

        transaction.update(playerRef, firestorePayload);

        if (lbSnap && lbSnap.exists()) {
          transaction.update(
            lbRef,
            buildUpdatedLeaderboardFromRaw(lbSnap.data(), updatedProfile),
          );
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `withdraw_requests/${request.id}`);
  }
}

function parseCustomTaskDoc(id: string, d: Record<string, unknown>): TaskDefinition {
  const decoded = decodeTaskSubtitleMeta(d.subtitle ? String(d.subtitle) : undefined);
  const totalSlots =
    d.totalSlots !== undefined ? Number(d.totalSlots) : decoded.totalSlots;
  const claimedCount =
    d.claimedCount !== undefined
      ? Number(d.claimedCount)
      : (decoded.claimedCount ?? 0);
  const creatorUid = d.creatorUid ? String(d.creatorUid) : decoded.creatorUid;
  const paidCoins =
    d.paidCoins !== undefined ? Number(d.paidCoins) : decoded.paidCoins;
  const requireChannelCheck =
    d.requireChannelCheck === true || decoded.requireChannelCheck === true;

  return {
    id,
    category: (d.category as TaskDefinition['category']) || 'partner',
    title: String(d.title || 'Bonus task'),
    subtitle: decoded.subtitle,
    rewardCoins: Number(d.rewardCoins ?? 50),
    icon: String(d.icon || 'link'),
    actionUrl: String(d.actionUrl || ''),
    ...(totalSlots !== undefined ? { totalSlots } : {}),
    claimedCount,
    ...(creatorUid ? { creatorUid } : {}),
    ...(paidCoins !== undefined ? { paidCoins } : {}),
    ...(requireChannelCheck ? { requireChannelCheck: true } : {}),
    isCustom: true,
    isActive: d.isActive !== false,
    createdAtMs: Number(d.createdAtMs ?? 0),
  };
}

export function subscribeToCustomTasks(
  onUpdate: (items: TaskDefinition[]) => void,
): () => void {
  const q = query(
    collection(db, 'tasks'),
    orderBy('createdAtMs', 'desc'),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((docSnap) => parseCustomTaskDoc(docSnap.id, docSnap.data())));
    },
    (err) => logSubscriptionError('tasks', err),
  );
}

export async function fetchCustomTasksFromFirestore(): Promise<TaskDefinition[]> {
  const q = query(
    collection(db, 'tasks'),
    orderBy('createdAtMs', 'desc'),
    limit(100),
  );
  try {
    const snap = await getDocsFromServer(q);
    return snap.docs.map((docSnap) => parseCustomTaskDoc(docSnap.id, docSnap.data()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'tasks');
  }
}

export async function createCustomTaskInFirestore(input: {
  title: string;
  subtitle?: string;
  category: TaskDefinition['category'];
  rewardCoins: number;
  icon: string;
  actionUrl: string;
  totalSlots?: number;
}): Promise<TaskDefinition> {
  const nowMs = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const id = `task_${nowMs}_${rand}`;
  const cleanTitle = input.title.trim().slice(0, 80);
  const displaySubtitle = (input.subtitle || '').trim().slice(0, 120);
  const cleanReward = Math.max(1, Math.min(1_000_000, Math.round(input.rewardCoins)));
  const cleanIcon = input.icon.trim().slice(0, 24) || 'link';
  const cleanUrl = input.actionUrl.trim().slice(0, 256);
  const cleanTotalSlots = Math.max(0, Math.min(1_000_000, Math.round(input.totalSlots ?? 0)));
  const encodedSubtitle = encodeTaskSubtitleMeta({
    subtitle: displaySubtitle,
    totalSlots: cleanTotalSlots,
    claimedCount: 0,
  });

  try {
    await setDoc(doc(db, 'tasks', id), {
      id,
      category: input.category,
      title: cleanTitle,
      ...(encodedSubtitle ? { subtitle: encodedSubtitle } : {}),
      rewardCoins: cleanReward,
      icon: cleanIcon,
      actionUrl: cleanUrl,
      isActive: true,
      createdAtMs: nowMs,
      createdAt: serverTimestamp(),
    });
    return {
      id,
      category: input.category,
      title: cleanTitle,
      ...(displaySubtitle ? { subtitle: displaySubtitle } : {}),
      rewardCoins: cleanReward,
      icon: cleanIcon,
      actionUrl: cleanUrl,
      totalSlots: cleanTotalSlots,
      claimedCount: 0,
      isCustom: true,
      isActive: true,
      createdAtMs: nowMs,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${id}`);
  }
}

export async function createPaidCustomTaskInFirestore(params: {
  profile: UserFarmProfile;
  transaction: TransactionEntry;
  paidCoins: number;
  minTotalCostCoins?: number;
  taskInput: {
    title: string;
    subtitle?: string;
    category: TaskDefinition['category'];
    rewardCoins: number;
    icon: string;
    actionUrl: string;
    totalSlots: number;
    requireChannelCheck?: boolean;
  };
}): Promise<{ task: TaskDefinition; profile: UserFarmProfile } | { error: string }> {
  const uid = params.profile.uid;
  const nowMs = params.transaction.createdAtMs || Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const taskId = `task_${nowMs}_${rand}`;
  const cleanTitle = params.taskInput.title.trim().slice(0, 80);
  const displaySubtitle = (params.taskInput.subtitle || '').trim().slice(0, 120);
  const cleanReward = Math.max(
    USER_TASK_MIN_REWARD_COINS,
    Math.min(USER_TASK_MAX_REWARD_COINS, Math.round(params.taskInput.rewardCoins)),
  );
  const cleanIcon = params.taskInput.icon.trim().slice(0, 24) || 'link';
  const cleanUrl = params.taskInput.actionUrl.trim().slice(0, 256);
  const cleanTotalSlots = Math.max(
    USER_TASK_MIN_SLOTS,
    Math.min(USER_TASK_MAX_SLOTS, Math.round(params.taskInput.totalSlots)),
  );
  const effectiveMinTotal = Math.max(
    100,
    Math.round(params.minTotalCostCoins ?? USER_TASK_MIN_TOTAL_COST_COINS),
  );
  const paidCoins = Math.max(100, Math.round(params.paidCoins));
  const requireChannelCheck = Boolean(params.taskInput.requireChannelCheck);
  const encodedSubtitle = encodeTaskSubtitleMeta({
    subtitle: displaySubtitle,
    totalSlots: cleanTotalSlots,
    claimedCount: 0,
    creatorUid: uid,
    paidCoins,
    requireChannelCheck,
  });
  const txId = params.transaction.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  const playerRef = doc(db, 'players', uid);
  const lbRef = doc(db, 'leaderboard', uid);
  const taskRef = doc(db, 'tasks', taskId);
  const txRef = doc(db, 'players', uid, 'transactions', txId);

  try {
    const result = await runTransaction(db, async (tx) => {
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        return { error: 'Player profile not synced yet.' } as const;
      }
      const liveCoins = Number(playerSnap.data().coins ?? 0);
      if (
        liveCoins < paidCoins ||
        (liveCoins < effectiveMinTotal && paidCoins + cleanReward < effectiveMinTotal)
      ) {
        return {
          error: `Need at least ${Math.max(effectiveMinTotal, paidCoins).toLocaleString()} coins to publish this task (you have ${liveCoins.toLocaleString()}).`,
        } as const;
      }

      const syncedProfile: UserFarmProfile = {
        ...params.profile,
        coins: liveCoins - paidCoins,
      };

      tx.update(playerRef, toFirestoreProfilePayload(syncedProfile, false));
      tx.set(lbRef, toLeaderboardPayload(syncedProfile));
      tx.set(txRef, {
        userId: uid,
        type: params.transaction.type,
        title: params.transaction.title.slice(0, 80),
        amount: params.transaction.amount,
        currency: params.transaction.currency,
        usdValue: params.transaction.usdValue,
        status: params.transaction.status,
        createdAtMs: params.transaction.createdAtMs,
        createdAt: serverTimestamp(),
      });
      tx.set(taskRef, {
        id: taskId,
        category: params.taskInput.category,
        title: cleanTitle,
        ...(encodedSubtitle ? { subtitle: encodedSubtitle } : {}),
        rewardCoins: cleanReward,
        icon: cleanIcon,
        actionUrl: cleanUrl,
        isActive: true,
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });

      const task: TaskDefinition = {
        id: taskId,
        category: params.taskInput.category,
        title: cleanTitle,
        ...(displaySubtitle ? { subtitle: displaySubtitle } : {}),
        rewardCoins: cleanReward,
        icon: cleanIcon,
        actionUrl: cleanUrl,
        totalSlots: cleanTotalSlots,
        claimedCount: 0,
        creatorUid: uid,
        paidCoins,
        ...(requireChannelCheck ? { requireChannelCheck: true } : {}),
        isCustom: true,
        isActive: true,
        createdAtMs: nowMs,
      };

      return { task, profile: syncedProfile } as const;
    });

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
  }
}

export async function topUpPaidCustomTaskInFirestore(params: {
  profile: UserFarmProfile;
  taskId: string;
  addedSlots: number;
  addedPaidCoins: number;
  transaction: TransactionEntry;
}): Promise<{ task: TaskDefinition; profile: UserFarmProfile } | { error: string }> {
  const uid = params.profile.uid;
  const { taskId } = params;
  const addedPaidCoins = Math.max(0, Math.round(params.addedPaidCoins));
  const addedSlots = Math.max(1, Math.round(params.addedSlots));
  const txId = params.transaction.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  const playerRef = doc(db, 'players', uid);
  const lbRef = doc(db, 'leaderboard', uid);
  const taskRef = doc(db, 'tasks', taskId);
  const txRef = doc(db, 'players', uid, 'transactions', txId);

  try {
    return await runTransaction(db, async (tx) => {
      const [playerSnap, taskSnap] = await Promise.all([tx.get(playerRef), tx.get(taskRef)]);
      if (!playerSnap.exists()) {
        return { error: 'Player profile not synced yet.' } as const;
      }
      if (!taskSnap.exists()) {
        return { error: 'Campaign task no longer exists.' } as const;
      }

      const d = taskSnap.data();
      const parsed = parseCustomTaskDoc(taskSnap.id, d);
      if (parsed.creatorUid !== uid) {
        return { error: 'Only the campaign owner can top up this task.' } as const;
      }

      const liveCoins = Number(playerSnap.data().coins ?? 0);
      if (liveCoins < addedPaidCoins) {
        return {
          error: `Need ${addedPaidCoins.toLocaleString()} coins to top up (you have ${liveCoins.toLocaleString()}).`,
        } as const;
      }

      const nextTotalSlots = Math.min(1_000_000, Math.max(0, (parsed.totalSlots ?? 0) + addedSlots));
      const nextPaidCoins = Math.max(0, (parsed.paidCoins ?? 0) + addedPaidCoins);
      const nextClaimed = Math.max(0, Math.floor(Number(parsed.claimedCount ?? 0)));

      const encodedSubtitle = encodeTaskSubtitleMeta({
        subtitle: parsed.subtitle,
        totalSlots: nextTotalSlots,
        claimedCount: nextClaimed,
        creatorUid: uid,
        paidCoins: nextPaidCoins,
        requireChannelCheck: parsed.requireChannelCheck,
      });

      const syncedProfile: UserFarmProfile = {
        ...params.profile,
        coins: liveCoins - addedPaidCoins,
      };

      tx.update(playerRef, toFirestoreProfilePayload(syncedProfile, false));
      tx.set(lbRef, toLeaderboardPayload(syncedProfile));
      tx.set(txRef, {
        userId: uid,
        type: params.transaction.type,
        title: params.transaction.title.slice(0, 80),
        amount: params.transaction.amount,
        currency: params.transaction.currency,
        usdValue: params.transaction.usdValue,
        status: params.transaction.status,
        createdAtMs: params.transaction.createdAtMs,
        createdAt: serverTimestamp(),
      });
      tx.update(taskRef, {
        isActive: true,
        ...(encodedSubtitle ? { subtitle: encodedSubtitle } : {}),
        ...(d.totalSlots !== undefined ? { totalSlots: nextTotalSlots } : {}),
      });

      return {
        task: {
          ...parsed,
          totalSlots: nextTotalSlots,
          paidCoins: nextPaidCoins,
          isActive: true,
        },
        profile: syncedProfile,
      } as const;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
  }
}

export async function refundPaidCustomTaskInFirestore(params: {
  profile: UserFarmProfile;
  taskId: string;
  transaction: TransactionEntry;
}): Promise<{ task: TaskDefinition; profile: UserFarmProfile; refundCoins: number } | { error: string }> {
  const uid = params.profile.uid;
  const { taskId } = params;
  const txId = params.transaction.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  const playerRef = doc(db, 'players', uid);
  const lbRef = doc(db, 'leaderboard', uid);
  const taskRef = doc(db, 'tasks', taskId);
  const txRef = doc(db, 'players', uid, 'transactions', txId);

  try {
    return await runTransaction(db, async (tx) => {
      const [playerSnap, taskSnap] = await Promise.all([tx.get(playerRef), tx.get(taskRef)]);
      if (!playerSnap.exists()) {
        return { error: 'Player profile not synced yet.' } as const;
      }
      if (!taskSnap.exists()) {
        return { error: 'Campaign task no longer exists.' } as const;
      }

      const d = taskSnap.data();
      const parsed = parseCustomTaskDoc(taskSnap.id, d);
      if (parsed.creatorUid !== uid) {
        return { error: 'Only the campaign owner can refund this task.' } as const;
      }

      const claimed = Math.max(0, Math.floor(Number(parsed.claimedCount ?? 0)));
      const totalSlots = Math.max(0, Math.floor(Number(parsed.totalSlots ?? 0)));
      const remainingSlots = Math.max(0, totalSlots - claimed);
      if (!parsed.isActive || remainingSlots <= 0) {
        return { error: 'No refundable unused slots remaining on this campaign.' } as const;
      }

      const refundCoins = remainingSlots * parsed.rewardCoins;
      const nextPaidCoins = Math.max(0, (parsed.paidCoins ?? totalSlots * parsed.rewardCoins) - refundCoins);
      const encodedSubtitle = encodeTaskSubtitleMeta({
        subtitle: parsed.subtitle,
        totalSlots: claimed,
        claimedCount: claimed,
        creatorUid: uid,
        paidCoins: nextPaidCoins,
        requireChannelCheck: parsed.requireChannelCheck,
      });

      const liveCoins = Number(playerSnap.data().coins ?? 0);
      const syncedProfile: UserFarmProfile = {
        ...params.profile,
        coins: liveCoins + refundCoins,
      };

      tx.update(playerRef, toFirestoreProfilePayload(syncedProfile, false));
      tx.set(lbRef, toLeaderboardPayload(syncedProfile));
      tx.set(txRef, {
        userId: uid,
        type: params.transaction.type,
        title: params.transaction.title.slice(0, 80),
        amount: refundCoins,
        currency: 'coins',
        usdValue: coinsToUsd(refundCoins),
        status: params.transaction.status,
        createdAtMs: params.transaction.createdAtMs,
        createdAt: serverTimestamp(),
      });
      tx.update(taskRef, {
        isActive: false,
        ...(encodedSubtitle ? { subtitle: encodedSubtitle } : {}),
        ...(d.totalSlots !== undefined ? { totalSlots: claimed } : {}),
      });

      return {
        task: {
          ...parsed,
          totalSlots: claimed,
          paidCoins: nextPaidCoins,
          isActive: false,
        },
        profile: syncedProfile,
        refundCoins,
      } as const;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
  }
}

export async function incrementTaskClaimCountInFirestore(taskId: string): Promise<void> {
  const ref = doc(db, 'tasks', taskId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      const parsed = parseCustomTaskDoc(snap.id, d);
      const total = Number(parsed.totalSlots ?? 0);
      if (!Number.isFinite(total) || total <= 0) {
        return;
      }
      const current = Math.max(0, Math.floor(Number(parsed.claimedCount ?? 0)));
      if (current >= total) return;

      const nextClaimed = current + 1;
      if (d.totalSlots !== undefined) {
        transaction.update(ref, { claimedCount: nextClaimed });
        return;
      }

      const nextSubtitle = encodeTaskSubtitleMeta({
        subtitle: parsed.subtitle,
        totalSlots: total,
        claimedCount: nextClaimed,
        creatorUid: parsed.creatorUid,
        paidCoins: parsed.paidCoins,
        requireChannelCheck: parsed.requireChannelCheck,
      });
      if (nextSubtitle) {
        transaction.update(ref, { subtitle: nextSubtitle });
      }
    });
  } catch (error) {
    if (isFirestorePermissionDenied(error)) {
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
  }
}

export async function toggleCustomTaskInFirestore(taskId: string, isActive: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'tasks', taskId), { isActive });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
  }
}

export async function deleteCustomTaskInFirestore(taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
  }
}

export function subscribeToAdConfig(onUpdate: (config: AdConfig) => void): () => void {
  return onSnapshot(
    doc(db, 'app_config', 'ads'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_AD_CONFIG);
        return;
      }
      const d = snap.data();
      onUpdate({
        provider: (d.provider as AdConfig['provider']) || 'countdown',
        adsgramBlockId: String(d.adsgramBlockId || ''),
        adsgramTaskBlockId: String(d.adsgramTaskBlockId || ''),
        gigapubProjectId: String(d.gigapubProjectId || ''),
        monetagZoneId: String(d.monetagZoneId || ''),
        customTitle: String(d.customTitle || DEFAULT_AD_CONFIG.customTitle),
        customDescription: String(d.customDescription || DEFAULT_AD_CONFIG.customDescription),
        customUrl: String(d.customUrl || ''),
        watchSeconds: Math.max(3, Math.min(60, Number(d.watchSeconds ?? 5))),
        bannerEnabled: Boolean(d.bannerEnabled),
        bannerTitle: String(d.bannerTitle || DEFAULT_AD_CONFIG.bannerTitle),
        bannerSubtitle: String(d.bannerSubtitle || DEFAULT_AD_CONFIG.bannerSubtitle),
        bannerCtaText: String(d.bannerCtaText || DEFAULT_AD_CONFIG.bannerCtaText),
        bannerUrl: String(d.bannerUrl || DEFAULT_AD_CONFIG.bannerUrl),
        updatedAtMs: Number(d.updatedAtMs ?? 0),
      });
    },
    (err) => logSubscriptionError('app_config/ads', err),
  );
}

export async function saveAdConfigInFirestore(
  config: Omit<AdConfig, 'updatedAtMs'>,
): Promise<AdConfig> {
  const nowMs = Date.now();
  const payload: AdConfig = {
    provider: config.provider,
    adsgramBlockId: config.adsgramBlockId.trim().slice(0, 64),
    adsgramTaskBlockId: (config.adsgramTaskBlockId || '').trim().slice(0, 64),
    gigapubProjectId: (config.gigapubProjectId || '').trim().slice(0, 64),
    monetagZoneId: config.monetagZoneId.trim().slice(0, 64),
    customTitle: config.customTitle.trim().slice(0, 80) || DEFAULT_AD_CONFIG.customTitle,
    customDescription: config.customDescription.trim().slice(0, 200),
    customUrl: config.customUrl.trim().slice(0, 256),
    watchSeconds: Math.max(3, Math.min(60, Math.round(config.watchSeconds || 5))),
    bannerEnabled: Boolean(config.bannerEnabled),
    bannerTitle: config.bannerTitle.trim().slice(0, 80) || DEFAULT_AD_CONFIG.bannerTitle,
    bannerSubtitle: config.bannerSubtitle.trim().slice(0, 160),
    bannerCtaText: config.bannerCtaText.trim().slice(0, 24) || 'Open',
    bannerUrl: config.bannerUrl.trim().slice(0, 256),
    updatedAtMs: nowMs,
  };

  const writeDoc: Record<string, unknown> = {
    provider: payload.provider,
    adsgramBlockId: payload.adsgramBlockId,
    monetagZoneId: payload.monetagZoneId,
    customTitle: payload.customTitle,
    customDescription: payload.customDescription,
    customUrl: payload.customUrl,
    watchSeconds: payload.watchSeconds,
    bannerEnabled: payload.bannerEnabled,
    bannerTitle: payload.bannerTitle,
    bannerSubtitle: payload.bannerSubtitle,
    bannerCtaText: payload.bannerCtaText,
    bannerUrl: payload.bannerUrl,
    updatedAtMs: payload.updatedAtMs,
    updatedAt: serverTimestamp(),
  };
  if (payload.adsgramTaskBlockId) {
    writeDoc.adsgramTaskBlockId = payload.adsgramTaskBlockId;
  }
  if (payload.gigapubProjectId) {
    writeDoc.gigapubProjectId = payload.gigapubProjectId;
  }

  try {
    await setDoc(doc(db, 'app_config', 'ads'), writeDoc);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/ads');
  }
}

export function buildTxHashLedgerId(txHash: string): string {
  const clean = txHash.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `tx_${clean.slice(0, 56)}`;
}

export async function recordProcessedTxHashInFirestore(
  txHash: string,
  playerId: string,
  coinsAmount: number,
): Promise<void> {
  const cleanHash = txHash.trim().slice(0, 128);
  if (cleanHash.length < 4) return;
  const txKey = buildTxHashLedgerId(cleanHash);
  const clampedCoins = Math.min(15000, Math.max(1000, Math.round(coinsAmount)));
  try {
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'processed_tx_hashes', txKey);
      const snap = await transaction.get(ref);
      if (snap.exists()) return;
      transaction.set(ref, {
        txHash: cleanHash,
        playerId,
        coinsAmount: clampedCoins,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `processed_tx_hashes/${txKey}`);
  }
}

export function subscribeToPromoCodes(
  onUpdate: (codes: DynamicPromoCode[]) => void,
): () => void {
  const q = query(
    collection(db, 'promo_codes'),
    orderBy('createdAtMs', 'desc'),
    limit(50),
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((docSnap) => {
          const d = docSnap.data();
          const decoded = decodePromoLabelMeta(
            String(d.label || 'Gift Drop'),
            Number(d.coins ?? 50),
          );
          return {
            code: String(d.code || docSnap.id),
            label: decoded.label,
            coins: decoded.coins,
            rewardType: decoded.rewardType,
            eggs: decoded.eggs,
            chickenBreed: decoded.chickenBreed,
            chickenQty: decoded.chickenQty,
            maxUses: Number(d.maxUses ?? 0),
            usedCount: Number(d.usedCount ?? 0),
            expiresAtMs: Number(d.expiresAtMs ?? 0),
            isActive: d.isActive !== false,
            createdAtMs: Number(d.createdAtMs ?? 0),
          };
        }),
      );
    },
    (err) => logSubscriptionError('promo_codes', err),
  );
}

export async function createPromoCodeInFirestore(input: {
  code: string;
  label: string;
  coins: number;
  rewardType?: PromoRewardType;
  eggs?: number;
  chickenBreed?: ChickenBreedId;
  chickenQty?: number;
  maxUses: number;
  expiresInHours: number;
}): Promise<DynamicPromoCode> {
  const cleanCode = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  if (cleanCode.length < 3) {
    throw new Error('Gift code must be at least 3 letters/numbers.');
  }
  const nowMs = Date.now();
  const { encodedLabel, firestoreCoins } = encodePromoLabelMeta({
    label: input.label.trim() || `${cleanCode} Gift`,
    rewardType: input.rewardType,
    coins: input.coins,
    eggs: input.eggs,
    chickenBreed: input.chickenBreed,
    chickenQty: input.chickenQty,
  });
  const decoded = decodePromoLabelMeta(encodedLabel, firestoreCoins);
  const cleanMaxUses = Math.max(0, Math.min(1_000_000, Math.round(input.maxUses)));
  const cleanExpiresAtMs =
    input.expiresInHours > 0 ? nowMs + Math.round(input.expiresInHours * 3_600_000) : 0;

  try {
    await setDoc(doc(db, 'promo_codes', cleanCode), {
      code: cleanCode,
      label: encodedLabel,
      coins: firestoreCoins,
      maxUses: cleanMaxUses,
      usedCount: 0,
      expiresAtMs: cleanExpiresAtMs,
      isActive: true,
      createdAtMs: nowMs,
      createdAt: serverTimestamp(),
    });
    return {
      code: cleanCode,
      label: decoded.label,
      coins: decoded.coins,
      rewardType: decoded.rewardType,
      eggs: decoded.eggs,
      chickenBreed: decoded.chickenBreed,
      chickenQty: decoded.chickenQty,
      maxUses: cleanMaxUses,
      usedCount: 0,
      expiresAtMs: cleanExpiresAtMs,
      isActive: true,
      createdAtMs: nowMs,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `promo_codes/${cleanCode}`);
  }
}

export async function togglePromoCodeInFirestore(
  code: string,
  isActive: boolean,
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  try {
    await updateDoc(doc(db, 'promo_codes', cleanCode), { isActive });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `promo_codes/${cleanCode}`);
  }
}

export async function deletePromoCodeInFirestore(code: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  try {
    await deleteDoc(doc(db, 'promo_codes', cleanCode));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `promo_codes/${cleanCode}`);
  }
}

export async function incrementPromoCodeUseInFirestore(code: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  const ref = doc(db, 'promo_codes', cleanCode);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      const maxUses = Number(d.maxUses ?? 0);
      const currentUsed = Number(d.usedCount ?? 0);
      if (maxUses > 0 && currentUsed >= maxUses) return;
      transaction.update(ref, { usedCount: currentUsed + 1 });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `promo_codes/${cleanCode}`);
  }
}

export function subscribeToSeasonConfig(
  onUpdate: (config: SeasonConfig) => void,
): () => void {
  return onSnapshot(
    doc(db, 'app_config', 'season'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(createDefaultSeasonConfig());
        return;
      }
      const d = snap.data();
      const winners = Array.isArray(d.lastWinners)
        ? (d.lastWinners as SeasonWinnerRecord[]).slice(0, 15)
        : [];
      onUpdate({
        seasonNumber: Math.max(1, Number(d.seasonNumber ?? 1)),
        title: String(d.title || 'Harvest Cup Season 1'),
        prizePoolCoins: Math.max(0, Number(d.prizePoolCoins ?? 25000)),
        endsAtMs: Number(d.endsAtMs ?? Date.now() + 4 * 86_400_000),
        lastWinners: winners,
        updatedAtMs: Number(d.updatedAtMs ?? 0),
      });
    },
    (err) => logSubscriptionError('app_config/season', err),
  );
}

export function subscribeToChannelsConfig(
  onUpdate: (config: ChannelsConfig) => void,
): () => void {
  return onSnapshot(
    doc(db, 'app_config', 'channels'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_CHANNELS_CONFIG);
        return;
      }
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

      onUpdate({
        enabled: d.enabled !== false,
        channels: parsedChannels,
        getCodeChannelUrl:
          typeof d.getCodeChannelUrl === 'string' && d.getCodeChannelUrl.trim()
            ? String(d.getCodeChannelUrl).trim().slice(0, 256)
            : DEFAULT_CHANNELS_CONFIG.getCodeChannelUrl,
        updatedAtMs: Number(d.updatedAtMs ?? 0),
      });
    },
    (err) => logSubscriptionError('app_config/channels', err),
  );
}

export async function saveChannelsConfigInFirestore(
  config: Omit<ChannelsConfig, 'updatedAtMs'>,
): Promise<ChannelsConfig> {
  const nowMs = Date.now();
  const normalizedChannels: RequiredTelegramChannel[] = (config.channels ?? [])
    .map((ch, idx) => normalizeTelegramChannelEntry(ch, idx))
    .filter((ch): ch is RequiredTelegramChannel => Boolean(ch))
    .slice(0, 10);

  const rawGetCode = String(config.getCodeChannelUrl ?? '').trim().slice(0, 256);

  const payload: ChannelsConfig = {
    enabled: Boolean(config.enabled),
    channels: normalizedChannels,
    getCodeChannelUrl: rawGetCode,
    updatedAtMs: nowMs,
  };

  const writeDoc: Record<string, unknown> = {
    enabled: payload.enabled,
    channels: payload.channels,
    updatedAtMs: payload.updatedAtMs,
    updatedAt: serverTimestamp(),
  };
  if (rawGetCode) {
    writeDoc.getCodeChannelUrl = rawGetCode;
  }

  try {
    await setDoc(doc(db, 'app_config', 'channels'), writeDoc);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/channels');
  }
}

export async function saveSeasonConfigInFirestore(
  config: Omit<SeasonConfig, 'updatedAtMs'>,
): Promise<SeasonConfig> {
  const nowMs = Date.now();
  const payload: SeasonConfig = {
    seasonNumber: Math.max(1, Math.min(9999, Math.round(config.seasonNumber || 1))),
    title: config.title.trim().slice(0, 80) || `Harvest Cup Season ${config.seasonNumber || 1}`,
    prizePoolCoins: Math.max(0, Math.min(10_000_000, Math.round(config.prizePoolCoins || 0))),
    endsAtMs: Math.max(0, Math.round(config.endsAtMs || nowMs + 4 * 86_400_000)),
    lastWinners: (config.lastWinners ?? []).slice(0, 15),
    updatedAtMs: nowMs,
  };

  try {
    await setDoc(doc(db, 'app_config', 'season'), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/season');
  }
}

export async function distributeSeasonPrizesInFirestore(params: {
  entries: LeaderboardEntry[];
  season: SeasonConfig;
  nextDurationDays?: number;
}): Promise<SeasonConfig> {
  const { entries, season } = params;
  const nowMs = Date.now();
  const pool = Math.max(0, Math.round(season.prizePoolCoins));
  const sortedBuyers = [...entries]
    .sort((a, b) => b.buyerPoints - a.buyerPoints || b.eggs - a.eggs)
    .slice(0, 3);
  const shares = [0.5, 0.3, 0.2];
  const winners: SeasonWinnerRecord[] = [];

  for (let i = 0; i < sortedBuyers.length; i += 1) {
    const entry = sortedBuyers[i];
    const prizeCoins = Math.round(pool * (shares[i] ?? 0));
    if (prizeCoins <= 0) continue;
    winners.push({
      uid: entry.uid,
      displayName: entry.displayName.slice(0, 60),
      handle: entry.handle.slice(0, 40),
      category: 'buyers',
      rank: i + 1,
      prizeCoins,
    });
  }

  try {
    for (const w of winners) {
      const playerRef = doc(db, 'players', w.uid);
      const snap = await getDoc(playerRef);
      if (!snap.exists()) continue;
      const currentProfile = parseProfileDoc(snap.data(), w.uid);
      const nextProfile: UserFarmProfile = {
        ...currentProfile,
        coins: currentProfile.coins + w.prizeCoins,
      };
      const txId = `tx_season_${season.seasonNumber}_${w.rank}_${nowMs}`.slice(0, 64);
      const batch = writeBatch(db);
      batch.update(playerRef, toFirestoreProfilePayload(nextProfile, false));
      batch.set(doc(db, 'players', w.uid, 'transactions', txId), {
        userId: w.uid,
        type: 'season_prize',
        title: `Season #${season.seasonNumber} Rank #${w.rank} Prize`.slice(0, 80),
        amount: w.prizeCoins,
        currency: 'coins',
        usdValue: Number((w.prizeCoins / 10000).toFixed(3)),
        status: 'completed',
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    }

    const nextSeasonNum = season.seasonNumber + 1;
    const durationDays = Math.max(1, Math.min(90, params.nextDurationDays ?? 7));
    const nextSeason: SeasonConfig = {
      seasonNumber: nextSeasonNum,
      title: `Harvest Cup Season ${nextSeasonNum}`,
      prizePoolCoins: pool,
      endsAtMs: nowMs + durationDays * 86_400_000,
      lastWinners: winners,
      updatedAtMs: nowMs,
    };

    await setDoc(doc(db, 'app_config', 'season'), {
      ...nextSeason,
      updatedAt: serverTimestamp(),
    });
    return nextSeason;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/season');
  }
}

function parseBannedUserDoc(id: string, d: Record<string, unknown>): BannedUserRecord {
  return {
    uid: String(d.uid || id),
    displayName: String(d.displayName || ''),
    handle: String(d.handle || ''),
    reason: String(d.reason || ''),
    bannedBy: String(d.bannedBy || ''),
    bannedAtMs: Number(d.bannedAtMs ?? 0),
  };
}

export function loadCachedBanRecord(playerId: string): BannedUserRecord | null {
  try {
    if (typeof localStorage === 'undefined' || !playerId || isAdminPlayerId(playerId)) {
      return null;
    }
    const canonical = normalizePlayerBanId(playerId) || playerId;
    const raw =
      localStorage.getItem(`${BAN_CACHE_PREFIX}${canonical}`) ||
      localStorage.getItem(`${BAN_CACHE_PREFIX}${playerId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BannedUserRecord;
    return parsed?.uid ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedBanRecord(
  playerId: string,
  ban: BannedUserRecord | null,
): void {
  try {
    if (typeof localStorage === 'undefined' || !playerId) return;
    const canonical = normalizePlayerBanId(playerId) || playerId;
    if (!ban) {
      localStorage.removeItem(`${BAN_CACHE_PREFIX}${canonical}`);
      localStorage.removeItem(`${BAN_CACHE_PREFIX}${playerId}`);
      return;
    }
    localStorage.setItem(`${BAN_CACHE_PREFIX}${canonical}`, JSON.stringify(ban));
  } catch {
    // Ignore storage errors
  }
}

export function subscribeToPlayerBanStatus(
  playerId: string,
  onUpdate: (ban: BannedUserRecord | null) => void,
): () => void {
  if (!playerId || isAdminPlayerId(playerId)) {
    saveCachedBanRecord(playerId, null);
    onUpdate(null);
    return () => {};
  }
  const canonicalId = normalizePlayerBanId(playerId) || playerId;
  return onSnapshot(
    doc(db, 'banned_users', canonicalId),
    (snap) => {
      if (!snap.exists()) {
        saveCachedBanRecord(canonicalId, null);
        onUpdate(null);
        return;
      }
      const parsed = parseBannedUserDoc(snap.id, snap.data());
      saveCachedBanRecord(canonicalId, parsed);
      onUpdate(parsed);
    },
    (err) => logSubscriptionError(`banned_users/${canonicalId}`, err),
  );
}

export function subscribeToRecentPlayers(
  onUpdate: (players: UserFarmProfile[]) => void,
  maxLimit = 50,
): () => void {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(maxLimit)));
  const q = query(
    collection(db, 'players'),
    orderBy('createdAtMs', 'desc'),
    limit(safeLimit),
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs
          .filter((docSnap) => !isReservedSystemPlayerDocId(docSnap.id))
          .map((docSnap) => parseProfileDoc(docSnap.data(), docSnap.id)),
      );
    },
    (err) => logSubscriptionError('players', err),
  );
}

export function subscribeToBannedUsers(
  onUpdate: (items: BannedUserRecord[]) => void,
): () => void {
  const q = query(
    collection(db, 'banned_users'),
    orderBy('bannedAtMs', 'desc'),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((docSnap) => parseBannedUserDoc(docSnap.id, docSnap.data())),
      );
    },
    (err) => logSubscriptionError('banned_users', err),
  );
}

export async function banPlayerInFirestore(params: {
  targetId: string;
  displayName?: string;
  handle?: string;
  reason?: string;
  bannedBy: string;
  extraAdminIds?: readonly string[];
}): Promise<BannedUserRecord> {
  if (!isAdminPlayerId(params.bannedBy, params.extraAdminIds)) {
    throw new Error('Only authorized Admins can block or ban players.');
  }
  const check = canBanPlayerId(params.targetId, params.extraAdminIds);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const canonicalId = check.canonicalId;
  const nowMs = Date.now();
  const payload: BannedUserRecord = {
    uid: canonicalId,
    displayName: String(params.displayName || '').trim().slice(0, 60),
    handle: String(params.handle || '').trim().slice(0, 40),
    reason: (String(params.reason || '').trim() || 'Blocked by Administrator').slice(0, 160),
    bannedBy: params.bannedBy.trim().slice(0, 64),
    bannedAtMs: nowMs,
  };

  const ref = doc(db, 'banned_users', canonicalId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.update(ref, {
          displayName: payload.displayName,
          handle: payload.handle,
          reason: payload.reason,
          bannedBy: payload.bannedBy,
          bannedAtMs: payload.bannedAtMs,
        });
      } else {
        tx.set(ref, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `banned_users/${canonicalId}`);
  }
}

export async function unbanPlayerInFirestore(targetId: string): Promise<void> {
  const canonicalId = normalizePlayerBanId(targetId) || String(targetId || '').trim();
  if (!canonicalId) {
    throw new Error('Invalid Player ID.');
  }
  try {
    await deleteDoc(doc(db, 'banned_users', canonicalId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `banned_users/${canonicalId}`);
  }
}

function extractRawAdminVaultEntry(d: Record<string, unknown> | undefined): AdminRoleEntry | null {
  if (!d || !Array.isArray(d.admins)) return null;
  for (const item of d.admins) {
    if (item && typeof item === 'object' && String((item as Record<string, unknown>).uid || '') === ADMIN_PASSCODE_VAULT_UID) {
      const rec = item as Record<string, unknown>;
      return {
        uid: ADMIN_PASSCODE_VAULT_UID,
        displayName: String(rec.displayName || '').slice(0, 60),
        handle: String(rec.handle || '').slice(0, 40),
        addedBy: String(rec.addedBy || '').trim().slice(0, 64),
        addedAtMs: Number(rec.addedAtMs ?? 0),
      };
    }
  }
  return null;
}

function parseAdminsConfigDoc(d: Record<string, unknown> | undefined): AdminsConfig {
  if (!d) return DEFAULT_ADMINS_CONFIG;
  const rawAdmins = Array.isArray(d.admins) ? d.admins : [];
  const admins: AdminRoleEntry[] = rawAdmins
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      uid: normalizePlayerBanId(item.uid) || String(item.uid || '').trim(),
      displayName: String(item.displayName || '').trim().slice(0, 60),
      handle: String(item.handle || '').trim().slice(0, 40),
      addedBy: String(item.addedBy || '').trim().slice(0, 64),
      addedAtMs: Number(item.addedAtMs ?? 0),
    }))
    .filter((entry) => Boolean(entry.uid) && entry.uid !== ADMIN_PASSCODE_VAULT_UID)
    .slice(0, 30);

  const rawIds = Array.isArray(d.adminIds)
    ? d.adminIds
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && id !== ADMIN_PASSCODE_VAULT_UID)
    : [];
  const mergedIds = Array.from(
    new Set([...rawIds, ...admins.map((a) => a.uid)]),
  ).slice(0, 30);

  return {
    adminIds: mergedIds,
    admins,
    updatedAtMs: Number(d.updatedAtMs ?? 0),
  };
}

export function subscribeToAdminsConfig(
  onUpdate: (config: AdminsConfig) => void,
): () => void {
  return onSnapshot(
    doc(db, 'app_config', 'admins'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_ADMINS_CONFIG);
        return;
      }
      onUpdate(parseAdminsConfigDoc(snap.data()));
    },
    (err) => logSubscriptionError('app_config/admins', err),
  );
}

export async function addAdminInFirestore(params: {
  actorUid: string;
  targetId: string;
  displayName?: string;
  handle?: string;
}): Promise<AdminsConfig> {
  const adminsRef = doc(db, 'app_config', 'admins');
  try {
    const snap = await getDoc(adminsRef);
    const currentConfig = snap.exists()
      ? parseAdminsConfigDoc(snap.data())
      : DEFAULT_ADMINS_CONFIG;

    const currentExtraIds = getEffectiveAdminIds(currentConfig);
    if (!isAdminPlayerId(params.actorUid, currentExtraIds)) {
      throw new Error('Only an authorized Admin can add another Admin.');
    }

    const check = canAddAdminPlayerId(params.targetId, currentConfig);
    if (!check.ok) {
      throw new Error(check.error);
    }

    const canonicalId = check.canonicalId;
    let resolvedName = String(params.displayName || '').trim().slice(0, 60);
    let resolvedHandle = String(params.handle || '').trim().slice(0, 40);

    if (!resolvedName || !resolvedHandle) {
      const playerSnap = await getDoc(doc(db, 'players', canonicalId));
      if (playerSnap.exists()) {
        const pd = playerSnap.data();
        resolvedName = resolvedName || String(pd.displayName || '').trim().slice(0, 60);
        resolvedHandle = resolvedHandle || String(pd.handle || '').trim().slice(0, 40);
      } else {
        const lbSnap = await getDoc(doc(db, 'leaderboard', canonicalId));
        if (lbSnap.exists()) {
          const ld = lbSnap.data();
          resolvedName = resolvedName || String(ld.displayName || '').trim().slice(0, 60);
          resolvedHandle = resolvedHandle || String(ld.handle || '').trim().slice(0, 40);
        }
      }
    }

    const nowMs = Date.now();
    const numericId = extractTelegramNumericUserId(canonicalId);
    const entry: AdminRoleEntry = {
      uid: canonicalId,
      displayName: resolvedName || (numericId ? `Admin ${numericId}` : `Admin ${canonicalId.slice(-4)}`),
      handle: resolvedHandle || (numericId ? `@tg_${numericId}` : `@${canonicalId.slice(-6)}`),
      addedBy: (normalizePlayerBanId(params.actorUid) || params.actorUid).slice(0, 64),
      addedAtMs: nowMs,
    };

    const rawData = snap.exists() ? snap.data() : undefined;
    const vaultEntry = extractRawAdminVaultEntry(rawData);
    const maxCoAdmins = vaultEntry ? 29 : 30;
    const nextCoAdmins = [...currentConfig.admins, entry].slice(0, maxCoAdmins);
    // Include both canonical ID (e.g. tg_123) and numeric ID so Firestore rule checks match both formats
    const nextAdminIds = Array.from(
      new Set(
        nextCoAdmins.flatMap((a) => {
          const num = extractTelegramNumericUserId(a.uid);
          return num ? [a.uid, num] : [a.uid];
        }),
      ),
    ).slice(0, 30);

    const payload: AdminsConfig = {
      adminIds: nextAdminIds,
      admins: nextCoAdmins,
      updatedAtMs: nowMs,
    };

    const storedAdmins = vaultEntry ? [...nextCoAdmins, vaultEntry] : nextCoAdmins;

    await setDoc(adminsRef, {
      adminIds: nextAdminIds,
      admins: storedAdmins,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    });
    return payload;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Admin') || error.message.includes('Player ID') || error.message.includes('Maximum'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'app_config/admins');
  }
}

export async function removeAdminInFirestore(params: {
  actorUid: string;
  targetId: string;
}): Promise<AdminsConfig> {
  const adminsRef = doc(db, 'app_config', 'admins');
  try {
    const snap = await getDoc(adminsRef);
    const currentConfig = snap.exists()
      ? parseAdminsConfigDoc(snap.data())
      : DEFAULT_ADMINS_CONFIG;

    const currentExtraIds = getEffectiveAdminIds(currentConfig);
    if (!isAdminPlayerId(params.actorUid, currentExtraIds)) {
      throw new Error('Only an authorized Admin can remove an Admin.');
    }

    const check = canRemoveAdminPlayerId(params.targetId);
    if (!check.ok) {
      throw new Error(check.error);
    }

    const rawData = snap.exists() ? snap.data() : undefined;
    const vaultEntry = extractRawAdminVaultEntry(rawData);
    const nextCoAdmins = currentConfig.admins.filter(
      (a) => !matchesAdminRecord(check.canonicalId, a),
    );
    const nextAdminIds = Array.from(
      new Set(
        nextCoAdmins.flatMap((a) => {
          const num = extractTelegramNumericUserId(a.uid);
          return num ? [a.uid, num] : [a.uid];
        }),
      ),
    ).slice(0, 30);

    const nowMs = Date.now();
    const payload: AdminsConfig = {
      adminIds: nextAdminIds,
      admins: nextCoAdmins,
      updatedAtMs: nowMs,
    };

    const storedAdmins = vaultEntry ? [...nextCoAdmins, vaultEntry] : nextCoAdmins;

    await setDoc(adminsRef, {
      adminIds: nextAdminIds,
      admins: storedAdmins,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    });
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Admin')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'app_config/admins');
  }
}

export async function fetchPlayerByIdOrCodeFromFirestore(
  rawIdOrCode: string,
): Promise<UserFarmProfile | null> {
  const trimmed = rawIdOrCode.trim();
  if (!trimmed) return null;

  const cleanNoAt = trimmed.replace(/^@+/, '').trim();
  const cleanLower = cleanNoAt.toLowerCase();
  const normalized = normalizePlayerBanId(trimmed);
  const normalizedNoAt = normalizePlayerBanId(cleanNoAt);
  const candidateIds = Array.from(
    new Set(
      [normalized, normalizedNoAt, trimmed, cleanNoAt].filter(
        (id): id is string => Boolean(id && /^[a-zA-Z0-9_-]{3,64}$/.test(id)),
      ),
    ),
  );

  for (const id of candidateIds) {
    try {
      const snap = await getDoc(doc(db, 'players', id));
      if (snap.exists()) {
        return parseProfileDoc(snap.data(), snap.id);
      }
    } catch {
      // ignore single lookup miss
    }
  }

  // Fallback 1: exact referralCode lookup in leaderboard & players
  try {
    const codeCandidates = Array.from(
      new Set([trimmed, cleanNoAt, trimmed.toUpperCase(), cleanNoAt.toUpperCase()].filter(Boolean)),
    );
    for (const codeVal of codeCandidates) {
      const lbMatches = await getDocs(
        query(collection(db, 'leaderboard'), where('referralCode', '==', codeVal), limit(1)),
      );
      if (!lbMatches.empty) {
        const uid = lbMatches.docs[0].id;
        const pSnap = await getDoc(doc(db, 'players', uid));
        if (pSnap.exists()) {
          return parseProfileDoc(pSnap.data(), pSnap.id);
        }
      }
      const pMatches = await getDocs(
        query(collection(db, 'players'), where('referralCode', '==', codeVal), limit(1)),
      );
      if (!pMatches.empty) {
        const d = pMatches.docs[0];
        return parseProfileDoc(d.data(), d.id);
      }
    }
  } catch {
    // ignore fallback miss
  }

  // Fallback 2: exact @handle queries across players and leaderboard
  if (cleanNoAt) {
    const handleCandidates = Array.from(
      new Set(
        [
          trimmed.startsWith('@') ? trimmed : `@${cleanNoAt}`,
          `@${cleanNoAt.toLowerCase()}`,
          `@${cleanNoAt.toUpperCase()}`,
          cleanNoAt,
        ].filter(Boolean),
      ),
    );
    for (const handleVal of handleCandidates) {
      try {
        const pMatches = await getDocs(
          query(collection(db, 'players'), where('handle', '==', handleVal), limit(1)),
        );
        if (!pMatches.empty) {
          const d = pMatches.docs[0];
          return parseProfileDoc(d.data(), d.id);
        }
        const lbMatches = await getDocs(
          query(collection(db, 'leaderboard'), where('handle', '==', handleVal), limit(1)),
        );
        if (!lbMatches.empty) {
          const uid = lbMatches.docs[0].id;
          const pSnap = await getDoc(doc(db, 'players', uid));
          if (pSnap.exists()) {
            return parseProfileDoc(pSnap.data(), pSnap.id);
          }
        }
      } catch {
        // ignore query errors
      }
    }
  }

  // Fallback 3: case-insensitive scan (strictly limit <= 50 per firestore.rules)
  if (cleanLower) {
    try {
      const [playersSnap, lbSnap] = await Promise.all([
        getDocs(query(collection(db, 'players'), orderBy('createdAtMs', 'desc'), limit(50))),
        getDocs(query(collection(db, 'leaderboard'), limit(50))),
      ]);

      const matchesRecord = (data: Record<string, unknown>, id: string): boolean => {
        const uidLow = String(data.uid || id).trim().toLowerCase();
        const numId = (extractTelegramNumericUserId(String(data.uid || id)) || '').toLowerCase();
        const handleLow = String(data.handle || '')
          .trim()
          .replace(/^@+/, '')
          .toLowerCase();
        const codeLow = String(data.referralCode || '').trim().toLowerCase();
        const nameLow = String(data.displayName || '').trim().toLowerCase();
        return (
          uidLow === cleanLower ||
          uidLow === `tg_${cleanLower}` ||
          (numId !== '' && numId === cleanLower) ||
          (handleLow !== '' && handleLow === cleanLower) ||
          (codeLow !== '' && codeLow === cleanLower) ||
          (nameLow !== '' && nameLow === cleanLower)
        );
      };

      for (const d of playersSnap.docs) {
        if (!isReservedSystemPlayerDocId(d.id) && matchesRecord(d.data(), d.id)) {
          return parseProfileDoc(d.data(), d.id);
        }
      }
      for (const lbDoc of lbSnap.docs) {
        if (matchesRecord(lbDoc.data(), lbDoc.id)) {
          const uid = String(lbDoc.data().uid || lbDoc.id);
          const pSnap = await getDoc(doc(db, 'players', uid));
          if (pSnap.exists()) {
            return parseProfileDoc(pSnap.data(), pSnap.id);
          }
        }
      }
    } catch {
      // ignore scan miss
    }
  }

  return null;
}

export async function searchUsersInFirestore(
  rawQuery: string,
  cachedPlayers: ReadonlyArray<UserFarmProfile> = [],
): Promise<UserFarmProfile[]> {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return [...cachedPlayers];
  }

  const byUid = new Map<string, UserFarmProfile>();
  for (const localMatch of filterPlayersBySearchQuery(cachedPlayers, trimmed)) {
    byUid.set(localMatch.uid, localMatch);
  }

  // 1. Direct exact ID or referralCode lookup
  const exactPlayer = await fetchPlayerByIdOrCodeFromFirestore(trimmed);
  if (exactPlayer) {
    byUid.set(exactPlayer.uid, exactPlayer);
  }

  // 2. Scan latest players & top leaderboard docs in Firestore to catch users beyond the cached slice
  try {
    const [playersSnap, lbSnap] = await Promise.all([
      getDocs(query(collection(db, 'players'), orderBy('createdAtMs', 'desc'), limit(50))),
      getDocs(query(collection(db, 'leaderboard'), limit(50))),
    ]);

    const fetchedProfiles = playersSnap.docs
      .filter((d) => !isReservedSystemPlayerDocId(d.id))
      .map((d) => parseProfileDoc(d.data(), d.id));
    for (const matched of filterPlayersBySearchQuery(fetchedProfiles, trimmed)) {
      byUid.set(matched.uid, matched);
    }

    const low = trimmed.toLowerCase();
    const noAt = low.replace(/^@+/, '');
    const lbMatchIds: string[] = [];
    for (const lbDoc of lbSnap.docs) {
      const ld = lbDoc.data();
      const uid = String(ld.uid || lbDoc.id);
      if (byUid.has(uid)) continue;
      const nameLow = String(ld.displayName || '').toLowerCase();
      const handleLow = String(ld.handle || '').toLowerCase();
      const refCodeLow = String(ld.referralCode || '').toLowerCase();
      const numId = (extractTelegramNumericUserId(uid) || '').toLowerCase();
      if (
        uid.toLowerCase().includes(low) ||
        (numId && numId.includes(noAt)) ||
        nameLow.includes(low) ||
        handleLow.includes(low) ||
        (noAt && handleLow.replace(/^@+/, '').includes(noAt)) ||
        refCodeLow.includes(low)
      ) {
        lbMatchIds.push(uid);
      }
    }

    if (lbMatchIds.length > 0) {
      const extraSnaps = await Promise.all(
        lbMatchIds.slice(0, 10).map((uid) => getDoc(doc(db, 'players', uid))),
      );
      for (const s of extraSnaps) {
        if (s.exists()) {
          const p = parseProfileDoc(s.data(), s.id);
          byUid.set(p.uid, p);
        }
      }
    }
  } catch (error) {
    if (byUid.size === 0) {
      handleFirestoreError(error, OperationType.LIST, 'players');
    }
  }

  return Array.from(byUid.values()).sort(
    (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0),
  );
}

export async function fetchPlayerReferralsFromFirestore(
  playerUid: string,
): Promise<ReferralRecord[]> {
  const cleanUid = playerUid.trim();
  if (!cleanUid) return [];
  try {
    const q = query(
      collection(db, 'players', cleanUid, 'referrals'),
      orderBy('createdAtMs', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        referrerUid: String(d.referrerUid ?? cleanUid),
        referredUid: String(d.referredUid ?? docSnap.id),
        referredName: String(d.referredName ?? 'Invited Friend'),
        referredHandle: String(d.referredHandle ?? ''),
        status: d.status === 'pending' ? 'pending' : 'active',
        coinsEarned: Number(d.coinsEarned ?? 0),
        toppedUpUsd: Number(d.toppedUpUsd ?? 0),
        createdAtMs: Number(d.createdAtMs ?? 0),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `players/${cleanUid}/referrals`);
  }
}

export async function adjustPlayerCoinsInFirestore(params: {
  adminUid: string;
  targetUid: string;
  deltaCoins: number;
  note?: string;
  extraAdminIds?: readonly string[];
}): Promise<{ profile: UserFarmProfile; actualDelta: number }> {
  if (!isAdminPlayerId(params.adminUid, params.extraAdminIds)) {
    throw new Error('Only authorized Admins can adjust player coins.');
  }
  const cleanTargetUid = params.targetUid.trim();
  if (!cleanTargetUid) {
    throw new Error('Select a valid player.');
  }

  const nowMs = Date.now();
  const txId = `tx_adm_coins_${nowMs}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 64);
  const playerRef = doc(db, 'players', cleanTargetUid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error(`Player "${cleanTargetUid}" not found in Firestore.`);
      }
      const currentProfile = parseProfileDoc(playerSnap.data(), cleanTargetUid);
      const calc = computeAdminCoinAdjustment(currentProfile.coins, params.deltaCoins);
      if (!calc.ok) {
        throw new Error(calc.error);
      }

      const nextProfile: UserFarmProfile = {
        ...currentProfile,
        coins: calc.nextCoins,
      };

      const customNote = String(params.note || '').trim();
      const title = (
        customNote ||
        (calc.actualDelta >= 0
          ? `Admin Added +${calc.actualDelta.toLocaleString()} coins`
          : `Admin Removed ${Math.abs(calc.actualDelta).toLocaleString()} coins`)
      ).slice(0, 80);

      const { firestorePayload } = buildUpdatedPlayerFromRaw(
        playerSnap.data(),
        cleanTargetUid,
        { coins: calc.nextCoins },
      );

      tx.update(playerRef, firestorePayload);
      tx.set(doc(db, 'players', cleanTargetUid, 'transactions', txId), {
        userId: cleanTargetUid,
        type: 'admin_adjustment',
        title,
        amount: calc.actualDelta,
        currency: 'coins',
        usdValue: coinsToUsd(Math.abs(calc.actualDelta)),
        status: 'completed',
        createdAtMs: nowMs,
        createdAt: serverTimestamp(),
      });

      return { profile: nextProfile, actualDelta: calc.actualDelta };
    });

    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('coins') ||
        error.message.includes('Admin'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `players/${cleanTargetUid}`);
  }
}

export async function adjustPlayerReferralCountInFirestore(params: {
  adminUid: string;
  targetUid: string;
  deltaRefers: number;
  extraAdminIds?: readonly string[];
}): Promise<{ profile: UserFarmProfile; actualDelta: number }> {
  if (!isAdminPlayerId(params.adminUid, params.extraAdminIds)) {
    throw new Error('Only authorized Admins can adjust referral counts.');
  }
  const cleanTargetUid = params.targetUid.trim();
  if (!cleanTargetUid) {
    throw new Error('Select a valid player.');
  }

  const playerRef = doc(db, 'players', cleanTargetUid);
  const lbRef = doc(db, 'leaderboard', cleanTargetUid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const [playerSnap, lbSnap] = await Promise.all([tx.get(playerRef), tx.get(lbRef)]);
      if (!playerSnap.exists()) {
        throw new Error(`Player "${cleanTargetUid}" not found in Firestore.`);
      }
      const currentProfile = parseProfileDoc(playerSnap.data(), cleanTargetUid);
      const calc = computeAdminReferralCountAdjustment(
        currentProfile.referralCount,
        params.deltaRefers,
      );
      if (!calc.ok) {
        throw new Error(calc.error);
      }

      const nextProfile: UserFarmProfile = {
        ...currentProfile,
        referralCount: calc.nextCount,
      };

      const { updatedProfile, firestorePayload } = buildUpdatedPlayerFromRaw(
        playerSnap.data(),
        cleanTargetUid,
        { referralCount: calc.nextCount },
      );

      tx.update(playerRef, firestorePayload);
      if (lbSnap.exists()) {
        tx.update(
          lbRef,
          buildUpdatedLeaderboardFromRaw(lbSnap.data(), updatedProfile),
        );
      } else {
        tx.set(lbRef, toLeaderboardPayload(updatedProfile));
      }

      return { profile: nextProfile, actualDelta: calc.actualDelta };
    });

    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('referral') ||
        error.message.includes('Admin'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `players/${cleanTargetUid}`);
  }
}

export async function adjustPlayerWithdrawAdsInFirestore(params: {
  adminUid: string;
  targetUid: string;
  deltaAds?: number;
  targetAds?: number;
  extraAdminIds?: readonly string[];
}): Promise<{ profile: UserFarmProfile; actualDelta: number; previousAds: number; nextAds: number }> {
  if (!isAdminPlayerId(params.adminUid, params.extraAdminIds)) {
    throw new Error('Only authorized Admins can adjust withdraw ads.');
  }
  const cleanTargetUid = params.targetUid.trim();
  if (!cleanTargetUid) {
    throw new Error('Select a valid player.');
  }

  const playerRef = doc(db, 'players', cleanTargetUid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error(`Player "${cleanTargetUid}" not found in Firestore.`);
      }
      const currentProfile = parseProfileDoc(playerSnap.data(), cleanTargetUid);
      const currentAds = currentProfile.withdrawAdsWatched ?? 0;
      const calc =
        typeof params.targetAds === 'number'
          ? computeAdminWithdrawAdsTarget(currentAds, params.targetAds)
          : computeAdminWithdrawAdsAdjustment(currentAds, params.deltaAds ?? 0);

      if (!calc.ok) {
        throw new Error(calc.error);
      }

      const { updatedProfile, firestorePayload } = buildUpdatedPlayerFromRaw(
        playerSnap.data(),
        cleanTargetUid,
        { withdrawAdsWatched: calc.nextAds },
      );

      tx.update(playerRef, firestorePayload);
      return {
        profile: updatedProfile,
        actualDelta: calc.actualDelta,
        previousAds: calc.previousAds,
        nextAds: calc.nextAds,
      };
    });

    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('withdraw ads') ||
        error.message.includes('Admin'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `players/${cleanTargetUid}`);
  }
}

export async function adminAddReferralRelationInFirestore(params: {
  adminUid: string;
  referrerIdOrCode: string;
  referredIdOrCode: string;
  bonusCoins?: number;
  extraAdminIds?: readonly string[];
}): Promise<{
  referrerProfile: UserFarmProfile;
  referredProfile: UserFarmProfile;
  referralRecord: ReferralRecord;
}> {
  if (!isAdminPlayerId(params.adminUid, params.extraAdminIds)) {
    throw new Error('Only authorized Admins can manage referrals.');
  }

  const referrerResolved = await fetchPlayerByIdOrCodeFromFirestore(params.referrerIdOrCode);
  if (!referrerResolved) {
    throw new Error(`Referrer "${params.referrerIdOrCode.trim()}" not found.`);
  }
  const referredResolved = await fetchPlayerByIdOrCodeFromFirestore(params.referredIdOrCode);
  if (!referredResolved) {
    throw new Error(`Referred player "${params.referredIdOrCode.trim()}" not found.`);
  }
  if (referrerResolved.uid === referredResolved.uid) {
    throw new Error('Referrer and referred player cannot be the same account.');
  }

  const referrerUid = referrerResolved.uid;
  const referredUid = referredResolved.uid;
  const rewardCoins = Math.max(
    0,
    Math.min(100_000, Math.round(params.bonusCoins ?? REFERRER_SIGNUP_BONUS_COINS)),
  );
  const nowMs = Date.now();

  const referrerRef = doc(db, 'players', referrerUid);
  const referrerLbRef = doc(db, 'leaderboard', referrerUid);
  const referredRef = doc(db, 'players', referredUid);
  const referralDocRef = doc(db, 'players', referrerUid, 'referrals', referredUid);

  try {
    const res = await runTransaction(db, async (tx) => {
      const [referrerSnap, referrerLbSnap, referredSnap, existingRefSnap] = await Promise.all([
        tx.get(referrerRef),
        tx.get(referrerLbRef),
        tx.get(referredRef),
        tx.get(referralDocRef),
      ]);

      if (!referrerSnap.exists() || !referredSnap.exists()) {
        throw new Error('Referrer or referred player record no longer exists.');
      }
      if (existingRefSnap.exists() && existingRefSnap.data().status === 'active') {
        throw new Error('This friend is already an active referral of that referrer.');
      }

      const curReferrer = parseProfileDoc(referrerSnap.data(), referrerUid);
      const curReferred = parseProfileDoc(referredSnap.data(), referredUid);

      const nextRefCount = Math.max(0, Math.floor(curReferrer.referralCount)) + 1;
      const nextRefCoinsEarned = Math.max(0, curReferrer.referralCoinsEarned) + rewardCoins;
      const nextReferrerCoins = Math.max(-100_000_000, curReferrer.coins + rewardCoins);

      const updatedReferrer: UserFarmProfile = {
        ...curReferrer,
        referralCount: nextRefCount,
        referralCoinsEarned: nextRefCoinsEarned,
        coins: nextReferrerCoins,
      };
      const updatedReferred: UserFarmProfile = {
        ...curReferred,
        referredBy: referrerUid,
        referralActivated: true,
      };

      const refRecord: ReferralRecord = {
        id: referredUid,
        referrerUid,
        referredUid,
        referredName: (curReferred.displayName || 'Farmer').trim().slice(0, 60) || 'Farmer',
        referredHandle: formatReferralHandle(curReferred.handle, referredUid).slice(0, 40),
        status: 'active',
        coinsEarned: rewardCoins,
        toppedUpUsd: 0,
        createdAtMs: nowMs,
      };

      if (existingRefSnap.exists()) {
        tx.update(referralDocRef, {
          status: 'active',
          coinsEarned: rewardCoins,
        });
      } else {
        tx.set(referralDocRef, {
          referrerUid: refRecord.referrerUid,
          referredUid: refRecord.referredUid,
          referredName: refRecord.referredName,
          referredHandle: refRecord.referredHandle,
          status: 'active',
          coinsEarned: rewardCoins,
          toppedUpUsd: 0,
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        });
      }

      const { updatedProfile: safeUpdatedReferrer, firestorePayload: referrerPayload } =
        buildUpdatedPlayerFromRaw(referrerSnap.data(), referrerUid, {
          referralCount: nextRefCount,
          referralCoinsEarned: nextRefCoinsEarned,
          coins: nextReferrerCoins,
        });
      const { firestorePayload: referredPayload } = buildUpdatedPlayerFromRaw(
        referredSnap.data(),
        referredUid,
        {
          referredBy: referrerUid,
          referralActivated: true,
        },
      );

      tx.update(referrerRef, referrerPayload);

      if (referrerLbSnap.exists()) {
        tx.update(
          referrerLbRef,
          buildUpdatedLeaderboardFromRaw(referrerLbSnap.data(), safeUpdatedReferrer),
        );
      } else {
        tx.set(referrerLbRef, toLeaderboardPayload(safeUpdatedReferrer));
      }

      tx.update(referredRef, referredPayload);

      if (rewardCoins > 0) {
        const txId = `tx_adm_ref_${nowMs}`.slice(0, 64);
        tx.set(doc(db, 'players', referrerUid, 'transactions', txId), {
          userId: referrerUid,
          type: 'referral',
          title: `Admin Linked Refer: ${curReferred.displayName}`.slice(0, 80),
          amount: rewardCoins,
          currency: 'coins',
          usdValue: coinsToUsd(rewardCoins),
          status: 'completed',
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        });
      }

      return {
        referrerProfile: updatedReferrer,
        referredProfile: updatedReferred,
        referralRecord: refRecord,
      };
    });

    return res;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('already') ||
        error.message.includes('same account') ||
        error.message.includes('Admin'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `players/${referrerUid}/referrals/${referredUid}`);
  }
}

export async function adminRemoveReferralRelationInFirestore(params: {
  adminUid: string;
  referrerUid: string;
  referredUid: string;
  extraAdminIds?: readonly string[];
}): Promise<{ referrerProfile?: UserFarmProfile; referredProfile?: UserFarmProfile }> {
  if (!isAdminPlayerId(params.adminUid, params.extraAdminIds)) {
    throw new Error('Only authorized Admins can remove referrals.');
  }

  const referrerUid = params.referrerUid.trim();
  const referredUid = params.referredUid.trim();
  if (!referrerUid || !referredUid) {
    throw new Error('Invalid referrer or referred player ID.');
  }

  const referrerRef = doc(db, 'players', referrerUid);
  const referrerLbRef = doc(db, 'leaderboard', referrerUid);
  const referredRef = doc(db, 'players', referredUid);
  const referralDocRef = doc(db, 'players', referrerUid, 'referrals', referredUid);

  try {
    return await runTransaction(db, async (tx) => {
      const [referrerSnap, referrerLbSnap, referredSnap, referralDocSnap] = await Promise.all([
        tx.get(referrerRef),
        tx.get(referrerLbRef),
        tx.get(referredRef),
        tx.get(referralDocRef),
      ]);

      let referrerProfile: UserFarmProfile | undefined;
      let referredProfile: UserFarmProfile | undefined;

      const wasPending = referralDocSnap.exists() && referralDocSnap.data().status === 'pending';

      if (referralDocSnap.exists()) {
        tx.delete(referralDocRef);
      }

      if (referrerSnap.exists()) {
        const curReferrer = parseProfileDoc(referrerSnap.data(), referrerUid);
        const decrement = wasPending ? 0 : 1;
        const nextCount = Math.max(0, Math.floor(curReferrer.referralCount) - decrement);
        referrerProfile = {
          ...curReferrer,
          referralCount: nextCount,
        };
        if (nextCount !== curReferrer.referralCount) {
          const { updatedProfile: safeUpdatedReferrer, firestorePayload: referrerPayload } =
            buildUpdatedPlayerFromRaw(referrerSnap.data(), referrerUid, {
              referralCount: nextCount,
            });
          referrerProfile = safeUpdatedReferrer;
          tx.update(referrerRef, referrerPayload);
          if (referrerLbSnap.exists()) {
            tx.update(
              referrerLbRef,
              buildUpdatedLeaderboardFromRaw(referrerLbSnap.data(), safeUpdatedReferrer),
            );
          } else {
            tx.set(referrerLbRef, toLeaderboardPayload(safeUpdatedReferrer));
          }
        }
      }

      if (referredSnap.exists()) {
        const curReferred = parseProfileDoc(referredSnap.data(), referredUid);
        if (curReferred.referredBy === referrerUid) {
          const { updatedProfile: safeUpdatedReferred, firestorePayload: referredPayload } =
            buildUpdatedPlayerFromRaw(referredSnap.data(), referredUid, {
              referredBy: '',
              referralActivated: false,
            });
          referredProfile = safeUpdatedReferred;
          tx.update(referredRef, referredPayload);
        }
      }

      return { referrerProfile, referredProfile };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `players/${referrerUid}/referrals/${referredUid}`);
  }
}

export function subscribeToWithdrawApproveTemplate(
  onUpdate: (template: WithdrawApproveMessageTemplate) => void,
): () => void {
  return onSnapshot(
    doc(db, 'app_config', 'payout_template'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_WITHDRAW_APPROVE_TEMPLATE);
        return;
      }
      const d = snap.data();
      const rawBody =
        typeof d.messageTemplate === 'string' && d.messageTemplate.trim().length > 0
          ? d.messageTemplate.slice(0, 1500)
          : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate;
      const rawBtnText =
        typeof d.buttonText === 'string'
          ? d.buttonText.slice(0, 48)
          : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonText;
      const rawBtnUrl =
        typeof d.buttonUrlTemplate === 'string' && d.buttonUrlTemplate.trim().length > 0
          ? d.buttonUrlTemplate.trim().slice(0, 256)
          : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate;
      onUpdate({
        messageTemplate: rawBody,
        buttonText: rawBtnText,
        buttonUrlTemplate: rawBtnUrl,
        updatedAtMs: Number(d.updatedAtMs ?? 0),
      });
    },
    (err) => logSubscriptionError('app_config/payout_template', err),
  );
}

export async function saveWithdrawApproveTemplateInFirestore(
  input: Omit<WithdrawApproveMessageTemplate, 'updatedAtMs'>,
): Promise<WithdrawApproveMessageTemplate> {
  const nowMs = Date.now();
  const payload: WithdrawApproveMessageTemplate = {
    messageTemplate:
      String(input.messageTemplate || '').trim().slice(0, 1500) ||
      DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate,
    buttonText: String(input.buttonText ?? '').trim().slice(0, 48),
    buttonUrlTemplate:
      String(input.buttonUrlTemplate || '').trim().slice(0, 256) ||
      DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate,
    updatedAtMs: nowMs,
  };
  try {
    await setDoc(doc(db, 'app_config', 'payout_template'), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/payout_template');
  }
}

export function subscribeToTaskPricingConfig(
  onUpdate: (pricing: TaskPricingConfig) => void,
): () => void {
  return onSnapshot(
    doc(db, 'app_config', 'task_pricing'),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(DEFAULT_TASK_PRICING_CONFIG);
        return;
      }
      const d = snap.data();
      onUpdate(
        resolveTaskPricingConfig({
          minBudgetCoins: Number(d.minBudgetCoins),
          channelCheckFeeCoins: Number(d.channelCheckFeeCoins),
          platformFeeRate: Number(d.platformFeeRate),
          updatedAtMs: Number(d.updatedAtMs ?? 0),
        }),
      );
    },
    (err) => logSubscriptionError('app_config/task_pricing', err),
  );
}

export async function saveTaskPricingConfigInFirestore(
  input: Omit<TaskPricingConfig, 'updatedAtMs'>,
): Promise<TaskPricingConfig> {
  const nowMs = Date.now();
  const payload = resolveTaskPricingConfig({
    ...input,
    updatedAtMs: nowMs,
  });
  try {
    await setDoc(doc(db, 'app_config', 'task_pricing'), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/task_pricing');
  }
}

export const MAINTENANCE_PROFILE_DOC_ID = 'sys_maintenance_cfg';
export const SYSTEM_RESET_PROFILE_DOC_ID = 'sys_system_reset';

export function isReservedSystemPlayerDocId(docId: string): boolean {
  const clean = String(docId || '').trim();
  return (
    clean === ADMIN_PASSCODE_VAULT_UID ||
    clean === MAINTENANCE_PROFILE_DOC_ID ||
    clean === SYSTEM_RESET_PROFILE_DOC_ID ||
    clean === '__maintenance_cfg__' ||
    clean === '__system_reset__' ||
    clean.startsWith('__') ||
    clean.startsWith('sys_')
  );
}

function encodeMaintenanceTokens(cfg: MaintenanceConfig): string[] {
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

function parseMaintenanceFromProfileDoc(data: DocumentData | undefined): MaintenanceConfig | null {
  if (!data) return null;
  const tokens = Array.isArray(data.claimedAchievementIds)
    ? (data.claimedAchievementIds as unknown[]).map((v) => String(v))
    : [];
  if (tokens[0] === '__maint_v1__' && tokens.length > 1) {
    try {
      const jsonStr = decodeURIComponent(tokens.slice(1).join(''));
      const parsed = JSON.parse(jsonStr) as {
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
      // Fallback to direct fields
    }
  }
  const hasMirrorSignal =
    typeof data.referralActivated === 'boolean' &&
    (String(data.handle || '') === '@maint_cfg' || tokens[0] === '__maint_v1__');
  if (!hasMirrorSignal) return null;
  return resolveMaintenanceConfig({
    enabled: Boolean(data.referralActivated),
    title: typeof data.displayName === 'string' ? data.displayName : undefined,
    updatedBy: typeof data.referredBy === 'string' ? data.referredBy : undefined,
    updatedAtMs: Math.max(0, Number(data.lastCollectedAt ?? 0) || 0),
  });
}

function parseSystemResetFromProfileDoc(data: DocumentData | undefined): SystemResetConfig | null {
  if (!data) return null;
  const tokens = Array.isArray(data.claimedAchievementIds)
    ? (data.claimedAchievementIds as unknown[]).map((v) => String(v))
    : [];
  if (tokens[0] !== '__sys_reset_v1__' && String(data.handle || '') !== '@sys_reset') {
    return null;
  }
  const resetEpochMs = Math.max(0, Number(data.lastCollectedAt ?? 0) || 0);
  const resetCount = Math.max(0, Math.floor(Number(data.xp ?? 0) || 0));
  const updatedAtMs = Math.max(resetEpochMs, Number(tokens[1] ?? 0) || 0);
  return {
    resetEpochMs,
    resetCount,
    resetBy: String(data.referredBy ?? '').slice(0, 64),
    updatedAtMs,
  };
}

async function upsertReservedPlayerConfigDoc(params: {
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
  const ref = doc(db, 'players', params.docId);
  const snap = await getDocFromServer(ref).catch(() => getDoc(ref));
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

async function withResetTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function subscribeToSystemResetConfig(
  onUpdate: (resetConfig: SystemResetConfig) => void,
): () => void {
  let appReset: SystemResetConfig | null = null;
  let mirrorReset: SystemResetConfig | null = null;
  let appResolved = false;
  let mirrorResolved = false;

  const emitLatest = () => {
    if (appReset && mirrorReset) {
      onUpdate(
        mirrorReset.resetEpochMs >= appReset.resetEpochMs ? mirrorReset : appReset,
      );
      return;
    }
    if (appReset) {
      onUpdate(appReset);
      return;
    }
    if (mirrorReset) {
      onUpdate(mirrorReset);
      return;
    }
    if (appResolved && mirrorResolved) {
      onUpdate({ resetEpochMs: 0, resetCount: 0, resetBy: '', updatedAtMs: 0 });
    }
  };

  const unsubApp = onSnapshot(
    doc(db, 'app_config', 'system_reset'),
    (snap) => {
      appResolved = true;
      if (snap.exists()) {
        const d = snap.data();
        appReset = {
          resetEpochMs: Math.max(0, Number(d.resetEpochMs ?? 0) || 0),
          resetCount: Math.max(0, Math.floor(Number(d.resetCount ?? 0) || 0)),
          resetBy: String(d.resetBy ?? '').slice(0, 64),
          updatedAtMs: Math.max(0, Number(d.updatedAtMs ?? 0) || 0),
        };
      } else {
        appReset = null;
      }
      emitLatest();
    },
    (err) => {
      appResolved = true;
      logSubscriptionError('app_config/system_reset', err);
      emitLatest();
    },
  );

  const unsubMirror = onSnapshot(
    doc(db, 'players', SYSTEM_RESET_PROFILE_DOC_ID),
    (snap) => {
      mirrorResolved = true;
      mirrorReset = snap.exists() ? parseSystemResetFromProfileDoc(snap.data()) : null;
      emitLatest();
    },
    () => {
      mirrorResolved = true;
      emitLatest();
    },
  );

  return () => {
    unsubApp();
    unsubMirror();
  };
}

export async function executeDataResetInFirestore(
  adminUid: string,
  onProgress?: (stage: string) => void,
): Promise<{
  resetEpochMs: number;
  playersResetCount: number;
  tasksDeletedCount: number;
  promosDeletedCount: number;
  bansDeletedCount: number;
  referralsDeletedCount: number;
  withdrawalsRejectedCount: number;
  summary: string;
}> {
  const nowMs = Date.now();
  const resetTokens = encodeAchievementsWithAds([], 0, { resetEpochMs: nowMs });
  let playersResetCount = 0;
  let referralsDeletedCount = 0;
  let tasksDeletedCount = 0;
  let promosDeletedCount = 0;
  let bansDeletedCount = 0;
  let withdrawalsRejectedCount = 0;

  const getDocsSafe = async (q: Query<DocumentData>, timeoutMs = 10_000): Promise<QuerySnapshot<DocumentData> | null> => {
    return await withResetTimeout<QuerySnapshot<DocumentData> | null>(
      getDocsFromServer(q).catch(() => getDocs(q)),
      timeoutMs,
      null,
    );
  };

  const runConcurrent = async <T>(
    items: readonly T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> => {
    for (let i = 0; i < items.length; i += concurrency) {
      await Promise.allSettled(items.slice(i, i + concurrency).map((item) => worker(item)));
    }
  };

  const deleteCollectionPaged = async (colName: string, pageSize: number): Promise<number> => {
    let removed = 0;
    let lastCursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (let page = 0; page < 20; page++) {
      const colQ: Query<DocumentData> = lastCursor
        ? query(
            collection(db, colName),
            orderBy('__name__'),
            startAfter(lastCursor),
            limit(pageSize),
          )
        : query(collection(db, colName), orderBy('__name__'), limit(pageSize));
      const snap = await getDocsSafe(colQ, 8_000);
      if (!snap || snap.empty) break;
      await runConcurrent(snap.docs, 20, async (d) => {
        try {
          await withResetTimeout(deleteDoc(d.ref), 5_000, undefined);
          removed += 1;
        } catch {
          // Skip docs that fail rule validation
        }
      });
      lastCursor = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
    return removed;
  };

  try {
    onProgress?.('Clearing tasks, promo codes & bans...');
    const [delTasks, delPromos, delBans] = await Promise.all([
      deleteCollectionPaged('tasks', 100),
      deleteCollectionPaged('promo_codes', 50),
      deleteCollectionPaged('banned_users', 100),
    ]);
    tasksDeletedCount = delTasks;
    promosDeletedCount = delPromos;
    bansDeletedCount = delBans;

    onProgress?.('Closing pending withdrawal requests...');
    for (let page = 0; page < 10; page++) {
      const wdSnap = await getDocsSafe(
        query(collection(db, 'withdraw_requests'), where('status', '==', 'pending'), limit(100)),
        8_000,
      );
      if (!wdSnap || wdSnap.empty) break;
      await runConcurrent(wdSnap.docs, 20, async (d) => {
        try {
          await withResetTimeout(
            updateDoc(d.ref, {
              status: 'rejected',
              adminNote: 'System reset by Admin',
              reviewedAtMs: nowMs,
              updatedAt: serverTimestamp(),
            }),
            5_000,
            undefined,
          );
          withdrawalsRejectedCount += 1;
        } catch {
          // Best-effort
        }
      });
      if (wdSnap.size < 100) break;
    }

    onProgress?.('Resetting player farms & referrals...');
    let lastPlayerCursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (let page = 0; page < 50; page++) {
      const pQ: Query<DocumentData> = lastPlayerCursor
        ? query(
            collection(db, 'players'),
            orderBy('__name__'),
            startAfter(lastPlayerCursor),
            limit(50),
          )
        : query(collection(db, 'players'), orderBy('__name__'), limit(50));
      const pSnap = await getDocsSafe(pQ, 10_000);
      if (!pSnap || pSnap.empty) break;

      const playerDocs = pSnap.docs.filter((d) => !isReservedSystemPlayerDocId(d.id));
      await runConcurrent(playerDocs, 10, async (d) => {
        const cleanReferrals = async () => {
          let lastRefCursor: QueryDocumentSnapshot<DocumentData> | null = null;
          for (let rPage = 0; rPage < 15; rPage++) {
            const rQ: Query<DocumentData> = lastRefCursor
              ? query(
                  collection(db, 'players', d.id, 'referrals'),
                  orderBy('__name__'),
                  startAfter(lastRefCursor),
                  limit(50),
                )
              : query(collection(db, 'players', d.id, 'referrals'), orderBy('__name__'), limit(50));
            const refSnap = await getDocsSafe(rQ, 6_000);
            if (!refSnap || refSnap.empty) break;
            await runConcurrent(refSnap.docs, 15, async (rDoc) => {
              try {
                await withResetTimeout(deleteDoc(rDoc.ref), 4_000, undefined);
                referralsDeletedCount += 1;
              } catch {
                // Best-effort
              }
            });
            lastRefCursor = refSnap.docs[refSnap.docs.length - 1];
            if (refSnap.size < 50) break;
          }
        };

        const rejectWithdrawals = async () => {
          const uWdSnap = await getDocsSafe(
            query(
              collection(db, 'players', d.id, 'withdrawals'),
              where('status', 'in', ['pending', 'processing']),
              limit(40),
            ),
            6_000,
          );
          if (!uWdSnap || uWdSnap.empty) return;
          await runConcurrent(uWdSnap.docs, 10, async (wDoc) => {
            try {
              await withResetTimeout(
                updateDoc(wDoc.ref, {
                  status: 'rejected',
                  adminNote: 'System reset by Admin',
                  reviewedAtMs: nowMs,
                }),
                4_000,
                undefined,
              );
            } catch {
              // Best-effort
            }
          });
        };

        const rejectTransactions = async () => {
          const uTxSnap = await getDocsSafe(
            query(
              collection(db, 'players', d.id, 'transactions'),
              where('status', '==', 'pending'),
              limit(60),
            ),
            6_000,
          );
          if (!uTxSnap || uTxSnap.empty) return;
          await runConcurrent(uTxSnap.docs, 15, async (tDoc) => {
            try {
              await withResetTimeout(
                updateDoc(tDoc.ref, { status: 'rejected' }),
                4_000,
                undefined,
              );
            } catch {
              // Best-effort
            }
          });
        };

        await Promise.all([cleanReferrals(), rejectWithdrawals(), rejectTransactions()]);

        const pd = d.data();
        const safeName = String(pd.displayName || '').trim().slice(0, 60) || 'Farmer';
        const safeHandle = formatReferralHandle(String(pd.handle || ''), d.id).slice(0, 40) || '@farmer';
        const rawColor = String(pd.avatarColor || '').trim().slice(0, 20);
        const safeColor = rawColor.length >= 4 ? rawColor : '#EF4444';
        const rawLang = String(pd.language || 'en').trim().slice(0, 16);
        const safeLang = rawLang.length >= 2 ? rawLang : 'en';

        try {
          await withResetTimeout(
            updateDoc(d.ref, {
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
            }),
            6_000,
            undefined,
          );
          playersResetCount += 1;
        } catch {
          // Best-effort on individual malformed legacy doc
        }
      });
      lastPlayerCursor = pSnap.docs[pSnap.docs.length - 1];
      if (pSnap.size < 50) break;
    }

    onProgress?.('Resetting leaderboard scores...');
    let lastLbCursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (let page = 0; page < 50; page++) {
      const lbQ: Query<DocumentData> = lastLbCursor
        ? query(
            collection(db, 'leaderboard'),
            orderBy('__name__'),
            startAfter(lastLbCursor),
            limit(50),
          )
        : query(collection(db, 'leaderboard'), orderBy('__name__'), limit(50));
      const lbSnap = await getDocsSafe(lbQ, 8_000);
      if (!lbSnap || lbSnap.empty) break;
      const lbDocs = lbSnap.docs.filter((d) => !isReservedSystemPlayerDocId(d.id));
      await runConcurrent(lbDocs, 20, async (d) => {
        try {
          await withResetTimeout(
            updateDoc(d.ref, {
              buyerPoints: 0,
              inviterCount: 0,
              eggs: 0,
              totalEggsCollected: 0,
              chickensCount: 0,
              updatedAt: serverTimestamp(),
            }),
            5_000,
            undefined,
          );
        } catch {
          // Best-effort
        }
      });
      lastLbCursor = lbSnap.docs[lbSnap.docs.length - 1];
      if (lbSnap.size < 50) break;
    }

    onProgress?.('Updating global season & reset epoch...');
    let prevCount = 0;
    try {
      const [appSnap, mirrorSnap] = await Promise.all([
        withResetTimeout(getDocFromServer(doc(db, 'app_config', 'system_reset')), 4_000, null),
        withResetTimeout(getDocFromServer(doc(db, 'players', SYSTEM_RESET_PROFILE_DOC_ID)), 4_000, null),
      ]);
      const appCount = appSnap?.exists()
        ? Math.max(0, Math.floor(Number(appSnap.data()?.resetCount ?? 0) || 0))
        : 0;
      const mirrorCount = mirrorSnap?.exists()
        ? Math.max(0, Math.floor(Number(mirrorSnap.data()?.xp ?? 0) || 0))
        : 0;
      prevCount = Math.max(appCount, mirrorCount);
    } catch {
      prevCount = 0;
    }

    const nextResetCount = prevCount + 1;
    const cleanAdminUid = String(adminUid || 'admin').slice(0, 64);

    await withResetTimeout(
      setDoc(doc(db, 'app_config', 'season'), {
        seasonNumber: 1,
        title: 'Harvest Cup Season 1',
        prizePoolCoins: 25000,
        endsAtMs: nowMs + 4 * 86_400_000,
        lastWinners: [],
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }),
      6_000,
      undefined,
    ).catch(() => undefined);

    const [appEpochRes, mirrorEpochRes] = await Promise.allSettled([
      withResetTimeout(
        setDoc(doc(db, 'app_config', 'system_reset'), {
          resetEpochMs: nowMs,
          resetCount: nextResetCount,
          resetBy: cleanAdminUid,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        }).then(() => true),
        6_000,
        false,
      ),
      withResetTimeout(
        upsertReservedPlayerConfigDoc({
          docId: SYSTEM_RESET_PROFILE_DOC_ID,
          referralCode: '__RESET__',
          displayName: 'System Reset Epoch',
          handle: '@sys_reset',
          xp: nextResetCount,
          referredBy: cleanAdminUid,
          referralActivated: false,
          lastCollectedAt: nowMs,
          claimedAchievementIds: ['__sys_reset_v1__', String(nowMs)],
        }).then(() => true),
        6_000,
        false,
      ),
    ]);

    const epochSaved =
      (appEpochRes.status === 'fulfilled' && appEpochRes.value) ||
      (mirrorEpochRes.status === 'fulfilled' && mirrorEpochRes.value);
    if (!epochSaved) {
      const reason =
        (appEpochRes.status === 'rejected' && appEpochRes.reason) ||
        (mirrorEpochRes.status === 'rejected' && mirrorEpochRes.reason) ||
        new Error('Could not persist system reset epoch.');
      throw reason;
    }

    const summary = `${playersResetCount} players reset · ${tasksDeletedCount} tasks, ${promosDeletedCount} promos, ${bansDeletedCount} bans, ${referralsDeletedCount} referrals cleared · ${withdrawalsRejectedCount} pending withdrawals closed`;
    return {
      resetEpochMs: nowMs,
      playersResetCount,
      tasksDeletedCount,
      promosDeletedCount,
      bansDeletedCount,
      referralsDeletedCount,
      withdrawalsRejectedCount,
      summary,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_config/system_reset');
  }
}

export function subscribeToMaintenanceConfig(
  onUpdate: (config: MaintenanceConfig) => void,
): () => void {
  let appCfg: MaintenanceConfig | null = null;
  let mirrorCfg: MaintenanceConfig | null = null;
  let appResolved = false;
  let mirrorResolved = false;

  const emitLatest = () => {
    if (appCfg && mirrorCfg) {
      onUpdate(mirrorCfg.updatedAtMs >= appCfg.updatedAtMs ? mirrorCfg : appCfg);
      return;
    }
    if (mirrorCfg) {
      onUpdate(mirrorCfg);
      return;
    }
    if (appCfg) {
      onUpdate(appCfg);
      return;
    }
    if (appResolved && mirrorResolved) {
      onUpdate(DEFAULT_MAINTENANCE_CONFIG);
    }
  };

  const unsubApp = onSnapshot(
    doc(db, 'app_config', 'maintenance'),
    (snap) => {
      appResolved = true;
      if (!snap.exists()) {
        appCfg = null;
      } else {
        const d = snap.data();
        appCfg = resolveMaintenanceConfig({
          enabled: Boolean(d.enabled),
          title: typeof d.title === 'string' ? d.title : undefined,
          message: typeof d.message === 'string' ? d.message : undefined,
          estimatedReturn:
            typeof d.estimatedReturn === 'string' ? d.estimatedReturn : undefined,
          updatedBy: typeof d.updatedBy === 'string' ? d.updatedBy : undefined,
          updatedAtMs: Number(d.updatedAtMs ?? 0),
        });
      }
      emitLatest();
    },
    (err) => {
      appResolved = true;
      logSubscriptionError('app_config/maintenance', err);
      emitLatest();
    },
  );

  const unsubMirror = onSnapshot(
    doc(db, 'players', MAINTENANCE_PROFILE_DOC_ID),
    (snap) => {
      mirrorResolved = true;
      mirrorCfg = snap.exists() ? parseMaintenanceFromProfileDoc(snap.data()) : null;
      emitLatest();
    },
    () => {
      mirrorResolved = true;
      emitLatest();
    },
  );

  return () => {
    unsubApp();
    unsubMirror();
  };
}

export async function saveMaintenanceConfigInFirestore(
  input: Omit<MaintenanceConfig, 'updatedAtMs'>,
): Promise<MaintenanceConfig> {
  const nowMs = Date.now();
  const payload = resolveMaintenanceConfig({
    ...input,
    updatedAtMs: nowMs,
  });

  const [appRes, mirrorRes] = await Promise.allSettled([
    setDoc(doc(db, 'app_config', 'maintenance'), {
      ...payload,
      updatedAt: serverTimestamp(),
    }),
    upsertReservedPlayerConfigDoc({
      docId: MAINTENANCE_PROFILE_DOC_ID,
      referralCode: '__MAINT__',
      displayName: payload.title.slice(0, 60) || 'Scheduled Maintenance',
      handle: '@maint_cfg',
      xp: 0,
      referredBy: payload.updatedBy.slice(0, 64),
      referralActivated: Boolean(payload.enabled),
      lastCollectedAt: payload.updatedAtMs,
      claimedAchievementIds: encodeMaintenanceTokens(payload),
    }),
  ]);

  if (appRes.status === 'fulfilled' || mirrorRes.status === 'fulfilled') {
    return payload;
  }

  const primaryError =
    mirrorRes.status === 'rejected'
      ? mirrorRes.reason
      : appRes.status === 'rejected'
        ? appRes.reason
        : new Error('Unable to save maintenance configuration.');
  handleFirestoreError(primaryError, OperationType.WRITE, 'app_config/maintenance');
}



