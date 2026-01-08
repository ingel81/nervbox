import { Injectable, inject, signal, computed } from '@angular/core';
import * as Cesium from 'cesium';
import { EnemyManager } from './enemy.manager';
import { TowerManager } from './tower.manager';
import { ProjectileManager } from './projectile.manager';
import { WaveManager, SpawnPoint, WaveConfig } from './wave.manager';
import { AudioManager } from './audio.manager';
import { RenderManager } from './render.manager';
import { StreetNetwork } from '../services/osm-street.service';
import { GeoPosition } from '../models/game.types';
import { GameObject } from '../core/game-object';
import { Enemy } from '../entities/enemy.entity';
import { Projectile } from '../entities/projectile.entity';
import { BloodRenderer } from '../renderers/blood.renderer';
import { FireRenderer, FireIntensity } from '../renderers/fire.renderer';
import { EnemyTypeId } from '../models/enemy-types';
import { TowerTypeId } from '../configs/tower-types.config';
import { Tower } from '../entities/tower.entity';
import { TdThreeEngine, ThreeTilesEngine } from '../three-engine';

/**
 * Main game state orchestrator - coordinates all managers
 *
 * Provides convenience methods that delegate to sub-managers for
 * backwards compatibility with existing component code.
 */
@Injectable()
export class GameStateManager {
  // Managers (public for direct access when needed)
  readonly enemyManager = inject(EnemyManager);
  readonly towerManager = inject(TowerManager);
  readonly projectileManager = inject(ProjectileManager);
  readonly waveManager = inject(WaveManager);
  readonly audioManager = inject(AudioManager);
  readonly renderManager = inject(RenderManager);

  // Game State
  readonly baseHealth = signal(100);
  readonly credits = signal(100);
  readonly showGameOverScreen = signal(false);

  // Convenience computed signals (for template bindings)
  readonly phase = computed(() => this.waveManager.phase());
  readonly waveNumber = computed(() => this.waveManager.waveNumber());
  readonly towerCount = computed(() => this.towerManager.getAll().length);
  readonly enemiesAlive = computed(() => this.enemyManager.getAliveCount());
  readonly selectedTowerId = computed(() => this.towerManager.getSelectedId());

  private viewer: Cesium.Viewer | null = null;
  private threeEngine: TdThreeEngine | null = null;
  private tilesEngine: ThreeTilesEngine | null = null;
  private lastUpdateTime = 0;
  private basePosition: GeoPosition | null = null;
  private onGameOverCallback?: () => void;
  private onProjectileFiredCallback?: () => void;
  private onDebugLogCallback?: (msg: string) => void;

  /**
   * Check if Three.js rendering is enabled (via TdThreeEngine or ThreeTilesEngine)
   */
  get useThreeJs(): boolean {
    return this.threeEngine !== null || this.tilesEngine !== null;
  }

  /**
   * Check if we're using the new 3DTilesRendererJS-based engine
   */
  get useTilesEngine(): boolean {
    return this.tilesEngine !== null;
  }

