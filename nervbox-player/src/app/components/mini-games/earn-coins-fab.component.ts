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
    @if (auth.currentUser()) {
      <button
        class="earn-coins-fab"
        matTooltip="Mini-Games"
        matTooltipPosition="right"
        (click)="openGameSelection()"
      >
        <mat-icon>videogame_asset</mat-icon>
      </button>
    }
  `,
  styles: `
    .earn-coins-fab {
      position: fixed;
      top: 50%;
      left: 0;
      transform: translateY(-50%);
      z-index: 50;
      width: 40px;
      height: 40px;
      border-radius: 0 12px 12px 0;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border: none;
      cursor: pointer;
      box-shadow: 4px 0 20px rgba(147, 51, 234, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: pulse-glow 2s ease-in-out infinite;
    }

    .earn-coins-fab:hover {
      transform: translateY(-50%) translateX(4px);
      box-shadow: 6px 0 30px rgba(147, 51, 234, 0.6);
    }

    .earn-coins-fab:active {
      transform: translateY(-50%) scale(0.95);
    }

    .earn-coins-fab mat-icon {
      color: white;
      font-size: 22px;
      width: 22px;
      height: 22px;
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
        width: 36px;
        height: 36px;
      }

      .earn-coins-fab mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
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
