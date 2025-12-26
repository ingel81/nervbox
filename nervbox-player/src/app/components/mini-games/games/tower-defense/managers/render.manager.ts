import { Injectable } from '@angular/core';
import * as Cesium from 'cesium';
import { Renderer } from '../game-components/render.component';

/**
 * Manages renderer registry
 */
@Injectable()
export class RenderManager {
  private renderers = new Map<string, Renderer>();
  private viewer: Cesium.Viewer | null = null;

  initialize(viewer: Cesium.Viewer): void {
    this.viewer = viewer;
  }

  /**
   * Register a renderer for a specific type
   */
  registerRenderer(type: string, renderer: Renderer): void {
    this.renderers.set(type, renderer);
  }

  /**
   * Get a renderer by type
   */
  getRenderer(type: string): Renderer {
    const renderer = this.renderers.get(type);
    if (!renderer) {
      throw new Error(`Renderer '${type}' not registered`);
    }
    return renderer;
  }

  /**
   * Check if a renderer is registered
   */
  hasRenderer(type: string): boolean {
    return this.renderers.has(type);
  }
}
