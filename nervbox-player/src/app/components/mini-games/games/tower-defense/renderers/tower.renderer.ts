import * as Cesium from 'cesium';
import { Renderer, RenderResult, RenderConfig } from '../game-components/render.component';
import { GeoPosition } from '../models/game.types';
import { TowerTypeConfig } from '../configs/tower-types.config';

export interface TowerRenderConfig extends RenderConfig {
  position: GeoPosition;
  typeConfig: TowerTypeConfig;
}

/**
 * TowerRenderer - Implements Renderer interface for Tower entities
 */
export class TowerRenderer implements Renderer {
  /**
   * Create Cesium entities for a tower
   */
  create(viewer: Cesium.Viewer, config: TowerRenderConfig): RenderResult {
    const { position, typeConfig } = config;

    // Tower model entity
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(position.lon, position.lat, 0),
      model: {
        uri: typeConfig.modelUrl,
        scale: typeConfig.scale,
        minimumPixelSize: 0, // 0 = echte Größe, kein Pixel-Clamping beim Zoomen
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });

    // Range indicator entity (hidden by default)
    const rangeEntity = TowerRenderer.createRangeEntity(viewer, position, typeConfig.range, false);

    return {
      entity,
      model: null,
      additionalEntities: [rangeEntity],
    };
  }

  /**
   * Update tower visual representation
   */
  update(result: RenderResult, data: { selected: boolean }): void {
    const rangeEntity = result.additionalEntities[0];
    if (rangeEntity) {
      rangeEntity.show = data.selected;
    }
  }

  /**
   * Destroy tower visual representation
   */
  destroy(viewer: Cesium.Viewer, result: RenderResult): void {
    if (result.entity) {
      viewer.entities.remove(result.entity);
    }
    for (const entity of result.additionalEntities) {
      viewer.entities.remove(entity);
    }
  }

  // Static utility methods (preserved for backwards compatibility)
  static createTowerCanvas(selected = false): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const size = 50;
    canvas.width = 200;
    canvas.height = size + 40;

    const centerX = canvas.width / 2;
    const pinRadius = size / 2;
    const color = selected ? '#22c55e' : '#3b82f6';

    // Selection glow
    if (selected) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 25;
    }

    // Pin circle
    ctx.beginPath();
    ctx.arc(centerX, pinRadius, pinRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Pin point
    ctx.beginPath();
    ctx.moveTo(centerX - 12, pinRadius + pinRadius * 0.7);
    ctx.lineTo(centerX, pinRadius + pinRadius + 15);
    ctx.lineTo(centerX + 12, pinRadius + pinRadius * 0.7);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(centerX, pinRadius, pinRadius * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    // Text
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TOWER', centerX, pinRadius);

    return canvas;
  }

  static createRangeCirclePositions(
    centerLat: number,
    centerLon: number,
    radiusMeters: number,
    segments = 36
  ): Cesium.Cartesian3[] {
    const positions: Cesium.Cartesian3[] = [];
    const earthRadius = 6371000;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      const dLat = ((radiusMeters / earthRadius) * Math.cos(angle) * 180) / Math.PI;
      const dLon =
        ((radiusMeters / earthRadius) * Math.sin(angle) * 180) /
        Math.PI /
        Math.cos((centerLat * Math.PI) / 180);

      positions.push(Cesium.Cartesian3.fromDegrees(centerLon + dLon, centerLat + dLat));
    }

    return positions;
  }

  static createRangeEntity(
    viewer: Cesium.Viewer,
    position: GeoPosition,
    range: number,
    selected = false
  ): Cesium.Entity {
    const positions = TowerRenderer.createRangeCirclePositions(position.lat, position.lon, range);

    // Gefülltes Polygon das auf Terrain UND 3D Tiles gezeichnet wird
    // Nur sichtbar wenn Tower selektiert ist
    return viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        material: Cesium.Color.GREEN.withAlpha(0.35),
        classificationType: Cesium.ClassificationType.BOTH,
      },
      show: selected,
    });
  }

  static updateSelectionState(
    towerEntity: Cesium.Entity,
    rangeEntity: Cesium.Entity | null,
    selected: boolean
  ): void {
    const billboard = towerEntity.billboard;
    if (billboard) {
      (billboard.image as Cesium.Property) = new Cesium.ConstantProperty(
        TowerRenderer.createTowerCanvas(selected)
      );
    }

    // Range nur anzeigen wenn selektiert
    if (rangeEntity) {
      rangeEntity.show = selected;
    }
  }
}
