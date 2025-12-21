import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ToolbarComponent, SortOption } from './components/toolbar/toolbar.component';
import { SoundGridComponent } from './components/sound-grid/sound-grid.component';
import { TagFilterComponent } from './components/tag-filter/tag-filter.component';
import { LoginDialogComponent } from './components/auth/login-dialog.component';
import { RegisterDialogComponent } from './components/auth/register-dialog.component';
import { ChangePasswordDialogComponent } from './components/auth/change-password-dialog.component';
import { StatsDialogComponent } from './components/stats/stats-dialog.component';
import { SoundEditDialogComponent, SoundEditDialogData } from './components/admin/sound-edit-dialog.component';
import { DeleteSoundDialogComponent, DeleteSoundDialogData } from './components/admin/delete-sound-dialog.component';
import { TagManagerDialogComponent } from './components/admin/tag-manager-dialog.component';
import { TagWizardDialogComponent } from './components/admin/tag-wizard-dialog.component';
import { UserManagementDialogComponent } from './components/admin/user-management-dialog.component';
import { CreditSettingsDialogComponent } from './components/admin/credit-settings-dialog.component';
import { ChatSidebarComponent } from './components/chat/chat-sidebar.component';
import { EarnCoinsFabComponent } from './components/mini-games/earn-coins-fab.component';
import { AvatarUploadDialogComponent } from './components/avatar-upload-dialog/avatar-upload-dialog.component';
import { AchievementToastComponent } from './components/shared/achievement-toast/achievement-toast.component';
import { SoundService } from './core/services/sound.service';
import { AuthService } from './core/services/auth.service';
import { SignalRService } from './core/services/signalr.service';
import { SelectionService } from './core/services/selection.service';
import { WelcomeTourService } from './core/services/welcome-tour.service';
import { FavoritesService } from './core/services/favorites.service';
import { VoteService } from './core/services/vote.service';
import { AvatarService } from './core/services/avatar.service';
import { AchievementService } from './core/services/achievement.service';
import { Sound } from './core/models';

