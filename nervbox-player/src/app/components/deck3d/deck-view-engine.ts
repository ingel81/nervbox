import { DeckRelief } from './deck-relief';
import { DeckScene, LampInfo, LocalPoint, OrbitPose, lerpPose } from './deck-scene';
import { clamp01, easeInOutCubic, easeInOutSine, smoothstep } from './deck-util';

/**
 * 3D-Ansicht: Das Gerät steht dauerhaft in Schrägansicht auf dem Tisch und bleibt voll bedienbar
 * (das echte DOM ist per `matrix3d` auf das Gehäuse projiziert – Klicks, Scrollen, Eingaben und
 * Hotkeys funktionieren unverändert). Nutzt dieselbe Szene und dasselbe Tasten-Relief wie das Intro.
 *
 * Maus-Parallaxe: Die Kamera folgt dem Mauszeiger um wenige Grad, weich gefedert – so bleibt das
 * 3D-Gefühl beim Bedienen dauerhaft da. Solange eine Maustaste gedrückt ist, steht das Bild still
 * (Klicks treffen exakt, Ziehgesten wie das XY-Pad bleiben ruhig); bei `prefers-reduced-motion`
 * ebenfalls.
 *
 * Leistung: Es läuft KEINE Dauerschleife. Gerendert wird nur, solange sich etwas bewegt (Umschalten,
 * Parallaxe bis zum Einschwingen, Tastendruck, Fenstergröße); im Ruhezustand kostet die Ansicht nichts.
 */

export interface DeckViewCallbacks {
  /** Ansicht ist wieder flach, alles abgebaut */
  onExited: () => void;
}

const ENTER_S = 1.25;
const EXIT_S = 0.95;
/** Maus-Parallaxe: maximale Kameradrehung (rad) – seitlich ±2,3°, in der Neigung ±1,5° */
const PAR_AZ = 0.04;
const PAR_POLAR = 0.026;
/** Eigenfrequenz der kritisch gedämpften Feder (1/s): weiches An- und Ausschwingen in ~0,6 s */
const PAR_OMEGA = 8;
/** Body-Klasse während einer XY-Pad-Geste (core/services/voice-control.service.ts) */
const LIVE_DRAG_CLASS = 'nk-live-drag';

export class DeckViewEngine {
  private readonly scene: DeckScene;
  private readonly relief: DeckRelief;
  private poseTop!: OrbitPose;
  private pose3d!: OrbitPose;
  /** 0 = flache Draufsicht, 1 = Schrägansicht */
  private p = 0;
  private target = 1;
  /** Parallaxe: Lage (−1…1), Geschwindigkeit und Ziel aus der Mausposition */
  private readonly par = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  /** eine Zeigertaste ist gedrückt → Bild steht still */
  private held = false;
  private raf = 0;
  private last = 0;
  private sceneDirty = true;
  private layoutDirty = false;
  private lastLayout = 0;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  private readonly cam: LocalPoint = { u: 0, v: 0, n: 0 };
  private readonly lamp: LampInfo = { u: 0, v: 0, n: 0, au: 0, av: 0, radius: 1, cos: 1 };

