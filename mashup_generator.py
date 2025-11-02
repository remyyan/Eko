#!/usr/bin/env python3
"""
AI-Powered Audio Mashup Generator
Generates professional mashups from two audio files using librosa and pydub
"""

import os
import sys
import json
import librosa
import numpy as np
from pydub import AudioSegment
from pydub.utils import mediainfo
import soundfile as sf
from pathlib import Path

class MashupGenerator:
    def __init__(self, track1_path: str, track2_path: str, output_path: str = "mashup.mp3"):
        """Initialize mashup generator with two audio files"""
        self.track1_path = track1_path
        self.track2_path = track2_path
        self.output_path = output_path
        
        # Load audio files
        print(f"Loading Track 1: {track1_path}")
        self.y1, self.sr1 = librosa.load(track1_path, sr=None)
        
        print(f"Loading Track 2: {track2_path}")
        self.y2, self.sr2 = librosa.load(track2_path, sr=None)
        
        # Detect BPM
        print("Detecting BPM...")
        self.bpm1 = self.detect_bpm(self.y1, self.sr1)
        self.bpm2 = self.detect_bpm(self.y2, self.sr2)
        
        print(f"Track 1 BPM: {self.bpm1:.1f}")
        print(f"Track 2 BPM: {self.bpm2:.1f}")
        
        # Calculate target BPM (average)
        self.target_bpm = (self.bpm1 + self.bpm2) / 2
        print(f"Target BPM: {self.target_bpm:.1f}")
    
    def detect_bpm(self, y: np.ndarray, sr: int) -> float:
        """Detect BPM using librosa's onset detection"""
        try:
            # Compute onset strength
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            
            # Estimate tempo
            tempo, _ = librosa.beat.tempo(onset_envelope=onset_env, sr=sr)
            return float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        except Exception as e:
            print(f"Warning: Could not detect BPM, using default 120: {e}")
            return 120.0
    
    def time_stretch(self, y: np.ndarray, rate: float) -> np.ndarray:
        """Time-stretch audio to match target BPM"""
        if abs(rate - 1.0) < 0.01:  # No stretching needed
            return y
        
        print(f"Time-stretching with rate: {rate:.3f}")
        return librosa.effects.time_stretch(y, rate=rate)
    
    def crossfade(self, audio1: AudioSegment, audio2: AudioSegment, duration_ms: int = 2000) -> AudioSegment:
        """Create crossfade transition between two audio segments"""
        print(f"Creating {duration_ms}ms crossfade...")
        
        # Ensure both have same sample width and channels
        audio1 = audio1.set_channels(2).set_sample_width(2)
        audio2 = audio2.set_channels(2).set_sample_width(2)
        
        # Create crossfade
        if len(audio1) < duration_ms or len(audio2) < duration_ms:
            # If audio is too short, just concatenate
            return audio1 + audio2
        
        # Overlap the end of audio1 with the beginning of audio2
        fade_out = audio1[-duration_ms:].fade_out(duration_ms)
        fade_in = audio2[:duration_ms].fade_in(duration_ms)
        
        # Mix the overlapping parts
        overlap = fade_out.overlay(fade_in)
        
        # Combine: beginning of audio1 + overlap + rest of audio2
        result = audio1[:-duration_ms] + overlap + audio2[duration_ms:]
        
        return result
    
    def generate_mashup(self, crossfade_duration_ms: int = 3000) -> str:
        """Generate the mashup and save to file"""
        print("\n=== Generating Mashup ===")
        
        # Calculate time-stretch rates
        rate1 = self.target_bpm / self.bpm1
        rate2 = self.target_bpm / self.bpm2
        
        # Time-stretch both tracks
        print("Time-stretching Track 1...")
        y1_stretched = self.time_stretch(self.y1, rate1)
        
        print("Time-stretching Track 2...")
        y2_stretched = self.time_stretch(self.y2, rate2)
        
        # Convert to AudioSegment for mixing
        print("Converting to audio segments...")
        
        # Save stretched audio temporarily
        temp1_path = "/tmp/track1_stretched.wav"
        temp2_path = "/tmp/track2_stretched.wav"
        
        sf.write(temp1_path, y1_stretched, self.sr1)
        sf.write(temp2_path, y2_stretched, self.sr2)
        
        # Load as AudioSegment
        audio1 = AudioSegment.from_wav(temp1_path)
        audio2 = AudioSegment.from_wav(temp2_path)
        
        # Create mashup with crossfade
        print("Creating mashup with crossfade...")
        mashup = self.crossfade(audio1, audio2, crossfade_duration_ms)
        
        # Normalize volume
        print("Normalizing volume...")
        mashup = mashup.normalize()
        
        # Export
        print(f"Exporting to {self.output_path}...")
        mashup.export(self.output_path, format="mp3", bitrate="192k")
        
        # Cleanup
        os.remove(temp1_path)
        os.remove(temp2_path)
        
        print(f"✅ Mashup created successfully: {self.output_path}")
        print(f"Duration: {len(mashup) / 1000:.1f} seconds")
        
        return self.output_path


def main():
    """CLI interface for mashup generation"""
    if len(sys.argv) < 3:
        print("Usage: python mashup_generator.py <track1.mp3> <track2.mp3> [output.mp3]")
        sys.exit(1)
    
    track1 = sys.argv[1]
    track2 = sys.argv[2]
    output = sys.argv[3] if len(sys.argv) > 3 else "mashup.mp3"
    
    # Validate files exist
    if not os.path.exists(track1):
        print(f"Error: Track 1 not found: {track1}")
        sys.exit(1)
    
    if not os.path.exists(track2):
        print(f"Error: Track 2 not found: {track2}")
        sys.exit(1)
    
    try:
        generator = MashupGenerator(track1, track2, output)
        generator.generate_mashup()
        
        # Output JSON for API consumption
        result = {
            "success": True,
            "output_file": output,
            "track1_bpm": generator.bpm1,
            "track2_bpm": generator.bpm2,
            "target_bpm": generator.target_bpm,
            "file_size_mb": os.path.getsize(output) / (1024 * 1024)
        }
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

