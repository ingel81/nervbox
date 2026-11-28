/**
 * Hotdog-Greifer: Simulation + Canvas-2D-Darstellung.
 *
 * Welt: Wasseroberflaeche als (x, z)-Ebene, Hoehe h darueber. Projektion auf den Bildschirm:
 *   sx = x, sy = POT_Y + z * SQ - h   (leichte Aufsicht von vorn)
 * Wuerste schwimmen als starre Kapseln (Kreiskette) mit Auftrieb, Stroemung, Blasen und Stoessen.
 * Die Greifkraft kommt vom Server: Wuerste, die schwerer sind als die Greifkraft, rutschen sicher
 * heraus; leichtere halten, solange man nicht zu wild schwingt.
 */
import { ClawAudio } from './claw-audio';
import {
  ClawPhase,
  PotItem,
  SAUSAGES,
  SausageDef,
  SausageType,
  TryParams,
  TryResult,
} from './claw.types';

export const CLAW_W = 720;
export const CLAW_H = 840;

const POT_X = 288;
const POT_Y = 548;
const R = 228;
const SQ = 0.36;
const RIM_UP = 14;
const POT_BOTTOM = 742;
const COUNTER_Y = 796;

const CH_X = 634;
const CH_Z = -30;
const CH_H = 40;
const CH_R = 58;
const CH_SY = POT_Y + CH_Z * SQ - CH_H;

const H_IDLE = 300;
const H_RAIL = 410;
const X_MIN = POT_X - R + 34;
const X_MAX = 690;
const Z_MIN = -150;
const Z_MAX = 150;
const HOME_X = CH_X;
const HOME_Z = CH_Z;

const GRAV = 1500;
const WATER = '#4b3824';

type SState = 'float' | 'held' | 'fall' | 'chute' | 'counter';

interface Sausage {
  id: number;
  def: SausageDef;
  x: number;
  z: number;
  vx: number;
  vz: number;
  a: number;
  va: number;
  h: number;
  vh: number;
  phase: number;
  bendSign: number;
  squash: number;
  state: SState;
  fade: number;
  delay: number;
  bounces: number;
  /** im Flug: wurde vom Greifer abgeworfen/abgerutscht -> Ergebnis melden */
  tracked: boolean;
}

interface Held {
  s: Sausage;
  u: number;
  q: number;
  weak: boolean;
  slipAt: number;
  t: number;
  phi: number;
  phiV: number;
  slide: number;
  sliding: boolean;
}

interface Ripple {
  x: number;
  z: number;
  r: number;
  max: number;
  life: number;
  t: number;
}
interface Bubble {
  x: number;
  z: number;
  t: number;
  life: number;
  size: number;
}
interface Drop {
  x: number;
  z: number;
  h: number;
  vx: number;
  vz: number;
  vh: number;
}
interface Steam {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  t: number;
  life: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}
