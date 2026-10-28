// Abstraksi Layanan Upload Media Cloudinary untuk Smartsa LMS

export const CLOUDINARY_STATUS = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  READY_BACKEND: 'READY_BACKEND',
};

const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: ['application/pdf'],
};

const MAX_FILE_SIZES = {
  image: 5 * 1024 * 1024, // 5MB
  document: 25 * 1024 * 1024, // 25MB
};

export async function uploadMediaFile(file, category = 'image') {
  if (!file) throw new Error('Berkas tidak ditemukan.');

  // 1. Validasi Tipe Berkas
  const allowed = ALLOWED_MIME_TYPES[category] || ALLOWED_MIME_TYPES.image;
  if (!allowed.includes(file.type)) {
    throw new Error(`Format berkas tidak diizinkan. Format yang didukung: ${allowed.join(', ')}`);
  }

  // 2. Validasi Ukuran Berkas
  const maxSize = MAX_FILE_SIZES[category] || MAX_FILE_SIZES.image;
  if (file.size > maxSize) {
    throw new Error(`Ukuran berkas melebihi batas maksimum (${maxSize / (1024 * 1024)}MB).`);
  }

  // 3. Permintaan signature ke endpoint backend /api/upload-sign
  try {
    const res = await fetch('/api/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, fileName: file.name }),
    });

    if (res.ok) {
      const signData = await res.json();
      // Melakukan Direct Signed Upload ke Cloudinary CDN jika signData aktif
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signData.api_key);
      formData.append('timestamp', signData.timestamp);
      formData.append('signature', signData.signature);

      const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${signData.cloud_name}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (cloudRes.ok) {
        const cloudData = await cloudRes.json();
        return {
          url: cloudData.secure_url,
          isLive: true,
        };
      }
    }
  } catch {
    // Backend Vercel / Cloudinary API belum diset
  }

  // Fallback: Mode Demonstrasi Aman (Preview URL Lokal)
  return {
    url: URL.createObjectURL(file),
    isLive: false,
    note: 'Pratinjau Lokal (Cloudinary belum dikonfigurasi di Vercel Environment Variables).',
  };
}

