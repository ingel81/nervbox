/**
 * Synthetische Rubbellos-Sounds (WebAudio, keine Dateien):
 * Rubbeln = gefiltertes Rauschen, Lautstaerke/Tonhoehe folgen der Rubbelgeschwindigkeit;
 * dazu Feld-Tick, Gewinn-Fanfare mit Muenzklimpern, Verlierer-"Wah-wah", Stempel-Rums.
 */
export class ScratchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private scratchGain: GainNode | null = null;
  private band: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  /** Muss aus einer Nutzergeste heraus aufgerufen werden (Autoplay-Regeln). */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // 2 s Rauschen mit leichtem "Korn" (Knackser) fuer Folienstruktur
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      let v = Math.random() * 2 - 1;
      if (Math.random() < 0.002) v *= 3;
      d[i] = v * 0.6;
    }
    this.noise = buf;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = 3200;
    this.band.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    this.scratchGain = ctx.createGain();
    this.scratchGain.gain.value = 0;
    src.connect(this.band).connect(hp).connect(this.scratchGain).connect(this.master);
    src.start();
  }

  /** speed: logische Pixel pro ms (0 = Stillstand) */
  scratch(speed: number): void {
    if (!this.ctx || !this.scratchGain || !this.band) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 1.6);
    this.scratchGain.gain.setTargetAtTime(0.08 + v * 0.55, t, 0.025);
    this.band.frequency.setTargetAtTime(2200 + v * 3200 + Math.random() * 600, t, 0.03);
  }

  scratchStop(): void {
    if (!this.ctx || !this.scratchGain) return;
    this.scratchGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
  }

  private tone(
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    endFreq?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  /** kurzer Tick, wenn ein Feld frei ist */
  tick(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1400 + Math.random() * 300, t, 0.06, 'triangle', 0.12);
  }

  coin(delay = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const f = 2400 + Math.random() * 900;
    this.tone(f, t, 0.12, 'square', 0.04);
    this.tone(f * 1.5, t + 0.05, 0.25, 'triangle', 0.06);
  }

  win(big: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = big ? [523, 659, 784, 1047, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.11, 0.22, 'square', 0.07);
      this.tone(f / 2, t + i * 0.11, 0.22, 'triangle', 0.08);
    });
    const n = big ? 16 : 7;
    for (let i = 0; i < n; i++) this.coin(0.3 + i * 0.07 + Math.random() * 0.05);
  }

  lose(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [392, 370, 349].forEach((f, i) => this.tone(f, t + i * 0.28, 0.3, 'sawtooth', 0.05, f * 0.97));
    this.tone(330, t + 0.84, 0.7, 'sawtooth', 0.05, 250);
  }

  stamp(): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    this.tone(110, t, 0.25, 'sine', 0.5, 45);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.2);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
