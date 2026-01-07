import { Injectable, inject } from '@angular/core';
import * as Cesium from 'cesium';
import { EntityManager } from './entity-manager';
import { Enemy } from '../entities/enemy.entity';
import { EnemyTypeId } from '../models/enemy-types';
import { GeoPosition } from '../models/game.types';
import { EntityPoolService } from '../services/entity-pool.service';
import { EnemyRenderer, EnemyRenderConfig } from '../renderers/enemy.renderer';
import { TdThreeEngine } from '../three-engine';

/**
 * Manages all enemy entities
 */
@Injectable()
export class EnemyManager extends EntityManager<Enemy> {
  private entityPool = inject(EntityPoolService);
  private onEnemyReachedBase?: (enemy: Enemy) => void;
  private renderer = new EnemyRenderer();

  // Track Three.js render IDs for each enemy
  private threeRenderIds = new Map<string, string>();

  /**
   * Initialize enemy manager with callbacks and optional Three.js engine
   */
  initializeWithCallbacks(
    viewer: Cesium.Viewer,
    onEnemyReachedBase?: (enemy: Enemy) => void,
    threeEngine?: TdThreeEngine
  ): void {
    super.initialize(viewer, threeEngine);
    this.onEnemyReachedBase = onEnemyReachedBase;
  }

  /**
   * Spawn a new enemy
   */
  spawn(
    path: GeoPosition[],
    typeId: EnemyTypeId,
    speedOverride?: number,
    paused = false
  ): Enemy {
    if (!this.viewer) {
      throw new Error('EnemyManager not initialized');
    }

    const enemy = new Enemy(typeId, path, speedOverride);
    enemy.setViewer(this.viewer);

    // Apply random lateral offset for movement variety
    if (enemy.typeConfig.lateralOffset && enemy.typeConfig.lateralOffset > 0) {
      const maxOffset = enemy.typeConfig.lateralOffset;
      const randomOffset = (Math.random() * 2 - 1) * maxOffset; // -maxOffset to +maxOffset
      enemy.movement.setLateralOffset(randomOffset);
    }

    // Initialize rendering
    const startPos = path[0];
    if (startPos.height === undefined) {
      console.error('[EnemyManager] Path has no height data! startPos:', startPos);
    }
    const terrainHeight = startPos.height!;
    enemy.transform.terrainHeight = terrainHeight;
    console.log(`[EnemyManager] Spawning enemy at height ${terrainHeight}m`);

    if (this.useThreeJs && this.threeEngine) {
      // Three.js rendering
      this.threeEngine.enemies
        .create(enemy.id, typeId, startPos.lat, startPos.lon, terrainHeight)
        .then((renderData) => {
          if (renderData && !paused) {
            this.threeEngine!.enemies.startWalkAnimation(enemy.id);
          }
        });
      this.threeRenderIds.set(enemy.id, enemy.id);
    } else {
      // Cesium rendering (fallback)
      const renderConfig: EnemyRenderConfig = {
        position: startPos,
        terrainHeight,
        typeConfig: enemy.typeConfig,
      };
      enemy.render.initialize(this.viewer, this.renderer, renderConfig);

      // Start walk animation when model is ready (unless paused)
      if (!paused) {
        this.waitForModelAndStartAnimation(enemy);
      }
    }

    if (paused) {
      enemy.movement.pause();
    }

    this.add(enemy);
    return enemy;
  }

  /**
   * Wait for model to load and start walk animation
   */
  private waitForModelAndStartAnimation(enemy: Enemy): void {
    const result = enemy.render.result;
    if (!result) return;

    const checkModel = () => {
      // Check via result reference (handles async model loading)
      if (result.model?.ready) {
        this.renderer.startWalkAnimation(result, enemy.typeConfig);
      } else if (result.model) {
        // Model exists but not ready yet
        result.model.readyEvent.addEventListener(() => {
          this.renderer.startWalkAnimation(result, enemy.typeConfig);
        });
      } else {
        // Model not loaded yet, check again
        setTimeout(checkModel, 50);
      }
    };
    setTimeout(checkModel, 100);
  }

  // Track enemies being killed to prevent double-kill
  private killingEnemies = new Set<string>();

