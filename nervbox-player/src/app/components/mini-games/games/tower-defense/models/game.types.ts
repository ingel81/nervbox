import * as Cesium from 'cesium';

export interface GeoPosition {
  lat: number;
  lon: number;
  height?: number; // Terrain height (optional, sampled async)
}

export interface TowerConfig {
  range: number;
  fireRate: number;
  damage: number;
  projectileSpeed: number;
}

export interface EnemyConfig {
  maxHp: number;
  speed: number;
  reward: number;
}

export interface TowerData {
  id: string;
  position: GeoPosition;
  config: TowerConfig;
  entity: Cesium.Entity;
  rangeEntity: Cesium.Entity | null;
  lastFireTime: number;
  selected: boolean;
}

export interface EnemyData {
  id: string;
  position: GeoPosition;
  path: GeoPosition[];
  currentIndex: number;
  progress: number;
  hp: number;
  maxHp: number;
  speed: number;
  entity: Cesium.Entity;
  healthBarEntity: Cesium.Entity;
  alive: boolean;
}

export interface ProjectileData {
  id: string;
  position: GeoPosition;
  targetEnemyId: string;
  damage: number;
  speed: number;
  entity: Cesium.Entity;
  active: boolean;
}

export type GamePhase = 'setup' | 'wave' | 'paused' | 'gameover' | 'victory';

export interface WaveConfig {
  enemyCount: number;
  enemyHp: number;
  enemySpeed: number;
  spawnDelay: number;
}

export type DistanceCalculator = (p1: GeoPosition, p2: GeoPosition) => number;
