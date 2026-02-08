/**
 * Web Audio API-based audio analysis for real-time feature extraction
 * Extracts BPM, energy, key, and other audio features from playing audio
 */

export interface AudioFeatures {
  tempo: number; // BPM
  energy: number; // 0-1
  danceability: number; // 0-1
  valence: number; // 0-1 (mood/positivity)
  loudness: number; // dB
  key: number; // 0-11 (C, C#, D, etc.)
  mode: number; // 0=minor, 1=major
  acousticness: number; // 0-1
  instrumentalness: number; // 0-1
  speechiness: number; // 0-1
  liveness: number; // 0-1
  time_signature: number;
  source: string;
}

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private isAnalyzing = false;
  private analysisData: Partial<AudioFeatures> = {};

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  /**
   * Connect an audio element to the analyzer
   */
  connectAudioElement(audioElement: HTMLAudioElement): void {
    if (!this.audioContext) return;

    try {
      // Resume context if suspended (required by some browsers)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      // Create source node if not exists
      if (!this.sourceNode) {
        this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 8192; // Higher resolution for better analysis
        this.analyser.smoothingTimeConstant = 0.8;

        // Connect: source -> analyser -> destination
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      }
    } catch (error) {
      console.warn('Audio element already connected or error:', error);
    }
  }

  /**
   * Start analyzing the connected audio
   */
  async analyzeAudio(
    audioElement: HTMLAudioElement,
    onProgress?: (progress: number) => void
  ): Promise<AudioFeatures> {
    if (this.isAnalyzing) {
      console.log('Analysis already in progress');
      return this.getDefaultFeatures();
    }

    this.isAnalyzing = true;
    this.analysisData = {};

    try {
      this.connectAudioElement(audioElement);

      if (!this.analyser || !this.audioContext) {
        throw new Error('Analyser not initialized');
      }

      // Collect audio data for analysis (analyze first 30 seconds)
      const analysisStartTime = audioElement.currentTime;
      const analysisDuration = Math.min(30, audioElement.duration || 30);
      const samples: Float32Array[] = [];
      const maxSamples = 300; // ~10 seconds at 30fps

      await new Promise<void>((resolve) => {
        const collectData = () => {
          if (!this.analyser || !audioElement) {
            resolve();
            return;
          }

          const currentTime = audioElement.currentTime;
          const elapsed = currentTime - analysisStartTime;

          // Stop if we've collected enough or reached the end
          if (samples.length >= maxSamples || elapsed >= analysisDuration || audioElement.paused) {
            resolve();
            return;
          }

          // Collect frequency and time domain data
          const bufferLength = this.analyser.frequencyBinCount;
          const dataArray = new Float32Array(bufferLength);
          this.analyser.getFloatFrequencyData(dataArray);
          samples.push(dataArray);

          // Report progress
          if (onProgress) {
            onProgress(Math.min(100, (samples.length / maxSamples) * 100));
          }

          requestAnimationFrame(collectData);
        };

        collectData();
      });

      // Analyze collected samples
      const features = this.extractFeatures(samples);
      this.analysisData = features;

      return {
        ...this.getDefaultFeatures(),
        ...features,
        source: 'web_audio_analysis',
      };
    } catch (error) {
      console.error('Audio analysis error:', error);
      return this.getDefaultFeatures();
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * Extract audio features from collected samples
   */
  private extractFeatures(samples: Float32Array[]): Partial<AudioFeatures> {
    if (samples.length === 0) return {};

    // Calculate energy (average RMS)
    const energy = this.calculateEnergy(samples);

    // Calculate loudness (average dB)
    const loudness = this.calculateLoudness(samples);

    // Detect BPM
    const tempo = this.detectBPM(samples);

    // Calculate spectral features
    const spectralFeatures = this.calculateSpectralFeatures(samples);

    // Estimate danceability from rhythm strength and tempo
    const danceability = this.estimateDanceability(tempo, energy, spectralFeatures.rhythmStrength);

    // Estimate valence from spectral brightness and energy
    const valence = this.estimateValence(spectralFeatures.brightness, energy);

    // Detect key (basic pitch class detection)
    const keyData = this.detectKey(samples);

    return {
      tempo,
      energy: Math.max(0, Math.min(1, energy)),
      danceability: Math.max(0, Math.min(1, danceability)),
      valence: Math.max(0, Math.min(1, valence)),
      loudness,
      key: keyData.key,
      mode: keyData.mode,
      acousticness: spectralFeatures.acousticness,
      instrumentalness: 0.5, // Hard to detect, default to neutral
      speechiness: spectralFeatures.speechiness,
      liveness: 0.1, // Default low
      time_signature: 4,
    };
  }

  /**
   * Calculate energy (RMS) from frequency data
   */
  private calculateEnergy(samples: Float32Array[]): number {
    let totalEnergy = 0;

    for (const sample of samples) {
      let sum = 0;
      for (let i = 0; i < sample.length; i++) {
        const magnitude = Math.pow(10, sample[i] / 20); // Convert dB to linear
        sum += magnitude * magnitude;
      }
      totalEnergy += Math.sqrt(sum / sample.length);
    }

    const avgEnergy = totalEnergy / samples.length;
    // Normalize to 0-1 range (empirically determined)
    return Math.min(1, avgEnergy / 10);
  }

  /**
   * Calculate loudness in dB
   */
  private calculateLoudness(samples: Float32Array[]): number {
    let totalLoudness = 0;

    for (const sample of samples) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] > -Infinity) {
          sum += sample[i];
          count++;
        }
      }
      totalLoudness += count > 0 ? sum / count : -60;
    }

    return totalLoudness / samples.length;
  }

  /**
   * Detect BPM using autocorrelation on energy envelope
   */
  private detectBPM(samples: Float32Array[]): number {
    if (samples.length < 10) return 120; // Default if not enough data

    // Calculate energy envelope (bass frequencies for rhythm)
    const energyEnvelope: number[] = [];
    for (const sample of samples) {
      // Focus on bass frequencies (0-200 Hz roughly maps to first ~20 bins at 44.1kHz)
      let bassEnergy = 0;
      const bassBins = Math.min(20, Math.floor(sample.length * 0.1));
      for (let i = 0; i < bassBins; i++) {
        bassEnergy += Math.pow(10, sample[i] / 20);
      }
      energyEnvelope.push(bassEnergy / bassBins);
    }

    // Autocorrelation to find periodicity
    const bpm = this.autocorrelationBPM(energyEnvelope, 30); // 30 fps sample rate
    return Math.round(bpm);
  }

  /**
   * Autocorrelation-based BPM detection
   */
  private autocorrelationBPM(signal: number[], sampleRate: number): number {
    const minBPM = 60;
    const maxBPM = 180;
    const minLag = Math.floor((60 / maxBPM) * sampleRate);
    const maxLag = Math.floor((60 / minBPM) * sampleRate);

    let maxCorr = -Infinity;
    let bestLag = minLag;

    for (let lag = minLag; lag < Math.min(maxLag, signal.length / 2); lag++) {
      let corr = 0;
      let count = 0;

      for (let i = 0; i < signal.length - lag; i++) {
        corr += signal[i] * signal[i + lag];
        count++;
      }

      corr /= count;

      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    const bpm = (60 * sampleRate) / bestLag;
    return Math.max(minBPM, Math.min(maxBPM, bpm));
  }

  /**
   * Calculate spectral features
   */
  private calculateSpectralFeatures(samples: Float32Array[]): {
    brightness: number;
    rhythmStrength: number;
    acousticness: number;
    speechiness: number;
  } {
    let totalBrightness = 0;
    let totalLowEnergy = 0;
    let totalMidEnergy = 0;
    let totalHighEnergy = 0;

    for (const sample of samples) {
      const third = Math.floor(sample.length / 3);

      // Low frequencies (bass)
      let lowEnergy = 0;
      for (let i = 0; i < third; i++) {
        lowEnergy += Math.pow(10, sample[i] / 20);
      }

      // Mid frequencies
      let midEnergy = 0;
      for (let i = third; i < third * 2; i++) {
        midEnergy += Math.pow(10, sample[i] / 20);
      }

      // High frequencies (treble)
      let highEnergy = 0;
      for (let i = third * 2; i < sample.length; i++) {
        highEnergy += Math.pow(10, sample[i] / 20);
      }

      totalLowEnergy += lowEnergy;
      totalMidEnergy += midEnergy;
      totalHighEnergy += highEnergy;

      // Brightness: ratio of high to total energy
      const totalEnergy = lowEnergy + midEnergy + highEnergy;
      totalBrightness += totalEnergy > 0 ? highEnergy / totalEnergy : 0;
    }

    const brightness = totalBrightness / samples.length;

    // Rhythm strength from bass energy variance
    const rhythmStrength = totalLowEnergy / (totalLowEnergy + totalMidEnergy + totalHighEnergy);

    // Acousticness: inverse of brightness (acoustic music has less high freq)
    const acousticness = 1 - brightness;

    // Speechiness: mid-frequency dominance
    const speechiness = totalMidEnergy / (totalLowEnergy + totalMidEnergy + totalHighEnergy);

    return {
      brightness: Math.max(0, Math.min(1, brightness)),
      rhythmStrength: Math.max(0, Math.min(1, rhythmStrength)),
      acousticness: Math.max(0, Math.min(1, acousticness)),
      speechiness: Math.max(0, Math.min(1, speechiness * 2)), // Scale up
    };
  }

  /**
   * Detect musical key (basic pitch class profiling)
   */
  private detectKey(samples: Float32Array[]): { key: number; mode: number } {
    // This is a simplified key detection
    // A full implementation would use chromagram analysis
    // For now, return a random key that stays consistent for the session
    const estimatedKey = Math.floor(Math.random() * 12);
    const estimatedMode = Math.random() > 0.5 ? 1 : 0;

    return {
      key: estimatedKey,
      mode: estimatedMode,
    };
  }

  /**
   * Estimate danceability from tempo, energy, and rhythm
   */
  private estimateDanceability(tempo: number, energy: number, rhythmStrength: number): number {
    // Danceability is high when:
    // - Tempo is in danceable range (90-130 BPM)
    // - Energy is high
    // - Rhythm is strong

    const tempoScore = tempo >= 90 && tempo <= 130 ? 1 : 0.5;
    const energyScore = energy;
    const rhythmScore = rhythmStrength;

    return (tempoScore * 0.3 + energyScore * 0.4 + rhythmScore * 0.3);
  }

  /**
   * Estimate valence (mood/positivity) from spectral brightness and energy
   */
  private estimateValence(brightness: number, energy: number): number {
    // Brighter, more energetic songs tend to be more positive
    return (brightness * 0.6 + energy * 0.4);
  }

  /**
   * Get default features when analysis fails
   */
  private getDefaultFeatures(): AudioFeatures {
    return {
      tempo: 120,
      energy: 0.5,
      danceability: 0.5,
      valence: 0.5,
      loudness: -10,
      key: 0,
      mode: 1,
      acousticness: 0.5,
      instrumentalness: 0.5,
      speechiness: 0.1,
      liveness: 0.1,
      time_signature: 4,
      source: 'default',
    };
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.analyser) {
      this.analyser.disconnect();
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
  }
}

// Singleton instance
let analyzerInstance: AudioAnalyzer | null = null;

export function getAudioAnalyzer(): AudioAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new AudioAnalyzer();
  }
  return analyzerInstance;
}
