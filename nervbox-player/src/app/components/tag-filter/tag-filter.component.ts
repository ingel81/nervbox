import { Component, input, output, signal, computed, ElementRef, viewChild, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-tag-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatChipsModule,
    MatIconModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="tag-filter nervbox-scrollbar">
      <!-- Gepinnte Tags -->
      @for (tag of pinnedTags(); track tag) {
        <button
          class="tag-chip pinned"
          [class.selected]="isSelected(tag)"
          [style.--tag-color]="getTagColor(tag)"
          (click)="toggleTag(tag)"
        >
          <span class="tag-dot" [style.background]="isSelected(tag) ? 'white' : getTagColor(tag)"></span>
          <span class="hash">#</span>{{ tag }}
        </button>
      }

      <!-- Sichtbare nicht-gepinnte Tags -->
      @for (tag of visibleNonPinnedTags(); track tag) {
        <button
          class="tag-chip"
          [class.selected]="isSelected(tag)"
          [style.--tag-color]="getTagColor(tag)"
          (click)="toggleTag(tag)"
        >
          <span class="tag-dot" [style.background]="isSelected(tag) ? 'white' : getTagColor(tag)"></span>
          <span class="hash">#</span>{{ tag }}
          <mat-icon class="remove-icon" (click)="removeVisibleTag(tag, $event)">close</mat-icon>
        </button>
      }

      <!-- Tag-Suche -->
      <div class="tag-search" #searchOrigin="matAutocompleteOrigin" matAutocompleteOrigin>
        <mat-icon class="search-icon">search</mat-icon>
        <input
          #searchInput
          type="text"
          class="search-input"
          placeholder="Tag suchen..."
          [(ngModel)]="searchQuery"
          [matAutocomplete]="auto"
          [matAutocompleteConnectedTo]="searchOrigin"
          (focus)="onSearchFocus()"
        />
        @if (searchQuery) {
          <button class="clear-btn" (click)="clearSearch($event)">
            <mat-icon>close</mat-icon>
          </button>
        }
        <mat-autocomplete
          #auto="matAutocomplete"
          class="tag-autocomplete"
          panelClass="tag-autocomplete-panel"
          (optionSelected)="onTagSelected($event)"
        >
          @for (tag of filteredTags(); track tag) {
            <mat-option [value]="tag">
              <span class="autocomplete-tag">
                <span class="tag-dot-small" [style.background]="getTagColor(tag)"></span>
                <span class="hash">#</span>{{ tag }}
              </span>
            </mat-option>
          }
          @if (filteredTags().length === 0 && searchQuery) {
            <mat-option disabled>Kein Tag gefunden</mat-option>
          }
        </mat-autocomplete>
      </div>
    </div>
  `,
  styles: `
    .tag-filter {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      overflow-x: auto;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(147, 51, 234, 0.2);
    }

    .tag-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      font-family: Inter, sans-serif;
    }

    .tag-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .tag-chip:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--tag-color, #9333ea);
    }

    .tag-chip.selected {
      background: var(--tag-color, #9333ea);
      border-color: transparent;
      color: white;
      box-shadow: 0 0 10px color-mix(in srgb, var(--tag-color, #9333ea) 40%, transparent);
    }

    .tag-chip.selected .tag-dot {
      background: white !important;
    }

    .tag-chip.pinned {
      border-color: rgba(249, 115, 22, 0.5);
      box-shadow: 0 0 8px rgba(249, 115, 22, 0.2);
      background: rgba(249, 115, 22, 0.08);
    }

    .tag-chip.pinned:hover {
      border-color: rgba(249, 115, 22, 0.7);
      box-shadow: 0 0 12px rgba(249, 115, 22, 0.3);
    }

    .remove-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-left: 2px;
      opacity: 0.7;
    }

    .tag-chip:hover .remove-icon {
      opacity: 1;
    }

    .tag-search {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      padding: 4px 12px;
      min-width: 160px;
      transition: all 0.2s ease;
    }

    .tag-search:focus-within {
      border-color: #9333ea;
      background: rgba(147, 51, 234, 0.1);
    }

    .search-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.5);
    }

    .search-input {
      background: transparent;
      border: none;
      outline: none;
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      font-family: Inter, sans-serif;
      width: 120px;
    }

    .search-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .clear-btn {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.5;
      transition: opacity 0.2s;
    }

    .clear-btn:hover {
      opacity: 1;
    }

    .clear-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.7);
    }

    .autocomplete-tag {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tag-dot-small {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    ::ng-deep .mat-mdc-autocomplete-panel {
      background: #1a1b1f !important;
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px !important;
      min-width: 200px !important;
    }

    ::ng-deep .mat-mdc-option {
      color: rgba(255, 255, 255, 0.9) !important;
      font-size: 13px !important;
    }

    ::ng-deep .mat-mdc-option:hover {
      background: rgba(147, 51, 234, 0.2) !important;
    }

    ::ng-deep .mat-mdc-option.mdc-list-item--selected {
      background: rgba(147, 51, 234, 0.3) !important;
    }
  `,
})
export class TagFilterComponent implements OnInit {
  private static readonly STORAGE_KEY_SELECTED = 'nervbox-selected-tags';
  private static readonly STORAGE_KEY_VISIBLE = 'nervbox-visible-tags';

  readonly tags = input<string[]>([]);
  readonly tagColors = input<Record<string, string>>({});
  readonly pinnedTags = input<string[]>([]);
  readonly selectedTagsChange = output<string[]>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly _selectedTags = signal<string[]>([]);
  private readonly _visibleTags = signal<string[]>([]); // Tags that are shown (not pinned)
  readonly selectedTags = computed(() => this._selectedTags());

  searchQuery = '';

  constructor() {
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
    this._visibleTags().filter(t => !this.pinnedTags().includes(t))
  );

  readonly filteredTags = computed(() => {
    const pinned = this.pinnedTags();
    const visible = this._visibleTags();
    const query = this.searchQuery.toLowerCase();

    return this.tags()
      .filter(t => !pinned.includes(t) && !visible.includes(t))
      .filter(t => !query || t.toLowerCase().includes(query))
      .slice(0, 10);
  });

  getTagColor(tag: string): string {
    return this.tagColors()[tag] || '#9333ea';
  }

  isSelected(tag: string): boolean {
    return this._selectedTags().includes(tag);
  }

  toggleTag(tag: string): void {
    const current = this._selectedTags();
    if (current.includes(tag)) {
      this._selectedTags.set(current.filter(t => t !== tag));
    } else {
      this._selectedTags.set([...current, tag]);
    }
    this.selectedTagsChange.emit(this._selectedTags());
  }

  onSearchFocus(): void {
    // Trigger filter update when focusing
  }

  clearSearch(event: Event): void {
    event.stopPropagation();
    this.searchQuery = '';
  }

  onTagSelected(event: MatAutocompleteSelectedEvent): void {
    const tag = event.option.value;
    // Add to visible tags and select it
    if (!this._visibleTags().includes(tag)) {
      this._visibleTags.update(tags => [...tags, tag]);
    }
    if (!this._selectedTags().includes(tag)) {
      this._selectedTags.update(tags => [...tags, tag]);
      this.selectedTagsChange.emit(this._selectedTags());
    }
    this.searchQuery = '';
    this.searchInput()?.nativeElement.blur();
  }

  removeVisibleTag(tag: string, event: Event): void {
    event.stopPropagation();
    // Remove from both visible and selected
    this._visibleTags.update(tags => tags.filter(t => t !== tag));
    if (this._selectedTags().includes(tag)) {
      this._selectedTags.update(tags => tags.filter(t => t !== tag));
      this.selectedTagsChange.emit(this._selectedTags());
    }
  }
}
