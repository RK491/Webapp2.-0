import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import clayHenMascot from '../assets/images/clay_hen_mascot_1794678825872.jpg';
import { ChickenSprite, CoinIcon, EggIcon } from './GameIcons';

interface SplashScreenProps {
  onComplete: () => void;
  displayDurationMs?: number;
  fadeDurationMs?: number;
}

export function SplashScreen({
  onComplete,
  displayDurationMs = 2000,
  fadeDurationMs = 550,
}: SplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    };

    const fadeTimer = window.setTimeout(() => {
      setIsFadingOut(true);
    }, displayDurationMs);

    const completeTimer = window.setTimeout(finish, displayDurationMs + fadeDurationMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(completeTimer);
    };
  }, [displayDurationMs, fadeDurationMs, onComplete]);

  return (
    <div
      role="status"
      aria-label="Loading Alpha Gram"
      onAnimationEnd={(e) => {
        if (isFadingOut && e.target === e.currentTarget && !completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
      }}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#F7F6F2] via-[#FAF8F2] to-[#FEF3C7] dark:from-[#0F1115] dark:via-[#14171D] dark:to-[#1C1914] px-6 select-none ${
        isFadingOut ? 'animate-splash-fade-out pointer-events-none' : ''
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="clay-card p-7 flex flex-col items-center text-center max-w-xs w-full space-y-5"
      >
        <div className="relative flex items-center justify-center animate-clay-float">
          <div className="w-32 h-32 rounded-[2.2rem] clay-card-warm p-2 flex items-center justify-center overflow-hidden">
            {!imgFailed ? (
              <img
                src={clayHenMascot}
                alt="Sculpted clay Alpha Gram hen mascot with golden coin and egg"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover rounded-[1.7rem]"
              />
            ) : (
              <ChickenSprite breed="leghorn" className="w-20 h-20 animate-chicken-bob" />
            )}
          </div>
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.16, type: 'spring', stiffness: 280, damping: 18 }}
            className="animate-alpha-orbit absolute -top-2.5 -right-2.5 w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center"
          >
            <EggIcon className="w-6 h-6" />
          </motion.div>
          <motion.div
            initial={{ scale: 0, rotate: 20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.24, type: 'spring', stiffness: 280, damping: 18 }}
            className="animate-alpha-orbit absolute -bottom-2.5 -left-2.5 w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center"
            style={{ animationDelay: '0.7s' }}
          >
            <CoinIcon className="w-6 h-6" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35 }}
          className="space-y-1.5"
        >
          <div className="inline-flex items-center justify-center gap-2">
            <span className="alpha-brand-crest w-7 h-7 rounded-xl text-xs font-extrabold flex items-center justify-center tracking-tight">
              αG
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-100">
              Alpha Gram
            </h1>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Poultry &amp; GRAM Economy
          </p>
        </motion.div>

        <div className="w-48 space-y-2">
          <div className="h-3 w-full rounded-full clay-inset p-0.5 overflow-hidden">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-amber-500 animate-splash-progress clay-shimmer-bar" />
          </div>
          <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            Preparing your Alpha Gram coop &amp; eggs...
          </p>
        </div>
      </motion.div>
    </div>
  );
}
