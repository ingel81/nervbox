import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap, of } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

export interface CachedUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  /** Set when the user uploaded an avatar; changes on every upload (used as cache version). */
  avatarFileName?: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserCacheService {
  private readonly api = inject(ApiService);

  private readonly usersMap = signal<Map<number, CachedUser>>(new Map());
  private readonly loaded = signal(false);
  private readonly loading = signal(false);

  /**
   * Get a user by ID from the cache
   */
  getUser(userId: number): CachedUser | undefined {
    return this.usersMap().get(userId);
  }

  /**
   * Get initials for a user
   */
  getInitials(userId: number): string {
    const user = this.getUser(userId);
    if (!user) return '?';

    if (user.firstName && user.lastName) {
      return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user.firstName) {
      return user.firstName.substring(0, 2).toUpperCase();
    }
    if (user.username) {
      return user.username.substring(0, 2).toUpperCase();
    }
    return '?';
  }

  /**
   * Get avatar URL for a user, or null if the user has no avatar (or is not loaded yet).
   * The file name is used as version, so the browser may cache the image forever.
   */
  getAvatarUrl(userId: number): string | null {
    const file = this.getUser(userId)?.avatarFileName;
    if (!file) return null;
    return `${environment.apiUrl}/users/${userId}/avatar?v=${encodeURIComponent(file)}`;
  }

  /**
   * Get display name for a user
   */
  getDisplayName(userId: number): string {
    const user = this.getUser(userId);
    if (!user) return `User #${userId}`;

    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.username;
  }

  /**
   * Load all users into cache (call once on app init or when needed)
   */
  loadUsers(): Observable<CachedUser[]> {
    if (this.loaded() || this.loading()) {
      return of(Array.from(this.usersMap().values()));
    }

    this.loading.set(true);

    return this.api.get<CachedUser[]>('/users').pipe(
      tap({
        next: (users) => {
          const map = new Map<number, CachedUser>();
          users.forEach((user) => map.set(user.id, user));
          this.usersMap.set(map);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      }),
    );
  }

  /**
   * Check if users are loaded
   */
  isLoaded(): boolean {
    return this.loaded();
  }

  /**
   * Force reload users
   */
  reloadUsers(): Observable<CachedUser[]> {
    this.loaded.set(false);
    return this.loadUsers();
  }

  /**
   * Update a single user in the cache (e.g., after avatar change)
   */
  updateUserInCache(user: Partial<CachedUser> & { id: number }): void {
    const current = this.usersMap().get(user.id);
    if (current) {
      const updated = { ...current, ...user };
      this.usersMap.update((map) => {
        const newMap = new Map(map);
        newMap.set(user.id, updated);
        return newMap;
      });
    }
  }
}
