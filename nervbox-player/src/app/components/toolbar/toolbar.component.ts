import { Component, inject, output, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../core/services/auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { AvatarService } from '../../core/services/avatar.service';

export type SortOption = 'name-asc' | 'name-desc' | 'plays-desc' | 'newest' | 'duration-desc' | 'duration-asc' | 'random';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatInputModule,
    MatFormFieldModule,
    MatBadgeModule,
    MatDividerModule,
    MatSelectModule,
  ],
  template: `
    <mat-toolbar class="toolbar">
      <!-- Logo -->
      <div class="logo">
        <span class="logo-text">NervBox</span>
        <span class="logo-edition">cabd 2025 edition</span>
      </div>

      <!-- Search -->
      <div class="search-container">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          type="text"
          class="search-input"
          placeholder="Sound suchen..."
          [(ngModel)]="searchQuery"
          (input)="onSearchChange()"
        />
        @if (searchQuery) {
          <button
            mat-icon-button
            class="clear-btn"
            (click)="clearSearch()"
            matTooltip="Suche leeren"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>

      <!-- Sort Dropdown -->
      <div class="sort-container">
        <mat-icon class="sort-icon">sort</mat-icon>
        <mat-select
          class="sort-select"
          [value]="currentSort()"
          (selectionChange)="onSortChange($event.value)"
          panelClass="sort-panel"
          disableOptionCentering
        >
          <mat-option value="name-asc">Name A-Z</mat-option>
          <mat-option value="name-desc">Name Z-A</mat-option>
          <mat-option value="plays-desc">Beliebteste</mat-option>
          <mat-option value="newest">Neueste</mat-option>
          <mat-option value="duration-desc">Längste</mat-option>
          <mat-option value="duration-asc">Kürzeste</mat-option>
          <mat-option value="random">Zufall</mat-option>
        </mat-select>
      </div>

      <!-- Favorites Filter - nur wenn eingeloggt -->
      @if (auth.isLoggedIn()) {
        <button
          class="favorites-filter-btn"
          [class.active]="showFavoritesOnly()"
          (click)="favoritesFilterToggle.emit()"
          [matTooltip]="showFavoritesOnly() ? 'Alle Sounds anzeigen' : 'Nur Favoriten anzeigen'"
        >
          <mat-icon>{{ showFavoritesOnly() ? 'favorite' : 'favorite_border' }}</mat-icon>
        </button>
      }

      <div class="spacer"></div>

      <!-- MIXER FEATURE GROUP - Das Killer-Feature! -->
      <div class="mixer-feature-group">
        <button
          class="selection-toggle-btn"
          data-tour="selection"
          [class.active]="selectionMode()"
          [matTooltip]="selectionMode() ? 'Auswahlmodus beenden' : 'Mehrfachauswahl'"
          (click)="selectionModeToggle.emit()"
        >
          <mat-icon>{{ selectionMode() ? 'check_box' : 'checklist' }}</mat-icon>
        </button>

        @if (selectionMode() && selectionCount() > 0) {
          <span class="selection-badge">{{ selectionCount() }}</span>
          <button
            class="clear-selection-btn"
            matTooltip="Alle abwählen"
            (click)="clearSelection.emit()"
          >
            <mat-icon>clear</mat-icon>
          </button>
        }

        <button
          class="mixer-main-btn"
          [class.has-selection]="selectionMode() && selectionCount() > 0"
          data-tour="mixer"
          [matTooltip]="selectionMode() && selectionCount() > 0 ? 'Auswahl im Mixer öffnen' : 'Mixer öffnen'"
          (click)="selectionMode() && selectionCount() > 0 ? openSelectionInMixer.emit() : openMixer()"
        >
          <mat-icon>{{ selectionMode() && selectionCount() > 0 ? 'arrow_forward' : 'queue_music' }}</mat-icon>
          <span class="mixer-label">{{ selectionMode() && selectionCount() > 0 ? 'AB IN DEN MIXER' : 'MIXER' }}</span>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Action Buttons -->
      <div class="actions">
        <!-- Stats -->
        <button
          mat-icon-button
          class="action-btn"
          data-tour="stats"
          matTooltip="Statistiken"
          (click)="statsClick.emit()"
        >
          <mat-icon>leaderboard</mat-icon>
        </button>

        <!-- Chat -->
        <button
          mat-icon-button
          class="action-btn"
          data-tour="chat"
          matTooltip="Chat"
          (click)="chatClick.emit()"
        >
          <mat-icon>chat</mat-icon>
        </button>

        <!-- ADMIN SECTION -->
        @if (auth.currentUser()?.role === 'admin') {
          <div class="toolbar-divider"></div>
          <button
            mat-icon-button
            class="action-btn admin-btn"
            [matMenuTriggerFor]="adminMenu"
            data-tour="admin-menu"
            matTooltip="Admin"
          >
            <mat-icon>admin_panel_settings</mat-icon>
          </button>
          <mat-menu #adminMenu="matMenu">
            <div class="menu-header admin-menu-header">
              <mat-icon>admin_panel_settings</mat-icon>
              <span>Administration</span>
            </div>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="adminMenuAction.emit('users')">
              <mat-icon>people</mat-icon>
              <span>Userverwaltung</span>
            </button>
            <button mat-menu-item (click)="adminMenuAction.emit('tags')">
              <mat-icon>label</mat-icon>
              <span>Tag-Verwaltung</span>
            </button>
            <button mat-menu-item (click)="adminMenuAction.emit('tag-wizard')">
              <mat-icon>auto_fix_high</mat-icon>
              <span>Tag-Wizard</span>
            </button>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="killAllClick.emit()" class="danger-item">
              <mat-icon>stop_circle</mat-icon>
              <span>Alle Sounds stoppen</span>
            </button>
          </mat-menu>
        }

        <!-- PROFILE SECTION -->
        <div class="toolbar-divider"></div>
        @if (auth.isLoggedIn()) {
          <button mat-icon-button [matMenuTriggerFor]="userMenu" class="user-btn" data-tour="profile">
            @if (avatarService.currentUserAvatarUrl()) {
              <img [src]="avatarService.currentUserAvatarUrl()" class="user-avatar-img" alt="Avatar" />
            } @else {
              <span class="user-initials">{{ userInitials() }}</span>
            }
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-header user-menu-header">
              @if (avatarService.currentUserAvatarUrl()) {
                <img [src]="avatarService.currentUserAvatarUrl()" class="menu-avatar-img" alt="Avatar" />
              } @else {
                <span class="menu-initials">{{ userInitials() }}</span>
              }
              <span>{{ auth.currentUser()?.username }}</span>
            </div>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="changeAvatarClick.emit()">
              <mat-icon>photo_camera</mat-icon>
              <span>Avatar ändern</span>
            </button>
            <button mat-menu-item (click)="changePasswordClick.emit()">
              <mat-icon>key</mat-icon>
              <span>Kennwort ändern</span>
            </button>
            <button mat-menu-item (click)="restartTourClick.emit()">
              <mat-icon>help_outline</mat-icon>
              <span>Tour starten</span>
            </button>
            <mat-divider></mat-divider>
            <button mat-menu-item (click)="auth.logout()">
              <mat-icon>logout</mat-icon>
              <span>Abmelden</span>
            </button>
          </mat-menu>
        } @else {
          <button
            mat-icon-button
            class="action-btn"
            data-tour="profile"
            matTooltip="Anmelden"
            (click)="loginClick.emit()"
          >
            <mat-icon>login</mat-icon>
          </button>
        }
      </div>
    </mat-toolbar>
  `,
  styles: `
    .toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      height: 56px;
      background: linear-gradient(90deg, #0a0a0a 0%, #1a0f1f 50%, #0a0a0a 100%);
      border-bottom: 1px solid rgba(147, 51, 234, 0.3);
      box-shadow: 0 2px 20px rgba(147, 51, 234, 0.2);
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .logo {
      display: flex;
      align-items: center;
    }

    .logo-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 700;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 0 30px rgba(147, 51, 234, 0.5);
    }

    .logo-edition {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.35);
      margin-left: 8px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .search-container {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px;
      padding: 4px 12px;
      max-width: 300px;
      flex: 1;
      transition: all 0.2s ease;
    }

    .search-container:focus-within {
      border-color: rgba(147, 51, 234, 0.6);
      box-shadow: 0 0 10px rgba(147, 51, 234, 0.2);
    }

    .search-icon {
      color: rgba(255, 255, 255, 0.5);
      font-size: 20px;
      width: 20px;
      height: 20px;
      margin-right: 8px;
    }

    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: white;
      font-family: Inter, sans-serif;
      font-size: 14px;
    }

    .search-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .clear-btn {
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0;
    }

    .clear-btn mat-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
      line-height: 16px !important;
      color: rgba(255, 255, 255, 0.5);
    }

    .clear-btn:hover mat-icon {
      color: #ec4899;
    }

    .spacer {
      flex: 1;
    }

    .sort-container {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px;
      padding: 4px 10px;
      gap: 6px;
      transition: all 0.2s ease;
    }

    .sort-container:hover {
      border-color: rgba(147, 51, 234, 0.5);
    }

    .sort-icon {
      color: rgba(255, 255, 255, 0.5);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .sort-select {
      width: auto;
      min-width: 120px;
    }

    .sort-select ::ng-deep .mat-mdc-select-value {
      color: rgba(255, 255, 255, 0.8);
      font-family: Inter, sans-serif;
      font-size: 13px;
      padding-right: 8px;
    }

    .sort-select ::ng-deep .mat-mdc-select-arrow {
      color: rgba(255, 255, 255, 0.5);
      margin-left: 4px;
    }

    .sort-container:hover .sort-select ::ng-deep .mat-mdc-select-arrow {
      color: rgba(255, 255, 255, 0.8);
    }

    /* Favorites Filter Button */
    .favorites-filter-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(236, 72, 153, 0.3);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .favorites-filter-btn:hover {
      background: rgba(236, 72, 153, 0.15);
      border-color: rgba(236, 72, 153, 0.5);
    }

    .favorites-filter-btn mat-icon {
      color: rgba(236, 72, 153, 0.6);
      font-size: 20px;
      width: 20px;
      height: 20px;
      transition: color 0.2s ease, transform 0.2s ease;
    }

    .favorites-filter-btn:hover mat-icon {
      color: #ec4899;
      transform: scale(1.1);
    }

    .favorites-filter-btn.active {
      background: rgba(236, 72, 153, 0.2);
      border-color: rgba(236, 72, 153, 0.6);
    }

    .favorites-filter-btn.active mat-icon {
      color: #ec4899;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toolbar-divider {
      width: 1px;
      height: 28px;
      background: rgba(147, 51, 234, 0.4);
      margin: 0 4px;
    }

    .actions .toolbar-divider {
      margin: 0 8px;
    }

    /* MIXER FEATURE GROUP - Das Killer-Feature! */
    .mixer-feature-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .selection-toggle-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .selection-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .selection-toggle-btn mat-icon {
      color: rgba(255, 255, 255, 0.7);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .selection-toggle-btn.active {
      background: rgba(34, 197, 94, 0.2);
      border-color: rgba(34, 197, 94, 0.6);
    }

    .selection-toggle-btn.active mat-icon {
      color: #22c55e;
    }

    .selection-badge {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 10px;
      min-width: 20px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
    }

    .clear-selection-btn {
      width: 32px;
      height: 32px;
      padding: 0;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .clear-selection-btn:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.6);
    }

    .clear-selection-btn mat-icon {
      color: #ef4444;
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-top: 2px;
    }

    /* MIXER MAIN BUTTON - Das Highlight! */
    .mixer-main-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(90deg, #9333ea 0%, #ec4899 50%, #9333ea 100%);
      background-size: 200% 100%;
      border: none;
      border-radius: 10px;
      padding: 8px 16px;
      cursor: pointer;
      transition: transform 0.2s ease;
      animation: mixerGlow 2.5s ease-in-out infinite, mixerGradient 3s linear infinite;
      box-shadow:
        0 0 15px rgba(147, 51, 234, 0.6),
        0 0 30px rgba(236, 72, 153, 0.4);
    }

    .mixer-main-btn:hover {
      transform: scale(1.08);
      animation: mixerGlow 1.5s ease-in-out infinite, mixerGradient 1.5s linear infinite;
      box-shadow:
        0 0 25px rgba(147, 51, 234, 0.8),
        0 0 50px rgba(236, 72, 153, 0.6);
    }

    .mixer-main-btn mat-icon {
      color: white;
      font-size: 22px;
      width: 22px;
      height: 22px;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .mixer-label {
      color: white;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    @keyframes mixerGlow {
      0%, 100% {
        box-shadow:
          0 0 15px rgba(147, 51, 234, 0.6),
          0 0 30px rgba(236, 72, 153, 0.4);
      }
      50% {
        box-shadow:
          0 0 25px rgba(147, 51, 234, 0.8),
          0 0 45px rgba(236, 72, 153, 0.5);
      }
    }

    @keyframes mixerGradient {
      0% {
        background-position: 0% 50%;
      }
      100% {
        background-position: 100% 50%;
      }
    }

    /* Mixer Button mit Auswahl */
    .mixer-main-btn.has-selection {
      background: linear-gradient(90deg, #22c55e 0%, #16a34a 50%, #22c55e 100%);
      box-shadow:
        0 0 20px rgba(34, 197, 94, 0.7),
        0 0 40px rgba(22, 163, 74, 0.5);
    }

    .mixer-main-btn.has-selection:hover {
      box-shadow:
        0 0 30px rgba(34, 197, 94, 0.9),
        0 0 60px rgba(22, 163, 74, 0.7);
    }

    @keyframes mixerGlowGreen {
      0%, 100% {
        box-shadow:
          0 0 20px rgba(34, 197, 94, 0.7),
          0 0 40px rgba(22, 163, 74, 0.5);
      }
      50% {
        box-shadow:
          0 0 30px rgba(34, 197, 94, 0.9),
          0 0 50px rgba(22, 163, 74, 0.6);
      }
    }

    .mixer-main-btn.has-selection {
      animation: mixerGlowGreen 2s ease-in-out infinite, mixerGradient 3s linear infinite;
    }

    .admin-btn {
      background: rgba(249, 115, 22, 0.1) !important;
      border-color: rgba(249, 115, 22, 0.3) !important;
    }

    .admin-btn:hover {
      background: rgba(249, 115, 22, 0.2) !important;
      border-color: rgba(249, 115, 22, 0.5) !important;
    }

    .admin-btn mat-icon {
      color: #f97316 !important;
    }

    .action-btn, .user-btn {
      width: 40px !important;
      height: 40px !important;
      background: rgba(147, 51, 234, 0.1) !important;
      border: 1px solid rgba(147, 51, 234, 0.3) !important;
      border-radius: 8px !important;
      transition: all 0.2s ease !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .action-btn:hover, .user-btn:hover {
      background: rgba(147, 51, 234, 0.2) !important;
      border-color: rgba(147, 51, 234, 0.5) !important;
      transform: scale(1.05);
    }

    .action-btn mat-icon, .user-btn mat-icon {
      color: rgba(255, 255, 255, 0.8);
    }

    .action-btn:hover mat-icon, .user-btn:hover mat-icon {
      color: #ec4899;
    }

    .menu-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 500;
    }

    .menu-header mat-icon {
      color: #9333ea;
    }

    .user-avatar-img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(147, 51, 234, 0.5);
    }

    .menu-avatar-img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #9333ea;
    }

    .user-initials {
      width: 32px;
      min-width: 32px;
      height: 32px;
      min-height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      color: white;
      font-family: 'JetBrains Mono', monospace;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      aspect-ratio: 1;
      flex-shrink: 0;
    }

    .menu-initials {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      color: white;
      font-family: 'JetBrains Mono', monospace;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      flex-shrink: 0;
    }

    .user-menu-header {
      min-width: 180px;
    }

    .admin-menu-header mat-icon {
      color: #f97316;
    }

    ::ng-deep .mat-mdc-menu-panel .danger-item {
      color: #ef4444;
    }

    ::ng-deep .mat-mdc-menu-panel .danger-item mat-icon {
      color: #ef4444;
    }

    @media (max-width: 600px) {
      .search-container {
        max-width: 150px;
      }

      .logo-text {
        font-size: 16px;
      }
    }
  `,
})
export class ToolbarComponent {
  readonly auth = inject(AuthService);
  readonly favorites = inject(FavoritesService);
  readonly avatarService = inject(AvatarService);

  searchQuery = '';

  // Computed: Initialen des Benutzers für Avatar-Fallback
  readonly userInitials = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return '?';

    // Versuche zuerst Vor- und Nachname
    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user.firstName) {
      return user.firstName.substring(0, 2).toUpperCase();
    }

    // Fallback: Benutzername
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

  // Outputs
  readonly searchChange = output<string>();
  readonly sortChange = output<SortOption>();
  readonly favoritesFilterToggle = output<void>();
  readonly killAllClick = output<void>();
  readonly adminMenuAction = output<'users' | 'tags' | 'tag-wizard'>();
  readonly statsClick = output<void>();
  readonly chatClick = output<void>();
  readonly loginClick = output<void>();
  readonly changePasswordClick = output<void>();
  readonly changeAvatarClick = output<void>();
  readonly restartTourClick = output<void>();
  readonly selectionModeToggle = output<void>();
  readonly openSelectionInMixer = output<void>();
  readonly clearSelection = output<void>();

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
    // Mixer is served at /mixer (same origin, shares localStorage)
    window.location.href = '/mixer';
  }
}
