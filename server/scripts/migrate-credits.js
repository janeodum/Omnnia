/**
 * One-time migration script to update existing users' credits to 1000 for testing
 *
 * Usage: node scripts/migrate-credits.js
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin (using environment variables)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function migrateCredits() {
  try {
    console.log('🚀 Starting credit migration...\n');

    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      console.log('No users found in database.');
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;

    const batch = db.batch();

    snapshot.forEach((doc) => {
      const userData = doc.data();

      // Support both old format (credits) and new format (credits.balance)
      const currentCredits = userData.credits?.balance ?? userData.credits ?? 0;

      // Only update users with less than 1000 credits
      if (currentCredits < 1000) {
        console.log(`📝 Updating user ${doc.id}: ${currentCredits} → 1000 credits`);

        // Update using nested structure to match client-side code
        batch.update(doc.ref, {
          'credits.balance': 1000,
          'credits.totalEarned': admin.firestore.FieldValue.increment(1000 - currentCredits),
          creditsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        updatedCount++;
      } else {
        console.log(`⏭️  Skipping user ${doc.id}: already has ${currentCredits} credits`);
        skippedCount++;
      }
    });

    // Commit the batch update
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`\n✅ Migration complete!`);
      console.log(`   Updated: ${updatedCount} users`);
      console.log(`   Skipped: ${skippedCount} users`);
    } else {
      console.log(`\n✅ No users needed updating.`);
      console.log(`   All ${skippedCount} users already have 1000+ credits.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateCredits();
