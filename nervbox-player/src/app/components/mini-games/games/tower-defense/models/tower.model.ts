import * as Cesium from 'cesium';
import { GeoPosition, TowerConfig, TowerData, DistanceCalculator } from './game.types';

export class Tower implements TowerData {
  readonly id: string;
  readonly position: GeoPosition;
  readonly config: TowerConfig;

  entity: Cesium.Entity;
  rangeEntity: Cesium.Entity | null = null;
  lastFireTime = 0;
  selected = false;

  private static idCounter = 0;

  constructor(position: GeoPosition, entity: Cesium.Entity, config: Partial<TowerConfig> = {}) {
    this.id = `tower-${++Tower.idCounter}`;
    this.position = position;
    this.entity = entity;
    this.config = {
      range: config.range ?? 60,
      fireRate: config.fireRate ?? 1,
      damage: config.damage ?? 25,
      projectileSpeed: config.projectileSpeed ?? 100,
    };
  }

  canFire(currentTime: number): boolean {
    const fireInterval = 1000 / this.config.fireRate;
    return currentTime - this.lastFireTime >= fireInterval;
  }

  fire(currentTime: number): void {
    this.lastFireTime = currentTime;
  }

  select(): void {
    this.selected = true;
  }

  deselect(): void {
    this.selected = false;
  }

  isInRange(targetPosition: GeoPosition, distanceCalculator: DistanceCalculator): boolean {
    return distanceCalculator(this.position, targetPosition) <= this.config.range;
  }

  findTarget(
    enemies: { position: GeoPosition; id: string; alive: boolean }[],
    distanceCalculator: DistanceCalculator
  ): string | null {
    let closestId: string | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;

      const dist = distanceCalculator(this.position, enemy.position);
      if (dist <= this.config.range && dist < closestDist) {
        closestDist = dist;
        closestId = enemy.id;
      }
    }

    return closestId;
  }

  static resetIdCounter(): void {
    Tower.idCounter = 0;
  }
}
