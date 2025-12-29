import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { WeinfestShooterEngine, GameState } from './weinfest-shooter-engine';
import { CreditService } from '../../../../core/services/credit.service';

@Component({
  selector: 'app-weinfest-shooter-game',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="weinfest-container">
      <!-- Game Header -->
      <div class="game-header">
        <div class="header-left">
          <div class="balance-display" [class.negative]="balance() < 0">
            <img src="icons/nervbox-coin.svg" alt="" class="coin-icon" />
            <span class="balance-value">{{ balance() >= 0 ? '+' : '' }}{{ balance() }} N$</span>
          </div>
          <div class="stats-display">
            <span class="hits">
              <mat-icon>check_circle</mat-icon>
              {{ hits() }}
            </span>
            <span class="misses">
              <mat-icon>cancel</mat-icon>
              {{ misses() }}
            </span>
          </div>
        </div>

        <div class="accuracy-display">
          <span class="accuracy-label">ACCURACY</span>
          <span class="accuracy-value">{{ accuracy() }}%</span>
        </div>

        <button mat-icon-button class="close-btn" (click)="confirmExit()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Game Canvas -->
      <div class="canvas-container">
        <canvas
          #gameCanvas
          [width]="canvasWidth"
          [height]="canvasHeight"
          class="game-canvas"
          (mousemove)="onMouseMove($event)"
          (click)="onCanvasClick($event)"
          (contextmenu)="$event.preventDefault()"
        ></canvas>

        <!-- Ready Overlay -->
        @if (gameState() === 'ready') {
          <div class="overlay start-overlay" (click)="startGame()">
            <div class="overlay-icon-container">
              <span class="wine-emoji">🍷</span>
            </div>
            <h3>WEINFEST SHOOTER</h3>
            <p class="game-desc">Schiesse die Weinflaschen ab!</p>
            <div class="reward-info">
              <div class="reward-item positive">
                <mat-icon>add_circle</mat-icon>
                <span>+3 N$ pro Treffer</span>
              </div>
              <div class="reward-item negative">
                <mat-icon>remove_circle</mat-icon>
                <span>-2 N$ pro Miss</span>
              </div>
            </div>
            <button mat-raised-button color="primary" class="start-btn">
              <mat-icon>sports_esports</mat-icon>
              Los geht's!
            </button>
            <p class="controls-hint">Klicken zum Schiessen</p>
          </div>
        }

        <!-- Paused Overlay -->
        @if (gameState() === 'paused') {
          <div class="overlay pause-overlay">
            <mat-icon class="overlay-icon">pause_circle</mat-icon>
            <h3>Pausiert</h3>
            <p class="current-balance" [class.negative]="balance() < 0">
              Balance: {{ balance() >= 0 ? '+' : '' }}{{ balance() }} N$
            </p>
            <div class="overlay-actions">
              <button mat-raised-button color="primary" (click)="resumeGame()">
                <mat-icon>play_arrow</mat-icon>
                Weiterspielen
              </button>
              <button mat-stroked-button (click)="cashOut()">
                <mat-icon>savings</mat-icon>
                Auscashen
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Game Footer -->
      <div class="game-footer">
        <button mat-button (click)="togglePause()" [disabled]="gameState() !== 'playing'">
          <mat-icon>pause</mat-icon>
          Pause
        </button>
        <button mat-button (click)="cashOut()" [disabled]="gameState() !== 'playing'">
          <mat-icon>savings</mat-icon>
          Auscashen
        </button>
        <span class="footer-hint">ESC = Pause</span>
      </div>
    </div>
  `,
  styles: `
    .weinfest-container {
      display: flex;
      flex-direction: column;
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
      user-select: none;
    }

    /* Game Header */
    .game-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(90deg, rgba(139, 69, 19, 0.3) 0%, rgba(128, 0, 128, 0.3) 100%);
      border-bottom: 1px solid rgba(139, 69, 19, 0.5);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .balance-display {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.4);
      border-radius: 8px;
      transition: all 0.3s ease;
    }

    .balance-display.negative {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
    }

    .coin-icon {
      width: 20px;
      height: 20px;
    }

    .balance-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 700;
      color: #22c55e;
    }

    .balance-display.negative .balance-value {
      color: #ef4444;
    }

    .stats-display {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .hits,
    .misses {
      display: flex;
      align-items: center;
      gap: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
    }

    .hits {
      color: #22c55e;
    }

    .hits mat-icon,
    .misses mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .misses {
      color: #ef4444;
    }

    .accuracy-display {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4px 12px;
      background: rgba(147, 51, 234, 0.2);
      border: 1px solid rgba(147, 51, 234, 0.4);
      border-radius: 8px;
    }

    .accuracy-label {
      font-size: 9px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 1px;
    }

    .accuracy-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      color: #9333ea;
    }

    .close-btn {
      color: rgba(255, 255, 255, 0.5);
      transition: color 0.2s ease;
    }

    .close-btn:hover {
      color: #ef4444;
    }

    /* Canvas Container */
    .canvas-container {
      position: relative;
      display: flex;
      justify-content: center;
      background: #0a0a0a;
    }

    .game-canvas {
      display: block;
      cursor: none;
      max-width: 100%;
      height: auto;
    }

    /* Overlays */
    .overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10, 10, 10, 0.95);
      border: 2px solid rgba(139, 69, 19, 0.6);
      border-radius: 20px;
      padding: 32px 48px;
      text-align: center;
      z-index: 10;
      backdrop-filter: blur(10px);
      box-shadow: 0 0 40px rgba(139, 69, 19, 0.4);
    }

    .overlay-icon-container {
      margin-bottom: 16px;
    }

    .wine-emoji {
      font-size: 72px;
      filter: drop-shadow(0 0 20px rgba(128, 0, 128, 0.5));
      animation: wobble 2s ease-in-out infinite;
    }

    @keyframes wobble {
      0%,
      100% {
        transform: rotate(-5deg);
      }
      50% {
        transform: rotate(5deg);
      }
    }

    .overlay-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #8b4513 0%, #800080 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .overlay h3 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, #8b4513 0%, #800080 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 12px;
      letter-spacing: 2px;
    }

    .game-desc {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 20px;
    }

    .reward-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }

    .reward-item {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
    }

    .reward-item.positive {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #22c55e;
    }

    .reward-item.negative {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }

    .reward-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .start-btn {
      background: linear-gradient(135deg, #8b4513 0%, #800080 100%) !important;
      padding: 10px 36px !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      margin-bottom: 16px;
      animation: pulse-btn 2s ease-in-out infinite;
    }

    .start-btn mat-icon {
      margin-right: 8px;
    }

    @keyframes pulse-btn {
      0%,
      100% {
        box-shadow: 0 4px 20px rgba(139, 69, 19, 0.4);
      }
      50% {
        box-shadow: 0 4px 30px rgba(139, 69, 19, 0.7);
      }
    }

    .start-overlay {
      cursor: pointer;
    }

    .controls-hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
    }

    .current-balance {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 700;
      color: #22c55e;
      margin: 16px 0;
    }

    .current-balance.negative {
      color: #ef4444;
    }

    .overlay-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
    }

    .overlay-actions button {
      min-width: 200px;
    }

    .overlay-actions button[color='primary'] {
      background: linear-gradient(135deg, #8b4513 0%, #800080 100%);
    }

    .overlay-actions button mat-icon {
      margin-right: 8px;
    }

    /* Game Footer */
    .game-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: rgba(139, 69, 19, 0.15);
      border-top: 1px solid rgba(139, 69, 19, 0.3);
    }

    .game-footer button {
      color: rgba(255, 255, 255, 0.6);
    }

    .game-footer button mat-icon {
      margin-right: 4px;
    }

    .footer-hint {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.3);
    }

    /* Responsive */
    @media (max-width: 600px) {
      .overlay {
        padding: 24px 32px;
        width: 90%;
        max-width: 320px;
      }

      .overlay h3 {
        font-size: 22px;
      }

      .wine-emoji {
        font-size: 56px;
      }

      .game-header {
        padding: 8px 12px;
        flex-wrap: wrap;
        gap: 8px;
      }

      .header-left {
        gap: 12px;
      }

      .balance-value {
        font-size: 16px;
      }

      .stats-display {
        gap: 10px;
      }
    }
  `,
})
export class WeinfestShooterGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly dialogRef = inject(MatDialogRef<WeinfestShooterGameComponent>);
  private readonly creditService = inject(CreditService);

  private bgMusic: HTMLAudioElement | null = null;

  readonly balance = signal(0);
  readonly hits = signal(0);
  readonly misses = signal(0);
  readonly gameState = signal<GameState>('ready');

  readonly accuracy = computed(() => {
    const total = this.hits() + this.misses();
    if (total === 0) return 0;
    return Math.round((this.hits() / total) * 100);
  });

  // Canvas dimensions (Portrait mode)
  readonly canvasWidth = 400;
  readonly canvasHeight = 700;

  private engine!: WeinfestShooterEngine;
  private animationId = 0;
  private lastFrameTime = 0;

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.gameState() === 'playing') {
        this.togglePause();
      } else if (this.gameState() === 'paused') {
        this.resumeGame();
      }
    }
  }

  ngAfterViewInit(): void {
    // Start background music
    this.bgMusic = new Audio('assets/sounds/boehmischer-traum.mp3');
    this.bgMusic.loop = true;
    this.bgMusic.volume = 1.0;
    this.bgMusic.currentTime = 24; // Start at 24 seconds
    this.bgMusic.play().catch(() => {});

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (ctx) {
      this.engine = new WeinfestShooterEngine(ctx, this.canvasWidth, this.canvasHeight);

      // Set up callbacks
      this.engine.onBalanceChange = bal => this.balance.set(bal);
      this.engine.onStatsChange = (h, m) => {
        this.hits.set(h);
        this.misses.set(m);
      };

      // Sound hooks
      this.engine.playShotSound = () => {
        const audio = new Audio('assets/sounds/desert-eagle-gunshot-14622.mp3');
        audio.volume = 0.4;
        audio.play().catch(() => {});
      };
      this.engine.playBreakSound = () => {
        const audio = new Audio('assets/sounds/glass-hit-192119.mp3');
        audio.volume = 0.6;
        audio.play().catch(() => {});
      };

      // Load assets and render initial state
      this.engine.loadAssets().then(() => {
        this.engine.init();
        this.engine.render();
      });
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (this.gameState() === 'playing' || this.gameState() === 'ready') {
      const canvas = this.canvasRef.nativeElement;
      const rect = canvas.getBoundingClientRect();
      const scaleX = this.canvasWidth / rect.width;
      const scaleY = this.canvasHeight / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      this.engine.setMousePosition(x, y);

      if (this.gameState() === 'ready') {
        this.engine.render();
      }
    }
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.gameState() === 'ready') {
      this.startGame();
      return;
    }

    if (this.gameState() === 'playing') {
      // Update mouse position first
      const canvas = this.canvasRef.nativeElement;
      const rect = canvas.getBoundingClientRect();
      const scaleX = this.canvasWidth / rect.width;
      const scaleY = this.canvasHeight / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      this.engine.setMousePosition(x, y);

      // Shoot
      this.engine.shoot();
    }
  }

  startGame(): void {
    this.engine.init();
    this.gameState.set('playing');
    this.lastFrameTime = performance.now();
    this.startGameLoop();
  }

  private startGameLoop(): void {
    const loop = (currentTime: number) => {
      if (this.gameState() !== 'playing') return;

      const deltaTime = currentTime - this.lastFrameTime;
      this.lastFrameTime = currentTime;

      this.engine.update(deltaTime);
      this.engine.render();

      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  private stopGameLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  togglePause(): void {
    if (this.gameState() === 'playing') {
      this.stopGameLoop();
      this.gameState.set('paused');
    }
  }

  resumeGame(): void {
    if (this.gameState() === 'paused') {
      this.gameState.set('playing');
      this.lastFrameTime = performance.now();
      this.startGameLoop();
    }
  }

  cashOut(): void {
    this.stopGameLoop();
    const finalBalance = this.balance();
    const finalHits = this.hits();
    const finalMisses = this.misses();

    // Submit result to backend
    this.creditService
      .submitShooterGameResult('Weinfest Shooter', finalBalance, finalHits, finalMisses)
      .subscribe({
        next: () => {
          this.dialogRef.close({ balance: finalBalance, hits: finalHits, misses: finalMisses });
        },
        error: () => {
          // Close anyway even if submission fails
          this.dialogRef.close({ balance: finalBalance, hits: finalHits, misses: finalMisses });
        },
      });
  }

  confirmExit(): void {
    this.cashOut();
  }

  ngOnDestroy(): void {
    this.stopGameLoop();
    // Stop background music
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.bgMusic = null;
    }
  }
}
