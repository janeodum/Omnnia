// src/components/ProjectDetailView.jsx
import React, { useState } from 'react';
import {
  ChevronLeft,
  X,
  Download,
  Play,
  Film,
  Image as ImageIcon,
  Music,
  Loader,
  CheckCircle,
  AlertCircle,
  Combine
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import './ProjectDetailView.css';

const ProjectDetailView = ({ project, onBack, onClose, user }) => {
  const [activeTab, setActiveTab] = useState('images');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const images = project.generatedImages || [];
  const videos = project.videos || [];
  const combinedVideo = project.combinedVideoUrl;
  const narrationAudios = project.narrationAudios || [];

  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download. Please try again.');
    }
  };

  const handleDownloadAll = async (type) => {
    const items = type === 'images' ? images : videos;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const url = item.imageUrl || item.image || item.url;
      if (url) {
        const ext = type === 'images' ? 'png' : 'mp4';
        await handleDownload(url, `${project.name || 'scene'}_${i + 1}.${ext}`);
        // Small delay between downloads
        await new Promise(r => setTimeout(r, 500));
      }
    }
  };

  const handleExportCombinedVideo = async () => {
    if (videos.length === 0) {
      setExportError('No videos to combine. Please generate videos first.');
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const API_BASE = process.env.REACT_APP_API_URL || 'https://omnia-webui-production.up.railway.app';
      
      const response = await fetch(`${API_BASE}/api/video/combine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: videos.map(v => ({
            url: v.url,
            index: v.index,
          })),
          projectId: project.id,
          includeNarration: narrationAudios.length > 0,
          narrationAudios: narrationAudios,
          musicPreference: project.musicPreference || 'Romantic Piano',
        }),
      });

      const data = await response.json();

      if (data.success && data.combinedVideoUrl) {
        // Update project in Firestore
        const projectRef = doc(db, 'projects', project.id);
        await updateDoc(projectRef, {
          combinedVideoUrl: data.combinedVideoUrl,
          updatedAt: new Date(),
        });

        // Update local state (you'd need to pass a callback for this)
        alert('Combined video created successfully!');
        window.location.reload(); // Simple refresh to show new video
      } else {
        throw new Error(data.error || 'Failed to combine videos');
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error.message || 'Failed to export combined video');
    } finally {
      setExporting(false);
    }
  };

  const renderImages = () => (
    <div className="detail-gallery">
      {images.length === 0 ? (
        <div className="empty-section">
          <ImageIcon size={48} />
          <p>No images generated yet</p>
        </div>
      ) : (
        <>
          <div className="gallery-actions">
            <button 
              className="download-all-btn"
              onClick={() => handleDownloadAll('images')}
            >
              <Download size={16} />
              Download All Images
            </button>
          </div>
          <div className="gallery-grid">
            {images.map((img, idx) => (
              <div 
                key={idx} 
                className="gallery-item"
                onClick={() => setSelectedItem({ type: 'image', data: img, index: idx })}
              >
                <img 
                  src={img.imageUrl || img.image} 
                  alt={img.title || `Scene ${idx + 1}`}
                />
                <div className="item-overlay">
                  <span className="item-title">{img.title || `Scene ${idx + 1}`}</span>
                  <button 
                    className="download-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(img.imageUrl || img.image, `scene_${idx + 1}.png`);
                    }}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderVideos = () => (
    <div className="detail-gallery">
      {videos.length === 0 ? (
        <div className="empty-section">
          <Film size={48} />
          <p>No videos generated yet</p>
          {images.length > 0 && (
            <p className="hint">Go back to your project to generate videos from your images.</p>
          )}
        </div>
      ) : (
        <>
          <div className="gallery-actions">
            <button 
              className="download-all-btn"
              onClick={() => handleDownloadAll('videos')}
            >
              <Download size={16} />
              Download All Scenes
            </button>
            
            {!combinedVideo && (
              <button 
                className="export-btn"
                onClick={handleExportCombinedVideo}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <Loader className="spinning" size={16} />
                    Combining...
                  </>
                ) : (
                  <>
                    <Combine size={16} />
                    Export Combined Video
                  </>
                )}
              </button>
            )}
          </div>
          
          {exportError && (
            <div className="export-error">
              <AlertCircle size={16} />
              {exportError}
            </div>
          )}
          
          <div className="gallery-grid">
            {videos.map((video, idx) => (
              <div 
                key={idx} 
                className="gallery-item video-item"
                onClick={() => setSelectedItem({ type: 'video', data: video, index: idx })}
              >
                <video 
                  src={video.url}
                  preload="metadata"
                />
                <div className="play-overlay">
                  <Play size={32} fill="white" />
                </div>
                <div className="item-overlay">
                  <span className="item-title">{video.title || `Scene ${idx + 1}`}</span>
                  <button 
                    className="download-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(video.url, `scene_${idx + 1}.mp4`);
                    }}
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderCombinedVideo = () => (
    <div className="combined-video-section">
      {combinedVideo ? (
        <div className="combined-video-container">
          <div className="video-status success">
            <CheckCircle size={20} />
            <span>Your love story video is ready!</span>
          </div>
          
          <video 
            src={combinedVideo}
            controls
            className="combined-video"
          />
          
          <div className="video-actions">
            <button 
              className="primary-download-btn"
              onClick={() => handleDownload(combinedVideo, `${project.name || 'love_story'}.mp4`)}
            >
              <Download size={18} />
              Download Full Video
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-section">
          <Film size={48} />
          <h3>No combined video yet</h3>
          {videos.length > 0 ? (
            <>
              <p>You have {videos.length} scene videos ready to combine.</p>
              <button 
                className="export-btn large"
                onClick={handleExportCombinedVideo}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <Loader className="spinning" size={18} />
                    Creating Combined Video...
                  </>
                ) : (
                  <>
                    <Combine size={18} />
                    Create Combined Video
                  </>
                )}
              </button>
            </>
          ) : (
            <p>Generate videos from your images first, then combine them into a full movie.</p>
          )}
        </div>
      )}
    </div>
  );

  const renderNarration = () => (
    <div className="narration-section">
      {narrationAudios.length === 0 ? (
        <div className="empty-section">
          <Music size={48} />
          <p>No narration audio generated</p>
          <p className="hint">
            Enable voice narration in your project settings to add personalized narration.
          </p>
        </div>
      ) : (
        <div className="narration-list">
          {narrationAudios.map((audio, idx) => (
            <div key={idx} className="narration-item">
              <div className="narration-info">
                <span className="narration-title">Scene {audio.sceneIndex + 1} Narration</span>
                <p className="narration-text">{audio.text}</p>
              </div>
              <audio src={audio.audioUrl} controls />
              <button 
                className="download-btn"
                onClick={() => handleDownload(audio.audioUrl, `narration_scene_${audio.sceneIndex + 1}.mp3`)}
              >
                <Download size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="project-detail-modal">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft size={24} />
          Back to Projects
        </button>
        <h2>{project.name || 'Untitled Project'}</h2>
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>
      </div>

      <div className="detail-tabs">
        <button 
          className={`tab ${activeTab === 'images' ? 'active' : ''}`}
          onClick={() => setActiveTab('images')}
        >
          <ImageIcon size={18} />
          Images ({images.length})
        </button>
        <button 
          className={`tab ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          <Film size={18} />
          Video Scenes ({videos.length})
        </button>
        <button 
          className={`tab ${activeTab === 'combined' ? 'active' : ''}`}
          onClick={() => setActiveTab('combined')}
        >
          <Play size={18} />
          Full Video {combinedVideo && <CheckCircle size={14} className="tab-check" />}
        </button>
        <button 
          className={`tab ${activeTab === 'narration' ? 'active' : ''}`}
          onClick={() => setActiveTab('narration')}
        >
          <Music size={18} />
          Narration ({narrationAudios.length})
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'images' && renderImages()}
        {activeTab === 'videos' && renderVideos()}
        {activeTab === 'combined' && renderCombinedVideo()}
        {activeTab === 'narration' && renderNarration()}
      </div>

      {/* Lightbox for viewing individual items */}
      {selectedItem && (
        <div className="lightbox" onClick={() => setSelectedItem(null)}>
          <button className="lightbox-close" onClick={() => setSelectedItem(null)}>
            <X size={24} />
          </button>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            {selectedItem.type === 'image' ? (
              <img 
                src={selectedItem.data.imageUrl || selectedItem.data.image} 
                alt={selectedItem.data.title}
              />
            ) : (
              <video 
                src={selectedItem.data.url}
                controls
                autoPlay
              />
            )}
            <div className="lightbox-info">
              <h3>{selectedItem.data.title || `Scene ${selectedItem.index + 1}`}</h3>
              {selectedItem.data.description && (
                <p>{selectedItem.data.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetailView;