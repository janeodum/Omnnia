import React, { useEffect, useRef, useCallback } from 'react';

const VideoPlayer = ({ src, playing, seekTo, onTimeUpdate, onDurationChange, onEnded, onPlay, onPause, onReady, playbackRate = 1 }) => {
  const videoRef = useRef(null);
  const currentSrcRef = useRef(null);
  const autoPlayNextRef = useRef(false); // Set by ended handler, guarantees next video plays
  const loadingSrcRef = useRef(false); // True while loading a new src (suppresses pause effect)
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onDurationChangeRef = useRef(onDurationChange);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);

  // Keep all refs fresh
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => { onDurationChangeRef.current = onDurationChange; }, [onDurationChange]);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);

  // Notify parent on mount
  useEffect(() => {
    if (onReady && videoRef.current) {
      onReady(videoRef.current);
    }
  }, [onReady]);

  // Update playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle src changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (currentSrcRef.current === src) return;

    const shouldAutoPlay = autoPlayNextRef.current || playing;
    currentSrcRef.current = src;
    loadingSrcRef.current = true; // Prevent playing effect from calling pause during load
    autoPlayNextRef.current = false;

    console.log('[VideoPlayer] Loading new src, shouldAutoPlay =', shouldAutoPlay);
    video.src = src;
    video.load();

    if (shouldAutoPlay) {
      const onCanPlay = () => {
        video.removeEventListener('canplay', onCanPlay);
        loadingSrcRef.current = false;
        console.log('[VideoPlayer] canplay fired, starting playback');
        video.muted = true; // Start muted to guarantee autoplay works
        video.play().then(() => {
          console.log('[VideoPlayer] Play started, unmuting');
          video.muted = false;
        }).catch(e => {
          console.log('[VideoPlayer] Play failed even muted:', e.message);
          loadingSrcRef.current = false;
        });
      };
      video.addEventListener('canplay', onCanPlay);
      return () => { video.removeEventListener('canplay', onCanPlay); };
    } else {
      loadingSrcRef.current = false;
    }
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle external play/pause control (user clicking play/pause button)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentSrcRef.current || loadingSrcRef.current) return;

    if (playing && video.paused) {
      video.play().catch(e => {
        video.muted = true;
        video.play().catch(() => {});
      });
    } else if (!playing && !video.paused) {
      video.pause();
    }
  }, [playing]);

  // Handle seek
  useEffect(() => {
    const video = videoRef.current;
    if (video && seekTo !== null && seekTo !== undefined) {
      if (Math.abs(video.currentTime - seekTo) > 0.1) {
        video.currentTime = seekTo;
      }
    }
  }, [seekTo]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && onTimeUpdateRef.current) {
      onTimeUpdateRef.current(video.currentTime);
    }
  }, []);

  const handleDurationChange = useCallback(() => {
    const video = videoRef.current;
    if (video && onDurationChangeRef.current) {
      onDurationChangeRef.current(video.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    console.log('[VideoPlayer] Video ended - setting autoPlayNext');
    autoPlayNextRef.current = true; // This guarantees the next src will auto-play
    loadingSrcRef.current = true; // Suppress any pause effects during transition
    if (onEndedRef.current) onEndedRef.current();
  }, []);

  const handlePlay = useCallback(() => {
    if (onPlayRef.current) onPlayRef.current();
  }, []);

  const handlePause = useCallback(() => {
    // Suppress pause during src transitions (ended → next video loading)
    if (loadingSrcRef.current) {
      console.log('[VideoPlayer] Suppressing pause during src transition');
      return;
    }
    if (onPauseRef.current) onPauseRef.current();
  }, []);

  return (
    <div style={{ width: '100%', position: 'relative', paddingTop: '56.25%' }}>
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: '#000',
        }}
        playsInline
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
      />
    </div>
  );
};

export default VideoPlayer;
