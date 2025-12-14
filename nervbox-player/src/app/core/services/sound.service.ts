import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Sound, TopSound, TopUser } from '../models';

@Injectable({
  providedIn: 'root',
})
export class SoundService {
  private readonly api = inject(ApiService);

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

  playSound(hash: string): Observable<void> {
    return this.api.get<void>(`/sound/${hash}/play`);
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

  // Helper to get unique tags from all sounds
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    this.sounds().forEach(sound => {
      sound.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }
}
