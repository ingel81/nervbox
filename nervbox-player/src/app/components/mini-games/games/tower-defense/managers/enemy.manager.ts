import { Injectable, inject } from '@angular/core';
import { EntityManager } from './entity-manager';
import { Enemy } from '../entities/enemy.entity';
import { EnemyTypeId } from '../models/enemy-types';
import { GeoPosition } from '../models/game.types';
import { EntityPoolService } from '../services/entity-pool.service';
import { ThreeTilesEngine } from '../three-engine';

/**
 * Manages all enemy entities - spawning, updating, and lifecycle
 */
@Injectable()
export class EnemyManager extends EntityManager<Enemy> {
  private entityPool = inject(EntityPoolService);
  private onEnemyReachedBase?: (enemy: Enemy) => void;

  // Track enemies being killed to prevent double-kill
  private killingEnemies = new Set<string>();

  /**
   * Initialize enemy manager with ThreeTilesEngine
   */
  override initialize(
    tilesEngine: ThreeTilesEngine,
    onEnemyReachedBase?: (enemy: Enemy) => void
  ): void {
    super.initialize(tilesEngine);
    this.onEnemyReachedBase = onEnemyReachedBase;
  }

  /**
   * Spawn a new enemy at the start of a path
   */
  spawn(
    path: GeoPosition[],
    typeId: EnemyTypeId,
    speedOverride?: number,
    paused = false
  ): Enemy {
    if (!this.tilesEngine) {
      throw new Error('EnemyManager not initialized');
    }

    const enemy = new Enemy(typeId, path, speedOverride);

    // Apply random lateral offset for movement variety
    if (enemy.typeConfig.lateralOffset && enemy.typeConfig.lateralOffset > 0) {
      const maxOffset = enemy.typeConfig.lateralOffset;
      const randomOffset = (Math.random() * 2 - 1) * maxOffset;
      enemy.movement.setLateralOffset(randomOffset);
    }

    // Initialize rendering
    const startPos = path[0];
    if (startPos.height === undefined) {
      console.error('[EnemyManager] Path has no height data! startPos:', startPos);
    }

    const terrainHeight = startPos.height!;
    enemy.transform.terrainHeight = terrainHeight;

    // Create 3D model and start animation
    this.tilesEngine.enemies
      .create(enemy.id, typeId, startPos.lat, startPos.lon, terrainHeight)
      .then((renderData) => {
        if (renderData && !paused) {
          this.tilesEngine!.enemies.startWalkAnimation(enemy.id);
        }
      });

    if (paused) {
      enemy.movement.pause();
    }

    this.add(enemy);
    return enemy;
  }

  /**
   * Kill an enemy - plays death animation then removes
   */
  kill(enemy: Enemy): void {
    // Prevent double-kill
    if (this.killingEnemies.has(enemy.id)) return;
    this.killingEnemies.add(enemy.id);

    // Ensure enemy is marked as dead
    if (enemy.alive) {
      enemy.health.takeDamage(enemy.health.hp);
    }
    enemy.stopMoving();

    // Play death animation
    this.tilesEngine?.enemies.playDeathAnimation(enemy.id);

    // Remove after death animation completes
    setTimeout(() => {
      this.killingEnemies.delete(enemy.id);
      this.remove(enemy);
    }, 2000);
  }

  /**
   * Update all enemies - movement and rendering
   */
  override update(deltaTime: number): void {
    const toRemove: Enemy[] = [];

    for (const enemy of this.getAllActive()) {
      if (!enemy.alive) continue;

      // Update components
      enemy.update(deltaTime);

      // Move enemy along path
      const moveResult = enemy.movement.move(deltaTime);
      if (moveResult === 'reached_end') {
        this.onEnemyReachedBase?.(enemy);
        toRemove.push(enemy);
        continue;
      }

      // Update visual representation
      this.tilesEngine?.enemies.update(
        enemy.id,
        enemy.position.lat,
        enemy.position.lon,
        enemy.transform.terrainHeight,
        enemy.transform.rotation,
        enemy.health.healthPercent
      );
    }

    toRemove.forEach((e) => this.remove(e));
  }

  /**
   * Start all paused enemies with configurable delay between each
   */
  startAll(defaultDelayBetween = 300): void {
    const paused = this.getAll().filter((e) => e.movement.paused);

    let accumulatedDelay = 0;
    paused.forEach((enemy) => {
      const delay = enemy.typeConfig.spawnStartDelay ?? defaultDelayBetween;
      setTimeout(() => {
        if (enemy.alive) {
          enemy.startMoving();
          this.tilesEngine?.enemies.startWalkAnimation(enemy.id);
        }
      }, accumulatedDelay);
      accumulatedDelay += delay;
    });
  }

  /**
   * Remove enemy and cleanup resources
   */
  override remove(entity: Enemy): void {
    this.tilesEngine?.enemies.remove(entity.id);
    super.remove(entity);
  }

  /**
   * Clear all enemies and cleanup resources
   */
  override clear(): void {
    this.tilesEngine?.enemies.clear();
    this.killingEnemies.clear();
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
