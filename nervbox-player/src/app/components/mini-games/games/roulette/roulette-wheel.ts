import { RouletteAudio } from './roulette-audio';
import { WHEEL_ORDER, colorOf } from './roulette.types';

/**
 * Roulettekessel auf Canvas 2D (Draufsicht), Nachtschicht-Look:
 * Holzrand, Kugellaufbahn, Rautenkonus (statisch) und der drehende Teil mit
 * LCD-Soundring (jedes Fach traegt einen Nervbox-Sound), Zahlenring, Faechern und Drehkreuz.
 *
 * Animation: Die Zielzahl kommt vom Server. Die Kugelbahn wird relativ zum Kessel geplant
 * (Winkel phi = Kugel - Kessel), mit einer Abbremskurve, deren Ableitung am Ende 0 ist –
 * so liegt die Kugel exakt im Zielfach und dreht danach mit dem Kessel mit.
 * Laufbahn -> Abfallen ueber den Konus -> Springen ueber die Faecher -> Einrasten.
 *
 * Statische Ebenen werden einmal vorgerendert (Offscreen-Canvas), pro Frame nur gedreht/kombiniert.
 */

const SIZE = 720;
const C = SIZE / 2;
const SEG = (Math.PI * 2) / 37;

// Radien (Canvas-Einheiten)
const R_RIM_OUT = 356;
const R_RIM_IN = 336;
const R_TRACK_IN = 304;
const R_CONE_IN = 290;
const R_SOUND_IN = 226;
const R_NUM_IN = 192;
const R_POCKET_IN = 148;
const R_TRACK_BALL = 321;
const R_REST = 170;
const R_HIT = 238;
const BALL_R = 9.5;

const SPIN_TIME = 7.2;
const U_DROP = 0.5;
const U_HIT = 0.64;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  vr: number;
}

interface SpinPlan {
  t: number;
  phi0: number;
  delta: number;
  r0: number;
  target: number;
  jitterA: number;
  hops: number;
  hopPhase: number;
  deflected: boolean;
  lastHop: number;
  lastFret: number;
  onDone: () => void;
}

function mod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

export class RouletteWheel {
  private readonly ctx: CanvasRenderingContext2D;
  private staticLayer = document.createElement('canvas');
  private wheelLayer = document.createElement('canvas');
  private lightLayer = document.createElement('canvas');

  private labels: string[] = [];
  private wheelAngle = Math.random() * Math.PI * 2;
  private wheelSpeed = 0.32;
  private readonly idleSpeed = 0.32;
  private boostT = -1;
  private boostFrom = 0.32;

