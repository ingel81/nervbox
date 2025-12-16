import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface ChatMessage {
  id?: number;
  userId: number;
  username: string;
  message: string;
  messageType?: 'text' | 'gif';
  gifUrl?: string;
  createdAt: string;
}

export interface SoundPlayedEvent {
  soundHash: string;
  fileName: string;
  initiator: { name: string; id: number };
  time: string;
}

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private readonly auth = inject(AuthService);

  private chatConnection: signalR.HubConnection | null = null;
  private soundConnection: signalR.HubConnection | null = null;

  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly soundEvents = signal<SoundPlayedEvent[]>([]);
  readonly chatConnected = signal(false);
  readonly soundConnected = signal(false);
  readonly rateLimitMessage = signal<string | null>(null);

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
      this.chatMessages.update(messages => [...messages, msg]);
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
      .withUrl(`${baseUrl}/ws/soundHub`)
      .withAutomaticReconnect()
      .build();

    this.soundConnection.on('soundPlayed', (event: SoundPlayedEvent) => {
      this.soundEvents.update(events => [event, ...events].slice(0, 10));
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

  setInitialMessages(messages: ChatMessage[]): void {
    this.chatMessages.set(messages);
  }

  prependMessages(messages: ChatMessage[]): void {
    this.chatMessages.update(current => [...messages, ...current]);
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
