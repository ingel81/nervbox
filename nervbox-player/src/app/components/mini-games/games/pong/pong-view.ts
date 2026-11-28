import { PongEvent, PongField, PongState } from './pong.types';

/**
 * LAN-Pong Darstellung: Phosphor-Bildschirm auf dem Canvas.
 * - Feldkoordinaten wie der Server (landscape W x H, Tore links/rechts).
 * - Ansicht: Desktop = eigener Schlaeger links, Handy hochkant = eigener Schlaeger unten (Feld gedreht).
 * - Netcode: Server-Zustaende (30 Hz) werden mit ~55 ms Verzoegerung interpoliert, der eigene Schlaeger
 *   wird lokal vorhergesagt (sofort an der Eingabe), der Ball bei Luecken kurz extrapoliert.
 */

interface Snap {
  t: number;
  s: PongState;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  r: number;
}

const OWN = '#4be585';
const OTHER = '#6fcbff';
const LAMP = '#fff4d8';
const INTERP_DELAY = 55;

export class PongView {
  readonly f: PongField;
  portrait = false;
  /** eigener Slot, -1 Zuschauer */
  slot = -1;
  /** lokal vorhergesagte Position des eigenen Schlaegers */
  localY: number | null = null;
  names: [string, string] = ['', ''];

