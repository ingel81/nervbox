/**
 * Effekte + Live-Steuerung – gemeinsame Parameter mit dem Backend-Mixer
 * (NervboxDeamon/Services/Audio/VoiceDsp.cs, Klasse FxParams). Immer BEIDE Dateien ändern:
 * Browser- und Pi-Wiedergabe müssen gleich klingen.
 */

export type SoundEffectId = 'pitch-up' | 'pitch-down' | 'reverse' | 'echo' | 'reverb' | 'telephone';

export interface SoundEffectDef {
  id: SoundEffectId;
  label: string;
  hint: string;
  icon: string;
}

/** Reihenfolge = Reihenfolge im Pad-Menü „Mit Effekt abspielen“ */
export const SOUND_EFFECTS: readonly SoundEffectDef[] = [
  { id: 'pitch-up', label: 'Pitch hoch', hint: 'Mickey', icon: 'arrow_upward' },
  { id: 'pitch-down', label: 'Pitch runter', hint: 'Monster', icon: 'arrow_downward' },
  { id: 'reverse', label: 'Rückwärts', hint: 'von hinten', icon: 'fast_rewind' },
  { id: 'echo', label: 'Echo', hint: 'Echo … echo', icon: 'graphic_eq' },
  { id: 'reverb', label: 'Hall', hint: 'Kathedrale', icon: 'blur_on' },
  { id: 'telephone', label: 'Telefon', hint: 'Hörer', icon: 'call' },
];

export const FX = {
  rate: 48000,
  pitchUpRate: 1.5,
  pitchDownRate: 0.7,

  echoDelaySec: 0.32,
  echoFeedback: 0.45,
  echoWet: 0.55,
  echoTailSec: 3.0,

  combDelays: [1215, 1293, 1390, 1476],
  combFeedback: 0.84,
  combDamp: 0.2,
  allpassDelaysL: [605, 480],
  allpassDelaysR: [630, 505],
  allpassFeedback: 0.5,
  reverbInputGain: 0.18,
  reverbWet: 0.4,
  reverbDry: 0.9,
  reverbTailSec: 2.5,

  phoneLowHz: 300,
  phoneHighHz: 3400,
  phoneGain: 1.4,

  liveRateMin: 0.5,
  liveRateMax: 2,
  liveLowpassMinHz: 300,
  liveLowpassMaxHz: 20000,
  liveHighpassMinHz: 20,
  liveHighpassMaxHz: 3000,
  tremoloHz: 6,
  /** Zeitkonstante aller Live-Gleitvorgänge (Backend: One-Pole je 10-ms-Block, hier setTargetAtTime) */
  smoothingSec: 0.03,
  /**
   * Butterworth. Achtung: Web Audio interpretiert Q bei lowpass/highpass in dB
   * (α = sin ω / (2·10^(Q/20))) → 20·log10(0,7071) = −3,01 dB entspricht Q = 0,7071 im Backend.
   */
  butterworthQdB: -3.0103,
} as const;

export function effectRate(fx: SoundEffectId | null | undefined): number {
  return fx === 'pitch-up' ? FX.pitchUpRate : fx === 'pitch-down' ? FX.pitchDownRate : 1;
}

export function effectTailSec(fx: SoundEffectId | null | undefined): number {
  return fx === 'echo' ? FX.echoTailSec : fx === 'reverb' ? FX.reverbTailSec : 0;
}

export function isSoundEffect(v: unknown): v is SoundEffectId {
  return SOUND_EFFECTS.some((e) => e.id === v);
}

/** Live-Parameter einer Stimme */
export interface LiveParams {
  /** 0,5–2 (Pitch + Tempo) */
  rate: number;
  /** −1 dunkel (Tiefpass) … 0 offen … +1 dünn (Hochpass) */
  filter: number;
  /** 0–1 Tremolo-Tiefe */
  wobble: number;
}

