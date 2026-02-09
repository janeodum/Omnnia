// server/controllers/videoController.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ComfyService = require('../services/comfyService');
const StoryboardService = require('../services/storyboardService');
const R2Service = require('../services/r2Service');
const ElevenLabsService = require('../services/elevenLabsService'); // Changed from GoogleTts
const AudioVideoMerger = require('../services/audioVideoMerger');

// Config
const COMFY_URL = process.env.COMFY_API_URL || 'http://127.0.0.1:8188';

// IMPORTANT:
// Use the *video* workflow for Wan/SVD (img2vid), not the Flux *image* workflow.
// If you truly intended flux_image_workflow.json, you’ll only ever get images back.
const WORKFLOW_PATH =
  process.env.COMFY_VIDEO_WORKFLOW_PATH
    ? path.resolve(process.env.COMFY_VIDEO_WORKFLOW_PATH)
    : path.join(__dirname, '../config/comfy_svd_xt_workflow.json'); // <-- change to your actual video workflow JSON

const comfyService = new ComfyService(COMFY_URL, process.env.RUNPOD_API_KEY);
const storyboardService = new StoryboardService({ apiKey: process.env.OPENAI_API_KEY });
const r2Service = new R2Service();
const elevenLabsService = new ElevenLabsService(process.env.ELEVENLABS_API_KEY);
const audioVideoMerger = new AudioVideoMerger(path.join(__dirname, '../uploads/tmp_audio')); // Temp dir for audio

