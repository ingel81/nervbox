import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  /** Selection-Modus aktiv/inaktiv */
  readonly selectionMode = signal(false);

  /** Set von ausgewählten Sound-Hashes */
  private readonly _selectedHashes = signal<Set<string>>(new Set());

  /** Array der ausgewählten Hashes */
  readonly selectedSounds = computed(() => Array.from(this._selectedHashes()));

  /** Anzahl ausgewählter Sounds */
  readonly selectionCount = computed(() => this._selectedHashes().size);

  /** Gibt es eine Auswahl? */
  readonly hasSelection = computed(() => this._selectedHashes().size > 0);

  /** Selection-Modus umschalten */
  toggleSelectionMode(): void {
    const newMode = !this.selectionMode();
    this.selectionMode.set(newMode);
    if (!newMode) {
      this.clearSelection();
    }
  }

  /** Sound zur Auswahl hinzufügen/entfernen (toggle) */
  toggleSelection(hash: string): void {
    this._selectedHashes.update(set => {
      const newSet = new Set(set);
      if (newSet.has(hash)) {
        newSet.delete(hash);
      } else {
        newSet.add(hash);
      }
      return newSet;
    });
  }

  /** Prüfen ob Sound ausgewählt ist */
  isSelected(hash: string): boolean {
    return this._selectedHashes().has(hash);
  }

  /** Alle Auswahlen löschen */
  clearSelection(): void {
    this._selectedHashes.set(new Set());
  }

  /** Auswahl im Mixer öffnen */
  openInMixer(): void {
    const hashes = this.selectedSounds().join(',');
    if (hashes) {
      window.open(`/mixer?sounds=${hashes}`, '_blank');
      // Nach Öffnen: Selection-Mode beenden
      this.selectionMode.set(false);
      this.clearSelection();
    }
  }
}
