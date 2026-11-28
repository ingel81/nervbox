import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
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
import type { SoundEditDialogData } from './components/admin/sound-edit-dialog.component';
import type { DeleteSoundDialogData } from './components/admin/delete-sound-dialog.component';
import { ChatSidebarComponent } from './components/chat/chat-sidebar.component';
import { SoundUploadDialogComponent } from './components/sound-upload-dialog/sound-upload-dialog.component';
import { AchievementToastComponent } from './components/shared/achievement-toast/achievement-toast.component';
import { ChannelStripComponent } from './components/channels/channel-strip.component';
import {
  MobileBarComponent,
  MobileAction,
  MobileView,
} from './components/mobile/mobile-bar.component';
import { NowPlayingService } from './core/services/now-playing.service';
import { SoundService } from './core/services/sound.service';
import { LoudnessService } from './core/services/loudness.service';
import { AuthService } from './core/services/auth.service';
import { SignalRService } from './core/services/signalr.service';
import { SelectionService } from './core/services/selection.service';
import { WelcomeTourService } from './core/services/welcome-tour.service';
import { FavoritesService } from './core/services/favorites.service';
import { VoteService } from './core/services/vote.service';
import { AvatarService } from './core/services/avatar.service';
import { AchievementService } from './core/services/achievement.service';
import { ConfigService } from './core/services/config.service';
import { HotkeyService } from './core/services/hotkey.service';
import { Sound } from './core/models';

