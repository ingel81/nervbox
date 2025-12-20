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

export interface DeleteUserDialogData {
  user: UserAdmin;
}

@Component({
  selector: 'app-delete-user-dialog',
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
      <mat-icon>delete</mat-icon>
      User löschen
    </h2>

    <mat-dialog-content>
      <div class="warning-box">
        <mat-icon>warning</mat-icon>
        <div class="warning-text">
          <strong>Achtung!</strong>
          <p>
            Der User <strong>"{{ data.user.username }}"</strong> wird unwiderruflich gelöscht.
            Alle zugehörigen Daten (Favoriten, Statistiken, etc.) gehen verloren.
          </p>
        </div>
      </div>

      <div class="confirm-section">
        <p>Zur Bestätigung bitte den Usernamen eingeben:</p>
        <mat-form-field appearance="outline">
          <mat-label>Username</mat-label>
          <input
            matInput
            [(ngModel)]="confirmUsername"
            [placeholder]="data.user.username"
          />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-message">
          <mat-icon>error</mat-icon>
          {{ error() }}
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="deleting()">Abbrechen</button>
      <button
        mat-raised-button
        color="warn"
        (click)="onDelete()"
        [disabled]="confirmUsername !== data.user.username || deleting()"
      >
        @if (deleting()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          User löschen
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ef4444;
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

    .warning-box {
      display: flex;
      gap: 12px;
      padding: 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .warning-box mat-icon {
      color: #ef4444;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .warning-text {
      flex: 1;
    }

    .warning-text strong {
      color: #ef4444;
    }

    .warning-text p {
      margin: 8px 0 0;
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      line-height: 1.5;
    }

    .confirm-section {
      margin-top: 16px;
    }

    .confirm-section p {
      margin: 0 0 12px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
    }

    .confirm-section mat-form-field {
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
      margin-top: 12px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    mat-dialog-actions button mat-spinner {
      display: inline-block;
    }
  `,
})
export class DeleteUserDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DeleteUserDialogComponent>);
  private readonly userService = inject(UserService);
  readonly data = inject<DeleteUserDialogData>(MAT_DIALOG_DATA);

  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);

  confirmUsername = '';

  onDelete(): void {
    if (this.confirmUsername !== this.data.user.username) return;

    this.deleting.set(true);
    this.error.set(null);

    this.userService.deleteUser(this.data.user.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.dialogRef.close(true);
      },
      error: err => {
        this.deleting.set(false);
        this.error.set(err.error?.message || 'Fehler beim Löschen des Users');
      },
    });
  }
}
