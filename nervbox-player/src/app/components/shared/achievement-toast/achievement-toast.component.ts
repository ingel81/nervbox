import { Component, inject, effect } from '@angular/core';
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
      state('void', style({
        transform: 'translateY(-100%)',
        opacity: 0,
      })),
      state('*', style({
        transform: 'translateY(0)',
        opacity: 1,
      })),
      transition('void => *', animate('300ms ease-out')),
      transition('* => void', animate('200ms ease-in')),
    ]),
  ],
  template: `
    @if (achievement(); as earned) {
      <div class="achievement-toast" @slideIn (click)="dismiss()">
        <div class="toast-icon">
          <mat-icon>{{ earned.achievement.icon }}</mat-icon>
        </div>
        <div class="toast-content">
          <span class="toast-title">Achievement freigeschaltet!</span>
          <span class="toast-name">{{ earned.achievement.name }}</span>
          <span class="toast-description">{{ earned.achievement.description }}</span>
        </div>
        @if (earned.achievement.rewardCredits > 0) {
          <div class="toast-reward">
            <img src="icons/nervbox-coin.svg" alt="" class="reward-coin">
            <span>+{{ earned.achievement.rewardCredits }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .achievement-toast {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.95) 0%, rgba(236, 72, 153, 0.95) 100%);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
      cursor: pointer;
      backdrop-filter: blur(8px);
      max-width: calc(100vw - 32px);
    }

    .toast-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      flex-shrink: 0;
    }

    .toast-icon mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #fbbf24;
    }

    .toast-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .toast-title {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .toast-name {
      font-size: 16px;
      font-weight: 700;
      color: white;
    }

    .toast-description {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toast-reward {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(251, 191, 36, 0.2);
      border-radius: 8px;
      flex-shrink: 0;
    }

    .reward-coin {
      width: 20px;
      height: 20px;
    }

    .toast-reward span {
      font-size: 14px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: #fbbf24;
    }
  `,
})
export class AchievementToastComponent {
  private readonly achievementService = inject(AchievementService);

  readonly achievement = this.achievementService.lastEarnedAchievement;

  dismiss(): void {
    this.achievementService.clearNotification();
  }
}
