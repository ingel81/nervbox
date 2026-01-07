import * as THREE from 'three';
import * as Cesium from 'cesium';
import { CesiumThreeSync } from './cesium-three-sync';
import { TerrainAdapter } from './terrain-adapter';
import { ThreeEnemyRenderer } from './renderers/three-enemy.renderer';
import { ThreeTowerRenderer } from './renderers/three-tower.renderer';
import { ThreeProjectileRenderer } from './renderers/three-projectile.renderer';
import { ThreeEffectsRenderer } from './renderers/three-effects.renderer';

/**
 * TdThreeEngine - Main Three.js rendering engine for Tower Defense
 *
 * Renders game entities (zombies, towers, projectiles, effects) using Three.js
 * while Cesium handles terrain and 3D tiles.
 *
 * Architecture:
 * - Three.js canvas overlays Cesium canvas (transparent background)
 * - Camera synchronized with Cesium camera each frame
 * - Coordinates transformed from WGS84 to local Three.js space
 *
 * Known limitation: Three.js objects cannot be occluded by Cesium 3D tiles
 * (would require depth buffer sharing which is complex)
 */
export class TdThreeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cesiumViewer: Cesium.Viewer;

  readonly sync: CesiumThreeSync;
  readonly terrain: TerrainAdapter;

  // Entity renderers
  readonly enemies: ThreeEnemyRenderer;
  readonly towers: ThreeTowerRenderer;
  readonly projectiles: ThreeProjectileRenderer;
  readonly effects: ThreeEffectsRenderer;

  // Test entities (will be replaced by proper managers)
  private testCube: THREE.Mesh | null = null;
  private debugHelpers: THREE.Object3D[] = [];

  // Performance stats
  private lastFrameTime = 0;
  private frameCount = 0;
  private fps = 0;

  /**
   * Create Three.js engine with separate canvas overlay
   *
   * @param canvas - Separate canvas for Three.js (overlays Cesium)
   * @param cesiumViewer - The Cesium viewer for camera sync
   * @param originLat - Origin latitude for local coordinate system
   * @param originLon - Origin longitude
   * @param originHeight - Terrain height at origin
   */
  constructor(
    canvas: HTMLCanvasElement,
    cesiumViewer: Cesium.Viewer,
    originLat: number,
    originLon: number,
    originHeight: number = 0
  ) {
    this.cesiumViewer = cesiumViewer;

    // Initialize coordinate sync with terrain height
    this.sync = new CesiumThreeSync(cesiumViewer, originLat, originLon, originHeight);
    this.terrain = new TerrainAdapter(cesiumViewer, this.sync);

    // Create Three.js renderer with separate canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true, // Transparent background to see Cesium below
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0); // Fully transparent

    // Create scene
    this.scene = new THREE.Scene();

    // Basic lighting (entities need to be visible)
    this.setupLighting();

    // Initialize entity renderers
    this.enemies = new ThreeEnemyRenderer(this.scene, this.sync);
    this.towers = new ThreeTowerRenderer(this.scene, this.sync);
    this.projectiles = new ThreeProjectileRenderer(this.scene, this.sync);
    this.effects = new ThreeEffectsRenderer(this.scene, this.sync);

    console.log('[TdThreeEngine] Initialized with separate canvas, origin:', originLat, originLon);
  }

  /**
   * Setup basic lighting for the scene
   */
  private setupLighting(): void {
    // Ambient light for base visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Directional light (sun-like)
    const sun = new THREE.DirectionalLight(0xffffee, 1.0);
    sun.position.set(100, 200, 100);
    this.scene.add(sun);

    // Hemisphere light for sky/ground color
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.3);
    this.scene.add(hemi);
  }

  /**
   * Update origin (when game location changes)
   */
  setOrigin(lat: number, lon: number, height: number = 0): void {
    this.sync.setOrigin(lat, lon, height);
    this.terrain.clearCache();
    console.log('[TdThreeEngine] Origin updated to:', lat, lon, 'height:', height);
  }

  /**
   * Resize renderer to match canvas size
   * Note: With shared context, Cesium handles canvas resizing
   */
  resize(width: number, height: number): void {
    // Update Three.js renderer size (don't update canvas - Cesium does that)
    this.renderer.setSize(width, height, false);
    this.sync.resize(width, height);
  }

  // Debug: frame counter for sparse logging
  private debugFrameCount = 0;

  /**
   * Main render loop - call this each frame
   *
   * IMPORTANT: Call AFTER Cesium has rendered (in postRender callback)
   */
  render(): void {
    // Sync camera with Cesium
    this.sync.syncCamera();

    // Debug logging (every 300 frames = ~5 seconds)
    this.debugFrameCount++;
    if (this.debugFrameCount % 300 === 1) {
      const cam = this.sync.camera;
      console.log('[TdThreeEngine] render() - camera pos:', cam.position.x.toFixed(1), cam.position.y.toFixed(1), cam.position.z.toFixed(1));
      console.log('[TdThreeEngine] scene children:', this.scene.children.length, 'testCube:', !!this.testCube);
    }

    // Render Three.js scene
    this.renderer.render(this.scene, this.sync.camera);

    // Update FPS counter
    this.updateFPS();
  }

  /**
   * Update game entities (call before render)
   *
   * @param deltaTime - Time since last frame in milliseconds
   */
  update(deltaTime: number): void {
    const deltaSeconds = deltaTime / 1000;

    // Update enemy animations
    this.enemies.updateAnimations(deltaSeconds);

    // Update tower selection animations
    this.towers.updateAnimations(deltaTime);

    // Commit projectile instance changes to GPU
    this.projectiles.commitToGPU();

    // Update particle effects
    this.effects.update(deltaTime);

    // For now, just rotate test cube if it exists
    if (this.testCube) {
      this.testCube.rotation.y += deltaTime * 0.001;
    }
  }

  /**
   * Add a test cube at a geo position (for Phase 1 testing)
   */
  async addTestCube(lat: number, lon: number): Promise<THREE.Mesh> {
    // Get terrain height
    const height = await this.terrain.getHeight(lat, lon);

    // Convert to local Three.js coordinates
    const localPos = this.sync.geoToLocal(lat, lon, height + 5); // 5m above ground

    // Create cube
    const geometry = new THREE.BoxGeometry(10, 10, 10); // 10m cube
    const material = new THREE.MeshStandardMaterial({
      color: 0x22c55e, // Green
      metalness: 0.3,
      roughness: 0.7,
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.copy(localPos);

    this.scene.add(cube);
    this.testCube = cube;

    console.log('[TdThreeEngine] Test cube added at:', lat, lon, 'local:', localPos);

    return cube;
  }

  /**
   * Add test cubes at multiple positions (for testing coordinate system)
   */
  async addTestCubesAtSpawns(spawns: { lat: number; lon: number }[]): Promise<void> {
    const colors = [0xef4444, 0xf97316, 0x3b82f6, 0x8b5cf6]; // red, orange, blue, purple

    for (let i = 0; i < spawns.length; i++) {
      const spawn = spawns[i];
      const height = await this.terrain.getHeight(spawn.lat, spawn.lon);
      const localPos = this.sync.geoToLocal(spawn.lat, spawn.lon, height + 5);

      const geometry = new THREE.BoxGeometry(8, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        metalness: 0.3,
        roughness: 0.7,
      });
      const cube = new THREE.Mesh(geometry, material);
      cube.position.copy(localPos);
      this.scene.add(cube);
      this.debugHelpers.push(cube);
    }

    console.log('[TdThreeEngine] Added', spawns.length, 'test cubes at spawns');
  }

  /**
   * Add debug axis helper at origin
   */
  addAxisHelper(): void {
    const axisHelper = new THREE.AxesHelper(50); // 50m long axes
    this.scene.add(axisHelper);
    this.debugHelpers.push(axisHelper);
  }

  /**
   * Add a grid helper at terrain level
   */
  async addGridHelper(lat: number, lon: number, size: number = 500): Promise<void> {
    const height = await this.terrain.getHeight(lat, lon);
    const localPos = this.sync.geoToLocal(lat, lon, height + 0.5);

    const gridHelper = new THREE.GridHelper(size, 50, 0x444444, 0x222222);
    gridHelper.position.copy(localPos);
    this.scene.add(gridHelper);
    this.debugHelpers.push(gridHelper);
  }

  /**
   * Clear all debug helpers
   */
  clearDebugHelpers(): void {
    for (const helper of this.debugHelpers) {
      this.scene.remove(helper);
      if ((helper as THREE.Mesh).geometry) {
        (helper as THREE.Mesh).geometry.dispose();
      }
      if ((helper as THREE.Mesh).material) {
        const mat = (helper as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    }
    this.debugHelpers = [];

    if (this.testCube) {
      this.scene.remove(this.testCube);
      this.testCube.geometry.dispose();
      (this.testCube.material as THREE.Material).dispose();
      this.testCube = null;
    }
  }

  /**
   * Update FPS counter
   */
  private updateFPS(): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }

  /**
   * Get Three.js scene for direct access (use sparingly)
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get Three.js renderer for direct access (use sparingly)
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Preload all entity models
   */
  async preloadModels(): Promise<void> {
    await Promise.all([
      this.enemies.preloadAllModels(),
      this.towers.preloadAllModels(),
    ]);
    console.log('[TdThreeEngine] All models preloaded');
  }

  /**
   * Clear all game entities (for reset)
   */
  clearEntities(): void {
    this.enemies.clear();
    this.towers.clear();
    this.projectiles.clear();
    this.effects.clear();
  }

  /**
   * Cleanup and dispose all resources
   */
  dispose(): void {
    this.clearDebugHelpers();

    // Dispose entity renderers
    this.enemies.dispose();
    this.towers.dispose();
    this.projectiles.dispose();
    this.effects.dispose();

    // Dispose scene contents
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });

    // Dispose renderer
    this.renderer.dispose();

    console.log('[TdThreeEngine] Disposed');
  }
}
