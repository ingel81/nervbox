import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Tag } from '../../core/models';
import { SoundService } from '../../core/services/sound.service';

@Component({
  selector: 'app-tag-manager-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>label</mat-icon>
      Tag-Verwaltung
    </h2>

    <mat-dialog-content>
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="32"></mat-spinner>
          <span>Tags werden geladen...</span>
        </div>
      } @else {
        <!-- Add new tag -->
        <div class="add-tag-section">
          <input
            type="color"
            class="color-picker"
            [(ngModel)]="newTagColor"
            matTooltip="Farbe wählen"
          />
          <mat-form-field appearance="outline" class="tag-input">
            <mat-label>Neuer Tag</mat-label>
            <input
              matInput
              [(ngModel)]="newTagName"
              (keydown.enter)="createTag()"
              placeholder="Tag-Name eingeben"
            />
          </mat-form-field>
          <button
            mat-icon-button
            [class.pinned]="newTagPinned"
            (click)="newTagPinned = !newTagPinned"
            [matTooltip]="newTagPinned ? 'Gepinnt' : 'Nicht gepinnt'"
          >
            <mat-icon>{{ newTagPinned ? 'push_pin' : 'push_pin' }}</mat-icon>
          </button>
          <button
            mat-icon-button
            color="primary"
            (click)="createTag()"
            [disabled]="!newTagName.trim() || creating()"
            matTooltip="Tag erstellen"
          >
            @if (creating()) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              <mat-icon>add</mat-icon>
            }
          </button>
        </div>

        <!-- Tag list -->
        <div class="tag-list nervbox-scrollbar">
          @if (tags().length === 0) {
            <div class="empty-state">
              <mat-icon>label_off</mat-icon>
              <span>Keine Tags vorhanden</span>
            </div>
          } @else {
            @for (tag of tags(); track tag.id) {
              <div class="tag-item" [class.editing]="editingTagId() === tag.id" [class.pinned]="tag.isPinned">
                @if (editingTagId() === tag.id) {
                  <input
                    type="color"
                    class="color-picker"
                    [(ngModel)]="editingTagColor"
                    matTooltip="Farbe wählen"
                  />
                  <input
                    class="edit-input"
                    [(ngModel)]="editingTagName"
                    (keydown.enter)="saveTag(tag)"
                    (keydown.escape)="cancelEdit()"
                    #editInput
                  />
                  <button
                    mat-icon-button
                    [class.pinned]="editingTagPinned"
                    (click)="editingTagPinned = !editingTagPinned"
                    [matTooltip]="editingTagPinned ? 'Gepinnt' : 'Nicht gepinnt'"
                  >
                    <mat-icon>push_pin</mat-icon>
                  </button>
                  <button mat-icon-button (click)="saveTag(tag)" matTooltip="Speichern">
                    <mat-icon>check</mat-icon>
                  </button>
                  <button mat-icon-button (click)="cancelEdit()" matTooltip="Abbrechen">
                    <mat-icon>close</mat-icon>
                  </button>
                } @else {
                  @if (tag.isPinned) {
                    <mat-icon class="pin-indicator" matTooltip="Gepinnt">push_pin</mat-icon>
                  }
                  <span class="tag-color" [style.background]="tag.color"></span>
                  <span class="tag-name"><span class="hash">#</span>{{ tag.name }}</span>
                  <span class="tag-count" [matTooltip]="tag.soundCount + ' Sounds verwenden diesen Tag'">
                    {{ tag.soundCount }}
                  </span>
                  <button mat-icon-button (click)="startEdit(tag)" matTooltip="Bearbeiten">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    (click)="deleteTag(tag)"
                    [matTooltip]="tag.soundCount ? 'Wird von ' + tag.soundCount + ' Sounds verwendet' : 'Löschen'"
                    [disabled]="deleting() === tag.id"
                  >
                    @if (deleting() === tag.id) {
                      <mat-spinner diameter="18"></mat-spinner>
                    } @else {
                      <mat-icon [class.warn]="!tag.soundCount">delete</mat-icon>
                    }
                  </button>
                }
              </div>
            }
          }
        </div>

        <div class="tag-stats">
          {{ tags().length }} Tags insgesamt
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Schließen</button>
    </mat-dialog-actions>
  `,
  styles: `
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #9333ea;
      margin: 0;
      padding: 16px 24px;
    }

    h2 mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    mat-dialog-content {
      padding: 0 24px;
      min-width: 400px;
      min-height: 300px;
      display: flex;
      flex-direction: column;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      height: 200px;
      color: rgba(255, 255, 255, 0.6);
    }

    .add-tag-section {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .color-picker {
      width: 36px;
      height: 36px;
      padding: 0;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      cursor: pointer;
      background: transparent;
    }

    .color-picker::-webkit-color-swatch-wrapper {
      padding: 2px;
    }

    .color-picker::-webkit-color-swatch {
      border: none;
      border-radius: 4px;
    }

    .tag-input {
      flex: 1;
    }

    .tag-list {
      flex: 1;
      max-height: 300px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      height: 150px;
      color: rgba(255, 255, 255, 0.4);
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .tag-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      transition: background 0.2s;
    }

    .tag-item:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .tag-item.editing {
      background: rgba(147, 51, 234, 0.1);
    }

    .tag-item.pinned {
      border-left: 2px solid #f97316;
      background: rgba(249, 115, 22, 0.05);
    }

    .pin-indicator {
      color: #f97316;
      font-size: 14px;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    button.pinned mat-icon {
      color: #f97316;
    }

    .tag-color {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .tag-name {
      flex: 1;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.9);
    }

    .tag-count {
      background: rgba(147, 51, 234, 0.2);
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
      font-family: 'JetBrains Mono', monospace;
      cursor: help;
    }

    .edit-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 4px;
      padding: 6px 10px;
      color: white;
      font-size: 14px;
      outline: none;
    }

    .edit-input:focus {
      border-color: #9333ea;
    }

    .tag-item button {
      opacity: 0.5;
    }

    .tag-item:hover button {
      opacity: 1;
    }

    .tag-item button mat-icon.warn {
      color: #ef4444;
    }

    .tag-stats {
      padding-top: 12px;
      margin-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      text-align: center;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
  `,
})
export class TagManagerDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<TagManagerDialogComponent>);
  private readonly soundService = inject(SoundService);

  readonly tags = signal<Tag[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly deleting = signal<number | null>(null);
  readonly editingTagId = signal<number | null>(null);

  newTagName = '';
  newTagColor = '#9333ea';
  newTagPinned = false;
  editingTagName = '';
  editingTagColor = '#9333ea';
  editingTagPinned = false;

  ngOnInit(): void {
    this.loadTags();
  }

  private loadTags(): void {
    this.loading.set(true);
    this.soundService.loadTags().subscribe({
      next: tags => {
        this.tags.set(tags);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  createTag(): void {
    const name = this.newTagName.trim().toLowerCase();
    if (!name) return;

    this.creating.set(true);
    this.soundService.createTag(name, this.newTagColor, this.newTagPinned).subscribe({
      next: newTag => {
        this.tags.update(tags => this.sortTagList([...tags, newTag]));
        this.newTagName = '';
        this.newTagColor = '#9333ea';
        this.newTagPinned = false;
        this.creating.set(false);
      },
      error: () => {
        this.creating.set(false);
      },
    });
  }

  private sortTagList(tags: Tag[]): Tag[] {
    return tags.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  startEdit(tag: Tag): void {
    this.editingTagId.set(tag.id);
    this.editingTagName = tag.name;
    this.editingTagColor = tag.color;
    this.editingTagPinned = tag.isPinned;
  }

  cancelEdit(): void {
    this.editingTagId.set(null);
    this.editingTagName = '';
    this.editingTagColor = '#9333ea';
    this.editingTagPinned = false;
  }

  saveTag(tag: Tag): void {
    const name = this.editingTagName.trim().toLowerCase();
    if (!name) {
      this.cancelEdit();
      return;
    }

    // Only update if something changed
    if (name === tag.name && this.editingTagColor === tag.color && this.editingTagPinned === tag.isPinned) {
      this.cancelEdit();
      return;
    }

    this.soundService.updateTag(tag.id, name, this.editingTagColor, this.editingTagPinned).subscribe({
      next: updatedTag => {
        this.tags.update(tags => this.sortTagList(tags.map(t => (t.id === tag.id ? updatedTag : t))));
        this.cancelEdit();
      },
      error: () => {
        this.cancelEdit();
      },
    });
  }

  deleteTag(tag: Tag): void {
    if (tag.soundCount && tag.soundCount > 0) {
      if (!confirm(`Der Tag "${tag.name}" wird von ${tag.soundCount} Sounds verwendet. Trotzdem löschen?`)) {
        return;
      }
    }

    this.deleting.set(tag.id);
    this.soundService.deleteTag(tag.id).subscribe({
      next: () => {
        this.tags.update(tags => tags.filter(t => t.id !== tag.id));
        this.deleting.set(null);
      },
      error: () => {
        this.deleting.set(null);
      },
    });
  }
}
