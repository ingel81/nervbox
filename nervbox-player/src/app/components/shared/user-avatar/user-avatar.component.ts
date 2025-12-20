import { Component, inject, input, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserCacheService } from '../../../core/services/user-cache.service';

type AvatarSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="avatar-container"
      [class.small]="size() === 'small'"
      [class.medium]="size() === 'medium'"
      [class.large]="size() === 'large'"
      [title]="userCache.getDisplayName(userId())"
    >
      @if (!imageError()) {
        <img
          [src]="avatarUrl()"
          class="avatar-img"
          alt="Avatar"
          (error)="onImageError()"
        />
      } @else {
        <span class="avatar-initials">{{ initials() }}</span>
      }
    </div>
  `,
  styles: `
    .avatar-container {
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      aspect-ratio: 1;
    }

    /* Sizes */
    .avatar-container.small {
      width: 24px;
      min-width: 24px;
      height: 24px;
      min-height: 24px;
    }

    .avatar-container.medium {
      width: 32px;
      min-width: 32px;
      height: 32px;
      min-height: 32px;
    }

    .avatar-container.large {
      width: 48px;
      min-width: 48px;
      height: 48px;
      min-height: 48px;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initials {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      color: white;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .small .avatar-initials {
      font-size: 10px;
    }

    .medium .avatar-initials {
      font-size: 13px;
    }

    .large .avatar-initials {
      font-size: 18px;
    }
  `,
})
export class UserAvatarComponent implements OnInit {
  readonly userCache = inject(UserCacheService);

  // Inputs
  readonly userId = input.required<number>();
  readonly size = input<AvatarSize>('medium');

  // State
  readonly imageError = signal(false);

  // Computed
  readonly avatarUrl = computed(() => {
    return `${this.userCache.getAvatarUrl(this.userId())}?t=${Date.now()}`;
  });

  readonly initials = computed(() => {
    return this.userCache.getInitials(this.userId());
  });

  ngOnInit(): void {
    // Ensure users are loaded
    if (!this.userCache.isLoaded()) {
      this.userCache.loadUsers().subscribe();
    }
  }

  onImageError(): void {
    this.imageError.set(true);
  }
}
