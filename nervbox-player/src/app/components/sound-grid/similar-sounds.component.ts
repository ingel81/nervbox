import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SoundRecommendation } from '../../core/models';
import { SoundService } from '../../core/services/sound.service';

@Component({
  selector: 'app-similar-sounds',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="similar-sounds-container">
      <div class="header">
        <div class="header-content">
          <mat-icon class="ai-icon">auto_awesome</mat-icon>
          <span class="title">KI-Empfehlungen</span>
          @if (loading()) {
            <mat-spinner diameter="16"></mat-spinner>
          }
        </div>
        @if (!loading() && recommendations().length > 0) {
          <span class="count">{{ recommendations().length }}</span>
        }
      </div>

      @if (loading()) {
        <div class="loading-state">
          <p>Analysiere Hörgewohnheiten...</p>
        </div>
      } @else if (error()) {
        <div class="error-state">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error() }}</p>
        </div>
      } @else if (recommendations().length === 0) {
        <div class="empty-state">
          <mat-icon>lightbulb_outline</mat-icon>
          <p>Noch keine Empfehlungen verfügbar</p>
          <span class="hint">Spiele ein paar Sounds ab, um personalisierte Vorschläge zu erhalten</span>
        </div>
      } @else {
        <div class="recommendations-list">
          @for (rec of recommendations(); track rec.soundHash) {
            <button
              class="recommendation-item"
              (click)="soundSelected.emit(rec.soundHash)"
              [matTooltip]="rec.reason"
            >
              <div class="item-content">
                <mat-icon class="sound-icon">music_note</mat-icon>
                <div class="item-info">
                  <span class="sound-name">{{ rec.soundName }}</span>
                  <span class="reason">{{ rec.reason }}</span>
                </div>
              </div>
              <div class="score-bar">
                <div class="score-fill" [style.width.%]="rec.score"></div>
                <span class="score-text">{{ rec.score }}%</span>
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .similar-sounds-container {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(147, 51, 234, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ai-icon {
      color: #fbbf24;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }

    .count {
      background: rgba(147, 51, 234, 0.3);
      color: rgba(255, 255, 255, 0.9);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .loading-state,
    .error-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      color: rgba(255, 255, 255, 0.6);
      gap: 8px;
    }

    .empty-state mat-icon,
    .error-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      opacity: 0.3;
    }

    .hint {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 4px;
    }

    .recommendations-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .recommendation-item {
      background: rgba(147, 51, 234, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.2);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;
      width: 100%;
    }

    .recommendation-item:hover {
      background: rgba(147, 51, 234, 0.1);
      border-color: rgba(147, 51, 234, 0.4);
      transform: translateX(4px);
    }

    .item-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sound-icon {
      color: #9333ea;
      font-size: 20px;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .item-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .sound-name {
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .reason {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
    }

    .score-bar {
      position: relative;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .score-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background: linear-gradient(90deg, #9333ea, #ec4899);
      transition: width 0.5s ease-out;
    }

    .score-text {
      position: absolute;
      right: 4px;
      top: -16px;
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
    }
  `,
})
export class SimilarSoundsComponent implements OnInit {
  private readonly soundService = inject(SoundService);

  // Input: Which sound to get recommendations for (if empty, get personalized)
  readonly soundHash = input<string>('');

  // Output: When user clicks on a recommendation
  readonly soundSelected = output<string>();

  readonly recommendations = signal<SoundRecommendation[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRecommendations();
  }

  private loadRecommendations(): void {
    this.loading.set(true);
    this.error.set(null);

    const hash = this.soundHash();
    const request = hash
      ? this.soundService.getSimilarSounds(hash)
      : this.soundService.getPersonalizedRecommendations();

    request.subscribe({
      next: (recs) => {
        this.recommendations.set(recs);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Fehler beim Laden der Empfehlungen');
        this.loading.set(false);
        console.error('Failed to load recommendations:', err);
      },
    });
  }
}
