import { Injectable, inject } from '@angular/core';
import * as Cesium from 'cesium';
import { EntityManager } from './entity-manager';
import { Projectile } from '../entities/projectile.entity';
import { Tower } from '../entities/tower.entity';
import { Enemy } from '../entities/enemy.entity';
import { EntityPoolService } from '../services/entity-pool.service';
import { ProjectileRenderer, ProjectileRenderConfig } from '../renderers/projectile.renderer';
import { TdThreeEngine, ThreeTilesEngine } from '../three-engine';

/**
 * Manages all projectile entities
 */
@Injectable()
export class ProjectileManager extends EntityManager<Projectile> {
  private entityPool = inject(EntityPoolService);
  private renderer = new ProjectileRenderer();
  private onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void;
  private onProjectileFired?: () => void;

  /**
   * Initialize projectile manager with callbacks and optional Three.js engine
   */
  initializeWithCallbacks(
    viewer: Cesium.Viewer,
    onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void,
    onProjectileFired?: () => void,
    threeEngine?: TdThreeEngine
  ): void {
    super.initialize(viewer, threeEngine);
    this.onProjectileHit = onProjectileHit;
    this.onProjectileFired = onProjectileFired;
  }

  /**
   * Initialize with ThreeTilesEngine (no Cesium viewer)
   */
  initializeWithTilesEngine(
    tilesEngine: ThreeTilesEngine,
    onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void,
    onProjectileFired?: () => void
  ): void {
    super.initializeTilesEngine(tilesEngine);
    this.onProjectileHit = onProjectileHit;
    this.onProjectileFired = onProjectileFired;
  }

  /**
   * Spawn a new projectile from a tower to a target
   */
  spawn(tower: Tower, targetEnemy: Enemy): Projectile {
    if (!this.viewer && !this.tilesEngine) {
      throw new Error('ProjectileManager not initialized');
    }

    const projectile = new Projectile(
      tower.position,
      targetEnemy,
      tower.typeConfig.projectileType,
      tower.combat.damage
    );

    if (this.tilesEngine) {
      // ThreeTilesEngine rendering
      const terrainHeight = tower.position.height!;
      const heading = this.calculateHeading(tower.position, targetEnemy.position);
      this.tilesEngine.projectiles.create(
        projectile.id,
        projectile.typeConfig.id,
        tower.position.lat,
        tower.position.lon,
        terrainHeight + 5,
        heading
      );
    } else if (this.useThreeJs && this.threeEngine) {
      // TdThreeEngine rendering
      const terrainHeight = tower.position.height!;
      const heading = this.calculateHeading(tower.position, targetEnemy.position);
      this.threeEngine.projectiles.create(
        projectile.id,
        projectile.typeConfig.id,
        tower.position.lat,
        tower.position.lon,
        terrainHeight + 5,
        heading
      );
    } else if (this.viewer) {
      // Cesium rendering (fallback)
      const renderConfig: ProjectileRenderConfig = {
        position: tower.position,
        typeConfig: projectile.typeConfig,
      };
      projectile.render.initialize(this.viewer, this.renderer, renderConfig);
    }

    this.add(projectile);

    // Play projectile fire sound
    this.onProjectileFired?.();

    return projectile;
  }

  /**
   * Update all projectiles
   */
  override update(deltaTime: number): void {
    const toRemove: Projectile[] = [];

    for (const projectile of this.getAllActive()) {
      const hit = projectile.updateTowardsTarget(deltaTime);

      if (hit) {
        // Notify hit
        this.onProjectileHit?.(projectile, projectile.targetEnemy);
        toRemove.push(projectile);
      } else if (!projectile.targetEnemy.alive) {
        // Target died, remove projectile
        toRemove.push(projectile);
      } else {
        // Update visual position
        if (this.tilesEngine) {
          // ThreeTilesEngine projectile update
          const terrainHeight = projectile.position.height!;
          const heading = this.calculateHeading(projectile.position, projectile.targetEnemy.position);
          this.tilesEngine.projectiles.update(
            projectile.id,
            projectile.position.lat,
            projectile.position.lon,
            terrainHeight,
            heading
          );
        } else if (this.useThreeJs && this.threeEngine) {
          // TdThreeEngine projectile update
          const terrainHeight = projectile.position.height!;
          const heading = this.calculateHeading(projectile.position, projectile.targetEnemy.position);
          this.threeEngine.projectiles.update(
            projectile.id,
            projectile.position.lat,
            projectile.position.lon,
            terrainHeight,
            heading
          );
        } else {
          const result = projectile.render.result;
          if (result) {
            this.renderer.update(result, { position: projectile.position });
          }
        }
      }
    }

    toRemove.forEach((p) => this.remove(p));
  }

  /**
   * Calculate heading from one position to another
   */
  private calculateHeading(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
    const dLon = to.lon - from.lon;
    const dLat = to.lat - from.lat;
    // North = 0, East = PI/2
    return Math.atan2(dLon, dLat);
  }

  /**
   * Override remove to cleanup Three.js resources
   */
  override remove(entity: Projectile): void {
    if (this.tilesEngine) {
      this.tilesEngine.projectiles.remove(entity.id);
    } else if (this.useThreeJs && this.threeEngine) {
      this.threeEngine.projectiles.remove(entity.id);
    }
    super.remove(entity);
  }

  /**
   * Override clear to cleanup all Three.js resources
   */
  override clear(): void {
    if (this.tilesEngine) {
      this.tilesEngine.projectiles.clear();
    } else if (this.useThreeJs && this.threeEngine) {
      this.threeEngine.projectiles.clear();
    }
    super.clear();
  }
}
