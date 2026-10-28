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

const STORAGE_KEYS = {
  ACTIVE_PROFILE: 'smartsa_active_profile',
  REGISTERED_ACCOUNTS: 'smartsa_registered_accounts',
};

// Akun terdaftar default dengan NIM & Identitas Resmi
const PRESET_ACCOUNTS = {
  'ralfkyardan@gmail.com': {
    email: 'ralfkyardan@gmail.com',
    nim: '25050974168',
    displayName: 'Ralfky Ardan',
    institution: 'Universitas Negeri Surabaya',
    role: ROLES.STUDENT,
    emailVerified: true,
  },
};

// Membaca semua akun yang pernah didaftarkan di perangkat
export const getStoredAccounts = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REGISTERED_ACCOUNTS);
    const parsed = raw ? JSON.parse(raw) : {};
    const accounts = typeof parsed === 'object' && parsed !== null ? parsed : {};

    // Selalu pastikan akun ralfkyardan@gmail.com memiliki NIM 25050974168
    if (!accounts['ralfkyardan@gmail.com']) {
      accounts['ralfkyardan@gmail.com'] = { ...PRESET_ACCOUNTS['ralfkyardan@gmail.com'] };
    } else {
      accounts['ralfkyardan@gmail.com'].nim = '25050974168';
    }
    return accounts;
  } catch {
    return { ...PRESET_ACCOUNTS };
  }
};

// Menyimpan satu profil akun ke penyimpanan lokal (keyed by lowercase email)
export const saveStoredAccount = (account) => {
  if (!account || !account.email) return;
  try {
    const all = getStoredAccounts();
    const emailKey = account.email.trim().toLowerCase();
    const finalNim = emailKey === 'ralfkyardan@gmail.com' ? '25050974168' : (account.nim || account.nidn || account.nip);
    all[emailKey] = {
      ...all[emailKey],
      ...account,
      email: emailKey,
      nim: finalNim,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.REGISTERED_ACCOUNTS, JSON.stringify(all));
  } catch (e) {
    console.warn('Gagal menyimpan akun ke localStorage:', e);
  }
};

// Membaca profil aktif dari penyimpanan lokal saat inisialisasi aplikasi
const getSavedActiveProfile = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email) {
        if (parsed.email.toLowerCase() === 'ralfkyardan@gmail.com') {
          parsed.nim = '25050974168';
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Gagal membaca profil aktif dari localStorage:', e);
  }
  return null;
};

// Menyimpan profil aktif ke penyimpanan lokal
const saveActiveProfile = (profile) => {
  try {
    if (profile) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE, JSON.stringify(profile));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROFILE);
    }
  } catch (e) {
    console.warn('Gagal menyimpan profil aktif:', e);
  }
};

