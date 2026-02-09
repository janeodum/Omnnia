// src/components/ProjectHistoryModal.jsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  Film, 
  Calendar, 
  ChevronRight,
  Loader,
  Trash2,
  Search
} from 'lucide-react';
import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import ProjectDetailView from './ProjectDetailView';
import './ProjectHistoryModal.css';

const ProjectHistoryModal = ({ user, onClose, onSelectProject }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!user) return;
    
    const fetchProjects = async () => {
      try {
        const q = query(
          collection(db, 'projects'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const projectList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date()
        }));
        
        setProjects(projectList);
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user]);

  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    
    if (!window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      return;
    }

    setDeletingId(projectId);
    
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredProjects = projects.filter(project => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      project.name?.toLowerCase().includes(query) ||
      project.storyHighlights?.toLowerCase().includes(query)
    );
  });

  const formatDate = (date) => {
    if (!date) return 'Unknown date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const getProjectThumbnail = (project) => {
    // Try to get first generated image as thumbnail
    if (project.generatedImages?.length > 0) {
      const firstImage = project.generatedImages[0];
      return firstImage.imageUrl || firstImage.image || null;
    }
    return null;
  };

  const getProjectStatus = (project) => {
    if (project.combinedVideoUrl) return { label: 'Complete', color: '#10b981' };
    if (project.videos?.length > 0) return { label: 'Videos Ready', color: '#3b82f6' };
    if (project.generatedImages?.length > 0) return { label: 'Images Ready', color: '#f59e0b' };
    if (project.storyboard?.length > 0) return { label: 'Storyboard Ready', color: '#8b5cf6' };
    return { label: 'Draft', color: '#6b7280' };
  };

  // If a project is selected, show the detail view
  if (selectedProject) {
    return (
      <ProjectDetailView
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
        onClose={onClose}
        user={user}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="history-modal" onClick={e => e.stopPropagation()}>
        <div className="history-header">
          <div className="history-title">
            <Film size={24} />
            <h2>Your Projects</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="history-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="history-content">
          {loading ? (
            <div className="history-loading">
              <Loader className="spinning" size={32} />
              <p>Loading your projects...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="history-empty">
              <Film size={48} />
              <h3>No projects yet</h3>
              <p>Create your first love story to see it here!</p>
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map(project => {
                const thumbnail = getProjectThumbnail(project);
                const status = getProjectStatus(project);
                
                return (
                  <div 
                    key={project.id} 
                    className="project-card"
                    onClick={() => setSelectedProject(project)}
                  >
                    <div className="project-thumbnail">
                      {thumbnail ? (
                        <img src={thumbnail} alt={project.name} />
                      ) : (
                        <div className="thumbnail-placeholder">
                          <Film size={32} />
                        </div>
                      )}
                      <div 
                        className="project-status-badge"
                        style={{ backgroundColor: status.color }}
                      >
                        {status.label}
                      </div>
                    </div>
                    
                    <div className="project-info">
                      <h3 className="project-name">{project.name || 'Untitled Project'}</h3>
                      <div className="project-meta">
                        <span className="project-date">
                          <Calendar size={14} />
                          {formatDate(project.createdAt)}
                        </span>
                        <span className="project-scenes">
                          {project.generatedImages?.length || 0} scenes
                        </span>
                      </div>
                      {project.storyHighlights && (
                        <p className="project-preview">
                          {project.storyHighlights.substring(0, 80)}...
                        </p>
                      )}
                    </div>

                    <div className="project-actions">
                      <button 
                        className="delete-btn"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        disabled={deletingId === project.id}
                      >
                        {deletingId === project.id ? (
                          <Loader className="spinning" size={16} />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                      <ChevronRight size={20} className="chevron" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectHistoryModal;