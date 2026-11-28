import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { ApiService } from './api.service';
import {
  FX,
  LiveParams,
  SoundEffectId,
  effectRate,
  effectTailSec,
  liveFilterHz,
  renderReverbImpulse,
} from '../audio/sound-fx';

/** Pegel wie vom Backend-Mixer („mixLevel“): Summe + je Stimme, linear 0…1 */
export interface MixLevels {
  peak: number;
  rms: number;
  /** Pegelreduktion des Summen-Limiters in dB (≥ 0) */
  limiterDb: number;
  voices: { id: number; peak: number }[];
}

export type VoiceEndReason = 'end' | 'stopped' | 'error';

interface EngineVoice {
  id: number;
  hash: string;
  effect: SoundEffectId | null;
  baseRate: number;
  src: AudioBufferSourceNode | null;
  liveLp: BiquadFilterNode;
  liveHp: BiquadFilterNode;
  trem: GainNode;
  tremDepth: GainNode | null;
  lfo: OscillatorNode | null;
  out: GainNode;
  meter: AnalyserNode;
  nodes: AudioNode[];
  live: LiveParams | null;
  done: boolean;
  tailTimer: ReturnType<typeof setTimeout> | null;
}

const BUFFER_CACHE = 40;

/**
 * Browser-Wiedergabe (PlaybackMode=Browser) mit derselben Signalkette wie der Pi-Mixer:
 * AudioBufferSource (playbackRate = Effekt × Live) → Telefon-Bandpass → Live-Tiefpass → Live-Hochpass
 * → Tremolo → Echo/Hall → Lautheits-Gain → Summen-Limiter (DynamicsCompressor) → Analyser → Ausgang.
 * Parameter: core/audio/sound-fx.ts (= Backend FxParams).
 */
