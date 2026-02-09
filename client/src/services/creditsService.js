// src/services/creditsService.js
// Centralized service for managing user credits

import { db } from '../firebaseConfig';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  increment, 
  serverTimestamp 
} from 'firebase/firestore';

/**
 * Get user's current credit balance
 */
export const getCredits = async (userId) => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  return userDoc.data()?.credits?.balance || 0;
};

/**
 * Check if user has enough credits
 */
export const hasEnoughCredits = async (userId, amount) => {
  const balance = await getCredits(userId);
  return balance >= amount;
};

/**
 * Deduct credits and log transaction
 * @param {string} userId - User ID
 * @param {number} amount - Credits to deduct
 * @param {string} description - Description of the charge
 * @param {string} projectName - Optional project name
 * @returns {number} New balance
 */
export const deductCredits = async (userId, amount, description, projectName = null) => {
  const userRef = doc(db, 'users', userId);
  const historyRef = collection(db, 'users', userId, 'creditsHistory');
  
  // Get current balance first
  const userDoc = await getDoc(userRef);
  const currentBalance = userDoc.data()?.credits?.balance || 0;
  
  if (currentBalance < amount) {
    throw new Error('Insufficient credits');
  }
  
  const newBalance = currentBalance - amount;
  
  // Determine transaction type based on description
  let type = 'usage';
  if (description.toLowerCase().includes('video')) {
    type = 'video_generation';
  } else if (description.toLowerCase().includes('image')) {
    type = 'image_generation';
  }
  
  // Update balance
  await updateDoc(userRef, {
    'credits.balance': newBalance,
    'credits.totalSpent': increment(amount),
  });
  
  // Log transaction
  await addDoc(historyRef, {
    type,
    description,
    projectName,
    amount: -amount, // Negative for deductions
    balance: newBalance,
    timestamp: serverTimestamp(),
  });
  
  return newBalance;
};

/**
 * Add credits (for referrals, purchases, bonuses)
 * @param {string} userId - User ID
 * @param {number} amount - Credits to add
 * @param {string} type - Type: 'referral', 'purchase', 'signup_bonus', 'promo'
 * @param {string} description - Description
 * @returns {number} New balance
 */
export const addCredits = async (userId, amount, type, description) => {
  const userRef = doc(db, 'users', userId);
  const historyRef = collection(db, 'users', userId, 'creditsHistory');
  
  // Get current balance
  const userDoc = await getDoc(userRef);
  const currentBalance = userDoc.data()?.credits?.balance || 0;
  const newBalance = currentBalance + amount;
  
  // Update balance
  const updateData = {
    'credits.balance': newBalance,
    'credits.totalEarned': increment(amount),
  };
  
  if (type === 'referral') {
    updateData['credits.referralEarned'] = increment(amount);
  }
  
  await updateDoc(userRef, updateData);
  
  // Log transaction
  await addDoc(historyRef, {
    type,
    description,
    amount, // Positive for additions
    balance: newBalance,
    timestamp: serverTimestamp(),
  });
  
  return newBalance;
};

/**
 * Initialize credits for new user
 * @param {string} userId - User ID
 * @param {number} initialCredits - Starting credits (default 100)
 */
export const initializeCredits = async (userId, initialCredits = 100) => {
  const userRef = doc(db, 'users', userId);
  const historyRef = collection(db, 'users', userId, 'creditsHistory');
  
  // Set initial credits
  await updateDoc(userRef, {
    credits: {
      balance: initialCredits,
      totalEarned: initialCredits,
      totalSpent: 0,
      referralEarned: 0,
    },
  });
  
  // Log signup bonus
  await addDoc(historyRef, {
    type: 'signup_bonus',
    description: 'Welcome bonus',
    amount: initialCredits,
    balance: initialCredits,
    timestamp: serverTimestamp(),
  });
};

/**
 * Process referral signup - awards credits to both referrer and new user
 * @param {object} newUser - The new user object
 * @param {string} referralCode - The referral code used
 */
export const processReferral = async (newUser, referralCode) => {
  if (!referralCode) return;
  
  try {
    // Find the referrer by their referral code
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('referralCode', '==', referralCode));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('Referral code not found:', referralCode);
      return;
    }
    
    const referrerDoc = snapshot.docs[0];
    const referrerId = referrerDoc.id;
    
    // Don't allow self-referral
    if (referrerId === newUser.uid) {
      console.log('Self-referral not allowed');
      return;
    }
    
    // Award 50 credits to referrer
    await addCredits(referrerId, 50, 'referral', `Referral: ${newUser.email}`);
    
    // Update referrer stats
    await updateDoc(doc(db, 'users', referrerId), {
      'referralStats.successfulReferrals': increment(1),
      'referralStats.creditsEarned': increment(50),
      'referralStats.totalInvites': increment(1),
    });
    
    // Award 50 credits to new user
    await addCredits(newUser.uid, 50, 'referral', 'Referral signup bonus');
    
    // Mark who referred this user
    await updateDoc(doc(db, 'users', newUser.uid), {
      referredBy: referrerId,
      referredByCode: referralCode,
    });
    
    console.log('Referral processed successfully');
    
  } catch (error) {
    console.error('Error processing referral:', error);
  }
};

/**
 * Get referral code from URL
 */
export const getReferralCodeFromURL = () => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('ref');
};