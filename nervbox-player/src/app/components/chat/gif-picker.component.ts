import {
  Component,
  inject,
  signal,
  output,
  OnInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: GiphyImage;
    fixed_height_small: GiphyImage;
    original: GiphyImage;
  };
}

interface GiphyResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

@Component({
  selector: 'app-gif-picker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="gif-picker" (click)="$event.stopPropagation()">
      <div class="picker-header">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input
            #searchInput
            type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="GIFs suchen..."
            autocomplete="off"
          />
          @if (searchQuery) {
            <button mat-icon-button (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
        <button mat-icon-button class="close-btn" (click)="close.emit()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="gif-grid" #gifGrid (scroll)="onScroll($event)">
        @if (loading() && gifs().length === 0) {
          <div class="loading">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        } @else if (error()) {
          <div class="error">
            <mat-icon>error</mat-icon>
            <span>{{ error() }}</span>
          </div>
        } @else if (gifs().length === 0) {
          <div class="empty">
            <mat-icon>gif_box</mat-icon>
            <span>{{ searchQuery ? 'Keine GIFs gefunden' : 'Suche nach GIFs...' }}</span>
          </div>
        } @else {
          @for (gif of gifs(); track gif.id) {
            <div class="gif-item" (click)="selectGif(gif)">
              <img
                [src]="gif.images.fixed_height_small.url"
                [alt]="gif.title"
                loading="lazy"
              />
            </div>
          }
          @if (loading()) {
            <div class="loading-more">
              <mat-spinner diameter="24"></mat-spinner>
            </div>
          }
        }
      </div>

      <div class="picker-footer">
        <img src="https://giphy.com/static/img/giphy_logo_square_social.png" alt="Powered by GIPHY" class="giphy-logo" />
      </div>
    </div>
  `,
  styles: `
    .gif-picker {
      position: absolute;
      inset: 0;
      background: #1a1b1f;
      display: flex;
      flex-direction: column;
      z-index: 100;
    }

    .picker-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .search-box {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 4px 12px;
    }

    .search-box mat-icon:first-child {
      color: rgba(255, 255, 255, 0.4);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .search-box input {
      flex: 1;
      background: none;
      border: none;
      color: white;
      font-size: 13px;
      outline: none;
    }

    .search-box input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .search-box button {
      width: 24px;
      height: 24px;
    }

    .search-box button mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: rgba(255, 255, 255, 0.5);
    }

    .close-btn mat-icon {
      color: rgba(255, 255, 255, 0.5);
    }

    .gif-grid {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 8px;
      align-content: flex-start;
    }

    .gif-item {
      cursor: pointer;
      border-radius: 6px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.05);
      width: calc(33.333% - 3px);
      height: 0;
      padding-bottom: calc(33.333% - 3px);
      position: relative;
    }

    .gif-item:hover {
      box-shadow: 0 0 0 2px #9333ea;
    }

    .gif-item img {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .loading, .empty, .error {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px;
      color: rgba(255, 255, 255, 0.4);
      font-size: 13px;
    }

    .loading-more {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 16px;
    }

    .error {
      color: #ef4444;
    }

    .error mat-icon, .empty mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .picker-footer {
      display: flex;
      justify-content: flex-end;
      padding: 4px 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .giphy-logo {
      height: 16px;
      opacity: 0.5;
    }
  `,
})
export class GifPickerComponent implements OnInit {
  private readonly api = inject(ApiService);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('gifGrid') gifGrid!: ElementRef<HTMLDivElement>;

  readonly gifSelected = output<string>();
  readonly close = output<void>();

  readonly gifs = signal<GiphyGif[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  searchQuery = '';
  private offset = 0;
  private hasMore = true;
  private readonly searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(query => {
        this.offset = 0;
        this.hasMore = true;
        this.gifs.set([]);
        if (query.trim()) {
          this.searchGifs(query);
        } else {
          this.loadTrending();
        }
      });

    // Load trending on init
    this.loadTrending();

    // Focus search input
    setTimeout(() => this.searchInput?.nativeElement?.focus(), 100);
  }

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchSubject.next('');
  }

  private searchGifs(query: string): void {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.api
      .get<GiphyResponse>(`/giphy/search?q=${encodeURIComponent(query)}&limit=20&offset=${this.offset}`)
      .subscribe({
        next: response => {
          this.gifs.update(current => [...current, ...response.data]);
          this.hasMore = response.data.length === 20;
          this.loading.set(false);
        },
        error: () => {
          this.error.set('GIF-Suche fehlgeschlagen');
          this.loading.set(false);
        },
      });
  }

  private loadTrending(): void {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.api.get<GiphyResponse>(`/giphy/trending?limit=20&offset=${this.offset}`).subscribe({
      next: response => {
        this.gifs.update(current => [...current, ...response.data]);
        this.hasMore = response.data.length === 20;
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Trending GIFs konnten nicht geladen werden');
        this.loading.set(false);
      },
    });
  }

  onScroll(event: Event): void {
    if (!this.hasMore || this.loading()) return;

    const el = event.target as HTMLElement;
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (scrollBottom < 100) {
      this.offset += 20;
      if (this.searchQuery.trim()) {
        this.searchGifs(this.searchQuery);
      } else {
        this.loadTrending();
      }
    }
  }

  selectGif(gif: GiphyGif): void {
    // Use the fixed_height URL for display
    this.gifSelected.emit(gif.images.fixed_height.url);
  }
}
