import { useState, useEffect } from 'react';
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
import { DEMO_USERS } from '../services/mockData';
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

const buildUserProfile = (firebaseUser, firestoreData = null) => {
  const safeFs = stripSensitiveFields(firestoreData);
  const resolvedRole = sanitizeRole(safeFs?.role);
  const resolvedName =
    safeFs?.displayName ||
    firebaseUser.displayName ||
    (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Pengguna Smartsa');
  const resolvedNim = safeFs?.nim || safeFs?.nidn || safeFs?.nip || '';
  const resolvedInstitution = safeFs?.institution || 'Universitas Negeri Surabaya';
  const resolvedPhotoURL = safeFs?.photoURL || firebaseUser.photoURL || null;

  return {
    ...(safeFs || {}),
    uid: firebaseUser.uid,
    email: firebaseUser.email || safeFs?.email || '',
    displayName: resolvedName,
    role: resolvedRole,
    institution: resolvedInstitution,
    nim: resolvedNim,
    ...(resolvedRole === ROLES.LECTURER && resolvedNim ? { nidn: resolvedNim } : {}),
    photoURL: resolvedPhotoURL,
    emailVerified: Boolean(firebaseUser.emailVerified),
    isDemoMode: false,
  };
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(DEMO_USERS.student);
  const [role, setRole] = useState(ROLES.STUDENT);
  const [loading, setLoading] = useState(() => Boolean(auth));
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    clearLegacyAuthStorage();

    if (!auth) {
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsDemoMode(false);

        let firestoreData = null;
        let docExists = false;
        if (db) {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              docExists = true;
              firestoreData = stripSensitiveFields(userDoc.data());
            }
          } catch (err) {
            console.warn('Firestore getDoc gagal:', err);
          }
        }

        const profile = buildUserProfile(user, firestoreData);
        setUserProfile(profile);
        setRole(profile.role);

        // Hanya buat dokumen awal jika belum ada (role wajib 'student' sesuai firestore.rules)
        if (!docExists && db) {
          try {
            const initialDoc = {
              uid: profile.uid,
              email: profile.email,
              displayName: profile.displayName,
              role: ROLES.STUDENT,
              institution: profile.institution,
              nim: profile.nim,
              photoURL: profile.photoURL,
              emailVerified: profile.emailVerified,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', user.uid), initialDoc);
          } catch (e) {
            console.warn('Sinkronisasi dokumen awal ke Firestore diabaikan:', e);
          }
        }
      } else {
        setCurrentUser(null);
        setIsDemoMode(true);
        setUserProfile(DEMO_USERS.student);
        setRole(ROLES.STUDENT);
      }
      setLoading(false);
    });

    return () => unsubscribe();
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

  // 1. Login dengan Email & Kata Sandi (Firebase Auth murni, tanpa menimpa role di Firestore)
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
      const res = await signInWithEmailAndPassword(auth, cleanEmail, enteredPassword);
      const fbUser = res.user;

      let fsData = null;
      if (db) {
        try {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            fsData = stripSensitiveFields(userDoc.data());
          }
        } catch (e) {
          console.warn('Firestore getDoc error:', e);
        }
      }

      const fullProfile = buildUserProfile(fbUser, fsData);
      setCurrentUser(fbUser);
      setUserProfile(fullProfile);
      setRole(fullProfile.role);
      setIsDemoMode(false);
      return fbUser;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 2. Registrasi Akun Baru dengan Email & Password (selalu role: 'student' sesuai firestore.rules)
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
    const safeRole = ROLES.STUDENT;
    const cleanName = (displayName || '').trim() || (cleanEmail ? cleanEmail.split('@')[0] : 'Pengguna Smartsa');
    const cleanNim = (nim || '').trim();
    const cleanInstitution = (institution || '').trim() || 'Universitas Negeri Surabaya';

    try {
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

      const newUserDoc = {
        uid: res.user.uid,
        email: cleanEmail,
        displayName: cleanName,
        role: safeRole,
        institution: cleanInstitution,
        nim: cleanNim,
        emailVerified: Boolean(res.user.emailVerified),
        photoURL: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (db) {
        try {
          await setDoc(doc(db, 'users', res.user.uid), newUserDoc);
        } catch (fsErr) {
          console.warn('Firestore setDoc failed:', fsErr);
        }
      }

      const profileState = {
        ...newUserDoc,
        isDemoMode: false,
      };
      setCurrentUser(res.user);
      setUserProfile(profileState);
      setRole(safeRole);
      setIsDemoMode(false);
      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 3. Login dengan Akun Google (role default 'student' saat dokumen baru dibuat, tidak menimpa role lama)
  const loginWithGoogle = async () => {
    setAuthError(null);
    ensureFirebaseAuth();
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);

      let firestoreData = null;
      if (db) {
        try {
          const userRef = doc(db, 'users', res.user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            firestoreData = stripSensitiveFields(userDoc.data());
          } else {
            firestoreData = {
              uid: res.user.uid,
              email: res.user.email || '',
              displayName: res.user.displayName || 'Mahasiswa Smartsa',
              photoURL: res.user.photoURL || null,
              role: ROLES.STUDENT,
              institution: 'Universitas Negeri Surabaya',
              nim: '',
              emailVerified: Boolean(res.user.emailVerified),
              provider: 'google.com',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, firestoreData);
          }
        } catch (fsErr) {
          console.warn('Firestore Google login error:', fsErr);
        }
      }

      const googleProfile = buildUserProfile(res.user, firestoreData);
      setCurrentUser(res.user);
      setUserProfile(googleProfile);
      setRole(googleProfile.role);
      setIsDemoMode(false);

      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 4. Login dengan Akun GitHub (role default 'student' saat dokumen baru dibuat, tidak menimpa role lama)
  const loginWithGithub = async () => {
    setAuthError(null);
    ensureFirebaseAuth();
    try {
      const provider = new GithubAuthProvider();
      const res = await signInWithPopup(auth, provider);

      let firestoreData = null;
      if (db) {
        try {
          const userRef = doc(db, 'users', res.user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            firestoreData = stripSensitiveFields(userDoc.data());
          } else {
            firestoreData = {
              uid: res.user.uid,
              email: res.user.email || '',
              displayName: res.user.displayName || 'Pengguna GitHub',
              photoURL: res.user.photoURL || null,
              role: ROLES.STUDENT,
              institution: 'Universitas Negeri Surabaya',
              nim: '',
              emailVerified: Boolean(res.user.emailVerified),
              provider: 'github.com',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(userRef, firestoreData);
          }
        } catch (fsErr) {
          console.warn('Firestore Github login error:', fsErr);
        }
      }

      const githubProfile = buildUserProfile(res.user, firestoreData);
      setCurrentUser(res.user);
      setUserProfile(githubProfile);
      setRole(githubProfile.role);
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
    clearLegacyAuthStorage();
    setCurrentUser(null);
    setIsDemoMode(true);
    setUserProfile(DEMO_USERS.student);
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

    setUserProfile((prev) => ({
      ...prev,
      photoURL: cleanPhoto,
    }));

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

    setUserProfile((prev) => ({
      ...prev,
      ...sanitizedUpdate,
    }));

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
