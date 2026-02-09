// API calls for R2 storage
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Upload images to R2 storage
 * @param {Array} images - Array of image objects with imageBase64/imageUrl
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} - Images with R2 URLs
 */
export async function uploadImagesToR2(images, userId, projectId) {
  try {
    const response = await axios.post(`${API_URL}/api/upload-images-to-r2`, {
      images,
      userId,
      projectId,
    });

    return response.data.images;
  } catch (error) {
    console.error('Failed to upload images to R2:', error);
    throw error;
  }
}

/**
 * Upload videos to R2 storage
 * @param {Array} videos - Array of video objects with url
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} - Videos with R2 URLs
 */
export async function uploadVideosToR2(videos, userId, projectId) {
  try {
    const response = await axios.post(`${API_URL}/api/upload-videos-to-r2`, {
      videos,
      userId,
      projectId,
    });

    return response.data.videos;
  } catch (error) {
    console.error('Failed to upload videos to R2:', error);
    throw error;
  }
}
