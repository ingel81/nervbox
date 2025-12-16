import { Component, inject, output, input } from '@angular/core';
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
        <span class="logo-text">nervbox</span>
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

      <div class="spacer"></div>

      <!-- Action Buttons -->
      <div class="actions">
        <!-- USER SECTION -->
        <!-- Selection Mode Toggle -->
        <button
          mat-icon-button
          class="action-btn"
          data-tour="selection"
          [class.active]="selectionMode()"
          [matTooltip]="selectionMode() ? 'Auswahl beenden' : 'Mehrfachauswahl'"
          (click)="selectionModeToggle.emit()"
        >
          <mat-icon>{{ selectionMode() ? 'check_box' : 'checklist' }}</mat-icon>
        </button>

        <!-- Selection Actions (nur wenn Selection Mode aktiv UND Sounds ausgewaehlt) -->
        @if (selectionMode() && selectionCount() > 0) {
          <div class="selection-actions">
            <span class="selection-badge">{{ selectionCount() }}</span>
            <button
              mat-icon-button
              class="action-btn mixer-btn"
              matTooltip="Auswahl im Mixer öffnen"
              (click)="openSelectionInMixer.emit()"
            >
              <mat-icon>tune</mat-icon>
            </button>
            <button
              mat-icon-button
              class="action-btn"
              matTooltip="Auswahl aufheben"
              (click)="clearSelection.emit()"
            >
              <mat-icon>clear</mat-icon>
            </button>
          </div>
        }

        <!-- Mixer -->
        @if (!selectionMode()) {
          <button
            mat-icon-button
            class="action-btn"
            data-tour="mixer"
            matTooltip="Mixer öffnen"
            (click)="openMixer()"
          >
            <mat-icon>tune</mat-icon>
          </button>
        }

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
            data-tour="tag-wizard"
            matTooltip="Tag-Wizard"
            (click)="tagWizardClick.emit()"
          >
            <mat-icon>auto_fix_high</mat-icon>
          </button>
          <button
            mat-icon-button
            class="action-btn admin-btn"
            data-tour="tag-manager"
            matTooltip="Tag-Verwaltung"
            (click)="tagManagerClick.emit()"
          >
            <mat-icon>label</mat-icon>
          </button>
          <button
            mat-icon-button
            class="action-btn admin-btn"
            data-tour="kill-all"
            matTooltip="Alle Sounds stoppen"
            (click)="killAllClick.emit()"
          >
            <mat-icon>stop_circle</mat-icon>
          </button>
        }

        <!-- PROFILE SECTION -->
        <div class="toolbar-divider"></div>
        @if (auth.isLoggedIn()) {
          <button mat-icon-button [matMenuTriggerFor]="userMenu" class="user-btn" data-tour="profile">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-header">
              <mat-icon>person</mat-icon>
              <span>{{ auth.currentUser()?.username }}</span>
            </div>
            <mat-divider></mat-divider>
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

    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toolbar-divider {
      width: 1px;
      height: 28px;
      background: rgba(147, 51, 234, 0.4);
      margin: 0 8px;
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

    /* Selection Mode Active State */
    .action-btn.active {
      background: rgba(34, 197, 94, 0.2) !important;
      border-color: rgba(34, 197, 94, 0.5) !important;
    }

    .action-btn.active mat-icon {
      color: #22c55e;
    }

    .action-btn.active:hover {
      background: rgba(34, 197, 94, 0.3) !important;
      border-color: rgba(34, 197, 94, 0.7) !important;
    }

    /* Selection Actions Container */
    .selection-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: 8px;
      padding: 4px 8px;
    }

    .selection-badge {
      background: #22c55e;
      color: white;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      min-width: 20px;
      text-align: center;
    }

    .mixer-btn {
      background: rgba(34, 197, 94, 0.2) !important;
      border-color: rgba(34, 197, 94, 0.5) !important;
    }

    .mixer-btn mat-icon {
      color: #22c55e !important;
    }

    .mixer-btn:hover {
      background: rgba(34, 197, 94, 0.3) !important;
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

  searchQuery = '';

  // Inputs
  readonly currentSort = input<SortOption>('name-asc');
  readonly selectionMode = input<boolean>(false);
  readonly selectionCount = input<number>(0);

  // Outputs
  readonly searchChange = output<string>();
  readonly sortChange = output<SortOption>();
  readonly killAllClick = output<void>();
  readonly tagWizardClick = output<void>();
  readonly tagManagerClick = output<void>();
  readonly statsClick = output<void>();
  readonly chatClick = output<void>();
  readonly loginClick = output<void>();
  readonly changePasswordClick = output<void>();
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
    window.open('/mixer', '_blank');
  }
}
