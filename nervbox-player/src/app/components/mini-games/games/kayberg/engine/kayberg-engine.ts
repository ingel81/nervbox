import * as THREE from 'three';
import { KaybergTerrain } from './terrain';
import { PlayerBirdEntity } from './entities/player-bird';
import { PreyEntity } from './entities/prey';
import { HunterEntity } from './entities/hunter';
import { ProjectileEntity } from './entities/projectile';
import { WaveManager } from './utils/wave-manager';
import {
  GameState,
  PreyType,
  EngineCallbacks,
  CATCH_DISTANCE,
  DAMAGE_DISTANCE,
} from '../kayberg.types';

export class KaybergEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private terrain!: KaybergTerrain;
  private player!: PlayerBirdEntity;
  private preyEntities: PreyEntity[] = [];
  private hunters: HunterEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private hitIndicators: { mesh: THREE.Mesh; life: number }[] = [];

  private waveManager: WaveManager;
  private gameState: GameState = 'ready';

  // Input state
  private keys: Set<string> = new Set();
  private mouseDeltaX: number = 0;
  private mouseDeltaY: number = 0;
  private isPointerLocked: boolean = false;

  // Callbacks
  callbacks: EngineCallbacks = {};

  // Canvas dimensions
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.width = width;
    this.height = height;

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

    // Create wave manager
    this.waveManager = new WaveManager();
    this.waveManager.onScoreChange = (score) => {
      this.callbacks.onScoreChange?.(score);
    };
    this.waveManager.onWaveProgress = (caught, required) => {
      this.callbacks.onWaveProgress?.(caught, required);
    };
    this.waveManager.onWaveComplete = () => {
      this.gameState = 'won';
      this.callbacks.onLevelComplete?.();
    };

    this.init();
  }

  private init(): void {
    // Setup lighting
    this.setupLighting();

    // Create terrain
    this.terrain = new KaybergTerrain(this.scene);
    this.terrain.create();

    // Create player
    this.player = new PlayerBirdEntity();
    this.scene.add(this.player.mesh);

    // Spawn initial entities
    this.spawnEntities();

    // Initial render
    this.render();
  }

  private setupLighting(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    // Directional light (sun)
    const sun = new THREE.DirectionalLight(0xffffee, 1);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    this.scene.add(sun);

    // Hemisphere light for sky color influence
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x228b22, 0.3);
    this.scene.add(hemi);
  }

  private spawnEntities(): void {
    // Clear existing
    this.clearEntities();

    const config = this.waveManager.getConfig();

    // Spawn prey
    const preyTypes: { type: PreyType; count: number }[] = [
      { type: 'mouse', count: config.mice },
      { type: 'rabbit', count: config.rabbits },
      { type: 'smallBird', count: config.birds },
      { type: 'pigeon', count: config.pigeons },
    ];

    for (const { type, count } of preyTypes) {
      for (let i = 0; i < count; i++) {
        const isFlying = type === 'smallBird' || type === 'pigeon';
        const pos = isFlying
          ? this.terrain.getRandomPositionInAir(8, 25)
          : this.terrain.getRandomPositionOnTerrain(10, 80);

        const prey = new PreyEntity(
          type,
          pos,
          (x, z) => this.terrain.getTerrainHeight(x, z)
        );
        this.preyEntities.push(prey);
        this.scene.add(prey.mesh);
      }
    }

    // Spawn hunters
    for (let i = 0; i < config.hunters; i++) {
      const pos = this.terrain.getRandomPositionOnTerrain(20, 70);
      const hunter = new HunterEntity(
        pos,
        config.hunterFireRate,
        (x, z) => this.terrain.getTerrainHeight(x, z)
      );
      this.hunters.push(hunter);
      this.scene.add(hunter.mesh);
    }
  }

  private clearEntities(): void {
    // Remove prey
    for (const prey of this.preyEntities) {
      this.scene.remove(prey.mesh);
      prey.dispose();
    }
    this.preyEntities = [];

    // Remove hunters
    for (const hunter of this.hunters) {
      this.scene.remove(hunter.mesh);
      hunter.dispose();
    }
    this.hunters = [];

    // Remove projectiles
    for (const projectile of this.projectiles) {
      this.scene.remove(projectile.mesh);
      projectile.dispose();
    }
    this.projectiles = [];
  }

  update(deltaTime: number): void {
    if (this.gameState !== 'playing') return;

    // Update player with mouse delta (consumed each frame)
    this.player.update(deltaTime, this.keys, this.mouseDeltaX, this.mouseDeltaY);

    // Reset mouse delta after consumption
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Terrain collision - keep player above ground
    const terrainHeight = this.terrain.getTerrainHeight(
      this.player.position.x,
      this.player.position.z
    );
    const minAltitude = terrainHeight + 2; // Minimum 2 units above terrain
    if (this.player.position.y < minAltitude) {
      this.player.position.y = minAltitude;
      this.player.mesh.position.y = minAltitude;
    }

    // Update camera to follow player
    this.updateCamera();

    // Update prey and check for catches
    const playerPos = this.player.position;

    for (const prey of this.preyEntities) {
      if (!prey.isAlive) continue;

      prey.update(deltaTime);

      // Check for catch - can catch by ramming OR diving!
      const dist = prey.position.distanceTo(playerPos);
      if (dist < CATCH_DISTANCE) {
        prey.kill();
        this.waveManager.recordPreyCaught(prey.config.points);
        this.callbacks.onPreyCaught?.(prey.type, prey.config.points);

        // Create hit indicator effect
        this.createHitIndicator(prey.position.clone());
      } else if (dist < 20) {
        // Make prey flee when player is nearby
        prey.fleeFrom(playerPos);
      }
    }

    // Update hunters and their shooting
    for (const hunter of this.hunters) {
      hunter.update(deltaTime, playerPos);

      // Try to shoot
      if (hunter.canShoot) {
        const projectile = hunter.shoot();
        if (projectile) {
          this.projectiles.push(projectile);
          this.scene.add(projectile.mesh);
        }
      }
    }

    // Update projectiles and check for hits
    for (const projectile of this.projectiles) {
      if (!projectile.isActive) continue;

      projectile.update(deltaTime);

      // Check for hit on player
      if (!this.player.isInvincible) {
        const dist = projectile.position.distanceTo(playerPos);
        if (dist < DAMAGE_DISTANCE) {
          projectile.deactivate();
          const gameOver = this.player.takeDamage();
          this.callbacks.onLivesChange?.(this.player.lives);
          this.callbacks.onPlayerHit?.();

          if (gameOver) {
            this.gameState = 'gameover';
            this.callbacks.onGameOver?.();
          }
        }
      }
    }

    // Clean up inactive projectiles
    this.projectiles = this.projectiles.filter((p) => {
      if (!p.isActive) {
        this.scene.remove(p.mesh);
        p.dispose();
        return false;
      }
      return true;
    });

    // Update hit indicators
    this.updateHitIndicators(deltaTime);
  }

  private updateCamera(): void {
    // Third-person camera behind and above the player
    const cameraOffset = new THREE.Vector3(0, 5, 15);

    // Apply player rotation to camera offset
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(
      new THREE.Euler(this.player.pitch * 0.3, this.player.yaw, 0, 'YXZ')
    );
    cameraOffset.applyQuaternion(quaternion);

    // Position camera
    const targetPos = this.player.position.clone().add(cameraOffset);
    this.camera.position.lerp(targetPos, 0.1);

    // Look at player
    const lookTarget = this.player.position.clone();
    lookTarget.y += 2;
    this.camera.lookAt(lookTarget);
  }

  private createHitIndicator(position: THREE.Vector3): void {
    // Create expanding ring effect
    const geometry = new THREE.RingGeometry(0.5, 1.5, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(position);
    ring.rotation.x = -Math.PI / 2; // Horizontal
    this.scene.add(ring);
    this.hitIndicators.push({ mesh: ring, life: 500 });

    // Create burst particles
    const burstGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const burstMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 1,
    });
    for (let i = 0; i < 8; i++) {
      const particle = new THREE.Mesh(burstGeometry, burstMaterial.clone());
      particle.position.copy(position);
      this.scene.add(particle);
      this.hitIndicators.push({ mesh: particle, life: 400 });
    }
  }

  private updateHitIndicators(deltaTime: number): void {
    for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
      const indicator = this.hitIndicators[i];
      indicator.life -= deltaTime;

      if (indicator.life <= 0) {
        this.scene.remove(indicator.mesh);
        indicator.mesh.geometry.dispose();
        (indicator.mesh.material as THREE.Material).dispose();
        this.hitIndicators.splice(i, 1);
      } else {
        // Animate
        const progress = 1 - indicator.life / 500;
        indicator.mesh.scale.setScalar(1 + progress * 3);
        (indicator.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress;

        // Burst particles move outward
        if (indicator.mesh.geometry.type === 'SphereGeometry') {
          const angle = Math.atan2(
            indicator.mesh.position.z - this.player.position.z,
            indicator.mesh.position.x - this.player.position.x
          );
          indicator.mesh.position.x += Math.cos(angle + i * 0.8) * deltaTime * 0.02;
          indicator.mesh.position.z += Math.sin(angle + i * 0.8) * deltaTime * 0.02;
          indicator.mesh.position.y += deltaTime * 0.005;
        }
      }
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // Input handlers
  onKeyDown(key: string): void {
    this.keys.add(key.toLowerCase());

    if (key === ' ' || key === 'Space') {
      this.player.startDive();
    }
  }

  onKeyUp(key: string): void {
    this.keys.delete(key.toLowerCase());

    if (key === ' ' || key === 'Space') {
      this.player.endDive();
    }
  }

  onMouseMove(movementX: number, movementY: number): void {
    if (!this.isPointerLocked) return;

    // Accumulate mouse delta for this frame
    this.mouseDeltaX += movementX;
    this.mouseDeltaY += movementY;
  }

  setPointerLocked(locked: boolean): void {
    this.isPointerLocked = locked;
    if (!locked) {
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
    }
  }

  // Game state control
  start(): void {
    this.gameState = 'playing';
    this.callbacks.onLivesChange?.(this.player.lives);
    this.callbacks.onScoreChange?.(this.waveManager.getScore());
    this.callbacks.onWaveProgress?.(0, this.waveManager.getPreyRequired());
  }

  pause(): void {
    this.gameState = 'paused';
  }

  resume(): void {
    this.gameState = 'playing';
  }

  reset(): void {
    this.gameState = 'ready';
    this.player.reset();
    this.waveManager.reset();
    this.spawnEntities();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.callbacks.onLivesChange?.(3);
    this.callbacks.onScoreChange?.(0);
    this.callbacks.onWaveProgress?.(0, this.waveManager.getPreyRequired());
  }

  nextLevel(): void {
    this.waveManager.nextLevel();
    this.player.lives = 3; // Restore lives for new level
    this.spawnEntities();
    this.gameState = 'ready';
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.callbacks.onLivesChange?.(3);
  }

  getLevel(): number {
    return this.waveManager.getLevel();
  }

  getScore(): number {
    return this.waveManager.getScore();
  }

  getLives(): number {
    return this.player.lives;
  }

  getState(): GameState {
    return this.gameState;
  }

  calculateReward(): number {
    return this.waveManager.calculateReward();
  }

  dispose(): void {
    this.clearEntities();
    this.player.dispose();
    this.terrain.dispose();
    this.renderer.dispose();
  }
}
