import * as Cesium from 'cesium';
import { GeoPosition, EnemyData } from './game.types';

export class Enemy implements EnemyData {
  readonly id: string;
  readonly path: GeoPosition[];
  readonly maxHp: number;
  speed: number;

  position: GeoPosition;
  currentIndex = 0;
  progress = 0;
  hp: number;
  entity: Cesium.Entity;
  healthBarEntity: Cesium.Entity;
  alive = true;

  // Model primitive for animation control
  model: Cesium.Model | null = null;

  // Terrain height at spawn position
  terrainHeight = 235;

  private static idCounter = 0;

  constructor(
    path: GeoPosition[],
    entity: Cesium.Entity,
    healthBarEntity: Cesium.Entity,
    maxHp = 100,
    speed = 0.02
  ) {
    this.id = `enemy-${++Enemy.idCounter}`;
    this.path = path;
    this.entity = entity;
    this.healthBarEntity = healthBarEntity;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.speed = speed;
    this.position = { ...path[0] };
  }

  update(deltaTimeMs: number): 'moving' | 'reached_base' {
    if (!this.alive) return 'moving';

    // Cap deltaTime to prevent huge jumps after tab switch or lag
    const cappedDelta = Math.min(deltaTimeMs, 100);
    // Speed is now per second, so divide by 1000
    this.progress += this.speed * (cappedDelta / 1000) * 60;

    // Handle segment transitions, keeping overflow for smooth movement
    while (this.progress >= 1) {
      this.progress -= 1; // Keep the overflow
      this.currentIndex++;

      if (this.currentIndex >= this.path.length - 1) {
        return 'reached_base';
      }
    }

    const current = this.path[this.currentIndex];
    const next = this.path[this.currentIndex + 1];

    if (current && next) {
      this.position = {
        lat: current.lat + (next.lat - current.lat) * this.progress,
        lon: current.lon + (next.lon - current.lon) * this.progress,
      };
    }

    return 'moving';
  }

  takeDamage(amount: number): boolean {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  getHealthPercent(): number {
    return this.hp / this.maxHp;
  }

  static resetIdCounter(): void {
    Enemy.idCounter = 0;
  }
}
