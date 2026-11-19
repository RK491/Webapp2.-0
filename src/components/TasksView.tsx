import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Flame,
  Gift,
  Heart,
  Link2,
  Loader2,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  Tv,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AD_NETWORK_TASKS,
  ADSGRAM_BOT_JOIN_TASK,
  calculatePaidTaskFromBudget,
  calculatePaidTaskTopUp,
  calculateProductionRate,
  calculateTaskRefundAmount,
  CHICKEN_PACKS,
  DAILY_STREAK_REWARDS,
  DEFAULT_GET_CODE_CHANNEL_URL,
  FREE_EGGS_MILESTONE_BONUS,
  FREE_EGGS_PER_AD,
  getAdNetworkClaimCountToday,
  getBotJoinClaimCountToday,
  getTaskRemainingSlots,
  getWithdrawAdGateStatus,
  mergeTaskDefinitions,
  normalizeTelegramChannelHandle,
  resolveTaskPricingConfig,
  sortTasks,
  USER_TASK_MAX_REWARD_COINS,
  USER_TASK_MIN_REWARD_COINS,
  USER_TASK_MIN_TOPUP_COINS,
} from '../game/economy';
import type {
  AdConfig,
  AdNetworkId,
  ChannelVerificationResult,
  RequiredTelegramChannel,
  TaskCategory,
  TaskDefinition,
  TaskPricingConfig,
  TaskSortOption,
  UserFarmProfile,
} from '../types/farm';
import {
  getTelegramChannelUrl,
  notifyTelegramOpenLink,
  subscribeTelegramAppActivated,
} from '../utils/telegram';
import { hasConfiguredAdNetworkSdk, hasConfiguredAdsgramTaskSdk } from '../utils/ads';
import { CoinIcon, EggIcon } from './GameIcons';

type FilterTab = 'social' | 'daily' | 'exclusive' | 'partner';
type TaskCheckStage = 'idle' | 'checking' | 'ready' | 'verifying' | 'retry';

interface TasksViewProps {
  profile: UserFarmProfile;
  todayStr: string;
  customTasks: TaskDefinition[];
  adConfig: AdConfig;
  requiredChannels?: RequiredTelegramChannel[];
  channelsGateEnabled?: boolean;
  payoutChannelUrl?: string;
  getCodeChannelUrl?: string;
  botUsername?: string | null;
  taskPricingConfig?: TaskPricingConfig;
  watchingAd?: boolean;
  activeAdNetwork?: AdNetworkId | null;
  activeAdAction?: 'watch_ad' | 'ad_network' | 'adsgram_task' | null;
  channelVerification?: ChannelVerificationResult | null;
  checkingChannels?: boolean;
  channelCheckError?: string | null;
  onCheckChannels?: () => Promise<ChannelVerificationResult | null> | void;
  onRetryCheckChannels?: () => Promise<ChannelVerificationResult | null> | void;
  onVerifyTaskChannel?: (
    actionUrl: string,
    options?: { requireChannelCheck?: boolean },
  ) => Promise<{ joined: boolean; handle?: string; status?: string; reason?: string }>;
  onTabTap?: () => void;
  onClaimPromo: (code: string) => void;
  onClaimDaily: () => void;
  onCompleteTask: (taskId: string) => void;
  onTriggerWatchAd: () => void;
  onTriggerAdNetwork: (network: AdNetworkId) => void;
  onTriggerAdsgramTask?: () => void;
  onOpenDeposit?: () => void;
  onOpenReinvest?: () => void;
  onRefreshTasks?: (silent?: boolean) => Promise<boolean>;
  onCreateTask: (input: {
    title: string;
    subtitle?: string;
    category: TaskCategory;
    rewardCoins: number;
    icon: string;
    actionUrl: string;
    totalSlots: number;
    requireChannelCheck?: boolean;
  }) => Promise<boolean>;
  onTopUpTask?: (taskId: string, budgetCoins: number) => Promise<boolean>;
  onRefundTask?: (taskId: string) => Promise<boolean>;
}

const DEFAULT_PAYOUT_CHANNEL_URL = getTelegramChannelUrl('@AG_PAYOUTS');
const TASK_VERIFY_DELAY_MS = 1400;
const TASKS_AUTO_REFRESH_MS = 60_000;
const PULL_REFRESH_THRESHOLD_PX = 56;
const VERIFIED_TASKS_STORAGE_PREFIX = 'alphagram_verified_tasks_v1_';

