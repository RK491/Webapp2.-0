import { useState } from 'react';
import { CheckCircle2, Coins, Gift, Sparkles } from 'lucide-react';
import { REFERRED_WELCOME_BONUS_COINS, SIGNUP_BONUS_COINS } from '../game/economy';
import clayHenMascot from '../assets/images/clay_hen_mascot_1794678825872.jpg';
import { ChickenSprite, CoinIcon, EggIcon } from './GameIcons';

interface SignUpBonusModalProps {
  onClaim: () => void;
  hasReferral?: boolean;
}

export function SignUpBonusModal({ onClaim, hasReferral = false }: SignUpBonusModalProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 min-h-[100dvh] w-full overflow-y-auto bg-gradient-to-b from-[#FFFDF7] via-[#FAF6EA] to-[#FEF0C7] dark:from-[#0F1115] dark:via-[#14171D] dark:to-[#1F1A11] select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-bonus-title"
      data-testid="signup-bonus-fullscreen"
    >
      <div className="min-h-[100dvh] w-full max-w-lg mx-auto px-5 py-6 sm:py-10 flex flex-col justify-between gap-6">
        {/* Top Brand Header */}
        <header className="flex items-center justify-between pt-1">
          <div className="inline-flex items-center gap-2.5">
            <span className="alpha-brand-crest w-9 h-9 rounded-2xl text-sm font-extrabold flex items-center justify-center tracking-tight">
              αG
            </span>
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-tight text-stone-900 dark:text-stone-100 font-display">
                Alpha Gram
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                New Farmer Welcome
              </p>
            </div>
          </div>

          <div className="clay-card-warm !rounded-2xl px-3 py-1.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-amber-950 dark:text-amber-200 uppercase tracking-wider">
            <Gift className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Sign-Up Gift</span>
          </div>
        </header>

        {/* Center Hero Stage */}
        <main className="flex-1 flex flex-col items-center justify-center text-center space-y-5 py-2">
          <div className="relative flex items-center justify-center">
            <div className="animate-clay-float w-32 h-32 sm:w-36 sm:h-36 rounded-[2.2rem] clay-card-warm p-2 flex items-center justify-center overflow-hidden">
              {!imgFailed ? (
                <img
                  src={clayHenMascot}
                  alt="Claymorphism Alpha Gram hen mascot with golden coin and egg"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover rounded-[1.7rem]"
                />
              ) : (
                <ChickenSprite breed="leghorn" className="w-20 h-20" />
              )}
            </div>
            <div className="animate-alpha-orbit absolute -top-2.5 -right-3 w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center">
              <CoinIcon className="w-6 h-6" />
            </div>
            <div
              className="animate-alpha-orbit absolute -bottom-2.5 -left-3 w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center"
              style={{ animationDelay: '0.7s' }}
            >
              <EggIcon className="w-6 h-6" />
            </div>
          </div>

          <div className="space-y-2 max-w-sm">
            <h1
              id="signup-bonus-title"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100 font-display"
            >
              Claim Your {SIGNUP_BONUS_COINS.toLocaleString()} Coins!
            </h1>
            <p className="text-sm font-medium text-stone-600 dark:text-stone-300 leading-relaxed">
              Every new Alpha Gram farmer receives a starter{' '}
              <span className="font-bold text-stone-900 dark:text-stone-100">
                {SIGNUP_BONUS_COINS.toLocaleString()} Coins
              </span>{' '}
              sign-up bonus to launch their poultry coop.
            </p>
          </div>

          {/* Primary Reward Card */}
          <div className="w-full clay-card p-5 space-y-3">
            <div className="clay-card-mint !rounded-2xl px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-left">
                <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
                  <CoinIcon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/80 dark:text-emerald-300/80">
                    Instant Sign-Up Bonus
                  </p>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono-num text-emerald-800 dark:text-emerald-300">
                    +{SIGNUP_BONUS_COINS.toLocaleString()} Coins
                  </p>
                </div>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>

            {hasReferral && (
              <div className="clay-card-warm !rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs font-bold text-amber-950 dark:text-amber-200">
                <span className="inline-flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Referral Invite Welcome Bonus</span>
                </span>
                <span className="font-mono-num font-extrabold">
                  +{REFERRED_WELCOME_BONUS_COINS} Coins
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1 text-left">
              <div className="clay-inset px-2.5 py-2.5 rounded-2xl">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Step 1
                </p>
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mt-0.5 leading-snug">
                  Claim 1,000 Coins
                </p>
              </div>
              <div className="clay-inset px-2.5 py-2.5 rounded-2xl">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Step 2
                </p>
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mt-0.5 leading-snug">
                  Buy 1st Chicken
                </p>
              </div>
              <div className="clay-inset px-2.5 py-2.5 rounded-2xl">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Step 3
                </p>
                <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mt-0.5 leading-snug">
                  Mine Eggs 24/7
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Bottom CTA Footer */}
        <footer className="pb-2 space-y-2.5">
          <button
            type="button"
            onClick={onClaim}
            className="clay-btn clay-btn-emerald w-full min-h-[56px] rounded-2xl font-extrabold text-base flex items-center justify-center gap-2.5 shadow-lg"
          >
            <Sparkles className="w-5 h-5" />
            <span>Claim +{SIGNUP_BONUS_COINS.toLocaleString()} Coins</span>
          </button>
          <p className="text-[11px] font-medium text-center text-stone-500 dark:text-stone-400">
            Free starter balance · No deposit required to begin mining
          </p>
        </footer>
      </div>
    </div>
  );
}
