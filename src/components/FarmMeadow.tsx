import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Award, Bot, Feather, Flame, Package, Sparkles, Star, X, Zap } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ChickenBreedId, UserFarmProfile } from '../types/farm';
import {
  calculateProductionRate,
  calculateTotalChickens,
  CHICKEN_MILESTONES,
  type ChickenMilestoneInfo,
  COOP_FEVER_MULTIPLIER,
  COOP_FEVER_REQUIRED_ADS,
  FEED_BOOSTER_COST_COINS,
  formatGoldenEggCooldownWait,
  getChickenMilestoneReached,
  getCoopFeverProgress,
  getGoldenEggCooldownRemainingMs,
  getWithdrawAdGateStatus,
  GOLDEN_EGG_REWARD_COINS,
  isAutoHarvestDroneActive,
  isCoopFeverActive,
  isFeedBoosterActive,
  isGoldenEggReady,
} from '../game/economy';
import { ChickenSprite, CoinIcon, EggIcon } from './GameIcons';
import { LivingFarmEffects } from './LivingFarmEffects';

interface FarmMeadowProps {
  profile: UserFarmProfile;
  pendingEggs: number;
  collectLabel: string;
  isVisible?: boolean;
  isProfileSynced?: boolean;
  onCollect: () => void;
  onOpenYourFarm: () => void;
  onOpenWithdraw?: () => void;
  onChickenTap: () => void;
  onGoldenEggDrop?: () => void;
  onActivateBooster?: () => void;
  onActivateCoopFever?: () => void;
  onWatchCoopFeverAd?: () => void;
  onBuyChickens?: () => void;
}

interface RoamingHen {
  id: string;
  breed: ChickenBreedId;
  x: number;
  y: number;
  facingLeft: boolean;
  delayMs: number;
}

interface MeadowParticle {
  id: string;
  kind: 'egg_collect' | 'chicken_buy';
  glyph: 'egg' | 'coin' | 'feather' | 'star';
  originXPercent: number;
  originYPercent: number;
  dx: number;
  dy: number;
  delay: number;
  duration: number;
  rotateDeg: number;
  scale: number;
}

interface FlyingEggParticle {
  id: string;
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  endX: number;
  endY: number;
  delay: number;
  duration: number;
  rotateDeg: number;
}

const SPAWN_SPOTS = [
  { x: 45, y: 55 },
  { x: 56, y: 58 },
  { x: 38, y: 50 },
  { x: 64, y: 61 },
  { x: 51, y: 49 },
  { x: 69, y: 56 },
  { x: 41, y: 59 },
  { x: 59, y: 52 },
  { x: 47, y: 63 },
  { x: 34, y: 47 },
  { x: 62, y: 65 },
  { x: 53, y: 60 },
  { x: 72, y: 59 },
  { x: 43, y: 46 },
  { x: 49, y: 65 },
  { x: 67, y: 51 },
];

