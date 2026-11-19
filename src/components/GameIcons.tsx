import { useId, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { ChickenBreedId } from '../types/farm';
import leghornRealImg from '../assets/images/hens/leghorn.png';
import rhodeRealImg from '../assets/images/hens/rhode.png';
import orpingtonRealImg from '../assets/images/hens/orpington.png';
import australorpRealImg from '../assets/images/hens/australorp.png';

const REALISTIC_HEN_ASSETS: Record<
  ChickenBreedId,
  { src: string; alt: string }
> = {
  leghorn: { src: leghornRealImg, alt: 'White Leghorn hen' },
  rhode: { src: rhodeRealImg, alt: 'Rhode Island Red hen' },
  orpington: { src: orpingtonRealImg, alt: 'Buff Orpington hen' },
  australorp: { src: australorpRealImg, alt: 'Black Australorp hen' },
};

export function PlayerAvatar({
  photoUrl,
  displayName,
  avatarColor,
  className = 'w-10 h-10 text-base',
}: {
  photoUrl?: string;
  displayName: string;
  avatarColor: string;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (displayName || 'F').charAt(0).toUpperCase();
  const showImage = Boolean(photoUrl && !imgFailed);

  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center text-white font-extrabold shrink-0 shadow-[0_6px_12px_-4px_rgba(0,0,0,0.28),inset_2px_2px_5px_rgba(255,255,255,0.45),inset_-2px_-2px_5px_rgba(0,0,0,0.22)] ${className}`}
      style={{ backgroundColor: avatarColor }}
    >
      {showImage ? (
        <img
          src={photoUrl}
          alt={displayName}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

export function CoinIcon({ className = 'w-6 h-6' }: { className?: string }) {
  const uid = useId();
  const outerGradId = `clayCoinOuter-${uid}`;
  const innerGradId = `clayCoinInner-${uid}`;
  return (
    <svg viewBox="0 0 32 32" className={`drop-shadow-[0_2px_3px_rgba(146,64,14,0.28)] ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={outerGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id={innerGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#${outerGradId})`} stroke="#92400E" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="10.2" fill={`url(#${innerGradId})`} stroke="#D97706" strokeWidth="1.4" />
      <ellipse cx="12.5" cy="10.5" rx="3.2" ry="1.4" transform="rotate(-25 12.5 10.5)" fill="#FFFFFF" opacity="0.55" />
      <path d="M16 9.5v13M13 12.5c0-1.4 1.3-2.2 3-2.2s3 .8 3 2c0 1.3-1.2 1.8-3 2.2-1.8.4-3 1-3 2.3 0 1.4 1.3 2.2 3 2.2s3-.8 3-2.2" fill="none" stroke="#92400E" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

export function EggIcon({ className = 'w-6 h-6' }: { className?: string }) {
  const uid = useId();
  const eggGradId = `clayEggGrad-${uid}`;
  return (
    <svg viewBox="0 0 32 32" className={`drop-shadow-[0_2px_3px_rgba(146,64,14,0.22)] ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id={eggGradId} cx="35%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <path
        d="M16 3C10.5 3 6.5 11.5 6.5 18.5C6.5 24.8 10.6 29 16 29C21.4 29 25.5 24.8 25.5 18.5C25.5 11.5 21.5 3 16 3Z"
        fill="#FFFDF5"
        stroke="#B45309"
        strokeWidth="1.7"
      />
      <path
        d="M16 3.8C11 3.8 7.3 11.8 7.3 18.4C7.3 24.1 11 28.1 16 28.1C21 28.1 24.7 24.1 24.7 18.4C24.7 11.8 21 3.8 16 3.8Z"
        fill={`url(#${eggGradId})`}
      />
      <ellipse cx="12.5" cy="11.5" rx="2.3" ry="4.2" transform="rotate(-16 12.5 11.5)" fill="#FFFFFF" opacity="0.92" />
      <path d="M10 22.4C11.6 25.5 14.7 26.8 17.8 26.2" stroke="#FCD34D" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function ChickenSprite({
  breed,
  className = 'w-12 h-12',
  facingLeft = false,
}: {
  breed: ChickenBreedId;
  className?: string;
  facingLeft?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const asset = REALISTIC_HEN_ASSETS[breed];

  if (!imgFailed && asset?.src) {
    return (
      <img
        src={asset.src}
        alt={asset.alt}
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`object-contain select-none ${className}`}
        style={{ transform: facingLeft ? 'scaleX(-1)' : undefined }}
      />
    );
  }

  const palette: Record<
    ChickenBreedId,
    { body: string; wing: string; belly: string; beak: string; comb: string; outline: string; eye: string }
  > = {
    leghorn: {
      body: '#FFFFFF',
      wing: '#E2E8F0',
      belly: '#F8FAFC',
      beak: '#F59E0B',
      comb: '#EF4444',
      outline: '#334155',
      eye: '#0F172A',
    },
    rhode: {
      body: '#C25912',
      wing: '#9A3412',
      belly: '#EA580C',
      beak: '#FBBF24',
      comb: '#DC2626',
      outline: '#451A03',
      eye: '#1C1917',
    },
    orpington: {
      body: '#FBBF24',
      wing: '#D97706',
      belly: '#FDE68A',
      beak: '#EA580C',
      comb: '#DC2626',
      outline: '#78350F',
      eye: '#1C1917',
    },
    australorp: {
      body: '#27364B',
      wing: '#0F172A',
      belly: '#475569',
      beak: '#F59E0B',
      comb: '#EF4444',
      outline: '#020617',
      eye: '#F8FAFC',
    },
  };

  const c = palette[breed];

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      style={{ transform: facingLeft ? 'scaleX(-1)' : undefined }}
      aria-hidden="true"
    >
      <ellipse cx="24" cy="43" rx="12" ry="3.2" fill="rgba(15,23,42,0.24)" />
      <path d="M20 35v6m0 0l-3 1.5M20 41l2.5 1.2M28 35v6m0 0l-2.5 1.2M28 41l3 1.5" stroke="#EA580C" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 23c-4-4-6-1-4 4-3 0-3 4 1 5l6-2z" fill={c.wing} stroke={c.outline} strokeWidth="2" strokeLinejoin="round" />
      <path d="M26 10c0-3 3-4 4-1.5 1.5-2.5 4.5-1 4 1.5 2-.5 3 2 1 3.5h-9z" fill={c.comb} stroke={c.outline} strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M12 27c0-7 5-13 13-13 5.5 0 10 3.5 10 9.5 0 7.5-5.2 13.5-12.5 13.5-6.2 0-10.5-4.2-10.5-10z"
        fill={c.body}
        stroke={c.outline}
        strokeWidth="2.1"
      />
      <ellipse cx="22" cy="19" rx="4.5" ry="2.2" transform="rotate(-20 22 19)" fill="#FFFFFF" opacity="0.38" />
      <path d="M17 31c2.5 3.2 7.5 3.8 11 1.5" stroke={c.belly} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M16 25c0-3.5 3.8-5.5 8-4.5 2.5.6 3.5 3.5 1.5 5.8-2.2 2.5-9.5 2.2-9.5-1.3z" fill={c.wing} stroke={c.outline} strokeWidth="1.8" />
      <path d="M33 23c1.5 1.2 1.2 3.8-.5 4-1.4.2-1.8-1.8-.8-3.5" fill={c.comb} stroke={c.outline} strokeWidth="1.5" />
      <path d="M34 18.5l6 2-6 2.5z" fill={c.beak} stroke={c.outline} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="30.5" cy="18" r="1.9" fill={c.eye} />
      <circle cx="30" cy="17.3" r="0.6" fill="#FFFFFF" opacity="0.85" />
      {breed === 'australorp' && <circle cx="31" cy="17.5" r="0.7" fill="#0F172A" />}
    </svg>
  );
}

export function QRCodeSvg({ value, className = 'w-44 h-44' }: { value: string; className?: string }) {
  const { size, rects } = useMemo(() => {
    const qr = QRCode.create(value || ' ', { errorCorrectionLevel: 'M' });
    const dim = qr.modules.size;
    const data = qr.modules.data;
    const cells: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < dim; r += 1) {
      for (let c = 0; c < dim; c += 1) {
        if (data[r * dim + c]) {
          cells.push({ x: c + 2, y: r + 2 });
        }
      }
    }
    return { size: dim + 4, rects: cells };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label="Deposit wallet QR code"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={size} height={size} rx="2" fill="#FFFFFF" />
      {rects.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" fill="#111827" />
      ))}
    </svg>
  );
}
