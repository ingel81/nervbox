import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { UserService } from '../../core/services/user.service';
import { UserAdmin } from '../../core/models/user.model';

export interface UserEditDialogData {
  user: UserAdmin;
}

@Component({
  selector: 'app-user-edit-dialog',
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
    MatSlideToggleModule,
  ],
  template: `
    <div class="nk-dlg ad-sm">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">User bearbeiten</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close [disabled]="saving()">✕</button>
      </header>
      <div class="nk-dialog__body">
        <span class="ad-sub">{{ data.user.username }}</span>
        <div class="nk-field-row">
          <label class="nk-field"><span class="nk-label">Vorname</span><span class="nk-input"><input class="nk-input__field" [(ngModel)]="firstName" name="firstName" aria-label="Vorname" /></span></label>
          <label class="nk-field"><span class="nk-label">Nachname</span><span class="nk-input"><input class="nk-input__field" [(ngModel)]="lastName" name="lastName" aria-label="Nachname" /></span></label>
        </div>
        <div class="nk-field">
          <span class="nk-label">Rolle</span>
          <div class="ad-seg" role="radiogroup" aria-label="Rolle">
            <button type="button" role="radio" [attr.aria-checked]="role === 'user'" [class]="role === 'user' ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'" [disabled]="data.user.username === 'admin'" (click)="role = 'user'">User</button>
            <button type="button" role="radio" [attr.aria-checked]="role === 'admin'" [class]="role === 'admin' ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'" [disabled]="data.user.username === 'admin'" (click)="role = 'admin'">Admin</button>
          </div>
          @if (data.user.username === 'admin') {
            <span class="nk-field__hint">Admin-Rolle kann nicht geändert werden</span>
          }
        </div>
        <span class="ad-switch">
          <button type="button" role="switch" [attr.aria-checked]="isActive" [class]="isActive ? 'nk-switch nk-switch--on' : 'nk-switch'" aria-label="User ist aktiv" [disabled]="data.user.username === 'admin'" (click)="isActive = !isActive"><span class="nk-switch__knob" aria-hidden="true"></span></button>
          User ist aktiv
        </span>
        @if (data.user.username === 'admin') {
          <span class="nk-field__hint">Admin kann nicht deaktiviert werden</span>
        }
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert"><span class="nk-toast__text">{{ error() }}</span></div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="saving()">Abbrechen</button>
        <button type="button" class="nk-key nk-key--accent" (click)="onSave()" [disabled]="saving()">
          @if (saving()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Speichern
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
    .ad-seg {
      display: flex;
      gap: 10px;
      padding: 3px;
    }
    .ad-seg .nk-key {
      flex: 1;
    }
    .ad-switch {
      display: flex;
      align-items: center;
      gap: 12px;
      font: 600 15px var(--nk-font-ui);
      padding: 2px 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UserEditDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<UserEditDialogComponent>);
  private readonly userService = inject(UserService);
  readonly data = inject<UserEditDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  firstName = this.data.user.firstName || '';
  lastName = this.data.user.lastName || '';
  role = this.data.user.role;
  isActive = this.data.user.isActive;

  onSave(): void {
    this.saving.set(true);
    this.error.set(null);

    this.userService
      .updateUser(this.data.user.id, {
        firstName: this.firstName || undefined,
        lastName: this.lastName || undefined,
        role: this.role,
        isActive: this.isActive,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err.error?.message || 'Fehler beim Speichern');
        },
      });
  }
}
