import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Overlay-Karte ueber dem Spielfeld (Start, Level geschafft, Pause, Game Over ...) im Nachtschicht-Look.
 * Liegt absolut ueber dem naechsten positionierten Vorfahren (Canvas-Container bzw. Bildschirm).
 * Nur die Karte nimmt Klicks an; ein (click) auf <app-game-overlay> feuert also nur fuer die Karte.
 *
 * Projektionen:
 *   [goArt]       eigenes Bild statt Icon-Linse (z. B. Logo)
 *   (default)     Texte, Werte (Klassen nk-go__text, nk-go__hint, nk-go__score, nk-go__reward ...)
 *   [goActions]   Tasten: primaer `nk-key nk-key--accent nk-key--lg`, sekundaer `nk-key nk-key--ghost`
 *
 * tone: 'start' (Akzentfarbe) | 'pause' (Lampe) | 'win' (Gruen) | 'over' (Rot) | 'info'
 * year: zeigt "© JJJJ" im Etikettband (Startkarte)
 * Zusatzklasse `nk-go--solid` auf dem Host: deckender Hintergrund statt leichter Abdunklung.
 */
@Component({
  selector: 'app-game-overlay',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    class: 'nk-go',
    '[class.nk-go--click]': 'clickable()',
  },
  template: `
    <div [class]="'nk-go__card nk-go__card--' + tone()" role="dialog" [attr.aria-label]="title() || kicker()">
      <div class="nk-go__band">
        <span class="nk-go__kicker">{{ kicker() }}</span>
        @if (year()) {
          <span class="nk-go__year" [attr.aria-label]="'Baujahr ' + year()">© {{ year() }}</span>
        } @else {
          <span [class]="'nk-led nk-led--dot ' + ledClass()" aria-hidden="true"></span>
        }
      </div>
      <div class="nk-go__inner">
        <ng-content select="[goArt]" />
        @if (icon()) {
          <span class="nk-go__lens" aria-hidden="true"><mat-icon>{{ icon() }}</mat-icon></span>
        }
        @if (title()) {
          <h3 class="nk-go__title">{{ title() }}</h3>
        }
        <ng-content />
        <div class="nk-go__actions">
          <ng-content select="[goActions]" />
        </div>
      </div>
    </div>
  `,
})
export class GameOverlayComponent {
  readonly tone = input<'start' | 'pause' | 'win' | 'over' | 'info'>('info');
  readonly kicker = input('');
  readonly title = input('');
  readonly icon = input('');
  readonly year = input<number | null>(null);
  /** Zeiger-Cursor auf der Karte (Karte startet das Spiel) */
  readonly clickable = input(false);

  ledClass(): string {
    switch (this.tone()) {
      case 'win':
        return 'nk-led--own';
      case 'over':
        return 'nk-led--danger';
      case 'pause':
        return 'nk-led--warn nk-led--blink';
      default:
        return 'nk-led--lamp';
    }
  }
}
