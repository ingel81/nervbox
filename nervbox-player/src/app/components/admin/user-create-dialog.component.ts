import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-user-create-dialog',
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
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>person_add</mat-icon>
      Neuer User
    </h2>

    <mat-dialog-content>
      <form #userForm="ngForm" class="user-form">
        <mat-form-field appearance="outline">
          <mat-label>Username</mat-label>
          <input
            matInput
            [(ngModel)]="username"
            name="username"
            required
            minlength="3"
            #usernameInput="ngModel"
          />
          @if (usernameInput.invalid && usernameInput.touched) {
            <mat-error>Username muss mindestens 3 Zeichen haben</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Passwort</mat-label>
          <input
            matInput
            type="password"
            [(ngModel)]="password"
            name="password"
            required
            minlength="4"
            #passwordInput="ngModel"
          />
          @if (passwordInput.invalid && passwordInput.touched) {
            <mat-error>Passwort muss mindestens 4 Zeichen haben</mat-error>
          }
        </mat-form-field>

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
          <mat-select [(ngModel)]="role" name="role">
            <mat-option value="user">User</mat-option>
            <mat-option value="admin">Admin</mat-option>
          </mat-select>
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
        color="primary"
        (click)="onSave()"
        [disabled]="!username || !password || password.length < 4 || saving()"
      >
        @if (saving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Erstellen
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
export class UserCreateDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<UserCreateDialogComponent>);
  private readonly userService = inject(UserService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  username = '';
  password = '';
  firstName = '';
  lastName = '';
  role = 'user';

  onSave(): void {
    if (!this.username || !this.password || this.password.length < 4) return;

    this.saving.set(true);
    this.error.set(null);

    this.userService
      .createUser({
        username: this.username,
        password: this.password,
        firstName: this.firstName || undefined,
        lastName: this.lastName || undefined,
        role: this.role,
      })
      .subscribe({
        next: user => {
          this.saving.set(false);
          this.dialogRef.close(user);
        },
        error: err => {
          this.saving.set(false);
          this.error.set(err.error?.message || 'Fehler beim Erstellen des Users');
        },
      });
  }
}
