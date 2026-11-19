import type { AdConfig, AdNetworkId } from '../types/farm';

interface AdsgramController {
  show: () => Promise<{ done?: boolean; description?: string; error?: boolean }>;
}

declare global {
  interface Window {
    Adsgram?: {
      init: (opts: { blockId: string }) => AdsgramController;
    };
    showGiga?: () => Promise<unknown>;
    [key: string]: unknown;
  }
}

export const AD_NETWORK_ORDER: readonly AdNetworkId[] = ['adsgram', 'gigapub', 'monetag'];
export const DEFAULT_AD_COOLDOWN_MS = 60_000;
export const DEFAULT_AD_SKIP_COOLDOWN_MS = 15_000;
const AD_COOLDOWN_STORAGE_KEY = 'alphagram_ad_cooldowns_v1';

const memoryCooldowns: Record<AdNetworkId, number> = {
  adsgram: 0,
  gigapub: 0,
  monetag: 0,
};

export interface AdExecutionResult {
  handled: boolean;
  rewarded: boolean;
  network?: AdNetworkId;
  message?: string;
}

export function getAdNetworkDisplayName(network: AdNetworkId): string {
  if (network === 'adsgram') return 'AdsGram';
  if (network === 'gigapub') return 'Gigapub';
  return 'Monetag';
}

function readCooldownsFromStorage(): Record<AdNetworkId, number> {
  const next: Record<AdNetworkId, number> = { ...memoryCooldowns };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(AD_COOLDOWN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<AdNetworkId, unknown>>;
        for (const id of AD_NETWORK_ORDER) {
          const val = Number(parsed[id] ?? 0);
          if (Number.isFinite(val) && val > next[id]) {
            next[id] = val;
          }
        }
      }
    }
  } catch {
    // ignore storage access issues
  }
  return next;
}

function writeCooldownToStorage(network: AdNetworkId, untilMs: number): void {
  memoryCooldowns[network] = untilMs;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const current = readCooldownsFromStorage();
      current[network] = untilMs;
      window.localStorage.setItem(AD_COOLDOWN_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore storage access issues
  }
}

export function getAdNetworkCooldownUntil(network: AdNetworkId): number {
  const map = readCooldownsFromStorage();
  return map[network] || 0;
}

export function getAdNetworkCooldownRemainingMs(
  network: AdNetworkId,
  nowMs: number = Date.now(),
): number {
  const until = getAdNetworkCooldownUntil(network);
  return Math.max(0, until - nowMs);
}

export function isAdNetworkOnCooldown(
  network: AdNetworkId,
  nowMs: number = Date.now(),
): boolean {
  return getAdNetworkCooldownRemainingMs(network, nowMs) > 0;
}

export function setAdNetworkCooldown(
  network: AdNetworkId,
  durationMs: number = DEFAULT_AD_COOLDOWN_MS,
  nowMs: number = Date.now(),
): number {
  const safeDuration = Math.max(0, Math.round(durationMs));
  const untilMs = safeDuration > 0 ? nowMs + safeDuration : 0;
  writeCooldownToStorage(network, untilMs);
  return untilMs;
}

export function clearAdNetworkCooldowns(): void {
  for (const id of AD_NETWORK_ORDER) {
    memoryCooldowns[id] = 0;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(AD_COOLDOWN_STORAGE_KEY);
    }
  } catch {
    // ignore storage access issues
  }
}

function getClientEnvVar(key: string): string {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
    return (meta?.env?.[key] || '').trim();
  } catch {
    return '';
  }
}

export function resolveEffectiveAdConfig(config: AdConfig): AdConfig {
  return {
    ...config,
    adsgramBlockId: config.adsgramBlockId.trim() || getClientEnvVar('VITE_ADSGRAM_BLOCK_ID'),
    adsgramTaskBlockId:
      (config.adsgramTaskBlockId || '').trim() || getClientEnvVar('VITE_ADSGRAM_TASK_BLOCK_ID'),
    gigapubProjectId:
      (config.gigapubProjectId || '').trim() || getClientEnvVar('VITE_GIGAPUB_PROJECT_ID'),
    monetagZoneId: config.monetagZoneId.trim() || getClientEnvVar('VITE_MONETAG_ZONE_ID'),
  };
}

export function hasConfiguredAdsgramTaskSdk(config: AdConfig): boolean {
  const effective = resolveEffectiveAdConfig(config);
  return Boolean(effective.adsgramTaskBlockId || effective.adsgramBlockId);
}

