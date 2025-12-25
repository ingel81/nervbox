import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EnemyTypeConfig, EnemyTypeId } from '../models/enemy-types';

@Component({
  selector: 'app-td-debug-panel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
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
          <input type="range" min="1" max="20" step="1"
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
        <div class="section-title">Anzeige</div>
        <div class="btn-row">
          <button class="icon-btn" [class.active]="streetsVisible()" (click)="toggleStreets.emit()" title="Strassen">
            <mat-icon>route</mat-icon>
          </button>
          <button class="icon-btn" [class.active]="routesVisible()" (click)="toggleRoutes.emit()" title="Routen">
            <mat-icon>timeline</mat-icon>
          </button>
          <button class="icon-btn danger" [disabled]="!waveActive()" (click)="killAll.emit()" title="Alle töten">
            <mat-icon>skull</mat-icon>
          </button>
        </div>
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
    .debug-panel {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 280px;
      background: rgba(0, 0, 0, 0.92);
      border: 1px solid rgba(34, 197, 94, 0.4);
      border-radius: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      z-index: 5;
      overflow: hidden;
    }

    .section {
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .section:last-child {
      border-bottom: none;
    }

    .section-title {
      font-size: 9px;
      font-weight: 600;
      color: #9333ea;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .label {
      color: rgba(255, 255, 255, 0.6);
    }

    .value {
      color: #22c55e;
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
      accent-color: #22c55e;
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
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.7);
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
      background: rgba(255, 255, 255, 0.1);
    }

    .toggle-btn.active {
      background: rgba(34, 197, 94, 0.2);
      border-color: #22c55e;
      color: #22c55e;
    }

    .type-buttons {
      display: flex;
      gap: 4px;
      flex: 1;
    }

    .type-btn {
      flex: 1;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.7);
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .type-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .type-btn.active {
      background: rgba(147, 51, 234, 0.3);
      border-color: #9333ea;
      color: #9333ea;
    }

    .btn-row {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .icon-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .icon-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
    }

    .icon-btn.active {
      background: rgba(34, 197, 94, 0.2);
      border-color: #22c55e;
      color: #22c55e;
    }

    .icon-btn.danger {
      border-color: rgba(239, 68, 68, 0.4);
      color: #ef4444;
    }

    .icon-btn.danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.2);
    }

    .icon-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .log-section {
      padding: 6px 10px 10px;
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
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      transition: color 0.15s ease;
    }

    .clear-btn:hover {
      color: #ef4444;
    }

    .clear-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .log {
      width: 100%;
      height: 80px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 4px;
      color: #22c55e;
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
  streetsVisible = input.required<boolean>();
  routesVisible = input.required<boolean>();
  waveActive = input.required<boolean>();
  debugLog = input.required<string>();

  // Outputs
  enemyCountChange = output<number>();
  enemySpeedChange = output<number>();
  enemyTypeChange = output<EnemyTypeId>();
  toggleSpawnMode = output<void>();
  toggleStreets = output<void>();
  toggleRoutes = output<void>();
  killAll = output<void>();
  clearLog = output<void>();

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
}
