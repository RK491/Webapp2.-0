import {
  DEFAULT_GRAM_JETTON_MASTER,
  gramToCoins,
  GRAM_USD_PRICE,
  MAX_DEPOSIT_COINS,
  MIN_DEPOSIT_COINS,
} from './economy.ts';

export interface DetectedGramTransfer {
  txHash: string;
  gramAmount: number;
  coinsToCredit: number;
  usdAmount: number;
  comment: string;
  timestampMs: number;
}

export function extractTelegramNumericId(uid: string): string {
  const match = uid.trim().match(/^tg_(\d{4,20})$/i);
  return match ? match[1] : '';
}

export function getPrimaryDepositMemo(uid: string): string {
  const tgId = extractTelegramNumericId(uid);
  if (tgId) return tgId;
  return uid.trim();
}

export function buildAcceptedDepositMemos(
  uid: string,
  extraMemos: string[] = [],
): string[] {
  const set = new Set<string>();
  const add = (val: string) => {
    const clean = val.trim();
    if (clean.length >= 4) {
      set.add(clean);
    }
  };
  const tgId = extractTelegramNumericId(uid);
  if (tgId) add(tgId);
  add(uid);
  for (const extra of extraMemos) {
    add(extra);
  }
  return Array.from(set);
}

export function matchMemoComment(comment: string, acceptedMemos: string[]): boolean {
  const cleanComment = comment.trim().toUpperCase();
  if (!cleanComment) return false;
  const tokens = cleanComment.split(/[^A-Z0-9_-]+/).filter(Boolean);
  for (const rawMemo of acceptedMemos) {
    const memoUpper = rawMemo.trim().toUpperCase();
    if (memoUpper.length < 4) continue;
    if (cleanComment === memoUpper) return true;
    if (tokens.includes(memoUpper)) return true;
    // Allow substring match for structured CL-XXXXXX codes or tg_ prefixed IDs
    if ((memoUpper.startsWith('CL-') || memoUpper.startsWith('TG_')) && cleanComment.includes(memoUpper)) {
      return true;
    }
  }
  return false;
}

export type RejectedGramTransferReason =
  | 'pending'
  | 'spam'
  | 'fake_token'
  | 'below_min'
  | 'above_max';

export interface RejectedGramTransfer {
  txHash: string;
  reason: RejectedGramTransferReason;
  coins?: number;
}

export interface TonApiEventAction {
  type?: string;
  status?: string;
  JettonTransfer?: {
    amount?: string;
    comment?: string;
    recipient?: { address?: string; is_scam?: boolean };
    sender?: { address?: string; is_scam?: boolean };
    jetton?: {
      address?: string;
      symbol?: string;
      decimals?: number;
      verification?: string;
    };
  };
}

export interface TonApiEvent {
  event_id?: string;
  in_progress?: boolean;
  is_scam?: boolean;
  timestamp?: number;
  actions?: TonApiEventAction[];
}

export const OFFICIAL_GRAM_RAW_MASTER =
  '0:b8ef4f77a17e5785bd31ba4da50abd91852f2b8febee97ad6ee16d941f939198';

