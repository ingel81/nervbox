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
 *
 * IMPORTANT: We store a reference to the result object, not copies of its properties.
 * This allows async model loading to work correctly - when the renderer loads a model
 * asynchronously and updates result.model, it will be reflected here.
 */
export class RenderComponent extends Component {
  private _result: RenderResult | null = null;
  private renderer: Renderer | null = null;
  private viewer: Cesium.Viewer | null = null;

  constructor(gameObject: GameObject) {
    super(gameObject);
  }

  // Getters that delegate to the result object (handles async model loading)
  get entity(): Cesium.Entity | null {
    return this._result?.entity ?? null;
  }

  get model(): Cesium.Model | null {
    return this._result?.model ?? null;
  }

  get additionalEntities(): Cesium.Entity[] {
    return this._result?.additionalEntities ?? [];
  }

  /**
   * Get the raw render result (for passing to renderer.update)
   */
  get result(): RenderResult | null {
    return this._result;
  }

  /**
   * Initialize rendering with a specific renderer
   */
  initialize(viewer: Cesium.Viewer, renderer: Renderer, config: RenderConfig): void {
    this.viewer = viewer;
    this.renderer = renderer;

    // Store reference to result object (not copies of its properties!)
    // This allows async model loading to work correctly
    this._result = renderer.create(viewer, config);
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
    if (this.renderer?.update && this._result) {
      // Pass the actual result object reference so async-loaded model is included
      this.renderer.update(this._result, data);
    }
  }

  update(deltaTime: number): void {
    // Rendering is handled by Cesium's render loop
  }

  override onDestroy(): void {
    if (this.viewer && this.renderer && this._result) {
      // Pass the actual result object so async-loaded model is properly cleaned up
      this.renderer.destroy(this.viewer, this._result);
    }
  }
}
