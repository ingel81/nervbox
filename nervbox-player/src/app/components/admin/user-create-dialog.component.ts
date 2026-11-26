import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg ad-sm">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Neuer User</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close [disabled]="saving()">✕</button>
      </header>
      <div class="nk-dialog__body">
        <label class="nk-field">
          <span class="nk-label">Username</span>
          <span class="nk-input" [class.nk-input--error]="usernameInput.invalid && usernameInput.touched">
            <input class="nk-input__field" [(ngModel)]="username" #usernameInput="ngModel" name="username" required minlength="3" autocomplete="off" aria-label="Username" />
          </span>
          @if (usernameInput.invalid && usernameInput.touched) {
            <span class="nk-field__hint nk-field__hint--error">Username muss mindestens 3 Zeichen haben</span>
          }
        </label>
        <label class="nk-field">
          <span class="nk-label">Passwort</span>
          <span class="nk-input" [class.nk-input--error]="passwordInput.invalid && passwordInput.touched">
            <input class="nk-input__field" type="password" [(ngModel)]="password" #passwordInput="ngModel" name="password" required minlength="4" autocomplete="new-password" aria-label="Passwort" />
          </span>
          @if (passwordInput.invalid && passwordInput.touched) {
            <span class="nk-field__hint nk-field__hint--error">Passwort muss mindestens 4 Zeichen haben</span>
          }
        </label>
        <div class="nk-field-row">
          <label class="nk-field"><span class="nk-label">Vorname</span><span class="nk-input"><input class="nk-input__field" [(ngModel)]="firstName" name="firstName" aria-label="Vorname" /></span></label>
          <label class="nk-field"><span class="nk-label">Nachname</span><span class="nk-input"><input class="nk-input__field" [(ngModel)]="lastName" name="lastName" aria-label="Nachname" /></span></label>
        </div>
        <div class="nk-field">
          <span class="nk-label">Rolle</span>
          <div class="ad-seg" role="radiogroup" aria-label="Rolle">
            <button type="button" role="radio" [attr.aria-checked]="role === 'user'" [class]="role === 'user' ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'" (click)="role = 'user'">User</button>
            <button type="button" role="radio" [attr.aria-checked]="role === 'admin'" [class]="role === 'admin' ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'" (click)="role = 'admin'">Admin</button>
          </div>
        </div>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert"><span class="nk-toast__text">{{ error() }}</span></div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="saving()">Abbrechen</button>
        <button type="button" class="nk-key nk-key--accent" (click)="onSave()" [disabled]="!username || !password || password.length < 4 || saving()">
          @if (saving()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Erstellen
        </button>
      </footer>
    </div>
  `,
  styles: `
    .ad-sm {
      width: 400px;
      max-width: 100%;
    }
    .ad-seg {
      display: flex;
      gap: 10px;
      padding: 3px;
    }
    .ad-seg .nk-key {
      flex: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
        next: (user) => {
          this.saving.set(false);
          this.dialogRef.close(user);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err.error?.message || 'Fehler beim Erstellen des Users');
        },
      });
  }
}
