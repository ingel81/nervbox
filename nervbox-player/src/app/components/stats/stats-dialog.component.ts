import { Component, inject, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg">
      <header class="nk-dialog__head">
        <mat-icon class="st-ico" aria-hidden="true">leaderboard</mat-icon>
        <h2 class="nk-dialog__title">Statistiken</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" (click)="onClose()">✕</button>
      </header>
      <div class="nk-dialog__body">
        <div class="nk-tabs" role="tablist">
          @for (t of tabs; track t.key; let i = $index) {
            <button type="button" role="tab" [attr.aria-selected]="tab() === i" [class]="tab() === i ? 'nk-tabs__tab nk-tabs__tab--on' : 'nk-tabs__tab'" (click)="tab.set(i)">{{ t.label }}</button>
          }
        </div>
        @if (loading()) {
          <div class="st-state"><span class="nk-spin" aria-hidden="true"></span>lädt …</div>
        } @else if (rows().length === 0) {
          <div class="st-state">{{ tab() === 2 ? 'Noch keine Favoriten vorhanden' : 'Noch keine Daten vorhanden' }}</div>
        } @else {
          <div class="nk-well st-list">
            @for (r of rows(); track $index; let i = $index) {
              <div [class]="i < 3 ? 'nk-row nk-row--hl' : 'nk-row'">
                <span [class]="i < 3 ? 'nk-rank nk-rank--' + (i + 1) : 'nk-rank'">{{ i + 1 }}</span>
                <span class="nk-row__main"><span class="nk-row__title">{{ r.name }}</span></span>
                <span class="st-bar" aria-hidden="true">
                  @for (s of segs; track s) {
                    <span [class]="s < r.level ? (i === 0 ? 'st-seg st-seg--top' : 'st-seg st-seg--on') : 'st-seg'"></span>
                  }
                </span>
                <span class="nk-row__num st-count">{{ r.count }}×</span>
              </div>
            }
          </div>
        }
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key" (click)="onClose()">Schließen</button>
      </footer>
    </div>
  `,
  styles: `
    .nk-dlg {
      width: 520px;
      max-width: 100%;
    }
    .st-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .st-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 24px 6px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .st-list {
      max-height: 60vh;
      overflow-y: auto;
    }
    .st-bar {
      flex: 0 0 120px;
      height: 10px;
      display: flex;
      gap: 2px;
    }
    .st-seg {
      flex: 1;
      border-radius: 1px;
      background: rgb(0 0 0 / 0.45);
      box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.8);
    }
    .st-seg--on {
      background: var(--nk-iv);
      box-shadow: 0 0 5px rgb(var(--nk-lamp-rgb) / 0.8);
    }
    .st-seg--top {
      background: var(--nk-own);
      box-shadow: 0 0 6px rgb(var(--nk-own-rgb) / 0.9);
    }
    .st-count {
      width: 70px;
      text-align: right;
    }
    @media (max-width: 520px) {
      .st-bar {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class StatsDialogComponent implements OnInit {
  private readonly soundService = inject(SoundService);
  private readonly dialogRef = inject(MatDialogRef<StatsDialogComponent>);

  readonly topSounds = signal<TopSound[]>([]);
  readonly topUsers = signal<TopUser[]>([]);
  readonly topFavorites = signal<TopSound[]>([]);
  readonly loadingSounds = signal(true);
  readonly loadingUsers = signal(true);
  readonly loadingFavorites = signal(true);

  readonly tabs = [
    { key: 'sounds', label: 'Top Sounds' },
    { key: 'users', label: 'Top Users' },
    { key: 'favorites', label: 'Top Favoriten' },
  ];
  readonly tab = signal(0);
  /** 15 Segmente für die Pegel-Balken (Anzeige der vorhandenen Zahlen) */
  readonly segs = Array.from({ length: 15 }, (_, i) => i);

  readonly loading = computed(
    () => [this.loadingSounds(), this.loadingUsers(), this.loadingFavorites()][this.tab()],
  );

  readonly rows = computed(() => {
    const t = this.tab();
    const list: { name: string; count: number }[] =
      t === 0 ? this.topSounds() : t === 1 ? this.topUsers() : this.topFavorites();
    const max = Math.max(1, ...list.map(r => r.count));
    return list.map(r => ({ name: r.name, count: r.count, level: Math.max(1, Math.round((r.count / max) * 15)) }));
  });

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.soundService.getTopSounds().subscribe({
      next: (sounds) => {
        this.topSounds.set(sounds);
        this.loadingSounds.set(false);
      },
      error: () => {
        this.loadingSounds.set(false);
      },
    });

    this.soundService.getTopUsers().subscribe({
      next: (users) => {
        this.topUsers.set(users);
        this.loadingUsers.set(false);
      },
      error: () => {
        this.loadingUsers.set(false);
      },
    });

    this.soundService.getTopFavorites().subscribe({
      next: (favorites) => {
        this.topFavorites.set(favorites);
        this.loadingFavorites.set(false);
      },
      error: () => {
        this.loadingFavorites.set(false);
      },
    });
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
