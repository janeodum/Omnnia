// src/components/PhotoUploader.jsx
import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

function PhotoUploader({ label, name, onUpload, onRemove, disabled, uploadedCount = 0, uploadedPhotos = [] }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = () => {
    if (disabled || uploading) return;
    if (inputRef.current) inputRef.current.click();
  };

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    try {
      const processed = await Promise.all(files.map(fileToBase64Descriptor));
      await onUpload(name, processed);
    } catch (err) {
      console.error('PhotoUploader: failed to process files', err);
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  function fileToBase64Descriptor(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        resolve({
          name: file.name,
          data: dataUrl
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ✅ FIXED: Robust URL generator
  const getImageUrl = (photo) => {
    if (!photo) return '';

    // 1. If it's a local preview object (immediate upload)
    if (typeof photo === 'object' && photo.data) return photo.data;

    // 2. If it's a string (path from server)
    if (typeof photo === 'string') {
      // If it's already a full URL or base64, return it
      if (photo.startsWith('http') || photo.startsWith('data:')) return photo;

      // 🔧 FIX: Replace Windows backslashes with forward slashes
      let cleanPath = photo.replace(/\\/g, '/');

      // Ensure we don't double-slash the start
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

      // Construct the full URL pointing to your Node server
      // Make sure this matches your actual server port (5050)
      return `http://localhost:5050/${cleanPath}`;
    }
    return '';
  };

  return (
    <div className="photo-uploader">
      <div className="photo-uploader-header">
        <span className="photo-label">{label}</span>
        {uploadedCount > 0 && <span className="photo-count">{uploadedCount} uploaded</span>}
      </div>

      <button
        type="button"
        className={`photo-upload-btn ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleClick}
        disabled={disabled || uploading}
      >
        <Upload size={14} className="mr-2" />
        {uploading ? 'Uploading...' : 'Choose Photos'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      {/* Thumbnail Grid */}
      {uploadedPhotos.length > 0 && (
        <div className="uploaded-thumbnails">
          {uploadedPhotos.map((photo, index) => {
            const src = getImageUrl(photo);
            return (
              <div key={index} className="thumbnail-wrapper">
                <button
                  type="button"
                  className="remove-photo-btn"
                  onClick={() => onRemove && onRemove(name, index)}
                  title="Remove photo"
                >
                  <X size={10} />
                </button>
                <img
                  src={src}
                  alt={`${label} ${index + 1}`}
                  className="photo-thumbnail"
                  // 🔧 DEBUG: Log error if image fails to load, but DON'T hide it immediately
                  onError={(e) => console.error("Failed to load image:", src)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PhotoUploader;