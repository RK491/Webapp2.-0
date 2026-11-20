import type {
  AdConfig,
  AdGateActionType,
  AdNetworkId,
  AdminRoleEntry,
  AdminsConfig,
  AutoHarvestCurrency,
  AutoHarvestDurationId,
  BannedUserRecord,
  ChannelsConfig,
  ChickenBreedId,
  ChickenPack,
  DepositNetwork,
  DepositOrder,
  DynamicPromoCode,
  LeaderboardEntry,
  MaintenanceConfig,
  PromoRewardType,
  ReferralRecord,
  RequiredTelegramChannel,
  SeasonConfig,
  TaskCategory,
  TaskDefinition,
  TaskPricingConfig,
  TaskSortOption,
  TransactionEntry,
  UserFarmProfile,
  WithdrawApproveMessageTemplate,
  WithdrawalOrder,
  WithdrawalStatus,
} from '../types/farm';

export type { RequiredTelegramChannel };

export const USD_PER_EGG = 0.00000694;
export const GRAM_USD_PRICE = 1.133;
export const COINS_PER_USD = 10000;
export const COINS_PER_GRAM = Math.round(GRAM_USD_PRICE * COINS_PER_USD);
export const MIN_DEPOSIT_COINS = 1000;
export const MAX_DEPOSIT_COINS = 15000;
export const MIN_WITHDRAW_EGGS = 100;
export const MIN_WITHDRAW_ADS_WATCHED = 30;
export const WITHDRAW_ADS_DEDUCTION_RATE = 0.5;
export const WITHDRAW_ADS_CRITERIA_DEDUCT_COUNT = Math.round(
  MIN_WITHDRAW_ADS_WATCHED * WITHDRAW_ADS_DEDUCTION_RATE,
);
export const MIN_REINVEST_EGGS = 500;
export const REINVEST_BONUS_RATE = 0.05;
export const CHANNEL_LEAVE_PENALTY_MULTIPLIER = 5;
export const SIGNUP_BONUS_COINS = 1000;
export const REFERRER_SIGNUP_BONUS_COINS = 150;
export const REFERRER_SIGNUP_BONUS_EGGS = 500;
export const REFERRAL_DEPOSIT_COMMISSION_RATE = 0.05;
export const REFERRER_LIFETIME_EGG_COMMISSION_RATE = 0.05;
export const REFERRED_WELCOME_BONUS_COINS = 100;

export function getTodayDateString(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function calculateReferralEggCommission(collectedEggs: number): number {
  const safe = Math.max(0, Math.floor(collectedEggs));
  if (safe <= 0) return 0;
  return Math.max(1, Math.round(safe * REFERRER_LIFETIME_EGG_COMMISSION_RATE));
}

export function calculateReferralBonusEggs(coinsEarned: number): number {
  return Math.max(0, Math.round(Math.max(0, coinsEarned) * 2.5));
}

export function summarizeReferrals(referrals: ReferralRecord[]): {
  activeCount: number;
  pendingCount: number;
  totalBonusEggs: number;
  totalToppedUp: number;
} {
  let activeCount = 0;
  let pendingCount = 0;
  let totalBonusEggs = 0;
  let totalToppedUp = 0;

  for (const r of referrals) {
    if (r.status === 'pending') {
      pendingCount += 1;
    } else {
      activeCount += 1;
      totalBonusEggs += calculateReferralBonusEggs(r.coinsEarned || 0);
    }
    totalToppedUp += r.toppedUpUsd || 0;
  }

  return {
    activeCount,
    pendingCount,
    totalBonusEggs,
    totalToppedUp,
  };
}

export interface InvitedFriendSummary extends ReferralRecord {
  formattedHandle: string;
  eggsGenerated: number;
}

export function formatReferralHandle(handle: string, fallbackUid = ''): string {
  const trimmed = (handle || '').trim();
  if (trimmed) {
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  }
  const suffix = fallbackUid.replace(/[^a-zA-Z0-9_-]/g, '').slice(-6).toLowerCase() || 'farmer';
  return `@${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleContainsHandle(title: string, handle: string): boolean {
  if (!handle || handle === '@') return false;
  const pattern = new RegExp(`(^|[\\s(])${escapeRegExp(handle.toLowerCase())}([\\s):,]|$)`);
  return pattern.test(title.toLowerCase());
}

export function buildInvitedFriendsList(
  referrals: ReferralRecord[],
  transactions: TransactionEntry[] = [],
): InvitedFriendSummary[] {
  const eggsByReferralKey = new Map<string, number>();

  for (const r of referrals) {
    eggsByReferralKey.set(r.id, Math.max(0, Math.floor(r.eggsEarned ?? 0)));
  }

  for (const tx of transactions) {
    if (tx.type !== 'referral' || tx.currency !== 'eggs' || tx.amount <= 0) {
      continue;
    }
    const title = (tx.title || '').trim();
    if (!title) continue;

    // 1. Match by explicit handle token (new format: "5% eggs · @handle (Display Name)")
    let matched = referrals.find((r) => {
      const h = formatReferralHandle(r.referredHandle, r.referredUid);
      return titleContainsHandle(title, h);
    });

    // 2. Backwards-compatible fallback for legacy titles ("5% lifetime eggs from Display Name")
    if (!matched) {
      const legacyMatch = title.match(/^5%\s+lifetime\s+eggs\s+from\s+(.+)$/i);
      const extractedName = legacyMatch?.[1]?.trim().toLowerCase() ?? '';
      if (extractedName) {
        matched =
          referrals.find(
            (r) =>
              r.status === 'active' &&
              r.referredName.trim().toLowerCase().slice(0, 56) === extractedName,
          ) ||
          referrals.find(
            (r) => r.referredName.trim().toLowerCase().slice(0, 56) === extractedName,
          );
      }
    }

    if (matched) {
      const prev = eggsByReferralKey.get(matched.id) ?? 0;
      eggsByReferralKey.set(matched.id, prev + Math.floor(tx.amount));
    }
  }

  return [...referrals]
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .map((friend) => ({
      ...friend,
      formattedHandle: formatReferralHandle(friend.referredHandle, friend.referredUid),
      eggsGenerated: eggsByReferralKey.get(friend.id) ?? 0,
    }));
}

export interface DailyReferralGrowthPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  newReferrals: number;
  activeReferrals: number;
  pendingReferrals: number;
}

function toLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildReferralGrowthSeries(
  referrals: ReferralRecord[],
  nowMs = Date.now(),
  days = 7,
): DailyReferralGrowthPoint[] {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const today = new Date(nowMs);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const buckets = new Map<string, DailyReferralGrowthPoint>();
  const orderedKeys: string[] = [];

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const dayDate = new Date(todayStart);
    dayDate.setDate(todayStart.getDate() - offset);
    const dateKey = toLocalDateKey(dayDate.getTime());
    const label = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
    const fullDate = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    orderedKeys.push(dateKey);
    buckets.set(dateKey, {
      dateKey,
      label,
      fullDate,
      newReferrals: 0,
      activeReferrals: 0,
      pendingReferrals: 0,
    });
  }

  for (const r of referrals) {
    if (!Number.isFinite(r.createdAtMs) || r.createdAtMs <= 0) continue;
    const key = toLocalDateKey(r.createdAtMs);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.newReferrals += 1;
    if (r.status === 'pending') {
      bucket.pendingReferrals += 1;
    } else {
      bucket.activeReferrals += 1;
    }
  }

  return orderedKeys.map((k) => buckets.get(k)!);
}

export const DEFAULT_GRAM_DEPOSIT_ADDRESS =
  'UQAOZ7I-xhBLou2dkPqKUdQKA_ZbwKBjP_p85i73Fp2P1RXr';
export const DEFAULT_GRAM_JETTON_MASTER =
  'EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O';

export const CHICKEN_PACKS: ChickenPack[] = [
  {
    id: 'leghorn',
    name: 'White Leghorn',
    eggsPerHour: 8,
    coinCost: 1000,
    usdCost: 0.1,
    leaderboardPoints: 1,
    tagline: 'Reliable daily layer for starter coops',
    accentColor: '#F59E0B',
  },
  {
    id: 'rhode',
    name: 'Rhode Island Red',
    eggsPerHour: 23,
    coinCost: 3000,
    usdCost: 0.3,
    leaderboardPoints: 3,
    tagline: 'Hardy heritage hen with strong yield',
    accentColor: '#DC2626',
  },
  {
    id: 'orpington',
    name: 'Buff Orpington',
    eggsPerHour: 75,
    coinCost: 10000,
    usdCost: 1.0,
    leaderboardPoints: 10,
    tagline: 'Golden heavy-producing farm favorite',
    accentColor: '#D97706',
  },
  {
    id: 'australorp',
    name: 'Australorp',
    eggsPerHour: 225,
    coinCost: 30000,
    usdCost: 3.0,
    leaderboardPoints: 30,
    tagline: 'Champion egg layer for top ranks',
    accentColor: '#1E293B',
  },
];

export const BASKET_TIERS = [
  { hours: 8, capacity: 300, upgradeCost: 0 },
  { hours: 12, capacity: 550, upgradeCost: 10000 },
  { hours: 24, capacity: 1200, upgradeCost: 25000 },
];

export const DAILY_STREAK_REWARDS = [30, 40, 50, 60, 70, 80, 100];

export const PROMO_CODES: Record<string, { coins: number; label: string }> = {
  CHICKEN2026: { coins: 500, label: 'Welcome Coop Bonus' },
  EGGS100: { coins: 150, label: 'Daily Egg Drop' },
  WELCOME50: { coins: 100, label: 'Starter Pack Code' },
  GRAMTON: { coins: 300, label: 'TON Community Drop' },
};

export interface AdNetworkTaskDefinition {
  id: AdNetworkId;
  name: string;
  subtitle: string;
  rewardCoins: number;
  dailyLimit: number;
  badge: string;
}

export const FREE_EGGS_PER_AD = 150;
export const FREE_EGGS_MILESTONE_BONUS = 500;

export const ADSGRAM_BOT_JOIN_TASK = {
  id: 'adsgram_task' as const,
  name: 'Bot Joins & Clicks',
  subtitle: 'Open & verify sponsored AdsGram bot or channel clicks',
  rewardCoins: 120,
  dailyLimit: 5,
  badge: 'AdsGram Clicks',
};

export const AD_NETWORK_TASKS: AdNetworkTaskDefinition[] = [
  {
    id: 'adsgram',
    name: 'AdsGram',
    subtitle: 'Watch & earn coins via Telegram native ad',
    rewardCoins: 80,
    dailyLimit: 5,
    badge: 'Earn Coins',
  },
  {
    id: 'gigapub',
    name: 'Gigapub',
    subtitle: 'Watch & earn coins via interactive zone ad',
    rewardCoins: 90,
    dailyLimit: 5,
    badge: 'Earn Coins',
  },
  {
    id: 'monetag',
    name: 'Monetag',
    subtitle: 'Watch & earn coins via rewarded zone ad',
    rewardCoins: 100,
    dailyLimit: 5,
    badge: 'Earn Coins',
  },
];

export const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: 'daily_news',
    category: 'daily',
    title: 'Check in on our news channel',
    rewardCoins: 20,
    icon: 'megaphone',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
  },
  {
    id: 'daily_payments',
    category: 'daily',
    title: 'Check in on our payments channel',
    rewardCoins: 20,
    icon: 'wallet',
    actionUrl: 'https://t.me/AG_PAYOUTS',
  },
  {
    id: 'daily_promos',
    category: 'daily',
    title: 'Check in on our promo codes channel',
    rewardCoins: 20,
    icon: 'ticket',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
  },
  {
    id: 'daily_reinvest',
    category: 'daily',
    title: 'Reinvest eggs today',
    subtitle: 'Reinvest min. 500 eggs (+5% extra) to unlock Claim',
    rewardCoins: 100,
    icon: 'refresh',
  },
  {
    id: 'milestone_react',
    category: 'social',
    title: 'React to our farm update post',
    subtitle: 'Drop a reaction on our latest community post',
    rewardCoins: 50,
    icon: 'heart',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
  },
  {
    id: 'milestone_join_news',
    category: 'social',
    title: 'Join Farm News community',
    subtitle: 'Stay updated on daily drops & events',
    rewardCoins: 100,
    icon: 'send',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
  },
  {
    id: 'milestone_join_pay',
    category: 'social',
    title: 'Verify TON payout channel',
    subtitle: 'Check live GRAM withdrawal proofs',
    rewardCoins: 100,
    icon: 'shield',
    actionUrl: 'https://t.me/AG_PAYOUTS',
  },
  {
    id: 'social_share_farm',
    category: 'social',
    title: 'Follow Alpha Gram announcements',
    subtitle: 'Turn on notifications for promo code drops',
    rewardCoins: 120,
    icon: 'users',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
  },
  {
    id: 'exclusive_vip_pack',
    category: 'exclusive',
    title: 'Claim VIP Flock Starter',
    subtitle: 'Limited early-bird bonus for active farmers',
    rewardCoins: 250,
    icon: 'gift',
    totalSlots: 500,
    claimedCount: 312,
  },
  {
    id: 'exclusive_ton_wallet',
    category: 'exclusive',
    title: 'Verify TON Wallet Quest',
    subtitle: 'Exclusive TON ecosystem farmer reward',
    rewardCoins: 300,
    icon: 'shield',
    actionUrl: 'https://t.me/AG_PAYOUTS',
    totalSlots: 1000,
    claimedCount: 640,
  },
  {
    id: 'exclusive_golden_hunter',
    category: 'exclusive',
    title: 'Golden Egg Collector Bonus',
    subtitle: 'Limited seasonal quest for loyal coop owners',
    rewardCoins: 400,
    icon: 'flame',
    totalSlots: 250,
    claimedCount: 148,
  },
  {
    id: 'partner_app',
    category: 'partner',
    title: 'Partner farm explorer',
    subtitle: 'Visit featured TON partner channel',
    rewardCoins: 300,
    icon: 'link',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
    totalSlots: 1000,
    claimedCount: 615,
  },
  {
    id: 'partner_boost',
    category: 'partner',
    title: 'Community reaction bonus',
    subtitle: 'Support our verified partner campaign',
    rewardCoins: 500,
    icon: 'flame',
    actionUrl: 'https://t.me/AG_PAYOUTS',
    totalSlots: 500,
    claimedCount: 289,
  },
  {
    id: 'partner_galaxy',
    category: 'partner',
    title: 'Join Partner Airdrop Hub',
    subtitle: 'Limited slots partner quest · instant check',
    rewardCoins: 350,
    icon: 'send',
    actionUrl: 'https://t.me/AIRDROP_GALAXYS',
    totalSlots: 800,
    claimedCount: 472,
  },
];

export const DEFAULT_AD_CONFIG: AdConfig = {
  provider: 'countdown',
  adsgramBlockId: '',
  adsgramTaskBlockId: '',
  gigapubProjectId: '',
  monetagZoneId: '',
  customTitle: 'Alpha Gram Partner Spotlight',
  customDescription: 'Watch this short sponsor showcase to earn coins & free eggs.',
  customUrl: 'https://t.me/AIRDROP_GALAXYS',
  watchSeconds: 5,
  bannerEnabled: false,
  bannerTitle: 'Join @AIRDROP_GALAXYS',
  bannerSubtitle: 'Daily TON & GRAM drops, promo codes & partner rewards',
  bannerCtaText: 'Open',
  bannerUrl: 'https://t.me/AIRDROP_GALAXYS',
  updatedAtMs: 0,
};

export function mergeTaskDefinitions(customTasks: TaskDefinition[] = []): TaskDefinition[] {
  const activeCustom = customTasks.filter((t) => t.isActive !== false);
  return [...TASK_DEFINITIONS, ...activeCustom];
}

export function getTaskRemainingSlots(
  task: Pick<TaskDefinition, 'totalSlots' | 'claimedCount' | 'isCustom'>,
  completedByUser = false,
): number | null {
  const total = Number(task.totalSlots ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const claimed = Math.max(0, Math.floor(Number(task.claimedCount ?? 0)));
  const localAdjust = !task.isCustom && completedByUser ? 1 : 0;
  return Math.max(0, total - claimed - localAdjust);
}

export function sortTasks(
  tasks: TaskDefinition[],
  sortBy: TaskSortOption,
  completedTaskIds: string[] = [],
): TaskDefinition[] {
  const completedSet = new Set(completedTaskIds);
  const indexed = tasks.map((task, idx) => ({ task, idx }));

  indexed.sort((a, b) => {
    if (sortBy === 'most_reward') {
      const rewardDiff = b.task.rewardCoins - a.task.rewardCoins;
      if (rewardDiff !== 0) return rewardDiff;
      const timeDiff = (b.task.createdAtMs ?? 0) - (a.task.createdAtMs ?? 0);
      if (timeDiff !== 0) return timeDiff;
      return a.idx - b.idx;
    }

    if (sortBy === 'newest') {
      const timeDiff = (b.task.createdAtMs ?? 0) - (a.task.createdAtMs ?? 0);
      if (timeDiff !== 0) return timeDiff;
      const rewardDiff = b.task.rewardCoins - a.task.rewardCoins;
      if (rewardDiff !== 0) return rewardDiff;
      return a.idx - b.idx;
    }

    // 'ending_soon': open limited-slot tasks (fewest spots left > 0) first,
    // then unlimited tasks (null), then sold-out tasks (0 spots left) at the bottom.
    const remA = getTaskRemainingSlots(a.task, completedSet.has(a.task.id));
    const remB = getTaskRemainingSlots(b.task, completedSet.has(b.task.id));

    const rankOf = (rem: number | null): number => {
      if (rem !== null && rem > 0) return 0;
      if (rem === null) return 1;
      return 2;
    };

    const groupDiff = rankOf(remA) - rankOf(remB);
    if (groupDiff !== 0) return groupDiff;

    if (remA !== null && remB !== null && remA !== remB) {
      return remA - remB;
    }

    const rewardDiff = b.task.rewardCoins - a.task.rewardCoins;
    if (rewardDiff !== 0) return rewardDiff;
    return a.idx - b.idx;
  });

  return indexed.map((item) => item.task);
}

export function getAdNetworkClaimCountToday(
  completedTaskIds: string[],
  network: AdNetworkId,
  todayStr: string,
): number {
  const prefix = `ad_${network}_${todayStr}_`;
  return completedTaskIds.filter((id) => id.startsWith(prefix)).length;
}

export function getBotJoinClaimCountToday(
  completedTaskIds: string[],
  todayStr: string,
): number {
  const prefix = `botjoin_${todayStr}_`;
  return completedTaskIds.filter((id) => id.startsWith(prefix)).length;
}

export function getWithdrawalStatusMeta(status: WithdrawalStatus): {
  label: string;
  tone: 'amber' | 'emerald' | 'rose';
} {
  if (status === 'approved' || status === 'completed') {
    return { label: 'Approved', tone: 'emerald' };
  }
  if (status === 'rejected') {
    return { label: 'Rejected', tone: 'rose' };
  }
  return { label: 'Pending Approval', tone: 'amber' };
}

export type WithdrawalFilterTab = 'all' | 'pending' | 'completed';

export function filterWithdrawalsByTab(
  withdrawals: WithdrawalOrder[],
  tab: WithdrawalFilterTab,
): WithdrawalOrder[] {
  if (tab === 'all') return withdrawals;
  if (tab === 'pending') {
    return withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing');
  }
  return withdrawals.filter((w) => w.status === 'approved' || w.status === 'completed');
}

export const DEPOSIT_ADDRESSES: Record<DepositNetwork, { label: string; sub: string; address: string }> = {
  GRAM_TON: {
    label: 'GRAM',
    sub: 'TON',
    address: DEFAULT_GRAM_DEPOSIT_ADDRESS,
  },
};

export function getChickenPack(breed: ChickenBreedId): ChickenPack {
  const found = CHICKEN_PACKS.find((p) => p.id === breed);
  if (!found) {
    throw new Error(`Unknown chicken breed: ${breed}`);
  }
  return found;
}

export const LEVEL_YIELD_BONUS_PER_LEVEL = 0.02;
export const FEED_BOOSTER_COST_COINS = 400;
export const FEED_BOOSTER_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const GOLDEN_EGG_COOLDOWN_MS = 5 * 60 * 60 * 1000; // 5 hours
export const GOLDEN_EGG_REWARD_COINS = 25;
export const GOLDEN_EGG_REWARD_XP = 5;

export function calculateLevelYieldMultiplier(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level || 1));
  return Number((1 + (safeLevel - 1) * LEVEL_YIELD_BONUS_PER_LEVEL).toFixed(2));
}

export function isFeedBoosterActive(
  profile: Pick<UserFarmProfile, 'feedBoostUntilMs'>,
  nowMs = Date.now(),
): boolean {
  return Number(profile.feedBoostUntilMs ?? 0) > nowMs;
}

export const COOP_FEVER_REQUIRED_ADS = 25;
export const COOP_FEVER_DURATION_MS = 10 * 60 * 1000; // 10 minutes
export const COOP_FEVER_MULTIPLIER = 3;

export function isCoopFeverActive(
  profile: Partial<Pick<UserFarmProfile, 'coopFeverUntilMs'>>,
  nowMs = Date.now(),
): boolean {
  return Number(profile.coopFeverUntilMs ?? 0) > nowMs;
}

export interface CoopFeverProgress {
  adsCollected: number;
  adsRequired: number;
  adsRemaining: number;
  progressPct: number;
  active: boolean;
  ready: boolean;
  remainingMs: number;
}

export function getCoopFeverProgress(
  profile: Partial<
    Pick<
      UserFarmProfile,
      'coopFeverAdsWatched' | 'coopFeverUntilMs' | 'coopFeverBaselineAds'
    >
  >,
  nowMs = Date.now(),
): CoopFeverProgress {
  const feverAds = getCoopFeverAdsWatched(profile);
  const rawBaseline = Math.max(0, Math.floor(Number(profile.coopFeverBaselineAds ?? 0) || 0));
  const baseline = Math.min(feverAds, rawBaseline);
  const adsSinceBaseline = Math.max(0, feverAds - baseline);
  const adsCollected = Math.min(COOP_FEVER_REQUIRED_ADS, adsSinceBaseline);
  const adsRemaining = Math.max(0, COOP_FEVER_REQUIRED_ADS - adsSinceBaseline);
  const active = isCoopFeverActive(profile, nowMs);
  const ready = !active && adsSinceBaseline >= COOP_FEVER_REQUIRED_ADS;
  const remainingMs = active ? Math.max(0, Number(profile.coopFeverUntilMs ?? 0) - nowMs) : 0;
  const progressPct = Math.round((adsCollected / COOP_FEVER_REQUIRED_ADS) * 100);
  return {
    adsCollected,
    adsRequired: COOP_FEVER_REQUIRED_ADS,
    adsRemaining,
    progressPct,
    active,
    ready,
    remainingMs,
  };
}

export function calculateProductionRate(
  profile: Pick<
    UserFarmProfile,
    'leghornCount' | 'rhodeCount' | 'orpingtonCount' | 'australorpCount'
  > &
    Partial<Pick<UserFarmProfile, 'level' | 'feedBoostUntilMs' | 'coopFeverUntilMs'>>,
  nowMs?: number,
): number {
  const baseRate =
    profile.leghornCount * 8 +
    profile.rhodeCount * 23 +
    profile.orpingtonCount * 75 +
    profile.australorpCount * 225;

  const levelMult = calculateLevelYieldMultiplier(profile.level ?? 1);
  const feedMult =
    nowMs !== undefined && isFeedBoosterActive({ feedBoostUntilMs: profile.feedBoostUntilMs }, nowMs)
      ? 2
      : 1;
  const coopMult =
    nowMs !== undefined && isCoopFeverActive({ coopFeverUntilMs: profile.coopFeverUntilMs }, nowMs)
      ? COOP_FEVER_MULTIPLIER
      : 1;

  return Math.round(baseRate * levelMult * feedMult * coopMult);
}

export function calculateTotalChickens(
  profile: Pick<UserFarmProfile, 'leghornCount' | 'rhodeCount' | 'orpingtonCount' | 'australorpCount'>,
): number {
  return (
    profile.leghornCount +
    profile.rhodeCount +
    profile.orpingtonCount +
    profile.australorpCount
  );
}

export function calculateBuyerPoints(
  profile: Pick<UserFarmProfile, 'leghornCount' | 'rhodeCount' | 'orpingtonCount' | 'australorpCount'>,
): number {
  return (
    profile.leghornCount * 1 +
    profile.rhodeCount * 3 +
    profile.orpingtonCount * 10 +
    profile.australorpCount * 30
  );
}

export const CHICKEN_MILESTONES = [5, 10, 25, 50, 100] as const;

export interface ChickenMilestoneInfo {
  threshold: number;
  title: string;
  subtitle: string;
  badge: string;
}

const MILESTONE_COPY: Record<number, { title: string; subtitle: string }> = {
  5: {
    title: 'Flock Starter!',
    subtitle: '5 chickens clucking across your meadow',
  },
  10: {
    title: 'Coop Commander!',
    subtitle: '10 chickens laying eggs 24/7',
  },
  25: {
    title: 'Poultry Tycoon!',
    subtitle: '25 chickens powering your farm',
  },
  50: {
    title: 'Golden Flock!',
    subtitle: '50 chickens — booming egg harvest',
  },
  100: {
    title: 'Farm Legend!',
    subtitle: '100 chickens — unstoppable poultry empire',
  },
};

export function getChickenMilestoneReached(
  prevCount: number,
  nextCount: number,
): ChickenMilestoneInfo | null {
  if (nextCount <= prevCount) return null;
  let reached: number | null = null;
  for (const milestone of CHICKEN_MILESTONES) {
    if (prevCount < milestone && nextCount >= milestone) {
      reached = milestone;
    }
  }
  if (reached === null) return null;
  const copy = MILESTONE_COPY[reached] ?? {
    title: `${reached} Chickens!`,
    subtitle: `Your flock reached ${reached} total chickens`,
  };
  return {
    threshold: reached,
    title: copy.title,
    subtitle: copy.subtitle,
    badge: `${reached} Hens`,
  };
}

export function detectTop10RankCelebration(params: {
  previousRank: number | null;
  nextRank: number;
  hasInitialized: boolean;
}): boolean {
  if (!params.hasInitialized) return false;
  if (params.nextRank < 1 || params.nextRank > 10) return false;
  if (params.previousRank === null) return false;
  return params.previousRank > 10 || params.nextRank < params.previousRank;
}

export function eggsToUsd(eggs: number): number {
  return Number((Math.max(0, eggs) * USD_PER_EGG).toFixed(4));
}

export function eggsToGram(eggs: number): number {
  const usd = Math.max(0, eggs) * USD_PER_EGG;
  return Number((usd / GRAM_USD_PRICE).toFixed(6));
}

export function coinsToUsd(coins: number): number {
  return Number((Math.max(0, coins) / COINS_PER_USD).toFixed(3));
}

export function gramToCoins(gramAmount: number): number {
  const safeGram = Math.max(0, gramAmount);
  return Math.round(safeGram * GRAM_USD_PRICE * COINS_PER_USD);
}

export function coinsToGram(coins: number): number {
  const usd = Math.max(0, coins) / COINS_PER_USD;
  return Number((usd / GRAM_USD_PRICE).toFixed(4));
}

export function calculatePendingEggs(
  profile: Pick<
    UserFarmProfile,
    | 'leghornCount'
    | 'rhodeCount'
    | 'orpingtonCount'
    | 'australorpCount'
    | 'lastCollectedAt'
    | 'basketCapacity'
  > &
    Partial<Pick<UserFarmProfile, 'level' | 'feedBoostUntilMs' | 'coopFeverUntilMs'>>,
  nowMs: number,
): number {
  const ratePerHour = calculateProductionRate(profile, nowMs);
  const elapsedHours = Math.max(0, (nowMs - profile.lastCollectedAt) / (1000 * 60 * 60));
  const raw = Math.floor(ratePerHour * elapsedHours);
  return Math.min(profile.basketCapacity, Math.max(0, raw));
}

export function formatAwayDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function getXpForLevel(level: number): number {
  return Math.max(10, level * 10);
}

function addXp(level: number, xp: number, gain: number): { level: number; xp: number } {
  let nextLevel = level;
  let nextXp = xp + gain;
  while (nextXp >= getXpForLevel(nextLevel)) {
    nextXp -= getXpForLevel(nextLevel);
    nextLevel += 1;
  }
  return { level: nextLevel, xp: nextXp };
}

export function collectEggs(
  profile: UserFarmProfile,
  nowMs: number,
  explicitAmount?: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      collected: number;
      referralEggCommission: number;
    }
  | { error: string } {
  const pending = explicitAmount !== undefined ? explicitAmount : calculatePendingEggs(profile, nowMs);
  if (pending <= 0) {
    if (calculateTotalChickens(profile) <= 0) {
      return { error: 'Buy your first chicken in Packs to start egg mining!' };
    }
    return { error: 'No eggs ready in basket yet. Wait for your hens to lay!' };
  }
  const collected = Math.min(profile.basketCapacity, Math.floor(pending));
  const usdAdded = eggsToUsd(collected);
  const { level, xp } = addXp(profile.level, profile.xp, Math.max(1, Math.floor(collected / 15)));

  const nextProfile: UserFarmProfile = {
    ...profile,
    eggs: profile.eggs + collected,
    totalEggsCollected: profile.totalEggsCollected + collected,
    totalCashEarnedUsd: Number((profile.totalCashEarnedUsd + usdAdded).toFixed(4)),
    level,
    xp,
    lastCollectedAt: nowMs,
  };

  const transaction: TransactionEntry = {
    id: `tx_collect_${nowMs}`,
    userId: profile.uid,
    type: 'collect',
    title: 'Collected eggs',
    amount: collected,
    currency: 'eggs',
    usdValue: usdAdded,
    status: 'completed',
    createdAtMs: nowMs,
  };

  const referralEggCommission = profile.referredBy
    ? calculateReferralEggCommission(collected)
    : 0;

  return { profile: nextProfile, transaction, collected, referralEggCommission };
}

export function buyChickens(
  profile: UserFarmProfile,
  breed: ChickenBreedId,
  quantity: number,
  nowMs: number,
): { profile: UserFarmProfile; transaction: TransactionEntry; shouldActivateReferral: boolean } | { error: string } {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return { error: 'Select a valid quantity between 1 and 50.' };
  }
  const pack = getChickenPack(breed);
  const totalCost = pack.coinCost * quantity;
  if (profile.coins < totalCost) {
    return { error: `Need ${totalCost.toLocaleString()} coins (you have ${profile.coins.toLocaleString()}).` };
  }

  const { level, xp } = addXp(profile.level, profile.xp, pack.leaderboardPoints * quantity * 2);
  const shouldActivateReferral = Boolean(profile.referredBy && !profile.referralActivated);
  const hadNoChickens = calculateTotalChickens(profile) === 0;

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins - totalCost,
    leghornCount: profile.leghornCount + (breed === 'leghorn' ? quantity : 0),
    rhodeCount: profile.rhodeCount + (breed === 'rhode' ? quantity : 0),
    orpingtonCount: profile.orpingtonCount + (breed === 'orpington' ? quantity : 0),
    australorpCount: profile.australorpCount + (breed === 'australorp' ? quantity : 0),
    boughtThisWeek: profile.boughtThisWeek + quantity,
    referralActivated: true,
    lastCollectedAt: hadNoChickens ? nowMs : profile.lastCollectedAt,
    level,
    xp,
  };

  const transaction: TransactionEntry = {
    id: `tx_buy_${breed}_${nowMs}`,
    userId: profile.uid,
    type: 'buy_chicken',
    title: `Bought ${quantity}x ${pack.name}`,
    amount: -totalCost,
    currency: 'coins',
    usdValue: Number((pack.usdCost * quantity).toFixed(2)),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, shouldActivateReferral };
}

export function buildDeterministicDepositIds(txHash: string): {
  depositId: string;
  txId: string;
  refCommissionTxId: string;
} {
  const canonical = txHash.trim().toLowerCase();
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  for (let i = 0; i < canonical.length; i += 1) {
    const code = canonical.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }
  const digest = `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
  const safePrefix = canonical.replace(/[^a-z0-9_-]/g, '_').slice(0, 32) || 'tx';
  return {
    depositId: `dep_${safePrefix}_${digest}`.slice(0, 64),
    txId: `tx_dep_${safePrefix}_${digest}`.slice(0, 64),
    refCommissionTxId: `tx_ref_${safePrefix}_${digest}`.slice(0, 64),
  };
}

export function createDepositQuote(
  coinsAmount: number,
  network: DepositNetwork = 'GRAM_TON',
  depositAddress = DEPOSIT_ADDRESSES.GRAM_TON.address,
): {
  coinsAmount: number;
  bonusCoins: number;
  totalCoins: number;
  usdAmount: number;
  gramAmount: number;
  cryptoAmount: string;
  depositAddress: string;
} {
  const safeCoins = Math.min(
    MAX_DEPOSIT_COINS,
    Math.max(MIN_DEPOSIT_COINS, Math.round(coinsAmount)),
  );
  const usdAmount = Number((safeCoins / COINS_PER_USD).toFixed(2));
  const gramAmount = coinsToGram(safeCoins);
  const cryptoAmount = `${gramAmount.toFixed(4)} GRAM`;

  return {
    coinsAmount: safeCoins,
    bonusCoins: 0,
    totalCoins: safeCoins,
    usdAmount,
    gramAmount,
    cryptoAmount,
    depositAddress: depositAddress || DEPOSIT_ADDRESSES[network].address,
  };
}

export function executeDeposit(
  profile: UserFarmProfile,
  coinsAmount: number,
  network: DepositNetwork,
  nowMs: number,
  txHash = '',
  explicitGramAmount?: number,
  depositAddress = DEPOSIT_ADDRESSES.GRAM_TON.address,
):
  | {
      profile: UserFarmProfile;
      deposit: DepositOrder;
      transaction: TransactionEntry;
      referrerCommissionCoins: number;
    }
  | { error: string } {
  const computedCoins =
    explicitGramAmount !== undefined && explicitGramAmount > 0
      ? gramToCoins(explicitGramAmount)
      : Math.round(coinsAmount);

  if (computedCoins < MIN_DEPOSIT_COINS) {
    return {
      error: `Minimum deposit is ${MIN_DEPOSIT_COINS.toLocaleString()} coins (≈ ${coinsToGram(MIN_DEPOSIT_COINS).toFixed(4)} GRAM).`,
    };
  }

  if (computedCoins > MAX_DEPOSIT_COINS) {
    return {
      error: `Maximum deposit is ${MAX_DEPOSIT_COINS.toLocaleString()} coins (≈ ${coinsToGram(MAX_DEPOSIT_COINS).toFixed(4)} GRAM).`,
    };
  }

  const usdAmount = Number(Math.max(0.1, computedCoins / COINS_PER_USD).toFixed(2));
  const gramStr =
    explicitGramAmount !== undefined && explicitGramAmount > 0
      ? `${explicitGramAmount.toFixed(4)} GRAM`
      : `${coinsToGram(computedCoins).toFixed(4)} GRAM`;

  const cleanTxHash = txHash.trim().slice(0, 128);
  if (!cleanTxHash) {
    return { error: 'On-chain GRAM transaction hash is required to credit points.' };
  }

  const ids = buildDeterministicDepositIds(cleanTxHash);

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + computedCoins,
    firstDepositBonusUsed: true,
  };

  const deposit: DepositOrder = {
    id: ids.depositId,
    userId: profile.uid,
    coinsAmount: computedCoins,
    bonusCoins: 0,
    usdAmount,
    network,
    cryptoAmount: gramStr,
    depositAddress,
    txHash: cleanTxHash,
    status: 'completed',
    createdAtMs: nowMs,
  };

  const transaction: TransactionEntry = {
    id: ids.txId,
    userId: profile.uid,
    type: 'deposit',
    title: `GRAM Deposit (${gramStr})`,
    amount: computedCoins,
    currency: 'coins',
    usdValue: usdAmount,
    status: 'completed',
    createdAtMs: nowMs,
  };

  const referrerCommissionCoins = profile.referredBy
    ? Math.max(1, Math.round(computedCoins * REFERRAL_DEPOSIT_COMMISSION_RATE))
    : 0;

  return { profile: nextProfile, deposit, transaction, referrerCommissionCoins };
}

