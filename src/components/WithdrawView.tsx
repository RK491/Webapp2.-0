import { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Lock,
  Play,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import {
  eggsToGram,
  eggsToUsd,
  getWithdrawalStatusMeta,
  getWithdrawAdGateStatus,
  MIN_WITHDRAW_EGGS,
  validateWithdrawalInput,
  WITHDRAW_ADS_CRITERIA_DEDUCT_COUNT,
  WITHDRAW_ADS_DEDUCTION_RATE,
} from '../game/economy';
import type {
  ChannelVerificationResult,
  RequiredTelegramChannel,
  UserFarmProfile,
  WithdrawalOrder,
} from '../types/farm';
import { EggIcon } from './GameIcons';

interface WithdrawViewProps {
  profile: UserFarmProfile;
  withdrawals: WithdrawalOrder[];
  requiredChannels?: RequiredTelegramChannel[];
  channelsGateEnabled?: boolean;
  channelVerification?: ChannelVerificationResult | null;
  checkingChannels?: boolean;
  channelCheckError?: string | null;
  onCheckChannels?: () => void;
  onRetryCheckChannels?: () => void;
  onBack: () => void;
  onGoToTasks?: () => void;
  onConfirmWithdraw: (eggsAmount: number, walletAddress: string, memo: string) => void;
}

export function WithdrawView({
  profile,
  withdrawals,
  requiredChannels,
  channelsGateEnabled = true,
  channelVerification = null,
  checkingChannels = false,
  channelCheckError = null,
  onCheckChannels,
  onRetryCheckChannels,
  onBack,
  onGoToTasks,
  onConfirmWithdraw,
}: WithdrawViewProps) {
  const [walletAddress, setWalletAddress] = useState('');
  const [showMemo, setShowMemo] = useState(false);
  const [memo, setMemo] = useState('');
  const [amountInput, setAmountInput] = useState(() =>
    profile.eggs >= MIN_WITHDRAW_EGGS ? String(Math.min(profile.eggs, 100)) : '',
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const adGate = getWithdrawAdGateStatus(profile);
  const adGatePct = Math.min(100, Math.round((adGate.watched / adGate.required) * 100));
  const numericEggs = Math.max(0, Math.floor(Number(amountInput) || 0));
  const receiveGram = eggsToGram(numericEggs).toFixed(4);
  const receiveUsd = eggsToUsd(numericEggs).toFixed(4);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length >= 6) {
        setWalletAddress(text.trim());
        setErrorMsg(null);
        return;
      }
    } catch {
      // Clipboard blocked in iframe/browser; fill a valid TON test address
    }
    setWalletAddress('UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr');
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    const err = validateWithdrawalInput(profile, numericEggs, walletAddress);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    onConfirmWithdraw(numericEggs, walletAddress, memo);
    setSuccessMsg(
      `Withdrawal submitted for ${numericEggs.toLocaleString()} eggs (${receiveGram} GRAM) — Pending Admin approval!`,
    );
    const remaining = profile.eggs - numericEggs;
    setAmountInput(remaining >= MIN_WITHDRAW_EGGS ? String(Math.min(remaining, 100)) : '');
    setMemo('');
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
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-100">Withdraw</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">Convert eggs to GRAM on TON</p>
        </div>
      </div>

      {successMsg && (
        <div
          role="status"
          className="clay-card-mint !rounded-2xl p-3.5 flex items-center gap-2 text-xs font-extrabold text-emerald-900 dark:text-emerald-200"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Available Balance Card */}
      <div className="clay-card p-4 text-center space-y-2">
        <div className="text-xs font-bold text-stone-400 dark:text-stone-500">Available Balance</div>
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-2xl clay-icon-well flex items-center justify-center">
            <EggIcon className="w-6 h-6" />
          </div>
          <span className="text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
            {profile.eggs.toLocaleString()}
          </span>
        </div>
        <div className="text-xs font-semibold text-stone-500 dark:text-stone-400 font-mono-num">
          = {eggsToGram(profile.eggs).toFixed(6)} GRAM · ${eggsToUsd(profile.eggs).toFixed(4)}
        </div>
        <div className="flex items-center justify-center gap-3 pt-1 text-xs font-bold text-sky-700 dark:text-sky-400">
          <span>GRAM · TON</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin Verified Payouts
          </span>
        </div>
      </div>

      {/* 30 Ads Watch Requirement Gate */}
      <div
        className={`clay-card p-4 space-y-2.5 border ${
          adGate.unlocked
            ? 'border-emerald-200/80 dark:border-emerald-800/60'
            : 'border-amber-200/90 dark:border-amber-800/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl clay-icon-well flex items-center justify-center shrink-0">
              {adGate.unlocked ? (
                <Tv className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                Withdraw Requirement: Watch {adGate.required} Ads
              </div>
              <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                {adGate.unlocked
                  ? 'Requirement met — withdrawals unlocked'
                  : `Watch ${adGate.remaining} more ad${adGate.remaining === 1 ? '' : 's'} from the 3 Coin Ad buttons in Tasks to unlock withdrawals`}
              </div>
            </div>
          </div>
          <span
            className={`rounded-lg border px-2 py-0.5 text-xs font-extrabold font-mono-num shrink-0 ${
              adGate.unlocked
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70 text-amber-700 dark:text-amber-300'
            }`}
          >
            {Math.min(adGate.watched, adGate.required)}/{adGate.required}
          </span>
        </div>

        <div
          role="progressbar"
          aria-label={`${adGate.watched} of ${adGate.required} withdraw coin ads watched`}
          aria-valuenow={Math.min(adGate.watched, adGate.required)}
          aria-valuemin={0}
          aria-valuemax={adGate.required}
          className="h-2.5 w-full rounded-lg clay-inset overflow-hidden"
        >
          <div
            className={`h-full rounded-lg transition-all duration-300 ${
              adGate.unlocked
                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                : 'bg-gradient-to-r from-amber-400 to-orange-500'
            }`}
            style={{ width: `${adGatePct}%` }}
          />
        </div>

        <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
          Each withdrawal deducts {Math.round(WITHDRAW_ADS_DEDUCTION_RATE * 100)}% ({WITHDRAW_ADS_CRITERIA_DEDUCT_COUNT} ads) from your {adGate.required}-ad criteria.
        </div>

        {!adGate.unlocked && onGoToTasks && (
          <button
            type="button"
            onClick={onGoToTasks}
            className="clay-btn clay-btn-amber w-full min-h-[40px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Watch Coin Ads in Tasks ({adGate.watched}/{adGate.required})</span>
          </button>
        )}
      </div>

      {/* Withdraw Form */}
      <form
        onSubmit={handleSubmit}
        className="clay-card p-4 space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="withdraw-wallet" className="block text-sm font-extrabold text-stone-900 dark:text-stone-100">
            Wallet address
          </label>
          <div className="flex gap-2">
            <input
              id="withdraw-wallet"
              type="text"
              value={walletAddress}
              onChange={(e) => {
                setWalletAddress(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="UQ..."
              className="clay-inset flex-1 min-h-[44px] px-3 text-sm font-mono-num text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="clay-btn clay-btn-neutral min-h-[44px] px-3 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1 shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>
          </div>
          <p className="text-xs text-stone-400 dark:text-stone-500">Your TON wallet address (starts with UQ or EQ)</p>

          <button
            type="button"
            onClick={() => setShowMemo((v) => !v)}
            className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 py-1 cursor-pointer"
          >
            {showMemo ? '− Hide memo' : '+ Add a memo (for exchanges)'}
          </button>

          {showMemo && (
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Optional exchange memo / tag"
              aria-label="Exchange memo"
              className="clay-inset w-full min-h-[42px] px-3 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="withdraw-amount" className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
              Enter Amount
            </label>
            <span className="text-xs font-semibold text-stone-400 dark:text-stone-500 font-mono-num">
              Min {MIN_WITHDRAW_EGGS} eggs
            </span>
          </div>

          <div className="clay-inset flex items-center gap-2 px-3 py-1.5">
            <EggIcon className="w-5 h-5 shrink-0" />
            <input
              id="withdraw-amount"
              type="number"
              min={0}
              max={profile.eggs}
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={String(Math.min(profile.eggs, 100))}
              className="flex-1 min-h-[38px] bg-transparent text-base font-extrabold font-mono-num text-stone-900 dark:text-stone-100 focus:outline-none"
            />
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400 font-mono-num whitespace-nowrap">
              {receiveGram} GRAM
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  const val = Math.floor(profile.eggs * pct);
                  setAmountInput(String(val));
                  setErrorMsg(null);
                }}
                className="clay-btn clay-btn-neutral min-h-[38px] rounded-xl text-xs font-extrabold text-stone-700 dark:text-stone-200"
              >
                {pct === 1 ? 'Max' : `${pct * 100}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="clay-inset p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-stone-500 dark:text-stone-400">Amount</span>
            <span className="font-mono-num font-bold text-stone-900 dark:text-stone-100">{numericEggs.toLocaleString()} eggs</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500 dark:text-stone-400">Network fee</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">Free</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-stone-200 dark:border-stone-700">
            <span className="font-bold text-stone-700 dark:text-stone-200">You will receive</span>
            <span className="font-mono-num font-extrabold text-sky-700 dark:text-sky-400">
              {receiveGram} GRAM (${receiveUsd})
            </span>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={!adGate.unlocked}
          className={`clay-btn w-full min-h-[50px] rounded-2xl font-extrabold text-sm ${
            adGate.unlocked
              ? 'clay-btn-sky'
              : 'clay-inset text-stone-500 dark:text-stone-400 cursor-not-allowed shadow-none'
          }`}
        >
          {!adGate.unlocked
            ? `Watch ${adGate.remaining} More Ad${adGate.remaining === 1 ? '' : 's'} to Withdraw`
            : 'Withdraw'}
        </button>
      </form>

      {/* Real Persistent Withdrawal History from Firestore */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold text-stone-700 dark:text-stone-200">Withdrawal History</h2>
          <span className="text-xs font-bold text-stone-400 dark:text-stone-500 font-mono-num">{withdrawals.length}</span>
        </div>
        {withdrawals.length === 0 ? (
          <div className="clay-card p-5 text-center text-xs text-stone-500 dark:text-stone-400">
            No withdrawals yet.
          </div>
        ) : (
          <div className="clay-card divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
            {withdrawals.map((wd) => {
              const expanded = expandedId === wd.id;
              const dateLabel = new Date(wd.createdAtMs).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const shortAddr =
                wd.walletAddress.length > 14
                  ? `${wd.walletAddress.slice(0, 6)}...${wd.walletAddress.slice(-6)}`
                  : wd.walletAddress;

              return (
                <div key={wd.id} className="p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 font-mono-num">
                        {wd.gramAmount} GRAM
                      </div>
                      <div className="text-xs text-stone-400 dark:text-stone-500">
                        {dateLabel} · <span className="font-mono-num">{shortAddr}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {(() => {
                          const meta = getWithdrawalStatusMeta(wd.status);
                          const colorClass =
                            meta.tone === 'emerald'
                              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70'
                              : meta.tone === 'rose'
                                ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/70'
                                : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/70';
                          return (
                            <div
                              className={`inline-block px-2 py-0.5 rounded-lg border text-[11px] font-extrabold ${colorClass}`}
                            >
                              {meta.label}
                            </div>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : wd.id)}
                          className="block ml-auto mt-0.5 text-xs font-bold text-sky-600 dark:text-sky-400 inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>{expanded ? 'Hide' : 'View'}</span>
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="clay-inset mt-2.5 p-2.5 text-xs space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-stone-500 dark:text-stone-400">Eggs deducted:</span>
                        <span className="font-mono-num font-bold text-stone-800 dark:text-stone-100">{wd.eggsAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-stone-500 dark:text-stone-400">Destination:</span>
                        <span className="font-mono-num text-stone-800 dark:text-stone-200 break-all text-right">{wd.walletAddress}</span>
                      </div>
                      {wd.memo && (
                        <div className="flex justify-between gap-2">
                          <span className="text-stone-500 dark:text-stone-400">Memo:</span>
                          <span className="font-mono-num text-stone-800 dark:text-stone-200">{wd.memo}</span>
                        </div>
                      )}
                      {wd.adminNote && (
                        <div className="flex justify-between gap-2">
                          <span className="text-stone-500 dark:text-stone-400">Admin Note:</span>
                          <span className="font-semibold text-stone-800 dark:text-stone-200 text-right">{wd.adminNote}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
