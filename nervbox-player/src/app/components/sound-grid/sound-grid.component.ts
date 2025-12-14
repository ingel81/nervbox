import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sound } from '../../core/models';
import { SoundCardComponent } from './sound-card.component';

@Component({
  selector: 'app-sound-grid',
  standalone: true,
  imports: [CommonModule, SoundCardComponent],
  template: `
    <div class="sound-grid-container nervbox-scrollbar">
      @if (filteredSounds().length === 0) {
        <div class="no-sounds">
          <span class="no-sounds-icon">🔇</span>
          <p>Keine Sounds gefunden</p>
          @if (searchQuery() || selectedTags().length > 0) {
            <p class="hint">Versuche andere Suchbegriffe oder Filter</p>
          }
        </div>
      } @else {
        <div class="sound-grid">
          @for (sound of filteredSounds(); track sound.hash) {
            <app-sound-card
              [sound]="sound"
              (playClick)="playSound.emit($event)"
            />
          }
        </div>
      }
    </div>
  `,
  styles: `
    .sound-grid-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .sound-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 6px;
    }

    .no-sounds {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      color: rgba(255, 255, 255, 0.5);
    }

    .no-sounds-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .no-sounds p {
      margin: 4px 0;
      font-size: 16px;
    }

    .no-sounds .hint {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.3);
    }

    @media (max-width: 600px) {
      .sound-grid {
        grid-template-columns: 1fr;
        gap: 4px;
      }

      .sound-grid-container {
        padding: 8px;
      }
    }
  `,
})
export class SoundGridComponent {
  readonly sounds = input<Sound[]>([]);
  readonly searchQuery = input<string>('');
  readonly selectedTags = input<string[]>([]);

  readonly playSound = output<Sound>();

  readonly filteredSounds = computed(() => {
    let result = this.sounds();
    const query = this.searchQuery().toLowerCase().trim();
    const tags = this.selectedTags();

    // Filter by search query
    if (query) {
      result = result.filter(
        sound =>
          sound.name.toLowerCase().includes(query) ||
          sound.fileName.toLowerCase().includes(query) ||
          sound.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by selected tags
    if (tags.length > 0) {
      result = result.filter(sound =>
        tags.some(tag => sound.tags?.includes(tag))
      );
    }

    return result;
  });
}
