import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { CreditService, TransferableUser } from '../../../core/services/credit.service';

@Component({
  selector: 'app-shekel-popover',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  template: `
    <div class="nk-dlg shekel-popover">
      <header class="nk-dialog__head sk-head">
        <span class="sk-coin" aria-hidden="true">N$</span>
        <span class="sk-title">
          <span class="nk-dialog__title">{{
            activeTab() === 0 ? 'Shekel senden' : 'Shekel Casino'
          }}</span>
          <span class="sk-bal">{{ creditService.creditsFormatted() }} N$</span>
        </span>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          (click)="close()"
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body">
        <div class="nk-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === 0"
            [class]="activeTab() === 0 ? 'nk-tabs__tab nk-tabs__tab--on' : 'nk-tabs__tab'"
            (click)="activeTab.set(0)"
          >
            Senden
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="activeTab() === 1"
            [class]="activeTab() === 1 ? 'nk-tabs__tab nk-tabs__tab--on' : 'nk-tabs__tab'"
            (click)="activeTab.set(1)"
          >
            Gamblen
          </button>
        </div>

        @if (activeTab() === 0) {
          <span class="sk-info"
            ><mat-icon>volunteer_activism</mat-icon>Sende Shekel an andere User!</span
          >
          @if (transferResult(); as r) {
            <div
              [class]="
                r.success
                  ? 'nk-toast nk-toast--success nk-toast--inline'
                  : 'nk-toast nk-toast--error nk-toast--inline'
              "
              role="status"
            >
              <span class="nk-toast__text">{{ r.message }}</span>
            </div>
          }
          @if (isLoadingUsers()) {
            <span class="sk-info"
              ><span class="nk-spin" aria-hidden="true"></span>Lade User...</span
            >
          } @else {
            <label class="nk-field">
              <span class="nk-label">Empfänger</span>
              <span class="nk-input">
                <select
                  class="nk-input__field sk-select"
                  [(ngModel)]="selectedUserId"
                  aria-label="Empfänger"
                >
                  <option [ngValue]="null" disabled>Empfänger wählen …</option>
                  @for (user of users(); track user.id) {
                    <option [ngValue]="user.id">{{ user.username }}</option>
                  }
                </select>
              </span>
            </label>
            <label class="nk-field">
              <span class="nk-label">Betrag (N$)</span>
              <span class="nk-input">
                <input
                  class="nk-input__field sk-num"
                  type="number"
                  [(ngModel)]="transferAmount"
                  [min]="1"
                  [max]="creditService.credits()"
                  placeholder="Wie viel willst du senden?"
                  aria-label="Betrag in N$"
                />
              </span>
              <span class="nk-field__hint">Max: {{ creditService.credits() }} N$</span>
            </label>
            <div class="sk-quick">
              @for (a of transferQuick; track a) {
                <button
                  type="button"
                  [class]="
                    transferAmount() === a
                      ? 'nk-key nk-key--sm nk-key--pressed'
                      : 'nk-key nk-key--sm'
                  "
                  [disabled]="creditService.credits() < a"
                  (click)="setTransferAmount(a)"
                >
                  {{ a }}
                </button>
              }
            </div>
            <button
              type="button"
              class="nk-key nk-key--accent nk-key--lg sk-go"
              [disabled]="
                isTransferring() ||
                !selectedUserId() ||
                transferAmount() <= 0 ||
                transferAmount() > creditService.credits()
              "
              (click)="transfer()"
            >
              @if (isTransferring()) {
                <span class="nk-spin" aria-hidden="true"></span>
              } @else {
                <mat-icon>send</mat-icon>
              }
              SENDEN
            </button>
          }
        } @else {
          <span class="sk-info"
            ><mat-icon>casino</mat-icon>Setze deine Shekel ein und verdopple sie - oder verliere
            alles!</span
          >
          <span class="sk-odds">50/50 Chance</span>
          @if (gambleResult(); as r) {
            <div
              [class]="
                r.won
                  ? 'nk-toast nk-toast--success nk-toast--inline'
                  : 'nk-toast nk-toast--error nk-toast--inline'
              "
              role="status"
            >
              <mat-icon class="sk-res-ico">{{
                r.won ? 'celebration' : 'sentiment_very_dissatisfied'
              }}</mat-icon>
              <span class="nk-toast__text">{{ r.message }}</span>
            </div>
          }
          <label class="nk-field">
            <span class="nk-label">Einsatz (N$)</span>
            <span class="nk-input">
              <input
                class="nk-input__field sk-num"
                type="number"
                [(ngModel)]="gambleAmount"
                [min]="1"
                [max]="creditService.credits()"
                placeholder="Wie viel willst du setzen?"
                aria-label="Einsatz in N$"
              />
            </span>
            <span class="nk-field__hint">Max: {{ creditService.credits() }} N$</span>
          </label>
          <div class="sk-quick">
            @for (a of gambleQuick; track a) {
              <button
                type="button"
                [class]="
                  gambleAmount() === a ? 'nk-key nk-key--sm nk-key--pressed' : 'nk-key nk-key--sm'
                "
                [disabled]="creditService.credits() < a"
                (click)="setGambleAmount(a)"
              >
                {{ a }}
              </button>
            }
            <button
              type="button"
              class="nk-key nk-key--sm sk-allin"
              (click)="setGambleAmount(creditService.credits())"
            >
              ALL IN!
            </button>
          </div>
          <button
            type="button"
            class="nk-key nk-key--danger nk-key--lg sk-go"
            [disabled]="
              isGambling() || gambleAmount() <= 0 || gambleAmount() > creditService.credits()
            "
            (click)="gamble()"
          >
            @if (isGambling()) {
              <span class="nk-spin" aria-hidden="true"></span>
            } @else {
              <mat-icon>casino</mat-icon>
            }
            GAMBLEN!
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .nk-dlg {
      width: 360px;
      max-width: 100%;
    }
    .sk-head {
      gap: 12px;
    }
    .sk-coin {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font: 400 22px/1 var(--nk-font-lcd);
      color: var(--nk-lcd-ink);
      background: var(--nk-face-lcd);
      box-shadow:
        0 0 0 2px #0b0a08,
        0 0 12px rgb(196 220 112 / 0.45);
    }
    .sk-title {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sk-title .nk-dialog__title {
      font-size: 17px;
    }
    .sk-bal {
      font: 400 22px/1 var(--nk-font-lcd);
      letter-spacing: 1px;
      color: var(--nk-iv);
      text-shadow: 0 0 6px rgb(255 226 176 / 0.5);
    }
    .sk-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font: 600 15px/1.3 var(--nk-font-ui);
    }
    .sk-info .mat-icon {
      flex-shrink: 0;
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .sk-odds {
      font: 400 26px/1 var(--nk-font-lcd);
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--nk-warn);
      text-shadow: 0 0 8px rgb(242 210 75 / 0.6);
    }
    .sk-res-ico {
      flex-shrink: 0;
    }
    .sk-select {
      appearance: none;
      cursor: pointer;
    }
    .sk-select option {
      background: #1a1814;
      color: var(--nk-iv);
    }
    .sk-num {
      font-family: var(--nk-font-lcd);
      font-size: 22px;
    }
    .sk-quick {
      display: flex;
      gap: 10px;
      padding: 3px;
    }
    .sk-quick .nk-key {
      flex: 1;
      padding: 0 4px 2px;
    }
    .sk-quick .sk-allin {
      flex: 1.6;
    }
    .sk-go {
      margin: 2px 3px 4px;
    }
    .sk-go .mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShekelPopoverComponent implements OnInit {
  readonly creditService = inject(CreditService);
  private readonly dialogRef = inject(MatDialogRef<ShekelPopoverComponent>);

  // Tab state
  readonly activeTab = signal(0);
  readonly transferQuick = [5, 10, 25, 50];
  readonly gambleQuick = [10, 25, 50, 100];

  // Gambling state
  readonly gambleAmount = signal(10);
  readonly isGambling = signal(false);
  readonly gambleResult = signal<{ won: boolean; message: string } | null>(null);

  // Transfer state
  readonly selectedUserId = signal<number | null>(null);
  readonly transferAmount = signal(5);
  readonly isTransferring = signal(false);
  readonly isLoadingUsers = signal(false);
  readonly users = signal<TransferableUser[]>([]);
  readonly transferResult = signal<{ success: boolean; message: string } | null>(null);

  ngOnInit(): void {
    this.loadUsers();
  }

  close(): void {
    this.dialogRef.close();
  }

  setGambleAmount(amount: number): void {
    this.gambleAmount.set(amount);
  }

  setTransferAmount(amount: number): void {
    this.transferAmount.set(amount);
  }

  loadUsers(): void {
    this.isLoadingUsers.set(true);
    this.creditService.getTransferableUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.isLoadingUsers.set(false);
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.isLoadingUsers.set(false);
      },
    });
  }

  gamble(): void {
    if (this.gambleAmount() <= 0 || this.gambleAmount() > this.creditService.credits()) {
      return;
    }

    this.isGambling.set(true);
    this.gambleResult.set(null);

    this.creditService.gamble(this.gambleAmount()).subscribe({
      next: (response) => {
        this.gambleResult.set({
          won: response.won,
          message: response.message,
        });
        this.isGambling.set(false);
      },
      error: (err) => {
        this.gambleResult.set({
          won: false,
          message: err.error?.Error || 'Fehler beim Gamblen',
        });
        this.isGambling.set(false);
      },
    });
  }

  transfer(): void {
    const recipientId = this.selectedUserId();
    const amount = this.transferAmount();
    if (!recipientId || amount <= 0 || amount > this.creditService.credits()) {
      return;
    }

    this.isTransferring.set(true);
    this.transferResult.set(null);

    this.creditService.transfer(recipientId, amount).subscribe({
      next: (response) => {
        this.transferResult.set({
          success: response.success,
          message: response.message,
        });
        this.isTransferring.set(false);
        // Reset form on success
        if (response.success) {
          this.selectedUserId.set(null);
          this.transferAmount.set(5);
        }
      },
      error: (err) => {
        this.transferResult.set({
          success: false,
          message: err.error?.Error || 'Fehler beim Senden',
        });
        this.isTransferring.set(false);
      },
    });
  }
}
