import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  signal,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfigService } from '../../../../core/services/config.service';
import { OsmStreetService, Street, StreetNetwork } from './services/osm-street.service';
import { EntityPoolService } from './services/entity-pool.service';
import { GeoPosition } from './models/game.types';
import { EnemyTypeId, getAllEnemyTypes } from './models/enemy-types';
import { TowerRenderer } from './renderers/tower.renderer';
import { ApiService } from '../../../../core/services/api.service';
import { DebugPanelComponent, LocationConfig, SpawnLocationConfig } from './components/debug-panel.component';
// New OO Game Engine imports
import { GameStateManager } from './managers/game-state.manager';
import { EnemyManager } from './managers/enemy.manager';
import { TowerManager } from './managers/tower.manager';
import { ProjectileManager } from './managers/projectile.manager';
import { WaveManager, SpawnPoint as WaveSpawnPoint } from './managers/wave.manager';
import { AudioManager } from './managers/audio.manager';
import { RenderManager } from './managers/render.manager';
// Three.js Engine (new 3DTilesRendererJS-based)
import { ThreeTilesEngine } from './three-engine';
import * as THREE from 'three';

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
  {
    id: 'spawn-south',
    name: 'Sued',
    latitude: 49.17000237788718,
    longitude: 9.266037019764674,
  },
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
    AudioManager,
    RenderManager,
    EntityPoolService,
  ],
  template: `
    <div class="tower-defense-container" [class.fullscreen]="!isDialog">
      <div class="game-header">
        <div class="header-glow"></div>
        <mat-icon class="title-icon">cell_tower</mat-icon>
        <h2>TOWER DEFENSE</h2>
        <span class="subtitle">Erlenbach</span>
        @if (isDialog) {
          <button mat-icon-button class="close-btn" (click)="close()">
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>

      <div class="game-content">
        @if (loading()) {
          <div class="loading-overlay">
            <mat-spinner diameter="48"></mat-spinner>
            <p>{{ loadingMessage() }}</p>
          </div>
        }

        @if (error()) {
          <div class="error-overlay">
            <mat-icon class="error-icon">error_outline</mat-icon>
            <h3>Fehler</h3>
            <p>{{ error() }}</p>
            <div class="token-instructions">
              <p>1. Erstelle einen kostenlosen Account bei <a href="https://cesium.com/ion/" target="_blank">cesium.com/ion</a></p>
              <p>2. Kopiere deinen Access Token</p>
              <p>3. Trage ihn in <code>appsettings.json</code> ein:</p>
              <pre>"CesiumAccessToken": "dein-token-hier"</pre>
            </div>
            <button mat-flat-button color="primary" (click)="close()">Schliessen</button>
          </div>
        }

        <canvas #gameCanvas class="game-canvas" [class.hidden]="loading() || error()"></canvas>

        @if (!loading() && !error()) {
          <!-- Status Panel (top left) -->
          <div class="status-panel">
            <div class="status-item hp">
              <mat-icon>favorite</mat-icon>
              <span>{{ gameState.baseHealth() }}</span>
            </div>
            <div class="status-item wave">
              <mat-icon>waves</mat-icon>
              <span>{{ gameState.waveNumber() }}</span>
            </div>
            <div class="status-item towers">
              <mat-icon>cell_tower</mat-icon>
              <span>{{ gameState.towerCount() }}</span>
            </div>
            @if (waveActive()) {
              <div class="status-item enemies">
                <mat-icon>pest_control</mat-icon>
                <span>{{ gameState.enemiesAlive() }}</span>
              </div>
            }
          </div>

          <!-- Game Controls (bottom center) -->
          <div class="game-controls">
            <div class="controls-box">
              <button class="control-btn tower-btn" [class.active]="buildMode()" (click)="toggleBuildMode()">
                <mat-icon>{{ buildMode() ? 'close' : 'add_location' }}</mat-icon>
                <span>{{ buildMode() ? 'Abbrechen' : 'Tower' }}</span>
              </button>
              <div class="control-divider"></div>
              <button class="control-btn wave-btn" (click)="startWave()" [disabled]="waveActive() || buildMode() || isGameOver()">
                <mat-icon>{{ waveActive() ? 'hourglass_empty' : 'play_arrow' }}</mat-icon>
                <span>{{ waveActive() ? 'Welle...' : 'Start' }}</span>
              </button>
            </div>
            @if (buildMode()) {
              <div class="build-hint">Klicke neben Strasse</div>
            }
          </div>

          <!-- Camera Controls (bottom right) -->
          <div class="camera-controls">
            <button mat-mini-fab (click)="resetCamera()" matTooltip="Kamera">
              <mat-icon>my_location</mat-icon>
            </button>
            <button mat-mini-fab (click)="toggleTilt()" matTooltip="Neigung">
              <mat-icon>3d_rotation</mat-icon>
            </button>
            <button mat-mini-fab (click)="toggleDebug()" matTooltip="Debug" [class.active]="debugMode()">
              <mat-icon>bug_report</mat-icon>
            </button>
          </div>

          <!-- Debug Panel -->
          @if (debugMode()) {
            <app-td-debug-panel
              [streetCount]="streetCount()"
              [enemyCount]="enemyCount()"
              [enemySpeed]="enemySpeed()"
              [enemyType]="enemyType()"
              [enemyTypes]="enemyTypes"
              [spawnMode]="spawnMode()"
              [streetsVisible]="streetsVisible()"
              [routesVisible]="routesVisible()"
              [heightDebugVisible]="heightDebugVisible()"
              [waveActive]="waveActive()"
              [baseHealth]="gameState.baseHealth()"
              [debugLog]="debugLog()"
              [hqLocation]="editableHqLocation()"
              [spawnLocations]="editableSpawnLocations()"
              [isApplying]="isApplyingLocation()"
              (enemyCountChange)="onEnemyCountChange($event)"
              (enemySpeedChange)="onSpeedChange($event)"
              (enemyTypeChange)="onEnemyTypeChange($event)"
              (toggleSpawnMode)="toggleSpawnMode()"
              (toggleStreets)="toggleStreets()"
              (toggleRoutes)="toggleRoutes()"
              (toggleHeightDebug)="toggleHeightDebug()"
              (killAll)="killAllEnemies()"
              (healHq)="healHq()"
              (clearLog)="clearDebugLog()"
              (logCamera)="logCameraPosition()"
              (applyNewLocation)="onApplyNewLocation($event)"
              (resetLocations)="onResetLocations()"
            />
          }

          <!-- Controls Hint (bottom left, minimal) -->
          <div class="controls-hint">
            <span>LMB: Move | Ctrl: Rotate | Scroll: Zoom</span>
          </div>

          <!-- Gathering Phase Info -->
          @if (gatheringPhase()) {
            <div class="gathering-overlay">
              <mat-icon>groups</mat-icon>
              <span>Gegner sammeln sich...</span>
            </div>
          }

          <!-- Game Over Overlay -->
          @if (gameState.showGameOverScreen()) {
            <div class="gameover-overlay">
              <div class="gameover-content">
                <h1>GAME OVER</h1>
                <p>Das HQ wurde zerstört!</p>
                <button mat-flat-button color="primary" class="restart-btn" (click)="restartGame()">
                  <mat-icon>replay</mat-icon>
                  NEUSTART
                </button>
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .tower-defense-container {
      display: flex;
      flex-direction: column;
      width: 90vw;
      max-width: 1200px;
      height: 80vh;
      max-height: 800px;
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
    }

    .tower-defense-container.fullscreen {
      width: 100vw;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
    }

    .game-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.3) 0%, rgba(34, 197, 94, 0.2) 100%);
      border-bottom: 2px solid rgba(147, 51, 234, 0.5);
      position: relative;
      overflow: hidden;
    }

    .header-glow {
      display: none;
    }

    .title-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #22c55e;
      position: relative;
      z-index: 1;
    }

    .game-header h2 {
      margin: 0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 3px;
      background: linear-gradient(135deg, #fff 0%, #22c55e 50%, #9333ea 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      position: relative;
      z-index: 1;
    }

    .subtitle {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      position: relative;
      z-index: 1;
    }

    .close-btn {
      margin-left: auto;
      color: rgba(255, 255, 255, 0.7);
      position: relative;
      z-index: 1;
    }

    .close-btn:hover {
      color: #ef4444;
    }

    .game-content {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .game-canvas {
      width: 100%;
      height: 100%;
    }

    .game-canvas.hidden {
      visibility: hidden;
    }

    .loading-overlay,
    .error-overlay {
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
      background: rgba(10, 10, 10, 0.95);
      z-index: 10;
    }

    .loading-overlay p {
      font-family: 'JetBrains Mono', monospace;
      color: rgba(255, 255, 255, 0.7);
    }

    .error-overlay {
      padding: 40px;
      text-align: center;
    }

    .error-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #f97316;
    }

    .error-overlay h3 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      color: #f97316;
      margin: 0;
    }

    .error-overlay p {
      color: rgba(255, 255, 255, 0.7);
      max-width: 400px;
    }

    .token-instructions {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px;
      padding: 20px;
      text-align: left;
      margin: 16px 0;
    }

    .token-instructions p {
      margin: 8px 0;
      font-size: 14px;
    }

    .token-instructions a {
      color: #9333ea;
    }

    .token-instructions code {
      background: rgba(147, 51, 234, 0.2);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }

    .token-instructions pre {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(147, 51, 234, 0.3);
      padding: 12px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #22c55e;
      overflow-x: auto;
    }

    .status-panel {
      position: absolute;
      top: 12px;
      left: 12px;
      display: flex;
      gap: 8px;
      z-index: 5;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.8);
      border-radius: 6px;
    }

    .status-item mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .status-item span {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 600;
    }

    .status-item.hp mat-icon { color: #ef4444; }
    .status-item.hp span { color: #ef4444; }
    .status-item.wave mat-icon { color: #3b82f6; }
    .status-item.wave span { color: #3b82f6; }
    .status-item.towers mat-icon { color: #22c55e; }
    .status-item.towers span { color: #22c55e; }
    .status-item.enemies mat-icon { color: #f97316; }
    .status-item.enemies span { color: #f97316; }

    .game-controls {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 5;
    }

    .controls-box {
      display: flex;
      align-items: center;
      gap: 0;
      background: rgba(10, 10, 10, 0.95);
      border: 2px solid rgba(147, 51, 234, 0.5);
      border-radius: 12px;
      padding: 4px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 30px rgba(147, 51, 234, 0.2);
    }

    .control-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .control-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .tower-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
      color: white;
    }

    .tower-btn:hover {
      background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
      transform: scale(1.02);
    }

    .tower-btn.active {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
    }

    .control-divider {
      width: 2px;
      height: 32px;
      background: rgba(147, 51, 234, 0.4);
      margin: 0 4px;
    }

    .wave-btn {
      background: linear-gradient(135deg, #22c55e 0%, #10b981 100%);
      color: white;
    }

    .wave-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #16a34a 0%, #059669 100%);
      transform: scale(1.02);
    }

    .wave-btn:disabled {
      background: rgba(100, 100, 100, 0.4);
      color: rgba(255, 255, 255, 0.4);
      cursor: not-allowed;
      transform: none;
    }

    .build-hint {
      padding: 6px 12px;
      background: rgba(147, 51, 234, 0.9);
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: white;
      animation: pulse-hint 1.5s ease-in-out infinite;
    }

    @keyframes pulse-hint {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .camera-controls {
      position: absolute;
      bottom: 12px;
      right: 12px;
      display: flex;
      gap: 6px;
      z-index: 5;
    }

    .camera-controls button {
      width: 36px !important;
      height: 36px !important;
      background: rgba(0, 0, 0, 0.7) !important;
      color: rgba(255, 255, 255, 0.8) !important;
    }

    .camera-controls button:hover {
      background: rgba(147, 51, 234, 0.8) !important;
    }

    .camera-controls button.active {
      background: rgba(34, 197, 94, 0.8) !important;
    }

    .camera-controls button mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .controls-hint {
      position: absolute;
      bottom: 12px;
      left: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.4);
      z-index: 5;
    }

    /* Attribution for Google 3D Tiles */
    .attribution {
      position: absolute;
      bottom: 4px;
      right: 4px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.5);
      z-index: 5;
    }

    .gathering-overlay {
      position: absolute;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 24px;
      background: rgba(0, 0, 0, 0.85);
      border: 2px solid #f97316;
      border-radius: 12px;
      z-index: 10;
      animation: pulse-gathering 1s ease-in-out infinite;
    }

    .gathering-overlay mat-icon {
      color: #f97316;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .gathering-overlay span {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      color: #f97316;
      letter-spacing: 1px;
    }

    @keyframes pulse-gathering {
      0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
      50% { opacity: 0.8; transform: translateX(-50%) scale(1.02); }
    }

    .gameover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      z-index: 20;
      animation: fade-in 0.5s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .gameover-content {
      text-align: center;
      padding: 40px 60px;
      background: rgba(10, 10, 10, 0.95);
      border: 3px solid #ef4444;
      border-radius: 16px;
      box-shadow: 0 0 60px rgba(239, 68, 68, 0.5);
    }

    .gameover-content h1 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 64px;
      font-weight: 900;
      color: #ef4444;
      margin: 0 0 16px 0;
      letter-spacing: 8px;
      text-shadow: 0 0 30px rgba(239, 68, 68, 0.8);
      animation: shake 0.5s ease-in-out;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-8px); }
      40% { transform: translateX(8px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }

    .gameover-content p {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 32px 0;
    }

    .restart-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 32px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 2px;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
      color: white !important;
      border-radius: 8px;
    }

    .restart-btn:hover {
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important;
      transform: scale(1.05);
    }

    .restart-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
  `,
})
export class TowerDefenseComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') gameCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly dialogRef = inject(MatDialogRef<TowerDefenseComponent>, { optional: true });
  private readonly osmService = inject(OsmStreetService);
  private readonly api = inject(ApiService);
  private readonly configService = inject(ConfigService);
  readonly gameState = inject(GameStateManager);
  private readonly entityPool = inject(EntityPoolService);

  // Sound
  private readonly PROJECTILE_SOUND_HASH = '3ae29d3b4c96b913c63964373e218f08';
  private projectileSoundUrl = '';

  private engine: ThreeTilesEngine | null = null;
  private streetNetwork: StreetNetwork | null = null;

  // Three.js objects for markers and routes
  private streetLines: THREE.Line[] = [];
  private routeLines: THREE.Line[] = [];
  private spawnMarkers: THREE.Mesh[] = [];
  private baseMarker: THREE.Group | null = null;
  private heightDebugGroup: THREE.Group | null = null;

  readonly loading = signal(true);
  readonly loadingMessage = signal('Lade 3D-Karte...');
  readonly error = signal<string | null>(null);
  readonly streetsVisible = signal(true);
  readonly routesVisible = signal(true);
  readonly debugMode = signal(false);
  readonly heightDebugVisible = signal(false);
  readonly enemySpeed = signal(5); // Meter pro Sekunde
  readonly streetCount = signal(0);
  // Debug: Spawn-Einstellungen
  readonly enemyCount = signal(2);
  readonly enemyType = signal<EnemyTypeId>('zombie');
  readonly enemyTypes = getAllEnemyTypes(); // Für Debug-Panel Dropdown
  readonly spawnMode = signal<'each' | 'random'>('each'); // each = einer pro Spawn, random = zufällig
  readonly debugLog = signal('');
  readonly spawnPoints = signal<SpawnPoint[]>([]);
  readonly baseCoords = signal(DEFAULT_BASE_COORDS);
  readonly centerCoords = signal(DEFAULT_CENTER_COORDS);
  readonly buildMode = signal(false);

  // Editable location settings (for debug panel)
  readonly editableHqLocation = signal<LocationConfig | null>(null);
  readonly editableSpawnLocations = signal<SpawnLocationConfig[]>([]);
  readonly isApplyingLocation = signal(false);

  readonly waveActive = computed(() => this.gameState.phase() === 'wave');
  readonly isGameOver = computed(() => this.gameState.phase() === 'gameover');
  readonly gatheringPhase = signal(false);
  readonly gatheringCountdown = signal(0);

  private animationFrameId: number | null = null;
  private cachedPaths = new Map<string, GeoPosition[]>();
  private buildPreviewMesh: THREE.Mesh | null = null;
  private lastPreviewValidation: boolean | null = null;
  private previewThrottleId: number | null = null;

  private readonly MIN_DISTANCE_TO_STREET = 10;
  private readonly MAX_DISTANCE_TO_STREET = 50;
  private readonly MIN_DISTANCE_TO_BASE = 30;
  private readonly MIN_DISTANCE_TO_SPAWN = 30;
  private readonly TOWER_RANGE = 60;

  private tiltAngle = 45;

  ngOnInit(): void {
    this.initializeEditableLocations();
  }

  ngAfterViewInit(): void {
    this.initEngine();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.entityPool.destroy();
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
  }

  /**
   * Initialize Three.js rendering engine with 3DTilesRendererJS
   */
  private async initEngine(): Promise<void> {
    try {
      // Get token from ConfigService (loaded from backend /api/config)
      const token = this.configService.cesiumAccessToken();
      if (!token || token === 'YOUR_CESIUM_ION_ACCESS_TOKEN') {
        this.error.set('Bitte konfiguriere deinen Cesium Ion Access Token in appsettings.json.');
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

      // Create Three.js engine with 3DTilesRendererJS
      this.engine = new ThreeTilesEngine(
        canvas,
        token,
        base.latitude,
        base.longitude,
        0
      );

      // Initialize 3D tiles (async)
      await this.engine.initialize();
      this.engine.resize(rect.width, rect.height);

      // Register callback for automatic terrain height refresh when tiles load
      this.engine.setOnTilesLoadCallback(() => {
        this.onTilesLoaded();
      });

      // Register callback for per-frame animations (HQ marker rotation)
      this.engine.setOnUpdateCallback((deltaTime) => {
        this.onEngineUpdate(deltaTime);
      });

      // Preload 3D models in background
      this.engine.preloadModels().then(() => {
        console.log('[TD] All Three.js models preloaded');
      });

      // Set up sound URL
      this.projectileSoundUrl = this.api.getFullUrl(`/sound/${this.PROJECTILE_SOUND_HASH}/file`);

      // Setup click handler and build preview
      this.setupClickHandler();
      this.createBuildPreview();

      this.loadingMessage.set('Lade Strassennetz von OpenStreetMap...');
      await this.loadStreets();

      this.addBaseMarker();
      this.addPredefinedSpawns();

      // Initialize game state AFTER streets and spawns are loaded
      const waveSpawnPoints: WaveSpawnPoint[] = this.spawnPoints().map((sp) => ({
        id: sp.id,
        name: sp.name,
        latitude: sp.latitude,
        longitude: sp.longitude,
      }));

      // Initialize game state with new engine
      this.gameState.initializeWithTilesEngine(
        this.engine,
        this.streetNetwork!,
        { lat: base.latitude, lon: base.longitude },
        waveSpawnPoints,
        this.cachedPaths,
        () => this.playProjectileSound(),
        (msg) => this.appendDebugLog(msg),
        () => this.onGameOver()
      );

      // Start render loop
      this.engine.startRenderLoop();

      this.resetCamera();

      // Schedule overlay height updates once tiles are loaded
      this.scheduleOverlayHeightUpdate();

      this.loading.set(false);
    } catch (err) {
      console.error('Engine initialization error:', err);
      this.error.set(err instanceof Error ? err.message : 'Fehler beim Laden der 3D-Karte');
      this.loading.set(false);
    }
  }

  private setupClickHandler(): void {
    if (!this.engine) return;

    const canvas = this.gameCanvas.nativeElement;

    // Click handler
    canvas.addEventListener('click', (event: MouseEvent) => {
      if (!this.engine) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Raycast to get world position
      const hitPoint = this.engine.raycastTerrain(event.clientX, event.clientY);

      if (!hitPoint) return;

      // Convert to geo coordinates
      const geo = this.engine.sync.localToGeo(hitPoint);

      // If in build mode, try to place tower
      if (this.buildMode()) {
        const validation = this.validateTowerPosition(geo.lat, geo.lon);

        if (validation.valid) {
          this.placeTower(geo.lat, geo.lon);
          this.toggleBuildMode();
        } else {
          console.log('Invalid tower position:', validation.reason);
        }
      } else {
        // Check if clicked near a tower (simple distance check)
        const towers = this.gameState.towers();
        let clickedTower = null;

        for (const tower of towers) {
          const towerLocal = this.engine.sync.geoToLocal(tower.position.lat, tower.position.lon, tower.position.height || 0);
          const dist = hitPoint.distanceTo(towerLocal);
          if (dist < 15) { // 15m click radius
            clickedTower = tower;
            break;
          }
        }

        if (clickedTower) {
          if (this.gameState.selectedTowerId() === clickedTower.id) {
            this.gameState.deselectAll();
          } else {
            this.gameState.selectTower(clickedTower.id);
          }
        } else {
          this.gameState.deselectAll();
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
    });
    this.buildPreviewMesh = new THREE.Mesh(geometry, material);
    this.buildPreviewMesh.rotation.x = -Math.PI / 2; // Horizontal
    this.buildPreviewMesh.visible = false;

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
    // Rotate HQ marker
    if (this.baseMarker) {
      this.baseMarker.rotation.y += deltaTime * 0.001; // Slow rotation
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

  private addBaseMarker(): void {
    if (!this.engine) return;

    const overlayGroup = this.engine.getOverlayGroup();
    const base = this.baseCoords();

    // Remove existing marker group
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
    }

    // Create marker group
    this.baseMarker = new THREE.Group();
    this.baseMarker.name = 'hqMarker';

    const HEIGHT_ABOVE_GROUND = 30;
    const local = this.engine.sync.geoToLocalSimple(base.latitude, base.longitude, 0);

    // === MAIN DIAMOND (inner core) ===
    const coreGeom = new THREE.OctahedronGeometry(8, 0);
    coreGeom.scale(1, 1.8, 1); // Tall diamond shape
    const coreMat = new THREE.MeshPhongMaterial({
      color: 0x22c55e,
      emissive: 0x115522,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    coreMesh.renderOrder = 3;
    this.baseMarker.add(coreMesh);

    // === OUTER WIREFRAME (edge glow) ===
    const wireGeom = new THREE.OctahedronGeometry(9, 0);
    wireGeom.scale(1, 1.8, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const wireMesh = new THREE.Mesh(wireGeom, wireMat);
    wireMesh.renderOrder = 4;
    this.baseMarker.add(wireMesh);

    // === OUTER GLOW SHELL ===
    const glowGeom = new THREE.OctahedronGeometry(12, 0);
    glowGeom.scale(1, 1.8, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    glowMesh.renderOrder = 2;
    this.baseMarker.add(glowMesh);

    // === HORIZONTAL RING ===
    const ringGeom = new THREE.TorusGeometry(14, 0.8, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.7,
    });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = Math.PI / 2; // Horizontal
    ringMesh.renderOrder = 2;
    this.baseMarker.add(ringMesh);

    // === SECOND RING (tilted) ===
    const ring2Geom = new THREE.TorusGeometry(16, 0.5, 8, 32);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x86efac,
      transparent: true,
      opacity: 0.4,
    });
    const ring2Mesh = new THREE.Mesh(ring2Geom, ring2Mat);
    ring2Mesh.rotation.x = Math.PI / 2;
    ring2Mesh.rotation.z = Math.PI / 6; // Slightly tilted
    ring2Mesh.renderOrder = 2;
    this.baseMarker.add(ring2Mesh);

    // Position the whole group
    this.baseMarker.position.set(local.x, HEIGHT_ABOVE_GROUND, local.z);

    overlayGroup.add(this.baseMarker);
    console.log('[addBaseMarker] HQ diamond marker at:', local.x, HEIGHT_ABOVE_GROUND, local.z);
  }

  addSpawnPoint(id: string, name: string, lat: number, lon: number, color: number): void {
    if (!this.engine) return;

    const spawn: SpawnPoint = { id, name, latitude: lat, longitude: lon, color };
    this.spawnPoints.update((points) => [...points, spawn]);

    const overlayGroup = this.engine.getOverlayGroup();

    // Position marker on terrain with RELATIVE heights
    const HEIGHT_ABOVE_GROUND = 5;
    const base = this.baseCoords();
    const originTerrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude);
    const terrainY = this.engine.getTerrainHeightAtGeo(lat, lon);
    const local = this.engine.sync.geoToLocalSimple(lat, lon, 0);

    // Calculate relative Y (height difference from origin)
    if (originTerrainY !== null && terrainY !== null) {
      local.y = (terrainY - originTerrainY) + HEIGHT_ABOVE_GROUND;
    } else {
      local.y = HEIGHT_ABOVE_GROUND; // Fallback until tiles load
    }

    // Create spawn marker
    const geometry = new THREE.ConeGeometry(6, 15, 6);
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      transparent: true,
      opacity: 0.9
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(local);
    marker.rotation.x = Math.PI; // Point down
    marker.renderOrder = 2;

    overlayGroup.add(marker);
    this.spawnMarkers.push(marker);
    console.log('[addSpawnPoint]', name, 'at:', local.x.toFixed(1), local.y.toFixed(1), local.z.toFixed(1));

    this.showPathFromSpawn(spawn);
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

    // Cache path with default heights (will be updated when tiles load)
    const pathWithHeights: GeoPosition[] = geoPath.map((pos) => ({
      ...pos,
      height: 0, // Will be sampled later when enemies spawn
    }));
    this.cachedPaths.set(spawn.id, pathWithHeights);

    console.log(`[Path] Cached ${pathWithHeights.length} points for ${spawn.name}`);

    // Create route line in Three.js - on terrain with RELATIVE heights
    const HEIGHT_ABOVE_GROUND = 1;
    const overlayGroup = this.engine.getOverlayGroup();
    const points: THREE.Vector3[] = [];

    // Get origin terrain height as reference
    const originTerrainY = this.engine.getTerrainHeightAtGeo(base.latitude, base.longitude);
    if (originTerrainY === null) {
      console.log(`[Path] Cannot render route for ${spawn.name} - origin terrain not available`);
      return;
    }

    for (const pos of geoPath) {
      const terrainY = this.engine.getTerrainHeightAtGeo(pos.lat, pos.lon);
      if (terrainY !== null) {
        const local = this.engine.sync.geoToLocalSimple(pos.lat, pos.lon, 0);
        // Y = height difference from origin + offset above ground
        local.y = (terrainY - originTerrainY) + HEIGHT_ABOVE_GROUND;
        points.push(local);
      }
    }

    // Smooth out height anomalies
    const smoothedPoints = this.smoothPathHeights(points);

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

  private async placeTower(lat: number, lon: number): Promise<void> {
    if (!this.engine) return;

    // Sample terrain height at placement position
    const terrainHeight = await this.engine.getTerrainHeight(lat, lon);

    const position: GeoPosition = { lat, lon, height: terrainHeight };

    // Use the new manager API - it handles rendering automatically
    const tower = this.gameState.placeTower(position, 'archer');
    if (tower) {
      console.log('[TD] Tower placed at:', lat, lon);
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
    const mode = this.spawnMode();
    const speed = this.enemySpeed();

    this.gameState.beginWave();
    this.gatheringPhase.set(true);

    // === PHASE 1: SAMMELN ===
    let spawnedCount = 0;
    const spawnDelay = 100; // ms zwischen Spawns

    const spawnNext = () => {
      if (spawnedCount >= totalEnemies) {
        // === PHASE 2: ANGRIFF ===
        setTimeout(() => {
          this.gatheringPhase.set(false);
          this.gameState.startAllEnemies(300); // 300ms zwischen jedem Start
          this.startGameLoop();
        }, 500); // Kurze Pause nach Sammeln
        return;
      }

      // Spawn-Punkt auswählen (Round-Robin oder Zufällig)
      let currentSpawn: SpawnPoint;
      if (mode === 'each') {
        currentSpawn = spawns[spawnedCount % spawns.length];
      } else {
        currentSpawn = spawns[Math.floor(Math.random() * spawns.length)];
      }

      const spawnPath = this.cachedPaths.get(currentSpawn.id);

      if (spawnPath && spawnPath.length > 1) {
        this.gameState.spawnEnemy(spawnPath, this.enemyType(), speed, true); // paused=true
        spawnedCount++;
      }

      setTimeout(spawnNext, spawnDelay);
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

    // With ThreeTilesEngine + ReorientationPlugin, origin (HQ) is at (0,0,0)
    // Camera position in local coordinates (meters):
    // Y = height above ground, Z = distance south of origin
    this.engine.setLocalCameraPosition(0, 350, 250, 0, 0, 0);
  }

  toggleTilt(): void {
    this.tiltAngle = this.tiltAngle === 45 ? 70 : this.tiltAngle === 70 ? 20 : 45;
    this.resetCamera();
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

  toggleDebug(): void {
    this.debugMode.update((v: boolean) => !v);
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
      tiltAngle: this.tiltAngle,
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

  killAllEnemies(): void {
    // Alle lebenden Gegner töten
    const enemies = this.gameState.enemies();
    for (const enemy of enemies) {
      if (enemy.alive) {
        this.gameState.killEnemy(enemy);
      }
    }
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

  private heightUpdateAttempts = 0;
  private lastMissCount = Infinity;

  /**
   * Schedule periodic re-rendering of streets once tiles are loaded.
   * Uses correct ECEF raycast for terrain heights.
   */
  private scheduleOverlayHeightUpdate(): void {
    const MAX_ATTEMPTS = 20; // Max 20 attempts (10 seconds total)

    this.heightUpdateIntervalId = setInterval(() => {
      if (!this.engine) {
        this.stopHeightUpdates();
        return;
      }

      this.heightUpdateAttempts++;

      // Re-render streets with current terrain data
      const previousLineCount = this.streetLines.length;
      this.renderStreets();
      const newLineCount = this.streetLines.length;

      // Stop if we have streets rendered or max attempts reached
      if (newLineCount > 0 && newLineCount >= previousLineCount) {
        console.log(`[Heights] Streets rendered: ${newLineCount} lines`);
        // Also update marker positions now that tiles are loaded
        this.updateMarkerHeights();
        this.stopHeightUpdates();
      } else if (this.heightUpdateAttempts >= MAX_ATTEMPTS) {
        console.log(`[Heights] Max attempts reached, ${newLineCount} lines rendered`);
        this.updateMarkerHeights();
        this.stopHeightUpdates();
      }
    }, 500);
  }

  private stopHeightUpdates(): void {
    if (this.heightUpdateIntervalId) {
      clearInterval(this.heightUpdateIntervalId);
      this.heightUpdateIntervalId = null;
    }
    this.overlayHeightsUpdated = true;
  }

  /**
   * Update marker heights after tiles are loaded
   * Heights are relative to origin (HQ) terrain height
   */
  private updateMarkerHeights(): void {
    if (!this.engine) return;

    const HQ_MARKER_HEIGHT = 30; // HQ marker floats higher (animated diamond)
    const SPAWN_MARKER_HEIGHT = 5;

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

  private playProjectileSound(): void {
    const audio = new Audio(this.projectileSoundUrl);
    audio.volume = 0.3;
    audio.play().catch(() => {
      // Ignore autoplay restrictions
    });
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
   * Apply new location - simplified: just HQ + single spawn
   */
  async onApplyNewLocation(data: { hq: LocationConfig; spawn: LocationConfig }): Promise<void> {
    this.isApplyingLocation.set(true);
    this.appendDebugLog(`Lade: ${data.hq.name?.split(',')[0]}...`);

    try {
      // Update coords
      this.baseCoords.set({ latitude: data.hq.lat, longitude: data.hq.lon });
      this.centerCoords.set({ latitude: data.hq.lat, longitude: data.hq.lon, height: 400 });

      // Update editable state
      this.editableHqLocation.set(data.hq);
      const spawnConfig: SpawnLocationConfig = { id: 'spawn-1', ...data.spawn };
      this.editableSpawnLocations.set([spawnConfig]);

      // Clear existing entities
      this.clearMapEntities();

      // Reload streets for new center
      this.streetNetwork = await this.osmService.loadStreets(data.hq.lat, data.hq.lon, 2000);
      this.streetCount.set(this.streetNetwork.streets.length);
      this.renderStreets();

      // Add new base marker
      this.addBaseMarker();

      // Add spawn point
      this.addSpawnPoint('spawn-1', data.spawn.name?.split(',')[0] || 'Spawn', data.spawn.lat, data.spawn.lon, 0xef4444);

      // Reinitialize game state
      const base = this.baseCoords();
      const waveSpawnPoints: WaveSpawnPoint[] = this.spawnPoints().map((sp) => ({
        id: sp.id,
        name: sp.name,
        latitude: sp.latitude,
        longitude: sp.longitude,
      }));

      if (this.engine) {
        this.engine.setOrigin(data.hq.lat, data.hq.lon);
        this.engine.clearDebugHelpers();

        this.gameState.initializeWithTilesEngine(
          this.engine,
          this.streetNetwork!,
          { lat: base.latitude, lon: base.longitude },
          waveSpawnPoints,
          this.cachedPaths,
          () => this.playProjectileSound(),
          (msg) => this.appendDebugLog(msg),
          () => this.onGameOver()
        );
      }

      // Save to localStorage
      this.saveLocationsToStorage();

      // Fly to new location
      this.flyToCenter();

      this.appendDebugLog(`Geladen: ${this.streetCount()} Strassen`);
    } catch (err) {
      console.error('Failed to apply location:', err);
      this.appendDebugLog(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      this.isApplyingLocation.set(false);
    }
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

    // Clear spawn markers
    for (const marker of this.spawnMarkers) {
      overlayGroup.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
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

    // With ReorientationPlugin, center (HQ) is always at origin (0,0,0)
    this.engine.setLocalCameraPosition(0, 400, 300, 0, 0, 0);
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
