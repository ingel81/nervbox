import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SoundService } from '../../core/services/sound.service';
import { TopSound, TopUser } from '../../core/models';

@Component({
  selector: 'app-stats-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="stats-dialog">
      <h2 mat-dialog-title>
        <mat-icon class="title-icon">leaderboard</mat-icon>
        Statistiken
      </h2>

      <mat-dialog-content>
        <mat-tab-group animationDuration="200ms">
          <!-- Top Sounds Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>music_note</mat-icon>
              <span>Top Sounds</span>
            </ng-template>

            @if (loadingSounds()) {
              <div class="loading">
                <mat-spinner diameter="32"></mat-spinner>
              </div>
            } @else if (topSounds().length === 0) {
              <div class="empty">Noch keine Daten vorhanden</div>
            } @else {
              <div class="stats-list">
                @for (sound of topSounds(); track sound.hash; let i = $index) {
                  <div class="stats-item" [class.top-three]="i < 3">
                    <span class="rank" [class.gold]="i === 0" [class.silver]="i === 1" [class.bronze]="i === 2">
                      {{ i + 1 }}
                    </span>
                    <span class="name">{{ sound.name }}</span>
                    <span class="count">{{ sound.count }}×</span>
                  </div>
                }
              </div>
            }
          </mat-tab>

          <!-- Top Users Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>people</mat-icon>
              <span>Top Users</span>
            </ng-template>

            @if (loadingUsers()) {
              <div class="loading">
                <mat-spinner diameter="32"></mat-spinner>
              </div>
            } @else if (topUsers().length === 0) {
              <div class="empty">Noch keine Daten vorhanden</div>
            } @else {
              <div class="stats-list">
                @for (user of topUsers(); track user.playedById; let i = $index) {
                  <div class="stats-item" [class.top-three]="i < 3">
                    <span class="rank" [class.gold]="i === 0" [class.silver]="i === 1" [class.bronze]="i === 2">
                      {{ i + 1 }}
                    </span>
                    <span class="name">{{ user.name }}</span>
                    <span class="count">{{ user.count }}×</span>
                  </div>
                }
              </div>
            }
          </mat-tab>
        </mat-tab-group>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="onClose()">Schließen</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    .stats-dialog {
      min-width: 400px;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%);
      border-bottom: 1px solid rgba(147, 51, 234, 0.3);
    }

    .title-icon {
      font-size: 28px !important;
      width: 28px !important;
      height: 28px !important;
      color: #9333ea;
    }

    mat-dialog-content {
      padding: 0 !important;
      min-height: 300px;
    }

    ::ng-deep .mat-mdc-tab-group {
      --mdc-tab-indicator-active-indicator-color: #9333ea;
      --mat-tab-header-active-focus-indicator-color: #9333ea;
      --mat-tab-header-active-hover-indicator-color: #9333ea;
    }

    ::ng-deep .mat-mdc-tab {
      --mdc-tab-label-text-color: rgba(255, 255, 255, 0.6);
      --mdc-tab-active-label-text-color: #ffffff;
    }

    ::ng-deep .mat-mdc-tab:not(.mdc-tab--active):hover {
      --mdc-tab-label-text-color: rgba(255, 255, 255, 0.8);
    }

    ::ng-deep .mat-mdc-tab .mdc-tab__text-label {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    ::ng-deep .mat-mdc-tab-header {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .loading, .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      color: rgba(255, 255, 255, 0.5);
    }

    .stats-list {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 350px;
      overflow-y: auto;
    }

    .stats-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.2s ease;
    }

    .stats-item:hover {
      background: rgba(147, 51, 234, 0.1);
      border-color: rgba(147, 51, 234, 0.2);
    }

    .stats-item.top-three {
      background: rgba(147, 51, 234, 0.1);
      border-color: rgba(147, 51, 234, 0.2);
    }

    .rank {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-weight: 700;
      font-size: 13px;
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.6);
    }

    .rank.gold {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: #000;
      box-shadow: 0 0 10px rgba(251, 191, 36, 0.4);
    }

    .rank.silver {
      background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%);
      color: #000;
      box-shadow: 0 0 10px rgba(209, 213, 219, 0.3);
    }

    .rank.bronze {
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      color: #fff;
      box-shadow: 0 0 10px rgba(217, 119, 6, 0.3);
    }

    .name {
      flex: 1;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 600;
      color: #ec4899;
      background: rgba(236, 72, 153, 0.1);
      padding: 4px 10px;
      border-radius: 12px;
    }

    mat-dialog-actions {
      padding: 12px 24px !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    mat-dialog-actions button {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    mat-dialog-actions button:hover {
      color: rgba(255, 255, 255, 0.9) !important;
    }
  `,
})
export class StatsDialogComponent implements OnInit {
  private readonly soundService = inject(SoundService);
  private readonly dialogRef = inject(MatDialogRef<StatsDialogComponent>);

  readonly topSounds = signal<TopSound[]>([]);
  readonly topUsers = signal<TopUser[]>([]);
  readonly loadingSounds = signal(true);
  readonly loadingUsers = signal(true);

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.soundService.getTopSounds().subscribe({
      next: sounds => {
        this.topSounds.set(sounds);
        this.loadingSounds.set(false);
      },
      error: () => {
        this.loadingSounds.set(false);
      },
    });

    this.soundService.getTopUsers().subscribe({
      next: users => {
        this.topUsers.set(users);
        this.loadingUsers.set(false);
      },
      error: () => {
        this.loadingUsers.set(false);
      },
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
