import { useState } from 'react';
import { EggIcon } from './GameIcons';
import clayEggBasketHero from '../assets/images/clay_egg_basket_1794678826026.jpg';

interface WelcomeBackModalProps {
  pendingEggs: number;
  awayLabel: string;
  onCollect: () => void;
  onDismiss: () => void;
  headingText: string;
  collectLabel: string;
}

export function WelcomeBackModal({
  pendingEggs,
  awayLabel,
  onCollect,
  onDismiss,
  headingText,
  collectLabel,
}: WelcomeBackModalProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-back-title"
    >
      <div className="animate-clay-modal clay-card w-full max-w-sm p-6 text-center">
        <h2 id="welcome-back-title" className="text-2xl font-extrabold text-amber-950 dark:text-amber-100 tracking-tight">
          {headingText}
        </h2>
        <p className="mt-1.5 text-sm font-medium text-stone-600 dark:text-stone-300">
          In <span className="font-bold text-stone-800 dark:text-stone-100">{awayLabel}</span> your hens laid{' '}
          <span className="font-bold text-amber-700 dark:text-amber-400 font-mono-num">{pendingEggs.toLocaleString()}</span> eggs.
        </p>

        <div className="my-5 flex items-center justify-center">
          <div className="animate-clay-float clay-card-warm relative w-40 h-40 !rounded-full p-2 flex items-center justify-center overflow-hidden">
            {!imgFailed ? (
              <img
                src={clayEggBasketHero}
                alt="Hand-sculpted clay basket full of pastel farm fresh eggs"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <EggIcon className="w-20 h-20" />
            )}
          </div>
        </div>

        <div className="clay-inset mx-auto mb-5 w-48 px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <EggIcon className="w-7 h-7" />
            <span className="text-2xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
              +{pendingEggs.toLocaleString()}
            </span>
          </div>
          <div className="mt-0.5 text-xs font-semibold text-stone-500 dark:text-stone-400">Eggs ready</div>
        </div>

        <button
          type="button"
          data-start="true"
          onClick={onCollect}
          className="clay-btn clay-btn-amber w-full min-h-[50px] rounded-2xl px-6 py-3 text-base font-extrabold flex items-center justify-center gap-2"
        >
          <EggIcon className="w-5 h-5" />
          <span>{collectLabel}</span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 py-1.5 px-4 rounded-xl cursor-pointer transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
