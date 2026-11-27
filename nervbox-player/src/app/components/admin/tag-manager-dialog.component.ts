import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
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
    <div class="nk-dlg tm">
      <header class="nk-dialog__head">
        <mat-icon class="tm-ico" aria-hidden="true">label</mat-icon>
        <h2 class="nk-dialog__title">Tag-Verwaltung</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          mat-dialog-close
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body tm-body">
        @if (loading()) {
          <div class="tm-state">
            <span class="nk-spin" aria-hidden="true"></span>Tags werden geladen...
          </div>
        } @else {
          <div class="nk-section">
            <h3 class="nk-section__title">Neuer Tag</h3>
            <div class="tm-line">
              <input
                type="color"
                class="tm-color"
                [(ngModel)]="newTagColor"
                matTooltip="Farbe wählen"
                aria-label="Farbe wählen"
              />
              <label class="nk-input tm-grow"
                ><input
                  class="nk-input__field"
                  [(ngModel)]="newTagName"
                  (keydown.enter)="createTag()"
                  placeholder="Tag-Name eingeben"
                  aria-label="Neuer Tag"
              /></label>
              <button
                type="button"
                [class]="newTagPinned ? 'nk-key nk-key--icon nk-key--on' : 'nk-key nk-key--icon'"
                [attr.aria-pressed]="newTagPinned"
                [matTooltip]="newTagPinned ? 'Gepinnt' : 'Nicht gepinnt'"
                aria-label="Anpinnen"
                (click)="newTagPinned = !newTagPinned"
              >
                <mat-icon>push_pin</mat-icon>
              </button>
              <button
                type="button"
                class="nk-key nk-key--icon nk-key--accent"
                matTooltip="Tag erstellen"
                aria-label="Tag erstellen"
                [disabled]="!newTagName.trim() || creating()"
                (click)="createTag()"
              >
                @if (creating()) {
                  <span class="nk-spin" aria-hidden="true"></span>
                } @else {
                  <mat-icon>add</mat-icon>
                }
              </button>
            </div>
          </div>
          <div class="nk-well tm-list">
            @if (tags().length === 0) {
              <div class="tm-state">Keine Tags vorhanden</div>
            } @else {
              @for (tag of tags(); track tag.id) {
                <div
                  [class]="editingTagId() === tag.id ? 'nk-row nk-row--hl tm-row' : 'nk-row tm-row'"
                >
                  @if (editingTagId() === tag.id) {
                    <input
                      type="color"
                      class="tm-color"
                      [(ngModel)]="editingTagColor"
                      matTooltip="Farbe wählen"
                      aria-label="Farbe wählen"
                    />
                    <label class="nk-input nk-input--focus tm-grow tm-edit"
                      ><input
                        #editInput
                        class="nk-input__field"
                        [(ngModel)]="editingTagName"
                        (keydown.enter)="saveTag(tag)"
                        (keydown.escape)="cancelEdit()"
                        aria-label="Tag-Name"
                    /></label>
                    <button
                      type="button"
                      [class]="
                        editingTagPinned
                          ? 'nk-key nk-key--sm nk-key--icon nk-key--on'
                          : 'nk-key nk-key--sm nk-key--icon'
                      "
                      [attr.aria-pressed]="editingTagPinned"
                      [matTooltip]="editingTagPinned ? 'Gepinnt' : 'Nicht gepinnt'"
                      aria-label="Anpinnen"
                      (click)="editingTagPinned = !editingTagPinned"
                    >
                      <mat-icon>push_pin</mat-icon>
                    </button>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--icon nk-key--accent"
                      matTooltip="Speichern"
                      aria-label="Speichern"
                      (click)="saveTag(tag)"
                    >
                      <mat-icon>check</mat-icon>
                    </button>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--icon"
                      matTooltip="Abbrechen"
                      aria-label="Abbrechen"
                      (click)="cancelEdit()"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  } @else {
                    <span
                      class="tm-swatch"
                      [style.background]="tag.color"
                      aria-hidden="true"
                    ></span>
                    @if (tag.isPinned) {
                      <mat-icon class="tm-pin" matTooltip="Gepinnt" aria-label="Gepinnt"
                        >push_pin</mat-icon
                      >
                    }
                    <span class="nk-row__main"
                      ><span class="nk-row__title">#{{ tag.name }}</span></span
                    >
                    <span
                      class="nk-counter tm-count"
                      [matTooltip]="tag.soundCount + ' Sounds verwenden diesen Tag'"
                      >{{ tag.soundCount }}</span
                    >
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--icon"
                      matTooltip="Bearbeiten"
                      aria-label="Bearbeiten"
                      (click)="startEdit(tag)"
                    >
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button
                      type="button"
                      class="nk-key nk-key--sm nk-key--icon"
                      [class.tm-del]="!tag.soundCount"
                      [matTooltip]="
                        tag.soundCount
                          ? 'Wird von ' + tag.soundCount + ' Sounds verwendet'
                          : 'Löschen'
                      "
                      aria-label="Löschen"
                      [disabled]="deleting() === tag.id"
                      (click)="deleteTag(tag)"
                    >
                      @if (deleting() === tag.id) {
                        <span class="nk-spin" aria-hidden="true"></span>
                      } @else {
                        <mat-icon>delete</mat-icon>
                      }
                    </button>
                  }
                </div>
              }
            }
          </div>
        }
      </div>
      <footer class="nk-dialog__foot tm-foot">
        <span class="tm-total">{{ tags().length }} Tags insgesamt</span>
        <button type="button" class="nk-key" mat-dialog-close>Schließen</button>
      </footer>
    </div>
  `,
  styles: `
    .tm {
      width: 560px;
      max-width: 100%;
      max-height: 90vh;
    }
    .tm-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .tm-body {
      overflow: hidden;
    }
    .tm-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 8px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .tm-line {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 3px;
    }
    .tm-grow {
      flex: 1;
      min-width: 0;
    }
    .tm-edit {
      height: 34px;
    }
    .tm-color {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
      padding: 0;
      border: 0;
      border-radius: 5px;
      cursor: pointer;
      background: transparent;
      box-shadow:
        0 0 0 3px #0b0a08,
        1.5px 1.5px 0 3px rgb(255 226 176 / 0.17);
    }
    .tm-color::-webkit-color-swatch-wrapper {
      padding: 0;
    }
    .tm-color::-webkit-color-swatch {
      border: 0;
      border-radius: 5px;
    }
    .tm-list {
      overflow-y: auto;
      max-height: 56vh;
    }
    .tm-row {
      min-height: 46px;
    }
    .tm-row .nk-key .mat-icon,
    .tm-line .nk-key .mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .tm-swatch {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      border-radius: 5px;
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.45),
        0 0 0 3px #0b0a08;
    }
    .tm-pin {
      width: 14px;
      height: 14px;
      font-size: 14px;
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.7));
    }
    .tm-count {
      min-width: 44px;
    }
    .tm-del {
      color: var(--nk-danger-text);
    }
    .tm-foot {
      justify-content: space-between;
    }
    .tm-total {
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      next: (tags) => {
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
      next: (newTag) => {
        this.tags.update((tags) => this.sortTagList([...tags, newTag]));
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
    if (
      name === tag.name &&
      this.editingTagColor === tag.color &&
      this.editingTagPinned === tag.isPinned
    ) {
      this.cancelEdit();
      return;
    }

    this.soundService
      .updateTag(tag.id, name, this.editingTagColor, this.editingTagPinned)
      .subscribe({
        next: (updatedTag) => {
          this.tags.update((tags) =>
            this.sortTagList(tags.map((t) => (t.id === tag.id ? updatedTag : t))),
          );
          this.cancelEdit();
        },
        error: () => {
          this.cancelEdit();
        },
      });
  }

  deleteTag(tag: Tag): void {
    if (tag.soundCount && tag.soundCount > 0) {
      if (
        !confirm(
          `Der Tag "${tag.name}" wird von ${tag.soundCount} Sounds verwendet. Trotzdem löschen?`,
        )
      ) {
        return;
      }
    }

    this.deleting.set(tag.id);
    this.soundService.deleteTag(tag.id).subscribe({
      next: () => {
        this.tags.update((tags) => tags.filter((t) => t.id !== tag.id));
        this.deleting.set(null);
      },
      error: () => {
        this.deleting.set(null);
      },
    });
  }
}
