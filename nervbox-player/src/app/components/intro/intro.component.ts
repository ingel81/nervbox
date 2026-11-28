import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { decideIntroMode, IntroMode } from './intro.config';

/** Wie lange das 3D-Modul maximal laden darf, bevor wir nur noch faden. */
const ENGINE_LOAD_TIMEOUT_MS = 2500;
const FADE_MS = 450;

/**
 * Lade-Intro: Das Gerät fällt in 3D auf den Tisch und wird nahtlos zur echten
 * Oberfläche. Die App lädt währenddessen normal dahinter (das Intro bewegt nur
 * das echte `.app-device` per CSS-Transform). Ein Klick/Tap/Taste überspringt.
 */
@Component({
  selector: 'app-intro',
  standalone: true,
  template: `
    @if (curtain()) {
      <div class="nb-intro-curtain" [class.nb-intro-curtain--out]="fading()"></div>
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
  private readonly mode: IntroMode = decideIntroMode();
  readonly curtain = signal(this.mode !== 'none');
  readonly fading = signal(false);
  private stopEngine: (() => void) | null = null;

  constructor() {
    if (this.mode === 'none') return;
    const root = document.documentElement.classList;
    root.add('nb-intro', 'nb-intro-wait');
    afterNextRender(() => void this.start());
    this.destroyRef.onDestroy(() => {
      this.stopEngine?.();
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
      try {
        const mod = await Promise.race([
          import('./intro-engine'),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), ENGINE_LOAD_TIMEOUT_MS),
          ),
        ]);
        const engine = new mod.IntroEngine(device, {
          onStarted: () => this.curtain.set(false),
          onDone: () => {
            this.stopEngine = null;
            this.curtain.set(false);
            this.cleanupClasses();
          },
        });
        this.stopEngine = () => engine.dispose();
        engine.start();
        return;
      } catch (err) {
        console.warn('[Intro] 3D nicht verfügbar, nutze Fade:', err);
      }
    }
    this.runFade();
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
