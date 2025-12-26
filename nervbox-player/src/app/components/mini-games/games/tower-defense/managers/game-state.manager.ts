import { Injectable, inject, signal } from '@angular/core';
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

/**
 * Main game state orchestrator - coordinates all managers
 */
@Injectable()
export class GameStateManager {
  // Managers
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

  private viewer: Cesium.Viewer | null = null;
  private lastUpdateTime = 0;
  private basePosition: GeoPosition | null = null;
  private onGameOverCallback?: () => void;

  /**
   * Initialize game state and all managers
   */
  initialize(
    viewer: Cesium.Viewer,
    streetNetwork: StreetNetwork,
    basePosition: GeoPosition,
    spawnPoints: SpawnPoint[],
    cachedPaths: Map<string, GeoPosition[]>,
    onGameOver?: () => void
  ): void {
    this.viewer = viewer;
    this.basePosition = basePosition;
    this.onGameOverCallback = onGameOver;

    // Initialize all managers
    this.renderManager.initialize(viewer);
    this.audioManager.initialize(viewer);

    this.enemyManager.initialize(viewer, (enemy) => this.onEnemyReachedBase(enemy));
    this.towerManager.initializeWithContext(
      viewer,
      streetNetwork,
      basePosition,
      spawnPoints.map((s) => ({ lat: s.latitude, lon: s.longitude }))
    );
    this.projectileManager.initialize(
      viewer,
      (proj, enemy) => this.onProjectileHit(proj, enemy),
      () => this.audioManager.play('projectile-fire', 0.3)
    );
    this.waveManager.initialize(spawnPoints, cachedPaths);

    // Register sounds
    this.audioManager.registerSound(
      'projectile-fire',
      '/assets/sounds/projectile-fire.mp3'
    );
    this.audioManager.registerSound(
      'base-damage',
      '/assets/sounds/impactful-damage-425132.mp3'
    );
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
    if (!this.viewer) return;

    // Spawn blood effects
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

    const killed = enemy.health.takeDamage(projectile.damage);
    if (killed) {
      this.enemyManager.kill(enemy);
      this.credits.update((c) => c + 10);
    }
    // Health bar update will be handled by renderer integration
  }

  /**
   * Update fire intensity based on base health
   */
  private updateFireIntensity(): void {
    if (!this.basePosition || !this.viewer) return;

    const health = this.baseHealth();
    let intensity: FireIntensity;

    if (health < 20) intensity = 'large';
    else if (health < 40) intensity = 'medium';
    else if (health < 60) intensity = 'small';
    else intensity = 'tiny';

    FireRenderer.startFire(this.viewer, this.basePosition.lon, this.basePosition.lat, intensity);
  }

  /**
   * Trigger game over
   */
  private triggerGameOver(): void {
    this.waveManager.phase.set('gameover');
    this.enemyManager.clear();

    if (this.basePosition && this.viewer) {
      FireRenderer.startFire(this.viewer, this.basePosition.lon, this.basePosition.lat, 'inferno');
    }

    this.onGameOverCallback?.();

    setTimeout(() => {
      this.showGameOverScreen.set(true);
    }, 5000);
  }

  /**
   * Start a new wave
   */
  startWave(config: WaveConfig): void {
    this.waveManager.startWave(config);
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
    if (this.viewer) {
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
}
