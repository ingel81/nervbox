import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Sound, SoundUpdateRequest, Tag, TopSound, TopUser } from '../models';
import { CreditService } from './credit.service';

interface PlaySoundResponse {
  creditsRemaining: number;
}

@Injectable({
  providedIn: 'root',
})
export class SoundService {
  private readonly api = inject(ApiService);
  private readonly creditService = inject(CreditService);

  // State
  readonly sounds = signal<Sound[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  loadSounds(): Observable<Sound[]> {
    this.loading.set(true);
    this.error.set(null);

    return this.api.get<Sound[]>('/sound').pipe(
      tap({
        next: sounds => {
          this.sounds.set(sounds);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err.message || 'Failed to load sounds');
          this.loading.set(false);
        },
      })
    );
  }

  playSound(hash: string): Observable<PlaySoundResponse> {
    return this.api.get<PlaySoundResponse>(`/sound/${hash}/play`).pipe(
      tap(response => {
        if (response?.creditsRemaining !== undefined) {
          this.creditService.updateCreditsFromPlayResponse(response.creditsRemaining);
        }
      })
    );
  }

  /**
   * Plays a sound in the browser using the stream endpoint.
   * Does NOT play on the Pi system, only locally in the browser.
   * Useful for games, previews, etc.
   */
  playInBrowser(hash: string): void {
    const audio = new Audio(this.api.getFullUrl(`/sound/${hash}/stream`));
    audio.play().catch(err => console.warn('Browser audio playback failed:', err));
  }

  /**
   * Preloads a sound for faster browser playback.
   * Returns the Audio element for later use.
   */
  preloadForBrowser(hash: string): HTMLAudioElement {
    const audio = new Audio(this.api.getFullUrl(`/sound/${hash}/stream`));
    audio.preload = 'auto';
    audio.load();
    return audio;
  }

  killAll(): Observable<void> {
    return this.api.get<void>('/sound/killAll');
  }

  getTopSounds(): Observable<TopSound[]> {
    return this.api.get<TopSound[]>('/sound/statistics/topsounds');
  }

  getTopUsers(): Observable<TopUser[]> {
    return this.api.get<TopUser[]>('/sound/statistics/topusers');
  }

  getTopFavorites(): Observable<TopSound[]> {
    return this.api.get<TopSound[]>('/sound/statistics/topfavorites');
  }

  // Helper to get unique tags from all sounds
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    this.sounds().forEach(sound => {
      sound.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }

  // === Admin: Sound Management ===

  loadAllSounds(): Observable<Sound[]> {
    this.loading.set(true);
    this.error.set(null);

    return this.api.get<Sound[]>('/sound/all').pipe(
      tap({
        next: sounds => {
          this.sounds.set(sounds);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err.message || 'Failed to load sounds');
          this.loading.set(false);
        },
      })
    );
  }

  updateSound(hash: string, data: SoundUpdateRequest): Observable<Sound> {
    return this.api.put<Sound>(`/sound/${hash}`, data).pipe(
      tap(updatedSound => {
        this.sounds.update(sounds =>
          sounds.map(s => (s.hash === hash ? updatedSound : s))
        );
      })
    );
  }

  toggleSound(hash: string): Observable<{ hash: string; enabled: boolean }> {
    return this.api
      .put<{ hash: string; enabled: boolean }>(`/sound/${hash}/toggle`, {})
      .pipe(
        tap(result => {
          this.sounds.update(sounds =>
            sounds.map(s =>
              s.hash === hash ? { ...s, enabled: result.enabled } : s
            )
          );
        })
      );
  }

  deleteSound(hash: string): Observable<void> {
    return this.api.delete<void>(`/sound/${hash}`).pipe(
      tap(() => {
        this.sounds.update(sounds => sounds.filter(s => s.hash !== hash));
      })
    );
  }

  // === Admin: Tag Management ===

  readonly tags = signal<Tag[]>([]);
  readonly tagColorMap = computed(() => {
    const map: Record<string, string> = {};
    for (const tag of this.tags()) {
      map[tag.name] = tag.color;
    }
    return map;
  });
  readonly pinnedTagNames = computed(() =>
    this.tags().filter(t => t.isPinned).map(t => t.name)
  );

  loadTags(): Observable<Tag[]> {
    return this.api.get<Tag[]>('/tag').pipe(
      tap(tags => {
        this.tags.set(tags);
      })
    );
  }

  createTag(name: string, color?: string, isPinned?: boolean): Observable<Tag> {
    return this.api.post<Tag>('/tag', { name, color, isPinned }).pipe(
      tap(newTag => {
        this.tags.update(tags => this.sortTags([...tags, newTag]));
      })
    );
  }

  updateTag(id: number, name: string, color?: string, isPinned?: boolean): Observable<Tag> {
    return this.api.put<Tag>(`/tag/${id}`, { name, color, isPinned }).pipe(
      tap(updatedTag => {
        this.tags.update(tags => this.sortTags(tags.map(t => (t.id === id ? updatedTag : t))));
      })
    );
  }

  private sortTags(tags: Tag[]): Tag[] {
    return tags.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  deleteTag(id: number): Observable<void> {
    return this.api.delete<void>(`/tag/${id}`).pipe(
      tap(() => {
        this.tags.update(tags => tags.filter(t => t.id !== id));
      })
    );
  }
}
