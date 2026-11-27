import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg ad-sm">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title ad-danger">User löschen</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          mat-dialog-close
          [disabled]="deleting()"
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body">
        <div class="nk-alert" role="alert">
          <span class="nk-alert__title">Achtung!</span>
          <span
            >Der User <b>"{{ data.user.username }}"</b> wird unwiderruflich gelöscht. Alle
            zugehörigen Daten (Favoriten, Statistiken, etc.) gehen verloren.</span
          >
        </div>
        <label class="nk-field">
          <span class="nk-field__hint">Zur Bestätigung bitte den Usernamen eingeben:</span>
          <span class="nk-label">Username</span>
          <span class="nk-input"
            ><input
              class="nk-input__field"
              [(ngModel)]="confirmUsername"
              [placeholder]="data.user.username"
              autocomplete="off"
              aria-label="Username zur Bestätigung"
          /></span>
        </label>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert">
            <span class="nk-toast__text">{{ error() }}</span>
          </div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="deleting()">
          Abbrechen
        </button>
        <button
          type="button"
          class="nk-key nk-key--danger"
          (click)="onDelete()"
          [disabled]="confirmUsername !== data.user.username || deleting()"
        >
          @if (deleting()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          User löschen
        </button>
      </footer>
    </div>
  `,
  styles: `
    .ad-sm {
      width: 400px;
      max-width: 100%;
    }
    .ad-danger {
      color: var(--nk-danger-text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      error: (err) => {
        this.deleting.set(false);
        this.error.set(err.error?.message || 'Fehler beim Löschen des Users');
      },
    });
  }
}
