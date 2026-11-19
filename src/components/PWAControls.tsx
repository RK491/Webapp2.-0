import { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Alpha Gram app"
        className={`clay-btn clay-btn-emerald flex items-center justify-center gap-1.5 font-extrabold ${
          compact
            ? 'h-10 px-3 rounded-2xl text-xs whitespace-nowrap'
            : 'w-full min-h-[44px] px-4 rounded-2xl text-xs sm:text-sm'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'Install' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install Alpha Gram on iOS"
          className={`clay-btn clay-btn-neutral flex items-center justify-center gap-1.5 font-extrabold text-stone-700 dark:text-stone-200 ${
            compact
              ? 'h-10 px-2.5 rounded-2xl text-xs whitespace-nowrap'
              : 'w-full min-h-[44px] px-4 rounded-2xl text-xs'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{compact ? 'Add' : 'Add to Home Screen'}</span>
        </button>

        {showIOSGuide && (
          <div
            className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
          >
            <div className="animate-clay-modal clay-card w-full max-w-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 id="ios-pwa-title" className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close iOS install instructions"
                  className="clay-btn clay-btn-neutral w-8 h-8 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-300">
                1. Tap the <strong>Share</strong> button in your Safari toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
                <br />
                3. Launch Alpha Gram full-screen anytime!
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="clay-btn clay-btn-amber w-full min-h-[44px] rounded-2xl text-xs font-extrabold"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="clay-card-warm fixed bottom-20 left-4 z-50 flex items-center gap-2 !rounded-2xl px-3.5 py-2 text-xs font-extrabold text-amber-950 dark:text-amber-200 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
      <span>Offline Mode — Cached farm active</span>
    </div>
  );
}
