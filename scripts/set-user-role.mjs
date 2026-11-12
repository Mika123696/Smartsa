/**
 * Admin CLI script to assign a user's role (student | lecturer | admin)
 * in both Firebase Auth Custom Claims and Firestore `users/{uid}`.
 *
 * Usage:
 *   node scripts/set-user-role.mjs --email user@example.com --role lecturer --nim 0012058402
 *   node scripts/set-user-role.mjs --uid <uid> --role admin
 */

import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const VALID_ROLES = new Set(['student', 'lecturer', 'admin']);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function initFirebaseAdmin() {
  if (getApps().length > 0) return;

  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({ credential: cert(parsed) });
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim();
  const uid = args.uid?.trim();
  const role = args.role?.trim().toLowerCase();
  const nim = args.nim?.trim();

  if ((!email && !uid) || !role || !VALID_ROLES.has(role)) {
    console.error(
      'Usage: node scripts/set-user-role.mjs (--email <email> | --uid <uid>) --role <student|lecturer|admin> [--nim <id>]'
    );
    process.exit(1);
  }

  initFirebaseAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const userRecord = uid ? await auth.getUser(uid) : await auth.getUserByEmail(email);

  const existingClaims = userRecord.customClaims || {};
  await auth.setCustomUserClaims(userRecord.uid, {
    ...existingClaims,
    role,
  });

  const firestoreUpdate = {
    uid: userRecord.uid,
    email: userRecord.email || email || '',
    role,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (nim) {
    firestoreUpdate.nim = nim;
    if (role === 'lecturer') {
      firestoreUpdate.nidn = nim;
    }
  }

  await db.collection('users').doc(userRecord.uid).set(firestoreUpdate, { merge: true });

  console.log(
    `[set-user-role] Updated uid=${userRecord.uid} (${userRecord.email || 'no-email'}) -> role=${role}${nim ? `, nim=${nim}` : ''}`
  );
}

main().catch((err) => {
  console.error('[set-user-role] Failed:', err.message);
  process.exitCode = 1;
});
