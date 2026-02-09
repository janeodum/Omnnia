// server/index.js
require('dotenv').config();
const express = require('express');
const videoJobs = new Map(); // In production, use Redis
const imageJobs = new Map();
const R2Service = require('./services/r2Service');

const videoController = require('./controllers/videoController');
const stripeController = require('./controllers/stripeController');
const videoCombineController = require('./controllers/videoCombineController');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const cors = require('cors');
const path = require('path');
const axios = require("axios");
const fs = require('fs');
const crypto = require('crypto');

// Import components (unchanged)
const ImageGenerator = require('./components/imageGenerator');
const StoryProcessor = require('./components/storyProcessor');
const VideoGenerator = require('./components/videoGenerator'); // kept for FFmpeg fallback route
const ProgressTracker = require('./components/progressTracker');
const StoryboardService = require('./services/storyboardService');
const { getStyleById, DEFAULT_NEGATIVE_PROMPT } = require('./config/styles');
const { ensureDir, saveBase64File } = require('./services/photoStorage');
const { saveAndResizeBase64, renderWithSora } = require('./components/soraClient');
const ElevenLabsService = require('./services/elevenLabsService');
const GoogleTtsService = require('./services/googleTtsService');
const NarrationService = require('./services/narrationService');
const AudioVideoMerger = require('./services/audioVideoMerger');
const r2Service = new R2Service();

// Initialize services
const elevenLabs = new ElevenLabsService(process.env.ELEVENLABS_API_KEY);
const googleTts = new GoogleTtsService(process.env.GOOGLE_IMAGEN_API_KEY);
const narrationService = new NarrationService(process.env.OPENAI_API_KEY);
const audioVideoMerger = new AudioVideoMerger(path.join(__dirname, 'temp'));

// Store user voice clones (use Redis in production)
const userVoiceClones = new Map();
const ComfyService = require('./services/comfyService');
const GoogleImagenService = require('./services/googleImagenService');
const VeoService = require('./services/veoService');
const comfyWorkflow = require('./config/comfy_svd_xt_workflow.json');
const wanSingleImageWorkflow = require('./config/wan_single_image_workflow.json');
const fluxIPAdapterWorkflow = require('./config/flux_image_workflow.json');
const voiceRoutes = require('./routes/voiceRoutes');
console.log('Comfy workflow keys:', Object.keys(comfyWorkflow));
const COMFY_URL = process.env.COMFY_API_URL || 'http://127.0.0.1:8188';
const comfyService = new ComfyService(
  COMFY_URL, // e.g. https://api.runpod.ai/v2/vxx...
  process.env.RUNPOD_API_KEY       // Your API Key
);
const googleImagenService = new GoogleImagenService(process.env.GOOGLE_IMAGEN_API_KEY);
const veoService = new VeoService(process.env.GOOGLE_IMAGEN_API_KEY); // Uses same API key as Imagen
const USE_VEO = process.env.VIDEO_PROVIDER !== 'runpod'; // Default to Veo unless strictly set to 'runpod'
if (USE_VEO) {
  console.log('🎥 Video Provider: Google Veo (Default)');
} else {
  console.log('🎥 Video Provider: RunPod/ComfyUI (Legacy)');
}
// --- FFmpeg for frame extraction ---
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

// --- OpenAI (Sora) client ---
let openai = null;
try {
  // OpenAI Node SDK v4+ (CJS)
  const OpenAI = require('openai');
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_URL || undefined, // optional override
  });
} catch (e) {
  // If OpenAI package not installed, we won't crash server; routes will check and error nicely.
  console.warn('OpenAI SDK not available. Install with: npm i openai');
}


const app = express();
app.set("trust proxy", 1);


const PORT = process.env.PORT || 5050;
const SD_WEBUI_URL = process.env.SD_WEBUI_URL || 'http://127.0.0.1:7866';

// Sora config
const SORA_MODEL = process.env.SORA_MODEL || 'sora-2';
const SORA_DEFAULT_SECONDS = parseFloat(process.env.SORA_DEFAULT_SECONDS || '6');

// Paths
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const VIDEO_ROOT = process.env.VIDEO_ROOT || path.join(__dirname, 'output/videos');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'tmp');

ensureDir(UPLOAD_ROOT);
ensureDir(VIDEO_ROOT);
ensureDir(TEMP_DIR);

// Initialize components (unchanged)
const imageGen = new ImageGenerator(SD_WEBUI_URL);
const storyProc = new StoryProcessor();
const videoGen = new VideoGenerator(SD_WEBUI_URL, VIDEO_ROOT);
const progressTracker = new ProgressTracker(SD_WEBUI_URL);
const storyboardService = new StoryboardService({
  apiKey: process.env.OPENAI_API_KEY,
  apiUrl: process.env.OPENAI_API_URL,
  model: process.env.OPENAI_MODEL,
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  provider: process.env.STORYBOARD_PROVIDER || 'gemini',
});

