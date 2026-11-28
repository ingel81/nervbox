import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { HttpErrorResponse } from '@angular/common/http';

import { ApiService } from '../../../../core/services/api.service';
import { CreditService } from '../../../../core/services/credit.service';
import { SoundService } from '../../../../core/services/sound.service';
import { GameExitConfirmComponent } from '../../game-exit-confirm.component';
import { GameFrameComponent, GameStat } from '../../game-frame.component';
import { GAME_INFO } from '../../game-info';
import { RouletteAudio } from './roulette-audio';
import { RouletteWheel } from './roulette-wheel';
import {
  BetType,
  CHIP_VALUES,
  MAX_TOTAL_BET,
  RouletteBet,
  RouletteColor,
  RouletteSpinResponse,
  betKey,
  betLabel,
  colorOf,
  oddsLabel,
  payoutFactor,
} from './roulette.types';

/** Ein Feld des Tableaus mit Rasterposition fuer beide Ausrichtungen */
interface TableCell {
  key: string;
  type: BetType;
  value: number;
  label: string;
  color: RouletteColor | 'out';
  /** quer (Desktop): [Zeile, Spalte, Zeilenspanne, Spaltenspanne] */
  h: [number, number, number, number];
  /** hochkant (Handy) */
  v: [number, number, number, number];
  /** Text im Hochformat drehen (schmale Seitenspalten) */
  vertText?: boolean;
}

interface SoundLabel {
  hash: string;
  name: string;
}

const HISTORY_KEY = 'nervbox-roulette-history';
const SOUND_KEY = 'nervbox-roulette-sound';

function buildCells(): TableCell[] {
  const cells: TableCell[] = [];
  cells.push({
    key: betKey('straight', 0),
    type: 'straight',
    value: 0,
    label: '0',
    color: 'green',
    h: [1, 1, 3, 1],
    v: [1, 3, 1, 3],
  });
  for (let n = 1; n <= 36; n++) {
    const i = n - 1;
    cells.push({
      key: betKey('straight', n),
      type: 'straight',
      value: n,
      label: String(n),
      color: colorOf(n),
      h: [3 - (i % 3), 2 + Math.floor(i / 3), 1, 1],
      v: [2 + Math.floor(i / 3), 3 + (i % 3), 1, 1],
    });
  }
  for (let c = 1; c <= 3; c++) {
    cells.push({
      key: betKey('column', c),
      type: 'column',
      value: c,
      label: '2:1',
      color: 'out',
      h: [4 - c, 14, 1, 1],
      v: [14, 2 + c, 1, 1],
    });
  }
  for (let d = 1; d <= 3; d++) {
    cells.push({
      key: betKey('dozen', d),
      type: 'dozen',
      value: d,
      label: `${d}. DUTZEND`,
      color: 'out',
      h: [4, 2 + (d - 1) * 4, 1, 4],
      v: [2 + (d - 1) * 4, 2, 4, 1],
      vertText: true,
    });
  }
  const outside: [BetType, string, RouletteColor | 'out'][] = [
    ['low', '1–18', 'out'],
    ['even', 'GERADE', 'out'],
    ['red', 'ROT', 'red'],
    ['black', 'SCHWARZ', 'black'],
    ['odd', 'UNGERADE', 'out'],
    ['high', '19–36', 'out'],
  ];
  outside.forEach(([type, label, color], i) => {
    cells.push({
      key: betKey(type, 0),
      type,
      value: 0,
      label,
      color,
      h: [5, 2 + i * 2, 1, 2],
      v: [2 + i * 2, 1, 2, 1],
      vertText: true,
    });
  });
  return cells;
}

