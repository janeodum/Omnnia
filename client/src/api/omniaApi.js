// src/api/omniaApi.js
const API_BASE = process.env.REACT_APP_API_URL || 'https://omnia-webui-production.up.railway.app';

/**
 * Helper to make API requests with error handling
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

// ==================== STORYBOARD ====================

/**
 * Create a storyboard from story details
 */
export async function createStoryboard(data) {
  return apiRequest('/api/storyboard', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== IMAGE GENERATION ====================

/**
 * Generate scene images
 */
export async function generateScenes(data) {
  return apiRequest('/api/generate-scenes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Upload reference photos
 */

export async function uploadPhotos(photos) {
  const files = [];

  for (const [category, fileList] of Object.entries(photos)) {
    for (const file of fileList) {
      // Case 1: Already processed object with { name, data } from PhotoUploader
      if (typeof file === 'object' && file.data) {
        console.log(`📷 Adding ${file.name || 'photo'} to upload queue`);
        files.push({
          category,
          data: file.data,
          name: file.name || 'photo'
        });
      }
      // Case 2: Raw base64 string
      else if (typeof file === 'string') {
        files.push({ category, data: file, name: 'photo' });
      }
      // Case 3: File object (from input)
      else if (file instanceof File) {
        const base64 = await fileToBase64(file);
        files.push({ category, data: base64, name: file.name });
      }
      else {
        console.warn('Unknown file format:', typeof file, file);
      }
    }
  }

  if (files.length === 0) {
    console.warn('No valid files to upload');
    return { uploaded: {} };
  }

  console.log(`📸 Uploading ${files.length} photos to server...`);

  return apiRequest('/api/upload-photos', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

// ==================== VIDEO GENERATION ====================

/**
 * Create videos from scenes using ComfyUI
 */
export async function createComfyVideosFromScenes(data) {
  return apiRequest('/api/video/comfy-scenes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Create videos from scenes using Sora
 */
export async function createSoraVideosFromScenes(data) {
  return apiRequest('/api/video/sora-scenes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Create videos from scenes using Google Veo (frame interpolation)
 * Uses first and last frame of each scene to generate smooth 5-sec video
 */
export async function createVeoVideosFromScenes(data) {
  return apiRequest('/api/video/veo-scenes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Check Veo video job status
 */
export async function checkVeoJobStatus(jobId) {
  return apiRequest(`/api/video/veo-status/${jobId}`, {
    method: 'GET',
  });
}

/**
 * Check video job status
 */
export async function checkVideoJobStatus(jobId) {
  return apiRequest(`/api/video/status/${jobId}`, {
    method: 'GET',
  });
}

/**
 * Retry a specific video scene
 */
export async function retryVideoScene(jobId, sceneIndex) {
  return apiRequest(`/api/video/retry/${jobId}/${sceneIndex}`, {
    method: 'POST',
  });
}

/**
 * Combine multiple videos into one
 */
export async function combineVideos(data) {
  return apiRequest('/api/video/combine', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== VOICE & NARRATION ====================

/**
 * Clone user's voice
 */
export async function cloneVoice(data) {
  return apiRequest('/api/voice/clone', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Generate narration scripts for scenes
 */
export async function generateNarrationScripts(data) {
  return apiRequest('/api/narration/scripts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Generate TTS audio for narrations
 */
export async function generateNarrationAudio(data) {
  return apiRequest('/api/narration/audio', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Add narration to videos
 */
export async function addNarrationToVideos(data) {
  return apiRequest('/api/video/add-narration', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== CREDITS & PAYMENTS ====================

/**
 * Get user's credit balance
 */
export async function getUserCredits(userId) {
  return apiRequest(`/api/credits/${userId}`, {
    method: 'GET',
  });
}

/**
 * Deduct credits after successful generation
 */
export async function deductCredits(userId, amount, reason) {
  return apiRequest('/api/credits/deduct', {
    method: 'POST',
    body: JSON.stringify({ userId, amount, reason }),
  });
}

/**
 * Create Stripe checkout session
 */
export async function createCheckoutSession(data) {
  return apiRequest('/api/stripe/create-checkout', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== PROJECT MANAGEMENT ====================

/**
 * Save generated images to project
 */
export async function saveProjectImages(projectId, images) {
  return apiRequest(`/api/projects/${projectId}/images`, {
    method: 'POST',
    body: JSON.stringify({ images }),
  });
}

/**
 * Save generated videos to project
 */
export async function saveProjectVideos(projectId, videos) {
  return apiRequest(`/api/projects/${projectId}/videos`, {
    method: 'POST',
    body: JSON.stringify({ videos }),
  });
}

/**
 * Save combined video to project
 */
export async function saveProjectCombinedVideo(projectId, videoUrl) {
  return apiRequest(`/api/projects/${projectId}/combined-video`, {
    method: 'POST',
    body: JSON.stringify({ combinedVideoUrl: videoUrl }),
  });
}

export async function generateScenesAsync(params) {
  const response = await fetch(`${API_BASE}/api/generate-scenes-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'Failed to start image generation');
  }

  return response.json();
}

export async function checkImageJobStatus(jobId) {
  const response = await fetch(`${API_BASE}/api/image/status/${jobId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || 'Failed to check job status');
  }

  return response.json();
}
// ==================== HEALTH CHECK ====================

/**
 * Check API health
 */
export async function healthCheck() {
  return apiRequest('/api/health', {
    method: 'GET',
  });
}

// ==================== MUSIC GENERATION ====================

/**
 * Get available music styles
 */
export async function getMusicStyles() {
  return apiRequest('/api/music/styles', {
    method: 'GET',
  });
}

/**
 * Generate background music
 */
export async function generateMusic(style, durationMs) {
  return apiRequest('/api/music/generate', {
    method: 'POST',
    body: JSON.stringify({ style, durationMs }),
  });
}

/**
 * Generate all 3 music tracks in parallel
 */
export async function generateAllMusic(durationMs) {
  return apiRequest('/api/music/generate-all', {
    method: 'POST',
    body: JSON.stringify({ durationMs }),
  });
}

const omniaApi = {
  createStoryboard,
  generateScenes,
  uploadPhotos,
  createComfyVideosFromScenes,
  createSoraVideosFromScenes,
  checkVideoJobStatus,
  retryVideoScene,
  combineVideos,
  cloneVoice,
  generateNarrationScripts,
  generateNarrationAudio,
  addNarrationToVideos,
  getUserCredits,
  deductCredits,
  createCheckoutSession,
  saveProjectImages,
  saveProjectVideos,
  saveProjectCombinedVideo,
  healthCheck,
  getMusicStyles,
  generateMusic,
  generateAllMusic,
}
export default omniaApi;