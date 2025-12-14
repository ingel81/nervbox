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
          (click)="toggleTag(tag)"
        >
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
      background: rgba(147, 51, 234, 0.15);
      border: 1px solid rgba(147, 51, 234, 0.3);
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

    .tag-chip:hover {
      background: rgba(147, 51, 234, 0.25);
      border-color: rgba(147, 51, 234, 0.5);
    }

    .tag-chip.selected {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%);
      border-color: transparent;
      color: white;
      box-shadow: 0 0 10px rgba(147, 51, 234, 0.4);
    }
  `,
})
export class TagFilterComponent {
  readonly tags = input<string[]>([]);
  readonly selectedTagsChange = output<string[]>();

  private readonly _selectedTags = signal<string[]>([]);
  readonly selectedTags = computed(() => this._selectedTags());

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
