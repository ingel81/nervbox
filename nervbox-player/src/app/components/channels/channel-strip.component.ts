import { Component, ChangeDetectionStrategy, computed, inject, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import {
  CHANNEL_COUNT,
  NowPlayingService,
  PlayingChannel,
} from '../../core/services/now-playing.service';

interface ChannelView {
  n: number;
  free: boolean;
  own: boolean;
  user: string;
  initials: string;
  sound: string;
  time: string;
  segs: string[];
  fx: string | null;
  channel: PlayingChannel | null;
  canStop: boolean;
}

const FX_LABEL: Record<string, string> = {
  'pitch-up': 'Hoch',
  'pitch-down': 'Tief',
  reverse: 'Rück',
  echo: 'Echo',
  reverb: 'Hall',
  telephone: 'Tel',
};

const VU_SEGS = 12;

/**
 * Kanalzüge unten am Gerät: jeder gerade laufende Sound bekommt einen Kanal
 * (eigener = grün, fremde = eisblau). Daneben „Nochmal“ und – nur für Admins –
 * „Alle stoppen“ hinter der Schutzklappe. Eigene Sounds (Admins: alle) haben eine Stopp-Taste.
 * Pegel: echt (Pi-Mixer „mixLevel“ bzw. Web-Audio-Analyser im Browser-Modus); nur wenn keine
 * Pegeldaten kommen (Pi ohne Mixer), läuft die alte Deko-Pegelkette.
 */
@Component({
  selector: 'app-channel-strip',
  standalone: true,
  imports: [MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="nk-foot strip" aria-label="Läuft gerade">
      <div class="strip-count">
        <span class="nk-label">Kanäle · läuft</span>
        <span class="nk-counter" [attr.aria-label]="busy() + ' von ' + total + ' Kanälen laufen'"
          >{{ busy() }} / {{ total }}</span
        >
        <span
          class="nk-vu"
          role="meter"
          aria-label="Summenpegel"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="masterPct()"
          matTooltip="Summenpegel · LIM leuchtet, wenn der Limiter eingreift"
        >
          <span class="nk-vu__bar" aria-hidden="true">
            @for (s of masterSegs(); track $index) {
              <span [class]="s"></span>
            }
          </span>
          <span
            [class]="nowPlaying.meter().limiting ? 'nk-vu__lim nk-vu__lim--on' : 'nk-vu__lim'"
            aria-hidden="true"
            >LIM</span
          >
        </span>
      </div>
      <div class="strip-channels">
        @for (c of view(); track c.n) {
          <div
            [class]="
              c.free
                ? 'nk-channel'
                : c.own
                  ? 'nk-channel nk-channel--own'
                  : 'nk-channel nk-channel--other'
            "
          >
            <span class="nk-channel__meter" aria-hidden="true">
              <span class="nk-meter">
                @for (s of c.segs; track $index) {
                  <span [class]="s"></span>
                }
              </span>
              <span class="nk-meter nk-meter--refl">
                @for (s of c.segs; track $index) {
                  <span [class]="s"></span>
                }
              </span>
            </span>
            <div class="nk-channel__body">
              <span class="nk-channel__head">
                <span class="nk-channel__num">{{ c.n }}</span>
                <span
                  [class]="
                    c.free
                      ? 'nk-avatar nk-avatar--free'
                      : c.own
                        ? 'nk-avatar nk-avatar--own'
                        : 'nk-avatar nk-avatar--other'
                  "
                  >{{ c.initials }}</span
                >
                <span class="nk-channel__user">{{ c.user }}</span>
                @if (c.fx) {
                  <span class="nk-channel__fx">{{ c.fx }}</span>
                }
                @if (c.canStop && c.channel) {
                  <button
                    type="button"
                    class="nk-channel__stop"
                    [attr.aria-label]="c.sound + ' stoppen'"
                    [matTooltip]="
                      c.own ? 'Diesen Sound stoppen' : 'Sound von ' + c.user + ' stoppen'
                    "
                    (click)="stop(c.channel)"
                  >
                    ■
                  </button>
                }
              </span>
              <span class="nk-channel__strip">{{ c.sound }}</span>
              <span class="nk-channel__time">{{ c.time }}</span>
            </div>
          </div>
        }
      </div>
      @if (auth.isLoggedIn()) {
        <button
          type="button"
          class="nk-key nk-key--lg strip-again"
          [disabled]="!nowPlaying.lastOwnHash()"
          matTooltip="Letzten eigenen Sound nochmal spielen"
          (click)="again.emit()"
        >
          ↻ NOCHMAL
        </button>
      }
      @if (isAdmin()) {
        <div class="nk-guard strip-guard">
          <span class="nk-guard__label">NUR ADMIN</span>
          <button
            type="button"
            class="nk-key nk-key--danger"
            matTooltip="Alle laufenden Sounds stoppen"
            (click)="killAll.emit()"
          >
            ■ ALLE STOPPEN
          </button>
        </div>
      }
    </footer>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
    .strip-count {
      width: 96px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
      align-items: flex-start;
    }
    .strip-channels {
      flex: 1;
      min-width: 0;
      display: flex;
      gap: 8px;
    }
    .strip-again {
      margin: 0 2px;
    }
    .strip-guard {
      margin-right: 6px;
    }
    @media (max-width: 1400px) {
      .strip-channels .nk-channel:nth-child(n + 7) {
        display: none;
      }
    }
  `,
})
export class ChannelStripComponent {
  readonly auth = inject(AuthService);
  readonly nowPlaying = inject(NowPlayingService);
  private readonly snackBar = inject(MatSnackBar);

  readonly again = output<void>();
  readonly killAll = output<void>();

  readonly total = CHANNEL_COUNT;
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  readonly busy = computed(() =>
    Math.min(this.total, this.nowPlaying.channels().filter((c) => !c.endedAt).length),
  );

  /** Summenpegel −36…0 dBFS in 12 Segmenten (3 dB je Segment) */
  readonly masterSegs = computed(() => {
    const lit = this.dbSegments(this.nowPlaying.meter().master, VU_SEGS, 3);
    return Array.from({ length: VU_SEGS }, (_, i) =>
      i < lit
        ? i < 8
          ? 'nk-vu__seg nk-vu__seg--g'
          : i < 11
            ? 'nk-vu__seg nk-vu__seg--y'
            : 'nk-vu__seg nk-vu__seg--r'
        : 'nk-vu__seg',
    );
  });
  readonly masterPct = computed(() => Math.round(this.nowPlaying.meter().master * 100));

  readonly view = computed<ChannelView[]>(() => {
    const now = this.nowPlaying.now();
    const meter = this.nowPlaying.meter();
    const list = this.nowPlaying.channels().slice(-this.total);
    return Array.from({ length: this.total }, (_, i) => {
      const c = list[i];
      return c
        ? this.toView(i + 1, c, now, meter.live ? meter.voices : null)
        : this.freeView(i + 1);
    });
  });

  stop(c: PlayingChannel): void {
    this.nowPlaying.stop(c, (msg) => this.snackBar.open(msg, 'OK', { duration: 3000 }));
  }

  /** linearer Pegel → Anzahl leuchtender Segmente (dbPerSeg dB je Segment, oberstes = 0 dBFS) */
  private dbSegments(level: number, segs: number, dbPerSeg: number): number {
    if (level <= 0) return 0;
    const db = 20 * Math.log10(level);
    return Math.max(0, Math.min(segs, Math.ceil((db + segs * dbPerSeg) / dbPerSeg)));
  }

  private toView(
    n: number,
    c: PlayingChannel,
    now: number,
    levels: Map<number, number> | null,
  ): ChannelView {
    const elapsed = Math.max(0, (c.endedAt ?? now) - c.startedAt);
    const dur = c.durationMs || 0;
    const done = !!c.endedAt || (dur > 0 && elapsed >= dur);
    // echter Pegel (−48…0 dBFS, 6 dB je Segment); ohne Pegeldaten Deko im Takt
    const level =
      levels && c.voiceId
        ? this.dbSegments(levels.get(c.voiceId) ?? 0, 8, 6)
        : done
          ? 0
          : 3 + Math.round(Math.abs(Math.sin(elapsed / 170 + n * 1.7)) * 5);
    return {
      n,
      free: false,
      own: c.own,
      user: c.own ? 'Du' : c.userName,
      initials: this.initials(c.userName),
      sound: c.name,
      time: c.endedAt
        ? 'Ende'
        : `${this.fmt(Math.min(elapsed, dur || elapsed))} / ${this.fmt(dur)}`,
      segs: this.segs(level),
      fx: c.effect ? (FX_LABEL[c.effect] ?? null) : null,
      channel: c,
      canStop: this.nowPlaying.canStop(c),
    };
  }

  private freeView(n: number): ChannelView {
    return {
      n,
      free: true,
      own: false,
      user: 'frei',
      initials: '',
      sound: '—',
      time: 'kein Signal',
      segs: this.segs(0),
      fx: null,
      channel: null,
      canStop: false,
    };
  }

  private segs(level: number): string[] {
    return Array.from({ length: 8 }, (_, i) =>
      i < level
        ? i < 5
          ? 'nk-meter__seg nk-meter__seg--g'
          : i < 7
            ? 'nk-meter__seg nk-meter__seg--y'
            : 'nk-meter__seg nk-meter__seg--r'
        : 'nk-meter__seg',
    );
  }

  private initials(name: string): string {
    return (
      (name || '?')
        .replace(/[^A-Za-zÄÖÜäöü0-9]/g, '')
        .slice(0, 2)
        .toUpperCase() || '?'
    );
  }

  private fmt(ms: number): string {
    const t = Math.floor((ms || 0) / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
}
