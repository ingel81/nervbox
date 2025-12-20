import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { UserService } from '../../core/services/user.service';
import { UserAdmin } from '../../core/models/user.model';

export interface UserEditDialogData {
  user: UserAdmin;
}

@Component({
  selector: 'app-user-edit-dialog',
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
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>edit</mat-icon>
      User bearbeiten
    </h2>

    <mat-dialog-content>
      <div class="user-header">
        <mat-icon class="user-avatar">person</mat-icon>
        <span class="username">{{ data.user.username }}</span>
      </div>

      <form class="user-form">
        <div class="name-row">
          <mat-form-field appearance="outline">
            <mat-label>Vorname</mat-label>
            <input matInput [(ngModel)]="firstName" name="firstName" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Nachname</mat-label>
            <input matInput [(ngModel)]="lastName" name="lastName" />
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Rolle</mat-label>
          <mat-select [(ngModel)]="role" name="role" [disabled]="data.user.username === 'admin'">
            <mat-option value="user">User</mat-option>
            <mat-option value="admin">Admin</mat-option>
          </mat-select>
          @if (data.user.username === 'admin') {
            <mat-hint>Admin-Rolle kann nicht geändert werden</mat-hint>
          }
        </mat-form-field>

        <div class="status-toggle">
          <mat-slide-toggle
            [(ngModel)]="isActive"
            name="isActive"
            [disabled]="data.user.username === 'admin'"
          >
            User ist aktiv
          </mat-slide-toggle>
          @if (data.user.username === 'admin') {
            <span class="hint">Admin kann nicht deaktiviert werden</span>
          }
        </div>

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
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="saving()">
        @if (saving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Speichern
        }
      </button>
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
      min-width: 350px;
    }

    .user-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(147, 51, 234, 0.1);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .user-avatar {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #9333ea;
    }

    .username {
      font-weight: 600;
      font-size: 16px;
      color: rgba(255, 255, 255, 0.95);
    }

    .user-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .user-form mat-form-field {
      width: 100%;
    }

    .name-row {
      display: flex;
      gap: 12px;
    }

    .name-row mat-form-field {
      flex: 1;
    }

    .status-toggle {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 0;
    }

    .status-toggle .hint {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      margin-left: 48px;
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
export class UserEditDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<UserEditDialogComponent>);
  private readonly userService = inject(UserService);
  readonly data = inject<UserEditDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  firstName = this.data.user.firstName || '';
  lastName = this.data.user.lastName || '';
  role = this.data.user.role;
  isActive = this.data.user.isActive;

  onSave(): void {
    this.saving.set(true);
    this.error.set(null);

    this.userService
      .updateUser(this.data.user.id, {
        firstName: this.firstName || undefined,
        lastName: this.lastName || undefined,
        role: this.role,
        isActive: this.isActive,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogRef.close(true);
        },
        error: err => {
          this.saving.set(false);
          this.error.set(err.error?.message || 'Fehler beim Speichern');
        },
      });
  }
}
