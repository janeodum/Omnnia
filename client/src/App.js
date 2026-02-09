// src/App.js
import React, { useState, useRef, useMemo, useEffect } from 'react';
import UserMenu from './UserMenu';
import { deductCredits, hasEnoughCredits, getCredits } from './services/creditsService';

import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

// ... (existing imports)
import { onAuthStateChanged, signOut } from "firebase/auth";
import LandingPage from './LandingPage';
import VoicePreviewCard from './components/VoicePreviewCard';
import './components/VoicePreviewCard.css';
import VoiceRecorder from './components/VoiceRecorder';
import PhotoUploader from './components/PhotoUploader';
import ProjectHistoryModal from './components/ProjectHistoryModal';
import UpgradeModal from './components/UpgradeModal';
import GenerationEstimate from './components/GenerationEstimate';
import ProjectsPage from './pages/ProjectsPage';
import useUserProfile from './hooks/useUserProfile';
import SettingsPage from './components/SettingsPage';
import './components/SettingsPage.css';
import { generateVoicePreview } from './api/voiceApi';
import useUserCredits, { CREDIT_COSTS } from './hooks/useUserCredits';

import VideoPlayer from './components/VideoPlayer';
import AdvancedTimeline from './components/AdvancedTimeline';
import TimelineControls from './components/TimelineControls';
import DraggableTimeline from './components/DraggableTimeline'; // Keep for now as backup or reference
// import ffmpeg from 'fluent-ffmpeg';
// import ffmpegPath from 'ffmpeg-static';
import {
  Heart,
  Sparkles,
  Clock,
  Calendar,
  MapPin,
  Music,
  Film,
  Sliders,
  Lock,
  Unlock,
  Zap,
  Loader,
  ChevronDown,
  Play,
  History,
  Edit2,
  RefreshCw,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Search,
  Filter,
  Mic,
  Square,
  AlertCircle,
  SkipBack,
  SkipForward,
  Pause,
  Download,
  Scissors,
  Crop,
  Gauge,
  Layers,
  MicOff,
  Volume2,
  Eraser,
  RotateCw,
  FlipHorizontal,
  Sun,
  Circle,
  Type,
  MessageSquare,
  TrendingUp,
  Activity,
  Check, // Add missing Check icon
} from 'lucide-react';
import './App.css';
import './landing.css';

import {
  cloneVoice,
  createComfyVideosFromScenes,
  checkVideoJobStatus,
  createVeoVideosFromScenes,
  checkVeoJobStatus,
  combineVideos,
  saveProjectImages,
  saveProjectVideos,
  saveProjectCombinedVideo,
  uploadPhotos,
  addNarrationToVideos,
  createStoryboard,
  generateScenes,
  generateMusic, // Add missing
  generateAllMusic, // Add missing
  generateScenesAsync, // Add missing
  checkImageJobStatus, // Add missing
  generateNarrationScripts, // Ensure present
  generateNarrationAudio, // Ensure present
} from './api/omniaApi';
import { uploadImagesToR2, uploadVideosToR2 } from './api/r2Api';
import { auth, db } from './firebaseConfig';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy
} from "firebase/firestore";
// ffmpeg.setFfmpegPath(ffmpegPath);

const INTRO_VIDEO_CLIP = {
  index: 'intro_locked_0',
  title: 'Omnia Intro',
  url: '/video/intro_special.mov',
  thumb: '/video/intro_special.mov',
  duration: 6, // Approx duration of the loader/intro
  locked: true
};

const ANIMATION_STYLES = [
  {
    id: 'pixar-3d',
    name: 'Pixar 3D',
    thumbnail:
      'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=600&h=400&fit=crop',
    description:
      'Cinematic 3D animation with expressive characters and warm lighting',
    model: 'flux1-dev-bnb-nf4v2.safetensors',
    sampler: 'DPM++ 2M',
    cfg: 1.5,
    steps: 20,
    prompt:
      'pixar style, 3d animation, expressive characters, cinematic lighting, high quality, professional rendering',
  },
  {
    id: 'disney-classic',
    name: 'Disney 2D',
    thumbnail:
      'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&h=400&fit=crop',
    description:
      'Classic hand-drawn Disney animation with fairy tale romance aesthetics',
    model: 'revAnimated_v1.2.2.safetensors',
    sampler: 'Euler a',
    cfg: 8.0,
    steps: 25,
    prompt:
      'disney style, 2d animation, hand drawn, fairy tale, romantic, classic animation, storybook',
  },
  {
    id: 'modern-3d',
    name: 'Modern 3D',
    thumbnail:
      'https://images.unsplash.com/photo-1533167649158-6d508895b680?w=600&h=400&fit=crop',
    description:
      'Contemporary 3D style with realistic lighting and cinematic camera work',
    model: 'p33x_B.safetensors',
    sampler: 'DPM++ 2M Karras',
    cfg: 7.0,
    steps: 30,
    prompt:
      'modern 3d render, realistic lighting, cinematic, high quality, detailed textures, photorealistic',
  },
];

const STORY_TEMPLATES = [
  { id: 'short', name: 'Quick & Sweet', icon: Clock, duration: '1–2 min', avgDurationSec: 60 },   // 4-6 scenes
  { id: 'classic', name: 'Classic Romance', icon: Heart, duration: '2–3 min', avgDurationSec: 120 },  // 8-10 scenes
  { id: 'comedic', name: 'Fun & Lighthearted', icon: Sparkles, duration: '1–2 min', avgDurationSec: 90 },   // 6-8 scenes
  { id: 'epic', name: 'Epic Love Story', icon: Film, duration: '2–3 min', avgDurationSec: 150 },  // 10 scenes (capped)
];

const FILTER_OPTIONS = [
  { id: 'all', label: 'All Scenes' },
  { id: 'location', label: 'By Location' },
  { id: 'mood', label: 'By Mood' },
  { id: 'time', label: 'By Time of Day' },
];

const normalizeMediaUrl = (u) => {
  if (!u) return u;
  // If the page is https, force https for known hosts
  if (window.location.protocol === "https:" && u.startsWith("http://")) {
    return u.replace("http://", "https://");
  }
  return u;
};

const DuckLoader = () => (
  <div className="duck-loader-container">
    <div className="duck-wrapper">
      <div className="duck-head">
        <div className="duck-eye"></div>
        <div className="duck-beak"></div>
      </div>
      <div className="duck-body"></div>
    </div>

    {/* Animated Water Layers */}
    <div className="water-wave-1"></div>
    <div className="water-surface"></div>

    <div className="loader-text">
      Rendering your masterpiece... <br />
      <span style={{ fontSize: '0.85em', fontWeight: 'normal', opacity: 0.8 }}>
        (This usually takes about 2-3 minutes)
      </span>
    </div>
  </div>
);

