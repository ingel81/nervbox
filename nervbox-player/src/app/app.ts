import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { SoundGridComponent } from './components/sound-grid/sound-grid.component';
import { TagFilterComponent } from './components/tag-filter/tag-filter.component';
import { SoundService } from './core/services/sound.service';
import { Sound } from './core/models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    ToolbarComponent,
    SoundGridComponent,
    TagFilterComponent,
  ],
  template: `
    <div class="app-container">
      <!-- Toolbar -->
      <app-toolbar
        (searchChange)="onSearchChange($event)"
        (killAllClick)="onKillAll()"
        (statsClick)="onStatsClick()"
        (chatClick)="onChatClick()"
        (loginClick)="onLoginClick()"
      />

      <!-- Main Content -->
      <main class="main-content">
        <!-- Tag Filter -->
        @if (soundService.sounds().length > 0) {
          <app-tag-filter
            [tags]="allTags()"
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
            [sounds]="soundService.sounds()"
            [searchQuery]="searchQuery()"
            [selectedTags]="selectedTags()"
            (playSound)="onPlaySound($event)"
          />
        }
      </main>

      <!-- Now Playing Bar -->
      @if (lastPlayedSound()) {
        <div class="now-playing-bar">
          <span class="now-playing-icon">▶</span>
          <span class="now-playing-text">
            Spielt: <strong>{{ lastPlayedSound() }}</strong>
          </span>
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

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      margin-top: 56px;
      overflow: hidden;
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

    .now-playing-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(90deg, rgba(147, 51, 234, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%);
      border-top: 1px solid rgba(147, 51, 234, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
      animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .now-playing-icon {
      color: #f97316;
      animation: pulse 1s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .now-playing-text strong {
      color: #ec4899;
    }

    ::ng-deep .mat-mdc-progress-spinner circle {
      stroke: #9333ea !important;
    }
  `,
})
export class App implements OnInit {
  readonly soundService = inject(SoundService);
  private readonly snackBar = inject(MatSnackBar);

  readonly searchQuery = signal('');
  readonly selectedTags = signal<string[]>([]);
  readonly lastPlayedSound = signal<string | null>(null);

  ngOnInit(): void {
    this.loadSounds();
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

  onPlaySound(sound: Sound): void {
    this.soundService.playSound(sound.hash).subscribe({
      next: () => {
        this.lastPlayedSound.set(sound.name);
        setTimeout(() => {
          if (this.lastPlayedSound() === sound.name) {
            this.lastPlayedSound.set(null);
          }
        }, 5000);
      },
      error: err => {
        this.snackBar.open(
          `Fehler beim Abspielen: ${err.message || 'Unbekannter Fehler'}`,
          'OK',
          { duration: 3000 }
        );
      },
    });
  }

  onKillAll(): void {
    this.soundService.killAll().subscribe({
      next: () => {
        this.lastPlayedSound.set(null);
        this.snackBar.open('Alle Sounds gestoppt', 'OK', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Fehler beim Stoppen', 'OK', { duration: 2000 });
      },
    });
  }

  onStatsClick(): void {
    this.snackBar.open('Stats-Dialog kommt noch...', 'OK', { duration: 2000 });
  }

  onChatClick(): void {
    this.snackBar.open('Chat kommt noch...', 'OK', { duration: 2000 });
  }

  onLoginClick(): void {
    this.snackBar.open('Login-Dialog kommt noch...', 'OK', { duration: 2000 });
  }
}
