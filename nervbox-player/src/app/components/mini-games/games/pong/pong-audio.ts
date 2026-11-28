/** WebAudio-Synth fuer LAN-Pong: Blips, Wand, Tor, Countdown, Sieg/Niederlage. Keine Dateien. */
export class PongAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Nach einer Nutzergeste aufrufen (Autoplay-Sperre) */
  unlock(): void {
    this.ensure();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 1,
    slideTo?: number,
    delay = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.6, cutoff = 1800): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /** Schlaegertreffer: Tonhoehe steigt mit der Ballgeschwindigkeit */
  hit(speed: number, own: boolean): void {
    const f = 330 + Math.min(1, (speed - 380) / 800) * 520;
    this.tone(own ? f : f * 0.84, 0.07, 'square', 0.7);
  }

  wall(): void {
    this.tone(196, 0.05, 'triangle', 0.8);
  }

  goal(forMe: boolean): void {
    if (forMe) {
      this.tone(523, 0.09, 'square', 0.6);
      this.tone(784, 0.16, 'square', 0.6, undefined, 0.08);
    } else {
      this.tone(330, 0.45, 'sawtooth', 0.5, 70);
      this.noise(0.3, 0.35, 900);
    }
  }

  tick(last: boolean): void {
    this.tone(last ? 880 : 440, last ? 0.18 : 0.08, 'square', 0.45);
  }

  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.5, undefined, i * 0.11));
  }

  lose(): void {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.6, undefined, i * 0.14));
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
