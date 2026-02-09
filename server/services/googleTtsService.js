// server/services/googleTtsService.js
// Uses Gemini 2.5 Flash Preview TTS for speech synthesis
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const wav = require('wav');

class GoogleTtsService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.client = null;
        this.model = 'gemini-2.5-flash-preview-tts';

        // Voice options
        this.voices = {
            female: 'Kore',     // Female voice
            male: 'Puck',       // Male voice
            narrator: 'Charon', // Narrator voice
        };

        if (!apiKey) {
            console.warn('⚠️ Google Gemini API key not provided for TTS');
        } else {
            this.client = new GoogleGenAI({ apiKey });
            console.log('✅ Google Gemini TTS Service initialized');
        }
    }

    /**
     * Save audio buffer to WAV file
     */
    async saveWaveFile(filename, pcmData, channels = 1, rate = 24000, sampleWidth = 2) {
        return new Promise((resolve, reject) => {
            const dir = path.dirname(filename);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const writer = new wav.FileWriter(filename, {
                channels,
                sampleRate: rate,
                bitDepth: sampleWidth * 8,
            });

            writer.on('finish', resolve);
            writer.on('error', reject);

            writer.write(pcmData);
            writer.end();
        });
    }

    /**
     * Generate speech from text using Gemini 2.5 Flash TTS
     * @param {string} text - The text to speak
     * @param {string} gender - 'female', 'male', or 'narrator'
     * @param {string} outputPath - Path to save the audio file
     */
    async generateSpeech(text, gender = 'female', outputPath) {
        if (!this.client) {
            throw new Error('Google Gemini API key not configured for TTS');
        }

        const voiceName = this.voices[gender] || this.voices.female;

        try {
            console.log(`🗣️ Generating Gemini TTS (${voiceName}): "${text.substring(0, 40)}..."`);

            const response = await this.client.models.generateContent({
                model: this.model,
                contents: [{ parts: [{ text: text }] }],
                config: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName },
                        },
                    },
                },
            });

            const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

            if (!data) {
                throw new Error('No audio data returned from Gemini TTS');
            }

            const audioBuffer = Buffer.from(data, 'base64');

            // Ensure output directory exists
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Save as WAV file
            await this.saveWaveFile(outputPath, audioBuffer);

            console.log(`✅ TTS audio saved to: ${outputPath}`);

            return { success: true, path: outputPath };

        } catch (error) {
            console.error('❌ Gemini TTS failed:', error.message);
            throw new Error(`Gemini TTS generation failed: ${error.message}`);
        }
    }

    /**
     * Generate speech and return buffer (for direct upload)
     */
    async generateSpeechBuffer(text, gender = 'female') {
        if (!this.client) {
            throw new Error('Google Gemini API key not configured for TTS');
        }

        const voiceName = this.voices[gender] || this.voices.female;

        try {
            console.log(`🗣️ Generating Gemini TTS buffer (${voiceName}): "${text.substring(0, 40)}..."`);

            const response = await this.client.models.generateContent({
                model: this.model,
                contents: [{ parts: [{ text: text }] }],
                config: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: voiceName },
                        },
                    },
                },
            });

            const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

            if (!data) {
                throw new Error('No audio data returned from Gemini TTS');
            }

            return Buffer.from(data, 'base64');

        } catch (error) {
            console.error('❌ Gemini TTS buffer failed:', error.message);
            throw error;
        }
    }
}

module.exports = GoogleTtsService;
