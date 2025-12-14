import { Component, inject, signal } from '@angular/core';
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
    <form class="register-dialog" (ngSubmit)="onSubmit()" autocomplete="on">
      <h2 mat-dialog-title>
        <mat-icon class="title-icon">person_add</mat-icon>
        Registrieren
      </h2>

      <mat-dialog-content>
        <div class="register-form">
          <mat-form-field appearance="outline">
            <mat-label>Benutzername</mat-label>
            <input
              matInput
              [(ngModel)]="username"
              name="username"
              autocomplete="username"
              required
              minlength="3"
            />
            <mat-icon matPrefix>person</mat-icon>
          </mat-form-field>

          <div class="name-row">
            <mat-form-field appearance="outline">
              <mat-label>Vorname</mat-label>
              <input
                matInput
                [(ngModel)]="firstname"
                name="firstname"
                autocomplete="given-name"
              />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nachname</mat-label>
              <input
                matInput
                [(ngModel)]="lastname"
                name="lastname"
                autocomplete="family-name"
              />
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>Passwort</mat-label>
            <input
              matInput
              [type]="hidePassword() ? 'password' : 'text'"
              [(ngModel)]="password"
              name="password"
              autocomplete="new-password"
              required
              minlength="6"
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

          <mat-form-field appearance="outline">
            <mat-label>Passwort bestätigen</mat-label>
            <input
              matInput
              [type]="hidePassword() ? 'password' : 'text'"
              [(ngModel)]="confirmPassword"
              name="confirmPassword"
              autocomplete="new-password"
              required
            />
            <mat-icon matPrefix>lock_outline</mat-icon>
          </mat-form-field>

          <div class="terms-row">
            <mat-checkbox [(ngModel)]="terms" name="terms" color="primary">
              Ich akzeptiere die Nutzungsbedingungen
            </mat-checkbox>
          </div>

          <div class="info-message">
            <mat-icon>info</mat-icon>
            <span>Pro IP-Adresse ist nur ein Account erlaubt.</span>
          </div>

          @if (error()) {
            <div class="error-message">
              <mat-icon>error</mat-icon>
              {{ error() }}
            </div>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="onCancel()" [disabled]="loading()">
          Abbrechen
        </button>
        <button
          mat-flat-button
          class="register-btn"
          type="submit"
          [disabled]="loading() || !isValid()"
        >
          @if (loading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            Registrieren
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .register-dialog {
      min-width: 380px;
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

    .register-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    mat-form-field {
      width: 100%;
    }

    .name-row {
      display: flex;
      gap: 12px;
    }

    .name-row mat-form-field {
      flex: 1;
    }

    .terms-row {
      margin: 8px 0;
    }

    .info-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: rgba(147, 51, 234, 0.1);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
    }

    .info-message mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #9333ea;
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
    }

    .register-btn {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      color: white !important;
      min-width: 120px;
    }

    .register-btn:disabled {
      opacity: 0.5;
    }

    .register-btn mat-spinner {
      margin: 0 auto;
    }

    ::ng-deep .register-btn .mat-mdc-progress-spinner circle {
      stroke: white !important;
    }

    ::ng-deep .mat-mdc-checkbox .mdc-checkbox__background {
      border-color: rgba(147, 51, 234, 0.5) !important;
    }

    ::ng-deep .mat-mdc-checkbox.mat-primary .mdc-checkbox--selected ~ .mdc-checkbox__ripple {
      background: rgba(147, 51, 234, 0.2) !important;
    }
  `,
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
        next: user => {
          this.loading.set(false);
          this.dialogRef.close(user);
        },
        error: err => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'Registrierung fehlgeschlagen');
        },
      });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
