import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SignalRService, ChatMessage } from '../../core/services/signalr.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { GifPickerComponent } from './gif-picker.component';
import { UserAvatarComponent } from '../shared/user-avatar/user-avatar.component';
import { UserCacheService } from '../../core/services/user-cache.service';

@Component({
  selector: 'app-chat-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    GifPickerComponent,
    UserAvatarComponent,
  ],
  template: `
    <div class="chat-sidebar">
      <div class="chat-header">
        <mat-icon>chat</mat-icon>
        <span class="header-title">Chat</span>
        <div class="connection-status" [class.connected]="signalR.chatConnected()"></div>
      </div>

      <div class="chat-content">
          @if (showGifPicker()) {
            <app-gif-picker
              (gifSelected)="onGifSelected($event)"
              (close)="showGifPicker.set(false)"
            />
          }

          @if (loading()) {
            <div class="loading">
              <mat-spinner diameter="24"></mat-spinner>
            </div>
          } @else {
            <div class="messages" #messagesContainer>
              @if (hasMoreMessages()) {
                <button class="load-older-btn" (click)="loadOlderMessages()" [disabled]="loadingOlder()">
                  @if (loadingOlder()) {
                    <mat-spinner diameter="16"></mat-spinner>
                  } @else {
                    <mat-icon>expand_less</mat-icon>
                    Ältere Nachrichten
                  }
                </button>
              }
              @for (msg of signalR.chatMessages(); track msg.id || $index) {
                <div class="message-row" [class.own]="msg.userId === auth.currentUser()?.id">
                  @if (msg.userId !== auth.currentUser()?.id) {
                    <app-user-avatar [userId]="msg.userId" size="small" class="message-avatar" />
                  }
                  <div class="message" [class.own]="msg.userId === auth.currentUser()?.id" [class.gif-message]="msg.messageType === 'gif'">
                    @if (msg.userId !== auth.currentUser()?.id) {
                      <span class="username">{{ msg.username }}</span>
                    }
                    @if (msg.messageType === 'gif' && msg.gifUrl) {
                      <img class="gif-content" [src]="msg.gifUrl" alt="GIF" loading="lazy" />
                    } @else {
                      <span class="text">{{ msg.message }}</span>
                    }
                    <span class="time">{{ formatTime(msg.createdAt) }}</span>
                  </div>
                  @if (msg.userId === auth.currentUser()?.id) {
                    <app-user-avatar [userId]="msg.userId" size="small" class="message-avatar" />
                  }
                </div>
              }
              @if (!signalR.chatMessages().length) {
                <div class="empty">Noch keine Nachrichten</div>
              }
            </div>
          }

          @if (signalR.rateLimitMessage()) {
            <div class="rate-limit-warning">
              <mat-icon>warning</mat-icon>
              <span>{{ signalR.rateLimitMessage() }}</span>
            </div>
          }

          @if (auth.isLoggedIn()) {
            <div class="input-wrapper">
              <form class="input-area" (ngSubmit)="sendMessage()">
                <button
                  mat-icon-button
                  type="button"
                  class="gif-btn"
                  (click)="toggleGifPicker()"
                  [class.active]="showGifPicker()"
                >
                  <mat-icon>gif_box</mat-icon>
                </button>
                <input
                  #messageInput
                  type="text"
                  [(ngModel)]="newMessage"
                  name="message"
                  placeholder="Nachricht..."
                  [disabled]="sending()"
                  autocomplete="off"
                />
                <button
                  mat-icon-button
                  type="submit"
                  [disabled]="!newMessage.trim() || sending()"
                >
                  <mat-icon>send</mat-icon>
                </button>
              </form>
            </div>
          } @else {
            <div class="login-hint">
              <mat-icon>login</mat-icon>
              <span>Einloggen zum Chatten</span>
            </div>
          }
        </div>
    </div>
  `,
  styles: `
    .chat-sidebar {
      height: 100%;
      background: #0f0f12;
      border-left: 1px solid rgba(147, 51, 234, 0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }

    .chat-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.1) 100%);
      border-bottom: 1px solid rgba(147, 51, 234, 0.3);
    }

    .chat-header mat-icon:first-child {
      color: #9333ea;
    }

    .header-title {
      flex: 1;
      font-weight: 600;
      font-size: 14px;
    }

    .connection-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
    }

    .connection-status.connected {
      background: #22c55e;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
    }

    .collapse-icon {
      color: rgba(255, 255, 255, 0.5);
      font-size: 20px;
    }

    .chat-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }

    .loading, .empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255, 255, 255, 0.4);
      font-size: 13px;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .message-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .message-row.own {
      justify-content: flex-end;
    }

    .message-avatar {
      flex-shrink: 0;
      margin-bottom: 2px;
    }

    .load-older-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(147, 51, 234, 0.1);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px;
      color: #9333ea;
      font-size: 12px;
      cursor: pointer;
      margin-bottom: 8px;
    }

    .load-older-btn:hover:not(:disabled) {
      background: rgba(147, 51, 234, 0.2);
    }

    .load-older-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .load-older-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .message {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 12px;
      background: rgba(30, 30, 35, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px 12px 12px 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      flex: 1;
      min-width: 0;
      max-width: calc(100% - 40px);
    }

    .message.own {
      background: rgba(147, 51, 234, 0.12);
      border-color: rgba(147, 51, 234, 0.15);
      border-radius: 12px 12px 4px 12px;
      flex: unset;
    }

    .username {
      font-size: 11px;
      font-weight: 600;
      color: #9333ea;
    }

    .message.own .username {
      color: #ec4899;
      align-self: flex-end;
    }

    .message.own .time {
      align-self: flex-start;
    }

    .text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
      word-break: break-word;
    }

    .time {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.3);
      align-self: flex-end;
    }

    .input-area {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.3);
    }

    .input-area input {
      flex: 1;
      min-width: 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 20px;
      padding: 8px 12px;
      color: white;
      font-size: 13px;
      outline: none;
    }

    .input-area input:focus {
      border-color: rgba(147, 51, 234, 0.6);
    }

    .input-area input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .input-area button {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .input-area button mat-icon {
      color: white;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .input-area button:disabled {
      opacity: 0.4;
    }

    .input-wrapper {
      position: relative;
    }

    .gif-btn {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      background: rgba(147, 51, 234, 0.15);
      border-radius: 50%;
    }

    .gif-btn mat-icon {
      color: #9333ea;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .gif-btn.active,
    .gif-btn:hover {
      background: rgba(147, 51, 234, 0.3);
    }

    .gif-btn.active mat-icon,
    .gif-btn:hover mat-icon {
      color: #ec4899;
    }

    .gif-message {
      padding: 4px !important;
    }

    .gif-content {
      max-width: 100%;
      max-height: 20vh;
      object-fit: contain;
      border-radius: 6px;
      display: block;
    }

    .login-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
    }

    .rate-limit-warning {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(239, 68, 68, 0.15);
      border-left: 3px solid #ef4444;
      color: #ef4444;
      font-size: 12px;
      animation: fadeIn 0.2s ease;
    }

    .rate-limit-warning mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .login-hint mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    @media (max-width: 768px) {
      .chat-sidebar {
        display: none;
      }
    }
  `,
})
export class ChatSidebarComponent implements OnInit, OnDestroy, AfterViewChecked {
  readonly signalR = inject(SignalRService);
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly userCache = inject(UserCacheService);

