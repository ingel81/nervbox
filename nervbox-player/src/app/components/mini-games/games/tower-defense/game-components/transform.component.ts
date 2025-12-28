import * as Cesium from 'cesium';
import { Component } from '../core/component';
import { GameObject } from '../core/game-object';
import { GeoPosition } from '../models/game.types';

/**
 * TransformComponent handles position, rotation, and scale of a GameObject
 */
export class TransformComponent extends Component {
  position: GeoPosition = { lat: 0, lon: 0, height: 0 };
  rotation = 0; // Heading in radians (smoothed)
  scale = 1.0;
  terrainHeight = 235; // Default terrain height

  // Rotation smoothing
  private targetRotation = 0;
  private rotationInitialized = false;
  rotationSmoothingFactor = 0.15; // 0 = no smoothing, 1 = instant

  constructor(gameObject: GameObject) {
    super(gameObject);
  }

  /**
   * Set position in geo coordinates
   */
  setPosition(lat: number, lon: number, height?: number): void {
    this.position = { lat, lon, height: height ?? this.position.height };
  }

  /**
   * Get position as Cesium.Cartesian3
   */
  getCartesian3(): Cesium.Cartesian3 {
    return Cesium.Cartesian3.fromDegrees(
      this.position.lon,
      this.position.lat,
      this.terrainHeight
    );
  }

  /**
   * Look at a target position (updates target rotation, smoothed in update)
   */
  lookAt(target: GeoPosition): void {
    const dLon = target.lon - this.position.lon;
    const dLat = target.lat - this.position.lat;

    // Skip if movement is too small (prevents jitter)
    const dist = Math.sqrt(dLon * dLon + dLat * dLat);
    if (dist < 0.0000001) return;

    // Model faces -Y in local coords, so subtract PI/2 to align with movement direction
    this.targetRotation = Math.atan2(dLon, dLat) - Math.PI / 2;

    // Initialize rotation immediately on first call
    if (!this.rotationInitialized) {
      this.rotation = this.targetRotation;
      this.rotationInitialized = true;
    }
  }

  /**
   * Get heading, pitch, roll for Cesium
   */
  getHeadingPitchRoll(): Cesium.HeadingPitchRoll {
    return new Cesium.HeadingPitchRoll(this.rotation, 0, 0);
  }

  update(deltaTime: number): void {
    // Smoothly interpolate rotation towards target
    if (this.rotationInitialized && this.rotation !== this.targetRotation) {
      // Handle angle wrapping (shortest path)
      let diff = this.targetRotation - this.rotation;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      // Lerp towards target
      if (Math.abs(diff) < 0.001) {
        this.rotation = this.targetRotation;
      } else {
        this.rotation += diff * this.rotationSmoothingFactor;
        // Normalize rotation
        while (this.rotation > Math.PI) this.rotation -= 2 * Math.PI;
        while (this.rotation < -Math.PI) this.rotation += 2 * Math.PI;
      }
    }
  }
}
