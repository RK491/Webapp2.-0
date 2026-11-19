export type ChickenBreedId = 'leghorn' | 'rhode' | 'orpington' | 'australorp';

export type NavTab = 'farm' | 'packs' | 'leaderboard' | 'tasks' | 'friends' | 'wallet';

export type SubView =
  | 'none'
  | 'profile'
  | 'your_farm'
  | 'deposit'
  | 'withdraw'
  | 'admin';

export type DepositNetwork = 'GRAM_TON';

export type LanguageCode = 'en' | 'hi' | 'es' | 'ru' | 'fr' | 'pt' | 'ar';

export type TransactionType =
  | 'collect'
  | 'task'
  | 'task_topup'
  | 'task_refund'
  | 'deposit'
  | 'withdraw'
  | 'reinvest'
  | 'buy_chicken'
  | 'upgrade_basket'
  | 'promo'
  | 'referral'
  | 'booster'
  | 'coop_fever'
  | 'auto_harvest'
  | 'golden_egg'
  | 'achievement'
  | 'season_prize'
  | 'admin_adjustment';

export type AutoHarvestDurationId = '5h' | '10h' | '15h' | '20h' | '24h' | '7d';
export type AutoHarvestCurrency = 'coins' | 'eggs';
export type BroadcastMediaType = 'none' | 'photo' | 'video' | 'animation';

export interface ChickenPack {
  id: ChickenBreedId;
  name: string;
  eggsPerHour: number;
  coinCost: number;
  usdCost: number;
  leaderboardPoints: number;
  tagline: string;
  accentColor: string;
}

