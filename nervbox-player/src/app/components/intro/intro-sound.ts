/**
 * Synthetischer Aufprall-Sound (WebAudio, keine Datei):
 * Sub-Thump + Körper + Rausch-Crack + Plastik-Klack + Nachklappern + Raumhall,
 * dazu ein leises Anflug-Rauschen. Läuft nur im Browser; scheitert die
 * Autoplay-Freigabe, bleibt es still.
 */
export class IntroSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor() {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      void this.ctx.resume().catch(() => undefined);
      this.build(this.ctx);
    } catch {
      this.ctx = null;
    }
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Versucht nach einer Nutzergeste erneut zu entsperren. */
  unlock(): void {
    if (this.ctx && this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  private build(ctx: AudioContext): void {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp).connect(ctx.destination);

    // Raumhall: generierte Impulsantwort (kleiner Raum, Holztisch)
    const len = Math.floor(ctx.sampleRate * 0.9);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;
    this.wet.connect(conv).connect(this.master);

    const nlen = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  private out(node: AudioNode, wet = true): void {
    if (!this.master) return;
    node.connect(this.master);
    if (wet && this.wet) node.connect(this.wet);
  }

  private env(
    ctx: AudioContext,
    at: number,
    peak: number,
    attack: number,
    decay: number,
  ): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return g;
  }

  private noiseSrc(ctx: AudioContext, at: number, dur: number): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur);
    return src;
  }

  /** Anflug-Rauschen, endet zum Aufprall (inSec ab jetzt). */
  whoosh(inSec: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.noise) return;
    const at = ctx.currentTime + Math.max(0, inSec);
    const src = this.noiseSrc(ctx, at, dur + 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(260, at);
    bp.frequency.exponentialRampToValueAtTime(1500, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12, at + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.03);
    src.connect(bp).connect(g);
    this.out(g);
  }

  /** Der fette Aufprall. */
  impact(inSec = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.noise) return;
    const at = ctx.currentTime + Math.max(0, inSec);

    // 1) Sub-Thump: Sinus mit Pitch-Drop, leicht angezerrt
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(130, at);
    sub.frequency.exponentialRampToValueAtTime(36, at + 0.22);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(2.2 * x);
    }
    shaper.curve = curve;
    const subG = this.env(ctx, at, 1.0, 0.003, 0.55);
    sub.connect(shaper).connect(subG);
    this.out(subG, false);
    sub.start(at);
    sub.stop(at + 0.7);

    // 2) Gehäusekörper: Dreieck, kurz
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(240, at);
    body.frequency.exponentialRampToValueAtTime(85, at + 0.12);
    const bodyG = this.env(ctx, at, 0.45, 0.002, 0.16);
    body.connect(bodyG);
    this.out(bodyG);
    body.start(at);
    body.stop(at + 0.25);

    // 3) Crack: Bandpass-Rauschen
    const crack = this.noiseSrc(ctx, at, 0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 950;
    bp.Q.value = 0.7;
    const crackG = this.env(ctx, at, 0.75, 0.001, 0.09);
    crack.connect(bp).connect(crackG);
    this.out(crackG);

    // 4) Plastik-Klack: Hochpass-Rauschen + Ping
    const clack = this.noiseSrc(ctx, at, 0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const clackG = this.env(ctx, at, 0.5, 0.0008, 0.03);
    clack.connect(hp).connect(clackG);
    this.out(clackG);
    const ping = ctx.createOscillator();
    ping.type = 'sine';
    ping.frequency.value = 1750;
    const pingG = this.env(ctx, at, 0.12, 0.001, 0.05);
    ping.connect(pingG);
    this.out(pingG);
    ping.start(at);
    ping.stop(at + 0.08);

    // 5) Rumpeln/Staub: Tiefpass-Rauschen
    const rumble = this.noiseSrc(ctx, at, 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const rumbleG = this.env(ctx, at, 0.5, 0.004, 0.38);
    rumble.connect(lp).connect(rumbleG);
    this.out(rumbleG);

    // 6) Nachklappern (Bounce) – zwei leise Klicks
    for (const [dt, a] of [
      [0.085, 0.22],
      [0.15, 0.09],
    ] as const) {
      const c = this.noiseSrc(ctx, at + dt, 0.04);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 1.2;
      const g = this.env(ctx, at + dt, a, 0.001, 0.035);
      c.connect(f).connect(g);
      this.out(g);
      const t = ctx.createOscillator();
      t.frequency.setValueAtTime(110, at + dt);
      t.frequency.exponentialRampToValueAtTime(55, at + dt + 0.08);
      const tg = this.env(ctx, at + dt, a * 1.4, 0.002, 0.09);
      t.connect(tg);
      this.out(tg, false);
      t.start(at + dt);
      t.stop(at + dt + 0.12);
    }
  }

  /** Leises "Klack" der Lampe. */
  lampClick(inSec = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.noise) return;
    const at = ctx.currentTime + Math.max(0, inSec);
    const c = this.noiseSrc(ctx, at, 0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const g = this.env(ctx, at, 0.16, 0.0008, 0.02);
    c.connect(f).connect(g);
    this.out(g);
  }

  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) setTimeout(() => void ctx.close().catch(() => undefined), 2500);
  }
}
