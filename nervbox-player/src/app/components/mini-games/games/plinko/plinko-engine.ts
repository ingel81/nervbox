import {
  PlinkoBall,
  PlinkoPin,
  PlinkoSlot,
  MULTIPLIERS,
  getSlotColor,
  getSlotBgColor,
} from './plinko.types';

export class PlinkoEngine {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  // Physics Constants - balanced für gutes Gameplay
  private readonly GRAVITY = 0.3;
  private readonly FRICTION = 0.985;
  private readonly BOUNCE = 0.65;
  private readonly PIN_RADIUS = 3;
  private readonly BALL_RADIUS = 7;

  // Board Configuration (16 Rows)
  private readonly ROWS = 16;
  private readonly TOP_PADDING = 40;
  private readonly BOTTOM_PADDING = 70;
  private readonly SIDE_PADDING = 30;

  // State
  private pins: PlinkoPin[] = [];
  private slots: PlinkoSlot[] = [];
  private ball: PlinkoBall | null = null;
  private landedSlotIndex: number | null = null;

  // Callbacks
  onBallLanded?: (slotIndex: number, multiplier: number) => void;
  onPinHit?: () => void;

  // Theme Colors (Purple/Pink with Casino Red accents)
  private readonly colors = {
    background: '#0a0a0a',
    pin: '#ffffff',
    pinHit: '#ec4899',
    pinGlow: 'rgba(147, 51, 234, 0.3)',
    ball: '#ec4899',
    ballGlow: 'rgba(236, 72, 153, 0.8)',
    gridLine: 'rgba(147, 51, 234, 0.03)',
  };

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  init(): void {
    this.calculatePins();
    this.calculateSlots();
    this.render();
  }

  private calculatePins(): void {
    this.pins = [];
    const availableHeight = this.height - this.TOP_PADDING - this.BOTTOM_PADDING;
    const rowSpacing = availableHeight / (this.ROWS + 1);

    // Calculate max width based on last row (ROWS + 2 pins)
    const maxPinsInRow = this.ROWS + 2;
    const horizontalSpacing = (this.width - this.SIDE_PADDING * 2) / (maxPinsInRow - 1);

    for (let row = 0; row < this.ROWS; row++) {
      const pinsInRow = row + 3; // Starts with 3 pins, ends with 18
      const y = this.TOP_PADDING + (row + 1) * rowSpacing;

      // Center the pins for this row
      const rowWidth = (pinsInRow - 1) * horizontalSpacing;
      const startX = (this.width - rowWidth) / 2;

      for (let col = 0; col < pinsInRow; col++) {
        this.pins.push({
          x: startX + col * horizontalSpacing,
          y,
          radius: this.PIN_RADIUS,
          hit: false,
        });
      }
    }
  }

  private calculateSlots(): void {
    this.slots = [];
    const numSlots = 17; // ROWS + 1
    const totalWidth = this.width - this.SIDE_PADDING * 2;
    const slotWidth = totalWidth / numSlots;

    for (let i = 0; i < numSlots; i++) {
      const multiplier = MULTIPLIERS[i];
      this.slots.push({
        x: this.SIDE_PADDING + i * slotWidth,
        width: slotWidth,
        multiplier,
        color: getSlotColor(multiplier),
      });
    }
  }

  dropBall(dropX?: number): void {
    // Reset hit state on all pins
    for (const pin of this.pins) {
      pin.hit = false;
    }
    this.landedSlotIndex = null;

    // Engerer Drop-Bereich - mehr zur Mitte tendierend
    const centerX = this.width / 2;
    const dropSpread = 50; // Engerer Bereich für mehr Mitte-Tendenz
    const x = dropX ?? centerX + (Math.random() - 0.5) * dropSpread;

    // Initiale Geschwindigkeit - weniger horizontal
    this.ball = {
      x,
      y: 10,
      vx: (Math.random() - 0.5) * 1, // Reduzierte horizontale Startgeschwindigkeit
      vy: Math.random() * 1 + 0.5,
      radius: this.BALL_RADIUS,
      active: true,
    };
  }

