import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
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
    <h2 mat-dialog-title>
      <mat-icon>edit</mat-icon>
      Sound bearbeiten
    </h2>

    <mat-dialog-content>
      <div class="form-content">
        <!-- Name -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput [(ngModel)]="name" />
        </mat-form-field>

        <!-- File Info (readonly) -->
        <div class="info-row">
          <span class="label">Datei:</span>
          <span class="value monospace">{{ data.sound.fileName }}</span>
        </div>
        <div class="info-row">
          <span class="label">Hash:</span>
          <span class="value monospace">{{ data.sound.hash }}</span>
        </div>

        <!-- Enabled Toggle -->
        <div class="toggle-row">
          <mat-slide-toggle [(ngModel)]="enabled" color="primary">
            {{ enabled ? 'Aktiviert' : 'Deaktiviert' }}
          </mat-slide-toggle>
        </div>

        <!-- Tags -->
        <div class="tags-section">
          <div class="tags-label">Tags</div>
          <div class="tags-container">
            @for (tag of tags(); track tag) {
              <span class="tag-chip">
                {{ tag }}
                <button class="remove-tag" (click)="removeTag(tag)">
                  <mat-icon>close</mat-icon>
                </button>
              </span>
            }
          </div>

          <!-- Add Tag -->
          <div class="add-tag-row">
            <mat-form-field appearance="outline" class="tag-input">
              <mat-label>Tag hinzufuegen</mat-label>
              <input
                matInput
                [(ngModel)]="newTag"
                [matAutocomplete]="auto"
                (keydown.enter)="addTag()"
              />
              <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onTagSelected($event)">
                @for (tag of filteredTags(); track tag) {
                  <mat-option [value]="tag">{{ tag }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
            <button mat-icon-button color="primary" (click)="addTag()" [disabled]="!newTag.trim()">
              <mat-icon>add</mat-icon>
            </button>
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Abbrechen</button>
      <button
        mat-raised-button
        color="primary"
        (click)="save()"
        [disabled]="saving()"
      >
        @if (saving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Speichern
        }
      </button>
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
    }

    .form-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .full-width {
      width: 100%;
    }

    .info-row {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }

    .info-row .label {
      color: rgba(255, 255, 255, 0.5);
      min-width: 50px;
    }

    .info-row .value {
      color: rgba(255, 255, 255, 0.8);
      word-break: break-all;
    }

    .toggle-row {
      padding: 8px 0;
    }

    .tags-section {
      margin-top: 8px;
    }

    .tags-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 8px;
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 32px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(147, 51, 234, 0.2);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 12px;
      padding: 4px 8px 4px 12px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.9);
    }

    .remove-tag {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      transition: background 0.2s;
    }

    .remove-tag:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .remove-tag mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.6);
    }

    .add-tag-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tag-input {
      flex: 1;
    }

    mat-dialog-actions {
      padding: 16px 24px;
    }

    mat-dialog-actions button[mat-raised-button] {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      border: none !important;
    }

    .monospace {
      font-family: 'JetBrains Mono', monospace;
    }

    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    /* Slide Toggle Styling */
    ::ng-deep .mat-mdc-slide-toggle .mdc-switch__icon {
      display: none;
    }

    ::ng-deep .mat-mdc-slide-toggle .mdc-switch__handle {
      background-color: rgba(255, 255, 255, 0.9) !important;
    }

    ::ng-deep .mat-mdc-slide-toggle.mat-mdc-slide-toggle-checked .mdc-switch__track {
      background-color: rgba(147, 51, 234, 0.5) !important;
    }

    /* Autocomplete Dropdown */
    ::ng-deep .mat-mdc-autocomplete-panel {
      background: #1a1b1f !important;
      border: 1px solid rgba(147, 51, 234, 0.3);
    }

    ::ng-deep .mat-mdc-option {
      color: rgba(255, 255, 255, 0.9) !important;
    }

    ::ng-deep .mat-mdc-option:hover {
      background: rgba(147, 51, 234, 0.2) !important;
    }

    ::ng-deep .mat-mdc-option.mdc-list-item--selected {
      background: rgba(147, 51, 234, 0.3) !important;
    }
  `,
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

  private updateFilteredTags(): void {
    const currentTags = this.tags();
    const available = this.data.availableTags.filter(t => !currentTags.includes(t));
    const query = this.newTag.toLowerCase().trim();
    if (query) {
      this.filteredTags.set(available.filter(t => t.toLowerCase().includes(query)));
    } else {
      this.filteredTags.set(available);
    }
  }

  addTag(): void {
    const tag = this.newTag.trim().toLowerCase();
    if (tag && !this.tags().includes(tag)) {
      this.tags.update(tags => [...tags, tag]);
      this.newTag = '';
      this.updateFilteredTags();
    }
  }

  removeTag(tag: string): void {
    this.tags.update(tags => tags.filter(t => t !== tag));
    this.updateFilteredTags();
  }

  onTagSelected(event: { option: { value: string } }): void {
    const tag = event.option.value;
    if (!this.tags().includes(tag)) {
      this.tags.update(tags => [...tags, tag]);
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
      next: updatedSound => {
        this.saving.set(false);
        this.dialogRef.close(updatedSound);
      },
      error: err => {
        this.saving.set(false);
        console.error('Failed to update sound:', err);
      },
    });
  }
}
