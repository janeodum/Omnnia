// src/components/VoicePreviewCard.jsx
import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, Play, Square, Mic, Volume2, Waveform } from 'lucide-react';

function VoicePreviewCard({ 
  voiceId, 
  voiceName,
  previewUrl, 
  onChangeVoice,
  onRecordNew 
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef(null);
  const progressInterval = useRef(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);

  const handlePlayStop = () => {
    if (isPlaying) {
      // Stop
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      setIsPlaying(false);
      setProgress(0);
    } else {
      // Play
      if (!previewUrl) return;
      
      const audio = new Audio(previewUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        if (progressInterval.current) {
          clearInterval(progressInterval.current);
        }
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsPlaying(false);
        setProgress(0);
      };

      audio.play().then(() => {
        setIsPlaying(true);
        // Update progress
        progressInterval.current = setInterval(() => {
          if (audio.duration) {
            setProgress((audio.currentTime / audio.duration) * 100);
          }
        }, 100);
      }).catch(err => {
        console.error('Failed to play audio:', err);
      });
    }
  };

  const hasPreview = !!previewUrl;

  return (
    <div className="voice-preview-card">
      {/* Header with status */}
      <div className="vpc-header">
        <div className="vpc-status">
          <CheckCircle size={18} className="vpc-check-icon" />
          <span>Voice Ready</span>
        </div>
      </div>

      {/* Main content */}
      <div className="vpc-content">
        {/* Voice info and player */}
        <div className="vpc-player-section">
          {hasPreview ? (
            <>
              {/* Play/Stop button */}
              <button 
                className={`vpc-play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={handlePlayStop}
                aria-label={isPlaying ? 'Stop preview' : 'Play preview'}
              >
                {isPlaying ? (
                  <Square size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </button>

              {/* Waveform / Progress area */}
              <div className="vpc-waveform">
                <div className="vpc-wave-bars">
                  {[...Array(20)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`vpc-bar ${isPlaying ? 'animating' : ''}`}
                      style={{ 
                        height: `${20 + Math.random() * 60}%`,
                        animationDelay: `${i * 0.05}s`,
                        opacity: progress > (i / 20) * 100 ? 1 : 0.3
                      }}
                    />
                  ))}
                </div>
                <div 
                  className="vpc-progress-line" 
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Label */}
              <span className="vpc-label">
                {isPlaying ? 'Playing...' : 'Preview'}
              </span>
            </>
          ) : (
            <div className="vpc-no-preview">
              <Volume2 size={16} className="vpc-muted-icon" />
              <span>Preview not available</span>
              <span className="vpc-subtext">Voice will still work for narration</span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="vpc-actions">
        <button 
          className="vpc-change-btn"
          onClick={onChangeVoice || onRecordNew}
        >
          <Mic size={14} />
          Change Voice
        </button>
      </div>
    </div>
  );
}

export default VoicePreviewCard;