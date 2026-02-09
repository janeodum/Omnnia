// src/components/VoiceRecorder.jsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Upload, 
  X, 
  Check, 
  Loader, 
  RefreshCw,
  Volume2,
  CheckCircle
} from 'lucide-react';

const SAMPLE_TEXT = `"From the moment we met, I knew there was something special between us. 
Our story is one of laughter, adventure, and a love that grows stronger every day. 
This is our journey, and I'm so grateful to share it with you."`;

export default function VoiceRecorder({ onVoiceReady, onCancel, existingVoice }) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Cloning state
  const [isCloning, setIsCloning] = useState(false);
  const [cloningComplete, setCloningComplete] = useState(false);
  const [clonedVoice, setClonedVoice] = useState(existingVoice || null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  
  // Error state
  const [error, setError] = useState(null);
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  // Start recording
  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('audio/')) {
      setError('Please upload an audio file (MP3, WAV, etc.)');
      return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Please upload a file under 10MB.');
      return;
    }
    
    setError(null);
    const url = URL.createObjectURL(file);
    setRecordedBlob(file);
    setRecordedUrl(url);
    
    // Get duration from audio element
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setDuration(Math.round(audio.duration));
    };
  };

  // Toggle playback of recorded audio
  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Toggle playback of cloned voice preview
  const togglePreviewPlayback = () => {
    if (!previewAudioRef.current) return;
    
    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // Reset recording
  const resetRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDuration(0);
    setIsPlaying(false);
    setCloningComplete(false);
    setClonedVoice(null);
    setPreviewUrl(null);
    setError(null);
  };

  // Submit voice for cloning
  const handleSubmit = async () => {
    if (!recordedBlob) return;
    
    setIsCloning(true);
    setError(null);
    
    try {
      // Convert blob to base64
      const base64 = await blobToBase64(recordedBlob);
      
      // Call the parent's onVoiceReady with the audio data
      // The parent will handle the actual API call
      const result = await onVoiceReady({
        base64Audio: base64,
        duration: duration,
        mimeType: recordedBlob.type,
      });
      
      // If the API returns voice data with a preview
      if (result?.success) {
        setClonedVoice({
          id: result.voiceId,
          name: result.voiceName || 'My Voice',
        });
        setPreviewUrl(result.previewUrl || null);
        setCloningComplete(true);
      } else {
        setError(result?.error || 'Voice cloning failed. Please try again.');
      }
      
    } catch (err) {
      console.error('Voice cloning error:', err);
      setError(err.message || 'Failed to clone voice. Please try again.');
    } finally {
      setIsCloning(false);
    }
  };

  // Convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Format duration as MM:SS
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Confirm and close after successful clone
  const handleConfirm = () => {
    onCancel(); // Close the modal
  };

  return (
    <div className="voice-recorder">
      <div className="recorder-header">
        <h3>Clone Your Voice</h3>
        <button className="close-btn" onClick={onCancel}>
          <X size={20} />
        </button>
      </div>

      {!cloningComplete ? (
        <>
          <p className="recorder-intro">
            Record yourself reading the sample text below. We'll use this to create a custom voice 
            for your story narration.
          </p>

          <div className="sample-text-box">
            <label>Read this aloud:</label>
            <blockquote>{SAMPLE_TEXT}</blockquote>
          </div>

          {!recordedUrl ? (
            <div className="recording-area">
              <div className={`record-button-container ${isRecording ? 'recording' : ''}`}>
                <button 
                  className="record-btn-large"
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? (
                    <>
                      <Square size={20} />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic size={20} />
                      Start Recording
                    </>
                  )}
                </button>
                
                {isRecording && (
                  <div className="recording-indicator">
                    <span className="pulse-dot"></span>
                    <span>Recording... {formatDuration(duration)}</span>
                  </div>
                )}
              </div>

              <div className="or-divider">or</div>

              <button 
                className="upload-btn-large"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={18} />
                Upload Audio File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <div className="playback-area">
              <div className="audio-preview">
                <button className="play-btn-large" onClick={togglePlayback}>
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="audio-info">
                  <span className="audio-label">Your Recording</span>
                  <span className="audio-duration">{formatDuration(duration)}</span>
                </div>
                <button className="reset-btn" onClick={resetRecording}>
                  <RefreshCw size={18} />
                </button>
              </div>

              <audio 
                ref={audioRef}
                src={recordedUrl}
                onEnded={() => setIsPlaying(false)}
              />

              <div className="submit-actions">
                <button className="cancel-btn-large" onClick={resetRecording}>
                  Re-record
                </button>
                <button 
                  className="submit-btn-large"
                  onClick={handleSubmit}
                  disabled={isCloning}
                >
                  {isCloning ? (
                    <>
                      <Loader size={18} className="spinning" />
                      Cloning Voice...
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Clone My Voice
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        // Success state - show cloned voice preview
        <div className="clone-success">
          <div className="success-icon">
            <CheckCircle size={48} />
          </div>
          
          <h4>Voice Successfully Cloned!</h4>
          <p>Your custom voice is ready. Listen to a preview below:</p>

          {previewUrl ? (
            <div className="preview-player">
              <button 
                className="preview-play-btn"
                onClick={togglePreviewPlayback}
              >
                {isPlayingPreview ? <Pause size={24} /> : <Play size={24} />}
              </button>
              <div className="preview-info">
                <span className="preview-label">
                  <Volume2 size={16} />
                  Voice Preview
                </span>
                <span className="preview-name">{clonedVoice?.name || 'My Voice'}</span>
              </div>
              <audio
                ref={previewAudioRef}
                src={previewUrl}
                onEnded={() => setIsPlayingPreview(false)}
              />
            </div>
          ) : (
            <div className="no-preview">
              <Volume2 size={24} />
              <span>Voice saved! Preview will be available when narration is generated.</span>
            </div>
          )}

          <div className="success-actions">
            <button className="clone-another-btn" onClick={resetRecording}>
              <RefreshCw size={16} />
              Clone Different Voice
            </button>
            <button className="confirm-btn" onClick={handleConfirm}>
              <Check size={16} />
              Use This Voice
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="recorder-error">
          {error}
        </div>
      )}

      {!cloningComplete && (
        <div className="recorder-tips">
          <h4>Tips for best results:</h4>
          <ul>
            <li>Record in a quiet environment</li>
            <li>Speak clearly and naturally</li>
            <li>Keep a consistent distance from the mic</li>
            <li>Record at least 15-30 seconds of audio</li>
          </ul>
        </div>
      )}
    </div>
  );
}