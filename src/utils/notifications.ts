export type BrowserNotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const NOTIFY_PREF_KEY = 'chickenland_basket_notify_v1';
const LAST_NOTIFIED_CYCLE_KEY = 'chickenland_last_notified_cycle_v1';

export function calculateMsUntilBasketFull(params: {
  productionRatePerHour: number;
  basketCapacity: number;
  lastCollectedAt: number;
  nowMs: number;
}): number | null {
  if (params.productionRatePerHour <= 0 || params.basketCapacity <= 0) {
    return null;
  }
  const fillDurationMs = Math.ceil((params.basketCapacity / params.productionRatePerHour) * 3_600_000);
  const fullAtMs = params.lastCollectedAt + fillDurationMs;
  return Math.max(0, fullAtMs - params.nowMs);
}

export function shouldTriggerBasketFullNotification(params: {
  pendingEggs: number;
  basketCapacity: number;
  lastCollectedAt: number;
  lastNotifiedCollectedAt: number | null;
  isBackgrounded: boolean;
  notificationsEnabled: boolean;
  permission: BrowserNotificationPermission;
}): boolean {
  if (!params.notificationsEnabled) return false;
  if (params.permission !== 'granted') return false;
  if (!params.isBackgrounded) return false;
  if (params.basketCapacity <= 0) return false;
  if (params.pendingEggs < params.basketCapacity) return false;
  if (params.lastNotifiedCollectedAt === params.lastCollectedAt) return false;
  return true;
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return window.Notification.permission as BrowserNotificationPermission;
}

export function isDocumentBackgrounded(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden' || !document.hasFocus();
}

export function getBasketNotificationPreference(): boolean {
  const perm = getBrowserNotificationPermission();
  if (perm !== 'granted') return false;
  try {
    const stored = localStorage.getItem(NOTIFY_PREF_KEY);
    if (stored === '0' || stored === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setBasketNotificationPreference(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFY_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

export function getStoredLastNotifiedCycle(): number | null {
  try {
    const raw = localStorage.getItem(LAST_NOTIFIED_CYCLE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredLastNotifiedCycle(lastCollectedAt: number): void {
  try {
    localStorage.setItem(LAST_NOTIFIED_CYCLE_KEY, String(lastCollectedAt));
  } catch {
    // Ignore storage errors
  }
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  try {
    const result = await window.Notification.requestPermission();
    if (result === 'granted') {
      setBasketNotificationPreference(true);
    }
    return result as BrowserNotificationPermission;
  } catch {
    return getBrowserNotificationPermission();
  }
}

export function dispatchBasketFullNotification(params: {
  pendingEggs: number;
  basketCapacity: number;
  onClick?: () => void;
}): boolean {
  if (getBrowserNotificationPermission() !== 'granted') return false;
  try {
    const notification = new window.Notification('Egg Basket Full! Collect Your Eggs', {
      body: `Your basket reached ${params.pendingEggs.toLocaleString()}/${params.basketCapacity.toLocaleString()} eggs. Open Alpha Gram to collect and keep laying!`,
      tag: 'chickenland-basket-full',
    });
    notification.onclick = () => {
      try {
        window.focus();
        notification.close();
      } catch {
        // Ignore focus errors
      }
      params.onClick?.();
    };
    return true;
  } catch {
    return false;
  }
}
