import { useEffect, useMemo, useState } from 'react';
import { Clock, Crown, Flame, Medal, Sparkles, Trophy, Users } from 'lucide-react';
import type { LeaderboardEntry, SeasonConfig, UserFarmProfile } from '../types/farm';
import {
  buildLeaderboardRankings,
  eggsToUsd,
  formatSeasonCountdown,
  SEASON_TOP10_PRIZE_WEIGHTS,
} from '../game/economy';
import { CoinIcon, EggIcon } from './GameIcons';

interface LeaderboardViewProps {
  profile: UserFarmProfile;
  entries: LeaderboardEntry[];
  seasonConfig: SeasonConfig;
  onTabTap?: () => void;
  onNavigateFriends: () => void;
  onNavigatePacks: () => void;
}

type LeaderboardSubTab = 'referrals' | 'mining' | 'buyers';

export function LeaderboardView({
  profile,
  entries,
  seasonConfig,
  onTabTap,
  onNavigateFriends,
  onNavigatePacks,
}: LeaderboardViewProps) {
  const [subTab, setSubTab] = useState<LeaderboardSubTab>('referrals');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rankings = useMemo(
    () => buildLeaderboardRankings(entries, profile),
    [entries, profile],
  );

  const activeList = useMemo(() => {
    if (subTab === 'referrals') return rankings.topInviters;
    if (subTab === 'mining') return rankings.topEggs;
    return rankings.topBuyers;
  }, [rankings, subTab]);

  const countdownLabel = useMemo(
    () => formatSeasonCountdown(seasonConfig.endsAtMs, nowMs),
    [seasonConfig.endsAtMs, nowMs],
  );

  const activeMetricSummary = useMemo(() => {
    if (subTab === 'referrals') {
      return {
        label: 'Your Referrals',
        value: `${profile.referralCount.toLocaleString()} friends`,
        sub: `+${profile.referralCoinsEarned.toLocaleString()} coins earned`,
      };
    }
    if (subTab === 'mining') {
      return {
        label: 'Your Eggs Mined',
        value: `${Math.floor(profile.eggs).toLocaleString()} eggs`,
        sub: `${profile.totalEggsCollected.toLocaleString()} lifetime · ~$${eggsToUsd(profile.eggs).toFixed(2)}`,
      };
    }
    return {
      label: 'Flock Rank',
      value: `#${rankings.userBuyerRank}`,
      sub: `Top ${rankings.userPercentile}% · ${rankings.pointsToTop10 === 0 ? 'In Top 10' : `${rankings.pointsToTop10.toLocaleString()} pts to Top 10`}`,
    };
  }, [profile, rankings, subTab]);

  return (
    <div className="space-y-4">
      {/* Season Cup Header */}
      <section className="clay-card-warm p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl clay-icon-well-amber flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-extrabold text-stone-900 dark:text-stone-100 truncate">
                {seasonConfig.title || `Season ${seasonConfig.seasonNumber} Cup`}
              </h1>
              <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1 font-mono-num tabular-nums font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  {countdownLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-mono-num tabular-nums font-extrabold text-amber-800 dark:text-amber-300">
                  <CoinIcon className="w-3.5 h-3.5" />
                  {seasonConfig.prizePoolCoins.toLocaleString()} Pool
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateFriends}
            className="clay-btn clay-btn-amber min-h-[40px] px-3 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0"
          >
            Invite Friends
          </button>
        </div>

        {/* User Personal Rank Summary */}
        <div className="clay-inset !rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
              {activeMetricSummary.label}
            </div>
            <div className="text-base font-extrabold text-stone-900 dark:text-stone-100 font-mono-num tabular-nums">
              {activeMetricSummary.value}
            </div>
            <div className="text-[11px] text-stone-600 dark:text-stone-300 font-mono-num tabular-nums truncate">
              {activeMetricSummary.sub}
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigatePacks}
            className="clay-btn clay-btn-emerald min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0"
          >
            Boost Flock
          </button>
        </div>
      </section>

      {/* Segmented Category Switch */}
      <div
        role="tablist"
        aria-label="Leaderboard categories"
        className="clay-inset !rounded-2xl grid grid-cols-3 gap-1 p-1.5"
      >
        {(
          [
            { id: 'referrals', label: 'Referrals', icon: Users },
            { id: 'mining', label: 'Mining', icon: Flame },
            { id: 'buyers', label: 'Flock Score', icon: Crown },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                onTabTap?.();
                setSubTab(item.id);
              }}
              className={`clay-btn min-h-[42px] px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-all ${
                active
                  ? 'clay-btn-amber'
                  : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Live Top 10 Standings */}
      <section className="clay-card overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200/70 dark:border-stone-800 flex items-center justify-between gap-2">
          <div className="text-xs font-extrabold uppercase tracking-wider text-stone-600 dark:text-stone-300">
            {subTab === 'referrals'
              ? 'Top 10 Live Referrers'
              : subTab === 'mining'
                ? 'Top 10 Live Egg Miners'
                : 'Top 10 Flock Builders'}
          </div>
          <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 font-mono-num tabular-nums">
            {Math.max(entries.length, 1).toLocaleString()} players
          </span>
        </div>

        {activeList.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400">
            Rankings update live as players mine eggs and invite friends.
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800/80">
            {activeList.map((entry, idx) => {
              const rank = idx + 1;
              const isSelf = entry.isCurrentUser || entry.uid === profile.uid;
              const prizeShare = Math.round(
                seasonConfig.prizePoolCoins * (SEASON_TOP10_PRIZE_WEIGHTS[idx] ?? 0),
              );

              return (
                <div
                  key={entry.uid}
                  className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                    isSelf
                      ? 'bg-amber-50/75 dark:bg-amber-950/35'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Rank Indicator */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-mono-num tabular-nums font-extrabold shrink-0 ${
                        rank === 1
                          ? 'clay-btn-amber'
                          : rank === 2
                            ? 'bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100'
                            : rank === 3
                              ? 'bg-orange-200 dark:bg-orange-900/60 text-orange-900 dark:text-orange-200'
                              : 'clay-inset text-stone-600 dark:text-stone-300'
                      }`}
                    >
                      {rank <= 3 ? <Medal className="w-4 h-4" /> : `#${rank}`}
                    </div>

                    {/* Avatar */}
                    {entry.photoUrl ? (
                      <img
                        src={entry.photoUrl}
                        alt={entry.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-2xl object-cover border border-stone-200 dark:border-stone-700 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-extrabold text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: entry.avatarColor || '#EF4444' }}
                      >
                        {(entry.displayName || 'F').charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Name & Clean Unboxed Metadata */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                          {entry.displayName}
                        </span>
                        {isSelf && (
                          <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-300 shrink-0">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono-num tabular-nums truncate">
                        <span>{entry.handle}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{entry.chickensCount.toLocaleString()} hens</span>
                        {subTab === 'buyers' && prizeShare > 0 && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                              +{prizeShare.toLocaleString()} prize
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Metric */}
                  <div className="text-right shrink-0">
                    {subTab === 'referrals' && (
                      <>
                        <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 font-mono-num tabular-nums">
                          {entry.inviterCount.toLocaleString()}
                        </div>
                        <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                          referrals
                        </div>
                      </>
                    )}
                    {subTab === 'mining' && (
                      <>
                        <div className="text-sm font-extrabold text-amber-700 dark:text-amber-300 font-mono-num tabular-nums inline-flex items-center gap-1 justify-end">
                          <EggIcon className="w-3.5 h-3.5" />
                          <span>{Math.floor(entry.eggs).toLocaleString()}</span>
                        </div>
                        <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400 font-mono-num tabular-nums">
                          {entry.totalEggsCollected.toLocaleString()} total
                        </div>
                      </>
                    )}
                    {subTab === 'buyers' && (
                      <>
                        <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 font-mono-num tabular-nums inline-flex items-center gap-1 justify-end">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{entry.buyerPoints.toLocaleString()}</span>
                        </div>
                        <div className="text-[10px] font-bold text-stone-500 dark:text-stone-400">
                          points
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