  /**
   * Initialize game state and all managers
   *
   * @param viewer - Cesium viewer instance
   * @param streetNetwork - OSM street network for pathfinding
   * @param basePosition - HQ position
   * @param spawnPoints - Enemy spawn points
   * @param cachedPaths - Pre-calculated paths from spawns to base
   * @param onProjectileFired - Optional callback when projectile is fired (for sound)
   * @param onDebugLog - Optional callback for debug logging
   * @param onGameOver - Optional callback when game is over
   * @param threeEngine - Optional Three.js engine for rendering
   */
  initialize(
    viewer: Cesium.Viewer,
    streetNetwork: StreetNetwork,
    basePosition: GeoPosition,
    spawnPoints: SpawnPoint[],
    cachedPaths: Map<string, GeoPosition[]>,
    onProjectileFired?: () => void,
    onDebugLog?: (msg: string) => void,
    onGameOver?: () => void,
    threeEngine?: TdThreeEngine
  ): void {
    this.viewer = viewer;
    this.threeEngine = threeEngine ?? null;
    this.basePosition = basePosition;
    this.onGameOverCallback = onGameOver;
    this.onProjectileFiredCallback = onProjectileFired;
    this.onDebugLogCallback = onDebugLog;

    // Initialize all managers
    this.renderManager.initialize(viewer);
    this.audioManager.initialize(viewer);

    this.enemyManager.initializeWithCallbacks(
      viewer,
      (enemy) => this.onEnemyReachedBase(enemy),
      threeEngine
    );
    this.towerManager.initializeWithContext(
      viewer,
      streetNetwork,
      basePosition,
      spawnPoints.map((s) => ({ lat: s.latitude, lon: s.longitude })),
      threeEngine
    );
    this.projectileManager.initializeWithCallbacks(
      viewer,
      (proj, enemy) => this.onProjectileHit(proj, enemy),
      () => {
        // Projectile fire sound callback (sound file not available)
        this.onProjectileFiredCallback?.();
      },
      threeEngine
    );
    this.waveManager.initialize(spawnPoints, cachedPaths);

    // Register sounds
    this.audioManager.registerSound(
      'base-damage',
      '/assets/sounds/impactful-damage-425132.mp3'
    );
  }

  /**
   * Initialize game state with new ThreeTilesEngine (3DTilesRendererJS-based)
   *
   * This replaces Cesium entirely with a pure Three.js engine.
   */
  initializeWithTilesEngine(
    tilesEngine: ThreeTilesEngine,
    streetNetwork: StreetNetwork,
    basePosition: GeoPosition,
    spawnPoints: SpawnPoint[],
    cachedPaths: Map<string, GeoPosition[]>,
    onProjectileFired?: () => void,
    onDebugLog?: (msg: string) => void,
    onGameOver?: () => void
  ): void {
    this.tilesEngine = tilesEngine;
    this.viewer = null; // No Cesium viewer
    this.threeEngine = null; // Not using the old dual-engine
    this.basePosition = basePosition;
    this.onGameOverCallback = onGameOver;
    this.onProjectileFiredCallback = onProjectileFired;
    this.onDebugLogCallback = onDebugLog;

    // Initialize managers with ThreeTilesEngine
    this.enemyManager.initializeWithTilesEngine(
      tilesEngine,
      (enemy) => this.onEnemyReachedBase(enemy)
    );
    this.towerManager.initializeWithTilesEngine(
      tilesEngine,
      streetNetwork,
      basePosition,
      spawnPoints.map((s) => ({ lat: s.latitude, lon: s.longitude }))
    );
    this.projectileManager.initializeWithTilesEngine(
      tilesEngine,
      (proj, enemy) => this.onProjectileHit(proj, enemy),
      () => {
        this.onProjectileFiredCallback?.();
      }
    );
    this.waveManager.initialize(spawnPoints, cachedPaths);

    console.log('[GameStateManager] Initialized with ThreeTilesEngine');
  }

  /**
   * Main update loop
   */
  update(currentTime: number): void {
    const deltaTime = this.lastUpdateTime ? currentTime - this.lastUpdateTime : 16;
    this.lastUpdateTime = currentTime;

    if (this.waveManager.phase() !== 'wave') return;

    // Update all managers
    this.enemyManager.update(deltaTime);
    this.updateTowerShooting(currentTime);
    this.projectileManager.update(deltaTime);

    // Check wave completion
    if (this.waveManager.checkWaveComplete()) {
      this.waveManager.endWave();
      this.credits.update((c) => c + 50);
    }

    // Check game over
    if (this.baseHealth() <= 0 && this.waveManager.phase() !== 'gameover') {
      this.triggerGameOver();
    } else if (this.baseHealth() < 100 && this.baseHealth() > 0) {
      this.updateFireIntensity();
    }
  }