  /** Kugel: Winkel relativ zum Kessel, Radius, Hoehe (Sprung) */
  private phi = 0;
  private ballR = R_REST;
  private ballZ = 0;
  private ballVisible = true;
  private plan: SpinPlan | null = null;
  private highlight: number | null = null;
  private highlightT = 0;
  private spinGlow = 0;
  private particles: Particle[] = [];

  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audio: RouletteAudio,
  ) {
    canvas.width = SIZE;
    canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    for (const c of [this.staticLayer, this.wheelLayer, this.lightLayer]) {
      c.width = SIZE;
      c.height = SIZE;
    }
    // Kugel liegt anfangs in der Null
    this.phi = this.pocketAngle(0);
    this.renderStatic();
    this.renderWheel();
    this.renderLight();
    // Schriften (Barlow/VT323) koennen spaeter laden -> neu rendern
    void document.fonts?.ready.then(() => {
      if (!this.destroyed) this.renderWheel();
    });
    this.raf = requestAnimationFrame(this.frame);
  }

  get spinning(): boolean {
    return this.plan !== null;
  }

  /** Soundnamen je Zahl (Index = Zahl 0..36) */
  setLabels(labels: string[]): void {
    this.labels = labels;
    this.renderWheel();
  }

  /** Kugel ohne Animation in das Fach von n legen */
  placeBall(n: number): void {
    if (this.plan) return;
    this.phi = this.pocketAngle(n);
    this.ballR = R_REST;
    this.ballZ = 0;
  }

  setHighlight(n: number | null): void {
    this.highlight = n;
    this.highlightT = 0;
  }

  /** Kessel sofort anschubsen (vor der Serverantwort) */
  boost(): void {
    this.boostFrom = this.wheelSpeed;
    this.boostT = 0;
    this.spinGlow = 1;
  }

  /** Kugel einwerfen und auf der Zahl n landen lassen */
  spinTo(n: number, onDone: () => void): void {
    const idx = WHEEL_ORDER.indexOf(n);
    if (idx < 0) return;
    if (this.boostT < 0) this.boost();
    this.highlight = null;
    const target = this.pocketAngle(n);
    const revs = 7 + Math.floor(Math.random() * 2);
    // phi faellt (Kugel laeuft gegen den Kessel); Endwert == target (mod 2pi)
    const diff = mod(this.phi - target, Math.PI * 2);
    const delta = -(revs * Math.PI * 2 + diff);
    this.plan = {
      t: 0,
      phi0: this.phi,
      delta,
      r0: this.ballR,
      target: n,
      jitterA: (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.08),
      hops: 3 + Math.floor(Math.random() * 3),
      hopPhase: Math.random() * 0.15,
      deflected: false,
      lastHop: 0,
      lastFret: Math.floor(this.phi / SEG),
      onDone,
    };
    this.ballVisible = true;
    this.audio.startRoll();
  }

  celebrate(big: boolean): void {
    const colors = ['#4be585', '#96f7b9', '#6fcbff', '#abe0ff', '#ffe2b0', '#fff4d8'];
    const count = big ? 140 : 60;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (big ? 4 : 2.6) + Math.random() * (big ? 7 : 4);
      this.particles.push({
        x: C,
        y: C,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1.5,
        life: 0,
        max: 60 + Math.random() * 70,
        color: colors[i % colors.length],
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      });
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.last = 0;
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.audio.stopRoll();
  }

  // ---------------------------------------------------------------------------
  // Simulation

  /** Winkel der Fachmitte von Zahl n im Kessel-Koordinatensystem */
  private pocketAngle(n: number): number {
    return WHEEL_ORDER.indexOf(n) * SEG - Math.PI / 2;
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.paused) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    this.update(dt);
    this.draw();
  };

  private update(dt: number): void {
    // Kessel: Anschub klingt exponentiell auf Leerlauf ab
    if (this.boostT >= 0) {
      this.boostT += dt;
      const peak = 2.2;
      const rise = Math.min(1, this.boostT / 0.6);
      const decay = Math.exp(-Math.max(0, this.boostT - 0.6) / 4.2);
      const target = this.idleSpeed + (peak - this.idleSpeed) * decay;
      this.wheelSpeed = this.boostFrom + (target - this.boostFrom) * rise;
      if (this.boostT > 14 && !this.plan) {
        this.boostT = -1;
        this.wheelSpeed = this.idleSpeed;
      }
    }
    this.wheelAngle = mod(this.wheelAngle + this.wheelSpeed * dt, Math.PI * 2);
    this.highlightT += dt;
    this.spinGlow = Math.max(this.plan ? 0.65 : 0, this.spinGlow - dt * 0.8);

    const p = this.plan;
    if (p) {
      p.t += dt;
      const u = Math.min(1, p.t / SPIN_TIME);
      // Abbremskurve: F(0)=0, F(1)=1, F'(1)=0
      const F = 1 - Math.pow(1 - u, 2.35);
      const relSpeed = 2.35 * Math.pow(1 - u, 1.35); // 0..2.35
      let phi = p.phi0 + p.delta * F;
      let r: number;
      let z = 0;
      let rough = 0;

      if (u < 0.05) {
        // Einwurf: aus dem Fach auf die Laufbahn
        const k = u / 0.05;
        const e = 1 - Math.pow(1 - k, 3);
        r = p.r0 + (R_TRACK_BALL - p.r0) * e;
        z = Math.sin(k * Math.PI) * 14;
      } else if (u < U_DROP) {
        // Laufbahn, leichtes Eiern
        r = R_TRACK_BALL + Math.sin(p.t * 9) * 0.8;
      } else if (u < U_HIT) {
        // Abfallen ueber den Konus (beschleunigt nach innen)
        const k = (u - U_DROP) / (U_HIT - U_DROP);
        r = R_TRACK_BALL - (R_TRACK_BALL - R_HIT) * k * k;
        rough = 0.5;
        if (!p.deflected && k > 0.35) {
          // Raute getroffen: kleiner Hopser
          p.deflected = true;
          this.audio.clack(0.9);
        }
        if (p.deflected) z = Math.max(0, Math.sin(Math.min(1, (k - 0.35) / 0.4) * Math.PI)) * 16;
      } else {
        // Springen ueber die Faecher, dann Einrasten
        const v = (u - U_HIT) / (1 - U_HIT);
        const damp = Math.pow(1 - v, 2);
        const hopArg = Math.PI * p.hops * Math.pow(v, 0.75) + p.hopPhase;
        const hop = Math.abs(Math.sin(hopArg)) * damp;
        const hopIdx = Math.floor(hopArg / Math.PI);
        if (hopIdx > p.lastHop) {
          p.lastHop = hopIdx;
          this.audio.clack(0.3 + damp * 0.7);
        }
        const base = R_REST + (R_HIT - R_REST) * Math.pow(1 - Math.min(1, v * 1.6), 2);
        r = base + hop * 34;
        z = hop * 22;
        phi += p.jitterA * Math.sin(v * Math.PI * 3.2) * damp;
        rough = 1;
        // Fach-Kanten ticken, solange die Kugel im Faecherbereich rollt
        const fret = Math.floor(phi / SEG + 0.5);
        if (fret !== p.lastFret && z < 4) {
          p.lastFret = fret;
          this.audio.clack(0.15 + 0.2 * damp);
        }
      }

      this.phi = phi;
      this.ballR = r;
      this.ballZ = z;
      this.audio.updateRoll(Math.min(1, relSpeed / 1.6), rough);

      if (u >= 1) {
        this.phi = this.pocketAngle(p.target);
        this.ballR = R_REST;
        this.ballZ = 0;
        this.plan = null;
        this.audio.stopRoll();
        this.audio.clack(0.35);
        this.highlight = p.target;
        this.highlightT = 0;
        p.onDone();
      }
    }

    // Konfetti
    if (this.particles.length) {
      this.particles = this.particles.filter((q) => {
        q.x += q.vx;
        q.y += q.vy;
        q.vy += 0.12;
        q.vx *= 0.99;
        q.rot += q.vr;
        q.life++;
        return q.life < q.max;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Zeichnen pro Frame

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.staticLayer, 0, 0);

    // Eisblaue Lichtkante der Laufbahn (waehrend des Drehens)
    if (this.spinGlow > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.spinGlow * (0.75 + 0.25 * Math.sin(performance.now() / 160));
      ctx.strokeStyle = 'rgba(111, 203, 255, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#6fcbff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(C, C, R_RIM_IN - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Drehender Teil
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(this.wheelAngle);
    ctx.drawImage(this.wheelLayer, -C, -C);
    if (this.highlight !== null) this.drawHighlight(ctx, this.highlight);
    ctx.restore();

    ctx.drawImage(this.lightLayer, 0, 0);

    if (this.ballVisible) this.drawBall(ctx);

    if (this.particles.length) {
      for (const q of this.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - q.life / q.max);
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.shadowColor = q.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        ctx.restore();
      }
    }
  }

  private drawHighlight(ctx: CanvasRenderingContext2D, n: number): void {
    const a = this.pocketAngle(n);
    const pulse = 0.6 + 0.4 * Math.sin(this.highlightT * 5);
    const fade = Math.min(1, this.highlightT * 3);
    ctx.save();
    // Zahlenfeld + Fach gruen hinterleuchtet
    ctx.globalAlpha = fade * (0.55 + 0.35 * pulse);
    ctx.fillStyle = 'rgba(75, 229, 133, 0.55)';
    ctx.shadowColor = '#4be585';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, R_SOUND_IN, a - SEG / 2, a + SEG / 2);
    ctx.arc(0, 0, R_POCKET_IN, a + SEG / 2, a - SEG / 2, true);
    ctx.closePath();
    ctx.fill();
    // LCD-Soundfeld invertiert (dunkles Feld, helle Schrift)
    ctx.globalAlpha = fade;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#18210d';
    ctx.beginPath();
    ctx.arc(0, 0, R_CONE_IN - 3, a - SEG / 2 + 0.006, a + SEG / 2 - 0.006);
    ctx.arc(0, 0, R_SOUND_IN + 3, a + SEG / 2 - 0.006, a - SEG / 2 + 0.006, true);
    ctx.closePath();
    ctx.fill();
    this.drawSoundLabel(ctx, n, a, '#c4dc70');
    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D): void {
    const ang = this.wheelAngle + this.phi;
    const x = C + Math.cos(ang) * this.ballR;
    const y = C + Math.sin(ang) * this.ballR;
    const z = this.ballZ;
    const scale = 1 + z / 90;
    // Schatten (Lampe oben links -> Schatten nach unten rechts)
    ctx.save();
    ctx.globalAlpha = 0.55 - Math.min(0.3, z / 80);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(
      x + 3 + z * 0.45,
      y + 4 + z * 0.55,
      BALL_R * (1 + z / 70),
      BALL_R * 0.8 * (1 + z / 70),
      0,
      0,
      Math.PI * 2,
    );
    ctx.filter = 'blur(2px)';
    ctx.fill();
    ctx.restore();

    const br = BALL_R * scale;
    const g = ctx.createRadialGradient(x - br * 0.35, y - br * 0.4, br * 0.1, x, y, br);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#f1ece0');
    g.addColorStop(0.8, '#b8b2a3');
    g.addColorStop(1, '#6f6a5f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, br, 0, Math.PI * 2);
    ctx.fill();
    // Eisblauer Reflex der Lichtkante
    ctx.fillStyle = 'rgba(171, 224, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(x + br * 0.35, y + br * 0.4, br * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Vorgerenderte Ebenen

  private renderStatic(): void {
    const ctx = this.staticLayer.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Schlagschatten des Kessels auf dem Tisch
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#1e1d1a';
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_OUT, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Holzrand
    const wood = ctx.createLinearGradient(
      C - R_RIM_OUT,
      C - R_RIM_OUT,
      C + R_RIM_OUT,
      C + R_RIM_OUT,
    );
    wood.addColorStop(0, '#7a5a3a');
    wood.addColorStop(0.45, '#4a3624');
    wood.addColorStop(1, '#1f1710');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_OUT, 0, Math.PI * 2);
    ctx.fill();
    // Maserung
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#000';
    for (let i = 0; i < 26; i++) {
      ctx.lineWidth = 0.6 + (i % 3) * 0.4;
      ctx.beginPath();
      ctx.arc(C, C, R_RIM_IN + 1 + ((i * 7) % 19), i * 0.7, i * 0.7 + 2.2);
      ctx.stroke();
    }
    ctx.restore();
    // Kanten: Lichtkante oben links, Messingring innen
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 226, 176, 0.25)';
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_OUT - 1.5, Math.PI * 0.95, Math.PI * 1.75);
    ctx.stroke();
    const brass = ctx.createLinearGradient(C - R_RIM_IN, C - R_RIM_IN, C + R_RIM_IN, C + R_RIM_IN);
    brass.addColorStop(0, '#d8bf86');
    brass.addColorStop(0.5, '#8a7448');
    brass.addColorStop(1, '#4a3d24');
    ctx.strokeStyle = brass;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_IN + 1, 0, Math.PI * 2);
    ctx.stroke();

    // Kugellaufbahn (dunkler Lack, glaenzend)
    const track = ctx.createRadialGradient(C, C, R_TRACK_IN, C, C, R_RIM_IN);
    track.addColorStop(0, '#0d0c0a');
    track.addColorStop(0.55, '#24211b');
    track.addColorStop(0.85, '#3a3530');
    track.addColorStop(1, '#14120f');
    ctx.fillStyle = track;
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_IN, 0, Math.PI * 2);
    ctx.arc(C, C, R_TRACK_IN, 0, Math.PI * 2, true);
    ctx.fill();
    // Glanzlinie
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, R_TRACK_BALL + 6, Math.PI * 1.0, Math.PI * 1.6);
    ctx.stroke();

    // Konus mit Rauten
    const cone = ctx.createRadialGradient(C, C, R_CONE_IN, C, C, R_TRACK_IN);
    cone.addColorStop(0, '#0a0908');
    cone.addColorStop(1, '#2d2921');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.arc(C, C, R_TRACK_IN, 0, Math.PI * 2);
    ctx.arc(C, C, R_CONE_IN, 0, Math.PI * 2, true);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = C + Math.cos(a) * (R_CONE_IN + 7);
      const y = C + Math.sin(a) * (R_CONE_IN + 7);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (i % 2 ? 0 : Math.PI / 2));
      const dg = ctx.createLinearGradient(-9, -4, 9, 4);
      dg.addColorStop(0, '#f2e2b8');
      dg.addColorStop(0.5, '#a88d55');
      dg.addColorStop(1, '#4e3f22');
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(0, -4.5);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private renderWheel(): void {
    const ctx = this.wheelLayer.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(C, C);

    // LCD-Soundring
    const lcd = ctx.createRadialGradient(0, 0, R_SOUND_IN, 0, 0, R_CONE_IN);
    lcd.addColorStop(0, '#9fb556');
    lcd.addColorStop(0.5, '#b8cd6c');
    lcd.addColorStop(1, '#a6bc5c');
    ctx.fillStyle = '#060505';
    ctx.beginPath();
    ctx.arc(0, 0, R_CONE_IN, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lcd;
    ctx.beginPath();
    ctx.arc(0, 0, R_CONE_IN - 3, 0, Math.PI * 2);
    ctx.arc(0, 0, R_SOUND_IN + 3, 0, Math.PI * 2, true);
    ctx.fill();
    // Hintergrundbeleuchtung (Bleed) an einigen Stellen
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + 0.3;
      const bg = ctx.createRadialGradient(
        Math.cos(a) * 258,
        Math.sin(a) * 258,
        0,
        Math.cos(a) * 258,
        Math.sin(a) * 258,
        70,
      );
      bg.addColorStop(0, 'rgba(250, 255, 200, 0.35)');
      bg.addColorStop(1, 'rgba(250, 255, 200, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(-C, -C, SIZE, SIZE);
    }
    ctx.restore();

    for (let i = 0; i < 37; i++) {
      const n = WHEEL_ORDER[i];
      const a = i * SEG - Math.PI / 2;
      const a0 = a - SEG / 2;
      const a1 = a + SEG / 2;
      const col = colorOf(n);

      // LCD-Segmenttrenner
      ctx.strokeStyle = 'rgba(24, 33, 13, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * (R_SOUND_IN + 3), Math.sin(a0) * (R_SOUND_IN + 3));
      ctx.lineTo(Math.cos(a0) * (R_CONE_IN - 3), Math.sin(a0) * (R_CONE_IN - 3));
      ctx.stroke();
      this.drawSoundLabel(ctx, n, a, '#18210d');

      // Zahlenfeld
      const [c0, c1] =
        col === 'red'
          ? ['#6e1a14', '#b8382d']
          : col === 'black'
            ? ['#0d0c0a', '#2d2921']
            : ['#0c2a18', '#23824a'];
      const ng = ctx.createRadialGradient(0, 0, R_NUM_IN, 0, 0, R_SOUND_IN);
      ng.addColorStop(0, c0);
      ng.addColorStop(1, c1);
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(0, 0, R_SOUND_IN, a0, a1);
      ctx.arc(0, 0, R_NUM_IN, a1, a0, true);
      ctx.closePath();
      ctx.fill();

      // Fachboden (dunkler, mit Tiefe)
      const pg = ctx.createRadialGradient(0, 0, R_POCKET_IN, 0, 0, R_NUM_IN);
      pg.addColorStop(0, col === 'green' ? '#06170d' : col === 'red' ? '#3a0d0a' : '#050504');
      pg.addColorStop(0.6, col === 'green' ? '#0f3a20' : col === 'red' ? '#5e1611' : '#15130f');
      pg.addColorStop(1, '#050404');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(0, 0, R_NUM_IN, a0, a1);
      ctx.arc(0, 0, R_POCKET_IN, a1, a0, true);
      ctx.closePath();
      ctx.fill();

      // Zahl, aufrecht nach aussen
      ctx.save();
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#fff4d8';
      ctx.shadowColor = col === 'green' ? 'rgba(75,229,133,0.9)' : 'rgba(255,226,176,0.55)';
      ctx.shadowBlur = 6;
      ctx.font = '700 23px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 0, -(R_NUM_IN + R_SOUND_IN) / 2 - 1);
      ctx.restore();
    }

    // Faecher-Stege (Metall)
    for (let i = 0; i < 37; i++) {
      const a0 = i * SEG - Math.PI / 2 - SEG / 2;
      const cos = Math.cos(a0);
      const sin = Math.sin(a0);
      ctx.strokeStyle = '#0a0908';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(cos * (R_POCKET_IN - 2), sin * (R_POCKET_IN - 2));
      ctx.lineTo(cos * R_SOUND_IN, sin * R_SOUND_IN);
      ctx.stroke();
      const mg = ctx.createLinearGradient(
        cos * R_POCKET_IN,
        sin * R_POCKET_IN,
        cos * R_SOUND_IN,
        sin * R_SOUND_IN,
      );
      mg.addColorStop(0, '#6e685c');
      mg.addColorStop(0.5, '#e6dfcc');
      mg.addColorStop(1, '#8c8473');
      ctx.strokeStyle = mg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cos * R_POCKET_IN, sin * R_POCKET_IN);
      ctx.lineTo(cos * (R_NUM_IN + 1), sin * (R_NUM_IN + 1));
      ctx.stroke();
    }
    // Ringe zwischen Fach / Zahl / LCD
    for (const [r, w, c] of [
      [R_NUM_IN, 2.5, '#c9c2b0'],
      [R_SOUND_IN, 2, '#8c8473'],
      [R_POCKET_IN, 3, '#a89f8a'],
    ] as [number, number, string][]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Innerer Konus (Holz) + Drehkreuz
    const turret = ctx.createRadialGradient(-40, -50, 10, 0, 0, R_POCKET_IN);
    turret.addColorStop(0, '#7a5a3a');
    turret.addColorStop(0.55, '#4a3624');
    turret.addColorStop(1, '#1a130c');
    ctx.fillStyle = turret;
    ctx.beginPath();
    ctx.arc(0, 0, R_POCKET_IN - 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Zierlinien
    ctx.strokeStyle = 'rgba(216, 191, 134, 0.35)';
    ctx.lineWidth = 1.2;
    for (const r of [118, 80]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // CABD-Wortmarke klein
    ctx.save();
    ctx.fillStyle = 'rgba(255, 226, 176, 0.22)';
    ctx.font = '400 13px "Michroma", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NERVBOX', 0, 99);
    ctx.rotate(Math.PI);
    ctx.fillText('CASINO', 0, 99);
    ctx.restore();

    // Drehkreuz
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 2 + Math.PI / 4);
      const arm = ctx.createLinearGradient(0, -6, 0, 6);
      arm.addColorStop(0, '#f4eedd');
      arm.addColorStop(0.5, '#a39b88');
      arm.addColorStop(1, '#4c473d');
      ctx.fillStyle = arm;
      ctx.beginPath();
      ctx.roundRect(8, -5, 62, 10, 5);
      ctx.fill();
      const knob = ctx.createRadialGradient(70, -4, 1, 72, 0, 11);
      knob.addColorStop(0, '#ffffff');
      knob.addColorStop(0.5, '#bdb5a2');
      knob.addColorStop(1, '#4c473d');
      ctx.fillStyle = knob;
      ctx.beginPath();
      ctx.arc(72, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const hub = ctx.createRadialGradient(-6, -8, 2, 0, 0, 26);
    hub.addColorStop(0, '#ffffff');
    hub.addColorStop(0.4, '#c8c0ad');
    hub.addColorStop(1, '#3d3931');
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    // gruene LED in der Nabe
    ctx.fillStyle = '#4be585';
    ctx.shadowColor = '#4be585';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSoundLabel(ctx: CanvasRenderingContext2D, n: number, a: number, color: string): void {
    const raw = this.labels[n] ?? '';
    if (!raw) return;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.font = '400 19px "VT323", ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const maxW = R_CONE_IN - R_SOUND_IN - 14;
    let text = raw.toUpperCase();
    if (ctx.measureText(text).width > maxW) {
      while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      text += '…';
    }
    ctx.fillText(text, R_CONE_IN - 8, 1);
    ctx.restore();
  }

  private renderLight(): void {
    const ctx = this.lightLayer.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Schreibtischlampe oben links
    const lamp = ctx.createRadialGradient(C - 230, C - 260, 20, C - 120, C - 140, 520);
    lamp.addColorStop(0, 'rgba(255, 226, 176, 0.16)');
    lamp.addColorStop(0.5, 'rgba(255, 226, 176, 0.05)');
    lamp.addColorStop(1, 'rgba(255, 226, 176, 0)');
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_IN, 0, Math.PI * 2);
    ctx.fill();
    // Abdunkeln zur Kante unten rechts (Tiefe)
    const shade = ctx.createRadialGradient(C - 60, C - 70, 120, C, C, R_RIM_IN);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(0.75, 'rgba(0, 0, 0, 0.08)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(C, C, R_RIM_IN, 0, Math.PI * 2);
    ctx.fill();
    // Fachschatten (innen dunkler Ring)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(C, C, R_POCKET_IN + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}
