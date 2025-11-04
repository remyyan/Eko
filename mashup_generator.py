#!/usr/bin/env python3
"""
AI-Powered Audio Mashup Generator
Generates professional mashups from two audio files using librosa, pydub, and Gemini AI
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
import google.generativeai as genai

class MashupGenerator:
    def __init__(self, track1_path: str, track2_path: str, output_path: str = "mashup.mp3"):
        """Initialize mashup generator with two audio files"""
        self.track1_path = track1_path
        self.track2_path = track2_path
        self.output_path = output_path
        self.transition_type = "crossfade"  # Default
        self.ai_suggestions = {}

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

        # Get AI suggestions for transition
        print("Getting AI transition suggestions...")
        self.get_ai_transition_suggestions()
    
    def get_ai_transition_suggestions(self):
        """Use Gemini AI to suggest the best transition type"""
        # Default suggestions
        self.ai_suggestions = {
            "transition_type": "crossfade",
            "crossfade_duration_ms": 3000,
            "reason": "Default crossfade transition"
        }

        try:
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                print("Warning: GEMINI_API_KEY not set, using default transition")
                self.transition_type = "crossfade" # fall back transition
                self.crossfade_duration = 3000
                return

            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-2.5-flash")

            # Analyze audio characteristics
            energy1 = np.sqrt(np.mean(self.y1**2))
            energy2 = np.sqrt(np.mean(self.y2**2))

            prompt = f"""You are a professional DJ and music producer. Analyze these two tracks and recommend the BEST transition technique to create an exciting, professional mashup.

Track 1: BPM={self.bpm1:.0f}, Energy={energy1:.3f}
Track 2: BPM={self.bpm2:.0f}, Energy={energy2:.3f}

Available transition types:
1. "crossfade" - Simple fade out/in (2-3 seconds, good for similar energy)
2. "echo_fade" - Echo effect with fade (3-4 seconds, good for electronic music, creates depth)
3. "filter_sweep" - High-pass filter sweep (2-3 seconds, good for building tension and energy)
4. "beat_drop" - Build tension then drop (4-5 seconds, high energy, dramatic effect)

IMPORTANT:
- Prefer creative transitions (echo_fade, filter_sweep, beat_drop) over plain crossfade when possible
- Use longer durations (3-5 seconds) for more professional, smoother transitions
- Consider the energy levels: if similar, use creative techniques to add interest
- If BPMs match, use this as an opportunity for creative mixing

