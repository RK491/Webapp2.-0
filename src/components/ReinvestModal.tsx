import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { calculateReinvestCoins, MIN_REINVEST_EGGS } from '../game/economy';
import { CoinIcon, EggIcon } from './GameIcons';

interface ReinvestModalProps {
  availableEggs: number;
  loading?: boolean;
  onInvest: (eggsAmount: number) => void;
  onClose: () => void;
}

export function ReinvestModal({
  availableEggs,
  loading = false,
  onInvest,
  onClose,
}: ReinvestModalProps) {
  const safeAvailable = Math.max(0, Math.floor(availableEggs));
  const [reinvestInput, setReinvestInput] = useState(() =>
    String(Math.max(MIN_REINVEST_EGGS, Math.min(safeAvailable, 500))),
  );

  const numericReinvest = Math.max(0, Math.floor(Number(reinvestInput) || 0));
  const preview = calculateReinvestCoins(numericReinvest);
  const canInvest =
    !loading &&
    numericReinvest >= MIN_REINVEST_EGGS &&
    numericReinvest <= safeAvailable;

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/55 dark:bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reinvest-modal-title"
    >
      <div className="animate-clay-modal clay-card w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl clay-icon-well flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="reinvest-modal-title"
                className="text-base font-extrabold text-stone-900 dark:text-stone-100 leading-tight"
              >
                Reinvest Eggs (+5% Extra)
              </h3>
              <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                Min. {MIN_REINVEST_EGGS.toLocaleString()} eggs · Instant Coin boost
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close reinvest modal"
            onClick={onClose}
            className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold text-stone-500 dark:text-stone-400">
            <span>Eggs to reinvest</span>
            <span className="inline-flex items-center gap-1 font-mono-num">
              <EggIcon className="w-3.5 h-3.5" />
              <span>Available: {safeAvailable.toLocaleString()}</span>
            </span>
          </div>
          <input
            type="number"
            min={MIN_REINVEST_EGGS}
            max={Math.max(MIN_REINVEST_EGGS, safeAvailable)}
            value={reinvestInput}
            onChange={(e) => setReinvestInput(e.target.value)}
            aria-label="Eggs amount to reinvest"
            className="clay-inset w-full min-h-[46px] px-3.5 text-base font-extrabold font-mono-num text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'min', label: `Min ${MIN_REINVEST_EGGS}`, val: MIN_REINVEST_EGGS },
              { id: '25', label: '25%', val: Math.max(MIN_REINVEST_EGGS, Math.floor(safeAvailable * 0.25)) },
              { id: '50', label: '50%', val: Math.max(MIN_REINVEST_EGGS, Math.floor(safeAvailable * 0.5)) },
              { id: 'max', label: 'Max', val: Math.max(MIN_REINVEST_EGGS, safeAvailable) },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setReinvestInput(String(preset.val))}
                className="clay-btn clay-btn-neutral py-1.5 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-200"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="clay-card-mint !rounded-2xl p-3.5 space-y-1.5">
          <div className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <span>+5% Extra Eggs Bonus</span>
            <span className="font-mono-num font-bold">+{preview.bonusEggs.toLocaleString()} eggs</span>
          </div>
          <div className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <span>Base coins</span>
            <span className="font-mono-num font-bold">+{preview.baseCoins.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs text-emerald-800 dark:text-emerald-300">
            <span>+5% Bonus coins</span>
            <span className="font-mono-num font-bold">+{preview.bonusCoins.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm font-extrabold text-emerald-950 dark:text-emerald-100 pt-1.5 border-t border-emerald-200 dark:border-emerald-800/60">
            <span>Total Coins Received</span>
            <span className="inline-flex items-center gap-1 font-mono-num">
              <CoinIcon className="w-4 h-4" />
              <span>+{preview.totalCoins.toLocaleString()}</span>
            </span>
          </div>
        </div>

        {safeAvailable < MIN_REINVEST_EGGS && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-300">
            You need at least {MIN_REINVEST_EGGS.toLocaleString()} eggs in your balance to reinvest.
          </div>
        )}

        <button
          type="button"
          disabled={!canInvest}
          onClick={() => onInvest(numericReinvest)}
          className="clay-btn clay-btn-emerald disabled:opacity-55 w-full min-h-[48px] rounded-2xl font-extrabold text-sm"
        >
          {loading ? 'Starting Ad...' : 'Invest & Watch Ad'}
        </button>
      </div>
    </div>
  );
}
