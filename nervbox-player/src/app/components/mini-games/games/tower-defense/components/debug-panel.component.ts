import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EnemyTypeConfig, EnemyTypeId } from '../models/enemy-types';
import { AddressAutocompleteComponent } from './address-autocomplete.component';
import { TD_CSS_VARS } from '../styles/td-theme';

export interface LocationConfig {
  lat: number;
  lon: number;
  name?: string;
}

export interface SpawnLocationConfig extends LocationConfig {
  id: string;
}

@Component({
  selector: 'app-td-debug-panel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, AddressAutocompleteComponent],
  template: `
    <div class="debug-panel">
      <div class="section">
        <div class="row">
          <span class="label">Strassen</span>
          <span class="value">{{ streetCount() }}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Spawn</div>
        <div class="toggle-row">
          <span class="label">Typ</span>
          <div class="type-buttons">
            @for (type of enemyTypes(); track type.id) {
              <button
                class="type-btn"
                [class.active]="enemyType() === type.id"
                (click)="onEnemyTypeChange(type.id)"
                [title]="type.name"
              >
                {{ type.name }}
              </button>
            }
          </div>
        </div>
        <div class="slider-row">
          <span class="label">Anzahl</span>
          <input type="range" min="1" max="1000" step="1"
                 [value]="enemyCount()"
                 (input)="onEnemyCountChange($event)" />
          <span class="value">{{ enemyCount() }}</span>
        </div>
        <div class="slider-row">
          <span class="label">Speed</span>
          <input type="range" min="1" max="50" step="1"
                 [value]="enemySpeed()"
                 (input)="onSpeedChange($event)" />
          <span class="value">{{ enemySpeed() }}m/s</span>
        </div>
        <div class="toggle-row">
          <span class="label">Modus</span>
          <button class="toggle-btn" [class.active]="spawnMode() === 'each'" (click)="toggleSpawnMode.emit()">
            <mat-icon>{{ spawnMode() === 'each' ? 'call_split' : 'shuffle' }}</mat-icon>
            {{ spawnMode() === 'each' ? 'Pro Spawn' : 'Zufällig' }}
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Aktionen</div>
        <div class="btn-row">
          <button class="icon-btn" (click)="logCamera.emit()" title="Kamera loggen">
            <mat-icon>videocam</mat-icon>
          </button>
          <button class="icon-btn heal" [disabled]="baseHealth() >= 100" (click)="healHq.emit()" title="HQ heilen">
            <mat-icon>healing</mat-icon>
          </button>
          <button class="icon-btn danger" [disabled]="!waveActive()" (click)="killAll.emit()" title="Alle töten">
            <mat-icon>skull</mat-icon>
          </button>
        </div>
      </div>

      <!-- Location Section - Simplified -->
      <div class="section location-section">
        <div class="section-header">
          <span class="section-title">Spielort</span>
          @if (isApplying()) {
            <mat-spinner diameter="12"></mat-spinner>
          }
        </div>

        <!-- Current Location Display -->
        <div class="current-location">
          <mat-icon>place</mat-icon>
          <span class="location-name">{{ getCurrentLocationName() }}</span>
        </div>

        <!-- Change Location Button -->
        @if (!editMode()) {
          <button class="change-location-btn" (click)="enterEditMode()">
            <mat-icon>edit_location</mat-icon>
            Ort ändern
          </button>
        }

        <!-- Edit Mode -->
        @if (editMode()) {
          <div class="edit-mode">
            <div class="edit-section">
              <div class="edit-label">
                <mat-icon>home</mat-icon>
                HQ (Ziel)
              </div>
              <app-td-address-autocomplete
                placeholder="Adresse eingeben..."
                [currentValue]="pendingHq()"
                (locationSelected)="onPendingHqChange($event)"
                (locationCleared)="onPendingHqClear()"
              />
            </div>

            <div class="edit-section">
              <div class="edit-label">
                <mat-icon>my_location</mat-icon>
                Spawn (Start)
              </div>
              <app-td-address-autocomplete
                placeholder="Adresse eingeben..."
                [currentValue]="pendingSpawn()"
                (locationSelected)="onPendingSpawnChange($event)"
                (locationCleared)="onPendingSpawnClear()"
              />
              <div class="spawn-hint">Gegner starten hier und laufen zum HQ</div>
            </div>

            <div class="edit-actions">
              <button
                class="apply-btn"
                [disabled]="!canApplyPending() || isApplying()"
                (click)="applyPending()"
              >
                @if (isApplying()) {
                  <mat-spinner diameter="12"></mat-spinner>
                } @else {
                  <mat-icon>check</mat-icon>
                }
                Laden
              </button>
              <button class="cancel-btn" (click)="cancelEdit()">
                <mat-icon>close</mat-icon>
                Abbrechen
              </button>
            </div>
          </div>
        }

        <!-- Reset to Default -->
        @if (!editMode() && !isDefaultLocation()) {
          <button class="reset-btn" (click)="resetLocations.emit()">
            <mat-icon>restart_alt</mat-icon>
            Zurück zu Erlenbach
          </button>
        }
      </div>

      <div class="section log-section">
        <div class="log-header">
          <span class="section-title">Log</span>
          <button class="clear-btn" (click)="clearLog.emit()">
            <mat-icon>delete</mat-icon>
          </button>
        </div>
        <textarea class="log" readonly [value]="debugLog()"></textarea>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      ${TD_CSS_VARS}
    }

    .debug-panel {
      height: 100%;
      display: flex;
      flex-direction: column;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      overflow-y: auto;
    }

    .section {
      padding: 8px;
      border-bottom: 1px solid var(--td-frame-dark);
    }

    .section:last-child {
      border-bottom: none;
    }

    .section-title {
      font-size: 9px;
      font-weight: 600;
      color: var(--td-gold);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .section-header .section-title {
      margin-bottom: 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .label {
      color: var(--td-text-muted);
    }

    .value {
      color: var(--td-teal);
      font-weight: 600;
      min-width: 36px;
      text-align: right;
    }

    .slider-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    .slider-row:last-of-type {
      margin-bottom: 0;
    }

    .slider-row .label {
      width: 50px;
      flex-shrink: 0;
    }

    .slider-row input[type="range"] {
      flex: 1;
      height: 4px;
      accent-color: var(--td-teal);
      cursor: pointer;
    }

    .slider-row .value {
      min-width: 50px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }

    .toggle-row .label {
      width: 50px;
      flex-shrink: 0;
    }

    .toggle-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      font-size: 9px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .toggle-btn mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
    }

    .toggle-btn:hover {
      background: var(--td-frame-mid);
    }

    .toggle-btn.active {
      background: var(--td-teal);
      color: var(--td-bg-dark);
    }

    .type-buttons {
      display: flex;
      gap: 4px;
      flex: 1;
    }

    .type-btn {
      flex: 1;
      padding: 4px 6px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      color: var(--td-text-secondary);
      font-family: inherit;
      font-size: 9px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .type-btn:hover {
      background: var(--td-frame-mid);
    }

    .type-btn.active {
      background: var(--td-gold-dark);
      border-color: var(--td-gold);
      color: var(--td-text-primary);
    }

    .btn-row {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      border-top-color: var(--td-frame-light);
      border-bottom-color: var(--td-frame-dark);
      color: var(--td-text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .icon-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .icon-btn:hover:not(:disabled) {
      background: var(--td-frame-mid);
      color: var(--td-text-primary);
    }

    .icon-btn.active {
      background: var(--td-teal);
      color: var(--td-bg-dark);
    }

    .icon-btn.danger {
      border-color: var(--td-health-red);
      color: var(--td-health-red);
    }

    .icon-btn.danger:hover:not(:disabled) {
      background: var(--td-health-red);
      color: var(--td-text-primary);
    }

    .icon-btn.heal {
      border-color: var(--td-green);
      color: var(--td-green);
    }

    .icon-btn.heal:hover:not(:disabled) {
      background: var(--td-green);
      color: var(--td-bg-dark);
    }

    .icon-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    /* Location Section */
    .current-location {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      margin-bottom: 6px;
    }

    .current-location mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--td-teal);
    }

    .location-name {
      color: var(--td-teal);
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .change-location-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-gold-dark);
      color: var(--td-gold);
      font-family: inherit;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .change-location-btn:hover {
      background: var(--td-gold-dark);
      color: var(--td-bg-dark);
    }

    .change-location-btn mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
    }

    .edit-mode {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .edit-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .edit-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      color: var(--td-text-muted);
      font-weight: 500;
    }

    .edit-label mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
      color: var(--td-gold);
    }

    .spawn-hint {
      font-size: 8px;
      color: var(--td-text-disabled);
      font-style: italic;
    }

    .edit-actions {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }

    .apply-btn {
      flex: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 10px;
      background: var(--td-green);
      border: none;
      border-bottom: 2px solid #6aab6c;
      color: var(--td-bg-dark);
      font-family: inherit;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .apply-btn:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    .apply-btn:disabled {
      background: var(--td-disabled);
      color: var(--td-text-disabled);
      cursor: not-allowed;
    }

    .apply-btn mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
    }

    .cancel-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px;
      background: var(--td-panel-secondary);
      border: 1px solid var(--td-frame-mid);
      color: var(--td-text-secondary);
      font-family: inherit;
      font-size: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .cancel-btn:hover {
      background: var(--td-health-red);
      border-color: var(--td-health-red);
      color: var(--td-text-primary);
    }

    .cancel-btn mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
    }

    .reset-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 4px;
      background: transparent;
      border: 1px dashed var(--td-frame-mid);
      color: var(--td-text-muted);
      font-family: inherit;
      font-size: 9px;
      cursor: pointer;
      transition: all 0.15s ease;
      margin-top: 4px;
    }

    .reset-btn:hover {
      border-color: var(--td-text-secondary);
      color: var(--td-text-secondary);
    }

    .reset-btn mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
    }

    .log-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 6px 8px 8px;
    }

    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .log-header .section-title {
      margin-bottom: 0;
    }

    .clear-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      background: transparent;
      border: none;
      color: var(--td-text-muted);
      cursor: pointer;
      transition: color 0.15s ease;
    }

    .clear-btn:hover {
      color: var(--td-health-red);
    }

    .clear-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .log {
      flex: 1;
      width: 100%;
      min-height: 60px;
      background: var(--td-panel-shadow);
      border: 1px solid var(--td-frame-dark);
      border-top-color: var(--td-frame-mid);
      color: var(--td-green);
      font-family: inherit;
      font-size: 8px;
      padding: 4px 6px;
      resize: none;
      white-space: pre;
      overflow-x: scroll;
      overflow-y: auto;
      word-wrap: normal;
      box-sizing: border-box;
    }
  `,
})
export class DebugPanelComponent {
  // Inputs
  streetCount = input.required<number>();
  enemyCount = input.required<number>();
  enemySpeed = input.required<number>();
  enemyType = input.required<EnemyTypeId>();
  enemyTypes = input.required<EnemyTypeConfig[]>();
  spawnMode = input.required<'each' | 'random'>();
  waveActive = input.required<boolean>();
  baseHealth = input.required<number>();
  debugLog = input.required<string>();

