import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg pf">
      @if (loading()) {
        <div class="pf-state"><span class="nk-spin" aria-hidden="true"></span>Profil wird geladen …</div>
      } @else if (error()) {
        <div class="pf-state pf-state--col">
          <span>Profil konnte nicht geladen werden</span>
          <button type="button" class="nk-key" (click)="dialogRef.close()">Schließen</button>
        </div>
      } @else if (profile(); as p) {
        <header class="nk-dialog__head pf-head">
          <app-user-avatar class="pf-avatar" [userId]="data.userId" size="large" [clickable]="false" />
          <div class="pf-who">
            <h2 class="nk-dialog__title pf-name">{{ p.username }}</h2>
            @if (p.firstName || p.lastName) {
              <span class="pf-full">{{ p.firstName }} {{ p.lastName }}</span>
            }
            <span class="pf-since">Dabei seit {{ formatDate(p.createdAt) }}</span>
          </div>
          <button type="button" class="nk-key nk-key--sm nk-key--icon pf-close" aria-label="Profil schließen" (click)="dialogRef.close()">✕</button>
        </header>
        <div class="nk-dialog__body pf-body">
          <div class="pf-left">
            <div class="pf-stats">
              <div class="pf-stat"><b>{{ p.stats.soundCount }}</b><span>Sounds</span></div>
              <div class="pf-stat"><b>{{ p.stats.totalPlays }}</b><span>Plays</span></div>
              <div class="pf-stat"><b>{{ formatCredits(p.credits) }}</b><span>Shekel</span></div>
            </div>
            <div class="nk-section">
              <h3 class="nk-section__title">Eigene Sounds</h3>
              @if (p.sounds.length > 0) {
                <div class="nk-well pf-sounds">
                  @for (sound of p.sounds; track sound.hash) {
                    <div class="nk-row pf-row">
                      <mat-icon class="pf-note" aria-hidden="true">audiotrack</mat-icon>
                      <span class="nk-row__main"><span class="nk-row__title pf-sound">{{ sound.name }}</span></span>
                      <span class="nk-row__meta">{{ sound.durationMs | duration }}</span>
                      <span class="nk-row__meta pf-plays" matTooltip="Abgespielt">{{ sound.playCount }}x</span>
                    </div>
                  }
                </div>
              } @else {
                <span class="pf-none">Noch keine eigenen Sounds</span>
              }
            </div>
          </div>
          <app-achievement-display class="pf-ach" [userId]="data.userId" />
        </div>
      }
    </div>
  `,
  styles: `
    .pf {
      width: 1180px;
      max-width: 100%;
      max-height: 90vh;
    }
    .pf-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 30px 24px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .pf-state--col {
      flex-direction: column;
      align-items: flex-start;
    }
    .pf-head {
      min-height: 92px;
      gap: 16px;
      padding-left: 22px;
    }
    .pf-avatar {
      flex-shrink: 0;
      border-radius: 50%;
      box-shadow: var(--nk-shadow-ring);
      transform: scale(1.3);
      margin: 0 8px;
    }
    .pf-who {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pf-name {
      font-size: 30px;
      letter-spacing: 1.5px;
      text-transform: none;
    }
    .pf-full {
      font: 600 16px var(--nk-font-ui);
    }
    .pf-since {
      font: 500 11.5px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .pf-close {
      align-self: flex-start;
    }
    .pf-body {
      flex-direction: row;
      gap: 20px;
      overflow-y: auto;
    }
    .pf-left {
      width: 330px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .pf-stats {
      display: flex;
      gap: 14px;
      padding: 4px;
    }
    .pf-stat {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 4px 6px;
      border-radius: 6px;
      color: var(--nk-lcd-ink);
      background: var(--nk-face-lcd);
      box-shadow: inset 0 0 6px rgb(46 62 14 / 0.45), 0 0 0 3px #0b0a08, 1.5px 1.5px 0 3px rgb(255 226 176 / 0.18), 0 0 14px 3px rgb(196 220 112 / 0.2);
    }
    .pf-stat b {
      font: 400 32px/28px var(--nk-font-lcd);
      letter-spacing: 1px;
      white-space: nowrap;
    }
    .pf-stat span {
      font: 600 10px var(--nk-font-mono);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .pf-sounds {
      max-height: 46vh;
      overflow-y: auto;
    }
    .pf-row {
      min-height: 36px;
    }
    .pf-note {
      width: 15px;
      height: 15px;
      font-size: 15px;
    }
    .pf-sound {
      font-size: 15px;
    }
    .pf-plays {
      width: 44px;
      text-align: right;
    }
    .pf-none {
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .pf-ach {
      flex: 1;
      min-width: 0;
    }
    @media (max-width: 900px) {
      .pf-body {
        flex-direction: column;
      }
      .pf-left {
        width: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      next: (profile) => {
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
