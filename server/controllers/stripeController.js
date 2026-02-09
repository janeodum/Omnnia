// server/controllers/stripeController.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  // Check for base64 encoded key first
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (process.env.FIREBASE_PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  } else if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

// ===========================================
// CREDIT PACKAGES CONFIGURATION
// Matches your LandingPage pricing
// ===========================================
const CREDIT_PACKAGES = {
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    credits: 100,           // ~15 mins of video
    price: 2499,            // $24.99 in cents
    description: '100 coins for Omnia - generates ~15 mins of video',
  },
  storyteller: {
    id: 'storyteller',
    name: 'Storyteller Pack',
    credits: 550,           // ~75 mins of video
    price: 9900,            // $99.00 in cents
    description: '550 coins for Omnia - generates ~75 mins of video (BEST VALUE)',
    popular: true,
  },
  director: {
    id: 'director',
    name: 'Director Pack',
    credits: 1200,          // ~180 mins of video
    price: 19999,           // $199.99 in cents
    description: '1200 coins for Omnia - generates ~180 mins of video (SAVE 20%)',
  },
};

// Default credits for new users
const DEFAULT_CREDITS = 1000; // Testing: increased from 7

/**
 * Get available credit packages
 */
exports.getPackages = async (req, res) => {
  try {
    const packages = Object.values(CREDIT_PACKAGES).map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price / 100, // Convert to dollars for frontend
      priceDisplay: `$${(pkg.price / 100).toFixed(2)}`,
      description: pkg.description,
      popular: pkg.popular || false,
    }));

    res.json({ success: true, packages });
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create a Stripe Checkout session for credit purchase
 */
exports.createCheckout = async (req, res) => {
  try {
    const { userId, userEmail, packageId, successUrl, cancelUrl } = req.body;

    // Validate required fields
    if (!userId || !packageId) {
      return res.status(400).json({ error: 'Missing required fields: userId and packageId are required' });
    }

    // Get the package
    const pkg = CREDIT_PACKAGES[packageId];
    if (!pkg) {
      return res.status(400).json({ 
        error: 'Invalid package', 
        validPackages: Object.keys(CREDIT_PACKAGES) 
      });
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: pkg.name,
              description: pkg.description,
              images: [], // Add product images if you have them
            },
            unit_amount: pkg.price,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancelled`,
      customer_email: userEmail || undefined,
      metadata: {
        userId,
        packageId: pkg.id,
        credits: pkg.credits.toString(),
        packageName: pkg.name,
      },
      // Allow promotion codes
      allow_promotion_codes: true,
    });

    console.log(`✅ Checkout session created for user ${userId}, package: ${pkg.name}`);

    res.json({ 
      success: true,
      checkoutUrl: session.url, 
      sessionId: session.id 
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Handle Stripe webhooks
 */
exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleSuccessfulPayment(session);
        break;
      }

      case 'payment_intent.succeeded': {
        // Optional: Log successful payment intents
        console.log('Payment intent succeeded:', event.data.object.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        // Optional: Log failed payments
        console.log('Payment failed:', event.data.object.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Add credits after successful payment
 */
async function handleSuccessfulPayment(session) {
  const { userId, credits, packageId, packageName } = session.metadata;

  if (!userId || !credits) {
    console.error('Missing metadata in session:', session.id);
    return;
  }

  const userRef = db.collection('users').doc(userId);
  const creditsToAdd = parseInt(credits, 10);

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (userDoc.exists) {
        const currentCredits = userDoc.data().credits || 0;
        transaction.update(userRef, {
          credits: currentCredits + creditsToAdd,
          lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
          stripeCustomerId: session.customer || null,
          totalPurchased: admin.firestore.FieldValue.increment(creditsToAdd),
        });
      } else {
        // Create new user document
        transaction.set(userRef, {
          credits: creditsToAdd,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
          stripeCustomerId: session.customer || null,
          totalPurchased: creditsToAdd,
        });
      }

      // Log the transaction for audit trail
      const transactionRef = db.collection('users').doc(userId).collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'purchase',
        amount: creditsToAdd,
        packageId: packageId,
        packageName: packageName,
        priceUsd: session.amount_total / 100,
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    console.log(`✅ Added ${creditsToAdd} credits to user ${userId} (${packageName})`);
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
}

/**
 * Get user's credit balance
 */
exports.getCredits = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      // Return default credits for new users
      return res.json({ 
        credits: DEFAULT_CREDITS, 
        isNewUser: true 
      });
    }

    const data = userDoc.data();
    res.json({
      credits: data.credits ?? DEFAULT_CREDITS,
      totalPurchased: data.totalPurchased || 0,
      lastPurchase: data.lastPurchase?.toDate?.() || null,
      isNewUser: false,
    });
  } catch (error) {
    console.error('Get credits error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Deduct credits (called after successful generation)
 */
exports.deductCredits = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: 'Missing required fields: userId and amount' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const userRef = db.collection('users').doc(userId);

    const result = await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const currentCredits = userDoc.data().credits || 0;

      if (currentCredits < amount) {
        throw new Error(`Insufficient credits. Have: ${currentCredits}, Need: ${amount}`);
      }

      const newBalance = currentCredits - amount;

      transaction.update(userRef, {
        credits: newBalance,
        lastDeduction: admin.firestore.FieldValue.serverTimestamp(),
        totalUsed: admin.firestore.FieldValue.increment(amount),
      });

      // Log the deduction
      const transactionRef = db.collection('users').doc(userId).collection('transactions').doc();
      transaction.set(transactionRef, {
        type: 'deduction',
        amount: -amount,
        reason: reason || 'generation',
        balanceAfter: newBalance,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, newBalance };
    });

    console.log(`💳 Deducted ${amount} credits from user ${userId}. New balance: ${result.newBalance}`);
    res.json(result);
  } catch (error) {
    console.error('Deduct credits error:', error);
    res.status(400).json({ error: error.message });
  }
};

/**
 * Get user's transaction history
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const transactionsRef = db.collection('users').doc(userId).collection('transactions');
    const snapshot = await transactionsRef
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit, 10))
      .get();

    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || null,
    }));

    res.json({ success: true, transactions });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Verify a checkout session (for success page)
 */
exports.verifySession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const pkg = CREDIT_PACKAGES[session.metadata.packageId];

      res.json({
        success: true,
        status: 'paid',
        credits: parseInt(session.metadata.credits, 10),
        packageName: session.metadata.packageName || pkg?.name || 'Credit Pack',
        amount: session.amount_total / 100,
      });
    } else {
      res.json({
        success: false,
        status: session.payment_status,
      });
    }
  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Reset credits to 1000 for testing (DEV ONLY)
 * DELETE THIS ENDPOINT BEFORE PRODUCTION
 *
 * Usage (from deployed frontend):
 * fetch('https://your-railway-url.up.railway.app/api/credits/reset-for-testing', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ userId: 'your-user-id' })
 * })
 */
exports.resetCreditsForTesting = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const userRef = db.collection('users').doc(userId);

    // Use nested structure to match client-side code (credits.balance)
    await userRef.set({
      credits: {
        balance: 1000,
        totalEarned: 1000,
        totalSpent: 0,
        referralEarned: 0,
      },
      creditsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`✅ Credits reset to 1000 for user: ${userId}`);

    res.json({
      success: true,
      message: 'Credits reset to 1000 for testing',
      credits: 1000
    });
  } catch (error) {
    console.error('Reset credits error:', error);
    res.status(500).json({ error: error.message });
  }
};