const corsOptions = {
  origin: function (origin, callback) {
    console.log('🌐 CORS check for origin:', origin);

    const allowedOrigins = [
      'http://identitytoolkit.googleapis.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'https://omnnia.studio',
      'https://omnia.studio',
      'https://www.omnnia.studio',
      'https://www.omnia.studio',
      'https://omnia-webui-production.up.railway.app',
      'https://omnia-webui-o7jmcizue-janeodums-projects.vercel.app',
      'https://securetoken.googleapis.com',
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // Check exact match
    if (allowedOrigins.includes(origin)) {
      console.log('CORS allowed:', origin);
      return callback(null, true);
    }

    // Allow any Vercel preview URL
    if (origin.endsWith('.vercel.app')) {
      console.log('CORS allowed (Vercel):', origin);
      return callback(null, true);
    }

    // Allow any Railway URL
    if (origin.endsWith('.up.railway.app')) {
      console.log('CORS allowed (Railway):', origin);
      return callback(null, true);
    }

    console.warn('CORS origin not in list:', origin);
    // Allow anyway for debugging (remove in production)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeController.handleWebhook
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api/voice', voiceRoutes);

// Static mounts
app.use('/uploads', express.static(UPLOAD_ROOT));
app.use(express.static(UPLOAD_ROOT));
app.use('/videos', express.static(VIDEO_ROOT));

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------- Helpers ----------
function dataUrlToBuffer(dataUrl) {
  // supports "data:image/png;base64,xxxx"
  const i = dataUrl.indexOf('base64,');
  if (i === -1) return null;
  const b64 = dataUrl.slice(i + 'base64,'.length);
  return Buffer.from(b64, 'base64');
}

function saveDataUriMp4ToDisk(dataUriOrBase64, outDir, filename) {
  const clean = String(dataUriOrBase64)
    .replace(/^data:video\/mp4;base64,/, "")
    .replace(/^data:application\/octet-stream;base64,/, "");
  const buf = Buffer.from(clean, "base64");
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, buf);
  return outPath;
}

function base64ToBufferMaybePrefixed(str) {
  if (str.startsWith('data:')) return dataUrlToBuffer(str);
  // plain base64
  return Buffer.from(str, 'base64');
}

function makeTempImagePath(ext = '.png') {
  const id = crypto.randomBytes(8).toString('hex');
  return path.join(TEMP_DIR, `ref_${id}${ext}`);
}

async function saveReferenceImageToDisk(ref) {
  if (!ref) return null;

  if (typeof ref === 'string') {
    // Path on disk?
    if (fs.existsSync(ref)) return ref;

    // HTTP/HTTPS URL? Download it first!
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      console.log('📥 Downloading image from URL:', ref.substring(0, 80) + '...');
      try {
        const response = await axios.get(ref, {
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        const buf = Buffer.from(response.data);
        const out = makeTempImagePath('.png');
        fs.writeFileSync(out, buf);
        console.log('✅ Downloaded and saved to:', out);
        return out;
      } catch (err) {
        console.error('❌ Failed to download image:', err.message);
        return null;
      }
    }

    // Data URL or base64
    const buf = ref.startsWith('data:') ? dataUrlToBuffer(ref) : Buffer.from(ref, 'base64');
    if (!buf) return null;
    const out = makeTempImagePath('.png');
    fs.writeFileSync(out, buf);
    return out;
  }

  if (Buffer.isBuffer(ref)) {
    const out = makeTempImagePath('.png');
    fs.writeFileSync(out, ref);
    return out;
  }

  return null;
}



/**
 * Generate narration scripts
 */
app.post('/api/narration/scripts', async (req, res) => {
  try {
    const { scenes, partner1Name, partner2Name, storyHighlights, sceneDuration } = req.body;

    if (!scenes || scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'No scenes provided' });
    }

    const narrations = await narrationService.generateAllNarrations(scenes, {
      partner1Name,
      partner2Name,
      storyHighlights,
      sceneDuration,
    });

    res.json({ success: true, narrations });
  } catch (error) {
    console.error('Narration script error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate TTS audio for narrations
 */
app.post('/api/narration/audio', async (req, res) => {
  try {
    const { narrations, voiceType, userId } = req.body;

    if (!narrations || narrations.length === 0) {
      return res.status(400).json({ success: false, error: 'No narrations provided' });
    }

    // Get voice ID
    let voiceId;
    if (voiceType === 'custom') {
      voiceId = userVoiceClones.get(userId);
      if (!voiceId) {
        return res.status(400).json({
          success: false,
          error: 'No custom voice found. Please record your voice first.'
        });
      }
    } else {
      voiceId = elevenLabs.getVoiceId(voiceType);
    }

    const audioDir = path.join(__dirname, 'temp', 'narrations');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const audioFiles = [];

    for (const narration of narrations) {
      const audioPath = path.join(audioDir, `narration_${narration.sceneIndex}_${Date.now()}.mp3`);

      await elevenLabs.generateNarrationAudio(narration.narration, voiceId, audioPath);

      audioFiles.push({
        sceneIndex: narration.sceneIndex,
        audioPath,
        text: narration.narration,
      });

      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    }

    res.json({ success: true, audioFiles });
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Merge narration audio with videos
 */
app.post('/api/video/add-narration', async (req, res) => {
  try {
    const { videos, audioFiles, backgroundMusic } = req.body;

    // Map music preference to file path
    const musicPaths = {
      'Romantic Piano': path.join(__dirname, 'assets/music/romantic-piano.mp3'),
      'Upbeat & Joyful': path.join(__dirname, 'assets/music/upbeat.mp3'),
      'Cinematic Orchestra': path.join(__dirname, 'assets/music/cinematic.mp3'),
      'Acoustic Guitar': path.join(__dirname, 'assets/music/acoustic.mp3'),
    };

    const musicPath = musicPaths[backgroundMusic] || null;
    const outputDir = path.join(__dirname, 'temp', 'merged');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const mergedVideos = [];

    for (const video of videos) {
      const audioFile = audioFiles.find(a => a.sceneIndex === video.index);
      const outputPath = path.join(outputDir, `merged_${video.index}_${Date.now()}.mp4`);

      // Download video from R2 first
      const localVideoPath = path.join(outputDir, `video_${video.index}_${Date.now()}.mp4`);
      const videoResponse = await axios.get(video.url, { responseType: 'arraybuffer' });
      fs.writeFileSync(localVideoPath, Buffer.from(videoResponse.data));

      if (audioFile && fs.existsSync(audioFile.audioPath)) {
        await audioVideoMerger.mergeSceneAudioVideo(
          localVideoPath,
          audioFile.audioPath,
          outputPath,
          { backgroundMusicPath: musicPath }
        );
      } else if (musicPath) {
        await audioVideoMerger.addMusicToVideo(localVideoPath, musicPath, outputPath);
      } else {
        fs.copyFileSync(localVideoPath, outputPath);
      }

      // Upload to R2
      const r2Url = await r2Service.uploadVideo(outputPath);

      mergedVideos.push({
        index: video.index,
        title: video.title,
        url: r2Url,
        success: true,
      });

      // Cleanup
      if (fs.existsSync(localVideoPath)) fs.unlinkSync(localVideoPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }

    res.json({ success: true, videos: mergedVideos });
  } catch (error) {
    console.error('Merge error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/comfy/view", async (req, res) => {
  try {
    const { filename, subfolder = "", type = "output" } = req.query;
    if (!filename) return res.status(400).send("Missing filename");

    const url =
      `${COMFY_URL}/view?filename=${encodeURIComponent(filename)}` +
      `&subfolder=${encodeURIComponent(subfolder)}` +
      `&type=${encodeURIComponent(type)}`;

    // ✅ Forward Range header if the browser requests it
    const range = req.headers.range;

    const r = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
        ...(range ? { Range: range } : {}),
      },
      responseType: "stream",
      timeout: 120_000,
      validateStatus: () => true,
    });

    if (r.status !== 200 && r.status !== 206) {
      res.status(r.status).send(`Upstream /view failed: ${r.status}`);
      return;
    }

    // ✅ Forward important headers for video streaming
    const passthroughHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ];

    passthroughHeaders.forEach((h) => {
      if (r.headers[h]) res.setHeader(h, r.headers[h]);
    });

    // ✅ Make sure status matches upstream (200 or 206)
    res.status(r.status);

    r.data.pipe(res);
  } catch (e) {
    res.status(500).send(e.message);
  }
});


app.post('/api/generate-story', videoController.generateStoryVideo);
// Middleware
/**
 * Queue SVD img2vid jobs in ComfyUI for multiple scenes.
 * Body:
 * {
 *   scenes: [{ image: "data:image/png;base64,...", title, description }, ...]
 * }
 */
// server/index.js

/**
 * Start video generation (returns immediately with jobId)
 */
app.post('/api/video/comfy-scenes', async (req, res) => {
  try {
    const { scenes = [], returnBase64 = false } = req.body || {};

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'No scenes provided' });
    }

    // Generate a unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job status
    videoJobs.set(jobId, {
      status: 'processing',
      total: scenes.length,
      completed: 0,
      results: [],
      scenes: scenes, // Persist scenes for retry
      error: null,
      startedAt: Date.now(),
    });

    // Return immediately with job ID
    res.json({
      success: true,
      jobId,
      message: 'Video generation started',
      total: scenes.length,
    });

    // Process in background (don't await!)
    processVideoJobParallel(jobId, scenes, returnBase64, req);

  } catch (error) {
    console.error('Error starting video job:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper: Extract last frame from video as base64
 */
async function extractLastFrame(videoUrlOrPath) {
  return new Promise((resolve, reject) => {
    const tempFramePath = path.join(__dirname, 'temp', `frame_${Date.now()}.png`);

    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, 'temp'))) {
      fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
    }

    // Download video if it's a URL
    let videoPath = videoUrlOrPath;
    if (videoUrlOrPath.startsWith('http')) {
      // For URLs, we'll need to download first or use ffmpeg's URL support
      // ffmpeg can handle URLs directly in most cases
      videoPath = videoUrlOrPath;
    }

    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['99%'], // Last frame
        filename: path.basename(tempFramePath),
        folder: path.dirname(tempFramePath),
        size: '1024x576'
      })
      .on('end', () => {
        try {
          // Read the frame and convert to base64
          const frameBuffer = fs.readFileSync(tempFramePath);
          const base64Frame = frameBuffer.toString('base64');

          // Clean up temp file
          fs.unlinkSync(tempFramePath);

          resolve(base64Frame);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        console.error('FFmpeg error extracting frame:', err);
        reject(err);
      });
  });
}


/**
 * Generate multi-clip video with sequential clip generation
 * For 60s video: generates 6 clips of 10s each
 * Clips must be sequential because each uses the last frame of the previous
 */
async function generateMultiClipVideoParallel(baseImage, prompt, targetDuration, sceneIndex) {
  const MAX_CLIP_DURATION = USE_VEO ? 8 : 10;

  // Calculate clips
  const numClips = Math.ceil(targetDuration / MAX_CLIP_DURATION);
  const clips = [];

  console.log(`🎬 Scene ${sceneIndex}: Generating ${numClips} clips for ${targetDuration}s (Provider: ${USE_VEO ? 'Veo' : 'RunPod'})`);

  let currentImage = baseImage;
  let remainingDuration = targetDuration;

  for (let clipIndex = 0; clipIndex < numClips; clipIndex++) {
    // Calculate duration for this clip
    let clipDuration;
    if (USE_VEO) {
      // Distribute for Veo to satisfy discrete duration constraints
      // e.g. 10s / 2 clips -> 4s + 6s (instead of 5s + 5s)
      const clipsLeft = numClips - clipIndex;
      const targetClipDuration = remainingDuration / clipsLeft;

      clipDuration = veoService.getValidDuration(targetClipDuration);
    } else {
      // RunPod existing logic (maximize clip length)
      clipDuration = Math.min(MAX_CLIP_DURATION, remainingDuration);
    }

    // Update remaining for next iteration (approximate if we modified clipDuration)
    // Actually simplicity:
    // If we just use the calculated clipDuration, we just subtract it.
    remainingDuration -= clipDuration;

    console.log(`  📹 Scene ${sceneIndex} Clip ${clipIndex + 1}/${numClips}: ${clipDuration.toFixed(1)}s`);

    try {
      let videoUrl = null;

      if (USE_VEO) {
        // --- Veo Generation ---
        const imageBuffer = base64ToBufferMaybePrefixed(currentImage);
        if (!imageBuffer) throw new Error("Invalid image for Veo generation");

        /* 
           Note: We use generateVideoFromImage for sequential clips. 
           If we wanted smooth transitions, we could check if we have a 'nextImage' (not available here yet) 
           and use generateInterpolatedVideo. For now, sequential generation is safer.
        */
        const finalDuration = veoService.getValidDuration(clipDuration);

        const result = await veoService.generateVideoFromImage(imageBuffer, prompt, {
          duration: finalDuration
        });

        if (!result.success || !result.videoBuffer) {
          throw new Error("Veo generation failed to return video buffer");
        }

        // Upload to R2
        const r2Filename = `veo_clip_${Date.now()}_${sceneIndex}_${clipIndex}.mp4`;
        videoUrl = await r2Service.uploadBuffer(result.videoBuffer, r2Filename, 'video/mp4', 'videos');
        console.log(`  ✅ Veo Clip Uploaded: ${videoUrl}`);

      } else {
        // --- RunPod Generation (Legacy) ---
        const tempPath = await saveReferenceImageToDisk(currentImage);
        const uploadInfo = await comfyService.uploadImage(tempPath);
        const comfyJobId = await comfyService.queuePrompt(uploadInfo, comfyWorkflow, prompt);
        const out = await comfyService.waitForVideo(comfyJobId);

        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        if (!out?.filenameOrUrl) {
          throw new Error(`Clip ${clipIndex + 1} failed: no video returned`);
        }

        videoUrl = out.filenameOrUrl;

        // Ensure we have a URL (not just filename)
        if (!videoUrl.startsWith('http')) {
          const r2Url = await fetchVideoFromRunPodAndUploadToR2(videoUrl);
          if (r2Url) videoUrl = r2Url;
        }
      }

      clips.push({
        index: clipIndex,
        url: videoUrl,
        duration: clipDuration,
      });

      // Extract last frame for next clip (for continuity)
      if (clipIndex < numClips - 1) {
        console.log(`  🎞️ Extracting last frame for next clip...`);
        currentImage = await extractLastFrame(videoUrl);
      }

    } catch (err) {
      console.error(`❌ Scene ${sceneIndex} Clip ${clipIndex + 1} failed:`, err.message);
      throw err;
    }
  }

  return clips;
}


async function fetchVideoFromRunPodAndUploadToR2(filename) {
  // Try empty subfolder first (correct path), then 'output'
  const subfolders = ['', 'output'];

  for (const subfolder of subfolders) {
    try {
      const viewUrl = `${COMFY_URL}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
      console.log(`🔍 Fetching video: ${viewUrl}`);

      const response = await axios.get(viewUrl, {
        headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}` },
        responseType: 'arraybuffer',
        timeout: 180000,
      });

      if (response.status === 200 && response.data.length > 10000) {
        console.log(`✅ Got video (${Math.round(response.data.length / 1024 / 1024)}MB)`);
        const buffer = Buffer.from(response.data);
        const r2Filename = `video_${Date.now()}_${filename}`;
        const r2Url = await r2Service.uploadBuffer(buffer, r2Filename, 'video/mp4', 'videos');
        console.log(`✅ Uploaded to R2: ${r2Url}`);
        return r2Url;
      }
    } catch (err) {
      console.log(`⚠️ Subfolder "${subfolder}" failed: ${err.message}`);
    }
  }

  console.error(`❌ Could not fetch video: ${filename}`);
  return null;
}

/**
 * Process multiple scenes in parallel batches
 */
async function processVideoJobParallel(jobId, scenes, returnBase64, req) {
  const job = videoJobs.get(jobId);
  const PARALLEL_WORKERS = 5; // How many scenes to process simultaneously (5 RunPod workers)

  try {
    // Process scenes in parallel batches
    for (let batchStart = 0; batchStart < scenes.length; batchStart += PARALLEL_WORKERS) {
      const batch = scenes.slice(batchStart, batchStart + PARALLEL_WORKERS);

      console.log(`🎬 Processing batch: scenes ${batchStart + 1}-${batchStart + batch.length}`);

      const batchPromises = batch.map((scene, batchIndex) => {
        const globalIndex = batchStart + batchIndex + 1;
        return processOneScene(scene, globalIndex, job);
      });

      const batchResults = await Promise.allSettled(batchPromises);

      // Collect results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const globalIndex = batchStart + i + 1;

        if (result.status === 'fulfilled') {
          job.results.push(result.value);
        } else {
          job.results.push({
            index: globalIndex,
            title: batch[i]?.title || `Scene ${globalIndex}`,
            success: false,
            error: result.reason?.message || 'Unknown error',
          });
        }
        job.completed++;
      }
    }

    // Auto-generate background music via ElevenLabs when using Veo (no narration, music only)
    if (USE_VEO) {
      try {
        const successfulVideos = job.results.filter(r => r.success);
        const totalDurationMs = successfulVideos.length * 8 * 1000; // 8 seconds per Veo video
        const musicDurationMs = Math.max(totalDurationMs, 15000); // Minimum 15 seconds

        console.log(`🎵 [Veo] Auto-generating background music (${musicDurationMs}ms)...`);
        const musicBuffer = await elevenLabs.generateMusic('romantic_piano', musicDurationMs, 'instrumental only, no vocals');
        const musicKey = `music/auto_${Date.now()}.mp3`;
        const musicUrl = await r2Service.uploadBuffer(musicBuffer, musicKey, 'audio/mpeg', 'music');
        job.musicUrl = musicUrl;
        console.log(`✅ Background music generated and uploaded: ${musicUrl}`);
      } catch (musicErr) {
        console.warn(`⚠️ Auto music generation failed (videos still OK):`, musicErr.message);
      }
    }

    job.status = 'completed';
    job.completedAt = Date.now();
    console.log(`✅ Job ${jobId} completed: ${job.completed}/${job.total} scenes`);

  } catch (err) {
    console.error(`❌ Fatal error in job ${jobId}:`, err);
    job.status = 'failed';
    job.error = err.message;
  }
}

