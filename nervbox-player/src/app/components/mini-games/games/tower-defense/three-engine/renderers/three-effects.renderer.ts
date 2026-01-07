import * as THREE from 'three';
import { CesiumThreeSync } from '../cesium-three-sync';

/**
 * Particle data for GPU
 */
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

/**
 * Active effect instance
 */
interface EffectInstance {
  id: string;
  type: 'blood' | 'fire' | 'explosion' | 'smoke';
  particles: Particle[];
  startTime: number;
  duration: number;
  localPosition: THREE.Vector3;
}

/**
 * ThreeEffectsRenderer - Renders particle effects using Three.js
 *
 * Effects:
 * - Blood splatter (on enemy hit)
 * - Fire/smoke (on base damage)
 * - Explosions (on projectile impact)
 *
 * Uses THREE.Points with custom shader for GPU-accelerated particles.
 */
export class ThreeEffectsRenderer {
  private scene: THREE.Scene;
  private sync: CesiumThreeSync;

  // Particle systems
  private bloodParticles: THREE.Points | null = null;
  private fireParticles: THREE.Points | null = null;

  // Active effects
  private activeEffects = new Map<string, EffectInstance>();
  private effectIdCounter = 0;

  // Blood particle pool
  private bloodPool: Particle[] = [];
  private readonly MAX_BLOOD_PARTICLES = 1000;

  // Fire particle pool
  private firePool: Particle[] = [];
  private readonly MAX_FIRE_PARTICLES = 2000;

  // Shared materials
  private bloodMaterial: THREE.PointsMaterial;
  private fireMaterial: THREE.PointsMaterial;

  constructor(scene: THREE.Scene, sync: CesiumThreeSync) {
    this.scene = scene;
    this.sync = sync;

    // Create blood material
    this.bloodMaterial = new THREE.PointsMaterial({
      color: 0xcc0000,
      size: 0.5,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
    });

    // Create fire material
    this.fireMaterial = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 1.0,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.initParticleSystems();
  }

