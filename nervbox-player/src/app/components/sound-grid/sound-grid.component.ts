import {
  Component,
  input,
  output,
  computed,
  signal,
  ChangeDetectionStrategy,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Sound } from '../../core/models';
import { NowPlayingService } from '../../core/services/now-playing.service';
import { SoundCardComponent } from './sound-card.component';

/**
 * Pad-Platte: versenkte Aluplatte mit Schrauben und dem großen, schwach hinterleuchteten
 * „CABD“ dahinter. Oben (bei „Meistgespielt“ ohne Filter) die Top-Sounds groß, darunter
 * alle Pads in gleich großen Reihen mit virtuellem Scrollen.
 */
@Component({
  selector: 'app-sound-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScrollingModule, SoundCardComponent],
  template: `
    <div class="nk-plate grid-plate">
      <span class="nk-screw nk-screw--sm nk-screw--tl" aria-hidden="true"></span>
      <span class="nk-screw nk-screw--sm nk-screw--tr" aria-hidden="true"></span>
      <span class="nk-screw nk-screw--sm nk-screw--bl" aria-hidden="true"></span>
      <span class="nk-screw nk-screw--sm nk-screw--br" aria-hidden="true"></span>
      <div
        [class]="fewResults() ? 'nk-watermark nk-watermark--hero' : 'nk-watermark'"
        aria-hidden="true"
      >
        CABD
      </div>

      @if (filteredSounds().length === 0) {
        <div class="nk-empty grid-empty" role="status">
          <span class="nk-empty__title">Keine Sounds gefunden</span>
          @if (searchQuery() || selectedTags().length > 0) {
            <span class="nk-empty__text">Versuche andere Suchbegriffe oder Filter</span>
          }
        </div>
      } @else {
        <div class="grid-scroll nervbox-scrollbar" cdkVirtualScrollingElement>
          @if (featured().length) {
            <div class="grid-featured" [style.height.px]="featuredHeight()">
              @for (sound of featured(); track sound.hash; let i = $index) {
                <app-sound-card
                  [class]="i < 2 ? 'feat-xl feat-' + i : 'feat-wide feat-' + i"
                  [sound]="sound"
                  [variant]="i < 2 ? 'xl' : 'wide'"
                  [rank]="i < 2 ? i + 1 : null"
                  [lampF]="i < 2 ? 1 - i * 0.12 : 0.7 - (i - 2) * 0.08"
                  [tagColors]="tagColors()"
                  [selectionMode]="selectionMode()"
                  [isSelected]="selectedHashes().includes(sound.hash)"
                  [playState]="padStates().get(sound.hash)"
                  (playClick)="playSound.emit($event)"
                  (editClick)="editSound.emit($event)"
                  (toggleClick)="toggleSound.emit($event)"
                  (deleteClick)="deleteSound.emit($event)"
                  (selectionToggle)="selectionToggle.emit($event)"
                />
              }
            </div>
          }
          <cdk-virtual-scroll-viewport
            class="grid-viewport"
            [itemSize]="rowHeight"
            [minBufferPx]="400"
            [maxBufferPx]="800"
          >
            <div
              *cdkVirtualFor="let row of rows(); let r = index; trackBy: trackRow"
              class="grid-row"
              [style.grid-template-columns]="gridColumns()"
              [style.height.px]="rowHeight"
            >
              @for (sound of row; track sound.hash; let c = $index) {
                <app-sound-card
                  [sound]="sound"
                  [lampF]="lampAt(c, r)"
                  [tagColors]="tagColors()"
                  [selectionMode]="selectionMode()"
                  [isSelected]="selectedHashes().includes(sound.hash)"
                  [playState]="padStates().get(sound.hash)"
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
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .grid-plate {
      flex: 1;
      min-height: 0;
      margin: 0 1px 2px;
    }

    .grid-scroll {
      position: absolute;
      inset: 0;
      z-index: 2;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 14px 10px 14px 16px;
    }

    .grid-featured {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin: 0 6px 14px 0;
    }

    .feat-0 {
      grid-column: 1;
      grid-row: 1 / span 2;
    }
    .feat-1 {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
    .feat-2 {
      grid-column: 3;
      grid-row: 1;
    }
    .feat-3 {
      grid-column: 4;
      grid-row: 1;
    }
    .feat-4 {
      grid-column: 3;
      grid-row: 2;
    }
    .feat-5 {
      grid-column: 4;
      grid-row: 2;
    }

    .grid-viewport {
      overflow: visible;
      contain: none;
    }

    .grid-row {
      display: grid;
      gap: 14px;
      padding: 4px 6px 10px 4px;
      box-sizing: border-box;
      min-width: 0;
    }

    .grid-empty {
      position: absolute;
      left: 28px;
      top: 24px;
      z-index: 2;
    }
  `,
})
export class SoundGridComponent implements AfterViewInit, OnDestroy {
  private static readonly MIN_PAD_WIDTH = 140;
  private static readonly GAP = 14;
  private static readonly PADDING = 36;
  /** Reihenhöhe inkl. Abstand (Pad 72px + 14px Fuge) */
  readonly rowHeight = 86;

