// Abstraksi Layanan Upload Media Cloudinary + Fallback Aman Tanpa Kredensial
import { auth } from '../firebase';

export const CLOUDINARY_STATUS = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  READY_BACKEND: 'READY_BACKEND',
};

const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  document: [
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

const ALLOWED_DOC_EXTENSIONS = ['.pdf', '.zip', '.docx', '.fig'];

const MAX_FILE_SIZES = {
  image: 5 * 1024 * 1024, // 5MB
  document: 25 * 1024 * 1024, // 25MB
};

const MAX_MICRO_THUMBNAIL_BYTES = 35 * 1024; // <35 KB untuk avatar Firestore

export function isValidExternalUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function compressImageToMicroThumbnail(file, maxBytes = MAX_MICRO_THUMBNAIL_BYTES) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new window.Image();
      img.src = event.target?.result;
      img.onload = () => {
        const dimensionSteps = [200, 160, 128, 96, 72];
        const qualitySteps = [0.72, 0.55, 0.42, 0.3, 0.22];

        for (const maxDim of dimensionSteps) {
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.max(1, Math.round((height * maxDim) / width));
              width = maxDim;
            }
          } else if (height > maxDim) {
            width = Math.max(1, Math.round((width * maxDim) / height));
            height = maxDim;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          for (const q of qualitySteps) {
            const dataUrl = canvas.toDataURL('image/jpeg', q);
            if (dataUrl.length <= maxBytes) {
              resolve(dataUrl);
              return;
            }
          }
        }

        // Last-resort ultra-compact 64px thumbnail
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 64;
        fallbackCanvas.height = 64;
        const fCtx = fallbackCanvas.getContext('2d');
        fCtx.drawImage(img, 0, 0, 64, 64);
        resolve(fallbackCanvas.toDataURL('image/jpeg', 0.2));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

function isDocumentFileAllowed(file) {
  if (ALLOWED_MIME_TYPES.document.includes(file.type)) return true;
  const lowerName = (file.name || '').toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export async function uploadMediaFile(file, category = 'image') {
  if (!file) throw new Error('Berkas tidak ditemukan.');

  // 1. Validasi Tipe Berkas
  if (category === 'image') {
    if (!ALLOWED_MIME_TYPES.image.includes(file.type)) {
      throw new Error(
        `Format gambar tidak diizinkan. Format yang didukung: ${ALLOWED_MIME_TYPES.image.join(', ')}`
      );
    }
  } else if (!isDocumentFileAllowed(file)) {
    throw new Error(
      `Format dokumen tidak diizinkan. Format yang didukung: ${ALLOWED_DOC_EXTENSIONS.join(', ')}`
    );
  }

  // 2. Validasi Ukuran Berkas
  const maxSize = MAX_FILE_SIZES[category] || MAX_FILE_SIZES.image;
  if (file.size > maxSize) {
    throw new Error(`Ukuran berkas melebihi batas maksimum (${maxSize / (1024 * 1024)}MB).`);
  }

  // 3. Permintaan signature ke endpoint backend /api/upload-sign dengan Firebase ID Token
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/upload-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, fileName: file.name }),
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (res.ok && isJson) {
        const signData = await res.json();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', signData.api_key);
        formData.append('timestamp', String(signData.timestamp));
        formData.append('signature', signData.signature);
        if (signData.folder) {
          formData.append('folder', signData.folder);
        }

        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${signData.cloud_name}/auto/upload`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          return {
            url: cloudData.secure_url,
            isLive: true,
            storageType: 'cloudinary',
            note: 'Berhasil diunggah ke Cloudinary CDN.',
          };
        }
      } else if ((res.status === 401 || res.status === 403) && isJson) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Otorisasi upload media ditolak.');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('ditolak')) {
        throw err;
      }
      // Backend Vercel / Cloudinary belum dikonfigurasi -> lanjutkan ke fallback aman
    }
  }

  // 4. Fallback Aman Tanpa Kredensial Cloudinary
  if (category === 'image') {
    const microDataUrl = await compressImageToMicroThumbnail(file, MAX_MICRO_THUMBNAIL_BYTES);
    return {
      url: microDataUrl,
      isLive: false,
      storageType: 'micro_thumbnail',
      sizeBytes: microDataUrl.length,
      note: `Cloudinary belum dikonfigurasi — menggunakan thumbnail mikro terkompresi (${Math.round(
        microDataUrl.length / 1024
      )} KB) di Firestore.`,
    };
  }

  return {
    url: null,
    isLive: false,
    requiresExternalUrl: true,
    storageType: 'external_url_required',
    note: 'Cloudinary belum dikonfigurasi di server. Lampirkan tautan URL eksternal (Google Drive / GitHub / dokumen) untuk menyimpan pengumpulan tugas ke Firestore.',
  };
}
