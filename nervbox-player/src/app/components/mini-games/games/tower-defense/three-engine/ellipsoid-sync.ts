import * as THREE from 'three';
import { MathUtils } from 'three';
import { WGS84_ELLIPSOID } from '3d-tiles-renderer';
import { ENU_FRAME } from '3d-tiles-renderer/src/three/renderer/math/Ellipsoid.js';
import type { TilesRenderer } from '3d-tiles-renderer';

/**
 * EllipsoidSync - Coordinate transformation utilities for 3DTilesRendererJS
 *
 * Replaces CesiumThreeSync - handles WGS84 ↔ Three.js coordinate transformations
 * using the 3DTilesRendererJS ellipsoid utilities.
 *
 * When ReorientationPlugin is used with recenter:true, the origin (HQ) is at (0,0,0)
 * and coordinates are in meters relative to that origin.
 */
export class EllipsoidSync {
  private tilesRenderer: TilesRenderer | null = null;

  // Origin in radians
  private originLatRad: number;
  private originLonRad: number;
  private originHeight: number;

  // Cached transformation matrices
  private originMatrix = new THREE.Matrix4();
  private inverseOriginMatrix = new THREE.Matrix4();

  // Temporary vectors for calculations (avoid allocations)
  private tempVec3 = new THREE.Vector3();
  private tempMatrix = new THREE.Matrix4();

  constructor(originLat: number, originLon: number, originHeight: number = 0) {
    this.originLatRad = originLat * MathUtils.DEG2RAD;
    this.originLonRad = originLon * MathUtils.DEG2RAD;
    this.originHeight = originHeight;
    this.updateOriginMatrix();
  }

  /**
   * Set the TilesRenderer reference (needed for coordinate transformations)
   */
  setTilesRenderer(tiles: TilesRenderer): void {
    this.tilesRenderer = tiles;
  }

  /**
   * Update origin point (e.g., when game location changes)
   */
  setOrigin(lat: number, lon: number, height: number = 0): void {
    this.originLatRad = lat * MathUtils.DEG2RAD;
    this.originLonRad = lon * MathUtils.DEG2RAD;
    this.originHeight = height;
    this.updateOriginMatrix();
    console.log(`[EllipsoidSync] Origin updated to lat=${lat}, lon=${lon}, height=${height}`);
  }

  private updateOriginMatrix(): void {
    // Get the ENU (East-North-Up) frame at origin
    WGS84_ELLIPSOID.getRotationMatrixFromAzElRoll(
      this.originLatRad,
      this.originLonRad,
      0, // azimuth
      0, // elevation
      0, // roll
      this.originMatrix,
      ENU_FRAME
    );

    // Get position and add to matrix
    const originPos = new THREE.Vector3();
    WGS84_ELLIPSOID.getCartographicToPosition(
      this.originLatRad,
      this.originLonRad,
      this.originHeight,
      originPos
    );
    this.originMatrix.setPosition(originPos);

    // Compute inverse for world-to-local transformations
    this.inverseOriginMatrix.copy(this.originMatrix).invert();
  }

  /**
   * Convert WGS84 coordinates to local Three.js coordinates
   *
   * With ReorientationPlugin, tiles are centered on origin, so we calculate
   * the offset from origin in the local ENU frame.
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @param height - Height in meters (above WGS84 ellipsoid)
   * @returns Three.js Vector3 in local coordinates (meters, relative to origin)
   */
  geoToLocal(lat: number, lon: number, height: number): THREE.Vector3 {
    const latRad = lat * MathUtils.DEG2RAD;
    const lonRad = lon * MathUtils.DEG2RAD;

    // Get ECEF position for target point
    const targetPos = new THREE.Vector3();
    WGS84_ELLIPSOID.getCartographicToPosition(latRad, lonRad, height, targetPos);

    // If we have tiles renderer with group transform, apply it
    if (this.tilesRenderer) {
      // Transform from ECEF to tiles group local space
      const invGroupMatrix = this.tilesRenderer.group.matrixWorld.clone().invert();
      targetPos.applyMatrix4(invGroupMatrix);
    } else {
      // Without tiles renderer, use our own inverse origin matrix
      targetPos.applyMatrix4(this.inverseOriginMatrix);
    }

    return targetPos;
  }

