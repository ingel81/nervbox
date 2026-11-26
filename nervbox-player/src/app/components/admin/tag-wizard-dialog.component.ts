import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
import { tagToneStyle } from '../../shared/tag-tone';

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
    <div class="nk-dlg wz">
      <header class="nk-dialog__head">
        <mat-icon class="wz-ico" aria-hidden="true">auto_fix_high</mat-icon>
        <h2 class="nk-dialog__title">Tag-Wizard</h2>
        <button type="button" class="nk-key nk-key--sm nk-key--icon" aria-label="Schließen" mat-dialog-close>✕</button>
      </header>
      <div class="nk-dialog__body wz-body">
        @if (loading()) {
          <div class="wz-state"><span class="nk-spin" aria-hidden="true"></span>Sounds werden geladen...</div>
        } @else if (filteredSounds().length === 0) {
          <div class="wz-state wz-state--col">
            <span class="nk-empty__title">{{ showOnlyUntagged() ? 'Alle Sounds sind getaggt!' : 'Keine Sounds vorhanden.' }}</span>
            @if (showOnlyUntagged()) {
              <button type="button" class="nk-key" (click)="showOnlyUntagged.set(false)">Alle Sounds anzeigen</button>
            }
          </div>
        } @else {
          <div class="wz-line">
            <span class="wz-switch">
              <button type="button" role="switch" [attr.aria-checked]="showOnlyUntagged()" [class]="showOnlyUntagged() ? 'nk-switch nk-switch--on' : 'nk-switch'" aria-label="Nur ungetaggte Sounds" (click)="onFilterChange(!showOnlyUntagged())"><span class="nk-switch__knob" aria-hidden="true"></span></button>
              Nur ungetaggte Sounds
            </span>
            <span class="nk-counter">{{ filteredSounds().length }} SOUNDS</span>
            <span class="wz-flex"></span>
            <span class="nk-row__meta wz-pos">{{ currentIndex() + 1 }} von {{ filteredSounds().length }}</span>
            <span class="nk-row__num">{{ progressPercent() }}%</span>
          </div>
          <span class="nk-progress nk-progress--lamp" role="progressbar" [attr.aria-valuenow]="progressPercent()"><span class="nk-progress__fill" [style.width.%]="progressPercent()"></span></span>

          @if (currentSound(); as sound) {
            <div class="wz-card">
              <button type="button" class="nk-key nk-key--round wz-play" aria-label="Sound abspielen" matTooltip="Sound abspielen" (click)="playCurrentSound()"><mat-icon>play_arrow</mat-icon></button>
              <span class="wz-meta">
                <span class="wz-name">{{ sound.name }}</span>
                <span class="nk-row__meta">{{ formatDuration(sound.durationMs) }} · {{ sound.fileName }}</span>
              </span>
            </div>

            <div class="nk-section">
              <h3 class="nk-section__title">Aktuelle Tags @if (currentTags().length > 0) { <span class="nk-section__aside">({{ currentTags().length }})</span> }</h3>
              <div class="wz-chips">
                @if (currentTags().length === 0) {
                  <span class="wz-none">Noch keine Tags vergeben</span>
                }
                @for (tag of currentTags(); track tag) {
                  <button type="button" class="nk-tag nk-tag--selected" [style]="tone(tag)" aria-pressed="true" [attr.aria-label]="'#' + tag + ' entfernen'" (click)="toggleTag(tag)">
                    <span class="nk-tag__lens" aria-hidden="true"></span>#{{ tag }} <span aria-hidden="true">✓</span>
                  </button>
                }
              </div>
            </div>

            <div class="nk-section">
              <h3 class="nk-section__title">Verfügbare Tags</h3>
              <label class="nk-input nk-input--sm wz-search">
                <svg class="nk-input__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
                <input class="nk-input__field" placeholder="Tags suchen..." aria-label="Tags suchen" [value]="tagSearchQuery()" (input)="tagSearchQuery.set($any($event.target).value)" />
                @if (tagSearchQuery()) {
                  <button type="button" class="nk-input__clear" aria-label="Suche leeren" (click)="tagSearchQuery.set('')">✕</button>
                }
              </label>
              <div class="wz-chips">
                @if (availableTagsFiltered().length === 0) {
                  <span class="wz-none">Keine Tags gefunden</span>
                }
                @for (tag of availableTagsFiltered(); track tag.name) {
                  <button type="button" [class]="isTagSelected(tag.name) ? 'nk-tag nk-tag--selected' : 'nk-tag'" [style]="tone(tag.name)" [attr.aria-pressed]="isTagSelected(tag.name)" (click)="toggleTag(tag.name)">
                    <span class="nk-tag__lens" aria-hidden="true"></span>#{{ tag.name }}
                    @if (isTagSelected(tag.name)) {
                      <span aria-hidden="true">✓</span>
                    }
                  </button>
                }
              </div>
            </div>

            <div class="nk-section">
              <h3 class="nk-section__title">Neuer Tag</h3>
              <div class="wz-line">
                <label class="nk-input wz-grow"><input class="nk-input__field" [(ngModel)]="newTagInput" (keydown.enter)="createAndAddTag()" placeholder="Tag eingeben und Enter drücken" aria-label="Neuer Tag" /></label>
                <button type="button" class="nk-key nk-key--icon" aria-label="Tag hinzufügen" matTooltip="Tag hinzufügen" [disabled]="!newTagInput.trim()" (click)="createAndAddTag()"><mat-icon>add</mat-icon></button>
              </div>
            </div>
          }
        }
      </div>
      <footer class="nk-dialog__foot wz-foot">
        <button type="button" class="nk-key nk-key--ghost" mat-dialog-close>Schließen</button>
        <span class="wz-flex"></span>
        @if (filteredSounds().length > 0) {
          <button type="button" class="nk-key" [disabled]="currentIndex() === 0 || saving()" (click)="goPrevious()">‹ Zurück</button>
          <button type="button" class="nk-key" matTooltip="Ohne Speichern weiter" [disabled]="currentIndex() >= filteredSounds().length - 1" (click)="skip()">Überspringen</button>
          <button type="button" class="nk-key nk-key--accent" [disabled]="saving()" (click)="goNext()">
            @if (saving()) {
              <span class="nk-spin" aria-hidden="true"></span>
            } @else if (isLastSound()) {
              Fertig ✓
            } @else {
              Weiter ›
            }
          </button>
        }
      </footer>
    </div>
  `,
  styles: `
    .wz {
      width: 720px;
      max-width: 100%;
      max-height: 92vh;
    }
    .wz-ico {
      color: var(--nk-iv);
      filter: drop-shadow(0 0 4px rgb(255 226 176 / 0.6));
    }
    .wz-body {
      gap: 14px;
      overflow-y: auto;
    }
    .wz-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 24px 8px;
      color: var(--nk-iv-2);
      font: 500 13px var(--nk-font-mono);
    }
    .wz-state--col {
      flex-direction: column;
      align-items: flex-start;
    }
    .wz-line {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 3px;
    }
    .wz-flex {
      flex: 1;
    }
    .wz-grow {
      flex: 1;
      min-width: 0;
    }
    .wz-switch {
      display: flex;
      align-items: center;
      gap: 12px;
      font: 600 15px var(--nk-font-ui);
    }
    .wz-pos {
      color: var(--nk-iv);
    }
    .wz-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 18px;
      border-radius: 10px;
      background: var(--nk-face-glare), var(--nk-face-glass);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(255 226 176 / 0.3), 0 0 20px rgb(255 226 176 / 0.1);
    }
    .wz-play {
      background: radial-gradient(circle at 50% 58%, #96f7b9 0%, #4be585 48%, #1f8e4c 100%);
      color: #0b1712;
    }
    .wz-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .wz-name {
      font: 800 36px/1 var(--nk-font-ui);
      letter-spacing: 0.5px;
      color: #ffffff;
      text-shadow: 0 0 14px rgb(255 226 176 / 0.5);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wz-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 3px;
    }
    .wz-chips .nk-tag {
      height: 26px;
      font-size: 13.5px;
    }
    .wz-none {
      font: 500 12px var(--nk-font-mono);
      color: var(--nk-iv-2);
    }
    .wz-search {
      width: 260px;
      margin: 2px 3px;
    }
    .wz-foot {
      gap: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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

  readonly isLastSound = computed(() => this.currentIndex() >= this.filteredSounds().length - 1);

  readonly availableTagsFiltered = computed(() => {
    const current = this.currentTags();
    const search = this.tagSearchQuery().toLowerCase().trim();
    let tags = this.availableTags().filter((t) => !current.includes(t.name));
    if (search) {
      tags = tags.filter((t) => t.name.toLowerCase().includes(search));
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
      sounds = sounds.filter((s) => !s.tags || s.tags.length === 0);
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
    this.currentTags.update((tags) => {
      if (tags.includes(tagName)) {
        return tags.filter((t) => t !== tagName);
      } else {
        return [...tags, tagName];
      }
    });
  }

  isTagSelected(tagName: string): boolean {
    return this.currentTags().includes(tagName);
  }

  tone(tagName: string): string {
    return tagToneStyle(this.getTagColor(tagName));
  }

  getTagColor(tagName: string): string {
    const tag = this.availableTags().find((t) => t.name === tagName);
    return tag?.color || '#9333ea';
  }

  async createAndAddTag(): Promise<void> {
    const name = this.newTagInput.trim().toLowerCase();
    if (!name) return;

    // Check if already exists
    const exists = this.availableTags().some((t) => t.name === name);

    if (exists) {
      // Just add to current sound
      if (!this.currentTags().includes(name)) {
        this.currentTags.update((tags) => [...tags, name]);
      }
    } else {
      // Create new tag via API
      try {
        const newTag = await firstValueFrom(this.soundService.createTag(name));
        this.availableTags.update((tags) => [...tags, newTag]);
        this.currentTags.update((tags) => [...tags, name]);
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
      this.currentIndex.update((i) => i + 1);
      this.loadCurrentSoundTags();
      this.playCurrentSound();
    }
  }

  async goPrevious(): Promise<void> {
    await this.saveCurrentTags();

    if (this.currentIndex() > 0) {
      this.currentIndex.update((i) => i - 1);
      this.loadCurrentSoundTags();
      this.playCurrentSound();
    }
  }

  skip(): void {
    if (!this.isLastSound()) {
      this.currentIndex.update((i) => i + 1);
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
      !originalTags.every((t) => currentTags.includes(t));

    if (!tagsChanged) return;

    this.saving.set(true);

    try {
      await firstValueFrom(this.soundService.updateSound(sound.hash, { tags: currentTags }));

      // Update local state - both allSounds and filteredSounds
      const updateFn = (sounds: Sound[]) =>
        sounds.map((s) => (s.hash === sound.hash ? { ...s, tags: [...currentTags] } : s));

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
