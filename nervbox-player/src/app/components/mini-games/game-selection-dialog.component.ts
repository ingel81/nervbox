import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ArkanoidGameComponent } from './games/arkanoid/arkanoid-game.component';

interface GameInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  available: boolean;
}

@Component({
  selector: 'app-game-selection-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="game-selection-dialog">
      <div class="dialog-header">
        <mat-icon class="title-icon">videogame_asset</mat-icon>
        <h2>Earn Coins</h2>
        <span class="beta-badge">BETA</span>
      </div>

      <mat-dialog-content>
        <p class="dialog-subtitle">Spiele Mini-Games und verdiene Coins!</p>

        <div class="games-grid">
          @for (game of availableGames; track game.id) {
            <button
              class="game-card"
              [class.disabled]="!game.available"
              [disabled]="!game.available"
              (click)="startGame(game)"
            >
              <mat-icon class="game-icon">{{ game.icon }}</mat-icon>
              <span class="game-name">{{ game.name }}</span>
              <span class="game-desc">{{ game.description }}</span>
              @if (!game.available) {
                <span class="coming-soon">Coming Soon</span>
              }
            </button>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Schliessen</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    .game-selection-dialog {
      background: #0a0a0a;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 24px 0;
    }

    .title-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .dialog-header h2 {
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .beta-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 4px 8px;
      background: rgba(147, 51, 234, 0.2);
      border: 1px solid rgba(147, 51, 234, 0.5);
      border-radius: 4px;
      color: #9333ea;
      letter-spacing: 1px;
    }

    .dialog-subtitle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      margin: 8px 0 24px;
    }

    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
    }

    .game-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px 16px;
      background: linear-gradient(
        135deg,
        rgba(147, 51, 234, 0.1) 0%,
        rgba(236, 72, 153, 0.05) 100%
      );
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .game-card:not(.disabled):hover {
      transform: translateY(-4px);
      border-color: rgba(147, 51, 234, 0.6);
      box-shadow: 0 8px 30px rgba(147, 51, 234, 0.3);
      background: linear-gradient(
        135deg,
        rgba(147, 51, 234, 0.2) 0%,
        rgba(236, 72, 153, 0.1) 100%
      );
    }

    .game-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .game-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ec4899;
    }

    .game-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 600;
      color: white;
    }

    .game-desc {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
    }

    .coming-soon {
      position: absolute;
      top: 8px;
      right: 8px;
      font-size: 9px;
      font-weight: 600;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    mat-dialog-content {
      padding: 0 24px !important;
      max-height: 60vh;
    }

    mat-dialog-actions {
      padding: 16px 24px !important;
    }

    mat-dialog-actions button {
      color: rgba(255, 255, 255, 0.7);
    }
  `,
})
export class GameSelectionDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<GameSelectionDialogComponent>);
  private readonly dialog = inject(MatDialog);

  readonly availableGames: GameInfo[] = [
    {
      id: 'arkanoid',
      name: 'Arkanoid',
      description: 'Zerstoere alle Bloecke!',
      icon: 'sports_tennis',
      available: true,
    },
    {
      id: 'snake',
      name: 'Snake',
      description: 'Werde so lang wie moeglich!',
      icon: 'linear_scale',
      available: false,
    },
    {
      id: 'memory',
      name: 'Memory',
      description: 'Finde die Paare!',
      icon: 'grid_view',
      available: false,
    },
    {
      id: 'reaction',
      name: 'Reaction',
      description: 'Teste deine Reaktion!',
      icon: 'bolt',
      available: false,
    },
  ];

  startGame(game: GameInfo): void {
    if (!game.available) return;

    this.dialogRef.close();

    if (game.id === 'arkanoid') {
      this.dialog.open(ArkanoidGameComponent, {
        width: '95vw',
        maxWidth: '800px',
        height: 'auto',
        maxHeight: '95vh',
        panelClass: ['dark-dialog', 'game-dialog'],
        disableClose: true,
      });
    }
  }
}
