import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  input,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Ein Wert im LCD-Streifen des Spielrahmens.
 * - value: Zahl/Text in LCD-Ziffern
 * - pips/pipsMax: Leben, Hotdogs ... als leuchtende Marken (optional mit Material-Icon)
 * - tone 'neg': Wert leuchtet rot (z. B. negative Bilanz)
 */
export interface GameStat {
  label: string;
  value?: string | number;
  pips?: number;
  pipsMax?: number;
  pipIcon?: string;
  tone?: 'neg';
}

/**
 * Gemeinsames Gehaeuse aller Minispiele im Nachtschicht-Look:
 * Kopf (Linse mit Spiel-Icon, Titel, LCD-Streifen mit Spielwerten, Schliessen-Taste),
 * versenkter Bildschirm (Inhalt per <ng-content>), Fuss (Pause-Taste, Zusatztasten, Hinweis, Baujahr).
 *
 * Projektionen:
 *   (default)                 Spielfeld / Spiel-UI, liegt im Bildschirm
 *   [gfKeys]                  zusaetzliche Tasten im Fuss (z. B. "Auscashen")
 *   app-game-exit-confirm     Beenden-Abfrage, ueberdeckt das ganze Gehaeuse
 *
 * Akzentfarbe je Spiel ueber [accent] -> CSS-Variable --nk-gf-accent.
 * Fuer fitCanvas() als Mess-Wurzel `frame.root` verwenden (inneres Scroll-Element).
 */
@Component({
  selector: 'app-game-frame',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nk-gf',
    '[class.nk-gf--fill]': 'fill()',
    '[style.--nk-gf-accent]': 'accent()',
  },
  template: `
    <div class="nk-gf__scroll" #scroll>
      <header class="nk-gf__head">
        <span class="nk-gf__lens" aria-hidden="true"
          ><mat-icon>{{ icon() }}</mat-icon></span
        >
        <h2 class="nk-gf__title">{{ title() }}</h2>
        @if (stats().length) {
          <div class="nk-gf__lcd">
            <div class="nk-gf__glass">
              @for (s of stats(); track s.label; let first = $first) {
                @if (!first) {
                  <span class="nk-lcd__div" aria-hidden="true"></span>
                }
                <span class="nk-gf__cell" [class.nk-gf__cell--neg]="s.tone === 'neg'">
                  <span class="nk-lcd__label">{{ s.label }}</span>
                  @if (s.pips !== undefined) {
                    <span class="nk-gf__pips" [attr.aria-label]="s.label + ' ' + s.pips">
                      @for (i of pipRange(s); track $index) {
                        @if (s.pipIcon) {
                          <mat-icon class="nk-gf__pip-ico" [class.nk-gf__pip--off]="i >= s.pips!">{{
                            s.pipIcon
                          }}</mat-icon>
                        } @else {
                          <span class="nk-gf__pip" [class.nk-gf__pip--off]="i >= s.pips!"></span>
                        }
                      }
                    </span>
                  } @else {
                    <span class="nk-gf__val">{{ s.value }}</span>
                  }
                </span>
              }
            </div>
          </div>
        }
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon nk-gf__close"
          aria-label="Spiel schließen"
          (click)="closed.emit()"
        >
          ✕
        </button>
      </header>

      <div class="nk-gf__screen">
        <ng-content />
      </div>

      <footer class="nk-gf__foot">
        @if (pausable()) {
          <button
            type="button"
            class="nk-key nk-key--sm"
            [disabled]="pauseDisabled()"
            (click)="pauseToggle.emit()"
          >
            <mat-icon>pause</mat-icon>Pause
          </button>
        }
        <ng-content select="[gfKeys]" />
        <span class="nk-gf__hint">{{ hint() }}</span>
        <span class="nk-gf__plate" [attr.aria-label]="'Baujahr ' + year()">© {{ year() }}</span>
      </footer>
    </div>
    <ng-content select="app-game-exit-confirm" />
  `,
})
export class GameFrameComponent {
  readonly title = input.required<string>();
  /** Material-Icon des Spiels (wie auf dem Steckmodul) */
  readonly icon = input('sports_esports');
  /** Akzentfarbe des Spiels (Etikettfarbe des Steckmoduls) */
  readonly accent = input('#5A5346');
  readonly year = input.required<number>();
  readonly stats = input<GameStat[]>([]);
  /** Hinweistext im Fuss, z. B. "ESC = Beenden?" */
  readonly hint = input('ESC = Beenden?');
  /** Pause-Taste im Fuss zeigen */
  readonly pausable = input(false);
  readonly pauseDisabled = input(false);
  /** Gehaeuse fuellt immer 95dvh (Spiele mit eigenen Scroll-Spalten) */
  readonly fill = input(false);

  readonly closed = output<void>();
  readonly pauseToggle = output<void>();

  @ViewChild('scroll', { static: true }) private scrollRef!: ElementRef<HTMLElement>;

  /** Mess-Wurzel fuer fitCanvas(): enthaelt Kopf, Bildschirm und Fuss. */
  get root(): HTMLElement {
    return this.scrollRef.nativeElement;
  }

  pipRange(s: GameStat): number[] {
    const n = Math.max(s.pips ?? 0, s.pipsMax ?? 0);
    return Array.from({ length: n }, (_, i) => i);
  }
}
