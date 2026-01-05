import { Particle, ParticleEffectType, ParticleEmitter } from './sandwichmaster.types';

// Particle effect configurations
const EFFECT_CONFIGS: Record<
  ParticleEffectType,
  {
    colors: string[];
    spawnRate: number;
    lifeRange: [number, number];
    sizeRange: [number, number];
    speedRange: [number, number];
    gravity: number;
  }
> = {
  golden_sparkle: {
    colors: ['#FFD700', '#FFA500', '#FFFF00', '#FFE4B5'],
    spawnRate: 3,
    lifeRange: [30, 60],
    sizeRange: [2, 5],
    speedRange: [0.5, 2],
    gravity: -0.02,
  },
  flame: {
    colors: ['#FF4500', '#FF6600', '#FF8C00', '#FFD700'],
    spawnRate: 4,
    lifeRange: [20, 40],
    sizeRange: [3, 8],
    speedRange: [1, 3],
    gravity: -0.05,
  },
  lava: {
    colors: ['#FF0000', '#FF4500', '#FF6600', '#8B0000'],
    spawnRate: 2,
    lifeRange: [40, 80],
    sizeRange: [4, 10],
    speedRange: [0.5, 1.5],
    gravity: 0.03,
  },
  dragon_fire: {
    colors: ['#FF0000', '#FF4500', '#8B0000', '#FFD700'],
    spawnRate: 5,
    lifeRange: [25, 50],
    sizeRange: [3, 7],
    speedRange: [1.5, 4],
    gravity: -0.04,
  },
  shadow: {
    colors: ['#1a1a2e', '#16213e', '#0f3460', '#533483'],
    spawnRate: 2,
    lifeRange: [50, 100],
    sizeRange: [5, 12],
    speedRange: [0.3, 1],
    gravity: -0.01,
  },
  rainbow: {
    colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF'],
    spawnRate: 4,
    lifeRange: [40, 70],
    sizeRange: [2, 6],
    speedRange: [1, 2.5],
    gravity: -0.02,
  },
  stars: {
    colors: ['#FFFF00', '#FFD700', '#FFFACD', '#F0E68C'],
    spawnRate: 2,
    lifeRange: [60, 100],
    sizeRange: [3, 8],
    speedRange: [0.5, 1.5],
    gravity: -0.01,
  },
  divine: {
    colors: ['#FFD700', '#9400D3', '#FF69B4', '#00FFFF', '#FFFFFF'],
    spawnRate: 6,
    lifeRange: [50, 90],
    sizeRange: [3, 10],
    speedRange: [1, 3],
    gravity: -0.03,
  },
};

export class ParticleSystem {
  private emitters: ParticleEmitter[] = [];

  createEmitter(x: number, y: number, type: ParticleEffectType): ParticleEmitter {
    const emitter: ParticleEmitter = {
      x,
      y,
      type,
      particles: [],
      active: true,
    };
    this.emitters.push(emitter);
    return emitter;
  }

  removeEmitter(emitter: ParticleEmitter): void {
    const index = this.emitters.indexOf(emitter);
    if (index !== -1) {
      this.emitters.splice(index, 1);
    }
  }

  update(): void {
    for (const emitter of this.emitters) {
      if (!emitter.active) continue;

      const config = EFFECT_CONFIGS[emitter.type];

      // Spawn new particles
      for (let i = 0; i < config.spawnRate; i++) {
        if (Math.random() < 0.7) {
          const particle = this.createParticle(emitter, config);
          emitter.particles.push(particle);
        }
      }

      // Update existing particles
      for (let i = emitter.particles.length - 1; i >= 0; i--) {
        const p = emitter.particles[i];

        // Update position
        p.x += p.vx;
        p.y += p.vy;
        p.vy += config.gravity;

        // Update life
        p.life--;
        p.alpha = Math.max(0, p.life / p.maxLife);

        // Remove dead particles
        if (p.life <= 0) {
          emitter.particles.splice(i, 1);
        }
      }
    }
  }

  private createParticle(
    emitter: ParticleEmitter,
    config: (typeof EFFECT_CONFIGS)[ParticleEffectType]
  ): Particle {
    const angle = Math.random() * Math.PI * 2;
    const speed =
      config.speedRange[0] + Math.random() * (config.speedRange[1] - config.speedRange[0]);
    const life =
      config.lifeRange[0] + Math.random() * (config.lifeRange[1] - config.lifeRange[0]);

    return {
      x: emitter.x + (Math.random() - 0.5) * 20,
      y: emitter.y + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1, // Slight upward bias
      life: life,
      maxLife: life,
      color: config.colors[Math.floor(Math.random() * config.colors.length)],
      size: config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0]),
      alpha: 1,
    };
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    for (const emitter of this.emitters) {
      for (const p of emitter.particles) {
        ctx.globalAlpha = p.alpha;

        // Special rendering for different effect types
        switch (emitter.type) {
          case 'stars':
            this.renderStar(ctx, p);
            break;
          case 'flame':
          case 'dragon_fire':
            this.renderFlame(ctx, p);
            break;
          case 'divine':
            this.renderDivine(ctx, p);
            break;
          default:
            this.renderCircle(ctx, p);
        }
      }
    }

    ctx.restore();
  }

  private renderCircle(ctx: CanvasRenderingContext2D, p: Particle): void {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    // Add glow effect
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 2;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private renderStar(ctx: CanvasRenderingContext2D, p: Particle): void {
    const spikes = 5;
    const outerRadius = p.size;
    const innerRadius = p.size / 2;

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const x = p.x + Math.cos(angle) * radius;
      const y = p.y + Math.sin(angle) * radius;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 3;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private renderFlame(ctx: CanvasRenderingContext2D, p: Particle): void {
    // Teardrop shape for flames
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.size);
    ctx.bezierCurveTo(
      p.x + p.size,
      p.y - p.size / 2,
      p.x + p.size / 2,
      p.y + p.size / 2,
      p.x,
      p.y + p.size
    );
    ctx.bezierCurveTo(
      p.x - p.size / 2,
      p.y + p.size / 2,
      p.x - p.size,
      p.y - p.size / 2,
      p.x,
      p.y - p.size
    );
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 2;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private renderDivine(ctx: CanvasRenderingContext2D, p: Particle): void {
    // Alternating between circles and stars
    if (Math.random() > 0.5) {
      this.renderStar(ctx, p);
    } else {
      this.renderCircle(ctx, p);
    }
  }

  clear(): void {
    this.emitters = [];
  }

  getEmitters(): ParticleEmitter[] {
    return this.emitters;
  }
}
