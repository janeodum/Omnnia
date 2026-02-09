// src/LandingPage.js
import React, { useState } from 'react';
import './landing.css';
import { initializeCredits, processReferral, getReferralCodeFromURL } from './services/creditsService';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, googleProvider } from './firebaseConfig';
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';

const APP_URL = process.env.REACT_APP_APP_URL || 'http://localhost:3000';

function AuthModal({ open, onClose }) {
  const [isSignup, setIsSignup] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  // Check for referral code on mount
  const referralCode = getReferralCodeFromURL();

  if (!open) return null;

  const handleToggleMode = () => {
    setIsSignup(prev => !prev);
  };

  const handleGoogle = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      console.log('Google user:', user);

      // Check if this is a new user
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        // NEW USER - Create document and initialize credits
        console.log('🆕 New Google user, initializing...');
        
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          credits: {
            balance: 100,
            totalEarned: 100,
            totalSpent: 0,
            referralEarned: 0,
          },
          referralStats: {
            totalInvites: 0,
            successfulReferrals: 0,
            pendingReferrals: 0,
            creditsEarned: 0,
          },
          notifications: {
            videoRendered: true,
            imageGenerated: true,
            weeklyDigest: false,
            promotions: false,
          },
        });

        // Initialize credits history with welcome bonus
        await initializeCredits(user.uid, 100);

        // Check for referral code in URL and process it
        if (referralCode) {
          console.log('🎁 Processing referral code:', referralCode);
          await processReferral(user, referralCode);
          // Clear referral code from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        console.log('👋 Returning Google user');
      }

      window.location.href = APP_URL;
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        // SIGNUP - Create account
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const user = cred.user;

        if (fullName) {
          await updateProfile(user, { displayName: fullName });
        }

        // Create user document in Firestore
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
          email: user.email,
          displayName: fullName || email.split('@')[0],
          createdAt: serverTimestamp(),
          credits: {
            balance: 100,
            totalEarned: 100,
            totalSpent: 0,
            referralEarned: 0,
          },
          referralStats: {
            totalInvites: 0,
            successfulReferrals: 0,
            pendingReferrals: 0,
            creditsEarned: 0,
          },
          notifications: {
            videoRendered: true,
            imageGenerated: true,
            weeklyDigest: false,
            promotions: false,
          },
        });

        // Initialize credits history with welcome bonus
        await initializeCredits(user.uid, 100);

        // Check for referral code and process it
        if (referralCode) {
          console.log('🎁 Processing referral code:', referralCode);
          await processReferral(user, referralCode);
          // Clear referral code from URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        console.log('✅ New user created with 100 credits');
      } else {
        // LOGIN - Just sign in
        await signInWithEmailAndPassword(auth, email, password);
      }
      
      onClose();
      window.location.href = APP_URL;
    } catch (err) {
      console.error(err);
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') msg = 'Email already exists.';
      if (err.code === 'auth/wrong-password') msg = 'Incorrect password.';
      if (err.code === 'auth/user-not-found') msg = 'No account found with this email.';
      if (err.code === 'auth/weak-password') msg = 'Password should be at least 6 characters.';
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="absolute top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(251,207,232,0.15)] relative overflow-hidden">
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
          >
            ✕
          </button>

          <div className="p-8">
            <div className="text-center mb-8">
              <h2 className="font-serif text-3xl text-white mb-2">
                {isSignup ? 'Create Account' : 'Welcome to Omnnia'}
              </h2>
              <p className="text-zinc-400 text-sm">
                {isSignup
                  ? 'Join Omnnia to create your movie. Get 100 free credits!'
                  : 'Sign in to start your animated journey.'}
              </p>
            </div>

            {/* Referral bonus notice */}
            {isSignup && referralCode && (
              <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                <span className="text-emerald-400 text-sm">
                  🎁 Referral bonus! You'll get 50 extra credits when you sign up.
                </span>
              </div>
            )}

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full h-12 bg-white text-black font-medium rounded-lg flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] active:scale-[0.98] mb-6 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative flex py-2 items-center mb-6">
              <div className="flex-grow border-t border-zinc-800" />
              <span className="flex-shrink-0 mx-4 text-zinc-500 text-xs">
                OR EMAIL
              </span>
              <div className="flex-grow border-t border-zinc-800" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-400 ml-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-rose-custom/50 focus:ring-1 focus:ring-rose-custom/50 transition-all"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400 ml-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-rose-custom/50 focus:ring-1 focus:ring-rose-custom/50 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400 ml-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-rose-custom/50 focus:ring-1 focus:ring-rose-custom/50 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 mt-2 bg-gradient-to-r from-pink-400 to-rose-300 text-black font-semibold rounded-lg hover:shadow-[0_0_20px_rgba(251,207,232,0.4)] transition-all duration-300 disabled:opacity-50"
              >
                {loading
                  ? 'Processing...'
                  : isSignup
                  ? 'Create Account'
                  : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-zinc-400">
              <span>
                {isSignup
                  ? 'Already have an account?'
                  : "Don't have an account?"}
              </span>
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-rose-custom hover:text-white font-medium ml-1 transition-colors"
              >
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LandingPage = () => {
  const [showAuth, setShowAuth] = useState(false);

  const handleTryBeta = () => {
    setShowAuth(true); // open modal
  };

  return (
    <div className="antialiased bg-[#020204] text-zinc-200 font-sans selection:bg-[rgba(251,207,232,0.2)] selection:text-[rgba(251,207,232,1)]">
      {/* HEADER */}
      <header className="fixed top-0 w-full z-50 transition-all duration-300 bg-[#020204]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex h-20 items-center justify-between">
            <a href="#" className="flex items-center gap-3 group">
              <span className="text-xl font-serif font-semibold text-white tracking-wide group-hover:text-rose-custom transition-colors duration-300">
                Omnnia
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-8">
              <a
                href="#"
                className="relative text-sm font-medium text-zinc-400 hover:text-white transition-colors py-1 group"
              >
                How it Works
                <span className="absolute inset-x-0 bottom-0 h-px bg-rose-custom scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </a>
              <a
                href="#"
                className="relative text-sm font-medium text-zinc-400 hover:text-white transition-colors py-1 group"
              >
                Studio Gallery
                <span className="absolute inset-x-0 bottom-0 h-px bg-rose-custom scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </a>
              <a
                href="#pricing"
                className="relative text-sm font-medium text-zinc-400 hover:text-white transition-colors py-1 group"
              >
                Pricing
              </a>
            </nav>

            <div className="flex items-center gap-4">
              <button
                onClick={handleTryBeta}
                className="relative inline-flex h-10 items-center justify-center rounded-full bg-white px-6 font-medium text-black transform-gpu transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:shadow-[0_0_20px_rgba(251,207,232,0.6)] hover:bg-rose-custom"
              >
                <span className="mr-2 relative z-20">Try Beta Now</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-arrow-right relative z-20"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section
        id="hero"
        className="relative w-full h-screen flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover scale-105"
          >
            <source
              src="/Nigerian_Couple_s_San_Francisco_Cafe_Scene.mp4"
              type="video/mp4"
            />
          </video>
        </div>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020204_80%)] z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#020204] to-transparent z-10 pointer-events-none" />

        <div className="relative z-20 text-center px-6 max-w-4xl mx-auto mt-16">
          <h1 className="font-serif text-5xl sm:text-7xl md:text-8xl font-medium text-white leading-[1.1] tracking-tight mb-6 drop-shadow-2xl">
            Our love story,
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[rgba(251,207,232,0.9)] via-white to-[rgba(251,207,232,0.9)]">
              animated.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-300 max-w-2xl mx-auto mb-10 font-light leading-relaxed">
            Omnnia turns your love memories into a heartwarming, Pixar-style short
            film. No skills required, just love.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleTryBeta}
              className="h-12 px-8 rounded-full bg-white text-black font-semibold flex items-center gap-2 transform-gpu transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:shadow-[0_0_30px_rgba(251,207,232,0.6)] hover:bg-rose-custom"
            >
              Try Beta Now
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </section>
       <section id="how-it-works" class="relative z-20 py-24 px-6 border-t border-white/5 bg-[#020204]">
        <div class="max-w-7xl mx-auto">
            <div class="text-center mb-20">
                <h2 class="font-serif text-3xl md:text-5xl text-white mb-4 tracking-tight">From memory to magic.</h2>
                <p class="text-zinc-400">Three simple steps to your premiere.</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                <div class="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-white/20 to-transparent border-t border-dashed border-white/20 z-0"></div>

                <div class="relative z-10 flex flex-col items-center text-center group">
                    <div class="w-24 h-24 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-rose-custom/50 transition-colors duration-500">
                        <i data-lucide="feather" class="w-8 h-8 text-white group-hover:text-rose-custom transition-colors duration-500"></i>
                    </div>
                    <h3 class="text-xl font-serif text-white mb-3">1. Share Your Story</h3>
                    <p class="text-sm text-zinc-400 leading-relaxed max-w-xs">
                        Type out a memory—your first date, a funny mishap, or the moment you knew. No scriptwriting skills required.
                    </p>
                </div>

                <div class="relative z-10 flex flex-col items-center text-center group">
                    <div class="w-24 h-24 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-rose-custom/50 transition-colors duration-500">
                        <i data-lucide="wand-2" class="w-8 h-8 text-white group-hover:text-rose-custom transition-colors duration-500"></i>
                    </div>
                    <h3 class="text-xl font-serif text-white mb-3">2. Watch the Magic</h3>
                    <p class="text-sm text-zinc-400 leading-relaxed max-w-xs">
                        Our animation engine directs the scene, lighting your characters and setting the mood with cinematic precision.
                    </p>
                </div>

                <div class="relative z-10 flex flex-col items-center text-center group">
                    <div class="w-24 h-24 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-rose-custom/50 transition-colors duration-500">
                        <i data-lucide="film" class="w-8 h-8 text-white group-hover:text-rose-custom transition-colors duration-500"></i>
                    </div>
                    <h3 class="text-xl font-serif text-white mb-3">3. Premiere Night</h3>
                    <p class="text-sm text-zinc-400 leading-relaxed max-w-xs">
                        Receive a stunning, studio-quality animated short, ready to be shared with family or projected on your big day.
                    </p>
                </div>
            </div>
        </div>
    </section>
      {/* FEATURE GRID */}
      <section className="relative z-20 py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl text-white mb-4">
            Direct your own fairytale
          </h2>
          <p className="text-zinc-400">
            Professional animation studio tools, simplified for two.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Custom Characters */}
          <div className="card-spotlight group rounded-3xl p-[1px]">
            <div className="card-inner p-8 bg-[#0a0a0a] rounded-3xl border border-white/10 h-full">
              <h3 className="text-xl font-serif text-white mb-2">
                Custom Characters
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                Upload a selfie, and our AI generates a stylized 3D character
                that captures your likeness and personality perfectly.
              </p>

              <div className="w-full h-40 rounded-xl bg-zinc-900 border border-white/5 overflow-hidden relative flex">
                <div className="w-1/2 h-full border-r border-white/10 overflow-hidden relative">
                  <img
                    src="/characterpre.jpeg"
                    alt="Character 1"
                    className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 ease-in-out"
                  />
                </div>
                <div className="w-1/2 h-full overflow-hidden relative">
                  <img
                    src="/unnamed.jpg"
                    alt="Character 2"
                    className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 ease-in-out"
                  />
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 z-10">
                  <svg
                    className="w-3 h-3 text-rose-custom"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Cinematic Storytelling */}
          <div className="md:col-span-2 card-spotlight group rounded-3xl p-[1px]">
            <div className="card-inner p-8 bg-[#0a0a0a] rounded-3xl border border-white/10 h-full">
              <div className="flex flex-col md:flex-row items-center gap-8 h-full">
                <div className="flex-1">
                  <h3 className="text-xl font-serif text-white mb-2">
                    Cinematic Storytelling
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                    Whether it's your first date at a coffee shop or your
                    engagement on a mountain top, Omnnia scripts, directs, and
                    lights the scene automatically.
                  </p>
                  <ul className="space-y-2 text-sm text-zinc-300">
                    <li className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-rose-custom"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Auto-generated scripts from your memories
                    </li>
                    <li className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-rose-custom"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Professional lighting & camera angles
                    </li>
                  </ul>
                </div>

                <div className="w-full md:w-1/2 h-48 rounded-xl bg-zinc-900 border border-white/5 overflow-hidden relative group-hover:shadow-2xl transition-all duration-500">
                  <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="animate-scroll-up text-[10px] text-zinc-400 font-mono leading-relaxed p-4">
                      EXT. COFFEE SHOP - DAY
                      <br />
                      <br />
                      Sunlight streams through the window. HE (30s) laughs as SHE
                      (30s) wipes foam from her lip.
                      <br />
                      <br />
                      HE
                      <br />
                      I knew you were going to do that.
                      <br />
                      <br />
                      SHE
                      <br />
                      You planned this!
                      <br />
                      <br />
                      CAMERA PUSHES IN slowly. The world fades away. It's just
                      them.
                      <br />
                      <br />
                      CUT TO:
                      <br />
                      EXT. MOUNTAIN TOP - SUNSET
                      <br />
                      <br />
                      The wind whips their hair. He drops to one knee.
                      <br />
                      <br />
                      EXT. COFFEE SHOP - DAY
                      <br />
                      <br />
                      Sunlight streams through the window. HE (30s) laughs as SHE
                      (30s) wipes foam from her lip.
                      <br />
                      <br />
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-tr from-[rgba(251,207,232,0.1)] to-purple-500/10 mix-blend-overlay" />
                  <div className="absolute inset-0 p-3 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 bg-black/50 px-2 py-1 rounded backdrop-blur-md border border-white/10">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-white tracking-widest">
                          REC
                        </span>
                      </div>
                      <div className="text-[10px] text-white/50 font-mono">
                        4K • 24FPS
                      </div>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-20 border border-white/20 rounded-sm">
                      <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-rose-custom" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 border-t border-r border-rose-custom" />
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b border-l border-rose-custom" />
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-rose-custom" />
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-[10px] text-white/70 font-mono bg-black/50 px-2 py-1 rounded backdrop-blur-md">
                        ISO 800
                      </div>
                      <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-custom w-[60%] animate-[shimmer_2s_infinite]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: World Building */}
          <div className="card-spotlight group rounded-3xl p-[1px]">
            <div className="card-inner p-8 bg-[#0a0a0a] rounded-3xl border border-white/10 h-full">
              <h3 className="text-xl font-serif text-white mb-2">
                World Building
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                From Paris to your living room, we recreate the environments that
                matter to you.
              </p>
              <div className="w-full h-40 rounded-xl bg-zinc-800 border border-white/5 overflow-hidden relative">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700"
                >
                  <source
                    src="/Pixar_Video_Paris_to_Living_Room.mp4"
                    type="video/mp4"
                  />
                </video>
              </div>
            </div>
          </div>

          {/* Card 4: 4K Export */}
          <div className="md:col-span-2 card-spotlight group rounded-3xl p-[1px]">
            <div className="card-inner p-8 bg-[#0a0a0a] rounded-3xl border border-white/10 h-full">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="w-full md:w-1/2 aspect-video rounded-xl bg-black border border-white/10 relative overflow-hidden shadow-2xl group-hover:shadow-rose-custom/20 transition-all duration-500">
                  <video
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  >
                    <source
                      src="/Pixar_Video_Love_Story_and_Proposal.mp4"
                      type="video/mp4"
                    />
                  </video>

                  <button
                    className="absolute bottom-4 right-4 h-10 w-10 bg-black/50 hover:bg-rose-custom/90 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 transition-all duration-300 hover:scale-110 group/btn"
                    aria-label="Toggle Sound"
                    type="button"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-white"
                    >
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1">
                  <h3 className="text-xl font-serif text-white mb-2">
                    4K Export &amp; Sharing
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-0">
                    Download your movie in high resolution, ready for the big
                    screen at your wedding or the small screen on Instagram.
                    Includes cinema-grade sound design.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="py-32 px-6 max-w-7xl mx-auto relative border-t border-white/5"
      >
        <div className="relative z-10 text-center mb-20">
          <h2 className="font-serif text-4xl md:text-5xl text-white mb-4">
            Simple Coin Pricing
          </h2>
          <p className="text-zinc-400 text-lg">
            Buy coins as you go. No monthly subscriptions.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/50 border border-white/10 backdrop-blur-md">
            <span className="text-sm text-zinc-400 font-medium">
              200 Coins = 2 Minutes of Animation
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto relative z-10 items-start">
          {/* Starter */}
          <div className="card-spotlight group rounded-2xl p-[1px]">
            <div className="card-inner bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 flex flex-col h-full hover:border-rose-500/30 transition-colors duration-300">
              <div className="mb-6">
                <span className="text-rose-200/70 text-xs font-bold tracking-widest uppercase">
                  Starter
                </span>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-4xl font-serif text-transparent bg-clip-text bg-gradient-to-br from-white to-rose-200">
                    100
                  </span>
                  <span className="text-sm text-rose-custom font-medium">
                    Coins
                  </span>
                </div>
                <div className="text-xl text-zinc-300 mt-1 font-light">
                  $19.99
                </div>
              </div>

              <div className="space-y-4 mb-8 flex-1 border-t border-white/5 pt-6">
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <svg
                    className="w-4 h-4 text-rose-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Generates ~1 min of video
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <svg
                    className="w-4 h-4 text-rose-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Standard Generation Speed
                </div>
              </div>

              <button className="w-full py-3 rounded-lg border border-white/10 bg-white/5 text-white font-medium hover:bg-white hover:text-black transition-all duration-300">
                Purchase Coins
              </button>
            </div>
          </div>

          {/* Storyteller */}
          <div className="card-spotlight group rounded-2xl p-[1px] relative z-20">
            <div className="absolute inset-0 bg-rose-500/10 blur-2xl rounded-2xl -z-10" />
            <div className="card-inner bg-[#0a0a0a] relative rounded-2xl p-8 flex flex-col h-full transform md:-translate-y-4 border border-rose-500/40 shadow-[0_0_40px_-10px_rgba(244,63,94,0.1)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <div className="bg-rose-600 border border-rose-400 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest uppercase shadow-xl">
                  Most Popular
                </div>
              </div>

              <div className="mb-6 mt-2">
                <span className="text-rose-400 text-xs font-bold tracking-widest uppercase">
                  Storyteller
                </span>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-5xl font-serif text-white">550</span>
                  <span className="text-lg text-rose-custom">Coins</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-2xl text-white font-medium">
                    $99.99
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                    SAVE 10%
                  </span>
                </div>
              </div>

              <div className="space-y-4 mb-8 flex-1 border-t border-white/10 pt-6">
                <div className="flex items-center gap-3 text-sm text-white">
                  <svg
                    className="w-4 h-4 text-rose-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Generates ~5.5 mins of video
                </div>
                <div className="flex items-center gap-3 text-sm text-white">
                  <svg
                    className="w-4 h-4 text-rose-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Perfect for full stories
                </div>
                <div className="flex items-center gap-3 text-sm text-white">
                  <svg
                    className="w-4 h-4 text-rose-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Priority Processing Queue
                </div>
              </div>

              <button className="w-full py-4 rounded-lg bg-white text-black font-bold hover:bg-rose-200 hover:shadow-[0_0_20px_rgba(251,207,232,0.4)] transition-all duration-300 transform hover:-translate-y-1">
                Get Storyteller Pack
              </button>
            </div>
          </div>

          {/* Director */}
          <div className="card-spotlight group rounded-2xl p-[1px]">
            <div className="card-inner bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 flex flex-col h-full hover:border-rose-500/30 transition-colors duration-300">
              <div className="mb-6">
                <span className="text-rose-200/70 text-xs font-bold tracking-widest uppercase">
                  Director
                </span>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-4xl font-serif text-transparent bg-clip-text bg-gradient-to-br from-white to-rose-200">
                    1200
                  </span>
                  <span className="text-sm text-rose-custom font-medium">
                    Coins
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xl text-zinc-300 font-light">
                    $199.99
                  </span>

                  <span className="px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold tracking-wide shadow-sm shadow-emerald-900/50">
                    SAVE $40
                  </span>
                </div>
              </div>

              <div className="space-y-4 mb-8 flex-1 border-t border-white/5 pt-6">
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <svg
                    className="w-4 h-4 text-rose-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Generates ~12 mins of video
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-300">
                  <svg
                    className="w-4 h-4 text-rose-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Best Value per minute
                </div>
              </div>

              <button className="w-full py-3 rounded-lg border border-white/10 bg-white/5 text-white font-medium hover:bg-white hover:text-black transition-all duration-300">
                Purchase Coins
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[rgba(251,207,232,0.15)] blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl text-white mb-6">
            Ready to make magic?
          </h2>
          <p className="text-zinc-400 mb-10 text-lg">
            Join thousands of couples preserving their memories in the most
            beautiful format possible.
          </p>
          <button
            onClick={handleTryBeta}
            className="h-14 px-10 rounded-full bg-white text-black font-bold text-lg transform-gpu transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-105 hover:shadow-[0_0_30px_rgba(251,207,232,0.6)] hover:bg-rose-custom"
          >
            Try Beta Now
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#020204] py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-zinc-400"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
            <span className="text-zinc-500 text-sm font-serif">
              Omnnia © 2025
            </span>
          </div>
          <div className="flex gap-8 text-sm text-zinc-500">
            <a href="#" className="hover:text-white transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Instagram
            </a>
            <a href="#" className="hover:text-white transition-colors">
              TikTok
            </a>
          </div>
        </div>
      </footer>

      {/* AUTH MODAL */}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  );
};

export default LandingPage;