export function calculateReinvestCoins(eggsAmount: number): {
  bonusEggs: number;
  baseCoins: number;
  bonusCoins: number;
  totalCoins: number;
} {
  const safeEggs = Math.max(0, Math.floor(eggsAmount));
  if (safeEggs <= 0) {
    return {
      bonusEggs: 0,
      baseCoins: 0,
      bonusCoins: 0,
      totalCoins: 0,
    };
  }
  const bonusEggs = Math.max(1, Math.round(safeEggs * REINVEST_BONUS_RATE));
  const baseCoins = Math.max(1, Math.round(safeEggs * 0.07));
  const totalCoins = Math.max(baseCoins + 1, Math.round((safeEggs + bonusEggs) * 0.07));
  const bonusCoins = Math.max(1, totalCoins - baseCoins);
  return {
    bonusEggs,
    baseCoins,
    bonusCoins,
    totalCoins: baseCoins + bonusCoins,
  };
}

export function reinvestEggs(
  profile: UserFarmProfile,
  eggsAmount: number,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      coinsReceived: number;
      bonusEggs: number;
    }
  | { error: string } {
  const safeEggs = Math.floor(eggsAmount);
  if (safeEggs < MIN_REINVEST_EGGS) {
    return { error: `Minimum reinvest amount is ${MIN_REINVEST_EGGS} eggs.` };
  }
  if (safeEggs > profile.eggs) {
    return { error: 'Not enough eggs in your balance.' };
  }
  const { totalCoins, bonusEggs } = calculateReinvestCoins(safeEggs);
  const nextProfile: UserFarmProfile = {
    ...profile,
    eggs: profile.eggs - safeEggs,
    coins: profile.coins + totalCoins,
    lastReinvestDate: getTodayDateString(nowMs),
  };

  const transaction: TransactionEntry = {
    id: `tx_reinv_${nowMs}`,
    userId: profile.uid,
    type: 'reinvest',
    title: `Reinvested ${safeEggs.toLocaleString()} eggs (+5% extra)`,
    amount: totalCoins,
    currency: 'coins',
    usdValue: coinsToUsd(totalCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, coinsReceived: totalCoins, bonusEggs };
}

export function getTotalAdsWatched(
  profile: Partial<Pick<UserFarmProfile, 'watchedAdsCount' | 'totalAdsWatched'>>,
): number {
  return Math.max(0, Math.floor(Number(profile.totalAdsWatched ?? profile.watchedAdsCount ?? 0)));
}

export function getWithdrawAdsWatched(
  profile: Partial<Pick<UserFarmProfile, 'withdrawAdsWatched'>>,
): number {
  return Math.max(0, Math.floor(Number(profile.withdrawAdsWatched ?? 0) || 0));
}

export function getCoopFeverAdsWatched(
  profile: Partial<Pick<UserFarmProfile, 'coopFeverAdsWatched'>>,
): number {
  return Math.max(0, Math.floor(Number(profile.coopFeverAdsWatched ?? 0) || 0));
}

export function getWithdrawAdGateStatus(
  profile: Partial<Pick<UserFarmProfile, 'withdrawAdsWatched' | 'watchedAdsCount' | 'totalAdsWatched'>>,
): {
  watched: number;
  required: number;
  remaining: number;
  unlocked: boolean;
} {
  const watched = getWithdrawAdsWatched(profile);
  const remaining = Math.max(0, MIN_WITHDRAW_ADS_WATCHED - watched);
  return {
    watched,
    required: MIN_WITHDRAW_ADS_WATCHED,
    remaining,
    unlocked: watched >= MIN_WITHDRAW_ADS_WATCHED,
  };
}

export function validateWithdrawalInput(
  profile: Pick<UserFarmProfile, 'eggs'> &
    Partial<Pick<UserFarmProfile, 'withdrawAdsWatched' | 'watchedAdsCount' | 'totalAdsWatched'>>,
  eggsAmount: number,
  walletAddress: string,
): string | null {
  const adGate = getWithdrawAdGateStatus(profile);
  if (!adGate.unlocked) {
    return `Watch at least ${adGate.required} ads from the 3 Coin Ad buttons in Tasks before withdrawing (${adGate.watched}/${adGate.required} watched).`;
  }
  const trimmed = walletAddress.trim();
  if (trimmed.length < 6) {
    return 'Enter a valid TON wallet address (at least 6 characters, e.g. UQ...).';
  }
  if (!Number.isFinite(eggsAmount) || Math.floor(eggsAmount) < MIN_WITHDRAW_EGGS) {
    return `Minimum withdrawal is ${MIN_WITHDRAW_EGGS} eggs.`;
  }
  if (Math.floor(eggsAmount) > profile.eggs) {
    return 'Insufficient egg balance for this withdrawal.';
  }
  return null;
}

export function executeWithdrawal(
  profile: UserFarmProfile,
  eggsAmount: number,
  walletAddress: string,
  memo: string,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      withdrawal: WithdrawalOrder;
      transaction: TransactionEntry;
      adsDeducted: number;
      remainingWithdrawAds: number;
    }
  | { error: string } {
  const err = validateWithdrawalInput(profile, eggsAmount, walletAddress);
  if (err) return { error: err };

  const safeEggs = Math.floor(eggsAmount);
  const usdValue = eggsToUsd(safeEggs);
  const gramAmount = eggsToGram(safeEggs).toFixed(6);
  const cleanAddress = walletAddress.trim();
  const cleanMemo = memo.trim().slice(0, 64);

  const currentWithdrawAds = getWithdrawAdsWatched(profile);
  const nextWithdrawAdsWatched = Math.max(
    0,
    currentWithdrawAds - WITHDRAW_ADS_CRITERIA_DEDUCT_COUNT,
  );
  const adsDeducted = Math.max(0, currentWithdrawAds - nextWithdrawAdsWatched);

  const nextProfile: UserFarmProfile = {
    ...profile,
    eggs: profile.eggs - safeEggs,
    totalWithdrawnUsd: Number((profile.totalWithdrawnUsd + usdValue).toFixed(4)),
    withdrawAdsWatched: nextWithdrawAdsWatched,
  };

  const withdrawal: WithdrawalOrder = {
    id: `wd_${nowMs}`,
    txId: `tx_wd_${nowMs}`,
    userId: profile.uid,
    eggsAmount: safeEggs,
    gramAmount,
    usdValue,
    walletAddress: cleanAddress,
    memo: cleanMemo,
    network: 'GRAM_TON',
    status: 'pending',
    createdAtMs: nowMs,
  };

  const transaction: TransactionEntry = {
    id: `tx_wd_${nowMs}`,
    userId: profile.uid,
    type: 'withdraw',
    title: `Withdraw ${gramAmount} GRAM`,
    amount: -safeEggs,
    currency: 'eggs',
    usdValue,
    status: 'pending',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    withdrawal,
    transaction,
    adsDeducted,
    remainingWithdrawAds: nextWithdrawAdsWatched,
  };
}

export function claimDailyStreak(
  profile: UserFarmProfile,
  todayStr: string,
  nowMs: number,
): { profile: UserFarmProfile; transaction: TransactionEntry; rewardCoins: number } | { error: string } {
  if (profile.lastDailyClaimDate === todayStr) {
    return { error: 'Daily login already claimed today. Come back tomorrow!' };
  }
  const nextStreak = profile.dailyStreak >= 7 ? 1 : profile.dailyStreak + 1;
  const rewardCoins = DAILY_STREAK_REWARDS[nextStreak - 1] ?? 30;

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + rewardCoins,
    dailyStreak: nextStreak,
    lastDailyClaimDate: todayStr,
  };

  const transaction: TransactionEntry = {
    id: `tx_daily_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: `Daily Login Day ${nextStreak}`,
    amount: rewardCoins,
    currency: 'coins',
    usdValue: coinsToUsd(rewardCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, rewardCoins };
}

export function claimPromoCode(
  profile: UserFarmProfile,
  rawCode: string,
  nowMs: number,
  dynamicPromos: DynamicPromoCode[] = [],
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      rewardCoins: number;
      rewardEggs: number;
      rewardChickenBreed?: ChickenBreedId;
      rewardChickenQty: number;
      rewardSummary: string;
      label: string;
      dynamicPromoCode?: string;
    }
  | { error: string } {
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    return { error: 'Enter a gift or promo code first.' };
  }
  if (profile.claimedPromoCodes.includes(code)) {
    return { error: `Gift code ${code} was already claimed.` };
  }

  const dynamicMatch = dynamicPromos.find((p) => p.code.trim().toUpperCase() === code);
  if (dynamicMatch) {
    if (!dynamicMatch.isActive) {
      return { error: `Gift code ${code} is paused.` };
    }
    if (dynamicMatch.expiresAtMs > 0 && nowMs > dynamicMatch.expiresAtMs) {
      return { error: `Gift code ${code} has expired.` };
    }
    if (dynamicMatch.maxUses > 0 && dynamicMatch.usedCount >= dynamicMatch.maxUses) {
      return { error: `Gift code ${code} reached its maximum redemption limit.` };
    }

    const decoded =
      dynamicMatch.rewardType !== undefined
        ? {
            label: dynamicMatch.label,
            rewardType: dynamicMatch.rewardType,
            coins: Math.max(0, Math.round(dynamicMatch.coins || 0)),
            eggs: Math.max(0, Math.round(dynamicMatch.eggs || 0)),
            chickenBreed: dynamicMatch.chickenBreed,
            chickenQty: Math.max(0, Math.round(dynamicMatch.chickenQty || 0)),
          }
        : decodePromoLabelMeta(dynamicMatch.label, dynamicMatch.coins);

    const rewardCoins = decoded.coins;
    const rewardEggs = decoded.eggs;
    const rewardChickenBreed = decoded.chickenBreed;
    const rewardChickenQty = decoded.chickenQty;

    const hadNoChickens = calculateTotalChickens(profile) === 0;
    let nextLeghorns = profile.leghornCount;
    let nextRhode = profile.rhodeCount;
    let nextOrpington = profile.orpingtonCount;
    let nextAustralorp = profile.australorpCount;

    if (rewardChickenQty > 0 && rewardChickenBreed) {
      if (rewardChickenBreed === 'leghorn') nextLeghorns += rewardChickenQty;
      else if (rewardChickenBreed === 'rhode') nextRhode += rewardChickenQty;
      else if (rewardChickenBreed === 'orpington') nextOrpington += rewardChickenQty;
      else if (rewardChickenBreed === 'australorp') nextAustralorp += rewardChickenQty;
    }

    const nextProfile: UserFarmProfile = {
      ...profile,
      coins: profile.coins + rewardCoins,
      eggs: profile.eggs + rewardEggs,
      leghornCount: nextLeghorns,
      rhodeCount: nextRhode,
      orpingtonCount: nextOrpington,
      australorpCount: nextAustralorp,
      lastCollectedAt: hadNoChickens && rewardChickenQty > 0 ? nowMs : profile.lastCollectedAt,
      claimedPromoCodes: [...profile.claimedPromoCodes, code].slice(-50),
    };

    const rewardSummary = formatPromoRewardSummary(decoded);
    const txCurrency: 'eggs' | 'coins' =
      decoded.rewardType === 'eggs' && rewardEggs > 0 ? 'eggs' : 'coins';
    const txAmount =
      txCurrency === 'eggs' ? rewardEggs : rewardCoins;
    const txUsdValue =
      txCurrency === 'eggs'
        ? Number((rewardEggs * USD_PER_EGG).toFixed(6))
        : coinsToUsd(rewardCoins);

    const transaction: TransactionEntry = {
      id: `tx_promo_${nowMs}`,
      userId: profile.uid,
      type: 'promo',
      title: `Gift ${code}: ${rewardSummary}`.slice(0, 80),
      amount: txAmount,
      currency: txCurrency,
      usdValue: txUsdValue,
      status: 'completed',
      createdAtMs: nowMs,
    };

    return {
      profile: nextProfile,
      transaction,
      rewardCoins,
      rewardEggs,
      rewardChickenBreed,
      rewardChickenQty,
      rewardSummary,
      label: decoded.label,
      dynamicPromoCode: code,
    };
  }

  const promo = PROMO_CODES[code];
  if (!promo) {
    return { error: 'Invalid gift code. Get latest codes in @AIRDROP_GALAXYS.' };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + promo.coins,
    claimedPromoCodes: [...profile.claimedPromoCodes, code].slice(-50),
  };

  const transaction: TransactionEntry = {
    id: `tx_promo_${nowMs}`,
    userId: profile.uid,
    type: 'promo',
    title: `Promo code ${code}`,
    amount: promo.coins,
    currency: 'coins',
    usdValue: coinsToUsd(promo.coins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    rewardCoins: promo.coins,
    rewardEggs: 0,
    rewardChickenQty: 0,
    rewardSummary: `+${promo.coins.toLocaleString()} coins`,
    label: promo.label,
  };
}

export function completeTask(
  profile: UserFarmProfile,
  taskId: string,
  nowMs: number,
  customTasks: TaskDefinition[] = [],
): { profile: UserFarmProfile; transaction: TransactionEntry; rewardCoins: number; isCustomTask: boolean } | { error: string } {
  const allTasks = mergeTaskDefinitions(customTasks);
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) {
    return { error: 'Task not found.' };
  }
  if (task.creatorUid && task.creatorUid === profile.uid) {
    return { error: 'You cannot claim rewards on your own posted task.' };
  }
  if (profile.completedTaskIds.includes(taskId)) {
    return { error: 'Task already completed.' };
  }
  if (taskId === 'daily_reinvest') {
    const todayStr = getTodayDateString(nowMs);
    if (profile.lastReinvestDate !== todayStr) {
      return {
        error: `Reinvest at least ${MIN_REINVEST_EGGS} eggs today first to unlock this reward.`,
      };
    }
  }
  const remainingSlots = getTaskRemainingSlots(task, false);
  if (remainingSlots !== null && remainingSlots <= 0) {
    return { error: 'All slots for this task have been claimed.' };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + task.rewardCoins,
    completedTaskIds: [...profile.completedTaskIds, taskId].slice(-50),
  };

  const transaction: TransactionEntry = {
    id: `tx_task_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: `Task: ${task.title.slice(0, 50)}`,
    amount: task.rewardCoins,
    currency: 'coins',
    usdValue: coinsToUsd(task.rewardCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    rewardCoins: task.rewardCoins,
    isCustomTask: Boolean(task.isCustom),
  };
}

export const USER_TASK_MIN_REWARD_COINS = 50;
export const USER_TASK_MAX_REWARD_COINS = 100_000;
export const USER_TASK_MIN_SLOTS = 1;
export const USER_TASK_MAX_SLOTS = 10_000;
export const USER_TASK_PLATFORM_FEE_RATE = 0.1;
export const USER_TASK_MIN_FEE_COINS = 0;
export const USER_TASK_CHANNEL_CHECK_FEE_COINS = 5_000;
export const USER_TASK_MIN_TOTAL_COST_COINS = 10_000;

export const DEFAULT_TASK_PRICING_CONFIG: TaskPricingConfig = {
  minBudgetCoins: USER_TASK_MIN_TOTAL_COST_COINS,
  channelCheckFeeCoins: USER_TASK_CHANNEL_CHECK_FEE_COINS,
  platformFeeRate: USER_TASK_PLATFORM_FEE_RATE,
  updatedAtMs: 0,
};

export function resolveTaskPricingConfig(
  pricing?: Partial<TaskPricingConfig> | null,
): TaskPricingConfig {
  const minBudgetRaw = Number(pricing?.minBudgetCoins);
  const checkFeeRaw = Number(pricing?.channelCheckFeeCoins);
  const feeRateRaw = Number(pricing?.platformFeeRate);
  const minBudgetCoins =
    Number.isFinite(minBudgetRaw) && minBudgetRaw >= 100
      ? Math.min(1_000_000, Math.max(1_000, Math.round(minBudgetRaw)))
      : USER_TASK_MIN_TOTAL_COST_COINS;
  const channelCheckFeeCoins =
    Number.isFinite(checkFeeRaw) && checkFeeRaw >= 0
      ? Math.min(500_000, Math.max(0, Math.round(checkFeeRaw)))
      : USER_TASK_CHANNEL_CHECK_FEE_COINS;
  const platformFeeRate =
    Number.isFinite(feeRateRaw) && feeRateRaw >= 0
      ? Math.min(0.5, Math.max(0, Number(feeRateRaw.toFixed(4))))
      : USER_TASK_PLATFORM_FEE_RATE;
  return {
    minBudgetCoins,
    channelCheckFeeCoins,
    platformFeeRate,
    updatedAtMs: Math.max(0, Number(pricing?.updatedAtMs ?? 0) || 0),
  };
}

export interface PaidTaskCostBreakdown {
  rewardCoins: number;
  totalSlots: number;
  rewardPoolCoins: number;
  platformFeeCoins: number;
  channelCheckFeeCoins: number;
  requireChannelCheck: boolean;
  totalCostCoins: number;
}

export function calculatePaidTaskCost(
  rewardCoins: number,
  totalSlots: number,
  requireChannelCheck = false,
  pricing?: Partial<TaskPricingConfig> | null,
): PaidTaskCostBreakdown {
  const resolved = resolveTaskPricingConfig(pricing);
  const safeReward = Math.max(
    USER_TASK_MIN_REWARD_COINS,
    Math.min(USER_TASK_MAX_REWARD_COINS, Math.floor(Number(rewardCoins) || 0)),
  );
  const safeSlots = Math.max(
    USER_TASK_MIN_SLOTS,
    Math.min(USER_TASK_MAX_SLOTS, Math.floor(Number(totalSlots) || 0)),
  );
  const rewardPoolCoins = safeReward * safeSlots;
  const feeRate = resolved.platformFeeRate;
  const grossBaseCoins =
    feeRate > 0
      ? Math.round(rewardPoolCoins / Math.max(0.05, 1 - feeRate))
      : rewardPoolCoins;
  const platformFeeCoins = Math.max(USER_TASK_MIN_FEE_COINS, grossBaseCoins - rewardPoolCoins);
  const channelCheckFeeCoins = requireChannelCheck ? resolved.channelCheckFeeCoins : 0;
  return {
    rewardCoins: safeReward,
    totalSlots: safeSlots,
    rewardPoolCoins,
    platformFeeCoins,
    channelCheckFeeCoins,
    requireChannelCheck: Boolean(requireChannelCheck),
    totalCostCoins: rewardPoolCoins + platformFeeCoins + channelCheckFeeCoins,
  };
}

export interface PaidTaskBudgetPreview extends PaidTaskCostBreakdown {
  budgetCoins: number;
  unspentCoins: number;
  minBudgetForReward: number;
  valid: boolean;
  error?: string;
}

export function calculatePaidTaskFromBudget(
  budgetCoins: number,
  rewardCoinsInput: number = USER_TASK_MIN_REWARD_COINS,
  requireChannelCheck = false,
  pricing?: Partial<TaskPricingConfig> | null,
): PaidTaskBudgetPreview {
  const resolved = resolveTaskPricingConfig(pricing);
  const safeBudget = Math.max(0, Math.floor(Number(budgetCoins) || 0));
  const rawReward = Math.floor(Number(rewardCoinsInput) || 0);
  const rewardValid =
    rawReward >= USER_TASK_MIN_REWARD_COINS && rawReward <= USER_TASK_MAX_REWARD_COINS;
  const safeReward = Math.max(
    USER_TASK_MIN_REWARD_COINS,
    Math.min(USER_TASK_MAX_REWARD_COINS, rawReward || USER_TASK_MIN_REWARD_COINS),
  );
  const feeRate = resolved.platformFeeRate;
  const channelCheckFeeCoins = requireChannelCheck ? resolved.channelCheckFeeCoins : 0;
  const minTotalCostForMode = resolved.minBudgetCoins + channelCheckFeeCoins;
  const minBudgetForReward = Math.max(
    minTotalCostForMode,
    calculatePaidTaskCost(safeReward, USER_TASK_MIN_SLOTS, requireChannelCheck, resolved).totalCostCoins,
  );

  const computeRaw = (slots: number) => {
    const rewardPoolCoins = slots * safeReward;
    const grossBaseCoins =
      feeRate > 0
        ? Math.round(rewardPoolCoins / Math.max(0.05, 1 - feeRate))
        : rewardPoolCoins;
    const platformFeeCoins = Math.max(USER_TASK_MIN_FEE_COINS, grossBaseCoins - rewardPoolCoins);
    return {
      rewardPoolCoins,
      platformFeeCoins,
      channelCheckFeeCoins,
      totalCostCoins: rewardPoolCoins + platformFeeCoins + channelCheckFeeCoins,
    };
  };

  if (!rewardValid) {
    return {
      budgetCoins: safeBudget,
      rewardCoins: safeReward,
      totalSlots: 0,
      rewardPoolCoins: 0,
      platformFeeCoins: Math.round(resolved.minBudgetCoins * feeRate),
      channelCheckFeeCoins,
      requireChannelCheck: Boolean(requireChannelCheck),
      totalCostCoins: 0,
      unspentCoins: safeBudget,
      minBudgetForReward,
      valid: false,
      error: `Reward per user must be between ${USER_TASK_MIN_REWARD_COINS.toLocaleString()} and ${USER_TASK_MAX_REWARD_COINS.toLocaleString()} coins.`,
    };
  }

  if (safeBudget < minTotalCostForMode) {
    return {
      budgetCoins: safeBudget,
      rewardCoins: safeReward,
      totalSlots: 0,
      rewardPoolCoins: 0,
      platformFeeCoins: Math.round(resolved.minBudgetCoins * feeRate),
      channelCheckFeeCoins,
      requireChannelCheck: Boolean(requireChannelCheck),
      totalCostCoins: 0,
      unspentCoins: safeBudget,
      minBudgetForReward,
      valid: false,
      error: requireChannelCheck
        ? `Minimum ${minTotalCostForMode.toLocaleString()} coins required (includes +${resolved.channelCheckFeeCoins.toLocaleString()} channel check fee).`
        : `Minimum ${resolved.minBudgetCoins.toLocaleString()} coins required.`,
    };
  }

  const spendableAfterChannelCheck = Math.max(0, safeBudget - channelCheckFeeCoins);
  const netPoolBudget = Math.max(0, Math.floor(spendableAfterChannelCheck * Math.max(0.05, 1 - feeRate)));
  let slots = Math.max(
    0,
    Math.min(USER_TASK_MAX_SLOTS, Math.floor(netPoolBudget / safeReward) + 2),
  );

  while (slots > 0 && computeRaw(slots).totalCostCoins > safeBudget) {
    slots -= 1;
  }

  if (slots < USER_TASK_MIN_SLOTS) {
    return {
      budgetCoins: safeBudget,
      rewardCoins: safeReward,
      totalSlots: slots,
      rewardPoolCoins: slots * safeReward,
      platformFeeCoins:
        slots > 0
          ? computeRaw(slots).platformFeeCoins
          : Math.round(spendableAfterChannelCheck * feeRate),
      channelCheckFeeCoins,
      requireChannelCheck: Boolean(requireChannelCheck),
      totalCostCoins: slots > 0 ? computeRaw(slots).totalCostCoins : 0,
      unspentCoins: safeBudget,
      minBudgetForReward,
      valid: false,
      error: `With ${safeReward.toLocaleString()} coins/join, enter at least ${minBudgetForReward.toLocaleString()} coins (for ${USER_TASK_MIN_SLOTS} slot).`,
    };
  }

  const finalized = computeRaw(slots);
  return {
    budgetCoins: safeBudget,
    rewardCoins: safeReward,
    totalSlots: slots,
    rewardPoolCoins: finalized.rewardPoolCoins,
    platformFeeCoins: finalized.platformFeeCoins,
    channelCheckFeeCoins: finalized.channelCheckFeeCoins,
    requireChannelCheck: Boolean(requireChannelCheck),
    totalCostCoins: finalized.totalCostCoins,
    unspentCoins: Math.max(0, safeBudget - finalized.totalCostCoins),
    minBudgetForReward,
    valid: true,
  };
}

export function createPaidTaskOrder(
  profile: UserFarmProfile,
  input: {
    title: string;
    subtitle?: string;
    category: TaskCategory;
    rewardCoins: number;
    totalSlots: number;
    icon: string;
    actionUrl: string;
    requireChannelCheck?: boolean;
  },
  nowMs: number,
  pricing?: Partial<TaskPricingConfig> | null,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      cost: PaidTaskCostBreakdown;
    }
  | { error: string } {
  const cleanTitle = input.title.trim();
  if (cleanTitle.length < 2) {
    return { error: 'Enter a task title (at least 2 characters).' };
  }
  const rawReward = Math.floor(Number(input.rewardCoins) || 0);
  if (rawReward < USER_TASK_MIN_REWARD_COINS || rawReward > USER_TASK_MAX_REWARD_COINS) {
    return {
      error: `Reward per user must be between ${USER_TASK_MIN_REWARD_COINS.toLocaleString()} and ${USER_TASK_MAX_REWARD_COINS.toLocaleString()} coins.`,
    };
  }
  const rawSlots = Math.floor(Number(input.totalSlots) || 0);
  if (rawSlots < USER_TASK_MIN_SLOTS || rawSlots > USER_TASK_MAX_SLOTS) {
    return {
      error: `Total slots must be between ${USER_TASK_MIN_SLOTS.toLocaleString()} and ${USER_TASK_MAX_SLOTS.toLocaleString()} joins.`,
    };
  }

  const resolved = resolveTaskPricingConfig(pricing);
  const requireChannelCheck = Boolean(input.requireChannelCheck);
  const cost = calculatePaidTaskCost(rawReward, rawSlots, requireChannelCheck, resolved);
  const minRequiredCost =
    resolved.minBudgetCoins + (requireChannelCheck ? resolved.channelCheckFeeCoins : 0);
  if (
    profile.coins < minRequiredCost ||
    profile.coins < cost.totalCostCoins ||
    cost.totalCostCoins + rawReward < minRequiredCost
  ) {
    return {
      error: `Need at least ${Math.max(minRequiredCost, cost.totalCostCoins).toLocaleString()} coins to post this task (you have ${profile.coins.toLocaleString()}).`,
    };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins - cost.totalCostCoins,
  };

  const transaction: TransactionEntry = {
    id: `tx_pubtask_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: `Posted task: ${cleanTitle}`.slice(0, 80),
    amount: -cost.totalCostCoins,
    currency: 'coins',
    usdValue: coinsToUsd(cost.totalCostCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, cost };
}

export const USER_TASK_MIN_TOPUP_COINS = 500;

export interface PaidTaskTopUpPreview {
  additionalSlots: number;
  rewardCoins: number;
  rewardPoolCoins: number;
  platformFeeCoins: number;
  totalCostCoins: number;
  unspentCoins: number;
  valid: boolean;
  error?: string;
}

export function calculatePaidTaskTopUp(
  rewardCoins: number,
  budgetCoins: number,
  currentTotalSlots = 0,
): PaidTaskTopUpPreview {
  const safeReward = Math.max(USER_TASK_MIN_REWARD_COINS, Math.floor(Number(rewardCoins) || 0));
  const safeBudget = Math.max(0, Math.floor(Number(budgetCoins) || 0));
  const maxRemainingCapacity = Math.max(0, USER_TASK_MAX_SLOTS - Math.max(0, Math.floor(currentTotalSlots)));

  if (maxRemainingCapacity <= 0) {
    return {
      additionalSlots: 0,
      rewardCoins: safeReward,
      rewardPoolCoins: 0,
      platformFeeCoins: 0,
      totalCostCoins: 0,
      unspentCoins: safeBudget,
      valid: false,
      error: `Campaign already reached max ${USER_TASK_MAX_SLOTS.toLocaleString()} slots.`,
    };
  }

  if (safeBudget < USER_TASK_MIN_TOPUP_COINS) {
    return {
      additionalSlots: 0,
      rewardCoins: safeReward,
      rewardPoolCoins: 0,
      platformFeeCoins: 0,
      totalCostCoins: 0,
      unspentCoins: safeBudget,
      valid: false,
      error: `Minimum top-up is ${USER_TASK_MIN_TOPUP_COINS.toLocaleString()} coins.`,
    };
  }

  const computeTopUpRaw = (slots: number) => {
    const rewardPoolCoins = slots * safeReward;
    const platformFeeCoins = Math.round(rewardPoolCoins * USER_TASK_PLATFORM_FEE_RATE);
    return {
      rewardPoolCoins,
      platformFeeCoins,
      totalCostCoins: rewardPoolCoins + platformFeeCoins,
    };
  };

  let slots = Math.min(
    maxRemainingCapacity,
    Math.floor(safeBudget / Math.max(1, safeReward * (1 + USER_TASK_PLATFORM_FEE_RATE))) + 2,
  );
  while (slots > 0 && computeTopUpRaw(slots).totalCostCoins > safeBudget) {
    slots -= 1;
  }

  if (slots <= 0) {
    const minOne = computeTopUpRaw(1).totalCostCoins;
    return {
      additionalSlots: 0,
      rewardCoins: safeReward,
      rewardPoolCoins: 0,
      platformFeeCoins: 0,
      totalCostCoins: 0,
      unspentCoins: safeBudget,
      valid: false,
      error: `Need at least ${minOne.toLocaleString()} coins for +1 slot (${safeReward.toLocaleString()} + 10% fee).`,
    };
  }

  const finalized = computeTopUpRaw(slots);
  return {
    additionalSlots: slots,
    rewardCoins: safeReward,
    rewardPoolCoins: finalized.rewardPoolCoins,
    platformFeeCoins: finalized.platformFeeCoins,
    totalCostCoins: finalized.totalCostCoins,
    unspentCoins: Math.max(0, safeBudget - finalized.totalCostCoins),
    valid: true,
  };
}

export function createTopUpPaidTaskOrder(
  profile: UserFarmProfile,
  task: Pick<TaskDefinition, 'id' | 'title' | 'rewardCoins' | 'totalSlots' | 'creatorUid'>,
  budgetCoins: number,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      preview: PaidTaskTopUpPreview;
    }
  | { error: string } {
  if (task.creatorUid && task.creatorUid !== profile.uid) {
    return { error: 'Only the campaign owner can top up this task.' };
  }
  const preview = calculatePaidTaskTopUp(task.rewardCoins, budgetCoins, task.totalSlots ?? 0);
  if (!preview.valid) {
    return { error: preview.error || 'Invalid top-up budget.' };
  }
  if (profile.coins < preview.totalCostCoins) {
    return {
      error: `Need ${preview.totalCostCoins.toLocaleString()} coins (you have ${profile.coins.toLocaleString()}).`,
    };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins - preview.totalCostCoins,
  };
  const transaction: TransactionEntry = {
    id: `tx_topup_${nowMs}`,
    userId: profile.uid,
    type: 'task_topup',
    title: `Topped up +${preview.additionalSlots} slots: ${task.title}`.slice(0, 80),
    amount: -preview.totalCostCoins,
    currency: 'coins',
    usdValue: coinsToUsd(preview.totalCostCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };
  return { profile: nextProfile, transaction, preview };
}

export function calculateTaskRefundAmount(
  task: Pick<TaskDefinition, 'rewardCoins' | 'totalSlots' | 'claimedCount'>,
): { remainingSlots: number; refundCoins: number } {
  const totalSlots = Math.max(0, Math.floor(Number(task.totalSlots ?? 0) || 0));
  const claimedCount = Math.max(0, Math.floor(Number(task.claimedCount ?? 0) || 0));
  const remainingSlots = Math.max(0, totalSlots - claimedCount);
  const rewardCoins = Math.max(0, Math.floor(Number(task.rewardCoins ?? 0) || 0));
  return {
    remainingSlots,
    refundCoins: remainingSlots * rewardCoins,
  };
}

export function createRefundPaidTaskOrder(
  profile: UserFarmProfile,
  task: Pick<TaskDefinition, 'id' | 'title' | 'rewardCoins' | 'totalSlots' | 'claimedCount' | 'creatorUid'>,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      remainingSlots: number;
      refundCoins: number;
    }
  | { error: string } {
  if (task.creatorUid && task.creatorUid !== profile.uid) {
    return { error: 'Only the campaign owner can refund this task.' };
  }
  const { remainingSlots, refundCoins } = calculateTaskRefundAmount(task);
  if (remainingSlots <= 0 || refundCoins <= 0) {
    return { error: 'No unused reward slots left to refund on this campaign.' };
  }
  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + refundCoins,
  };
  const transaction: TransactionEntry = {
    id: `tx_refund_${nowMs}`,
    userId: profile.uid,
    type: 'task_refund',
    title: `Refund (${remainingSlots} unused slots): ${task.title}`.slice(0, 80),
    amount: refundCoins,
    currency: 'coins',
    usdValue: coinsToUsd(refundCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };
  return { profile: nextProfile, transaction, remainingSlots, refundCoins };
}

export function claimAdNetworkReward(
  profile: UserFarmProfile,
  network: AdNetworkId,
  todayStr: string,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      rewardCoins: number;
      networkName: string;
      watchedToday: number;
      dailyLimit: number;
    }
  | { error: string } {
  const def = AD_NETWORK_TASKS.find((n) => n.id === network);
  if (!def) {
    return { error: 'Unknown ad network.' };
  }

  const watchedToday = getAdNetworkClaimCountToday(profile.completedTaskIds, network, todayStr);
  if (watchedToday >= def.dailyLimit) {
    return { error: `${def.name} daily limit reached (${def.dailyLimit}/${def.dailyLimit} today). Come back tomorrow!` };
  }

  const nextSlot = watchedToday + 1;
  const claimToken = `ad_${network}_${todayStr}_${nextSlot}`;
  // Prune stale ad_ entries from earlier dates so completedTaskIds stays compact under the 50-item Firestore cap
  const prunedIds = profile.completedTaskIds.filter(
    (id) => !id.startsWith('ad_') || id.includes(`_${todayStr}_`),
  );
  const nextCompletedIds = [...prunedIds, claimToken].slice(-50);
  const nextTotalAdsWatched = getTotalAdsWatched(profile) + 1;
  const nextWithdrawAdsWatched = getWithdrawAdsWatched(profile) + 1;

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + def.rewardCoins,
    completedTaskIds: nextCompletedIds,
    totalAdsWatched: nextTotalAdsWatched,
    withdrawAdsWatched: nextWithdrawAdsWatched,
  };

  const transaction: TransactionEntry = {
    id: `tx_adnet_${network}_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: `${def.name} Watch & Earn`,
    amount: def.rewardCoins,
    currency: 'coins',
    usdValue: coinsToUsd(def.rewardCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    rewardCoins: def.rewardCoins,
    networkName: def.name,
    watchedToday: nextSlot,
    dailyLimit: def.dailyLimit,
  };
}

export function watchAdStep(
  profile: UserFarmProfile,
  nowMs: number,
): {
  profile: UserFarmProfile;
  transaction: TransactionEntry;
  rewardEggs: number;
  hitMilestone: boolean;
} {
  const nextCount = profile.watchedAdsCount + 1;
  const hitMilestone = nextCount >= 10;
  const rewardEggs = hitMilestone
    ? FREE_EGGS_PER_AD + FREE_EGGS_MILESTONE_BONUS
    : FREE_EGGS_PER_AD;
  const nextTotalAdsWatched = getTotalAdsWatched(profile) + 1;
  const usdAdded = eggsToUsd(rewardEggs);

  const nextProfile: UserFarmProfile = {
    ...profile,
    eggs: profile.eggs + rewardEggs,
    totalEggsCollected: profile.totalEggsCollected + rewardEggs,
    totalCashEarnedUsd: Number((profile.totalCashEarnedUsd + usdAdded).toFixed(4)),
    watchedAdsCount: hitMilestone ? 0 : nextCount,
    totalAdsWatched: nextTotalAdsWatched,
  };

  const transaction: TransactionEntry = {
    id: `tx_ad_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: hitMilestone
      ? '10/10 Ads: Free Eggs Bonus Chest!'
      : 'Watch & Earn: Free Eggs',
    amount: rewardEggs,
    currency: 'eggs',
    usdValue: usdAdded,
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, rewardEggs, hitMilestone };
}

export function claimAdsgramBotJoinReward(
  profile: UserFarmProfile,
  todayStr: string,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      rewardCoins: number;
      claimedToday: number;
      dailyLimit: number;
    }
  | { error: string } {
  const claimedToday = getBotJoinClaimCountToday(profile.completedTaskIds, todayStr);
  if (claimedToday >= ADSGRAM_BOT_JOIN_TASK.dailyLimit) {
    return {
      error: `Daily Bot Joins & Clicks limit reached (${ADSGRAM_BOT_JOIN_TASK.dailyLimit}/${ADSGRAM_BOT_JOIN_TASK.dailyLimit} today). Come back tomorrow!`,
    };
  }

  const nextSlot = claimedToday + 1;
  const claimToken = `botjoin_${todayStr}_${nextSlot}`;
  const prunedIds = profile.completedTaskIds.filter(
    (id) => !id.startsWith('botjoin_') || id.includes(`_${todayStr}_`),
  );
  const nextCompletedIds = [...prunedIds, claimToken].slice(-50);
  const nextTotalAdsWatched = getTotalAdsWatched(profile) + 1;
  const rewardCoins = ADSGRAM_BOT_JOIN_TASK.rewardCoins;

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + rewardCoins,
    completedTaskIds: nextCompletedIds,
    totalAdsWatched: nextTotalAdsWatched,
  };

  const transaction: TransactionEntry = {
    id: `tx_botjoin_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: 'AdsGram Bot Join & Clicks',
    amount: rewardCoins,
    currency: 'coins',
    usdValue: coinsToUsd(rewardCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    rewardCoins,
    claimedToday: nextSlot,
    dailyLimit: ADSGRAM_BOT_JOIN_TASK.dailyLimit,
  };
}

export function upgradeBasket(
  profile: UserFarmProfile,
  nowMs: number,
): { profile: UserFarmProfile; transaction: TransactionEntry } | { error: string } {
  const currentIdx = BASKET_TIERS.findIndex((t) => t.hours === profile.basketTierHours);
  const nextTier = BASKET_TIERS[currentIdx + 1];
  if (!nextTier) {
    return { error: 'Egg basket is already at maximum capacity (24 h).' };
  }
  if (profile.coins < nextTier.upgradeCost) {
    return { error: `Need ${nextTier.upgradeCost.toLocaleString()} coins to upgrade basket.` };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins - nextTier.upgradeCost,
    basketTierHours: nextTier.hours,
    basketCapacity: nextTier.capacity,
  };

  const transaction: TransactionEntry = {
    id: `tx_basket_${nowMs}`,
    userId: profile.uid,
    type: 'upgrade_basket',
    title: `Upgraded basket (${nextTier.hours} h)`,
    amount: -nextTier.upgradeCost,
    currency: 'coins',
    usdValue: coinsToUsd(nextTier.upgradeCost),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction };
}

const AVATAR_COLORS = ['#EF4444', '#10B981', '#0284C7', '#D97706', '#7C3AED', '#E11D48'];

export function getUnifiedUserId(uid: string): string {
  const numeric = extractTelegramNumericUserId(uid);
  return numeric || String(uid || '').trim();
}

export function createReferralCodeFromUid(uid: string): string {
  const unified = getUnifiedUserId(uid);
  if (unified) {
    return unified.slice(0, 32);
  }
  const cleaned = String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return cleaned || 'FARMER';
}

export function createDefaultProfile(
  uid: string,
  displayName: string,
  handle: string,
  nowMs: number,
  photoUrl = '',
): {
  profile: UserFarmProfile;
  transactions: TransactionEntry[];
  withdrawals: WithdrawalOrder[];
  deposits: DepositOrder[];
} {
  const colorIdx = uid.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % AVATAR_COLORS.length;
  const profile: UserFarmProfile = {
    uid,
    displayName: displayName || `Farmer ${uid.slice(-4).toUpperCase()}`,
    handle: handle || `@farmer_${uid.slice(-4).toLowerCase()}`,
    photoUrl: photoUrl.slice(0, 512),
    avatarColor: AVATAR_COLORS[colorIdx],
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
    withdrawAdsWatched: 0,
    coopFeverAdsWatched: 0,
    referralCode: createReferralCodeFromUid(uid),
    referredBy: '',
    referralActivated: false,
    referralCount: 0,
    referralCoinsEarned: 0,
    firstDepositBonusUsed: false,
    language: 'en',
    lastCollectedAt: nowMs,
    createdAtMs: nowMs,
    feedBoostUntilMs: 0,
    coopFeverUntilMs: 0,
    coopFeverBaselineAds: 0,
    autoHarvestUntilMs: 0,
    telegramRemindersEnabled: true,
    lastGoldenEggAtMs: 0,
    goldenEggsFound: 0,
    claimedAchievementIds: [],
    claimedReferralMilestones: [],
  };

  const transactions: TransactionEntry[] = [
    {
      id: `tx_welcome_${nowMs}`,
      userId: uid,
      type: 'task',
      title: 'Sign-Up Bonus (+1,000 coins)',
      amount: SIGNUP_BONUS_COINS,
      currency: 'coins',
      usdValue: 0.1,
      status: 'completed',
      createdAtMs: nowMs,
    },
  ];

  return { profile, transactions, withdrawals: [], deposits: [] };
}

export function buildLeaderboardRankings(
  entries: LeaderboardEntry[],
  currentUser: UserFarmProfile,
): {
  topBuyers: LeaderboardEntry[];
  topInviters: LeaderboardEntry[];
  topEggs: LeaderboardEntry[];
  userBuyerRank: number;
  userPercentile: number;
  pointsToTop10: number;
} {
  const userPoints = calculateBuyerPoints(currentUser);
  const userChickens = calculateTotalChickens(currentUser);

  const mergedMap = new Map<string, LeaderboardEntry>();
  for (const item of entries) {
    mergedMap.set(item.uid, { ...item, isCurrentUser: item.uid === currentUser.uid });
  }
  mergedMap.set(currentUser.uid, {
    uid: currentUser.uid,
    displayName: currentUser.displayName,
    handle: currentUser.handle,
    photoUrl: currentUser.photoUrl,
    avatarColor: currentUser.avatarColor,
    referralCode: currentUser.referralCode,
    buyerPoints: userPoints,
    inviterCount: currentUser.referralCount,
    eggs: currentUser.eggs,
    totalEggsCollected: currentUser.totalEggsCollected,
    chickensCount: userChickens,
    isCurrentUser: true,
  });

  const all = Array.from(mergedMap.values());
  const topBuyers = [...all].sort((a, b) => b.buyerPoints - a.buyerPoints || b.eggs - a.eggs).slice(0, 10);
  const topInviters = [...all].sort((a, b) => b.inviterCount - a.inviterCount || b.buyerPoints - a.buyerPoints).slice(0, 10);
  const topEggs = [...all].sort((a, b) => b.eggs - a.eggs || b.totalEggsCollected - a.totalEggsCollected).slice(0, 10);

  const sortedAllBuyers = [...all].sort((a, b) => b.buyerPoints - a.buyerPoints || b.eggs - a.eggs);
  const idx = sortedAllBuyers.findIndex((e) => e.uid === currentUser.uid);
  const userBuyerRank = idx === -1 ? sortedAllBuyers.length : idx + 1;
  const tenthPoints = topBuyers[9]?.buyerPoints ?? 0;
  const pointsToTop10 = topBuyers.length < 10 ? 0 : Math.max(0, tenthPoints + 1 - userPoints);
  const userPercentile = Math.max(1, Math.min(99, Math.round((userBuyerRank / Math.max(1, all.length)) * 100)));

  return {
    topBuyers,
    topInviters,
    topEggs,
    userBuyerRank,
    userPercentile,
    pointsToTop10,
  };
}

export function activateFeedBooster(
  profile: UserFarmProfile,
  nowMs: number,
): { profile: UserFarmProfile; transaction: TransactionEntry } | { error: string } {
  if (calculateTotalChickens(profile) <= 0) {
    return { error: 'Buy at least 1 chicken first to start mining before activating 2× Feed.' };
  }
  if (isFeedBoosterActive(profile, nowMs)) {
    return { error: '2× Laying Feed booster is already active on your farm!' };
  }
  if (profile.coins < FEED_BOOSTER_COST_COINS) {
    return {
      error: `Need ${FEED_BOOSTER_COST_COINS.toLocaleString()} coins for 2× Laying Feed.`,
    };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins - FEED_BOOSTER_COST_COINS,
    feedBoostUntilMs: nowMs + FEED_BOOSTER_DURATION_MS,
  };

  const transaction: TransactionEntry = {
    id: `tx_boost_${nowMs}`,
    userId: profile.uid,
    type: 'booster',
    title: '2× Laying Feed (1h Boost)',
    amount: -FEED_BOOSTER_COST_COINS,
    currency: 'coins',
    usdValue: coinsToUsd(FEED_BOOSTER_COST_COINS),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction };
}

export function activateCoopFever(
  profile: UserFarmProfile,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      durationMs: number;
      multiplier: number;
    }
  | { error: string } {
  if (calculateTotalChickens(profile) <= 0) {
    return { error: 'Buy at least 1 chicken in Packs before activating Coop Fever!' };
  }
  if (isCoopFeverActive(profile, nowMs)) {
    return { error: 'Coop Fever 3× Rush is already active on your farm!' };
  }
  const progress = getCoopFeverProgress(profile, nowMs);
  if (!progress.ready) {
    return {
      error: `Watch ${progress.adsRemaining} more 3× Fever ad${progress.adsRemaining === 1 ? '' : 's'} on the Farm tab to unlock Coop Fever 3× Rush (${progress.adsCollected}/${COOP_FEVER_REQUIRED_ADS}).`,
    };
  }

  const feverAds = getCoopFeverAdsWatched(profile);
  const rawBaseline = Math.max(0, Math.floor(Number(profile.coopFeverBaselineAds ?? 0) || 0));
  const nextBaseline = Math.min(feverAds, rawBaseline + COOP_FEVER_REQUIRED_ADS);

  const nextProfile: UserFarmProfile = {
    ...profile,
    coopFeverUntilMs: nowMs + COOP_FEVER_DURATION_MS,
    coopFeverBaselineAds: nextBaseline,
  };

  const transaction: TransactionEntry = {
    id: `tx_fever_${nowMs}`,
    userId: profile.uid,
    type: 'coop_fever',
    title: `Coop Fever ${COOP_FEVER_MULTIPLIER}× Rush (10m · 25 Ads)`,
    amount: 0,
    currency: 'coins',
    usdValue: 0,
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    durationMs: COOP_FEVER_DURATION_MS,
    multiplier: COOP_FEVER_MULTIPLIER,
  };
}

export interface AutoHarvestDroneTier {
  id: AutoHarvestDurationId;
  label: string;
  shortLabel: string;
  hours: number;
  durationMs: number;
  coinCost: number;
  eggCost: number;
  badge?: string;
}

export const AUTO_HARVEST_DRONE_TIERS: AutoHarvestDroneTier[] = [
  { id: '5h', label: '5 Hours', shortLabel: '5h', hours: 5, durationMs: 5 * 3_600_000, coinCost: 250, eggCost: 15_000 },
  { id: '10h', label: '10 Hours', shortLabel: '10h', hours: 10, durationMs: 10 * 3_600_000, coinCost: 450, eggCost: 27_000 },
  { id: '15h', label: '15 Hours', shortLabel: '15h', hours: 15, durationMs: 15 * 3_600_000, coinCost: 650, eggCost: 39_000 },
  { id: '20h', label: '20 Hours', shortLabel: '20h', hours: 20, durationMs: 20 * 3_600_000, coinCost: 850, eggCost: 50_000 },
  { id: '24h', label: '24 Hours', shortLabel: '24h', hours: 24, durationMs: 24 * 3_600_000, coinCost: 1_000, eggCost: 60_000, badge: 'Popular' },
  { id: '7d', label: '7 Days', shortLabel: '7d', hours: 168, durationMs: 7 * 24 * 3_600_000, coinCost: 5_500, eggCost: 330_000, badge: 'Best Value' },
];

export function isAutoHarvestDroneActive(
  profile: Partial<Pick<UserFarmProfile, 'autoHarvestUntilMs'>>,
  nowMs = Date.now(),
): boolean {
  return Number(profile.autoHarvestUntilMs ?? 0) > nowMs;
}

export function getAutoHarvestDroneTier(durationId: AutoHarvestDurationId): AutoHarvestDroneTier {
  const found = AUTO_HARVEST_DRONE_TIERS.find((t) => t.id === durationId);
  if (!found) {
    throw new Error(`Unknown Auto-Harvest Drone duration: ${durationId}`);
  }
  return found;
}

export function purchaseAutoHarvestDrone(
  profile: UserFarmProfile,
  durationId: AutoHarvestDurationId,
  currency: AutoHarvestCurrency,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      tier: AutoHarvestDroneTier;
      paidAmount: number;
    }
  | { error: string } {
  const tier = getAutoHarvestDroneTier(durationId);
  const cost = currency === 'eggs' ? tier.eggCost : tier.coinCost;
  const available = currency === 'eggs' ? profile.eggs : profile.coins;

  if (available < cost) {
    return {
      error: `Need ${cost.toLocaleString()} ${currency} for ${tier.label} Auto-Harvest Drone (you have ${Math.floor(available).toLocaleString()}).`,
    };
  }

  const baseUntil = Math.max(nowMs, Number(profile.autoHarvestUntilMs ?? 0));
  const nextUntil = baseUntil + tier.durationMs;

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: currency === 'coins' ? profile.coins - cost : profile.coins,
    eggs: currency === 'eggs' ? profile.eggs - cost : profile.eggs,
    autoHarvestUntilMs: nextUntil,
  };

  const transaction: TransactionEntry = {
    id: `tx_drone_${tier.id}_${nowMs}`,
    userId: profile.uid,
    type: 'auto_harvest',
    title: `Auto-Harvest Drone (${tier.shortLabel} · ${currency === 'eggs' ? 'Eggs' : 'Coins'})`,
    amount: -cost,
    currency,
    usdValue: currency === 'eggs' ? eggsToUsd(cost) : coinsToUsd(cost),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    tier,
    paidAmount: cost,
  };
}

export function applyAutoHarvestIfDue(
  profile: UserFarmProfile,
  nowMs: number,
): { profile: UserFarmProfile; autoHarvestedEggs: number } {
  const droneUntil = Number(profile.autoHarvestUntilMs ?? 0);
  const lastCollectedAt = Number(profile.lastCollectedAt ?? nowMs);
  if (droneUntil <= lastCollectedAt || nowMs <= lastCollectedAt) {
    return { profile, autoHarvestedEggs: 0 };
  }
  if (calculateTotalChickens(profile) <= 0) {
    return { profile, autoHarvestedEggs: 0 };
  }

  const windowEndMs = Math.min(nowMs, droneUntil);
  const activeElapsedMs = Math.max(0, windowEndMs - lastCollectedAt);
  if (activeElapsedMs <= 0) {
    return { profile, autoHarvestedEggs: 0 };
  }

  const ratePerHour = calculateProductionRate(profile, Math.min(nowMs, Math.max(lastCollectedAt, windowEndMs - 1)));
  if (ratePerHour <= 0) {
    return { profile, autoHarvestedEggs: 0 };
  }

  const elapsedHours = activeElapsedMs / 3_600_000;
  const harvestedEggs = Math.floor(ratePerHour * elapsedHours);
  if (harvestedEggs <= 0) {
    return { profile, autoHarvestedEggs: 0 };
  }

  // Advance lastCollectedAt by exact integer egg duration so sub-egg precision isn't lost
  const consumedMs = Math.min(activeElapsedMs, Math.floor((harvestedEggs / ratePerHour) * 3_600_000));
  const nextLastCollectedAt = lastCollectedAt + consumedMs;
  const usdAdded = eggsToUsd(harvestedEggs);
  const { level, xp } = addXp(profile.level, profile.xp, Math.max(1, Math.floor(harvestedEggs / 15)));

  const nextProfile: UserFarmProfile = {
    ...profile,
    eggs: profile.eggs + harvestedEggs,
    totalEggsCollected: profile.totalEggsCollected + harvestedEggs,
    totalCashEarnedUsd: Number((profile.totalCashEarnedUsd + usdAdded).toFixed(4)),
    level,
    xp,
    lastCollectedAt: nextLastCollectedAt,
  };

  return { profile: nextProfile, autoHarvestedEggs: harvestedEggs };
}

export function getGoldenEggCooldownRemainingMs(
  profile: Pick<UserFarmProfile, 'lastGoldenEggAtMs'>,
  nowMs: number,
): number {
  const last = Math.max(0, Number(profile.lastGoldenEggAtMs ?? 0) || 0);
  if (last <= 0) return 0;
  const elapsed = nowMs - last;
  if (elapsed < 0) return GOLDEN_EGG_COOLDOWN_MS;
  return Math.max(0, GOLDEN_EGG_COOLDOWN_MS - elapsed);
}

export function formatGoldenEggCooldownWait(remainingMs: number): string {
  const safeMs = Math.max(1000, remainingMs);
  const totalSecs = Math.ceil(safeMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m left`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s left`;
  }
  return `${secs}s left`;
}

export function isGoldenEggReady(
  profile: Pick<UserFarmProfile, 'lastGoldenEggAtMs'>,
  nowMs: number,
): boolean {
  return getGoldenEggCooldownRemainingMs(profile, nowMs) <= 0;
}

export function claimGoldenEggDrop(
  profile: UserFarmProfile,
  nowMs: number,
):
  | {
      profile: UserFarmProfile;
      transaction: TransactionEntry;
      bonusCoins: number;
      xpGained: number;
    }
  | { error: string; remainingMs?: number } {
  if (calculateTotalChickens(profile) <= 0) {
    return { error: 'Buy at least 1 chicken first to start mining!' };
  }
  const remainingMs = getGoldenEggCooldownRemainingMs(profile, nowMs);
  if (remainingMs > 0) {
    return {
      error: `Golden egg recharging (${formatGoldenEggCooldownWait(remainingMs)}).`,
      remainingMs,
    };
  }

  const { level, xp } = addXp(profile.level, profile.xp, GOLDEN_EGG_REWARD_XP);
  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + GOLDEN_EGG_REWARD_COINS,
    level,
    xp,
    lastGoldenEggAtMs: nowMs,
    goldenEggsFound: (profile.goldenEggsFound ?? 0) + 1,
  };

  const transaction: TransactionEntry = {
    id: `tx_gold_${nowMs}`,
    userId: profile.uid,
    type: 'golden_egg',
    title: 'Golden Egg Tap Drop',
    amount: GOLDEN_EGG_REWARD_COINS,
    currency: 'coins',
    usdValue: coinsToUsd(GOLDEN_EGG_REWARD_COINS),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    bonusCoins: GOLDEN_EGG_REWARD_COINS,
    xpGained: GOLDEN_EGG_REWARD_XP,
  };
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  rewardCoins: number;
  target: number;
  getCurrent: (profile: UserFarmProfile) => number;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first_harvest',
    title: 'First Harvest',
    description: 'Collect 100 total eggs',
    rewardCoins: 75,
    target: 100,
    getCurrent: (p) => p.totalEggsCollected,
  },
  {
    id: 'flock_5',
    title: 'Coop Builder',
    description: 'Own 5+ total chickens',
    rewardCoins: 150,
    target: 5,
    getCurrent: (p) => calculateTotalChickens(p),
  },
  {
    id: 'streak_3',
    title: 'Loyal Farmer',
    description: 'Reach a 3-day login streak',
    rewardCoins: 120,
    target: 3,
    getCurrent: (p) => p.dailyStreak,
  },
  {
    id: 'basket_pro',
    title: 'Bigger Basket',
    description: 'Upgrade basket to 12h+',
    rewardCoins: 250,
    target: 12,
    getCurrent: (p) => p.basketTierHours,
  },
  {
    id: 'friend_1',
    title: 'Farm Recruiter',
    description: 'Activate 1+ invited friend',
    rewardCoins: 200,
    target: 1,
    getCurrent: (p) => p.referralCount,
  },
  {
    id: 'egg_tycoon',
    title: 'Egg Tycoon',
    description: 'Collect 5,000 total eggs',
    rewardCoins: 500,
    target: 5000,
    getCurrent: (p) => p.totalEggsCollected,
  },
];