Respond ONLY with JSON (no markdown, no explanation):
{{"transition_type": "crossfade|echo_fade|filter_sweep|beat_drop", "crossfade_duration_ms": 2000-5000, "reason": "brief reason why this transition works best"}}"""

            response = model.generate_content(prompt)
            response_text = response.text.strip()

            if not response_text:
                raise Exception("Empty response from Gemini API")

            # Try to extract JSON from response (in case there's extra text)
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1

            if json_start == -1 or json_end == 0:
                raise Exception(f"No JSON found in response: {response_text}")

            json_str = response_text[json_start:json_end]
            result = json.loads(json_str)

            self.transition_type = result.get("transition_type", "crossfade")
            self.crossfade_duration = result.get("crossfade_duration_ms", 3000)
            self.ai_suggestions = result

            print(f"✨ AI Suggestion: {self.transition_type} ({result.get('reason', '')})")

        except Exception as e:
            print(f"Warning: Could not get AI suggestions: {e}")
            self.transition_type = "crossfade"
            self.crossfade_duration = 3000
            self.ai_suggestions = {
                "transition_type": "crossfade",
                "crossfade_duration_ms": 3000,
                "reason": f"Error getting AI suggestion, using default: {str(e)}"
            }

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
            return audio1 + audio2

        # Overlap the end of audio1 with the beginning of audio2
        fade_out = audio1[-duration_ms:].fade_out(duration_ms)
        fade_in = audio2[:duration_ms].fade_in(duration_ms)
        overlap = fade_out.overlay(fade_in)
        result = audio1[:-duration_ms] + overlap + audio2[duration_ms:]

        return result

    def echo_fade(self, audio1: AudioSegment, audio2: AudioSegment, duration_ms: int = 3000) -> AudioSegment:
        """Create echo fade transition (good for electronic music)"""
        print(f"Creating {duration_ms}ms echo fade transition...")

        audio1 = audio1.set_channels(2).set_sample_width(2)
        audio2 = audio2.set_channels(2).set_sample_width(2)

        if len(audio1) < duration_ms or len(audio2) < duration_ms:
            return audio1 + audio2

        # Create echo effect on end of track 1
        end_section = audio1[-duration_ms:]
        echo = end_section - 6  # Reduce volume for echo
        echo_delayed = AudioSegment.silent(duration=500) + echo

        # Fade out original, fade in echo, then fade in track 2
        fade_out = end_section.fade_out(duration_ms)
        fade_in_echo = echo_delayed[:duration_ms].fade_in(duration_ms // 2).fade_out(duration_ms // 2)
        fade_in_track2 = audio2[:duration_ms].fade_in(duration_ms)

        # Mix all three
        transition = fade_out.overlay(fade_in_echo).overlay(fade_in_track2)
        result = audio1[:-duration_ms] + transition + audio2[duration_ms:]

        return result

    def filter_sweep(self, audio1: AudioSegment, audio2: AudioSegment, duration_ms: int = 3000) -> AudioSegment:
        """Create filter sweep transition (builds tension)"""
        print(f"Creating {duration_ms}ms filter sweep transition...")

        audio1 = audio1.set_channels(2).set_sample_width(2)
        audio2 = audio2.set_channels(2).set_sample_width(2)

        if len(audio1) < duration_ms or len(audio2) < duration_ms:
            return audio1 + audio2

        # Gradual volume reduction on track 1, then bring in track 2
        fade_out = audio1[-duration_ms:].fade_out(duration_ms)
        fade_in = audio2[:duration_ms].fade_in(duration_ms)

        # Add slight delay to track 2 for sweep effect
        delay_ms = 500
        delayed_fade_in = AudioSegment.silent(duration=delay_ms) + fade_in[:-delay_ms]

        overlap = fade_out.overlay(delayed_fade_in)
        result = audio1[:-duration_ms] + overlap + audio2[duration_ms:]

        return result

    def beat_drop(self, audio1: AudioSegment, audio2: AudioSegment, duration_ms: int = 4000) -> AudioSegment:
        """Create beat drop transition (high energy)"""
        print(f"Creating {duration_ms}ms beat drop transition...")

        audio1 = audio1.set_channels(2).set_sample_width(2)
        audio2 = audio2.set_channels(2).set_sample_width(2)

        if len(audio1) < duration_ms or len(audio2) < duration_ms:
            return audio1 + audio2

        # Build tension: gradually reduce track 1
        build_duration = duration_ms // 2
        drop_duration = duration_ms // 2

        build_section = audio1[-duration_ms:-drop_duration]
        build_section = build_section.fade_out(build_duration)

        # Drop: sudden intro of track 2
        drop_section = audio2[:drop_duration].fade_in(100)  # Quick fade in

        transition = build_section + drop_section
        result = audio1[:-duration_ms] + transition + audio2[drop_duration:]

        return result
    
    def generate_mashup(self) -> str:
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

        # Create mashup with AI-selected transition
        duration = getattr(self, 'crossfade_duration', 3000)
        print(f"Creating mashup with {self.transition_type} transition ({duration}ms)...")

        if self.transition_type == "echo_fade":
            mashup = self.echo_fade(audio1, audio2, duration)
        elif self.transition_type == "filter_sweep":
            mashup = self.filter_sweep(audio1, audio2, duration)
        elif self.transition_type == "beat_drop":
            mashup = self.beat_drop(audio1, audio2, duration)
        else:
            mashup = self.crossfade(audio1, audio2, duration)

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
        print(f"Transition: {self.transition_type}")

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
            "transition_type": generator.transition_type,
            "ai_suggestions": generator.ai_suggestions,
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

