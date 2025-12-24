import { Injectable, signal, computed } from '@angular/core';
import * as Cesium from 'cesium';
import { Tower } from '../models/tower.model';
import { Enemy } from '../models/enemy.model';
import { Projectile } from '../models/projectile.model';
import { GeoPosition, GamePhase, DistanceCalculator } from '../models/game.types';
import { EntityPoolService } from './entity-pool.service';
import { TowerRenderer } from '../renderers/tower.renderer';
import { EnemyRenderer } from '../renderers/enemy.renderer';
import { BloodRenderer } from '../renderers/blood.renderer';

@Injectable()
export class GameStateService {
  readonly phase = signal<GamePhase>('setup');
  readonly waveNumber = signal(0);
  readonly baseHealth = signal(100);
  readonly credits = signal(100);

  private _towers = signal<Tower[]>([]);
  private _enemies = signal<Enemy[]>([]);
  private _projectiles = signal<Projectile[]>([]);

  readonly towers = this._towers.asReadonly();
  readonly enemies = this._enemies.asReadonly();
  readonly projectiles = this._projectiles.asReadonly();

  readonly selectedTowerId = signal<string | null>(null);
  readonly selectedTower = computed(() => {
    const id = this.selectedTowerId();
    return id ? this._towers().find((t) => t.id === id) ?? null : null;
  });

  readonly enemiesAlive = computed(() => this._enemies().filter((e) => e.alive).length);
  readonly towerCount = computed(() => this._towers().length);

  private viewer: Cesium.Viewer | null = null;
  private entityPool: EntityPoolService | null = null;
  private distanceCalculator: DistanceCalculator | null = null;
  private lastUpdateTime = 0;
  private onProjectileFired: (() => void) | null = null;
  private onDebugLog: ((message: string) => void) | null = null;

  initialize(
    viewer: Cesium.Viewer,
    entityPool: EntityPoolService,
    distanceCalculator: DistanceCalculator,
    onProjectileFired?: () => void,
    onDebugLog?: (message: string) => void
  ): void {
    this.viewer = viewer;
    this.entityPool = entityPool;
    this.distanceCalculator = distanceCalculator;
    this.onProjectileFired = onProjectileFired ?? null;
    this.onDebugLog = onDebugLog ?? null;
  }

  addTower(tower: Tower): void {
    this._towers.update((towers) => [...towers, tower]);
  }

  selectTower(towerId: string | null): void {
    const prevId = this.selectedTowerId();

    if (prevId && prevId !== towerId) {
      const prev = this._towers().find((t) => t.id === prevId);
      if (prev) {
        prev.deselect();
        TowerRenderer.updateSelectionState(prev.entity, prev.rangeEntity, false);
      }
    }

    this.selectedTowerId.set(towerId);

    if (towerId) {
      const tower = this._towers().find((t) => t.id === towerId);
      if (tower) {
        tower.select();
        TowerRenderer.updateSelectionState(tower.entity, tower.rangeEntity, true);
      }
    }

    this.viewer?.scene.requestRender();
  }

  deselectAll(): void {
    this.selectTower(null);
  }

