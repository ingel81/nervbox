import * as Cesium from 'cesium';
import { Renderer, RenderResult, RenderConfig } from '../game-components/render.component';
import { GeoPosition } from '../models/game.types';
import { ProjectileTypeConfig } from '../configs/projectile-types.config';

export interface ProjectileRenderConfig extends RenderConfig {
  position: GeoPosition;
  typeConfig: ProjectileTypeConfig;
}

/**
 * ProjectileRenderer - Implements Renderer interface for Projectile entities
 */
export class ProjectileRenderer implements Renderer {
  /**
   * Create Cesium entity for a projectile
   */
  create(viewer: Cesium.Viewer, config: ProjectileRenderConfig): RenderResult {
    const { position, typeConfig } = config;

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(position.lon, position.lat, 2),
      billboard: {
        image: ProjectileRenderer.createProjectileCanvas(),
        scale: typeConfig.scale ?? 0.5,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    return {
      entity,
      model: null,
      additionalEntities: [],
    };
  }

  /**
   * Update projectile visual representation
   */
  update(result: RenderResult, data: { position: GeoPosition }): void {
    if (result.entity?.position) {
      (result.entity.position as Cesium.ConstantPositionProperty).setValue(
        Cesium.Cartesian3.fromDegrees(data.position.lon, data.position.lat, 2)
      );
    }
  }

  /**
   * Destroy projectile visual representation
   */
  destroy(viewer: Cesium.Viewer, result: RenderResult): void {
    if (result.entity) {
      viewer.entities.remove(result.entity);
    }
  }

  // Static utility methods (preserved for backwards compatibility)
  static createProjectileCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const size = 20;
    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 6;

    // Outer glow
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 1)');
    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.6)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Core
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#93c5fd';
    ctx.fill();

    // Inner bright spot
    ctx.beginPath();
    ctx.arc(centerX - 1, centerY - 1, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    return canvas;
  }
}
