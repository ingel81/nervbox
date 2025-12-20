import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService } from '../../core/services/user.service';
import { UserAdmin } from '../../core/models/user.model';

export interface PasswordResetDialogData {
  user: UserAdmin;
}

@Component({
  selector: 'app-password-reset-dialog',
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
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>key</mat-icon>
      Passwort zurücksetzen
    </h2>

    <mat-dialog-content>
      <div class="user-header">
        <mat-icon class="user-avatar">person</mat-icon>
        <span class="username">{{ data.user.username }}</span>
      </div>

      <form class="password-form">
        <mat-form-field appearance="outline">
          <mat-label>Neues Passwort</mat-label>
          <input
            matInput
            type="password"
            [(ngModel)]="newPassword"
            name="newPassword"
            required
            minlength="4"
          />
          <mat-hint>Mindestens 4 Zeichen</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Passwort bestätigen</mat-label>
          <input
            matInput
            type="password"
            [(ngModel)]="confirmPassword"
            name="confirmPassword"
            required
          />
          @if (confirmPassword && newPassword !== confirmPassword) {
            <mat-error>Passwörter stimmen nicht überein</mat-error>
          }
        </mat-form-field>

        @if (error()) {
          <div class="error-message">
            <mat-icon>error</mat-icon>
            {{ error() }}
          </div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving()">Abbrechen</button>
      <button
        mat-raised-button
        color="warn"
        (click)="onSave()"
        [disabled]="!isValid() || saving()"
      >
        @if (saving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Passwort setzen
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #f97316;
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
      min-width: 350px;
    }

    .user-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(249, 115, 22, 0.1);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .user-avatar {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #f97316;
    }

    .username {
      font-weight: 600;
      font-size: 16px;
      color: rgba(255, 255, 255, 0.95);
    }

    .password-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .password-form mat-form-field {
      width: 100%;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      color: #ef4444;
      font-size: 13px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    mat-dialog-actions button mat-spinner {
      display: inline-block;
    }
  `,
})
export class PasswordResetDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<PasswordResetDialogComponent>);
  private readonly userService = inject(UserService);
  readonly data = inject<PasswordResetDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  newPassword = '';
  confirmPassword = '';

  isValid(): boolean {
    return (
      this.newPassword.length >= 4 &&
      this.confirmPassword.length >= 4 &&
      this.newPassword === this.confirmPassword
    );
  }

  onSave(): void {
    if (!this.isValid()) return;

    this.saving.set(true);
    this.error.set(null);

    this.userService.resetPassword(this.data.user.id, { newPassword: this.newPassword }).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close(true);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err.error?.message || 'Fehler beim Zurücksetzen des Passworts');
      },
    });
  }
}
