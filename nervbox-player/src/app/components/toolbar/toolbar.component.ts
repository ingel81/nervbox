import { Component, inject, output, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/services/auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { CreditService } from '../../core/services/credit.service';
import { LoudnessService } from '../../core/services/loudness.service';
import { AvatarService } from '../../core/services/avatar.service';
import { AchievementService } from '../../core/services/achievement.service';
import { InventoryService } from '../../core/services/inventory.service';
import { UserAvatarComponent } from '../shared/user-avatar/user-avatar.component';
import { LcdGlyphComponent } from '../shared/lcd-glyph/lcd-glyph.component';
import { ShekelPopoverComponent } from '../shared/shekel-popover/shekel-popover.component';
import { ShopDialogComponent } from '../shop/shop-dialog.component';

export type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'plays-desc'
  | 'newest'
  | 'duration-desc'
  | 'duration-asc'
  | 'votes-desc'
  | 'votes-asc'
  | 'random';

export const SORT_LABELS: Record<SortOption, string> = {
  'name-asc': 'Name A-Z',
  'name-desc': 'Name Z-A',
  'plays-desc': 'Meistgespielt',
  'votes-desc': 'Beste Bewertung',
  'votes-asc': 'Schlechteste Bewertung',
  newest: 'Neueste',
  'duration-desc': 'Längste',
  'duration-asc': 'Kürzeste',
  random: 'Zufall',
};

/** Drehknopf-Stellung je Sortierung (Grad) */
const KNOB_ANGLE: Record<SortOption, number> = {
  'name-asc': -120,
  'name-desc': -90,
  'plays-desc': -60,
  'votes-desc': -30,
  'votes-asc': 0,
  newest: 30,
  'duration-desc': 60,
  'duration-asc': 90,
  random: 120,
};

/**
 * Bedienleiste des Geräts (.nk-deck): Wortmarke, Suche, Sortier-Drehknopf, Favoriten-Schalter,
 * Zufall, Konto-LCD, Funktionstasten, Konto-Taste.
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    UserAvatarComponent,
    LcdGlyphComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="nk-deck deck">
      <!-- Wortmarke -->
      <div class="nk-logo logo">
        <span class="nk-logo__stripes" aria-hidden="true">
          <span class="nk-logo__stripe"></span
          ><span class="nk-logo__stripe nk-logo__stripe--2"></span
          ><span class="nk-logo__stripe nk-logo__stripe--3"></span
          ><span class="nk-logo__stripe nk-logo__stripe--4"></span
          ><span class="nk-logo__stripe nk-logo__stripe--5"></span>
        </span>
        <span class="nk-logo__word">NERVBOX</span>
        <span class="nk-logo__sub">30 JAHRE CABD · 1996–2026</span>
      </div>

      <!-- Suche -->
      <div class="nk-ctl search-container">
        <span class="nk-label">Suche</span>
        <label class="nk-input deck-search">
          <svg
            class="nk-input__icon"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
          <input
            class="nk-input__field"
            type="text"
            aria-label="Sound suchen"
            placeholder="Sound suchen …"
            [(ngModel)]="searchQuery"
            (input)="onSearchChange()"
            (keydown.escape)="clearSearch()"
          />
          <button
            type="button"
            class="nk-input__clear"
            aria-label="Suche leeren"
            matTooltip="Suche leeren"
            [disabled]="!searchQuery"
            (click)="clearSearch()"
          >
            ✕
          </button>
        </label>
      </div>

      <!-- Sortierung (Drehknopf) -->
      <div class="nk-ctl sort-container">
        <span class="nk-label">Sortierung</span>
        <button
          type="button"
          class="nk-select deck-sort"
          aria-haspopup="listbox"
          [attr.aria-label]="'Sortierung: ' + sortLabel()"
          [matMenuTriggerFor]="sortMenu"
          [style.--nk-knob-angle]="knobAngle()"
        >
          <span class="nk-select__knob" aria-hidden="true"></span>
          <span class="deck-sort__label">{{ sortLabel() }}</span>
          <span aria-hidden="true">▾</span>
        </button>
        <mat-menu #sortMenu="matMenu" class="nk-mat-menu">
          @for (opt of sortOptions; track opt) {
            <button
              mat-menu-item
              role="menuitemradio"
              [attr.aria-checked]="opt === currentSort()"
              (click)="onSortChange(opt)"
            >
              <span [class.deck-menu-current]="opt === currentSort()">{{ sortLabels[opt] }}</span>
            </button>
          }
        </mat-menu>
      </div>

      <!-- Nur Favoriten -->
      @if (auth.isLoggedIn()) {
        <div class="nk-ctl deck-fav">
          <span class="nk-label">Nur Favoriten</span>
          <button
            type="button"
            class="nk-switch deck-switch"
            role="switch"
            [attr.aria-checked]="showFavoritesOnly()"
            [attr.aria-label]="
              showFavoritesOnly() ? 'Alle Sounds anzeigen' : 'Nur Favoriten anzeigen'
            "
            [matTooltip]="showFavoritesOnly() ? 'Alle Sounds anzeigen' : 'Nur Favoriten anzeigen'"
            (click)="favoritesFilterToggle.emit()"
          >
            <span class="nk-switch__knob" aria-hidden="true"></span>♥
          </button>
        </div>
      }

      <!-- Zufall -->
      <div class="nk-ctl nk-ctl--center deck-random">
        <button
          type="button"
          class="nk-key nk-key--round"
          aria-label="Zufälligen Sound spielen"
          matTooltip="Zufälligen Sound spielen"
          (click)="randomClick.emit()"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="16" height="16" rx="3"></rect>
            <path
              d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01"
              stroke-width="3"
              stroke-linecap="round"
            ></path>
          </svg>
        </button>
        <span class="nk-label">Zufall</span>
      </div>

      <!-- Konto-LCD -->
      @if (auth.isLoggedIn()) {
        <div
          class="nk-lcd deck-lcd"
          [class.nk-lcd--low]="!creditService.canPlay()"
          role="group"
          aria-label="Konto"
        >
          <div class="nk-lcd__glass">
            <button
              type="button"
              class="nk-lcd__cell credit-display"
              [matTooltip]="creditService.walletTooltip()"
              matTooltipClass="nk-tip-multiline"
              (mouseenter)="creditService.refreshIfStale()"
              [attr.aria-label]="
                'Schekel-Funktionen öffnen, Kontostand ' + creditService.creditsFormatted() + ' N$'
              "
              (click)="openShekelPopover($event)"
            >
              <span class="nk-lcd__label">SCHEKEL (N$)</span>
              <span class="nk-lcd__value nk-lcd__value--glyph">
                <app-lcd-glyph kind="shekel" />
                <span class="nk-lcd__num">
                  <span class="nk-lcd__ghost" aria-hidden="true">{{
                    ghost(creditService.creditsFormatted())
                  }}</span>
                  <span class="nk-lcd__digits">{{ creditService.creditsFormatted() }}</span>
                </span>
              </span>
              <span class="nk-lcd__label">{{ creditService.costPerPlay() }} N$/SOUND</span>
            </button>
            <span class="nk-lcd__div" aria-hidden="true"></span>
            <button
              type="button"
              class="nk-lcd__cell"
              matTooltip="Holz kaufen"
              [attr.aria-label]="'Holz kaufen, Bestand ' + inventoryService.wood()"
              (click)="openShop()"
            >
              <span class="nk-lcd__label">HOLZ</span>
              <span class="nk-lcd__value nk-lcd__value--glyph">
                <app-lcd-glyph kind="wood" />
                <span class="nk-lcd__num">
                  <span class="nk-lcd__ghost" aria-hidden="true">{{
                    ghost('' + inventoryService.wood())
                  }}</span>
                  <span class="nk-lcd__digits">{{ inventoryService.wood() }}</span>
                </span>
              </span>
              <span class="nk-lcd__label">&nbsp;</span>
            </button>
            @if (creditService.hourlyCreditsEnabled()) {
              <span class="nk-lcd__div" aria-hidden="true"></span>
              <div class="nk-lcd__cell deck-income" matTooltip="Stündliches Einkommen">
                <span class="nk-lcd__label">● ONLINE-BONUS</span>
                <span class="nk-lcd__value nk-lcd__value--md"
                  >+{{ creditService.hourlyCreditsAmount() }} N$/h</span
                >
                <span class="nk-lcd__label">STÜNDLICH</span>
              </div>
            }
          </div>
        </div>
      }

      <span class="deck-spacer"></span>

      <!-- Funktionstasten -->
      <div class="deck-tools">
        <div class="nk-toolkey">
          <span
            [class]="selectionMode() ? 'nk-led nk-led--own' : 'nk-led'"
            aria-hidden="true"
          ></span>
          <button
            type="button"
            data-tour="selection"
            [class]="selectionMode() ? 'nk-key nk-key--icon nk-key--on' : 'nk-key nk-key--icon'"
            [attr.aria-pressed]="selectionMode()"
            [attr.aria-label]="selectionMode() ? 'Auswahlmodus beenden' : 'Mehrfachauswahl'"
            [matTooltip]="selectionMode() ? 'Auswahlmodus beenden' : 'Mehrfachauswahl'"
            (click)="selectionModeToggle.emit()"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8"></path>
            </svg>
            @if (selectionMode() && selectionCount() > 0) {
              <span class="nk-badge nk-badge--corner nk-badge--lamp">{{ selectionCount() }}</span>
            }
          </button>
          <span class="nk-toolkey__label">Auswahl</span>
        </div>

        @if (selectionMode() && selectionCount() > 0) {
          <div class="nk-toolkey">
            <span class="nk-led" aria-hidden="true"></span>
            <button
              type="button"
              class="nk-key nk-key--icon"
              aria-label="Alle abwählen"
              matTooltip="Alle abwählen"
              (click)="clearSelection.emit()"
            >
              ✕
            </button>
            <span class="nk-toolkey__label">Abwählen</span>
          </div>
        }

        <div class="nk-toolkey">
          <span
            [class]="hasSelection() ? 'nk-led nk-led--own nk-led--blink' : 'nk-led'"
            aria-hidden="true"
          ></span>
          <button
            type="button"
            data-tour="mixer"
            [class]="hasSelection() ? 'nk-key nk-key--icon nk-key--accent' : 'nk-key nk-key--icon'"
            [attr.aria-label]="hasSelection() ? 'Auswahl im Mixer öffnen' : 'Mixer öffnen'"
            [matTooltip]="hasSelection() ? 'Auswahl im Mixer öffnen' : 'Mixer öffnen'"
            (click)="hasSelection() ? openSelectionInMixer.emit() : openMixer()"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"
              ></path>
            </svg>
          </button>
          <span class="nk-toolkey__label">{{ hasSelection() ? 'In Mixer' : 'Mixer' }}</span>
        </div>

        @if (auth.currentUser()) {
          <div class="nk-toolkey">
            <span class="nk-led" aria-hidden="true"></span>
            <button
              type="button"
              class="nk-key nk-key--icon"
              aria-label="Spielhalle (Minispiele)"
              matTooltip="Mini-Games – Earn N$"
              (click)="openGames()"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path
                  d="M6 8h12a4 4 0 014 4v1a4 4 0 01-4 4H6a4 4 0 01-4-4v-1a4 4 0 014-4zM7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"
                ></path>
              </svg>
            </button>
            <span class="nk-toolkey__label">Spielhalle</span>
          </div>
          <div class="nk-toolkey">
            <span class="nk-led" aria-hidden="true"></span>
            <button
              type="button"
              class="nk-key nk-key--icon"
              aria-label="Shop"
              matTooltip="Shop"
              (click)="openShop()"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 016 0v2"></path>
              </svg>
            </button>
            <span class="nk-toolkey__label">Shop</span>
          </div>
        }

        <div class="nk-toolkey">
          <span class="nk-led" aria-hidden="true"></span>
          <button
            type="button"
            class="nk-key nk-key--icon"
            data-tour="stats"
            aria-label="Statistiken"
            matTooltip="Statistiken"
            (click)="statsClick.emit()"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M5 20V10M12 20V4M19 20v-7"></path>
            </svg>
          </button>
          <span class="nk-toolkey__label">Statistik</span>
        </div>

        <div class="nk-toolkey">
          <span [class]="chatOpen() ? 'nk-led nk-led--own' : 'nk-led'" aria-hidden="true"></span>
          <button
            type="button"
            data-tour="chat"
            [class]="chatOpen() ? 'nk-key nk-key--icon nk-key--on' : 'nk-key nk-key--icon'"
            [attr.aria-pressed]="chatOpen()"
            aria-label="Chat"
            matTooltip="Chat"
            (click)="chatClick.emit()"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M4 5h16v11H9l-5 4z"></path>
            </svg>
          </button>
          <span class="nk-toolkey__label">Chat</span>
        </div>

        @if (auth.currentUser()?.role === 'admin') {
          <div class="nk-toolkey">
            <span class="nk-led" aria-hidden="true"></span>
            <button
              type="button"
              class="nk-key nk-key--icon"
              data-tour="admin-menu"
              aria-label="Admin"
              aria-haspopup="menu"
              matTooltip="Admin"
              [matMenuTriggerFor]="adminMenu"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path>
              </svg>
            </button>
            <span class="nk-toolkey__label">Admin</span>
          </div>
          <mat-menu #adminMenu="matMenu">
            <div class="deck-menu-head">Administration</div>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="adminMenuAction.emit('users')">
              <mat-icon>people</mat-icon><span>Userverwaltung</span>
            </button>
            <button mat-menu-item (click)="adminMenuAction.emit('tags')">
              <mat-icon>label</mat-icon><span>Tag-Verwaltung</span>
            </button>
            <button mat-menu-item (click)="adminMenuAction.emit('tag-wizard')">
              <mat-icon>auto_fix_high</mat-icon><span>Tag-Wizard</span>
            </button>
            <button mat-menu-item (click)="adminMenuAction.emit('credits')">
              <mat-icon>savings</mat-icon><span>Shekel-Einstellungen</span>
            </button>
            <button mat-menu-item (click)="adminMenuAction.emit('tts')">
              <mat-icon>record_voice_over</mat-icon><span>Sprachausgabe (Test)</span>
            </button>
            <button
              mat-menu-item
              (click)="toggleLoudness()"
              [attr.aria-pressed]="loudness.enabled()"
            >
              <mat-icon>equalizer</mat-icon
              ><span>Lautstärke angleichen: {{ loudness.enabled() ? 'an' : 'aus' }}</span>
            </button>
            <mat-divider></mat-divider>
            <button mat-menu-item class="nk-menu-danger" (click)="killAllClick.emit()">
              <mat-icon>stop_circle</mat-icon><span>Alle Sounds stoppen</span>
            </button>
          </mat-menu>
        }
      </div>

      <!-- Konto -->
      @if (auth.isLoggedIn()) {
        <button
          type="button"
          class="deck-account"
          data-tour="profile"
          aria-haspopup="menu"
          [attr.aria-label]="'Mein Konto (' + (auth.currentUser()?.username ?? '') + ')'"
          [matMenuTriggerFor]="userMenu"
        >
          <app-user-avatar
            [imageUrl]="avatarService.currentUserAvatarUrl()"
            [initials]="userInitials()"
            [name]="auth.currentUser()?.username ?? ''"
            size="large"
          />
        </button>
        <mat-menu #userMenu="matMenu">
          <div class="deck-menu-head">{{ auth.currentUser()?.username }}</div>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="profileClick.emit()">
            <mat-icon>person</mat-icon><span>Mein Profil</span>
          </button>
          <button mat-menu-item (click)="changeAvatarClick.emit()">
            <mat-icon>photo_camera</mat-icon><span>Avatar ändern</span>
          </button>
          <button mat-menu-item (click)="uploadClick.emit()">
            <mat-icon>upload_file</mat-icon><span>Sound hochladen</span>
          </button>
          <button mat-menu-item (click)="changePasswordClick.emit()">
            <mat-icon>key</mat-icon><span>Kennwort ändern</span>
          </button>
          <button mat-menu-item (click)="restartTourClick.emit()">
            <mat-icon>help_outline</mat-icon><span>Tour starten</span>
          </button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="auth.logout()">
            <mat-icon>logout</mat-icon><span>Abmelden</span>
          </button>
        </mat-menu>
      } @else {
        <div class="nk-toolkey deck-login">
          <span class="nk-led nk-led--lamp nk-led--blink" aria-hidden="true"></span>
          <button
            type="button"
            class="nk-key nk-key--accent"
            data-tour="profile"
            (click)="loginClick.emit()"
          >
            Anmelden
          </button>
          <span class="nk-toolkey__label">&nbsp;</span>
        </div>
      }
    </header>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
    .deck {
      gap: 10px;
    }
    /* Wortmarke: Breite aus dem Inhalt, damit „NERVBOX“ nie abgeschnitten wird */
    .deck .nk-logo {
      width: auto;
      padding-right: 14px;
    }
    .deck .nk-logo__word {
      font-size: 24px;
    }
    .deck-search {
      width: 196px;
    }
    /* Feld füllt die volle Höhe: ganze Fläche ist Eingabe, Text mit Luft */
    .deck-search .nk-input__field {
      align-self: stretch;
      height: auto;
    }
    .deck-sort {
      margin: 1px 2px;
      min-width: 150px;
    }
    .deck-sort__label {
      flex: 1;
      text-align: left;
    }
    .deck-switch {
      margin: 5px 0;
    }
    .deck-random {
      width: 66px;
    }
    .deck-random .nk-key--round {
      margin-top: 8px;
    }
    .deck-lcd .nk-lcd__cell:first-child {
      min-width: 108px;
    }
    .deck-income {
      cursor: default;
      min-width: 92px;
    }
    .deck-spacer {
      flex: 1;
    }
    .deck-tools {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .deck-account {
      flex-shrink: 0;
      margin-right: 4px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      box-shadow: var(--nk-shadow-ring);
    }
    .deck-account:focus-visible {
      outline: 2px solid var(--nk-iv);
      outline-offset: 9px;
    }
    .deck-login {
      width: auto;
      margin-right: 4px;
    }
    @media (max-width: 1680px) {
      .nk-logo__sub {
        display: none;
      }
      .deck .nk-logo {
        justify-content: center;
      }
      .deck .nk-logo__word {
        font-size: 20px;
      }
      .deck-search {
        width: 180px;
      }
    }
    @media (max-width: 1500px) {
      .deck-income,
      .deck-lcd .nk-lcd__div:has(+ .deck-income) {
        display: none;
      }
      .deck-lcd {
        width: auto;
      }
    }
    @media (max-width: 1400px) {
      .deck-random .nk-label,
      .sort-container .nk-label,
      .search-container .nk-label {
        display: none;
      }
      .deck-tools .nk-toolkey {
        width: 46px;
      }
      .deck-random {
        width: auto;
      }
      .deck-random .nk-key--round {
        margin-top: 0;
      }
    }
    @media (max-width: 768px) {
      .deck.deck {
        height: auto;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto auto;
        grid-template-areas:
          'logo lcd lcd lcd acc'
          'search search sort fav rnd';
        gap: 8px 8px;
        padding-bottom: 8px;
      }
      .deck .nk-logo {
        grid-area: logo;
        width: auto;
        padding: 6px 8px 5px;
        justify-content: center;
      }
      .deck .nk-logo__word {
        font-size: 15px;
      }
      .deck .nk-logo__stripe {
        width: 12px;
        height: 3px;
      }
      .deck .deck-lcd {
        grid-area: lcd;
        width: auto;
        min-width: 0;
        height: 48px;
      }
      .deck .deck-lcd .nk-lcd__glass {
        padding: 4px 7px 3px;
        gap: 6px;
      }
      .deck .deck-lcd .nk-lcd__value {
        font-size: 26px;
        line-height: 22px;
        --nk-lcd-glyph-px: 1.5px;
        --nk-lcd-glyph-gap: 4px;
        --nk-lcd-glyph-shift: 0;
      }
      .deck .deck-lcd .nk-lcd__cell:first-child {
        min-width: 0;
      }
      .deck .deck-account,
      .deck .deck-login {
        grid-area: acc;
        align-self: center;
        margin: 0 4px 0 6px;
        box-shadow:
          0 0 0 3px var(--nk-well),
          1.5px 1.5px 0 3px rgb(var(--nk-lamp-rgb) / 0.17);
      }
      .deck .deck-account app-user-avatar {
        display: block;
      }
      .deck .search-container {
        grid-area: search;
        min-width: 0;
      }
      .deck .sort-container {
        grid-area: sort;
      }
      .deck .deck-fav {
        grid-area: fav;
      }
      .deck .deck-random {
        grid-area: rnd;
        display: flex;
        width: auto;
      }
      .deck .deck-spacer,
      .deck .deck-tools,
      .deck .deck-income,
      .deck .nk-ctl .nk-label,
      .deck .nk-logo__sub {
        display: none;
      }
      .deck .deck-search {
        width: auto;
        height: 36px;
      }
      .deck .deck-sort {
        min-width: 0;
        height: 36px;
        padding: 0 8px 2px 6px;
      }
      .deck .deck-sort__label,
      .deck .deck-sort > span:last-child {
        display: none;
      }
      .deck .deck-switch {
        width: 56px;
        margin: 3px 0;
      }
      .deck .deck-random .nk-key--round {
        width: 38px;
        height: 38px;
        margin-top: 0;
      }
    }
  `,
})
export class ToolbarComponent {
  readonly auth = inject(AuthService);
  readonly favorites = inject(FavoritesService);
  readonly creditService = inject(CreditService);
  readonly loudness = inject(LoudnessService);
  readonly avatarService = inject(AvatarService);
  readonly inventoryService = inject(InventoryService);
  private readonly dialog = inject(MatDialog);
  private readonly achievementService = inject(AchievementService);

  readonly sortOptions: SortOption[] = [
    'name-asc',
    'name-desc',
    'plays-desc',
    'votes-desc',
    'votes-asc',
    'newest',
    'duration-desc',
    'duration-asc',
    'random',
  ];
  readonly sortLabels = SORT_LABELS;

  searchQuery = '';

  readonly userInitials = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return '?';
    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user.firstName) {
      return user.firstName.substring(0, 2).toUpperCase();
    }
    if (user.username) {
      return user.username.substring(0, 2).toUpperCase();
    }
    return '?';
  });

  // Inputs
  readonly currentSort = input<SortOption>('name-asc');
  readonly selectionMode = input<boolean>(false);
  readonly selectionCount = input<number>(0);
  readonly showFavoritesOnly = input<boolean>(false);
  readonly chatOpen = input<boolean>(false);

  readonly sortLabel = computed(() => SORT_LABELS[this.currentSort()]);
  readonly knobAngle = computed(() => `${KNOB_ANGLE[this.currentSort()]}deg`);
  readonly hasSelection = computed(() => this.selectionMode() && this.selectionCount() > 0);

  // Outputs
  readonly searchChange = output<string>();
  readonly sortChange = output<SortOption>();
  readonly favoritesFilterToggle = output<void>();
  readonly killAllClick = output<void>();
  readonly adminMenuAction = output<'users' | 'tags' | 'tag-wizard' | 'credits' | 'tts'>();
  readonly statsClick = output<void>();
  readonly chatClick = output<void>();
  readonly loginClick = output<void>();
  readonly changePasswordClick = output<void>();
  readonly changeAvatarClick = output<void>();
  readonly uploadClick = output<void>();
  readonly profileClick = output<void>();
  readonly restartTourClick = output<void>();
  readonly selectionModeToggle = output<void>();
  readonly openSelectionInMixer = output<void>();
  readonly clearSelection = output<void>();
  readonly randomClick = output<void>();

  /** unbeleuchtete Segmente hinter den LCD-Ziffern („88.888“) */
  ghost(value: string): string {
    return value.replace(/[0-9]/g, '8');
  }

  onSearchChange(): void {
    this.searchChange.emit(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchChange.emit('');
  }

  onSortChange(value: SortOption): void {
    this.sortChange.emit(value);
  }

  openMixer(): void {
    this.achievementService.markMixerVisited().subscribe();
    window.location.href = '/mixer';
  }

  /** Popover hängt direkt unter dem LCD-Feld (auf schmalen Schirmen mittig) */
  openShekelPopover(event?: Event): void {
    const el = event?.currentTarget as HTMLElement | undefined;
    const rect = el?.getBoundingClientRect();
    const position =
      rect && window.innerWidth > 768
        ? {
            top: `${Math.round(rect.bottom + 14)}px`,
            left: `${Math.max(8, Math.round(rect.left - 20))}px`,
          }
        : undefined;
    this.dialog.open(ShekelPopoverComponent, {
      panelClass: 'shekel-popover-dialog',
      backdropClass: 'shekel-popover-backdrop',
      autoFocus: false,
      position,
    });
  }

  openShop(): void {
    this.dialog.open(ShopDialogComponent, {
      maxWidth: '95vw',
      maxHeight: '92vh',
      panelClass: 'dark-dialog',
    });
  }

  async openGames(): Promise<void> {
    const { GameSelectionDialogComponent } =
      await import('../mini-games/game-selection-dialog.component');
    this.dialog.open(GameSelectionDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });
  }

  /** Admin: switch playback loudness normalization (Pi + browsers) on/off */
  toggleLoudness(): void {
    this.loudness.configure(!this.loudness.enabled()).subscribe();
  }
}