interface Activity {
  id: number;
  user: string;
  sound: string;
  timestamp: Date;
  fading: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    ToolbarComponent,
    SoundGridComponent,
    TagFilterComponent,
    ChatSidebarComponent,
    EarnCoinsFabComponent,
    AchievementToastComponent,
  ],
  template: `
    <div class="app-container">
      <!-- Toolbar -->
      <app-toolbar
        [currentSort]="currentSort()"
        [selectionMode]="selectionService.selectionMode()"
        [selectionCount]="selectionService.selectionCount()"
        [showFavoritesOnly]="showFavoritesOnly()"
        (searchChange)="onSearchChange($event)"
        (sortChange)="onSortChange($event)"
        (favoritesFilterToggle)="toggleFavoritesFilter()"
        (killAllClick)="onKillAll()"
        (adminMenuAction)="onAdminMenuAction($event)"
        (statsClick)="onStatsClick()"
        (chatClick)="toggleChat()"
        (loginClick)="onLoginClick()"
        (changePasswordClick)="onChangePasswordClick()"
        (changeAvatarClick)="onChangeAvatarClick()"
        (profileClick)="onProfileClick()"
        (restartTourClick)="welcomeTour.restartTour()"
        (selectionModeToggle)="selectionService.toggleSelectionMode()"
        (openSelectionInMixer)="selectionService.openInMixer()"
        (clearSelection)="selectionService.clearSelection()"
      />

      <!-- Main Layout -->
      <div class="main-layout">
        <!-- Main Content -->
        <main class="main-content">
          <!-- Tag Filter -->
          @if (soundService.sounds().length > 0) {
            <app-tag-filter
              [tags]="allTags()"
              [tagColors]="soundService.tagColorMap()"
              [pinnedTags]="soundService.pinnedTagNames()"
              (selectedTagsChange)="onTagsChange($event)"
            />
          }

          <!-- Sound Grid -->
          @if (soundService.loading()) {
            <div class="loading-container">
              <mat-spinner diameter="48"></mat-spinner>
              <p>Sounds werden geladen...</p>
            </div>
          } @else if (soundService.error()) {
            <div class="error-container">
              <span class="error-icon">!</span>
              <p>{{ soundService.error() }}</p>
              <button class="retry-btn" (click)="loadSounds()">
                Erneut versuchen
              </button>
            </div>
          } @else {
            <app-sound-grid
              [sounds]="sortedSounds()"
              [searchQuery]="searchQuery()"
              [selectedTags]="selectedTags()"
              [tagColors]="soundService.tagColorMap()"
              [selectionMode]="selectionService.selectionMode()"
              [selectedHashes]="selectionService.selectedSounds()"
              (playSound)="onPlaySound($event)"
              (editSound)="onEditSound($event)"
              (toggleSound)="onToggleSound($event)"
              (deleteSound)="onDeleteSound($event)"
              (selectionToggle)="selectionService.toggleSelection($event.hash)"
            />
          }
        </main>

        <!-- Resizable Divider -->
        @if (showChat()) {
          <div
            class="resize-divider"
            (mousedown)="startResize($event)"
            (touchstart)="startResizeTouch($event)"
          >
            <div class="divider-handle"></div>
          </div>
        }

        <!-- Chat Sidebar (Desktop) -->
        @if (showChat()) {
          <app-chat-sidebar [style.width.px]="chatWidth()" />
        }
      </div>

      <!-- Mini-Games FAB (Admin only) -->
      <app-earn-coins-fab />

      <!-- Achievement Toast -->
      <app-achievement-toast />

      <!-- Activity Bar -->
      @if (recentActivity().length > 0) {
        <div class="activity-bar">
          @for (activity of recentActivity(); track activity.id) {
            <div class="activity-item" [class.fading]="activity.fading">
              <span class="activity-icon">▶</span>
              <span class="activity-user">{{ activity.user }}</span>
              <span class="activity-text">spielt</span>
              <span class="activity-sound">{{ activity.sound }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #0a0a0a;
    }

    .main-layout {
      flex: 1;
      display: flex;
      margin-top: 56px;
      min-height: 0;
    }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      min-height: 0;
    }

    .loading-container,
    .error-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: rgba(255, 255, 255, 0.7);
    }

    .loading-container p,
    .error-container p {
      font-size: 14px;
    }

    .error-icon {
      font-size: 48px;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(239, 68, 68, 0.2);
      border: 2px solid rgba(239, 68, 68, 0.5);
      border-radius: 50%;
      color: #ef4444;
    }

    .retry-btn {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      color: white;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .retry-btn:hover {
      box-shadow: 0 0 20px rgba(147, 51, 234, 0.5);
      transform: translateY(-2px);
    }

    .activity-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(10, 10, 10, 0.95);
      border-top: 2px solid rgba(147, 51, 234, 0.5);
      box-shadow: 0 -4px 20px rgba(147, 51, 234, 0.3);
      padding: 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 120px;
      overflow-y: auto;
    }

    .activity-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: linear-gradient(90deg, rgba(147, 51, 234, 0.15) 0%, rgba(236, 72, 153, 0.1) 100%);
      border-radius: 6px;
      border-left: 3px solid #9333ea;
      font-size: 13px;
      animation: slideIn 0.3s ease;
      transition: opacity 0.5s ease;
    }

    .activity-item.fading {
      opacity: 0.4;
    }

    @keyframes slideIn {
      from {
        transform: translateX(-20px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .activity-icon {
      color: #22c55e;
      font-size: 12px;
      animation: pulse 1s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .activity-user {
      color: #9333ea;
      font-weight: 600;
    }

    .activity-text {
      color: rgba(255, 255, 255, 0.6);
    }

    .activity-sound {
      color: #ec4899;
      font-weight: 500;
    }

    ::ng-deep .mat-mdc-progress-spinner circle {
      stroke: #9333ea !important;
    }

    /* Resize Divider */
    .resize-divider {
      width: 8px;
      background: rgba(147, 51, 234, 0.1);
      cursor: col-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
      flex-shrink: 0;
    }

    .resize-divider:hover {
      background: rgba(147, 51, 234, 0.3);
    }

    .resize-divider:active {
      background: rgba(147, 51, 234, 0.5);
    }

    .divider-handle {
      width: 4px;
      height: 40px;
      background: rgba(147, 51, 234, 0.5);
      border-radius: 2px;
      transition: all 0.2s ease;
    }

    .resize-divider:hover .divider-handle {
      background: #9333ea;
      height: 60px;
      box-shadow: 0 0 10px rgba(147, 51, 234, 0.5);
    }

    @media (max-width: 768px) {
      .resize-divider {
        display: none;
      }
    }

    :host ::ng-deep app-chat-sidebar {
      display: block;
    }

    @media (max-width: 768px) {
      :host ::ng-deep app-chat-sidebar {
        display: none;
      }
    }
  `,
})
export class App implements OnInit {
  readonly soundService = inject(SoundService);
  readonly authService = inject(AuthService);
  readonly selectionService = inject(SelectionService);
  readonly welcomeTour = inject(WelcomeTourService);
  readonly favoritesService = inject(FavoritesService);
  readonly voteService = inject(VoteService);
  readonly avatarService = inject(AvatarService);
  readonly achievementService = inject(AchievementService);
  private readonly signalR = inject(SignalRService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly searchQuery = signal('');
  readonly selectedTags = signal<string[]>([]);
  readonly recentActivity = signal<Activity[]>([]);
  readonly currentSort = signal<SortOption>('plays-desc');
  readonly showChat = signal(true); // Desktop: Chat defaultmäßig offen
  readonly chatWidth = signal(335); // Default chat width in px
  readonly showFavoritesOnly = signal(false);
  private activityCounter = 0;
  private isResizing = false;
  private readonly minChatWidth = 280;
  private readonly maxChatWidth = 600;
  private processedEventTimes = new Set<string>();
  private randomSeed = Math.random();

  constructor() {
    // React to sound events for activity bar
    effect(() => {
      const events = this.signalR.soundEvents();
      if (events.length > 0) {
        const latestEvent = events[0];
        // Check if we already processed this event
        if (!this.processedEventTimes.has(latestEvent.time)) {
          this.processedEventTimes.add(latestEvent.time);
          this.addActivity(latestEvent.initiator.name, latestEvent.fileName);

          // Cleanup old entries (keep last 50)
          if (this.processedEventTimes.size > 50) {
            const firstKey = this.processedEventTimes.values().next().value;
            if (firstKey) this.processedEventTimes.delete(firstKey);
          }
        }
      }
    });

    // Load favorites, votes, and avatar when user logs in
    effect(() => {
      if (this.authService.isLoggedIn()) {
        this.favoritesService.loadFavorites();
        this.voteService.loadUserVotes().subscribe();
        this.avatarService.getMyAvatarUrl().subscribe();
      } else {
        this.favoritesService.clearFavorites();
        this.voteService.clearUserVotes();
        this.avatarService.clearCache();
        this.showFavoritesOnly.set(false);
      }
    });
  }

  readonly sortedSounds = computed(() => {
    let sounds = [...this.soundService.sounds()];
    const sort = this.currentSort();

    // Apply favorites filter if active
    if (this.showFavoritesOnly()) {
      const favorites = this.favoritesService.favorites();
      sounds = sounds.filter(s => favorites.has(s.hash));
    }

    switch (sort) {
      case 'name-asc':
        return sounds.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sounds.sort((a, b) => b.name.localeCompare(a.name));
      case 'plays-desc':
        return sounds.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      case 'newest':
        return sounds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'duration-desc':
        return sounds.sort((a, b) => b.durationMs - a.durationMs);
      case 'duration-asc':
        return sounds.sort((a, b) => a.durationMs - b.durationMs);
      case 'votes-desc':
        return sounds.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      case 'votes-asc':
        return sounds.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      case 'random':
        // Seeded shuffle for stable random order
        return sounds.sort((a, b) => {
          const hashA = this.hashCode(a.hash + this.randomSeed);
          const hashB = this.hashCode(b.hash + this.randomSeed);
          return hashA - hashB;
        });
      default:
        return sounds;
    }
  });

  ngOnInit(): void {
    this.loadSounds();
    this.soundService.loadTags().subscribe();
    this.connectSignalR();
    this.initWelcomeTour();
  }

  private initWelcomeTour(): void {
    // Start user tour after sounds are loaded (small delay for DOM to be ready)
    // Admin tour is triggered automatically via effect when admin logs in
    if (this.welcomeTour.shouldShowUserTour()) {
      setTimeout(() => {
        if (this.soundService.sounds().length > 0) {
          this.welcomeTour.startUserTour();
        }
      }, 1500);
    }
  }

  private connectSignalR(): void {
    this.signalR.connectSound();
  }

  loadSounds(): void {
    this.soundService.loadSounds().subscribe();
  }

  allTags(): string[] {
    return this.soundService.getAllTags();
  }

  onSearchChange(query: string): void {
    this.searchQuery.set(query);
  }

  onTagsChange(tags: string[]): void {
    this.selectedTags.set(tags);
  }

  onSortChange(sort: SortOption): void {
    if (sort === 'random') {
      this.randomSeed = Math.random(); // New shuffle on each selection
    }
    this.currentSort.set(sort);
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  onPlaySound(sound: Sound): void {
    if (!this.authService.isLoggedIn()) {
      this.openLoginDialog(() => this.onPlaySound(sound));
      return;
    }

    this.soundService.playSound(sound.hash).subscribe({
      error: err => {
        if (err.status === 401) {
          this.authService.logout();
          this.openLoginDialog(() => this.onPlaySound(sound));
          return;
        }
        // Show error from backend (e.g., not enough credits)
        const errorMsg = err.error?.error || err.message || 'Unbekannter Fehler';
        this.snackBar.open(errorMsg, 'OK', { duration: 4000 });
      },
    });
  }

  private addActivity(user: string, sound: string): void {
    const id = ++this.activityCounter;
    const activity: Activity = {
      id,
      user,
      sound,
      timestamp: new Date(),
      fading: false,
    };

    // Add to beginning of list, keep max 5
    this.recentActivity.update(list => [activity, ...list].slice(0, 5));

    // Start fading after 4 seconds
    setTimeout(() => {
      this.recentActivity.update(list =>
        list.map(a => (a.id === id ? { ...a, fading: true } : a))
      );
    }, 4000);

    // Remove after 6 seconds
    setTimeout(() => {
      this.recentActivity.update(list => list.filter(a => a.id !== id));
    }, 6000);
  }

  onKillAll(): void {
    this.soundService.killAll().subscribe({
      next: () => {
        this.recentActivity.set([]);
        this.snackBar.open('Alle Sounds gestoppt', 'OK', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Fehler beim Stoppen', 'OK', { duration: 2000 });
      },
    });
  }

  onStatsClick(): void {
    this.dialog.open(StatsDialogComponent, {
      width: '600px',
      panelClass: 'dark-dialog',
    });
  }

  onAdminMenuAction(action: 'users' | 'tags' | 'tag-wizard' | 'credits'): void {
    switch (action) {
      case 'users':
        this.dialog.open(UserManagementDialogComponent, {
          width: '900px',
          maxWidth: '95vw',
          panelClass: 'dark-dialog',
        });
        break;
      case 'tags':
        this.dialog.open(TagManagerDialogComponent, {
          width: '500px',
          panelClass: 'dark-dialog',
        });
        break;
      case 'tag-wizard':
        const dialogRef = this.dialog.open(TagWizardDialogComponent, {
          width: '900px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          panelClass: 'dark-dialog',
        });
        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            this.loadSounds();
            this.snackBar.open('Tags wurden aktualisiert', 'OK', { duration: 2000 });
          }
        });
        break;
      case 'credits':
        this.dialog.open(CreditSettingsDialogComponent, {
          width: '550px',
          maxWidth: '95vw',
          panelClass: 'dark-dialog',
        });
        break;
    }
  }

