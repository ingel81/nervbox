import { Injectable, inject } from '@angular/core';
import { EntityManager } from './entity-manager';
import { Projectile } from '../entities/projectile.entity';
import { Tower } from '../entities/tower.entity';
import { Enemy } from '../entities/enemy.entity';
import { EntityPoolService } from '../services/entity-pool.service';
import { ThreeTilesEngine } from '../three-engine';

/**
 * Manages all projectile entities - spawning, updating, and collision
 */
@Injectable()
export class ProjectileManager extends EntityManager<Projectile> {
  private entityPool = inject(EntityPoolService);
  private onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void;
  private onProjectileFired?: () => void;

  /**
   * Initialize projectile manager with ThreeTilesEngine and callbacks
   */
  override initialize(
    tilesEngine: ThreeTilesEngine,
    onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void,
    onProjectileFired?: () => void
  ): void {
    super.initialize(tilesEngine);
    this.onProjectileHit = onProjectileHit;
    this.onProjectileFired = onProjectileFired;
  }

  /**
   * Spawn a new projectile from a tower to a target enemy
   */
  spawn(tower: Tower, targetEnemy: Enemy): Projectile {
    if (!this.tilesEngine) {
      throw new Error('ProjectileManager not initialized');
    }

    const projectile = new Projectile(
      tower.position,
      targetEnemy,
      tower.typeConfig.projectileType,
      tower.combat.damage
    );

    const terrainHeight = tower.position.height!;
    const heading = this.calculateHeading(tower.position, targetEnemy.position);

    this.tilesEngine.projectiles.create(
      projectile.id,
      projectile.typeConfig.id,
      tower.position.lat,
      tower.position.lon,
      terrainHeight + 5, // Spawn slightly above tower
      heading
    );

    this.add(projectile);
    this.onProjectileFired?.();

    return projectile;
  }

  /**
   * Update all projectiles - movement and collision detection
   */
  override update(deltaTime: number): void {
    const toRemove: Projectile[] = [];

    for (const projectile of this.getAllActive()) {
      const hit = projectile.updateTowardsTarget(deltaTime);

      if (hit) {
        this.onProjectileHit?.(projectile, projectile.targetEnemy);
        toRemove.push(projectile);
      } else if (!projectile.targetEnemy.alive) {
        // Target died, remove projectile
        toRemove.push(projectile);
      } else {
        // Update visual position
        const terrainHeight = projectile.position.height!;
        const heading = this.calculateHeading(projectile.position, projectile.targetEnemy.position);

        this.tilesEngine?.projectiles.update(
          projectile.id,
          projectile.position.lat,
          projectile.position.lon,
          terrainHeight,
          heading
        );
      }
    }

    toRemove.forEach((p) => this.remove(p));
  }

  /**
   * Calculate heading angle from one position to another
   */
  private calculateHeading(
    from: { lat: number; lon: number },
    to: { lat: number; lon: number }
  ): number {
    const dLon = to.lon - from.lon;
    const dLat = to.lat - from.lat;
    return Math.atan2(dLon, dLat);
  }

  /**
   * Remove projectile and cleanup resources
   */
  override remove(entity: Projectile): void {
    this.tilesEngine?.projectiles.remove(entity.id);
    super.remove(entity);
  }

  /**
   * Clear all projectiles and cleanup resources
   */
  override clear(): void {
    this.tilesEngine?.projectiles.clear();
    super.clear();
  }
}
