import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateCoopFever,
  activateFeedBooster,
  AD_EXEMPT_ACTIONS,
  AD_GATED_ACTIONS,
  AD_NETWORK_TASKS,
  ADMIN_PASSCODE_VAULT_UID,
  ADSGRAM_BOT_JOIN_TASK,
  applyAutoHarvestIfDue,
  applyLeftChannelPenalties,
  AUTO_HARVEST_DRONE_TIERS,
  buildDeterministicDepositIds,
  buildEarningsChartSeries,
  buildInvitedFriendsList,
  buildLeaderboardRankings,
  buildReferralBotNotificationMessage,
  buildReferralGrowthSeries,
  buyChickens,
  calculateBuyerPoints,
  calculateLevelYieldMultiplier,
  calculatePaidTaskCost,
  calculatePaidTaskFromBudget,
  calculatePaidTaskTopUp,
  calculatePendingEggs,
  calculateProductionRate,
  calculateReferralBonusEggs,
  calculateReferralEggCommission,
  calculateTaskRefundAmount,
  canAddAdminPlayerId,
  canBanPlayerId,
  canRemoveAdminPlayerId,
  claimAchievement,
  claimAdNetworkReward,
  claimAdsgramBotJoinReward,
  claimDailyStreak,
  claimGoldenEggDrop,
  claimPromoCode,
  claimReferralMilestone,
  collectEggs,
  completeTask,
  computeAdminCoinAdjustment,
  computeAdminReferralCountAdjustment,
  COOP_FEVER_DURATION_MS,
  COOP_FEVER_MULTIPLIER,
  COOP_FEVER_REQUIRED_ADS,
  createDefaultProfile,
  createDefaultSeasonConfig,
  createDepositQuote,
  createPaidTaskOrder,
  createRefundPaidTaskOrder,
  createTopUpPaidTaskOrder,
  decodeAchievementsAndAds,
  decodePromoLabelMeta,
  decodeTaskSubtitleMeta,
  DEFAULT_AD_CONFIG,
  DEFAULT_CHANNELS_CONFIG,
  DEFAULT_GET_CODE_CHANNEL_URL,
  DEFAULT_GRAM_DEPOSIT_ADDRESS,
  DEFAULT_GRAM_JETTON_MASTER,
  DEFAULT_MAINTENANCE_CONFIG,
  DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
  detectTop10RankCelebration,
  encodeAchievementsWithAds,
  encodePromoLabelMeta,
  encodeTaskSubtitleMeta,
  executeDeposit,
  executeWithdrawal,
  extractTelegramNumericUserId,
  FEED_BOOSTER_COST_COINS,
  FEED_BOOSTER_DURATION_MS,
  filterPlayersBySearchQuery,
  getCoopFeverProgress,
  isAutoHarvestDroneActive,
  isCoopFeverActive,
  MIN_REINVEST_EGGS,
  purchaseAutoHarvestDrone,
  renderPayoutChannelApproveMessage,
  renderWithdrawApproveMessage,
  resolveMaintenanceConfig,
  USER_TASK_CHANNEL_CHECK_FEE_COINS,
  USER_TASK_MIN_REWARD_COINS,
  filterWithdrawalsByTab,
  formatAdConfigTemplate,
  formatChannelsHandleSummary,
  formatGoldenEggCooldownWait,
  formatPromoRewardSummary,
  formatReferralHandle,
  formatShortTonWallet,
  FREE_EGGS_MILESTONE_BONUS,
  FREE_EGGS_PER_AD,
  generateGiftCodeString,
  getAchievementsProgress,
  getActiveRequiredChannels,
  getAdNetworkClaimCountToday,
  getBotJoinClaimCountToday,
  getChickenMilestoneReached,
  getCoopFeverAdsWatched,
  getEffectiveAdminIds,
  WITHDRAW_ADS_CRITERIA_DEDUCT_COUNT,
  WITHDRAW_ADS_DEDUCTION_RATE,
  getGoldenEggCooldownRemainingMs,
  getTaskRemainingSlots,
  getTotalAdsWatched,
  getWithdrawAdsWatched,
  getWithdrawalStatusMeta,
  getWithdrawAdGateStatus,
  GOLDEN_EGG_COOLDOWN_MS,
  GOLDEN_EGG_REWARD_COINS,
  GOLDEN_EGG_REWARD_XP,
  gramToCoins,
  isAdminPlayerId,
  isFeedBoosterActive,
  isGoldenEggReady,
  isTelegramMemberStatusJoined,
  matchesAdminRecord,
  matchesBannedUserRecord,
  MAX_DEPOSIT_COINS,
  mergeTaskDefinitions,
  MIN_DEPOSIT_COINS,
  MIN_WITHDRAW_ADS_WATCHED,
  normalizeGetCodeChannelUrl,
  normalizePlayerBanId,
  normalizeTelegramChannelEntry,
  normalizeTelegramChannelHandle,
  parseAdConfigTemplate,
  PRIMARY_ADMIN_TELEGRAM_ID,
  REFERRAL_DEPOSIT_COMMISSION_RATE,
  REFERRAL_MILESTONE_CRATES,
  REFERRED_WELCOME_BONUS_COINS,
  REFERRER_LIFETIME_EGG_COMMISSION_RATE,
  REFERRER_SIGNUP_BONUS_COINS,
  REFERRER_SIGNUP_BONUS_EGGS,
  reinvestEggs,
  recordCompletedGateAd,
  recordCoopFeverAd,
  REQUIRED_TELEGRAM_CHANNELS,
  shouldRequireAdForAction,
  shouldShowSignUpBonusClaim,
  SIGNUP_BONUS_COINS,
  sortTasks,
  summarizeReferrals,
  upgradeBasket,
  watchAdStep,
} from './economy';
import {
  clearAdNetworkCooldowns,
  getAdNetworkCooldownRemainingMs,
  getOrderedConfiguredAdNetworks,
  hasConfiguredAdNetworkSdk,
  hasConfiguredAdsgramTaskSdk,
  isAdNetworkOnCooldown,
  resolveEffectiveAdConfig,
  selectAvailableAdNetworks,
  setAdNetworkCooldown,
} from '../utils/ads';
import {
  buildAcceptedDepositMemos,
  buildGramTransferUrl,
  friendlyTonAddressToRaw,
  getPrimaryDepositMemo,
  matchGramTransfersFromTonApiEvents,
  matchGramTransfersFromTonCenter,
  normalizeTxHash,
  OFFICIAL_GRAM_RAW_MASTER,
  type RejectedGramTransfer,
} from './tonGram';
import {
  getMergedReferralsForUser,
  getReferrals,
  getReferrer,
  resetReferralStorage,
  saveReferral,
} from '../server/referralStorage';
import {
  calculateMsUntilBasketFull,
  shouldTriggerBasketFullNotification,
} from '../utils/notifications';
import {
  DEFAULT_TELEGRAM_BOT_USERNAME,
  DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME,
  detectTelegramBotConfig,
  extractStartParamFromLocation,
  getTelegramChannelUrl,
  maskTelegramBotToken,
  normalizeStartParam,
  normalizeTelegramBotUsername,
  parseStartAppAction,
  resolveTelegramUserIdentity,
  sanitizeTelegramBotTokenInput,
  verifyTelegramBotTokenDirect,
} from '../utils/telegram';
import { isValidLanguageCode, LANGUAGE_OPTIONS, t } from '../utils/i18n';
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  getStoredTheme,
  isValidThemeMode,
  setStoredTheme,
} from '../utils/theme';
import {
  buildPersonalReferralUrl,
  buildReferralShareData,
  buildTelegramDirectShareUrl,
  getReferralStartId,
  shareReferralLink,
} from '../utils/referralShare';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  computeMuteAllToggle,
  DEFAULT_AUDIO_SETTINGS,
  getStoredAudioSettings,
  isAllAudioMuted,
  setStoredAudioSettings,
} from '../utils/sound';

const NOW = 1_794_580_000_000;

test('mining does not start before buying a chicken, and starts cleanly after purchase with basketCapacity cap', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  assert.equal(profile.leghornCount, 0);
  assert.equal(profile.boughtThisWeek, 0);
  assert.equal(calculateProductionRate(profile), 0);
  assert.equal(calculateBuyerPoints(profile), 0);

  // Even 24 hours later, zero eggs are mined until a chicken/miner is bought
  const withoutMiner = NOW + 24 * 60 * 60 * 1000;
  assert.equal(calculatePendingEggs(profile, withoutMiner), 0);
  assert.ok('error' in collectEggs(profile, withoutMiner));

  // Buying 1st chicken at `withoutMiner` starts mining from `withoutMiner` (0 retroactive eggs)
  const firstBuy = buyChickens(profile, 'leghorn', 1, withoutMiner);
  assert.ok(!('error' in firstBuy));
  assert.equal(firstBuy.profile.lastCollectedAt, withoutMiner);
  assert.equal(calculatePendingEggs(firstBuy.profile, withoutMiner), 0);
  assert.equal(calculateProductionRate(firstBuy.profile), 8);

  // With 2 Leghorns, 4 hours produces 64 eggs and caps at basketCapacity
  const twoHensProfile = { ...firstBuy.profile, leghornCount: 2, lastCollectedAt: NOW };
  assert.equal(calculateProductionRate(twoHensProfile), 16); // 2 * 8 = 16 eggs/h
  assert.equal(calculateBuyerPoints(twoHensProfile), 2);

  const later = NOW + 4 * 60 * 60 * 1000;
  const pending = calculatePendingEggs(twoHensProfile, later);
  assert.equal(pending, 64);

  const capped = calculatePendingEggs(twoHensProfile, NOW + 100 * 60 * 60 * 1000);
  assert.equal(capped, twoHensProfile.basketCapacity);
});

test('collectEggs increments balance, resets timer, and computes 5% lifetime referral egg commission', () => {
  const { profile, transactions } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  assert.equal(profile.coins, SIGNUP_BONUS_COINS);
  assert.equal(SIGNUP_BONUS_COINS, 1000);
  assert.equal(profile.eggs, 0);
  assert.equal(profile.totalEggsCollected, 0);
  assert.equal(profile.totalCashEarnedUsd, 0);
  assert.equal(transactions[0].amount, 1000);

  const result = collectEggs(profile, NOW + 3600 * 1000, 50);
  assert.ok(!('error' in result));
  assert.equal(result.collected, 50);
  assert.equal(result.profile.eggs, 50);
  assert.equal(result.transaction.type, 'collect');
  assert.equal(result.transaction.amount, 50);
  assert.equal(result.referralEggCommission, 0);

  const referredResult = collectEggs(
    { ...profile, referredBy: 'tg_referrer_99' },
    NOW + 3600 * 1000,
    100,
  );
  assert.ok(!('error' in referredResult));
  assert.equal(referredResult.referralEggCommission, 5);
});

test('buyChickens deducts coins and increases production', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  const res = buyChickens(profile, 'leghorn', 1, NOW);
  assert.ok(!('error' in res));
  assert.equal(res.profile.coins, 0);
  assert.equal(res.profile.leghornCount, 1);
  assert.equal(calculateProductionRate(res.profile), 8);

  const fail = buyChickens(res.profile, 'orpington', 1, NOW);
  assert.ok('error' in fail);
});

test('GRAM-only deposit enforces 1k-15k limits, requires txHash, converts GRAM to coins, and computes 5% referrer commission', () => {
  const quote = createDepositQuote(5000, 'GRAM_TON');
  assert.equal(quote.bonusCoins, 0);
  assert.equal(quote.totalCoins, 5000);
  assert.equal(quote.depositAddress, DEFAULT_GRAM_DEPOSIT_ADDRESS);
  assert.ok(quote.cryptoAmount.endsWith('GRAM'));

  // Clamps quotes below 1k and above 15k
  assert.equal(createDepositQuote(200, 'GRAM_TON').totalCoins, MIN_DEPOSIT_COINS);
  assert.equal(createDepositQuote(50000, 'GRAM_TON').totalCoins, MAX_DEPOSIT_COINS);

  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  profile.referredBy = 'player_referrer';

  const missingHash = executeDeposit(profile, 5000, 'GRAM_TON', NOW, '');
  assert.ok('error' in missingHash);

  const belowMin = executeDeposit(profile, 500, 'GRAM_TON', NOW, 'tx_low_1', 0.01);
  assert.ok('error' in belowMin);

  const aboveMax = executeDeposit(profile, 20000, 'GRAM_TON', NOW, 'tx_high_1', 2.0);
  assert.ok('error' in aboveMax);

  const first = executeDeposit(profile, 10000, 'GRAM_TON', NOW, 'tx_gram_123', 1.0);
  assert.ok(!('error' in first));
  assert.equal(first.deposit.bonusCoins, 0);
  assert.equal(first.deposit.coinsAmount, gramToCoins(1.0));
  assert.equal(first.deposit.cryptoAmount, '1.0000 GRAM');
  assert.equal(first.deposit.txHash, 'tx_gram_123');
  assert.equal(first.profile.coins, 1000 + gramToCoins(1.0));
  assert.equal(first.referrerCommissionCoins, Math.round(gramToCoins(1.0) * 0.05));

  // Deterministic IDs match across repeated calls for idempotent Firestore protection
  const second = executeDeposit(profile, 10000, 'GRAM_TON', NOW + 5000, 'tx_gram_123', 1.0);
  assert.ok(!('error' in second));
  assert.equal(second.deposit.id, first.deposit.id);
  assert.equal(second.transaction.id, first.transaction.id);
});

test('reinvestEggs converts eggs to coins with 5% bonus and enforces minimum 500 eggs', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  const belowMin = reinvestEggs({ ...profile, eggs: 600 }, 499, NOW);
  assert.ok('error' in belowMin);
  const res = reinvestEggs({ ...profile, eggs: 500 }, 500, NOW);
  assert.ok(!('error' in res));
  assert.equal(res.profile.eggs, 0);
  assert.equal(res.coinsReceived, 37);
  assert.equal(res.profile.coins, 1037);
});

test('executeWithdrawal enforces 30-ad watch gate from 3 Tasks Coin Ad buttons, validates address and balance, and records withdrawal', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  const unwatchedProfile = { ...profile, eggs: 500, totalAdsWatched: 45, withdrawAdsWatched: 29 };
  const blockedByAds = executeWithdrawal(
    unwatchedProfile,
    200,
    'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
    '',
    NOW,
  );
  assert.ok('error' in blockedByAds);
  assert.match(blockedByAds.error, /30 ads/i);

  const fundedProfile = { ...profile, eggs: 500, withdrawAdsWatched: MIN_WITHDRAW_ADS_WATCHED };
  const badAddr = executeWithdrawal(fundedProfile, 200, 'abc', '', NOW);
  assert.ok('error' in badAddr);

  const tooMuch = executeWithdrawal(fundedProfile, 5000, 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr', '', NOW);
  assert.ok('error' in tooMuch);

  const ok = executeWithdrawal(fundedProfile, 200, 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr', '1234', NOW);
  assert.ok(!('error' in ok));
  assert.equal(ok.profile.eggs, 300);
  assert.equal(ok.withdrawal.eggsAmount, 200);
  assert.equal(ok.withdrawal.memo, '1234');
  assert.equal(ok.withdrawal.status, 'pending');
  assert.equal(ok.transaction.status, 'pending');
  assert.equal(ok.transaction.type, 'withdraw');
  // 50% of 30-ad Ads Criteria (15 ads) is deducted automatically on withdrawal
  assert.equal(WITHDRAW_ADS_DEDUCTION_RATE, 0.5);
  assert.equal(WITHDRAW_ADS_CRITERIA_DEDUCT_COUNT, 15);
  assert.equal(ok.adsDeducted, 15);
  assert.equal(ok.remainingWithdrawAds, 15);
  assert.equal(ok.profile.withdrawAdsWatched, 15);
  assert.equal(getWithdrawAdGateStatus(ok.profile).watched, 15);
  assert.equal(getWithdrawAdGateStatus(ok.profile).remaining, 15);
  assert.equal(getWithdrawAdGateStatus(ok.profile).unlocked, false);

  // Immediate 2nd withdrawal is blocked until 15 more Coin Ads are watched
  const secondBlocked = executeWithdrawal(
    ok.profile,
    100,
    'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
    '',
    NOW + 1000,
  );
  assert.ok('error' in secondBlocked);

  // If user had >30 ads (e.g. 45), withdrawing deducts 15 and retains remaining 30 (still unlocked)
  const excessProfile = { ...fundedProfile, withdrawAdsWatched: 45 };
  const excessOk = executeWithdrawal(
    excessProfile,
    150,
    'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
    '',
    NOW + 2000,
  );
  assert.ok(!('error' in excessOk));
  assert.equal(excessOk.adsDeducted, 15);
  assert.equal(excessOk.profile.withdrawAdsWatched, 30);
  assert.equal(getWithdrawAdGateStatus(excessOk.profile).unlocked, true);

  assert.equal(getWithdrawalStatusMeta(ok.withdrawal.status).label, 'Pending Approval');
  assert.equal(getWithdrawalStatusMeta('approved').label, 'Approved');
  assert.equal(getWithdrawalStatusMeta('rejected').label, 'Rejected');
});

test('daily streak and promo codes prevent duplicate claims', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  const d1 = claimDailyStreak(profile, '2026-11-13', NOW);
  assert.ok(!('error' in d1));
  assert.equal(d1.rewardCoins, 30);

  const d1Again = claimDailyStreak(d1.profile, '2026-11-13', NOW + 5000);
  assert.ok('error' in d1Again);

  const p1 = claimPromoCode(d1.profile, 'chicken2026', NOW);
  assert.ok(!('error' in p1));
  assert.equal(p1.rewardCoins, 500);

  const p1Again = claimPromoCode(p1.profile, 'CHICKEN2026', NOW + 1000);
  assert.ok('error' in p1Again);
});

test('upgradeBasket upgrades 8h to 12h and leaderboard ranks buyers, inviters, and eggs', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  const dep = executeDeposit(profile, 10000, 'GRAM_TON', NOW, 'tx_upgrade_1');
  assert.ok(!('error' in dep));
  const up = upgradeBasket(dep.profile, NOW + 1000);
  assert.ok(!('error' in up));
  assert.equal(up.profile.basketTierHours, 12);

  const lb = buildLeaderboardRankings(
    [
      {
        uid: 'player_other',
        displayName: 'Other',
        handle: '@other',
        photoUrl: '',
        avatarColor: '#10B981',
        referralCode: 'CL-OTHER1',
        buyerPoints: 5,
        inviterCount: 3,
        eggs: 900,
        totalEggsCollected: 900,
        chickensCount: 5,
      },
    ],
    up.profile,
  );
  assert.equal(lb.topBuyers[0].uid, 'player_other');
  assert.equal(lb.topInviters[0].uid, 'player_other');
  assert.equal(lb.topEggs[0].uid, 'player_other');
});

