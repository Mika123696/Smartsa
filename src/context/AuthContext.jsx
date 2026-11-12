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

const resolveInstitutionalIdentity = (email) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  if (/^admin(\.[^@]+)?@smartsa\.edu$/.test(cleanEmail)) {
    return {
      role: ROLES.ADMIN,
      defaultDisplayName: 'Administrator Smartsa',
      nidn: '',
      nip: 'ADM-001',
      nim: '',
    };
  }
  if (/^dosen(\.[^@]+)?@smartsa\.edu$/.test(cleanEmail)) {
    return {
      role: ROLES.LECTURER,
      defaultDisplayName: 'Dr. Andi Saputra',
      nidn: '0012088501',
      nip: '',
      nim: '',
    };
  }
  if (/^mhs(\.[^@]+)?@smartsa\.edu$/.test(cleanEmail)) {
    return {
      role: ROLES.STUDENT,
      defaultDisplayName: 'Budi Santoso',
      nidn: '',
      nip: '',
      nim: '25050974001',
    };
  }
  return null;
};

const MISMATCHED_NAMES_BY_ROLE = {
  [ROLES.ADMIN]: new Set(['Dr. Andi Saputra', 'Budi Santoso', 'Mahasiswa Demo']),
  [ROLES.LECTURER]: new Set(['Administrator Smartsa', 'Budi Santoso', 'Mahasiswa Demo']),
  [ROLES.STUDENT]: new Set(['Dr. Andi Saputra', 'Administrator Smartsa', 'Mahasiswa Demo']),
};

const LEGACY_DEMO_STUDENT_PHOTO_FRAGMENT = 'photo-1535713875002-d1d0cf377fde';
const LEGACY_DEMO_LECTURER_PHOTO_FRAGMENT = 'photo-1570295999919-56ceb5ecca61';

