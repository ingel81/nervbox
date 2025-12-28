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

  // Symbols (indices must match backend: 0-6 original + 7=hotdog)
  readonly symbols: SlotSymbol[] = [
    { name: 'cherry', emoji: '🍒', color: '#ff0066', glow: '#ff0066', value: 1 },
    { name: 'lemon', emoji: '🍋', color: '#ffff00', glow: '#ffff00', value: 1 },
    { name: 'orange', emoji: '🍊', color: '#ff8800', glow: '#ff8800', value: 1 },
    { name: 'diamond', emoji: '💎', color: '#00ffff', glow: '#00ffff', value: 3 },
    { name: 'seven', emoji: '7️⃣', color: '#ff0000', glow: '#ff00ff', value: 4 },
    { name: 'bar', emoji: '🎰', color: '#ffaa00', glow: '#ffaa00', value: 2 },
    { name: 'crown', emoji: '👑', color: '#ffd700', glow: '#ffff00', value: 5 },
    { name: 'hotdog', emoji: '🌭', color: '#ff6600', glow: '#ff9900', value: 6 },
  ];

  // Game state
  readonly isSpinning = signal(false);
  readonly betAmount = signal(10);
  readonly minBet = 5;
  readonly maxBet = 1000;
  readonly betStep = 5;

  readonly reels = signal<number[]>([0, 0, 0]); // Indices of symbols
  readonly lastWinAmount = signal(0);
  readonly lastWinMessage = signal('');
  readonly showWinAnimation = signal(false);
  readonly showLoseAnimation = signal(false);

  // Displayed balance (delayed update during spin)
  readonly displayedBalance = signal(0);
  private pendingBalance = 0;

  // Spinning animation state
  private reelPositions = [0, 0, 0];
  private reelVelocities = [0, 0, 0];
  private reelTargetSymbols = [0, 0, 0]; // Das Zielsymbol vom Server (0-6)
  private reelFinalPositions = [0, 0, 0]; // Exakte Endposition zum Einrasten
  private reelPhase: ('idle' | 'spinning' | 'stopping' | 'stopped')[] = ['idle', 'idle', 'idle'];
  private readonly SYMBOL_HEIGHT = 60;

  // Particles
  private particles: Particle[] = [];

  readonly canSpin = computed(() =>
    !this.isSpinning() &&
    this.betAmount() <= this.creditService.credits()
  );

  ngOnInit(): void {
    // Initialize with random symbols
    const initialSymbols = [
      Math.floor(Math.random() * this.symbols.length),
      Math.floor(Math.random() * this.symbols.length),
      Math.floor(Math.random() * this.symbols.length),
    ];
    this.reels.set(initialSymbols);

    // Set initial reel positions to match symbols
    this.reelPositions = initialSymbols.map(s => s * this.SYMBOL_HEIGHT);

    // Initialize displayed balance
    this.displayedBalance.set(this.creditService.credits());
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = 480;
    canvas.height = 240;
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
    this.showLoseAnimation.set(false);
    this.lastWinMessage.set('');

    // Reset phases and start spinning
    this.reelPhase = ['spinning', 'spinning', 'spinning'];
    this.reelVelocities = [30, 30, 30];

    // Call backend
    const bet = this.betAmount();

    // Show balance minus bet immediately (optimistic)
    this.displayedBalance.set(this.creditService.credits() - bet);

    this.creditService.playSlotMachine(bet).subscribe({
      next: (response) => {
        // Store target symbols from server
        this.reelTargetSymbols = [...response.symbols];

        // Store pending balance for after animation
        this.pendingBalance = response.newBalance;

        // Calculate final positions for each reel
        const numSymbols = this.symbols.length;
        for (let i = 0; i < 3; i++) {
          const targetSymbol = response.symbols[i];
          const currentPos = this.reelPositions[i];

          // Berechne Endposition: aktueller Zyklus + mindestens 2 volle Umdrehungen + Zielsymbol
          const cycleSize = numSymbols * this.SYMBOL_HEIGHT;
          const currentCycle = Math.floor(currentPos / cycleSize);
          // Ziel: 2-3 volle Umdrehungen von jetzt + zum Zielsymbol
          this.reelFinalPositions[i] = (currentCycle + 3) * cycleSize + targetSymbol * this.SYMBOL_HEIGHT;
        }

        // Schedule stop animations (staggered)
        setTimeout(() => this.triggerStop(0), 600);
        setTimeout(() => this.triggerStop(1), 1000);
        setTimeout(() => this.triggerStop(2), 1400);

        // Show results after all reels definitely stopped
        setTimeout(() => {
          this.showResult(response.winAmount, response.message);
        }, 2800);
      },
      error: (err) => {
        console.error('Slot machine error:', err);
        this.isSpinning.set(false);
        this.reelPhase = ['idle', 'idle', 'idle'];
        // Restore balance on error
        this.displayedBalance.set(this.creditService.credits());
      },
    });
  }

  private triggerStop(reelIndex: number): void {
    this.reelPhase[reelIndex] = 'stopping';
  }

  private snapToFinal(reelIndex: number): void {
    // Exakt auf Endposition setzen
    this.reelPositions[reelIndex] = this.reelFinalPositions[reelIndex];
    this.reelVelocities[reelIndex] = 0;
    this.reelPhase[reelIndex] = 'stopped';

    // Symbol-State aktualisieren
    this.reels.update(reels => {
      const newReels = [...reels];
      newReels[reelIndex] = this.reelTargetSymbols[reelIndex];
      return newReels;
    });
  }

  private showResult(winAmount: number, message: string): void {
    // Stelle sicher, dass alle Walzen final eingerastet sind
    for (let i = 0; i < 3; i++) {
      if (this.reelPhase[i] !== 'stopped') {
        this.snapToFinal(i);
      }
    }

    this.isSpinning.set(false);
    this.reelPhase = ['idle', 'idle', 'idle'];
    this.lastWinAmount.set(winAmount);
    this.lastWinMessage.set(message);

    // Now reveal the actual balance (after animation)
    this.displayedBalance.set(this.pendingBalance);

    if (winAmount > 0) {
      this.showWinAnimation.set(true);
      this.createWinParticles(winAmount);

      // Hide win animation after 3 seconds
      setTimeout(() => {
        this.showWinAnimation.set(false);
      }, 3000);
    } else {
      // Show lose animation
      this.showLoseAnimation.set(true);

      // Hide lose animation after 2 seconds
      setTimeout(() => {
        this.showLoseAnimation.set(false);
      }, 2000);
    }
  }

  private createWinParticles(winAmount: number): void {
    const particleCount = Math.min(50, winAmount);
    const centerX = 240;
    const centerY = 120;

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
        const phase = this.reelPhase[i];

        if (phase === 'spinning') {
          // Freies Drehen mit konstanter Geschwindigkeit
          this.reelPositions[i] += this.reelVelocities[i];
        }
        else if (phase === 'stopping') {
          const targetPos = this.reelFinalPositions[i];
          const currentPos = this.reelPositions[i];
          const distance = targetPos - currentPos;

          if (distance <= 0) {
            // Bereits am/über Ziel - sofort einrasten
            this.snapToFinal(i);
          } else if (distance < 200) {
            // Nahe am Ziel - Ease-Out mit garantiertem Einrasten
            const speed = Math.max(2, distance * 0.15);
            this.reelPositions[i] += speed;

            // Einrasten wenn sehr nah
            if (targetPos - this.reelPositions[i] < 2) {
              this.snapToFinal(i);
            }
          } else {
            // Noch weit weg - normale Geschwindigkeit, aber langsamer werdend
            const speed = Math.min(this.reelVelocities[i], distance * 0.08 + 5);
            this.reelPositions[i] += speed;
            // Geschwindigkeit reduzieren
            this.reelVelocities[i] = Math.max(15, this.reelVelocities[i] * 0.98);
          }
        }
        // 'stopped' und 'idle' - nichts tun
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
    const ctx = this.ctx;
    const W = 480, H = 240;

    // Walzen-Layout: 3 Walzen mit klaren Trennungen
    const reelW = 110;
    const reelH = 200;
    const gap = 24;
    const totalW = 3 * reelW + 2 * gap;
    const startX = (W - totalW) / 2;
    const startY = (H - reelH) / 2;

    const symbolSize = this.SYMBOL_HEIGHT;
    const numSymbols = this.symbols.length;

    // Casino-Gehäuse mit Metallrahmen
    ctx.fillStyle = '#0d0015';
    ctx.beginPath();
    ctx.roundRect(startX - 18, startY - 10, totalW + 36, reelH + 20, 12);
    ctx.fill();

    // Metallischer Rahmen
    const frameGrad = ctx.createLinearGradient(startX - 18, startY - 10, startX - 18, startY + reelH + 10);
    frameGrad.addColorStop(0, '#4a3060');
    frameGrad.addColorStop(0.5, '#2a1540');
    frameGrad.addColorStop(1, '#1a0a30');
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Innerer Glanz
    ctx.strokeStyle = 'rgba(180, 100, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(startX - 16, startY - 8, totalW + 32, reelH + 16, 10);
    ctx.stroke();

    // Jede Walze einzeln zeichnen
    for (let i = 0; i < 3; i++) {
      const x = startX + i * (reelW + gap);
      const centerY = startY + reelH / 2;

      // Walzen-Slot mit Tiefe
      ctx.fillStyle = '#050008';
      ctx.beginPath();
      ctx.roundRect(x - 2, startY, reelW + 4, reelH, 6);
      ctx.fill();

      // 3D-Vertiefung
      const slotGrad = ctx.createLinearGradient(x, startY, x + reelW, startY);
      slotGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
      slotGrad.addColorStop(0.1, 'rgba(0,0,0,0)');
      slotGrad.addColorStop(0.9, 'rgba(0,0,0,0)');
      slotGrad.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = slotGrad;
      ctx.fill();

      // Clipping für saubere Symbolgrenzen
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, startY + 4, reelW, reelH - 8);
      ctx.clip();

      // Symbol-Position berechnen
      const totalCycle = numSymbols * symbolSize;
      const pos = ((this.reelPositions[i] % totalCycle) + totalCycle) % totalCycle;
      const symbolFloat = pos / symbolSize;
      const baseIdx = Math.floor(symbolFloat);
      const offset = (symbolFloat - baseIdx) * symbolSize;

      // Symbole zeichnen (3 sichtbar + Puffer oben/unten)
      for (let j = -2; j <= 2; j++) {
        let idx = (baseIdx + j) % numSymbols;
        if (idx < 0) idx += numSymbols;

        const symbol = this.symbols[idx];
        const yPos = centerY + j * symbolSize - offset;

        // Nur sichtbare Symbole zeichnen
        if (yPos > startY - symbolSize && yPos < startY + reelH + symbolSize) {
          // Leichter Glow für mittleres Symbol
          const distFromCenter = Math.abs(yPos - centerY);
          if (distFromCenter < symbolSize * 0.6) {
            ctx.shadowColor = symbol.glow;
            ctx.shadowBlur = 8;
          } else {
            ctx.shadowBlur = 0;
          }

          ctx.font = '40px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(symbol.emoji, x + reelW / 2, yPos);
        }
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // Oben/Unten Fade-Out für Tiefeneffekt
      const fadeH = 25;
      const topFade = ctx.createLinearGradient(x, startY, x, startY + fadeH);
      topFade.addColorStop(0, '#0d0015');
      topFade.addColorStop(1, 'rgba(13, 0, 21, 0)');
      ctx.fillStyle = topFade;
      ctx.fillRect(x, startY, reelW, fadeH);

      const bottomFade = ctx.createLinearGradient(x, startY + reelH - fadeH, x, startY + reelH);
      bottomFade.addColorStop(0, 'rgba(13, 0, 21, 0)');
      bottomFade.addColorStop(1, '#0d0015');
      ctx.fillStyle = bottomFade;
      ctx.fillRect(x, startY + reelH - fadeH, reelW, fadeH);

      // Walzen-Separator
      if (i < 2) {
        const sepX = x + reelW + gap / 2;
        ctx.strokeStyle = 'rgba(80, 40, 120, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sepX, startY + 10);
        ctx.lineTo(sepX, startY + reelH - 10);
        ctx.stroke();
      }
    }

    // Gewinnlinie mit Glow
    const lineY = startY + reelH / 2;

    // Glow-Effekt
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX - 12, lineY);
    ctx.lineTo(startX + totalW + 12, lineY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pfeil-Indikatoren
    const arrowSize = 8;
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 6;

    // Linker Pfeil
    ctx.beginPath();
    ctx.moveTo(startX - 14, lineY);
    ctx.lineTo(startX - 6, lineY - arrowSize);
    ctx.lineTo(startX - 6, lineY + arrowSize);
    ctx.closePath();
    ctx.fill();

    // Rechter Pfeil
    ctx.beginPath();
    ctx.moveTo(startX + totalW + 14, lineY);
    ctx.lineTo(startX + totalW + 6, lineY - arrowSize);
    ctx.lineTo(startX + totalW + 6, lineY + arrowSize);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
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

    this.ctx.shadowBlur = 15 + pulse * 15;
    this.ctx.shadowColor = '#ffd700';
    this.ctx.strokeStyle = '#ffd700';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(5, 5, 470, 230);
    this.ctx.shadowBlur = 0;
  }

  exitGame(): void {
    this.dialogRef.close();
  }
}