export function hasConfiguredAdNetworkSdk(network: AdNetworkId, config: AdConfig): boolean {
  const effective = resolveEffectiveAdConfig(config);
  if (network === 'adsgram') return Boolean(effective.adsgramBlockId);
  if (network === 'gigapub') return Boolean(effective.gigapubProjectId);
  return Boolean(effective.monetagZoneId);
}

export function isExternalAdNetworkProvider(
  provider: AdConfig['provider'],
): provider is AdNetworkId {
  return provider === 'adsgram' || provider === 'gigapub' || provider === 'monetag';
}

export function getOrderedConfiguredAdNetworks(
  config: AdConfig,
  preferredNetwork?: AdNetworkId,
): AdNetworkId[] {
  const effective = resolveEffectiveAdConfig(config);
  const preferred =
    preferredNetwork ??
    (isExternalAdNetworkProvider(effective.provider) ? effective.provider : undefined);
  const ordered = preferred
    ? [preferred, ...AD_NETWORK_ORDER.filter((n) => n !== preferred)]
    : [...AD_NETWORK_ORDER];
  return ordered.filter((n) => hasConfiguredAdNetworkSdk(n, effective));
}

export function selectAvailableAdNetworks(
  config: AdConfig,
  nowMs: number = Date.now(),
  preferredNetwork?: AdNetworkId,
): AdNetworkId[] {
  return getOrderedConfiguredAdNetworks(config, preferredNetwork).filter(
    (network) => !isAdNetworkOnCooldown(network, nowMs),
  );
}

function isExternalAdCompleted(result: unknown): boolean {
  if (result === false) return false;
  if (typeof result === 'object' && result !== null) {
    const rec = result as { done?: unknown; error?: unknown };
    if (rec.error === true) return false;
    if (rec.done === false) return false;
  }
  return true;
}

function loadScriptOnce(id: string, src: string, attrs?: Record<string, string>): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('No document available'));
  }
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing) {
    if (existing.dataset.loaded === '1') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Ad SDK failed to load')), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        script.setAttribute(k, v);
      }
    }
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error('Ad SDK failed to load'));
    document.head.appendChild(script);
  });
}

async function runSingleAdNetworkSdk(
  network: AdNetworkId,
  effective: AdConfig,
): Promise<AdExecutionResult> {
  if (network === 'adsgram' && effective.adsgramBlockId) {
    try {
      await loadScriptOnce('adsgram-sdk', 'https://sad.adsgram.ai/js/sad.min.js');
      if (window.Adsgram) {
        const controller = window.Adsgram.init({ blockId: effective.adsgramBlockId });
        const result = await controller.show();
        return {
          handled: true,
          rewarded: result?.done === true && result?.error !== true,
          network: 'adsgram',
        };
      }
      return {
        handled: false,
        rewarded: false,
        network: 'adsgram',
        message: 'AdsGram SDK unavailable in this browser — using verified timer ad.',
      };
    } catch {
      return {
        handled: false,
        rewarded: false,
        network: 'adsgram',
        message: 'AdsGram SDK unavailable in this browser — using verified timer ad.',
      };
    }
  }

  if (network === 'gigapub' && effective.gigapubProjectId) {
    const projectId = effective.gigapubProjectId.replace(/[^a-zA-Z0-9_-]/g, '');
    try {
      await loadScriptOnce(
        `gigapub-sdk-${projectId}`,
        `https://ad.gigapub.tech/script?id=${encodeURIComponent(projectId)}`,
      );
      if (typeof window.showGiga === 'function') {
        const result = await window.showGiga();
        return {
          handled: true,
          rewarded: isExternalAdCompleted(result),
          network: 'gigapub',
        };
      }
      return {
        handled: false,
        rewarded: false,
        network: 'gigapub',
        message: 'Gigapub SDK unavailable in this browser — using verified timer ad.',
      };
    } catch {
      return {
        handled: false,
        rewarded: false,
        network: 'gigapub',
        message: 'Gigapub SDK unavailable in this browser — using verified timer ad.',
      };
    }
  }

  if (network === 'monetag' && effective.monetagZoneId) {
    const zoneId = effective.monetagZoneId.replace(/[^a-zA-Z0-9_-]/g, '');
    const fnName = `show_${zoneId}`;
    try {
      await loadScriptOnce(`monetag-sdk-${zoneId}`, '//libtl.com/sdk.js', {
        'data-zone': zoneId,
        'data-sdk': fnName,
      });
      const showFn = window[fnName];
      if (typeof showFn === 'function') {
        const result = await (showFn as () => Promise<unknown>)();
        return {
          handled: true,
          rewarded: isExternalAdCompleted(result),
          network: 'monetag',
        };
      }
      return {
        handled: false,
        rewarded: false,
        network: 'monetag',
        message: 'Monetag SDK blocked or unavailable — using verified timer ad.',
      };
    } catch {
      return {
        handled: false,
        rewarded: false,
        network: 'monetag',
        message: 'Monetag SDK blocked or unavailable — using verified timer ad.',
      };
    }
  }

  return { handled: false, rewarded: false, network };
}

