import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Award,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Globe,
  HelpCircle,
  Moon,
  Music,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import {
  AUTO_HARVEST_DRONE_TIERS,
  BASKET_TIERS,
  calculateLevelYieldMultiplier,
  calculateProductionRate,
  calculateTotalChickens,
  CHICKEN_PACKS,
  FEED_BOOSTER_COST_COINS,
  getAchievementsProgress,
  getXpForLevel,
  isAdminPlayerId,
  isAutoHarvestDroneActive,
  isFeedBoosterActive,
  PRIMARY_ADMIN_TELEGRAM_ID,
} from '../game/economy';
import { getPrimaryDepositMemo } from '../game/tonGram';
import type {
  AutoHarvestCurrency,
  AutoHarvestDurationId,
  LanguageCode,
  UserFarmProfile,
} from '../types/farm';
import { LANGUAGE_OPTIONS, t } from '../utils/i18n';
import type { ThemeMode } from '../utils/theme';
import { ChickenSprite, CoinIcon, EggIcon, PlayerAvatar } from './GameIcons';
import { PWAInstallButton } from './PWAControls';

interface ProfileViewProps {
  profile: UserFarmProfile;
  isTelegramDetected?: boolean;
  extraAdminIds?: readonly string[];
  onBack: () => void;
  onBuyChickens: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onClaimAchievement?: (achievementId: string) => void;
}

