import * as THREE from 'three';
import { IntroSound } from './intro-sound';
import { DeckRelief } from '../deck3d/deck-relief';
import { DeckScene, LampInfo, LocalPoint, OrbitPose, lerpPose } from '../deck3d/deck-scene';
import { makeDustSprite } from '../deck3d/deck-textures';
import {
  clamp01,
  easeInOutCubic,
  easeInOutSine,
  easeOutCubic,
  easeOutQuart,
  lerp,
  rand,
  seg,
} from '../deck3d/deck-util';

/**
 * 3D-Intro „Drop“: Das Gerät fällt aus dem Dunkel auf den Tisch, schaltet sich ein, die Kamera
 * umkreist es flach und steigt dann senkrecht darüber – dort geht die 3D-Szene nahtlos in die
 * echte Oberfläche über (siehe {@link DeckScene}: die Oberseite ist von Anfang an das echte DOM).
 *
 * Dieses Modul enthält nur den Ablauf (Zeitplan, Flugbahn, Kamera, Einschalt-Licht, Staub, Ton);
 * Szene und Tasten-Relief teilt es sich mit der 3D-Ansicht (components/deck3d).
 */

// Zeitplan (Sekunden)
const T_IMPACT = 2.0; // langsamer Anflug: das 3D soll man wahrnehmen
const T_LIGHT0 = 2.2;
const LIGHT_SPAN = 0.85;
const LIGHT_RAMP = 0.16;
const T_CAM0 = 2.8; // bis hier flache Fahrt ums Gerät, dann Aufstieg
const T_CAM1 = 5.05;
const T_SHADE0 = 3.9;
const T_SHADE1 = 4.9;
const T_RAISE0 = 4.1;
const T_RAISE1 = 4.92;
const T_XFADE0 = 4.95;
const T_XFADE1 = 5.4;
/** Ende, wenn das Intro in der 3D-Ansicht stehen bleibt */
const T_END_3D = T_CAM1 + 0.1;

const FOV0 = 34;
const POLAR0 = THREE.MathUtils.degToRad(61);
const AZ0 = -0.4;

interface Lightable {
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** sichtbarer Ausschnitt (Scroll-Container), sonst null */
  clip: { x: number; y: number; w: number; h: number } | null;
  glow: string; // "r,g,b"
  start: number;
}

interface Dust {
  p: THREE.Vector3;
  v: THREE.Vector3;
  size: number;
  grow: number;
  life: number;
  age: number;
  a: number;
  grav: number;
}

/** Staubkorn, das im Lichtkegel der Lampe schwebt */
interface Mote {
  p: THREE.Vector3;
  v: THREE.Vector3;
  size: number;
  a: number;
  ph: number;
}

export interface IntroCallbacks {
  onStarted: () => void;
  onDone: () => void;
  /** Intro endet in der 3D-Ansicht: Szene und Relief gehen an die Ansicht über */
  onHandover3d?: (scene: DeckScene, relief: DeckRelief) => void;
}

export interface IntroOptions {
  /** nicht in die flache Oberfläche übergehen, sondern in der 3D-Ansicht stehen bleiben */
  endIn3d: boolean;
  /** schon angelegter (ggf. per Einschalt-Taste freigegebener) Ton */
  sound?: IntroSound | null;
}

export class IntroEngine {
  private readonly vw = window.innerWidth;
  private readonly vh = window.innerHeight;
  private readonly small = this.vw < 700;
  private readonly endIn3d: boolean;

  private scene!: DeckScene;
  private relief!: DeckRelief;
  private poseEnd!: OrbitPose;

