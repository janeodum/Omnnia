// src/components/UpgradeModal.jsx
import React, { useState } from 'react';
import { X, Sparkles, Film, Check, Loader } from 'lucide-react';
import './UpgradeModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Package IDs MUST match server's CREDIT_PACKAGES keys exactly
const CREDIT_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 100,
    price: 24.99,
    description: '~15 mins of video',
    features: ['Generates ~15 mins of video', 'Standard Generation Speed', 'Includes narration & music'],
    popular: false,
  },
  {
    id: 'storyteller',
    name: 'Storyteller',
    credits: 550,
    price: 99.00,
    description: '~75 mins of video',
    features: ['Generates ~75 mins of video', 'Perfect for full stories', 'Priority Processing Queue', 'Includes narration & music'],
    popular: true,
    savings: 'BEST VALUE',
  },
  {
    id: 'director',
    name: 'Director',
    credits: 1200,
    price: 199.99,
    description: '~180 mins of video',
    features: ['Generates ~180 mins of video', 'Unlimited projects', 'Fastest processing', 'Includes narration & music'],
    popular: false,
    savings: 'SAVE 20%',
  },
];

const UpgradeModal = ({ user, currentCredits = 0, onClose, onPurchaseComplete }) => {
  const [selectedPackage, setSelectedPackage] = useState('storyteller');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePurchase = async (packageId) => {
    if (!user) {
      setError('Please sign in to purchase credits');
      return;
    }

    setLoading(true);
    setSelectedPackage(packageId);
    setError(null);

    try {
      console.log('Purchasing package:', packageId);
      
      const response = await fetch(`${API_URL}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email,
          packageId: packageId,
          successUrl: `${window.location.origin}?payment=success`,
          cancelUrl: `${window.location.origin}?payment=cancelled`,
        }),
      });

      const data = await response.json();
      console.log('Checkout response:', data);

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to start purchase. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="upgrade-modal-overlay" onClick={onClose}>
      <div className="upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upgrade-header">
          <div className="upgrade-title">
            <Sparkles className="title-icon" size={24} />
            <div>
              <h2>Get More Coins</h2>
              <p>Purchase coins to generate more videos</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="current-balance">
          <span className="balance-label">Current Balance:</span>
          <span className="balance-value">
            <Sparkles size={16} />
            {currentCredits} coins
          </span>
        </div>

        <div className="conversion-info">
          <Film size={16} />
          <span>Approx. 6-7 Coins per Minute of Video (varies by scene count & narration)</span>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        <div className="packages-grid">
          {CREDIT_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`package-card ${pkg.popular ? 'popular' : ''} ${selectedPackage === pkg.id ? 'selected' : ''}`}
              onClick={() => setSelectedPackage(pkg.id)}
            >
              {pkg.popular && <div className="popular-badge">Most Popular</div>}
              {pkg.savings && <div className="savings-badge">{pkg.savings}</div>}

              <div className="package-header">
                <span className="package-tier">{pkg.name}</span>
                <div className="package-credits">
                  <span className="credits-number">{pkg.credits}</span>
                  <span className="credits-label">Coins</span>
                </div>
                <div className="package-price">${pkg.price}</div>
              </div>

              <div className="package-features">
                {pkg.features.map((feature, idx) => (
                  <div key={idx} className="feature-item">
                    <Check size={14} className="feature-check" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                className={`purchase-btn ${pkg.popular ? 'primary' : 'secondary'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePurchase(pkg.id);
                }}
                disabled={loading}
              >
                {loading && selectedPackage === pkg.id ? (
                  <>
                    <Loader className="spinning" size={16} />
                    Processing...
                  </>
                ) : (
                  'Purchase'
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="upgrade-footer">
          <p>Secure payment powered by Stripe. Coins never expire.</p>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;