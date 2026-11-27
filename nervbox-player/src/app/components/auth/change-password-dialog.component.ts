import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <form class="nk-dlg" (ngSubmit)="onSubmit()">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Kennwort ändern</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close>✕</button>
      </header>
      <div class="nk-dialog__body">
        <label class="nk-field">
          <span class="nk-label">Aktuelles Kennwort</span>
          <span class="nk-input">
            <input class="nk-input__field" [type]="hideOld() ? 'password' : 'text'" [(ngModel)]="oldPassword" name="oldPassword" autocomplete="current-password" required aria-label="Aktuelles Kennwort" />
            <button type="button" class="nk-input__eye" [attr.aria-label]="hideOld() ? 'Kennwort anzeigen' : 'Kennwort verbergen'" (click)="hideOld.set(!hideOld())"><mat-icon>{{ hideOld() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
          </span>
        </label>
        <label class="nk-field">
          <span class="nk-label">Neues Kennwort</span>
          <span class="nk-input">
            <input class="nk-input__field" [type]="hideNew() ? 'password' : 'text'" [(ngModel)]="newPassword1" name="newPassword1" autocomplete="new-password" required aria-label="Neues Kennwort" />
            <button type="button" class="nk-input__eye" [attr.aria-label]="hideNew() ? 'Kennwort anzeigen' : 'Kennwort verbergen'" (click)="hideNew.set(!hideNew())"><mat-icon>{{ hideNew() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
          </span>
        </label>
        <label class="nk-field">
          <span class="nk-label">Neues Kennwort bestätigen</span>
          <span class="nk-input" [class.nk-input--error]="!!newPassword2 && newPassword2 !== newPassword1">
            <input class="nk-input__field" [type]="hideConfirm() ? 'password' : 'text'" [(ngModel)]="newPassword2" name="newPassword2" autocomplete="new-password" required aria-label="Neues Kennwort bestätigen" />
            <button type="button" class="nk-input__eye" [attr.aria-label]="hideConfirm() ? 'Kennwort anzeigen' : 'Kennwort verbergen'" (click)="hideConfirm.set(!hideConfirm())"><mat-icon>{{ hideConfirm() ? 'visibility_off' : 'visibility' }}</mat-icon></button>
          </span>
        </label>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert"><span class="nk-toast__text">{{ error() }}</span></div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="loading()">Abbrechen</button>
        <button type="submit" class="nk-key nk-key--accent" [disabled]="loading() || !isValid()">
          @if (loading()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Ändern
        </button>
      </footer>
    </form>
  `,
  styles: `
    .nk-dlg {
      width: 420px;
      max-width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordDialogComponent {
  private readonly api = inject(ApiService);
  private readonly dialogRef = inject(MatDialogRef<ChangePasswordDialogComponent>);

  oldPassword = '';
  newPassword1 = '';
  newPassword2 = '';

  readonly hideOld = signal(true);
  readonly hideNew = signal(true);
  readonly hideConfirm = signal(true);
  readonly loading = signal(false);
  readonly error = signal('');

  isValid(): boolean {
    return (
      this.oldPassword.length > 0 &&
      this.newPassword1.length > 0 &&
      this.newPassword2.length > 0 &&
      this.newPassword1 === this.newPassword2
    );
  }

  onSubmit(): void {
    if (!this.isValid() || this.loading()) return;

    if (this.newPassword1 !== this.newPassword2) {
      this.error.set('Kennwörter stimmen nicht überein');
      return;
    }

    if (this.newPassword1.length < 3) {
      this.error.set('Kennwort muss mindestens 3 Zeichen lang sein');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.api
      .post<{ success: boolean; error: string }>('/users/changepassword', {
        oldPassword: this.oldPassword,
        newPassword1: this.newPassword1,
        newPassword2: this.newPassword2,
      })
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          if (response.success) {
            this.dialogRef.close(true);
          } else {
            this.error.set(response.error || 'Fehler beim Ändern des Kennworts');
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'Fehler beim Ändern des Kennworts');
        },
      });
  }
}
