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
        } @else {
          <mat-icon class="sound-icon">{{ sound().enabled ? 'music_note' : 'music_off' }}</mat-icon>
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
    </div>

    <mat-menu #menu="matMenu">
      <button mat-menu-item (click)="playClick.emit(sound())">
        <mat-icon>play_arrow</mat-icon>
        <span>Anhören</span>
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
      overflow: hidden;
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
      margin: -4px -6px -4px 0;
      opacity: 0;
      transition: opacity 0.15s ease, background 0.15s ease !important;
      flex-shrink: 0;
      border-radius: 6px !important;
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
    }

    .sound-card:hover .more-btn {
      opacity: 0.6;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      padding-left: 32px;
      margin-top: -2px;
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
  `,
})
export class SoundCardComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);

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
    window.location.href = `/mixer?sounds=${this.sound().hash}`;
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