export interface UserFarmProfile {
  uid: string;
  displayName: string;
  handle: string;
  photoUrl: string;
  avatarColor: string;
  level: number;
  xp: number;
  coins: number;
  eggs: number;
  totalEggsCollected: number;
  totalCashEarnedUsd: number;
  totalWithdrawnUsd: number;
  basketCapacity: number;
  basketTierHours: number;
  leghornCount: number;
  rhodeCount: number;
  orpingtonCount: number;
  australorpCount: number;
  boughtThisWeek: number;
  dailyStreak: number;
  lastDailyClaimDate: string;
  lastReinvestDate?: string;
  completedTaskIds: string[];
  claimedPromoCodes: string[];
  watchedAdsCount: number;
  totalAdsWatched?: number;
  withdrawAdsWatched?: number;
  coopFeverAdsWatched?: number;
  referralCode: string;
  referredBy: string;
  referralActivated: boolean;
  referralCount: number;
  referralCoinsEarned: number;
  firstDepositBonusUsed: boolean;
  language: LanguageCode;
  lastCollectedAt: number;
  createdAtMs: number;
  feedBoostUntilMs?: number;
  coopFeverUntilMs?: number;
  coopFeverBaselineAds?: number;
  autoHarvestUntilMs?: number;
  telegramRemindersEnabled?: boolean;
  lastGoldenEggAtMs?: number;
  goldenEggsFound?: number;
  claimedAchievementIds?: string[];
  claimedReferralMilestones?: number[];
  resetEpochMs?: number;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'processing';

export interface TransactionEntry {
  id: string;
  userId: string;
  type: TransactionType;
  title: string;
  amount: number;
  currency: 'eggs' | 'coins';
  usdValue: number;
  status: 'completed' | 'pending' | 'approved' | 'rejected';
  createdAtMs: number;
}

export interface DepositOrder {
  id: string;
  userId: string;
  coinsAmount: number;
  bonusCoins: number;
  usdAmount: number;
  network: DepositNetwork;
  cryptoAmount: string;
  depositAddress: string;
  txHash: string;
  status: 'completed' | 'pending';
  createdAtMs: number;
}

export interface WithdrawalOrder {
  id: string;
  txId?: string;
  userId: string;
  eggsAmount: number;
  gramAmount: string;
  usdValue: number;
  walletAddress: string;
  memo: string;
  network: 'GRAM_TON';
  status: WithdrawalStatus;
  adminNote?: string;
  reviewedAtMs?: number;
  createdAtMs: number;
}

export interface WithdrawRequestRecord {
  id: string;
  txId: string;
  userId: string;
  displayName: string;
  handle: string;
  eggsAmount: number;
  gramAmount: string;
  usdValue: number;
  walletAddress: string;
  memo: string;
  network: 'GRAM_TON';
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string;
  createdAtMs: number;
  reviewedAtMs: number;
}

export interface ReferralRecord {
  id: string;
  referrerUid: string;
  referredUid: string;
  referredName: string;
  referredHandle: string;
  status: 'pending' | 'active';
  coinsEarned: number;
  eggsEarned?: number;
  toppedUpUsd: number;
  createdAtMs: number;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  handle: string;
  photoUrl: string;
  avatarColor: string;
  referralCode: string;
  buyerPoints: number;
  inviterCount: number;
  eggs: number;
  totalEggsCollected: number;
  chickensCount: number;
  isCurrentUser?: boolean;
}

export type TaskCategory = 'social' | 'daily' | 'exclusive' | 'partner' | 'milestone';

export type TaskSortOption = 'most_reward' | 'newest' | 'ending_soon';

export interface TaskDefinition {
  id: string;
  category: TaskCategory;
  title: string;
  subtitle?: string;
  rewardCoins: number;
  icon: string;
  actionUrl?: string;
  totalSlots?: number;
  claimedCount?: number;
  creatorUid?: string;
  paidCoins?: number;
  requireChannelCheck?: boolean;
  isCustom?: boolean;
  isActive?: boolean;
  createdAtMs?: number;
}

export type PromoRewardType = 'coins' | 'eggs' | 'chicken';

export interface DynamicPromoCode {
  code: string;
  label: string;
  coins: number;
  rewardType?: PromoRewardType;
  eggs?: number;
  chickenBreed?: ChickenBreedId;
  chickenQty?: number;
  maxUses: number;
  usedCount: number;
  expiresAtMs: number;
  isActive: boolean;
  createdAtMs: number;
}

export interface SeasonWinnerRecord {
  uid: string;
  displayName: string;
  handle: string;
  category: 'buyers' | 'inviters' | 'eggs';
  rank: number;
  prizeCoins: number;
}

export interface SeasonConfig {
  seasonNumber: number;
  title: string;
  prizePoolCoins: number;
  endsAtMs: number;
  lastWinners: SeasonWinnerRecord[];
  updatedAtMs: number;
}

export type AdNetworkId = 'adsgram' | 'gigapub' | 'monetag';

export type AdGateActionType =
  | 'startup'
  | 'collect_eggs'
  | 'claim_promo'
  | 'ad_network'
  | 'watch_ad'
  | 'adsgram_task'
  | 'task'
  | 'withdraw'
  | 'deposit'
  | 'buy_chicken';

export type AdProviderType = 'countdown' | 'adsgram' | 'gigapub' | 'monetag' | 'custom_sponsor';

export interface AdConfig {
  provider: AdProviderType;
  adsgramBlockId: string;
  adsgramTaskBlockId?: string;
  gigapubProjectId?: string;
  monetagZoneId: string;
  customTitle: string;
  customDescription: string;
  customUrl: string;
  watchSeconds: number;
  bannerEnabled: boolean;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerCtaText: string;
  bannerUrl: string;
  updatedAtMs: number;
}

export type ChannelVerificationMode =
  | 'telegram_bot'
  | 'bot_unconfigured'
  | 'guest_browser'
  | 'static_preview'
  | 'disabled';

export interface RequiredTelegramChannel {
  id: string;
  handle: string;
  title: string;
  description: string;
  url: string;
  enabled?: boolean;
}

export interface ChannelsConfig {
  enabled: boolean;
  channels: RequiredTelegramChannel[];
  getCodeChannelUrl?: string;
  updatedAtMs: number;
}

export interface ChannelVerificationItem {
  id: string;
  handle: string;
  title: string;
  description: string;
  url: string;
  joined: boolean;
  status: string;
  error?: string;
}

export interface ChannelVerificationResult {
  ok: boolean;
  allJoined: boolean;
  verificationMode: ChannelVerificationMode;
  telegramUserId: string | null;
  channels: ChannelVerificationItem[];
  checkedAtMs: number;
}

export interface BannedUserRecord {
  uid: string;
  displayName: string;
  handle: string;
  reason: string;
  bannedBy: string;
  bannedAtMs: number;
}

export interface AdminRoleEntry {
  uid: string;
  displayName: string;
  handle: string;
  addedBy: string;
  addedAtMs: number;
}

export interface AdminsConfig {
  adminIds: string[];
  admins: AdminRoleEntry[];
  updatedAtMs: number;
}

export interface WithdrawApproveMessageTemplate {
  messageTemplate: string;
  buttonText: string;
  buttonUrlTemplate: string;
  updatedAtMs: number;
}

export interface ChannelCheckDiagnosticLog {
  id: string;
  timestampMs: number;
  endpoint: 'check-channels' | 'test-channels' | 'check-task-channel';
  userIdSource?: string;
  telegramUserId: string | null;
  verificationMode: string;
  allJoined: boolean;
  fromFirestore?: boolean;
  botConfigured: boolean;
  botUsername?: string | null;
  error?: string | null;
  channels: Array<{
    handle: string;
    joined: boolean;
    status: string;
    botIsAdmin?: boolean;
    botStatus?: string;
    rawTelegramOk?: boolean;
    errorCode?: number;
    rawDescription?: string;
    rawStatus?: string;
    rawIsMember?: boolean | null;
    targetChatIdUsed?: string;
  }>;
}

export interface SystemServerLogEntry {
  id: string;
  timestampMs: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  detail?: string;
}

export interface SystemDiagnosticsSnapshot {
  ok: boolean;
  serverTimeMs: number;
  uptimeSec: number;
  nodeVersion: string;
  env: string;
  memoryMb: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  bot: {
    configured: boolean;
    username: string | null;
    botId: number | null;
    lastHeartbeatAtMs: number;
    lastHeartbeatOk: boolean;
    latencyMs: number | null;
    error?: string | null;
    webhookUrl?: string | null;
    pendingUpdateCount?: number;
    subscriberCount?: number;
    activePollIntervalSec: number;
  };
  firestore: {
    connected: boolean;
    databaseId: string;
    projectId: string;
    readOk: boolean;
    latencyMs: number | null;
    error?: string | null;
  };
  channelCheckStats: {
    totalLogsRecorded: number;
    lastCheckAtMs: number | null;
  };
  rateLimitBucketsCount: number;
  serverLogs: SystemServerLogEntry[];
}

export interface TaskPricingConfig {
  minBudgetCoins: number;
  channelCheckFeeCoins: number;
  platformFeeRate: number;
  updatedAtMs: number;
}

export interface SystemResetConfig {
  resetEpochMs: number;
  resetCount: number;
  resetBy: string;
  updatedAtMs: number;
}

export interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  estimatedReturn: string;
  updatedBy: string;
  updatedAtMs: number;
}
