import * as THREE from 'three';

// Game States
export type GameState = 'ready' | 'playing' | 'paused' | 'gameover' | 'won';

// Prey Types
export type PreyType = 'mouse' | 'rabbit' | 'smallBird' | 'pigeon';

export interface PreyConfig {
  type: PreyType;
  size: number;
  speed: number;
  points: number;
  flightHeight: number; // 0 for ground animals
  color: number;
}

export const PREY_CONFIGS: Record<PreyType, PreyConfig> = {
  mouse: {
    type: 'mouse',
    size: 0.3,
    speed: 2,
    points: 10,
    flightHeight: 0,
    color: 0x8b7355,
  },
  rabbit: {
    type: 'rabbit',
    size: 0.5,
    speed: 5,
    points: 25,
    flightHeight: 0,
    color: 0xd2b48c,
  },
  smallBird: {
    type: 'smallBird',
    size: 0.25,
    speed: 4,
    points: 15,
    flightHeight: 8,
    color: 0x4a90d9,
  },
  pigeon: {
    type: 'pigeon',
    size: 0.4,
    speed: 3,
    points: 20,
    flightHeight: 15,
    color: 0x808080,
  },
};

// Wave Configuration
export interface WaveConfig {
  level: number;
  preyToKill: number;
  mice: number;
  rabbits: number;
  birds: number;
  pigeons: number;
  hunters: number;
  hunterFireRate: number; // ms between shots
}

// Generate wave configs for levels
export function getWaveConfig(level: number): WaveConfig {
  const baseConfig: WaveConfig = {
    level,
    preyToKill: 5 + level * 3,
    mice: 30 + level * 10, // Many mice on ground
    rabbits: 20 + level * 5, // Many rabbits
    birds: 25 + level * 8, // Many flying birds
    pigeons: 15 + level * 5, // Many pigeons
    hunters: Math.max(3, Math.min(level + 2, 8)), // More hunters
    hunterFireRate: Math.max(1200, 2500 - level * 250), // Faster shooting
  };
  return baseConfig;
}

// Entity interfaces
export interface Entity {
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  update(deltaTime: number): void;
  dispose(): void;
}

export interface Prey extends Entity {
  type: PreyType;
  config: PreyConfig;
  isAlive: boolean;
  fleeFrom(position: THREE.Vector3): void;
}

export interface Hunter extends Entity {
  canShoot: boolean;
  lastShotTime: number;
  fireRate: number;
  targetPosition: THREE.Vector3;
  shoot(): Projectile | null;
}

export interface Projectile extends Entity {
  isActive: boolean;
  damage: number;
}

// Terrain constants
export const TERRAIN_SIZE = 200;
export const MOUNTAIN_HEIGHT = 40;
export const VALLEY_HEIGHT = 0;
export const MOUNTAIN_RADIUS = 60;

// Game constants
export const PLAYER_START_POSITION = new THREE.Vector3(0, MOUNTAIN_HEIGHT + 20, 50);
export const PLAYER_SPEED = 25;
export const PLAYER_DIVE_SPEED = 50;
export const CATCH_DISTANCE = 4; // Increased for easier catching
export const DAMAGE_DISTANCE = 3.5; // Increased for better hit detection
export const INVINCIBILITY_TIME = 2000; // ms after being hit

// Colors
export const COLORS = {
  sky: 0x87ceeb,
  grass: 0x228b22,
  vineyard: 0x6b8e23,
  forest: 0x2e5a27,
  mountain: 0x8b7355,
  cross: 0x8b4513,
  gold: 0xffd700,
  hunterJacket: 0x3b5323,
  hunterHat: 0x654321,
  bullet: 0x333333,
};

// Player Bird
export interface PlayerBird extends Entity {
  lives: number;
  isInvincible: boolean;
  isDiving: boolean;
  pitch: number;
  yaw: number;
  roll: number;
  takeDamage(): void;
  startDive(): void;
  endDive(): void;
}

// Callbacks
export interface EngineCallbacks {
  onScoreChange?: (score: number) => void;
  onLivesChange?: (lives: number) => void;
  onPreyCaught?: (preyType: PreyType, points: number) => void;
  onPlayerHit?: () => void;
  onLevelComplete?: () => void;
  onGameOver?: () => void;
  onWaveProgress?: (caught: number, required: number) => void;
}
