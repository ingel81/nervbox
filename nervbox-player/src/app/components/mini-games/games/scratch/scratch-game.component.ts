import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
import { GAME_INFO } from '../../game-info';
import { fitCanvas } from '../../game-shared';
import { ScratchAudio } from './scratch-audio';
import { drawFoil, drawTicket, flakeColor, foilRegions } from './scratch-render';
import {
  ADMIN_LINES,
  BONUS,
  BREAK_EVEN_LINES,
  GRID,
  H,
  LOSS_LINES,
  Rect,
  ScratchBuyResponse,
  ScratchTicketInfo,
  THEMES,
  TicketKey,
  W,
  WIN_LINES,
  pick,
} from './scratch.types';

type Phase = 'idle' | 'buying' | 'scratching' | 'revealing' | 'done';

interface Slip {
  tone: 'win' | 'lose' | 'admin' | 'even' | 'info' | 'err';
  title: string;
  text: string;
}

interface HistItem {
  serial: string;
  name: string;
  net: number;
  tone: Slip['tone'];
}

interface Particle {
  kind: 'flake' | 'coin' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

/** Messbereich der Folie: Stichproben-Indizes im Alpha-Kanal je Feld */
interface Region {
  idx: number[];
  revealed: boolean;
}

const BRUSH = 22;
const REVEAL_AT = 0.7;
const CELL_AT = 0.5;
const SOUND_KEY = 'nervbox-scratch-muted';

@Component({
  selector: 'app-scratch-game',
  standalone: true,
  imports: [MatIconModule, GameExitConfirmComponent, GameFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.sc-flash]': 'lcdFlash()' },
  template: `
    <app-game-frame
      #root
      [title]="info.title"
      [icon]="info.icon"
      [accent]="info.accent"
      [year]="info.year"
      [stats]="stats()"
      hint="ESC = Beenden?"
      (closed)="exitGame()"
    >
      <div class="sc">
        <div class="sc-stage">
          <div class="sc-ticket" [class.sc-ticket--shake]="shake()">
            <canvas #base class="sc-base"></canvas>
            <canvas
              #foil
              class="sc-foil"
              [class.sc-foil--gone]="phase() === 'revealing'"
              [class.sc-foil--live]="phase() === 'scratching'"
              aria-label="Rubbelfeld"
              (pointerdown)="onDown($event)"
              (pointermove)="onMove($event)"
              (pointerup)="onUp($event)"
              (pointercancel)="onUp($event)"
              (lostpointercapture)="onUp($event)"
              (contextmenu)="$event.preventDefault()"
            ></canvas>
            <canvas #fx class="sc-fx" aria-hidden="true"></canvas>
            @if (phase() === 'idle' || phase() === 'buying') {
              <div class="sc-muster" aria-hidden="true">
                <span>MUSTER</span>
                <small>Los kaufen, dann rubbeln</small>
              </div>
            }
            @if (phase() === 'done' && ticket()?.confiscated) {
              <div class="sc-stamp" aria-hidden="true">
                <span>BESCHLAGNAHMT</span>
                <small>gez. der Admin</small>
              </div>
            }
            @if (phase() === 'done' && (ticket()?.payout ?? 0) > 0) {
              <div class="sc-big" aria-hidden="true">+{{ ticket()!.payout }} N$</div>
            }
          </div>
        </div>

        <aside class="sc-panel">
          <div class="sc-picks" role="radiogroup" aria-label="Los wählen">
            @for (t of tickets(); track t.key) {
              <button
                type="button"
                role="radio"
                class="sc-pick"
                [class.sc-pick--on]="selected() === t.key"
                [attr.aria-checked]="selected() === t.key"
                [style.--sc-c]="theme(t.key).color"
                [disabled]="busy()"
                (click)="select(t.key)"
              >
                <mat-icon aria-hidden="true">{{ theme(t.key).icon }}</mat-icon>
                <span class="sc-pick__name">{{ t.name }}</span>
                <span class="sc-pick__short">{{ theme(t.key).short }}</span>
                <span class="sc-pick__price">{{ t.price }} N$</span>
                <span class="sc-pick__top">bis {{ topPrize(t) }} N$</span>
              </button>
            } @empty {
              <span class="sc-loading">{{
                loadError() || 'Zentralbank öffnet den Schalter …'
              }}</span>
            }
          </div>

          <div class="sc-slip" [class]="'sc-slip sc-slip--' + slip().tone" aria-live="polite">
            <strong>{{ slip().title }}</strong>
            <span>{{ slip().text }}</span>
          </div>

          <div class="sc-actions">
            @if (phase() === 'scratching' || phase() === 'revealing') {
              <button
                type="button"
                class="nk-key nk-key--accent nk-key--lg sc-main"
                [disabled]="phase() !== 'scratching' || autoRunning()"
                (click)="autoReveal()"
              >
                <mat-icon>auto_fix_high</mat-icon>Alles aufrubbeln
              </button>
            } @else {
              <button
                type="button"
                class="nk-key nk-key--accent nk-key--lg sc-main"
                [disabled]="!canBuy()"
                (click)="buy()"
              >
                <mat-icon>confirmation_number</mat-icon>
                {{ phase() === 'buying' ? 'Druckt …' : buyLabel() }}
              </button>
            }
            <div class="sc-meter" [attr.aria-label]="'Freigerubbelt ' + progress() + ' Prozent'">
              <span class="sc-meter__bar" [style.width.%]="progress()"></span>
              <span class="sc-meter__txt"
                ><span class="sc-meter__lbl">FREIGERUBBELT </span>{{ progress() }} %</span
              >
            </div>
          </div>

          @if (history().length) {
            <div class="sc-hist">
              <span class="sc-hist__head">KONTOAUSZUG</span>
              @for (h of history(); track h.serial) {
                <span class="sc-hist__row" [class]="'sc-hist__row sc-hist__row--' + h.tone">
                  <span>{{ h.name }}</span>
                  <b>{{ h.net > 0 ? '+' : '' }}{{ h.net }} N$</b>
                </span>
              }
            </div>
          }
        </aside>
      </div>

      <button
        gfKeys
        type="button"
        class="nk-key nk-key--sm"
        [attr.aria-pressed]="!muted()"
        (click)="toggleSound()"
      >
        <mat-icon>{{ muted() ? 'volume_off' : 'volume_up' }}</mat-icon>Ton
      </button>

      <app-game-exit-confirm [hint]="exitHint()" (exit)="exitGame()" />
    </app-game-frame>
  `,
  styles: `
    :host {
      display: block;
    }
    :host(.sc-flash) ::ng-deep .nk-gf__glass {
      animation: sc-lcd 0.18s steps(2, jump-none) 8;
    }
    @keyframes sc-lcd {
      0% {
        filter: brightness(1);
      }
      100% {
        filter: brightness(1.9) saturate(1.4);
      }
    }

    .sc {
      display: flex;
      gap: 16px;
      padding: 14px;
      border-radius: 5px;
      background:
        radial-gradient(ellipse at 30% 0%, rgb(255 226 176 / 0.1), transparent 60%),
        linear-gradient(180deg, #1d1a15 0%, #12100d 100%);
    }
    .sc-stage {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    .sc-ticket {
      position: relative;
      display: inline-block;
      line-height: 0;
      filter: drop-shadow(0 10px 18px rgb(0 0 0 / 0.65));
    }
    .sc-ticket--shake {
      animation: sc-shake 0.4s ease-in-out;
    }
    @keyframes sc-shake {
      0%,
      100% {
        transform: translateX(0);
      }
      20%,
      60% {
        transform: translateX(-6px) rotate(-0.6deg);
      }
      40%,
      80% {
        transform: translateX(6px) rotate(0.6deg);
      }
    }
    .sc-base {
      display: block;
      width: var(--fit-w, 600px) !important;
      height: var(--fit-h, 900px) !important;
    }
    .sc-foil,
    .sc-fx {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .sc-foil {
      touch-action: none;
      transition: opacity 0.55s ease;
    }
    .sc-foil--live {
      cursor:
        url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="11" fill="%23f2d24b" stroke="%237a5200" stroke-width="2"/><text x="16" y="20" font-size="10" text-anchor="middle" font-family="Arial" font-weight="bold" fill="%237a5200">N$</text></svg>')
          16 16,
        crosshair;
    }
    .sc-foil--gone {
      opacity: 0;
    }
    .sc-fx {
      pointer-events: none;
    }

    .sc-muster {
      position: absolute;
      left: 7%;
      right: 7%;
      top: 34%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      line-height: 1;
      pointer-events: none;
      transform: rotate(-12deg);
      color: rgb(150 30 24 / 0.82);
      border: 4px double rgb(150 30 24 / 0.7);
      border-radius: 8px;
      padding: 12px 8px;
      background: rgb(255 248 230 / 0.35);
      font-family: var(--nk-font-ui);
    }
    .sc-muster span {
      font-size: clamp(34px, 9vmin, 76px);
      font-weight: 800;
      letter-spacing: 0.3em;
      margin-right: -0.3em;
    }
    .sc-muster small {
      font-size: clamp(12px, 2.4vmin, 18px);
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .sc-stamp {
      position: absolute;
      left: 4%;
      right: 4%;
      top: 36%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      line-height: 1;
      pointer-events: none;
      color: rgb(196 30 22 / 0.9);
      border: 5px solid rgb(196 30 22 / 0.85);
      border-radius: 10px;
      padding: 10px 6px;
      font-family: var(--nk-font-ui);
      mix-blend-mode: multiply;
      animation: sc-stamp 0.32s cubic-bezier(0.2, 1.6, 0.4, 1) both;
      transform: rotate(-14deg);
    }
    .sc-stamp span {
      font-size: clamp(26px, 7vmin, 58px);
      font-weight: 800;
      letter-spacing: 0.12em;
    }
    .sc-stamp small {
      font: 700 clamp(11px, 2vmin, 15px) var(--nk-font-mono);
      letter-spacing: 2px;
    }
    @keyframes sc-stamp {
      from {
        opacity: 0;
        transform: rotate(-14deg) scale(2.4);
      }
      to {
        opacity: 1;
        transform: rotate(-14deg) scale(1);
      }
    }
    .sc-big {
      position: absolute;
      left: 50%;
      top: 45%;
      padding: 0.12em 0.4em 0.05em;
      border-radius: 10px;
      white-space: nowrap;
      line-height: 1;
      pointer-events: none;
      font: 400 clamp(44px, 10vmin, 92px) var(--nk-font-lcd);
      color: #ffe27a;
      background: rgb(18 14 8 / 0.82);
      box-shadow:
        0 0 0 2px rgb(255 214 74 / 0.7),
        0 0 30px rgb(255 184 0 / 0.55);
      text-shadow:
        0 0 6px #ffb800,
        0 0 18px rgb(255 184 0 / 0.8);
      transform: translate(-50%, -50%);
      animation: sc-pop 3.2s cubic-bezier(0.2, 1.5, 0.4, 1) both;
    }
    @keyframes sc-pop {
      0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.3);
      }
      14%,
      78% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.9);
      }
    }

    .sc-panel {
      flex: 0 0 296px;
      width: 296px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
    }
    .sc-picks {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sc-loading {
      font: 500 13px/1.3 var(--nk-font-mono);
      color: var(--nk-iv-3);
    }
    .sc-pick {
      --sc-c: #5a5346;
      position: relative;
      display: grid;
      grid-template-columns: 34px 1fr auto;
      grid-template-areas: 'ico name price' 'ico top price';
      align-items: center;
      gap: 0 10px;
      padding: 9px 12px 9px 10px;
      border: 0;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      color: #fff6e2;
      font-family: var(--nk-font-ui);
      background:
        repeating-linear-gradient(90deg, transparent 0 7px, rgb(0 0 0 / 0.12) 7px 8px) right / 10px
          100% no-repeat,
        linear-gradient(160deg, color-mix(in srgb, var(--sc-c) 82%, #fff 18%), var(--sc-c));
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.25),
        inset 0 -2px 0 rgb(0 0 0 / 0.3),
        0 2px 5px rgb(0 0 0 / 0.6);
      opacity: 0.72;
      transition:
        opacity 0.15s,
        transform 0.15s,
        box-shadow 0.15s;
    }
    .sc-pick:hover:not(:disabled) {
      opacity: 0.92;
    }
    .sc-pick--on {
      opacity: 1;
      transform: translateX(-4px);
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.3),
        inset 0 -2px 0 rgb(0 0 0 / 0.3),
        0 0 0 2px var(--nk-lamp),
        0 0 16px rgb(var(--nk-lamp-rgb) / 0.45);
    }
    .sc-pick:disabled {
      cursor: default;
    }
    .sc-pick .mat-icon {
      grid-area: ico;
      width: 30px;
      height: 30px;
      font-size: 30px;
      filter: drop-shadow(0 1px 0 rgb(0 0 0 / 0.4));
    }
    .sc-pick__name {
      grid-area: name;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.5px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sc-pick__short {
      display: none;
    }
    .sc-pick__top {
      grid-area: top;
      font: 500 12px/1.3 var(--nk-font-mono);
      opacity: 0.85;
    }
    .sc-pick__price {
      grid-area: price;
      font: 400 30px/1 var(--nk-font-lcd);
      padding: 2px 8px;
      border-radius: 4px;
      color: var(--nk-lcd-ink);
      background: var(--nk-face-lcd);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.5);
    }

    .sc-slip {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 88px;
      padding: 10px 12px 12px;
      border-radius: 3px;
      color: var(--nk-paper-ink);
      font-family: var(--nk-font-paper);
      background:
        linear-gradient(transparent 0 0) top / 100% 6px no-repeat,
        repeating-linear-gradient(0deg, rgb(31 27 22 / 0.05) 0 1px, transparent 1px 22px),
        var(--nk-paper);
      box-shadow:
        inset 0 6px 6px -6px rgb(0 0 0 / 0.5),
        0 2px 6px rgb(0 0 0 / 0.6);
      mask:
        conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / 12px 51%
          repeat-x,
        linear-gradient(#000 0 0) top / 100% calc(100% - 5px) no-repeat;
    }
    .sc-slip strong {
      font-size: 17px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .sc-slip span {
      font-size: 14px;
      line-height: 1.3;
    }
    .sc-slip--win strong,
    .sc-slip--even strong {
      color: #19632f;
    }
    .sc-slip--admin strong,
    .sc-slip--err strong {
      color: #a3221a;
    }
    .sc-slip--lose strong {
      color: #6a4a2a;
    }

    .sc-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .sc-main {
      width: 100%;
      justify-content: center;
    }
    .sc-meter {
      position: relative;
      height: 22px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--nk-face-lcd);
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.55),
        inset 0 0 8px rgb(46 62 14 / 0.45);
    }
    .sc-meter__bar {
      position: absolute;
      inset: 0 auto 0 0;
      background: repeating-linear-gradient(
        90deg,
        rgb(var(--nk-lcd-ink-rgb) / 0.22) 0 6px,
        transparent 6px 8px
      );
      transition: width 0.15s linear;
    }
    .sc-meter__txt {
      position: relative;
      display: block;
      text-align: center;
      font: 400 19px/22px var(--nk-font-lcd);
      letter-spacing: 1px;
      color: var(--nk-lcd-ink);
    }

    .sc-hist {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border-radius: 4px;
      background: rgb(0 0 0 / 0.35);
      box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.8);
      font: 500 12px/1.5 var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .sc-hist__head {
      font-weight: 600;
      letter-spacing: 2px;
      color: var(--nk-iv-3);
    }
    .sc-hist__row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .sc-hist__row span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sc-hist__row--win b,
    .sc-hist__row--even b {
      color: var(--nk-own);
    }
    .sc-hist__row--lose b,
    .sc-hist__row--admin b {
      color: var(--nk-danger-text);
    }

    /* Hochformat / schmal: Los oben, Bedienung darunter */
    @media (max-width: 720px) and (min-height: 501px) {
      .sc {
        flex-direction: column;
        gap: 10px;
        padding: 8px;
      }
      .sc-panel {
        flex: 0 0 auto;
        width: auto;
        gap: 8px;
      }
      .sc-picks {
        flex-direction: row;
        gap: 6px;
        min-height: 62px;
      }
      .sc-pick {
        flex: 1 1 0;
        min-width: 0;
        grid-template-columns: 1fr;
        grid-template-areas: 'name' 'price';
        gap: 3px;
        padding: 6px 6px 7px;
        text-align: center;
        justify-items: center;
      }
      .sc-pick--on {
        transform: translateY(-2px);
      }
      .sc-pick .mat-icon,
      .sc-pick__top,
      .sc-pick__name,
      .sc-meter__lbl {
        display: none;
      }
      .sc-pick__short {
        display: block;
        grid-area: name;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 1.5px;
      }
      .sc-pick__price {
        font-size: 22px;
      }
      /* feste Hoehen: wechselnder Text darf das Los nicht neu skalieren */
      .sc-slip {
        height: 90px;
        min-height: 0;
        overflow: hidden;
        padding: 6px 10px 9px;
      }
      .sc-slip strong {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 15px;
      }
      .sc-slip span {
        font-size: 12.5px;
      }
      .sc-actions {
        flex-direction: row;
        align-items: center;
      }
      .sc-main {
        flex: 1 1 auto;
        width: auto;
      }
      .sc-meter {
        flex: 0 0 34%;
      }
      .sc-meter__txt {
        font-size: 16px;
      }
      .sc-hist {
        display: none;
      }
    }
    /* Querformat niedrig: schmalere Spalte */
    @media (max-height: 500px) {
      .sc {
        padding: 8px;
        gap: 10px;
      }
      .sc-panel {
        flex-basis: 230px;
        width: 230px;
        gap: 8px;
      }
      .sc-pick {
        padding: 5px 10px 5px 8px;
      }
      .sc-pick .mat-icon,
      .sc-pick__top,
      .sc-hist {
        display: none;
      }
      .sc-pick {
        grid-template-columns: 1fr auto;
        grid-template-areas: 'name price';
      }
      .sc-slip {
        min-height: 0;
      }
    }
  `,
})
export class ScratchGameComponent implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<ScratchGameComponent>);
  private readonly api = inject(ApiService);
  readonly creditService = inject(CreditService);
  readonly info = GAME_INFO.scratch;

  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  @ViewChild('base', { static: true }) baseRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('foil', { static: true }) foilRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fx', { static: true }) fxRef!: ElementRef<HTMLCanvasElement>;

  readonly tickets = signal<ScratchTicketInfo[]>([]);
  readonly loadError = signal('');
  readonly selected = signal<TicketKey>('holz');
  readonly phase = signal<Phase>('idle');
  readonly ticket = signal<ScratchBuyResponse | null>(null);
  readonly progress = signal(0);
  readonly autoRunning = signal(false);
  readonly muted = signal(false);
  readonly lcdFlash = signal(false);
  readonly shake = signal(false);
  readonly history = signal<HistItem[]>([]);
  readonly slip = signal<Slip>({
    tone: 'info',
    title: 'Willkommen am Schalter',
    text: 'Los wählen, kaufen, rubbeln. Gewinne werden sofort gutgeschrieben.',
  });

  // Sitzungsbilanz
  readonly bought = signal(0);
  readonly spent = signal(0);
  readonly won = signal(0);

  readonly stats = computed<GameStat[]>(() => {
    const bal = this.won() - this.spent();
    return [
      { label: 'LOSE', value: this.bought() },
      { label: 'GEWINN N$', value: this.won() },
      { label: 'BILANZ N$', value: (bal > 0 ? '+' : '') + bal, tone: bal < 0 ? 'neg' : undefined },
    ];
  });

  readonly selectedInfo = computed(
    () => this.tickets().find((t) => t.key === this.selected()) ?? null,
  );
  readonly busy = computed(() => {
    const p = this.phase();
    return p === 'buying' || p === 'scratching' || p === 'revealing';
  });
  readonly canBuy = computed(() => {
    const t = this.selectedInfo();
    return !!t && !this.busy() && this.creditService.credits() >= t.price;
  });
  readonly buyLabel = computed(() => {
    const t = this.selectedInfo();
    if (!t) return 'Los kaufen';
    if (this.creditService.credits() < t.price) return `Zu wenig N$ (${t.price})`;
    return `${this.phase() === 'done' ? 'Nächstes Los' : 'Los kaufen'} · ${t.price} N$`;
  });

  private baseCtx!: CanvasRenderingContext2D;
  private foilCtx!: CanvasRenderingContext2D;
  private fxCtx!: CanvasRenderingContext2D;
  private k = 1;
  private stopFit?: () => void;
  private raf = 0;
  private destroyed = false;
  private readonly audio = new ScratchAudio();
  private particles: Particle[] = [];
  private regions: Region[] = [];
  private totalSamples = 0;
  private pointerId: number | null = null;
  private last: { x: number; y: number; t: number } | null = null;
  private lastMeasure = 0;
  private highlight = false;
  private pulseUntil = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    try {
      this.muted.set(localStorage.getItem(SOUND_KEY) === '1');
    } catch {
      /* egal */
    }
    this.audio.setMuted(this.muted());
  }

  theme(key: TicketKey) {
    return THEMES[key];
  }

  topPrize(t: ScratchTicketInfo): string {
    const max = Math.max(...t.symbols.map((s) => s.prize)) * (t.bonus ? Math.max(...t.bonus) : 1);
    return max.toLocaleString('de-DE');
  }

  ngAfterViewInit(): void {
    this.k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const setup = (c: HTMLCanvasElement, read = false): CanvasRenderingContext2D => {
      c.width = Math.round(W * this.k);
      c.height = Math.round(H * this.k);
      const ctx = c.getContext('2d', read ? { willReadFrequently: true } : undefined)!;
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      return ctx;
    };
    this.baseCtx = setup(this.baseRef.nativeElement);
    this.foilCtx = setup(this.foilRef.nativeElement, true);
    this.fxCtx = setup(this.fxRef.nativeElement);

    const root = this.frame.root;
    const sc = (): HTMLElement | null => root.querySelector<HTMLElement>('.sc');
    this.stopFit = fitCanvas(() => this.baseRef.nativeElement, W, H, root, {
      widthEl: sc,
      reserveW: () => {
        const el = sc();
        if (!el || getComputedStyle(el).flexDirection !== 'row') return 0;
        const panel = el.querySelector<HTMLElement>('.sc-panel');
        return (panel?.offsetWidth ?? 0) + 16;
      },
      // Im Zeilen-Layout steht die Bedienspalte neben dem Los: ihre Hoehe zaehlt nicht
      excludeH: () => {
        const el = sc();
        if (!el || getComputedStyle(el).flexDirection !== 'row') return 0;
        return el.querySelector<HTMLElement>('.sc-panel')?.offsetHeight ?? 0;
      },
    });

    this.redrawAll();
    this.loop();

    // Canvas-Schriften nachladen und neu zeichnen
    const fonts = document.fonts;
    if (fonts?.load) {
      void Promise.all([
        fonts.load('800 50px "Barlow Condensed"'),
        fonts.load('600 13px "IBM Plex Mono"'),
        fonts.load('700 13px Michroma'),
      ])
        .catch(() => undefined)
        .then(() => {
          if (!this.destroyed && this.phase() !== 'scratching') this.redrawAll();
          else if (!this.destroyed) this.drawBase();
        });
    }

    this.api.get<ScratchTicketInfo[]>('/casino/scratch/tickets').subscribe({
      next: (list) => {
        this.tickets.set(list);
        this.redrawAll();
      },
      error: () => this.loadError.set('Die Zentralbank hat gerade geschlossen. Später nochmal.'),
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stopFit?.();
    this.timers.forEach(clearTimeout);
    this.audio.dispose();
  }

  // ------------------------------------------------------------------ Auswahl / Kauf

  select(key: TicketKey): void {
    if (this.busy() || key === this.selected()) return;
    this.selected.set(key);
    this.ticket.set(null);
    this.highlight = false;
    this.phase.set('idle');
    this.progress.set(0);
    this.redrawAll();
  }

  buy(): void {
    const t = this.selectedInfo();
    if (!t || !this.canBuy()) return;
    this.audio.ensure();
    this.phase.set('buying');
    this.ticket.set(null);
    this.highlight = false;
    this.progress.set(0);
    this.particles = this.particles.filter((p) => p.kind !== 'coin');
    this.redrawAll();

    this.api.post<ScratchBuyResponse>('/casino/scratch/buy', { ticketType: t.key }).subscribe({
      next: (res) => {
        if (this.destroyed) return;
        this.creditService.credits.set(res.newBalance);
        this.bought.update((v) => v + 1);
        this.spent.update((v) => v + res.price);
        this.ticket.set(res);
        // erst frische Folie, dann den Druck darunter
        drawFoil(this.foilCtx, THEMES[t.key]);
        this.drawBase();
        this.buildRegions();
        this.phase.set('scratching');
        this.slip.set({
          tone: 'info',
          title: `Los ${res.serial}`,
          text: 'Rubbeln mit Maus oder Finger. Ab 70 % freigerubbelt zeigt die Bank das Ergebnis.',
        });
      },
      error: (err: HttpErrorResponse) => {
        this.phase.set('idle');
        const msg = (err.error as { error?: string } | null)?.error;
        this.slip.set({
          tone: 'err',
          title: 'Schalter geschlossen',
          text: msg || 'Der Kauf hat nicht geklappt. Es wurde nichts abgebucht.',
        });
      },
    });
  }

  // ------------------------------------------------------------------ Zeichnen

  private redrawAll(): void {
    const theme = THEMES[this.selected()];
    drawFoil(this.foilCtx, theme);
    this.drawBase();
  }

  private drawBase(pulse = 0.6): void {
    drawTicket(this.baseCtx, THEMES[this.selected()], {
      info: this.selectedInfo(),
      ticket: this.ticket(),
      highlight: this.highlight,
      pulse,
    });
  }

  // ------------------------------------------------------------------ Rubbeln

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const r = this.foilRef.nativeElement.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  onDown(e: PointerEvent): void {
    if (this.phase() !== 'scratching' || this.autoRunning()) {
      if (this.phase() === 'idle') this.nudge();
      return;
    }
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.audio.ensure();
    this.pointerId = e.pointerId;
    try {
      this.foilRef.nativeElement.setPointerCapture(e.pointerId);
    } catch {
      /* egal */
    }
    const p = this.toLocal(e);
    this.last = { ...p, t: performance.now() };
    this.scratchAt(p.x, p.y, p.x, p.y, 0);
  }

  onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId || !this.last || this.phase() !== 'scratching') return;
    e.preventDefault();
    const evs = e.getCoalescedEvents?.() ?? [];
    const list = evs.length ? evs : [e];
    for (const ev of list) {
      const p = this.toLocal(ev);
      const now = performance.now();
      const dist = Math.hypot(p.x - this.last.x, p.y - this.last.y);
      const dt = Math.max(1, now - this.last.t);
      this.scratchAt(this.last.x, this.last.y, p.x, p.y, dist / dt);
      this.last = { ...p, t: now };
    }
    if (performance.now() - this.lastMeasure > 140) this.measure();
  }

  onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.last = null;
    this.audio.scratchStop();
    if (this.phase() === 'scratching') this.measure();
  }

  private nudge(): void {
    this.shake.set(true);
    this.timers.push(setTimeout(() => this.shake.set(false), 420));
    this.slip.set({
      tone: 'info',
      title: 'Erst kaufen, dann rubbeln',
      text: 'Das ist ein Musterlos. Die Zentralbank rubbelt nur gegen Vorkasse.',
    });
  }

  private scratchAt(x0: number, y0: number, x1: number, y1: number, speed: number): void {
    const c = this.foilCtx;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1 + 0.01, y1);
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = BRUSH * 2;
    c.stroke();
    c.strokeStyle = '#000';
    c.lineWidth = BRUSH * 1.3;
    c.stroke();
    // ausgefranste Kanten
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = 2 + Math.floor(dist / 6);
    for (let i = 0; i < n; i++) {
      const f = Math.random();
      const a = Math.random() * Math.PI * 2;
      const r = BRUSH * (0.8 + Math.random() * 0.5);
      c.beginPath();
      c.arc(
        x0 + (x1 - x0) * f + Math.cos(a) * r,
        y0 + (y1 - y0) * f + Math.sin(a) * r,
        1.5 + Math.random() * 3.5,
        0,
        Math.PI * 2,
      );
      c.fillStyle = `rgba(0,0,0,${0.4 + Math.random() * 0.6})`;
      c.fill();
    }
    c.restore();

    if (this.overFoil(x1, y1)) {
      this.spawnFlakes(x1, y1, Math.min(7, 1 + dist / 5), x1 - x0, y1 - y0);
      this.audio.scratch(speed);
    } else {
      this.audio.scratch(0);
    }
  }

  private overFoil(x: number, y: number): boolean {
    const m = BRUSH;
    if (x > GRID.x - m && x < GRID.x + GRID.w + m && y > GRID.y - m && y < GRID.y + GRID.h + m)
      return true;
    return this.selected() === 'mett' && Math.hypot(x - BONUS.x, y - BONUS.y) < BONUS.r + m;
  }

  private buildRegions(): void {
    const cw = this.foilRef.nativeElement.width;
    const { cells, bonus } = foilRegions(THEMES[this.selected()]);
    const step = 6;
    const make = (r: Rect, circle: boolean): Region => {
      const idx: number[] = [];
      for (let y = r.y + 3; y < r.y + r.h - 2; y += step) {
        for (let x = r.x + 3; x < r.x + r.w - 2; x += step) {
          if (circle && Math.hypot(x - BONUS.x, y - BONUS.y) > BONUS.r - 2) continue;
          idx.push((Math.round(y * this.k) * cw + Math.round(x * this.k)) * 4 + 3);
        }
      }
      return { idx, revealed: false };
    };
    this.regions = cells.map((r) => make(r, false));
    if (bonus) this.regions.push(make(bonus, true));
    this.totalSamples = this.regions.reduce((s, r) => s + r.idx.length, 0);
  }

  /** Abdeckung messen: Felder freischalten, ab 70 % Ergebnis zeigen */
  private measure(): void {
    if (this.phase() !== 'scratching' || !this.regions.length) return;
    this.lastMeasure = performance.now();
    const c = this.foilRef.nativeElement;
    const data = this.foilCtx.getImageData(0, 0, c.width, c.height).data;
    let clear = 0;
    let newly = false;
    for (const r of this.regions) {
      let rc = 0;
      for (const i of r.idx) if (data[i] < 60) rc++;
      clear += rc;
      if (!r.revealed && rc / r.idx.length >= CELL_AT) {
        r.revealed = true;
        newly = true;
      }
    }
    if (newly) this.audio.tick();
    const frac = clear / Math.max(1, this.totalSamples);
    this.progress.set(Math.min(100, Math.round(frac * 100)));
    if (frac >= REVEAL_AT && !this.autoRunning()) this.finishReveal();
  }

  /** "Alles aufrubbeln": schnelle automatische Zickzack-Striche ueber das Feld */
  autoReveal(): void {
    if (this.phase() !== 'scratching' || this.autoRunning()) return;
    this.audio.ensure();
    this.autoRunning.set(true);
    const pts: { x: number; y: number }[] = [];
    const rows = 9;
    for (let i = 0; i <= rows; i++) {
      const y = GRID.y + 6 + (i * (GRID.h - 12)) / rows;
      const l = GRID.x + 8,
        r = GRID.x + GRID.w - 8;
      if (i % 2) pts.push({ x: r, y }, { x: l, y: y + 10 });
      else pts.push({ x: l, y }, { x: r, y: y + 10 });
    }
    if (this.selected() === 'mett') {
      for (let a = 0; a <= Math.PI * 4; a += 0.5) {
        const rad = 8 + (a / (Math.PI * 4)) * (BONUS.r - 8);
        pts.push({ x: BONUS.x + Math.cos(a) * rad, y: BONUS.y + Math.sin(a) * rad });
      }
    }
    const segLen = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
    const total = segLen.reduce((a, b) => a + b, 0);
    const dur = 1300;
    const start = performance.now();
    let done = 0;
    let prev = pts[0];

    const pointAt = (d: number): { x: number; y: number } => {
      let acc = 0;
      for (let i = 0; i < segLen.length; i++) {
        if (acc + segLen[i] >= d) {
          const f = (d - acc) / segLen[i];
          return {
            x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
            y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
          };
        }
        acc += segLen[i];
      }
      return pts[pts.length - 1];
    };

    const step = (): void => {
      if (this.destroyed) return;
      const t = Math.min(1, (performance.now() - start) / dur);
      const d = total * (1 - Math.pow(1 - t, 1.4));
      // in kleinen Teilstuecken, damit die Linie den Zickzack sauber nachfaehrt
      while (done < d) {
        const nd = Math.min(d, done + 14);
        const p = pointAt(nd);
        this.scratchAt(prev.x, prev.y, p.x, p.y, 1.4);
        prev = p;
        done = nd;
      }
      this.progress.set(Math.round(t * 100));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.audio.scratchStop();
        this.autoRunning.set(false);
        this.finishReveal();
      }
    };
    requestAnimationFrame(step);
  }

  private finishReveal(): void {
    if (this.phase() !== 'scratching') return;
    this.audio.scratchStop();
    this.pointerId = null;
    this.progress.set(100);
    this.phase.set('revealing');
    this.timers.push(
      setTimeout(() => {
        if (this.destroyed) return;
        this.foilCtx.clearRect(0, 0, W, H);
        this.phase.set('done');
        this.showResult();
      }, 560),
    );
  }

  // ------------------------------------------------------------------ Ergebnis

  private showResult(): void {
    const res = this.ticket();
    const t = this.selectedInfo();
    if (!res || !t) return;
    this.highlight = res.winCells.length > 0;
    this.pulseUntil = this.highlight ? performance.now() + 3200 : 0;
    this.drawBase();
    this.won.update((v) => v + res.credited);

    const symName = (id?: string): string => t.symbols.find((s) => s.id === id)?.name ?? 'Symbol';
    let slip: Slip;
    let net = res.credited - res.price;

    if (res.confiscated) {
      const would = t.symbols.find((s) => s.id === res.confiscatedSymbol)?.prize ?? 0;
      slip = {
        tone: 'admin',
        title: `3× ${symName(res.confiscatedSymbol)} … ADMIN!`,
        text: `${would} N$ wären es gewesen. ${pick(ADMIN_LINES)}`,
      };
      this.audio.stamp();
      this.timers.push(setTimeout(() => this.audio.lose(), 350));
      this.shake.set(true);
      this.timers.push(setTimeout(() => this.shake.set(false), 420));
      net = -res.price;
    } else if (res.payout > 0) {
      const ratio = res.payout / res.price;
      const bonus = res.bonus && res.bonus > 1 ? ` · Bonus ×${res.bonus}` : '';
      const capped =
        res.credited < res.payout
          ? ` Kontolimit erreicht: nur ${res.credited} N$ gutgeschrieben.`
          : '';
      slip = {
        tone: ratio <= 1 ? 'even' : 'win',
        title: `3× ${symName(res.winSymbol)}: +${res.payout} N$${bonus}`,
        text: (ratio <= 1 ? pick(BREAK_EVEN_LINES) : pick(WIN_LINES)) + capped,
      };
      this.audio.win(ratio >= 10);
      this.coinShower(Math.min(160, 18 + Math.round(ratio * 10)));
      this.lcdFlash.set(true);
      this.timers.push(setTimeout(() => this.lcdFlash.set(false), 1500));
    } else {
      slip = { tone: 'lose', title: 'Leider kein Gewinn', text: pick(LOSS_LINES) };
      this.audio.lose();
    }
    this.slip.set(slip);
    this.history.update((h) =>
      [{ serial: res.serial, name: t.name, net, tone: slip.tone }, ...h].slice(0, 5),
    );
  }

  // ------------------------------------------------------------------ Effekte

  private spawnFlakes(x: number, y: number, n: number, dx: number, dy: number): void {
    const theme = THEMES[this.selected()];
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < n && this.particles.length < 500; i++) {
      this.particles.push({
        kind: 'flake',
        x: x + (Math.random() - 0.5) * BRUSH,
        y: y + (Math.random() - 0.5) * BRUSH,
        vx: (dx / len) * (0.5 + Math.random() * 1.5) + (Math.random() - 0.5) * 2.2,
        vy: (dy / len) * (0.5 + Math.random()) - 1 - Math.random() * 1.5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.5,
        size: 1.5 + Math.random() * 3.5,
        life: 0,
        maxLife: 40 + Math.random() * 40,
        color: flakeColor(theme),
      });
    }
  }

  private coinShower(n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'coin',
        x: 20 + Math.random() * (W - 40),
        y: -30 - Math.random() * 600,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 2 + Math.random() * 3,
        rot: Math.random() * Math.PI * 2,
        vr: 0.1 + Math.random() * 0.2,
        size: 11 + Math.random() * 8,
        life: 0,
        maxLife: 260,
        color: '',
      });
    }
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        kind: 'spark',
        x: GRID.x + Math.random() * GRID.w,
        y: GRID.y + Math.random() * GRID.h,
        vx: 0,
        vy: -0.3,
        rot: 0,
        vr: 0,
        size: 2 + Math.random() * 4,
        life: -Math.random() * 60,
        maxLife: 50,
        color: '#fff5c0',
      });
    }
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.pulseUntil) {
      if (this.pulseUntil > now) {
        this.drawBase(0.5 + 0.5 * Math.sin(now / 120));
      } else {
        this.pulseUntil = 0;
        this.drawBase();
      }
    }
    const c = this.fxCtx;
    if (!this.particles.length) return;
    c.clearRect(0, 0, W, H);
    this.particles = this.particles.filter((p) => {
      p.life++;
      if (p.life < 0) return true;
      if (p.kind === 'flake') {
        p.vy += 0.18;
        p.vx *= 0.97;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const a = 1 - p.life / p.maxLife;
        c.save();
        c.globalAlpha = Math.max(0, a);
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(1, Math.abs(Math.cos(p.rot * 2)) * 0.8 + 0.2);
        c.fillStyle = p.color;
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        c.restore();
      } else if (p.kind === 'coin') {
        p.vy += 0.12;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H - 20 && p.vy > 0) {
          p.vy *= -0.35;
          p.y = H - 20;
          if (Math.random() < 0.08) this.audio.coin();
        }
        const sx = Math.cos(p.rot);
        const a = p.life > p.maxLife - 40 ? (p.maxLife - p.life) / 40 : 1;
        c.save();
        c.globalAlpha = a;
        c.translate(p.x, p.y);
        c.scale(Math.max(0.08, Math.abs(sx)), 1);
        const g = c.createRadialGradient(-p.size * 0.3, -p.size * 0.3, 1, 0, 0, p.size);
        g.addColorStop(0, '#fff3a8');
        g.addColorStop(0.55, '#f2c230');
        g.addColorStop(1, '#a87408');
        c.beginPath();
        c.arc(0, 0, p.size, 0, Math.PI * 2);
        c.fillStyle = g;
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = '#7a5200';
        c.stroke();
        if (Math.abs(sx) > 0.45) {
          c.fillStyle = '#7a5200';
          c.font = `800 ${Math.round(p.size * 0.9)}px "Barlow Condensed", sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('N$', 0, 1);
        }
        c.restore();
      } else {
        p.y += p.vy;
        const f = p.life / p.maxLife;
        const s = p.size * Math.sin(f * Math.PI);
        c.save();
        c.globalAlpha = 0.9;
        c.fillStyle = p.color;
        c.translate(p.x, p.y);
        c.beginPath();
        c.moveTo(0, -s * 2);
        c.lineTo(s * 0.4, 0);
        c.lineTo(0, s * 2);
        c.lineTo(-s * 0.4, 0);
        c.closePath();
        c.moveTo(-s * 2, 0);
        c.lineTo(0, s * 0.4);
        c.lineTo(s * 2, 0);
        c.lineTo(0, -s * 0.4);
        c.closePath();
        c.fill();
        c.restore();
      }
      return p.life < p.maxLife;
    });
    if (!this.particles.length) c.clearRect(0, 0, W, H);
  };

  // ------------------------------------------------------------------ Sonstiges

  toggleSound(): void {
    this.muted.update((m) => !m);
    this.audio.setMuted(this.muted());
    try {
      localStorage.setItem(SOUND_KEY, this.muted() ? '1' : '0');
    } catch {
      /* egal */
    }
  }

  exitHint(): string {
    const p = this.phase();
    if (p === 'scratching' || p === 'revealing' || p === 'buying')
      return 'Dein Los ist bereits ausgewertet: ein Gewinn ist schon gutgeschrieben. Du verpasst nur das Rubbeln.';
    return 'Es liegt kein offenes Los auf dem Tresen, es geht nichts verloren.';
  }

  exitGame(): void {
    this.dialogRef.close();
  }
}
