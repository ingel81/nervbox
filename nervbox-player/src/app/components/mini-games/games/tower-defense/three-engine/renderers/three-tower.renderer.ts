import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CesiumThreeSync } from '../cesium-three-sync';
import { TowerTypeConfig, TOWER_TYPES, TowerTypeId } from '../../configs/tower-types.config';

/**
 * Tower render data - stored per tower
 */
export interface TowerRenderData {
  id: string;
  mesh: THREE.Object3D;
  rangeIndicator: THREE.Mesh | null;
  selectionRing: THREE.Mesh | null;
  typeConfig: TowerTypeConfig;
  isSelected: boolean;
}

/**
 * ThreeTowerRenderer - Renders towers using Three.js
 *
 * Features:
 * - GLB model loading with caching
 * - Range indicator (circle on ground)
 * - Selection highlight ring
 */
export class ThreeTowerRenderer {
  private scene: THREE.Scene;
  private sync: CesiumThreeSync;
  private loader: GLTFLoader;

  // Cached model templates per tower type
  private modelTemplates = new Map<string, GLTF>();
  private loadingPromises = new Map<string, Promise<GLTF>>();

  // Active tower renders
  private towers = new Map<string, TowerRenderData>();

  // Shared materials
  private rangeMaterial: THREE.MeshBasicMaterial;
  private selectionMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, sync: CesiumThreeSync) {
    this.scene = scene;
    this.sync = sync;
    this.loader = new GLTFLoader();

    // Range indicator material (semi-transparent green)
    this.rangeMaterial = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Selection ring material (purple glow)
    this.selectionMaterial = new THREE.MeshBasicMaterial({
      color: 0x9333ea,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  /**
   * Preload model template for a tower type
   */
  async preloadModel(typeId: TowerTypeId): Promise<void> {
    const config = TOWER_TYPES[typeId];
    if (!config) return;

    if (this.modelTemplates.has(typeId) || this.loadingPromises.has(typeId)) {
      return;
    }

    const promise = this.loader.loadAsync(config.modelUrl);
    this.loadingPromises.set(typeId, promise);

    try {
      const gltf = await promise;
      this.modelTemplates.set(typeId, gltf);
      console.log(`[ThreeTowerRenderer] Preloaded model: ${typeId}`);
    } catch (err) {
      console.error(`[ThreeTowerRenderer] Failed to load model: ${typeId}`, err);
    } finally {
      this.loadingPromises.delete(typeId);
    }
  }

  /**
   * Preload all tower type models
   */
  async preloadAllModels(): Promise<void> {
    const types = Object.keys(TOWER_TYPES) as TowerTypeId[];
    await Promise.all(types.map((t) => this.preloadModel(t)));
  }

  /**
   * Create tower render - spawns mesh in scene
   */
  async create(
    id: string,
    typeId: TowerTypeId,
    lat: number,
    lon: number,
    height: number
  ): Promise<TowerRenderData | null> {
    const config = TOWER_TYPES[typeId];
    if (!config) {
      console.error(`[ThreeTowerRenderer] Unknown tower type: ${typeId}`);
      return null;
    }

    // Ensure model is loaded
    let gltf = this.modelTemplates.get(typeId);
    if (!gltf) {
      const promise = this.loadingPromises.get(typeId) || this.loader.loadAsync(config.modelUrl);
      if (!this.loadingPromises.has(typeId)) {
        this.loadingPromises.set(typeId, promise);
      }
      try {
        gltf = await promise;
        this.modelTemplates.set(typeId, gltf);
      } catch (err) {
        console.error(`[ThreeTowerRenderer] Failed to load model: ${typeId}`, err);
        return null;
      } finally {
        this.loadingPromises.delete(typeId);
      }
    }

    // Clone the model
    const mesh = gltf.scene.clone();
    mesh.scale.setScalar(config.scale);

    // Enable shadows
    mesh.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    // Position in local coordinates
    const localPos = this.sync.geoToLocal(lat, lon, height);
    mesh.position.copy(localPos);

    // Add to scene
    this.scene.add(mesh);

    // Create range indicator (hidden by default)
    const rangeGeometry = new THREE.CircleGeometry(config.range, 64);
    const rangeIndicator = new THREE.Mesh(rangeGeometry, this.rangeMaterial.clone());
    rangeIndicator.rotation.x = -Math.PI / 2; // Horizontal
    rangeIndicator.position.copy(localPos);
    rangeIndicator.position.y += 0.5; // Slightly above ground
    rangeIndicator.visible = false;
    this.scene.add(rangeIndicator);

    // Create selection ring (hidden by default)
    const selectionGeometry = new THREE.RingGeometry(4, 6, 32);
    const selectionRing = new THREE.Mesh(selectionGeometry, this.selectionMaterial.clone());
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.copy(localPos);
    selectionRing.position.y += 0.2;
    selectionRing.visible = false;
    this.scene.add(selectionRing);

    const renderData: TowerRenderData = {
      id,
      mesh,
      rangeIndicator,
      selectionRing,
      typeConfig: config,
      isSelected: false,
    };

    this.towers.set(id, renderData);
    return renderData;
  }

  /**
   * Update tower position (normally static, but useful for editor)
   */
  updatePosition(id: string, lat: number, lon: number, height: number): void {
    const data = this.towers.get(id);
    if (!data) return;

    const localPos = this.sync.geoToLocal(lat, lon, height);
    data.mesh.position.copy(localPos);

    if (data.rangeIndicator) {
      data.rangeIndicator.position.copy(localPos);
      data.rangeIndicator.position.y += 0.5;
    }

    if (data.selectionRing) {
      data.selectionRing.position.copy(localPos);
      data.selectionRing.position.y += 0.2;
    }
  }

  /**
   * Update tower rotation (for aiming at target)
   */
  updateRotation(id: string, heading: number): void {
    const data = this.towers.get(id);
    if (!data) return;

    data.mesh.rotation.y = heading;
  }

  /**
   * Select tower (show range indicator and selection ring)
   */
  select(id: string): void {
    const data = this.towers.get(id);
    if (!data) return;

    data.isSelected = true;
    if (data.rangeIndicator) data.rangeIndicator.visible = true;
    if (data.selectionRing) data.selectionRing.visible = true;
  }

  /**
   * Deselect tower
   */
  deselect(id: string): void {
    const data = this.towers.get(id);
    if (!data) return;

    data.isSelected = false;
    if (data.rangeIndicator) data.rangeIndicator.visible = false;
    if (data.selectionRing) data.selectionRing.visible = false;
  }

  /**
   * Deselect all towers
   */
  deselectAll(): void {
    for (const id of this.towers.keys()) {
      this.deselect(id);
    }
  }

  /**
   * Remove tower from scene
   */
  remove(id: string): void {
    const data = this.towers.get(id);
    if (!data) return;

    // Remove mesh
    this.scene.remove(data.mesh);
    this.disposeObject(data.mesh);

    // Remove range indicator
    if (data.rangeIndicator) {
      this.scene.remove(data.rangeIndicator);
      data.rangeIndicator.geometry.dispose();
      (data.rangeIndicator.material as THREE.Material).dispose();
    }

    // Remove selection ring
    if (data.selectionRing) {
      this.scene.remove(data.selectionRing);
      data.selectionRing.geometry.dispose();
      (data.selectionRing.material as THREE.Material).dispose();
    }

    this.towers.delete(id);
  }

  /**
   * Update selection ring animation
   * Call each frame for pulse effect
   */
  updateAnimations(deltaTime: number): void {
    const time = performance.now() * 0.003;

    for (const data of this.towers.values()) {
      if (data.isSelected && data.selectionRing) {
        // Pulse scale
        const scale = 1 + Math.sin(time) * 0.1;
        data.selectionRing.scale.setScalar(scale);

        // Rotate slowly
        data.selectionRing.rotation.z += deltaTime * 0.001;
      }
    }
  }

  /**
   * Get tower render data
   */
  get(id: string): TowerRenderData | undefined {
    return this.towers.get(id);
  }

  /**
   * Get count of active towers
   */
  get count(): number {
    return this.towers.size;
  }

  /**
   * Clear all towers
   */
  clear(): void {
    for (const id of this.towers.keys()) {
      this.remove(id);
    }
  }

  /**
   * Recursively dispose Three.js object
   */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        const materials: THREE.Material[] = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of materials) {
          const stdMat = mat as THREE.MeshStandardMaterial;
          if (stdMat.map) stdMat.map.dispose();
          if (stdMat.normalMap) stdMat.normalMap.dispose();
          mat.dispose();
        }
      }
    });
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clear();
    this.modelTemplates.clear();
    this.rangeMaterial.dispose();
    this.selectionMaterial.dispose();
  }
}
