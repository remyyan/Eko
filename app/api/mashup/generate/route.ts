import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

/**
 * API endpoint to generate actual audio mashup
 * Expects two audio files (MP3) to be uploaded
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const track1File = formData.get("track1") as File;
    const track2File = formData.get("track2") as File;

    if (!track1File || !track2File) {
      return NextResponse.json(
        { error: "Two audio files required (track1 and track2)" },
        { status: 400 }
      );
    }

    // Validate file types
    if (!track1File.type.includes("audio") || !track2File.type.includes("audio")) {
      return NextResponse.json(
        { error: "Files must be audio files (MP3, WAV, etc.)" },
        { status: 400 }
      );
    }

    // Create temp directory for processing
    const tempDir = path.join(process.cwd(), "tmp", `mashup_${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Save uploaded files
      const track1Path = path.join(tempDir, "track1.mp3");
      const track2Path = path.join(tempDir, "track2.mp3");
      const outputPath = path.join(tempDir, "mashup.mp3");

      const track1Buffer = await track1File.arrayBuffer();
      const track2Buffer = await track2File.arrayBuffer();

      fs.writeFileSync(track1Path, Buffer.from(track1Buffer));
      fs.writeFileSync(track2Path, Buffer.from(track2Buffer));

      // Call Python mashup generator using the correct Python environment
      console.log("Calling Python mashup generator...");
      const { stdout, stderr } = await execAsync(
        `/Users/remy/micromamba/bin/python mashup_generator.py "${track1Path}" "${track2Path}" "${outputPath}"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
      );

      if (stderr) {
        console.error("Python stderr:", stderr);
      }

      console.log("Python stdout:", stdout);

      // Parse result
      const resultLines = stdout.split("\n");
      const jsonLine = resultLines.find((line) => line.startsWith("{"));

      if (!jsonLine) {
        throw new Error("Failed to parse Python output");
      }

      const result = JSON.parse(jsonLine);

      if (!result.success) {
        throw new Error(result.error || "Mashup generation failed");
      }

      // Read the generated mashup file
      const mashupBuffer = fs.readFileSync(outputPath);

      // Return the audio file with AI suggestions
      return new NextResponse(mashupBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": 'attachment; filename="mashup.mp3"',
          "X-Mashup-Info": JSON.stringify({
            track1_bpm: result.track1_bpm,
            track2_bpm: result.track2_bpm,
            target_bpm: result.target_bpm,
            transition_type: result.transition_type,
            ai_suggestions: result.ai_suggestions,
            file_size_mb: result.file_size_mb,
          }),
        },
      });
    } finally {
      // Cleanup temp files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to cleanup temp files:", e);
      }
    }
  } catch (error) {
    console.error("Error generating mashup:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate mashup",
      },
      { status: 500 }
    );
  }
}