@Component({
  selector: 'app-roulette-game',
  standalone: true,
  imports: [MatIconModule, GameFrameComponent, GameExitConfirmComponent],
  templateUrl: './roulette-game.component.html',
  styleUrls: ['./roulette-game.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouletteGameComponent implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<RouletteGameComponent>);
  private readonly api = inject(ApiService);
  readonly creditService = inject(CreditService);
  private readonly soundService = inject(SoundService);

  readonly info = GAME_INFO.roulette;
  readonly chips = CHIP_VALUES;
  readonly maxTotal = MAX_TOTAL_BET;
  readonly cells = buildCells();
  readonly colorOf = colorOf;

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('wheelCanvas');
  private readonly wheelBoxRef = viewChild.required<ElementRef<HTMLElement>>('wheelBox');
  private readonly audio = new RouletteAudio();
  private wheel?: RouletteWheel;
  private mq?: MediaQueryList;
  private readonly onMq = (): void => this.vertical.set(!!this.mq?.matches);

  // --- Zustand
  readonly phase = signal<'idle' | 'spinning'>('idle');
  readonly selectedChip = signal(10);
  /** aktuelle Einsaetze je Feld (key -> Betrag) */
  readonly bets = signal<Record<string, number>>({});
  /** Reihenfolge der gesetzten Chips (Rueckgaengig) */
  private undoStack: { key: string; amount: number }[] = [];
  private lastSpunBets: Record<string, number> = {};
  readonly hasLastBets = signal(false);
  readonly history = signal<number[]>(this.loadHistory());
  readonly lastResult = signal<{
    number: number;
    color: RouletteColor;
    payout: number;
    net: number;
    totalBet: number;
  } | null>(null);
  /** Felder, die im letzten Dreh gewonnen haben (Markierung bis zur naechsten Aenderung) */
  readonly wonKeys = signal<ReadonlySet<string>>(new Set());
  readonly resultShown = signal(false);
  readonly hovered = signal<TableCell | null>(null);
  readonly message = signal('');
  readonly soundOn = signal(this.loadSoundPref());
  readonly vertical = signal(false);
  readonly celebrate = signal<'none' | 'win' | 'big'>('none');
  private readonly frozenBalance = signal<number | null>(null);
  private celebrateTimer = 0;

  // --- Abgeleitet
  readonly balance = computed(() => this.frozenBalance() ?? this.creditService.credits());
  readonly totalBet = computed(() => Object.values(this.bets()).reduce((a, b) => a + b, 0));
  readonly canSpin = computed(
    () =>
      this.phase() === 'idle' &&
      this.totalBet() > 0 &&
      this.totalBet() <= MAX_TOTAL_BET &&
      this.totalBet() <= this.creditService.credits(),
  );

  /** 37 beliebteste Sounds (playCount), Zahl n -> Sound */
  readonly soundLabels = computed<SoundLabel[]>(() => {
    const list = this.soundService
      .sounds()
      .filter((s) => s.enabled !== false)
      .slice()
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 37);
    return list.map((s) => ({ hash: s.hash, name: s.name }));
  });

  readonly stats = computed<GameStat[]>(() => {
    const r = this.lastResult();
    const shown = this.resultShown();
    return [
      { label: 'GUTHABEN N$', value: this.balance() },
      { label: 'EINSATZ N$', value: this.totalBet() },
      { label: 'ZAHL', value: r && shown ? r.number : '--' },
      {
        label: 'GEWINN N$',
        value: r && shown ? (r.net > 0 ? '+' + r.net : r.net) : '--',
        tone: r && shown && r.net < 0 ? 'neg' : undefined,
      },
    ];
  });

  /** Heisse/kalte Zahlen aus dem lokalen Verlauf (ab 10 Drehs) */
  readonly hotCold = computed(() => {
    const h = this.history();
    if (h.length < 10) return null;
    const counts = new Array<number>(37).fill(0);
    for (const n of h) counts[n]++;
    const order = counts.map((c, n) => ({ n, c })).sort((a, b) => b.c - a.c || a.n - b.n);
    const hot = order.slice(0, 4).map((x) => x.n);
    const cold = order
      .slice()
      .sort((a, b) => a.c - b.c || a.n - b.n)
      .slice(0, 4)
      .map((x) => x.n);
    return { hot, cold, spins: h.length };
  });

  readonly recent = computed(() => this.history().slice(0, 14));

  /** Infozeile: Feld unter dem Zeiger oder letztes Ergebnis */
  readonly infoLine = computed(() => {
    const c = this.hovered();
    if (c) {
      const amount = this.bets()[c.key] ?? 0;
      const sound = c.type === 'straight' ? this.soundLabels()[c.value]?.name : '';
      return {
        title: betLabel(c.type, c.value) + ` · ${oddsLabel(c.type)}`,
        sub: sound ? `♪ ${sound}` : this.outsideHint(c),
        amount,
      };
    }
    return null;
  });

  constructor() {
    this.audio.muted = !this.soundOn();
    if (!this.soundService.sounds().length) {
      this.soundService.loadSounds().subscribe({ error: () => undefined });
    }
    effect(() => {
      const labels = this.soundLabels();
      this.wheel?.setLabels(labels.map((l) => l.name));
    });
  }

  ngAfterViewInit(): void {
    this.wheel = new RouletteWheel(this.canvasRef().nativeElement, this.audio);
    this.wheel.setLabels(this.soundLabels().map((l) => l.name));
    // Kugel liegt im zuletzt gefallenen Fach
    const h = this.history();
    if (h.length) this.wheel.placeBall(h[0]);
    this.mq = window.matchMedia('(max-width: 640px)');
    this.mq.addEventListener('change', this.onMq);
    this.onMq();
  }

  ngOnDestroy(): void {
    this.mq?.removeEventListener('change', this.onMq);
    clearTimeout(this.celebrateTimer);
    this.wheel?.destroy();
    this.audio.dispose();
  }

  // ---------------------------------------------------------------------------
  // Setzen

  selectChip(v: number): void {
    this.selectedChip.set(v);
    this.audio.unlock();
    this.audio.chip();
  }

  place(cell: TableCell, event?: MouseEvent): void {
    if (this.phase() !== 'idle') return;
    this.audio.unlock();
    this.clearResultMarks();
    const chip = this.selectedChip();
    const room = Math.min(MAX_TOTAL_BET, this.creditService.credits()) - this.totalBet();
    if (room <= 0) {
      this.flash(
        this.totalBet() >= MAX_TOTAL_BET
          ? `Tischlimit erreicht: max. ${MAX_TOTAL_BET} N$ pro Dreh`
          : 'Nicht genug N$ für weitere Chips',
      );
      return;
    }
    const amount = Math.min(chip, room);
    this.bets.update((b) => ({ ...b, [cell.key]: (b[cell.key] ?? 0) + amount }));
    this.undoStack.push({ key: cell.key, amount });
    this.audio.chip();
    event?.preventDefault();
  }

  /** Rechtsklick: Chip vom Feld nehmen */
  removeFrom(cell: TableCell, event: MouseEvent): void {
    event.preventDefault();
    if (this.phase() !== 'idle') return;
    const cur = this.bets()[cell.key];
    if (!cur) return;
    this.clearResultMarks();
    const take = Math.min(cur, this.selectedChip());
    this.bets.update((b) => {
      const next = { ...b };
      if (cur - take > 0) next[cell.key] = cur - take;
      else delete next[cell.key];
      return next;
    });
    this.audio.chip();
  }

  undo(): void {
    if (this.phase() !== 'idle') return;
    const last = this.undoStack.pop();
    if (!last) return;
    this.clearResultMarks();
    this.bets.update((b) => {
      const next = { ...b };
      const v = (next[last.key] ?? 0) - last.amount;
      if (v > 0) next[last.key] = v;
      else delete next[last.key];
      return next;
    });
    this.audio.chip();
  }

  clearBets(): void {
    if (this.phase() !== 'idle') return;
    this.bets.set({});
    this.undoStack = [];
    this.clearResultMarks();
  }

  repeatLast(): void {
    if (this.phase() !== 'idle' || !this.hasLastBets()) return;
    const total = Object.values(this.lastSpunBets).reduce((a, b) => a + b, 0);
    if (total > this.creditService.credits()) {
      this.flash('Nicht genug N$, um den letzten Einsatz zu wiederholen');
      return;
    }
    this.bets.set({ ...this.lastSpunBets });
    this.undoStack = Object.entries(this.lastSpunBets).map(([key, amount]) => ({ key, amount }));
    this.clearResultMarks();
    this.audio.unlock();
    this.audio.chip();
  }

  doubleBets(): void {
    if (this.phase() !== 'idle') return;
    const total = this.totalBet();
    if (!total) return;
    if (total * 2 > MAX_TOTAL_BET) {
      this.flash(`Verdoppeln geht nicht: max. ${MAX_TOTAL_BET} N$ pro Dreh`);
      return;
    }
    if (total * 2 > this.creditService.credits()) {
      this.flash('Nicht genug N$ zum Verdoppeln');
      return;
    }
    const doubled = Object.fromEntries(Object.entries(this.bets()).map(([k, v]) => [k, v * 2]));
    for (const [key, amount] of Object.entries(this.bets())) this.undoStack.push({ key, amount });
    this.bets.set(doubled);
    this.clearResultMarks();
    this.audio.chip();
  }

  // ---------------------------------------------------------------------------
  // Drehen

  spin(): void {
    if (!this.canSpin() || !this.wheel) return;
    this.audio.unlock();
    const bets = this.bets();
    const payload: RouletteBet[] = Object.entries(bets).map(([key, amount]) => {
      const [type, value] = key.split(':');
      return { type: type as BetType, value: Number(value), amount };
    });
    const total = this.totalBet();
    this.clearResultMarks();
    this.resultShown.set(false);
    this.message.set('');
    this.phase.set('spinning');
    this.frozenBalance.set(this.creditService.credits() - total);
    this.wheel.boost();
    if (this.vertical()) {
      this.wheelBoxRef().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    this.api.post<RouletteSpinResponse>('/casino/roulette/spin', { bets: payload }).subscribe({
      next: (res) => {
        this.lastSpunBets = { ...bets };
        this.hasLastBets.set(true);
        // Stand nach Abbuchung, vor Gutschrift (SignalR kann credits() schon aktualisiert haben)
        this.frozenBalance.set(Math.max(0, res.newBalance - res.payout));
        this.wheel!.spinTo(res.number, () => this.onLanded(res));
      },
      error: (err: HttpErrorResponse) => {
        this.phase.set('idle');
        this.frozenBalance.set(null);
        const msg = (err.error && (err.error.error || err.error.Error)) || 'Dreh fehlgeschlagen';
        this.flash(String(msg));
        this.creditService.loadCredits();
      },
    });
  }

  private onLanded(res: RouletteSpinResponse): void {
    this.phase.set('idle');
    this.frozenBalance.set(null);
    this.creditService.credits.set(res.newBalance);
    this.lastResult.set({
      number: res.number,
      color: res.color,
      payout: res.payout,
      net: res.net,
      totalBet: res.totalBet,
    });
    this.resultShown.set(true);
    const won = new Set<string>();
    for (const b of res.bets) if (b.won) won.add(betKey(b.type, b.value));
    this.wonKeys.set(won);

    this.history.update((h) => [res.number, ...h].slice(0, 100));
    this.saveHistory();

    // Nervbox-Sound des Fachs (nur im Browser)
    const sound = this.soundLabels()[res.number];
    if (sound && this.soundOn()) this.soundService.playInBrowser(sound.hash);

    if (res.net > 0) {
      const straightHit = res.bets.some((b) => b.won && b.type === 'straight');
      const big = straightHit || res.payout >= res.totalBet * 5;
      this.celebrate.set(big ? 'big' : 'win');
      this.wheel?.celebrate(big);
      this.audio.win(big);
      clearTimeout(this.celebrateTimer);
      this.celebrateTimer = window.setTimeout(() => this.celebrate.set('none'), big ? 4200 : 2800);
    }
  }

  // ---------------------------------------------------------------------------
  // Anzeige-Helfer

  chipsOn(key: string): number {
    return this.bets()[key] ?? 0;
  }

  chipTone(amount: number): string {
    if (amount >= 100) return 'c100';
    if (amount >= 50) return 'c50';
    if (amount >= 10) return 'c10';
    return 'c5';
  }

  cellStyle(c: TableCell): string {
    const [r, col, rs, cs] = this.vertical() ? c.v : c.h;
    return `grid-row:${r} / span ${rs};grid-column:${col} / span ${cs}`;
  }

  isWinningCell(c: TableCell): boolean {
    const r = this.lastResult();
    if (!r || !this.resultShown()) return false;
    return payoutFactor(c.type, c.value, r.number) > 0;
  }

  soundName(n: number): string {
    return this.soundLabels()[n]?.name ?? '';
  }

  cellAria(c: TableCell): string {
    const sound = c.type === 'straight' ? this.soundName(c.value) : '';
    const amount = this.chipsOn(c.key);
    return (
      `${betLabel(c.type, c.value)}, Quote ${oddsLabel(c.type)}` +
      (sound ? `, Sound ${sound}` : '') +
      (amount ? `, gesetzt ${amount} N$` : '')
    );
  }

  colorWord(c: RouletteColor): string {
    return c === 'red' ? 'ROT' : c === 'black' ? 'SCHWARZ' : 'NULL';
  }

  toggleSound(): void {
    this.soundOn.update((v) => !v);
    this.audio.muted = !this.soundOn();
    try {
      localStorage.setItem(SOUND_KEY, this.soundOn() ? '1' : '0');
    } catch {
      /* egal */
    }
  }

  exitHint(): string {
    return this.phase() === 'spinning'
      ? 'Die Kugel rollt bereits: dein Einsatz ist abgebucht, ein Gewinn wird dir trotzdem gutgeschrieben.'
      : this.totalBet() > 0
        ? 'Deine gesetzten Chips sind noch nicht gespielt und werden nicht abgebucht.'
        : 'Es läuft kein Dreh, es geht nichts verloren.';
  }

  pauseWheel(): void {
    this.wheel?.pause();
  }

  resumeWheel(): void {
    this.wheel?.resume();
  }

  exitGame(): void {
    // Ergebnis ist serverseitig schon gebucht; Guthaben kommt per SignalR/Antwort
    if (this.phase() === 'spinning') this.creditService.loadCredits();
    this.dialogRef.close();
  }

  private outsideHint(c: TableCell): string {
    switch (c.type) {
      case 'dozen':
        return `${(c.value - 1) * 12 + 1}–${c.value * 12}`;
      case 'column':
        return `${c.value}, ${c.value + 3}, ${c.value + 6} … ${c.value + 33}`;
      default:
        return 'Null verliert';
    }
  }

  private clearResultMarks(): void {
    if (this.wonKeys().size) this.wonKeys.set(new Set());
  }

  private flashTimer = 0;
  private flash(msg: string): void {
    this.message.set(msg);
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.message.set(''), 3200);
  }

  private loadHistory(): number[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr)
        ? arr.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 36).slice(0, 100)
        : [];
    } catch {
      return [];
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history()));
    } catch {
      /* egal */
    }
  }

  private loadSoundPref(): boolean {
    try {
      return localStorage.getItem(SOUND_KEY) !== '0';
    } catch {
      return true;
    }
  }
}
