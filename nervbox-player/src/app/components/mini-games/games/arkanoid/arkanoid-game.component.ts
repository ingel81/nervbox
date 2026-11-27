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
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ArkanoidEngine, GameState } from './arkanoid-engine';
import { ApiService } from '../../../../core/services/api.service';
import { CreditService } from '../../../../core/services/credit.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { fitCanvas } from '../../game-shared';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GameOverlayComponent } from '../../game-overlay.component';
import { GAME_INFO } from '../../game-info';

@Component({
  selector: 'app-arkanoid-game',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, GameExitConfirmComponent, GameFrameComponent, GameOverlayComponent],
  template: `
    <app-game-frame
      #root
      [title]="info.title"
      [icon]="info.icon"
      [accent]="info.accent"
      [year]="info.year"
      [stats]="stats()"
      [pausable]="true"
      [pauseDisabled]="gameState() !== 'playing'"
      hint="ESC = Beenden?"
      (pause)="togglePause()"
      (closed)="confirmExit()"
    >
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

        @if (gameState() === 'ready') {
          <app-game-overlay
            tone="start"
            [kicker]="'Modul · ' + info.title"
            [year]="info.year"
            [icon]="info.icon"
            [title]="info.title"
            [clickable]="true"
            (click)="onCanvasClick()"
          >
            <p class="nk-go__text">Level {{ level() }}</p>
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg">
                <mat-icon>play_arrow</mat-icon>Spiel starten
              </button>
            </div>
            <p class="nk-go__hint">Steuerung: Maus, Touch, Pfeiltasten oder A/D</p>
          </app-game-overlay>
        }

        @if (gameState() === 'paused') {
          <app-game-overlay tone="pause" kicker="Pause" icon="pause" title="Pausiert">
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg" (click)="resumeGame()">
                <mat-icon>play_arrow</mat-icon>Weiterspielen
              </button>
              <button type="button" class="nk-key nk-key--ghost" (click)="exitGame()">Beenden</button>
            </div>
          </app-game-overlay>
        }

        @if (gameState() === 'gameover') {
          <app-game-overlay tone="over" kicker="Game Over" icon="sentiment_very_dissatisfied" title="Game Over!">
            <span class="nk-counter nk-go__score">SCORE {{ score() }}</span>
            <p class="nk-go__text">Erreicht: Level {{ level() }}</p>
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg" (click)="restartGame()">
                <mat-icon>replay</mat-icon>Nochmal spielen
              </button>
              <button type="button" class="nk-key nk-key--ghost" (click)="exitGame()">Beenden</button>
            </div>
          </app-game-overlay>
        }

        @if (gameState() === 'won') {
          <app-game-overlay tone="win" [kicker]="'Level ' + level()" icon="emoji_events" title="Level geschafft!">
            <span class="nk-counter nk-go__score">SCORE {{ score() }}</span>
            @if (levelReward() > 0) {
              <p class="nk-go__reward">+{{ levelReward() }} N$</p>
            }
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg" (click)="nextLevel()">
                <mat-icon>arrow_forward</mat-icon>Level {{ level() + 1 }}
              </button>
            </div>
          </app-game-overlay>
        }
      </div>

      <app-game-exit-confirm
        [hint]="exitHint()"
        (opened)="onExitOpened()"
        (resumed)="onExitResumed()"
        (exit)="exitGame()"
      />
    </app-game-frame>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    /* Spielfeld: eigener Look des Spiels (schwarz), Rahmen/Overlays kommen aus app-game-frame / app-game-overlay */
    .canvas-container {
      position: relative;
      display: flex;
      justify-content: center;
      background: #0a0a0a;
      border-radius: 5px;
      overflow: hidden;
    }

    .game-canvas {
      display: block;
      cursor: none;
      width: var(--fit-w, auto) !important;
      height: var(--fit-h, auto) !important;
    }
  `,
})
export class ArkanoidGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  readonly info = GAME_INFO.arkanoid;
  private stopFit?: () => void;

  private readonly dialogRef = inject(MatDialogRef<ArkanoidGameComponent>);
  private readonly api = inject(ApiService);
  private readonly creditService = inject(CreditService);

  private readonly BRICK_SOUND_HASH = 'd2f9a5de833dcc12171ec0e101250425';
  private brickSoundUrl = '';

  readonly score = signal(0);
  readonly lives = signal(3);
  readonly level = signal(1);
  readonly gameState = signal<GameState>('ready');
  readonly levelReward = signal(0);

  readonly stats = computed<GameStat[]>(() => [
    { label: 'SCORE', value: this.score() },
    { label: 'LEVEL', value: this.level() },
    { label: 'LEBEN', pips: this.lives(), pipsMax: 3, pipIcon: 'favorite' },
  ]);

  readonly canvasWidth = 700;
  readonly canvasHeight = 500;

  private engine!: ArkanoidEngine;
  private animationId = 0;
  private keyboardPaddleX = 350; // Start in der Mitte
  private readonly keyboardSpeed = 7;
  private keysPressed = new Set<string>();

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Escape wird von der Beenden-Abfrage (app-game-exit-confirm) behandelt
    if (event.key === 'Escape') return;

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
      this.keyboardPaddleX = Math.min(
        this.canvasWidth - 50,
        this.keyboardPaddleX + this.keyboardSpeed,
      );
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

  exitHint(): string {
    const st = this.gameState();
    if (st === 'playing' || st === 'paused' || st === 'ready') {
      return 'Der laufende Level ist noch nicht geschafft: sein Fortschritt geht verloren. Belohnung gibt es nur für abgeschlossene Level.';
    }
    return '';
  }

  private pausedByConfirm = false;

  onExitOpened(): void {
    if (this.gameState() === 'playing') {
      this.pausedByConfirm = true;
      this.stopGameLoop();
    }
  }

  onExitResumed(): void {
    if (this.pausedByConfirm && this.gameState() === 'playing') {
      this.pausedByConfirm = false;
      this.startGameLoop();
    }
  }

  ngAfterViewInit(): void {
    this.stopFit = fitCanvas(
      () => this.canvasRef?.nativeElement,
      this.canvasWidth,
      this.canvasHeight,
      this.frame.root,
    );
    // Set up brick sound URL
    this.brickSoundUrl = this.api.getFullUrl(`/sound/${this.BRICK_SOUND_HASH}/file`);

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (ctx) {
      this.engine = new ArkanoidEngine(ctx, this.canvasWidth, this.canvasHeight);
      this.engine.onScoreChange = (score) => this.score.set(score);
      this.engine.onLivesChange = (lives) => this.lives.set(lives);
      this.engine.onGameOver = () => {
        this.stopGameLoop();
        this.gameState.set('gameover');
      };
      this.engine.onLevelComplete = () => {
        this.stopGameLoop();
        // Claim reward for completing the level
        this.creditService.claimMinigameReward('Arkanoid', this.level()).subscribe({
          next: (response) => {
            this.levelReward.set(response.reward);
          },
          error: () => {
            // Still show win even if reward claim fails
            this.levelReward.set(0);
          },
        });
        this.gameState.set('won');
      };
      this.engine.onBrickDestroyed = () => {
        // Play sound in browser - create new Audio for each hit to allow rapid playback
        const audio = new Audio(this.brickSoundUrl);
        audio.volume = 0.5;
        audio.play().catch(() => {});
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
    this.levelReward.set(0);
    this.engine.reset();
    this.gameState.set('ready');
  }

  nextLevel(): void {
    const newLevel = this.level() + 1;
    this.level.set(newLevel);
    this.levelReward.set(0);
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
    this.stopFit?.();
    this.stopGameLoop();
  }
}
