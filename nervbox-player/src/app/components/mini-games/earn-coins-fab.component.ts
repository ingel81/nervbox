import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { GameSelectionDialogComponent } from './game-selection-dialog.component';

@Component({
  selector: 'app-earn-coins-fab',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (auth.currentUser()?.role === 'admin') {
      <button
        class="earn-coins-fab"
        matTooltip="Earn Coins - Mini-Games (BETA)"
        matTooltipPosition="right"
        (click)="openGameSelection()"
      >
        <mat-icon>videogame_asset</mat-icon>
        <span class="fab-label">BETA</span>
      </button>
    }
  `,
  styles: `
    .earn-coins-fab {
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 50;
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(147, 51, 234, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: pulse-glow 2s ease-in-out infinite;
    }

    .earn-coins-fab:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 8px 30px rgba(147, 51, 234, 0.6);
    }

    .earn-coins-fab:active {
      transform: scale(0.95);
    }

    .earn-coins-fab mat-icon {
      color: white;
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    .fab-label {
      font-size: 8px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    @keyframes pulse-glow {
      0%,
      100% {
        box-shadow: 0 4px 20px rgba(147, 51, 234, 0.4);
      }
      50% {
        box-shadow:
          0 4px 30px rgba(147, 51, 234, 0.6),
          0 0 40px rgba(236, 72, 153, 0.3);
      }
    }

    @media (max-width: 768px) {
      .earn-coins-fab {
        bottom: 16px;
        left: 16px;
        width: 48px;
        height: 48px;
      }

      .earn-coins-fab mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }

      .fab-label {
        font-size: 7px;
      }
    }
  `,
})
export class EarnCoinsFabComponent {
  readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  openGameSelection(): void {
    this.dialog.open(GameSelectionDialogComponent, {
      width: '450px',
      panelClass: 'dark-dialog',
    });
  }
}
