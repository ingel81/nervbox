import { Injectable, inject, signal } from '@angular/core';
import {
  HttpClient,
  HttpEventType,
  HttpProgressEvent,
  HttpResponse,
} from '@angular/common/http';
import { Observable, Subject, finalize } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: UploadResponse;
}

export interface UploadResponse {
  hash: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  tags: string[];
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Allowed file extensions
  readonly allowedExtensions = ['.mp3', '.wav', '.ogg'];
  readonly maxFileSize = 50 * 1024 * 1024; // 50MB

  // Upload state
  readonly isUploading = signal(false);
  readonly uploadQueue = signal<UploadProgress[]>([]);

  /**
   * Upload a single sound file with tags
   * Returns an observable that emits progress updates and completes with the result
   */
  uploadSound(
    file: File,
    tags: string[] = []
  ): Observable<{ progress: number; result?: UploadResponse }> {
    const subject = new Subject<{ progress: number; result?: UploadResponse }>();

    const formData = new FormData();
    formData.append('file', file, file.name);
    if (tags.length > 0) {
      formData.append('tags', tags.join(','));
    }

    this.http
      .post<UploadResponse>(`${this.apiUrl}/sound/upload`, formData, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        finalize(() => {
          subject.complete();
        })
      )
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const progressEvent = event as HttpProgressEvent;
            const progress = progressEvent.total
              ? Math.round((100 * progressEvent.loaded) / progressEvent.total)
              : 0;
            subject.next({ progress });
          } else if (event.type === HttpEventType.Response) {
            const response = event as HttpResponse<UploadResponse>;
            subject.next({ progress: 100, result: response.body ?? undefined });
          }
        },
        error: (err) => {
          subject.error(err);
        },
      });

    return subject.asObservable();
  }

  /**
   * Validate a file before upload
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    // Check extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!this.allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: `Ungültiges Format. Erlaubt: ${this.allowedExtensions.join(', ')}`,
      };
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      const maxMB = this.maxFileSize / (1024 * 1024);
      return {
        valid: false,
        error: `Datei zu groß. Maximum: ${maxMB}MB`,
      };
    }

    return { valid: true };
  }

  /**
   * Extract display name from filename (without extension)
   */
  getDisplayName(filename: string): string {
    return filename.replace(/\.[^/.]+$/, '');
  }

  /**
   * Get accept string for file input
   */
  getAcceptString(): string {
    return this.allowedExtensions.map((ext) => `audio/${ext.slice(1)}`).join(',') + ',.mp3,.wav,.ogg';
  }
}
