import React, { useRef, useEffect, useState } from 'react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay
} from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Lock } from 'lucide-react';

// Ruler Component
const TimeRuler = ({ duration, zoom, scrollLeft }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#666';
        ctx.font = '10px Inter';

        // Draw ticks
        // zoom = pixels per second
        // tick every 1 second if zoom > 50, else every 5s
        const secondsStep = zoom > 50 ? 1 : 5;
        const tickSpacing = secondsStep * zoom;

        const startSec = Math.floor(scrollLeft / tickSpacing) * secondsStep;
        const endSec = startSec + (width / zoom) + secondsStep;

        for (let s = startSec; s <= endSec; s += secondsStep) {
            const x = (s * zoom) - scrollLeft;
            if (x < 0) continue;

            // Major tick
            ctx.fillRect(x, height - 10, 1, 10);
            ctx.fillText(formatTime(s), x + 4, height - 12);

            // Minor ticks
            if (zoom > 20) {
                for (let m = 1; m < 5; m++) {
                    const mx = x + (m * (tickSpacing / 5));
                    ctx.fillRect(mx, height - 5, 1, 5);
                }
            }
        }

    }, [duration, zoom, scrollLeft]);

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <canvas
            ref={canvasRef}
            width={2000} // Fixed large width or dynamic
            height={30}
            className="timeline-ruler"
        />
    );
};

// Sortable Clip
const SortableClip = ({ id, video, zoom, isSelected, onClick, startTime }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id,
        disabled: video.locked
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        width: video.duration ? video.duration * zoom : 100, // Fallback width
        opacity: isDragging ? 0.5 : 1,
        cursor: video.locked ? 'default' : 'grab'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...(video.locked ? {} : { ...attributes, ...listeners })}
            className={`timeline-clip ${isSelected ? 'selected' : ''} ${video.locked ? 'locked' : ''}`}
            onClick={(e) => {
                onClick(e);
            }}
            title={video.title}
        >
            <div className="clip-thumbnail-strip">
                {video.thumb ? (
                    <img src={video.thumb} className="clip-thumb-img" alt="" />
                ) : (
                    <video
                        src={video.url}
                        className="clip-thumb-img"
                        preload="metadata"
                        muted
                    />
                )}
            </div>
            <div className="clip-label">{video.title || `Scene ${video.index}`}</div>
            {!video.locked && <div className="clip-handle left" />}
            {!video.locked && <div className="clip-handle right" />}
            {video.locked && <div className="locked-badge"><Lock size={10} /> Locked</div>}
        </div>
    );
};

const AdvancedTimeline = ({
    videos,
    zoom = 50,
    currentTime,
    onSeek,
    selectedIndex,
    onSelect,
    onReorder,
    audioTrack
}) => {
    const scrollContainerRef = useRef(null);
    const [scrollLeft, setScrollLeft] = useState(0);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require drag of 8px to start dnd, allows clicks
            },
        })
    );

    const handleScroll = (e) => {
        setScrollLeft(e.target.scrollLeft);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over) return;

        if (active.id !== over.id) {
            const oldIndex = videos.findIndex(v => v.index === active.id);
            const newIndex = videos.findIndex(v => v.index === over.id);

            // Prevent moving anything to index 0 if index 0 is locked
            if (newIndex === 0 && videos[0].locked) {
                console.log('Cannot move items before locked intro');
                return;
            }

            if (onReorder) {
                // Note: onReorder should handle the logic of reordering the array
                onReorder(oldIndex, newIndex);
            }
        }
    };

    // Playhead click/drag on ruler area logic could go here
    const handleRulerClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x + scrollLeft) / zoom;
        onSeek(time);
    };

    // Calculate total width
    // Assume generic 5s duration if missing for now
    const totalDuration = videos.reduce((acc, v) => acc + (v.duration || 5), 0);
    const totalWidth = totalDuration * zoom;

    return (
        <div className="advanced-timeline">
            <div className="ruler-container" onClick={handleRulerClick}>
                <TimeRuler duration={totalDuration} zoom={zoom} scrollLeft={scrollLeft} />

                {/* Playhead */}
                <div
                    className="timeline-playhead"
                    style={{ left: (currentTime * zoom) - scrollLeft }}
                >
                    <div className="playhead-marker" />
                    <div className="playhead-line" />
                </div>
            </div>

            <div
                className="timeline-tracks-container"
                ref={scrollContainerRef}
                onScroll={handleScroll}
            >
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={videos.map(v => v.index)}
                        strategy={horizontalListSortingStrategy}
                    >
                        <div className="timeline-track-items" style={{ width: Math.max(totalWidth, '100%') }}>
                            {videos.map((video, idx) => (
                                <SortableClip
                                    key={video.index}
                                    id={video.index}
                                    video={{ ...video, duration: video.duration || 5 }} // Ensure duration
                                    zoom={zoom}
                                    isSelected={idx === selectedIndex}
                                    onClick={() => onSelect(idx)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {/* Audio Track */}
                {audioTrack && (
                    <div className="timeline-audio-track" style={{ width: Math.max(totalWidth, '100%') }}>
                        <div
                            className="audio-clip"
                            style={{
                                width: Math.max(0, totalWidth - ((audioTrack.offset || 0) * zoom)),
                                left: (audioTrack.offset || 0) * zoom
                            }}
                        >
                            <div className="audio-clip-label">
                                <span className="audio-icon">🎵</span>
                                {audioTrack.name || 'Background Music'}
                            </div>
                            <div className="audio-waveform-visual">
                                {/* SVG Pattern for fake waveform */}
                                <svg width="100%" height="100%" preserveAspectRatio="none">
                                    <pattern id="waveform" x="0" y="0" width="10" height="100%" patternUnits="userSpaceOnUse">
                                        <line x1="2" y1="50%" x2="2" y2="20%" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                                        <line x1="5" y1="50%" x2="5" y2="80%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                                        <line x1="8" y1="50%" x2="8" y2="40%" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                                    </pattern>
                                    <rect x="0" y="0" width="100%" height="100%" fill="url(#waveform)" />
                                </svg>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdvancedTimeline;