export interface AchievementStatus extends AchievementDefinition {
  current: number;
  unlocked: boolean;
  claimed: boolean;
}

export function getAchievementsProgress(profile: UserFarmProfile): AchievementStatus[] {
  const claimedSet = new Set(profile.claimedAchievementIds ?? []);
  return ACHIEVEMENT_DEFINITIONS.map((def) => {
    const current = Math.max(0, def.getCurrent(profile));
    return {
      ...def,
      current,
      unlocked: current >= def.target,
      claimed: claimedSet.has(def.id),
    };
  });
}

export function claimAchievement(
  profile: UserFarmProfile,
  achievementId: string,
  nowMs: number,
):
  | { profile: UserFarmProfile; transaction: TransactionEntry; rewardCoins: number; title: string }
  | { error: string } {
  const status = getAchievementsProgress(profile).find((a) => a.id === achievementId);
  if (!status) {
    return { error: 'Achievement not found.' };
  }
  if (!status.unlocked) {
    return { error: `Keep going — reach ${status.target.toLocaleString()} to unlock ${status.title}.` };
  }
  if (status.claimed) {
    return { error: `${status.title} reward was already claimed.` };
  }

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + status.rewardCoins,
    claimedAchievementIds: [...(profile.claimedAchievementIds ?? []), achievementId].slice(-50),
  };

  const transaction: TransactionEntry = {
    id: `tx_ach_${achievementId}_${nowMs}`.slice(0, 64),
    userId: profile.uid,
    type: 'achievement',
    title: `Achievement: ${status.title}`.slice(0, 80),
    amount: status.rewardCoins,
    currency: 'coins',
    usdValue: coinsToUsd(status.rewardCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, rewardCoins: status.rewardCoins, title: status.title };
}