  toggleChat(): void {
    this.showChat.update(v => !v);
  }

  toggleFavoritesFilter(): void {
    this.showFavoritesOnly.update(v => !v);
  }

  onLoginClick(): void {
    if (this.authService.isLoggedIn()) {
      this.authService.logout();
      this.snackBar.open('Abgemeldet', 'OK', { duration: 2000 });
      return;
    }
    this.openLoginDialog();
  }

  private openLoginDialog(onSuccess?: () => void): void {
    const dialogRef = this.dialog.open(LoginDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'register') {
        this.openRegisterDialog(onSuccess);
      } else if (result) {
        this.snackBar.open(`Willkommen, ${result.username}!`, 'OK', { duration: 2000 });
        if (onSuccess) {
          onSuccess();
        }
      }
    });
  }

  private openRegisterDialog(onSuccess?: () => void): void {
    const dialogRef = this.dialog.open(RegisterDialogComponent, {
      width: '440px',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open(`Willkommen, ${result.username}! Dein Account wurde erstellt.`, 'OK', {
          duration: 3000,
        });
        if (onSuccess) {
          onSuccess();
        }
      }
    });
  }

  onChangePasswordClick(): void {
    const dialogRef = this.dialog.open(ChangePasswordDialogComponent, {
      width: '400px',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Kennwort wurde geändert', 'OK', { duration: 3000 });
      }
    });
  }

  onChangeAvatarClick(): void {
    const dialogRef = this.dialog.open(AvatarUploadDialogComponent, {
      width: '500px',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.snackBar.open('Avatar wurde aktualisiert', 'OK', { duration: 3000 });
      }
    });
  }

  async onProfileClick(): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    const { UserProfileDialogComponent } = await import(
      './components/shared/user-profile-dialog/user-profile-dialog.component'
    );

    this.dialog.open(UserProfileDialogComponent, {
      data: { userId },
      panelClass: 'dark-dialog',
      maxWidth: '600px',
    });
  }

  // === Admin: Sound Management ===

  onEditSound(sound: Sound): void {
    const dialogRef = this.dialog.open(SoundEditDialogComponent, {
      width: '500px',
      panelClass: 'dark-dialog',
      data: {
        sound,
        availableTags: this.allTags(),
      } as SoundEditDialogData,
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open(`"${result.name}" wurde aktualisiert`, 'OK', { duration: 2000 });
      }
    });
  }

  onToggleSound(sound: Sound): void {
    this.soundService.toggleSound(sound.hash).subscribe({
      next: result => {
        this.snackBar.open(
          result.enabled ? `"${sound.name}" aktiviert` : `"${sound.name}" deaktiviert`,
          'OK',
          { duration: 2000 }
        );
      },
      error: err => {
        this.snackBar.open(`Fehler: ${err.message || 'Unbekannter Fehler'}`, 'OK', {
          duration: 3000,
        });
      },
    });
  }

  onDeleteSound(sound: Sound): void {
    const dialogRef = this.dialog.open(DeleteSoundDialogComponent, {
      width: '450px',
      panelClass: 'dark-dialog',
      data: { sound } as DeleteSoundDialogData,
    });

    dialogRef.afterClosed().subscribe(deleted => {
      if (deleted) {
        this.snackBar.open(`"${sound.name}" wurde gelöscht`, 'OK', { duration: 3000 });
      }
    });
  }

  // === Resize Logic ===

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      this.updateChatWidth(newWidth);
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  startResizeTouch(event: TouchEvent): void {
    event.preventDefault();
    this.isResizing = true;

    const onTouchMove = (e: TouchEvent) => {
      if (!this.isResizing || !e.touches[0]) return;
      const newWidth = window.innerWidth - e.touches[0].clientX;
      this.updateChatWidth(newWidth);
    };

    const onTouchEnd = () => {
      this.isResizing = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  }

  private updateChatWidth(width: number): void {
    const clampedWidth = Math.max(this.minChatWidth, Math.min(this.maxChatWidth, width));
    this.chatWidth.set(clampedWidth);
  }
}
