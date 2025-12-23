import {
  Component,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CreditService } from '../../../../core/services/credit.service';
import { ApiService } from '../../../../core/services/api.service';
import kaplay, { KAPLAYCtx, GameObj, Vec2 } from 'kaplay';

type GameState = 'loading' | 'ready' | 'aiming' | 'flying' | 'roundover' | 'gameover';

interface Target {
  obj: GameObj;
  points: number;
  hit: boolean;
  faceIndex: number;
}

// Sprite dimensions (manually sliced)
const SPRITES = {
  hotdog: { w: 303, h: 194 },
  slingshot: { w: 251, h: 251 },
  faces: [
    { w: 147, h: 172 },  // Face 0: blonde
    { w: 159, h: 168 },  // Face 1: rote Haare
    { w: 160, h: 190 },  // Face 2: Kappe
    { w: 158, h: 180 },  // Face 3: Brille
    { w: 170, h: 183 },  // Face 4: brünette
    { w: 171, h: 201 },  // Face 5: rote Kappe
  ],
};

@Component({
  selector: 'app-hotdog-game',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="hotdog-container">
      <!-- Game Header -->
      <div class="game-header">
        <div class="header-left">
          <div class="score-display">
            <mat-icon>stars</mat-icon>
            <span class="score-value">{{ score() }}</span>
          </div>
          <div class="round-display">
            <span class="round-label">RND</span>
            <span class="round-value">{{ round() }}</span>
          </div>
        </div>

        <div class="hotdogs-display">
          @for (hd of hotdogsArray(); track $index) {
            <span class="hotdog-icon">🌭</span>
          }
        </div>

        <button mat-icon-button class="close-btn" (click)="exitGame()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- Game Canvas -->
      <div class="canvas-container">
        <canvas #gameCanvas class="game-canvas"></canvas>

        <!-- Loading Overlay -->
        @if (gameState() === 'loading') {
          <div class="overlay loading-overlay">
            <span class="overlay-emoji">🌭</span>
            <h3>Lädt...</h3>
          </div>
        }

        <!-- Ready Overlay -->
        @if (gameState() === 'ready') {
          <div class="overlay start-overlay" (click)="startGame()">
            <img src="/games/hotdog/logo.png" class="logo-sprite" alt="Hotdog Katapult">
            <p class="subtitle"></p>
            <button mat-raised-button color="primary" class="start-btn">
              <mat-icon>play_arrow</mat-icon>
              Los geht's!
            </button>
            <p class="controls-hint">Ziehen zum Spannen, Loslassen zum Schiessen</p>
          </div>
        }

        <!-- Round Over Overlay -->
        @if (gameState() === 'roundover') {
          <div class="overlay">
            <span class="overlay-emoji">🎯</span>
            <h3>Runde {{ round() }} geschafft!</h3>
            <p class="final-score">Score: {{ score() }}</p>
            <div class="overlay-actions">
              <button mat-raised-button color="primary" (click)="nextRound()">
                <mat-icon>arrow_forward</mat-icon>
                Naechste Runde
              </button>
            </div>
          </div>
        }

        <!-- Game Over Overlay -->
        @if (gameState() === 'gameover') {
          <div class="overlay gameover-overlay">
            <span class="overlay-emoji">😋</span>
            <h3>Lecker!</h3>
            <p class="final-score">Score: {{ score() }}</p>
            <p class="final-round">Erreicht: Runde {{ round() }}</p>
            @if (reward() > 0) {
              <p class="reward-display">+{{ reward() }} N$</p>
            }
            <div class="overlay-actions">
              <button mat-raised-button color="primary" (click)="restartGame()">
                <mat-icon>replay</mat-icon>
                Nochmal spielen
              </button>
              <button mat-stroked-button (click)="exitGame()">Beenden</button>
            </div>
          </div>
        }
      </div>

      <!-- Game Footer -->
      <div class="game-footer">
        <span class="footer-hint">🌭 Katapultiere die Hotdogs in die Mäuler!</span>
      </div>
    </div>
  `,
  styles: `
    .hotdog-container {
      display: flex;
      flex-direction: column;
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
      user-select: none;
      min-width: 1100px;
    }

    .game-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(90deg, rgba(249, 115, 22, 0.2) 0%, rgba(234, 179, 8, 0.2) 100%);
      border-bottom: 1px solid rgba(249, 115, 22, 0.3);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .score-display {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fbbf24;
      font-family: 'JetBrains Mono', monospace;
      font-size: 18px;
      font-weight: 700;
    }

    .score-display mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .round-display {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(249, 115, 22, 0.2);
      border: 1px solid rgba(249, 115, 22, 0.4);
      border-radius: 6px;
    }

    .round-label {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 1px;
    }

    .round-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 700;
      color: #f97316;
    }

    .hotdogs-display {
      display: flex;
      gap: 4px;
    }

    .hotdog-icon {
      font-size: 22px;
      filter: drop-shadow(0 0 4px rgba(249, 115, 22, 0.5));
    }

    .close-btn {
      color: rgba(255, 255, 255, 0.5);
      transition: color 0.2s ease;
    }

    .close-btn:hover {
      color: #ef4444;
    }

    .canvas-container {
      position: relative;
      display: flex;
      justify-content: center;
      background: #0a0a0a;
    }

    .game-canvas {
      display: block;
      max-width: 100%;
      height: auto;
    }

    .overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10, 10, 10, 0.95);
      border: 1px solid rgba(249, 115, 22, 0.5);
      border-radius: 20px;
      padding: 32px 48px;
      text-align: center;
      z-index: 10;
      backdrop-filter: blur(10px);
      box-shadow: 0 0 40px rgba(249, 115, 22, 0.3);
    }

    .overlay-emoji {
      font-size: 64px;
      display: block;
      margin-bottom: 16px;
    }

    .overlay h3 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, #f97316 0%, #eab308 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 16px;
    }

    .subtitle {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 20px;
    }

    .start-btn {
      background: linear-gradient(135deg, #f97316 0%, #eab308 100%) !important;
      padding: 8px 32px !important;
      font-size: 16px !important;
      margin-bottom: 16px;
      animation: pulse-btn 2s ease-in-out infinite;
    }

    .start-btn mat-icon {
      margin-right: 8px;
    }

    @keyframes pulse-btn {
      0%, 100% { box-shadow: 0 4px 20px rgba(249, 115, 22, 0.4); }
      50% { box-shadow: 0 4px 30px rgba(249, 115, 22, 0.7); }
    }

    .start-overlay {
      cursor: pointer;
    }

    .logo-sprite {
      width: 280px;
      height: auto;
      margin-bottom: 16px;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
    }

    .loading-overlay {
      animation: pulse-loading 1.5s ease-in-out infinite;
    }

    @keyframes pulse-loading {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .controls-hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
    }

    .final-score {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      color: #fbbf24;
      font-weight: 700;
      margin: 16px 0 8px;
    }

    .final-round {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 16px;
    }

    .reward-display {
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      color: #22c55e;
      margin: 8px 0 16px;
      text-shadow: 0 0 20px rgba(34, 197, 94, 0.5);
      animation: reward-pulse 1s ease-in-out infinite;
    }

    @keyframes reward-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.9; }
    }

    .overlay-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 24px;
    }

    .overlay-actions button {
      min-width: 180px;
    }

    .overlay-actions button[color='primary'] {
      background: linear-gradient(135deg, #f97316 0%, #eab308 100%);
    }

    .overlay-actions button mat-icon {
      margin-right: 8px;
    }

    .game-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      background: rgba(249, 115, 22, 0.1);
      border-top: 1px solid rgba(249, 115, 22, 0.2);
    }

    .footer-hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
    }

    @media (max-width: 600px) {
      .overlay {
        padding: 24px 32px;
        width: 90%;
        max-width: 300px;
      }

      .overlay h3 {
        font-size: 22px;
      }

      .overlay-emoji {
        font-size: 48px;
      }

      .game-header {
        padding: 8px 12px;
      }

      .score-display {
        font-size: 16px;
      }

      .hotdog-icon {
        font-size: 18px;
      }
    }
  `,
})
export class HotdogGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly dialogRef = inject(MatDialogRef<HotdogGameComponent>);
  private readonly creditService = inject(CreditService);
  private readonly api = inject(ApiService);

  // Sound
  private readonly LAUNCH_SOUND_HASH = '2717a9969d1080a0aea1610a7fa29cdd';
  private readonly HIT_SOUND_HASHES = [
    '11c56b9124445eb7c15ee32007b09133',
    '01a458a573c5cf05b57820c623709b9a',
  ];
  private launchSoundUrl = '';
  private hitSoundUrls: string[] = [];

  readonly score = signal(0);
  readonly round = signal(1);
  readonly hotdogs = signal(3); // Weniger Hotdogs = schwieriger
  readonly gameState = signal<GameState>('loading');
  readonly reward = signal(0);

  readonly hotdogsArray = () => Array(this.hotdogs()).fill(0);

  // Großer Screen für mehr Spielraum
  readonly canvasWidth = 1100;
  readonly canvasHeight = 650;

  private k!: KAPLAYCtx;
  private hotdog: GameObj | null = null;
  private slingshot: { anchor: Vec2; pulling: boolean; pullPos: Vec2 | null } = {
    anchor: { x: 100, y: 400 } as Vec2,
    pulling: false,
    pullPos: null,
  };
  private targets: Target[] = [];
  private isFlying = false;
  private roundTargetsHit = 0;
  private spritesLoaded = false;

  ngAfterViewInit(): void {
    this.initKaplay();
  }

  private async initKaplay(): Promise<void> {
    const canvas = this.canvasRef.nativeElement;

    this.k = kaplay({
      canvas,
      width: this.canvasWidth,
      height: this.canvasHeight,
      background: [10, 10, 10],
      global: false,
    });

    // Load sprites
    await this.loadSprites();

    // Set up sound URL
    this.launchSoundUrl = this.api.getFullUrl(`/sound/${this.LAUNCH_SOUND_HASH}/file`);
    this.hitSoundUrls = this.HIT_SOUND_HASHES.map(hash =>
      this.api.getFullUrl(`/sound/${hash}/file`)
    );

    // Draw initial state with background
    this.drawBackground();
    this.gameState.set('ready');
  }

  private async loadSprites(): Promise<void> {
    const k = this.k;
    const basePath = '/games/hotdog';

    // Load individual sprite files (extracted from sprite sheet)
    k.loadSprite('hotdog', `${basePath}/hotdog.png`);
    k.loadSprite('slingshot', `${basePath}/slingshot.png`);
    k.loadSprite('background', `${basePath}/background.png`);

    // Load face sprites
    for (let i = 0; i < SPRITES.faces.length; i++) {
      k.loadSprite(`face${i}`, `${basePath}/face${i}.png`);
    }

    this.spritesLoaded = true;
  }

  private drawBackground(): void {
    const k = this.k;

    // Sky gradient background
    k.add([
      k.rect(this.canvasWidth, this.canvasHeight),
      k.pos(0, 0),
      k.color(135, 206, 250), // Light sky blue
      k.z(-20),
    ]);

    // Stoned sun with droopy red eyes
    const sunX = this.canvasWidth - 100;
    const sunBaseY = 70;
    const sun = k.add([
      k.text('🌞', { size: 70 }),
      k.pos(sunX, sunBaseY),
      k.anchor('center'),
      k.z(-18),
    ]);
    // Stoned bloodshot eyes - subtle red, semi-transparent
    const eyeOffsetY = -10;
    const leftEye = k.add([
      k.text('•', { size: 14 }),
      k.pos(sunX - 10, sunBaseY + eyeOffsetY),
      k.anchor('center'),
      k.color(180, 50, 50),
      k.opacity(0.5),
      k.z(-17),
    ]);
    const rightEye = k.add([
      k.text('•', { size: 14 }),
      k.pos(sunX + 10, sunBaseY + eyeOffsetY),
      k.anchor('center'),
      k.color(180, 50, 50),
      k.opacity(0.5),
      k.z(-17),
    ]);
    // Wobble animation for sun AND eyes together
    let sunPhase = 0;
    const wobbleSun = () => {
      sunPhase += 0.02;
      const wobbleY = sunBaseY + Math.sin(sunPhase) * 3;
      sun['pos'].y = wobbleY;
      leftEye['pos'].y = wobbleY + eyeOffsetY;
      rightEye['pos'].y = wobbleY + eyeOffsetY;
      requestAnimationFrame(wobbleSun);
    };
    wobbleSun();

    // Trees in background (static, no animation)
    const treeData = [
      { x: 80, emoji: '🌳', size: 45 },
      { x: 280, emoji: '🌲', size: 40 },
      { x: 480, emoji: '🌴', size: 35 },
      { x: 680, emoji: '🌳', size: 50 },
      { x: 880, emoji: '🌲', size: 42 },
      { x: 1020, emoji: '🌳', size: 38 },
    ];
    treeData.forEach(tree => {
      k.add([
        k.text(tree.emoji, { size: tree.size }),
        k.pos(tree.x, this.canvasHeight - 95 - tree.size / 2),
        k.anchor('center'),
        k.z(-12),
      ]);
    });

    // Bushes (static)
    const bushPositions = [180, 380, 580, 780, 950];
    bushPositions.forEach(xPos => {
      k.add([
        k.text('🌳', { size: 28 }),
        k.pos(xPos, this.canvasHeight - 85),
        k.anchor('center'),
        k.opacity(0.9),
        k.z(-11),
      ]);
    });

    // Mushrooms and flowers (static)
    const decorPositions = [220, 420, 520, 720, 920];
    decorPositions.forEach((xPos, i) => {
      k.add([
        k.text(i % 2 === 0 ? '🍄' : '🌸', { size: 22 }),
        k.pos(xPos + Math.random() * 30, this.canvasHeight - 75),
        k.anchor('center'),
        k.z(-7),
      ]);
    });

    // Leaves (static)
    const leaves = ['🌿', '🍃', '☘️'];
    leaves.forEach((leaf, i) => {
      k.add([
        k.text(leaf, { size: 18 }),
        k.pos(150 + i * 350, this.canvasHeight - 80),
        k.anchor('center'),
        k.opacity(0.8),
        k.z(-6),
      ]);
    });

    // Ground (grass)
    k.add([
      k.rect(this.canvasWidth, 100),
      k.pos(0, this.canvasHeight - 100),
      k.color(76, 153, 0), // Green grass
      k.z(-10),
    ]);

    // Darker grass stripe
    k.add([
      k.rect(this.canvasWidth, 20),
      k.pos(0, this.canvasHeight - 100),
      k.color(56, 128, 0),
      k.z(-9),
    ]);

    // Start background animations
    this.spawnBackgroundElements();
  }

  private spawnBackgroundElements(): void {
    const k = this.k;

    // Spawn clouds periodically
    const spawnCloud = () => {
      const cloudY = 50 + Math.random() * 150;
      const cloudSpeed = 0.3 + Math.random() * 0.4;
      const cloudEmoji = '☁️';
      const cloudSize = 30 + Math.random() * 30;

      const cloud = k.add([
        k.text(cloudEmoji, { size: cloudSize }),
        k.pos(this.canvasWidth + 50, cloudY),
        k.opacity(0.7),
        k.anchor('center'),
        k.z(-15),
        'bgcloud',
      ]);

      const moveCloud = () => {
        if (!cloud['pos']) return;
        cloud['pos'].x -= cloudSpeed;
        if (cloud['pos'].x < -100) {
          k.destroy(cloud);
        } else {
          requestAnimationFrame(moveCloud);
        }
      };
      requestAnimationFrame(moveCloud);
    };

    // Spawn a cloud every 3-6 seconds
    const cloudInterval = setInterval(() => {
      if (!this.k) {
        clearInterval(cloudInterval);
        return;
      }
      spawnCloud();
    }, 3000 + Math.random() * 3000);

    // Initial clouds
    for (let i = 0; i < 3; i++) {
      setTimeout(() => spawnCloud(), i * 500);
    }

    // Spawn birds occasionally
    const spawnBird = () => {
      const birdY = 80 + Math.random() * 120;
      const birdSpeed = 1.5 + Math.random() * 1;
      const birdSize = 20 + Math.random() * 15;

      const bird = k.add([
        k.text('🐦', { size: birdSize }),
        k.pos(this.canvasWidth + 30, birdY),
        k.anchor('center'),
        k.z(-14),
        'bgbird',
      ]);

      let wingPhase = 0;
      const moveBird = () => {
        if (!bird['pos']) return;
        bird['pos'].x -= birdSpeed;
        // Slight wave motion
        wingPhase += 0.15;
        bird['pos'].y = birdY + Math.sin(wingPhase) * 5;

        if (bird['pos'].x < -50) {
          k.destroy(bird);
        } else {
          requestAnimationFrame(moveBird);
        }
      };
      requestAnimationFrame(moveBird);
    };

    // Spawn a bird every 5-10 seconds
    const birdInterval = setInterval(() => {
      if (!this.k) {
        clearInterval(birdInterval);
        return;
      }
      spawnBird();
    }, 5000 + Math.random() * 5000);

    // Spawn butterflies in the grass area
    const spawnButterfly = () => {
      const startX = Math.random() * this.canvasWidth;
      const startY = this.canvasHeight - 120 - Math.random() * 80;
      const butterfly = Math.random() > 0.5 ? '🦋' : '🐝';

      const fly = k.add([
        k.text(butterfly, { size: 18 }),
        k.pos(startX, startY),
        k.anchor('center'),
        k.z(-8),
        'bgbutterfly',
      ]);

      let phase = Math.random() * Math.PI * 2;
      let lifetime = 0;
      const maxLifetime = 300 + Math.random() * 200;

      const moveButterfly = () => {
        if (!fly['pos']) return;
        lifetime++;
        phase += 0.08;

        // Erratic butterfly movement
        fly['pos'].x += Math.sin(phase * 1.3) * 1.5;
        fly['pos'].y += Math.cos(phase) * 1;

        if (lifetime > maxLifetime || fly['pos'].x < -20 || fly['pos'].x > this.canvasWidth + 20) {
          k.destroy(fly);
        } else {
          requestAnimationFrame(moveButterfly);
        }
      };
      requestAnimationFrame(moveButterfly);
    };

    // Spawn butterfly every 4-8 seconds
    const butterflyInterval = setInterval(() => {
      if (!this.k) {
        clearInterval(butterflyInterval);
        return;
      }
      spawnButterfly();
    }, 4000 + Math.random() * 4000);

    // Initial butterfly
    setTimeout(() => spawnButterfly(), 1000);
  }

  startGame(): void {
    this.gameState.set('aiming');
    this.setupRound();
  }

  private setupRound(): void {
    const k = this.k;

    // Clear previous objects except background
    k.get('target').forEach((t: GameObj) => k.destroy(t));
    k.get('hotdog').forEach((h: GameObj) => k.destroy(h));
    k.get('slingshot').forEach((s: GameObj) => k.destroy(s));

    this.targets = [];
    this.roundTargetsHit = 0;

    // Create slingshot - weiter rechts für mehr Spannraum
    const slingshotScale = 0.5;
    const slingshotX = 140;
    const slingshotY = this.canvasHeight - 220;
    k.add([
      k.sprite('slingshot'),
      k.pos(slingshotX, slingshotY),
      k.scale(slingshotScale),
      k.z(1),
      'slingshot',
    ]);

    // Slingshot anchor
    this.slingshot.anchor = k.vec2(slingshotX + 62, slingshotY + 30);

    // Anzahl Ziele = Anzahl Hotdogs
    const numTargets = Math.min(4 + this.round(), 8);
    this.hotdogs.set(numTargets); // Genau so viele Hotdogs wie Mäuler
    const usedFaces: number[] = [];

    for (let i = 0; i < numTargets; i++) {
      // Ziele über den gesamten rechten Bereich verteilen (breiteres Spielfeld)
      const x = 500 + Math.random() * 550;
      const y = 50 + Math.random() * 400;
      // Kleinere Ziele = schwieriger
      const baseScale = 0.35 - (this.round() * 0.02); // Wird kleiner pro Runde
      const scale = Math.max(0.25, baseScale + Math.random() * 0.2);
      const points = 1; // 1 Treffer = 1 Punkt = 1 N$ am Ende

      let faceIndex: number;
      if (usedFaces.length < SPRITES.faces.length) {
        do {
          faceIndex = Math.floor(Math.random() * SPRITES.faces.length);
        } while (usedFaces.includes(faceIndex));
        usedFaces.push(faceIndex);
      } else {
        faceIndex = Math.floor(Math.random() * SPRITES.faces.length);
      }

      const faceSprite = SPRITES.faces[faceIndex];
      // HitRadius basierend auf durchschnittlicher Größe, mit Minimum für zuverlässige Treffer
      const avgSize = (faceSprite.w + faceSprite.h) / 2;
      const hitRadius = Math.max(25, avgSize * scale * 0.4);

      const target = k.add([
        k.sprite(`face${faceIndex}`),
        k.pos(x, y),
        k.scale(scale),
        k.anchor('center'),
        k.area({ shape: new k.Rect(k.vec2(0, 0), faceSprite.w, faceSprite.h) }),
        k.z(2),
        'target',
        { points, hitRadius, hit: false, faceIndex, moving: this.round() >= 2 },
      ]);

      // Bewegende Ziele ab Runde 2
      if (this.round() >= 2) {
        const speed = 30 + (this.round() * 15);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const moveRange = 80 + Math.random() * 60;
        const startY = y;

        target.onUpdate(() => {
          if ((target as unknown as { hit: boolean }).hit) return;
          const time = k.time();
          const newY = startY + Math.sin(time * (speed / 30) * direction) * moveRange;
          target['pos'].y = newY;
        });
      }

      this.targets.push({ obj: target, points, hit: false, faceIndex });
    }

    // Create hotdog
    this.createHotdog();
  }

  private readonly hotdogScale = 0.25;

  private createHotdog(): void {
    const k = this.k;

    // Remove old hotdog
    k.get('hotdog').forEach((h: GameObj) => k.destroy(h));

    // Create hotdog using sprite
    this.hotdog = k.add([
      k.sprite('hotdog'),
      k.pos(this.slingshot.anchor.x, this.slingshot.anchor.y),
      k.scale(this.hotdogScale),
      k.anchor('center'),
      k.area(),
      k.z(5),
      'hotdog',
    ]);

    this.isFlying = false;
    this.slingshot.pulling = false;
    this.slingshot.pullPos = null;
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (this.gameState() !== 'aiming' || this.isFlying) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.canvasWidth / rect.width);
    const y = (event.clientY - rect.top) * (this.canvasHeight / rect.height);

    // Check if clicking near the hotdog
    const dist = Math.sqrt(
      Math.pow(x - this.slingshot.anchor.x, 2) + Math.pow(y - this.slingshot.anchor.y, 2)
    );

    if (dist < 80) {
      this.slingshot.pulling = true;
      this.slingshot.pullPos = this.k.vec2(x, y);
      this.playLaunchSound();
    }
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.slingshot.pulling || this.isFlying) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.canvasWidth / rect.width);
    const y = (event.clientY - rect.top) * (this.canvasHeight / rect.height);

    // Limit pull distance
    const maxPull = 150;
    const dx = x - this.slingshot.anchor.x;
    const dy = y - this.slingshot.anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxPull) {
      const scale = maxPull / dist;
      this.slingshot.pullPos = this.k.vec2(
        this.slingshot.anchor.x + dx * scale,
        this.slingshot.anchor.y + dy * scale
      );
    } else {
      this.slingshot.pullPos = this.k.vec2(x, y);
    }

    // Update hotdog position
    if (this.hotdog && this.slingshot.pullPos) {
      this.updateHotdogPosition(this.slingshot.pullPos.x, this.slingshot.pullPos.y);
    }
  }

  @HostListener('mouseup')
  onMouseUp(): void {
    if (!this.slingshot.pulling || this.isFlying) return;

    this.launchHotdog();
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    if (this.gameState() !== 'aiming' || this.isFlying) return;

    const touch = event.touches[0];
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (this.canvasWidth / rect.width);
    const y = (touch.clientY - rect.top) * (this.canvasHeight / rect.height);

    const dist = Math.sqrt(
      Math.pow(x - this.slingshot.anchor.x, 2) + Math.pow(y - this.slingshot.anchor.y, 2)
    );

    if (dist < 100) {
      this.slingshot.pulling = true;
      this.slingshot.pullPos = this.k.vec2(x, y);
      this.playLaunchSound();
    }
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    if (!this.slingshot.pulling || this.isFlying) return;

    const touch = event.touches[0];
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (this.canvasWidth / rect.width);
    const y = (touch.clientY - rect.top) * (this.canvasHeight / rect.height);

    const maxPull = 150;
    const dx = x - this.slingshot.anchor.x;
    const dy = y - this.slingshot.anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxPull) {
      const scale = maxPull / dist;
      this.slingshot.pullPos = this.k.vec2(
        this.slingshot.anchor.x + dx * scale,
        this.slingshot.anchor.y + dy * scale
      );
    } else {
      this.slingshot.pullPos = this.k.vec2(x, y);
    }

    if (this.hotdog && this.slingshot.pullPos) {
      this.updateHotdogPosition(this.slingshot.pullPos.x, this.slingshot.pullPos.y);
    }
  }

  @HostListener('touchend')
  onTouchEnd(): void {
    if (!this.slingshot.pulling || this.isFlying) return;
    this.launchHotdog();
  }

  private updateHotdogPosition(x: number, y: number): void {
    const k = this.k;
    k.get('hotdog').forEach((h: GameObj) => k.destroy(h));

    // Create hotdog using sprite
    this.hotdog = k.add([
      k.sprite('hotdog'),
      k.pos(x, y),
      k.scale(this.hotdogScale),
      k.anchor('center'),
      k.area(),
      k.z(5),
      'hotdog',
    ]);

    // Draw slingshot band (rubber band)
    k.get('band').forEach((b: GameObj) => k.destroy(b));

    // Band attachment points - angepasst an Schleuder-Position
    const bandY = this.canvasHeight - 195;
    const leftX = 165;
    const rightX = 225;

    // Left band
    k.add([
      k.rect(
        Math.sqrt(Math.pow(x - leftX, 2) + Math.pow(y - bandY, 2)),
        5
      ),
      k.pos(leftX, bandY),
      k.rotate(Math.atan2(y - bandY, x - leftX) * (180 / Math.PI)),
      k.color(139, 90, 43),
      k.anchor('left'),
      k.z(4),
      'band',
    ]);

    // Right band
    k.add([
      k.rect(
        Math.sqrt(Math.pow(x - rightX, 2) + Math.pow(y - bandY, 2)),
        5
      ),
      k.pos(rightX, bandY),
      k.rotate(Math.atan2(y - bandY, x - rightX) * (180 / Math.PI)),
      k.color(139, 90, 43),
      k.anchor('left'),
      k.z(4),
      'band',
    ]);
  }

  private drawTrajectory(): void {
    const k = this.k;
    k.get('trajectory').forEach((t: GameObj) => k.destroy(t));

    if (!this.slingshot.pullPos) return;

    const dx = this.slingshot.anchor.x - this.slingshot.pullPos.x;
    const dy = this.slingshot.anchor.y - this.slingshot.pullPos.y;
    const power = Math.sqrt(dx * dx + dy * dy) * 0.15;
    const angle = Math.atan2(dy, dx);

    const vx = Math.cos(angle) * power;
    const vy = Math.sin(angle) * power;
    const gravity = 0.3;

    let x = this.slingshot.pullPos.x;
    let y = this.slingshot.pullPos.y;
    let velocityX = vx;
    let velocityY = vy;

    // Draw trajectory dots - weniger Punkte = schwieriger zu zielen
    for (let i = 0; i < 8; i++) {
      x += velocityX * 4;
      y += velocityY * 4;
      velocityY += gravity * 4;

      if (y > this.canvasHeight || x > this.canvasWidth || x < 0) break;

      k.add([
        k.circle(2),
        k.pos(x, y),
        k.color(255, 255, 255),
        k.opacity(0.25 - i * 0.03),
        k.z(3),
        'trajectory',
      ]);
    }
  }

  private launchHotdog(): void {
    if (!this.slingshot.pullPos) return;

    const k = this.k;
    this.slingshot.pulling = false;
    this.isFlying = true;
    this.gameState.set('flying');

    // Clear trajectory and bands
    k.get('trajectory').forEach((t: GameObj) => k.destroy(t));
    k.get('band').forEach((b: GameObj) => k.destroy(b));

    // Calculate velocity
    const dx = this.slingshot.anchor.x - this.slingshot.pullPos.x;
    const dy = this.slingshot.anchor.y - this.slingshot.pullPos.y;
    const power = Math.sqrt(dx * dx + dy * dy) * 0.15;
    const angle = Math.atan2(dy, dx);

    let vx = Math.cos(angle) * power;
    let vy = Math.sin(angle) * power;
    const gravity = 0.3;

    let x = this.slingshot.pullPos.x;
    let y = this.slingshot.pullPos.y;

    // Animation loop
    const animate = () => {
      if (!this.isFlying) return;

      x += vx;
      y += vy;
      vy += gravity;

      // Update hotdog position
      k.get('hotdog').forEach((h: GameObj) => k.destroy(h));

      // Calculate rotation based on velocity
      const rotation = Math.atan2(vy, vx) * (180 / Math.PI);

      // Flying hotdog using sprite
      this.hotdog = k.add([
        k.sprite('hotdog'),
        k.pos(x, y),
        k.scale(this.hotdogScale),
        k.rotate(rotation),
        k.anchor('center'),
        k.area(),
        k.z(5),
        'hotdog',
      ]);

      // Check collision with targets - nur EIN Treffer pro Hotdog
      // Early exit wenn bereits ein Hit verarbeitet wird
      if (!this.isFlying) return;

      let hitThisFrame = false;
      for (const target of this.targets) {
        if (target.hit || hitThisFrame) continue;

        const targetPos = target.obj['pos'] as Vec2;
        const dist = Math.sqrt(Math.pow(x - targetPos.x, 2) + Math.pow(y - targetPos.y, 2));

        // Use hitRadius from target for collision detection
        const hitRadius = (target.obj as unknown as { hitRadius: number }).hitRadius || 40;

        if (dist < hitRadius) {
          // SOFORT stoppen um doppelte Hits zu verhindern
          this.isFlying = false;
          target.hit = true;
          hitThisFrame = true; // Hotdog kann nur EINE Person treffen
          this.roundTargetsHit++;
          this.score.update(s => s + target.points);

          // Flash-Effekt am Treffer (gelber Stern-Burst)
          const flash = k.add([
            k.text('💥', { size: 80 }),
            k.pos(targetPos.x, targetPos.y),
            k.opacity(1),
            k.anchor('center'),
            k.scale(0.5),
            k.z(15),
          ]);
          let flashScale = 0.5;
          const animateFlash = () => {
            flashScale += 0.15;
            flash['scale'] = k.vec2(flashScale, flashScale);
            flash['opacity'] -= 0.08;
            if (flash['opacity'] > 0) {
              requestAnimationFrame(animateFlash);
            } else {
              k.destroy(flash);
            }
          };
          requestAnimationFrame(animateFlash);

          // Partikel-Effekt (Sterne/Funken)
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speed = 3 + Math.random() * 3;
            const particle = k.add([
              k.text('✨', { size: 20 }),
              k.pos(targetPos.x, targetPos.y),
              k.anchor('center'),
              k.opacity(1),
              k.z(14),
            ]);
            let px = targetPos.x;
            let py = targetPos.y;
            let pOpacity = 1;
            const animateParticle = () => {
              px += Math.cos(angle) * speed;
              py += Math.sin(angle) * speed;
              pOpacity -= 0.04;
              particle['pos'].x = px;
              particle['pos'].y = py;
              particle['opacity'] = pOpacity;
              if (pOpacity > 0) {
                requestAnimationFrame(animateParticle);
              } else {
                k.destroy(particle);
              }
            };
            requestAnimationFrame(animateParticle);
          }

          // Create "YUM!" text at target position
          const yum = k.add([
            k.text('YUM!', { size: 32 }),
            k.pos(targetPos.x, targetPos.y - 60),
            k.color(255, 200, 0),
            k.anchor('center'),
            k.z(10),
          ]);

          // Animate text up and fade
          let textY = targetPos.y - 60;
          const animateText = () => {
            textY -= 2;
            yum['pos'].y = textY;
            if (textY > targetPos.y - 120) {
              requestAnimationFrame(animateText);
            } else {
              k.destroy(yum);
            }
          };
          requestAnimationFrame(animateText);

          // Fade out während Sound abspielt
          const targetObj = target.obj;
          let opacity = 1;
          const fadeOut = () => {
            opacity -= 0.03;
            if (opacity > 0) {
              targetObj['opacity'] = opacity;
              requestAnimationFrame(fadeOut);
            }
          };
          requestAnimationFrame(fadeOut);

          // Sound abspielen, dann Target zerstören
          this.playHitSound().then(() => {
            k.destroy(targetObj);
          });

          // Hotdog verschwindet nach Treffer
          this.onHotdogLanded();
          return;
        }
      }

      // Check if out of bounds
      if (y > this.canvasHeight || x > this.canvasWidth + 50 || x < -50) {
        this.isFlying = false;
        this.onHotdogLanded();
        return;
      }

      requestAnimationFrame(animate);
    };

    animate();
  }

  private onHotdogLanded(): void {
    this.hotdogs.update(h => h - 1);

    // Alle Ziele getroffen?
    const allTargetsHit = this.targets.every(t => t.hit);

    if (allTargetsHit) {
      // Perfekt! Nächste Runde
      this.gameState.set('roundover');
    } else if (this.hotdogs() <= 0) {
      // Keine Hotdogs mehr und nicht alle getroffen = Game Over
      this.endGame();
    } else {
      // Noch Hotdogs übrig
      this.gameState.set('aiming');
      this.createHotdog();
    }
  }

  nextRound(): void {
    this.round.update(r => r + 1);
    // hotdogs wird in setupRound gesetzt (= numTargets)
    this.gameState.set('aiming');
    this.setupRound();
  }

  private endGame(): void {
    this.gameState.set('gameover');

    // Reward = Score (1 Treffer = 1 N$)
    const earnedReward = this.score();
    if (earnedReward > 0) {
      this.creditService.claimMinigameReward('HotdogKatapult', earnedReward).subscribe({
        next: () => {
          this.reward.set(earnedReward);
        },
        error: () => {
          this.reward.set(0);
        },
      });
    } else {
      this.reward.set(0);
    }
  }

  restartGame(): void {
    this.score.set(0);
    this.round.set(1);
    this.reward.set(0);
    this.gameState.set('aiming');
    this.setupRound(); // setzt hotdogs = numTargets
  }

  exitGame(): void {
    this.dialogRef.close({ score: this.score(), round: this.round() });
  }

  private playLaunchSound(): void {
    const audio = new Audio(this.launchSoundUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Ignore autoplay errors
    });
  }

  private playHitSound(): Promise<void> {
    return new Promise(resolve => {
      // Zufällig: nur Sound 1, nur Sound 2, oder beide
      const choice = Math.floor(Math.random() * 3); // 0, 1, oder 2

      let soundsToPlay: string[] = [];
      if (choice === 0) {
        soundsToPlay = [this.hitSoundUrls[0]];
      } else if (choice === 1) {
        soundsToPlay = [this.hitSoundUrls[1]];
      } else {
        // Beide Sounds in zufälliger Reihenfolge (immer unterschiedlich: Sound1+Sound2)
        soundsToPlay = Math.random() < 0.5
          ? [this.hitSoundUrls[0], this.hitSoundUrls[1]]
          : [this.hitSoundUrls[1], this.hitSoundUrls[0]];
      }

      // Sounds sequentiell abspielen
      const playNext = (index: number) => {
        if (index >= soundsToPlay.length) {
          resolve();
          return;
        }
        const audio = new Audio(soundsToPlay[index]);
        audio.volume = 0.6;
        audio.onended = () => playNext(index + 1);
        audio.onerror = () => playNext(index + 1);
        audio.play().catch(() => playNext(index + 1));
      };

      playNext(0);
    });
  }

  ngOnDestroy(): void {
    this.isFlying = false;
    if (this.k) {
      this.k.quit();
    }
  }
}
