import { Component, Input, computed, signal, inject, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AchievementService } from '../../../core/services/achievement.service';
import {
  UserAchievementsResponse,
  UserAchievementInfo,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_ICONS,
  AchievementCategory,
} from '../../../core/models/achievement.model';

@Component({
  selector: 'app-achievement-display',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, MatProgressSpinnerModule],
  template: `
    <div class="achievements-container">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      } @else if (error()) {
        <div class="error-container">
          <mat-icon>error_outline</mat-icon>
          <span>Achievements konnten nicht geladen werden</span>
        </div>
      } @else {
        <div class="achievements-header">
          <div class="achievements-title">
            <mat-icon>emoji_events</mat-icon>
            <span>Achievements</span>
          </div>
          <div class="achievements-progress">
            <span class="progress-text">{{ earnedCount() }} / {{ totalCount() }}</span>
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="completionPercentage()"></div>
            </div>
          </div>
        </div>

        <div class="achievements-grid nervbox-scrollbar">
          @for (category of groupedAchievements(); track category.category) {
            <div class="category-section">
              <h4 class="category-title">
                <mat-icon>{{ category.categoryIcon }}</mat-icon>
                {{ category.categoryName }}
              </h4>
              <div class="category-achievements">
                @for (achievement of category.achievements; track achievement.id) {
                  <div
                    class="achievement-item"
                    [class.earned]="achievement.earned"
                    [matTooltip]="getTooltipText(achievement)"
                    matTooltipPosition="above"
                  >
                    <div class="achievement-icon-container">
                      <mat-icon class="achievement-icon">{{ achievement.icon }}</mat-icon>
                      @if (achievement.earned) {
                        <div class="earned-checkmark">
                          <mat-icon>check_circle</mat-icon>
                        </div>
                      }
                    </div>
                    <span class="achievement-name">{{ achievement.name }}</span>
                    @if (achievement.rewardCredits > 0) {
                      <span class="reward-badge">+{{ achievement.rewardCredits }}</span>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .achievements-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .loading-container,
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 32px 24px;
      color: rgba(255, 255, 255, 0.5);
    }

    .error-container mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #ef4444;
    }

    .achievements-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .achievements-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.8);
    }

    .achievements-title mat-icon {
      color: #fbbf24;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .achievements-progress {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-text {
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      color: rgba(255, 255, 255, 0.5);
    }

    .progress-bar {
      width: 60px;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #9333ea, #ec4899);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .achievements-grid {
      max-height: 300px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .category-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-title mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(147, 51, 234, 0.6);
    }

    .category-achievements {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .achievement-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.2s ease;
      opacity: 0.4;
      filter: grayscale(100%);
      cursor: default;
    }

    .achievement-item.earned {
      opacity: 1;
      filter: none;
      background: rgba(147, 51, 234, 0.1);
      border-color: rgba(147, 51, 234, 0.3);
    }

    .achievement-item.earned:hover {
      background: rgba(147, 51, 234, 0.15);
      border-color: rgba(147, 51, 234, 0.4);
    }

    .achievement-icon-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .achievement-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: rgba(255, 255, 255, 0.5);
    }

    .achievement-item.earned .achievement-icon {
      color: #fbbf24;
    }

    .earned-checkmark {
      position: absolute;
      bottom: -4px;
      right: -4px;
      background: #1a1a2e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .earned-checkmark mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
      color: #22c55e;
    }

    .achievement-name {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
    }

    .achievement-item.earned .achievement-name {
      color: rgba(255, 255, 255, 0.9);
    }

    .reward-badge {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      padding: 2px 6px;
      background: rgba(251, 191, 36, 0.2);
      color: #fbbf24;
      border-radius: 4px;
    }

    .achievement-item:not(.earned) .reward-badge {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.3);
    }
  `,
})
export class AchievementDisplayComponent implements OnInit, OnChanges {
  @Input() userId!: number;
  @Input() compact = false;

  private readonly achievementService = inject(AchievementService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly achievementsData = signal<UserAchievementsResponse | null>(null);

  readonly earnedCount = computed(() => this.achievementsData()?.totalEarned ?? 0);
  readonly totalCount = computed(() => this.achievementsData()?.totalAvailable ?? 0);
  readonly completionPercentage = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.earnedCount() / total) * 100);
  });

  readonly groupedAchievements = computed(() => {
    const data = this.achievementsData();
    if (!data) return [];

    const grouped = new Map<string, UserAchievementInfo[]>();

    for (const achievement of data.achievements) {
      const category = achievement.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(achievement);
    }

    const categoryOrder = [
      'General',
      'SoundPlayback',
      'SoundCreation',
      'MiniGames',
      'Gambling',
      'Chat',
      'Social',
      'Wealth',
    ];

    return categoryOrder
      .filter(cat => grouped.has(cat))
      .map(cat => ({
        category: cat,
        categoryName: CATEGORY_DISPLAY_NAMES[cat as AchievementCategory] || cat,
        categoryIcon: CATEGORY_ICONS[cat as AchievementCategory] || 'emoji_events',
        achievements: grouped.get(cat)!,
      }));
  });

  ngOnInit(): void {
    this.loadAchievements();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && !changes['userId'].firstChange) {
      this.loadAchievements();
    }
  }

  private loadAchievements(): void {
    if (!this.userId) return;

    this.loading.set(true);
    this.error.set(false);

    this.achievementService.getUserAchievements(this.userId).subscribe({
      next: data => {
        this.achievementsData.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  getTooltipText(achievement: UserAchievementInfo): string {
    let text = `${achievement.name}\n${achievement.description}`;
    if (achievement.earned && achievement.earnedAt) {
      const date = new Date(achievement.earnedAt);
      text += `\n\nFreigeschaltet am ${date.toLocaleDateString('de-DE')}`;
    }
    if (achievement.rewardCredits > 0) {
      text += `\n+${achievement.rewardCredits} Shekel Belohnung`;
    }
    return text;
  }
}