  private readonly onResize = () => {
    this.layoutDirty = true;
    this.request();
  };
  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (e.buttons === 0) this.held = false; // Loslassen außerhalb des Fensters verpasst
    if (e.buttons !== 0 || this.frozen()) return;
    this.aim(e.clientX, e.clientY);
  };
  private readonly onDown = (e: PointerEvent) => {
    // Bild anhalten: Der Klick soll genau das treffen, was unter dem Zeiger liegt
    this.held = true;
    this.hold();
    if (e.target instanceof Node && this.device.contains(e.target)) {
      const pt = this.scene.unproject(e.clientX, e.clientY);
      this.relief.press(e.target, true, pt.x - this.scene.rect.left, pt.y - this.scene.rect.top);
      this.request();
    }
  };
  private readonly onUp = (e: Event) => {
    this.held = false;
    this.relief.press(null, false);
    if (e instanceof PointerEvent && e.pointerType === 'mouse' && !this.frozen()) {
      this.aim(e.clientX, e.clientY);
    }
    this.request();
  };
  /** Maus verlässt das Fenster: zurück in die Mittellage */
  private readonly onLeave = () => {
    if (this.frozen()) return;
    this.par.tx = 0;
    this.par.ty = 0;
    this.request();
  };
  private readonly onScroll = (e: Event) => {
    this.relief.onScroll(e.target);
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = null;
      if (!this.disposed) this.relief.settle();
    }, 140);
  };
  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.exit(false);
  };

  constructor(
    private readonly device: HTMLElement,
    private readonly cb: DeckViewCallbacks,
    /** vom Intro übernommen: Szene steht bereits in der Schrägansicht */
    adopt?: { scene: DeckScene; relief: DeckRelief },
  ) {
    if (adopt) {
      this.scene = adopt.scene;
      this.relief = adopt.relief;
      this.p = 1;
    } else {
      this.scene = new DeckScene(device, false);
      this.relief = new DeckRelief(device);
    }
    const scene = this.scene;
    scene.setLamp(1, 0);
    scene.setPower(1);
    scene.setShadowNear(1);
    scene.deviceGroup.position.copy(scene.rest);
    scene.deviceGroup.rotation.set(0, 0, 0);
    scene.setStaticShadows(true);
    scene.canvas.style.transition = '';
    this.computePoses();

    document.documentElement.classList.add('nb-3d');
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.onDown, true);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('pointercancel', this.onUp, true);
    window.addEventListener('blur', this.onUp);
    document.documentElement.addEventListener('mouseleave', this.onLeave);
    device.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    scene.canvas.addEventListener('webglcontextlost', this.onContextLost);

    this.apply();
    if (!adopt) scene.warmUp();
  }

  private get reduced(): boolean {
    return this.motion.matches;
  }

  /** Parallaxe eingefroren: Taste gedrückt, XY-Pad-Geste oder reduzierte Bewegung */
  private frozen(): boolean {
    return this.held || this.reduced || document.body.classList.contains(LIVE_DRAG_CLASS);
  }

  /** Ziel der Parallaxe aus der Mausposition (Bildmitte = Mittellage) */
  private aim(clientX: number, clientY: number): void {
    this.par.tx = Math.max(-1, Math.min(1, (clientX / this.scene.vw - 0.5) * 2));
    this.par.ty = Math.max(-1, Math.min(1, (clientY / this.scene.vh - 0.5) * 2));
    this.request();
  }

  /** Bewegung sofort anhalten (bleibt in der aktuellen Lage) */
  private hold(): void {
    const p = this.par;
    p.tx = p.x;
    p.ty = p.y;
    p.vx = 0;
    p.vy = 0;
  }

  /**
   * Parallaxe einen Zeitschritt weiterführen (kritisch gedämpfte Feder, exakt integriert: kein
   * Überschwingen, kein Zittern). false = eingeschwungen.
   */
  private stepParallax(dt: number): boolean {
    const p = this.par;
    const dx = p.x - p.tx;
    const dy = p.y - p.ty;
    if (
      Math.abs(dx) < 0.0012 &&
      Math.abs(dy) < 0.0012 &&
      Math.abs(p.vx) < 0.004 &&
      Math.abs(p.vy) < 0.004
    ) {
      p.vx = 0;
      p.vy = 0;
      return false;
    }
    const w = PAR_OMEGA;
    const e = Math.exp(-w * dt);
    let t = (p.vx + w * dx) * dt;
    p.x = p.tx + (dx + t) * e;
    p.vx = (p.vx - w * t) * e;
    t = (p.vy + w * dy) * dt;
    p.y = p.ty + (dy + t) * e;
    p.vy = (p.vy - w * t) * e;
    return true;
  }

  private computePoses(): void {
    this.poseTop = this.scene.topPose();
    this.pose3d = this.scene.viewPose();
  }

  /** In die Schrägansicht fahren (bzw. ein laufendes Verlassen umkehren). */
  enter(animate: boolean): void {
    if (this.disposed) return;
    this.target = 1;
    if (!animate || this.reduced) this.p = 1;
    this.sceneDirty = true;
    this.request();
  }

  /** Zurück in die flache Ansicht; danach baut sich die Ansicht selbst ab. */
  exit(animate: boolean): void {
    if (this.disposed) return;
    this.target = 0;
    if (!animate || this.reduced) {
      this.p = 0;
      this.finishExit();
      return;
    }
    this.request();
  }

  /** Bildschirmpunkt → Punkt im unverzerrten Layout */
  unproject(x: number, y: number): { x: number; y: number } {
    return this.disposed ? { x, y } : this.scene.unproject(x, y);
  }

  // ------------------------------------------------------------------ Schleife (nur bei Bedarf)

  private request(): void {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.last ? Math.min(0.05, Math.max(0, (now - this.last) / 1000)) : 1 / 60;
    this.last = now;
    let busy = false;

    if (this.layoutDirty) {
      // Fenstergröße: Gehäuse neu aufbauen (gedrosselt – während des Ziehens reicht ~12×/s)
      if (now - this.lastLayout > 80) {
        this.layoutDirty = false;
        this.lastLayout = now;
        this.scene.layout();
        this.computePoses();
        this.relief.refresh();
        this.sceneDirty = true;
      } else {
        busy = true;
      }
    }

    if (this.p !== this.target) {
      const up = this.target > this.p;
      const step = dt / (up ? ENTER_S : EXIT_S);
      this.p = up ? Math.min(this.target, this.p + step) : Math.max(this.target, this.p - step);
      this.sceneDirty = true;
      if (this.p !== this.target) busy = true;
    }

    // Maus-Parallaxe: weich nachführen, bis sie eingeschwungen ist
    if (this.frozen()) {
      this.hold();
    } else if (this.stepParallax(dt)) {
      this.sceneDirty = true;
      busy = true;
    }

    if (this.sceneDirty) {
      this.sceneDirty = false;
      this.apply();
    }
    if (this.relief.tick(dt, this.reduced)) busy = true;

    if (busy) {
      this.request();
    } else {
      this.last = 0;
      if (this.p === 0 && this.target === 0) this.finishExit();
    }
  };

  /** Kamera, DOM-Projektion, Relief und 3D-Bild für den aktuellen Zustand setzen. */
  private apply(): void {
    const scene = this.scene;
    const e = easeInOutCubic(this.p);
    const tilt = easeInOutSine(this.p);
    const view: OrbitPose = {
      ...this.pose3d,
      az: this.pose3d.az + this.par.x * PAR_AZ,
      polar: this.pose3d.polar + this.par.y * PAR_POLAR,
    };
    scene.setPose(lerpPose(this.poseTop, view, e, tilt));
    scene.applyCssMatrix();
    scene.cameraLocal(this.cam);
    scene.lampLocal(this.lamp);
    this.relief.setView({
      cu: this.cam.u,
      cv: this.cam.v,
      cn: this.cam.n,
      lu: this.lamp.u,
      lv: this.lamp.v,
      ln: this.lamp.n,
      // Tasten wachsen heraus, sobald die Kamera kippt
      k: smoothstep(clamp01(this.p / 0.6)),
      sheen: 1,
    });
    // 3D-Tisch blendet über den CSS-Tisch (und beim Verlassen wieder aus)
    scene.canvas.style.opacity = clamp01(this.p / 0.3).toFixed(3);
    scene.render();
  }

  private finishExit(): void {
    if (this.disposed) return;
    const root = document.documentElement.classList;
    // Schlagschatten des flachen Geräts weich zurückholen
    root.add('nb-3d-out');
    setTimeout(() => root.remove('nb-3d-out'), 450);
    this.dispose();
    this.cb.onExited();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('pointerup', this.onUp, true);
    window.removeEventListener('pointercancel', this.onUp, true);
    window.removeEventListener('blur', this.onUp);
    document.documentElement.removeEventListener('mouseleave', this.onLeave);
    this.device.removeEventListener('scroll', this.onScroll, true);
    this.scene.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.relief.dispose();
    this.scene.dispose();
    document.documentElement.classList.remove('nb-3d');
  }
}