  // Location inputs
  hqLocation = input<LocationConfig | null>(null);
  spawnLocations = input<SpawnLocationConfig[]>([]);
  isApplying = input<boolean>(false);

  // Outputs
  enemyCountChange = output<number>();
  enemySpeedChange = output<number>();
  enemyTypeChange = output<EnemyTypeId>();
  toggleSpawnMode = output<void>();
  killAll = output<void>();
  healHq = output<void>();
  clearLog = output<void>();
  logCamera = output<void>();

  // Location outputs - simplified
  applyNewLocation = output<{ hq: LocationConfig; spawn: LocationConfig }>();
  resetLocations = output<void>();

  // Local state
  editMode = signal(false);
  pendingHq = signal<LocationConfig | null>(null);
  pendingSpawn = signal<LocationConfig | null>(null);

  onEnemyCountChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.enemyCountChange.emit(value);
  }

  onSpeedChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.enemySpeedChange.emit(value);
  }

  onEnemyTypeChange(typeId: EnemyTypeId): void {
    this.enemyTypeChange.emit(typeId);
  }

  getCurrentLocationName(): string {
    const hq = this.hqLocation();
    if (!hq?.name) return 'Erlenbach (Default)';
    // Get first part of address
    return hq.name.split(',')[0] || hq.name;
  }

  isDefaultLocation(): boolean {
    const hq = this.hqLocation();
    if (!hq) return true;
    // Check if it's roughly Erlenbach coordinates
    return Math.abs(hq.lat - 49.173) < 0.01 && Math.abs(hq.lon - 9.269) < 0.01;
  }

  enterEditMode(): void {
    // Pre-fill with current values
    const hq = this.hqLocation();
    const spawns = this.spawnLocations();

    this.pendingHq.set(hq ? { ...hq } : null);
    this.pendingSpawn.set(spawns.length > 0 ? { ...spawns[0] } : null);
    this.editMode.set(true);
  }

  cancelEdit(): void {
    this.editMode.set(false);
    this.pendingHq.set(null);
    this.pendingSpawn.set(null);
  }

  onPendingHqChange(location: { lat: number; lon: number; name: string }): void {
    this.pendingHq.set(location);
  }

  onPendingHqClear(): void {
    this.pendingHq.set(null);
  }

  onPendingSpawnChange(location: { lat: number; lon: number; name: string }): void {
    this.pendingSpawn.set(location);
  }

  onPendingSpawnClear(): void {
    this.pendingSpawn.set(null);
  }

  canApplyPending(): boolean {
    const hq = this.pendingHq();
    const spawn = this.pendingSpawn();
    return hq !== null && spawn !== null;
  }

  applyPending(): void {
    const hq = this.pendingHq();
    const spawn = this.pendingSpawn();

    if (!hq || !spawn) return;

    this.applyNewLocation.emit({ hq, spawn });
    this.editMode.set(false);
  }
}
