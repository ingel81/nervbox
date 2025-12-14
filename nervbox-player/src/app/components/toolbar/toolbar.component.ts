import { Component, inject, output } from '@angular/core';
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
import { AuthService } from '../../core/services/auth.service';

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

      <div class="spacer"></div>

      <!-- Action Buttons -->
      <div class="actions">
        <!-- Kill All -->
        <button
          mat-icon-button
          class="action-btn"
          matTooltip="Alle Sounds stoppen"
          (click)="killAllClick.emit()"
        >
          <mat-icon>stop_circle</mat-icon>
        </button>

        <!-- Stats -->
        <button
          mat-icon-button
          class="action-btn"
          matTooltip="Statistiken"
          (click)="statsClick.emit()"
        >
          <mat-icon>leaderboard</mat-icon>
        </button>

        <!-- Chat -->
        <button
          mat-icon-button
          class="action-btn"
          matTooltip="Chat"
          (click)="chatClick.emit()"
        >
          <mat-icon>chat</mat-icon>
        </button>

        <!-- User Menu -->
        @if (auth.isLoggedIn()) {
          <button mat-icon-button [matMenuTriggerFor]="userMenu" class="user-btn">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu">
            <div class="menu-header">
              <mat-icon>person</mat-icon>
              <span>{{ auth.currentUser()?.username }}</span>
            </div>
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
      line-height: 24px !important;
    }

    .clear-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: rgba(255, 255, 255, 0.5);
    }

    .spacer {
      flex: 1;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 4px;
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

  // Outputs
  readonly searchChange = output<string>();
  readonly killAllClick = output<void>();
  readonly statsClick = output<void>();
  readonly chatClick = output<void>();
  readonly loginClick = output<void>();

  onSearchChange(): void {
    this.searchChange.emit(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchChange.emit('');
  }
}
