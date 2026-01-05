import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { tap, catchError, of } from 'rxjs';

export interface AppConfig {
  playbackMode: 'Local' | 'Browser';
  cesiumAccessToken: string;
  version: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  private readonly api = inject(ApiService);

  // Config state
  readonly config = signal<AppConfig | null>(null);
  readonly loaded = signal(false);

  // Convenience getters
  readonly isBrowserPlayback = signal(false);
  readonly cesiumAccessToken = signal('');

  /**
   * Load configuration from server.
   * Should be called once on app startup.
   */
  loadConfig() {
    return this.api.get<AppConfig>('/config').pipe(
      tap(config => {
        this.config.set(config);
        this.isBrowserPlayback.set(config.playbackMode === 'Browser');
        this.cesiumAccessToken.set(config.cesiumAccessToken || '');
        this.loaded.set(true);
        console.log(`[Config] PlaybackMode: ${config.playbackMode}, Cesium: ${config.cesiumAccessToken ? 'configured' : 'not configured'}`);
      }),
      catchError(err => {
        console.warn('[Config] Failed to load config, using defaults:', err);
        // Default values if config endpoint fails (backward compatibility)
        this.config.set({ playbackMode: 'Local', cesiumAccessToken: '', version: 'unknown' });
        this.isBrowserPlayback.set(false);
        this.cesiumAccessToken.set('');
        this.loaded.set(true);
        return of(null);
      })
    );
  }
}