/**
 * Helper: resolve a frame source (URL or base64) to a comfyService upload object
 */
async function resolveFrameToUpload(frameSource, label) {
  if (!frameSource) return null;

  // If it's a URL, download it first
  if (typeof frameSource === 'string' && frameSource.startsWith('http')) {
    const response = await axios.get(frameSource, { responseType: 'arraybuffer', timeout: 30000 });
    const base64 = Buffer.from(response.data).toString('base64');
    const filename = `${label}_${Date.now()}.png`;
    return { name: filename, image: base64 };
  }

  // If it's base64 (possibly with data: prefix)
  if (typeof frameSource === 'string') {
    let base64Data = frameSource;
    if (frameSource.startsWith('data:')) {
      const match = frameSource.match(/^data:[^;]+;base64,(.+)$/);
      if (match) base64Data = match[1];
    }
    const filename = `${label}_${Date.now()}.png`;
    return { name: filename, image: base64Data };
  }

  return null;
}

/**
 * Helper: submit a RunPod job and wait for video, then upload to R2
 */
async function runRunPodVideoJob(firstUpload, lastUpload, prompt, label) {
  const comfyJobId = await comfyService.queueFirstLastFrame(
    firstUpload, lastUpload, comfyWorkflow, prompt
  );
  console.log(`  📹 ${label}: RunPod job ${comfyJobId} submitted`);

  const out = await comfyService.waitForVideo(comfyJobId);
  let filenameOrUrl = out?.filenameOrUrl;

  if (!filenameOrUrl) {
    throw new Error(`${label}: no video returned`);
  }

  // Ensure we have an R2 URL
  const urlPath = filenameOrUrl.split('?')[0].toLowerCase();
  const hasValidVideoUrl = filenameOrUrl.startsWith('http') && urlPath.endsWith('.mp4');

  if (!hasValidVideoUrl) {
    console.log(`  📤 ${label}: fetching from RunPod and uploading to R2...`);
    const r2Url = await fetchVideoFromRunPodAndUploadToR2(filenameOrUrl);
    if (r2Url) {
      filenameOrUrl = r2Url;
    } else {
      throw new Error(`${label}: could not retrieve video from RunPod`);
    }
  }

  console.log(`  ✅ ${label}: ${filenameOrUrl.substring(0, 80)}...`);
  return filenameOrUrl;
}

/**
 * Background processor for video generation
 * One worker per scene: uses single image for video generation
 * Also generates TTS audio for scene narration
 * Parallelism happens at the scene level (5 workers = 5 scenes at once)
 */
async function processOneScene(scene, index, job) {
  const scenePrompt = scene.description || scene.title || "A cinematic 3d animation";
  const title = scene.title || `Scene ${index}`;
  const frames = scene.frames || [];
  const narration = scene.narration || '';

  job.currentScene = index;
  job.currentTitle = title;

  console.log(`🎬 Processing scene ${index}: "${title}" (${frames.length} frames)`);

  try {
    let filenameOrUrl = null;
    let audioUrl = null;

    // Get image for video generation
    const base64Image = frames[0]?.imageUrl || frames[0]?.image || frames[0] || scene.image || scene.referenceImage;
    if (!base64Image) throw new Error("Missing image");

    if (USE_VEO) {
      // ==========================================
      // VEO VIDEO GENERATION (Google) - First+Last Frame Interpolation
      // ==========================================
      console.log(`  🎞️ Scene ${index}: Using Google Veo for video generation`);

      // Helper to convert frame source to buffer
      const toBuffer = async (source) => {
        if (!source) return null;
        if (Buffer.isBuffer(source)) return source;
        if (typeof source === 'string') {
          if (source.startsWith('data:')) {
            return Buffer.from(source.split(',')[1], 'base64');
          } else if (source.startsWith('http')) {
            const response = await axios.get(source, { responseType: 'arraybuffer', timeout: 30000 });
            return Buffer.from(response.data);
          } else {
            return Buffer.from(source, 'base64');
          }
        }
        // If it's a frame object
        const src = source?.imageUrl || source?.image || source?.url;
        if (src) return toBuffer(src);
        return null;
      };

      // Get first and last frame buffers
      const firstFrameBuffer = await toBuffer(frames[0]?.imageUrl || frames[0]?.image || frames[0] || scene.image || scene.referenceImage);
      const lastFrameBuffer = frames.length >= 2 ? await toBuffer(frames[frames.length - 1]?.imageUrl || frames[frames.length - 1]?.image || frames[frames.length - 1]) : null;

      if (!firstFrameBuffer) throw new Error("Missing image buffer for Veo");

      // Build Veo video prompt with strong Pixar 3D style enforcement
      const veoPrompt = `3D Pixar animation style. Maintain the EXACT same 3D animated cartoon style as the input image(s). Do NOT make it realistic or live-action. Keep the same art style, rendering, and character design throughout every frame of the video. ${scene.title || 'Romantic scene'}. ${scene.description || ''} Smooth cinematic camera movement, warm lighting.`.trim();

      let veoResult;
      if (lastFrameBuffer) {
        // Use interpolation with first + last frame
        console.log(`  📹 Scene ${index}: Veo interpolation (first + last frame)...`);
        veoResult = await veoService.generateInterpolatedVideo(firstFrameBuffer, lastFrameBuffer, veoPrompt, { aspectRatio: '16:9' });
      } else {
        // Fallback to single image if only one frame
        console.log(`  📹 Scene ${index}: Veo single image (only 1 frame available)...`);
        veoResult = await veoService.generateVideoFromImage(firstFrameBuffer, veoPrompt, { aspectRatio: '16:9' });
      }

      if (!veoResult.success || !veoResult.videoBuffer) {
        throw new Error('Veo video generation failed');
      }

      // Upload to R2
      const videoKey = `videos/veo_scene${index}_${Date.now()}.mp4`;
      filenameOrUrl = await r2Service.uploadBuffer(veoResult.videoBuffer, videoKey, 'video/mp4', 'videos');
      console.log(`  ✅ Veo video uploaded to R2: ${filenameOrUrl.substring(0, 60)}...`);

    } else {
      // ==========================================
      // RUNPOD/COMFYUI VIDEO GENERATION (Wan 2.1)
      // ==========================================
      const frameUpload = await resolveFrameToUpload(base64Image, `scene${index}_frame`);
      if (!frameUpload) throw new Error("Could not resolve image");

      console.log(`  🎞️ Scene ${index}: Single-image Wan I2V → RunPod job`);

      // Use single-image Wan 2.1 I2V workflow (node 20 only)
      const comfyJobId = await comfyService.queuePrompt(frameUpload, wanSingleImageWorkflow, scenePrompt);
      const out = await comfyService.waitForVideo(comfyJobId);
      filenameOrUrl = out?.filenameOrUrl;

      if (filenameOrUrl && !(filenameOrUrl.startsWith('http') && filenameOrUrl.split('?')[0].toLowerCase().endsWith('.mp4'))) {
        const r2Url = await fetchVideoFromRunPodAndUploadToR2(filenameOrUrl);
        if (r2Url) filenameOrUrl = r2Url;
      }
    }

    if (!filenameOrUrl) throw new Error("Video generated but could not be retrieved");

    // Generate narration audio if narration text exists (skip for Veo - music only)
    if (!USE_VEO && narration && narration.trim().length > 0) {
      try {
        console.log(`  🗣️ Scene ${index}: Generating narration audio...`);
        const audioPath = path.join(__dirname, 'temp', `narration_${job.id || 'temp'}_scene${index}.wav`);

        // Generate TTS using Gemini 2.5 Flash TTS (default to female voice)
        await googleTts.generateSpeech(narration, 'female', audioPath);

        // Upload to R2
        const audioBuffer = fs.readFileSync(audioPath);
        const audioKey = `audio/narration_${Date.now()}_scene${index}.wav`;
        audioUrl = await r2Service.uploadBuffer(audioBuffer, audioKey, 'audio/wav', 'audio');

        // Cleanup temp file
        fs.unlinkSync(audioPath);
        console.log(`  ✅ Scene ${index}: Narration audio uploaded`);
      } catch (audioErr) {
        console.warn(`  ⚠️ Scene ${index}: Audio generation failed (video still OK):`, audioErr.message);
        // Don't fail the whole scene, just skip audio
      }
    } else if (USE_VEO) {
      console.log(`  🎵 Scene ${index}: Skipping narration (Veo mode - music only)`);
    }

    return {
      index,
      title,
      prompt: scenePrompt,
      narration,
      success: true,
      url: filenameOrUrl,
      audioUrl: audioUrl || null,
    };

  } catch (err) {
    console.error(`❌ Scene ${index} failed:`, err.message);
    throw err;
  }
}

/**
 * Retry a specific scene
 */
app.post('/api/video/retry/:jobId/:sceneIndex', async (req, res) => {
  try {
    const { jobId, sceneIndex } = req.params;
    const job = videoJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const index = parseInt(sceneIndex); // 1-based index from URL
    if (isNaN(index) || index < 1 || index > job.scenes.length) {
      return res.status(400).json({ success: false, error: 'Invalid scene index' });
    }

    // Array is 0-based, so subtract 1
    const scene = job.scenes[index - 1];

    console.log(`🔄 Retrying scene ${index} for job ${jobId}`);

    // Update status to processing for UI feedback if needed, 
    // or just trigger the background process

    // Process in background
    processOneScene(scene, index, job).then(result => {
      // Update job.results
      const existingResultIndex = job.results.findIndex(r => r.index === index);
      if (existingResultIndex !== -1) {
        job.results[existingResultIndex] = result;
      } else {
        job.results.push(result);
      }
      console.log(`✅ Retry completed for scene ${index}`);
    }).catch(err => {
      console.error(`❌ Retry failed for scene ${index}:`, err);
      // Update result with error
      const errorResult = {
        index: index,
        title: scene.title || `Scene ${index}`,
        success: false,
        error: err.message
      };
      const existingResultIndex = job.results.findIndex(r => r.index === index);
      if (existingResultIndex !== -1) {
        job.results[existingResultIndex] = errorResult;
      } else {
        job.results.push(errorResult);
      }
    });

    res.json({ success: true, message: "Retry started" });

  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Check job status
 */
app.get('/api/video/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = videoJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  const elapsedSeconds = Math.floor((Date.now() - job.startedAt) / 1000);
  console.log(`📊 Status check for ${jobId}: ${job.status} (${job.completed}/${job.total}) - Scene: ${job.currentScene} "${job.currentTitle}" - Elapsed: ${elapsedSeconds}s`);

  res.json({
    success: true,
    jobId,
    status: job.status,
    total: job.total,
    completed: job.completed,
    currentScene: job.currentScene,
    currentTitle: job.currentTitle,
    results: job.status === 'completed' ? job.results : [],
    videos: job.status === 'completed' ? job.results : [],
    musicUrl: job.musicUrl || null,
    error: job.error,
    elapsed: Date.now() - job.startedAt,
  });
});

/**
 * Debug endpoint: Check all active jobs
 */
app.get('/api/video/debug/jobs', (req, res) => {
  const jobs = [];
  for (const [jobId, job] of videoJobs.entries()) {
    jobs.push({
      jobId,
      status: job.status,
      total: job.total,
      completed: job.completed,
      currentScene: job.currentScene,
      currentTitle: job.currentTitle,
      error: job.error,
      elapsedSeconds: Math.floor((Date.now() - job.startedAt) / 1000),
    });
  }
  res.json({ success: true, jobs });
});

// Optional: Cleanup old jobs periodically
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of videoJobs.entries()) {
    // Remove jobs older than 1 hour
    if (now - job.startedAt > 60 * 60 * 1000) {
      videoJobs.delete(jobId);
    }
  }
}, 60000);

