import { ProjectileTypeId } from './tower-types.config';

// Re-export ProjectileTypeId for convenience
export type { ProjectileTypeId } from './tower-types.config';

export type ProjectileVisualType = 'arrow' | 'cannonball' | 'magic';

export interface ProjectileTypeConfig {
  id: ProjectileTypeId;
  speed: number; // m/s
  visualType: ProjectileVisualType;
  scale: number;
}

export const PROJECTILE_TYPES: Record<ProjectileTypeId, ProjectileTypeConfig> = {
  arrow: {
    id: 'arrow',
    speed: 100, // m/s
    visualType: 'arrow',
    scale: 0.5,
  },
  cannonball: {
    id: 'cannonball',
    speed: 60, // m/s (slower, heavier)
    visualType: 'cannonball',
    scale: 0.8,
  },
  fireball: {
    id: 'fireball',
    speed: 120, // m/s (fast magic)
    visualType: 'magic',
    scale: 0.6,
  },
  'ice-shard': {
    id: 'ice-shard',
    speed: 110,
    visualType: 'magic',
    scale: 0.5,
  },
};

export function getProjectileType(id: ProjectileTypeId): ProjectileTypeConfig {
  return PROJECTILE_TYPES[id];
}

export function getAllProjectileTypes(): ProjectileTypeConfig[] {
  return Object.values(PROJECTILE_TYPES);
}
