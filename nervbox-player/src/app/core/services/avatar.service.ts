import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export interface AvatarUploadResponse {
  success: boolean;
  avatarUrl: string;
}

export interface AvatarUrlResponse {
  avatarUrl: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AvatarService {
  private readonly api = inject(ApiService);

  // Signal to track the current user's avatar URL with cache busting
  readonly currentUserAvatarUrl = signal<string | null>(null);

  /**
   * Upload avatar for the current user
   */
  uploadAvatar(file: Blob): Observable<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append('file', file, 'avatar.png');

    return this.api.postFormData<AvatarUploadResponse>('/users/avatar', formData).pipe(
      tap(response => {
        if (response.success && response.avatarUrl) {
          // Add cache buster to force refresh
          this.currentUserAvatarUrl.set(`${environment.apiUrl}${response.avatarUrl}?t=${Date.now()}`);
        }
      })
    );
  }

  /**
   * Delete avatar for the current user
   */
  deleteAvatar(): Observable<{ success: boolean }> {
    return this.api.delete<{ success: boolean }>('/users/avatar').pipe(
      tap(() => {
        this.currentUserAvatarUrl.set(null);
      })
    );
  }

  /**
   * Get avatar URL for the current user
   */
  getMyAvatarUrl(): Observable<AvatarUrlResponse> {
    return this.api.get<AvatarUrlResponse>('/users/avatar').pipe(
      tap(response => {
        if (response.avatarUrl) {
          this.currentUserAvatarUrl.set(`${environment.apiUrl}${response.avatarUrl}?t=${Date.now()}`);
        } else {
          this.currentUserAvatarUrl.set(null);
        }
      })
    );
  }

  /**
   * Get avatar URL for any user by ID
   */
  getAvatarUrlForUser(userId: number): string {
    return `${environment.apiUrl}/users/${userId}/avatar`;
  }

  /**
   * Clear the avatar cache (e.g., on logout)
   */
  clearCache(): void {
    this.currentUserAvatarUrl.set(null);
  }
}
