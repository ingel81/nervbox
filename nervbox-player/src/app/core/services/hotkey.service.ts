import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

/** Digit keys usable as sound hotkeys */
export const HOTKEY_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type HotkeyMap = Partial<Record<number, string>>;

/**
 * Freely assignable sound hotkeys 1–9 (digit row and numpad). Stored per user in localStorage
 * under `nervbox-hotkeys-<userId>`; only active for logged-in users.
 */
@Injectable({ providedIn: 'root' })
export class HotkeyService {
  private readonly auth = inject(AuthService);

  private readonly userId = computed(() => this.auth.currentUser()?.id ?? null);
  private readonly _map = signal<HotkeyMap>({});

  /** digit → sound hash */
  readonly map = this._map.asReadonly();

  /** sound hash → digit */
  readonly digitByHash = computed(() => {
    const byHash = new Map<string, number>();
    for (const [digit, hash] of Object.entries(this._map())) {
      if (hash) byHash.set(hash, Number(digit));
    }
    return byHash;
  });

  constructor() {
    // Load the current user's assignments whenever the user changes (login/logout/switch)
    effect(() => this._map.set(this.read(this.userId())));
  }

  hashFor(digit: number): string | undefined {
    return this._map()[digit];
  }

  digitFor(hash: string): number | undefined {
    return this.digitByHash().get(hash);
  }

  /** Puts the sound on the key. A sound already on that key is replaced; the sound's old key is freed. */
  assign(hash: string, digit: number): void {
    if (!HOTKEY_DIGITS.includes(digit as (typeof HOTKEY_DIGITS)[number])) return;
    const next: HotkeyMap = {};
    for (const [d, h] of Object.entries(this._map())) {
      if (h && h !== hash) next[Number(d)] = h;
    }
    next[digit] = hash;
    this.save(next);
  }

  release(hash: string): void {
    const next: HotkeyMap = {};
    for (const [d, h] of Object.entries(this._map())) {
      if (h && h !== hash) next[Number(d)] = h;
    }
    this.save(next);
  }

  /** Digit 1–9 for a key event (digit row or numpad), otherwise null */
  static digitOf(event: KeyboardEvent): number | null {
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    return m ? Number(m[1]) : null;
  }

  private storageKey(userId: number): string {
    return `nervbox-hotkeys-${userId}`;
  }

  private read(userId: number | null): HotkeyMap {
    if (userId === null) return {};
    try {
      const raw = localStorage.getItem(this.storageKey(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return {};
      const map: HotkeyMap = {};
      for (const [d, h] of Object.entries(parsed as Record<string, unknown>)) {
        const digit = Number(d);
        if (digit >= 1 && digit <= 9 && typeof h === 'string' && h) map[digit] = h;
      }
      return map;
    } catch {
      return {};
    }
  }

  private save(map: HotkeyMap): void {
    this._map.set(map);
    const userId = this.userId();
    if (userId === null) return;
    try {
      localStorage.setItem(this.storageKey(userId), JSON.stringify(map));
    } catch {
      // storage unavailable (private mode etc.): keep in memory only
    }
  }
}