  spawnEnemy(path: GeoPosition[], maxHp: number, speed: number): Enemy | null {
    if (!this.entityPool || !this.viewer) return null;

    const startPos = path[0];

    const healthBarEntity = this.entityPool.acquire('healthBar');
    if (!healthBarEntity) {
      return null;
    }

    // Reset health bar to full
    EnemyRenderer.updateHealthBar(healthBarEntity, 1.0);

    // Create enemy first with placeholder entity (will be positioned after terrain sample)
    const placeholderEntity = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(startPos.lon, startPos.lat, 0),
      point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT },
    });

    const enemy = new Enemy(path, placeholderEntity, healthBarEntity, maxHp, speed);

    // Sample terrain height and load model
    const terrainProvider = this.viewer.terrainProvider;
    const positions = [Cesium.Cartographic.fromDegrees(startPos.lon, startPos.lat)];

    Cesium.sampleTerrainMostDetailed(terrainProvider, positions).then((sampledPositions) => {
      if (!this.viewer) return;

      const terrainHeight = sampledPositions[0].height || 235;
      enemy.terrainHeight = terrainHeight; // Store for updates

      const position = Cesium.Cartesian3.fromDegrees(startPos.lon, startPos.lat, terrainHeight);
      (placeholderEntity.position as unknown) = position;
      (healthBarEntity.position as unknown) = Cesium.Cartesian3.fromDegrees(startPos.lon, startPos.lat, terrainHeight + 5);

      // Load model
      Cesium.Model.fromGltfAsync({
        url: '/assets/models/zombie_alternative.glb',
        scale: 2.0,
        minimumPixelSize: 64,
      }).then((model) => {
        if (!this.viewer) return;

        const hpr = new Cesium.HeadingPitchRoll(0, 0, 0);
        model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);

        this.viewer.scene.primitives.add(model);
        enemy.model = model;

        const checkReady = () => {
          if (model.ready) {
            model.activeAnimations.add({
              name: 'Armature|Walk',
              loop: Cesium.ModelAnimationLoop.REPEAT,
              multiplier: 2.0,
              startTime: Cesium.JulianDate.now(),
            });
          } else {
            requestAnimationFrame(checkReady);
          }
        };
        checkReady();
      });
    });

    // Enable clock for animation timing
    this.viewer.clock.shouldAnimate = true;

    this._enemies.update((enemies) => [...enemies, enemy]);
    return enemy;
  }

  removeEnemy(enemy: Enemy): void {
    // Remove model primitive
    if (this.viewer && enemy.model) {
      this.viewer.scene.primitives.remove(enemy.model);
    }
    // Remove placeholder entity
    if (this.viewer) {
      this.viewer.entities.remove(enemy.entity);
    }
    // Health bar is pooled
    this.entityPool?.release(enemy.healthBarEntity, 'healthBar');
    this._enemies.update((enemies) => enemies.filter((e) => e.id !== enemy.id));
  }

  killEnemy(enemy: Enemy): void {
    if (!enemy.alive) return;

    enemy.alive = false;
    this.credits.update((c) => c + 10);

    // Play death animation
    this.playEnemyDeathAnimation(enemy);
    enemy.healthBarEntity.show = false;

    // Remove after animation
    setTimeout(() => {
      this.removeEnemy(enemy);
    }, 2000);
  }

  private playEnemyDeathAnimation(enemy: Enemy): void {
    if (!enemy.model || !enemy.model.ready) {
      console.warn('[Animation] Model not ready for death animation');
      return;
    }

    console.log('[Animation] Playing Die animation');
    enemy.model.activeAnimations.removeAll();
    enemy.model.activeAnimations.add({
      name: 'Armature|Die',
      loop: Cesium.ModelAnimationLoop.NONE,
      multiplier: 1.0,
    });
  }

  private spawnProjectile(tower: Tower, targetEnemyId: string): Projectile | null {
    if (!this.entityPool) return null;

    const entity = this.entityPool.acquire('projectile');
    if (!entity) return null;

    const projectile = new Projectile(
      tower.position,
      targetEnemyId,
      entity,
      tower.config.damage,
      tower.config.projectileSpeed
    );

    (entity.position as unknown) = Cesium.Cartesian3.fromDegrees(
      tower.position.lon,
      tower.position.lat,
      2
    );

    this._projectiles.update((projectiles) => [...projectiles, projectile]);

    // Play projectile sound
    this.onProjectileFired?.();

    return projectile;
  }

  private removeProjectile(projectile: Projectile): void {
    if (!this.entityPool) return;

    this.entityPool.release(projectile.entity, 'projectile');
    this._projectiles.update((projectiles) => projectiles.filter((p) => p.id !== projectile.id));
  }

  update(currentTime: number): void {
    const deltaTime = this.lastUpdateTime ? currentTime - this.lastUpdateTime : 16;
    this.lastUpdateTime = currentTime;

    if (this.phase() !== 'wave') return;

    this.updateEnemies(deltaTime);
    this.updateTowerShooting(currentTime);
    this.updateProjectiles(deltaTime);
  }

  private updateEnemies(deltaTime: number): void {
    const enemiesToRemove: Enemy[] = [];

    for (const enemy of this._enemies()) {
      if (!enemy.alive) continue;

      const result = enemy.update(deltaTime);

      if (result === 'reached_base') {
        this.baseHealth.update((h) => Math.max(0, h - 10));
        enemy.alive = false;
        this.removeEnemy(enemy);
        continue;
      }

      // Calculate heading towards next waypoint
      // Cesium heading: 0 = North, PI/2 = East, PI = South, -PI/2 = West
      const nextIndex = Math.min(enemy.currentIndex + 1, enemy.path.length - 1);
      const nextPos = enemy.path[nextIndex];
      const dLon = nextPos.lon - enemy.position.lon;
      const dLat = nextPos.lat - enemy.position.lat;
      // Model faces -Y in local coords, so subtract PI/2 to align with movement direction
      const heading = Math.atan2(dLon, dLat) - Math.PI / 2;

      // Get terrain height from globe (more reliable than clampToHeight)
      let groundHeight = enemy.terrainHeight;
      if (this.viewer) {
        const cartographic = Cesium.Cartographic.fromDegrees(enemy.position.lon, enemy.position.lat);
        const terrainHeight = this.viewer.scene.globe.getHeight(cartographic);
        if (terrainHeight !== undefined) {
          groundHeight = terrainHeight;
          enemy.terrainHeight = groundHeight;
        }
      }

      // Detailliertes Logging für die ersten 2 Gegner
      if (this.onDebugLog && (enemy.id === 'enemy-1' || enemy.id === 'enemy-2')) {
        const timeStr = (performance.now() / 1000).toFixed(1).padStart(6, ' ');
        this.onDebugLog(
          `${timeStr}s [${enemy.id}] ` +
          `lat=${enemy.position.lat.toFixed(5)} lon=${enemy.position.lon.toFixed(5)} ` +
          `h=${groundHeight.toFixed(1)}m ` +
          `spd=${enemy.speed}m/s ` +
          `prog=${enemy.progress.toFixed(2)} ` +
          `seg=${enemy.currentIndex}/${enemy.path.length - 1}`
        );
      }

      const position = Cesium.Cartesian3.fromDegrees(enemy.position.lon, enemy.position.lat, groundHeight);

      // Update model primitive position and rotation
      if (enemy.model) {
        const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
        enemy.model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(position, hpr);
      }

      // Update placeholder entity position (for picking/targeting)
      (enemy.entity.position as unknown) = position;

      (enemy.healthBarEntity.position as unknown) = Cesium.Cartesian3.fromDegrees(
        enemy.position.lon,
        enemy.position.lat,
        groundHeight + 5
      );
    }

    enemiesToRemove.forEach((e) => this.removeEnemy(e));

    if (this.baseHealth() <= 0) {
      this.phase.set('gameover');
    }
  }

  private updateTowerShooting(currentTime: number): void {
    if (!this.distanceCalculator) return;

    for (const tower of this._towers()) {
      if (!tower.canFire(currentTime)) continue;

      const targetId = tower.findTarget(
        this._enemies().map((e) => ({ position: e.position, id: e.id, alive: e.alive })),
        this.distanceCalculator
      );

      if (targetId) {
        tower.fire(currentTime);
        this.spawnProjectile(tower, targetId);
      }
    }
  }

  private updateProjectiles(deltaTime: number): void {
    if (!this.distanceCalculator) return;

    const projectilesToRemove: Projectile[] = [];

    for (const projectile of this._projectiles()) {
      if (!projectile.active) {
        projectilesToRemove.push(projectile);
        continue;
      }

      const targetEnemy = this._enemies().find(
        (e) => e.id === projectile.targetEnemyId && e.alive
      );
      const targetPosition = targetEnemy?.position ?? null;

      const hit = projectile.update(targetPosition, deltaTime, this.distanceCalculator);

      if (hit && targetEnemy) {
        // Spawn blood effects
        if (this.viewer) {
          BloodRenderer.spawnBloodSplatter(
            this.viewer,
            targetEnemy.position.lon,
            targetEnemy.position.lat,
            targetEnemy.terrainHeight + 1
          );
          BloodRenderer.spawnBloodStain(
            this.viewer,
            targetEnemy.position.lon,
            targetEnemy.position.lat,
            targetEnemy.terrainHeight
          );
        }

        const killed = targetEnemy.takeDamage(projectile.damage);
        if (killed) {
          this.credits.update((c) => c + 10);
          // Play death animation on model
          this.playEnemyDeathAnimation(targetEnemy);
          targetEnemy.healthBarEntity.show = false;
          setTimeout(() => {
            this.removeEnemy(targetEnemy);
          }, 2000); // Death animation duration
        } else {
          EnemyRenderer.updateHealthBar(targetEnemy.healthBarEntity, targetEnemy.getHealthPercent());
        }
        projectile.deactivate();
        projectilesToRemove.push(projectile);
      } else if (!targetPosition) {
        projectile.deactivate();
        projectilesToRemove.push(projectile);
      }

      (projectile.entity.position as unknown) = Cesium.Cartesian3.fromDegrees(
        projectile.position.lon,
        projectile.position.lat,
        2
      );
    }

    projectilesToRemove.forEach((p) => this.removeProjectile(p));
  }

  startWave(): void {
    this.waveNumber.update((n) => n + 1);
    this.phase.set('wave');
  }

  endWave(): void {
    // Remove all remaining enemies
    this.clearAllEnemies();
    this.phase.set('setup');
    this.credits.update((c) => c + 50);
  }

  private clearAllEnemies(): void {
    const enemies = this._enemies();
    for (const enemy of enemies) {
      // Remove model primitive
      if (this.viewer && enemy.model) {
        this.viewer.scene.primitives.remove(enemy.model);
      }
      // Remove placeholder entity
      if (this.viewer) {
        this.viewer.entities.remove(enemy.entity);
      }
      this.entityPool?.release(enemy.healthBarEntity, 'healthBar');
    }
    this._enemies.set([]);
  }

  checkWaveComplete(): boolean {
    return this.enemiesAlive() === 0 && this.phase() === 'wave';
  }

  reset(): void {
    this._enemies().forEach((e) => this.removeEnemy(e));
    this._projectiles().forEach((p) => this.removeProjectile(p));

    this._towers().forEach((t) => {
      if (this.viewer) {
        this.viewer.entities.remove(t.entity);
        if (t.rangeEntity) this.viewer.entities.remove(t.rangeEntity);
      }
    });

    // Clear blood stains
    if (this.viewer) {
      BloodRenderer.clearAllBloodStains(this.viewer);
    }

    this._towers.set([]);
    this._enemies.set([]);
    this._projectiles.set([]);

    Tower.resetIdCounter();
    Enemy.resetIdCounter();
    Projectile.resetIdCounter();

    this.phase.set('setup');
    this.waveNumber.set(0);
    this.baseHealth.set(100);
    this.credits.set(100);
    this.selectedTowerId.set(null);
  }
}
