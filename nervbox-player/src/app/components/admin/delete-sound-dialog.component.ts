import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg sd">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title sd-danger">Sound löschen</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close [disabled]="deleting()">✕</button>
      </header>
      <div class="nk-dialog__body">
        <div class="nk-alert" role="alert">
          <span class="nk-alert__title">Diese Aktion kann nicht rückgängig gemacht werden!</span>
          <span>Der Sound <b>"{{ data.sound.name }}"</b> wird unwiderruflich gelöscht.</span>
        </div>
        <label class="nk-field">
          <span class="nk-field__hint">Gib den Namen des Sounds zur Bestätigung ein:</span>
          <span class="nk-label">Sound-Name</span>
          <span class="nk-input"><input class="nk-input__field" [(ngModel)]="confirmName" [placeholder]="data.sound.name" autocomplete="off" aria-label="Sound-Name zur Bestätigung" /></span>
        </label>
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert"><span class="nk-toast__text">{{ error() }}</span></div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="deleting()">Abbrechen</button>
        <button type="button" class="nk-key nk-key--danger" (click)="delete()" [disabled]="!canDelete() || deleting()">
          @if (deleting()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Endgültig löschen
        </button>
      </footer>
    </div>
  `,
  styles: `
    .sd {
      width: 420px;
      max-width: 100%;
    }
    .sd-danger {
      color: var(--nk-danger-text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      error: (err) => {
        this.deleting.set(false);
        this.error.set(err.error?.Error || err.message || 'Fehler beim Löschen');
      },
    });
  }
}
