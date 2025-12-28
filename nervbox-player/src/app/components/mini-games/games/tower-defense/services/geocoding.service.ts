import { Injectable, signal } from '@angular/core';

export interface GeocodingResult {
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  importance: number;
}

/**
 * Geocoding Service using Nominatim (OpenStreetMap) API
 * Provides address search with autocomplete functionality
 */
@Injectable({
  providedIn: 'root',
})
export class GeocodingService {
  private readonly NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
  private readonly DEBOUNCE_MS = 300;
  private readonly MIN_QUERY_LENGTH = 3;
  private readonly MAX_RESULTS = 8;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  readonly isLoading = signal(false);
  readonly results = signal<GeocodingResult[]>([]);
  readonly error = signal<string | null>(null);

  /**
   * Search for addresses with autocomplete
   * Debounced to avoid excessive API calls
   */
  search(query: string): void {
    // Clear previous timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Clear previous request
    if (this.abortController) {
      this.abortController.abort();
    }

    // Reset state for short queries
    if (query.length < this.MIN_QUERY_LENGTH) {
      this.results.set([]);
      this.error.set(null);
      return;
    }

    this.isLoading.set(true);

    this.debounceTimer = setTimeout(() => {
      this.executeSearch(query);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Execute the actual search request
   */
  private async executeSearch(query: string): Promise<void> {
    this.abortController = new AbortController();

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: this.MAX_RESULTS.toString(),
        // Prefer results in Germany/Europe
        countrycodes: 'de,at,ch',
      });

      const response = await fetch(`${this.NOMINATIM_URL}/search?${params}`, {
        signal: this.abortController.signal,
        headers: {
          // Nominatim requires a user-agent
          'User-Agent': 'Nervbox-TowerDefense/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.statusText}`);
      }

      const data = await response.json();

      const results: GeocodingResult[] = data.map((item: {
        display_name: string;
        lat: string;
        lon: string;
        type: string;
        importance: number;
      }) => ({
        displayName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        importance: item.importance,
      }));

      this.results.set(results);
      this.error.set(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      console.error('Geocoding error:', err);
      this.error.set('Adresssuche fehlgeschlagen');
      this.results.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Reverse geocoding: get address from coordinates
   */
  async reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        format: 'json',
      });

      const response = await fetch(`${this.NOMINATIM_URL}/reverse?${params}`, {
        headers: {
          'User-Agent': 'Nervbox-TowerDefense/1.0',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.display_name || null;
    } catch {
      return null;
    }
  }

  /**
   * Clear search results
   */
  clearResults(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    this.results.set([]);
    this.error.set(null);
    this.isLoading.set(false);
  }
}
