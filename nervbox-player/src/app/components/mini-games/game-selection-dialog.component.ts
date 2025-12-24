import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ArkanoidGameComponent } from './games/arkanoid/arkanoid-game.component';
import { HotdogGameComponent } from './games/hotdog-katapult/hotdog-game.component';
import { TowerDefenseComponent } from './games/tower-defense/tower-defense.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-game-selection-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="game-selection-dialog">
      <div class="dialog-header">
        <div class="header-glow"></div>
        <mat-icon class="title-icon spinning">videogame_asset</mat-icon>
        <h2>MINI GAMES</h2>
        <div class="coin-display">
          <img src="icons/nervbox-coin.svg" alt="" class="coin-icon bouncing">
          <span>Earn N$</span>
        </div>
      </div>

      <mat-dialog-content>
        <!-- Games Grid -->
        <div class="games-grid">
          <!-- Arkanoid -->
          <button class="game-card arkanoid" (click)="startArkanoid()">
            <div class="game-glow"></div>
            <div class="game-badge">SPIELEN</div>
            <mat-icon class="game-icon">sports_tennis</mat-icon>
            <span class="game-name">ARKANOID</span>
            <span class="game-desc">Zerstoere alle Bloecke!</span>
            <div class="game-reward">
              <img src="icons/nervbox-coin.svg" alt="" class="mini-coin">
              <span>N$ pro Level</span>
            </div>
          </button>

          <!-- Hotdog Katapult -->
          <button class="game-card hotdog" (click)="startHotdog()">
            <div class="game-glow"></div>
            <div class="game-badge">SPIELEN</div>
            <span class="game-emoji">🌭</span>
            <span class="game-name">HOTDOG KATAPULT</span>
            <span class="game-desc">Stopfe die Mäuler!</span>
            <div class="game-reward">
              <img src="icons/nervbox-coin.svg" alt="" class="mini-coin">
              <span>1 N$/Treffer</span>
            </div>
          </button>

          <!-- Tower Defense (Admin only) -->
          @if (isAdmin()) {
            <button class="game-card tower-defense" (click)="startTowerDefense()">
              <div class="game-glow"></div>
              <div class="game-badge new">BETA</div>
              <mat-icon class="game-icon tower">cell_tower</mat-icon>
              <span class="game-name">TOWER DEFENSE</span>
              <span class="game-desc">Verteidige Erlenbach!</span>
              <div class="game-reward">
                <img src="icons/nervbox-coin.svg" alt="" class="mini-coin">
                <span>N$ pro Welle</span>
              </div>
            </button>
          }
        </div>

        <!-- Coming Soon Section -->
        <div class="coming-soon-section">
          <div class="coming-soon-header">
            <div class="coming-soon-line"></div>
            <span class="coming-soon-title">
              <mat-icon>rocket_launch</mat-icon>
              COMING SOON
            </span>
            <div class="coming-soon-line"></div>
          </div>

          <div class="coming-soon-games">
            <div class="coming-soon-card">
              <mat-icon>local_florist</mat-icon>
              <span>Mary Haze - The Game</span>
            </div>
            <div class="coming-soon-card">
              <mat-icon>search</mat-icon>
              <span>Fehlersuche mit Paddi</span>
            </div>
            <div class="coming-soon-card">
              <mat-icon>local_bar</mat-icon>
              <span>Mixe das perfekte Spezi</span>
            </div>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button mat-dialog-close>Schliessen</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    .game-selection-dialog {
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 24px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%);
      border-bottom: 2px solid rgba(147, 51, 234, 0.5);
      position: relative;
      overflow: hidden;
    }

    .header-glow {
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(147, 51, 234, 0.3) 0%, transparent 50%);
      animation: rotate-glow 10s linear infinite;
    }

    @keyframes rotate-glow {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .title-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #ec4899;
      position: relative;
      z-index: 1;
    }

    .title-icon.spinning {
      animation: wiggle 2s ease-in-out infinite;
    }

    @keyframes wiggle {
      0%, 100% { transform: rotate(-5deg); }
      50% { transform: rotate(5deg); }
    }

    .dialog-header h2 {
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 4px;
      background: linear-gradient(135deg, #fff 0%, #ec4899 50%, #9333ea 100%);
      background-size: 200% 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradient-shift 3s ease infinite;
      position: relative;
      z-index: 1;
    }

    @keyframes gradient-shift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    .coin-display {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      padding: 8px 16px;
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid rgba(251, 191, 36, 0.4);
      border-radius: 20px;
      position: relative;
      z-index: 1;
    }

    .coin-icon {
      width: 24px;
      height: 24px;
    }

    .coin-icon.bouncing {
      animation: bounce 1s ease-in-out infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    .coin-display span {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 14px;
      color: #fbbf24;
    }

    mat-dialog-content {
      padding: 24px !important;
      max-height: 65vh;
      overflow-y: auto;
    }

    /* Games Grid */
    .games-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .game-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 16px;
      border-radius: 16px;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      border: 2px solid;
    }

    .game-card.arkanoid {
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%);
      border-color: rgba(147, 51, 234, 0.5);
    }

    .game-card.hotdog {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 179, 8, 0.1) 100%);
      border-color: rgba(249, 115, 22, 0.5);
    }

    .game-card.tower-defense {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%);
      border-color: rgba(34, 197, 94, 0.5);
    }

    .game-card:hover {
      transform: translateY(-6px) scale(1.02);
    }

    .game-card.arkanoid:hover {
      border-color: #9333ea;
      box-shadow: 0 15px 40px rgba(147, 51, 234, 0.4), 0 0 50px rgba(147, 51, 234, 0.2);
    }

    .game-card.hotdog:hover {
      border-color: #f97316;
      box-shadow: 0 15px 40px rgba(249, 115, 22, 0.4), 0 0 50px rgba(249, 115, 22, 0.2);
    }

    .game-card.tower-defense:hover {
      border-color: #22c55e;
      box-shadow: 0 15px 40px rgba(34, 197, 94, 0.4), 0 0 50px rgba(34, 197, 94, 0.2);
    }

    .game-glow {
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
      animation: shine 3s ease-in-out infinite;
    }

    @keyframes shine {
      0% { left: -100%; }
      50%, 100% { left: 100%; }
    }

    .game-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      font-size: 9px;
      font-weight: 800;
      padding: 4px 10px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border-radius: 12px;
      color: white;
      letter-spacing: 0.5px;
    }

    .game-badge.new {
      background: linear-gradient(135deg, #f97316 0%, #eab308 100%);
      animation: pulse-new 1.5s ease-in-out infinite;
    }

    @keyframes pulse-new {
      0%, 100% { box-shadow: 0 2px 10px rgba(249, 115, 22, 0.4); }
      50% { box-shadow: 0 2px 20px rgba(249, 115, 22, 0.8); }
    }

    .game-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #9333ea;
      filter: drop-shadow(0 0 15px rgba(147, 51, 234, 0.5));
      animation: icon-float 3s ease-in-out infinite;
    }

    .game-icon.tower {
      color: #22c55e;
      filter: drop-shadow(0 0 15px rgba(34, 197, 94, 0.5));
    }

    .game-emoji {
      font-size: 48px;
      filter: drop-shadow(0 0 15px rgba(249, 115, 22, 0.5));
      animation: icon-float 3s ease-in-out infinite;
    }

    @keyframes icon-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }

    .game-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 800;
      color: white;
      letter-spacing: 1px;
      text-align: center;
    }

    .game-desc {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
    }

    .game-reward {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: 10px;
      margin-top: 4px;
    }

    .mini-coin {
      width: 16px;
      height: 16px;
    }

    .game-reward span {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #fbbf24;
    }

    /* Coming Soon Section */
    .coming-soon-section {
      opacity: 0.7;
    }

    .coming-soon-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .coming-soon-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(147, 51, 234, 0.5), transparent);
    }

    .coming-soon-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      color: rgba(147, 51, 234, 0.8);
      letter-spacing: 2px;
    }

    .coming-soon-title mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      animation: rocket 2s ease-in-out infinite;
    }

    @keyframes rocket {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-3px); }
    }

    .coming-soon-games {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .coming-soon-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed rgba(147, 51, 234, 0.3);
      border-radius: 12px;
      transition: all 0.3s ease;
    }

    .coming-soon-card:hover {
      background: rgba(147, 51, 234, 0.1);
      border-color: rgba(147, 51, 234, 0.5);
      transform: translateY(-2px);
    }

    .coming-soon-card mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: rgba(147, 51, 234, 0.6);
    }

    .coming-soon-card span {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 0.5px;
    }

    .coming-soon-hint {
      text-align: center;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.3);
      margin-top: 16px;
      font-style: italic;
    }

    mat-dialog-actions {
      padding: 12px 24px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    mat-dialog-actions button {
      color: rgba(255, 255, 255, 0.7);
    }

    mat-dialog-actions button:hover {
      color: rgba(255, 255, 255, 0.9);
    }

    @media (max-width: 500px) {
      .coming-soon-games {
        grid-template-columns: repeat(2, 1fr);
      }

      .featured-content {
        flex-direction: column;
        text-align: center;
      }

      .featured-name {
        font-size: 22px;
      }

      .coin-display span {
        display: none;
      }
    }
  `,
})
export class GameSelectionDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<GameSelectionDialogComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  startArkanoid(): void {
    this.dialogRef.close();
    this.dialog.open(ArkanoidGameComponent, {
      width: '95vw',
      maxWidth: '800px',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  startHotdog(): void {
    this.dialogRef.close();
    this.dialog.open(HotdogGameComponent, {
      width: 'auto',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }

  startTowerDefense(): void {
    this.dialogRef.close();
    this.dialog.open(TowerDefenseComponent, {
      width: 'auto',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '95vh',
      panelClass: ['dark-dialog', 'game-dialog'],
      disableClose: true,
    });
  }
}
