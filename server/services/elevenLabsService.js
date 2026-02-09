// server/services/elevenLabsService.js
// ElevenLabs service for TTS and Music Generation
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ElevenLabsService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';

    // Voice IDs
    this.voices = {
      female: 'EXAVITQu4vr4xnSDxMaL', // Sarah
      male: 'pNInz6obpgDQGcFmaJgB',   // Adam
    };

    // Music style prompts - customized for each user selection
    this.musicStyles = {
      romantic_piano: {
        prompt: 'Create a soft, romantic piano melody with gentle, flowing arpeggios and warm harmonies. Use a slow tempo around 60-70 BPM. The mood should be intimate, tender, and emotional - perfect for a love story. Include subtle string swells and delicate notes.',
        bpm: 65,
      },
      romantic_orchestra: {
        prompt: 'Create a lush, romantic orchestral piece with sweeping strings, gentle woodwinds, and soft brass. The tempo should be moderate, around 70-80 BPM. Build emotional crescendos and intimate quiet moments. Perfect for a cinematic love story.',
        bpm: 75,
      },
      romantic_acoustic: {
        prompt: 'Create a warm, romantic acoustic guitar piece with fingerpicking patterns and gentle strumming. Use a tempo around 80-90 BPM. The mood should be heartfelt and sincere, like a love song serenade. Add subtle percussion if appropriate.',
        bpm: 85,
      },
      romantic_jazz: {
        prompt: 'Create a smooth, romantic jazz piece with soft piano, gentle saxophone, and brushed drums. Use a relaxed tempo around 70-80 BPM. The mood should be intimate and sophisticated, like a candlelit dinner. Include tasteful improvisations.',
        bpm: 75,
      },
      upbeat_happy: {
        prompt: 'Create an upbeat, joyful instrumental track with bright piano, cheerful strings, and light percussion. Use a tempo around 110-120 BPM. The mood should be celebratory and full of happiness - perfect for wedding celebrations or happy moments.',
        bpm: 115,
      },
      cinematic_emotional: {
        prompt: 'Create a deeply emotional cinematic score with powerful strings, gentle piano, and building dynamics. Use a tempo around 75-85 BPM. Include moments of quiet intimacy that build to emotionally moving crescendos. Perfect for dramatic love story moments.',
        bpm: 80,
      },
      nostalgic_memories: {
        prompt: 'Create a nostalgic, bittersweet instrumental piece with gentle piano, soft strings, and a wistful melody. Use a slow tempo around 55-65 BPM. The mood should evoke precious memories and the passage of time - perfect for looking back on a love story.',
        bpm: 60,
      },
      modern_love: {
        prompt: 'Create a modern, indie-style love song instrumental with acoustic guitar, soft synth pads, and gentle percussion. Use a tempo around 95-105 BPM. The mood should be contemporary but romantic, suitable for a modern love story.',
        bpm: 100,
      },
    };

    if (!this.apiKey) {
      console.warn('⚠️ ElevenLabs API key not configured');
    } else {
      console.log('✅ ElevenLabs Service initialized');
    }
  }

  /**
   * Generate speech from text (Returns Buffer)
   */
  async textToSpeech(text, voiceId, options = {}) {
    if (!this.apiKey) throw new Error('ElevenLabs API key not configured');

    const usedVoiceId = voiceId || this.voices.male;

    try {
      console.log(`🔊 ElevenLabs TTS (${usedVoiceId}): "${text.substring(0, 30)}..."`);

      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${usedVoiceId}/stream`,
        {
          text,
          model_id: "eleven_multilingual_v2",
          output_format: "mp3_22050_32",
          voice_settings: {
            stability: 0.1,
            similarity_boost: 1.0,
            style: 0.0,
            use_speaker_boost: true,
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('❌ ElevenLabs TTS failed:', error.response?.data ? String(error.response.data) : error.message);
      throw error;
    }
  }

  /**
   * Generate background music using ElevenLabs Music Compose API
   * @param {string} styleKey - Key from musicStyles (e.g., 'romantic_piano')
   * @param {number} durationMs - Duration in milliseconds
   * @param {string} customPromptAddition - Optional custom text to add to prompt
   * @returns {Promise<Buffer>} - Audio buffer
   */
  async generateMusic(styleKey, durationMs = 30000, customPromptAddition = '') {
    if (!this.apiKey) throw new Error('ElevenLabs API key not configured');

    // Get the style config or use default romantic piano
    const styleConfig = this.musicStyles[styleKey] || this.musicStyles.romantic_piano;

    // Build the final prompt
    let prompt = styleConfig.prompt;
    if (customPromptAddition) {
      prompt += ` ${customPromptAddition}`;
    }

    try {
      console.log(`🎵 ElevenLabs Music: "${styleKey}" (${durationMs}ms)`);
      console.log(`   Prompt: "${prompt.substring(0, 60)}..."`);

      const response = await axios.post(
        `${this.baseUrl}/music/compose`,
        {
          prompt: prompt,
          music_length_ms: durationMs,
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer',
          timeout: 120000, // Music generation can take longer
        }
      );

      console.log(`✅ Music generated: ${styleKey}`);
      return Buffer.from(response.data);

    } catch (error) {
      console.error('❌ ElevenLabs Music failed:', error.response?.data ? String(error.response.data) : error.message);
      throw error;
    }
  }

  /**
   * Generate music and save to file
   */
  async generateMusicToFile(styleKey, durationMs, outputPath, customPromptAddition = '') {
    const buffer = await this.generateMusic(styleKey, durationMs, customPromptAddition);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Music saved to: ${outputPath}`);

    return { success: true, path: outputPath };
  }

  /**
   * Get available music styles
   */
  getAvailableMusicStyles() {
    return Object.keys(this.musicStyles).map(key => ({
      key,
      name: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: this.musicStyles[key].prompt.substring(0, 100) + '...',
    }));
  }

  /**
   * Helper to save audio buffer to file
   */
  async saveAudioToFile(audioBuffer, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, audioBuffer);
    return outputPath;
  }
}

module.exports = ElevenLabsService;