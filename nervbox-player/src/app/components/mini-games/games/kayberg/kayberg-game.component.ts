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
import { KaybergEngine } from './engine/kayberg-engine';
import { GameState } from './kayberg.types';
import { CreditService } from '../../../../core/services/credit.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { fitCanvas } from '../../game-shared';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GameOverlayComponent } from '../../game-overlay.component';
import { GAME_INFO } from '../../game-info';

@Component({
  selector: 'app-kayberg-game',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, GameExitConfirmComponent, GameFrameComponent, GameOverlayComponent],
  templateUrl: './kayberg-game.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./kayberg-game.component.scss'],
})
export class KaybergGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  readonly info = GAME_INFO.kayberg;
  private stopFit?: () => void;
  @ViewChild(GameExitConfirmComponent) exitConfirm?: GameExitConfirmComponent;

  private readonly dialogRef = inject(MatDialogRef<KaybergGameComponent>);
  private readonly creditService = inject(CreditService);

  readonly score = signal(0);
  readonly lives = signal(3);
  readonly level = signal(1);
  readonly gameState = signal<GameState>('ready');
  readonly levelReward = signal(0);
  readonly preyCaught = signal(0);
  readonly preyRequired = signal(5);

  readonly waveProgress = computed(() => `${this.preyCaught()}/${this.preyRequired()}`);
  readonly stats = computed<GameStat[]>(() => [
    { label: 'SCORE', value: this.score() },
    { label: 'LEVEL', value: this.level() },
    { label: 'BEUTE', value: this.waveProgress() },
    { label: 'LEBEN', pips: this.lives(), pipsMax: 3, pipIcon: 'favorite' },
  ]);

  readonly canvasWidth = 900;
  readonly canvasHeight = 600;

  private engine!: KaybergEngine;
  private animationId = 0;
  private lastTime = 0;
  private isPointerLocked = false;
  private closing = false;

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Escape wird von der Beenden-Abfrage (app-game-exit-confirm) behandelt
    if (event.key === 'Escape') return;

    if ((event.key === ' ' || event.key === 'Enter') && this.gameState() === 'ready') {
      event.preventDefault();
      this.startGame();
      return;
    }

    if (this.gameState() === 'playing') {
      this.engine?.onKeyDown(event.key);
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyup(event: KeyboardEvent): void {
    this.engine?.onKeyUp(event.key);
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
      this.engine.pause();
      this.stopGameLoop();
    }
  }

  onExitResumed(): void {
    if (this.pausedByConfirm && this.gameState() === 'playing') {
      this.pausedByConfirm = false;
      this.engine.resume();
      this.startGameLoop();
      this.canvasRef.nativeElement.requestPointerLock();
    }
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.stopFit = fitCanvas(
      () => this.canvasRef?.nativeElement,
      this.canvasWidth,
      this.canvasHeight,
      this.frame.root,
    );

    // Create engine
    this.engine = new KaybergEngine(canvas, this.canvasWidth, this.canvasHeight);

    // Setup callbacks
    this.engine.callbacks = {
      onScoreChange: (score) => this.score.set(score),
      onLivesChange: (lives) => this.lives.set(lives),
      onPreyCaught: () => {
        // Play catch sound (optional)
      },
      onPlayerHit: () => {
        // Screen shake effect (optional)
      },
      onLevelComplete: () => {
        this.stopGameLoop();
        this.gameState.set('won');
        // Claim reward
        this.creditService.claimMinigameReward('KaybergHunter', this.level()).subscribe({
          next: (response) => {
            this.levelReward.set(response.reward);
          },
          error: () => {
            this.levelReward.set(0);
          },
        });
      },
      onGameOver: () => {
        this.stopGameLoop();
        this.gameState.set('gameover');
      },
      onWaveProgress: (caught, required) => {
        this.preyCaught.set(caught);
        this.preyRequired.set(required);
      },
    };

    // Setup pointer lock
    canvas.addEventListener('click', () => {
      if (this.gameState() === 'playing' && !this.isPointerLocked) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.isPointerLocked;
      this.isPointerLocked = document.pointerLockElement === canvas;
      this.engine?.setPointerLocked(this.isPointerLocked);
      // Escape beendet den Pointer-Lock, ohne dass ein keydown ankommt -> Beenden-Abfrage zeigen
      if (wasLocked && !this.isPointerLocked && !this.closing && this.gameState() === 'playing') {
        this.exitConfirm?.open();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked && this.gameState() === 'playing') {
        this.engine?.onMouseMove(e.movementX, e.movementY);
      }
    });

    // Initial render
    this.engine.render();
  }

  startGame(): void {
    this.gameState.set('playing');
    this.engine.start();
    this.startGameLoop();

    // Request pointer lock
    this.canvasRef.nativeElement.requestPointerLock();
  }

  private startGameLoop(): void {
    this.lastTime = performance.now();

    const loop = (time: number) => {
      if (this.gameState() !== 'playing') return;

      const deltaTime = Math.min(time - this.lastTime, 100);
      this.lastTime = time;

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
    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  togglePause(): void {
    if (this.gameState() === 'playing') {
      this.stopGameLoop();
      this.engine.pause();
      this.gameState.set('paused');
    }
  }

  resumeGame(): void {
    if (this.gameState() === 'paused') {
      this.gameState.set('playing');
      this.engine.resume();
      this.startGameLoop();
      this.canvasRef.nativeElement.requestPointerLock();
    }
  }

  restartGame(): void {
    this.score.set(0);
    this.lives.set(3);
    this.level.set(1);
    this.levelReward.set(0);
    this.preyCaught.set(0);
    this.engine.reset();
    this.gameState.set('ready');
  }

  nextLevel(): void {
    const newLevel = this.engine.getLevel() + 1;
    this.level.set(newLevel);
    this.levelReward.set(0);
    this.preyCaught.set(0);
    this.engine.nextLevel();
    this.gameState.set('ready');
  }

  confirmExit(): void {
    this.closing = true;
    this.stopGameLoop();
    this.dialogRef.close({ score: this.score(), level: this.level() });
  }

  exitGame(): void {
    this.closing = true;
    this.stopGameLoop();
    this.dialogRef.close({ score: this.score(), level: this.level() });
  }

  ngOnDestroy(): void {
    this.closing = true;
    this.stopFit?.();
    this.stopGameLoop();
    this.engine?.dispose();
  }
}