test('resolveTelegramUserIdentity auto-detects Telegram user and query fallback + channel URLs', () => {
  const fromSdk = resolveTelegramUserIdentity({
    tgUser: {
      id: 778899,
      first_name: 'Rahul',
      last_name: 'Verma',
      username: 'rahulv',
      photo_url: 'https://t.me/i/userpic/320/rahulv.jpg',
    },
    startParam: 'CL-REF999',
  });
  assert.equal(fromSdk.playerId, 'tg_778899');
  assert.equal(fromSdk.displayName, 'Rahul Verma');
  assert.equal(fromSdk.handle, '@rahulv');
  assert.equal(fromSdk.photoUrl, 'https://t.me/i/userpic/320/rahulv.jpg');
  assert.equal(fromSdk.startParam, 'CL-REF999');
  assert.equal(fromSdk.isTelegramDetected, true);

  const fromQuery = resolveTelegramUserIdentity({
    search: '?tg_id=112233&tg_name=Aryan&tg_username=aryantest&tg_photo=https://example.com/p.png',
  });
  assert.equal(fromQuery.playerId, 'tg_112233');
  assert.equal(fromQuery.displayName, 'Aryan');
  assert.equal(fromQuery.handle, '@aryantest');
  assert.equal(fromQuery.photoUrl, 'https://example.com/p.png');
  assert.equal(fromQuery.isTelegramDetected, true);

  assert.equal(getTelegramChannelUrl('@AIRDROP_GALAXYS'), 'https://t.me/AIRDROP_GALAXYS');
  assert.equal(getTelegramChannelUrl('@AG_PAYOUTS'), 'https://t.me/AG_PAYOUTS');
});

test('matchGramTransfersFromTonApiEvents rejects spam, fake GRAM tokens, unconfirmed/failed txs, and out-of-range amounts', () => {
  const rawRecipient = friendlyTonAddressToRaw(DEFAULT_GRAM_DEPOSIT_ADDRESS)!;
  assert.ok(rawRecipient.startsWith('0:'));
  assert.equal(friendlyTonAddressToRaw(DEFAULT_GRAM_JETTON_MASTER), OFFICIAL_GRAM_RAW_MASTER);

  const rejected: RejectedGramTransfer[] = [];
  const fakeJettonRaw = '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const matched = matchGramTransfersFromTonApiEvents({
    rawDepositAddress: rawRecipient,
    memo: 'CL-TEST12',
    claimedTxHashes: ['already_claimed_hash'],
    onRejected: (info) => rejected.push(info),
    events: [
      {
        event_id: 'already_claimed_hash',
        in_progress: false,
        timestamp: 1794580000,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '1000000000',
              comment: 'CL-TEST12',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        // Unconfirmed / in-progress must NOT credit coins
        event_id: 'pending_hash_001',
        in_progress: true,
        timestamp: 1794580050,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '1000000000',
              comment: 'CL-TEST12',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        // Fake jetton with symbol GRAM must NOT credit coins
        event_id: 'fake_gram_hash_001',
        in_progress: false,
        timestamp: 1794580060,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '1000000000',
              comment: 'CL-TEST12',
              recipient: { address: rawRecipient },
              jetton: { address: fakeJettonRaw, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        // Below 1,000 coins minimum (0.01 GRAM = 113 coins) must NOT credit
        event_id: 'below_min_hash_001',
        in_progress: false,
        timestamp: 1794580070,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '10000000',
              comment: 'CL-TEST12',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        // Above 15,000 coins maximum (2.0 GRAM = 22,660 coins) must NOT credit
        event_id: 'above_max_hash_001',
        in_progress: false,
        timestamp: 1794580080,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '2000000000',
              comment: 'CL-TEST12',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        // Valid confirmed GRAM transfer within 1k-15k range (0.5 GRAM = 5,665 coins)
        event_id: 'fresh_gram_hash_001',
        in_progress: false,
        timestamp: 1794580100,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '500000000',
              comment: 'CL-TEST12',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9, verification: 'whitelist' },
            },
          },
        ],
      },
      {
        event_id: 'other_user_hash',
        in_progress: false,
        timestamp: 1794580200,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '500000000',
              comment: 'CL-OTHER9',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
    ],
  });

  assert.equal(matched.length, 1);
  assert.equal(matched[0].txHash, 'fresh_gram_hash_001');
  assert.equal(matched[0].gramAmount, 0.5);
  assert.equal(matched[0].coinsToCredit, gramToCoins(0.5));
  assert.deepEqual(
    rejected.map((r) => r.reason),
    ['pending', 'fake_token', 'below_min', 'above_max'],
  );
});

test('referral bonus constants and 5% lifetime egg commission calculate accurately', () => {
  assert.equal(REFERRER_SIGNUP_BONUS_COINS, 150);
  assert.equal(REFERRER_LIFETIME_EGG_COMMISSION_RATE, 0.05);
  assert.equal(calculateReferralEggCommission(0), 0);
  assert.equal(calculateReferralEggCommission(10), 1);
  assert.equal(calculateReferralEggCommission(100), 5);
  assert.equal(calculateReferralEggCommission(300), 15);

  assert.equal(calculateReferralBonusEggs(0), 0);
  assert.equal(calculateReferralBonusEggs(200), REFERRER_SIGNUP_BONUS_EGGS);
  assert.equal(calculateReferralBonusEggs(400), 1000);
});

test('basket-full browser notification triggers only when full, in background, enabled, granted, and once per cycle', () => {
  const base = {
    pendingEggs: 300,
    basketCapacity: 300,
    lastCollectedAt: NOW,
    lastNotifiedCollectedAt: null as number | null,
    isBackgrounded: true,
    notificationsEnabled: true,
    permission: 'granted' as const,
  };

  // Triggers when all criteria are satisfied
  assert.equal(shouldTriggerBasketFullNotification(base), true);

  // Does not trigger when foregrounded or not full
  assert.equal(shouldTriggerBasketFullNotification({ ...base, isBackgrounded: false }), false);
  assert.equal(shouldTriggerBasketFullNotification({ ...base, pendingEggs: 299 }), false);

  // Does not trigger when disabled or permission not granted
  assert.equal(shouldTriggerBasketFullNotification({ ...base, notificationsEnabled: false }), false);
  assert.equal(shouldTriggerBasketFullNotification({ ...base, permission: 'default' }), false);
  assert.equal(shouldTriggerBasketFullNotification({ ...base, permission: 'denied' }), false);

  // Prevents duplicate alert in the same cycle, then resets after next collection
  assert.equal(
    shouldTriggerBasketFullNotification({ ...base, lastNotifiedCollectedAt: NOW }),
    false,
  );
  assert.equal(
    shouldTriggerBasketFullNotification({
      ...base,
      lastCollectedAt: NOW + 10_000,
      lastNotifiedCollectedAt: NOW,
    }),
    true,
  );

  // Timing helper calculates exact remaining ms until basket capacity is reached
  const ms = calculateMsUntilBasketFull({
    productionRatePerHour: 100,
    basketCapacity: 300,
    lastCollectedAt: NOW,
    nowMs: NOW + 3_600_000, // 1h elapsed out of 3h needed
  });
  assert.equal(ms, 7_200_000);
  assert.equal(
    calculateMsUntilBasketFull({
      productionRatePerHour: 0,
      basketCapacity: 300,
      lastCollectedAt: NOW,
      nowMs: NOW,
    }),
    null,
  );
});

test('custom admin tasks merge with built-in tasks and reward coins upon completion', () => {
  const { profile } = createDefaultProfile('player_test1', 'RK', '@rk', NOW);
  const customTasks = [
    {
      id: 'task_admin_1',
      category: 'partner' as const,
      title: 'Join @AIRDROP_GALAXYS',
      rewardCoins: 450,
      icon: 'send',
      actionUrl: 'https://t.me/AIRDROP_GALAXYS',
      isCustom: true,
      isActive: true,
      createdAtMs: NOW,
    },
    {
      id: 'task_admin_paused',
      category: 'daily' as const,
      title: 'Paused Task',
      rewardCoins: 999,
      icon: 'gift',
      isCustom: true,
      isActive: false,
      createdAtMs: NOW,
    },
  ];

  const merged = mergeTaskDefinitions(customTasks);
  assert.ok(merged.some((t) => t.id === 'task_admin_1'));
  assert.ok(!merged.some((t) => t.id === 'task_admin_paused'));

  const done = completeTask(profile, 'task_admin_1', NOW, customTasks);
  assert.ok(!('error' in done));
  assert.equal(done.rewardCoins, 450);
  assert.equal(done.profile.coins, 1450);
  assert.ok(done.profile.completedTaskIds.includes('task_admin_1'));

  const duplicate = completeTask(done.profile, 'task_admin_1', NOW + 1000, customTasks);
  assert.ok('error' in duplicate);
});

test('referred player activates referral only on 1st chicken purchase and summarizeReferrals separates pending vs active', () => {
  const { profile } = createDefaultProfile('player_referred1', 'Priya Sharma', '@priya', NOW);
  assert.equal(profile.referralActivated, false);

  // Without referredBy, buying 1st chicken sets referralActivated=true but shouldActivateReferral=false
  const nonRefBuy = buyChickens(profile, 'leghorn', 1, NOW);
  assert.ok(!('error' in nonRefBuy));
  assert.equal(nonRefBuy.profile.referralActivated, true);
  assert.equal(nonRefBuy.shouldActivateReferral, false);

  // With referredBy, 1st chicken purchase activates referral once, 2nd purchase does not re-trigger
  const referredProfile = { ...profile, referredBy: 'tg_referrer1', coins: 2100 };
  const firstBuy = buyChickens(referredProfile, 'leghorn', 1, NOW);
  assert.ok(!('error' in firstBuy));
  assert.equal(firstBuy.profile.referralActivated, true);
  assert.equal(firstBuy.shouldActivateReferral, true);

  const secondBuy = buyChickens(firstBuy.profile, 'leghorn', 1, NOW + 1000);
  assert.ok(!('error' in secondBuy));
  assert.equal(secondBuy.shouldActivateReferral, false);

  const summary = summarizeReferrals([
    {
      id: 'u_pending',
      referrerUid: 'tg_referrer1',
      referredUid: 'u_pending',
      referredName: 'Pending User',
      referredHandle: '@pending',
      status: 'pending',
      coinsEarned: 0,
      toppedUpUsd: 0,
      createdAtMs: NOW,
    },
    {
      id: 'u_active',
      referrerUid: 'tg_referrer1',
      referredUid: 'u_active',
      referredName: 'Priya Sharma',
      referredHandle: '@priya',
      status: 'active',
      coinsEarned: 200,
      toppedUpUsd: 0,
      createdAtMs: NOW + 1000,
    },
  ]);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.totalBonusEggs, REFERRER_SIGNUP_BONUS_EGGS);
});

test('getChickenMilestoneReached detects 5, 10, 25 milestones and detectTop10RankCelebration guards initial load', () => {
  assert.equal(getChickenMilestoneReached(1, 4), null);
  const m5 = getChickenMilestoneReached(4, 5);
  assert.ok(m5);
  assert.equal(m5.threshold, 5);
  assert.equal(m5.badge, '5 Hens');

  const m10 = getChickenMilestoneReached(9, 10);
  assert.ok(m10);
  assert.equal(m10.threshold, 10);

  // Jumping across two milestones returns the highest milestone reached
  const m25 = getChickenMilestoneReached(8, 25);
  assert.ok(m25);
  assert.equal(m25.threshold, 25);

  assert.equal(getChickenMilestoneReached(10, 10), null);
  assert.equal(getChickenMilestoneReached(12, 10), null);

  // Top 10 celebration must suppress initial load and celebrate entering or climbing inside Top 10
  assert.equal(detectTop10RankCelebration({ previousRank: 11, nextRank: 6, hasInitialized: false }), false);
  assert.equal(detectTop10RankCelebration({ previousRank: null, nextRank: 1, hasInitialized: true }), false);
  assert.equal(detectTop10RankCelebration({ previousRank: 12, nextRank: 9, hasInitialized: true }), true);
  assert.equal(detectTop10RankCelebration({ previousRank: 6, nextRank: 3, hasInitialized: true }), true);
  assert.equal(detectTop10RankCelebration({ previousRank: 4, nextRank: 4, hasInitialized: true }), false);
  assert.equal(detectTop10RankCelebration({ previousRank: 4, nextRank: 7, hasInitialized: true }), false);
  assert.equal(detectTop10RankCelebration({ previousRank: 15, nextRank: 11, hasInitialized: true }), false);
});

test('matchGramTransfersFromTonCenter detects valid GRAM jetton transfers, builds deep links, and deduplicates base64/hex hashes', () => {
  const rawRecipient = friendlyTonAddressToRaw(DEFAULT_GRAM_DEPOSIT_ADDRESS)!;
  const sampleHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00';
  const sampleBase64 = Buffer.from(sampleHex, 'hex').toString('base64');
  assert.equal(normalizeTxHash(sampleBase64), sampleHex);

  const matched = matchGramTransfersFromTonCenter({
    rawDepositAddress: rawRecipient,
    memo: 'CL-TON123',
    claimedTxHashes: [sampleHex],
    transfers: [
      {
        transaction_hash: sampleBase64,
        amount: '800000000',
        destination: '0:jetton_wallet_address',
        destination_address: rawRecipient,
        jetton_master: OFFICIAL_GRAM_RAW_MASTER,
        transaction_now: 1794580000,
        decoded_payload: { type: 'comment', comment: 'CL-TON123' },
      },
      {
        transaction_hash: 'aborted_tc_hash',
        transaction_aborted: true,
        amount: '800000000',
        destination: '0:jetton_wallet_address',
        destination_address: rawRecipient,
        jetton_master: OFFICIAL_GRAM_RAW_MASTER,
        transaction_now: 1794580100,
        decoded_payload: { type: 'comment', comment: 'CL-TON123' },
      },
      {
        transaction_hash: 'fresh_tc_hash_002',
        amount: '1000000000',
        destination: '0:jetton_wallet_address',
        destination_address: rawRecipient,
        jetton_master: OFFICIAL_GRAM_RAW_MASTER,
        transaction_now: 1794580500,
        decoded_payload: { type: 'comment', comment: 'CL-TON123' },
      },
    ],
  });

  assert.equal(matched.length, 1);
  assert.equal(matched[0].txHash, 'fresh_tc_hash_002');
  assert.equal(matched[0].gramAmount, 1);
  assert.equal(matched[0].coinsToCredit, gramToCoins(1));

  const tonUrl = buildGramTransferUrl({
    depositAddress: DEFAULT_GRAM_DEPOSIT_ADDRESS,
    jettonMaster: DEFAULT_GRAM_JETTON_MASTER,
    gramAmount: 0.4413,
    memo: 'CL-TON123',
    scheme: 'ton',
  });
  assert.ok(tonUrl.startsWith(`ton://transfer/${DEFAULT_GRAM_DEPOSIT_ADDRESS}?`));
  assert.ok(tonUrl.includes(`jetton=${DEFAULT_GRAM_JETTON_MASTER}`));
  assert.ok(tonUrl.includes('amount=441300000'));
  assert.ok(tonUrl.includes('text=CL-TON123'));
});

test('i18n dictionary provides localized strings for every dropdown option and validates language codes', () => {
  for (const option of LANGUAGE_OPTIONS) {
    assert.equal(isValidLanguageCode(option.code), true);
    const dict = t(option.code);
    assert.ok(dict.farm.length > 0);
    assert.ok(dict.languageAndAudio.length > 0);
    assert.ok(dict.languageLabel.length > 0);
    assert.ok(dict.collect.length > 0);
  }
  assert.equal(isValidLanguageCode('zz'), false);
  assert.equal(t('hi').collect, 'इकट्ठा करें');
  assert.equal(t('es').wallet, 'Billetera');
});

test('filterWithdrawalsByTab filters between All, Pending, and Completed withdrawal requests', () => {
  const sampleWithdrawals = [
    {
      id: 'wd_1',
      userId: 'player_test1',
      eggsAmount: 100,
      gramAmount: '0.000612',
      usdValue: 0.0007,
      walletAddress: 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
      memo: '',
      network: 'GRAM_TON' as const,
      status: 'pending' as const,
      createdAtMs: NOW,
    },
    {
      id: 'wd_2',
      userId: 'player_test1',
      eggsAmount: 200,
      gramAmount: '0.001225',
      usdValue: 0.0014,
      walletAddress: 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
      memo: '',
      network: 'GRAM_TON' as const,
      status: 'processing' as const,
      createdAtMs: NOW + 1000,
    },
    {
      id: 'wd_3',
      userId: 'player_test1',
      eggsAmount: 300,
      gramAmount: '0.001838',
      usdValue: 0.0021,
      walletAddress: 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
      memo: '',
      network: 'GRAM_TON' as const,
      status: 'approved' as const,
      createdAtMs: NOW + 2000,
    },
    {
      id: 'wd_4',
      userId: 'player_test1',
      eggsAmount: 400,
      gramAmount: '0.002450',
      usdValue: 0.0028,
      walletAddress: 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
      memo: '',
      network: 'GRAM_TON' as const,
      status: 'completed' as const,
      createdAtMs: NOW + 3000,
    },
    {
      id: 'wd_5',
      userId: 'player_test1',
      eggsAmount: 150,
      gramAmount: '0.000919',
      usdValue: 0.001,
      walletAddress: 'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
      memo: '',
      network: 'GRAM_TON' as const,
      status: 'rejected' as const,
      createdAtMs: NOW + 4000,
    },
  ];

  assert.equal(filterWithdrawalsByTab(sampleWithdrawals, 'all').length, 5);
  assert.deepEqual(
    filterWithdrawalsByTab(sampleWithdrawals, 'pending').map((w) => w.id),
    ['wd_1', 'wd_2'],
  );
  assert.deepEqual(
    filterWithdrawalsByTab(sampleWithdrawals, 'completed').map((w) => w.id),
    ['wd_3', 'wd_4'],
  );
});

