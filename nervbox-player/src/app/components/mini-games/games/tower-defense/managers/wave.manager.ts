import { Injectable, inject, signal } from '@angular/core';
import { EnemyManager } from './enemy.manager';
import { EnemyTypeId } from '../models/enemy-types';
import { GeoPosition } from '../models/game.types';

export type GamePhase = 'setup' | 'wave' | 'gameover';

export interface SpawnPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface WaveConfig {
  enemyCount: number;
  enemyType: EnemyTypeId;
  enemySpeed: number;
  spawnMode: 'each' | 'random';
}

/**
 * Manages wave spawning and game phases
 */
@Injectable()
export class WaveManager {
  private enemyManager = inject(EnemyManager);

  readonly phase = signal<GamePhase>('setup');
  readonly waveNumber = signal(0);
  readonly gatheringPhase = signal(false);

  private spawnPoints: SpawnPoint[] = [];
  private cachedPaths = new Map<string, GeoPosition[]>();

  initialize(spawnPoints: SpawnPoint[], cachedPaths: Map<string, GeoPosition[]>): void {
    this.spawnPoints = spawnPoints;
    this.cachedPaths = cachedPaths;
  }

  /**
   * Start a new wave
   */
  startWave(config: WaveConfig): void {
    this.waveNumber.update((n) => n + 1);
    this.phase.set('wave');
    this.gatheringPhase.set(true);

    // Phase 1: Spawn enemies (paused)
    let spawnedCount = 0;
    const spawnDelay = 100;

    const spawnNext = () => {
      if (spawnedCount >= config.enemyCount) {
        // Phase 2: Start enemies
        setTimeout(() => {
          this.gatheringPhase.set(false);
          this.enemyManager.startAll(300);
        }, 500);
        return;
      }

      const spawn = this.selectSpawnPoint(config.spawnMode, spawnedCount);
      const path = this.cachedPaths.get(spawn.id);

      if (path && path.length > 1) {
        this.enemyManager.spawn(path, config.enemyType, config.enemySpeed, true);
        spawnedCount++;
      }

      setTimeout(spawnNext, spawnDelay);
    };

    spawnNext();
  }

  /**
   * Select a spawn point based on mode
   */
  private selectSpawnPoint(mode: 'each' | 'random', index: number): SpawnPoint {
    if (mode === 'each') {
      return this.spawnPoints[index % this.spawnPoints.length];
    } else {
      return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    }
  }

  /**
   * Check if wave is complete (all enemies dead)
   */
  checkWaveComplete(): boolean {
    return this.enemyManager.getAliveCount() === 0 && this.phase() === 'wave';
  }

  /**
   * End the current wave
   */
  endWave(): void {
    this.enemyManager.clear();
    this.phase.set('setup');
  }

  /**
   * Reset wave manager
   */
  reset(): void {
    this.enemyManager.clear();
    this.phase.set('setup');
    this.waveNumber.set(0);
    this.gatheringPhase.set(false);
  }
}
