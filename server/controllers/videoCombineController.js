// server/controllers/videoCombineController.js
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const R2Service = require('../services/r2Service');

const r2Service = new R2Service();
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, '../temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Use MP4 version (converted from MOV for H.264 compatibility)
const INTRO_VIDEO_PATH = path.join(__dirname, '../assets/video/intro_special.mp4');

/**
 * Normalize video to consistent format for concatenation
 * Uses fast encoding settings to minimize processing time
 */
const normalizeVideo = (inputPath, outputPath, options = {}) => {
  return new Promise((resolve, reject) => {
    const { speed = 1.0, isIntro = false } = options;
    console.log(`🛠️ Normalizing ${path.basename(inputPath)} (Intro: ${isIntro}, Speed: ${speed})`);

    const needsSpeedChange = (parseFloat(speed) !== 1.0 && !isIntro);

    let command = ffmpeg(inputPath)
      .inputOptions(['-fflags', '+genpts']); // Regenerate timestamps

    if (needsSpeedChange) {
      // Speed change requires video filter
      const speedVal = parseFloat(speed) || 1.0;
      const ptsFactor = 1 / speedVal;

      command = command.input('anullsrc=channel_layout=stereo:sample_rate=44100')
        .inputOptions(['-f', 'lavfi']);

      const filterStr = `[0:v]setpts=${ptsFactor}*PTS,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30[vout];[1:a]asetpts=PTS[aout]`;

      command = command.complexFilter(filterStr)
        .outputOptions([
          '-map', '[vout]',
          '-map', '[aout]',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-ar', '44100',
          '-shortest',
          '-pix_fmt', 'yuv420p'
        ]);
    } else {
      // No speed change - normalize to consistent format for concat
      // MUST force same resolution + framerate so concat doesn't produce black frames
      command = command.outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30',
        '-c:a', 'aac',
        '-ar', '44100',
        '-pix_fmt', 'yuv420p',
        '-avoid_negative_ts', 'make_zero'
      ]);
    }

    command
      .output(outputPath)
      .on('start', (cmd) => {
        console.log('FFmpeg cmd:', cmd);
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err, stdout, stderr) => {
        console.error(`Normalize failed for ${path.basename(inputPath)}`);
        console.error('Stderr:', stderr);
        reject(new Error(`${err.message} | ${stderr || 'no stderr'}`));
      })
      .run();
  });
};

/**
 * Combine multiple video scenes into one final video
 */
