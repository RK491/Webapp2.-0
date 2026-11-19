import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Flame, Gift, Play, Sparkles, Timer, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ADSGRAM_BOT_JOIN_TASK,
  CHICKEN_PACKS,
  COOP_FEVER_REQUIRED_ADS,
  FREE_EGGS_MILESTONE_BONUS,
  FREE_EGGS_PER_AD,
} from '../game/economy';
import type { AdConfig, ChickenBreedId } from '../types/farm';
import clayHenMascot from '../assets/images/clay_hen_mascot_1794678825872.jpg';
import { ChickenSprite, CoinIcon, EggIcon } from './GameIcons';

export type ModalAdActionKind =
  | 'startup'
  | 'collect_eggs'
  | 'claim_promo'
  | 'buy_chicken'
  | 'ad_network'
  | 'adsgram_task'
  | 'coop_fever'
  | 'reinvest'
  | 'watch_ad';

interface RewardedAdModalProps {
  adConfig: AdConfig;
  watchedCount: number;
  actionKind?: ModalAdActionKind;
  networkLabel?: string | null;
  rewardCoins?: number | null;
  pendingEggs?: number | null;
  promoCode?: string | null;
  promoRewardSummary?: string | null;
  chickenBreed?: ChickenBreedId | null;
  chickenQty?: number | null;
  minerCostCoins?: number | null;
  coopFeverAdsCollected?: number | null;
  coopFeverAdsRequired?: number | null;
  reinvestEggs?: number | null;
  reinvestCoins?: number | null;
  fallbackNotice?: string | null;
  mandatory?: boolean;
  onComplete: () => void;
  onClose: () => void;
}

