import * as THREE from 'three';
import { CoordinateSync } from './index';
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
 * Simple instanced entity manager for projectiles
 */
class ProjectileInstanceManager {
  readonly instancedMesh: THREE.InstancedMesh;
  private entities = new Map<string, number>(); // id -> instanceIndex
  private freeIndices: number[] = [];
  private activeCount = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxCount: number
  ) {
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, maxCount);
    this.instancedMesh.count = 0;
    this.instancedMesh.frustumCulled = false;
  }

  add(
    id: string,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3
  ): void {
    if (this.entities.has(id)) return;

    let index: number;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop()!;
    } else {
      index = this.activeCount;
    }

    this.entities.set(id, index);
    this.activeCount = Math.max(this.activeCount, index + 1);
    this.instancedMesh.count = this.activeCount;

    this.matrix.compose(
      position,
      new THREE.Quaternion().setFromEuler(rotation),
      scale
    );
    this.instancedMesh.setMatrixAt(index, this.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  update(id: string, position: THREE.Vector3, rotation: THREE.Euler): void {
    const index = this.entities.get(id);
    if (index === undefined) return;

    this.instancedMesh.getMatrixAt(index, this.matrix);
    const scale = new THREE.Vector3();
    this.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);

    this.matrix.compose(
      position,
      new THREE.Quaternion().setFromEuler(rotation),
      scale
    );
    this.instancedMesh.setMatrixAt(index, this.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  remove(id: string): void {
    const index = this.entities.get(id);
    if (index === undefined) return;

    // Move to infinity (hide)
    this.matrix.makeTranslation(0, -10000, 0);
    this.instancedMesh.setMatrixAt(index, this.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.entities.delete(id);
    this.freeIndices.push(index);
  }

  get count(): number {
    return this.entities.size;
  }

  clear(): void {
    for (const id of this.entities.keys()) {
      this.remove(id);
    }
    this.entities.clear();
    this.freeIndices = [];
    this.activeCount = 0;
    this.instancedMesh.count = 0;
  }

  dispose(): void {
    this.clear();
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
  }
}

/**
 * ThreeProjectileRenderer - Renders projectiles using GPU instancing
 */
export class ThreeProjectileRenderer {
  private scene: THREE.Scene;
  private sync: CoordinateSync;

  // Instanced managers per visual type
  private arrowManager: ProjectileInstanceManager;
  private cannonballManager: ProjectileInstanceManager;
  private magicManager: ProjectileInstanceManager;

  // Track which manager owns each projectile
  private projectileTypes = new Map<string, ProjectileVisualType>();

  constructor(scene: THREE.Scene, sync: CoordinateSync) {
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

  private createArrowManager(): ProjectileInstanceManager {
    const geometry = new THREE.ConeGeometry(0.15, 1.5, 8);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      metalness: 0.3,
      roughness: 0.7,
    });

    return new ProjectileInstanceManager(geometry, material, 500);
  }

  private createCannonballManager(): ProjectileInstanceManager {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);

    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.3,
    });

    return new ProjectileInstanceManager(geometry, material, 200);
  }

  private createMagicManager(): ProjectileInstanceManager {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);

    const material = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff3300,
      emissiveIntensity: 2.0,
      metalness: 0.0,
      roughness: 0.0,
    });

    return new ProjectileInstanceManager(geometry, material, 500);
  }

  private getManager(visualType: ProjectileVisualType): ProjectileInstanceManager {
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

    const localPos = this.sync.geoToLocal(startLat, startLon, startHeight);
    const rotation = new THREE.Euler(-pitch, heading, 0, 'YXZ');
    const scale = new THREE.Vector3(config.scale, config.scale, config.scale);

    manager.add(id, localPos, rotation, scale);
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

  get count(): number {
    return (
      this.arrowManager.count +
      this.cannonballManager.count +
      this.magicManager.count
    );
  }

  /**
   * Commit all changes to GPU (no-op in simplified implementation)
   */
  commitToGPU(): void {
    // Instance matrix updates are done automatically in add/update/remove
  }

  clear(): void {
    this.arrowManager.clear();
    this.cannonballManager.clear();
    this.magicManager.clear();
    this.projectileTypes.clear();
  }

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