  @ViewChild('messagesContainer') messagesContainer?: ElementRef;
  @ViewChild('messageInput') messageInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(true);
  readonly loadingOlder = signal(false);
  readonly sending = signal(false);
  readonly showGifPicker = signal(false);
  readonly hasMoreMessages = signal(false);
  newMessage = '';

  private shouldScrollToBottom = false;
  private skipNextScroll = false;
  private lastMessageCount = 0;

  constructor() {
    // Auto-scroll when new messages arrive (at the end, not when prepending)
    effect(() => {
      const messages = this.signalR.chatMessages();
      const count = messages?.length ?? 0;

      if (this.skipNextScroll) {
        this.skipNextScroll = false;
        this.lastMessageCount = count;
        return;
      }

      // Only scroll if messages were added (not on initial load handled elsewhere)
      if (count > this.lastMessageCount && this.lastMessageCount > 0) {
        setTimeout(() => this.scrollToBottom(), 50);
      }
      this.lastMessageCount = count;
    });
  }

  ngOnInit(): void {
    this.loadMessages();
    this.signalR.connectChat();
    // Load users for avatar display
    this.userCache.loadUsers().subscribe();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    // Don't disconnect - other components might use it
  }

  private loadMessages(): void {
    this.api.get<{ messages: ChatMessage[]; hasMore: boolean }>('/chat?limit=3').subscribe({
      next: response => {
        this.signalR.setInitialMessages(response.messages);
        this.hasMoreMessages.set(response.hasMore);
        this.loading.set(false);
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadOlderMessages(): void {
    const messages = this.signalR.chatMessages();
    if (!messages?.length || this.loadingOlder()) return;

    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    this.loadingOlder.set(true);

    this.api
      .get<{ messages: ChatMessage[]; hasMore: boolean }>(`/chat?limit=3&beforeId=${oldestId}`)
      .subscribe({
        next: response => {
          this.skipNextScroll = true;
          this.signalR.prependMessages(response.messages);
          this.hasMoreMessages.set(response.hasMore);
          this.loadingOlder.set(false);
        },
        error: () => {
          this.loadingOlder.set(false);
        },
      });
  }

  async sendMessage(): Promise<void> {
    if (!this.newMessage.trim() || this.sending()) return;

    this.sending.set(true);
    try {
      await this.signalR.sendChatMessage(this.newMessage.trim());
      this.newMessage = '';
      this.shouldScrollToBottom = true;
    } catch {
      // Error handling in service
    } finally {
      this.sending.set(false);
      // Keep focus on input
      setTimeout(() => this.messageInput?.nativeElement?.focus(), 0);
    }
  }

  formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  toggleGifPicker(): void {
    this.showGifPicker.update(v => !v);
  }

  async onGifSelected(gifUrl: string): Promise<void> {
    this.showGifPicker.set(false);
    this.sending.set(true);
    try {
      await this.signalR.sendGif(gifUrl);
      this.shouldScrollToBottom = true;
    } catch {
      // Error handling in service
    } finally {
      this.sending.set(false);
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
