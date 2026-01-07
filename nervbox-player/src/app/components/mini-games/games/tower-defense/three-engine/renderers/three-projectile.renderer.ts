import * as THREE from 'three';
import { CesiumThreeSync } from '../cesium-three-sync';
import { InstancedEntityManager } from '../instanced-entity-manager';
import {
  ProjectileTypeId,
  ProjectileVisualType,
  PROJECTILE_TYPES,
} from '../../configs/projectile-types.config';

/**
 * Projectile render data
 */
export interface ProjectileRenderData {
  id: string;
  visualType: ProjectileVisualType;
}

/**
 * ThreeProjectileRenderer - Renders projectiles using GPU instancing
 *
 * Uses InstancedMesh for maximum performance with many projectiles.
 * Different visual types (arrow, cannonball, magic) use separate instanced meshes.
 */
export class ThreeProjectileRenderer {
  private scene: THREE.Scene;
  private sync: CesiumThreeSync;

  // Instanced managers per visual type
  private arrowManager: InstancedEntityManager<ProjectileRenderData>;
  private cannonballManager: InstancedEntityManager<ProjectileRenderData>;
  private magicManager: InstancedEntityManager<ProjectileRenderData>;

  // Track which manager owns each projectile
  private projectileTypes = new Map<string, ProjectileVisualType>();

  // Trail particles for magic projectiles (optional future enhancement)
  // private trailParticles: THREE.Points | null = null;

  constructor(scene: THREE.Scene, sync: CesiumThreeSync) {
    this.scene = scene;
    this.sync = sync;

    // Create instanced managers for each visual type
    this.arrowManager = this.createArrowManager();
    this.cannonballManager = this.createCannonballManager();
    this.magicManager = this.createMagicManager();

    // Add meshes to scene
    scene.add(this.arrowManager.instancedMesh);
    scene.add(this.cannonballManager.instancedMesh);
    scene.add(this.magicManager.instancedMesh);
  }

  /**
   * Create instanced manager for arrows
   */
  private createArrowManager(): InstancedEntityManager<ProjectileRenderData> {
    // Arrow: Elongated cone pointing forward
    const geometry = new THREE.ConeGeometry(0.15, 1.5, 8);
    geometry.rotateX(Math.PI / 2); // Point forward (along Z)

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b4513, // Brown (wood)
      metalness: 0.3,
      roughness: 0.7,
    });

    return new InstancedEntityManager(geometry, material, 500);
  }

  /**
   * Create instanced manager for cannonballs
   */
  private createCannonballManager(): InstancedEntityManager<ProjectileRenderData> {
    // Cannonball: Sphere
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);

    const material = new THREE.MeshStandardMaterial({
      color: 0x333333, // Dark gray (iron)
      metalness: 0.8,
      roughness: 0.3,
    });

    return new InstancedEntityManager(geometry, material, 200);
  }

  /**
   * Create instanced manager for magic projectiles
   */
  private createMagicManager(): InstancedEntityManager<ProjectileRenderData> {
    // Magic: Glowing sphere
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);

    const material = new THREE.MeshStandardMaterial({
      color: 0xff6600, // Orange (fire)
      emissive: 0xff3300,
      emissiveIntensity: 2.0,
      metalness: 0.0,
      roughness: 0.0,
    });

    return new InstancedEntityManager(geometry, material, 500);
  }

  /**
   * Get manager for a visual type
   */
  private getManager(
    visualType: ProjectileVisualType
  ): InstancedEntityManager<ProjectileRenderData> {
    switch (visualType) {
      case 'arrow':
        return this.arrowManager;
      case 'cannonball':
        return this.cannonballManager;
      case 'magic':
        return this.magicManager;
    }
  }

  /**
   * Create a new projectile
   *
   * @param id - Unique projectile ID
   * @param typeId - Projectile type (arrow, cannonball, fireball, ice-shard)
   * @param startLat - Start latitude
   * @param startLon - Start longitude
   * @param startHeight - Start height
   * @param heading - Direction heading in radians
   * @param pitch - Elevation angle in radians (optional)
   */
  create(
    id: string,
    typeId: ProjectileTypeId,
    startLat: number,
    startLon: number,
    startHeight: number,
    heading: number,
    pitch: number = 0
  ): void {
    const config = PROJECTILE_TYPES[typeId];
    if (!config) {
      console.error(`[ThreeProjectileRenderer] Unknown type: ${typeId}`);
      return;
    }

    const visualType = config.visualType;
    const manager = this.getManager(visualType);

    const renderData: ProjectileRenderData = { id, visualType };
    const localPos = this.sync.geoToLocal(startLat, startLon, startHeight);

    // Rotation: heading for Y axis, pitch for X axis
    const rotation = new THREE.Euler(-pitch, heading, 0, 'YXZ');
    const scale = new THREE.Vector3(config.scale, config.scale, config.scale);

    manager.add(renderData, localPos, rotation, scale);
    this.projectileTypes.set(id, visualType);
  }

  /**
   * Update projectile position and rotation
   */
  update(
    id: string,
    lat: number,
    lon: number,
    height: number,
    heading: number,
    pitch: number = 0
  ): void {
    const visualType = this.projectileTypes.get(id);
    if (!visualType) return;

    const manager = this.getManager(visualType);
    const localPos = this.sync.geoToLocal(lat, lon, height);
    const rotation = new THREE.Euler(-pitch, heading, 0, 'YXZ');

    manager.update(id, localPos, rotation);
  }

  /**
   * Remove projectile
   */
  remove(id: string): void {
    const visualType = this.projectileTypes.get(id);
    if (!visualType) return;

    const manager = this.getManager(visualType);
    manager.remove(id);
    this.projectileTypes.delete(id);
  }

  /**
   * Commit all changes to GPU
   * Call at end of frame
   */
  commitToGPU(): void {
    this.arrowManager.commitToGPU();
    this.cannonballManager.commitToGPU();
    this.magicManager.commitToGPU();
  }

  /**
   * Get projectile count
   */
  get count(): number {
    return (
      this.arrowManager.count +
      this.cannonballManager.count +
      this.magicManager.count
    );
  }

  /**
   * Clear all projectiles
   */
  clear(): void {
    this.arrowManager.clear();
    this.cannonballManager.clear();
    this.magicManager.clear();
    this.projectileTypes.clear();
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.scene.remove(this.arrowManager.instancedMesh);
    this.scene.remove(this.cannonballManager.instancedMesh);
    this.scene.remove(this.magicManager.instancedMesh);

    this.arrowManager.dispose();
    this.cannonballManager.dispose();
    this.magicManager.dispose();
    this.projectileTypes.clear();
  }
}
