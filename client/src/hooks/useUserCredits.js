// src/hooks/useUserCredits.js
import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Credit costs for different operations
// 100 credits = ~1 minute of video
// Each 12-second video scene costs ~20 credits
export const CREDIT_COSTS = {
  VIDEO_GENERATION: 5,      // Per scene video generation
  IMAGE_GENERATION: 0,       // Images are free (for now)
  VOICE_CLONE: 50,           // Voice cloning
  NARRATION: 10,             // Per scene narration
};

// Default credits for new users
const DEFAULT_CREDITS = 7;

export default function useUserCredits(user) {
  const [credits, setCredits] = useState(DEFAULT_CREDITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to user credits in real-time
  useEffect(() => {
    if (!user?.uid) {
      setCredits(DEFAULT_CREDITS);
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    
    const unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Support both nested (credits.balance) and flat (credits) structure
          const creditBalance = data.credits?.balance ?? data.credits ?? DEFAULT_CREDITS;
          setCredits(creditBalance);
        } else {
          // New user - show default credits
          setCredits(DEFAULT_CREDITS);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to credits:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  // Check if user has enough credits
  const hasEnoughCredits = useCallback((amount) => {
    return credits >= amount;
  }, [credits]);

  // Calculate cost for a given operation
  const calculateCost = useCallback((operation, count = 1) => {
    const costPerUnit = CREDIT_COSTS[operation] || 0;
    return costPerUnit * count;
  }, []);

  // Deduct credits (calls the server)
  const deductCredits = useCallback(async (amount, reason = 'generation') => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    if (!hasEnoughCredits(amount)) {
      throw new Error(`Insufficient credits. Need ${amount}, have ${credits}`);
    }

    try {
      const response = await fetch(`${API_URL}/api/stripe/deduct-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          amount,
          reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to deduct credits');
      }

      // The real-time listener will update the credits automatically
      // But we can optimistically update here too
      setCredits(data.newBalance);

      return data;
    } catch (err) {
      console.error('Deduct credits error:', err);
      throw err;
    }
  }, [user?.uid, credits, hasEnoughCredits]);

  // Refresh credits from server (fallback)
  const refreshCredits = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const response = await fetch(`${API_URL}/api/credits/${user.uid}`);
      const data = await response.json();

      if (response.ok) {
        // Support both nested (credits.balance) and flat (credits) structure
        const creditBalance = data.credits?.balance ?? data.credits ?? DEFAULT_CREDITS;
        setCredits(creditBalance);
      }
    } catch (err) {
      console.error('Refresh credits error:', err);
    }
  }, [user?.uid]);

  return {
    credits,
    loading,
    error,
    hasEnoughCredits,
    calculateCost,
    deductCredits,
    refreshCredits,
    CREDIT_COSTS,
  };
}