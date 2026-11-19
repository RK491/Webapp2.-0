export const AUDIO_SETTINGS_STORAGE_KEY = 'chickenland_audio_settings_v2';

export interface AudioSettings {
  musicEnabled: boolean;
  soundsEnabled: boolean;
  preMuteMusicEnabled?: boolean;
  preMuteSoundsEnabled?: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicEnabled: true,
  soundsEnabled: true,
};

export function isAllAudioMuted(settings: Pick<AudioSettings, 'musicEnabled' | 'soundsEnabled'>): boolean {
  return !settings.musicEnabled && !settings.soundsEnabled;
}

export function computeMuteAllToggle(current: AudioSettings): AudioSettings {
  if (!isAllAudioMuted(current)) {
    return {
      musicEnabled: false,
      soundsEnabled: false,
      preMuteMusicEnabled: current.musicEnabled,
      preMuteSoundsEnabled: current.soundsEnabled,
    };
  }

  const hadPreMuteMusic = Boolean(current.preMuteMusicEnabled);
  const hadPreMuteSounds = Boolean(current.preMuteSoundsEnabled);
  if (hadPreMuteMusic || hadPreMuteSounds) {
    return {
      musicEnabled: hadPreMuteMusic,
      soundsEnabled: hadPreMuteSounds,
      preMuteMusicEnabled: current.preMuteMusicEnabled,
      preMuteSoundsEnabled: current.preMuteSoundsEnabled,
    };
  }

  return {
    musicEnabled: true,
    soundsEnabled: true,
    preMuteMusicEnabled: true,
    preMuteSoundsEnabled: true,
  };
}

export function getStoredAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings> | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_AUDIO_SETTINGS };
    return {
      musicEnabled:
        typeof parsed.musicEnabled === 'boolean'
          ? parsed.musicEnabled
          : DEFAULT_AUDIO_SETTINGS.musicEnabled,
      soundsEnabled:
        typeof parsed.soundsEnabled === 'boolean'
          ? parsed.soundsEnabled
          : DEFAULT_AUDIO_SETTINGS.soundsEnabled,
      ...(typeof parsed.preMuteMusicEnabled === 'boolean'
        ? { preMuteMusicEnabled: parsed.preMuteMusicEnabled }
        : {}),
      ...(typeof parsed.preMuteSoundsEnabled === 'boolean'
        ? { preMuteSoundsEnabled: parsed.preMuteSoundsEnabled }
        : {}),
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function setStoredAudioSettings(settings: AudioSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicIntervalId: number | null = null;
let musicMasterGain: GainNode | null = null;
let musicStepIndex = 0;
let musicRunning = false;
let musicShouldPlay = false;
let gestureHooksAttached = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx
      .resume()
      .then(() => {
        if (musicShouldPlay && musicRunning && audioCtx?.state === 'running') {
          ensureMusicMasterGain(audioCtx);
        }
      })
      .catch(() => {});
  }
  return audioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const len = Math.floor(ctx.sampleRate * 0.08);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  noiseBuffer = buf;
  return buf;
}

function ensureGestureUnlockHooks(): void {
  if (typeof window === 'undefined' || gestureHooksAttached) return;
  gestureHooksAttached = true;

  const unlock = () => {
    if (!musicShouldPlay) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (musicShouldPlay && ctx.state === 'running') {
            ensureMusicMasterGain(ctx);
            triggerCozyFarmBeat();
          }
        })
        .catch(() => {});
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function playEggCollectSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [587.33, 739.99, 880, 1174.66, 1479.98];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i >= notes.length - 2 ? 'triangle' : 'sine';
    const start = now + i * 0.036;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.11, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.17);
  });
}

export function playCoinChimeSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  [1174.66, 1479.98, 1760.0, 2349.32].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i === 3 ? 'triangle' : 'sine';
    const start = now + i * 0.038;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.095, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.19);
  });
}

export function playTabTapSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(720, now);
  osc.frequency.exponentialRampToValueAtTime(1180, now + 0.028);
  gain.gain.setValueAtTime(0.075, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

export function playClaimSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i >= 3 ? 'triangle' : 'sine';
    const start = now + i * 0.04;
    const duration = i === notes.length - 1 ? 0.28 : 0.14;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.105, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.01);
  });
}

export function playPurchaseSuccessSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const start = now + i * 0.036;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.095, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.23);
  });
}

export function playChickenCluckSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  [0, 0.082].forEach((offset, idx) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const start = now + offset;
    const baseFreq = idx === 0 ? 540 : 660;
    osc.frequency.setValueAtTime(baseFreq, start);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.48, start + 0.026);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, start + 0.072);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1120, start);
    filter.Q.setValueAtTime(2.0, start);

    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.125, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.076);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.082);
  });
}

