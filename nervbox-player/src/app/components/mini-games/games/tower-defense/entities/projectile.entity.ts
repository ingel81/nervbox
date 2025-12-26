import { GameObject } from '../core/game-object';
import { ComponentType } from '../core/component';
import {
  TransformComponent,
  CombatComponent,
  MovementComponent,
  RenderComponent,
} from '../game-components';
import { GeoPosition } from '../models/game.types';
import {
  ProjectileTypeId,
  getProjectileType,
  ProjectileTypeConfig,
} from '../configs/projectile-types.config';
import { Enemy } from './enemy.entity';

/**
 * Projectile entity - combines Transform, Combat, Movement, and Render components
 */
export class Projectile extends GameObject {
  readonly typeConfig: ProjectileTypeConfig;
  readonly targetEnemy: Enemy;

  private _transform!: TransformComponent;
  private _combat!: CombatComponent;
  private _movement!: MovementComponent;
  private _render!: RenderComponent;

  constructor(
    startPosition: GeoPosition,
    targetEnemy: Enemy,
    typeId: ProjectileTypeId,
    damage: number
  ) {
    super('projectile');
    this.typeConfig = getProjectileType(typeId);
    this.targetEnemy = targetEnemy;

    // Add components
    this._transform = this.addComponent(
      new TransformComponent(this),
      ComponentType.TRANSFORM
    );
    this._combat = this.addComponent(
      new CombatComponent(this, {
        damage,
        range: 0,
        fireRate: 0,
      }),
      ComponentType.COMBAT
    );
    this._movement = this.addComponent(
      new MovementComponent(this),
      ComponentType.MOVEMENT
    );
    this._render = this.addComponent(
      new RenderComponent(this),
      ComponentType.RENDER
    );

    this._transform.setPosition(startPosition.lat, startPosition.lon, startPosition.height);
    this._movement.speedMps = this.typeConfig.speed;
  }

  get transform(): TransformComponent {
    return this._transform;
  }
  get combat(): CombatComponent {
    return this._combat;
  }
  get movement(): MovementComponent {
    return this._movement;
  }
  get render(): RenderComponent {
    return this._render;
  }

  get position(): GeoPosition {
    return this.transform.position;
  }
  get damage(): number {
    return this.combat.damage;
  }

  /**
   * Move towards target enemy
   * @returns true if hit target, false otherwise
   */
  updateTowardsTarget(deltaTime: number): boolean {
    if (!this.targetEnemy.alive) {
      return false; // Target dead
    }

    const targetPos = this.targetEnemy.position;
    const dist = this.calculateDistance(this.position, targetPos);
    const moveDistance = (this.movement.speedMps * deltaTime) / 1000;

    if (dist <= moveDistance) {
      // Hit target
      this.transform.setPosition(targetPos.lat, targetPos.lon);
      return true;
    }

    // Move towards target
    const ratio = moveDistance / dist;
    const newLat = this.position.lat + (targetPos.lat - this.position.lat) * ratio;
    const newLon = this.position.lon + (targetPos.lon - this.position.lon) * ratio;

    this.transform.setPosition(newLat, newLon);
    this.transform.lookAt(targetPos);

    return false;
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