@Component({
  selector: 'app-root',
  host: { '(document:keydown)': 'onHotkey($event)' },
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    ToolbarComponent,
    SoundGridComponent,
    TagFilterComponent,
    ChatSidebarComponent,
    AchievementToastComponent,
    ChannelStripComponent,
    MobileBarComponent,
  ],
  template: `
    <!-- Dev Routes (fullscreen) -->
    @if (isDevRoute()) {
      <router-outlet />
    } @else {
      <div class="nk-desk app-desk">
        <div class="nk-device app-device">
          <span class="nk-lamp nk-lamp--top" aria-hidden="true"></span>
          <span class="nk-lamp nk-lamp--left" aria-hidden="true"></span>
          <span class="nk-screw nk-screw--tl" aria-hidden="true"></span>
          <span class="nk-screw nk-screw--tr" aria-hidden="true"></span>
          <span class="nk-screw nk-screw--bl" aria-hidden="true"></span>
          <span class="nk-screw nk-screw--br" aria-hidden="true"></span>

          <app-toolbar
            [currentSort]="currentSort()"
            [selectionMode]="selectionService.selectionMode()"
            [selectionCount]="selectionService.selectionCount()"
            [showFavoritesOnly]="showFavoritesOnly()"
            [chatOpen]="showChat()"
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
            (uploadClick)="onUploadClick()"
            (profileClick)="onProfileClick()"
            (restartTourClick)="welcomeTour.restartTour()"
            (selectionModeToggle)="selectionService.toggleSelectionMode()"
            (openSelectionInMixer)="selectionService.openInMixer()"
            (clearSelection)="selectionService.clearSelection()"
            (randomClick)="onPlayRandom()"
          />

          @if (soundService.sounds().length > 0) {
            <app-tag-filter
              [tags]="allTags()"
              [tagColors]="soundService.tagColorMap()"
              [pinnedTags]="soundService.pinnedTagNames()"
              [tagCounts]="tagCounts()"
              [soundCount]="soundService.sounds().length"
              (selectedTagsChange)="onTagsChange($event)"
            />
          }

          <div class="app-body" [class.app-body--chat]="isMobile() && mobileView() === 'chat'">
            <main class="app-main">
              @if (soundService.loading()) {
                <div class="nk-plate app-state">
                  <div class="nk-watermark" aria-hidden="true">CABD</div>
                  <div class="nk-empty app-state__box" role="status">
                    <span class="nk-led nk-led--lamp nk-led--blink" aria-hidden="true"></span>
                    <span class="nk-empty__title">Sounds werden geladen …</span>
                  </div>
                </div>
              } @else if (soundService.error()) {
                <div class="nk-plate app-state">
                  <div class="nk-watermark" aria-hidden="true">CABD</div>
                  <div class="nk-empty app-state__box" role="alert">
                    <span class="nk-led nk-led--danger nk-led--blink" aria-hidden="true"></span>
                    <span class="nk-empty__title">{{ soundService.error() }}</span>
                    <button type="button" class="nk-key" (click)="loadSounds()">
                      Erneut versuchen
                    </button>
                  </div>
                </div>
              } @else {
                <app-sound-grid
                  [sounds]="sortedSounds()"
                  [searchQuery]="searchQuery()"
                  [selectedTags]="selectedTags()"
                  [tagColors]="soundService.tagColorMap()"
                  [selectionMode]="selectionService.selectionMode()"
                  [selectedHashes]="selectionService.selectedSounds()"
                  [showFeatured]="showFeatured()"
                  (playSound)="onPlaySound($event)"
                  (editSound)="onEditSound($event)"
                  (toggleSound)="onToggleSound($event)"
                  (deleteSound)="onDeleteSound($event)"
                  (selectionToggle)="selectionService.toggleSelection($event.hash)"
                />
              }
            </main>

            @if (showChat() && !isMobile()) {
              <div
                class="app-grip"
                role="separator"
                aria-orientation="vertical"
                aria-label="Chatbreite ändern"
                (mousedown)="startResize($event)"
                (touchstart)="startResizeTouch($event)"
              >
                <span class="app-grip__handle" aria-hidden="true"></span>
              </div>
              <app-chat-sidebar class="app-chat" [style.width.px]="chatWidth()" />
            }
            @if (isMobile() && mobileView() === 'chat') {
              <app-chat-sidebar class="app-chat-mobile" />
            }
          </div>

          @if (isMobile()) {
            <app-mobile-bar
              [view]="mobileView()"
              (viewChange)="mobileView.set($event)"
              (action)="onMobileAction($event)"
              (again)="onPlayAgain()"
            />
          } @else {
            <app-channel-strip class="app-strip" (again)="onPlayAgain()" (killAll)="onKillAll()" />
          }
        </div>
      </div>

      <app-achievement-toast />
    }
  `,
  styles: `
    .app-desk {
      height: 100vh;
      height: 100dvh;
      box-sizing: border-box;
    }

    .app-device {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .app-body {
      flex: 1;
      min-height: 0;
      display: flex;
      gap: 0;
    }

    .app-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .app-state {
      flex: 1;
      min-height: 0;
    }

    .app-state__box {
      position: absolute;
      left: 28px;
      top: 24px;
      z-index: 2;
    }

    .app-grip {
      width: 12px;
      flex-shrink: 0;
      cursor: col-resize;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .app-grip__handle {
      width: 3px;
      height: 54px;
      border-radius: 2px;
      background: repeating-linear-gradient(
        180deg,
        rgb(0 0 0 / 0.55) 0 2px,
        rgb(var(--nk-lamp-rgb) / 0.16) 2px 3px,
        transparent 3px 5px
      );
    }

    .app-grip:hover .app-grip__handle {
      background: repeating-linear-gradient(
        180deg,
        rgb(0 0 0 / 0.6) 0 2px,
        rgb(var(--nk-lamp-rgb) / 0.5) 2px 3px,
        transparent 3px 5px
      );
    }

    .app-chat-mobile {
      flex: 1;
      min-width: 0;
    }

    @media (max-width: 768px) {
      .app-desk {
        padding: 0;
      }
      .app-device {
        border-radius: 0;
        padding: 10px 10px 8px;
        gap: 8px;
      }
      .app-body--chat .app-main {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class App implements OnInit {
  readonly soundService = inject(SoundService);
  private readonly loudness = inject(LoudnessService);
  readonly authService = inject(AuthService);
  readonly selectionService = inject(SelectionService);
  readonly welcomeTour = inject(WelcomeTourService);
  readonly favoritesService = inject(FavoritesService);
  readonly voteService = inject(VoteService);
  readonly avatarService = inject(AvatarService);
  readonly achievementService = inject(AchievementService);
  private readonly configService = inject(ConfigService);
  readonly nowPlaying = inject(NowPlayingService);
  private readonly signalR = inject(SignalRService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly hotkeys = inject(HotkeyService);

  readonly isDevRoute = signal(window.location.pathname.startsWith('/dev/'));

  readonly searchQuery = signal('');
  readonly selectedTags = signal<string[]>([]);
  readonly currentSort = signal<SortOption>('plays-desc');
  readonly showChat = signal(true); // Desktop: Chat defaultmäßig offen
  readonly chatWidth = signal(335); // Default chat width in px
  readonly showFavoritesOnly = signal(false);
  private isResizing = false;
  private readonly minChatWidth = 280;
  private readonly maxChatWidth = 600;
  private randomSeed = Math.random();

  /** Anzahl Sounds je Tag (Zähler an den Tag-Tasten) */
  readonly tagCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const s of this.soundService.sounds()) {
      for (const t of s.tags ?? []) counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  });

  /** Top-Sounds groß, solange „Meistgespielt“ ohne Filter angezeigt wird */
  readonly showFeatured = computed(
    () =>
      this.currentSort() === 'plays-desc' &&
      !this.searchQuery().trim() &&
      this.selectedTags().length === 0 &&
      !this.showFavoritesOnly(),
  );

  constructor() {
    // Auswahlmodus gibt es nur auf Desktop: beim Wechsel auf Mobilbreite ausschalten
    effect(() => {
      if (this.isMobile() && this.selectionService.selectionMode()) {
        this.selectionService.toggleSelectionMode();
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
      sounds = sounds.filter((s) => favorites.has(s.hash));
    }

    switch (sort) {
      case 'name-asc':
        return sounds.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sounds.sort((a, b) => b.name.localeCompare(a.name));
      case 'plays-desc':
        return sounds.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
      case 'newest':
        return sounds.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
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
    this.mobileQuery.addEventListener('change', (e) => this.isMobile.set(e.matches));
    // Load config first (playback mode etc.)
    this.configService.loadConfig().subscribe();

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
      error: (err) => {
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

  /**
   * Sound hotkeys 1–9 (digit row + numpad): plays the assigned sound like a pad click.
   * Ignored while typing, with modifiers, and while a dialog (incl. games) or menu is open.
   */
  onHotkey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const digit = HotkeyService.digitOf(event);
    if (digit === null || !this.authService.isLoggedIn() || this.isDevRoute()) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.isContentEditable ||
      target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    ) {
      return;
    }
    if (
      this.dialog.openDialogs.length > 0 ||
      document.querySelector('.mat-mdc-dialog-container, .mat-mdc-menu-panel')
    ) {
      return;
    }
    const hash = this.hotkeys.hashFor(digit);
    const sound = hash ? this.soundService.sounds().find((s) => s.hash === hash) : undefined;
    if (!sound?.enabled) return;
    event.preventDefault();
    this.onPlaySound(sound);
  }

  /** Schmaler Schirm: Taschen-Sampler-Layout mit unterer Tastenreihe */
  private readonly mobileQuery = window.matchMedia('(max-width: 768px)');
  readonly isMobile = signal(this.mobileQuery.matches);
  readonly mobileView = signal<MobileView>('sounds');

  onMobileAction(action: MobileAction): void {
    switch (action) {
      case 'stats':
        void this.onStatsClick();
        return;
      case 'selection':
        void this.selectionService.toggleSelectionMode();
        return;
      case 'mixer':
        this.achievementService.markMixerVisited().subscribe();
        window.location.href = '/mixer';
        return;
      case 'profile':
        void this.onProfileClick();
        return;
      case 'avatar':
        void this.onChangeAvatarClick();
        return;
      case 'upload':
        void this.onUploadClick();
        return;
      case 'password':
        void this.onChangePasswordClick();
        return;
      case 'tour':
        void this.welcomeTour.restartTour();
        return;
      case 'logout':
        void this.authService.logout();
        return;
      case 'login':
        void this.onLoginClick();
        return;
      case 'admin-users':
        void this.onAdminMenuAction('users');
        return;
      case 'admin-tags':
        void this.onAdminMenuAction('tags');
        return;
      case 'admin-wizard':
        void this.onAdminMenuAction('tag-wizard');
        return;
      case 'admin-credits':
        void this.onAdminMenuAction('credits');
        return;
      case 'admin-tts':
        void this.onAdminMenuAction('tts');
        return;
      case 'admin-loudness':
        this.loudness.configure(!this.loudness.enabled()).subscribe();
        return;
      case 'kill-all':
        void this.onKillAll();
        return;
    }
  }

  /** Zufall-Taste: spielt einen zufälligen aktiven Sound aus der aktuellen Ansicht */
  onPlayRandom(): void {
    const query = this.searchQuery().toLowerCase().trim();
    const tags = this.selectedTags();
    const pool = this.sortedSounds().filter(
      (s) =>
        s.enabled &&
        (!query ||
          s.name.toLowerCase().includes(query) ||
          s.fileName.toLowerCase().includes(query)) &&
        (tags.length === 0 || tags.some((t) => s.tags?.includes(t))),
    );
    if (!pool.length) return;
    this.onPlaySound(pool[Math.floor(Math.random() * pool.length)]);
  }

  /** Nochmal-Taste: letzten eigenen Sound erneut abspielen */
  onPlayAgain(): void {
    const hash = this.nowPlaying.lastOwnHash();
    const sound = hash ? this.soundService.sounds().find((s) => s.hash === hash) : undefined;
    if (sound) this.onPlaySound(sound);
  }

  onKillAll(): void {
    this.soundService.killAll().subscribe({
      next: () => {
        this.nowPlaying.clear();
        this.snackBar.open('Alle Sounds gestoppt', 'OK', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Fehler beim Stoppen', 'OK', { duration: 2000 });
      },
    });
  }

  onStatsClick(): void {
    this.dialog.open(StatsDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });
  }

  async onAdminMenuAction(
    action: 'users' | 'tags' | 'tag-wizard' | 'credits' | 'tts',
  ): Promise<void> {
    switch (action) {
      case 'tts': {
        const { TtsTestDialogComponent } =
          await import('./components/admin/tts-test-dialog.component');
        this.dialog.open(TtsTestDialogComponent, { maxWidth: '95vw', panelClass: 'dark-dialog' });
        break;
      }
      case 'users': {
        const { UserManagementDialogComponent } =
          await import('./components/admin/user-management-dialog.component');
        this.dialog.open(UserManagementDialogComponent, {
          maxWidth: '95vw',
          panelClass: 'dark-dialog',
        });
        break;
      }
      case 'tags': {
        const { TagManagerDialogComponent } =
          await import('./components/admin/tag-manager-dialog.component');
        this.dialog.open(TagManagerDialogComponent, {
          maxWidth: '95vw',
          panelClass: 'dark-dialog',
        });
        break;
      }
      case 'tag-wizard': {
        const { TagWizardDialogComponent } =
          await import('./components/admin/tag-wizard-dialog.component');
        const dialogRef = this.dialog.open(TagWizardDialogComponent, {
          maxWidth: '95vw',
          maxHeight: '90vh',
          panelClass: 'dark-dialog',
        });
        dialogRef.afterClosed().subscribe((result) => {
          if (result) {
            this.loadSounds();
            this.snackBar.open('Tags wurden aktualisiert', 'OK', { duration: 2000 });
          }
        });
        break;
      }
      case 'credits': {
        const { CreditSettingsDialogComponent } =
          await import('./components/admin/credit-settings-dialog.component');
        this.dialog.open(CreditSettingsDialogComponent, {
          maxWidth: '95vw',
          panelClass: 'dark-dialog',
        });
        break;
      }
    }
  }

  toggleChat(): void {
    this.showChat.update((v) => !v);
  }

  toggleFavoritesFilter(): void {
    this.showFavoritesOnly.update((v) => !v);
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
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
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
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
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
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackBar.open('Kennwort wurde geändert', 'OK', { duration: 3000 });
      }
    });
  }

  async onChangeAvatarClick(): Promise<void> {
    const { AvatarUploadDialogComponent } =
      await import('./components/avatar-upload-dialog/avatar-upload-dialog.component');
    const dialogRef = this.dialog.open(AvatarUploadDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.snackBar.open('Avatar wurde aktualisiert', 'OK', { duration: 3000 });
      }
    });
  }

  onUploadClick(): void {
    this.dialog.open(SoundUploadDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
    });
  }

  async onProfileClick(): Promise<void> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    const { UserProfileDialogComponent } =
      await import('./components/shared/user-profile-dialog/user-profile-dialog.component');

    this.dialog.open(UserProfileDialogComponent, {
      data: { userId },
      panelClass: 'dark-dialog',
      maxWidth: '95vw',
    });
  }

  // === Admin: Sound Management ===

  async onEditSound(sound: Sound): Promise<void> {
    const { SoundEditDialogComponent } =
      await import('./components/admin/sound-edit-dialog.component');
    const dialogRef = this.dialog.open(SoundEditDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
      data: {
        sound,
        availableTags: this.allTags(),
      } as SoundEditDialogData,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackBar.open(`"${result.name}" wurde aktualisiert`, 'OK', { duration: 2000 });
      }
    });
  }

  onToggleSound(sound: Sound): void {
    this.soundService.toggleSound(sound.hash).subscribe({
      next: (result) => {
        this.snackBar.open(
          result.enabled ? `"${sound.name}" aktiviert` : `"${sound.name}" deaktiviert`,
          'OK',
          { duration: 2000 },
        );
      },
      error: (err) => {
        this.snackBar.open(`Fehler: ${err.message || 'Unbekannter Fehler'}`, 'OK', {
          duration: 3000,
        });
      },
    });
  }

  async onDeleteSound(sound: Sound): Promise<void> {
    const { DeleteSoundDialogComponent } =
      await import('./components/admin/delete-sound-dialog.component');
    const dialogRef = this.dialog.open(DeleteSoundDialogComponent, {
      maxWidth: '95vw',
      panelClass: 'dark-dialog',
      data: { sound } as DeleteSoundDialogData,
    });

    dialogRef.afterClosed().subscribe((deleted) => {
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
