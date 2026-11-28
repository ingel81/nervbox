import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AchievementEarnedEvent } from '../models/achievement.model';
import { VoteUpdateEvent } from '../models/vote.model';

export type ChatMessageType = 'text' | 'gif' | 'shekel-transaction';

export interface ChatMessage {
  id?: number;
  userId: number;
  username: string;
  message: string;
  messageType?: ChatMessageType;
  gifUrl?: string;
  createdAt: string;
}

export interface SoundPlayedEvent {
  soundHash: string;
  fileName: string;
  initiator: { name: string; id: number };
  time: string;
  /** Stimmen-ID (Stopp, Live-Steuerung, soundEnded) – fehlt bei alten Backends */
  voiceId?: number;
  /** Ein-Klick-Effekt oder null */
  effect?: string | null;
  /** Erwartete Dauer inkl. Effekt-Tempo/-Ausklang */
  durationMs?: number;
  /** Einzeln stoppbar / live steuerbar */
  stoppable?: boolean;
}

export interface SoundEndedEvent {
  voiceId: number;
  reason: 'end' | 'stopped' | 'error';
}

/** Pegel des Pi-Mixers (~12×/s, nur solange etwas läuft) */
export interface MixLevelEvent {
  peak: number;
  rms: number;
  limiterDb: number;
  voices: { id: number; peak: number }[];
}

export interface CreditUpdateEvent {
  userId: number;
  credits: number;
  timestamp: string;
}

// Re-export for convenience
export type { AchievementEarnedEvent, VoteUpdateEvent };

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private readonly auth = inject(AuthService);

  private chatConnection: signalR.HubConnection | null = null;
  private soundConnection: signalR.HubConnection | null = null;

  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly soundEvents = signal<SoundPlayedEvent[]>([]);
  readonly creditUpdates = signal<CreditUpdateEvent | null>(null);
  readonly achievementEarned = signal<AchievementEarnedEvent | null>(null);
  readonly voteUpdates = signal<VoteUpdateEvent | null>(null);
  readonly chatConnected = signal(false);
  readonly soundConnected = signal(false);
  readonly rateLimitMessage = signal<string | null>(null);
  /** Ende einer Stimme (natürlich, gestoppt, Fehler) – verlustfrei als Strom */
  readonly soundEnded$ = new Subject<SoundEndedEvent>();
  readonly mixLevel = signal<MixLevelEvent | null>(null);

  constructor() {
    // Sound-Hub mit dem aktuellen Login verbinden (Live-Steuerung/Ende-Meldung prüfen den Absender)
    let lastUser: number | null | undefined;
    effect(() => {
      const id = this.auth.currentUser()?.id ?? null;
      if (lastUser !== undefined && id !== lastUser && this.soundConnection) {
        untracked(() => void this.reconnectSound());
      }
      lastUser = id;
    });
  }

  private async reconnectSound(): Promise<void> {
    const old = this.soundConnection;
    this.soundConnection = null;
    this.soundConnected.set(false);
    try {
      await old?.stop();
    } catch {
      // egal
    }
    await this.connectSound();
  }

  async connectChat(): Promise<void> {
    if (this.chatConnection) return;

    const baseUrl = environment.apiUrl.replace('/api', '');

    this.chatConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/ws/chatHub`, {
        accessTokenFactory: () => this.auth.getToken() || '',
      })
      .withAutomaticReconnect()
      .build();

    this.chatConnection.on('message', (msg: ChatMessage) => {
      this.chatMessages.update((messages) => [...messages, msg]);
    });

    this.chatConnection.on('rateLimit', (reason: string) => {
      this.rateLimitMessage.set(reason);
      // Auto-clear after 3 seconds
      setTimeout(() => this.rateLimitMessage.set(null), 3000);
    });

    this.chatConnection.onclose(() => {
      this.chatConnected.set(false);
    });

    this.chatConnection.onreconnected(() => {
      this.chatConnected.set(true);
    });

    try {
      await this.chatConnection.start();
      this.chatConnected.set(true);
    } catch (err) {
      console.error('Chat SignalR connection failed:', err);
    }
  }

  async connectSound(): Promise<void> {
    if (this.soundConnection) return;

    const baseUrl = environment.apiUrl.replace('/api', '');

    this.soundConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/ws/soundHub`, {
        accessTokenFactory: () => this.auth.getToken() || '',
      })
      .withAutomaticReconnect()
      .build();

    this.soundConnection.on('soundPlayed', (event: SoundPlayedEvent) => {
      this.soundEvents.update((events) => [event, ...events].slice(0, 10));
    });

    this.soundConnection.on('soundEnded', (event: SoundEndedEvent) => {
      this.soundEnded$.next(event);
    });

    this.soundConnection.on('mixLevel', (event: MixLevelEvent) => {
      this.mixLevel.set(event);
    });

    this.soundConnection.on('creditUpdate', (event: CreditUpdateEvent) => {
      this.creditUpdates.set(event);
    });

    this.soundConnection.on('achievementEarned', (event: AchievementEarnedEvent) => {
      this.achievementEarned.set(event);
    });

    this.soundConnection.on('voteUpdate', (event: VoteUpdateEvent) => {
      this.voteUpdates.set(event);
    });

    this.soundConnection.onclose(() => {
      this.soundConnected.set(false);
    });

    this.soundConnection.onreconnected(() => {
      this.soundConnected.set(true);
    });

    try {
      await this.soundConnection.start();
      this.soundConnected.set(true);
    } catch (err) {
      console.error('Sound SignalR connection failed:', err);
    }
  }

  async sendChatMessage(message: string): Promise<void> {
    if (!this.chatConnection || !this.auth.isLoggedIn()) return;

    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    try {
      await this.chatConnection.invoke('SendMessage', userId, message);
    } catch (err) {
      console.error('Failed to send chat message:', err);
      throw err;
    }
  }

  async sendGif(gifUrl: string): Promise<void> {
    if (!this.chatConnection || !this.auth.isLoggedIn()) return;

    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    try {
      await this.chatConnection.invoke('SendGif', userId, gifUrl);
    } catch (err) {
      console.error('Failed to send GIF:', err);
      throw err;
    }
  }

  /** Live-Steuerung einer Pi-Mixer-Stimme (nur Initiator; Backend prüft) */
  modulateVoice(voiceId: number, rate: number, filter: number, wobble: number): void {
    if (this.soundConnection?.state !== signalR.HubConnectionState.Connected) return;
    this.soundConnection
      .invoke('ModulateVoice', voiceId, rate, filter, wobble)
      .catch((err) => console.warn('ModulateVoice failed:', err));
  }

  /** Browser-Modus: eigene Stimme ist natürlich zu Ende */
  reportVoiceEnded(voiceId: number): void {
    if (this.soundConnection?.state !== signalR.HubConnectionState.Connected) return;
    this.soundConnection
      .invoke('ReportVoiceEnded', voiceId)
      .catch((err) => console.warn('ReportVoiceEnded failed:', err));
  }

  setInitialMessages(messages: ChatMessage[]): void {
    this.chatMessages.set(messages);
  }

  prependMessages(messages: ChatMessage[]): void {
    this.chatMessages.update((current) => [...messages, ...current]);
  }

  disconnect(): void {
    this.chatConnection?.stop();
    this.soundConnection?.stop();
    this.chatConnection = null;
    this.soundConnection = null;
    this.chatConnected.set(false);
    this.soundConnected.set(false);
  }
}
