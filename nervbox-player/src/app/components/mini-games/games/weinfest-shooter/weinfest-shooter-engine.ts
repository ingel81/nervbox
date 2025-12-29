export type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

interface Vector2 {
  x: number;
  y: number;
}

interface Thrower {
  x: number;
  y: number;
  state: 'idle' | 'windup' | 'throw' | 'followthrough';
  frame: number;
  frameTimer: number;
  targetBottle: Bottle | null;
}

interface Bottle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  state: 'flying' | 'breaking_air' | 'breaking_floor' | 'done';
  breakFrame: number;
  breakTimer: number;
}

interface GunState {
  firing: boolean;
  fireTimer: number;
}

export class WeinfestShooterEngine {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  // Game state
  private bottles: Bottle[] = [];
  private throwers: Thrower[] = [];
  private gun: GunState = { firing: false, fireTimer: 0 };
  private mousePos: Vector2 = { x: 0, y: 0 };
  private balance = 0;
  private totalHits = 0;
  private totalMisses = 0;

  // Timing
  private lastSpawnTime = 0;
  private spawnInterval = 1500; // ms between spawns
  private minSpawnInterval = 800;
  private difficultyTimer = 0;

  // Physics constants
  private readonly GRAVITY = 0.15;
  private readonly BOTTLE_HITBOX_WIDTH = 40;
  private readonly BOTTLE_HITBOX_HEIGHT = 60;

  // Economy
  private readonly HIT_REWARD = 3;
  private readonly MISS_PENALTY = 2;

  // Assets
  private images = new Map<string, HTMLImageElement>();
  private imagesLoaded = false;

