/**
 * One-time migration script to remove legacy plaintext `password` fields
 * from all documents in the Firestore `users` collection.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/sanitize-users.mjs --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/sanitize-users.mjs
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';

const isDryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;

function initFirebaseAdmin() {
  if (getApps().length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    initializeApp({
      credential: cert(parsed),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}),
  });
}

async function sanitizeUsers() {
  initFirebaseAdmin();
  const db = getFirestore();
  const usersRef = db.collection('users');

  let scanned = 0;
  let affected = 0;
  let sanitized = 0;
  let lastDoc = null;

  console.log(`[sanitize-users] Starting scan (dryRun=${isDryRun})...`);

  while (true) {
    let query = usersRef.orderBy(FieldPath.documentId()).limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const docsWithPassword = [];
    for (const docSnap of snapshot.docs) {
      scanned += 1;
      const data = docSnap.data();
      if (Object.prototype.hasOwnProperty.call(data, 'password')) {
        affected += 1;
        docsWithPassword.push(docSnap.ref);
      }
    }

    if (docsWithPassword.length > 0) {
      if (isDryRun) {
        console.log(
          `[dry-run] Would delete \`password\` field from ${docsWithPassword.length} user doc(s) in current page.`
        );
      } else {
        const batch = db.batch();
        for (const ref of docsWithPassword) {
          batch.update(ref, {
            password: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        sanitized += docsWithPassword.length;
        console.log(`[sanitize-users] Scrubbed ${docsWithPassword.length} user doc(s).`);
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < BATCH_SIZE) break;
  }

  console.log(
    `[sanitize-users] Done. scanned=${scanned}, affected=${affected}, sanitized=${sanitized}, dryRun=${isDryRun}`
  );
}

sanitizeUsers().catch((err) => {
  console.error('[sanitize-users] Failed:', err.message);
  process.exitCode = 1;
});
