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
    'application/x-zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ],
  submission: [
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ],
};

const ALLOWED_DOC_EXTENSIONS = [
  '.pdf',
  '.pptx',
  '.ppt',
  '.docx',
  '.doc',
  '.zip',
  '.fig',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
];
const ALLOWED_SUBMISSION_EXTENSIONS = ['.pdf', '.docx', '.zip', '.jpg', '.jpeg', '.png'];

export const MATERIAL_ALLOWED_ACCEPT = '.pdf,.pptx,.ppt,.docx,.zip,.jpg,.jpeg,.png,.webp';
export const SUBMISSION_ALLOWED_ACCEPT = '.pdf,.docx,.zip,.jpg,.jpeg,.png';

const MAX_FILE_SIZES = {
  image: 5 * 1024 * 1024, // 5MB
  document: 25 * 1024 * 1024, // 25MB
  submission: 15 * 1024 * 1024, // 15MB
};

export function detectMaterialFileType(fileName = '', mimeType = '') {
  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  if (
    lowerMime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some((ext) => lowerName.endsWith(ext))
  ) {
    return 'image';
  }
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    lowerMime.includes('presentationml') ||
    lowerMime.includes('ms-powerpoint') ||
    lowerName.endsWith('.pptx') ||
    lowerName.endsWith('.ppt')
  ) {
    return 'pptx';
  }
  if (
    lowerMime.includes('wordprocessingml') ||
    lowerMime === 'application/msword' ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    return 'docx';
  }
  if (lowerMime.includes('zip') || lowerName.endsWith('.zip')) {
    return 'archive';
  }
  return 'file';
}

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
  const lowerMime = String(file.type || '').toLowerCase();
  if (lowerMime && ALLOWED_MIME_TYPES.document.includes(lowerMime)) return true;
  const lowerName = (file.name || '').toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function isSubmissionFileAllowed(file) {
  const lowerName = (file.name || '').toLowerCase();
  const hasValidExt = ALLOWED_SUBMISSION_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasValidExt) return false;
  const lowerMime = String(file.type || '').trim().toLowerCase();
  if (
    lowerMime &&
    lowerMime !== 'application/octet-stream' &&
    !ALLOWED_MIME_TYPES.submission.includes(lowerMime)
  ) {
    return false;
  }
  return true;
}

/**
 * Mengunggah berkas media/dokumen/pengumpulan tugas melalui signature aman /api/upload-sign ke Cloudinary CDN.
 */
