import * as THREE from 'three';
import { MathUtils } from 'three';
import {
  TilesRenderer,
  GlobeControls,
  WGS84_ELLIPSOID,
} from '3d-tiles-renderer';
// CAMERA_FRAME is used for getObjectFrame coordinate transformations
import { CAMERA_FRAME } from '3d-tiles-renderer/src/three/renderer/math/Ellipsoid.js';
import {
  TilesFadePlugin,
  TileCompressionPlugin,
  UpdateOnChangePlugin,
  UnloadTilesPlugin,
  GLTFExtensionsPlugin,
  CesiumIonAuthPlugin,
  ReorientationPlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EllipsoidSync } from './ellipsoid-sync';
import { ThreeEnemyRenderer } from './renderers/three-enemy.renderer';
import { ThreeTowerRenderer } from './renderers/three-tower.renderer';
import { ThreeProjectileRenderer } from './renderers/three-projectile.renderer';
import { ThreeEffectsRenderer } from './renderers/three-effects.renderer';

/**
 * ThreeTilesEngine - Main Three.js rendering engine for Tower Defense
 *
 * Uses 3DTilesRendererJS (NASA JPL) to render Google Photorealistic 3D Tiles
 * directly in Three.js, eliminating the need for Cesium.
 *
 * Key advantages:
 * - Single WebGL context - automatic depth occlusion for all objects
 * - Native Three.js raycasting against 3D tiles
 * - Simpler coordinate transformations
 */