export function AuthProvider({ children }) {
  // Inisialisasi dari sesi yang tersimpan sebelumnya agar tidak terjadi ketidaksesuaian data
  const initialActive = getSavedActiveProfile();

  const [currentUser, setCurrentUser] = useState(
    initialActive && !initialActive.isDemoMode
      ? {
          uid: initialActive.uid,
          email: initialActive.email,
          displayName: initialActive.displayName,
          photoURL: initialActive.photoURL,
          emailVerified: Boolean(initialActive.emailVerified),
        }
      : null
  );

  const [userProfile, setUserProfile] = useState(
    initialActive || DEMO_USERS.student
  );

  const [role, setRole] = useState(
    initialActive?.role || ROLES.STUDENT
  );

  const [loading, setLoading] = useState(true);

  const [isDemoMode, setIsDemoMode] = useState(
    initialActive ? Boolean(initialActive.isDemoMode) : true
  );

  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsDemoMode(false);

        const emailKey = user.email ? user.email.trim().toLowerCase() : '';
        const storedAccounts = getStoredAccounts();
        const storedAccount = emailKey ? storedAccounts[emailKey] : null;

        let firestoreData = null;
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            firestoreData = userDoc.data();
          }
        } catch (err) {
          console.warn('Firestore getDoc gagal (fallback ke cache akun lokal):', err);
        }

        // Susun profil gabungan dengan prioritas: Firestore > Akun Lokal Terdaftar > Firebase User
        const resolvedDisplayName =
          firestoreData?.displayName ||
          storedAccount?.displayName ||
          user.displayName ||
          (user.email ? user.email.split('@')[0] : 'Pengguna Smartsa');

        const presetNim = emailKey === 'ralfkyardan@gmail.com' ? '25050974168' : null;

        const resolvedNim =
          presetNim ||
          storedAccount?.nim ||
          firestoreData?.nim ||
          firestoreData?.nidn ||
          firestoreData?.nip ||
          storedAccount?.nidn ||
          storedAccount?.nip ||
          '2505097' + Math.floor(1000 + Math.random() * 9000);

        const resolvedRole =
          firestoreData?.role ||
          storedAccount?.role ||
          ROLES.STUDENT;

        const resolvedInstitution =
          firestoreData?.institution ||
          storedAccount?.institution ||
          'Universitas Negeri Surabaya';

        const resolvedPhotoURL =
          user.photoURL ||
          firestoreData?.photoURL ||
          storedAccount?.photoURL ||
          null;

        const combinedProfile = {
          uid: user.uid,
          email: user.email || storedAccount?.email || '',
          displayName: resolvedDisplayName,
          role: resolvedRole,
          institution: resolvedInstitution,
          nim: resolvedNim,
          nidn: resolvedRole === ROLES.LECTURER ? resolvedNim : undefined,
          nip: resolvedRole === ROLES.TEACHER ? resolvedNim : undefined,
          photoURL: resolvedPhotoURL,
          emailVerified: user.emailVerified || Boolean(storedAccount?.emailVerified),
          isDemoMode: false,
          ...(firestoreData || {}),
        };

        setUserProfile(combinedProfile);
        setRole(resolvedRole);
        saveActiveProfile(combinedProfile);
        saveStoredAccount(combinedProfile);

        // Jika dokumen belum ada di Firestore, coba buatkan
        if (!firestoreData) {
          try {
            await setDoc(
              doc(db, 'users', user.uid),
              {
                ...combinedProfile,
                createdAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (e) {
            console.warn('Sinkronisasi dokumen awal ke Firestore diabaikan:', e);
          }
        }
      } else {
        // Jika tidak ada user Firebase Auth aktif:
        // Cek apakah ada sesi akun lokal yang sah (misal login lokal offline)
        const activeLocal = getSavedActiveProfile();
        if (activeLocal && !activeLocal.isDemoMode) {
          setUserProfile(activeLocal);
          setRole(activeLocal.role || ROLES.STUDENT);
          setIsDemoMode(false);
          setCurrentUser({
            uid: activeLocal.uid,
            email: activeLocal.email,
            displayName: activeLocal.displayName,
            photoURL: activeLocal.photoURL,
            emailVerified: Boolean(activeLocal.emailVerified),
          });
        } else {
          setCurrentUser(null);
          setIsDemoMode(true);
          const demoStudent = DEMO_USERS.student;
          setUserProfile(demoStudent);
          setRole(ROLES.STUDENT);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 1. Login dengan Email & Kata Sandi
  const login = async (email, password) => {
    setAuthError(null);
    const cleanEmail = (email || '').trim().toLowerCase();
    const enteredPassword = (password || '').trim();

    if (!cleanEmail) {
      const err = new Error('Email wajib diisi.');
      setAuthError(err.message);
      throw err;
    }

    // 1. Cek apakah ini salah satu akun demo bawaan (mhs@smartsa.edu, dosen@smartsa.edu, dll)
    const demoRoleKey = Object.keys(DEMO_USERS).find(
      (k) => DEMO_USERS[k].email.toLowerCase() === cleanEmail
    );
    if (demoRoleKey) {
      const demoUser = DEMO_USERS[demoRoleKey];
      const activeObj = {
        ...demoUser,
        isDemoMode: false, // Diaktifkan sebagai akun pengguna login
      };
      setUserProfile(activeObj);
      setRole(demoUser.role);
      setIsDemoMode(false);
      setCurrentUser({
        uid: demoUser.uid,
        email: demoUser.email,
        displayName: demoUser.displayName,
        photoURL: demoUser.photoURL,
        emailVerified: true,
      });
      saveActiveProfile(activeObj);
      saveStoredAccount(activeObj);
      return activeObj;
    }

    // 2. Ambil data akun dari penyimpanan lokal (jika pernah didaftarkan)
    const storedAccounts = getStoredAccounts();
    const storedAccount = storedAccounts[cleanEmail];

    let fbUser = null;
    let fbError = null;

    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, enteredPassword);
      fbUser = res.user;
    } catch (err) {
      fbError = err;
      console.warn('Firebase signIn gagal, mengecek akun lokal:', err);
    }

    // Jika autentikasi Firebase berhasil:
    if (fbUser) {
      setCurrentUser(fbUser);
      setIsDemoMode(false);

      let fsData = null;
      try {
        const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
        if (userDoc.exists()) {
          fsData = userDoc.data();
        }
      } catch (e) {
        console.warn('Firestore getDoc error:', e);
      }

      const cleanDisplayName =
        fsData?.displayName ||
        storedAccount?.displayName ||
        fbUser.displayName ||
        cleanEmail.split('@')[0];

      const presetNim = cleanEmail === 'ralfkyardan@gmail.com' ? '25050974168' : null;

      const cleanNim =
        presetNim ||
        storedAccount?.nim ||
        fsData?.nim ||
        fsData?.nidn ||
        fsData?.nip ||
        storedAccount?.nidn ||
        storedAccount?.nip ||
        '2505097' + Math.floor(1000 + Math.random() * 9000);

      const cleanRole =
        fsData?.role ||
        storedAccount?.role ||
        ROLES.STUDENT;

      const cleanInstitution =
        fsData?.institution ||
        storedAccount?.institution ||
        'Universitas Negeri Surabaya';

      const fullProfile = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: cleanDisplayName,
        role: cleanRole,
        institution: cleanInstitution,
        nim: cleanNim,
        nidn: cleanRole === ROLES.LECTURER ? cleanNim : undefined,
        nip: cleanRole === ROLES.TEACHER ? cleanNim : undefined,
        photoURL: fbUser.photoURL || fsData?.photoURL || storedAccount?.photoURL || null,
        emailVerified: fbUser.emailVerified || Boolean(storedAccount?.emailVerified),
        isDemoMode: false,
        ...(fsData || {}),
      };

      setUserProfile(fullProfile);
      setRole(cleanRole);
      saveActiveProfile(fullProfile);
      saveStoredAccount(fullProfile);
      return fbUser;
    }

    // Jika Firebase Auth gagal tetapi akun tersimpan secara lokal:
    if (storedAccount) {
      // Validasi kata sandi jika tersimpan
      if (storedAccount.password && storedAccount.password !== enteredPassword) {
        const err = new Error('Kredensial salah: Alamat email atau kata sandi tidak cocok.');
        err.code = 'auth/wrong-password';
        setAuthError(err.message);
        throw err;
      }

      const activeObj = {
        ...storedAccount,
        isDemoMode: false,
      };

      setUserProfile(activeObj);
      setRole(storedAccount.role || ROLES.STUDENT);
      setIsDemoMode(false);
      setCurrentUser({
        uid: storedAccount.uid || 'user_' + Date.now(),
        email: storedAccount.email,
        displayName: storedAccount.displayName,
        photoURL: storedAccount.photoURL || null,
        emailVerified: Boolean(storedAccount.emailVerified),
      });
      saveActiveProfile(activeObj);
      return activeObj;
    }

    // Jika akun tidak ditemukan di Firebase maupun di penyimpanan lokal
    if (fbError) {
      setAuthError(fbError.message);
      throw fbError;
    } else {
      const err = new Error('Akun belum terdaftar. Silakan pilih tab Daftar Akun Baru.');
      err.code = 'auth/user-not-found';
      setAuthError(err.message);
      throw err;
    }
  };

  // 2. Registrasi Akun Baru dengan Email & Password
  const register = async (
    email,
    password,
    displayName,
    selectedRole = ROLES.STUDENT,
    institution = '',
    nim = ''
  ) => {
    setAuthError(null);
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (displayName || '').trim() || (cleanEmail === 'ralfkyardan@gmail.com' ? 'Ralfky Ardan' : cleanEmail.split('@')[0]);
    const presetNim = cleanEmail === 'ralfkyardan@gmail.com' ? '25050974168' : null;
    const cleanNim = presetNim || (nim || '').trim() || ('2505097' + Math.floor(1000 + Math.random() * 9000));
    const cleanInstitution = (institution || '').trim() || 'Universitas Negeri Surabaya';

    // Buat objek profil akun lengkap
    const newUserData = {
      uid: 'user_' + Date.now(),
      email: cleanEmail,
      password: password ? password.trim() : '',
      displayName: cleanName,
      role: selectedRole,
      institution: cleanInstitution,
      nim: cleanNim,
      nidn: selectedRole === ROLES.LECTURER ? cleanNim : undefined,
      nip: selectedRole === ROLES.TEACHER ? cleanNim : undefined,
      emailVerified: true,
      photoURL: null,
      isDemoMode: false,
      createdAt: new Date().toISOString(),
    };

    // 1. Simpan langsung ke penyimpanan lokal agar data tersinkronisasi instan
    saveStoredAccount(newUserData);
    saveActiveProfile(newUserData);
    setUserProfile(newUserData);
    setRole(selectedRole);
    setIsDemoMode(false);

    // 2. Hubungkan ke Firebase Auth & Firestore
    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      newUserData.uid = res.user.uid;

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

      try {
        await setDoc(doc(db, 'users', res.user.uid), {
          ...newUserData,
          createdAt: serverTimestamp(),
        });
      } catch (fsErr) {
        console.warn('Firestore setDoc failed, data lokal tetap dipertahankan:', fsErr);
      }

      setCurrentUser(res.user);
      saveStoredAccount(newUserData);
      saveActiveProfile(newUserData);
      return res.user;
    } catch (err) {
      console.warn('Firebase createUser gagal, melanjutkan dengan akun lokal:', err);

      setCurrentUser({
        uid: newUserData.uid,
        email: newUserData.email,
        displayName: newUserData.displayName,
        photoURL: null,
        emailVerified: true,
      });

      // Jika email sudah terdaftar di Firebase Auth, coba langsung login untuk mengambil sesi
      if (err.code === 'auth/email-already-in-use') {
        try {
          const loginRes = await signInWithEmailAndPassword(auth, cleanEmail, password);
          newUserData.uid = loginRes.user.uid;
          setCurrentUser(loginRes.user);
          saveStoredAccount(newUserData);
          saveActiveProfile(newUserData);
          try {
            await setDoc(doc(db, 'users', loginRes.user.uid), {
              ...newUserData,
              createdAt: serverTimestamp(),
            }, { merge: true });
          } catch (e) { console.warn(e); }
          return loginRes.user;
        } catch {
          return newUserData;
        }
      }

      return newUserData;
    }
  };

  // 3. Login dengan Akun Google
  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, provider);

      const emailKey = res.user.email ? res.user.email.trim().toLowerCase() : '';
      const storedAccount = emailKey ? getStoredAccounts()[emailKey] : null;

      let firestoreData = null;
      try {
        const userRef = doc(db, 'users', res.user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          firestoreData = userDoc.data();
        } else {
          firestoreData = {
            uid: res.user.uid,
            email: res.user.email,
            displayName: res.user.displayName || 'Mahasiswa Smartsa',
            photoURL: res.user.photoURL,
            role: storedAccount?.role || ROLES.STUDENT,
            institution: storedAccount?.institution || 'Universitas Negeri Surabaya',
            nim: storedAccount?.nim || ('2505097' + Math.floor(1000 + Math.random() * 9000)),
            emailVerified: res.user.emailVerified,
            provider: 'google.com',
            createdAt: serverTimestamp(),
          };
          await setDoc(userRef, firestoreData);
        }
      } catch (fsErr) {
        console.warn('Firestore Google login error:', fsErr);
      }

      const googleProfile = {
        uid: res.user.uid,
        email: res.user.email,
        displayName: firestoreData?.displayName || res.user.displayName || storedAccount?.displayName || 'Mahasiswa Smartsa',
        photoURL: res.user.photoURL || firestoreData?.photoURL,
        role: firestoreData?.role || storedAccount?.role || ROLES.STUDENT,
        institution: firestoreData?.institution || storedAccount?.institution || 'Universitas Negeri Surabaya',
        nim: firestoreData?.nim || storedAccount?.nim || ('2505097' + Math.floor(1000 + Math.random() * 9000)),
        emailVerified: res.user.emailVerified,
        isDemoMode: false,
        provider: 'google.com',
      };

      setCurrentUser(res.user);
      setUserProfile(googleProfile);
      setRole(googleProfile.role);
      setIsDemoMode(false);
      saveActiveProfile(googleProfile);
      saveStoredAccount(googleProfile);

      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 4. Login dengan Akun GitHub
  const loginWithGithub = async () => {
    setAuthError(null);
    try {
      const provider = new GithubAuthProvider();
      const res = await signInWithPopup(auth, provider);

      const emailKey = res.user.email ? res.user.email.trim().toLowerCase() : '';
      const storedAccount = emailKey ? getStoredAccounts()[emailKey] : null;

      let firestoreData = null;
      try {
        const userRef = doc(db, 'users', res.user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          firestoreData = userDoc.data();
        } else {
          firestoreData = {
            uid: res.user.uid,
            email: res.user.email || 'developer@smartsa.edu',
            displayName: res.user.displayName || 'Developer Smartsa',
            photoURL: res.user.photoURL,
            role: storedAccount?.role || ROLES.STUDENT,
            institution: storedAccount?.institution || 'Universitas Negeri Surabaya',
            nim: storedAccount?.nim || ('2505097' + Math.floor(1000 + Math.random() * 9000)),
            emailVerified: true,
            provider: 'github.com',
            createdAt: serverTimestamp(),
          };
          await setDoc(userRef, firestoreData);
        }
      } catch (fsErr) {
        console.warn('Firestore Github login error:', fsErr);
      }

      const githubProfile = {
        uid: res.user.uid,
        email: res.user.email || 'developer@smartsa.edu',
        displayName: firestoreData?.displayName || res.user.displayName || storedAccount?.displayName || 'Developer Smartsa',
        photoURL: res.user.photoURL || firestoreData?.photoURL,
        role: firestoreData?.role || storedAccount?.role || ROLES.STUDENT,
        institution: firestoreData?.institution || storedAccount?.institution || 'Universitas Negeri Surabaya',
        nim: firestoreData?.nim || storedAccount?.nim || ('2505097' + Math.floor(1000 + Math.random() * 9000)),
        emailVerified: true,
        isDemoMode: false,
        provider: 'github.com',
      };

      setCurrentUser(res.user);
      setUserProfile(githubProfile);
      setRole(githubProfile.role);
      setIsDemoMode(false);
      saveActiveProfile(githubProfile);
      saveStoredAccount(githubProfile);

      return res.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  // 5. Keluar Akun (Logout)
  const logout = async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.warn('SignOut error:', e);
    }
    saveActiveProfile(null);
    setCurrentUser(null);
    setIsDemoMode(true);
    setUserProfile(DEMO_USERS.student);
    setRole(ROLES.STUDENT);
  };

  // 6. Reset Kata Sandi via Email
  const resetPassword = async (email) => {
    setAuthError(null);
    return sendPasswordResetEmail(auth, (email || '').trim());
  };

  // 7. Ganti Mode Role Demo (Simulasi Cepat untuk Audit)
  const switchDemoRole = (targetRole) => {
    const demoProfile = DEMO_USERS[targetRole] || DEMO_USERS.student;
    const demoObj = {
      ...demoProfile,
      isDemoMode: true,
    };
    setUserProfile(demoObj);
    setRole(targetRole);
    setIsDemoMode(true);
    saveActiveProfile(demoObj);
  };

  // 8. Update Foto Profil Pengguna
  const updateUserPhoto = async (photoURL) => {
    setUserProfile((prev) => {
      const updated = {
        ...prev,
        photoURL,
      };
      saveActiveProfile(updated);
      saveStoredAccount(updated);
      return updated;
    });

    if (currentUser) {
      try {
        await updateProfile(currentUser, { photoURL });
      } catch (err) {
        console.warn('Gagal update Firebase Auth photoURL:', err);
      }
      try {
        await setDoc(doc(db, 'users', currentUser.uid), { photoURL }, { merge: true });
      } catch (err) {
        console.warn('Gagal update Firestore user photoURL:', err);
      }
    }
  };

  // 9. Update Data Profil Akademik (Nama, NIM, Institusi)
  const updateUserProfileData = async (newData) => {
    setUserProfile((prev) => {
      const updated = {
        ...prev,
        ...newData,
      };
      saveActiveProfile(updated);
      saveStoredAccount(updated);
      return updated;
    });

    if (newData.displayName && currentUser) {
      try {
        await updateProfile(currentUser, { displayName: newData.displayName });
      } catch (err) {
        console.warn('Gagal update Firebase Auth displayName:', err);
      }
    }

    if (currentUser?.uid) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), newData, { merge: true });
      } catch (err) {
        console.warn('Gagal update Firestore user data:', err);
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
        switchDemoRole,
        updateUserPhoto,
        updateUserProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
