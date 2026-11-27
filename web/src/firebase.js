import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const ENV_KEY_MAP = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

const missingEnvKeys = Object.entries(ENV_KEY_MAP)
  .filter(([prop]) => !firebaseConfig[prop])
  .map(([, envName]) => envName);

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

if (missingEnvKeys.length > 0) {
  console.warn(
    `[Smartsa Firebase] Variabel environment belum dikonfigurasi: ${missingEnvKeys.join(
      ', '
    )}. Pastikan file .env diisi agar layanan Firebase Auth dan Cloud Firestore aktif.`
  );
}

let app = null;
let db = null;
let auth = null;

if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    console.warn(
      '[Smartsa Firestore] IndexedDB persistent cache tidak tersedia atau sudah terinisialisasi; fallback ke getFirestore():',
      err?.message || err
    );
    db = getFirestore(app);
  }

  auth = getAuth(app);
}

export { app, db, auth };
