import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildEarningsChartSeries,
  calculateReinvestCoins,
  type DailyEarningsChartPoint,
  eggsToUsd,
  filterWithdrawalsByTab,
  MIN_REINVEST_EGGS,
  type WithdrawalFilterTab,
} from '../game/economy';
import type { TransactionEntry, UserFarmProfile, WithdrawalOrder } from '../types/farm';
import { CoinIcon, EggIcon } from './GameIcons';

function EarningsChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DailyEarningsChartPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;

  return (
    <div className="clay-card-dark !rounded-2xl text-white px-3 py-2 text-xs space-y-0.5">
      <div className="font-extrabold text-amber-300">
        {pt.label}, {pt.fullDate}
      </div>
      <div className="font-mono-num font-bold text-amber-200">
        {pt.eggsCollected.toLocaleString()} eggs collected
      </div>
      <div className="font-mono-num font-bold text-emerald-300">
        +{pt.coinsEarned.toLocaleString()} coins earned
      </div>
    </div>
  );
}

interface WalletViewProps {
  profile: UserFarmProfile;
  transactions: TransactionEntry[];
  withdrawals?: WithdrawalOrder[];
  onTabTap?: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenReinvest?: () => void;
  onReinvest: (eggsAmount: number) => void;
}

function formatDayGroup(ms: number, nowMs: number): string {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = startOfToday.getTime() - 24 * 60 * 60 * 1000;
  if (ms >= startOfToday.getTime()) return 'Today';
  if (ms >= startOfYesterday) return 'Yesterday';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function WalletView({
  profile,
  transactions,
  withdrawals = [],
  onTabTap,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenReinvest,
  onReinvest,
}: WalletViewProps) {
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdraw' | 'farm'>('all');
  const [withdrawalFilter, setWithdrawalFilter] = useState<WithdrawalFilterTab>('all');
  const [showReinvestModal, setShowReinvestModal] = useState(false);
  const [reinvestInput, setReinvestInput] = useState(String(Math.min(profile.eggs, 500)));

  const nowMs = Date.now();
  const usdBalance = eggsToUsd(profile.eggs);
  const pendingWithdrawals = filterWithdrawalsByTab(withdrawals, 'pending');
  const completedWithdrawals = filterWithdrawalsByTab(withdrawals, 'completed');
  const filteredWithdrawals = filterWithdrawalsByTab(withdrawals, withdrawalFilter);
  const earningsSeries = useMemo(
    () => buildEarningsChartSeries(transactions, nowMs, 7),
    [transactions, nowMs],
  );
  const weeklyEggsTotal = useMemo(
    () => earningsSeries.reduce((sum, pt) => sum + pt.eggsCollected, 0),
    [earningsSeries],
  );

  const filteredTx = transactions.filter((tx) => {
    if (filter === 'all') return true;
    if (filter === 'deposit') return tx.type === 'deposit';
    if (filter === 'withdraw') return tx.type === 'withdraw';
    return tx.type !== 'deposit' && tx.type !== 'withdraw';
  });

  const grouped = filteredTx.reduce<{ label: string; items: TransactionEntry[] }[]>((acc, tx) => {
    const label = formatDayGroup(tx.createdAtMs, nowMs);
    const existing = acc.find((g) => g.label === label);
    if (existing) {
      existing.items.push(tx);
    } else {
      acc.push({ label, items: [tx] });
    }
    return acc;
  }, []);

  const numericReinvest = Math.max(0, Math.floor(Number(reinvestInput) || 0));
  const preview = calculateReinvestCoins(numericReinvest);

  return (
    <div className="animate-clay-enter space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-100">Your Wallet</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">Your balance, deposits &amp; withdrawals</p>
      </div>

      {/* Main Balance Card */}
      <div className="clay-card p-5 text-center space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Available Balance
        </div>

        <div className="flex items-center justify-center gap-2.5">
          <motion.div
            key={`wallet-egg-well-${profile.eggs}`}
            initial={{ scale: 1.15, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center"
          >
            <EggIcon className="w-7 h-7" />
          </motion.div>
          <motion.span
            key={profile.eggs}
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num origin-left"
          >
            {profile.eggs.toLocaleString()}
          </motion.span>
        </div>

        <div className="text-sm font-bold text-stone-700 dark:text-stone-200 font-mono-num">
          ${usdBalance.toFixed(4)}
        </div>
        <div className="text-xs text-stone-500 dark:text-stone-400">
          Withdraw in GRAM · no fees
        </div>

        <div className="clay-inset px-3 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 flex items-center justify-center gap-2 flex-wrap">
          <span>Eggs = withdrawable cash</span>
          <span aria-hidden="true">·</span>
          <span>Coins = buy chickens</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onOpenDeposit}
            className="clay-btn clay-btn-emerald clay-cta-sheen min-h-[48px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2"
          >
            <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
            <span>Deposit</span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onOpenWithdraw}
            className="clay-btn clay-btn-sky min-h-[48px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2"
          >
            <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            <span>Withdraw</span>
          </motion.button>
        </div>
      </div>

      {/* Reinvest Eggs Card */}
      <button
        type="button"
        onClick={() => {
          onTabTap?.();
          if (onOpenReinvest) {
            onOpenReinvest();
          } else {
            setReinvestInput(String(Math.max(MIN_REINVEST_EGGS, Math.min(profile.eggs, 500))));
            setShowReinvestModal(true);
          }
        }}
        className="clay-btn clay-card-mint w-full p-4 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">Reinvest eggs</div>
            <div className="text-xs text-stone-600 dark:text-stone-300 truncate">
              Turn your eggs into coins and get +5% extra (min. {MIN_REINVEST_EGGS})
            </div>
          </div>
        </div>
        <span className="clay-btn-emerald px-3 py-1 rounded-xl text-xs font-extrabold shrink-0">
          +5%
        </span>
      </button>

      {/* 7-Day Egg & Coin Earnings Analytics */}
      <div className="clay-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl clay-icon-well flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 leading-tight">
                7-Day Earnings Analytics
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Daily eggs harvested &amp; coins earned
              </p>
            </div>
          </div>
          <span className="clay-card-warm !rounded-full text-xs font-extrabold font-mono-num px-3 py-1 text-amber-900 dark:text-amber-300 shrink-0">
            {weeklyEggsTotal.toLocaleString()} eggs
          </span>
        </div>

        <div className="clay-inset p-2.5 h-44 w-full min-w-0" aria-label="7-day earnings analytics chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={earningsSeries} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.22} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#78716C', fontWeight: 600 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={34}
                tick={{ fontSize: 10, fill: '#78716C', fontWeight: 600 }}
              />
              <Tooltip content={<EarningsChartTooltip />} />
              <Bar dataKey="eggsCollected" name="Eggs" fill="#F59E0B" radius={[6, 6, 0, 0]} />
              <Bar dataKey="coinsEarned" name="Coins" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Withdrawal Requests Section */}
      <section aria-label="Withdrawal requests" className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">Withdrawal Requests</h2>
            {pendingWithdrawals.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/70 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                <Clock className="w-3 h-3" />
                <span>{pendingWithdrawals.length} Pending</span>
              </span>
            )}
          </div>

          <div
            role="group"
            aria-label="Filter withdrawal requests"
            className="clay-inset !rounded-xl flex items-center gap-1 p-1"
          >
            {(
              [
                { id: 'all', label: 'All', count: withdrawals.length },
                { id: 'pending', label: 'Pending', count: pendingWithdrawals.length },
                { id: 'completed', label: 'Completed', count: completedWithdrawals.length },
              ] as const
            ).map((tab) => {
              const active = withdrawalFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onTabTap?.();
                    setWithdrawalFilter(tab.id);
                  }}
                  className={`relative px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    active
                      ? 'text-amber-950'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="wallet-wd-filter-active"
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className="clay-btn-amber absolute inset-0 rounded-lg -z-10"
                    />
                  )}
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className="text-[10px] font-mono-num opacity-80">{tab.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {filteredWithdrawals.length === 0 ? (
          <div className="clay-card p-5 text-center text-xs text-stone-500 dark:text-stone-400">
            {withdrawalFilter === 'pending'
              ? 'No pending withdrawal requests waiting for approval.'
              : withdrawalFilter === 'completed'
                ? 'No completed withdrawals yet.'
                : 'No withdrawal requests yet.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredWithdrawals.map((wd) => {
              const isPending = wd.status === 'pending' || wd.status === 'processing';
              const isCompleted = wd.status === 'approved' || wd.status === 'completed';
              const shortWallet =
                wd.walletAddress.length > 14
                  ? `${wd.walletAddress.slice(0, 8)}...${wd.walletAddress.slice(-6)}`
                  : wd.walletAddress;

              return (
                <div
                  key={wd.id}
                  className={`${isPending ? 'clay-card-warm' : 'clay-card'} !rounded-2xl px-3.5 py-3 flex items-center justify-between gap-2.5 text-xs`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                      {wd.gramAmount} GRAM ({wd.eggsAmount.toLocaleString()} eggs)
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      To {shortWallet}
                      {isPending
                        ? ' · Waiting for admin approval'
                        : isCompleted
                          ? ' · Payout approved'
                          : ' · Rejected & refunded'}
                    </div>
                    {wd.adminNote && (
                      <div className="text-[11px] font-medium text-stone-600 dark:text-stone-300 truncate">
                        Note: {wd.adminNote}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isPending ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/70 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                        <Clock className="w-3 h-3" />
                        <span>Pending</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Completed</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                        <XCircle className="w-3 h-3" />
                        <span>Rejected</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={onOpenWithdraw}
                      className="text-xs font-extrabold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Transaction History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100">Transaction History</h2>
          <div className="clay-inset !rounded-xl flex items-center gap-1 p-1">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'deposit', label: 'Deposits' },
                { id: 'withdraw', label: 'Withdraws' },
                { id: 'farm', label: 'Farm' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onTabTap?.();
                  setFilter(tab.id);
                }}
                className={`clay-btn px-2.5 py-1 rounded-lg text-xs font-bold ${
                  filter === tab.id ? 'clay-btn-amber' : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="clay-card p-6 text-center text-sm text-stone-500 dark:text-stone-400">
            No transactions in this filter yet.
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <div className="text-xs font-bold text-stone-500 dark:text-stone-400 px-1">{group.label}</div>
                <div className="clay-card divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
                  {group.items.map((tx) => {
                    const isPositive = tx.amount >= 0;
                    const timeStr = new Date(tx.createdAtMs).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <div key={tx.id} className="p-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                            {tx.currency === 'eggs' ? (
                              <EggIcon className="w-5 h-5" />
                            ) : (
                              <CoinIcon className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                              {tx.title}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap text-xs text-stone-400 dark:text-stone-500">
                              <span>{timeStr}</span>
                              {tx.status !== 'completed' && (
                                <span
                                  aria-label={
                                    tx.status === 'pending'
                                      ? 'Pending admin approval'
                                      : tx.status === 'approved'
                                        ? 'Approved'
                                        : 'Rejected'
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${
                                    tx.status === 'approved'
                                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                                      : tx.status === 'rejected'
                                        ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300'
                                        : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {tx.status === 'pending' && <Clock className="w-2.5 h-2.5" />}
                                  <span>
                                    {tx.status === 'pending'
                                      ? 'Pending'
                                      : tx.status === 'approved'
                                        ? 'Approved'
                                        : 'Rejected'}
                                  </span>
                                </span>
                              )}
                              {tx.status === 'pending' && tx.type === 'withdraw' && (
                                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                  Waiting for admin approval
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 font-mono-num">
                          <span
                            className={`text-sm font-extrabold ${
                              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isPositive ? '+' : ''}
                            {tx.amount.toLocaleString()}
                          </span>
                          {tx.currency === 'eggs' ? (
                            <EggIcon className="w-4 h-4" />
                          ) : (
                            <CoinIcon className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reinvest Modal */}
      {showReinvestModal && (
        <div
          className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reinvest-modal-title"
        >
          <div className="animate-clay-modal clay-card w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="reinvest-modal-title" className="text-lg font-extrabold text-stone-900 dark:text-stone-100">
                Reinvest Eggs (+5%)
              </h3>
              <button
                type="button"
                aria-label="Close reinvest modal"
                onClick={() => setShowReinvestModal(false)}
                className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-stone-500 dark:text-stone-400">
                <span>Eggs to convert</span>
                <span className="font-mono-num">Available: {profile.eggs.toLocaleString()}</span>
              </div>
              <input
                type="number"
                min={MIN_REINVEST_EGGS}
                max={profile.eggs}
                value={reinvestInput}
                onChange={(e) => setReinvestInput(e.target.value)}
                aria-label="Eggs amount to reinvest"
                className="clay-inset w-full min-h-[46px] px-3.5 text-base font-extrabold font-mono-num text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {[0.25, 0.5, 0.75, 1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() =>
                      setReinvestInput(String(Math.max(MIN_REINVEST_EGGS, Math.floor(profile.eggs * pct))))
                    }
                    className="clay-btn clay-btn-neutral py-1.5 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-200"
                  >
                    {pct === 1 ? 'Max' : `${pct * 100}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="clay-card-mint !rounded-2xl p-3.5 space-y-1">
              <div className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300">
                <span>Base coins</span>
                <span className="font-mono-num font-bold">+{preview.baseCoins.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300">
                <span>+5% Reinvest bonus</span>
                <span className="font-mono-num font-bold">+{preview.bonusCoins.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-emerald-950 dark:text-emerald-100 pt-1 border-t border-emerald-200 dark:border-emerald-800/60">
                <span>Total Coins Received</span>
                <span className="font-mono-num">+{preview.totalCoins.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onReinvest(numericReinvest);
                setShowReinvestModal(false);
              }}
              className="clay-btn clay-btn-emerald w-full min-h-[48px] rounded-2xl font-extrabold text-sm"
            >
              Convert Eggs to Coins
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