export function playSoftTapSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(760, now + 0.036);
  gain.gain.setValueAtTime(0.055, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.052);
}

export function playGoldenEggSound(enabled: boolean): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  const shimmer = [659.25, 880, 1046.5, 1318.51, 1567.98, 2093.0];
  shimmer.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const start = now + i * 0.038;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.105, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

// ============================================================================
// ENERGETIC UPBEAT ARCADE FARM BGM SYNTHESIZER (32-step C -> G -> Am -> F Loop)
// Driving octave bassline + syncopated chord stabs + bright lead + kick/snare/hat
// ============================================================================
const FARM_MELODY_STEPS: ReadonlyArray<number | null> = [
  // Bar 1 (C major upbeat hook)
  523.25, 659.25, 783.99, null, 1046.5, 783.99, 659.25, 783.99,
  // Bar 2 (G major bounce)
  783.99, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33,
  // Bar 3 (A minor energy lift)
  523.25, 659.25, 880.0, null, 1046.5, 880.0, 783.99, 659.25,
  // Bar 4 (F -> G triumphant turnaround)
  698.46, 880.0, 783.99, 659.25, 587.33, 659.25, 783.99, 987.77,
];

const BAR_CHORDS: ReadonlyArray<{ bass: number; chord: readonly [number, number, number] }> = [
  { bass: 130.81, chord: [261.63, 329.63, 392.0] },  // C major
  { bass: 98.0, chord: [196.0, 246.94, 293.66] },    // G major
  { bass: 110.0, chord: [220.0, 261.63, 329.63] },   // A minor
  { bass: 87.31, chord: [174.61, 220.0, 261.63] },   // F major
];

function ensureMusicMasterGain(ctx: AudioContext): GainNode {
  if (!musicMasterGain) {
    musicMasterGain = ctx.createGain();
    musicMasterGain.gain.setValueAtTime(0.36, ctx.currentTime);
    musicMasterGain.connect(ctx.destination);
  } else {
    musicMasterGain.gain.setTargetAtTime(0.36, ctx.currentTime, 0.08);
  }
  return musicMasterGain;
}

