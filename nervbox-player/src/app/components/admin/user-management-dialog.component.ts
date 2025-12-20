import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UserService } from '../../core/services/user.service';
import { UserAdmin } from '../../core/models/user.model';
import { UserCreateDialogComponent } from './user-create-dialog.component';
import { UserEditDialogComponent } from './user-edit-dialog.component';
import { PasswordResetDialogComponent } from './password-reset-dialog.component';
import { DeleteUserDialogComponent } from './delete-user-dialog.component';
import { UserAvatarComponent } from '../shared/user-avatar/user-avatar.component';

@Component({
  selector: 'app-user-management-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    MatSnackBarModule,
    UserAvatarComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>people</mat-icon>
      Userverwaltung
    </h2>

    <mat-dialog-content>
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="32"></mat-spinner>
          <span>User werden geladen...</span>
        </div>
      } @else {
        <!-- Search -->
        <div class="search-section">
          <mat-form-field appearance="outline" class="search-input">
            <mat-label>Suche nach Username, Name oder IP</mat-label>
            <input matInput [(ngModel)]="searchQuery" placeholder="Suchen..." />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>

        <!-- User list -->
        <div class="user-list nervbox-scrollbar">
          @if (filteredUsers().length === 0) {
            <div class="empty-state">
              <mat-icon>person_off</mat-icon>
              @if (searchQuery) {
                <span>Keine User gefunden</span>
              } @else {
                <span>Keine User vorhanden</span>
              }
            </div>
          } @else {
            @for (user of filteredUsers(); track user.id) {
              <div class="user-item" [class.inactive]="!user.isActive">
                <div class="user-main">
                  <app-user-avatar
                    [userId]="user.id"
                    size="medium"
                    [clickable]="user.role !== 'system'"
                  />
                  <div class="user-info">
                    <div class="user-header">
                      <span class="username">{{ user.username }}</span>
                      <span class="role-badge" [class]="'role-' + user.role">{{ user.role }}</span>
                      @if (!user.isActive) {
                        <span class="status-badge inactive">Deaktiviert</span>
                      }
                    </div>
                    <div class="user-details">
                      @if (user.firstName || user.lastName) {
                        <span class="name">{{ user.firstName }} {{ user.lastName }}</span>
                        <span class="separator">|</span>
                      }
                      <span class="ip" matTooltip="IP-Adresse">{{ user.ipAddress || 'Keine IP' }}</span>
                    </div>
                    <div class="user-dates">
                      <span class="date">Erstellt: {{ formatDate(user.createdAt) }}</span>
                      @if (user.lastLoginAt) {
                        <span class="separator">|</span>
                        <span class="date">Letzter Login: {{ formatDate(user.lastLoginAt) }}</span>
                      }
                    </div>
                  </div>
                </div>
                <div class="user-actions">
                  @if (user.role !== 'system') {
                    <button
                      mat-icon-button
                      (click)="onEditUser(user)"
                      matTooltip="Bearbeiten"
                      [disabled]="actionInProgress() === user.id"
                    >
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      (click)="onResetPassword(user)"
                      matTooltip="Passwort zurücksetzen"
                      [disabled]="actionInProgress() === user.id"
                    >
                      <mat-icon>key</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      (click)="onToggleActive(user)"
                      [matTooltip]="user.isActive ? 'Deaktivieren' : 'Aktivieren'"
                      [disabled]="actionInProgress() === user.id || user.username === 'admin'"
                    >
                      @if (actionInProgress() === user.id) {
                        <mat-spinner diameter="18"></mat-spinner>
                      } @else {
                        <mat-icon [class.active]="user.isActive">
                          {{ user.isActive ? 'person' : 'person_off' }}
                        </mat-icon>
                      }
                    </button>
                    <button
                      mat-icon-button
                      (click)="onDeleteUser(user)"
                      matTooltip="Löschen"
                      [disabled]="actionInProgress() === user.id || user.username === 'admin'"
                    >
                      <mat-icon class="delete-icon">delete</mat-icon>
                    </button>
                  }
                </div>
              </div>
            }
          }
        </div>

        <div class="user-stats">
          {{ users().length }} User insgesamt
          @if (inactiveUserCount() > 0) {
            <span class="inactive-count">({{ inactiveUserCount() }} deaktiviert)</span>
          }
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCreateUser()" class="create-btn">
        <mat-icon>person_add</mat-icon>
        Neuer User
      </button>
      <button mat-button mat-dialog-close>Schließen</button>
    </mat-dialog-actions>
  `,
  styles: `
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #9333ea;
      margin: 0;
      padding: 16px 24px;
    }

    h2 mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    mat-dialog-content {
      padding: 0 24px;
      min-width: 500px;
      max-width: 600px;
      min-height: 400px;
      display: flex;
      flex-direction: column;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      height: 200px;
      color: rgba(255, 255, 255, 0.6);
    }

    .search-section {
      margin-bottom: 16px;
    }

    .search-input {
      width: 100%;
    }

    .user-list {
      flex: 1;
      max-height: 350px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      height: 150px;
      color: rgba(255, 255, 255, 0.4);
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .user-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      transition: background 0.2s;
    }

    .user-item:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .user-item.inactive {
      opacity: 0.6;
      background: rgba(239, 68, 68, 0.05);
    }

    .user-main {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .user-info {
      flex: 1;
      min-width: 0;
    }

    .user-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .username {
      font-weight: 600;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.95);
    }

    .role-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .role-badge.role-admin {
      background: rgba(249, 115, 22, 0.2);
      color: #f97316;
    }

    .role-badge.role-user {
      background: rgba(147, 51, 234, 0.2);
      color: #9333ea;
    }

    .role-badge.role-system {
      background: rgba(100, 116, 139, 0.2);
      color: #94a3b8;
    }

    .status-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }

    .status-badge.inactive {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .user-details {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      margin-top: 2px;
    }

    .user-dates {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 2px;
    }

    .separator {
      margin: 0 4px;
    }

    .ip {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }

    .user-actions {
      display: flex;
      gap: 4px;
    }

    .user-actions button {
      opacity: 0.5;
    }

    .user-item:hover .user-actions button {
      opacity: 1;
    }

    .user-actions mat-icon.active {
      color: #22c55e;
    }

    .user-actions mat-icon.delete-icon {
      color: #ef4444;
    }

    .user-stats {
      padding-top: 12px;
      margin-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      text-align: center;
    }

    .inactive-count {
      color: #ef4444;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    .create-btn {
      background: rgba(147, 51, 234, 0.1);
      color: #9333ea;
    }

    .create-btn mat-icon {
      margin-right: 4px;
    }

    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
  `,
})
export class UserManagementDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<UserManagementDialogComponent>);
  private readonly userService = inject(UserService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly users = signal<UserAdmin[]>([]);
  readonly loading = signal(true);
  readonly actionInProgress = signal<number | null>(null);

  searchQuery = '';

  readonly filteredUsers = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) return this.users();

    return this.users().filter(
      user =>
        user.username.toLowerCase().includes(query) ||
        (user.firstName?.toLowerCase() || '').includes(query) ||
        (user.lastName?.toLowerCase() || '').includes(query) ||
        (user.ipAddress?.toLowerCase() || '').includes(query)
    );
  });

  readonly inactiveUserCount = computed(() => {
    return this.users().filter(u => !u.isActive).length;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.userService.loadUsers().subscribe({
      next: users => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Fehler beim Laden der User', 'OK', { duration: 3000 });
      },
    });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  onCreateUser(): void {
    const dialogRef = this.dialog.open(UserCreateDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
        this.snackBar.open(`User "${result.username}" wurde erstellt`, 'OK', { duration: 2000 });
      }
    });
  }

  onEditUser(user: UserAdmin): void {
    const dialogRef = this.dialog.open(UserEditDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
      data: { user },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
        this.snackBar.open(`User "${user.username}" wurde aktualisiert`, 'OK', { duration: 2000 });
      }
    });
  }

  onResetPassword(user: UserAdmin): void {
    const dialogRef = this.dialog.open(PasswordResetDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
      data: { user },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open(`Passwort für "${user.username}" wurde zurückgesetzt`, 'OK', { duration: 2000 });
      }
    });
  }

  onToggleActive(user: UserAdmin): void {
    this.actionInProgress.set(user.id);
    this.userService.toggleUserActive(user.id).subscribe({
      next: () => {
        this.users.update(users => users.map(u => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
        this.actionInProgress.set(null);
        this.snackBar.open(
          `User "${user.username}" wurde ${user.isActive ? 'deaktiviert' : 'aktiviert'}`,
          'OK',
          { duration: 2000 }
        );
      },
      error: () => {
        this.actionInProgress.set(null);
        this.snackBar.open('Fehler beim Ändern des Status', 'OK', { duration: 3000 });
      },
    });
  }

  onDeleteUser(user: UserAdmin): void {
    const dialogRef = this.dialog.open(DeleteUserDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
      data: { user },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.users.update(users => users.filter(u => u.id !== user.id));
        this.snackBar.open(`User "${user.username}" wurde gelöscht`, 'OK', { duration: 2000 });
      }
    });
  }
}
