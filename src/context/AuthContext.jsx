import { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ROLES } from '../constants/roles';
import { setLocalExamSession } from '../services/aiService';
import { clearDemoAttendanceStore } from '../services/attendanceService';
import { AuthContext } from './authContextDef';

const LEGACY_STORAGE_KEYS = [
  'smartsa_active_profile',
  'smartsa_registered_accounts',
];

const clearLegacyAuthStorage = () => {
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Gagal membersihkan cache autentikasi lama:', e);
  }
};

const stripSensitiveFields = (data) => {
  if (!data || typeof data !== 'object') return null;
  const { password: _removedPassword, ...safeData } = data;
  return safeData;
};

const sanitizeRole = (value) => {
  if (value === ROLES.ADMIN) return ROLES.ADMIN;
  if (value === ROLES.LECTURER) return ROLES.LECTURER;
  return ROLES.STUDENT;
};

const isAuthProfilePhotoUrlSafe = (url) => {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return false;
  return (
    (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
    trimmed.length <= 2048
  );
};

const buildReadOnlyFallbackProfile = (firebaseUser, firestoreData = null) => {
  const safeFs = stripSensitiveFields(firestoreData);
  const email = firebaseUser?.email || safeFs?.email || '';
  const resolvedRole = sanitizeRole(safeFs?.role);
  const fsDisplayName = typeof safeFs?.displayName === 'string' ? safeFs.displayName.trim() : '';
  const fsName = typeof safeFs?.name === 'string' ? safeFs.name.trim() : '';
  const authName = typeof firebaseUser?.displayName === 'string' ? firebaseUser.displayName.trim() : '';
  const resolvedName =
    fsDisplayName ||
    fsName ||
    authName ||
    (email ? email.split('@')[0] : '') ||
    (resolvedRole === ROLES.ADMIN
      ? 'Administrator'
      : resolvedRole === ROLES.LECTURER
        ? 'Dosen Pengajar'
        : 'Mahasiswa');

  const resolvedPhotoURL =
    safeFs && 'photoURL' in safeFs
      ? safeFs.photoURL
      : isAuthProfilePhotoUrlSafe(firebaseUser?.photoURL)
        ? firebaseUser.photoURL
        : null;

  const resolvedInstitution =
    safeFs?.institution ||
    (resolvedRole === ROLES.ADMIN
      ? 'Smartsa Central Administration'
      : 'Universitas Negeri Surabaya');

  const resolvedNidn = resolvedRole === ROLES.LECTURER ? safeFs?.nidn || safeFs?.nim || '' : '';
  const resolvedNip = resolvedRole === ROLES.ADMIN ? safeFs?.nip || safeFs?.nim || '' : '';
  const resolvedNim =
    resolvedRole === ROLES.LECTURER
      ? resolvedNidn
      : resolvedRole === ROLES.ADMIN
        ? resolvedNip
        : safeFs?.nim || '';

  return {
    ...(safeFs || {}),
    uid: firebaseUser.uid,
    email,
    name: fsName || resolvedName,
    displayName: resolvedName,
    role: resolvedRole,
    accountType: safeFs?.accountType || 'UMUM',
    isInstitutional: Boolean(safeFs?.isInstitutional),
    institution: resolvedInstitution,
    nim: resolvedNim,
    nidn: resolvedNidn,
    nip: resolvedNip,
    photoURL: resolvedPhotoURL,
    emailVerified: Boolean(firebaseUser?.emailVerified),
    isDemoMode: false,
  };
};

async function syncProfileViaBootstrap(firebaseUser, bootstrapPayload = {}) {
  if (!firebaseUser?.uid) return null;

  try {
    const idToken =
      typeof firebaseUser.getIdToken === 'function' ? await firebaseUser.getIdToken() : '';

    if (idToken && typeof fetch === 'function') {
      const res = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(bootstrapPayload || {}),
      });
      const isJson = res?.headers?.get?.('content-type')?.includes('application/json');
      if (res?.ok && isJson) {
        const data = await res.json().catch(() => null);
        if (data?.profile && typeof data.profile === 'object') {
          const safeProfile = stripSensitiveFields(data.profile);
          const resolvedRole = sanitizeRole(safeProfile.role);
          const resolvedName =
            String(safeProfile.displayName || safeProfile.name || firebaseUser.displayName || '').trim() ||
            (safeProfile.email ? safeProfile.email.split('@')[0] : 'Mahasiswa');

          return {
            ...safeProfile,
            uid: firebaseUser.uid,
            email: safeProfile.email || firebaseUser.email || '',
            name: safeProfile.name || resolvedName,
            displayName: resolvedName,
            role: resolvedRole,
            accountType: safeProfile.accountType || 'UMUM',
            isInstitutional: Boolean(safeProfile.isInstitutional),
            emailVerified: Boolean(safeProfile.emailVerified ?? firebaseUser.emailVerified),
            isDemoMode: false,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Bootstrap API (/api/bootstrap) gagal, beralih ke fallback read-only:', err?.message || err);
  }

  let firestoreData = null;
  if (db) {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDoc.exists()) {
        firestoreData = stripSensitiveFields(userDoc.data());
      }
    } catch (err) {
      console.warn('Firestore read-only fallback getDoc gagal:', err);
    }
  }

  return buildReadOnlyFallbackProfile(firebaseUser, firestoreData);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [role, setRole] = useState(ROLES.STUDENT);
  const [loading, setLoading] = useState(() => Boolean(auth));
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [authError, setAuthError] = useState(null);
  const lastAuthUidRef = useRef(null);
  const authSyncSeqRef = useRef(0);

  useEffect(() => {
    clearLegacyAuthStorage();

    if (!auth) {
      return undefined;
    }

    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const seq = ++authSyncSeqRef.current;
      if (user) {
        if (lastAuthUidRef.current !== null && lastAuthUidRef.current !== user.uid) {
          setLocalExamSession({ active: false });
          clearDemoAttendanceStore();
        }
        lastAuthUidRef.current = user.uid;

        const profile = await syncProfileViaBootstrap(user);
        if (!isMounted || seq !== authSyncSeqRef.current) return;

        setCurrentUser(user);
        setIsDemoMode(false);
        setUserProfile(profile);
        setRole(profile?.role || ROLES.STUDENT);
      } else {
        lastAuthUidRef.current = null;
        setLocalExamSession({ active: false });
        clearDemoAttendanceStore();
        setCurrentUser(null);
        setIsDemoMode(true);
        setUserProfile(null);
        setRole(ROLES.STUDENT);
      }
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const ensureFirebaseAuth = () => {
    if (!auth) {
      const err = new Error(
        'Layanan Firebase Auth belum dikonfigurasi. Lengkapi VITE_FIREBASE_* pada file .env.'
      );
      err.code = 'auth/not-configured';
      setAuthError(err.message);
      throw err;
    }
  };

  // 1. Login dengan Email & Kata Sandi (sinkronisasi role & profil lewat POST /api/bootstrap)
  const login = async (email, password) => {
    setAuthError(null);
    ensureFirebaseAuth();
    const cleanEmail = (email || '').trim().toLowerCase();
    const enteredPassword = password || '';

    if (!cleanEmail || !enteredPassword) {
      const err = new Error('Email dan kata sandi wajib diisi.');
      err.code = 'auth/invalid-credential';
      setAuthError(err.message);
      throw err;
    }

    try {
      const seq = ++authSyncSeqRef.current;
      const res = await signInWithEmailAndPassword(auth, cleanEmail, enteredPassword);
      const fbUser = res.user;
      const fullProfile = await syncProfileViaBootstrap(fbUser);
      if (seq !== authSyncSeqRef.current) return fbUser;

      setCurrentUser(fbUser);
      setUserProfile(fullProfile);
      setRole(fullProfile?.role || ROLES.STUDENT);
      setIsDemoMode(false);
      return fbUser;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 2. Registrasi Akun Baru (inisialisasi dokumen & klasifikasi domain dilakukan server via /api/bootstrap)
  const register = async (
    email,
    password,
    displayName,
    _selectedRole = ROLES.STUDENT,
    institution = '',
    nim = ''
  ) => {
    setAuthError(null);
    ensureFirebaseAuth();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName =
      (displayName || '').trim() || (cleanEmail ? cleanEmail.split('@')[0] : 'Mahasiswa');
    const cleanNim = (nim || '').trim();
    const cleanInstitution = (institution || '').trim();

    try {
      const seq = ++authSyncSeqRef.current;
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);

      try {
        await updateProfile(res.user, { displayName: cleanName });
      } catch (upErr) {
        console.warn('updateProfile error:', upErr);
      }

      try {
        await sendEmailVerification(res.user);
      } catch (e) {
        console.warn('sendEmailVerification diabaikan:', e);
      }

      const serverProfile = await syncProfileViaBootstrap(res.user, {
        displayName: cleanName,
        ...(cleanInstitution ? { institution: cleanInstitution } : {}),
        ...(cleanNim ? { nim: cleanNim } : {}),
      });
      if (seq !== authSyncSeqRef.current) return res.user;

      setCurrentUser(res.user);
      setUserProfile(serverProfile);
      setRole(serverProfile?.role || ROLES.STUDENT);
      setIsDemoMode(false);
      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 3. Login dengan Akun Google (inisialisasi & proteksi role via POST /api/bootstrap)
  const loginWithGoogle = async () => {
    setAuthError(null);
    ensureFirebaseAuth();
    try {
      const seq = ++authSyncSeqRef.current;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);

      const googleProfile = await syncProfileViaBootstrap(res.user, { provider: 'google.com' });
      if (seq !== authSyncSeqRef.current) return res.user;

      setCurrentUser(res.user);
      setUserProfile(googleProfile);
      setRole(googleProfile?.role || ROLES.STUDENT);
      setIsDemoMode(false);

      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 4. Login dengan Akun GitHub (inisialisasi & proteksi role via POST /api/bootstrap)
  const loginWithGithub = async () => {
    setAuthError(null);
    ensureFirebaseAuth();
    try {
      const seq = ++authSyncSeqRef.current;
      const provider = new GithubAuthProvider();
      const res = await signInWithPopup(auth, provider);

      const githubProfile = await syncProfileViaBootstrap(res.user, { provider: 'github.com' });
      if (seq !== authSyncSeqRef.current) return res.user;

      setCurrentUser(res.user);
      setUserProfile(githubProfile);
      setRole(githubProfile?.role || ROLES.STUDENT);
      setIsDemoMode(false);

      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 5. Keluar Akun (Logout)
  const logout = async () => {
    try {
      if (auth?.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn('SignOut error:', e);
    }
    lastAuthUidRef.current = null;
    clearLegacyAuthStorage();
    setLocalExamSession({ active: false });
    clearDemoAttendanceStore();
    setCurrentUser(null);
    setIsDemoMode(true);
    setUserProfile(null);
    setRole(ROLES.STUDENT);
  };

  // 6. Reset Kata Sandi via Email
  const resetPassword = async (email) => {
    setAuthError(null);
    ensureFirebaseAuth();
    const cleanEmail = (email || '').trim();
    if (!cleanEmail) {
      const err = new Error('Email wajib diisi.');
      err.code = 'auth/invalid-email';
      setAuthError(err.message);
      throw err;
    }
    try {
      return await sendPasswordResetEmail(auth, cleanEmail);
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 7. Update Foto Profil Pengguna (skip Base64 data: URL pada Firebase Auth updateProfile)
  const updateUserPhoto = async (photoURL) => {
    if (!photoURL || typeof photoURL !== 'string') return;
    const cleanPhoto = photoURL.trim();

    setUserProfile((prev) =>
      prev ? { ...prev, photoURL: cleanPhoto } : { photoURL: cleanPhoto }
    );

    const activeUser = auth?.currentUser || currentUser;
    if (activeUser && !isDemoMode) {
      if (!cleanPhoto.startsWith('data:') && isAuthProfilePhotoUrlSafe(cleanPhoto)) {
        try {
          await updateProfile(activeUser, { photoURL: cleanPhoto });
        } catch (err) {
          console.warn('Gagal update Firebase Auth photoURL:', err);
        }
      }
      if (db) {
        try {
          await setDoc(
            doc(db, 'users', activeUser.uid),
            { photoURL: cleanPhoto, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } catch (err) {
          console.warn('Gagal update Firestore user photoURL:', err);
        }
      }
    }
  };

  // 8. Update Data Profil Akademik dengan whitelist field & Base64 Guard pada Firebase Auth updateProfile
  const updateUserProfileData = async (newData) => {
    if (!newData || typeof newData !== 'object') return;

    const sanitizedUpdate = {};
    if (typeof newData.displayName === 'string' && newData.displayName.trim()) {
      sanitizedUpdate.displayName = newData.displayName.trim();
    }
    if (typeof newData.institution === 'string' && newData.institution.trim()) {
      sanitizedUpdate.institution = newData.institution.trim();
    }
    if (typeof newData.photoURL === 'string' && newData.photoURL.trim()) {
      sanitizedUpdate.photoURL = newData.photoURL.trim();
    }

    if (Object.keys(sanitizedUpdate).length === 0) return;

    setUserProfile((prev) =>
      prev ? { ...prev, ...sanitizedUpdate } : { ...sanitizedUpdate }
    );

    const activeUser = auth?.currentUser || currentUser;
    if (activeUser && !isDemoMode) {
      const authProfileUpdates = {};
      if (sanitizedUpdate.displayName) {
        authProfileUpdates.displayName = sanitizedUpdate.displayName;
      }
      if (
        sanitizedUpdate.photoURL &&
        !sanitizedUpdate.photoURL.startsWith('data:') &&
        isAuthProfilePhotoUrlSafe(sanitizedUpdate.photoURL)
      ) {
        authProfileUpdates.photoURL = sanitizedUpdate.photoURL;
      }

      if (Object.keys(authProfileUpdates).length > 0) {
        try {
          await updateProfile(activeUser, authProfileUpdates);
        } catch (err) {
          console.warn('Gagal update Firebase Auth profile:', err);
        }
      }

      if (db) {
        try {
          await setDoc(
            doc(db, 'users', activeUser.uid),
            { ...sanitizedUpdate, updatedAt: serverTimestamp() },
            { merge: true }
          );
        } catch (err) {
          console.warn('Gagal update Firestore user data:', err);
        }
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        role,
        loading,
        isDemoMode,
        authError,
        login,
        register,
        loginWithGoogle,
        loginWithGithub,
        logout,
        resetPassword,
        updateUserPhoto,
        updateUserProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
