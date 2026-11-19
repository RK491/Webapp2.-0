import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bot } from 'lucide-react';

export const STATIC_FARM_IMAGE_PATH = '/assets/aistudio/media_1794882409315_bd780e3e_397ab847.jpg';

const FARM_IMAGE_ASPECT = 2 / 3;

interface FoliageZone {
  id: string;
  clipPath: string;
  maskImage?: string;
  animClass: string;
  delay: string;
  duration?: string;
}

/**
 * Strictly foliage-only & crop-only regions carefully avoiding all stone walls,
 * buildings, solar roofs, iron gates, and paved roads so structures stay 100% static.
 */
const FOLIAGE_MOTION_ZONES: FoliageZone[] = [
  // Background upper-left & upper-right forest canopies
  {
    id: 'forest-upper-left',
    clipPath: 'polygon(0% 13.5%, 44% 13.5%, 39% 25.5%, 15% 27%, 0% 34%)',
    animClass: 'animate-foliage-rustle-a',
    delay: '0s',
    duration: '6.4s',
  },
  {
    id: 'forest-upper-right',
    clipPath: 'polygon(77% 14.5%, 100% 14.5%, 100% 36%, 82.5% 33%, 78.5% 23.5%)',
    animClass: 'animate-foliage-rustle-b',
    delay: '1.1s',
    duration: '7.1s',
  },
  // Foreground lower-left & lower-right tree canopies outside stone wall
  {
    id: 'trees-bottom-left',
    clipPath: 'polygon(0% 84.5%, 23% 87.5%, 39% 94%, 43% 100%, 0% 100%)',
    animClass: 'animate-foliage-rustle-a',
    delay: '0.5s',
    duration: '5.6s',
  },
  {
    id: 'trees-bottom-right',
    clipPath: 'polygon(64% 94%, 82% 81%, 100% 77%, 100% 100%, 61% 100%)',
    animClass: 'animate-foliage-rustle-b',
    delay: '1.7s',
    duration: '5.9s',
  },
  // Farmhouse rooftop garden & barn vertical hydroponics greenery
  {
    id: 'rooftop-garden',
    clipPath: 'ellipse(7.8% 3.0% at 28.5% 24.6%)',
    animClass: 'animate-foliage-rustle-a',
    delay: '0.8s',
    duration: '4.9s',
  },
  {
    id: 'hydroponics-wall',
    clipPath: 'polygon(50% 30.2%, 64% 32.8%, 64% 37.6%, 50% 35.1%)',
    animClass: 'animate-foliage-rustle-b',
    delay: '1.4s',
    duration: '5.3s',
  },
  // Terraced left crop beds (leafy greens & tomato trellises)
  {
    id: 'crops-upper',
    clipPath: 'polygon(0% 42%, 22% 45.2%, 23.5% 53%, 0% 50.8%)',
    animClass: 'animate-crop-ripple',
    delay: '0.2s',
    duration: '4.6s',
  },
  {
    id: 'crops-tomatoes-mid',
    clipPath: 'polygon(2.5% 48.5%, 37.5% 52.5%, 43.5% 63%, 23% 70.5%, 2% 62%)',
    animClass: 'animate-crop-ripple',
    delay: '1.0s',
    duration: '5.0s',
  },
  {
    id: 'crops-lower-greens',
    clipPath: 'polygon(16% 62%, 39.5% 60.2%, 35.5% 72.5%, 12.5% 70.5%)',
    animClass: 'animate-crop-ripple',
    delay: '0.6s',
    duration: '4.4s',
  },
  // Right-hand golden wheat / grain field (two staggered wind wave bands)
  {
    id: 'wheat-upper',
    clipPath: 'polygon(84% 56%, 94% 53.2%, 100% 57%, 100% 64%, 92% 66.8%, 82% 61.5%)',
    animClass: 'animate-crop-ripple',
    delay: '0.3s',
    duration: '3.9s',
  },
  {
    id: 'wheat-lower',
    clipPath: 'polygon(73.2% 60.2%, 84% 57.2%, 96% 63%, 93.8% 70%, 73.2% 64%)',
    animClass: 'animate-crop-ripple',
    delay: '1.15s',
    duration: '4.2s',
  },
  // Pond edge reeds & cattails
  {
    id: 'reeds-left',
    clipPath: 'ellipse(4.4% 5.2% at 40% 72%)',
    animClass: 'animate-reed-sway',
    delay: '0.4s',
    duration: '4.1s',
  },
  {
    id: 'reeds-right',
    clipPath: 'ellipse(4.4% 5.2% at 85% 70%)',
    animClass: 'animate-reed-sway',
    delay: '1.3s',
    duration: '4.5s',
  },
  {
    id: 'reeds-front',
    clipPath: 'ellipse(5.8% 4.2% at 54% 84.5%)',
    animClass: 'animate-reed-sway',
    delay: '0.9s',
    duration: '3.8s',
  },
];

