import * as THREE from 'three';

/**
 * InstancedEntityManager - GPU-Instancing system for efficient rendering of many entities
 *
 * Uses THREE.InstancedMesh for single draw-call rendering of thousands of entities.
 * Each entity gets an index in the instance matrix array.
 *
 * Performance targets:
 * - Zombies: 2000 instances, 1 draw call
 * - Towers: 200 instances, 1 draw call
 * - Projectiles: 1000 instances, 1 draw call
 *
 * @template T - Entity type with required 'id' property
 */
export class InstancedEntityManager<T extends { id: string }> {
  private mesh: THREE.InstancedMesh;
  private entities = new Map<string, { index: number; data: T }>();
  private freeIndices: number[] = [];
  private maxInstances: number;

  // Reusable temp objects to avoid GC pressure
  private tempMatrix = new THREE.Matrix4();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3(1, 1, 1);
  private tempEuler = new THREE.Euler();

  // Track if matrix needs GPU update
  private needsUpdate = false;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxInstances: number
  ) {
    this.maxInstances = maxInstances;

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.mesh.count = 0; // Start with 0 visible instances
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all indices as free (reverse order for pop efficiency)
    for (let i = maxInstances - 1; i >= 0; i--) {
      this.freeIndices.push(i);
    }

    // Initialize all instances to invisible (scale 0)
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxInstances; i++) {
      this.mesh.setMatrixAt(i, zeroMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Add an entity to the instance pool
   *
   * @param entity - Entity data (must have id property)
   * @param position - World position
   * @param rotation - Rotation as Euler angles
   * @param scale - Scale (default 1,1,1)
   * @returns Instance index, or -1 if pool is full
   */
  add(
    entity: T,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1)
  ): number {
    if (this.freeIndices.length === 0) {
      console.warn('[InstancedEntityManager] Max instances reached:', this.maxInstances);
      return -1;
    }

    const index = this.freeIndices.pop()!;
    this.entities.set(entity.id, { index, data: entity });

    // Set instance transform
    this.updateInstanceMatrix(index, position, rotation, scale);

    // Update visible count
    this.mesh.count = Math.max(this.mesh.count, index + 1);
    this.needsUpdate = true;

    return index;
  }

  /**
   * Update an entity's position/rotation
   */
  update(
    id: string,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale?: THREE.Vector3
  ): void {
    const entry = this.entities.get(id);
    if (!entry) return;

    this.updateInstanceMatrix(
      entry.index,
      position,
      rotation,
      scale ?? this.tempScale.set(1, 1, 1)
    );
    this.needsUpdate = true;
  }

  /**
   * Update an entity's transform using a matrix directly
   */
  updateMatrix(id: string, matrix: THREE.Matrix4): void {
    const entry = this.entities.get(id);
    if (!entry) return;

    this.mesh.setMatrixAt(entry.index, matrix);
    this.needsUpdate = true;
  }

  /**
   * Remove an entity from the pool
   */
  remove(id: string): void {
    const entry = this.entities.get(id);
    if (!entry) return;

    // Make instance invisible (scale 0)
    this.tempMatrix.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(entry.index, this.tempMatrix);

    // Return index to free pool
    this.freeIndices.push(entry.index);
    this.entities.delete(id);
    this.needsUpdate = true;

    // Note: We don't reduce mesh.count as that would affect other instances
    // The instance is just invisible at scale 0
  }

  /**
   * Get entity data by ID
   */
  get(id: string): T | undefined {
    return this.entities.get(id)?.data;
  }

  /**
   * Check if entity exists
   */
  has(id: string): boolean {
    return this.entities.has(id);
  }

  /**
   * Get all entity IDs
   */
  getAllIds(): string[] {
    return Array.from(this.entities.keys());
  }

  /**
   * Get all entities
   */
  getAll(): T[] {
    return Array.from(this.entities.values()).map((e) => e.data);
  }

  /**
   * Update instance matrix at index
   */
  private updateInstanceMatrix(
    index: number,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3
  ): void {
    this.tempQuaternion.setFromEuler(rotation);
    this.tempMatrix.compose(position, this.tempQuaternion, scale);
    this.mesh.setMatrixAt(index, this.tempMatrix);
  }

  /**
   * Commit changes to GPU - call at end of frame!
   */
  commitToGPU(): void {
    if (this.needsUpdate) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.needsUpdate = false;
    }
  }

  /**
   * Get the instanced mesh for adding to scene
   */
  get instancedMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  /**
   * Get current instance count (active entities)
   */
  get count(): number {
    return this.entities.size;
  }

  /**
   * Get maximum instance capacity
   */
  get capacity(): number {
    return this.maxInstances;
  }

  /**
   * Get utilization percentage
   */
  get utilization(): number {
    return (this.entities.size / this.maxInstances) * 100;
  }

  /**
   * Clear all entities
   */
  clear(): void {
    // Make all instances invisible
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [, entry] of this.entities) {
      this.mesh.setMatrixAt(entry.index, zeroMatrix);
      this.freeIndices.push(entry.index);
    }
    this.entities.clear();
    this.mesh.count = 0;
    this.needsUpdate = true;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
    this.entities.clear();
    this.freeIndices = [];
  }
}

/**
 * ColoredInstancedEntityManager - Extension with per-instance colors
 */
export class ColoredInstancedEntityManager<T extends { id: string }> extends InstancedEntityManager<T> {
  private colors: THREE.InstancedBufferAttribute;
  private colorNeedsUpdate = false;
  private tempColor = new THREE.Color();

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    maxInstances: number
  ) {
    super(geometry, material, maxInstances);

    // Add instance color attribute
    this.colors = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances * 3),
      3
    );
    this.colors.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.instanceColor = this.colors;

    // Initialize to white
    for (let i = 0; i < maxInstances; i++) {
      this.colors.setXYZ(i, 1, 1, 1);
    }
  }

  /**
   * Set color for an entity
   */
  setColor(id: string, color: THREE.Color | number): void {
    const entry = this.get(id);
    if (!entry) return;

    // Find index
    const index = this.getAllIds().indexOf(id);
    if (index === -1) return;

    if (typeof color === 'number') {
      this.tempColor.setHex(color);
    } else {
      this.tempColor.copy(color);
    }

    this.colors.setXYZ(index, this.tempColor.r, this.tempColor.g, this.tempColor.b);
    this.colorNeedsUpdate = true;
  }

  override commitToGPU(): void {
    super.commitToGPU();
    if (this.colorNeedsUpdate) {
      this.colors.needsUpdate = true;
      this.colorNeedsUpdate = false;
    }
  }
}