export function TasksView({
  profile,
  todayStr,
  customTasks,
  adConfig,
  requiredChannels,
  channelsGateEnabled = true,
  payoutChannelUrl = DEFAULT_PAYOUT_CHANNEL_URL,
  getCodeChannelUrl,
  botUsername,
  taskPricingConfig,
  watchingAd = false,
  activeAdNetwork = null,
  activeAdAction = null,
  channelVerification = null,
  checkingChannels = false,
  channelCheckError = null,
  onCheckChannels,
  onRetryCheckChannels,
  onVerifyTaskChannel,
  onTabTap,
  onClaimPromo,
  onClaimDaily,
  onCompleteTask,
  onTriggerWatchAd,
  onTriggerAdNetwork,
  onTriggerAdsgramTask,
  onOpenDeposit,
  onOpenReinvest,
  onRefreshTasks,
  onCreateTask,
  onTopUpTask,
  onRefundTask,
}: TasksViewProps) {
  const shouldReduceMotion = useReducedMotion();
  const resolvedPricing = useMemo(
    () => resolveTaskPricingConfig(taskPricingConfig),
    [taskPricingConfig],
  );
  const resolvedBotTag = botUsername
    ? `@${botUsername.replace(/^@+/, '')}`
    : 'our Telegram Bot';
  const resolvedGetCodeUrl =
    (getCodeChannelUrl || '').trim() ||
    (payoutChannelUrl || '').trim() ||
    DEFAULT_GET_CODE_CHANNEL_URL;
  const [filterTab, setFilterTab] = useState<FilterTab>('daily');
  const [sortBy, setSortBy] = useState<TaskSortOption>('most_reward');
  const [promoInput, setPromoInput] = useState('');
  const [openPreviewId, setOpenPreviewId] = useState<string | null>(null);
  const [verifiedTasks, setVerifiedTasks] = useState<Record<string, 'verified'>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`${VERIFIED_TASKS_STORAGE_PREFIX}${profile.uid}`);
      const parsed = raw ? (JSON.parse(raw) as Record<string, 'verified'>) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [taskStages, setTaskStages] = useState<Record<string, TaskCheckStage>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`${VERIFIED_TASKS_STORAGE_PREFIX}${profile.uid}`);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      const initial: Record<string, TaskCheckStage> = {};
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (v === 'verified' && !profile.completedTaskIds.includes(k)) {
            initial[k] = 'ready';
          }
        }
      }
      return initial;
    } catch {
      return {};
    }
  });
  const [taskRetryHandles, setTaskRetryHandles] = useState<Record<string, string>>({});
  const [taskRetryReasons, setTaskRetryReasons] = useState<Record<string, string>>({});
  const checkTimersRef = useRef<Record<string, number>>({});
  const pendingReturnTaskIdRef = useRef<string | null>(null);

  // Pull-to-refresh & 60s auto-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number>(Date.now());
  const refreshingRef = useRef(false);

  // + Add paid task modal state (Step 1: form -> Step 2: preview & OK)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalStep, setAddModalStep] = useState<'form' | 'preview'>('form');
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newBudgetCoins, setNewBudgetCoins] = useState(String(resolvedPricing.minBudgetCoins));
  const [newRewardCoins, setNewRewardCoins] = useState(String(USER_TASK_MIN_REWARD_COINS));
  const [newIcon, setNewIcon] = useState('send');
  const [newActionUrl, setNewActionUrl] = useState('');
  const [newRequireChannelCheck, setNewRequireChannelCheck] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    if (!showAddModal) {
      setNewBudgetCoins(
        String(
          resolvedPricing.minBudgetCoins +
            (newRequireChannelCheck ? resolvedPricing.channelCheckFeeCoins : 0),
        ),
      );
    }
  }, [resolvedPricing.minBudgetCoins, resolvedPricing.channelCheckFeeCoins, newRequireChannelCheck, showAddModal]);

  const triggerRefresh = useCallback(
    async (silent = false) => {
      if (!onRefreshTasks || refreshingRef.current) return;
      refreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await onRefreshTasks(silent);
        lastRefreshAtRef.current = Date.now();
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
      }
    },
    [onRefreshTasks],
  );

  useEffect(() => {
    const timers = checkTimersRef.current;
    return () => {
      Object.values(timers).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Subtle 60-second auto-refresh + foreground catch-up for accurate slot counts
  useEffect(() => {
    if (!onRefreshTasks) return;
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void triggerRefresh(true);
    }, TASKS_AUTO_REFRESH_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRefreshAtRef.current >= TASKS_AUTO_REFRESH_MS) {
          void triggerRefresh(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onRefreshTasks, triggerRefresh]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!onRefreshTasks || showAddModal || refreshingRef.current) return;
    if (typeof window !== 'undefined' && window.scrollY > 2) return;
    const touch = e.touches[0];
    if (touch) {
      pullStartYRef.current = touch.clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartYRef.current === null || refreshingRef.current) return;
    if (typeof window !== 'undefined' && window.scrollY > 2) {
      pullStartYRef.current = null;
      setPullDistance(0);
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - pullStartYRef.current;
    if (delta > 6) {
      setPullDistance(Math.min(84, Math.round(delta * 0.45)));
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullStartYRef.current === null) return;
    pullStartYRef.current = null;
    if (pullDistance >= PULL_REFRESH_THRESHOLD_PX) {
      setPullDistance(0);
      void triggerRefresh(false);
    } else {
      setPullDistance(0);
    }
  };

  const dailyClaimedToday = profile.lastDailyClaimDate === todayStr;
  const nextDailyReward = DAILY_STREAK_REWARDS[profile.dailyStreak >= 7 ? 0 : profile.dailyStreak];
  const leghornPack = CHICKEN_PACKS[0];
  const currentProductionRate = calculateProductionRate(profile);

  const allTasks = mergeTaskDefinitions(customTasks);
  const socialTasks = sortTasks(
    allTasks.filter((t) => t.category === 'social' || t.category === 'milestone'),
    sortBy,
    profile.completedTaskIds,
  );
  const dailyTasks = sortTasks(
    allTasks.filter((t) => t.category === 'daily'),
    sortBy,
    profile.completedTaskIds,
  );
  const exclusiveTasks = sortTasks(
    allTasks.filter((t) => t.category === 'exclusive'),
    sortBy,
    profile.completedTaskIds,
  );
  const partnerTasks = sortTasks(
    allTasks.filter((t) => t.category === 'partner'),
    sortBy,
    profile.completedTaskIds,
  );

  const countAvailableTasks = (list: TaskDefinition[]) =>
    list.filter((task) => {
      if (task.creatorUid && task.creatorUid === profile.uid) return false;
      const done = profile.completedTaskIds.includes(task.id);
      if (done) return false;
      const left = getTaskRemainingSlots(task, false);
      return left === null || left > 0;
    }).length;

  const botJoinsToday = getBotJoinClaimCountToday(profile.completedTaskIds, todayStr);
  const botJoinsLeftToday = Math.max(0, ADSGRAM_BOT_JOIN_TASK.dailyLimit - botJoinsToday);
  const availableAdNetworksCount = AD_NETWORK_TASKS.filter(
    (net) => getAdNetworkClaimCountToday(profile.completedTaskIds, net.id, todayStr) < net.dailyLimit,
  ).length;

  const tabCounts: Record<FilterTab, number> = {
    social: countAvailableTasks(socialTasks),
    daily:
      (dailyClaimedToday ? 0 : 1) +
      availableAdNetworksCount +
      1 +
      (botJoinsLeftToday > 0 ? 1 : 0) +
      countAvailableTasks(dailyTasks),
    exclusive: countAvailableTasks(exclusiveTasks),
    partner: countAvailableTasks(partnerTasks),
  };

  const renderTaskIcon = (icon: string) => {
    switch (icon) {
      case 'megaphone':
        return <Megaphone className="w-5 h-5 text-sky-600 dark:text-sky-400" />;
      case 'wallet':
        return <Wallet className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'ticket':
        return <Ticket className="w-5 h-5 text-amber-500 dark:text-amber-400" />;
      case 'gift':
        return <Gift className="w-5 h-5 text-rose-500 dark:text-rose-400" />;
      case 'refresh':
        return <RefreshCw className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'heart':
        return <Heart className="w-5 h-5 text-rose-500 dark:text-rose-400" />;
      case 'send':
        return <Send className="w-5 h-5 text-sky-500 dark:text-sky-400" />;
      case 'shield':
        return <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'users':
        return <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'flame':
        return <Flame className="w-5 h-5 text-orange-500 dark:text-orange-400" />;
      case 'crown':
        return <Crown className="w-5 h-5 text-amber-500 dark:text-amber-400" />;
      default:
        return <Link2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
    }
  };

  const renderAdNetworkIcon = (networkId: AdNetworkId) => {
    if (networkId === 'adsgram') {
      return <Tv className="w-5 h-5 text-sky-600 dark:text-sky-400" />;
    }
    if (networkId === 'gigapub') {
      return <Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
    }
    return <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
  };

  const markTaskVerifiedLocally = useCallback(
    (taskId: string) => {
      setVerifiedTasks((prev) => {
        if (prev[taskId] === 'verified') return prev;
        const next: Record<string, 'verified'> = { ...prev, [taskId]: 'verified' };
        try {
          localStorage.setItem(`${VERIFIED_TASKS_STORAGE_PREFIX}${profile.uid}`, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    [profile.uid],
  );

  // Sync verifiedTasks state when profile.uid changes (e.g. TG SDK hydration or system reset)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${VERIFIED_TASKS_STORAGE_PREFIX}${profile.uid}`);
      const parsed = raw ? (JSON.parse(raw) as Record<string, 'verified'>) : {};
      const safe = parsed && typeof parsed === 'object' ? parsed : {};
      setVerifiedTasks(safe);
      setTaskStages((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(safe)) {
          if (v === 'verified' && !profile.completedTaskIds.includes(k) && (!next[k] || next[k] === 'idle')) {
            next[k] = 'ready';
          }
        }
        return next;
      });
    } catch {
      setVerifiedTasks({});
    }
  }, [profile.uid, profile.completedTaskIds]);

  const startCheckingFlow = (task: TaskDefinition) => {
    if (profile.completedTaskIds.includes(task.id)) return;
    if (task.id === 'daily_reinvest') {
      onTabTap?.();
      if (profile.lastReinvestDate === todayStr) {
        onCompleteTask(task.id);
      } else {
        onOpenReinvest?.();
      }
      return;
    }
    const remainingSlots = getTaskRemainingSlots(task, false);
    if (remainingSlots !== null && remainingSlots <= 0) return;

    const currentStage = taskStages[task.id] ?? 'idle';
    if (currentStage !== 'idle' && currentStage !== 'retry') return;

    onTabTap?.();

    if (task.actionUrl) {
      const handledByTg = notifyTelegramOpenLink(task.actionUrl);
      if (!handledByTg && typeof window !== 'undefined') {
        window.open(task.actionUrl, '_blank', 'noopener,noreferrer');
      }
    }

    pendingReturnTaskIdRef.current = task.id;
    setTaskRetryHandles((prev) => {
      if (!(task.id in prev)) return prev;
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setTaskRetryReasons((prev) => {
      if (!(task.id in prev)) return prev;
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setTaskStages((prev) => ({ ...prev, [task.id]: 'checking' }));
    if (checkTimersRef.current[task.id]) {
      window.clearTimeout(checkTimersRef.current[task.id]);
    }
    checkTimersRef.current[task.id] = window.setTimeout(() => {
      delete checkTimersRef.current[task.id];
      if (!task.requireChannelCheck) {
        markTaskVerifiedLocally(task.id);
      }
      setTaskStages((prev) => ({ ...prev, [task.id]: 'ready' }));
    }, TASK_VERIFY_DELAY_MS);
  };

  // Automatically show Claim as soon as user returns from Telegram after tapping Join
  useEffect(() => {
    const handleReturnFromTelegram = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const pendingId = pendingReturnTaskIdRef.current;
      if (!pendingId) return;
      const targetTask = allTasks.find((t) => t.id === pendingId);
      if (!targetTask || profile.completedTaskIds.includes(pendingId)) {
        pendingReturnTaskIdRef.current = null;
        return;
      }
      const stage = taskStages[pendingId];
      if (stage !== 'checking' && stage !== 'retry') return;

      if (checkTimersRef.current[pendingId]) {
        window.clearTimeout(checkTimersRef.current[pendingId]);
        delete checkTimersRef.current[pendingId];
      }

      pendingReturnTaskIdRef.current = null;
      if (!targetTask.requireChannelCheck) {
        markTaskVerifiedLocally(pendingId);
      }
      setTaskStages((prev) => ({ ...prev, [pendingId]: 'ready' }));
    };

    return subscribeTelegramAppActivated(handleReturnFromTelegram);
  }, [allTasks, markTaskVerifiedLocally, profile.completedTaskIds, taskStages]);

  const handleClaimCheckedTask = async (task: TaskDefinition) => {
    if (profile.completedTaskIds.includes(task.id)) return;
    if (pendingReturnTaskIdRef.current === task.id) {
      pendingReturnTaskIdRef.current = null;
    }

    // Live-verify Telegram channel membership on Claim/Retry when Enable Channel Check is active
    const shouldCheckChannel = Boolean(
      onVerifyTaskChannel && task.actionUrl && task.requireChannelCheck,
    );

    if (shouldCheckChannel && onVerifyTaskChannel && task.actionUrl) {
      setTaskStages((prev) => ({ ...prev, [task.id]: 'verifying' }));
      try {
        const taskCheck = await onVerifyTaskChannel(task.actionUrl, {
          requireChannelCheck: true,
        });
        if (!taskCheck.joined) {
          setTaskStages((prev) => ({ ...prev, [task.id]: 'retry' }));
          if (taskCheck.handle) {
            setTaskRetryHandles((prev) => ({ ...prev, [task.id]: taskCheck.handle! }));
          }
          if (
            taskCheck.reason &&
            taskCheck.status !== 'left' &&
            taskCheck.status !== 'kicked'
          ) {
            setTaskRetryReasons((prev) => ({ ...prev, [task.id]: taskCheck.reason! }));
          } else {
            setTaskRetryReasons((prev) => {
              const next = { ...prev };
              delete next[task.id];
              return next;
            });
          }
          return;
        }
        markTaskVerifiedLocally(task.id);
      } catch {
        setTaskStages((prev) => ({ ...prev, [task.id]: 'retry' }));
        return;
      }
    } else {
      markTaskVerifiedLocally(task.id);
    }

    onCompleteTask(task.id);
    setTaskStages((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setTaskRetryHandles((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setTaskRetryReasons((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
  };

  const renderTaskActionButton = (task: TaskDefinition) => {
    const isOwnTask = Boolean(task.creatorUid && task.creatorUid === profile.uid);
    const done = profile.completedTaskIds.includes(task.id);
    const remainingSlots = getTaskRemainingSlots(task, done);
    const soldOut = !done && remainingSlots !== null && remainingSlots <= 0;
    const stage = taskStages[task.id] ?? 'idle';

    if (isOwnTask) {
      return (
        <span className="clay-inset min-h-[42px] min-w-[78px] px-3.5 rounded-2xl text-xs font-extrabold text-indigo-700 dark:text-indigo-300 inline-flex items-center justify-center shrink-0">
          Posted
        </span>
      );
    }

    if (done) {
      return (
        <span className="clay-inset min-h-[42px] min-w-[78px] px-3.5 rounded-2xl text-xs font-extrabold text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center gap-1 shrink-0">
          <Check className="w-3.5 h-3.5" />
          <span>Done</span>
        </span>
      );
    }

    if (soldOut) {
      return (
        <span className="clay-inset min-h-[42px] min-w-[78px] px-3 rounded-2xl text-xs font-extrabold text-stone-400 dark:text-stone-500 inline-flex items-center justify-center shrink-0">
          Full
        </span>
      );
    }

    if (stage === 'checking' || stage === 'verifying') {
      return (
        <button
          type="button"
          disabled
          className="clay-btn clay-btn-neutral min-h-[42px] min-w-[96px] px-3 rounded-2xl text-xs font-extrabold text-amber-700 dark:text-amber-300 inline-flex items-center justify-center gap-1.5 shrink-0 cursor-wait opacity-90"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{stage === 'verifying' ? 'Verifying' : 'Checking'}</span>
        </button>
      );
    }

    if (stage === 'ready') {
      return (
        <button
          type="button"
          onClick={() => void handleClaimCheckedTask(task)}
          className="clay-btn clay-btn-emerald min-h-[42px] min-w-[84px] px-4 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0 animate-pulse"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Claim</span>
        </button>
      );
    }

    if (stage === 'retry') {
      return (
        <div className="flex items-center gap-1.5 shrink-0">
          {task.actionUrl && (
            <button
              type="button"
              onClick={() => startCheckingFlow(task)}
              aria-label={`Join ${task.title}`}
              className="clay-btn clay-btn-sky min-h-[42px] px-2.5 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0"
            >
              <span>Join</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleClaimCheckedTask(task)}
            className="clay-btn clay-btn-amber min-h-[42px] px-3.5 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    if (task.id === 'daily_reinvest') {
      const reinvestedToday = profile.lastReinvestDate === todayStr;
      if (reinvestedToday) {
        return (
          <button
            type="button"
            onClick={() => onCompleteTask(task.id)}
            className="clay-btn clay-btn-emerald min-h-[42px] min-w-[84px] px-4 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0 animate-pulse"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Claim</span>
          </button>
        );
      }
      return (
        <button
          type="button"
          onClick={() => {
            onTabTap?.();
            onOpenReinvest?.();
          }}
          className="clay-btn clay-btn-amber min-h-[42px] min-w-[84px] px-3.5 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reinvest</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => startCheckingFlow(task)}
        className="clay-btn clay-btn-amber min-h-[42px] min-w-[78px] px-4 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0"
      >
        <span>{task.actionUrl ? 'Join' : 'Start'}</span>
        {task.actionUrl && <ExternalLink className="w-3 h-3" />}
      </button>
    );
  };

  const renderPreviewReward = (params: {
    id: string;
    rewardCoins?: number;
    eggBoostPerHour?: number;
    claimed?: boolean;
  }) => {
    const isOpen = openPreviewId === params.id;
    const coins = params.rewardCoins ?? 0;
    const eggBoost = params.eggBoostPerHour ?? 0;
    const equivalentEggRate = Number(
      ((coins / leghornPack.coinCost) * leghornPack.eggsPerHour).toFixed(1),
    );
    const shortBoostLabel =
      eggBoost > 0
        ? `+${eggBoost} eggs/h`
        : `+${coins.toLocaleString()} coins`;

    return (
      <div className="relative inline-flex items-center group">
        <button
          type="button"
          onClick={() => setOpenPreviewId((prev) => (prev === params.id ? null : params.id))}
          aria-expanded={isOpen}
          aria-label={`Preview Reward ${shortBoostLabel}`}
          className={`inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-[11px] font-bold border transition-colors cursor-pointer ${
            params.claimed
              ? 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
              : 'bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
          }`}
        >
          <Sparkles className="w-3 h-3 shrink-0 text-amber-500 dark:text-amber-400" />
          <span>{shortBoostLabel}</span>
        </button>

        <div
          role="tooltip"
          className={`clay-card-dark absolute left-0 bottom-full mb-1.5 z-30 w-56 !rounded-2xl text-white p-2.5 text-[11px] leading-snug pointer-events-none transition-opacity ${
            isOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          {eggBoost > 0 ? (
            <div className="space-y-1">
              <div className="font-extrabold text-amber-300">
                Reward: +1 {leghornPack.name}
              </div>
              <div className="font-mono-num text-emerald-300 font-bold">
                Egg Boost: +{eggBoost} eggs/h ({currentProductionRate} → {currentProductionRate + eggBoost} eggs/h)
              </div>
              <div className="text-stone-300">
                Value: {leghornPack.coinCost.toLocaleString()} coins
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="font-extrabold text-amber-300">
                Coin Boost: +{coins.toLocaleString()} coins
              </div>
              <div className="font-mono-num text-emerald-300 font-bold">
                Egg Power: ~+{equivalentEggRate} eggs/h toward {leghornPack.name}
              </div>
              {!params.claimed && (
                <div className="text-stone-300 font-mono-num">
                  Balance: {profile.coins.toLocaleString()} → {(profile.coins + coins).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTaskCard = (task: TaskDefinition, extraWellClass = '') => {
    const isOwnTask = Boolean(task.creatorUid && task.creatorUid === profile.uid);
    const done = profile.completedTaskIds.includes(task.id);
    const remainingSlots = getTaskRemainingSlots(task, done);
    const hasSlotCounter = remainingSlots !== null;
    const totalSlots = Number(task.totalSlots ?? 0);
    const slotPct =
      hasSlotCounter && totalSlots > 0
        ? Math.max(0, Math.min(100, Math.round((remainingSlots / totalSlots) * 100)))
        : 0;
    const isLowSlots = hasSlotCounter && remainingSlots > 0 && slotPct <= 25;
    const isPaidTask = Boolean(task.creatorUid || (task.paidCoins ?? 0) > 0);
    const spotsLeftLabel = `${remainingSlots?.toLocaleString() ?? 0}/${totalSlots.toLocaleString()} spots left`;
    const stage = taskStages[task.id] ?? 'idle';

    return (
      <div
        key={task.id}
        className="clay-card clay-hover-lift !rounded-2xl p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0 ${extraWellClass}`}>
              {renderTaskIcon(task.icon)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                  {task.title}
                </span>
                {isOwnTask && (
                  <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 shrink-0">
                    Yours
                  </span>
                )}
                {!isOwnTask && isPaidTask && (
                  <span className="rounded-md bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300 shrink-0">
                    Paid
                  </span>
                )}
                {task.requireChannelCheck && (
                  <span className="rounded-md bg-sky-100/80 dark:bg-sky-950/60 border border-sky-300/70 dark:border-sky-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-800 dark:text-sky-300 shrink-0">
                    Verified
                  </span>
                )}
              </div>
              {task.subtitle && (
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                  {task.id === 'daily_reinvest' && !done
                    ? profile.lastReinvestDate === todayStr
                      ? 'Reinvest confirmed today — tap Claim for +100 coins!'
                      : 'Reinvest min. 500 eggs (+5% extra) to unlock this reward'
                    : task.subtitle}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                  <CoinIcon className="w-3.5 h-3.5" />
                  <span className="font-mono-num">+{task.rewardCoins.toLocaleString()}</span>
                </span>

                {hasSlotCounter && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-extrabold font-mono-num ${
                      remainingSlots === 0
                        ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
                        : isLowSlots
                          ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800/60 text-orange-700 dark:text-orange-300'
                          : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{spotsLeftLabel}</span>
                  </span>
                )}

                {!hasSlotCounter &&
                  renderPreviewReward({
                    id: `task_${task.id}`,
                    rewardCoins: task.rewardCoins,
                    claimed: done,
                  })}
              </div>
            </div>
          </div>

          {renderTaskActionButton(task)}
        </div>

        {(hasSlotCounter || stage !== 'idle') && (
          <div className="space-y-1.5">
            {hasSlotCounter && totalSlots > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[10px] font-bold px-0.5">
                  <span className="text-stone-500 dark:text-stone-400">
                    Remaining slots
                  </span>
                  <span
                    className={`font-mono-num font-extrabold ${
                      remainingSlots === 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : isLowSlots
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {spotsLeftLabel}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={spotsLeftLabel}
                  aria-valuenow={remainingSlots}
                  aria-valuemin={0}
                  aria-valuemax={totalSlots}
                  className="h-2.5 w-full rounded-lg clay-inset overflow-hidden"
                >
                  <motion.div
                    initial={shouldReduceMotion ? false : { width: 0 }}
                    animate={{ width: `${slotPct}%` }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.48,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={`h-full rounded-lg ${
                      remainingSlots === 0
                        ? 'bg-rose-400'
                        : isLowSlots
                          ? 'bg-gradient-to-r from-orange-400 to-amber-500'
                          : 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                    }`}
                  />
                </div>
              </div>
            )}

            {stage === 'checking' && (
              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 px-0.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Opening link... tap Claim once you have joined</span>
              </div>
            )}
            {stage === 'verifying' && (
              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 px-0.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Checking channel membership...</span>
              </div>
            )}
            {stage === 'ready' && !done && (
              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 px-0.5">
                <Check className="w-3 h-3" />
                <span>
                  {task.requireChannelCheck && verifiedTasks[task.id] !== 'verified'
                    ? `Tap Claim to verify join & get +${task.rewardCoins.toLocaleString()} coins`
                    : `${verifiedTasks[task.id] === 'verified' ? 'Verified! ' : ''}Tap Claim to receive +${task.rewardCoins.toLocaleString()} coins`}
                </span>
              </div>
            )}
            {stage === 'retry' && !done && (
              <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 px-0.5">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>
                  {taskRetryReasons[task.id] ||
                    `Not joined ${taskRetryHandles[task.id] || 'this channel'} yet — tap Join, then Retry.`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const parsedBudgetCoins = Math.floor(Number(newBudgetCoins) || 0);
  const parsedRewardCoins = Math.floor(Number(newRewardCoins) || 0);
  const minBudgetWithChannelOpt =
    resolvedPricing.minBudgetCoins +
    (newRequireChannelCheck ? resolvedPricing.channelCheckFeeCoins : 0);
  const parsedChannelHandle = useMemo(
    () => normalizeTelegramChannelHandle(newActionUrl).handle,
    [newActionUrl],
  );
  const channelCheckUrlInvalid = newRequireChannelCheck && !parsedChannelHandle;
  const budgetPreview = calculatePaidTaskFromBudget(
    parsedBudgetCoins,
    parsedRewardCoins,
    newRequireChannelCheck,
    resolvedPricing,
  );
  const requiredCoins = Math.max(
    minBudgetWithChannelOpt,
    budgetPreview.valid ? budgetPreview.totalCostCoins : parsedBudgetCoins || minBudgetWithChannelOpt,
  );
  const canAffordTask =
    budgetPreview.valid &&
    profile.coins >= minBudgetWithChannelOpt &&
    profile.coins >= budgetPreview.totalCostCoins;
  const coinsShort = Math.max(0, requiredCoins - profile.coins);
  const canProceedToPreview =
    newTitle.trim().length >= 2 && budgetPreview.valid && !channelCheckUrlInvalid;

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddModalStep('form');
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addModalStep === 'form') {
      if (!canProceedToPreview) return;
      setAddModalStep('preview');
      return;
    }
    if (newTitle.trim().length < 2 || creatingTask || !budgetPreview.valid || !canAffordTask) return;
    setCreatingTask(true);
    try {
      const ok = await onCreateTask({
        title: newTitle.trim(),
        subtitle: newSubtitle.trim() || undefined,
        category: 'partner',
        rewardCoins: budgetPreview.rewardCoins,
        icon: newIcon,
        actionUrl: newActionUrl.trim(),
        totalSlots: budgetPreview.totalSlots,
        requireChannelCheck: newRequireChannelCheck,
      });
      if (ok) {
        setFilterTab('partner');
        setNewTitle('');
        setNewSubtitle('');
        setNewActionUrl('');
        setNewBudgetCoins(String(resolvedPricing.minBudgetCoins));
        setNewRewardCoins(String(USER_TASK_MIN_REWARD_COINS));
        setNewRequireChannelCheck(false);
        setAddModalStep('form');
        setShowAddModal(false);
      }
    } finally {
      setCreatingTask(false);
    }
  };

  const [showCampaignsDrawer, setShowCampaignsDrawer] = useState(false);
  const [topUpTargetId, setTopUpTargetId] = useState<string | null>(null);
  const [topUpBudgetInput, setTopUpBudgetInput] = useState(String(USER_TASK_MIN_TOPUP_COINS));
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);

  const myCampaigns = useMemo(
    () => customTasks.filter((t) => t.creatorUid === profile.uid),
    [customTasks, profile.uid],
  );

  const campaignSummary = useMemo(() => {
    let totalClicks = 0;
    let totalInvested = 0;
    for (const c of myCampaigns) {
      totalClicks += Math.max(0, Number(c.claimedCount ?? 0));
      totalInvested += Math.max(0, Number(c.paidCoins ?? 0));
    }
    return { totalClicks, totalInvested };
  }, [myCampaigns]);

  const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
    { id: 'social', label: 'Social' },
    { id: 'daily', label: 'Daily' },
    { id: 'exclusive', label: 'Exclusive' },
    { id: 'partner', label: 'Sponsors' },
  ];

  return (
    <div
      className="animate-clay-enter space-y-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Pull-to-Refresh & Auto-Refresh Indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          style={pullDistance > 0 ? { transform: `translateY(${Math.min(18, Math.round(pullDistance * 0.25))}px)` } : undefined}
          className="clay-card-warm !rounded-2xl px-3.5 py-2 flex items-center justify-center gap-2 text-xs font-extrabold text-amber-800 dark:text-amber-300 transition-transform"
        >
          {isRefreshing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Refreshing task slots...</span>
            </>
          ) : (
            <>
              <ArrowDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  pullDistance >= PULL_REFRESH_THRESHOLD_PX ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''
                }`}
              />
              <span>
                {pullDistance >= PULL_REFRESH_THRESHOLD_PX
                  ? 'Release to refresh slots'
                  : 'Pull down to refresh slots'}
              </span>
            </>
          )}
        </div>
      )}

      {/* Header + Refresh & Add Task Buttons */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-100">Tasks</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Complete tasks, watch ads &amp; claim coin rewards
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onRefreshTasks && (
            <button
              type="button"
              onClick={() => {
                onTabTap?.();
                void triggerRefresh(false);
              }}
              disabled={isRefreshing}
              aria-label="Refresh task slots"
              title="Refresh task slots (auto-updates every 60s)"
              className="clay-btn clay-btn-neutral w-10 h-10 rounded-2xl flex items-center justify-center text-stone-700 dark:text-stone-200 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onTabTap?.();
              setShowCampaignsDrawer(true);
            }}
            className="clay-btn clay-btn-neutral min-h-[40px] px-3 rounded-2xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
          >
            <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span className="hidden sm:inline">My Campaigns</span>
            <span className="sm:hidden">Campaigns</span>
            {myCampaigns.length > 0 && (
              <span className="font-mono-num text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300">
                {myCampaigns.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              onTabTap?.();
              setAddModalStep('form');
              setShowAddModal(true);
            }}
            className="clay-btn clay-btn-amber min-h-[40px] px-3.5 rounded-2xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.6]" />
            <span>Add task</span>
          </button>
        </div>
      </div>

      {adConfig.bannerEnabled && adConfig.bannerTitle && (
        <div className="clay-card-warm p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 dark:text-sky-400">
              Sponsored Ad
            </div>
            <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
              {adConfig.bannerTitle}
            </div>
            {adConfig.bannerSubtitle && (
              <div className="text-xs text-stone-500 dark:text-stone-400 truncate">{adConfig.bannerSubtitle}</div>
            )}
          </div>
          {adConfig.bannerUrl && (
            <a
              href={adConfig.bannerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (notifyTelegramOpenLink(adConfig.bannerUrl)) {
                  e.preventDefault();
                }
              }}
              className="clay-btn clay-btn-sky min-h-[40px] px-3.5 rounded-2xl text-xs font-extrabold inline-flex items-center gap-1 shrink-0"
            >
              <span>{adConfig.bannerCtaText || 'Open'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Promo Code Card */}
      <div className="clay-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Ticket className="w-5 h-5" />
            </div>
            <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">Gift &amp; Promo Code</div>
          </div>
          <a
            href={resolvedGetCodeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              onTabTap?.();
              if (notifyTelegramOpenLink(resolvedGetCodeUrl)) {
                e.preventDefault();
              }
            }}
            className="clay-btn clay-btn-sky inline-flex items-center gap-1 min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold shrink-0"
          >
            <span>Get code</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClaimPromo(promoInput);
            setPromoInput('');
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value)}
            placeholder="Enter gift or promo code"
            aria-label="Promo code"
            className="clay-inset flex-1 min-h-[44px] px-3.5 text-sm font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            className="clay-btn clay-btn-emerald min-h-[44px] px-5 rounded-2xl text-sm font-extrabold"
          >
            Claim
          </button>
        </form>
      </div>

      {/* 4 Filter Categories: Social | Daily | Exclusive | Sponsors */}
      <div
        role="tablist"
        aria-label="Task categories"
        className="clay-inset !rounded-2xl grid grid-cols-4 gap-1 p-1.5"
      >
        {FILTER_TABS.map((tab) => {
          const isActive = filterTab === tab.id;
          const count = tabCounts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                onTabTap?.();
                setFilterTab(tab.id);
              }}
              className={`relative min-h-[42px] px-1.5 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                isActive
                  ? 'text-amber-950'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="tasks-category-active"
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="clay-btn-amber absolute inset-0 rounded-xl -z-10"
                />
              )}
              <span className="truncate">{tab.label}</span>
              {count > 0 && (
                <span
                  className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded-md font-extrabold ${
                    isActive
                      ? 'bg-amber-950/20 text-amber-950'
                      : 'bg-rose-500 text-white'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Task Sort Dropdown */}
      <div className="flex items-center justify-between gap-2 px-1">
        <label
          htmlFor="tasks-sort-select"
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-stone-600 dark:text-stone-400"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Sort tasks</span>
        </label>
        <select
          id="tasks-sort-select"
          aria-label="Sort tasks"
          value={sortBy}
          onChange={(e) => {
            onTabTap?.();
            setSortBy(e.target.value as TaskSortOption);
          }}
          className="clay-inset !rounded-xl min-h-[36px] px-3 py-1 text-xs font-extrabold text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
        >
          <option value="most_reward">Most Reward</option>
          <option value="newest">Newest</option>
          <option value="ending_soon">Ending Soon</option>
        </select>
      </div>

      {/* SOCIAL TAB */}
      {filterTab === 'social' && (
        <div key="tasks-tab-social" className="animate-clay-enter space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300">
              Social &amp; Community Tasks
            </h3>
            <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
              Join → Claim
            </span>
          </div>
          {socialTasks.length === 0 ? (
            <div className="clay-card p-6 text-center text-xs text-stone-500 dark:text-stone-400">
              No social tasks yet. Tap + Add task above to create one.
            </div>
          ) : (
            <div className="space-y-2.5">
              {socialTasks.map((task) => renderTaskCard(task))}
            </div>
          )}
        </div>
      )}

      {/* DAILY TAB */}
      {filterTab === 'daily' && (
        <div key="tasks-tab-daily" className="animate-clay-enter space-y-4">
          {/* 7-Day Daily Login */}
          <div className="clay-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">Daily Login</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {dailyClaimedToday ? 'Claimed today · come back tomorrow' : 'Claim your daily coin streak bonus'}
                </p>
                <div className="mt-1.5">
                  {renderPreviewReward({
                    id: 'daily_streak',
                    rewardCoins: nextDailyReward,
                    claimed: dailyClaimedToday,
                  })}
                </div>
              </div>
              <motion.button
                type="button"
                whileTap={!dailyClaimedToday ? { scale: 0.95 } : undefined}
                onClick={onClaimDaily}
                disabled={dailyClaimedToday}
                className={`clay-btn min-h-[42px] px-4 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 ${
                  dailyClaimedToday
                    ? 'clay-inset text-emerald-700 dark:text-emerald-300 cursor-default shadow-none'
                    : 'clay-btn-emerald clay-cta-sheen'
                }`}
              >
                {dailyClaimedToday ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Claimed</span>
                  </>
                ) : (
                  <span>Claim +{nextDailyReward}</span>
                )}
              </motion.button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold px-0.5">
                <span className="text-stone-500 dark:text-stone-400">7-Day Streak Progress</span>
                <span className="font-mono-num font-extrabold text-emerald-700 dark:text-emerald-400">
                  {Math.min(7, Math.max(0, profile.dailyStreak))}/7 days
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Daily login 7-day streak progress"
                aria-valuenow={Math.min(7, Math.max(0, profile.dailyStreak))}
                aria-valuemin={0}
                aria-valuemax={7}
                className="h-2.5 w-full rounded-full clay-inset overflow-hidden"
              >
                <motion.div
                  initial={shouldReduceMotion ? false : { width: 0 }}
                  animate={{
                    width: `${Math.round((Math.min(7, Math.max(0, profile.dailyStreak)) / 7) * 100)}%`,
                  }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.52,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {DAILY_STREAK_REWARDS.map((reward, idx) => {
                const dayNum = idx + 1;
                const claimed = dayNum <= profile.dailyStreak;
                const isNext = dayNum === (profile.dailyStreak >= 7 ? 1 : profile.dailyStreak + 1) && !dailyClaimedToday;
                return (
                  <div
                    key={dayNum}
                    className={`rounded-2xl p-1.5 text-center transition-transform ${
                      claimed
                        ? 'clay-card-mint !rounded-2xl text-emerald-900 dark:text-emerald-200'
                        : isNext
                          ? 'clay-card-warm !rounded-2xl text-amber-950 dark:text-amber-200 scale-[1.04] ring-2 ring-amber-400/70'
                          : 'clay-inset !rounded-2xl text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    <div className="text-[10px] font-bold">Day {dayNum}</div>
                    <div className="flex justify-center my-1">
                      <CoinIcon className="w-5 h-5" />
                    </div>
                    <div className="text-[11px] font-extrabold font-mono-num">{reward}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3× Watch & Earn Coins (AdsGram, Gigapub, Monetag) */}
          {(() => {
            const adGate = getWithdrawAdGateStatus(profile);
            return (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300">
                  Watch &amp; Earn Coins (3 Sites)
                </h3>
                <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                  Only these 3 ad buttons count toward the {adGate.required}-ad Withdraw unlock.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold font-mono-num ${
                    adGate.unlocked
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300/70 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                      : 'bg-sky-100 dark:bg-sky-950/60 border-sky-300/70 dark:border-sky-800/60 text-sky-800 dark:text-sky-300'
                  }`}
                >
                  {adGate.unlocked ? `Withdraw Ready` : `Withdraw ${adGate.watched}/${adGate.required}`}
                </span>
                <span className="rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-800/60 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:text-amber-300 font-mono-num">
                  +80 to +100 / ad
                </span>
              </div>
            </div>

            {AD_NETWORK_TASKS.map((network) => {
              const watchedToday = getAdNetworkClaimCountToday(
                profile.completedTaskIds,
                network.id,
                todayStr,
              );
              const leftToday = Math.max(0, network.dailyLimit - watchedToday);
              const netPct = Math.max(
                0,
                Math.min(100, Math.round((watchedToday / network.dailyLimit) * 100)),
              );
              const isBusy = watchingAd && activeAdNetwork === network.id;
              const maxedOut = leftToday === 0;
              const sdkConfigured = hasConfiguredAdNetworkSdk(network.id, adConfig);

              return (
                <div
                  key={network.id}
                  className="clay-card clay-hover-lift !rounded-2xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                        {renderAdNetworkIcon(network.id)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                            {network.name}
                          </span>
                          <span className="rounded-md bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-1.5 py-0.5 text-[10px] font-bold text-stone-600 dark:text-stone-300">
                            {network.badge}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                              sdkConfigured
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/60 text-sky-700 dark:text-sky-300'
                            }`}
                          >
                            {sdkConfigured ? 'SDK Live' : 'Timer Ad'}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                          {network.subtitle}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                            <CoinIcon className="w-3.5 h-3.5" />
                            <span className="font-mono-num">+{network.rewardCoins} coins</span>
                          </span>
                          <span
                            className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold font-mono-num ${
                              maxedOut
                                ? 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
                                : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {leftToday}/{network.dailyLimit} left today
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={watchingAd || maxedOut}
                      onClick={() => {
                        onTabTap?.();
                        onTriggerAdNetwork(network.id);
                      }}
                      className={`clay-btn min-h-[42px] min-w-[104px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 ${
                        maxedOut
                          ? 'clay-inset text-emerald-700 dark:text-emerald-300 cursor-default shadow-none'
                          : 'clay-btn-emerald'
                      }`}
                    >
                      {maxedOut ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </>
                      ) : isBusy ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Loading</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Earn Coins</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold px-0.5">
                      <span className="text-stone-500 dark:text-stone-400">Daily quota</span>
                      <span className="font-mono-num font-extrabold text-emerald-700 dark:text-emerald-400">
                        {watchedToday}/{network.dailyLimit} watched
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${network.name} daily quota`}
                      aria-valuenow={watchedToday}
                      aria-valuemin={0}
                      aria-valuemax={network.dailyLimit}
                      className="h-2 w-full rounded-full clay-inset overflow-hidden"
                    >
                      <motion.div
                        initial={shouldReduceMotion ? false : { width: 0 }}
                        animate={{ width: `${netPct}%` }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.45,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
            );
          })()}

          {/* 1× Watch & Earn Free Eggs */}
          <div className="clay-card clay-hover-lift !rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                  <EggIcon className="w-7 h-7" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                      Get Free Eggs
                    </span>
                    <span className="rounded-md bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300">
                      Watch &amp; Earn
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mt-0.5">
                    +{FREE_EGGS_PER_AD} Free Eggs per ad · +{FREE_EGGS_MILESTONE_BONUS} bonus chest at 10/10
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                      <EggIcon className="w-3.5 h-3.5" />
                      <span className="font-mono-num">+{FREE_EGGS_PER_AD} eggs / ad</span>
                    </span>
                    <span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 text-[11px] font-extrabold font-mono-num text-emerald-700 dark:text-emerald-300">
                      {profile.watchedAdsCount}/10 bonus chest
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onTabTap?.();
                  onTriggerWatchAd();
                }}
                disabled={watchingAd}
                className="clay-btn clay-btn-amber min-h-[42px] min-w-[104px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0"
              >
                {watchingAd && (activeAdAction === 'watch_ad' || (!activeAdNetwork && activeAdAction !== 'adsgram_task')) ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Earn Eggs</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold px-0.5">
                <span className="text-stone-500 dark:text-stone-400">
                  10/10 Bonus Eggs Chest (+{FREE_EGGS_MILESTONE_BONUS} extra eggs)
                </span>
                <span className="font-mono-num font-extrabold text-amber-700 dark:text-amber-300">
                  {profile.watchedAdsCount}/10
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Free eggs ad bonus chest progress"
                aria-valuenow={Math.min(10, profile.watchedAdsCount)}
                aria-valuemin={0}
                aria-valuemax={10}
                className="h-2.5 w-full rounded-full clay-inset overflow-hidden"
              >
                <motion.div
                  initial={shouldReduceMotion ? false : { width: 0 }}
                  animate={{
                    width: `${Math.min(100, Math.round((Math.min(10, profile.watchedAdsCount) / 10) * 100))}%`,
                  }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.48,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400"
                />
              </div>
            </div>
          </div>

          {/* 1× AdsGram Bot Joins & Clicks */}
          <div className="clay-card clay-hover-lift !rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                      {ADSGRAM_BOT_JOIN_TASK.name}
                    </span>
                    <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
                      AdsGram Clicks
                    </span>
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold ${
                        hasConfiguredAdsgramTaskSdk(adConfig)
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/60 text-sky-700 dark:text-sky-300'
                      }`}
                    >
                      {hasConfiguredAdsgramTaskSdk(adConfig) ? 'SDK Live' : 'Verified Offer'}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                    {ADSGRAM_BOT_JOIN_TASK.subtitle}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                      <CoinIcon className="w-3.5 h-3.5" />
                      <span className="font-mono-num">+{ADSGRAM_BOT_JOIN_TASK.rewardCoins} coins</span>
                    </span>
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold font-mono-num ${
                        botJoinsLeftToday === 0
                          ? 'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
                          : 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300'
                      }`}
                    >
                      {botJoinsLeftToday}/{ADSGRAM_BOT_JOIN_TASK.dailyLimit} left today
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={watchingAd || botJoinsLeftToday === 0 || !onTriggerAdsgramTask}
                onClick={() => {
                  onTabTap?.();
                  onTriggerAdsgramTask?.();
                }}
                className={`clay-btn min-h-[42px] min-w-[104px] px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 ${
                  botJoinsLeftToday === 0
                    ? 'clay-inset text-emerald-700 dark:text-emerald-300 cursor-default shadow-none'
                    : 'clay-btn-sky'
                }`}
              >
                {botJoinsLeftToday === 0 ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </>
                ) : watchingAd && activeAdAction === 'adsgram_task' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Bot Joins</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold px-0.5">
                <span className="text-stone-500 dark:text-stone-400">Daily bot clicks</span>
                <span className="font-mono-num font-extrabold text-indigo-700 dark:text-indigo-300">
                  {botJoinsToday}/{ADSGRAM_BOT_JOIN_TASK.dailyLimit} completed
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="AdsGram Bot Joins daily progress"
                aria-valuenow={botJoinsToday}
                aria-valuemin={0}
                aria-valuemax={ADSGRAM_BOT_JOIN_TASK.dailyLimit}
                className="h-2.5 w-full rounded-full clay-inset overflow-hidden"
              >
                <motion.div
                  initial={shouldReduceMotion ? false : { width: 0 }}
                  animate={{
                    width: `${Math.min(100, Math.round((botJoinsToday / ADSGRAM_BOT_JOIN_TASK.dailyLimit) * 100))}%`,
                  }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.48,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Every day tasks */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300 px-1">Every day</h3>
            {dailyTasks.map((task) => renderTaskCard(task))}
          </div>
        </div>
      )}

      {/* EXCLUSIVE TAB */}
      {filterTab === 'exclusive' && (
        <div key="tasks-tab-exclusive" className="animate-clay-enter space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300">
              Exclusive Limited-Slot Quests
            </h3>
            <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
              Join → Claim
            </span>
          </div>
          {exclusiveTasks.length === 0 ? (
            <div className="clay-card p-6 text-center text-xs text-stone-500 dark:text-stone-400">
              No exclusive tasks yet. Tap + Add task above to create one.
            </div>
          ) : (
            <div className="space-y-2.5">
              {exclusiveTasks.map((task) => renderTaskCard(task))}
            </div>
          )}
        </div>
      )}

      {/* SPONSORS TAB */}
      {filterTab === 'partner' && (
        <div key="tasks-tab-partner" className="animate-clay-enter space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300">
              Sponsors Tasks
            </h3>
            <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
              Join → Claim
            </span>
          </div>
          {partnerTasks.length === 0 ? (
            <div className="clay-card p-6 text-center text-xs text-stone-500 dark:text-stone-400">
              No sponsors tasks yet. Tap + Add task above to create one.
            </div>
          ) : (
            <div className="space-y-2.5">
              {partnerTasks.map((task) => renderTaskCard(task))}
            </div>
          )}
        </div>
      )}

      {/* + Add Paid Task Modal (Step 1: Details + Coins -> Next | Step 2: Fee & Slots Preview -> OK) */}
      {showAddModal && (
        <div
          className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-task-modal-title"
        >
          <form
            onSubmit={(e) => void handleCreateTaskSubmit(e)}
            className="animate-clay-modal clay-card w-full max-w-md p-5 space-y-3.5 my-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 id="add-task-modal-title" className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                  {addModalStep === 'form' ? 'Post a Paid Task' : 'Task Preview'}
                </h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {addModalStep === 'form'
                    ? `Min ${minBudgetWithChannelOpt.toLocaleString()} coins${
                        newRequireChannelCheck ? ' (includes channel check)' : ''
                      }`
                    : 'Review deducted fee, unlocked slots & Sponsors listing'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddModal}
                aria-label="Close add task modal"
                className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="clay-inset !rounded-xl px-3 py-2 flex items-center justify-between text-xs">
              <span className="font-bold text-stone-600 dark:text-stone-400">Your Coin Balance</span>
              <span className="inline-flex items-center gap-1 font-mono-num font-extrabold text-amber-700 dark:text-amber-300">
                <CoinIcon className="w-4 h-4" />
                <span>{profile.coins.toLocaleString()}</span>
              </span>
            </div>

            {addModalStep === 'form' ? (
              <>
                <div className="space-y-1">
                  <label htmlFor="new-task-title" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    Task Title
                  </label>
                  <input
                    id="new-task-title"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Join Sponsors TON Channel"
                    className="clay-inset w-full min-h-[42px] px-3 text-sm font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="new-task-subtitle" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    Short Description (optional)
                  </label>
                  <input
                    id="new-task-subtitle"
                    type="text"
                    maxLength={120}
                    value={newSubtitle}
                    onChange={(e) => setNewSubtitle(e.target.value)}
                    placeholder="Complete check to unlock instant coin reward"
                    className="clay-inset w-full min-h-[40px] px-3 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="new-task-url" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    Action URL (optional)
                  </label>
                  <input
                    id="new-task-url"
                    type="url"
                    maxLength={256}
                    value={newActionUrl}
                    onChange={(e) => setNewActionUrl(e.target.value)}
                    placeholder="https://t.me/..."
                    className="clay-inset w-full min-h-[42px] px-3 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="new-task-budget" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                    Coins Budget (min {minBudgetWithChannelOpt.toLocaleString()})
                  </label>
                  <input
                    id="new-task-budget"
                    type="number"
                    min={minBudgetWithChannelOpt}
                    step={50}
                    required
                    value={newBudgetCoins}
                    onChange={(e) => setNewBudgetCoins(e.target.value)}
                    placeholder={String(minBudgetWithChannelOpt)}
                    className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label htmlFor="new-task-reward" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      Reward / User (min {USER_TASK_MIN_REWARD_COINS})
                    </label>
                    <input
                      id="new-task-reward"
                      type="number"
                      min={USER_TASK_MIN_REWARD_COINS}
                      max={USER_TASK_MAX_REWARD_COINS}
                      required
                      value={newRewardCoins}
                      onChange={(e) => setNewRewardCoins(e.target.value)}
                      className="clay-inset w-full min-h-[42px] px-3 text-sm font-mono-num font-bold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="new-task-icon" className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      Icon
                    </label>
                    <select
                      id="new-task-icon"
                      value={newIcon}
                      onChange={(e) => setNewIcon(e.target.value)}
                      className="clay-inset w-full min-h-[42px] px-2.5 text-xs font-bold text-stone-900 dark:text-stone-100"
                    >
                      <option value="send">Telegram</option>
                      <option value="megaphone">Channel</option>
                      <option value="gift">Exclusive Gift</option>
                      <option value="flame">Hot Quest</option>
                      <option value="link">Sponsor Link</option>
                      <option value="users">Social / Community</option>
                      <option value="shield">Verified</option>
                    </select>
                  </div>
                </div>

                {/* Optional Telegram Channel Membership Verification */}
                <label
                  htmlFor="new-task-channel-check"
                  className={`clay-inset !rounded-2xl p-3 flex items-start gap-3 cursor-pointer border transition-colors ${
                    newRequireChannelCheck
                      ? 'border-sky-400 bg-sky-50/70 dark:bg-sky-950/40'
                      : 'border-transparent'
                  }`}
                >
                  <input
                    id="new-task-channel-check"
                    type="checkbox"
                    checked={newRequireChannelCheck}
                    onChange={(e) => {
                      onTabTap?.();
                      const checked = e.target.checked;
                      setNewRequireChannelCheck(checked);
                      const minWithout = resolvedPricing.minBudgetCoins;
                      const minWith = minWithout + resolvedPricing.channelCheckFeeCoins;
                      const curBudget = Math.floor(Number(newBudgetCoins) || 0);
                      if (checked && curBudget < minWith) {
                        setNewBudgetCoins(String(minWith));
                      } else if (!checked && curBudget === minWith) {
                        setNewBudgetCoins(String(minWithout));
                      }
                    }}
                    className="mt-0.5 w-4.5 h-4.5 accent-sky-600 rounded cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>Enable Channel Check</span>
                      </span>
                      <span className="rounded-md bg-amber-100 dark:bg-amber-950/70 border border-amber-300/70 dark:border-amber-800/60 px-1.5 py-0.5 text-[10px] font-extrabold font-mono-num text-amber-800 dark:text-amber-300 shrink-0">
                        +{resolvedPricing.channelCheckFeeCoins.toLocaleString()} coins
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      Tick to verify users joined your Telegram channel (requires{' '}
                      {(resolvedPricing.minBudgetCoins + resolvedPricing.channelCheckFeeCoins).toLocaleString()}{' '}
                      coins min). Make {resolvedBotTag} an Admin in your channel!
                    </p>
                  </div>
                </label>

                {channelCheckUrlInvalid && (
                  <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-3 py-2 text-xs font-bold text-sky-800 dark:text-sky-300">
                    Enter a valid Telegram channel URL above (e.g. https://t.me/YourChannel) to enable Channel Check.
                  </div>
                )}

                {!budgetPreview.valid && budgetPreview.error && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                    {budgetPreview.error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="clay-btn clay-btn-neutral min-h-[44px] rounded-2xl text-xs font-extrabold text-stone-700 dark:text-stone-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canProceedToPreview}
                    className="clay-btn clay-btn-emerald min-h-[44px] rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Live Sponsors Tab Task Card Preview */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    <span>Sponsors Tab Preview</span>
                    <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
                      Sponsors
                    </span>
                  </div>
                  <div className="clay-inset !rounded-2xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl clay-icon-well flex items-center justify-center shrink-0">
                        {renderTaskIcon(newIcon)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                            {newTitle.trim()}
                          </span>
                          <span className="rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 shrink-0">
                            Yours
                          </span>
                          {budgetPreview.requireChannelCheck && (
                            <span className="rounded-md bg-sky-100/80 dark:bg-sky-950/60 border border-sky-300/70 dark:border-sky-800/60 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-800 dark:text-sky-300 shrink-0">
                              Verified
                            </span>
                          )}
                        </div>
                        {newSubtitle.trim() && (
                          <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                            {newSubtitle.trim()}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                            <CoinIcon className="w-3.5 h-3.5" />
                            <span className="font-mono-num">+{budgetPreview.rewardCoins.toLocaleString()}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 text-[11px] font-extrabold font-mono-num text-emerald-700 dark:text-emerald-300">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>
                              {budgetPreview.totalSlots.toLocaleString()}/{budgetPreview.totalSlots.toLocaleString()} spots left
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {budgetPreview.requireChannelCheck && (
                  <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-300/80 dark:border-sky-800/60 p-3 flex items-start gap-2.5 text-xs text-sky-900 dark:text-sky-200">
                    <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 leading-snug">
                      <div className="font-extrabold">
                        Make {resolvedBotTag} an Admin in {parsedChannelHandle || 'Your Channel'}
                      </div>
                      <p className="text-[11px] text-sky-800/90 dark:text-sky-300/90">
                        Before publishing, add <span className="font-extrabold">{resolvedBotTag}</span> as an
                        Administrator in <span className="font-extrabold">{parsedChannelHandle || 'your Telegram channel'}</span> so real-time join verification works for every claimer.
                      </p>
                    </div>
                  </div>
                )}

                {/* Slots & Deducted Fee Summary */}
                <div className="clay-card-warm !rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                    <span>Entered Coins Budget</span>
                    <span className="font-mono-num font-bold">
                      {budgetPreview.budgetCoins.toLocaleString()} coins
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                    <span>Task Posting Fee ({Math.round(resolvedPricing.platformFeeRate * 100)}%)</span>
                    <span className="font-mono-num font-bold text-rose-600 dark:text-rose-400">
                      -{budgetPreview.platformFeeCoins.toLocaleString()} coins
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                    <span>Channel Join Check</span>
                    <span
                      className={`font-mono-num font-bold ${
                        budgetPreview.requireChannelCheck
                          ? 'text-sky-700 dark:text-sky-300'
                          : 'text-stone-400 dark:text-stone-500'
                      }`}
                    >
                      {budgetPreview.requireChannelCheck
                        ? `-${budgetPreview.channelCheckFeeCoins.toLocaleString()} coins (On)`
                        : '0 coins (Off)'}
                    </span>
                  </div>
                  {budgetPreview.requireChannelCheck && (
                    <div className="flex items-center justify-between text-stone-700 dark:text-stone-200 font-bold">
                      <span>Total Check + Posting Fee</span>
                      <span className="font-mono-num font-extrabold text-rose-600 dark:text-rose-400">
                        -{(budgetPreview.platformFeeCoins + budgetPreview.channelCheckFeeCoins).toLocaleString()} coins
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-stone-700 dark:text-stone-200 font-bold">
                    <span>Slots Unlocked ({budgetPreview.rewardCoins.toLocaleString()}/user)</span>
                    <span className="font-mono-num font-extrabold text-emerald-700 dark:text-emerald-300">
                      {budgetPreview.totalSlots.toLocaleString()} slots ({budgetPreview.rewardPoolCoins.toLocaleString()} coins)
                    </span>
                  </div>
                  <div className="border-t border-amber-300/60 dark:border-amber-800/50 pt-2 flex items-center justify-between font-extrabold text-stone-900 dark:text-stone-100">
                    <span>Total Coins Deducted</span>
                    <span className="inline-flex items-center gap-1 font-mono-num text-amber-800 dark:text-amber-300">
                      <CoinIcon className="w-4 h-4" />
                      <span>-{budgetPreview.totalCostCoins.toLocaleString()} coins</span>
                    </span>
                  </div>
                  {budgetPreview.unspentCoins > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                      <span>Unused Budget Kept in Wallet</span>
                      <span className="font-mono-num font-bold">+{budgetPreview.unspentCoins.toLocaleString()} coins</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                    <span>Balance After Post</span>
                    <span className="font-mono-num font-bold">
                      {Math.max(0, profile.coins - budgetPreview.totalCostCoins).toLocaleString()} coins
                    </span>
                  </div>
                </div>

                {!canAffordTask && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 flex items-center justify-between gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                    <span>Need {coinsShort.toLocaleString()} more coins to post this task.</span>
                    {onOpenDeposit && (
                      <button
                        type="button"
                        onClick={() => {
                          closeAddModal();
                          onOpenDeposit();
                        }}
                        className="clay-btn clay-btn-amber px-2.5 py-1 rounded-lg text-[11px] font-extrabold shrink-0"
                      >
                        Deposit
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={creatingTask}
                    onClick={() => setAddModalStep('form')}
                    className="clay-btn clay-btn-neutral min-h-[44px] rounded-2xl text-xs font-extrabold text-stone-700 dark:text-stone-200 inline-flex items-center justify-center gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={creatingTask || !canAffordTask}
                    className="clay-btn clay-btn-emerald min-h-[44px] rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {creatingTask ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Publishing...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>OK</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Sponsor "My Campaigns" Analytics + Top-Up / Refund Drawer */}
      {showCampaignsDrawer && (
        <div
          className="animate-clay-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="my-campaigns-title"
        >
          <div className="animate-clay-modal clay-card w-full sm:max-w-md max-h-[88vh] rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl clay-icon-well-sky flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="my-campaigns-title" className="text-base font-extrabold text-stone-900 dark:text-stone-100 truncate">
                    My Sponsor Campaigns
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Min {USER_TASK_MIN_REWARD_COINS} coins per user click · Top-Up or Refund unused slots
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close campaigns drawer"
                onClick={() => {
                  setTopUpTargetId(null);
                  setShowCampaignsDrawer(false);
                }}
                className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div className="clay-inset !rounded-2xl p-2.5 text-center">
                <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">Campaigns</div>
                <div className="text-sm font-extrabold font-mono-num tabular-nums text-stone-900 dark:text-stone-100">
                  {myCampaigns.length}
                </div>
              </div>
              <div className="clay-inset !rounded-2xl p-2.5 text-center">
                <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">User Clicks</div>
                <div className="text-sm font-extrabold font-mono-num tabular-nums text-emerald-700 dark:text-emerald-300">
                  {campaignSummary.totalClicks.toLocaleString()}
                </div>
              </div>
              <div className="clay-inset !rounded-2xl p-2.5 text-center">
                <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">Coins Spent</div>
                <div className="text-sm font-extrabold font-mono-num tabular-nums text-amber-700 dark:text-amber-300">
                  {campaignSummary.totalInvested.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Campaign List */}
            <div className="overflow-y-auto space-y-3 pr-0.5 flex-1">
              {myCampaigns.length === 0 ? (
                <div className="clay-inset !rounded-2xl p-6 text-center space-y-3">
                  <p className="text-xs text-stone-600 dark:text-stone-300">
                    You have not launched any sponsor campaigns yet. Set your own per-click reward (min {USER_TASK_MIN_REWARD_COINS} coins/user) and track every completion live.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCampaignsDrawer(false);
                      setAddModalStep('form');
                      setShowAddModal(true);
                    }}
                    className="clay-btn clay-btn-amber min-h-[42px] px-4 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Launch Sponsor Task</span>
                  </button>
                </div>
              ) : (
                myCampaigns.map((camp) => {
                  const totalSlots = Math.max(0, Number(camp.totalSlots ?? 0));
                  const claimed = Math.max(0, Number(camp.claimedCount ?? 0));
                  const remaining = Math.max(0, totalSlots - claimed);
                  const pct = totalSlots > 0 ? Math.min(100, Math.round((claimed / totalSlots) * 100)) : 0;
                  const refundPreview = calculateTaskRefundAmount(camp);
                  const isTopUpOpen = topUpTargetId === camp.id;
                  const topUpCalc = isTopUpOpen
                    ? calculatePaidTaskTopUp(camp.rewardCoins, Number(topUpBudgetInput) || 0, totalSlots)
                    : null;
                  const isBusy = busyCampaignId === camp.id;

                  return (
                    <div key={camp.id} className="clay-inset !rounded-2xl p-3.5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                            {camp.title}
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono-num tabular-nums mt-0.5">
                            +{camp.rewardCoins.toLocaleString()} coins/click · {claimed}/{totalSlots} clicks
                            {' · '}
                            <span className={camp.isActive !== false && remaining > 0 ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-stone-500'}>
                              {camp.isActive === false ? 'Ended' : remaining === 0 ? 'Completed' : `${remaining} left`}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-extrabold font-mono-num tabular-nums text-amber-700 dark:text-amber-300 shrink-0">
                          {(camp.paidCoins ?? totalSlots * camp.rewardCoins).toLocaleString()} c
                        </span>
                      </div>

                      <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {isTopUpOpen && topUpCalc && (
                        <div className="clay-card-warm !rounded-xl p-3 space-y-2 text-xs">
                          <label htmlFor={`topup-budget-${camp.id}`} className="block font-bold text-stone-700 dark:text-stone-200">
                            Top-Up Budget (min {USER_TASK_MIN_TOPUP_COINS.toLocaleString()} coins)
                          </label>
                          <input
                            id={`topup-budget-${camp.id}`}
                            type="number"
                            min={USER_TASK_MIN_TOPUP_COINS}
                            step={50}
                            value={topUpBudgetInput}
                            onChange={(e) => setTopUpBudgetInput(e.target.value)}
                            className="clay-inset w-full min-h-[40px] px-3 text-sm font-mono-num font-bold text-stone-900 dark:text-stone-100"
                          />
                          {topUpCalc.valid ? (
                            <div className="flex items-center justify-between text-[11px] font-mono-num tabular-nums text-stone-700 dark:text-stone-200">
                              <span>
                                +{topUpCalc.additionalSlots.toLocaleString()} slots (Fee: {topUpCalc.platformFeeCoins}c)
                              </span>
                              <span className="font-extrabold text-amber-800 dark:text-amber-300">
                                Cost: {topUpCalc.totalCostCoins.toLocaleString()}c
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                              {topUpCalc.error}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setTopUpTargetId(null)}
                              className="clay-btn clay-btn-neutral min-h-[38px] rounded-xl text-xs font-bold"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!topUpCalc.valid || !onTopUpTask || isBusy || profile.coins < topUpCalc.totalCostCoins}
                              onClick={async () => {
                                if (!onTopUpTask || !topUpCalc.valid) return;
                                setBusyCampaignId(camp.id);
                                try {
                                  const ok = await onTopUpTask(camp.id, Number(topUpBudgetInput) || 0);
                                  if (ok) setTopUpTargetId(null);
                                } finally {
                                  setBusyCampaignId(null);
                                }
                              }}
                              className="clay-btn clay-btn-emerald min-h-[38px] rounded-xl text-xs font-extrabold disabled:opacity-50"
                            >
                              {isBusy ? 'Topping up...' : 'Confirm Top-Up'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isBusy || !onTopUpTask}
                          onClick={() => {
                            setTopUpTargetId(isTopUpOpen ? null : camp.id);
                            setTopUpBudgetInput(String(USER_TASK_MIN_TOPUP_COINS));
                          }}
                          className="clay-btn clay-btn-amber min-h-[40px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Top-Up Slots</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy || !onRefundTask || camp.isActive === false || refundPreview.refundCoins <= 0}
                          onClick={async () => {
                            if (!onRefundTask || refundPreview.refundCoins <= 0) return;
                            setBusyCampaignId(camp.id);
                            try {
                              await onRefundTask(camp.id);
                            } finally {
                              setBusyCampaignId(null);
                            }
                          }}
                          className="clay-btn clay-btn-neutral min-h-[40px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>
                            {refundPreview.refundCoins > 0
                              ? `Refund +${refundPreview.refundCoins.toLocaleString()}c`
                              : 'No Refund Left'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
