import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';

export interface AudioFeatures {
  duration: number;
  avgVolume: number;
  peakVolume: number;
  dominantFrequency: number;
  hasVoice: boolean;
  tempo: number;
}

export interface TagSuggestion {
  tag: string;
  confidence: number;
}

@Injectable({
  providedIn: 'root',
})
export class AudioClassifierService {
  private audioContext: AudioContext | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize TensorFlow.js with WebGL backend
    await tf.ready();
    await tf.setBackend('webgl');

    this.audioContext = new AudioContext();
    this.initialized = true;

    console.log('🤖 AudioClassifier initialized with backend:', tf.getBackend());
  }

  /**
   * Analyzes an audio file and suggests tags based on features
   */
  async analyzeAudio(file: File): Promise<TagSuggestion[]> {
    await this.init();

    // Load audio file
    const audioBuffer = await this.loadAudioFile(file);

    // Extract audio features
    const features = await this.extractFeatures(audioBuffer);

    // Generate tag suggestions based on features
    const tags = this.generateTagSuggestions(features);

    return tags;
  }

  /**
   * Load audio file and decode to AudioBuffer
   */
  private async loadAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    return audioBuffer;
  }

  /**
   * Extract audio features using Web Audio API
   */
  private async extractFeatures(audioBuffer: AudioBuffer): Promise<AudioFeatures> {
    const channelData = audioBuffer.getChannelData(0); // Mono analysis
    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Calculate volume metrics
    let sumSquares = 0;
    let peakVolume = 0;

    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.abs(channelData[i]);
      sumSquares += sample * sample;
      peakVolume = Math.max(peakVolume, sample);
    }

    const avgVolume = Math.sqrt(sumSquares / channelData.length);

    // Frequency analysis using FFT
    const fftSize = 2048;
    const freqData = this.performFFT(channelData, fftSize, sampleRate);

    // Find dominant frequency
    let maxMagnitude = 0;
    let dominantFreqIndex = 0;

    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > maxMagnitude) {
        maxMagnitude = freqData[i];
        dominantFreqIndex = i;
      }
    }

    const dominantFrequency = (dominantFreqIndex * sampleRate) / fftSize;

    // Voice detection (simplified: check if energy is concentrated in 80-3000 Hz)
    const hasVoice = this.detectVoice(freqData, sampleRate, fftSize);

    // Tempo detection (simplified: count zero crossings)
    const tempo = this.detectTempo(channelData, sampleRate);

    return {
      duration,
      avgVolume,
      peakVolume,
      dominantFrequency,
      hasVoice,
      tempo,
    };
  }

  /**
   * Simple FFT using TensorFlow.js
   */
  private performFFT(samples: Float32Array, fftSize: number, sampleRate: number): Float32Array {
    // Take first fftSize samples for analysis
    const inputTensor = tf.tensor1d(samples.slice(0, fftSize));

    // Apply Hann window to reduce spectral leakage
    const window = tf.signal.hannWindow(fftSize);
    const windowed = tf.mul(inputTensor, window);

    // Perform FFT
    const fft = tf.spectral.rfft(windowed as tf.Tensor1D);

    // Get magnitude
    const magnitude = tf.abs(fft);
    const result = magnitude.dataSync() as Float32Array;

    // Cleanup
    inputTensor.dispose();
    window.dispose();
    windowed.dispose();
    fft.dispose();
    magnitude.dispose();

    return result;
  }

  /**
   * Detect if audio contains voice (simplified heuristic)
   */
  private detectVoice(freqData: Float32Array, sampleRate: number, fftSize: number): boolean {
    const voiceRangeStart = Math.floor((80 * fftSize) / sampleRate); // 80 Hz
    const voiceRangeEnd = Math.floor((3000 * fftSize) / sampleRate); // 3000 Hz

    let voiceEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < freqData.length; i++) {
      totalEnergy += freqData[i];
      if (i >= voiceRangeStart && i <= voiceRangeEnd) {
        voiceEnergy += freqData[i];
      }
    }

    // If more than 60% of energy is in voice range, likely contains voice
    return voiceEnergy / totalEnergy > 0.6;
  }

  /**
   * Detect tempo by counting zero crossings
   */
  private detectTempo(samples: Float32Array, sampleRate: number): number {
    let zeroCrossings = 0;

    for (let i = 1; i < samples.length; i++) {
      if ((samples[i - 1] >= 0 && samples[i] < 0) || (samples[i - 1] < 0 && samples[i] >= 0)) {
        zeroCrossings++;
      }
    }

    // Estimate tempo (rough approximation)
    const timeInSeconds = samples.length / sampleRate;
    const avgFrequency = zeroCrossings / (2 * timeInSeconds);

    return avgFrequency;
  }

  /**
   * Generate tag suggestions based on extracted features
   */
  private generateTagSuggestions(features: AudioFeatures): TagSuggestion[] {
    const suggestions: TagSuggestion[] = [];

    // Duration-based tags
    if (features.duration < 1) {
      suggestions.push({ tag: 'kurz', confidence: 0.9 });
    } else if (features.duration > 10) {
      suggestions.push({ tag: 'lang', confidence: 0.9 });
    }

    // Volume-based tags
    if (features.peakVolume > 0.8) {
      suggestions.push({ tag: 'laut', confidence: 0.85 });
    } else if (features.avgVolume < 0.1) {
      suggestions.push({ tag: 'leise', confidence: 0.85 });
    }

    // Frequency-based tags
    if (features.dominantFrequency < 250) {
      suggestions.push({ tag: 'bass', confidence: 0.75 });
      suggestions.push({ tag: 'tief', confidence: 0.7 });
    } else if (features.dominantFrequency > 2000) {
      suggestions.push({ tag: 'hoch', confidence: 0.75 });
    }

    // Voice detection
    if (features.hasVoice) {
      suggestions.push({ tag: 'sprache', confidence: 0.8 });
      suggestions.push({ tag: 'stimme', confidence: 0.75 });
    } else {
      suggestions.push({ tag: 'musik', confidence: 0.6 });
      suggestions.push({ tag: 'effekt', confidence: 0.6 });
    }

    // Tempo-based tags
    if (features.tempo > 200) {
      suggestions.push({ tag: 'schnell', confidence: 0.7 });
      suggestions.push({ tag: 'hektisch', confidence: 0.65 });
    } else if (features.tempo < 50) {
      suggestions.push({ tag: 'langsam', confidence: 0.7 });
      suggestions.push({ tag: 'ruhig', confidence: 0.65 });
    }

    // Common sound type inference
    if (features.peakVolume > 0.9 && features.duration < 2) {
      suggestions.push({ tag: 'meme', confidence: 0.6 });
      suggestions.push({ tag: 'sound-effect', confidence: 0.65 });
    }

    if (features.hasVoice && features.duration > 5) {
      suggestions.push({ tag: 'zitat', confidence: 0.65 });
    }

    // Sort by confidence and filter low confidence
    return suggestions
      .filter(s => s.confidence > 0.5)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8); // Top 8 suggestions
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.initialized = false;
  }
}
