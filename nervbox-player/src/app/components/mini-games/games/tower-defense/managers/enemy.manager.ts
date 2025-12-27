import { Injectable, inject } from '@angular/core';
import * as Cesium from 'cesium';
import { EntityManager } from './entity-manager';
import { Enemy } from '../entities/enemy.entity';
import { EnemyTypeId } from '../models/enemy-types';
import { GeoPosition } from '../models/game.types';
import { EntityPoolService } from '../services/entity-pool.service';
import { EnemyRenderer, EnemyRenderConfig } from '../renderers/enemy.renderer';

/**
 * Manages all enemy entities
 */
@Injectable()
export class EnemyManager extends EntityManager<Enemy> {
  private entityPool = inject(EntityPoolService);
  private onEnemyReachedBase?: (enemy: Enemy) => void;
  private renderer = new EnemyRenderer();

  override initialize(viewer: Cesium.Viewer, onEnemyReachedBase?: (enemy: Enemy) => void): void {
    super.initialize(viewer);
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

    // Initialize rendering
    const startPos = path[0];
    const terrainHeight = startPos.height ?? 235;
    enemy.transform.terrainHeight = terrainHeight;

    const renderConfig: EnemyRenderConfig = {
      position: startPos,
      terrainHeight,
      typeConfig: enemy.typeConfig,
    };

    // Create Cesium entities via renderer
    enemy.render.initialize(this.viewer, this.renderer, renderConfig);

    // Start walk animation when model is ready (unless paused)
    if (!paused) {
      this.waitForModelAndStartAnimation(enemy);
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

    // Play death animation (use result reference for async model)
    const result = enemy.render.result;
    console.log('[EnemyManager] result:', !!result, 'model:', !!result?.model);
    if (result) {
      this.renderer.playDeathAnimation(result, enemy.typeConfig);
    }

    // Hide health bar
    const healthBarEntity = enemy.render.additionalEntities[0];
    if (healthBarEntity) {
      healthBarEntity.show = false;
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

      // Calculate heading towards next waypoint
      const nextWaypoint = enemy.movement.getNextWaypoint();
      let heading = 0;
      if (nextWaypoint) {
        const dLon = nextWaypoint.lon - enemy.position.lon;
        const dLat = nextWaypoint.lat - enemy.position.lat;
        heading = Math.atan2(dLon, dLat) - Math.PI / 2;
      }

      // Update visual representation (use result reference for async model)
      const renderResult = enemy.render.result;
      if (renderResult) {
        this.renderer.update(renderResult, {
          position: enemy.position,
          terrainHeight: enemy.transform.terrainHeight,
          heading,
          healthPercent: enemy.health.healthPercent,
          healthBarOffset: enemy.typeConfig.healthBarOffset,
        });
      }
    }

    toRemove.forEach((e) => this.remove(e));
  }

  /**
   * Start all paused enemies with delay
   */
  startAll(delayBetween = 300): void {
    const paused = this.getAll().filter((e) => e.movement.paused);

    paused.forEach((enemy, index) => {
      setTimeout(() => {
        if (enemy.alive) {
          enemy.startMoving();
          // Start walk animation
          this.waitForModelAndStartAnimation(enemy);
        }
      }, index * delayBetween);
    });
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
