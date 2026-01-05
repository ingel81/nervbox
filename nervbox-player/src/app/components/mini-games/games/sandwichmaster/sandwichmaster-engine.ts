import { Ingredient, SandwichLayer, ParticleEmitter } from './sandwichmaster.types';
import { ParticleSystem } from './particle-system';

export class SandwichmasterEngine {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private particleSystem: ParticleSystem;
  private layers: SandwichLayer[] = [];
  private emitters: Map<string, ParticleEmitter> = new Map();

  // Sandwich rendering config
  private readonly SANDWICH_BASE_Y: number;
  private readonly SANDWICH_CENTER_X: number;
  private readonly LAYER_HEIGHT = 25;
  private readonly LAYER_WIDTH = 180;
  private readonly PLATE_HEIGHT = 20;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    this.particleSystem = new ParticleSystem();

    // Position sandwich in the center-bottom of canvas
    this.SANDWICH_BASE_Y = height - 60;
    this.SANDWICH_CENTER_X = width / 2;
  }

  init(): void {
    this.clear();
    this.render();
  }

  addIngredient(ingredient: Ingredient): void {
    const layerY = this.SANDWICH_BASE_Y - this.PLATE_HEIGHT - this.layers.length * this.LAYER_HEIGHT;

    const layer: SandwichLayer = {
      ingredient,
      y: layerY,
      width: this.LAYER_WIDTH + (Math.random() - 0.5) * 20, // Slight variation
      height: this.LAYER_HEIGHT,
    };

    this.layers.push(layer);

    // Create particle emitter for epic ingredients
    if (ingredient.particleEffect) {
      const emitter = this.particleSystem.createEmitter(
        this.SANDWICH_CENTER_X,
        layerY,
        ingredient.particleEffect
      );
      this.emitters.set(ingredient.id, emitter);
    }
  }

  removeIngredient(ingredientId: string): void {
    const index = this.layers.findIndex(l => l.ingredient.id === ingredientId);
    if (index !== -1) {
      this.layers.splice(index, 1);

      // Recalculate layer positions
      for (let i = 0; i < this.layers.length; i++) {
        this.layers[i].y =
          this.SANDWICH_BASE_Y - this.PLATE_HEIGHT - i * this.LAYER_HEIGHT;
      }
    }

    // Remove particle emitter if exists
    const emitter = this.emitters.get(ingredientId);
    if (emitter) {
      this.particleSystem.removeEmitter(emitter);
      this.emitters.delete(ingredientId);
    }
  }

  update(): void {
    // Update particle positions for emitters based on layer positions
    for (const [ingredientId, emitter] of this.emitters) {
      const layer = this.layers.find(l => l.ingredient.id === ingredientId);
      if (layer) {
        emitter.x = this.SANDWICH_CENTER_X;
        emitter.y = layer.y;
      }
    }

    this.particleSystem.update();
  }

  render(): void {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw background gradient
    this.drawBackground();

    // Draw plate
    this.drawPlate();

    // Draw sandwich layers
    this.drawSandwich();

    // Draw particles on top
    this.particleSystem.render(this.ctx);

    // Draw empty state hint
    if (this.layers.length === 0) {
      this.drawEmptyHint();
    }
  }

  private drawBackground(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Add subtle grid pattern
    this.ctx.strokeStyle = 'rgba(147, 51, 234, 0.05)';
    this.ctx.lineWidth = 1;
    const gridSize = 30;
    for (let x = 0; x < this.width; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  private drawPlate(): void {
    const plateY = this.SANDWICH_BASE_Y;
    const plateWidth = this.LAYER_WIDTH + 60;

    // Plate shadow
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(
      this.SANDWICH_CENTER_X,
      plateY + 10,
      plateWidth / 2 + 5,
      15,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Plate
    const plateGradient = this.ctx.createLinearGradient(
      this.SANDWICH_CENTER_X - plateWidth / 2,
      plateY - 10,
      this.SANDWICH_CENTER_X + plateWidth / 2,
      plateY + 10
    );
    plateGradient.addColorStop(0, '#f5f5f5');
    plateGradient.addColorStop(0.5, '#ffffff');
    plateGradient.addColorStop(1, '#e0e0e0');

    this.ctx.fillStyle = plateGradient;
    this.ctx.beginPath();
    this.ctx.ellipse(
      this.SANDWICH_CENTER_X,
      plateY,
      plateWidth / 2,
      this.PLATE_HEIGHT,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Plate rim
    this.ctx.strokeStyle = '#c0c0c0';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  private drawSandwich(): void {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      this.drawLayer(layer, i);
    }
  }

  private drawLayer(layer: SandwichLayer, index: number): void {
    const x = this.SANDWICH_CENTER_X - layer.width / 2;
    const y = layer.y;
    const isEpic = layer.ingredient.category === 'epic';

    // Epic glow effect
    if (isEpic) {
      this.ctx.shadowColor = layer.ingredient.color;
      this.ctx.shadowBlur = 20;
    }

    // Layer shape (slightly rounded rectangle)
    this.ctx.beginPath();
    const radius = 8;
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + layer.width - radius, y);
    this.ctx.quadraticCurveTo(x + layer.width, y, x + layer.width, y + radius);
    this.ctx.lineTo(x + layer.width, y + layer.height - radius);
    this.ctx.quadraticCurveTo(
      x + layer.width,
      y + layer.height,
      x + layer.width - radius,
      y + layer.height
    );
    this.ctx.lineTo(x + radius, y + layer.height);
    this.ctx.quadraticCurveTo(x, y + layer.height, x, y + layer.height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();

    // Fill with ingredient color
    const layerGradient = this.ctx.createLinearGradient(x, y, x, y + layer.height);
    layerGradient.addColorStop(0, this.lightenColor(layer.ingredient.color, 20));
    layerGradient.addColorStop(0.5, layer.ingredient.color);
    layerGradient.addColorStop(1, this.darkenColor(layer.ingredient.color, 20));
    this.ctx.fillStyle = layerGradient;
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = this.darkenColor(layer.ingredient.color, 30);
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Reset shadow
    this.ctx.shadowBlur = 0;

    // Draw emoji on the layer
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      layer.ingredient.emoji,
      this.SANDWICH_CENTER_X,
      y + layer.height / 2
    );

    // Epic badge
    if (isEpic) {
      this.drawEpicBadge(x + layer.width - 15, y + 5, layer.ingredient.multiplier);
    }
  }

  private drawEpicBadge(x: number, y: number, multiplier: number): void {
    // Badge background
    this.ctx.fillStyle = '#9333ea';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 12, 0, Math.PI * 2);
    this.ctx.fill();

    // Badge text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 10px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(`x${multiplier}`, x, y);
  }

  private drawEmptyHint(): void {
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.font = '16px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      'Wähle Zutaten aus!',
      this.SANDWICH_CENTER_X,
      this.SANDWICH_BASE_Y - 100
    );

    // Arrow pointing down
    this.ctx.beginPath();
    this.ctx.moveTo(this.SANDWICH_CENTER_X, this.SANDWICH_BASE_Y - 70);
    this.ctx.lineTo(this.SANDWICH_CENTER_X - 10, this.SANDWICH_BASE_Y - 80);
    this.ctx.lineTo(this.SANDWICH_CENTER_X + 10, this.SANDWICH_BASE_Y - 80);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
    const B = Math.max(0, (num & 0x0000ff) - amt);
    return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
  }

  clear(): void {
    this.layers = [];
    this.emitters.clear();
    this.particleSystem.clear();
  }

  getLayers(): SandwichLayer[] {
    return this.layers;
  }
}
