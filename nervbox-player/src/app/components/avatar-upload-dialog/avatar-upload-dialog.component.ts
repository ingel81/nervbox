import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ImageCropperComponent, ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { AvatarService } from '../../core/services/avatar.service';

@Component({
  selector: 'app-avatar-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ImageCropperComponent,
  ],
  template: `
    <div class="avatar-dialog">
      <h2 mat-dialog-title>
        <mat-icon>account_circle</mat-icon>
        Avatar bearbeiten
      </h2>

      <mat-dialog-content>
        @if (!imageFile()) {
          <!-- File Selection -->
          <div
            class="drop-zone"
            (click)="fileInput.click()"
            (dragover)="onDragOver($event)"
            (drop)="onDrop($event)"
          >
            <mat-icon class="upload-icon">cloud_upload</mat-icon>
            <p>Bild hierher ziehen oder klicken zum Auswählen</p>
            <span class="hint">JPG, PNG, GIF oder WebP (max. 5MB)</span>
          </div>
          <input
            #fileInput
            type="file"
            hidden
            accept="image/jpeg,image/png,image/gif,image/webp"
            (change)="onFileSelected($event)"
          />
        } @else {
          <!-- Image Cropper -->
          <div class="cropper-container">
            <image-cropper
              [imageFile]="imageFile()"
              [maintainAspectRatio]="true"
              [aspectRatio]="1"
              [roundCropper]="true"
              [resizeToWidth]="256"
              [resizeToHeight]="256"
              format="png"
              (imageCropped)="onImageCropped($event)"
              (imageLoaded)="onImageLoaded($event)"
              (loadImageFailed)="onLoadImageFailed()"
            />
          </div>

          @if (croppedImage()) {
            <div class="preview-section">
              <span class="preview-label">Vorschau:</span>
              <img [src]="croppedImage()" class="preview-image" alt="Preview" />
            </div>
          }
        }

        @if (error()) {
          <div class="error-message">
            <mat-icon>error</mat-icon>
            {{ error() }}
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        @if (imageFile()) {
          <button mat-button (click)="resetImage()">
            <mat-icon>arrow_back</mat-icon>
            Anderes Bild
          </button>
        }
        <button mat-button mat-dialog-close>Abbrechen</button>
        <button
          mat-flat-button
          color="primary"
          [disabled]="!croppedBlob() || uploading()"
          (click)="uploadAvatar()"
        >
          @if (uploading()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <ng-container>
              <mat-icon>save</mat-icon>
              Speichern
            </ng-container>
          }
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    .avatar-dialog {
      min-width: 400px;
      max-width: 500px;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #9333ea;
      margin: 0;
      padding: 16px 24px;
      border-bottom: 1px solid rgba(147, 51, 234, 0.2);
    }

    h2[mat-dialog-title] mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    mat-dialog-content {
      padding: 24px !important;
      min-height: 300px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .drop-zone {
      width: 100%;
      height: 200px;
      border: 2px dashed rgba(147, 51, 234, 0.4);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(147, 51, 234, 0.05);
    }

    .drop-zone:hover {
      border-color: #9333ea;
      background: rgba(147, 51, 234, 0.1);
    }

    .upload-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: rgba(147, 51, 234, 0.6);
      margin-bottom: 12px;
    }

    .drop-zone p {
      color: rgba(255, 255, 255, 0.8);
      margin: 0;
    }

    .drop-zone .hint {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      margin-top: 8px;
    }

    .cropper-container {
      width: 100%;
      max-height: 350px;
      display: flex;
      justify-content: center;
    }

    .cropper-container ::ng-deep image-cropper {
      max-height: 350px;
    }

    .cropper-container ::ng-deep .ngx-ic-cropper {
      border-radius: 50% !important;
    }

    .preview-section {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 16px;
      padding: 12px;
      background: rgba(147, 51, 234, 0.1);
      border-radius: 8px;
    }

    .preview-label {
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
    }

    .preview-image {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      border: 2px solid #9333ea;
      object-fit: cover;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #ef4444;
      margin-top: 16px;
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: 8px;
      width: 100%;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid rgba(147, 51, 234, 0.2);
      gap: 8px;
    }

    mat-dialog-actions button {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    mat-dialog-actions button[color="primary"] {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
    }

    mat-dialog-actions button[color="primary"]:disabled {
      opacity: 0.5;
    }

    mat-spinner {
      display: inline-block;
    }

    ::ng-deep .mat-mdc-progress-spinner circle {
      stroke: white !important;
    }
  `,
})
export class AvatarUploadDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AvatarUploadDialogComponent>);
  private readonly avatarService = inject(AvatarService);

  readonly imageFile = signal<File | undefined>(undefined);
  readonly croppedImage = signal<string | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.selectFile(event.dataTransfer.files[0]);
    }
  }

  private selectFile(file: File): void {
    this.error.set(null);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.error.set('Ungültiger Dateityp. Erlaubt: JPG, PNG, GIF, WebP');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.error.set('Datei zu groß. Maximum: 5MB');
      return;
    }

    this.imageFile.set(file);
  }

  onImageCropped(event: ImageCroppedEvent): void {
    this.croppedImage.set(event.base64 ?? null);
    this.croppedBlob.set(event.blob ?? null);
  }

  onImageLoaded(_event: LoadedImage): void {
    // Image loaded successfully
  }

  onLoadImageFailed(): void {
    this.error.set('Bild konnte nicht geladen werden');
    this.resetImage();
  }

  resetImage(): void {
    this.imageFile.set(undefined);
    this.croppedImage.set(null);
    this.croppedBlob.set(null);
    this.error.set(null);
  }

  uploadAvatar(): void {
    const blob = this.croppedBlob();
    if (!blob) return;

    this.uploading.set(true);
    this.error.set(null);

    this.avatarService.uploadAvatar(blob).subscribe({
      next: (response) => {
        this.uploading.set(false);
        this.dialogRef.close({ success: true, avatarUrl: response.avatarUrl });
      },
      error: (err) => {
        this.uploading.set(false);
        this.error.set(err.error?.message || 'Upload fehlgeschlagen');
      },
    });
  }
}
