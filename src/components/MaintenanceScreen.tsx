import { RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { extractTelegramNumericUserId, PRIMARY_ADMIN_TELEGRAM_ID } from '../game/economy';
import type { MaintenanceConfig } from '../types/farm';

interface MaintenanceScreenProps {
  config: MaintenanceConfig;
  playerId: string;
  isAuthorizedAdmin: boolean;
  onOpenAdminPanel?: () => void;
  onRefresh?: () => void;
}

export function MaintenanceScreen({
  config,
  playerId,
  isAuthorizedAdmin,
  onOpenAdminPanel,
  onRefresh,
}: MaintenanceScreenProps) {
  const adminDisplayId =
    extractTelegramNumericUserId(playerId) || playerId || PRIMARY_ADMIN_TELEGRAM_ID;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-stone-900 dark:text-stone-100">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="clay-card max-w-md w-full overflow-hidden"
      >
        {/* Top Banner */}
        <div className="bg-stone-900 dark:bg-stone-950 border-b border-stone-800 px-5 py-4 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="alpha-brand-crest w-5 h-5 rounded-md text-[10px] font-extrabold inline-flex items-center justify-center shrink-0">
                  αG
                </span>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                  Alpha Gram
                </span>
              </div>
              <h1 className="text-lg font-extrabold tracking-tight truncate mt-0.5">
                {config.title || 'Scheduled Maintenance'}
              </h1>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 border border-amber-400/35 text-[10px] font-extrabold text-amber-200 uppercase tracking-wide shrink-0">
            Offline
          </span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="clay-card-warm !rounded-2xl p-4 space-y-2">
            <p className="text-xs sm:text-sm font-semibold text-stone-800 dark:text-stone-200 leading-relaxed">
              {config.message}
            </p>
          </div>

          <div className="clay-inset !rounded-2xl p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-stone-500 dark:text-stone-400">Status</span>
              <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-700 dark:text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Maintenance in Progress</span>
              </span>
            </div>

            {config.estimatedReturn && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-stone-500 dark:text-stone-400">
                  Estimated Return
                </span>
                <span className="font-extrabold text-stone-900 dark:text-stone-100 text-right">
                  {config.estimatedReturn}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-stone-500 dark:text-stone-400">Account Data</span>
              <span className="font-extrabold text-emerald-700 dark:text-emerald-300">
                100% Safe &amp; Preserved
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onRefresh) {
                onRefresh();
              } else if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
            className="clay-btn clay-btn-neutral w-full min-h-[44px] rounded-2xl font-extrabold text-xs text-stone-800 dark:text-stone-100 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Check Availability</span>
          </button>

          {/* Admin-only Entry Button: strictly hidden from all non-admin users */}
          {isAuthorizedAdmin && onOpenAdminPanel && (
            <div className="pt-2 border-t border-stone-200/80 dark:border-stone-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] px-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin ID Synced</span>
                </span>
                <span className="font-mono-num font-bold text-stone-500 dark:text-stone-400">
                  ID: {adminDisplayId}
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenAdminPanel}
                className="clay-btn clay-btn-emerald w-full min-h-[46px] rounded-2xl font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Open Admin Panel</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
