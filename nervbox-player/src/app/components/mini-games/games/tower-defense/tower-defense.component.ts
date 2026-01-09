import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  signal,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfigService } from '../../../../core/services/config.service';
import { OsmStreetService, Street, StreetNetwork } from './services/osm-street.service';
import { EntityPoolService } from './services/entity-pool.service';
import { ModelPreviewService } from './services/model-preview.service';
import { GeoPosition } from './models/game.types';
import { EnemyTypeId, getAllEnemyTypes, getEnemyType, EnemyTypeConfig } from './models/enemy-types';
import { ApiService } from '../../../../core/services/api.service';
import { DebugPanelComponent } from './components/debug-panel.component';
import { LocationDialogComponent } from './components/location-dialog/location-dialog.component';
import { LocationDialogData, LocationDialogResult, LocationConfig, SpawnLocationConfig } from './models/location.types';
import { GeocodingService } from './services/geocoding.service';
// New OO Game Engine imports
import { GameStateManager } from './managers/game-state.manager';
import { EnemyManager } from './managers/enemy.manager';
import { TowerManager } from './managers/tower.manager';
import { ProjectileManager } from './managers/projectile.manager';
import { WaveManager, SpawnPoint as WaveSpawnPoint } from './managers/wave.manager';
// Three.js Engine (new 3DTilesRendererJS-based)
import { ThreeTilesEngine } from './three-engine';
import * as THREE from 'three';
// Theme
import { TD_CSS_VARS } from './styles/td-theme';
// Tower config
import { TOWER_TYPES, getAllTowerTypes, TowerTypeConfig, TowerTypeId, UpgradeId } from './configs/tower-types.config';
import { Tower } from './entities/tower.entity';

// Default locations - can be overridden via debug settings
const DEFAULT_CENTER_COORDS = {
  latitude: 49.1726836,
  longitude: 9.2703122,
  height: 400,
};

const DEFAULT_BASE_COORDS = {
  latitude: 49.17326887448299,
  longitude: 9.268588397188681,
};

const DEFAULT_SPAWN_POINTS = [
  {
    id: 'spawn-north',
    name: 'Nord',
    latitude: 49.17554723547113,
    longitude: 9.263870533891945,
  },
  // {
  //   id: 'spawn-south',
  //   name: 'Sued',
  //   latitude: 49.17000237788718,
  //   longitude: 9.266037019764674,
  // },
];

const LOCATION_STORAGE_KEY = 'td_custom_locations_v1';

export interface SpawnPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  color: number; // Three.js hex color
}

