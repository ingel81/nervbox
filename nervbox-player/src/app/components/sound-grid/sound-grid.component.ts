import { Component, input, output, computed, signal, ChangeDetectionStrategy, ElementRef, viewChild, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Sound } from '../../core/models';
import { SoundCardComponent } from './sound-card.component';

@Component({
  selector: 'app-sound-grid',
  standalone: true,
  imports: [CommonModule, ScrollingModule, SoundCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (filteredSounds().length === 0) {
      <div class="no-sounds">
        <span class="no-sounds-icon">🔇</span>
        <p>Keine Sounds gefunden</p>
        @if (searchQuery() || selectedTags().length > 0) {
          <p class="hint">Versuche andere Suchbegriffe oder Filter</p>
        }
      </div>
    } @else {
      <div class="grid-wrapper">
        <cdk-virtual-scroll-viewport
          #viewport
          class="sound-grid-viewport nervbox-scrollbar"
          [itemSize]="rowHeight()"
        >
          <div
            *cdkVirtualFor="let row of rows(); trackBy: trackRow"
            class="sound-row"
            [style.grid-template-columns]="gridColumns()"
          >
            @for (sound of row; track sound.hash) {
              <app-sound-card
                [sound]="sound"
                [tagColors]="tagColors()"
                [selectionMode]="selectionMode()"
                [isSelected]="selectedHashes().includes(sound.hash)"
                (playClick)="playSound.emit($event)"
                (editClick)="editSound.emit($event)"
                (toggleClick)="toggleSound.emit($event)"
                (deleteClick)="deleteSound.emit($event)"
                (selectionToggle)="selectionToggle.emit($event)"
              />
            }
          </div>
        </cdk-virtual-scroll-viewport>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .grid-wrapper {
      flex: 1;
      min-height: 0;
      padding: 16px;
      padding-right: 6px; /* Weniger Abstand zum Chat */
    }

    .sound-grid-viewport {
      height: 100%;
      overflow-x: hidden !important;
    }

    .sound-row {
      display: grid;
      gap: 6px;
      margin-bottom: 6px;
      margin-right: 6px; /* Abstand zur Scrollbar */
      min-width: 0;
      box-sizing: border-box;
    }

    .no-sounds {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      color: rgba(255, 255, 255, 0.5);
    }

    .no-sounds-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .no-sounds p {
      margin: 4px 0;
      font-size: 16px;
    }

    .no-sounds .hint {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.3);
    }

    @media (max-width: 600px) {
      .sound-row {
        gap: 4px;
        margin-right: 8px;
      }

      .grid-wrapper {
        padding: 8px;
      }
    }
  `,
})
export class SoundGridComponent implements AfterViewInit, OnDestroy {
  private static readonly MIN_CARD_WIDTH = 280;
  private static readonly GAP = 6;
  private static readonly PADDING = 16;
  private static readonly ROW_HEIGHT = 70;

  readonly sounds = input<Sound[]>([]);
  readonly searchQuery = input<string>('');
  readonly selectedTags = input<string[]>([]);
  readonly tagColors = input<Record<string, string>>({});
  readonly selectionMode = input<boolean>(false);
  readonly selectedHashes = input<string[]>([]);

  readonly playSound = output<Sound>();
  readonly editSound = output<Sound>();
  readonly toggleSound = output<Sound>();
  readonly deleteSound = output<Sound>();
  readonly selectionToggle = output<Sound>();

  private readonly hostEl = inject(ElementRef);
  private readonly viewport = viewChild<ElementRef>('viewport');
  private readonly columnsCount = signal(4);
  private resizeObserver: ResizeObserver | null = null;

  readonly rowHeight = signal(SoundGridComponent.ROW_HEIGHT);

  // Grid columns: N columns that share space equally
  readonly gridColumns = computed(() => `repeat(${this.columnsCount()}, 1fr)`);

  readonly filteredSounds = computed(() => {
    let result = this.sounds();
    const query = this.searchQuery().toLowerCase().trim();
    const tags = this.selectedTags();

    // Filter by search query
    if (query) {
      result = result.filter(
        sound =>
          sound.name.toLowerCase().includes(query) ||
          sound.fileName.toLowerCase().includes(query) ||
          sound.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by selected tags
    if (tags.length > 0) {
      result = result.filter(sound =>
        tags.some(tag => sound.tags?.includes(tag))
      );
    }

    return result;
  });

  // Group sounds into rows for virtual scrolling
  readonly rows = computed(() => {
    const sounds = this.filteredSounds();
    const cols = this.columnsCount();
    const result: Sound[][] = [];

    for (let i = 0; i < sounds.length; i += cols) {
      result.push(sounds.slice(i, i + cols));
    }

    return result;
  });

  ngAfterViewInit(): void {
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private setupResizeObserver(): void {
    const el = this.hostEl.nativeElement;

    const calculateColumns = () => {
      const totalWidth = el.clientWidth;
      const availableWidth = totalWidth - (2 * SoundGridComponent.PADDING);

      // Calculate how many whole cards fit (considering gaps between them)
      // Formula: cols <= (availableWidth + gap) / (minWidth + gap)
      const cols = Math.max(1, Math.floor(
        (availableWidth + SoundGridComponent.GAP) /
        (SoundGridComponent.MIN_CARD_WIDTH + SoundGridComponent.GAP)
      ));

      this.columnsCount.set(cols);
    };

    // Initial calculation with slight delay to ensure layout is complete
    requestAnimationFrame(() => calculateColumns());

    this.resizeObserver = new ResizeObserver(() => calculateColumns());
    this.resizeObserver.observe(el);
  }

  trackRow(_index: number, row: Sound[]): string {
    return row.map(s => s.hash).join('-');
  }
}