  /**
   * Update tower shooting logic
   */
  private updateTowerShooting(currentTime: number): void {
    const enemies = this.enemyManager.getAlive();

    for (const tower of this.towerManager.getAllActive()) {
      if (!tower.combat.canFire(currentTime)) continue;

      const target = tower.findTarget(enemies);
      if (target) {
        tower.combat.fire(currentTime);
        this.projectileManager.spawn(tower, target);
      }
    }
  }

  /**
   * Handle enemy reaching base
   */
  private onEnemyReachedBase(enemy: Enemy): void {
    this.baseHealth.update((h) => Math.max(0, h - 10));
    this.audioManager.play('base-damage', 0.5);
    this.updateFireIntensity();
  }

  /**
   * Handle projectile hitting enemy
   */
  private onProjectileHit(projectile: Projectile, enemy: Enemy): void {
    // Spawn blood effects only for enemies that can bleed
    if (enemy.typeConfig.canBleed) {
      if (this.tilesEngine) {
        // ThreeTilesEngine blood effects
        this.tilesEngine.effects.spawnBloodSplatter(
          enemy.position.lat,
          enemy.position.lon,
          enemy.transform.terrainHeight + 1
        );
      } else if (this.useThreeJs && this.threeEngine) {
        // TdThreeEngine blood effects
        this.threeEngine.effects.spawnBloodSplatter(
          enemy.position.lat,
          enemy.position.lon,
          enemy.transform.terrainHeight + 1
        );
      } else if (this.viewer) {
        // Cesium blood effects (fallback)
        BloodRenderer.spawnBloodSplatter(
          this.viewer,
          enemy.position.lon,
          enemy.position.lat,
          enemy.transform.terrainHeight + 1
        );
        BloodRenderer.spawnBloodStain(
          this.viewer,
          enemy.position.lon,
          enemy.position.lat,
          enemy.transform.terrainHeight
        );
      }
    }

    const killed = enemy.health.takeDamage(projectile.damage);
    if (killed) {
      this.enemyManager.kill(enemy);
      this.credits.update((c) => c + 10);
    }
    // Health bar update will be handled by renderer integration
  }

  // Track active fire effect ID for Three.js
  private activeFireId: string | null = null;

  /**
   * Update fire intensity based on base health
   */
  private updateFireIntensity(): void {
    if (!this.basePosition) return;

    const health = this.baseHealth();
    let intensity: FireIntensity;

    if (health < 20) intensity = 'large';
    else if (health < 40) intensity = 'medium';
    else if (health < 60) intensity = 'small';
    else intensity = 'tiny';

    if (this.tilesEngine) {
      // ThreeTilesEngine fire effects
      if (this.activeFireId) {
        this.tilesEngine.effects.stopFire(this.activeFireId);
      }
      this.activeFireId = this.tilesEngine.effects.spawnFire(
        this.basePosition.lat,
        this.basePosition.lon,
        this.basePosition.height || 235,
        intensity
      );
    } else if (this.useThreeJs && this.threeEngine) {
      // TdThreeEngine fire effects
      if (this.activeFireId) {
        this.threeEngine.effects.stopFire(this.activeFireId);
      }
      this.activeFireId = this.threeEngine.effects.spawnFire(
        this.basePosition.lat,
        this.basePosition.lon,
        235,
        intensity
      );
    } else if (this.viewer) {
      // Cesium fire effects (fallback)
      FireRenderer.startFire(this.viewer, this.basePosition.lon, this.basePosition.lat, intensity);
    }
  }

  /**
   * Trigger game over
   */
  private triggerGameOver(): void {
    this.waveManager.phase.set('gameover');
    this.enemyManager.clear();

    if (this.basePosition) {
      if (this.tilesEngine) {
        // ThreeTilesEngine inferno
        if (this.activeFireId) {
          this.tilesEngine.effects.stopFire(this.activeFireId);
        }
        this.activeFireId = this.tilesEngine.effects.spawnFire(
          this.basePosition.lat,
          this.basePosition.lon,
          this.basePosition.height || 235,
          'inferno'
        );
      } else if (this.useThreeJs && this.threeEngine) {
        // TdThreeEngine inferno
        if (this.activeFireId) {
          this.threeEngine.effects.stopFire(this.activeFireId);
        }
        this.activeFireId = this.threeEngine.effects.spawnFire(
          this.basePosition.lat,
          this.basePosition.lon,
          235,
          'inferno'
        );
      } else if (this.viewer) {
        // Cesium inferno (fallback)
        FireRenderer.startFire(this.viewer, this.basePosition.lon, this.basePosition.lat, 'inferno');
      }
    }

    this.onGameOverCallback?.();

    setTimeout(() => {
      this.showGameOverScreen.set(true);
    }, 5000);
  }

