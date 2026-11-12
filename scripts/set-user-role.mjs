/**
 * Admin CLI script to create (optional) and/or assign a user's role (student | lecturer | admin)
 * in both Firebase Auth Custom Claims and Firestore `users/{uid}`.
 *
 * Usage (promote existing user):
 *   node scripts/set-user-role.mjs --email user@example.com --role lecturer --nim 0012058402
 *   node scripts/set-user-role.mjs --uid <uid> --role admin
 *
 * Usage (create user if not exists + assign role):
 *   node scripts/set-user-role.mjs --create --email dosen@smartsa.edu --password "PasswordKuat123!" --name "Dr. Andi Saputra" --role lecturer --nim 0012058402
 *   node scripts/set-user-role.mjs --create --email admin@smartsa.edu --password "PasswordKuat123!" --name "Admin Smartsa" --role admin
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
    if (typeof parsed.private_key === 'string') {
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

function printUsage() {
  console.error(
    [
      'Usage:',
      '  Promote existing user:',
      '    node scripts/set-user-role.mjs (--email <email> | --uid <uid>) --role <student|lecturer|admin> [--nim <id>] [--name <displayName>] [--institution <name>]',
      '  Create new user (if missing) & assign role:',
      '    node scripts/set-user-role.mjs --create --email <email> --password <min6chars> --role <student|lecturer|admin> [--name <displayName>] [--nim <id>] [--institution <name>] [--unverified]',
      '',
      'Tip: Password can also be passed via USER_PASSWORD environment variable instead of --password.',
    ].join('\n')
  );
}

async function resolveOrCreateUser(auth, { shouldCreate, email, uid, password, displayName, emailVerified }) {
  if (uid) {
    return { userRecord: await auth.getUser(uid), created: false };
  }

  try {
    const existing = await auth.getUserByEmail(email);
    if (displayName && existing.displayName !== displayName) {
      await auth.updateUser(existing.uid, { displayName });
    }
    return { userRecord: await auth.getUser(existing.uid), created: false };
  } catch (err) {
    if (err?.code !== 'auth/user-not-found' || !shouldCreate) {
      throw err;
    }
  }

  if (!password || password.length < 6) {
    throw new Error('Password minimal 6 karakter wajib diisi (--password atau env USER_PASSWORD) saat menggunakan --create.');
  }

  const resolvedName = displayName || email.split('@')[0];
  const createdUser = await auth.createUser({
    email,
    password,
    displayName: resolvedName,
    emailVerified,
  });

  return { userRecord: createdUser, created: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const shouldCreate = args.create === 'true';
  const email = args.email?.trim().toLowerCase();
  const uid = args.uid?.trim();
  const role = args.role?.trim().toLowerCase();
  const nim = args.nim?.trim();
  const displayName = args.name?.trim();
  const institution = args.institution?.trim();
  const password = args.password || process.env.USER_PASSWORD || '';
  const emailVerified = args.unverified !== 'true';

  if ((!email && !uid) || !role || !VALID_ROLES.has(role) || (shouldCreate && !email)) {
    printUsage();
    process.exit(1);
  }

  initFirebaseAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const { userRecord, created } = await resolveOrCreateUser(auth, {
    shouldCreate,
    email,
    uid,
    password,
    displayName,
    emailVerified,
  });

  const existingClaims = userRecord.customClaims || {};
  await auth.setCustomUserClaims(userRecord.uid, {
    ...existingClaims,
    role,
  });

  const userDocRef = db.collection('users').doc(userRecord.uid);
  const existingDoc = await userDocRef.get();

  const firestoreUpdate = {
    uid: userRecord.uid,
    email: userRecord.email || email || '',
    displayName: displayName || userRecord.displayName || (userRecord.email ? userRecord.email.split('@')[0] : 'Pengguna Smartsa'),
    role,
    institution: institution || existingDoc.data()?.institution || 'Universitas Negeri Surabaya',
    emailVerified: Boolean(userRecord.emailVerified),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existingDoc.exists) {
    firestoreUpdate.photoURL = userRecord.photoURL || null;
    firestoreUpdate.nim = nim || '';
    firestoreUpdate.createdAt = FieldValue.serverTimestamp();
  }

  if (nim) {
    firestoreUpdate.nim = nim;
    if (role === 'lecturer') {
      firestoreUpdate.nidn = nim;
    }
  }

  await userDocRef.set(firestoreUpdate, { merge: true });

  console.log(
    `[set-user-role] ${created ? 'Created' : 'Updated'} uid=${userRecord.uid} (${userRecord.email || 'no-email'}) -> role=${role}${nim ? `, nim=${nim}` : ''}`
  );
}

main().catch((err) => {
  console.error('[set-user-role] Failed:', err.message);
  process.exitCode = 1;
});
