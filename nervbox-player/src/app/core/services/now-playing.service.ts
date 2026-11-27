import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SignalRService, SoundPlayedEvent } from './signalr.service';
import { SoundService } from './sound.service';
import { AuthService } from './auth.service';

/** Ein gerade laufender Sound (ein „Kanal“). */
export interface PlayingChannel {
  /** eindeutige ID je Abspielvorgang */
  id: string;
  hash: string;
  name: string;
  userId: number;
  userName: string;
  /** Startzeit im Client (ms seit Epoch) */
  startedAt: number;
  durationMs: number;
  /** eigener Sound (grün) oder fremder (eisblau) */
  own: boolean;
}

/** Zustand eines Pads: wer spielt gerade diesen Sound. */
export interface PadPlayState {
  own: boolean;
  other: boolean;
  /** Spielernamen in Startreihenfolge */
  players: { id: number; name: string }[];
  /** Fortschritt 0–100 des zuletzt gestarteten Vorgangs */
  progress: number;
}

/** Wie lange ein Kanal nach Ende noch kurz stehen bleibt, damit kurze Sounds sichtbar sind. */
const MIN_VISIBLE_MS = 1200;
/** Obergrenze, falls ein Sound keine Dauer hat */
const FALLBACK_MS = 3000;
export const CHANNEL_COUNT = 8;

/**
 * Leitet aus den SignalR-„soundPlayed“-Ereignissen ab, welche Sounds gerade laufen.
 * Der Server meldet nur den Start; das Ende ergibt sich aus der Sound-Dauer.
 */
@Injectable({ providedIn: 'root' })
export class NowPlayingService {
  private readonly signalR = inject(SignalRService);
  private readonly soundService = inject(SoundService);
  private readonly auth = inject(AuthService);

  private readonly channelsInternal = signal<PlayingChannel[]>([]);
  private readonly seen = new Set<string>();
  /** Taktsignal für Fortschrittsbalken (läuft nur, solange etwas spielt) */
  readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Letzter eigener Sound (für „Nochmal“) */
  readonly lastOwnHash = signal<string | null>(null);

  readonly channels = computed(() => {
    const now = this.now();
    return this.channelsInternal().filter(
      (c) => now < c.startedAt + Math.max(c.durationMs, MIN_VISIBLE_MS),
    );
  });

  /** Zustand je Sound-Hash für die Pads */
  readonly padStates = computed(() => {
    const now = this.now();
    const map = new Map<string, PadPlayState>();
    for (const c of this.channels()) {
      const st = map.get(c.hash) ?? { own: false, other: false, players: [], progress: 0 };
      if (c.own) st.own = true;
      else st.other = true;
      st.players.push({ id: c.userId, name: c.userName });
      st.progress = this.progressOf(c, now);
      map.set(c.hash, st);
    }
    return map;
  });

  constructor() {
    effect(() => {
      const events = this.signalR.soundEvents();
      // Neueste zuerst → in zeitlicher Reihenfolge verarbeiten
      for (const ev of [...events].reverse()) this.ingest(ev);
    });
  }

  progressOf(c: PlayingChannel, now = this.now()): number {
    const d = c.durationMs > 0 ? c.durationMs : FALLBACK_MS;
    return Math.max(0, Math.min(100, ((now - c.startedAt) / d) * 100));
  }

  /** Alle Kanäle leeren (z. B. nach „Alle Sounds stoppen“) */
  clear(): void {
    this.channelsInternal.set([]);
    this.stopTimerIfIdle();
  }

  private ingest(ev: SoundPlayedEvent): void {
    const key = `${ev.time}|${ev.soundHash}|${ev.initiator?.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 200) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
    }

    const sound = this.soundService.sounds().find((s) => s.hash === ev.soundHash);
    const me = this.auth.currentUser();
    const own = !!me && ev.initiator?.id === me.id;
    const channel: PlayingChannel = {
      id: key,
      hash: ev.soundHash,
      name: sound?.name ?? ev.fileName,
      userId: ev.initiator?.id ?? 0,
      userName: ev.initiator?.name ?? '?',
      startedAt: Date.now(),
      durationMs: sound?.durationMs || FALLBACK_MS,
      own,
    };
    if (own) this.lastOwnHash.set(ev.soundHash);

    this.channelsInternal.update((list) =>
      [...this.prune(list), channel].slice(-CHANNEL_COUNT * 2),
    );
    this.startTimer();
  }

  private prune(list: PlayingChannel[]): PlayingChannel[] {
    const now = Date.now();
    return list.filter((c) => now < c.startedAt + Math.max(c.durationMs, MIN_VISIBLE_MS));
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      this.stopTimerIfIdle();
    }, 200);
  }

  private stopTimerIfIdle(): void {
    const pruned = this.prune(this.channelsInternal());
    if (pruned.length !== this.channelsInternal().length) this.channelsInternal.set(pruned);
    if (pruned.length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.now.set(Date.now());
    }
  }
}