interface FloatText {
  text: string;
  x: number;
  y: number;
  t: number;
  life: number;
  color: string;
  size: number;
}
interface Banner {
  text: string;
  sub: string;
  color: string;
  t: number;
  life: number;
}
interface Bun {
  type: SausageType;
  t: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class ClawEngine {
  onPhase?: (p: ClawPhase) => void;
  onTryEnd?: (r: TryResult) => void;

  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private time = 0;
  private phase: ClawPhase = 'idle';

  private sausages: Sausage[] = [];
  private held: Held | null = null;
  private ripples: Ripple[] = [];
  private bubbles: Bubble[] = [];
  private drops: Drop[] = [];
  private steam: Steam[] = [];
  private sparks: Spark[] = [];
  private texts: FloatText[] = [];
  private banner: Banner | null = null;
  private bun: Bun | null = null;
  private boils: { x: number; z: number; t: number }[] = [];

  private claw = { x: HOME_X, z: HOME_Z, h: H_IDLE, vx: 0, vz: 0, open: 1, tx: HOME_X, tz: HOME_Z };
  private keyDir = { x: 0, z: 0 };
  private keyActive = false;
  private dropTarget = 0;
  private dipped = false;
  private grabbed = false;
  private grabT = 0;
  private timeLeft = 0;
  private lastTick = 0;
  private rng: () => number = Math.random;
  private grip = 0;
  private lastAx = 0;
  private pendingEnd: TryResult | null = null;
  private endTimer = 0;
  private bubbleAcc = 0;
  private steamAcc = 0;

  private layers: {
    bg: HTMLCanvasElement;
    potBack: HTMLCanvasElement;
    potFront: HTMLCanvasElement;
    chuteBack: HTMLCanvasElement;
    chuteFront: HTMLCanvasElement;
    vignette: HTMLCanvasElement;
  };
  private steamSprite: HTMLCanvasElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audio: ClawAudio,
  ) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = CLAW_W * this.dpr;
    canvas.height = CLAW_H * this.dpr;
    this.ctx = canvas.getContext('2d')!;
    this.steamSprite = this.makeSteamSprite();
    this.layers = {
      bg: this.layer((c) => this.paintBackground(c)),
      potBack: this.layer((c) => this.paintPotBack(c)),
      potFront: this.layer((c) => this.paintPotFront(c)),
      chuteBack: this.layer((c) => this.paintChuteBack(c)),
      chuteFront: this.layer((c) => this.paintChuteFront(c)),
      vignette: this.layer((c) => this.paintVignette(c)),
    };
    // Dampf vorwaermen
    for (let i = 0; i < 26; i++) this.spawnSteam(Math.random());
  }

  // ------------------------------------------------------------------ API

  get currentPhase(): ClawPhase {
    return this.phase;
  }

  get secondsLeft(): number {
    return Math.ceil(this.timeLeft);
  }

  /** Topfinhalt abgleichen; neue Wuerste werden (bei toss) von oben hineingeworfen. */
  syncPot(items: PotItem[], toss: boolean): void {
    const ids = new Set(items.map((i) => i.id));
    this.sausages = this.sausages.filter(
      (s) => ids.has(s.id) || s.state === 'chute' || s.state === 'held',
    );
    let n = 0;
    for (const it of items) {
      if (this.sausages.some((s) => s.id === it.id)) continue;
      const def = SAUSAGES[it.type] ?? SAUSAGES.wiener;
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * (R - 70);
      const s: Sausage = {
        id: it.id,
        def,
        x: POT_X + Math.cos(ang) * rr,
        z: Math.sin(ang) * rr,
        vx: 0,
        vz: 0,
        a: Math.random() * Math.PI,
        va: rnd(-0.4, 0.4),
        h: def.rad * 0.3,
        vh: 0,
        phase: Math.random() * 10,
        bendSign: Math.random() < 0.5 ? -1 : 1,
        squash: 0,
        state: 'float',
        fade: 1,
        delay: 0,
        bounces: 0,
        tracked: false,
      };
      if (toss) {
        s.state = 'fall';
        s.h = 260 + Math.random() * 80;
        s.vh = 0;
        s.va = rnd(-3, 3);
        s.delay = n * 0.18;
        n++;
      }
      this.sausages.push(s);
    }
  }

  beginTry(p: TryParams): void {
    this.rng = mulberry32(p.seed || 1);
    this.grip = p.grip;
    this.timeLeft = p.timeLimit;
    this.lastTick = Math.ceil(p.timeLimit);
    this.claw.open = 1;
    this.held = null;
    this.pendingEnd = null;
    this.bun = null;
    this.audio.coin();
    this.setPhase('aim');
  }

  setKeys(x: number, z: number): void {
    this.keyDir.x = x;
    this.keyDir.z = z;
  }

  /** Zielpunkt aus Bildschirmkoordinaten (Maus) */
  pointTo(sx: number, sy: number): void {
    if (this.phase !== 'aim' && this.phase !== 'carry') return;
    if (Math.abs(sx - CH_X) < CH_R + 12 && Math.abs(sy - CH_SY) < 34) {
      this.claw.tx = CH_X;
      this.claw.tz = CH_Z;
      return;
    }
    this.claw.tx = clamp(sx, X_MIN, X_MAX);
    this.claw.tz = clamp((sy - POT_Y) / SQ, Z_MIN, Z_MAX);
  }

  /** Relativ verschieben (Touch-Ziehen), Bildschirm-Pixel */
  nudge(dx: number, dy: number): void {
    if (this.phase !== 'aim' && this.phase !== 'carry') return;
    this.claw.tx = clamp(this.claw.tx + dx * 1.25, X_MIN, X_MAX);
    this.claw.tz = clamp(this.claw.tz + dy * 1.7, Z_MIN, Z_MAX);
  }

  /** Greifen bzw. Loslassen. Liefert true, wenn etwas passiert ist. */
  action(): boolean {
    if (this.phase === 'aim') {
      this.startDrop();
      return true;
    }
    if (this.phase === 'carry') {
      this.release();
      return true;
    }
    return false;
  }

  /** Ergebnis vom Server: Hotdog im Brötchen + Betrag zeigen */
  showPayout(payout: number, type: SausageType | null, accepted: boolean): void {
    if (!accepted || !type) {
      this.showBanner('ABGELEHNT', 'Der Automat hat nicht gezahlt', '#ff7a6b');
      this.audio.empty();
      return;
    }
    const def = SAUSAGES[type];
    this.bun = { type, t: 0 };
    const big = type === 'gold';
    if (type === 'gurke') {
      this.showBanner('SAURE GURKE!', `Trostpreis +${payout} N$`, '#a3c95e');
      this.audio.sadTrombone();
    } else {
      this.showBanner(
        big ? 'GOLDWURST!' : def.name.toUpperCase() + '!',
        `+${payout} N$`,
        big ? '#ffd75e' : '#ffe2b0',
      );
      this.audio.win(big);
    }
    this.texts.push({
      text: `+${payout} N$`,
      x: CH_X - 40,
      y: 700,
      t: 0,
      life: 2.2,
      color: big ? '#ffd75e' : '#c8f08a',
      size: big ? 40 : 30,
    });
    const n = big ? 90 : 34;
    const colors = big
      ? ['#ffd75e', '#fff2a6', '#e2b33a', '#ffffff']
      : ['#ffe2b0', '#c8f08a', '#f29a78', '#ffd75e'];
    for (let i = 0; i < n; i++) {
      const ang = rnd(-Math.PI, 0);
      const sp = rnd(120, big ? 520 : 340);
      this.sparks.push({
        x: CH_X,
        y: 740,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        t: 0,
        life: rnd(0.8, 1.6),
        color: colors[i % colors.length],
        size: rnd(2, big ? 5 : 4),
      });
    }
  }

  showError(text: string): void {
    this.showBanner('STÖRUNG', text, '#ff7a6b');
  }

  // ------------------------------------------------------------------ Ablauf

  private setPhase(p: ClawPhase): void {
    this.phase = p;
    this.onPhase?.(p);
  }

  private startDrop(): void {
    const d = Math.hypot(this.claw.x - POT_X, this.claw.z);
    const overChute = Math.hypot(this.claw.x - CH_X, this.claw.z - CH_Z) < CH_R;
    this.dropTarget = d < R - 12 ? -7 : overChute ? CH_H + 8 : 70;
    this.claw.vx = 0;
    this.claw.vz = 0;
    this.dipped = false;
    this.setPhase('drop');
  }

  private release(): void {
    this.setPhase('release');
    this.grabT = 0;
    if (this.held) this.dropHeld(false);
  }

  private dropHeld(slipped: boolean): void {
    const hd = this.held;
    if (!hd) return;
    const s = hd.s;
    const p = this.heldWorld(hd);
    s.x = p.x;
    s.z = p.z;
    s.h = p.h;
    s.vx = this.claw.vx + Math.sin(hd.phi) * 0 + hd.phiV * 22;
    s.vz = this.claw.vz;
    s.vh = slipped ? -60 : -20;
    s.va = rnd(-2.5, 2.5);
    s.state = 'fall';
    s.tracked = true;
    s.bounces = 0;
    s.delay = 0;
    this.held = null;
    if (slipped) {
      this.setPhase('return');
      this.audio.slip();
      this.showBanner('RUTSCHT!', 'Die Wurst ist weg …', '#ffb48a');
    }
  }

  private endTry(r: TryResult, delay = 0): void {
    if (this.pendingEnd) return;
    this.pendingEnd = r;
    this.endTimer = delay;
  }

  // ------------------------------------------------------------------ Update

  update(dt: number): void {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.updateClaw(dt);
    const sub = 2;
    for (let i = 0; i < sub; i++) this.updateSausages(dt / sub);
    this.updateFx(dt);

    if (this.pendingEnd) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        const r = this.pendingEnd;
        this.pendingEnd = null;
        if (this.phase !== 'return' && this.phase !== 'idle') this.setPhase('return');
        this.onTryEnd?.(r);
      }
    }
  }

  private moveClaw(dt: number, tx: number, tz: number, maxSpeed: number): number {
    const c = this.claw;
    const dvx = clamp((tx - c.x) * 6, -maxSpeed, maxSpeed);
    const dvz = clamp((tz - c.z) * 6, -maxSpeed, maxSpeed);
    const acc = 1100 * dt;
    const oldVx = c.vx;
    c.vx += clamp(dvx - c.vx, -acc, acc);
    c.vz += clamp(dvz - c.vz, -acc, acc);
    c.x = clamp(c.x + c.vx * dt, X_MIN, X_MAX);
    c.z = clamp(c.z + c.vz * dt, Z_MIN, Z_MAX);
    this.lastAx = (c.vx - oldVx) / Math.max(dt, 1e-4);
    return Math.hypot(c.vx, c.vz) / maxSpeed;
  }

  private updateClaw(dt: number): void {
    const c = this.claw;
    let motor = 0;
    switch (this.phase) {
      case 'idle':
        c.open = Math.min(1, c.open + dt * 2);
        motor = this.moveClaw(dt, HOME_X, HOME_Z, 220) * 0.6;
        c.tx = c.x;
        c.tz = c.z;
        break;
      case 'aim':
      case 'carry': {
        if (this.keyDir.x || this.keyDir.z) {
          c.tx = clamp(c.x + this.keyDir.x * 90, X_MIN, X_MAX);
          c.tz = clamp(c.z + this.keyDir.z * 90, Z_MIN, Z_MAX);
          this.keyActive = true;
        } else if (this.keyActive) {
          this.keyActive = false;
          c.tx = clamp(c.x + c.vx * 0.12, X_MIN, X_MAX);
          c.tz = clamp(c.z + c.vz * 0.12, Z_MIN, Z_MAX);
        }
        motor = this.moveClaw(dt, c.tx, c.tz, 270);
        this.timeLeft -= dt;
        const sec = Math.ceil(this.timeLeft);
        if (sec < this.lastTick) {
          this.lastTick = sec;
          if (sec <= 5 && sec > 0) this.audio.tick(sec <= 2);
        }
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.action();
        }
        break;
      }
      case 'drop': {
        c.vx *= 0.8;
        c.vz *= 0.8;
        c.h -= 380 * dt;
        motor = 0.5;
        if (!this.dipped && this.dropTarget < 0 && c.h <= 6) {
          this.dipped = true;
          this.splashAt(c.x, c.z, 0.8);
          this.audio.splash(0.6);
        }
        if (c.h <= this.dropTarget) {
          c.h = this.dropTarget;
          this.grabbed = false;
          this.grabT = 0;
          this.setPhase('grab');
        }
        break;
      }
      case 'grab': {
        this.grabT += dt;
        c.open = Math.max(0, 1 - this.grabT / 0.42);
        if (!this.grabbed && c.open < 0.45) {
          this.grabbed = true;
          this.tryGrab();
          this.audio.clank();
        }
        if (this.grabT > 0.62) {
          this.grabT = 0;
          this.setPhase('lift');
        }
        break;
      }
      case 'lift': {
        this.grabT += dt;
        c.h = Math.min(H_IDLE, c.h + 210 * dt);
        motor = 0.55;
        if (c.h >= H_IDLE) {
          if (this.held) {
            this.setPhase('carry');
          } else if (!this.pendingEnd) {
            this.showBanner('LEER!', 'Nichts erwischt', '#ffb48a');
            this.audio.empty();
            this.endTry({ outcome: 'empty' }, 0.2);
            this.setPhase('return');
          }
        }
        break;
      }
      case 'release':
        this.grabT += dt;
        c.open = Math.min(1, this.grabT / 0.25);
        c.vx *= 0.9;
        c.vz *= 0.9;
        break;
      case 'return':
        c.open = Math.min(1, c.open + dt * 2);
        c.h = Math.min(H_IDLE, c.h + 210 * dt);
        motor = this.moveClaw(dt, HOME_X, HOME_Z, 240) * 0.7;
        if (
          !this.pendingEnd &&
          !this.sausages.some((s) => s.tracked) &&
          Math.hypot(c.x - HOME_X, c.z - HOME_Z) < 3 &&
          c.h >= H_IDLE
        ) {
          this.setPhase('idle');
        }
        break;
    }
    this.audio.setMotor(motor);

    // Gehaltene Wurst: Pendel, Tropfen, Rutschen
    const hd = this.held;
    if (hd) {
      hd.t += dt;
      const ax = this.lastAx;
      hd.phiV += (-9 * Math.sin(hd.phi) - ax / 260 - 1.6 * hd.phiV) * dt;
      if (hd.weak) hd.phiV += Math.sin(this.time * 23) * dt * 2.2;
      hd.phi += hd.phiV * dt;
      hd.phi = clamp(hd.phi, -1.2, 1.2);

      if (Math.random() < dt * Math.max(0, 9 - hd.t * 3)) {
        const p = this.heldWorld(hd);
        this.drops.push({
          x: p.x + rnd(-hd.s.def.len / 3, hd.s.def.len / 3),
          z: p.z,
          h: p.h - hd.s.def.rad,
          vx: this.claw.vx * 0.5,
          vz: 0,
          vh: -rnd(10, 60),
        });
      }

      if (!hd.sliding) {
        let slip = false;
        if (hd.weak) {
          const nearChute = Math.hypot(this.claw.x - CH_X, this.claw.z - CH_Z) < 170;
          if (hd.t >= hd.slipAt || (this.phase === 'carry' && nearChute)) slip = true;
        } else if (this.phase === 'lift' || this.phase === 'carry') {
          const margin = this.grip - hd.s.def.weight;
          const limit = 0.38 + margin * 1.2 + hd.q * 0.35;
          let lambda = Math.max(0, Math.abs(hd.phi) - limit) * 7;
          if (hd.q < 0.35) lambda += 0.1;
          if (this.rng() < 1 - Math.exp(-lambda * dt)) slip = true;
        }
        if (slip) {
          hd.sliding = true;
          hd.slide = 0;
        }
      } else {
        hd.slide += dt;
        hd.u += (hd.u >= 0 ? 1 : -1) * 90 * dt;
        hd.phiV += (hd.u >= 0 ? -1 : 1) * 4 * dt;
        if (hd.slide > 0.28) {
          this.dropHeld(true);
        }
      }
    }
  }

  private tryGrab(): void {
    const c = this.claw;
    let best: Sausage | null = null;
    let bestD = 1e9;
    let bestU = 0;
    for (const s of this.sausages) {
      if (s.state !== 'float' || s.h < -s.def.rad * 1.3) continue;
      const dx = Math.cos(s.a);
      const dz = Math.sin(s.a);
      const px = c.x - s.x;
      const pz = c.z - s.z;
      const u = clamp(px * dx + pz * dz, -s.def.len / 2, s.def.len / 2);
      const d = Math.hypot(px - dx * u, pz - dz * u);
      const lim = s.def.rad + 17;
      if (d < lim && d < bestD) {
        best = s;
        bestD = d;
        bestU = u;
      }
    }
    if (best) {
      const lim = best.def.rad + 17;
      const ax = Math.abs(bestU) / (best.def.len / 2);
      const q = (1 - bestD / lim) * (1 - 0.6 * ax * ax);
      if (q >= 0.14) {
        const weak = this.grip < best.def.weight;
        best.state = 'held';
        best.squash = 1;
        this.held = {
          s: best,
          u: bestU,
          q,
          weak,
          slipAt: weak ? 0.35 + this.rng() * 1.7 : Infinity,
          t: 0,
          phi: 0,
          phiV: (this.rng() - 0.5) * 1.5,
          slide: 0,
          sliding: false,
        };
        return;
      }
    }
    // Daneben: Krallen schubsen die Nachbarn weg
    for (const s of this.sausages) {
      if (s.state !== 'float') continue;
      const dx = s.x - c.x;
      const dz = s.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 80 && d > 0.1) {
        s.vx += (dx / d) * 60;
        s.vz += (dz / d) * 60;
        s.vh -= 40;
        s.va += rnd(-1.5, 1.5);
      }
    }
  }

  /** Weltposition der gehaltenen Wurst (Mitte) */
  private heldWorld(hd: Held): { x: number; z: number; h: number } {
    const c = this.claw;
    const hang = hd.s.def.rad * 0.35 + 4;
    return {
      x: c.x + Math.sin(hd.phi) * hang - Math.cos(hd.s.a) * hd.u,
      z: c.z - Math.sin(hd.s.a) * hd.u,
      h: c.h - Math.cos(hd.phi) * hang,
    };
  }

  private updateSausages(dt: number): void {
    const t = this.time;
    const list = this.sausages;
    for (const s of list) {
      s.squash = Math.max(0, s.squash - dt * 2.2);
      if (s.state === 'float') {
        const dx = s.x - POT_X;
        const dz = s.z;
        const d = Math.hypot(dx, dz) || 1;
        // langsame Konvektion im Kreis + leichtes Wabern
        const sw = 16 * (d / R);
        s.vx += ((-dz / d) * sw - s.vx * 0.15) * dt + Math.sin(t * 0.7 + s.phase) * 9 * dt;
        s.vz += ((dx / d) * sw - s.vz * 0.15) * dt + Math.cos(t * 0.6 + s.phase * 1.3) * 9 * dt;
        for (const b of this.boils) {
          const bx = s.x - b.x;
          const bz = s.z - b.z;
          const bd = Math.hypot(bx, bz);
          if (bd < 90 && bd > 0.1) {
            const f = (1 - bd / 90) * 120 * dt;
            s.vx += (bx / bd) * f;
            s.vz += (bz / bd) * f;
            s.va += Math.sin(s.phase + b.t) * f * 0.012;
            if (bd < 40) s.vh += 70 * dt;
          }
        }
        const drag = Math.exp(-1.1 * dt);
        s.vx *= drag;
        s.vz *= drag;
        s.va *= Math.exp(-1.4 * dt);
        s.va += Math.sin(t * 0.5 + s.phase * 2) * 0.12 * dt;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.a += s.va * dt;
        // Auftrieb: schaukeln um eine Schwimmhoehe
        const r = s.def.rad;
        const target = r * 0.28 + Math.sin(t * 1.7 + s.phase) * r * 0.22;
        s.vh += (-34 * (s.h - target) - 5.5 * s.vh) * dt;
        s.h += s.vh * dt;
        if (Math.random() < 0.05 * dt) s.vh -= 70; // taucht kurz ab
        // Aufwallen in der Mitte treibt nach aussen, am Rand sinkt das Wasser wieder ab
        const push = d < R * 0.45 ? 14 * (1 - d / (R * 0.45)) : d > R * 0.8 ? -8 : 0;
        s.vx += (dx / d) * push * dt;
        s.vz += (dz / d) * push * dt;
      } else if (s.state === 'fall' || s.state === 'counter') {
        if (s.delay > 0) {
          s.delay -= dt;
          continue;
        }
        if (s.state === 'counter') {
          s.fade -= dt * 0.8;
          s.vx *= Math.exp(-4 * dt);
          s.vz *= Math.exp(-4 * dt);
          s.x += s.vx * dt;
          s.z += s.vz * dt;
          continue;
        }
        s.vh -= GRAV * dt;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.h += s.vh * dt;
        s.a += s.va * dt;
        this.landing(s);
      } else if (s.state === 'chute') {
        s.vh -= GRAV * dt;
        s.h += s.vh * dt;
        s.x += (CH_X - s.x) * 4 * dt;
        s.z += (CH_Z - s.z) * 4 * dt;
        s.a += s.va * dt;
      }
    }
    this.sausages = list.filter(
      (s) => !(s.state === 'chute' && s.h < CH_H - 260) && !(s.state === 'counter' && s.fade <= 0),
    );
    this.collide(dt);
  }

  private landing(s: Sausage): void {
    if (s.vh >= 0) return;
    const r = s.def.rad;
    const d = Math.hypot(s.x - POT_X, s.z);
    const dc = Math.hypot(s.x - CH_X, s.z - CH_Z);
    // Ausgabeschacht
    if (s.h <= CH_H && s.h > CH_H - 30) {
      if (dc < CH_R - 6) {
        s.state = 'chute';
        s.va *= 0.3;
        this.audio.thud();
        if (s.tracked) {
          s.tracked = false;
          this.endTry({ outcome: 'delivered', sausageId: s.id, type: s.def.type });
        }
        return;
      }
      if (dc < CH_R + 12) {
        s.vh = Math.abs(s.vh) * 0.35;
        s.vx += ((s.x - CH_X) / (dc || 1)) * 90;
        s.vz += ((s.z - CH_Z) / (dc || 1)) * 90;
        s.va += rnd(-4, 4);
        this.audio.clank();
        return;
      }
    }
    // Topfrand
    if (s.h <= RIM_UP + r && s.h > RIM_UP - 20 && d > R - 10 && d < R + 24) {
      s.vh = Math.abs(s.vh) * 0.3;
      s.vx += ((POT_X - s.x) / d) * 110;
      s.vz += (-s.z / d) * 110;
      s.va += rnd(-4, 4);
      this.audio.clank();
      return;
    }
    // Wasser
    if (d < R - 10 && s.h <= 0) {
      const sp = Math.min(1.6, -s.vh / 500);
      this.splashAt(s.x, s.z, 0.6 + sp);
      this.audio.splash(0.5 + sp * 0.6);
      s.state = 'float';
      s.vh *= 0.25;
      s.vx *= 0.4;
      s.vz *= 0.4;
      s.va *= 0.3;
      s.squash = 1;
      if (s.tracked) {
        s.tracked = false;
        this.endTry({ outcome: this.phase === 'release' ? 'missed' : 'slipped' });
        if (this.phase === 'release') this.showBanner('DANEBEN!', 'Zurück in den Topf', '#ffb48a');
      }
      return;
    }
    // Theke
    const floor = POT_Y + s.z * SQ - COUNTER_Y;
    if (d >= R + 24 && dc >= CH_R + 12 && s.h <= floor + r) {
      s.h = floor + r;
      s.bounces++;
      this.audio.thud();
      if (s.bounces > 2 || Math.abs(s.vh) < 160) {
        s.state = 'counter';
        s.vh = 0;
        if (s.tracked) {
          s.tracked = false;
          this.endTry({ outcome: this.phase === 'release' ? 'missed' : 'slipped' }, 0.3);
          if (this.phase === 'release')
            this.showBanner('DANEBEN!', 'Auf der Theke gelandet', '#ffb48a');
        }
      } else {
        s.vh = Math.abs(s.vh) * 0.35;
        s.va += rnd(-3, 3);
      }
    }
  }

  private collide(dt: number): void {
    const fl = this.sausages.filter((s) => s.state === 'float');
    const N = 5;
    const pts = fl.map((s) => {
      const span = s.def.len / 2 - s.def.rad;
      const cs = Math.cos(s.a);
      const sn = Math.sin(s.a);
      const arr: { ox: number; oz: number }[] = [];
      for (let i = 0; i < N; i++) {
        const k = -1 + (2 * i) / (N - 1);
        arr.push({ ox: cs * span * k, oz: sn * span * k });
      }
      return arr;
    });
    for (let i = 0; i < fl.length; i++) {
      const a = fl[i];
      for (let j = i + 1; j < fl.length; j++) {
        const b = fl[j];
        const cd = Math.hypot(a.x - b.x, a.z - b.z);
        const reach = (a.def.len + b.def.len) * 0.6;
        if (cd < reach && cd > 0.1) {
          // weiche Abstossung: Wuerste verteilen sich locker im Topf
          const f = (1 - cd / reach) * 26 * dt;
          const ux = (b.x - a.x) / cd;
          const uz = (b.z - a.z) / cd;
          a.vx -= ux * f;
          a.vz -= uz * f;
          b.vx += ux * f;
          b.vz += uz * f;
        }
        if (cd > (a.def.len + b.def.len) / 2 + 4) continue;
        const rr = a.def.rad + b.def.rad;
        for (const pa of pts[i]) {
          for (const pb of pts[j]) {
            const dx = b.x + pb.ox - (a.x + pa.ox);
            const dz = b.z + pb.oz - (a.z + pa.oz);
            const d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const nz = dz / d;
            const pen = rr - d;
            a.x -= nx * pen * 0.5;
            a.z -= nz * pen * 0.5;
            b.x += nx * pen * 0.5;
            b.z += nz * pen * 0.5;
            const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (vrel < 0) {
              const jimp = -vrel * 0.55;
              a.vx -= nx * jimp;
              a.vz -= nz * jimp;
              b.vx += nx * jimp;
              b.vz += nz * jimp;
              const hit = Math.min(1, -vrel / 50);
              a.squash = Math.max(a.squash, hit);
              b.squash = Math.max(b.squash, hit);
            }
            a.va -= (pa.ox * nz - pa.oz * nx) * pen * 0.004;
            b.va += (pb.ox * nz - pb.oz * nx) * pen * 0.004;
          }
        }
      }
    }
    // Topfwand
    for (let i = 0; i < fl.length; i++) {
      const s = fl[i];
      for (const p of pts[i]) {
        const cx = s.x + p.ox - POT_X;
        const cz = s.z + p.oz;
        const d = Math.hypot(cx, cz);
        const lim = R - s.def.rad - 6;
        if (d > lim) {
          const nx = cx / d;
          const nz = cz / d;
          const pen = d - lim;
          s.x -= nx * pen;
          s.z -= nz * pen;
          const vn = s.vx * nx + s.vz * nz;
          if (vn > 0) {
            s.vx -= nx * vn * 1.4;
            s.vz -= nz * vn * 1.4;
          }
          s.va -= (p.ox * nz - p.oz * nx) * pen * 0.004;
        }
      }
    }
    // Eintauchender Greifer schiebt Wuerste beiseite
    const c = this.claw;
    if (c.h < 30 && (this.phase === 'drop' || this.phase === 'grab')) {
      for (const s of fl) {
        const dx = s.x - c.x;
        const dz = s.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < 30 && d > 0.1) {
          s.vx += (dx / d) * 120 * dt;
          s.vz += (dz / d) * 120 * dt;
        }
      }
    }
  }

  private splashAt(x: number, z: number, size: number): void {
    this.ripples.push({ x, z, r: 6, max: 50 + size * 40, life: 1.1, t: 0 });
    this.ripples.push({ x, z, r: 2, max: 30 + size * 25, life: 0.8, t: 0 });
    const n = Math.round(10 + size * 14);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = rnd(30, 110) * size;
      this.drops.push({
        x,
        z,
        h: 2,
        vx: Math.cos(ang) * sp,
        vz: Math.sin(ang) * sp * 0.8,
        vh: rnd(140, 340) * Math.min(1.3, size),
      });
    }
    for (let i = 0; i < 3; i++) this.spawnSteam(0, x + rnd(-20, 20), POT_Y + z * SQ);
  }

  private spawnSteam(age: number, sx?: number, sy?: number): void {
    const ang = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * (R - 20);
    const life = rnd(3.5, 6);
    this.steam.push({
      x: sx ?? POT_X + Math.cos(ang) * rr,
      y: sy ?? POT_Y + Math.sin(ang) * rr * SQ,
      vx: rnd(-6, 6),
      vy: rnd(-34, -18),
      size: rnd(40, 80),
      t: age * life,
      life,
    });
  }

  private updateFx(dt: number): void {
    // Blasen: mehr in der Mitte (dort ist die Flamme)
    this.bubbleAcc += dt * 11;
    while (this.bubbleAcc > 1) {
      this.bubbleAcc--;
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.pow(Math.random(), 0.8) * (R - 18);
      this.bubbles.push({
        x: POT_X + Math.cos(ang) * rr,
        z: Math.sin(ang) * rr,
        t: 0,
        life: rnd(0.35, 1.1),
        size: rnd(1.5, 4.5),
      });
    }
    if (Math.random() < dt * 0.7) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * (R - 60);
      const b = { x: POT_X + Math.cos(ang) * rr, z: Math.sin(ang) * rr, t: 0 };
      this.boils.push(b);
      for (let i = 0; i < 7; i++) {
        this.bubbles.push({
          x: b.x + rnd(-18, 18),
          z: b.z + rnd(-18, 18),
          t: 0,
          life: rnd(0.3, 0.8),
          size: rnd(3, 7),
        });
      }
    }
    for (const b of this.boils) b.t += dt;
    this.boils = this.boils.filter((b) => b.t < 0.9);

    for (const b of this.bubbles) {
      b.t += dt;
      if (b.t >= b.life) {
        if (b.size > 3.2) {
          this.ripples.push({ x: b.x, z: b.z, r: b.size, max: b.size * 5, life: 0.5, t: 0 });
          this.audio.blup();
          if (Math.random() < 0.4) {
            this.drops.push({
              x: b.x,
              z: b.z,
              h: 1,
              vx: rnd(-20, 20),
              vz: rnd(-10, 10),
              vh: rnd(60, 140),
            });
          }
        }
      }
    }
    this.bubbles = this.bubbles.filter((b) => b.t < b.life);

    for (const r of this.ripples) {
      r.t += dt;
      r.r += (r.max - r.r) * Math.min(1, dt * 3.2);
    }
    this.ripples = this.ripples.filter((r) => r.t < r.life);

    for (const d of this.drops) {
      d.vh -= GRAV * 0.8 * dt;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
      d.h += d.vh * dt;
    }
    this.drops = this.drops.filter((d) => {
      if (d.h > 0) return true;
      const dist = Math.hypot(d.x - POT_X, d.z);
      if (dist < R - 4) {
        if (Math.random() < 0.35)
          this.ripples.push({ x: d.x, z: d.z, r: 1, max: 9, life: 0.4, t: 0 });
        return false;
      }
      return d.h > POT_Y + d.z * SQ - COUNTER_Y;
    });

    this.steamAcc += dt * 6;
    while (this.steamAcc > 1) {
      this.steamAcc--;
      this.spawnSteam(0);
    }
    for (const s of this.steam) {
      s.t += dt;
      s.x += (s.vx + Math.sin(this.time * 0.8 + s.y * 0.02) * 10) * dt;
      s.y += s.vy * dt;
      s.size += dt * 14;
    }
    this.steam = this.steam.filter((s) => s.t < s.life);

    for (const p of this.sparks) {
      p.t += dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.sparks = this.sparks.filter((p) => p.t < p.life);
    for (const f of this.texts) {
      f.t += dt;
      f.y -= 40 * dt;
    }
    this.texts = this.texts.filter((f) => f.t < f.life);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }
    if (this.bun) {
      this.bun.t += dt;
      if (this.bun.t > 4.2) this.bun = null;
    }
  }

  private showBanner(text: string, sub: string, color: string): void {
    this.banner = { text, sub, color, t: 0, life: 2.1 };
  }

  // ------------------------------------------------------------------ Render

  render(): void {
    const g = this.ctx;
    const L = this.layers;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(L.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawFlames(g);
    this.blit(g, L.potBack);
    this.drawWater(g);

    const inPot = this.sausages
      .filter(
        (s) =>
          s.state === 'float' ||
          (s.state === 'fall' && s.delay <= 0 && Math.hypot(s.x - POT_X, s.z) < R && s.h < 60),
      )
      .sort((a, b) => a.z - b.z);
    for (const s of inPot) this.drawSausageWorld(g, s);

    this.blit(g, L.potFront);
    this.drawReticle(g, true);
    this.blit(g, L.chuteBack);
    for (const s of this.sausages) if (s.state === 'chute') this.drawSausageWorld(g, s);
    this.blit(g, L.chuteFront);
    this.drawTimer(g);
    this.drawBun(g);

    for (const s of this.sausages) {
      if (s.state === 'counter' || (s.state === 'fall' && s.delay <= 0 && !inPot.includes(s))) {
        g.globalAlpha = clamp(s.fade, 0, 1);
        this.drawSausageWorld(g, s);
        g.globalAlpha = 1;
      }
    }
    this.drawDrops(g);
    this.drawGantry(g);
    this.drawReticle(g, false);
    this.drawClaw(g);
    this.drawSteam(g);
    this.drawSign(g);
    this.blit(g, L.vignette);
    this.drawSparks(g);
    this.drawTexts(g);
    this.drawBanner(g);
  }

  private blit(g: CanvasRenderingContext2D, c: HTMLCanvasElement): void {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, 0, 0);
    g.restore();
  }

  private sy(z: number, h: number): number {
    return POT_Y + z * SQ - h;
  }

  private drawFlames(g: CanvasRenderingContext2D): void {
    const t = this.time;
    const glow = g.createRadialGradient(POT_X, POT_BOTTOM + 20, 10, POT_X, POT_BOTTOM + 20, 230);
    glow.addColorStop(0, `rgba(255,150,60,${0.22 + Math.sin(t * 7) * 0.03})`);
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = glow;
    g.fillRect(POT_X - 240, POT_BOTTOM - 80, 480, 150);
    for (let i = 0; i < 18; i++) {
      const k = i / 17;
      const ang = Math.PI * (0.06 + k * 0.88);
      const fx = POT_X + Math.cos(ang) * -178;
      const fy = POT_BOTTOM + 30 + Math.sin(ang) * 14;
      const fh = 26 + Math.sin(t * 13 + i * 2.3) * 6 + Math.sin(t * 29 + i) * 3;
      const grd = g.createLinearGradient(fx, fy, fx, fy - fh);
      grd.addColorStop(0, 'rgba(90,170,255,0.95)');
      grd.addColorStop(0.5, 'rgba(60,120,255,0.6)');
      grd.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = grd;
      g.beginPath();
      const w = 7;
      g.moveTo(fx - w, fy);
      g.quadraticCurveTo(fx - w * 0.6, fy - fh * 0.6, fx + Math.sin(t * 9 + i) * 3, fy - fh);
      g.quadraticCurveTo(fx + w * 0.6, fy - fh * 0.6, fx + w, fy);
      g.closePath();
      g.fill();
    }
  }

  private drawWater(g: CanvasRenderingContext2D): void {
    const t = this.time;
    g.save();
    g.beginPath();
    g.ellipse(POT_X, POT_Y, R, R * SQ, 0, 0, Math.PI * 2);
    g.clip();
    const grd = g.createLinearGradient(0, POT_Y - R * SQ, 0, POT_Y + R * SQ);
    grd.addColorStop(0, '#2c2015');
    grd.addColorStop(0.5, '#4b3824');
    grd.addColorStop(1, '#6a5134');
    g.fillStyle = grd;
    g.fillRect(POT_X - R, POT_Y - R * SQ, R * 2, R * SQ * 2);
    // Waerme in der Mitte
    const hot = g.createRadialGradient(POT_X, POT_Y + 8, 10, POT_X, POT_Y + 8, R * 0.8);
    hot.addColorStop(0, 'rgba(200,150,90,0.25)');
    hot.addColorStop(1, 'rgba(200,150,90,0)');
    g.fillStyle = hot;
    g.fillRect(POT_X - R, POT_Y - R * SQ, R * 2, R * SQ * 2);
    // dunkler Rand (Schatten der Topfwand)
    g.save();
    g.translate(POT_X, POT_Y);
    g.scale(1, SQ);
    const edge = g.createRadialGradient(0, -R * 0.15, R * 0.55, 0, 0, R);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(8,5,2,0.5)');
    g.fillStyle = edge;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    // Spiegelung der Lampe (oben links), wabert
    const lx = POT_X - 90 + Math.sin(t * 0.9) * 6;
    const ly = POT_Y - 38;
    g.save();
    g.translate(lx, ly);
    g.scale(1 + Math.sin(t * 2.3) * 0.05, 0.32);
    const lamp = g.createRadialGradient(0, 0, 4, 0, 0, 110);
    lamp.addColorStop(0, 'rgba(255,236,200,0.35)');
    lamp.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = lamp;
    g.beginPath();
    g.arc(0, 0, 110, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Flimmern der Oberflaeche
    g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const z = -R * 0.85 + (i / 8) * R * 1.7;
      const half = Math.sqrt(Math.max(0, R * R - z * z)) * 0.92;
      const y0 = POT_Y + z * SQ;
      g.strokeStyle = `rgba(255,230,190,${0.05 + 0.04 * Math.sin(t * 1.3 + i)})`;
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const x = POT_X - half + (k / 24) * half * 2;
        const y = y0 + Math.sin(x * 0.045 + t * (1.5 + i * 0.13) + i) * 2.2;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // Wellenringe
    for (const r of this.ripples) {
      const a = (1 - r.t / r.life) * 0.45;
      g.strokeStyle = `rgba(255,236,205,${a})`;
      g.lineWidth = 1.6;
      g.beginPath();
      g.ellipse(r.x, POT_Y + r.z * SQ, r.r, r.r * SQ, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // Blasen
    for (const b of this.bubbles) {
      const k = b.t / b.life;
      const rr = b.size * (0.4 + k * 0.8);
      const x = b.x;
      const y = POT_Y + b.z * SQ - rr * 0.4;
      g.fillStyle = 'rgba(120,95,62,0.55)';
      g.beginPath();
      g.ellipse(x, y, rr, rr * 0.75, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,240,215,0.55)';
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(x - rr * 0.35, y - rr * 0.3, Math.max(0.6, rr * 0.25), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawSausageWorld(g: CanvasRenderingContext2D, s: Sausage): void {
    const def = s.def;
    let cx: number;
    let cy: number;
    let hx = Math.cos(s.a) * def.len * 0.5;
    let hy = Math.sin(s.a) * def.len * 0.5 * SQ;
    let tint: number | null = null;
    if (s.state === 'held' && this.held && this.held.s === s) {
      const p = this.heldWorld(this.held);
      cx = p.x;
      cy = this.sy(p.z, p.h);
      // Pendelwinkel dreht die Wurst in der Bildebene
      const phi = this.held.phi * 0.8;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const nx = hx * c - hy * sn;
      const ny = hx * sn + hy * c;
      hx = nx;
      hy = ny;
    } else {
      cx = s.x;
      cy = this.sy(s.z, s.h);
      if (s.state === 'float' || (s.state === 'fall' && s.h < def.rad * 1.5)) {
        tint = s.h;
        this.drawFloatRing(g, s);
      }
    }
    if (s.state === 'chute') {
      g.save();
      g.beginPath();
      g.rect(CH_X - 70, 0, 140, CH_SY + 2);
      g.ellipse(CH_X, CH_SY, CH_R, CH_R * SQ, 0, 0, Math.PI * 2);
      g.clip();
      drawSausage(g, cx, cy, hx, hy, def, s.bendSign, s.squash, this.time, null);
      g.restore();
      return;
    }
    drawSausage(g, cx, cy, hx, hy, def, s.bendSign, s.squash, this.time, tint);
  }

  private drawFloatRing(g: CanvasRenderingContext2D, s: Sausage): void {
    g.save();
    g.translate(s.x, POT_Y + s.z * SQ);
    g.scale(1, SQ);
    g.rotate(s.a);
    g.strokeStyle = 'rgba(255,236,205,0.16)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(
      0,
      0,
      s.def.len / 2 + 6 + Math.sin(this.time * 2 + s.phase) * 2,
      s.def.rad + 7,
      0,
      0,
      Math.PI * 2,
    );
    g.stroke();
    g.fillStyle = 'rgba(20,12,6,0.22)';
    g.beginPath();
    g.ellipse(0, 0, s.def.len / 2 + 2, s.def.rad + 3, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawReticle(g: CanvasRenderingContext2D, onWater: boolean): void {
    if (this.phase !== 'aim' && this.phase !== 'carry') return;
    const c = this.claw;
    if (onWater) {
      if (Math.hypot(c.x - POT_X, c.z) < R - 8) this.reticleAt(g, c.x, POT_Y + c.z * SQ, 0.85);
    } else if (Math.hypot(c.x - CH_X, c.z - CH_Z) < CH_R) {
      this.reticleAt(g, CH_X, CH_SY, 1);
    }
  }

  private reticleAt(g: CanvasRenderingContext2D, x: number, y: number, a: number): void {
    const pulse = 0.6 + Math.sin(this.time * 6) * 0.25;
    g.save();
    g.strokeStyle = `rgba(255,226,176,${pulse * a})`;
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.lineDashOffset = -this.time * 20;
    g.beginPath();
    g.ellipse(x, y, 24, 24 * SQ, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(x - 8, y);
    g.lineTo(x + 8, y);
    g.moveTo(x, y - 4);
    g.lineTo(x, y + 4);
    g.stroke();
    // Fallachse
    const cy = this.sy(this.claw.z, this.claw.h);
    g.strokeStyle = `rgba(255,226,176,${0.12 * a})`;
    g.setLineDash([3, 6]);
    g.beginPath();
    g.moveTo(this.claw.x, cy + 6);
    g.lineTo(x, y - 6);
    g.stroke();
    g.restore();
  }

  private drawDrops(g: CanvasRenderingContext2D): void {
    g.fillStyle = 'rgba(240,226,200,0.85)';
    for (const d of this.drops) {
      const x = d.x;
      const y = this.sy(d.z, d.h);
      g.beginPath();
      g.ellipse(x, y, 1.6, 2.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawGantry(g: CanvasRenderingContext2D): void {
    const c = this.claw;
    const by = this.sy(c.z, H_RAIL);
    // Querbalken
    const grd = g.createLinearGradient(0, by - 9, 0, by + 9);
    grd.addColorStop(0, '#d8c08a');
    grd.addColorStop(0.45, '#8f7442');
    grd.addColorStop(1, '#3d2f19');
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(36, by + 6, 664, 6);
    g.fillStyle = grd;
    g.fillRect(30, by - 8, 676, 16);
    g.fillStyle = 'rgba(255,240,200,0.35)';
    g.fillRect(30, by - 8, 676, 2);
    // Laufkatze
    const s = 1 + (c.z / 150) * 0.08;
    const tw = 46 * s;
    const tg = g.createLinearGradient(c.x - tw / 2, 0, c.x + tw / 2, 0);
    tg.addColorStop(0, '#4a4338');
    tg.addColorStop(0.35, '#b9b09a');
    tg.addColorStop(1, '#2a261f');
    g.fillStyle = tg;
    roundRect(g, c.x - tw / 2, by - 13 * s, tw, 26 * s, 4);
    g.fill();
    g.fillStyle = '#14110d';
    g.fillRect(c.x - tw / 2 + 5, by + 2 * s, tw - 10, 3);
    // LED
    const on = this.phase !== 'idle';
    g.fillStyle = on ? '#7dff9b' : '#ffb84a';
    g.beginPath();
    g.arc(c.x + tw / 2 - 8, by - 5 * s, 2.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = on ? 'rgba(125,255,155,0.25)' : 'rgba(255,184,74,0.25)';
    g.beginPath();
    g.arc(c.x + tw / 2 - 8, by - 5 * s, 7, 0, Math.PI * 2);
    g.fill();
  }

  private drawClaw(g: CanvasRenderingContext2D): void {
    const c = this.claw;
    const s = 1.45 * (1 + (c.z / 150) * 0.1);
    const tipY = this.sy(c.z, c.h);
    const hubY = tipY - 46 * s;
    const by = this.sy(c.z, H_RAIL);
    // Seil
    g.strokeStyle = '#1b1712';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(c.x, by + 12);
    g.lineTo(c.x, hubY - 12 * s);
    g.stroke();
    g.strokeStyle = 'rgba(255,230,190,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(c.x - 0.8, by + 12);
    g.lineTo(c.x - 0.8, hubY - 12 * s);
    g.stroke();

    const open = c.open;
    this.drawProng(g, c.x, hubY, s, -1, open);
    this.drawProng(g, c.x, hubY, s, 1, open);
    const hd = this.held;
    if (hd) this.drawSausageWorld(g, hd.s);
    // vordere Kralle (verkuerzt)
    this.drawProng(g, c.x, hubY, s, 0, open);
    // eingetaucht: Schaumring an der Wasserlinie (vordere Haelfte ueber der Kralle)
    if (c.h < 14 && Math.hypot(c.x - POT_X, c.z) < R - 12) {
      const wl = this.sy(c.z, 0);
      const k = clamp((14 - c.h) / 20, 0, 1);
      g.fillStyle = `rgba(75,56,36,${0.75 * k})`;
      g.beginPath();
      g.ellipse(c.x, wl, 30 * s * 0.75, 9 * s * 0.75, 0, 0, Math.PI);
      g.fill();
      g.strokeStyle = `rgba(255,240,215,${0.6 * k})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(c.x, wl, 30 * s * 0.75, 9 * s * 0.75, 0, -0.2, Math.PI + 0.2);
      g.stroke();
    }

    // Motorgehaeuse
    const w = 32 * s;
    const h = 24 * s;
    const hg = g.createLinearGradient(c.x - w / 2, 0, c.x + w / 2, 0);
    hg.addColorStop(0, '#3a352d');
    hg.addColorStop(0.3, '#e4dccb');
    hg.addColorStop(0.6, '#8c8473');
    hg.addColorStop(1, '#2a261f');
    g.fillStyle = hg;
    roundRect(g, c.x - w / 2, hubY - h / 2, w, h, 6 * s);
    g.fill();
    g.strokeStyle = '#14110d';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#14110d';
    g.fillRect(c.x - w / 2 + 4, hubY + 2 * s, w - 8, 2);
    g.fillStyle = hd ? (hd.weak ? '#ffb84a' : '#7dff9b') : '#ff5a4a';
    g.beginPath();
    g.arc(c.x + w / 2 - 7 * s, hubY - 4 * s, 2.2 * s, 0, Math.PI * 2);
    g.fill();
  }

  private drawProng(
    g: CanvasRenderingContext2D,
    x: number,
    hubY: number,
    s: number,
    side: number,
    open: number,
  ): void {
    const pts: [number, number][] = [];
    if (side === 0) {
      const len = 1 - open * 0.45;
      pts.push([0, 8], [0, 8 + 22 * len], [2, 8 + 36 * len], [-3, 8 + 42 * len]);
    } else {
      const a = 0.12 + open * 0.62;
      const px = side * 9;
      const py = 8;
      const ax = px + Math.sin(a) * 26 * side;
      const ay = py + Math.cos(a) * 26;
      const b = a - 0.95;
      const bx = ax + Math.sin(b) * 20 * side;
      const by = ay + Math.cos(b) * 20;
      const cx = bx - side * 6;
      const cy = by + 2;
      pts.push([px, py], [ax, ay], [bx, by], [cx, cy]);
    }
    const tr = (p: [number, number]): [number, number] => [x + p[0] * s, hubY + p[1] * s];
    const path = () => {
      g.beginPath();
      const p0 = tr(pts[0]);
      g.moveTo(p0[0], p0[1]);
      for (let i = 1; i < pts.length; i++) {
        const p = tr(pts[i]);
        g.lineTo(p[0], p[1]);
      }
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    path();
    g.strokeStyle = '#14110d';
    g.lineWidth = 8.5 * s;
    g.stroke();
    path();
    g.strokeStyle = side === 0 ? '#bdb4a0' : '#9b927f';
    g.lineWidth = 5.5 * s;
    g.stroke();
    g.save();
    g.translate(-1.2 * s, -1 * s);
    path();
    g.strokeStyle = 'rgba(255,248,232,0.6)';
    g.lineWidth = 1.6 * s;
    g.stroke();
    g.restore();
  }

  private drawSteam(g: CanvasRenderingContext2D): void {
    for (const s of this.steam) {
      const k = s.t / s.life;
      const a = Math.sin(Math.PI * k) * 0.16;
      if (a <= 0.005) continue;
      g.globalAlpha = a;
      g.drawImage(this.steamSprite, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    g.globalAlpha = 1;
  }

  private drawSign(g: CanvasRenderingContext2D): void {
    const t = this.time;
    const flick = Math.sin(t * 37) > 0.97 || Math.sin(t * 3.1) > 0.995 ? 0.35 : 1;
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'italic 800 40px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.shadowColor = `rgba(255,190,90,${0.9 * flick})`;
    g.shadowBlur = 18;
    g.fillStyle = `rgba(255,214,140,${flick})`;
    g.fillText('HOTDOG-GREIFER', 360, 40);
    g.shadowBlur = 0;
    g.fillStyle = `rgba(255,250,235,${0.85 * flick})`;
    g.fillText('HOTDOG-GREIFER', 360, 40);
    g.font = '600 13px "IBM Plex Mono", monospace';
    g.fillStyle = 'rgba(217,207,182,0.7)';
    g.fillText('· HEISS · FETTIG · FAIR(ISH) ·', 360, 68);
    g.restore();
  }

  private drawTimer(g: CanvasRenderingContext2D): void {
    const x = CH_X - 40;
    const y = 572;
    g.save();
    g.fillStyle = '#0d0c0a';
    roundRect(g, x - 3, y - 3, 86, 46, 6);
    g.fill();
    const active = this.phase === 'aim' || this.phase === 'carry';
    const lcd = g.createLinearGradient(0, y, 0, y + 40);
    lcd.addColorStop(0, '#b6cc6a');
    lcd.addColorStop(1, '#8fa548');
    g.fillStyle = lcd;
    roundRect(g, x, y, 80, 40, 4);
    g.fill();
    g.fillStyle = 'rgba(24,33,13,0.65)';
    g.font = '11px "VT323", monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText('ZEIT', x + 6, y + 3);
    g.font = '34px "VT323", monospace';
    g.textAlign = 'right';
    const low = active && this.timeLeft <= 5 && Math.sin(this.time * 12) > 0;
    g.fillStyle = low ? 'rgba(24,33,13,0.35)' : '#18210d';
    const txt = active ? String(Math.max(0, Math.ceil(this.timeLeft))).padStart(2, '0') : '--';
    g.fillText(txt, x + 74, y + 6);
    g.restore();
  }

  private drawBun(g: CanvasRenderingContext2D): void {
    const b = this.bun;
    if (!b) return;
    const k = Math.min(1, b.t / 0.45);
    const ease = 1 - Math.pow(1 - k, 3);
    const pop = 1 + Math.sin(Math.min(1, b.t / 0.6) * Math.PI) * 0.15;
    const fade = b.t > 3.6 ? Math.max(0, 1 - (b.t - 3.6) / 0.6) : 1;
    const x = CH_X - 6;
    const y = 752 + ease * 28;
    const s = (0.6 + ease * 0.5) * pop;
    g.save();
    g.globalAlpha = fade;
    g.translate(x, y);
    g.scale(s, s);
    // Brötchen hinten
    g.fillStyle = '#7a4a1e';
    g.beginPath();
    g.ellipse(0, -6, 58, 15, 0, Math.PI, 0);
    g.fill();
    const def = SAUSAGES[b.type];
    drawSausage(g, 0, -8, def.len * 0.42, 0, def, 1, 0, this.time, null);
    // Senf
    if (b.type !== 'gurke') {
      g.strokeStyle = '#f3c933';
      g.lineWidth = 3.5;
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const xx = -42 + i * 7;
        const yy = -12 + (i % 2 ? -5 : 2);
        if (i === 0) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.stroke();
    }
    // Brötchen vorn
    const bg = g.createLinearGradient(0, -6, 0, 18);
    bg.addColorStop(0, '#e9b56d');
    bg.addColorStop(1, '#a8652a');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 0, 60, 17, 0, 0, Math.PI);
    g.lineTo(-60, -2);
    g.closePath();
    g.fill();
    g.strokeStyle = '#5a3412';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
  }

  private drawSparks(g: CanvasRenderingContext2D): void {
    for (const p of this.sparks) {
      const a = 1 - p.t / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.7);
    }
    g.globalAlpha = 1;
  }

  private drawTexts(g: CanvasRenderingContext2D): void {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const f of this.texts) {
      const a = Math.min(1, (f.life - f.t) / 0.5);
      g.globalAlpha = a;
      g.font = `800 ${f.size}px "Barlow Condensed", sans-serif`;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(10,8,6,0.85)';
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.restore();
  }

  private drawBanner(g: CanvasRenderingContext2D): void {
    const b = this.banner;
    if (!b) return;
    const inK = Math.min(1, b.t / 0.25);
    const scale = 0.6 + 0.4 * (1 - Math.pow(1 - inK, 3)) + Math.sin(inK * Math.PI) * 0.12;
    const a = Math.min(1, (b.life - b.t) / 0.4);
    g.save();
    g.globalAlpha = a;
    g.translate(360, 330);
    g.scale(scale, scale);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'italic 800 64px "Barlow Condensed", sans-serif';
    g.lineJoin = 'round';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(10,8,6,0.9)';
    g.strokeText(b.text, 0, 0);
    g.fillStyle = b.color;
    g.fillText(b.text, 0, 0);
    if (b.sub) {
      g.font = '700 30px "Barlow Condensed", sans-serif';
      g.lineWidth = 7;
      g.strokeText(b.sub, 0, 48);
      g.fillStyle = '#fff4d8';
      g.fillText(b.sub, 0, 48);
    }
    g.restore();
  }

  // ------------------------------------------------------------------ statische Ebenen

  private layer(paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = CLAW_W * this.dpr;
    c.height = CLAW_H * this.dpr;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    paint(g);
    return c;
  }

  private makeSteamSprite(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,248,235,1)');
    grd.addColorStop(0.5, 'rgba(255,248,235,0.45)');
    grd.addColorStop(1, 'rgba(255,248,235,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return c;
  }

  private paintBackground(g: CanvasRenderingContext2D): void {
    // Wand
    const wall = g.createLinearGradient(0, 0, 0, COUNTER_Y);
    wall.addColorStop(0, '#15110d');
    wall.addColorStop(1, '#241c14');
    g.fillStyle = wall;
    g.fillRect(0, 0, CLAW_W, CLAW_H);
    // Fliesen
    g.strokeStyle = 'rgba(255,226,176,0.05)';
    g.lineWidth = 1;
    for (let y = 0; y < COUNTER_Y; y += 36) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(CLAW_W, y + 0.5);
      g.stroke();
      const off = (y / 36) % 2 ? 36 : 0;
      for (let x = off; x < CLAW_W; x += 72) {
        g.beginPath();
        g.moveTo(x + 0.5, y);
        g.lineTo(x + 0.5, y + 36);
        g.stroke();
      }
    }
    // Lampenlicht oben links
    const lamp = g.createRadialGradient(60, 30, 20, 60, 30, 620);
    lamp.addColorStop(0, 'rgba(255,214,150,0.22)');
    lamp.addColorStop(0.5, 'rgba(255,214,150,0.06)');
    lamp.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, CLAW_W, CLAW_H);
    // Schild-Hintergrund
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(g, 200, 14, 320, 66, 10);
    g.fill();
    g.strokeStyle = 'rgba(255,226,176,0.12)';
    g.lineWidth = 2;
    g.stroke();

    // Portal: Seitenschienen des Kranes
    const yTop = this.sy(Z_MIN, H_RAIL);
    const yBot = this.sy(Z_MAX, H_RAIL);
    for (const x of [30, 706]) {
      const rg = g.createLinearGradient(x - 6, 0, x + 6, 0);
      rg.addColorStop(0, '#3d2f19');
      rg.addColorStop(0.5, '#b39a62');
      rg.addColorStop(1, '#3d2f19');
      g.fillStyle = rg;
      g.fillRect(x - 6, yTop - 12, 12, yBot - yTop + 24);
      // Pfosten nach unten
      g.fillStyle = 'rgba(40,32,20,0.9)';
      g.fillRect(x - 3, yBot + 12, 6, COUNTER_Y - yBot - 12);
    }
    g.fillStyle = '#5a4728';
    g.fillRect(30, yTop - 14, 676, 6);

    // Theke
    const ct = g.createLinearGradient(0, COUNTER_Y - 6, 0, CLAW_H);
    ct.addColorStop(0, '#8d8778');
    ct.addColorStop(0.08, '#5a564c');
    ct.addColorStop(1, '#1d1b17');
    g.fillStyle = ct;
    g.fillRect(0, COUNTER_Y - 6, CLAW_W, CLAW_H - COUNTER_Y + 6);
    g.fillStyle = 'rgba(255,240,210,0.35)';
    g.fillRect(0, COUNTER_Y - 6, CLAW_W, 1.5);
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    for (let x = 0; x < CLAW_W; x += 5) {
      g.beginPath();
      g.moveTo(x, COUNTER_Y + 4);
      g.lineTo(x + 3, CLAW_H);
      g.stroke();
    }

    // Brenner
    g.fillStyle = '#0c0b09';
    g.beginPath();
    g.ellipse(POT_X, POT_BOTTOM + 34, 205, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2b2924';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(POT_X, POT_BOTTOM + 30, 190, 16, 0, 0, Math.PI * 2);
    g.stroke();
    // Topfschatten
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.ellipse(CH_X + 10, COUNTER_Y + 6, 70, 10, 0, 0, Math.PI * 2);
    g.fill();
  }

  private paintPotBack(g: CanvasRenderingContext2D): void {
    const ry = (r: number) => r * SQ;
    // Innenwand
    const inner = g.createLinearGradient(0, POT_Y - RIM_UP - ry(R), 0, POT_Y);
    inner.addColorStop(0, '#4a4f55');
    inner.addColorStop(1, '#16181b');
    g.fillStyle = inner;
    g.beginPath();
    g.ellipse(POT_X, POT_Y - RIM_UP, R + 4, ry(R + 4), 0, 0, Math.PI * 2);
    g.fill();
    // Rand komplett
    this.rimRing(g, 0, Math.PI * 2);
  }

  private rimRing(g: CanvasRenderingContext2D, a0: number, a1: number): void {
    const cy = POT_Y - RIM_UP;
    const ro = R + 18;
    const ri = R + 4;
    const grd = g.createLinearGradient(POT_X - ro, 0, POT_X + ro, 0);
    grd.addColorStop(0, '#3a3e43');
    grd.addColorStop(0.22, '#e1e3e2');
    grd.addColorStop(0.45, '#8b9095');
    grd.addColorStop(0.8, '#5d6267');
    grd.addColorStop(1, '#25282b');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(POT_X, cy, ro, ro * SQ, 0, a0, a1, false);
    g.ellipse(POT_X, cy, ri, ri * SQ, 0, a1, a0, true);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(POT_X, cy - 1, ro - 2, (ro - 2) * SQ, 0, a0, a1, false);
    g.stroke();
  }

  private paintPotFront(g: CanvasRenderingContext2D): void {
    const cy = POT_Y - RIM_UP;
    const ro = R + 18;
    // Henkel
    for (const side of [-1, 1]) {
      const hx = POT_X + side * (ro + 6);
      g.strokeStyle = '#14110d';
      g.lineWidth = 13;
      g.beginPath();
      g.ellipse(
        hx,
        cy + 36,
        22,
        14,
        0,
        side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        side < 0 ? Math.PI * 1.5 : Math.PI * 0.5,
      );
      g.stroke();
      g.strokeStyle = side < 0 ? '#a7abaf' : '#4c5156';
      g.lineWidth = 8;
      g.stroke();
    }
    // Koerper
    const body = g.createLinearGradient(POT_X - ro, 0, POT_X + ro, 0);
    body.addColorStop(0, '#1d1f22');
    body.addColorStop(0.12, '#5a5f64');
    body.addColorStop(0.27, '#d4d6d5');
    body.addColorStop(0.34, '#9a9fa3');
    body.addColorStop(0.62, '#565b60');
    body.addColorStop(0.88, '#2f3236');
    body.addColorStop(1, '#141618');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(POT_X - ro, cy);
    g.lineTo(POT_X - R + 4, POT_BOTTOM);
    g.ellipse(POT_X, POT_BOTTOM, R - 4, 28, 0, Math.PI, 0, true);
    g.lineTo(POT_X + ro, cy);
    g.ellipse(POT_X, cy, ro, ro * SQ, 0, 0, Math.PI, false);
    g.closePath();
    g.fill();
    // warmer Flammenschein unten
    const warm = g.createLinearGradient(0, POT_BOTTOM - 60, 0, POT_BOTTOM + 28);
    warm.addColorStop(0, 'rgba(255,140,60,0)');
    warm.addColorStop(1, 'rgba(255,140,60,0.28)');
    g.fillStyle = warm;
    g.fill();
    // Lampenreflex links, Lichtkante
    g.strokeStyle = 'rgba(255,240,215,0.25)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(POT_X - ro * 0.52, cy + ro * SQ * 0.86 + 6);
    g.lineTo(POT_X - R * 0.5, POT_BOTTOM + 22);
    g.stroke();
    // Wurst-Aufkleber
    g.save();
    g.translate(POT_X, cy + 140);
    g.fillStyle = 'rgba(20,17,13,0.55)';
    roundRect(g, -88, -22, 176, 44, 8);
    g.fill();
    g.strokeStyle = 'rgba(255,226,176,0.35)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(255,226,176,0.85)';
    g.font = '700 15px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BRÜHWURST · 78 °C', 0, -6);
    g.font = '500 11px "IBM Plex Mono", monospace';
    g.fillStyle = 'rgba(217,207,182,0.7)';
    g.fillText('NICHT KOCHEN LASSEN', 0, 11);
    g.restore();
    // vorderer Rand
    this.rimRing(g, 0, Math.PI);
  }

  private paintChuteBack(g: CanvasRenderingContext2D): void {
    // Oeffnung des Schachts (dunkel)
    const grd = g.createLinearGradient(0, CH_SY - CH_R * SQ, 0, CH_SY + CH_R * SQ);
    grd.addColorStop(0, '#050403');
    grd.addColorStop(1, '#2a261f');
    g.fillStyle = '#8b8574';
    g.beginPath();
    g.ellipse(CH_X, CH_SY, CH_R + 8, (CH_R + 8) * SQ, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(CH_X, CH_SY, CH_R, CH_R * SQ, 0, 0, Math.PI * 2);
    g.fill();
  }

  private paintChuteFront(g: CanvasRenderingContext2D): void {
    const x0 = CH_X - CH_R - 8;
    const x1 = CH_X + CH_R + 8;
    const top = CH_SY;
    const body = g.createLinearGradient(x0, 0, x1, 0);
    body.addColorStop(0, '#2a2620');
    body.addColorStop(0.25, '#a9a38f');
    body.addColorStop(0.5, '#6f6a5c');
    body.addColorStop(1, '#1e1c18');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(x0, top);
    g.lineTo(x0, COUNTER_Y);
    g.lineTo(x1, COUNTER_Y);
    g.lineTo(x1, top);
    g.ellipse(CH_X, CH_SY, CH_R + 8, (CH_R + 8) * SQ, 0, 0, Math.PI, false);
    g.closePath();
    g.fill();
    g.strokeStyle = '#0d0c0a';
    g.lineWidth = 2;
    g.stroke();
    // Lippe vorn
    g.strokeStyle = 'rgba(255,248,232,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(CH_X, CH_SY, CH_R + 6, (CH_R + 6) * SQ, 0, 0.15, Math.PI - 0.15, false);
    g.stroke();
    // Beschriftung
    g.fillStyle = '#14110d';
    roundRect(g, CH_X - 44, top + 38, 88, 22, 4);
    g.fill();
    g.fillStyle = '#ffe2b0';
    g.font = '700 14px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('▼ AUSGABE ▼', CH_X, top + 49);
    // Klappe
    g.fillStyle = '#0a0908';
    roundRect(g, CH_X - 48, 716, 96, 60, 8);
    g.fill();
    g.strokeStyle = 'rgba(255,226,176,0.18)';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(255,226,176,0.08)';
    g.fillRect(CH_X - 44, 720, 88, 4);
  }

  private paintVignette(g: CanvasRenderingContext2D): void {
    const v = g.createRadialGradient(
      CLAW_W * 0.45,
      CLAW_H * 0.48,
      200,
      CLAW_W * 0.5,
      CLAW_H * 0.5,
      620,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, CLAW_W, CLAW_H);
  }
}

// ------------------------------------------------------------------ Wurst zeichnen

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Wurst als gebogene Kapsel mit Licht/Schatten-Lagen.
 * (cx, cy) Mitte, (hx, hy) halbe Achse auf dem Bildschirm, tint = Hoehe ueber dem Wasser
 * (Unterwasseranteil wird mit Wasserfarbe ueberzogen) oder null.
 */
export function drawSausage(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  def: SausageDef,
  bendSign: number,
  squash: number,
  time: number,
  tint: number | null,
): void {
  const r = def.rad * (1 + squash * 0.12 * Math.sin(time * 32));
  let hl = Math.hypot(hx, hy);
  if (hl < 0.5) {
    hx = 0.5;
    hy = 0;
    hl = 0.5;
  }
  // Normale nach oben
  let nx = -hy / hl;
  let ny = hx / hl;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bend = r * 0.5 * bendSign * (1 + squash * 0.4 * Math.sin(time * 24)) * Math.min(1, hl / 30);
  const p0x = cx - hx;
  const p0y = cy - hy;
  const p1x = cx + hx;
  const p1y = cy + hy;
  const cpx = cx + nx * bend * 2;
  const cpy = cy + ny * bend * 2;
  const at = (u: number): [number, number] => {
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const c = u * u;
    return [a * p0x + b * cpx + c * p1x, a * p0y + b * cpy + c * p1y];
  };
  const spine = (ox: number, oy: number, shrink: number) => {
    const s0 = (1 - shrink) / 2;
    const s1 = 1 - s0;
    const q0 = at(s0);
    const q1 = at(s1);
    // Kontrollpunkt fuer Teilkurve: naeherungsweise
    const qm = at(0.5);
    const qcx = 2 * qm[0] - (q0[0] + q1[0]) / 2;
    const qcy = 2 * qm[1] - (q0[1] + q1[1]) / 2;
    g.beginPath();
    g.moveTo(q0[0] + ox, q0[1] + oy);
    g.quadraticCurveTo(qcx + ox, qcy + oy, q1[0] + ox, q1[1] + oy);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';

  if (def.type === 'gold') {
    const glow = g.createRadialGradient(cx, cy, 2, cx, cy, hl + r * 3);
    glow.addColorStop(0, `rgba(255,215,94,${0.3 + Math.sin(time * 4) * 0.08})`);
    glow.addColorStop(1, 'rgba(255,215,94,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, hl + r * 3, 0, Math.PI * 2);
    g.fill();
  }

  spine(0, 0, 1);
  g.strokeStyle = def.outline;
  g.lineWidth = r * 2 + 3;
  g.stroke();
  g.strokeStyle = def.base;
  g.lineWidth = r * 2;
  g.stroke();
  // Schatten unten
  g.globalAlpha *= 0.6;
  spine(-nx * r * 0.42, -ny * r * 0.42, 0.96);
  g.strokeStyle = def.dark;
  g.lineWidth = r * 1.0;
  g.stroke();
  g.globalAlpha /= 0.6;
  // Licht oben
  spine(nx * r * 0.36, ny * r * 0.36, 0.9);
  g.strokeStyle = def.light;
  g.lineWidth = r * 0.72;
  g.stroke();
  spine(nx * r * 0.56, ny * r * 0.56, 0.62);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = Math.max(1, r * 0.2);
  g.stroke();

  // Sorten-Details
  if (def.type === 'bratwurst') {
    g.strokeStyle = 'rgba(60,28,10,0.75)';
    g.lineWidth = 2.6;
    for (let i = 0; i < 4; i++) {
      const u = 0.22 + i * 0.19;
      const [px, py] = at(u);
      const tx = hx / hl;
      const ty = hy / hl;
      g.beginPath();
      g.moveTo(px + nx * r * 0.7 - tx * 3, py + ny * r * 0.7 - ty * 3);
      g.lineTo(px - nx * r * 0.5 + tx * 4, py - ny * r * 0.5 + ty * 4);
      g.stroke();
    }
    for (const u of [0, 1]) {
      const [px, py] = at(u);
      const tx = (hx / hl) * (u ? 1 : -1);
      const ty = (hy / hl) * (u ? 1 : -1);
      g.fillStyle = def.outline;
      g.beginPath();
      g.arc(px + tx * r * 0.95, py + ty * r * 0.95, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  } else if (def.type === 'kaese') {
    const spots = [0.16, 0.3, 0.42, 0.55, 0.68, 0.8, 0.9];
    spots.forEach((u, i) => {
      const [px, py] = at(u);
      const off = (i % 3) - 1;
      const sx = px + nx * r * 0.4 * off;
      const sy = py + ny * r * 0.4 * off;
      g.fillStyle = '#f6d667';
      g.beginPath();
      g.ellipse(sx, sy, r * 0.22, r * 0.16, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,250,215,0.8)';
      g.beginPath();
      g.arc(sx - 0.6, sy - 0.6, r * 0.07, 0, Math.PI * 2);
      g.fill();
    });
  } else if (def.type === 'gurke') {
    for (let i = 0; i < 9; i++) {
      const u = 0.12 + i * 0.095;
      const [px, py] = at(u);
      const off = ((i * 7) % 5) / 2 - 1;
      g.fillStyle = i % 2 ? 'rgba(190,225,120,0.75)' : 'rgba(25,45,10,0.6)';
      g.beginPath();
      g.arc(px + nx * r * 0.55 * off, py + ny * r * 0.55 * off, r * 0.11, 0, Math.PI * 2);
      g.fill();
    }
    const [ex, ey] = at(1);
    g.fillStyle = '#7b6a2a';
    g.beginPath();
    g.arc(ex + (hx / hl) * r * 0.9, ey + (hy / hl) * r * 0.9, 3, 0, Math.PI * 2);
    g.fill();
  } else if (def.type === 'gold') {
    const k = (time * 0.6) % 1;
    const [px, py] = at(0.15 + k * 0.7);
    const sx = px + nx * r * 0.4;
    const sy = py + ny * r * 0.4;
    const s = 5 + Math.sin(time * 9) * 2;
    g.fillStyle = 'rgba(255,255,240,0.95)';
    g.beginPath();
    g.moveTo(sx, sy - s * 1.6);
    g.lineTo(sx + s * 0.35, sy - s * 0.35);
    g.lineTo(sx + s * 1.6, sy);
    g.lineTo(sx + s * 0.35, sy + s * 0.35);
    g.lineTo(sx, sy + s * 1.6);
    g.lineTo(sx - s * 0.35, sy + s * 0.35);
    g.lineTo(sx - s * 1.6, sy);
    g.lineTo(sx - s * 0.35, sy - s * 0.35);
    g.closePath();
    g.fill();
  } else {
    // Wiener: Abbindestellen
    for (const u of [0, 1]) {
      const [px, py] = at(u);
      const tx = (hx / hl) * (u ? 1 : -1);
      const ty = (hy / hl) * (u ? 1 : -1);
      g.fillStyle = def.dark;
      g.beginPath();
      g.arc(px + tx * r * 0.8, py + ty * r * 0.8, r * 0.32, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Unterwasseranteil
  if (tint !== null && tint < r) {
    const deep = clamp(-tint / r - 0.6, 0, 1);
    g.fillStyle = WATER;
    g.globalAlpha *= 0.58 + deep * 0.35;
    g.beginPath();
    const n = Math.max(6, Math.ceil((hl * 2) / (r * 0.5)));
    const rr = r + 2;
    for (let i = 0; i <= n; i++) {
      const [px, py] = at(i / n);
      if (tint <= -rr) {
        g.moveTo(px + rr, py);
        g.arc(px, py, rr, 0, Math.PI * 2);
      } else {
        const th = Math.acos(clamp(tint / rr, -1, 1));
        const a0 = Math.PI / 2 - th;
        const a1 = Math.PI / 2 + th;
        g.moveTo(px + Math.cos(a0) * rr, py + Math.sin(a0) * rr);
        g.arc(px, py, rr, a0, a1);
        g.closePath();
      }
    }
    g.fill();
    g.globalAlpha /= 0.58 + deep * 0.35;
  }
}
