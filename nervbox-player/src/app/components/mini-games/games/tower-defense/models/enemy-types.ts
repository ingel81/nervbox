/**
 * Enemy Type Configuration System
 *
 * Zentrale Registry für alle Enemy-Typen.
 * Neue Typen hier hinzufügen - keine Code-Änderungen an anderen Stellen nötig.
 */

export interface EnemyTypeConfig {
  id: string;
  name: string;
  modelUrl: string;
  scale: number;
  minimumPixelSize: number;

  // Stats
  baseHp: number;
  baseSpeed: number; // m/s
  damage: number; // Schaden an Basis
  reward: number; // Credits bei Kill

  // Animation
  hasAnimations: boolean;
  walkAnimation?: string;
  deathAnimation?: string;
  animationSpeed?: number;

  // Audio
  movingSound?: string; // Loop-Sound während Bewegung (Asset-Pfad)
  movingSoundVolume?: number; // 0.0 - 1.0

  // Visual
  heightOffset: number; // Model-Höhe über Boden
  healthBarOffset: number; // Health-Bar Höhe über Model
}

export const ENEMY_TYPES: Record<string, EnemyTypeConfig> = {
  zombie: {
    id: 'zombie',
    name: 'Zombie',
    modelUrl: '/assets/models/zombie_alternative.glb',
    scale: 2.0,
    minimumPixelSize: 0, // 0 = echte Größe, kein Pixel-Clamping beim Zoomen
    baseHp: 100,
    baseSpeed: 5,
    damage: 10,
    reward: 10,
    hasAnimations: true,
    walkAnimation: 'Armature|Walk',
    deathAnimation: 'Armature|Die',
    animationSpeed: 2.0,
    movingSound: '/assets/sounds/zombie-sound-2-357976.mp3',
    movingSoundVolume: 0.4,
    heightOffset: 0,
    healthBarOffset: 8, // Höher über dem Kopf
  },

  tank: {
    id: 'tank',
    name: 'Panzer',
    modelUrl: '/assets/models/tank.glb',
    scale: 2.5,
    minimumPixelSize: 0, // 0 = echte Größe, kein Pixel-Clamping
    baseHp: 300,
    baseSpeed: 3,
    damage: 25,
    reward: 30,
    hasAnimations: false,
    movingSound: '/assets/sounds/tank-moving-143104.mp3',
    movingSoundVolume: 0.3,
    heightOffset: 0,
    healthBarOffset: 10, // Höher über dem Panzer
  },
};

export type EnemyTypeId = keyof typeof ENEMY_TYPES;

export function getEnemyType(id: EnemyTypeId): EnemyTypeConfig {
  const type = ENEMY_TYPES[id];
  if (!type) {
    console.warn(`Unknown enemy type: ${id}, falling back to zombie`);
    return ENEMY_TYPES['zombie'];
  }
  return type;
}

export function getAllEnemyTypes(): EnemyTypeConfig[] {
  return Object.values(ENEMY_TYPES);
}

export function getEnemyTypeIds(): EnemyTypeId[] {
  return Object.keys(ENEMY_TYPES) as EnemyTypeId[];
}
