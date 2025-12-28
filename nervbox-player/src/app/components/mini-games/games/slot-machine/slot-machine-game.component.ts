import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { CreditService } from '../../../../core/services/credit.service';

interface SlotSymbol {
  name: string;
  emoji: string;
  color: string;
  glow: string;
  value: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

@Component({
  selector: 'app-slot-machine-game',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
  ],
  templateUrl: './slot-machine-game.component.html',
  styleUrls: ['./slot-machine-game.component.scss'],
})
export class SlotMachineGameComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<SlotMachineGameComponent>);
  readonly creditService = inject(CreditService);

  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private animationFrame: number = 0;

  // Symbols
  readonly symbols: SlotSymbol[] = [
    { name: 'cherry', emoji: '🍒', color: '#ff0066', glow: '#ff0066', value: 1 },
    { name: 'lemon', emoji: '🍋', color: '#ffff00', glow: '#ffff00', value: 1 },
    { name: 'orange', emoji: '🍊', color: '#ff8800', glow: '#ff8800', value: 1 },
    { name: 'diamond', emoji: '💎', color: '#00ffff', glow: '#00ffff', value: 3 },
    { name: 'seven', emoji: '7️⃣', color: '#ff0000', glow: '#ff00ff', value: 4 },
    { name: 'bar', emoji: '🎰', color: '#ffaa00', glow: '#ffaa00', value: 2 },
    { name: 'crown', emoji: '👑', color: '#ffd700', glow: '#ffff00', value: 5 },
  ];

  // Game state
  readonly isSpinning = signal(false);
  readonly betAmount = signal(10);
  readonly minBet = 5;
  readonly maxBet = 100;
  readonly betStep = 5;

  readonly reels = signal<number[]>([0, 0, 0]); // Indices of symbols
  readonly lastWinAmount = signal(0);
  readonly lastWinMessage = signal('');
  readonly showWinAnimation = signal(false);

  // Spinning animation state
  private reelPositions = [0, 0, 0];
  private reelVelocities = [0, 0, 0];
  private reelTargets = [0, 0, 0];
  private spinStartTime = 0;
  private readonly SYMBOL_HEIGHT = 120;
  private readonly SPIN_DURATION = 3000;

  // Particles
  private particles: Particle[] = [];

  readonly canSpin = computed(() =>
    !this.isSpinning() &&
    this.betAmount() <= this.creditService.credits()
  );

  readonly currentBalance = this.creditService.credits;

  ngOnInit(): void {
    // Initialize with random symbols
    this.reels.set([
      Math.floor(Math.random() * this.symbols.length),
      Math.floor(Math.random() * this.symbols.length),
      Math.floor(Math.random() * this.symbols.length),
    ]);
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = 800;
    canvas.height = 400;
    this.ctx = canvas.getContext('2d')!;

    // Start render loop
    this.render();
  }

  ngOnDestroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }

  increaseBet(): void {
    if (this.betAmount() < this.maxBet) {
      this.betAmount.update(v => Math.min(v + this.betStep, this.maxBet));
    }
  }

  decreaseBet(): void {
    if (this.betAmount() > this.minBet) {
      this.betAmount.update(v => Math.max(v - this.betStep, this.minBet));
    }
  }

  spin(): void {
    if (!this.canSpin()) return;

    this.isSpinning.set(true);
    this.showWinAnimation.set(false);
    this.lastWinMessage.set('');

    // Start spinning animation
    this.spinStartTime = Date.now();
    this.reelVelocities = [50, 50, 50]; // Fast initial speed

    // Call backend
    const bet = this.betAmount();
    this.creditService.playSlotMachine(bet).subscribe({
      next: (response) => {
        // Set target symbols based on server response
        this.reelTargets = response.symbols;

        // Schedule stop animations (staggered)
        setTimeout(() => this.stopReel(0), 1500);
        setTimeout(() => this.stopReel(1), 2000);
        setTimeout(() => this.stopReel(2), 2500);

        // Show results after all reels stop
        setTimeout(() => {
          this.showResult(response.winAmount, response.message);
        }, 3000);
      },
      error: (err) => {
        console.error('Slot machine error:', err);
        this.isSpinning.set(false);
      },
    });
  }

  private stopReel(reelIndex: number): void {
    // Slow down this reel to stop at target
    this.reelVelocities[reelIndex] = 2;
  }

  private showResult(winAmount: number, message: string): void {
    this.isSpinning.set(false);
    this.lastWinAmount.set(winAmount);
    this.lastWinMessage.set(message);

    if (winAmount > 0) {
      this.showWinAnimation.set(true);
      this.createWinParticles(winAmount);

      // Hide win animation after 3 seconds
      setTimeout(() => {
        this.showWinAnimation.set(false);
      }, 3000);
    }
  }

  private createWinParticles(winAmount: number): void {
    const particleCount = Math.min(100, winAmount * 2);
    const centerX = 400;
    const centerY = 200;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 2 + Math.random() * 3;

      this.particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 60 + Math.random() * 60,
        color: this.getRandomColor(),
        size: 3 + Math.random() * 5,
      });
    }
  }

  private getRandomColor(): string {
    const colors = ['#ff0066', '#00ffff', '#ffff00', '#ff00ff', '#00ff00', '#ffd700'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private render = (): void => {
    this.animationFrame = requestAnimationFrame(this.render);

    if (!this.ctx) return;

    const canvas = this.ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    this.ctx.fillStyle = '#1a0033';
    this.ctx.fillRect(0, 0, width, height);

    // Update spinning reels
    if (this.isSpinning()) {
      for (let i = 0; i < 3; i++) {
        this.reelPositions[i] += this.reelVelocities[i];

        // Wrap around
        const maxPos = this.symbols.length * this.SYMBOL_HEIGHT;
        if (this.reelPositions[i] >= maxPos) {
          this.reelPositions[i] = 0;
        }

        // Slow down gradually and snap to target
        if (this.reelVelocities[i] <= 2) {
          const targetPos = this.reelTargets[i] * this.SYMBOL_HEIGHT;
          const diff = targetPos - (this.reelPositions[i] % maxPos);

          if (Math.abs(diff) < 5) {
            this.reelPositions[i] = targetPos;
            this.reelVelocities[i] = 0;
            this.reels.update(reels => {
              const newReels = [...reels];
              newReels[i] = this.reelTargets[i];
              return newReels;
            });
          }
        }
      }
    }

    // Draw reels
    this.drawReels();

    // Draw particles
    this.updateParticles();
    this.drawParticles();

    // Draw glow effects
    if (this.showWinAnimation()) {
      this.drawWinGlow();
    }
  };

  private drawReels(): void {
    const reelWidth = 200;
    const reelHeight = 300;
    const startX = 100;
    const startY = 50;
    const gap = 20;

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (reelWidth + gap);

      // Draw reel background
      this.ctx.fillStyle = '#2a0055';
      this.ctx.strokeStyle = '#ff00ff';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.roundRect(x, startY, reelWidth, reelHeight, 10);
      this.ctx.fill();
      this.ctx.stroke();

      // Draw neon glow
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = '#ff00ff';
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;

      // Draw symbol
      const symbolIndex = this.reels()[i];
      const symbol = this.symbols[symbolIndex];

      // Draw symbol emoji
      this.ctx.font = 'bold 100px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      // Glow effect
      this.ctx.shadowBlur = 30;
      this.ctx.shadowColor = symbol.glow;
      this.ctx.fillStyle = symbol.color;
      this.ctx.fillText(symbol.emoji, x + reelWidth / 2, startY + reelHeight / 2);
      this.ctx.shadowBlur = 0;
    }
  }

  private updateParticles(): void {
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // Gravity
      p.life++;
      return p.life < p.maxLife;
    });
  }

  private drawParticles(): void {
    this.particles.forEach(p => {
      const alpha = 1 - p.life / p.maxLife;
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
  }

  private drawWinGlow(): void {
    const time = Date.now() / 100;
    const pulse = Math.sin(time) * 0.5 + 0.5;

    this.ctx.shadowBlur = 50 + pulse * 50;
    this.ctx.shadowColor = '#ffd700';
    this.ctx.strokeStyle = '#ffd700';
    this.ctx.lineWidth = 5;
    this.ctx.strokeRect(50, 25, 700, 350);
    this.ctx.shadowBlur = 0;
  }

  exitGame(): void {
    this.dialogRef.close();
  }
}