// ---------- Routes ----------

/**
 * Create storyboard via OpenAI (or fallback template)
 */
app.post('/api/storyboard', async (req, res) => {
  try {
    const scenes = await storyboardService.generateStoryboard(req.body || {});
    res.json({ scenes });
  } catch (error) {
    console.error('Error generating storyboard:', error);
    res.status(400).json({ error: error.message || 'Unable to build storyboard' });
  }
});

function fileToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}


/**
 * Regenerate a single scene (synchronous)
 * Used for the "regenerate" button on individual scenes
 */
app.post('/api/generate-scenes', async (req, res) => {
  try {
    const {
      styleId,
      scenes = [],
      settings = {},
      partner1Name,
      partner2Name,
      partner1Race,
      partner2Race,
      partner1Ethnicity,
      partner2Ethnicity,
      partner1Height,
      partner2Height,
      partner1Sex,
      partner1Gender,
      partner2Sex,
      partner2Gender,
      partner1AgeWhenMet,
      partner2AgeWhenMet,
      partner1CurrentAge,
      partner2CurrentAge,
      meetingGeography,
      photoReferences = {},
    } = req.body || {};

    if (!styleId || !scenes.length) {
      return res.status(400).json({ error: 'Missing styleId or scenes' });
    }

    const style = getStyleById(styleId);
    if (!style) {
      return res.status(400).json({ error: `Unknown style: ${styleId}` });
    }

    // Take first scene for regeneration
    const scene = scenes[0];

    // Build couple visual line (same as async endpoint)
    const p1 = partner1Name || 'Partner 1';
    const p2 = partner2Name || 'Partner 2';

    function normalizeSexOrGender(value) {
      if (!value) return null;
      const s = String(value).toLowerCase().trim();
      if (['m', 'male', 'man', 'boy'].includes(s)) return 'man';
      if (['f', 'female', 'woman', 'girl'].includes(s)) return 'woman';
      return null;
    }

    const sex1 = normalizeSexOrGender(partner1Sex || partner1Gender);
    const sex2 = normalizeSexOrGender(partner2Sex || partner2Gender);
    const isHetero = sex1 && sex2 && sex1 !== sex2;

    const p1Parts = [partner1Race, partner1Ethnicity].filter(Boolean);
    const p2Parts = [partner2Race, partner2Ethnicity].filter(Boolean);
    const p1Desc = p1Parts.length ? `${p1} (${p1Parts.join(', ')})` : p1;
    const p2Desc = p2Parts.length ? `${p2} (${p2Parts.join(', ')})` : p2;
    const geoText = meetingGeography ? ` in ${meetingGeography}` : '';

    const coupleVisualLine = [
      isHetero
        ? `a romantic heterosexual couple: one ${sex1} named ${p1Desc} and one ${sex2} named ${p2Desc}`
        : `a romantic couple: ${p1Desc} and ${p2Desc}`,
      'exactly two people only',
      geoText && `set ${geoText}`,
    ].filter(Boolean).join(', ');

    // Build prompt (same as async endpoint)
    const stylePrompt = style.basePrompt || '';
    const sceneVisualAnchor = scene.visualAnchor || scene.coupleVisualLine || coupleVisualLine;

    // If customPrompt is provided, use it as the main scene content (replacing description)
    const customPrompt = (scene.customPrompt || '').trim();
    const sceneContent = customPrompt || scene.description || '';

    console.log(`📝 Scene customPrompt: "${customPrompt || 'none'}"`);
    console.log(`📝 Using sceneContent: "${sceneContent.substring(0, 80)}..."`);

    const promptParts = [
      stylePrompt,
      sceneVisualAnchor,
      'two people only, correct anatomy, high quality, detailed',
      sceneContent,  // Use customPrompt if provided, otherwise description
    ].filter(Boolean).map(p => String(p).trim()).filter(p => p.length > 0);

    const prompt = promptParts.join('. ');

    console.log(`🎨 Regenerating scene: "${scene.title}"`);
    console.log(`   Prompt: "${prompt.substring(0, 100)}..."`);

    // Load reference images
    const getFirstRef = (refMap, key) => {
      if (!refMap || typeof refMap !== 'object') return null;
      const arr = refMap[key];
      if (Array.isArray(arr) && arr.length > 0) return arr[0];
      return null;
    };

    const loadRef = async (ref) => {
      if (!ref) return null;
      try {
        if (ref.startsWith('http')) {
          // Try R2 direct download first
          const r2Key = r2Service.extractKeyFromUrl(ref);
          if (r2Key) {
            try {
              const buffer = await r2Service.downloadBuffer(r2Key);
              console.log(`✅ Reference loaded from R2: ${r2Key}`);
              return buffer;
            } catch (r2Err) {
              console.warn(`R2 direct failed, trying HTTP: ${r2Err.message}`);
            }
          }
          const response = await axios.get(ref, { responseType: 'arraybuffer', timeout: 30000 });
          return Buffer.from(response.data);
        }
        if (fs.existsSync(ref)) {
          return fs.readFileSync(ref);
        }
      } catch (err) {
        console.warn(`Failed to load reference: ${ref}`, err.message);
      }
      return null;
    };

    const p1Ref = getFirstRef(photoReferences, 'partner1');
    const p2Ref = getFirstRef(photoReferences, 'partner2');
    const referenceBuffers = [
      await loadRef(p1Ref),
      await loadRef(p2Ref),
    ].filter(Boolean);

    console.log(`📸 Reference images loaded: ${referenceBuffers.length}`);

    // Build partner objects for character consistency
    const partner1 = {
      name: partner1Name || 'Partner 1',
      gender: partner1Sex || partner1Gender || 'unspecified',
      race: partner1Race || 'unspecified',
      ethnicity: partner1Ethnicity || 'unspecified',
      height: partner1Height || 'average',
      ageWhenMet: partner1AgeWhenMet || null,
      currentAge: partner1CurrentAge || null,
    };

    const partner2 = {
      name: partner2Name || 'Partner 2',
      gender: partner2Sex || partner2Gender || 'unspecified',
      race: partner2Race || 'unspecified',
      ethnicity: partner2Ethnicity || 'unspecified',
      height: partner2Height || 'average',
      ageWhenMet: partner2AgeWhenMet || null,
      currentAge: partner2CurrentAge || null,
    };

    // Generate 3 frames (wide, medium, close-up) for this scene
    console.log(`🎬 Generating 3 frames for scene: "${scene.title}"`);
    const sceneResult = await googleImagenService.generateSceneFrames(
      {
        index: scene.index || 0,
        title: scene.title,
        description: sceneContent,
      },
      partner1,
      partner2,
      referenceBuffers,
      { aspectRatio: '16:9', style: stylePrompt }
    );

    // Upload all successful frames to R2
    const uploadedFrames = [];
    for (const frame of sceneResult.frames) {
      if (frame.success && frame.buffer) {
        try {
          const filename = `scene_${scene.index || 0}_${frame.type}_${Date.now()}_regenerated.png`;
          const r2Url = await r2Service.uploadBuffer(frame.buffer, filename, 'image/png', 'images');
          uploadedFrames.push({
            type: frame.type,
            name: frame.name,
            imageUrl: r2Url,
            success: true,
          });
          console.log(`  ✅ ${frame.name} uploaded to R2`);
        } catch (uploadErr) {
          console.error(`  ❌ Failed to upload ${frame.name}:`, uploadErr.message);
          uploadedFrames.push({
            type: frame.type,
            name: frame.name,
            error: uploadErr.message,
            success: false,
          });
        }
      } else {
        uploadedFrames.push({
          type: frame.type,
          name: frame.name,
          error: frame.error || 'Generation failed',
          success: false,
        });
      }
    }

    // Use first successful frame as primary image for backwards compatibility
    const primaryFrame = uploadedFrames.find(f => f.success);

    console.log(`✅ Scene regenerated: ${uploadedFrames.filter(f => f.success).length}/3 frames`);

    res.json({
      success: true,
      results: [{
        index: scene.index || 0,
        title: scene.title,
        description: sceneContent || scene.description || '',
        prompt,
        imageUrl: primaryFrame?.imageUrl || null,
        image: primaryFrame?.imageUrl || null,
        frames: uploadedFrames,
        success: uploadedFrames.some(f => f.success),
      }],
    });

  } catch (error) {
    console.error('Regenerate scene error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate scenes via SD WebUI (still images)
 * - Uses styleId from config/styles
 * - Uses scene descriptions from /api/storyboard
 * - Strongly conditions on race, ethnicity, geography + height so the couple is rendered correctly
 * - Uses ControlNet reference for each partner when a reference photo is available
 */
app.post('/api/generate-scenes-async', async (req, res) => {
  try {
    const {
      styleId,
      scenes = [],
      settings = {},
      imageEngine = 'google-imagen', // 'google-imagen' | 'flux'
      partner1Name,
      partner2Name,
      partner1Race,
      partner2Race,
      partner1Ethnicity,
      partner2Ethnicity,
      partner1Height,
      partner2Height,
      partner1Sex,
      partner2Sex,
      partner1Gender,
      partner2Gender,
      partner1AgeWhenMet,
      partner2AgeWhenMet,
      partner1CurrentAge,
      partner2CurrentAge,
      meetingGeography,
      photoReferences = {},
    } = req.body || {};

    if (!styleId) {
      return res.status(400).json({ error: 'Missing styleId' });
    }

    // Validate Google Imagen is configured if requested
    if (imageEngine === 'google-imagen' && !googleImagenService.client) {
      return res.status(400).json({
        error: 'Google Imagen not configured. Set GOOGLE_IMAGEN_API_KEY environment variable.'
      });
    }
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ error: 'At least one scene is required' });
    }

    const style = getStyleById(styleId);
    if (!style) {
      return res.status(400).json({ error: `Unknown styleId: ${styleId}` });
    }

    // Generate a unique job ID
    const jobId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job status
    imageJobs.set(jobId, {
      status: 'processing',
      total: scenes.length,
      completed: 0,
      currentScene: 0,
      currentTitle: '',
      results: [],
      error: null,
      startedAt: Date.now(),
    });

    // Return immediately with job ID
    res.json({
      success: true,
      jobId,
      message: 'Image generation started',
      total: scenes.length,
      engine: imageEngine,
    });

    // Process in background (don't await!)
    processImageJob(jobId, {
      styleId,
      scenes,
      settings,
      imageEngine,
      partner1Name,
      partner2Name,
      partner1Race,
      partner2Race,
      partner1Ethnicity,
      partner2Ethnicity,
      partner1Height,
      partner2Height,
      partner1Sex,
      partner2Sex,
      partner1Gender,
      partner2Gender,
      partner1AgeWhenMet,
      partner2AgeWhenMet,
      partner1CurrentAge,
      partner2CurrentAge,
      meetingGeography,
      photoReferences,
      style,
    });

  } catch (error) {
    console.error('Error starting image job:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// COMPLETE processImageJob function - replace entirely in index.js

async function processImageJob(jobId, params) {
  const job = imageJobs.get(jobId);
  if (!job) return;

  const {
    styleId,
    scenes,
    settings,
    imageEngine = 'flux',
    partner1Name,
    partner2Name,
    partner1Race,
    partner2Race,
    partner1Ethnicity,
    partner2Ethnicity,
    partner1Height,
    partner2Height,
    partner1Sex,
    partner2Sex,
    partner1Gender,
    partner2Gender,
    partner1AgeWhenMet,
    partner2AgeWhenMet,
    partner1CurrentAge,
    partner2CurrentAge,
    meetingGeography,
    photoReferences,
    style,
  } = params;

  // Build couple visual line
  const p1 = partner1Name || 'Partner 1';
  const p2 = partner2Name || 'Partner 2';

  function normalizeSexOrGender(value) {
    if (!value) return null;
    const s = String(value).toLowerCase().trim();
    if (['m', 'male', 'man', 'boy'].includes(s)) return 'man';
    if (['f', 'female', 'woman', 'girl'].includes(s)) return 'woman';
    return null;
  }

  const sex1 = normalizeSexOrGender(partner1Sex || partner1Gender);
  const sex2 = normalizeSexOrGender(partner2Sex || partner2Gender);
  const isHetero = sex1 && sex2 && sex1 !== sex2;

  const p1Parts = [partner1Race, partner1Ethnicity].filter(Boolean);
  const p2Parts = [partner2Race, partner2Ethnicity].filter(Boolean);
  const p1Desc = p1Parts.length ? `${p1} (${p1Parts.join(', ')})` : p1;
  const p2Desc = p2Parts.length ? `${p2} (${p2Parts.join(', ')})` : p2;
  const geoText = meetingGeography ? ` in ${meetingGeography}` : '';

  const coupleVisualLine = [
    isHetero
      ? `a romantic heterosexual couple: one ${sex1} named ${p1Desc} and one ${sex2} named ${p2Desc}`
      : `a romantic couple: ${p1Desc} and ${p2Desc}`,
    'exactly two people only',
    geoText && `set ${geoText}`,
  ].filter(Boolean).join(', ');

  // Settings
  const width = parseInt(settings.width, 10) || style.width || 768;
  const height = parseInt(settings.height, 10) || style.height || 512;
  const steps = parseInt(settings.steps, 10) || style.steps || 30;
  const cfgScale = Number.isFinite(Number(settings.cfgScale)) ? Number(settings.cfgScale) : style.cfgScale || 9.0;
  const samplerName = settings.sampler || style.sampler || 'DPM++ 2M Karras';
  const stylePrompt = style.basePrompt || '';
  const extraPrompt = (settings.customPrompt || '').trim();
  let negativePrompt = (settings.negativePrompt || style.negativePrompt || DEFAULT_NEGATIVE_PROMPT || '')
    .trim()
    .concat(', extra arms, extra legs, crowd, group photo, text, watermark');

  // =====================================================
  // FIXED: Reference photo loading (handles R2 URLs)
  // =====================================================

  // Helper to get first reference from photoReferences map
  function getFirstRef(refMap, key) {
    if (!refMap || typeof refMap !== 'object') return null;
    const arr = refMap[key];
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') {
      return arr[0]; // Return as-is (could be URL or path)
    }
    return null;
  }

  const partner1Ref = getFirstRef(photoReferences, 'partner1');
  const partner2Ref = getFirstRef(photoReferences, 'partner2');

  // Helper to load reference image (from URL or local path)
  async function loadReferenceImage(ref) {
    if (!ref) return null;

    // R2/HTTP URL - download it
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      // Try R2 direct download first (avoids 403 from expired/auth URLs)
      const r2Key = r2Service.extractKeyFromUrl(ref);
      if (r2Key) {
        try {
          console.log(`📥 Downloading reference via R2 API: ${r2Key}`);
          const buffer = await r2Service.downloadBuffer(r2Key);
          console.log(`✅ Reference loaded from R2 (${(buffer.length / 1024).toFixed(0)} KB)`);
          return buffer.toString('base64');
        } catch (err) {
          console.error(`❌ R2 direct download failed: ${err.message}, trying HTTP...`);
        }
      }

      // Fallback to HTTP download
      try {
        console.log(`📥 Downloading reference via HTTP: ${ref.substring(0, 60)}...`);
        const response = await axios.get(ref, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        return Buffer.from(response.data).toString('base64');
      } catch (err) {
        console.error(`❌ Failed to download reference: ${err.message}`);
        return null;
      }
    }

    // Local file path
    const localPath = path.join(UPLOAD_ROOT, ref);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath, { encoding: 'base64' });
    }
    if (fs.existsSync(ref)) {
      return fs.readFileSync(ref, { encoding: 'base64' });
    }

    console.warn(`⚠️ Reference not found: ${ref}`);
    return null;
  }

  // Load reference images ONCE before the loop
  const p1Base64 = await loadReferenceImage(partner1Ref);
  const p2Base64 = await loadReferenceImage(partner2Ref);

  console.log(`📸 Reference images loaded: P1=${!!p1Base64}, P2=${!!p2Base64}`);

  // =====================================================
  // GOOGLE IMAGEN PATH (3-Frame Scene Generation)
  // =====================================================
  if (imageEngine === 'google-imagen') {
    console.log(`🎨 [Job ${jobId}] Using Google Imagen with 3-frame scene generation`);

    // Convert base64 to buffers for Gemini API
    const referenceBuffers = [
      p1Base64 ? Buffer.from(p1Base64, 'base64') : null,
      p2Base64 ? Buffer.from(p2Base64, 'base64') : null,
    ].filter(Boolean);

    // Build partner objects for character consistency
    const partner1 = {
      name: partner1Name || 'Partner 1',
      gender: partner1Sex || partner1Gender || 'unspecified',
      race: partner1Race || 'unspecified',
      ethnicity: partner1Ethnicity || 'unspecified',
      height: partner1Height || 'average',
      ageWhenMet: partner1AgeWhenMet || null,
      currentAge: partner1CurrentAge || null,
    };

    const partner2 = {
      name: partner2Name || 'Partner 2',
      gender: partner2Sex || partner2Gender || 'unspecified',
      race: partner2Race || 'unspecified',
      ethnicity: partner2Ethnicity || 'unspecified',
      height: partner2Height || 'average',
      ageWhenMet: partner2AgeWhenMet || null,
      currentAge: partner2CurrentAge || null,
    };

    const allResults = [];
    const PARALLEL_SCENES = 2; // Process 2 scenes in parallel (rate limit friendly)

    // Helper function to process a single scene (generates 3 frames sequentially)
    async function processScene(scene, sceneIndex) {
      const title = scene.title || `Scene ${sceneIndex + 1}`;

      // Update job to show current scene being processed
      job.currentTitle = `Generating: ${title}`;
      console.log(`🎬 [Job ${jobId}] Processing scene ${sceneIndex + 1}/${scenes.length}: "${title}"`);

      try {
        // Generate 3 story frames for this scene
        const sceneResult = await googleImagenService.generateSceneFrames(
          {
            index: sceneIndex + 1,
            title,
            description: scene.description || '',
          },
          partner1,
          partner2,
          referenceBuffers,
          { aspectRatio: '16:9', style: stylePrompt }
        );

        // Upload all successful frames to R2
        const uploadedFrames = [];
        for (const frame of sceneResult.frames) {
          if (frame.success && frame.buffer) {
            try {
              const filename = `gemini_scene_${sceneIndex + 1}_${frame.type}_${Date.now()}.png`;
              const r2Url = await r2Service.uploadBuffer(
                frame.buffer,
                filename,
                'image/png',
                'images'
              );
              uploadedFrames.push({
                type: frame.type,
                name: frame.name,
                imageUrl: r2Url,
                success: true,
              });
              console.log(`  ✅ Scene ${sceneIndex + 1} ${frame.name} uploaded to R2`);
            } catch (uploadErr) {
              console.error(`  ❌ Scene ${sceneIndex + 1} Failed to upload ${frame.name}:`, uploadErr.message);
              uploadedFrames.push({
                type: frame.type,
                name: frame.name,
                error: uploadErr.message,
                success: false,
              });
            }
          } else {
            uploadedFrames.push({
              type: frame.type,
              name: frame.name,
              error: frame.error || 'Generation failed',
              success: false,
            });
          }
        }

        // Use first successful frame as primary image for backwards compatibility
        const primaryFrame = uploadedFrames.find(f => f.success);

        // Update job progress
        job.completed++;
        job.currentTitle = `✓ ${title}`;
        console.log(`✅ [Job ${jobId}] Scene ${sceneIndex + 1} complete: ${uploadedFrames.filter(f => f.success).length}/3 frames`);

        return {
          index: sceneIndex + 1,
          title,
          description: scene.description || '',
          engine: 'google-imagen',
          imageUrl: primaryFrame?.imageUrl || null,
          image: primaryFrame?.imageUrl || null,
          frames: uploadedFrames,
          success: uploadedFrames.some(f => f.success),
        };

      } catch (error) {
        console.error(`❌ [Job ${jobId}] Scene ${sceneIndex + 1} failed:`, error.message);
        job.completed++;
        job.currentTitle = `✗ ${title} (failed)`;
        return {
          index: sceneIndex + 1,
          title,
          description: scene.description || '',
          engine: 'google-imagen',
          error: error.message,
          frames: [],
          success: false,
        };
      }
    }

    // Process scenes in parallel batches of 2
    for (let batchStart = 0; batchStart < scenes.length; batchStart += PARALLEL_SCENES) {
      const batch = scenes.slice(batchStart, batchStart + PARALLEL_SCENES);
      const batchIndices = batch.map((_, i) => batchStart + i);

      // Get scene titles for this batch
      const batchTitles = batch.map((s, i) => s.title || `Scene ${batchStart + i + 1}`);
      console.log(`🚀 [Job ${jobId}] Processing: ${batchTitles.join(', ')}`);

      // Update job progress with scene titles
      job.currentScene = batchStart + 1;
      job.currentTitle = batchTitles.join(' • ');

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((scene, i) => processScene(scene, batchIndices[i]))
      );

      // Add results to allResults
      allResults.push(...batchResults);
      // Note: job.completed is updated inside processScene for real-time progress

      // Small delay between batches to avoid rate limiting
      if (batchStart + PARALLEL_SCENES < scenes.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Sort results by index and save to job
    allResults.sort((a, b) => a.index - b.index);
    job.results = allResults;
    job.status = 'completed';
    job.completedAt = Date.now();
    console.log(`✅ [Job ${jobId}] All ${job.total} scenes completed with Google Imagen (2 frames each, 2 scenes parallel)`);
    return;
  }

  // =====================================================
  // FLUX / SD WebUI PATH (Sequential processing)
  // =====================================================
  const isFlux = style.model && style.model.toLowerCase().includes('flux');
  const useComfyFlux = isFlux && !!comfyService && !!fluxIPAdapterWorkflow;

  // Process each scene
  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index] || {};
    const title = scene.title || `Scene ${index + 1}`;

    // Update job progress
    job.currentScene = index + 1;
    job.currentTitle = title;

    const promptParts = [
      stylePrompt,
      coupleVisualLine,
      'two people only, correct anatomy',
      scene.description,
      extraPrompt,
    ].filter(Boolean).map(p => String(p).trim()).filter(p => p.length > 0);

    const prompt = promptParts.join(', ');

    console.log(`🖼️ [Job ${jobId}] Generating scene ${index + 1}/${scenes.length}: ${title}`);

    try {
      let result;

      if (useComfyFlux) {
        // =====================================================
        // Using FLUX text-to-image (prompt-only)
        // =====================================================
        const comfyJobId = await comfyService.queueFluxPrompt(
          fluxIPAdapterWorkflow,
          prompt
        );

        const imageFilename = await comfyService.waitForGeneration(comfyJobId, { expect: 'image' });

        let imageUrl = null;
        try {
          const parsed = JSON.parse(imageFilename);
          imageUrl = parsed?.images?.[0]?.data || parsed?.images?.[0]?.url || null;
        } catch {
          if (typeof imageFilename === 'string' && imageFilename.startsWith('http')) {
            imageUrl = imageFilename;
          }
        }

        result = {
          index: index + 1,
          title,
          description: scene.description || '',
          prompt,
          engine: 'flux-pulid',
          imageUrl,
          imageRaw: imageFilename,
          success: true,
        };

      } else {
        // SD WebUI path
        const generation = await imageGen.generateImage({
          prompt,
          negativePrompt,
          width,
          height,
          steps,
          cfgScale,
          samplerName,
          model: style.model,
        });

        result = {
          index: index + 1,
          title,
          description: scene.description || '',
          prompt,
          engine: 'sd-webui',
          image: generation.image, // base64
          success: true,
        };
      }

      job.results.push(result);
      console.log(`✅ [Job ${jobId}] Scene ${index + 1} completed`);

    } catch (err) {
      console.error(`❌ [Job ${jobId}] Scene ${index + 1} failed:`, err.message);
      job.results.push({
        index: index + 1,
        title,
        description: scene.description || '',
        prompt,
        error: err.message,
        success: false,
      });
    }

    job.completed = index + 1;
  }

  // Mark job complete
  job.status = 'completed';
  job.completedAt = Date.now();
  console.log(`✅ [Job ${jobId}] All ${job.total} scenes completed`);
}

app.get('/api/image/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = imageJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  res.json({
    success: true,
    jobId,
    status: job.status,
    total: job.total,
    completed: job.completed,
    currentScene: job.currentScene,
    currentTitle: job.currentTitle,
    results: job.results, // Return results as they complete
    error: job.error,
    elapsed: Date.now() - job.startedAt,
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of imageJobs.entries()) {
    // Remove jobs older than 1 hour
    if (now - job.startedAt > 60 * 60 * 1000) {
      imageJobs.delete(jobId);
    }
  }
}, 60000);