export function RewardedAdModal({
  adConfig,
  watchedCount,
  actionKind = 'watch_ad',
  networkLabel,
  rewardCoins,
  pendingEggs,
  promoCode,
  promoRewardSummary,
  chickenBreed,
  chickenQty,
  minerCostCoins,
  coopFeverAdsCollected,
  coopFeverAdsRequired,
  reinvestEggs,
  reinvestCoins,
  fallbackNotice,
  mandatory = false,
  onComplete,
  onClose,
}: RewardedAdModalProps) {
  const shouldReduceMotion = useReducedMotion();
  const totalSeconds = Math.max(3, Math.min(60, adConfig.watchSeconds || 5));
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [claimed, setClaimed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  const progressPct = Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100);
  const readyToClaim = secondsLeft === 0;
  const sponsorUrl = adConfig.customUrl.trim();
  const hasCoinReward = typeof rewardCoins === 'number' && rewardCoins > 0;
  const safeEggs = Math.max(0, Math.floor(Number(pendingEggs ?? 0)));
  const safeChickenQty = Math.max(1, Math.floor(Number(chickenQty ?? 1)));
  const minerPack = chickenBreed
    ? CHICKEN_PACKS.find((p) => p.id === chickenBreed) ?? null
    : null;
  const minerPackName = minerPack?.name || 'Hen Miner';
  const safeMinerCost = Math.max(0, Math.floor(Number(minerCostCoins ?? 0)));
  const feverReq = Math.max(1, Math.floor(Number(coopFeverAdsRequired ?? COOP_FEVER_REQUIRED_ADS)));
  const feverCurrent = Math.max(0, Math.min(feverReq, Math.floor(Number(coopFeverAdsCollected ?? 0))));
  const feverNext = Math.min(feverReq, feverCurrent + 1);
  const safeReinvestEggs = Math.max(0, Math.floor(Number(reinvestEggs ?? 0)));
  const safeReinvestCoins = Math.max(0, Math.floor(Number(reinvestCoins ?? 0)));
  const isMilestoneEggAd = watchedCount + 1 >= 10;
  const watchAdEggAmount = isMilestoneEggAd
    ? FREE_EGGS_PER_AD + FREE_EGGS_MILESTONE_BONUS
    : FREE_EGGS_PER_AD;

  const handleClaim = () => {
    if (!readyToClaim || claimed) return;
    setClaimed(true);
    onComplete();
  };

  const badgeText = (() => {
    if (actionKind === 'startup') return 'App Launch Ad';
    if (actionKind === 'collect_eggs') return 'Egg Harvest Ad';
    if (actionKind === 'claim_promo') return 'Gift Code Ad';
    if (actionKind === 'buy_chicken') return 'Miner Purchase Ad';
    if (actionKind === 'adsgram_task') return 'AdsGram Bot Joins';
    if (actionKind === 'coop_fever') return `3× Coop Fever (${feverNext}/${feverReq})`;
    if (actionKind === 'reinvest') return 'Reinvest Ad (+5% Extra)';
    if (networkLabel) return `${networkLabel} · Earn Coins`;
    return `Get Free Eggs (${watchedCount + 1}/10)`;
  })();

  const headline = (() => {
    if (actionKind === 'startup') return adConfig.customTitle || 'Welcome to Alpha Gram';
    if (actionKind === 'collect_eggs') return 'Unlock Egg Harvest';
    if (actionKind === 'claim_promo') return `Unlock Gift ${promoCode || 'Code'}`;
    if (actionKind === 'buy_chicken') return `Unlock ${safeChickenQty}× ${minerPackName}`;
    if (actionKind === 'adsgram_task') return 'AdsGram Bot Joins & Clicks';
    if (actionKind === 'coop_fever') return 'Charge 3× Coop Fever Rush';
    if (actionKind === 'reinvest') return `Confirm ${safeReinvestEggs.toLocaleString()} Eggs Reinvest`;
    if (networkLabel) return `${networkLabel} Watch & Earn`;
    return 'Watch & Earn Free Eggs';
  })();

  const description = (() => {
    if (actionKind === 'startup') {
      return 'Watch this short ad to enter your farm & start mining.';
    }
    if (actionKind === 'collect_eggs') {
      return `Complete the ad timer to collect +${safeEggs.toLocaleString()} eggs into your basket.`;
    }
    if (actionKind === 'claim_promo') {
      return `Complete the ad timer to claim ${promoCode || 'your gift code'}${
        promoRewardSummary ? ` (${promoRewardSummary})` : ''
      }.`;
    }
    if (actionKind === 'buy_chicken') {
      return `Complete the ad timer to confirm buying ${safeChickenQty}× ${minerPackName}${
        safeMinerCost > 0 ? ` for ${safeMinerCost.toLocaleString()} coins` : ''
      }.`;
    }
    if (actionKind === 'adsgram_task') {
      return `Visit the sponsored Telegram bot or channel offer and wait for the timer to claim +${
        rewardCoins ?? ADSGRAM_BOT_JOIN_TASK.rewardCoins
      } coins.`;
    }
    if (actionKind === 'coop_fever') {
      return feverNext >= feverReq
        ? `Complete this final ad (${feverNext}/${feverReq}) to unlock 3× Coop Fever egg production for 10 minutes!`
        : `Dedicated 3× Fever Ad (${feverNext}/${feverReq}). Complete ${feverReq} Farm Fever ads to earn 3× egg production for 10 minutes.`;
    }
    if (actionKind === 'reinvest') {
      return `Complete this ad to reinvest ${safeReinvestEggs.toLocaleString()} eggs (+5% extra) into +${safeReinvestCoins.toLocaleString()} coins. Does not count toward the 30-ad Withdraw criteria.`;
    }
    if (hasCoinReward) {
      return `Watch until the timer ends to earn +${rewardCoins} coins directly to your wallet.`;
    }
    return isMilestoneEggAd
      ? `10/10 Bonus Ad! Complete the timer to claim +${watchAdEggAmount.toLocaleString()} Free Eggs (+${FREE_EGGS_MILESTONE_BONUS} bonus).`
      : `Watch until the timer ends to earn +${FREE_EGGS_PER_AD} Free Eggs (+${FREE_EGGS_MILESTONE_BONUS} chest at 10/10).`;
  })();

  const completeButtonLabel = (() => {
    if (actionKind === 'startup') return 'Continue to Alpha Gram';
    if (actionKind === 'collect_eggs') return `Collect +${safeEggs.toLocaleString()} Eggs`;
    if (actionKind === 'claim_promo') return `Claim Gift (${promoCode || 'Reward'})`;
    if (actionKind === 'buy_chicken') return `Buy ${safeChickenQty}× ${minerPackName}`;
    if (actionKind === 'adsgram_task') {
      return `Claim +${rewardCoins ?? ADSGRAM_BOT_JOIN_TASK.rewardCoins} Coins`;
    }
    if (actionKind === 'coop_fever') {
      return feverNext >= feverReq
        ? `Unlock 3× Fever (${feverNext}/${feverReq})`
        : `Count 3× Fever Ad (${feverNext}/${feverReq})`;
    }
    if (actionKind === 'reinvest') {
      return `Complete Reinvest (+${safeReinvestCoins.toLocaleString()} Coins)`;
    }
    if (hasCoinReward) return `Claim +${rewardCoins} Coins`;
    return `Claim +${watchAdEggAmount} Free Eggs`;
  })();

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rewarded-ad-title"
    >
      <div className="animate-clay-modal clay-card w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="clay-card-warm !rounded-xl inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-800 dark:text-amber-300 px-3 py-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{badgeText}</span>
          </div>
          {!mandatory && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel ad without claiming"
              title="Closing early cancels the reward"
              className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="clay-card-mint !rounded-2xl p-4 text-center space-y-2.5">
          <div className="flex justify-center">
            <div className="animate-clay-float w-20 h-20 rounded-2xl clay-icon-well p-1 flex items-center justify-center overflow-hidden">
              {actionKind === 'buy_chicken' && chickenBreed ? (
                <ChickenSprite breed={chickenBreed} className="w-14 h-14" />
              ) : actionKind === 'watch_ad' ? (
                <EggIcon className="w-14 h-14" />
              ) : actionKind === 'coop_fever' ? (
                <Flame className="w-11 h-11 text-orange-500 fill-orange-400" />
              ) : !imgFailed ? (
                <img
                  src={clayHenMascot}
                  alt="Clay Alpha Gram mascot"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <ChickenSprite breed="leghorn" className="w-12 h-12" />
              )}
            </div>
          </div>
          <h2 id="rewarded-ad-title" className="text-base font-extrabold text-stone-900 dark:text-stone-100">
            {headline}
          </h2>
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            {description}
          </p>

          {actionKind === 'coop_fever' && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-orange-100/90 dark:bg-orange-950/60 border border-orange-300/70 dark:border-orange-700/50 px-3 py-1 text-xs font-extrabold text-orange-800 dark:text-orange-300">
              <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
              <span className="font-mono-num">
                Fever Ads: {feverCurrent} → {feverNext}/{feverReq}
              </span>
            </div>
          )}

          {actionKind === 'collect_eggs' && safeEggs > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-700/50 px-3 py-1 text-xs font-extrabold text-amber-800 dark:text-amber-300">
              <EggIcon className="w-4 h-4" />
              <span className="font-mono-num">+{safeEggs.toLocaleString()} eggs</span>
            </div>
          )}

          {actionKind === 'watch_ad' && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-700/50 px-3 py-1 text-xs font-extrabold text-amber-800 dark:text-amber-300">
              <EggIcon className="w-4 h-4" />
              <span className="font-mono-num">+{watchAdEggAmount.toLocaleString()} Free Eggs</span>
            </div>
          )}

          {actionKind === 'reinvest' && safeReinvestCoins > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300/70 dark:border-emerald-700/50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
              <CoinIcon className="w-4 h-4" />
              <span className="font-mono-num">+{safeReinvestCoins.toLocaleString()} Coins (+5% Extra Eggs)</span>
            </div>
          )}

          {actionKind === 'claim_promo' && promoRewardSummary && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300/70 dark:border-emerald-700/50 px-3 py-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
              <Gift className="w-4 h-4" />
              <span>{promoRewardSummary}</span>
            </div>
          )}

          {actionKind === 'buy_chicken' && chickenBreed && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-700/50 px-3 py-1 text-xs font-extrabold text-amber-900 dark:text-amber-200">
              <ChickenSprite breed={chickenBreed} className="w-4 h-4" />
              <span>
                +{safeChickenQty} {minerPackName}
              </span>
              {safeMinerCost > 0 && (
                <span className="inline-flex items-center gap-1 font-mono-num text-stone-700 dark:text-stone-200">
                  · <CoinIcon className="w-3.5 h-3.5" /> {safeMinerCost.toLocaleString()}
                </span>
              )}
            </div>
          )}

          {hasCoinReward && (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-700/50 px-3 py-1 text-xs font-extrabold text-amber-800 dark:text-amber-300">
              <CoinIcon className="w-4 h-4" />
              <span className="font-mono-num">+{rewardCoins} coins</span>
            </div>
          )}

          {sponsorUrl && (
            <div>
              <a
                href={sponsorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="clay-btn clay-btn-neutral inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold text-sky-700 dark:text-sky-400"
              >
                <span>{actionKind === 'adsgram_task' ? 'Open Bot / Offer' : 'Visit Sponsor'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {fallbackNotice && (
          <div className="clay-inset px-3 py-2 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
            {fallbackNotice}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-stone-600 dark:text-stone-300">
            <span className="inline-flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>{readyToClaim ? 'Ad completed!' : 'Complete ad to unlock'}</span>
            </span>
            <span className="font-mono-num text-stone-900 dark:text-stone-100">
              {readyToClaim ? 'Ready' : `${secondsLeft}s`}
            </span>
          </div>
          <div className="h-3 rounded-xl clay-inset p-0.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
              className="h-full rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 clay-shimmer-bar"
            />
          </div>
          {!mandatory && !readyToClaim && (
            <p className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 text-center">
              Closing early cancels this claim until the ad completes.
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={!readyToClaim}
          onClick={handleClaim}
          className={`clay-btn w-full min-h-[48px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 ${
            readyToClaim
              ? 'clay-btn-emerald'
              : 'clay-btn-neutral opacity-60 cursor-not-allowed text-stone-500 dark:text-stone-400'
          }`}
        >
          {readyToClaim ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>{completeButtonLabel}</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>Please wait {secondsLeft}s...</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
