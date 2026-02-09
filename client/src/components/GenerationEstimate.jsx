// src/components/GenerationEstimate.jsx
import React, { useState } from 'react';
import { Clock, Film, Image, Mail, Bell, Info } from 'lucide-react';
import './GenerationEstimate.css';

const GenerationEstimate = ({
  sceneCount,
  estimatedDuration,
  onConfirm,
  onCancel,
  user
}) => {
  const [emailNotification, setEmailNotification] = useState(false);

  // Calculate estimates
  const imageGenerationTime = Math.ceil(sceneCount * 0.5); // ~30 seconds per scene
  const videoGenerationTime = Math.ceil(sceneCount * 5); // ~5 minutes per scene for video
  const narrationTime = 2; // ~2 minutes for narration generation
  const totalTime = imageGenerationTime + videoGenerationTime + narrationTime;

  const formatTime = (minutes) => {
    if (minutes < 60) {
      return `${minutes} min${minutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const handleConfirm = () => {
    onConfirm({ emailNotification });
  };

  return (
    <div className="generation-estimate-overlay">
      <div className="generation-estimate-card">
        <div className="estimate-header">
          <Clock size={24} className="header-icon" />
          <h2>Generation Time Estimate</h2>
        </div>

        <div className="estimate-info">
          <Info size={16} />
          <p>Your video will be generated in the background. You can close this tab and return later.</p>
        </div>

        <div className="estimate-breakdown">
          <div className="estimate-row">
            <div className="estimate-label">
              <Image size={18} />
              <span>Scene Images</span>
            </div>
            <div className="estimate-value">
              <span className="time">{formatTime(imageGenerationTime)}</span>
              <span className="detail">{sceneCount} scenes</span>
            </div>
          </div>

          <div className="estimate-row">
            <div className="estimate-label">
              <Film size={18} />
              <span>Video Animation</span>
            </div>
            <div className="estimate-value">
              <span className="time">{formatTime(videoGenerationTime)}</span>
              <span className="detail">~{estimatedDuration} seconds total</span>
            </div>
          </div>

          <div className="estimate-row">
            <div className="estimate-label">
              <Bell size={18} />
              <span>Narration & Music</span>
            </div>
            <div className="estimate-value">
              <span className="time">{formatTime(narrationTime)}</span>
              <span className="detail">AI voice + soundtrack</span>
            </div>
          </div>

          <div className="estimate-total">
            <div className="total-label">
              <Clock size={20} />
              <span>Total Estimated Time</span>
            </div>
            <div className="total-value">{formatTime(totalTime)}</div>
          </div>
        </div>

        {user?.email && (
          <div className="notification-toggle">
            <label className="toggle-container">
              <input
                type="checkbox"
                checked={emailNotification}
                onChange={(e) => setEmailNotification(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <div className="toggle-label">
                <Mail size={18} />
                <span>Email me when video is ready</span>
              </div>
            </label>
            {emailNotification && (
              <div className="email-preview">
                <span>We'll send a notification to: <strong>{user.email}</strong></span>
              </div>
            )}
          </div>
        )}

        <div className="estimate-actions">
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="confirm-btn" onClick={handleConfirm}>
            Start Generation
          </button>
        </div>

        <div className="estimate-note">
          <Info size={14} />
          <span>Generation times are estimates and may vary based on server load.</span>
        </div>
      </div>
    </div>
  );
};

export default GenerationEstimate;
