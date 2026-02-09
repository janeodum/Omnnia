// src/api/voiceApi.js
// Voice cloning and narration API functions

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';

/**
 * Clone a voice from audio input
 * Returns voiceId and optionally a preview URL
 */
export async function cloneVoice({ audioBase64, userId, voiceName }) {
  try {
    const response = await fetch(`${API_BASE}/api/voice/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        userId,
        voiceName: voiceName || 'Custom Voice',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Voice cloning failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      voiceId: data.voiceId,
      voiceName: data.voiceName || voiceName,
      previewUrl: data.previewUrl || null, // URL to sample audio using cloned voice
    };
  } catch (error) {
    console.error('Voice cloning error:', error);
    return {
      success: false,
      error: error.message || 'Failed to clone voice',
    };
  }
}

/**
 * Generate a preview sample using a cloned voice
 * Useful for letting users hear their cloned voice
 */
export async function generateVoicePreview({ voiceId, text }) {
  try {
    const sampleText = text || "Hello! This is what your narration will sound like with your custom voice.";
    
    const response = await fetch(`${API_BASE}/api/voice/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceId,
        text: sampleText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to generate preview');
    }

    const data = await response.json();
    return {
      success: true,
      audioUrl: data.audioUrl,
      audioDuration: data.duration,
    };
  } catch (error) {
    console.error('Voice preview error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get all voices for a user (including ElevenLabs library voices)
 */
export async function getUserVoices({ userId }) {
  try {
    const response = await fetch(`${API_BASE}/api/voice/list?userId=${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();
    return {
      success: true,
      customVoices: data.customVoices || [],
      libraryVoices: data.libraryVoices || [],
    };
  } catch (error) {
    console.error('Get voices error:', error);
    return {
      success: false,
      error: error.message,
      customVoices: [],
      libraryVoices: [],
    };
  }
}

/**
 * Delete a cloned voice
 */
export async function deleteVoice({ voiceId, userId }) {
  try {
    const response = await fetch(`${API_BASE}/api/voice/${voiceId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to delete voice');
    }

    return { success: true };
  } catch (error) {
    console.error('Delete voice error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  cloneVoice,
  generateVoicePreview,
  getUserVoices,
  deleteVoice,
};