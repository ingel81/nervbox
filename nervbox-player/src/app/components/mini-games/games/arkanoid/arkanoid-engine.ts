export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  speed: number;
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;
}

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  destroyed: boolean;
  points: number;
  row: number;
}

export type GameState = 'ready' | 'playing' | 'paused' | 'gameover' | 'won';

export class ArkanoidEngine {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  private ball: Ball;
  private paddle: Paddle;
  private bricks: Brick[] = [];
  private score = 0;
  private lives = 3;
  private currentLevel = 1;

  // Callbacks
  onScoreChange?: (score: number) => void;
  onLivesChange?: (lives: number) => void;
  onGameOver?: () => void;
  onLevelComplete?: () => void;
  onBrickDestroyed?: () => void;

  // Theme Colors (Purple/Pink)
  private readonly colors = {
    ball: '#ec4899',
    ballGlow: 'rgba(236, 72, 153, 0.6)',
    paddleStart: '#9333ea',
    paddleEnd: '#ec4899',
    paddleGlow: 'rgba(147, 51, 234, 0.5)',
    brickColors: ['#9333ea', '#a855f7', '#c084fc', '#ec4899', '#f472b6', '#fb7185'],
    background: '#0a0a0a',
    gridLine: 'rgba(147, 51, 234, 0.05)',
  };

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;

    // Initialize ball
    this.ball = {
      x: width / 2,
      y: height - 60,
      dx: 0,
      dy: 0,
      radius: 8,
      speed: 5,
    };

