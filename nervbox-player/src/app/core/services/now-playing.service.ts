import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SignalRService, SoundPlayedEvent } from './signalr.service';
import { SoundService } from './sound.service';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import { AudioEngineService, MixLevels } from './audio-engine.service';
import { VoiceControlService } from './voice-control.service';

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
  /** Stimmen-ID vom Backend (fehlt bei alten Backends) */
  voiceId?: number;
  /** Ein-Klick-Effekt */
  effect?: string | null;
  /** einzeln stoppbar (Pi-Mixer oder Browser-Wiedergabe) */
  stoppable: boolean;
  /** Zeitpunkt des gemeldeten Endes (ms) */
  endedAt?: number;
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

/** Anzeigepegel 0…1 (mit Rücklauf), Limiter aktiv */
export interface MeterState {
  master: number;
  rms: number;
  limiting: boolean;
  /** Pegel je Stimmen-ID */
  voices: Map<number, number>;
  /** echte Pegeldaten vorhanden (sonst Deko-Anzeige) */
  live: boolean;
}

/** Wie lange ein Kanal nach Ende noch kurz stehen bleibt, damit kurze Sounds sichtbar sind. */
const MIN_VISIBLE_MS = 1200;
/** Nach gemeldetem Ende noch kurz stehen lassen */
const AFTER_END_MS = 350;
/** Obergrenze, falls ein Sound keine Dauer hat */
const FALLBACK_MS = 3000;
/** sichtbare Kanalzüge unten */
export const CHANNEL_COUNT = 8;
/** gleichzeitige Stimmen des Pi-Mixers (MixerService.MaxVoices) – Obergrenze der Zählung */
export const MAX_VOICES = 32;

/**
 * Leitet aus den SignalR-Ereignissen ab, welche Sounds gerade laufen: „soundPlayed“ (Start, mit
 * voiceId) und „soundEnded“ (Ende/Stopp). Ohne Ende-Meldung (alte Backends, Pi ohne Mixer) ergibt
 * sich das Ende aus der Dauer. Pegel: Pi → „mixLevel“, Browser-Modus → Web-Audio-Analyser.
 */