export const NEUTRAL_LIVE: LiveParams = { rate: 1, filter: 0, wobble: 0 };

/** Filterposition → Grenzfrequenzen der zwei immer laufenden Biquads (Tiefpass, dann Hochpass). */
export function liveFilterHz(f: number): { lowpassHz: number; highpassHz: number } {
  const x = Math.max(-1, Math.min(1, f));
  if (x < 0) {
    return {
      lowpassHz: FX.liveLowpassMaxHz * Math.pow(FX.liveLowpassMinHz / FX.liveLowpassMaxHz, -x),
      highpassHz: FX.liveHighpassMinHz,
    };
  }
  return {
    lowpassHz: FX.liveLowpassMaxHz,
    highpassHz: FX.liveHighpassMinHz * Math.pow(FX.liveHighpassMaxHz / FX.liveHighpassMinHz, x),
  };
}

/**
 * Impulsantwort des Backend-Halls (ReverbFx: Mono-Send → 4 gedämpfte Kammfilter → 2 Allpässe
 * je Seite), gerendert mit exakt demselben Algorithmus → ConvolverNode klingt wie der Pi.
 * Verzögerungen werden auf die Abtastrate des AudioContext skaliert.
 */
export function renderReverbImpulse(sampleRate: number): {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
} {
  const scale = sampleRate / FX.rate;
  const n = Math.round(FX.reverbTailSec * sampleRate);
  const combs = FX.combDelays.map((d) => new Float32Array(Math.max(1, Math.round(d * scale))));
  const combIdx = combs.map(() => 0);
  const combStore = combs.map(() => 0);
  const apL = FX.allpassDelaysL.map((d) => new Float32Array(Math.max(1, Math.round(d * scale))));
  const apR = FX.allpassDelaysR.map((d) => new Float32Array(Math.max(1, Math.round(d * scale))));
  const apIdxL = apL.map(() => 0);
  const apIdxR = apR.map(() => 0);
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  const allpass = (bufs: Float32Array[], idx: number[], input: number): number => {
    let x = input;
    for (let a = 0; a < bufs.length; a++) {
      const b = bufs[a];
      const i = idx[a];
      const bo = b[i];
      const y = -x + bo;
      b[i] = x + bo * FX.allpassFeedback;
      idx[a] = i + 1 === b.length ? 0 : i + 1;
      x = y;
    }
    return x;
  };

  for (let t = 0; t < n; t++) {
    const m = t === 0 ? FX.reverbInputGain : 0;
    let sum = 0;
    for (let c = 0; c < combs.length; c++) {
      const b = combs[c];
      const i = combIdx[c];
      const o = b[i];
      const st = o * (1 - FX.combDamp) + combStore[c] * FX.combDamp;
      combStore[c] = st;
      b[i] = m + st * FX.combFeedback;
      combIdx[c] = i + 1 === b.length ? 0 : i + 1;
      sum += o;
    }
    left[t] = allpass(apL, apIdxL, sum);
    right[t] = allpass(apR, apIdxR, sum);
  }
  return { left, right };
}

/**
 * Zeiger-Geste → Live-Parameter. dx/dy = Abstand zum Druckpunkt in px.
 * Rechts = schneller/höher (±160 px = Faktor 2), hoch = dünn (Hochpass), runter = dunkel (Tiefpass).
 */
export const LIVE_RANGE_PX = 160;

export function liveFromDrag(dx: number, dy: number, wobble: number): LiveParams {
  const rate = Math.pow(2, Math.max(-1, Math.min(1, dx / LIVE_RANGE_PX)));
  const filter = Math.max(-1, Math.min(1, -dy / LIVE_RANGE_PX));
  return {
    rate: Math.max(FX.liveRateMin, Math.min(FX.liveRateMax, rate)),
    filter: Math.abs(filter) < 0.04 ? 0 : filter,
    wobble: Math.max(0, Math.min(1, wobble)),
  };
}
