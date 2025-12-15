import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-tag-filter',
  standalone: true,
  imports: [CommonModule, MatChipsModule],
  template: `
    <div class="tag-filter nervbox-scrollbar">
      @for (tag of tags(); track tag) {
        <button
          class="tag-chip"
          [class.selected]="isSelected(tag)"
          [style.--tag-color]="getTagColor(tag)"
          (click)="toggleTag(tag)"
        >
          <span class="tag-dot" [style.background]="getTagColor(tag)"></span>
          {{ tag }}
        </button>
      }
    </div>
  `,
  styles: `
    .tag-filter {
      display: flex;
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
  `,
})
export class TagFilterComponent {
  readonly tags = input<string[]>([]);
  readonly tagColors = input<Record<string, string>>({});
  readonly selectedTagsChange = output<string[]>();

  private readonly _selectedTags = signal<string[]>([]);
  readonly selectedTags = computed(() => this._selectedTags());

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
}