export interface ReferralMilestoneCrate {
  targetActive: number;
  title: string;
  rewardCoins: number;
  bonusLeghorns: number;
}

export const REFERRAL_MILESTONE_CRATES: ReferralMilestoneCrate[] = [
  { targetActive: 3, title: 'Bronze Squad Crate', rewardCoins: 300, bonusLeghorns: 0 },
  { targetActive: 10, title: 'Silver Flock Crate', rewardCoins: 1200, bonusLeghorns: 1 },
  { targetActive: 25, title: 'Golden Tycoon Crate', rewardCoins: 3500, bonusLeghorns: 2 },
];

export function claimReferralMilestone(
  profile: UserFarmProfile,
  targetActive: number,
  activeReferralCount: number,
  nowMs: number,
):
  | { profile: UserFarmProfile; transaction: TransactionEntry; crate: ReferralMilestoneCrate }
  | { error: string } {
  const crate = REFERRAL_MILESTONE_CRATES.find((c) => c.targetActive === targetActive);
  if (!crate) {
    return { error: 'Referral milestone crate not found.' };
  }
  const effectiveActive = Math.max(profile.referralCount, activeReferralCount);
  if (effectiveActive < crate.targetActive) {
    return { error: `Invite ${crate.targetActive - effectiveActive} more active friends to unlock.` };
  }
  const claimed = profile.claimedReferralMilestones ?? [];
  if (claimed.includes(targetActive)) {
    return { error: `${crate.title} already claimed.` };
  }

  const hadNoChickens = calculateTotalChickens(profile) === 0;
  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: profile.coins + crate.rewardCoins,
    leghornCount: profile.leghornCount + crate.bonusLeghorns,
    lastCollectedAt: hadNoChickens && crate.bonusLeghorns > 0 ? nowMs : profile.lastCollectedAt,
    claimedReferralMilestones: [...claimed, targetActive].slice(-20),
  };

  const bonusHenText = crate.bonusLeghorns > 0 ? ` + ${crate.bonusLeghorns} Leghorn` : '';
  const transaction: TransactionEntry = {
    id: `tx_refcrate_${targetActive}_${nowMs}`,
    userId: profile.uid,
    type: 'referral',
    title: `${crate.title}${bonusHenText}`.slice(0, 80),
    amount: crate.rewardCoins,
    currency: 'coins',
    usdValue: coinsToUsd(crate.rewardCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return { profile: nextProfile, transaction, crate };
}

export interface DailyEarningsChartPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  eggsCollected: number;
  coinsEarned: number;
}

