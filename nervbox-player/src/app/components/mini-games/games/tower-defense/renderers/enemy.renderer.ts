import * as Cesium from 'cesium';
import { Renderer, RenderResult, RenderConfig } from '../game-components/render.component';
import { GeoPosition } from '../models/game.types';
import { EnemyTypeConfig } from '../models/enemy-types';

export interface EnemyRenderConfig extends RenderConfig {
  position: GeoPosition;
  terrainHeight: number;
  typeConfig: EnemyTypeConfig;
}

/**
 * EnemyRenderer - Implements Renderer interface for Enemy entities
 */
export class EnemyRenderer implements Renderer {
  /**
   * Create Cesium entities for an enemy
   */
  create(viewer: Cesium.Viewer, config: EnemyRenderConfig): RenderResult {
    const { position, terrainHeight, typeConfig } = config;
    const cesiumPosition = Cesium.Cartesian3.fromDegrees(
      position.lon,
      position.lat,
      terrainHeight
    );

    // Placeholder entity for position tracking
    const entity = viewer.entities.add({
      position: cesiumPosition,
      point: { pixelSize: 1, color: Cesium.Color.TRANSPARENT },
    });

    // Health bar entity - use Canvas like old implementation (DataURL caused flickering)
    const healthBarCanvas = EnemyRenderer.createHealthBarCanvas(1.0);
    const healthBarEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        position.lon,
        position.lat,
        terrainHeight + typeConfig.healthBarOffset
      ),
      billboard: {
        image: healthBarCanvas,
        scale: 0.5,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Model will be loaded async and attached to result
    // We add a _destroyed flag to handle cleanup of async-loaded models
    // _lastHealthPercent tracks HP to avoid unnecessary image updates (causes flickering)
    const result: RenderResult & { _destroyed?: boolean; _lastHealthPercent?: number } = {
      entity,
      model: null,
      additionalEntities: [healthBarEntity],
      _lastHealthPercent: 1.0,
    };

    // Load 3D model asynchronously
    Cesium.Model.fromGltfAsync({
      url: typeConfig.modelUrl,
      scale: typeConfig.scale,
      minimumPixelSize: typeConfig.minimumPixelSize,
    }).then((model) => {
      // Check if entity was already destroyed before model finished loading
      if (result._destroyed) {
        // Don't add to scene, entity was already cleaned up
        return;
      }

      viewer.scene.primitives.add(model);
      result.model = model;

      const hpr = new Cesium.HeadingPitchRoll(0, 0, 0);
      model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(cesiumPosition, hpr);
    });

    return result;
  }

  /**
   * Update enemy visual representation
   */
  update(
    result: RenderResult & { _lastHealthPercent?: number },
    data: { position: GeoPosition; terrainHeight: number; heading: number; healthPercent: number; healthBarOffset?: number }
  ): void {
    const { position, terrainHeight, heading, healthPercent, healthBarOffset = 8 } = data;
    const cesiumPosition = Cesium.Cartesian3.fromDegrees(position.lon, position.lat, terrainHeight);

    // Update model position and rotation
    if (result.model) {
      const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0);
      result.model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(cesiumPosition, hpr);
    }

    // Update placeholder entity position
    if (result.entity?.position) {
      (result.entity.position as Cesium.ConstantPositionProperty).setValue(cesiumPosition);
    }