function triggerCozyFarmBeat(): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== 'running') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  const master = ensureMusicMasterGain(ctx);
  const now = ctx.currentTime;
  const step = musicStepIndex % FARM_MELODY_STEPS.length;
  const barIdx = Math.floor(step / 8) % BAR_CHORDS.length;
  const stepInBar = step % 8;
  musicStepIndex = (musicStepIndex + 1) % FARM_MELODY_STEPS.length;

  const melodyFreq = FARM_MELODY_STEPS[step];
  if (melodyFreq) {
    const leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass';
    leadFilter.frequency.setValueAtTime(4200, now);
    leadFilter.frequency.exponentialRampToValueAtTime(1600, now + 0.16);

    const leadOsc = ctx.createOscillator();
    const leadHarm = ctx.createOscillator();
    const leadGain = ctx.createGain();
    leadOsc.type = 'triangle';
    leadOsc.frequency.setValueAtTime(melodyFreq, now);
    leadHarm.type = 'square';
    leadHarm.frequency.setValueAtTime(melodyFreq, now);

    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.18, now);

    const accent = stepInBar === 0 || stepInBar === 4 ? 0.17 : 0.13;
    leadGain.gain.setValueAtTime(0.0005, now);
    leadGain.gain.linearRampToValueAtTime(accent, now + 0.01);
    leadGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.21);

    leadOsc.connect(leadFilter);
    leadHarm.connect(harmGain);
    harmGain.connect(leadFilter);
    leadFilter.connect(leadGain);
    leadGain.connect(master);

    leadOsc.start(now);
    leadHarm.start(now);
    leadOsc.stop(now + 0.23);
    leadHarm.stop(now + 0.23);

    if (stepInBar === 0 || stepInBar === 4) {
      const sparkOsc = ctx.createOscillator();
      const sparkGain = ctx.createGain();
      sparkOsc.type = 'sine';
      sparkOsc.frequency.setValueAtTime(melodyFreq * 2, now);
      sparkGain.gain.setValueAtTime(0.0005, now);
      sparkGain.gain.linearRampToValueAtTime(0.042, now + 0.012);
      sparkGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
      sparkOsc.connect(sparkGain);
      sparkGain.connect(master);
      sparkOsc.start(now);
      sparkOsc.stop(now + 0.2);
    }
  }

  const bar = BAR_CHORDS[barIdx];

  // Energetic driving octave bassline on every 8th-note groove pulse
  {
    const isDownbeat = stepInBar % 2 === 0;
    const bassFreq = isDownbeat ? bar.bass : bar.bass * 2;
    const bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(isDownbeat ? 680 : 900, now);

    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = isDownbeat ? 'triangle' : 'sawtooth';
    bassOsc.frequency.setValueAtTime(bassFreq, now);
    bassGain.gain.setValueAtTime(0.0005, now);
    bassGain.gain.linearRampToValueAtTime(isDownbeat ? 0.16 : 0.075, now + 0.012);
    bassGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.17);
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(master);
    bassOsc.start(now);
    bassOsc.stop(now + 0.185);
  }

  // Upbeat syncopated arcade chord stabs
  if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6) {
    const stabFilter = ctx.createBiquadFilter();
    stabFilter.type = 'lowpass';
    stabFilter.frequency.setValueAtTime(2400, now);
    stabFilter.frequency.exponentialRampToValueAtTime(850, now + 0.15);
    stabFilter.connect(master);

    bar.chord.forEach((chordFreq) => {
      const stabOsc = ctx.createOscillator();
      const stabGain = ctx.createGain();
      stabOsc.type = 'triangle';
      stabOsc.frequency.setValueAtTime(chordFreq, now);
      stabGain.gain.setValueAtTime(0.0005, now);
      stabGain.gain.linearRampToValueAtTime(0.048, now + 0.012);
      stabGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
      stabOsc.connect(stabGain);
      stabGain.connect(stabFilter);
      stabOsc.start(now);
      stabOsc.stop(now + 0.175);
    });
  }

  // Punchy kick drum on beats 1 & 3 (+ syncopation in bar 2 & 4)
  if (stepInBar === 0 || stepInBar === 4 || (barIdx % 2 === 1 && stepInBar === 5)) {
    const kickOsc = ctx.createOscillator();
    const kickGain = ctx.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(145, now);
    kickOsc.frequency.exponentialRampToValueAtTime(44, now + 0.085);
    kickGain.gain.setValueAtTime(0.22, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    kickOsc.connect(kickGain);
    kickGain.connect(master);
    kickOsc.start(now);
    kickOsc.stop(now + 0.12);
  }

  // Snappy clap/snare on beats 2 & 4
  if (stepInBar === 2 || stepInBar === 6) {
    const snrSrc = ctx.createBufferSource();
    snrSrc.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2100, now);
    bp.Q.setValueAtTime(1.1, now);
    const snrGain = ctx.createGain();
    snrGain.gain.setValueAtTime(0.075, now);
    snrGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
    snrSrc.connect(bp);
    bp.connect(snrGain);
    snrGain.connect(master);
    snrSrc.start(now);
    snrSrc.stop(now + 0.08);
  }

  // Crisp hi-hat tick on off-beats
  if (stepInBar % 2 === 1) {
    const hatSrc = ctx.createBufferSource();
    hatSrc.buffer = getNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(6200, now);
    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(0.036, now);
    hatGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.04);
    hatSrc.connect(hp);
    hp.connect(hatGain);
    hatGain.connect(master);
    hatSrc.start(now);
    hatSrc.stop(now + 0.045);
  }
}

export function stopAmbientMusic(): void {
  musicShouldPlay = false;
  musicRunning = false;
  if (typeof window !== 'undefined' && musicIntervalId !== null) {
    window.clearInterval(musicIntervalId);
    musicIntervalId = null;
  }
  if (musicMasterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      musicMasterGain.gain.setTargetAtTime(0.0001, now, 0.05);
    } catch {
      // Ignore WebAudio teardown errors
    }
  }
  if (
    audioCtx &&
    audioCtx.state === 'running' &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  ) {
    audioCtx.suspend().catch(() => {});
  }
}

export function syncAmbientMusic(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (!enabled || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
    stopAmbientMusic();
    return;
  }

  musicShouldPlay = true;
  ensureGestureUnlockHooks();

  const ctx = getCtx();
  if (!ctx) return;

  if (ctx.state === 'running') {
    ensureMusicMasterGain(ctx);
  }

  if (musicRunning && musicIntervalId !== null) return;
  musicRunning = true;
  if (ctx.state === 'running') {
    triggerCozyFarmBeat();
  }
  musicIntervalId = window.setInterval(() => {
    if (musicRunning && musicShouldPlay) {
      triggerCozyFarmBeat();
    }
  }, 190);
}
