import React, { useState, useEffect } from 'react';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    ZoomIn,
    ZoomOut,
    Scissors
} from 'lucide-react';

const TimelineControls = ({
    isPlaying,
    onPlayPause,
    currentTime,
    duration,
    onSeek,
    zoom, // Restored
    onZoomChange,
    onSplit,
    canSplit,
    onFit // New prop
}) => {

    const formatTime = (timeInSeconds) => {
        if (!timeInSeconds && timeInSeconds !== 0) return "00:00:00";

        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        const milliseconds = Math.floor((timeInSeconds % 1) * 100);

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="timeline-controls-bar">
            <div className="group-left">
                <button
                    className="control-icon-btn"
                    onClick={onSplit}
                    disabled={!canSplit}
                    title="Split Clip (S)"
                >
                    <Scissors size={18} />
                </button>
                {/* Placeholder for copy/delete if needed later */}
            </div>

            <div className="group-center">
                <div className="time-display">{formatTime(currentTime)}</div>

                <div className="playback-buttons">
                    <button className="control-icon-btn" onClick={() => onSeek(currentTime - 5)}>
                        <SkipBack size={20} fill="currentColor" />
                    </button>

                    <button
                        className={`play-pause-btn ${isPlaying ? 'playing' : ''}`}
                        onClick={onPlayPause}
                    >
                        {isPlaying ? (
                            <Pause size={24} fill="black" />
                        ) : (
                            <Play size={24} fill="black" style={{ marginLeft: 2 }} />
                        )}
                    </button>

                    <button className="control-icon-btn" onClick={() => onSeek(currentTime + 5)}>
                        <SkipForward size={20} fill="currentColor" />
                    </button>
                </div>

                <div className="time-display total-time">{formatTime(duration)}</div>
            </div>

            <div className="group-right">
                <div className="zoom-controls">
                    <ZoomOut size={16} className="zoom-icon" onClick={() => onZoomChange(Math.max(10, zoom - 10))} />
                    <input
                        type="range"
                        min="10"
                        max="200"
                        value={zoom}
                        onChange={(e) => onZoomChange(Number(e.target.value))}
                        className="zoom-slider"
                    />
                    <ZoomIn size={16} className="zoom-icon" onClick={() => onZoomChange(Math.min(200, zoom + 10))} />
                    <button
                        className="control-icon-btn"
                        onClick={onFit}
                        title="Fit to Screen"
                        style={{ marginLeft: 8, fontSize: 11, padding: '4px 8px', border: '1px solid #333' }}
                    >
                        Fit
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TimelineControls;