// Helper function to remove undefined values from an object (Firestore doesn't accept undefined)
const removeUndefined = (obj) => {
  if (obj === null || obj === undefined) return null;

  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)).filter(item => item !== undefined);
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        if (value !== null && typeof value === 'object') {
          cleaned[key] = removeUndefined(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  return obj;
};

function App() {
  // 1. User State
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryProjectId = searchParams.get('project');

  // 2. Projects State (Starts empty, fills from DB)
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [sceneDurationSeconds, setSceneDurationSeconds] = useState(5); // default 5s to speed up generation

  const {
    credits,
    loading: creditsLoading,
    hasEnoughCredits,
    deductCredits: localDeductCredits,
    calculateCost
  } = useUserCredits(user);

  // 3. Listen for User Login
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setLoading(false);

    });
    return () => unsub();
  }, []);



  // Helper to reset form data
  const resetFormData = () => {
    setFormData({
      partner1Name: '',
      partner2Name: '',
      partner1Gender: 'female',
      partner2Gender: 'male',
      partner1Race: '',
      partner2Race: '',
      partner1Ethnicity: '',
      partner2Ethnicity: '',
      partner1Height: '',
      partner2Height: '',
      partner1AgeWhenMet: '',
      partner2AgeWhenMet: '',
      partner1CurrentAge: '',
      partner2CurrentAge: '',
      meetingDate: '',
      meetingPlace: '',
      meetingGeography: '',
      storyHighlights: '',
      specialMoments: '',
      weddingDate: '',
      voiceNarration: 'music-only',
      musicPreference: 'Romantic Piano',
      width: 1024,
      height: 576,
      customPrompt: '',
      negativePrompt: 'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, multiple people in background, crowd, group photo',
      aspectRatio: '16:9',
      duration: '5s',
    });
    setStep(1);
    setStoryboard([]);
    setGeneratedImages([]);
    setVideoResult(null);
    setImagesApproved(false);
    setCombinedVideoUrl(null);
    setTempProjectName('Untitled');
  };

  // Sync currentProjectId with URL
  useEffect(() => {
    // If we are loading/not logged in yet, we can't reliably sync yet, 
    // but queryProjectId is derived from URL so it's fine.

    if (queryProjectId) {
      if (currentProjectId !== queryProjectId) {
        console.log('🔗 URL Changed: Switching to project', queryProjectId);
        setCurrentProjectId(queryProjectId);
      }
    } else {
      // No project in URL -> New Project Mode
      // Only switch if we currently HAVE a project selected
      if (currentProjectId !== null) {
        console.log('🆕 URL Cleared: "New Project" mode activated. Clearing form.');
        setCurrentProjectId(null);
        resetFormData();
      }
    }
  }, [queryProjectId]);

  // 4. Listen for Database Changes (Real-time)
  useEffect(() => {
    if (!user) return;

    // Query: Get projects created by THIS user, ordered by date
    const q = query(
      collection(db, "projects"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    // onSnapshot automatically updates 'projects' whenever the DB changes
    const unsubscribeDb = onSnapshot(q, (snapshot) => {
      const fetchedProjects = snapshot.docs.map(doc => ({
        id: doc.id, // Firestore String ID
        ...doc.data()
      }));

      setProjects(fetchedProjects);

      // AUTO-SELECT LOGIC REMOVED
      // We rely on the URL useEffect above to set the project.
    });


    return () => unsubscribeDb();
  }, [user]);



  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedStyle, setSelectedStyle] = useState('pixar-3d');
  const [storyTemplate, setStoryTemplate] = useState('classic');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, sdProgress: 0, eta: 0 });
  const [error, setError] = useState(null);
  const [storyboard, setStoryboard] = useState([]);
  const [storyboardLoading, setStoryboardLoading] = useState(false);
  const [storyboardError, setStoryboardError] = useState(null);
  const [uploadedPhotos, setUploadedPhotos] = useState({
    partner1: [],
    partner2: [],
  });
  const [uploadingCategory, setUploadingCategory] = useState(null);
  const [availableModels] = useState(['Omnnia Storyteller', 'Veo (Google AI)']);
  const [selectedModel, setSelectedModel] = useState('Veo (Google AI)');
  const [videoResult, setVideoResult] = useState(null);
  const [comfyQueued, setComfyQueued] = useState(false);
  const [regeneratingScene, setRegeneratingScene] = useState(null);
  const [imagesApproved, setImagesApproved] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingScenePrompt, setEditingScenePrompt] = useState(null);
  const [tempScenePrompt, setTempScenePrompt] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [tempProjectName, setTempProjectName] = useState('Untitled');
  const [sceneSearchQuery, setSceneSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [emailNotificationEnabled, setEmailNotificationEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [savingStory, setSavingStory] = useState(false);
  const recognitionRef = useRef(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  // Editor State
  const [editorSelectedScene, setEditorSelectedScene] = useState(0);
  const [editorCurrentTime, setEditorCurrentTime] = useState(0);
  const [editorDuration, setEditorDuration] = useState(0);
  const [editorTab, setEditorTab] = useState('video'); // 'video' or 'audio'
  const [timelineZoom, setTimelineZoom] = useState(1); // pixels per second - reduced default to fit more
  const [seekTarget, setSeekTarget] = useState(null); // Triggers video seek
  const [editorPlaying, setEditorPlaying] = useState(false);
  const [combining, setCombining] = useState(false);
  const [combinedVideoUrl, setCombinedVideoUrl] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeEditorTool, setActiveEditorTool] = useState('speed'); // 'speed', 'trim', etc.
  const editorVideoRef = useRef(null);
  const [reorderedVideos, setReorderedVideos] = useState(null); // For drag-and-drop reordering
  const [testMode, setTestMode] = useState(false); // Toggle for using local test videos
  const [customVoiceId, setCustomVoiceId] = useState(null);
  const [narrationStatus, setNarrationStatus] = useState(null);
  const [selectedMusicStyle, setSelectedMusicStyle] = useState(null);
  const [generatedMusicUrl, setGeneratedMusicUrl] = useState(null);
  const [generatedMusicTracks, setGeneratedMusicTracks] = useState([]); // Array of pre-generated tracks
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.5); // 0-1 range for music volume
  const [currentPage, setCurrentPage] = useState('main'); // 'main' or 'settings'
  const [settingsSection, setSettingsSection] = useState('profile');
  const navigate = useNavigate();
  const [userCredits, setUserCredits] = useState(0);

  /* Editor Timeline Handlers */
  const musicAudioRef = useRef(null);

  /* Video Model derived from selectedModel */
  const videoModel = selectedModel === 'Veo (Google AI)' ? 'veo' : 'omnia';

  const musicStyles = [
    { key: 'romantic_piano', name: 'Romantic Piano' },
    { key: 'romantic_orchestra', name: 'Romantic Orchestra' },
    { key: 'romantic_acoustic', name: 'Soft Acoustic' },
    { key: 'romantic_jazz', name: 'Romantic Jazz' },
    { key: 'upbeat_happy', name: 'Upbeat Happy' },
    { key: 'cinematic_emotional', name: 'Cinematic' },
    { key: 'nostalgic_memories', name: 'Nostalgic' },
    { key: 'modern_love', name: 'Modern Love' },
  ];

  // Determine intro offset
  // Use reorderedVideos if available, otherwise compute from videoResult
  const currentTimelineVideos = reorderedVideos || (
    videoResult?.videos
      ? [INTRO_VIDEO_CLIP, ...(videoResult.videos.filter(v => v.success))]
      : []
  );

  const introVideo = currentTimelineVideos.find(v => v.locked);
  const introDuration = introVideo ? (introVideo.duration || 5) : 0;

  // Sync music volume
  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  // Sync music playback with video editor
  // We need to calculate GLOBAL time, because editorCurrentTime is per-clip
  const getGlobalTime = () => {
    let globalTime = 0;
    for (let i = 0; i < editorSelectedScene; i++) {
      globalTime += (currentTimelineVideos[i]?.duration || 5);
    }
    return globalTime + editorCurrentTime;
  };

  useEffect(() => {
    if (!musicAudioRef.current || !generatedMusicUrl) return;

    if (editorPlaying) {
      const globalTime = getGlobalTime();
      if (globalTime >= introDuration) {
        musicAudioRef.current.play().catch(e => console.log("Audio play error:", e));
      } else {
        // Pause and reset if we are in the intro region
        musicAudioRef.current.pause();
        musicAudioRef.current.currentTime = 0;
      }
    } else {
      musicAudioRef.current.pause();
    }
  }, [editorPlaying, editorCurrentTime, generatedMusicUrl, introDuration, editorSelectedScene]);

  // Sync music seeking
  useEffect(() => {
    if (!musicAudioRef.current || !generatedMusicUrl) return;

    // Calculate target music time (subtract intro duration)
    const globalTime = getGlobalTime();
    const targetMusicTime = Math.max(0, globalTime - introDuration);

    // Only seek if difference is significant to avoid stutter
    if (Math.abs(musicAudioRef.current.currentTime - targetMusicTime) > 0.5) {
      musicAudioRef.current.currentTime = targetMusicTime;
    }
  }, [editorCurrentTime, generatedMusicUrl, introDuration, editorSelectedScene]);

  const handleEditorTimeUpdate = (time) => {
    setEditorCurrentTime(time);
  };

  const handleEditorDurationChange = (duration) => {
    setEditorDuration(duration);
  };

  const handleEditorPlayPause = () => {
    setEditorPlaying(!editorPlaying);
  };

  const handleEditorSeek = (time) => {
    setEditorCurrentTime(time);
    setSeekTarget(time);
    if (musicAudioRef.current) {
      // Calculate global time for seek
      let pastDuration = 0;
      for (let i = 0; i < editorSelectedScene; i++) {
        pastDuration += (currentTimelineVideos[i]?.duration || 5);
      }
      const globalTime = pastDuration + time;
      const targetMusicTime = Math.max(0, globalTime - introDuration);
      musicAudioRef.current.currentTime = targetMusicTime;
    }
  };

  const handleTimelineFit = () => {
    // Approx width of timeline container is ~960px minus padding (~930px)
    // We want totalDuration * zoom = 930
    // So zoom = 930 / totalDuration
    if (editorDuration > 0) {
      const fitZoom = 930 / editorDuration;
      setTimelineZoom(Math.max(1, fitZoom)); // Ensure at least 1px/sec
    }
  };

  const handleTimelineZoomChange = (newZoom) => {
    setTimelineZoom(newZoom);
  };

  const [clonedVoicePreview, setClonedVoicePreview] = useState(null);
  const {
    profile,
    loading: profileLoading,
    voiceClones,
    activeVoiceId,
    activeVoice,
    saveVoiceClone,
    setActiveVoice,
    deleteVoiceClone,
    preferences,
    updatePreferences,
  } = useUserProfile(user);

  useEffect(() => {
    if (activeVoiceId && !customVoiceId) {
      setCustomVoiceId(activeVoiceId);
    }
  }, [activeVoiceId]);
  const [formData, setFormData] = useState({
    partner1Name: '',
    partner2Name: '',
    partner1Gender: 'female',
    partner2Gender: 'male',
    partner1Race: '',
    partner2Race: '',
    partner1Ethnicity: '',
    partner2Ethnicity: '',
    partner1Height: '',
    partner2Height: '',
    partner1AgeWhenMet: '',
    partner2AgeWhenMet: '',
    partner1CurrentAge: '',
    partner2CurrentAge: '',
    meetingDate: '',
    meetingPlace: '',
    meetingGeography: '',
    storyHighlights: '',
    specialMoments: '',
    weddingDate: '',
    voiceNarration: 'music-only',  // default: just music
    musicPreference: 'Romantic Piano',
    width: 1024,
    height: 576,
    customPrompt: '',
    negativePrompt:
      'blurry, low quality, distorted, ugly, bad anatomy, watermark, text, multiple people in background, crowd, group photo',
    aspectRatio: '16:9',
    duration: '5s',
  });

  const updateFormData = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (
      [
        'storyHighlights',
        'partner1Name',
        'partner2Name',
        'meetingPlace',
        'specialMoments',
        'partner1Race',
        'partner2Race',
        'partner1Height',
        'partner2Height',
        'partner1AgeWhenMet',
        'partner2AgeWhenMet',
        'partner1CurrentAge',
        'partner2CurrentAge',
        'meetingGeography',
      ].includes(field)
    ) {
      setStoryboard([]);
      setGeneratedImages([]);
      setVideoResult(null);
      setStoryboardError(null);
      setImagesApproved(false);
    }
  };

  const currentStyle = ANIMATION_STYLES.find((s) => s.id === selectedStyle);
  const selectedTemplate = STORY_TEMPLATES.find((t) => t.id === storyTemplate);
  const currentProject = projects.find(p => p.id === currentProjectId);

  const estimatedSceneCount = useMemo(() => {
    // once storyboard exists, it’s the source of truth
    if (storyboard.length > 0) return storyboard.length;
    if (!selectedTemplate) return 0;

    const avgTotal = selectedTemplate.avgDurationSec || 0;
    if (!avgTotal || !sceneDurationSeconds) {
      return selectedTemplate.scenes || 0; // fallback to old hardcoded value if needed
    }

    return Math.max(1, Math.round(avgTotal / sceneDurationSeconds));
  }, [storyboard.length, selectedTemplate, sceneDurationSeconds]);

  // ==================== LOAD PROJECT STATE ====================

  /**
   * Restore complete project state when switching projects
   */
  useEffect(() => {
    if (!currentProject) return;

    console.log('📂 Loading project:', currentProject.id, currentProject.name);

    // Restore ALL form data
    setFormData(prev => ({
      ...prev,
      partner1Name: currentProject.partner1Name || '',
      partner2Name: currentProject.partner2Name || '',
      partner1Gender: currentProject.partner1Gender || 'female',
      partner2Gender: currentProject.partner2Gender || 'male',
      partner1Race: currentProject.partner1Race || '',
      partner2Race: currentProject.partner2Race || '',
      partner1Ethnicity: currentProject.partner1Ethnicity || '',
      partner2Ethnicity: currentProject.partner2Ethnicity || '',
      partner1Height: currentProject.partner1Height || '',
      partner2Height: currentProject.partner2Height || '',
      partner1AgeWhenMet: currentProject.partner1AgeWhenMet || '',
      partner2AgeWhenMet: currentProject.partner2AgeWhenMet || '',
      partner1CurrentAge: currentProject.partner1CurrentAge || '',
      partner2CurrentAge: currentProject.partner2CurrentAge || '',
      storyHighlights: currentProject.storyHighlights || '',
      specialMoments: currentProject.specialMoments || '',
      meetingPlace: currentProject.meetingPlace || '',
      meetingGeography: currentProject.meetingGeography || '',
      meetingDate: currentProject.meetingDate || '',
      weddingDate: currentProject.weddingDate || '',
      voiceNarration: currentProject.voiceNarration || 'music-only',
      musicPreference: currentProject.musicPreference || 'Romantic Piano',
      width: currentProject.width || 1024,
      height: currentProject.height || 576,
      aspectRatio: currentProject.aspectRatio || '16:9',
      duration: currentProject.duration || '6s',
      customPrompt: currentProject.customPrompt || '',
      negativePrompt: currentProject.negativePrompt || prev.negativePrompt,
    }));

    // Restore generation settings
    if (currentProject.selectedStyle) setSelectedStyle(currentProject.selectedStyle);
    if (currentProject.storyTemplate) setStoryTemplate(currentProject.storyTemplate);
    if (currentProject.sceneDurationSeconds) setSceneDurationSeconds(currentProject.sceneDurationSeconds);
    if (currentProject.customVoiceId) setCustomVoiceId(currentProject.customVoiceId);

    // Restore workflow state
    if (currentProject.currentStep) setStep(currentProject.currentStep);
    if (currentProject.imagesApproved !== undefined) setImagesApproved(currentProject.imagesApproved);

    // Restore generated content
    if (currentProject.storyboard) setStoryboard(currentProject.storyboard);
    if (currentProject.generatedImages) {
      // Normalize image property: Firebase saves as "imageUrl", but UI expects "image"
      const normalizedImages = currentProject.generatedImages.map(img => ({
        ...img,
        image: img.image || img.imageUrl,  // Ensure "image" property exists
        // Normalize frames array if present
        frames: img.frames ? img.frames.map(f => ({
          ...f,
          imageUrl: f.imageUrl || f.image,
        })) : null,
      }));
      setGeneratedImages(normalizedImages);
    }
    if (currentProject.videos && currentProject.videos.length > 0) {
      setVideoResult({
        videos: currentProject.videos,
        success: true,
        combinedUrl: currentProject.combinedVideoUrl || null
      });
    }

    // Restore uploaded photos
    if (currentProject.uploadedPhotos) {
      setUploadedPhotos({
        partner1: currentProject.uploadedPhotos.partner1 || [],
        partner2: currentProject.uploadedPhotos.partner2 || [],
      });
    }

    // Restore music state
    if (currentProject.generatedMusicUrl) {
      setGeneratedMusicUrl(currentProject.generatedMusicUrl);
    }
    if (currentProject.selectedMusicStyle) {
      setSelectedMusicStyle(currentProject.selectedMusicStyle);
    }

    // Update temp project name
    setTempProjectName(currentProject.name || 'Untitled');

    console.log('✅ Project loaded successfully');
  }, [currentProjectId, projects]); // Triggers when project changes

  useEffect(() => {
    const autoCreateProject = async () => {
      // Only run if:
      // - User is logged in
      // - Not still loading
      // - No projects exist
      // - No current project selected
      if (!user || loading || projects.length > 0 || currentProjectId) {
        return;
      }

      console.log('🆕 No projects found, creating default project...');

      try {
        const docRef = await addDoc(collection(db, "projects"), {
          name: "My Love Story",
          userId: user.uid,
          createdAt: serverTimestamp(),
          status: "draft"
        });

        setCurrentProjectId(docRef.id);
        console.log('✅ Auto-created project:', docRef.id);
      } catch (err) {
        console.error('❌ Failed to auto-create project:', err);
        // Don't show error to user - this is a convenience feature
      }
    };

    // Small delay to let onSnapshot populate projects first
    const timer = setTimeout(autoCreateProject, 1500);
    return () => clearTimeout(timer);
  }, [user, loading, projects.length, currentProjectId]);

  const handleCreateNewProject = async () => {
    if (!user) {
      alert("Please sign in to create a project");
      return null;
    }

    try {
      const docRef = await addDoc(collection(db, "projects"), {
        name: "Untitled Project",
        userId: user.uid,
        createdAt: serverTimestamp(),
        status: "draft"
      });
      setCurrentProjectId(docRef.id);
      return docRef.id;            // ⬅️ RETURN ID
    } catch (error) {
      console.error("Error creating project:", error);
      return null;
    }
  };

  const handleNavigate = (page, section = 'profile') => {
    if (page === 'settings') {
      setCurrentPage('settings');
      setSettingsSection(section);
    } else {
      setCurrentPage('main');
    }
  };

  // ==================== AUTO-SAVE FUNCTIONALITY ====================

  /**
   * Save story highlights and form data
   */
  const handleSaveStory = async () => {
    if (!formData.storyHighlights.trim()) {
      setError('Please tell your story before saving.');
      return;
    }

    if (!user) {
      setError('Please sign in to save your story.');
      return;
    }

    setError(null);
    setSavingStory(true);

    try {
      let projectId = currentProjectId;

      if (!projectId) {
        // If no project yet, create one silently
        const newId = await handleCreateNewProject();
        if (!newId) throw new Error('Could not create project for story.');
        projectId = newId;
        setCurrentProjectId(newId);
      }

      // Save complete state, not just story highlights
      await saveCompleteProjectState();

    } catch (err) {
      console.error('Error saving story:', err);
      setError('Failed to save your story. Please try again.');
    } finally {
      setSavingStory(false);
    }
  };

  /**
   * Generate background music using ElevenLabs
   */
  const handleGenerateMusic = async (styleKey) => {
    if (generatingMusic) return;

    setGeneratingMusic(true);
    setSelectedMusicStyle(styleKey);
    setGeneratedMusicUrl(null);

    try {
      // Calculate total video duration from actual timeline clips
      const baseVideos = videoResult?.videos?.filter(v => v.success) || [];
      const videos = reorderedVideos || [INTRO_VIDEO_CLIP, ...baseVideos];
      const durationMs = (videos.reduce((acc, v) => acc + (v.duration || 5), 0) || 15) * 1000;

      // Use omniaApi with proper API base URL
      const data = await generateMusic(styleKey, durationMs);

      if (data.success && data.musicUrl) {
        setGeneratedMusicUrl(data.musicUrl);
      } else {
        setError(data.error || 'Failed to generate music');
      }
    } catch (err) {
      console.error('Music generation error:', err);
      setError('Failed to generate music. Please try again.');
    } finally {
      setGeneratingMusic(false);
    }
  };

  /**
   * Auto-save when moving between steps
   */
  useEffect(() => {
    if (currentProjectId && user) {
      // Debounce auto-save
      const timer = setTimeout(() => {
        saveCompleteProjectState();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [step, selectedStyle, storyTemplate, sceneDurationSeconds]);
  // Filter and search scenes
  const filteredScenes = useMemo(() => {
    let scenes = generatedImages.length > 0 ? generatedImages : storyboard;

    // Apply search filter
    if (sceneSearchQuery.trim()) {
      const query = sceneSearchQuery.toLowerCase();
      scenes = scenes.filter(scene =>
        scene.title?.toLowerCase().includes(query) ||
        scene.description?.toLowerCase().includes(query) ||
        scene.location?.toLowerCase().includes(query) ||
        scene.mood?.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (activeFilter !== 'all' && scenes.length > 0) {
      scenes = scenes.filter(scene => {
        if (activeFilter === 'location' && scene.location) return true;
        if (activeFilter === 'mood' && scene.mood) return true;
        if (activeFilter === 'time' && (scene.timeOfDay || scene.time_of_day)) return true;
        return false;
      });
    }

    return scenes;
  }, [generatedImages, storyboard, sceneSearchQuery, activeFilter]);

  // Get unique filter values
  const uniqueLocations = useMemo(() => {
    const scenes = generatedImages.length > 0 ? generatedImages : storyboard;
    return [...new Set(scenes.map(s => s.location).filter(Boolean))];
  }, [generatedImages, storyboard]);

  const uniqueMoods = useMemo(() => {
    const scenes = generatedImages.length > 0 ? generatedImages : storyboard;
    return [...new Set(scenes.map(s => s.mood).filter(Boolean))];
  }, [generatedImages, storyboard]);

  const ensureStoryboard = async (desiredSceneCount) => {
    if (storyboard.length > 0) {
      return true;
    }

    if (!formData.storyHighlights) {
      setStoryboardError('Please share your love story so we can build scenes.');
      return false;
    }

    try {
      setStoryboardLoading(true);
      const response = await createStoryboard({
        partner1Name: formData.partner1Name,
        partner2Name: formData.partner2Name,
        partner1Gender: formData.partner1Gender,
        partner2Gender: formData.partner2Gender,
        partner1Race: formData.partner1Race,
        partner2Race: formData.partner2Race,
        partner1Ethnicity: formData.partner1Ethnicity,
        partner2Ethnicity: formData.partner2Ethnicity,
        partner1Height: formData.partner1Height,
        partner2Height: formData.partner2Height,

        partner1AgeWhenMet: formData.partner1AgeWhenMet
          ? Number(formData.partner1AgeWhenMet)
          : null,
        partner2AgeWhenMet: formData.partner2AgeWhenMet
          ? Number(formData.partner2AgeWhenMet)
          : null,
        partner1CurrentAge: formData.partner1CurrentAge
          ? Number(formData.partner1CurrentAge)
          : null,
        partner2CurrentAge: formData.partner2CurrentAge
          ? Number(formData.partner2CurrentAge)
          : null,

        storyTemplate,
        desiredSceneCount: desiredSceneCount || null, // 👈 NEW

        meetingPlace: formData.meetingPlace,
        meetingGeography: formData.meetingGeography,
        meetingDate: formData.meetingDate || null,
        storyHighlights: formData.storyHighlights,
        specialMoments: formData.specialMoments,
      });
      let scenes = response.scenes || [];

      setStoryboard(scenes);
      setStoryboardError(null);

      // Auto-save storyboard to project
      await saveCompleteProjectState({ storyboard: response.scenes || [] });

      return true;
    } catch (apiError) {
      const fallbackMessage = 'We could not create a storyboard. Please try again.';
      const detailedMessage =
        typeof apiError?.message === 'string' ? apiError.message.trim() : '';
      setStoryboardError(detailedMessage || fallbackMessage);
      return false;
    } finally {
      setStoryboardLoading(false);
    }
  };

  const handlePhotoUpload = async (category, files) => {
    try {
      setUploadingCategory(category);
      const response = await uploadPhotos({ [category]: files });
      setUploadedPhotos((prev) => {
        const next = { ...prev };
        Object.entries(response.uploaded).forEach(([key, paths]) => {
          const existing = next[key] || [];
          next[key] = [...existing, ...paths];
        });
        return next;
      });
    } catch (uploadError) {
      setError('Photo upload failed. Please try again.');
    } finally {
      setUploadingCategory(null);
    }
  };

  const handlePhotoRemove = (category, index) => {
    setUploadedPhotos((prev) => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index)
    }));
  };

  const handleRegenerateScene = async (sceneIndex, customPrompt = null) => {
    setRegeneratingScene(sceneIndex);
    setError(null);

    try {
      // Get the current scene (from generatedImages if available, otherwise storyboard)
      const currentScene = generatedImages[sceneIndex] || storyboard[sceneIndex];

      // Build the scene to regenerate with the custom prompt if provided
      const sceneWithCustomPrompt = {
        ...currentScene,
        index: sceneIndex,
        // Use the new custom prompt, or keep the existing one
        customPrompt: customPrompt || currentScene.customPrompt || null,
      };

      console.log(`🔄 Regenerating scene ${sceneIndex}: "${sceneWithCustomPrompt.title}"`);
      console.log(`   Custom prompt: "${sceneWithCustomPrompt.customPrompt || 'none'}"`);

      const response = await generateScenes({
        styleId: selectedStyle,
        partner1Name: formData.partner1Name,
        partner2Name: formData.partner2Name,
        partner1Gender: formData.partner1Gender,
        partner2Gender: formData.partner2Gender,
        partner1Race: formData.partner1Race,
        partner2Race: formData.partner2Race,
        partner1Ethnicity: formData.partner1Ethnicity,
        partner2Ethnicity: formData.partner2Ethnicity,
        partner1Height: formData.partner1Height,
        partner2Height: formData.partner2Height,

        partner1AgeWhenMet: formData.partner1AgeWhenMet,
        partner2AgeWhenMet: formData.partner2AgeWhenMet,
        partner1CurrentAge: formData.partner1CurrentAge,
        partner2CurrentAge: formData.partner2CurrentAge,

        meetingGeography: formData.meetingGeography,
        // IMPORTANT: Send only the scene being regenerated, not all scenes!
        scenes: [sceneWithCustomPrompt],
        photoReferences: uploadedPhotos,
        settings: {
          width: parseInt(formData.width, 10),
          height: parseInt(formData.height, 10),
          cfgScale: currentStyle.cfg,
          steps: currentStyle.steps,
          sampler: currentStyle.sampler,
          negativePrompt: formData.negativePrompt,
        },
      });

      console.log('generateScenes response 👉', response);
      console.log('=== DEBUG: API Response ===');
      console.log('response.results:', response.results);
      console.log('First result:', response.results?.[0]);
      console.log('First result imageFilename:', response.results?.[0]?.imageFilename);


      const regeneratedScene = response.results[0];
      const { url, base64 } = toImageUrlFromComfy(regeneratedScene);

      // Check how many frames were successfully generated
      const successfulFrames = regeneratedScene.frames?.filter(f => f.success) || [];
      const totalFrames = regeneratedScene.frames?.length || 0;
      console.log(`Regenerate result: ${successfulFrames.length}/${totalFrames} frames successful`);

      setGeneratedImages((prev) => {
        const updated = [...prev];
        const existingScene = updated[sceneIndex] || {};

        // Build the updated scene object, preserving existing values if not returned
        updated[sceneIndex] = {
          ...existingScene,
          index: sceneIndex,
          image: url,
          imageUrl: url,
          imageBase64: base64,
          prompt: regeneratedScene.prompt || existingScene.prompt,
          customPrompt: customPrompt || existingScene.customPrompt || null,
          title: regeneratedScene.title || existingScene.title,
          description: regeneratedScene.description || existingScene.description,
          frames: regeneratedScene.frames || null,
        };
        return updated;
      });

      // Save the regenerated scene to the project immediately
      setGeneratedImages((prev) => {
        // Save all current images including the regenerated one
        saveImagesToProject(prev);
        return prev;
      });

      setImagesApproved(false);
      setEditingScenePrompt(null);

      // Show warning if not all frames were generated
      if (totalFrames > 0 && successfulFrames.length < 3) {
        console.warn(`Only ${successfulFrames.length}/3 frames generated successfully`);
      }
    } catch (apiError) {
      console.error(apiError);
      setError('Failed to regenerate scene. Please try again.');
    } finally {
      setRegeneratingScene(null);
    }
  };

  function base64ToBlob(base64, contentType = 'image/png') {
    try {
      if (!base64 || typeof base64 !== 'string') {
        console.error('base64ToBlob: Invalid input');
        return null;
      }

      // Clean the base64 string
      const cleanBase64 = base64.replace(/[\s\n\r]/g, '');

      const byteCharacters = atob(cleanBase64);
      const sliceSize = 1024;
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }

      return new Blob(byteArrays, { type: contentType });
    } catch (e) {
      console.error('base64ToBlob failed:', e.message);
      return null;
    }
  }

  function toImageUrlFromComfy(item) {
    console.log('🔍 toImageUrlFromComfy input:', {
      hasImageUrl: !!item?.imageUrl,
      imageUrlPreview: item?.imageUrl?.substring?.(0, 80),
      keys: Object.keys(item || {})
    });

    // 1) MOST IMPORTANT: Check imageUrl first!
    if (typeof item?.imageUrl === "string" && item.imageUrl.startsWith("http")) {
      console.log('✅ Found imageUrl!');
      return { url: item.imageUrl, base64: null };
    }

    // 2) Parse imageRaw JSON for URL
    if (typeof item?.imageRaw === "string") {
      try {
        const parsed = JSON.parse(item.imageRaw);
        const u = parsed?.images?.[0]?.data || parsed?.images?.[0]?.url;
        if (typeof u === "string" && u.startsWith("http")) {
          console.log('✅ Found URL in imageRaw');
          return { url: u, base64: null };
        }
      } catch (e) {
        console.log('⚠️ imageRaw parse error');
      }
    }

    // 3) Legacy: direct image field  
    if (typeof item?.image === "string" && item.image.startsWith("http")) {
      return { url: item.image, base64: null };
    }

    // 4) Base64 fallback
    let raw = item?.imageRaw || item?.image;
    if (!raw) {
      console.log('❌ No image data found');
      return { url: null, base64: null };
    }

    if (typeof raw === "string" && raw.startsWith("http")) {
      return { url: raw, base64: null };
    }

    const b64 = raw.startsWith?.("data:") ? raw.split(",")[1] : raw;
    const blob = base64ToBlob(b64, "image/png");
    return { url: blob ? URL.createObjectURL(blob) : null, base64: b64 };
  }


  // ==================== COMPREHENSIVE PROJECT SAVE ====================

  /**
   * Save complete project state including:
   * - Form data (partner info, story details)
   * - Generation settings (style, dimensions, etc.)
   * - Storyboard
   * - Generated images
   * - Generated videos
   * - Current workflow step
   */
  const saveCompleteProjectState = async (overrides = {}) => {
    if (!currentProjectId || !user) return;

    try {
      const projectRef = doc(db, 'projects', currentProjectId);

      const projectData = {
        // Basic info
        name: tempProjectName || currentProject?.name || 'Untitled Project',
        userId: user.uid,

        // Form data - ALL partner information
        partner1Name: formData.partner1Name,
        partner2Name: formData.partner2Name,
        partner1Gender: formData.partner1Gender,
        partner2Gender: formData.partner2Gender,
        partner1Race: formData.partner1Race,
        partner2Race: formData.partner2Race,
        partner1Ethnicity: formData.partner1Ethnicity,
        partner2Ethnicity: formData.partner2Ethnicity,
        partner1Height: formData.partner1Height,
        partner2Height: formData.partner2Height,
        partner1AgeWhenMet: formData.partner1AgeWhenMet,
        partner2AgeWhenMet: formData.partner2AgeWhenMet,
        partner1CurrentAge: formData.partner1CurrentAge,
        partner2CurrentAge: formData.partner2CurrentAge,

        // Story details
        storyHighlights: formData.storyHighlights,
        specialMoments: formData.specialMoments,
        meetingPlace: formData.meetingPlace,
        meetingGeography: formData.meetingGeography,
        meetingDate: formData.meetingDate,
        weddingDate: formData.weddingDate,

        // Generation settings
        selectedStyle,
        storyTemplate,
        sceneDurationSeconds,
        voiceNarration: formData.voiceNarration,
        musicPreference: formData.musicPreference,
        customVoiceId,

        // Dimensions & advanced settings
        width: formData.width,
        height: formData.height,
        aspectRatio: formData.aspectRatio,
        duration: formData.duration,
        customPrompt: formData.customPrompt,
        negativePrompt: formData.negativePrompt,

        // Workflow state
        currentStep: step,
        imagesApproved,

        // Photo references
        uploadedPhotos: {
          partner1: uploadedPhotos.partner1 || [],
          partner2: uploadedPhotos.partner2 || [],
        },

        // Generated content
        storyboard: storyboard || [],
        generatedImages: overrides.generatedImages || (generatedImages || []).map(img => ({
          index: img.index,
          title: img.title,
          description: img.description,
          prompt: img.prompt,
          imageUrl: img.imageUrl || img.image,
          location: img.location,
          mood: img.mood,
          // Store frames array for multi-frame scenes
          frames: img.frames || null,
        })),
        videos: overrides.videos || videoResult?.videos || videoResult?.scenes || [],
        combinedVideoUrl: overrides.combinedVideoUrl || videoResult?.combinedUrl || null,

        // Music state
        generatedMusicUrl: generatedMusicUrl || null,
        selectedMusicStyle: selectedMusicStyle || null,

        // Timestamps
        updatedAt: serverTimestamp(),

        // Any custom overrides (but generatedImages/videos already handled above)
        ...Object.fromEntries(
          Object.entries(overrides).filter(([key]) =>
            !['generatedImages', 'videos', 'combinedVideoUrl'].includes(key)
          )
        ),
      };

      await updateDoc(projectRef, removeUndefined(projectData));
      console.log('✅ Project state saved:', currentProjectId);
    } catch (err) {
      console.error('❌ Error saving project state:', err);
    }
  };

  // Legacy functions for backward compatibility
  const saveImagesToProject = async (images) => {
    try {
      if (!user?.uid || !currentProjectId) {
        console.warn('Cannot upload to R2: missing user or project ID');
        throw new Error('Missing user or project');
      }

      // Upload images to R2 first
      console.log('📤 Uploading images to R2...');
      const imagesWithR2 = await uploadImagesToR2(images, user.uid, currentProjectId);

      // Save to Firestore with R2 URLs
      await saveCompleteProjectState({
        generatedImages: imagesWithR2.map(img => ({
          index: img.index,
          title: img.title,
          description: img.description,
          prompt: img.prompt,
          imageUrl: img.r2Url || img.imageUrl || img.image, // Use R2 URL
          r2Url: img.r2Url,
          location: img.location,
          mood: img.mood,
          frames: img.frames || null,
        }))
      });

      console.log('✅ Images saved to R2 and Firestore');
    } catch (error) {
      console.error('Failed to upload to R2, saving locally:', error);
      // Fallback: save without R2 URLs
      await saveCompleteProjectState({
        generatedImages: images.map(img => ({
          index: img.index,
          title: img.title,
          description: img.description,
          prompt: img.prompt,
          imageUrl: img.imageUrl || img.image,
          location: img.location,
          mood: img.mood,
          frames: img.frames || null,
        }))
      });
    }
  };

  const saveVideosToProject = async (videos) => {
    try {
      if (!user?.uid || !currentProjectId) {
        console.warn('Cannot upload to R2: missing user or project ID');
        throw new Error('Missing user or project');
      }

      // Upload videos to R2 first
      console.log('📤 Uploading videos to R2...');
      const videosWithR2 = await uploadVideosToR2(videos, user.uid, currentProjectId);

      // Save to Firestore with R2 URLs
      await saveCompleteProjectState({
        videos: videosWithR2.map(v => ({
          index: v.index,
          title: v.title,
          url: v.r2Url || v.url, // Use R2 URL
          r2Url: v.r2Url,
          success: v.success,
        }))
      });

      console.log('✅ Videos saved to R2 and Firestore');
    } catch (error) {
      console.error('Failed to upload to R2, saving temporarily:', error);
      // Fallback: save without R2 URLs
      await saveCompleteProjectState({
        videos: videos.map(v => ({
          index: v.index,
          title: v.title,
          url: v.url,
          success: v.success,
        }))
      });
    }
  };

  /**
   * TEST MODE: Load local test videos from client/video folder
   */
  const loadTestVideos = async () => {
    try {
      console.log('🧪 Loading test videos from local folder...');

      // Use actual videos from client/video folder
      const testVideoFiles = [
        '02-26_0414caa0-9c15-472d-b136-8027563f15de-e1_f0a74bcf.mp4',
        '02-26_07069e06-bc74-49b6-880b-451bd6b9685c-e2_2be69d3a.mp4',
        '02-26_12866ff7-6d8e-4361-b5aa-e0631c7752e9-e1_41563e1c.mp4',
        '02-26_1da37604-3887-4827-9081-98aa3e97ca45-e1_c8c4f63f.mp4',
        '02-26_21024b95-ee7f-4b8d-a3ce-abc2d17baadd-e2_9a1d1352.mp4',
        '02-26_393a655b-26bc-44fc-ba9b-8d66dd6877fa-e1_50ca69ab.mp4',
        '02-26_3e3faaa9-cb94-494c-b9a5-9af6dd9a821b-e1_43a4d9c3.mp4',
        '02-26_3fa08bb0-5988-478b-b69a-945c5989c3b5-e1_0403ba74.mp4',
        '02-26_544681f2-2dc1-44f7-902e-e5aca82027d1-e1_fc8effbc.mp4',
        '02-26_60574e21-930a-482c-ac0c-673d0a4fe291-e2_e616e92d.mp4',
      ];

      // Create test video results using your existing videos
      const testVideos = generatedImages.map((img, idx) => ({
        index: idx,
        title: img.title,
        url: `/video/${testVideoFiles[idx % testVideoFiles.length]}`,
        success: true,
      }));

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      setVideoResult({
        success: true,
        engine: 'test',
        videos: testVideos,
      });

      // Save videos to project
      await saveVideosToProject(testVideos);

      setGeneratingVideos(false);
      console.log('✅ Test videos loaded');
      console.log('📊 Video result:', {
        success: true,
        engine: 'test',
        videoCount: testVideos.length,
        successfulVideos: testVideos.filter(v => v.success).length,
      });
    } catch (error) {
      console.error('❌ Test video loading error:', error);
      setError('Failed to load test videos');
      setGeneratingVideos(false);
    }
  };

  /**
   * TEST MODE: Load local test data instead of calling expensive APIs
   */
  const loadTestData = async (totalScenes) => {
    try {
      console.log(`🧪 Loading ${totalScenes} test scenes...`);

      // Simulate progressive loading
      for (let i = 0; i < totalScenes; i++) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay

        const testScenes = Array.from({ length: i + 1 }, (_, idx) => ({
          index: idx,
          title: storyboard[idx]?.title || `Scene ${idx + 1}`,
          description: storyboard[idx]?.description || `Test scene ${idx + 1}`,
          prompt: storyboard[idx]?.description || `Test prompt ${idx + 1}`,
          imageUrl: `/characterpre.jpeg`, // Use existing placeholder image
          imageBase64: null,
          location: storyboard[idx]?.location,
          mood: storyboard[idx]?.mood,
          success: true,
          frames: null,
        }));

        setGeneratedImages(testScenes);
        setProgress({
          current: i + 1,
          total: totalScenes,
          sdProgress: (i + 1) / totalScenes,
          eta: 0,
        });

        // Save progressively
        if (testScenes.length > 0) {
          await saveImagesToProject(testScenes);
        }
      }

      console.log('✅ Test images loaded');
      setGenerating(false);
      setImagesApproved(false); // Allow user to approve
    } catch (error) {
      console.error('❌ Test mode error:', error);
      setError('Failed to load test data');
      setGenerating(false);
    }
  };

  const handleGenerateImages = async () => {
    // Validation
    if (!formData.partner1Name || !formData.partner2Name) {
      setError('Please enter both partner names');
      return;
    }

    setError(null);

    const storyboardReady = await ensureStoryboard(estimatedSceneCount);
    if (!storyboardReady) return;

    // Show estimate modal instead of starting immediately
    setShowEstimateModal(true);
  };

  const confirmGeneration = async ({ emailNotification }) => {
    setEmailNotificationEnabled(emailNotification);
    setShowEstimateModal(false);
    setGenerating(true);
    setGeneratedImages([]);
    setVideoResult(null);
    setImagesApproved(false);

    const totalScenes = storyboard.length;
    setProgress({ current: 0, total: totalScenes, sdProgress: 0, eta: 0 });

    // TEST MODE: Use local test data instead of API
    if (testMode) {
      console.log('🧪 TEST MODE: Using local test data');
      await loadTestData(totalScenes);
      return;
    }

    try {
      // Step 1: Start the job (returns immediately with jobId)
      const startResp = await generateScenesAsync({
        styleId: selectedStyle,
        partner1Name: formData.partner1Name,
        partner2Name: formData.partner2Name,
        partner1Gender: formData.partner1Gender,
        partner2Gender: formData.partner2Gender,
        partner1Race: formData.partner1Race,
        partner2Race: formData.partner2Race,
        partner1Ethnicity: formData.partner1Ethnicity,
        partner2Ethnicity: formData.partner2Ethnicity,
        partner1Height: formData.partner1Height,
        partner2Height: formData.partner2Height,
        partner1AgeWhenMet: formData.partner1AgeWhenMet,
        partner2AgeWhenMet: formData.partner2AgeWhenMet,
        partner1CurrentAge: formData.partner1CurrentAge,
        partner2CurrentAge: formData.partner2CurrentAge,
        meetingGeography: formData.meetingGeography,
        scenes: storyboard,
        photoReferences: uploadedPhotos,
        settings: {
          width: parseInt(formData.width, 10),
          height: parseInt(formData.height, 10),
          cfgScale: currentStyle.cfg,
          steps: currentStyle.steps,
          sampler: currentStyle.sampler,
          negativePrompt: formData.negativePrompt,
          customPrompt: formData.customPrompt,
        },
      });

      if (!startResp.success || !startResp.jobId) {
        setError(startResp.error || 'Failed to start image generation');
        setGenerating(false);
        return;
      }

      const jobId = startResp.jobId;
      console.log('🖼️ Image job started:', jobId);

      // Step 2: Poll for completion with real-time updates
      let pollAttempts = 0;
      const maxPollAttempts = 600; // 30 min max (3s * 600)

      const pollJob = async () => {
        try {
          const status = await checkImageJobStatus(jobId);

          // Update progress in real-time
          setProgress({
            current: status.completed || 0,
            total: status.total || totalScenes,
            currentScene: status.currentTitle || `Scene ${status.currentScene}`,
            sdProgress: status.completed / status.total,
          });

          // Update images as they complete (show partial results!)
          if (status.results && status.results.length > 0) {
            console.log('📦 Raw status.results:', status.results);
            console.log('🖼️ First result frames:', status.results[0]?.frames);

            const formattedScenes = status.results.map((item) => {
              const { url, base64 } = toImageUrlFromComfy(item);
              const zeroIdx = (item.index ? item.index - 1 : 0);

              console.log(`🎬 Scene ${zeroIdx + 1} has ${item.frames?.length || 0} frames`);

              return {
                index: zeroIdx,
                title: item.title || storyboard[zeroIdx]?.title || `Scene ${zeroIdx + 1}`,
                description: item.description || storyboard[zeroIdx]?.description || '',
                prompt: item.prompt,
                image: url,
                imageUrl: url,
                imageBase64: base64,
                location: storyboard[zeroIdx]?.location,
                mood: storyboard[zeroIdx]?.mood,
                success: item.success,
                error: item.error,
                // Include frames array for multi-frame scenes
                frames: item.frames || null,
              };
            });

            setGeneratedImages(formattedScenes);

            // Save images progressively as they complete (not just at the end)
            if (formattedScenes.length > 0) {
              await saveImagesToProject(formattedScenes);
            }
          }

          if (status.status === 'completed') {
            console.log('✅ Image generation complete!');
            setProgress({ current: totalScenes, total: totalScenes, sdProgress: 1, eta: 0 });

            // Save final results to project
            // Save final results to project
            if (status.results && status.results.length > 0) {
              const finalScenes = status.results.map((item) => {
                const { url, base64 } = toImageUrlFromComfy(item);
                const zeroIdx = (item.index ? item.index - 1 : 0);
                return {
                  index: zeroIdx,
                  title: item.title || storyboard[zeroIdx]?.title || `Scene ${zeroIdx + 1}`,
                  description: item.description || storyboard[zeroIdx]?.description || '',
                  prompt: item.prompt,
                  image: url,
                  imageUrl: url,
                  imageBase64: base64,
                  location: storyboard[zeroIdx]?.location,
                  mood: storyboard[zeroIdx]?.mood,
                  // Include frames array for multi-frame scenes
                  frames: item.frames || null,
                };
              });

              setGeneratedImages(finalScenes);
              await saveImagesToProject(finalScenes);
            }

            setGenerating(false);
            return;
          }

          if (status.status === 'failed') {
            setError(status.error || 'Image generation failed');
            setGenerating(false);
            return;
          }

          // Continue polling
          pollAttempts++;
          if (pollAttempts < maxPollAttempts) {
            setTimeout(pollJob, 3000); // Poll every 3 seconds
          } else {
            setError('Image generation timed out. Please try again.');
            setGenerating(false);
          }

        } catch (pollErr) {
          console.error('Polling error:', pollErr);
          pollAttempts++;
          if (pollAttempts < maxPollAttempts) {
            setTimeout(pollJob, 5000); // Retry after 5s on error
          } else {
            setError('Lost connection to server. Please refresh and check your project.');
            setGenerating(false);
          }
        }
      };

      // Start polling
      pollJob();

    } catch (apiError) {
      console.error(apiError);
      setError("We're having trouble creating your story right now. Please try again.");
      setGenerating(false);
    }
  };


  const handleGenerateVideos = async () => {
    if (generatedImages.length === 0) {
      setError('Please generate images first');
      return;
    }

    setGeneratingVideos(true);
    setError(null);

    // TEST MODE: Use local test videos
    if (testMode) {
      console.log('🧪 TEST MODE: Using local test videos');
      await loadTestVideos();
      return;
    }

    // Check that scenes have frames for Veo interpolation
    const scenesWithFrames = generatedImages.filter(s => s.frames && s.frames.length >= 2);
    if (scenesWithFrames.length === 0) {
      setError('Scenes need at least 2 frames for video generation. Please regenerate images.');
      setGeneratingVideos(false);
      return;
    }

    try {
      console.log('🎬 Starting Veo video generation...');

      // Start Veo job
      const startResp = await createVeoVideosFromScenes({
        scenes: scenesWithFrames.map((s) => ({
          title: s.title,
          description: s.description || s.prompt || s.title,
          frames: s.frames, // Pass all frames - backend will use first and last
        })),
        settings: {
          duration: 8, // 5 seconds per scene
          aspectRatio: '16:9',
          addMusic: true, // Add romantic piano music
          musicVolume: 0.3,
        },
      });

      if (!startResp.success || !startResp.jobId) {
        throw new Error(startResp.error || 'Failed to start video generation');
      }

      console.log(`🎬 Veo job started: ${startResp.jobId}`);

      // Poll for completion
      const maxPollAttempts = 360; // 60 minutes max (10s intervals)
      let pollAttempts = 0;

      const pollVeoJob = async () => {
        try {
          const status = await checkVeoJobStatus(startResp.jobId);
          console.log(`🎬 Veo status: ${status.status} (${status.completed}/${status.total})`);

          if (status.currentTitle) {
            // Could update UI with current scene being processed
            console.log(`   Processing: ${status.currentTitle}`);
          }

          if (status.status === 'completed') {
            console.log('✅ Veo video generation complete!');
            setVideoResult({
              success: true,
              videos: status.videos || status.results || [],
            });
            setGeneratingVideos(false);

            // Use backend-generated music if available, otherwise generate client-side
            if (status.musicUrl) {
              console.log('🎵 Using backend-generated music:', status.musicUrl);
              setGeneratedMusicUrl(status.musicUrl);
              setSelectedMusicStyle('romantic_piano');
            } else {
              // Fallback: Generate 3 music tracks in parallel
              const totalDuration = (status.videos || status.results || []).length * 8 * 1000 + 6000; // 8s per scene + intro
              console.log('🎵 No backend music, generating client-side...');
              setGeneratingMusic(true);

              try {
                const musicResult = await generateAllMusic(totalDuration);
                if (musicResult.success && musicResult.tracks) {
                  const successfulTracks = musicResult.tracks.filter(t => t.success);
                  setGeneratedMusicTracks(successfulTracks);
                  if (successfulTracks.length > 0) {
                    setGeneratedMusicUrl(successfulTracks[0].url);
                    setSelectedMusicStyle(successfulTracks[0].style);
                  }
                  console.log(`✅ Generated ${successfulTracks.length} music tracks`);
                }
              } catch (musicErr) {
                console.error('❌ Music generation failed:', musicErr);
              } finally {
                setGeneratingMusic(false);
              }
            }

            return;
          }

          if (status.status === 'failed') {
            setError(status.error || 'Video generation failed');
            setGeneratingVideos(false);
            return;
          }

          // Continue polling
          pollAttempts++;
          if (pollAttempts < maxPollAttempts) {
            setTimeout(pollVeoJob, 10000); // Poll every 10 seconds
          } else {
            setError('Video generation timed out. Please try again.');
            setGeneratingVideos(false);
          }

        } catch (pollErr) {
          console.error('Polling error:', pollErr);
          pollAttempts++;
          if (pollAttempts < maxPollAttempts) {
            setTimeout(pollVeoJob, 15000); // Retry after 15s on error
          } else {
            setError('Lost connection to server. Please refresh and check your project.');
            setGeneratingVideos(false);
          }
        }
      };

      // Start polling
      pollVeoJob();

    } catch (videoErr) {
      console.error('Veo video generation failed:', videoErr);
      setError(
        videoErr.message || 'Video generation failed. Please try again or contact support.'
      );
      setGeneratingVideos(false);
    }
  };

  const handleVoiceReady = async (voiceData) => {
    try {
      setError(null);
      console.log('🎤 Starting voice clone...');

      const result = await cloneVoice({
        audioBase64: voiceData.base64Audio,
        userId: user?.uid,
        voiceName: `${formData.partner1Name || 'Partner 1'} & ${formData.partner2Name || 'Partner 2'} Narrator`,
      });

      console.log('🎤 Clone result:', result);

      if (result.success) {
        // Store voice ID immediately - voice is ready even without preview
        setCustomVoiceId(result.voiceId);

        // Store preview URL if available
        if (result.previewUrl) {
          console.log('🔊 Preview URL received:', result.previewUrl.substring(0, 100));
          setClonedVoicePreview(result.previewUrl);
        } else {
          console.log('⚠️ No preview URL returned - voice still usable');
          // Clear any stuck loading state
          setClonedVoicePreview(null);
        }

        // Save to Firestore
        try {
          await saveVoiceClone({
            voiceId: result.voiceId,
            name: result.voiceName,
            previewUrl: result.previewUrl || null,
          });
        } catch (saveErr) {
          console.error('Failed to save to Firestore:', saveErr);
          // Continue anyway - voice is cloned
        }

        // Close the recorder modal
        setShowVoiceRecorder(false);

        return {
          success: true,
          voiceId: result.voiceId,
          voiceName: result.voiceName,
          previewUrl: result.previewUrl,
        };
      } else {
        setError(result.error || 'Failed to clone voice');
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('Voice cloning failed:', err);
      setError('Failed to process your voice. Please try again.');
      return { success: false, error: err.message };
    }
  };


  const getBaseSuccessVideos = () => {
    if (!videoResult?.videos) return [];
    return videoResult.videos
      .filter(v => v.success && (v.url || v.videoUrl))
      .map(v => ({ ...v, url: v.url || v.videoUrl }))
      .sort((a, b) => (a.index || 0) - (b.index || 0));
  };

  const handleReorder = (oldIndex, newIndex) => {
    setReorderedVideos(prev => {
      const currentList = prev || [INTRO_VIDEO_CLIP, ...getBaseSuccessVideos()];
      const result = Array.from(currentList);
      const [removed] = result.splice(oldIndex, 1);
      result.splice(newIndex, 0, removed);
      return result;
    });
  };

  // --- Editor: Combine all scene videos into one ---
  const handleCombineVideos = async () => {
    if (!videoResult?.videos?.length) return;
    setCombining(true);
    setError(null);
    try {
      // Use reordered videos if they exist, otherwise get base list with intro prepended
      const videosInOrder = reorderedVideos || [INTRO_VIDEO_CLIP, ...getBaseSuccessVideos()];

      // The backend adds the local intro manually, so we filter it from the list of remote videos to download.
      const videos = videosInOrder
        .filter(v => v.index !== INTRO_VIDEO_CLIP.index)
        .map(v => {
          let url = v.url;
          if (url && !url.startsWith('http')) {
            // Make relative URLs absolute so the backend can try to download them
            url = window.location.origin + url;
          }
          return { url, title: v.title || `Scene ${v.index}` };
        });

      console.log('🎬 Sending to combine API:', JSON.stringify(videos, null, 2));

      const result = await combineVideos({
        videos,
        projectId: currentProjectId || 'default',
        playbackSpeed, // Pass speed to backend
        musicUrl: generatedMusicUrl || null, // ElevenLabs generated music
        musicVolume: musicVolume ?? 0.5, // User-set volume (0-1)
      });
      if (result.success && result.combinedVideoUrl) {
        setCombinedVideoUrl(result.combinedVideoUrl);
        setShowExportModal(true);
      } else {
        setError(result.error || 'Failed to combine videos');
      }
    } catch (err) {
      setError(err.message || 'Failed to combine videos');
    } finally {
      setCombining(false);
    }
  };

  const handleGenerateComfyVideos = async () => {
    if (generatedImages.length === 0) {
      setError('Please generate images first');
      return;
    }

    setGeneratingVideos(true);
    setError(null);
    setComfyQueued(false);

    // TEST MODE: Use local test videos
    if (testMode) {
      console.log('🧪 TEST MODE: Skipping API, loading local videos');
      await loadTestVideos();
      return;
    }

    // Calculate credit cost
    const creditCost = generatedImages.length * CREDIT_COSTS.VIDEO_GENERATION;

    // Check if user has enough credits
    if (!hasEnoughCredits(creditCost)) {
      setError(`Not enough credits. You need ${creditCost} credits but only have ${credits}.`);
      setShowUpgradeModal(true);
      setGeneratingVideos(false);
      return;
    }

    try {
      // Step 1: Start the job based on selected model
      let startResp;

      const sceneData = generatedImages.map((s, i) => {
        // Check for existing audio in previous video results to avoid regeneration
        const existingVideo = videoResult?.videos?.find(v => v.sceneIndex === (s.index || i + 1));
        return {
          title: s.title,
          description: s.description || s.prompt || s.title,
          narration: s.narration || storyboard[i]?.narration, // Pass narration text (fallback to storyboard if missing in image obj)
          narrationUrl: existingVideo?.narrationUrl || null, // Pass existing URL if available
          musicUrl: existingVideo?.musicUrl || null,
          image: s.imageBase64
            ? `data:image/png;base64,${s.imageBase64}`
            : s.imageUrl || s.image || null,
          frames: s.frames || null, // Pass frames for parallel first+last frame generation
        };
      });

      if (videoModel === 'veo') {
        console.log('🎬 Starting Veo generation...');
        startResp = await createVeoVideosFromScenes({
          scenes: sceneData,
          settings: {
            ...formData,
            duration: sceneDurationSeconds,
          }
        });
      } else {
        // Default Omnia/Comfy generation
        startResp = await createComfyVideosFromScenes({
          storyData: {
            ...formData, // Pass preferences (music, voice)
            videoModel,
          },
          scenes: sceneData,
          returnBase64: false,
        });
      }

      if (!startResp.success || !startResp.jobId) {
        setError(startResp.error || 'Failed to start video generation');
        setGeneratingVideos(false);
        return;
      }

      const jobId = startResp.jobId;
      console.log(`🎬 Video job started (${videoModel}):`, jobId);

      // Step 2: Poll for completion
      let pollAttempts = 0;
      const maxPollAttempts = 600;

      const pollJob = async () => {
        try {
          // Poll different status endpoint based on model
          const status = videoModel === 'veo'
            ? await checkVeoJobStatus(jobId)
            : await checkVideoJobStatus(jobId);

          setProgress({
            current: status.completed || 0,
            total: status.total || generatedImages.length,
            currentScene: status.currentTitle || `Scene ${status.currentScene}`,
          });

          if (status.status === 'completed') {
            const videos = status.videos || status.results || [];

            // Update UI immediately
            setVideoResult({
              success: true,
              engine: 'comfy',
              videos: videos,
            });
            setComfyQueued(true);
            setGeneratingVideos(false);

            // Auto-set music URL if backend generated it (Veo mode)
            if (status.musicUrl) {
              console.log('🎵 Auto-generated music received:', status.musicUrl);
              setGeneratedMusicUrl(status.musicUrl);
              setSelectedMusicStyle('romantic_piano');
            }

            // Save videos to project and deduct credits in background (non-blocking)
            saveVideosToProject(videos).catch(err => console.error('Failed to save videos:', err));

            // ONLY deduct credits AFTER successful completion
            const successfulVideos = videos.filter(v => v.success).length;
            if (successfulVideos > 0) {
              const actualCost = successfulVideos * CREDIT_COSTS.VIDEO_GENERATION;
              localDeductCredits(actualCost, `video_generation_${successfulVideos}_scenes`)
                .then(() => console.log(`✅ Deducted ${actualCost} credits for ${successfulVideos} videos`))
                .catch(err => console.error('Failed to deduct credits:', err));
            }

            return;
          }

          if (status.status === 'failed') {
            setError(status.error || 'Video generation failed');
            setGeneratingVideos(false);
            // NO credits deducted on failure
            return;
          }

          pollAttempts++;
          if (pollAttempts < maxPollAttempts) {
            setTimeout(pollJob, 5000);
          } else {
            setError('Video generation timed out. Please try again.');
            setGeneratingVideos(false);
          }

        } catch (pollErr) {
          console.error('Polling error:', pollErr);
          pollAttempts++;
          if (pollAttempts < maxPollAttempts) {
            setTimeout(pollJob, 5000);
          } else {
            setError('Lost connection to server. Please refresh and check your project.');
            setGeneratingVideos(false);
          }
        }
      };

      pollJob();

    } catch (err) {
      console.error('Comfy video generation failed:', err);
      setError('Video generation failed. Please try again or contact support.');
      setGeneratingVideos(false);
      // NO credits deducted on failure
    }
  };

  const handleNextStep = async () => {
    if (step === 1) {
      if (!formData.partner1Name || !formData.partner2Name) {
        setError('Please enter both partner names');
        return;
      }
      if (!formData.meetingPlace) {
        setError('Please enter the place where you met');
        return;
      }
      if (!formData.storyHighlights) {
        setError('Please tell us your love story.');
        return;
      }
      if (!formData.partner1Race || !formData.partner2Race) {
        setError('Please specify race/ethnicity for both partners');
        return;
      }
      if (
        !formData.partner1AgeWhenMet ||
        !formData.partner2AgeWhenMet ||
        !formData.partner1CurrentAge ||
        !formData.partner2CurrentAge
      ) {
        setError('Please provide age information for both partners (then and now).');
        return;
      }
      if (!formData.meetingGeography) {
        setError('Please provide the location geography');
        return;
      }

      setError(null);
      const ok = await ensureStoryboard(estimatedSceneCount);
      if (!ok) {
        return;
      }
    }

    setStep(step + 1);
  };

  useEffect(() => {
    const cached = localStorage.getItem('omnia_projects');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setProjects(parsed);
        }
      } catch (e) {
        console.error('Failed to parse cached projects', e);
      }
    }
  }, []);

  const handleProjectNameSave = async () => {
    const newName = (tempProjectName || '').trim();

    if (!newName) {
      setTempProjectName(currentProject?.name || 'Untitled');
      setEditingProjectName(false);
      return;
    }

    setEditingProjectName(false);

    try {
      let projectId = currentProjectId;

      // If no project exists, create one first
      if (!projectId) {
        console.log('📝 No project exists, creating new one...');

        if (!user) {
          setError('Please sign in to save your project');
          return;
        }

        const docRef = await addDoc(collection(db, "projects"), {
          name: newName,
          userId: user.uid,
          createdAt: serverTimestamp(),
          status: "draft"
        });

        projectId = docRef.id;
        setCurrentProjectId(projectId);
        console.log('✅ Created project:', projectId, 'with name:', newName);

        // The onSnapshot listener will update the projects list
        return;
      }

      // Update existing project
      console.log('📝 Updating project name:', projectId, '->', newName);

      // Optimistic update for immediate UI feedback
      setProjects(prev =>
        prev.map(p =>
          p.id === projectId ? { ...p, name: newName } : p
        )
      );

      const projectRef = doc(db, 'projects', projectId);
      await updateDoc(projectRef, {
        name: newName,
        updatedAt: serverTimestamp(),
      });

      console.log('Project name updated');

    } catch (error) {
      console.error('Error updating project name:', error);
      setError('Failed to save project name. Please try again.');
    }
  };

  const handleOpenEditPrompt = (sceneIndex) => {
    const scene = generatedImages[sceneIndex];
    setEditingScenePrompt(sceneIndex);
    // Show custom prompt if set, otherwise show the scene description
    setTempScenePrompt(scene.customPrompt || scene.description || scene.prompt || '');
  };

  const handleSaveScenePrompt = () => {
    if (editingScenePrompt !== null) {
      handleRegenerateScene(editingScenePrompt, tempScenePrompt);
    }
  };

  const initRecognition = () => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser yet.');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let chunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        // We’ll only commit *final* results so the text doesn’t flicker
        if (result.isFinal) {
          chunk += transcript + ' ';
        }
      }

      if (chunk.trim()) {
        setFormData((prev) => ({
          ...prev,
          storyHighlights: (prev.storyHighlights + ' ' + chunk).trim(),
        }));
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    return recognition;
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const recognition = initRecognition();
    if (!recognition) return;

    setIsRecording(true);
    try {
      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsRecording(false);
    }
  };

  const clearSearch = () => {
    setSceneSearchQuery('');
    setActiveFilter('all');
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <Loader className="animate-spin text-rose-500" size={32} />
      </div>
    );
  }


  if (!user) {
    return <LandingPage />;
  }


  return (
    <Routes>
      {/* MAIN APP */}
      <Route
        path="/"
        element={
          <div className="app">
            {/* Hidden audio element for timeline playback */}
            {generatedMusicUrl && (
              <audio
                ref={musicAudioRef}
                src={generatedMusicUrl}
                crossOrigin="anonymous"
                onEnded={() => setEditorPlaying(false)}
                onLoadedData={(e) => { e.target.volume = musicVolume; }}
              />
            )}

            {/* Export video download modal */}
            {showExportModal && combinedVideoUrl && (
              <div className="export-modal-overlay" onClick={() => setShowExportModal(false)}>
                <div className="export-modal" onClick={(e) => e.stopPropagation()}>
                  <button className="export-modal-close" onClick={() => setShowExportModal(false)}>
                    <X size={20} />
                  </button>
                  <h3>Your Video is Ready</h3>
                  <video
                    src={normalizeMediaUrl(combinedVideoUrl)}
                    controls
                    playsInline
                    className="export-modal-video"
                  />
                  <a
                    href={combinedVideoUrl}
                    download="love_story.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="export-modal-download-btn"
                    onClick={() => setShowExportModal(false)}
                  >
                    <Download size={18} /> Download Video
                  </a>
                </div>
              </div>
            )}

            {!user ? (
              <LandingPage />
            ) : currentPage === 'settings' ? (
              <SettingsPage
                user={user}
                onBack={() => setCurrentPage('main')}
                initialSection={settingsSection}
              />
            ) : (
              <>
                {/* Left Sidebar */}
                <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
                  <button
                    className="sidebar-toggle"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                  </button>

                  {!sidebarCollapsed && (
                    <>
                      <div className="sidebar-header">
                        <div className="logo">

                          <span className="logo-text">Omnnia</span>
                        </div>
                        <span className="subtitle">Bring your love story to life</span>

                        <div className="progress-container">
                          <div className="progress-bars">
                            {[1, 2, 3, 4].map((s) => (
                              <div key={s} className={`progress-bar ${s <= step ? 'active' : ''}`} />
                            ))}
                          </div>
                          <div className="progress-labels">
                            <span
                              className={step === 1 ? 'active' : 'clickable'}
                              onClick={() => setStep(1)}
                            >
                              Story Details
                            </span>
                            <span
                              className={step === 2 ? 'active' : (storyboard.length > 0 ? 'clickable' : '')}
                              onClick={() => storyboard.length > 0 && setStep(2)}
                            >
                              Animation Style
                            </span>
                            <span
                              className={step === 3 ? 'active' : (storyboard.length > 0 ? 'clickable' : '')}
                              onClick={() => storyboard.length > 0 && setStep(3)}
                            >
                              Generate
                            </span>
                            <span
                              className={step === 4 ? 'active' : (videoResult?.videos?.length > 0 ? 'clickable' : '')}
                              onClick={() => videoResult?.videos?.length > 0 && setStep(4)}
                              style={{
                                cursor: videoResult?.videos?.length > 0 ? 'pointer' : 'default',
                                opacity: videoResult?.videos?.length > 0 ? 1 : 0.5,
                              }}
                            >
                              Editor
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="sidebar-content">
                        {step === 1 && (
                          <div className="form-section">
                            <div className="form-group">
                              <label>AI Model</label>
                              <div className="model-select">
                                <div className="model-icon"></div>
                                <span className="model-name">{selectedModel || 'Default'}</span>
                                <ChevronDown size={16} className="dropdown-arrow" />
                                <select
                                  value={selectedModel}
                                  onChange={(e) => {
                                    setSelectedModel(e.target.value);
                                    // Force music-only when Veo is selected (no narration)
                                    if (e.target.value === 'Veo (Google AI)') {
                                      updateFormData('voiceNarration', 'music-only');
                                    }
                                  }}
                                >
                                  {availableModels.length > 0 ? (
                                    availableModels.map((model) => (
                                      <option key={model} value={model}>
                                        {model}
                                      </option>
                                    ))
                                  ) : (
                                    <option>Default Model</option>
                                  )}
                                </select>
                              </div>
                            </div>

                            <div className="form-group">
                              <label>Your Love Story *</label>

                              <textarea
                                className="story-textarea"
                                value={formData.storyHighlights}
                                onChange={(e) => updateFormData('storyHighlights', e.target.value)}
                                placeholder="Tell us your love story... You can also tap the mic and just speak."
                                rows={4}
                                required
                              />

                              {/* Icon-only actions under the textbox */}
                              <div className="story-actions story-actions-below">
                                <button
                                  type="button"
                                  className={`icon-pill mic-btn ${isRecording ? 'recording' : ''}`}
                                  onClick={handleToggleRecording}
                                  aria-label={isRecording ? 'Stop recording' : 'Record your story'}
                                >
                                  {isRecording ? <Square size={18} /> : <Mic size={18} />}
                                  <span className="icon-tooltip">
                                    {isRecording ? 'Stop recording' : 'Record your story'}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  className="icon-pill save-story-btn"
                                  onClick={handleSaveStory}
                                  disabled={savingStory || !formData.storyHighlights.trim()}
                                  aria-label="Save story"
                                >
                                  {savingStory ? (
                                    <Loader size={16} className="spinning" />
                                  ) : (
                                    <Save size={16} />
                                  )}
                                  <span className="icon-tooltip">
                                    {savingStory ? 'Saving…' : 'Save story'}
                                  </span>
                                </button>
                              </div>


                            </div>

                            <div className="partner-section">
                              <h4>Partner 1 Details</h4>
                              <div className="form-row">
                                <div className="form-group">
                                  <label>Name *</label>
                                  <input
                                    type="text"
                                    value={formData.partner1Name}
                                    onChange={(e) => updateFormData('partner1Name', e.target.value)}
                                    placeholder="Sarah"
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Gender *</label>
                                  <select
                                    value={formData.partner1Gender}
                                    onChange={(e) => updateFormData('partner1Gender', e.target.value)}
                                    required
                                  >
                                    <option value="female">Female</option>
                                    <option value="male">Male</option>
                                    <option value="non-binary">Non-binary</option>
                                  </select>
                                </div>
                              </div>

                              <div className="form-row single-column">
                                <div className="form-group">
                                  <label>Race *</label>
                                  <input
                                    type="text"
                                    value={formData.partner1Race}
                                    onChange={(e) => updateFormData('partner1Race', e.target.value)}
                                    placeholder="e.g., Black, Asian, White"
                                    required
                                  />
                                </div>
                              </div>

                              <div className="form-row single-column">
                                <div className="form-group">
                                  <label>Ethnicity</label>
                                  <input
                                    type="text"
                                    value={formData.partner1Ethnicity}
                                    onChange={(e) => updateFormData('partner1Ethnicity', e.target.value)}
                                    placeholder="e.g., Nigerian, Japanese, Hispanic"
                                  />
                                </div>
                              </div>

                              <div className="form-row single-column">
                                <div className="form-group">
                                  <label>Height</label>
                                  <input
                                    type="text"
                                    value={formData.partner1Height}
                                    onChange={(e) => updateFormData('partner1Height', e.target.value)}
                                    placeholder="e.g., 5'6&quot;, 168cm, tall, short"
                                  />
                                </div>
                              </div>

                              {/* 👇 Add this row for Partner 1 ages */}
                              <div className="form-row">
                                <div className="form-group">
                                  <label>Age When You Met *</label>
                                  <input
                                    type="number"
                                    value={formData.partner1AgeWhenMet}
                                    onChange={(e) => updateFormData('partner1AgeWhenMet', e.target.value)}
                                    placeholder="e.g., 25"
                                    min="0"
                                    max="120"
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Current Age *</label>
                                  <input
                                    type="number"
                                    value={formData.partner1CurrentAge}
                                    onChange={(e) => updateFormData('partner1CurrentAge', e.target.value)}
                                    placeholder="e.g., 30"
                                    min="0"
                                    max="120"
                                    required
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="partner-section">
                              <h4>Partner 2 Details</h4>
                              <div className="form-row">
                                <div className="form-group">
                                  <label>Name *</label>
                                  <input
                                    type="text"
                                    value={formData.partner2Name}
                                    onChange={(e) => updateFormData('partner2Name', e.target.value)}
                                    placeholder="Michael"
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Gender *</label>
                                  <select
                                    value={formData.partner2Gender}
                                    onChange={(e) => updateFormData('partner2Gender', e.target.value)}
                                    required
                                  >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="non-binary">Non-binary</option>
                                  </select>
                                </div>
                              </div>

                              <div className="form-row single-column">
                                <div className="form-group">
                                  <label>Race *</label>
                                  <input
                                    type="text"
                                    value={formData.partner2Race}
                                    onChange={(e) => updateFormData('partner2Race', e.target.value)}
                                    placeholder="e.g., Black, Asian, White"
                                    required
                                  />
                                </div>
                              </div>

                              <div className="form-row single-column">
                                <div className="form-group">
                                  <label>Ethnicity</label>
                                  <input
                                    type="text"
                                    value={formData.partner2Ethnicity}
                                    onChange={(e) => updateFormData('partner2Ethnicity', e.target.value)}
                                    placeholder="e.g., Nigerian, Japanese, Hispanic"
                                  />
                                </div>
                              </div>

                              <div className="form-row single-column">
                                <div className="form-group">
                                  <label>Height</label>
                                  <input
                                    type="text"
                                    value={formData.partner2Height}
                                    onChange={(e) => updateFormData('partner2Height', e.target.value)}
                                    placeholder="e.g., 6'2&quot;, 188cm, tall, short"
                                  />
                                </div>
                              </div>

                              {/* 👇 Age fields for Partner 2 */}
                              <div className="form-row">
                                <div className="form-group">
                                  <label>Age When You Met *</label>
                                  <input
                                    type="number"
                                    value={formData.partner2AgeWhenMet}
                                    onChange={(e) => updateFormData('partner2AgeWhenMet', e.target.value)}
                                    placeholder="e.g., 27"
                                    min="0"
                                    max="120"
                                    required
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Current Age *</label>
                                  <input
                                    type="number"
                                    value={formData.partner2CurrentAge}
                                    onChange={(e) => updateFormData('partner2CurrentAge', e.target.value)}
                                    placeholder="e.g., 32"
                                    min="0"
                                    max="120"
                                    required
                                  />
                                </div>
                              </div>
                            </div>


                            <div className="form-group">
                              <label>
                                <Calendar size={14} /> Meeting Date
                              </label>
                              <input
                                type="date"
                                value={formData.meetingDate}
                                onChange={(e) => updateFormData('meetingDate', e.target.value)}
                              />
                            </div>

                            <div className="form-group">
                              <label>
                                <MapPin size={14} /> Where You Met *
                              </label>
                              <input
                                type="text"
                                value={formData.meetingPlace}
                                onChange={(e) => updateFormData('meetingPlace', e.target.value)}
                                placeholder="Coffee shop, beach, college..."
                                required
                              />
                            </div>

                            <div className="form-group">
                              <label>
                                <MapPin size={14} /> Location (City, State, Country) *
                              </label>
                              <input
                                type="text"
                                value={formData.meetingGeography}
                                onChange={(e) => updateFormData('meetingGeography', e.target.value)}
                                placeholder="e.g., San Francisco, CA, USA"
                                required
                              />
                            </div>

                            <div className="form-group">
                              <label>Special Moments</label>
                              <textarea
                                value={formData.specialMoments}
                                onChange={(e) => updateFormData('specialMoments', e.target.value)}
                                placeholder="Focus on moments between just the two of you: first date, proposal, memorable trips together..."
                                rows={3}
                              />
                              <p className="field-note">
                                We'll keep the spotlight on your relationship. Only include other people if
                                they are truly central to the moment.
                              </p>
                            </div>

                            <div className="advanced-section">
                              <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="advanced-toggle"
                              >
                                <span className="advanced-toggle-content">
                                  <Sliders size={14} />
                                  <span>Advanced Settings</span>
                                </span>
                                {showAdvanced ? <Unlock size={14} /> : <Lock size={14} />}
                              </button>

                              {showAdvanced && (
                                <div className="advanced-content">
                                  <div className="form-group">
                                    <label>Negative Prompt</label>
                                    <textarea
                                      value={formData.negativePrompt}
                                      onChange={(e) => updateFormData('negativePrompt', e.target.value)}
                                      rows={2}
                                    />
                                  </div>

                                  <div className="form-group">
                                    <label>Custom Prompt</label>
                                    <textarea
                                      value={formData.customPrompt}
                                      onChange={(e) => updateFormData('customPrompt', e.target.value)}
                                      placeholder="Additional style instructions..."
                                      rows={2}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="photo-section">
                              <h4>Reference Photos (optional)</h4>
                              <p className="photo-help">
                                Upload photos so Omnia learns your faces for future personalization.
                              </p>
                              <div className="photo-grid">
                                <PhotoUploader
                                  label="Partner 1 Photos"
                                  name="partner1"
                                  onUpload={handlePhotoUpload}
                                  onRemove={handlePhotoRemove}
                                  disabled={uploadingCategory === 'partner1'}
                                  uploadedCount={uploadedPhotos.partner1?.length || 0}
                                  uploadedPhotos={uploadedPhotos.partner1 || []}
                                />
                                <PhotoUploader
                                  label="Partner 2 Photos"
                                  name="partner2"
                                  onUpload={handlePhotoUpload}
                                  onRemove={handlePhotoRemove}
                                  disabled={uploadingCategory === 'partner2'}
                                  uploadedCount={uploadedPhotos.partner2?.length || 0}
                                  uploadedPhotos={uploadedPhotos.partner2 || []}
                                />
                              </div>
                              {storyboardError && (
                                <div className="storyboard-error">{storyboardError}</div>
                              )}
                            </div>
                          </div>
                        )}

                        {step === 2 && (
                          <div className="form-section">
                            <div className="styles-grid">
                              {STORY_TEMPLATES.length > 0 && (
                                <div className="form-group">
                                  <label>Story Length</label>
                                  <select
                                    value={storyTemplate}
                                    onChange={(e) => setStoryTemplate(e.target.value)}
                                  >
                                    {STORY_TEMPLATES.map((tpl) => (
                                      <option key={tpl.id} value={tpl.id}>
                                        {tpl.name} ({tpl.duration})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>

                            {/* Voice Narration - Only show for Omnia model */}
                            {videoModel === 'omnia' && (
                              <div className="styles-grid" style={{ marginTop: 12 }}>
                                {ANIMATION_STYLES.map((style) => (
                                  <div
                                    key={style.id}
                                    onClick={() => setSelectedStyle(style.id)}
                                    className={`style-card-compact ${selectedStyle === style.id ? 'active' : ''}`}
                                  >
                                    <div className="style-thumbnail">
                                      <img src={style.thumbnail} alt={style.name} />
                                      {selectedStyle === style.id && (
                                        <div className="selected-badge">
                                          <Zap size={12} fill="currentColor" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="style-info-compact">
                                      <span className="style-name">{style.name}</span>
                                      <span className="style-desc">{style.description}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {step === 3 && (
                          <div className="form-section">
                            {/* Narration mode - only show for Omnia model */}
                            {videoModel === 'omnia' && (
                              <div className="form-group">
                                <label>Narration</label>
                                <select
                                  value={formData.voiceNarration}
                                  onChange={(e) => updateFormData('voiceNarration', e.target.value)}
                                >
                                  <option value="music-only">Music only</option>
                                  <option value="female">AI female voice</option>
                                  <option value="male">AI male voice</option>
                                  <option value="custom">Use my own voice</option>
                                </select>
                              </div>
                            )}

                            {/* Background Music - show for both models */}
                            <div className="form-group">
                              <label>
                                <Music size={14} /> Background Music
                              </label>
                              <select
                                value={formData.musicPreference}
                                onChange={(e) => updateFormData('musicPreference', e.target.value)}
                              >
                                <option>Romantic Piano</option>
                                <option>Upbeat & Joyful</option>
                                <option>Cinematic Orchestra</option>
                                <option>Acoustic Guitar</option>
                              </select>
                            </div>

                            {/* Custom narration UI - only for Omnia */}
                            {videoModel === 'omnia' && formData.voiceNarration === 'custom' && (
                              <>
                                {(activeVoiceId || customVoiceId) && !showVoiceRecorder ? (
                                  <VoicePreviewCard
                                    voiceId={activeVoiceId || customVoiceId}
                                    voiceName={activeVoice?.name || 'Your Voice'}
                                    previewUrl={activeVoice?.previewUrl || clonedVoicePreview}
                                    onChangeVoice={() => setShowVoiceRecorder(true)}
                                  />
                                ) : (
                                  <div className="voice-record-prompt">
                                    <div className="vrp-icon">
                                      <Mic size={24} />
                                    </div>
                                    <h4>Add Your Voice</h4>
                                    <p>
                                      Record yourself reading a sample text so we can use your voice for the narration.
                                    </p>
                                    <button
                                      type="button"
                                      className="vrp-record-btn"
                                      onClick={() => setShowVoiceRecorder(true)}
                                    >
                                      <Mic size={16} />
                                      Record Your Voice
                                    </button>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Seconds per scene selector */}
                            <div className="form-group">
                              <label>
                                Seconds per scene: <strong>{sceneDurationSeconds}s</strong>
                                <span style={{ fontSize: '12px', color: '#999', marginLeft: '8px' }}>
                                  (10s max for single clip, longer uses multi-clip)
                                </span>
                              </label>
                              <input
                                type="range"
                                min="10"
                                max="60"
                                step="5"
                                value={sceneDurationSeconds}
                                onChange={(e) => setSceneDurationSeconds(Number(e.target.value))}
                                style={{
                                  width: '100%',
                                  accentColor: '#ff6b9d'
                                }}
                              />
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                color: '#666',
                                marginTop: '4px'
                              }}>
                                <span>10s</span>
                                <span>35s</span>
                                <span>60s</span>
                              </div>
                            </div>

                            {/* Estimate box now uses estimatedSceneCount + sceneDurationSeconds */}
                            <div className="estimate-box">
                              <h4>Generation Estimate</h4>
                              <div className="estimate-row">
                                <span>Scenes:</span>
                                <strong>{storyboard.length || estimatedSceneCount || '—'}</strong>
                              </div>
                              <div className="estimate-row">
                                <span>Duration:</span>
                                <strong>{selectedTemplate?.duration || 'Custom'}</strong>
                              </div>
                              <div className="estimate-row">
                                <span>Seconds per scene:</span>
                                <strong>{sceneDurationSeconds}s</strong>
                              </div>
                              <div className="estimate-row">
                                <span>Image Processing:</span>
                                <strong>~2 min per scene</strong>
                              </div>
                              <div className="estimate-row">
                                <span>Video Processing:</span>
                                <strong>~3 min per scene (after approval)</strong>
                              </div>
                            </div>
                          </div>
                        )}

                        {step === 4 && (
                          <div className="form-section editor-sidebar-full">
                            {/* Media Tabs */}
                            <div className="editor-media-tabs">
                              <button className="editor-tab-btn active">
                                <Film size={18} />
                                <span>Video</span>
                              </button>
                              <button className="editor-tab-btn" disabled>
                                <Music size={18} />
                                <span>Audio</span>
                              </button>
                            </div>

                            {/* Video Editing Tools */}
                            <div className="editor-tools-section">
                              <h4 className="editor-tools-heading">Video</h4>
                              <div className="editor-tools-grid">
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Crop size={20} />
                                  <span>Crop</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Scissors size={20} />
                                  <span>Trim</span>
                                </button>
                                <button
                                  className={`editor-tool-card ${activeEditorTool === 'speed' ? 'active' : ''}`}
                                  onClick={() => setActiveEditorTool(activeEditorTool === 'speed' ? null : 'speed')}
                                  title="Adjust playback speed"
                                >
                                  <Gauge size={20} />
                                  <span>Speed</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Layers size={20} />
                                  <span>Opacity</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Sparkles size={20} />
                                  <span>Green screen</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <MicOff size={20} />
                                  <span>Vocal remover</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Volume2 size={20} />
                                  <span>Reduce noise</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Eraser size={20} />
                                  <span>Remove Logo</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <RotateCw size={20} />
                                  <span>Rotate</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <FlipHorizontal size={20} />
                                  <span>Flip</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Sun size={20} />
                                  <span>Brightness</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Circle size={20} />
                                  <span>Contrast</span>
                                </button>
                              </div>

                              {/* Speed Control Panel */}
                              {activeEditorTool === 'speed' && (
                                <div className="editor-control-panel">
                                  <div className="control-panel-header">
                                    <h5>Playback Speed</h5>
                                    <button
                                      className="control-panel-close"
                                      onClick={() => setActiveEditorTool(null)}
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>

                                  <div className="speed-presets">
                                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                                      <button
                                        key={speed}
                                        className={`speed-preset-btn ${playbackSpeed === speed ? 'active' : ''}`}
                                        onClick={() => {
                                          setPlaybackSpeed(speed);
                                          if (editorVideoRef.current) {
                                            editorVideoRef.current.playbackRate = speed;
                                          }
                                        }}
                                      >
                                        {speed}x
                                      </button>
                                    ))}
                                  </div>

                                  <div className="speed-slider-container">
                                    <label>Custom Speed: {playbackSpeed.toFixed(2)}x</label>
                                    <input
                                      type="range"
                                      min="0.25"
                                      max="2"
                                      step="0.05"
                                      value={playbackSpeed}
                                      onChange={(e) => {
                                        const speed = parseFloat(e.target.value);
                                        setPlaybackSpeed(speed);
                                        if (editorVideoRef.current) {
                                          editorVideoRef.current.playbackRate = speed;
                                        }
                                      }}
                                      className="speed-slider"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Text Tools */}
                            <div className="editor-tools-section">
                              <h4 className="editor-tools-heading">Text</h4>
                              <div className="editor-tools-grid">
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Type size={20} />
                                  <span>Add Text</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <MessageSquare size={20} />
                                  <span>Subtitles</span>
                                </button>
                              </div>
                            </div>

                            {/* Audio Tools */}
                            <div className="editor-tools-section">
                              <h4 className="editor-tools-heading">Audio & Music</h4>
                              <div className="editor-tools-grid">
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Music size={20} />
                                  <span>Add Music</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <Volume2 size={20} />
                                  <span>Volume</span>
                                </button>
                                <button className="editor-tool-card" title="Coming soon" disabled>
                                  <TrendingUp size={20} />
                                  <span>Fade</span>
                                </button>
                              </div>
                            </div>

                            {/* Music Library - Selection UI */}
                            <div className="editor-tools-section">
                              <h4 className="editor-tools-heading">Background Music</h4>
                              <div className="music-library">
                                {generatingMusic ? (
                                  <div className="music-loading">
                                    <Loader size={20} className="spinning" />
                                    <span>Generating tracks...</span>
                                  </div>
                                ) : generatedMusicTracks.length > 0 ? (
                                  <>
                                    {generatedMusicTracks.map(track => (
                                      <div
                                        key={track.style}
                                        className={`music-track-item ${selectedMusicStyle === track.style ? 'selected' : ''}`}
                                        onClick={() => {
                                          setSelectedMusicStyle(track.style);
                                          setGeneratedMusicUrl(track.url);
                                        }}
                                        title={`Use ${track.name}`}
                                      >
                                        <div className="music-icon">
                                          {selectedMusicStyle === track.style ? (
                                            <Check size={16} />
                                          ) : (
                                            <Music size={16} />
                                          )}
                                        </div>
                                        <div className="music-info">
                                          <div className="music-name">{track.name}</div>
                                          <div className="music-duration">
                                            {selectedMusicStyle === track.style ? 'Playing' : 'Click to use'}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    <div className="music-generated-result">
                                      <div style={{ fontSize: '12px', color: '#fff', opacity: 0.7 }}>
                                        ✅ {generatedMusicTracks.length} tracks ready
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <div className="music-empty">
                                    <Music size={24} style={{ opacity: 0.5 }} />
                                    <span>Music will be generated with videos</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="sidebar-footer">
                        {error && <div className="error-banner">{error}</div>}

                        {generating && progress.total > 0 && (
                          <div className="progress-details">
                            <div className="progress-bar-full">
                              <div
                                className="progress-fill"
                                style={{
                                  width: progress.total > 0
                                    ? `${(progress.current / progress.total) * 100}%`
                                    : '0%',
                                }}
                              />
                            </div>
                            <div className="progress-text">
                              <div className="progress-main">
                                {progress.current < progress.total ? (
                                  <>
                                    Generating scene {progress.current + 1}/{progress.total}
                                    {progress.currentScene && typeof progress.currentScene === 'string' && (
                                      <span className="current-scene-name"> – {progress.currentScene}</span>
                                    )}
                                  </>
                                ) : (
                                  <>Finishing up...</>
                                )}
                              </div>
                              <div className="progress-subtext">
                                {progress.current === 0
                                  ? 'Starting image generation...'
                                  : `${progress.current} of ${progress.total} scenes complete`
                                }
                              </div>
                              <div className="progress-eta">
                                ~{Math.max(1, (progress.total - progress.current) * 2)} min remaining
                              </div>
                            </div>
                          </div>
                        )}

                        {generatingVideos && (
                          <div className="progress-details">
                            <div className="progress-bar-full">
                              <div
                                className="progress-fill"
                                style={{
                                  width: progress.total > 0
                                    ? `${(progress.current / progress.total) * 100}%`
                                    : '0%'
                                }}
                              />
                            </div>
                            <div className="progress-text">
                              <div className="progress-main">
                                {progress.current < progress.total ? (
                                  <>
                                    Generating video {progress.current + 1}/{progress.total}
                                    {progress.currentScene && ` - ${progress.currentScene}`}
                                  </>
                                ) : (
                                  <>Finishing up...</>
                                )}
                              </div>
                              <div className="progress-subtext">
                                This takes 2-3 minutes per scene...
                              </div>
                            </div>
                          </div>
                        )}

                        {generatedImages.length > 0 && !imagesApproved && !generating && (
                          <button
                            className="approve-btn"
                            onClick={() => setImagesApproved(true)}
                          >
                            <CheckCircle size={18} />
                            Approve Images & Continue
                          </button>
                        )}

                        {imagesApproved && !videoResult && (
                          <>
                            {!hasEnoughCredits(generatedImages.length * CREDIT_COSTS.VIDEO_GENERATION) && (
                              <div className="credit-warning">
                                <AlertCircle size={16} />
                                <span>
                                  You need {generatedImages.length * CREDIT_COSTS.VIDEO_GENERATION} credits but only have {credits}.
                                  <button onClick={() => setShowUpgradeModal(true)}>Get more credits</button>
                                </span>
                              </div>
                            )}
                            <button
                              className="generate-btn"
                              onClick={handleGenerateComfyVideos}
                              disabled={generatingVideos || !hasEnoughCredits(generatedImages.length * CREDIT_COSTS.VIDEO_GENERATION)}
                            >
                              {generatingVideos ? (
                                <>
                                  <Loader className="spinning" size={18} />
                                  Generating Videos...
                                </>
                              ) : (
                                <>
                                  <Film size={18} />
                                  Generate Videos ({generatedImages.length * CREDIT_COSTS.VIDEO_GENERATION} credits)
                                </>
                              )}
                            </button>
                          </>
                        )}

                        {!imagesApproved && (
                          <button
                            className="generate-btn"
                            onClick={step === 3 ? handleGenerateImages : handleNextStep}
                            disabled={generating || generatingVideos || (step === 1 && storyboardLoading)}
                          >
                            {generating ? (
                              <>
                                <Loader className="spinning" size={18} />
                                {progress.current > 0
                                  ? `Creating... ${progress.current}/${progress.total}`
                                  : 'Starting...'
                                }
                              </>
                            ) : step === 3 ? (
                              <>Generate Scene Images</>
                            ) : storyboardLoading ? (
                              <>Preparing your storyboard...</>
                            ) : (
                              'Continue'
                            )}
                          </button>
                        )}

                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                          {step > 1 && !generating && !generatingVideos && (
                            <button
                              className="back-btn"
                              onClick={() => setStep(step - 1)}
                              style={{ flex: 1 }}
                            >
                              Back
                            </button>
                          )}

                          {/* Regenerate Failed Videos - show in sidebar next to Back when failures exist */}
                          {step === 3 && videoResult?.videos?.some(v => !v.success) && !generatingVideos && !generating && (
                            <button
                              className="generate-btn"
                              onClick={handleGenerateComfyVideos}
                              style={{ flex: 1, marginTop: 0 }}
                            >
                              <RefreshCw size={16} />
                              Regenerate Failed
                            </button>
                          )}

                          {/* Only show on step 3 after videos are generated */}
                          {step === 3 && videoResult && videoResult.videos && videoResult.videos.filter(v => v.success).length > 0 && !generatingVideos && !generating && (
                            <button
                              className="generate-btn"
                              onClick={() => setStep(4)}
                              style={{ flex: 1, marginTop: 0 }}
                            >
                              <Scissors size={16} />
                              Next: Editor
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Main Content */}
                <div className="main-content">
                  <div className="main-header">
                    <div className="header-left">
                      <div className="project-selector">
                        {editingProjectName ? (
                          <div className="project-name-editor">
                            <input
                              type="text"
                              value={tempProjectName}
                              onChange={(e) => setTempProjectName(e.target.value)}
                              onBlur={handleProjectNameSave} // Save on click away
                              onKeyDown={(e) => e.key === 'Enter' && handleProjectNameSave()}
                              autoFocus
                              className="project-name-input" // Add styling class
                            />
                            {/* Buttons removed for cleaner UX - just Enter or Click away to save */}
                          </div>
                        ) : (
                          <div
                            className="project-name-display flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors"
                            onClick={() => {
                              setEditingProjectName(true);
                              setTempProjectName(currentProject?.name || 'Untitled');
                            }}
                          >
                            <span className="project-name text-white font-medium">
                              {currentProject?.name || 'Untitled'}
                            </span>
                            <Edit2 size={12} className="text-zinc-500" />
                          </div>
                        )}
                        {/* Only show dropdown chevron if you actually have multiple projects implemented */}
                        {/* <ChevronDown size={16} className="dropdown-arrow ml-2" /> */}
                      </div>
                    </div>
                    <div className="header-right">
                      <button className="header-btn" onClick={() => navigate('/projects')}>
                        <History size={16} />
                        View History
                      </button>
                      <div className="credits-badge">
                        <span className="credit-icon">
                          <Sparkles size={14} />
                        </span>
                        <span>
                          {creditsLoading ? '...' : `${credits ?? 0} credits`}
                        </span>
                      </div>
                      <button className="upgrade-btn" onClick={() => setShowUpgradeModal(true)}>
                        Upgrade
                      </button>
                      {user && <UserMenu
                        user={user}
                        onNavigate={handleNavigate}
                      />}
                    </div>
                  </div>

                  <div className="main-body">
                    {/* Prompt Editor Modal */}
                    {editingScenePrompt !== null && (
                      <div className="modal-overlay" onClick={() => setEditingScenePrompt(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                          <div className="modal-header">
                            <h3>Edit Scene Prompt</h3>
                            <button onClick={() => setEditingScenePrompt(null)} className="modal-close">
                              <X size={20} />
                            </button>
                          </div>
                          <div className="modal-body">
                            <label>Custom Prompt for Scene {editingScenePrompt + 1}</label>
                            <textarea
                              value={tempScenePrompt}
                              onChange={(e) => setTempScenePrompt(e.target.value)}
                              rows={6}
                              placeholder="Enter custom prompt details..."
                            />
                          </div>
                          <div className="modal-footer">
                            <button onClick={() => setEditingScenePrompt(null)} className="cancel-btn">
                              Cancel
                            </button>
                            <button onClick={handleSaveScenePrompt} className="save-btn">
                              <RefreshCw size={16} />
                              Regenerate with New Prompt
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* === STEP 2: STORYBOARD PREVIEW === */}
                    {step === 2 && storyboard.length > 0 && (
                      <div className="gallery">
                        <div className="gallery-header">
                          <div className="gallery-header-left">
                            <h3>Review Your Storyboard</h3>
                            <div className="status-badge success">
                              {storyboard.length} Scenes Generated
                            </div>
                          </div>
                        </div>

                        <div className="gallery-grid">
                          {storyboard.map((scene, idx) => (
                            <div key={idx} className="gallery-item">
                              <div className="scene-placeholder">
                                <img
                                  src="/clapperboard.png"
                                  alt="Scene Placeholder"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '20px', opacity: 0.6 }}
                                />
                              </div>
                              <div className="scene-content">
                                <p className="scene-number">Scene {idx + 1}</p>
                                <p className="scene-description">{scene.title}</p>
                                <p className="scene-metadata">{scene.description}</p>
                                {scene.narration && (
                                  <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                    <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '2px' }}>Narration:</p>
                                    <p style={{ fontSize: '12px', fontStyle: 'italic' }}>"{scene.narration}"</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Generated Scenes Area - ONLY SHOW ON STEP 3 */}
                    {step === 3 && (generatedImages.length > 0 || generating) && (
                      <div className="gallery">
                        <div className="gallery-header">
                          <div className="gallery-header-left">
                            <h3>Your Love Story Scenes</h3>

                            {/* Status Badges - Only show if NOT generating videos */}
                            {generatedImages.length > 0 && !imagesApproved && !generatingVideos && (
                              <div className="status-badge warning">
                                Review and approve images before generating videos
                              </div>
                            )}
                            {imagesApproved && !generatingVideos && (
                              <div className="status-badge success">
                                Images approved
                              </div>
                            )}
                          </div>

                          {/* Search/Filter Controls - Hide these while Duck is swimming */}
                          {!generatingVideos && (generatedImages.length > 0 || storyboard.length > 0) && (
                            <div className="scene-controls">
                              <div className="search-box">
                                <Search size={16} />
                                <input
                                  type="text"
                                  placeholder="Search scenes..."
                                  value={sceneSearchQuery}
                                  onChange={(e) => setSceneSearchQuery(e.target.value)}
                                />
                                {sceneSearchQuery && (
                                  <button className="clear-search" onClick={clearSearch}>
                                    <X size={14} />
                                  </button>
                                )}
                              </div>

                              <div className="filter-dropdown">
                                <button
                                  className={`filter-btn ${activeFilter !== 'all' ? 'active' : ''}`}
                                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                                >
                                  <Filter size={16} />
                                  {activeFilter === 'all' ? 'Filter' : activeFilter}
                                  <ChevronDown size={14} />
                                </button>

                                {showFilterMenu && (
                                  <div className="filter-menu">
                                    {FILTER_OPTIONS.map(option => (
                                      <button
                                        key={option.id}
                                        className={`filter-option ${activeFilter === option.id ? 'active' : ''}`}
                                        onClick={() => {
                                          setActiveFilter(option.id);
                                          setShowFilterMenu(false);
                                        }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {sceneSearchQuery && filteredScenes.length === 0 && !generatingVideos && (
                          <div className="no-results">
                            <Search size={32} />
                            <p>No scenes match "{sceneSearchQuery}"</p>
                            <button onClick={clearSearch} className="clear-filters-btn">
                              Clear search
                            </button>
                          </div>
                        )}

                        {/* Show Gallery Grid with progress bars for both image and video generation */}
                        <div className="gallery-grid">
                          {generating && generatedImages.length === 0 ? (
                            // Skeleton Loader (while generating IMAGES)
                            [...Array(storyboard.length || 8)].map((_, idx) => (
                              <div key={idx} className="gallery-item skeleton-loader">
                                <div className="skeleton-image"></div>
                                <div className="skeleton-text"></div>
                                <div className="skeleton-text short"></div>
                              </div>
                            ))
                          ) : generatingVideos ? (
                            // Show scenes with progress bars while generating VIDEOS
                            generatedImages.map((item, idx) => {
                              const sceneIndex = item.index ?? idx;
                              const isCompleted = progress.current > sceneIndex;
                              const isInProgress = progress.current === sceneIndex;
                              const isPending = progress.current < sceneIndex;

                              const hasFrames = item.frames && item.frames.length > 0;
                              const displayFrames = hasFrames
                                ? item.frames.filter(f => f.success && (f.imageUrl || f.image))
                                : item.image ? [{ imageUrl: item.image }] : [];
                              const hasImages = displayFrames.length > 0;

                              return (
                                <div key={sceneIndex} className="gallery-item">
                                  <div className="scene-image-wrapper">
                                    {hasImages ? (
                                      <div className="scene-frames-carousel">
                                        <div className="frame-slide">
                                          <img
                                            src={displayFrames[0].imageUrl || displayFrames[0].image}
                                            alt={`Scene ${sceneIndex + 1}`}
                                            crossOrigin="anonymous"
                                            style={{ opacity: isPending ? 0.5 : 1 }}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="scene-placeholder">
                                        <Film size={32} />
                                      </div>
                                    )}
                                    {/* Progress indicator overlay */}
                                    {isInProgress && (
                                      <div className="video-gen-overlay">
                                        <Loader className="spinning" size={24} />
                                        <span>Generating...</span>
                                      </div>
                                    )}
                                    {isCompleted && (
                                      <div className="video-gen-complete">
                                        <CheckCircle size={20} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="scene-content">
                                    <p className="scene-number">Scene {sceneIndex + 1}</p>
                                    <p className="scene-description">{item.title || item.scene}</p>
                                    {/* Pink progress bar */}
                                    <div className="scene-progress-bar">
                                      <div
                                        className={`scene-progress-fill ${isCompleted ? 'completed' : isInProgress ? 'in-progress' : ''}`}
                                        style={{
                                          width: isCompleted ? '100%' : isInProgress ? '50%' : '0%'
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            // Actual Images (normal view)
                            filteredScenes.map((item, idx) => {
                              const sceneIndex = item.index ?? idx;
                              // Support both single image and multi-frame formats
                              const hasFrames = item.frames && item.frames.length > 0;
                              const displayFrames = hasFrames
                                ? item.frames.filter(f => f.success && (f.imageUrl || f.image))
                                : item.image ? [{ imageUrl: item.image, type: 'single', name: 'Scene' }] : [];

                              // Debug logging
                              if (idx === 0) {
                                console.log(`🎥 Scene ${sceneIndex + 1} render:`, {
                                  hasFrames,
                                  framesCount: item.frames?.length,
                                  displayFramesCount: displayFrames.length,
                                  frames: item.frames,
                                });
                              }
                              const hasImages = displayFrames.length > 0;

                              return (
                                <div key={sceneIndex} className="gallery-item">
                                  <div className="scene-image-wrapper">
                                    {hasImages ? (
                                      <div
                                        className={`scene-frames-carousel ${displayFrames.length > 1 ? 'multi-frame' : ''}`}
                                        data-scene={sceneIndex}
                                        onScroll={(e) => {
                                          if (displayFrames.length <= 1) return;
                                          const carousel = e.currentTarget;
                                          const scrollLeft = carousel.scrollLeft;
                                          const frameWidth = carousel.offsetWidth;
                                          const activeIndex = Math.round(scrollLeft / frameWidth);
                                          // Update active indicator
                                          const indicators = carousel.parentElement.querySelectorAll(`.carousel-indicators[data-scene="${sceneIndex}"] .indicator-dot`);
                                          indicators.forEach((dot, i) => {
                                            dot.classList.toggle('active', i === activeIndex);
                                          });
                                        }}
                                      >
                                        {displayFrames.map((frame, frameIdx) => (
                                          <div key={frameIdx} className="frame-slide">
                                            <img
                                              src={frame.imageUrl || frame.image}
                                              alt={`Scene ${sceneIndex + 1} - Frame ${frameIdx + 1}`}
                                              crossOrigin="anonymous"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="scene-placeholder">
                                        <Film size={32} />
                                      </div>
                                    )}
                                    {displayFrames.length > 1 && (
                                      <div className="carousel-indicators" data-scene={sceneIndex}>
                                        {displayFrames.map((_, i) => (
                                          <span key={i} className={`indicator-dot ${i === 0 ? 'active' : ''}`} />
                                        ))}
                                      </div>
                                    )}

                                    {hasImages && (
                                      <div className="scene-actions">
                                        <button
                                          className="scene-action-btn"
                                          onClick={() => handleOpenEditPrompt(sceneIndex)}
                                          disabled={regeneratingScene === sceneIndex}
                                          title="Edit prompt"
                                        >
                                          <Edit2 size={16} />
                                        </button>
                                        <button
                                          className="scene-action-btn"
                                          onClick={() => handleRegenerateScene(sceneIndex)}
                                          disabled={regeneratingScene === sceneIndex}
                                          title="Regenerate scene"
                                        >
                                          {regeneratingScene === sceneIndex ? (
                                            <RefreshCw size={16} className="spinning" />
                                          ) : (
                                            <RefreshCw size={16} />
                                          )}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="scene-content">
                                    <p className="scene-number">Scene {sceneIndex + 1}{hasFrames && displayFrames.length > 1 ? ` (${displayFrames.length} frames)` : ''}</p>
                                    <p className="scene-description">{item.title || item.scene}</p>
                                    {item.description && (
                                      <p className="scene-metadata">{item.description}</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )
                          }
                        </div>

                        {videoResult?.videos?.length > 0 && (
                          <div className="video-gallery" style={{ marginTop: 16 }}>
                            <h3 style={{ color: "white" }}>Generated Videos</h3>

                            <div className="gallery-grid">
                              {videoResult.videos.map((v) => (
                                <div key={v.index} className="gallery-item">
                                  <div className="scene-image-wrapper">
                                    {v.url ? (
                                      <video
                                        src={`${normalizeMediaUrl(v.url)}#t=0.5`}
                                        poster={generatedImages.find(img => (img.index ?? generatedImages.indexOf(img)) === v.index)?.image}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        onError={(e) => {
                                          const video = e.currentTarget;
                                          const retryCount = parseInt(video.dataset.retryCount || '0');

                                          if (retryCount < 3) {
                                            console.log(`Retrying video ${v.index}, attempt ${retryCount + 1}`);
                                            video.dataset.retryCount = (retryCount + 1).toString();

                                            // Wait a bit then retry
                                            setTimeout(() => {
                                              video.load();
                                            }, 1000 * (retryCount + 1));
                                          } else {
                                            console.log("VIDEO ERROR", v.index, v.url, e?.currentTarget?.error);
                                          }
                                        }}
                                        onLoadedMetadata={() => console.log("LOADED", v.index)}
                                        className="scene-video"
                                      />
                                    ) : (
                                      <div className="scene-placeholder">
                                        <Film size={32} />
                                      </div>
                                    )}
                                  </div>

                                  <div className="scene-content">
                                    <p className="scene-number">Scene {v.index}</p>
                                    <p className="scene-description">{v.title}</p>
                                    {!v.success && <p className="scene-metadata">{v.error}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Regenerate button moved to sidebar */}
                          </div>
                        )}

                      </div>
                    )}

                    {/* === STEP 4: VIDEO EDITOR === */}
                    {step === 4 && videoResult?.videos?.length > 0 && (() => {
                      const successVideos = reorderedVideos || [INTRO_VIDEO_CLIP, ...getBaseSuccessVideos()];
                      const selected = successVideos[editorSelectedScene] || successVideos[0];
                      return (
                        <div className="editor-page-content">
                          {/* Export button at top right */}
                          <div className="editor-header">
                            <h2>Video Editor</h2>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {combinedVideoUrl && (
                                <button
                                  className="editor-export-btn"
                                  onClick={() => setShowExportModal(true)}
                                  style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                >
                                  <Check size={16} /> View Export
                                </button>
                              )}
                              <button
                                className="editor-export-btn"
                                onClick={handleCombineVideos}
                                disabled={combining}
                              >
                                {combining ? (
                                  <><Loader className="spinning" size={16} /> Combining...</>
                                ) : (
                                  <><Download size={18} /> Export</>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Main video player with speed controls */}
                          {/* Video Stage (Player + Controls) */}
                          <div className="editor-stage">
                            <div className="editor-player">
                              <VideoPlayer
                                src={selected ? normalizeMediaUrl(selected.url) : ''}
                                playing={editorPlaying}
                                seekTo={seekTarget}
                                onTimeUpdate={handleEditorTimeUpdate}
                                onDurationChange={handleEditorDurationChange}
                                onEnded={() => {
                                  // Continuous playback logic - use functional update to avoid stale closure
                                  const totalVideos = (reorderedVideos || successVideos).length;
                                  setEditorSelectedScene(prev => {
                                    if (prev < totalVideos - 1) {
                                      return prev + 1; // Advance to next video, keep playing
                                    } else {
                                      setEditorPlaying(false); // Stop at the very end
                                      return prev;
                                    }
                                  });
                                }}
                                onPlay={() => setEditorPlaying(true)}
                                onPause={() => setEditorPlaying(false)}
                                onReady={(player) => {
                                  editorVideoRef.current = player;
                                }}
                                playbackRate={playbackSpeed}
                              />
                            </div>

                            {/* Editor Tabs */}
                            <div className="editor-tabs">
                              <button
                                className={`editor-tab-btn ${editorTab === 'video' ? 'active' : ''}`}
                                onClick={() => setEditorTab('video')}
                              >
                                Video
                              </button>
                              <button
                                className={`editor-tab-btn ${editorTab === 'audio' ? 'active' : ''}`}
                                onClick={() => setEditorTab('audio')}
                              >
                                Audio
                              </button>
                            </div>

                            {/* Controls Panel */}
                            <div className="editor-controls-panel">
                              {editorTab === 'video' ? (
                                <TimelineControls
                                  isPlaying={editorPlaying}
                                  onPlayPause={handleEditorPlayPause}
                                  currentTime={editorCurrentTime}
                                  duration={editorDuration}
                                  onSeek={handleEditorSeek}
                                  zoom={timelineZoom}
                                  onZoomChange={handleTimelineZoomChange}
                                  onFit={handleTimelineFit}
                                  // Pass speed to controls if it supports it, or render separate speed control here if not
                                  playbackSpeed={playbackSpeed}
                                  onPlaybackSpeedChange={setPlaybackSpeed}
                                />
                              ) : (
                                <div className="audio-controls-panel">
                                  <div className="control-group">
                                    <button className="icon-btn-text" onClick={() => {/* TODO: Implement Detach */ }}>
                                      <Scissors size={14} /> Detach Audio
                                    </button>
                                  </div>
                                  <div className="control-group">
                                    <label><Volume2 size={14} /> Music Volume: {Math.round(musicVolume * 100)}%</label>
                                    <input type="range" min="0" max="100" value={Math.round(musicVolume * 100)} onChange={(e) => setMusicVolume(parseInt(e.target.value) / 100)} style={{ accentColor: '#8b5cf6' }} />
                                  </div>
                                  <div className="control-group">
                                    <label><Activity size={14} /> Trim</label>
                                    <div className="trim-inputs">
                                      <input type="text" placeholder="Start" defaultValue="00:00" />
                                      <span>-</span>
                                      <input type="text" placeholder="End" defaultValue="00:10" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* New Advanced Timeline - NOW INSIDE STAGE */}
                            <div className="editor-timeline">
                              <div className="timeline-label">Video Scenes ({editorTab === 'video' ? 'Drag to Reorder' : 'Sync View'})</div>
                              <AdvancedTimeline
                                videos={reorderedVideos || successVideos}
                                zoom={timelineZoom}
                                currentTime={editorCurrentTime}
                                onSeek={handleEditorSeek}
                                selectedIndex={editorSelectedScene}
                                onSelect={setEditorSelectedScene}
                                onReorder={handleReorder}
                                audioTrack={generatedMusicUrl ? {
                                  url: generatedMusicUrl,
                                  name: musicStyles.find(s => s.key === selectedMusicStyle)?.name || 'Background Music',
                                  offset: introDuration // Pass offset to timeline
                                } : null}
                              />
                            </div>

                            {/* Music/Audio Overlay - Show global music track with volume control */}
                            <div className="editor-audio-timeline">
                              <div className="audio-timeline-header">
                                <h4 style={{ margin: 0, fontSize: 13, color: '#aaa' }}>Audio Track</h4>
                              </div>
                              <div className="audio-track-container">
                                {generatedMusicUrl ? (
                                  <div className="audio-track" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div className="audio-icon"><Music size={16} /></div>
                                    <div className="audio-waveform" style={{ flex: 1 }}></div>
                                    <div className="audio-track-name" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                                      {musicStyles.find(s => s.key === selectedMusicStyle)?.name || 'Background Music'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
                                      <Volume2 size={14} style={{ color: '#aaa', flexShrink: 0 }} />
                                      <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(musicVolume * 100)}
                                        onChange={(e) => setMusicVolume(parseInt(e.target.value) / 100)}
                                        style={{ width: 80, accentColor: '#8b5cf6' }}
                                        title={`Volume: ${Math.round(musicVolume * 100)}%`}
                                      />
                                      <span style={{ fontSize: 11, color: '#888', minWidth: 28 }}>{Math.round(musicVolume * 100)}%</span>
                                    </div>
                                  </div>
                                ) : selected.narration || selected.narrationUrl || selected.musicUrl ? (
                                  <div className="audio-track">
                                    <div className="audio-icon"><Music size={16} /></div>
                                    <div className="audio-waveform"></div>
                                    <div className="audio-track-name">
                                      {selected.narration ? "Narration + Music" : "Generated Audio"}
                                    </div>
                                  </div>
                                ) : generatingMusic ? (
                                  <div className="audio-track-empty" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Loader size={16} className="spinning" />
                                    <span>Generating background music...</span>
                                  </div>
                                ) : (
                                  <div className="audio-track-empty">
                                    <Music size={16} />
                                    <span>No audio generated yet</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Storyboard Preview - ONLY SHOW ON STEP 3 */}
                    {step === 3 && !generatedImages.length && !generating && storyboard.length > 0 && (
                      <div className="storyboard-preview">
                        <div className="storyboard-header">
                          <div>
                            <h3>Storyboard Preview</h3>
                            <p className="storyboard-intro">
                              Review the scenes Omnia created from your story before generating visuals.
                            </p>
                          </div>

                          {storyboard.length > 0 && (
                            <div className="scene-controls">
                              <div className="search-box">
                                <Search size={16} />
                                <input
                                  type="text"
                                  placeholder="Search scenes..."
                                  value={sceneSearchQuery}
                                  onChange={(e) => setSceneSearchQuery(e.target.value)}
                                />
                                {sceneSearchQuery && (
                                  <button className="clear-search" onClick={clearSearch}>
                                    <X size={14} />
                                  </button>
                                )}
                              </div>

                              <div className="filter-dropdown">
                                <button
                                  className={`filter-btn ${activeFilter !== 'all' ? 'active' : ''}`}
                                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                                >
                                  <Filter size={16} />
                                  {activeFilter === 'all' ? 'Filter' : activeFilter}
                                  <ChevronDown size={14} />
                                </button>

                                {showFilterMenu && (
                                  <div className="filter-menu">
                                    {FILTER_OPTIONS.map(option => (
                                      <button
                                        key={option.id}
                                        className={`filter-option ${activeFilter === option.id ? 'active' : ''}`}
                                        onClick={() => {
                                          setActiveFilter(option.id);
                                          setShowFilterMenu(false);
                                        }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <ol className="storyboard-list">
                          {filteredScenes.map((scene, idx) => {
                            const key = scene.index ?? idx;
                            return (
                              <li key={key}>
                                <h4>{scene.title}</h4>
                                <p>{scene.description}</p>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}

                    {/* Hero Section */}
                    {!storyboard.length && !generating && (
                      <div className="hero">
                        <div className="hero-content">
                          <h1 className="hero-title gradient-heading">
                            Your Love Story
                            <br />
                            Deserves a Pixar Movie
                          </h1>
                          <p>
                            Create stunning animated movies of your love story. Perfect for weddings,
                            anniversaries, and special celebrations.
                          </p>

                          <div className="hero-styles">
                            {ANIMATION_STYLES.map((style) => (
                              <div
                                key={style.id}
                                className={`hero-style-card ${selectedStyle === style.id ? 'active' : ''
                                  }`}
                                onClick={() => {
                                  setSelectedStyle(style.id);
                                }}
                              >
                                <div className="hero-style-preview">
                                  <img src={style.thumbnail} alt={style.name} />
                                  <div className="play-overlay">
                                    <Play
                                      size={32}
                                      fill="rgba(255,255,255,0.9)"
                                      color="rgba(255,255,255,0.9)"
                                    />
                                  </div>
                                </div>
                                <div className="hero-style-info">
                                  <h4>{style.name}</h4>
                                  <p>{style.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )
            }
            {/* Voice Recorder Modal */}
            {
              showVoiceRecorder && (
                <div className="modal-overlay" onClick={() => setShowVoiceRecorder(false)}>
                  <div className="modal-content voice-modal" onClick={(e) => e.stopPropagation()}>
                    <VoiceRecorder
                      onVoiceReady={handleVoiceReady}
                      onCancel={() => setShowVoiceRecorder(false)}
                    />
                  </div>
                </div>
              )
            }



            {
              showUpgradeModal && (
                <UpgradeModal
                  user={user}
                  currentCredits={credits}
                  onClose={() => setShowUpgradeModal(false)}
                  onPurchaseComplete={() => {
                    setShowUpgradeModal(false);
                  }}
                />
              )
            }

            {
              showEstimateModal && (
                <GenerationEstimate
                  sceneCount={storyboard.length}
                  estimatedDuration={storyboard.length * sceneDurationSeconds}
                  onConfirm={confirmGeneration}
                  onCancel={() => setShowEstimateModal(false)}
                  user={user}
                />
              )
            }
          </div >
        }
      />
      {/* PROJECTS PAGE */}
      <Route
        path="/projects"
        element={
          <ProjectsPage
            user={user}
            onClose={() => navigate('/')}
            onSelectProject={(project) => {
              setCurrentProjectId(project.id);
              navigate('/');
            }}
          />
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes >
  );
}

export default App;