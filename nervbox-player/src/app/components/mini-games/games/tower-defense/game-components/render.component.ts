import * as Cesium from 'cesium';
import { Component } from '../core/component';
import { GameObject } from '../core/game-object';

/**
 * Renderer interface for different entity types
 */
export interface Renderer {
  create(viewer: Cesium.Viewer, config: RenderConfig): RenderResult;
  update?(result: RenderResult, data: any): void;
  destroy(viewer: Cesium.Viewer, result: RenderResult): void;
}

export interface RenderResult {
  entity: Cesium.Entity | null;
  model: Cesium.Model | null;
  additionalEntities: Cesium.Entity[];
}

export interface RenderConfig {
  [key: string]: any;
}

/**
 * RenderComponent manages visual representation of a GameObject
 */
export class RenderComponent extends Component {
  entity: Cesium.Entity | null = null;
  model: Cesium.Model | null = null;
  additionalEntities: Cesium.Entity[] = []; // Health bars, range indicators, etc.

  private renderer: Renderer | null = null;
  private viewer: Cesium.Viewer | null = null;

  constructor(gameObject: GameObject) {
    super(gameObject);
  }

  /**
   * Initialize rendering with a specific renderer
   */
  initialize(viewer: Cesium.Viewer, renderer: Renderer, config: RenderConfig): void {
    this.viewer = viewer;
    this.renderer = renderer;

    const result = renderer.create(viewer, config);
    this.entity = result.entity;
    this.model = result.model;
    this.additionalEntities = result.additionalEntities;
  }

  /**
   * Show all visual elements
   */
  show(): void {
    if (this.entity) this.entity.show = true;
    this.additionalEntities.forEach(e => e.show = true);
  }

  /**
   * Hide all visual elements
   */
  hide(): void {
    if (this.entity) this.entity.show = false;
    this.additionalEntities.forEach(e => e.show = false);
  }

  /**
   * Update visual representation
   */
  updateVisual(data: any): void {
    if (this.renderer?.update) {
      this.renderer.update(
        {
          entity: this.entity,
          model: this.model,
          additionalEntities: this.additionalEntities,
        },
        data
      );
    }
  }

  update(deltaTime: number): void {
    // Rendering is handled by Cesium's render loop
  }

  override onDestroy(): void {
    if (this.viewer && this.renderer) {
      this.renderer.destroy(this.viewer, {
        entity: this.entity,
        model: this.model,
        additionalEntities: this.additionalEntities,
      });
    }
  }
}
