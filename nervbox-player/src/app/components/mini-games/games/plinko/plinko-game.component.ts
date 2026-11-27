import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { PlinkoEngine } from './plinko-engine';
import { PlinkoGameState } from './plinko.types';
import { CreditService } from '../../../../core/services/credit.service';
import { ApiService } from '../../../../core/services/api.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { fitCanvas } from '../../game-shared';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GAME_INFO } from '../../game-info';

@Component({
  selector: 'app-plinko-game',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    GameExitConfirmComponent,
    GameFrameComponent,
  ],
  template: `
    <app-game-frame
      #root
      [title]="info.title"
      [icon]="info.icon"
      [accent]="info.accent"
      [year]="info.year"
      [stats]="stats()"
      hint="ESC = Beenden?"
      (closed)="exitGame()"
    >
      <div class="game-content">
        <!-- Settings Panel (links) -->
        <div class="settings-panel">
          <!-- Bet Amount -->
          <div class="setting-group">
            <label class="setting-label" for="plinko-bet">EINSATZ</label>
            <div class="bet-input-wrapper">
              <input
                id="plinko-bet"
                type="number"
                class="bet-input"
                [(ngModel)]="betAmountInput"
                [min]="MIN_BET"
                [max]="MAX_BET"
                [disabled]="isDropping()"
                (ngModelChange)="onBetChange($event)"
              />
              <span class="bet-suffix">N$</span>
            </div>
            <div class="quick-bets">
              <button
                class="quick-bet-btn"
                [disabled]="isDropping() || 1 > creditService.credits()"
                (click)="setBet(1)"
              >
                1
              </button>
              <button
                class="quick-bet-btn"
                [disabled]="isDropping() || 3 > creditService.credits()"
                (click)="setBet(3)"
              >
                3
              </button>
              <button
                class="quick-bet-btn"
                [disabled]="isDropping() || 5 > creditService.credits()"
                (click)="setBet(5)"
              >
                5
              </button>
              <button
                class="quick-bet-btn"
                [disabled]="isDropping() || 10 > creditService.credits()"
                (click)="setBet(10)"
              >
                10
              </button>
            </div>
          </div>

          <!-- Drop Button -->
          <button
            class="drop-btn"
            [disabled]="!canDrop()"
            [class.pulsing]="canDrop() && !isDropping()"
            (click)="dropBall()"
          >
            <mat-icon>arrow_downward</mat-icon>
            <span>DROP BALL</span>
          </button>

          <!-- Last Result -->
          @if (lastMultiplier() !== null) {
            <div
              class="last-result"
              [class.win]="lastMultiplier()! >= 1"
              [class.big-win]="lastMultiplier()! >= 10"
              [class.lose]="lastMultiplier()! < 1"
            >
              <span class="result-multiplier">{{ lastMultiplier() }}×</span>
              @if (netWin() >= 0) {
                <span class="result-amount win">+{{ netWin() }} N$</span>
              } @else {
                <span class="result-amount lose">{{ netWin() }} N$</span>
              }
            </div>
          }

          <!-- History -->
          @if (history().length > 0) {
            <div class="history">
              <span class="setting-label">LETZTE WÜRFE</span>
              <div class="history-items">
                @for (item of history(); track $index) {
                  <span class="history-item" [style.color]="item.color">
                    {{ item.multiplier }}×
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- Canvas -->
        <div class="canvas-container">
          <canvas #gameCanvas [width]="canvasWidth" [height]="canvasHeight"></canvas>
        </div>
      </div>

      <app-game-exit-confirm
        [hint]="exitHint()"
        (opened)="stopGameLoop()"
        (resumed)="resumeLoop()"
        (exit)="exitGame()"
      />
    </app-game-frame>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Spiel-UI im eigenen Look; Gehaeuse kommt aus app-game-frame */
    .game-content {
      display: flex;
      gap: 16px;
      padding: 16px;
      border-radius: 5px;
      background: linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%);
    }

    /* Settings Panel */
    .settings-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 180px;
      max-width: 200px;
    }

    .setting-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .setting-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 1px;
    }

    /* Bet Input */
    .bet-input-wrapper {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(75, 229, 133, 0.3);
      border-radius: 8px;
      padding: 0 12px;
    }

    .bet-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 600;
      padding: 10px 0;
      width: 100%;
    }

    .bet-input::-webkit-outer-spin-button,
    .bet-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }

    .bet-suffix {
      color: rgba(255, 255, 255, 0.5);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }

    /* Quick Bets */
    .quick-bets {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
    }

    .quick-bet-btn {
      padding: 6px 4px;
      border: 1px solid rgba(75, 229, 133, 0.3);
      border-radius: 4px;
      background: rgba(75, 229, 133, 0.1);
      color: rgba(255, 255, 255, 0.7);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-bet-btn:hover:not(:disabled) {
      background: rgba(75, 229, 133, 0.2);
      border-color: #1F8E4C;
      color: #ffffff;
    }

    .quick-bet-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .half-double {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }

    .half-btn,
    .double-btn {
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.7);
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .half-btn:hover:not(:disabled),
    .double-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .half-btn:disabled,
    .double-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Drop Button */
    .drop-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 20px;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);
    }

    .drop-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
    }

    .drop-btn:disabled {
      background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
      box-shadow: none;
      cursor: not-allowed;
      opacity: 0.6;
    }

    .drop-btn.pulsing {
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);
      }
      50% {
        box-shadow: 0 4px 25px rgba(34, 197, 94, 0.6);
      }
    }

    /* Last Result */
    .last-result {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.4);
      border: 2px solid;
      animation: resultPop 0.3s ease-out;
    }

    @keyframes resultPop {
      0% {
        transform: scale(0.8);
        opacity: 0;
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }

    .last-result.win {
      border-color: #22c55e;
      background: rgba(34, 197, 94, 0.1);
    }

    .last-result.big-win {
      border-color: #eab308;
      background: rgba(234, 179, 8, 0.1);
      animation:
        resultPop 0.3s ease-out,
        bigWinGlow 1s ease-in-out infinite;
    }

    @keyframes bigWinGlow {
      0%,
      100% {
        box-shadow: 0 0 20px rgba(234, 179, 8, 0.3);
      }
      50% {
        box-shadow: 0 0 40px rgba(234, 179, 8, 0.6);
      }
    }

    .last-result.lose {
      border-color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
    }

    .result-multiplier {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
    }

    .result-amount {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 600;
    }

    .result-amount.win {
      color: #22c55e;
    }

    .result-amount.lose {
      color: #ef4444;
    }

    /* History */
    .history {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .history-items {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .history-item {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
    }

    /* Canvas Container */
    .canvas-container {
      flex: 1;
      min-width: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 8px;
    }

    canvas {
      display: block;
      border-radius: 4px;
      width: var(--fit-w, auto) !important;
      height: var(--fit-h, auto) !important;
    }

    /* Responsive */
    @media (max-height: 500px) {
      .game-content {
        padding: 8px;
        gap: 8px;
        overflow-y: auto;
      }
      .settings-panel {
        gap: 8px;
        min-width: 150px;
      }
      .drop-btn {
        padding: 8px 12px;
      }
      .last-result {
        padding: 6px;
      }
      .result-multiplier {
        font-size: 20px;
      }
      .history {
        display: none;
      }
      .canvas-container {
        padding: 4px;
      }
    }

    @media (max-width: 600px) {
      .game-content {
        flex-direction: column;
      }

      .settings-panel {
        max-width: none;
        flex-direction: row;
        flex-wrap: wrap;
      }

      .setting-group {
        flex: 1;
        min-width: 140px;
      }

      .drop-btn {
        width: 100%;
      }

      .last-result {
        flex-direction: row;
        gap: 12px;
      }

      .history {
        width: 100%;
      }
    }
  `,
})
export class PlinkoGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  readonly info = GAME_INFO.plinko;
  private stopFit?: () => void;

  readonly creditService = inject(CreditService);
  private readonly dialogRef = inject(MatDialogRef<PlinkoGameComponent>);
  private readonly api = inject(ApiService);

  // Sound Hashes
  private readonly LOSE_SOUND_HASH = '9677d3038caf410d784f6dd86de887e8';
  private readonly WIN_SOUND_HASH = 'bf97cffb5a032e8f9ba56fad0db0c1a3';
  private loseSoundUrl = '';
  private winSoundUrl = '';

  // Canvas size - größer für bessere Sichtbarkeit
  readonly canvasWidth = 520;
  readonly canvasHeight = 580;

  // Bet Limits
  readonly MIN_BET = 1;
  readonly MAX_BET = 10;

  // State
  readonly gameState = signal<PlinkoGameState>('idle');
  readonly betAmount = signal(5);
  readonly lastMultiplier = signal<number | null>(null);
  readonly lastBet = signal<number>(0);
  readonly isDropping = signal(false);
  readonly history = signal<{ multiplier: number; color: string }[]>([]);

  // Input binding
  betAmountInput = 5;

  // Computed
  readonly netWin = computed(() => {
    const mult = this.lastMultiplier();
    const bet = this.lastBet();
    if (mult === null) return 0;
    return Math.floor(bet * mult) - bet;
  });

  readonly canDrop = computed(() => {
    return (
      !this.isDropping() && this.betAmount() > 0 && this.betAmount() <= this.creditService.credits()
    );
  });

  readonly stats = computed<GameStat[]>(() => [
    { label: 'GUTHABEN N$', value: this.creditService.creditsFormatted() },
    { label: 'LETZTER WURF', value: this.lastMultiplier() === null ? '--' : this.lastMultiplier() + 'x' },
  ]);

  private engine!: PlinkoEngine;
  private animationId = 0;

  /** Hinweis in der Beenden-Abfrage: Plinko bucht den Einsatz erst beim Landen der Kugel. */
  exitHint(): string {
    return this.isDropping()
      ? 'Die Kugel fällt noch. Wenn du jetzt beendest, wird dieser Wurf nicht gewertet: kein Einsatzabzug, kein Gewinn.'
      : 'Es läuft kein Wurf, es geht nichts verloren.';
  }

  ngAfterViewInit(): void {
    this.stopFit = fitCanvas(
      () => this.canvasRef?.nativeElement,
      this.canvasWidth,
      this.canvasHeight,
      this.frame.root,
    );
    // Set up sound URLs
    this.loseSoundUrl = this.api.getFullUrl(`/sound/${this.LOSE_SOUND_HASH}/file`);
    this.winSoundUrl = this.api.getFullUrl(`/sound/${this.WIN_SOUND_HASH}/file`);

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (ctx) {
      this.engine = new PlinkoEngine(ctx, this.canvasWidth, this.canvasHeight);
      this.engine.onBallLanded = (slotIndex, multiplier) => this.onBallLanded(multiplier);
      this.engine.init();
    }
  }

  ngOnDestroy(): void {
    this.stopFit?.();
    this.stopGameLoop();
  }

  setBet(amount: number): void {
    if (this.isDropping()) return;
    const maxBet = Math.min(this.MAX_BET, this.creditService.credits());
    const validAmount = Math.max(this.MIN_BET, Math.min(amount, maxBet));
    this.betAmount.set(validAmount);
    this.betAmountInput = validAmount;
  }

  onBetChange(value: number): void {
    const maxBet = Math.min(this.MAX_BET, this.creditService.credits());
    const validAmount = Math.max(this.MIN_BET, Math.min(value || this.MIN_BET, maxBet));
    this.betAmount.set(validAmount);
  }

  dropBall(): void {
    if (!this.canDrop()) return;

    const bet = this.betAmount();
    this.lastBet.set(bet);
    this.isDropping.set(true);
    this.gameState.set('dropping');
    this.lastMultiplier.set(null);

    this.engine.dropBall();
    this.startGameLoop();
  }

  private onBallLanded(multiplier: number): void {
    this.stopGameLoop();
    this.isDropping.set(false);
    this.gameState.set('result');
    this.lastMultiplier.set(multiplier);

    // Play sound based on result
    const soundUrl = multiplier >= 1 ? this.winSoundUrl : this.loseSoundUrl;
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});

    // Add to history
    const color = this.getMultiplierColor(multiplier);
    const newHistory = [{ multiplier, color }, ...this.history().slice(0, 9)];
    this.history.set(newHistory);

    // Process bet via backend
    const bet = this.lastBet();
    this.creditService.playPlinko(bet, multiplier).subscribe({
      next: () => {
        // Credits werden automatisch vom Service aktualisiert
      },
      error: (err) => {
        console.error('Plinko error:', err);
      },
    });

    // Final render with landed slot highlighted
    this.engine.render();
  }

  private getMultiplierColor(multiplier: number): string {
    if (multiplier >= 100) return '#ef4444';
    if (multiplier >= 10) return '#f97316';
    if (multiplier >= 2) return '#eab308';
    if (multiplier >= 1) return '#22c55e';
    return '#1F8E4C';
  }

  private startGameLoop(): void {
    const loop = () => {
      if (this.gameState() !== 'dropping') return;
      this.engine.update();
      this.engine.render();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  resumeLoop(): void {
    if (this.isDropping() && !this.animationId) this.startGameLoop();
  }

  stopGameLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  exitGame(): void {
    this.stopGameLoop();
    this.dialogRef.close();
  }
}
