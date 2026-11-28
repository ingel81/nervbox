/**
 * Geraeusche des Roulettekessels, rein synthetisch per WebAudio (keine Dateien):
 * - Rollen der Kugel im Kessel (gefiltertes Rauschen, Lautstaerke/Tonhoehe nach Tempo)
 * - Klacken beim Springen ueber Rauten und Fächer
 * - Chip-Klick beim Setzen, Gewinn-Arpeggio
 * Der AudioContext entsteht erst bei der ersten Nutzeraktion (Autoplay-Regeln).
 */
export class RouletteAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rollSrc: AudioBufferSourceNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  muted = false;

  /** Bei einer Nutzeraktion aufrufen (Klick), damit der Kontext laufen darf. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Rollgeraeusch starten (laeuft, bis stopRoll()) */
  startRoll(): void {
    if (!this.ctx || !this.master || !this.noise || this.rollSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.4;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(hp).connect(g).connect(this.master);
    src.start();
    this.rollSrc = src;
    this.rollGain = g;
    this.rollFilter = bp;
  }

  /**
   * Rollen nachfuehren.
   * @param speed 0..1 relative Kugelgeschwindigkeit
   * @param rough 0..1 Rauheit (beim Ueberqueren des Konus / der Fächer staerker)
   */
  updateRoll(speed: number, rough: number): void {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const t = this.ctx.currentTime;
    const flutter = 0.75 + Math.random() * 0.5 * (0.4 + rough);
    const vol = this.muted ? 0 : Math.min(0.5, (0.05 + speed * 0.32) * flutter * (1 + rough * 0.6));
    this.rollGain.gain.setTargetAtTime(vol, t, 0.03);
    this.rollFilter.frequency.setTargetAtTime(1400 + speed * 2600 + rough * 600, t, 0.05);
  }

  stopRoll(): void {
    if (!this.ctx || !this.rollSrc || !this.rollGain) return;
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(0, t, 0.06);
    const src = this.rollSrc;
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* schon gestoppt */
      }
    }, 400);
    this.rollSrc = null;
    this.rollGain = null;
    this.rollFilter = null;
  }

  /** Kurzes, hartes Klacken (Kugel trifft Raute/Fach). strength 0..1 */
  clack(strength = 0.7): void {
    if (!this.ctx || !this.master || !this.noise || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200 + Math.random() * 1800;
    hp.Q.value = 3;
    const g = this.ctx.createGain();
    const peak = 0.25 + strength * 0.75;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045 + strength * 0.03);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.12);

    // hoelzerner Koerper
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1500 + Math.random() * 700, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.12 * strength + 0.04, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.08);
  }

  /** Chip auf den Tisch */
  chip(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2200 + i * 900 + Math.random() * 200;
      const g = this.ctx.createGain();
      const s = t + i * 0.035;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.08, s + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
      o.connect(g).connect(this.master);
      o.start(s);
      o.stop(s + 0.05);
    }
  }

  /** Gewinn-Arpeggio; big = laenger und hoeher */
  win(big: boolean): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      const s = t + i * 0.085;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.18, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      o.connect(g).connect(this.master!);
      o.start(s);
      o.stop(s + 0.55);
    });
  }

  dispose(): void {
    this.stopRoll();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) setTimeout(() => void ctx.close().catch(() => undefined), 500);
  }
}
