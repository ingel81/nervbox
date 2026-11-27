import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * "Spiel beenden?"-Abfrage fuer alle Minispiel-Dialoge (Nachtschicht-Look, Overlay im Dialog).
 * Escape oeffnet die Abfrage, nochmal Escape / "Weiterspielen" schliesst sie wieder.
 * Das Spiel pausiert ueber (opened)/(resumed) und beendet ueber (exit).
 */
@Component({
  selector: 'app-game-exit-confirm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="gx-backdrop" (click)="resume()">
        <div
          class="nk-dlg gx-box"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="gx-title"
          (click)="$event.stopPropagation()"
        >
          <header class="nk-dialog__head">
            <h2 class="nk-dialog__title" id="gx-title">Spiel beenden?</h2>
          </header>
          <div class="nk-dialog__body">
            @if (hint()) {
              <p class="gx-hint">{{ hint() }}</p>
            }
          </div>
          <footer class="nk-dialog__foot">
            <button #keepBtn type="button" class="nk-key nk-key--ghost" (click)="resume()">
              Weiterspielen
            </button>
            <button type="button" class="nk-key nk-key--danger" (click)="doExit()">Beenden</button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .gx-backdrop {
      position: absolute;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      background: rgba(8, 6, 5, 0.78);
      backdrop-filter: blur(2px);
    }
    .gx-box {
      width: 360px;
      max-width: 100%;
      max-height: 100%;
      overflow: auto;
    }
    .gx-hint {
      margin: 0;
      color: var(--nk-iv-2, #d9cfb6);
      font-size: var(--nk-fs-md, 14.5px);
      line-height: 1.4;
    }
  `,
})
export class GameExitConfirmComponent implements OnDestroy {
  /** Zusatzhinweis (z.B. was mit einem laufenden Einsatz passiert) */
  readonly hint = input('');
  /** Abfrage wurde geoeffnet -> Spiel pausieren */
  readonly opened = output<void>();
  /** Abfrage wurde per "Weiterspielen"/Escape geschlossen -> Spiel fortsetzen */
  readonly resumed = output<void>();
  /** "Beenden" gewaehlt */
  readonly exit = output<void>();

  readonly isOpen = signal(false);
  private readonly keepBtn = viewChild<ElementRef<HTMLButtonElement>>('keepBtn');

  /** Capture-Phase, damit z.B. offene Tooltips Escape nicht vorher verschlucken. */
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (this.isOpen()) this.resume();
    else this.open();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeydown, true);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeydown, true);
  }

  open(): void {
    if (this.isOpen()) return;
    this.isOpen.set(true);
    this.opened.emit();
    setTimeout(() => this.keepBtn()?.nativeElement.focus(), 0);
  }

  resume(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.resumed.emit();
  }

  doExit(): void {
    this.isOpen.set(false);
    this.exit.emit();
  }
}