/**
 * Upload reference photos (base64)
 */
app.post('/api/upload-photos', async (req, res) => {
  const { files = [] } = req.body || {};

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files received' });
  }

  console.log(`📸 Uploading ${files.length} photos...`);

  try {
    const uploaded = {};

    for (const file of files) {
      const category = (file.category || 'misc').trim() || 'misc';
      const data = file.data;
      const originalName = file.name || 'photo';

      if (!data) {
        console.warn(`⚠️ Skipping file with no data in category: ${category}`);
        continue;
      }

      // Extract base64 data and mime type
      let base64Data = data;
      let mimeType = 'image/png';

      if (data.startsWith('data:')) {
        const matches = data.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        } else {
          console.warn(`⚠️ Could not parse data URL for ${originalName}`);
          continue;
        }
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const extension = mimeType.split('/')[1] || 'png';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 6);
      const sanitizedName = originalName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

      // Filename for R2
      const filename = `${timestamp}_${randomId}_${sanitizedName}.${extension}`;

      // Folder based on category (partner1, partner2, etc.)
      const folder = `photos/${category}`;

      console.log(`📤 Uploading ${folder}/${filename} (${Math.round(buffer.length / 1024)}KB)...`);

      let publicUrl;

      // Try R2 upload first
      if (r2Service) {
        try {
          // YOUR uploadBuffer signature: (buffer, filename, contentType, folder)
          publicUrl = await r2Service.uploadBuffer(buffer, filename, mimeType, folder);
          console.log(`✅ Uploaded to R2: ${publicUrl}`);
        } catch (r2Err) {
          console.error(`❌ R2 upload failed:`, r2Err.message);
          // Fall through to local storage
        }
      } else {
        console.log(`⚠️ R2 service not available`);
      }

      // Fallback to local storage if R2 fails or isn't configured
      if (!publicUrl) {
        console.log(`📁 Falling back to local storage...`);
        const localDir = path.join(UPLOAD_ROOT, category);
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        const localPath = path.join(localDir, filename);
        fs.writeFileSync(localPath, buffer);

        // Return relative path that can be served statically
        publicUrl = `/${category}/${filename}`;
        console.log(`📁 Saved locally: ${localPath}`);
      }

      // Add to uploaded results
      if (!uploaded[category]) uploaded[category] = [];
      uploaded[category].push(publicUrl);
    }

    console.log(`✅ Upload complete:`, uploaded);
    res.json({ uploaded });

  } catch (error) {
    console.error('❌ Error uploading photos:', error);
    res.status(500).json({
      error: 'Failed to upload photos',
      details: error.message
    });
  }
});