const isAuthProfilePhotoUrlSafe = (url) => {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return false;
  return (
    (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
    trimmed.length <= 2048
  );
};

const resolveSafeDisplayNameForRole = (rawFsName, rawAuthName, email, resolvedRole, institutional) => {
  const mismatchSet = MISMATCHED_NAMES_BY_ROLE[resolvedRole];
  const fsName = typeof rawFsName === 'string' ? rawFsName.trim() : '';
  const authName = typeof rawAuthName === 'string' ? rawAuthName.trim() : '';

  if (institutional) {
    if (fsName && !mismatchSet?.has(fsName)) return fsName;
    if (authName && !mismatchSet?.has(authName)) return authName;
    return institutional.defaultDisplayName;
  }

  if (fsName) return fsName;
  if (authName) return authName;
  if (email) return email.split('@')[0];
  return resolvedRole === ROLES.ADMIN
    ? 'Administrator'
    : resolvedRole === ROLES.LECTURER
      ? 'Dosen Pengajar'
      : 'Mahasiswa';
};

const resolveIsolatedPhotoUrl = (rawFsPhoto, rawAuthPhoto, resolvedRole) => {
  const candidate = rawFsPhoto || rawAuthPhoto || null;
  if (!candidate) return null;
  if (
    resolvedRole === ROLES.ADMIN &&
    (candidate.includes(LEGACY_DEMO_STUDENT_PHOTO_FRAGMENT) ||
      candidate.includes(LEGACY_DEMO_LECTURER_PHOTO_FRAGMENT))
  ) {
    return null;
  }
  if (
    resolvedRole === ROLES.LECTURER &&
    candidate.includes(LEGACY_DEMO_STUDENT_PHOTO_FRAGMENT)
  ) {
    return null;
  }
  return candidate;
};

const buildUserProfile = (firebaseUser, firestoreData = null) => {
  const safeFs = stripSensitiveFields(firestoreData);
  const email = firebaseUser.email || safeFs?.email || '';
  const institutional = resolveInstitutionalIdentity(email);
  const fsRole = safeFs?.role ? sanitizeRole(safeFs.role) : null;
  const resolvedRole = institutional
    ? institutional.role
    : fsRole === ROLES.ADMIN || fsRole === ROLES.LECTURER
      ? fsRole
      : ROLES.STUDENT;
  const resolvedName = resolveSafeDisplayNameForRole(
    safeFs?.displayName,
    firebaseUser.displayName,
    email,
    resolvedRole,
    institutional
  );
  const resolvedNidn =
    resolvedRole === ROLES.LECTURER
      ? safeFs?.nidn || institutional?.nidn || safeFs?.nim || ''
      : '';
  const resolvedNip =
    resolvedRole === ROLES.ADMIN
      ? safeFs?.nip || institutional?.nip || safeFs?.nim || ''
      : '';
  const resolvedNim =
    resolvedRole === ROLES.LECTURER
      ? resolvedNidn
      : resolvedRole === ROLES.ADMIN
        ? resolvedNip
        : safeFs?.nim || institutional?.nim || '';
  const resolvedInstitution =
    safeFs?.institution ||
    (resolvedRole === ROLES.ADMIN
      ? 'Smartsa Central Administration'
      : 'Universitas Negeri Surabaya');
  const resolvedPhotoURL = resolveIsolatedPhotoUrl(
    safeFs?.photoURL,
    firebaseUser.photoURL,
    resolvedRole
  );

  return {
    ...(safeFs || {}),
    uid: firebaseUser.uid,
    email,
    displayName: resolvedName,
    role: resolvedRole,
    institution: resolvedInstitution,
    nim: resolvedNim,
    nidn: resolvedNidn,
    nip: resolvedNip,
    photoURL: resolvedPhotoURL,
    emailVerified: Boolean(firebaseUser.emailVerified),
    isDemoMode: false,
  };
};

async function syncInstitutionalUserDoc(firebaseUser, firestoreData, docExists) {
  if (!db || !firebaseUser?.uid) return;
  const profile = buildUserProfile(firebaseUser, firestoreData);
  const institutional = resolveInstitutionalIdentity(profile.email);

  if (!docExists) {
    try {
      const initialDoc = {
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        role: institutional ? institutional.role : ROLES.STUDENT,
        institution: profile.institution,
        nim: profile.nim || '',
        ...(profile.nidn ? { nidn: profile.nidn } : {}),
        ...(profile.nip ? { nip: profile.nip } : {}),
        photoURL: profile.photoURL,
        emailVerified: profile.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), initialDoc);
    } catch (e) {
      console.warn('Sinkronisasi dokumen awal ke Firestore diabaikan:', e);
    }
    return;
  }

  if (!institutional) return;

  const mismatchSet = MISMATCHED_NAMES_BY_ROLE[institutional.role];
  const fsName = typeof firestoreData?.displayName === 'string' ? firestoreData.displayName.trim() : '';
  const needsRoleFix = firestoreData?.role !== institutional.role;
  const needsNameFix = !fsName || mismatchSet?.has(fsName);
  const needsNidnFix = Boolean(institutional.nidn && firestoreData?.nidn !== institutional.nidn);
  const needsNipFix = Boolean(institutional.nip && firestoreData?.nip !== institutional.nip);
  const needsNimFix = Boolean(institutional.nim && !firestoreData?.nim);
  const needsPhotoFix =
    institutional.role === ROLES.ADMIN &&
    typeof firestoreData?.photoURL === 'string' &&
    (firestoreData.photoURL.includes(LEGACY_DEMO_STUDENT_PHOTO_FRAGMENT) ||
      firestoreData.photoURL.includes(LEGACY_DEMO_LECTURER_PHOTO_FRAGMENT));

  if (needsRoleFix || needsNameFix || needsNidnFix || needsNipFix || needsNimFix || needsPhotoFix) {
    try {
      const patch = {
        role: institutional.role,
        ...(needsNameFix ? { displayName: profile.displayName } : {}),
        ...(needsNidnFix ? { nidn: institutional.nidn, nim: institutional.nidn } : {}),
        ...(needsNipFix ? { nip: institutional.nip, nim: institutional.nip } : {}),
        ...(needsNimFix ? { nim: institutional.nim } : {}),
        ...(needsPhotoFix ? { photoURL: null } : {}),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), patch, { merge: true });
    } catch (e) {
      console.warn('Sinkronisasi role & profil institusional ke Firestore diabaikan:', e);
    }
  }
}

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

        await syncInstitutionalUserDoc(user, firestoreData, docExists);
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
      let docExists = false;
      if (db) {
        try {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            docExists = true;
            fsData = stripSensitiveFields(userDoc.data());
          }
        } catch (e) {
          console.warn('Firestore getDoc error:', e);
        }
      }

      const fullProfile = buildUserProfile(fbUser, fsData);
      await syncInstitutionalUserDoc(fbUser, fsData, docExists);
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

  // 2. Registrasi Akun Baru dengan Email & Password (selalu 'student' kecuali domain resmi @smartsa.edu)
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
    const institutional = resolveInstitutionalIdentity(cleanEmail);
    const safeRole = institutional ? institutional.role : ROLES.STUDENT;
    const cleanName =
      (displayName || '').trim() ||
      institutional?.defaultDisplayName ||
      (cleanEmail ? cleanEmail.split('@')[0] : 'Mahasiswa');
    const cleanNim = (nim || '').trim() || institutional?.nim || institutional?.nidn || institutional?.nip || '';
    const cleanInstitution =
      (institution || '').trim() ||
      (safeRole === ROLES.ADMIN ? 'Smartsa Central Administration' : 'Universitas Negeri Surabaya');

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
        ...(institutional?.nidn ? { nidn: institutional.nidn } : {}),
        ...(institutional?.nip ? { nip: institutional.nip } : {}),
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
            await syncInstitutionalUserDoc(res.user, firestoreData, true);
          } else {
            const inst = resolveInstitutionalIdentity(res.user.email);
            firestoreData = {
              uid: res.user.uid,
              email: res.user.email || '',
              displayName: inst?.defaultDisplayName || res.user.displayName || 'Mahasiswa',
              photoURL: inst?.role === ROLES.ADMIN ? null : res.user.photoURL || null,
              role: inst ? inst.role : ROLES.STUDENT,
              institution:
                inst?.role === ROLES.ADMIN
                  ? 'Smartsa Central Administration'
                  : 'Universitas Negeri Surabaya',
              nim: inst?.nim || inst?.nidn || inst?.nip || '',
              ...(inst?.nidn ? { nidn: inst.nidn } : {}),
              ...(inst?.nip ? { nip: inst.nip } : {}),
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
            await syncInstitutionalUserDoc(res.user, firestoreData, true);
          } else {
            const inst = resolveInstitutionalIdentity(res.user.email);
            firestoreData = {
              uid: res.user.uid,
              email: res.user.email || '',
              displayName: inst?.defaultDisplayName || res.user.displayName || 'Mahasiswa',
              photoURL: inst?.role === ROLES.ADMIN ? null : res.user.photoURL || null,
              role: inst ? inst.role : ROLES.STUDENT,
              institution:
                inst?.role === ROLES.ADMIN
                  ? 'Smartsa Central Administration'
                  : 'Universitas Negeri Surabaya',
              nim: inst?.nim || inst?.nidn || inst?.nip || '',
              ...(inst?.nidn ? { nidn: inst.nidn } : {}),
              ...(inst?.nip ? { nip: inst.nip } : {}),
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