function crc16Ccitt(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

function decodeBase64Bytes(input: string): Uint8Array | null {
  const clean = input.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!clean || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=');
  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function friendlyTonAddressToRaw(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (/^-?\d+:[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const bytes = decodeBase64Bytes(trimmed);
  if (!bytes || bytes.length !== 36) return null;

  const expectedCrc = crc16Ccitt(bytes.subarray(0, 34));
  const actualCrc = (bytes[34] << 8) | bytes[35];
  if (expectedCrc !== actualCrc) return null;

  const workchain = bytes[1] === 0xff ? -1 : bytes[1];
  let hex = '';
  for (let i = 2; i < 34; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `${workchain}:${hex}`;
}

export function normalizeTonAddress(address: string): string {
  const raw = friendlyTonAddressToRaw(address);
  return raw || address.trim().toLowerCase();
}

export function normalizeTxHash(hash: string): string {
  const trimmed = hash.trim();
  if (!trimmed) return '';
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const bytes = decodeBase64Bytes(trimmed);
  if (bytes && bytes.length === 32) {
    let hex = '';
    for (let i = 0; i < 32; i += 1) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
  return trimmed.toLowerCase();
}

export function buildGramTransferUrl(params: {
  depositAddress: string;
  jettonMaster?: string;
  gramAmount: number;
  memo: string;
  scheme?: 'ton' | 'tonkeeper';
}): string {
  const address = params.depositAddress.trim();
  const jetton = (params.jettonMaster || DEFAULT_GRAM_JETTON_MASTER).trim();
  const nanoUnits = Math.max(1, Math.round(Math.max(0, params.gramAmount) * 1e9));
  const cleanMemo = params.memo.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const prefix =
    params.scheme === 'tonkeeper'
      ? `https://app.tonkeeper.com/transfer/${encodeURIComponent(address)}`
      : `ton://transfer/${encodeURIComponent(address)}`;
  const query = new URLSearchParams({
    jetton,
    amount: String(nanoUnits),
  });
  if (cleanMemo) {
    query.set('text', cleanMemo);
  }
  return `${prefix}?${query.toString()}`;
}

function buildClaimedSet(hashes?: string[]): Set<string> {
  const set = new Set<string>();
  for (const h of hashes || []) {
    const trimmed = h.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
    const normalized = normalizeTxHash(h);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function matchGramTransfersFromTonApiEvents(params: {
  events: TonApiEvent[];
  rawDepositAddress: string;
  memo: string;
  acceptedMemos?: string[];
  claimedTxHashes?: string[];
  gramJettonRawOrFriendly?: string;
  onRejected?: (info: RejectedGramTransfer) => void;
}): DetectedGramTransfer[] {
  const claimedSet = buildClaimedSet(params.claimedTxHashes);
  const memoCandidates = Array.from(
    new Set(
      [params.memo, ...(params.acceptedMemos || [])]
        .map((m) => m.trim())
        .filter((m) => m.length >= 4),
    ),
  );
  if (memoCandidates.length === 0) return [];
  const targetRecipient = normalizeTonAddress(params.rawDepositAddress);
  const expectedMaster = params.gramJettonRawOrFriendly
    ? normalizeTonAddress(params.gramJettonRawOrFriendly)
    : OFFICIAL_GRAM_RAW_MASTER;
  const results: DetectedGramTransfer[] = [];

  for (const ev of params.events) {
    if (!ev.event_id) continue;
    const evHash = ev.event_id.trim();
    const evHashNorm = normalizeTxHash(evHash);
    if (claimedSet.has(evHash.toLowerCase()) || claimedSet.has(evHashNorm)) continue;

    if (ev.is_scam) {
      params.onRejected?.({ txHash: evHash, reason: 'spam' });
      continue;
    }

    for (const action of ev.actions || []) {
      if (action.type !== 'JettonTransfer') continue;
      const jt = action.JettonTransfer;
      if (!jt) continue;

      const comment = (jt.comment || '').trim();
      const memoMatched = matchMemoComment(comment, memoCandidates);

      // Verify exact recipient address before anything else
      const recipientAddr = normalizeTonAddress(jt.recipient?.address || '');
      if (!targetRecipient || !recipientAddr || recipientAddr !== targetRecipient) continue;

      if (ev.in_progress) {
        if (memoMatched) {
          params.onRejected?.({ txHash: evHash, reason: 'pending' });
        }
        continue;
      }

      if (action.status !== 'ok') continue;

      if (
        jt.sender?.is_scam ||
        jt.recipient?.is_scam ||
        jt.jetton?.verification === 'blacklist'
      ) {
        if (memoMatched) {
          params.onRejected?.({ txHash: evHash, reason: 'spam' });
        }
        continue;
      }

      const jettonAddr = normalizeTonAddress(jt.jetton?.address || '');
      const isOfficialGram =
        Boolean(jettonAddr) &&
        (jettonAddr === OFFICIAL_GRAM_RAW_MASTER ||
          (Boolean(expectedMaster) && jettonAddr === expectedMaster));
      if (!isOfficialGram) {
        if (memoMatched) {
          params.onRejected?.({ txHash: evHash, reason: 'fake_token' });
        }
        continue;
      }

      const decimals = typeof jt.jetton?.decimals === 'number' ? jt.jetton.decimals : 9;
      const rawAmount = Number(jt.amount || '0');
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

      const gramAmount = rawAmount / Math.pow(10, decimals);
      if (gramAmount <= 0) continue;

      // Strictly require matching player User ID memo (no manual txHash bypass)
      if (!memoMatched) continue;

      const coinsToCredit = gramToCoins(gramAmount);
      if (coinsToCredit < MIN_DEPOSIT_COINS) {
        params.onRejected?.({ txHash: evHash, reason: 'below_min', coins: coinsToCredit });
        continue;
      }
      if (coinsToCredit > MAX_DEPOSIT_COINS) {
        params.onRejected?.({ txHash: evHash, reason: 'above_max', coins: coinsToCredit });
        continue;
      }

      const usdAmount = Number((gramAmount * GRAM_USD_PRICE).toFixed(2));
      const timestampMs = ev.timestamp ? ev.timestamp * 1000 : Date.now();

      results.push({
        txHash: evHashNorm || evHash,
        gramAmount: Number(gramAmount.toFixed(6)),
        coinsToCredit,
        usdAmount,
        comment,
        timestampMs,
      });
    }
  }

  return results;
}

export interface TonCenterJettonTransfer {
  transaction_hash?: string;
  trace_id?: string;
  amount?: string;
  destination?: string;
  destination_address?: string;
  jetton_master?: string;
  transaction_now?: number;
  transaction_aborted?: boolean;
  decoded_payload?: {
    type?: string;
    comment?: string;
    text?: string;
  } | null;
}

export function matchGramTransfersFromTonCenter(params: {
  transfers: TonCenterJettonTransfer[];
  rawDepositAddress?: string;
  memo: string;
  acceptedMemos?: string[];
  claimedTxHashes?: string[];
  gramJettonMasterRaw?: string;
  onRejected?: (info: RejectedGramTransfer) => void;
}): DetectedGramTransfer[] {
  const claimedSet = buildClaimedSet(params.claimedTxHashes);
  const memoCandidates = Array.from(
    new Set(
      [params.memo, ...(params.acceptedMemos || [])]
        .map((m) => m.trim())
        .filter((m) => m.length >= 4),
    ),
  );
  if (memoCandidates.length === 0) return [];
  const targetRecipient = normalizeTonAddress(params.rawDepositAddress || '');
  const expectedMaster = normalizeTonAddress(
    params.gramJettonMasterRaw || OFFICIAL_GRAM_RAW_MASTER,
  );
  const results: DetectedGramTransfer[] = [];

  for (const tr of params.transfers) {
    if (tr.transaction_aborted) continue;
    const rawTxHash = (tr.trace_id || tr.transaction_hash || '').trim();
    const candidates = [tr.transaction_hash || '', tr.trace_id || ''].filter(Boolean);
    if (!rawTxHash || candidates.length === 0) continue;

    const alreadyClaimed = candidates.some((c) => {
      const lower = c.trim().toLowerCase();
      const norm = normalizeTxHash(c);
      return claimedSet.has(lower) || claimedSet.has(norm);
    });
    if (alreadyClaimed) continue;

    const jettonMaster = normalizeTonAddress(tr.jetton_master || '');
    const comment = (tr.decoded_payload?.comment || tr.decoded_payload?.text || '').trim();
    const memoMatched = matchMemoComment(comment, memoCandidates);

    if (
      !jettonMaster ||
      (jettonMaster !== OFFICIAL_GRAM_RAW_MASTER &&
        (!expectedMaster || jettonMaster !== expectedMaster))
    ) {
      if (memoMatched) {
        params.onRejected?.({ txHash: rawTxHash, reason: 'fake_token' });
      }
      continue;
    }

    const ownerDestAddr = normalizeTonAddress(tr.destination_address || '');
    if (!targetRecipient || !ownerDestAddr || ownerDestAddr !== targetRecipient) continue;

    const rawAmount = Number(tr.amount || '0');
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) continue;

    const gramAmount = rawAmount / 1e9;
    if (gramAmount <= 0) continue;

    if (!memoMatched) continue;

    const coinsToCredit = gramToCoins(gramAmount);
    if (coinsToCredit < MIN_DEPOSIT_COINS) {
      params.onRejected?.({ txHash: rawTxHash, reason: 'below_min', coins: coinsToCredit });
      continue;
    }
    if (coinsToCredit > MAX_DEPOSIT_COINS) {
      params.onRejected?.({ txHash: rawTxHash, reason: 'above_max', coins: coinsToCredit });
      continue;
    }

    const usdAmount = Number((gramAmount * GRAM_USD_PRICE).toFixed(2));
    const timestampMs = tr.transaction_now ? tr.transaction_now * 1000 : Date.now();
    const canonicalHash = normalizeTxHash(rawTxHash) || rawTxHash;

    results.push({
      txHash: canonicalHash,
      gramAmount: Number(gramAmount.toFixed(6)),
      coinsToCredit,
      usdAmount,
      comment,
      timestampMs,
    });
  }

  return results;
}
