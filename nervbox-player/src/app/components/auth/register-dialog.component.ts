import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register-dialog',
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
    MatCheckboxModule,
  ],
  template: `
    <form class="nk-dlg" (ngSubmit)="onSubmit()" autocomplete="on">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Registrieren</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" (click)="onCancel()">✕</button>
      </header>
      <div class="nk-dialog__body">
        <label class="nk-field">
          <span class="nk-label">Benutzername</span>
          <span class="nk-input">
            <input class="nk-input__field" [(ngModel)]="username" name="username" autocomplete="username" required minlength="3" aria-label="Benutzername" />
          </span>
        </label>
        <div class="nk-field-row">
          <label class="nk-field">
            <span class="nk-label">Vorname</span>
            <span class="nk-input"><input class="nk-input__field" [(ngModel)]="firstname" name="firstname" autocomplete="given-name" aria-label="Vorname" /></span>
          </label>
          <label class="nk-field">
            <span class="nk-label">Nachname</span>
            <span class="nk-input"><input class="nk-input__field" [(ngModel)]="lastname" name="lastname" autocomplete="family-name" aria-label="Nachname" /></span>
          </label>
        </div>
        <label class="nk-field">
          <span class="nk-label">Passwort</span>
          <span class="nk-input">
            <input class="nk-input__field" [type]="hidePassword() ? 'password' : 'text'" [(ngModel)]="password" name="password" autocomplete="new-password" required minlength="6" aria-label="Passwort" />
            <button type="button" class="nk-input__eye" [attr.aria-label]="hidePassword() ? 'Passwort anzeigen' : 'Passwort verbergen'" (click)="hidePassword.set(!hidePassword())">
              <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </span>
        </label>
        <label class="nk-field">
          <span class="nk-label">Passwort bestätigen</span>
          <span class="nk-input" [class.nk-input--error]="!!confirmPassword && confirmPassword !== password">
            <input class="nk-input__field" [type]="hidePassword() ? 'password' : 'text'" [(ngModel)]="confirmPassword" name="confirmPassword" autocomplete="new-password" required aria-label="Passwort bestätigen" />
          </span>
        </label>
        <button type="button" role="checkbox" [attr.aria-checked]="terms" [class]="terms ? 'nk-check nk-check--on dlg-check' : 'nk-check dlg-check'" (click)="terms = !terms">
          <span class="nk-check__box" aria-hidden="true">✓</span>Ich akzeptiere die Nutzungsbedingungen
        </button>
        <span class="nk-field__hint dlg-info"><span class="nk-led nk-led--dot nk-led--warn" aria-hidden="true"></span>Pro IP-Adresse ist nur ein Account erlaubt.</span>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert"><span class="nk-toast__text">{{ error() }}</span></div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" (click)="onCancel()" [disabled]="loading()">Abbrechen</button>
        <button type="submit" class="nk-key nk-key--accent" [disabled]="loading() || !isValid()">
          @if (loading()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Registrieren
        </button>
      </footer>
    </form>
  `,
  styles: `
    .nk-dlg {
      width: 460px;
      max-width: 100%;
    }
    .dlg-check {
      border: 0;
      padding: 4px 3px;
      background: transparent;
      align-self: flex-start;
    }
    .dlg-info {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class RegisterDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<RegisterDialogComponent>);

  username = '';
  firstname = '';
  lastname = '';
  password = '';
  confirmPassword = '';
  terms = false;

  readonly hidePassword = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  isValid(): boolean {
    return (
      this.username.length >= 3 &&
      this.password.length >= 6 &&
      this.password === this.confirmPassword &&
      this.terms
    );
  }

  onSubmit(): void {
    if (!this.isValid() || this.loading()) return;

    if (this.password !== this.confirmPassword) {
      this.error.set('Passwörter stimmen nicht überein');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authService
      .register({
        username: this.username,
        password: this.password,
        confirmPassword: this.confirmPassword,
        firstname: this.firstname || undefined,
        lastname: this.lastname || undefined,
        terms: this.terms,
      })
      .subscribe({
        next: (user) => {
          this.loading.set(false);
          this.dialogRef.close(user);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'Registrierung fehlgeschlagen');
        },
      });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
