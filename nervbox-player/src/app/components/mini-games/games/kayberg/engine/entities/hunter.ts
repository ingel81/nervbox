import * as THREE from 'three';
import { COLORS } from '../../kayberg.types';
import { ProjectileEntity } from './projectile';

export class HunterEntity {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;

  canShoot: boolean = true;
  lastShotTime: number = 0;
  fireRate: number; // ms between shots
  targetPosition: THREE.Vector3;

  private gunMesh!: THREE.Group;
  private getTerrainHeight: (x: number, z: number) => number;

  constructor(
    position: THREE.Vector3,
    fireRate: number,
    getTerrainHeight: (x: number, z: number) => number
  ) {
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.fireRate = fireRate;
    this.targetPosition = new THREE.Vector3();
    this.getTerrainHeight = getTerrainHeight;

    // Set height to terrain
    this.position.y = getTerrainHeight(position.x, position.z);

    this.mesh = this.createMesh();
    this.mesh.position.copy(this.position);
  }

  private createMesh(): THREE.Group {
    const group = new THREE.Group();

    // Body (cylinder for jacket)
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.5, 1.6, 12);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: COLORS.hunterJacket });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.8;
    group.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 12, 12);
    const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac });
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.9;
    group.add(head);

    // Hat
    const hatBrimGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16);
    const hatMaterial = new THREE.MeshLambertMaterial({ color: COLORS.hunterHat });
    const hatBrim = new THREE.Mesh(hatBrimGeometry, hatMaterial);
    hatBrim.position.y = 2.15;
    group.add(hatBrim);

    const hatTopGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.25, 12);
    const hatTop = new THREE.Mesh(hatTopGeometry, hatMaterial);
    hatTop.position.y = 2.3;
    group.add(hatTop);

    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3728 });

    const leftLeg = new THREE.Mesh(legGeometry, pantsMaterial);
    leftLeg.position.set(-0.2, 0.4, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, pantsMaterial);
    rightLeg.position.set(0.2, 0.4, 0);
    group.add(rightLeg);

    // Gun
    this.gunMesh = this.createGun();
    this.gunMesh.position.set(0.5, 1.3, 0);
    group.add(this.gunMesh);

    group.castShadow = true;

    return group;
  }

  private createGun(): THREE.Group {
    const gun = new THREE.Group();

    const barrelGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
    const metalMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const barrel = new THREE.Mesh(barrelGeometry, metalMaterial);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 0.6;
    gun.add(barrel);

    const stockGeometry = new THREE.BoxGeometry(0.4, 0.15, 0.1);
    const woodMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const stock = new THREE.Mesh(stockGeometry, woodMaterial);
    gun.add(stock);

    return gun;
  }

  update(deltaTime: number, playerPosition: THREE.Vector3): void {
    // Update target
    this.targetPosition.copy(playerPosition);

    // Face the target
    const direction = new THREE.Vector3()
      .subVectors(this.targetPosition, this.position)
      .normalize();

    const targetAngle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = targetAngle;

    // Aim gun up/down
    const horizontalDist = Math.sqrt(
      Math.pow(this.targetPosition.x - this.position.x, 2) +
      Math.pow(this.targetPosition.z - this.position.z, 2)
    );
    const verticalDist = this.targetPosition.y - this.position.y - 1.3;
    const pitchAngle = Math.atan2(verticalDist, horizontalDist);
    this.gunMesh.rotation.z = Math.PI / 2 - pitchAngle;

    // Update shooting cooldown
    const now = Date.now();
    this.canShoot = now - this.lastShotTime >= this.fireRate;
  }

  shoot(): ProjectileEntity | null {
    if (!this.canShoot) return null;

    this.lastShotTime = Date.now();
    this.canShoot = false;

    // Calculate shoot direction with some inaccuracy
    const direction = new THREE.Vector3()
      .subVectors(this.targetPosition, this.position)
      .normalize();

    // Add some spread
    const spread = 0.1;
    direction.x += (Math.random() - 0.5) * spread;
    direction.y += (Math.random() - 0.5) * spread;
    direction.z += (Math.random() - 0.5) * spread;
    direction.normalize();

    // Spawn position at gun barrel
    const spawnPos = this.position.clone();
    spawnPos.y += 1.3;
    spawnPos.add(direction.clone().multiplyScalar(1.5));

    return new ProjectileEntity(spawnPos, direction, 50);
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
