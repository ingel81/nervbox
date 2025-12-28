import { WaveConfig, getWaveConfig } from '../../kayberg.types';

export class WaveManager {
  private currentLevel: number = 1;
  private currentConfig: WaveConfig;

  private preyCaught: number = 0;
  private score: number = 0;

  // Callbacks
  onWaveComplete?: () => void;
  onWaveProgress?: (caught: number, required: number) => void;
  onScoreChange?: (score: number) => void;

  constructor() {
    this.currentConfig = getWaveConfig(1);
  }

  getConfig(): WaveConfig {
    return this.currentConfig;
  }

  getLevel(): number {
    return this.currentLevel;
  }

  getPreyCaught(): number {
    return this.preyCaught;
  }

  getPreyRequired(): number {
    return this.currentConfig.preyToKill;
  }

  getScore(): number {
    return this.score;
  }

  setLevel(level: number): void {
    this.currentLevel = level;
    this.currentConfig = getWaveConfig(level);
    this.preyCaught = 0;
    this.onWaveProgress?.(this.preyCaught, this.currentConfig.preyToKill);
  }

  addScore(points: number): void {
    this.score += points;
    this.onScoreChange?.(this.score);
  }

  recordPreyCaught(points: number): void {
    this.preyCaught++;
    this.addScore(points);
    this.onWaveProgress?.(this.preyCaught, this.currentConfig.preyToKill);

    if (this.preyCaught >= this.currentConfig.preyToKill) {
      this.onWaveComplete?.();
    }
  }

  isWaveComplete(): boolean {
    return this.preyCaught >= this.currentConfig.preyToKill;
  }

  nextLevel(): void {
    this.currentLevel++;
    this.setLevel(this.currentLevel);
  }

  reset(): void {
    this.currentLevel = 1;
    this.preyCaught = 0;
    this.score = 0;
    this.currentConfig = getWaveConfig(1);
    this.onScoreChange?.(0);
    this.onWaveProgress?.(0, this.currentConfig.preyToKill);
  }

  // Calculate reward for completing a level
  calculateReward(): number {
    return this.currentLevel * 50;
  }
}
