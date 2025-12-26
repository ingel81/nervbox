import { GameObject } from '../core/game-object';
import { ComponentType } from '../core/component';
import {
  TransformComponent,
  CombatComponent,
  RenderComponent,
} from '../game-components';
import { GeoPosition } from '../models/game.types';
import { TowerTypeId, getTowerType, TowerTypeConfig } from '../configs/tower-types.config';
import { Enemy } from './enemy.entity';

/**
 * Tower entity - combines Transform, Combat, and Render components
 */
export class Tower extends GameObject {
  readonly typeConfig: TowerTypeConfig;

  private _transform!: TransformComponent;
  private _combat!: CombatComponent;
  private _render!: RenderComponent;

  selected = false;

  constructor(position: GeoPosition, typeId: TowerTypeId) {
    super('tower');
    this.typeConfig = getTowerType(typeId);

    // Add components
    this._transform = this.addComponent(
      new TransformComponent(this),
      ComponentType.TRANSFORM
    );
    this._combat = this.addComponent(
      new CombatComponent(this, {
        damage: this.typeConfig.damage,
        range: this.typeConfig.range,
        fireRate: this.typeConfig.fireRate,
      }),
      ComponentType.COMBAT
    );
    this._render = this.addComponent(
      new RenderComponent(this),
      ComponentType.RENDER
    );

    this._transform.setPosition(position.lat, position.lon, position.height);
  }

  get transform(): TransformComponent {
    return this._transform;
  }
  get combat(): CombatComponent {
    return this._combat;
  }
  get render(): RenderComponent {
    return this._render;
  }

  get position(): GeoPosition {
    return this.transform.position;
  }

  /**
   * Find the closest enemy within range
   */
  findTarget(enemies: Enemy[]): Enemy | null {
    let closest: Enemy | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;

      const dist = this.calculateDistance(this.position, enemy.position);
      if (dist <= this.combat.range && dist < closestDist) {
        closestDist = dist;
        closest = enemy;
      }
    }

    return closest;
  }

  /**
   * Select this tower
   */
  select(): void {
    this.selected = true;
  }

  /**
   * Deselect this tower
   */
  deselect(): void {
    this.selected = false;
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const dLon = ((pos2.lon - pos1.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((pos1.lat * Math.PI) / 180) *
        Math.cos((pos2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