export function buildEarningsChartSeries(
  transactions: TransactionEntry[],
  nowMs = Date.now(),
  days = 7,
): DailyEarningsChartPoint[] {
  const safeDays = Math.max(1, Math.min(30, Math.floor(days)));
  const today = new Date(nowMs);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const buckets = new Map<string, DailyEarningsChartPoint>();
  const orderedKeys: string[] = [];

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const dayDate = new Date(todayStart);
    dayDate.setDate(todayStart.getDate() - offset);
    const dateKey = toLocalDateKey(dayDate.getTime());
    orderedKeys.push(dateKey);
    buckets.set(dateKey, {
      dateKey,
      label: dayDate.toLocaleDateString('en-US', { weekday: 'short' }),
      fullDate: dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      eggsCollected: 0,
      coinsEarned: 0,
    });
  }

  for (const tx of transactions) {
    if (!Number.isFinite(tx.createdAtMs) || tx.createdAtMs <= 0) continue;
    const key = toLocalDateKey(tx.createdAtMs);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (tx.currency === 'eggs' && tx.amount > 0) {
      bucket.eggsCollected += Math.floor(tx.amount);
    } else if (tx.currency === 'coins' && tx.amount > 0) {
      bucket.coinsEarned += Math.floor(tx.amount);
    }
  }

  return orderedKeys.map((k) => buckets.get(k)!);
}

export const SEASON_TOP10_PRIZE_WEIGHTS = [
  0.25,
  0.18,
  0.14,
  0.10,
  0.08,
  0.07,
  0.06,
  0.05,
  0.04,
  0.03,
] as const;

export function formatSeasonCountdown(endsAtMs: number, nowMs = Date.now()): string {
  const diffMs = Math.max(0, Math.floor(endsAtMs - nowMs));
  if (diffMs <= 0) {
    return 'Ended';
  }
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h left`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m left`;
  }
  return `${Math.max(1, mins)}m left`;
}

export function createDefaultSeasonConfig(nowMs = Date.now()): SeasonConfig {
  return {
    seasonNumber: 1,
    title: 'Harvest Cup Season 1',
    prizePoolCoins: 25000,
    endsAtMs: nowMs + 4 * 86_400_000,
    lastWinners: [],
    updatedAtMs: nowMs,
  };
}

const ADS_TOKEN_PREFIX = '__ads:';
const WITHDRAW_ADS_PREFIX = '__wad:';
const COOP_FEVER_UNTIL_PREFIX = '__cf_u:';
const COOP_FEVER_BASE_PREFIX = '__cf_b:';
const COOP_FEVER_ADS_PREFIX = '__cf_a:';
const AUTO_HARVEST_UNTIL_PREFIX = '__ah_u:';
const TG_REMINDERS_PREFIX = '__tgr:';
const REINVEST_DATE_PREFIX = '__reinv:';
const RESET_EPOCH_PREFIX = '__rst:';
const TASK_META_PREFIX = '__m:';
const TASK_SUBTITLE_MAX_LEN = 120;

export interface AchievementTokenExtras {
  withdrawAdsWatched?: number;
  coopFeverUntilMs?: number;
  coopFeverBaselineAds?: number;
  coopFeverAdsWatched?: number;
  autoHarvestUntilMs?: number;
  telegramRemindersEnabled?: boolean;
  lastReinvestDate?: string;
  resetEpochMs?: number;
}

function isInternalAchievementStateToken(id: string): boolean {
  return (
    id.startsWith(ADS_TOKEN_PREFIX) ||
    id.startsWith(WITHDRAW_ADS_PREFIX) ||
    id.startsWith(COOP_FEVER_UNTIL_PREFIX) ||
    id.startsWith(COOP_FEVER_BASE_PREFIX) ||
    id.startsWith(COOP_FEVER_ADS_PREFIX) ||
    id.startsWith(AUTO_HARVEST_UNTIL_PREFIX) ||
    id.startsWith(TG_REMINDERS_PREFIX) ||
    id.startsWith(REINVEST_DATE_PREFIX) ||
    id.startsWith(RESET_EPOCH_PREFIX)
  );
}

