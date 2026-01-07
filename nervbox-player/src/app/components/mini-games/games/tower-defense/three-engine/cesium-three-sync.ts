import * as THREE from 'three';
import * as Cesium from 'cesium';

/**
 * CesiumThreeSync - Synchronizes Three.js camera with Cesium camera
 *
 * This class handles:
 * 1. Camera matrix synchronization (Cesium → Three.js)
 * 2. Coordinate transformation (WGS84 ↔ local Three.js coordinates)
 * 3. ENU (East-North-Up) reference frame handling
 */
export class CesiumThreeSync {
  private cesiumViewer: Cesium.Viewer;
  private threeCamera: THREE.PerspectiveCamera;

  // Origin point in ECEF coordinates (game center)
  private origin: Cesium.Cartesian3;
  // ENU transformation matrix at origin
  private enuMatrix: Cesium.Matrix4;
  private inverseEnuMatrix: Cesium.Matrix4;

  // Debug logging
  private debugFrameCount = 0;

  constructor(cesiumViewer: Cesium.Viewer, originLat: number, originLon: number, originHeight: number = 0) {
    this.cesiumViewer = cesiumViewer;

    // Set up origin at game center with terrain height
    // Using actual terrain height ensures all local coordinates are relative to ground level
    this.origin = Cesium.Cartesian3.fromDegrees(originLon, originLat, originHeight);
    this.enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(this.origin);
    this.inverseEnuMatrix = Cesium.Matrix4.inverse(this.enuMatrix, new Cesium.Matrix4());

    console.log(`[CesiumThreeSync] Origin set at lat=${originLat}, lon=${originLon}, height=${originHeight}`);

    // Three.js camera setup
    this.threeCamera = new THREE.PerspectiveCamera(
      60, // FOV - will be updated dynamically
      window.innerWidth / window.innerHeight,
      0.1,
      10_000_000 // Very large far plane for Cesium scale
    );
    // We use position + lookAt, so matrixAutoUpdate should be true
    this.threeCamera.matrixAutoUpdate = true;
  }

  /**
   * Get the Three.js camera (read-only reference)
   */
  get camera(): THREE.PerspectiveCamera {
    return this.threeCamera;
  }

  /**
   * Update origin point (e.g., when game location changes)
   */
  setOrigin(lat: number, lon: number, height: number = 0): void {
    this.origin = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    this.enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(this.origin);
    this.inverseEnuMatrix = Cesium.Matrix4.inverse(this.enuMatrix, new Cesium.Matrix4());
    console.log(`[CesiumThreeSync] Origin updated to lat=${lat}, lon=${lon}, height=${height}`);
  }

  /**
   * Synchronize Three.js camera with Cesium camera
   *
   * Uses Cesium's view matrix directly for pixel-perfect synchronization.
   * The view matrix is transformed from ECEF to local ENU space.
   *
   * Call this every frame AFTER Cesium has rendered but BEFORE Three.js renders
   */
  syncCamera(): void {
    const cesiumCamera = this.cesiumViewer.camera;

    // Get Cesium's view matrix (transforms world to camera space)
    const cesiumViewMatrix = cesiumCamera.viewMatrix;

    // We need to compose: local → ECEF → camera
    // local → ECEF is enuMatrix
    // ECEF → camera is viewMatrix
    // Combined: viewMatrix * enuMatrix transforms local to camera space

    // But Three.js view matrix is the inverse of the camera's world matrix
    // So we need the inverse: (viewMatrix * enuMatrix)^-1 = enuMatrix^-1 * viewMatrix^-1

    // First, compute Cesium camera position in local ENU
    const cameraPositionECEF = cesiumCamera.positionWC;
    const localCameraPos = Cesium.Matrix4.multiplyByPoint(
      this.inverseEnuMatrix,
      cameraPositionECEF,
      new Cesium.Cartesian3()
    );

    // Get camera axes in ECEF, transform to local ENU
    const rightECEF = cesiumCamera.rightWC;
    const upECEF = cesiumCamera.upWC;
    const directionECEF = cesiumCamera.directionWC;

    const localRight = Cesium.Matrix4.multiplyByPointAsVector(
      this.inverseEnuMatrix,
      rightECEF,
      new Cesium.Cartesian3()
    );
    const localUp = Cesium.Matrix4.multiplyByPointAsVector(
      this.inverseEnuMatrix,
      upECEF,
      new Cesium.Cartesian3()
    );
    const localDir = Cesium.Matrix4.multiplyByPointAsVector(
      this.inverseEnuMatrix,
      directionECEF,
      new Cesium.Cartesian3()
    );

    // Convert ENU to Three.js coordinate system
    // ENU: X=East, Y=North, Z=Up → Three.js: X=right, Y=up, Z=back
    // Mapping: East→X, Up→Y, North→-Z

    // Camera position in Three.js space
    const threePos = new THREE.Vector3(localCameraPos.x, localCameraPos.z, -localCameraPos.y);

    // Camera axes in Three.js space
    // Cesium right → Three.js right (X)
    const threeRight = new THREE.Vector3(localRight.x, localRight.z, -localRight.y).normalize();
    // Cesium up → Three.js up (Y)
    const threeUp = new THREE.Vector3(localUp.x, localUp.z, -localUp.y).normalize();
    // Cesium direction → Three.js -Z (looking direction)
    const threeDir = new THREE.Vector3(localDir.x, localDir.z, -localDir.y).normalize();

    // Build camera matrix directly from basis vectors
    // Three.js camera looks down -Z, so:
    // matrixWorld column 0 = right
    // matrixWorld column 1 = up
    // matrixWorld column 2 = -direction (backward)
    // matrixWorld column 3 = position
    this.threeCamera.matrixAutoUpdate = false;
    this.threeCamera.matrix.makeBasis(
      threeRight,
      threeUp,
      threeDir.clone().negate() // Three.js Z points backward
    );
    this.threeCamera.matrix.setPosition(threePos);
    this.threeCamera.matrixWorld.copy(this.threeCamera.matrix);
    this.threeCamera.matrixWorldInverse.copy(this.threeCamera.matrix).invert();

    // Debug logging (every 300 frames)
    this.debugFrameCount++;
    if (this.debugFrameCount % 300 === 1) {
      console.log('[CesiumThreeSync] Camera pos:', threePos.x.toFixed(1), threePos.y.toFixed(1), threePos.z.toFixed(1));
      console.log('[CesiumThreeSync] Camera right:', threeRight.x.toFixed(3), threeRight.y.toFixed(3), threeRight.z.toFixed(3));
    }

    // Sync projection from Cesium
    const frustum = cesiumCamera.frustum as Cesium.PerspectiveFrustum;
    if (
      frustum.fovy !== undefined &&
      frustum.aspectRatio !== undefined &&
      frustum.near !== undefined &&
      frustum.far !== undefined
    ) {
      this.threeCamera.fov = Cesium.Math.toDegrees(frustum.fovy);
      this.threeCamera.aspect = frustum.aspectRatio;
      this.threeCamera.near = frustum.near;
      this.threeCamera.far = frustum.far;
      this.threeCamera.updateProjectionMatrix();
    }
  }

