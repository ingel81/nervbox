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
      <div class="card-header">
        <mat-icon class="sound-icon">music_note</mat-icon>
        <span class="sound-name" [matTooltip]="sound().name">
          {{ sound().name }}
        </span>
      </div>

      <div class="card-meta">
        <div class="tags">
          @for (tag of sound().tags?.slice(0, 2); track tag) {
            <span class="tag">{{ tag }}</span>
          }
        </div>
        <span class="duration monospace">{{ sound().durationMs | duration }}</span>
      </div>

      <div class="card-footer">
        <button
          mat-icon-button
          class="play-btn"
          (click)="onPlayClick($event)"
          matTooltip="Abspielen"
        >
          <mat-icon>play_arrow</mat-icon>
        </button>
        @if (sound().playCount) {
          <span class="play-count monospace">{{ sound().playCount }}x</span>
        }
      </div>
    </div>
  `,
  styles: `
    .sound-card {
      background: linear-gradient(135deg, rgba(26, 27, 31, 0.9) 0%, rgba(20, 10, 25, 0.8) 100%);
      border: 1px solid rgba(147, 51, 234, 0.2);
      border-radius: 10px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 160px;
      max-width: 200px;
    }

    .sound-card:hover {
      border-color: rgba(147, 51, 234, 0.5);
      box-shadow: 0 4px 20px rgba(147, 51, 234, 0.2), 0 0 30px rgba(147, 51, 234, 0.1);
      transform: translateY(-2px);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sound-icon {
      color: #9333ea;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .sound-name {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.95);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      flex: 1;
      overflow: hidden;
    }

    .tag {
      background: rgba(147, 51, 234, 0.2);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      text-transform: lowercase;
    }

    .duration {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      flex-shrink: 0;
    }

    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 4px;
    }

    .play-btn {
      width: 32px !important;
      height: 32px !important;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      border-radius: 50% !important;
      transition: all 0.2s ease !important;
    }

    .play-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 0 15px rgba(147, 51, 234, 0.5);
    }

    .play-btn mat-icon {
      color: white;
      font-size: 20px;
    }

    .play-count {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
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
