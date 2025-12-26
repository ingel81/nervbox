export type TowerTypeId = 'archer' | 'cannon' | 'magic' | 'sniper';
export type ProjectileTypeId = 'arrow' | 'cannonball' | 'fireball' | 'ice-shard';

export interface TowerTypeConfig {
  id: TowerTypeId;
  name: string;
  modelUrl: string;
  scale: number;

  damage: number;
  range: number;
  fireRate: number; // Shots per second
  projectileType: ProjectileTypeId;

  cost: number;
}

export const TOWER_TYPES: Record<TowerTypeId, TowerTypeConfig> = {
  archer: {
    id: 'archer',
    name: 'Archer Tower',
    modelUrl: '/assets/models/tower_archer.glb',
    scale: 1.8,
    damage: 25,
    range: 60,
    fireRate: 1, // 1 shot/sec
    projectileType: 'arrow',
    cost: 100,
  },
  cannon: {
    id: 'cannon',
    name: 'Cannon Tower',
    modelUrl: '/assets/models/tower_cannon.glb',
    scale: 2.0,
    damage: 75,
    range: 80,
    fireRate: 0.5, // 0.5 shots/sec (slower)
    projectileType: 'cannonball',
    cost: 200,
  },
  magic: {
    id: 'magic',
    name: 'Magic Tower',
    modelUrl: '/assets/models/tower_magic.glb',
    scale: 1.5,
    damage: 40,
    range: 70,
    fireRate: 1.5, // 1.5 shots/sec (faster)
    projectileType: 'fireball',
    cost: 150,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Tower',
    modelUrl: '/assets/models/tower_sniper.glb',
    scale: 1.6,
    damage: 150,
    range: 120,
    fireRate: 0.3, // Very slow but powerful
    projectileType: 'arrow',
    cost: 300,
  },
};

export function getTowerType(id: TowerTypeId): TowerTypeConfig {
  return TOWER_TYPES[id];
}

export function getAllTowerTypes(): TowerTypeConfig[] {
  return Object.values(TOWER_TYPES);
}
