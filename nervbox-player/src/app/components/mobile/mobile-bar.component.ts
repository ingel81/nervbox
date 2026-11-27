import { Component, ChangeDetectionStrategy, computed, inject, input, output, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { NowPlayingService, CHANNEL_COUNT } from '../../core/services/now-playing.service';
import { ShopDialogComponent } from '../shop/shop-dialog.component';

export type MobileView = 'sounds' | 'chat';
export type MobileAction =
  | 'stats'
  | 'selection'
  | 'mixer'
  | 'profile'
  | 'avatar'
  | 'upload'
  | 'password'
  | 'tour'
  | 'logout'
  | 'login'
  | 'admin-users'
  | 'admin-tags'
  | 'admin-wizard'
  | 'admin-credits'
  | 'kill-all';

interface MenuItem {
  action: MobileAction;
  label: string;
  icon: string;
  danger?: boolean;
}

/**
 * Taschen-Sampler (≤ 768 px): Laufend-Leiste + untere Tastenreihe
 * (Sounds · Chat · Spielhalle · Shop · Mehr). „Mehr“ öffnet eine Rauchglas-Tafel
 * mit allen Funktionen, die am Desktop in Funktionstasten und Menüs stecken.
 */
@Component({
  selector: 'app-mobile-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (moreOpen()) {
      <div class="mb-scrim" (click)="moreOpen.set(false)" aria-hidden="true"></div>
      <div class="mb-sheet" role="menu" aria-label="Mehr">
        @for (group of groups(); track group.title) {
          <div class="nk-menu mb-group">
            <span class="nk-menu__head">{{ group.title }}</span>
            @for (it of group.items; track it.action) {
              <button type="button" role="menuitem" [class]="it.danger ? 'nk-menu__item nk-menu__item--danger' : 'nk-menu__item'" (click)="pick(it.action)">
                <svg class="nk-menu__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="it.icon"></path></svg>
                {{ it.label }}
              </button>
            }
          </div>
        }
      </div>
    }

    <div class="mb-live" [attr.aria-label]="'Läuft gerade: ' + channels().length + ' Sounds'">
      <span class="nk-counter mb-count">{{ busy() }}/{{ total }}</span>
      <div class="mb-chans">
        @for (c of channels(); track c.id) {
          <span [class]="c.own ? 'mb-chan mb-chan--own' : 'mb-chan mb-chan--other'">
            <span [class]="c.own ? 'nk-avatar nk-avatar--xs nk-avatar--own' : 'nk-avatar nk-avatar--xs nk-avatar--other'">{{ initials(c.userName) }}</span>{{ c.name }}
          </span>
        } @empty {
          <span class="mb-idle">kein Signal</span>
        }
      </div>
      @if (auth.isLoggedIn()) {
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Letzten Sound nochmal spielen" [disabled]="!nowPlaying.lastOwnHash()" (click)="again.emit()">↻</button>
      }
      @if (isAdmin()) {
        <button type="button" class="nk-key nk-key--sm nk-key--icon nk-key--danger" aria-label="Alle Sounds stoppen (nur Admin)" (click)="action.emit('kill-all')">■</button>
      }
    </div>

    <nav class="mb-nav" aria-label="Hauptnavigation">
      <button type="button" [class]="view() === 'sounds' && !moreOpen() ? 'nk-key nk-key--on' : 'nk-key'" [attr.aria-current]="view() === 'sounds' ? 'page' : null" (click)="go('sounds')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"></path></svg>SOUNDS
      </button>
      <button type="button" [class]="view() === 'chat' && !moreOpen() ? 'nk-key nk-key--on' : 'nk-key'" [attr.aria-current]="view() === 'chat' ? 'page' : null" (click)="go('chat')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"></path></svg>CHAT
      </button>
      <button type="button" class="nk-key" [disabled]="!auth.isLoggedIn()" (click)="openGames()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 8h12a4 4 0 014 4v1a4 4 0 01-4 4H6a4 4 0 01-4-4v-1a4 4 0 014-4zM7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"></path></svg>SPIELHALLE
      </button>
      <button type="button" class="nk-key" [disabled]="!auth.isLoggedIn()" (click)="openShop()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 016 0v2"></path></svg>SHOP
      </button>
      <button type="button" [class]="moreOpen() ? 'nk-key nk-key--on' : 'nk-key'" [attr.aria-expanded]="moreOpen()" (click)="moreOpen.set(!moreOpen())">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"></path></svg>MEHR
      </button>
    </nav>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }
    .mb-live {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 6px 8px;
      border-radius: 8px;
      background: rgb(0 0 0 / 0.24);
      box-shadow: inset 1px 2px 5px rgb(0 0 0 / 0.6), 1px 1px 0 rgb(255 226 176 / 0.12);
    }
    .mb-count {
      margin: 0;
      height: 22px;
      font-size: 18px;
      padding: 0 6px;
    }
    .mb-chans {
      flex: 1;
      min-width: 0;
      display: flex;
      gap: 5px;
      overflow: hidden;
      mask-image: linear-gradient(90deg, #000 80%, transparent);
    }
    .mb-chan {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 6px 0 3px;
      border-radius: 12px;
      font: 600 11px/1 var(--nk-font-mono);
      white-space: nowrap;
    }
    .mb-chan--own {
      background: var(--nk-own-deep);
      color: var(--nk-own-mid);
      box-shadow: inset 0 0 0 1px rgb(75 229 133 / 0.6);
    }
    .mb-chan--other {
      background: var(--nk-other-deep);
      color: var(--nk-other-mid);
      box-shadow: inset 0 0 0 1px rgb(111 203 255 / 0.55);
    }
    .mb-idle {
      font: 500 11px var(--nk-font-mono);
      color: var(--nk-iv-2);
      align-self: center;
    }
    .mb-nav {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 9px;
      padding: 4px 4px 2px;
    }
    .mb-nav .nk-key {
      height: 46px;
      flex-direction: column;
      gap: 3px;
      font-size: 10.5px;
      letter-spacing: 0.8px;
      padding: 0;
    }
    .mb-scrim {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: rgb(8 6 5 / 0.6);
    }
    .mb-sheet {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 150px;
      z-index: 51;
      max-height: calc(100dvh - 180px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .mb-group .nk-menu__item {
      height: 38px;
      font-size: 16px;
    }
  `,
})
export class MobileBarComponent {
  readonly auth = inject(AuthService);
  readonly nowPlaying = inject(NowPlayingService);
  private readonly dialog = inject(MatDialog);

  readonly view = input<MobileView>('sounds');
  readonly viewChange = output<MobileView>();
  readonly action = output<MobileAction>();
  readonly again = output<void>();

  readonly moreOpen = signal(false);
  readonly total = CHANNEL_COUNT;
  readonly channels = this.nowPlaying.channels;
  readonly busy = computed(() => Math.min(this.total, this.channels().length));
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  private readonly I = {
    stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    select: 'M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8',
    mixer: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
    img: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5',
    up: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    key: 'M14 10a4 4 0 10-3.5 4L4 20.5V22h3v-2h2v-2h2l1.5-1.5',
    tour: 'M12 3a9 9 0 110 18 9 9 0 010-18zM15.5 8.5l-2 5-5 2 2-5z',
    out: 'M10 4H4v16h6M14 8l4 4-4 4M18 12H9',
    login: 'M14 4h6v16h-6M10 8l4 4-4 4M14 12H3',
    users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 100-6M21 20c0-3-2-5.4-4.5-5.9',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
    wand: 'M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
    coins: 'M5 8a7 3 0 1014 0 7 3 0 10-14 0zM5 8v8c0 1.7 3 3 7 3s7-1.3 7-3V8',
    stop: 'M6 6h12v12H6z',
  };

  readonly groups = computed(() => {
    const I = this.I;
    const nervbox: MenuItem[] = [
      { action: 'stats', label: 'Statistiken', icon: I.stats },
      { action: 'selection', label: 'Auswahlmodus', icon: I.select },
      { action: 'mixer', label: 'Mixer', icon: I.mixer },
    ];
    const account: MenuItem[] = this.auth.isLoggedIn()
      ? [
          { action: 'profile', label: 'Mein Profil', icon: I.user },
          { action: 'avatar', label: 'Avatar ändern', icon: I.img },
          { action: 'upload', label: 'Sound hochladen', icon: I.up },
          { action: 'password', label: 'Kennwort ändern', icon: I.key },
          { action: 'tour', label: 'Tour starten', icon: I.tour },
          { action: 'logout', label: 'Abmelden', icon: I.out },
        ]
      : [{ action: 'login', label: 'Anmelden', icon: I.login }];
    const groups = [
      { title: 'Nervbox', items: nervbox },
      { title: 'Konto', items: account },
    ];
    if (this.isAdmin()) {
      groups.push({
        title: 'Admin',
        items: [
          { action: 'admin-users', label: 'Userverwaltung', icon: I.users },
          { action: 'admin-tags', label: 'Tag-Verwaltung', icon: I.tag },
          { action: 'admin-wizard', label: 'Tag-Wizard', icon: I.wand },
          { action: 'admin-credits', label: 'Shekel-Einstellungen', icon: I.coins },
          { action: 'kill-all', label: 'Alle Sounds stoppen', icon: I.stop, danger: true },
        ],
      });
    }
    return groups;
  });

  go(view: MobileView): void {
    this.moreOpen.set(false);
    this.viewChange.emit(view);
  }

  pick(a: MobileAction): void {
    this.moreOpen.set(false);
    this.action.emit(a);
  }

  async openGames(): Promise<void> {
    this.moreOpen.set(false);
    const { GameSelectionDialogComponent } = await import('../mini-games/game-selection-dialog.component');
    this.dialog.open(GameSelectionDialogComponent, { maxWidth: '95vw', panelClass: 'dark-dialog' });
  }

  openShop(): void {
    this.moreOpen.set(false);
    this.dialog.open(ShopDialogComponent, { maxWidth: '95vw', maxHeight: '92vh', panelClass: 'dark-dialog' });
  }

  initials(name: string): string {
    return (name || '?').replace(/[^A-Za-zÄÖÜäöü0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  }
}
