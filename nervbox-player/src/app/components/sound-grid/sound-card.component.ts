import { Component, computed, inject, input, output, signal, ElementRef, viewChild, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { Sound } from '../../core/models';
import { DurationPipe } from '../../shared/pipes/duration.pipe';
import { AuthService } from '../../core/services/auth.service';
import { FavoritesService } from '../../core/services/favorites.service';
import { AchievementService } from '../../core/services/achievement.service';
import { ApiService } from '../../core/services/api.service';
import { VoteService } from '../../core/services/vote.service';
import { UserAvatarComponent } from '../shared/user-avatar/user-avatar.component';

@Component({
  selector: 'app-sound-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatRippleModule,
    MatMenuModule,
    MatDividerModule,
    DurationPipe,
    UserAvatarComponent,
  ],
  template: `
    <div
      class="sound-card"
      [class.disabled]="!sound().enabled"
      [class.selection-mode]="selectionMode()"
      [class.selected]="isSelected()"
      matRipple
      [matRippleColor]="isSelected() ? 'rgba(34, 197, 94, 0.2)' : 'rgba(147, 51, 234, 0.2)'"
      (click)="handleClick()"
    >
      <div class="card-main">
        @if (selectionMode()) {
          <mat-icon class="selection-indicator" [class.checked]="isSelected()">
            {{ isSelected() ? 'check_box' : 'check_box_outline_blank' }}
          </mat-icon>
        } @else if (sound().authorId) {
          <app-user-avatar [userId]="sound().authorId" size="small" class="author-avatar" />
        } @else {
          <mat-icon class="sound-icon">{{ sound().enabled ? 'music_note' : 'music_off' }}</mat-icon>
        }
        @if (auth.isLoggedIn() && !selectionMode()) {
          <button
            class="favorite-btn"
            [class.is-favorite]="isFavorite()"
            [class.animating]="favoriteAnimating()"
            (click)="toggleFavorite($event)"
            [matTooltip]="isFavorite() ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'"
          >
            <mat-icon>{{ isFavorite() ? 'favorite' : 'favorite_border' }}</mat-icon>
          </button>
        }
        <span
          class="sound-name"
          #nameEl
          [matTooltip]="sound().name"
          [matTooltipDisabled]="!isNameTruncated()"
        >
          {{ sound().name }}
        </span>
        <span class="duration monospace">{{ sound().durationMs | duration }}</span>
        @if (sound().playCount) {
          <span class="play-count monospace">{{ sound().playCount }}x</span>
        }
        <button
          mat-icon-button
          class="more-btn"
          [matMenuTriggerFor]="menu"
          (click)="$event.stopPropagation()"
        >
          <mat-icon>more_vert</mat-icon>
        </button>
      </div>
      @if (sound().tags && sound().tags.length) {
        <div class="tag-row">
          @for (tag of displayedTags(); track tag) {
            <span
              class="tag-chip"
              [style.background]="getTagBackground(tag)"
              [style.border-color]="getTagBorderColor(tag)"
            ><span class="hash">#</span>{{ tag }}</span>
          }
          @if (hiddenTagCount() > 0) {
            <span class="tag-chip tag-more" [matTooltip]="hiddenTags()">+{{ hiddenTagCount() }}</span>
          }
        </div>
      }
      @if (!selectionMode()) {
        <div class="vote-stack">
          <button
            class="vote-btn upvote"
            [class.active]="isUpvoted()"
            [class.animating]="upvoteAnimating()"
            [disabled]="!auth.isLoggedIn()"
            (click)="onUpvote($event)"
            [matTooltip]="auth.isLoggedIn() ? (isUpvoted() ? 'Upvote entfernen' : 'Upvote') : 'Einloggen zum Voten'"
          >
            <mat-icon>thumb_up</mat-icon>
          </button>
          <span class="vote-score" [class.positive]="(sound().score ?? 0) > 0" [class.negative]="(sound().score ?? 0) < 0">
            {{ sound().score ?? 0 }}
          </span>
          <button
            class="vote-btn downvote"
            [class.active]="isDownvoted()"
            [class.animating]="downvoteAnimating()"
            [disabled]="!auth.isLoggedIn()"
            (click)="onDownvote($event)"
            [matTooltip]="auth.isLoggedIn() ? (isDownvoted() ? 'Downvote entfernen' : 'Downvote') : 'Einloggen zum Voten'"
          >
            <mat-icon>thumb_down</mat-icon>
          </button>
        </div>
      }
    </div>

    <mat-menu #menu="matMenu">
      <button mat-menu-item (click)="playClick.emit(sound())">
        <mat-icon>speaker</mat-icon>
        <span>Auf Nervbox abspielen</span>
      </button>
      <button mat-menu-item (click)="playInBrowser()">
        <mat-icon>headphones</mat-icon>
        <span>Im Browser anhören</span>
      </button>
      <button mat-menu-item (click)="openInMixer()">
        <mat-icon>tune</mat-icon>
        <span>Im Mixer öffnen</span>
      </button>
      @if (isAdmin()) {
        <mat-divider></mat-divider>
        <button mat-menu-item (click)="editClick.emit(sound())">
          <mat-icon>edit</mat-icon>
          <span>Bearbeiten</span>
        </button>
        <button mat-menu-item (click)="toggleClick.emit(sound())">
          <mat-icon>{{ sound().enabled ? 'visibility_off' : 'visibility' }}</mat-icon>
          <span>{{ sound().enabled ? 'Deaktivieren' : 'Aktivieren' }}</span>
        </button>
        <button mat-menu-item class="delete-item" (click)="deleteClick.emit(sound())">
          <mat-icon>delete_forever</mat-icon>
          <span>Löschen</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      padding-top: 2px;
      margin-top: -2px;
    }

    .sound-card {
      position: relative;
      background: linear-gradient(
        180deg,
        rgba(32, 32, 38, 0.9) 0%,
        rgba(22, 22, 26, 0.95) 100%
      );
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
      padding: 11px 14px;
      cursor: pointer;
      transition:
        transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
        box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
        border-color 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 54px;
      min-width: 0;
      overflow: hidden;
      user-select: none;
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.2),
        0 4px 8px rgba(0, 0, 0, 0.15),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .sound-card::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 10px;
      padding: 1px;
      background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.08) 0%,
        rgba(255, 255, 255, 0) 50%
      );
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }

    .sound-card.disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .sound-card:hover:not(.disabled) {
      transform: translateY(-2px);
      border-color: rgba(147, 51, 234, 0.25);
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.2),
        0 8px 24px rgba(0, 0, 0, 0.25),
        0 12px 32px rgba(147, 51, 234, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .sound-card:active:not(.disabled) {
      transform: translateY(0);
      transition-duration: 0.05s;
    }

    .card-main {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      overflow: hidden;
      padding-right: 32px;
    }

    .sound-icon {
      color: rgba(147, 51, 234, 0.6);
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: color 0.2s ease, transform 0.2s ease;
    }

    .sound-card:hover:not(.disabled) .sound-icon {
      color: rgba(147, 51, 234, 0.9);
      transform: scale(1.1);
    }

    .author-avatar {
      flex-shrink: 0;
    }

    .disabled .sound-icon {
      color: rgba(147, 51, 234, 0.25);
    }

    .sound-name {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.88);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      letter-spacing: -0.01em;
      transition: color 0.15s ease;
    }

    .sound-card:hover:not(.disabled) .sound-name {
      color: rgba(255, 255, 255, 1);
    }

    .duration {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.32);
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    .play-count {
      font-size: 11px;
      color: rgba(236, 72, 153, 0.55);
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    .more-btn {
      width: 26px !important;
      height: 26px !important;
      padding: 0 !important;
      margin: -4px 0;
      opacity: 0;
      transition: opacity 0.15s ease, background 0.15s ease !important;
      flex-shrink: 0;
      border-radius: 6px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .more-btn:hover {
      opacity: 1 !important;
      background: rgba(255, 255, 255, 0.08) !important;
    }

    .more-btn mat-icon {
      color: rgba(255, 255, 255, 0.7);
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }

    .sound-card:hover .more-btn {
      opacity: 0.6;
    }

    .tag-row {
      display: flex;
      flex-wrap: nowrap;
      gap: 5px;
      padding-left: 32px;
      padding-right: 36px;
      margin-top: -2px;
      overflow: hidden;
    }

    .tag-chip {
      background: rgba(255, 255, 255, 0.035);
      border: none;
      border-radius: 5px;
      padding: 3px 7px;
      font-size: 10px;
      font-weight: 450;
      color: rgba(255, 255, 255, 0.42);
      letter-spacing: 0.01em;
      transition: all 0.15s ease;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .tag-chip .hash {
      color: #9333ea;
      font-weight: 600;
    }

    .sound-card:hover:not(.disabled) .tag-chip {
      background: rgba(255, 255, 255, 0.055);
      color: rgba(255, 255, 255, 0.6);
    }

    .sound-card:hover:not(.disabled) .tag-chip .hash {
      color: #a855f7;
    }

    .tag-more {
      background: rgba(236, 72, 153, 0.06);
      color: rgba(236, 72, 153, 0.55);
      cursor: help;
    }

    .sound-card:hover:not(.disabled) .tag-more {
      background: rgba(236, 72, 153, 0.1);
      color: rgba(236, 72, 153, 0.7);
    }

    .monospace {
      font-family: 'JetBrains Mono', monospace;
    }

    /* Vote Stack - Right Side */
    .vote-stack {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      background: transparent;
      border-radius: 6px;
      padding: 2px;
      transition: background 0.15s ease;
    }

    .sound-card:hover .vote-stack {
      background: rgba(0, 0, 0, 0.3);
    }

    .vote-btn {
      width: 22px;
      height: 20px;
      padding: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.15s ease;
    }

    .vote-btn:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .vote-btn:not(:disabled):hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .vote-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.25);
      transition: color 0.15s ease, transform 0.15s ease;
    }

    .sound-card:hover .vote-btn mat-icon {
      color: rgba(255, 255, 255, 0.5);
    }

    .vote-btn:not(:disabled):hover mat-icon {
      color: rgba(255, 255, 255, 0.8);
    }

    .vote-btn.upvote.active mat-icon {
      color: rgba(74, 222, 128, 0.6);
    }

    .sound-card:hover .vote-btn.upvote.active mat-icon {
      color: #4ade80;
    }

    .vote-btn.upvote:not(:disabled):hover mat-icon {
      color: #4ade80;
    }

    .vote-btn.downvote.active mat-icon {
      color: rgba(248, 113, 113, 0.6);
    }

    .sound-card:hover .vote-btn.downvote.active mat-icon {
      color: #f87171;
    }

    .vote-btn.downvote:not(:disabled):hover mat-icon {
      color: #f87171;
    }

    .vote-btn.animating mat-icon {
      animation: votePopAnim 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes votePopAnim {
      0% { transform: scale(1); }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }

    .vote-score {
      font-size: 11px;
      font-weight: 700;
      min-width: 18px;
      text-align: center;
      color: rgba(255, 255, 255, 0.7);
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
      line-height: 14px;
    }

    .vote-score.positive {
      color: #4ade80;
    }

    .vote-score.negative {
      color: #f87171;
    }

    .delete-item {
      color: #ef4444 !important;
    }

    .delete-item mat-icon {
      color: #ef4444 !important;
    }

    /* Selection Mode Styles */
    .sound-card.selection-mode {
      cursor: pointer;
    }

    .sound-card.selection-mode:hover:not(.disabled) {
      border-color: rgba(34, 197, 94, 0.2);
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.2),
        0 8px 24px rgba(0, 0, 0, 0.25),
        0 12px 32px rgba(34, 197, 94, 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .sound-card.selected {
      background: linear-gradient(
        180deg,
        rgba(34, 197, 94, 0.12) 0%,
        rgba(22, 22, 26, 0.95) 100%
      );
      border-color: rgba(34, 197, 94, 0.25);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.2),
        0 4px 8px rgba(0, 0, 0, 0.15),
        0 0 0 1px rgba(34, 197, 94, 0.1),
        inset 0 1px 0 rgba(34, 197, 94, 0.1);
    }

    .selection-indicator {
      color: rgba(255, 255, 255, 0.28);
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: color 0.15s ease, transform 0.15s ease;
    }

    .selection-indicator.checked {
      color: #22c55e;
      transform: scale(1.05);
    }

    .sound-card:hover:not(.disabled) .selection-indicator:not(.checked) {
      color: rgba(255, 255, 255, 0.4);
    }

    /* Favorite Button Styles */
    .favorite-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      margin: 0 -4px 0 -2px;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      border-radius: 50%;
      transition: transform 0.15s ease, background 0.15s ease;
    }

    .favorite-btn:hover {
      background: rgba(236, 72, 153, 0.15);
    }

    .favorite-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: rgba(255, 255, 255, 0.3);
      transition: color 0.15s ease, transform 0.15s ease;
    }

    .favorite-btn:hover mat-icon {
      color: rgba(236, 72, 153, 0.7);
    }

    .favorite-btn.is-favorite mat-icon {
      color: #ec4899;
    }

    .favorite-btn.is-favorite:hover mat-icon {
      color: #f472b6;
    }

    /* Pop Animation */
    .favorite-btn.animating mat-icon {
      animation: favoritePopAnim 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes favoritePopAnim {
      0% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.35);
      }
      100% {
        transform: scale(1);
      }
    }
  `,
})
export class SoundCardComponent implements AfterViewInit {
  readonly auth = inject(AuthService);
  private readonly favoritesService = inject(FavoritesService);
  private readonly achievementService = inject(AchievementService);
  private readonly api = inject(ApiService);
  private readonly voteService = inject(VoteService);