  /**
   * Initialize particle systems
   */
  private initParticleSystems(): void {
    // Blood particles
    const bloodGeometry = new THREE.BufferGeometry();
    const bloodPositions = new Float32Array(this.MAX_BLOOD_PARTICLES * 3);
    const bloodColors = new Float32Array(this.MAX_BLOOD_PARTICLES * 3);

    bloodGeometry.setAttribute('position', new THREE.BufferAttribute(bloodPositions, 3));
    bloodGeometry.setAttribute('color', new THREE.BufferAttribute(bloodColors, 3));

    this.bloodParticles = new THREE.Points(bloodGeometry, this.bloodMaterial);
    this.bloodParticles.frustumCulled = false;
    this.scene.add(this.bloodParticles);

    // Initialize blood pool
    for (let i = 0; i < this.MAX_BLOOD_PARTICLES; i++) {
      this.bloodPool.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        size: 0.3,
        color: new THREE.Color(0xcc0000),
      });
    }

    // Fire particles
    const fireGeometry = new THREE.BufferGeometry();
    const firePositions = new Float32Array(this.MAX_FIRE_PARTICLES * 3);
    const fireColors = new Float32Array(this.MAX_FIRE_PARTICLES * 3);

    fireGeometry.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));
    fireGeometry.setAttribute('color', new THREE.BufferAttribute(fireColors, 3));

    this.fireParticles = new THREE.Points(fireGeometry, this.fireMaterial);
    this.fireParticles.frustumCulled = false;
    this.scene.add(this.fireParticles);

    // Initialize fire pool
    for (let i = 0; i < this.MAX_FIRE_PARTICLES; i++) {
      this.firePool.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        size: 1.0,
        color: new THREE.Color(0xff6600),
      });
    }
  }

  /**
   * Spawn blood splatter effect at a position
   *
   * @param lat - Latitude
   * @param lon - Longitude
   * @param height - Height above ground
   * @param count - Number of particles (default 20)
   */
  spawnBloodSplatter(lat: number, lon: number, height: number, count: number = 20): string {
    const localPos = this.sync.geoToLocal(lat, lon, height);
    const id = `blood_${this.effectIdCounter++}`;

    const effect: EffectInstance = {
      id,
      type: 'blood',
      particles: [],
      startTime: performance.now(),
      duration: 1500, // 1.5 seconds
      localPosition: localPos.clone(),
    };

    // Spawn particles
    for (let i = 0; i < count && effect.particles.length < this.MAX_BLOOD_PARTICLES; i++) {
      const particle = this.getInactiveParticle(this.bloodPool);
      if (!particle) break;

      particle.position.copy(localPos);
      particle.velocity.set(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
      );
      particle.life = 1.0;
      particle.maxLife = 1.0 + Math.random() * 0.5;
      particle.size = 0.2 + Math.random() * 0.3;

      // Vary blood color slightly
      const r = 0.7 + Math.random() * 0.3;
      particle.color.setRGB(r, 0, 0);

      effect.particles.push(particle);
    }

    this.activeEffects.set(id, effect);
    return id;
  }

  /**
   * Spawn fire effect at a position
   *
   * @param lat - Latitude
   * @param lon - Longitude
   * @param height - Height above ground
   * @param intensity - Fire intensity ('tiny' | 'small' | 'medium' | 'large' | 'inferno')
   */
  spawnFire(
    lat: number,
    lon: number,
    height: number,
    intensity: 'tiny' | 'small' | 'medium' | 'large' | 'inferno' = 'medium'
  ): string {
    const localPos = this.sync.geoToLocal(lat, lon, height);
    const id = `fire_${this.effectIdCounter++}`;

    const intensityConfig = {
      tiny: { count: 10, radius: 1, duration: 3000 },
      small: { count: 30, radius: 2, duration: 5000 },
      medium: { count: 60, radius: 3, duration: 8000 },
      large: { count: 100, radius: 5, duration: 10000 },
      inferno: { count: 200, radius: 8, duration: -1 }, // -1 = infinite
    };

    const config = intensityConfig[intensity];

    const effect: EffectInstance = {
      id,
      type: 'fire',
      particles: [],
      startTime: performance.now(),
      duration: config.duration,
      localPosition: localPos.clone(),
    };

    // Spawn particles
    for (let i = 0; i < config.count && effect.particles.length < this.MAX_FIRE_PARTICLES; i++) {
      const particle = this.getInactiveParticle(this.firePool);
      if (!particle) break;

      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * config.radius;

      particle.position.copy(localPos);
      particle.position.x += Math.cos(angle) * radius;
      particle.position.z += Math.sin(angle) * radius;

      particle.velocity.set(
        (Math.random() - 0.5) * 2,
        2 + Math.random() * 4, // Upward
        (Math.random() - 0.5) * 2
      );
      particle.life = 1.0;
      particle.maxLife = 0.5 + Math.random() * 1.0;
      particle.size = 0.5 + Math.random() * 1.5;

      // Fire colors (yellow to red)
      const t = Math.random();
      particle.color.setRGB(1, 0.3 + t * 0.5, t * 0.2);

      effect.particles.push(particle);
    }

    this.activeEffects.set(id, effect);
    return id;
  }

  /**
   * Stop a fire effect
   */
  stopFire(id: string): void {
    const effect = this.activeEffects.get(id);
    if (effect && effect.type === 'fire') {
      // Set duration to fade out quickly
      effect.duration = 500;
      effect.startTime = performance.now();
    }
  }

  /**
   * Stop all fire effects
   */
  stopAllFires(): void {
    for (const [id, effect] of this.activeEffects) {
      if (effect.type === 'fire') {
        effect.duration = 500;
        effect.startTime = performance.now();
      }
    }
  }

  /**
   * Update all active effects
   *
   * @param deltaTime - Time since last frame in milliseconds
   */
  update(deltaTime: number): void {
    const now = performance.now();
    const dt = deltaTime / 1000; // Convert to seconds
    const gravity = -9.8;

    // Update effects and remove expired ones
    for (const [id, effect] of this.activeEffects) {
      const elapsed = now - effect.startTime;

      // Check if effect expired
      if (effect.duration > 0 && elapsed > effect.duration) {
        // Return particles to pool
        for (const p of effect.particles) {
          p.life = 0;
        }
        this.activeEffects.delete(id);
        continue;
      }

      // Update particles
      for (const particle of effect.particles) {
        if (particle.life <= 0) continue;

        // Update position
        particle.position.add(particle.velocity.clone().multiplyScalar(dt));

        // Apply gravity (blood falls, fire rises)
        if (effect.type === 'blood') {
          particle.velocity.y += gravity * dt;
        }

        // Decay life
        particle.life -= dt / particle.maxLife;

        // Respawn fire particles
        if (effect.type === 'fire' && particle.life <= 0 && effect.duration < 0) {
          // Infinite fire - respawn
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 5;

          particle.position.copy(effect.localPosition);
          particle.position.x += Math.cos(angle) * radius;
          particle.position.z += Math.sin(angle) * radius;

          particle.velocity.set(
            (Math.random() - 0.5) * 2,
            2 + Math.random() * 4,
            (Math.random() - 0.5) * 2
          );
          particle.life = 1.0;
        }
      }
    }

    // Update GPU buffers
    this.updateParticleBuffers();
  }

  /**
   * Update particle position buffers
   */
  private updateParticleBuffers(): void {
    // Update blood particles
    if (this.bloodParticles) {
      const positions = this.bloodParticles.geometry.attributes['position'] as THREE.BufferAttribute;
      const posArray = positions.array as Float32Array;

      let activeCount = 0;
      for (let i = 0; i < this.bloodPool.length; i++) {
        const p = this.bloodPool[i];
        if (p.life > 0) {
          posArray[activeCount * 3] = p.position.x;
          posArray[activeCount * 3 + 1] = p.position.y;
          posArray[activeCount * 3 + 2] = p.position.z;
          activeCount++;
        }
      }

      positions.needsUpdate = true;
      this.bloodParticles.geometry.setDrawRange(0, activeCount);
    }

    // Update fire particles
    if (this.fireParticles) {
      const positions = this.fireParticles.geometry.attributes['position'] as THREE.BufferAttribute;
      const posArray = positions.array as Float32Array;

      let activeCount = 0;
      for (let i = 0; i < this.firePool.length; i++) {
        const p = this.firePool[i];
        if (p.life > 0) {
          posArray[activeCount * 3] = p.position.x;
          posArray[activeCount * 3 + 1] = p.position.y;
          posArray[activeCount * 3 + 2] = p.position.z;
          activeCount++;
        }
      }

      positions.needsUpdate = true;
      this.fireParticles.geometry.setDrawRange(0, activeCount);
    }
  }

  /**
   * Get an inactive particle from a pool
   */
  private getInactiveParticle(pool: Particle[]): Particle | null {
    for (const p of pool) {
      if (p.life <= 0) {
        return p;
      }
    }
    return null;
  }

  /**
   * Clear all effects
   */
  clear(): void {
    // Reset all particles
    for (const p of this.bloodPool) {
      p.life = 0;
    }
    for (const p of this.firePool) {
      p.life = 0;
    }
    this.activeEffects.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clear();

    if (this.bloodParticles) {
      this.scene.remove(this.bloodParticles);
      this.bloodParticles.geometry.dispose();
    }
    if (this.fireParticles) {
      this.scene.remove(this.fireParticles);
      this.fireParticles.geometry.dispose();
    }

    this.bloodMaterial.dispose();
    this.fireMaterial.dispose();
  }
}