const WIND_TURBINES = [
  { left: 59.5, top: 7.3, dur: 2.15 },
  { left: 63.4, top: 6.9, dur: 2.4 },
  { left: 67.3, top: 6.6, dur: 1.95 },
  { left: 71.1, top: 7.1, dur: 2.25 },
  { left: 75.2, top: 6.5, dur: 2.05 },
];

const SWIMMING_WATERFOWL = [
  { left: '53%', top: '76%', rx: 20, ry: 6, dur: 9.4, delay: 0, isSwan: true },
  { left: '72%', top: '78.5%', rx: -18, ry: -5.5, dur: 10.8, delay: 1.1, isSwan: true },
  { left: '56.5%', top: '81.5%', rx: 16, ry: -4.5, dur: 8.2, delay: 0.6, isSwan: false },
  { left: '68%', top: '72.5%', rx: -15, ry: 4.5, dur: 9.8, delay: 1.7, isSwan: false },
];

interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

interface RippleRing {
  cx: number;
  cy: number;
  rx: number;
  maxRx: number;
  alpha: number;
  speed: number;
}

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  kind: 'dust' | 'leaf';
}

interface SmokeWisp {
  x: number;
  y: number;
  r: number;
  alpha: number;
  vx: number;
  vy: number;
}

interface LivingFarmEffectsProps {
  boosterActive: boolean;
  droneActive: boolean;
  isPaused?: boolean;
  children?: React.ReactNode;
}