function getStoredMilestone(uid: string): number {
  try {
    const raw = localStorage.getItem(`chickenland_milestone_${uid}`);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function setStoredMilestone(uid: string, milestone: number): void {
  try {
    localStorage.setItem(`chickenland_milestone_${uid}`, String(milestone));
  } catch {
    // Ignore storage errors
  }
}

function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FarmMeadow({
  profile,
  pendingEggs,
  collectLabel,
  isVisible = true,
  isProfileSynced = true,
  onCollect,
  onOpenYourFarm,
  onOpenWithdraw,
  onChickenTap,
  onGoldenEggDrop,
  onActivateBooster,
  onActivateCoopFever,
  onWatchCoopFeverAd,
  onBuyChickens,
}: FarmMeadowProps) {
  const prefersReducedMotion = useReducedMotion();
  const [stepTick, setStepTick] = useState(0);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [chirps, setChirps] = useState<Array<{ seq: number; henId: string; text: string; isGolden: boolean }>>([]);
  const [tapBursts, setTapBursts] = useState<Array<{ seq: number; henId: string; isGolden: boolean }>>([]);
  const [harvestBurst, setHarvestBurst] = useState<{ seq: number; amount: number } | null>(null);
  const [chickenPurchaseBanner, setChickenPurchaseBanner] = useState<{ seq: number; addedCount: number } | null>(null);
  const [meadowParticles, setMeadowParticles] = useState<MeadowParticle[]>([]);
  const [isCollectPopping, setIsCollectPopping] = useState(false);
  const [collectRippleSeq, setCollectRippleSeq] = useState(0);
  const [flyingEggs, setFlyingEggs] = useState<FlyingEggParticle[]>([]);
  const [poppedHen, setPoppedHen] = useState<{ id: string; seq: number } | null>(null);
  const [activeMilestone, setActiveMilestone] = useState<ChickenMilestoneInfo | null>(null);
  const [entranceEpoch, setEntranceEpoch] = useState(0);

  const [isInViewport, setIsInViewport] = useState(true);
  const [isDocVisible, setIsDocVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
  );
  const sectionRef = useRef<HTMLElement | null>(null);
  const prevVisibleRef = useRef(isVisible);
  const prevUidRef = useRef<string>(profile.uid);
  const prevTotalChickensRef = useRef<number | null>(null);
  const pendingChickenBurstCountRef = useRef(0);
  const particleBatchSeqRef = useRef(0);
  const chirpSeqRef = useRef(0);
  const harvestSeqRef = useRef(0);
  const flyingBatchSeqRef = useRef(0);
  const collectBtnRef = useRef<HTMLButtonElement | null>(null);
  const popTimerRef = useRef<number | null>(null);
  const collectPopTimerRef = useRef<number | null>(null);
  const harvestTimerRef = useRef<number | null>(null);
  const effectTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (isVisible && !prevVisibleRef.current) {
      setEntranceEpoch((e) => e + 1);
    }
    prevVisibleRef.current = isVisible;
  }, [isVisible]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsInViewport(entry.isIntersecting && entry.intersectionRatio > 0);
      },
      { threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      setIsDocVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const isFarmActive = isInViewport && isDocVisible;

  useEffect(() => {
    if (!isFarmActive) return;
    setLiveNowMs(Date.now());
    const id = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isFarmActive]);

  const boosterActive = isFeedBoosterActive(profile, liveNowMs);
  const boostRemainingMs = Math.max(0, Number(profile.feedBoostUntilMs ?? 0) - liveNowMs);
  const feverActive = isCoopFeverActive(profile, liveNowMs);
  const feverRemainingMs = Math.max(0, Number(profile.coopFeverUntilMs ?? 0) - liveNowMs);
  const feverProgress = getCoopFeverProgress(profile, liveNowMs);
  const droneActive = isAutoHarvestDroneActive(profile, liveNowMs);
  const droneRemainingMs = Math.max(0, Number(profile.autoHarvestUntilMs ?? 0) - liveNowMs);
  const goldenRemainingMs = getGoldenEggCooldownRemainingMs(profile, liveNowMs);
  const goldenReady = isProfileSynced && isGoldenEggReady(profile, liveNowMs);
  const productionRate = calculateProductionRate(profile, liveNowMs);
  const totalChickens = calculateTotalChickens(profile);
  const adGate = getWithdrawAdGateStatus(profile);

  const spawnMeadowParticleBurst = (kind: 'egg_collect' | 'chicken_buy', countAdded = 1) => {
    const batchSeq = ++particleBatchSeqRef.current;
    if (kind === 'chicken_buy') {
      setChickenPurchaseBanner({ seq: batchSeq, addedCount: countAdded });
      const bannerTimer = window.setTimeout(() => {
        setChickenPurchaseBanner((cur) => (cur?.seq === batchSeq ? null : cur));
      }, 1500);
      effectTimersRef.current.push(bannerTimer);
    }

    if (prefersReducedMotion) return;

    const particleCount = kind === 'chicken_buy' ? 18 : 14;
    const originXPercent = kind === 'chicken_buy' ? 50 : 73;
    const originYPercent = kind === 'chicken_buy' ? 56 : 82;

    const created: MeadowParticle[] = Array.from({ length: particleCount }, (_, idx) => {
      const angle =
        kind === 'chicken_buy'
          ? (idx / particleCount) * Math.PI * 2 + (idx % 2 === 0 ? 0.14 : -0.14)
          : -Math.PI * 0.92 + (idx / Math.max(1, particleCount - 1)) * Math.PI * 0.84;
      const dist =
        kind === 'chicken_buy'
          ? 70 + (idx % 4) * 26
          : 60 + (idx % 4) * 22;

      const glyphs: MeadowParticle['glyph'][] =
        kind === 'chicken_buy'
          ? ['feather', 'star', 'coin', 'feather']
          : ['egg', 'star', 'coin', 'egg'];

      return {
        id: `mp-${batchSeq}-${idx}`,
        kind,
        glyph: glyphs[idx % glyphs.length],
        originXPercent,
        originYPercent,
        dx: Math.round(Math.cos(angle) * dist),
        dy: Math.round(Math.sin(angle) * dist - (kind === 'egg_collect' ? 24 : 10)),
        delay: (idx % 5) * 0.03,
        duration: 0.65 + (idx % 3) * 0.12,
        rotateDeg: (idx % 2 === 0 ? 1 : -1) * (25 + idx * 14),
        scale: 0.85 + (idx % 3) * 0.2,
      };
    });

    setMeadowParticles((prev) => [...prev.slice(-24), ...created]);
    const cleanup = window.setTimeout(() => {
      const idSet = new Set(created.map((p) => p.id));
      setMeadowParticles((prev) => prev.filter((p) => !idSet.has(p.id)));
    }, 1200);
    effectTimersRef.current.push(cleanup);
  };

  useEffect(() => {
    if (prevUidRef.current !== profile.uid) {
      prevUidRef.current = profile.uid;
      prevTotalChickensRef.current = null;
      pendingChickenBurstCountRef.current = 0;
      setActiveMilestone(null);
      setEntranceEpoch((e) => e + 1);
    }

    if (!isProfileSynced) return;

    if (prevTotalChickensRef.current === null) {
      prevTotalChickensRef.current = totalChickens;
      const stored = getStoredMilestone(profile.uid);
      if (stored === 0) {
        const baseline = [...CHICKEN_MILESTONES].reverse().find((m) => totalChickens >= m) ?? 0;
        if (baseline > 0) {
          setStoredMilestone(profile.uid, baseline);
        }
      }
      return;
    }

    const prevCount = prevTotalChickensRef.current;
    prevTotalChickensRef.current = totalChickens;

    if (totalChickens > prevCount) {
      const added = totalChickens - prevCount;
      const visibleInViewport =
        isVisible || (typeof window !== 'undefined' && window.innerWidth >= 1024);
      if (visibleInViewport) {
        spawnMeadowParticleBurst('chicken_buy', added);
      } else {
        pendingChickenBurstCountRef.current += added;
      }

      const reached = getChickenMilestoneReached(prevCount, totalChickens);
      const storedMax = getStoredMilestone(profile.uid);
      if (reached && reached.threshold > storedMax) {
        setStoredMilestone(profile.uid, reached.threshold);
        setActiveMilestone(reached);
      }
    }
  }, [isProfileSynced, isVisible, profile.uid, totalChickens]);

  useEffect(() => {
    const visibleInViewport =
      isVisible || (typeof window !== 'undefined' && window.innerWidth >= 1024);
    if (!visibleInViewport || pendingChickenBurstCountRef.current <= 0) return;
    const count = pendingChickenBurstCountRef.current;
    pendingChickenBurstCountRef.current = 0;
    const t = window.setTimeout(() => {
      spawnMeadowParticleBurst('chicken_buy', count);
    }, 120);
    return () => window.clearTimeout(t);
  }, [isVisible]);

  useEffect(() => {
    const visibleInViewport =
      isVisible || (typeof window !== 'undefined' && window.innerWidth >= 1024);
    if (!activeMilestone || !visibleInViewport) return;
    const timer = window.setTimeout(() => {
      setActiveMilestone(null);
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [activeMilestone, isVisible]);

  const baseHens = useMemo(() => {
    const list: ChickenBreedId[] = [];
    const pushCount = (breed: ChickenBreedId, count: number, cap: number) => {
      for (let i = 0; i < Math.min(count, cap); i += 1) {
        list.push(breed);
      }
    };
    pushCount('australorp', profile.australorpCount, 4);
    pushCount('orpington', profile.orpingtonCount, 4);
    pushCount('rhode', profile.rhodeCount, 4);
    pushCount('leghorn', profile.leghornCount, 6);
    return list.slice(0, 16);
  }, [profile.australorpCount, profile.orpingtonCount, profile.rhodeCount, profile.leghornCount]);

  useEffect(() => {
    if (!isFarmActive) return;
    const id = window.setInterval(() => {
      setStepTick((t) => t + 1);
    }, 2600);
    return () => {
      window.clearInterval(id);
    };
  }, [isFarmActive]);

  useEffect(() => {
    return () => {
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
      if (collectPopTimerRef.current) window.clearTimeout(collectPopTimerRef.current);
      if (harvestTimerRef.current) window.clearTimeout(harvestTimerRef.current);
      for (const timerId of effectTimersRef.current) {
        window.clearTimeout(timerId);
      }
      effectTimersRef.current = [];
    };
  }, []);

  const triggerCollectEffects = () => {
    spawnMeadowParticleBurst('egg_collect', 1);
    setIsCollectPopping(false);
    window.requestAnimationFrame(() => {
      setIsCollectPopping(true);
    });
    setCollectRippleSeq((s) => s + 1);
    if (collectPopTimerRef.current) window.clearTimeout(collectPopTimerRef.current);
    collectPopTimerRef.current = window.setTimeout(() => {
      setIsCollectPopping(false);
    }, 460);

    if (prefersReducedMotion || typeof window === 'undefined') {
      window.dispatchEvent(new CustomEvent('alphagram:coin-arrival'));
      return;
    }

    const btnRect = collectBtnRef.current?.getBoundingClientRect();
    const targetEl = document.querySelector('[data-coin-balance-target="true"]');
    const targetRect = targetEl?.getBoundingClientRect();

    const originX = btnRect ? btnRect.left + btnRect.width * 0.32 : window.innerWidth * 0.65;
    const originY = btnRect ? btnRect.top + btnRect.height * 0.45 : window.innerHeight * 0.6;
    const endX =
      targetRect && targetRect.width > 0 && targetRect.height > 0
        ? targetRect.left + targetRect.width / 2
        : window.innerWidth * 0.22;
    const endY =
      targetRect && targetRect.width > 0 && targetRect.height > 0
        ? targetRect.top + targetRect.height / 2
        : 84;

    const batchId = ++flyingBatchSeqRef.current;
    const count = 8;
    const created: FlyingEggParticle[] = Array.from({ length: count }, (_, idx) => {
      const spreadX = (idx - (count - 1) / 2) * 14;
      const spreadY = ((idx % 3) - 1) * 7;
      const startX = originX + spreadX;
      const startY = originY + spreadY;
      const arcBend = (idx % 2 === 0 ? -1 : 1) * (24 + (idx % 4) * 14);
      const midX = (startX + endX) / 2 + arcBend;
      const midY = Math.min(startY, endY) - 44 - (idx % 3) * 24;
      return {
        id: `fly-egg-${batchId}-${idx}`,
        startX,
        startY,
        midX,
        midY,
        endX,
        endY,
        delay: idx * 0.045,
        duration: 0.64 + (idx % 3) * 0.06,
        rotateDeg: (idx % 2 === 0 ? 1 : -1) * (18 + idx * 5),
      };
    });

    setFlyingEggs((prev) => [...prev.slice(-16), ...created]);

    const arrivalTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('alphagram:coin-arrival'));
    }, 600);
    const cleanupTimer = window.setTimeout(() => {
      const ids = new Set(created.map((p) => p.id));
      setFlyingEggs((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 1250);
    effectTimersRef.current.push(arrivalTimer, cleanupTimer);
  };

  const roamingHens: RoamingHen[] = useMemo(() => {
    return baseHens.map((breed, idx) => {
      const spot = SPAWN_SPOTS[idx % SPAWN_SPOTS.length];
      const phase = (stepTick + idx) % 4;
      const dx = phase === 0 ? 0 : phase === 1 ? 3.8 : phase === 2 ? 1.8 : -3.4;
      const dy = phase === 0 ? 0 : phase === 1 ? -1.8 : phase === 2 ? 2.1 : -0.9;
      return {
        id: `${breed}-${idx}`,
        breed,
        x: Math.max(24, Math.min(74, spot.x + dx)),
        y: Math.max(41, Math.min(64, spot.y + dy)),
        facingLeft: phase >= 2,
        delayMs: (idx % 5) * 200,
      };
    });
  }, [baseHens, stepTick]);

  const fillPct = Math.min(100, Math.round((pendingEggs / Math.max(1, profile.basketCapacity)) * 100));
  const boosterCardState = totalChickens <= 0 ? 'idle' : boosterActive ? 'active' : 'ready';
  const feverCardState = feverActive ? 'active' : feverProgress.ready ? 'ready' : 'charging';
  const cardTransition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <motion.section
      ref={sectionRef}
      data-farm-paused={!isFarmActive ? 'true' : undefined}
      aria-label="Live Isometric Sustainable Poultry Estate"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.988 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full flex-1 lg:flex-none overflow-hidden rounded-none lg:rounded-[2rem] lg:clay-card bg-gradient-to-b from-amber-200 via-emerald-800 to-stone-950 min-h-[540px] h-full lg:h-auto lg:aspect-[9/14] lg:min-h-[600px] lg:max-h-[760px]"
    >
      {/* Locked-camera isometric farm stage: buildings/walls/roads completely static, internal natural elements alive */}
      <LivingFarmEffects
        boosterActive={boosterActive}
        droneActive={droneActive}
        isPaused={!isFarmActive}
      >
        {/* Animated Roaming Chickens placed strictly on the lawn around the coops */}
        <div className="absolute inset-0 z-10 pointer-events-none">
        {roamingHens.map((hen, idx) => {
          const isPopping = poppedHen?.id === hen.id;
          const isGoldenTarget = goldenReady && Boolean(onGoldenEggDrop) && idx === 0;
          const depthScale = Number((0.68 + ((hen.y - 40) / 26) * 0.24).toFixed(3));
          return (
            <button
              key={hen.id}
              type="button"
              onClick={() => {
                const triggeredGold = goldenReady && Boolean(onGoldenEggDrop);
                const nextSeq = ++chirpSeqRef.current;
                const nextText = triggeredGold ? `+${GOLDEN_EGG_REWARD_COINS} ★ Gold` : '+egg';
                if (triggeredGold) {
                  onGoldenEggDrop?.();
                } else {
                  onChickenTap();
                }
                setChirps((prev) => [
                  ...prev.slice(-6),
                  { seq: nextSeq, henId: hen.id, text: nextText, isGolden: triggeredGold },
                ]);
                setTapBursts((prev) => [
                  ...prev.slice(-4),
                  { seq: nextSeq, henId: hen.id, isGolden: triggeredGold },
                ]);
                window.setTimeout(() => {
                  setChirps((prev) => prev.filter((item) => item.seq !== nextSeq));
                  setTapBursts((prev) => prev.filter((item) => item.seq !== nextSeq));
                }, 1300);

                setPoppedHen((prev) => ({ id: hen.id, seq: (prev?.seq ?? 0) + 1 }));
                if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
                popTimerRef.current = window.setTimeout(() => {
                  setPoppedHen((cur) => (cur?.id === hen.id ? null : cur));
                }, 440);
              }}
              aria-label={`${hen.breed} hen on farm`}
              style={{
                left: `${hen.x}%`,
                top: `${hen.y}%`,
                zIndex: Math.round(hen.y),
                transform: `translate(-50%, -50%) scale(${depthScale})`,
                transition: 'left 2.6s ease-in-out, top 2.6s ease-in-out, transform 2.6s ease-in-out',
              }}
              className="group absolute p-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded-full pointer-events-auto"
            >
              {isGoldenTarget && (
                <>
                  <span
                    aria-hidden="true"
                    className="animate-collect-halo pointer-events-none absolute -inset-2 rounded-full bg-amber-300/35 blur-sm"
                  />
                  <span
                    aria-hidden="true"
                    className="animate-golden-ring pointer-events-none absolute -inset-1.5 rounded-full border-2 border-dashed border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.85)]"
                  />
                </>
              )}
              {tapBursts
                .filter((b) => b.henId === hen.id)
                .map((b) => (
                  <span key={`burst-${b.seq}`} aria-hidden="true" className="pointer-events-none absolute inset-0">
                    {[0, 60, 120, 180, 240, 300].map((angle) => (
                      <span
                        key={angle}
                        style={{ '--burst-angle': `${angle}deg` } as React.CSSProperties}
                        className={`animate-sparkle-burst absolute left-1/2 top-1/2 w-2 h-2 rounded-full ${
                          b.isGolden
                            ? 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.95)]'
                            : 'bg-amber-100 shadow-[0_0_6px_rgba(255,255,255,0.9)]'
                        }`}
                      />
                    ))}
                  </span>
                ))}
              {chirps
                .filter((c) => c.henId === hen.id)
                .map((c) => (
                  <span
                    key={c.seq}
                    className={`animate-float-egg pointer-events-none absolute -top-5 left-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold whitespace-nowrap shadow-md ${
                      c.isGolden
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-950 border border-amber-600/40'
                        : 'clay-btn-amber'
                    }`}
                  >
                    {c.text}
                  </span>
                ))}
              <div className="relative transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-translate-y-1 group-active:scale-95">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-3 rounded-full bg-stone-950/45 blur-[3px]"
                />
                <div
                  key={isPopping ? `pop-${poppedHen.seq}` : 'idle'}
                  className={isPopping ? 'animate-chicken-pop' : ''}
                >
                  <div
                    className="animate-chicken-bob"
                    style={{ animationDelay: `${hen.delayMs}ms` }}
                  >
                    <ChickenSprite
                      breed={hen.breed}
                      className="w-16 h-16 sm:w-[4.4rem] sm:h-[4.4rem] drop-shadow-[0_6px_10px_rgba(12,18,10,0.42)] group-hover:drop-shadow-[0_10px_15px_rgba(12,18,10,0.52)] transition-all duration-200"
                      facingLeft={hen.facingLeft}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        </div>
      </LivingFarmEffects>

      {/* 2x Laying Feed & 3x Coop Fever Active Booster Auras */}
      {boosterActive && (
        <div
          aria-hidden="true"
          className="animate-booster-aura pointer-events-none absolute inset-0 z-[15] lg:rounded-[2rem] ring-4 ring-inset ring-emerald-400/55 shadow-[inset_0_0_32px_rgba(16,185,129,0.28)]"
        />
      )}
      {feverActive && (
        <div
          aria-hidden="true"
          className="animate-booster-aura pointer-events-none absolute inset-0 z-[15] lg:rounded-[2rem] ring-4 ring-inset ring-amber-400/75 shadow-[inset_0_0_44px_rgba(245,158,11,0.42)]"
        />
      )}

      {/* Top sky & bottom earth scrims for natural outdoor readability */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-stone-950/50 via-stone-950/20 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-stone-950/80 via-stone-950/35 to-transparent pointer-events-none" />

      {/* Top Mining HUD: 2x Feed Booster + Golden Egg Alert + GRAM Payout Status */}
      <AnimatePresence>
        {!activeMilestone && (
          <motion.div
            key={`hud-shell-${entranceEpoch}`}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={cardTransition}
            className="absolute top-3 inset-x-3 z-20 flex flex-col gap-1.5 pointer-events-none"
          >
            <div className="flex items-center justify-between gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {totalChickens <= 0 ? (
                  <motion.div
                    key={`booster-idle-${entranceEpoch}`}
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                    transition={cardTransition}
                    className="pointer-events-auto min-h-[44px] rounded-2xl bg-stone-950/70 backdrop-blur-md border border-white/15 px-3 py-2 text-[11px] font-extrabold text-stone-100 inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <EggIcon className="w-3.5 h-3.5 opacity-75 shrink-0" />
                    <span>Mining Idle · 0 Hens</span>
                  </motion.div>
                ) : boosterActive ? (
                  <motion.div
                    key={`booster-active-${boosterCardState}-${entranceEpoch}`}
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                    transition={cardTransition}
                    className="clay-btn-emerald pointer-events-auto min-h-[44px] px-3 py-2 rounded-2xl text-[11px] font-extrabold inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="font-mono-num">2× Feed · {formatCountdownMs(boostRemainingMs)}</span>
                  </motion.div>
                ) : onActivateBooster ? (
                  <motion.button
                    key={`booster-ready-${boosterCardState}-${entranceEpoch}`}
                    type="button"
                    onClick={onActivateBooster}
                    aria-label={`Activate 2x Laying Feed booster for ${FEED_BOOSTER_COST_COINS} coins`}
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                    whileHover={!prefersReducedMotion ? { y: -1.5, scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.96 } : undefined}
                    transition={cardTransition}
                    className="clay-btn pointer-events-auto min-h-[44px] rounded-2xl bg-stone-950/75 hover:bg-stone-900/85 backdrop-blur-md border border-amber-300/35 px-3 py-2 text-[11px] font-extrabold text-amber-100 inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                    <span>2× Boost ({FEED_BOOSTER_COST_COINS})</span>
                  </motion.button>
                ) : null}
              </AnimatePresence>

              <div className="flex items-center gap-1.5 ml-auto">
                <AnimatePresence mode="popLayout" initial={false}>
                  {totalChickens > 0 && onGoldenEggDrop && goldenReady ? (
                    <motion.div
                      key={`gold-badge-${entranceEpoch}`}
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86 }}
                      transition={cardTransition}
                      className="animate-clay-badge clay-btn-amber pointer-events-none min-h-[44px] px-2.5 py-2 rounded-2xl text-[11px] font-extrabold inline-flex items-center gap-1 shadow-lg"
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Tap Hen Gold!</span>
                      <span className="sm:hidden">Gold!</span>
                    </motion.div>
                  ) : totalChickens > 0 && onGoldenEggDrop && goldenRemainingMs > 0 ? (
                    <motion.button
                      key={`gold-cooldown-${entranceEpoch}`}
                      type="button"
                      onClick={onGoldenEggDrop}
                      aria-label={`Golden Egg recharging, ${formatGoldenEggCooldownWait(goldenRemainingMs)}`}
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                      whileHover={!prefersReducedMotion ? { y: -1, scale: 1.02 } : undefined}
                      whileTap={!prefersReducedMotion ? { scale: 0.96 } : undefined}
                      transition={cardTransition}
                      className="clay-btn pointer-events-auto min-h-[44px] rounded-2xl bg-stone-950/70 hover:bg-stone-900/80 backdrop-blur-md border border-amber-400/30 px-2.5 py-2 text-[11px] font-extrabold text-amber-200 inline-flex items-center gap-1 shadow-lg"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                      <span className="font-mono-num tabular-nums">{formatCountdownMs(goldenRemainingMs)}</span>
                    </motion.button>
                  ) : null}
                </AnimatePresence>
                {onOpenWithdraw && (
                  <motion.button
                    key={`withdraw-chip-${entranceEpoch}`}
                    type="button"
                    onClick={onOpenWithdraw}
                    aria-label="Open GRAM Token withdrawal and payout status"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    whileHover={!prefersReducedMotion ? { y: -1.5, scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.96 } : undefined}
                    transition={{ ...cardTransition, delay: 0.04 }}
                    className="clay-btn pointer-events-auto min-h-[44px] rounded-2xl bg-stone-950/75 hover:bg-stone-900/85 backdrop-blur-md border border-emerald-400/35 px-3 py-2 text-[11px] font-extrabold text-white inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        adGate.unlocked ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span>Withdraw</span>
                    <span className="font-mono-num text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-emerald-300">
                      {adGate.unlocked ? 'Ready' : `${adGate.watched}/${adGate.required}`}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  </motion.button>
                )}
              </div>
            </div>

            {/* Row 2: Coop Fever 3x Rush (inside Farm section) + Auto-Harvest Drone Chip */}
            <div className="flex items-center justify-between gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {feverActive ? (
                  <motion.div
                    key={`fever-active-${feverCardState}-${entranceEpoch}`}
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                    transition={{ ...cardTransition, delay: 0.06 }}
                    className="pointer-events-auto min-h-[40px] px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-amber-950 border border-amber-200/70 text-[11px] font-extrabold inline-flex items-center gap-1.5 shadow-lg"
                  >
                    <Flame className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="font-mono-num">
                      {COOP_FEVER_MULTIPLIER}× Fever · {formatCountdownMs(feverRemainingMs)}
                    </span>
                  </motion.div>
                ) : (onActivateCoopFever || onWatchCoopFeverAd) ? (
                  <motion.button
                    key={`fever-btn-${feverCardState}-${entranceEpoch}`}
                    type="button"
                    onClick={
                      feverProgress.ready
                        ? (onActivateCoopFever ?? onWatchCoopFeverAd)
                        : (onWatchCoopFeverAd ?? onActivateCoopFever)
                    }
                    aria-label={
                      feverProgress.ready
                        ? `Activate ${COOP_FEVER_MULTIPLIER}x Coop Fever Rush`
                        : `Watch ad for ${COOP_FEVER_MULTIPLIER}x Coop Fever Rush (${feverProgress.adsCollected} of ${COOP_FEVER_REQUIRED_ADS} ads)`
                    }
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                    whileHover={!prefersReducedMotion ? { y: -1.5, scale: 1.02 } : undefined}
                    whileTap={!prefersReducedMotion ? { scale: 0.96 } : undefined}
                    transition={{ ...cardTransition, delay: 0.06 }}
                    className={`clay-btn pointer-events-auto min-h-[40px] px-3 py-1.5 rounded-2xl text-[11px] font-extrabold inline-flex items-center gap-1.5 shadow-lg ${
                      feverProgress.ready
                        ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 text-amber-950 border border-amber-200 animate-pulse'
                        : 'bg-stone-950/72 hover:bg-stone-900/85 backdrop-blur-md border border-orange-400/35 text-amber-100'
                    }`}
                  >
                    <Flame
                      className={`w-3.5 h-3.5 shrink-0 ${
                        feverProgress.ready ? 'text-orange-700 fill-orange-700' : 'text-orange-400'
                      }`}
                    />
                    {feverProgress.ready ? (
                      <span>Activate {COOP_FEVER_MULTIPLIER}× Fever!</span>
                    ) : (
                      <span className="font-mono-num tabular-nums">
                        {COOP_FEVER_MULTIPLIER}× Fever · {feverProgress.adsCollected}/{COOP_FEVER_REQUIRED_ADS} Ads
                      </span>
                    )}
                  </motion.button>
                ) : null}
              </AnimatePresence>

              <motion.button
                key={`drone-chip-${droneActive ? 'on' : 'off'}-${entranceEpoch}`}
                type="button"
                onClick={onOpenYourFarm}
                aria-label="Open Farm Manager & Auto-Harvest Drone controls"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileHover={!prefersReducedMotion ? { y: -1.5, scale: 1.02 } : undefined}
                whileTap={!prefersReducedMotion ? { scale: 0.96 } : undefined}
                transition={{ ...cardTransition, delay: 0.09 }}
                className={`clay-btn pointer-events-auto ml-auto min-h-[40px] px-2.5 py-1.5 rounded-2xl text-[11px] font-extrabold inline-flex items-center gap-1.5 shadow-lg ${
                  droneActive
                    ? 'bg-sky-950/80 backdrop-blur-md border border-sky-400/45 text-sky-200'
                    : 'bg-stone-950/65 hover:bg-stone-900/80 backdrop-blur-md border border-white/15 text-stone-200'
                }`}
              >
                <Bot className={`w-3.5 h-3.5 shrink-0 ${droneActive ? 'text-sky-400' : 'text-stone-400'}`} />
                <span className="font-mono-num tabular-nums">
                  {droneActive
                    ? `Drone ${droneRemainingMs >= 3_600_000 ? `${Math.ceil(droneRemainingMs / 3_600_000)}h` : formatCountdownMs(droneRemainingMs)}`
                    : 'Auto-Drone'}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chicken Count Milestone Visual Notification */}
      <AnimatePresence>
        {activeMilestone && (
          <motion.div
            key={`milestone-${activeMilestone.threshold}`}
            role="status"
            aria-live="polite"
            data-testid="farm-milestone-banner"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.95 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.15 }
                : { type: 'spring', stiffness: 380, damping: 28, mass: 0.8 }
            }
            className="clay-card-warm absolute top-3 inset-x-3 z-30 !rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl clay-icon-well text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-extrabold text-stone-900 dark:text-stone-100">
                    {activeMilestone.title}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold font-mono-num">
                    {activeMilestone.badge}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 truncate">
                  {activeMilestone.subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Dismiss milestone notification"
              onClick={() => setActiveMilestone(null)}
              className="clay-btn clay-btn-neutral w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buy First Miner Prompt when 0 hens owned (kept crisp above swaying farm diorama) */}
      <AnimatePresence>
        {totalChickens <= 0 && (
          <div className="pointer-events-auto absolute inset-x-4 top-[44%] -translate-y-1/2 flex justify-center z-20">
            <motion.div
              key={`starter-card-${entranceEpoch}`}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.34, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="clay-card-warm !rounded-3xl max-w-[295px] w-full p-4 text-center space-y-2.5 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-2xl clay-icon-well mx-auto flex items-center justify-center">
                <ChickenSprite breed="leghorn" className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  Buy a Chicken to Mine GRAM
                </h3>
                <p className="text-[11px] font-medium text-stone-600 dark:text-stone-300 leading-relaxed">
                  Hens lay eggs automatically every second so you can harvest and withdraw GRAM tokens.
                </p>
              </div>
              {onBuyChickens && (
                <button
                  type="button"
                  onClick={onBuyChickens}
                  className="clay-btn clay-btn-emerald w-full min-h-[44px] rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                >
                  <Package className="w-4 h-4" />
                  <span>Buy First Chicken</span>
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Motion Particle Bursts on Egg Collection & Chicken Purchases */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[25] overflow-hidden"
      >
        <AnimatePresence>
          {chickenPurchaseBanner && (
            <motion.div
              key={`hen-banner-${chickenPurchaseBanner.seq}`}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.85 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: -38, scale: [0.85, 1.08, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-1/2 top-[48%] -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 text-stone-950 border border-white/80 px-3.5 py-1 text-xs font-extrabold shadow-xl whitespace-nowrap flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>+{chickenPurchaseBanner.addedCount} {chickenPurchaseBanner.addedCount === 1 ? 'Hen' : 'Hens'} Joined Coop!</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {meadowParticles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                opacity: 0,
                x: 0,
                y: 0,
                scale: 0.35,
                rotate: 0,
              }}
              animate={{
                opacity: [0, 1, 1, 0],
                x: p.dx,
                y: p.dy,
                scale: [0.35, p.scale * 1.15, p.scale * 0.65],
                rotate: p.rotateDeg,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                left: `${p.originXPercent}%`,
                top: `${p.originYPercent}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 will-change-transform drop-shadow-[0_3px_8px_rgba(245,158,11,0.55)]"
            >
              {p.glyph === 'egg' ? (
                <EggIcon className="w-5 h-5" />
              ) : p.glyph === 'coin' ? (
                <CoinIcon className="w-5 h-5" />
              ) : p.glyph === 'feather' ? (
                <Feather className="w-5 h-5 text-amber-200 fill-amber-100/80" />
              ) : (
                <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Bottom Action Dock (floats cleanly above mobile BottomNav) */}
      <div className="absolute inset-x-3 bottom-[4.85rem] lg:bottom-3 z-20 flex flex-col gap-2">
        {/* Primary Farm & Collect Dock */}
        <div className="flex items-end gap-2.5">
          <motion.button
            key={`farm-stat-card-${entranceEpoch}`}
            type="button"
            onClick={onOpenYourFarm}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            whileHover={!prefersReducedMotion ? { y: -2, scale: 1.015 } : undefined}
            whileTap={!prefersReducedMotion ? { scale: 0.97 } : undefined}
            transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="clay-btn clay-card !rounded-2xl flex-1 min-h-[56px] px-3 py-2 flex items-center gap-2.5 text-left"
          >
            <div className="w-9 h-9 rounded-xl clay-icon-well flex items-center justify-center shrink-0">
              <EggIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-stone-900 dark:text-stone-100 font-mono-num whitespace-nowrap">
                {productionRate} eggs/h
              </div>
              <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 truncate font-mono-num">
                Lv.{profile.level} · {totalChickens} Hens · {profile.basketTierHours}h Cap
              </div>
            </div>
          </motion.button>

          <div className="relative flex-1">
            {harvestBurst && (
              <div
                key={`harvest-${harvestBurst.seq}`}
                aria-hidden="true"
                className="animate-harvest-rise pointer-events-none absolute -top-9 left-1/2 z-30 flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-amber-400 text-stone-950 border border-white/70 px-3 py-1 text-xs font-extrabold shadow-xl whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono-num">+{harvestBurst.amount.toLocaleString()} Eggs!</span>
              </div>
            )}

            <AnimatePresence>
              {pendingEggs > 0 && (
                <motion.div
                  key="pending-eggs-indicator"
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none"
                >
                  <div
                    aria-hidden="true"
                    className="animate-collect-halo pointer-events-none absolute -inset-1 rounded-2xl bg-amber-300/45 blur-sm"
                  />
                  <div className="animate-clay-badge absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-amber-950/90 text-amber-200 border border-amber-400/40 px-2.5 py-0.5 text-xs font-extrabold shadow-lg whitespace-nowrap pointer-events-none">
                    <EggIcon className="w-3.5 h-3.5" />
                    <span className="font-mono-num">+{pendingEggs.toLocaleString()}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {collectRippleSeq > 0 && !prefersReducedMotion && (
                <motion.span
                  key={`collect-ripple-${collectRippleSeq}`}
                  aria-hidden="true"
                  initial={{ opacity: 0.72, scale: 0.92 }}
                  animate={{ opacity: 0, scale: 1.3 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.65)]"
                />
              )}
            </AnimatePresence>

            <motion.button
              key={`collect-dock-card-${entranceEpoch}`}
              ref={collectBtnRef}
              type="button"
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
              animate={
                isCollectPopping && !prefersReducedMotion
                  ? {
                      opacity: 1,
                      scale: [1, 1.15, 0.94, 1.04, 1],
                      y: [0, -5, 1, 0],
                    }
                  : { opacity: 1, scale: 1, y: 0 }
              }
              transition={{
                duration: isCollectPopping ? 0.44 : 0.3,
                delay: isCollectPopping ? 0 : 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={pendingEggs > 0 && !prefersReducedMotion ? { y: -1.5, scale: 1.02 } : undefined}
              whileTap={pendingEggs > 0 && !prefersReducedMotion ? { scale: 0.94 } : undefined}
              onClick={() => {
                if (pendingEggs > 0) {
                  const nextSeq = ++harvestSeqRef.current;
                  setHarvestBurst({ seq: nextSeq, amount: pendingEggs });
                  if (harvestTimerRef.current) window.clearTimeout(harvestTimerRef.current);
                  harvestTimerRef.current = window.setTimeout(() => {
                    setHarvestBurst((cur) => (cur?.seq === nextSeq ? null : cur));
                  }, 1350);
                  triggerCollectEffects();
                }
                onCollect();
              }}
              disabled={pendingEggs <= 0}
              className={`clay-btn relative w-full min-h-[56px] rounded-2xl px-4 py-2 font-extrabold flex items-center justify-between gap-2 ${
                pendingEggs > 0
                  ? 'clay-btn-amber clay-cta-sheen'
                  : 'clay-btn-neutral opacity-85 cursor-not-allowed text-stone-500 dark:text-stone-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <EggIcon className={`w-5 h-5 shrink-0 ${pendingEggs > 0 ? 'animate-egg-wiggle' : ''}`} />
                <span className="text-sm sm:text-base">{collectLabel}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold font-mono-num leading-none">
                  {pendingEggs}/{profile.basketCapacity}
                </span>
                <div className="w-12 h-2 rounded-full bg-black/15 mt-1 overflow-hidden p-[1px]">
                  <div
                    className={`h-full bg-emerald-500 rounded-full transition-all duration-300 ${
                      pendingEggs > 0 ? 'clay-shimmer-bar' : ''
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            </motion.button>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' &&
        flyingEggs.length > 0 &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-[70] overflow-hidden"
          >
            {flyingEggs.map((particle) => (
              <motion.div
                key={particle.id}
                initial={{
                  x: particle.startX - 14,
                  y: particle.startY - 14,
                  scale: 0.45,
                  opacity: 0,
                  rotate: 0,
                }}
                animate={{
                  x: [particle.startX - 14, particle.midX - 14, particle.endX - 14],
                  y: [particle.startY - 14, particle.midY - 14, particle.endY - 14],
                  scale: [0.5, 1.25, 0.95, 0.42],
                  opacity: [0, 1, 1, 0.15],
                  rotate: [0, particle.rotateDeg, particle.rotateDeg * 0.4, 0],
                }}
                transition={{
                  duration: particle.duration,
                  delay: particle.delay,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute top-0 left-0 w-7 h-7 flex items-center justify-center will-change-transform drop-shadow-[0_4px_10px_rgba(245,158,11,0.55)]"
              >
                <EggIcon className="w-7 h-7" />
              </motion.div>
            ))}
          </div>,
          document.body,
        )}
    </motion.section>
  );
}
