import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../../core/services/auth.service';
import { CreditService } from '../../../../core/services/credit.service';
import { SoundService } from '../../../../core/services/sound.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GameOverlayComponent } from '../../game-overlay.component';
import { GAME_INFO } from '../../game-info';
import { fitCanvas } from '../../game-shared';
import { PongAudio } from './pong-audio';
import { PongClientService } from './pong-client.service';
import { PongView } from './pong-view';
import { PongEvent, PongMatchInfo, PongPhase, PongState } from './pong.types';

interface Hud {
  ph: PongPhase;
  s: [number, number];
  pt: number;
  w: number;
  er: string | null;
  r: [boolean, boolean];
  l: [boolean, boolean];
  c: [boolean, boolean];
}

const STAKES = [0, 5, 10, 25, 50, 100];
const PADDLE_SPEED = 3200; // wie Server
const KEY_SPEED = 720;

function readFlag(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}
function writeFlag(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* egal */
  }
}

/**
 * LAN-Pong: Echtzeit-Pong zwischen zwei Nervbox-Nutzern (oder gegen die Nervbox).
 * Lobby (online, herausfordern, offenes Spiel, Einsatz) und Spielbildschirm in einem Dialog.
 * Simulation laeuft komplett auf dem Server (PongService), hier nur Eingabe + Darstellung.
 */