  readonly favoriteAnimating = signal(false);
  readonly upvoteAnimating = signal(false);
  readonly downvoteAnimating = signal(false);

  readonly sound = input.required<Sound>();
  readonly tagColors = input<Record<string, string>>({});
  readonly selectionMode = input<boolean>(false);
  readonly isSelected = input<boolean>(false);
  readonly playClick = output<Sound>();
  readonly editClick = output<Sound>();
  readonly toggleClick = output<Sound>();
  readonly deleteClick = output<Sound>();
  readonly selectionToggle = output<Sound>();

  private readonly nameEl = viewChild<ElementRef<HTMLElement>>('nameEl');
  private readonly nameTruncated = signal(false);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  readonly isNameTruncated = computed(() => this.nameTruncated());
  readonly displayedTags = computed(() => this.sound().tags?.slice(0, 3) ?? []);
  readonly hiddenTagCount = computed(() => Math.max(0, (this.sound().tags?.length ?? 0) - 3));
  readonly hiddenTags = computed(() => this.sound().tags?.slice(3).map(t => `#${t}`).join(', ') ?? '');

  readonly userVote = computed(() => this.voteService.getUserVote(this.sound().hash));
  readonly isUpvoted = computed(() => this.userVote() === 1);
  readonly isDownvoted = computed(() => this.userVote() === -1);