  /**
   * Kill an enemy (play death animation, then remove)
   */
  kill(enemy: Enemy): void {
    // Prevent double-kill (enemy might already be dead from takeDamage)
    if (this.killingEnemies.has(enemy.id)) return;
    this.killingEnemies.add(enemy.id);

    console.log('[EnemyManager] kill() called for', enemy.id, 'alive:', enemy.alive);

    // Ensure enemy is marked as dead
    if (enemy.alive) {
      enemy.health.takeDamage(enemy.health.hp);
    }
    enemy.stopMoving();

    if (this.useThreeJs && this.threeEngine) {
      // Three.js: Play death animation
      this.threeEngine.enemies.playDeathAnimation(enemy.id);
    } else {
      // Cesium: Play death animation
      const result = enemy.render.result;
      console.log('[EnemyManager] result:', !!result, 'model:', !!result?.model);
      if (result) {
        this.renderer.playDeathAnimation(result, enemy.typeConfig);
      }

      // Hide health bar (Cesium only)
      const healthBarEntity = enemy.render.additionalEntities[0];
      if (healthBarEntity) {
        healthBarEntity.show = false;
      }
    }

    // Remove after death animation (2 seconds)
    setTimeout(() => {
      console.log('[EnemyManager] Removing enemy after death animation:', enemy.id);
      this.killingEnemies.delete(enemy.id);
      this.remove(enemy);
    }, 2000);
  }

  /**
   * Update all enemies
   */
  override update(deltaTime: number): void {
    const toRemove: Enemy[] = [];

    for (const enemy of this.getAllActive()) {
      if (!enemy.alive) continue;

      // Update components
      enemy.update(deltaTime);

      // Move enemy
      const moveResult = enemy.movement.move(deltaTime);
      if (moveResult === 'reached_end') {
        this.onEnemyReachedBase?.(enemy);
        toRemove.push(enemy);
        continue;
      }

      // Update visual representation
      if (this.useThreeJs && this.threeEngine) {
        // Three.js rendering
        this.threeEngine.enemies.update(
          enemy.id,
          enemy.position.lat,
          enemy.position.lon,
          enemy.transform.terrainHeight,
          enemy.transform.rotation,
          enemy.health.healthPercent
        );
      } else {
        // Cesium rendering (fallback)
        const renderResult = enemy.render.result;
        if (renderResult) {
          this.renderer.update(renderResult, {
            position: enemy.position,
            terrainHeight: enemy.transform.terrainHeight,
            heading: enemy.transform.rotation,
            healthPercent: enemy.health.healthPercent,
            healthBarOffset: enemy.typeConfig.healthBarOffset,
          });
        }
      }
    }

    toRemove.forEach((e) => this.remove(e));
  }

  /**
   * Start all paused enemies with delay
   * Uses spawnStartDelay from enemy type config if available
   */
  startAll(defaultDelayBetween = 300): void {
    const paused = this.getAll().filter((e) => e.movement.paused);

    let accumulatedDelay = 0;
    paused.forEach((enemy) => {
      const delay = enemy.typeConfig.spawnStartDelay ?? defaultDelayBetween;
      setTimeout(() => {
        if (enemy.alive) {
          enemy.startMoving();
          // Start walk animation
          if (this.useThreeJs && this.threeEngine) {
            this.threeEngine.enemies.startWalkAnimation(enemy.id);
          } else {
            this.waitForModelAndStartAnimation(enemy);
          }
        }
      }, accumulatedDelay);
      accumulatedDelay += delay;
    });
  }

  /**
   * Override remove to cleanup Three.js resources
   */
  override remove(entity: Enemy): void {
    if (this.useThreeJs && this.threeEngine) {
      this.threeEngine.enemies.remove(entity.id);
      this.threeRenderIds.delete(entity.id);
    }
    super.remove(entity);
  }

  /**
   * Override clear to cleanup all Three.js resources
   */
  override clear(): void {
    if (this.useThreeJs && this.threeEngine) {
      this.threeEngine.enemies.clear();
      this.threeRenderIds.clear();
    }
    super.clear();
  }

  /**
   * Get all alive enemies
   */
  getAlive(): Enemy[] {
    return this.getAll().filter((e) => e.alive);
  }

  /**
   * Get count of alive enemies
   */
  getAliveCount(): number {
    return this.getAlive().length;
  }
}