async function runRotatingAdNetworks(
  effective: AdConfig,
  preferredNetwork?: AdNetworkId,
): Promise<AdExecutionResult> {
  const now = Date.now();
  const configured = getOrderedConfiguredAdNetworks(effective, preferredNetwork);
  if (configured.length === 0) {
    return { handled: false, rewarded: false };
  }

  const ready = configured.filter((network) => !isAdNetworkOnCooldown(network, now));
  if (ready.length === 0) {
    const soonestRemainingSec = Math.max(
      1,
      Math.ceil(
        Math.min(...configured.map((network) => getAdNetworkCooldownRemainingMs(network, now))) /
          1000,
      ),
    );
    return {
      handled: false,
      rewarded: false,
      message: `All external ad sites are on cooldown (${soonestRemainingSec}s) — using verified timer ad.`,
    };
  }

  let lastMessage: string | undefined;
  for (const candidate of ready) {
    const res = await runSingleAdNetworkSdk(candidate, effective);
    if (res.handled) {
      setAdNetworkCooldown(
        candidate,
        res.rewarded ? DEFAULT_AD_COOLDOWN_MS : DEFAULT_AD_SKIP_COOLDOWN_MS,
      );
      const rotatedNotice =
        preferredNetwork && candidate !== preferredNetwork && res.rewarded
          ? `${getAdNetworkDisplayName(preferredNetwork)} is on cooldown — served via ${getAdNetworkDisplayName(candidate)}.`
          : undefined;
      return {
        handled: true,
        rewarded: res.rewarded,
        network: candidate,
        message: rotatedNotice ?? res.message,
      };
    }

    // Mark network on cooldown on failure/no-fill so next configured site runs right away
    setAdNetworkCooldown(candidate, DEFAULT_AD_COOLDOWN_MS);
    if (res.message) {
      lastMessage = res.message;
    }
  }

  return {
    handled: false,
    rewarded: false,
    message:
      lastMessage ?? 'External ad networks unavailable right now — using verified timer ad.',
  };
}

export async function tryRunAdNetwork(
  network: AdNetworkId,
  config: AdConfig,
): Promise<AdExecutionResult> {
  const effective = resolveEffectiveAdConfig(config);
  return runRotatingAdNetworks(effective, network);
}

export async function tryRunAdsgramTaskAd(
  config: AdConfig,
): Promise<AdExecutionResult> {
  const effective = resolveEffectiveAdConfig(config);
  const blockId = (effective.adsgramTaskBlockId || effective.adsgramBlockId || '').trim();
  if (!blockId) {
    return {
      handled: false,
      rewarded: false,
      network: 'adsgram',
      message: 'Complete the bot join / click offer below to claim your reward.',
    };
  }

  try {
    await loadScriptOnce('adsgram-sdk', 'https://sad.adsgram.ai/js/sad.min.js');
    if (window.Adsgram) {
      const controller = window.Adsgram.init({ blockId });
      const result = await controller.show();
      return {
        handled: true,
        rewarded: result?.done === true && result?.error !== true,
        network: 'adsgram',
      };
    }
  } catch {
    // Fallback to verified bot-join click modal below
  }

  return {
    handled: false,
    rewarded: false,
    network: 'adsgram',
    message: 'AdsGram task SDK unavailable in this browser — using verified bot-join offer.',
  };
}

export async function tryRunExternalRewardedAd(
  config: AdConfig,
): Promise<AdExecutionResult> {
  const effective = resolveEffectiveAdConfig(config);
  if (isExternalAdNetworkProvider(effective.provider)) {
    return runRotatingAdNetworks(effective, effective.provider);
  }
  return { handled: false, rewarded: false };
}
