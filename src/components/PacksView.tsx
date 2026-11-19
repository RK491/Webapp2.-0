import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { CHICKEN_PACKS, coinsToUsd } from '../game/economy';
import type { ChickenBreedId, UserFarmProfile } from '../types/farm';
import { ChickenSprite, CoinIcon, EggIcon } from './GameIcons';

interface PacksViewProps {
  profile: UserFarmProfile;
  buyingBusy?: boolean;
  onBuy: (breed: ChickenBreedId, qty: number) => void;
  onTopUp: () => void;
}

export function PacksView({ profile, buyingBusy = false, onBuy, onTopUp }: PacksViewProps) {
  const [quantities, setQuantities] = useState<Record<ChickenBreedId, number>>({
    leghorn: 1,
    rhode: 1,
    orpington: 1,
    australorp: 1,
  });

  const setQty = (id: ChickenBreedId, next: number) => {
    const clamped = Math.max(1, Math.min(20, next));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  };

  const ownedCount = (id: ChickenBreedId) => {
    if (id === 'leghorn') return profile.leghornCount;
    if (id === 'rhode') return profile.rhodeCount;
    if (id === 'orpington') return profile.orpingtonCount;
    return profile.australorpCount;
  };

  return (
    <div className="animate-clay-enter space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-100">Chicken Packs</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Buy chickens and grow your farm 24/7</p>
        </div>
      </div>

      {/* Coins Header Card */}
      <div className="clay-card-warm !rounded-3xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
            <CoinIcon className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                {profile.coins.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 font-mono-num">
                ≈ ${coinsToUsd(profile.coins).toFixed(3)}
              </span>
            </div>
            <div className="text-xs font-semibold text-stone-600 dark:text-stone-400">Available Coins</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onTopUp}
          className="clay-btn clay-btn-emerald min-h-[44px] px-4 rounded-2xl text-sm font-extrabold whitespace-nowrap shrink-0"
        >
          Top up
        </button>
      </div>

      {/* Chicken Pack Cards */}
      <div className="space-y-3.5">
        {CHICKEN_PACKS.map((pack, index) => {
          const qty = quantities[pack.id];
          const totalCost = pack.coinCost * qty;
          const totalUsd = (pack.usdCost * qty).toFixed(2);
          const canAfford = profile.coins >= totalCost;
          const owned = ownedCount(pack.id);

          return (
            <motion.div
              key={pack.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.24, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -2 }}
              className="group clay-card p-4 space-y-3"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-2xl clay-icon-well flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3">
                  <ChickenSprite breed={pack.id} className="w-13 h-13 animate-chicken-bob" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-extrabold text-stone-900 dark:text-stone-100 truncate">
                      {pack.name}
                    </h2>
                    <span className="clay-inset !rounded-xl px-2.5 py-0.5 text-xs font-bold text-stone-600 dark:text-stone-300 whitespace-nowrap">
                      Owned: <span className="font-mono-num text-stone-900 dark:text-stone-100">{owned}</span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                    <EggIcon className="w-4 h-4 shrink-0" />
                    <span className="font-bold text-stone-800 dark:text-stone-200 font-mono-num">{pack.eggsPerHour} eggs/h</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">+{pack.leaderboardPoints} pt</span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400 truncate">{pack.tagline}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-stone-200/60 dark:border-stone-800/80">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CoinIcon className="w-5 h-5 shrink-0" />
                  <motion.span
                    key={totalCost}
                    initial={{ scale: 1.12 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="text-base font-extrabold text-stone-900 dark:text-stone-100 font-mono-num origin-left"
                  >
                    {totalCost.toLocaleString()}
                  </motion.span>
                  <span className="text-xs font-medium text-stone-400 dark:text-stone-500 font-mono-num">
                    ${totalUsd}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Decrease ${pack.name} quantity`}
                    onClick={() => setQty(pack.id, qty - 1)}
                    className="clay-btn clay-btn-neutral w-9 h-9 rounded-full flex items-center justify-center text-stone-700 dark:text-stone-200"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={qty}
                    aria-label={`${pack.name} quantity slider`}
                    onChange={(e) => setQty(pack.id, Number(e.target.value))}
                    className="w-16 sm:w-24 accent-amber-500 cursor-pointer"
                  />

                  <button
                    type="button"
                    aria-label={`Increase ${pack.name} quantity`}
                    onClick={() => setQty(pack.id, qty + 1)}
                    className="clay-btn clay-btn-neutral w-9 h-9 rounded-full flex items-center justify-center text-stone-700 dark:text-stone-200"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-extrabold text-stone-700 dark:text-stone-200 font-mono-num w-6 text-center">
                    +{qty}
                  </span>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    disabled={buyingBusy}
                    onClick={() => onBuy(pack.id, qty)}
                    className={`clay-btn min-h-[42px] px-4 rounded-2xl text-sm font-extrabold whitespace-nowrap disabled:opacity-60 ${
                      canAfford ? 'clay-btn-emerald clay-cta-sheen' : 'clay-btn-amber'
                    }`}
                  >
                    {buyingBusy ? 'Opening...' : 'Buy'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
