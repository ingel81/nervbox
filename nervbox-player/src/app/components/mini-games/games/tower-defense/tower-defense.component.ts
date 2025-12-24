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
import { environment } from '../../../../../environments/environment';
import { OsmStreetService, StreetNetwork } from './services/osm-street.service';
import { GameStateService } from './services/game-state.service';
import { EntityPoolService } from './services/entity-pool.service';
import { Tower } from './models/tower.model';
import { GeoPosition } from './models/game.types';
import { TowerRenderer } from './renderers/tower.renderer';
import { ApiService } from '../../../../core/services/api.service';

import * as Cesium from 'cesium';

const ERLENBACH_COORDS = {
  latitude: 49.1726836,
  longitude: 9.2703122,
  height: 400,
};

const BASE_COORDS = {
  latitude: 49.17326887448299,
  longitude: 9.268588397188681,
};

const SPAWN_POINTS = [
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

export interface SpawnPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  color: Cesium.Color;
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
  ],
  providers: [GameStateService, EntityPoolService],
  template: `
    <div class="tower-defense-container">
      <div class="game-header">
        <div class="header-glow"></div>
        <mat-icon class="title-icon">cell_tower</mat-icon>
        <h2>TOWER DEFENSE</h2>
        <span class="subtitle">Erlenbach</span>
        <button mat-icon-button class="close-btn" (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
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
              <p>3. Trage ihn in <code>environment.ts</code> ein:</p>
              <pre>cesiumAccessToken: 'dein-token-hier'</pre>
            </div>
            <button mat-flat-button color="primary" (click)="close()">Schliessen</button>
          </div>
        }

        <div #cesiumContainer class="cesium-container" [class.hidden]="loading() || error()"></div>

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

          <!-- Build Control (top center) -->
          <div class="build-control">
            <button mat-fab extended [color]="buildMode() ? 'accent' : 'primary'" (click)="toggleBuildMode()">
              <mat-icon>{{ buildMode() ? 'close' : 'add_location' }}</mat-icon>
              {{ buildMode() ? 'Abbrechen' : 'Tower' }}
            </button>
            @if (buildMode()) {
              <div class="build-hint">Klicke neben Strasse</div>
            }
          </div>

          <!-- Wave Control (bottom center) -->
          <div class="wave-control">
            <button mat-fab extended color="warn" (click)="startWave()" [disabled]="waveActive() || buildMode()">
              <mat-icon>play_arrow</mat-icon>
              {{ waveActive() ? 'Welle...' : 'Start' }}
            </button>
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

          <!-- Debug Panel (top right, collapsible) -->
          @if (debugMode()) {
            <div class="debug-panel">
              <div class="debug-title">Debug</div>
              <div class="debug-item">
                <span>Strassen:</span>
                <span>{{ streetCount() }}</span>
              </div>
              <div class="debug-item">
                <span>Speed:</span>
                <span>{{ enemySpeed().toFixed(3) }}</span>
              </div>
              <input type="range" min="0.005" max="0.05" step="0.001"
                     [value]="enemySpeed()"
                     (input)="onSpeedChange($event)"
                     class="debug-slider" />
              <div class="debug-buttons">
                <button mat-stroked-button (click)="toggleStreets()" [class.active]="streetsVisible()">
                  <mat-icon>route</mat-icon> Strassen
                </button>
                <button mat-stroked-button (click)="toggleRoutes()" [class.active]="routesVisible()">
                  <mat-icon>timeline</mat-icon> Routen
                </button>
              </div>
            </div>
          }

          <!-- Controls Hint (bottom left, minimal) -->
          <div class="controls-hint">
            <span>LMB: Move | Ctrl: Rotate | Scroll: Zoom</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
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
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(34, 197, 94, 0.2) 0%, transparent 50%);
      animation: rotate-glow 15s linear infinite;
    }

    @keyframes rotate-glow {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
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

    .cesium-container {
      width: 100%;
      height: 100%;
    }

    .cesium-container.hidden {
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

    .build-control {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      z-index: 5;
    }

    .build-control button {
      font-family: 'JetBrains Mono', monospace !important;
      font-weight: 600 !important;
      font-size: 12px !important;
    }

    .build-hint {
      padding: 4px 10px;
      background: rgba(147, 51, 234, 0.9);
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: white;
    }

    .wave-control {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 5;
    }

    .wave-control button {
      background: linear-gradient(135deg, #ef4444 0%, #f97316 100%) !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-weight: 600 !important;
      font-size: 12px !important;
    }

    .wave-control button:disabled {
      background: rgba(100, 100, 100, 0.5) !important;
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

    .debug-panel {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 10px 14px;
      background: rgba(0, 0, 0, 0.9);
      border: 1px solid rgba(34, 197, 94, 0.5);
      border-radius: 8px;
      z-index: 5;
    }

    .debug-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      color: #22c55e;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .debug-item {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
    }

    .debug-buttons {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .debug-buttons button {
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 10px !important;
      height: 28px !important;
      color: rgba(255, 255, 255, 0.7) !important;
      border-color: rgba(255, 255, 255, 0.3) !important;
    }

    .debug-buttons button.active {
      background: rgba(34, 197, 94, 0.3) !important;
      border-color: #22c55e !important;
      color: #22c55e !important;
    }

    .debug-buttons button mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-right: 4px;
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

    .debug-slider {
      width: 100%;
      margin: 8px 0;
      accent-color: #22c55e;
    }

    :host ::ng-deep .cesium-viewer-toolbar,
    :host ::ng-deep .cesium-viewer-animationContainer,
    :host ::ng-deep .cesium-viewer-timelineContainer,
    :host ::ng-deep .cesium-viewer-bottom {
      display: none !important;
    }

    :host ::ng-deep .cesium-widget-credits {
      font-size: 10px !important;
      opacity: 0.5;
    }
  `,
})
export class TowerDefenseComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('cesiumContainer') cesiumContainer!: ElementRef<HTMLDivElement>;

  private readonly dialogRef = inject(MatDialogRef<TowerDefenseComponent>);
  private readonly osmService = inject(OsmStreetService);
  private readonly api = inject(ApiService);
  readonly gameState = inject(GameStateService);
  private readonly entityPool = inject(EntityPoolService);

  // Sound
  private readonly PROJECTILE_SOUND_HASH = '3ae29d3b4c96b913c63964373e218f08';
  private projectileSoundUrl = '';

  private viewer: Cesium.Viewer | null = null;
  private streetNetwork: StreetNetwork | null = null;
  private streetEntities: Cesium.Entity[] = [];
  private spawnEntities: Cesium.Entity[] = [];
  private routeEntities: Cesium.Entity[] = []; // Spawn routes (red paths)
  private baseEntity: Cesium.Entity | null = null;

  readonly loading = signal(true);
  readonly loadingMessage = signal('Lade 3D-Karte...');
  readonly error = signal<string | null>(null);
  readonly streetsVisible = signal(false);
  readonly routesVisible = signal(false);
  readonly debugMode = signal(false);
  readonly enemySpeed = signal(0.005);
  readonly streetCount = signal(0);
  readonly spawnPoints = signal<SpawnPoint[]>([]);
  readonly baseCoords = signal(BASE_COORDS);
  readonly buildMode = signal(false);

  readonly waveActive = computed(() => this.gameState.phase() === 'wave');

  private clickHandler: Cesium.ScreenSpaceEventHandler | null = null;
  private animationFrameId: number | null = null;
  private cachedPaths = new Map<string, GeoPosition[]>();
  private buildPreviewEntity: Cesium.Entity | null = null;
  private lastPreviewValidation: boolean | null = null;
  private previewThrottleId: number | null = null;

  private readonly MIN_DISTANCE_TO_STREET = 10;
  private readonly MAX_DISTANCE_TO_STREET = 50;
  private readonly MIN_DISTANCE_TO_BASE = 30;
  private readonly MIN_DISTANCE_TO_SPAWN = 30;
  private readonly TOWER_RANGE = 60;

  private tiltAngle = 45;

  ngOnInit(): void {
    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';
  }

  ngAfterViewInit(): void {
    this.initCesium();
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.clickHandler) {
      this.clickHandler.destroy();
    }
    if (this.buildPreviewEntity && this.viewer) {
      this.viewer.entities.remove(this.buildPreviewEntity);
    }
    this.entityPool.destroy();
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
  }

  private async initCesium(): Promise<void> {
    try {
      const token = environment.cesiumAccessToken;
      if (!token || token === 'YOUR_CESIUM_ION_ACCESS_TOKEN') {
        this.error.set('Bitte konfiguriere deinen Cesium Ion Access Token.');
        this.loading.set(false);
        return;
      }

      Cesium.Ion.defaultAccessToken = token;

      this.viewer = new Cesium.Viewer(this.cesiumContainer.nativeElement, {
        terrain: Cesium.Terrain.fromWorldTerrain(),
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        shadows: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      });

      // Configure clock for smooth animations
      this.viewer.clock.shouldAnimate = true;
      this.viewer.clock.multiplier = 1.0;
      this.viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;

      try {
        const tileset = await Cesium.createGooglePhotorealistic3DTileset();
        this.viewer.scene.primitives.add(tileset);
      } catch {
        console.warn('Google 3D Tiles not available');
      }

      this.viewer.scene.globe.depthTestAgainstTerrain = true;

      // Disable right-click zoom (only use scroll wheel for zoom)
      this.viewer.scene.screenSpaceCameraController.zoomEventTypes = [
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH,
      ];

      // Smoother and finer zoom with mouse wheel
      this.viewer.scene.screenSpaceCameraController.zoomFactor = 1.5; // Default is 3.0
      this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50;
      this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 2000;

      // Set up sound URL
      this.projectileSoundUrl = this.api.getFullUrl(`/sound/${this.PROJECTILE_SOUND_HASH}/file`);

      // Initialize services
      this.entityPool.initialize(this.viewer);
      this.gameState.initialize(
        this.viewer,
        this.entityPool,
        (p1, p2) => this.osmService.haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon),
        () => this.playProjectileSound()
      );

      // Setup click handler and build preview
      this.setupClickHandler();
      this.createBuildPreview();

      this.loadingMessage.set('Lade Strassennetz von OpenStreetMap...');
      await this.loadStreets();

      this.addBaseMarker();
      this.addPredefinedSpawns();
      this.resetCamera();

      this.loading.set(false);
    } catch (err) {
      console.error('Cesium initialization error:', err);
      this.error.set(err instanceof Error ? err.message : 'Fehler beim Laden der 3D-Karte');
      this.loading.set(false);
    }
  }

  private setupClickHandler(): void {
    if (!this.viewer) return;

    this.clickHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    this.clickHandler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      if (!this.viewer) return;

      // Check if clicked on a tower
      const picked = this.viewer.scene.pick(event.position);

      if (Cesium.defined(picked) && picked.id) {
        const tower = this.gameState.towers().find((t) => t.entity === picked.id);
        if (tower) {
          if (this.gameState.selectedTowerId() === tower.id) {
            this.gameState.deselectAll();
          } else {
            this.gameState.selectTower(tower.id);
          }
          return;
        }
      }

      // If in build mode, try to place tower
      if (this.buildMode()) {
        const cartesian = this.viewer.scene.pickPosition(event.position);
        if (!cartesian || !Cesium.defined(cartesian)) return;

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);

        const validation = this.validateTowerPosition(lat, lon);

        if (validation.valid) {
          this.placeTower(lat, lon);
          this.toggleBuildMode(); // This also hides the preview
        } else {
          console.log('Invalid tower position:', validation.reason);
        }
      } else {
        // Deselect tower when clicking elsewhere
        this.gameState.deselectAll();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Mouse move handler for build preview (optimized)
    this.clickHandler.setInputAction(
      (movement: { endPosition: Cesium.Cartesian2 }) => {
        if (!this.buildMode() || !this.buildPreviewEntity || !this.viewer) return;

        // Use globe.pick (terrain only, faster than pickPosition which includes 3D tiles)
        const ray = this.viewer.camera.getPickRay(movement.endPosition);
        if (!ray) {
          this.buildPreviewEntity.show = false;
          return;
        }

        const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
        if (!cartesian) {
          this.buildPreviewEntity.show = false;
          return;
        }

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);

        // Update position directly
        (this.buildPreviewEntity.position as Cesium.ConstantPositionProperty).setValue(
          Cesium.Cartesian3.fromDegrees(lon, lat, 0)
        );
        this.buildPreviewEntity.show = true;

        // Throttle validation - only every 30ms
        if (this.previewThrottleId === null) {
          this.previewThrottleId = window.setTimeout(() => {
            this.previewThrottleId = null;
            if (!this.buildPreviewEntity?.billboard) return;

            const validation = this.validateTowerPosition(lat, lon);
            if (this.lastPreviewValidation !== validation.valid) {
              this.lastPreviewValidation = validation.valid;
              // Update billboard image
              this.buildPreviewEntity.billboard.image = new Cesium.ConstantProperty(
                this.createPreviewCanvas(validation.valid)
              );
            }
          }, 30);
        }
      },
      Cesium.ScreenSpaceEventType.MOUSE_MOVE
    );
  }

  private createBuildPreview(): void {
    if (!this.viewer) return;

    // Use a billboard instead of ellipse for better visibility on 3D tiles
    const canvas = this.createPreviewCanvas(true);
    this.buildPreviewEntity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
      billboard: {
        image: canvas,
        scale: 1.0,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      show: false,
    });
  }

  private createPreviewCanvas(valid: boolean): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const size = 64;
    canvas.width = size;
    canvas.height = size;

    const color = valid ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';
    const borderColor = valid ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    return canvas;
  }

  private async loadStreets(): Promise<void> {
    try {
      this.streetNetwork = await this.osmService.loadStreets(
        ERLENBACH_COORDS.latitude,
        ERLENBACH_COORDS.longitude,
        2000 // 2km radius
      );

      this.streetCount.set(this.streetNetwork.streets.length);
      this.renderStreets();
    } catch (err) {
      console.error('Failed to load streets:', err);
    }
  }

  private renderStreets(): void {
    if (!this.viewer || !this.streetNetwork) return;

    for (const entity of this.streetEntities) {
      this.viewer.entities.remove(entity);
    }
    this.streetEntities = [];

    for (const street of this.streetNetwork.streets) {
      const positions = street.nodes.map((node) =>
        Cesium.Cartesian3.fromDegrees(node.lon, node.lat)
      );

      if (positions.length < 2) continue;

      const entity = this.viewer.entities.add({
        polyline: {
          positions,
          width: 6,
          material: Cesium.Color.GOLD,
          clampToGround: true,
        },
        show: this.streetsVisible(),
      });

      this.streetEntities.push(entity);
    }
  }

  private addPredefinedSpawns(): void {
    const colors = [Cesium.Color.RED, Cesium.Color.ORANGE, Cesium.Color.CYAN, Cesium.Color.MAGENTA];

    SPAWN_POINTS.forEach((spawn, index) => {
      this.addSpawnPoint(spawn.id, spawn.name, spawn.latitude, spawn.longitude, colors[index % colors.length]);
    });
  }

  private addBaseMarker(): void {
    if (!this.viewer) return;

    const base = this.baseCoords();

    if (this.baseEntity) {
      this.viewer.entities.remove(this.baseEntity);
    }

    this.baseEntity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(base.longitude, base.latitude, 0),
      billboard: {
        image: this.createMarkerCanvas('BASIS', '#22c55e', 60),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scale: 1.0,
      },
    });
  }

  addSpawnPoint(id: string, name: string, lat: number, lon: number, color: Cesium.Color): void {
    if (!this.viewer) return;

    const spawn: SpawnPoint = { id, name, latitude: lat, longitude: lon, color };
    this.spawnPoints.update((points) => [...points, spawn]);

    const entity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      billboard: {
        image: this.createMarkerCanvas(`SPAWN: ${name}`, color.toCssColorString(), 50),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scale: 1.0,
      },
    });

    this.spawnEntities.push(entity);
    this.showPathFromSpawn(spawn);
  }

  private showPathFromSpawn(spawn: SpawnPoint): void {
    if (!this.viewer || !this.streetNetwork) return;

    const base = this.baseCoords();
    const path = this.osmService.findPath(
      this.streetNetwork,
      spawn.latitude,
      spawn.longitude,
      base.latitude,
      base.longitude
    );

    if (path.length < 2) return;

    // Store path without heights initially
    const geoPath = path.map((n) => ({ lat: n.lat, lon: n.lon }));
    this.cachedPaths.set(spawn.id, geoPath);

    // Sample terrain heights for all path points
    const terrainProvider = this.viewer.terrainProvider;
    const cartographics = path.map((n) => Cesium.Cartographic.fromDegrees(n.lon, n.lat));

    Cesium.sampleTerrainMostDetailed(terrainProvider, cartographics).then((sampled) => {
      // Update path with terrain heights
      const pathWithHeights = geoPath.map((pos, i) => ({
        ...pos,
        height: sampled[i].height ?? 235,
      }));
      this.cachedPaths.set(spawn.id, pathWithHeights);
      console.log(`[Path] Sampled ${pathWithHeights.length} terrain heights for ${spawn.name}`);
    });

    const positions = path.map((node) => Cesium.Cartesian3.fromDegrees(node.lon, node.lat));

    const routeEntity = this.viewer.entities.add({
      polyline: {
        positions,
        width: 10,
        material: spawn.color,
        clampToGround: true,
      },
      show: this.routesVisible(),
    });

    this.routeEntities.push(routeEntity);
  }

  private validateTowerPosition(lat: number, lon: number): { valid: boolean; reason?: string } {
    if (!this.streetNetwork) {
      return { valid: false, reason: 'Strassennetz nicht geladen' };
    }

    const base = this.baseCoords();
    const distToBase = this.osmService.haversineDistance(lat, lon, base.latitude, base.longitude);
    if (distToBase < this.MIN_DISTANCE_TO_BASE) {
      return { valid: false, reason: 'Zu nah an der Basis' };
    }

    for (const spawn of this.spawnPoints()) {
      const distToSpawn = this.osmService.haversineDistance(lat, lon, spawn.latitude, spawn.longitude);
      if (distToSpawn < this.MIN_DISTANCE_TO_SPAWN) {
        return { valid: false, reason: 'Zu nah am Spawn-Punkt' };
      }
    }

    for (const tower of this.gameState.towers()) {
      const distToTower = this.osmService.haversineDistance(lat, lon, tower.position.lat, tower.position.lon);
      if (distToTower < 20) {
        return { valid: false, reason: 'Zu nah an anderem Tower' };
      }
    }

    const nearest = this.osmService.findNearestStreetPoint(this.streetNetwork, lat, lon);
    if (!nearest) {
      return { valid: false, reason: 'Keine Strasse in der Naehe' };
    }

    if (nearest.distance > this.MAX_DISTANCE_TO_STREET) {
      return { valid: false, reason: 'Zu weit von Strasse entfernt' };
    }

    if (nearest.distance < this.MIN_DISTANCE_TO_STREET) {
      return { valid: false, reason: 'Nicht direkt auf der Strasse bauen' };
    }

    return { valid: true };
  }

  private placeTower(lat: number, lon: number): void {
    if (!this.viewer) return;

    const position: GeoPosition = { lat, lon };

    // 3D Tower: glTF Modell
    const entity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      model: {
        uri: '/assets/models/tower_archer.glb',
        scale: 1.8,
        minimumPixelSize: 48,
        maximumScale: 3.0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    const rangeEntity = TowerRenderer.createRangeEntity(this.viewer, position, this.TOWER_RANGE, false);

    const tower = new Tower(position, entity, { range: this.TOWER_RANGE });
    tower.rangeEntity = rangeEntity;

    this.gameState.addTower(tower);
    this.viewer.scene.requestRender();
  }

  toggleBuildMode(): void {
    this.buildMode.update((v) => !v);
    if (this.buildMode()) {
      this.gameState.deselectAll();
      // Enable continuous rendering for smooth preview
      if (this.viewer) {
        this.viewer.scene.requestRenderMode = false;
      }
    } else {
      // Hide build preview when exiting build mode
      if (this.buildPreviewEntity) {
        this.buildPreviewEntity.show = false;
      }
      this.lastPreviewValidation = null;
      // Restore render-on-demand mode
      if (this.viewer) {
        this.viewer.scene.requestRenderMode = true;
        this.viewer.scene.requestRender();
      }
    }
  }

  startWave(): void {
    if (!this.viewer || this.waveActive()) return;

    const spawns = this.spawnPoints();
    if (spawns.length === 0) return;

    const spawn = spawns[0];
    const path = this.cachedPaths.get(spawn.id);
    if (!path || path.length < 2) return;

    this.gameState.startWave();

    const enemyCount = 5;
    let spawnedCount = 0;
    let allSpawned = false;

    const spawnInterval = setInterval(() => {
      if (spawnedCount >= enemyCount) {
        clearInterval(spawnInterval);
        allSpawned = true;
        return;
      }

      const randomSpawn = spawns[Math.floor(Math.random() * spawns.length)];
      const spawnPath = this.cachedPaths.get(randomSpawn.id);

      if (spawnPath && spawnPath.length > 1) {
        this.gameState.spawnEnemy(spawnPath, 100, this.enemySpeed());
        spawnedCount++;
      }
    }, 800);

    this.startGameLoop(() => allSpawned);
  }

  private startGameLoop(allSpawnedCheck: () => boolean): void {
    const animate = () => {
      if (!this.viewer || this.gameState.phase() === 'gameover') {
        this.animationFrameId = null;
        return;
      }

      const currentTime = performance.now();
      this.gameState.update(currentTime);

      if (this.gameState.checkWaveComplete() && allSpawnedCheck()) {
        this.gameState.endWave();
        this.viewer.scene.requestRender(); // Render final state with all enemies removed
        this.animationFrameId = null;
        return;
      }

      if (this.gameState.enemiesAlive() === 0 && !allSpawnedCheck()) {
        this.animationFrameId = requestAnimationFrame(animate);
        return;
      }

      this.viewer.scene.requestRender();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  resetCamera(): void {
    if (!this.viewer) return;

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        ERLENBACH_COORDS.longitude,
        ERLENBACH_COORDS.latitude,
        ERLENBACH_COORDS.height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(288.98),
        pitch: Cesium.Math.toRadians(-this.tiltAngle),
        roll: 0,
      },
      duration: 1.5,
    });
  }

  toggleTilt(): void {
    this.tiltAngle = this.tiltAngle === 45 ? 70 : this.tiltAngle === 70 ? 20 : 45;
    this.resetCamera();
  }

  toggleStreets(): void {
    this.streetsVisible.update((v) => !v);
    const visible = this.streetsVisible();

    for (const entity of this.streetEntities) {
      entity.show = visible;
    }

    this.viewer?.scene.requestRender();
  }

  toggleRoutes(): void {
    this.routesVisible.update((v) => !v);
    const visible = this.routesVisible();

    for (const entity of this.routeEntities) {
      entity.show = visible;
    }

    this.viewer?.scene.requestRender();
  }

  toggleDebug(): void {
    this.debugMode.update((v) => !v);
  }

  onSpeedChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.enemySpeed.set(value);
    // Update all existing enemies live
    for (const enemy of this.gameState.enemies()) {
      enemy.speed = value;
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  private playProjectileSound(): void {
    const audio = new Audio(this.projectileSoundUrl);
    audio.volume = 0.3;
    audio.play().catch(() => {
      // Ignore autoplay restrictions
    });
  }

  private createMarkerCanvas(text: string, color: string, size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = 200;
    canvas.height = size + 40;

    const centerX = canvas.width / 2;
    const pinRadius = size / 2;

    ctx.beginPath();
    ctx.arc(centerX, pinRadius, pinRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX - 12, pinRadius + pinRadius * 0.7);
    ctx.lineTo(centerX, pinRadius + pinRadius + 15);
    ctx.lineTo(centerX + 12, pinRadius + pinRadius * 0.7);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, pinRadius, pinRadius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = 180;
    if (ctx.measureText(text).width > maxWidth) {
      ctx.font = 'bold 11px JetBrains Mono, monospace';
    }
    ctx.fillText(text, centerX, pinRadius);

    return canvas;
  }
}
