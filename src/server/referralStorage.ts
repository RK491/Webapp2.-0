import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ReferralData {
  referrals: { [userId: string]: string[] };
  referredBy: { [userId: string]: string };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REFERRALS_STORAGE_FILE = path.resolve(__dirname, '..', '..', '.data', 'referrals.json');

let storage: ReferralData = {
  referrals: {},
  referredBy: {},
};

function loadReferralsFromDisk(): void {
  try {
    if (!fs.existsSync(REFERRALS_STORAGE_FILE)) return;
    const raw = fs.readFileSync(REFERRALS_STORAGE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ReferralData> | null;
    if (!parsed || typeof parsed !== 'object') return;
    const referrals: Record<string, string[]> = {};
    if (parsed.referrals && typeof parsed.referrals === 'object') {
      for (const [referrerId, list] of Object.entries(parsed.referrals)) {
        if (!Array.isArray(list)) continue;
        const cleanReferrer = String(referrerId || '').trim();
        if (!cleanReferrer) continue;
        const deduped = Array.from(
          new Set(
            list
              .map((item) => String(item || '').trim())
              .filter((item) => item && item !== cleanReferrer),
          ),
        );
        if (deduped.length > 0) {
          referrals[cleanReferrer] = deduped;
        }
      }
    }
    const referredBy: Record<string, string> = {};
    if (parsed.referredBy && typeof parsed.referredBy === 'object') {
      for (const [userId, referrerId] of Object.entries(parsed.referredBy)) {
        const cleanUser = String(userId || '').trim();
        const cleanReferrer = String(referrerId || '').trim();
        if (cleanUser && cleanReferrer && cleanUser !== cleanReferrer) {
          referredBy[cleanUser] = cleanReferrer;
        }
      }
    }
    storage = { referrals, referredBy };
  } catch {
    // Non-fatal on corrupt/unreadable storage file
  }
}

function persistReferralsToDisk(): void {
  try {
    const dir = path.dirname(REFERRALS_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REFERRALS_STORAGE_FILE, JSON.stringify(storage), 'utf8');
  } catch {
    // Non-fatal on read-only containers
  }
}

loadReferralsFromDisk();

export function saveReferral(userId: string, referrerId: string): boolean {
  const cleanUserId = String(userId || '').trim();
  const cleanReferrerId = String(referrerId || '').trim();
  if (!cleanUserId || !cleanReferrerId || cleanUserId === cleanReferrerId) {
    return false;
  }

  // Strip tg_ prefix comparison to guard self-referrals across tg_123 vs 123
  const normUser = cleanUserId.replace(/^tg_/, '');
  const normRef = cleanReferrerId.replace(/^tg_/, '');
  if (normUser && normRef && normUser === normRef) {
    return false;
  }

  // Keep existing referrer immutable once set for a given user
  if (storage.referredBy[cleanUserId] && storage.referredBy[cleanUserId] !== cleanReferrerId) {
    return false;
  }

  if (!storage.referrals[cleanReferrerId]) {
    storage.referrals[cleanReferrerId] = [];
  }
  if (!storage.referrals[cleanReferrerId].includes(cleanUserId)) {
    storage.referrals[cleanReferrerId].push(cleanUserId);
  }
  storage.referredBy[cleanUserId] = cleanReferrerId;
  persistReferralsToDisk();
  return true;
}

export function getReferrals(userId: string): string[] {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) return [];
  return [...(storage.referrals[cleanUserId] || [])];
}

export function getReferrer(userId: string): string | null {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) return null;
  return storage.referredBy[cleanUserId] || null;
}

export function getMergedReferralsForUser(userId: string): {
  referrals: string[];
  referrer: string | null;
} {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) {
    return { referrals: [], referrer: null };
  }
  const stripped = cleanUserId.replace(/^tg_/, '');
  const tgVariant = /^\d{4,20}$/.test(stripped) ? `tg_${stripped}` : '';
  const keys = Array.from(new Set([cleanUserId, stripped, tgVariant].filter(Boolean)));

  const referralsSet = new Set<string>();
  for (const key of keys) {
    for (const r of storage.referrals[key] || []) {
      referralsSet.add(r);
    }
  }

  let referrer: string | null = null;
  for (const key of keys) {
    if (storage.referredBy[key]) {
      referrer = storage.referredBy[key];
      break;
    }
  }

  return {
    referrals: Array.from(referralsSet),
    referrer,
  };
}

export function resetReferralStorage(): void {
  storage = {
    referrals: {},
    referredBy: {},
  };
  persistReferralsToDisk();
}