export async function uploadMediaFile(file, category = 'image', options = {}) {
  if (!file) throw new Error('Berkas tidak ditemukan.');

  // 1. Validasi Tipe Berkas
  if (category === 'image') {
    if (!ALLOWED_MIME_TYPES.image.includes(file.type)) {
      throw new Error(
        `Format gambar tidak diizinkan. Format yang didukung: ${ALLOWED_MIME_TYPES.image.join(', ')}`
      );
    }
  } else if (category === 'submission') {
    if (!isSubmissionFileAllowed(file)) {
      throw new Error(
        `Format berkas tugas tidak diizinkan. Format yang didukung: ${ALLOWED_SUBMISSION_EXTENSIONS.join(', ')}`
      );
    }
  } else if (!isDocumentFileAllowed(file)) {
    throw new Error(
      `Format dokumen tidak diizinkan. Format yang didukung: ${ALLOWED_DOC_EXTENSIONS.join(', ')}`
    );
  }

  // 2. Validasi Ukuran Berkas
  const maxSize = MAX_FILE_SIZES[category] || MAX_FILE_SIZES.image;
  if (file.size <= 0) {
    throw new Error('Berkas kosong tidak dapat diunggah.');
  }
  if (file.size > maxSize) {
    throw new Error(`Ukuran berkas melebihi batas maksimum (${maxSize / (1024 * 1024)}MB).`);
  }

  const signPayload = { category, fileName: file.name };
  if (category === 'submission') {
    const cleanClassId = String(options?.classId || '').trim();
    const cleanAssignmentId = String(options?.assignmentId || '').trim();
    if (!cleanClassId || !cleanAssignmentId) {
      throw new Error('Parameter classId dan assignmentId wajib ada untuk mengunggah berkas tugas.');
    }
    signPayload.classId = cleanClassId;
    signPayload.assignmentId = cleanAssignmentId;
    signPayload.mimeType = file.type || 'application/octet-stream';
    signPayload.fileSize = file.size;
  }

  // 3. Permintaan signature ke endpoint backend /api/upload-sign dengan Firebase ID Token
  let roleRestrictedNote = '';
  let cloudinaryUnavailableNote = '';
  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/upload-sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(signPayload),
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
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            note: 'Berhasil diunggah ke Cloudinary CDN.',
          };
        }
        const cloudErr = await cloudRes.json().catch(() => ({}));
        throw new Error(
          cloudErr?.error?.message || `Gagal mengunggah berkas ke Cloudinary (HTTP ${cloudRes.status}).`
        );
      } else if (res.status === 429 && isJson) {
        const errData = await res.json().catch(() => ({}));
        const retrySec = Number(errData.retryAfterSeconds || res.headers.get('retry-after') || 0);
        throw new Error(
          errData.error ||
            `Terlalu banyak permintaan unggah. Coba lagi dalam ${retrySec || 60} detik.`
        );
      } else if (res.status === 403 && isJson) {
        const errData = await res.json().catch(() => ({}));
        if (category !== 'submission' && errData.code === 'FORBIDDEN_ROLE') {
          // Non-dosen tidak diberi signature Cloudinary untuk image/document -> fallback URL eksternal
          roleRestrictedNote =
            'Unggah langsung ke Cloudinary CDN dibatasi untuk Dosen/Admin.';
        } else {
          throw new Error(errData.error || 'Otorisasi upload media ditolak.');
        }
      } else if (res.status === 401 && isJson) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Sesi autentikasi upload media ditolak.');
      } else if ((res.status === 400 || res.status === 404 || res.status === 413) && isJson) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Berkas ditolak oleh server upload.');
      } else if (res.status === 503 && isJson) {
        const errData = await res.json().catch(() => ({}));
        cloudinaryUnavailableNote = errData.error || '';
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('ditolak') ||
          err.message.includes('Terlalu banyak') ||
          err.message.includes('Cloudinary') ||
          err.message.includes('maksimum') ||
          err.message.includes('wajib') ||
          err.message.includes('anggota') ||
          err.message.includes('ditemukan') ||
          err.message.includes('diizinkan'))
      ) {
        throw err;
      }
      // Backend Vercel / Cloudinary belum aktif di environment lokal -> lanjutkan ke fallback aman
    }
  }

  // 4. Fallback Aman Tanpa Kredensial Cloudinary (atau role non-dosen/admin)
  if (category === 'image') {
    const microDataUrl = await compressImageToMicroThumbnail(file, MAX_MICRO_THUMBNAIL_BYTES);
    return {
      url: microDataUrl,
      isLive: false,
      storageType: 'micro_thumbnail',
      sizeBytes: microDataUrl.length,
      note: roleRestrictedNote
        ? `${roleRestrictedNote} Menggunakan thumbnail mikro terkompresi (${Math.round(
            microDataUrl.length / 1024
          )} KB) di Firestore.`
        : `Cloudinary belum dikonfigurasi — menggunakan thumbnail mikro terkompresi (${Math.round(
            microDataUrl.length / 1024
          )} KB) di Firestore.`,
    };
  }

  return {
    url: null,
    isLive: false,
    requiresExternalUrl: true,
    storageType: 'external_url_required',
    note: roleRestrictedNote
      ? `${roleRestrictedNote} Lampirkan tautan URL eksternal (Google Drive / GitHub / dokumen) untuk menyimpan pengumpulan tugas ke Firestore.`
      : cloudinaryUnavailableNote ||
        'Cloudinary belum dikonfigurasi di server. Lampirkan tautan URL eksternal (Google Drive / GitHub / dokumen) untuk menyimpan berkas ke Firestore.',
  };
}

export async function uploadSubmissionFile(file, { classId, assignmentId }) {
  return uploadMediaFile(file, 'submission', { classId, assignmentId });
}
