import { Component, inject, input, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
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
      [class.clickable]="isClickable()"
      [title]="displayName()"
      (click)="onClick($event)"
    >
      @if (!imageError() && resolvedAvatarUrl()) {
        <img
          [src]="resolvedAvatarUrl()"
          class="avatar-img"
          alt="Avatar"
          (error)="onImageError()"
        />
      } @else {
        <span class="avatar-initials">{{ resolvedInitials() }}</span>
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

    .avatar-container.clickable {
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .avatar-container.clickable:hover {
      transform: scale(1.1);
      box-shadow: 0 2px 8px rgba(147, 51, 234, 0.3);
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
  private readonly dialog = inject(MatDialog);

  // Inputs - either userId OR (imageUrl + initials)
  readonly userId = input<number>();
  readonly size = input<AvatarSize>('medium');
  // Direct inputs for when not using userId lookup
  readonly imageUrl = input<string | null>();
  readonly initials = input<string>();
  readonly name = input<string>();
  // Control clickability (default: true if userId is set)
  readonly clickable = input<boolean | undefined>(undefined);

  // State
  readonly imageError = signal(false);

  // Computed - is this avatar clickable?
  readonly isClickable = computed(() => {
    const explicitClickable = this.clickable();
    if (explicitClickable !== undefined) return explicitClickable;
    // Default: clickable if we have a userId
    return !!this.userId();
  });

  // Computed - resolve avatar URL from either direct input or cache
  readonly resolvedAvatarUrl = computed(() => {
    // Direct imageUrl takes precedence
    const directUrl = this.imageUrl();
    if (directUrl) return directUrl;

    // Otherwise lookup by userId
    const id = this.userId();
    if (id) {
      return `${this.userCache.getAvatarUrl(id)}?t=${Date.now()}`;
    }

    return null;
  });

  // Computed - resolve initials from either direct input or cache
  readonly resolvedInitials = computed(() => {
    // Direct initials takes precedence
    const directInitials = this.initials();
    if (directInitials) return directInitials;

    // Otherwise lookup by userId
    const id = this.userId();
    if (id) {
      return this.userCache.getInitials(id);
    }

    return '?';
  });

  // Computed - display name for title
  readonly displayName = computed(() => {
    const directName = this.name();
    if (directName) return directName;

    const id = this.userId();
    if (id) {
      return this.userCache.getDisplayName(id);
    }

    return '';
  });

  ngOnInit(): void {
    // Ensure users are loaded if using userId mode
    if (this.userId() && !this.userCache.isLoaded()) {
      this.userCache.loadUsers().subscribe();
    }
  }

  onImageError(): void {
    this.imageError.set(true);
  }

  async onClick(event: Event): Promise<void> {
    if (!this.isClickable()) return;

    const id = this.userId();
    if (!id) return;

    event.stopPropagation();

    // Dynamic import to avoid circular dependency
    const { UserProfileDialogComponent } = await import(
      '../user-profile-dialog/user-profile-dialog.component'
    );

    this.dialog.open(UserProfileDialogComponent, {
      data: { userId: id },
      panelClass: 'dark-dialog',
      maxWidth: '450px',
    });
  }
}