@Component({
  selector: 'app-pong-game',
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
      [hint]="hint()"
      (closed)="onClose()"
    >
      @if (!match()) {
        <!-- ============================== LOBBY -->
        <div class="pg-lobby" data-testid="pong-lobby">
          <section class="nk-section pg-col">
            <h3 class="nk-section__title">
              Am Netz
              <span class="nk-section__aside">{{ others().length }} weitere online</span>
            </h3>
            <div class="nk-well pg-list">
              @for (u of others(); track u.id) {
                <div class="nk-row" [class.nk-row--off]="u.status !== 'lobby'">
                  <span
                    [class]="
                      'nk-led nk-led--dot ' +
                      (u.status === 'lobby'
                        ? 'nk-led--own'
                        : u.status === 'playing'
                          ? 'nk-led--other'
                          : 'nk-led--lamp')
                    "
                    aria-hidden="true"
                  ></span>
                  <span class="nk-row__main">
                    <span class="nk-row__title">{{ u.name }}</span>
                    <span class="nk-row__meta">{{ statusText(u.status) }}</span>
                  </span>
                  @if (myOutgoing()?.toId === u.id) {
                    <span class="nk-led nk-led--dot nk-led--warn nk-led--blink"></span>
                    <span class="pg-wait">wartet…</span>
                  } @else {
                    <button
                      type="button"
                      class="nk-key nk-key--sm"
                      [disabled]="u.status === 'playing' || !pong.connected()"
                      (click)="challenge(u.id)"
                    >
                      <mat-icon>sports_tennis</mat-icon>Herausfordern
                    </button>
                  }
                </div>
              } @empty {
                <div class="nk-empty pg-empty">
                  <span class="nk-empty__title">Keiner da</span>
                  <span class="nk-empty__text"
                    >Mach ein offenes Spiel auf oder zock gegen die Nervbox.</span
                  >
                </div>
              }
            </div>

            @if (incomingList().length) {
              <h3 class="nk-section__title">Herausforderungen an dich</h3>
              <div class="nk-well pg-list">
                @for (i of incomingList(); track i.id) {
                  <div class="nk-row nk-row--hl" data-testid="pong-incoming">
                    <span class="nk-led nk-led--dot nk-led--own nk-led--blink"></span>
                    <span class="nk-row__main">
                      <span class="nk-row__title">{{ i.fromName }}</span>
                      <span class="nk-row__meta">{{ stakeText(i.stake) }}</span>
                    </span>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--accent"
                      (click)="accept(i.id)"
                    >
                      Annehmen
                    </button>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--ghost"
                      (click)="decline(i.id)"
                    >
                      Nein
                    </button>
                  </div>
                }
              </div>
            }
          </section>

          <section class="nk-section pg-col">
            <h3 class="nk-section__title">
              Einsatz <span class="nk-section__aside">beide zahlen · Sieger nimmt alles</span>
            </h3>
            <div class="pg-stakes" role="radiogroup" aria-label="Einsatz">
              @for (s of stakes; track s) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="stake() === s"
                  [class]="stake() === s ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'"
                  [disabled]="s > credits.credits()"
                  (click)="stake.set(s)"
                >
                  {{ s === 0 ? 'Ehre' : s + ' N$' }}
                </button>
              }
            </div>

            <div class="pg-actions">
              @if (myOutgoing(); as out) {
                <div class="nk-row nk-row--hl pg-out" data-testid="pong-outgoing">
                  <span class="nk-led nk-led--dot nk-led--warn nk-led--blink"></span>
                  <span class="nk-row__main">
                    <span class="nk-row__title">{{
                      out.open ? 'Offenes Spiel' : 'Warte auf ' + out.toName
                    }}</span>
                    <span class="nk-row__meta">{{ stakeText(out.stake) }}</span>
                  </span>
                  <button
                    type="button"
                    class="nk-key nk-key--sm nk-key--ghost"
                    (click)="cancel(out.id)"
                  >
                    Zurückziehen
                  </button>
                </div>
              } @else {
                <button
                  type="button"
                  class="nk-key nk-key--accent nk-key--lg"
                  [disabled]="!pong.connected()"
                  (click)="openGame()"
                >
                  <mat-icon>wifi_tethering</mat-icon>Offenes Spiel
                </button>
              }
              <button
                type="button"
                class="nk-key nk-key--lg"
                [disabled]="!pong.connected()"
                (click)="playCpu()"
              >
                <mat-icon>smart_toy</mat-icon>Gegen die Nervbox
              </button>
            </div>

            @if (openGames().length) {
              <h3 class="nk-section__title">Offene Spiele</h3>
              <div class="nk-well pg-list">
                @for (i of openGames(); track i.id) {
                  <div class="nk-row">
                    <span class="nk-led nk-led--dot nk-led--own nk-led--blink"></span>
                    <span class="nk-row__main">
                      <span class="nk-row__title">{{ i.fromName }}</span>
                      <span class="nk-row__meta">{{ stakeText(i.stake) }}</span>
                    </span>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--accent"
                      [disabled]="i.stake > credits.credits()"
                      (click)="accept(i.id)"
                    >
                      Mitspielen
                    </button>
                  </div>
                }
              </div>
            }

            @if (pong.lobby().matches.length) {
              <h3 class="nk-section__title">Läuft gerade</h3>
              <div class="nk-well pg-list">
                @for (m of pong.lobby().matches; track m.id) {
                  <div class="nk-row">
                    <span class="nk-led nk-led--dot nk-led--other"></span>
                    <span class="nk-row__main">
                      <span class="nk-row__title">{{ m.names[0] }} vs {{ m.names[1] }}</span>
                      <span class="nk-row__meta"
                        >{{ m.s[0] }} : {{ m.s[1] }} · {{ stakeText(m.stake) }}</span
                      >
                    </span>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--ghost"
                      (click)="spectate(m.id)"
                    >
                      <mat-icon>visibility</mat-icon>Zuschauen
                    </button>
                  </div>
                }
              </div>
            }

            <p class="pg-rules">
              Bis {{ winScore }} Punkte · Ball wird mit jedem Treffer schneller · Schläger in
              Bewegung = Effet. Steuerung: Maus/Finger ziehen, W/S oder Pfeiltasten.
            </p>
          </section>

          @if (notice(); as n) {
            <div class="nk-toast nk-toast--warn nk-toast--inline pg-notice" role="status">
              <span class="nk-toast__text">{{ n }}</span>
            </div>
          }
          @if (!pong.connected()) {
            <div class="nk-toast nk-toast--error nk-toast--inline pg-notice" role="alert">
              <span class="nk-toast__text">Verbinde mit der Nervbox…</span>
            </div>
          }
        </div>
      } @else if (match(); as m) {
        <!-- ============================== MATCH -->
        <div
          class="pg-stage"
          [class.pg-stage--portrait]="portrait()"
          (pointerdown)="onPointer($event)"
          (pointermove)="onPointer($event)"
          data-testid="pong-stage"
        >
          <canvas #cv class="pg-canvas" [attr.aria-label]="ariaScore()"></canvas>

          @if (hud(); as h) {
            @if (h.ph === 'paused') {
              <app-game-overlay tone="pause" kicker="Verbindung" icon="wifi_off" title="Pause">
                <p class="nk-go__text">{{ pausedText() }}</p>
                <span class="nk-counter nk-go__score">{{ h.pt }}</span>
                <p class="nk-go__hint">
                  @if (h.c[mySlot()] === false) {
                    Du bist weg – wieder verbinden…
                  } @else {
                    Kommt er nicht zurück, gewinnst du (den Pot).
                  }
                </p>
              </app-game-overlay>
            }
            @if (h.ph === 'over') {
              <app-game-overlay
                [tone]="resultTone()"
                [kicker]="resultKicker()"
                [icon]="resultIcon()"
                [title]="resultTitle()"
                data-testid="pong-over"
              >
                <span class="nk-counter nk-go__score">{{ scoreLine() }}</span>
                @if (m.stake > 0) {
                  @if (h.er === 'disconnect' && h.w < 0) {
                    <p class="nk-go__text">Abbruch – beide kriegen {{ m.stake }} N$ zurück.</p>
                  } @else if (mySlot() >= 0 && h.w === mySlot()) {
                    <p class="nk-go__reward">+{{ m.pot }} N$</p>
                  } @else if (mySlot() >= 0) {
                    <p class="nk-go__neg">−{{ m.stake }} N$</p>
                  }
                }
                @if (rematchInfo()) {
                  <p class="nk-go__hint">{{ rematchInfo() }}</p>
                }
                <div goActions>
                  @if (mySlot() >= 0) {
                    <button
                      type="button"
                      class="nk-key nk-key--accent nk-key--lg"
                      [disabled]="h.r[mySlot()] || h.l[1 - mySlot()]"
                      (click)="rematch()"
                    >
                      <mat-icon>replay</mat-icon>{{ h.r[mySlot()] ? 'Warte…' : 'Revanche' }}
                    </button>
                  }
                  <button type="button" class="nk-key nk-key--ghost" (click)="toLobby()">
                    Zur Lobby
                  </button>
                </div>
              </app-game-overlay>
            }
          }
        </div>
      }

      <span gfKeys class="pg-keys">
        <button
          type="button"
          [class]="sfx() ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'"
          [attr.aria-pressed]="sfx()"
          (click)="toggleSfx()"
        >
          <mat-icon>{{ sfx() ? 'volume_up' : 'volume_off' }}</mat-icon>Ton
        </button>
        <button
          type="button"
          [class]="nsound() ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'"
          [attr.aria-pressed]="nsound()"
          title="Bei deinem Tor spielt ein beliebter Nervbox-Sound (nur bei dir im Browser)"
          (click)="toggleNsound()"
        >
          <mat-icon>campaign</mat-icon>Tor-Sound
        </button>
        @if (match() && hud()?.ph !== 'over') {
          <button
            type="button"
            class="nk-key nk-key--sm nk-key--ghost"
            (click)="exitConfirm.open()"
          >
            {{ mySlot() >= 0 ? 'Aufgeben' : 'Zur Lobby' }}
          </button>
        }
      </span>

      <app-game-exit-confirm #exitConfirm [hint]="exitHint()" (exit)="exitGame()" />
    </app-game-frame>
  `,
  styles: `
    .pg-lobby {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 18px;
      padding: 14px;
      min-height: 420px;
      background:
        repeating-linear-gradient(0deg, rgb(0 0 0 / 0.22) 0 2px, transparent 2px 4px),
        radial-gradient(ellipse at 50% 30%, #0f1813, #050706);
      border-radius: 5px;
    }
    .pg-col {
      gap: 10px;
    }
    .pg-list {
      max-height: 260px;
      overflow-y: auto;
    }
    .pg-list .nk-row {
      gap: 10px;
      padding: 0 8px;
    }
    .pg-list .nk-key .mat-icon,
    .pg-actions .nk-key .mat-icon,
    .pg-keys .nk-key .mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      margin-right: 4px;
    }
    .pg-wait {
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-warn-text);
    }
    .pg-empty {
      padding: 22px 10px;
    }
    .pg-stakes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pg-actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 6px 0 4px;
    }
    .pg-out {
      border-radius: 6px;
      gap: 10px;
      padding: 0 8px;
    }
    .pg-rules {
      margin: 4px 0 0;
      font: 500 12px/1.45 var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .pg-notice {
      grid-column: 1 / -1;
    }
    .pg-stage {
      position: relative;
      display: flex;
      justify-content: center;
      background: #030403;
      border-radius: 5px;
      overflow: hidden;
      touch-action: none;
      user-select: none;
    }
    .pg-canvas {
      display: block;
      cursor: none;
      touch-action: none;
      width: var(--fit-w, auto) !important;
      height: var(--fit-h, auto) !important;
      border-radius: 4px;
    }
    .pg-keys {
      display: contents;
    }
    @media (max-width: 700px) {
      .pg-lobby {
        grid-template-columns: minmax(0, 1fr);
        padding: 10px;
      }
      .pg-keys .nk-key {
        padding-left: 8px;
        padding-right: 8px;
      }
    }
  `,
})
export class PongGameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('root', { static: true }) frame!: GameFrameComponent;
  @ViewChild('exitConfirm', { static: true }) exitConfirmRef!: GameExitConfirmComponent;
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('cv');

  readonly info = GAME_INFO.pong;
  readonly pong = inject(PongClientService);
  readonly credits = inject(CreditService);
  private readonly auth = inject(AuthService);
  private readonly sounds = inject(SoundService);
  private readonly dialogRef = inject(MatDialogRef<PongGameComponent>);

  readonly stakes = STAKES;
  readonly winScore = 7;
  readonly stake = signal(0);
  readonly hud = signal<Hud | null>(null);
  readonly portrait = signal(false);
  readonly sfx = signal(readFlag('nervbox-pong-sfx', true));
  readonly nsound = signal(readFlag('nervbox-pong-nsound', true));
  readonly match = this.pong.match;

  private readonly myId = computed(() => this.auth.currentUser()?.id ?? -1);
  readonly mySlot = computed(() => this.match()?.slot ?? -1);

  readonly others = computed(() => this.pong.lobby().users.filter((u) => u.id !== this.myId()));
  readonly myOutgoing = computed(
    () => this.pong.lobby().invites.find((i) => i.fromId === this.myId()) ?? null,
  );
  readonly openGames = computed(() =>
    this.pong.lobby().invites.filter((i) => i.open && i.fromId !== this.myId()),
  );
  readonly incomingList = computed(() => {
    const fromLobby = this.pong.lobby().invites.filter((i) => i.toId === this.myId());
    const ids = new Set(fromLobby.map((i) => i.id));
    return [...fromLobby, ...this.pong.incoming().filter((i) => !ids.has(i.id))];
  });

  private readonly noticeText = signal<string | null>(null);
  readonly notice = this.noticeText.asReadonly();

  readonly stats = computed<GameStat[]>(() => {
    const m = this.match();
    const h = this.hud();
    if (!m || !h) {
      return [
        { label: 'ONLINE', value: this.pong.lobby().users.length },
        { label: 'N$', value: this.credits.credits() },
      ];
    }
    const me = m.slot === 1 ? 1 : 0;
    const op = 1 - me;
    const list: GameStat[] = [
      { label: this.short(m.names[me]), value: h.s[me] },
      { label: this.short(m.names[op]), value: h.s[op] },
    ];
    if (m.stake > 0) list.push({ label: 'POT', value: m.pot });
    return list;
  });

  readonly hint = computed(() =>
    this.portrait()
      ? ''
      : this.match()
        ? 'Maus/Finger ziehen · W/S · ESC'
        : 'Erster bis 7 · ESC = Beenden?',
  );

  private view: PongView | null = null;
  private viewMatchId: string | null = null;
  private stopFit?: () => void;
  private raf = 0;
  private readonly audio = new PongAudio();
  private keys = new Set<string>();
  private targetY = 250;
  private lastSentY = -1;
  private lastSentAt = 0;
  private lastFrameAt = 0;
  private lastCountdown = -1;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private topSounds: string[] = [];
  private hudKey = '';

  constructor() {
    this.audio.muted = !this.sfx();
    this.pong.onState = (s, at) => this.onState(s, at);
    this.pong.onEvent = (e) => this.onEvent(e);
    void this.pong.enterLobby();

    // Meldungen des Hubs als Inline-Hinweis
    effect(() => {
      const n = this.pong.notice();
      if (!n || Date.now() - n.at > 3000) return;
      this.noticeText.set(n.text);
      clearTimeout(this.noticeTimer);
      this.noticeTimer = setTimeout(() => this.noticeText.set(null), 4500);
    });

    // Match-Wechsel / Canvas da -> Ansicht aufbauen
    effect(() => {
      const m = this.match();
      const cv = this.canvasRef()?.nativeElement;
      if (!m || !cv) {
        if (!m) this.teardownView();
        return;
      }
      if (this.viewMatchId !== m.id || !this.view) this.setupView(m, cv);
    });

    this.sounds.getTopSounds().subscribe({
      next: (list) => (this.topSounds = list.slice(0, 25).map((s) => s.hash)),
      error: () => undefined,
    });
  }

  ngAfterViewInit(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.onResize);
    this.teardownView();
    this.pong.onState = null;
    this.pong.onEvent = null;
    void this.pong.leaveLobby();
    this.audio.dispose();
    clearTimeout(this.noticeTimer);
  }

  // ---------------------------------------------------------------- Lobby-Aktionen

  statusText(s: string): string {
    return s === 'lobby' ? 'wartet auf ein Spiel' : s === 'playing' ? 'spielt gerade' : 'online';
  }
  stakeText(stake: number): string {
    return stake > 0 ? `${stake} N$ Einsatz · Pot ${stake * 2} N$` : 'um die Ehre';
  }
  private short(n: string): string {
    return (n || '?').toUpperCase().slice(0, 10);
  }

  challenge(userId: number): void {
    this.audio.unlock();
    void this.pong.challenge(userId, this.stake());
  }
  openGame(): void {
    this.audio.unlock();
    void this.pong.challenge(null, this.stake());
  }
  cancel(id: string): void {
    void this.pong.cancelInvite(id);
  }
  accept(id: string): void {
    this.audio.unlock();
    void this.pong.accept(id);
  }
  decline(id: string): void {
    void this.pong.decline(id);
  }
  playCpu(): void {
    this.audio.unlock();
    void this.pong.playCpu();
  }
  spectate(id: string): void {
    this.audio.unlock();
    void this.pong.spectate(id);
  }
  rematch(): void {
    void this.pong.rematch();
  }
  toLobby(): void {
    void this.pong.leaveMatch();
  }

  toggleSfx(): void {
    this.sfx.update((v) => !v);
    writeFlag('nervbox-pong-sfx', this.sfx());
    this.audio.muted = !this.sfx();
    if (this.sfx()) this.audio.unlock();
  }
  toggleNsound(): void {
    this.nsound.update((v) => !v);
    writeFlag('nervbox-pong-nsound', this.nsound());
  }

  // ---------------------------------------------------------------- Beenden

  exitHint(): string {
    const m = this.match();
    const h = this.hud();
    if (!m || !h || h.ph === 'over' || m.slot < 0) return '';
    if (m.cpu) return 'Das Spiel gegen die Nervbox wird abgebrochen.';
    return m.stake > 0
      ? `Das Match läuft weiter, solange du hier bist. Beenden = Aufgeben: ${m.names[1 - m.slot]} bekommt den Pot (${m.pot} N$).`
      : `Beenden = Aufgeben, ${m.names[1 - m.slot]} gewinnt.`;
  }

  onClose(): void {
    const h = this.hud();
    if (this.match() && h && h.ph !== 'over' && this.mySlot() >= 0) this.exitConfirmRef.open();
    else this.exitGame();
  }

  exitGame(): void {
    const h = this.hud();
    // laufendes Match: aufgeben bzw. Zuschauen beenden, danach zurueck in die Lobby
    if (this.match() && h && h.ph !== 'over') {
      void this.pong.leaveMatch();
      return;
    }
    this.dialogRef.close();
  }

  // ---------------------------------------------------------------- Netz -> Ansicht

  private onState(s: PongState, at: number): void {
    this.view?.pushState(s, at);
    const h: Hud = {
      ph: s.ph,
      s: s.s,
      pt: Math.ceil(s.pt),
      w: s.w,
      er: s.er,
      r: s.r,
      l: s.l,
      c: s.c,
    };
    const key = JSON.stringify(h);
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.hud.set(h);
    }
    if (s.ph === 'countdown') {
      const n = Math.ceil(s.pt);
      if (n !== this.lastCountdown && n > 0 && s.pt > 0.9) this.audio.tick(false);
      this.lastCountdown = n;
    } else {
      this.lastCountdown = -1;
    }
  }

  private onEvent(e: PongEvent): void {
    this.view?.onEvent(e);
    const slot = this.mySlot();
    switch (e.k) {
      case 'hit':
        this.audio.hit(e.sp ?? 400, e.side === slot);
        break;
      case 'wall':
        this.audio.wall();
        break;
      case 'serve':
        this.audio.tick(true);
        break;
      case 'goal': {
        const mine = slot < 0 ? true : e.side === slot;
        this.audio.goal(mine);
        if (mine && this.nsound() && this.topSounds.length) {
          const hash = this.topSounds[Math.floor(Math.random() * this.topSounds.length)];
          this.sounds.playInBrowser(hash);
        }
        break;
      }
      case 'over':
        if (slot >= 0 && e.reason !== 'disconnect') {
          if (e.side === slot) this.audio.win();
          else this.audio.lose();
        }
        break;
    }
  }

  // ---------------------------------------------------------------- Ansicht / Loop

  private setupView(m: PongMatchInfo, cv: HTMLCanvasElement): void {
    this.teardownView();
    const view = new PongView(cv, m.field);
    view.slot = m.slot;
    view.names = m.names;
    view.portrait = this.wantPortrait();
    this.portrait.set(view.portrait);
    view.resize();
    view.pushState(m.state, performance.now());
    this.view = view;
    this.viewMatchId = m.id;
    this.hudKey = '';
    this.onState(m.state, performance.now());
    if (m.slot >= 0) {
      this.targetY = m.state.p[m.slot];
      view.localY = this.targetY;
    }
    this.refit();
    this.lastFrameAt = 0;
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private teardownView(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stopFit?.();
    this.stopFit = undefined;
    this.view = null;
    this.viewMatchId = null;
    this.hud.set(null);
    this.hudKey = '';
  }

  private refit(): void {
    const view = this.view;
    const cv = this.canvasRef()?.nativeElement;
    if (!view || !cv) return;
    this.stopFit?.();
    this.stopFit = fitCanvas(
      () => this.canvasRef()?.nativeElement,
      view.cw,
      view.ch,
      this.frame.root,
    );
  }

  private wantPortrait(): boolean {
    return window.innerWidth < 720 && window.innerHeight > window.innerWidth;
  }

  private readonly onResize = (): void => {
    const view = this.view;
    if (!view) return;
    const p = this.wantPortrait();
    if (p === view.portrait) return;
    view.portrait = p;
    this.portrait.set(p);
    view.resize();
    this.refit();
  };

  private tick(now: number): void {
    const view = this.view;
    const m = this.match();
    if (!view || !m) return;
    const dt = this.lastFrameAt ? Math.min(0.05, (now - this.lastFrameAt) / 1000) : 0.016;
    this.lastFrameAt = now;

    if (m.slot >= 0) {
      const f = m.field;
      // Tastatur
      let dir = 0;
      if (this.keys.has('up')) dir -= 1;
      if (this.keys.has('down')) dir += 1;
      if (dir) this.targetY += view.keyToFieldDir(dir) * KEY_SPEED * dt;
      this.targetY = Math.max(f.padH / 2, Math.min(f.h - f.padH / 2, this.targetY));
      // lokale Vorhersage: gleiche Geschwindigkeitsgrenze wie der Server
      const cur = view.localY ?? this.targetY;
      const step = PADDLE_SPEED * dt;
      view.localY = cur + Math.max(-step, Math.min(step, this.targetY - cur));
      // senden: bei Aenderung max. ~45/s, sonst alle 250 ms
      const changed = Math.abs(this.targetY - this.lastSentY) > 0.4;
      if ((changed && now - this.lastSentAt > 22) || now - this.lastSentAt > 250) {
        this.pong.sendInput(m.id, this.targetY);
        this.lastSentY = this.targetY;
        this.lastSentAt = now;
      }
    }
    view.frame(now);
  }

  onPointer(ev: PointerEvent): void {
    const view = this.view;
    const m = this.match();
    if (!view || !m || m.slot < 0) return;
    if (ev.pointerType !== 'mouse' && ev.type === 'pointermove' && ev.buttons === 0) return;
    if (ev.type === 'pointerdown') this.audio.unlock();
    this.targetY = view.pointerToFieldY(ev.clientX, ev.clientY);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.match()) return;
    const k = this.keyDir(e.key);
    if (!k) return;
    e.preventDefault();
    this.keys.add(k);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const k = this.keyDir(e.key);
    if (k) this.keys.delete(k);
  };
  private readonly onBlur = (): void => this.keys.clear();

  private keyDir(key: string): 'up' | 'down' | null {
    switch (key.toLowerCase()) {
      case 'w':
      case 'arrowup':
      case 'a':
      case 'arrowleft':
        return 'up';
      case 's':
      case 'arrowdown':
      case 'd':
      case 'arrowright':
        return 'down';
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------- Texte

  ariaScore(): string {
    const m = this.match();
    const h = this.hud();
    return m && h ? `${m.names[0]} ${h.s[0]} zu ${h.s[1]} ${m.names[1]}` : 'Spielfeld';
  }

  pausedText(): string {
    const m = this.match();
    const h = this.hud();
    if (!m || !h) return '';
    const gone = h.c.findIndex((c) => !c);
    return gone >= 0 ? `${m.names[gone]} hat die Verbindung verloren.` : 'Verbindung weg.';
  }

  /** Spielstand aus eigener Sicht (Zuschauer: Slot 0 links) */
  scoreLine(): string {
    const h = this.hud();
    if (!h) return '';
    const me = this.mySlot() === 1 ? 1 : 0;
    return `${h.s[me]} : ${h.s[1 - me]}`;
  }

  resultTone(): 'win' | 'over' | 'info' {
    const h = this.hud();
    const s = this.mySlot();
    if (!h || s < 0 || h.w < 0 || h.er === 'disconnect') return 'info';
    return h.w === s ? 'win' : 'over';
  }
  resultIcon(): string {
    const t = this.resultTone();
    return t === 'win'
      ? 'emoji_events'
      : t === 'over'
        ? 'sentiment_very_dissatisfied'
        : 'settings_ethernet';
  }
  resultKicker(): string {
    const er = this.hud()?.er;
    return er === 'forfeit' ? 'Aufgegeben' : er === 'disconnect' ? 'Verbindung weg' : 'Spielende';
  }
  resultTitle(): string {
    const m = this.match();
    const h = this.hud();
    if (!m || !h) return '';
    const s = m.slot;
    if (h.w < 0) return 'Abgebrochen';
    if (s < 0) return `${m.names[h.w]} gewinnt!`;
    if (h.w === s) return h.er === 'score' ? 'Gewonnen!' : `${m.names[1 - s]} ist raus – Sieg!`;
    return m.cpu ? 'Die Nervbox gewinnt.' : `${m.names[h.w]} gewinnt.`;
  }
  rematchInfo(): string {
    const m = this.match();
    const h = this.hud();
    if (!m || !h || m.slot < 0) return '';
    const op = 1 - m.slot;
    if (h.l[op]) return `${m.names[op]} hat das Spiel verlassen.`;
    if (h.r[op]) return `${m.names[op]} will Revanche!`;
    if (h.r[m.slot]) return `Warte auf ${m.names[op]}…`;
    return m.stake > 0 ? `Revanche kostet wieder ${m.stake} N$ Einsatz.` : '';
  }
}
