import { Component, inject, signal } from '@angular/core';
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
    <h2 mat-dialog-title>Kennwort ändern</h2>

    <form (ngSubmit)="onSubmit()">
      <mat-dialog-content>
        <mat-form-field appearance="outline">
          <mat-label>Aktuelles Kennwort</mat-label>
          <input
            matInput
            [type]="hideOld() ? 'password' : 'text'"
            [(ngModel)]="oldPassword"
            name="oldPassword"
            required
            autocomplete="current-password"
          />
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="hideOld.set(!hideOld())"
          >
            <mat-icon>{{ hideOld() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Neues Kennwort</mat-label>
          <input
            matInput
            [type]="hideNew() ? 'password' : 'text'"
            [(ngModel)]="newPassword1"
            name="newPassword1"
            required
            autocomplete="new-password"
          />
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="hideNew.set(!hideNew())"
          >
            <mat-icon>{{ hideNew() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Neues Kennwort bestätigen</mat-label>
          <input
            matInput
            [type]="hideConfirm() ? 'password' : 'text'"
            [(ngModel)]="newPassword2"
            name="newPassword2"
            required
            autocomplete="new-password"
          />
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="hideConfirm.set(!hideConfirm())"
          >
            <mat-icon>{{ hideConfirm() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>

        @if (error()) {
          <div class="error-message">{{ error() }}</div>
        }
      </mat-dialog-content>

      <mat-dialog-actions>
        <button mat-button type="button" mat-dialog-close [disabled]="loading()">
          Abbrechen
        </button>
        <button
          mat-flat-button
          type="submit"
          class="submit-btn"
          [disabled]="loading() || !isValid()"
        >
          @if (loading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            Ändern
          }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 320px;
    }

    mat-form-field {
      width: 100%;
    }

    .error-message {
      color: #ef4444;
      font-size: 13px;
      padding: 8px 12px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 6px;
      border-left: 3px solid #ef4444;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      gap: 8px;
      justify-content: flex-end;
    }

    .submit-btn {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      color: white;
      min-width: 100px;
    }

    .submit-btn:disabled {
      opacity: 0.5;
    }

    .submit-btn mat-spinner {
      display: inline-block;
    }

    ::ng-deep .submit-btn .mat-mdc-progress-spinner circle {
      stroke: white !important;
    }
  `,
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
        next: response => {
          this.loading.set(false);
          if (response.success) {
            this.dialogRef.close(true);
          } else {
            this.error.set(response.error || 'Fehler beim Ändern des Kennworts');
          }
        },
        error: err => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'Fehler beim Ändern des Kennworts');
        },
      });
  }
}
