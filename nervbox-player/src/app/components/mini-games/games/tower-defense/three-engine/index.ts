// New 3DTilesRendererJS-based engine (replaces Cesium)
export { ThreeTilesEngine } from './three-tiles-engine';
export { EllipsoidSync } from './ellipsoid-sync';

// Legacy exports (deprecated - to be removed)
export { TdThreeEngine } from './td-three-engine';
export { CesiumThreeSync } from './cesium-three-sync';
export { TerrainAdapter } from './terrain-adapter';
export { InstancedEntityManager, ColoredInstancedEntityManager } from './instanced-entity-manager';

// Renderers
export {
  ThreeEnemyRenderer,
  ThreeTowerRenderer,
  ThreeProjectileRenderer,
  ThreeEffectsRenderer,
  type EnemyRenderData,
  type TowerRenderData,
  type ProjectileRenderData,
} from './renderers';