  readonly sounds = input<Sound[]>([]);
  readonly searchQuery = input<string>('');
  readonly selectedTags = input<string[]>([]);
  readonly tagColors = input<Record<string, string>>({});
  readonly selectionMode = input<boolean>(false);
  readonly selectedHashes = input<string[]>([]);
  /** Top-Sounds groß zeigen (nur bei Sortierung „Meistgespielt“ ohne Filter) */
  readonly showFeatured = input<boolean>(false);

  readonly playSound = output<Sound>();
  readonly editSound = output<Sound>();
  readonly toggleSound = output<Sound>();
  readonly deleteSound = output<Sound>();
  readonly selectionToggle = output<Sound>();

  private readonly hostEl = inject(ElementRef);
  private readonly nowPlaying = inject(NowPlayingService);
  private readonly columnsCount = signal(6);
  private resizeObserver: ResizeObserver | null = null;

  readonly padStates = this.nowPlaying.padStates;
  readonly gridColumns = computed(() => `repeat(${this.columnsCount()}, minmax(0, 1fr))`);

  readonly filteredSounds = computed(() => {
    let result = this.sounds();
    const query = this.searchQuery().toLowerCase().trim();
    const tags = this.selectedTags();

    if (query) {
      result = result.filter(
        (sound) =>
          sound.name.toLowerCase().includes(query) ||
          sound.fileName.toLowerCase().includes(query) ||
          sound.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    if (tags.length > 0) {
      result = result.filter((sound) => tags.some((tag) => sound.tags?.includes(tag)));
    }

    return result;
  });

  /** Große Top-Pads: nur wenn genug Platz (mind. 6 Spalten) und genug Sounds */
  readonly featured = computed(() => {
    const list = this.filteredSounds();
    if (!this.showFeatured() || this.columnsCount() < 6 || list.length < 12) return [];
    return list.slice(0, 6);
  });

  readonly featuredHeight = computed(() => this.rowHeight * 2 + 46);

  readonly rows = computed(() => {
    const sounds = this.filteredSounds().slice(this.featured().length);
    const cols = this.columnsCount();
    const result: Sound[][] = [];
    for (let i = 0; i < sounds.length; i += cols) {
      result.push(sounds.slice(i, i + cols));
    }
    return result;
  });

  /** Wenige Treffer: großes CABD leuchtet stärker durch */
  readonly fewResults = computed(() => this.filteredSounds().length < this.columnsCount() * 2);

  ngAfterViewInit(): void {
    const el = this.hostEl.nativeElement as HTMLElement;
    const calc = () => {
      const available = el.clientWidth - SoundGridComponent.PADDING;
      const minPad = el.clientWidth < 600 ? 96 : SoundGridComponent.MIN_PAD_WIDTH;
      const cols = Math.max(
        1,
        Math.floor((available + SoundGridComponent.GAP) / (minPad + SoundGridComponent.GAP)),
      );
      this.columnsCount.set(cols);
    };
    requestAnimationFrame(calc);
    this.resizeObserver = new ResizeObserver(calc);
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** Lampe steht oben links: Pads dort bekommen mehr Streulicht */
  lampAt(col: number, row: number): number {
    const f = 0.85 - (0.55 * col) / Math.max(1, this.columnsCount() - 1) - 0.06 * Math.min(row, 6);
    return Math.max(0.15, Math.min(1, f));
  }

  trackRow(_index: number, row: Sound[]): string {
    return row.map((s) => s.hash).join('-');
  }
}
