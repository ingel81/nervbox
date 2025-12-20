import { Component, inject, signal, OnInit } from '@angular/core';
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
    <div class="shekel-popover">
      <div class="header">
        <img src="icons/nervbox-coin.svg" alt="Shekel" class="header-coin">
        <div class="header-text">
          <span class="title">Shekel Casino</span>
          <span class="balance">{{ creditService.creditsFormatted() }} N$</span>
        </div>
        <button mat-icon-button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <mat-divider></mat-divider>

      <mat-tab-group animationDuration="200ms" class="tabs">
        <!-- GAMBLING TAB -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>casino</mat-icon>
            <span>Gamblen</span>
          </ng-template>

          <div class="tab-content gambling-tab">
            <div class="gambling-info">
              <mat-icon class="dice-icon">casino</mat-icon>
              <p>Setze deine Shekel ein und verdopple sie - oder verliere alles!</p>
              <p class="odds">50/50 Chance</p>
            </div>

            @if (gambleResult()) {
              <div class="result-banner" [class.won]="gambleResult()!.won" [class.lost]="!gambleResult()!.won">
                <mat-icon>{{ gambleResult()!.won ? 'celebration' : 'sentiment_very_dissatisfied' }}</mat-icon>
                <span>{{ gambleResult()!.message }}</span>
              </div>
            }

            <mat-form-field appearance="outline" class="amount-field">
              <mat-label>Einsatz (N$)</mat-label>
              <input
                matInput
                type="number"
                [(ngModel)]="gambleAmount"
                [min]="1"
                [max]="creditService.credits()"
                placeholder="Wie viel willst du setzen?"
              />
              <mat-hint>Max: {{ creditService.credits() }} N$</mat-hint>
            </mat-form-field>

            <div class="quick-amounts">
              <button mat-stroked-button (click)="setGambleAmount(10)" [disabled]="creditService.credits() < 10">10</button>
              <button mat-stroked-button (click)="setGambleAmount(25)" [disabled]="creditService.credits() < 25">25</button>
              <button mat-stroked-button (click)="setGambleAmount(50)" [disabled]="creditService.credits() < 50">50</button>
              <button mat-stroked-button (click)="setGambleAmount(100)" [disabled]="creditService.credits() < 100">100</button>
              <button mat-stroked-button (click)="setGambleAmount(creditService.credits())">ALL IN!</button>
            </div>

            <button
              mat-raised-button
              class="gamble-btn"
              [disabled]="isGambling() || gambleAmount <= 0 || gambleAmount > creditService.credits()"
              (click)="gamble()"
            >
              @if (isGambling()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <mat-icon>casino</mat-icon>
                <span>GAMBLEN!</span>
              }
            </button>
          </div>
        </mat-tab>

        <!-- TRANSFER TAB -->
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>send</mat-icon>
            <span>Senden</span>
          </ng-template>

          <div class="tab-content transfer-tab">
            <div class="transfer-info">
              <mat-icon class="send-icon">volunteer_activism</mat-icon>
              <p>Sende Shekel an andere User!</p>
            </div>

            @if (transferResult()) {
              <div class="result-banner" [class.won]="transferResult()!.success" [class.lost]="!transferResult()!.success">
                <mat-icon>{{ transferResult()!.success ? 'check_circle' : 'error' }}</mat-icon>
                <span>{{ transferResult()!.message }}</span>
              </div>
            }

            @if (isLoadingUsers()) {
              <div class="loading-users">
                <mat-spinner diameter="24"></mat-spinner>
                <span>Lade User...</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="user-select">
                <mat-label>Empfänger</mat-label>
                <mat-select [(ngModel)]="selectedUserId">
                  @for (user of users(); track user.id) {
                    <mat-option [value]="user.id">{{ user.username }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="amount-field">
                <mat-label>Betrag (N$)</mat-label>
                <input
                  matInput
                  type="number"
                  [(ngModel)]="transferAmount"
                  [min]="1"
                  [max]="creditService.credits()"
                  placeholder="Wie viel willst du senden?"
                />
                <mat-hint>Max: {{ creditService.credits() }} N$</mat-hint>
              </mat-form-field>

              <div class="quick-amounts">
                <button mat-stroked-button (click)="setTransferAmount(5)" [disabled]="creditService.credits() < 5">5</button>
                <button mat-stroked-button (click)="setTransferAmount(10)" [disabled]="creditService.credits() < 10">10</button>
                <button mat-stroked-button (click)="setTransferAmount(25)" [disabled]="creditService.credits() < 25">25</button>
                <button mat-stroked-button (click)="setTransferAmount(50)" [disabled]="creditService.credits() < 50">50</button>
              </div>

              <button
                mat-raised-button
                class="transfer-btn"
                [disabled]="isTransferring() || !selectedUserId || transferAmount <= 0 || transferAmount > creditService.credits()"
                (click)="transfer()"
              >
                @if (isTransferring()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon>send</mat-icon>
                  <span>SENDEN</span>
                }
              </button>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .shekel-popover {
      min-width: 320px;
      max-width: 400px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(251, 191, 36, 0.1) 100%);
    }

    .header-coin {
      width: 48px;
      height: 48px;
      filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.5));
      animation: coinSpin 3s ease-in-out infinite;
    }

    @keyframes coinSpin {
      0%, 100% { transform: rotateY(0deg); }
      50% { transform: rotateY(180deg); }
    }

    .header-text {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 700;
      background: linear-gradient(135deg, #fde047 0%, #fbbf24 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .balance {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 700;
      color: #fde047;
      text-shadow: 0 0 10px rgba(253, 224, 71, 0.5);
    }

    .close-btn {
      color: rgba(255, 255, 255, 0.6);
    }

    .close-btn:hover {
      color: white;
    }

    .tabs {
      background: transparent;
    }

    ::ng-deep .shekel-popover .mat-mdc-tab-group {
      --mdc-tab-indicator-active-indicator-color: #fbbf24;
      --mat-tab-header-active-label-text-color: #fde047;
      --mat-tab-header-active-hover-label-text-color: #fde047;
      --mat-tab-header-active-focus-label-text-color: #fde047;
      --mat-tab-header-inactive-label-text-color: rgba(255, 255, 255, 0.6);
    }

    ::ng-deep .shekel-popover .mat-mdc-tab .mdc-tab__text-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tab-content {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .gambling-info, .transfer-info {
      text-align: center;
      padding: 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
    }

    .gambling-info p, .transfer-info p {
      margin: 8px 0 0 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
    }

    .odds {
      font-weight: 700;
      color: #fbbf24 !important;
      font-size: 16px !important;
    }

    .dice-icon, .send-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #fbbf24;
    }

    .result-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .result-banner.won {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.5);
      color: #86efac;
    }

    .result-banner.won mat-icon {
      color: #22c55e;
    }

    .result-banner.lost {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.5);
      color: #fca5a5;
    }

    .result-banner.lost mat-icon {
      color: #ef4444;
    }

    .amount-field, .user-select {
      width: 100%;
    }

    ::ng-deep .shekel-popover .mat-mdc-form-field {
      --mdc-outlined-text-field-outline-color: rgba(251, 191, 36, 0.3);
      --mdc-outlined-text-field-hover-outline-color: rgba(251, 191, 36, 0.5);
      --mdc-outlined-text-field-focus-outline-color: #fbbf24;
      --mdc-outlined-text-field-label-text-color: rgba(255, 255, 255, 0.6);
      --mdc-outlined-text-field-input-text-color: white;
      --mdc-outlined-text-field-caret-color: #fbbf24;
    }

    .quick-amounts {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .quick-amounts button {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      border-color: rgba(251, 191, 36, 0.4);
      color: #fbbf24;
    }

    .quick-amounts button:hover:not(:disabled) {
      background: rgba(251, 191, 36, 0.15);
      border-color: #fbbf24;
    }

    .quick-amounts button:disabled {
      opacity: 0.4;
    }

    .gamble-btn {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
      color: white !important;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 16px;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .gamble-btn:hover:not(:disabled) {
      transform: scale(1.02);
      box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4);
    }

    .gamble-btn:disabled {
      opacity: 0.5;
    }

    .transfer-btn {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
      color: white !important;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 16px;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .transfer-btn:hover:not(:disabled) {
      transform: scale(1.02);
      box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
    }

    .transfer-btn:disabled {
      opacity: 0.5;
    }

    .loading-users {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px;
      color: rgba(255, 255, 255, 0.6);
    }

    ::ng-deep .shekel-popover .mat-mdc-select-value {
      color: white;
    }

    ::ng-deep .shekel-popover .mat-mdc-select-arrow {
      color: rgba(255, 255, 255, 0.6);
    }
  `,
})
export class ShekelPopoverComponent implements OnInit {
  readonly creditService = inject(CreditService);
  private readonly dialogRef = inject(MatDialogRef<ShekelPopoverComponent>);

  // Gambling state
  gambleAmount = 10;
  readonly isGambling = signal(false);
  readonly gambleResult = signal<{ won: boolean; message: string } | null>(null);

  // Transfer state
  selectedUserId: number | null = null;
  transferAmount = 5;
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
    this.gambleAmount = amount;
  }

  setTransferAmount(amount: number): void {
    this.transferAmount = amount;
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
    if (this.gambleAmount <= 0 || this.gambleAmount > this.creditService.credits()) {
      return;
    }

    this.isGambling.set(true);
    this.gambleResult.set(null);

    this.creditService.gamble(this.gambleAmount).subscribe({
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
    if (!this.selectedUserId || this.transferAmount <= 0 || this.transferAmount > this.creditService.credits()) {
      return;
    }

    this.isTransferring.set(true);
    this.transferResult.set(null);

    this.creditService.transfer(this.selectedUserId, this.transferAmount).subscribe({
      next: (response) => {
        this.transferResult.set({
          success: response.success,
          message: response.message,
        });
        this.isTransferring.set(false);
        // Reset form on success
        if (response.success) {
          this.selectedUserId = null;
          this.transferAmount = 5;
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
