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
import { WeinfestShooterEngine, GameState } from './weinfest-shooter-engine';
import { CreditService } from '../../../../core/services/credit.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { fitCanvas } from '../../game-shared';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GameOverlayComponent } from '../../game-overlay.component';
import { GAME_INFO } from '../../game-info';

@Component({
  selector: 'app-weinfest-shooter-game',
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
      <button
        gfKeys
        type="button"
        class="nk-key nk-key--sm"
        (click)="cashOut()"
        [disabled]="gameState() !== 'playing'"
      >
        <mat-icon>savings</mat-icon>Auscashen
      </button>

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

        @if (gameState() === 'ready') {
          <app-game-overlay
            tone="start"
            [kicker]="'Modul · ' + info.title"
            [year]="info.year"
            [icon]="info.icon"
            [title]="info.title"
            [clickable]="true"
            (click)="startGame()"
          >
            <p class="nk-go__text nk-go__hide-compact">Schiesse die Weinflaschen ab!</p>
            <div class="nk-go__list">
              <span class="nk-go__row nk-go__row--pos"><mat-icon>add_circle</mat-icon>+3 N$ pro Treffer</span>
              <span class="nk-go__row nk-go__row--neg"><mat-icon>remove_circle</mat-icon>-2 N$ pro Miss</span>
            </div>
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg">
                <mat-icon>sports_esports</mat-icon>Los geht's!
              </button>
            </div>
            <p class="nk-go__hint">Klicken zum Schiessen</p>
          </app-game-overlay>
        }

        @if (gameState() === 'paused') {
          <app-game-overlay tone="pause" kicker="Pause" icon="pause" title="Pausiert">
            <span class="nk-counter nk-go__score" [class.nk-go__score--neg]="balance() < 0">
              BILANZ {{ balance() >= 0 ? '+' : '' }}{{ balance() }} N$
            </span>
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg" (click)="resumeGame()">
                <mat-icon>play_arrow</mat-icon>Weiterspielen
              </button>
              <button type="button" class="nk-key nk-key--ghost" (click)="cashOut()">
                <mat-icon>savings</mat-icon>Auscashen
              </button>
            </div>
          </app-game-overlay>
        }
      </div>

      <app-game-exit-confirm
        [hint]="exitHint()"
        (opened)="onExitOpened()"
        (resumed)="onExitResumed()"
        (exit)="cashOut()"
      />
    </app-game-frame>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    /* Spielfeld: eigener Look des Spiels; Gehaeuse/Overlays kommen aus app-game-frame / app-game-overlay */
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
export class WeinfestShooterGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  readonly info = GAME_INFO.weinfest;
  private stopFit?: () => void;

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

  readonly stats = computed<GameStat[]>(() => {
    const b = this.balance();
    return [
      { label: 'BILANZ N$', value: (b >= 0 ? '+' : '') + b, tone: b < 0 ? 'neg' : undefined },
      { label: 'TREFFER', value: this.hits() },
      { label: 'MISS', value: this.misses() },
      { label: 'QUOTE', value: this.accuracy() + '%' },
    ];
  });

  // Canvas dimensions (Landscape mode - matches 1376x768 background)
  readonly canvasWidth = 800;
  readonly canvasHeight = 448;

  private engine!: WeinfestShooterEngine;
  private animationId = 0;
  private lastFrameTime = 0;

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Escape wird von der Beenden-Abfrage (app-game-exit-confirm) behandelt
    if (event.key === 'Escape') event.preventDefault();
  }

  exitHint(): string {
    const b = this.balance();
    if (this.gameState() === 'gameover') return '';
    const txt = (b >= 0 ? '+' : '') + b + ' N$';
    return `"Beenden" rechnet deinen aktuellen Stand sofort ab: ${txt} (Treffer ${this.hits()}, Fehlschüsse ${this.misses()}).`;
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
      this.lastFrameTime = performance.now();
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
      this.engine.onBalanceChange = (bal) => this.balance.set(bal);
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
    this.stopFit?.();
    this.stopGameLoop();
    // Stop background music
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.bgMusic = null;
    }
  }
}
