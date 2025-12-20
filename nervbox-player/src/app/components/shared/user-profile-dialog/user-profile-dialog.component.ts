import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../../core/services/api.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { AchievementDisplayComponent } from '../achievement-display/achievement-display.component';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';

interface ProfileSound {
  hash: string;
  name: string;
  fileName: string;
  durationMs: number;
  createdAt: string;
  playCount: number;
}

interface UserProfile {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  credits: number;
  sounds: ProfileSound[];
  stats: {
    soundCount: number;
    totalPlays: number;
  };
}

@Component({
  selector: 'app-user-profile-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    UserAvatarComponent,
    AchievementDisplayComponent,
    DurationPipe,
  ],
  template: `
    <div class="profile-dialog">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (error()) {
        <div class="error-container">
          <mat-icon>error_outline</mat-icon>
          <span>Profil konnte nicht geladen werden</span>
          <button mat-button (click)="dialogRef.close()">Schließen</button>
        </div>
      } @else if (profile()) {
        <div class="profile-header">
          <app-user-avatar [userId]="data.userId" size="large" [clickable]="false" class="profile-avatar" />
          <div class="profile-info">
            <h2 class="username">{{ profile()!.username }}</h2>
            @if (profile()!.firstName || profile()!.lastName) {
              <span class="fullname">{{ profile()!.firstName }} {{ profile()!.lastName }}</span>
            }
            <span class="member-since">Dabei seit {{ formatDate(profile()!.createdAt) }}</span>
          </div>
          <button mat-icon-button class="close-btn" (click)="dialogRef.close()">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="profile-stats">
          <div class="stat">
            <span class="stat-value">{{ profile()!.stats.soundCount }}</span>
            <span class="stat-label">Sounds</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ profile()!.stats.totalPlays }}</span>
            <span class="stat-label">Plays</span>
          </div>
          <div class="stat credits-stat">
            <span class="stat-value credits-value">
              <img src="icons/nervbox-coin.svg" alt="" class="profile-coin">
              {{ formatCredits(profile()!.credits) }}
            </span>
            <span class="stat-label">Shekel</span>
          </div>
        </div>

        @if (profile()!.sounds.length > 0) {
          <div class="sounds-section">
            <h3>
              <mat-icon>music_note</mat-icon>
              Eigene Sounds
            </h3>
            <div class="sounds-list nervbox-scrollbar">
              @for (sound of profile()!.sounds; track sound.hash) {
                <div class="sound-item">
                  <mat-icon class="sound-icon">audiotrack</mat-icon>
                  <span class="sound-name">{{ sound.name }}</span>
                  <span class="sound-duration monospace">{{ sound.durationMs | duration }}</span>
                  <span class="sound-plays monospace" matTooltip="Abgespielt">{{ sound.playCount }}x</span>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="no-sounds">
            <mat-icon>music_off</mat-icon>
            <span>Noch keine eigenen Sounds</span>
          </div>
        }

        <div class="achievements-section">
          <app-achievement-display [userId]="data.userId" />
        </div>
      }
    </div>
  `,
  styles: `
    .profile-dialog {
      min-width: 500px;
      max-width: 600px;
    }

    .loading-container,
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 48px 24px;
      color: rgba(255, 255, 255, 0.6);
    }

    .error-container mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ef4444;
    }

    .profile-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 24px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      position: relative;
    }

    .profile-avatar {
      flex-shrink: 0;
    }

    .profile-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .username {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
    }

    .fullname {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
    }

    .member-since {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 4px;
    }

    .close-btn {
      position: absolute;
      top: 12px;
      right: 12px;
      opacity: 0.5;
    }

    .close-btn:hover {
      opacity: 1;
    }

    .profile-stats {
      display: flex;
      justify-content: center;
      gap: 48px;
      padding: 20px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: #9333ea;
    }

    .stat-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .credits-stat .credits-value {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #fbbf24;
      text-shadow: 0 0 10px rgba(251, 191, 36, 0.4);
    }

    .profile-coin {
      width: 28px;
      height: 28px;
    }

    .sounds-section {
      padding: 16px 24px 24px;
    }

    .sounds-section h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
    }

    .sounds-section h3 mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #9333ea;
    }

    .sounds-list {
      max-height: 200px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sound-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      transition: background 0.15s ease;
    }

    .sound-item:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .sound-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: rgba(147, 51, 234, 0.6);
      flex-shrink: 0;
    }

    .sound-name {
      flex: 1;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.85);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sound-duration {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.35);
      flex-shrink: 0;
    }

    .sound-plays {
      font-size: 11px;
      color: rgba(236, 72, 153, 0.6);
      flex-shrink: 0;
    }

    .no-sounds {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 32px 24px;
      color: rgba(255, 255, 255, 0.4);
    }

    .no-sounds mat-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
    }

    .monospace {
      font-family: 'JetBrains Mono', monospace;
    }

    .achievements-section {
      padding: 16px 24px 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
  `,
})
export class UserProfileDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<UserProfileDialogComponent>);
  readonly data = inject<{ userId: number }>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly profile = signal<UserProfile | null>(null);

  ngOnInit(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.error.set(false);

    this.api.get<UserProfile>(`/users/${this.data.userId}/profile`).subscribe({
      next: profile => {
        this.profile.set(profile);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      month: 'long',
      year: 'numeric',
    });
  }

  formatCredits(credits: number): string {
    if (credits >= 999999999) {
      return '∞';
    }
    return credits.toLocaleString('de-DE');
  }
}
