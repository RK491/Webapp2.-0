import confetti from 'canvas-confetti';

function canRunConfetti(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
  }
  return true;
}

function safeFire(options: confetti.Options): void {
  if (!canRunConfetti()) return;
  try {
    void confetti({
      disableForReducedMotion: true,
      ...options,
    });
  } catch {
    // Ignore canvas errors in restricted headless environments
  }
}

export function triggerWithdrawalConfetti(): void {
  safeFire({
    particleCount: 65,
    spread: 68,
    origin: { y: 0.68 },
    colors: ['#10B981', '#F59E0B', '#0EA5E9', '#FDE047'],
  });
}

export function triggerTop10RankConfetti(): void {
  safeFire({
    particleCount: 55,
    angle: 60,
    spread: 55,
    origin: { x: 0.15, y: 0.65 },
    colors: ['#F59E0B', '#FBBF24', '#10B981', '#38BDF8'],
  });
  safeFire({
    particleCount: 55,
    angle: 120,
    spread: 55,
    origin: { x: 0.85, y: 0.65 },
    colors: ['#F59E0B', '#FBBF24', '#10B981', '#38BDF8'],
  });
}

export function triggerCollectConfetti(): void {
  safeFire({
    particleCount: 36,
    spread: 58,
    startVelocity: 26,
    scalar: 0.85,
    origin: { y: 0.72 },
    colors: ['#F59E0B', '#FDE047', '#FFFBEB', '#10B981'],
  });
}

export function triggerGoldenEggConfetti(): void {
  safeFire({
    particleCount: 48,
    angle: 65,
    spread: 52,
    startVelocity: 32,
    origin: { x: 0.22, y: 0.62 },
    colors: ['#FBBF24', '#FDE047', '#F59E0B', '#FEF3C7'],
  });
  safeFire({
    particleCount: 48,
    angle: 115,
    spread: 52,
    startVelocity: 32,
    origin: { x: 0.78, y: 0.62 },
    colors: ['#FBBF24', '#FDE047', '#F59E0B', '#FEF3C7'],
  });
}

export function triggerRewardConfetti(): void {
  safeFire({
    particleCount: 45,
    spread: 64,
    startVelocity: 28,
    origin: { y: 0.66 },
    colors: ['#10B981', '#34D399', '#F59E0B', '#FDE047'],
  });
}

export function triggerDepositConfetti(): void {
  safeFire({
    particleCount: 60,
    spread: 72,
    startVelocity: 30,
    origin: { y: 0.64 },
    colors: ['#10B981', '#0EA5E9', '#34D399', '#FBBF24'],
  });
}
