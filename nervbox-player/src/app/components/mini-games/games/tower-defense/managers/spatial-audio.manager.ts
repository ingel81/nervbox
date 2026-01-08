import * as THREE from 'three';

/**
 * Sound configuration
 */
export interface SpatialSoundConfig {
  /** Reference distance - sound is at full volume at this distance (meters) */
  refDistance?: number;
  /** Rolloff factor - how fast sound fades with distance (higher = faster fade) */
  rolloffFactor?: number;
  /** Maximum distance - sound is silent beyond this (0 = no max) */
  maxDistance?: number;
  /** Distance model: 'linear' | 'inverse' | 'exponential' */
  distanceModel?: 'linear' | 'inverse' | 'exponential';
  /** Base volume (0-1) */
  volume?: number;
  /** Loop the sound */
  loop?: boolean;
}

const DEFAULT_CONFIG: Required<SpatialSoundConfig> = {
  refDistance: 50,
  rolloffFactor: 1,
  maxDistance: 0, // No maximum (natural falloff)
  distanceModel: 'inverse',
  volume: 1.0,
  loop: false,
};

/**
 * Registered sound definition
 */
interface RegisteredSound {
  buffer: AudioBuffer | null;
  config: Required<SpatialSoundConfig>;
  loading: Promise<AudioBuffer> | null;
}

/**
 * Active sound instance
 */
interface ActiveSound {
  audio: THREE.PositionalAudio;
  soundId: string;
}

/**
 * SpatialAudioManager - 3D positioned audio using Three.js Audio system
 *
 * Features:
 * - Distance-based volume (natural falloff, no hard cutoff)
 * - Stereo panning based on position relative to camera
 * - Efficient buffer caching and reuse
 * - Pool of PositionalAudio objects for performance
 *
 * Usage:
 *   manager.registerSound('arrow', '/assets/sounds/arrow.mp3', { refDistance: 30 });
 *   manager.playAt('arrow', position); // THREE.Vector3
 *   manager.playAtGeo('arrow', lat, lon, height); // Geographic coords
 */
export class SpatialAudioManager {
  private listener: THREE.AudioListener;
  private loader: THREE.AudioLoader;
  private scene: THREE.Scene;

  // Registered sounds (id -> buffer + config)
  private sounds = new Map<string, RegisteredSound>();

  // Active sound instances
  private activeSounds: ActiveSound[] = [];

  // Audio context state
  private contextResumed = false;

  // Coordinate converter (set by engine)
  private geoToLocal: ((lat: number, lon: number, height: number) => THREE.Vector3) | null = null;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;