export class ThreeTilesEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: GlobeControls | null = null;
  private tilesRenderer: TilesRenderer | null = null;
  private reorientationPlugin: ReorientationPlugin | null = null;

  // Coordinate sync
  readonly sync: EllipsoidSync;

  // Raycaster for terrain height queries
  private raycaster: THREE.Raycaster;
  private heightCache = new Map<string, number>();
  private readonly CACHE_PRECISION = 5;

  // Debug flag: reset when tiles are loaded so we get debug output
  private tilesWereLoaded = false;

  // Entity renderers
  readonly enemies: ThreeEnemyRenderer;
  readonly towers: ThreeTowerRenderer;
  readonly projectiles: ThreeProjectileRenderer;
  readonly effects: ThreeEffectsRenderer;

  // Test entities (for debugging)
  private testCube: THREE.Mesh | null = null;
  private debugHelpers: THREE.Object3D[] = [];

  // Overlay group for markers, streets, routes
  // Added to scene root, but synced with tiles movement each frame
  private overlayGroup: THREE.Group;

  // Track initial tiles position to calculate movement delta
  private initialTilesPos = new THREE.Vector3();
  private tilesPosInitialized = false;

  // Base Y position for overlay group (terrain height at origin)
  // This ensures overlays are placed on the terrain surface, not at world Y=0
  private overlayBaseY = 0;

  // Performance stats
  private lastFrameTime = 0;
  private frameCount = 0;
  private fps = 0;

  // Animation
  private animationFrameId: number | null = null;
  private isRunning = false;

  // Cesium Ion credentials
  private cesiumIonToken: string;

  constructor(
    canvas: HTMLCanvasElement,
    cesiumIonToken: string,
    originLat: number,
    originLon: number,
    originHeight: number = 0
  ) {
    this.cesiumIonToken = cesiumIonToken;

    // Initialize coordinate sync
    this.sync = new EllipsoidSync(originLat, originLon, originHeight);

    // Raycaster for terrain queries
    this.raycaster = new THREE.Raycaster();

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x151c1f);

    // Create scene
    this.scene = new THREE.Scene();

    // Create overlay group for markers, streets, routes
    // Will be added to SCENE (not tilesGroup) and synced each frame
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.overlayGroup);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.width / canvas.height,
      1,
      160000000
    );

    // Setup lighting
    this.setupLighting();

    // Initialize entity renderers (they need sync, not cesium-three-sync)
    // Note: We pass a compatibility layer that matches the CesiumThreeSync interface
    const syncAdapter = {
      geoToLocal: (lat: number, lon: number, height: number) => this.sync.geoToLocal(lat, lon, height),
      localToGeo: (vec: THREE.Vector3) => this.sync.localToGeo(vec),
      camera: this.camera,
    };

    this.enemies = new ThreeEnemyRenderer(this.scene, syncAdapter as any);
    this.towers = new ThreeTowerRenderer(this.scene, syncAdapter as any);
    this.projectiles = new ThreeProjectileRenderer(this.scene, syncAdapter as any);
    this.effects = new ThreeEffectsRenderer(this.scene, syncAdapter as any);

    console.log('[ThreeTilesEngine] Initialized with origin:', originLat, originLon);
  }

  /**
   * Initialize 3D Tiles (async - must be called after constructor)
   */
  async initialize(): Promise<void> {
    // Create TilesRenderer
    this.tilesRenderer = new TilesRenderer();

    // Register plugins
    this.tilesRenderer.registerPlugin(
      new CesiumIonAuthPlugin({
        apiToken: this.cesiumIonToken,
        assetId: '2275207', // Google Photorealistic 3D Tiles
        autoRefreshToken: true,
      })
    );
    this.tilesRenderer.registerPlugin(new TileCompressionPlugin());
    this.tilesRenderer.registerPlugin(new UpdateOnChangePlugin());
    this.tilesRenderer.registerPlugin(new UnloadTilesPlugin());
    this.tilesRenderer.registerPlugin(new TilesFadePlugin());
    this.tilesRenderer.registerPlugin(
      new GLTFExtensionsPlugin({
        dracoLoader: new DRACOLoader().setDecoderPath(
          'https://unpkg.com/three@0.153.0/examples/jsm/libs/draco/gltf/'
        ),
      })
    );

    // Reorientation plugin - centers tiles on origin
    const origin = this.sync.getOrigin();
    this.reorientationPlugin = new ReorientationPlugin({
      lat: origin.lat * MathUtils.DEG2RAD,
      lon: origin.lon * MathUtils.DEG2RAD,
      height: origin.height,
      recenter: true,
    });
    this.tilesRenderer.registerPlugin(this.reorientationPlugin);

    // Important: rotate tiles group so Y is up (default is Z-up)
    this.tilesRenderer.group.rotation.x = -Math.PI / 2;

    // Add to scene
    this.scene.add(this.tilesRenderer.group);

    // overlayGroup is already in scene (added in constructor)
    // We'll sync its position with tiles movement in render()

    // Update sync with tiles renderer reference
    this.sync.setTilesRenderer(this.tilesRenderer);

    // Setup camera and controls
    this.setupControls();

    // Configure tiles renderer
    this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
    this.tilesRenderer.setCamera(this.camera);

    // Performance settings
    this.tilesRenderer.errorTarget = 20;

    console.log('[ThreeTilesEngine] 3D Tiles initialized');
  }

  private setupLighting(): void {
    // Ambient light for base visibility
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    // Directional light (sun-like)
    const sun = new THREE.DirectionalLight(0xffffee, 1.2);
    sun.position.set(1, 2, 1).normalize().multiplyScalar(100);
    this.scene.add(sun);

    // Hemisphere light for sky/ground color variation
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.3);
    this.scene.add(hemi);
  }

  private setupControls(): void {
    if (!this.tilesRenderer) return;

    // GlobeControls for earth-like navigation
    this.controls = new GlobeControls(
      this.scene,
      this.camera,
      this.renderer.domElement,
      this.tilesRenderer
    );
    this.controls.enableDamping = true;

    // Set ellipsoid for controls (using deprecated method for now)
    this.controls.setEllipsoid(this.tilesRenderer.ellipsoid, this.tilesRenderer.group);

    // With ReorientationPlugin (recenter: true) and tiles.group.rotation.x = -PI/2:
    // - Origin (HQ) is at (0,0,0) in local space
    // - Y is up, X is East, -Z is North
    // Position camera south of origin, above ground, looking north toward origin
    this.camera.position.set(0, 400, 300); // 400m up, 300m south
    this.camera.lookAt(0, 0, 0);
    console.log('[ThreeTilesEngine] Initial camera position:', this.camera.position.toArray());
  }

  /**
   * Set camera position using lat/lon/height and orientation
   */
  setCameraPosition(
    lat: number,
    lon: number,
    height: number,
    azimuth: number = 0,
    elevation: number = -45,
    roll: number = 0
  ): void {
    if (!this.tilesRenderer) return;

    this.tilesRenderer.group.updateMatrixWorld();

    // Use getObjectFrame for proper camera positioning in globe view
    const tempMatrix = new THREE.Matrix4();
    WGS84_ELLIPSOID.getObjectFrame(
      lat * MathUtils.DEG2RAD,
      lon * MathUtils.DEG2RAD,
      height,
      azimuth * MathUtils.DEG2RAD,
      elevation * MathUtils.DEG2RAD,
      roll * MathUtils.DEG2RAD,
      tempMatrix,
      CAMERA_FRAME
    );

    // Apply tiles group transformation
    tempMatrix.premultiply(this.tilesRenderer.group.matrixWorld);
    tempMatrix.decompose(
      this.camera.position,
      this.camera.quaternion,
      this.camera.scale
    );

    console.log('[ThreeTilesEngine] Camera set to:', {
      position: this.camera.position.toArray(),
      lat, lon, height
    });
  }

  /**
   * Set camera position in local coordinates (meters relative to origin)
   * With ReorientationPlugin (recenter: true), origin is at (0,0,0)
   *
   * @param x - East/West offset in meters (positive = East)
   * @param y - Height above ground in meters
   * @param z - North/South offset in meters (positive = South)
   * @param targetX - Look-at target X (default 0)
   * @param targetY - Look-at target Y (default 0)
   * @param targetZ - Look-at target Z (default 0)
   */
  setLocalCameraPosition(
    x: number,
    y: number,
    z: number,
    targetX: number = 0,
    targetY: number = 0,
    targetZ: number = 0
  ): void {
    this.camera.position.set(x, y, z);
    this.camera.lookAt(targetX, targetY, targetZ);
    console.log('[ThreeTilesEngine] Camera set to local position:', { x, y, z });
  }

  /**
   * Fly camera to a position (animated)
   */
  flyTo(lat: number, lon: number, height: number, duration: number = 1.5): void {
    // For now, just set position directly
    // TODO: Implement smooth animation
    this.setCameraPosition(lat, lon, height, 0, -45);
  }

  /**
   * Update origin (when game location changes)
   */
  setOrigin(lat: number, lon: number, height: number = 0): void {
    this.sync.setOrigin(lat, lon, height);

    // Update ReorientationPlugin
    if (this.reorientationPlugin && this.tilesRenderer) {
      this.reorientationPlugin.transformLatLonHeightToOrigin(
        lat * MathUtils.DEG2RAD,
        lon * MathUtils.DEG2RAD,
        height
      );
    }

    // Clear height cache
    this.clearHeightCache();

    console.log('[ThreeTilesEngine] Origin updated to:', lat, lon);
  }

  /**
   * Resize renderer
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /**
   * Get ground Y position at scene X,Z coordinates using raycasting
   * Returns the Y value where the ray hits the terrain
   */
  getGroundYAtScenePos(x: number, z: number): number | null {
    if (!this.tilesRenderer) return null;

    // Cast ray from high above straight down
    const rayOrigin = new THREE.Vector3(x, 5000, z);
    const rayDir = new THREE.Vector3(0, -1, 0);

    this.raycaster.set(rayOrigin, rayDir);
    const results = this.raycaster.intersectObject(this.tilesRenderer.group, true);

    if (results.length > 0) {
      return results[0].point.y;
    }
    return null;
  }

  /**
   * Get terrain height for overlay objects at a given local X,Z position
   * Returns the Y value in overlayGroup local coordinates
   *
   * With ReorientationPlugin (recenter:true), the origin is at world (0,0,0).
   * Tiles geometry is transformed so origin point is centered.
   * We raycast directly in this coordinate space.
   *
   * @param localX - X position in local coords (from geoToLocalSimple)
   * @param localZ - Z position in local coords (from geoToLocalSimple)
   * @returns Y position for the overlay, or null if terrain not hit
   */
  private raycastDebugCount = 0;
  private tilesLoadedForRaycast = false;

  /**
   * Check if tiles are loaded enough for raycasting
   */
  areTilesReadyForRaycast(): boolean {
    if (!this.tilesRenderer) return false;

    // Cast from camera toward origin
    const camPos = this.camera.position.clone();
    const direction = new THREE.Vector3(0, 0, 0).sub(camPos).normalize();
    this.raycaster.set(camPos, direction);

    const results = this.raycaster.intersectObject(this.tilesRenderer.group, true);
    return results.length > 0;
  }

  /**
   * Get terrain height at geographic coordinates using LOCAL coordinate raycast.
   *
   * With ReorientationPlugin (recenter: true):
   * - Tiles are centered at local origin (0,0,0) - NOT in ECEF!
   * - tiles.group.rotation.x = -PI/2 converts Z-up to Y-up
   * - We raycast from high above (Y=10000) straight down (0,-1,0)
   * - geoToLocalSimple() gives local offsets in the same coordinate system
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @returns Height in local Y coordinates, or null if no hit
   */
  getTerrainHeightAtGeo(lat: number, lon: number): number | null {
    if (!this.tilesRenderer) return null;

    // Check if tiles are loaded
    let meshCount = 0;
    this.tilesRenderer.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshCount++;
    });

    if (meshCount === 0) {
      // Tiles not loaded yet
      return null;
    }

    // Reset debug counter when tiles first become available
    if (!this.tilesWereLoaded) {
      this.tilesWereLoaded = true;
      this.raycastDebugCount = 0;
      console.log(`[Terrain DEBUG] Tiles now loaded (${meshCount} meshes), starting raycast debugging`);

      // Log tiles bounding box to understand coordinate system
      const box = new THREE.Box3();
      this.tilesRenderer.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const meshBox = new THREE.Box3().setFromObject(obj);
          box.union(meshBox);
        }
      });
      if (!box.isEmpty()) {
        console.log(`[Terrain DEBUG] Tiles bbox: min=(${box.min.x.toFixed(1)}, ${box.min.y.toFixed(1)}, ${box.min.z.toFixed(1)})`);
        console.log(`[Terrain DEBUG] Tiles bbox: max=(${box.max.x.toFixed(1)}, ${box.max.y.toFixed(1)}, ${box.max.z.toFixed(1)})`);
      }
    }

    // Get local position using geoToLocalSimple
    // This gives us X/Z offset from origin, we set Y=10000 (high above)
    const localPos = this.sync.geoToLocalSimple(lat, lon, 0);
    const rayOrigin = new THREE.Vector3(localPos.x, 10000, localPos.z);

    // Raycast straight down in local coordinate system
    const direction = new THREE.Vector3(0, -1, 0);

    // Debug first few raycasts
    if (this.raycastDebugCount < 3) {
      console.log(`[Terrain DEBUG] Local raycast from: (${rayOrigin.x.toFixed(1)}, ${rayOrigin.y.toFixed(1)}, ${rayOrigin.z.toFixed(1)})`);
    }

    this.raycaster.set(rayOrigin, direction);
    this.raycaster.far = 20000;  // 20km range

    const results = this.raycaster.intersectObject(this.tilesRenderer.group, true);

    if (results.length > 0) {
      // Hit point is in WORLD coordinates
      const hitPoint = results[0].point;

      if (this.raycastDebugCount < 3) {
        console.log(`[Terrain] Hit at (${lat.toFixed(5)}, ${lon.toFixed(5)})`);
        console.log(`[Terrain]   -> hitPoint WORLD: (${hitPoint.x.toFixed(1)}, ${hitPoint.y.toFixed(1)}, ${hitPoint.z.toFixed(1)})`);
        console.log(`[Terrain]   -> distance: ${results[0].distance.toFixed(1)}m`);
        this.raycastDebugCount++;
      }

      // The overlayGroup is positioned at the same location as tiles
      // So we need to use the hit point Y directly
      return hitPoint.y;
    }

    // Debug first miss
    if (this.raycastDebugCount < 3) {
      console.log(`[Terrain DEBUG] MISS at (${lat.toFixed(5)}, ${lon.toFixed(5)}) localX=${localPos.x.toFixed(1)}, localZ=${localPos.z.toFixed(1)}`);
      this.raycastDebugCount++;
    }

    return null;
  }

  /**
   * @deprecated Use getTerrainHeightAtGeo() instead - this method uses incorrect local raycast
   */
  getOverlayTerrainHeight(localX: number, localZ: number): number | null {
    console.warn('[Terrain] getOverlayTerrainHeight is deprecated - use getTerrainHeightAtGeo');
    return null;
  }

  /**
   * Get terrain height at geo coordinates for overlay objects.
   * Uses correct ECEF raycast via getTerrainHeightAtGeo.
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @param heightAboveGround - Additional height above terrain (default 0)
   * @returns Height above ellipsoid + offset, or null if tiles not loaded
   */
  getOverlayTerrainHeightAtGeo(lat: number, lon: number, heightAboveGround: number = 0): number | null {
    const terrainHeight = this.getTerrainHeightAtGeo(lat, lon);

    if (terrainHeight !== null) {
      return terrainHeight + heightAboveGround;
    }

    // No fallback - return null so caller knows tiles aren't ready
    return null;
  }

  /**
   * Get terrain height at geo position using raycasting
   */
  async getTerrainHeight(lat: number, lon: number): Promise<number> {
    const key = this.getHeightCacheKey(lat, lon);
    if (this.heightCache.has(key)) {
      return this.heightCache.get(key)!;
    }

    if (!this.tilesRenderer) return 0;

    // Position 10km above the point
    const position = new THREE.Vector3();
    WGS84_ELLIPSOID.getCartographicToPosition(
      lat * MathUtils.DEG2RAD,
      lon * MathUtils.DEG2RAD,
      10000,
      position
    );

    // Apply tiles group transform
    position.applyMatrix4(this.tilesRenderer.group.matrixWorld);

    // Direction toward ellipsoid center (down)
    const direction = position.clone().negate().normalize();

    this.raycaster.set(position, direction);

    const results = this.raycaster.intersectObject(this.tilesRenderer.group, true);

    if (results.length > 0) {
      // Convert hit point back to cartographic to get height
      const hitPoint = results[0].point.clone();
      const invMatrix = this.tilesRenderer.group.matrixWorld.clone().invert();
      hitPoint.applyMatrix4(invMatrix);

      const cartographic: { lat: number; lon: number; height: number } = { lat: 0, lon: 0, height: 0 };
      WGS84_ELLIPSOID.getPositionToCartographic(hitPoint, cartographic);

      const height = cartographic.height;
      this.heightCache.set(key, height);
      return height;
    }

    return 0;
  }

  /**
   * Get terrain height synchronously (from cache only)
   */
  getTerrainHeightSync(lat: number, lon: number): number | null {
    const key = this.getHeightCacheKey(lat, lon);
    return this.heightCache.get(key) ?? null;
  }

  private getHeightCacheKey(lat: number, lon: number): string {
    return `${lat.toFixed(this.CACHE_PRECISION)}_${lon.toFixed(this.CACHE_PRECISION)}`;
  }

  /**
   * Clear height cache
   */
  clearHeightCache(): void {
    this.heightCache.clear();
  }

  /**
   * Preload heights for a path
   */
  async preloadHeightsForPath(path: { lat: number; lon: number }[]): Promise<void> {
    for (const point of path) {
      await this.getTerrainHeight(point.lat, point.lon);
    }
  }

  /**
   * Raycast against terrain at screen coordinates
   */
  raycastTerrain(screenX: number, screenY: number): THREE.Vector3 | null {
    if (!this.tilesRenderer) return null;

    // Convert screen coords to NDC
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);

    const results = this.raycaster.intersectObject(this.tilesRenderer.group, true);

    if (results.length > 0) {
      return results[0].point.clone();
    }

    return null;
  }

  /**
   * Main render loop - call this each frame
   */
  render(): void {
    if (!this.tilesRenderer) return;

    // Update controls
    if (this.controls) {
      this.controls.update();
    }

    // Update tiles
    this.camera.updateMatrixWorld();
    this.tilesRenderer.setResolutionFromRenderer(this.camera, this.renderer);
    this.tilesRenderer.setCamera(this.camera);
    this.tilesRenderer.update();

    // Capture initial tiles position only when tiles have loaded (position is non-zero)
    if (!this.tilesPosInitialized) {
      const pos = this.tilesRenderer.group.position;
      // Wait until tilesGroup has a real ECEF position (Y will be negative millions)
      if (Math.abs(pos.y) > 1000000) {
        this.initialTilesPos.copy(pos);
        this.tilesPosInitialized = true;
        console.log('[ThreeTilesEngine] Initial tiles pos captured:', this.initialTilesPos.toArray().map(v => v.toFixed(1)));
      }
    }

    // Sync overlayGroup with tiles movement (only after initial pos is captured)
    if (this.tilesPosInitialized) {
      const deltaPos = this.tilesRenderer.group.position.clone().sub(this.initialTilesPos);
      // Apply delta X/Z, but Y = delta + base terrain height
      this.overlayGroup.position.set(deltaPos.x, deltaPos.y + this.overlayBaseY, deltaPos.z);
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Update FPS
    this.updateFPS();
  }

  /**
   * Update game entities (call before render)
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

    // Rotate test cube if exists
    if (this.testCube) {
      this.testCube.rotation.y += deltaTime * 0.001;
    }
  }

  /**
   * Start the render loop
   */
  startRenderLoop(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const animate = () => {
      if (!this.isRunning) return;

      this.update(16); // ~60fps
      this.render();

      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Stop the render loop
   */
  stopRenderLoop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Add a test cube at a geo position (for debugging)
   */
  async addTestCube(lat: number, lon: number): Promise<THREE.Mesh> {
    const height = await this.getTerrainHeight(lat, lon);
    const localPos = this.sync.geoToLocal(lat, lon, height + 5);

    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const material = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      metalness: 0.3,
      roughness: 0.7,
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.copy(localPos);

    this.scene.add(cube);
    this.testCube = cube;

    console.log('[ThreeTilesEngine] Test cube added at:', lat, lon, 'local:', localPos);
    return cube;
  }

  /**
   * Add a test cube at the origin (0, height, 0) inside tilesRenderer.group
   * This cube should stay fixed relative to the tiles when using GlobeControls
   *
   * @param height - Height above ground in meters (in group's local Y-up coordinates)
   * @returns The created mesh or null if no tiles renderer
   */
  addTestCubeAtOrigin(height: number = 50): THREE.Mesh | null {
    if (!this.tilesRenderer) {
      console.error('[ThreeTilesEngine] Cannot add test cube: tilesRenderer not initialized');
      return null;
    }

    // Create cube with overlay-friendly material
    const geometry = new THREE.BoxGeometry(20, 20, 20);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      depthTest: false, // Ignore depth - always draw
      depthWrite: false, // Don't affect depth buffer
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide, // Visible from all angles
    });

    const cube = new THREE.Mesh(geometry, material);

    // Add to overlayGroup (which is synced with tiles movement)
    cube.position.set(0, height, 0);
    cube.renderOrder = 9999;

    this.overlayGroup.add(cube);
    this.testCube = cube;

    console.log('[ThreeTilesEngine] Test cube added to overlayGroup at Y=' + height);

    return cube;
  }

  /**
   * Add test cubes at spawn positions
   */
  async addTestCubesAtSpawns(spawns: { lat: number; lon: number }[]): Promise<void> {
    const colors = [0xef4444, 0xf97316, 0x3b82f6, 0x8b5cf6];

    for (let i = 0; i < spawns.length; i++) {
      const spawn = spawns[i];
      const height = await this.getTerrainHeight(spawn.lat, spawn.lon);
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

    console.log('[ThreeTilesEngine] Added', spawns.length, 'test cubes at spawns');
  }

  /**
   * Add axis helper at origin
   */
  addAxisHelper(): void {
    const axisHelper = new THREE.AxesHelper(50);
    this.scene.add(axisHelper);
    this.debugHelpers.push(axisHelper);
  }

  /**
   * Clear debug helpers
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
   * Get Three.js scene
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get overlay group for markers, streets, routes
   * Objects added here use local coordinates (X=East, Y=Up, Z=-North)
   */
  getOverlayGroup(): THREE.Group {
    return this.overlayGroup;
  }

  /**
   * Set the base Y position for the overlay group
   * This should be set to the terrain height at the origin point
   * so that overlays with Y=0 appear at terrain surface level
   *
   * @param y - Terrain Y at origin (from getTerrainHeightAtGeo at HQ)
   */
  setOverlayBaseY(y: number): void {
    this.overlayBaseY = y;
    console.log(`[ThreeTilesEngine] Overlay base Y set to: ${y.toFixed(1)}`);
  }

  /**
   * Get tiles renderer group (for debugging)
   */
  getTilesGroup(): THREE.Group | null {
    return this.tilesRenderer?.group ?? null;
  }

  /**
   * Get Three.js renderer
   */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  /**
   * Get camera
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Preload all entity models
   */
  async preloadModels(): Promise<void> {
    await Promise.all([
      this.enemies.preloadAllModels(),
      this.towers.preloadAllModels(),
    ]);
    console.log('[ThreeTilesEngine] All models preloaded');
  }

  /**
   * Clear all game entities
   */
  clearEntities(): void {
    this.enemies.clear();
    this.towers.clear();
    this.projectiles.clear();
    this.effects.clear();
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stopRenderLoop();
    this.clearDebugHelpers();

    // Dispose entity renderers
    this.enemies.dispose();
    this.towers.dispose();
    this.projectiles.dispose();
    this.effects.dispose();

    // Dispose tiles renderer
    if (this.tilesRenderer) {
      this.scene.remove(this.tilesRenderer.group);
      this.tilesRenderer.dispose();
      this.tilesRenderer = null;
    }

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

    console.log('[ThreeTilesEngine] Disposed');
  }
}