export function encodeAchievementsWithAds(
  claimedAchievementIds: string[] = [],
  totalAdsWatched = 0,
  extras: AchievementTokenExtras = {},
): string[] {
  const safeAds = Math.max(0, Math.floor(Number(totalAdsWatched) || 0));
  const cleanIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of claimedAchievementIds) {
    const id = String(raw || '').trim();
    if (!id || isInternalAchievementStateToken(id) || seen.has(id) || id.length > 64) {
      continue;
    }
    seen.add(id);
    cleanIds.push(id);
  }

  const stateTokens: string[] = [];
  if (safeAds > 0) {
    stateTokens.push(`${ADS_TOKEN_PREFIX}${safeAds}`);
  }
  if (typeof extras.withdrawAdsWatched === 'number' && Number.isFinite(extras.withdrawAdsWatched)) {
    const wad = Math.max(0, Math.floor(extras.withdrawAdsWatched));
    stateTokens.push(`${WITHDRAW_ADS_PREFIX}${wad}`);
  }
  const cfUntil = Math.max(0, Math.floor(Number(extras.coopFeverUntilMs ?? 0) || 0));
  if (cfUntil > 0) {
    stateTokens.push(`${COOP_FEVER_UNTIL_PREFIX}${cfUntil}`);
  }
  const cfBase = Math.max(0, Math.floor(Number(extras.coopFeverBaselineAds ?? 0) || 0));
  if (cfBase > 0) {
    stateTokens.push(`${COOP_FEVER_BASE_PREFIX}${cfBase}`);
  }
  const cfAds = Math.max(0, Math.floor(Number(extras.coopFeverAdsWatched ?? 0) || 0));
  if (cfAds > 0) {
    stateTokens.push(`${COOP_FEVER_ADS_PREFIX}${cfAds}`);
  }
  const ahUntil = Math.max(0, Math.floor(Number(extras.autoHarvestUntilMs ?? 0) || 0));
  if (ahUntil > 0) {
    stateTokens.push(`${AUTO_HARVEST_UNTIL_PREFIX}${ahUntil}`);
  }
  if (extras.telegramRemindersEnabled === false) {
    stateTokens.push(`${TG_REMINDERS_PREFIX}0`);
  }
  const cleanReinvDate = String(extras.lastReinvestDate || '').trim().slice(0, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanReinvDate)) {
    stateTokens.push(`${REINVEST_DATE_PREFIX}${cleanReinvDate}`);
  }
  const rstEpoch = Math.max(0, Math.floor(Number(extras.resetEpochMs ?? 0) || 0));
  if (rstEpoch > 0) {
    stateTokens.push(`${RESET_EPOCH_PREFIX}${rstEpoch}`);
  }

  const maxRealIds = Math.max(0, 50 - stateTokens.length);
  return [...cleanIds.slice(-maxRealIds), ...stateTokens];
}

export function decodeAchievementsAndAds(
  rawClaimedIds: unknown,
  explicitTotalAds?: unknown,
  fallbackWatchedAdsCount?: unknown,
  explicitExtras: AchievementTokenExtras = {},
): {
  claimedAchievementIds: string[];
  totalAdsWatched: number;
  withdrawAdsWatched: number;
  coopFeverUntilMs: number;
  coopFeverBaselineAds: number;
  coopFeverAdsWatched: number;
  autoHarvestUntilMs: number;
  telegramRemindersEnabled: boolean;
  lastReinvestDate: string;
  resetEpochMs: number;
} {
  const arr = Array.isArray(rawClaimedIds) ? rawClaimedIds : [];
  const cleanIds: string[] = [];
  const seen = new Set<string>();
  let tokenAds = 0;
  let tokenWad = 0;
  let hasTokenWad = false;
  let tokenCfUntil = 0;
  let tokenCfBase = 0;
  let tokenCfAds = 0;
  let tokenAhUntil = 0;
  let tokenTgReminders: boolean | undefined = undefined;
  let tokenReinvDate = '';
  let tokenResetEpoch = 0;

  for (const item of arr) {
    const str = String(item || '').trim();
    if (!str) continue;
    if (str.startsWith(ADS_TOKEN_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(ADS_TOKEN_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed > tokenAds) {
        tokenAds = parsed;
      }
      continue;
    }
    if (str.startsWith(WITHDRAW_ADS_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(WITHDRAW_ADS_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed >= 0) {
        hasTokenWad = true;
        if (parsed > tokenWad) {
          tokenWad = parsed;
        }
      }
      continue;
    }
    if (str.startsWith(COOP_FEVER_UNTIL_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(COOP_FEVER_UNTIL_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed > tokenCfUntil) {
        tokenCfUntil = parsed;
      }
      continue;
    }
    if (str.startsWith(COOP_FEVER_BASE_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(COOP_FEVER_BASE_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed > tokenCfBase) {
        tokenCfBase = parsed;
      }
      continue;
    }
    if (str.startsWith(COOP_FEVER_ADS_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(COOP_FEVER_ADS_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed > tokenCfAds) {
        tokenCfAds = parsed;
      }
      continue;
    }
    if (str.startsWith(AUTO_HARVEST_UNTIL_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(AUTO_HARVEST_UNTIL_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed > tokenAhUntil) {
        tokenAhUntil = parsed;
      }
      continue;
    }
    if (str.startsWith(TG_REMINDERS_PREFIX)) {
      tokenTgReminders = str.slice(TG_REMINDERS_PREFIX.length) !== '0';
      continue;
    }
    if (str.startsWith(REINVEST_DATE_PREFIX)) {
      const d = str.slice(REINVEST_DATE_PREFIX.length).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > tokenReinvDate) {
        tokenReinvDate = d;
      }
      continue;
    }
    if (str.startsWith(RESET_EPOCH_PREFIX)) {
      const parsed = Math.floor(Number(str.slice(RESET_EPOCH_PREFIX.length)));
      if (Number.isFinite(parsed) && parsed > tokenResetEpoch) {
        tokenResetEpoch = parsed;
      }
      continue;
    }
    if (!seen.has(str)) {
      seen.add(str);
      cleanIds.push(str);
    }
  }

  const explicitNum = Math.max(0, Math.floor(Number(explicitTotalAds ?? 0) || 0));
  const fallbackNum = Math.max(0, Math.floor(Number(fallbackWatchedAdsCount ?? 0) || 0));
  const explicitWad = Math.max(0, Math.floor(Number(explicitExtras.withdrawAdsWatched ?? 0) || 0));
  const explicitCfUntil = Math.max(0, Math.floor(Number(explicitExtras.coopFeverUntilMs ?? 0) || 0));
  const explicitCfBase = Math.max(0, Math.floor(Number(explicitExtras.coopFeverBaselineAds ?? 0) || 0));
  const explicitCfAds = Math.max(0, Math.floor(Number(explicitExtras.coopFeverAdsWatched ?? 0) || 0));
  const explicitAhUntil = Math.max(0, Math.floor(Number(explicitExtras.autoHarvestUntilMs ?? 0) || 0));
  const explicitReinvDate = String(explicitExtras.lastReinvestDate || '').trim();
  const explicitResetEpoch = Math.max(0, Math.floor(Number(explicitExtras.resetEpochMs ?? 0) || 0));

  return {
    claimedAchievementIds: cleanIds,
    totalAdsWatched: Math.max(tokenAds, explicitNum, fallbackNum),
    withdrawAdsWatched: hasTokenWad ? tokenWad : explicitWad,
    coopFeverUntilMs: Math.max(tokenCfUntil, explicitCfUntil),
    coopFeverBaselineAds: Math.max(tokenCfBase, explicitCfBase),
    coopFeverAdsWatched: Math.max(tokenCfAds, explicitCfAds),
    autoHarvestUntilMs: Math.max(tokenAhUntil, explicitAhUntil),
    telegramRemindersEnabled:
      explicitExtras.telegramRemindersEnabled !== undefined
        ? Boolean(explicitExtras.telegramRemindersEnabled)
        : (tokenTgReminders ?? true),
    lastReinvestDate:
      explicitReinvDate > tokenReinvDate ? explicitReinvDate : tokenReinvDate,
    resetEpochMs: Math.max(tokenResetEpoch, explicitResetEpoch),
  };
}

export interface TaskSubtitleMetaInput {
  subtitle?: string;
  totalSlots?: number;
  claimedCount?: number;
  creatorUid?: string;
  paidCoins?: number;
  requireChannelCheck?: boolean;
}

export interface DecodedTaskSubtitleMeta {
  subtitle?: string;
  totalSlots?: number;
  claimedCount?: number;
  creatorUid?: string;
  paidCoins?: number;
  requireChannelCheck?: boolean;
}

export function encodeTaskSubtitleMeta(input: TaskSubtitleMetaInput): string | undefined {
  const cleanSub = (input.subtitle || '').replace(/\n?__m:[^\n]*/g, '').trim();
  const totalSlots = Math.max(0, Math.floor(Number(input.totalSlots ?? 0) || 0));
  const claimedCount = Math.max(0, Math.floor(Number(input.claimedCount ?? 0) || 0));
  const creatorUid = (input.creatorUid || '').replace(/[:\n\r]/g, '').trim();
  const paidCoins = Math.max(0, Math.floor(Number(input.paidCoins ?? 0) || 0));
  const requireChannelCheck = Boolean(input.requireChannelCheck);

  const hasMeta =
    totalSlots > 0 || Boolean(creatorUid) || paidCoins > 0 || requireChannelCheck;
  if (!hasMeta) {
    return cleanSub ? cleanSub.slice(0, TASK_SUBTITLE_MAX_LEN) : undefined;
  }

  const suffix = requireChannelCheck
    ? `${TASK_META_PREFIX}${totalSlots}:${claimedCount}:${creatorUid}:${paidCoins}:1`
    : creatorUid || paidCoins > 0
      ? `${TASK_META_PREFIX}${totalSlots}:${claimedCount}:${creatorUid}:${paidCoins}`
      : `${TASK_META_PREFIX}${totalSlots}:${claimedCount}`;

  if (suffix.length >= TASK_SUBTITLE_MAX_LEN) {
    const compact = requireChannelCheck
      ? `${TASK_META_PREFIX}${totalSlots}:${claimedCount}:${creatorUid.slice(0, 60)}:${paidCoins}:1`
      : `${TASK_META_PREFIX}${totalSlots}:${claimedCount}:${creatorUid.slice(0, 64)}`;
    return compact.slice(0, TASK_SUBTITLE_MAX_LEN);
  }

  if (!cleanSub) {
    return suffix;
  }

  const available = TASK_SUBTITLE_MAX_LEN - suffix.length - 1;
  if (available <= 0) {
    return suffix;
  }
  return `${cleanSub.slice(0, available).trimEnd()}\n${suffix}`;
}

export function decodeTaskSubtitleMeta(rawSubtitle?: string): DecodedTaskSubtitleMeta {
  const raw = (rawSubtitle || '').trim();
  if (!raw) return {};

  const match = raw.match(
    /(?:^|\n)__m:(\d+):(\d+)(?::([^:\n]*))?(?::(\d+))?(?::([01]))?\s*$/,
  );
  if (!match) {
    return { subtitle: raw };
  }

  const cleanSub = raw.slice(0, match.index).trim();
  const totalSlots = Math.max(0, Math.floor(Number(match[1]) || 0));
  const claimedCount = Math.max(0, Math.floor(Number(match[2]) || 0));
  const creatorUid = match[3] ? match[3].trim() : undefined;
  const paidCoins =
    match[4] !== undefined ? Math.max(0, Math.floor(Number(match[4]) || 0)) : undefined;
  const requireChannelCheck = match[5] === '1';

  return {
    ...(cleanSub ? { subtitle: cleanSub } : {}),
    ...(totalSlots > 0 ? { totalSlots } : {}),
    claimedCount,
    ...(creatorUid ? { creatorUid } : {}),
    ...(paidCoins !== undefined && paidCoins > 0 ? { paidCoins } : {}),
    ...(requireChannelCheck ? { requireChannelCheck: true } : {}),
  };
}

const PROMO_LABEL_MAX_LEN = 60;
const PROMO_REWARD_REGEX = /(?:^|\n)__r:(?:(e):(\d+)(?::(\d+))?|(c):(leghorn|rhode|orpington|australorp):(\d+)(?::(\d+))?)\s*$/;
const GIFT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface PromoRewardMetaInput {
  label?: string;
  rewardType?: PromoRewardType;
  coins?: number;
  eggs?: number;
  chickenBreed?: ChickenBreedId;
  chickenQty?: number;
}

export interface DecodedPromoRewardMeta {
  label: string;
  rewardType: PromoRewardType;
  coins: number;
  eggs: number;
  chickenBreed?: ChickenBreedId;
  chickenQty: number;
}

export function generateGiftCodeString(prefix = 'GIFT'): string {
  const cleanPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 12) || 'GIFT';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * GIFT_CODE_ALPHABET.length);
    suffix += GIFT_CODE_ALPHABET[idx];
  }
  return `${cleanPrefix}-${suffix}`.slice(0, 32);
}

export function encodePromoLabelMeta(input: PromoRewardMetaInput): {
  encodedLabel: string;
  firestoreCoins: number;
} {
  const cleanLabel = (input.label || '')
    .replace(/\n?__r:[^\n]*/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const rewardType: PromoRewardType = input.rewardType || 'coins';

  if (rewardType === 'eggs') {
    const safeEggs = Math.max(1, Math.min(10_000_000, Math.round(Number(input.eggs) || 100)));
    const bonusCoins = Math.max(0, Math.min(1_000_000, Math.round(Number(input.coins) || 0)));
    const marker = bonusCoins > 0 ? `__r:e:${safeEggs}:${bonusCoins}` : `__r:e:${safeEggs}`;
    const firestoreCoins = bonusCoins > 0 ? bonusCoins : 1;
    const baseLabel = cleanLabel || 'Egg Gift Drop';
    const available = PROMO_LABEL_MAX_LEN - marker.length - 1;
    const encodedLabel =
      available >= 3
        ? `${baseLabel.slice(0, available).trimEnd()}\n${marker}`
        : marker.slice(0, PROMO_LABEL_MAX_LEN);
    return { encodedLabel, firestoreCoins };
  }

  if (rewardType === 'chicken') {
    const breed: ChickenBreedId =
      input.chickenBreed && CHICKEN_PACKS.some((p) => p.id === input.chickenBreed)
        ? input.chickenBreed
        : 'leghorn';
    const safeQty = Math.max(1, Math.min(100, Math.round(Number(input.chickenQty) || 1)));
    const bonusCoins = Math.max(0, Math.min(1_000_000, Math.round(Number(input.coins) || 0)));
    const marker =
      bonusCoins > 0 ? `__r:c:${breed}:${safeQty}:${bonusCoins}` : `__r:c:${breed}:${safeQty}`;
    const firestoreCoins = bonusCoins > 0 ? bonusCoins : 1;
    const baseLabel = cleanLabel || 'Hen Gift Drop';
    const available = PROMO_LABEL_MAX_LEN - marker.length - 1;
    const encodedLabel =
      available >= 3
        ? `${baseLabel.slice(0, available).trimEnd()}\n${marker}`
        : marker.slice(0, PROMO_LABEL_MAX_LEN);
    return { encodedLabel, firestoreCoins };
  }

  const safeCoins = Math.max(1, Math.min(1_000_000, Math.round(Number(input.coins) || 100)));
  return {
    encodedLabel: (cleanLabel || 'Gift Drop').slice(0, PROMO_LABEL_MAX_LEN),
    firestoreCoins: safeCoins,
  };
}

export function decodePromoLabelMeta(rawLabel: string, rawCoins: number): DecodedPromoRewardMeta {
  const raw = String(rawLabel || '').trim();
  const safeRawCoins = Math.max(0, Math.round(Number(rawCoins) || 0));
  const match = raw.match(PROMO_REWARD_REGEX);

  if (!match) {
    return {
      label: raw || 'Gift Drop',
      rewardType: 'coins',
      coins: Math.max(1, safeRawCoins),
      eggs: 0,
      chickenQty: 0,
    };
  }

  const cleanLabel = raw.slice(0, match.index).trim();
  if (match[1] === 'e') {
    const eggs = Math.max(1, Math.round(Number(match[2]) || 0));
    const bonusCoins = match[3] ? Math.max(0, Math.round(Number(match[3]) || 0)) : 0;
    return {
      label: cleanLabel || 'Egg Gift Drop',
      rewardType: 'eggs',
      coins: bonusCoins,
      eggs,
      chickenQty: 0,
    };
  }

  const chickenBreed = (match[5] || 'leghorn') as ChickenBreedId;
  const chickenQty = Math.max(1, Math.round(Number(match[6]) || 1));
  const bonusCoins = match[7] ? Math.max(0, Math.round(Number(match[7]) || 0)) : 0;
  return {
    label: cleanLabel || 'Hen Gift Drop',
    rewardType: 'chicken',
    coins: bonusCoins,
    eggs: 0,
    chickenBreed,
    chickenQty,
  };
}

export function formatPromoRewardSummary(input: {
  rewardType?: PromoRewardType;
  coins?: number;
  eggs?: number;
  chickenBreed?: ChickenBreedId;
  chickenQty?: number;
}): string {
  const rewardType = input.rewardType || 'coins';
  const coins = Math.max(0, Math.round(Number(input.coins) || 0));
  const eggs = Math.max(0, Math.round(Number(input.eggs) || 0));
  const qty = Math.max(0, Math.round(Number(input.chickenQty) || 0));

  if (rewardType === 'eggs' && eggs > 0) {
    const parts = [`+${eggs.toLocaleString()} eggs`];
    if (coins > 0) parts.push(`+${coins.toLocaleString()} coins`);
    return parts.join(' & ');
  }

  if (rewardType === 'chicken' && qty > 0 && input.chickenBreed) {
    const packName = CHICKEN_PACKS.find((p) => p.id === input.chickenBreed)?.name || 'Chicken';
    const parts = [`+${qty} ${packName}`];
    if (coins > 0) parts.push(`+${coins.toLocaleString()} coins`);
    return parts.join(' & ');
  }

  return `+${Math.max(1, coins).toLocaleString()} coins`;
}

export const PRIMARY_ADMIN_TELEGRAM_ID = '7508911853';
export const ADMIN_TELEGRAM_NUMERIC_IDS: readonly string[] = [PRIMARY_ADMIN_TELEGRAM_ID];

export function isAdminPlayerId(
  playerId: unknown,
  extraAdminIds: readonly string[] = [],
): boolean {
  const raw = String(playerId || '').trim();
  if (!raw) return false;
  const numeric = extractTelegramNumericUserId(raw);
  const allowed = new Set<string>(ADMIN_TELEGRAM_NUMERIC_IDS);
  for (const extra of extraAdminIds) {
    const cleanExtra = String(extra || '').trim();
    if (!cleanExtra) continue;
    const extraNum = extractTelegramNumericUserId(cleanExtra);
    allowed.add(extraNum || cleanExtra);
  }
  if (numeric && allowed.has(numeric)) return true;
  return allowed.has(raw);
}

export const REQUIRED_TELEGRAM_CHANNELS: RequiredTelegramChannel[] = [
  {
    id: 'airdrop_galaxys',
    handle: '@AIRDROP_GALAXYS',
    title: 'Alpha Gram News & Drops',
    description: 'Daily gift codes, announcements & community events',
    url: 'https://t.me/AIRDROP_GALAXYS',
    enabled: true,
  },
  {
    id: 'ag_payouts',
    handle: '@AG_PAYOUTS',
    title: 'Alpha Gram Payout Proofs',
    description: 'Live verified TON / GRAM withdrawal proofs',
    url: 'https://t.me/AG_PAYOUTS',
    enabled: true,
  },
];

export const DEFAULT_GET_CODE_CHANNEL_URL = 'https://t.me/AIRDROP_GALAXYS';

export const DEFAULT_CHANNELS_CONFIG: ChannelsConfig = {
  enabled: true,
  channels: REQUIRED_TELEGRAM_CHANNELS,
  getCodeChannelUrl: DEFAULT_GET_CODE_CHANNEL_URL,
  updatedAtMs: 0,
};

export function normalizeGetCodeChannelUrl(rawInput: string): string {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\/\S+/i.test(trimmed)) {
    return trimmed.slice(0, 256);
  }
  const normalized = normalizeTelegramChannelHandle(trimmed);
  if (normalized.url) {
    return normalized.url.slice(0, 256);
  }
  return '';
}

export function normalizeTelegramChannelHandle(rawHandleOrUrl: string): {
  handle: string;
  url: string;
} {
  const trimmed = String(rawHandleOrUrl || '').trim();
  if (!trimmed) {
    return { handle: '', url: '' };
  }

  // Handle private channel message link: https://t.me/c/1234567890/5 -> -1001234567890
  const privateMsgMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/c\/(\d{5,20})(?:\/\d+)?/i,
  );
  if (privateMsgMatch) {
    return {
      handle: `-100${privateMsgMatch[1]}`,
      url: '',
    };
  }

  // Detect private invite links (t.me/+... or t.me/joinchat/...) — cannot be used directly as @chat_id
  const inviteMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(\+[a-zA-Z0-9_-]+|joinchat\/[a-zA-Z0-9_-]+)/i,
  );
  if (inviteMatch) {
    return {
      handle: '',
      url: `https://t.me/${inviteMatch[1]}`,
    };
  }

  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{3,64})/i,
  );
  if (urlMatch) {
    const slug = urlMatch[1];
    return {
      handle: `@${slug}`,
      url: `https://t.me/${slug}`,
    };
  }
  if (/^-?\d{5,20}$/.test(trimmed)) {
    return {
      handle: trimmed,
      url: '',
    };
  }
  const cleanHandle = trimmed.replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleanHandle) {
    return { handle: '', url: '' };
  }
  return {
    handle: `@${cleanHandle}`,
    url: `https://t.me/${cleanHandle}`,
  };
}

