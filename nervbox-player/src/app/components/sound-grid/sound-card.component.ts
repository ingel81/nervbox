import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { Sound } from '../../core/models';
import { DurationPipe } from '../../shared/pipes/duration.pipe';

@Component({
  selector: 'app-sound-card',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatRippleModule,
    DurationPipe,
  ],
  template: `
    <div
      class="sound-card"
      matRipple
      [matRippleColor]="'rgba(147, 51, 234, 0.2)'"
      (click)="playClick.emit(sound())"
    >
      <mat-icon class="sound-icon">music_note</mat-icon>
      <span class="sound-name" [matTooltip]="sound().name">
        {{ sound().name }}
      </span>
      <span class="duration monospace">{{ sound().durationMs | duration }}</span>
      @if (sound().playCount) {
        <span class="play-count monospace">{{ sound().playCount }}x</span>
      }
      <button
        mat-icon-button
        class="play-btn"
        (click)="onPlayClick($event)"
      >
        <mat-icon>play_arrow</mat-icon>
      </button>
    </div>
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
      align-items: center;
      gap: 8px;
    }

    .sound-card:hover {
      border-color: rgba(147, 51, 234, 0.5);
      box-shadow: 0 2px 12px rgba(147, 51, 234, 0.25);
    }

    .sound-icon {
      color: #9333ea;
      font-size: 16px;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
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

    .play-btn {
      width: 26px !important;
      height: 26px !important;
      padding: 0 !important;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      border-radius: 50% !important;
      transition: all 0.2s ease !important;
      flex-shrink: 0;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .play-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 0 12px rgba(147, 51, 234, 0.5);
    }

    .play-btn mat-icon {
      color: white;
      font-size: 18px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .monospace {
      font-family: 'JetBrains Mono', monospace;
    }
  `,
})
export class SoundCardComponent {
  readonly sound = input.required<Sound>();
  readonly playClick = output<Sound>();

  onPlayClick(event: Event): void {
    event.stopPropagation();
    this.playClick.emit(this.sound());
  }
}
