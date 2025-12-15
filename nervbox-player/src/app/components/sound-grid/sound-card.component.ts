import { Component, computed, inject, input, output, signal, ElementRef, viewChild, AfterViewInit } from '@angular/core';
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

@Component({
  selector: 'app-sound-card',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatRippleModule,
    MatMenuModule,
    MatDividerModule,
    DurationPipe,
  ],
  template: `
    <div
      class="sound-card"
      [class.disabled]="!sound().enabled"
      matRipple
      [matRippleColor]="'rgba(147, 51, 234, 0.2)'"
      (click)="sound().enabled && playClick.emit(sound())"
    >
      <div class="card-main">
        <mat-icon class="sound-icon">{{ sound().enabled ? 'music_note' : 'music_off' }}</mat-icon>
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
            >{{ tag }}</span>
          }
          @if (hiddenTagCount() > 0) {
            <span class="tag-chip tag-more" [matTooltip]="hiddenTags()">+{{ hiddenTagCount() }}</span>
          }
        </div>
      }
    </div>

    <mat-menu #menu="matMenu">
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
          <span>Loeschen</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .sound-card {
      background: linear-gradient(135deg, rgba(26, 27, 31, 0.9) 0%, rgba(20, 10, 25, 0.8) 100%);
      border: 1px solid rgba(147, 51, 234, 0.2);
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 52px;
      user-select: none;
    }

    .sound-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .sound-card:hover:not(.disabled) {
      border-color: rgba(147, 51, 234, 0.5);
      box-shadow: 0 2px 12px rgba(147, 51, 234, 0.25);
    }

    .card-main {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sound-icon {
      color: #9333ea;
      font-size: 16px;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .disabled .sound-icon {
      color: rgba(147, 51, 234, 0.5);
    }

    .sound-name {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.95);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .duration {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.4);
      flex-shrink: 0;
    }

    .play-count {
      font-size: 10px;
      color: rgba(236, 72, 153, 0.7);
      flex-shrink: 0;
    }

    .more-btn {
      width: 24px !important;
      height: 24px !important;
      padding: 0 !important;
      opacity: 0.4;
      transition: opacity 0.2s ease !important;
      flex-shrink: 0;
    }

    .more-btn:hover {
      opacity: 1;
    }

    .more-btn mat-icon {
      color: rgba(255, 255, 255, 0.8);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .sound-card:hover .more-btn {
      opacity: 0.7;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-left: 24px;
    }

    .tag-chip {
      background: rgba(147, 51, 234, 0.15);
      border: 1px solid rgba(147, 51, 234, 0.25);
      border-radius: 8px;
      padding: 1px 6px;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.6);
    }

    .tag-more {
      background: rgba(236, 72, 153, 0.15);
      border-color: rgba(236, 72, 153, 0.25);
      cursor: help;
    }

    .monospace {
      font-family: 'JetBrains Mono', monospace;
    }

    .delete-item {
      color: #ef4444 !important;
    }

    .delete-item mat-icon {
      color: #ef4444 !important;
    }
  `,
})
export class SoundCardComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);

  readonly sound = input.required<Sound>();
  readonly tagColors = input<Record<string, string>>({});
  readonly playClick = output<Sound>();
  readonly editClick = output<Sound>();
  readonly toggleClick = output<Sound>();
  readonly deleteClick = output<Sound>();

  private readonly nameEl = viewChild<ElementRef<HTMLElement>>('nameEl');
  private readonly nameTruncated = signal(false);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  readonly isNameTruncated = computed(() => this.nameTruncated());
  readonly displayedTags = computed(() => this.sound().tags?.slice(0, 3) ?? []);
  readonly hiddenTagCount = computed(() => Math.max(0, (this.sound().tags?.length ?? 0) - 3));
  readonly hiddenTags = computed(() => this.sound().tags?.slice(3).join(', ') ?? '');

  ngAfterViewInit(): void {
    this.checkTruncation();
  }

  private checkTruncation(): void {
    const el = this.nameEl()?.nativeElement;
    if (el) {
      this.nameTruncated.set(el.scrollWidth > el.clientWidth);
    }
  }

  openInMixer(): void {
    window.open(`/mixer?sounds=${this.sound().hash}`, '_blank');
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
