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
import { ArkanoidEngine, GameState } from './arkanoid-engine';
import { SoundService } from '../../../../core/services/sound.service';

@Component({
  selector: 'app-arkanoid-game',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="arkanoid-container">
      <!-- Game Header -->
      <div class="game-header">
        <div class="header-left">
          <div class="score-display">
            <mat-icon>stars</mat-icon>
            <span class="score-value">{{ score() }}</span>
          </div>
          <div class="level-display">
            <span class="level-label">LVL</span>
            <span class="level-value">{{ level() }}</span>
          </div>
        </div>

        <div class="lives-display">
          @for (life of livesArray(); track $index) {
            <mat-icon class="heart">favorite</mat-icon>
          }
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
          (touchmove)="onTouchMove($event)"
          (click)="onCanvasClick()"
        ></canvas>

        <!-- Ready Overlay -->
        @if (gameState() === 'ready') {
          <div class="overlay start-overlay" (click)="onCanvasClick()">
            <mat-icon class="overlay-icon">sports_tennis</mat-icon>
            <h3>Arkanoid</h3>
            <p class="level-info">Level {{ level() }}</p>
            <button mat-raised-button color="primary" class="start-btn">
              <mat-icon>play_arrow</mat-icon>
              Spiel starten
            </button>
            <p class="controls-hint">Steuerung: Maus, Touch, Pfeiltasten oder A/D</p>
          </div>
        }

        <!-- Paused Overlay -->
        @if (gameState() === 'paused') {
          <div class="overlay pause-overlay">
            <mat-icon class="overlay-icon">pause_circle</mat-icon>
            <h3>Pausiert</h3>
            <div class="overlay-actions">
              <button mat-raised-button color="primary" (click)="resumeGame()">
                <mat-icon>play_arrow</mat-icon>
                Weiterspielen
              </button>
              <button mat-stroked-button (click)="exitGame()">Beenden</button>
            </div>
          </div>
        }

        <!-- Game Over Overlay -->
        @if (gameState() === 'gameover') {
          <div class="overlay gameover-overlay">
            <mat-icon class="overlay-icon dead">sentiment_very_dissatisfied</mat-icon>
            <h3>Game Over!</h3>
            <p class="final-score">Score: {{ score() }}</p>
            <p class="final-level">Erreicht: Level {{ level() }}</p>
            <div class="overlay-actions">
              <button mat-raised-button color="primary" (click)="restartGame()">
                <mat-icon>replay</mat-icon>
                Nochmal spielen
              </button>
              <button mat-stroked-button (click)="exitGame()">Beenden</button>
            </div>
          </div>
        }

        <!-- Level Complete Overlay -->
        @if (gameState() === 'won') {
          <div class="overlay win-overlay">
            <mat-icon class="overlay-icon win">emoji_events</mat-icon>
            <h3>Level geschafft!</h3>
            <p class="final-score">Score: {{ score() }}</p>
            <div class="overlay-actions">
              <button mat-raised-button color="primary" (click)="nextLevel()">
                <mat-icon>arrow_forward</mat-icon>
                Level {{ level() + 1 }}
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
        <span class="footer-hint">ESC = Pause</span>
      </div>
    </div>
  `,
  styles: `
    .arkanoid-container {
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
      background: linear-gradient(90deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%);
      border-bottom: 1px solid rgba(147, 51, 234, 0.3);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .score-display {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fbbf24;
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 700;
    }

    .score-display mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .level-display {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(147, 51, 234, 0.2);
      border: 1px solid rgba(147, 51, 234, 0.4);
      border-radius: 6px;
    }

    .level-label {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 1px;
    }

    .level-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      color: #9333ea;
    }

    .lives-display {
      display: flex;
      gap: 4px;
    }

    .heart {
      color: #ec4899;
      font-size: 22px;
      width: 22px;
      height: 22px;
      filter: drop-shadow(0 0 4px rgba(236, 72, 153, 0.5));
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
      border: 1px solid rgba(147, 51, 234, 0.5);
      border-radius: 20px;
      padding: 32px 48px;
      text-align: center;
      z-index: 10;
      backdrop-filter: blur(10px);
      box-shadow: 0 0 40px rgba(147, 51, 234, 0.3);
    }

    .overlay-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .overlay-icon.dead {
      background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .overlay-icon.win {
      background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .overlay h3 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 16px;
    }

    .level-info {
      font-size: 16px;
      color: #9333ea;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .start-btn {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      padding: 8px 32px !important;
      font-size: 16px !important;
      margin-bottom: 16px;
      animation: pulse-btn 2s ease-in-out infinite;
    }

    .start-btn mat-icon {
      margin-right: 8px;
    }

    @keyframes pulse-btn {
      0%,
      100% {
        box-shadow: 0 4px 20px rgba(147, 51, 234, 0.4);
      }
      50% {
        box-shadow: 0 4px 30px rgba(147, 51, 234, 0.7);
      }
    }

    .start-overlay {
      cursor: pointer;
    }

    .controls-hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
    }

    .final-score {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      color: #fbbf24;
      font-weight: 700;
      margin: 16px 0 8px;
    }

    .final-level {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 24px;
    }

    .overlay-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
    }

    .overlay-actions button {
      min-width: 180px;
    }

    .overlay-actions button[color='primary'] {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
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
      background: rgba(147, 51, 234, 0.1);
      border-top: 1px solid rgba(147, 51, 234, 0.2);
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
        max-width: 300px;
      }

      .overlay h3 {
        font-size: 22px;
      }

      .overlay-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
      }

      .final-score {
        font-size: 20px;
      }

      .game-header {
        padding: 8px 12px;
      }

      .score-display {
        font-size: 16px;
      }

      .heart {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
  `,
})
export class ArkanoidGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly dialogRef = inject(MatDialogRef<ArkanoidGameComponent>);
  private readonly soundService = inject(SoundService);

  private readonly BRICK_SOUND_HASH = 'd2f9a5de833dcc12171ec0e101250425';
  private brickSound: HTMLAudioElement | null = null;

  readonly score = signal(0);
  readonly lives = signal(3);
  readonly level = signal(1);
  readonly gameState = signal<GameState>('ready');

  readonly livesArray = computed(() => Array(this.lives()).fill(0));

  readonly canvasWidth = 700;
  readonly canvasHeight = 500;

  private engine!: ArkanoidEngine;
  private animationId = 0;
  private keyboardPaddleX = 350; // Start in der Mitte
  private readonly keyboardSpeed = 7;
  private keysPressed = new Set<string>();

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Escape für Pause
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.gameState() === 'playing') {
        this.togglePause();
      } else if (this.gameState() === 'paused') {
        this.resumeGame();
      }
      return;
    }

    // Space/Enter zum Starten
    if ((event.key === ' ' || event.key === 'Enter') && this.gameState() === 'ready') {
      event.preventDefault();
      this.onCanvasClick();
      return;
    }

    // Track pressed keys for smooth movement
    const key = event.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a' || key === 'arrowright' || key === 'd') {
      event.preventDefault();
      this.keysPressed.add(key);
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyup(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    this.keysPressed.delete(key);
  }

  @HostListener('window:blur')
  handleBlur(): void {
    // Clear all keys when window loses focus
    this.keysPressed.clear();
  }

  private processKeyboardInput(): void {
    if (this.keysPressed.has('arrowleft') || this.keysPressed.has('a')) {
      this.keyboardPaddleX = Math.max(50, this.keyboardPaddleX - this.keyboardSpeed);
      this.engine.movePaddle(this.keyboardPaddleX);
    }
    if (this.keysPressed.has('arrowright') || this.keysPressed.has('d')) {
      this.keyboardPaddleX = Math.min(this.canvasWidth - 50, this.keyboardPaddleX + this.keyboardSpeed);
      this.engine.movePaddle(this.keyboardPaddleX);
    }
  }

  @HostListener('window:mousemove', ['$event'])
  handleWindowMouseMove(event: MouseEvent): void {
    this.updatePaddlePosition(event.clientX);
  }

  @HostListener('window:touchmove', ['$event'])
  handleWindowTouchMove(event: TouchEvent): void {
    if (event.touches[0]) {
      this.updatePaddlePosition(event.touches[0].clientX);
    }
  }

  private updatePaddlePosition(clientX: number): void {
    if (this.gameState() === 'playing' || this.gameState() === 'ready') {
      const canvas = this.canvasRef?.nativeElement;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = this.canvasWidth / rect.width;
      const x = (clientX - rect.left) * scaleX;

      // Clamp to canvas bounds
      const clampedX = Math.max(0, Math.min(this.canvasWidth, x));
      this.engine.movePaddle(clampedX);

      // Sync keyboard position
      this.keyboardPaddleX = clampedX;

      if (this.gameState() === 'ready') {
        this.engine.render();
      }
    }
  }

  ngAfterViewInit(): void {
    // Preload brick sound for fast playback
    this.brickSound = this.soundService.preloadForBrowser(this.BRICK_SOUND_HASH);

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (ctx) {
      this.engine = new ArkanoidEngine(ctx, this.canvasWidth, this.canvasHeight);
      this.engine.onScoreChange = score => this.score.set(score);
      this.engine.onLivesChange = lives => this.lives.set(lives);
      this.engine.onGameOver = () => {
        this.stopGameLoop();
        this.gameState.set('gameover');
      };
      this.engine.onLevelComplete = () => {
        this.stopGameLoop();
        this.gameState.set('won');
      };
      this.engine.onBrickDestroyed = () => {
        // Play sound in browser only (not on Pi system)
        if (this.brickSound) {
          this.brickSound.currentTime = 0;
          this.brickSound.play().catch(() => {});
        }
      };
      this.engine.init();
    }
  }

  onCanvasClick(): void {
    if (this.gameState() === 'ready') {
      this.gameState.set('playing');
      this.startGameLoop();
    }
  }

  onTouchMove(event: TouchEvent): void {
    // Prevent scrolling on touch devices
    event.preventDefault();
  }

  private startGameLoop(): void {
    const loop = () => {
      if (this.gameState() !== 'playing') return;
      this.processKeyboardInput();
      this.engine.update();
      this.engine.render();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
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
      this.startGameLoop();
    }
  }

  restartGame(): void {
    this.score.set(0);
    this.lives.set(3);
    this.level.set(1);
    this.engine.reset();
    this.gameState.set('ready');
  }

  nextLevel(): void {
    const newLevel = this.level() + 1;
    this.level.set(newLevel);
    this.engine.nextLevel(newLevel);
    this.gameState.set('ready');
  }

  confirmExit(): void {
    this.stopGameLoop();
    this.dialogRef.close({ score: this.score(), level: this.level() });
  }

  exitGame(): void {
    this.stopGameLoop();
    this.dialogRef.close({ score: this.score(), level: this.level() });
  }

  ngOnDestroy(): void {
    this.stopGameLoop();
  }
}
