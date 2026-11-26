import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
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
import { CreditService } from '../../core/services/credit.service';
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
    <div class="nk-dlg um">
      <header class="nk-dialog__head">
        <mat-icon class="um-ico" aria-hidden="true">people</mat-icon>
        <h2 class="nk-dialog__title">Userverwaltung</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close>✕</button>
      </header>
      <div class="nk-dialog__body um-body">
        @if (loading()) {
          <div class="um-state"><span class="nk-spin" aria-hidden="true"></span>User werden geladen...</div>
        } @else {
          <label class="nk-field">
            <span class="nk-label">Suche nach Username, Name oder IP</span>
            <span class="nk-input">
              <svg class="nk-input__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input class="nk-input__field" [(ngModel)]="searchQuery" placeholder="Suchen..." aria-label="User suchen" />
            </span>
          </label>
          <div class="nk-well um-list">
            @if (filteredUsers().length === 0) {
              <div class="um-state">{{ searchQuery ? 'Keine User gefunden' : 'Keine User vorhanden' }}</div>
            } @else {
              @for (user of filteredUsers(); track user.id) {
                <div [class]="user.isActive ? 'nk-row um-row' : 'nk-row nk-row--off um-row'">
                  <app-user-avatar class="um-av" [userId]="user.id" size="medium" [clickable]="user.role !== 'system'" />
                  <span class="nk-row__main um-main">
                    <span class="um-name">
                      <span class="nk-row__title">{{ user.username }}</span>
                      <span [class]="'um-role um-role--' + user.role">{{ user.role }}</span>
                      @if (!user.isActive) {
                        <span class="um-off">Deaktiviert</span>
                      }
                    </span>
                    @if (user.firstName || user.lastName) {
                      <span class="nk-row__meta um-full">{{ user.firstName }} {{ user.lastName }}</span>
                    }
                    <span class="nk-row__meta">
                      <span matTooltip="IP-Adresse">{{ user.ipAddress || 'Keine IP' }}</span> ·
                      <span matTooltip="Credits">{{ user.credits }} N$</span>
                    </span>
                    <span class="nk-row__meta">
                      Erstellt: {{ formatDate(user.createdAt) }}
                      @if (user.lastLoginAt) {
                        · Letzter Login: {{ formatDate(user.lastLoginAt) }}
                      }
                    </span>
                  </span>
                  @if (user.role !== 'system') {
                    <span class="um-acts">
                      <button type="button" class="nk-key nk-key--sm" matTooltip="+1 Credit" [disabled]="actionInProgress() === user.id" (click)="onGrantCredits(user, 1)">+1 N$</button>
                      <button type="button" class="nk-key nk-key--sm" matTooltip="+5 Credits" [disabled]="actionInProgress() === user.id" (click)="onGrantCredits(user, 5)">+5 N$</button>
                      <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Bearbeiten" matTooltip="Bearbeiten" [disabled]="actionInProgress() === user.id" (click)="onEditUser(user)"><mat-icon>edit</mat-icon></button>
                      <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Passwort zurücksetzen" matTooltip="Passwort zurücksetzen" [disabled]="actionInProgress() === user.id" (click)="onResetPassword(user)"><mat-icon>key</mat-icon></button>
                      <button
                        type="button"
                        [class]="user.isActive ? 'nk-key nk-key--sm nk-key--icon' : 'nk-key nk-key--sm nk-key--icon nk-key--on'"
                        [attr.aria-label]="user.isActive ? 'Deaktivieren' : 'Aktivieren'"
                        [matTooltip]="user.isActive ? 'Deaktivieren' : 'Aktivieren'"
                        [disabled]="actionInProgress() === user.id || user.username === 'admin'"
                        (click)="onToggleActive(user)"
                      >
                        @if (actionInProgress() === user.id) {
                          <span class="nk-spin" aria-hidden="true"></span>
                        } @else {
                          <mat-icon>{{ user.isActive ? 'person' : 'person_off' }}</mat-icon>
                        }
                      </button>
                      <button type="button" class="nk-key nk-key--sm nk-key--icon um-del" aria-label="Löschen" matTooltip="Löschen" [disabled]="actionInProgress() === user.id || user.username === 'admin'" (click)="onDeleteUser(user)"><mat-icon>delete</mat-icon></button>
                    </span>
                  }
                </div>
              }
            }
          </div>
        }
      </div>
      <footer class="nk-dialog__foot um-foot">
        <span class="um-count">
          {{ users().length }} User insgesamt
          @if (inactiveUserCount() > 0) {
            <span class="um-count-off">({{ inactiveUserCount() }} deaktiviert)</span>
          }
        </span>
        <button type="button" class="nk-key" (click)="onCreateUser()"><mat-icon class="um-btn-ico">person_add</mat-icon>Neuer User</button>
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close>Schließen</button>
      </footer>
    </div>
  `,
  styles: `
    .um {
      width: 860px;
      max-width: 100%;
      max-height: 90vh;
    }
    .um-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .um-body {
      overflow: hidden;
    }
    .um-list {
      overflow-y: auto;
      max-height: 62vh;
    }
    .um-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 8px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .um-row {
      min-height: 80px;
      gap: 12px;
    }
    .um-av {
      flex-shrink: 0;
    }
    .um-main {
      gap: 3px;
    }
    .um-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .um-full {
      color: var(--nk-iv);
      font-size: 12px;
    }
    .um-role,
    .um-off {
      height: 16px;
      padding: 0 5px;
      border-radius: 3px;
      font: 700 10px/16px var(--nk-font-mono);
      letter-spacing: 0.5px;
      text-transform: lowercase;
      white-space: nowrap;
    }
    .um-role--admin {
      background: var(--nk-iv);
      color: var(--nk-ink);
      box-shadow: 0 0 8px rgb(255 226 176 / 0.6);
    }
    .um-role--user {
      box-shadow: inset 0 0 0 1px var(--nk-iv-2);
      color: var(--nk-iv);
    }
    .um-role--system {
      background: var(--nk-other-deep);
      color: #cdebff;
      box-shadow: inset 0 0 0 1px var(--nk-other);
    }
    .um-off {
      background: var(--nk-danger);
      color: #ffffff;
      text-transform: none;
    }
    .um-acts {
      display: flex;
      gap: 9px;
      align-items: center;
      padding: 3px;
      flex-shrink: 0;
    }
    .um-acts .mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .um-del {
      color: var(--nk-danger-text);
    }
    .um-foot {
      gap: 14px;
    }
    .um-count {
      flex: 1;
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .um-count-off {
      color: var(--nk-danger-text);
    }
    .um-btn-ico {
      width: 17px;
      height: 17px;
      font-size: 17px;
    }
    @media (max-width: 760px) {
      .um-row {
        flex-wrap: wrap;
      }
      .um-acts {
        width: 100%;
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UserManagementDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<UserManagementDialogComponent>);
  private readonly userService = inject(UserService);
  private readonly creditService = inject(CreditService);
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
      (user) =>
        user.username.toLowerCase().includes(query) ||
        (user.firstName?.toLowerCase() || '').includes(query) ||
        (user.lastName?.toLowerCase() || '').includes(query) ||
        (user.ipAddress?.toLowerCase() || '').includes(query),
    );
  });

  readonly inactiveUserCount = computed(() => {
    return this.users().filter((u) => !u.isActive).length;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.userService.loadUsers().subscribe({
      next: (users) => {
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
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadUsers();
        this.snackBar.open(`User "${result.username}" wurde erstellt`, 'OK', { duration: 2000 });
      }
    });
  }

  onEditUser(user: UserAdmin): void {
    const dialogRef = this.dialog.open(UserEditDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
      data: { user },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadUsers();
        this.snackBar.open(`User "${user.username}" wurde aktualisiert`, 'OK', { duration: 2000 });
      }
    });
  }

  onResetPassword(user: UserAdmin): void {
    const dialogRef = this.dialog.open(PasswordResetDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
      data: { user },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackBar.open(`Passwort für "${user.username}" wurde zurückgesetzt`, 'OK', {
          duration: 2000,
        });
      }
    });
  }

  onToggleActive(user: UserAdmin): void {
    this.actionInProgress.set(user.id);
    this.userService.toggleUserActive(user.id).subscribe({
      next: () => {
        this.users.update((users) =>
          users.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)),
        );
        this.actionInProgress.set(null);
        this.snackBar.open(
          `User "${user.username}" wurde ${user.isActive ? 'deaktiviert' : 'aktiviert'}`,
          'OK',
          { duration: 2000 },
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
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
      data: { user },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.users.update((users) => users.filter((u) => u.id !== user.id));
        this.snackBar.open(`User "${user.username}" wurde gelöscht`, 'OK', { duration: 2000 });
      }
    });
  }

  onGrantCredits(user: UserAdmin, amount: number): void {
    this.actionInProgress.set(user.id);
    this.creditService.grantCredits({ userId: user.id, amount, reason: 'Admin-Bonus' }).subscribe({
      next: (response) => {
        this.users.update((users) =>
          users.map((u) => (u.id === user.id ? { ...u, credits: response.newBalance } : u)),
        );
        this.actionInProgress.set(null);
        this.snackBar.open(`+${amount} Credits für "${user.username}"`, 'OK', { duration: 2000 });
      },
      error: () => {
        this.actionInProgress.set(null);
        this.snackBar.open('Fehler beim Vergeben der Credits', 'OK', { duration: 3000 });
      },
    });
  }
}
