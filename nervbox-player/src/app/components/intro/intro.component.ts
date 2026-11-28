import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { DeckViewService } from '../../core/services/deck-view.service';
import { decideIntroMode, IntroMode } from './intro.config';
import { IntroSound } from './intro-sound';

/** Wie lange das 3D-Modul maximal laden darf, bevor wir nur noch faden. */
const ENGINE_LOAD_TIMEOUT_MS = 2500;
const FADE_MS = 450;

/**
 * Lade-Intro: Das Gerät fällt in 3D auf den Tisch und wird nahtlos zur echten
 * Oberfläche. Die App lädt währenddessen normal dahinter (das Intro bewegt nur
 * das echte `.app-device` per CSS-Transform). Ein Klick/Tap/Taste überspringt.
 * Ist die 3D-Ansicht eingeschaltet, bleibt das Gerät am Ende schräg auf dem Tisch stehen.
 */
@Component({
  selector: 'app-intro',
  standalone: true,
  template: `
    @if (curtain()) {
      <div class="nb-intro-curtain" [class.nb-intro-curtain--out]="fading()"></div>
    }
    @if (gate()) {
      <button
        type="button"
        class="nb-intro-gate"
        [class.nb-intro-gate--on]="powering()"
        aria-label="Nervbox einschalten"
        (click)="powerOn()"
      >
        <span class="nb-intro-gate__key">
          <span class="nb-intro-gate__led"></span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v9" />
            <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
          </svg>
        </span>
        <span class="nb-intro-gate__label">Nervbox einschalten</span>
        <span class="nb-intro-gate__hint">Klick oder Taste · mit Ton</span>
      </button>
    }
  `,
  // Globale Regeln: greifen auf das Geräte-Markup in app.ts zu
  encapsulation: ViewEncapsulation.None,
  styles: `
    .nb-intro-curtain {
      position: fixed;
      inset: 0;
      z-index: 0;
      background: #050403;
      pointer-events: none;
      transition: opacity ${FADE_MS}ms ease;
    }
    .nb-intro-curtain--out {
      opacity: 0;
    }
    .nb-intro-gate {
      position: fixed;
      inset: 0;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      border: 0;
      padding: 0;
      background: radial-gradient(
        ellipse 46% 40% at 50% 47%,
        rgb(var(--nk-lamp-rgb) / 0.07),
        transparent 70%
      );
      color: rgb(var(--nk-lamp-rgb) / 0.82);
      cursor: pointer;
      font-family: 'Barlow Condensed', sans-serif;
      animation: nb-gate-in 0.5s ease both;
      transition: opacity 0.22s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .nb-intro-gate--on {
      opacity: 0;
      pointer-events: none;
    }
    .nb-intro-gate:focus-visible {
      outline: none;
    }
    .nb-intro-gate__key {
      position: relative;
      display: grid;
      place-items: center;
      width: 92px;
      height: 92px;
      border-radius: 50%;
      background: radial-gradient(circle at 50% 38%, #34302b, #1a1815 72%);
      box-shadow:
        inset 0 2px 0 rgb(255 255 255 / 0.09),
        inset 0 -4px 6px rgb(0 0 0 / 0.55),
        0 0 0 6px #0d0c0a,
        0 0 0 7px rgb(255 255 255 / 0.05),
        0 12px 26px rgb(0 0 0 / 0.7);
      transition:
        transform 0.12s ease,
        box-shadow 0.2s ease;
    }
    .nb-intro-gate:hover .nb-intro-gate__key,
    .nb-intro-gate:focus-visible .nb-intro-gate__key {
      box-shadow:
        inset 0 2px 0 rgb(255 255 255 / 0.12),
        inset 0 -4px 6px rgb(0 0 0 / 0.55),
        0 0 0 6px #0d0c0a,
        0 0 0 7px rgb(255 255 255 / 0.09),
        0 0 34px rgb(255 70 50 / 0.22),
        0 12px 26px rgb(0 0 0 / 0.7);
    }
    .nb-intro-gate:active .nb-intro-gate__key,
    .nb-intro-gate--on .nb-intro-gate__key {
      transform: translateY(2px) scale(0.97);
    }
    .nb-intro-gate__key svg {
      width: 38px;
      height: 38px;
      fill: none;
      stroke: rgb(255 92 70);
      stroke-width: 2.4;
      stroke-linecap: round;
      filter: drop-shadow(0 0 6px rgb(255 70 50 / 0.75));
    }
    .nb-intro-gate__led {
      position: absolute;
      top: 13px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgb(255 70 50);
      box-shadow: 0 0 8px 2px rgb(255 70 50 / 0.7);
      animation: nb-gate-led 1.6s ease-in-out infinite;
    }
    .nb-intro-gate--on .nb-intro-gate__led {
      animation: none;
      background: #7dff9a;
      box-shadow: 0 0 10px 3px rgb(125 255 154 / 0.8);
    }
    .nb-intro-gate__label {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      padding-left: 0.32em;
    }
    .nb-intro-gate__hint {
      margin-top: -10px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      opacity: 0.45;
    }
    @keyframes nb-gate-led {
      50% {
        opacity: 0.35;
      }
    }
    @keyframes nb-gate-in {
      from {
        opacity: 0;
      }
    }
    html.nb-intro .app-device,
    html.nb-intro-handover .app-device {
      position: relative;
      z-index: 1;
    }
    html.nb-intro .app-device {
      pointer-events: none;
      box-shadow:
        inset 0 2px 0 rgb(var(--nk-lamp-rgb) / 0.3),
        inset 2px 0 0 rgb(var(--nk-lamp-rgb) / 0.18),
        inset 0 -4px 0 rgb(0 0 0 / 0.45),
        inset -3px 0 0 rgb(0 0 0 / 0.3);
    }
    html.nb-intro-wait .app-device {
      visibility: hidden;
    }
    html.nb-intro-handover .app-device {
      transition: box-shadow 0.42s ease;
    }
    html.nb-intro-fade .app-device {
      opacity: 0;
      transform: translateY(10px) scale(0.985);
    }
    html.nb-intro-fadein .app-device {
      transition:
        opacity ${FADE_MS}ms ease,
        transform ${FADE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly deckView = inject(DeckViewService);
  private readonly mode: IntroMode = decideIntroMode();
  readonly curtain = signal(this.mode !== 'none');
  readonly fading = signal(false);
  /** Einschalt-Taste: nur wenn der Browser Ton ohne Nutzergeste sperrt */
  readonly gate = signal(false);
  readonly powering = signal(false);
  private releaseGate: (() => void) | null = null;
  private sound: IntroSound | null = null;
  private stopEngine: (() => void) | null = null;

  constructor() {
    if (this.mode === 'none') {
      // kein Intro: gespeicherte 3D-Ansicht direkt herstellen
      afterNextRender(() => this.deckView.restore());
      return;
    }
    const root = document.documentElement.classList;
    root.add('nb-intro', 'nb-intro-wait');
    afterNextRender(() => void this.start());
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', this.onGateKey, true);
      if (this.stopEngine) this.stopEngine();
      else this.sound?.dispose();
      this.cleanupClasses();
    });
  }

  private async start(): Promise<void> {
    const device = document.querySelector<HTMLElement>('.app-device');
    if (!device) {
      this.cleanupClasses();
      this.curtain.set(false);
      return;
    }
    if (this.mode === '3d') {
      // Modul lädt schon, während ggf. die Einschalt-Taste wartet
      const load = import('./intro-engine');
      load.catch(() => undefined);
      await this.ensureSound();
      try {
        const mod = await Promise.race([
          load,
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), ENGINE_LOAD_TIMEOUT_MS),
          ),
        ]);
        const endIn3d = this.deckView.wants3d();
        this.deckView.setIntroRunning(true, endIn3d);
        const engine = new mod.IntroEngine(
          device,
          {
            onStarted: () => this.curtain.set(false),
            onDone: () => {
              this.stopEngine = null;
              this.curtain.set(false);
              this.cleanupClasses();
              this.deckView.setIntroRunning(false);
            },
            onHandover3d: (scene, relief) => void this.deckView.adopt(scene, relief),
          },
          { endIn3d, sound: this.sound },
        );
        this.stopEngine = () => engine.dispose();
        engine.start();
        return;
      } catch (err) {
        console.warn('[Intro] 3D nicht verfügbar, nutze Fade:', err);
        this.sound?.dispose();
        this.sound = null;
      }
    }
    this.runFade();
  }

  /**
   * Der Aufprall-Sound soll sicher kommen: Sperrt der Browser Ton ohne
   * Nutzergeste, wartet eine Einschalt-Taste auf Klick/Taste (die Geste gibt
   * den Ton frei). Ist er schon frei oder gibt es kein Web Audio, geht es
   * ohne Halt weiter.
   */
  private async ensureSound(): Promise<void> {
    try {
      this.sound = new IntroSound();
    } catch {
      this.sound = null;
    }
    if (!this.sound?.available || (await this.sound.canPlay())) return;
    await new Promise<void>((resolve) => {
      this.releaseGate = resolve;
      window.addEventListener('keydown', this.onGateKey, true);
      this.gate.set(true);
    });
  }

  private readonly onGateKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Tab' || /^F\d+$/.test(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.powerOn();
  };

  powerOn(): void {
    const release = this.releaseGate;
    if (!release) return;
    this.releaseGate = null;
    window.removeEventListener('keydown', this.onGateKey, true);
    // noch innerhalb der Geste: Ton freigeben
    this.sound?.unlock();
    this.powering.set(true);
    // kurz die grüne LED zeigen, dann startet das Intro
    setTimeout(() => {
      this.gate.set(false);
      release();
    }, 240);
  }

  /** Fallback: kurzer 2D-Fade der echten Oberfläche. */
  private runFade(): void {
    const root = document.documentElement.classList;
    root.add('nb-intro-fade');
    root.remove('nb-intro-wait');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.add('nb-intro-fadein');
        root.remove('nb-intro-fade');
        this.fading.set(true);
        setTimeout(() => {
          this.curtain.set(false);
          this.cleanupClasses();
          this.deckView.restore();
        }, FADE_MS + 50);
      });
    });
  }

  private cleanupClasses(): void {
    document.documentElement.classList.remove(
      'nb-intro',
      'nb-intro-wait',
      'nb-intro-fade',
      'nb-intro-fadein',
      'nb-intro-handover',
    );
  }
}
