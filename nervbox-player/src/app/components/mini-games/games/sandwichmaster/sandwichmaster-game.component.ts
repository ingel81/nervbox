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
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SandwichmasterEngine } from './sandwichmaster-engine';
import { GameState, Ingredient, SelectedIngredient } from './sandwichmaster.types';
import {
  NORMAL_INGREDIENTS,
  SAUCE_INGREDIENTS,
  RARE_INGREDIENTS,
  EPIC_INGREDIENTS,
} from './ingredients';
import { CreditService } from '../../../../core/services/credit.service';
import { ApiService } from '../../../../core/services/api.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { fitCanvas } from '../../game-shared';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GameOverlayComponent } from '../../game-overlay.component';
import { GAME_INFO } from '../../game-info';

@Component({
  selector: 'app-sandwichmaster-game',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatTabsModule,
    MatTooltipModule,
    GameExitConfirmComponent,
    GameFrameComponent,
    GameOverlayComponent,
  ],
  template: `
    <app-game-frame
      #root
      [title]="info.title"
      [icon]="info.icon"
      [accent]="info.accent"
      [year]="info.year"
      [stats]="stats()"
      [fill]="true"
      hint="Zutaten antippen = kaufen · Antippen in der Liste = entfernen · ESC = Beenden?"
      (closed)="exitGame()"
    >
      <div class="game-content">
        <!-- Ingredients Selection Panel -->
        <div class="ingredients-panel">
          <mat-tab-group animationDuration="200ms" [selectedIndex]="selectedTabIndex()">
            <mat-tab>
              <ng-template mat-tab-label>
                <span class="tab-label">Normal</span>
              </ng-template>
              <div class="ingredients-grid">
                @for (ingredient of normalIngredients; track ingredient.id) {
                  <button
                    class="ingredient-card normal"
                    [class.disabled]="!canAfford(ingredient)"
                    [matTooltip]="ingredient.name + ' - ' + ingredient.cost + ' N$'"
                    (click)="addIngredient(ingredient)"
                  >
                    <span class="ingredient-emoji">{{ ingredient.emoji }}</span>
                    <span class="ingredient-name">{{ ingredient.name }}</span>
                    <span class="ingredient-cost">{{ ingredient.cost }} N$</span>
                  </button>
                }
              </div>
            </mat-tab>

            <mat-tab>
              <ng-template mat-tab-label>
                <span class="tab-label">Soßen</span>
              </ng-template>
              <div class="ingredients-grid">
                @for (ingredient of sauceIngredients; track ingredient.id) {
                  <button
                    class="ingredient-card sauce"
                    [class.disabled]="!canAfford(ingredient)"
                    [matTooltip]="ingredient.name + ' - ' + ingredient.cost + ' N$'"
                    (click)="addIngredient(ingredient)"
                  >
                    <span class="ingredient-emoji">{{ ingredient.emoji }}</span>
                    <span class="ingredient-name">{{ ingredient.name }}</span>
                    <span class="ingredient-cost">{{ ingredient.cost }} N$</span>
                  </button>
                }
              </div>
            </mat-tab>

            <mat-tab>
              <ng-template mat-tab-label>
                <span class="tab-label rare-label">Selten</span>
              </ng-template>
              <div class="ingredients-grid">
                @for (ingredient of rareIngredients; track ingredient.id) {
                  <button
                    class="ingredient-card rare"
                    [class.disabled]="!canAfford(ingredient)"
                    [matTooltip]="ingredient.name + ' - ' + ingredient.cost + ' N$'"
                    (click)="addIngredient(ingredient)"
                  >
                    <span class="ingredient-emoji">{{ ingredient.emoji }}</span>
                    <span class="ingredient-name">{{ ingredient.name }}</span>
                    <span class="ingredient-cost">{{ ingredient.cost }} N$</span>
                  </button>
                }
              </div>
            </mat-tab>

            <mat-tab>
              <ng-template mat-tab-label>
                <span class="tab-label epic-label">Episch</span>
              </ng-template>
              <div class="ingredients-grid epic-grid">
                @for (ingredient of epicIngredients; track ingredient.id) {
                  <button
                    class="ingredient-card epic"
                    [class.disabled]="!canAfford(ingredient) || isEpicUsed(ingredient.id)"
                    [class.used]="isEpicUsed(ingredient.id)"
                    [matTooltip]="getEpicTooltip(ingredient)"
                    (click)="addIngredient(ingredient)"
                  >
                    <div class="epic-glow"></div>
                    <span class="multiplier-badge">x{{ ingredient.multiplier }}</span>
                    <span class="ingredient-emoji">{{ ingredient.emoji }}</span>
                    <span class="ingredient-name">{{ ingredient.name }}</span>
                    <span class="ingredient-cost">{{ ingredient.cost }} N$</span>
                    @if (isEpicUsed(ingredient.id)) {
                      <span class="used-badge">IM SANDWICH</span>
                    }
                  </button>
                }
              </div>
            </mat-tab>
          </mat-tab-group>
        </div>

        <!-- Sandwich Preview Panel -->
        <div class="sandwich-panel">
          <div class="sandwich-header">
            <span>DEIN SANDWICH</span>
          </div>

          <!-- Canvas -->
          <div class="canvas-container">
            <canvas #gameCanvas [width]="canvasWidth" [height]="canvasHeight"></canvas>
          </div>

          <!-- Selected Ingredients List -->
          <div class="ingredients-list">
            @if (selectedIngredients().length > 0) {
              @for (item of selectedIngredients(); track item.addedAt) {
                <div
                  class="ingredient-item"
                  [class.epic]="item.ingredient.category === 'epic'"
                  (click)="removeIngredient(item)"
                >
                  <span class="item-emoji">{{ item.ingredient.emoji }}</span>
                  <span class="item-name">{{ item.ingredient.name }}</span>
                  <span class="item-cost">{{ item.ingredient.cost }} N$</span>
                  <mat-icon class="remove-icon">close</mat-icon>
                </div>
              }
            } @else {
              <div class="empty-list">Noch keine Zutaten...</div>
            }
          </div>

          <!-- Stats -->
          <div class="stats-panel">
            <div class="stat-row">
              <span class="stat-label">Kosten:</span>
              <span class="stat-value cost">{{ totalCost() }} N$</span>
            </div>
            @if (multiplier() > 1) {
              <div class="stat-row multiplier-row">
                <span class="stat-label">Multiplikator:</span>
                <span class="stat-value multiplier">x{{ multiplier() }}</span>
              </div>
            }
            <div class="stat-row total-row">
              <span class="stat-label">Punkte:</span>
              <span class="stat-value points">{{ finalScore() }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="actions-panel">
            <button
              class="action-btn finish-btn"
              [disabled]="selectedIngredients().length === 0"
              (click)="finishSandwich()"
            >
              <mat-icon>check_circle</mat-icon>
              <span>FERTIG!</span>
            </button>
            <button
              class="action-btn reset-btn"
              [disabled]="selectedIngredients().length === 0"
              (click)="resetSandwich()"
            >
              <mat-icon>refresh</mat-icon>
              <span>RESET</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Finished Overlay -->
      @if (gameState() === 'finished') {
        <app-game-overlay
          class="nk-go--solid"
          tone="win"
          kicker="Bestellung fertig"
          icon="celebration"
          title="Sandwich fertig!"
        >
          <div class="final-stats">
            <div class="final-stat">
              <span class="final-label">Zutaten</span>
              <span class="final-value">{{ selectedIngredients().length }}</span>
            </div>
            <div class="final-stat">
              <span class="final-label">Kosten</span>
              <span class="final-value">{{ totalCost() }} N$</span>
            </div>
            @if (multiplier() > 1) {
              <div class="final-stat multiplier">
                <span class="final-label">Multiplikator</span>
                <span class="final-value">x{{ multiplier() }}</span>
              </div>
            }
          </div>
          <span class="nk-counter nk-go__score">PUNKTE {{ finalScore() }}</span>
          <div goActions>
            <button type="button" class="nk-key nk-key--accent nk-key--lg" (click)="newSandwich()">
              <mat-icon>add</mat-icon>Neues Sandwich
            </button>
            <button type="button" class="nk-key nk-key--ghost" (click)="exitGame()">
              <mat-icon>exit_to_app</mat-icon>Beenden
            </button>
          </div>
        </app-game-overlay>
      }

      <app-game-exit-confirm [hint]="exitHint()" (exit)="exitGame()" />
    </app-game-frame>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Game Content */
    .game-content {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      gap: 16px;
      padding: 16px;
      overflow: hidden;
      border-radius: 5px;
      background: linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%);
    }

    /* Ingredients Panel */
    .ingredients-panel {
      flex: 1;
      min-width: 350px;
      max-width: 450px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .tab-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 600;
    }

    .rare-label {
      color: #fbbf24;
    }

    .epic-label {
      color: #ef4444;
      animation: epic-pulse 2s ease-in-out infinite;
    }

    @keyframes epic-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }

    .ingredients-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 12px;
      max-height: calc(95vh - 200px);
      overflow-y: auto;
    }

    .epic-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .ingredient-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 8px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid;
      position: relative;
      overflow: hidden;
    }

    .ingredient-card.normal {
      background: rgba(75, 229, 133, 0.1);
      border-color: rgba(75, 229, 133, 0.3);
    }

    .ingredient-card.sauce {
      background: rgba(249, 115, 22, 0.1);
      border-color: rgba(249, 115, 22, 0.3);
    }

    .ingredient-card.rare {
      background: rgba(234, 179, 8, 0.1);
      border-color: rgba(234, 179, 8, 0.3);
    }

    .ingredient-card.epic {
      background: linear-gradient(
        135deg,
        rgba(239, 68, 68, 0.15) 0%,
        rgba(75, 229, 133, 0.15) 100%
      );
      border-color: rgba(239, 68, 68, 0.5);
    }

    .ingredient-card:hover:not(.disabled) {
      transform: translateY(-3px);
    }

    .ingredient-card.normal:hover:not(.disabled) {
      border-color: #1f8e4c;
      box-shadow: 0 5px 20px rgba(75, 229, 133, 0.3);
    }

    .ingredient-card.sauce:hover:not(.disabled) {
      border-color: #f97316;
      box-shadow: 0 5px 20px rgba(249, 115, 22, 0.3);
    }

    .ingredient-card.rare:hover:not(.disabled) {
      border-color: #eab308;
      box-shadow: 0 5px 20px rgba(234, 179, 8, 0.3);
    }

    .ingredient-card.epic:hover:not(.disabled):not(.used) {
      border-color: #ef4444;
      box-shadow: 0 5px 30px rgba(239, 68, 68, 0.4);
    }

    .ingredient-card.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .ingredient-card.used {
      opacity: 0.5;
      border-style: dashed;
    }

    .epic-glow {
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, transparent 50%);
      animation: epic-rotate 5s linear infinite;
    }

    @keyframes epic-rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .multiplier-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      background: linear-gradient(135deg, #ef4444 0%, #1f8e4c 100%);
      color: white;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 8px;
      z-index: 1;
    }

    .used-badge {
      position: absolute;
      bottom: 4px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: #fbbf24;
      font-family: 'JetBrains Mono', monospace;
      font-size: 8px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      z-index: 1;
    }

    .ingredient-emoji {
      font-size: 24px;
      z-index: 1;
    }

    .ingredient-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
      text-align: center;
      z-index: 1;
    }

    .ingredient-cost {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #fbbf24;
      z-index: 1;
    }

    /* Sandwich Panel */
    .sandwich-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 280px;
      max-width: 350px;
    }

    .sandwich-header {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.8);
      letter-spacing: 1px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .canvas-container {
      flex-shrink: 0;
      align-self: center;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(75, 229, 133, 0.2);
    }

    canvas {
      display: block;
      width: var(--fit-w, auto) !important;
      height: var(--fit-h, auto) !important;
    }

    .ingredients-list {
      flex: 1;
      min-height: 100px;
      max-height: 150px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 8px;
    }

    .ingredient-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      background: rgba(255, 255, 255, 0.05);
      margin-bottom: 4px;
    }

    .ingredient-item:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    .ingredient-item.epic {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .item-emoji {
      font-size: 16px;
    }

    .item-name {
      flex: 1;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
    }

    .item-cost {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #fbbf24;
    }

    .remove-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.4);
    }

    .ingredient-item:hover .remove-icon {
      color: #ef4444;
    }

    .empty-list {
      text-align: center;
      padding: 20px;
      color: rgba(255, 255, 255, 0.3);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }

    /* Stats Panel */
    .stats-panel {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 12px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }

    .stat-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
    }

    .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 700;
    }

    .stat-value.cost {
      color: #fbbf24;
    }

    .stat-value.multiplier {
      color: #ef4444;
      animation: multiplier-glow 1s ease-in-out infinite;
    }

    @keyframes multiplier-glow {
      0%,
      100% {
        text-shadow: 0 0 5px rgba(239, 68, 68, 0.5);
      }
      50% {
        text-shadow: 0 0 15px rgba(239, 68, 68, 0.8);
      }
    }

    .total-row {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      margin-top: 8px;
      padding-top: 8px;
    }

    .stat-value.points {
      font-size: 18px;
      color: #22c55e;
      text-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
    }

    /* Actions */
    .actions-panel {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .finish-btn {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
    }

    .finish-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(34, 197, 94, 0.4);
    }

    .finish-btn:disabled {
      background: #374151;
      opacity: 0.5;
      cursor: not-allowed;
    }

    .reset-btn {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    .reset-btn:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.3);
      border-color: #ef4444;
    }

    .reset-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    /* Ergebnis auf der Overlay-Karte (Karte selbst kommt aus app-game-overlay) */
    .final-stats {
      display: flex;
      gap: 18px;
      flex-wrap: wrap;
      justify-content: center;
    }

    .final-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .final-label {
      font: 600 10px/1 var(--nk-font-mono);
      color: var(--nk-iv-2);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .final-value {
      font: 400 26px/1 var(--nk-font-lcd);
      color: var(--nk-iv);
      text-shadow: 0 0 6px rgb(var(--nk-lamp-rgb) / 0.5);
    }

    .final-stat.multiplier .final-value {
      color: var(--nk-danger-text);
    }

    /* Niedrige Fenster (Querformat am Handy): Kopf schmaler, Sandwich-Panel scrollt */
    @media (max-height: 500px) {
      .game-content {
        padding: 8px 12px;
        gap: 12px;
      }
      .sandwich-panel {
        overflow-y: auto;
        gap: 8px;
      }
    }

    /* Responsive */
    @media (max-width: 700px) {
      .ingredients-panel,
      .sandwich-panel {
        flex: none;
      }

      .game-content {
        flex-direction: column;
        overflow-y: auto;
      }

      .ingredients-panel {
        max-width: none;
        min-width: auto;
      }

      .sandwich-panel {
        max-width: none;
        min-width: auto;
      }

      .ingredients-grid {
        grid-template-columns: repeat(4, 1fr);
        max-height: 200px;
      }

      .final-stats {
        gap: 12px;
      }
    }
  `,
})
export class SandwichmasterGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  readonly info = GAME_INFO.sandwich;
  private stopFit?: () => void;

  readonly creditService = inject(CreditService);
  private readonly dialogRef = inject(MatDialogRef<SandwichmasterGameComponent>);
  private readonly api = inject(ApiService);

  // Canvas dimensions
  readonly canvasWidth = 280;
  readonly canvasHeight = 320;

  // Ingredients data
  readonly normalIngredients = NORMAL_INGREDIENTS;
  readonly sauceIngredients = SAUCE_INGREDIENTS;
  readonly rareIngredients = RARE_INGREDIENTS;
  readonly epicIngredients = EPIC_INGREDIENTS;

  // State
  readonly gameState = signal<GameState>('shopping');
  readonly selectedIngredients = signal<SelectedIngredient[]>([]);
  readonly usedEpicIngredients = signal<Set<string>>(new Set());
  readonly selectedTabIndex = signal(0);

  // Computed
  readonly totalCost = computed(() =>
    this.selectedIngredients().reduce((sum, item) => sum + item.ingredient.cost, 0),
  );

  readonly multiplier = computed(() =>
    this.selectedIngredients()
      .filter((item) => item.ingredient.category === 'epic')
      .reduce((mult, item) => mult * item.ingredient.multiplier, 1),
  );

  readonly finalScore = computed(() => Math.floor(this.totalCost() * this.multiplier()));

  readonly stats = computed<GameStat[]>(() => [
    { label: 'GUTHABEN N$', value: this.creditService.creditsFormatted() },
    { label: 'PUNKTE', value: this.finalScore() },
  ]);

  private engine!: SandwichmasterEngine;
  private animationId = 0;

  // Sound URLs
  private plopSoundUrl = '';
  private epicSoundUrl = '';

  /** Hinweis in der Beenden-Abfrage: Zutaten werden sofort bezahlt und nicht erstattet. */
  exitHint(): string {
    const n = this.selectedIngredients().length;
    if (this.gameState() === 'shopping' && n > 0) {
      return `Dein angefangenes Sandwich (${n} ${n === 1 ? 'Zutat' : 'Zutaten'}, ${this.totalCost()} N$) geht verloren. Die Zutaten sind schon bezahlt und werden nicht erstattet.`;
    }
    return '';
  }

  ngAfterViewInit(): void {
    const root = this.frame.root;
    this.stopFit = fitCanvas(
      () => this.canvasRef?.nativeElement,
      this.canvasWidth,
      this.canvasHeight,
      root,
      {
        widthEl: () => root.querySelector<HTMLElement>('.sandwich-panel'),
        minScale: 0.55,
        // Spalten-Layout (Handy hochkant): Canvas nur ca. 38% der Hoehe, Rest scrollt
        maxScale: () =>
          window.innerWidth <= 700 ? (window.innerHeight * 0.38) / this.canvasHeight : 1,
        // Liste/Stats/Buttons unter dem Canvas duerfen scrollen (Spalten- und Querformat-Layout)
        excludeH: () => {
          if (window.innerWidth > 700 && window.innerHeight > 500) return 0;
          return Array.from(
            root.querySelectorAll<HTMLElement>('.ingredients-list, .stats-panel, .actions-panel'),
          ).reduce((sum, el) => sum + el.offsetHeight + 12, 0);
        },
      },
    );
    // Setup sound URLs (using existing sounds or Web Audio)
    this.plopSoundUrl = this.api.getFullUrl('/sound/bf97cffb5a032e8f9ba56fad0db0c1a3/file');
    this.epicSoundUrl = this.api.getFullUrl('/sound/9677d3038caf410d784f6dd86de887e8/file');

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (ctx) {
      this.engine = new SandwichmasterEngine(ctx, this.canvasWidth, this.canvasHeight);
      this.engine.init();
      this.startRenderLoop();
    }
  }

  ngOnDestroy(): void {
    this.stopFit?.();
    this.stopRenderLoop();
  }

  canAfford(ingredient: Ingredient): boolean {
    return this.creditService.credits() >= ingredient.cost;
  }

  isEpicUsed(ingredientId: string): boolean {
    return this.usedEpicIngredients().has(ingredientId);
  }

  getEpicTooltip(ingredient: Ingredient): string {
    if (this.isEpicUsed(ingredient.id)) {
      return `${ingredient.name} - Bereits im Sandwich!`;
    }
    return `${ingredient.name} - ${ingredient.cost} N$ (x${ingredient.multiplier} Multiplikator)`;
  }

  addIngredient(ingredient: Ingredient): void {
    // Check if can afford
    if (!this.canAfford(ingredient)) {
      return;
    }

    // Check if epic is already used
    if (ingredient.category === 'epic' && this.isEpicUsed(ingredient.id)) {
      return;
    }

    // Spend credits via API
    this.creditService
      .spendCredits(ingredient.cost, `Sandwichmaster: ${ingredient.name}`)
      .subscribe({
        next: (response) => {
          if (response.success) {
            // Add ingredient to sandwich
            this.selectedIngredients.update((list) => [
              ...list,
              { ingredient, addedAt: Date.now() },
            ]);

            // Mark epic as used
            if (ingredient.category === 'epic') {
              this.usedEpicIngredients.update((set) => new Set([...set, ingredient.id]));
              this.playSound('epic');
            } else {
              this.playSound('plop');
            }

            // Add to engine
            this.engine.addIngredient(ingredient);
          }
        },
        error: (err) => {
          console.error('Failed to spend credits:', err);
        },
      });
  }

  removeIngredient(item: SelectedIngredient): void {
    // Note: Credits are NOT refunded - this is intentional per game design
    // Just remove from visual sandwich

    this.selectedIngredients.update((list) => list.filter((i) => i.addedAt !== item.addedAt));

    // If epic, allow re-use
    if (item.ingredient.category === 'epic') {
      this.usedEpicIngredients.update((set) => {
        const newSet = new Set(set);
        newSet.delete(item.ingredient.id);
        return newSet;
      });
    }

    // Remove from engine
    this.engine.removeIngredient(item.ingredient.id);
  }

  finishSandwich(): void {
    if (this.selectedIngredients().length === 0) return;

    this.gameState.set('finished');
    this.playSound('epic');
  }

  resetSandwich(): void {
    // Note: Credits are NOT refunded
    this.selectedIngredients.set([]);
    this.usedEpicIngredients.set(new Set());
    this.engine.clear();
    this.engine.init();
  }

  newSandwich(): void {
    this.gameState.set('shopping');
    this.resetSandwich();
  }

  exitGame(): void {
    this.stopRenderLoop();
    this.dialogRef.close();
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.engine.update();
      this.engine.render();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  }

  private stopRenderLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }
  }

  private playSound(type: 'plop' | 'epic'): void {
    try {
      const url = type === 'epic' ? this.epicSoundUrl : this.plopSoundUrl;
      const audio = new Audio(url);
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {
      // Ignore sound errors
    }
  }
}
