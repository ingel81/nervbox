import * as Cesium from 'cesium';
import { GeoPosition, EnemyData } from './game.types';

export class Enemy implements EnemyData {
  readonly id: string;
  readonly path: GeoPosition[];
  readonly maxHp: number;
  // Speed in Meter pro Sekunde
  speedMps: number;

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

  // Vorberechnete Segmentlängen in Metern
  private segmentLengths: number[] = [];

  // Für Kompatibilität mit Debug-Output
  get speed(): number {
    return this.speedMps;
  }
  set speed(value: number) {
    this.speedMps = value;
  }

  private static idCounter = 0;

  constructor(
    path: GeoPosition[],
    entity: Cesium.Entity,
    healthBarEntity: Cesium.Entity,
    maxHp = 100,
    speedMps = 5 // 5 Meter pro Sekunde
  ) {
    this.id = `enemy-${++Enemy.idCounter}`;
    this.path = path;
    this.entity = entity;
    this.healthBarEntity = healthBarEntity;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.speedMps = speedMps;
    this.position = { ...path[0] };

    // Segmentlängen vorberechnen
    this.precomputeSegmentLengths();
  }

  private precomputeSegmentLengths(): void {
    for (let i = 0; i < this.path.length - 1; i++) {
      const dist = this.haversineDistance(
        this.path[i].lat,
        this.path[i].lon,
        this.path[i + 1].lat,
        this.path[i + 1].lon
      );
      this.segmentLengths.push(dist);
    }
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Erdradius in Metern
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  update(deltaTimeMs: number): 'moving' | 'reached_base' {
    if (!this.alive) return 'moving';

    // Cap deltaTime to prevent huge jumps after tab switch or lag
    const cappedDelta = Math.min(deltaTimeMs, 100);
    const deltaSeconds = cappedDelta / 1000;

    // Bewegung in Metern pro Frame
    const metersThisFrame = this.speedMps * deltaSeconds;

    // Aktuelle Segmentlänge
    const segmentLength = this.segmentLengths[this.currentIndex] || 1;

    // Progress basierend auf tatsächlicher Segmentlänge
    this.progress += metersThisFrame / segmentLength;

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