  // Callbacks
  onBalanceChange?: (balance: number) => void;
  onHit?: () => void;
  onMiss?: () => void;
  onStatsChange?: (hits: number, misses: number) => void;
  playShotSound?: () => void;
  playBreakSound?: () => void;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  async loadAssets(): Promise<void> {
    const assetPath = 'assets/games/weinfest-shooter';
    const assets = [
      'Background.jpeg',
      'Bottle_1.png',
      'Bottle_2.png',
      'Bottle_breaks_air1.png',
      'Bottle_breaks_air2.png',
      'Bottle_breaks_air3.png',
      'Bottle_breaks_air4.png',
      'Bottle_breaks_air5.png',
      'Bottle_breaks_floor1.png',
      'Bottle_breaks_floor2.png',
      'Bottle_breaks_floor3.png',
      'Gun_idle.png',
      'Gun_fire.png',
      'guy_arm_up.png',
      'guy_arm_front.png',
      'guy_arm_down.png',
    ];

    const loadPromises = assets.map(asset => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.images.set(asset.replace('.png', '').replace('.jpeg', ''), img);
          resolve();
        };
        img.onerror = () => reject(new Error(`Failed to load ${asset}`));
        img.src = `${assetPath}/${asset}`;
      });
    });

    await Promise.all(loadPromises);
    this.imagesLoaded = true;
  }

  init(): void {
    this.bottles = [];
    this.throwers = [];
    this.balance = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
    this.lastSpawnTime = 0;
    this.spawnInterval = 1500;
    this.difficultyTimer = 0;
    this.gun = { firing: false, fireTimer: 0 };
    this.onBalanceChange?.(0);
    this.onStatsChange?.(0, 0);
  }

  reset(): void {
    this.init();
  }

  setMousePosition(x: number, y: number): void {
    this.mousePos = { x, y };
  }

  shoot(): boolean {
    if (!this.imagesLoaded) return false;

    // Trigger gun fire animation
    this.gun.firing = true;
    this.gun.fireTimer = 150; // ms
    this.playShotSound?.();

    // Check for hits - rectangular hitbox for better accuracy
    let hit = false;
    for (const bottle of this.bottles) {
      if (bottle.state !== 'flying') continue;

      const halfW = this.BOTTLE_HITBOX_WIDTH / 2;
      const halfH = this.BOTTLE_HITBOX_HEIGHT / 2;
      const inHitbox =
        this.mousePos.x >= bottle.x - halfW &&
        this.mousePos.x <= bottle.x + halfW &&
        this.mousePos.y >= bottle.y - halfH &&
        this.mousePos.y <= bottle.y + halfH;

      if (inHitbox) {
        // Hit!
        bottle.state = 'breaking_air';
        bottle.breakFrame = 0;
        bottle.breakTimer = 0;
        this.balance += this.HIT_REWARD;
        this.totalHits++;
        hit = true;
        this.onBalanceChange?.(this.balance);
        this.onStatsChange?.(this.totalHits, this.totalMisses);
        this.onHit?.();
        this.playBreakSound?.();
        break; // Only hit one bottle per shot
      }
    }

    return hit;
  }

  update(deltaTime: number): void {
    if (!this.imagesLoaded) return;

    // Update difficulty
    this.difficultyTimer += deltaTime;
    if (this.difficultyTimer > 10000) {
      // Every 10 seconds, increase difficulty
      this.spawnInterval = Math.max(this.minSpawnInterval, this.spawnInterval - 50);
      this.difficultyTimer = 0;
    }

    // Spawn new throwers/bottles - only one at a time
    this.lastSpawnTime += deltaTime;
    const hasActiveThrower = this.throwers.some(t => t.state !== 'idle');
    if (this.lastSpawnTime >= this.spawnInterval && !hasActiveThrower) {
      this.spawnThrower();
      this.lastSpawnTime = 0;
    }

    // Update throwers
    this.updateThrowers(deltaTime);

    // Update bottles
    this.updateBottles(deltaTime);

    // Update gun animation
    if (this.gun.firing) {
      this.gun.fireTimer -= deltaTime;
      if (this.gun.fireTimer <= 0) {
        this.gun.firing = false;
      }
    }

    // Cleanup done bottles
    this.bottles = this.bottles.filter(b => b.state !== 'done');
    this.throwers = this.throwers.filter(t => t.state !== 'idle' || t.targetBottle !== null);
  }

  private spawnThrower(): void {
    // Random position at bottom of screen
    const margin = 100;
    const x = margin + Math.random() * (this.width - margin * 2);
    const y = this.height - 150 + Math.random() * 50;

    const thrower: Thrower = {
      x,
      y,
      state: 'windup',
      frame: 0,
      frameTimer: 0,
      targetBottle: null,
    };

    this.throwers.push(thrower);
  }

  private updateThrowers(deltaTime: number): void {
    for (const thrower of this.throwers) {
      thrower.frameTimer += deltaTime;

      switch (thrower.state) {
        case 'windup':
          if (thrower.frameTimer >= 200) {
            thrower.state = 'throw';
            thrower.frameTimer = 0;
            // Spawn bottle at throw moment
            this.spawnBottle(thrower);
          }
          break;

        case 'throw':
          if (thrower.frameTimer >= 150) {
            thrower.state = 'followthrough';
            thrower.frameTimer = 0;
          }
          break;

        case 'followthrough':
          if (thrower.frameTimer >= 200) {
            thrower.state = 'idle';
            thrower.frameTimer = 0;
          }
          break;
      }
    }

    // Remove idle throwers without bottles
    this.throwers = this.throwers.filter(
      t => t.state !== 'idle' || (t.targetBottle && t.targetBottle.state === 'flying')
    );
  }

  private spawnBottle(thrower: Thrower): void {
    // Calculate throw velocity for a nice arc
    const throwAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8; // Mostly upward with some variance
    const throwSpeed = 8 + Math.random() * 4;

    const bottle: Bottle = {
      x: thrower.x,
      y: thrower.y - 50,
      vx: Math.cos(throwAngle) * throwSpeed,
      vy: Math.sin(throwAngle) * throwSpeed,
      rotation: 0,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      state: 'flying',
      breakFrame: 0,
      breakTimer: 0,
    };

    thrower.targetBottle = bottle;
    this.bottles.push(bottle);
  }

  private updateBottles(deltaTime: number): void {
    const dt = deltaTime / 16.67; // Normalize to 60fps

    for (const bottle of this.bottles) {
      switch (bottle.state) {
        case 'flying':
          // Apply physics
          bottle.vy += this.GRAVITY * dt;
          bottle.x += bottle.vx * dt;
          bottle.y += bottle.vy * dt;
          bottle.rotation += bottle.rotationSpeed * dt;

          // Check if hit ground
          if (bottle.y >= this.height - 80) {
            bottle.state = 'breaking_floor';
            bottle.breakFrame = 0;
            bottle.breakTimer = 0;
            // Penalty for missed bottle
            this.balance -= this.MISS_PENALTY;
            this.totalMisses++;
            this.onBalanceChange?.(this.balance);
            this.onStatsChange?.(this.totalHits, this.totalMisses);
            this.onMiss?.();
            this.playBreakSound?.();
          }

          // Remove if off screen (sides)
          if (bottle.x < -50 || bottle.x > this.width + 50) {
            bottle.state = 'done';
          }
          break;

        case 'breaking_air':
          bottle.breakTimer += deltaTime;
          if (bottle.breakTimer >= 80) {
            bottle.breakFrame++;
            bottle.breakTimer = 0;
            if (bottle.breakFrame >= 5) {
              bottle.state = 'done';
            }
          }
          break;

        case 'breaking_floor':
          bottle.breakTimer += deltaTime;
          if (bottle.breakTimer >= 100) {
            bottle.breakFrame++;
            bottle.breakTimer = 0;
            if (bottle.breakFrame >= 3) {
              bottle.state = 'done';
            }
          }
          break;
      }
    }
  }

  render(): void {
    if (!this.imagesLoaded) {
      // Loading screen
      this.ctx.fillStyle = '#1a1a2e';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '24px JetBrains Mono, monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Loading...', this.width / 2, this.height / 2);
      return;
    }

    // Draw background
    const bg = this.images.get('Background');
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, this.width, this.height);
    }

    // Draw throwers
    this.renderThrowers();

    // Draw bottles
    this.renderBottles();

    // Draw gun
    this.renderGun();

    // Draw crosshair
    this.renderCrosshair();
  }

  private renderThrowers(): void {
    for (const thrower of this.throwers) {
      let imgKey: string;
      switch (thrower.state) {
        case 'windup':
          imgKey = 'guy_arm_up';
          break;
        case 'throw':
          imgKey = 'guy_arm_front';
          break;
        case 'followthrough':
        case 'idle':
          imgKey = 'guy_arm_down';
          break;
        default:
          imgKey = 'guy_arm_down';
      }

      const img = this.images.get(imgKey);
      if (img) {
        const scale = 0.75;
        const w = img.width * scale;
        const h = img.height * scale;
        this.ctx.drawImage(img, thrower.x - w / 2, thrower.y - h / 2, w, h);
      }
    }
  }

  private renderBottles(): void {
    for (const bottle of this.bottles) {
      switch (bottle.state) {
        case 'flying':
          this.renderFlyingBottle(bottle);
          break;
        case 'breaking_air':
          this.renderBreakingAir(bottle);
          break;
        case 'breaking_floor':
          this.renderBreakingFloor(bottle);
          break;
      }
    }
  }

  private renderFlyingBottle(bottle: Bottle): void {
    // Alternate between Bottle_1 and Bottle_2 based on rotation
    const rotationPhase = Math.floor((bottle.rotation / Math.PI) * 2) % 2;
    const imgKey = rotationPhase === 0 ? 'Bottle_1' : 'Bottle_2';
    const img = this.images.get(imgKey);

    if (img) {
      this.ctx.save();
      this.ctx.translate(bottle.x, bottle.y);
      this.ctx.rotate(bottle.rotation);
      const scale = 0.4;
      const w = img.width * scale;
      const h = img.height * scale;
      this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
      this.ctx.restore();
    }
  }

  private renderBreakingAir(bottle: Bottle): void {
    const frame = Math.min(bottle.breakFrame, 4);
    const imgKey = `Bottle_breaks_air${frame + 1}`;
    const img = this.images.get(imgKey);

    if (img) {
      const scale = 0.6;
      const w = img.width * scale;
      const h = img.height * scale;
      this.ctx.drawImage(img, bottle.x - w / 2, bottle.y - h / 2, w, h);
    }
  }

  private renderBreakingFloor(bottle: Bottle): void {
    const frame = Math.min(bottle.breakFrame, 2);
    const imgKey = `Bottle_breaks_floor${frame + 1}`;
    const img = this.images.get(imgKey);

    if (img) {
      const scale = 0.5;
      const w = img.width * scale;
      const h = img.height * scale;
      this.ctx.drawImage(img, bottle.x - w / 2, this.height - 80 - h / 2, w, h);
    }
  }

  private renderGun(): void {
    const imgKey = this.gun.firing ? 'Gun_fire' : 'Gun_idle';
    const img = this.images.get(imgKey);

    if (img) {
      const scale = 0.3;
      const w = img.width * scale;
      const h = img.height * scale;

      // Base position (rechts)
      const baseX = this.width - w - 20;
      const baseY = this.height - h + 10;

      // Leichte Bewegung in Richtung Maus (max 15px)
      const offsetX = ((this.mousePos.x / this.width) - 0.5) * 30;
      const offsetY = ((this.mousePos.y / this.height) - 0.5) * 15;

      this.ctx.drawImage(img, baseX + offsetX, baseY + offsetY, w, h);
    }
  }

  private renderCrosshair(): void {
    const { x, y } = this.mousePos;
    const size = 20;
    const thickness = 2;

    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = thickness;
    this.ctx.shadowColor = '#ff0000';
    this.ctx.shadowBlur = 10;

    // Horizontal line
    this.ctx.beginPath();
    this.ctx.moveTo(x - size, y);
    this.ctx.lineTo(x + size, y);
    this.ctx.stroke();

    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - size);
    this.ctx.lineTo(x, y + size);
    this.ctx.stroke();

    // Center dot
    this.ctx.fillStyle = '#ff0000';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.shadowBlur = 0;
  }

  getBalance(): number {
    return this.balance;
  }

  getStats(): { hits: number; misses: number } {
    return { hits: this.totalHits, misses: this.totalMisses };
  }
}
