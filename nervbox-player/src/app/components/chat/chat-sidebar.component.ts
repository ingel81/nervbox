import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  effect,
  ChangeDetectionStrategy,
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

type ChatTab = 'chat' | 'activity';

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
    <aside class="nk-printer chat" aria-label="Chat">
      <div class="nk-printer__bar">
        <div class="nk-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [class]="activeTab() === 'chat' ? 'nk-tabs__tab nk-tabs__tab--on' : 'nk-tabs__tab'"
            [attr.aria-selected]="activeTab() === 'chat'"
            (click)="setActiveTab('chat')"
          >
            Chat
            @if (unreadChatCount() > 0 && activeTab() !== 'chat') {
              <span class="nk-badge nk-badge--sm" [attr.aria-label]="unreadChatCount() + ' ungelesen'">{{ unreadChatCount() > 99 ? '99+' : unreadChatCount() }}</span>
            }
          </button>
          <button
            type="button"
            role="tab"
            [class]="activeTab() === 'activity' ? 'nk-tabs__tab nk-tabs__tab--on' : 'nk-tabs__tab'"
            [attr.aria-selected]="activeTab() === 'activity'"
            (click)="setActiveTab('activity')"
          >
            Aktivität
            @if (unreadActivityCount() > 0 && activeTab() !== 'activity') {
              <span class="nk-badge nk-badge--sm" [attr.aria-label]="unreadActivityCount() + ' ungelesen'">{{ unreadActivityCount() > 99 ? '99+' : unreadActivityCount() }}</span>
            }
          </button>
        </div>
        <span class="nk-printer__status" [title]="signalR.chatConnected() ? 'Chat verbunden' : 'Chat getrennt'">
          <span [class]="signalR.chatConnected() ? 'nk-led nk-led--dot nk-led--own' : 'nk-led nk-led--dot nk-led--danger nk-led--blink'" aria-hidden="true"></span>
          <span class="nk-label">{{ signalR.chatConnected() ? 'Verbunden' : 'Getrennt' }}</span>
        </span>
      </div>

      <div class="nk-printer__feed">
        @if (activeTab() === 'chat' && showGifPicker()) {
          <app-gif-picker class="chat-gifpicker" (gifSelected)="onGifSelected($event)" (close)="showGifPicker.set(false)" />
        }
        @if (loading()) {
          <div class="nk-printer__paper chat-paper chat-loading">
            <span class="nk-printer__head">*** DRUCKER WÄRMT AUF ***</span>
          </div>
        } @else if (activeTab() === 'chat') {
          <div class="nk-printer__paper chat-paper">
            <div class="chat-scroll" #messagesContainer>
            <span class="nk-printer__head">*** NERVBOX · CHAT-DRUCKER ***</span>
            @if (hasMoreChatMessages()) {
              <button type="button" class="nk-printer__older" (click)="loadOlderMessages()" [disabled]="loadingOlder()">
                {{ loadingOlder() ? '… lädt' : '▲ Ältere Nachrichten' }}
              </button>
            }
            @for (msg of chatMessages(); track msg.id || $index) {
              <div [class]="msg.userId === auth.currentUser()?.id ? 'nk-printer__msg nk-printer__msg--own' : 'nk-printer__msg'">
                <span class="nk-printer__meta">
                  <app-user-avatar class="chat-av" [userId]="msg.userId" size="xs" />
                  <span class="nk-printer__user">{{ msg.userId === auth.currentUser()?.id ? 'Du' : msg.username }}</span>
                  <span class="nk-printer__time">{{ formatTime(msg.createdAt) }}</span>
                </span>
                @if (msg.messageType === 'gif' && msg.gifUrl) {
                  <span class="nk-printer__gif chat-gif">
                    @if (brokenGifs().has(msg.gifUrl)) {
                      <span class="chat-gif-gone">GIF nicht mehr verfügbar</span>
                    } @else {
                      <img [src]="msg.gifUrl" alt="GIF" loading="lazy" (error)="onGifError(msg.gifUrl)" />
                    }
                    <span class="nk-printer__gif-tag">GIF</span>
                  </span>
                } @else {
                  <span class="nk-printer__text">{{ msg.message }}</span>
                }
              </div>
            }
            @if (!chatMessages().length) {
              <span class="nk-printer__text chat-empty">Noch keine Chat-Nachrichten</span>
            }
            </div>
          </div>
        } @else {
          <div class="nk-printer__paper chat-paper">
            <div class="chat-scroll" #activityContainer>
            <span class="nk-printer__head">*** NERVBOX · AKTIVITÄT ***</span>
            @if (hasMoreActivityMessages()) {
              <button type="button" class="nk-printer__older" (click)="loadOlderMessages()" [disabled]="loadingOlder()">
                {{ loadingOlder() ? '… lädt' : '▲ Ältere Mitteilungen' }}
              </button>
            }
            @for (msg of activityMessages(); track msg.id || $index) {
              <div class="nk-printer__msg">
                <span class="nk-printer__meta">
                  <mat-icon class="chat-act-icon">{{ getActivityIcon(msg.message) }}</mat-icon>
                  <span class="nk-printer__time">{{ formatTime(msg.createdAt) }}</span>
                </span>
                <span class="nk-printer__text">{{ msg.message }}</span>
              </div>
            }
            @if (!activityMessages().length) {
              <span class="nk-printer__text chat-empty">Noch keine Aktivitäten</span>
            }
            </div>
          </div>
        }
      </div>
      <div class="nk-printer__slot" aria-hidden="true"></div>

      @if (activeTab() === 'chat') {
        @if (signalR.rateLimitMessage()) {
          <div class="nk-printer__warn" role="alert">
            <span class="nk-led nk-led--dot nk-led--warn" aria-hidden="true"></span>
            <span>{{ signalR.rateLimitMessage() }}</span>
          </div>
        }
        @if (auth.isLoggedIn()) {
          <form class="nk-printer__input" (ngSubmit)="sendMessage()">
            <button
              type="button"
              [class]="showGifPicker() ? 'nk-key nk-key--sm nk-key--on' : 'nk-key nk-key--sm'"
              aria-label="GIF suchen"
              [attr.aria-pressed]="showGifPicker()"
              (click)="toggleGifPicker()"
            >GIF</button>
            <label class="nk-input chat-input">
              <input
                #messageInput
                class="nk-input__field"
                type="text"
                name="message"
                aria-label="Nachricht"
                placeholder="Nachricht …"
                autocomplete="off"
                [(ngModel)]="newMessage"
                [disabled]="sending()"
              />
            </label>
            <button type="submit" class="nk-key nk-key--sm nk-key--icon" aria-label="Senden" [disabled]="!newMessage.trim() || sending()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-3-7-7-1z"></path></svg>
            </button>
          </form>
        } @else {
          <div class="nk-printer__hint">Einloggen zum Chatten</div>
        }
      }
    </aside>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex-shrink: 0;
    }
    .chat {
      flex: 1;
      min-height: 0;
      margin-bottom: 2px;
    }
    .chat-scroll {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: var(--nk-s-4);
      overflow-y: auto;
      overflow-x: hidden;
      margin-right: -6px;
      padding-right: 6px;
      scrollbar-width: thin;
      scrollbar-color: rgb(31 27 22 / 0.4) transparent;
    }
    .chat-scroll .nk-printer__msg,
    .chat-scroll .nk-printer__head {
      flex-shrink: 0;
    }
    .chat-loading {
      justify-content: center;
    }
    .chat-av {
      flex-shrink: 0;
    }
    .chat-gif {
      background: var(--nk-paper-ink);
    }
    .chat-gif img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      filter: grayscale(1) sepia(0.35) contrast(1.15);
      transition: filter 0.2s ease;
    }
    .chat-gif-gone {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 0 10px 14px;
      text-align: center;
      color: var(--nk-paper);
      font: 700 10px/1.3 var(--nk-font-paper);
      letter-spacing: 1px;
      text-transform: uppercase;
      opacity: 0.75;
    }
    .chat-gif:hover img {
      filter: none;
    }
    .chat-act-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .chat-empty {
      margin: auto 0;
      text-align: center;
      color: var(--nk-paper-ink-2);
    }
    .chat-input {
      flex: 1;
      min-width: 0;
      height: 38px;
    }
    .chat-gifpicker {
      position: absolute;
      inset: 0 0 0 0;
      z-index: 5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ChatSidebarComponent implements OnInit, OnDestroy, AfterViewChecked {
  readonly signalR = inject(SignalRService);
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly userCache = inject(UserCacheService);

  @ViewChild('messagesContainer') messagesContainer?: ElementRef;
  @ViewChild('activityContainer') activityContainer?: ElementRef;
  @ViewChild('messageInput') messageInput?: ElementRef<HTMLInputElement>;

  readonly loading = signal(true);
  readonly loadingOlder = signal(false);
  readonly sending = signal(false);
  readonly showGifPicker = signal(false);
  /** GIF URLs that failed to load (expired Giphy links) -> placeholder instead of a broken image */
  readonly brokenGifs = signal<ReadonlySet<string>>(new Set());
  readonly hasMoreChat = signal(false);
  readonly hasMoreActivity = signal(false);
  readonly activeTab = signal<ChatTab>('chat');
  newMessage = '';

  // Filtered messages - chat only (text + gif, not system notifications)
  readonly chatMessages = computed(() => {
    return this.signalR.chatMessages().filter((msg) => msg.messageType !== 'shekel-transaction');
  });

  // Filtered messages - activity only (shekel-transaction from NERVBOX)
  readonly activityMessages = computed(() => {
    return this.signalR.chatMessages().filter((msg) => msg.messageType === 'shekel-transaction');
  });

  // Check if there are more chat messages to load
  readonly hasMoreChatMessages = computed(() => this.hasMoreChat());

  // Check if there are more activity messages to load
  readonly hasMoreActivityMessages = computed(() => this.hasMoreActivity());

  // Unread counts for badges
  readonly unreadChatCount = signal(0);
  readonly unreadActivityCount = signal(0);

  private shouldScrollToBottom = false;
  private skipNextScroll = false;
  private lastChatCount = 0;
  private lastActivityCount = 0;

  constructor() {
    // Auto-scroll when new messages arrive (at the end, not when prepending)
    effect(() => {
      const chatMsgs = this.chatMessages();
      const activityMsgs = this.activityMessages();
      const tab = this.activeTab();

      if (this.skipNextScroll) {
        this.skipNextScroll = false;
        this.lastChatCount = chatMsgs.length;
        this.lastActivityCount = activityMsgs.length;
        return;
      }

      // Track unread counts when not on that tab
      if (chatMsgs.length > this.lastChatCount && this.lastChatCount > 0) {
        if (tab !== 'chat') {
          this.unreadChatCount.update((c) => c + (chatMsgs.length - this.lastChatCount));
        } else {
          setTimeout(() => this.scrollToBottom(), 50);
        }
      }

      if (activityMsgs.length > this.lastActivityCount && this.lastActivityCount > 0) {
        if (tab !== 'activity') {
          this.unreadActivityCount.update(
            (c) => c + (activityMsgs.length - this.lastActivityCount),
          );
        } else {
          setTimeout(() => this.scrollToBottom(), 50);
        }
      }

      this.lastChatCount = chatMsgs.length;
      this.lastActivityCount = activityMsgs.length;
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
    this.api
      .get<{
        messages: ChatMessage[];
        hasMoreChat: boolean;
        hasMoreActivity: boolean;
      }>('/chat?limit=25')
      .subscribe({
        next: (response) => {
          this.signalR.setInitialMessages(response.messages);
          this.hasMoreChat.set(response.hasMoreChat);
          this.hasMoreActivity.set(response.hasMoreActivity);
          this.loading.set(false);
          this.shouldScrollToBottom = true;
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  loadOlderMessages(): void {
    if (this.loadingOlder()) return;

    const tab = this.activeTab();
    const messages = tab === 'chat' ? this.chatMessages() : this.activityMessages();
    if (!messages?.length) return;

    const oldestId = messages[0]?.id;
    if (!oldestId) return;

    this.loadingOlder.set(true);
    const type = tab === 'chat' ? 'chat' : 'activity';

    this.api
      .get<{
        messages: ChatMessage[];
        hasMore: boolean;
      }>(`/chat?limit=25&beforeId=${oldestId}&type=${type}`)
      .subscribe({
        next: (response) => {
          this.skipNextScroll = true;
          this.signalR.prependMessages(response.messages);
          if (tab === 'chat') {
            this.hasMoreChat.set(response.hasMore);
          } else {
            this.hasMoreActivity.set(response.hasMore);
          }
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
    this.showGifPicker.update((v) => !v);
  }

  onGifError(url: string): void {
    this.brokenGifs.update(set => new Set(set).add(url));
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
    const container = this.activeTab() === 'chat' ? this.messagesContainer : this.activityContainer;
    if (container) {
      const el = container.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  setActiveTab(tab: ChatTab): void {
    this.activeTab.set(tab);
    // Clear unread count for the selected tab
    if (tab === 'chat') {
      this.unreadChatCount.set(0);
    } else {
      this.unreadActivityCount.set(0);
    }
    // Scroll to bottom after tab switch
    setTimeout(() => this.scrollToBottom(), 50);
  }

  getActivityIcon(message: string): string {
    if (message.includes('Slot') || message.includes('Gamblen') || message.includes('Plinko')) {
      return 'casino';
    }
    if (message.includes('Hotdog') || message.includes('Katapult')) {
      return 'sports_esports';
    }
    if (message.includes('gesendet') || message.includes('N$')) {
      return 'payments';
    }
    if (message.includes('Level') || message.includes('geschafft')) {
      return 'emoji_events';
    }
    return 'notifications';
  }
}