    // Create audio listener and attach to camera
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);

    // Create audio loader
    this.loader = new THREE.AudioLoader();

    console.log('[SpatialAudio] Initialized - listener attached to camera');
  }

  /**
   * Set the geo-to-local coordinate converter
   * Must be called before using playAtGeo()
   */
  setGeoToLocal(fn: (lat: number, lon: number, height: number) => THREE.Vector3): void {
    this.geoToLocal = fn;
  }

  /**
   * Convert geo coordinates to local THREE.Vector3
   * Public method for use by AudioComponent
   */
  geoToLocalPosition(lat: number, lon: number, height: number): THREE.Vector3 | null {
    if (!this.geoToLocal) return null;
    return this.geoToLocal(lat, lon, height);
  }

  /**
   * Get the Three.js scene
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Resume audio context (required after user interaction)
   */
  async resumeContext(): Promise<void> {
    if (this.contextResumed) return;

    const context = this.listener.context;
    if (context.state === 'suspended') {
      await context.resume();
      console.log('[SpatialAudio] AudioContext resumed');
    }
    this.contextResumed = true;
  }

  /**
   * Register a sound for later playback
   */
  registerSound(id: string, url: string, config: SpatialSoundConfig = {}): void {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    const sound: RegisteredSound = {
      buffer: null,
      config: fullConfig,
      loading: null,
    };

    this.sounds.set(id, sound);

    // Start loading immediately
    sound.loading = this.loadBuffer(url).then((buffer) => {
      sound.buffer = buffer;
      sound.loading = null;
      console.log(`[SpatialAudio] Loaded: ${id}`);
      return buffer;
    });
  }

  /**
   * Load an audio buffer
   */
  private loadBuffer(url: string): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (buffer) => resolve(buffer),
        undefined,
        (error) => {
          console.error('[SpatialAudio] Failed to load:', url, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Play a sound at a 3D position (local coordinates)
   */
  async playAt(
    soundId: string,
    position: THREE.Vector3,
    volumeMultiplier: number = 1.0
  ): Promise<THREE.PositionalAudio | null> {
    const sound = this.sounds.get(soundId);
    if (!sound) {
      console.warn(`[SpatialAudio] Sound not registered: ${soundId}`);
      return null;
    }

    // Ensure context is resumed
    await this.resumeContext();

    // Wait for buffer if still loading
    if (sound.loading) {
      await sound.loading;
    }

    if (!sound.buffer) {
      console.warn(`[SpatialAudio] No buffer for: ${soundId}`);
      return null;
    }

    // Create positional audio
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(sound.buffer);
    audio.setRefDistance(sound.config.refDistance);
    audio.setRolloffFactor(sound.config.rolloffFactor);
    audio.setDistanceModel(sound.config.distanceModel);
    audio.setVolume(sound.config.volume * volumeMultiplier);
    audio.setLoop(sound.config.loop);

    if (sound.config.maxDistance > 0) {
      audio.setMaxDistance(sound.config.maxDistance);
    }

    // Create a container object at the position
    const container = new THREE.Object3D();
    container.position.copy(position);
    container.add(audio);
    this.scene.add(container);

    // Track active sound
    const activeSound: ActiveSound = { audio, soundId };
    this.activeSounds.push(activeSound);

    // Play
    audio.play();

    // Cleanup after playback (if not looping)
    if (!sound.config.loop) {
      const duration = sound.buffer.duration * 1000;
      setTimeout(() => {
        this.removeActiveSound(activeSound);
        this.scene.remove(container);
        audio.disconnect();
      }, duration + 100);
    }

    return audio;
  }

  /**
   * Play a sound at geographic coordinates
   */
  async playAtGeo(
    soundId: string,
    lat: number,
    lon: number,
    height: number,
    volumeMultiplier: number = 1.0
  ): Promise<THREE.PositionalAudio | null> {
    if (!this.geoToLocal) {
      console.warn('[SpatialAudio] geoToLocal not set - use setGeoToLocal() first');
      return null;
    }

    const position = this.geoToLocal(lat, lon, height);
    return this.playAt(soundId, position, volumeMultiplier);
  }

  /**
   * Play a non-positional (global) sound
   * Uses regular THREE.Audio instead of PositionalAudio
   */
  async playGlobal(soundId: string, volumeMultiplier: number = 1.0): Promise<THREE.Audio | null> {
    const sound = this.sounds.get(soundId);
    if (!sound) {
      console.warn(`[SpatialAudio] Sound not registered: ${soundId}`);
      return null;
    }

    await this.resumeContext();

    if (sound.loading) {
      await sound.loading;
    }

    if (!sound.buffer) {
      return null;
    }

    const audio = new THREE.Audio(this.listener);
    audio.setBuffer(sound.buffer);
    audio.setVolume(sound.config.volume * volumeMultiplier);
    audio.setLoop(sound.config.loop);
    audio.play();

    if (!sound.config.loop) {
      const duration = sound.buffer.duration * 1000;
      setTimeout(() => {
        audio.disconnect();
      }, duration + 100);
    }

    return audio;
  }

  /**
   * Stop all instances of a sound
   */
  stop(soundId: string): void {
    const toRemove = this.activeSounds.filter((s) => s.soundId === soundId);
    for (const active of toRemove) {
      if (active.audio.isPlaying) {
        active.audio.stop();
      }
      this.removeActiveSound(active);
    }
  }

  /**
   * Stop all sounds
   */
  stopAll(): void {
    for (const active of this.activeSounds) {
      if (active.audio.isPlaying) {
        active.audio.stop();
      }
    }
    this.activeSounds = [];
  }

  /**
   * Check if a sound is currently playing
   */
  isPlaying(soundId: string): boolean {
    return this.activeSounds.some((s) => s.soundId === soundId && s.audio.isPlaying);
  }

  /**
   * Get listener for external access
   */
  getListener(): THREE.AudioListener {
    return this.listener;
  }

  private removeActiveSound(active: ActiveSound): void {
    const index = this.activeSounds.indexOf(active);
    if (index !== -1) {
      this.activeSounds.splice(index, 1);
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stopAll();

    // Remove listener from camera
    if (this.listener.parent) {
      this.listener.parent.remove(this.listener);
    }

    this.sounds.clear();
    console.log('[SpatialAudio] Disposed');
  }
}
