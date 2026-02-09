// server/services/photoStorage.js
const fs = require('fs');
const path = require('path');

function ensureDir(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function guessExtension(fileName, mimeType) {
  const ext = path.extname(fileName || '').trim();
  if (ext) {
    return ext;
  }

  if (!mimeType) {
    return '.png';
  }

  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };

  return map[mimeType] || '.png';
}

/**
 * Accepts either:
 *  - plain base64: "iVBORw0KGgoAAAANSUhEUgAA..."
 *  - data URL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 */
function saveBase64File(rootDir, fileDescriptor) {
  let { category = 'misc', name = 'upload.png', type = 'image/png', data } = fileDescriptor;

  if (!data) {
    throw new Error('Missing file data');
  }

  if (typeof data !== 'string') {
    throw new Error('File data must be a base64 string or data URL string');
  }

  // Handle data URLs
  let base64 = data;
  let mimeType = type;

  const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType || 'image/png';
    base64 = dataUrlMatch[2];
  }

  if (!mimeType) {
    mimeType = 'image/png';
  }

  const buffer = Buffer.from(base64, 'base64');

  const categoryDir = path.join(rootDir, category);
  ensureDir(categoryDir);

  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${guessExtension(
    name,
    mimeType
  )}`;
  const filePath = path.join(categoryDir, filename);
  fs.writeFileSync(filePath, buffer);

  return path
    .relative(rootDir, filePath)
    .replace(/\\/g, '/'); // normalize for URLs on Windows
}

module.exports = {
  ensureDir,
  saveBase64File,
};