  /**
   * Start a new wave with config (uses WaveManager auto-spawn)
   */
  startWave(config: WaveConfig): void {
    this.waveManager.startWave(config);
  }

  /**
   * Begin wave phase (without auto-spawning - for manual control)
   */
  beginWave(): void {
    this.waveManager.beginWave();
  }

  /**
   * Heal the base to full health and stop fire
   */
  healBase(): void {
    this.baseHealth.set(100);
    if (this.tilesEngine) {
      this.tilesEngine.effects.stopAllFires();
      this.activeFireId = null;
    } else if (this.useThreeJs && this.threeEngine) {
      this.threeEngine.effects.stopAllFires();
      this.activeFireId = null;
    } else if (this.viewer) {
      FireRenderer.stopFire(this.viewer);
    }
  }

  /**
   * Reset game state
   */
  reset(): void {
    // Clear all managers
    this.enemyManager.clear();
    this.towerManager.clear();
    this.projectileManager.clear();
    this.waveManager.reset();
    this.audioManager.stopAll();

    // Clear visual effects
    if (this.tilesEngine) {
      this.tilesEngine.effects.clear();
      this.activeFireId = null;
    } else if (this.useThreeJs && this.threeEngine) {
      this.threeEngine.effects.clear();
      this.activeFireId = null;
    } else if (this.viewer) {
      FireRenderer.stopFire(this.viewer);
      BloodRenderer.clearAllBloodStains(this.viewer);
    }

    // Reset game state
    this.baseHealth.set(100);
    this.credits.set(100);
    this.showGameOverScreen.set(false);
    this.lastUpdateTime = 0;

    // Reset ID counter
    GameObject.resetIdCounter();
  }

  // ============================================
  // Convenience methods (delegate to managers)
  // ============================================

  /**
   * Get all towers
   */
  towers(): Tower[] {
    return this.towerManager.getAll();
  }

  /**
   * Get all enemies
   */
  enemies(): Enemy[] {
    return this.enemyManager.getAll();
  }

  /**
   * Spawn an enemy (convenience method)
   */
  spawnEnemy(
    path: GeoPosition[],
    typeId: EnemyTypeId,
    speed?: number,
    paused = false
  ): Enemy {
    return this.enemyManager.spawn(path, typeId, speed, paused);
  }

  /**
   * Start all paused enemies with delay
   */
  startAllEnemies(delayBetween = 300): void {
    this.enemyManager.startAll(delayBetween);
  }

  /**
   * Select a tower
   */
  selectTower(id: string): void {
    this.towerManager.selectTower(id);
  }

  /**
   * Deselect all towers
   */
  deselectAll(): void {
    this.towerManager.selectTower(null);
  }

  /**
   * Place a new tower
   */
  placeTower(position: GeoPosition, typeId: TowerTypeId = 'archer'): Tower | null {
    return this.towerManager.placeTower(position, typeId);
  }

  /**
   * Kill an enemy
   */
  killEnemy(enemy: Enemy): void {
    this.enemyManager.kill(enemy);
  }

  /**
   * Check if wave is complete
   */
  checkWaveComplete(): boolean {
    return this.waveManager.checkWaveComplete();
  }

  /**
   * End current wave
   */
  endWave(): void {
    this.waveManager.endWave();
  }

  /**
   * Log debug message
   */
  debugLog(msg: string): void {
    this.onDebugLogCallback?.(msg);
  }
}
