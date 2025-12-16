import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sound } from '../../core/models';
import { SoundService } from '../../core/services/sound.service';

export interface DeleteSoundDialogData {
  sound: Sound;
}

@Component({
  selector: 'app-delete-sound-dialog',
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
    <h2 mat-dialog-title>
      <mat-icon class="warn-icon">warning</mat-icon>
      Sound löschen
    </h2>

    <mat-dialog-content>
      <div class="warning-box">
        <p>Diese Aktion kann nicht rückgängig gemacht werden!</p>
        <p>Der Sound <strong>"{{ data.sound.name }}"</strong> wird unwiderruflich gelöscht.</p>
      </div>

      <div class="confirm-section">
        <p>Gib den Namen des Sounds zur Bestätigung ein:</p>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Sound-Name</mat-label>
          <input
            matInput
            [(ngModel)]="confirmName"
            [placeholder]="data.sound.name"
            autocomplete="off"
          />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="deleting()">Abbrechen</button>
      <button
        mat-raised-button
        color="warn"
        (click)="delete()"
        [disabled]="!canDelete() || deleting()"
      >
        @if (deleting()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Endgültig löschen
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ef4444;
      margin: 0;
      padding: 16px 24px;
    }

    .warn-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    mat-dialog-content {
      padding: 0 24px;
      min-width: 400px;
    }

    .warning-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .warning-box p {
      margin: 0 0 8px 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
    }

    .warning-box p:last-child {
      margin-bottom: 0;
    }

    .warning-box strong {
      color: #ef4444;
    }

    .confirm-section p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      margin-bottom: 12px;
    }

    .full-width {
      width: 100%;
    }

    .error-message {
      color: #ef4444;
      font-size: 13px;
      margin-top: 8px;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
  `,
})
export class DeleteSoundDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DeleteSoundDialogComponent>);
  readonly data = inject<DeleteSoundDialogData>(MAT_DIALOG_DATA);
  private readonly soundService = inject(SoundService);

  confirmName = '';
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);

  canDelete(): boolean {
    return this.confirmName.trim().toLowerCase() === this.data.sound.name.toLowerCase();
  }

  delete(): void {
    if (!this.canDelete()) return;

    this.deleting.set(true);
    this.error.set(null);

    this.soundService.deleteSound(this.data.sound.hash).subscribe({
      next: () => {
        this.deleting.set(false);
        this.dialogRef.close(true);
      },
      error: err => {
        this.deleting.set(false);
        this.error.set(err.error?.Error || err.message || 'Fehler beim Löschen');
      },
    });
  }
}
