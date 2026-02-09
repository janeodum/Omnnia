// server/components/videoGenerator.js
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

class VideoGenerator {
  /**
   * @param {string} sdWebUIUrl - e.g. http://127.0.0.1:7866
   * @param {string} outputDir  - directory for FFmpeg videos (and/or where you want to serve videos from)
   */
  constructor(sdWebUIUrl, outputDir) {
    this.sdWebUIUrl = sdWebUIUrl;
    this.outputDir = outputDir || './output/videos';

    // FFmpeg binary – used only for the old slideshow endpoint
    this.ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';

    /**
     * AnimateDiff motion module name.
     * IMPORTANT:
     *  - This must match EXACTLY what you see in the AnimateDiff "Motion Module" dropdown
     *    in the Stable Diffusion WebUI.
     *  - Example: "v3_sd15_mm.ckpt" or "mm_sd15_v3.safetensors"
     *
     * You can override this in .env:
     *   ANIMATEDIFF_MOTION_MODULE=v3_sd15_mm.ckpt
     */
    this.motionModule =
      process.env.ANIMATEDIFF_MOTION_MODULE || 'v3_sd15_mm.ckpt';
  }

  /* -----------------------------------------------------------------------
   * 1) OLD PATH – FFmpeg slideshow from still images
   * -------------------------------------------------------------------- */

