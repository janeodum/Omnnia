// src/UserMenu.js
import React, { useState, useRef, useEffect } from "react";
import { auth } from "./firebaseConfig";
import { signOut } from "firebase/auth";
import {
  LogOut,
  Settings,
  UserPlus,
  ChevronDown,
  Sparkles,
} from "lucide-react";

function UserMenu({ user, onNavigate }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const displayName =
    user?.displayName || user?.email?.split("@")[0] || "Creator";
  const email = user?.email || "creator@omnia.ai";
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
      alert("Failed to sign out. Please try again.");
    }
  };

  const handleSettingsClick = () => {
    setOpen(false);
    if (onNavigate) {
      onNavigate('settings');
    }
  };

  const handleInviteClick = () => {
    setOpen(false);
    if (onNavigate) {
      onNavigate('settings', 'referrals');
    }
  };

  const handleUpgradeClick = () => {
    setOpen(false);
    if (onNavigate) {
      onNavigate('settings', 'credits');
    }
  };

  return (
    <div className="user-menu" ref={menuRef}>
      {/* Trigger pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`user-menu-trigger ${open ? "open" : ""}`}
      >
        {/* Avatar */}
        <div className="user-avatar-wrapper">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="user-avatar-img"
            />
          ) : (
            <div className="user-avatar-fallback">
              {initial}
            </div>
          )}
          <div className="user-status-dot" />
        </div>

        <div className="user-menu-text"></div>

        <ChevronDown
          className={`user-menu-chevron ${open ? "open" : ""}`}
          size={14}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-card">
            {/* Header */}
            <div className="user-menu-header">
              <span className="user-badge">Beta user</span>
              <p className="user-header-name">{displayName}</p>
              <p className="user-header-email">{email}</p>
            </div>

            {/* Items */}
            <div className="user-menu-items">
              <button className="user-menu-item" onClick={handleUpgradeClick}>
                <div className="user-menu-icon highlight">
                  <Sparkles size={16} />
                </div>
                <div className="user-menu-item-text">
                  <span className="user-menu-item-title">
                    Upgrade plan
                  </span>
                  <span className="user-menu-item-sub">
                    Get unlimited generations
                  </span>
                </div>
              </button>

              <button className="user-menu-item" onClick={handleSettingsClick}>
                <div className="user-menu-icon">
                  <Settings size={16} />
                </div>
                <span>Settings</span>
              </button>

              <button className="user-menu-item" onClick={handleInviteClick}>
                <div className="user-menu-icon">
                  <UserPlus size={16} />
                </div>
                <span>Invite friends</span>
              </button>
            </div>

            {/* Footer */}
            <div className="user-menu-footer">
              <button
                type="button"
                onClick={handleLogout}
                className="user-menu-logout"
              >
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserMenu;