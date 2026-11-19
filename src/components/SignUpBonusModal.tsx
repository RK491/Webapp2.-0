import { useState } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { SIGNUP_BONUS_COINS } from '../game/economy';
import clayHenMascot from '../assets/images/clay_hen_mascot_1794678825872.jpg';
import { ChickenSprite, CoinIcon } from './GameIcons';

interface SignUpBonusModalProps {
  onClaim: () => void;
}

export function SignUpBonusModal({ onClaim }: SignUpBonusModalProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-bonus-title"
    >
      <div className="animate-clay-modal clay-card w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-6 pb-4 text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 rounded-full clay-card-warm !rounded-full px-3.5 py-1 text-[11px] font-extrabold text-amber-950 dark:text-amber-200 uppercase tracking-wider">
            <Gift className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>First-Time Open Bonus</span>
          </div>

          <div className="flex items-center justify-center pt-1">
            <div className="animate-clay-float w-28 h-28 rounded-[1.8rem] clay-card-warm p-1.5 flex items-center justify-center overflow-hidden">
              {!imgFailed ? (
                <img
                  src={clayHenMascot}
                  alt="Claymorphism Alpha Gram hen mascot with coin and egg"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover rounded-[1.4rem]"
                />
              ) : (
                <ChickenSprite breed="leghorn" className="w-16 h-16" />
              )}
            </div>
          </div>

          <h2 id="signup-bonus-title" className="text-xl font-extrabold text-stone-900 dark:text-stone-100">
            Welcome to Alpha Gram!
          </h2>
          <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
            Your 1,000 sign-up bonus coins have been credited to your account.
          </p>

          <div className="clay-card-mint !rounded-2xl mx-auto inline-flex items-center gap-2 px-5 py-2.5">
            <CoinIcon className="w-6 h-6" />
            <span className="text-2xl font-extrabold font-mono-num text-emerald-800 dark:text-emerald-300">
              +{SIGNUP_BONUS_COINS.toLocaleString()} Coins
            </span>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1 space-y-3">
          <div className="clay-inset px-3.5 py-2.5 text-xs text-stone-600 dark:text-stone-300 text-center">
            Use your 1,000 coins in Packs to buy your first chicken and start mining eggs 24/7!
          </div>

          <button
            type="button"
            onClick={onClaim}
            className="clay-btn clay-btn-emerald w-full min-h-[50px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Claim +{SIGNUP_BONUS_COINS.toLocaleString()} Coins</span>
          </button>
        </div>
      </div>
    </div>
  );
}
