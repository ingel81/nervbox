import * as THREE from 'three';

export class ProjectileEntity {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isActive: boolean = true;
  damage: number = 1;

  private lifetime: number = 5000; // ms
  private age: number = 0;
  private trail: THREE.Points;

  constructor(position: THREE.Vector3, direction: THREE.Vector3, speed: number = 40) {
    this.position = position.clone();
    this.velocity = direction.normalize().multiplyScalar(speed);

    this.mesh = new THREE.Group();

    // Create visible bullet (bright orange/yellow tracer)
    const bulletGeometry = new THREE.SphereGeometry(0.3, 12, 12);
    const bulletMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600, // Bright orange
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    this.mesh.add(bullet);

    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.4,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.mesh.add(glow);

    // Add trail particles
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(30); // 10 trail points
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMaterial = new THREE.PointsMaterial({
      color: 0xff4400,
      size: 0.2,
      transparent: true,
      opacity: 0.6,
    });
    this.trail = new THREE.Points(trailGeometry, trailMaterial);
    this.mesh.add(this.trail);

    this.mesh.position.copy(this.position);
  }

  update(deltaTime: number): void {
    if (!this.isActive) return;

    const dt = deltaTime / 1000;
    this.age += deltaTime;

    // Check lifetime
    if (this.age > this.lifetime) {
      this.deactivate();
      return;
    }

    // Apply gravity (slight arc)
    this.velocity.y -= 5 * dt;

    // Update position
    this.position.add(this.velocity.clone().multiplyScalar(dt));

    // Check if hit ground
    if (this.position.y < 0) {
      this.deactivate();
      return;
    }

    // Check bounds
    const dist = Math.sqrt(
      this.position.x * this.position.x + this.position.z * this.position.z
    );
    if (dist > 150) {
      this.deactivate();
      return;
    }

    // Update mesh
    this.mesh.position.copy(this.position);
  }

  deactivate(): void {
    this.isActive = false;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
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
