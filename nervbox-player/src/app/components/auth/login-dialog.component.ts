import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  template: `
    <form class="nk-dlg" (ngSubmit)="onSubmit()" autocomplete="on">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Anmelden</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          (click)="onCancel()"
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body">
        <label class="nk-field">
          <span class="nk-label">Benutzername</span>
          <span class="nk-input">
            <mat-icon class="nk-input__icon dlg-ico">person</mat-icon>
            <input
              class="nk-input__field"
              [(ngModel)]="username"
              name="username"
              autocomplete="username"
              required
              aria-label="Benutzername"
            />
          </span>
        </label>
        <label class="nk-field">
          <span class="nk-label">Passwort</span>
          <span class="nk-input" [class.nk-input--error]="!!error()">
            <mat-icon class="nk-input__icon dlg-ico">lock</mat-icon>
            <input
              class="nk-input__field"
              [type]="hidePassword() ? 'password' : 'text'"
              [(ngModel)]="password"
              name="password"
              autocomplete="current-password"
              required
              aria-label="Passwort"
            />
            <button
              type="button"
              class="nk-input__eye"
              [attr.aria-label]="hidePassword() ? 'Passwort anzeigen' : 'Passwort verbergen'"
              (click)="hidePassword.set(!hidePassword())"
            >
              <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </span>
        </label>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert">
            <span class="nk-toast__text">{{ error() }}</span>
          </div>
        }
        <span class="dlg-row"
          >Noch kein Konto?
          <button type="button" class="nk-link" (click)="onRegister()">Registrieren</button></span
        >
      </div>
      <footer class="nk-dialog__foot">
        <button
          type="button"
          class="nk-key nk-key--ghost"
          (click)="onCancel()"
          [disabled]="loading()"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          class="nk-key nk-key--accent"
          [disabled]="loading() || !username || !password"
        >
          @if (loading()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Anmelden
        </button>
      </footer>
    </form>
  `,
  styles: `
    .nk-dlg {
      width: 380px;
      max-width: 100%;
    }
    .dlg-ico {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .dlg-row {
      display: flex;
      gap: 8px;
      align-items: baseline;
      font: 500 15px var(--nk-font-ui);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<LoginDialogComponent>);

  username = '';
  password = '';
  readonly hidePassword = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  onSubmit(): void {
    if (!this.username || !this.password || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.authService.login({ username: this.username, password: this.password }).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.dialogRef.close(user);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Login fehlgeschlagen');
      },
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onRegister(): void {
    this.dialogRef.close('register');
  }
}
