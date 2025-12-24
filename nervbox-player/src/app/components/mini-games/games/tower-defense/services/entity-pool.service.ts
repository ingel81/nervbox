import { Injectable } from '@angular/core';
import * as Cesium from 'cesium';
import { EnemyRenderer } from '../renderers/enemy.renderer';
import { ProjectileRenderer } from '../renderers/projectile.renderer';

interface PooledEntity {
  entity: Cesium.Entity;
  inUse: boolean;
}

export type EntityType = 'enemy' | 'healthBar' | 'projectile';

@Injectable()
export class EntityPoolService {
  private enemyPool: PooledEntity[] = [];
  private healthBarPool: PooledEntity[] = [];
  private projectilePool: PooledEntity[] = [];

  private viewer: Cesium.Viewer | null = null;

  initialize(viewer: Cesium.Viewer): void {
    this.viewer = viewer;
    // Don't prewarm enemies - 3D models need fresh creation
    this.prewarm('healthBar', 10);
    this.prewarm('projectile', 20);
  }

  private prewarm(type: EntityType, count: number): void {
    if (!this.viewer) return;

    for (let i = 0; i < count; i++) {
      const entity = this.createEntity(type);
      if (entity) {
        entity.show = false;
        this.getPool(type).push({ entity, inUse: false });
      }
    }
  }

  private getPool(type: EntityType): PooledEntity[] {
    switch (type) {
      case 'enemy':
        return this.enemyPool;
      case 'healthBar':
        return this.healthBarPool;
      case 'projectile':
        return this.projectilePool;
    }
  }

  private createEntity(type: EntityType): Cesium.Entity | null {
    if (!this.viewer) return null;

    switch (type) {
      case 'enemy':
        // 3D Zombie Modell - Animation wird separat gesteuert
        console.log('Creating enemy entity with model');
        return this.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
          model: {
            uri: '/assets/models/enemy_zombie.glb',
            scale: 5.0,
            minimumPixelSize: 128,
          },
          // Debug: Add a point to see position
          point: {
            pixelSize: 20,
            color: Cesium.Color.RED,
          },
        });

      case 'healthBar': {
        const canvas = EnemyRenderer.createHealthBarCanvas(1);
        return this.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
          billboard: {
            image: canvas,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            scale: 1.0,
            pixelOffset: new Cesium.Cartesian2(0, -60),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          show: false,
        });
      }

      case 'projectile': {
        const canvas = ProjectileRenderer.createProjectileCanvas();
        return this.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
          billboard: {
            image: canvas,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            scale: 0.6,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          show: false,
        });
      }
    }
  }

  acquire(type: EntityType): Cesium.Entity | null {
    const pool = this.getPool(type);

    const available = pool.find((p) => !p.inUse);
    if (available) {
      available.inUse = true;
      available.entity.show = true;
      return available.entity;
    }

    const entity = this.createEntity(type);
    if (entity) {
      entity.show = true;
      pool.push({ entity, inUse: true });
      return entity;
    }

    return null;
  }

  release(entity: Cesium.Entity, type: EntityType): void {
    const pool = this.getPool(type);
    const pooled = pool.find((p) => p.entity === entity);

    if (pooled) {
      pooled.inUse = false;
      pooled.entity.show = false;
    }
  }

  releaseAll(): void {
    [...this.enemyPool, ...this.healthBarPool, ...this.projectilePool].forEach((p) => {
      p.inUse = false;
      p.entity.show = false;
    });
  }

  destroy(): void {
    if (!this.viewer) return;

    [...this.enemyPool, ...this.healthBarPool, ...this.projectilePool].forEach((p) => {
      this.viewer?.entities.remove(p.entity);
    });

    this.enemyPool = [];
    this.healthBarPool = [];
    this.projectilePool = [];
  }

  getStats(): { enemies: number; healthBars: number; projectiles: number } {
    return {
      enemies: this.enemyPool.filter((p) => p.inUse).length,
      healthBars: this.healthBarPool.filter((p) => p.inUse).length,
      projectiles: this.projectilePool.filter((p) => p.inUse).length,
    };
  }

  playAnimation(entity: Cesium.Entity, animationName: string, loop: boolean = true): void {
    if (!this.viewer) return;

    // Try multiple ways to access the model primitive
    const tryPlayAnimation = () => {
      // Method 1: Direct _modelPrimitive access
      let model = (entity as { _modelPrimitive?: Cesium.Model })._modelPrimitive;
      let method = '_modelPrimitive';

      // Method 2: Try _model property
      if (!model) {
        model = (entity as { _model?: Cesium.Model })._model;
        method = '_model';
      }

      // Method 3: Search in scene primitives by entity ID
      if (!model && this.viewer) {
        const primitives = this.viewer.scene.primitives;
        for (let i = 0; i < primitives.length; i++) {
          const primitive = primitives.get(i);
          if (primitive instanceof Cesium.Model && (primitive as { id?: Cesium.Entity }).id === entity) {
            model = primitive;
            method = 'primitives search';
            break;
          }
        }
      }

      if (model && model.ready) {
        try {
          console.log(`[Animation] Playing "${animationName}" via ${method}`);
          model.activeAnimations.removeAll();
          model.activeAnimations.add({
            name: animationName,
            loop: loop ? Cesium.ModelAnimationLoop.REPEAT : Cesium.ModelAnimationLoop.NONE,
            multiplier: 1.0,
          });
          return true;
        } catch (e) {
          console.warn('[Animation] Failed to play:', animationName, e);
          return false;
        }
      }
      return false;
    };

    // Try immediately
    if (!tryPlayAnimation()) {
      // Retry after renders
      let attempts = 0;
      const maxAttempts = 60; // More attempts
      const removeListener = this.viewer.scene.postRender.addEventListener(() => {
        attempts++;
        if (tryPlayAnimation()) {
          console.log(`[Animation] Success after ${attempts} attempts`);
          removeListener();
        } else if (attempts >= maxAttempts) {
          console.warn(`[Animation] Failed after ${maxAttempts} attempts for "${animationName}"`);
          removeListener();
        }
      });
    }
  }

  playWalkAnimation(entity: Cesium.Entity): void {
    this.playAnimation(entity, 'Armature|Walk', true);
  }

  playDeathAnimation(entity: Cesium.Entity): void {
    // Stop walk animation and play death animation
    this.playAnimation(entity, 'Armature|Die', false);

    // Fallback: Scale down effect after delay (in case death animation doesn't work)
    if (entity.model) {
      // Wait 1.5s for death animation, then scale down
      setTimeout(() => {
        if (!entity.show) return;

        const startTime = performance.now();
        const duration = 500;
        const startScale = 2.0;

        const animateScale = () => {
          if (!entity.show) return;

          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const scale = startScale * (1 - eased);
          (entity.model!.scale as unknown) = Math.max(0.1, scale);

          if (progress < 1) {
            requestAnimationFrame(animateScale);
          } else {
            entity.show = false;
          }
        };

        requestAnimationFrame(animateScale);
      }, 1500); // Wait for death animation to play first
    }
  }
}
