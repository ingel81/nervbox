import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class FavoritesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _favorites = signal<Set<string>>(new Set());
  private readonly _loading = signal(false);

  readonly favorites = computed(() => this._favorites());
  readonly loading = computed(() => this._loading());

  isFavorite(hash: string): boolean {
    return this._favorites().has(hash);
  }

  loadFavorites(): void {
    if (!this.auth.isLoggedIn()) {
      this._favorites.set(new Set());
      return;
    }

    this._loading.set(true);
    this.api.get<string[]>('/sound/favorites').subscribe({
      next: (hashes) => {
        this._favorites.set(new Set(hashes));
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  toggleFavorite(hash: string): void {
    if (!this.auth.isLoggedIn()) return;

    if (this.isFavorite(hash)) {
      this.removeFavorite(hash);
    } else {
      this.addFavorite(hash);
    }
  }

  private addFavorite(hash: string): void {
    // Optimistic update
    const newFavorites = new Set(this._favorites());
    newFavorites.add(hash);
    this._favorites.set(newFavorites);

    this.api.post(`/sound/${hash}/favorite`).subscribe({
      error: () => {
        // Rollback on error
        const rollback = new Set(this._favorites());
        rollback.delete(hash);
        this._favorites.set(rollback);
      },
    });
  }

  private removeFavorite(hash: string): void {
    // Optimistic update
    const newFavorites = new Set(this._favorites());
    newFavorites.delete(hash);
    this._favorites.set(newFavorites);

    this.api.delete(`/sound/${hash}/favorite`).subscribe({
      error: () => {
        // Rollback on error
        const rollback = new Set(this._favorites());
        rollback.add(hash);
        this._favorites.set(rollback);
      },
    });
  }

  clearFavorites(): void {
    this._favorites.set(new Set());
  }
}
