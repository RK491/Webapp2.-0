import { useEffect, useState } from 'react';
import { Globe, Plus, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { UserFarmProfile } from '../types/farm';
import { CoinIcon, EggIcon, PlayerAvatar } from './GameIcons';
import { PWAInstallButton } from './PWAControls';

interface TopBarProps {
  profile: UserFarmProfile;
  coinsLabel: string;
  eggsLabel: string;
  isAllMuted: boolean;
  muteAllLabel: string;
  unmuteAllLabel: string;
  isAdmin?: boolean;
  isLeaderboardActive?: boolean;
  ranksLabel?: string;
  onOpenProfile: () => void;
  onOpenAdmin?: () => void;
  onToggleLeaderboard?: () => void;
  onToggleMuteAll: () => void;
  onOpenSettings: () => void;
  onOpenDeposit: () => void;
}

export function TopBar({
  profile,
  coinsLabel,
  eggsLabel,
  isAllMuted,
  muteAllLabel,
  unmuteAllLabel,
  isAdmin = false,
  isLeaderboardActive = false,
  ranksLabel = 'Ranks',
  onOpenProfile,
  onOpenAdmin,
  onToggleLeaderboard,
  onToggleMuteAll,
  onOpenSettings,
  onOpenDeposit,
}: TopBarProps) {
  const prefersReducedMotion = useReducedMotion();
  const [coinArrivalPulse, setCoinArrivalPulse] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleArrival = () => {
      setCoinArrivalPulse((n) => n + 1);
    };
    window.addEventListener('alphagram:coin-arrival', handleArrival);
    return () => window.removeEventListener('alphagram:coin-arrival', handleArrival);
  }, []);

  return (
    <header className="sticky top-0 z-30 clay-header px-3 sm:px-5 py-2 transition-colors">
      <div className="max-w-6xl mx-auto flex flex-col gap-2">
        {/* Row 1: Alpha Gram Brand + Profile Trigger + Utility Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="hidden sm:flex items-center gap-2 pr-2.5 border-r border-stone-300/60 dark:border-stone-700/60 shrink-0">
              <motion.div
                whileHover={{ rotate: [0, -8, 6, 0], scale: 1.08 }}
                transition={{ duration: 0.35 }}
                className="alpha-brand-crest clay-cta-sheen w-9 h-9 rounded-xl text-sm font-extrabold flex items-center justify-center tracking-tight select-none cursor-default"
              >
                αG
              </motion.div>
              <span className="font-display text-base font-extrabold tracking-tight text-stone-900 dark:text-stone-100 whitespace-nowrap">
                Alpha Gram
              </span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onOpenProfile}
              aria-label={`Open profile for ${profile.displayName}`}
              className="clay-btn flex items-center gap-2 min-w-0 min-h-[44px] pr-2.5 pl-1 py-1 rounded-2xl hover:bg-white/60 dark:hover:bg-stone-800/60 transition-colors text-left"
            >
              <div className="relative shrink-0">
                <PlayerAvatar
                  photoUrl={profile.photoUrl}
                  displayName={profile.displayName}
                  avatarColor={profile.avatarColor}
                  className="w-9 h-9 text-sm border-2 border-white dark:border-stone-800"
                />
                <span className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full clay-btn-amber border-2 border-white dark:border-stone-900 text-[9px] font-extrabold flex items-center justify-center">
                  {profile.level}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate leading-tight">
                  {profile.displayName}
                </div>
                <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 truncate">
                  <span className="sm:hidden font-bold text-amber-700 dark:text-amber-400">Alpha Gram · </span>
                  {profile.handle}
                </div>
              </div>
            </motion.button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton compact />

            {isAdmin && onOpenAdmin && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={onOpenAdmin}
                aria-label="Open Admin Panel"
                className="clay-btn clay-btn-emerald h-10 px-2.5 sm:px-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-extrabold whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Admin Panel</span>
              </motion.button>
            )}

            {onToggleLeaderboard && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={onToggleLeaderboard}
                aria-pressed={isLeaderboardActive}
                aria-label={isLeaderboardActive ? 'Back to Farm' : 'Open Leaderboard'}
                title={ranksLabel}
                className={`clay-btn h-10 px-2.5 sm:px-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-extrabold whitespace-nowrap ${
                  isLeaderboardActive
                    ? 'clay-btn-amber text-amber-950'
                    : 'clay-btn-neutral text-amber-600 dark:text-amber-400'
                }`}
              >
                <Trophy className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{ranksLabel}</span>
              </motion.button>
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onToggleMuteAll}
              aria-pressed={isAllMuted}
              aria-label={
                isAllMuted
                  ? 'Unmute all music and sound effects'
                  : 'Mute all music and sound effects'
              }
              className={`clay-btn h-10 px-2.5 sm:px-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-extrabold whitespace-nowrap ${
                isAllMuted
                  ? 'bg-gradient-to-b from-rose-100 to-rose-200 dark:from-rose-950/90 dark:to-rose-900/80 border border-rose-300 dark:border-rose-700/70 text-rose-800 dark:text-rose-200 shadow-[0_6px_14px_-5px_rgba(225,29,72,0.28),0_2px_0_0_rgba(225,29,72,0.35),inset_0_2px_4px_rgba(255,255,255,0.6)]'
                  : 'clay-btn-neutral text-stone-700 dark:text-stone-200'
              }`}
            >
              {isAllMuted ? (
                <VolumeX className="w-4 h-4 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="hidden xs:inline sm:inline">{isAllMuted ? unmuteAllLabel : muteAllLabel}</span>
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={onOpenSettings}
              aria-label="Open language and sound settings"
              className="clay-btn clay-btn-neutral w-10 h-10 rounded-2xl flex items-center justify-center text-stone-700 dark:text-stone-200"
            >
              <Globe className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Row 2: Coins & Eggs Clay Resource Wells */}
        <div className="grid grid-cols-2 gap-2.5">
          <motion.div
            key={`coin-card-${coinArrivalPulse}`}
            animate={
              coinArrivalPulse > 0 && !prefersReducedMotion
                ? { scale: [1, 1.05, 0.985, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="clay-card !rounded-2xl flex items-center justify-between gap-2 px-3 py-1.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <motion.div
                key={`coin-icon-${profile.coins}-${coinArrivalPulse}`}
                data-coin-balance-target="true"
                initial={prefersReducedMotion ? false : { scale: 1.24, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 440, damping: 18 }}
                className="w-8 h-8 rounded-xl clay-icon-well flex items-center justify-center shrink-0"
              >
                <CoinIcon className="w-5 h-5" />
              </motion.div>
              <div className="min-w-0">
                <motion.div
                  key={profile.coins}
                  initial={prefersReducedMotion ? false : { scale: 1.09 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className={`text-sm sm:text-base font-extrabold font-mono-num leading-none truncate origin-left ${
                    profile.coins < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-stone-900 dark:text-stone-100'
                  }`}
                >
                  {profile.coins.toLocaleString()}
                </motion.div>
                <div className="text-[10px] font-bold tracking-wide text-stone-500 dark:text-stone-400 mt-0.5">
                  {profile.coins < 0 ? `${coinsLabel} (Debt)` : coinsLabel}
                </div>
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={onOpenDeposit}
              aria-label="Top up coins"
              className="clay-btn clay-btn-emerald clay-cta-sheen w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.75]" />
            </motion.button>
          </motion.div>

          <div className="clay-card !rounded-2xl flex items-center gap-2 px-3 py-1.5">
            <motion.div
              key={`egg-icon-${profile.eggs}`}
              initial={{ scale: 1.18, rotate: 10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              className="w-8 h-8 rounded-xl clay-icon-well flex items-center justify-center shrink-0"
            >
              <EggIcon className="w-5 h-5" />
            </motion.div>
            <div className="min-w-0">
              <motion.div
                key={profile.eggs}
                initial={{ scale: 1.09 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-stone-100 font-mono-num leading-none truncate origin-left"
              >
                {profile.eggs.toLocaleString()}
              </motion.div>
              <div className="text-[10px] font-bold tracking-wide text-stone-500 dark:text-stone-400 mt-0.5">
                {eggsLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
