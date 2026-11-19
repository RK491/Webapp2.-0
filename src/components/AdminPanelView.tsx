import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Coins,
  Copy,
  Crown,
  Database,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Film,
  Gift,
  Image,
  Infinity as InfinityIcon,
  KeyRound,
  Link2,
  ListPlus,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Minus,
  PauseCircle,
  PlayCircle,
  Plus,
  Power,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Server,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
  Sparkles,
  Ticket,
  Trash2,
  Unlink,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Video,
  Wallet,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  AdConfig,
  AdProviderType,
  AdminsConfig,
  BannedUserRecord,
  ChannelCheckDiagnosticLog,
  ChannelsConfig,
  ChickenBreedId,
  DynamicPromoCode,
  MaintenanceConfig,
  PromoRewardType,
  ReferralRecord,
  RequiredTelegramChannel,
  SystemDiagnosticsSnapshot,
  SystemResetConfig,
  TaskDefinition,
  TaskPricingConfig,
  UserFarmProfile,
  WithdrawApproveMessageTemplate,
  WithdrawRequestRecord,
} from '../types/farm';
import {
  calculateTotalChickens,
  canAddAdminPlayerId,
  canBanPlayerId,
  CHICKEN_PACKS,
  computeAdminWithdrawAdsAdjustment,
  computeAdminWithdrawAdsTarget,
  DEFAULT_GET_CODE_CHANNEL_URL,
  DEFAULT_MAINTENANCE_CONFIG,
  DEFAULT_TASK_PRICING_CONFIG,
  DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
  extractTelegramNumericUserId,
  filterPlayersBySearchQuery,
  formatAdConfigTemplate,
  formatPromoRewardSummary,
  generateGiftCodeString,
  getEffectiveAdminIds,
  getUnifiedUserId,
  getWithdrawalStatusMeta,
  isAdminPlayerId,
  matchesAdminRecord,
  matchesBannedUserRecord,
  MIN_WITHDRAW_ADS_WATCHED,
  normalizeGetCodeChannelUrl,
  normalizePlayerBanId,
  normalizeTelegramChannelEntry,
  parseAdConfigTemplate,
  PRIMARY_ADMIN_TELEGRAM_ID,
  renderWithdrawApproveMessage,
  resolveTaskPricingConfig,
} from '../game/economy';
import { getConfiguredApiBaseUrl, setConfiguredApiBaseUrl } from '../utils/telegram';
import { ChickenSprite, CoinIcon, EggIcon } from './GameIcons';

interface ChannelDiagnosticResult {
  ok: boolean;
  botConfigured?: boolean;
  botUsername?: string | null;
  botError?: string;
  error?: string;
  recentLogs?: ChannelCheckDiagnosticLog[];
  channels?: Array<{
    id: string;
    handle: string;
    botIsAdmin: boolean;
    botStatus: string;
    userJoined?: boolean | null;
    userStatus?: string | null;
    error?: string;
  }>;
}

interface BroadcastResult {
  ok: boolean;
  totalTargets?: number;
  sentCount?: number;
  failedCount?: number;
  blockedCount?: number;
  testOnlyToAdmin?: boolean;
  sampleError?: string;
  error?: string;
}

interface BroadcastAudienceStats {
  ok: boolean;
  totalRecipients?: number;
  botSubscriberCount?: number;
  blockedBotCount?: number;
  playerRecipientCount?: number;
  newUpdates?: number;
  webhookActive?: boolean;
  error?: string;
}

interface AdminPanelViewProps {
  playerId: string;
  adminUnlocked: boolean;
  adminPasscodeSource?: 'database' | 'server_file' | 'env' | 'default';
  adminPasscodeUpdatedAtMs?: number;
  serverBotConfigured?: boolean;
  onVerifyAdminPasscode: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
  onTestChannels?: (channels?: RequiredTelegramChannel[]) => Promise<ChannelDiagnosticResult>;
  channelDiagnosticLogs?: ChannelCheckDiagnosticLog[];
  loadingChannelLogs?: boolean;
  channelLogsError?: string | null;
  onRefreshChannelLogs?: () => Promise<void> | void;
  systemDiagnostics?: SystemDiagnosticsSnapshot | null;
  loadingSystemDiagnostics?: boolean;
  systemDiagnosticsError?: string | null;
  onFetchSystemDiagnostics?: (forceHeartbeat?: boolean) => Promise<void> | void;
  onLockAdmin?: () => void;
  withdrawRequests: WithdrawRequestRecord[];
  withdrawApproveTemplate?: WithdrawApproveMessageTemplate;
  onSaveWithdrawApproveTemplate?: (
    template: Omit<WithdrawApproveMessageTemplate, 'updatedAtMs'>,
  ) => Promise<boolean | void>;
  customTasks: TaskDefinition[];
  adConfig: AdConfig;
  channelsConfig: ChannelsConfig;
  promoCodes: DynamicPromoCode[];
  recentPlayers: UserFarmProfile[];
  bannedUsers: BannedUserRecord[];
  adminsConfig: AdminsConfig;
  onBack: () => void;
  onTabTap?: () => void;
  onReviewWithdrawal: (
    request: WithdrawRequestRecord,
    decision: 'approved' | 'rejected',
    adminNote: string,
  ) => Promise<void>;
  onCreateTask: (input: {
    title: string;
    subtitle?: string;
    category: TaskDefinition['category'];
    rewardCoins: number;
    icon: string;
    actionUrl: string;
    totalSlots?: number;
  }) => Promise<void>;
  onToggleTask: (taskId: string, isActive: boolean) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onSaveAdConfig: (config: Omit<AdConfig, 'updatedAtMs'>) => Promise<boolean | void>;
  onSaveChannelsConfig: (config: Omit<ChannelsConfig, 'updatedAtMs'>) => Promise<boolean | void>;
  onCreatePromoCode: (input: {
    code: string;
    label: string;
    coins: number;
    rewardType?: PromoRewardType;
    eggs?: number;
    chickenBreed?: ChickenBreedId;
    chickenQty?: number;
    maxUses: number;
    expiresInHours: number;
  }) => Promise<DynamicPromoCode | null>;
  onTogglePromoCode: (code: string, isActive: boolean) => Promise<void>;
  onDeletePromoCode: (code: string) => Promise<void>;
  onBanPlayer: (input: {
    targetId: string;
    displayName?: string;
    handle?: string;
    reason?: string;
  }) => Promise<void>;
  onUnbanPlayer: (targetId: string) => Promise<void>;
  onSearchUsers: (query: string) => Promise<UserFarmProfile[]>;
  onFetchPlayerReferrals: (playerUid: string) => Promise<ReferralRecord[]>;
  onAdjustCoins: (input: {
    targetUid: string;
    deltaCoins: number;
    note?: string;
  }) => Promise<UserFarmProfile>;
  onAdjustReferralCount: (input: {
    targetUid: string;
    deltaRefers: number;
  }) => Promise<UserFarmProfile>;
  onAddReferralRelation: (input: {
    referrerIdOrCode: string;
    referredIdOrCode: string;
    bonusCoins?: number;
  }) => Promise<{
    referrerProfile: UserFarmProfile;
    referredProfile: UserFarmProfile;
    referralRecord: ReferralRecord;
  }>;
  onRemoveReferralRelation: (input: {
    referrerUid: string;
    referredUid: string;
  }) => Promise<{
    referrerProfile?: UserFarmProfile;
    referredProfile?: UserFarmProfile;
  }>;
  onAddAdmin: (input: {
    targetId: string;
    displayName?: string;
    handle?: string;
  }) => Promise<void>;
  onRemoveAdmin: (targetId: string) => Promise<void>;
  onFetchBroadcastStats?: (excludeBanned: boolean) => Promise<BroadcastAudienceStats>;
  onSyncBotSubscribers?: () => Promise<BroadcastAudienceStats>;
  onSendBroadcast?: (input: {
    title: string;
    message: string;
    mediaType: 'none' | 'photo' | 'video' | 'animation';
    mediaUrl?: string;
    mediaDataUrl?: string;
    mediaFilename?: string;
    buttonText?: string;
    buttonUrl?: string;
    excludeBanned?: boolean;
    testOnlyToAdmin?: boolean;
  }) => Promise<BroadcastResult>;
  botConfigStatus?: {
    configured: boolean;
    source: 'runtime' | 'env' | 'local_preview' | 'none';
    maskedToken: string;
    botUsername: string | null;
    updatedAtMs: number;
  } | null;
  onSaveBotToken?: (botToken: string) => Promise<{
    ok: boolean;
    error?: string;
    botUsername?: string | null;
    maskedToken?: string;
  }>;
  onClearBotToken?: () => Promise<{ ok: boolean; error?: string }>;
  onAdjustWithdrawAds?: (input: {
    targetUid: string;
    deltaAds?: number;
    targetAds?: number;
  }) => Promise<UserFarmProfile>;
  taskPricingConfig?: TaskPricingConfig;
  onSaveTaskPricingConfig?: (
    config: Omit<TaskPricingConfig, 'updatedAtMs'>,
  ) => Promise<boolean | void>;
  systemResetConfig?: SystemResetConfig;
  onExecuteDataReset?: (
    onProgress?: (stage: string) => void,
  ) => Promise<{ ok: boolean; error?: string; summary?: string }>;
  maintenanceConfig?: MaintenanceConfig;
  onSaveMaintenanceConfig?: (
    config: Omit<MaintenanceConfig, 'updatedAtMs'>,
  ) => Promise<MaintenanceConfig | boolean | null | void>;
}

const AD_PROVIDER_CARDS: Array<{
  id: AdProviderType;
  label: string;
  detail: string;
}> = [
  { id: 'countdown', label: 'Built-in Timer', detail: 'Zero-dependency rewarded countdown' },
  { id: 'adsgram', label: 'AdsGram SDK', detail: 'Telegram Mini App native video' },
  { id: 'gigapub', label: 'Gigapub SDK', detail: 'Interactive rewarded ad zone' },
  { id: 'monetag', label: 'Monetag Zone', detail: 'Rewarded interstitial zone SDK' },
  { id: 'custom_sponsor', label: 'Custom Sponsor', detail: 'Branded partner spotlight modal' },
];

const USER_COUNT_PRESETS: Array<{ value: number; label: string; tag: string }> = [
  { value: 1, label: '1 User', tag: '1-to-1 Gift' },
  { value: 10, label: '10 Users', tag: 'Small Group' },
  { value: 25, label: '25 Users', tag: 'Squad Drop' },
  { value: 50, label: '50 Users', tag: 'Community' },
  { value: 100, label: '100 Users', tag: 'Channel Drop' },
  { value: 500, label: '500 Users', tag: 'Mega Event' },
  { value: 0, label: 'Unlimited', tag: 'Open Claim' },
];

const EXPIRY_PRESETS: Array<{ hours: number; label: string }> = [
  { hours: 24, label: '24 Hours' },
  { hours: 72, label: '72 Hours' },
  { hours: 168, label: '7 Days' },
  { hours: 720, label: '30 Days' },
  { hours: 0, label: 'No Expiry' },
];

const COIN_REWARD_PRESETS = [150, 350, 500, 1000, 2500, 5000];
const EGG_REWARD_PRESETS = [500, 1500, 5000, 10000, 25000];
const CODE_PREFIX_PRESETS = ['GIFT', 'VIP', 'DROP', 'HEN'];

const TASK_CATEGORIES: Array<{ id: TaskDefinition['category']; label: string }> = [
  { id: 'social', label: 'Social' },
  { id: 'daily', label: 'Daily' },
  { id: 'exclusive', label: 'Exclusive' },
  { id: 'partner', label: 'Partner' },
];

const TASK_ICONS: Array<{ id: string; label: string }> = [
  { id: 'send', label: 'Telegram' },
  { id: 'megaphone', label: 'Channel' },
  { id: 'gift', label: 'Gift' },
  { id: 'flame', label: 'Hot' },
  { id: 'link', label: 'Link' },
  { id: 'users', label: 'Squad' },
];

function renderPreviewIcon(icon: string) {
  switch (icon) {
    case 'megaphone':
      return <Megaphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    case 'gift':
      return <Gift className="w-4 h-4 text-rose-500 dark:text-rose-400" />;
    case 'flame':
      return <Flame className="w-4 h-4 text-orange-500 dark:text-orange-400" />;
    case 'users':
      return <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    case 'send':
      return <Send className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    default:
      return <Link2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
  }
}

function formatExpiryLabel(hours: number): string {
  if (hours <= 0) return 'No expiry';
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '24 hours' : `${days} days`;
}