/**
 * Simple health check
 */
app.get('/api/health', async (_req, res) => {
  try {
    const health = await imageGen.healthCheck();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({ status: 'error', message: error.message });
  }
});

/**
 * Get available models from SD WebUI
 */
app.get('/api/models', async (_req, res) => {
  try {
    const models = await imageGen.getModels();
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get progress (local SD job tracker)
 */
app.get('/api/progress', async (_req, res) => {
  try {
    const sdProgress = await progressTracker.getSDProgress();
    const jobStatus = progressTracker.getCurrentStatus();
    res.json({
      ...sdProgress,
      job: jobStatus,
    });
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate a single image (SD)
 */
app.post('/api/generate', async (req, res) => {
  try {
    const result = await imageGen.generateImage(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * OLD fallback: create a video from the generated scenes (slideshow via FFmpeg)
 */
app.post('/api/video/from-scenes', async (req, res) => {
  try {
    const { scenes = [], options = {} } = req.body || {};
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ error: 'No scenes provided' });
    }

    const images = scenes.map((s) => {
      if (!s.image) return '';
      return s.image.startsWith('data:') ? s.image : `data:image/png;base64,${s.image}`;
    });

    const result = await videoGen.createVideoFromImages(images, {
      fps: options.fps || 4,
      duration: options.duration || 2,
      outputName: options.outputName || `lovestory_${Date.now()}.mp4`,
    });

    res.json(result);
  } catch (error) {
    console.error('Error creating video from scenes:', error);
    res.status(500).json({ error: 'Failed to generate video' });
  }
});

/**
 * (Optional) Tiny Sora smoke test without a reference image
 */
app.post('/api/video/animate-test', async (_req, res) => {
  try {
    if (!openai) throw new Error('OpenAI SDK not installed (npm i openai)');
    const video = await openai.videos.createAndPoll({
      model: SORA_MODEL,
      prompt: 'A cute cat, Pixar style, 3D animation, simple background, 2 seconds of idle motion',
      seconds: 2,
      size: '512x512',
    });

    if (video.status !== 'completed') {
      return res.status(500).json({ success: false, error: `Sora status: ${video.status}` });
    }

    const filename = `sora_test_${Date.now()}.mp4`;
    const outPath = await downloadSoraVideoToDisk(video.id, VIDEO_ROOT, filename);
    const url = `${_req.protocol}://${_req.get('host')}/videos/${path.basename(outPath)}`;

    res.json({ success: true, filename, url });
  } catch (error) {
    console.error('❌ /api/video/animate-test failed:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Sora test failed' });
  }
});

/**
 * NEW: per-scene animated videos using Sora, with each scene's still image as input_reference
 * Expectation from client:
 *  - scenes[i].image OR scenes[i].referenceImage  (data URL or base64)
 *  - scenes[i].description (prompt body)
 *  - settings.width, settings.height -> mapped to size "WxH"
 *  - settings.seconds (optional) or env SORA_DEFAULT_SECONDS
 */
app.post('/api/video/animate-scenes', async (req, res) => {
  try {
    if (!openai) throw new Error('OpenAI SDK not installed (npm i openai)');

    const {
      styleId,
      scenes = [],
      settings = {},
      partner1Name,
      partner2Name,
    } = req.body || {};

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one scene is required' });
    }

    // Style is optional for Sora; we only use its prompt bits if provided.
    let stylePrompt = '';
    const style = getStyleById(styleId);
    if (styleId) {

      if (!style) return res.status(400).json({ success: false, error: `Unknown styleId: ${styleId}` });
      stylePrompt = style.basePrompt || '';
    }


    const width = parseInt(settings.width, 10) || 1280;
    const height = parseInt(settings.height, 10) || 720;
    const secondsDefault = parseFloat(settings.seconds) || SORA_DEFAULT_SECONDS;
    const size = `${width}x${height}`;
    const extraPrompt = (settings.customPrompt || '').trim();

    const nameLine = partner1Name && partner2Name ? `${partner1Name} and ${partner2Name} together` : null;

    const results = [];

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index] || {};
      const promptParts = [stylePrompt, nameLine, scene.description, extraPrompt]
        .filter(Boolean)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      const prompt = promptParts.join(', ');

      let tempImagePath = null;
      try {
        // Accept image from scene.image (base64 or data URL) or scene.referenceImage
        let img = scene.image || scene.referenceImage || null;
        const imageUrl = scene.imageUrl || scene.url || null;

        if (!img && imageUrl) {
          // download from R2, convert to base64 (no data-url prefix)
          const r = await axios.get(imageUrl, { responseType: "arraybuffer" });
          img = Buffer.from(r.data).toString("base64");
        }

        if (!img) {
          results.push({ index, title, success: false, error: "Missing image" });
          continue;
        }

        tempPath = await saveReferenceImageToDisk(img);

        // Kick off + poll Sora
        const soraJob = await openai.videos.createAndPoll({
          model: SORA_MODEL,
          prompt,
          size,
          seconds: parseFloat(scene.seconds) || secondsDefault,
          // Only include input_reference if we actually have a file path
          ...(tempImagePath
            ? { input_reference: fs.createReadStream(tempImagePath) }
            : {}),
        });

        if (soraJob.status !== 'completed') {
          console.error(`Sora scene ${index + 1} failed with status: ${soraJob.status}`);
          results.push({
            index: index + 1,
            title: scene.title || `Scene ${index + 1}`,
            description: scene.description || '',
            prompt,
            videoPath: null,
            filename: null,
            url: null,
            success: false,
            error: `Sora status: ${soraJob.status}`,
          });
          if (tempImagePath && fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);
          continue;
        }

        const filename = `sora_scene_${index + 1}_${Date.now()}.mp4`;
        const outPath = await downloadSoraVideoToDisk(soraJob.id, VIDEO_ROOT, filename);
        const url = `${req.protocol}://${req.get('host')}/videos/${path.basename(outPath)}`;

        results.push({
          index: index + 1,
          title: scene.title || `Scene ${index + 1}`,
          description: scene.description || '',
          prompt,
          videoPath: outPath,
          filename,
          url,
          success: true,
          error: null,
        });
      } catch (err) {
        console.error(`Error animating scene ${index + 1} via Sora:`, err.message);
        results.push({
          index: index + 1,
          title: scene.title || `Scene ${index + 1}`,
          description: scene.description || '',
          prompt,
          videoPath: null,
          filename: null,
          url: null,
          success: false,
          error: err.message,
        });
      } finally {
        if (tempImagePath && fs.existsSync(tempImagePath)) {
          try { fs.unlinkSync(tempImagePath); } catch { }
        }
      }
    }

    res.json({
      success: true,
      engine: 'sora',
      settings: { size, secondsDefault, model: SORA_MODEL },
      scenes: results,
    });
  } catch (error) {
    console.error('Error creating animated scenes (Sora):', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create animated scenes',
    });
  }
});

/**
 * NEW: Sora-based per-scene videos (3 seconds each)
 */
app.post('/api/video/sora-scenes', async (req, res) => {
  try {
    const { scenes = [], settings = {} } = req.body || {};

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'At least one scene is required' });
    }

    // Force 3s max per scene
    const requestedSeconds = parseInt(settings.seconds, 10) || 3;
    const seconds = Math.min(requestedSeconds, 8);

    const size = settings.size || '720x1280';
    const [wStr, hStr] = size.split('x');
    const targetW = parseInt(wStr, 10) || 720;
    const targetH = parseInt(hStr, 10) || 1280;

    const model = settings.model || 'sora-2';

    const results = [];

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index] || {};
      const title = scene.title || `Scene ${index + 1}`;
      const description = scene.description || '';
      const imageData = scene.image; // data URL (base64)
      const prompt = description || title;

      if (!imageData) {
        results.push({
          index: index + 1,
          title,
          description,
          success: false,
          error: 'Missing image data for this scene',
        });
        continue;
      }

      try {
        // 1) Save & resize reference image to match Sora size
        const refsDir = path.join(VIDEO_ROOT, 'sora_refs');
        const refInfo = await saveAndResizeBase64(
          imageData,
          refsDir,
          `scene_${index + 1}`,
          targetW,
          targetH
        );

        // 2) Call Sora: create job, poll, download MP4 to VIDEO_ROOT
        const videoInfo = await renderWithSora({
          prompt,
          seconds,
          size,
          model,
          inputPath: refInfo.filePath,
          inputMime: refInfo.mimeType,
          outDir: VIDEO_ROOT,
        });

        const url = `${req.protocol}://${req.get('host')}/videos/${videoInfo.filename}`;

        results.push({
          index: index + 1,
          title,
          description,
          success: true,
          soraId: videoInfo.id,
          filename: videoInfo.filename,
          url,
          seconds,
          size,
        });
      } catch (err) {
        console.error(`❌ Sora scene ${index + 1} failed:`, err.message);
        results.push({
          index: index + 1,
          title,
          description,
          success: false,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      model,
      seconds,
      size,
      scenes: results,
    });
  } catch (error) {
    console.error('Error in /api/video/sora-scenes:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create Sora scenes',
    });
  }
});

