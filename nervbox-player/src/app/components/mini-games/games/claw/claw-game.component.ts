import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { HttpErrorResponse } from '@angular/common/http';

import { ApiService } from '../../../../core/services/api.service';
import { CreditService } from '../../../../core/services/credit.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GameOverlayComponent } from '../../game-overlay.component';
import { GAME_INFO } from '../../game-info';
import { fitCanvas } from '../../game-shared';
import { ClawAudio } from './claw-audio';
import { CLAW_H, CLAW_W, ClawEngine } from './claw-engine';
import {
  ClawFinishResponse,
  ClawPhase,
  ClawStartResponse,
  ClawStateResponse,
  PAYOUT_ORDER,
  SAUSAGES,
  TryResult,
} from './claw.types';

@Component({
  selector: 'app-claw-game',
  standalone: true,
  imports: [MatIconModule, GameFrameComponent, GameOverlayComponent, GameExitConfirmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-game-frame
      #root
      [title]="info.title"
      [icon]="info.icon"
      [accent]="info.accent"
      [year]="info.year"
      [stats]="stats()"
      [pausable]="true"
      [pauseDisabled]="intro()"
      hint="Pfeile/WASD · Leertaste · ESC = Beenden?"
      (pauseToggle)="togglePause()"
      (closed)="exitConfirm.open()"
    >
      <div class="cl-stage">
        <canvas
          #gameCanvas
          class="cl-canvas"
          [class.cl-canvas--aim]="phase() === 'aim' || phase() === 'carry'"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="dragId = -1"
        ></canvas>

        @if (intro()) {
          <app-game-overlay
            tone="start"
            [kicker]="'Modul · ' + info.title"
            [year]="info.year"
            [icon]="info.icon"
            [title]="info.title"
          >
            <p class="nk-go__text">
              Fisch die Würste aus dem heißen Topf und wirf sie in die Ausgabe. Der Greifer ist
              etwas schwach &ndash; manche Wurst rutscht wieder raus.
            </p>
            <div class="nk-go__list cl-table">
              @for (t of payoutTable; track t.type) {
                <div class="nk-go__row cl-row">
                  <span class="cl-swatch" [style.background]="t.color"></span>
                  <span class="cl-name">{{ t.name }}</span>
                  <span class="cl-mult">{{ t.mult }}× Einsatz</span>
                </div>
              }
            </div>
            <div goActions>
              <button type="button" class="nk-key nk-key--accent nk-key--lg" (click)="begin()">
                <mat-icon>play_arrow</mat-icon>Los geht's
              </button>
            </div>
            <p class="nk-go__hint">
              Bewegen: Maus, Ziehen, Pfeile/WASD · Greifen/Loslassen: Klick, Leertaste, Taste
            </p>
          </app-game-overlay>
        }

        @if (paused()) {
          <app-game-overlay tone="pause" kicker="Pause" icon="pause" title="Pausiert">
            <p class="nk-go__text">Die Zeit für den Versuch steht still.</p>
            <div goActions>
              <button
                type="button"
                class="nk-key nk-key--accent nk-key--lg"
                (click)="togglePause()"
              >
                <mat-icon>play_arrow</mat-icon>Weiter
              </button>
              <button type="button" class="nk-key nk-key--ghost" (click)="exitGame()">
                Beenden
              </button>
            </div>
          </app-game-overlay>
        }
      </div>

      <div class="cl-bar">
        <div class="cl-stakes" role="group" aria-label="Einsatz">
          <span class="nk-label cl-lbl">EINSATZ</span>
          @for (s of stakes(); track s) {
            <button
              type="button"
              class="nk-key nk-key--sm cl-stake"
              [class.nk-key--accent]="stake() === s"
              [attr.aria-pressed]="stake() === s"
              [disabled]="phase() !== 'idle' || busy()"
              (click)="stake.set(s)"
            >
              {{ s }} N$
            </button>
          }
        </div>
        <span class="cl-msg" aria-live="polite">{{ message() }}</span>
        <button
          type="button"
          class="nk-key nk-key--accent nk-key--lg cl-go"
          [disabled]="!canAct()"
          (click)="act()"
        >
          <mat-icon>{{ actionIcon() }}</mat-icon>{{ actionLabel() }}
        </button>
      </div>

      <button
        gfKeys
        type="button"
        class="nk-key nk-key--sm"
        [attr.aria-label]="muted() ? 'Ton an' : 'Ton aus'"
        (click)="toggleMute()"
      >
        <mat-icon>{{ muted() ? 'volume_off' : 'volume_up' }}</mat-icon>Ton
      </button>

      <app-game-exit-confirm
        #exitConfirm
        [hint]="exitHint()"
        (opened)="onExitOpened()"
        (resumed)="onExitResumed()"
        (exit)="exitGame()"
      />
    </app-game-frame>
  `,
  styles: `
    .cl-stage {
      position: relative;
      display: flex;
      justify-content: center;
      background: #0a0807;
      border-radius: 5px;
      overflow: hidden;
    }
    .cl-canvas {
      display: block;
      touch-action: none;
      user-select: none;
      width: var(--fit-w, auto) !important;
      height: var(--fit-h, auto) !important;
    }
    .cl-canvas--aim {
      cursor: crosshair;
    }
    .cl-bar {
      display: flex;
      align-items: center;
      gap: 10px 14px;
      flex-wrap: wrap;
      padding: 10px 4px 2px;
    }
    .cl-stakes {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cl-lbl {
      margin-right: 2px;
    }
    .cl-stake {
      min-width: 58px;
    }
    .cl-msg {
      flex: 1;
      min-width: 120px;
      font: 600 14px/1.25 var(--nk-font-ui);
      letter-spacing: 0.4px;
      color: var(--nk-iv-2);
    }
    .cl-go {
      min-width: 190px;
    }
    .cl-table {
      max-width: 320px;
      margin: 4px auto 0;
    }
    .cl-row {
      justify-content: flex-start;
      padding: 4px 10px;
    }
    .cl-swatch {
      width: 26px;
      height: 10px;
      border-radius: 6px;
      box-shadow: 0 0 0 1.5px rgb(0 0 0 / 0.6);
    }
    .cl-name {
      flex: 1;
      text-align: left;
    }
    .cl-mult {
      font-family: var(--nk-font-mono);
      font-size: 12px;
      color: var(--nk-iv-2);
    }
    @media (max-width: 600px) {
      .cl-bar {
        gap: 8px;
      }
      .cl-msg {
        order: 3;
        flex-basis: 100%;
        font-size: 13px;
      }
      .cl-go {
        flex: 1;
        min-width: 0;
      }
      .cl-stake {
        min-width: 0;
        padding-inline: 8px;
      }
    }
  `,
})
export class ClawGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  @ViewChild('exitConfirm', { static: true }) exitConfirm!: GameExitConfirmComponent;

  readonly info = GAME_INFO.claw;
  private readonly api = inject(ApiService);
  private readonly creditService = inject(CreditService);
  private readonly dialogRef = inject(MatDialogRef<ClawGameComponent>);

  readonly payoutTable = PAYOUT_ORDER.map((t) => ({
    type: t,
    name: SAUSAGES[t].name,
    mult: SAUSAGES[t].mult.toLocaleString('de-DE'),
    color: SAUSAGES[t].base,
  }));

  readonly intro = signal(true);
  readonly paused = signal(false);
  readonly busy = signal(false);
  readonly phase = signal<ClawPhase>('idle');
  readonly stakes = signal<number[]>([5, 10, 20]);
  readonly stake = signal(10);
  readonly tries = signal(0);
  readonly net = signal(0);
  readonly muted = signal(false);
  readonly message = signal('Einsatz wählen und Münze einwerfen.');

  readonly stats = computed<GameStat[]>(() => [
    { label: 'GUTHABEN N$', value: this.creditService.creditsFormatted() },
    { label: 'VERSUCHE', value: this.tries() },
    {
      label: 'GEWINN',
      value: (this.net() > 0 ? '+' : '') + this.net(),
      tone: this.net() < 0 ? 'neg' : undefined,
    },
    { label: 'EINSATZ', value: this.stake() },
  ]);

  readonly canAct = computed(() => {
    if (this.intro() || this.paused()) return false;
    const p = this.phase();
    if (p === 'idle') return !this.busy() && this.creditService.credits() >= this.stake();
    return p === 'aim' || p === 'carry';
  });

  readonly actionLabel = computed(() => {
    switch (this.phase()) {
      case 'idle':
        return `${this.stake()} N$ einwerfen`;
      case 'aim':
        return 'Greifen';
      case 'carry':
        return 'Loslassen';
      default:
        return 'Greifer läuft …';
    }
  });

  readonly actionIcon = computed(() => {
    switch (this.phase()) {
      case 'idle':
        return 'toll';
      case 'aim':
        return 'download';
      case 'carry':
        return 'back_hand';
      default:
        return 'hourglass_top';
    }
  });

  private readonly audio = new ClawAudio();
  private engine!: ClawEngine;
  private raf = 0;
  private lastT = 0;
  private stopFit?: () => void;
  private exitOpen = false;
  private tryId: string | null = null;
  private readonly keys = new Set<string>();
  dragId = -1;
  private dragStart = { x: 0, y: 0, t: 0, moved: 0, lx: 0, ly: 0 };

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.engine = new ClawEngine(canvas, this.audio);
    this.engine.onPhase = (p) => this.onPhase(p);
    this.engine.onTryEnd = (r) => this.onTryEnd(r);
    this.stopFit = fitCanvas(() => this.canvasRef?.nativeElement, CLAW_W, CLAW_H, this.frame.root);

    this.api.get<ClawStateResponse>('/casino/claw/state').subscribe({
      next: (st) => {
        this.engine.syncPot(st.pot, false);
        if (st.stakes?.length) {
          this.stakes.set(st.stakes);
          if (!st.stakes.includes(this.stake())) this.stake.set(st.stakes[0]);
        }
      },
      error: () => {
        // Ohne Server trotzdem einen huebschen Topf zeigen
        this.engine.syncPot(
          ['wiener', 'bratwurst', 'wiener', 'kaese', 'gurke', 'wiener', 'bratwurst', 'wiener'].map(
            (type, i) => ({ id: -1 - i, type: type as 'wiener' }),
          ),
          false,
        );
        this.message.set('Automat offline – keine Verbindung zum Server.');
      },
    });
    this.loop(performance.now());
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.stopFit?.();
    this.audio.destroy();
  }

  private loop = (t: number): void => {
    const dt = this.lastT ? (t - this.lastT) / 1000 : 0;
    this.lastT = t;
    if (!this.paused() && !this.exitOpen) {
      this.applyKeys();
      this.engine.update(dt);
    }
    this.engine.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  // ------------------------------------------------------------------ Ablauf

  begin(): void {
    this.audio.unlock();
    this.intro.set(false);
  }

  act(): void {
    if (!this.canAct()) return;
    this.audio.unlock();
    if (this.phase() === 'idle') this.startTry();
    else this.engine.action();
  }

  private startTry(): void {
    const stake = this.stake();
    if (this.creditService.credits() < stake) {
      this.message.set('Nicht genug N$ für diesen Einsatz.');
      return;
    }
    this.busy.set(true);
    this.message.set('Münze rollt …');
    this.api.post<ClawStartResponse>('/casino/claw/start', { stake }).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.tryId = res.tryId;
        this.creditService.credits.set(res.newBalance);
        this.tries.update((n) => n + 1);
        this.net.update((n) => n - res.stake);
        this.engine.syncPot(res.pot, true);
        this.engine.beginTry({ grip: res.grip, seed: res.seed, timeLimit: res.timeLimit });
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        const msg = err.error?.error ?? 'Start fehlgeschlagen';
        this.message.set(msg);
        this.engine.showError(msg);
      },
    });
  }

  private onPhase(p: ClawPhase): void {
    this.phase.set(p);
    switch (p) {
      case 'aim':
        this.message.set('Greifer über eine Wurst fahren und greifen!');
        break;
      case 'drop':
      case 'grab':
        this.message.set('Runter in den Topf …');
        break;
      case 'lift':
        this.message.set('Hoch damit – hält sie?');
        break;
      case 'carry':
        this.message.set('Ab zur Ausgabe! Nicht zu wild schwenken.');
        break;
    }
  }

  private onTryEnd(r: TryResult): void {
    const tryId = this.tryId;
    this.tryId = null;
    if (!tryId) return;
    const delivered = r.outcome === 'delivered' && r.sausageId !== undefined;
    if (!delivered) {
      this.message.set(
        r.outcome === 'empty'
          ? 'Leer gegriffen. Nächster Versuch?'
          : r.outcome === 'slipped'
            ? 'Abgerutscht! Der Greifer ist eben etwas schwach.'
            : 'Daneben! Die Ausgabe ist rechts.',
      );
    } else {
      this.message.set('Treffer! Der Automat rechnet …');
    }
    this.busy.set(true);
    this.api
      .post<ClawFinishResponse>('/casino/claw/finish', {
        tryId,
        sausageId: delivered ? r.sausageId : null,
        type: delivered ? r.type : null,
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.creditService.credits.set(res.newBalance);
          if (delivered) {
            this.engine.showPayout(res.payout, res.type, res.accepted);
            if (res.accepted) {
              this.net.update((n) => n + res.payout);
              this.message.set(`${res.name}: +${res.payout} N$!`);
            } else {
              this.message.set(`Nicht gewertet: ${res.reason ?? 'unbekannt'}`);
            }
          }
          this.engine.syncPot(res.pot, true);
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          const msg = err.error?.error ?? 'Abrechnung fehlgeschlagen';
          this.message.set(msg);
          this.engine.showError(msg);
        },
      });
  }

  // ------------------------------------------------------------------ Eingabe

  private toLogical(e: PointerEvent): { x: number; y: number; sx: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const sx = CLAW_W / Math.max(1, rect.width);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sx, sx };
  }

  onPointerDown(e: PointerEvent): void {
    if (this.intro() || this.paused()) return;
    this.audio.unlock();
    this.dragId = e.pointerId;
    this.dragStart = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      moved: 0,
      lx: e.clientX,
      ly: e.clientY,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (e.pointerType === 'mouse') {
      const p = this.toLogical(e);
      this.engine.pointTo(p.x, p.y);
    }
  }

  onPointerMove(e: PointerEvent): void {
    if (this.intro() || this.paused()) return;
    if (e.pointerType === 'mouse') {
      const p = this.toLogical(e);
      this.engine.pointTo(p.x, p.y);
      if (this.dragId === e.pointerId) {
        this.dragStart.moved += Math.hypot(
          e.clientX - this.dragStart.lx,
          e.clientY - this.dragStart.ly,
        );
        this.dragStart.lx = e.clientX;
        this.dragStart.ly = e.clientY;
      }
      return;
    }
    if (this.dragId !== e.pointerId) return;
    const { sx } = this.toLogical(e);
    const dx = e.clientX - this.dragStart.lx;
    const dy = e.clientY - this.dragStart.ly;
    this.dragStart.moved += Math.hypot(dx, dy);
    this.dragStart.lx = e.clientX;
    this.dragStart.ly = e.clientY;
    this.engine.nudge(dx * sx, dy * sx);
  }

  onPointerUp(e: PointerEvent): void {
    if (this.dragId !== e.pointerId) return;
    this.dragId = -1;
    const tap = this.dragStart.moved < 10 && performance.now() - this.dragStart.t < 400;
    if (tap && (this.phase() === 'aim' || this.phase() === 'carry')) this.act();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' || this.exitOpen) return;
    const k = e.key.toLowerCase();
    if (k === 'p') {
      if (!this.intro()) this.togglePause();
      return;
    }
    if (k === ' ' || k === 'enter') {
      // Taste auf einem fokussierten Button nicht doppelt ausloesen
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      e.preventDefault();
      if (e.repeat) return;
      if (this.intro()) this.begin();
      else this.act();
      return;
    }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
      e.preventDefault();
      this.keys.add(k);
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }

  @HostListener('window:blur')
  onBlur(): void {
    this.keys.clear();
  }

  private applyKeys(): void {
    const k = this.keys;
    const x =
      (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const z = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
    this.engine.setKeys(x, z);
  }

  // ------------------------------------------------------------------ Pause / Ende

  togglePause(): void {
    if (this.intro()) return;
    const p = !this.paused();
    this.paused.set(p);
    this.keys.clear();
    if (p) this.audio.suspend();
    else this.audio.resume();
  }

  toggleMute(): void {
    this.muted.set(!this.muted());
    this.audio.setMuted(this.muted());
  }

  onExitOpened(): void {
    this.exitOpen = true;
    this.keys.clear();
    this.audio.suspend();
  }

  onExitResumed(): void {
    this.exitOpen = false;
    if (!this.paused()) this.audio.resume();
  }

  exitHint(): string {
    const p = this.phase();
    if (p === 'idle') return 'Es läuft kein Versuch, es geht nichts verloren.';
    return 'Der Einsatz für diesen Versuch ist schon bezahlt. Beendest du jetzt, verfällt der Versuch.';
  }

  exitGame(): void {
    this.dialogRef.close();
  }
}
