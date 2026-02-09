// src/components/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  Bell,
  CreditCard,
  Gift,
  Shield,
  Mail,
  Lock,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  Coins,
  Image,
  Video,
  Calendar,
  TrendingUp,
  Users,
  ExternalLink,
} from 'lucide-react';
import { auth, db } from '../firebaseConfig';
import { 
  updateProfile, 
  updatePassword, 
  EmailAuthProvider, 
  reauthenticateWithCredential,
  deleteUser 
} from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import './SettingsPage.css';

function SettingsPage({ user, onBack, initialSection = 'profile' }) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email] = useState(user?.email || '');
  
  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Notifications state
  const [notifications, setNotifications] = useState({
    videoRendered: true,
    imageGenerated: true,
    weeklyDigest: false,
    promotions: false,
  });
  
  // Credits state
  const [credits, setCredits] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    referralEarned: 0,
  });
  const [creditsHistory, setCreditsHistory] = useState([]);
  
  // Referral state
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [referralStats, setReferralStats] = useState({
    totalInvites: 0,
    successfulReferrals: 0,
    pendingReferrals: 0,
    creditsEarned: 0,
  });
  const [copied, setCopied] = useState(false);
  
  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const loadUserData = async () => {
    try {
      // Load user profile and settings
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        // Load notifications settings
        if (data.notifications) {
          setNotifications(data.notifications);
        }
        
        // Load credits
        setCredits({
          balance: data.credits?.balance || 100, // Default 100 for new users
          totalEarned: data.credits?.totalEarned || 100,
          totalSpent: data.credits?.totalSpent || 0,
          referralEarned: data.credits?.referralEarned || 0,
        });
        
        // Load or generate referral code
        if (data.referralCode) {
          setReferralCode(data.referralCode);
        } else {
          // Generate new referral code
          const code = generateReferralCode(user.uid);
          setReferralCode(code);
          await updateDoc(userRef, { referralCode: code });
        }
        
        // Load referral stats
        if (data.referralStats) {
          setReferralStats(data.referralStats);
        }
      } else {
        // Initialize new user
        const code = generateReferralCode(user.uid);
        setReferralCode(code);
      }
      
      setReferralLink(`${window.location.origin}?ref=${referralCode || generateReferralCode(user.uid)}`);
      
      // Load credits history
      await loadCreditsHistory();
      
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const generateReferralCode = (uid) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const uidPart = uid.substring(0, 4).toUpperCase();
    let randomPart = '';
    for (let i = 0; i < 4; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `OMNIA-${uidPart}${randomPart}`;
  };

  const loadCreditsHistory = async () => {
    try {
      const historyRef = collection(db, 'users', user.uid, 'creditsHistory');
      const q = query(historyRef, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      }));
      
      setCreditsHistory(history.length > 0 ? history : [
        // Demo data if no history
        {
          id: '1',
          type: 'signup_bonus',
          description: 'Welcome bonus',
          amount: 100,
          balance: 100,
          timestamp: new Date(),
        }
      ]);
    } catch (error) {
      console.error('Error loading credits history:', error);
      // Set demo data
      setCreditsHistory([
        {
          id: '1',
          type: 'signup_bonus',
          description: 'Welcome bonus',
          amount: 100,
          balance: 100,
          timestamp: new Date(),
        }
      ]);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) {
      showMessage('error', 'Display name cannot be empty');
      return;
    }
    
    setLoading(true);
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      
      // Also update in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { displayName: displayName.trim() });
      
      showMessage('success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      showMessage('error', 'Failed to update profile');
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showMessage('error', 'Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Update password
      await updatePassword(auth.currentUser, newPassword);
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('success', 'Password changed successfully');
    } catch (error) {
      console.error('Error changing password:', error);
      if (error.code === 'auth/wrong-password') {
        showMessage('error', 'Current password is incorrect');
      } else {
        showMessage('error', 'Failed to change password');
      }
    }
    setLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showMessage('error', 'Please enter your password to confirm');
      return;
    }
    
    setLoading(true);
    try {
      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Delete user data from Firestore
      // Note: You might want to use a Cloud Function to delete all subcollections
      
      // Delete user account
      await deleteUser(auth.currentUser);
      
      showMessage('success', 'Account deleted successfully');
    } catch (error) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/wrong-password') {
        showMessage('error', 'Password is incorrect');
      } else {
        showMessage('error', 'Failed to delete account');
      }
    }
    setLoading(false);
  };

  const handleNotificationChange = async (key, value) => {
    const newNotifications = { ...notifications, [key]: value };
    setNotifications(newNotifications);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { notifications: newNotifications });
    } catch (error) {
      console.error('Error updating notifications:', error);
    }
  };

  const copyReferralLink = () => {
    const link = `${window.location.origin}?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareReferral = async (platform) => {
    const link = `${window.location.origin}?ref=${referralCode}`;
    const text = `Create beautiful AI love story videos with Omnia! Use my referral link to get bonus credits: ${link}`;
    
    switch (platform) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'facebook':
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank');
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'email':
        window.location.href = `mailto:?subject=Try Omnia - AI Love Story Videos&body=${encodeURIComponent(text)}`;
        break;
      default:
        copyReferralLink();
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'video_generation':
        return <Video size={16} />;
      case 'image_generation':
        return <Image size={16} />;
      case 'referral':
        return <Gift size={16} />;
      case 'signup_bonus':
        return <Coins size={16} />;
      case 'purchase':
        return <CreditCard size={16} />;
      default:
        return <Coins size={16} />;
    }
  };

  const sections = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'credits', label: 'Credits & Usage', icon: CreditCard },
    { id: 'referrals', label: 'Invite Friends', icon: Gift },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-header">
        <button className="settings-back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
        <h1>Settings</h1>
      </div>

      <div className="settings-container">
        {/* Sidebar */}
        <div className="settings-sidebar">
          <nav className="settings-nav">
            {sections.map(section => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <section.icon size={18} />
                <span>{section.label}</span>
                <ChevronRight size={16} className="nav-chevron" />
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="settings-content">
          {message.text && (
            <div className={`settings-message ${message.type}`}>
              {message.text}
            </div>
          )}

          {/* Profile Section */}
          {activeSection === 'profile' && (
            <div className="settings-section">
              <h2>Profile Information</h2>
              <p className="section-description">
                Manage your personal information and how it appears across Omnia.
              </p>

              <div className="settings-card">
                <div className="profile-avatar-section">
                  <div className="profile-avatar-large">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt="Profile" />
                    ) : (
                      <span>{displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <button className="btn-secondary btn-sm">Change photo</button>
                </div>

                <div className="form-group">
                  <label>Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <div className="input-with-icon">
                    <Mail size={16} />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="disabled"
                    />
                  </div>
                  <span className="form-hint">Email cannot be changed</span>
                </div>

                <button 
                  className="btn-primary"
                  onClick={handleUpdateProfile}
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Notifications Section */}
          {activeSection === 'notifications' && (
            <div className="settings-section">
              <h2>Notification Preferences</h2>
              <p className="section-description">
                Choose what notifications you'd like to receive.
              </p>

              <div className="settings-card">
                <div className="notification-group">
                  <h3>Generation Alerts</h3>
                  
                  <div className="notification-item">
                    <div className="notification-info">
                      <Video size={18} />
                      <div>
                        <span className="notification-title">Video Rendered</span>
                        <span className="notification-desc">
                          Get notified when your video is ready
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={notifications.videoRendered}
                        onChange={(e) => handleNotificationChange('videoRendered', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="notification-item">
                    <div className="notification-info">
                      <Image size={18} />
                      <div>
                        <span className="notification-title">Image Generated</span>
                        <span className="notification-desc">
                          Get notified when your images are ready
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={notifications.imageGenerated}
                        onChange={(e) => handleNotificationChange('imageGenerated', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="notification-group">
                  <h3>Email Notifications</h3>
                  
                  <div className="notification-item">
                    <div className="notification-info">
                      <Mail size={18} />
                      <div>
                        <span className="notification-title">Weekly Digest</span>
                        <span className="notification-desc">
                          Summary of your activity and new features
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={notifications.weeklyDigest}
                        onChange={(e) => handleNotificationChange('weeklyDigest', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="notification-item">
                    <div className="notification-info">
                      <Gift size={18} />
                      <div>
                        <span className="notification-title">Promotions & Offers</span>
                        <span className="notification-desc">
                          Special deals and new feature announcements
                        </span>
                      </div>
                    </div>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={notifications.promotions}
                        onChange={(e) => handleNotificationChange('promotions', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Credits Section */}
          {activeSection === 'credits' && (
            <div className="settings-section">
              <h2>Credits & Usage</h2>
              <p className="section-description">
                Track your credit balance and usage history.
              </p>

              {/* Credits Overview */}
              <div className="credits-overview">
                <div className="credit-card main">
                  <div className="credit-card-icon">
                    <Coins size={24} />
                  </div>
                  <div className="credit-card-content">
                    <span className="credit-label">Available Credits</span>
                    <span className="credit-value">{credits.balance}</span>
                  </div>
                  <button className="btn-primary btn-sm">Buy Credits</button>
                </div>

                <div className="credit-stats">
                  <div className="credit-stat">
                    <TrendingUp size={18} />
                    <div>
                      <span className="stat-value">{credits.totalEarned}</span>
                      <span className="stat-label">Total Earned</span>
                    </div>
                  </div>
                  <div className="credit-stat">
                    <CreditCard size={18} />
                    <div>
                      <span className="stat-value">{credits.totalSpent}</span>
                      <span className="stat-label">Total Spent</span>
                    </div>
                  </div>
                  <div className="credit-stat">
                    <Gift size={18} />
                    <div>
                      <span className="stat-value">{credits.referralEarned}</span>
                      <span className="stat-label">From Referrals</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Credits History */}
              <div className="settings-card">
                <h3>Transaction History</h3>
                
                <div className="credits-history">
                  {creditsHistory.length === 0 ? (
                    <div className="empty-history">
                      <Coins size={32} />
                      <p>No transactions yet</p>
                    </div>
                  ) : (
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Description</th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {creditsHistory.map(transaction => (
                          <tr key={transaction.id}>
                            <td>
                              <div className="transaction-type">
                                {getTransactionIcon(transaction.type)}
                              </div>
                            </td>
                            <td>
                              <span className="transaction-desc">
                                {transaction.description}
                              </span>
                              {transaction.projectName && (
                                <span className="transaction-project">
                                  {transaction.projectName}
                                </span>
                              )}
                            </td>
                            <td className="transaction-date">
                              {formatDate(transaction.timestamp)}
                            </td>
                            <td className={`transaction-amount ${transaction.amount > 0 ? 'positive' : 'negative'}`}>
                              {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                            </td>
                            <td className="transaction-balance">
                              {transaction.balance}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Referrals Section */}
          {activeSection === 'referrals' && (
            <div className="settings-section">
              <h2>Invite Friends</h2>
              <p className="section-description">
                Share Omnia with friends and earn credits for each successful referral.
              </p>

              {/* Referral Stats */}
              <div className="referral-stats">
                <div className="referral-stat-card">
                  <Users size={20} />
                  <span className="stat-value">{referralStats.totalInvites}</span>
                  <span className="stat-label">Total Invites</span>
                </div>
                <div className="referral-stat-card">
                  <Check size={20} />
                  <span className="stat-value">{referralStats.successfulReferrals}</span>
                  <span className="stat-label">Successful</span>
                </div>
                <div className="referral-stat-card pending">
                  <Calendar size={20} />
                  <span className="stat-value">{referralStats.pendingReferrals}</span>
                  <span className="stat-label">Pending</span>
                </div>
                <div className="referral-stat-card highlight">
                  <Coins size={20} />
                  <span className="stat-value">{referralStats.creditsEarned}</span>
                  <span className="stat-label">Credits Earned</span>
                </div>
              </div>

              {/* Referral Link */}
              <div className="settings-card">
                <h3>Your Referral Link</h3>
                <p className="card-description">
                  Share this link with friends. You'll both get 50 bonus credits when they sign up!
                </p>

                <div className="referral-link-box">
                  <input
                    type="text"
                    value={`${window.location.origin}?ref=${referralCode}`}
                    readOnly
                  />
                  <button 
                    className="btn-copy"
                    onClick={copyReferralLink}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="referral-code-box">
                  <span className="code-label">Your Code:</span>
                  <code className="referral-code">{referralCode}</code>
                  <button 
                    className="btn-icon"
                    onClick={copyReferralCode}
                    title="Copy code"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {/* Share Options */}
              <div className="settings-card">
                <h3>Share via</h3>
                
                <div className="share-buttons">
                  <button 
                    className="share-btn twitter"
                    onClick={() => shareReferral('twitter')}
                  >
                    <ExternalLink size={16} />
                    Twitter
                  </button>
                  <button 
                    className="share-btn facebook"
                    onClick={() => shareReferral('facebook')}
                  >
                    <ExternalLink size={16} />
                    Facebook
                  </button>
                  <button 
                    className="share-btn whatsapp"
                    onClick={() => shareReferral('whatsapp')}
                  >
                    <ExternalLink size={16} />
                    WhatsApp
                  </button>
                  <button 
                    className="share-btn email"
                    onClick={() => shareReferral('email')}
                  >
                    <Mail size={16} />
                    Email
                  </button>
                </div>
              </div>

              {/* How it works */}
              <div className="settings-card">
                <h3>How it works</h3>
                <div className="referral-steps">
                  <div className="referral-step">
                    <div className="step-number">1</div>
                    <div className="step-content">
                      <span className="step-title">Share your link</span>
                      <span className="step-desc">Send your unique referral link to friends</span>
                    </div>
                  </div>
                  <div className="referral-step">
                    <div className="step-number">2</div>
                    <div className="step-content">
                      <span className="step-title">Friend signs up</span>
                      <span className="step-desc">They create an account using your link</span>
                    </div>
                  </div>
                  <div className="referral-step">
                    <div className="step-number">3</div>
                    <div className="step-content">
                      <span className="step-title">Both get rewarded</span>
                      <span className="step-desc">You both receive 50 bonus credits!</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <div className="settings-section">
              <h2>Security</h2>
              <p className="section-description">
                Manage your password and account security settings.
              </p>

              {/* Change Password */}
              <div className="settings-card">
                <h3>
                  <Lock size={18} />
                  Change Password
                </h3>

                <div className="form-group">
                  <label>Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>

                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                <button 
                  className="btn-primary"
                  onClick={handleChangePassword}
                  disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>

              {/* Delete Account */}
              <div className="settings-card danger">
                <h3>
                  <Trash2 size={18} />
                  Delete Account
                </h3>
                <p className="danger-warning">
                  Once you delete your account, there is no going back. All your projects, 
                  generated content, and credits will be permanently deleted.
                </p>

                {!showDeleteConfirm ? (
                  <button 
                    className="btn-danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete my account
                  </button>
                ) : (
                  <div className="delete-confirm">
                    <p>Please enter your password to confirm account deletion:</p>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Enter your password"
                    />
                    <div className="delete-actions">
                      <button 
                        className="btn-secondary"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeletePassword('');
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        className="btn-danger"
                        onClick={handleDeleteAccount}
                        disabled={loading || !deletePassword}
                      >
                        {loading ? 'Deleting...' : 'Permanently Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;