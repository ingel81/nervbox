import {
  Component,
  inject,
  signal,
  output,
  OnInit,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
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
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="gp" role="dialog" aria-label="GIF suchen" (click)="$event.stopPropagation()">
      <div class="gp-head">
        <label class="nk-input gp-search">
          <svg class="nk-input__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input #searchInput class="nk-input__field" type="text" [(ngModel)]="searchQuery" (ngModelChange)="onSearchChange($event)" placeholder="GIFs suchen..." autocomplete="off" aria-label="GIFs suchen" />
          @if (searchQuery) {
            <button type="button" class="nk-input__clear" aria-label="Suche leeren" (click)="clearSearch()">✕</button>
          }
        </label>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="GIF-Suche schließen" (click)="close.emit()">✕</button>
      </div>
      <div class="gp-grid" #gifGrid (scroll)="onScroll($event)">
        @if (loading() && gifs().length === 0) {
          <div class="gp-state"><span class="nk-spin" aria-hidden="true"></span>lädt …</div>
        } @else if (error()) {
          <div class="gp-state gp-state--err">{{ error() }}</div>
        } @else if (gifs().length === 0) {
          <div class="gp-state">{{ searchQuery ? 'Keine GIFs gefunden' : 'Suche nach GIFs...' }}</div>
        } @else {
          @for (gif of gifs(); track gif.id) {
            <button type="button" class="gp-item" [attr.aria-label]="gif.title || 'GIF'" (click)="selectGif(gif)">
              <img [src]="gif.images.fixed_height_small.url" [alt]="gif.title" loading="lazy" />
            </button>
          }
          @if (loading()) {
            <div class="gp-state gp-more"><span class="nk-spin" aria-hidden="true"></span></div>
          }
        }
      </div>
      <div class="gp-foot">
        <img src="https://giphy.com/static/img/giphy_logo_square_social.png" alt="Powered by GIPHY" class="gp-logo" />
        <span class="nk-label">Powered by GIPHY</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .gp {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      border-radius: 8px;
      background: var(--nk-face-glare), var(--nk-face-glass);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(var(--nk-lamp-rgb) / 0.35), var(--nk-shadow-float);
    }
    .gp-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 3px;
    }
    .gp-search {
      flex: 1;
      min-width: 0;
      height: 36px;
    }
    .gp-grid {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: 90px;
      gap: 6px;
      align-content: start;
    }
    .gp-item {
      padding: 0;
      border: 0;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      background: #0d0c0a;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.7);
    }
    .gp-item:hover,
    .gp-item:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--nk-iv), 0 0 10px rgb(var(--nk-lamp-rgb) / 0.5);
    }
    .gp-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .gp-state {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 24px 6px;
      color: var(--nk-iv-2);
      font: 500 12px var(--nk-font-mono);
    }
    .gp-state--err {
      color: var(--nk-danger-text);
    }
    .gp-more {
      padding: 8px;
    }
    .gp-foot {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
    }
    .gp-logo {
      width: 16px;
      height: 16px;
      opacity: 0.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe((query) => {
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
      .get<GiphyResponse>(
        `/giphy/search?q=${encodeURIComponent(query)}&limit=20&offset=${this.offset}`,
      )
      .subscribe({
        next: (response) => {
          this.gifs.update((current) => [...current, ...response.data]);
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
      next: (response) => {
        this.gifs.update((current) => [...current, ...response.data]);
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
