// server/controllers/voiceController.js
// Voice cloning using existing ElevenLabsService

const path = require('path');
const fs = require('fs');
const ElevenLabsService = require('../services/elevenLabsService');

// Initialize with same API key as main server
const elevenLabs = new ElevenLabsService(process.env.ELEVENLABS_API_KEY);

// R2 for storing audio previews
let r2Service = null;
try {
  const R2Service = require('../services/r2Service');
  r2Service = new R2Service();
  console.log('✅ R2Service available for voice previews');
} catch (e) {
  console.log('⚠️ R2Service not available for voice previews:', e.message);
}

/**
 * Clone a voice from audio sample
 * POST /api/voice/clone
 */
async function cloneVoice(req, res) {
  try {
    const { audioBase64, userId, voiceName } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'No audio provided' });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API not configured' });
    }

    // Convert base64 to buffer
    const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
    const audioBuffer = Buffer.from(base64Data, 'base64');

    console.log('🎤 Cloning voice...');
    
    // Clone voice using existing service
    const result = await elevenLabs.cloneVoice(
      audioBuffer,
      voiceName || `Omnia User ${userId || Date.now()}`
    );

    console.log('✅ Voice cloned:', result.voiceId);

    // Wait a moment for ElevenLabs to fully register the cloned voice
    // Without this, TTS sometimes fails with "voice not found"
    console.log('⏳ Waiting for voice to be ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate a preview sample with the cloned voice
    let previewUrl = null;
    try {
      console.log('🔊 Generating preview audio...');
      previewUrl = await generatePreviewAudio(result.voiceId, userId || 'anon');
      console.log('✅ Preview URL generated:', previewUrl ? (previewUrl.substring(0, 50) + '...') : 'null');
    } catch (previewErr) {
      console.error('❌ Preview generation failed:', previewErr.message);
      console.error('   Full error:', previewErr);
      // Continue without preview - voice is still cloned
    }

    const response = {
      success: true,
      voiceId: result.voiceId,
      voiceName: voiceName || result.name,
      previewUrl,
      message: 'Voice cloned successfully!',
    };

    console.log('📤 Sending response with previewUrl:', previewUrl ? 'SET' : 'NULL');
    return res.json(response);

  } catch (error) {
    console.error('Voice clone error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Voice cloning failed. Please try again.' 
    });
  }
}

/**
 * Generate a preview audio sample using a voice
 * POST /api/voice/preview
 */
async function generatePreview(req, res) {
  try {
    const { voiceId, text } = req.body;

    if (!voiceId) {
      return res.status(400).json({ success: false, error: 'Voice ID is required' });
    }

    const previewUrl = await generatePreviewAudio(voiceId, 'preview', text);

    return res.json({
      success: true,
      audioUrl: previewUrl,
    });

  } catch (error) {
    console.error('Preview generation error:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate preview' });
  }
}

/**
 * The exact statement the cloned voice will read for the preview
 * MUST MATCH the SAMPLE_TEXT in VoiceRecorder.jsx exactly!
 */
const PREVIEW_STATEMENT = 
  "From the moment we met, I knew there was something special between us. " +
  "Our story is one of laughter, adventure, and a love that grows stronger every day. " +
  "This is our journey, and I'm so grateful to share it with you.";

/**
 * Internal function to generate preview audio
 * Uses the cloned voice to read the PREVIEW_STATEMENT via ElevenLabs TTS
 */
