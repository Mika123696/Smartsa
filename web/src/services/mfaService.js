import { auth } from '../firebase';

/**
 * Helper client-side terpadu untuk berkomunikasi dengan endpoint `POST /api/mfa`
 * menggunakan Firebase ID Token aktif pengguna.
 */
export async function requestMfaApi(action, payload = {}, userOverride = null) {
  const activeUser = userOverride || auth?.currentUser;
  if (!activeUser || typeof activeUser.getIdToken !== 'function') {
    const err = new Error('Sesi autentikasi tidak aktif. Silakan masuk kembali.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const idToken = await activeUser.getIdToken();
  if (!idToken) {
    const err = new Error('Gagal memperoleh token autentikasi pengguna.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const response = await fetch('/api/mfa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      action,
      ...(payload && typeof payload === 'object' ? payload : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error || 'Permintaan verifikasi 2FA gagal diproses.');
    err.code = data?.code || 'MFA_ERROR';
    err.status = response.status;
    err.retryAfterSeconds = data?.retryAfterSeconds;
    throw err;
  }

  return data;
}
