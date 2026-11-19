import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Radar,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  COINS_PER_GRAM,
  COINS_PER_USD,
  createDepositQuote,
  DEFAULT_GRAM_JETTON_MASTER,
  MAX_DEPOSIT_COINS,
  MIN_DEPOSIT_COINS,
} from '../game/economy';
import {
  buildGramTransferUrl,
  extractTelegramNumericId,
  getPrimaryDepositMemo,
  normalizeTxHash,
  type DetectedGramTransfer,
} from '../game/tonGram';
import type { DepositOrder, UserFarmProfile } from '../types/farm';
import { safeFetchJson } from '../utils/telegram';
import { CoinIcon, QRCodeSvg } from './GameIcons';

interface DepositViewProps {
  profile: UserFarmProfile;
  deposits: DepositOrder[];
  depositAddress: string;
  gramJettonMaster?: string;
  onBack: () => void;
  onViewWallet?: () => void;
  onAutoCreditGramDeposit: (transfer: DetectedGramTransfer) => Promise<boolean | void>;
}

const PRESET_AMOUNTS = [
  { coins: 1000, label: '1K' },
  { coins: 2500, label: '2.5K' },
  { coins: 5000, label: '5K' },
  { coins: 7500, label: '7.5K' },
  { coins: 10000, label: '10K' },
  { coins: 15000, label: '15K' },
];

