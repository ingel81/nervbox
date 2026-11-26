import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UploadService, UploadResponse } from '../../core/services/upload.service';
import { SoundService } from '../../core/services/sound.service';
import { tagToneStyle } from '../../shared/tag-tone';

interface FileUploadItem {
  file: File;
  displayName: string;
  selectedTags: string[];
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: UploadResponse;
}

@Component({
  selector: 'app-sound-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatDividerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="nk-dlg up">
      <header class="nk-dialog__head">
        <mat-icon class="up-ico" aria-hidden="true">upload_file</mat-icon>
        <h2 class="nk-dialog__title">Sounds hochladen</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close [disabled]="isUploading()">✕</button>
      </header>
      <div class="nk-dialog__body up-body">
        <input type="file" #fileInput [accept]="uploadService.getAcceptString()" multiple hidden (change)="onFilesSelected($event)" />
        <div class="nk-drop up-drop">
          <button type="button" class="nk-key" (click)="fileInput.click()" [disabled]="isUploading()">
            <mat-icon class="up-btn-ico">folder_open</mat-icon>Dateien auswählen
          </button>
          <span class="nk-drop__hint">.mp3, .wav, .ogg</span>
        </div>

        @if (files().length > 0) {
          <div class="nk-well up-list">
            @for (item of files(); track item.file.name; let i = $index) {
              <div class="up-file">
                <div class="up-line">
                  <span [class]="'up-state up-state--' + item.status" [attr.aria-label]="statusLabel(item.status)">{{ statusGlyph(item.status) }}</span>
                  <span class="nk-row__title up-name" [matTooltip]="item.file.name">{{ item.displayName }}</span>
                  <span class="nk-row__meta">{{ formatFileSize(item.file.size) }}</span>
                  @if (item.status === 'pending') {
                    <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Entfernen" matTooltip="Entfernen" (click)="removeFile(i)">✕</button>
                  }
                </div>
                @if (item.status === 'pending') {
                  <div class="up-line up-line--tags">
                    <span class="nk-label up-tags-label">Tags</span>
                    <div class="up-chips">
                      @for (tag of availableTags(); track tag.name) {
                        <button
                          type="button"
                          [class]="item.selectedTags.includes(tag.name) ? 'nk-tag nk-tag--selected' : 'nk-tag'"
                          [style]="tone(tag.name)"
                          [attr.aria-pressed]="item.selectedTags.includes(tag.name)"
                          (click)="toggleTag(i, tag.name)"
                        ><span class="nk-tag__lens" aria-hidden="true"></span>#{{ tag.name }}</button>
                      }
                    </div>
                  </div>
                } @else if (item.selectedTags.length > 0) {
                  <div class="up-line up-line--tags">
                    @for (tagName of item.selectedTags; track tagName) {
                      <span class="nk-chip up-chip">#{{ tagName }}</span>
                    }
                  </div>
                }
                @if (item.status === 'uploading' || item.status === 'success') {
                  <span [class]="item.status === 'success' ? 'nk-progress' : 'nk-progress nk-progress--lamp'" role="progressbar" [attr.aria-valuenow]="item.progress">
                    <span class="nk-progress__fill" [style.width.%]="item.progress"></span>
                  </span>
                }
                @if (item.error) {
                  <span class="nk-field__hint nk-field__hint--error">{{ item.error }}</span>
                }
              </div>
            }
          </div>
        } @else {
          <div class="up-empty">Wähle Audiodateien zum Hochladen aus</div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close [disabled]="isUploading()">{{ allDone() ? 'Schließen' : 'Abbrechen' }}</button>
        @if (!allDone()) {
          <button type="button" class="nk-key nk-key--accent" [disabled]="!canUpload() || isUploading()" (click)="uploadAll()">
            @if (isUploading()) {
              <span class="nk-spin" aria-hidden="true"></span>
              Hochladen...
            } @else {
              <mat-icon class="up-btn-ico">cloud_upload</mat-icon>
              Alle hochladen ({{ pendingCount() }})
            }
          </button>
        }
      </footer>
    </div>
  `,
  styles: `
    .up {
      width: 700px;
      max-width: 100%;
      max-height: 90vh;
    }
    .up-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .up-body {
      gap: 14px;
      overflow-y: auto;
    }
    .up-drop {
      flex-direction: row;
      gap: 16px;
      padding: 16px;
    }
    .up-btn-ico {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .up-list {
      padding: 2px 4px;
    }
    .up-file {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgb(0 0 0 / 0.4);
      box-shadow: 0 1px 0 rgb(255 226 176 / 0.05);
    }
    .up-line {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .up-line--tags {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 8px;
    }
    .up-tags-label {
      padding-top: 6px;
    }
    .up-name {
      flex: 1;
      min-width: 0;
    }
    .up-state {
      width: 26px;
      height: 26px;
      flex-shrink: 0;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font: 800 13px/1 var(--nk-font-ui);
    }
    .up-state--success {
      background: var(--nk-own);
      color: #0b1712;
      box-shadow: 0 0 8px rgb(75 229 133 / 0.8);
    }
    .up-state--uploading {
      background: var(--nk-other);
      color: #0b1712;
      box-shadow: 0 0 8px rgb(111 203 255 / 0.8);
    }
    .up-state--pending {
      background: #0e0c0a;
      color: var(--nk-iv);
      box-shadow: inset 0 0 0 1.5px var(--nk-iv-3);
    }
    .up-state--error {
      background: var(--nk-danger-lit);
      color: #ffffff;
      box-shadow: 0 0 8px rgb(224 72 60 / 0.8);
    }
    .up-chips {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 3px;
    }
    .up-chips .nk-tag {
      height: 24px;
      font-size: 13px;
    }
    .up-chip {
      --nk-key-line: rgb(255 244 216 / 0.6);
      color: var(--nk-iv);
    }
    .up-empty {
      padding: 18px 6px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SoundUploadDialogComponent {
  readonly uploadService = inject(UploadService);
  private readonly soundService = inject(SoundService);
  private readonly dialogRef = inject(MatDialogRef<SoundUploadDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);

  readonly files = signal<FileUploadItem[]>([]);
  readonly isUploading = signal(false);

  readonly availableTags = computed(() => this.soundService.tags());

  readonly pendingCount = computed(() => this.files().filter((f) => f.status === 'pending').length);

  readonly canUpload = computed(() => this.files().some((f) => f.status === 'pending'));

  readonly allDone = computed(
    () =>
      this.files().length > 0 &&
      this.files().every((f) => f.status === 'success' || f.status === 'error'),
  );

  constructor() {
    // Load tags if not already loaded
    if (this.soundService.tags().length === 0) {
      this.soundService.loadTags().subscribe();
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const newFiles: FileUploadItem[] = [];

    for (const file of Array.from(input.files)) {
      // Validate file
      const validation = this.uploadService.validateFile(file);

      if (!validation.valid) {
        this.snackBar.open(`${file.name}: ${validation.error}`, 'OK', {
          duration: 5000,
          panelClass: 'error-snackbar',
        });
        continue;
      }

      // Check for duplicates
      if (this.files().some((f) => f.file.name === file.name)) {
        this.snackBar.open(`${file.name} ist bereits in der Liste`, 'OK', {
          duration: 3000,
        });
        continue;
      }

      newFiles.push({
        file,
        displayName: this.uploadService.getDisplayName(file.name),
        selectedTags: [],
        progress: 0,
        status: 'pending',
      });
    }

    this.files.update((files) => [...files, ...newFiles]);

    // Reset input for re-selection
    input.value = '';
  }

  removeFile(index: number): void {
    this.files.update((files) => files.filter((_, i) => i !== index));
  }

  onTagsChange(fileIndex: number, tags: string[]): void {
    this.files.update((files) => {
      const updated = [...files];
      updated[fileIndex] = { ...updated[fileIndex], selectedTags: tags };
      return updated;
    });
  }

  async uploadAll(): Promise<void> {
    const pendingFiles = this.files().filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    this.isUploading.set(true);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < this.files().length; i++) {
      const item = this.files()[i];
      if (item.status !== 'pending') continue;

      // Update status to uploading
      this.updateFileStatus(i, 'uploading', 0);

      try {
        await new Promise<void>((resolve, _reject) => {
          this.uploadService.uploadSound(item.file, item.selectedTags).subscribe({
            next: ({ progress, result }) => {
              this.updateFileProgress(i, progress);
              if (result) {
                this.updateFileResult(i, result);
              }
            },
            error: (err) => {
              let message = 'Upload fehlgeschlagen';
              if (err.status === 409) {
                message = 'Sound existiert bereits';
              } else if (err.status === 401) {
                message = 'Nicht angemeldet';
              } else if (err.status === 413) {
                message = 'Datei zu groß';
              } else if (err.error?.error) {
                message = err.error.error;
              } else if (err.message) {
                message = err.message;
              }
              this.updateFileError(i, message);
              errorCount++;
              resolve(); // Don't reject, continue with next file
            },
            complete: () => {
              if (this.files()[i].status !== 'error') {
                this.updateFileStatus(i, 'success', 100);
                successCount++;
              }
              resolve();
            },
          });
        });
      } catch {
        // Already handled in error callback
      }
    }

    this.isUploading.set(false);

    // Show summary
    if (successCount > 0) {
      this.snackBar.open(
        `${successCount} Sound${successCount > 1 ? 's' : ''} erfolgreich hochgeladen!`,
        'OK',
        { duration: 4000 },
      );

      // Reload sounds in the main app
      this.soundService.loadSounds().subscribe();
    }

    if (errorCount > 0 && successCount === 0) {
      this.snackBar.open(`${errorCount} Upload${errorCount > 1 ? 's' : ''} fehlgeschlagen`, 'OK', {
        duration: 4000,
        panelClass: 'error-snackbar',
      });
    }
  }

  private updateFileStatus(
    index: number,
    status: FileUploadItem['status'],
    progress: number,
  ): void {
    this.files.update((files) => {
      const updated = [...files];
      updated[index] = { ...updated[index], status, progress };
      return updated;
    });
  }

  private updateFileProgress(index: number, progress: number): void {
    this.files.update((files) => {
      const updated = [...files];
      updated[index] = { ...updated[index], progress };
      return updated;
    });
  }

  private updateFileResult(index: number, result: UploadResponse): void {
    this.files.update((files) => {
      const updated = [...files];
      updated[index] = { ...updated[index], result };
      return updated;
    });
  }

  private updateFileError(index: number, error: string): void {
    this.files.update((files) => {
      const updated = [...files];
      updated[index] = { ...updated[index], status: 'error', error };
      return updated;
    });
  }

  statusGlyph(status: FileUploadItem['status']): string {
    return { pending: '•', uploading: '↑', success: '✓', error: '!' }[status];
  }

  statusLabel(status: FileUploadItem['status']): string {
    return { pending: 'Wartet', uploading: 'Wird hochgeladen', success: 'Hochgeladen', error: 'Fehler' }[status];
  }

  toggleTag(fileIndex: number, tag: string): void {
    const current = this.files()[fileIndex]?.selectedTags ?? [];
    this.onTagsChange(fileIndex, current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]);
  }

  tone(tag: string): string {
    return tagToneStyle(this.soundService.tagColorMap()[tag]);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
