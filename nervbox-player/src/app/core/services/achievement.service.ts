import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SignalRService } from './signalr.service';
import {
  Achievement,
  UserAchievement,
  UserAchievementsResponse,
  AchievementEarnedEvent,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_ICONS,
  AchievementCategory,
} from '../models/achievement.model';

@Injectable({
  providedIn: 'root',
})
export class AchievementService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly signalR = inject(SignalRService);

  // All achievements
  readonly allAchievements = signal<Achievement[]>([]);
  readonly myAchievements = signal<UserAchievement[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly lastEarnedAchievement = signal<AchievementEarnedEvent | null>(null);

  // Computed
  readonly earnedCount = computed(() => this.myAchievements().length);
  readonly totalCount = computed(() => this.allAchievements().length);
  readonly completionPercentage = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.earnedCount() / total) * 100);
  });

  // Grouped achievements by category
  readonly achievementsByCategory = computed(() => {
    const achievements = this.allAchievements();
    const earnedIds = new Set(this.myAchievements().map(ua => ua.achievementId));

    const grouped = new Map<AchievementCategory, (Achievement & { earned: boolean })[]>();

    for (const achievement of achievements) {
      const category = achievement.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push({
        ...achievement,
        earned: earnedIds.has(achievement.id),
      });
    }

    // Sort by category display order
    const categoryOrder: AchievementCategory[] = [
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
        categoryName: CATEGORY_DISPLAY_NAMES[cat],
        categoryIcon: CATEGORY_ICONS[cat],
        achievements: grouped.get(cat)!,
      }));
  });

  constructor() {
    // Listen for SignalR achievement events
    effect(() => {
      const event = this.signalR.achievementEarned();
      if (event && event.userId === this.auth.currentUser()?.id) {
        this.lastEarnedAchievement.set(event);
        // Add to my achievements
        this.myAchievements.update(achievements => [
          ...achievements,
          {
            achievementId: event.achievement.id,
            earnedAt: event.timestamp,
            progressValue: 0,
          },
        ]);

        // Auto-clear notification after 5 seconds
        setTimeout(() => {
          if (this.lastEarnedAchievement()?.timestamp === event.timestamp) {
            this.lastEarnedAchievement.set(null);
          }
        }, 5000);
      }
    });

    // Load achievements when user logs in
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.loadMyAchievements();
      } else {
        this.myAchievements.set([]);
      }
    });

    // Load all achievements once
    this.loadAllAchievements();
  }

  loadAllAchievements(): void {
    this.api.get<Achievement[]>('/achievement').subscribe({
      next: (achievements) => {
        this.allAchievements.set(achievements);
      },
      error: (err) => {
        console.error('Failed to load achievements:', err);
      },
    });
  }

  loadMyAchievements(): void {
    if (!this.auth.isLoggedIn()) return;

    this.isLoading.set(true);
    this.api.get<UserAchievement[]>('/achievement/user').subscribe({
      next: (achievements) => {
        this.myAchievements.set(achievements);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load my achievements:', err);
        this.isLoading.set(false);
      },
    });
  }

  getUserAchievements(userId: number): Observable<UserAchievementsResponse> {
    return this.api.get<UserAchievementsResponse>(`/achievement/user/${userId}`);
  }

  markTourCompleted(): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('/achievement/tour-completed', {});
  }

  markMixerVisited(): Observable<{ success: boolean }> {
    return this.api.post<{ success: boolean }>('/achievement/mixer-visited', {});
  }

  hasAchievement(achievementId: string): boolean {
    return this.myAchievements().some(ua => ua.achievementId === achievementId);
  }

  getCategoryDisplayName(category: AchievementCategory): string {
    return CATEGORY_DISPLAY_NAMES[category] || category;
  }

  getCategoryIcon(category: AchievementCategory): string {
    return CATEGORY_ICONS[category] || 'emoji_events';
  }

  clearNotification(): void {
    this.lastEarnedAchievement.set(null);
  }
}