    // Initialize paddle
    this.paddle = {
      x: width / 2 - 50,
      y: height - 30,
      width: 100,
      height: 12,
      targetX: width / 2 - 50,
    };
  }

  init(): void {
    this.resetBall();
    this.paddle.x = this.width / 2 - this.paddle.width / 2;
    this.paddle.targetX = this.paddle.x;
    this.createBricks(this.currentLevel);
    this.render();
  }

  reset(): void {
    this.score = 0;
    this.lives = 3;
    this.currentLevel = 1;
    this.ball.speed = 5;
    this.onScoreChange?.(0);
    this.onLivesChange?.(3);
    this.init();
  }

  nextLevel(level: number): void {
    this.currentLevel = level;
    this.ball.speed = Math.min(5 + level * 0.5, 10);
    this.resetBall();
    this.createBricks(level);
  }

  private resetBall(): void {
    this.ball.x = this.width / 2;
    this.ball.y = this.height - 60;
    // Random angle between -45 and 45 degrees upward
    const angle = ((Math.random() - 0.5) * Math.PI) / 2;
    this.ball.dx = Math.sin(angle) * this.ball.speed;
    this.ball.dy = -Math.cos(angle) * this.ball.speed;
  }

  private createBricks(level: number): void {
    this.bricks = [];
    const rows = Math.min(3 + level, 7);
    const cols = 10;
    const padding = 4;
    const brickWidth = (this.width - 40 - padding * (cols - 1)) / cols;
    const brickHeight = 22;
    const topOffset = 60;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const colorIndex = row % this.colors.brickColors.length;
        this.bricks.push({
          x: 20 + col * (brickWidth + padding),
          y: topOffset + row * (brickHeight + padding),
          width: brickWidth,
          height: brickHeight,
          color: this.colors.brickColors[colorIndex],
          destroyed: false,
          points: (rows - row) * 10 * level,
          row,
        });
      }
    }
  }

  movePaddle(x: number): void {
    this.paddle.targetX = Math.max(
      0,
      Math.min(this.width - this.paddle.width, x - this.paddle.width / 2)
    );
  }

  update(): void {
    // Smooth paddle movement
    const paddleSpeed = 0.3;
    this.paddle.x += (this.paddle.targetX - this.paddle.x) * paddleSpeed;

    // Ball movement
    this.ball.x += this.ball.dx;
    this.ball.y += this.ball.dy;

    // Wall collision (left/right)
    if (this.ball.x <= this.ball.radius) {
      this.ball.x = this.ball.radius;
      this.ball.dx = Math.abs(this.ball.dx);
    }
    if (this.ball.x >= this.width - this.ball.radius) {
      this.ball.x = this.width - this.ball.radius;
      this.ball.dx = -Math.abs(this.ball.dx);
    }

    // Top wall collision
    if (this.ball.y <= this.ball.radius) {
      this.ball.y = this.ball.radius;
      this.ball.dy = Math.abs(this.ball.dy);
    }

    // Bottom collision (lose life)
    if (this.ball.y >= this.height + this.ball.radius) {
      this.lives--;
      this.onLivesChange?.(this.lives);

      if (this.lives <= 0) {
        this.onGameOver?.();
      } else {
        this.resetBall();
      }
      return;
    }

    // Paddle collision
    if (this.checkPaddleCollision()) {
      // Calculate bounce angle based on where ball hits paddle
      const hitPos = (this.ball.x - this.paddle.x) / this.paddle.width;
      const angle = (hitPos - 0.5) * Math.PI * 0.7; // Max 63 degrees

      const speed = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
      this.ball.dx = Math.sin(angle) * speed;
      this.ball.dy = -Math.abs(Math.cos(angle) * speed);

      // Ensure ball is above paddle
      this.ball.y = this.paddle.y - this.ball.radius - 1;
    }

    // Brick collision
    for (const brick of this.bricks) {
      if (!brick.destroyed && this.checkBrickCollision(brick)) {
        brick.destroyed = true;
        this.score += brick.points;
        this.onScoreChange?.(this.score);
        this.onBrickDestroyed?.();

        // Determine collision side for bounce direction
        const ballCenterX = this.ball.x;
        const ballCenterY = this.ball.y;
        const brickCenterX = brick.x + brick.width / 2;
        const brickCenterY = brick.y + brick.height / 2;

        const dx = ballCenterX - brickCenterX;
        const dy = ballCenterY - brickCenterY;

        if (Math.abs(dx / brick.width) > Math.abs(dy / brick.height)) {
          this.ball.dx = -this.ball.dx;
        } else {
          this.ball.dy = -this.ball.dy;
        }

        // Check win condition
        if (this.bricks.every(b => b.destroyed)) {
          this.onLevelComplete?.();
        }
        break;
      }
    }
  }

  private checkPaddleCollision(): boolean {
    return (
      this.ball.y + this.ball.radius >= this.paddle.y &&
      this.ball.y - this.ball.radius <= this.paddle.y + this.paddle.height &&
      this.ball.x >= this.paddle.x - this.ball.radius &&
      this.ball.x <= this.paddle.x + this.paddle.width + this.ball.radius &&
      this.ball.dy > 0
    );
  }

  private checkBrickCollision(brick: Brick): boolean {
    return (
      this.ball.x + this.ball.radius >= brick.x &&
      this.ball.x - this.ball.radius <= brick.x + brick.width &&
      this.ball.y + this.ball.radius >= brick.y &&
      this.ball.y - this.ball.radius <= brick.y + brick.height
    );
  }

  render(): void {
    // Clear canvas
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw subtle grid
    this.drawGrid();

    // Draw bricks with glow effect
    for (const brick of this.bricks) {
      if (!brick.destroyed) {
        this.drawBrick(brick);
      }
    }

    // Draw paddle with gradient and glow
    this.drawPaddle();

    // Draw ball with glow
    this.drawBall();
  }

  private drawGrid(): void {
    this.ctx.strokeStyle = this.colors.gridLine;
    this.ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x <= this.width; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= this.height; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  private drawBrick(brick: Brick): void {
    // Glow effect
    this.ctx.shadowColor = brick.color;
    this.ctx.shadowBlur = 10;

    // Brick gradient
    const gradient = this.ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
    gradient.addColorStop(0, brick.color);
    gradient.addColorStop(1, this.adjustBrightness(brick.color, -30));

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.roundRect(brick.x, brick.y, brick.width, brick.height, 4);
    this.ctx.fill();

    // Highlight
    this.ctx.shadowBlur = 0;
    const highlightGradient = this.ctx.createLinearGradient(
      brick.x,
      brick.y,
      brick.x,
      brick.y + brick.height / 2
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.fillStyle = highlightGradient;
    this.ctx.beginPath();
    this.roundRect(brick.x, brick.y, brick.width, brick.height / 2, 4);
    this.ctx.fill();
  }

  private drawPaddle(): void {
    // Glow effect
    this.ctx.shadowColor = this.colors.paddleGlow;
    this.ctx.shadowBlur = 20;

    // Paddle gradient
    const gradient = this.ctx.createLinearGradient(
      this.paddle.x,
      0,
      this.paddle.x + this.paddle.width,
      0
    );
    gradient.addColorStop(0, this.colors.paddleStart);
    gradient.addColorStop(1, this.colors.paddleEnd);

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.roundRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height, 6);
    this.ctx.fill();

    // Paddle highlight
    this.ctx.shadowBlur = 0;
    const highlightGradient = this.ctx.createLinearGradient(
      this.paddle.x,
      this.paddle.y,
      this.paddle.x,
      this.paddle.y + this.paddle.height / 2
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.fillStyle = highlightGradient;
    this.ctx.beginPath();
    this.roundRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height / 2, 6);
    this.ctx.fill();
  }

  private drawBall(): void {
    // Outer glow
    this.ctx.shadowColor = this.colors.ballGlow;
    this.ctx.shadowBlur = 25;

    // Ball
    this.ctx.fillStyle = this.colors.ball;
    this.ctx.beginPath();
    this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner highlight
    this.ctx.shadowBlur = 0;
    const gradient = this.ctx.createRadialGradient(
      this.ball.x - this.ball.radius / 3,
      this.ball.y - this.ball.radius / 3,
      0,
      this.ball.x,
      this.ball.y,
      this.ball.radius
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
  }

  private adjustBrightness(color: string, amount: number): string {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  getScore(): number {
    return this.score;
  }

  getLives(): number {
    return this.lives;
  }
}