// Helpers
function stripDataUrlPrefix(b64OrDataUrl) {
  if (!b64OrDataUrl) return null;
  const s = String(b64OrDataUrl);
  const idx = s.indexOf('base64,');
  return idx !== -1 ? s.slice(idx + 'base64,'.length) : s;
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildScenePrompt(scene) {
  const parts = [
    scene.description,
    scene.mood ? `${scene.mood} atmosphere` : null,
    scene.location ? `location: ${scene.location}` : null,
  ].filter(Boolean);

  return parts.length ? parts.join(', ') : 'A cinematic 3D animation';
}

exports.generateStoryVideo = async (req, res) => {
  try {
    const { storyData, scenes: clientScenes } = req.body || {};

    if (!storyData && (!Array.isArray(clientScenes) || clientScenes.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Missing storyData (or scenes array).',
      });
    }

    console.log('🎬 [videoController] generateStoryVideo called');
    console.log('COMFY_URL:', COMFY_URL);
    console.log('WORKFLOW_PATH:', WORKFLOW_PATH);

    // 1) Build scenes
    console.log('1) Generating storyboard...');
    let scenes = [];

    if (Array.isArray(clientScenes) && clientScenes.length > 0) {
      // If frontend already generated scenes (and images), use them directly.
      scenes = clientScenes.map((s, i) => ({
        index: s.index ?? i + 1,
        title: s.title || `Scene ${i + 1}`,
        description: s.description || '',
        mood: s.mood,
        location: s.location,
        // image may be: data URL OR raw base64
        image: s.image || s.referenceImage || null,
        frames: s.frames || null, // Preserve frames for interpolation
      }));
      console.log(`Using client-provided scenes: ${scenes.length}`);
    } else {
      scenes = await storyboardService.generateStoryboard(storyData);
      if (!Array.isArray(scenes) || scenes.length === 0) {
        return res.status(400).json({ success: false, error: 'Storyboard returned zero scenes.' });
      }
      console.log(`Storyboard scenes: ${scenes.length}`);
    }

    // 2) Load workflow JSON (video workflow)
    const workflowJson = safeReadJson(WORKFLOW_PATH);

    const results = [];

    console.log(`2) Starting Comfy generation for ${scenes.length} scenes...`);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i] || {};
      const sceneIndex = Number(scene.index) || i + 1;

      console.log(`\n➡️  Processing Scene ${sceneIndex}: ${scene.title || `Scene ${sceneIndex}`}`);

      // =================================================================
      // PARALLEL GENERATION: Video + Narration + Music
      // =================================================================

      // --- 1. Define Promises ---

      // A) Video Generation Promise
      const videoPromise = (async () => {
        try {
          // Prepare images for interpolation or single frame
          let startImageB64 = scene.image;
          let endImageB64 = null;
          let isInterpolation = false;

          if (Array.isArray(scene.frames) && scene.frames.length >= 2) {
            const validFrames = scene.frames.filter(f => f.image || f.imageBase64 || f.imageUrl);
            if (validFrames.length >= 2) {
              const first = validFrames[0];
              const last = validFrames[validFrames.length - 1];
              startImageB64 = first.imageBase64 || first.image || first.imageUrl;
              endImageB64 = last.imageBase64 || last.image || last.imageUrl;
              isInterpolation = true;
            }
          }

          if (!startImageB64) throw new Error("No start image found for scene");

          const pureStartB64 = stripDataUrlPrefix(startImageB64);
          const pureEndB64 = endImageB64 ? stripDataUrlPrefix(endImageB64) : null;

          // Upload Images
          // Helper to upload base64 to Comfy (or temp file logic)
          const uploadB64Helper = async (b64, nameSuffix) => {
            if (typeof comfyService.uploadImageBase64 === 'function') {
              return await comfyService.uploadImageBase64(b64, `scene_${sceneIndex}_${nameSuffix}.png`);
            } else {
              const tmpDir = path.join(__dirname, '..', 'uploads', 'tmp');
              if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
              const tmpPath = path.join(tmpDir, `scene_${sceneIndex}_${nameSuffix}_${Date.now()}.png`);
              fs.writeFileSync(tmpPath, Buffer.from(b64, 'base64'));
              const info = await comfyService.uploadImage(tmpPath);
              try { fs.unlinkSync(tmpPath); } catch { }
              return info;
            }
          };

          const startUploadInfo = await uploadB64Helper(pureStartB64, 'start');
          let endUploadInfo = null;
          if (pureEndB64) endUploadInfo = await uploadB64Helper(pureEndB64, 'end');

          // Build Prompt
          const scenePrompt = buildScenePrompt(scene);

          // Queue
          let promptId;
          if (isInterpolation && startUploadInfo && endUploadInfo) {
            promptId = await comfyService.queueFirstLastFrame(startUploadInfo, endUploadInfo, workflowJson, scenePrompt);
          } else {
            promptId = await comfyService.queuePrompt(startUploadInfo, workflowJson, scenePrompt);
          }

          console.log(`🎥 Video Queued: ${promptId}`);
          const result = await comfyService.waitForGeneration(promptId, { expect: 'video' });
          // Result is usually "filename" string from Comfy or object
          return { success: true, filename: result, promptId, prompt: scenePrompt };
        } catch (e) {
          console.error(`❌ Video Error [Scene ${sceneIndex}]:`, e.message);
          return { success: false, error: e.message };
        }
      })();

      // B) Audio Promises
      const voiceMode = storyData.voiceNarration || 'music-only';
      const musicMode = storyData.musicPreference;

      // TTS Promise
      const ttsPromise = (async () => {
        // Persistence Check: If we already have a narration URL from previous run, skip gen
        if (scene.narrationUrl) {
          console.log(`🎙️ Using existing narration for Scene ${sceneIndex}`);
          return { success: true, url: scene.narrationUrl, isExisting: true };
        }

        if (!scene.narration || (voiceMode !== 'male' && voiceMode !== 'female')) return null;
        try {
          console.log(`🎙️ Generating TTS...`);
          // voiceMode is 'male' or 'female', mapped inside ElevenLabsService
          const buffer = await elevenLabsService.textToSpeech(
            scene.narration,
            voiceMode // Pass 'male' or 'female' string directly, service handles mapping
          );
          const ttsPath = path.join(__dirname, '../uploads/tmp', `tts_${sceneIndex}_${Date.now()}.mp3`);
          await elevenLabsService.saveAudioToFile(buffer, ttsPath);
          return { success: true, path: ttsPath, buffer };
        } catch (e) {
          console.error("❌ TTS Gen Error:", e.message);
          return null;
        }
      })();

      // Music Promise
      const musicPromise = (async () => {
        // Persistence Check
        if (scene.musicUrl) {
          console.log(`🎵 Using existing music for Scene ${sceneIndex}`);
          return { success: true, url: scene.musicUrl, isExisting: true };
        }

        // Generate music if we have a preference AND we are not using custom voice (or maybe even if we are?)
        // If user explicitly selected "Music Only" or "Music + Voice" (implied by having musicPreference)
        if (!musicMode) return null;

        try {
          // Construct Prompt based on user preference
          let musicPrompt = `${musicMode} - cinematic background music, instrumental`;

          // Specific rule for "piano"
          if (musicMode.toLowerCase().includes('piano')) {
            musicPrompt = "Create a romantic piano piece for a romantic scene animation";
          }

          console.log(`🎵 Generating Music: "${musicPrompt}"...`);
          const buffer = await elevenLabsService.generateMusic(
            musicPrompt,
            10 // Duration
          );
          const musicPath = path.join(__dirname, '../uploads/tmp', `music_${sceneIndex}_${Date.now()}.mp3`);
          await elevenLabsService.saveAudioToFile(buffer, musicPath);
          return { success: true, path: musicPath, buffer };
        } catch (e) {
          console.error("❌ Music Gen Error:", e.message);
          return null;
        }
      })();

      // --- 2. Await All ---
      const [videoResult, ttsResult, musicResult] = await Promise.all([videoPromise, ttsPromise, musicPromise]);

      // --- 3. Process & Merge ---
      let finalVideoUrl = null;
      const r2Urls = {};

      if (videoResult?.success && videoResult.filename) {
        try {
          // Download raw video
          const vidTmpPath = path.join(__dirname, '../uploads/tmp', `raw_${sceneIndex}_${Date.now()}.mp4`);
          const mergedPath = path.join(__dirname, '../uploads/tmp', `final_${sceneIndex}_${Date.now()}.mp4`);

          // Get From Comfy (Base64 is safest generic way without shared volumes)
          // If fetchFileAsBase64 fails, we might rely on static path mapping if local
          let vidBuffer;
          if (typeof comfyService.fetchFileAsBase64 === 'function') {
            const b64 = await comfyService.fetchFileAsBase64(videoResult.filename);
            vidBuffer = Buffer.from(b64.split(',')[1], 'base64');
          } else {
            // Fallback check local? Assumes Comfy output dir is accessible
            // Skipping complex logic, assuming fetch works as before
            throw new Error("Cannot fetch video file from Comfy");
          }

          fs.writeFileSync(vidTmpPath, vidBuffer);

          // Upload Audio Assets (Persistence) & Prepare for Merge
          let ttsPathForMerge = ttsResult?.path;
          let musicPathForMerge = musicResult?.path;

          if (ttsResult) {
            if (ttsResult.isExisting) {
              // Existing URL - Use it, but download for merging
              r2Urls.narration = ttsResult.url;
              ttsPathForMerge = path.join(__dirname, '../uploads/tmp', `existing_tts_${sceneIndex}_${Date.now()}.mp3`);
              const response = await axios.get(ttsResult.url, { responseType: 'arraybuffer' });
              fs.writeFileSync(ttsPathForMerge, response.data);
            } else if (ttsResult.buffer) {
              // New Gen - Upload it
              const key = `omnia/stories/${storyData.id || 'temp'}/audio/tts_${sceneIndex}_${Date.now()}.mp3`;
              r2Urls.narration = await r2Service.uploadFile(ttsResult.buffer, key, 'audio/mpeg');
            }
          }

          if (musicResult) {
            if (musicResult.isExisting) {
              r2Urls.music = musicResult.url;
              musicPathForMerge = path.join(__dirname, '../uploads/tmp', `existing_music_${sceneIndex}_${Date.now()}.mp3`);
              const response = await axios.get(musicResult.url, { responseType: 'arraybuffer' });
              fs.writeFileSync(musicPathForMerge, response.data);
            } else if (musicResult.buffer) {
              const key = `omnia/stories/${storyData.id || 'temp'}/audio/music_${sceneIndex}_${Date.now()}.mp3`;
              r2Urls.music = await r2Service.uploadFile(musicResult.buffer, key, 'audio/mpeg');
            }
          }

          // Merge Logic
          if (ttsResult || musicResult) {
            console.log("🎛️ Mixing Audio & Video...");
            await audioVideoMerger.mergeSceneAudioVideo(
              vidTmpPath,
              ttsPathForMerge, // Narration (can be null/undefined)
              mergedPath,
              { backgroundMusicPath: musicPathForMerge }
            );

            // Upload Merged
            const finalBuff = fs.readFileSync(mergedPath);
            const finalKey = `omnia/stories/${storyData.id || 'temp'}/scene_${sceneIndex}_final_${Date.now()}.mp4`;
            finalVideoUrl = await r2Service.uploadFile(finalBuff, finalKey, 'video/mp4');

            try { fs.unlinkSync(mergedPath); } catch { }
          } else {
            // No Audio - Upload Raw
            const rawKey = `omnia/stories/${storyData.id || 'temp'}/scene_${sceneIndex}_raw_${Date.now()}.mp4`;
            finalVideoUrl = await r2Service.uploadFile(vidBuffer, rawKey, 'video/mp4');
          }

          try { fs.unlinkSync(vidTmpPath); } catch { }
          if (ttsPathForMerge && fs.existsSync(ttsPathForMerge)) fs.unlinkSync(ttsPathForMerge);
          if (musicPathForMerge && fs.existsSync(musicPathForMerge)) fs.unlinkSync(musicPathForMerge);

        } catch (postProcErr) {
          console.error(`⚠️ Post-processing failed for Scene ${sceneIndex}:`, postProcErr);
          // Try to return raw video URL if we have it? 
          // We don't have a raw URL unless we uploaded it.
          // If R2 failed, we might use local URL if configured.
          // For now, just leave finalVideoUrl null or whatever we could get.
        }
      }

      results.push({
        sceneIndex,
        title: scene.title,
        prompt: videoResult?.prompt,
        success: videoResult?.success || false,
        promptId: videoResult?.promptId,
        filename: videoResult?.filename,
        url: finalVideoUrl,
        // Extra Metadata
        narrationUrl: r2Urls.narration,
        musicUrl: r2Urls.music,
        narrationText: scene.narration,
      });

    }

    return res.json({
      success: true,
      engine: 'comfy',
      comfyUrl: COMFY_URL,
      workflow: path.basename(WORKFLOW_PATH),
      total: scenes.length,
      videos: results,
    });
  } catch (error) {
    console.error('Video Generation Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};