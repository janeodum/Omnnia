// server/services/r2Service.js
// Fixed to use R2_PUBLIC_URL for browser-accessible URLs

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class R2Service {
  constructor() {
    // Check for required environment variables
    const endpoint = process.env.BUCKET_ENDPOINT_URL || process.env.R2_ENDPOINT;
    const accessKeyId = process.env.BUCKET_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.BUCKET_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.BUCKET_NAME || process.env.R2_BUCKET_NAME;
    
    // CRITICAL: This should be your PUBLIC R2 URL (e.g., https://pub-xxxxx.r2.dev)
    // NOT the private S3 endpoint
    this.publicUrl = process.env.R2_PUBLIC_URL;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
      console.warn('⚠️ R2 not fully configured. Missing environment variables.');
      this.client = null;
      this.bucketName = null;
      return;
    }

    if (!this.publicUrl) {
      console.warn('⚠️ R2_PUBLIC_URL not set! Audio/images won\'t be accessible in browser.');
      console.warn('   Set R2_PUBLIC_URL to your public bucket URL (e.g., https://pub-xxxxx.r2.dev)');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    this.bucketName = bucketName;
    console.log('   R2Service initialized');
    console.log(`   Bucket: ${bucketName}`);
    console.log(`   Public URL: ${this.publicUrl || 'NOT SET - will use signed URLs'}`);
  }

  /**
   * Generate a unique filename
   */
  generateFilename(originalName, prefix = '') {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(originalName) || '.bin';
    const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    return `${prefix}${timestamp}_${randomId}_${baseName}${ext}`;
  }

  /**
   * Get the public URL for a file
   * Uses R2_PUBLIC_URL if set, otherwise falls back to signed URL
   */
  getPublicUrl(key) {
    if (this.publicUrl) {
      // Use the public URL (recommended)
      const cleanPublicUrl = this.publicUrl.replace(/\/$/, '');
      return `${cleanPublicUrl}/${key}`;
    }
    
    // Fallback: return null and let caller use signed URL
    return null;
  }

  /**
   * Upload a buffer to R2
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Target filename
   * @param {string} contentType - MIME type
   * @param {string} folder - Optional folder path
   * @returns {Promise<string>} Public URL
   */
  async uploadBuffer(buffer, filename, contentType = 'application/octet-stream', folder = '') {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const key = folder ? `${folder}/${filename}` : filename;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.client.send(command);
    console.log(`✅ Uploaded to R2: ${key}`);

    // Return public URL if available
    const publicUrl = this.getPublicUrl(key);
    if (publicUrl) {
      return publicUrl;
    }

    // Fallback to signed URL (7 days expiry)
    return await this.getSignedUrl(key);
  }

  /**
   * Upload an audio file to R2
   * @param {string} filePath - Local file path
   * @param {string} folder - Target folder in bucket
   * @returns {Promise<string>} Public URL
   */
  async uploadAudio(filePath, folder = 'audio') {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const buffer = fs.readFileSync(filePath);
    const originalName = path.basename(filePath);
    const filename = this.generateFilename(originalName);
    const key = `${folder}/${filename}`;

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.webm': 'audio/webm',
    };
    const contentType = contentTypes[ext] || 'audio/mpeg';

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.client.send(command);
    console.log(`✅ Audio uploaded to R2: ${key}`);

    // Return public URL if available
    const publicUrl = this.getPublicUrl(key);
    if (publicUrl) {
      console.log(`🔗 Public URL: ${publicUrl}`);
      return publicUrl;
    }

    // Fallback to signed URL
    const signedUrl = await this.getSignedUrl(key);
    console.log(`🔗 Signed URL (fallback): ${signedUrl.substring(0, 80)}...`);
    return signedUrl;
  }

  /**
   * Upload a video file to R2
   * @param {string} filePath - Local file path
   * @param {string} folder - Target folder in bucket
   * @returns {Promise<string>} Public URL
   */
  async uploadVideo(filePath, folder = 'videos') {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const buffer = fs.readFileSync(filePath);
    const originalName = path.basename(filePath);
    const filename = this.generateFilename(originalName);
    const key = `${folder}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'video/mp4',
    });

    await this.client.send(command);
    console.log(`✅ Video uploaded to R2: ${key}`);

    const publicUrl = this.getPublicUrl(key);
    if (publicUrl) {
      return publicUrl;
    }

    return await this.getSignedUrl(key);
  }

  /**
   * Upload an image file to R2
   * @param {string} filePath - Local file path  
   * @param {string} folder - Target folder in bucket
   * @returns {Promise<string>} Public URL
   */
  async uploadImage(filePath, folder = 'images') {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const buffer = fs.readFileSync(filePath);
    const originalName = path.basename(filePath);
    const filename = this.generateFilename(originalName);
    const key = `${folder}/${filename}`;

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = contentTypes[ext] || 'image/png';

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.client.send(command);
    console.log(`✅ Image uploaded to R2: ${key}`);

    const publicUrl = this.getPublicUrl(key);
    if (publicUrl) {
      return publicUrl;
    }

    return await this.getSignedUrl(key);
  }

  /**
   * Download a file from R2 as a Buffer
   * @param {string} key - Object key in bucket
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadBuffer(key) {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Extract the R2 object key from a URL (public or endpoint URL)
   * @param {string} url - R2 URL
   * @returns {string|null} Object key or null if not an R2 URL
   */
  extractKeyFromUrl(url) {
    if (!url) return null;

    // Match public URL pattern
    if (this.publicUrl && url.startsWith(this.publicUrl)) {
      const cleanPublicUrl = this.publicUrl.replace(/\/$/, '');
      return url.substring(cleanPublicUrl.length + 1);
    }

    // Match R2 endpoint pattern: https://xxx.r2.cloudflarestorage.com/key?params
    const r2Match = url.match(/r2\.cloudflarestorage\.com\/(.+?)(\?|$)/);
    if (r2Match) {
      return decodeURIComponent(r2Match[1]);
    }

    return null;
  }

  /**
   * Get a signed URL for private access (fallback)
   * @param {string} key - Object key in bucket
   * @param {number} expiresIn - Expiry in seconds (default 7 days)
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(key, expiresIn = 604800) {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Upload image from base64 with userId organization
   * @param {string} base64Data - Base64 image data
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   * @param {number} index - Scene index
   * @returns {Promise<string>} Public URL
   */
  async uploadImageFromBase64(base64Data, userId, projectId, index) {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    // Remove data URL prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const filename = `scene-${index}.png`;
    const key = `users/${userId}/projects/${projectId}/images/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
    });

    await this.client.send(command);
    console.log(`✅ Image uploaded to R2: ${key}`);

    const publicUrl = this.getPublicUrl(key);
    return publicUrl || await this.getSignedUrl(key);
  }

  /**
   * Upload video from URL with userId organization
   * @param {string} videoUrl - Temporary video URL
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   * @param {number} index - Scene index
   * @returns {Promise<string>} Public URL
   */
  async uploadVideoFromUrl(videoUrl, userId, projectId, index) {
    if (!this.client) {
      throw new Error('R2 client not initialized');
    }

    const axios = require('axios');

    // Download video from temporary URL
    const response = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      timeout: 60000
    });

    const buffer = Buffer.from(response.data);
    const filename = `scene-${index}.mp4`;
    const key = `users/${userId}/projects/${projectId}/videos/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'video/mp4',
    });

    await this.client.send(command);
    console.log(`✅ Video uploaded to R2: ${key}`);

    const publicUrl = this.getPublicUrl(key);
    return publicUrl || await this.getSignedUrl(key);
  }
}

module.exports = R2Service;