export function normalizeTelegramChannelEntry(
  input: Partial<RequiredTelegramChannel> & { handle?: string; url?: string },
  index = 0,
): RequiredTelegramChannel | null {
  const normalized = normalizeTelegramChannelHandle(input.handle || input.url || '');
  const handle = normalized.handle;
  if (!handle || handle.length < 2) return null;

  const rawUrl = String(input.url || '').trim();
  const safeUrl =
    rawUrl && /^https?:\/\//i.test(rawUrl)
      ? rawUrl.slice(0, 256)
      : normalized.url || 'https://t.me/';

  const baseId =
    String(input.id || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_') ||
    handle
      .replace(/^@/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_') ||
    `ch_${index + 1}`;

  return {
    id: baseId.slice(0, 48),
    handle: handle.slice(0, 64),
    title: (String(input.title || '').trim() || handle).slice(0, 60),
    description: (String(input.description || '').trim() || 'Join official Telegram channel').slice(0, 140),
    url: safeUrl,
    enabled: input.enabled !== false,
  };
}

export function getActiveRequiredChannels(
  config?: ChannelsConfig | null,
): RequiredTelegramChannel[] {
  if (config && config.enabled === false) {
    return [];
  }
  const source = config?.channels ?? REQUIRED_TELEGRAM_CHANNELS;
  return source
    .filter((ch) => ch && ch.enabled !== false && Boolean(ch.handle))
    .slice(0, 10);
}

export function formatChannelsHandleSummary(
  channels: ReadonlyArray<Pick<RequiredTelegramChannel, 'handle'>>,
): string {
  const handles = channels.map((c) => c.handle).filter(Boolean);
  if (handles.length === 0) return 'Required channels';
  if (handles.length === 1) return handles[0];
  if (handles.length === 2) return `${handles[0]} & ${handles[1]}`;
  return `${handles.slice(0, -1).join(', ')} & ${handles[handles.length - 1]}`;
}

export function extractTelegramNumericUserId(rawPlayerOrUserId: unknown): string | null {
  const s = String(rawPlayerOrUserId || '').trim();
  if (!s) return null;
  const tgMatch = s.match(/^(?:tg_)?(\d{4,20})$/);
  return tgMatch ? tgMatch[1] : null;
}

export function isTelegramMemberStatusJoined(status: unknown, isMemberFlag?: unknown): boolean {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'member' || s === 'administrator' || s === 'creator') {
    return true;
  }
  if (s === 'restricted' && isMemberFlag === true) {
    return true;
  }
  return false;
}

export const AD_GATED_ACTIONS: readonly AdGateActionType[] = [
  'startup',
  'collect_eggs',
  'claim_promo',
  'buy_chicken',
  'ad_network',
  'watch_ad',
  'adsgram_task',
];

export const AD_EXEMPT_ACTIONS: readonly AdGateActionType[] = [
  'task',
  'withdraw',
  'deposit',
];

export function shouldRequireAdForAction(action: AdGateActionType): boolean {
  return AD_GATED_ACTIONS.includes(action);
}

export function recordCompletedGateAd(profile: UserFarmProfile): UserFarmProfile {
  return {
    ...profile,
    totalAdsWatched: getTotalAdsWatched(profile) + 1,
  };
}

export function recordCoopFeverAd(profile: UserFarmProfile): UserFarmProfile {
  return {
    ...profile,
    coopFeverAdsWatched: getCoopFeverAdsWatched(profile) + 1,
    totalAdsWatched: getTotalAdsWatched(profile) + 1,
  };
}

export type AdConfigDraft = Omit<AdConfig, 'updatedAtMs'>;

export function formatAdConfigTemplate(config: AdConfigDraft): string {
  return [
    `ACTIVE_PROVIDER=${config.provider}`,
    `ADSGRAM_BLOCK_ID=${config.adsgramBlockId}`,
    `ADSGRAM_TASK_BLOCK_ID=${config.adsgramTaskBlockId || ''}`,
    `GIGAPUB_PROJECT_ID=${config.gigapubProjectId || ''}`,
    `MONETAG_ZONE_ID=${config.monetagZoneId}`,
    `WATCH_SECONDS=${config.watchSeconds}`,
    `CUSTOM_TITLE=${config.customTitle}`,
    `CUSTOM_DESCRIPTION=${config.customDescription}`,
    `CUSTOM_URL=${config.customUrl}`,
    `BANNER_ENABLED=${config.bannerEnabled ? 'true' : 'false'}`,
    `BANNER_TITLE=${config.bannerTitle}`,
    `BANNER_SUBTITLE=${config.bannerSubtitle}`,
    `BANNER_CTA=${config.bannerCtaText}`,
    `BANNER_URL=${config.bannerUrl}`,
  ].join('\n');
}

export function parseAdConfigTemplate(
  rawTemplate: string,
  current: AdConfigDraft,
): { next: AdConfigDraft; appliedKeys: string[] } {
  const trimmed = rawTemplate.trim();
  const next: AdConfigDraft = { ...current };
  const applied = new Set<string>();

  if (!trimmed) {
    return { next, appliedKeys: [] };
  }

  const applyEntry = (rawKey: string, rawValue: unknown) => {
    const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const val = String(rawValue ?? '').trim().replace(/^["']|["']$/g, '');

    if (
      key === 'activeprovider' ||
      key === 'provider' ||
      key === 'adprovider'
    ) {
      const normalized = val.toLowerCase();
      if (
        normalized === 'countdown' ||
        normalized === 'adsgram' ||
        normalized === 'gigapub' ||
        normalized === 'monetag' ||
        normalized === 'custom_sponsor' ||
        normalized === 'customsponsor'
      ) {
        next.provider =
          normalized === 'customsponsor' ? 'custom_sponsor' : normalized;
        applied.add('ACTIVE_PROVIDER');
      }
      return;
    }

    if (key === 'adsgramblockid' || key === 'viteadsgramblockid' || key === 'adsgramid') {
      next.adsgramBlockId = val.slice(0, 64);
      applied.add('ADSGRAM_BLOCK_ID');
      return;
    }

    if (
      key === 'adsgramtaskblockid' ||
      key === 'viteadsgramtaskblockid' ||
      key === 'adsgramtaskid' ||
      key === 'adsgrambotjoinid'
    ) {
      next.adsgramTaskBlockId = val.slice(0, 64);
      applied.add('ADSGRAM_TASK_BLOCK_ID');
      return;
    }

    if (
      key === 'gigapubprojectid' ||
      key === 'vitegigapubprojectid' ||
      key === 'gigapubid'
    ) {
      next.gigapubProjectId = val.slice(0, 64);
      applied.add('GIGAPUB_PROJECT_ID');
      return;
    }

    if (key === 'monetagzoneid' || key === 'vitemonetagzoneid' || key === 'monetagid') {
      next.monetagZoneId = val.slice(0, 64);
      applied.add('MONETAG_ZONE_ID');
      return;
    }

    if (key === 'watchseconds' || key === 'watchtimer') {
      const parsed = Number(val);
      if (Number.isFinite(parsed) && parsed > 0) {
        next.watchSeconds = Math.max(3, Math.min(60, Math.round(parsed)));
        applied.add('WATCH_SECONDS');
      }
      return;
    }

    if (key === 'customtitle' || key === 'adtitle') {
      if (val) {
        next.customTitle = val.slice(0, 80);
        applied.add('CUSTOM_TITLE');
      }
      return;
    }

    if (key === 'customdescription' || key === 'customdesc' || key === 'addescription') {
      next.customDescription = val.slice(0, 200);
      applied.add('CUSTOM_DESCRIPTION');
      return;
    }

    if (key === 'customurl' || key === 'adurl' || key === 'sponsorurl') {
      next.customUrl = val.slice(0, 256);
      applied.add('CUSTOM_URL');
      return;
    }

    if (key === 'bannerenabled') {
      const low = val.toLowerCase();
      if (low === 'true' || low === '1' || low === 'yes' || low === 'on') {
        next.bannerEnabled = true;
        applied.add('BANNER_ENABLED');
      } else if (low === 'false' || low === '0' || low === 'no' || low === 'off') {
        next.bannerEnabled = false;
        applied.add('BANNER_ENABLED');
      }
      return;
    }

    if (key === 'bannertitle') {
      if (val) {
        next.bannerTitle = val.slice(0, 80);
        applied.add('BANNER_TITLE');
      }
      return;
    }

    if (key === 'bannersubtitle') {
      next.bannerSubtitle = val.slice(0, 160);
      applied.add('BANNER_SUBTITLE');
      return;
    }

    if (key === 'bannercta' || key === 'bannerctatext') {
      if (val) {
        next.bannerCtaText = val.slice(0, 24);
        applied.add('BANNER_CTA');
      }
      return;
    }

    if (key === 'bannerurl') {
      next.bannerUrl = val.slice(0, 256);
      applied.add('BANNER_URL');
    }
  };

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          applyEntry(k, v);
        }
        return { next, appliedKeys: Array.from(applied) };
      }
    } catch {
      // Fallback to KEY=VALUE parsing
    }
  }

  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const eqIdx = line.indexOf('=');
    const colonIdx = line.indexOf(':');
    const sepIdx =
      eqIdx > 0 && (colonIdx === -1 || eqIdx < colonIdx)
        ? eqIdx
        : colonIdx > 0
          ? colonIdx
          : -1;
    if (sepIdx <= 0) continue;
    const key = line.slice(0, sepIdx).trim();
    const val = line.slice(sepIdx + 1).trim();
    applyEntry(key, val);
  }

  return { next, appliedKeys: Array.from(applied) };
}

export function normalizePlayerBanId(rawId: unknown): string | null {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return null;
  const tgMatch = trimmed.match(/^(?:tg_)?(\d{4,20})$/i);
  if (tgMatch) {
    return `tg_${tgMatch[1]}`;
  }
  if (/^[a-zA-Z0-9_-]{3,64}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function canBanPlayerId(
  rawId: unknown,
  extraAdminIds: readonly string[] = [],
): { ok: true; canonicalId: string } | { ok: false; error: string } {
  const canonicalId = normalizePlayerBanId(rawId);
  if (!canonicalId) {
    return {
      ok: false,
      error: 'Enter a valid Player ID (Telegram numeric ID, tg_..., or player_... UID).',
    };
  }
  if (isAdminPlayerId(canonicalId, extraAdminIds)) {
    return {
      ok: false,
      error: isAdminPlayerId(canonicalId)
        ? `Cannot block or ban Owner Admin ID ${PRIMARY_ADMIN_TELEGRAM_ID}.`
        : 'Cannot block or ban an authorized Admin ID. Remove Admin role first.',
    };
  }
  return { ok: true, canonicalId };
}

export function matchesBannedUserRecord(
  playerId: unknown,
  ban: Pick<BannedUserRecord, 'uid'> | null | undefined,
): boolean {
  if (!ban?.uid) return false;
  const rawPlayer = String(playerId || '').trim();
  if (!rawPlayer) return false;
  if (rawPlayer === ban.uid) return true;

  const normPlayer = normalizePlayerBanId(rawPlayer);
  const normBan = normalizePlayerBanId(ban.uid);
  if (normPlayer && normBan && normPlayer === normBan) return true;

  const tgPlayer = extractTelegramNumericUserId(rawPlayer);
  const tgBan = extractTelegramNumericUserId(ban.uid);
  if (tgPlayer && tgBan && tgPlayer === tgBan) return true;

  return false;
}

export const MAX_EXTRA_ADMINS = 30;
export const ADMIN_PASSCODE_VAULT_UID = 'admin_passcode_vault';

export const DEFAULT_ADMINS_CONFIG: AdminsConfig = {
  adminIds: [],
  admins: [],
  updatedAtMs: 0,
};

export function getEffectiveAdminIds(adminsConfig?: AdminsConfig | null): string[] {
  if (!adminsConfig) return [];
  const seen = new Set<string>();
  const addId = (raw: unknown) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed || trimmed === ADMIN_PASSCODE_VAULT_UID) return;
    seen.add(trimmed);
    const norm = normalizePlayerBanId(trimmed);
    if (norm && norm !== ADMIN_PASSCODE_VAULT_UID) seen.add(norm);
    const tg = extractTelegramNumericUserId(trimmed);
    if (tg) seen.add(tg);
  };
  for (const id of adminsConfig.adminIds ?? []) {
    addId(id);
  }
  for (const entry of adminsConfig.admins ?? []) {
    addId(entry?.uid);
  }
  return Array.from(seen);
}

export function matchesAdminRecord(
  playerId: unknown,
  adminIdOrEntry: string | Pick<AdminRoleEntry, 'uid'> | null | undefined,
): boolean {
  const target =
    typeof adminIdOrEntry === 'string' ? adminIdOrEntry : adminIdOrEntry?.uid;
  if (!target || target === ADMIN_PASSCODE_VAULT_UID) return false;
  return matchesBannedUserRecord(playerId, { uid: target });
}

export function canAddAdminPlayerId(
  rawId: unknown,
  adminsConfig?: AdminsConfig | null,
): { ok: true; canonicalId: string } | { ok: false; error: string } {
  const canonicalId = normalizePlayerBanId(rawId);
  if (!canonicalId) {
    return {
      ok: false,
      error: 'Enter a valid Player ID (Telegram numeric ID, tg_..., or player_... UID).',
    };
  }
  if (isAdminPlayerId(canonicalId)) {
    return {
      ok: false,
      error: `Owner Admin ID ${PRIMARY_ADMIN_TELEGRAM_ID} already has permanent Admin access.`,
    };
  }
  const existingAdmins = adminsConfig?.admins ?? [];
  const existingIds = getEffectiveAdminIds(adminsConfig);
  if (
    existingAdmins.some((a) => matchesAdminRecord(canonicalId, a)) ||
    existingIds.some((id) => matchesAdminRecord(canonicalId, id))
  ) {
    return {
      ok: false,
      error: 'This Player ID already has Admin access.',
    };
  }
  if (existingAdmins.length >= MAX_EXTRA_ADMINS) {
    return {
      ok: false,
      error: `Maximum ${MAX_EXTRA_ADMINS} Co-Admins allowed.`,
    };
  }
  return { ok: true, canonicalId };
}

export function canRemoveAdminPlayerId(
  rawId: unknown,
): { ok: true; canonicalId: string } | { ok: false; error: string } {
  const canonicalId = normalizePlayerBanId(rawId);
  if (!canonicalId) {
    return {
      ok: false,
      error: 'Enter a valid Admin ID.',
    };
  }
  if (isAdminPlayerId(canonicalId)) {
    return {
      ok: false,
      error: `Cannot remove permanent Owner Admin ID ${PRIMARY_ADMIN_TELEGRAM_ID}.`,
    };
  }
  return { ok: true, canonicalId };
}

export function filterPlayersBySearchQuery(
  players: ReadonlyArray<UserFarmProfile>,
  rawQuery: string,
): UserFarmProfile[] {
  const trimmed = String(rawQuery || '').trim().toLowerCase();
  if (!trimmed) return [...players];
  const noAt = trimmed.replace(/^@+/, '');

  return players.filter((p) => {
    const unifiedId = getUnifiedUserId(p.uid).toLowerCase();
    const numericId = (extractTelegramNumericUserId(p.uid) || '').toLowerCase();
    const uidLow = p.uid.toLowerCase();
    const nameLow = (p.displayName || '').toLowerCase();
    const handleLow = (p.handle || '').toLowerCase();
    const refCodeLow = (p.referralCode || '').toLowerCase();
    const referredByLow = (p.referredBy || '').toLowerCase();

    return (
      uidLow.includes(trimmed) ||
      unifiedId.includes(noAt) ||
      (numericId && numericId.includes(noAt)) ||
      nameLow.includes(trimmed) ||
      handleLow.includes(trimmed) ||
      (noAt && handleLow.replace(/^@+/, '').includes(noAt)) ||
      refCodeLow.includes(trimmed) ||
      referredByLow.includes(trimmed)
    );
  });
}

export function computeAdminCoinAdjustment(
  currentCoins: number,
  rawDelta: number,
):
  | {
      ok: true;
      previousCoins: number;
      nextCoins: number;
      actualDelta: number;
    }
  | { ok: false; error: string } {
  const safeCurrent = Math.max(0, Math.floor(Number(currentCoins) || 0));
  const delta = Math.trunc(Number(rawDelta));
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'Enter a coin amount greater than 0.' };
  }
  if (delta > 10_000_000 || delta < -10_000_000) {
    return { ok: false, error: 'Maximum single adjustment is 10,000,000 coins.' };
  }
  const nextCoins = Math.max(0, safeCurrent + delta);
  const actualDelta = nextCoins - safeCurrent;
  if (actualDelta === 0 && delta < 0) {
    return { ok: false, error: 'Player already has 0 coins.' };
  }
  return {
    ok: true,
    previousCoins: safeCurrent,
    nextCoins,
    actualDelta,
  };
}

export function computeAdminReferralCountAdjustment(
  currentCount: number,
  rawDelta: number,
):
  | {
      ok: true;
      previousCount: number;
      nextCount: number;
      actualDelta: number;
    }
  | { ok: false; error: string } {
  const safeCurrent = Math.max(0, Math.floor(Number(currentCount) || 0));
  const delta = Math.trunc(Number(rawDelta));
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'Enter a referral count greater than 0.' };
  }
  if (delta > 100_000 || delta < -100_000) {
    return { ok: false, error: 'Maximum single referral adjustment is 100,000.' };
  }
  const nextCount = Math.max(0, safeCurrent + delta);
  const actualDelta = nextCount - safeCurrent;
  if (actualDelta === 0 && delta < 0) {
    return { ok: false, error: 'Player already has 0 referrals.' };
  }
  return {
    ok: true,
    previousCount: safeCurrent,
    nextCount,
    actualDelta,
  };
}

export function computeAdminWithdrawAdsAdjustment(
  currentAds: number,
  rawDelta: number,
):
  | {
      ok: true;
      previousAds: number;
      nextAds: number;
      actualDelta: number;
    }
  | { ok: false; error: string } {
  const safeCurrent = Math.max(0, Math.min(10_000, Math.floor(Number(currentAds) || 0)));
  const delta = Math.trunc(Number(rawDelta));
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'Enter a withdraw ads count greater than 0.' };
  }
  if (delta > 10_000 || delta < -10_000) {
    return { ok: false, error: 'Maximum single withdraw-ads adjustment is 10,000.' };
  }
  const nextAds = Math.max(0, Math.min(10_000, safeCurrent + delta));
  const actualDelta = nextAds - safeCurrent;
  if (actualDelta === 0 && delta < 0) {
    return { ok: false, error: 'Player already has 0 withdraw ads.' };
  }
  if (actualDelta === 0 && delta > 0) {
    return { ok: false, error: 'Player already reached the maximum withdraw-ads cap.' };
  }
  return {
    ok: true,
    previousAds: safeCurrent,
    nextAds,
    actualDelta,
  };
}

export function computeAdminWithdrawAdsTarget(
  currentAds: number,
  rawTargetAds: number,
):
  | {
      ok: true;
      previousAds: number;
      nextAds: number;
      actualDelta: number;
    }
  | { ok: false; error: string } {
  const safeCurrent = Math.max(0, Math.min(10_000, Math.floor(Number(currentAds) || 0)));
  const parsed = Math.floor(Number(rawTargetAds));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000) {
    return { ok: false, error: 'Enter a valid withdraw ads target between 0 and 10,000.' };
  }
  return {
    ok: true,
    previousAds: safeCurrent,
    nextAds: parsed,
    actualDelta: parsed - safeCurrent,
  };
}

function escapeTelegramHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildReferralBotNotificationMessage(params: {
  event: 'referral_pending' | 'referral_joined' | 'deposit_commission';
  referredName?: string;
  referredHandle?: string;
  rewardCoins: number;
  depositGram?: string;
  depositUsd?: number;
  totalReferrals?: number;
  totalReferralCoins?: number;
}): string {
  const safeName = escapeTelegramHtml((params.referredName || 'New Farmer').trim().slice(0, 60));
  const safeHandle = escapeTelegramHtml(formatReferralHandle(params.referredHandle || '', '').slice(0, 40));
  const safeCoins = Math.max(0, Math.round(Number(params.rewardCoins) || 0));
  const pct = Math.round(REFERRAL_DEPOSIT_COMMISSION_RATE * 100);
  const eggPct = Math.round(REFERRER_LIFETIME_EGG_COMMISSION_RATE * 100);
  const totalRefs =
    typeof params.totalReferrals === 'number' && Number.isFinite(params.totalReferrals)
      ? Math.max(1, Math.floor(params.totalReferrals))
      : null;
  const totalEarned =
    typeof params.totalReferralCoins === 'number' && Number.isFinite(params.totalReferralCoins)
      ? Math.max(safeCoins, Math.round(params.totalReferralCoins))
      : null;

  if (params.event === 'deposit_commission') {
    const safeGram = escapeTelegramHtml((params.depositGram || '').trim().slice(0, 40));
    const safeUsd = Number(params.depositUsd || 0).toFixed(2);
    const depositLine = safeGram
      ? `💰 <b>Friend Deposit:</b> ${safeGram} (~$${safeUsd})`
      : `💰 <b>Friend Deposit:</b> $${safeUsd}`;
    const totalLine =
      totalEarned !== null
        ? `\n🏦 <b>Total Referral Earnings:</b> ${totalEarned.toLocaleString()} Coins`
        : '';

    return [
      '💎 <b>Referral Deposit Commission Received!</b>',
      '',
      `👤 <b>Referred User:</b> ${safeName} (${safeHandle})`,
      depositLine,
      `🪙 <b>Your ${pct}% Commission Received:</b> +${safeCoins.toLocaleString()} Coins${totalLine}`,
      '',
      `Keep inviting friends to earn <b>+${REFERRER_SIGNUP_BONUS_COINS} Coins</b> per referral and a <b>${pct}% share</b> of every deposit they make!`,
    ].join('\n');
  }

  if (params.event === 'referral_pending') {
    const pendingReward = safeCoins > 0 ? safeCoins : REFERRER_SIGNUP_BONUS_COINS;
    return [
      '👋 <b>New Referral Received!</b>',
      '',
      `👤 <b>Referred User:</b> ${safeName} (${safeHandle})`,
      '🔗 <b>Status:</b> Link Clicked (Joined Farm)',
      `⏳ <b>Pending Reward:</b> +${pendingReward.toLocaleString()} Coins`,
      `🎁 <b>Friend Welcome Bonus:</b> +${REFERRED_WELCOME_BONUS_COINS} Coins`,
      '',
      `🐔 <b>When You Receive Your Reward:</b> As soon as ${safeName} buys their <b>1st Chicken (Miner)</b>, your <b>+${pendingReward.toLocaleString()} Coins</b> referral reward will be automatically unlocked &amp; credited!`,
      '',
      `💎 Plus you earn a lifetime <b>${pct}% Deposit Share</b> &amp; <b>${eggPct}% Egg Share</b> once active!`,
    ].join('\n');
  }

  const nextCrate =
    totalRefs !== null
      ? REFERRAL_MILESTONE_CRATES.find((c) => totalRefs < c.targetActive) ||
        REFERRAL_MILESTONE_CRATES[REFERRAL_MILESTONE_CRATES.length - 1]
      : REFERRAL_MILESTONE_CRATES[0];

  const progressLines: string[] = [];
  if (totalRefs !== null) {
    const crateDetail =
      nextCrate.bonusLeghorns > 0
        ? `+${nextCrate.rewardCoins.toLocaleString()}c + ${nextCrate.bonusLeghorns} Hen`
        : `+${nextCrate.rewardCoins.toLocaleString()}c`;
    const crateLine =
      totalRefs >= nextCrate.targetActive
        ? `🏆 <b>${escapeTelegramHtml(nextCrate.title)} Unlocked!</b> Open Friends tab to claim <b>${crateDetail}</b>!`
        : `🎯 <b>Next Crate (${escapeTelegramHtml(nextCrate.title)}):</b> ${totalRefs}/${nextCrate.targetActive} friends → <b>${crateDetail}</b>`;
    progressLines.push(
      `👥 <b>Total Friends Invited:</b> ${totalRefs}${totalEarned !== null ? ` · 🪙 <b>Total Earned:</b> ${totalEarned.toLocaleString()}c` : ''}`,
      crateLine,
    );
  }

  return [
    '🎉 <b>New Referral Received &amp; Reward Credited!</b>',
    '',
    `👤 <b>Referred User:</b> ${safeName} (${safeHandle})`,
    `🪙 <b>Instant Reward Credited:</b> +${safeCoins.toLocaleString()} Coins`,
    `🎁 <b>Friend Welcome Bonus:</b> +${REFERRED_WELCOME_BONUS_COINS} Coins`,
    ...(progressLines.length > 0 ? ['', ...progressLines] : []),
    '',
    `💎 <b>${pct}% Deposit &amp; ${eggPct}% Lifetime Egg Share:</b>`,
    `Whenever your referred user makes a deposit, you automatically receive a <b>${pct}% share</b> in Coins plus <b>${eggPct}% of their eggs</b>!`,
  ].join('\n');
}

export function shouldShowSignUpBonusClaim(params: {
  isNewPlayer: boolean;
  alreadyClaimedInStorage: boolean;
  skipWelcome?: boolean;
  nowMs?: number;
  profile: Pick<
    UserFarmProfile,
    | 'createdAtMs'
    | 'boughtThisWeek'
    | 'totalEggsCollected'
    | 'leghornCount'
    | 'rhodeCount'
    | 'orpingtonCount'
    | 'australorpCount'
    | 'watchedAdsCount'
    | 'totalAdsWatched'
    | 'completedTaskIds'
    | 'claimedPromoCodes'
  >;
}): boolean {
  if (params.skipWelcome || params.alreadyClaimedInStorage) {
    return false;
  }
  if (params.isNewPlayer) {
    return true;
  }
  const now = typeof params.nowMs === 'number' && Number.isFinite(params.nowMs) ? params.nowMs : Date.now();
  const createdAtMs = Number(params.profile.createdAtMs ?? 0);
  const ageMs = createdAtMs > 0 ? Math.max(0, now - createdAtMs) : Number.POSITIVE_INFINITY;
  const isFreshAccount = ageMs <= 24 * 60 * 60 * 1000;
  const totalChickens =
    Number(params.profile.leghornCount ?? 0) +
    Number(params.profile.rhodeCount ?? 0) +
    Number(params.profile.orpingtonCount ?? 0) +
    Number(params.profile.australorpCount ?? 0);
  const hasNoProgress =
    Number(params.profile.boughtThisWeek ?? 0) === 0 &&
    totalChickens === 0 &&
    Number(params.profile.totalEggsCollected ?? 0) === 0 &&
    Number(params.profile.watchedAdsCount ?? 0) === 0 &&
    Number(params.profile.totalAdsWatched ?? 0) === 0 &&
    (params.profile.completedTaskIds?.length ?? 0) === 0 &&
    (params.profile.claimedPromoCodes?.length ?? 0) === 0;

  return isFreshAccount && hasNoProgress;
}

export const DEFAULT_WITHDRAW_APPROVE_MESSAGE_BODY = [
  '✅ Withdrawal Paid!',
  '',
  'Your withdrawal has been successfully sent and confirmed on TON.',
  '',
  '💎 Amount: {gramAmount} GRAM',
  '🥚 Eggs: {eggsAmount}',
  '👛 Wallet: {walletShort}',
  '⚡ Status: Confirmed on TON',
  '',
  'Thank you for using Alpha Gram 🐔💚',
].join('\n');

export const DEFAULT_WITHDRAW_APPROVE_TEMPLATE: WithdrawApproveMessageTemplate = {
  messageTemplate: DEFAULT_WITHDRAW_APPROVE_MESSAGE_BODY,
  buttonText: '🔎 View transaction',
  buttonUrlTemplate: 'https://tonviewer.com/{walletAddress}',
  updatedAtMs: 0,
};

export function formatShortTonWallet(walletAddress: string): string {
  const clean = String(walletAddress || '').trim();
  if (clean.length <= 14) return clean;
  return `${clean.slice(0, 6)}...${clean.slice(-5)}`;
}

export function renderWithdrawApproveMessage(params: {
  template?: Partial<WithdrawApproveMessageTemplate> | null;
  gramAmount: string;
  eggsAmount: number;
  walletAddress: string;
  usdValue: number;
  displayName?: string;
  handle?: string;
  txId?: string;
  memo?: string;
  adminNote?: string;
}): {
  plainText: string;
  htmlText: string;
  buttonText: string;
  buttonUrl: string;
} {
  const rawBody =
    typeof params.template?.messageTemplate === 'string' &&
    params.template.messageTemplate.trim().length > 0
      ? params.template.messageTemplate
      : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate;
  const rawBtnText =
    typeof params.template?.buttonText === 'string'
      ? params.template.buttonText.trim()
      : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonText;
  const rawBtnUrl =
    typeof params.template?.buttonUrlTemplate === 'string' &&
    params.template.buttonUrlTemplate.trim().length > 0
      ? params.template.buttonUrlTemplate.trim()
      : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate;

  const cleanWallet = String(params.walletAddress || '').trim();
  const cleanNote = String(params.adminNote || '').trim();
  const txUrlFromNote = /^https:\/\/[^\s]+$/i.test(cleanNote)
    ? cleanNote
    : /^[a-fA-F0-9]{64}$/.test(cleanNote)
      ? `https://tonviewer.com/transaction/${cleanNote}`
      : `https://tonviewer.com/${encodeURIComponent(cleanWallet)}`;

  const tokens: Record<string, string> = {
    '{gramAmount}': String(params.gramAmount || '0').trim(),
    '{eggsAmount}': Math.max(0, Math.floor(Number(params.eggsAmount) || 0)).toString(),
    '{eggsFormatted}': Math.max(0, Math.floor(Number(params.eggsAmount) || 0)).toLocaleString(),
    '{walletAddress}': cleanWallet,
    '{walletShort}': formatShortTonWallet(cleanWallet),
    '{usdValue}': Math.max(0, Number(params.usdValue) || 0).toFixed(4),
    '{displayName}': String(params.displayName || 'Farmer').trim(),
    '{handle}': String(params.handle || '@farmer').trim(),
    '{txId}': String(params.txId || '').trim(),
    '{memo}': String(params.memo || '').trim(),
    '{adminNote}': cleanNote,
    '{txUrl}': txUrlFromNote,
  };

  const applyTokens = (input: string, escapeForHtml: boolean): string => {
    let out = escapeForHtml ? escapeTelegramHtml(input) : input;
    for (const [key, val] of Object.entries(tokens)) {
      const safeVal = escapeForHtml ? escapeTelegramHtml(val) : val;
      out = out.split(key).join(safeVal);
    }
    return out;
  };

  const plainText = applyTokens(rawBody, false).slice(0, 1500);
  const htmlLines = applyTokens(rawBody, true).split('\n');
  if (htmlLines.length > 0 && htmlLines[0].trim()) {
    htmlLines[0] = `<b>${htmlLines[0]}</b>`;
  }
  const htmlText = htmlLines.join('\n').slice(0, 3500);

  const buttonText = applyTokens(rawBtnText, false).slice(0, 48);
  let buttonUrl = rawBtnUrl;
  const encodedWallet = encodeURIComponent(cleanWallet);
  buttonUrl = buttonUrl
    .split('{walletAddress}').join(encodedWallet)
    .split('{txUrl}').join(txUrlFromNote)
    .split('{txId}').join(encodeURIComponent(String(params.txId || '').trim()));
  if (!/^https:\/\/[^\s]+$/i.test(buttonUrl)) {
    buttonUrl = `https://tonviewer.com/${encodedWallet}`;
  }

  return {
    plainText,
    htmlText,
    buttonText,
    buttonUrl,
  };
}

export function renderPayoutChannelApproveMessage(params: {
  template?: Partial<WithdrawApproveMessageTemplate> | null;
  gramAmount: string;
  eggsAmount: number;
  walletAddress: string;
  usdValue: number;
  displayName?: string;
  txId?: string;
  adminNote?: string;
  miniAppUrl?: string;
}): {
  plainText: string;
  htmlText: string;
  buttonText: string;
  buttonUrl: string;
} {
  const safeDisplayName = String(params.displayName || 'Farmer').trim().slice(0, 40) || 'Farmer';
  const shortWallet = formatShortTonWallet(params.walletAddress);
  const safeNote = String(params.adminNote || '').trim();
  const hasPublicTxHash = /^[a-fA-F0-9]{64}$/.test(safeNote) || /^https:\/\/[^\s]+$/i.test(safeNote);

  // Render using the exact same template engine, while masking wallet and omitting private handle/memo
  const rendered = renderWithdrawApproveMessage({
    template: params.template,
    gramAmount: params.gramAmount,
    eggsAmount: params.eggsAmount,
    walletAddress: shortWallet || 'TON Wallet',
    usdValue: params.usdValue,
    displayName: safeDisplayName,
    handle: '',
    txId: params.txId ? `...${String(params.txId).slice(-6)}` : '',
    memo: '',
    adminNote: hasPublicTxHash ? safeNote : '',
  });

  const cleanGram = String(params.gramAmount || '0').trim();
  const rawBody =
    typeof params.template?.messageTemplate === 'string' &&
    params.template.messageTemplate.trim().length > 0
      ? params.template.messageTemplate
      : DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate;
  const includesUserIdentity = rawBody.includes('{displayName}');
  const includesAmount = rawBody.includes('{gramAmount}');

  let finalPlain = rendered.plainText;
  let finalHtml = rendered.htmlText;

  if (!includesUserIdentity || !includesAmount) {
    const channelSummaryPlain = `👤 Farmer: ${safeDisplayName}\n💎 Withdrawn: ${cleanGram} GRAM`;
    const channelSummaryHtml = `👤 <b>Farmer:</b> ${escapeTelegramHtml(safeDisplayName)}\n💎 <b>Withdrawn:</b> ${escapeTelegramHtml(cleanGram)} GRAM`;

    const plainParts = finalPlain.split('\n');
    const htmlParts = finalHtml.split('\n');
    if (plainParts.length > 1) {
      plainParts.splice(1, 0, '', channelSummaryPlain);
      finalPlain = plainParts.join('\n').replace(/\n{3,}/g, '\n\n');
    } else {
      finalPlain = `${finalPlain}\n\n${channelSummaryPlain}`;
    }
    if (htmlParts.length > 1) {
      htmlParts.splice(1, 0, '', channelSummaryHtml);
      finalHtml = htmlParts.join('\n').replace(/\n{3,}/g, '\n\n');
    } else {
      finalHtml = `${finalHtml}\n\n${channelSummaryHtml}`;
    }
  }

  // Never expose full wallet address in the public payout channel button URL
  const safeTxUrl = /^[a-fA-F0-9]{64}$/.test(safeNote)
    ? `https://tonviewer.com/transaction/${safeNote}`
    : /^https:\/\/[^\s]+$/i.test(safeNote)
      ? safeNote
      : '';
  const fallbackAppUrl =
    params.miniAppUrl && /^https:\/\/[^\s]+$/i.test(params.miniAppUrl)
      ? params.miniAppUrl
      : '';
  const buttonUrl = safeTxUrl || fallbackAppUrl;
  const buttonText = safeTxUrl
    ? rendered.buttonText || '🔎 View transaction'
    : fallbackAppUrl
      ? '🐔 Open Alpha Gram'
      : '';

  return {
    plainText: finalPlain.slice(0, 1500),
    htmlText: finalHtml.slice(0, 3500),
    buttonText,
    buttonUrl,
  };
}

export function getVerifiableClaimedChannelTasks(
  completedTaskIds: string[],
  customTasks: TaskDefinition[] = [],
): Array<{ task: TaskDefinition; handle: string }> {
  if (!Array.isArray(completedTaskIds) || completedTaskIds.length === 0) {
    return [];
  }
  const completedSet = new Set(completedTaskIds);
  const allTasks = mergeTaskDefinitions(customTasks);
  const out: Array<{ task: TaskDefinition; handle: string }> = [];
  for (const task of allTasks) {
    if (!completedSet.has(task.id)) continue;
    if (!task.actionUrl) continue;
    const isPaidTask = Boolean(task.creatorUid || (task.paidCoins ?? 0) > 0);
    if (isPaidTask && task.requireChannelCheck === false) continue;
    if (
      /[?&]start(app)?=/i.test(task.actionUrl) ||
      /t\.me\/(\+|joinchat\/)/i.test(task.actionUrl)
    ) {
      continue;
    }
    const normalized = normalizeTelegramChannelHandle(task.actionUrl);
    if (!normalized.handle) continue;
    out.push({ task, handle: normalized.handle });
  }
  return out;
}

export function applyLeftChannelPenalties(
  profile: UserFarmProfile,
  leftTaskIds: string[],
  nowMs: number,
  customTasks: TaskDefinition[] = [],
): {
  profile: UserFarmProfile;
  transaction: TransactionEntry;
  penalizedTasks: Array<{ taskId: string; title: string; rewardCoins: number; penaltyCoins: number }>;
  totalPenaltyCoins: number;
} | null {
  if (!Array.isArray(leftTaskIds) || leftTaskIds.length === 0) return null;
  const completedSet = new Set(profile.completedTaskIds);
  const allTasks = mergeTaskDefinitions(customTasks);
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const penalizedSet = new Set<string>();
  const penalizedTasks: Array<{
    taskId: string;
    title: string;
    rewardCoins: number;
    penaltyCoins: number;
  }> = [];

  let totalPenaltyCoins = 0;
  for (const rawId of leftTaskIds) {
    if (!completedSet.has(rawId) || penalizedSet.has(rawId)) continue;
    const task = taskMap.get(rawId);
    if (!task) continue;
    const rewardCoins = Math.max(0, Math.round(Number(task.rewardCoins) || 0));
    if (rewardCoins <= 0) continue;
    const penaltyCoins = rewardCoins * CHANNEL_LEAVE_PENALTY_MULTIPLIER;
    penalizedSet.add(rawId);
    penalizedTasks.push({
      taskId: rawId,
      title: task.title,
      rewardCoins,
      penaltyCoins,
    });
    totalPenaltyCoins += penaltyCoins;
  }

  if (penalizedTasks.length === 0 || totalPenaltyCoins <= 0) {
    return null;
  }

  const nextCoins = Math.max(-100_000_000, profile.coins - totalPenaltyCoins);
  const nextCompletedTaskIds = profile.completedTaskIds.filter((id) => !penalizedSet.has(id));

  const nextProfile: UserFarmProfile = {
    ...profile,
    coins: nextCoins,
    completedTaskIds: nextCompletedTaskIds,
  };

  const label =
    penalizedTasks.length === 1
      ? `Left channel penalty (5×): ${penalizedTasks[0].title}`
      : `Left ${penalizedTasks.length} channels penalty (5×)`;

  const transaction: TransactionEntry = {
    id: `tx_ch_pen_${nowMs}`,
    userId: profile.uid,
    type: 'task',
    title: label.slice(0, 80),
    amount: -totalPenaltyCoins,
    currency: 'coins',
    usdValue: coinsToUsd(totalPenaltyCoins),
    status: 'completed',
    createdAtMs: nowMs,
  };

  return {
    profile: nextProfile,
    transaction,
    penalizedTasks,
    totalPenaltyCoins,
  };
}

export const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: false,
  title: 'Scheduled Maintenance',
  message:
    'Alpha Gram is temporarily offline for scheduled maintenance to upgrade servers and improve performance. Your coins, eggs, chickens, and referrals are completely safe.',
  estimatedReturn: 'We will be back online shortly.',
  updatedBy: '',
  updatedAtMs: 0,
};

export function resolveMaintenanceConfig(
  raw?: Partial<MaintenanceConfig> | null,
): MaintenanceConfig {
  const cleanTitle =
    typeof raw?.title === 'string' && raw.title.trim().length > 0
      ? raw.title.trim().slice(0, 80)
      : DEFAULT_MAINTENANCE_CONFIG.title;
  const cleanMessage =
    typeof raw?.message === 'string' && raw.message.trim().length > 0
      ? raw.message.trim().slice(0, 400)
      : DEFAULT_MAINTENANCE_CONFIG.message;
  const cleanEta =
    typeof raw?.estimatedReturn === 'string'
      ? raw.estimatedReturn.trim().slice(0, 80)
      : DEFAULT_MAINTENANCE_CONFIG.estimatedReturn;
  const cleanUpdatedBy =
    typeof raw?.updatedBy === 'string' ? raw.updatedBy.trim().slice(0, 64) : '';
  const updatedAtMs = Number(raw?.updatedAtMs);
  return {
    enabled: Boolean(raw?.enabled),
    title: cleanTitle,
    message: cleanMessage,
    estimatedReturn: cleanEta,
    updatedBy: cleanUpdatedBy,
    updatedAtMs: Number.isFinite(updatedAtMs) && updatedAtMs >= 0 ? updatedAtMs : 0,
  };
}



