import * as Cesium from 'cesium';
import { Component, ComponentType } from '../core/component';
import { GameObject } from '../core/game-object';
import { TransformComponent } from './transform.component';

export interface AudioConfig {
  volume?: number;
  loop?: boolean;
  spatial?: boolean; // Distance-based attenuation
  randomStart?: boolean; // Start at random position in audio
}

/**
 * AudioComponent manages sounds for a GameObject
 */
export class AudioComponent extends Component {
  private sounds = new Map<string, { url: string; config: AudioConfig }>();
  private activeSounds = new Map<string, HTMLAudioElement>();
  private viewer: Cesium.Viewer | null = null;

  constructor(gameObject: GameObject) {
    super(gameObject);
  }

  /**
   * Set the Cesium viewer for spatial audio
   */
  setViewer(viewer: Cesium.Viewer): void {
    this.viewer = viewer;
  }

  /**
   * Register a sound
   */
  registerSound(id: string, url: string, config: AudioConfig = {}): void {
    this.sounds.set(id, { url, config });
  }

  /**
   * Play a registered sound
   */
  play(id: string, loop?: boolean): void {
    const sound = this.sounds.get(id);
    if (!sound) {
      console.warn(`Sound '${id}' not registered on ${this.gameObject.id}`);
      return;
    }

    // Stop existing instance if playing
    this.stop(id);

    const audio = new Audio(sound.url);
    audio.loop = loop ?? sound.config.loop ?? false;
    audio.volume = sound.config.volume ?? 1.0;

    // Apply spatial audio if enabled
    if (sound.config.spatial && this.viewer) {
      const transform = this.gameObject.getComponent<TransformComponent>(ComponentType.TRANSFORM);
      if (transform) {
        const volume = this.calculateDistanceVolume(transform.getCartesian3(), audio.volume);
        audio.volume = volume;
      }
    }

    // Random start position for variety
    if (sound.config.randomStart) {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (audio.duration > 0) {
            audio.currentTime = Math.random() * audio.duration;
          }
        },
        { once: true }
      );
    }

    audio.play().catch(() => {
      // Ignore autoplay restrictions
    });

    this.activeSounds.set(id, audio);
  }

  /**
   * Stop a playing sound
   */
  stop(id: string): void {
    const audio = this.activeSounds.get(id);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      this.activeSounds.delete(id);
    }
  }

  /**
   * Stop all playing sounds
   */
  stopAll(): void {
    for (const audio of this.activeSounds.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.activeSounds.clear();
  }

  /**
   * Set volume for a sound
   */
  setVolume(id: string, volume: number): void {
    const audio = this.activeSounds.get(id);
    if (audio) {
      audio.volume = volume;
    }
  }

  /**
   * Update spatial audio volumes based on camera distance
   */
  update(deltaTime: number): void {
    if (!this.viewer) return;

    const transform = this.gameObject.getComponent<TransformComponent>(ComponentType.TRANSFORM);
    if (!transform) return;

    const position = transform.getCartesian3();

    for (const [id, audio] of this.activeSounds.entries()) {
      const sound = this.sounds.get(id);
      if (sound?.config.spatial) {
        const baseVolume = sound.config.volume ?? 1.0;
        audio.volume = this.calculateDistanceVolume(position, baseVolume);
      }
    }
  }

  /**
   * Calculate volume based on distance from camera
   */
  private calculateDistanceVolume(position: Cesium.Cartesian3, baseVolume: number): number {
    if (!this.viewer) return baseVolume;

    const cameraPosition = this.viewer.camera.positionWC;
    const distance = Cesium.Cartesian3.distance(cameraPosition, position);

    const minDist = 10; // Full volume up to 10m
    const maxDist = 300; // Silent at 300m

    if (distance <= minDist) return baseVolume;
    if (distance >= maxDist) return 0;

    const attenuation = 1 - (distance - minDist) / (maxDist - minDist);
    return baseVolume * attenuation;
  }

  override onDestroy(): void {
    this.stopAll();
  }
}
