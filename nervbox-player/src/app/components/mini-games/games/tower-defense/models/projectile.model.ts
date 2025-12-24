import * as Cesium from 'cesium';
import { GeoPosition, ProjectileData, DistanceCalculator } from './game.types';

export class Projectile implements ProjectileData {
  readonly id: string;
  readonly targetEnemyId: string;
  readonly damage: number;
  readonly speed: number;

  position: GeoPosition;
  entity: Cesium.Entity;
  active = true;

  private static idCounter = 0;

  constructor(
    startPosition: GeoPosition,
    targetEnemyId: string,
    entity: Cesium.Entity,
    damage = 25,
    speed = 100
  ) {
    this.id = `projectile-${++Projectile.idCounter}`;
    this.position = { ...startPosition };
    this.targetEnemyId = targetEnemyId;
    this.entity = entity;
    this.damage = damage;
    this.speed = speed;
  }

  update(
    targetPosition: GeoPosition | null,
    deltaTimeMs: number,
    distanceCalculator: DistanceCalculator
  ): boolean {
    if (!this.active || !targetPosition) {
      this.active = false;
      return false;
    }

    const distToTarget = distanceCalculator(this.position, targetPosition);
    const moveDistance = (this.speed * deltaTimeMs) / 1000;

    if (distToTarget <= moveDistance) {
      this.position = { ...targetPosition };
      return true;
    }

    const ratio = moveDistance / distToTarget;
    this.position = {
      lat: this.position.lat + (targetPosition.lat - this.position.lat) * ratio,
      lon: this.position.lon + (targetPosition.lon - this.position.lon) * ratio,
    };

    return false;
  }

  deactivate(): void {
    this.active = false;
  }

  static resetIdCounter(): void {
    Projectile.idCounter = 0;
  }
}
