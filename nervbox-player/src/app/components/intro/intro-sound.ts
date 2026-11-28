/**
 * Synthetischer Aufprall-Sound (WebAudio, keine Datei):
 * gesättigter Sub + Tiefoktave + Punch + Tischresonanz + Crack + Nachsacken + großer Hall,
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
    // Bus-Kompressor mit langsamem Attack (Transiente kommt durch, Körper wird
    // verdichtet), danach ein harter Limiter gegen Übersteuern.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 6;
    glue.ratio.value = 3;
    glue.attack.value = 0.012;
    glue.release.value = 0.35;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(glue).connect(limit).connect(ctx.destination);

    // Raumhall: generierte Impulsantwort (großer, dunkler Raum), Rücklauf
    // tiefpassgefiltert, damit der Nachhall dröhnt statt zischt.
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4.5);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2200;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(conv).connect(dark).connect(this.master);

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
    bp.frequency.setValueAtTime(180, at);
    bp.frequency.exponentialRampToValueAtTime(1100, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.03);
    src.connect(bp).connect(g);
    this.out(g);
  }

  /** Der fette Aufprall. */
  impact(inSec = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.running || !this.noise) return;
    const at = ctx.currentTime + Math.max(0, inSec);

    // Sättigung: erzeugt Obertöne des Subs, damit der Bass auch auf
    // Laptop-Lautsprechern (die unter ~80 Hz nichts können) wuchtig wirkt.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      curve[i] = Math.tanh(3.2 * x) / Math.tanh(3.2);
    }
    shaper.curve = curve;
    shaper.oversample = '4x';
    const tame = ctx.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 1100;
    shaper.connect(tame);
    this.out(tame, false);

    // 1) Haupt-Sub: tiefer, langer Pitch-Drop, gesättigt
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, at);
    sub.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    sub.frequency.exponentialRampToValueAtTime(30, at + 0.6);
    const subG = this.env(ctx, at, 1.0, 0.002, 1.1);
    sub.connect(subG).connect(shaper);
    sub.start(at);
    sub.stop(at + 1.3);

    // 2) Tiefe Oktave darunter, sauber (Druck im Bauch bei guten Boxen)
    const sub2 = ctx.createOscillator();
    sub2.type = 'sine';
    sub2.frequency.setValueAtTime(58, at);
    sub2.frequency.exponentialRampToValueAtTime(27, at + 0.5);
    const sub2G = this.env(ctx, at, 0.55, 0.006, 1.4);
    sub2.connect(sub2G);
    this.out(sub2G, false);
    sub2.start(at);
    sub2.stop(at + 1.6);

    // 3) Punch: Dreieck mit schnellem Drop – der „Schlag“ in den Mitten
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, at);
    body.frequency.exponentialRampToValueAtTime(62, at + 0.09);
    const bodyG = this.env(ctx, at, 0.6, 0.0015, 0.24);
    body.connect(bodyG);
    this.out(bodyG);
    body.start(at);
    body.stop(at + 0.32);

    // 4) Tischplatte: resonantes Rauschen um 130 Hz (Holz dröhnt mit)
    const table = this.noiseSrc(ctx, at, 0.6);
    const tbp = ctx.createBiquadFilter();
    tbp.type = 'bandpass';
    tbp.frequency.setValueAtTime(150, at);
    tbp.frequency.exponentialRampToValueAtTime(105, at + 0.4);
    tbp.Q.value = 2.2;
    const tableG = this.env(ctx, at, 1.3, 0.002, 0.45);
    table.connect(tbp).connect(tableG);
    this.out(tableG);

    // 5) Crack: dunkler als vorher (schwer statt plastikhaft)
    const crack = this.noiseSrc(ctx, at, 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 0.8;
    const crackG = this.env(ctx, at, 0.6, 0.0008, 0.075);
    crack.connect(bp).connect(crackG);
    this.out(crackG);

    // 6) Kontakt-Transiente: kurzer heller Anschlag für Definition
    const clack = this.noiseSrc(ctx, at, 0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const clackG = this.env(ctx, at, 0.28, 0.0006, 0.018);
    clack.connect(hp).connect(clackG);
    this.out(clackG);

    // 7) Rumpeln: langes Tiefpass-Rauschen, klingt mit dem Hall aus
    const rumble = this.noiseSrc(ctx, at, 1.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260, at);
    lp.frequency.exponentialRampToValueAtTime(90, at + 0.9);
    const rumbleG = this.env(ctx, at, 0.8, 0.005, 0.9);
    rumble.connect(lp).connect(rumbleG);
    this.out(rumbleG);

    // 8) Nachsacken: das schwere Gerät setzt nach (zweiter dumpfer Schlag)
    //    plus leises Klappern loser Teile
    const settle = ctx.createOscillator();
    settle.type = 'sine';
    settle.frequency.setValueAtTime(78, at + 0.1);
    settle.frequency.exponentialRampToValueAtTime(38, at + 0.32);
    const settleG = this.env(ctx, at + 0.1, 0.45, 0.003, 0.3);
    settle.connect(settleG).connect(shaper);
    settle.start(at + 0.1);
    settle.stop(at + 0.45);
    for (const [dt, a] of [
      [0.12, 0.12],
      [0.2, 0.06],
      [0.27, 0.03],
    ] as const) {
      const c = this.noiseSrc(ctx, at + dt, 0.04);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1150;
      f.Q.value = 1.4;
      const g = this.env(ctx, at + dt, a, 0.001, 0.03);
      c.connect(f).connect(g);
      this.out(g);
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