  /**
   * Create a simple slideshow video from a list of base64 images using FFmpeg.
   * Each image is shown for `duration` seconds.
   */
  async createVideoFromImages(images, options = {}) {
    const {
      fps = 8,
      duration = 3, // seconds per image
      outputName = `lovestory_${Date.now()}.mp4`,
    } = options;

    try {
      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      // Temp directory for this job
      const tempDir = path.join(this.outputDir, `temp_${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      console.log(`💾 Saving ${images.length} images to ${tempDir}...`);

      // Save images to disk
      for (let i = 0; i < images.length; i++) {
        const raw = images[i] || '';
        const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw;

        if (!base64) continue;

        const imageBuffer = Buffer.from(base64, 'base64');
        const filename = path.join(
          tempDir,
          `scene_${String(i).padStart(4, '0')}.png`
        );
        await fs.writeFile(filename, imageBuffer);
      }

      const outputPath = path.join(this.outputDir, outputName);

      const cmd =
        `${this.ffmpegBin} -y -framerate 1/${duration} ` +
        `-i ${tempDir}/scene_%04d.png ` +
        `-c:v libx264 -pix_fmt yuv420p ` +
        `-vf "scale=1920:1080,fps=${fps}" ${outputPath}`;

      console.log('🎬 Running FFmpeg:', cmd);

      return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            console.error('❌ FFmpeg error:', stderr || err.message);
            return reject(new Error('FFmpeg failed'));
          }
          console.log('✅ Slideshow video created at', outputPath);
          resolve({
            success: true,
            outputPath,
            fps,
            durationPerScene: duration,
          });
        });
      });
    } catch (error) {
      console.error('❌ Video creation error:', error.message);
      throw error;
    }
  }

  /**
   * Basic instructions (used by /api/video/instructions)
   */
  getVideoCreationInstructions(imageCount, duration) {
    return {
      method: 'ffmpeg',
      steps: [
        '1. Install FFmpeg: https://ffmpeg.org/download.html',
        '2. Save all generated images to a folder',
        '3. Run the FFmpeg command provided',
        `4. Video will be ~${imageCount * duration} seconds long`,
      ],
      exampleCommand:
        `ffmpeg -framerate 1/${duration} -i scene_%04d.png ` +
        '-c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080,fps=24" output.mp4',
      alternatives: [
        'Use online tools like Kapwing or Canva',
        'Use video editing software like DaVinci Resolve (free)',
        'Use Python libraries like moviepy',
      ],
    };
  }

  /* -----------------------------------------------------------------------
   * 2) NEW PATH – AnimateDiff per-scene video
   * -------------------------------------------------------------------- */

  /**
   * Try to extract a video path from the SD WebUI "info" string.
   * Adjust this if your AnimateDiff fork stores it differently.
   */
  extractVideoPathFromInfo(infoString) {
    if (!infoString || typeof infoString !== 'string') {
      return null;
    }

    // Try JSON parse first
    try {
      const parsed = JSON.parse(infoString);

      // Some forks might store it like this:
      if (parsed.animatediff && parsed.animatediff.video_path) {
        return parsed.animatediff.video_path;
      }
      if (parsed.video_path) {
        return parsed.video_path;
      }
    } catch (_) {
      // Not JSON, ignore and fall back to regex
    }

    // Fallback: regex for .mp4 / .gif
    const mp4Match = infoString.match(/([^"'\s]+\.mp4)/i);
    if (mp4Match) return mp4Match[1];

    const gifMatch = infoString.match(/([^"'\s]+\.gif)/i);
    if (gifMatch) return gifMatch[1];

    return null;
  }

  /**
   * Build the AnimateDiff "alwayson_scripts" block.
   * This matches what AnimateDiff expects: `enable`, `model`, etc.
   */
  buildAnimateDiffBlock({ frames, fps }) {
    return {
      AnimateDiff: {
        args: [
          {
            // KEY NAME MUST BE "enable", not "enabled"
            enable: true,

            // IMPORTANT:
            // AnimateDiff uses the "model" field as the motion module.
            // This MUST match the dropdown text in the WebUI.
            model: this.motionModule,

            // Number of frames and FPS for the clip
            video_length: frames,
            fps: fps,

            // The rest are optional and depend on your AnimateDiff version.
            // Keeping them minimal so we don't break the schema.
            // If needed, you can add:
            // "stride": 1,
            // "overlap": 4,
            // "loop_mode": "none",
          },
        ],
      },
    };
  }

  /**
   * Generate a single animated scene via AnimateDiff.
   * This is what /api/video/animate-scenes calls internally.
   */
  async generateAnimatedScene({
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    cfgScale,
    samplerName,
    model,
    duration = 5,
    fps = 8,
  }) {
    // Compute raw frames from duration * fps
    const rawFrames = Math.round(duration * fps);
  
    // 🔒 Clamp to a safe range for AnimateDiff
    // You can try raising 24 → 32 once things are stable
    const frames = Math.max(8, Math.min(rawFrames, 16));
  
    console.log(
      `[AnimateDiff] duration=${duration}s, fps=${fps} -> rawFrames=${rawFrames}, clampedFrames=${frames}`
    );
  
    const payload = {
      prompt,
      negative_prompt:
        negativePrompt ||
        'blurry, low quality, distorted, ugly, bad anatomy, watermark, text',
      steps: steps || 10,
      cfg_scale: cfgScale || 7,
      width: width || 512,
      height: height || 512,
      sampler_name: samplerName || 'DPM++ 2M Karras',
      seed: -1,
      batch_size: 1,
      n_iter: 1,
      override_settings: {
        sd_model_checkpoint: model,
      },
      alwayson_scripts: this.buildAnimateDiffBlock({ frames, fps }),
    };
  
    console.log(
      `🎬 [AnimateDiff] Generating animated scene with motion module "${this.motionModule}", prompt: ${prompt.slice(
        0,
        80
      )}...`
    );
  
    const response = await axios.post(
      `${this.sdWebUIUrl}/sdapi/v1/txt2img`,
      payload,
      { timeout: 600000 }
    );
  
    const infoString = response.data.info || '';
    const videoPath = this.extractVideoPathFromInfo(infoString);
  
    if (!videoPath) {
      console.warn(
        '⚠️ AnimateDiff response did not contain a video path. Info snippet:',
        infoString.slice(0, 500)
      );
      return {
        success: false,
        videoPath: null,
        info: infoString,
        error: 'No video path found in AnimateDiff response',
      };
    }
  
    console.log('✅ [AnimateDiff] Video generated:', videoPath);
    return {
      success: true,
      videoPath,
      info: infoString,
    };
  }

  /**
   * Optional: multi-scene helper (not used directly by index.js, but handy)
   */
  async generateAnimatedStoryFromScenes(scenes, options = {}) {
    const results = [];
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i] || {};
      const prompt = scene.prompt || scene.description || 'romantic couple animation';

      try {
        const clip = await this.generateAnimatedScene({
          prompt,
          negativePrompt: options.negativePrompt,
          width: options.width,
          height: options.height,
          steps: options.steps,
          cfgScale: options.cfgScale,
          samplerName: options.sampler,
          model: options.model,
          duration: scene.duration || options.duration || 5,
          fps: options.fps || 12,
        });

        results.push({
          index: scene.index ?? i + 1,
          title: scene.title || `Scene ${i + 1}`,
          ...clip,
        });
      } catch (err) {
        console.error(`AnimateDiff failed for scene ${i + 1}:`, err.message);
        results.push({
          index: scene.index ?? i + 1,
          title: scene.title || `Scene ${i + 1}`,
          success: false,
          error: err.message,
        });
      }
    }

    return {
      success: true,
      sceneVideos: results,
    };
  }
}

module.exports = VideoGenerator;