/** Web Audio inkl. altem Safari-Präfix; fehlt beides, bleibt die Wiedergabe stumm. */
const AUDIO_CTOR: typeof AudioContext | undefined =
  typeof window === 'undefined'
    ? undefined
    : (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

@Injectable({ providedIn: 'root' })
export class AudioEngineService {
  private readonly api = inject(ApiService);

  private ctx: AudioContext | null = null;
  private master: DynamicsCompressorNode | null = null;
  private masterMeter: AnalyserNode | null = null;
  private reverbIr: AudioBuffer | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly reversed = new Map<string, Promise<AudioBuffer>>();
  private readonly voices = new Map<number, EngineVoice>();
  private readonly pendingLive = new Map<number, LiveParams>();
  private readonly pendingStop = new Set<number>();
  private readonly endedListeners: ((id: number, reason: VoiceEndReason) => void)[] = [];
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private localId = 0;

  /** Pegel ~14×/s, nur solange etwas spielt (danach einmal 0) */
  readonly levels = signal<MixLevels | null>(null);

  constructor() {
    if (isDevMode()) {
      // Test-Hook (Playwright): Graph-Parameter laufender Stimmen auslesen
      (window as unknown as Record<string, unknown>)['__nbAudio'] = {
        inspect: () => this.inspect(),
        engine: this,
      };
    }
  }

  /** Im Klick-Handler aufrufen: AudioContext anlegen/fortsetzen (Autoplay-Regeln). */
  unlock(): void {
    if (!AUDIO_CTOR) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /** Neue lokale Stimmen-ID, falls das Backend keine liefert (alte API) */
  nextLocalId(): number {
    return --this.localId;
  }

  onEnded(cb: (id: number, reason: VoiceEndReason) => void): void {
    this.endedListeners.push(cb);
  }

  has(id: number): boolean {
    return this.voices.has(id);
  }

  /** Datei schon laden/decodieren, während die Play-Anfrage läuft */
  prefetch(hash: string, reverse = false): void {
    if (!AUDIO_CTOR) return;
    void (reverse ? this.reversedBuffer(hash) : this.buffer(hash)).catch(() => undefined);
  }

  async play(opts: {
    voiceId: number;
    hash: string;
    gain: number;
    effect: SoundEffectId | null;
  }): Promise<void> {
    if (!AUDIO_CTOR) {
      // Browser ohne Web Audio: still bleiben statt den Klick abzubrechen
      this.emitEnded(opts.voiceId, 'error');
      return;
    }
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    let buffer: AudioBuffer;
    try {
      buffer = await (opts.effect === 'reverse'
        ? this.reversedBuffer(opts.hash)
        : this.buffer(opts.hash));
    } catch (err) {
      console.warn('Browser audio playback failed:', err);
      this.emitEnded(opts.voiceId, 'error');
      return;
    }
    if (this.pendingStop.delete(opts.voiceId) || this.voices.has(opts.voiceId)) return;
    this.start(ctx, buffer, opts);
  }

  stop(id: number): void {
    const v = this.voices.get(id);
    if (!v) {
      // noch beim Decodieren: gar nicht erst starten
      this.pendingStop.add(id);
      setTimeout(() => this.pendingStop.delete(id), 10_000);
      return;
    }
    this.finish(v, 'stopped');
  }

  stopAll(): void {
    for (const v of [...this.voices.values()]) this.finish(v, 'stopped');
  }

  /** Live-Steuerung (gleitend, 30 ms) */
  setLive(id: number, p: LiveParams): void {
    const v = this.voices.get(id);
    if (!v) {
      this.pendingLive.set(id, p);
      setTimeout(() => this.pendingLive.delete(id), 10_000);
      return;
    }
    this.applyLive(v, p);
  }

  // ------------------------------------------------------------------ intern

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AUDIO_CTOR!({ latencyHint: 'interactive' });
    // Summen-Limiter: viele Stimmen werden leiser statt zu übersteuern (Backend: Limiter, -1 dBFS)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -3;
    comp.knee.value = 3;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    comp.connect(meter);
    meter.connect(ctx.destination);
    this.ctx = ctx;
    this.master = comp;
    this.masterMeter = meter;
    return ctx;
  }

  private buffer(hash: string): Promise<AudioBuffer> {
    const hit = this.buffers.get(hash);
    if (hit) {
      // LRU: ans Ende
      this.buffers.delete(hash);
      this.buffers.set(hash, hit);
      return hit;
    }
    const ctx = this.ensureContext();
    const p = fetch(this.api.getFullUrl(`/sound/${hash}/file`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    p.catch(() => this.buffers.delete(hash));
    this.buffers.set(hash, p);
    while (this.buffers.size > BUFFER_CACHE) {
      const first = this.buffers.keys().next().value;
      if (first === undefined) break;
      this.buffers.delete(first);
      this.reversed.delete(first);
    }
    return p;
  }

  /** Rückwärts = komplett decodieren, dann umgedreht abspielen (wie im Backend) */
  private reversedBuffer(hash: string): Promise<AudioBuffer> {
    const hit = this.reversed.get(hash);
    if (hit) return hit;
    const p = this.buffer(hash).then((src) => {
      const ctx = this.ensureContext();
      const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
      for (let c = 0; c < src.numberOfChannels; c++) {
        const data = src.getChannelData(c).slice();
        data.reverse();
        out.copyToChannel(data, c);
      }
      return out;
    });
    p.catch(() => this.reversed.delete(hash));
    this.reversed.set(hash, p);
    return p;
  }

  private reverbImpulse(ctx: AudioContext): AudioBuffer {
    if (this.reverbIr && this.reverbIr.sampleRate === ctx.sampleRate) return this.reverbIr;
    const { left, right } = renderReverbImpulse(ctx.sampleRate);
    const ir = ctx.createBuffer(2, left.length, ctx.sampleRate);
    ir.copyToChannel(left, 0);
    ir.copyToChannel(right, 1);
    this.reverbIr = ir;
    return ir;
  }

  private start(
    ctx: AudioContext,
    buffer: AudioBuffer,
    opts: { voiceId: number; hash: string; gain: number; effect: SoundEffectId | null },
  ): void {
    const nodes: AudioNode[] = [];
    const add = <T extends AudioNode>(n: T): T => {
      nodes.push(n);
      return n;
    };
    const mono = (): GainNode =>
      add(
        new GainNode(ctx, {
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        }),
      );

    const fx = opts.effect;
    const baseRate = effectRate(fx);
    const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: baseRate });
    let head: AudioNode = src;

    if (fx === 'telephone') {
      const down = mono();
      const hp = add(
        new BiquadFilterNode(ctx, {
          type: 'highpass',
          frequency: FX.phoneLowHz,
          Q: FX.butterworthQdB,
        }),
      );
      const lp = add(
        new BiquadFilterNode(ctx, {
          type: 'lowpass',
          frequency: FX.phoneHighHz,
          Q: FX.butterworthQdB,
        }),
      );
      const g = add(new GainNode(ctx, { gain: FX.phoneGain }));
      head.connect(down);
      down.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      head = g;
    }

    // Live-Filter laufen immer mit (offen: TP 20 kHz / HP 20 Hz) – kein Umbau des Graphen beim Ziehen
    const liveLp = add(
      new BiquadFilterNode(ctx, {
        type: 'lowpass',
        frequency: FX.liveLowpassMaxHz,
        Q: FX.butterworthQdB,
      }),
    );
    const liveHp = add(
      new BiquadFilterNode(ctx, {
        type: 'highpass',
        frequency: FX.liveHighpassMinHz,
        Q: FX.butterworthQdB,
      }),
    );
    const trem = add(new GainNode(ctx, { gain: 1 }));
    head.connect(liveLp);
    liveLp.connect(liveHp);
    liveHp.connect(trem);
    head = trem;

    const out = add(new GainNode(ctx, { gain: opts.gain }));
    if (fx === 'echo') {
      const delay = add(new DelayNode(ctx, { delayTime: FX.echoDelaySec, maxDelayTime: 1 }));
      const fb = add(new GainNode(ctx, { gain: FX.echoFeedback }));
      const wet = add(new GainNode(ctx, { gain: FX.echoWet }));
      head.connect(out); // trocken
      head.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(out);
    } else if (fx === 'reverb') {
      const dry = add(new GainNode(ctx, { gain: FX.reverbDry }));
      const send = mono();
      const conv = add(new ConvolverNode(ctx, { disableNormalization: true }));
      conv.buffer = this.reverbImpulse(ctx);
      const wet = add(new GainNode(ctx, { gain: FX.reverbWet }));
      head.connect(dry);
      dry.connect(out);
      head.connect(send);
      send.connect(conv);
      conv.connect(wet);
      wet.connect(out);
    } else {
      head.connect(out);
    }

    const meter = add(new AnalyserNode(ctx, { fftSize: 512 }));
    out.connect(meter);
    out.connect(this.master!);

    const v: EngineVoice = {
      id: opts.voiceId,
      hash: opts.hash,
      effect: fx,
      baseRate,
      src,
      liveLp,
      liveHp,
      trem,
      tremDepth: null,
      lfo: null,
      out,
      meter,
      nodes,
      live: null,
      done: false,
      tailTimer: null,
    };
    src.onended = () => {
      if (v.done) return;
      const tail = effectTailSec(fx);
      if (tail > 0) v.tailTimer = setTimeout(() => this.finish(v, 'end'), tail * 1000);
      else this.finish(v, 'end');
    };
    this.voices.set(v.id, v);
    const pending = this.pendingLive.get(v.id);
    if (pending) {
      this.pendingLive.delete(v.id);
      this.applyLive(v, pending, true);
    }
    src.start();
    this.startMeter();
  }

  private applyLive(v: EngineVoice, p: LiveParams, immediate = false): void {
    if (!this.ctx || !v.src) return;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.001 : FX.smoothingSec;
    const rate = Math.max(FX.liveRateMin, Math.min(FX.liveRateMax, p.rate));
    const { lowpassHz, highpassHz } = liveFilterHz(p.filter);
    v.src.playbackRate.setTargetAtTime(v.baseRate * rate, t, tc);
    v.liveLp.frequency.setTargetAtTime(Math.min(lowpassHz, this.ctx.sampleRate * 0.49), t, tc);
    v.liveHp.frequency.setTargetAtTime(highpassHz, t, tc);
    const d = Math.max(0, Math.min(1, p.wobble));
    if (d > 0 && !v.lfo) {
      // Tremolo: Gain = 1 − d/2 + d/2 · sin(2π · 6 Hz · t)   (Backend identisch)
      v.lfo = new OscillatorNode(this.ctx, { type: 'sine', frequency: FX.tremoloHz });
      v.tremDepth = new GainNode(this.ctx, { gain: 0 });
      v.lfo.connect(v.tremDepth);
      v.tremDepth.connect(v.trem.gain);
      v.lfo.start();
    }
    if (v.lfo && v.tremDepth) {
      v.tremDepth.gain.setTargetAtTime(d / 2, t, tc);
      v.trem.gain.setTargetAtTime(1 - d / 2, t, tc);
    }
    v.live = { rate, filter: p.filter, wobble: d };
  }

  private finish(v: EngineVoice, reason: VoiceEndReason): void {
    if (v.done) return;
    v.done = true;
    if (v.tailTimer) clearTimeout(v.tailTimer);
    this.voices.delete(v.id);
    const ctx = this.ctx;
    if (ctx && reason === 'stopped') {
      // 10-ms-Ausblenden wie im Backend – kein Knacks
      const t = ctx.currentTime;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(v.out.gain.value, t);
      v.out.gain.linearRampToValueAtTime(0, t + 0.012);
      try {
        v.src?.stop(t + 0.02);
      } catch {
        // schon gestoppt
      }
    }
    setTimeout(() => {
      try {
        v.src?.disconnect();
        v.lfo?.stop();
        v.lfo?.disconnect();
        v.tremDepth?.disconnect();
        for (const n of v.nodes) n.disconnect();
      } catch {
        // egal
      }
    }, 60);
    this.emitEnded(v.id, reason);
  }

  private emitEnded(id: number, reason: VoiceEndReason): void {
    for (const cb of this.endedListeners) {
      try {
        cb(id, reason);
      } catch (err) {
        console.warn(err);
      }
    }
  }

  private startMeter(): void {
    if (this.meterTimer) return;
    this.meterTimer = setInterval(() => this.measure(), 70);
  }

  private measure(): void {
    const meter = this.masterMeter;
    if (!meter || !this.master) return;
    if (!this.meterBuf || this.meterBuf.length !== meter.fftSize) {
      this.meterBuf = new Float32Array(meter.fftSize);
    }
    const buf = this.meterBuf;
    meter.getFloatTimeDomainData(buf);
    let peak = 0;
    let sq = 0;
    for (const x of buf) {
      const a = Math.abs(x);
      if (a > peak) peak = a;
      sq += x * x;
    }
    const voices: { id: number; peak: number }[] = [];
    const vb = new Float32Array(512);
    for (const v of this.voices.values()) {
      v.meter.getFloatTimeDomainData(vb);
      let p = 0;
      for (const x of vb) {
        const a = Math.abs(x);
        if (a > p) p = a;
      }
      voices.push({ id: v.id, peak: Math.round(p * 1000) / 1000 });
    }
    const idle = this.voices.size === 0;
    this.levels.set({
      peak: idle ? 0 : Math.round(peak * 1000) / 1000,
      rms: idle ? 0 : Math.round(Math.sqrt(sq / buf.length) * 1000) / 1000,
      limiterDb: idle ? 0 : Math.round(-this.master.reduction * 10) / 10,
      voices,
    });
    if (idle && this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  /** Für Tests: aktuelle Graph-Parameter je Stimme */
  inspect(): Record<string, unknown>[] {
    return [...this.voices.values()].map((v) => ({
      id: v.id,
      hash: v.hash,
      effect: v.effect,
      baseRate: v.baseRate,
      playbackRate: v.src?.playbackRate.value,
      lowpassHz: Math.round(v.liveLp.frequency.value),
      highpassHz: Math.round(v.liveHp.frequency.value),
      tremBase: v.trem.gain.value,
      tremDepth: v.tremDepth?.gain.value ?? 0,
      live: v.live,
      gain: v.out.gain.value,
      nodeTypes: v.nodes.map((n) => n.constructor.name),
      ctxState: this.ctx?.state,
      sampleRate: this.ctx?.sampleRate,
    }));
  }
}