exports.combineVideos = async (req, res) => {
  const tempFiles = [];

  try {
    const {
      videos,
      projectId,
      includeNarration = false,
      narrationAudios = [],
      musicPreference = 'Romantic Piano',
      playbackSpeed = 1.0,
      musicUrl = null,
      musicVolume = 0.5,
    } = req.body;

    if (!videos || videos.length === 0) {
      return res.status(400).json({ error: 'No videos provided' });
    }

    console.log(`🎬 Combining ${videos.length} videos for project ${projectId}`);

    // 1. Prepare video files list (always start with intro)
    const videoFiles = [];

    if (fs.existsSync(INTRO_VIDEO_PATH)) {
      console.log('🎥 Adding intro video to sequence');
      videoFiles.push(INTRO_VIDEO_PATH);
    } else {
      console.warn('⚠️ Intro video not found at:', INTRO_VIDEO_PATH);
    }

    // Download all video files to temp directory
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (!video.url) {
        console.error(`❌ Video at index ${i} is missing a URL!`);
        continue;
      }

      const tempPath = path.join(TEMP_DIR, `video_${i}_${Date.now()}.mp4`);
      console.log(`📥 Downloading video ${i + 1}/${videos.length}: ${video.url}`);

      try {
        const response = await axios.get(video.url, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });
        fs.writeFileSync(tempPath, Buffer.from(response.data));
        tempFiles.push(tempPath);
        videoFiles.push(tempPath);
      } catch (axErr) {
        console.error(`❌ Failed to download ${video.url}:`, axErr.message);
        throw new Error(`Invalid or unreachable URL: ${video.url} (${axErr.message})`);
      }
    }

    // 1.5 NORMALIZE ALL VIDEOS
    const normalizedFiles = [];
    const normalizationErrors = [];
    console.log('⚙️ Normalizing videos for concatenation...');

    for (let i = 0; i < videoFiles.length; i++) {
      const vidPath = videoFiles[i];
      const isIntro = (vidPath === INTRO_VIDEO_PATH);
      const normPath = path.join(TEMP_DIR, `norm_${i}_${Date.now()}.mp4`);

      try {
        await normalizeVideo(vidPath, normPath, {
          speed: isIntro ? 1.0 : parseFloat(playbackSpeed),
          isIntro
        });
        normalizedFiles.push(normPath);
        tempFiles.push(normPath);
      } catch (normErr) {
        const errMsg = `Normalizing ${path.basename(vidPath)} failed: ${normErr.message}`;
        console.error(errMsg);
        normalizationErrors.push(errMsg);
      }
    }

    if (normalizedFiles.length === 0) {
      throw new Error(`All videos failed to normalize. Details: ${normalizationErrors.join(' || ')}`);
    }

    // 2. Create concat file for ffmpeg
    const concatFilePath = path.join(TEMP_DIR, `concat_${Date.now()}.txt`);
    const concatContent = normalizedFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatFilePath, concatContent);
    tempFiles.push(concatFilePath);

    // 3. Set up output path
    const outputFilename = `combined_${projectId}_${Date.now()}.mp4`;
    const outputPath = path.join(TEMP_DIR, outputFilename);
    tempFiles.push(outputPath);

    // 4. Get background music - prefer ElevenLabs generated music URL, fallback to local files
    let musicPath = null;

    if (musicUrl) {
      // Download ElevenLabs-generated music from URL
      const musicTempPath = path.join(TEMP_DIR, `music_${Date.now()}.mp3`);
      console.log(`🎵 Downloading ElevenLabs music from: ${musicUrl}`);
      try {
        const musicResponse = await axios.get(musicUrl, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });
        fs.writeFileSync(musicTempPath, Buffer.from(musicResponse.data));
        tempFiles.push(musicTempPath);
        musicPath = musicTempPath;
        console.log('✅ ElevenLabs music downloaded');
      } catch (musicErr) {
        console.error('❌ Failed to download ElevenLabs music:', musicErr.message);
      }
    }

    if (!musicPath) {
      // Fallback to local music files
      const localMusicPaths = {
        'Romantic Piano': path.join(__dirname, '../assets/music/romantic-piano.mp3'),
        'Upbeat & Joyful': path.join(__dirname, '../assets/music/upbeat.mp3'),
        'Cinematic Orchestra': path.join(__dirname, '../assets/music/cinematic.mp3'),
        'Acoustic Guitar': path.join(__dirname, '../assets/music/acoustic.mp3'),
      };
      const localPath = localMusicPaths[musicPreference];
      if (localPath && fs.existsSync(localPath)) {
        musicPath = localPath;
      }
    }

    // Clamp volume to 0-1 range
    const vol = Math.max(0, Math.min(1, parseFloat(musicVolume) || 0.5));

    // 5. Combine videos with ffmpeg - all normalized, can use stream copy now!
    await new Promise((resolve, reject) => {
      let command = ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0']);

      if (musicPath) {
        command = command
          .input(musicPath)
          .complexFilter([
            `[1:a]volume=${vol}[musicvol]`,
            '[0:a][musicvol]amix=inputs=2:duration=first:dropout_transition=2[aout]'
          ])
          .outputOptions([
            '-map', '0:v',
            '-map', '[aout]',
            '-c:v', 'copy',
            '-c:a', 'aac'
          ]);
      } else {
        command = command.outputOptions(['-c', 'copy']);
      }

      command
        .outputOptions([
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('🎬 Final Combine Command:', cmd);
        })
        .on('progress', (progress) => {
          console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}%`);
        })
        .on('end', () => {
          console.log('✅ Video combination complete');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg error:', err);
          reject(err);
        })
        .run();
    });

    // 6. Upload
    console.log('📤 Uploading combined video to R2...');
    const r2Url = await r2Service.uploadVideo(outputPath, `combined/${outputFilename}`);

    // 7. Cleanup
    console.log('🧹 Cleaning up temp files...');
    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) { }
      }
    }

    res.json({
      success: true,
      combinedVideoUrl: r2Url,
      filename: outputFilename,
    });

  } catch (error) {
    console.error('Video combination error:', error);
    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch (e) { }
      }
    }
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to combine videos'
    });
  }
};

exports.addNarrationToVideo = async (req, res) => {
  const tempFiles = [];

  try {
    const { videoUrl, narrationUrl, backgroundMusicUrl } = req.body;

    if (!videoUrl || !narrationUrl) {
      return res.status(400).json({ error: 'Missing video or narration URL' });
    }

    const videoPath = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
    const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(videoPath, Buffer.from(videoResponse.data));
    tempFiles.push(videoPath);

    const narrationPath = path.join(TEMP_DIR, `narration_${Date.now()}.mp3`);
    const narrationResponse = await axios.get(narrationUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(narrationPath, Buffer.from(narrationResponse.data));
    tempFiles.push(narrationPath);

    const outputPath = path.join(TEMP_DIR, `narrated_${Date.now()}.mp4`);
    tempFiles.push(outputPath);

    await new Promise((resolve, reject) => {
      let command = ffmpeg()
        .input(videoPath)
        .input(narrationPath);

      command
        .complexFilter([
          '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]'
        ])
        .outputOptions([
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',
          '-shortest',
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const r2Url = await r2Service.uploadVideo(outputPath, `narrated/narrated_${Date.now()}.mp4`);

    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch { }
      }
    }

    res.json({
      success: true,
      videoUrl: r2Url,
    });

  } catch (error) {
    console.error('Add narration error:', error);

    for (const file of tempFiles) {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch { }
      }
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add narration',
    });
  }
};