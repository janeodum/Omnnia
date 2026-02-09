// server/services/audioVideoMerger.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AudioVideoMerger {
  constructor(tempDir) {
    this.tempDir = tempDir || path.join(__dirname, '../temp');
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get duration of a media file
   */
  getDuration(filePath) {
    try {
      const result = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
        { encoding: 'utf-8' }
      );
      return parseFloat(result.trim());
    } catch (error) {
      console.error('Failed to get duration:', error);
      return null;
    }
  }

  /**
   * Merge narration audio with video for a single scene
   */
  async mergeSceneAudioVideo(videoPath, audioPath, outputPath, options = {}) {
    const {
      backgroundMusicPath = null,
      narrationVolume = 1.0,
      musicVolume = 0.2,
    } = options;

    try {
      const videoDuration = this.getDuration(videoPath);
      const audioDuration = this.getDuration(audioPath);

      if (!videoDuration) throw new Error('Could not determine video duration');

      let filterComplex = '';
      let inputs = `-i "${videoPath}" -i "${audioPath}"`;

      if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
        // With background music
        inputs += ` -i "${backgroundMusicPath}"`;
        
        filterComplex = [
          // Narration with fade
          `[1:a]afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, audioDuration - 0.3)}:d=0.3,volume=${narrationVolume}[narration]`,
          // Background music looped and trimmed
          `[2:a]aloop=loop=-1:size=2e+09,atrim=duration=${videoDuration},volume=${musicVolume}[music]`,
          // Mix them
          `[narration][music]amix=inputs=2:duration=longest:dropout_transition=2[aout]`,
        ].join(';');

        const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
        execSync(cmd, { stdio: 'pipe' });
      } else {
        // Just narration, no music
        filterComplex = `[1:a]afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, audioDuration - 0.3)}:d=0.3,volume=${narrationVolume},apad=pad_dur=${Math.max(0, videoDuration - audioDuration)}[aout]`;

        const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
        execSync(cmd, { stdio: 'pipe' });
      }

      return { success: true, outputPath };
    } catch (error) {
      console.error('❌ Merge failed:', error.message);
      throw new Error(`Failed to merge audio with video: ${error.message}`);
    }
  }

  /**
   * Add only background music to video (no narration)
   */
  async addMusicToVideo(videoPath, musicPath, outputPath, volume = 0.3) {
    try {
      const videoDuration = this.getDuration(videoPath);
      
      const filterComplex = `[1:a]aloop=loop=-1:size=2e+09,atrim=duration=${videoDuration},volume=${volume}[aout]`;
      
      const cmd = `ffmpeg -y -i "${videoPath}" -i "${musicPath}" -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
      
      execSync(cmd, { stdio: 'pipe' });
      
      return { success: true, outputPath };
    } catch (error) {
      throw new Error(`Failed to add music: ${error.message}`);
    }
  }

  /**
   * Concatenate multiple videos
   */
  async concatenateVideos(videoPaths, outputPath, options = {}) {
    const { crossfadeDuration = 0.5 } = options;

    if (videoPaths.length === 0) throw new Error('No videos to concatenate');
    if (videoPaths.length === 1) {
      fs.copyFileSync(videoPaths[0], outputPath);
      return { success: true, outputPath };
    }

    try {
      // Create concat file
      const concatFile = path.join(this.tempDir, `concat_${Date.now()}.txt`);
      const concatContent = videoPaths.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      const cmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k "${outputPath}"`;
      
      execSync(cmd, { stdio: 'pipe', maxBuffer: 100 * 1024 * 1024 });

      // Cleanup
      fs.unlinkSync(concatFile);

      return { success: true, outputPath };
    } catch (error) {
      throw new Error(`Failed to concatenate videos: ${error.message}`);
    }
  }
}

module.exports = AudioVideoMerger;