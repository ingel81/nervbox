import { Component, inject, signal } from '@angular/core';
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
    <form class="login-dialog" (ngSubmit)="onSubmit()" autocomplete="on">
      <h2 mat-dialog-title>
        <mat-icon class="title-icon">account_circle</mat-icon>
        Anmelden
      </h2>

      <mat-dialog-content>
        <div class="login-form">
          <mat-form-field appearance="outline">
            <mat-label>Benutzername</mat-label>
            <input
              matInput
              [(ngModel)]="username"
              name="username"
              autocomplete="username"
              required
            />
            <mat-icon matPrefix>person</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Passwort</mat-label>
            <input
              matInput
              [type]="hidePassword() ? 'password' : 'text'"
              [(ngModel)]="password"
              name="password"
              autocomplete="current-password"
              required
            />
            <mat-icon matPrefix>lock</mat-icon>
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="hidePassword.set(!hidePassword())"
            >
              <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          @if (error()) {
            <div class="error-message">
              <mat-icon>error</mat-icon>
              {{ error() }}
            </div>
          }

          <div class="register-link-container">
            <span>Noch kein Konto?</span>
            <button type="button" class="register-link" (click)="onRegister()">
              Registrieren
            </button>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="onCancel()" [disabled]="loading()">
          Abbrechen
        </button>
        <button
          mat-flat-button
          class="login-btn"
          type="submit"
          [disabled]="loading() || !username || !password"
        >
          @if (loading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            Anmelden
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .login-dialog {
      min-width: 320px;
    }

    :host {
      display: block;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%);
      border-bottom: 1px solid rgba(147, 51, 234, 0.3);
    }

    .title-icon {
      font-size: 28px !important;
      width: 28px !important;
      height: 28px !important;
      color: #9333ea;
    }

    mat-dialog-content {
      padding: 24px !important;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    mat-form-field {
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
      color: #f87171;
      font-size: 13px;
    }

    .error-message mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    mat-dialog-actions {
      padding: 16px 24px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      flex-wrap: nowrap !important;
      gap: 8px;
    }

    .register-link-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
    }

    .register-link {
      background: none;
      border: none;
      color: #9333ea;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
    }

    .register-link:hover {
      color: #ec4899;
      text-decoration: underline;
    }

    mat-dialog-actions button[mat-button] {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    mat-dialog-actions button[mat-button]:hover {
      color: rgba(255, 255, 255, 0.9) !important;
      background: rgba(255, 255, 255, 0.05) !important;
    }

    .login-btn {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      color: white !important;
      min-width: 100px;
    }

    .login-btn:disabled {
      opacity: 0.5;
    }

    .login-btn mat-spinner {
      margin: 0 auto;
    }

    ::ng-deep .login-btn .mat-mdc-progress-spinner circle {
      stroke: white !important;
    }
  `,
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
      next: user => {
        this.loading.set(false);
        this.dialogRef.close(user);
      },
      error: err => {
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
