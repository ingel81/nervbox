import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { Sound, Tag } from '../../core/models';
import { SoundService } from '../../core/services/sound.service';

@Component({
  selector: 'app-tag-wizard-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>auto_fix_high</mat-icon>
      Tag-Wizard
    </h2>

    <mat-dialog-content>
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Sounds werden geladen...</p>
        </div>
      } @else if (filteredSounds().length === 0) {
        <div class="empty-container">
          <mat-icon class="empty-icon">check_circle</mat-icon>
          <p>{{ showOnlyUntagged() ? 'Alle Sounds sind getaggt!' : 'Keine Sounds vorhanden.' }}</p>
          @if (showOnlyUntagged()) {
            <button mat-stroked-button (click)="showOnlyUntagged.set(false)">
              Alle Sounds anzeigen
            </button>
          }
        </div>
      } @else {
        <!-- Filter Toggle -->
        <div class="filter-row">
          <mat-slide-toggle
            [checked]="showOnlyUntagged()"
            (change)="onFilterChange($event.checked)"
            color="primary"
          >
            Nur ungetaggte Sounds
          </mat-slide-toggle>
          <span class="sound-count">{{ filteredSounds().length }} Sounds</span>
        </div>

        <!-- Progress Bar -->
        <div class="progress-section">
          <div class="progress-text">
            <span>{{ currentIndex() + 1 }} von {{ filteredSounds().length }}</span>
            <span class="progress-percent">{{ progressPercent() }}%</span>
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="progressPercent()"
          ></mat-progress-bar>
        </div>

        <!-- Current Sound Info -->
        @if (currentSound(); as sound) {
          <div class="sound-info">
            <div class="sound-header">
              <div class="sound-name">{{ sound.name }}</div>
              <button
                mat-icon-button
                class="play-btn"
                (click)="playCurrentSound()"
                matTooltip="Sound abspielen"
              >
                <mat-icon>play_arrow</mat-icon>
              </button>
            </div>
            <div class="sound-meta">
              <span class="meta-item">
                <mat-icon>schedule</mat-icon>
                {{ formatDuration(sound.durationMs) }}
              </span>
              <span class="meta-item">
                <mat-icon>audio_file</mat-icon>
                {{ sound.fileName }}
              </span>
            </div>
          </div>

          <!-- Current Tags (Selected) -->
          <div class="tags-section">
            <div class="tags-label">
              Aktuelle Tags
              @if (currentTags().length > 0) {
                <span class="tag-count">({{ currentTags().length }})</span>
              }
            </div>
            <div class="tags-container current-tags">
              @if (currentTags().length === 0) {
                <span class="no-tags">Noch keine Tags vergeben</span>
              }
              @for (tag of currentTags(); track tag) {
                <button
                  class="tag-chip selected"
                  [style.--tag-color]="getTagColor(tag)"
                  (click)="toggleTag(tag)"
                >
                  <span class="tag-dot"></span>
                  <span class="hash">#</span>{{ tag }}
                  <mat-icon class="check-icon">check</mat-icon>
                </button>
              }
            </div>
          </div>

          <!-- Available Tags -->
          <div class="tags-section">
            <div class="tags-label-row">
              <span class="tags-label">Verfuegbare Tags</span>
              <div class="tag-search">
                <mat-icon class="search-icon">search</mat-icon>
                <input
                  type="text"
                  class="search-input"
                  placeholder="Tags suchen..."
                  [value]="tagSearchQuery()"
                  (input)="tagSearchQuery.set($any($event.target).value)"
                />
                @if (tagSearchQuery()) {
                  <button class="clear-btn" (click)="tagSearchQuery.set('')">
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>
            </div>
            <div class="tags-container available-tags">
              @if (availableTagsFiltered().length === 0) {
                <span class="no-tags">Keine Tags gefunden</span>
              }
              @for (tag of availableTagsFiltered(); track tag.name) {
                <button
                  class="tag-chip"
                  [class.selected]="isTagSelected(tag.name)"
                  [style.--tag-color]="tag.color"
                  (click)="toggleTag(tag.name)"
                >
                  <span class="tag-dot"></span>
                  <span class="hash">#</span>{{ tag.name }}
                  @if (isTagSelected(tag.name)) {
                    <mat-icon class="check-icon">check</mat-icon>
                  }
                </button>
              }
            </div>
          </div>

          <!-- Quick Add Tag -->
          <div class="add-tag-section">
            <mat-form-field appearance="outline" class="tag-input">
              <mat-label>Neuer Tag</mat-label>
              <input
                matInput
                [(ngModel)]="newTagInput"
                (keydown.enter)="createAndAddTag()"
                placeholder="Tag eingeben und Enter druecken"
              />
            </mat-form-field>
            <button
              mat-icon-button
              class="add-btn"
              (click)="createAndAddTag()"
              [disabled]="!newTagInput.trim()"
              matTooltip="Tag hinzufuegen"
            >
              <mat-icon>add</mat-icon>
            </button>
          </div>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Schliessen</button>
      @if (filteredSounds().length > 0) {
        <button
          mat-stroked-button
          (click)="goPrevious()"
          [disabled]="currentIndex() === 0 || saving()"
        >
          <mat-icon>chevron_left</mat-icon>
          Zurueck
        </button>
        <button
          mat-stroked-button
          (click)="skip()"
          [disabled]="currentIndex() >= filteredSounds().length - 1"
          matTooltip="Ohne Speichern weiter"
        >
          Ueberspringen
        </button>
        @if (saving()) {
          <button mat-raised-button color="primary" disabled>
            <mat-spinner diameter="20"></mat-spinner>
          </button>
        } @else if (isLastSound()) {
          <button mat-raised-button color="primary" (click)="goNext()">
            Fertig
            <mat-icon>check</mat-icon>
          </button>
        } @else {
          <button mat-raised-button color="primary" (click)="goNext()">
            Weiter
            <mat-icon>chevron_right</mat-icon>
          </button>
        }
      }
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
      min-width: 700px;
      min-height: 400px;
      max-height: 70vh;
      overflow-y: auto;
    }

    .loading-container,
    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 48px 0;
      color: rgba(255, 255, 255, 0.7);
    }

    .empty-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #22c55e;
    }

    .filter-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
    }

    .sound-count {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
    }

    .progress-section {
      margin-bottom: 20px;
    }

    .progress-text {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 6px;
    }

    .progress-percent {
      color: #9333ea;
      font-weight: 600;
    }

    .sound-info {
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(236, 72, 153, 0.05) 100%);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .sound-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .sound-name {
      font-size: 18px;
      font-weight: 600;
      color: white;
    }

    .play-btn {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      width: 40px !important;
      height: 40px !important;
    }

    .play-btn mat-icon {
      color: white;
    }

    .sound-meta {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
    }

    .meta-item mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .tags-section {
      margin-bottom: 16px;
    }

    .tags-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      gap: 12px;
    }

    .tags-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .tag-search {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 6px;
      padding: 4px 8px;
      flex: 1;
      max-width: 280px;
      transition: all 0.2s ease;
    }

    .tag-search:focus-within {
      border-color: rgba(147, 51, 234, 0.6);
      box-shadow: 0 0 8px rgba(147, 51, 234, 0.2);
    }

    .tag-search .search-icon {
      color: rgba(255, 255, 255, 0.4);
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 6px;
    }

    .tag-search .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: white;
      font-size: 12px;
      min-width: 0;
    }

    .tag-search .search-input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .tag-search .clear-btn {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
    }

    .tag-search .clear-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.4);
    }

    .tag-search .clear-btn:hover mat-icon {
      color: #ec4899;
    }

    .tag-count {
      color: #9333ea;
    }

    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 40px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
    }

    .current-tags {
      border: 1px dashed rgba(147, 51, 234, 0.3);
    }

    .available-tags {
      max-height: 220px;
      overflow-y: auto;
    }

    .no-tags {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.3);
      font-style: italic;
    }

    .tag-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(var(--tag-color-rgb, 147, 51, 234), 0.15);
      border: 1px solid rgba(var(--tag-color-rgb, 147, 51, 234), 0.3);
      border-radius: 16px;
      padding: 6px 12px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.9);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tag-chip:hover {
      background: rgba(var(--tag-color-rgb, 147, 51, 234), 0.25);
      border-color: rgba(var(--tag-color-rgb, 147, 51, 234), 0.5);
      transform: scale(1.02);
    }

    .tag-chip.selected {
      background: var(--tag-color, #9333ea);
      border-color: var(--tag-color, #9333ea);
      color: white;
    }

    .tag-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--tag-color, #9333ea);
      flex-shrink: 0;
    }

    .tag-chip.selected .tag-dot {
      background: white;
    }

    .hash {
      opacity: 0.6;
    }

    .check-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-left: 2px;
    }

    .add-tag-section {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }

    .tag-input {
      flex: 1;
    }

    .add-btn {
      background: rgba(147, 51, 234, 0.2) !important;
      border: 1px solid rgba(147, 51, 234, 0.4) !important;
    }

    .add-btn:hover:not([disabled]) {
      background: rgba(147, 51, 234, 0.3) !important;
    }

    .add-btn mat-icon {
      color: #9333ea;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      gap: 8px;
    }

    mat-dialog-actions button[mat-raised-button] {
      background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%) !important;
      border: none !important;
    }

    mat-dialog-actions button[mat-stroked-button] {
      border-color: rgba(147, 51, 234, 0.5) !important;
      color: rgba(255, 255, 255, 0.8);
    }

    mat-dialog-actions button mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* Progress Bar Styling */
    ::ng-deep .mat-mdc-progress-bar {
      height: 6px !important;
      border-radius: 3px;
    }

    ::ng-deep .mat-mdc-progress-bar .mdc-linear-progress__buffer-bar {
      background: rgba(147, 51, 234, 0.2) !important;
    }

    ::ng-deep .mat-mdc-progress-bar .mdc-linear-progress__bar-inner {
      border-color: #9333ea !important;
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

    /* Form Field Styling */
    ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    /* Scrollbar */
    .available-tags::-webkit-scrollbar {
      width: 6px;
    }

    .available-tags::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }

    .available-tags::-webkit-scrollbar-thumb {
      background: rgba(147, 51, 234, 0.4);
      border-radius: 3px;
    }

    .available-tags::-webkit-scrollbar-thumb:hover {
      background: rgba(147, 51, 234, 0.6);
    }
  `,
})
export class TagWizardDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<TagWizardDialogComponent>);
  private readonly soundService = inject(SoundService);

  // State
  readonly allSounds = signal<Sound[]>([]);
  readonly filteredSounds = signal<Sound[]>([]);
  readonly currentIndex = signal(0);
  readonly availableTags = signal<Tag[]>([]);
  readonly currentTags = signal<string[]>([]);
  readonly showOnlyUntagged = signal(true);
  readonly loading = signal(true);
  readonly saving = signal(false);

  newTagInput = '';
  readonly tagSearchQuery = signal('');

  // Computed
  readonly currentSound = computed(() => this.filteredSounds()[this.currentIndex()]);

  readonly progressPercent = computed(() => {
    const total = this.filteredSounds().length;
    if (total === 0) return 0;
    return Math.round(((this.currentIndex() + 1) / total) * 100);
  });

  readonly isLastSound = computed(() =>
    this.currentIndex() >= this.filteredSounds().length - 1
  );

  readonly availableTagsFiltered = computed(() => {
    const current = this.currentTags();
    const search = this.tagSearchQuery().toLowerCase().trim();
    let tags = this.availableTags().filter(t => !current.includes(t.name));
    if (search) {
      tags = tags.filter(t => t.name.toLowerCase().includes(search));
    }
    // Sort alphabetically
    return tags.sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);

    try {
      // Load sounds and tags in parallel
      const [, tags] = await Promise.all([
        firstValueFrom(this.soundService.loadAllSounds()),
        firstValueFrom(this.soundService.loadTags()),
      ]);

      this.allSounds.set(this.soundService.sounds());
      this.availableTags.set(tags);
      this.applyFilter();
      this.loadCurrentSoundTags();

      // Auto-play first sound
      this.playCurrentSound();
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  private applyFilter(): void {
    let sounds = [...this.allSounds()];

    if (this.showOnlyUntagged()) {
      sounds = sounds.filter(s => !s.tags || s.tags.length === 0);
    }

    // Sort alphabetically
    sounds.sort((a, b) => a.name.localeCompare(b.name));

    this.filteredSounds.set(sounds);
    this.currentIndex.set(0);
    this.loadCurrentSoundTags();
  }

  onFilterChange(untaggedOnly: boolean): void {
    this.showOnlyUntagged.set(untaggedOnly);
    this.applyFilter();
  }

  private loadCurrentSoundTags(): void {
    const sound = this.currentSound();
    if (sound) {
      this.currentTags.set([...(sound.tags || [])]);
    } else {
      this.currentTags.set([]);
    }
    // Reset tag search when switching sounds
    this.tagSearchQuery.set('');
  }

  playCurrentSound(): void {
    const sound = this.currentSound();
    if (sound) {
      // Stop all sounds first, then play new one
      this.soundService.killAll().subscribe({
        complete: () => {
          this.soundService.playSound(sound.hash).subscribe();
        },
        error: () => {
          // Play anyway even if killAll fails
          this.soundService.playSound(sound.hash).subscribe();
        },
      });
    }
  }

  toggleTag(tagName: string): void {
    this.currentTags.update(tags => {
      if (tags.includes(tagName)) {
        return tags.filter(t => t !== tagName);
      } else {
        return [...tags, tagName];
      }
    });
  }

  isTagSelected(tagName: string): boolean {
    return this.currentTags().includes(tagName);
  }

  getTagColor(tagName: string): string {
    const tag = this.availableTags().find(t => t.name === tagName);
    return tag?.color || '#9333ea';
  }

  async createAndAddTag(): Promise<void> {
    const name = this.newTagInput.trim().toLowerCase();
    if (!name) return;

    // Check if already exists
    const exists = this.availableTags().some(t => t.name === name);

    if (exists) {
      // Just add to current sound
      if (!this.currentTags().includes(name)) {
        this.currentTags.update(tags => [...tags, name]);
      }
    } else {
      // Create new tag via API
      try {
        const newTag = await firstValueFrom(this.soundService.createTag(name));
        this.availableTags.update(tags => [...tags, newTag]);
        this.currentTags.update(tags => [...tags, name]);
      } catch (error) {
        console.error('Failed to create tag:', error);
      }
    }

    this.newTagInput = '';
  }

  async goNext(): Promise<void> {
    await this.saveCurrentTags();

    if (this.isLastSound()) {
      // Close dialog when done
      this.dialogRef.close(true);
    } else {
      this.currentIndex.update(i => i + 1);
      this.loadCurrentSoundTags();
      this.playCurrentSound();
    }
  }

  async goPrevious(): Promise<void> {
    await this.saveCurrentTags();

    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
      this.loadCurrentSoundTags();
      this.playCurrentSound();
    }
  }

  skip(): void {
    if (!this.isLastSound()) {
      this.currentIndex.update(i => i + 1);
      this.loadCurrentSoundTags();
      this.playCurrentSound();
    }
  }

  private async saveCurrentTags(): Promise<void> {
    const sound = this.currentSound();
    if (!sound) return;

    // Check if tags changed
    const originalTags = sound.tags || [];
    const currentTags = this.currentTags();

    const tagsChanged =
      originalTags.length !== currentTags.length ||
      !originalTags.every(t => currentTags.includes(t));

    if (!tagsChanged) return;

    this.saving.set(true);

    try {
      await firstValueFrom(
        this.soundService.updateSound(sound.hash, { tags: currentTags })
      );

      // Update local state - both allSounds and filteredSounds
      const updateFn = (sounds: Sound[]) =>
        sounds.map(s =>
          s.hash === sound.hash ? { ...s, tags: [...currentTags] } : s
        );

      this.allSounds.update(updateFn);
      this.filteredSounds.update(updateFn);
    } catch (error) {
      console.error('Failed to save tags:', error);
    } finally {
      this.saving.set(false);
    }
  }

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  }
}
