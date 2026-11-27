import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Sound } from '../../core/models';
import { SoundService } from '../../core/services/sound.service';
import { tagToneStyle } from '../../shared/tag-tone';

export interface SoundEditDialogData {
  sound: Sound;
  availableTags: string[];
}

@Component({
  selector: 'app-sound-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="nk-dlg se">
      <header class="nk-dialog__head">
        <h2 class="nk-dialog__title">Sound bearbeiten</h2>
        <button
          type="button"
          class="nk-key nk-key--sm nk-key--icon"
          aria-label="Schließen"
          mat-dialog-close
        >
          ✕
        </button>
      </header>
      <div class="nk-dialog__body">
        <label class="nk-field">
          <span class="nk-label">Name</span>
          <span class="nk-input"
            ><input class="nk-input__field" [(ngModel)]="name" aria-label="Name"
          /></span>
        </label>
        <span class="se-kv"
          >Datei: <b>{{ data.sound.fileName }}</b></span
        >
        <span class="se-kv"
          >Hash: <b>{{ data.sound.hash }}</b></span
        >
        <span class="se-switch">
          <button
            type="button"
            role="switch"
            [attr.aria-checked]="enabled"
            [class]="enabled ? 'nk-switch nk-switch--on' : 'nk-switch'"
            [attr.aria-label]="enabled ? 'Aktiviert' : 'Deaktiviert'"
            (click)="enabled = !enabled"
          >
            <span class="nk-switch__knob" aria-hidden="true"></span>
          </button>
          {{ enabled ? 'Aktiviert' : 'Deaktiviert' }}
        </span>
        <div class="nk-section">
          <h3 class="nk-section__title">Tags</h3>
          <div class="se-chips">
            @for (tag of tags(); track tag) {
              <span class="nk-tag-group">
                <span class="nk-tag" [style]="tone(tag)"
                  ><span class="nk-tag__lens" aria-hidden="true"></span>#{{ tag }}</span
                >
                <button
                  type="button"
                  class="nk-tag__remove"
                  [attr.aria-label]="'#' + tag + ' entfernen'"
                  (click)="removeTag(tag)"
                >
                  ✕
                </button>
              </span>
            }
          </div>
          <div class="se-add">
            <label class="nk-input se-grow">
              <svg
                class="nk-input__icon"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14"></path>
              </svg>
              <input
                class="nk-input__field"
                placeholder="Tag hinzufügen"
                aria-label="Tag hinzufügen"
                [(ngModel)]="newTag"
                [matAutocomplete]="auto"
                (keydown.enter)="addTag()"
                (input)="updateFilteredTags()"
              />
            </label>
            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onTagSelected($event)">
              @for (tag of filteredTags(); track tag) {
                <mat-option [value]="tag"
                  ><span class="se-opt" [style]="tone(tag)"
                    ><span class="nk-tag__lens" aria-hidden="true"></span>#{{ tag }}</span
                  ></mat-option
                >
              }
            </mat-autocomplete>
            <button
              type="button"
              class="nk-key nk-key--icon"
              aria-label="Tag hinzufügen"
              [disabled]="!newTag.trim()"
              (click)="addTag()"
            >
              <mat-icon>add</mat-icon>
            </button>
          </div>
        </div>
      </div>
      <footer class="nk-dialog__foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close>Abbrechen</button>
        <button type="button" class="nk-key nk-key--accent" (click)="save()" [disabled]="saving()">
          @if (saving()) {
            <span class="nk-spin" aria-hidden="true"></span>
          }
          Speichern
        </button>
      </footer>
    </div>
  `,
  styles: `
    .se {
      width: 520px;
      max-width: 100%;
    }
    .se-kv {
      display: flex;
      gap: 8px;
      font: 500 11.5px var(--nk-font-mono);
      color: var(--nk-iv-2);
      word-break: break-all;
    }
    .se-kv b {
      font-weight: 600;
      color: var(--nk-iv);
    }
    .se-switch {
      display: flex;
      align-items: center;
      gap: 12px;
      font: 600 15px var(--nk-font-ui);
    }
    .se-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 3px;
    }
    .se-chips .nk-tag {
      height: 26px;
      font-size: 13.5px;
    }
    .se-add {
      display: flex;
      gap: 12px;
      padding: 3px;
    }
    .se-grow {
      flex: 1;
      min-width: 0;
    }
    .se-opt {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font: 700 var(--nk-fs-md) / 1 var(--nk-font-ui);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SoundEditDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<SoundEditDialogComponent>);
  readonly data = inject<SoundEditDialogData>(MAT_DIALOG_DATA);
  private readonly soundService = inject(SoundService);

  name = '';
  enabled = true;
  newTag = '';
  readonly tags = signal<string[]>([]);
  readonly saving = signal(false);

  readonly filteredTags = signal<string[]>([]);

  ngOnInit(): void {
    this.name = this.data.sound.name;
    this.enabled = this.data.sound.enabled;
    this.tags.set([...(this.data.sound.tags || [])]);
    this.updateFilteredTags();
  }

  updateFilteredTags(): void {
    const currentTags = this.tags();
    const available = this.data.availableTags.filter((t) => !currentTags.includes(t));
    const query = this.newTag.toLowerCase().trim();
    if (query) {
      this.filteredTags.set(available.filter((t) => t.toLowerCase().includes(query)));
    } else {
      this.filteredTags.set(available);
    }
  }

  getTagColor(tag: string): string {
    return this.soundService.tagColorMap()[tag] || '#9333ea';
  }

  tone(tag: string): string {
    return tagToneStyle(this.getTagColor(tag));
  }

  addTag(): void {
    const tag = this.newTag.trim().toLowerCase();
    if (tag && !this.tags().includes(tag)) {
      this.tags.update((tags) => [...tags, tag]);
      this.newTag = '';
      this.updateFilteredTags();
    }
  }

  removeTag(tag: string): void {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
    this.updateFilteredTags();
  }

  onTagSelected(event: { option: { value: string } }): void {
    const tag = event.option.value;
    if (!this.tags().includes(tag)) {
      this.tags.update((tags) => [...tags, tag]);
    }
    this.newTag = '';
    this.updateFilteredTags();
  }

  save(): void {
    this.saving.set(true);

    const updates = {
      name: this.name !== this.data.sound.name ? this.name : undefined,
      enabled: this.enabled !== this.data.sound.enabled ? this.enabled : undefined,
      tags: this.tags(),
    };

    this.soundService.updateSound(this.data.sound.hash, updates).subscribe({
      next: (updatedSound) => {
        this.saving.set(false);
        this.dialogRef.close(updatedSound);
      },
      error: (err) => {
        this.saving.set(false);
        console.error('Failed to update sound:', err);
      },
    });
  }
}
