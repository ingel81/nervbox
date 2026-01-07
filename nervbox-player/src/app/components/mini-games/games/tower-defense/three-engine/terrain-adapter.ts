import * as THREE from 'three';
import * as Cesium from 'cesium';
import { CesiumThreeSync } from './cesium-three-sync';

/**
 * TerrainAdapter - Handles terrain height queries and terrain intersection
 *
 * Uses Cesium's terrain provider for height sampling and globe picking
 */
export class TerrainAdapter {
  private cesiumViewer: Cesium.Viewer;
  private sync: CesiumThreeSync;

  // Height cache to avoid repeated terrain queries for same positions
  private heightCache = new Map<string, number>();
  private readonly CACHE_PRECISION = 5; // Decimal places for cache key

  constructor(cesiumViewer: Cesium.Viewer, sync: CesiumThreeSync) {
    this.cesiumViewer = cesiumViewer;
    this.sync = sync;
  }

  /**
   * Get terrain height for a geo position (async, uses cache)
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @returns Height in meters (above WGS84 ellipsoid)
   */
  async getHeight(lat: number, lon: number): Promise<number> {
    const key = this.getCacheKey(lat, lon);

    if (this.heightCache.has(key)) {
      return this.heightCache.get(key)!;
    }

    const positions = [Cesium.Cartographic.fromDegrees(lon, lat)];

    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(
        this.cesiumViewer.terrainProvider,
        positions
      );
      const height = sampled[0].height ?? 0;
      this.heightCache.set(key, height);
      return height;
    } catch {
      // Fallback to 0 if terrain sampling fails
      return 0;
    }
  }

  /**
   * Get terrain height synchronously (from cache only)
   * Returns null if not in cache
   */
  getHeightSync(lat: number, lon: number): number | null {
    const key = this.getCacheKey(lat, lon);
    return this.heightCache.get(key) ?? null;
  }

  /**
   * Batch preload terrain heights for a path
   * More efficient than querying one at a time
   *
   * @param path - Array of {lat, lon} positions
   */
  async preloadHeightsForPath(path: { lat: number; lon: number }[]): Promise<void> {
    // Filter out positions already in cache
    const toQuery = path.filter((p) => !this.heightCache.has(this.getCacheKey(p.lat, p.lon)));

    if (toQuery.length === 0) return;

    const positions = toQuery.map((p) => Cesium.Cartographic.fromDegrees(p.lon, p.lat));

    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(
        this.cesiumViewer.terrainProvider,
        positions
      );

      sampled.forEach((s, i) => {
        const key = this.getCacheKey(toQuery[i].lat, toQuery[i].lon);
        this.heightCache.set(key, s.height ?? 0);
      });
    } catch (err) {
      console.warn('[TerrainAdapter] Failed to preload heights:', err);
    }
  }

  /**
   * Raycast against terrain at screen coordinates
   * Useful for tower placement, mouse picking
   *
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @returns Three.js Vector3 in local coordinates, or null if no hit
   */
  raycastTerrain(screenX: number, screenY: number): THREE.Vector3 | null {
    const ray = this.cesiumViewer.camera.getPickRay(new Cesium.Cartesian2(screenX, screenY));
    if (!ray) return null;

    const intersection = this.cesiumViewer.scene.globe.pick(ray, this.cesiumViewer.scene);
    if (!intersection) return null;

    const cartographic = Cesium.Cartographic.fromCartesian(intersection);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);

    // Cache the height we just found
    const key = this.getCacheKey(lat, lon);
    this.heightCache.set(key, cartographic.height);

    return this.sync.geoToLocal(lat, lon, cartographic.height);
  }

  /**
   * Get terrain height at a local Three.js position
   * Converts to geo, queries terrain, returns height
   *
   * @param localPos - Three.js Vector3 in local coordinates
   * @returns Height in meters (above WGS84 ellipsoid)
   */
  async getHeightAtLocal(localPos: THREE.Vector3): Promise<number> {
    const geo = this.sync.localToGeo(localPos);
    return this.getHeight(geo.lat, geo.lon);
  }

  /**
   * Clear the height cache
   * Call this when the game location changes
   */
  clearCache(): void {
    this.heightCache.clear();
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats(): { size: number } {
    return { size: this.heightCache.size };
  }

  /**
   * Generate cache key from lat/lon with fixed precision
   */
  private getCacheKey(lat: number, lon: number): string {
    return `${lat.toFixed(this.CACHE_PRECISION)}_${lon.toFixed(this.CACHE_PRECISION)}`;
  }
}
