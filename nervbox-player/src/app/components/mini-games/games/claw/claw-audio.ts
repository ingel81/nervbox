/**
 * Hotdog-Greifer: alle Geraeusche per WebAudio-Synthese (keine Assets).
 * Kontext wird erst bei der ersten Nutzeraktion erzeugt (Autoplay-Regeln).
 */
export class ClawAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private simmerGain: GainNode | null = null;
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private lastBlup = 0;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  /** Muss aus einem Nutzer-Event heraus aufgerufen werden. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // 2 s weisses Rauschen als Quelle fuer Platschen, Brodeln, Klacken
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Leises Koecheln: Rauschen durch Tiefpass, langsam schwankend
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.simmerGain = ctx.createGain();
    this.simmerGain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(this.simmerGain.gain);
    src.connect(lp).connect(this.simmerGain).connect(this.master);
    src.start();
    lfo.start();

    // Motorbrummen des Greifers (Lautstaerke folgt der Geschwindigkeit)
    this.motorOsc = ctx.createOscillator();
    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.value = 62;
    const mlp = ctx.createBiquadFilter();
    mlp.type = 'lowpass';
    mlp.frequency.value = 520;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motorOsc.connect(mlp).connect(this.motorGain).connect(this.master);
    this.motorOsc.start();
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  destroy(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  /** speed 0..1 */
  setMotor(speed: number): void {
    if (!this.ctx || !this.motorGain || !this.motorOsc) return;
    const t = this.ctx.currentTime;
    this.motorGain.gain.setTargetAtTime(Math.min(1, speed) * 0.045, t, 0.06);
    this.motorOsc.frequency.setTargetAtTime(55 + speed * 45, t, 0.08);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, peak, Math.min(0.01, dur / 4), dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(
    freq: number,
    q: number,
    dur: number,
    peak: number,
    type: BiquadFilterType = 'bandpass',
    delay = 0,
  ): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  /** Blubb einer platzenden Blase (gedrosselt) */
  blup(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastBlup < 0.09) return;
    this.lastBlup = now;
    const f = 220 + Math.random() * 260;
    this.tone('sine', f, f * 2.6, 0.07, 0.05);
  }

  splash(size = 1): void {
    this.burst(1400, 0.7, 0.18 + size * 0.22, 0.25 * Math.min(1.4, size));
    this.burst(500, 0.9, 0.12 + size * 0.15, 0.18 * size);
    this.tone('sine', 140, 55, 0.18, 0.18 * size);
  }

  clank(): void {
    this.tone('square', 980, 760, 0.07, 0.06);
    this.tone('square', 1460, 1200, 0.05, 0.04, 0.012);
    this.burst(4200, 1.2, 0.05, 0.12, 'highpass');
  }

  coin(): void {
    this.tone('square', 1320, 1320, 0.06, 0.05);
    this.tone('square', 1760, 1760, 0.12, 0.05, 0.07);
  }

  slip(): void {
    this.tone('sine', 820, 180, 0.22, 0.12);
  }

  tick(urgent: boolean): void {
    this.tone('square', urgent ? 1800 : 1200, urgent ? 1800 : 1200, 0.035, 0.035);
  }

  empty(): void {
    this.tone('square', 150, 110, 0.32, 0.06);
  }

  thud(): void {
    this.tone('sine', 180, 60, 0.15, 0.2);
    this.burst(900, 1, 0.08, 0.08);
  }

  win(big: boolean): void {
    const notes = big ? [523, 659, 784, 1047, 1319, 1568, 2093] : [659, 784, 988, 1319];
    notes.forEach((n, i) => this.tone('triangle', n, n, 0.22, 0.12, i * 0.085));
    if (big) {
      for (let i = 0; i < 10; i++) {
        const f = 2000 + Math.random() * 2500;
        this.tone('sine', f, f, 0.08, 0.03, 0.6 + i * 0.07);
      }
    }
  }

  /** Trauriges Posaunen-"wah wah wah waaah" fuer die Gurke */
  sadTrombone(): void {
    if (!this.ctx || !this.master) return;
    const notes = [392, 370, 349, 330];
    notes.forEach((f, i) => {
      const t = this.ctx!.currentTime + i * 0.32;
      const dur = i === 3 ? 0.9 : 0.28;
      const o = this.ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      if (i === 3) {
        const vib = this.ctx!.createOscillator();
        vib.frequency.value = 6;
        const vg = this.ctx!.createGain();
        vg.gain.value = 7;
        vib.connect(vg).connect(o.frequency);
        vib.start(t);
        vib.stop(t + dur);
        o.frequency.linearRampToValueAtTime(f * 0.94, t + dur);
      }
      const lp = this.ctx!.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
      g.gain.setValueAtTime(0.09, t + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(this.master!);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }
}