    // Update health bar position (always) - use direct assignment like old implementation
    const healthBarEntity = result.additionalEntities[0];
    if (healthBarEntity) {
      // Direct assignment instead of setValue() to prevent flickering
      (healthBarEntity.position as unknown) = Cesium.Cartesian3.fromDegrees(
        position.lon, position.lat, terrainHeight + healthBarOffset
      );

      // Only update health bar IMAGE when HP actually changes (prevents flickering)
      if (healthBarEntity.billboard && result._lastHealthPercent !== healthPercent) {
        result._lastHealthPercent = healthPercent;
        // Use Canvas directly instead of DataURL (like old implementation)
        (healthBarEntity.billboard.image as Cesium.Property) = new Cesium.ConstantProperty(
          EnemyRenderer.createHealthBarCanvas(healthPercent)
        );
      }
    }
  }

  /**
   * Destroy enemy visual representation
   */
  destroy(viewer: Cesium.Viewer, result: RenderResult & { _destroyed?: boolean }): void {
    // Mark as destroyed to prevent async model from being added to scene
    result._destroyed = true;

    if (result.model) {
      viewer.scene.primitives.remove(result.model);
    }
    if (result.entity) {
      viewer.entities.remove(result.entity);
    }
    for (const entity of result.additionalEntities) {
      viewer.entities.remove(entity);
    }
  }

  /**
   * Start walk animation
   */
  startWalkAnimation(result: RenderResult, typeConfig: EnemyTypeConfig): void {
    if (!result.model?.ready || !typeConfig.hasAnimations || !typeConfig.walkAnimation) return;

    result.model.activeAnimations.add({
      name: typeConfig.walkAnimation,
      loop: Cesium.ModelAnimationLoop.REPEAT,
      multiplier: typeConfig.animationSpeed ?? 1.0,
      startTime: Cesium.JulianDate.now(),
    });
  }

  /**
   * Play death animation
   */
  playDeathAnimation(result: RenderResult & { _destroyed?: boolean }, typeConfig: EnemyTypeConfig): void {
    console.log('[EnemyRenderer] playDeathAnimation called', {
      hasAnimations: typeConfig.hasAnimations,
      deathAnimation: typeConfig.deathAnimation,
      modelExists: !!result.model,
      modelReady: result.model?.ready,
      destroyed: result._destroyed,
    });

    if (!typeConfig.hasAnimations || !typeConfig.deathAnimation) {
      console.log('[EnemyRenderer] No death animation configured');
      return;
    }

    const playAnimation = () => {
      console.log('[EnemyRenderer] playAnimation executing', {
        destroyed: result._destroyed,
        model: !!result.model,
        ready: result.model?.ready,
      });

      if (result._destroyed || !result.model) {
        console.log('[EnemyRenderer] Cannot play - destroyed or no model');
        return;
      }

      console.log('[EnemyRenderer] Playing death animation:', typeConfig.deathAnimation);
      result.model.activeAnimations.removeAll();
      result.model.activeAnimations.add({
        name: typeConfig.deathAnimation!,
        loop: Cesium.ModelAnimationLoop.NONE,
        multiplier: 1.0,
      });
    };

    // If model is ready, play immediately
    if (result.model?.ready) {
      console.log('[EnemyRenderer] Model ready, playing immediately');
      playAnimation();
    } else if (result.model) {
      // Model exists but not ready - wait for ready event
      console.log('[EnemyRenderer] Model exists but not ready, waiting...');
      result.model.readyEvent.addEventListener(playAnimation);
    } else {
      // Model not loaded yet - poll until it's available
      console.log('[EnemyRenderer] Model not loaded, polling...');
      const checkModel = () => {
        if (result._destroyed) {
          console.log('[EnemyRenderer] Poll: destroyed, stopping');
          return;
        }
        if (result.model?.ready) {
          console.log('[EnemyRenderer] Poll: model ready, playing');
          playAnimation();
        } else if (result.model) {
          console.log('[EnemyRenderer] Poll: model exists, waiting for ready');
          result.model.readyEvent.addEventListener(playAnimation);
        } else {
          console.log('[EnemyRenderer] Poll: no model yet, retry...');
          setTimeout(checkModel, 50);
        }
      };
      setTimeout(checkModel, 50);
    }
  }

  // Static utility methods (preserved for backwards compatibility)
  static createEnemyCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = 40;
    canvas.height = 50;

    const centerX = canvas.width / 2;
    const radius = 16;

    // Glow effect
    const gradient = ctx.createRadialGradient(centerX, radius + 5, 0, centerX, radius + 5, radius + 10);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Main body
    ctx.beginPath();
    ctx.arc(centerX, radius + 5, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(centerX - 5, radius + 2, 4, 0, Math.PI * 2);
    ctx.arc(centerX + 5, radius + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(centerX - 4, radius + 3, 2, 0, Math.PI * 2);
    ctx.arc(centerX + 6, radius + 3, 2, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  /**
   * Create health bar as data URL (more reliable than canvas element)
   */
  static createHealthBarDataUrl(healthPercent: number): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Größere Health Bar für bessere Sichtbarkeit
    const width = 80;
    const height = 16;
    canvas.width = width;
    canvas.height = height;

    // Background mit mehr Kontrast
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Health fill
    const healthWidth = (width - 6) * Math.max(0, Math.min(1, healthPercent));

    let fillColor: string;
    if (healthPercent > 0.6) {
      fillColor = '#22c55e';
    } else if (healthPercent > 0.3) {
      fillColor = '#eab308';
    } else {
      fillColor = '#ef4444';
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(3, 3, healthWidth, height - 6);

    return canvas.toDataURL('image/png');
  }

  static createHealthBarCanvas(healthPercent: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Größere Health Bar für bessere Sichtbarkeit
    const width = 60;
    const height = 12;
    canvas.width = width;
    canvas.height = height;

    // Background mit mehr Kontrast
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Health fill
    const healthWidth = (width - 6) * Math.max(0, Math.min(1, healthPercent));

    let fillColor: string;
    if (healthPercent > 0.6) {
      fillColor = '#22c55e';
    } else if (healthPercent > 0.3) {
      fillColor = '#eab308';
    } else {
      fillColor = '#ef4444';
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(3, 3, healthWidth, height - 6);

    return canvas;
  }

  static updateHealthBar(entity: Cesium.Entity, healthPercent: number): void {
    const billboard = entity.billboard;
    if (billboard) {
      (billboard.image as Cesium.Property) = new Cesium.ConstantProperty(
        EnemyRenderer.createHealthBarCanvas(healthPercent)
      );
    }
  }
}