/**
 * Helper route
 */
app.get('/api/video/instructions', (req, res) => {
  try {
    const { imageCount = 8, duration = 5 } = req.query;
    const instructions = videoGen.getVideoCreationInstructions(
      parseInt(imageCount, 10),
      parseInt(duration, 10)
    );
    res.json(instructions);
  } catch (error) {
    console.error('Error getting video instructions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== STRIPE & CREDITS ROUTES ====================

// Create Stripe checkout session
app.post('/api/stripe/create-checkout', stripeController.createCheckout);

// Get user credits
app.get('/api/credits/:userId', stripeController.getCredits);

// Deduct credits
app.post('/api/credits/deduct', stripeController.deductCredits);

// Reset credits to 1000 for testing (DEV ONLY - remove before production)
app.post('/api/credits/reset-for-testing', stripeController.resetCreditsForTesting);

// ==================== VIDEO COMBINE ====================

// Combine multiple videos into one
app.post('/api/video/combine', videoCombineController.combineVideos);

app.post('/video/add-narration-single', videoCombineController.addNarrationToVideo);

// ==================== VEO VIDEO GENERATION ====================

// Job storage for Veo async processing
// Veo jobs stored in Firestore instead of in-memory Map for multi-instance support
const veoJobsCollection = db.collection('veoJobs');

/**
 * Generate videos from scenes using Google Veo (frame interpolation)
 * Takes first and last frame of each scene, generates smooth 5-sec video
 */
// In-memory fallback for Veo jobs (used when Firestore has gRPC issues)
const veoJobsMemory = new Map();

// Helper: write veo job to Firestore with retry, fallback to memory
async function veoJobSet(jobId, data) {
  try {
    await veoJobsCollection.doc(jobId).set(data);
  } catch (err) {
    console.warn(`⚠️ Firestore write failed for Veo job ${jobId}, using in-memory fallback:`, err.message);
    veoJobsMemory.set(jobId, { ...data });
  }
}

async function veoJobUpdate(jobId, data) {
  // Update memory first (always)
  if (veoJobsMemory.has(jobId)) {
    const existing = veoJobsMemory.get(jobId);
    Object.assign(existing, data);
  }
  try {
    await veoJobsCollection.doc(jobId).update(data);
  } catch (err) {
    console.warn(`⚠️ Firestore update failed for Veo job ${jobId}, using in-memory:`, err.message);
    if (!veoJobsMemory.has(jobId)) {
      veoJobsMemory.set(jobId, { ...data });
    }
  }
}

async function veoJobGet(jobId) {
  // Try Firestore first
  try {
    const doc = await veoJobsCollection.doc(jobId).get();
    if (doc.exists) return doc.data();
  } catch (err) {
    console.warn(`⚠️ Firestore read failed for Veo job ${jobId}:`, err.message);
  }
  // Fallback to memory
  return veoJobsMemory.get(jobId) || null;
}

app.post('/api/video/veo-scenes', async (req, res) => {
  try {
    const { scenes = [], settings = {} } = req.body;

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'No scenes provided' });
    }

    // Validate Veo service is configured
    if (!veoService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Google Veo not configured. Set GOOGLE_IMAGEN_API_KEY environment variable.'
      });
    }

    // Generate job ID
    const jobId = `veo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job (Firestore with in-memory fallback)
    await veoJobSet(jobId, {
      status: 'processing',
      total: scenes.length,
      completed: 0,
      currentScene: 0,
      currentTitle: '',
      results: [],
      startedAt: Date.now(),
    });

    // Return immediately with job ID
    res.json({
      success: true,
      jobId,
      message: 'Veo video generation started',
      total: scenes.length,
    });

    // Process in background
    processVeoJob(jobId, scenes, settings);

  } catch (error) {
    console.error('Veo endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Check Veo video job status
 */
app.get('/api/video/veo-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await veoJobGet(jobId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({
      success: true,
      jobId,
      status: job.status,
      total: job.total,
      completed: job.completed,
      currentScene: job.currentScene,
      currentTitle: job.currentTitle,
      results: job.results,
      videos: job.results, // Alias for frontend compatibility
      musicUrl: job.musicUrl || null,
      error: job.error,
      elapsed: Date.now() - job.startedAt,
    });
  } catch (error) {
    console.error('Veo status check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Process Veo video generation job in background
 */
async function processVeoJob(jobId, scenes, settings) {
  let job = await veoJobGet(jobId);
  if (!job) {
    console.error(`Veo job ${jobId} not found`);
    return;
  }

  let {
    aspectRatio = '16:9',
    partner1Name = '',
    partner2Name = '',
    partner1Sex = '',
    partner2Sex = '',
  } = settings;

  // Build character name context for video prompts
  const characterContext = (partner1Name || partner2Name)
    ? `IMPORTANT: The woman's name is "${partner1Name || 'Partner 1'}" and the man's name is "${partner2Name || 'Partner 2'}". Do NOT mix up or swap their names. ${partner1Name} is the ${partner1Sex || 'woman'} and ${partner2Name} is the ${partner2Sex || 'man'}.`
    : '';

  // Duration is always 8 seconds, set in VeoService
  // Music is NOT baked in - it's generated separately via ElevenLabs and overlaid in the editor

  const tempDir = path.join(__dirname, 'temp/veo');

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const currentTitle = scene.title || `Scene ${i + 1}`;

      // Update job status
      await veoJobUpdate(jobId, {
        currentScene: i + 1,
        currentTitle: currentTitle,
      });

      console.log(`🎬 [Veo Job ${jobId}] Processing scene ${i + 1}/${scenes.length}: "${currentTitle}"`);

      try {
        // Get frames from scene
        const frames = scene.frames || [];

        // Helper to convert frame data to buffers
        const getFrameBuffer = async (frame) => {
          if (!frame) return null;
          // If it's already a buffer
          if (Buffer.isBuffer(frame.buffer)) {
            return frame.buffer;
          }

          // If it's a URL, download it
          const imageSource = frame.imageUrl || frame.image || frame.url || frame;
          if (typeof imageSource === 'string' && imageSource.startsWith('http')) {
            const response = await axios.get(imageSource, { responseType: 'arraybuffer', timeout: 30000 });
            return Buffer.from(response.data);
          }

          // If it's base64
          if (typeof imageSource === 'string') {
            const base64Data = imageSource.replace(/^data:image\/\w+;base64,/, '');
            return Buffer.from(base64Data, 'base64');
          }

          return null;
        };

        // Generate prompt for the video (Pixar 3D style + character names to prevent swapping)
        const videoPrompt = `3D Pixar animation style. Maintain the EXACT same 3D animated cartoon style as the input image(s). Do NOT make it realistic or live-action. Keep the same art style, rendering, and character design throughout every frame of the video. ${scene.title || 'Romantic scene'}. ${scene.description || ''} Smooth cinematic camera movement, warm lighting. ${characterContext}`.trim();

        // Get first and last frames for interpolation
        const firstFrameBuffer = await getFrameBuffer(frames[0] || scene);
        const lastFrameBuffer = frames.length >= 2 ? await getFrameBuffer(frames[frames.length - 1]) : null;

        if (!firstFrameBuffer) {
          throw new Error('No valid image buffer found for scene');
        }

        let veoResult;
        if (lastFrameBuffer) {
          // Use interpolation with first + last frame
          console.log(`   📹 Generating Veo video with interpolation (first + last frame) for "${currentTitle}"...`);
          veoResult = await veoService.generateInterpolatedVideo(firstFrameBuffer, lastFrameBuffer, videoPrompt, { aspectRatio });
        } else {
          // Fallback to single image if only one frame
          console.log(`   📹 Generating Veo video from single image for "${currentTitle}"...`);
          veoResult = await veoService.generateVideoFromImage(firstFrameBuffer, videoPrompt, { aspectRatio });
        }

        if (!veoResult || !veoResult.success || !veoResult.videoBuffer) {
          throw new Error('Veo did not return a video');
        }

        // Save video to temp file
        const tempVideoPath = path.join(tempDir, `veo_${jobId}_scene_${i}_${Date.now()}.mp4`);
        fs.writeFileSync(tempVideoPath, veoResult.videoBuffer);

        // Upload to R2 (no music baked in - music is overlaid in editor)
        console.log(`   ☁️ Uploading to R2...`);
        const r2Filename = `veo/scene_${i + 1}_${Date.now()}.mp4`;
        const r2Url = await r2Service.uploadVideo(tempVideoPath, r2Filename);

        // Clean up temp file
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);

        // Update job with successful result
        job = await veoJobGet(jobId) || job;
        job.results.push({
          index: i + 1,
          title: scene.title || `Scene ${i + 1}`,
          url: r2Url,
          success: true,
        });
        await veoJobUpdate(jobId, {
          results: job.results,
          completed: i + 1,
        });

        console.log(`   ✅ Scene ${i + 1} complete: ${r2Url}`);

      } catch (sceneErr) {
        console.error(`   ❌ Scene ${i + 1} failed:`, sceneErr.message);

        // Update job with failed result
        job = await veoJobGet(jobId) || job;
        job.results.push({
          index: i + 1,
          title: scene.title || `Scene ${i + 1}`,
          success: false,
          error: sceneErr.message,
        });
        await veoJobUpdate(jobId, {
          results: job.results,
          completed: i + 1,
        });
      }

      // Rate limiting: Veo allows 2 requests per minute
      // Wait 30 seconds between requests to stay within limit
      if (i < scenes.length - 1) {
        console.log(`   ⏱️ Rate limit: waiting 30 seconds before next scene (Veo limit: 2 req/min)...`);
        await veoJobUpdate(jobId, {
          currentTitle: `Waiting for rate limit (30s)...`,
        });
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    // Auto-generate background music via ElevenLabs
    job = await veoJobGet(jobId) || job;
    try {
      const successfulVideos = job.results.filter(r => r.success);
      const totalDurationMs = successfulVideos.length * 8 * 1000; // 8 seconds per Veo video
      const musicDurationMs = Math.max(totalDurationMs, 15000); // Minimum 15 seconds

      console.log(`🎵 [Veo Job ${jobId}] Auto-generating background music (${musicDurationMs}ms)...`);
      const musicBuffer = await elevenLabs.generateMusic('romantic_piano', musicDurationMs, 'instrumental only, no vocals');
      const musicKey = `music/veo_auto_${Date.now()}.mp3`;
      const musicUrl = await r2Service.uploadBuffer(musicBuffer, musicKey, 'audio/mpeg', 'music');
      console.log(`✅ [Veo Job ${jobId}] Background music uploaded: ${musicUrl}`);

      await veoJobUpdate(jobId, { musicUrl });
    } catch (musicErr) {
      console.warn(`⚠️ [Veo Job ${jobId}] Auto music generation failed (videos still OK):`, musicErr.message);
    }

    // Mark job as completed
    job = await veoJobGet(jobId) || job;
    await veoJobUpdate(jobId, {
      status: 'completed',
      completedAt: Date.now(),
    });
    console.log(`🎬 [Veo Job ${jobId}] Completed: ${job.results.filter(r => r.success).length}/${scenes.length} scenes`);

  } catch (err) {
    console.error(`🎬 [Veo Job ${jobId}] Failed:`, err.message);
    await veoJobUpdate(jobId, {
      status: 'failed',
      error: err.message,
    });
  }
}

// ==================== PROJECT MANAGEMENT ====================

// These use Firebase Admin - add this import at the top if you want these routes
// For now, you can handle project saves from the frontend using Firestore directly
app.post('/projects/:projectId/images', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { images } = req.body;

    if (!projectId || !images) {
      return res.status(400).json({ error: 'Missing projectId or images' });
    }

    const projectRef = db.collection('projects').doc(projectId);

    await projectRef.update({
      generatedImages: images,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save images error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save videos to project
app.post('/projects/:projectId/videos', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { videos } = req.body;

    if (!projectId || !videos) {
      return res.status(400).json({ error: 'Missing projectId or videos' });
    }

    const projectRef = db.collection('projects').doc(projectId);

    await projectRef.update({
      videos: videos,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save videos error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save combined video to project
app.post('/projects/:projectId/combined-video', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { combinedVideoUrl } = req.body;

    if (!projectId || !combinedVideoUrl) {
      return res.status(400).json({ error: 'Missing projectId or combinedVideoUrl' });
    }

    const projectRef = db.collection('projects').doc(projectId);

    await projectRef.update({
      combinedVideoUrl,
      status: 'complete',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save combined video error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save storyboard to project
app.post('/projects/:projectId/storyboard', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { storyboard } = req.body;

    if (!projectId || !storyboard) {
      return res.status(400).json({ error: 'Missing projectId or storyboard' });
    }

    const projectRef = db.collection('projects').doc(projectId);

    await projectRef.update({
      storyboard,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save storyboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save narration audios to project
app.post('/projects/:projectId/narration', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { narrationAudios } = req.body;

    if (!projectId || !narrationAudios) {
      return res.status(400).json({ error: 'Missing projectId or narrationAudios' });
    }

    const projectRef = db.collection('projects').doc(projectId);

    await projectRef.update({
      narrationAudios,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save narration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== R2 STORAGE ENDPOINTS ====================

// Upload images to R2 and return R2 URLs
app.post('/api/upload-images-to-r2', async (req, res) => {
  try {
    const { images, userId, projectId } = req.body;

    if (!images || !userId || !projectId) {
      return res.status(400).json({ error: 'Missing required fields: images, userId, projectId' });
    }

    console.log(`📤 Uploading ${images.length} images to R2 for user ${userId}, project ${projectId}`);

    const uploadedImages = await Promise.all(
      images.map(async (img, index) => {
        try {
          const imageData = img.imageBase64 || img.imageUrl || img.image;
          if (!imageData) {
            return { ...img, r2Url: null, error: 'No image data' };
          }

          const r2Url = await r2Service.uploadImageFromBase64(imageData, userId, projectId, img.index || index);
          return { ...img, r2Url };
        } catch (error) {
          console.error(`Failed to upload image ${index}:`, error);
          return { ...img, r2Url: null, error: error.message };
        }
      })
    );

    const successCount = uploadedImages.filter(img => img.r2Url).length;
    console.log(`✅ Uploaded ${successCount}/${images.length} images to R2`);

    res.json({
      success: true,
      images: uploadedImages,
      uploaded: successCount,
      total: images.length
    });
  } catch (error) {
    console.error('❌ Upload images to R2 error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload videos to R2 and return R2 URLs
app.post('/api/upload-videos-to-r2', async (req, res) => {
  try {
    const { videos, userId, projectId } = req.body;

    if (!videos || !userId || !projectId) {
      return res.status(400).json({ error: 'Missing required fields: videos, userId, projectId' });
    }

    console.log(`📤 Uploading ${videos.length} videos to R2 for user ${userId}, project ${projectId}`);

    const uploadedVideos = await Promise.all(
      videos.map(async (video, index) => {
        try {
          if (!video.url) {
            return { ...video, r2Url: null, error: 'No video URL' };
          }

          const r2Url = await r2Service.uploadVideoFromUrl(video.url, userId, projectId, video.index || index);
          return { ...video, r2Url };
        } catch (error) {
          console.error(`Failed to upload video ${index}:`, error);
          return { ...video, r2Url: null, error: error.message };
        }
      })
    );

    const successCount = uploadedVideos.filter(v => v.r2Url).length;
    console.log(`✅ Uploaded ${successCount}/${videos.length} videos to R2`);

    res.json({
      success: true,
      videos: uploadedVideos,
      uploaded: successCount,
      total: videos.length
    });
  } catch (error) {
    console.error('❌ Upload videos to R2 error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MUSIC API ENDPOINTS
// ==========================================

/**
 * Get available music styles
 */
app.get('/api/music/styles', (_req, res) => {
  try {
    const styles = elevenLabs.getAvailableMusicStyles();
    res.json({ success: true, styles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate background music
 * POST /api/music/generate
 * Body: { style: 'romantic_piano', durationMs: 30000, customPrompt?: 'additional instructions' }
 */
app.post('/api/music/generate', async (req, res) => {
  try {
    const { style, durationMs = 30000, customPrompt = '' } = req.body;

    if (!style) {
      return res.status(400).json({ error: 'style is required' });
    }

    console.log(`🎵 Generating music: style=${style}, duration=${durationMs}ms`);

    const audioBuffer = await elevenLabs.generateMusic(style, durationMs, customPrompt);

    // Upload to R2
    const audioKey = `music/${style}_${Date.now()}.mp3`;
    const musicUrl = await r2Service.uploadBuffer(audioBuffer, audioKey, 'audio/mpeg', 'music');

    console.log(`✅ Music uploaded: ${musicUrl}`);

    res.json({
      success: true,
      musicUrl,
      style,
      durationMs,
    });

  } catch (error) {
    console.error('❌ Music generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/music/generate-all
 * Generates 3 instrumental music tracks in parallel
 * Body: { durationMs: 30000 }
 */
app.post('/api/music/generate-all', async (req, res) => {
  try {
    const { durationMs = 30000 } = req.body;

    const tracks = [
      { style: 'romantic_piano', name: 'Romantic Piano' },
      { style: 'romantic_orchestra', name: 'Orchestral Romance' },
      { style: 'romantic_acoustic', name: 'Soft Acoustic' },
    ];

    console.log(`🎵 Generating ${tracks.length} music tracks in parallel (${durationMs}ms each)...`);

    const results = await Promise.all(
      tracks.map(async (track) => {
        try {
          const audioBuffer = await elevenLabs.generateMusic(track.style, durationMs, 'instrumental only, no vocals');
          const audioKey = `music/${track.style}_${Date.now()}.mp3`;
          const musicUrl = await r2Service.uploadBuffer(audioBuffer, audioKey, 'audio/mpeg', 'music');

          console.log(`✅ ${track.name} uploaded: ${musicUrl}`);
          return { ...track, url: musicUrl, success: true };
        } catch (err) {
          console.error(`❌ ${track.name} failed:`, err.message);
          return { ...track, url: null, success: false, error: err.message };
        }
      })
    );

    const successfulTracks = results.filter(t => t.success);

    res.json({
      success: successfulTracks.length > 0,
      tracks: results,
      durationMs,
    });

  } catch (error) {
    console.error('❌ Parallel music generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🎬 Omnia Server Running                 ║
╠═══════════════════════════════════════════╣
║   Server: http://localhost:${PORT}       ║
║   SD WebUI: ${SD_WEBUI_URL}              ║
╠═══════════════════════════════════════════╣
║   Components:                             ║
║   ✅ Image Generator (SD)                 ║
║   ✅ Story Processor                      ║
║   ✅ Video Generator (Sora per scene)     ║
║   ✅ Progress Tracker                     ║
║                                           ║
║   Ready to generate love stories! ❤️      ║
╚═══════════════════════════════════════════╝
  `);
});