  private shade!: HTMLCanvasElement;
  private glow!: HTMLCanvasElement;
  private dustCanvas!: HTMLCanvasElement;
  private catcher!: HTMLDivElement;
  private shadeCtx!: CanvasRenderingContext2D;
  private glowCtx!: CanvasRenderingContext2D;
  private dustCtx!: CanvasRenderingContext2D;
  private dustSprite!: HTMLCanvasElement;
  private readonly q = this.small ? 0.6 : 0.5; // Auflösung der Licht-Overlays
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);

  private lightables: Lightable[] = [];
  private lastLightScan = -1;
  private dust: Dust[] = [];
  private motes: Mote[] = [];
  private impactDone = false;

  private sound: IntroSound | null = null;
  private soundScheduled = false;

  private t = 0;
  private clockRunning = false;
  private last = 0;
  private raf = 0;
  private finishing = false;
  private handedOver = false;
  private disposed = false;

  private readonly cam: LocalPoint = { u: 0, v: 0, n: 0 };
  private readonly lamp: LampInfo = { u: 0, v: 0, n: 0, au: 0, av: 0, radius: 1, cos: 1 };
  private readonly v3 = new THREE.Vector3();

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.skip();
  };
  /** Echte Größenänderung → überspringen (Mobile-Adressleiste ignorieren). */
  private readonly onResize = () => {
    if (window.innerWidth !== this.vw || Math.abs(window.innerHeight - this.vh) > 150) {
      this.skip();
    }
  };

  constructor(
    private readonly device: HTMLElement,
    private readonly cb: IntroCallbacks,
    opts: IntroOptions = { endIn3d: false },
  ) {
    this.endIn3d = opts.endIn3d && !!cb.onHandover3d;
    this.presetSound = opts.sound ?? null;
  }

  private readonly presetSound: IntroSound | null;

  // ------------------------------------------------------------------ Aufbau

  start(): void {
    try {
      this.scene = new DeckScene(this.device, this.small);
      this.relief = new DeckRelief(this.device);
      this.poseEnd = this.endIn3d ? this.scene.viewPose() : this.scene.topPose();
      this.buildOverlays();
      this.spawnMotes();
    } catch (err) {
      console.warn('[Intro] Setup fehlgeschlagen:', err);
      this.finishNow();
      return;
    }
    try {
      this.sound = this.presetSound ?? new IntroSound();
    } catch {
      this.sound = null;
    }

    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);

    // Erstes Bild vorbereiten (Shader kompilieren), dann sichtbar schalten
    this.update(0);
    this.scene.warmUp();
    document.documentElement.classList.remove('nb-intro-wait');
    this.cb.onStarted();

    // Debug/Screenshots: localStorage 'nervbox-intro-debug-t' = Sekunde → Standbild
    const freeze = parseFloat(readDebugT() ?? '');
    if (!Number.isNaN(freeze)) {
      while (this.t < freeze) {
        const dt = Math.min(1 / 60, freeze - this.t);
        this.t += dt;
        this.update(dt);
      }
      this.scene.render();
      return;
    }

    // Uhr erst starten, wenn der Browser das Gerät einmal gemalt hat
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.disposed || this.finishing) return;
        this.last = performance.now();
        this.clockRunning = true;
        this.raf = requestAnimationFrame(this.frame);
      });
    });
  }

  private buildOverlays(): void {
    const { width, height } = this.scene.rect;
    const mk = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(w));
      c.height = Math.max(2, Math.round(h));
      c.setAttribute('aria-hidden', 'true');
      return c;
    };
    const devStyle = (c: HTMLCanvasElement, blend: string, z: number) =>
      Object.assign(c.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${width}px`,
        height: `${height}px`,
        zIndex: String(z),
        pointerEvents: 'none',
        borderRadius: 'inherit',
        mixBlendMode: blend,
      } as Partial<CSSStyleDeclaration>);

    const w = width * this.q;
    const h = height * this.q;
    this.shade = mk(w, h);
    devStyle(this.shade, 'normal', 60);
    this.glow = mk(w, h);
    devStyle(this.glow, 'screen', 61);
    this.device.appendChild(this.shade);
    this.device.appendChild(this.glow);
    this.shadeCtx = this.shade.getContext('2d')!;
    this.glowCtx = this.glow.getContext('2d')!;

    this.dustCanvas = mk(this.vw * this.dpr, this.vh * this.dpr);
    Object.assign(this.dustCanvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '9998',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.dustCanvas);
    this.dustCtx = this.dustCanvas.getContext('2d')!;
    this.dustSprite = makeDustSprite();

    this.catcher = document.createElement('div');
    this.catcher.title = 'Intro überspringen';
    Object.assign(this.catcher.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      cursor: 'pointer',
      background: 'transparent',
      touchAction: 'none',
    } as Partial<CSSStyleDeclaration>);
    this.catcher.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound?.unlock();
      this.skip();
    });
    document.body.appendChild(this.catcher);
  }

  // ------------------------------------------------------------------ Schleife

  private readonly frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.066, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.update(dt);
    this.scene.render();
    if (!this.finishing) {
      if (this.endIn3d && this.t >= T_END_3D) {
        this.handover3d();
        return;
      }
      if (!this.endIn3d && this.t >= T_XFADE1 + 0.05) {
        this.handover();
        return;
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const t = this.t;
    const scene = this.scene;
    // Sound erst planen, wenn die Uhr wirklich läuft (sonst kommt der Aufprall
    // um die Dauer des ersten Malens zu früh)
    if (this.sound && this.clockRunning && !this.soundScheduled && t >= -0.05) {
      this.soundScheduled = true;
      this.sound.whoosh(T_IMPACT - t - 0.55, 0.55);
      this.sound.impact(T_IMPACT - t);
    }

    const lamp = this.lampLevel(t);
    scene.setLamp(lamp, lamp * (1 - seg(t, T_CAM0 + 0.3, T_SHADE1 - 0.2)));
    scene.setPower(easeInOutSine(seg(t, T_LIGHT0 - 0.05, T_LIGHT0 + 0.35)));

    this.updateDevice(t);
    // Schatten: je höher das Gerät, desto weicher und blasser
    const hAbove = Math.max(0, scene.deviceGroup.position.y - scene.rest.y);
    scene.setShadowNear(clamp01(1 - hAbove / 3.5));
    this.updateCamera(t);
    scene.applyCssMatrix();

    // Tasten-Relief: sinkt vor der Übergabe auf 0 (in der 3D-Ansicht bleibt es stehen)
    scene.cameraLocal(this.cam);
    scene.lampLocal(this.lamp);
    const k = this.endIn3d ? 1 : 1 - easeInOutSine(seg(t, T_RAISE0, T_RAISE1));
    this.relief.setView({
      cu: this.cam.u,
      cv: this.cam.v,
      cn: this.cam.n,
      lu: this.lamp.u,
      lv: this.lamp.v,
      ln: this.lamp.n,
      k,
      sheen: clamp01(lamp) * clamp01(this.lamp.cos * 1.3),
    });

    if (!this.impactDone && t >= T_IMPACT) {
      this.impactDone = true;
      this.spawnDust();
      this.kickMotes();
    }
    this.drawShade(t, lamp);
    this.drawGlow(t);
    this.updateDust(dt, lamp);

    // Übergabe: 3D-Hintergrund blendet aus, echter Schreibtisch erscheint
    if (!this.endIn3d && t >= T_XFADE0 && scene.canvas.style.opacity !== '0') {
      scene.canvas.style.transition = scene.canvas.style.transition || 'opacity 0.44s ease';
      scene.canvas.style.opacity = '0';
      const root = document.documentElement.classList;
      root.add('nb-intro-handover');
      root.remove('nb-intro');
    }
  }

  private lampLevel(t: number): number {
    if (t < 0.04) return 0;
    if (t < 0.08) return 0.75;
    if (t < 0.15) return 0.06;
    if (t < 0.19) return 0.9;
    if (t < 0.25) return 0.25;
    let l = 0.55 + 0.45 * easeOutCubic(seg(t, 0.25, 0.48));
    if (t > T_IMPACT) {
      const k = t - T_IMPACT;
      l *= 1 - 0.32 * Math.exp(-k * 9) * Math.abs(Math.sin(k * 55));
    }
    return l;
  }

  private updateDevice(t: number): void {
    const scene = this.scene;
    const g = scene.deviceGroup;
    const rest = scene.rest;
    const span = Math.max(scene.DW, scene.DH);
    if (t < T_IMPACT) {
      const u = seg(t, 0, T_IMPACT);
      const hz = easeOutQuart(u);
      const portrait = this.vw < this.vh;
      const offX = portrait ? span * 0.12 + 0.8 : span * 0.45 + 3.5;
      const offZ = portrait ? -(span * 0.5 + 3) : -(span * 0.45 + 3);
      // Hoch hinten oben starten (außerhalb des Bilds), dann Bogen + freier Fall
      // (zum Schluss beschleunigt: das Gerät setzt nicht auf, es schlägt auf)
      const fall =
        (span * 0.06 + 2.1) * (1 - Math.pow(u, 3.4)) + (span * 0.5 + 7) * Math.pow(1 - u, 4);
      g.position.set(rest.x + offX * (1 - hz), rest.y + fall, rest.z + offZ * (1 - hz));
      const r = easeOutCubic(u);
      g.rotation.set(
        lerp(0.42, 0.012, r), // Oberseite zur Kamera geneigt
        lerp(portrait ? 1.3 : 2.35, 0, r),
        lerp(-0.3, 0.035, easeOutCubic(Math.min(1, u * 1.1))),
        'XZY',
      );
    } else {
      // Aufprall: kurzer Hüpfer, Kippeln, Setzen
      const k = t - T_IMPACT;
      const bounce = 0.075 * Math.exp(-k * 10) * Math.abs(Math.sin(k * 24));
      g.position.set(rest.x, rest.y + bounce, rest.z);
      const damp = Math.exp(-k * 11);
      g.rotation.set(0.012 * damp * Math.cos(k * 31), 0, 0.035 * damp * Math.cos(k * 27), 'XZY');
    }
  }

  private updateCamera(t: number): void {
    const scene = this.scene;
    const cam = scene.camera;
    const portrait = this.vw < this.vh;
    const p = easeInOutCubic(seg(t, T_CAM0, T_CAM1));
    const pPolar = easeInOutSine(seg(t, T_CAM0, T_CAM1 - 0.08));
    // Flache, nahe Einstellung: leichter Push-in beim Anflug, langsame Fahrt ums Gerät
    const push = lerp(
      portrait ? 2.5 : 1.7,
      portrait ? 1.65 : 1.2,
      easeOutCubic(seg(t, 0, T_CAM0 + 0.2)),
    );
    const hero: OrbitPose = {
      fov: FOV0,
      polar: lerp(POLAR0 + 0.04, POLAR0 - 0.07, easeInOutSine(seg(t, 0.3, T_CAM0 + 0.7))),
      az: lerp(AZ0, AZ0 * 0.3, easeInOutSine(seg(t, 0.2, T_CAM0 + 0.6))),
      hh: (scene.viewH / 2) * push,
      tx: scene.rest.x * 0.9,
      // Querformat: die Kamera schwenkt mit dem fallenden Gerät nach unten
      tz:
        scene.rest.z +
        scene.DH *
          (portrait ? 0.04 : lerp(-0.14, 0.2, easeInOutSine(seg(t, 0.1, T_IMPACT + 0.25)))),
    };
    const pose = lerpPose(hero, this.poseEnd, p, pPolar);
    scene.setPose(pose);

    // Kamerawackler beim Aufprall
    if (t > T_IMPACT && t < T_IMPACT + 0.6) {
      const k2 = t - T_IMPACT;
      const dist = pose.hh / Math.tan(THREE.MathUtils.degToRad(pose.fov / 2));
      const amp = 0.11 * Math.exp(-k2 * 11) * (dist / 12);
      cam.position.x += amp * Math.sin(k2 * 71);
      cam.position.y += amp * 1.4 * Math.sin(k2 * 93 + 1.3);
      cam.position.z += amp * 0.6 * Math.sin(k2 * 57 + 0.4);
      cam.rotation.z += 0.012 * Math.exp(-k2 * 11) * Math.sin(k2 * 63);
    }
  }

  // ------------------------------------------------------------------ Licht-Overlays

  /** Elemente, die beim Einschalten nacheinander aufleuchten (Lage im unverzerrten Layout). */
  private scanLightables(): void {
    const sel =
      '.nk-pad, .nk-key, .nk-lcd, .nk-counter, .nk-tag, .nk-channel, .nk-logo, .nk-input, .nk-tabs__tab, .nk-printer, .avatar-initials';
    const dev = this.device;
    const els = Array.from(dev.querySelectorAll<HTMLElement>(sel));
    const { width: W, height: H } = this.scene.rect;
    const known = new Map(this.lightables.map((l) => [l.el, l]));
    const out: Lightable[] = [];
    const prevT = dev.style.transform;
    dev.style.transform = 'none';
    const dr = dev.getBoundingClientRect();
    const clips = new Map<Element, DOMRect>();
    for (const el of els) {
      if (el === this.shade || el === this.glow) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 6 || b.height < 6) continue;
      const off = this.relief.offsetOf(el);
      const x = b.left - dr.left - (off?.ox ?? 0);
      const y = b.top - dr.top - (off?.oy ?? 0);
      if (x > W || y > H || x + b.width < 0 || y + b.height < 0) continue;
      let clip: Lightable['clip'] = null;
      const sc = el.parentElement?.closest('.grid-scroll, .chat-scroll, .nk-rail');
      if (sc) {
        let cr = clips.get(sc);
        if (!cr) {
          cr = sc.getBoundingClientRect();
          clips.set(sc, cr);
        }
        if (b.bottom < cr.top || b.top > cr.bottom || b.right < cr.left || b.left > cr.right) {
          continue;
        }
        clip = { x: cr.left - dr.left, y: cr.top - dr.top, w: cr.width, h: cr.height };
      }
      const r = { x, y, w: b.width, h: b.height };
      const prev = known.get(el);
      if (prev) {
        Object.assign(prev, r);
        prev.clip = clip;
        out.push(prev);
        continue;
      }
      const cs = getComputedStyle(el);
      let glow = cs.getPropertyValue('--nk-key-glow').trim();
      if (!glow) {
        glow =
          el.classList.contains('nk-lcd') || el.classList.contains('nk-counter')
            ? '196 236 120'
            : '255 214 160';
      }
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const order = (cx / W) * 0.55 + (cy / H) * 0.45;
      const rawRad = cs.borderTopLeftRadius;
      const rad = rawRad.includes('%')
        ? (Math.min(r.w, r.h) * (parseFloat(rawRad) || 0)) / 100
        : parseFloat(rawRad) || 4;
      out.push({
        el,
        ...r,
        clip,
        r: Math.min(rad, r.w / 2, r.h / 2),
        glow: glow.replace(/,/g, ' ').split(/\s+/).join(','),
        start: T_LIGHT0 + order * LIGHT_SPAN + (Math.random() - 0.5) * 0.05,
      });
    }
    dev.style.transform = prevT;
    this.lightables = out;
  }

  /** Pfad eines (ggf. angehobenen und beschnittenen) Elements */
  private lightPath(ctx: CanvasRenderingContext2D, l: Lightable): void {
    const off = this.relief.offsetOf(l.el);
    let x = l.x + (off?.ox ?? 0);
    let y = l.y + (off?.oy ?? 0);
    let w = l.w;
    let h = l.h;
    let r = l.r;
    const c = l.clip;
    if (c) {
      const x1 = Math.min(x + w, c.x + c.w);
      const y1 = Math.min(y + h, c.y + c.h);
      const nx = Math.max(x, c.x);
      const ny = Math.max(y, c.y);
      if (nx !== x || ny !== y || x1 !== x + w || y1 !== y + h) r = Math.min(r, 2);
      x = nx;
      y = ny;
      w = Math.max(0, x1 - nx);
      h = Math.max(0, y1 - ny);
    }
    ctx.beginPath();
    if (w > 0 && h > 0) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }

  /** Ausgeschaltetes Gerät im Licht der Lampe; eingeschaltete Elemente stanzen das „Aus“ weg. */
  private drawShade(t: number, lampLevel: number): void {
    const ctx = this.shadeCtx;
    const q = this.q;
    const { width: W, height: H } = this.scene.rect;
    const fadeOut = easeInOutSine(seg(t, T_SHADE0, T_SHADE1));
    this.shade.style.opacity = String(1 - fadeOut);
    this.glow.style.opacity = String(1 - fadeOut);
    if (fadeOut >= 1) return;

    if (t >= T_LIGHT0 - 0.1 && t - this.lastLightScan > 0.15 && t < T_SHADE1) {
      this.lastLightScan = t;
      this.scanLightables();
    }

    ctx.setTransform(q, 0, 0, q, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Lichtfleck der Lampe dort, wo ihre Achse die Oberseite trifft – dreht sich das Gerät im
    // Flug von der Lampe weg, wird die Oberseite dunkel wie das 3D-Gehäuse
    const lamp = this.lamp;
    const lit = clamp01(lampLevel) * clamp01(lamp.cos * 1.25);
    const rad = Math.max(lamp.radius * 1.2, Math.hypot(W, H) * 0.5);
    const grad = ctx.createRadialGradient(lamp.au, lamp.av, 0, lamp.au, lamp.av, rad);
    const inner = 1 - (1 - 0.5) * lit;
    const outer = 1 - (1 - 0.86) * lit;
    grad.addColorStop(0, `rgba(3,2,1,${inner.toFixed(3)})`);
    grad.addColorStop(0.6, `rgba(3,2,1,${lerp(inner, outer, 0.55).toFixed(3)})`);
    grad.addColorStop(1, `rgba(3,2,1,${outer.toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Eingeschaltete Elemente stanzen das "Aus" weg
    ctx.globalCompositeOperation = 'destination-out';
    for (const l of this.lightables) {
      const p = seg(t, l.start, l.start + LIGHT_RAMP);
      if (p <= 0) continue;
      ctx.globalAlpha = easeOutCubic(p);
      this.lightPath(ctx, l);
      ctx.fill();
    }
    // Gehäuse selbst wird mit der Hintergrundbeleuchtung heller
    const plate = seg(t, T_LIGHT0 + 0.2, T_LIGHT0 + LIGHT_SPAN + 0.3);
    if (plate > 0) {
      ctx.globalAlpha = easeInOutSine(plate) * 0.55;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Aufleuchten: kurzer Überstrahler in Pad-Farbe (Bloom-Ersatz) */
  private drawGlow(t: number): void {
    const ctx = this.glowCtx;
    const q = this.q;
    const { width: W, height: H } = this.scene.rect;
    ctx.setTransform(q, 0, 0, q, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (t >= T_SHADE1) return;
    for (const l of this.lightables) {
      const k = t - l.start;
      if (k <= 0 || k > 0.75) continue;
      const a = k < 0.07 ? k / 0.07 : Math.exp(-(k - 0.07) * 5.2);
      if (a < 0.01) continue;
      ctx.shadowColor = `rgba(${l.glow},${(0.9 * a).toFixed(3)})`;
      ctx.shadowBlur = 26 * q;
      ctx.fillStyle = `rgba(${l.glow},${(0.32 * a).toFixed(3)})`;
      this.lightPath(ctx, l);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // ------------------------------------------------------------------ Staub

  /** Staubkörner, die im Lichtkegel schweben */
  private spawnMotes(): void {
    const scene = this.scene;
    const rnd = rand(41);
    const span = Math.max(scene.DW, scene.DH);
    const n = this.small ? 30 : 70;
    for (let i = 0; i < n; i++) {
      this.motes.push({
        p: new THREE.Vector3(
          scene.rest.x + (rnd() - 0.5) * span * 1.5,
          scene.topY + 0.4 + rnd() * span * 0.55,
          scene.rest.z + (rnd() - 0.35) * span * 1.3,
        ),
        v: new THREE.Vector3((rnd() - 0.5) * 0.12, (rnd() - 0.6) * 0.07, (rnd() - 0.5) * 0.12),
        size: 0.012 + rnd() * 0.022,
        a: 0.25 + rnd() * 0.55,
        ph: rnd() * 6.28,
      });
    }
  }

  /** Aufprall: Luftstoß wirbelt die schwebenden Körner auf */
  private kickMotes(): void {
    const rest = this.scene.rest;
    for (const m of this.motes) {
      const dx = m.p.x - rest.x;
      const dz = m.p.z - rest.z;
      const d = Math.hypot(dx, dz) + 0.5;
      const f = 2.4 / (1 + d * 0.25);
      m.v.x += (dx / d) * f * 0.5;
      m.v.z += (dz / d) * f * 0.5;
      m.v.y += f * 0.45;
    }
  }

  private spawnDust(): void {
    const scene = this.scene;
    const W = scene.DW;
    const H = scene.DH;
    const rest = scene.rest;
    const n = this.small ? 70 : 130;
    for (let i = 0; i < n; i++) {
      // Punkt auf dem Umfang
      const per = 2 * (W + H);
      let s = Math.random() * per;
      let x: number, z: number, nx: number, nz: number;
      if (s < W) {
        x = -W / 2 + s;
        z = H / 2;
        nx = 0;
        nz = 1;
      } else if ((s -= W) < H) {
        x = W / 2;
        z = H / 2 - s;
        nx = 1;
        nz = 0;
      } else if ((s -= H) < W) {
        x = W / 2 - s;
        z = -H / 2;
        nx = 0;
        nz = -1;
      } else {
        s -= W;
        x = -W / 2;
        z = -H / 2 + s;
        nx = -1;
        nz = 0;
      }
      // Jedes zweite Partikel: grobe Staubwolke, sonst feiner Grus (fällt zurück)
      const puff = i % 2 === 0;
      const speed = puff ? 0.5 + Math.random() * 1.5 : 1.4 + Math.random() * 2.6;
      this.dust.push({
        p: new THREE.Vector3(
          rest.x + x * 0.98,
          scene.tableY(rest.z + z * 0.98) + 0.04 + Math.random() * 0.1,
          rest.z + z * 0.98,
        ),
        v: new THREE.Vector3(
          nx * speed + (Math.random() - 0.5) * 0.7,
          puff ? 0.12 + Math.random() * 0.4 : 0.6 + Math.random() * 1.4,
          nz * speed + (Math.random() - 0.5) * 0.7,
        ),
        size: puff ? 0.3 + Math.random() * 0.4 : 0.03 + Math.random() * 0.04,
        grow: puff ? 0.7 + Math.random() * 1.3 : 0.02,
        life: puff ? 0.8 + Math.random() * 0.7 : 0.35 + Math.random() * 0.4,
        age: 0,
        a: puff ? 0.05 + Math.random() * 0.07 : 0.3 + Math.random() * 0.25,
        grav: puff ? 0.15 : 7.5,
      });
    }
  }

  private updateDust(dt: number, lampLevel: number): void {
    const ctx = this.dustCtx;
    const c = this.dustCanvas;
    const scene = this.scene;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const cam = scene.camera;
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const pxPerUnitAt1 = this.vh / 2 / tanH;
    const fade = 1 - seg(this.t, T_SHADE0, T_XFADE0);
    if (fade <= 0) return;
    ctx.globalCompositeOperation = 'source-over';
    const v = this.v3;

    // Schwebende Körner im Lichtkegel
    const moteFade = fade * clamp01(lampLevel) * (1 - seg(this.t, T_CAM0 + 0.5, T_SHADE1));
    if (moteFade > 0.01) {
      ctx.fillStyle = 'rgb(255,226,178)';
      const drag = Math.exp(-dt * 1.6);
      for (const m of this.motes) {
        m.v.x = m.v.x * drag + Math.sin(this.t * 0.7 + m.ph) * 0.004;
        m.v.z = m.v.z * drag + Math.cos(this.t * 0.6 + m.ph) * 0.004;
        m.v.y = m.v.y * drag - 0.004;
        m.p.addScaledVector(m.v, dt);
        // Helligkeit: nur innerhalb des Lichtkegels
        v.copy(m.p).sub(scene.lampPos);
        const len = v.length();
        const cos = len > 0 ? v.dot(scene.lampDir) / len : 0;
        const inCone = clamp01((cos - scene.lampCos) / ((1 - scene.lampCos) * 0.45));
        if (inCone <= 0) continue;
        v.copy(m.p).applyMatrix4(cam.matrixWorldInverse);
        const depth = -v.z;
        if (depth < 0.5) continue;
        v.copy(m.p).project(cam);
        const sx = ((v.x + 1) / 2) * this.vw;
        const sy = ((1 - v.y) / 2) * this.vh;
        const r = Math.max(0.55, (m.size * pxPerUnitAt1) / depth) * this.dpr;
        ctx.globalAlpha = m.a * inCone * moteFade * 0.55;
        ctx.beginPath();
        ctx.arc(sx * this.dpr, sy * this.dpr, r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (!this.dust.length) return;
    // Projizierte Oberseite (für Verdeckung)
    const quad = scene.faceQuad();
    const alive: Dust[] = [];
    for (const d of this.dust) {
      d.age += dt;
      if (d.age >= d.life) continue;
      alive.push(d);
      const drag = Math.exp(-dt * 3.2);
      d.v.multiplyScalar(drag);
      d.v.y -= dt * d.grav;
      d.p.addScaledVector(d.v, dt);
      const floor = scene.tableY(d.p.z) + 0.02;
      if (d.p.y < floor) d.p.y = floor;
      v.copy(d.p).applyMatrix4(cam.matrixWorldInverse);
      const depth = -v.z;
      if (depth < 0.2) continue;
      v.copy(d.p).project(cam);
      const sx = ((v.x + 1) / 2) * this.vw;
      const sy = ((1 - v.y) / 2) * this.vh;
      if (d.p.y < scene.topY - 0.02 && pointInQuad(sx, sy, quad)) continue;
      const k = d.age / d.life;
      const size = (d.size + d.grow * easeOutCubic(k)) * (pxPerUnitAt1 / depth);
      const a = d.a * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88) * fade;
      if (a < 0.005) continue;
      ctx.globalAlpha = a;
      const px = size * this.dpr;
      ctx.drawImage(this.dustSprite, sx * this.dpr - px / 2, sy * this.dpr - px / 2, px, px);
    }
    ctx.globalAlpha = 1;
    this.dust = alive;
  }

  // ------------------------------------------------------------------ Ende

  skip(): void {
    if (this.finishing || this.disposed) return;
    this.finishing = true;
    cancelAnimationFrame(this.raf);
    // Sofort in Endlage, Overlays weich weg
    const ds = this.device.style;
    ds.transition = 'opacity 0.18s ease';
    ds.opacity = '0';
    const c = this.scene?.canvas;
    if (c && !this.endIn3d) c.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      if (this.disposed) return;
      // Endzustand herstellen (Lampe an, Gerät an, Kamera in Endlage)
      this.dust = [];
      this.motes = [];
      this.t = T_XFADE1 + 1;
      this.update(0);
      this.scene.render();
      this.shade.style.opacity = '0';
      this.glow.style.opacity = '0';
      this.dustCanvas.style.opacity = '0';
      if (this.endIn3d) {
        ds.opacity = '1';
        setTimeout(() => this.handover3d(), 200);
        return;
      }
      this.relief.flatten();
      this.scene.clearCssMatrix();
      ds.opacity = '1';
      setTimeout(() => this.finishNow(), 460);
    }, 180);
  }

  /** Normale Übergabe: Kamera steht senkrecht, Matrix ist die Identität → Transform entfernen. */
  private handover(): void {
    this.finishing = true;
    this.relief.flatten();
    this.scene.clearCssMatrix();
    setTimeout(() => this.finishNow(), 120);
  }

  /** Das Intro bleibt in der Schrägansicht stehen: Szene und Relief an die 3D-Ansicht übergeben. */
  private handover3d(): void {
    if (this.disposed) return;
    this.finishing = true;
    this.handedOver = true;
    const scene = this.scene;
    const relief = this.relief;
    this.device.style.transition = '';
    this.device.style.opacity = '';
    this.dispose();
    this.cb.onHandover3d?.(scene, relief);
    this.cb.onDone();
  }

  private finishNow(): void {
    if (this.disposed) return;
    this.dispose();
    this.cb.onDone();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.shade?.remove();
    this.glow?.remove();
    this.dustCanvas?.remove();
    this.catcher?.remove();
    if (!this.handedOver) {
      this.relief?.dispose();
      this.scene?.dispose();
      const ds = this.device.style;
      ds.transform = '';
      ds.transformOrigin = '';
      ds.willChange = '';
      ds.transition = '';
      ds.opacity = '';
      ds.visibility = '';
    }
    this.sound?.dispose();
    this.sound = null;
  }
}

// ---------------------------------------------------------------- Helfer

function readDebugT(): string | null {
  try {
    return localStorage.getItem('nervbox-intro-debug-t');
  } catch {
    return null;
  }
}

function pointInQuad(x: number, y: number, q: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i];
    const [xj, yj] = q[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