  ngAfterViewInit(): void {
    this.checkTruncation();
  }

  handleClick(): void {
    if (!this.sound().enabled) return;

    if (this.selectionMode()) {
      this.selectionToggle.emit(this.sound());
    } else {
      this.playClick.emit(this.sound());
    }
  }

  private checkTruncation(): void {
    const el = this.nameEl()?.nativeElement;
    if (el) {
      this.nameTruncated.set(el.scrollWidth > el.clientWidth);
    }
  }

  openInMixer(): void {
    // Grant mixer visit achievement before navigation
    this.achievementService.markMixerVisited().subscribe();
    window.location.href = `/mixer?sounds=${this.sound().hash}`;
  }

  playInBrowser(): void {
    const url = this.api.getFullUrl(`/sound/${this.sound().hash}/file`);
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.play().catch(err => console.warn('Browser audio playback failed:', err));
  }

  isFavorite(): boolean {
    return this.favoritesService.isFavorite(this.sound().hash);
  }

  toggleFavorite(event: Event): void {
    event.stopPropagation();
    this.favoriteAnimating.set(true);
    this.favoritesService.toggleFavorite(this.sound().hash);
    setTimeout(() => this.favoriteAnimating.set(false), 300);
  }

  onUpvote(event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn()) return;

    this.upvoteAnimating.set(true);
    this.voteService.toggleVote(this.sound().hash, 1).subscribe();
    setTimeout(() => this.upvoteAnimating.set(false), 300);
  }

  onDownvote(event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn()) return;

    this.downvoteAnimating.set(true);
    this.voteService.toggleVote(this.sound().hash, -1).subscribe();
    setTimeout(() => this.downvoteAnimating.set(false), 300);
  }

  getTagBackground(tag: string): string {
    const color = this.tagColors()[tag] || '#9333ea';
    return this.hexToRgba(color, 0.15);
  }

  getTagBorderColor(tag: string): string {
    const color = this.tagColors()[tag] || '#9333ea';
    return this.hexToRgba(color, 0.35);
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
