import * as Cesium from 'cesium';
import { Component } from '../core/component';
import { GameObject } from '../core/game-object';
import { GeoPosition } from '../models/game.types';

/**
 * TransformComponent handles position, rotation, and scale of a GameObject
 */
export class TransformComponent extends Component {
  position: GeoPosition = { lat: 0, lon: 0, height: 0 };
  rotation = 0; // Heading in radians
  scale = 1.0;
  terrainHeight = 235; // Default terrain height

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
   * Look at a target position (updates rotation)
   */
  lookAt(target: GeoPosition): void {
    const dLon = target.lon - this.position.lon;
    const dLat = target.lat - this.position.lat;
    // Model faces -Y in local coords, so subtract PI/2 to align with movement direction
    this.rotation = Math.atan2(dLon, dLat) - Math.PI / 2;
  }

  /**
   * Get heading, pitch, roll for Cesium
   */
  getHeadingPitchRoll(): Cesium.HeadingPitchRoll {
    return new Cesium.HeadingPitchRoll(this.rotation, 0, 0);
  }

  update(deltaTime: number): void {
    // Transform doesn't need per-frame updates (position updated by other components)
  }
}