  /**
   * Convert WGS84 coordinates to local Three.js coordinates
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @param height - Height in meters (above WGS84 ellipsoid)
   * @returns Three.js Vector3 in local coordinates (meters, relative to origin)
   */
  geoToLocal(lat: number, lon: number, height: number): THREE.Vector3 {
    // WGS84 → ECEF
    const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, height);

    // ECEF → ENU (local East-North-Up at origin)
    const local = Cesium.Matrix4.multiplyByPoint(
      this.inverseEnuMatrix,
      cartesian,
      new Cesium.Cartesian3()
    );

    // ENU (East-North-Up) → Three.js (X-right, Y-up, Z-back)
    // East → X (right)
    // North → -Z (forward in Three.js is -Z)
    // Up → Y
    return new THREE.Vector3(local.x, local.z, -local.y);
  }

  /**
   * Convert local Three.js coordinates to WGS84
   *
   * @param vec - Three.js Vector3 in local coordinates
   * @returns Object with lat, lon (degrees), height (meters)
   */
  localToGeo(vec: THREE.Vector3): { lat: number; lon: number; height: number } {
    // Three.js → ENU
    // X → East
    // Y → Up
    // -Z → North
    const enu = new Cesium.Cartesian3(vec.x, -vec.z, vec.y);

    // ENU → ECEF
    const ecef = Cesium.Matrix4.multiplyByPoint(this.enuMatrix, enu, new Cesium.Cartesian3());

    // ECEF → WGS84
    const cartographic = Cesium.Cartographic.fromCartesian(ecef);

    return {
      lat: Cesium.Math.toDegrees(cartographic.latitude),
      lon: Cesium.Math.toDegrees(cartographic.longitude),
      height: cartographic.height,
    };
  }

  /**
   * Get distance from origin to a geo position (in meters)
   */
  distanceFromOrigin(lat: number, lon: number): number {
    const local = this.geoToLocal(lat, lon, 0);
    return Math.sqrt(local.x * local.x + local.z * local.z);
  }

  /**
   * Calculate heading angle from one geo position to another
   * Returns heading in radians (0 = North, PI/2 = East)
   */
  calculateHeading(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
    const from = this.geoToLocal(fromLat, fromLon, 0);
    const to = this.geoToLocal(toLat, toLon, 0);

    const dx = to.x - from.x;
    const dz = to.z - from.z;

    // atan2 gives angle from positive X axis (East)
    // Convert to heading from -Z axis (North in Three.js)
    // Three.js: -Z is forward, so North is -Z
    // atan2(-dz, dx) gives angle from East, counterclockwise
    // We need angle from North (which is -Z direction)
    return Math.atan2(dx, -dz);
  }

  /**
   * Resize handler - update aspect ratio
   */
  resize(width: number, height: number): void {
    this.threeCamera.aspect = width / height;
    this.threeCamera.updateProjectionMatrix();
  }
}
