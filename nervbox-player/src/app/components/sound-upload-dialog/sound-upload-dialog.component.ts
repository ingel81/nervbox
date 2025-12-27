import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { UploadService, UploadResponse } from '../../core/services/upload.service';
import { SoundService } from '../../core/services/sound.service';
import { Tag } from '../../core/models';

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
    MatTooltipModule,
    MatDividerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>upload_file</mat-icon>
      Sounds hochladen
    </h2>

    <mat-dialog-content>
      <!-- File Picker -->
      <div class="file-picker-section">
        <input
          type="file"
          #fileInput
          [accept]="uploadService.getAcceptString()"
          multiple
          hidden
          (change)="onFilesSelected($event)"
        />
        <button
          mat-stroked-button
          class="pick-files-btn"
          (click)="fileInput.click()"
          [disabled]="isUploading()"
        >
          <mat-icon>folder_open</mat-icon>
          Dateien auswählen
        </button>
        <span class="format-hint">.mp3, .wav, .ogg</span>
      </div>

      <!-- File List -->
      @if (files().length > 0) {
        <div class="files-list">
          @for (item of files(); track item.file.name; let i = $index) {
            <div class="file-item" [class.success]="item.status === 'success'" [class.error]="item.status === 'error'">
              <!-- Header Row -->
              <div class="file-header">
                <mat-icon class="file-icon">{{ getStatusIcon(item.status) }}</mat-icon>
                <span class="file-name" [matTooltip]="item.file.name">{{ item.displayName }}</span>
                <span class="file-size">{{ formatFileSize(item.file.size) }}</span>
                @if (item.status === 'pending') {
                  <button
                    mat-icon-button
                    class="remove-btn"
                    matTooltip="Entfernen"
                    (click)="removeFile(i)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>

              <!-- Tags Row -->
              <div class="tags-row">
                <span class="tags-label">Tags:</span>
                <div class="tags-container">
                  @for (tag of availableTags(); track tag.name) {
                    <mat-chip-option
                      [selected]="item.selectedTags.includes(tag.name)"
                      [disabled]="item.status !== 'pending'"
                      (click)="toggleTag(i, tag.name)"
                    >
                      {{ tag.name }}
                    </mat-chip-option>
                  }
                  @if (availableTags().length === 0) {
                    <span class="no-tags-hint">Keine Tags verfügbar</span>
                  }
                </div>
              </div>

              <!-- Progress Bar -->
              @if (item.status === 'uploading' || item.status === 'success') {
                <mat-progress-bar
                  [mode]="item.status === 'uploading' ? 'determinate' : 'determinate'"
                  [value]="item.progress"
                  [color]="item.status === 'success' ? 'primary' : 'accent'"
                ></mat-progress-bar>
              }

              <!-- Error Message -->
              @if (item.error) {
                <div class="error-message">
                  <mat-icon>error</mat-icon>
                  {{ item.error }}
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="empty-state">
          <mat-icon>audio_file</mat-icon>
          <p>Wähle Audiodateien zum Hochladen aus</p>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="isUploading()">
        {{ allDone() ? 'Schließen' : 'Abbrechen' }}
      </button>
      @if (!allDone()) {
        <button
          mat-flat-button
          color="primary"
          [disabled]="!canUpload() || isUploading()"
          (click)="uploadAll()"
        >
          @if (isUploading()) {
            <ng-container>
              <mat-icon class="spinning">sync</mat-icon>
              Hochladen...
            </ng-container>
          } @else {
            <ng-container>
              <mat-icon>cloud_upload</mat-icon>
              Alle hochladen ({{ pendingCount() }})
            </ng-container>
          }
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #fff;
      margin: 0;
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%);
      border-bottom: 1px solid rgba(147, 51, 234, 0.3);
    }

    h2 mat-icon {
      color: #9333ea;
    }

    mat-dialog-content {
      padding: 24px !important;
      min-width: 500px;
      max-height: 60vh;
    }

    .file-picker-section {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    .pick-files-btn {
      border-color: rgba(147, 51, 234, 0.5) !important;
      color: #9333ea !important;
    }

    .pick-files-btn:hover:not(:disabled) {
      background: rgba(147, 51, 234, 0.1) !important;
      border-color: #9333ea !important;
    }

    .pick-files-btn mat-icon {
      margin-right: 8px;
    }

    .format-hint {
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;
    }

    .files-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .file-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      transition: all 0.2s ease;
    }

    .file-item.success {
      border-color: rgba(34, 197, 94, 0.5);
      background: rgba(34, 197, 94, 0.05);
    }

    .file-item.error {
      border-color: rgba(239, 68, 68, 0.5);
      background: rgba(239, 68, 68, 0.05);
    }

    .file-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .file-icon {
      color: rgba(255, 255, 255, 0.6);
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .file-item.success .file-icon {
      color: #22c55e;
    }

    .file-item.error .file-icon {
      color: #ef4444;
    }

    .file-name {
      flex: 1;
      font-weight: 500;
      color: #fff;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;
      font-family: 'JetBrains Mono', monospace;
    }

    .remove-btn {
      width: 32px !important;
      height: 32px !important;
      opacity: 0.6;
    }

    .remove-btn:hover {
      opacity: 1;
      color: #ef4444;
    }

    .tags-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .tags-label {
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;
      padding-top: 6px;
      flex-shrink: 0;
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      flex: 1;
    }

    .tags-container mat-chip-option {
      font-size: 12px;
      min-height: 28px;
      cursor: pointer;
    }

    .no-tags-hint {
      color: rgba(255, 255, 255, 0.4);
      font-size: 13px;
      font-style: italic;
    }

    mat-progress-bar {
      border-radius: 4px;
      height: 6px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ef4444;
      font-size: 13px;
      margin-top: 8px;
    }

    .error-message mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      color: rgba(255, 255, 255, 0.4);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
    }

    mat-dialog-actions {
      padding: 16px 24px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    mat-dialog-actions button mat-icon {
      margin-right: 8px;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `,
})
export class SoundUploadDialogComponent {
  readonly uploadService = inject(UploadService);
  private readonly soundService = inject(SoundService);
  private readonly dialogRef = inject(MatDialogRef<SoundUploadDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);

  readonly files = signal<FileUploadItem[]>([]);
  readonly isUploading = signal(false);

  readonly availableTags = computed(() => this.soundService.tags());

  readonly pendingCount = computed(() =>
    this.files().filter(f => f.status === 'pending').length
  );

  readonly canUpload = computed(() =>
    this.files().some(f => f.status === 'pending')
  );

  readonly allDone = computed(() =>
    this.files().length > 0 && this.files().every(f => f.status === 'success' || f.status === 'error')
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
      if (this.files().some(f => f.file.name === file.name)) {
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

    this.files.update(files => [...files, ...newFiles]);

    // Reset input for re-selection
    input.value = '';
  }

  removeFile(index: number): void {
    this.files.update(files => files.filter((_, i) => i !== index));
  }

  toggleTag(fileIndex: number, tagName: string): void {
    this.files.update(files => {
      const updated = [...files];
      const item = { ...updated[fileIndex] };

      if (item.selectedTags.includes(tagName)) {
        item.selectedTags = item.selectedTags.filter(t => t !== tagName);
      } else {
        item.selectedTags = [...item.selectedTags, tagName];
      }

      updated[fileIndex] = item;
      return updated;
    });
  }

  async uploadAll(): Promise<void> {
    const pendingFiles = this.files().filter(f => f.status === 'pending');
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
        await new Promise<void>((resolve, reject) => {
          this.uploadService.uploadSound(item.file, item.selectedTags).subscribe({
            next: ({ progress, result }) => {
              this.updateFileProgress(i, progress);
              if (result) {
                this.updateFileResult(i, result);
              }
            },
            error: (err) => {
              const message = err.error?.message || err.message || 'Upload fehlgeschlagen';
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
        { duration: 4000 }
      );

      // Reload sounds in the main app
      this.soundService.loadSounds();
    }

    if (errorCount > 0 && successCount === 0) {
      this.snackBar.open(
        `${errorCount} Upload${errorCount > 1 ? 's' : ''} fehlgeschlagen`,
        'OK',
        { duration: 4000, panelClass: 'error-snackbar' }
      );
    }
  }

  private updateFileStatus(index: number, status: FileUploadItem['status'], progress: number): void {
    this.files.update(files => {
      const updated = [...files];
      updated[index] = { ...updated[index], status, progress };
      return updated;
    });
  }

  private updateFileProgress(index: number, progress: number): void {
    this.files.update(files => {
      const updated = [...files];
      updated[index] = { ...updated[index], progress };
      return updated;
    });
  }

  private updateFileResult(index: number, result: UploadResponse): void {
    this.files.update(files => {
      const updated = [...files];
      updated[index] = { ...updated[index], result };
      return updated;
    });
  }

  private updateFileError(index: number, error: string): void {
    this.files.update(files => {
      const updated = [...files];
      updated[index] = { ...updated[index], status: 'error', error };
      return updated;
    });
  }

  getStatusIcon(status: FileUploadItem['status']): string {
    switch (status) {
      case 'pending': return 'audio_file';
      case 'uploading': return 'sync';
      case 'success': return 'check_circle';
      case 'error': return 'error';
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