test('auto-memo and User ID detection match TG numeric ID and player UID without CL- codes or false positives', () => {
  const rawRecipient = friendlyTonAddressToRaw(DEFAULT_GRAM_DEPOSIT_ADDRESS)!;
  assert.equal(getPrimaryDepositMemo('tg_778899123'), '778899123');
  assert.equal(getPrimaryDepositMemo('player_abc123'), 'player_abc123');

  const accepted = buildAcceptedDepositMemos('tg_778899123');
  assert.deepEqual(accepted, ['778899123', 'tg_778899123']);

  const matched = matchGramTransfersFromTonApiEvents({
    rawDepositAddress: rawRecipient,
    memo: '778899123',
    acceptedMemos: accepted,
    events: [
      {
        event_id: 'tg_numeric_memo_tx',
        in_progress: false,
        timestamp: 1794580100,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '500000000',
              comment: '778899123',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        event_id: 'tg_uid_memo_tx',
        in_progress: false,
        timestamp: 1794580150,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '500000000',
              comment: 'tg_778899123',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        event_id: 'cl_code_memo_tx_ignored',
        in_progress: false,
        timestamp: 1794580200,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '500000000',
              comment: 'CL-899123',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
      {
        event_id: 'unrelated_user_tx',
        in_progress: false,
        timestamp: 1794580300,
        actions: [
          {
            type: 'JettonTransfer',
            status: 'ok',
            JettonTransfer: {
              amount: '500000000',
              comment: '991122334',
              recipient: { address: rawRecipient },
              jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(
    matched.map((m) => m.txHash),
    ['tg_numeric_memo_tx', 'tg_uid_memo_tx'],
  );
});

test('strict memo-only detection blocks cross-user hashes and repeated txHash reuse', () => {
  const rawRecipient = friendlyTonAddressToRaw(DEFAULT_GRAM_DEPOSIT_ADDRESS)!;
  const sampleHex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  // Empty memo must never match any transfer
  assert.equal(
    matchGramTransfersFromTonApiEvents({
      rawDepositAddress: rawRecipient,
      memo: '',
      acceptedMemos: [],
      events: [
        {
          event_id: sampleHex,
          in_progress: false,
          timestamp: 1794580400,
          actions: [
            {
              type: 'JettonTransfer',
              status: 'ok',
              JettonTransfer: {
                amount: '500000000',
                comment: '778899123',
                recipient: { address: rawRecipient },
                jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
              },
            },
          ],
        },
      ],
    }).length,
    0,
  );

  // Another user's transfer cannot be matched by player B
  assert.equal(
    matchGramTransfersFromTonApiEvents({
      rawDepositAddress: rawRecipient,
      memo: '111222333',
      acceptedMemos: ['111222333', 'tg_111222333'],
      events: [
        {
          event_id: sampleHex,
          in_progress: false,
          timestamp: 1794580400,
          actions: [
            {
              type: 'JettonTransfer',
              status: 'ok',
              JettonTransfer: {
                amount: '500000000',
                comment: '778899123',
                recipient: { address: rawRecipient },
                jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
              },
            },
          ],
        },
      ],
    }).length,
    0,
  );

  // Already-claimed txHash cannot be credited a second time (even with uppercase hex)
  assert.equal(
    matchGramTransfersFromTonApiEvents({
      rawDepositAddress: rawRecipient,
      memo: '778899123',
      acceptedMemos: ['778899123'],
      claimedTxHashes: [sampleHex.toUpperCase()],
      events: [
        {
          event_id: sampleHex,
          in_progress: false,
          timestamp: 1794580400,
          actions: [
            {
              type: 'JettonTransfer',
              status: 'ok',
              JettonTransfer: {
                amount: '500000000',
                comment: '778899123',
                recipient: { address: rawRecipient },
                jetton: { address: OFFICIAL_GRAM_RAW_MASTER, symbol: 'GRAM', decimals: 9 },
              },
            },
          ],
        },
      ],
    }).length,
    0,
  );

  // Deterministic deposit IDs remain identical regardless of hex casing
  assert.deepEqual(
    buildDeterministicDepositIds(sampleHex),
    buildDeterministicDepositIds(sampleHex.toUpperCase()),
  );
});

test('global theme helpers validate modes, persist to localStorage, toggle .dark class, and have localized labels', () => {
  assert.equal(isValidThemeMode('light'), true);
  assert.equal(isValidThemeMode('dark'), true);
  assert.equal(isValidThemeMode('system'), false);
  assert.equal(isValidThemeMode(null), false);

  for (const option of LANGUAGE_OPTIONS) {
    assert.ok(t(option.code).darkMode.length > 0);
  }

  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevDocument = (globalThis as { document?: unknown }).document;
  const store = new Map<string, string>();
  const classes = new Set<string>();
  const docEl = {
    classList: {
      toggle: (cls: string, force?: boolean) => {
        const shouldAdd = force ?? !classes.has(cls);
        if (shouldAdd) classes.add(cls);
        else classes.delete(cls);
        return shouldAdd;
      },
      contains: (cls: string) => classes.has(cls),
    },
    dataset: {} as Record<string, string>,
    style: { colorScheme: '' },
  };

  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val);
      },
    },
  };
  (globalThis as { document?: unknown }).document = {
    documentElement: docEl,
  };

  try {
    assert.equal(getStoredTheme(), 'light');

    setStoredTheme('dark');
    assert.equal(store.get(THEME_STORAGE_KEY), 'dark');
    assert.equal(getStoredTheme(), 'dark');
    assert.equal(classes.has('dark'), true);
    assert.equal(docEl.dataset.theme, 'dark');
    assert.equal(docEl.style.colorScheme, 'dark');

    setStoredTheme('light');
    assert.equal(store.get(THEME_STORAGE_KEY), 'light');
    assert.equal(getStoredTheme(), 'light');
    assert.equal(classes.has('dark'), false);
    assert.equal(docEl.dataset.theme, 'light');
    assert.equal(docEl.style.colorScheme, 'light');

    applyThemeToDocument('dark');
    assert.equal(classes.has('dark'), true);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
    if (prevDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = prevDocument;
    }
  }
});

test('formatReferralHandle normalizes @ prefix and falls back safely when handle is empty', () => {
  assert.equal(formatReferralHandle('priya'), '@priya');
  assert.equal(formatReferralHandle('  @AryanDev  '), '@AryanDev');
  assert.equal(formatReferralHandle('', 'tg_778899123'), '@899123');
  assert.equal(formatReferralHandle('   ', ''), '@farmer');
});

test('buildInvitedFriendsList sorts newest-first, matches handles safely without prefix collisions, and sums eggs', () => {
  const referrals = [
    {
      id: 'u_ann',
      referrerUid: 'tg_ref',
      referredUid: 'u_ann',
      referredName: 'Ann',
      referredHandle: 'ann',
      status: 'active' as const,
      coinsEarned: 150,
      toppedUpUsd: 0,
      createdAtMs: NOW + 1000,
    },
    {
      id: 'u_anna',
      referrerUid: 'tg_ref',
      referredUid: 'u_anna',
      referredName: 'Anna',
      referredHandle: '@anna',
      status: 'active' as const,
      coinsEarned: 150,
      toppedUpUsd: 1.5,
      eggsEarned: 10,
      createdAtMs: NOW + 3000,
    },
    {
      id: 'u_legacy',
      referrerUid: 'tg_ref',
      referredUid: 'u_legacy',
      referredName: 'Legacy Friend',
      referredHandle: '',
      status: 'active' as const,
      coinsEarned: 150,
      toppedUpUsd: 0,
      createdAtMs: NOW + 2000,
    },
    {
      id: 'u_pending',
      referrerUid: 'tg_ref',
      referredUid: 'u_pending',
      referredName: 'Pending Pal',
      referredHandle: 'pendingpal',
      status: 'pending' as const,
      coinsEarned: 0,
      toppedUpUsd: 0,
      createdAtMs: NOW + 4000,
    },
  ];

  const transactions = [
    {
      id: 'tx_1',
      userId: 'tg_ref',
      type: 'referral' as const,
      title: '5% eggs · @ann (Ann)',
      amount: 12,
      currency: 'eggs' as const,
      usdValue: 0.0001,
      status: 'completed' as const,
      createdAtMs: NOW + 5000,
    },
    {
      id: 'tx_2',
      userId: 'tg_ref',
      type: 'referral' as const,
      title: '5% eggs · @anna (Anna)',
      amount: 25,
      currency: 'eggs' as const,
      usdValue: 0.0002,
      status: 'completed' as const,
      createdAtMs: NOW + 6000,
    },
    {
      id: 'tx_3',
      userId: 'tg_ref',
      type: 'referral' as const,
      title: '5% lifetime eggs from Legacy Friend',
      amount: 18,
      currency: 'eggs' as const,
      usdValue: 0.0001,
      status: 'completed' as const,
      createdAtMs: NOW + 7000,
    },
    {
      // Non-egg referral coin bonus must not count toward eggsGenerated
      id: 'tx_4',
      userId: 'tg_ref',
      type: 'referral' as const,
      title: 'Referral signup bonus @ann',
      amount: 150,
      currency: 'coins' as const,
      usdValue: 0.015,
      status: 'completed' as const,
      createdAtMs: NOW + 8000,
    },
  ];

  const list = buildInvitedFriendsList(referrals, transactions);
  assert.deepEqual(
    list.map((f) => f.id),
    ['u_pending', 'u_anna', 'u_legacy', 'u_ann'],
  );

  const byId = Object.fromEntries(list.map((f) => [f.id, f]));
  assert.equal(byId.u_pending.formattedHandle, '@pendingpal');
  assert.equal(byId.u_pending.eggsGenerated, 0);

  assert.equal(byId.u_anna.formattedHandle, '@anna');
  assert.equal(byId.u_anna.eggsGenerated, 35); // 10 baseline + 25 tx

  assert.equal(byId.u_ann.formattedHandle, '@ann');
  assert.equal(byId.u_ann.eggsGenerated, 12); // Not polluted by @anna or coin bonus

  assert.equal(byId.u_legacy.formattedHandle, '@legacy');
  assert.equal(byId.u_legacy.eggsGenerated, 18);
});

test('referralShare builds Telegram Mini App t.me startapp URL with auto-detected bot and ID, invokes Web Share API, and handles cancel/fallback cleanly', async () => {
  assert.equal(getReferralStartId('tg_7508911853', 'CL-911853'), '7508911853');
  assert.equal(getReferralStartId('player_abc123', 'CL-ABC123'), 'player_abc123');
  assert.equal(getReferralStartId('', 'CL-911853'), 'CL-911853');

  const url = buildPersonalReferralUrl('7508911853', {
    botUsername: 'AlphaGramAiBot',
    appShortName: 'app',
  });
  assert.equal(url, 'https://t.me/AlphaGramAiBot/app?startapp=7508911853');
  const expectedDefaultUrl = DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME
    ? `https://t.me/${DEFAULT_TELEGRAM_BOT_USERNAME}/${DEFAULT_TELEGRAM_MINIAPP_SHORT_NAME}?startapp=player_abc123`
    : `https://t.me/${DEFAULT_TELEGRAM_BOT_USERNAME}?startapp=player_abc123`;
  assert.equal(buildPersonalReferralUrl('player_abc123'), expectedDefaultUrl);
  assert.equal(buildPersonalReferralUrl('player_abc123'), 'https://t.me/AlphaGramAiBot?startapp=player_abc123');
  assert.equal(
    buildPersonalReferralUrl('', { botUsername: '@CustomFarmBot', appShortName: 'game' }),
    'https://t.me/CustomFarmBot/game',
  );

  const tgDirectShare = buildTelegramDirectShareUrl(url, '7508911853', 'Rahul');
  assert.ok(tgDirectShare.startsWith('https://t.me/share/url?text='));
  assert.ok(!tgDirectShare.includes('?url='));
  const decodedTgText = decodeURIComponent(tgDirectShare.replace('https://t.me/share/url?text=', ''));
  assert.ok(decodedTgText.endsWith(url));
  assert.ok(decodedTgText.includes("Rahul's"));

  const payload = buildReferralShareData('7508911853', url, 'Rahul');
  assert.equal(payload.title, 'Join Alpha Gram!');
  assert.equal(payload.url, url);
  assert.ok(!payload.text?.includes('7508911853'));
  assert.ok(payload.text?.includes("Rahul's"));
  assert.ok(payload.text?.includes('Alpha Gram farm and claim +1,000 sign-up bonus coins!'));

  // 1. Web Share API succeeds
  let sharedPayload: ShareData | null = null;
  let clipboardCalls = 0;
  const okOutcome = await shareReferralLink({
    referralCode: '7508911853',
    referralUrl: url,
    referrerName: 'Rahul',
    nav: {
      share: async (data) => {
        sharedPayload = data;
      },
      clipboard: {
        writeText: async () => {
          clipboardCalls += 1;
        },
      },
    },
  });
  assert.equal(okOutcome, 'shared');
  assert.deepEqual(sharedPayload, payload);
  assert.equal(clipboardCalls, 0);

  // 2. AbortError returns 'cancelled' without overwriting clipboard
  const cancelOutcome = await shareReferralLink({
    referralCode: 'CL-778899',
    referralUrl: url,
    nav: {
      share: async () => {
        const err = new Error('Share dismissed');
        err.name = 'AbortError';
        throw err;
      },
      clipboard: {
        writeText: async () => {
          clipboardCalls += 1;
        },
      },
    },
  });
  assert.equal(cancelOutcome, 'cancelled');
  assert.equal(clipboardCalls, 0);

  // 3. NotAllowedError or canShare=false falls back to clipboard copy
  let copiedText = '';
  const fallbackOutcome = await shareReferralLink({
    referralCode: 'CL-778899',
    referralUrl: url,
    nav: {
      canShare: () => false,
      share: async () => {
        throw new Error('Should not be called when canShare returns false');
      },
      clipboard: {
        writeText: async (text) => {
          copiedText = text;
        },
      },
    },
  });
  assert.equal(fallbackOutcome, 'copied');
  assert.equal(copiedText, url);

  let errorFallbackCopied = '';
  const errFallbackOutcome = await shareReferralLink({
    referralCode: 'CL-778899',
    referralUrl: url,
    nav: {
      share: async () => {
        throw new Error('Blocked by iframe policy');
      },
      clipboard: {
        writeText: async (text) => {
          errorFallbackCopied = text;
        },
      },
    },
  });
  assert.equal(errFallbackOutcome, 'copied');
  assert.equal(errorFallbackCopied, url);
});

test('Mute All controls both music and sound effects globally and persists synced settings', () => {
  assert.equal(isAllAudioMuted(DEFAULT_AUDIO_SETTINGS), false);
  assert.equal(t('en').muteAll, 'Mute All');
  assert.equal(t('en').unmuteAll, 'Unmute All');

  // 1. Muting from active music + sounds turns both off and remembers prior state
  const mutedFromBoth = computeMuteAllToggle({
    musicEnabled: true,
    soundsEnabled: true,
  });
  assert.equal(mutedFromBoth.musicEnabled, false);
  assert.equal(mutedFromBoth.soundsEnabled, false);
  assert.equal(isAllAudioMuted(mutedFromBoth), true);

  // 2. Unmuting restores both music + sounds
  const restoredBoth = computeMuteAllToggle(mutedFromBoth);
  assert.equal(restoredBoth.musicEnabled, true);
  assert.equal(restoredBoth.soundsEnabled, true);
  assert.equal(isAllAudioMuted(restoredBoth), false);

  // 3. Muting from sounds-only preserves music=false when unmuting
  const mutedSoundsOnly = computeMuteAllToggle({
    musicEnabled: false,
    soundsEnabled: true,
  });
  assert.equal(isAllAudioMuted(mutedSoundsOnly), true);
  const restoredSoundsOnly = computeMuteAllToggle(mutedSoundsOnly);
  assert.equal(restoredSoundsOnly.musicEnabled, false);
  assert.equal(restoredSoundsOnly.soundsEnabled, true);

  // 4. Unmuting when both were manually turned off enables audio globally
  const unmutedFromManualOff = computeMuteAllToggle({
    musicEnabled: false,
    soundsEnabled: false,
  });
  assert.equal(unmutedFromManualOff.musicEnabled, true);
  assert.equal(unmutedFromManualOff.soundsEnabled, true);

  // 5. Storage persistence roundtrip
  const prevWindow = (globalThis as { window?: unknown }).window;
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val);
      },
    },
  };

  try {
    assert.deepEqual(getStoredAudioSettings(), DEFAULT_AUDIO_SETTINGS);
    setStoredAudioSettings(mutedFromBoth);
    assert.ok(store.has(AUDIO_SETTINGS_STORAGE_KEY));
    assert.deepEqual(getStoredAudioSettings(), mutedFromBoth);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('buildReferralGrowthSeries aggregates daily new referrals over the last 7 days', () => {
  const refTime = new Date(2026, 10, 14, 15, 30, 0).getTime(); // Nov 14, 2026 15:30 local
  const dayMs = 24 * 60 * 60 * 1000;

  const referrals = [
    {
      id: 'ref_today_1',
      referrerUid: 'tg_host',
      referredUid: 'ref_today_1',
      referredName: 'Asha',
      referredHandle: '@asha',
      status: 'active' as const,
      coinsEarned: 150,
      toppedUpUsd: 0,
      createdAtMs: refTime - 60 * 60 * 1000, // Today (Nov 14)
    },
    {
      id: 'ref_today_2',
      referrerUid: 'tg_host',
      referredUid: 'ref_today_2',
      referredName: 'Kabir',
      referredHandle: '@kabir',
      status: 'pending' as const,
      coinsEarned: 0,
      toppedUpUsd: 0,
      createdAtMs: refTime - 2 * 60 * 60 * 1000, // Today (Nov 14)
    },
    {
      id: 'ref_2d_ago',
      referrerUid: 'tg_host',
      referredUid: 'ref_2d_ago',
      referredName: 'Maya',
      referredHandle: '@maya',
      status: 'active' as const,
      coinsEarned: 150,
      toppedUpUsd: 1,
      createdAtMs: refTime - 2 * dayMs, // Nov 12
    },
    {
      id: 'ref_too_old',
      referrerUid: 'tg_host',
      referredUid: 'ref_too_old',
      referredName: 'Old Pal',
      referredHandle: '@oldpal',
      status: 'active' as const,
      coinsEarned: 150,
      toppedUpUsd: 0,
      createdAtMs: refTime - 8 * dayMs, // Nov 6 (outside 7-day window)
    },
  ];

  const series = buildReferralGrowthSeries(referrals, refTime, 7);
  assert.equal(series.length, 7);
  assert.equal(series[0].dateKey, '2026-11-08');
  assert.equal(series[6].dateKey, '2026-11-14');

  // Nov 12 (index 4) has 1 active referral
  assert.equal(series[4].dateKey, '2026-11-12');
  assert.equal(series[4].newReferrals, 1);
  assert.equal(series[4].activeReferrals, 1);
  assert.equal(series[4].pendingReferrals, 0);

  // Nov 14 (index 6) has 2 referrals (1 active, 1 pending)
  assert.equal(series[6].newReferrals, 2);
  assert.equal(series[6].activeReferrals, 1);
  assert.equal(series[6].pendingReferrals, 1);

  // Empty days are zero-filled and out-of-window referrals excluded
  const totalInWindow = series.reduce((sum, pt) => sum + pt.newReferrals, 0);
  assert.equal(totalInWindow, 3);
});

test('level yield multiplier (+2%/lvl above Level 1) and 2x Laying Feed booster scale production rate accurately', () => {
  const { profile } = createDefaultProfile('player_boost1', 'Karan', '@karan', NOW);
  assert.equal(calculateLevelYieldMultiplier(1), 1.0);
  assert.equal(calculateLevelYieldMultiplier(6), 1.1); // +10%
  assert.equal(calculateProductionRate(profile, NOW), 0);
  assert.ok('error' in activateFeedBooster(profile, NOW));

  const starterProfile = { ...profile, leghornCount: 2 };
  assert.equal(calculateProductionRate(starterProfile, NOW), 16); // 2 * 8

  const lv6Profile = { ...profile, level: 6, leghornCount: 10 };
  assert.equal(calculateProductionRate(lv6Profile, NOW), 88); // 80 * 1.1

  const activated = activateFeedBooster(lv6Profile, NOW);
  assert.ok(!('error' in activated));
  assert.equal(activated.profile.coins, profile.coins - FEED_BOOSTER_COST_COINS);
  assert.equal(activated.profile.feedBoostUntilMs, NOW + FEED_BOOSTER_DURATION_MS);
  assert.equal(isFeedBoosterActive(activated.profile, NOW + 1000), true);
  assert.equal(calculateProductionRate(activated.profile, NOW + 1000), 176); // 88 * 2

  const duplicate = activateFeedBooster(activated.profile, NOW + 1000);
  assert.ok('error' in duplicate);

  const afterExpiry = NOW + FEED_BOOSTER_DURATION_MS + 1000;
  assert.equal(isFeedBoosterActive(activated.profile, afterExpiry), false);
  assert.equal(calculateProductionRate(activated.profile, afterExpiry), 88);
});

test('golden egg drops require at least 1 chicken, reward bonus coins + XP, and enforce cooldown', () => {
  const { profile } = createDefaultProfile('player_gold1', 'Meera', '@meera', NOW);
  assert.ok('error' in claimGoldenEggDrop(profile, NOW));

  const activeFarm = { ...profile, leghornCount: 1 };
  assert.equal(isGoldenEggReady(activeFarm, NOW), true);

  const drop = claimGoldenEggDrop(activeFarm, NOW);
  assert.ok(!('error' in drop));
  assert.equal(drop.bonusCoins, GOLDEN_EGG_REWARD_COINS);
  assert.equal(drop.xpGained, GOLDEN_EGG_REWARD_XP);
  assert.equal(drop.profile.coins, activeFarm.coins + GOLDEN_EGG_REWARD_COINS);
  assert.equal(drop.profile.goldenEggsFound, 1);

  assert.equal(GOLDEN_EGG_COOLDOWN_MS, 5 * 60 * 60 * 1000);
  assert.equal(isGoldenEggReady(drop.profile, NOW + 10_000), false);
  assert.equal(isGoldenEggReady(drop.profile, NOW + 4 * 60 * 60 * 1000), false);
  const tooEarly = claimGoldenEggDrop(drop.profile, NOW + 10_000);
  assert.ok('error' in tooEarly);
  assert.match(tooEarly.error, /4h 59m left/);

  const afterCooldown = claimGoldenEggDrop(drop.profile, NOW + GOLDEN_EGG_COOLDOWN_MS);
  assert.ok(!('error' in afterCooldown));
  assert.equal(afterCooldown.profile.goldenEggsFound, 2);
});

test('achievements unlock on progress milestones and prevent duplicate claims', () => {
  const { profile } = createDefaultProfile('player_ach1', 'Dev', '@dev', NOW);
  const lockedErr = claimAchievement(profile, 'first_harvest', NOW);
  assert.ok('error' in lockedErr);

  const progressed = { ...profile, totalEggsCollected: 120 };
  const list = getAchievementsProgress(progressed);
  const firstHarvest = list.find((a) => a.id === 'first_harvest');
  assert.ok(firstHarvest?.unlocked);
  assert.equal(firstHarvest?.claimed, false);

  const claimed = claimAchievement(progressed, 'first_harvest', NOW);
  assert.ok(!('error' in claimed));
  assert.equal(claimed.rewardCoins, 75);
  assert.equal(claimed.profile.coins, progressed.coins + 75);

  const dup = claimAchievement(claimed.profile, 'first_harvest', NOW + 1000);
  assert.ok('error' in dup);
});

test('referral milestone crates unlock at 3/10/25 active referrals and grant coins + hens', () => {
  const { profile } = createDefaultProfile('player_refcrate', 'Neha', '@neha', NOW);
  assert.equal(REFERRAL_MILESTONE_CRATES.length, 3);

  const locked = claimReferralMilestone(profile, 3, 2, NOW);
  assert.ok('error' in locked);

  const bronze = claimReferralMilestone({ ...profile, referralCount: 3 }, 3, 3, NOW);
  assert.ok(!('error' in bronze));
  assert.equal(bronze.crate.rewardCoins, 300);
  assert.equal(bronze.profile.leghornCount, profile.leghornCount);

  const silver = claimReferralMilestone({ ...bronze.profile, referralCount: 10 }, 10, 10, NOW);
  assert.ok(!('error' in silver));
  assert.equal(silver.crate.rewardCoins, 1200);
  assert.equal(silver.profile.leghornCount, profile.leghornCount + 1);

  const dup = claimReferralMilestone(silver.profile, 10, 10, NOW + 1000);
  assert.ok('error' in dup);
});

test('buildEarningsChartSeries aggregates daily eggs collected and coin inflows cleanly', () => {
  const refTime = new Date(2026, 10, 14, 15, 0, 0).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const series = buildEarningsChartSeries(
    [
      {
        id: 't1',
        userId: 'u1',
        type: 'collect',
        title: 'Collected eggs',
        amount: 120,
        currency: 'eggs',
        usdValue: 0.001,
        status: 'completed',
        createdAtMs: refTime - 60_000,
      },
      {
        id: 't2',
        userId: 'u1',
        type: 'golden_egg',
        title: 'Golden Egg',
        amount: 25,
        currency: 'coins',
        usdValue: 0.0025,
        status: 'completed',
        createdAtMs: refTime - dayMs,
      },
      {
        id: 't3',
        userId: 'u1',
        type: 'buy_chicken',
        title: 'Bought Leghorn',
        amount: -1000,
        currency: 'coins',
        usdValue: 0.1,
        status: 'completed',
        createdAtMs: refTime - dayMs,
      },
    ],
    refTime,
    7,
  );
  assert.equal(series.length, 7);
  assert.equal(series[6].eggsCollected, 120);
  assert.equal(series[5].coinsEarned, 25);
});

test('dynamic admin promo codes validate active status, maxUses, expiry, and default season config', () => {
  const { profile } = createDefaultProfile('player_dynpromo', 'Ravi', '@ravi', NOW);
  const promos = [
    {
      code: 'SEASON1',
      label: 'Season Launch Drop',
      coins: 400,
      maxUses: 10,
      usedCount: 2,
      expiresAtMs: NOW + 3600_000,
      isActive: true,
      createdAtMs: NOW,
    },
    {
      code: 'PAUSED1',
      label: 'Paused Code',
      coins: 200,
      maxUses: 0,
      usedCount: 0,
      expiresAtMs: 0,
      isActive: false,
      createdAtMs: NOW,
    },
    {
      code: 'EXPIRED1',
      label: 'Old Code',
      coins: 200,
      maxUses: 0,
      usedCount: 0,
      expiresAtMs: NOW - 1000,
      isActive: true,
      createdAtMs: NOW - 5000,
    },
    {
      code: 'CAPPED1',
      label: 'Full Code',
      coins: 200,
      maxUses: 5,
      usedCount: 5,
      expiresAtMs: 0,
      isActive: true,
      createdAtMs: NOW,
    },
  ];

  assert.ok('error' in claimPromoCode(profile, 'PAUSED1', NOW, promos));
  assert.ok('error' in claimPromoCode(profile, 'EXPIRED1', NOW, promos));
  assert.ok('error' in claimPromoCode(profile, 'CAPPED1', NOW, promos));

  const ok = claimPromoCode(profile, 'season1', NOW, promos);
  assert.ok(!('error' in ok));
  assert.equal(ok.rewardCoins, 400);
  assert.equal(ok.dynamicPromoCode, 'SEASON1');
  assert.equal(ok.profile.coins, profile.coins + 400);

  const season = createDefaultSeasonConfig(NOW);
  assert.equal(season.seasonNumber, 1);
  assert.ok(season.prizePoolCoins > 0);
  assert.ok(season.endsAtMs > NOW);
});

test('daily Watch & Earn Coins tasks reward 80/90/100 coins, enforce 5/day limit, prune stale dates, and do not grant free chickens', () => {
  assert.deepEqual(
    AD_NETWORK_TASKS.map((n) => [n.id, n.rewardCoins, n.dailyLimit]),
    [
      ['adsgram', 80, 5],
      ['gigapub', 90, 5],
      ['monetag', 100, 5],
    ],
  );

  const { profile } = createDefaultProfile('player_adnet', 'Kiran', '@kiran', NOW);
  let current = {
    ...profile,
    completedTaskIds: ['milestone_react', 'ad_adsgram_2026-11-13_1'],
  };

  // 1st claim today on Monetag (+100 coins) increments totalAdsWatched without adding chickens
  const monetagRes = claimAdNetworkReward(current, 'monetag', '2026-11-14', NOW);
  assert.ok(!('error' in monetagRes));
  assert.equal(monetagRes.rewardCoins, 100);
  assert.equal(monetagRes.watchedToday, 1);
  assert.equal(monetagRes.profile.coins, current.coins + 100);
  assert.equal(monetagRes.profile.leghornCount, 0);
  assert.equal(getTotalAdsWatched(monetagRes.profile), 1);
  assert.ok(monetagRes.profile.completedTaskIds.includes('milestone_react'));
  assert.ok(!monetagRes.profile.completedTaskIds.includes('ad_adsgram_2026-11-13_1'));
  assert.equal(getAdNetworkClaimCountToday(monetagRes.profile.completedTaskIds, 'monetag', '2026-11-14'), 1);

  // AdsGram (+80) and Gigapub (+90) track separate 5/day quotas
  const adsgramRes = claimAdNetworkReward(monetagRes.profile, 'adsgram', '2026-11-14', NOW + 1000);
  assert.ok(!('error' in adsgramRes));
  assert.equal(adsgramRes.rewardCoins, 80);

  const gigapubRes = claimAdNetworkReward(adsgramRes.profile, 'gigapub', '2026-11-14', NOW + 2000);
  assert.ok(!('error' in gigapubRes));
  assert.equal(gigapubRes.rewardCoins, 90);
  assert.equal(gigapubRes.profile.leghornCount, 0);
  assert.equal(getTotalAdsWatched(gigapubRes.profile), 3);

  // Exhaust remaining 4 AdsGram claims today -> 6th claim fails
  current = gigapubRes.profile;
  for (let i = 0; i < 4; i += 1) {
    const next = claimAdNetworkReward(current, 'adsgram', '2026-11-14', NOW + 3000 + i * 1000);
    assert.ok(!('error' in next));
    current = next.profile;
  }
  assert.equal(getAdNetworkClaimCountToday(current.completedTaskIds, 'adsgram', '2026-11-14'), 5);
  const capped = claimAdNetworkReward(current, 'adsgram', '2026-11-14', NOW + 10000);
  assert.ok('error' in capped);
});

test('task slots enforcement blocks completion when remaining slots reach 0 and merges 4 task categories', () => {
  const { profile } = createDefaultProfile('player_slots', 'Zara', '@zara', NOW);
  const customTasks = [
    {
      id: 'task_social_1',
      category: 'social' as const,
      title: 'Follow X',
      rewardCoins: 120,
      icon: 'users',
      isCustom: true,
      isActive: true,
      totalSlots: 10,
      claimedCount: 9,
      createdAtMs: NOW,
    },
    {
      id: 'task_exclusive_full',
      category: 'exclusive' as const,
      title: 'Sold Out VIP Drop',
      rewardCoins: 500,
      icon: 'gift',
      isCustom: true,
      isActive: true,
      totalSlots: 50,
      claimedCount: 50,
      createdAtMs: NOW,
    },
  ];

  const merged = mergeTaskDefinitions(customTasks);
  assert.ok(merged.some((t) => t.category === 'social'));
  assert.ok(merged.some((t) => t.category === 'daily'));
  assert.ok(merged.some((t) => t.category === 'exclusive'));
  assert.ok(merged.some((t) => t.category === 'partner'));

  assert.equal(getTaskRemainingSlots(customTasks[0], false), 1);
  assert.equal(getTaskRemainingSlots(customTasks[1], false), 0);

  const ok = completeTask(profile, 'task_social_1', NOW, customTasks);
  assert.ok(!('error' in ok));
  assert.equal(ok.isCustomTask, true);
  assert.equal(ok.rewardCoins, 120);

  const builtInDone = completeTask(profile, 'daily_news', NOW, customTasks);
  assert.ok(!('error' in builtInDone));
  assert.equal(builtInDone.isCustomTask, false);

  const fullErr = completeTask(profile, 'task_exclusive_full', NOW, customTasks);
  assert.ok('error' in fullErr);
});

test('paid user task creation enforces 10k min (60 joins @ 150/join, 10% fee = 1,000), deducts coins, and blocks self-claim', () => {
  // Minimum criteria: 150 coins * 60 slots = 9,000 pool + 1,000 fee (10% of 10,000 gross) = 10,000 total
  const minCost = calculatePaidTaskCost(150, 60);
  assert.equal(minCost.rewardPoolCoins, 9000);
  assert.equal(minCost.platformFeeCoins, 1000);
  assert.equal(minCost.totalCostCoins, 10000);

  // Scaling: 200 coins * 40 slots = 8,000 pool -> gross Math.round(8000 / 0.9) = 8,889 -> 889 fee
  const scaledCost = calculatePaidTaskCost(200, 40);
  assert.equal(scaledCost.rewardPoolCoins, 8000);
  assert.equal(scaledCost.platformFeeCoins, 889);
  assert.equal(scaledCost.totalCostCoins, 8889);

  // Inputs below minimums clamp safely to 50 reward / 1 min slot
  const clampedCost = calculatePaidTaskCost(20, 0);
  assert.equal(clampedCost.rewardCoins, USER_TASK_MIN_REWARD_COINS);
  assert.equal(clampedCost.rewardCoins, 50);
  assert.equal(clampedCost.totalSlots, 1);
  assert.equal(clampedCost.totalCostCoins, 56);

  const { profile } = createDefaultProfile('player_creator1', 'Aarav', '@aarav', NOW);
  assert.equal(profile.coins, 1000);

  // Under 10,000 coins balance cannot publish even minimum task
  const under10k = createPaidTaskOrder(
    { ...profile, coins: 9999 },
    {
      title: 'Join My Channel',
      category: 'partner',
      rewardCoins: 150,
      totalSlots: 60,
      icon: 'send',
      actionUrl: 'https://t.me/test',
    },
    NOW,
  );
  assert.ok('error' in under10k);

  const fundedCreator = { ...profile, coins: 11000 };

  // Below min reward (< 50) rejected
  const lowReward = createPaidTaskOrder(
    fundedCreator,
    {
      title: 'Low Reward Task',
      category: 'social',
      rewardCoins: 49,
      totalSlots: 200,
      icon: 'send',
      actionUrl: '',
    },
    NOW,
  );
  assert.ok('error' in lowReward);

  // Zero slots rejected
  const lowSlots = createPaidTaskOrder(
    fundedCreator,
    {
      title: 'Zero Slots Task',
      category: 'social',
      rewardCoins: 150,
      totalSlots: 0,
      icon: 'send',
      actionUrl: '',
    },
    NOW,
  );
  assert.ok('error' in lowSlots);

  // Valid minimum paid task deducts 10,000 coins and emits negative coin transaction
  const ok = createPaidTaskOrder(
    fundedCreator,
    {
      title: 'Join My Channel',
      category: 'partner',
      rewardCoins: 150,
      totalSlots: 60,
      icon: 'send',
      actionUrl: 'https://t.me/test',
    },
    NOW,
  );
  assert.ok(!('error' in ok));
  assert.equal(ok.cost.totalCostCoins, 10000);
  assert.equal(ok.profile.coins, 1000);
  assert.equal(ok.transaction.amount, -10000);
  assert.equal(ok.transaction.currency, 'coins');

  // Creator cannot claim their own posted task, while another player can
  const ownTask = {
    id: 'task_user_paid_1',
    category: 'partner' as const,
    title: 'Join My Channel',
    rewardCoins: 150,
    icon: 'send',
    actionUrl: 'https://t.me/test',
    totalSlots: 60,
    claimedCount: 0,
    creatorUid: 'player_creator1',
    paidCoins: 10000,
    isCustom: true,
    isActive: true,
    createdAtMs: NOW,
  };

  const selfClaim = completeTask(ok.profile, 'task_user_paid_1', NOW + 1000, [ownTask]);
  assert.ok('error' in selfClaim);

  const { profile: otherUser } = createDefaultProfile('player_other2', 'Meera', '@meera', NOW);
  const otherClaim = completeTask(otherUser, 'task_user_paid_1', NOW + 1000, [ownTask]);
  assert.ok(!('error' in otherClaim));
  assert.equal(otherClaim.rewardCoins, 150);
  assert.equal(otherClaim.profile.coins, otherUser.coins + 150);
});

test('sortTasks orders tasks accurately by Most Reward, Newest, and Ending Soon', () => {
  const sampleTasks = [
    {
      id: 'task_unlimited_high',
      category: 'partner' as const,
      title: 'Unlimited High Reward',
      rewardCoins: 600,
      icon: 'link',
      isCustom: true,
      isActive: true,
      createdAtMs: NOW - 5000,
    },
    {
      id: 'task_low_slots_medium',
      category: 'partner' as const,
      title: 'Almost Gone',
      rewardCoins: 200,
      icon: 'flame',
      isCustom: true,
      isActive: true,
      totalSlots: 50,
      claimedCount: 47, // 3 spots left
      createdAtMs: NOW - 2000,
    },
    {
      id: 'task_brand_new',
      category: 'partner' as const,
      title: 'Brand New Quest',
      rewardCoins: 350,
      icon: 'send',
      isCustom: true,
      isActive: true,
      totalSlots: 100,
      claimedCount: 10, // 90 spots left
      createdAtMs: NOW + 1000,
    },
    {
      id: 'task_sold_out_top_reward',
      category: 'partner' as const,
      title: 'Sold Out Whale',
      rewardCoins: 900,
      icon: 'gift',
      isCustom: true,
      isActive: true,
      totalSlots: 10,
      claimedCount: 10, // 0 spots left
      createdAtMs: NOW - 1000,
    },
  ];

  // Most Reward: descending by rewardCoins
  assert.deepEqual(
    sortTasks(sampleTasks, 'most_reward').map((t) => t.id),
    ['task_sold_out_top_reward', 'task_unlimited_high', 'task_brand_new', 'task_low_slots_medium'],
  );

  // Newest: descending by createdAtMs
  assert.deepEqual(
    sortTasks(sampleTasks, 'newest').map((t) => t.id),
    ['task_brand_new', 'task_sold_out_top_reward', 'task_low_slots_medium', 'task_unlimited_high'],
  );

  // Ending Soon: fewest open spots > 0 first, then unlimited, then sold-out (0 left) last
  assert.deepEqual(
    sortTasks(sampleTasks, 'ending_soon').map((t) => t.id),
    ['task_low_slots_medium', 'task_brand_new', 'task_unlimited_high', 'task_sold_out_top_reward'],
  );
});

test('Withdraw 30-ad gate ONLY counts Tasks 3-site Coin Ad buttons and ignores Free Eggs, Gate, Bot Join, and Coop Fever ads', () => {
  const { profile } = createDefaultProfile('player_ads30', 'Kabir', '@kabir', NOW);
  let current = { ...profile, eggs: 250 };

  assert.equal(getTotalAdsWatched(current), 0);
  assert.equal(getWithdrawAdsWatched(current), 0);
  assert.equal(getCoopFeverAdsWatched(current), 0);
  assert.equal(getWithdrawAdGateStatus(current).unlocked, false);
  assert.equal(getWithdrawAdGateStatus(current).remaining, 30);

  // Watch 20 Free Eggs ads + 5 Gate ads + 3 Bot Join ads + 25 Coop Fever ads -> MUST NOT advance withdrawAdsWatched!
  let totalFreeEggsAdded = 0;
  for (let i = 0; i < 20; i += 1) {
    const stepRes = watchAdStep(current, NOW + i * 1000);
    current = stepRes.profile;
    totalFreeEggsAdded += stepRes.rewardEggs;
    const isTenth = (i + 1) % 10 === 0;
    assert.equal(stepRes.hitMilestone, isTenth);
    assert.equal(
      stepRes.rewardEggs,
      isTenth ? FREE_EGGS_PER_AD + FREE_EGGS_MILESTONE_BONUS : FREE_EGGS_PER_AD,
    );
    assert.equal(stepRes.transaction.currency, 'eggs');
  }
  for (let i = 0; i < 5; i += 1) {
    current = recordCompletedGateAd(current);
  }
  for (let i = 0; i < 3; i += 1) {
    const botRes = claimAdsgramBotJoinReward(current, '2026-11-14', NOW + 25_000 + i * 1000);
    assert.ok(!('error' in botRes));
    current = botRes.profile;
  }
  for (let i = 0; i < 25; i += 1) {
    current = recordCoopFeverAd(current);
  }

  assert.equal(current.watchedAdsCount, 0);
  assert.equal(current.leghornCount, 0);
  assert.equal(totalFreeEggsAdded, 20 * FREE_EGGS_PER_AD + 2 * FREE_EGGS_MILESTONE_BONUS);
  assert.equal(current.eggs, 250 + totalFreeEggsAdded);
  assert.equal(getTotalAdsWatched(current), 53);
  assert.equal(getCoopFeverAdsWatched(current), 25);
  // Withdraw gate is still 0/30!
  assert.equal(getWithdrawAdsWatched(current), 0);
  assert.equal(getWithdrawAdGateStatus(current).unlocked, false);
  assert.equal(getWithdrawAdGateStatus(current).remaining, 30);

  // Watch 29 ads across the 3 Coin Ad buttons in Tasks (spread across 2 days respecting daily limits)
  for (let i = 0; i < 5; i += 1) {
    const netRes = claimAdNetworkReward(current, 'adsgram', '2026-11-14', NOW + 30_000 + i * 1000);
    assert.ok(!('error' in netRes));
    current = netRes.profile;
  }
  for (let i = 0; i < 5; i += 1) {
    const netRes = claimAdNetworkReward(current, 'gigapub', '2026-11-14', NOW + 40_000 + i * 1000);
    assert.ok(!('error' in netRes));
    current = netRes.profile;
  }
  for (let i = 0; i < 5; i += 1) {
    const netRes = claimAdNetworkReward(current, 'monetag', '2026-11-14', NOW + 50_000 + i * 1000);
    assert.ok(!('error' in netRes));
    current = netRes.profile;
  }
  for (let i = 0; i < 5; i += 1) {
    const netRes = claimAdNetworkReward(current, 'adsgram', '2026-11-15', NOW + 90_000 + i * 1000);
    assert.ok(!('error' in netRes));
    current = netRes.profile;
  }
  for (let i = 0; i < 5; i += 1) {
    const netRes = claimAdNetworkReward(current, 'gigapub', '2026-11-15', NOW + 100_000 + i * 1000);
    assert.ok(!('error' in netRes));
    current = netRes.profile;
  }
  for (let i = 0; i < 4; i += 1) {
    const netRes = claimAdNetworkReward(current, 'monetag', '2026-11-15', NOW + 110_000 + i * 1000);
    assert.ok(!('error' in netRes));
    current = netRes.profile;
  }

  assert.equal(getWithdrawAdsWatched(current), 29);
  assert.equal(getWithdrawAdGateStatus(current).unlocked, false);
  assert.equal(getWithdrawAdGateStatus(current).remaining, 1);

  // 30th ad via Monetag unlocks withdrawals!
  const net30 = claimAdNetworkReward(current, 'monetag', '2026-11-15', NOW + 120_000);
  assert.ok(!('error' in net30));
  current = net30.profile;
  assert.equal(getWithdrawAdsWatched(current), 30);
  assert.equal(getWithdrawAdGateStatus(current).unlocked, true);
  assert.equal(getWithdrawAdGateStatus(current).remaining, 0);
  // Coop Fever counter remains strictly unaffected by the 30 Tasks ads
  assert.equal(getCoopFeverAdsWatched(current), 25);

  const wdOk = executeWithdrawal(
    current,
    150,
    'UQB06dO9oc06d-1c8DF03FLdCznEHz_aLIA69fxzITcunwpr',
    '',
    NOW + 130_000,
  );
  assert.ok(!('error' in wdOk));
  assert.equal(wdOk.adsDeducted, 15);
  assert.equal(getWithdrawAdsWatched(wdOk.profile), 15);
  assert.equal(getWithdrawAdGateStatus(wdOk.profile).unlocked, false);
  assert.equal(getWithdrawAdGateStatus(wdOk.profile).remaining, 15);

  // Verify Firestore achievement-token round-trip persists lowered withdrawAdsWatched (30 -> 15)
  const encodedAfterWd = encodeAchievementsWithAds(
    ['__wd_ads:30'],
    getTotalAdsWatched(wdOk.profile),
    { withdrawAdsWatched: wdOk.profile.withdrawAdsWatched },
  );
  const decodedAfterWd = decodeAchievementsAndAds(
    encodedAfterWd,
    getTotalAdsWatched(wdOk.profile),
    wdOk.profile.watchedAdsCount,
    { withdrawAdsWatched: wdOk.profile.withdrawAdsWatched },
  );
  assert.equal(decodedAfterWd.withdrawAdsWatched, 15);

  // Watching 15 more Coin Ads in Tasks re-unlocks withdrawals back at 30/30
  let recharged = wdOk.profile;
  for (let i = 0; i < 5; i += 1) {
    const r = claimAdNetworkReward(recharged, 'adsgram', '2026-11-16', NOW + 200_000 + i * 1000);
    assert.ok(!('error' in r));
    recharged = r.profile;
  }
  for (let i = 0; i < 5; i += 1) {
    const r = claimAdNetworkReward(recharged, 'gigapub', '2026-11-16', NOW + 210_000 + i * 1000);
    assert.ok(!('error' in r));
    recharged = r.profile;
  }
  for (let i = 0; i < 5; i += 1) {
    const r = claimAdNetworkReward(recharged, 'monetag', '2026-11-16', NOW + 220_000 + i * 1000);
    assert.ok(!('error' in r));
    recharged = r.profile;
  }
  assert.equal(getWithdrawAdsWatched(recharged), 30);
  assert.equal(getWithdrawAdGateStatus(recharged).unlocked, true);
});

test('encodeAchievementsWithAds and decodeAchievementsAndAds round-trip totalAdsWatched within 50-item Firestore limit', () => {
  // Zero ads leaves array untouched
  assert.deepEqual(encodeAchievementsWithAds(['first_harvest'], 0), ['first_harvest']);

  // Encodes 30 ads alongside real achievements, stripping old __ads tokens
  const encoded = encodeAchievementsWithAds(['first_harvest', '__ads:12', 'flock_5'], 30);
  assert.deepEqual(encoded, ['first_harvest', 'flock_5', '__ads:30']);
  assert.ok(encoded.every((item) => item.length <= 64));

  const decoded = decodeAchievementsAndAds(encoded, undefined, 0);
  assert.deepEqual(decoded.claimedAchievementIds, ['first_harvest', 'flock_5']);
  assert.equal(decoded.totalAdsWatched, 30);

  // Enforces max 50 items even with 60 real achievement IDs
  const manyIds = Array.from({ length: 60 }, (_, i) => `ach_${i}`);
  const capped = encodeAchievementsWithAds(manyIds, 42);
  assert.equal(capped.length, 50);
  assert.equal(capped[49], '__ads:42');
});

test('encodeTaskSubtitleMeta and decodeTaskSubtitleMeta preserve slots and creatorUid inside 120-char subtitle cap', () => {
  // Unlimited admin task without meta stays plain text (or undefined)
  assert.equal(encodeTaskSubtitleMeta({ subtitle: 'Join official channel', totalSlots: 0 }), 'Join official channel');
  assert.equal(encodeTaskSubtitleMeta({ subtitle: '', totalSlots: 0 }), undefined);

  // Paid task with long subtitle and 64-char creatorUid still stays <= 120 chars and round-trips cleanly
  const longSub = 'Join our verified community channel and complete daily engagement rewards for bonus coins!';
  const longUid = 'player_1234567890_abcdefghijklmnopqrstuvwxyz_12345678901234567';
  const encoded = encodeTaskSubtitleMeta({
    subtitle: longSub,
    totalSlots: 30,
    claimedCount: 7,
    creatorUid: longUid.slice(0, 64),
    paidCoins: 5000,
  });
  assert.ok(encoded);
  assert.ok(encoded.length <= 120);

  const decoded = decodeTaskSubtitleMeta(encoded);
  assert.equal(decoded.totalSlots, 30);
  assert.equal(decoded.claimedCount, 7);
  assert.equal(decoded.creatorUid, longUid.slice(0, 64));
  assert.equal(decoded.paidCoins, 5000);
  assert.ok(!decoded.subtitle?.includes('__m:'));

  // Standard paid task round-trips full subtitle + slot increment
  const standardEncoded = encodeTaskSubtitleMeta({
    subtitle: 'Join @my_channel',
    totalSlots: 30,
    claimedCount: 0,
    creatorUid: 'player_oojwtfoum3',
    paidCoins: 5000,
  });
  assert.ok(standardEncoded && standardEncoded.length <= 120);
  const standardDecoded = decodeTaskSubtitleMeta(standardEncoded);
  assert.equal(standardDecoded.subtitle, 'Join @my_channel');
  assert.equal(standardDecoded.totalSlots, 30);
  assert.equal(standardDecoded.claimedCount, 0);
  assert.equal(standardDecoded.creatorUid, 'player_oojwtfoum3');
  assert.equal(standardDecoded.paidCoins, 5000);
});

test('generateGiftCodeString, encodePromoLabelMeta, and decodePromoLabelMeta support coins, eggs, and chicken gifts within Firestore limits', () => {
  const generated = generateGiftCodeString('vip');
  assert.ok(generated.startsWith('VIP-'));
  assert.ok(/^[A-Z0-9_-]{3,32}$/.test(generated));

  // 1. Coins reward leaves label plain text
  const coinEnc = encodePromoLabelMeta({
    label: 'Weekend Bonus Drop',
    rewardType: 'coins',
    coins: 750,
  });
  assert.equal(coinEnc.encodedLabel, 'Weekend Bonus Drop');
  assert.equal(coinEnc.firestoreCoins, 750);
  const coinDec = decodePromoLabelMeta(coinEnc.encodedLabel, coinEnc.firestoreCoins);
  assert.equal(coinDec.rewardType, 'coins');
  assert.equal(coinDec.coins, 750);
  assert.equal(coinDec.eggs, 0);
  assert.equal(coinDec.chickenQty, 0);
  assert.equal(formatPromoRewardSummary(coinDec), '+750 coins');

  // 2. Eggs reward stays <= 60 chars, sets valid firestoreCoins >= 1, and decodes pure eggs (0 bonus coins)
  const eggEnc = encodePromoLabelMeta({
    label: 'Super Golden Harvest Community Giveaway Event Label That Is Long',
    rewardType: 'eggs',
    eggs: 2500,
    coins: 0,
  });
  assert.ok(eggEnc.encodedLabel.length <= 60);
  assert.ok(eggEnc.firestoreCoins >= 1);
  const eggDec = decodePromoLabelMeta(eggEnc.encodedLabel, eggEnc.firestoreCoins);
  assert.equal(eggDec.rewardType, 'eggs');
  assert.equal(eggDec.eggs, 2500);
  assert.equal(eggDec.coins, 0);
  assert.ok(!eggDec.label.includes('__r:'));
  assert.equal(formatPromoRewardSummary(eggDec), '+2,500 eggs');

  // 3. Chicken reward encodes breed + qty cleanly inside 60-char cap
  const henEnc = encodePromoLabelMeta({
    label: 'VIP Champion Hen Drop',
    rewardType: 'chicken',
    chickenBreed: 'australorp',
    chickenQty: 2,
    coins: 0,
  });
  assert.ok(henEnc.encodedLabel.length <= 60);
  assert.ok(henEnc.firestoreCoins >= 1);
  const henDec = decodePromoLabelMeta(henEnc.encodedLabel, henEnc.firestoreCoins);
  assert.equal(henDec.rewardType, 'chicken');
  assert.equal(henDec.chickenBreed, 'australorp');
  assert.equal(henDec.chickenQty, 2);
  assert.equal(henDec.coins, 0);
  assert.equal(formatPromoRewardSummary(henDec), '+2 Australorp');
});

test('claimPromoCode awards eggs and chickens accurately and starts farm clock on first gifted hen', () => {
  const { profile } = createDefaultProfile('player_gift1', 'Ananya', '@ananya', NOW);
  assert.equal(profile.leghornCount, 0);
  assert.equal(profile.eggs, 0);

  const promos = [
    {
      code: 'EGGS-2500',
      label: 'Egg Gift Drop',
      coins: 0,
      rewardType: 'eggs' as const,
      eggs: 2500,
      maxUses: 50,
      usedCount: 0,
      expiresAtMs: NOW + 86_400_000,
      isActive: true,
      createdAtMs: NOW,
    },
    {
      code: 'HEN-GIFT1',
      label: 'Starter Hen Gift',
      coins: 0,
      rewardType: 'chicken' as const,
      chickenBreed: 'rhode' as const,
      chickenQty: 2,
      maxUses: 10,
      usedCount: 0,
      expiresAtMs: 0,
      isActive: true,
      createdAtMs: NOW,
    },
  ];

  // Redeem Eggs Gift Code
  const eggClaim = claimPromoCode(profile, 'eggs-2500', NOW + 5000, promos);
  assert.ok(!('error' in eggClaim));
  assert.equal(eggClaim.rewardEggs, 2500);
  assert.equal(eggClaim.rewardCoins, 0);
  assert.equal(eggClaim.profile.eggs, 2500);
  assert.equal(eggClaim.profile.coins, profile.coins);
  assert.equal(eggClaim.transaction.currency, 'eggs');
  assert.equal(eggClaim.transaction.amount, 2500);

  // Redeem Chicken Hen Gift Code when farm previously had 0 chickens -> updates lastCollectedAt
  const henClaim = claimPromoCode(eggClaim.profile, 'HEN-GIFT1', NOW + 10_000, promos);
  assert.ok(!('error' in henClaim));
  assert.equal(henClaim.rewardChickenBreed, 'rhode');
  assert.equal(henClaim.rewardChickenQty, 2);
  assert.equal(henClaim.profile.rhodeCount, 2);
  assert.equal(henClaim.profile.lastCollectedAt, NOW + 10_000);
  assert.equal(henClaim.rewardSummary, '+2 Rhode Island Red');
});

test('REQUIRED_TELEGRAM_CHANNELS lists @AIRDROP_GALAXYS and @AG_PAYOUTS and membership helpers parse statuses accurately', () => {
  assert.deepEqual(
    REQUIRED_TELEGRAM_CHANNELS.map((c) => c.handle),
    ['@AIRDROP_GALAXYS', '@AG_PAYOUTS'],
  );
  assert.deepEqual(
    REQUIRED_TELEGRAM_CHANNELS.map((c) => c.url),
    ['https://t.me/AIRDROP_GALAXYS', 'https://t.me/AG_PAYOUTS'],
  );

  // Numeric Telegram user ID extraction
  assert.equal(extractTelegramNumericUserId('tg_778899123'), '778899123');
  assert.equal(extractTelegramNumericUserId('778899123'), '778899123');
  assert.equal(extractTelegramNumericUserId('player_guest_abc'), null);
  assert.equal(extractTelegramNumericUserId(''), null);

  // getChatMember status validation
  assert.equal(isTelegramMemberStatusJoined('member'), true);
  assert.equal(isTelegramMemberStatusJoined('administrator'), true);
  assert.equal(isTelegramMemberStatusJoined('creator'), true);
  assert.equal(isTelegramMemberStatusJoined('restricted', true), true);
  assert.equal(isTelegramMemberStatusJoined('restricted', false), false);
  assert.equal(isTelegramMemberStatusJoined('left'), false);
  assert.equal(isTelegramMemberStatusJoined('kicked'), false);
  assert.equal(isTelegramMemberStatusJoined(''), false);
});

test('ad-gate policy requires ads for startup, egg collect, gift claim, miner buy, and ad cards while exempting tasks, withdraw, and deposit', () => {
  for (const gated of AD_GATED_ACTIONS) {
    assert.equal(shouldRequireAdForAction(gated), true);
  }
  for (const exempt of AD_EXEMPT_ACTIONS) {
    assert.equal(shouldRequireAdForAction(exempt), false);
  }

  assert.equal(shouldRequireAdForAction('startup'), true);
  assert.equal(shouldRequireAdForAction('collect_eggs'), true);
  assert.equal(shouldRequireAdForAction('claim_promo'), true);
  assert.equal(shouldRequireAdForAction('buy_chicken'), true);
  assert.equal(shouldRequireAdForAction('ad_network'), true);
  assert.equal(shouldRequireAdForAction('watch_ad'), true);

  assert.equal(shouldRequireAdForAction('task'), false);
  assert.equal(shouldRequireAdForAction('withdraw'), false);
  assert.equal(shouldRequireAdForAction('deposit'), false);

  const { profile } = createDefaultProfile('player_adgate1', 'Dev', '@dev', NOW);
  assert.equal(getTotalAdsWatched(profile), 0);
  const afterOne = recordCompletedGateAd(profile);
  assert.equal(getTotalAdsWatched(afterOne), 1);

  const baseConfig = {
    provider: 'adsgram' as const,
    adsgramBlockId: '1234',
    gigapubProjectId: '',
    monetagZoneId: '998877',
    customTitle: 'Test',
    customDescription: 'Test',
    customUrl: '',
    watchSeconds: 5,
    bannerEnabled: false,
    bannerTitle: '',
    bannerSubtitle: '',
    bannerCtaText: '',
    bannerUrl: '',
    updatedAtMs: 0,
  };
  assert.equal(hasConfiguredAdNetworkSdk('adsgram', baseConfig), true);
  assert.equal(hasConfiguredAdNetworkSdk('gigapub', baseConfig), false);
  assert.equal(hasConfiguredAdNetworkSdk('monetag', baseConfig), true);
  assert.equal(resolveEffectiveAdConfig(baseConfig).adsgramBlockId, '1234');
});

test('isAdminPlayerId grants direct access to Telegram Admin ID 7508911853 without passcode and rejects non-admins', () => {
  assert.equal(PRIMARY_ADMIN_TELEGRAM_ID, '7508911853');
  assert.equal(isAdminPlayerId('7508911853'), true);
  assert.equal(isAdminPlayerId('tg_7508911853'), true);
  assert.equal(isAdminPlayerId('tg_123456789'), false);
  assert.equal(isAdminPlayerId('player_guest_xyz'), false);
  assert.equal(isAdminPlayerId(''), false);
  assert.equal(isAdminPlayerId('tg_99887766', ['99887766']), true);
});

test('dynamic channel check helpers normalize handles, filter disabled channels, and format summaries', () => {
  assert.deepEqual(normalizeTelegramChannelHandle('https://t.me/alpha_news'), {
    handle: '@alpha_news',
    url: 'https://t.me/alpha_news',
  });
  assert.deepEqual(normalizeTelegramChannelHandle('ag_payouts'), {
    handle: '@ag_payouts',
    url: 'https://t.me/ag_payouts',
  });
  assert.deepEqual(normalizeTelegramChannelHandle('-1001987654321'), {
    handle: '-1001987654321',
    url: '',
  });

  const entry = normalizeTelegramChannelEntry({
    handle: 't.me/community_hub',
    title: 'Community Hub',
    description: 'Official announcements',
  });
  assert.ok(entry);
  assert.equal(entry.handle, '@community_hub');
  assert.equal(entry.url, 'https://t.me/community_hub');
  assert.equal(entry.enabled, true);

  const disabledGate = getActiveRequiredChannels({
    enabled: false,
    channels: DEFAULT_CHANNELS_CONFIG.channels,
    updatedAtMs: NOW,
  });
  assert.equal(disabledGate.length, 0);

  const filtered = getActiveRequiredChannels({
    enabled: true,
    channels: [
      entry,
      { ...entry, id: 'paused_1', handle: '@paused_ch', enabled: false },
    ],
    updatedAtMs: NOW,
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].handle, '@community_hub');

  assert.equal(formatChannelsHandleSummary([]), 'Required channels');
  assert.equal(formatChannelsHandleSummary([{ handle: '@one' }]), '@one');
  assert.equal(formatChannelsHandleSummary([{ handle: '@one' }, { handle: '@two' }]), '@one & @two');
  assert.equal(
    formatChannelsHandleSummary([{ handle: '@one' }, { handle: '@two' }, { handle: '@three' }]),
    '@one, @two & @three',
  );
});

test('resolveTelegramUserIdentity extracts Telegram IDs from tgWebAppData hash and admin_id query param', () => {
  const webAppData = new URLSearchParams({
    user: JSON.stringify({ id: 7508911853, first_name: 'Owner', username: 'owner_tg' }),
    start_param: 'CL-ABC123',
  }).toString();
  const fromHash = resolveTelegramUserIdentity({
    hash: `#tgWebAppData=${encodeURIComponent(webAppData)}&tgWebAppVersion=7.0`,
  });
  assert.equal(fromHash.playerId, 'tg_7508911853');
  assert.equal(fromHash.isTelegramDetected, true);
  assert.equal(fromHash.startParam, 'CL-ABC123');

  const fromQuery = resolveTelegramUserIdentity({
    search: '?admin_id=7508911853',
  });
  assert.equal(fromQuery.playerId, 'tg_7508911853');
  assert.equal(fromQuery.isTelegramDetected, true);
});

test('formatAdConfigTemplate and parseAdConfigTemplate parse KEY=VALUE, VITE_* aliases, JSON, and clamp watchSeconds', () => {
  const initialDraft = {
    provider: 'countdown' as const,
    adsgramBlockId: '',
    adsgramTaskBlockId: '',
    gigapubProjectId: '',
    monetagZoneId: '',
    customTitle: 'Sponsored Bonus',
    customDescription: 'Promo description',
    customUrl: '',
    watchSeconds: 5,
    bannerEnabled: false,
    bannerTitle: 'Banner Title',
    bannerSubtitle: 'Banner Subtitle',
    bannerCtaText: 'Open',
    bannerUrl: '',
  };

  const pastedEnv = [
    '# Ad Network Block IDs',
    'ACTIVE_PROVIDER=adsgram',
    'VITE_ADSGRAM_BLOCK_ID="int-9942"',
    'VITE_GIGAPUB_PROJECT_ID=gp_5512',
    'MONETAG_ZONE_ID: 8844112',
    'WATCH_SECONDS=120',
    'BANNER_ENABLED=true',
    'BANNER_URL=https://t.me/alpha_news',
    'INVALID_LINE_WITHOUT_SEPARATOR',
  ].join('\n');

  const parsedEnv = parseAdConfigTemplate(pastedEnv, initialDraft);
  assert.equal(parsedEnv.next.provider, 'adsgram');
  assert.equal(parsedEnv.next.adsgramBlockId, 'int-9942');
  assert.equal(parsedEnv.next.gigapubProjectId, 'gp_5512');
  assert.equal(parsedEnv.next.monetagZoneId, '8844112');
  assert.equal(parsedEnv.next.watchSeconds, 60);
  assert.equal(parsedEnv.next.bannerEnabled, true);
  assert.equal(parsedEnv.next.bannerUrl, 'https://t.me/alpha_news');
  assert.ok(parsedEnv.appliedKeys.includes('ADSGRAM_BLOCK_ID'));
  assert.ok(parsedEnv.appliedKeys.includes('GIGAPUB_PROJECT_ID'));
  assert.ok(parsedEnv.appliedKeys.includes('MONETAG_ZONE_ID'));

  const formatted = formatAdConfigTemplate(parsedEnv.next);
  const roundTripped = parseAdConfigTemplate(formatted, initialDraft);
  assert.deepEqual(roundTripped.next, parsedEnv.next);

  const jsonParsed = parseAdConfigTemplate(
    JSON.stringify({
      provider: 'monetag',
      monetagZoneId: '777001',
      watchSeconds: 1,
      bannerEnabled: 'off',
    }),
    parsedEnv.next,
  );
  assert.equal(jsonParsed.next.provider, 'monetag');
  assert.equal(jsonParsed.next.monetagZoneId, '777001');
  assert.equal(jsonParsed.next.watchSeconds, 3);
  assert.equal(jsonParsed.next.bannerEnabled, false);

  const emptyParsed = parseAdConfigTemplate('   ', initialDraft);
  assert.deepEqual(emptyParsed.next, initialDraft);
  assert.deepEqual(emptyParsed.appliedKeys, []);
});

test('user management ban helpers normalize Telegram IDs, protect Owner Admin ID, and match banned records', () => {
  assert.equal(normalizePlayerBanId('987654321'), 'tg_987654321');
  assert.equal(normalizePlayerBanId('TG_987654321'), 'tg_987654321');
  assert.equal(normalizePlayerBanId('player_abc123'), 'player_abc123');
  assert.equal(normalizePlayerBanId('bad id!'), null);
  assert.equal(normalizePlayerBanId(''), null);

  const validBan = canBanPlayerId('987654321');
  assert.deepEqual(validBan, { ok: true, canonicalId: 'tg_987654321' });

  const guestBan = canBanPlayerId('player_guest_99');
  assert.deepEqual(guestBan, { ok: true, canonicalId: 'player_guest_99' });

  const adminNumericBlock = canBanPlayerId(PRIMARY_ADMIN_TELEGRAM_ID);
  assert.equal(adminNumericBlock.ok, false);

  const adminPrefixedBlock = canBanPlayerId(`tg_${PRIMARY_ADMIN_TELEGRAM_ID}`);
  assert.equal(adminPrefixedBlock.ok, false);

  assert.equal(matchesBannedUserRecord('tg_987654321', { uid: 'tg_987654321' }), true);
  assert.equal(matchesBannedUserRecord('987654321', { uid: 'tg_987654321' }), true);
  assert.equal(matchesBannedUserRecord('tg_987654321', { uid: '987654321' }), true);
  assert.equal(matchesBannedUserRecord('player_guest_99', { uid: 'player_guest_99' }), true);
  assert.equal(matchesBannedUserRecord('tg_111111111', { uid: 'tg_987654321' }), false);
});

test('detectTelegramBotConfig auto-detects bot username & mini app short name across URL, referrer, server getMe, env, and startapp params', () => {
  assert.equal(normalizeTelegramBotUsername('@AlphaGramAiBot'), 'AlphaGramAiBot');
  assert.equal(normalizeTelegramBotUsername('https://t.me/AlphaGramAiBot/app'), 'AlphaGramAiBot');

  const fromUrl = detectTelegramBotConfig({
    search: '?bot=DetectedUrlBot&app=play',
    serverBotUsername: 'ServerBot',
  });
  assert.equal(fromUrl.botUsername, 'DetectedUrlBot');
  assert.equal(fromUrl.appShortName, 'play');
  assert.equal(fromUrl.source, 'url');

  const fromReferrer = detectTelegramBotConfig({
    referrer: 'https://t.me/AlphaGramAiBot/farm?startapp=7508911853',
  });
  assert.equal(fromReferrer.botUsername, 'AlphaGramAiBot');
  assert.equal(fromReferrer.appShortName, 'farm');
  assert.equal(fromReferrer.source, 'referrer');

  const fromServer = detectTelegramBotConfig({
    serverBotUsername: 'AlphaGramAiBot',
    serverAppShortName: 'app',
    envBotUsername: 'FallbackEnvBot',
  });
  assert.equal(fromServer.botUsername, 'AlphaGramAiBot');
  assert.equal(fromServer.appShortName, 'app');
  assert.equal(fromServer.source, 'server');

  const fromDefault = detectTelegramBotConfig({});
  assert.equal(fromDefault.botUsername, 'AlphaGramAiBot');
  assert.equal(fromDefault.appShortName, '');
  assert.equal(fromDefault.source, 'default');

  const startAppFromSearch = resolveTelegramUserIdentity({
    search: '?tgWebAppStartParam=7508911853',
  });
  assert.equal(startAppFromSearch.startParam, '7508911853');

  const startAppFromHash = resolveTelegramUserIdentity({
    hash: '#tgWebAppStartParam=player_xyz987',
  });
  assert.equal(startAppFromHash.startParam, 'player_xyz987');
});

test('admin role helpers manage Co-Admins, protect Owner Admin ID, and match IDs across formats', () => {
  const adminsConfig = {
    adminIds: ['tg_555000111', '555000111', ADMIN_PASSCODE_VAULT_UID],
    admins: [
      {
        uid: 'tg_555000111',
        displayName: 'CoAdmin Alpha',
        handle: '@coadmin',
        addedBy: 'tg_7508911853',
        addedAtMs: 1_700_000_000_000,
      },
      {
        uid: ADMIN_PASSCODE_VAULT_UID,
        displayName: 's1$digestplaceholder',
        handle: 'salt$saltplaceholder',
        addedBy: 'tg_7508911853',
        addedAtMs: 1_700_000_000_001,
      },
    ],
    updatedAtMs: 1_700_000_000_000,
  };

  const extraIds = getEffectiveAdminIds(adminsConfig);
  assert.ok(extraIds.includes('tg_555000111'));
  assert.ok(extraIds.includes('555000111'));
  assert.ok(!extraIds.includes(ADMIN_PASSCODE_VAULT_UID));
  assert.equal(isAdminPlayerId(ADMIN_PASSCODE_VAULT_UID, extraIds), false);
  assert.equal(matchesAdminRecord(ADMIN_PASSCODE_VAULT_UID, adminsConfig.admins[1]), false);
  assert.equal(isAdminPlayerId('555000111', extraIds), true);
  assert.equal(isAdminPlayerId('tg_555000111', extraIds), true);
  assert.equal(isAdminPlayerId('tg_999888777', extraIds), false);
  assert.equal(matchesAdminRecord('555000111', adminsConfig.admins[0]), true);

  // Co-Admins cannot be banned once in extraAdminIds
  assert.equal(canBanPlayerId('555000111', extraIds).ok, false);

  // Duplicate or Owner Admin cannot be added as Co-Admin
  assert.equal(canAddAdminPlayerId('7508911853', adminsConfig).ok, false);
  assert.equal(canAddAdminPlayerId('555000111', adminsConfig).ok, false);
  assert.deepEqual(canAddAdminPlayerId('666777888', adminsConfig), {
    ok: true,
    canonicalId: 'tg_666777888',
  });

  // Owner Admin cannot be removed; Co-Admin can be removed
  assert.equal(canRemoveAdminPlayerId('tg_7508911853').ok, false);
  assert.deepEqual(canRemoveAdminPlayerId('555000111'), {
    ok: true,
    canonicalId: 'tg_555000111',
  });
});

test('filterPlayersBySearchQuery, computeAdminCoinAdjustment, and computeAdminReferralCountAdjustment behave accurately', () => {
  const p1 = createDefaultProfile('tg_123456789', 'Rohan Sharma', '@rohan_s', 1000).profile;
  const p2 = createDefaultProfile('player_guest_42', 'Priya Verma', '@priya_v', 2000).profile;
  p2.referredBy = 'tg_123456789';

  assert.equal(filterPlayersBySearchQuery([p1, p2], '').length, 2);
  assert.deepEqual(
    filterPlayersBySearchQuery([p1, p2], '123456789').map((p) => p.uid),
    ['tg_123456789', 'player_guest_42'],
  );
  assert.deepEqual(
    filterPlayersBySearchQuery([p1, p2], '@priya_v').map((p) => p.uid),
    ['player_guest_42'],
  );
  assert.deepEqual(
    filterPlayersBySearchQuery([p1, p2], p1.referralCode).map((p) => p.uid),
    ['tg_123456789', 'player_guest_42'],
  );

  // Coin adjustments clamp cleanly at 0 and validate inputs
  assert.deepEqual(computeAdminCoinAdjustment(1000, 500), {
    ok: true,
    previousCoins: 1000,
    nextCoins: 1500,
    actualDelta: 500,
  });
  assert.deepEqual(computeAdminCoinAdjustment(300, -1000), {
    ok: true,
    previousCoins: 300,
    nextCoins: 0,
    actualDelta: -300,
  });
  assert.equal(computeAdminCoinAdjustment(0, -100).ok, false);
  assert.equal(computeAdminCoinAdjustment(500, 0).ok, false);
  assert.equal(computeAdminCoinAdjustment(500, 20_000_000).ok, false);

  // Referral count adjustments clamp cleanly at 0 and validate inputs
  assert.deepEqual(computeAdminReferralCountAdjustment(2, 3), {
    ok: true,
    previousCount: 2,
    nextCount: 5,
    actualDelta: 3,
  });
  assert.deepEqual(computeAdminReferralCountAdjustment(2, -10), {
    ok: true,
    previousCount: 2,
    nextCount: 0,
    actualDelta: -2,
  });
  assert.equal(computeAdminReferralCountAdjustment(0, -1).ok, false);
  assert.equal(computeAdminReferralCountAdjustment(5, 0).ok, false);
});

test('referral reward is 150 coins, deposit commission is 5%, and bot notification copy formats in English', () => {
  assert.equal(REFERRER_SIGNUP_BONUS_COINS, 150);
  assert.equal(REFERRAL_DEPOSIT_COMMISSION_RATE, 0.05);

  const referredPlayer = {
    ...createDefaultProfile('tg_987654321', 'Alex <script>', 'alex_gram', NOW).profile,
    referredBy: 'tg_7508911853',
  };
  const depRes = executeDeposit(referredPlayer, 5000, 'GRAM_TON', NOW, 'hash_ref_dep_001');
  assert.ok(!('error' in depRes));
  assert.equal(depRes.referrerCommissionCoins, 250);

  const joinMsg = buildReferralBotNotificationMessage({
    event: 'referral_joined',
    referredName: 'Alex <script>',
    referredHandle: 'alex_gram',
    rewardCoins: REFERRER_SIGNUP_BONUS_COINS,
  });
  assert.ok(joinMsg.includes('New Referral Received'));
  assert.ok(joinMsg.includes('+150 Coins'));
  assert.ok(joinMsg.includes('5% share'));
  assert.ok(joinMsg.includes('deposit'));
  assert.ok(joinMsg.includes('Alex &lt;script&gt;'));
  assert.ok(joinMsg.includes('@alex_gram'));

  const pendingMsg = buildReferralBotNotificationMessage({
    event: 'referral_pending',
    referredName: 'Alex <script>',
    referredHandle: 'alex_gram',
    rewardCoins: REFERRER_SIGNUP_BONUS_COINS,
  });
  assert.ok(pendingMsg.includes('New Referral Received'));
  assert.ok(pendingMsg.includes('+150 Coins'));
  assert.ok(pendingMsg.includes('1st Chicken (Miner)'));
  assert.ok(pendingMsg.includes('+100 Coins'));
  assert.ok(pendingMsg.includes('Alex &lt;script&gt;'));
  assert.ok(pendingMsg.includes('@alex_gram'));

  const commissionMsg = buildReferralBotNotificationMessage({
    event: 'deposit_commission',
    referredName: 'Alex',
    referredHandle: '@alex_gram',
    rewardCoins: 250,
    depositGram: '0.4413 GRAM',
    depositUsd: 0.5,
  });
  assert.ok(commissionMsg.includes('Referral Deposit Commission Received'));
  assert.ok(commissionMsg.includes('+250 Coins'));
  assert.ok(commissionMsg.includes('0.4413 GRAM'));
  assert.ok(commissionMsg.includes('5%'));
});

test('full-screen 1,000 coins sign-up bonus shows for all new users (referral and non-referral) until claimed', () => {
  const freshOrganic = createDefaultProfile('tg_1001', 'New User', '@newuser', NOW).profile;
  assert.equal(
    shouldShowSignUpBonusClaim({
      isNewPlayer: true,
      alreadyClaimedInStorage: false,
      skipWelcome: false,
      nowMs: NOW + 1000,
      profile: freshOrganic,
    }),
    true,
  );

  // Even when /start <ref> pre-creates the Firestore player doc on server (isNewPlayer: false),
  // a brand-new untouched referral account must still see the full-screen 1k claim screen
  const freshReferredPreCreated = {
    ...createDefaultProfile('tg_1002', 'Referred User', '@refuser', NOW).profile,
    referredBy: 'tg_7508911853',
  };
  assert.equal(
    shouldShowSignUpBonusClaim({
      isNewPlayer: false,
      alreadyClaimedInStorage: false,
      skipWelcome: false,
      nowMs: NOW + 30_000,
      profile: freshReferredPreCreated,
    }),
    true,
  );

  // Hidden once claimed locally
  assert.equal(
    shouldShowSignUpBonusClaim({
      isNewPlayer: true,
      alreadyClaimedInStorage: true,
      skipWelcome: false,
      nowMs: NOW + 30_000,
      profile: freshReferredPreCreated,
    }),
    false,
  );

  // Hidden when autostart=1 is used
  assert.equal(
    shouldShowSignUpBonusClaim({
      isNewPlayer: true,
      alreadyClaimedInStorage: false,
      skipWelcome: true,
      nowMs: NOW + 30_000,
      profile: freshOrganic,
    }),
    false,
  );

  // Hidden for existing players who already own a hen or played earlier
  assert.equal(
    shouldShowSignUpBonusClaim({
      isNewPlayer: false,
      alreadyClaimedInStorage: false,
      skipWelcome: false,
      nowMs: NOW + 30_000,
      profile: { ...freshReferredPreCreated, leghornCount: 1, boughtThisWeek: 1 },
    }),
    false,
  );

  // Hidden for accounts older than 24h even with zero localStorage
  assert.equal(
    shouldShowSignUpBonusClaim({
      isNewPlayer: false,
      alreadyClaimedInStorage: false,
      skipWelcome: false,
      nowMs: NOW + 25 * 60 * 60 * 1000,
      profile: freshOrganic,
    }),
    false,
  );
});

test('sequential ad network rotation serves primary site first, moves to next site on cooldown, and restores on expiry', () => {
  clearAdNetworkCooldowns();
  const baseTime = 1_750_000_000_000;
  const multiAdConfig = {
    provider: 'adsgram' as const,
    adsgramBlockId: 'block-101',
    gigapubProjectId: 'gp-202',
    monetagZoneId: 'zone-303',
    customTitle: 'Test Sponsor',
    customDescription: 'Desc',
    customUrl: '',
    watchSeconds: 5,
    bannerEnabled: false,
    bannerTitle: '',
    bannerSubtitle: '',
    bannerCtaText: 'Open',
    bannerUrl: '',
    updatedAtMs: baseTime,
  };

  // Primary provider comes first, followed by remaining configured networks
  assert.deepEqual(getOrderedConfiguredAdNetworks(multiAdConfig), ['adsgram', 'gigapub', 'monetag']);
  assert.deepEqual(
    getOrderedConfiguredAdNetworks({ ...multiAdConfig, provider: 'monetag' }),
    ['monetag', 'adsgram', 'gigapub'],
  );

  // Initially all configured sites are ready
  assert.deepEqual(selectAvailableAdNetworks(multiAdConfig, baseTime), [
    'adsgram',
    'gigapub',
    'monetag',
  ]);

  // First site runs and enters 60s cooldown -> second site (gigapub) becomes next
  setAdNetworkCooldown('adsgram', 60_000, baseTime);
  assert.equal(isAdNetworkOnCooldown('adsgram', baseTime + 1_000), true);
  assert.equal(getAdNetworkCooldownRemainingMs('adsgram', baseTime + 15_000), 45_000);
  assert.deepEqual(selectAvailableAdNetworks(multiAdConfig, baseTime + 15_000), [
    'gigapub',
    'monetag',
  ]);

  // Second site runs and enters 60s cooldown -> third site (monetag) becomes next
  setAdNetworkCooldown('gigapub', 60_000, baseTime + 15_000);
  assert.deepEqual(selectAvailableAdNetworks(multiAdConfig, baseTime + 20_000), ['monetag']);

  // Third site runs and enters cooldown -> none left until first cooldown expires
  setAdNetworkCooldown('monetag', 60_000, baseTime + 20_000);
  assert.deepEqual(selectAvailableAdNetworks(multiAdConfig, baseTime + 25_000), []);

  // Once first site cooldown expires at +60_000ms, AdsGram returns first in rotation
  assert.equal(isAdNetworkOnCooldown('adsgram', baseTime + 60_000), false);
  assert.deepEqual(selectAvailableAdNetworks(multiAdConfig, baseTime + 60_000), ['adsgram']);

  clearAdNetworkCooldowns();
});

test('AdsGram Bot Joins & Clicks enforces 5/day limit, prunes stale tokens, and parses/formats Get Code channel & Task Block ID', () => {
  const { profile } = createDefaultProfile('player_botjoin', 'Riya', '@riya', NOW);
  let current = {
    ...profile,
    completedTaskIds: ['milestone_tg', 'botjoin_2026-11-13_1'],
  };

  for (let i = 0; i < ADSGRAM_BOT_JOIN_TASK.dailyLimit; i += 1) {
    const res = claimAdsgramBotJoinReward(current, '2026-11-14', NOW + i * 1000);
    assert.ok(!('error' in res));
    assert.equal(res.rewardCoins, ADSGRAM_BOT_JOIN_TASK.rewardCoins);
    assert.equal(res.claimedToday, i + 1);
    current = res.profile;
  }

  assert.equal(getBotJoinClaimCountToday(current.completedTaskIds, '2026-11-14'), 5);
  assert.ok(current.completedTaskIds.includes('milestone_tg'));
  assert.ok(!current.completedTaskIds.includes('botjoin_2026-11-13_1'));
  assert.equal(
    current.coins,
    profile.coins + ADSGRAM_BOT_JOIN_TASK.dailyLimit * ADSGRAM_BOT_JOIN_TASK.rewardCoins,
  );
  assert.equal(getTotalAdsWatched(current), ADSGRAM_BOT_JOIN_TASK.dailyLimit);

  const overLimit = claimAdsgramBotJoinReward(current, '2026-11-14', NOW + 99_000);
  assert.ok('error' in overLimit);

  // Get Code channel URL normalization
  assert.equal(normalizeGetCodeChannelUrl('@promo_codes_ch'), 'https://t.me/promo_codes_ch');
  assert.equal(normalizeGetCodeChannelUrl('https://t.me/custom_drops'), 'https://t.me/custom_drops');
  assert.equal(normalizeGetCodeChannelUrl('   '), '');
  assert.equal(DEFAULT_CHANNELS_CONFIG.getCodeChannelUrl, DEFAULT_GET_CODE_CHANNEL_URL);

  // AdsGram Task Block ID template round-trip & SDK helper
  const parsed = parseAdConfigTemplate(
    'ACTIVE_PROVIDER=adsgram\nADSGRAM_BLOCK_ID=1234\nADSGRAM_TASK_BLOCK_ID=task-7788',
    resolveEffectiveAdConfig(DEFAULT_AD_CONFIG),
  );
  assert.equal(parsed.next.adsgramTaskBlockId, 'task-7788');
  assert.ok(parsed.appliedKeys.includes('ADSGRAM_TASK_BLOCK_ID'));
  assert.equal(hasConfiguredAdsgramTaskSdk({ ...parsed.next, updatedAtMs: NOW }), true);

  const formatted = formatAdConfigTemplate(parsed.next);
  assert.ok(formatted.includes('ADSGRAM_TASK_BLOCK_ID=task-7788'));
});

test('normalizeTelegramChannelHandle parses telegram.me URLs, private t.me/c links, and invite links safely', () => {
  assert.deepEqual(normalizeTelegramChannelHandle('https://telegram.me/my_public_ch'), {
    handle: '@my_public_ch',
    url: 'https://t.me/my_public_ch',
  });
  assert.deepEqual(normalizeTelegramChannelHandle('https://t.me/c/1234567890/5'), {
    handle: '-1001234567890',
    url: '',
  });
  assert.deepEqual(normalizeTelegramChannelHandle('https://t.me/+AbCdEf_123'), {
    handle: '',
    url: 'https://t.me/+AbCdEf_123',
  });
  assert.deepEqual(normalizeTelegramChannelHandle('https://t.me/joinchat/XYZ789'), {
    handle: '',
    url: 'https://t.me/joinchat/XYZ789',
  });
  assert.deepEqual(normalizeTelegramChannelHandle('-1009876543210'), {
    handle: '-1009876543210',
    url: '',
  });
});

test('calculatePaidTaskFromBudget computes exact slots, posting fee, and total coins deducted from coin budget', () => {
  // Exact minimum 10,000 coins at 150 coins/join -> 60 slots (9,000 pool) + 1,000 fee (10%) = 10,000 deducted
  const minBudget = calculatePaidTaskFromBudget(10000, 150);
  assert.equal(minBudget.valid, true);
  assert.equal(minBudget.totalSlots, 60);
  assert.equal(minBudget.rewardPoolCoins, 9000);
  assert.equal(minBudget.platformFeeCoins, 1000);
  assert.equal(minBudget.totalCostCoins, 10000);
  assert.equal(minBudget.unspentCoins, 0);

  // 20,000 coins at 200 coins/join -> 90 slots (18,000 pool) + 2,000 fee = 20,000 deducted
  const larger = calculatePaidTaskFromBudget(20000, 200);
  assert.equal(larger.valid, true);
  assert.equal(larger.totalSlots, 90);
  assert.equal(larger.rewardPoolCoins, 18000);
  assert.equal(larger.platformFeeCoins, 2000);
  assert.equal(larger.totalCostCoins, 20000);
  assert.equal(larger.unspentCoins, 0);

  // 10,100 coins at 150 coins/join -> 60 slots (9,000) + 1,000 fee = 10,000 deducted, 100 left unspent
  const partial = calculatePaidTaskFromBudget(10100, 150);
  assert.equal(partial.valid, true);
  assert.equal(partial.totalSlots, 60);
  assert.equal(partial.platformFeeCoins, 1000);
  assert.equal(partial.totalCostCoins, 10000);
  assert.equal(partial.unspentCoins, 100);

  // Below 10,000 coins rejected
  const tooLow = calculatePaidTaskFromBudget(9999, 150);
  assert.equal(tooLow.valid, false);
  assert.ok(tooLow.error?.includes('10,000'));

  // High reward per join requiring > 10,000 for 1 slot surfaces minimum required coins
  const highReward = calculatePaidTaskFromBudget(10000, 15000);
  assert.equal(highReward.valid, false);
  assert.equal(highReward.minBudgetForReward, 16667);
  assert.ok(highReward.error?.includes('16,667'));

  // 50 coins/click with 10,000 coin budget yields 180 slots (9,000 pool + 1,000 fee = 10,000)
  const min50Budget = calculatePaidTaskFromBudget(10000, 50);
  assert.equal(min50Budget.valid, true);
  assert.equal(min50Budget.rewardCoins, 50);
  assert.equal(min50Budget.totalSlots, 180);
  assert.equal(min50Budget.rewardPoolCoins, 9000);
  assert.equal(min50Budget.platformFeeCoins, 1000);
  assert.equal(min50Budget.totalCostCoins, 10000);
});

test('paid task top-up and refund calculate added slots, fees, and unused pool refunds cleanly', () => {
  const { profile } = createDefaultProfile('player_sponsor', 'Karan', '@karan', NOW);
  const richSponsor = { ...profile, coins: 20000 };
  const task = {
    id: 'task_sponsor_1',
    title: 'Join VIP Channel',
    rewardCoins: 50,
    totalSlots: 90,
    claimedCount: 30,
    creatorUid: 'player_sponsor',
  };

  // Top-up 1,100 coins at 50/click -> 20 slots (1,000 pool + 100 fee = 1,100)
  const topUpPreview = calculatePaidTaskTopUp(50, 1100, 90);
  assert.equal(topUpPreview.valid, true);
  assert.equal(topUpPreview.additionalSlots, 20);
  assert.equal(topUpPreview.totalCostCoins, 1100);

  const topUpOrder = createTopUpPaidTaskOrder(richSponsor, task, 1100, NOW);
  assert.ok(!('error' in topUpOrder));
  assert.equal(topUpOrder.profile.coins, 18900);
  assert.equal(topUpOrder.transaction.type, 'task_topup');
  assert.equal(topUpOrder.transaction.amount, -1100);

  // Refund unused slots (90 - 30 = 60 slots * 50 coins = 3,000 coins)
  const refundCalc = calculateTaskRefundAmount(task);
  assert.equal(refundCalc.remainingSlots, 60);
  assert.equal(refundCalc.refundCoins, 3000);

  const refundOrder = createRefundPaidTaskOrder(topUpOrder.profile, task, NOW + 1000);
  assert.ok(!('error' in refundOrder));
  assert.equal(refundOrder.refundCoins, 3000);
  assert.equal(refundOrder.profile.coins, 21900);
  assert.equal(refundOrder.transaction.type, 'task_refund');
});

test('Coop Fever uses dedicated coopFeverAdsWatched (not Tasks or Gate ads), unlocks 3x production at 25 ads, and resets cleanly', () => {
  let { profile } = createDefaultProfile('player_fever', 'Riya', '@riya', NOW);
  const bought = buyChickens({ ...profile, coins: 5000 }, 'leghorn', 2, NOW);
  assert.ok(!('error' in bought));
  profile = bought.profile;

  // Watching 30 Tasks Coin Ads / Gate ads / Free Egg ads must NOT advance Coop Fever!
  profile = { ...profile, withdrawAdsWatched: 30, totalAdsWatched: 40, watchedAdsCount: 4 };
  const blockedZero = getCoopFeverProgress(profile, NOW);
  assert.equal(blockedZero.adsCollected, 0);
  assert.equal(blockedZero.ready, false);

  // Record 24 dedicated Coop Fever ads via recordCoopFeverAd -> still 1 short & withdrawAdsWatched stays unchanged
  for (let i = 0; i < 24; i += 1) {
    profile = recordCoopFeverAd(profile);
  }
  assert.equal(getWithdrawAdsWatched(profile), 30);
  const progress24 = getCoopFeverProgress(profile, NOW);
  assert.equal(progress24.adsCollected, 24);
  assert.equal(progress24.adsRemaining, 1);
  assert.equal(progress24.ready, false);

  const blocked = activateCoopFever(profile, NOW);
  assert.ok('error' in blocked);

  // Reach 27 dedicated Coop Fever ads -> 2 excess carry over after consuming 25
  for (let i = 0; i < 3; i += 1) {
    profile = recordCoopFeverAd(profile);
  }
  const readyProg = getCoopFeverProgress(profile, NOW);
  assert.equal(readyProg.ready, true);
  assert.equal(readyProg.adsCollected, COOP_FEVER_REQUIRED_ADS);

  const baseRate = calculateProductionRate(profile, NOW);
  assert.equal(baseRate, 16);

  const activated = activateCoopFever(profile, NOW);
  assert.ok(!('error' in activated));
  assert.equal(activated.multiplier, COOP_FEVER_MULTIPLIER);
  assert.equal(isCoopFeverActive(activated.profile, NOW + 1000), true);
  assert.equal(activated.profile.coopFeverUntilMs, NOW + COOP_FEVER_DURATION_MS);
  assert.equal(activated.profile.coopFeverBaselineAds, 25);

  const feverRate = calculateProductionRate(activated.profile, NOW + 1000);
  assert.equal(feverRate, 16 * 3);

  // Check next cycle progress carries over remaining 2 ads
  const nextCycle = getCoopFeverProgress(activated.profile, NOW + COOP_FEVER_DURATION_MS + 1000);
  assert.equal(nextCycle.active, false);
  assert.equal(nextCycle.adsCollected, 2);
  assert.equal(nextCycle.adsRemaining, 23);
});

test('Auto-Harvest Drone supports 5h/10h/15h/20h/24h/7d in coins or eggs and harvests without basket cap loss', () => {
  assert.deepEqual(
    AUTO_HARVEST_DRONE_TIERS.map((t) => t.id),
    ['5h', '10h', '15h', '20h', '24h', '7d'],
  );

  const { profile: raw } = createDefaultProfile('player_drone', 'Dev', '@dev', NOW);
  const bought = buyChickens({ ...raw, coins: 35000, eggs: 100_000 }, 'orpington', 1, NOW);
  assert.ok(!('error' in bought));
  const farmer = bought.profile; // 75 eggs/hr, basketCapacity = 300

  // Purchase 5h with coins (250 coins)
  const coinBuy = purchaseAutoHarvestDrone(farmer, '5h', 'coins', NOW);
  assert.ok(!('error' in coinBuy));
  assert.equal(coinBuy.profile.coins, farmer.coins - 250);
  assert.equal(isAutoHarvestDroneActive(coinBuy.profile, NOW + 1000), true);

  // Stack 10h with eggs (27,000 eggs) -> total 15h window
  const eggBuy = purchaseAutoHarvestDrone(coinBuy.profile, '10h', 'eggs', NOW);
  assert.ok(!('error' in eggBuy));
  assert.equal(eggBuy.profile.eggs, farmer.eggs - 27_000);
  assert.equal(eggBuy.profile.autoHarvestUntilMs, NOW + 15 * 3_600_000);

  // Simulate 10 hours passing -> level 2 Orpington rate (77/hr) * 10 = 770 eggs (> 300 basketCapacity!) auto-harvested cleanly
  const expected10h = calculateProductionRate(eggBuy.profile, NOW + 1000) * 10;
  const after10h = applyAutoHarvestIfDue(eggBuy.profile, NOW + 10 * 3_600_000);
  assert.equal(after10h.autoHarvestedEggs, expected10h);
  assert.equal(after10h.profile.eggs, eggBuy.profile.eggs + expected10h);
  assert.equal(after10h.profile.totalEggsCollected, eggBuy.profile.totalEggsCollected + expected10h);
});

test('compact achievement tokens round-trip ads, separate withdrawAdsWatched & coopFeverAdsWatched, Coop Fever, Auto-Harvest Drone, and reminder preference under 50-item cap', () => {
  const encoded = encodeAchievementsWithAds(['first_harvest', 'flock_5'], 42, {
    withdrawAdsWatched: 19,
    coopFeverUntilMs: 1794800000000,
    coopFeverBaselineAds: 25,
    coopFeverAdsWatched: 27,
    autoHarvestUntilMs: 1794900000000,
    telegramRemindersEnabled: false,
  });
  assert.ok(encoded.length <= 50);
  assert.ok(encoded.every((item) => item.length <= 64));

  const decoded = decodeAchievementsAndAds(encoded);
  assert.deepEqual(decoded.claimedAchievementIds, ['first_harvest', 'flock_5']);
  assert.equal(decoded.totalAdsWatched, 42);
  assert.equal(decoded.withdrawAdsWatched, 19);
  assert.equal(decoded.coopFeverUntilMs, 1794800000000);
  assert.equal(decoded.coopFeverBaselineAds, 25);
  assert.equal(decoded.coopFeverAdsWatched, 27);
  assert.equal(decoded.autoHarvestUntilMs, 1794900000000);
  assert.equal(decoded.telegramRemindersEnabled, false);
});

test('renderWithdrawApproveMessage formats default payout DM with walletShort and supports custom Admin template edits + HTML escaping', () => {
  const wallet = 'UQD_gS1234567890abcdefghijklmnopqrstuvwxyzMcrwh';
  assert.equal(formatShortTonWallet(wallet), 'UQD_gS...Mcrwh');
  assert.equal(formatShortTonWallet('UQD1234'), 'UQD1234');

  const def = renderWithdrawApproveMessage({
    template: DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
    gramAmount: '0.011239',
    eggsAmount: 11239,
    walletAddress: wallet,
    usdValue: 0.0112,
    displayName: 'Test <User>',
    handle: '@testuser',
    txId: 'wd_01',
    adminNote: 'Sent on TON',
  });

  assert.ok(def.plainText.includes('✅ Withdrawal Paid!'));
  assert.ok(def.plainText.includes('💎 Amount: 0.011239 GRAM'));
  assert.ok(def.plainText.includes('🥚 Eggs: 11239'));
  assert.ok(def.plainText.includes('👛 Wallet: UQD_gS...Mcrwh'));
  assert.ok(def.plainText.includes('⚡ Status: Confirmed on TON'));
  assert.ok(def.htmlText.startsWith('<b>✅ Withdrawal Paid!</b>'));
  assert.equal(def.buttonText, '🔎 View transaction');
  assert.equal(def.buttonUrl, `https://tonviewer.com/${encodeURIComponent(wallet)}`);

  // Custom editable template with tx hash in adminNote -> uses {txUrl} transaction link and escapes HTML
  const txHash64 = 'a'.repeat(64);
  const custom = renderWithdrawApproveMessage({
    template: {
      messageTemplate: 'Paid {gramAmount} GRAM to {displayName} ({walletShort})\nNote: {adminNote}',
      buttonText: 'Track Tx',
      buttonUrlTemplate: '{txUrl}',
    },
    gramAmount: '5.5000',
    eggsAmount: 5500,
    walletAddress: wallet,
    usdValue: 0.55,
    displayName: '<Admin&Test>',
    adminNote: txHash64,
  });

  assert.ok(custom.htmlText.startsWith('<b>Paid 5.5000 GRAM to &lt;Admin&amp;Test&gt; (UQD_gS...Mcrwh)</b>'));
  assert.equal(custom.buttonText, 'Track Tx');
  assert.equal(custom.buttonUrl, `https://tonviewer.com/transaction/${txHash64}`);
});

test('getUnifiedUserId removes CL- codes cleanly and Admin withdraw-ads controls support add, remove, unlock, and reset to 0', async () => {
  const {
    computeAdminWithdrawAdsAdjustment,
    computeAdminWithdrawAdsTarget,
    createReferralCodeFromUid,
    getUnifiedUserId,
  } = await import('./economy');

  assert.equal(getUnifiedUserId('tg_7508911853'), '7508911853');
  assert.equal(getUnifiedUserId('player_guest_99'), 'player_guest_99');
  assert.equal(createReferralCodeFromUid('tg_7508911853'), '7508911853');
  assert.ok(!createReferralCodeFromUid('tg_7508911853').startsWith('CL-'));
  assert.equal(createReferralCodeFromUid('player_abc123'), 'player_abc123');

  // Add ads (+30)
  assert.deepEqual(computeAdminWithdrawAdsAdjustment(0, 30), {
    ok: true,
    previousAds: 0,
    nextAds: 30,
    actualDelta: 30,
  });

  // Remove ads (-10 from 25 -> 15; removing from 0 errors)
  assert.deepEqual(computeAdminWithdrawAdsAdjustment(25, -10), {
    ok: true,
    previousAds: 25,
    nextAds: 15,
    actualDelta: -10,
  });
  assert.equal(computeAdminWithdrawAdsAdjustment(0, -5).ok, false);

  // Target unlock (30) and reset (0)
  assert.deepEqual(computeAdminWithdrawAdsTarget(4, 30), {
    ok: true,
    previousAds: 4,
    nextAds: 30,
    actualDelta: 26,
  });
  assert.deepEqual(computeAdminWithdrawAdsTarget(30, 0), {
    ok: true,
    previousAds: 30,
    nextAds: 0,
    actualDelta: -30,
  });

  // Token override ensures downward/reset __wad:0 wins over stale top-level field
  const encodedReset = encodeAchievementsWithAds(['first_harvest'], 40, {
    withdrawAdsWatched: 0,
  });
  assert.ok(encodedReset.includes('__wad:0'));
  const decodedReset = decodeAchievementsAndAds(encodedReset);
  assert.equal(decodedReset.withdrawAdsWatched, 0);

  // Arbitrary target set (e.g. admin setting 17 ads or reducing 30 -> 12)
  assert.deepEqual(computeAdminWithdrawAdsTarget(0, 17), {
    ok: true,
    previousAds: 0,
    nextAds: 17,
    actualDelta: 17,
  });
  assert.deepEqual(computeAdminWithdrawAdsTarget(30, 12), {
    ok: true,
    previousAds: 30,
    nextAds: 12,
    actualDelta: -18,
  });

  // Telegram WebApp start_param & URL startapp referral IDs preserve numeric IDs cleanly
  const tgStartIdentity = resolveTelegramUserIdentity({
    tgUser: { id: 99887766, first_name: 'Mira' },
    startParam: '7508911853',
  });
  assert.equal(tgStartIdentity.playerId, 'tg_99887766');
  assert.equal(tgStartIdentity.startParam, '7508911853');
});

test('bot token sanitization, masking, validation, and case-insensitive @handle search work reliably', async () => {
  assert.equal(
    sanitizeTelegramBotTokenInput('  "bot123456789:ABCDEFghijklmnop_1234567890"  '),
    '123456789:ABCDEFghijklmnop_1234567890',
  );
  assert.equal(
    maskTelegramBotToken('123456789:ABCDEFghijklmnop_1234567890'),
    '12345678...567890',
  );

  const emptyRes = await verifyTelegramBotTokenDirect('   ');
  assert.equal(emptyRes.ok, false);
  const badFormatRes = await verifyTelegramBotTokenDirect('not-a-valid-token');
  assert.equal(badFormatRes.ok, false);
  assert.ok(badFormatRes.error?.includes('Invalid bot token format'));

  const pMixed = createDefaultProfile('tg_7508911853', 'RK', '@ImTheRk1', NOW).profile;
  const pUpper = createDefaultProfile('tg_7474513009', 'Tanishq', '@TANISHQAI', NOW).profile;
  assert.deepEqual(
    filterPlayersBySearchQuery([pMixed, pUpper], '@imtherk1').map((p) => p.uid),
    ['tg_7508911853'],
  );
  assert.deepEqual(
    filterPlayersBySearchQuery([pMixed, pUpper], '@tanishqai').map((p) => p.uid),
    ['tg_7474513009'],
  );
});

test('paid task optional Channel Check adds +5,000 coins surcharge (15k min, 6k fees) and round-trips inside subtitle metadata', () => {
  assert.equal(USER_TASK_CHANNEL_CHECK_FEE_COINS, 5000);

  const withoutCheck = calculatePaidTaskFromBudget(15000, 50, false);
  assert.equal(withoutCheck.valid, true);
  assert.equal(withoutCheck.requireChannelCheck, false);
  assert.equal(withoutCheck.channelCheckFeeCoins, 0);
  assert.equal(withoutCheck.totalSlots, 270);

  // With channel check ON, 15,000 budget reserves 5,000 channel check fee -> 10,000 remaining (9,000 pool + 1,000 platform fee = 180 slots; 6,000 total fees)
  const withCheck = calculatePaidTaskFromBudget(15000, 50, true);
  assert.equal(withCheck.valid, true);
  assert.equal(withCheck.requireChannelCheck, true);
  assert.equal(withCheck.channelCheckFeeCoins, 5000);
  assert.equal(withCheck.totalSlots, 180);
  assert.equal(withCheck.rewardPoolCoins, 9000);
  assert.equal(withCheck.platformFeeCoins, 1000);
  assert.equal(withCheck.totalCostCoins, 15000);

  // 10,000 budget is insufficient when channel check (+5,000) is ticked (requires >= 15,000)
  const tooLowWithCheck = calculatePaidTaskFromBudget(10000, 50, true);
  assert.equal(tooLowWithCheck.valid, false);
  assert.equal(tooLowWithCheck.minBudgetForReward, 15000);

  const costDirect = calculatePaidTaskCost(50, 180, true);
  assert.equal(costDirect.channelCheckFeeCoins, 5000);
  assert.equal(costDirect.platformFeeCoins, 1000);
  assert.equal(costDirect.totalCostCoins, 15000);

  const { profile } = createDefaultProfile('player_sponsor_chk', 'Sponsor', '@sponsor', NOW);
  const funded = { ...profile, coins: 20000 };
  const order = createPaidTaskOrder(
    funded,
    {
      title: 'Join Sponsor Channel',
      category: 'partner',
      icon: 'send',
      actionUrl: 'https://t.me/AlphaGramTestChannel',
      rewardCoins: 50,
      totalSlots: 180,
      requireChannelCheck: true,
    },
    NOW,
  );
  assert.ok(!('error' in order));
  assert.equal(order.cost.totalCostCoins, 15000);
  assert.equal(order.profile.coins, 5000);

  // Metadata encode/decode round-trip stays under 120 chars & preserves channel check flag
  const encodedOn = encodeTaskSubtitleMeta({
    subtitle: 'Join & tap Claim',
    totalSlots: 180,
    creatorUid: 'tg_7508911853',
    paidCoins: 15000,
    requireChannelCheck: true,
  });
  assert.ok(encodedOn);
  assert.ok(encodedOn.length <= 120);
  const decodedOn = decodeTaskSubtitleMeta(encodedOn);
  assert.equal(decodedOn.requireChannelCheck, true);
  assert.equal(decodedOn.totalSlots, 180);
  assert.equal(decodedOn.paidCoins, 15000);
  assert.equal(decodedOn.subtitle, 'Join & tap Claim');

  const encodedOff = encodeTaskSubtitleMeta({
    subtitle: 'Quick link task',
    totalSlots: 180,
    creatorUid: 'tg_7508911853',
    paidCoins: 10000,
    requireChannelCheck: false,
  });
  const decodedOff = decodeTaskSubtitleMeta(encodedOff);
  assert.equal(Boolean(decodedOff.requireChannelCheck), false);
});

test('daily_reinvest requires actual reinvest today and reinvesting does not advance 30-ad withdraw gate', () => {
  const { profile } = createDefaultProfile('tg_999111222', 'RK', '@rk', NOW);
  const beforeReinvest = completeTask({ ...profile, eggs: 600 }, 'daily_reinvest', NOW);
  assert.ok('error' in beforeReinvest);

  const inv = reinvestEggs({ ...profile, eggs: 600, withdrawAdsWatched: 4 }, MIN_REINVEST_EGGS, NOW);
  assert.ok(!('error' in inv));
  assert.equal(inv.profile.withdrawAdsWatched, 4);
  assert.equal(inv.profile.eggs, 100);

  const afterReinvest = completeTask(inv.profile, 'daily_reinvest', NOW + 1000);
  assert.ok(!('error' in afterReinvest));
  assert.equal(afterReinvest.rewardCoins, 100);
  assert.ok(afterReinvest.profile.completedTaskIds.includes('daily_reinvest'));
});

test('applyLeftChannelPenalties deducts 5x coins into negative debt and future earnings pay it down', () => {
  const { profile } = createDefaultProfile('tg_999111333', 'RK', '@rk', NOW);
  const withCompleted = {
    ...profile,
    coins: 30,
    completedTaskIds: ['milestone_join_news'], // 100 coins -> 5x penalty = 500 coins
  };

  const penalty = applyLeftChannelPenalties(withCompleted, ['milestone_join_news'], NOW + 2000);
  assert.ok(penalty);
  assert.equal(penalty.totalPenaltyCoins, 500);
  assert.equal(penalty.profile.coins, -470);
  assert.equal(penalty.profile.completedTaskIds.includes('milestone_join_news'), false);

  // Subsequent earned coins repay negative debt cleanly without clamping to 0
  const repaid = completeTask(penalty.profile, 'milestone_join_news', NOW + 4000);
  assert.ok(!('error' in repaid));
  assert.equal(repaid.profile.coins, -370);
});

test('renderPayoutChannelApproveMessage matches approval style with farmer name & amount without leaking full wallet or handle', () => {
  const fullWallet = 'UQAOZ7I-xhBLou2dkPqKUdQKA_ZbwKBjP_p85i73Fp2P1RXr';
  const chMsg = renderPayoutChannelApproveMessage({
    template: DEFAULT_WITHDRAW_APPROVE_TEMPLATE,
    gramAmount: '12.50',
    eggsAmount: 1500,
    walletAddress: fullWallet,
    usdValue: 0.15,
    displayName: 'Rahul',
    txId: 'wd_9911223344',
    adminNote: 'Manual payout',
    miniAppUrl: 'https://t.me/Alpha_gram_bot/Alpha',
  });

  assert.match(chMsg.htmlText, /Withdrawal Paid/i);
  assert.match(chMsg.htmlText, /Rahul/);
  assert.match(chMsg.htmlText, /12\.50 GRAM/);
  assert.ok(!chMsg.htmlText.includes(fullWallet), 'must not expose full wallet in public channel');
  assert.ok(!chMsg.buttonUrl.includes(fullWallet), 'must not put full wallet in channel button URL');
});

test('server referralStorage saves, deduplicates, guards self-referrals, merges tg_ variants, and resets cleanly', () => {
  resetReferralStorage();
  try {
    // Rejects self-referrals including across tg_ prefix
    assert.equal(saveReferral('123456', '123456'), false);
    assert.equal(saveReferral('tg_123456', '123456'), false);
    assert.equal(saveReferral('123456', 'tg_123456'), false);

    // Saves valid referral and deduplicates repeat calls
    assert.equal(saveReferral('tg_200200', 'tg_100100'), true);
    assert.equal(saveReferral('tg_200200', 'tg_100100'), true);
    assert.deepEqual(getReferrals('tg_100100'), ['tg_200200']);
    assert.equal(getReferrer('tg_200200'), 'tg_100100');

    // Existing referrer cannot be overwritten by a different referrer
    assert.equal(saveReferral('tg_200200', 'tg_999999'), false);
    assert.equal(getReferrer('tg_200200'), 'tg_100100');

    // Merges tg_100100 and 100100 lookup keys seamlessly
    assert.equal(saveReferral('300300', '100100'), true);
    const merged = getMergedReferralsForUser('100100');
    assert.deepEqual(merged.referrals.sort(), ['300300', 'tg_200200'].sort());
    assert.equal(merged.referrer, null);

    // Reset clears referrals and referredBy
    resetReferralStorage();
    assert.deepEqual(getReferrals('tg_100100'), []);
    assert.equal(getReferrer('tg_200200'), null);
  } finally {
    resetReferralStorage();
  }
});

test('resolveMaintenanceConfig normalizes fields, enforces bounds, and preserves English defaults', () => {
  const defaults = resolveMaintenanceConfig();
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.title, DEFAULT_MAINTENANCE_CONFIG.title);
  assert.equal(defaults.message, DEFAULT_MAINTENANCE_CONFIG.message);

  const custom = resolveMaintenanceConfig({
    enabled: true,
    title: '   Server Upgrade in Progress   ',
    message: '  We are upgrading rewards & bot speed.   ',
    estimatedReturn: 'Back in ~15 minutes',
    updatedBy: 'tg_7508911853',
    updatedAtMs: 1795000000000,
  });
  assert.equal(custom.enabled, true);
  assert.equal(custom.title, 'Server Upgrade in Progress');
  assert.equal(custom.message, 'We are upgrading rewards & bot speed.');
  assert.equal(custom.estimatedReturn, 'Back in ~15 minutes');
  assert.equal(custom.updatedBy, 'tg_7508911853');
  assert.equal(custom.updatedAtMs, 1795000000000);
});

test('parseStartAppAction and extractStartParamFromLocation preserve referral codes and separate nav actions', () => {
  assert.equal(normalizeStartParam('  ref_7508911853  '), 'ref_7508911853');
  assert.equal(normalizeStartParam('ref%5F7508911853'), 'ref_7508911853');

  assert.deepEqual(parseStartAppAction('friends'), { actionTab: 'friends', referralCode: null });
  assert.deepEqual(parseStartAppAction('invite'), { actionTab: 'friends', referralCode: null });
  assert.deepEqual(parseStartAppAction('ref_7508911853'), {
    actionTab: null,
    referralCode: '7508911853',
  });
  assert.deepEqual(parseStartAppAction('r_AG998877'), {
    actionTab: null,
    referralCode: 'AG998877',
  });
  assert.deepEqual(parseStartAppAction('7508911853'), {
    actionTab: null,
    referralCode: '7508911853',
  });

  assert.equal(
    extractStartParamFromLocation({
      search: '?startapp=ref_7508911853',
    }),
    'ref_7508911853',
  );
  assert.equal(
    extractStartParamFromLocation({
      search: '?start=7508911853',
    }),
    '7508911853',
  );
  assert.equal(
    extractStartParamFromLocation({
      hash: '#tgWebAppStartParam=7508911853',
    }),
    '7508911853',
  );
  assert.equal(
    extractStartParamFromLocation({
      hash: `#tgWebAppData=${encodeURIComponent('start_param=987654321&user=%7B%22id%22%3A123%7D')}`,
    }),
    '987654321',
  );
});

test('Golden Egg 5-hour cooldown blocks repeat claims, handles clock skew, and unlocks exactly after 5h', () => {
  assert.equal(GOLDEN_EGG_COOLDOWN_MS, 5 * 60 * 60 * 1000);

  const { profile: emptyProfile } = createDefaultProfile('tg_gold_tester', 'Gold Tester', '@goldtester', NOW);
  assert.equal(getGoldenEggCooldownRemainingMs(emptyProfile, NOW), 0);
  assert.equal(isGoldenEggReady(emptyProfile, NOW), true);
  const noChickenClaim = claimGoldenEggDrop(emptyProfile, NOW);
  assert.ok('error' in noChickenClaim);

  const profile = { ...emptyProfile, leghornCount: 1 };

  // First claim succeeds and stamps lastGoldenEggAtMs
  const firstClaim = claimGoldenEggDrop(profile, NOW);
  assert.ok(!('error' in firstClaim));
  assert.equal(firstClaim.profile.lastGoldenEggAtMs, NOW);
  assert.equal(firstClaim.profile.goldenEggsFound, 1);

  // Immediately after claim (and 1 hour later, 4h59m59s later) it stays locked
  assert.equal(getGoldenEggCooldownRemainingMs(firstClaim.profile, NOW), GOLDEN_EGG_COOLDOWN_MS);
  assert.equal(isGoldenEggReady(firstClaim.profile, NOW + 60 * 60 * 1000), false);
  const blocked = claimGoldenEggDrop(firstClaim.profile, NOW + 60 * 60 * 1000);
  assert.ok('error' in blocked);
  assert.equal(blocked.remainingMs, 4 * 60 * 60 * 1000);
  assert.match(blocked.error, /4h 0m left/);

  const almostReady = claimGoldenEggDrop(firstClaim.profile, NOW + GOLDEN_EGG_COOLDOWN_MS - 1000);
  assert.ok('error' in almostReady);
  assert.equal(almostReady.remainingMs, 1000);

  // Backward device clock skew must never bypass cooldown
  assert.equal(
    getGoldenEggCooldownRemainingMs(firstClaim.profile, NOW - 30_000),
    GOLDEN_EGG_COOLDOWN_MS,
  );
  assert.equal(isGoldenEggReady(firstClaim.profile, NOW - 30_000), false);

  // Formatting helper renders clear human countdown strings
  assert.equal(formatGoldenEggCooldownWait(4 * 3600_000 + 59 * 60_000), '4h 59m left');
  assert.equal(formatGoldenEggCooldownWait(12 * 60_000 + 30_000), '12m 30s left');
  assert.equal(formatGoldenEggCooldownWait(9000), '9s left');

  // Unlocks at exact 5-hour mark
  assert.equal(getGoldenEggCooldownRemainingMs(firstClaim.profile, NOW + GOLDEN_EGG_COOLDOWN_MS), 0);
  assert.equal(isGoldenEggReady(firstClaim.profile, NOW + GOLDEN_EGG_COOLDOWN_MS), true);
  const secondClaim = claimGoldenEggDrop(firstClaim.profile, NOW + GOLDEN_EGG_COOLDOWN_MS);
  assert.ok(!('error' in secondClaim));
  assert.equal(secondClaim.profile.lastGoldenEggAtMs, NOW + GOLDEN_EGG_COOLDOWN_MS);
  assert.equal(secondClaim.profile.goldenEggsFound, 2);
});

test('lifetime 5% deposit commission pays on 1st, 2nd, and 3rd deposits alongside 1st-miner referral activation', () => {
  const { profile: base } = createDefaultProfile('tg_555000111', 'Maya', '@maya_tg', NOW);
  let referred = {
    ...base,
    coins: base.coins + REFERRED_WELCOME_BONUS_COINS, // 1,000 starter + 100 welcome
    referredBy: 'tg_7508911853',
    referralActivated: false,
  };

  // 1st miner purchase unlocks referrer +150 coin bonus
  const firstMiner = buyChickens(referred, 'leghorn', 1, NOW + 1000);
  assert.ok(!('error' in firstMiner));
  assert.equal(firstMiner.shouldActivateReferral, true);
  assert.equal(firstMiner.profile.referralActivated, true);
  referred = firstMiner.profile;

  // 2nd miner purchase does NOT re-trigger referral activation
  const refilled = { ...referred, coins: 5000 };
  const secondMiner = buyChickens(refilled, 'leghorn', 1, NOW + 2000);
  assert.ok(!('error' in secondMiner));
  assert.equal(secondMiner.shouldActivateReferral, false);
  referred = secondMiner.profile;

  // Deposit #1, #2, and #3 all pay 5% lifetime commission
  const dep1 = executeDeposit(referred, 2000, 'GRAM_TON', NOW + 3000, 'tx_life_001');
  assert.ok(!('error' in dep1));
  assert.equal(dep1.referrerCommissionCoins, 100);
  referred = dep1.profile;

  const dep2 = executeDeposit(referred, 5000, 'GRAM_TON', NOW + 4000, 'tx_life_002');
  assert.ok(!('error' in dep2));
  assert.equal(dep2.referrerCommissionCoins, 250);
  referred = dep2.profile;

  const dep3 = executeDeposit(referred, 10000, 'GRAM_TON', NOW + 5000, 'tx_life_003');
  assert.ok(!('error' in dep3));
  assert.equal(dep3.referrerCommissionCoins, 500);
});

test('bot-to-Mini-App web_app redirect preserves startapp referral code alongside Telegram hash data', () => {
  const tgHash = '#tgWebAppData=user%3D%257B%2522id%2522%253A999111222%257D&tgWebAppVersion=8.0';
  const extracted = extractStartParamFromLocation({
    initDataUnsafeStartParam: '',
    initData: '',
    search: '?startapp=7508911853',
    hash: tgHash,
  });
  assert.equal(extracted, '7508911853');

  const identity = resolveTelegramUserIdentity({
    tgUser: { id: 999111222, first_name: 'Nora', username: 'nora_farm' },
    search: '?startapp=ref_7508911853',
    hash: tgHash,
  });
  assert.equal(identity.playerId, 'tg_999111222');
  assert.equal(identity.isTelegramDetected, true);
  assert.equal(identity.startParam, 'ref_7508911853');
  assert.deepEqual(parseStartAppAction(identity.startParam), {
    actionTab: null,
    referralCode: '7508911853',
  });
});





