import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

interface LoudnessGains {
  enabled: boolean;
  gains: Record<string, number>;
}

export interface LoudnessStatus {
  enabled: boolean;
  targetDb: number;
  maxCutDb: number;
  measured: number;
  total: number;
  attenuated: number;
  measuring: boolean;
}

/**
 * Playback loudness normalization, mirrored from the backend: the Pi plays with mpg123 -f,
 * the browser multiplies audio.volume with the same per-sound gain (always <= 1).
 */
@Injectable({ providedIn: 'root' })
export class LoudnessService {
  private readonly api = inject(ApiService);
  private readonly gains = signal<Record<string, number>>({});
  readonly enabled = signal(false);

  constructor() {
    this.reload();
    // Pick up admin changes and newly measured sounds
    setInterval(() => this.reload(), 10 * 60_000);
  }

  reload(): void {
    this.api.get<LoudnessGains>('/loudness').subscribe({
      next: r => {
        this.enabled.set(r.enabled);
        this.gains.set(r.gains ?? {});
      },
      error: () => {
        // backend without normalization: play unchanged
      },
    });
  }

  /** Linear gain for a sound (1 = unchanged). */
  gain(hash: string): number {
    return this.enabled() ? (this.gains()[hash] ?? 1) : 1;
  }

  getStatus(): Observable<LoudnessStatus> {
    return this.api.get<LoudnessStatus>('/loudness/status');
  }

  configure(enabled: boolean, targetDb?: number): Observable<LoudnessStatus> {
    return this.api.put<LoudnessStatus>('/loudness', { enabled, targetDb }).pipe(tap(() => this.reload()));
  }
}
