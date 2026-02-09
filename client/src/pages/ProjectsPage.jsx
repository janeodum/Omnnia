// src/pages/ProjectsPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Film, Calendar, ChevronRight, Loader, Trash2, Search,
  Plus, ArrowLeft, FolderOpen, Sparkles,
} from 'lucide-react';
import { collection, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import UserMenu from '../UserMenu';
import './ProjectsPage.css';

const ProjectsPage = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const fetchProjects = async () => {
      try {
        const q = query(
          collection(db, 'projects'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const projectList = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: docSnap.data().createdAt?.toDate?.() || new Date(),
        }));
        setProjects(projectList);
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user, navigate]);

  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this project? This cannot be undone.')) return;

    setDeletingId(projectId);
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Failed to delete project.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectProject = (project) => {
    // Navigate to app with project ID as query param
    navigate(`/?project=${project.id}`);
  };

  const handleNewStory = () => {
    navigate('/');
  };

  const filteredProjects = projects.filter((project) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      project.name?.toLowerCase().includes(q) ||
      project.storyHighlights?.toLowerCase().includes(q)
    );
  });

  const formatDate = (date) => {
    if (!date) return 'Unknown date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(date);
  };

  const getProjectThumbnail = (project) => {
    if (project.generatedImages?.length > 0) {
      return project.generatedImages[0].imageUrl || project.generatedImages[0].image || null;
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

  return (
    <div className="projects-page">
      {/* Header */}
      <header className="projects-header">
        <div className="header-left">
          <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            <span>Back to Editor</span>
          </button>
        </div>
        
        <div className="header-center">
          <h1>
            <FolderOpen size={24} />
            My Projects
          </h1>
        </div>
        
        <div className="header-right">
          <button className="new-project-btn" onClick={handleNewStory}>
            <Plus size={18} />
            New Story
          </button>
          {user && <UserMenu user={user} />}
        </div>
      </header>

      {/* Main Content */}
      <main className="projects-main">
        {/* Search Bar */}
        <div className="projects-toolbar">
          <div className="search-container">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="project-count">
            {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="projects-loading">
            <Loader className="spinning" size={32} />
            <p>Loading your projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="projects-empty">
            <div className="empty-icon">
              <Film size={64} />
            </div>
            <h2>No projects yet</h2>
            <p>Create your first love story video to see it here!</p>
            <button className="create-first-btn" onClick={handleNewStory}>
              <Sparkles size={18} />
              Create Your First Story
            </button>
          </div>
        ) : (
          <div className="projects-grid">
            {filteredProjects.map((project) => {
              const thumbnail = getProjectThumbnail(project);
              const status = getProjectStatus(project);

              return (
                <div
                  key={project.id}
                  className="project-card"
                  onClick={() => handleSelectProject(project)}
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
                      className="project-status"
                      style={{ backgroundColor: status.color }}
                    >
                      {status.label}
                    </div>
                  </div>

                  <div className="project-info">
                    <h3>{project.name || 'Untitled Project'}</h3>
                    
                    <div className="project-meta">
                      <span className="meta-item">
                        <Calendar size={14} />
                        {formatDate(project.createdAt)}
                      </span>
                      <span className="meta-item">
                        <Film size={14} />
                        {project.generatedImages?.length || 0} scenes
                      </span>
                    </div>

                    {project.storyHighlights && (
                      <p className="project-preview">
                        {project.storyHighlights.substring(0, 100)}...
                      </p>
                    )}
                  </div>

                  <div className="project-actions">
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      disabled={deletingId === project.id}
                      title="Delete project"
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
      </main>
    </div>
  );
};

export default ProjectsPage;