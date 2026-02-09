// src/hooks/useUserProfile.js
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Hook to manage user profile data in Firestore
 * Stores: voice clones, preferences, settings
 */
export default function useUserProfile(user) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to profile changes in real-time
  useEffect(() => {
    if (!user?.uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const profileRef = doc(db, 'userProfiles', user.uid);

    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile({ id: snapshot.id, ...snapshot.data() });
        } else {
          // Create default profile if it doesn't exist
          createDefaultProfile(user);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching profile:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Create default profile for new users
  const createDefaultProfile = async (user) => {
    if (!user?.uid) return;

    try {
      const profileRef = doc(db, 'userProfiles', user.uid);
      const defaultProfile = {
        email: user.email || '',
        displayName: user.displayName || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        
        // Voice settings
        voiceClones: [], // Array of cloned voices
        activeVoiceId: null,
        
        // Preferences
        preferences: {
          defaultNarration: 'music-only',
          defaultMusicStyle: 'Romantic Piano',
          defaultAnimationStyle: 'pixar-3d',
        },
        
        // Usage stats
        stats: {
          projectsCreated: 0,
          videosGenerated: 0,
          totalCreditsUsed: 0,
        },
      };

      await setDoc(profileRef, defaultProfile);
      setProfile({ id: user.uid, ...defaultProfile });
    } catch (err) {
      console.error('Error creating default profile:', err);
      setError(err.message);
    }
  };

  // Save a new voice clone to the profile
  const saveVoiceClone = async (voiceData) => {
    if (!user?.uid) throw new Error('User not authenticated');

    const profileRef = doc(db, 'userProfiles', user.uid);
    
    const newVoice = {
      id: voiceData.voiceId,
      name: voiceData.name || 'My Voice',
      previewUrl: voiceData.previewUrl || null,
      createdAt: new Date().toISOString(),
      provider: 'elevenlabs',
    };

    try {
      // Get current profile to append to voiceClones array
      const currentVoices = profile?.voiceClones || [];
      
      // Check if this voice already exists (update instead of duplicate)
      const existingIndex = currentVoices.findIndex(v => v.id === voiceData.voiceId);
      
      let updatedVoices;
      if (existingIndex >= 0) {
        updatedVoices = [...currentVoices];
        updatedVoices[existingIndex] = newVoice;
      } else {
        updatedVoices = [...currentVoices, newVoice];
      }

      await setDoc(profileRef, {
        voiceClones: updatedVoices,
        activeVoiceId: voiceData.voiceId,
        updatedAt: new Date().toISOString(),
      }, { merge: true }); // 👈 This 'merge' part is the magic fix!

      return newVoice;
    } catch (err) {
      console.error('Error saving voice clone:', err);
      throw err;
    }
  };

  // Set the active voice for narration
  const setActiveVoice = async (voiceId) => {
    if (!user?.uid) throw new Error('User not authenticated');

    const profileRef = doc(db, 'userProfiles', user.uid);
    
    try {
      await updateDoc(profileRef, {
        activeVoiceId: voiceId,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error setting active voice:', err);
      throw err;
    }
  };

  // Delete a voice clone
  const deleteVoiceClone = async (voiceId) => {
    if (!user?.uid) throw new Error('User not authenticated');

    const profileRef = doc(db, 'userProfiles', user.uid);
    
    try {
      const updatedVoices = (profile?.voiceClones || []).filter(v => v.id !== voiceId);
      const newActiveId = profile?.activeVoiceId === voiceId ? null : profile?.activeVoiceId;

      await updateDoc(profileRef, {
        voiceClones: updatedVoices,
        activeVoiceId: newActiveId,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error deleting voice clone:', err);
      throw err;
    }
  };

  // Update user preferences
  const updatePreferences = async (newPreferences) => {
    if (!user?.uid) throw new Error('User not authenticated');

    const profileRef = doc(db, 'userProfiles', user.uid);
    
    try {
      await updateDoc(profileRef, {
        preferences: {
          ...(profile?.preferences || {}),
          ...newPreferences,
        },
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error updating preferences:', err);
      throw err;
    }
  };

  // Update usage stats
  const incrementStats = async (field, amount = 1) => {
    if (!user?.uid) return;

    const profileRef = doc(db, 'userProfiles', user.uid);
    
    try {
      const currentValue = profile?.stats?.[field] || 0;
      await updateDoc(profileRef, {
        [`stats.${field}`]: currentValue + amount,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error updating stats:', err);
    }
  };

  return {
    profile,
    loading,
    error,
    
    // Voice methods
    saveVoiceClone,
    setActiveVoice,
    deleteVoiceClone,
    
    // Convenience getters
    voiceClones: profile?.voiceClones || [],
    activeVoiceId: profile?.activeVoiceId,
    activeVoice: (profile?.voiceClones || []).find(v => v.id === profile?.activeVoiceId),
    
    // Preferences
    preferences: profile?.preferences || {},
    updatePreferences,
    
    // Stats
    stats: profile?.stats || {},
    incrementStats,
  };
}