@Injectable({ providedIn: 'root' })
export class NowPlayingService {
  private readonly signalR = inject(SignalRService);
  private readonly soundService = inject(SoundService);
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);
  private readonly engine = inject(AudioEngineService);
  private readonly voiceControl = inject(VoiceControlService);

  private readonly channelsInternal = signal<PlayingChannel[]>([]);
  private readonly seen = new Set<string>();
  /** Taktsignal für Fortschrittsbalken (läuft nur, solange etwas spielt) */
  readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Letzter eigener Sound (für „Nochmal“) */
  readonly lastOwnHash = signal<string | null>(null);

  readonly channels = computed(() => {
    const now = this.now();
    return this.channelsInternal().filter((c) => this.visible(c, now));
  });

  /** Anzahl wirklich laufender Sounds (auch über die sichtbaren Kanalzüge hinaus) */
  readonly runningCount = computed(
    () => this.channels().filter((c) => !c.endedAt).length,
  );

  /** Zustand je Sound-Hash für die Pads */
  readonly padStates = computed(() => {
    const now = this.now();
    const map = new Map<string, PadPlayState>();
    for (const c of this.channels()) {
      if (c.endedAt) continue;
      const st = map.get(c.hash) ?? { own: false, other: false, players: [], progress: 0 };
      if (c.own) st.own = true;
      else st.other = true;
      st.players.push({ id: c.userId, name: c.userName });
      st.progress = this.progressOf(c, now);
      map.set(c.hash, st);
    }
    return map;
  });

  private readonly meterInternal = signal<MeterState>({
    master: 0,
    rms: 0,
    limiting: false,
    voices: new Map(),
    live: false,
  });
  readonly meter = this.meterInternal.asReadonly();

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  constructor() {
    effect(() => {
      const events = this.signalR.soundEvents();
      // Neueste zuerst → in zeitlicher Reihenfolge verarbeiten
      for (const ev of [...events].reverse()) this.ingest(ev);
    });
    this.voiceControl.onVoiceEnded((id) => this.markEnded(id));
    // Pegel: Browser-Modus aus dem eigenen Analyser, sonst vom Pi-Mixer
    effect(() => {
      const lv: MixLevels | null = this.config.isBrowserPlayback()
        ? this.engine.levels()
        : this.signalR.mixLevel();
      // untracked: ingestLevels liest den eigenen Pegelzustand (sonst Endlosschleife)
      if (lv) untracked(() => this.ingestLevels(lv));
    });
  }

  progressOf(c: PlayingChannel, now = this.now()): number {
    if (c.endedAt) return 100;
    const d = c.durationMs > 0 ? c.durationMs : FALLBACK_MS;
    return Math.max(0, Math.min(100, ((now - c.startedAt) / d) * 100));
  }

  /** Darf ich diesen Kanal stoppen? (eigener Sound oder Admin) */
  canStop(c: PlayingChannel): boolean {
    return !!c.voiceId && c.stoppable && !c.endedAt && (c.own || this.isAdmin());
  }

  /** Einen laufenden Sound stoppen; onError bekommt die Fehlermeldung des Backends */
  stop(c: PlayingChannel, onError?: (message: string) => void): void {
    if (!c.voiceId || !this.canStop(c)) return;
    const id = c.voiceId;
    this.voiceControl.stopVoice(id).subscribe({
      next: () => this.markEnded(id),
      error: (err: { status?: number; error?: { error?: string } }) => {
        // 404 = schon zu Ende
        if (err.status === 404) this.markEnded(id);
        else onError?.(err.error?.error ?? 'Stoppen fehlgeschlagen');
      },
    });
  }

  /** Alle Kanäle leeren (z. B. nach „Alle Sounds stoppen“) */
  clear(): void {
    this.engine.stopAll();
    this.channelsInternal.set([]);
    this.stopTimerIfIdle();
  }

  private visible(c: PlayingChannel, now: number): boolean {
    if (c.endedAt) return now < Math.max(c.endedAt + AFTER_END_MS, c.startedAt + MIN_VISIBLE_MS);
    const d = Math.max(c.durationMs, MIN_VISIBLE_MS);
    // mit Ende-Meldung: Live-Tempo kann die Dauer strecken → großzügiges Sicherheitsnetz
    const limit = c.stoppable && c.voiceId ? d * 2.2 + 3000 : d;
    return now < c.startedAt + limit;
  }

  private markEnded(voiceId: number): void {
    let changed = false;
    const now = Date.now();
    const list = this.channelsInternal().map((c) => {
      if (c.voiceId === voiceId && !c.endedAt) {
        changed = true;
        return { ...c, endedAt: now };
      }
      return c;
    });
    if (changed) {
      this.channelsInternal.set(list);
      this.now.set(now);
      this.startTimer();
    }
  }

  private ingest(ev: SoundPlayedEvent): void {
    const key = ev.voiceId ? `v${ev.voiceId}` : `${ev.time}|${ev.soundHash}|${ev.initiator?.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 200) {
      const first = this.seen.values().next().value;
      if (first) this.seen.delete(first);
    }

    const sound = this.soundService.sounds().find((s) => s.hash === ev.soundHash);
    const me = this.auth.currentUser();
    const own = !!me && ev.initiator?.id === me.id;
    const now = Date.now();
    const channel: PlayingChannel = {
      id: key,
      hash: ev.soundHash,
      name: sound?.name ?? ev.fileName,
      userId: ev.initiator?.id ?? 0,
      userName: ev.initiator?.name ?? '?',
      startedAt: now,
      durationMs: ev.durationMs || sound?.durationMs || FALLBACK_MS,
      own,
      voiceId: ev.voiceId,
      effect: ev.effect ?? null,
      stoppable: !!ev.voiceId && ev.stoppable !== false,
      // Ende kam schon vor dem Start (z. B. Stimme konnte nicht starten)
      endedAt: ev.voiceId && this.voiceControl.isEnded(ev.voiceId) ? now : undefined,
    };
    if (own) this.lastOwnHash.set(ev.soundHash);

    this.channelsInternal.update((list) =>
      [...this.prune(list), channel].slice(-(MAX_VOICES + CHANNEL_COUNT)),
    );
    this.startTimer();
  }

  private ingestLevels(lv: MixLevels): void {
    const prev = this.meterInternal();
    if (lv.peak === 0 && lv.voices.length === 0) {
      // Ruhe-Meldung: alles aus
      this.meterInternal.set({ master: 0, rms: 0, limiting: false, voices: new Map(), live: true });
      return;
    }
    // Ballistik: sofort hoch, langsam zurück (wie ein Spitzenpegel-Messer)
    const fall = (old: number, v: number): number => (v >= old ? v : Math.max(v, old * 0.6));
    const voices = new Map<number, number>();
    for (const v of lv.voices) voices.set(v.id, fall(prev.voices.get(v.id) ?? 0, v.peak));
    this.meterInternal.set({
      master: fall(prev.master, lv.peak),
      rms: lv.rms,
      limiting: lv.limiterDb > 0.5,
      voices,
      live: true,
    });
  }

  private prune(list: PlayingChannel[]): PlayingChannel[] {
    const now = Date.now();
    return list.filter((c) => this.visible(c, now));
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