export function LivingFarmEffects({
  boosterActive,
  droneActive,
  isPaused = false,
  children,
}: LivingFarmEffectsProps) {
  const prefersReducedMotion = useReducedMotion();
  const [bgFailed, setBgFailed] = useState(false);
  const stageOuterRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [coverBox, setCoverBox] = useState<{ width: number; height: number } | null>(null);
  const [isInViewport, setIsInViewport] = useState(true);
  const [isDocVisible, setIsDocVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'),
  );

  useEffect(() => {
    const el = stageOuterRef.current;
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

  const effectivePaused = Boolean(isPaused) || !isInViewport || !isDocVisible;

  useEffect(() => {
    const el = stageOuterRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const containerAspect = rect.width / rect.height;
      let width = rect.width;
      let height = rect.height;
      if (containerAspect > FARM_IMAGE_ASPECT) {
        width = rect.width;
        height = rect.width / FARM_IMAGE_ASPECT;
      } else {
        height = rect.height;
        width = rect.height * FARM_IMAGE_ASPECT;
      }
      setCoverBox((prev) =>
        prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { width, height },
      );
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !coverBox) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(coverBox.width));
    const H = Math.max(1, Math.round(coverBox.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    // Coordinates anchored to the exact 2:3 isometric image
    const fountainX = 0.636 * W;
    const fountainBaseY = 0.768 * H;
    const pondCx = 0.612 * W;
    const pondCy = 0.773 * H;
    const pondRx = 0.172 * W;
    const pondRy = 0.072 * H;

    const droplets: Droplet[] = Array.from({ length: 84 }, (_, i) => {
      const spread = ((i % 19) - 9) / 9;
      return {
        x: fountainX + spread * (0.008 * W),
        y: fountainBaseY - Math.random() * (0.025 * H),
        vx: spread * (0.026 * W) + (Math.random() - 0.5) * 6,
        vy: -(0.048 + Math.random() * 0.044) * H,
        radius: 0.7 + Math.random() * 1.15,
        alpha: 0.45 + Math.random() * 0.45,
      };
    });

    const ripples: RippleRing[] = [
      { cx: fountainX, cy: fountainBaseY, rx: 4, maxRx: 0.068 * W, alpha: 0.55, speed: 14 },
      { cx: fountainX, cy: fountainBaseY, rx: 0.032 * W, maxRx: 0.074 * W, alpha: 0.35, speed: 13 },
      { cx: 0.525 * W, cy: 0.755 * H, rx: 3, maxRx: 0.035 * W, alpha: 0.4, speed: 9 },
      { cx: 0.728 * W, cy: 0.735 * H, rx: 2, maxRx: 0.03 * W, alpha: 0.35, speed: 8 },
      { cx: 0.724 * W, cy: 0.798 * H, rx: 5, maxRx: 0.036 * W, alpha: 0.38, speed: 8.5 },
    ];

    const motes: DustMote[] = Array.from({ length: 34 }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 5 + Math.random() * 9,
      vy: -3.5 - Math.random() * 5.5,
      r: i % 6 === 0 ? 1.9 : 0.85 + Math.random() * 1.25,
      phase: Math.random() * Math.PI * 2,
      kind: i % 6 === 0 ? 'leaf' : 'dust',
    }));

    const smokeWisps: SmokeWisp[] = Array.from({ length: 7 }, (_, i) => ({
      x: 0.292 * W + i * 1.5,
      y: 0.242 * H - i * 4,
      r: 3.2 + i * 0.9,
      alpha: Math.max(0, 0.35 - i * 0.045),
      vx: 4.5 + Math.random() * 2.5,
      vy: -10 - Math.random() * 4,
    }));

    const wavelets = Array.from({ length: 24 }, (_, i) => ({
      u: (Math.random() - 0.5) * 1.65,
      v: (Math.random() - 0.5) * 1.55,
      len: 0.012 * W + Math.random() * (0.018 * W),
      phase: i * 0.7,
      speed: 0.9 + Math.random() * 0.8,
    })).filter((w) => w.u * w.u + w.v * w.v < 0.86);

    const lakeGlints = Array.from({ length: 14 }, (_, i) => ({
      x: (0.20 + (i / 13) * 0.43) * W,
      y: (0.095 + ((i * 37) % 10) * 0.0048) * H,
      len: 0.012 * W + (i % 3) * (0.007 * W),
      phase: i * 0.85,
    }));

    let rafId = 0;
    let lastTs = performance.now();
    let elapsed = 0;
    let rippleSpawnAccum = 0;

    const drawFrame = (dt: number) => {
      elapsed += dt;
      rippleSpawnAccum += dt;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // 1. Distant Lake golden-hour sun shimmer
      for (const lg of lakeGlints) {
        const pulse = 0.2 + 0.65 * Math.max(0, Math.sin(elapsed * 1.7 + lg.phase));
        ctx.strokeStyle = `rgba(254, 243, 199, ${(pulse * 0.55).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(lg.x - lg.len * 0.5, lg.y);
        ctx.lineTo(lg.x + lg.len * 0.5, lg.y);
        ctx.stroke();
      }

      // 2. Clipped Foreground Pond Water Shimmer & Concentric Ripples
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(pondCx, pondCy, pondRx, pondRy, -0.05, 0, Math.PI * 2);
      ctx.clip();

      // Gentle sunlit water wavelets
      for (const wv of wavelets) {
        const sx = pondCx + wv.u * pondRx + Math.sin(elapsed * 0.9 + wv.phase) * 3.5;
        const sy = pondCy + wv.v * pondRy;
        const alpha = 0.14 + 0.34 * (0.5 + 0.5 * Math.sin(elapsed * wv.speed + wv.phase));
        ctx.strokeStyle = `rgba(224, 242, 254, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(sx - wv.len * 0.5, sy);
        ctx.lineTo(sx + wv.len * 0.5, sy);
        ctx.stroke();
      }

      // Periodically emit fountain & waterfowl ripples
      if (rippleSpawnAccum > 0.72) {
        rippleSpawnAccum = 0;
        ripples.push({
          cx: fountainX + (Math.random() - 0.5) * 4,
          cy: fountainBaseY + (Math.random() - 0.5) * 2,
          rx: 3,
          maxRx: (0.055 + Math.random() * 0.025) * W,
          alpha: 0.58,
          speed: 13 + Math.random() * 3,
        });
        if (ripples.length > 12) ripples.shift();
      }

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const rp = ripples[i];
        rp.rx += rp.speed * dt;
        const progress = rp.rx / rp.maxRx;
        const curAlpha = rp.alpha * (1 - progress);
        if (progress >= 1) {
          if (i < 5) {
            rp.rx = 2;
          } else {
            ripples.splice(i, 1);
          }
          continue;
        }
        ctx.strokeStyle = `rgba(240, 249, 255, ${Math.max(0, curAlpha).toFixed(3)})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(rp.cx, rp.cy, rp.rx, rp.rx * 0.46, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Fountain Aerated Mist Core & Ballistic Droplets
      const plumeH = (0.032 + 0.004 * Math.sin(elapsed * 5.2)) * H;
      const grad = ctx.createLinearGradient(fountainX, fountainBaseY, fountainX, fountainBaseY - plumeH);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.48)');
      grad.addColorStop(0.55, 'rgba(240, 249, 255, 0.34)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fountainX - 0.012 * W, fountainBaseY);
      ctx.quadraticCurveTo(fountainX, fountainBaseY - plumeH * 1.15, fountainX + 0.012 * W, fountainBaseY);
      ctx.closePath();
      ctx.fill();

      const gravity = 0.14 * H;
      for (const d of droplets) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += gravity * dt;

        // Reset droplet cleanly on splash plane
        if (d.y > fountainBaseY + 2) {
          const spread = (Math.random() - 0.5) * 2;
          d.x = fountainX + spread * (0.005 * W);
          d.y = fountainBaseY - 1;
          d.vx = spread * (0.025 * W);
          d.vy = -(0.046 + Math.random() * 0.044) * H;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${d.alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Cozy Farmhouse Chimney Smoke Curls
      for (const sw of smokeWisps) {
        sw.x += (sw.vx + Math.sin(elapsed * 1.4 + sw.y * 0.05) * 2) * dt;
        sw.y += sw.vy * dt;
        sw.r += 2.2 * dt;
        sw.alpha -= 0.095 * dt;
        if (sw.alpha <= 0.01 || sw.y < 0.16 * H) {
          sw.x = 0.292 * W + (Math.random() - 0.5) * 2;
          sw.y = 0.242 * H;
          sw.r = 2.6;
          sw.alpha = 0.34;
        }
        ctx.fillStyle = `rgba(255, 251, 235, ${sw.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Golden-Hour Floating Dust Motes & Drifting Leaf Flecks
      for (const m of motes) {
        m.x += (m.vx + Math.sin(elapsed * 0.8 + m.phase) * 4) * dt;
        m.y += (m.vy + Math.cos(elapsed * 0.7 + m.phase) * 2) * dt;
        if (m.x > W + 8) m.x = -6;
        if (m.y < -8) m.y = H + 6;

        const twinkle = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * 1.9 + m.phase));
        if (m.kind === 'leaf') {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(elapsed * 1.3 + m.phase);
          ctx.fillStyle = boosterActive
            ? `rgba(110, 231, 183, ${(twinkle * 0.75).toFixed(2)})`
            : `rgba(217, 249, 157, ${(twinkle * 0.72).toFixed(2)})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, m.r * 1.5, m.r * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = boosterActive
            ? `rgba(167, 243, 208, ${(twinkle * 0.75).toFixed(2)})`
            : `rgba(254, 243, 199, ${(twinkle * 0.75).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (prefersReducedMotion || effectivePaused) {
      drawFrame(0);
      return;
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      if (canvas.offsetParent !== null) {
        drawFrame(dt);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [boosterActive, coverBox, effectivePaused, prefersReducedMotion]);

  return (
    <div
      ref={stageOuterRef}
      data-farm-paused={effectivePaused || prefersReducedMotion ? 'true' : undefined}
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {/* Exact pixel-locked 2:3 isometric stage: zero camera shake, zero zoom, buildings/walls/roads completely static */}
      <div
        style={
          coverBox
            ? { width: `${coverBox.width}px`, height: `${coverBox.height}px` }
            : undefined
        }
        className={
          coverBox
            ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none'
            : 'absolute inset-0 w-full h-full pointer-events-none'
        }
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {!bgFailed ? (
            <img
              src={STATIC_FARM_IMAGE_PATH}
              alt="Static isometric view of a sustainable solar farm complex with farmhouse, solar barn, packing facility, two chicken coops, terraced crop fields, golden wheat, foreground pond with fountain and waterfowl, forest, and distant wind turbines"
              referrerPolicy="no-referrer"
              onError={() => setBgFailed(true)}
              className="w-full h-full object-cover object-center select-none pointer-events-none"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-amber-300/40 via-emerald-800 to-stone-900 flex items-center justify-center">
              <div className="rounded-3xl bg-stone-950/55 border border-white/15 px-5 py-3 text-center text-amber-100 text-xs font-semibold">
                Sustainable Eco-Farm Estate
              </div>
            </div>
          )}

          {/* 1. Foliage-Only & Crop-Only Rustling Cinemagraph Overlays (Buildings, Walls & Roads stay 100% still) */}
          {!bgFailed &&
            !prefersReducedMotion &&
            FOLIAGE_MOTION_ZONES.map((zone) => (
              <div
                key={zone.id}
                style={{
                  clipPath: zone.clipPath,
                  WebkitClipPath: zone.clipPath,
                }}
                className="absolute inset-0 pointer-events-none overflow-hidden will-change-transform"
              >
                <img
                  src={STATIC_FARM_IMAGE_PATH}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{
                    animationDelay: zone.delay,
                    animationDuration: zone.duration,
                  }}
                  className={`${zone.animClass} will-change-transform w-full h-full object-cover object-center select-none pointer-events-none`}
                />
              </div>
            ))}

          {/* 2. Distant Spinning Wind Turbines (anchored cleanly to exact horizon towers) */}
          {!prefersReducedMotion &&
            WIND_TURBINES.map((t, idx) => (
              <div
                key={`turbine-${idx}`}
                style={{ left: `${t.left}%`, top: `${t.top}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5"
              >
                <span
                  style={{
                    background:
                      'radial-gradient(circle, rgba(226,222,199,0.68) 0%, rgba(215,212,188,0.34) 48%, transparent 72%)',
                  }}
                  className="absolute inset-0 rounded-full"
                />
                <motion.span
                  animate={effectivePaused ? false : { rotate: 360 }}
                  transition={{
                    duration: t.dur,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="absolute inset-0 will-change-transform"
                >
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 w-[1.4px] h-2.5 bg-white/95 rounded-full shadow-[0_0_4px_rgba(255,255,255,0.85)]" />
                  <span className="absolute left-1/2 bottom-[2px] -translate-x-1/2 rotate-[120deg] origin-top w-[1.4px] h-2.5 bg-white/90 rounded-full" />
                  <span className="absolute left-1/2 bottom-[2px] -translate-x-1/2 -rotate-[120deg] origin-top w-[1.4px] h-2.5 bg-white/90 rounded-full" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white" />
                </motion.span>
              </div>
            ))}

          {/* 3. Subtle Solar Reflection Glints, Soaring Distant Birds & Garden Butterflies */}
          {!prefersReducedMotion && (
            <>
              <motion.div
                animate={effectivePaused ? false : { opacity: [0, 0.42, 0], x: [-28, 32] }}
                transition={{ duration: 4.8, repeat: Infinity, repeatDelay: 3.0, ease: 'easeInOut' }}
                style={{ left: '52%', top: '23%', transform: 'rotate(-22deg)' }}
                className="will-change-transform absolute w-28 h-8 rounded-full bg-gradient-to-r from-transparent via-amber-100/55 to-transparent blur-sm"
              />
              <motion.div
                animate={effectivePaused ? false : { opacity: [0, 0.38, 0], x: [-16, 18] }}
                transition={{ duration: 4.2, delay: 1.9, repeat: Infinity, repeatDelay: 3.4, ease: 'easeInOut' }}
                style={{ left: '77%', top: '36.5%', transform: 'rotate(-22deg)' }}
                className="will-change-transform absolute w-16 h-5 rounded-full bg-gradient-to-r from-transparent via-sky-100/55 to-transparent blur-sm"
              />

              {/* Tiny distant swallows soaring smoothly over the forest & lake */}
              {[0, 1, 2].map((idx) => (
                <motion.svg
                  key={`swallow-${idx}`}
                  viewBox="0 0 24 12"
                  initial={{ x: -30, y: 0, opacity: 0 }}
                  animate={
                    effectivePaused
                      ? false
                      : {
                          x: [-30 + idx * 18, 130 + idx * 24, 300],
                          y: [0, -10 - idx * 3, -3],
                          scaleY: [1, 0.55, 1.15, 0.65, 1],
                          opacity: [0, 0.78, 0.78, 0],
                        }
                  }
                  transition={{
                    duration: 15 + idx * 2.4,
                    delay: idx * 3.8,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  style={{ left: `${10 + idx * 5}%`, top: `${8.2 + idx * 2.1}%` }}
                  className="will-change-transform absolute w-3.5 h-2 text-stone-800/70"
                >
                  <path
                    d="M1 8 Q6 2 12 7 Q18 2 23 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </motion.svg>
              ))}

              {/* Subtle butterflies fluttering gently above vegetable & tomato rows */}
              {[
                { left: '19%', top: '53%', dx: 18, dy: -11, dur: 5.4, color: 'text-amber-300' },
                { left: '30%', top: '60%', dx: -15, dy: -9, dur: 6.1, color: 'text-yellow-200' },
                { left: '15%', top: '64%', dx: 14, dy: -12, dur: 4.9, color: 'text-orange-200' },
              ].map((bf, idx) => (
                <motion.div
                  key={`crop-butterfly-${idx}`}
                  animate={
                    effectivePaused
                      ? false
                      : {
                          x: [0, bf.dx, bf.dx * 0.4, -bf.dx * 0.5, 0],
                          y: [0, bf.dy, -3, bf.dy * 0.7, 0],
                          scaleX: [1, 0.38, 1, 0.42, 1],
                        }
                  }
                  transition={{
                    duration: bf.dur,
                    delay: idx * 0.9,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{ left: bf.left, top: bf.top }}
                  className={`will-change-transform absolute w-2.5 h-2.5 ${bf.color} drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]`}
                >
                  <svg viewBox="0 0 16 12" className="w-full h-full fill-current">
                    <path d="M8 6 C5 1, 1 2, 2 6 C1 9, 5 11, 8 7 C11 11, 15 9, 14 6 C15 2, 11 1, 8 6 Z" />
                  </svg>
                </motion.div>
              ))}

              {/* Realistic swimming ducks & swans gliding smoothly across the pond with gentle water wakes */}
              {SWIMMING_WATERFOWL.map((bird, idx) => (
                <motion.div
                  key={`pond-waterfowl-${idx}`}
                  animate={
                    effectivePaused
                      ? false
                      : {
                          x: [0, bird.rx, bird.rx * 0.45, -bird.rx * 0.45, 0],
                          y: [0, bird.ry, -bird.ry * 0.55, bird.ry * 0.4, 0],
                          rotate: [-1.5, 1.5, -1, 1.5, -1.5],
                        }
                  }
                  transition={{
                    duration: bird.dur,
                    delay: bird.delay,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  style={{ left: bird.left, top: bird.top }}
                  className="will-change-transform absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <motion.span
                    animate={effectivePaused ? false : { scale: [0.85, 1.35, 0.85], opacity: [0.55, 0.16, 0.55] }}
                    transition={{ duration: 2.3, delay: idx * 0.45, repeat: Infinity, ease: 'easeInOut' }}
                    className="will-change-transform absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-1.5 rounded-full border border-sky-100/70"
                  />
                  {bird.isSwan ? (
                    <svg viewBox="0 0 20 16" className="w-4 h-3.5 drop-shadow-[0_2px_3px_rgba(12,35,48,0.45)]">
                      <path
                        d="M4 11 C4 8, 9 8, 12 10 C13 7, 13 4, 15 3 C16.5 2.5, 17.5 3.5, 16.5 4.8 C15 5, 14.5 8, 15 11 C15 13, 6 13.5, 4 11 Z"
                        fill="#ffffff"
                      />
                      <path d="M16.5 4 L18.5 4.6 L16.4 5.2 Z" fill="#f59e0b" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 18 14" className="w-3.5 h-3 drop-shadow-[0_2px_3px_rgba(12,35,48,0.45)]">
                      <ellipse cx="8" cy="9" rx="5" ry="3" fill="#785032" />
                      <circle cx="13" cy="5.5" r="2.2" fill="#065f46" />
                      <path d="M14.8 5.4 L17 6 L14.8 6.4 Z" fill="#f59e0b" />
                    </svg>
                  )}
                </motion.div>
              ))}
            </>
          )}

          {/* 4. Warm Realistic Cinematic Golden-Hour Sunlight (volumetric sunbeams + horizon glow) */}
          <div
            className="animate-sunbeam absolute -top-24 -left-16 w-80 h-[125%] bg-gradient-to-b from-amber-100/26 via-yellow-50/10 to-transparent blur-2xl"
          />
          <div
            style={{ animationDelay: '2.6s' }}
            className="animate-sunbeam absolute -top-24 left-1/3 w-56 h-[125%] bg-gradient-to-b from-amber-50/18 via-orange-100/8 to-transparent blur-2xl"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_14%_6%,rgba(254,240,138,0.26),rgba(253,186,116,0.10)_40%,transparent_72%)]"
          />

          {/* 5. Real-Time Physics Canvas: Fountain spray, pond ripples, lake shimmer, smoke, floating pollen & leaves */}
          <canvas
            ref={canvasRef}
            className="will-change-transform absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* 5. Active Auto-Harvest Drone patrolling smoothly above the yard */}
          {droneActive && !prefersReducedMotion && (
            <motion.div
              animate={
                effectivePaused
                  ? false
                  : {
                      x: [-54, 52, 38, -42, -54],
                      y: [-8, -20, 6, -4, -8],
                    }
              }
              transition={{
                duration: 11,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ left: '50%', top: '39%' }}
              className="will-change-transform absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
            >
              <div className="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-300/70 backdrop-blur-sm flex items-center justify-center shadow-[0_6px_14px_rgba(14,165,233,0.45)]">
                <Bot className="w-4 h-4 text-sky-100" />
              </div>
              <span className="mt-1.5 w-6 h-1.5 rounded-full bg-stone-950/35 blur-[2px]" />
            </motion.div>
          )}
        </div>

        {/* Bought Roaming Hens Layer aligned strictly to the exact 2:3 lawn coordinate space */}
        {children}
      </div>
    </div>
  );
}
