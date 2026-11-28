import { Injectable, signal } from '@angular/core';
import type { DeckRelief } from '../../components/deck3d/deck-relief';
import type { DeckScene } from '../../components/deck3d/deck-scene';
import type { DeckViewEngine } from '../../components/deck3d/deck-view-engine';
import { hasWebGL, isWeakDevice, isWebKitEngine } from '../../components/deck3d/deck-support';

/** localStorage: '1' = Gerät in 3D auf dem Tisch */
const STORAGE_KEY = 'nervbox-view-3d';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Umschalter 2D/3D: flache Oberfläche oder das Gerät in Schrägansicht auf dem Tisch
 * (components/deck3d). Nur auf dem Desktop mit Maus und WebGL; der Zustand bleibt im Browser
 * gespeichert. Die 3D-Szene wird erst beim Einschalten nachgeladen.
 */
@Injectable({ providedIn: 'root' })
export class DeckViewService {
  private readonly desktop = window.matchMedia('(min-width: 769px) and (pointer: fine)');
  private readonly capable = hasWebGL() && !isWeakDevice() && !isWebKitEngine();
  /** Umschalter anbieten? */
  readonly available = signal(this.capable && this.desktop.matches);
  /** 3D-Ansicht eingeschaltet */
  readonly is3d = signal(false);

  private engine: DeckViewEngine | null = null;
  private module: typeof import('../../components/deck3d/deck-view-engine') | null = null;
  /** solange das Intro läuft, gehört das Gerät ihm */
  private introRunning = false;

  constructor() {
    this.desktop.addEventListener('change', (e) => {
      this.available.set(this.capable && e.matches);
      // Handybreite: sofort flach – der gespeicherte Wunsch bleibt erhalten und gilt wieder,
      // sobald das Fenster breit genug ist
      if (!e.matches && this.is3d()) this.leave(false);
      else if (e.matches) this.restore();
    });
  }

  /** Gespeicherter Wunsch (und hier überhaupt möglich)? */
  wants3d(): boolean {
    return this.available() && readStored() === '1';
  }

  toggle(): void {
    const on = !this.is3d();
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* privater Modus: dann eben nur für diese Sitzung */
    }
    if (on) void this.enter(true);
    else this.leave(true);
  }

  /** App-Start ohne 3D-Intro: gespeicherte Ansicht direkt herstellen. */
  restore(): void {
    if (this.wants3d() && !this.is3d()) void this.enter(false);
  }

  /**
   * Das Intro meldet Anfang und Ende. Währenddessen bewegt es das Gerät selbst; endet es in der
   * Schrägansicht, wird die Ansicht schon vorab geladen, damit die Übergabe ohne Lücke gelingt.
   */
  setIntroRunning(on: boolean, endsIn3d = false): void {
    this.introRunning = on;
    if (on && endsIn3d) void this.load().catch(() => undefined);
    if (!on) this.restore();
  }

  /** Das Intro endet in der Schrägansicht und übergibt seine Szene. */
  async adopt(scene: DeckScene, relief: DeckRelief): Promise<void> {
    const device = scene.device;
    this.is3d.set(true);
    // sofort: das Gerät muss über dem 3D-Canvas bleiben, auch falls das Modul noch lädt
    document.documentElement.classList.add('nb-3d');
    try {
      const mod = this.module ?? (await this.load());
      this.engine = new mod.DeckViewEngine(
        device,
        { onExited: () => this.onExited() },
        { scene, relief },
      );
      // während des Nachladens schon wieder abgewählt?
      if (!this.is3d()) this.engine.exit(true);
    } catch (err) {
      console.warn('[3D-Ansicht] Übernahme fehlgeschlagen:', err);
      relief.dispose();
      scene.dispose();
      document.documentElement.classList.remove('nb-3d');
      this.is3d.set(false);
    }
  }

  private async load(): Promise<typeof import('../../components/deck3d/deck-view-engine')> {
    this.module ??= await import('../../components/deck3d/deck-view-engine');
    return this.module;
  }

  /** Bildschirmpunkt → Punkt im unverzerrten Layout (in der flachen Ansicht unverändert). */
  unproject(x: number, y: number): { x: number; y: number } {
    return this.engine ? this.engine.unproject(x, y) : { x, y };
  }

  private async enter(animate: boolean): Promise<void> {
    if (!this.available() || this.introRunning) return;
    this.is3d.set(true);
    if (this.engine) {
      // läuft gerade aus → umkehren
      this.engine.enter(animate);
      return;
    }
    const device = document.querySelector<HTMLElement>('.app-device');
    if (!device) {
      this.is3d.set(false);
      return;
    }
    try {
      const mod = await this.load();
      // inzwischen wieder abgewählt oder schon aufgebaut?
      if (!this.is3d() || this.engine || this.introRunning) return;
      this.engine = new mod.DeckViewEngine(device, { onExited: () => this.onExited() });
      this.engine.enter(animate);
    } catch (err) {
      console.warn('[3D-Ansicht] nicht verfügbar:', err);
      this.engine = null;
      this.is3d.set(false);
    }
  }

  private leave(animate: boolean): void {
    this.is3d.set(false);
    this.engine?.exit(animate);
  }

  private onExited(): void {
    this.engine = null;
    // während des Ausblendens wieder eingeschaltet → neu aufbauen
    if (this.is3d()) void this.enter(true);
  }
}