  private readonly ctx: CanvasRenderingContext2D;
  private snaps: Snap[] = [];
  private offset: number | null = null;
  private trail: { x: number; y: number }[] = [];
  private particles: Particle[] = [];
  private shake = 0;
  private flash = 0;
  private flashSide = -1;
  private hitPulse = [0, 0];
  private lastFrame = 0;
  private scanlines: CanvasPattern | null = null;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    field: PongField,
  ) {
    this.f = field;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  /** Logische Canvas-Groesse der aktuellen Ausrichtung */
  get cw(): number {
    return this.portrait ? this.f.h : this.f.w;
  }
  get ch(): number {
    return this.portrait ? this.f.w : this.f.h;
  }

  resize(): void {
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1)) * 1.25;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    const p = document.createElement('canvas');
    p.width = 4;
    p.height = 4;
    const pc = p.getContext('2d')!;
    pc.fillStyle = 'rgba(0,0,0,0.28)';
    pc.fillRect(0, 0, 4, 2);
    this.scanlines = this.ctx.createPattern(p, 'repeat');
  }

  get latest(): PongState | null {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].s : null;
  }

  pushState(s: PongState, recvAt: number): void {
    const sample = recvAt - s.t;
    // Uhrversatz: kleinster beobachteter Wert (= geringste Laufzeit), driftet langsam nach oben nach
    if (this.offset === null || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.01;
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.t <= last.t) {
      if (s.t === last.t) last.s = s;
      return;
    }
    this.snaps.push({ t: s.t, s });
    if (this.snaps.length > 40) this.snaps.splice(0, this.snaps.length - 40);
  }

  reset(): void {
    this.snaps = [];
    this.offset = null;
    this.trail = [];
    this.particles = [];
  }

  onEvent(e: PongEvent): void {
    const x = e.x ?? this.f.w / 2;
    const y = e.y ?? this.f.h / 2;
    switch (e.k) {
      case 'hit': {
        const side = e.side ?? 0;
        this.hitPulse[side] = 1;
        const c = this.colorOf(side);
        const n = 10 + Math.min(14, e.n ?? 0);
        for (let i = 0; i < n; i++)
          this.spark(x, y, side === 0 ? 1 : -1, c, 260 + (e.sp ?? 0) * 0.3);
        this.shake = Math.max(this.shake, Math.min(5, (e.sp ?? 400) / 260));
        break;
      }
      case 'wall':
        for (let i = 0; i < 6; i++) this.spark(x, y, 0, LAMP, 180);
        break;
      case 'goal': {
        const side = e.side ?? 0;
        this.shake = 16;
        this.flash = 1;
        this.flashSide = side;
        const gx = side === 0 ? this.f.w : 0;
        const c = this.colorOf(side);
        for (let i = 0; i < 46; i++) this.spark(gx, y, side === 0 ? -1 : 1, i % 3 ? c : LAMP, 520);
        this.trail = [];
        break;
      }
      case 'over':
        this.shake = 10;
        break;
    }
  }

  private colorOf(side: number): string {
    if (this.slot < 0) return side === 0 ? OWN : OTHER;
    return side === this.slot ? OWN : OTHER;
  }

  private spark(x: number, y: number, dirX: number, c: string, speed: number): void {
    const a = dirX === 0 ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * 2.2;
    const sp = speed * (0.3 + Math.random() * 0.8);
    const vx = dirX === 0 ? Math.cos(a) * sp : Math.cos(a) * sp * dirX;
    const max = 0.35 + Math.random() * 0.45;
    this.particles.push({
      x,
      y,
      vx,
      vy: Math.sin(a) * sp,
      life: max,
      max,
      c,
      r: 1.2 + Math.random() * 2.2,
    });
  }

  /** Zeiger (Client-Koordinaten) -> Feld-y des eigenen Schlaegers */
  pointerToFieldY(clientX: number, clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * this.cw;
    const sy = ((clientY - r.top) / r.height) * this.ch;
    if (!this.portrait) return sy;
    return this.slot === 1 ? this.f.h - sx : sx;
  }

  /** Tastatur: Bildschirmrichtung (-1 hoch/links, +1 runter/rechts) -> Feld-dy-Vorzeichen */
  keyToFieldDir(screenDir: number): number {
    return this.portrait && this.slot === 1 ? -screenDir : screenDir;
  }

  /** Feld -> Bildschirm Matrix (setTransform-Reihenfolge a,b,c,d,e,f) */
  private matrix(): [number, number, number, number, number, number] {
    const { w, h } = this.f;
    const mirror = this.slot === 1;
    if (!this.portrait) return mirror ? [-1, 0, 0, 1, w, 0] : [1, 0, 0, 1, 0, 0];
    return mirror ? [0, 1, -1, 0, h, 0] : [0, -1, 1, 0, 0, w];
  }

  /** Interpolierter Zustand zur Renderzeit */
  private sample(now: number): {
    bx: number;
    by: number;
    p: [number, number];
    s: PongState;
  } | null {
    if (!this.snaps.length || this.offset === null) return null;
    const rt = now - this.offset - INTERP_DELAY;
    const snaps = this.snaps;
    let i = snaps.length - 1;
    while (i > 0 && snaps[i - 1].t > rt) i--;
    const b = snaps[i];
    const a = i > 0 ? snaps[i - 1] : null;
    if (a && rt >= a.t && rt <= b.t) {
      const k = (rt - a.t) / Math.max(1, b.t - a.t);
      const jump = Math.abs(b.s.b[0] - a.s.b[0]) > 220 || a.s.ph !== b.s.ph;
      const lerp = (u: number, v: number): number => u + (v - u) * k;
      return {
        bx: jump ? (k < 0.5 ? a.s.b[0] : b.s.b[0]) : lerp(a.s.b[0], b.s.b[0]),
        by: jump ? (k < 0.5 ? a.s.b[1] : b.s.b[1]) : lerp(a.s.b[1], b.s.b[1]),
        p: [lerp(a.s.p[0], b.s.p[0]), lerp(a.s.p[1], b.s.p[1])],
        s: k < 0.5 ? a.s : b.s,
      };
    }
    // juengster Zustand: Ball max. 120 ms extrapolieren
    const last = snaps[snaps.length - 1];
    const ex = last.s.ph === 'play' ? Math.min(0.12, Math.max(0, (rt - last.t) / 1000)) : 0;
    let by = last.s.b[1] + last.s.b[3] * ex;
    const r = this.f.ballR;
    if (by < r) by = 2 * r - by;
    if (by > this.f.h - r) by = 2 * (this.f.h - r) - by;
    return {
      bx: last.s.b[0] + last.s.b[2] * ex,
      by,
      p: [last.s.p[0], last.s.p[1]],
      s: last.s,
    };
  }

  frame(now: number): void {
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;
    const ctx = this.ctx;
    const { w, h, padX, padW, padH, ballR } = this.f;
    const cw = this.cw;
    const ch = this.ch;
    const st = this.sample(now);

    // Effekte altern lassen
    this.shake *= Math.pow(0.0009, dt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.hitPulse = this.hitPulse.map((v) => Math.max(0, v - dt * 5));
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.08, dt);
      p.vy *= Math.pow(0.08, dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    const shx = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const shy = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;

    // --- Hintergrund (Bildschirmraum)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = ctx.createRadialGradient(
      cw / 2,
      ch / 2,
      40,
      cw / 2,
      ch / 2,
      Math.max(cw, ch) * 0.75,
    );
    bg.addColorStop(0, '#0c1410');
    bg.addColorStop(1, '#040605');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, shx * this.dpr, shy * this.dpr);

    // Torblitz
    if (this.flash > 0 && st) {
      const conceded = 1 - this.flashSide;
      const mineConceded = this.slot >= 0 && conceded === this.slot;
      ctx.fillStyle = mineConceded
        ? `rgba(255,90,79,${0.22 * this.flash})`
        : `rgba(75,229,133,${0.18 * this.flash})`;
      ctx.fillRect(-20, -20, cw + 40, ch + 40);
    }

    // Spielstand gross im Hintergrund (Bildschirmraum, LCD-Ziffern)
    if (st) this.drawScores(st.s.s, cw, ch);

    // --- Feldraum
    const m = this.matrix();
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);

    // Mittellinie
    ctx.strokeStyle = 'rgba(255,244,216,0.16)';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 8);
    ctx.lineTo(w / 2, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);
    // Banden
    ctx.strokeStyle = 'rgba(255,244,216,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(w, 1);
    ctx.moveTo(0, h - 1);
    ctx.lineTo(w, h - 1);
    ctx.stroke();

    if (st) {
      // Schlaeger
      for (let side = 0; side < 2; side++) {
        let py = st.p[side];
        if (side === this.slot && this.localY !== null) py = this.localY;
        const x = side === 0 ? padX : w - padX;
        const c = this.colorOf(side);
        const pulse = this.hitPulse[side];
        const connected = st.s.c[side];
        ctx.save();
        ctx.globalAlpha = connected ? 1 : 0.3 + 0.2 * Math.sin(now / 120);
        ctx.shadowColor = c;
        ctx.shadowBlur = 16 + pulse * 22;
        ctx.fillStyle = c;
        const grow = pulse * 4;
        this.roundRect(
          x - padW / 2 - grow / 2,
          py - padH / 2 - grow,
          padW + grow,
          padH + grow * 2,
          4,
        );
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        this.roundRect(x - 2, py - padH / 2 + 6, 4, padH - 12, 2);
        ctx.fill();
        ctx.restore();
      }

      // Ballspur
      const playing = st.s.ph === 'play';
      if (playing) {
        this.trail.push({ x: st.bx, y: st.by });
        if (this.trail.length > 16) this.trail.shift();
      } else if (this.trail.length) {
        this.trail.shift();
      }
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const k = (i + 1) / this.trail.length;
        ctx.fillStyle = `rgba(255,226,176,${0.32 * k * k})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, ballR * (0.35 + 0.6 * k), 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball (im Countdown blinkend in der Mitte)
      const showBall = playing || st.s.ph === 'paused' || Math.floor(now / 160) % 2 === 0;
      if (showBall && st.s.ph !== 'over') {
        ctx.save();
        ctx.shadowColor = LAMP;
        ctx.shadowBlur = 24;
        ctx.fillStyle = LAMP;
        ctx.beginPath();
        ctx.arc(st.bx, st.by, ballR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(st.bx - 2, st.by - 2, ballR * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Partikel (additiv)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    // Countdown (Bildschirmraum)
    if (st && st.s.ph === 'countdown' && st.s.pt > 0.05) {
      const n = Math.ceil(st.s.pt);
      const frac = st.s.pt - Math.floor(st.s.pt);
      ctx.save();
      ctx.font = `${Math.round(Math.min(cw, ch) * 0.3)}px VT323, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.35 + 0.6 * frac;
      ctx.shadowColor = LAMP;
      ctx.shadowBlur = 30;
      ctx.fillStyle = LAMP;
      const yy = this.portrait ? ch * 0.5 : ch * 0.5;
      ctx.fillText(String(n), cw / 2 + (this.portrait ? 0 : 0), yy);
      ctx.restore();
    }

    // Scanlines + Vignette
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.scanlines) {
      ctx.fillStyle = this.scanlines;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(
      cw / 2,
      ch / 2,
      Math.min(cw, ch) * 0.45,
      cw / 2,
      ch / 2,
      Math.max(cw, ch) * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);
  }

  private drawScores(s: [number, number], cw: number, ch: number): void {
    const ctx = this.ctx;
    // Position je Slot im Bildschirm: Desktop links/rechts, Hochkant unten/oben
    const me = this.slot === 1 ? 1 : 0;
    const other = 1 - me;
    const size = Math.round(Math.min(cw, ch) * 0.34);
    ctx.save();
    ctx.font = `${size}px VT323, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const spots: [number, number, number][] = this.portrait
      ? [
          [me, cw / 2, ch * 0.75],
          [other, cw / 2, ch * 0.25],
        ]
      : [
          [me, cw * 0.27, ch * 0.5],
          [other, cw * 0.73, ch * 0.5],
        ];
    for (const [side, x, y] of spots) {
      const c = this.colorOf(side);
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.11;
      ctx.fillText(String(s[side]), x, y);
      // Name klein
      ctx.globalAlpha = 0.4;
      ctx.font = `600 14px "Barlow Condensed", sans-serif`;
      const ny = this.portrait ? (side === me ? ch - 14 : 16) : 18;
      ctx.fillText((this.names[side] || '').toUpperCase(), x, ny);
      ctx.font = `${size}px VT323, monospace`;
    }
    ctx.restore();
    // Rand-Leuchten in Spielerfarben
    ctx.save();
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5;
    if (this.portrait) {
      ctx.strokeStyle = this.colorOf(me);
      ctx.beginPath();
      ctx.moveTo(0, ch - 1.5);
      ctx.lineTo(cw, ch - 1.5);
      ctx.stroke();
      ctx.strokeStyle = this.colorOf(other);
      ctx.beginPath();
      ctx.moveTo(0, 1.5);
      ctx.lineTo(cw, 1.5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = this.colorOf(me);
      ctx.beginPath();
      ctx.moveTo(1.5, 0);
      ctx.lineTo(1.5, ch);
      ctx.stroke();
      ctx.strokeStyle = this.colorOf(other);
      ctx.beginPath();
      ctx.moveTo(cw - 1.5, 0);
      ctx.lineTo(cw - 1.5, ch);
      ctx.stroke();
    }
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
