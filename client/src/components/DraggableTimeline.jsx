import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableItem = ({ id, children, isActive }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`editor-timeline-item ${isActive ? 'active' : ''}`}
    >
      {children}
    </div>
  );
};

const DraggableTimeline = ({ videos, selectedIndex, onSelect, onReorder }) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = videos.findIndex(v => v.index === active.id);
      const newIndex = videos.findIndex(v => v.index === over.id);

      const newVideos = arrayMove(videos, oldIndex, newIndex);
      onReorder(newVideos);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={videos.map(v => v.index)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="editor-timeline-track">
          {videos.map((video, idx) => (
            <SortableItem
              key={video.index}
              id={video.index}
              isActive={idx === selectedIndex}
            >
              <div
                className="editor-timeline-thumb"
                onClick={() => onSelect(idx)}
              >
                <video
                  src={video.url}
                  preload="metadata"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    pointerEvents: 'none',
                  }}
                />
                <div className="editor-timeline-overlay">
                  <span>{video.title || `Scene ${video.index + 1}`}</span>
                </div>
              </div>
              <div className="editor-timeline-label">
                Scene {video.index + 1}
              </div>
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default DraggableTimeline;