export function DepositView({
  profile,
  deposits,
  depositAddress,
  gramJettonMaster = DEFAULT_GRAM_JETTON_MASTER,
  onBack,
  onViewWallet,
  onAutoCreditGramDeposit,
}: DepositViewProps) {
  const [coinsAmount, setCoinsAmount] = useState(5000);
  const [copiedKey, setCopiedKey] = useState<'amount' | 'addr' | 'memo' | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>(
    'Auto-detect active: coins credit automatically only after confirmed GRAM payment on TON.',
  );
  const [lastDepositedText, setLastDepositedText] = useState<string | null>(null);

  const tgNumericId = extractTelegramNumericId(profile.uid);
  const systemMemo = getPrimaryDepositMemo(profile.uid);
  const isMemoReadOnly = systemMemo.length > 0;
  const [memoInput, setMemoInput] = useState(systemMemo);

  const quote = createDepositQuote(coinsAmount, 'GRAM_TON', depositAddress);
  const memoTag = isMemoReadOnly ? systemMemo : memoInput.trim();
  const tonTransferDeepLink = buildGramTransferUrl({
    depositAddress: quote.depositAddress,
    jettonMaster: gramJettonMaster,
    gramAmount: quote.gramAmount,
    memo: memoTag,
    scheme: 'ton',
  });
  const tonkeeperDeepLink = buildGramTransferUrl({
    depositAddress: quote.depositAddress,
    jettonMaster: gramJettonMaster,
    gramAmount: quote.gramAmount,
    memo: memoTag,
    scheme: 'tonkeeper',
  });

  const claimedHashesRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef(false);

  useEffect(() => {
    for (const d of deposits) {
      if (d.txHash) {
        claimedHashesRef.current.add(d.txHash.toLowerCase());
        const norm = normalizeTxHash(d.txHash);
        if (norm) claimedHashesRef.current.add(norm);
      }
    }
  }, [deposits]);

  const checkBlockchainForGram = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setScanning(true);
    try {
      const data = await safeFetchJson<{
        found?: boolean;
        transfers?: DetectedGramTransfer[];
        scannerWarning?: string;
      }>('/api/deposits/check-gram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: profile.uid,
          claimedTxHashes: Array.from(claimedHashesRef.current),
        }),
      });
      if (!data) {
        setScanStatus(
          `Scanner offline or static host — awaiting GRAM transfer with memo ${memoTag}.`,
        );
        return;
      }

      const freshTransfers = (data.transfers || []).filter((tr) => {
        const lower = tr.txHash.toLowerCase();
        const norm = normalizeTxHash(tr.txHash);
        return !claimedHashesRef.current.has(lower) && (!norm || !claimedHashesRef.current.has(norm));
      });

      if (freshTransfers.length > 0) {
        let totalCredited = 0;
        let creditedCount = 0;
        for (const tr of freshTransfers) {
          claimedHashesRef.current.add(tr.txHash.toLowerCase());
          const norm = normalizeTxHash(tr.txHash);
          if (norm) claimedHashesRef.current.add(norm);
          const applied = await onAutoCreditGramDeposit(tr);
          if (applied !== false) {
            totalCredited += tr.coinsToCredit;
            creditedCount += 1;
          }
        }
        if (creditedCount > 0) {
          setLastDepositedText(
            `Confirmed ${creditedCount} GRAM transfer(s) on TON! +${totalCredited.toLocaleString()} coins credited.`,
          );
          setScanStatus('GRAM payment confirmed on TON & coins credited to your account!');
        } else {
          setScanStatus('Transfer was already credited to your account.');
        }
      } else {
        const timeStr = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setScanStatus(
          data.scannerWarning ||
            `Listening for confirmed GRAM transfer with memo ${memoTag} (last checked ${timeStr})...`,
        );
      }
    } catch {
      setScanStatus('Scanner temporarily offline — retrying automatically...');
    } finally {
      inFlightRef.current = false;
      setScanning(false);
    }
  }, [memoTag, onAutoCreditGramDeposit, profile.uid]);

  useEffect(() => {
    void checkBlockchainForGram();
    const id = window.setInterval(() => {
      void checkBlockchainForGram();
    }, 8000);
    const handleReturnFocus = () => {
      if (document.visibilityState === 'visible') {
        void checkBlockchainForGram();
      }
    };
    window.addEventListener('focus', handleReturnFocus);
    document.addEventListener('visibilitychange', handleReturnFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', handleReturnFocus);
      document.removeEventListener('visibilitychange', handleReturnFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.uid, memoTag]);

  const copyText = async (text: string, which: 'amount' | 'addr' | 'memo') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback visual indicator
    }
    setCopiedKey(which);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  return (
    <div className="animate-clay-enter space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to wallet"
          className="clay-btn clay-btn-neutral w-10 h-10 rounded-full flex items-center justify-center text-stone-700 dark:text-stone-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-100">Deposit with GRAM</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Min {MIN_DEPOSIT_COINS.toLocaleString()} · Max {MAX_DEPOSIT_COINS.toLocaleString()} coins · Auto-credits on TON confirmation
          </p>
        </div>
      </div>

      {lastDepositedText && (
        <div
          role="status"
          className="clay-card-mint !rounded-2xl p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{lastDepositedText}</span>
          </div>
          {onViewWallet && (
            <button
              type="button"
              onClick={onViewWallet}
              className="clay-btn clay-btn-emerald px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0"
            >
              Wallet
            </button>
          )}
        </div>
      )}

      {/* Points / Coins Calculator (GRAM Only, 1K - 15K) */}
      <div className="clay-card p-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-stone-500 dark:text-stone-400">
          <span>Select coins to deposit</span>
          <span className="font-mono-num text-stone-700 dark:text-stone-200">1,000 – 15,000</span>
        </div>

        <div className="flex items-baseline justify-center gap-2">
          <CoinIcon className="w-6 h-6 self-center" />
          <span className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
            {quote.totalCoins.toLocaleString()}
          </span>
          <span className="text-xs font-bold text-stone-400 dark:text-stone-500">COINS</span>
        </div>

        <div className="text-center text-sm font-extrabold text-sky-700 dark:text-sky-400 font-mono-num">
          = {quote.cryptoAmount} (${(quote.totalCoins / COINS_PER_USD).toFixed(2)})
        </div>

        <input
          type="range"
          min={MIN_DEPOSIT_COINS}
          max={MAX_DEPOSIT_COINS}
          step={500}
          value={quote.totalCoins}
          aria-label="Deposit points amount slider"
          onChange={(e) => setCoinsAmount(Number(e.target.value))}
          className="w-full accent-sky-500 cursor-pointer"
        />

        <div className="flex items-center justify-between text-[11px] font-bold text-stone-400 dark:text-stone-500 font-mono-num">
          <span>Min: {MIN_DEPOSIT_COINS.toLocaleString()} (1K)</span>
          <span>Max: {MAX_DEPOSIT_COINS.toLocaleString()} (15K)</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESET_AMOUNTS.map((preset) => {
            const active = quote.totalCoins === preset.coins;
            return (
              <button
                key={preset.coins}
                type="button"
                onClick={() => setCoinsAmount(preset.coins)}
                className={`clay-btn min-h-[42px] rounded-2xl text-xs font-extrabold font-mono-num ${
                  active ? 'clay-btn-amber' : 'clay-btn-neutral'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* GRAM (TON) Payment Details + Auto-Detection */}
      <div className="clay-card p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full clay-btn-sky font-extrabold text-xs flex items-center justify-center shrink-0">
              GRAM
            </div>
            <div>
              <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100">GRAM Jetton on TON</div>
              <div className="text-xs text-stone-500 dark:text-stone-400 font-mono-num">
                Rate: 1 GRAM ≈ {COINS_PER_GRAM.toLocaleString()} coins
              </div>
            </div>
          </div>
          <span className="clay-inset !rounded-full inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-extrabold text-sky-700 dark:text-sky-300">
            <Radar className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>Auto-Detect</span>
          </span>
        </div>

        <div className="clay-card-mint !rounded-2xl px-3 py-2 flex items-start gap-2 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Verified GRAM contract transfer with your unique memo. Coins are added strictly after on-chain confirmation (no spam or unconfirmed transfers).
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div className="space-y-2.5">
            <div>
              <div className="text-xs font-bold text-stone-500 dark:text-stone-400 mb-1">Send GRAM amount:</div>
              <div className="clay-inset px-3 py-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                    {quote.cryptoAmount}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">
                    Credits {quote.totalCoins.toLocaleString()} coins after confirmation
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Copy GRAM amount"
                  onClick={() => copyText(quote.gramAmount.toFixed(4), 'amount')}
                  className="clay-btn clay-btn-sky w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                >
                  {copiedKey === 'amount' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-stone-500 dark:text-stone-400 mb-1">To this TON address:</div>
              <div className="clay-inset px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono-num text-stone-800 dark:text-stone-200 break-all">
                  {quote.depositAddress}
                </span>
                <button
                  type="button"
                  aria-label="Copy deposit address"
                  onClick={() => copyText(quote.depositAddress, 'addr')}
                  className="clay-btn clay-btn-sky w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                >
                  {copiedKey === 'addr' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  htmlFor="deposit-transaction-memo"
                  className="text-xs font-bold text-rose-600 dark:text-rose-400"
                >
                  {tgNumericId ? 'Telegram User ID Memo:' : 'Transaction Memo (User ID):'}
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  {isMemoReadOnly && <Lock className="w-3 h-3" />}
                  <span>{isMemoReadOnly ? 'Auto-filled · Locked' : 'Required in wallet'}</span>
                </span>
              </div>
              <div className="clay-card-warm !rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <input
                    id="deposit-transaction-memo"
                    type="text"
                    value={memoTag}
                    readOnly={isMemoReadOnly}
                    aria-readonly={isMemoReadOnly}
                    aria-label="Transaction memo"
                    onChange={(e) => {
                      if (!isMemoReadOnly) {
                        setMemoInput(e.target.value);
                      }
                    }}
                    placeholder="Enter your User ID memo"
                    className={`w-full bg-transparent text-sm font-extrabold font-mono-num text-amber-950 dark:text-amber-100 focus:outline-none truncate ${
                      isMemoReadOnly ? 'cursor-default select-all' : ''
                    }`}
                  />
                  <div className="text-[10px] font-semibold text-amber-800/80 dark:text-amber-300/90">
                    {tgNumericId
                      ? 'Auto-detected Telegram ID · Read-only for accurate detection'
                      : isMemoReadOnly
                        ? 'System-locked User ID · Read-only for accurate detection'
                        : '1 user = 1 ID'}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Copy deposit memo"
                  onClick={() => copyText(memoTag, 'memo')}
                  className="clay-btn clay-btn-amber w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                >
                  {copiedKey === 'memo' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2.5">
            <div className="clay-icon-well p-3 rounded-3xl">
              <QRCodeSvg value={tonTransferDeepLink} className="w-36 h-36" />
            </div>
            <a
              href={tonTransferDeepLink}
              className="clay-btn clay-btn-sky w-full max-w-[190px] min-h-[42px] rounded-2xl inline-flex items-center justify-center gap-1.5 text-xs font-extrabold px-3"
            >
              <span>Pay via TON Wallet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={tonkeeperDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-400 hover:underline"
            >
              <span>Open in Tonkeeper Web</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Live Automatic Blockchain Scanner Box */}
        <div className="clay-inset p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-900 dark:text-sky-200">
            {scanning ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
            ) : (
              <Radar className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            )}
            <span>{scanStatus}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-sky-800/80 dark:text-sky-300/90">
              Auto-detect only — each confirmed TON transfer with your User ID memo credits once automatically.
            </p>
            <button
              type="button"
              disabled={scanning}
              onClick={() => void checkBlockchainForGram()}
              className="clay-btn clay-btn-sky min-h-[42px] px-4 rounded-2xl disabled:opacity-60 font-extrabold text-xs flex items-center justify-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scanning TON...' : 'Check GRAM Deposit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real Persistent Deposit History from Firestore */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold text-stone-700 dark:text-stone-300">Deposit History</h2>
          <span className="text-xs font-bold text-stone-400 dark:text-stone-500 font-mono-num">{deposits.length}</span>
        </div>

        {deposits.length === 0 ? (
          <div className="clay-card p-5 text-center text-xs text-stone-500 dark:text-stone-400">
            No GRAM deposits detected yet. Any confirmed GRAM deposit ({MIN_DEPOSIT_COINS.toLocaleString()}–{MAX_DEPOSIT_COINS.toLocaleString()} coins) will appear here automatically.
          </div>
        ) : (
          <div className="clay-card divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
            {deposits.map((dep) => {
              const dateLabel = new Date(dep.createdAtMs).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div key={dep.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                      +{dep.coinsAmount.toLocaleString()} Coins
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                      {dep.cryptoAmount} · TON · {dateLabel}
                    </div>
                    {dep.txHash && (
                      <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono-num truncate">
                        Tx: {dep.txHash}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-xl capitalize shrink-0">
                    {dep.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