@Component({
  selector: 'app-tower-defense',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DebugPanelComponent,
  ],
  providers: [
    GameStateManager,
    EnemyManager,
    TowerManager,
    ProjectileManager,
    WaveManager,
    EntityPoolService,
    ModelPreviewService,
  ],
  template: `
    <div class="td-container" [class.td-fullscreen]="!isDialog">
      <!-- Info Header -->
      <header class="td-header">
        <div class="td-header-left">
          <mat-icon class="td-title-icon">cell_tower</mat-icon>
          <h2 class="td-title">TOWER DEFENSE</h2>
          <button class="td-location-btn" (click)="openLocationDialog()" matTooltip="Spielort ändern">
            <span class="td-location-name">{{ currentLocationName() }}</span>
            <mat-icon class="td-location-edit">edit</mat-icon>
          </button>
        </div>
        <div class="td-header-stats">
          <div class="td-stat hp">
            <mat-icon>favorite</mat-icon>
            <span>{{ gameState.baseHealth() }}</span>
          </div>
          <div class="td-stat credits">
            <mat-icon>paid</mat-icon>
            <span>{{ gameState.credits() }}</span>
          </div>
          <div class="td-stat wave">
            <mat-icon>waves</mat-icon>
            <span>{{ gameState.waveNumber() }}</span>
          </div>
          @if (waveActive()) {
            <div class="td-stat enemies">
              <mat-icon>pest_control</mat-icon>
              <span>{{ gameState.enemiesAlive() }}</span>
            </div>
          }
          <div class="td-stat fps">
            <span>{{ fps() }} FPS</span>
          </div>
        </div>
        @if (isDialog) {
          <button class="td-close-btn" (click)="close()" matTooltip="Schliessen">
            <mat-icon>close</mat-icon>
          </button>
        }
      </header>

      <!-- Main Content: Canvas + Sidebar -->
      <div class="td-main">
        <!-- Canvas Area -->
        <div class="td-canvas-area">
          @if (loading()) {
            <div class="td-loading-overlay">
              <mat-spinner diameter="48"></mat-spinner>
              <div class="td-loading-title">Lade Tower Defense</div>
              <div class="td-loading-steps">
                @for (step of loadingSteps(); track step.id) {
                  <div class="td-loading-step" [class.active]="step.status === 'active'" [class.done]="step.status === 'done'">
                    <mat-icon class="td-step-icon">
                      @if (step.status === 'done') {
                        check_circle
                      } @else if (step.status === 'active') {
                        sync
                      } @else {
                        radio_button_unchecked
                      }
                    </mat-icon>
                    <span class="td-step-label">{{ step.label }}</span>
                    @if (step.detail) {
                      <span class="td-step-detail">({{ step.detail }})</span>
                    }
                  </div>
                }
              </div>
            </div>
          }

          @if (error()) {
            <div class="td-error-overlay">
              <mat-icon class="td-error-icon">error_outline</mat-icon>
              <h3>Fehler</h3>
              <p>{{ error() }}</p>
              <div class="td-token-instructions">
                <p>1. Erstelle ein Projekt in der <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></p>
                <p>2. Aktiviere die <strong>Map Tiles API</strong></p>
                <p>3. Erstelle einen API Key und trage ihn in <code>appsettings.json</code> ein:</p>
                <pre>"GoogleMapsApiKey": "dein-api-key"</pre>
              </div>
              <button class="td-btn td-btn-gold" (click)="close()">Schliessen</button>
            </div>
          }

          <canvas #gameCanvas class="td-canvas" [class.hidden]="error()"></canvas>

          <!-- Controls Hint -->
          @if (!loading() && !error()) {
            <div class="td-controls-hint">LMB: Pan | RMB: Rotate | Scroll: Zoom</div>

            <!-- Quick Actions (bottom right) -->
            <div class="td-quick-actions">
              <!-- Layer Toggles (collapsible) -->
              <div class="td-layer-toggles" [class.expanded]="layerMenuExpanded()">
                <button class="td-layer-btn"
                        [class.active]="streetsVisible()"
                        (click)="toggleStreets()"
                        matTooltip="Strassen anzeigen"
                        matTooltipPosition="left">
                  <mat-icon>route</mat-icon>
                </button>
                <button class="td-layer-btn"
                        [class.active]="routesVisible()"
                        (click)="toggleRoutes()"
                        matTooltip="Routen anzeigen"
                        matTooltipPosition="left">
                  <mat-icon>timeline</mat-icon>
                </button>
                <button class="td-layer-btn"
                        [class.active]="towerDebugVisible()"
                        (click)="toggleTowerDebug()"
                        matTooltip="Tower-Schusshoehe anzeigen"
                        matTooltipPosition="left">
                  <mat-icon>gps_fixed</mat-icon>
                </button>
                <button class="td-layer-btn"
                        [class.active]="heightDebugVisible()"
                        (click)="toggleHeightDebug()"
                        matTooltip="Terrain-Hoehen debuggen"
                        matTooltipPosition="left">
                  <mat-icon>terrain</mat-icon>
                </button>
              </div>
              <button class="td-quick-btn td-layer-toggle-btn"
                      [class.active]="layerMenuExpanded()"
                      (click)="toggleLayerMenu()"
                      matTooltip="Ebenen"
                      matTooltipPosition="left">
                <mat-icon>{{ layerMenuExpanded() ? 'layers_clear' : 'layers' }}</mat-icon>
              </button>
              <button class="td-quick-btn" (click)="resetCamera()" matTooltip="Kamera zuruecksetzen" matTooltipPosition="left">
                <mat-icon>my_location</mat-icon>
              </button>
              <!-- Dev Menu (expands right and up) -->
              <div class="td-dev-menu-wrapper">
                <div class="td-dev-menu" [class.expanded]="devMenuExpanded()">
                  <button class="td-dev-btn"
                          [class.active]="debugMode()"
                          (click)="toggleDebug()"
                          matTooltip="Wave-Debug-Panel"
                          matTooltipPosition="left">
                    <mat-icon>timeline</mat-icon>
                  </button>
                  <button class="td-dev-btn"
                          (click)="resetToDefaultLocation()"
                          matTooltip="Default-Ort laden"
                          matTooltipPosition="left">
                    <mat-icon>home</mat-icon>
                  </button>
                </div>
                <button class="td-quick-btn td-dev-toggle-btn"
                        [class.active]="devMenuExpanded()"
                        (click)="toggleDevMenu()"
                        matTooltip="Entwickler-Optionen"
                        matTooltipPosition="left">
                  <mat-icon>{{ devMenuExpanded() ? 'code_off' : 'code' }}</mat-icon>
                </button>
              </div>
            </div>
          }

          <!-- Gathering Overlay -->
          @if (gatheringPhase()) {
            <div class="td-gathering-overlay">
              <mat-icon>groups</mat-icon>
              <span>Gegner sammeln sich...</span>
            </div>
          }

          <!-- Game Over Overlay -->
          @if (gameState.showGameOverScreen()) {
            <div class="td-gameover-overlay">
              <div class="td-gameover-content">
                <h1>GAME OVER</h1>
                <p>Das HQ wurde zerstoert!</p>
                <button class="td-btn td-btn-green" (click)="restartGame()">
                  <mat-icon>replay</mat-icon>
                  NEUSTART
                </button>
              </div>
            </div>
          }
        </div>

        <!-- Right Sidebar with WC3 Frame -->
        <aside class="td-sidebar">
          <div class="td-sidebar-frame-top"></div>
          <div class="td-sidebar-frame-middle"></div>
          <div class="td-sidebar-frame-bottom"></div>
          <div class="td-sidebar-content">

          <!-- WAVE Section -->
          <section class="td-panel">
            <div class="td-panel-header">WELLE {{ gameState.waveNumber() }}</div>
            <div class="td-panel-content td-wave-section">
              <div class="td-wave-info">
                <div class="td-enemy-preview-container">
                  <canvas #enemyPreviewCanvas class="td-enemy-preview-canvas" width="72" height="72"></canvas>
                </div>
                <div class="td-wave-stats">
                  <div class="td-enemy-name">{{ currentEnemyConfig().name }}</div>
                  <div class="td-stat-row">
                    <span class="td-stat-label">HP</span>
                    <span class="td-stat-value">{{ currentEnemyConfig().baseHp }}</span>
                  </div>
                  <div class="td-stat-row">
                    <span class="td-stat-label">Gegner</span>
                    <span class="td-stat-value">{{ gameState.enemiesAlive() }}</span>
                  </div>
                </div>
              </div>
              <button class="td-action-btn td-btn-green td-wave-btn" (click)="startWave()"
                      [disabled]="waveActive() || buildMode() || isGameOver()">
                <mat-icon>{{ waveActive() ? 'hourglass_empty' : 'play_arrow' }}</mat-icon>
                <span>{{ waveActive() ? 'Welle laeuft...' : 'Naechste Welle' }}</span>
              </button>
            </div>
          </section>

          <!-- BUILD Section -->
          <section class="td-panel">
            <div class="td-panel-header">BAUEN</div>
            <div class="td-panel-content td-build-section">
              @if (buildMode()) {
                <div class="td-build-hint">Klicke neben Strasse</div>
                <button class="td-action-btn td-cancel-btn" (click)="toggleBuildMode()">
                  <mat-icon>close</mat-icon>
                  <span>Abbrechen</span>
                </button>
              } @else {
                <div class="td-tower-grid">
                  @for (tower of towerTypes; track tower.id) {
                    <button class="td-tower-card"
                            [class.disabled]="gameState.credits() < tower.cost"
                            [disabled]="isGameOver() || gameState.credits() < tower.cost"
                            (click)="selectTowerType(tower.id)"
                            [matTooltip]="tower.damage + ' DMG | ' + tower.range + 'm | ' + tower.fireRate + '/s'">
                      <canvas #towerPreviewCanvas
                              class="td-tower-preview-canvas"
                              [attr.data-tower-id]="tower.id"
                              width="120"
                              height="70"></canvas>
                      <span class="td-tower-card-name">{{ tower.name }}</span>
                      <span class="td-tower-card-cost">{{ tower.cost }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          </section>

          <!-- TOWER Section (only when tower selected) -->
          @if (gameState.selectedTower(); as tower) {
            <section class="td-panel td-tower-panel">
              <div class="td-panel-header">{{ tower.typeConfig.name | uppercase }}</div>
              <div class="td-panel-content td-tower-section">
                <div class="td-tower-stats">
                  <div class="td-stat-row">
                    <span class="td-stat-label">Schaden</span>
                    <span class="td-stat-value td-damage">{{ tower.combat.damage }}</span>
                  </div>
                  <div class="td-stat-row">
                    <span class="td-stat-label">Reichweite</span>
                    <span class="td-stat-value">{{ tower.combat.range }}m</span>
                  </div>
                  <div class="td-stat-row">
                    <span class="td-stat-label">Feuerrate</span>
                    <span class="td-stat-value">{{ tower.combat.fireRate }}/s</span>
                  </div>
                  <div class="td-stat-row">
                    <span class="td-stat-label">Kills</span>
                    <span class="td-stat-value td-kills">{{ tower.combat.kills }}</span>
                  </div>
                </div>

                <!-- Upgrades Section -->
                @if (tower.getAvailableUpgrades().length > 0) {
                  <div class="td-upgrades-section">
                    <div class="td-upgrades-title">UPGRADES</div>
                    @for (upgrade of tower.getAvailableUpgrades(); track upgrade.id) {
                      <button
                        class="td-upgrade-btn"
                        [class.td-upgrade-affordable]="gameState.credits() >= upgrade.cost"
                        [disabled]="gameState.credits() < upgrade.cost"
                        (click)="upgradeTower(tower, upgrade.id)"
                        [matTooltip]="upgrade.description"
                      >
                        <mat-icon>bolt</mat-icon>
                        <span class="td-upgrade-name">{{ upgrade.name }}</span>
                        <span class="td-upgrade-cost">{{ upgrade.cost }}</span>
                      </button>
                    }
                  </div>
                }

                <div class="td-tower-actions">
                  <button class="td-action-btn td-btn-sell" (click)="sellSelectedTower()">
                    <mat-icon>sell</mat-icon>
                    <span>Verkaufen</span>
                    <span class="td-cost td-refund">+{{ tower.typeConfig.sellValue }}</span>
                  </button>
                </div>
              </div>
            </section>
          }

          <!-- Debug Section (collapsible) -->
          @if (debugMode()) {
            <section class="td-panel td-debug-panel">
              <div class="td-panel-header">DEBUG</div>
              <div class="td-panel-content">
                <app-td-debug-panel
                  [streetCount]="streetCount()"
                  [enemyCount]="enemyCount()"
                  [enemySpeed]="enemySpeed()"
                  [enemyType]="enemyType()"
                  [enemyTypes]="enemyTypes"
                  [spawnMode]="spawnMode()"
                  [spawnDelay]="spawnDelay()"
                  [useGathering]="useGathering()"
                  [waveActive]="waveActive()"
                  [baseHealth]="gameState.baseHealth()"
                  [debugLog]="debugLog()"
                  (enemyCountChange)="onEnemyCountChange($event)"
                  (enemySpeedChange)="onSpeedChange($event)"
                  (enemyTypeChange)="onEnemyTypeChange($event)"
                  (toggleSpawnMode)="toggleSpawnMode()"
                  (spawnDelayChange)="onSpawnDelayChange($event)"
                  (toggleGathering)="toggleGathering()"
                  (killAll)="killAllEnemies()"
                  (healHq)="healHq()"
                  (clearLog)="clearDebugLog()"
                  (logCamera)="logCameraPosition()"
                />
              </div>
            </section>
          }
          </div><!-- /td-sidebar-content -->
        </aside>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: contents;
      ${TD_CSS_VARS}
    }

    /* === Container === */
    .td-container {
      display: flex;
      flex-direction: column;
      width: 90vw;
      max-width: 1400px;
      height: 85vh;
      max-height: 900px;
      background: var(--td-bg-dark);
      border: 2px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-radius: 4px;
      overflow: hidden;
      font-family: 'JetBrains Mono', monospace;
    }

    .td-container.td-fullscreen {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
      border: none;
    }

    /* === Header === */
    .td-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 12px;
      background:
        linear-gradient(rgba(15, 19, 15, 0.8), rgba(15, 19, 15, 0.8)),
        url('/assets/games/tower-defense/images/425.jpg') repeat;
      background-size: auto, 64px 64px;
      border-bottom: 3px solid var(--td-panel-shadow);
      border-top: 1px solid var(--td-frame-light);
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.5),
        0 2px 4px rgba(0, 0, 0, 0.3),
        inset 0 -2px 4px rgba(0, 0, 0, 0.3);
    }

    /* Textured Background Overlay - fuer Lesbarkeit auf Stein-Textur */
    .td-text-badge {
      background: var(--td-panel-shadow);
      padding: 4px 10px;
      border: 1px solid var(--td-frame-dark);
      border-top-color: var(--td-frame-mid);
    }

    .td-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--td-panel-shadow);
      padding: 4px 10px;
      border: 1px solid var(--td-frame-dark);
      border-top-color: var(--td-frame-mid);
    }

    .td-title-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--td-gold);
    }

    .td-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      color: var(--td-gold);
      text-transform: uppercase;
    }

    .td-location-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      margin-left: 8px;
      background: transparent;
      border: 1px solid transparent;
      border-left: 1px solid var(--td-frame-mid);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      border-radius: 0 3px 3px 0;
      font-family: inherit;
      font-size: 10px;
    }

    .td-location-btn:hover {
      border-color: var(--td-gold-dark);
      background: rgba(255, 215, 0, 0.1);
      color: var(--td-gold);
    }

    .td-location-name {
      font-weight: 500;
    }

    .td-location-edit {
      font-size: 12px;
      width: 12px;
      height: 12px;
      opacity: 0.5;
    }

    .td-location-btn:hover .td-location-edit {
      opacity: 1;
    }

    .td-header-stats {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      margin-right: 8px;
    }

    .td-stat {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      background: var(--td-panel-shadow);
      padding: 4px 10px;
      min-width: 50px;
      border: 1px solid var(--td-frame-dark);
      border-top-color: var(--td-frame-mid);
    }

    .td-stat mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .td-stat.hp { color: var(--td-health-red); }
    .td-stat.credits { color: var(--td-gold); }
    .td-stat.wave { color: var(--td-teal); }
    .td-stat.enemies { color: var(--td-warn-orange); }
    .td-stat.fps { color: var(--td-text-muted); font-size: 10px; min-width: auto; }

    .td-close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: var(--td-panel-shadow);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-close-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .td-close-btn:hover {
      background: var(--td-health-red);
      color: var(--td-text-primary);
    }

    /* === Main Layout === */
    .td-main {
      flex: 1;
      display: flex;
      overflow: visible; /* Allow canvas-area children to extend beyond bounds */
    }

    /* === Canvas Area === */
    .td-canvas-area {
      flex: 1;
      position: relative;
      background: var(--td-panel-shadow);
      overflow: visible; /* Allow quick-actions to extend beyond bounds */
    }

    .td-canvas {
      width: 100%;
      height: 100%;
    }

    .td-canvas.hidden {
      visibility: hidden;
    }

    .td-controls-hint {
      position: absolute;
      bottom: 8px;
      left: 8px;
      font-size: 11px;
      color: var(--td-text-secondary);
      background: rgba(20, 24, 21, 0.85);
      padding: 4px 8px;
      border-radius: 3px;
      border: 1px solid var(--td-frame-dark);
      z-index: 5;
    }

    /* Quick Actions (bottom right over canvas) */
    .td-quick-actions {
      position: absolute;
      bottom: 8px;
      right: 8px;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      z-index: 5;
    }

    .td-quick-actions > * {
      flex-shrink: 0;
    }

    .td-layer-toggles {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.2s ease, opacity 0.15s ease;
    }

    .td-layer-toggles.expanded {
      max-height: 160px; /* 4 buttons × 32px + 3 gaps × 4px + margin */
      opacity: 1;
    }

    .td-layer-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      min-width: 32px;
      min-height: 32px;
      box-sizing: border-box;
      background: var(--td-panel-main);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-layer-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .td-layer-btn:hover {
      background: var(--td-frame-mid);
      color: var(--td-text-primary);
    }

    .td-layer-btn.active {
      background: var(--td-teal);
      color: var(--td-bg-dark);
    }

    .td-quick-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      min-width: 32px;
      min-height: 32px;
      box-sizing: border-box;
      background: var(--td-panel-main);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-quick-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .td-quick-btn:hover {
      background: var(--td-frame-mid);
      color: var(--td-text-primary);
    }

    .td-quick-btn.active {
      background: var(--td-teal);
      color: var(--td-bg-dark);
    }

    .td-layer-toggle-btn.active {
      background: var(--td-gold-dark);
      color: var(--td-text-primary);
    }

    /* === Dev Menu (expands inline, pushes buttons left) === */
    .td-dev-menu-wrapper {
      display: flex;
      flex-direction: row;
      align-items: flex-end;
    }

    .td-dev-menu {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 0;
      overflow: hidden;
      opacity: 0;
      transition: all 0.2s ease;
    }

    .td-dev-menu.expanded {
      max-width: 40px;
      margin-right: 4px;
      opacity: 1;
    }

    .td-dev-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      min-width: 32px;
      min-height: 32px;
      box-sizing: border-box;
      background: var(--td-panel-main);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-dev-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .td-dev-btn:hover {
      background: var(--td-frame-mid);
      color: var(--td-text-primary);
    }

    .td-dev-btn.active {
      background: var(--td-gold-dark);
      color: var(--td-text-primary);
    }

    .td-dev-toggle-btn.active {
      background: var(--td-gold-dark);
      color: var(--td-text-primary);
    }

    /* === Sidebar === */
    .td-sidebar {
      width: 300px;
      position: relative;
      display: flex;
      flex-direction: column;
    }

    .td-sidebar-content {
      flex: 1;
      background:
        linear-gradient(rgba(15, 19, 15, 0.75), rgba(15, 19, 15, 0.75)),
        url('/assets/games/tower-defense/images/425.jpg') repeat;
      background-size: auto, 100px 100px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      overflow-y: auto;
      position: relative;
      z-index: 1;
      border-left: 4px solid var(--td-panel-shadow);
      box-shadow:
        -6px 0 12px rgba(0, 0, 0, 0.5),
        -3px 0 6px rgba(0, 0, 0, 0.3),
        inset 4px 0 8px rgba(0, 0, 0, 0.4);
    }

    /* === Panel (WC3 Style) === */
    .td-panel {
      background: var(--td-panel-main);
      border-top: 1px solid var(--td-frame-light);
      border-left: 1px solid var(--td-frame-mid);
      border-right: 1px solid var(--td-frame-dark);
      border-bottom: 2px solid var(--td-frame-dark);
    }

    .td-panel-header {
      padding: 6px 10px;
      background: var(--td-panel-secondary);
      border-bottom: 1px solid var(--td-frame-dark);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      color: var(--td-gold);
      text-transform: uppercase;
    }

    .td-panel-content {
      padding: 8px;
    }

    /* === Status Panel === */
    .td-stat-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .td-stat-row:last-child {
      margin-bottom: 0;
    }

    .td-stat-label {
      font-size: 10px;
      color: var(--td-text-muted);
      width: 50px;
    }

    .td-stat-value {
      font-size: 12px;
      font-weight: 600;
      color: var(--td-text-primary);
    }

    .td-stat-value.td-gold { color: var(--td-gold); }
    .td-stat-value.td-orange { color: var(--td-warn-orange); }

    /* HP Bar */
    .td-hp-bar {
      flex: 1;
      height: 10px;
      background: var(--td-hp-bg);
      border: 1px solid var(--td-frame-dark);
      border-top-color: var(--td-frame-mid);
    }

    .td-hp-fill {
      height: 100%;
      background: var(--td-hp-fill);
      transition: width 0.3s ease;
    }

    /* === Actions Panel === */
    .td-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .td-action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 10px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-primary);
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-action-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--td-teal);
    }

    .td-action-btn:hover:not(:disabled) {
      background: var(--td-frame-mid);
    }

    .td-action-btn.active {
      background: var(--td-gold-dark);
      color: var(--td-bg-dark);
    }

    .td-action-btn.active mat-icon {
      color: var(--td-bg-dark);
    }

    .td-action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .td-action-btn.td-btn-green:not(:disabled) {
      background: var(--td-green);
      color: var(--td-bg-dark);
    }

    .td-action-btn.td-btn-green mat-icon {
      color: var(--td-bg-dark);
    }

    .td-action-btn.td-btn-green:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    .td-build-hint {
      padding: 4px 8px;
      background: var(--td-warn-orange);
      color: var(--td-bg-dark);
      font-size: 10px;
      font-weight: 600;
      text-align: center;
      animation: td-pulse 1.5s ease-in-out infinite;
    }

    @keyframes td-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    /* === Wave Section === */
    .td-wave-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .td-wave-info {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .td-enemy-preview-container {
      flex-shrink: 0;
      width: 72px;
      height: 72px;
      background: linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%);
      border: 1px solid var(--td-frame-dark);
      border-radius: 4px;
      overflow: hidden;
    }

    .td-enemy-preview-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    .td-enemy-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--td-warn-orange);
      margin-bottom: 4px;
    }

    .td-wave-stats {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .td-stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
    }

    .td-stat-label {
      color: var(--td-text-secondary);
      font-size: 10px;
      text-transform: uppercase;
    }

    .td-stat-value {
      color: var(--td-text-primary);
      font-size: 12px;
      font-weight: 600;
    }

    .td-wave-btn {
      margin-top: 4px;
    }

    /* === Build Section === */
    .td-build-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .td-tower-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }

    .td-tower-card {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 0;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
      border-radius: 3px;
      overflow: hidden;
    }

    .td-tower-card:hover:not(:disabled) {
      border-color: var(--td-gold-dark);
      box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
    }

    .td-tower-card:disabled,
    .td-tower-card.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .td-tower-preview-canvas {
      width: 100%;
      height: 70px;
      display: block;
      background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%);
    }

    .td-tower-card-name {
      display: block;
      padding: 4px 6px;
      font-size: 9px;
      font-weight: 600;
      color: var(--td-text-secondary);
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: var(--td-panel-main);
      border-top: 1px solid var(--td-frame-dark);
    }

    .td-tower-card-cost {
      position: absolute;
      top: 4px;
      right: 4px;
      padding: 2px 6px;
      background: var(--td-gold-dark);
      color: var(--td-bg-dark);
      font-size: 9px;
      font-weight: 700;
      border-radius: 2px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    }

    .td-tower-card:hover:not(:disabled) .td-tower-card-name {
      color: var(--td-gold);
    }

    .td-cancel-btn {
      background: var(--td-panel-secondary);
    }

    .td-cancel-btn mat-icon {
      color: var(--td-red);
    }

    .td-cancel-btn:hover {
      background: rgba(244, 67, 54, 0.2);
    }

    .td-cost {
      margin-left: auto;
      padding: 2px 6px;
      background: var(--td-gold-dark);
      color: var(--td-bg-dark);
      font-size: 10px;
      font-weight: 700;
      border-radius: 2px;
    }

    /* === Tower Section === */
    .td-tower-panel {
      border-color: var(--td-teal);
    }

    .td-tower-panel .td-panel-header {
      background: linear-gradient(180deg, var(--td-teal) 0%, rgba(0, 188, 212, 0.3) 100%);
      color: var(--td-bg-dark);
    }

    .td-tower-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .td-tower-stats {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--td-frame-dark);
    }

    .td-stat-value.td-damage {
      color: var(--td-red);
    }

    .td-stat-value.td-kills {
      color: var(--td-gold);
    }

    .td-tower-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .td-btn-upgrade {
      background: var(--td-panel-secondary);
    }

    .td-btn-upgrade mat-icon {
      color: var(--td-teal);
    }

    .td-btn-sell {
      background: var(--td-panel-secondary);
    }

    .td-btn-sell mat-icon {
      color: var(--td-red);
    }

    .td-btn-sell:hover:not(:disabled) {
      background: rgba(244, 67, 54, 0.2);
    }

    .td-refund {
      background: var(--td-green);
    }

    /* === Upgrade Section === */
    .td-upgrades-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0;
      padding-top: 8px;
      border-top: 1px solid var(--td-frame-dark);
    }

    .td-upgrades-title {
      font-size: 9px;
      font-weight: 600;
      color: var(--td-text-muted);
      letter-spacing: 0.5px;
    }

    .td-upgrade-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-upgrade-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--td-gold);
    }

    .td-upgrade-btn:hover:not(:disabled) {
      background: rgba(255, 193, 7, 0.15);
      border-color: var(--td-gold-dark);
    }

    .td-upgrade-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .td-upgrade-btn.td-upgrade-affordable {
      border-color: var(--td-gold-dark);
    }

    .td-upgrade-name {
      flex: 1;
      text-align: left;
    }

    .td-upgrade-cost {
      padding: 2px 6px;
      background: var(--td-gold);
      color: var(--td-bg-dark);
      font-size: 10px;
      font-weight: 600;
      border-radius: 2px;
    }

    .td-upgrade-cost::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 2px;
      background: url('/assets/games/tower-defense/images/gold.svg') center/contain no-repeat;
      vertical-align: middle;
    }

    /* === Camera Buttons === */
    .td-camera-btns {
      display: flex;
      gap: 4px;
    }

    .td-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-icon-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .td-icon-btn:hover {
      background: var(--td-frame-mid);
      color: var(--td-text-primary);
    }

    .td-icon-btn.active {
      background: var(--td-teal);
      color: var(--td-bg-dark);
    }

    /* === Debug Panel === */
    .td-debug-panel {
      flex: 1;
      overflow: hidden;
    }

    .td-debug-panel .td-panel-content {
      padding: 0;
      height: 100%;
    }

    /* === Overlays === */
    .td-loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: color-mix(in srgb, var(--td-bg-dark) 90%, transparent);
      backdrop-filter: blur(2px);
      z-index: 10;
      pointer-events: all; /* Block clicks to canvas below */
    }

    .td-loading-overlay mat-spinner ::ng-deep circle {
      stroke: var(--td-gold) !important;
    }

    .td-loading-title {
      color: var(--td-gold);
      font-size: 18px;
      font-weight: 600;
      margin-top: 12px;
      text-align: center;
    }

    .td-loading-steps {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 16px;
      padding: 16px;
      background: color-mix(in srgb, var(--td-bg-surface) 50%, transparent);
      border-radius: 8px;
      min-width: 240px;
    }

    .td-loading-step {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--td-text-tertiary);
      font-size: 13px;
      transition: color 0.2s;
    }

    .td-step-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      transition: color 0.2s;
    }

    .td-loading-step.active {
      color: var(--td-text-primary);
    }

    .td-loading-step.active .td-step-icon {
      color: var(--td-gold);
      animation: spin 1s linear infinite;
    }

    .td-loading-step.done {
      color: var(--td-text-secondary);
    }

    .td-loading-step.done .td-step-icon {
      color: var(--td-green);
    }

    .td-step-detail {
      color: var(--td-text-tertiary);
      font-size: 11px;
      margin-left: auto;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .td-error-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: var(--td-bg-dark);
      z-index: 10;
    }

    .td-error-overlay {
      padding: 40px;
      text-align: center;
    }

    .td-error-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--td-warn-orange);
    }

    .td-error-overlay h3 {
      font-size: 20px;
      color: var(--td-warn-orange);
      margin: 0;
    }

    .td-error-overlay p {
      color: var(--td-text-secondary);
      max-width: 400px;
    }

    .td-token-instructions {
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      padding: 16px;
      text-align: left;
      margin: 16px 0;
    }

    .td-token-instructions p { margin: 8px 0; font-size: 12px; }
    .td-token-instructions a { color: var(--td-teal); }
    .td-token-instructions code {
      background: var(--td-panel-shadow);
      padding: 2px 6px;
      font-size: 11px;
    }
    .td-token-instructions pre {
      background: var(--td-panel-shadow);
      border: 1px solid var(--td-frame-dark);
      padding: 10px;
      font-size: 11px;
      color: var(--td-green);
    }

    /* Generic Buttons */
    .td-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: var(--td-gold);
      border: none;
      border-top: 1px solid var(--td-edge-highlight);
      border-bottom: 2px solid var(--td-gold-dark);
      color: var(--td-bg-dark);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }

    .td-btn:hover { filter: brightness(1.1); }

    .td-btn-gold { background: var(--td-gold); border-bottom-color: var(--td-gold-dark); }
    .td-btn-green {
      background: var(--td-green);
      border-bottom-color: var(--td-green-dark);
    }

    /* Gathering Overlay */
    .td-gathering-overlay {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      background: var(--td-panel-main);
      border: 2px solid var(--td-warn-orange);
      z-index: 10;
      animation: td-pulse 1s ease-in-out infinite;
    }

    .td-gathering-overlay mat-icon {
      color: var(--td-warn-orange);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .td-gathering-overlay span {
      font-size: 12px;
      font-weight: 600;
      color: var(--td-warn-orange);
    }

    /* Game Over Overlay */
    .td-gameover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.8);
      z-index: 20;
      animation: td-fade-in 0.5s ease;
    }

    @keyframes td-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .td-gameover-content {
      text-align: center;
      padding: 40px 60px;
      background: var(--td-panel-main);
      border: 3px solid var(--td-health-red);
      box-shadow: 0 0 40px rgba(177, 68, 54, 0.5);
    }

    .td-gameover-content h1 {
      font-size: 48px;
      font-weight: 900;
      color: var(--td-health-red);
      margin: 0 0 16px 0;
      letter-spacing: 6px;
      animation: td-shake 0.5s ease-in-out;
    }

    @keyframes td-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-3px); }
      80% { transform: translateX(3px); }
    }

    .td-gameover-content p {
      font-size: 14px;
      color: var(--td-text-secondary);
      margin: 0 0 24px 0;
    }

    .td-gameover-content .td-btn {
      padding: 12px 28px;
      font-size: 14px;
    }

    .td-gameover-content .td-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `,
})
export class TowerDefenseComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('enemyPreviewCanvas') enemyPreviewCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('towerPreviewCanvas') towerPreviewCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  private readonly dialogRef = inject(MatDialogRef<TowerDefenseComponent>, { optional: true });
  private readonly dialog = inject(MatDialog);
  private readonly osmService = inject(OsmStreetService);
  private readonly api = inject(ApiService);
  private readonly configService = inject(ConfigService);
  private readonly geocodingService = inject(GeocodingService);
  readonly gameState = inject(GameStateManager);
  private readonly entityPool = inject(EntityPoolService);
  private readonly modelPreview = inject(ModelPreviewService);

  // Expose Math and tower config for template
  readonly Math = Math;
  readonly archerTowerConfig = TOWER_TYPES.archer;
  readonly towerTypes = getAllTowerTypes();

  // Selected tower type for building
  readonly selectedTowerType = signal<TowerTypeId>('archer');

  private engine: ThreeTilesEngine | null = null;
  private streetNetwork: StreetNetwork | null = null;

  // Three.js objects for markers and routes
  private streetLines: THREE.Line[] = [];
  private routeLines: THREE.Line[] = [];
  private spawnMarkers: THREE.Group[] = [];
  private baseMarker: THREE.Group | null = null;
  private heightDebugGroup: THREE.Group | null = null;

  readonly loading = signal(true);
  readonly tilesLoading = signal(true); // True until first tiles are loaded
  readonly osmLoading = signal(true); // True until OSM streets are loaded
  readonly heightsLoading = signal(true); // True until overlay heights are stable
  readonly heightProgress = signal(0); // Height update attempts (0-4 typically)
  readonly error = signal<string | null>(null);
  readonly loadingStatus = signal('Initialisiere...'); // Current status text

  // Loading steps for detailed progress display
  readonly loadingSteps = signal<{ id: string; label: string; status: 'pending' | 'active' | 'done'; detail?: string }[]>([
    { id: 'init', label: 'Initialisiere Engine', status: 'pending' },
    { id: 'streets', label: 'Lade Straßennetz', status: 'pending' },
    { id: 'hq', label: 'Platziere Hauptquartier', status: 'pending' },
    { id: 'spawn', label: 'Platziere Spawn-Punkt', status: 'pending' },
    { id: 'route', label: 'Berechne Route', status: 'pending' },
    { id: 'finalize', label: 'Finalisiere 3D-Ansicht', status: 'pending' },
  ]);
  readonly streetsVisible = signal(false);
  readonly routesVisible = signal(false);
  readonly towerDebugVisible = signal(false);
  readonly debugMode = signal(false);
  readonly heightDebugVisible = signal(false);
  readonly layerMenuExpanded = signal(false);
  readonly devMenuExpanded = signal(false);
  readonly enemySpeed = signal(5); // Meter pro Sekunde
  readonly streetCount = signal(0);
  // Debug: Spawn-Einstellungen
  readonly enemyCount = signal(2);
  readonly enemyType = signal<EnemyTypeId>('zombie');
  readonly enemyTypes = getAllEnemyTypes(); // Für Debug-Panel Dropdown
  readonly spawnMode = signal<'each' | 'random'>('each'); // each = verteilt, random = zufällig
  readonly spawnDelay = signal(300); // ms zwischen Spawns
  readonly useGathering = signal(false); // Alle sammeln und dann loslaufen
  readonly debugLog = signal('');
  readonly spawnPoints = signal<SpawnPoint[]>([]);
  readonly baseCoords = signal(DEFAULT_BASE_COORDS);
  readonly centerCoords = signal(DEFAULT_CENTER_COORDS);
  readonly buildMode = signal(false);
  readonly fps = signal(0);

  // Editable location settings (for debug panel)
  readonly editableHqLocation = signal<LocationConfig | null>(null);
  readonly editableSpawnLocations = signal<SpawnLocationConfig[]>([]);
  readonly isApplyingLocation = signal(false);

  readonly waveActive = computed(() => this.gameState.phase() === 'wave');
  readonly isGameOver = computed(() => this.gameState.phase() === 'gameover');
  readonly currentEnemyConfig = computed(() => getEnemyType(this.enemyType()));

  // Location name for header display - smart extraction from address
  readonly currentLocationName = computed(() => {
    const hq = this.editableHqLocation();
    if (!hq) return 'Erlenbach';

    // Try to build smart name from structured address
    if (hq.address) {
      const addr = hq.address;
      const parts: string[] = [];

      // Street + house number
      if (addr.road) {
        parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road);
      }

      // City (prefer city > town > village > municipality)
      const city = addr.city || addr.town || addr.village || addr.municipality;
      if (city) {
        parts.push(city);
      }

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }

    // Fall back to displayName
    if (hq.name) {
      return hq.name;
    }

    // Last resort: coordinates
    return `${hq.lat.toFixed(4)}, ${hq.lon.toFixed(4)}`;
  });
  readonly gatheringPhase = signal(false);
  private waveAborted = false; // Flag to stop spawning when kill-all is pressed
  readonly gatheringCountdown = signal(0);

  private animationFrameId: number | null = null;
  private cachedPaths = new Map<string, GeoPosition[]>();
  private buildPreviewMesh: THREE.Mesh | null = null;
  private lastPreviewValidation: boolean | null = null;

  // Track mouse position to distinguish clicks from pans
  private mouseDownPos: { x: number; y: number } | null = null;
  private readonly PAN_THRESHOLD_PX = 10; // Pixels - movement beyond this is a pan
  private previewThrottleId: number | null = null;
  private previewDebugCount = 0;

  private readonly MIN_DISTANCE_TO_STREET = 10;
  private readonly MAX_DISTANCE_TO_STREET = 50;
  private readonly MIN_DISTANCE_TO_BASE = 30;
  private readonly MIN_DISTANCE_TO_SPAWN = 30;
  private readonly TOWER_RANGE = 60;

  // Stored initial camera position (captured after tiles load)
  private initialCameraPosition: { x: number; y: number; z: number } | null = null;

  ngOnInit(): void {
    this.initializeEditableLocations();
  }

  ngAfterViewInit(): void {
    this.initEngine();
    // Initialize 3D previews after a short delay to ensure DOM is ready
    setTimeout(() => this.initPreviews(), 100);

    // Re-initialize tower previews when the list changes (e.g., after exiting build mode)
    this.towerPreviewCanvases.changes.subscribe(() => {
      setTimeout(() => this.initTowerPreviews(), 50);
    });
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.entityPool.destroy();
    this.modelPreview.dispose();
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
  }

  /**
   * Helper to allow Angular to render between synchronous operations
   * Uses requestAnimationFrame for smooth visual updates
   */
  private tick(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /**
   * Set a loading step to 'active' status and update loadingStatus text
   */
  private async setStepActive(stepId: string): Promise<void> {
    this.loadingSteps.update((steps) =>
      steps.map((s) => ({
        ...s,
        status: s.id === stepId ? 'active' : s.status === 'active' ? 'pending' : s.status,
      }))
    );
    const step = this.loadingSteps().find((s) => s.id === stepId);
    if (step) {
      this.loadingStatus.set(step.label + '...');
    }
    await this.tick();
  }

  /**
   * Set a loading step to 'done' status with optional detail
   */
  private async setStepDone(stepId: string, detail?: string): Promise<void> {
    this.loadingSteps.update((steps) =>
      steps.map((s) => (s.id === stepId ? { ...s, status: 'done' as const, detail } : s))
    );
    await this.tick();
  }

  /**
   * Reset all loading steps to 'pending' for a fresh start
   */
  private resetLoadingSteps(): void {
    this.loadingSteps.set([
      { id: 'init', label: 'Initialisiere Engine', status: 'pending' },
      { id: 'streets', label: 'Lade Straßennetz', status: 'pending' },
      { id: 'hq', label: 'Platziere Hauptquartier', status: 'pending' },
      { id: 'spawn', label: 'Platziere Spawn-Punkt', status: 'pending' },
      { id: 'route', label: 'Berechne Route', status: 'pending' },
      { id: 'finalize', label: 'Finalisiere 3D-Ansicht', status: 'pending' },
    ]);
  }

  /**
   * Get route detail string for loading display
   * Shows number of waypoints and total distance
   */
  private getRouteDetail(): string | undefined {
    if (this.cachedPaths.size === 0) return undefined;

    let totalPoints = 0;
    let totalDistance = 0;

    for (const path of this.cachedPaths.values()) {
      totalPoints += path.length;

      // Calculate path distance
      for (let i = 1; i < path.length; i++) {
        totalDistance += this.osmService.haversineDistance(
          path[i - 1].lat,
          path[i - 1].lon,
          path[i].lat,
          path[i].lon
        );
      }
    }

    // Format distance
    const distStr = totalDistance >= 1000
      ? `${(totalDistance / 1000).toFixed(1)}km`
      : `${Math.round(totalDistance)}m`;

    return `${totalPoints} Punkte, ${distStr}`;
  }

  /**
   * Initialize Three.js rendering engine with 3DTilesRendererJS
   */
  private async initEngine(): Promise<void> {
    try {
      // Reset loading steps for fresh start
      this.resetLoadingSteps();

      // Get Google Maps API Key from ConfigService (loaded from backend /api/config)
      const apiKey = this.configService.googleMapsApiKey();
      if (!apiKey) {
        this.error.set('Bitte konfiguriere deinen Google Maps API Key in appsettings.json.');
        this.loading.set(false);
        return;
      }

      const canvas = this.gameCanvas.nativeElement;
      const container = canvas.parentElement!;
      const rect = container.getBoundingClientRect();

      // Set canvas size
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Get origin coordinates
      const base = this.baseCoords();

      // Step 1: Initialize Engine
      await this.setStepActive('init');
      this.engine = new ThreeTilesEngine(
        canvas,
        apiKey,
        base.latitude,
        base.longitude,
        0
      );
      await this.setStepDone('init');

      // Initialize 3D Tiles (runs in background)
      await this.engine.initialize();
      this.engine.resize(rect.width, rect.height);

      // Register callback for automatic terrain height refresh when tiles load
      this.engine.setOnTilesLoadCallback(() => {
        this.onTilesLoaded();
      });

      // Register callback for first tiles loaded
      this.engine.setOnFirstTilesLoadedCallback(() => {
        this.tilesLoading.set(false);
        console.log('[TD] First tiles loaded');
        this.checkAllLoaded();
      });

      // Register callback for per-frame animations (HQ marker rotation)
      this.engine.setOnUpdateCallback((deltaTime) => {
        this.onEngineUpdate(deltaTime);
      });

      // Preload 3D models in background
      this.engine.preloadModels().then(() => {
        console.log('[TD] All Three.js models preloaded');
      });

      // Setup click handler and build preview
      this.setupClickHandler();
      this.createBuildPreview();

      // Start render loop immediately (tiles load progressively in background)
      this.engine.startRenderLoop();

      // Step 2: Load OSM streets
      await this.setStepActive('streets');
      await this.loadStreets();
      const streetCnt = this.streetCount();
      await this.setStepDone('streets', streetCnt > 0 ? `${streetCnt} Straßen` : undefined);

      // Step 3: Place HQ marker
      await this.setStepActive('hq');
      this.addBaseMarker();
      await this.setStepDone('hq');

      // Step 4: Place spawn points
      await this.setStepActive('spawn');
      this.addPredefinedSpawns();
      const spawnCnt = this.spawnPoints().length;
      await this.setStepDone('spawn', spawnCnt > 0 ? `${spawnCnt} Punkt${spawnCnt > 1 ? 'e' : ''}` : undefined);

      // Step 5: Calculate routes
      await this.setStepActive('route');
      const waveSpawnPoints: WaveSpawnPoint[] = this.spawnPoints().map((sp) => ({
        id: sp.id,
        name: sp.name,
        latitude: sp.latitude,
        longitude: sp.longitude,
      }));

      this.gameState.initialize(
        this.engine,
        this.streetNetwork!,
        { lat: base.latitude, lon: base.longitude },
        waveSpawnPoints,
        this.cachedPaths,
        (msg: string) => this.appendDebugLog(msg),
        () => this.onGameOver()
      );

      // Get route details for display
      const routeDetail = this.getRouteDetail();
      await this.setStepDone('route', routeDetail);

      // Step 6: Finalize 3D view (waits for tiles + height sync)
      await this.setStepActive('finalize');
      this.scheduleOverlayHeightUpdate();

      // Capture initial camera position after tiles stabilize (2 seconds)
      setTimeout(() => {
        if (this.engine) {
          const cam = this.engine.getCamera();
          this.initialCameraPosition = {
            x: cam.position.x,
            y: cam.position.y,
            z: cam.position.z,
          };
          console.log('[Camera] Initial position captured:', this.initialCameraPosition);
        }
      }, 2000);

      // OSM loading done
      this.osmLoading.set(false);
      console.log('[TD] OSM streets loaded');
      this.checkAllLoaded();

    } catch (err) {
      console.error('[TD] Engine init error:', err);
      this.error.set(err instanceof Error ? err.message : 'Fehler beim Laden der 3D-Karte');
      this.loading.set(false);
    }
  }

  /**
   * Check if all loading is complete (tiles + OSM + heights)
   */
  private checkAllLoaded(): void {
    const tiles = this.tilesLoading();
    const osm = this.osmLoading();
    const heights = this.heightsLoading();

    console.log(`[Loading] Check: tiles=${tiles}, osm=${osm}, heights=${heights}`);

    if (!tiles && !osm && !heights) {
      this.loading.set(false);
      console.log('[Loading] ✓ All resources loaded - hiding overlay');
    }
  }

  private setupClickHandler(): void {
    if (!this.engine) return;

    const canvas = this.gameCanvas.nativeElement;

    // Track pointerdown position - use document with capture to intercept before GlobeControls
    document.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.target === canvas || canvas.contains(event.target as Node)) {
        this.mouseDownPos = { x: event.clientX, y: event.clientY };
      }
    }, { capture: true });

    // Click handler
    canvas.addEventListener('click', (event: MouseEvent) => {
      if (!this.engine) return;

      // Check if mouse moved significantly (was a pan, not a click)
      if (this.mouseDownPos) {
        const dx = event.clientX - this.mouseDownPos.x;
        const dy = event.clientY - this.mouseDownPos.y;
        const pixelDist = Math.sqrt(dx * dx + dy * dy);
        this.mouseDownPos = null;

        if (pixelDist > this.PAN_THRESHOLD_PX) {
          return; // Was a pan, ignore
        }
      }

      // First: Check tower selection via direct mesh raycast
      if (!this.buildMode()) {
        const clickedTowerId = this.engine.raycastTowers(event.clientX, event.clientY);

        if (clickedTowerId) {
          if (this.gameState.selectedTowerId() === clickedTowerId) {
            this.gameState.deselectAll();
          } else {
            this.gameState.selectTower(clickedTowerId);
          }
          return; // Tower handled, done
        } else {
          this.gameState.deselectAll();
        }
      }

      // Raycast to get world position (needed for build mode)
      const hitPoint = this.engine.raycastTerrain(event.clientX, event.clientY);

      if (!hitPoint) {
        return; // No terrain hit, but tower selection already handled above
      }

      // Convert to geo coordinates
      const geo = this.engine.sync.localToGeo(hitPoint);

      // If in build mode, try to place tower
      if (this.buildMode()) {
        const validation = this.validateTowerPosition(geo.lat, geo.lon);

        if (validation.valid) {
          // Use geo.height (derived from hitPoint.y via localToGeo) for correct round-trip
          this.placeTowerAt(geo.lat, geo.lon, geo.height);
          this.toggleBuildMode();
        } else {
          console.log('Invalid tower position:', validation.reason);
        }
      }
    });

    // Mouse move handler for build preview
    canvas.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.buildMode() || !this.buildPreviewMesh || !this.engine) return;

      const hitPoint = this.engine.raycastTerrain(event.clientX, event.clientY);

      if (!hitPoint) {
        this.buildPreviewMesh.visible = false;
        return;
      }

      // Update preview position
      this.buildPreviewMesh.position.copy(hitPoint);
      this.buildPreviewMesh.position.y += 1; // Slightly above ground
      this.buildPreviewMesh.visible = true;

      // Validate position
      const geo = this.engine.sync.localToGeo(hitPoint);

      // Debug logging (every 60 frames)
      if (this.previewDebugCount++ % 60 === 0) {
        const origin = this.baseCoords();
        console.log('[BuildPreview] Hit:', hitPoint.x.toFixed(1), hitPoint.y.toFixed(1), hitPoint.z.toFixed(1));
        console.log('[BuildPreview] Geo:', geo.lat.toFixed(6), geo.lon.toFixed(6));
        console.log('[BuildPreview] Origin:', origin.latitude.toFixed(6), origin.longitude.toFixed(6));
      }

      this.updatePreviewValidation(geo.lat, geo.lon);
    });
  }

  private updatePreviewValidation(lat: number, lon: number): void {
    // Throttle validation - only every 30ms
    if (this.previewThrottleId === null) {
      this.previewThrottleId = window.setTimeout(() => {
        this.previewThrottleId = null;
        if (!this.buildPreviewMesh) return;

        const validation = this.validateTowerPosition(lat, lon);
        if (this.lastPreviewValidation !== validation.valid) {
          this.lastPreviewValidation = validation.valid;
          // Update material color
          const material = this.buildPreviewMesh.material as THREE.MeshBasicMaterial;
          material.color.setHex(validation.valid ? 0x22c55e : 0xef4444);
        }
      }, 30);
    }
  }

  private createBuildPreview(): void {
    if (!this.engine) return;

    // Create a simple circle mesh for preview
    const geometry = new THREE.CircleGeometry(8, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false, // Always visible, even when terrain is in front
    });
    this.buildPreviewMesh = new THREE.Mesh(geometry, material);
    this.buildPreviewMesh.rotation.x = -Math.PI / 2; // Horizontal
    this.buildPreviewMesh.visible = false;
    this.buildPreviewMesh.renderOrder = 100; // Render on top

    this.engine.getScene().add(this.buildPreviewMesh);
  }

  private async loadStreets(): Promise<void> {
    try {
      const center = this.centerCoords();
      console.log(`[Streets] Loading for center: ${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)}`);

      this.streetNetwork = await this.osmService.loadStreets(
        center.latitude,
        center.longitude,
        2000 // 2km radius
      );

      console.log(`[Streets] Loaded ${this.streetNetwork.streets.length} streets`);
      console.log(`[Streets] Bounds: ${this.streetNetwork.bounds.minLat.toFixed(6)}-${this.streetNetwork.bounds.maxLat.toFixed(6)}, ${this.streetNetwork.bounds.minLon.toFixed(6)}-${this.streetNetwork.bounds.maxLon.toFixed(6)}`);

      this.streetCount.set(this.streetNetwork.streets.length);
      this.renderStreets();
    } catch (err) {
      console.error('Failed to load streets:', err);
    }
  }

  private renderStreets(): void {
    if (!this.engine || !this.streetNetwork) return;

    const overlayGroup = this.engine.getOverlayGroup();

    // Remove existing street lines
    for (const line of this.streetLines) {
      overlayGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.streetLines = [];

    // Clear height debug markers
    this.clearHeightDebugMarkers();

    // Street overlay material - depthTest: true for correct occlusion
    const material = new THREE.LineBasicMaterial({
      color: 0xffd700,
      linewidth: 2,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.9
    });

    // Height offset above terrain (0 = directly on terrain)
    const HEIGHT_ABOVE_GROUND = 0.5;

    // Get terrain height at HQ (origin) as reference
    const base = this.baseCoords();
    const originTerrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude);
    if (originTerrainY === null) {
      console.log('[Streets] Cannot render - origin terrain height not available');
      return;
    }
    console.log(`[Streets] Origin terrain Y: ${originTerrainY.toFixed(1)}`);

    // Set overlay base Y so overlayGroup is positioned at terrain surface
    this.engine.setOverlayBaseY(originTerrainY);

    let hits = 0, misses = 0;
    // Always create debug markers (hidden by default) so toggleHeightDebug doesn't need to re-render
    const debugMarkerInterval = 10; // Only show every Nth marker to reduce clutter
    let debugMarkerCount = 0;

    for (const street of this.streetNetwork.streets) {
      if (street.nodes.length < 2) continue;

      const points: THREE.Vector3[] = [];

      for (const node of street.nodes) {
        // Get terrain height at this position using local raycast
        const terrainY = this.engine.getTerrainHeightAtGeo(node.lat, node.lon);

        if (terrainY !== null) {
          hits++;
          // Use geoToLocalSimple for X/Z
          const local = this.engine.sync.geoToLocalSimple(node.lat, node.lon, 0);
          // Y = height difference from origin + offset above ground
          local.y = (terrainY - originTerrainY) + HEIGHT_ABOVE_GROUND;
          points.push(local);

          // Add debug marker (only every Nth point) - always create, visibility controlled separately
          if (debugMarkerCount % debugMarkerInterval === 0) {
            this.addHeightDebugMarker(local, terrainY, true);
          }
          debugMarkerCount++;
        } else {
          misses++;
          // Add red debug marker for misses (only every Nth point)
          if (debugMarkerCount % debugMarkerInterval === 0) {
            const localMiss = this.engine.sync.geoToLocalSimple(node.lat, node.lon, 5);
            this.addHeightDebugMarker(localMiss, null, false);
          }
          debugMarkerCount++;
        }
      }

      // Only render street if we have at least 2 points
      if (points.length < 2) continue;

      // Smooth out height anomalies (e.g., hitting buildings instead of ground)
      const smoothedPoints = this.smoothPathHeights(points);

      const geometry = new THREE.BufferGeometry().setFromPoints(smoothedPoints);
      const line = new THREE.Line(geometry, material.clone());
      line.visible = this.streetsVisible();
      line.renderOrder = 1;
      line.frustumCulled = false;  // Prevent disappearing at certain angles
      overlayGroup.add(line);
      this.streetLines.push(line);
    }

    console.log(`[Streets] Rendered with ECEF raycast: ${hits} hits, ${misses} misses, ${this.streetLines.length} lines`);
  }

  /**
   * Smooth out height anomalies in a path of points.
   * Detects points where the height deviates significantly from neighbors
   * and replaces them with interpolated values.
   *
   * This helps when raycasts hit buildings/trees instead of ground.
   */
  private smoothPathHeights(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length < 3) return points;

    const MAX_SLOPE = 0.5; // Max 50% grade (rise/run) before considered anomaly
    const MAX_HEIGHT_DIFF = 10; // Max 10m sudden jump

    const result: THREE.Vector3[] = [];

    for (let i = 0; i < points.length; i++) {
      const current = points[i];

      if (i === 0 || i === points.length - 1) {
        // Keep first and last points as-is
        result.push(current.clone());
        continue;
      }

      const prev = points[i - 1];
      const next = points[i + 1];

      // Calculate horizontal distances
      const distToPrev = Math.sqrt(
        Math.pow(current.x - prev.x, 2) + Math.pow(current.z - prev.z, 2)
      );
      const distToNext = Math.sqrt(
        Math.pow(next.x - current.x, 2) + Math.pow(next.z - current.z, 2)
      );
      const totalDist = distToPrev + distToNext;

      if (totalDist < 0.001) {
        result.push(current.clone());
        continue;
      }

      // Interpolated Y between prev and next
      const t = distToPrev / totalDist;
      const interpolatedY = prev.y + t * (next.y - prev.y);

      // Check if current Y deviates too much
      const heightDiff = Math.abs(current.y - interpolatedY);

      // Check slope to neighbors
      const slopeToPrev = distToPrev > 0 ? Math.abs(current.y - prev.y) / distToPrev : 0;
      const slopeToNext = distToNext > 0 ? Math.abs(current.y - next.y) / distToNext : 0;

      const isAnomaly =
        heightDiff > MAX_HEIGHT_DIFF ||
        (slopeToPrev > MAX_SLOPE && slopeToNext > MAX_SLOPE);

      if (isAnomaly) {
        // Replace with interpolated value
        result.push(new THREE.Vector3(current.x, interpolatedY, current.z));
      } else {
        result.push(current.clone());
      }
    }

    return result;
  }

  /**
   * Add a debug marker at a position showing terrain height
   */
  private addHeightDebugMarker(position: THREE.Vector3, height: number | null, isHit: boolean): void {
    if (!this.engine) return;

    const overlayGroup = this.engine.getOverlayGroup();

    // Create debug group if not exists (hidden by default)
    if (!this.heightDebugGroup) {
      this.heightDebugGroup = new THREE.Group();
      this.heightDebugGroup.name = 'heightDebugGroup';
      this.heightDebugGroup.visible = this.heightDebugVisible();
      overlayGroup.add(this.heightDebugGroup);
    }

    // Create small sphere marker
    const geometry = new THREE.SphereGeometry(1, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: isHit ? 0x00ff00 : 0xff0000, // Green for hits, red for misses
      transparent: true,
      opacity: 0.7,
      depthTest: true,
    });

    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.position.y += 2; // Slightly above the street
    marker.renderOrder = 10;

    this.heightDebugGroup.add(marker);
  }

  /**
   * Clear all height debug markers
   */
  private clearHeightDebugMarkers(): void {
    if (!this.heightDebugGroup || !this.engine) return;

    const overlayGroup = this.engine.getOverlayGroup();

    // Dispose all markers
    this.heightDebugGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
        ((obj as THREE.Mesh).material as THREE.Material).dispose();
      }
    });

    // Remove from overlay
    overlayGroup.remove(this.heightDebugGroup);
    this.heightDebugGroup = null;
  }

  /**
   * Toggle height debug visualization (just visibility, no re-render)
   */
  toggleHeightDebug(): void {
    this.heightDebugVisible.update((v) => !v);
    // Just toggle visibility of existing debug group - no re-render needed
    if (this.heightDebugGroup) {
      this.heightDebugGroup.visible = this.heightDebugVisible();
    }
  }

  /**
   * Called automatically when tiles finish loading (LOD changes)
   * Re-renders terrain-following elements with updated geometry
   */
  private onTilesLoaded(): void {
    if (!this.engine || !this.streetNetwork) return;

    console.log('[TD] Tiles loaded - refreshing terrain heights');

    // Re-render streets with new terrain data
    this.renderStreets();

    // Update marker heights
    this.updateMarkerHeights();

    // Re-render route lines (clear and re-create)
    this.refreshRouteLines();
  }

  /**
   * Called each frame for animations
   */
  private onEngineUpdate(deltaTime: number): void {
    // Update FPS display
    if (this.engine) {
      this.fps.set(this.engine.getFPS());
    }

    // Rotate HQ marker
    if (this.baseMarker) {
      this.baseMarker.rotation.y += deltaTime * 0.001; // Slow rotation
    }

    // Rotate spawn markers (slightly faster, opposite direction)
    for (const marker of this.spawnMarkers) {
      marker.rotation.y -= deltaTime * 0.0015;
    }
  }

  /**
   * Re-render all route lines with updated terrain heights
   */
  private refreshRouteLines(): void {
    if (!this.engine) return;

    const overlayGroup = this.engine.getOverlayGroup();
    const wasVisible = this.routesVisible();

    // Remove existing route lines
    for (const line of this.routeLines) {
      overlayGroup.remove(line);
      line.geometry.dispose();
      if (Array.isArray(line.material)) {
        line.material.forEach((m) => m.dispose());
      } else {
        line.material.dispose();
      }
    }
    this.routeLines = [];

    // Re-create route lines for all spawns
    for (const spawn of this.spawnPoints()) {
      this.showPathFromSpawn(spawn);
    }

    // Restore visibility state
    for (const line of this.routeLines) {
      line.visible = wasVisible;
    }
  }

  private addPredefinedSpawns(): void {
    const colors = [0xef4444, 0xf97316, 0x00bcd4, 0xff00ff]; // red, orange, cyan, magenta

    // Use editable spawn locations if available, otherwise defaults
    const spawns = this.editableSpawnLocations();
    if (spawns.length > 0 && spawns.every(s => s.lat !== 0 && s.lon !== 0)) {
      spawns.forEach((spawn, index) => {
        this.addSpawnPoint(spawn.id, spawn.name || `Spawn ${index + 1}`, spawn.lat, spawn.lon, colors[index % colors.length]);
      });
    } else {
      DEFAULT_SPAWN_POINTS.forEach((spawn, index) => {
        this.addSpawnPoint(spawn.id, spawn.name, spawn.latitude, spawn.longitude, colors[index % colors.length]);
      });
    }
  }

  /**
   * Create a diamond marker with configurable appearance.
   * Used for HQ and spawn point markers.
   */
  private createDiamondMarker(options: {
    color: number;
    size?: number;
    glowIntensity?: number;
    showRings?: boolean;
  }): THREE.Group {
    const {
      color,
      size = 1,
      glowIntensity = 1,
      showRings = true,
    } = options;

    const group = new THREE.Group();

    // Derive colors from base color
    const baseColor = new THREE.Color(color);
    const lighterColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4);
    const emissiveColor = baseColor.clone().multiplyScalar(0.3);

    // === MAIN DIAMOND (inner core) ===
    const coreGeom = new THREE.OctahedronGeometry(8 * size, 0);
    coreGeom.scale(1, 1.8, 1);
    const coreMat = new THREE.MeshPhongMaterial({
      color: color,
      emissive: emissiveColor,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    coreMesh.renderOrder = 3;
    group.add(coreMesh);

    // === OUTER WIREFRAME (edge glow) ===
    const wireGeom = new THREE.OctahedronGeometry(9 * size, 0);
    wireGeom.scale(1, 1.8, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: lighterColor,
      wireframe: true,
      transparent: true,
      opacity: 0.6 * glowIntensity,
    });
    const wireMesh = new THREE.Mesh(wireGeom, wireMat);
    wireMesh.renderOrder = 4;
    group.add(wireMesh);

    // === OUTER GLOW SHELL ===
    const glowGeom = new THREE.OctahedronGeometry(12 * size, 0);
    glowGeom.scale(1, 1.8, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15 * glowIntensity,
      side: THREE.BackSide,
    });
    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    glowMesh.renderOrder = 2;
    group.add(glowMesh);

    if (showRings) {
      // === HORIZONTAL RING ===
      const ringGeom = new THREE.TorusGeometry(14 * size, 0.8 * size, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: lighterColor,
        transparent: true,
        opacity: 0.7 * glowIntensity,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.renderOrder = 2;
      group.add(ringMesh);

      // === SECOND RING (tilted) ===
      const ring2Geom = new THREE.TorusGeometry(16 * size, 0.5 * size, 8, 32);
      const ring2Mat = new THREE.MeshBasicMaterial({
        color: lighterColor,
        transparent: true,
        opacity: 0.4 * glowIntensity,
      });
      const ring2Mesh = new THREE.Mesh(ring2Geom, ring2Mat);
      ring2Mesh.rotation.x = Math.PI / 2;
      ring2Mesh.rotation.z = Math.PI / 6;
      ring2Mesh.renderOrder = 2;
      group.add(ring2Mesh);
    }

    return group;
  }

  /**
   * Dispose a diamond marker group properly
   */
  private disposeDiamondMarker(marker: THREE.Group): void {
    marker.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });
  }

  private addBaseMarker(): void {
    if (!this.engine) return;

    const overlayGroup = this.engine.getOverlayGroup();
    const base = this.baseCoords();

    // Remove existing marker
    if (this.baseMarker) {
      overlayGroup.remove(this.baseMarker);
      this.disposeDiamondMarker(this.baseMarker);
    }

    // Create HQ marker - green, full size with rings
    this.baseMarker = this.createDiamondMarker({
      color: 0x22c55e, // Green
      size: 1,
      showRings: true,
    });
    this.baseMarker.name = 'hqMarker';

    const HEIGHT_ABOVE_GROUND = 30;
    const local = this.engine.sync.geoToLocalSimple(base.latitude, base.longitude, 0);
    this.baseMarker.position.set(local.x, HEIGHT_ABOVE_GROUND, local.z);

    overlayGroup.add(this.baseMarker);
    console.log(`[addBaseMarker] HQ at geo: ${base.latitude.toFixed(6)}, ${base.longitude.toFixed(6)}`);
    console.log(`[addBaseMarker] HQ at local: (${local.x.toFixed(1)}, ${HEIGHT_ABOVE_GROUND}, ${local.z.toFixed(1)})`);
  }

  addSpawnPoint(id: string, name: string, lat: number, lon: number, color: number): void {
    if (!this.engine) return;

    const spawn: SpawnPoint = { id, name, latitude: lat, longitude: lon, color };
    this.spawnPoints.update((points) => [...points, spawn]);

    const overlayGroup = this.engine.getOverlayGroup();

    // Position marker on terrain with RELATIVE heights
    const HEIGHT_ABOVE_GROUND = 30; // Spawn markers ~30m above ground
    const base = this.baseCoords();
    const originTerrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude);
    const terrainY = this.engine.getTerrainHeightAtGeo(lat, lon);
    const local = this.engine.sync.geoToLocalSimple(lat, lon, 0);

    // Calculate relative Y (height difference from origin)
    let markerY = HEIGHT_ABOVE_GROUND;
    if (originTerrainY !== null && terrainY !== null) {
      markerY = (terrainY - originTerrainY) + HEIGHT_ABOVE_GROUND;
    }

    // Create spawn marker - same size as HQ, but no rings
    const marker = this.createDiamondMarker({
      color,
      size: 1.0,
      showRings: false,
      glowIntensity: 0.8,
    });
    marker.name = `spawnMarker_${id}`;
    marker.position.set(local.x, markerY, local.z);

    overlayGroup.add(marker);
    this.spawnMarkers.push(marker);
    console.log('[addSpawnPoint]', name, 'at:', local.x.toFixed(1), markerY.toFixed(1), local.z.toFixed(1));

    this.showPathFromSpawn(spawn);
  }

  /**
   * Snap spawn marker to the actual path start position
   * This ensures the marker is exactly where the route begins
   */
  private snapSpawnMarkerToPathStart(spawnId: string, lat: number, lon: number): void {
    if (!this.engine) return;

    const marker = this.spawnMarkers.find((m) => m.name === `spawnMarker_${spawnId}`);
    if (!marker) return;

    const local = this.engine.sync.geoToLocalSimple(lat, lon, 0);

    // Keep existing Y position (already calculated with terrain)
    const oldY = marker.position.y;
    marker.position.set(local.x, oldY, local.z);

    console.log(`[snapSpawnMarker] Snapped ${spawnId} to path start: (${local.x.toFixed(1)}, ${local.z.toFixed(1)})`);
  }

  private showPathFromSpawn(spawn: SpawnPoint): void {
    if (!this.engine || !this.streetNetwork) return;

    const base = this.baseCoords();
    const path = this.osmService.findPath(
      this.streetNetwork,
      spawn.latitude,
      spawn.longitude,
      base.latitude,
      base.longitude
    );

    if (path.length < 2) return;

    // Snap spawn marker to actual path start (in case findNearestStreetPoint found a different node)
    const pathStart = path[0];
    if (pathStart) {
      this.snapSpawnMarkerToPathStart(spawn.id, pathStart.lat, pathStart.lon);
    }

    // Convert path to geoPath
    let geoPath = path.map((n) => ({ lat: n.lat, lon: n.lon }));

    // Extend the path along the street to find the optimal turn-off point
    geoPath = this.extendPathToOptimalTurnoff(geoPath, base);

    // Find the closest point to HQ on the path
    let closestSegmentIndex = geoPath.length - 2;
    let closestPointOnSegment: { lat: number; lon: number } | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < geoPath.length - 1; i++) {
      const a = geoPath[i];
      const b = geoPath[i + 1];

      const closest = this.closestPointOnSegment(a, b, { lat: base.latitude, lon: base.longitude });
      const dist = this.osmService.haversineDistance(closest.lat, closest.lon, base.latitude, base.longitude);

      if (dist < closestDist) {
        closestDist = dist;
        closestSegmentIndex = i;
        closestPointOnSegment = closest;
      }
    }

    // Cut path at the segment and insert the closest point
    geoPath = geoPath.slice(0, closestSegmentIndex + 1);
    if (closestPointOnSegment) {
      const lastPoint = geoPath[geoPath.length - 1];
      const distToLast = this.osmService.haversineDistance(
        closestPointOnSegment.lat,
        closestPointOnSegment.lon,
        lastPoint.lat,
        lastPoint.lon
      );
      if (distToLast > 1) {
        geoPath.push(closestPointOnSegment);
      }
    }

    // Add HQ as final destination
    geoPath.push({ lat: base.latitude, lon: base.longitude });

    // Create route line in Three.js - on terrain with RELATIVE heights
    const HEIGHT_ABOVE_GROUND = 1;
    const overlayGroup = this.engine.getOverlayGroup();
    const points: THREE.Vector3[] = [];

    // Get origin terrain height as reference
    const origin = this.engine.sync.getOrigin();
    const originTerrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude);
    if (originTerrainY === null) {
      console.log(`[Path] Cannot render route for ${spawn.name} - origin terrain not available`);
      // Cache path with default heights (fallback)
      const pathWithHeights: GeoPosition[] = geoPath.map((pos) => ({
        ...pos,
        height: origin.height, // Use origin height as fallback
      }));
      this.cachedPaths.set(spawn.id, pathWithHeights);
      return;
    }

    // Track which positions got valid terrain samples
    const validIndices: number[] = [];
    const terrainHeights: number[] = []; // Raw local terrain Y values

    for (let i = 0; i < geoPath.length; i++) {
      const pos = geoPath[i];
      const terrainY = this.engine.getTerrainHeightAtGeo(pos.lat, pos.lon);
      if (terrainY !== null) {
        const local = this.engine.sync.geoToLocalSimple(pos.lat, pos.lon, 0);
        // Y = height difference from origin + offset above ground
        local.y = (terrainY - originTerrainY) + HEIGHT_ABOVE_GROUND;
        points.push(local);
        validIndices.push(i);
        terrainHeights.push(terrainY);
      }
    }

    // Smooth out height anomalies
    const smoothedPoints = this.smoothPathHeights(points);

    // Convert smoothed heights back to geo heights and update cached path
    const pathWithHeights: GeoPosition[] = geoPath.map((pos, i) => {
      // Find if this position has a corresponding smoothed point
      const smoothedIdx = validIndices.indexOf(i);
      if (smoothedIdx !== -1 && smoothedIdx < smoothedPoints.length) {
        // Convert smoothed local.y back to terrain Y, then to geo height
        // local.y = (terrainY - originTerrainY) + HEIGHT_ABOVE_GROUND
        // => terrainY = local.y - HEIGHT_ABOVE_GROUND + originTerrainY
        const smoothedLocalY = smoothedPoints[smoothedIdx].y;
        const localTerrainY = smoothedLocalY - HEIGHT_ABOVE_GROUND + originTerrainY;
        const geoHeight = localTerrainY + origin.height;
        return { ...pos, height: geoHeight };
      } else {
        // Position didn't get a valid terrain sample, use origin height
        return { ...pos, height: origin.height };
      }
    });
    this.cachedPaths.set(spawn.id, pathWithHeights);

    console.log(`[Path] Cached ${pathWithHeights.length} points with smoothed heights for ${spawn.name}`);

    const geometry = new THREE.BufferGeometry().setFromPoints(smoothedPoints);
    const material = new THREE.LineBasicMaterial({
      color: spawn.color,
      linewidth: 3,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.9
    });
    const routeLine = new THREE.Line(geometry, material);
    routeLine.visible = this.routesVisible();
    routeLine.renderOrder = 1;
    routeLine.frustumCulled = false;  // Prevent disappearing at certain angles

    overlayGroup.add(routeLine);
    this.routeLines.push(routeLine);
  }

  private validateTowerPosition(lat: number, lon: number): { valid: boolean; reason?: string } {
    if (!this.streetNetwork) {
      console.log('[Validate] No street network loaded!');
      return { valid: false, reason: 'Strassennetz nicht geladen' };
    }

    if (this.streetNetwork.streets.length === 0) {
      console.log('[Validate] Street network is empty!');
      return { valid: false, reason: 'Keine Strassen geladen' };
    }

    // Check if click is within street network bounds
    const bounds = this.streetNetwork.bounds;
    const inBounds = lat >= bounds.minLat && lat <= bounds.maxLat &&
                     lon >= bounds.minLon && lon <= bounds.maxLon;
    if (!inBounds) {
      console.log('[Validate] Click OUTSIDE street network bounds!');
      console.log(`  Click: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      console.log(`  Bounds: ${bounds.minLat.toFixed(6)}-${bounds.maxLat.toFixed(6)}, ${bounds.minLon.toFixed(6)}-${bounds.maxLon.toFixed(6)}`);
      return { valid: false, reason: 'Ausserhalb Spielbereich' };
    }

    const base = this.baseCoords();
    const distToBase = this.osmService.haversineDistance(lat, lon, base.latitude, base.longitude);
    if (distToBase < this.MIN_DISTANCE_TO_BASE) {
      return { valid: false, reason: `Zu nah an Basis (${distToBase.toFixed(0)}m)` };
    }

    for (const spawn of this.spawnPoints()) {
      const distToSpawn = this.osmService.haversineDistance(lat, lon, spawn.latitude, spawn.longitude);
      if (distToSpawn < this.MIN_DISTANCE_TO_SPAWN) {
        return { valid: false, reason: `Zu nah am Spawn (${distToSpawn.toFixed(0)}m)` };
      }
    }

    for (const tower of this.gameState.towers()) {
      const distToTower = this.osmService.haversineDistance(lat, lon, tower.position.lat, tower.position.lon);
      if (distToTower < 20) {
        return { valid: false, reason: `Zu nah an Tower (${distToTower.toFixed(0)}m)` };
      }
    }

    const nearest = this.osmService.findNearestStreetPoint(this.streetNetwork, lat, lon);
    if (!nearest) {
      console.log('[Validate] No street found - network bounds:', this.streetNetwork.bounds);
      console.log('[Validate] Click position:', lat, lon);
      return { valid: false, reason: 'Keine Strasse gefunden' };
    }

    // Log occasionally (not every frame)
    if (Math.random() < 0.1) {
      console.log(`[Validate] Street dist: ${nearest.distance.toFixed(1)}m (max: ${this.MAX_DISTANCE_TO_STREET}m)`);
    }

    if (nearest.distance > this.MAX_DISTANCE_TO_STREET) {
      return { valid: false, reason: `Zu weit (${nearest.distance.toFixed(0)}m > ${this.MAX_DISTANCE_TO_STREET}m)` };
    }

    if (nearest.distance < this.MIN_DISTANCE_TO_STREET) {
      return { valid: false, reason: 'Nicht auf Strasse bauen' };
    }

    return { valid: true };
  }

  /**
   * Place tower at specific geo position with known height
   * Height should come from localToGeo(raycastHit) for accuracy
   */
  private placeTowerAt(lat: number, lon: number, height: number): void {
    if (!this.engine) return;

    const position: GeoPosition = { lat, lon, height };
    const typeId = this.selectedTowerType();

    const tower = this.gameState.placeTower(position, typeId);
    if (tower) {
      console.log('[TD] Tower placed at:', lat.toFixed(6), lon.toFixed(6), 'height:', height.toFixed(1), 'type:', typeId);
    }
  }

  /**
   * @deprecated Use placeTowerAt with raycast Y instead
   */
  private async placeTower(lat: number, lon: number): Promise<void> {
    if (!this.engine) return;

    // Sample terrain height at placement position
    const terrainHeight = await this.engine.getTerrainHeight(lat, lon);

    const position: GeoPosition = { lat, lon, height: terrainHeight };
    const typeId = this.selectedTowerType();

    // Use the new manager API - it handles rendering automatically
    const tower = this.gameState.placeTower(position, typeId);
    if (tower) {
      console.log('[TD] Tower placed at:', lat, lon, 'type:', typeId);
    }
  }

  toggleBuildMode(): void {
    this.buildMode.update((v) => !v);
    if (this.buildMode()) {
      this.gameState.deselectAll();
    } else {
      // Hide build preview when exiting build mode
      if (this.buildPreviewMesh) {
        this.buildPreviewMesh.visible = false;
      }
      this.lastPreviewValidation = null;
    }
  }

  /**
   * Select a tower type and activate build mode
   */
  selectTowerType(typeId: TowerTypeId): void {
    this.selectedTowerType.set(typeId);
    this.buildMode.set(true);
    this.gameState.deselectAll();
  }

  /**
   * Initialize all 3D model previews
   */
  private initPreviews(): void {
    this.modelPreview.initialize();
    this.initEnemyPreview();
    this.initTowerPreviews();
  }

  /**
   * Initialize the enemy preview in the wave section
   */
  private initEnemyPreview(): void {
    if (!this.enemyPreviewCanvas?.nativeElement) return;

    const enemyConfig = this.currentEnemyConfig();
    this.modelPreview.createPreview(
      'enemy-preview',
      this.enemyPreviewCanvas.nativeElement,
      {
        modelUrl: enemyConfig.modelUrl,
        scale: enemyConfig.scale * 0.5,
        rotationSpeed: 0.4,
        cameraDistance: 7,
        cameraAngle: Math.PI / 12,
        animationName: enemyConfig.walkAnimation || enemyConfig.idleAnimation || undefined,
        animationTimeScale: 0.7,
        lightIntensity: 1.3,
        groundModel: true,
      }
    );
  }

  /**
   * Initialize tower previews in the build menu
   */
  private initTowerPreviews(): void {
    if (!this.towerPreviewCanvases) return;

    this.towerPreviewCanvases.forEach((canvasRef) => {
      const canvas = canvasRef.nativeElement;
      const towerId = canvas.getAttribute('data-tower-id') as TowerTypeId;
      if (!towerId) return;

      const towerConfig = TOWER_TYPES[towerId];
      if (!towerConfig) return;

      this.modelPreview.createPreview(
        `tower-preview-${towerId}`,
        canvas,
        {
          modelUrl: towerConfig.modelUrl,
          scale: towerConfig.scale * 0.4,
          rotationSpeed: 0.4,
          cameraDistance: 20,
          cameraAngle: Math.PI / 5,
          lightIntensity: 1.2,
        }
      );
    });
  }

  /**
   * Sell the currently selected tower
   */
  sellSelectedTower(): void {
    const tower = this.gameState.selectedTower();
    if (tower) {
      const refund = this.gameState.sellTower(tower);
      console.log(`[TD] Tower sold for ${refund} credits`);
    }
  }

  /**
   * Upgrade a tower with the specified upgrade
   */
  upgradeTower(tower: Tower, upgradeId: UpgradeId): void {
    const upgrade = tower.typeConfig.upgrades.find(u => u.id === upgradeId);
    if (!upgrade) return;

    // Check if we can afford it
    if (this.gameState.credits() < upgrade.cost) {
      console.log(`[TD] Cannot afford upgrade: ${upgrade.cost} credits needed`);
      return;
    }

    // Check if upgrade can be applied
    if (!tower.canUpgrade(upgradeId)) {
      console.log(`[TD] Upgrade already at max level`);
      return;
    }

    // Deduct credits and apply upgrade
    this.gameState.spendCredits(upgrade.cost);
    const success = tower.applyUpgrade(upgradeId);

    if (success) {
      console.log(`[TD] Applied ${upgrade.name} upgrade to tower. New fireRate: ${tower.combat.fireRate}/s`);
    }
  }

  /**
   * Startet eine neue Welle mit dem 2-Phasen-System:
   *
   * PHASE 1 - SAMMELN (ca. N * 100ms):
   * - Gegner spawnen nacheinander (100ms Delay)
   * - Stehen still am Spawn-Punkt (paused=true)
   * - Models werden asynchron geladen → verteilt GPU-Last
   *
   * PHASE 2 - ANGRIFF (nach 500ms Pause):
   * - Gegner laufen einzeln los (300ms Delay zwischen jedem)
   * - Walk-Animation startet
   * - Game-Loop beginnt
   */
  startWave(): void {
    if (!this.engine || this.waveActive() || this.isGameOver()) return;

    const spawns = this.spawnPoints();
    if (spawns.length === 0) return;

    const totalEnemies = this.enemyCount();
    const gathering = this.useGathering();

    // Reset abort flag at start of new wave
    this.waveAborted = false;

    this.gameState.beginWave();

    if (gathering) {
      this.gatheringPhase.set(true);
    }

    // Start game loop immediately (enemies will be updated as they spawn)
    this.startGameLoop();

    let spawnedCount = 0;

    const spawnNext = () => {
      // Stop spawning if wave was aborted
      if (this.waveAborted) {
        this.gatheringPhase.set(false);
        return;
      }

      if (spawnedCount >= totalEnemies) {
        if (gathering) {
          // Gathering mode: Start all enemies together after short delay
          setTimeout(() => {
            if (!this.waveAborted) {
              this.gatheringPhase.set(false);
              this.gameState.startAllEnemies(300); // 300ms zwischen jedem Start
            }
          }, 500);
        }
        return;
      }

      // Read current settings live (allows changing during wave)
      const mode = this.spawnMode();
      const speed = this.enemySpeed();

      // Spawn-Punkt auswählen (Verteilt oder Zufällig)
      let currentSpawn: SpawnPoint;
      if (mode === 'each') {
        currentSpawn = spawns[spawnedCount % spawns.length];
      } else {
        currentSpawn = spawns[Math.floor(Math.random() * spawns.length)];
      }

      const spawnPath = this.cachedPaths.get(currentSpawn.id);

      if (spawnPath && spawnPath.length > 1) {
        // In gathering mode: spawn paused, otherwise spawn and start immediately
        this.gameState.spawnEnemy(spawnPath, this.enemyType(), speed, gathering);
        spawnedCount++;
      }

      // Read delay live for next spawn
      setTimeout(spawnNext, this.spawnDelay());
    };

    spawnNext();
  }

  private startGameLoop(): void {
    const animate = () => {
      if (!this.engine || this.gameState.phase() === 'gameover') {
        this.animationFrameId = null;
        return;
      }

      const currentTime = performance.now();
      this.gameState.update(currentTime);

      if (this.gameState.checkWaveComplete()) {
        this.gameState.endWave();
        this.animationFrameId = null;
        return;
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  resetCamera(): void {
    if (!this.engine) return;

    // Use stored initial camera position if available
    if (this.initialCameraPosition) {
      const pos = this.initialCameraPosition;
      // Look at terrain level (Y - 400 since camera is 400m above ground)
      const lookAtY = pos.y - 400;
      this.engine.setLocalCameraPosition(pos.x, pos.y, pos.z, 0, lookAtY, 0);
    } else {
      // Fallback: calculate from terrain (less accurate before tiles fully load)
      const base = this.baseCoords();
      const terrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude) ?? 0;
      const heightAboveGround = 400;
      const cameraY = terrainY + heightAboveGround;
      this.engine.setLocalCameraPosition(0, cameraY, -heightAboveGround, 0, terrainY, 0);
    }
  }

  toggleStreets(): void {
    this.streetsVisible.update((v) => !v);
    const visible = this.streetsVisible();

    for (const line of this.streetLines) {
      line.visible = visible;
    }
  }

  toggleRoutes(): void {
    this.routesVisible.update((v) => !v);
    const visible = this.routesVisible();

    for (const line of this.routeLines) {
      line.visible = visible;
    }
  }

  toggleTowerDebug(): void {
    this.towerDebugVisible.update((v) => !v);
    const visible = this.towerDebugVisible();

    console.log('[TowerDefense] toggleTowerDebug:', visible, 'engine:', !!this.engine);

    if (this.engine) {
      this.engine.towers.setDebugMode(visible);
    }
  }

  toggleDebug(): void {
    this.debugMode.update((v: boolean) => !v);
  }

  toggleLayerMenu(): void {
    this.layerMenuExpanded.update((v) => !v);
  }

  toggleDevMenu(): void {
    this.devMenuExpanded.update((v) => !v);
  }

  resetToDefaultLocation(): void {
    console.log('[TowerDefense] Resetting to default location: Erlenbach');

    // Use the existing reset method
    this.onResetLocations();

    // Close dev menu
    this.devMenuExpanded.set(false);
  }

  logCameraPosition(): void {
    if (!this.engine) return;

    const camera = this.engine.getCamera();

    const data = {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      hq: this.baseCoords(),
      tiltAngle: 45, // fixed
    };

    const output = JSON.stringify(data, null, 2);

    // Log to console
    console.log('=== CAMERA SETTINGS ===');
    console.log(output);
    console.log('=======================');

    // Log to debug textarea
    this.appendDebugLog('=== CAMERA ===\n' + output);
  }

  onSpeedChange(value: number): void {
    this.enemySpeed.set(value);
    // Update all existing enemies live (m/s)
    for (const enemy of this.gameState.enemies()) {
      enemy.movement.speedMps = value;
    }
  }

  onEnemyCountChange(value: number): void {
    this.enemyCount.set(value);
  }

  onEnemyTypeChange(typeId: EnemyTypeId): void {
    this.enemyType.set(typeId);
  }

  toggleSpawnMode(): void {
    this.spawnMode.update((mode) => (mode === 'each' ? 'random' : 'each'));
  }

  onSpawnDelayChange(value: number): void {
    this.spawnDelay.set(value);
  }

  toggleGathering(): void {
    this.useGathering.update((v) => !v);
  }

  killAllEnemies(): void {
    // Stop spawning new enemies
    this.waveAborted = true;
    this.gatheringPhase.set(false);

    // Kill all living enemies
    const enemies = this.gameState.enemies();
    for (const enemy of enemies) {
      if (enemy.alive) {
        this.gameState.killEnemy(enemy);
      }
    }

    // End the wave after a short delay (to let death animations play)
    setTimeout(() => {
      if (this.waveActive()) {
        this.gameState.endWave();
      }
    }, 500);
  }

  healHq(): void {
    // HQ auf 100 HP heilen und Feuer stoppen
    this.gameState.healBase();
    this.appendDebugLog('HQ geheilt (100 HP)');
  }

  clearDebugLog(): void {
    this.debugLog.set('');
  }

  appendDebugLog(message: string): void {
    this.debugLog.update((log) => {
      const lines = log.split('\n');
      // Max 50 Zeilen behalten
      if (lines.length > 50) {
        lines.shift();
      }
      return [...lines, message].join('\n');
    });
  }

  close(): void {
    this.dialogRef?.close();
  }

  get isDialog(): boolean {
    return !!this.dialogRef;
  }

  private onGameOver(): void {
    // Stop game loop
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private overlayHeightsUpdated = false;
  private heightUpdateIntervalId: ReturnType<typeof setInterval> | null = null;
  private heightStableResolve: (() => void) | null = null; // Promise resolver for height stabilization

  private heightUpdateAttempts = 0;
  private lastMissCount = Infinity;

  /**
   * Schedule periodic re-rendering of streets once tiles are loaded.
   * Uses correct ECEF raycast for terrain heights.
   * After location change, tiles need time to fully load at correct LOD.
   * Returns a Promise that resolves when heights are stable.
   */
  private scheduleOverlayHeightUpdate(): Promise<void> {
    const MAX_ATTEMPTS = 20; // Max 20 attempts (10 seconds total)
    const MIN_ATTEMPTS = 4; // Minimum 4 attempts (2 seconds) to ensure tiles are loaded

    // Reset counters for fresh location
    this.heightUpdateAttempts = 0;
    this.overlayHeightsUpdated = false;
    this.heightsLoading.set(true);
    this.heightProgress.set(0);
    this.loadingStatus.set('Synchronisiere mit Terrain...');

    return new Promise((resolve) => {
      this.heightStableResolve = resolve;

      this.heightUpdateIntervalId = setInterval(() => {
        if (!this.engine) {
          this.stopHeightUpdates();
          return;
        }

        this.heightUpdateAttempts++;
        this.heightProgress.set(this.heightUpdateAttempts);

        // Clear height cache before each attempt to get fresh values
        // This ensures we don't use stale heights from previous location
        this.engine.clearHeightCache();

        // Re-render streets with current terrain data
        const previousLineCount = this.streetLines.length;
        this.renderStreets();
        const newLineCount = this.streetLines.length;

        // Also update marker positions each attempt
        this.updateMarkerHeights();

        // Only stop after minimum attempts AND streets are stable
        if (this.heightUpdateAttempts >= MIN_ATTEMPTS && newLineCount > 0 && newLineCount >= previousLineCount) {
          console.log(`[Heights] Streets stable after ${this.heightUpdateAttempts} attempts: ${newLineCount} lines`);
          this.stopHeightUpdates();
        } else if (this.heightUpdateAttempts >= MAX_ATTEMPTS) {
          console.log(`[Heights] Max attempts reached, ${newLineCount} lines rendered`);
          this.stopHeightUpdates();
        } else {
          console.log(`[Heights] Attempt ${this.heightUpdateAttempts}/${MAX_ATTEMPTS}: ${newLineCount} lines`);
        }
      }, 500);
    });
  }

  private stopHeightUpdates(): void {
    if (this.heightUpdateIntervalId) {
      clearInterval(this.heightUpdateIntervalId);
      this.heightUpdateIntervalId = null;
      console.log('[Heights] Overlays stable - height updates complete');
    }
    this.overlayHeightsUpdated = true;
    this.heightsLoading.set(false);

    // Mark finalize step as done
    this.setStepDone('finalize', `${this.heightUpdateAttempts} Sync-Zyklen`);

    // Check if all loading is complete (will hide overlay if tiles & OSM also done)
    this.checkAllLoaded();

    // Resolve the promise to signal completion
    if (this.heightStableResolve) {
      this.heightStableResolve();
      this.heightStableResolve = null;
    }
  }

  /**
   * Update marker heights after tiles are loaded
   * Heights are relative to origin (HQ) terrain height
   */
  private updateMarkerHeights(): void {
    if (!this.engine) return;

    const HQ_MARKER_HEIGHT = 30; // HQ marker floats higher (animated diamond)
    const SPAWN_MARKER_HEIGHT = 30; // Spawn markers ~30m above ground

    // Get origin terrain height as reference
    const base = this.baseCoords();
    const originTerrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude);
    if (originTerrainY === null) {
      console.log('[Heights] Cannot update markers - origin terrain not available');
      return;
    }
    console.log(`[Heights] Origin terrain Y: ${originTerrainY.toFixed(1)}`);

    // Set the overlay base Y so overlayGroup is positioned at terrain surface
    this.engine.setOverlayBaseY(originTerrainY);

    // Update base marker - at origin, so relative height = 0
    if (this.baseMarker) {
      const local = this.engine.sync.geoToLocalSimple(base.latitude, base.longitude, 0);
      this.baseMarker.position.set(local.x, HQ_MARKER_HEIGHT, local.z);
      console.log(`[Heights] Base marker at relative Y=${HQ_MARKER_HEIGHT}`);
    }

    // Update spawn markers
    const spawns = this.spawnPoints();
    for (let i = 0; i < spawns.length && i < this.spawnMarkers.length; i++) {
      const spawn = spawns[i];
      const marker = this.spawnMarkers[i];
      const terrainY = this.engine.getTerrainHeightAtGeo(spawn.latitude, spawn.longitude);
      if (terrainY !== null) {
        const local = this.engine.sync.geoToLocalSimple(spawn.latitude, spawn.longitude, 0);
        const relativeY = (terrainY - originTerrainY) + SPAWN_MARKER_HEIGHT;
        marker.position.set(local.x, relativeY, local.z);
        console.log(`[Heights] Spawn ${spawn.name} at relative Y=${relativeY.toFixed(1)} (terrain diff: ${(terrainY - originTerrainY).toFixed(1)})`);
      }
    }
  }

  /**
   * Update all overlay heights using terrain raycasting
   * @returns Number of vertices that couldn't be resolved (misses)
   */
  private updateAllOverlayHeights(): number {
    if (!this.engine || !this.streetNetwork) return 0;

    const HEIGHT_STREETS = 2;
    const HEIGHT_ROUTES = 3;
    const HEIGHT_MARKERS = 4;

    // Get reference terrain height at origin (where camera points)
    const refY = this.engine.getOverlayTerrainHeight(0, 0) ?? 240;

    let hits = 0, misses = 0;

    // Update street lines
    for (const line of this.streetLines) {
      const positions = line.geometry.getAttribute('position');
      if (!positions) continue;

      const array = positions.array as Float32Array;
      let needsUpdate = false;

      for (let i = 0; i < positions.count; i++) {
        const x = array[i * 3];
        const currentY = array[i * 3 + 1];
        const z = array[i * 3 + 2];

        // Only try raycast if vertex is at reference height (not yet resolved)
        const isAtRefHeight = Math.abs(currentY - (refY + HEIGHT_STREETS)) < 1;
        if (isAtRefHeight || this.heightUpdateAttempts <= 1) {
          const terrainY = this.engine.getOverlayTerrainHeight(x, z);
          if (terrainY !== null) {
            array[i * 3 + 1] = terrainY + HEIGHT_STREETS;
            hits++;
            needsUpdate = true;
          } else {
            array[i * 3 + 1] = refY + HEIGHT_STREETS;
            misses++;
          }
        } else {
          hits++; // Already resolved
        }
      }
      if (needsUpdate) {
        positions.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }
    }

    // Update route lines
    for (const line of this.routeLines) {
      const positions = line.geometry.getAttribute('position');
      if (!positions) continue;

      const array = positions.array as Float32Array;
      let needsUpdate = false;

      for (let i = 0; i < positions.count; i++) {
        const x = array[i * 3];
        const currentY = array[i * 3 + 1];
        const z = array[i * 3 + 2];

        const isAtRefHeight = Math.abs(currentY - (refY + HEIGHT_ROUTES)) < 1;
        if (isAtRefHeight || this.heightUpdateAttempts <= 1) {
          const terrainY = this.engine.getOverlayTerrainHeight(x, z);
          if (terrainY !== null) {
            array[i * 3 + 1] = terrainY + HEIGHT_ROUTES;
            needsUpdate = true;
          } else {
            array[i * 3 + 1] = refY + HEIGHT_ROUTES;
            misses++;
          }
        }
      }
      if (needsUpdate) {
        positions.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }
    }

    // Update base marker (at origin, should always hit)
    if (this.baseMarker) {
      const terrainY = this.engine.getOverlayTerrainHeight(0, 0);
      this.baseMarker.position.y = (terrainY ?? refY) + HEIGHT_MARKERS;
    }

    // Update spawn markers
    for (const marker of this.spawnMarkers) {
      const terrainY = this.engine.getOverlayTerrainHeight(marker.position.x, marker.position.z);
      marker.position.y = (terrainY ?? refY) + HEIGHT_MARKERS;
    }

    console.log(`[Heights] Attempt ${this.heightUpdateAttempts}: ${hits} hits, ${misses} misses`);
    return misses;
  }

  restartGame(): void {
    this.gameState.reset();
  }

  /**
   * Find the closest point on a line segment to a target point
   */
  private closestPointOnSegment(
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
    target: { lat: number; lon: number }
  ): { lat: number; lon: number } {
    const dx = b.lon - a.lon;
    const dy = b.lat - a.lat;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Segment is a point
      return { lat: a.lat, lon: a.lon };
    }

    // Project target onto the line, clamped to segment
    const t = Math.max(0, Math.min(1, ((target.lon - a.lon) * dx + (target.lat - a.lat) * dy) / lengthSquared));

    return {
      lat: a.lat + t * dy,
      lon: a.lon + t * dx,
    };
  }

  /**
   * Extend the path along streets to find the optimal 90° turn-off point to HQ.
   * The A* path ends at the nearest node to HQ, but continuing along the street
   * might give us a better (perpendicular) approach to HQ.
   */
  private extendPathToOptimalTurnoff(
    geoPath: { lat: number; lon: number }[],
    base: { latitude: number; longitude: number }
  ): { lat: number; lon: number }[] {
    if (!this.streetNetwork || geoPath.length < 2) return geoPath;

    const lastPoint = geoPath[geoPath.length - 1];
    const secondLastPoint = geoPath[geoPath.length - 2];

    // Find streets that contain a node near the last point
    const TOLERANCE = 0.00001; // ~1m tolerance for matching
    const matchingStreets: { street: Street; nodeIndex: number }[] = [];

    for (const street of this.streetNetwork.streets) {
      for (let i = 0; i < street.nodes.length; i++) {
        const node = street.nodes[i];
        if (
          Math.abs(node.lat - lastPoint.lat) < TOLERANCE &&
          Math.abs(node.lon - lastPoint.lon) < TOLERANCE
        ) {
          matchingStreets.push({ street, nodeIndex: i });
        }
      }
    }

    if (matchingStreets.length === 0) return geoPath;

    // Determine the direction we came from (to continue in the same direction)
    const dirLat = lastPoint.lat - secondLastPoint.lat;
    const dirLon = lastPoint.lon - secondLastPoint.lon;

    // Find the best extension: continue along the street in a direction
    // that could bring us closer to HQ
    let bestExtension: { lat: number; lon: number }[] = [];
    let bestClosestDist = this.osmService.haversineDistance(
      lastPoint.lat,
      lastPoint.lon,
      base.latitude,
      base.longitude
    );

    for (const { street, nodeIndex } of matchingStreets) {
      // Try extending in both directions along this street
      for (const direction of [-1, 1]) {
        const extension: { lat: number; lon: number }[] = [];
        let idx = nodeIndex + direction;
        let foundBetterPoint = false;

        // Extend up to 20 nodes in this direction
        while (idx >= 0 && idx < street.nodes.length && extension.length < 20) {
          const node = street.nodes[idx];

          // Check if this node or segment gets us closer to HQ
          const distToHQ = this.osmService.haversineDistance(
            node.lat,
            node.lon,
            base.latitude,
            base.longitude
          );

          // Also check the segment between last extension point and this node
          const prevPoint = extension.length > 0 ? extension[extension.length - 1] : lastPoint;
          const closestOnSeg = this.closestPointOnSegment(prevPoint, { lat: node.lat, lon: node.lon }, {
            lat: base.latitude,
            lon: base.longitude,
          });
          const segDistToHQ = this.osmService.haversineDistance(
            closestOnSeg.lat,
            closestOnSeg.lon,
            base.latitude,
            base.longitude
          );

          if (segDistToHQ < bestClosestDist || distToHQ < bestClosestDist) {
            foundBetterPoint = true;
            extension.push({ lat: node.lat, lon: node.lon });
            idx += direction;
          } else {
            // Stop if we're moving away from HQ
            break;
          }
        }

        if (foundBetterPoint && extension.length > 0) {
          // Calculate the closest distance achievable with this extension
          let minDist = bestClosestDist;
          for (let i = 0; i < extension.length; i++) {
            const prev = i === 0 ? lastPoint : extension[i - 1];
            const curr = extension[i];
            const closest = this.closestPointOnSegment(prev, curr, {
              lat: base.latitude,
              lon: base.longitude,
            });
            const dist = this.osmService.haversineDistance(
              closest.lat,
              closest.lon,
              base.latitude,
              base.longitude
            );
            if (dist < minDist) {
              minDist = dist;
            }
          }

          if (minDist < bestClosestDist) {
            bestClosestDist = minDist;
            bestExtension = extension;
          }
        }
      }
    }

    // Return extended path
    return [...geoPath, ...bestExtension];
  }

  // ==================== Location Settings Methods ====================

  /**
   * Initialize editable locations from current values or localStorage
   */
  private initializeEditableLocations(): void {
    // Try to load from localStorage
    const savedLocations = this.loadLocationsFromStorage();

    if (savedLocations && savedLocations.hq) {
      console.log('[Init] Loaded saved location from localStorage:', savedLocations.hq.name);
      console.log('[Init] HQ coords:', savedLocations.hq.lat, savedLocations.hq.lon);

      this.editableHqLocation.set(savedLocations.hq);
      this.editableSpawnLocations.set(savedLocations.spawns);

      // Apply saved locations
      this.baseCoords.set({
        latitude: savedLocations.hq.lat,
        longitude: savedLocations.hq.lon,
      });
      this.centerCoords.set({
        latitude: savedLocations.hq.lat,
        longitude: savedLocations.hq.lon,
        height: 400,
      });
    } else {
      console.log('[Init] Using default location: Erlenbach');
      // Initialize from defaults
      const base = this.baseCoords();
      this.editableHqLocation.set({
        lat: base.latitude,
        lon: base.longitude,
        name: 'Erlenbach (Default)',
      });

      // Convert spawn points to editable format
      const editableSpawns: SpawnLocationConfig[] = DEFAULT_SPAWN_POINTS.map((sp) => ({
        id: sp.id,
        lat: sp.latitude,
        lon: sp.longitude,
        name: sp.name,
      }));
      this.editableSpawnLocations.set(editableSpawns);
    }
  }

  /**
   * Apply new location - full reset like initial load
   * Shows loading overlay and waits for tiles + streets to load
   * CRITICAL: Follow correct reset sequence to avoid ghost entities
   */
  async onApplyNewLocation(data: { hq: LocationConfig; spawn: LocationConfig }): Promise<void> {
    if (!this.engine) {
      console.error('[Location] No engine available');
      return;
    }

    // STEP 1: Show loading overlay and reset steps
    this.loading.set(true);
    this.tilesLoading.set(true);
    this.osmLoading.set(true);
    this.heightsLoading.set(true);
    this.isApplyingLocation.set(true);
    this.heightProgress.set(0);
    this.resetLoadingSteps();
    console.log(`[Location] Starting location change to: ${data.hq.name?.split(',')[0]}...`);

    try {
      // STEP 2: Initialize (stop height updates, reset game)
      await this.setStepActive('init');
      this.stopHeightUpdates();
      this.gameState.reset();
      this.appendDebugLog('Spielstand zurückgesetzt');
      this.clearMapEntities();
      this.cachedPaths.clear();
      this.spawnPoints.set([]);

      // Update engine origin
      console.log(`[Location] Setting new origin: ${data.hq.lat.toFixed(6)}, ${data.hq.lon.toFixed(6)}`);
      this.engine.setOrigin(data.hq.lat, data.hq.lon);
      this.engine.clearDebugHelpers();

      // Update coordinates
      this.baseCoords.set({ latitude: data.hq.lat, longitude: data.hq.lon });
      this.centerCoords.set({ latitude: data.hq.lat, longitude: data.hq.lon, height: 400 });

      // Update editable state
      this.editableHqLocation.set(data.hq);
      const spawnConfig: SpawnLocationConfig = { id: 'spawn-1', ...data.spawn };
      this.editableSpawnLocations.set([spawnConfig]);
      await this.setStepDone('init');

      // Set up tiles loaded callback (runs in background)
      const tilesLoadedPromise = new Promise<void>((resolve) => {
        this.engine!.setOnFirstTilesLoadedCallback(() => {
          this.tilesLoading.set(false);
          console.log('[Location] First tiles loaded at new location');
          this.checkAllLoaded();
          resolve();
        });
      });

      // STEP 3: Load streets in parallel with tiles
      await this.setStepActive('streets');
      const streetsPromise = this.osmService.loadStreets(data.hq.lat, data.hq.lon, 2000);

      // Wait for streets to load
      this.streetNetwork = await streetsPromise;
      this.streetCount.set(this.streetNetwork.streets.length);
      this.osmLoading.set(false);
      const streetCnt = this.streetCount();
      await this.setStepDone('streets', streetCnt > 0 ? `${streetCnt} Straßen` : undefined);
      console.log(`[Location] Streets loaded: ${streetCnt}`);
      this.checkAllLoaded();

      // Wait for tiles to load (with timeout fallback)
      await Promise.race([
        tilesLoadedPromise,
        new Promise<void>((resolve) => setTimeout(() => {
          console.log('[Location] Tiles loading timeout - continuing anyway');
          this.tilesLoading.set(false);
          resolve();
        }, 10000)) // 10 second timeout
      ]);

      // Render streets (now that terrain is available)
      this.renderStreets();

      // STEP 4: Place HQ marker
      await this.setStepActive('hq');
      this.addBaseMarker();
      await this.setStepDone('hq');

      // STEP 5: Place spawn point
      await this.setStepActive('spawn');
      this.addSpawnPoint('spawn-1', data.spawn.name?.split(',')[0] || 'Spawn', data.spawn.lat, data.spawn.lon, 0xef4444);
      await this.setStepDone('spawn', '1 Punkt');

      // STEP 6: Calculate route
      await this.setStepActive('route');
      const base = this.baseCoords();
      const waveSpawnPoints: WaveSpawnPoint[] = this.spawnPoints().map((sp) => ({
        id: sp.id,
        name: sp.name,
        latitude: sp.latitude,
        longitude: sp.longitude,
      }));

      this.gameState.initialize(
        this.engine,
        this.streetNetwork!,
        { lat: base.latitude, lon: base.longitude },
        waveSpawnPoints,
        this.cachedPaths,
        (msg: string) => this.appendDebugLog(msg),
        () => this.onGameOver()
      );

      // Get route details for display
      const routeDetail = this.getRouteDetail();
      await this.setStepDone('route', routeDetail);

      // STEP 7: Finalize 3D view (waits for tiles + height sync)
      await this.setStepActive('finalize');
      this.scheduleOverlayHeightUpdate();

      // STEP 18: Save to localStorage
      this.saveLocationsToStorage();

      // STEP 19: Fly to new location
      this.flyToCenter();

      // STEP 20: Capture new initial camera position (after tiles stabilize)
      setTimeout(() => {
        if (this.engine) {
          const cam = this.engine.getCamera();
          this.initialCameraPosition = {
            x: cam.position.x,
            y: cam.position.y,
            z: cam.position.z,
          };
          console.log('[Location] New camera position captured:', this.initialCameraPosition);
        }
      }, 2000);

      this.appendDebugLog(`Geladen: ${this.streetCount()} Strassen`);
      console.log('[Location] Location change complete - waiting for heights to stabilize...');

      // Loading overlay will be hidden by checkAllLoaded() when heights stabilize
      this.isApplyingLocation.set(false);

    } catch (err) {
      console.error('[Location] Failed to apply location:', err);
      this.appendDebugLog(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
      this.error.set(err instanceof Error ? err.message : 'Fehler beim Standortwechsel');

      // On error, force hide overlay and reset states
      this.loading.set(false);
      this.tilesLoading.set(false);
      this.osmLoading.set(false);
      this.heightsLoading.set(false);
      this.isApplyingLocation.set(false);
    }
  }

  /**
   * Open location dialog to change HQ and spawn point
   */
  openLocationDialog(): void {
    const hq = this.editableHqLocation();
    const spawn = this.editableSpawnLocations()[0];

    const dialogData: LocationDialogData = {
      currentLocation: hq
        ? {
            lat: hq.lat,
            lon: hq.lon,
            name: this.currentLocationName(),
            displayName: hq.name || '',
          }
        : null,
      currentSpawn: spawn
        ? {
            id: spawn.id,
            lat: spawn.lat,
            lon: spawn.lon,
            name: spawn.name,
          }
        : null,
      isGameInProgress: this.gameState.phase() !== 'setup' || this.gameState.waveNumber() > 0,
    };

    const dialogRef = this.dialog.open(LocationDialogComponent, {
      data: dialogData,
      panelClass: 'td-dialog-panel',
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe(async (result: LocationDialogResult | null) => {
      if (!result?.confirmed) return;

      let spawnLat = result.spawn.lat;
      let spawnLon = result.spawn.lon;
      let spawnName = result.spawn.name;

      // Generate random spawn if requested
      if (result.spawn.isRandom && this.streetNetwork) {
        // First load streets for the new location to find spawn
        const newNetwork = await this.osmService.loadStreets(result.hq.lat, result.hq.lon, 2000);
        const randomSpawn = this.osmService.findRandomStreetPoint(newNetwork, result.hq.lat, result.hq.lon, 500, 1000);

        if (randomSpawn) {
          spawnLat = randomSpawn.lat;
          spawnLon = randomSpawn.lon;
          spawnName = randomSpawn.streetName || 'Zufälliger Spawn';
          this.appendDebugLog(`Zufälliger Spawn: ${Math.round(randomSpawn.distance)}m entfernt`);
        } else {
          this.appendDebugLog('Kein gültiger Spawn gefunden, verwende Fallback');
          // Fallback: use a point 700m north
          spawnLat = result.hq.lat + 0.0063; // ~700m north
          spawnLon = result.hq.lon;
          spawnName = 'Fallback Spawn';
        }
      }

      // Apply the new location
      await this.onApplyNewLocation({
        hq: {
          lat: result.hq.lat,
          lon: result.hq.lon,
          name: result.hq.displayName,
          address: result.hq.address,
        },
        spawn: {
          lat: spawnLat,
          lon: spawnLon,
          name: spawnName,
        },
      });
    });
  }

  onResetLocations(): void {
    this.onApplyNewLocation({
      hq: { lat: DEFAULT_BASE_COORDS.latitude, lon: DEFAULT_BASE_COORDS.longitude, name: 'Erlenbach (Default)' },
      spawn: { lat: DEFAULT_SPAWN_POINTS[0].latitude, lon: DEFAULT_SPAWN_POINTS[0].longitude, name: DEFAULT_SPAWN_POINTS[0].name },
    });
    localStorage.removeItem(LOCATION_STORAGE_KEY);
  }

  private clearMapEntities(): void {
    if (!this.engine) return;

    const overlayGroup = this.engine.getOverlayGroup();

    // Clear spawn markers (Groups)
    for (const marker of this.spawnMarkers) {
      overlayGroup.remove(marker);
      this.disposeDiamondMarker(marker);
    }
    this.spawnMarkers = [];

    // Clear route lines
    for (const line of this.routeLines) {
      overlayGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.routeLines = [];

    // Clear street lines
    for (const line of this.streetLines) {
      overlayGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.streetLines = [];

    // Clear base marker group
    if (this.baseMarker) {
      overlayGroup.remove(this.baseMarker);
      this.baseMarker.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          (obj as THREE.Mesh).geometry.dispose();
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
      this.baseMarker = null;
    }

    // Clear spawn points signal
    this.spawnPoints.set([]);

    // Clear cached paths
    this.cachedPaths.clear();
  }

  private flyToCenter(): void {
    if (!this.engine) return;

    // Use resetCamera for consistent positioning
    this.resetCamera();
  }

  private saveLocationsToStorage(): void {
    const data = {
      hq: this.editableHqLocation(),
      spawns: this.editableSpawnLocations(),
    };
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(data));
  }

  private loadLocationsFromStorage(): { hq: LocationConfig | null; spawns: SpawnLocationConfig[] } | null {
    try {
      const data = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
