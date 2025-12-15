import { Component, input, output, signal, computed, ElementRef, viewChild } from '@angular/core';
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
          <mat-icon class="pin-icon">push_pin</mat-icon>
        </button>
      }

      <!-- Ausgewählte nicht-gepinnte Tags -->
      @for (tag of selectedNonPinnedTags(); track tag) {
        <button
          class="tag-chip selected"
          [style.--tag-color]="getTagColor(tag)"
          (click)="toggleTag(tag)"
        >
          <span class="tag-dot" [style.background]="'white'"></span>
          <span class="hash">#</span>{{ tag }}
          <mat-icon class="remove-icon">close</mat-icon>
        </button>
      }

      <!-- Tag-Suche -->
      <div class="tag-search">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          #searchInput
          type="text"
          class="search-input"
          placeholder="Tag suchen..."
          [(ngModel)]="searchQuery"
          [matAutocomplete]="auto"
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
      border-color: rgba(249, 115, 22, 0.4);
    }

    .pin-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
      color: #f97316;
    }

    .tag-chip.selected .pin-icon {
      color: white;
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
export class TagFilterComponent {
  readonly tags = input<string[]>([]);
  readonly tagColors = input<Record<string, string>>({});
  readonly pinnedTags = input<string[]>([]);
  readonly selectedTagsChange = output<string[]>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly _selectedTags = signal<string[]>([]);
  readonly selectedTags = computed(() => this._selectedTags());

  searchQuery = '';

  readonly selectedNonPinnedTags = computed(() =>
    this._selectedTags().filter(t => !this.pinnedTags().includes(t))
  );

  readonly filteredTags = computed(() => {
    const pinned = this.pinnedTags();
    const selected = this._selectedTags();
    const query = this.searchQuery.toLowerCase();

    return this.tags()
      .filter(t => !pinned.includes(t) && !selected.includes(t))
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
    this.toggleTag(tag);
    this.searchQuery = '';
    this.searchInput()?.nativeElement.blur();
  }
}