async function generatePreviewAudio(voiceId, identifier, customText) {
  // Use the standard preview statement unless custom text is provided
  const sampleText = customText || PREVIEW_STATEMENT;

  console.log(`🎤 Generating voice preview for ${voiceId}...`);
  console.log(`📝 Preview text: "${sampleText.substring(0, 50)}..."`);

  // Check if elevenLabs service is properly initialized
  if (!elevenLabs) {
    throw new Error('ElevenLabs service not initialized');
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set');
  }

  // Create temp directory for audio
  const tempDir = path.join(__dirname, '..', 'temp', 'voice-previews');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filename = `preview_${identifier}_${voiceId}_${Date.now()}.mp3`;
  const audioPath = path.join(tempDir, filename);

  try {
    // Generate TTS using the cloned voice via ElevenLabs
    console.log(`🔊 Calling ElevenLabs TTS for voice ${voiceId}...`);
    
    // Check if generateNarrationAudio method exists
    if (typeof elevenLabs.generateNarrationAudio !== 'function') {
      throw new Error('elevenLabs.generateNarrationAudio is not a function - check service implementation');
    }
    
    const result = await elevenLabs.generateNarrationAudio(sampleText, voiceId, audioPath);
    console.log(`🔊 TTS result:`, result);

    // Verify file was created
    if (!fs.existsSync(audioPath)) {
      throw new Error('Audio file was not created after TTS call');
    }

    const stats = fs.statSync(audioPath);
    console.log(`✅ Preview audio generated: ${audioPath} (${Math.round(stats.size / 1024)}KB)`);

    if (stats.size < 100) {
      throw new Error(`Audio file too small: ${stats.size} bytes - TTS may have failed`);
    }

    // If R2 is configured, upload to cloud storage for persistent URL
    if (r2Service) {
      try {
        // YOUR r2Service.uploadAudio signature: (filePath, folder)
        const publicUrl = await r2Service.uploadAudio(audioPath, 'voice-previews');
        console.log(`☁️ Preview uploaded to R2: ${publicUrl}`);
        // Clean up local file
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        return publicUrl;
      } catch (uploadErr) {
        console.error('R2 upload failed, using base64:', uploadErr.message);
        // Fall through to base64
      }
    }

    // Fallback: return as base64 data URL (works but larger response)
    const audioBuffer = fs.readFileSync(audioPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    const base64Url = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
    console.log(`📦 Preview returned as base64 (${Math.round(audioBuffer.length / 1024)}KB)`);
    return base64Url;

  } catch (err) {
    console.error(`❌ generatePreviewAudio failed:`, err.message);
    console.error(`   Stack:`, err.stack);
    // Clean up any partial file
    if (fs.existsSync(audioPath)) {
      try { fs.unlinkSync(audioPath); } catch {}
    }
    throw err;
  }
}

/**
 * List voices for a user
 * GET /api/voice/list
 */
async function listVoices(req, res) {
  try {
    const { userId } = req.query;

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API not configured' });
    }

    // Get voices from ElevenLabs (you may need to add this method to your service)
    const voices = await elevenLabs.getVoices ? await elevenLabs.getVoices() : [];

    // Separate custom (cloned) voices from library voices
    const customVoices = voices.filter(v => 
      v.category === 'cloned' || 
      v.name?.includes('Omnia User') ||
      (userId && v.name?.includes(userId))
    );
    
    const libraryVoices = voices.filter(v => 
      v.category === 'premade' || v.category === 'professional'
    ).slice(0, 10);

    return res.json({
      success: true,
      customVoices: customVoices.map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        previewUrl: v.preview_url,
      })),
      libraryVoices: libraryVoices.map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        previewUrl: v.preview_url,
      })),
    });

  } catch (error) {
    console.error('List voices error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch voices' });
  }
}

/**
 * Delete a cloned voice
 * DELETE /api/voice/:voiceId
 */
async function deleteVoice(req, res) {
  try {
    const { voiceId } = req.params;

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API not configured' });
    }

    // Call delete on ElevenLabs (you may need to add this method to your service)
    if (elevenLabs.deleteVoice) {
      await elevenLabs.deleteVoice(voiceId);
    }

    return res.json({ success: true });

  } catch (error) {
    console.error('Delete voice error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete voice' });
  }
}

module.exports = {
  cloneVoice,
  generatePreview,
  listVoices,
  deleteVoice,
};