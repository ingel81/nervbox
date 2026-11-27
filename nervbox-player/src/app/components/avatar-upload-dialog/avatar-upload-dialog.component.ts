import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg av">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Avatar bearbeiten</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          mat-dialog-close
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body">
        @if (!imageFile()) {
          <div
            class="nk-drop av-drop"
            role="button"
            tabindex="0"
            (click)="fileInput.click()"
            (keydown.enter)="fileInput.click()"
            (dragover)="onDragOver($event)"
            (drop)="onDrop($event)"
          >
            <mat-icon class="av-up" aria-hidden="true">add_photo_alternate</mat-icon>
            <span class="nk-drop__title">Bild hierher ziehen oder klicken zum Auswählen</span>
            <span class="nk-drop__hint">JPG, PNG, GIF oder WebP (max. 5MB)</span>
          </div>
          <input
            #fileInput
            type="file"
            hidden
            accept="image/jpeg,image/png,image/gif,image/webp"
            (change)="onFileSelected($event)"
          />
        } @else {
          <div class="av-crop">
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
            <div class="av-prev">
              <span class="nk-label">Vorschau:</span>
              <img
                [src]="croppedImage()"
                class="av-prev__img av-prev__img--lg"
                alt="Vorschau groß"
              />
              <img
                [src]="croppedImage()"
                class="av-prev__img av-prev__img--md"
                alt="Vorschau mittel"
              />
              <img
                [src]="croppedImage()"
                class="av-prev__img av-prev__img--sm"
                alt="Vorschau klein"
              />
            </div>
          }
        }
        @if (error()) {
          <div class="nk-toast nk-toast--error nk-toast--inline" role="alert">
            <span class="nk-toast__text">{{ error() }}</span>
          </div>
        }
      </div>
      <footer class="nk-dialog__foot av-foot">
        @if (imageFile()) {
          <button type="button" class="nk-key nk-key--sm" (click)="resetImage()">
            Anderes Bild
          </button>
        }
        <span class="av-flex"></span>
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close>Abbrechen</button>
        <button
          type="button"
          class="nk-key nk-key--accent"
          [disabled]="!croppedBlob() || uploading()"
          (click)="uploadAvatar()"
        >
          @if (uploading()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Speichern
        </button>
      </footer>
    </div>
  `,
  styles: `
    .av {
      width: 440px;
      max-width: 100%;
    }
    .av-drop {
      padding: 30px 16px;
    }
    .av-up {
      width: 34px;
      height: 34px;
      font-size: 34px;
      filter: drop-shadow(0 0 5px rgb(255 226 176 / 0.6));
    }
    .av-crop {
      border-radius: 8px;
      overflow: hidden;
      background: #0d0c0a;
      box-shadow:
        inset 1px 2px 6px rgb(0 0 0 / 0.8),
        0 0 0 1px rgb(0 0 0 / 0.6),
        1px 1px 0 1px rgb(255 226 176 / 0.14);
      max-height: 320px;
    }
    .av-crop image-cropper {
      --cropper-outline-color: rgb(8 6 5 / 0.62);
      --cropper-overlay-color: #0d0c0a;
    }
    .av-prev {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .av-prev__img {
      border-radius: 50%;
      box-shadow:
        0 0 0 2px #0b0a08,
        0 0 10px rgb(0 0 0 / 0.6);
    }
    .av-prev__img--lg {
      width: 64px;
      height: 64px;
    }
    .av-prev__img--md {
      width: 34px;
      height: 34px;
    }
    .av-prev__img--sm {
      width: 20px;
      height: 20px;
    }
    .av-foot {
      gap: 14px;
    }
    .av-flex {
      flex: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
