import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../../core/services/auth.service';
import { PongClientService } from './pong-client.service';
import { PongInvite } from './pong.types';

/**
 * Globaler LAN-Pong-Einladungs-Toast (in app.ts eingehaengt). Haelt die Hub-Verbindung, solange jemand
 * eingeloggt ist, und zeigt Herausforderungen auch bei geschlossenem Spiel. "Annehmen" oeffnet das Spiel.
 */
@Component({
  selector: 'app-pong-invite-toast',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (invite(); as inv) {
      <div class="nk-toast nk-toast--enter pit" role="alert" data-testid="pong-invite-toast">
        <span class="nk-toast__icon"><mat-icon>settings_ethernet</mat-icon></span>
        <span class="nk-toast__body">
          <span class="nk-toast__title">LAN-Pong · Herausforderung</span>
          <span class="nk-toast__name">{{ inv.fromName }} fordert dich heraus</span>
          <span class="nk-toast__text nk-toast__text--dim">
            @if (inv.stake > 0) {
              Einsatz {{ inv.stake }} N$ – Sieger kriegt {{ inv.stake * 2 }} N$
            } @else {
              Ohne Einsatz · bis 7 Punkte
            }
          </span>
        </span>
        <span class="pit__keys">
          <button type="button" class="nk-key nk-key--sm nk-key--accent" (click)="accept(inv)">
            Annehmen
          </button>
          <button type="button" class="nk-key nk-key--sm nk-key--ghost" (click)="decline(inv)">
            Nein
          </button>
        </span>
      </div>
    }
  `,
  styles: `
    .pit {
      --nk-toast-c: var(--nk-own);
      --nk-toast-rgb: var(--nk-own-rgb);
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 22px;
      margin: 0 auto;
      z-index: 10001;
      width: 470px;
      max-width: calc(100vw - 32px);
    }
    .pit__keys {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    @media (max-width: 768px) {
      .pit {
        bottom: auto;
        top: 12px;
      }
    }
  `,
})
export class PongInviteToastComponent {
  private readonly pong = inject(PongClientService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  readonly invite = computed<PongInvite | null>(() => {
    if (this.pong.gameOpen()) return null;
    const list = this.pong.incoming();
    return list.length ? list[list.length - 1] : null;
  });

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) void this.pong.connect();
      else void this.pong.disconnect();
    });
  }

  async accept(inv: PongInvite): Promise<void> {
    if (!this.pong.gameOpen()) await openPongGame(this.dialog);
    await this.pong.accept(inv.id);
  }

  decline(inv: PongInvite): void {
    void this.pong.decline(inv.id);
  }
}

/** Oeffnet den LAN-Pong-Dialog (lazy). Auch von der Spielhalle genutzt. */
export async function openPongGame(dialog: MatDialog): Promise<void> {
  const { PongGameComponent } = await import('./pong-game.component');
  dialog.open(PongGameComponent, {
    width: '95vw',
    maxWidth: '920px',
    height: 'auto',
    maxHeight: '95dvh',
    panelClass: ['dark-dialog', 'game-dialog'],
    disableClose: true,
  });
}
