import {
  DEFAULT_TELEGRAM_BOT_USERNAME,
  DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME,
  normalizeTelegramBotUsername,
  normalizeTelegramMiniAppShortName,
} from './telegram';

export interface ShareNavigatorLike {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  };
}

export type ShareReferralOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export function getReferralStartId(
  uid?: string | null,
  fallbackReferralCode?: string | null,
): string {
  const cleanUid = String(uid || '').trim();
  if (cleanUid) {
    const tgMatch = cleanUid.match(/^tg_(\d{4,20})$/i);
    if (tgMatch) {
      return tgMatch[1];
    }
    if (/^[a-zA-Z0-9_-]{3,64}$/.test(cleanUid)) {
      return cleanUid;
    }
  }
  return String(fallbackReferralCode || '').trim();
}

export function buildPersonalReferralUrl(
  referralIdOrCode: string,
  options?: {
    botUsername?: string;
    appShortName?: string;
  },
): string {
  const botUsername =
    normalizeTelegramBotUsername(options?.botUsername) || DEFAULT_TELEGRAM_BOT_USERNAME;
  const appShortName =
    options?.appShortName !== undefined
      ? normalizeTelegramMiniAppShortName(options.appShortName)
      : DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME;

  const baseUrl = appShortName
    ? `https://t.me/${botUsername}/${appShortName}`
    : `https://t.me/${botUsername}`;
  const cleanParam = String(referralIdOrCode || '').trim();
  if (!cleanParam) {
    return baseUrl;
  }
  return `${baseUrl}?startapp=${encodeURIComponent(cleanParam)}`;
}

export function buildReferralShareData(
  _referralCode: string,
  referralUrl: string,
  referrerName?: string,
): ShareData {
  const cleanName = (referrerName || '').trim();
  const possessiveOwner = cleanName ? `${cleanName}'s` : 'my';

  return {
    title: 'Join Alpha Gram!',
    text: [
      `🐔✨ Join ${possessiveOwner} Alpha Gram farm and claim +1,000 sign-up bonus coins! (+100 EXTRA referral welcome coins inside)`,
      '',
      '🥚 Hatch hens & collect fresh eggs 24/7 (even offline)',
      '🔥 Charge Coop Fever up to 3× laying speed',
      '💎 Swap eggs into real GRAM tokens directly on TON',
    ].join('\n'),
    url: referralUrl,
  };
}

export function buildTelegramDirectShareUrl(
  referralUrl: string,
  referralCode: string,
  referrerName?: string,
): string {
  const shareData = buildReferralShareData(referralCode, referralUrl, referrerName);
  const fullMessage = `${shareData.text || ''}\n\n👇 Tap below to open Alpha Gram & claim +1,100 bonus coins:\n${referralUrl}`;
  return `https://t.me/share/url?text=${encodeURIComponent(fullMessage)}`;
}

export function openTelegramForwardShare(
  referralUrl: string,
  referrerName?: string,
): boolean {
  const shareUrl = buildTelegramDirectShareUrl(referralUrl, '', referrerName);
  if (typeof window === 'undefined') return false;

  const tgOpen = (
    window as unknown as {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } };
    }
  ).Telegram?.WebApp?.openTelegramLink;

  if (typeof tgOpen === 'function') {
    try {
      tgOpen(shareUrl);
      return true;
    } catch {
      // Fall through to anchor navigation
    }
  }

  if (typeof document !== 'undefined' && document.body && typeof document.createElement === 'function') {
    try {
      const anchor = document.createElement('a');
      anchor.href = shareUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function copyTextWithFallback(
  text: string,
  nav?: ShareNavigatorLike,
): Promise<boolean> {
  const targetNav = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  if (targetNav?.clipboard && typeof targetNav.clipboard.writeText === 'function') {
    try {
      await targetNav.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy textarea copy inside restricted iframes
    }
  }

  if (typeof document !== 'undefined' && document.body && typeof document.createElement === 'function') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function shareReferralLink(params: {
  referralCode: string;
  referralUrl: string;
  referrerName?: string;
  nav?: ShareNavigatorLike;
}): Promise<ShareReferralOutcome> {
  const targetNav = params.nav ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const shareData = buildReferralShareData(
    params.referralCode,
    params.referralUrl,
    params.referrerName,
  );

  if (targetNav && typeof targetNav.share === 'function') {
    let canAttemptShare = true;
    if (typeof targetNav.canShare === 'function') {
      try {
        canAttemptShare = targetNav.canShare(shareData);
      } catch {
        canAttemptShare = true;
      }
    }

    if (canAttemptShare) {
      try {
        await targetNav.share(shareData);
        return 'shared';
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return 'cancelled';
        }
        if (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError') {
          return 'cancelled';
        }
        // Other Web Share errors (e.g., NotAllowedError in iframes) fall back to clipboard copy
      }
    }
  }

  const copied = await copyTextWithFallback(params.referralUrl, targetNav);
  return copied ? 'copied' : 'failed';
}
