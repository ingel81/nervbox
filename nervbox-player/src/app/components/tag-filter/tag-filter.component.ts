import {
  Component,
  input,
  output,
  signal,
  computed,
  ElementRef,
  viewChild,
  OnInit,
  effect,
  afterNextRender,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { tagToneStyle } from '../../shared/tag-tone';

@Component({
  selector: 'app-tag-filter',
  standalone: true,
  imports: [FormsModule, MatTooltipModule, MatAutocompleteModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav #rail class="nk-rail tag-rail" [class.tag-rail--more]="moreRight()" aria-label="Tags" (scroll)="updateFade()">
      @if (pinnedTags().length) {
        <span class="nk-label">Angepinnt</span>
      }
      @for (tag of pinnedTags(); track tag) {
        <span class="nk-tag-group">
          <button
            type="button"
            [class]="isSelected(tag) ? 'nk-tag nk-tag--selected' : 'nk-tag'"
            [style]="tone(tag)"
            [attr.aria-pressed]="isSelected(tag)"
            (click)="toggleTag(tag)"
          >
            <svg class="nk-tag__pin" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-label="angepinnt"><path d="M16 3l5 5-4 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"></path></svg>
            <span class="nk-tag__lens" aria-hidden="true"></span>
            <span>#{{ tag }}</span>
            @if (tagCounts()[tag]) {
              <span class="nk-tag__count">{{ tagCounts()[tag] }}</span>
            }
          </button>
        </span>
      }

      @if (visibleNonPinnedTags().length) {
        <span class="nk-label" [class.nk-rail__sep]="pinnedTags().length > 0">Meine Tags</span>
      }
      @for (tag of visibleNonPinnedTags(); track tag) {
        <span class="nk-tag-group">
          <button
            type="button"
            [class]="isSelected(tag) ? 'nk-tag nk-tag--selected' : 'nk-tag'"
            [style]="tone(tag)"
            [attr.aria-pressed]="isSelected(tag)"
            (click)="toggleTag(tag)"
          >
            <span class="nk-tag__lens" aria-hidden="true"></span>
            <span>#{{ tag }}</span>
            @if (tagCounts()[tag]) {
              <span class="nk-tag__count">{{ tagCounts()[tag] }}</span>
            }
          </button>
          <button
            type="button"
            class="nk-tag__remove"
            [attr.aria-label]="'#' + tag + ' aus der Leiste entfernen'"
            [matTooltip]="'#' + tag + ' entfernen'"
            (click)="removeVisibleTag(tag, $event)"
          >✕</button>
        </span>
      }

      <label class="nk-input nk-input--sm tag-search" #searchOrigin="matAutocompleteOrigin" matAutocompleteOrigin>
        <svg class="nk-input__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
        <input
          #searchInput
          class="nk-input__field"
          type="text"
          aria-label="Tag suchen und hinzufügen"
          placeholder="Tag suchen …"
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
          [matAutocomplete]="auto"
          [matAutocompleteConnectedTo]="searchOrigin"
        />
        @if (searchQuery()) {
          <button type="button" class="nk-input__clear" aria-label="Tag-Suche leeren" (click)="clearSearch($event)">✕</button>
        }
        <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onTagSelected($event)">
          @for (tag of filteredTags(); track tag) {
            <mat-option [value]="tag">
              <span class="tag-opt" [style]="tone(tag)"><span class="nk-tag__lens" aria-hidden="true"></span>#{{ tag }}</span>
            </mat-option>
          }
          @if (filteredTags().length === 0 && searchQuery()) {
            <mat-option disabled>Kein Tag gefunden</mat-option>
          }
        </mat-autocomplete>
      </label>

      <span class="tag-spacer"></span>
      <span class="nk-label tag-lib">Bibliothek</span>
      <span class="nk-counter">{{ soundCount() }} SOUNDS</span>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
    .tag-rail {
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
    }
    .tag-search {
      width: 138px;
      flex-shrink: 0;
      margin-left: 6px;
    }
    .tag-spacer {
      flex: 1;
    }
    .tag-opt {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font: 700 var(--nk-fs-md) / 1 var(--nk-font-ui);
    }
    @media (max-width: 1280px) {
      .tag-lib {
        display: none;
      }
    }
    @media (max-width: 768px) {
      .tag-rail {
        height: 40px;
        padding: 0 8px;
      }
      /* Weicher Rand rechts: zeigt, dass die Leiste weiter scrollt (weg am Ende) */
      .tag-rail--more {
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
        mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent);
      }
      .tag-rail > .nk-label,
      .tag-spacer,
      .tag-rail > .nk-counter {
        display: none;
      }
    }
  `,
})
export class TagFilterComponent implements OnInit {
  private static readonly STORAGE_KEY_SELECTED = 'nervbox-selected-tags';
  private static readonly STORAGE_KEY_VISIBLE = 'nervbox-visible-tags';

  readonly tags = input<string[]>([]);
  readonly tagColors = input<Record<string, string>>({});
  readonly pinnedTags = input<string[]>([]);
  readonly tagCounts = input<Record<string, number>>({});
  readonly soundCount = input<number>(0);
  readonly selectedTagsChange = output<string[]>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly _selectedTags = signal<string[]>([]);
  private readonly _visibleTags = signal<string[]>([]); // Tags that are shown (not pinned)
  readonly selectedTags = computed(() => this._selectedTags());

  readonly searchQuery = signal('');

  private readonly rail = viewChild<ElementRef<HTMLElement>>('rail');
  /** Leiste scrollt noch nach rechts weiter (steuert den Fade-Rand) */
  readonly moreRight = signal(false);

  updateFade(): void {
    const el = this.rail()?.nativeElement;
    this.moreRight.set(!!el && el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }

  constructor() {
    // Fade-Zustand nach Render / bei Größen- und Tag-Änderungen neu bestimmen
    afterNextRender(() => {
      const el = this.rail()?.nativeElement;
      if (el) new ResizeObserver(() => this.updateFade()).observe(el);
      this.updateFade();
    });
    effect(() => {
      this.tags(); this.pinnedTags(); this._visibleTags();
      setTimeout(() => this.updateFade());
    });
    // Persist selected tags to localStorage whenever they change
    effect(() => {
      const tags = this._selectedTags();
      localStorage.setItem(TagFilterComponent.STORAGE_KEY_SELECTED, JSON.stringify(tags));
    });
    // Persist visible tags to localStorage
    effect(() => {
      const tags = this._visibleTags();
      localStorage.setItem(TagFilterComponent.STORAGE_KEY_VISIBLE, JSON.stringify(tags));
    });
  }

  ngOnInit(): void {
    // Load saved tags from localStorage
    const savedSelected = localStorage.getItem(TagFilterComponent.STORAGE_KEY_SELECTED);
    const savedVisible = localStorage.getItem(TagFilterComponent.STORAGE_KEY_VISIBLE);

    if (savedSelected) {
      try {
        const tags = JSON.parse(savedSelected) as string[];
        if (Array.isArray(tags) && tags.length > 0) {
          this._selectedTags.set(tags);
          this.selectedTagsChange.emit(tags);
        }
      } catch {
        // Invalid data, ignore
      }
    }

    if (savedVisible) {
      try {
        const tags = JSON.parse(savedVisible) as string[];
        if (Array.isArray(tags)) {
          this._visibleTags.set(tags);
        }
      } catch {
        // Invalid data, ignore
      }
    }
  }

  // Visible non-pinned tags (shown in the filter bar)
  readonly visibleNonPinnedTags = computed(() =>
    this._visibleTags().filter((t) => !this.pinnedTags().includes(t)),
  );

  readonly filteredTags = computed(() => {
    const pinned = this.pinnedTags();
    const visible = this._visibleTags();
    const query = this.searchQuery().toLowerCase();

    return this.tags()
      .filter((t) => !pinned.includes(t) && !visible.includes(t))
      .filter((t) => !query || t.toLowerCase().includes(query))
      .slice(0, 10);
  });

  tone(tag: string): string {
    return tagToneStyle(this.tagColors()[tag]);
  }

  isSelected(tag: string): boolean {
    return this._selectedTags().includes(tag);
  }

  toggleTag(tag: string): void {
    const current = this._selectedTags();
    if (current.includes(tag)) {
      this._selectedTags.set(current.filter((t) => t !== tag));
    } else {
      this._selectedTags.set([...current, tag]);
    }
    this.selectedTagsChange.emit(this._selectedTags());
  }

  clearSearch(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.searchQuery.set('');
  }

  onTagSelected(event: MatAutocompleteSelectedEvent): void {
    const tag = event.option.value;
    // Add to visible tags and select it
    if (!this._visibleTags().includes(tag)) {
      this._visibleTags.update((tags) => [...tags, tag]);
    }
    if (!this._selectedTags().includes(tag)) {
      this._selectedTags.update((tags) => [...tags, tag]);
      this.selectedTagsChange.emit(this._selectedTags());
    }
    this.searchQuery.set('');
    this.searchInput()?.nativeElement.blur();
  }

  removeVisibleTag(tag: string, event: Event): void {
    event.stopPropagation();
    // Remove from both visible and selected
    this._visibleTags.update((tags) => tags.filter((t) => t !== tag));
    if (this._selectedTags().includes(tag)) {
      this._selectedTags.update((tags) => tags.filter((t) => t !== tag));
      this.selectedTagsChange.emit(this._selectedTags());
    }
  }
}