export function AdminPanelView({
  playerId,
  adminUnlocked,
  adminPasscodeSource = 'default',
  adminPasscodeUpdatedAtMs = 0,
  serverBotConfigured,
  onVerifyAdminPasscode,
  onTestChannels,
  channelDiagnosticLogs = [],
  loadingChannelLogs = false,
  channelLogsError = null,
  onRefreshChannelLogs,
  systemDiagnostics = null,
  loadingSystemDiagnostics = false,
  systemDiagnosticsError = null,
  onFetchSystemDiagnostics,
  onLockAdmin,
  withdrawRequests,
  withdrawApproveTemplate = DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
  onSaveWithdrawApproveTemplate,
  customTasks,
  adConfig,
  channelsConfig,
  promoCodes,
  recentPlayers,
  bannedUsers,
  adminsConfig,
  onBack,
  onTabTap,
  onReviewWithdrawal,
  onCreateTask,
  onToggleTask,
  onDeleteTask,
  onSaveAdConfig,
  onSaveChannelsConfig,
  onCreatePromoCode,
  onTogglePromoCode,
  onDeletePromoCode,
  onBanPlayer,
  onUnbanPlayer,
  onSearchUsers,
  onFetchPlayerReferrals,
  onAdjustCoins,
  onAdjustReferralCount,
  onAddReferralRelation,
  onRemoveReferralRelation,
  onAddAdmin,
  onRemoveAdmin,
  onFetchBroadcastStats,
  onSyncBotSubscribers,
  onSendBroadcast,
  botConfigStatus = null,
  onSaveBotToken,
  onClearBotToken,
  onAdjustWithdrawAds,
  taskPricingConfig = DEFAULT_TASK_PRICING_CONFIG,
  onSaveTaskPricingConfig,
  systemResetConfig,
  onExecuteDataReset,
  maintenanceConfig = DEFAULT_MAINTENANCE_CONFIG,
  onSaveMaintenanceConfig,
}: AdminPanelViewProps) {
  const extraAdminIds = useMemo(
    () => getEffectiveAdminIds(adminsConfig),
    [adminsConfig],
  );
  const isAuthorizedAdmin = isAdminPlayerId(playerId, extraAdminIds);

  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscodeInput, setShowPasscodeInput] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [verifyingPasscode, setVerifyingPasscode] = useState(false);

  type AdminSectionTab =
    | 'withdrawals'
    | 'users'
    | 'admins'
    | 'channels'
    | 'promos'
    | 'tasks'
    | 'ads'
    | 'ad_ids'
    | 'broadcast'
    | 'maintenance'
    | 'diagnostics'
    | 'reset';
  type AdminPrimaryGroup = 'payouts' | 'users' | 'growth' | 'bot' | 'system';

  const [tab, setTab] = useState<AdminSectionTab>('withdrawals');
  const [groupLastTab, setGroupLastTab] = useState<Record<AdminPrimaryGroup, AdminSectionTab>>({
    payouts: 'withdrawals',
    users: 'users',
    growth: 'tasks',
    bot: 'channels',
    system: 'maintenance',
  });

  const getPrimaryGroupForTab = (t: AdminSectionTab): AdminPrimaryGroup => {
    switch (t) {
      case 'withdrawals':
        return 'payouts';
      case 'users':
      case 'admins':
        return 'users';
      case 'tasks':
      case 'promos':
      case 'ads':
      case 'ad_ids':
        return 'growth';
      case 'channels':
      case 'broadcast':
        return 'bot';
      case 'maintenance':
      case 'diagnostics':
      case 'reset':
        return 'system';
    }
  };

  const navigateAdminTab = (nextTab: AdminSectionTab) => {
    onTabTap?.();
    setTab(nextTab);
    const group = getPrimaryGroupForTab(nextTab);
    setGroupLastTab((prev) => ({ ...prev, [group]: nextTab }));
  };

  const navigatePrimaryGroup = (group: AdminPrimaryGroup) => {
    const target = groupLastTab[group];
    navigateAdminTab(target);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const activePrimaryGroup = getPrimaryGroupForTab(tab);
  const [diagnosticsAutoRefresh, setDiagnosticsAutoRefresh] = useState(false);
  const [diagnosticsLogFilter, setDiagnosticsLogFilter] = useState<'all' | 'issues' | 'bot'>('all');
  const [wdFilter, setWdFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [wdSearch, setWdSearch] = useState('');
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Payout approval user DM template editor state
  const [wdTemplateOpen, setWdTemplateOpen] = useState(false);
  const [wdMsgDraft, setWdMsgDraft] = useState(withdrawApproveTemplate.messageTemplate);
  const [wdBtnTextDraft, setWdBtnTextDraft] = useState(withdrawApproveTemplate.buttonText);
  const [wdBtnUrlDraft, setWdBtnUrlDraft] = useState(withdrawApproveTemplate.buttonUrlTemplate);
  const [savingWdTemplate, setSavingWdTemplate] = useState(false);
  const [wdTemplateFeedback, setWdTemplateFeedback] = useState<string | null>(null);

  useEffect(() => {
    setWdMsgDraft(withdrawApproveTemplate.messageTemplate);
    setWdBtnTextDraft(withdrawApproveTemplate.buttonText);
    setWdBtnUrlDraft(withdrawApproveTemplate.buttonUrlTemplate);
  }, [withdrawApproveTemplate]);

  // Paid User Task Pricing (+ Add Task) state
  const resolvedTaskPricing = useMemo(
    () => resolveTaskPricingConfig(taskPricingConfig),
    [taskPricingConfig],
  );
  const [minTaskPriceDraft, setMinTaskPriceDraft] = useState(
    String(resolvedTaskPricing.minBudgetCoins),
  );
  const [channelCheckFeeDraft, setChannelCheckFeeDraft] = useState(
    String(resolvedTaskPricing.channelCheckFeeCoins),
  );
  const [taskFeePercentDraft, setTaskFeePercentDraft] = useState(
    String(Math.round(resolvedTaskPricing.platformFeeRate * 100)),
  );
  const [savingTaskPricing, setSavingTaskPricing] = useState(false);
  const [taskPricingFeedback, setTaskPricingFeedback] = useState<string | null>(null);

  useEffect(() => {
    setMinTaskPriceDraft(String(resolvedTaskPricing.minBudgetCoins));
    setChannelCheckFeeDraft(String(resolvedTaskPricing.channelCheckFeeCoins));
    setTaskFeePercentDraft(String(Math.round(resolvedTaskPricing.platformFeeRate * 100)));
  }, [resolvedTaskPricing]);

  // Data Reset state
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resettingData, setResettingData] = useState(false);
  const [resetElapsedSec, setResetElapsedSec] = useState(0);
  const [resetProgressText, setResetProgressText] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!resettingData) {
      setResetElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    setResetElapsedSec(0);
    const intervalId = window.setInterval(() => {
      setResetElapsedSec(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [resettingData]);

  // Maintenance Mode state
  const [maintEnabledDraft, setMaintEnabledDraft] = useState<boolean>(
    Boolean(maintenanceConfig.enabled),
  );
  const [maintTitleDraft, setMaintTitleDraft] = useState<string>(
    maintenanceConfig.title || DEFAULT_MAINTENANCE_CONFIG.title,
  );
  const [maintMessageDraft, setMaintMessageDraft] = useState<string>(
    maintenanceConfig.message || DEFAULT_MAINTENANCE_CONFIG.message,
  );
  const [maintEtaDraft, setMaintEtaDraft] = useState<string>(
    maintenanceConfig.estimatedReturn ?? DEFAULT_MAINTENANCE_CONFIG.estimatedReturn,
  );
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    setMaintEnabledDraft(Boolean(maintenanceConfig.enabled));
    setMaintTitleDraft(maintenanceConfig.title || DEFAULT_MAINTENANCE_CONFIG.title);
    setMaintMessageDraft(maintenanceConfig.message || DEFAULT_MAINTENANCE_CONFIG.message);
    setMaintEtaDraft(
      maintenanceConfig.estimatedReturn ?? DEFAULT_MAINTENANCE_CONFIG.estimatedReturn,
    );
  }, [maintenanceConfig]);

  const handleSaveMaintenanceSubmit = async (nextEnabledOverride?: boolean) => {
    if (!onSaveMaintenanceConfig || savingMaintenance) return;
    const enabledValue =
      typeof nextEnabledOverride === 'boolean' ? nextEnabledOverride : maintEnabledDraft;
    setSavingMaintenance(true);
    setMaintenanceFeedback(null);
    try {
      const res = await onSaveMaintenanceConfig({
        enabled: enabledValue,
        title: maintTitleDraft.trim() || DEFAULT_MAINTENANCE_CONFIG.title,
        message: maintMessageDraft.trim() || DEFAULT_MAINTENANCE_CONFIG.message,
        estimatedReturn: maintEtaDraft.trim(),
        updatedBy: playerId,
      });
      if (res) {
        setMaintEnabledDraft(enabledValue);
        setMaintenanceFeedback({
          ok: true,
          text: enabledValue
            ? 'Maintenance Mode is now ON. Non-admin users will see the maintenance page immediately.'
            : 'Maintenance Mode is now OFF. All users can access the app normally.',
        });
      } else {
        setMaintenanceFeedback({
          ok: false,
          text: 'Could not save Maintenance Mode settings. Check permissions and retry.',
        });
      }
    } catch (err) {
      setMaintenanceFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to save Maintenance Mode.',
      });
    } finally {
      setSavingMaintenance(false);
    }
  };

  // User Management & Inspector state
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'recent' | 'active' | 'banned'>('recent');
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [cloudSearchResults, setCloudSearchResults] = useState<UserFarmProfile[] | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<UserFarmProfile | null>(null);
  const [selectedPlayerReferrals, setSelectedPlayerReferrals] = useState<ReferralRecord[]>([]);
  const [loadingSelectedRefs, setLoadingSelectedRefs] = useState(false);
  const [coinAmountInput, setCoinAmountInput] = useState('1000');
  const [coinNoteInput, setCoinNoteInput] = useState('');
  const [referCountInput, setReferCountInput] = useState('1');
  const [withdrawAdsInput, setWithdrawAdsInput] = useState('30');
  const [linkFriendIdInput, setLinkFriendIdInput] = useState('');
  const [linkBonusCoinsInput, setLinkBonusCoinsInput] = useState('150');
  const [userActionBusy, setUserActionBusy] = useState<string | null>(null);
  const [userActionFeedback, setUserActionFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Telegram Bot Token & Optional Backend URL state
  const [botTokenDraft, setBotTokenDraft] = useState('');
  const [showBotTokenDraft, setShowBotTokenDraft] = useState(false);
  const [savingBotToken, setSavingBotToken] = useState(false);
  const [botTokenFeedback, setBotTokenFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [backendUrlDraft, setBackendUrlDraft] = useState(() => getConfiguredApiBaseUrl());
  const [backendUrlFeedback, setBackendUrlFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Quick Standalone Referral Linker state
  const [quickReferrerInput, setQuickReferrerInput] = useState('');
  const [quickReferredInput, setQuickReferredInput] = useState('');
  const [quickReferBonusInput, setQuickReferBonusInput] = useState('150');
  const [quickReferBusy, setQuickReferBusy] = useState(false);
  const [quickReferFeedback, setQuickReferFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Ban User state
  const [banTargetIdInput, setBanTargetIdInput] = useState('');
  const [banReasonInput, setBanReasonInput] = useState('');
  const [banFormError, setBanFormError] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);

  // Admin Roles state
  const [adminIdInput, setAdminIdInput] = useState('');
  const [adminNameInput, setAdminNameInput] = useState('');
  const [adminFormBusy, setAdminFormBusy] = useState(false);
  const [removingAdminId, setRemovingAdminId] = useState<string | null>(null);
  const [adminFormFeedback, setAdminFormFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  // Check Channels & Get Code channel management draft state
  const [channelsEnabledDraft, setChannelsEnabledDraft] = useState<boolean>(channelsConfig.enabled);
  const [channelsDraft, setChannelsDraft] = useState<RequiredTelegramChannel[]>(
    channelsConfig.channels,
  );
  const [getCodeChannelDraft, setGetCodeChannelDraft] = useState<string>(
    channelsConfig.getCodeChannelUrl ?? DEFAULT_GET_CODE_CHANNEL_URL,
  );
  const [newChannelHandle, setNewChannelHandle] = useState('');
  const [newChannelTitle, setNewChannelTitle] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [newChannelUrl, setNewChannelUrl] = useState('');
  const [channelFormError, setChannelFormError] = useState<string | null>(null);
  const [savingChannels, setSavingChannels] = useState(false);
  const [channelsSaveFeedback, setChannelsSaveFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [testingChannels, setTestingChannels] = useState(false);
  const [channelDiagnostic, setChannelDiagnostic] = useState<ChannelDiagnosticResult | null>(null);

  useEffect(() => {
    setChannelsEnabledDraft(channelsConfig.enabled);
    setChannelsDraft(channelsConfig.channels);
    setGetCodeChannelDraft(channelsConfig.getCodeChannelUrl ?? DEFAULT_GET_CODE_CHANNEL_URL);
  }, [channelsConfig]);

  // New task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskDefinition['category']>('partner');
  const [taskCoins, setTaskCoins] = useState('250');
  const [taskSlots, setTaskSlots] = useState('200');
  const [taskIcon, setTaskIcon] = useState('send');
  const [taskUrl, setTaskUrl] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Broadcast state
  const [bcastTitle, setBcastTitle] = useState('');
  const [bcastMessage, setBcastMessage] = useState('');
  const [bcastMediaType, setBcastMediaType] = useState<'none' | 'photo' | 'video' | 'animation'>('none');
  const [bcastMediaUrl, setBcastMediaUrl] = useState('');
  const [bcastMediaDataUrl, setBcastMediaDataUrl] = useState('');
  const [bcastMediaFilename, setBcastMediaFilename] = useState('');
  const [bcastMediaFileSize, setBcastMediaFileSize] = useState(0);
  const [bcastFileError, setBcastFileError] = useState<string | null>(null);
  const [bcastButtonText, setBcastButtonText] = useState('');
  const [bcastButtonUrl, setBcastButtonUrl] = useState('');
  const [bcastExcludeBanned, setBcastExcludeBanned] = useState(true);
  const [bcastPreviewError, setBcastPreviewError] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState<'test' | 'all' | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [bcastAudienceStats, setBcastAudienceStats] = useState<BroadcastAudienceStats | null>(null);
  const [loadingBcastStats, setLoadingBcastStats] = useState(false);
  const [syncingBotUsers, setSyncingBotUsers] = useState(false);

  useEffect(() => {
    if (!adminUnlocked || tab !== 'broadcast' || !onFetchBroadcastStats) return;
    let cancelled = false;
    setLoadingBcastStats(true);
    void onFetchBroadcastStats(bcastExcludeBanned)
      .then((res) => {
        if (!cancelled && res.ok) {
          setBcastAudienceStats(res);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBcastStats(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminUnlocked, bcastExcludeBanned, onFetchBroadcastStats, tab]);

  useEffect(() => {
    if (!adminUnlocked || tab !== 'diagnostics' || !onFetchSystemDiagnostics) return;
    void onFetchSystemDiagnostics(false);
    if (!diagnosticsAutoRefresh) return;
    const timer = window.setInterval(() => {
      void onFetchSystemDiagnostics(true);
    }, 10_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [adminUnlocked, diagnosticsAutoRefresh, onFetchSystemDiagnostics, tab]);

  // Guided 3-step Gift Code Generator state
  const [giftStep, setGiftStep] = useState<1 | 2 | 3>(1);
  const [giftMaxUsers, setGiftMaxUsers] = useState<number>(50);
  const [giftCustomUsersInput, setGiftCustomUsersInput] = useState<string>('50');
  const [giftExpiryHours, setGiftExpiryHours] = useState<number>(72);
  const [giftRewardType, setGiftRewardType] = useState<PromoRewardType>('coins');
  const [giftCoinsAmount, setGiftCoinsAmount] = useState<string>('500');
  const [giftEggsAmount, setGiftEggsAmount] = useState<string>('1500');
  const [giftChickenBreed, setGiftChickenBreed] = useState<ChickenBreedId>('leghorn');
  const [giftChickenQty, setGiftChickenQty] = useState<number>(1);
  const [giftCodePrefix, setGiftCodePrefix] = useState<string>('GIFT');
  const [giftCodeInput, setGiftCodeInput] = useState<string>(() => generateGiftCodeString('GIFT'));
  const [giftLabelInput, setGiftLabelInput] = useState<string>('');
  const [savingPromo, setSavingPromo] = useState(false);
  const [promoFormError, setPromoFormError] = useState<string | null>(null);
  const [lastCreatedPromo, setLastCreatedPromo] = useState<DynamicPromoCode | null>(null);
  const [promoFilter, setPromoFilter] = useState<'all' | 'active' | 'ended'>('all');

  // Ad config draft state
  const [adDraft, setAdDraft] = useState<Omit<AdConfig, 'updatedAtMs'>>(() => ({
    provider: adConfig.provider,
    adsgramBlockId: adConfig.adsgramBlockId,
    adsgramTaskBlockId: adConfig.adsgramTaskBlockId || '',
    gigapubProjectId: adConfig.gigapubProjectId || '',
    monetagZoneId: adConfig.monetagZoneId,
    customTitle: adConfig.customTitle,
    customDescription: adConfig.customDescription,
    customUrl: adConfig.customUrl,
    watchSeconds: adConfig.watchSeconds,
    bannerEnabled: adConfig.bannerEnabled,
    bannerTitle: adConfig.bannerTitle,
    bannerSubtitle: adConfig.bannerSubtitle,
    bannerCtaText: adConfig.bannerCtaText,
    bannerUrl: adConfig.bannerUrl,
  }));
  const [savingAds, setSavingAds] = useState(false);
  const [adsSaveFeedback, setAdsSaveFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [templateInput, setTemplateInput] = useState<string>(() =>
    formatAdConfigTemplate({
      provider: adConfig.provider,
      adsgramBlockId: adConfig.adsgramBlockId,
      adsgramTaskBlockId: adConfig.adsgramTaskBlockId || '',
      gigapubProjectId: adConfig.gigapubProjectId || '',
      monetagZoneId: adConfig.monetagZoneId,
      customTitle: adConfig.customTitle,
      customDescription: adConfig.customDescription,
      customUrl: adConfig.customUrl,
      watchSeconds: adConfig.watchSeconds,
      bannerEnabled: adConfig.bannerEnabled,
      bannerTitle: adConfig.bannerTitle,
      bannerSubtitle: adConfig.bannerSubtitle,
      bannerCtaText: adConfig.bannerCtaText,
      bannerUrl: adConfig.bannerUrl,
    }),
  );
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);

  useEffect(() => {
    const synced = {
      provider: adConfig.provider,
      adsgramBlockId: adConfig.adsgramBlockId,
      adsgramTaskBlockId: adConfig.adsgramTaskBlockId || '',
      gigapubProjectId: adConfig.gigapubProjectId || '',
      monetagZoneId: adConfig.monetagZoneId,
      customTitle: adConfig.customTitle,
      customDescription: adConfig.customDescription,
      customUrl: adConfig.customUrl,
      watchSeconds: adConfig.watchSeconds,
      bannerEnabled: adConfig.bannerEnabled,
      bannerTitle: adConfig.bannerTitle,
      bannerSubtitle: adConfig.bannerSubtitle,
      bannerCtaText: adConfig.bannerCtaText,
      bannerUrl: adConfig.bannerUrl,
    };
    setAdDraft(synced);
    setTemplateInput(formatAdConfigTemplate(synced));
  }, [adConfig]);

  const pendingRequests = useMemo(
    () => withdrawRequests.filter((r) => r.status === 'pending'),
    [withdrawRequests],
  );
  const approvedCount = useMemo(
    () => withdrawRequests.filter((r) => r.status === 'approved').length,
    [withdrawRequests],
  );
  const rejectedCount = useMemo(
    () => withdrawRequests.filter((r) => r.status === 'rejected').length,
    [withdrawRequests],
  );
  const pendingGramVolume = useMemo(
    () => pendingRequests.reduce((sum, r) => sum + (Number(r.gramAmount) || 0), 0),
    [pendingRequests],
  );
  const activeTaskCount = useMemo(
    () => customTasks.filter((t) => t.isActive !== false).length,
    [customTasks],
  );

  const activePromoCount = useMemo(() => {
    const now = Date.now();
    return promoCodes.filter((p) => {
      const expired = p.expiresAtMs > 0 && now > p.expiresAtMs;
      const maxed = p.maxUses > 0 && p.usedCount >= p.maxUses;
      return p.isActive && !expired && !maxed;
    }).length;
  }, [promoCodes]);

  const visibleRequests = useMemo(() => {
    const query = wdSearch.trim().toLowerCase();
    return withdrawRequests.filter((r) => {
      if (wdFilter !== 'all' && r.status !== wdFilter) return false;
      if (!query) return true;
      return (
        r.displayName.toLowerCase().includes(query) ||
        r.handle.toLowerCase().includes(query) ||
        r.walletAddress.toLowerCase().includes(query) ||
        r.memo.toLowerCase().includes(query)
      );
    });
  }, [wdFilter, wdSearch, withdrawRequests]);

  const visiblePromos = useMemo(() => {
    const now = Date.now();
    return promoCodes.filter((p) => {
      const expired = p.expiresAtMs > 0 && now > p.expiresAtMs;
      const maxed = p.maxUses > 0 && p.usedCount >= p.maxUses;
      const isLive = p.isActive && !expired && !maxed;
      if (promoFilter === 'active') return isLive;
      if (promoFilter === 'ended') return !isLive;
      return true;
    });
  }, [promoCodes, promoFilter]);

  const draftRewardSummary = useMemo(
    () =>
      formatPromoRewardSummary({
        rewardType: giftRewardType,
        coins: giftRewardType === 'coins' ? Math.max(1, Number(giftCoinsAmount) || 0) : 0,
        eggs: giftRewardType === 'eggs' ? Math.max(1, Number(giftEggsAmount) || 0) : 0,
        chickenBreed: giftChickenBreed,
        chickenQty: giftChickenQty,
      }),
    [giftChickenBreed, giftChickenQty, giftCoinsAmount, giftEggsAmount, giftRewardType],
  );

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (taskTitle.trim().length < 2) return;
    setSavingTask(true);
    try {
      await onCreateTask({
        title: taskTitle.trim(),
        category: taskCategory,
        rewardCoins: Math.max(1, Number(taskCoins) || 50),
        icon: taskIcon,
        actionUrl: taskUrl.trim(),
        totalSlots: Math.max(0, Number(taskSlots) || 0),
      });
      setTaskTitle('');
      setTaskUrl('');
    } finally {
      setSavingTask(false);
    }
  };

  const handleSaveAdsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAds(true);
    setAdsSaveFeedback(null);
    try {
      const ok = await onSaveAdConfig(adDraft);
      if (ok !== false) {
        setTemplateStatus('Saved live to database & synced across users!');
        setAdsSaveFeedback({
          type: 'ok',
          text: 'Ad settings saved & synced live across all active players.',
        });
      } else {
        setAdsSaveFeedback({
          type: 'error',
          text: 'Could not save ad settings — check Firestore permissions or network.',
        });
      }
    } finally {
      setSavingAds(false);
    }
  };

  const handleApplyAdTemplate = () => {
    const { next, appliedKeys } = parseAdConfigTemplate(templateInput, adDraft);
    if (appliedKeys.length === 0) {
      setTemplateStatus('No recognized keys found. Keep KEY=VALUE lines like ADSGRAM_BLOCK_ID=1234.');
      return;
    }
    onTabTap?.();
    setAdDraft(next);
    setTemplateInput(formatAdConfigTemplate(next));
    setTemplateStatus(
      `Applied ${appliedKeys.length} field${appliedKeys.length > 1 ? 's' : ''} (${appliedKeys.join(', ')}) — click Save below to publish live.`,
    );
  };

  const savedAdIdsCount = useMemo(
    () =>
      [
        adConfig.adsgramBlockId,
        adConfig.adsgramTaskBlockId,
        adConfig.gigapubProjectId,
        adConfig.monetagZoneId,
      ].filter((v) => Boolean(v && v.trim())).length,
    [
      adConfig.adsgramBlockId,
      adConfig.adsgramTaskBlockId,
      adConfig.gigapubProjectId,
      adConfig.monetagZoneId,
    ],
  );

  const handleGenerateGiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoFormError(null);
    const cleanCode = giftCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (cleanCode.length < 3) {
      setPromoFormError('Code must have at least 3 characters (A-Z, 0-9, -, _).');
      return;
    }

    const defaultLabel =
      giftRewardType === 'eggs'
        ? 'Egg Gift Drop'
        : giftRewardType === 'chicken'
          ? `${CHICKEN_PACKS.find((p) => p.id === giftChickenBreed)?.name || 'Hen'} Gift`
          : 'Coin Gift Drop';

    setSavingPromo(true);
    try {
      const created = await onCreatePromoCode({
        code: cleanCode,
        label: giftLabelInput.trim() || defaultLabel,
        coins: giftRewardType === 'coins' ? Math.max(1, Number(giftCoinsAmount) || 100) : 0,
        rewardType: giftRewardType,
        eggs: giftRewardType === 'eggs' ? Math.max(1, Number(giftEggsAmount) || 100) : undefined,
        chickenBreed: giftRewardType === 'chicken' ? giftChickenBreed : undefined,
        chickenQty: giftRewardType === 'chicken' ? Math.max(1, giftChickenQty) : undefined,
        maxUses: Math.max(0, giftMaxUsers),
        expiresInHours: Math.max(0, giftExpiryHours),
      });
      if (created) {
        onTabTap?.();
        setLastCreatedPromo(created);
        setGiftCodeInput(generateGiftCodeString(giftCodePrefix));
        setGiftLabelInput('');
        setGiftStep(1);
      }
    } finally {
      setSavingPromo(false);
    }
  };

  const activeChannelsCount = useMemo(
    () => (channelsDraft ?? []).filter((ch) => ch.enabled !== false).length,
    [channelsDraft],
  );

  const handleAddChannelDraft = (e: React.FormEvent) => {
    e.preventDefault();
    setChannelFormError(null);
    if (channelsDraft.length >= 10) {
      setChannelFormError('Maximum 10 required channels can be configured.');
      return;
    }
    const normalized = normalizeTelegramChannelEntry(
      {
        handle: newChannelHandle,
        title: newChannelTitle,
        description: newChannelDesc,
        url: newChannelUrl,
        enabled: true,
      },
      channelsDraft.length,
    );
    if (!normalized) {
      const looksLikeInvite = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(\+|joinchat\/)/i.test(
        newChannelHandle.trim(),
      );
      setChannelFormError(
        looksLikeInvite
          ? 'Private invite link detected! Put the numeric -100... Channel ID in the first box and paste the invite link into Optional Join URL.'
          : 'Enter a valid @username, https://t.me/ link, or numeric -100... channel ID.',
      );
      return;
    }
    if (
      channelsDraft.some(
        (existing) => existing.handle.toLowerCase() === normalized.handle.toLowerCase(),
      )
    ) {
      setChannelFormError(`${normalized.handle} is already in your Check Channels list.`);
      return;
    }
    onTabTap?.();
    setChannelsDraft((prev) => [...prev, normalized]);
    setNewChannelHandle('');
    setNewChannelTitle('');
    setNewChannelDesc('');
    setNewChannelUrl('');
  };

  const handleToggleChannelDraft = (channelId: string) => {
    onTabTap?.();
    setChannelsDraft((prev) =>
      prev.map((ch) =>
        ch.id === channelId ? { ...ch, enabled: ch.enabled === false } : ch,
      ),
    );
  };

  const handleRemoveChannelDraft = (channelId: string) => {
    onTabTap?.();
    setChannelsDraft((prev) => prev.filter((ch) => ch.id !== channelId));
  };

  const handleSaveChannelsSubmit = async () => {
    setSavingChannels(true);
    setChannelsSaveFeedback(null);
    try {
      const resolvedGetCode =
        normalizeGetCodeChannelUrl(getCodeChannelDraft) || getCodeChannelDraft.trim();
      setGetCodeChannelDraft(resolvedGetCode);
      const ok = await onSaveChannelsConfig({
        enabled: channelsEnabledDraft,
        channels: channelsDraft,
        getCodeChannelUrl: resolvedGetCode,
      });
      if (ok !== false) {
        setChannelsSaveFeedback({
          type: 'ok',
          text: 'Channel settings saved & synced live!',
        });
      } else {
        setChannelsSaveFeedback({
          type: 'error',
          text: 'Could not save channel settings — check Firestore permissions or network.',
        });
      }
    } finally {
      setSavingChannels(false);
    }
  };

  const handleTestChannelsClick = async () => {
    if (!onTestChannels) return;
    setTestingChannels(true);
    try {
      onTabTap?.();
      const activeList = channelsDraft.filter((ch) => ch.enabled !== false && Boolean(ch.handle));
      const res = await onTestChannels(activeList);
      setChannelDiagnostic(res);
      if (onRefreshChannelLogs) {
        void onRefreshChannelLogs();
      }
    } finally {
      setTestingChannels(false);
    }
  };

  useEffect(() => {
    if (!adminUnlocked || tab !== 'channels' || !onRefreshChannelLogs) return;
    void onRefreshChannelLogs();
  }, [adminUnlocked, onRefreshChannelLogs, tab]);

  const mergedPlayersDirectory = useMemo(() => {
    const byUid = new Map<string, UserFarmProfile>();
    for (const p of recentPlayers) {
      byUid.set(p.uid, p);
    }
    for (const p of cloudSearchResults ?? []) {
      byUid.set(p.uid, p);
    }
    if (selectedPlayer) {
      byUid.set(selectedPlayer.uid, selectedPlayer);
    }
    return Array.from(byUid.values()).sort(
      (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0),
    );
  }, [cloudSearchResults, recentPlayers, selectedPlayer]);

  const sortedRecentPlayers = useMemo(
    () =>
      [...recentPlayers].sort(
        (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0),
      ),
    [recentPlayers],
  );

  // Keep selectedPlayer fresh when recentPlayers updates live
  useEffect(() => {
    if (!selectedPlayer) return;
    const updated = recentPlayers.find((p) => p.uid === selectedPlayer.uid);
    if (updated) {
      setSelectedPlayer(updated);
    }
  }, [recentPlayers, selectedPlayer]);

  const findBanForPlayer = (uid: string): BannedUserRecord | undefined =>
    bannedUsers.find((b) => matchesBannedUserRecord(uid, b));

  const visibleRecentPlayers = useMemo(() => {
    const source = cloudSearchResults !== null ? mergedPlayersDirectory : sortedRecentPlayers;
    const filteredBySearch = filterPlayersBySearchQuery(source, userSearch);
    return filteredBySearch.filter((p) => {
      const ban = findBanForPlayer(p.uid);
      if (userFilter === 'active' && ban) return false;
      if (userFilter === 'banned' && !ban) return false;
      return true;
    });
  }, [bannedUsers, cloudSearchResults, mergedPlayersDirectory, sortedRecentPlayers, userFilter, userSearch]);

  const visibleBannedRecords = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return bannedUsers.filter((b) => {
      if (!q) return true;
      const numericId = extractTelegramNumericUserId(b.uid) || '';
      return (
        b.uid.toLowerCase().includes(q) ||
        numericId.toLowerCase().includes(q) ||
        b.displayName.toLowerCase().includes(q) ||
        b.handle.toLowerCase().includes(q) ||
        b.reason.toLowerCase().includes(q)
      );
    });
  }, [bannedUsers, userSearch]);

  const syncUpdatedPlayerIntoState = (updated: UserFarmProfile | undefined) => {
    if (!updated) return;
    setSelectedPlayer((prev) => (prev && prev.uid === updated.uid ? updated : prev));
    setCloudSearchResults((prev) =>
      prev ? prev.map((p) => (p.uid === updated.uid ? updated : p)) : prev,
    );
  };

  const handleSelectPlayer = async (player: UserFarmProfile) => {
    onTabTap?.();
    setSelectedPlayer(player);
    setUserActionFeedback(null);
    setLoadingSelectedRefs(true);
    try {
      const refs = await onFetchPlayerReferrals(player.uid);
      setSelectedPlayerReferrals(refs);
    } catch {
      setSelectedPlayerReferrals([]);
    } finally {
      setLoadingSelectedRefs(false);
    }
  };

  const handleSearchUsersSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const queryText = userSearch.trim();
    if (!queryText) {
      setCloudSearchResults(null);
      return;
    }
    setSearchingUsers(true);
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      const results = await onSearchUsers(queryText);
      setCloudSearchResults(results);
      if (results.length === 1) {
        await handleSelectPlayer(results[0]);
      } else if (results.length === 0) {
        setUserActionFeedback({
          type: 'error',
          text: `No user found matching "${queryText}".`,
        });
      }
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to search users.',
      });
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleAdjustCoinsClick = async (direction: 1 | -1) => {
    if (!selectedPlayer) return;
    const raw = Math.trunc(Number(coinAmountInput));
    if (!Number.isFinite(raw) || raw <= 0) {
      setUserActionFeedback({ type: 'error', text: 'Enter a coin amount greater than 0.' });
      return;
    }
    setUserActionBusy(direction > 0 ? 'add_coins' : 'remove_coins');
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      const updated = await onAdjustCoins({
        targetUid: selectedPlayer.uid,
        deltaCoins: direction * raw,
        note: coinNoteInput.trim() || undefined,
      });
      syncUpdatedPlayerIntoState(updated);
      setSelectedPlayer(updated);
      setCoinNoteInput('');
      setUserActionFeedback({
        type: 'ok',
        text:
          direction > 0
            ? `Added +${raw.toLocaleString()} coins! New balance: ${Math.floor(updated.coins).toLocaleString()} coins.`
            : `Removed coins! New balance: ${Math.floor(updated.coins).toLocaleString()} coins.`,
      });
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update coins.',
      });
    } finally {
      setUserActionBusy(null);
    }
  };

  const handleAdjustReferCountClick = async (direction: 1 | -1) => {
    if (!selectedPlayer) return;
    const raw = Math.trunc(Number(referCountInput));
    if (!Number.isFinite(raw) || raw <= 0) {
      setUserActionFeedback({ type: 'error', text: 'Enter a referral count greater than 0.' });
      return;
    }
    setUserActionBusy(direction > 0 ? 'add_refers' : 'remove_refers');
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      const updated = await onAdjustReferralCount({
        targetUid: selectedPlayer.uid,
        deltaRefers: direction * raw,
      });
      syncUpdatedPlayerIntoState(updated);
      setSelectedPlayer(updated);
      setUserActionFeedback({
        type: 'ok',
        text:
          direction > 0
            ? `Added +${raw} referral(s)! Total refers: ${updated.referralCount}.`
            : `Removed referral(s)! Total refers: ${updated.referralCount}.`,
      });
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update referrals.',
      });
    } finally {
      setUserActionBusy(null);
    }
  };

  const handleAdjustWithdrawAdsClick = async (input: {
    deltaAds?: number;
    targetAds?: number;
    busyKey: string;
  }) => {
    if (!selectedPlayer || !onAdjustWithdrawAds) return;
    const currentAds = selectedPlayer.withdrawAdsWatched ?? 0;
    const check =
      typeof input.targetAds === 'number'
        ? computeAdminWithdrawAdsTarget(currentAds, input.targetAds)
        : computeAdminWithdrawAdsAdjustment(currentAds, input.deltaAds ?? 0);
    if (!check.ok) {
      setUserActionFeedback({ type: 'error', text: check.error });
      return;
    }

    setUserActionBusy(input.busyKey);
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      const updated = await onAdjustWithdrawAds({
        targetUid: selectedPlayer.uid,
        deltaAds: input.deltaAds,
        targetAds: input.targetAds,
      });
      syncUpdatedPlayerIntoState(updated);
      setSelectedPlayer(updated);
      const nextCount = updated.withdrawAdsWatched ?? 0;
      setUserActionFeedback({
        type: 'ok',
        text: `Updated withdraw ads progress to ${nextCount}/${MIN_WITHDRAW_ADS_WATCHED}${
          nextCount >= MIN_WITHDRAW_ADS_WATCHED ? ' (Withdraw Unlocked!)' : '.'
        }`,
      });
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update withdraw ads progress.',
      });
    } finally {
      setUserActionBusy(null);
    }
  };

  const handleSaveBotTokenSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!onSaveBotToken) return;
    const trimmed = botTokenDraft.trim();
    if (!trimmed) {
      setBotTokenFeedback({
        type: 'error',
        text: 'Paste your Telegram Bot Token (from @BotFather) first.',
      });
      return;
    }
    setSavingBotToken(true);
    setBotTokenFeedback(null);
    try {
      onTabTap?.();
      const res = await onSaveBotToken(trimmed);
      if (res.ok) {
        setBotTokenDraft('');
        setBotTokenFeedback({
          type: 'ok',
          text: res.botUsername
            ? `Verified & saved Telegram bot @${res.botUsername}!`
            : 'Verified & saved Telegram Bot Token!',
        });
      } else {
        setBotTokenFeedback({
          type: 'error',
          text: res.error || 'Failed to verify or save Bot Token.',
        });
      }
    } catch (err) {
      setBotTokenFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save Bot Token.',
      });
    } finally {
      setSavingBotToken(false);
    }
  };

  const handleClearBotTokenClick = async () => {
    if (!onClearBotToken) return;
    setSavingBotToken(true);
    setBotTokenFeedback(null);
    try {
      onTabTap?.();
      const res = await onClearBotToken();
      if (res.ok) {
        setBotTokenFeedback({
          type: 'ok',
          text: 'Cleared Admin-saved Bot Token.',
        });
      } else {
        setBotTokenFeedback({
          type: 'error',
          text: res.error || 'Failed to clear Bot Token.',
        });
      }
    } catch (err) {
      setBotTokenFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to clear Bot Token.',
      });
    } finally {
      setSavingBotToken(false);
    }
  };

  const handleSaveBackendUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onTabTap?.();
    const saved = setConfiguredApiBaseUrl(backendUrlDraft);
    setBackendUrlDraft(saved);
    setBackendUrlFeedback({
      type: 'ok',
      text: saved
        ? `Backend API URL set to ${saved}. Re-testing endpoints...`
        : 'Backend API URL reset to current site origin.',
    });
    if (onFetchSystemDiagnostics) {
      void onFetchSystemDiagnostics(true);
    }
    if (onRefreshChannelLogs) {
      void onRefreshChannelLogs();
    }
  };

  const handleLinkFriendUnderSelected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer || !linkFriendIdInput.trim()) return;
    setUserActionBusy('link_friend');
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      const bonus = Math.max(0, Math.trunc(Number(linkBonusCoinsInput) || 0));
      const res = await onAddReferralRelation({
        referrerIdOrCode: selectedPlayer.uid,
        referredIdOrCode: linkFriendIdInput.trim(),
        bonusCoins: bonus,
      });
      syncUpdatedPlayerIntoState(res.referrerProfile);
      syncUpdatedPlayerIntoState(res.referredProfile);
      setSelectedPlayer(res.referrerProfile);
      setSelectedPlayerReferrals((prev) => [
        res.referralRecord,
        ...prev.filter((r) => r.referredUid !== res.referralRecord.referredUid),
      ]);
      setLinkFriendIdInput('');
      setUserActionFeedback({
        type: 'ok',
        text: `Linked ${res.referredProfile.displayName} as active referral (+${bonus} coins)!`,
      });
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to link referral.',
      });
    } finally {
      setUserActionBusy(null);
    }
  };

  const handleRemoveReferralRow = async (referrerUid: string, referredUid: string) => {
    setUserActionBusy(`rm_ref_${referredUid}`);
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      const res = await onRemoveReferralRelation({ referrerUid, referredUid });
      syncUpdatedPlayerIntoState(res.referrerProfile);
      syncUpdatedPlayerIntoState(res.referredProfile);
      if (selectedPlayer?.uid === referrerUid && res.referrerProfile) {
        setSelectedPlayer(res.referrerProfile);
      } else if (selectedPlayer?.uid === referredUid && res.referredProfile) {
        setSelectedPlayer(res.referredProfile);
      }
      setSelectedPlayerReferrals((prev) => prev.filter((r) => r.referredUid !== referredUid));
      setUserActionFeedback({
        type: 'ok',
        text: 'Referral removed cleanly.',
      });
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove referral.',
      });
    } finally {
      setUserActionBusy(null);
    }
  };

  const handleQuickReferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickReferrerInput.trim() || !quickReferredInput.trim()) return;
    setQuickReferBusy(true);
    setQuickReferFeedback(null);
    try {
      onTabTap?.();
      const bonus = Math.max(0, Math.trunc(Number(quickReferBonusInput) || 0));
      const res = await onAddReferralRelation({
        referrerIdOrCode: quickReferrerInput.trim(),
        referredIdOrCode: quickReferredInput.trim(),
        bonusCoins: bonus,
      });
      syncUpdatedPlayerIntoState(res.referrerProfile);
      syncUpdatedPlayerIntoState(res.referredProfile);
      if (selectedPlayer?.uid === res.referrerProfile.uid) {
        setSelectedPlayer(res.referrerProfile);
        setSelectedPlayerReferrals((prev) => [
          res.referralRecord,
          ...prev.filter((r) => r.referredUid !== res.referralRecord.referredUid),
        ]);
      } else if (selectedPlayer?.uid === res.referredProfile.uid) {
        setSelectedPlayer(res.referredProfile);
      }
      setQuickReferrerInput('');
      setQuickReferredInput('');
      setQuickReferFeedback({
        type: 'ok',
        text: `Linked ${res.referredProfile.displayName} → Referrer ${res.referrerProfile.displayName} (+${bonus} coins).`,
      });
    } catch (err) {
      setQuickReferFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to link referral.',
      });
    } finally {
      setQuickReferBusy(false);
    }
  };

  const handleAddAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFormFeedback(null);
    const check = canAddAdminPlayerId(adminIdInput, adminsConfig);
    if (!check.ok) {
      setAdminFormFeedback({ type: 'error', text: check.error });
      return;
    }
    setAdminFormBusy(true);
    try {
      onTabTap?.();
      await onAddAdmin({
        targetId: check.canonicalId,
        displayName: adminNameInput.trim() || undefined,
      });
      setAdminIdInput('');
      setAdminNameInput('');
      setAdminFormFeedback({
        type: 'ok',
        text: `Admin access granted to ${check.canonicalId}!`,
      });
    } catch (err) {
      setAdminFormFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add Admin.',
      });
    } finally {
      setAdminFormBusy(false);
    }
  };

  const handleToggleAdminForPlayer = async (player: UserFarmProfile) => {
    if (isAdminPlayerId(player.uid)) return;
    const isCoAdmin = isAdminPlayerId(player.uid, extraAdminIds);
    setUserActionBusy('toggle_admin');
    setUserActionFeedback(null);
    try {
      onTabTap?.();
      if (isCoAdmin) {
        await onRemoveAdmin(player.uid);
        setUserActionFeedback({
          type: 'ok',
          text: `Removed Admin role from ${player.displayName}.`,
        });
      } else {
        await onAddAdmin({
          targetId: player.uid,
          displayName: player.displayName,
          handle: player.handle,
        });
        setUserActionFeedback({
          type: 'ok',
          text: `Granted Admin access to ${player.displayName}!`,
        });
      }
    } catch (err) {
      setUserActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update Admin role.',
      });
    } finally {
      setUserActionBusy(null);
    }
  };

  const handleRemoveAdminRow = async (targetId: string) => {
    setAdminFormFeedback(null);
    setRemovingAdminId(targetId);
    try {
      onTabTap?.();
      await onRemoveAdmin(targetId);
      setAdminFormFeedback({
        type: 'ok',
        text: `Removed Admin access for ${extractTelegramNumericUserId(targetId) || targetId}.`,
      });
    } catch (err) {
      setAdminFormFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove Admin.',
      });
    } finally {
      setRemovingAdminId(null);
    }
  };

  const handleManualBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanFormError(null);
    const check = canBanPlayerId(banTargetIdInput, extraAdminIds);
    if (!check.ok) {
      setBanFormError(check.error);
      return;
    }

    const matchedProfile = mergedPlayersDirectory.find(
      (p) =>
        p.uid === check.canonicalId ||
        matchesBannedUserRecord(p.uid, { uid: check.canonicalId }),
    );

    setBanningId(check.canonicalId);
    try {
      onTabTap?.();
      await onBanPlayer({
        targetId: check.canonicalId,
        displayName: matchedProfile?.displayName || '',
        handle: matchedProfile?.handle || '',
        reason: banReasonInput.trim() || 'Blocked by Administrator',
      });
      setBanTargetIdInput('');
    } catch (err) {
      setBanFormError(err instanceof Error ? err.message : 'Failed to block player.');
    } finally {
      setBanningId(null);
    }
  };

  const handleBanPlayerRow = async (player: UserFarmProfile) => {
    setBanFormError(null);
    const check = canBanPlayerId(player.uid, extraAdminIds);
    if (!check.ok) {
      setBanFormError(check.error);
      return;
    }
    setBanningId(player.uid);
    try {
      onTabTap?.();
      await onBanPlayer({
        targetId: player.uid,
        displayName: player.displayName,
        handle: player.handle,
        reason: banReasonInput.trim() || 'Blocked by Administrator',
      });
    } finally {
      setBanningId(null);
    }
  };

  const handleUnbanRow = async (targetId: string) => {
    setBanFormError(null);
    setBanningId(targetId);
    try {
      onTabTap?.();
      await onUnbanPlayer(targetId);
    } finally {
      setBanningId(null);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = passcodeInput.trim();
    if (!clean) {
      setPasscodeError('Please enter your Admin Passcode.');
      return;
    }
    setPasscodeError(null);
    setVerifyingPasscode(true);
    try {
      const result = await onVerifyAdminPasscode(clean);
      if (result.ok) {
        setPasscodeInput('');
      } else {
        setPasscodeError(result.error || 'Incorrect Admin Passcode.');
      }
    } finally {
      setVerifyingPasscode(false);
    }
  };

  if (!isAuthorizedAdmin) {
    return (
      <div className="animate-clay-enter space-y-6 pb-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onTabTap?.();
              onBack();
            }}
            aria-label="Back from admin panel"
            className="clay-btn clay-btn-neutral w-10 h-10 rounded-2xl flex items-center justify-center text-stone-700 dark:text-stone-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
              Admin Console
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Restricted to verified Telegram Admin ID {PRIMARY_ADMIN_TELEGRAM_ID}
            </p>
          </div>
        </div>

        <div className="clay-card overflow-hidden max-w-md mx-auto">
          <div className="bg-stone-900 dark:bg-stone-950 border-b border-stone-800 px-5 py-4 text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-400/25 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-rose-300" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Admin Access Restricted</h2>
              <p className="text-xs text-stone-300">Admin ID detection + Passcode required</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs font-semibold text-stone-600 dark:text-stone-300 leading-relaxed">
              Owner console opens only for authorized Admin IDs (Primary:{' '}
              <span className="font-mono-num font-extrabold text-stone-900 dark:text-stone-100">
                {PRIMARY_ADMIN_TELEGRAM_ID}
              </span>
              ) after entering the Admin Passcode.
            </p>
            <div className="clay-inset !rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs">
              <span className="font-bold text-stone-500 dark:text-stone-400">Current Account ID</span>
              <span className="font-mono-num font-extrabold text-stone-900 dark:text-stone-100">
                {playerId || 'Guest'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onTabTap?.();
                onBack();
              }}
              className="clay-btn clay-btn-neutral w-full min-h-[44px] rounded-2xl font-extrabold text-sm"
            >
              Back to Farm
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!adminUnlocked) {
    const detectedDisplayId = isAdminPlayerId(playerId)
      ? PRIMARY_ADMIN_TELEGRAM_ID
      : extractTelegramNumericUserId(playerId) || playerId;

    return (
      <div className="animate-clay-enter space-y-6 pb-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onTabTap?.();
              onBack();
            }}
            aria-label="Back from admin panel"
            className="clay-btn clay-btn-neutral w-10 h-10 rounded-2xl flex items-center justify-center text-stone-700 dark:text-stone-200"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
              Admin Passcode Verification
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Admin ID detected · Enter your Admin Passcode to unlock
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void handleUnlockSubmit(e)} className="clay-card overflow-hidden max-w-md mx-auto">
          <div className="bg-stone-900 dark:bg-stone-950 border-b border-stone-800 px-5 py-4 text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-tight">Unlock Admin Console</h2>
                <p className="text-xs text-stone-300">Verified Admin ID: {detectedDisplayId}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-200 shrink-0">
              <ShieldCheck className="w-3 h-3" />
              <span>Detected</span>
            </span>
          </div>

          <div className="p-5 space-y-4">
            <div className="clay-inset !rounded-xl px-3.5 py-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-stone-500 dark:text-stone-400">Passcode Verification</span>
              <span className="font-extrabold text-stone-800 dark:text-stone-200">
                {adminPasscodeSource === 'database'
                  ? 'Live Database (Firestore)'
                  : adminPasscodeSource === 'server_file'
                    ? 'Server Security Vault'
                    : adminPasscodeSource === 'env'
                      ? 'Environment Passcode'
                      : 'Default Server Passcode'}
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-passcode-input" className="text-xs font-extrabold text-stone-700 dark:text-stone-300">
                Admin Passcode
              </label>
              <div className="relative">
                <input
                  id="admin-passcode-input"
                  type={showPasscodeInput ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="current-password"
                  autoFocus
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    setPasscodeError(null);
                  }}
                  placeholder="Enter admin passcode..."
                  className="clay-inset w-full min-h-[46px] pl-3.5 pr-11 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscodeInput((v) => !v)}
                  aria-label={showPasscodeInput ? 'Hide passcode' : 'Show passcode'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
                >
                  {showPasscodeInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {passcodeError && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300"
              >
                {passcodeError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onTabTap?.();
                  onBack();
                }}
                className="clay-btn clay-btn-neutral min-h-[46px] px-4 rounded-2xl font-extrabold text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={verifyingPasscode}
                className="clay-btn clay-btn-emerald flex-1 min-h-[46px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-55"
              >
                <KeyRound className="w-4 h-4" />
                <span>{verifyingPasscode ? 'Verifying...' : 'Open Admin Panel'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  const activeProviderLabel =
    AD_PROVIDER_CARDS.find((p) => p.id === adConfig.provider)?.label || 'Built-in Timer';

  const buildSharePostText = (promo: DynamicPromoCode) => {
    const rewardText = formatPromoRewardSummary(promo);
    const limitText = promo.maxUses === 0 ? 'Limited time only' : `First ${promo.maxUses} farmers`;
    return [
      `🎁 ALPHA GRAM GIFT DROP`,
      `Reward: ${rewardText}`,
      `Code: ${promo.code}`,
      `Limit: ${limitText}`,
      `Redeem now in Tasks → Gift & Promo Code!`,
    ].join('\n');
  };

  const renderBotConfigCard = (compact = false) => {
    const isConfigured = botConfigStatus?.configured ?? serverBotConfigured === true;
    const sourceLabel =
      botConfigStatus?.source === 'runtime'
        ? 'Admin Panel Saved'
        : botConfigStatus?.source === 'local_preview'
          ? 'Browser Local (Preview)'
          : botConfigStatus?.source === 'env'
            ? 'Server .env'
            : isConfigured
              ? 'Configured'
              : 'Not Set';

    return (
      <div className="clay-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Telegram Bot Token Setup</span>
            </h3>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
              Connect your <span className="font-mono-num">@BotFather</span> token directly for Channel Check, Referral DMs, Payout alerts &amp; Broadcasts.
            </p>
          </div>
          <span
            className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold shrink-0 ${
              isConfigured
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
            }`}
          >
            {isConfigured
              ? botConfigStatus?.botUsername
                ? `@${botConfigStatus.botUsername} · ${sourceLabel}`
                : sourceLabel
              : 'Token Missing'}
          </span>
        </div>

        {botConfigStatus?.maskedToken && (
          <div className="clay-inset !rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono-num">
            <span className="text-stone-600 dark:text-stone-300 truncate">
              Active Token: <strong className="text-stone-900 dark:text-stone-100">{botConfigStatus.maskedToken}</strong>
            </span>
            {(botConfigStatus.source === 'runtime' || botConfigStatus.source === 'local_preview') &&
              onClearBotToken && (
                <button
                  type="button"
                  disabled={savingBotToken}
                  onClick={() => void handleClearBotTokenClick()}
                  className="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-sans font-extrabold text-[10px] shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Clear Token
                </button>
              )}
          </div>
        )}

        {onSaveBotToken && (
          <form onSubmit={(e) => void handleSaveBotTokenSubmit(e)} className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type={showBotTokenDraft ? 'text' : 'password'}
                  value={botTokenDraft}
                  onChange={(e) => {
                    setBotTokenDraft(e.target.value);
                    setBotTokenFeedback(null);
                  }}
                  placeholder="Paste Telegram Bot Token (e.g. 123456789:ABCdef...)"
                  aria-label="Telegram Bot Token"
                  autoComplete="off"
                  spellCheck={false}
                  className="clay-inset w-full min-h-[42px] pl-3 pr-10 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <button
                  type="button"
                  onClick={() => setShowBotTokenDraft((v) => !v)}
                  aria-label={showBotTokenDraft ? 'Hide bot token' : 'Show bot token'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 cursor-pointer"
                >
                  {showBotTokenDraft ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={savingBotToken || !botTokenDraft.trim()}
                className="clay-btn clay-btn-emerald min-h-[42px] px-4 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {savingBotToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{savingBotToken ? 'Verifying...' : 'Verify & Save Token'}</span>
              </button>
            </div>

            {botTokenFeedback && (
              <div
                role="status"
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                  botTokenFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                }`}
              >
                {botTokenFeedback.text}
              </div>
            )}
          </form>
        )}

        {!compact && (
          <form
            onSubmit={handleSaveBackendUrlSubmit}
            className="pt-2.5 border-t border-stone-200/70 dark:border-stone-700/60 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label
                htmlFor="admin-backend-api-url"
                className="text-[11px] font-extrabold text-stone-700 dark:text-stone-300 flex items-center gap-1.5"
              >
                <Server className="w-3.5 h-3.5 text-amber-500" />
                <span>Backend Server URL (only needed if hosted on static CDN)</span>
              </label>
              {backendUrlDraft && (
                <button
                  type="button"
                  onClick={() => {
                    const cleared = setConfiguredApiBaseUrl('');
                    setBackendUrlDraft(cleared);
                    setBackendUrlFeedback({ type: 'ok', text: 'Reset to default same-origin server.' });
                  }}
                  className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Use Default Origin
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="admin-backend-api-url"
                type="url"
                value={backendUrlDraft}
                onChange={(e) => {
                  setBackendUrlDraft(e.target.value);
                  setBackendUrlFeedback(null);
                }}
                placeholder="Leave blank for same-origin Express backend (e.g. https://api.yourdomain.com)"
                className="clay-inset flex-1 min-h-[38px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400"
              />
              <button
                type="submit"
                className="clay-btn clay-btn-sky min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold shrink-0"
              >
                Save Backend URL
              </button>
            </div>
            {backendUrlFeedback && (
              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {backendUrlFeedback.text}
              </div>
            )}
          </form>
        )}
      </div>
    );
  };

  return (
    <div className="animate-clay-enter space-y-4 pb-24">
      {/* Executive Header */}
      <div className="clay-card-dark text-white px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              onTabTap?.();
              onBack();
            }}
            aria-label="Back from admin panel"
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/12 flex items-center justify-center text-white shrink-0 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight truncate">Admin Console</h1>
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-200 shrink-0">
                <ShieldCheck className="w-3 h-3" />
                <span>
                  ID {isAdminPlayerId(playerId) ? PRIMARY_ADMIN_TELEGRAM_ID : extractTelegramNumericUserId(playerId) || playerId}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-stone-300 truncate">
              Payouts, Users, Growth, Bot &amp; System Controls
            </p>
          </div>
        </div>
        {onLockAdmin && (
          <button
            type="button"
            onClick={() => {
              onTabTap?.();
              onLockAdmin();
            }}
            aria-label="Lock Admin Console"
            className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-extrabold text-stone-100 inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        )}
      </div>

      {/* Live Maintenance Mode Status Alert Banner */}
      {maintenanceConfig.enabled && (
        <div className="clay-card-warm !rounded-2xl border border-amber-300/90 dark:border-amber-700/70 px-3.5 py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-amber-950 dark:text-amber-200 truncate">
                Maintenance Mode Active
              </div>
              <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
                Non-admin users are currently seeing the maintenance screen.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => navigateAdminTab('maintenance')}
              className="clay-btn clay-btn-neutral px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold"
            >
              Manage
            </button>
            <button
              type="button"
              disabled={savingMaintenance}
              onClick={() => void handleSaveMaintenanceSubmit(false)}
              className="clay-btn clay-btn-emerald px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold disabled:opacity-50"
            >
              Turn Off
            </button>
          </div>
        </div>
      )}

      {/* 4-Column Executive KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => navigateAdminTab('withdrawals')}
          className="clay-card clay-hover-lift !rounded-2xl p-3.5 text-left cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
            <span>Pending Payouts</span>
            <Wallet className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-1 text-xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
            {pendingRequests.length}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono-num">
            {pendingGramVolume.toFixed(3)} GRAM queued
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigateAdminTab('users')}
          className="clay-card clay-hover-lift !rounded-2xl p-3.5 text-left cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
            <span>Recent Players</span>
            <Users className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-1 text-xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
            {recentPlayers.length}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono-num">
            {bannedUsers.length} blocked / banned
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigateAdminTab('admins')}
          className="clay-card clay-hover-lift !rounded-2xl p-3.5 text-left cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
            <span>Admins</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-1 text-xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
            {1 + adminsConfig.admins.length}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono-num">
            {adminsConfig.admins.length} co-admin{adminsConfig.admins.length === 1 ? '' : 's'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigateAdminTab('tasks')}
          className="clay-card clay-hover-lift !rounded-2xl p-3.5 text-left cursor-pointer"
        >
          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
            <span>Tasks · Min Price</span>
            <ListPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-1 text-xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
            {activeTaskCount}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400 font-mono-num truncate">
            Min {(Number(minTaskPriceDraft) || DEFAULT_TASK_PRICING_CONFIG.minBudgetCoins).toLocaleString()}c · {activeProviderLabel}
          </div>
        </button>
      </div>

      {/* Prominent Global Maintenance Mode Quick Toggle (visible across all Admin tabs) */}
      <div
        className={`clay-card !rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 border ${
          maintenanceConfig.enabled
            ? 'border-amber-300/90 dark:border-amber-700/70'
            : 'border-emerald-200/80 dark:border-emerald-800/50'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              maintenanceConfig.enabled
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <Wrench className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  maintenanceConfig.enabled ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                }`}
              />
              <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100 truncate">
                Maintenance Mode: {maintenanceConfig.enabled ? 'ON (Offline)' : 'OFF (Site Live)'}
              </span>
            </div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              {maintenanceConfig.enabled
                ? 'Non-admin users are blocked with the maintenance notice.'
                : 'All regular players can open the bot normally.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => navigateAdminTab('maintenance')}
            className="clay-btn clay-btn-neutral px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold"
          >
            Settings
          </button>
          <button
            type="button"
            disabled={!onSaveMaintenanceConfig || savingMaintenance}
            onClick={() => {
              const next = !maintenanceConfig.enabled;
              setMaintEnabledDraft(next);
              void handleSaveMaintenanceSubmit(next);
            }}
            className={`clay-btn px-3 py-1.5 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1 disabled:opacity-50 ${
              maintenanceConfig.enabled ? 'clay-btn-emerald' : 'clay-btn-amber'
            }`}
          >
            {savingMaintenance ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Power className="w-3 h-3" />
            )}
            <span>{maintenanceConfig.enabled ? 'Turn OFF' : 'Turn ON'}</span>
          </button>
        </div>
      </div>

      {/* Contextual Sub-Tab Bar inside each Bottom Tab Group */}
      {(() => {
        const subTabsByGroup: Record<
          AdminPrimaryGroup,
          Array<{ id: AdminSectionTab; label: string; icon: typeof Wallet; count?: number; danger?: boolean; liveDot?: boolean }>
        > = {
          payouts: [],
          users: [
            { id: 'users', label: 'Players & Bans', icon: Users, count: bannedUsers.length },
            { id: 'admins', label: 'Admins', icon: ShieldCheck, count: 1 + adminsConfig.admins.length },
          ],
          growth: [
            { id: 'tasks', label: 'Tasks', icon: ListPlus, count: activeTaskCount },
            { id: 'promos', label: 'Gift Codes', icon: Gift, count: activePromoCount },
            { id: 'ads', label: 'Ads', icon: Megaphone },
            { id: 'ad_ids', label: 'Block IDs', icon: KeyRound, count: savedAdIdsCount },
          ],
          bot: [
            { id: 'channels', label: 'Channels & Token', icon: Radio, count: activeChannelsCount },
            { id: 'broadcast', label: 'Broadcast', icon: Send },
          ],
          system: [
            {
              id: 'maintenance',
              label: 'Maintenance',
              icon: Wrench,
              liveDot: maintenanceConfig.enabled,
            },
            { id: 'diagnostics', label: 'Health', icon: Activity },
            { id: 'reset', label: 'Data Reset', icon: RotateCcw, danger: true },
          ],
        };

        const activeSubTabs = subTabsByGroup[activePrimaryGroup];
        if (activeSubTabs.length === 0) return null;

        const colsClass =
          activeSubTabs.length === 2
            ? 'grid-cols-2'
            : activeSubTabs.length === 3
              ? 'grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-4';

        return (
          <div className="clay-card !rounded-2xl p-1.5">
            <div
              role="tablist"
              aria-label="Admin section subsections"
              className={`clay-inset !rounded-xl grid ${colsClass} gap-1 p-1`}
            >
              {activeSubTabs.map((item) => {
                const Icon = item.icon;
                const isActive = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => navigateAdminTab(item.id)}
                    className={`clay-btn min-h-[40px] px-2 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
                      isActive
                        ? item.danger
                          ? 'clay-btn-rose'
                          : 'clay-btn-amber'
                        : item.danger
                          ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.liveDot && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    )}
                    {typeof item.count === 'number' && item.count > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono-num font-extrabold leading-none ${
                          isActive
                            ? 'bg-amber-950/20 text-amber-950'
                            : item.id === 'channels'
                              ? 'bg-sky-500 text-white'
                              : item.id === 'ad_ids' || item.id === 'admins' || item.id === 'tasks'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-rose-500 text-white'
                        }`}
                      >
                        {item.id === 'ad_ids' ? `${item.count}/3` : item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ========================================================================
          USER SEARCH, COINS, REFERS & MODERATION TAB
         ======================================================================== */}
      {tab === 'users' && (
        <div key="admin-tab-users" className="animate-clay-enter space-y-4">
          {/* Live Cloud User Search Bar */}
          <form onSubmit={(e) => void handleSearchUsersSubmit(e)} className="clay-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Search className="w-4 h-4 text-amber-500" />
                  <span>User Search &amp; Controls</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Search any user by ID, UID, Name, or @handle — then Add/Remove Coins, Refers, Withdraw 30-Ads Criteria, or Admin.
                </p>
              </div>
              {cloudSearchResults !== null && (
                <button
                  type="button"
                  onClick={() => {
                    onTabTap?.();
                    setUserSearch('');
                    setCloudSearchResults(null);
                    setUserActionFeedback(null);
                  }}
                  className="clay-btn clay-btn-neutral px-2.5 py-1 rounded-xl text-[11px] font-extrabold shrink-0"
                >
                  Reset Search
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Enter ID / UID (e.g. 7508911853), @handle, or name..."
                  aria-label="Search user in Firestore"
                  className="clay-inset w-full min-h-[42px] pl-9 pr-3 text-xs font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={searchingUsers}
                className="clay-btn clay-btn-amber min-h-[42px] px-4 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{searchingUsers ? 'Searching...' : 'Search User'}</span>
              </button>
            </div>
          </form>

          {/* Selected Player Control Panel */}
          {selectedPlayer && (() => {
            const ban = findBanForPlayer(selectedPlayer.uid);
            const isOwnerAdmin = isAdminPlayerId(selectedPlayer.uid);
            const isCoAdmin = !isOwnerAdmin && isAdminPlayerId(selectedPlayer.uid, extraAdminIds);
            const totalHens = calculateTotalChickens(selectedPlayer);

            return (
              <div className="clay-card overflow-hidden border-2 border-amber-400/50 dark:border-amber-500/40">
                <div className="bg-stone-900 dark:bg-stone-950 px-4 py-3 text-white flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selectedPlayer.photoUrl ? (
                      <img
                        src={selectedPlayer.photoUrl}
                        alt={selectedPlayer.displayName}
                        className="w-10 h-10 rounded-2xl object-cover shrink-0 border border-white/20"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center shrink-0"
                        style={{ backgroundColor: selectedPlayer.avatarColor || '#F59E0B' }}
                      >
                        {(selectedPlayer.displayName || 'F').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-extrabold truncate">
                          {selectedPlayer.displayName}
                        </span>
                        <span className="text-xs text-stone-300 truncate">
                          {selectedPlayer.handle}
                        </span>
                        {isOwnerAdmin ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-extrabold text-emerald-200">
                            Owner Admin
                          </span>
                        ) : isCoAdmin ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-sky-500/20 border border-sky-400/40 text-[10px] font-extrabold text-sky-200">
                            Co-Admin
                          </span>
                        ) : ban ? (
                          <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/40 text-[10px] font-extrabold text-rose-200">
                            Blocked
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-num text-stone-300 mt-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(
                              `sel_id_${selectedPlayer.uid}`,
                              getUnifiedUserId(selectedPlayer.uid),
                            )
                          }
                          className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <span>ID / UID: {getUnifiedUserId(selectedPlayer.uid)}</span>
                          {copiedKey === `sel_id_${selectedPlayer.uid}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 opacity-75" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close user inspector"
                    onClick={() => setSelectedPlayer(null)}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Player KPI Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase">Coins</div>
                      <div className="text-sm font-extrabold font-mono-num text-amber-700 dark:text-amber-300 flex items-center gap-1 mt-0.5">
                        <CoinIcon className="w-3.5 h-3.5" />
                        <span>{Math.floor(selectedPlayer.coins).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase">Eggs</div>
                      <div className="text-sm font-extrabold font-mono-num text-stone-900 dark:text-stone-100 flex items-center gap-1 mt-0.5">
                        <EggIcon className="w-3.5 h-3.5" />
                        <span>{Math.floor(selectedPlayer.eggs).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase">Chickens</div>
                      <div className="text-sm font-extrabold font-mono-num text-stone-900 dark:text-stone-100 mt-0.5">
                        {totalHens}
                      </div>
                    </div>
                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase">Refers</div>
                      <div className="text-sm font-extrabold font-mono-num text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {selectedPlayer.referralCount}
                      </div>
                    </div>
                  </div>

                  {userActionFeedback && (
                    <div
                      role="status"
                      className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                        userActionFeedback.type === 'ok'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {userActionFeedback.text}
                    </div>
                  )}

                  {/* Add / Remove Coins */}
                  <div className="clay-inset !rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5 text-amber-500" />
                        <span>Add / Remove Coins</span>
                      </h3>
                      <div className="flex items-center gap-1 flex-wrap">
                        {[500, 1000, 5000, 10000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCoinAmountInput(String(preset))}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono-num font-extrabold cursor-pointer transition-colors ${
                              coinAmountInput === String(preset)
                                ? 'bg-amber-500 text-amber-950'
                                : 'bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                            }`}
                          >
                            {preset.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1}
                        max={10000000}
                        value={coinAmountInput}
                        onChange={(e) => setCoinAmountInput(e.target.value)}
                        placeholder="Coin amount"
                        aria-label="Coin adjustment amount"
                        className="clay-card !rounded-xl min-h-[40px] px-3 text-xs font-mono-num font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <input
                        type="text"
                        maxLength={70}
                        value={coinNoteInput}
                        onChange={(e) => setCoinNoteInput(e.target.value)}
                        placeholder="Optional note (e.g. Event prize)"
                        aria-label="Coin adjustment note"
                        className="clay-card !rounded-xl min-h-[40px] px-3 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={userActionBusy !== null}
                        onClick={() => void handleAdjustCoinsClick(1)}
                        className="clay-btn clay-btn-emerald min-h-[40px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>
                          {userActionBusy === 'add_coins' ? 'Adding...' : 'Add Coins'}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={userActionBusy !== null}
                        onClick={() => void handleAdjustCoinsClick(-1)}
                        className="clay-btn min-h-[40px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>
                          {userActionBusy === 'remove_coins' ? 'Removing...' : 'Remove Coins'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Add / Remove Refers + Specific Referral Linker */}
                  <div className="clay-inset !rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-xs font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Add / Remove Refers</span>
                      </h3>
                      {selectedPlayer.referredBy && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono-num text-stone-600 dark:text-stone-300">
                            Upline: {extractTelegramNumericUserId(selectedPlayer.referredBy) || selectedPlayer.referredBy}
                          </span>
                          <button
                            type="button"
                            disabled={userActionBusy !== null}
                            onClick={() =>
                              void handleRemoveReferralRow(selectedPlayer.referredBy, selectedPlayer.uid)
                            }
                            className="px-2 py-0.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Unlink className="w-3 h-3" />
                            <span>Remove Upline</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Refer Count Direct Adjuster */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        value={referCountInput}
                        onChange={(e) => setReferCountInput(e.target.value)}
                        placeholder="Refer count"
                        aria-label="Referral count adjustment"
                        className="clay-card !rounded-xl min-h-[38px] px-3 text-xs font-mono-num font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <button
                        type="button"
                        disabled={userActionBusy !== null}
                        onClick={() => void handleAdjustReferCountClick(1)}
                        className="clay-btn clay-btn-sky min-h-[38px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{userActionBusy === 'add_refers' ? 'Adding...' : 'Add Refers'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={userActionBusy !== null}
                        onClick={() => void handleAdjustReferCountClick(-1)}
                        className="clay-btn min-h-[38px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>{userActionBusy === 'remove_refers' ? 'Removing...' : 'Remove Refers'}</span>
                      </button>
                    </div>

                    {/* Link a specific Friend ID under this User */}
                    <form
                      onSubmit={(e) => void handleLinkFriendUnderSelected(e)}
                      className="pt-2 border-t border-stone-200/70 dark:border-stone-700/60 space-y-2"
                    >
                      <div className="text-[11px] font-bold text-stone-600 dark:text-stone-300">
                        Add &amp; Link a User as Referred by {selectedPlayer.displayName}:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={linkFriendIdInput}
                          onChange={(e) => setLinkFriendIdInput(e.target.value)}
                          placeholder="Telegram ID, @username, or UID"
                          aria-label="Friend player ID or username to refer"
                          className="clay-card !rounded-xl min-h-[38px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          value={linkBonusCoinsInput}
                          onChange={(e) => setLinkBonusCoinsInput(e.target.value)}
                          placeholder="Bonus coins (150)"
                          aria-label="Refer bonus coins"
                          className="clay-card !rounded-xl min-h-[38px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                        <button
                          type="submit"
                          disabled={!linkFriendIdInput.trim() || userActionBusy !== null}
                          className="clay-btn clay-btn-emerald min-h-[38px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{userActionBusy === 'link_friend' ? 'Linking...' : 'Link Refer'}</span>
                        </button>
                      </div>
                    </form>

                    {/* Invited Referrals List for Selected User */}
                    <div className="pt-2 border-t border-stone-200/70 dark:border-stone-700/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 dark:text-stone-400">
                        <span>Invited Referrals ({selectedPlayerReferrals.length})</span>
                        {loadingSelectedRefs && <span>Loading...</span>}
                      </div>
                      {!loadingSelectedRefs && selectedPlayerReferrals.length === 0 ? (
                        <div className="text-[11px] text-stone-400 dark:text-stone-500">
                          No referral records found under this account.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                          {selectedPlayerReferrals.map((ref) => (
                            <div
                              key={ref.referredUid}
                              className="clay-card !rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-extrabold text-stone-900 dark:text-stone-100 truncate">
                                  {ref.referredName} <span className="font-semibold text-stone-500">{ref.referredHandle}</span>
                                </div>
                                <div className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400">
                                  ID: {extractTelegramNumericUserId(ref.referredUid) || ref.referredUid} · {ref.status} · +{ref.coinsEarned}c
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={userActionBusy !== null}
                                onClick={() =>
                                  void handleRemoveReferralRow(selectedPlayer.uid, ref.referredUid)
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Remove</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Withdraw 30-Ads Criteria Control */}
                  {(() => {
                    const currentAds = selectedPlayer.withdrawAdsWatched ?? 0;
                    const adsPct = Math.min(
                      100,
                      Math.round((currentAds / MIN_WITHDRAW_ADS_WATCHED) * 100),
                    );
                    const isUnlocked = currentAds >= MIN_WITHDRAW_ADS_WATCHED;
                    const parsedInput = Math.trunc(Number(withdrawAdsInput));
                    return (
                      <div className="clay-inset !rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="text-xs font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                            <Megaphone className="w-3.5 h-3.5 text-amber-500" />
                            <span>
                              Withdraw Criteria ({currentAds}/{MIN_WITHDRAW_ADS_WATCHED} Ads)
                            </span>
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${
                              isUnlocked
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {isUnlocked
                              ? 'Withdraw Unlocked'
                              : `Need ${MIN_WITHDRAW_ADS_WATCHED - currentAds} more`}
                          </span>
                        </div>

                        <div className="h-2.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isUnlocked ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${adsPct}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            value={withdrawAdsInput}
                            onChange={(e) => setWithdrawAdsInput(e.target.value)}
                            placeholder="Ads count"
                            aria-label="Withdraw ads adjustment count"
                            className="clay-card !rounded-xl min-h-[38px] w-28 px-3 text-xs font-mono-num font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          <div className="flex items-center gap-1 flex-wrap">
                            {[0, 1, 5, 10, 30].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setWithdrawAdsInput(String(preset))}
                                className={`px-2 py-1 rounded-lg text-[10px] font-mono-num font-extrabold cursor-pointer transition-colors ${
                                  withdrawAdsInput === String(preset)
                                    ? 'bg-amber-500 text-amber-950'
                                    : 'bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                                }`}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <button
                            type="button"
                            disabled={!onAdjustWithdrawAds || userActionBusy !== null || !Number.isFinite(parsedInput) || parsedInput < 0}
                            onClick={() =>
                              void handleAdjustWithdrawAdsClick({
                                targetAds: Number.isFinite(parsedInput) ? Math.max(0, parsedInput) : 0,
                                busyKey: 'set_wd_ads',
                              })
                            }
                            className="clay-btn clay-btn-amber min-h-[38px] rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>
                              {userActionBusy === 'set_wd_ads'
                                ? 'Setting...'
                                : `Set (${Number.isFinite(parsedInput) && parsedInput >= 0 ? parsedInput : 0})`}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={!onAdjustWithdrawAds || userActionBusy !== null || !Number.isFinite(parsedInput) || parsedInput <= 0}
                            onClick={() =>
                              void handleAdjustWithdrawAdsClick({
                                deltaAds: Number.isFinite(parsedInput) ? parsedInput : 0,
                                busyKey: 'add_wd_ads',
                              })
                            }
                            className="clay-btn clay-btn-emerald min-h-[38px] rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{userActionBusy === 'add_wd_ads' ? 'Adding...' : 'Add Ads'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={!onAdjustWithdrawAds || userActionBusy !== null || !Number.isFinite(parsedInput) || parsedInput <= 0}
                            onClick={() =>
                              void handleAdjustWithdrawAdsClick({
                                deltaAds: -(Number.isFinite(parsedInput) ? parsedInput : 0),
                                busyKey: 'remove_wd_ads',
                              })
                            }
                            className="clay-btn min-h-[38px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Minus className="w-3.5 h-3.5" />
                            <span>{userActionBusy === 'remove_wd_ads' ? 'Removing...' : 'Remove Ads'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={!onAdjustWithdrawAds || userActionBusy !== null || isUnlocked}
                            onClick={() =>
                              void handleAdjustWithdrawAdsClick({
                                targetAds: MIN_WITHDRAW_ADS_WATCHED,
                                busyKey: 'unlock_wd_ads',
                              })
                            }
                            className="clay-btn clay-btn-sky min-h-[38px] rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Unlock (30/30)</span>
                          </button>
                          <button
                            type="button"
                            disabled={!onAdjustWithdrawAds || userActionBusy !== null || currentAds === 0}
                            onClick={() =>
                              void handleAdjustWithdrawAdsClick({
                                targetAds: 0,
                                busyKey: 'reset_wd_ads',
                              })
                            }
                            className="clay-btn clay-btn-neutral min-h-[38px] rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset (0/30)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Quick Admin Role & Ban Footer */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {isOwnerAdmin ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-3 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        <Crown className="w-3.5 h-3.5" />
                        <span>Protected Owner Admin</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={userActionBusy !== null}
                        onClick={() => void handleToggleAdminForPlayer(selectedPlayer)}
                        className={`clay-btn min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50 ${
                          isCoAdmin ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'clay-btn-sky'
                        }`}
                      >
                        {isCoAdmin ? <ShieldMinus className="w-3.5 h-3.5" /> : <ShieldPlus className="w-3.5 h-3.5" />}
                        <span>
                          {userActionBusy === 'toggle_admin'
                            ? 'Updating...'
                            : isCoAdmin
                              ? 'Remove Admin'
                              : 'Make Admin'}
                        </span>
                      </button>
                    )}

                    {!isOwnerAdmin && !isCoAdmin && (
                      ban ? (
                        <button
                          type="button"
                          disabled={banningId === ban.uid}
                          onClick={() => void handleUnbanRow(ban.uid)}
                          className="clay-btn clay-btn-emerald min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{banningId === ban.uid ? 'Unblocking...' : 'Unblock User'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={banningId === selectedPlayer.uid}
                          onClick={() => void handleBanPlayerRow(selectedPlayer)}
                          className="clay-btn min-h-[40px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{banningId === selectedPlayer.uid ? 'Blocking...' : 'Block / Ban User'}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Standalone Quick Referral Linker ("Or Refer") */}
          <form onSubmit={(e) => void handleQuickReferSubmit(e)} className="clay-card p-4 space-y-3">
            <div>
              <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Quick Link Referral (Refer Any User)</span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Manually assign a Referred Friend to a Referrer by Telegram ID, @username, or UID.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={quickReferrerInput}
                onChange={(e) => {
                  setQuickReferrerInput(e.target.value);
                  setQuickReferFeedback(null);
                }}
                placeholder="Referrer ID, @username, or UID"
                aria-label="Referrer ID, username, or referral code"
                className="clay-inset min-h-[42px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="text"
                value={quickReferredInput}
                onChange={(e) => {
                  setQuickReferredInput(e.target.value);
                  setQuickReferFeedback(null);
                }}
                placeholder="Friend ID, @username, or UID"
                aria-label="Referred friend ID or username"
                className="clay-inset min-h-[42px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <input
                type="number"
                min={0}
                max={100000}
                value={quickReferBonusInput}
                onChange={(e) => setQuickReferBonusInput(e.target.value)}
                placeholder="Bonus coins (150)"
                aria-label="Quick referral bonus coins"
                className="clay-inset min-h-[42px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {quickReferFeedback && (
              <div
                role="status"
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                  quickReferFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                }`}
              >
                {quickReferFeedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={!quickReferrerInput.trim() || !quickReferredInput.trim() || quickReferBusy}
              className="clay-btn clay-btn-emerald w-full min-h-[42px] rounded-2xl font-extrabold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{quickReferBusy ? 'Linking Referral...' : 'Link & Add Referral'}</span>
            </button>
          </form>

          {/* Quick Block/Ban by Player ID Form */}
          <form onSubmit={(e) => void handleManualBanSubmit(e)} className="clay-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-rose-500" />
                  <span>Block / Ban Player by ID</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Blocked players are immediately locked out of all game features, earning, shop, tasks &amp; withdrawals.
                </p>
              </div>
              <span className="rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 px-2 py-1 text-[10px] font-extrabold font-mono-num text-rose-700 dark:text-rose-300 shrink-0">
                {bannedUsers.length} Blocked
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="admin-ban-player-id" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Player ID (Telegram ID or UID)
                </label>
                <input
                  id="admin-ban-player-id"
                  type="text"
                  value={banTargetIdInput}
                  onChange={(e) => {
                    setBanTargetIdInput(e.target.value);
                    setBanFormError(null);
                  }}
                  placeholder="e.g. 987654321, tg_987654321, or player_..."
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-ban-reason" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Reason (optional, applied to ID or quick row ban)
                </label>
                <input
                  id="admin-ban-reason"
                  type="text"
                  maxLength={160}
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  placeholder="e.g. Spam, multi-accounting, or abuse"
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>
            </div>

            {banFormError && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300"
              >
                {banFormError}
              </div>
            )}

            <button
              type="submit"
              disabled={!banTargetIdInput.trim() || banningId !== null}
              className="clay-btn w-full min-h-[42px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <UserX className="w-4 h-4" />
              <span>{banningId && banTargetIdInput ? 'Blocking Player...' : 'Block / Ban by ID'}</span>
            </button>
          </form>

          {/* Recent Players Directory + Filter */}
          <div className="clay-card overflow-hidden">
            <div className="p-4 border-b border-stone-200/70 dark:border-stone-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                    {cloudSearchResults !== null
                      ? `Search Results (${visibleRecentPlayers.length})`
                      : `Recent Players (${sortedRecentPlayers.length})`}
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Tap Manage to edit Coins, Refers &amp; Admin Role — or Block/Ban directly
                  </p>
                </div>

                <div className="clay-inset !rounded-xl flex items-center gap-1 p-1 shrink-0">
                  {(
                    [
                      { id: 'recent', label: `All (${cloudSearchResults !== null ? mergedPlayersDirectory.length : sortedRecentPlayers.length})` },
                      {
                        id: 'active',
                        label: `Active (${(cloudSearchResults !== null ? mergedPlayersDirectory : sortedRecentPlayers).filter((p) => !findBanForPlayer(p.uid)).length})`,
                      },
                      { id: 'banned', label: `Blocked (${bannedUsers.length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onTabTap?.();
                        setUserFilter(f.id);
                      }}
                      className={`clay-btn px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold transition-colors ${
                        userFilter === f.id
                          ? f.id === 'banned'
                            ? 'bg-rose-600 text-white'
                            : 'clay-btn-amber'
                          : 'text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {userFilter === 'banned' ? (
              visibleBannedRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500 dark:text-stone-400">
                  {bannedUsers.length === 0
                    ? 'No players are currently blocked or banned.'
                    : 'No blocked players match your search.'}
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                  {visibleBannedRecords.map((ban) => {
                    const matchedProfile = mergedPlayersDirectory.find((p) =>
                      matchesBannedUserRecord(p.uid, ban),
                    );
                    const displayLabel =
                      ban.displayName || matchedProfile?.displayName || `Player ${ban.uid.slice(-4)}`;
                    const handleLabel = ban.handle || matchedProfile?.handle || '';
                    const isBusy = banningId === ban.uid;
                    return (
                      <div key={ban.uid} className="p-3.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300 font-extrabold text-sm flex items-center justify-center shrink-0">
                            <Ban className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                                {displayLabel}
                              </span>
                              {handleLabel && (
                                <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                                  {handleLabel}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-[10px] font-extrabold text-rose-700 dark:text-rose-300">
                                Blocked
                              </span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-num text-stone-500 dark:text-stone-400">
                              <button
                                type="button"
                                onClick={() => void handleCopy(`ban_id_${ban.uid}`, getUnifiedUserId(ban.uid))}
                                className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 font-bold text-stone-700 dark:text-stone-200 hover:underline cursor-pointer"
                              >
                                <span>ID / UID: {getUnifiedUserId(ban.uid)}</span>
                                {copiedKey === `ban_id_${ban.uid}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-70" />
                                )}
                              </button>
                              {ban.bannedAtMs > 0 && (
                                <span>· {new Date(ban.bannedAtMs).toLocaleDateString()}</span>
                              )}
                            </div>

                            <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 truncate">
                              Reason: {ban.reason || 'Blocked by Administrator'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {matchedProfile && (
                            <button
                              type="button"
                              onClick={() => void handleSelectPlayer(matchedProfile)}
                              className="clay-btn clay-btn-amber min-h-[38px] px-3 rounded-xl text-xs font-extrabold"
                            >
                              Manage
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleUnbanRow(ban.uid)}
                            className="clay-btn clay-btn-emerald min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'Unblocking...' : 'Unblock'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : visibleRecentPlayers.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-stone-400">
                {sortedRecentPlayers.length === 0
                  ? 'No recent players loaded yet.'
                  : 'No players match your search or filter.'}
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {visibleRecentPlayers.map((player) => {
                  const ban = findBanForPlayer(player.uid);
                  const isOwnerAdmin = isAdminPlayerId(player.uid);
                  const isCoAdmin = !isOwnerAdmin && isAdminPlayerId(player.uid, extraAdminIds);
                  const totalHens = calculateTotalChickens(player);
                  const isBusy = banningId === player.uid;
                  const isSelected = selectedPlayer?.uid === player.uid;

                  return (
                    <div
                      key={player.uid}
                      className={`p-3.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap ${
                        isSelected
                          ? 'bg-amber-50/70 dark:bg-amber-950/20'
                          : ban
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {player.photoUrl ? (
                          <img
                            src={player.photoUrl}
                            alt={player.displayName}
                            className="w-10 h-10 rounded-2xl object-cover shrink-0 border border-stone-200 dark:border-stone-700"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center shrink-0 shadow-sm"
                            style={{ backgroundColor: player.avatarColor || '#EF4444' }}
                          >
                            {(player.displayName || 'F').slice(0, 1).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                              {player.displayName}
                            </span>
                            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 truncate">
                              {player.handle}
                            </span>
                            {isOwnerAdmin ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                                Owner Admin
                              </span>
                            ) : isCoAdmin ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 text-[10px] font-extrabold text-sky-700 dark:text-sky-300">
                                Co-Admin
                              </span>
                            ) : ban ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 text-[10px] font-extrabold text-rose-700 dark:text-rose-300">
                                Blocked
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-num text-stone-500 dark:text-stone-400">
                            <button
                              type="button"
                              onClick={() => void handleCopy(`usr_id_${player.uid}`, getUnifiedUserId(player.uid))}
                              title="Copy Player ID / UID"
                              className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 font-bold text-stone-700 dark:text-stone-200 hover:underline cursor-pointer"
                            >
                              <span>ID: {getUnifiedUserId(player.uid)}</span>
                              {copiedKey === `usr_id_${player.uid}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-70" />
                              )}
                            </button>
                            <span>· {Math.floor(player.coins).toLocaleString()} coins</span>
                            <span>· {player.referralCount} refs</span>
                            <span>· {totalHens} hens</span>
                            <span>· {player.withdrawAdsWatched ?? 0}/{MIN_WITHDRAW_ADS_WATCHED} ads</span>
                          </div>

                          {ban && (
                            <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300 truncate">
                              Blocked reason: {ban.reason || 'Blocked by Administrator'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleSelectPlayer(player)}
                          className={`clay-btn min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1 ${
                            isSelected ? 'clay-btn-amber' : 'clay-btn-sky'
                          }`}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>Manage</span>
                        </button>

                        {isOwnerAdmin || isCoAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-xl bg-stone-100 dark:bg-stone-800 px-2.5 py-2 text-[11px] font-extrabold text-stone-500 dark:text-stone-400">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Admin</span>
                          </span>
                        ) : ban ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleUnbanRow(ban.uid)}
                            className="clay-btn clay-btn-emerald min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'Unblocking...' : 'Unblock'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleBanPlayerRow(player)}
                            className="clay-btn min-h-[38px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'Blocking...' : 'Block'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          ADMINS MANAGEMENT TAB (ADD ADMIN / REMOVE ADMIN)
         ======================================================================== */}
      {tab === 'admins' && (
        <div key="admin-tab-admins" className="animate-clay-enter space-y-4">
          <div className="clay-card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Admin Passcode Locked</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Admin Passcode is locked in server configuration (<span className="font-mono-num font-bold">server.ts</span>) and cannot be changed from the Admin Panel.
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-2 py-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 shrink-0">
                Locked
              </span>
            </div>
            {adminPasscodeUpdatedAtMs > 0 && (
              <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                Updated: {new Date(adminPasscodeUpdatedAtMs).toLocaleString()}
              </div>
            )}
          </div>

          <form onSubmit={(e) => void handleAddAdminSubmit(e)} className="clay-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <ShieldPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Add Admin by ID</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Grant Admin Console access to a Telegram numeric ID or player UID (protected by the Admin Passcode).
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-2 py-1 text-[10px] font-extrabold font-mono-num text-emerald-700 dark:text-emerald-300 shrink-0">
                {1 + adminsConfig.admins.length} Admins
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="admin-add-id" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Admin Telegram ID or UID
                </label>
                <input
                  id="admin-add-id"
                  type="text"
                  value={adminIdInput}
                  onChange={(e) => {
                    setAdminIdInput(e.target.value);
                    setAdminFormFeedback(null);
                  }}
                  placeholder="e.g. 987654321, tg_987654321, or player_..."
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-add-name" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Admin Label / Name (optional, auto-fills if registered)
                </label>
                <input
                  id="admin-add-name"
                  type="text"
                  maxLength={60}
                  value={adminNameInput}
                  onChange={(e) => setAdminNameInput(e.target.value)}
                  placeholder="e.g. Support Moderator"
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>

            {adminFormFeedback && (
              <div
                role="status"
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                  adminFormFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                }`}
              >
                {adminFormFeedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={!adminIdInput.trim() || adminFormBusy}
              className="clay-btn clay-btn-emerald w-full min-h-[42px] rounded-2xl font-extrabold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <ShieldPlus className="w-4 h-4" />
              <span>{adminFormBusy ? 'Adding Admin...' : 'Add Admin'}</span>
            </button>
          </form>

          {/* Authorized Admins List */}
          <div className="clay-card overflow-hidden">
            <div className="p-4 border-b border-stone-200/70 dark:border-stone-800">
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                Authorized Admins ({1 + adminsConfig.admins.length})
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Owner Admin is permanent; Co-Admins can be added or removed at any time.
              </p>
            </div>

            <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
              {/* Primary Owner Admin */}
              <div className="p-3.5 flex items-center justify-between gap-3 bg-emerald-50/40 dark:bg-emerald-950/15">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                        Owner Admin
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                        Permanent Owner
                      </span>
                    </div>
                    <div className="text-[11px] font-mono-num text-stone-500 dark:text-stone-400 mt-0.5">
                      ID: {PRIMARY_ADMIN_TELEGRAM_ID} (tg_{PRIMARY_ADMIN_TELEGRAM_ID})
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-xl bg-stone-100 dark:bg-stone-800 px-3 py-2 text-[11px] font-extrabold text-stone-500 dark:text-stone-400 shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Protected</span>
                </span>
              </div>

              {adminsConfig.admins.length === 0 ? (
                <div className="p-5 text-center text-xs text-stone-500 dark:text-stone-400">
                  No additional Co-Admins added yet. Use the form above or Manage any player to add one.
                </div>
              ) : (
                adminsConfig.admins.map((adm) => {
                  const numericId = extractTelegramNumericUserId(adm.uid);
                  const isRemoving = removingAdminId === adm.uid;
                  return (
                    <div
                      key={adm.uid}
                      className="p-3.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950/70 border border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300 font-extrabold text-sm flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                              {adm.displayName || `Admin ${numericId || adm.uid}`}
                            </span>
                            {adm.handle && (
                              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                                {adm.handle}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 text-[10px] font-extrabold text-sky-700 dark:text-sky-300">
                              Co-Admin
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono-num text-stone-500 dark:text-stone-400">
                            <button
                              type="button"
                              onClick={() => void handleCopy(`adm_id_${adm.uid}`, numericId || adm.uid)}
                              className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 font-bold text-stone-700 dark:text-stone-200 hover:underline cursor-pointer"
                            >
                              <span>ID: {numericId || adm.uid}</span>
                              {copiedKey === `adm_id_${adm.uid}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 opacity-70" />
                              )}
                            </button>
                            {adm.addedAtMs > 0 && (
                              <span>· Added {new Date(adm.addedAtMs).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isRemoving}
                        onClick={() => void handleRemoveAdminRow(adm.uid)}
                        className="clay-btn min-h-[38px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      >
                        <ShieldMinus className="w-3.5 h-3.5" />
                        <span>{isRemoving ? 'Removing...' : 'Remove Admin'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          CHECK CHANNELS MANAGEMENT TAB
         ======================================================================== */}
      {tab === 'channels' && (
        <div key="admin-tab-channels" className="animate-clay-enter space-y-4">
          {renderBotConfigCard(false)}
          <div className="clay-card p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span>Required Check Channels</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Configure Telegram channels verified before claiming tasks &amp; withdrawing GRAM.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={channelsEnabledDraft}
                aria-label="Toggle required channels verification gate"
                onClick={() => {
                  onTabTap?.();
                  setChannelsEnabledDraft((v) => !v);
                }}
                className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  channelsEnabledDraft ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    channelsEnabledDraft ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="clay-card-warm !rounded-2xl px-3.5 py-2.5 space-y-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span>
                  Server Bot Status:{' '}
                  <span className="font-extrabold">
                    {serverBotConfigured === true
                      ? 'TELEGRAM_BOT_TOKEN Connected'
                      : serverBotConfigured === false
                        ? 'TELEGRAM_BOT_TOKEN Missing on Server'
                        : 'Checking...'}
                  </span>
                </span>
                {onTestChannels && (
                  <button
                    type="button"
                    disabled={testingChannels}
                    onClick={() => void handleTestChannelsClick()}
                    className="clay-btn clay-btn-sky min-h-[32px] px-3 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {testingChannels ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>{testingChannels ? 'Testing...' : 'Test Bot & Channels'}</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] opacity-90">
                Make sure <span className="font-mono-num">TELEGRAM_BOT_TOKEN</span> is set in server environment variables AND your bot is added as an <span className="font-extrabold">Admin</span> in every active channel below. For private channels, enter the <span className="font-mono-num">-100...</span> Channel ID and paste the <span className="font-mono-num">t.me/+...</span> invite link in Optional Join URL.
              </p>

              {channelDiagnostic && (
                <div className="clay-inset !rounded-xl p-2.5 space-y-1.5 text-[11px]">
                  {channelDiagnostic.botError && (
                    <div className="font-bold text-rose-700 dark:text-rose-300">
                      {channelDiagnostic.botError}
                    </div>
                  )}
                  {channelDiagnostic.botUsername && (
                    <div className="font-extrabold text-emerald-700 dark:text-emerald-300">
                      Connected Bot: @{channelDiagnostic.botUsername}
                    </div>
                  )}
                  {(channelDiagnostic.channels ?? []).map((diag) => (
                    <div key={diag.id} className="flex items-center justify-between gap-2 flex-wrap border-t border-stone-200/60 dark:border-stone-700/60 pt-1.5 first:border-t-0 first:pt-0">
                      <span className="font-mono-num font-bold text-stone-900 dark:text-stone-100">
                        {diag.handle}
                      </span>
                      <span
                        className={`font-extrabold ${
                          diag.botIsAdmin
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {diag.botIsAdmin
                          ? `Bot is ${diag.botStatus}${diag.userJoined === true ? ' · You Joined' : diag.userJoined === false ? ' · Not Joined' : ''}`
                          : diag.error || `Status: ${diag.botStatus}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Diagnostic Logs Visualizer (Last 5 Membership API Responses) */}
            <div className="clay-inset !rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span>API Diagnostic Logs (Last 5 Checks)</span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    Raw Telegram Bot <span className="font-mono-num">getChatMember</span> responses for bot-admin &amp; user-joined debugging.
                  </p>
                </div>
                {onRefreshChannelLogs && (
                  <button
                    type="button"
                    disabled={loadingChannelLogs}
                    onClick={() => {
                      onTabTap?.();
                      void onRefreshChannelLogs();
                    }}
                    className="clay-btn clay-btn-neutral min-h-[32px] px-3 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingChannelLogs ? 'animate-spin' : ''}`} />
                    <span>{loadingChannelLogs ? 'Refreshing...' : 'Refresh Logs'}</span>
                  </button>
                )}
              </div>

              {channelLogsError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {channelLogsError}
                </div>
              )}

              {channelDiagnosticLogs.length === 0 ? (
                <div className="rounded-xl bg-stone-100/80 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/70 px-3 py-3 text-[11px] font-semibold text-stone-500 dark:text-stone-400 text-center">
                  No membership check responses recorded yet. Tap &quot;Test Bot &amp; Channels&quot; or run Check Channels from Tasks/Withdraw.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {channelDiagnosticLogs.slice(0, 5).map((entry) => {
                    const passed = entry.allJoined && !entry.error;
                    return (
                      <div
                        key={entry.id}
                        className="clay-card !rounded-xl p-2.5 space-y-2 border border-stone-200/80 dark:border-stone-700/70 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-1.5 py-0.5 rounded-md border font-extrabold text-[10px] ${
                                passed
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {passed ? 'PASSED' : 'NEGATIVE'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 font-mono-num font-bold text-sky-700 dark:text-sky-300 text-[10px]">
                              {entry.endpoint}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 font-mono-num font-semibold text-stone-700 dark:text-stone-300 text-[10px]">
                              mode={entry.verificationMode}
                            </span>
                          </div>
                          <span className="font-mono-num text-[10px] text-stone-500 dark:text-stone-400">
                            {new Date(entry.timestampMs).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] font-mono-num text-stone-600 dark:text-stone-300">
                          <span>TG ID: {entry.telegramUserId || 'none'}</span>
                          {entry.userIdSource && <span>Source: {entry.userIdSource}</span>}
                          <span>
                            Bot: {entry.botConfigured ? (entry.botUsername ? `@${entry.botUsername}` : 'configured') : 'missing'}
                          </span>
                          {typeof entry.fromFirestore === 'boolean' && (
                            <span>Config: {entry.fromFirestore ? 'Firestore' : 'Fallback'}</span>
                          )}
                        </div>

                        {entry.error && (
                          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 px-2 py-1 font-mono-num text-[10px] font-semibold text-rose-700 dark:text-rose-300 break-words">
                            Error: {entry.error}
                          </div>
                        )}

                        {entry.channels.length > 0 && (
                          <div className="space-y-1.5 pt-1 border-t border-stone-200/70 dark:border-stone-700/70">
                            {entry.channels.map((ch, idx) => (
                              <div
                                key={`${entry.id}_${ch.handle}_${idx}`}
                                className="rounded-lg bg-stone-100/70 dark:bg-stone-900/60 px-2 py-1.5 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-mono-num font-extrabold text-stone-900 dark:text-stone-100">
                                    {ch.handle}
                                  </span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {typeof ch.botIsAdmin === 'boolean' && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                          ch.botIsAdmin
                                            ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                            : 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                                        }`}
                                      >
                                        bot: {ch.botStatus || (ch.botIsAdmin ? 'admin' : 'not_admin')}
                                      </span>
                                    )}
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                        ch.joined
                                          ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                          : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                                      }`}
                                    >
                                      {ch.joined ? `joined (${ch.status})` : `failed (${ch.status})`}
                                    </span>
                                  </div>
                                </div>
                                <div className="font-mono-num text-[10px] text-stone-600 dark:text-stone-400 break-words leading-snug">
                                  tg_ok={String(ch.rawTelegramOk ?? 'n/a')}
                                  {ch.errorCode !== undefined ? ` · code=${ch.errorCode}` : ''}
                                  {ch.rawStatus ? ` · rawStatus=${ch.rawStatus}` : ''}
                                  {ch.rawIsMember !== undefined && ch.rawIsMember !== null
                                    ? ` · is_member=${String(ch.rawIsMember)}`
                                    : ''}
                                  {ch.targetChatIdUsed ? ` · chat_id=${ch.targetChatIdUsed}` : ''}
                                  {ch.rawDescription ? ` · desc="${ch.rawDescription}"` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add Channel Form */}
            <form onSubmit={handleAddChannelDraft} className="clay-inset !rounded-2xl p-3.5 space-y-2.5">
              <div className="text-xs font-extrabold text-stone-800 dark:text-stone-200">
                Add Required Telegram Channel ({channelsDraft.length}/10)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newChannelHandle}
                  onChange={(e) => {
                    setNewChannelHandle(e.target.value);
                    setChannelFormError(null);
                  }}
                  placeholder="@channel or https://t.me/... or -100..."
                  aria-label="Channel handle or t.me link"
                  className="clay-card !rounded-xl min-h-[40px] px-3 text-xs font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <input
                  type="text"
                  value={newChannelTitle}
                  onChange={(e) => setNewChannelTitle(e.target.value)}
                  placeholder="Channel Display Title (e.g. Official News)"
                  aria-label="Channel display title"
                  maxLength={60}
                  className="clay-card !rounded-xl min-h-[40px] px-3 text-xs font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  placeholder="Short description shown to users"
                  aria-label="Channel description"
                  maxLength={140}
                  className="clay-card !rounded-xl min-h-[40px] px-3 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <input
                  type="url"
                  value={newChannelUrl}
                  onChange={(e) => setNewChannelUrl(e.target.value)}
                  placeholder="Optional Join URL (for private invite links)"
                  aria-label="Optional invite URL"
                  maxLength={256}
                  className="clay-card !rounded-xl min-h-[40px] px-3 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              {channelFormError && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300"
                >
                  {channelFormError}
                </div>
              )}
              <button
                type="submit"
                disabled={!newChannelHandle.trim()}
                className="clay-btn clay-btn-sky w-full min-h-[40px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Add Channel to Gate List</span>
              </button>
            </form>

            {/* Configured Channels List */}
            <div className="space-y-2">
              {channelsDraft.length === 0 ? (
                <div className="clay-inset p-5 text-center text-xs text-stone-500 dark:text-stone-400">
                  No check channels configured. Add one above or toggle the gate off.
                </div>
              ) : (
                channelsDraft.map((ch) => {
                  const isActive = ch.enabled !== false;
                  return (
                    <div
                      key={ch.id}
                      className={`clay-inset !rounded-2xl p-3 flex items-center justify-between gap-2.5 ${
                        !isActive ? 'opacity-65' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                            {ch.handle}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                              isActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                                : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-stone-700 dark:text-stone-200 truncate mt-0.5">
                          {ch.title}
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {ch.description}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {ch.url && (
                          <a
                            href={ch.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${ch.handle}`}
                            className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-sky-600 dark:text-sky-400"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleChannelDraft(ch.id)}
                          aria-label={isActive ? `Pause ${ch.handle}` : `Activate ${ch.handle}`}
                          className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-700 dark:text-stone-200"
                        >
                          {isActive ? (
                            <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <PlayCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveChannelDraft(ch.id)}
                          aria-label={`Remove ${ch.handle}`}
                          className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Get Code Channel (Tasks Promo Link) */}
            <div className="clay-inset !rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>Get Code Channel (Tasks Promo Button)</span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    Where the clickable &ldquo;Get code&rdquo; button in Tasks sends players to find gift codes.
                  </p>
                </div>
                {normalizeGetCodeChannelUrl(getCodeChannelDraft) && (
                  <a
                    href={normalizeGetCodeChannelUrl(getCodeChannelDraft)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="clay-btn clay-btn-sky min-h-[32px] px-2.5 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0"
                  >
                    <span>Test</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <input
                type="text"
                value={getCodeChannelDraft}
                onChange={(e) => setGetCodeChannelDraft(e.target.value)}
                placeholder="@AIRDROP_GALAXYS or https://t.me/AIRDROP_GALAXYS"
                aria-label="Get code channel username or URL"
                maxLength={256}
                className="clay-card !rounded-xl w-full min-h-[40px] px-3 text-xs font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />

              {channelsDraft.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    Quick fill:
                  </span>
                  {channelsDraft
                    .filter((ch) => Boolean(ch.url))
                    .map((ch) => (
                      <button
                        key={`getcode-fill-${ch.id}`}
                        type="button"
                        onClick={() => {
                          onTabTap?.();
                          setGetCodeChannelDraft(ch.url);
                        }}
                        className="rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800/70 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 dark:text-sky-300 hover:bg-sky-100 cursor-pointer"
                      >
                        {ch.handle}
                      </button>
                    ))}
                </div>
              )}

              <div className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400 truncate">
                Resolved URL: {normalizeGetCodeChannelUrl(getCodeChannelDraft) || 'Not set (uses default payout channel)'}
              </div>
            </div>

            {channelsSaveFeedback && (
              <div
                role={channelsSaveFeedback.type === 'error' ? 'alert' : 'status'}
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                  channelsSaveFeedback.type === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {channelsSaveFeedback.text}
              </div>
            )}

            <button
              type="button"
              disabled={savingChannels}
              onClick={() => void handleSaveChannelsSubmit()}
              className="clay-btn clay-btn-emerald w-full min-h-[44px] rounded-2xl font-extrabold text-sm disabled:opacity-50"
            >
              {savingChannels ? 'Saving Check Channels...' : 'Save Channel Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================
          WITHDRAWALS / PAYOUTS TAB
         ======================================================================== */}
      {tab === 'withdrawals' && (() => {
        const sampleReq = withdrawRequests[0];
        const previewRendered = renderWithdrawApproveMessage({
          template: {
            messageTemplate: wdMsgDraft,
            buttonText: wdBtnTextDraft,
            buttonUrlTemplate: wdBtnUrlDraft,
          },
          gramAmount: sampleReq?.gramAmount || '0.011239',
          eggsAmount: sampleReq?.eggsAmount ?? 11239,
          walletAddress: sampleReq?.walletAddress || 'UQD_gSExampleWalletAddressMcrwh',
          usdValue: sampleReq?.usdValue ?? 0.0112,
          displayName: sampleReq?.displayName || 'Farmer',
          handle: sampleReq?.handle || '@farmer',
          txId: sampleReq?.txId || 'wd_demo123',
          memo: sampleReq?.memo || '',
          adminNote: 'Sent on TON',
        });
        const previewLines = previewRendered.plainText.split('\n');

        return (
        <div key="admin-tab-withdrawals" className="animate-clay-enter space-y-3">
          {/* Collapsible User Approval DM Template Editor */}
          <div className="clay-card !rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                onTabTap?.();
                setWdTemplateOpen((v) => !v);
              }}
              className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl clay-icon-well-mint text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100 truncate">
                    Approval User DM Message Editor
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                    Auto-sent to user&apos;s Telegram DM when you approve a withdrawal
                  </div>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-stone-500 transition-transform shrink-0 ${
                  wdTemplateOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {wdTemplateOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-stone-200/70 dark:border-stone-700/70 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="wd-dm-template"
                      className="text-xs font-bold text-stone-700 dark:text-stone-300"
                    >
                      DM Message Template
                    </label>
                    <span className="font-mono-num text-[11px] text-stone-400">
                      {wdMsgDraft.length}/1500
                    </span>
                  </div>
                  <textarea
                    id="wd-dm-template"
                    rows={7}
                    maxLength={1500}
                    value={wdMsgDraft}
                    onChange={(e) => {
                      setWdMsgDraft(e.target.value);
                      setWdTemplateFeedback(null);
                    }}
                    className="clay-inset w-full p-3 text-xs font-mono-num font-medium text-stone-900 dark:text-stone-100 resize-y min-h-[140px]"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      '{gramAmount}',
                      '{eggsAmount}',
                      '{walletShort}',
                      '{walletAddress}',
                      '{txUrl}',
                      '{displayName}',
                      '{adminNote}',
                    ].map((tok) => (
                      <button
                        key={tok}
                        type="button"
                        onClick={() => {
                          setWdMsgDraft((prev) => (prev + (prev.endsWith('\n') || !prev ? '' : ' ') + tok).slice(0, 1500));
                          setWdTemplateFeedback(null);
                        }}
                        className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[10px] font-mono-num font-extrabold text-stone-700 dark:text-stone-200 cursor-pointer"
                      >
                        +{tok}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="wd-dm-btn-text"
                      className="text-xs font-bold text-stone-700 dark:text-stone-300"
                    >
                      Inline Button Label (optional)
                    </label>
                    <input
                      id="wd-dm-btn-text"
                      type="text"
                      maxLength={48}
                      value={wdBtnTextDraft}
                      onChange={(e) => {
                        setWdBtnTextDraft(e.target.value);
                        setWdTemplateFeedback(null);
                      }}
                      placeholder="🔎 View transaction"
                      className="clay-inset w-full min-h-[40px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="wd-dm-btn-url"
                      className="text-xs font-bold text-stone-700 dark:text-stone-300"
                    >
                      Button Link Template
                    </label>
                    <input
                      id="wd-dm-btn-url"
                      type="text"
                      maxLength={256}
                      value={wdBtnUrlDraft}
                      onChange={(e) => {
                        setWdBtnUrlDraft(e.target.value);
                        setWdTemplateFeedback(null);
                      }}
                      placeholder="https://tonviewer.com/{walletAddress}"
                      className="clay-inset w-full min-h-[40px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100"
                    />
                  </div>
                </div>

                {/* Live Telegram Dark Bubble Preview */}
                <div className="space-y-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Live Telegram DM Preview
                  </div>
                  <div className="rounded-2xl bg-[#0e1621] p-3 space-y-1.5 border border-slate-800">
                    <div className="rounded-xl bg-[#182533] px-3.5 py-2.5 text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                      {previewLines.map((line, i) => (
                        <div key={i} className={i === 0 ? 'font-extrabold text-white' : ''}>
                          {line || '\u00A0'}
                        </div>
                      ))}
                    </div>
                    {previewRendered.buttonText && (
                      <div className="rounded-xl bg-[#2b5278]/70 px-3 py-2 text-center text-xs font-bold text-white flex items-center justify-center gap-1.5">
                        <span>{previewRendered.buttonText}</span>
                        <ExternalLink className="w-3 h-3 opacity-80" />
                      </div>
                    )}
                  </div>
                </div>

                {wdTemplateFeedback && (
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {wdTemplateFeedback}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingWdTemplate || !wdMsgDraft.trim() || !onSaveWithdrawApproveTemplate}
                    onClick={async () => {
                      if (!onSaveWithdrawApproveTemplate) return;
                      setSavingWdTemplate(true);
                      setWdTemplateFeedback(null);
                      try {
                        const ok = await onSaveWithdrawApproveTemplate({
                          messageTemplate: wdMsgDraft.trim(),
                          buttonText: wdBtnTextDraft.trim(),
                          buttonUrlTemplate: wdBtnUrlDraft.trim() || DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate,
                        });
                        if (ok !== false) {
                          setWdTemplateFeedback('Saved! Future withdrawal approvals will DM users with this template.');
                        }
                      } finally {
                        setSavingWdTemplate(false);
                      }
                    }}
                    className="clay-btn clay-btn-emerald flex-1 min-h-[40px] rounded-xl text-xs font-extrabold disabled:opacity-50"
                  >
                    {savingWdTemplate ? 'Saving...' : 'Save Approval Message'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWdMsgDraft(DEFAULT_WITHDRAW_APPROVE_TEMPLATE.messageTemplate);
                      setWdBtnTextDraft(DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonText);
                      setWdBtnUrlDraft(DEFAULT_WITHDRAW_APPROVE_TEMPLATE.buttonUrlTemplate);
                      setWdTemplateFeedback(null);
                    }}
                    className="clay-btn clay-btn-neutral min-h-[40px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="clay-card !rounded-2xl p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={wdSearch}
                  onChange={(e) => setWdSearch(e.target.value)}
                  placeholder="Search farmer, @handle, TON wallet, or memo..."
                  aria-label="Search withdrawal requests"
                  className="clay-inset w-full min-h-[40px] pl-9 pr-3 text-xs font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="clay-inset !rounded-xl flex items-center gap-1 p-1 shrink-0 overflow-x-auto">
                {(
                  [
                    { id: 'pending', label: 'Pending', count: pendingRequests.length },
                    { id: 'approved', label: 'Approved', count: approvedCount },
                    { id: 'rejected', label: 'Rejected', count: rejectedCount },
                    { id: 'all', label: 'All', count: withdrawRequests.length },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setWdFilter(item.id);
                    }}
                    className={`clay-btn px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold whitespace-nowrap ${
                      wdFilter === item.id
                        ? 'clay-btn-amber'
                        : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    {item.label}{' '}
                    <span className="font-mono-num opacity-75">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="clay-card p-8 text-center space-y-1.5">
              <div className="text-sm font-extrabold text-stone-800 dark:text-stone-200">
                {wdSearch.trim()
                  ? 'No matching requests'
                  : wdFilter === 'pending'
                    ? 'Payout queue is clear'
                    : 'No records in this view'}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {wdSearch.trim()
                  ? 'Try another handle, wallet address, or memo.'
                  : wdFilter === 'pending'
                    ? 'New GRAM withdrawal submissions will appear here immediately.'
                    : 'Switch filter above to inspect other payouts.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRequests.map((req) => {
                const statusMeta = getWithdrawalStatusMeta(req.status);
                const statusColor =
                  statusMeta.tone === 'emerald'
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70'
                    : statusMeta.tone === 'rose'
                      ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70'
                      : 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70';
                const isBusy = busyId === req.id;
                const tonviewerUrl = `https://tonviewer.com/${encodeURIComponent(req.walletAddress)}`;

                return (
                  <div key={req.id} className="clay-card !rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                            {req.displayName}
                          </span>
                          <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">
                            {req.handle}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono-num mt-0.5">
                          {new Date(req.createdAtMs).toLocaleString()}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold shrink-0 ${statusColor}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="clay-inset !rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 text-xs">
                      <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          Payout Amount
                        </div>
                        <div className="font-mono-num text-sm font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                          {req.gramAmount} GRAM
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono-num">
                          ${req.usdValue.toFixed(4)} · {req.eggsAmount.toLocaleString()} eggs
                        </div>
                      </div>

                      <div className="sm:col-span-2 min-w-0 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                            TON Destination Wallet
                          </span>
                          <a
                            href={tonviewerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-sky-600 dark:text-sky-400 hover:underline"
                          >
                            <span>Tonviewer</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-num text-stone-800 dark:text-stone-200 truncate flex-1 bg-white/80 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-1.5">
                            {req.walletAddress}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopy(`w_${req.id}`, req.walletAddress)}
                            aria-label="Copy wallet address"
                            className="clay-btn clay-btn-neutral h-8 px-2.5 rounded-lg shrink-0 inline-flex items-center gap-1 text-[11px] font-bold"
                          >
                            {copiedKey === `w_${req.id}` ? (
                              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedKey === `w_${req.id}` ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>

                        {req.memo && (
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-[11px] text-stone-500 dark:text-stone-400">
                              Memo:{' '}
                              <span className="font-mono-num font-extrabold text-stone-900 dark:text-stone-100">
                                {req.memo}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopy(`m_${req.id}`, req.memo)}
                              className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                            >
                              {copiedKey === `m_${req.id}` ? 'Memo copied' : 'Copy memo'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {req.adminNote && (
                      <div className="clay-inset !rounded-xl px-3 py-2 text-xs text-stone-700 dark:text-stone-200 flex items-center justify-between gap-2">
                        <span>
                          <span className="font-extrabold text-stone-500 dark:text-stone-400">Note:</span>{' '}
                          {req.adminNote}
                        </span>
                        {req.reviewedAtMs > 0 && (
                          <span className="text-[11px] text-stone-400 dark:text-stone-500 font-mono-num shrink-0">
                            {new Date(req.reviewedAtMs).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}

                    {req.status === 'pending' && (
                      <div className="space-y-2 pt-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {['Sent on TON', 'Tx verified', 'Invalid TON address'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                setNoteById((prev) => ({ ...prev, [req.id]: preset }))
                              }
                              className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[10px] font-bold text-stone-600 dark:text-stone-300 cursor-pointer transition-colors"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={noteById[req.id] || ''}
                          onChange={(e) =>
                            setNoteById((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Optional note or TON Tx hash"
                          aria-label={`Admin note for ${req.displayName}`}
                          className="clay-inset w-full min-h-[40px] px-3 text-xs font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyId(req.id);
                              try {
                                await onReviewWithdrawal(req, 'approved', noteById[req.id] || '');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="clay-btn clay-btn-emerald min-h-[42px] rounded-2xl disabled:opacity-50 text-xs font-extrabold flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{isBusy ? 'Saving...' : 'Approve Payout'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyId(req.id);
                              try {
                                await onReviewWithdrawal(req, 'rejected', noteById[req.id] || '');
                              } finally {
                                setBusyId(null);
                              }
                            }}
                            className="clay-btn min-h-[42px] rounded-2xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 border border-rose-200 dark:border-rose-800/70 disabled:opacity-50 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject &amp; Refund</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* ========================================================================
          GIFT CODES / PROMOS TAB — GUIDED 3-STEP GENERATOR
         ======================================================================== */}
      {tab === 'promos' && (
        <div key="admin-tab-promos" className="animate-clay-enter space-y-4">
          {/* Freshly Created Gift Code Share Banner */}
          {lastCreatedPromo && (
            <div className="clay-card-mint !rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      Gift Code Live &amp; Ready
                    </div>
                    <div className="text-lg font-mono-num font-extrabold text-stone-900 dark:text-stone-100 tracking-wide">
                      {lastCreatedPromo.code}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLastCreatedPromo(null)}
                  className="text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>

              <div className="clay-inset !rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-stone-800 dark:text-stone-200">
                  {formatPromoRewardSummary(lastCreatedPromo)}
                </span>
                <span className="font-mono-num font-bold text-stone-600 dark:text-stone-400">
                  {lastCreatedPromo.maxUses === 0
                    ? 'Unlimited users'
                    : `For ${lastCreatedPromo.maxUses.toLocaleString()} users`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy('new_code', lastCreatedPromo.code)}
                  className="clay-btn clay-btn-neutral min-h-[40px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  {copiedKey === 'new_code' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Code Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopy('new_post', buildSharePostText(lastCreatedPromo))
                  }
                  className="clay-btn clay-btn-emerald min-h-[40px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                >
                  {copiedKey === 'new_post' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Post Copied</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Copy Telegram Post</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 3-Step Gift Code Generator Card */}
          <form
            onSubmit={(e) => void handleGenerateGiftSubmit(e)}
            className="clay-card p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                  Gift Code Generator
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Step-by-step: choose user limit, select reward, then generate
                </p>
              </div>
              <div className="w-9 h-9 rounded-2xl clay-icon-well flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Gift className="w-4 h-4" />
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { step: 1, title: '1. Users', sub: giftMaxUsers === 0 ? 'Unlimited' : `${giftMaxUsers} users` },
                  { step: 2, title: '2. Reward', sub: draftRewardSummary },
                  { step: 3, title: '3. Generate', sub: giftCodeInput || 'Code' },
                ] as const
              ).map((item) => {
                const isCurrent = giftStep === item.step;
                const isDone = giftStep > item.step;
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setGiftStep(item.step);
                    }}
                    className={`rounded-2xl px-2.5 py-2 text-left transition-all cursor-pointer border ${
                      isCurrent
                        ? 'clay-card-warm !rounded-2xl border-amber-400 dark:border-amber-500/60'
                        : isDone
                          ? 'clay-card-mint !rounded-2xl border-emerald-300 dark:border-emerald-700/60'
                          : 'clay-inset !rounded-2xl border-transparent opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-extrabold text-stone-900 dark:text-stone-100 truncate">
                        {item.title}
                      </span>
                      {isDone && (
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] font-mono-num font-bold text-stone-600 dark:text-stone-300 truncate mt-0.5">
                      {item.sub}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* STEP 1: HOW MANY USERS ("Kitne log ke liye generate krna hai") */}
            {giftStep === 1 && (
              <div className="space-y-3.5 pt-1">
                <div>
                  <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                    Step 1: How many users can claim this gift?
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Pick a preset audience size or enter an exact number of claims
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {USER_COUNT_PRESETS.map((preset) => {
                    const selected = giftMaxUsers === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          onTabTap?.();
                          setGiftMaxUsers(preset.value);
                          setGiftCustomUsersInput(String(preset.value));
                        }}
                        className={`clay-btn rounded-2xl p-2.5 text-left border transition-all ${
                          selected
                            ? 'clay-btn-amber border-amber-400'
                            : 'clay-btn-neutral border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold font-mono-num">
                            {preset.label}
                          </span>
                          {preset.value === 0 && <InfinityIcon className="w-3.5 h-3.5 opacity-80" />}
                        </div>
                        <div className="text-[10px] font-semibold opacity-75 mt-0.5">
                          {preset.tag}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="gift-custom-users"
                      className="text-xs font-bold text-stone-700 dark:text-stone-300"
                    >
                      Custom User Limit (0 = Unlimited)
                    </label>
                    <input
                      id="gift-custom-users"
                      type="number"
                      min={0}
                      max={1000000}
                      value={giftCustomUsersInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setGiftCustomUsersInput(raw);
                        const parsed = Math.max(0, Math.min(1_000_000, Math.floor(Number(raw) || 0)));
                        setGiftMaxUsers(parsed);
                      }}
                      className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                      Validity Window
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {EXPIRY_PRESETS.map((exp) => {
                        const selected = giftExpiryHours === exp.hours;
                        return (
                          <button
                            key={exp.hours}
                            type="button"
                            onClick={() => {
                              onTabTap?.();
                              setGiftExpiryHours(exp.hours);
                            }}
                            className={`clay-btn min-h-[34px] px-2.5 rounded-xl text-[11px] font-extrabold ${
                              selected
                                ? 'clay-btn-amber'
                                : 'clay-btn-neutral text-stone-600 dark:text-stone-300'
                            }`}
                          >
                            {exp.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onTabTap?.();
                    setGiftStep(2);
                  }}
                  className="clay-btn clay-btn-emerald w-full min-h-[44px] rounded-2xl text-sm font-extrabold flex items-center justify-center gap-2"
                >
                  <span>Next: Choose Gift Reward</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* STEP 2: CHOOSE GIFT REWARD ("Kya dena hai / Gift code reward select krna hai") */}
            {giftStep === 2 && (
              <div className="space-y-3.5 pt-1">
                <div>
                  <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                    Step 2: What reward will this code give?
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Choose Coins, Eggs, or a Chicken Hen pack for recipients
                  </p>
                </div>

                {/* Reward Category Cards */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'coins',
                        label: 'Coins',
                        sub: 'Shop currency',
                        icon: <CoinIcon className="w-7 h-7" />,
                      },
                      {
                        id: 'eggs',
                        label: 'Eggs',
                        sub: 'Cash & reinvest',
                        icon: <EggIcon className="w-7 h-7" />,
                      },
                      {
                        id: 'chicken',
                        label: 'Chicken Hen',
                        sub: '24/7 producer',
                        icon: <ChickenSprite breed={giftChickenBreed} className="w-8 h-8" />,
                      },
                    ] as const
                  ).map((cat) => {
                    const selected = giftRewardType === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onTabTap?.();
                          setGiftRewardType(cat.id);
                        }}
                        className={`clay-btn rounded-2xl p-3 flex flex-col items-center text-center gap-1.5 border ${
                          selected
                            ? 'clay-btn-amber border-amber-400'
                            : 'clay-btn-neutral border-transparent'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl clay-icon-well flex items-center justify-center">
                          {cat.icon}
                        </div>
                        <div className="text-xs font-extrabold">{cat.label}</div>
                        <div className="text-[10px] font-semibold opacity-75">{cat.sub}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Contextual Reward Value Picker */}
                {giftRewardType === 'coins' && (
                  <div className="clay-inset !rounded-2xl p-3 space-y-2.5">
                    <div className="text-xs font-extrabold text-stone-700 dark:text-stone-300">
                      Select Coins per User
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {COIN_REWARD_PRESETS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setGiftCoinsAmount(String(amt))}
                          className={`clay-btn min-h-[36px] rounded-xl text-xs font-mono-num font-extrabold ${
                            Number(giftCoinsAmount) === amt
                              ? 'clay-btn-amber'
                              : 'clay-btn-neutral'
                          }`}
                        >
                          +{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="gift-coins-custom"
                        className="text-[11px] font-bold text-stone-500 dark:text-stone-400"
                      >
                        Custom Coins Amount
                      </label>
                      <input
                        id="gift-coins-custom"
                        type="number"
                        min={1}
                        max={1000000}
                        value={giftCoinsAmount}
                        onChange={(e) => setGiftCoinsAmount(e.target.value)}
                        className="clay-card !rounded-xl w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                )}

                {giftRewardType === 'eggs' && (
                  <div className="clay-inset !rounded-2xl p-3 space-y-2.5">
                    <div className="text-xs font-extrabold text-stone-700 dark:text-stone-300">
                      Select Eggs per User
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      {EGG_REWARD_PRESETS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setGiftEggsAmount(String(amt))}
                          className={`clay-btn min-h-[36px] rounded-xl text-xs font-mono-num font-extrabold ${
                            Number(giftEggsAmount) === amt
                              ? 'clay-btn-amber'
                              : 'clay-btn-neutral'
                          }`}
                        >
                          +{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="gift-eggs-custom"
                        className="text-[11px] font-bold text-stone-500 dark:text-stone-400"
                      >
                        Custom Eggs Amount
                      </label>
                      <input
                        id="gift-eggs-custom"
                        type="number"
                        min={1}
                        max={10000000}
                        value={giftEggsAmount}
                        onChange={(e) => setGiftEggsAmount(e.target.value)}
                        className="clay-card !rounded-xl w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                )}

                {giftRewardType === 'chicken' && (
                  <div className="clay-inset !rounded-2xl p-3 space-y-3">
                    <div className="text-xs font-extrabold text-stone-700 dark:text-stone-300">
                      Choose Chicken Breed
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {CHICKEN_PACKS.map((pack) => {
                        const selected = giftChickenBreed === pack.id;
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => {
                              onTabTap?.();
                              setGiftChickenBreed(pack.id);
                            }}
                            className={`clay-btn rounded-xl p-2.5 flex items-center gap-2.5 text-left border ${
                              selected
                                ? 'clay-btn-amber border-amber-400'
                                : 'clay-btn-neutral border-transparent'
                            }`}
                          >
                            <ChickenSprite breed={pack.id} className="w-8 h-8 shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-extrabold truncate">{pack.name}</div>
                              <div className="text-[10px] font-mono-num font-bold opacity-80">
                                {pack.eggsPerHour} eggs/hr
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                        Hens per claim
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 5].map((qty) => (
                          <button
                            key={qty}
                            type="button"
                            onClick={() => setGiftChickenQty(qty)}
                            className={`clay-btn w-9 h-9 rounded-xl text-xs font-mono-num font-extrabold ${
                              giftChickenQty === qty ? 'clay-btn-amber' : 'clay-btn-neutral'
                            }`}
                          >
                            {qty}×
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setGiftStep(1);
                    }}
                    className="clay-btn clay-btn-neutral min-h-[44px] rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setGiftStep(3);
                    }}
                    className="clay-btn clay-btn-emerald min-h-[44px] rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <span>Next: Generate Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: REVIEW & GENERATE */}
            {giftStep === 3 && (
              <div className="space-y-3.5 pt-1">
                <div>
                  <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                    Step 3: Review &amp; Generate Gift Code
                  </div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Auto-generate or customize the code below and publish live
                  </p>
                </div>

                {/* Prefix + Code Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      Quick Code Prefix
                    </span>
                    <div className="flex items-center gap-1.5">
                      {CODE_PREFIX_PRESETS.map((prefix) => (
                        <button
                          key={prefix}
                          type="button"
                          onClick={() => {
                            setGiftCodePrefix(prefix);
                            setGiftCodeInput(generateGiftCodeString(prefix));
                          }}
                          className={`clay-btn px-2.5 py-1 rounded-lg text-[11px] font-mono-num font-extrabold ${
                            giftCodePrefix === prefix ? 'clay-btn-amber' : 'clay-btn-neutral'
                          }`}
                        >
                          {prefix}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      id="admin-promo-code"
                      type="text"
                      required
                      minLength={3}
                      maxLength={32}
                      value={giftCodeInput}
                      onChange={(e) => {
                        setPromoFormError(null);
                        setGiftCodeInput(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                        );
                      }}
                      placeholder="GIFT-7K9M2P"
                      aria-label="Gift code"
                      className="clay-inset flex-1 min-h-[44px] px-3.5 text-base font-mono-num font-extrabold tracking-wider uppercase text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onTabTap?.();
                        setGiftCodeInput(generateGiftCodeString(giftCodePrefix));
                      }}
                      className="clay-btn clay-btn-neutral min-h-[44px] px-3.5 rounded-2xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
                    >
                      <Dices className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>Random</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="admin-promo-label"
                    className="text-xs font-bold text-stone-700 dark:text-stone-300"
                  >
                    Campaign Label (optional)
                  </label>
                  <input
                    id="admin-promo-label"
                    type="text"
                    maxLength={40}
                    value={giftLabelInput}
                    onChange={(e) => setGiftLabelInput(e.target.value)}
                    placeholder="Weekend Community Drop"
                    className="clay-inset w-full min-h-[42px] px-3 text-sm font-medium text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {/* Live Summary Ticket */}
                <div className="clay-card-warm !rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    Gift Code Summary
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400 font-bold">
                        Users (Limit)
                      </div>
                      <div className="font-mono-num font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                        {giftMaxUsers === 0 ? 'Unlimited (∞)' : `${giftMaxUsers.toLocaleString()} users`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400 font-bold">
                        Reward Each
                      </div>
                      <div className="font-mono-num font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {draftRewardSummary}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400 font-bold">
                        Expires In
                      </div>
                      <div className="font-mono-num font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                        {formatExpiryLabel(giftExpiryHours)}
                      </div>
                    </div>
                  </div>
                </div>

                {promoFormError && (
                  <div
                    role="alert"
                    className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300"
                  >
                    {promoFormError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setGiftStep(2);
                    }}
                    className="clay-btn clay-btn-neutral min-h-[46px] rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Edit Reward</span>
                  </button>
                  <button
                    type="submit"
                    disabled={savingPromo || giftCodeInput.trim().length < 3}
                    className="clay-btn clay-btn-emerald min-h-[46px] rounded-2xl disabled:opacity-50 text-sm font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{savingPromo ? 'Generating...' : 'Generate Gift Code'}</span>
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Active & Past Gift Codes List */}
          <div className="clay-card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200/70 dark:border-stone-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Generated Gift Codes ({promoCodes.length})
                </h3>
              </div>
              <div className="clay-inset !rounded-xl flex items-center gap-1 p-1">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'active', label: 'Active' },
                    { id: 'ended', label: 'Ended' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPromoFilter(f.id)}
                    className={`clay-btn px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                      promoFilter === f.id
                        ? 'clay-btn-amber'
                        : 'text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {visiblePromos.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-stone-400">
                {promoCodes.length === 0
                  ? 'No dynamic gift codes generated yet. Use the 3-step generator above to create one.'
                  : 'No gift codes match this filter.'}
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {visiblePromos.map((p) => {
                  const expired = p.expiresAtMs > 0 && Date.now() > p.expiresAtMs;
                  const maxed = p.maxUses > 0 && p.usedCount >= p.maxUses;
                  const isLive = p.isActive && !expired && !maxed;
                  const pct =
                    p.maxUses > 0 ? Math.min(100, Math.round((p.usedCount / p.maxUses) * 100)) : 0;
                  const rewardText = formatPromoRewardSummary(p);

                  return (
                    <div key={p.code} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                            {p.rewardType === 'eggs' ? (
                              <EggIcon className="w-6 h-6" />
                            ) : p.rewardType === 'chicken' && p.chickenBreed ? (
                              <ChickenSprite breed={p.chickenBreed} className="w-7 h-7" />
                            ) : (
                              <CoinIcon className="w-6 h-6" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono-num text-sm font-extrabold text-stone-900 dark:text-stone-100">
                                {p.code}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleCopy(`code_${p.code}`, p.code)}
                                aria-label={`Copy ${p.code}`}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                              >
                                {copiedKey === `code_${p.code}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                              <span
                                className={`px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold ${
                                  isLive
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                                    : !p.isActive
                                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                                      : 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                                }`}
                              >
                                {expired ? 'Expired' : maxed ? 'Claimed Out' : !p.isActive ? 'Paused' : 'Active'}
                              </span>
                            </div>

                            <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5 font-mono-num">
                              {rewardText}{' '}
                              <span className="font-semibold text-stone-500 dark:text-stone-400 font-sans">
                                · {p.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleCopy(`post_${p.code}`, buildSharePostText(p))}
                            aria-label={`Copy Telegram post for ${p.code}`}
                            title="Copy Telegram post"
                            className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
                          >
                            {copiedKey === `post_${p.code}` ? (
                              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Share2 className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onTogglePromoCode(p.code, !p.isActive)}
                            aria-label={p.isActive ? 'Pause promo code' : 'Resume promo code'}
                            className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center"
                          >
                            {p.isActive ? (
                              <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <PlayCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeletePromoCode(p.code)}
                            aria-label="Delete promo code"
                            className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Claim Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono-num text-stone-500 dark:text-stone-400">
                          <span>
                            Claimed:{' '}
                            <strong className="text-stone-800 dark:text-stone-200">
                              {p.usedCount.toLocaleString()}
                            </strong>
                            {' / '}
                            {p.maxUses === 0 ? '∞' : p.maxUses.toLocaleString()}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {p.expiresAtMs > 0
                                ? `Ends ${new Date(p.expiresAtMs).toLocaleDateString()}`
                                : 'No expiry'}
                            </span>
                          </span>
                        </div>
                        {p.maxUses > 0 && (
                          <div className="clay-inset h-2 w-full rounded-full overflow-hidden p-[1px]">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                maxed ? 'bg-stone-400' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          TASKS TAB
         ======================================================================== */}
      {tab === 'tasks' && (
        <div key="admin-tab-tasks" className="animate-clay-enter space-y-4">
          {onSaveTaskPricingConfig && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (savingTaskPricing) return;
                onTabTap?.();
                setSavingTaskPricing(true);
                setTaskPricingFeedback(null);
                try {
                  const nextCfg = resolveTaskPricingConfig({
                    minBudgetCoins: Number(minTaskPriceDraft),
                    channelCheckFeeCoins: Number(channelCheckFeeDraft),
                    platformFeeRate: Math.max(0, Math.min(50, Number(taskFeePercentDraft) || 0)) / 100,
                  });
                  const ok = await onSaveTaskPricingConfig({
                    minBudgetCoins: nextCfg.minBudgetCoins,
                    channelCheckFeeCoins: nextCfg.channelCheckFeeCoins,
                    platformFeeRate: nextCfg.platformFeeRate,
                  });
                  if (ok !== false) {
                    setMinTaskPriceDraft(String(nextCfg.minBudgetCoins));
                    setChannelCheckFeeDraft(String(nextCfg.channelCheckFeeCoins));
                    setTaskFeePercentDraft(String(Math.round(nextCfg.platformFeeRate * 100)));
                    setTaskPricingFeedback(
                      `Saved! Min ${nextCfg.minBudgetCoins.toLocaleString()} coins (w/ Check: ${(nextCfg.minBudgetCoins + nextCfg.channelCheckFeeCoins).toLocaleString()}).`,
                    );
                  } else {
                    setTaskPricingFeedback('Could not save pricing config.');
                  }
                } catch (err) {
                  setTaskPricingFeedback(
                    err instanceof Error ? err.message : 'Failed to save pricing config.',
                  );
                } finally {
                  setSavingTaskPricing(false);
                }
              }}
              className="clay-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                    Paid User Task Pricing (+ Add Task)
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Configure minimum Add Task coins price, Channel Check fee &amp; posting fee %
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onTabTap?.();
                    setMinTaskPriceDraft(String(DEFAULT_TASK_PRICING_CONFIG.minBudgetCoins));
                    setChannelCheckFeeDraft(String(DEFAULT_TASK_PRICING_CONFIG.channelCheckFeeCoins));
                    setTaskFeePercentDraft(
                      String(Math.round(DEFAULT_TASK_PRICING_CONFIG.platformFeeRate * 100)),
                    );
                    setTaskPricingFeedback(null);
                  }}
                  className="clay-btn clay-btn-neutral px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold shrink-0"
                >
                  Defaults (10k / 15k)
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label
                    htmlFor="admin-min-add-task-price"
                    className="text-xs font-bold text-stone-700 dark:text-stone-300"
                  >
                    Min. Add Task Price (No Check)
                  </label>
                  <input
                    id="admin-min-add-task-price"
                    type="number"
                    min={1000}
                    max={1000000}
                    step={100}
                    required
                    value={minTaskPriceDraft}
                    onChange={(e) => setMinTaskPriceDraft(e.target.value)}
                    className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="admin-channel-check-fee"
                    className="text-xs font-bold text-stone-700 dark:text-stone-300"
                  >
                    Enable Check Extra Fee
                  </label>
                  <input
                    id="admin-channel-check-fee"
                    type="number"
                    min={0}
                    max={500000}
                    step={100}
                    required
                    value={channelCheckFeeDraft}
                    onChange={(e) => setChannelCheckFeeDraft(e.target.value)}
                    className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="admin-task-fee-pct"
                    className="text-xs font-bold text-stone-700 dark:text-stone-300"
                  >
                    Posting Fee %
                  </label>
                  <input
                    id="admin-task-fee-pct"
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    required
                    value={taskFeePercentDraft}
                    onChange={(e) => setTaskFeePercentDraft(e.target.value)}
                    className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {(() => {
                const draftMin = Math.max(1000, Math.round(Number(minTaskPriceDraft) || 0));
                const draftCheck = Math.max(0, Math.round(Number(channelCheckFeeDraft) || 0));
                const draftPct = Math.max(0, Math.min(50, Math.round(Number(taskFeePercentDraft) || 0)));
                const postingFee = Math.round(draftMin * (draftPct / 100));
                const pool = Math.max(0, draftMin - postingFee);
                return (
                  <div className="clay-inset !rounded-xl px-3 py-2 text-[11px] font-bold text-stone-600 dark:text-stone-300 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      No Check Min: <span className="font-mono-num text-stone-900 dark:text-stone-100">{draftMin.toLocaleString()}</span> (Fee{' '}
                      <span className="font-mono-num text-rose-600 dark:text-rose-400">-{postingFee.toLocaleString()}</span>, Pool{' '}
                      <span className="font-mono-num text-emerald-700 dark:text-emerald-300">{pool.toLocaleString()}</span>)
                    </span>
                    <span>
                      With Check Min: <span className="font-mono-num text-sky-700 dark:text-sky-300">{(draftMin + draftCheck).toLocaleString()}</span> (Fee{' '}
                      <span className="font-mono-num text-rose-600 dark:text-rose-400">-{(postingFee + draftCheck).toLocaleString()}</span>)
                    </span>
                  </div>
                );
              })()}

              {taskPricingFeedback && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {taskPricingFeedback}
                </div>
              )}

              <button
                type="submit"
                disabled={savingTaskPricing}
                className="clay-btn clay-btn-amber w-full min-h-[42px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {savingTaskPricing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Task Pricing...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Min. Add Task Price</span>
                  </>
                )}
              </button>
            </form>
          )}

          <form
            onSubmit={(e) => void handleCreateTaskSubmit(e)}
            className="clay-card p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                  Publish Official Task
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Appears immediately inside the player Tasks tab
                </p>
              </div>
              <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                {renderPreviewIcon(taskIcon)}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="admin-task-title" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Task Title
              </label>
              <input
                id="admin-task-title"
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Join @AIRDROP_GALAXYS Telegram"
                className="clay-inset w-full min-h-[42px] px-3 text-sm font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                Category
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {TASK_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setTaskCategory(cat.id);
                    }}
                    className={`clay-btn min-h-[38px] rounded-xl text-xs font-extrabold ${
                      taskCategory === cat.id ? 'clay-btn-amber' : 'clay-btn-neutral'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="admin-task-reward" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Reward Coins
                </label>
                <input
                  id="admin-task-reward"
                  type="number"
                  min={1}
                  max={1000000}
                  value={taskCoins}
                  onChange={(e) => setTaskCoins(e.target.value)}
                  className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-task-slots" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Max Slots (0 = ∞)
                </label>
                <input
                  id="admin-task-slots"
                  type="number"
                  min={0}
                  max={1000000}
                  value={taskSlots}
                  onChange={(e) => setTaskSlots(e.target.value)}
                  className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                Task Icon
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {TASK_ICONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setTaskIcon(item.id);
                    }}
                    className={`clay-btn min-h-[36px] px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 ${
                      taskIcon === item.id ? 'clay-btn-amber' : 'clay-btn-neutral'
                    }`}
                  >
                    {renderPreviewIcon(item.id)}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="admin-task-url" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Action Link (optional)
              </label>
              <input
                id="admin-task-url"
                type="url"
                value={taskUrl}
                onChange={(e) => setTaskUrl(e.target.value)}
                placeholder="https://t.me/..."
                className="clay-inset w-full min-h-[42px] px-3 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={savingTask || taskTitle.trim().length < 2}
              className="clay-btn clay-btn-emerald w-full min-h-[44px] rounded-2xl disabled:opacity-50 font-extrabold text-sm"
            >
              {savingTask ? 'Publishing Task...' : 'Publish Task'}
            </button>
          </form>

          <div className="clay-card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-200/70 dark:border-stone-800 flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                Custom Task Catalog ({customTasks.length})
              </h3>
              <span className="text-[11px] font-mono-num text-stone-500 dark:text-stone-400">
                {activeTaskCount} active
              </span>
            </div>

            {customTasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-stone-400">
                No custom tasks added yet. Publish one above to show it live in the Tasks tab.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
                {customTasks.map((task) => {
                  const active = task.isActive !== false;
                  return (
                    <div key={task.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                          {renderPreviewIcon(task.icon)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                              {task.title}
                            </span>
                            {!active && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                                Paused
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num truncate">
                            {task.category} · +{task.rewardCoins.toLocaleString()} coins
                            {task.totalSlots && task.totalSlots > 0
                              ? ` · ${task.claimedCount ?? 0}/${task.totalSlots} slots`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void onToggleTask(task.id, !active)}
                          aria-label={active ? 'Pause task' : 'Resume task'}
                          className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center"
                        >
                          {active ? (
                            <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <PlayCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteTask(task.id)}
                          aria-label="Delete task"
                          className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          ADS SETUP TAB
         ======================================================================== */}
      {tab === 'ads' && (
        <form
          key="admin-tab-ads"
          onSubmit={(e) => void handleSaveAdsSubmit(e)}
          className="animate-clay-enter clay-card p-4 space-y-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                Rewarded Ad Network
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Controls Startup, Egg Collect, Miner Buy, Gift Claim, Watch X/10 &amp; Banners
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onTabTap?.();
                setTab('ad_ids');
              }}
              className="clay-btn clay-btn-sky min-h-[36px] px-3 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Paste Template</span>
            </button>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-stone-700 dark:text-stone-300">
              Active Ad Provider
            </span>
            <div className="grid grid-cols-2 gap-2">
              {AD_PROVIDER_CARDS.map((card) => {
                const selected = adDraft.provider === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setAdDraft((d) => ({ ...d, provider: card.id }));
                    }}
                    className={`clay-btn rounded-2xl border p-3 text-left transition-all ${
                      selected
                        ? 'clay-btn-amber border-amber-400'
                        : 'clay-btn-neutral border-transparent'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{card.label}</div>
                    <div className="text-[10px] font-semibold opacity-75 mt-0.5">{card.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* All Network Block / Project / Zone IDs (Always Visible) */}
          <div className="clay-inset !rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-stone-800 dark:text-stone-200">
                Ad Network Block &amp; Zone IDs
              </span>
              <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                Primary runs 1st · Next site runs during 60s cooldown
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="space-y-1">
                <label htmlFor="admin-adsgram-id" className="text-[11px] font-bold text-stone-700 dark:text-stone-300 flex items-center justify-between">
                  <span>AdsGram Block ID</span>
                  {adDraft.provider === 'adsgram' && (
                    <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300">Active</span>
                  )}
                </label>
                <input
                  id="admin-adsgram-id"
                  type="text"
                  value={adDraft.adsgramBlockId}
                  onChange={(e) => setAdDraft((d) => ({ ...d, adsgramBlockId: e.target.value }))}
                  placeholder="e.g. 1234"
                  className="clay-card !rounded-xl w-full min-h-[40px] px-3 text-xs font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-adsgram-task-id" className="text-[11px] font-bold text-stone-700 dark:text-stone-300 flex items-center justify-between">
                  <span>AdsGram Bot-Joins ID</span>
                  {(adDraft.adsgramTaskBlockId || '').trim() && (
                    <span className="text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">Task</span>
                  )}
                </label>
                <input
                  id="admin-adsgram-task-id"
                  type="text"
                  value={adDraft.adsgramTaskBlockId || ''}
                  onChange={(e) => setAdDraft((d) => ({ ...d, adsgramTaskBlockId: e.target.value }))}
                  placeholder="e.g. task-5678"
                  className="clay-card !rounded-xl w-full min-h-[40px] px-3 text-xs font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-gigapub-id" className="text-[11px] font-bold text-stone-700 dark:text-stone-300 flex items-center justify-between">
                  <span>Gigapub Project ID</span>
                  {adDraft.provider === 'gigapub' && (
                    <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300">Active</span>
                  )}
                </label>
                <input
                  id="admin-gigapub-id"
                  type="text"
                  value={adDraft.gigapubProjectId || ''}
                  onChange={(e) => setAdDraft((d) => ({ ...d, gigapubProjectId: e.target.value }))}
                  placeholder="e.g. 5678"
                  className="clay-card !rounded-xl w-full min-h-[40px] px-3 text-xs font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="admin-monetag-id" className="text-[11px] font-bold text-stone-700 dark:text-stone-300 flex items-center justify-between">
                  <span>Monetag Zone ID</span>
                  {adDraft.provider === 'monetag' && (
                    <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300">Active</span>
                  )}
                </label>
                <input
                  id="admin-monetag-id"
                  type="text"
                  value={adDraft.monetagZoneId}
                  onChange={(e) => setAdDraft((d) => ({ ...d, monetagZoneId: e.target.value }))}
                  placeholder="e.g. 9012345"
                  className="clay-card !rounded-xl w-full min-h-[40px] px-3 text-xs font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="admin-ad-title" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Sponsor / Fallback Ad Title
              </label>
              <input
                id="admin-ad-title"
                type="text"
                value={adDraft.customTitle}
                onChange={(e) => setAdDraft((d) => ({ ...d, customTitle: e.target.value }))}
                className="clay-inset w-full min-h-[42px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="admin-ad-seconds" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Watch Timer (seconds)
              </label>
              <input
                id="admin-ad-seconds"
                type="number"
                min={3}
                max={60}
                value={adDraft.watchSeconds}
                onChange={(e) =>
                  setAdDraft((d) => ({ ...d, watchSeconds: Number(e.target.value) || 5 }))
                }
                className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="admin-ad-desc" className="text-xs font-bold text-stone-700 dark:text-stone-300">
              Sponsor Message
            </label>
            <input
              id="admin-ad-desc"
              type="text"
              value={adDraft.customDescription}
              onChange={(e) => setAdDraft((d) => ({ ...d, customDescription: e.target.value }))}
              className="clay-inset w-full min-h-[42px] px-3 text-xs text-stone-900 dark:text-stone-100"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="admin-ad-url" className="text-xs font-bold text-stone-700 dark:text-stone-300">
              Sponsor Link URL
            </label>
            <input
              id="admin-ad-url"
              type="url"
              value={adDraft.customUrl}
              onChange={(e) => setAdDraft((d) => ({ ...d, customUrl: e.target.value }))}
              placeholder="https://t.me/AIRDROP_GALAXYS"
              className="clay-inset w-full min-h-[42px] px-3 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
            />
          </div>

          <div className="pt-3 border-t border-stone-200 dark:border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                  Tasks Banner Ad
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
                  Show a sponsor card inside Tasks tab
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={adDraft.bannerEnabled}
                aria-label="Toggle sponsor banner ad"
                onClick={() => setAdDraft((d) => ({ ...d, bannerEnabled: !d.bannerEnabled }))}
                className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${
                  adDraft.bannerEnabled ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    adDraft.bannerEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {adDraft.bannerEnabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={adDraft.bannerTitle}
                    onChange={(e) => setAdDraft((d) => ({ ...d, bannerTitle: e.target.value }))}
                    placeholder="Banner title"
                    aria-label="Banner title"
                    className="clay-inset min-h-[40px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
                  />
                  <input
                    type="text"
                    value={adDraft.bannerCtaText}
                    onChange={(e) => setAdDraft((d) => ({ ...d, bannerCtaText: e.target.value }))}
                    placeholder="Button text (e.g. Open)"
                    aria-label="Banner button text"
                    className="clay-inset min-h-[40px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
                  />
                  <input
                    type="text"
                    value={adDraft.bannerSubtitle}
                    onChange={(e) => setAdDraft((d) => ({ ...d, bannerSubtitle: e.target.value }))}
                    placeholder="Banner subtitle"
                    aria-label="Banner subtitle"
                    className="clay-inset sm:col-span-2 min-h-[40px] px-3 text-xs text-stone-900 dark:text-stone-100"
                  />
                  <input
                    type="url"
                    value={adDraft.bannerUrl}
                    onChange={(e) => setAdDraft((d) => ({ ...d, bannerUrl: e.target.value }))}
                    placeholder="https://t.me/..."
                    aria-label="Banner URL"
                    className="clay-inset sm:col-span-2 min-h-[40px] px-3 text-xs text-stone-900 dark:text-stone-100"
                  />
                </div>

                <div className="clay-card-warm !rounded-2xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                      Sponsored Ad Preview
                    </div>
                    <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100 truncate">
                      {adDraft.bannerTitle || 'Sponsor Title'}
                    </div>
                    {adDraft.bannerSubtitle && (
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                        {adDraft.bannerSubtitle}
                      </div>
                    )}
                  </div>
                  <span className="clay-btn-sky min-h-[34px] px-3 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0">
                    <span>{adDraft.bannerCtaText || 'Open'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {adsSaveFeedback && (
            <div
              role={adsSaveFeedback.type === 'error' ? 'alert' : 'status'}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                adsSaveFeedback.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {adsSaveFeedback.text}
            </div>
          )}

          <button
            type="submit"
            disabled={savingAds}
            className="clay-btn clay-btn-emerald w-full min-h-[44px] rounded-2xl disabled:opacity-50 font-extrabold text-sm"
          >
            {savingAds ? 'Saving Ad Settings...' : 'Save Ad Settings'}
          </button>
        </form>
      )}

      {/* ========================================================================
          BLOCK IDS & PASTE TEMPLATE TAB
         ======================================================================== */}
      {tab === 'ad_ids' && (
        <form
          key="admin-tab-ad-ids"
          onSubmit={(e) => void handleSaveAdsSubmit(e)}
          className="animate-clay-enter space-y-4"
        >
          {/* Bulk Paste & Copy Template Card */}
          <div className="clay-card p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Ad Block IDs &amp; Paste Template</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Paste all Block IDs, Zone IDs &amp; sponsor settings in one place — applies live without redeploying.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopy('ad_tpl', templateInput)}
                  className="clay-btn clay-btn-neutral min-h-[36px] px-3 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5"
                >
                  {copiedKey === 'ad_tpl' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Copied Template</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Template</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onTabTap?.();
                    setTemplateInput(formatAdConfigTemplate(adDraft));
                    setTemplateStatus('Loaded current fields into template.');
                  }}
                  className="clay-btn clay-btn-neutral min-h-[36px] px-3 rounded-xl text-[11px] font-extrabold"
                >
                  Sync Fields
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="admin-ad-bulk-template"
                className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center justify-between"
              >
                <span>Bulk Paste Box (KEY=VALUE or JSON)</span>
                <span className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400">
                  Fill IDs &amp; click Apply
                </span>
              </label>
              <textarea
                id="admin-ad-bulk-template"
                rows={9}
                value={templateInput}
                onChange={(e) => {
                  setTemplateInput(e.target.value);
                  setTemplateStatus(null);
                }}
                spellCheck={false}
                placeholder={[
                  'ACTIVE_PROVIDER=adsgram',
                  'ADSGRAM_BLOCK_ID=1234',
                  'GIGAPUB_PROJECT_ID=5678',
                  'MONETAG_ZONE_ID=9012345',
                  'WATCH_SECONDS=5',
                ].join('\n')}
                className="clay-inset w-full p-3 text-xs font-mono-num leading-relaxed text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            {templateStatus && (
              <div className="clay-card-mint !rounded-xl px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span>{templateStatus}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleApplyAdTemplate}
              className="clay-btn clay-btn-sky w-full min-h-[40px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              <span>Apply Pasted Template to Fields</span>
            </button>
          </div>

          {/* Direct Individual Network IDs */}
          <div className="clay-card p-4 space-y-3.5">
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                Network Block &amp; Zone IDs ({[adDraft.adsgramBlockId, adDraft.adsgramTaskBlockId, adDraft.gigapubProjectId, adDraft.monetagZoneId].filter((v) => Boolean(v && v.trim())).length}/4)
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Paste each SDK ID directly or populate via template above
              </p>
            </div>

            <div className="space-y-3">
              <div className="clay-inset !rounded-2xl p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="tpl-adsgram-id" className="text-xs font-extrabold text-stone-800 dark:text-stone-200">
                    AdsGram Block ID
                  </label>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                      adDraft.adsgramBlockId.trim()
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {adDraft.adsgramBlockId.trim() ? 'Ready' : 'Empty'}
                  </span>
                </div>
                <input
                  id="tpl-adsgram-id"
                  type="text"
                  value={adDraft.adsgramBlockId}
                  onChange={(e) => setAdDraft((d) => ({ ...d, adsgramBlockId: e.target.value }))}
                  placeholder="Paste AdsGram Block ID (e.g. 1234 or int-1234)"
                  className="clay-card !rounded-xl w-full min-h-[42px] px-3 text-sm font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="clay-inset !rounded-2xl p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="tpl-adsgram-task-id" className="text-xs font-extrabold text-stone-800 dark:text-stone-200">
                    AdsGram Bot-Joins / Task Block ID
                  </label>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                      (adDraft.adsgramTaskBlockId || '').trim()
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {(adDraft.adsgramTaskBlockId || '').trim() ? 'Ready' : 'Empty'}
                  </span>
                </div>
                <input
                  id="tpl-adsgram-task-id"
                  type="text"
                  value={adDraft.adsgramTaskBlockId || ''}
                  onChange={(e) => setAdDraft((d) => ({ ...d, adsgramTaskBlockId: e.target.value }))}
                  placeholder="Paste AdsGram Task Block ID (e.g. task-5678)"
                  className="clay-card !rounded-xl w-full min-h-[42px] px-3 text-sm font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="clay-inset !rounded-2xl p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="tpl-gigapub-id" className="text-xs font-extrabold text-stone-800 dark:text-stone-200">
                    Gigapub Project ID
                  </label>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                      (adDraft.gigapubProjectId || '').trim()
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {(adDraft.gigapubProjectId || '').trim() ? 'Ready' : 'Empty'}
                  </span>
                </div>
                <input
                  id="tpl-gigapub-id"
                  type="text"
                  value={adDraft.gigapubProjectId || ''}
                  onChange={(e) => setAdDraft((d) => ({ ...d, gigapubProjectId: e.target.value }))}
                  placeholder="Paste Gigapub Project ID (e.g. 5678)"
                  className="clay-card !rounded-xl w-full min-h-[42px] px-3 text-sm font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="clay-inset !rounded-2xl p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="tpl-monetag-id" className="text-xs font-extrabold text-stone-800 dark:text-stone-200">
                    Monetag Zone ID
                  </label>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                      adDraft.monetagZoneId.trim()
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {adDraft.monetagZoneId.trim() ? 'Ready' : 'Empty'}
                  </span>
                </div>
                <input
                  id="tpl-monetag-id"
                  type="text"
                  value={adDraft.monetagZoneId}
                  onChange={(e) => setAdDraft((d) => ({ ...d, monetagZoneId: e.target.value }))}
                  placeholder="Paste Monetag Zone ID (e.g. 9012345)"
                  className="clay-card !rounded-xl w-full min-h-[42px] px-3 text-sm font-mono-num text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            {/* Active Provider + Timer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="space-y-1">
                <label htmlFor="tpl-provider-select" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Primary Gate Provider
                </label>
                <select
                  id="tpl-provider-select"
                  value={adDraft.provider}
                  onChange={(e) =>
                    setAdDraft((d) => ({
                      ...d,
                      provider: e.target.value as AdProviderType,
                    }))
                  }
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-extrabold text-stone-900 dark:text-stone-100"
                >
                  {AD_PROVIDER_CARDS.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="tpl-watch-seconds" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Fallback Ad Timer (sec)
                </label>
                <input
                  id="tpl-watch-seconds"
                  type="number"
                  min={3}
                  max={60}
                  value={adDraft.watchSeconds}
                  onChange={(e) =>
                    setAdDraft((d) => ({
                      ...d,
                      watchSeconds: Math.max(3, Math.min(60, Number(e.target.value) || 5)),
                    }))
                  }
                  className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-extrabold text-stone-900 dark:text-stone-100"
                />
              </div>
            </div>

            {/* Active Ad Gates Map */}
            <div className="clay-card-warm !rounded-2xl p-3 space-y-2">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                Active Ad Gates Connected
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] font-bold">
                {[
                  'App Launch (Startup)',
                  'Egg Harvest (Collect)',
                  'Miner Buy (Packs)',
                  'Gift / Promo Claim',
                  '3× Watch & Earn Coins',
                  'Watch & Earn Free Eggs',
                  'AdsGram Bot Joins & Clicks',
                ].map((gate) => (
                  <div
                    key={gate}
                    className="clay-card !rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-stone-800 dark:text-stone-200"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="truncate">{gate}</span>
                  </div>
                ))}
              </div>
            </div>

            {adsSaveFeedback && (
              <div
                role={adsSaveFeedback.type === 'error' ? 'alert' : 'status'}
                className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                  adsSaveFeedback.type === 'error'
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {adsSaveFeedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={savingAds}
              className="clay-btn clay-btn-emerald w-full min-h-[44px] rounded-2xl disabled:opacity-50 font-extrabold text-sm"
            >
              {savingAds ? 'Saving Block IDs...' : 'Save Block IDs & Ad Config'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================
          BROADCAST TAB (WITH MEDIA & CTA BUTTON SUPPORT)
         ======================================================================== */}
      {tab === 'broadcast' && (() => {
        const cleanMediaUrl = bcastMediaUrl.trim();
        const isHttpsMedia = cleanMediaUrl.startsWith('https://');
        const hasUploadedMedia = Boolean(bcastMediaDataUrl);
        const maxMessageLen = bcastMediaType === 'none' ? 2000 : 950;
        const canSend =
          Boolean(onSendBroadcast) &&
          !sendingBroadcast &&
          (bcastTitle.trim().length > 0 || bcastMessage.trim().length > 0) &&
          (bcastMediaType === 'none' || isHttpsMedia || hasUploadedMedia);

        const handlePickBroadcastFile = (file: File | null) => {
          setBcastFileError(null);
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            setBcastFileError('File exceeds 10 MB limit. Choose a smaller image/video/GIF.');
            return;
          }
          let mime = (file.type || '').toLowerCase().trim();
          const extMatch = (file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
          const ext = extMatch ? extMatch[1] : '';
          if (!mime || mime === 'application/octet-stream') {
            if (ext === 'mp4' || ext === 'm4v') mime = 'video/mp4';
            else if (ext === 'webm') mime = 'video/webm';
            else if (ext === 'mov') mime = 'video/quicktime';
            else if (ext === '3gp') mime = 'video/3gpp';
            else if (ext === 'gif') mime = 'image/gif';
            else if (ext === 'png') mime = 'image/png';
            else if (ext === 'webp') mime = 'image/webp';
            else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
          }
          if (mime.startsWith('video/')) {
            setBcastMediaType('video');
          } else if (mime === 'image/gif') {
            setBcastMediaType('animation');
          } else if (mime.startsWith('image/')) {
            setBcastMediaType('photo');
          } else {
            setBcastFileError('Unsupported file format. Please select an image, GIF, or MP4/WebM video.');
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              let normalizedDataUrl = reader.result;
              if (mime && /^data:(?:application\/octet-stream)?;base64,/i.test(normalizedDataUrl)) {
                normalizedDataUrl = normalizedDataUrl.replace(
                  /^data:(?:application\/octet-stream)?;base64,/i,
                  `data:${mime};base64,`,
                );
              }
              setBcastMediaDataUrl(normalizedDataUrl);
              setBcastMediaFilename(file.name);
              setBcastMediaFileSize(file.size);
              setBcastPreviewError(false);
            }
          };
          reader.onerror = () => {
            setBcastFileError('Could not read the selected file.');
          };
          reader.readAsDataURL(file);
        };

        const handleSyncBotClick = async () => {
          if (!onSyncBotSubscribers || syncingBotUsers) return;
          setSyncingBotUsers(true);
          try {
            const res = await onSyncBotSubscribers();
            if (res.ok) {
              setBcastAudienceStats(res);
            }
          } finally {
            setSyncingBotUsers(false);
          }
        };

        const triggerBroadcast = async (testOnlyToAdmin: boolean) => {
          if (!onSendBroadcast || sendingBroadcast) return;
          setSendingBroadcast(testOnlyToAdmin ? 'test' : 'all');
          setBroadcastResult(null);
          try {
            const res = await onSendBroadcast({
              title: bcastTitle.trim(),
              message: bcastMessage.trim(),
              mediaType: bcastMediaType,
              mediaUrl: bcastMediaType !== 'none' && !hasUploadedMedia ? cleanMediaUrl : undefined,
              mediaDataUrl: bcastMediaType !== 'none' && hasUploadedMedia ? bcastMediaDataUrl : undefined,
              mediaFilename: bcastMediaType !== 'none' && hasUploadedMedia ? bcastMediaFilename : undefined,
              buttonText: bcastButtonText.trim() || undefined,
              buttonUrl: bcastButtonText.trim() ? bcastButtonUrl.trim() : undefined,
              excludeBanned: bcastExcludeBanned,
              testOnlyToAdmin,
            });
            setBroadcastResult(res);
          } catch (err) {
            setBroadcastResult({
              ok: false,
              error: err instanceof Error ? err.message : 'Broadcast request failed.',
            });
          } finally {
            setSendingBroadcast(null);
          }
        };

        return (
          <div key="admin-tab-broadcast" className="animate-clay-enter space-y-4">
            {renderBotConfigCard(true)}
            <div className="clay-card p-4 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-500" />
                    <span>Telegram Bot Broadcast</span>
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Reach everyone who started your Telegram bot or opened the Mini App — with text, uploaded media, or HTTPS links.
                  </p>
                </div>
                {serverBotConfigured === false && (
                  <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold shrink-0">
                    Bot Offline
                  </span>
                )}
              </div>

              {/* Bot Audience Reach Summary */}
              <div className="clay-inset !rounded-2xl p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Bot Broadcast Audience
                  </span>
                  {onSyncBotSubscribers && (
                    <button
                      type="button"
                      disabled={syncingBotUsers}
                      onClick={() => void handleSyncBotClick()}
                      className="clay-btn clay-btn-sky px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingBotUsers ? 'animate-spin' : ''}`} />
                      <span>{syncingBotUsers ? 'Syncing...' : 'Sync Bot Users'}</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/70 dark:bg-stone-900/70 px-2 py-2">
                    <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                      Bot Subscribers
                    </div>
                    <div className="text-sm font-extrabold font-mono-num text-sky-700 dark:text-sky-300">
                      {loadingBcastStats && !bcastAudienceStats
                        ? '...'
                        : (bcastAudienceStats?.botSubscriberCount ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/70 dark:bg-stone-900/70 px-2 py-2">
                    <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                      App Players
                    </div>
                    <div className="text-sm font-extrabold font-mono-num text-stone-800 dark:text-stone-200">
                      {loadingBcastStats && !bcastAudienceStats
                        ? '...'
                        : (bcastAudienceStats?.playerRecipientCount ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 px-2 py-2">
                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      Total Reachable
                    </div>
                    <div className="text-sm font-extrabold font-mono-num text-emerald-800 dark:text-emerald-200">
                      {loadingBcastStats && !bcastAudienceStats
                        ? '...'
                        : (bcastAudienceStats?.totalRecipients ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="bcast-title" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    Headline Title
                  </label>
                  <input
                    id="bcast-title"
                    type="text"
                    maxLength={100}
                    value={bcastTitle}
                    onChange={(e) => setBcastTitle(e.target.value)}
                    placeholder="e.g. Weekend 3× Fever Event is Live!"
                    className="clay-inset w-full min-h-[44px] px-3 text-sm font-bold text-stone-900 dark:text-stone-100"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="bcast-message" className="font-bold text-stone-700 dark:text-stone-300">
                      Message Body
                    </label>
                    <span className="font-mono-num text-[11px] font-bold text-stone-400">
                      {bcastMessage.length}/{maxMessageLen}
                    </span>
                  </div>
                  <textarea
                    id="bcast-message"
                    rows={4}
                    maxLength={maxMessageLen}
                    value={bcastMessage}
                    onChange={(e) => setBcastMessage(e.target.value)}
                    placeholder="Write your announcement message..."
                    className="clay-inset w-full p-3 text-sm font-medium text-stone-900 dark:text-stone-100 resize-y min-h-[104px]"
                  />
                </div>

                {/* Media Attachment Type */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    Media Attachment
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'none', label: 'Text Only', icon: Send },
                        { id: 'photo', label: 'Photo', icon: Image },
                        { id: 'video', label: 'Video', icon: Video },
                        { id: 'animation', label: 'GIF', icon: Film },
                      ] as const
                    ).map((m) => {
                      const MIcon = m.icon;
                      const active = bcastMediaType === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onTabTap?.();
                            setBcastMediaType(m.id);
                            setBcastPreviewError(false);
                            setBcastFileError(null);
                            if (m.id === 'none') {
                              setBcastMediaDataUrl('');
                              setBcastMediaFilename('');
                              setBcastMediaFileSize(0);
                            }
                          }}
                          className={`clay-btn min-h-[42px] px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
                            active
                              ? 'clay-btn-sky'
                              : 'text-stone-600 dark:text-stone-300'
                          }`}
                        >
                          <MIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {bcastMediaType !== 'none' && (
                  <div className="space-y-2.5">
                    {/* Device File Upload Option */}
                    <div className="clay-inset !rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
                          Upload from Device (max 10 MB)
                        </span>
                        {hasUploadedMedia && (
                          <button
                            type="button"
                            onClick={() => {
                              setBcastMediaDataUrl('');
                              setBcastMediaFilename('');
                              setBcastMediaFileSize(0);
                              setBcastFileError(null);
                            }}
                            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Remove file</span>
                          </button>
                        )}
                      </div>
                      <label className="clay-btn clay-btn-neutral w-full min-h-[42px] px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer">
                        <Upload className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                        <span className="truncate">
                          {hasUploadedMedia
                            ? `${bcastMediaFilename} (${(bcastMediaFileSize / 1024).toFixed(0)} KB)`
                            : `Choose ${bcastMediaType === 'video' ? 'Video (MP4/WebM)' : bcastMediaType === 'animation' ? 'GIF' : 'Photo (JPG/PNG/WebP)'}`}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          accept={
                            bcastMediaType === 'video'
                              ? 'video/mp4,video/webm,video/quicktime'
                              : bcastMediaType === 'animation'
                                ? 'image/gif,image/*'
                                : 'image/jpeg,image/png,image/webp,image/gif'
                          }
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            handlePickBroadcastFile(f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {bcastFileError && (
                        <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          {bcastFileError}
                        </p>
                      )}
                    </div>

                    {!hasUploadedMedia && (
                      <div className="space-y-1.5">
                        <label htmlFor="bcast-media-url" className="text-xs font-bold text-stone-700 dark:text-stone-300 block">
                          Or Paste Public HTTPS Media URL ({bcastMediaType})
                        </label>
                        <input
                          id="bcast-media-url"
                          type="url"
                          value={bcastMediaUrl}
                          onChange={(e) => {
                            setBcastMediaUrl(e.target.value);
                            setBcastPreviewError(false);
                          }}
                          placeholder="https://example.com/banner.jpg"
                          className="clay-inset w-full min-h-[44px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100"
                        />
                        {cleanMediaUrl && !isHttpsMedia && (
                          <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            URL must start with https:// (or use Upload from Device above).
                          </p>
                        )}
                      </div>
                    )}

                    {(hasUploadedMedia || isHttpsMedia) &&
                      (bcastMediaType === 'photo' || bcastMediaType === 'animation') &&
                      !bcastPreviewError && (
                        <div className="clay-inset !rounded-2xl p-2 overflow-hidden">
                          <img
                            src={hasUploadedMedia ? bcastMediaDataUrl : cleanMediaUrl}
                            alt="Broadcast media preview"
                            referrerPolicy="no-referrer"
                            onError={() => setBcastPreviewError(true)}
                            className="w-full max-h-48 object-cover rounded-xl"
                          />
                        </div>
                      )}
                    {hasUploadedMedia && bcastMediaType === 'video' && (
                      <div className="clay-inset !rounded-2xl p-2 overflow-hidden">
                        <video
                          src={bcastMediaDataUrl}
                          controls
                          className="w-full max-h-48 rounded-xl bg-black"
                        />
                      </div>
                    )}
                    {bcastPreviewError && (
                      <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Preview could not load in browser, but Telegram will still fetch valid public URLs.
                      </p>
                    )}
                  </div>
                )}

                {/* Optional Inline CTA Button */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="bcast-btn-text" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      CTA Button Label (optional)
                    </label>
                    <input
                      id="bcast-btn-text"
                      type="text"
                      maxLength={32}
                      value={bcastButtonText}
                      onChange={(e) => setBcastButtonText(e.target.value)}
                      placeholder="Claim Bonus Now"
                      className="clay-inset w-full min-h-[42px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="bcast-btn-url" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      CTA Button HTTPS URL
                    </label>
                    <input
                      id="bcast-btn-url"
                      type="url"
                      value={bcastButtonUrl}
                      onChange={(e) => setBcastButtonUrl(e.target.value)}
                      placeholder="https://t.me/..."
                      className="clay-inset w-full min-h-[42px] px-3 text-xs font-mono-num font-bold text-stone-900 dark:text-stone-100"
                    />
                  </div>
                </div>

                {/* Exclude Banned Toggle */}
                <div className="clay-inset px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                      Exclude Banned Players
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      Skip blocked accounts during full broadcast
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={bcastExcludeBanned}
                    aria-label="Exclude banned users from broadcast"
                    onClick={() => setBcastExcludeBanned((v) => !v)}
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                      bcastExcludeBanned ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        bcastExcludeBanned ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => void triggerBroadcast(true)}
                  className="clay-btn clay-btn-sky min-h-[44px] rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingBroadcast === 'test' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  <span>{sendingBroadcast === 'test' ? 'Sending Test...' : 'Send Test to Admin'}</span>
                </button>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => void triggerBroadcast(false)}
                  className="clay-btn clay-btn-emerald min-h-[44px] rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingBroadcast === 'all' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Megaphone className="w-4 h-4" />
                  )}
                  <span>
                    {sendingBroadcast === 'all' ? 'Broadcasting...' : 'Broadcast to All Users'}
                  </span>
                </button>
              </div>
            </div>

            {broadcastResult && (
              <div
                className={`clay-card p-4 space-y-2.5 ${
                  broadcastResult.ok
                    ? 'border border-emerald-500/30'
                    : 'border border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                    {broadcastResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    )}
                    <span>
                      {broadcastResult.ok
                        ? broadcastResult.testOnlyToAdmin
                          ? 'Test Broadcast Result'
                          : 'Broadcast Delivery Summary'
                        : 'Broadcast Failed'}
                    </span>
                  </div>
                  {typeof broadcastResult.totalTargets === 'number' && (
                    <span className="text-xs font-mono-num font-extrabold text-stone-500 dark:text-stone-400">
                      {broadcastResult.totalTargets} target{broadcastResult.totalTargets === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {broadcastResult.error ? (
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    {broadcastResult.error}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="clay-card-mint !rounded-xl p-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
                        Sent
                      </div>
                      <div className="text-lg font-extrabold font-mono-num text-emerald-900 dark:text-emerald-200">
                        {(broadcastResult.sentCount ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="clay-card-warm !rounded-xl p-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">
                        Blocked
                      </div>
                      <div className="text-lg font-extrabold font-mono-num text-amber-900 dark:text-amber-200">
                        {(broadcastResult.blockedCount ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="clay-inset !rounded-xl p-2.5 text-center">
                      <div className="text-[10px] font-bold uppercase text-stone-500 dark:text-stone-400">
                        Failed
                      </div>
                      <div className="text-lg font-extrabold font-mono-num text-stone-900 dark:text-stone-100">
                        {(broadcastResult.failedCount ?? 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {broadcastResult.sampleError && (
                  <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 break-words">
                    Note: {broadcastResult.sampleError}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ========================================================================
          SYSTEM DIAGNOSTICS TAB
         ======================================================================== */}
      {tab === 'diagnostics' && (() => {
        const formatUptime = (sec: number) => {
          const hrs = Math.floor(sec / 3600);
          const mins = Math.floor((sec % 3600) / 60);
          const rem = sec % 60;
          return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(rem).padStart(2, '0')}s`;
        };
        const allServerLogs = systemDiagnostics?.serverLogs ?? [];
        const visibleLogs = allServerLogs.filter((entry) => {
          if (diagnosticsLogFilter === 'issues') {
            return entry.level === 'warn' || entry.level === 'error';
          }
          if (diagnosticsLogFilter === 'bot') {
            return (
              entry.source.includes('bot') ||
              entry.source.includes('channel') ||
              entry.source.includes('telegram')
            );
          }
          return true;
        });

        return (
          <div key="admin-tab-diagnostics" className="animate-clay-enter space-y-4">
            {renderBotConfigCard(false)}
            {/* Control Header */}
            <div className="clay-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>System Diagnostics &amp; Bot Heartbeat</span>
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Real-time server health, Telegram bot heartbeat latency, Firestore connectivity, and live status logs.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      onTabTap?.();
                      setDiagnosticsAutoRefresh((v) => !v);
                    }}
                    className={`clay-btn min-h-[36px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 ${
                      diagnosticsAutoRefresh ? 'clay-btn-emerald' : 'clay-btn-neutral'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{diagnosticsAutoRefresh ? 'Auto 10s: ON' : 'Auto 10s: OFF'}</span>
                  </button>

                  {onFetchSystemDiagnostics && (
                    <button
                      type="button"
                      disabled={loadingSystemDiagnostics}
                      onClick={() => {
                        onTabTap?.();
                        void onFetchSystemDiagnostics(true);
                      }}
                      className="clay-btn clay-btn-sky min-h-[36px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${loadingSystemDiagnostics ? 'animate-spin' : ''}`}
                      />
                      <span>{loadingSystemDiagnostics ? 'Probing...' : 'Run Heartbeat & Refresh'}</span>
                    </button>
                  )}
                </div>
              </div>

              {systemDiagnosticsError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2 flex-wrap">
                  <span>{systemDiagnosticsError}</span>
                  {onFetchSystemDiagnostics && (
                    <button
                      type="button"
                      disabled={loadingSystemDiagnostics}
                      onClick={() => void onFetchSystemDiagnostics(true)}
                      className="clay-btn clay-btn-neutral min-h-[28px] px-2.5 rounded-lg text-[11px] font-extrabold shrink-0"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {loadingSystemDiagnostics && !systemDiagnostics && (
              <div className="clay-card p-6 text-center space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-sky-600 dark:text-sky-400 mx-auto" />
                <div className="text-xs font-bold text-stone-600 dark:text-stone-300">
                  Loading live server status logs &amp; bot heartbeat...
                </div>
              </div>
            )}

            {systemDiagnostics && (
              <>
                {/* Bot Connectivity Heartbeat Stats */}
                <div className="clay-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <Send className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>Bot Connectivity Heartbeat</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-extrabold ${
                        systemDiagnostics.bot.lastHeartbeatOk
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {systemDiagnostics.bot.lastHeartbeatOk
                        ? 'HEARTBEAT ONLINE'
                        : systemDiagnostics.bot.configured
                          ? 'HEARTBEAT ERROR'
                          : 'TOKEN MISSING'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold uppercase text-stone-500 dark:text-stone-400">
                        Telegram Bot
                      </div>
                      <div className="text-xs font-extrabold font-mono-num text-stone-900 dark:text-stone-100 mt-0.5 truncate">
                        {systemDiagnostics.bot.username ? `@${systemDiagnostics.bot.username}` : 'Not set'}
                      </div>
                      {systemDiagnostics.bot.botId && (
                        <div className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400">
                          ID: {systemDiagnostics.bot.botId}
                        </div>
                      )}
                    </div>

                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold uppercase text-stone-500 dark:text-stone-400">
                        API Latency
                      </div>
                      <div className="text-xs font-extrabold font-mono-num text-stone-900 dark:text-stone-100 mt-0.5">
                        {systemDiagnostics.bot.latencyMs !== null
                          ? `${systemDiagnostics.bot.latencyMs} ms`
                          : 'N/A'}
                      </div>
                      <div className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400">
                        {systemDiagnostics.bot.lastHeartbeatAtMs > 0
                          ? new Date(systemDiagnostics.bot.lastHeartbeatAtMs).toLocaleTimeString()
                          : 'Never'}
                      </div>
                    </div>

                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold uppercase text-stone-500 dark:text-stone-400">
                        Update Transport
                      </div>
                      <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100 mt-0.5">
                        {systemDiagnostics.bot.webhookUrl
                          ? 'Webhook'
                          : `Polling (${systemDiagnostics.bot.activePollIntervalSec}s)`}
                      </div>
                      <div className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400">
                        Pending: {systemDiagnostics.bot.pendingUpdateCount ?? 0}
                      </div>
                    </div>

                    <div className="clay-inset !rounded-xl p-2.5">
                      <div className="text-[10px] font-bold uppercase text-stone-500 dark:text-stone-400">
                        Bot Subscribers
                      </div>
                      <div className="text-xs font-extrabold font-mono-num text-stone-900 dark:text-stone-100 mt-0.5">
                        {(systemDiagnostics.bot.subscriberCount ?? 0).toLocaleString()}
                      </div>
                      <div className="text-[10px] font-mono-num text-stone-500 dark:text-stone-400">
                        Token: {systemDiagnostics.bot.configured ? 'Configured' : 'Missing'}
                      </div>
                    </div>
                  </div>

                  {systemDiagnostics.bot.error && (
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-[11px] font-mono-num font-semibold text-rose-700 dark:text-rose-300 break-words">
                      Bot Error: {systemDiagnostics.bot.error}
                    </div>
                  )}
                </div>

                {/* Server Runtime & Firestore Health */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="clay-card p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                        <Server className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Express Runtime</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                        {systemDiagnostics.env.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs font-mono-num">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Uptime</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {formatUptime(systemDiagnostics.uptimeSec)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Memory (Heap / RSS)</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {systemDiagnostics.memoryMb.heapUsed} MB / {systemDiagnostics.memoryMb.rss} MB
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Node Runtime</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {systemDiagnostics.nodeVersion}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Channel Checks Logged</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {systemDiagnostics.channelCheckStats.totalLogsRecorded}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="clay-card p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Firestore Database</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${
                          systemDiagnostics.firestore.connected
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {systemDiagnostics.firestore.connected ? 'CONNECTED' : 'UNAVAILABLE'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs font-mono-num">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Read Latency</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {systemDiagnostics.firestore.latencyMs !== null
                            ? `${systemDiagnostics.firestore.latencyMs} ms`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Project ID</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100 truncate">
                          {systemDiagnostics.firestore.projectId || 'default'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Database ID</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100 truncate max-w-[180px]">
                          {systemDiagnostics.firestore.databaseId || '(default)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500 dark:text-stone-400 font-sans font-semibold">Server Time</span>
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {new Date(systemDiagnostics.serverTimeMs).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    {systemDiagnostics.firestore.error && (
                      <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 px-2.5 py-1.5 text-[11px] font-mono-num text-rose-700 dark:text-rose-300 break-words">
                        {systemDiagnostics.firestore.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Real-Time Server Status Logs */}
                <div className="clay-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      <span>Real-Time Server Status Logs ({visibleLogs.length})</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'all', label: 'All' },
                          { id: 'issues', label: 'Warn/Error' },
                          { id: 'bot', label: 'Bot/Channels' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setDiagnosticsLogFilter(f.id)}
                          className={`clay-btn min-h-[28px] px-2.5 rounded-lg text-[11px] font-extrabold ${
                            diagnosticsLogFilter === f.id ? 'clay-btn-amber' : 'clay-btn-neutral'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {visibleLogs.length === 0 ? (
                    <div className="clay-inset !rounded-xl p-4 text-center text-xs font-semibold text-stone-500 dark:text-stone-400">
                      No matching server logs recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {visibleLogs.map((log) => (
                        <div
                          key={log.id}
                          className="clay-inset !rounded-xl px-3 py-2 space-y-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono-num font-extrabold text-[10px] ${
                                  log.level === 'error'
                                    ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                                    : log.level === 'warn'
                                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                                      : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                }`}
                              >
                                {log.level.toUpperCase()}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-stone-200/80 dark:bg-stone-800 font-mono-num font-bold text-stone-700 dark:text-stone-300 text-[10px]">
                                {log.source}
                              </span>
                            </div>
                            <span className="font-mono-num text-[10px] text-stone-500 dark:text-stone-400">
                              {new Date(log.timestampMs).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="font-semibold text-stone-900 dark:text-stone-100 break-words">
                            {log.message}
                          </div>
                          {log.detail && (
                            <div className="font-mono-num text-[10px] text-stone-500 dark:text-stone-400 break-words">
                              {log.detail}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ========================================================================
          MAINTENANCE MODE TAB
         ======================================================================== */}
      {tab === 'maintenance' && (
        <div key="admin-tab-maintenance" className="animate-clay-enter space-y-4">
          <div className="clay-card p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <span>Maintenance Mode Control</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  When enabled, all regular users immediately see the Maintenance Page upon opening the bot. Admins keep full access.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wide shrink-0 ${
                  maintenanceConfig.enabled
                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                }`}
              >
                {maintenanceConfig.enabled ? 'ON · Offline' : 'OFF · Live'}
              </span>
            </div>

            {/* Instant On/Off Toggle Card */}
            <div className="clay-inset !rounded-2xl p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                  Maintenance Status Switch
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
                  {maintEnabledDraft
                    ? 'Enabled — regular users are blocked with the maintenance notice'
                    : 'Disabled — all players can use the farm normally'}
                </div>
              </div>
              <button
                type="button"
                disabled={savingMaintenance}
                onClick={() => {
                  const next = !maintEnabledDraft;
                  setMaintEnabledDraft(next);
                  void handleSaveMaintenanceSubmit(next);
                }}
                className={`clay-btn min-h-[42px] px-4 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 ${
                  maintEnabledDraft ? 'clay-btn-amber' : 'clay-btn-emerald'
                } disabled:opacity-50`}
              >
                {savingMaintenance ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Power className="w-3.5 h-3.5" />
                )}
                <span>{maintEnabledDraft ? 'Turn OFF' : 'Turn ON'}</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveMaintenanceSubmit();
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <label
                  htmlFor="admin-maint-title"
                  className="text-xs font-bold text-stone-700 dark:text-stone-300"
                >
                  Maintenance Page Title (English)
                </label>
                <input
                  id="admin-maint-title"
                  type="text"
                  maxLength={80}
                  value={maintTitleDraft}
                  onChange={(e) => setMaintTitleDraft(e.target.value)}
                  placeholder={DEFAULT_MAINTENANCE_CONFIG.title}
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="admin-maint-message"
                  className="text-xs font-bold text-stone-700 dark:text-stone-300"
                >
                  Maintenance Notice Message (English)
                </label>
                <textarea
                  id="admin-maint-message"
                  rows={3}
                  maxLength={400}
                  value={maintMessageDraft}
                  onChange={(e) => setMaintMessageDraft(e.target.value)}
                  placeholder={DEFAULT_MAINTENANCE_CONFIG.message}
                  className="clay-inset w-full p-3 text-xs font-semibold text-stone-900 dark:text-stone-100 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="admin-maint-eta"
                  className="text-xs font-bold text-stone-700 dark:text-stone-300"
                >
                  Estimated Return (Optional)
                </label>
                <input
                  id="admin-maint-eta"
                  type="text"
                  maxLength={80}
                  value={maintEtaDraft}
                  onChange={(e) => setMaintEtaDraft(e.target.value)}
                  placeholder={DEFAULT_MAINTENANCE_CONFIG.estimatedReturn}
                  className="clay-inset w-full min-h-[42px] px-3 text-xs font-bold text-stone-900 dark:text-stone-100"
                />
              </div>

              {/* Live Preview Box */}
              <div className="clay-card-warm !rounded-2xl p-3.5 space-y-1.5 border border-amber-200/80 dark:border-amber-800/50">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  User Screen Preview
                </div>
                <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  {maintTitleDraft.trim() || DEFAULT_MAINTENANCE_CONFIG.title}
                </div>
                <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                  {maintMessageDraft.trim() || DEFAULT_MAINTENANCE_CONFIG.message}
                </p>
                {maintEtaDraft.trim() && (
                  <div className="text-[11px] font-bold text-stone-600 dark:text-stone-400">
                    Estimated Return: {maintEtaDraft.trim()}
                  </div>
                )}
              </div>

              {maintenanceFeedback && (
                <div
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${
                    maintenanceFeedback.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {maintenanceFeedback.text}
                </div>
              )}

              <button
                type="submit"
                disabled={!onSaveMaintenanceConfig || savingMaintenance}
                className="clay-btn clay-btn-amber w-full min-h-[46px] rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingMaintenance ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Maintenance Settings...</span>
                  </>
                ) : (
                  <>
                    <Wrench className="w-4 h-4" />
                    <span>Save &amp; Sync Maintenance Settings</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          DATA RESET TAB
         ======================================================================== */}
      {tab === 'reset' && (
        <div key="admin-tab-reset" className="animate-clay-enter space-y-4">
          <div className="clay-card p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-500" />
                  <span>System Data Reset (Fresh Launch Mode)</span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Starts the entire ecosystem fresh from zero without breaking bot settings, channels, ads, or admins.
                </p>
              </div>
              {systemResetConfig && systemResetConfig.resetCount > 0 && (
                <span className="rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-800/60 px-2.5 py-1 text-[10px] font-extrabold font-mono-num text-amber-800 dark:text-amber-300 shrink-0">
                  Resets: {systemResetConfig.resetCount}
                </span>
              )}
            </div>

            {systemResetConfig && systemResetConfig.resetEpochMs > 0 && (
              <div className="clay-inset !rounded-xl px-3 py-2 text-[11px] font-semibold text-stone-600 dark:text-stone-300 flex items-center justify-between gap-2 flex-wrap">
                <span>
                  Last Reset: <span className="font-mono-num font-bold">{new Date(systemResetConfig.resetEpochMs).toLocaleString()}</span>
                </span>
                {systemResetConfig.resetBy && (
                  <span className="font-mono-num text-stone-500 dark:text-stone-400">
                    By: {systemResetConfig.resetBy}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="clay-inset !rounded-2xl p-3.5 space-y-1.5 border border-rose-200/80 dark:border-rose-900/50">
                <div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Will Be Reset Fresh</span>
                </div>
                <ul className="text-[11px] text-stone-600 dark:text-stone-300 space-y-1 list-disc list-inside leading-snug">
                  <li>All players reset to Level 1, 1,000 starter coins, 0 eggs &amp; 0 chickens</li>
                  <li>All referral links, counts, commissions &amp; pending bot starts cleared</li>
                  <li>Leaderboard stats &amp; Season Cup reset to Season 1</li>
                  <li>Custom/user tasks, promo codes &amp; ban list cleared</li>
                  <li>Pending withdrawals &amp; server runtime caches closed</li>
                </ul>
              </div>

              <div className="clay-inset !rounded-2xl p-3.5 space-y-1.5 border border-emerald-200/80 dark:border-emerald-900/50">
                <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Preserved Safely (Not Touched)</span>
                </div>
                <ul className="text-[11px] text-stone-600 dark:text-stone-300 space-y-1 list-disc list-inside leading-snug">
                  <li>Telegram Bot Token, @username &amp; session encryption key</li>
                  <li>Required Join Channels &amp; Payout Approval message template</li>
                  <li>Admin list &amp; Admin Panel passcode vault</li>
                  <li>Ad provider Block IDs &amp; Paid User Task Pricing config</li>
                </ul>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!onExecuteDataReset || resettingData) return;
                if (resetConfirmInput.trim().toUpperCase() !== 'RESET') return;
                onTabTap?.();
                setResettingData(true);
                setResetProgressText('Starting system data reset...');
                setResetFeedback(null);
                try {
                  const res = await onExecuteDataReset((stage) => {
                    setResetProgressText(stage);
                  });
                  if (res.ok) {
                    setResetConfirmInput('');
                    setResetFeedback({
                      ok: true,
                      text: res.summary || 'System data reset completed cleanly. All users now start fresh!',
                    });
                  } else {
                    setResetFeedback({
                      ok: false,
                      text: res.error || 'System data reset failed.',
                    });
                  }
                } catch (err) {
                  setResetFeedback({
                    ok: false,
                    text: err instanceof Error ? err.message : 'System data reset failed.',
                  });
                } finally {
                  setResetProgressText('');
                  setResettingData(false);
                }
              }}
              className="space-y-3 pt-1"
            >
              <div className="space-y-1">
                <label
                  htmlFor="admin-data-reset-confirm"
                  className="text-xs font-bold text-stone-700 dark:text-stone-300"
                >
                  Type <span className="font-mono-num font-extrabold text-rose-600 dark:text-rose-400">RESET</span> to confirm full runtime wipe
                </label>
                <input
                  id="admin-data-reset-confirm"
                  type="text"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value)}
                  placeholder="Type RESET here"
                  autoComplete="off"
                  className="clay-inset w-full min-h-[44px] px-3 text-sm font-mono-num font-extrabold uppercase text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              {resettingData && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/35 px-3 py-2.5 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">{resetProgressText || 'Resetting System Data...'}</span>
                  </div>
                  <span className="font-mono-num text-[11px] shrink-0 opacity-80">
                    {resetElapsedSec}s
                  </span>
                </div>
              )}

              {resetFeedback && (
                <div
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${
                    resetFeedback.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {resetFeedback.text}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  !onExecuteDataReset ||
                  resettingData ||
                  resetConfirmInput.trim().toUpperCase() !== 'RESET'
                }
                className="clay-btn clay-btn-rose w-full min-h-[46px] rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-45"
              >
                {resettingData ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {resetProgressText || 'Resetting System Data...'}
                      {resetElapsedSec > 0 ? ` (${resetElapsedSec}s)` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Execute System Data Reset</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar matching User Panel BottomNav */}
      <nav
        aria-label="Admin primary navigation"
        className="fixed bottom-0 left-0 right-0 z-40 clay-bottom-nav transition-colors"
      >
        <div className="max-w-xl mx-auto grid grid-cols-5 h-16 px-1.5 gap-1 items-center">
          {(
            [
              {
                id: 'payouts' as const,
                label: 'Payouts',
                icon: Wallet,
                badge: pendingRequests.length > 0,
              },
              {
                id: 'users' as const,
                label: 'Users',
                icon: Users,
                badge: false,
              },
              {
                id: 'growth' as const,
                label: 'Growth',
                icon: Gift,
                badge: false,
              },
              {
                id: 'bot' as const,
                label: 'Bot',
                icon: Send,
                badge: false,
              },
              {
                id: 'system' as const,
                label: 'System',
                icon: Wrench,
                badge: maintenanceConfig.enabled,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activePrimaryGroup === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigatePrimaryGroup(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center min-h-[48px] rounded-2xl px-1 cursor-pointer transition-colors ${
                  active
                    ? 'text-amber-950'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-white/50 dark:hover:bg-stone-800/50'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="alpha-admin-bottom-nav-active"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className="clay-btn-amber absolute inset-0 rounded-2xl -z-10"
                  />
                )}
                <motion.div
                  animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="relative"
                >
                  <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-[2]'}`} />
                  {item.badge && (
                    <span
                      className={`animate-clay-badge absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-stone-900 shadow-xs ${
                        item.id === 'system' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      aria-label={item.id === 'system' ? 'Maintenance active' : 'Pending items'}
                    />
                  )}
                </motion.div>
                <span className="text-[11px] font-extrabold mt-0.5 whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
