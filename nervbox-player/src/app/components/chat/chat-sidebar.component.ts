import { Component, inject, OnInit, OnDestroy, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
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
  ],
  template: `
    <div class="chat-sidebar">
      <div class="chat-header">
        <mat-icon>chat</mat-icon>
        <span class="header-title">Chat</span>
        <div class="connection-status" [class.connected]="signalR.chatConnected()"></div>
      </div>

      <div class="chat-content">
          @if (loading()) {
            <div class="loading">
              <mat-spinner diameter="24"></mat-spinner>
            </div>
          } @else {
            <div class="messages" #messagesContainer>
              @for (msg of signalR.chatMessages(); track msg.id || $index) {
                <div class="message" [class.own]="msg.userId === auth.currentUser()?.id">
                  <span class="username">{{ msg.username }}</span>
                  <span class="text">{{ msg.message }}</span>
                  <span class="time">{{ formatTime(msg.createdAt) }}</span>
                </div>
              }
              @if (signalR.chatMessages().length === 0) {
                <div class="empty">Noch keine Nachrichten</div>
              }
            </div>
          }

          @if (auth.isLoggedIn()) {
            <form class="input-area" (ngSubmit)="sendMessage()">
              <input
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
      width: 300px;
      height: 100%;
      background: #0f0f12;
      border-left: 1px solid rgba(147, 51, 234, 0.3);
      display: flex;
      flex-direction: column;
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

    .message {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      border-left: 2px solid rgba(147, 51, 234, 0.3);
    }

    .message.own {
      background: rgba(147, 51, 234, 0.1);
      border-left-color: #9333ea;
    }

    .username {
      font-size: 11px;
      font-weight: 600;
      color: #9333ea;
    }

    .message.own .username {
      color: #ec4899;
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
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 20px;
      padding: 8px 16px;
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
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border-radius: 50%;
    }

    .input-area button mat-icon {
      color: white;
      font-size: 18px;
    }

    .input-area button:disabled {
      opacity: 0.4;
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

  @ViewChild('messagesContainer') messagesContainer?: ElementRef;

  readonly loading = signal(true);
  readonly sending = signal(false);
  newMessage = '';

  private shouldScrollToBottom = false;

  ngOnInit(): void {
    this.loadMessages();
    this.signalR.connectChat();
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
    this.api.get<ChatMessage[]>('/chat').subscribe({
      next: messages => {
        this.signalR.setInitialMessages(messages);
        this.loading.set(false);
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.loading.set(false);
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
    }
  }

  formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
