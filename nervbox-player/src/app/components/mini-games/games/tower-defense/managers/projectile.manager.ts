import { Injectable, inject } from '@angular/core';
import * as Cesium from 'cesium';
import { EntityManager } from './entity-manager';
import { Projectile } from '../entities/projectile.entity';
import { Tower } from '../entities/tower.entity';
import { Enemy } from '../entities/enemy.entity';
import { EntityPoolService } from '../services/entity-pool.service';
import { ProjectileRenderer, ProjectileRenderConfig } from '../renderers/projectile.renderer';

/**
 * Manages all projectile entities
 */
@Injectable()
export class ProjectileManager extends EntityManager<Projectile> {
  private entityPool = inject(EntityPoolService);
  private renderer = new ProjectileRenderer();
  private onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void;
  private onProjectileFired?: () => void;

  override initialize(
    viewer: Cesium.Viewer,
    onProjectileHit?: (projectile: Projectile, enemy: Enemy) => void,
    onProjectileFired?: () => void
  ): void {
    super.initialize(viewer);
    this.onProjectileHit = onProjectileHit;
    this.onProjectileFired = onProjectileFired;
  }

  /**
   * Spawn a new projectile from a tower to a target
   */
  spawn(tower: Tower, targetEnemy: Enemy): Projectile {
    if (!this.viewer) {
      throw new Error('ProjectileManager not initialized');
    }

    const projectile = new Projectile(
      tower.position,
      targetEnemy,
      tower.typeConfig.projectileType,
      tower.combat.damage
    );

    // Initialize rendering
    const renderConfig: ProjectileRenderConfig = {
      position: tower.position,
      typeConfig: projectile.typeConfig,
    };
    projectile.render.initialize(this.viewer, this.renderer, renderConfig);

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
        // Update visual position (use result reference)
        const result = projectile.render.result;
        if (result) {
          this.renderer.update(result, { position: projectile.position });
        }
      }
    }

    toRemove.forEach((p) => this.remove(p));
  }
}
