// server/services/veoService.js
// Updated to match exact TypeScript SDK pattern
const { GoogleGenAI } = require("@google/genai");

class VeoService {
  constructor(apiKey, model = 'veo-3.1-generate-preview') {
    this.apiKey = apiKey;
    this.client = null;
    this.model = model;

    if (!apiKey) {
      console.warn('⚠️ Google Veo API key not provided');
    } else {
      // Initialize client with v1beta API version
      this.client = new GoogleGenAI({
        apiKey,
        httpOptions: { apiVersion: 'v1beta' }
      });
      console.log(`✅ Google Veo Service initialized (model: ${this.model})`);
    }
  }

  /**
   * Generate video from a single image using exact Google Studio API format
   * 
   * @param {Buffer} imageBuffer - Source image buffer (scene image)
   * @param {string} prompt - Scene prompt/description
   * @param {Object} options - Generation options
   * @returns {Promise<{videoBuffer: Buffer, success: boolean}>}
   */
  async generateVideoFromImage(imageBuffer, prompt, options = {}) {
    if (!this.client) {
      throw new Error('Veo service not initialized - missing API key');
    }

    const {
      aspectRatio = '16:9',
      resolution = '720p',
      numberOfVideos = 1,
    } = options;

    // Always use 8 seconds for Veo video generation
    const finalDuration = 8;

    console.log(`🎬 [Veo] Starting video generation...`);
    console.log(`   Prompt: "${prompt.substring(0, 80)}..."`);
    console.log(`   Duration: ${finalDuration}s, Aspect: ${aspectRatio}, Resolution: ${resolution}`);

    try {
      // Video generation config matching your working studio code exactly
      const videoConfig = {
        aspectRatio: aspectRatio,       // "16:9" or "16:10"
        numberOfVideos: numberOfVideos, // 1-4
        durationSeconds: finalDuration, // Must be 4-8
        resolution: resolution,         // "720p", "1080p", or "4k"
      };

      // Convert image buffer to base64
      const imageBase64 = imageBuffer.toString('base64');

      console.log(`   📋 Starting video generation...`);

      // Start video generation - matches official Veo 3.1 doc pattern
      let operation = await this.client.models.generateVideos({
        model: this.model,
        prompt: prompt,
        image: {
          imageBytes: imageBase64,
          mimeType: 'image/png',
        },
        config: videoConfig,
      });

      console.log(`   📋 Operation ${operation.name} initiated, polling for completion...`);

      // Poll until video generation is complete - EXACT TypeScript pattern
      while (!operation.done) {
        console.log(`   ⏳ Video ${operation.name} has not been generated yet. Check again in 10 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds

        // IMPORTANT: Use getVideosOperation instead of get()
        operation = await this.client.operations.getVideosOperation({
          operation: operation,
        });
      }

      console.log(`   ✅ Generated ${operation.response?.generatedVideos?.length ?? 0} video(s)`);

      // Get videos from response (not result!)
      const generatedVideos = operation.response?.generatedVideos;
      if (!generatedVideos || generatedVideos.length === 0) {
        console.error("No videos were generated.");
        throw new Error('No videos were generated');
      }

      // Download the first video - EXACT TypeScript pattern
      const generatedVideo = generatedVideos[0];
      const videoUri = generatedVideo?.video?.uri;

      if (!videoUri) {
        throw new Error('Video URI is missing from generated video');
      }

      console.log(`   📥 Video has been generated: ${videoUri}`);

      // Download by fetching URI with API key - EXACT TypeScript pattern
      const downloadUrl = `${videoUri}&key=${this.apiKey}`;
      console.log(`   ⬇️ Downloading video from URI...`);

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const videoBuffer = Buffer.from(arrayBuffer);

      console.log(`   ✅ Video downloaded successfully (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

      return {
        videoBuffer,
        success: true,
      };

    } catch (error) {
      console.error(`   ❌ Veo generation failed:`, error.message);

      // Provide helpful error messages
      if (error.message.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('Veo API quota exceeded. Please try again later.');
      }
      if (error.message.includes('INVALID_ARGUMENT')) {
        throw new Error('Invalid image format or prompt. Please check input.');
      }
      if (error.message.includes('PERMISSION_DENIED')) {
        throw new Error('Veo API access denied. Check API key permissions.');
      }

      throw error;
    }
  }

  /**
   * Generate an interpolated video from first and last frames
   * Matches exact official Veo 3.1 doc pattern:
   * - image (first frame) as primary input
   * - lastFrame in config
   *
   * @param {Buffer} firstFrame - First frame image buffer
   * @param {Buffer} lastFrame - Last frame image buffer
   * @param {string} prompt - Scene prompt/description
   * @param {Object} options - Generation options
   * @returns {Promise<{videoBuffer: Buffer, success: boolean}>}
   */
  async generateInterpolatedVideo(firstFrame, lastFrame, prompt, options = {}) {
    if (!this.client) {
      throw new Error('Veo service not initialized - missing API key');
    }

    const {
      aspectRatio = '16:9',
      resolution = '720p',
    } = options;

    const finalDuration = 8;

    console.log(`🎬 [Veo] Starting interpolated video (first + last frame)...`);
    console.log(`   Prompt: "${prompt.substring(0, 80)}..."`);
    console.log(`   Duration: ${finalDuration}s, Aspect: ${aspectRatio}`);

    try {
      const firstImageBase64 = firstFrame.toString('base64');
      const lastImageBase64 = lastFrame.toString('base64');

      // Exact pattern from official Veo 3.1 docs:
      // - image (first frame) is a primary input
      // - lastFrame goes in config as a generation constraint
      let operation = await this.client.models.generateVideos({
        model: this.model,
        prompt: prompt,
        image: {
          imageBytes: firstImageBase64,
          mimeType: 'image/png',
        },
        config: {
          aspectRatio: aspectRatio,
          numberOfVideos: 1,
          durationSeconds: finalDuration,
          resolution: resolution,
          lastFrame: {
            imageBytes: lastImageBase64,
            mimeType: 'image/png',
          },
        },
      });

      console.log(`   📋 Operation ${operation.name} initiated, polling for completion...`);

      // Poll until complete
      while (!operation.done) {
        console.log(`   ⏳ Video ${operation.name} not ready yet. Checking in 10 seconds...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        operation = await this.client.operations.getVideosOperation({
          operation: operation,
        });
      }

      console.log(`   ✅ Generated ${operation.response?.generatedVideos?.length ?? 0} video(s)`);

      const generatedVideos = operation.response?.generatedVideos;
      if (!generatedVideos || generatedVideos.length === 0) {
        console.error("No videos were generated.");
        throw new Error('No videos were generated');
      }

      const generatedVideo = generatedVideos[0];
      const videoUri = generatedVideo?.video?.uri;

      if (!videoUri) {
        throw new Error('Video URI is missing from generated video');
      }

      console.log(`   📥 Video has been generated: ${videoUri}`);

      const downloadUrl = `${videoUri}&key=${this.apiKey}`;
      console.log(`   ⬇️ Downloading video from URI...`);

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const videoBuffer = Buffer.from(arrayBuffer);

      console.log(`   ✅ Video downloaded successfully (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

      return {
        videoBuffer,
        success: true,
      };

    } catch (error) {
      console.error(`   ❌ Veo interpolation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get valid duration for Veo - always returns 8 seconds
   */
  getValidDuration() {
    return 8;
  }

  /**
   * Health check - verify the service is configured
   */
  isConfigured() {
    return !!this.client;
  }
}

module.exports = VeoService;