export function ProfileView({
  profile,
  isTelegramDetected = false,
  extraAdminIds = [],
  onBack,
  onBuyChickens,
  onOpenSettings,
  onOpenAdmin,
  onClaimAchievement,
}: ProfileViewProps) {
  const [copiedId, setCopiedId] = useState(false);
  const displayUserId = getPrimaryDepositMemo(profile.uid);
  const totalChickens = calculateTotalChickens(profile);
  const productionRate = calculateProductionRate(profile);
  const xpNeeded = getXpForLevel(profile.level);
  const xpPct = Math.min(100, Math.round((profile.xp / xpNeeded) * 100));
  const daysOnFarm = Math.max(1, Math.floor((Date.now() - profile.createdAtMs) / (1000 * 60 * 60 * 24)));
  const memberSince = new Date(profile.createdAtMs).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const handleCopyUserId = async () => {
    try {
      await navigator.clipboard.writeText(displayUserId);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const levelBonusPct = Math.round((calculateLevelYieldMultiplier(profile.level) - 1) * 100);
  const achievements = getAchievementsProgress(profile);
  const stats = [
    { label: 'Chickens', value: totalChickens.toLocaleString() },
    { label: 'Production', value: `${productionRate} eggs/h` },
    { label: 'Eggs collected', value: profile.totalEggsCollected.toLocaleString() },
    { label: 'Cash earned', value: `$${profile.totalCashEarnedUsd.toFixed(4)}` },
    { label: 'Withdrawn', value: `$${profile.totalWithdrawnUsd.toFixed(4)}` },
    { label: 'Referrals', value: profile.referralCount.toLocaleString() },
    { label: 'Golden Eggs', value: (profile.goldenEggsFound ?? 0).toLocaleString() },
    { label: 'Bought this week', value: `${profile.boughtThisWeek.toLocaleString()} (${daysOnFarm}d)` },
  ];

  const strings = t(profile.language);

  return (
    <div className="animate-clay-enter space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back from profile"
          className="clay-btn clay-btn-neutral w-10 h-10 rounded-full flex items-center justify-center text-stone-700 dark:text-stone-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-100">{strings.profile}</h1>
      </div>

      {/* Auto-Detected User Card */}
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <PlayerAvatar
              photoUrl={profile.photoUrl}
              displayName={profile.displayName}
              avatarColor={profile.avatarColor}
              className="w-20 h-20 text-3xl border-4 border-amber-300"
            />
            <span className="clay-btn-amber absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full border-2 border-white dark:border-stone-900 text-xs font-extrabold">
              {profile.level}
            </span>
          </div>

          <h2 className="mt-3 text-xl font-extrabold text-stone-900 dark:text-stone-100">{profile.displayName}</h2>
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{profile.handle}</p>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyUserId()}
              aria-label="Copy user ID"
              className="clay-btn clay-btn-neutral inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold text-stone-800 dark:text-stone-200"
            >
              <span className="text-stone-500 dark:text-stone-400">User ID:</span>
              <span className="font-mono-num text-stone-900 dark:text-stone-100">{displayUserId}</span>
              {copiedId ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              )}
            </button>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold border ${
                isTelegramDetected
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                  : 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{isTelegramDetected ? 'Auto-detected · 1 User · 1 ID' : '1 User · 1 ID'}</span>
            </span>
          </div>

          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">Member since {memberSince}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-bold text-stone-600 dark:text-stone-400">
            <div className="flex items-center gap-1.5">
              <span>Level {profile.level}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300">
                {levelBonusPct > 0 ? `+${levelBonusPct}% Yield Perk` : '+2%/lvl Perk'}
              </span>
            </div>
            <span className="font-mono-num">
              {profile.xp} / {xpNeeded} XP
            </span>
          </div>
          <div className="h-3 rounded-full clay-inset p-0.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all clay-shimmer-bar"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Free Withdrawals Promo Card */}
      <div className="clay-card-warm p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Free withdrawals</span>
            </span>
            <h3 className="text-base font-extrabold text-stone-900 dark:text-stone-100">
              Buy more chickens, earn more money
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-300">
              Every chicken lays eggs 24/7. Withdraw in GRAM any time — no fees.
            </p>
          </div>
          <div className="w-16 h-16 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
            <ChickenSprite breed="rhode" className="w-13 h-13 animate-chicken-bob" />
          </div>
        </div>

        <button
          type="button"
          onClick={onBuyChickens}
          className="clay-btn clay-btn-amber w-full min-h-[48px] rounded-2xl font-extrabold text-sm"
        >
          Buy chickens
        </button>
      </div>

      {/* Your Stats */}
      <div className="space-y-2">
        <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300 px-1">Your stats</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map((item) => (
            <div
              key={item.label}
              className="clay-card clay-hover-lift !rounded-2xl p-3.5"
            >
              <div className="text-base font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                {item.value}
              </div>
              <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Permanent Achievements Wall */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-extrabold text-stone-700 dark:text-stone-300 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            <span>Achievements</span>
          </h3>
          <span className="text-xs font-extrabold font-mono-num text-stone-500 dark:text-stone-400">
            {achievements.filter((a) => a.claimed).length}/{achievements.length} claimed
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {achievements.map((ach) => {
            const pct = Math.min(100, Math.round((ach.current / Math.max(1, ach.target)) * 100));
            return (
              <div
                key={ach.id}
                className={`${ach.claimed ? 'clay-card-mint' : 'clay-card'} !rounded-2xl p-3.5 space-y-2`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                      {ach.title}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      {ach.description}
                    </div>
                  </div>
                  {ach.claimed ? (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 shrink-0">
                      <Check className="w-3 h-3" />
                      <span>Claimed</span>
                    </span>
                  ) : ach.unlocked && onClaimAchievement ? (
                    <button
                      type="button"
                      onClick={() => onClaimAchievement(ach.id)}
                      className="clay-btn clay-btn-amber px-2.5 py-1 rounded-xl text-[11px] font-extrabold shrink-0"
                    >
                      Claim +{ach.rewardCoins}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold font-mono-num text-amber-700 dark:text-amber-400 shrink-0">
                      <CoinIcon className="w-3 h-3" />
                      <span>+{ach.rewardCoins}</span>
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono-num font-bold text-stone-500 dark:text-stone-400">
                    <span>
                      {Math.min(ach.current, ach.target).toLocaleString()} / {ach.target.toLocaleString()}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full clay-inset overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Settings & Support */}
      <div className="clay-card divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-white/60 dark:hover:bg-stone-800/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl clay-icon-well flex items-center justify-center">
              <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <span className="text-sm font-bold text-stone-900 dark:text-stone-100">{strings.languageAndAudio}</span>
          </div>
          <span className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase">{profile.language}</span>
        </button>

        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl clay-icon-well flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm font-bold text-stone-900 dark:text-stone-100">Help &amp; Support</span>
          </div>
          <span className="text-xs text-stone-400 dark:text-stone-500">24/7 Farm Guide</span>
        </div>

        {isAdminPlayerId(profile.uid, extraAdminIds) && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-white/60 dark:hover:bg-stone-800/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl clay-icon-well flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <span className="block text-sm font-bold text-stone-900 dark:text-stone-100">Admin Panel</span>
                <span className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                  Admin ID detected · Enter passcode to open
                </span>
              </div>
            </div>
            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 font-mono-num">
              ID {isAdminPlayerId(profile.uid) ? PRIMARY_ADMIN_TELEGRAM_ID : displayUserId}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

interface YourFarmViewProps {
  profile: UserFarmProfile;
  pendingEggs: number;
  telegramRemindersEnabled?: boolean;
  onBack: () => void;
  onUpgradeBasket: () => void;
  onGoPacks: () => void;
  onOpenWithdraw?: () => void;
  onToggleTelegramReminders?: () => void;
  onActivateBooster?: () => void;
  onPurchaseAutoHarvestDrone?: (
    durationId: AutoHarvestDurationId,
    currency: AutoHarvestCurrency,
  ) => void;
}

export function YourFarmView({
  profile,
  pendingEggs,
  telegramRemindersEnabled = true,
  onBack,
  onUpgradeBasket,
  onGoPacks,
  onToggleTelegramReminders,
  onActivateBooster,
  onPurchaseAutoHarvestDrone,
}: YourFarmViewProps) {
  const prefersReducedMotion = useReducedMotion();
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const prevCapacityRef = useRef(profile.basketCapacity);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const [droneCurrency, setDroneCurrency] = useState<AutoHarvestCurrency>('coins');

  useEffect(() => {
    const id = window.setInterval(() => setLiveNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (profile.basketCapacity > prevCapacityRef.current) {
      setJustUpgraded(true);
      prevCapacityRef.current = profile.basketCapacity;
      const timer = window.setTimeout(() => setJustUpgraded(false), 1100);
      return () => window.clearTimeout(timer);
    }
    prevCapacityRef.current = profile.basketCapacity;
  }, [profile.basketCapacity]);

  const boostActive = isFeedBoosterActive(profile, liveNowMs);
  const boostLeftMs = Math.max(0, Number(profile.feedBoostUntilMs ?? 0) - liveNowMs);
  const boostMin = Math.floor(boostLeftMs / 60000);
  const boostSec = Math.floor((boostLeftMs % 60000) / 1000);
  const levelBonusPct = Math.round((calculateLevelYieldMultiplier(profile.level) - 1) * 100);
  const productionRate = calculateProductionRate(profile, liveNowMs);
  const totalChickens = calculateTotalChickens(profile);
  const currentTierIdx = BASKET_TIERS.findIndex((t) => t.hours === profile.basketTierHours);
  const nextTier = BASKET_TIERS[currentTierIdx + 1];
  const basketFillPct = Math.min(100, Math.round((pendingEggs / Math.max(1, profile.basketCapacity)) * 100));

  const ownedCounts: Record<string, number> = {
    leghorn: profile.leghornCount,
    rhode: profile.rhodeCount,
    orpington: profile.orpingtonCount,
    australorp: profile.australorpCount,
  };

  return (
    <div className="animate-clay-enter space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to farm"
          className="clay-btn clay-btn-neutral w-10 h-10 rounded-full flex items-center justify-center text-stone-700 dark:text-stone-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-100">Your Farm</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">Your hens lay eggs on their own</p>
        </div>
      </div>

      {/* Production Rate Summary */}
      <div className="clay-card-warm p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl clay-icon-well flex items-center justify-center">
            <EggIcon className="w-7 h-7" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-500 dark:text-stone-400">Production Rate</div>
            <div className="text-2xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
              {productionRate} eggs/h
            </div>
            {(levelBonusPct > 0 || boostActive) && (
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[10px] font-extrabold">
                {levelBonusPct > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                    +{levelBonusPct}% Lv.{profile.level}
                  </span>
                )}
                {boostActive && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-300">
                    ⚡ 2× Feed Active
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 font-mono-num">
            {totalChickens} hens
          </div>
          <button
            type="button"
            onClick={onGoPacks}
            className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
          >
            + Add more
          </button>
        </div>
      </div>

      {/* Coop Boosters Card */}
      {onActivateBooster && (
        <div className="clay-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Zap className="w-5 h-5 fill-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <span>2× Laying Feed</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  Doubles all hen egg production for 1 full hour
                </div>
              </div>
            </div>
            {boostActive ? (
              <span className="clay-card-mint !rounded-xl px-3 py-1.5 text-xs font-extrabold font-mono-num text-emerald-800 dark:text-emerald-300 shrink-0">
                {String(boostMin).padStart(2, '0')}:{String(boostSec).padStart(2, '0')}
              </span>
            ) : (
              <button
                type="button"
                onClick={onActivateBooster}
                disabled={totalChickens <= 0 || profile.coins < FEED_BOOSTER_COST_COINS}
                className="clay-btn clay-btn-amber disabled:opacity-55 px-3.5 min-h-[40px] rounded-xl text-xs font-extrabold flex items-center gap-1 shrink-0"
              >
                <CoinIcon className="w-3.5 h-3.5" />
                <span>{FEED_BOOSTER_COST_COINS}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Auto-Harvest Drone / Farm Manager Pass */}
      {onPurchaseAutoHarvestDrone && (() => {
        const droneActive = isAutoHarvestDroneActive(profile, liveNowMs);
        const droneLeftMs = Math.max(0, Number(profile.autoHarvestUntilMs ?? 0) - liveNowMs);
        const hrsLeft = Math.floor(droneLeftMs / 3_600_000);
        const minLeft = Math.floor((droneLeftMs % 3_600_000) / 60_000);
        return (
          <div className="clay-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl clay-icon-well-sky flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                    Auto-Harvest Drone Pass
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    {droneActive
                      ? `Active · ${hrsLeft}h ${minLeft}m left · Collects eggs automatically`
                      : 'Automatically collects full baskets using Coins or Eggs'}
                  </div>
                </div>
              </div>
            </div>

            <div className="clay-inset !rounded-xl grid grid-cols-2 gap-1 p-1">
              {(
                [
                  { id: 'coins', label: 'Pay with Coins' },
                  { id: 'eggs', label: 'Pay with Eggs' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDroneCurrency(opt.id)}
                  className={`clay-btn min-h-[38px] rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 ${
                    droneCurrency === opt.id
                      ? 'clay-btn-amber'
                      : 'text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {opt.id === 'coins' ? <CoinIcon className="w-3.5 h-3.5" /> : <EggIcon className="w-3.5 h-3.5" />}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AUTO_HARVEST_DRONE_TIERS.map((tier) => {
                const cost = droneCurrency === 'eggs' ? tier.eggCost : tier.coinCost;
                const available = droneCurrency === 'eggs' ? profile.eggs : profile.coins;
                const canAfford = available >= cost;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    disabled={!canAfford}
                    onClick={() => onPurchaseAutoHarvestDrone(tier.id, droneCurrency)}
                    className={`clay-btn rounded-2xl p-2.5 text-left flex flex-col justify-between gap-1 border disabled:opacity-55 ${
                      canAfford
                        ? 'clay-btn-neutral hover:border-sky-400/60 border-transparent'
                        : 'clay-btn-neutral border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                        {tier.label}
                      </span>
                      {tier.badge && (
                        <span className="text-[10px] font-extrabold text-sky-700 dark:text-sky-300">
                          {tier.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-mono-num tabular-nums font-extrabold text-amber-700 dark:text-amber-300">
                      {droneCurrency === 'coins' ? (
                        <CoinIcon className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <EggIcon className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{cost.toLocaleString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Your Chickens Breakdown */}
      <div className="space-y-2">
        <h2 className="text-sm font-extrabold text-stone-700 dark:text-stone-300 px-1">Your Chickens</h2>
        <div className="clay-card divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
          {totalChickens <= 0 ? (
            <div className="p-5 text-center space-y-2.5">
              <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">
                No chickens on your farm yet. Buy your first chicken to start egg mining.
              </p>
              <button
                type="button"
                onClick={onGoPacks}
                className="clay-btn clay-btn-emerald px-4 min-h-[40px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center"
              >
                Buy First Chicken
              </button>
            </div>
          ) : (
            CHICKEN_PACKS.filter((p) => (ownedCounts[p.id] ?? 0) > 0).map((pack) => {
            const qty = ownedCounts[pack.id] ?? 0;
            const subtotal = qty * pack.eggsPerHour;
            return (
              <div key={pack.id} className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl clay-icon-well flex items-center justify-center">
                    <ChickenSprite breed={pack.id} className="w-10 h-10 animate-chicken-bob" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">{pack.name}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num">
                      {qty} {qty === 1 ? 'chicken' : 'chickens'} · {pack.eggsPerHour} eggs/h each
                    </div>
                  </div>
                </div>

                <div className="clay-card-mint !rounded-xl flex items-center gap-1 px-2.5 py-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-300 font-mono-num">
                  <EggIcon className="w-3.5 h-3.5" />
                  <span>{subtotal} eggs/h</span>
                </div>
              </div>
            );
          })
          )}
        </div>
      </div>

      {/* Egg Basket Capacity & Upgrade */}
      <div className="space-y-2">
        <h2 className="text-sm font-extrabold text-stone-700 dark:text-stone-300 px-1">Egg basket</h2>
        <div
          className={`clay-card p-4 space-y-3 transition-shadow duration-500 ${
            justUpgraded ? 'ring-2 ring-emerald-400/70 dark:ring-emerald-400/50' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <motion.div
                key={profile.basketTierHours}
                initial={prefersReducedMotion ? false : { scale: 0.9, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="text-xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num"
              >
                {profile.basketTierHours} h
              </motion.div>
              <AnimatePresence>
                {justUpgraded && (
                  <motion.span
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 2 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25 }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Upgraded</span>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <motion.div
              key={profile.basketCapacity}
              initial={prefersReducedMotion ? false : { y: -4, opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="text-sm font-bold text-stone-600 dark:text-stone-300 font-mono-num"
            >
              {pendingEggs} / {profile.basketCapacity} Eggs
            </motion.div>
          </div>

          <p className="text-xs text-stone-500 dark:text-stone-400">
            Holds {profile.basketTierHours} h of eggs, then hens rest until you collect.
          </p>

          <div className="relative h-3.5 rounded-full clay-inset p-0.5 overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r transition-colors duration-500 clay-shimmer-bar ${
                justUpgraded ? 'from-emerald-400 to-emerald-500' : 'from-amber-400 to-amber-500'
              }`}
              initial={false}
              animate={{ width: `${basketFillPct}%` }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.65, ease: [0.16, 1, 0.3, 1] }
              }
            />
            <AnimatePresence>
              {justUpgraded && !prefersReducedMotion && (
                <motion.div
                  key={`sweep-${profile.basketCapacity}`}
                  initial={{ x: '-100%', opacity: 0.9 }}
                  animate={{ x: '100%', opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
                />
              )}
            </AnimatePresence>
          </div>

          {nextTier ? (
            <motion.button
              type="button"
              onClick={onUpgradeBasket}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              className="clay-btn clay-btn-emerald w-full min-h-[48px] rounded-2xl font-extrabold text-sm flex items-center justify-between px-4"
            >
              <span>
                Upgrade {profile.basketTierHours} h → {nextTier.hours} h ({nextTier.capacity} eggs)
              </span>
              <span className="flex items-center gap-1 font-mono-num">
                <CoinIcon className="w-4 h-4" />
                <span>{nextTier.upgradeCost.toLocaleString()}</span>
              </span>
            </motion.button>
          ) : (
            <div className="clay-card-mint !rounded-2xl p-3 text-center text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
              Maximum Basket Capacity Unlocked (24 h · 1,200 Eggs)
            </div>
          )}

          {onToggleTelegramReminders && (
            <div className="clay-inset px-3.5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl clay-icon-well-sky text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                    Telegram Bot Push Reminders
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                    Alerts for basket full, 2× feed, 3× fever &amp; drone expiry
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={telegramRemindersEnabled}
                aria-label="Toggle Telegram bot push reminders"
                onClick={onToggleTelegramReminders}
                className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  telegramRemindersEnabled ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    telegramRemindersEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SettingsModalProps {
  currentLanguage: LanguageCode;
  musicEnabled: boolean;
  soundsEnabled: boolean;
  telegramRemindersEnabled?: boolean;
  themeMode: ThemeMode;
  onChangeLanguage: (lang: LanguageCode) => void;
  onToggleMusic: () => void;
  onToggleSounds: () => void;
  onToggleTelegramReminders?: () => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function SettingsModal({
  currentLanguage,
  musicEnabled,
  soundsEnabled,
  telegramRemindersEnabled = true,
  themeMode,
  onChangeLanguage,
  onToggleMusic,
  onToggleSounds,
  onToggleTelegramReminders,
  onToggleTheme,
  onClose,
}: SettingsModalProps) {
  const strings = t(currentLanguage);
  const isDarkMode = themeMode === 'dark';

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="animate-clay-modal clay-card w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="settings-modal-title" className="text-lg font-extrabold text-stone-900 dark:text-stone-100">
            {strings.languageAndAudio}
          </h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="settings-language-select"
            className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-stone-400 px-1"
          >
            <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>{strings.languageLabel}</span>
          </label>
          <div className="relative">
            <select
              id="settings-language-select"
              aria-label="Select language"
              value={currentLanguage}
              onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
              className="clay-inset w-full min-h-[46px] appearance-none pl-4 pr-10 text-sm font-extrabold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-stone-500 dark:text-stone-400 pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <div className="clay-inset divide-y divide-stone-200/80 dark:divide-stone-700/80">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-sm font-bold text-stone-800 dark:text-stone-100">
              {isDarkMode ? (
                <Moon className="w-4 h-4 text-amber-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span>{strings.darkMode}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isDarkMode}
              aria-label="Toggle dark theme"
              onClick={onToggleTheme}
              className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${
                isDarkMode ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isDarkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-sm font-bold text-stone-800 dark:text-stone-100">
              <Music className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>{strings.music}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={musicEnabled}
              aria-label="Toggle farm music"
              onClick={onToggleMusic}
              className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${
                musicEnabled ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  musicEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-sm font-bold text-stone-800 dark:text-stone-100">
              <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{strings.sounds}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundsEnabled}
              aria-label="Toggle farm sound effects"
              onClick={onToggleSounds}
              className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${
                soundsEnabled ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  soundsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {onToggleTelegramReminders && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 text-sm font-bold text-stone-800 dark:text-stone-100">
                  <Send className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Telegram Push Reminders</span>
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 pl-6">
                  Basket full &amp; boost expiry bot DMs
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={telegramRemindersEnabled}
                aria-label="Toggle Telegram bot reminders"
                onClick={onToggleTelegramReminders}
                className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 cursor-pointer ${
                  telegramRemindersEnabled ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-700'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    telegramRemindersEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        <PWAInstallButton />
      </div>
    </div>
  );
}
