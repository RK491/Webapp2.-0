import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { formatChannelsHandleSummary, REQUIRED_TELEGRAM_CHANNELS } from '../game/economy';
import type {
  ChannelVerificationItem,
  ChannelVerificationResult,
  RequiredTelegramChannel,
} from '../types/farm';
import { notifyTelegramOpenLink } from '../utils/telegram';

interface ChannelCheckCardProps {
  requiredChannels?: RequiredTelegramChannel[];
  verification?: ChannelVerificationResult | null;
  checking?: boolean;
  checkError?: string | null;
  onCheckChannels: () => void;
  onRetryCheck?: () => void;
  variant?: 'default' | 'compact';
}

function buildFallbackItems(requiredChannels?: RequiredTelegramChannel[]): ChannelVerificationItem[] {
  const source = requiredChannels ?? REQUIRED_TELEGRAM_CHANNELS;
  return source
    .filter((ch) => ch.enabled !== false && Boolean(ch.handle))
    .map((ch) => ({
      ...ch,
      joined: false,
      status: 'unchecked',
    }));
}

function openChannelLink(url: string) {
  if (!url) return;
  const handled = notifyTelegramOpenLink(url);
  if (!handled && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function ChannelCheckCard({
  requiredChannels,
  verification,
  checking = false,
  checkError = null,
  onCheckChannels,
  onRetryCheck,
  variant = 'default',
}: ChannelCheckCardProps) {
  const items =
    verification && verification.channels.length > 0
      ? verification.channels
      : buildFallbackItems(requiredChannels);

  if (items.length === 0) return null;

  const summaryHandles = formatChannelsHandleSummary(items);
  const mode = verification?.verificationMode;
  const allJoined = Boolean(verification?.allJoined);
  const isStrictTelegram = mode === 'telegram_bot';
  const joinedCount = items.filter((item) => item.joined).length;
  const isCompact = variant === 'compact';
  const hasApiOrNetworkItemError = items.some(
    (ch) => !ch.joined && (ch.status === 'api_error' || ch.status === 'network_error'),
  );
  const hasCheckFailure =
    Boolean(checkError) ||
    mode === 'bot_unconfigured' ||
    mode === 'guest_browser' ||
    hasApiOrNetworkItemError ||
    (isStrictTelegram && !allJoined);
  const handleRetry = onRetryCheck ?? onCheckChannels;

  const statusBadge = (() => {
    if (checking && !verification) {
      return {
        label: 'Checking...',
        className:
          'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300',
      };
    }
    if (checkError) {
      return {
        label: 'Check Failed',
        className:
          'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70 text-rose-700 dark:text-rose-300',
      };
    }
    if (!verification) {
      return {
        label: 'Not Checked',
        className:
          'bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300',
      };
    }
    if (allJoined && isStrictTelegram) {
      return {
        label: `${joinedCount}/${items.length} Joined`,
        className:
          'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300',
      };
    }
    if (isStrictTelegram) {
      return {
        label: `${joinedCount}/${items.length} Joined`,
        className:
          'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-700 dark:text-amber-300',
      };
    }
    if (mode === 'guest_browser') {
      return {
        label: 'Open in Telegram',
        className:
          'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300',
      };
    }
    if (mode === 'static_preview') {
      return {
        label: 'Static Preview',
        className:
          'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300',
      };
    }
    return {
      label: mode === 'bot_unconfigured' ? 'Bot Setup Needed' : 'TG Check Ready',
      className:
        'bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/70 text-sky-700 dark:text-sky-300',
    };
  })();

  return (
    <div
      className={`clay-card ${isCompact ? 'p-3.5 space-y-2.5' : 'p-4 space-y-3'} border ${
        allJoined && isStrictTelegram
          ? 'border-emerald-200/80 dark:border-emerald-800/60'
          : 'border-sky-200/80 dark:border-sky-800/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`${
              isCompact ? 'w-9 h-9 rounded-xl' : 'w-10 h-10 rounded-2xl'
            } clay-icon-well flex items-center justify-center shrink-0`}
          >
            {allJoined && isStrictTelegram ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Send className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className={`${isCompact ? 'text-xs' : 'text-sm'} font-extrabold text-stone-900 dark:text-stone-100 truncate`}>
              Required Channels Check
            </div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400 truncate">
              Join {summaryHandles}
            </div>
          </div>
        </div>

        <span
          className={`rounded-lg border px-2 py-0.5 text-[11px] font-extrabold font-mono-num shrink-0 ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((ch) => {
          const isJoined = ch.joined && isStrictTelegram;
          return (
            <div
              key={ch.id}
              className="clay-inset !rounded-xl px-3 py-2 flex items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isJoined ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle
                    className={`w-4 h-4 shrink-0 ${
                      verification && isStrictTelegram
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-sky-600 dark:text-sky-400'
                    }`}
                  />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100 truncate">
                    {ch.handle}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 break-words">
                    {ch.error && ch.status !== 'no_telegram_user'
                      ? ch.error
                      : isStrictTelegram && !isJoined
                        ? 'Not joined yet — tap Join then Check Channels'
                        : ch.title}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isJoined ? (
                  <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 px-2 py-1">
                    Joined
                  </span>
                ) : ch.url ? (
                  <a
                    href={ch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (notifyTelegramOpenLink(ch.url)) {
                        e.preventDefault();
                      }
                    }}
                    className="clay-btn clay-btn-sky min-h-[34px] px-2.5 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1"
                  >
                    <span>Join</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>


      {checkError && (
        <div className="rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 text-[11px] font-semibold text-rose-800 dark:text-rose-300 flex items-center justify-between gap-2">
          <span className="min-w-0 break-words">
            Membership check failed: {checkError}
          </span>
        </div>
      )}

      {verification && mode === 'bot_unconfigured' && (
        <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
          Server bot verification requires TELEGRAM_BOT_TOKEN and adding the bot as an Admin in {summaryHandles}.
        </div>
      )}

      {verification && mode === 'guest_browser' && (
        <div className="rounded-xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-3 py-2 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
          Telegram ID not detected in this browser preview — open via your Telegram Bot Mini App to auto-verify membership.
        </div>
      )}

      {verification && mode === 'static_preview' && (
        <div className="rounded-xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-3 py-2 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
          Static preview host detected (no Node backend on this URL) — tap Join above or open from your Node backend / set Backend Server URL in Admin Panel for live membership verification.
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={checking}
          onClick={() => {
            onCheckChannels();
          }}
          className={`clay-btn flex-1 min-h-[42px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 ${
            allJoined && isStrictTelegram
              ? 'clay-btn-neutral text-emerald-700 dark:text-emerald-300'
              : 'clay-btn-emerald'
          } disabled:opacity-60`}
        >
          {checking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking Channels...</span>
            </>
          ) : allJoined && isStrictTelegram ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Verified · Re-check Channels</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Check Channels</span>
            </>
          )}
        </button>

        {hasCheckFailure && (
          <button
            type="button"
            disabled={checking}
            onClick={() => {
              handleRetry();
            }}
            aria-label="Retry channel membership diagnostic check"
            className="clay-btn clay-btn-amber min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface ChannelCheckModalProps {
  requiredChannels?: RequiredTelegramChannel[];
  verification?: ChannelVerificationResult | null;
  checking?: boolean;
  checkError?: string | null;
  pendingPromoCode?: string | null;
  onCheckChannels: () => void;
  onRetryCheck?: () => void;
  onClose: () => void;
}

export function ChannelCheckModal({
  requiredChannels,
  verification,
  checking = false,
  checkError = null,
  pendingPromoCode = null,
  onCheckChannels,
  onRetryCheck,
  onClose,
}: ChannelCheckModalProps) {
  const items =
    verification && verification.channels.length > 0
      ? verification.channels
      : buildFallbackItems(requiredChannels);
  const mode = verification?.verificationMode;
  const isStrictTelegram = mode === 'telegram_bot';
  const allJoined = Boolean(verification?.allJoined);
  const hasApiOrNetworkItemError = items.some(
    (ch) => !ch.joined && (ch.status === 'api_error' || ch.status === 'network_error'),
  );
  const hasCheckFailure =
    Boolean(checkError) ||
    mode === 'bot_unconfigured' ||
    mode === 'guest_browser' ||
    hasApiOrNetworkItemError ||
    (isStrictTelegram && !allJoined);
  const handleRetry = onRetryCheck ?? onCheckChannels;
  const canDismissFreely = !isStrictTelegram || allJoined || Boolean(pendingPromoCode);

  return (
    <div
      className="animate-clay-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-gate-title"
    >
      <div className="animate-clay-modal clay-card w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl clay-icon-well flex items-center justify-center shrink-0">
              <Send className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <h2 id="channel-gate-title" className="text-base font-extrabold text-stone-900 dark:text-stone-100">
                {pendingPromoCode ? 'Join Channels to Unlock Gift' : 'Join Official Channels'}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {pendingPromoCode
                  ? `Join all required channels below, then tap Check Channels to claim ${pendingPromoCode}.`
                  : 'Subscribe to required channels to unlock full rewards & payouts'}
              </p>
            </div>
          </div>

          {canDismissFreely && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close channel check modal"
              className="clay-btn clay-btn-neutral w-9 h-9 rounded-xl flex items-center justify-center text-stone-600 dark:text-stone-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {items.map((ch) => {
            const isJoined = ch.joined && isStrictTelegram;
            return (
              <div
                key={ch.id}
                className="clay-inset !rounded-2xl p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isJoined ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Send className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 truncate">
                      {ch.handle}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 break-words">
                      {ch.error && ch.status !== 'no_telegram_user'
                        ? ch.error
                        : isStrictTelegram && !isJoined
                          ? 'Not joined yet — tap Join then Check Channels'
                          : ch.description}
                    </div>
                  </div>
                </div>

                {isJoined ? (
                  <span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-2.5 py-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 shrink-0">
                    Joined
                  </span>
                ) : ch.url ? (
                  <button
                    type="button"
                    onClick={() => openChannelLink(ch.url)}
                    className="clay-btn clay-btn-sky min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1 shrink-0"
                  >
                    <span>Join</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {checkError && (
          <div className="rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-2 text-[11px] font-semibold text-rose-800 dark:text-rose-300">
            Membership check failed: {checkError}
          </div>
        )}

        {verification?.verificationMode === 'bot_unconfigured' && (
          <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            Bot verification requires TELEGRAM_BOT_TOKEN on the server and adding the bot as an Admin in each channel.
          </div>
        )}

        {verification?.verificationMode === 'guest_browser' && (
          <div className="rounded-xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-3 py-2 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
            Open this Mini App inside your Telegram Bot so we can verify your Telegram membership automatically.
          </div>
        )}

        {verification?.verificationMode === 'static_preview' && (
          <div className="rounded-xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-3 py-2 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
            Static preview host detected (no Node backend on this URL). Join the channels above and tap Continue or Retry once connected to your Bot backend.
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={checking}
              onClick={() => {
                onCheckChannels();
              }}
              className="clay-btn clay-btn-emerald flex-1 min-h-[46px] rounded-2xl text-sm font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {checking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Membership...</span>
                </>
              ) : allJoined && isStrictTelegram ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verified! Continue</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Check Channels</span>
                </>
              )}
            </button>

            {hasCheckFailure && (
              <button
                type="button"
                disabled={checking}
                onClick={() => {
                  handleRetry();
                }}
                aria-label="Retry channel membership check"
                className="clay-btn clay-btn-amber min-h-[46px] px-4 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
              >
                <RotateCcw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            )}
          </div>

          {canDismissFreely && (
            <button
              type="button"
              onClick={onClose}
              className="clay-btn clay-btn-neutral w-full min-h-[40px] rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300"
            >
              {allJoined ? 'Close' : pendingPromoCode ? 'Cancel' : 'Continue for now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
