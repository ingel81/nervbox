import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { AchievementService } from '../../../core/services/achievement.service';

@Component({
  selector: 'app-achievement-toast',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  animations: [
    trigger('slideIn', [
      state(
        'void',
        style({
          transform: 'translateY(-100%)',
          opacity: 0,
        }),
      ),
      state(
        '*',
        style({
          transform: 'translateY(0)',
          opacity: 1,
        }),
      ),
      transition('void => *', animate('300ms ease-out')),
      transition('* => void', animate('200ms ease-in')),
    ]),
  ],
  template: `
    @if (achievement(); as earned) {
      <div class="nk-toast nk-toast--success ach-toast" @slideIn role="status" (click)="dismiss()">
        <span class="nk-toast__icon"><mat-icon>{{ earned.achievement.icon }}</mat-icon></span>
        <span class="nk-toast__body">
          <span class="nk-toast__title">Achievement freigeschaltet!</span>
          <span class="nk-toast__name">{{ earned.achievement.name }}</span>
          <span class="nk-toast__text nk-toast__text--dim">{{ earned.achievement.description }}</span>
        </span>
        @if (earned.achievement.rewardCredits > 0) {
          <span class="nk-counter ach-reward">+{{ earned.achievement.rewardCredits }} N$</span>
        }
      </div>
    }
  `,
  styles: `
    .ach-toast {
      position: fixed;
      top: 18px;
      left: 16px;
      right: 16px;
      margin: 0 auto;
      z-index: 10000;
      width: 380px;
      max-width: calc(100vw - 32px);
      cursor: pointer;
    }
    .ach-reward {
      flex-shrink: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AchievementToastComponent {
  private readonly achievementService = inject(AchievementService);

  readonly achievement = this.achievementService.lastEarnedAchievement;

  dismiss(): void {
    this.achievementService.clearNotification();
  }
}
