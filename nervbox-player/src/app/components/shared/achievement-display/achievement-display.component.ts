import {
  Component,
  Input,
  computed,
  signal,
  inject,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
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
    <div class="nk-section ach">
      @if (loading()) {
        <div class="ach-state"><span class="nk-spin" aria-hidden="true"></span>Achievements werden geladen …</div>
      } @else if (error()) {
        <div class="ach-state">Achievements konnten nicht geladen werden</div>
      } @else {
        <h3 class="nk-section__title">Achievements <span class="nk-section__aside">{{ earnedCount() }} / {{ totalCount() }}</span></h3>
        <div class="nk-progress nk-progress--lamp ach-progress" role="progressbar" [attr.aria-valuenow]="completionPercentage()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="earnedCount() + ' von ' + totalCount() + ' Achievements'">
          <span class="nk-progress__fill" [style.width.%]="completionPercentage()"></span>
        </div>
        <div class="ach-felt" [class.ach-felt--compact]="compact">
          @for (category of groupedAchievements(); track category.category) {
            <div class="ach-group">
              <span class="ach-group__name">{{ category.categoryName }}</span>
              <div class="ach-pins">
                @for (a of category.achievements; track a.id) {
                  <div
                    [class]="a.earned ? 'nk-pin' : 'nk-pin nk-pin--locked'"
                    [style]="pinStyle(category.category)"
                    [matTooltip]="getTooltipText(a)"
                    matTooltipClass="nk-tip-multiline"
                    matTooltipPosition="above"
                    tabindex="0"
                    [attr.aria-label]="a.name + (a.earned ? ', verdient' : ', noch offen')"
                  >
                    <span class="nk-pin__badge">
                      <mat-icon class="ach-icon" aria-hidden="true">{{ a.icon }}</mat-icon>
                      @if (a.rewardCredits > 0) {
                        <span class="nk-pin__reward">+{{ a.rewardCredits }}</span>
                      }
                    </span>
                    <span class="nk-pin__name">{{ a.name }}</span>
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
    :host {
      display: block;
      min-width: 0;
    }
    .ach-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 4px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .ach-progress {
      margin: 0 2px 4px;
    }
    .ach-felt {
      position: relative;
      padding: 16px 18px;
      border-radius: 10px;
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: 16px 26px;
      background: radial-gradient(rgb(255 255 255 / 0.035) 0.7px, transparent 1px) 0 0 / 3px 3px,
        radial-gradient(ellipse 520px 300px at 0 0, rgb(255 206 140 / 0.12), rgb(255 206 140 / 0)),
        linear-gradient(160deg, #2b2620, #1d1a16);
      box-shadow: inset 2px 3px 10px rgb(0 0 0 / 0.85), inset 0 0 0 1px rgb(0 0 0 / 0.6), 1px 1px 0 rgb(255 226 176 / 0.16);
    }
    .ach-felt--compact {
      gap: 12px 18px;
      padding: 12px;
    }
    .ach-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ach-group__name {
      font: 700 11px/1 var(--nk-font-ui);
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--nk-iv-2);
    }
    .ach-pins {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .nk-pin {
      width: 92px;
      outline: none;
    }
    .nk-pin:focus-visible .nk-pin__badge {
      outline: 2px solid var(--nk-iv);
      outline-offset: 4px;
    }
    .ach-icon {
      width: 24px;
      height: 24px;
      font-size: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      .filter((cat) => grouped.has(cat))
      .map((cat) => ({
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
      next: (data) => {
        this.achievementsData.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Emaille-Farbe je Kategorie */
  pinStyle(category: string): string {
    const c: Record<string, [string, string]> = {
      General: ['#5E86AE', '94 134 174'],
      SoundPlayback: ['#C33A2F', '195 58 47'],
      SoundCreation: ['#2B8C86', '43 140 134'],
      MiniGames: ['#C27A22', '194 122 34'],
      Gambling: ['#8C6C12', '170 132 22'],
      Chat: ['#4E7BA6', '78 123 166'],
      Social: ['#9C5F63', '156 95 99'],
      Wealth: ['#6E7F2A', '110 127 42'],
    };
    const [hex, rgb] = c[category] ?? ['#5A5346', '90 83 70'];
    return `--nk-pin-c: ${hex}; --nk-pin-rgb: ${rgb}`;
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