  /**
   * Convert local Three.js coordinates to WGS84
   *
   * @param vec - Three.js Vector3 in local coordinates
   * @returns Object with lat, lon (degrees), height (meters)
   */
  localToGeo(vec: THREE.Vector3): { lat: number; lon: number; height: number } {
    // Transform from local to ECEF
    const ecefPos = vec.clone();

    if (this.tilesRenderer) {
      // Apply tiles group world matrix
      ecefPos.applyMatrix4(this.tilesRenderer.group.matrixWorld);
    } else {
      // Use our origin matrix
      ecefPos.applyMatrix4(this.originMatrix);
    }

    // Convert ECEF to cartographic
    const result: { lat: number; lon: number; height: number } = { lat: 0, lon: 0, height: 0 };
    WGS84_ELLIPSOID.getPositionToCartographic(ecefPos, result);

    return {
      lat: result.lat * MathUtils.RAD2DEG,
      lon: result.lon * MathUtils.RAD2DEG,
      height: result.height,
    };
  }

  /**
   * Get distance from origin to a geo position (in meters, horizontal only)
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

    // With ReorientationPlugin: -X = East, +Z = North
    // atan2(-dx, dz) gives angle from North clockwise
    return Math.atan2(-dx, dz);
  }

  /**
   * Get origin coordinates
   */
  getOrigin(): { lat: number; lon: number; height: number } {
    return {
      lat: this.originLatRad * MathUtils.RAD2DEG,
      lon: this.originLonRad * MathUtils.RAD2DEG,
      height: this.originHeight,
    };
  }

  /**
   * Simple geo to local conversion using Haversine distance
   *
   * This method doesn't depend on tilesRenderer.group.matrixWorld,
   * making it reliable even before the first render.
   *
   * With ReorientationPlugin (recenter: true) + tiles.group.rotation.x = -PI/2:
   * - X = East/West offset (-X = East, +X = West)
   * - Y = Height above origin (+Y = Up)
   * - Z = North/South offset (+Z = North, -Z = South)
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   * @param height - Height in meters (above ground/ellipsoid)
   * @returns Three.js Vector3 in local coordinates
   */
  geoToLocalSimple(lat: number, lon: number, height: number): THREE.Vector3 {
    const originLat = this.originLatRad * MathUtils.RAD2DEG;
    const originLon = this.originLonRad * MathUtils.RAD2DEG;

    // Calculate East offset (X)
    // With ReorientationPlugin: -X = East, +X = West
    const eastDist = this.haversineDistance(originLat, originLon, originLat, lon);
    const eastSign = lon > originLon ? -1 : 1; // Inverted: East is negative X

    // Calculate North offset (Z)
    // With ReorientationPlugin + tiles.group.rotation.x = -PI/2:
    // +Z = North, -Z = South
    const northDist = this.haversineDistance(originLat, originLon, lat, originLon);
    const northSign = lat > originLat ? 1 : -1;

    return new THREE.Vector3(
      eastDist * eastSign, // -X = East
      height - this.originHeight,
      northDist * northSign // +Z = North
    );
  }

  /**
   * @deprecated Use geoToLocalSimple() with overlayGroup instead
   *
   * This method was for adding objects directly inside tilesRenderer.group
   * but that approach doesn't work well due to ECEF coordinates.
   * Use overlayGroup (in scene root) with delta synchronization instead.
   */
  geoToGroupLocal(lat: number, lon: number, height: number): THREE.Vector3 {
    const simple = this.geoToLocalSimple(lat, lon, height);
    // Legacy transform - no longer needed with overlayGroup approach
    return new THREE.Vector3(simple.x, -simple.z, -simple.y);
  }

  /**
   * Haversine distance between two points in meters
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * MathUtils.DEG2RAD;
    const dLon = (lon2 - lon1) * MathUtils.DEG2RAD;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * MathUtils.DEG2RAD) *
        Math.cos(lat2 * MathUtils.DEG2RAD) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