  update(): void {
    if (!this.ball || !this.ball.active) return;

    // Gravity
    this.ball.vy += this.GRAVITY;

    // Friction (mainly horizontal)
    this.ball.vx *= this.FRICTION;

    // Move
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    // Pin Collision - mehr Zufälligkeit, weniger Hängenbleiben
    for (const pin of this.pins) {
      const dx = this.ball.x - pin.x;
      const dy = this.ball.y - pin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = this.ball.radius + pin.radius;

      if (dist < minDist && dist > 0) {
        // Collision detected
        pin.hit = true;

        // Separate ball from pin - stärker um Hängenbleiben zu vermeiden
        const overlap = minDist - dist + 1;
        const nx = dx / dist;
        const ny = dy / dist;

        this.ball.x += nx * overlap * 1.2;
        this.ball.y += ny * overlap * 1.2;

        // Zufällige Richtung - 50/50 Bounce, aber schwächer für mehr Mitte-Tendenz
        const direction = Math.random() > 0.5 ? 1 : -1;
        const bounceStrength = 0.8 + Math.random() * 0.8; // 0.8-1.6 (reduziert)

        // Horizontal: Schwächerer Bounce = weniger Drift zu den Rändern
        this.ball.vx = direction * bounceStrength + (Math.random() - 0.5) * 0.6;

        // Vertikal: Immer nach unten, mit etwas Variation
        this.ball.vy = Math.abs(this.ball.vy) * this.BOUNCE + 0.5 + Math.random() * 0.5;

        // Minimum Geschwindigkeit nach unten
        if (this.ball.vy < 1.2) {
          this.ball.vy = 1.2 + Math.random() * 0.5;
        }

        this.onPinHit?.();
      }
    }

    // Wall Collision
    if (this.ball.x < this.SIDE_PADDING + this.ball.radius) {
      this.ball.x = this.SIDE_PADDING + this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.5;
    }
    if (this.ball.x > this.width - this.SIDE_PADDING - this.ball.radius) {
      this.ball.x = this.width - this.SIDE_PADDING - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.5;
    }

    // Check if ball reached slots
    const slotY = this.height - this.BOTTOM_PADDING + 10;
    if (this.ball.y >= slotY) {
      this.ball.active = false;
      const slotIndex = this.getSlotIndex(this.ball.x);
      this.landedSlotIndex = slotIndex;
      const multiplier = this.slots[slotIndex].multiplier;
      this.onBallLanded?.(slotIndex, multiplier);
    }
  }

  private getSlotIndex(x: number): number {
    const totalWidth = this.width - this.SIDE_PADDING * 2;
    const slotWidth = totalWidth / 17;
    const index = Math.floor((x - this.SIDE_PADDING) / slotWidth);
    return Math.max(0, Math.min(16, index));
  }

  render(): void {
    // Clear canvas
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw subtle grid
    this.drawGrid();

    // Draw slots
    this.drawSlots();

    // Draw pins
    this.drawPins();

    // Draw ball
    if (this.ball) {
      this.drawBall();
    }
  }

  private drawGrid(): void {
    this.ctx.strokeStyle = this.colors.gridLine;
    this.ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x <= this.width; x += 30) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= this.height; y += 30) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  private drawPins(): void {
    for (const pin of this.pins) {
      // Glow for hit pins
      if (pin.hit) {
        this.ctx.shadowColor = this.colors.pinHit;
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = this.colors.pinHit;
      } else {
        this.ctx.shadowColor = this.colors.pinGlow;
        this.ctx.shadowBlur = 5;
        this.ctx.fillStyle = this.colors.pin;
      }

      this.ctx.beginPath();
      this.ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.shadowBlur = 0;
  }

  private drawSlots(): void {
    const slotHeight = 50;
    const slotY = this.height - slotHeight - 10;
    const gap = 2;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const isLanded = this.landedSlotIndex === i;

      // Slot background
      this.ctx.fillStyle = isLanded ? slot.color : getSlotBgColor(slot.multiplier);
      this.ctx.globalAlpha = isLanded ? 0.8 : 0.4;

      this.roundRect(slot.x + gap, slotY, slot.width - gap * 2, slotHeight, 4);
      this.ctx.fill();

      // Border
      this.ctx.globalAlpha = 1;
      this.ctx.strokeStyle = slot.color;
      this.ctx.lineWidth = isLanded ? 3 : 1;
      this.roundRect(slot.x + gap, slotY, slot.width - gap * 2, slotHeight, 4);
      this.ctx.stroke();

      // Glow for landed slot
      if (isLanded) {
        this.ctx.shadowColor = slot.color;
        this.ctx.shadowBlur = 20;
        this.ctx.strokeStyle = slot.color;
        this.ctx.lineWidth = 2;
        this.roundRect(slot.x + gap, slotY, slot.width - gap * 2, slotHeight, 4);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
      }

      // Multiplier text
      this.ctx.fillStyle = isLanded ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
      this.ctx.font = `bold ${slot.width < 30 ? 9 : 11}px JetBrains Mono, monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      const text = slot.multiplier >= 1 ? `${slot.multiplier}x` : `${slot.multiplier}x`;
      this.ctx.fillText(text, slot.x + slot.width / 2, slotY + slotHeight / 2);
    }
  }

  private drawBall(): void {
    if (!this.ball) return;

    // Outer glow
    this.ctx.shadowColor = this.colors.ballGlow;
    this.ctx.shadowBlur = 20;

    // Ball gradient
    const gradient = this.ctx.createRadialGradient(
      this.ball.x - 2,
      this.ball.y - 2,
      0,
      this.ball.x,
      this.ball.y,
      this.ball.radius
    );
    gradient.addColorStop(0, '#f472b6');
    gradient.addColorStop(0.7, this.colors.ball);
    gradient.addColorStop(1, '#be185d');

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner highlight
    this.ctx.shadowBlur = 0;
    const highlightGradient = this.ctx.createRadialGradient(
      this.ball.x - this.ball.radius / 3,
      this.ball.y - this.ball.radius / 3,
      0,
      this.ball.x,
      this.ball.y,
      this.ball.radius
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.fillStyle = highlightGradient;
    this.ctx.beginPath();
    this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  isBallActive(): boolean {
    return this.ball?.active ?? false;
  }

  getBall(): PlinkoBall | null {
    return this.ball;
  }

  getSlots(): PlinkoSlot[] {
    return this.slots;
  }
}
