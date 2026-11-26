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
    <div class="nk-dlg ad-sm">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Passwort zurücksetzen</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close [disabled]="saving()">✕</button>
      </header>
      <div class="nk-dialog__body">
        <span class="ad-sub">{{ data.user.username }}</span>
        <label class="nk-field">
          <span class="nk-label">Neues Passwort</span>
          <span class="nk-input"><input class="nk-input__field" type="password" [(ngModel)]="newPassword" name="newPassword" autocomplete="new-password" aria-label="Neues Passwort" /></span>
          <span class="nk-field__hint">Mindestens 4 Zeichen</span>
        </label>
        <label class="nk-field">
          <span class="nk-label">Passwort bestätigen</span>
          <span class="nk-input" [class.nk-input--error]="confirmPassword && newPassword !== confirmPassword">
            <input class="nk-input__field" type="password" [(ngModel)]="confirmPassword" name="confirmPassword" autocomplete="new-password" aria-label="Passwort bestätigen" />
          </span>
          @if (confirmPassword && newPassword !== confirmPassword) {
            <span class="nk-field__hint nk-field__hint--error">Passwörter stimmen nicht überein</span>
          }
        </label>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert"><span class="nk-toast__text">{{ error() }}</span></div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="saving()">Abbrechen</button>
        <button type="button" class="nk-key nk-key--accent" (click)="onSave()" [disabled]="!isValid() || saving()">
          @if (saving()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Passwort setzen
        </button>
      </footer>
    </div>
  `,
  styles: `
    .ad-sm {
      width: 380px;
      max-width: 100%;
    }
    .ad-sub {
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.message || 'Fehler beim Zurücksetzen des Passworts');
      },
    });
  }
}
