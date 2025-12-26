import { Injectable, inject } from '@angular/core';
import * as Cesium from 'cesium';
import { EntityManager } from './entity-manager';
import { Enemy } from '../entities/enemy.entity';
import { EnemyTypeId } from '../models/enemy-types';
import { GeoPosition } from '../models/game.types';
import { EntityPoolService } from '../services/entity-pool.service';
import { ComponentType } from '../core/component';

/**
 * Manages all enemy entities
 */
@Injectable()
export class EnemyManager extends EntityManager<Enemy> {
  private entityPool = inject(EntityPoolService);
  private onEnemyReachedBase?: (enemy: Enemy) => void;

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

    if (paused) {
      enemy.movement.pause();
    }

    this.add(enemy);
    return enemy;
  }

  /**
   * Kill an enemy (play death animation, then remove)
   */
  kill(enemy: Enemy): void {
    if (!enemy.alive) return;

    enemy.health.takeDamage(enemy.health.hp);
    enemy.stopMoving();

    // Hide health bar
    const healthBarEntity = enemy.render.additionalEntities[0];
    if (healthBarEntity) {
      healthBarEntity.show = false;
    }

    // Remove after death animation (2 seconds)
    setTimeout(() => {
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
      const result = enemy.movement.move(deltaTime);
      if (result === 'reached_end') {
        this.onEnemyReachedBase?.(enemy);
        toRemove.push(enemy);
      }

      // Update visual position (will be done by renderer integration)
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
