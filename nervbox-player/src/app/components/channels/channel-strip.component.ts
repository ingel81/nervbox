import { Component, ChangeDetectionStrategy, computed, inject, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
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
}

/**
 * Kanalzüge unten am Gerät: jeder gerade laufende Sound bekommt einen Kanal
 * (eigener = grün, fremde = eisblau). Daneben „Nochmal“ und – nur für Admins –
 * „Alle stoppen“ hinter der Schutzklappe.
 * Die Pegelkette ist Deko (der Server liefert keinen echten Pegel).
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
      width: 90px;
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

  readonly again = output<void>();
  readonly killAll = output<void>();

  readonly total = CHANNEL_COUNT;
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  readonly busy = computed(() => Math.min(this.total, this.nowPlaying.channels().length));

  readonly view = computed<ChannelView[]>(() => {
    const now = this.nowPlaying.now();
    const list = this.nowPlaying.channels().slice(-this.total);
    return Array.from({ length: this.total }, (_, i) => {
      const c = list[i];
      return c ? this.toView(i + 1, c, now) : this.freeView(i + 1);
    });
  });

  private toView(n: number, c: PlayingChannel, now: number): ChannelView {
    const elapsed = Math.max(0, now - c.startedAt);
    const dur = c.durationMs || 0;
    const done = dur > 0 && elapsed >= dur;
    // Deko-Pegel: pseudozufällig im Takt, fällt nach Ende auf 0
    const level = done ? 0 : 3 + Math.round(Math.abs(Math.sin(elapsed / 170 + n * 1.7)) * 5);
    return {
      n,
      free: false,
      own: c.own,
      user: c.own ? 'Du' : c.userName,
      initials: this.initials(c.userName),
      sound: c.name,
      time: `${this.fmt(Math.min(elapsed, dur || elapsed))} / ${this.fmt(dur)}`,
      segs: this.segs(level),
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
