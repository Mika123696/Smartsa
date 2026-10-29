/**
 * Layanan Presensi Barcode & Perhitungan Progres Riwayat Kelas (+6% per Pertemuan)
 * Smartsa LMS / Endfield Academic Core Spec
 */

const STORAGE_PREFIX = 'smartsa_attendance_';

// Membaca data presensi & riwayat kelas dari penyimpanan lokal
export const getClassAttendance = (classId) => {
  if (!classId) return { attendedOrders: [], progress: 0, history: [] };
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${classId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const orders = Array.isArray(parsed.attendedOrders) ? parsed.attendedOrders : [];
      // Setiap 1 pertemuan bertambah 6%
      const calculatedProgress = Math.min(100, orders.length === 16 ? 100 : orders.length * 6);
      return {
        classId,
        attendedOrders: orders,
        progress: calculatedProgress,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    }
  } catch (err) {
    console.warn('Gagal membaca data presensi kelas:', err);
  }

  return {
    classId,
    attendedOrders: [],
    progress: 0,
    history: [],
  };
};

// Mencatat presensi pertemuan via barcode scan (+6% progres riwayat)
export const recordMeetingAttendance = (classId, meetingOrder, meetingTitle = '', barcodeCode = '') => {
  if (!classId || !meetingOrder) {
    return { success: false, message: 'Data kelas atau pertemuan tidak valid.' };
  }

  const current = getClassAttendance(classId);
  const orderNum = Number(meetingOrder);

  // Periksa apakah pertemuan ini sudah pernah dicatat sebelumnya
  if (current.attendedOrders.includes(orderNum)) {
    return {
      success: false,
      alreadyAttended: true,
      progress: current.progress,
      message: `Pertemuan 0${orderNum} sudah pernah dipresensi. Progres +6% telah aktif pada riwayat Anda.`,
    };
  }

  // Tambahkan nomor pertemuan ke daftar hadir
  const updatedOrders = [...current.attendedOrders, orderNum].sort((a, b) => a - b);
  // Hitung progres: 6% per pertemuan (pertemuan ke-16 melengkapi menjadi 100%)
  const newProgress = Math.min(100, updatedOrders.length >= 16 ? 100 : updatedOrders.length * 6);

  // Buat entri riwayat presensi baru
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const resolvedBarcode =
    barcodeCode || `BARCODE-${classId.toUpperCase()}-M0${orderNum}-${Math.floor(1000 + Math.random() * 9000)}`;

  const newHistoryEntry = {
    id: `att_${classId}_m${orderNum}_${Date.now()}`,
    meetingOrder: orderNum,
    meetingTitle: meetingTitle || `Pertemuan 0${orderNum}`,
    barcode: resolvedBarcode,
    timestamp: `${dateFormatted}, ${timeFormatted} WIB`,
    progressGained: 6,
    status: 'TERVERIFIKASI',
  };

  const updatedHistory = [newHistoryEntry, ...current.history];

  const payload = {
    classId,
    attendedOrders: updatedOrders,
    progress: newProgress,
    history: updatedHistory,
    lastUpdated: now.toISOString(),
  };

  try {
    localStorage.setItem(`${STORAGE_PREFIX}${classId}`, JSON.stringify(payload));
    // Sebarkan event agar komponen lain (seperti StudentDashboard) dapat tersinkronisasi
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartsa_attendance_updated', {
          detail: { classId, meetingOrder: orderNum, progress: newProgress },
        })
      );
    }
  } catch (err) {
    console.warn('Gagal menyimpan presensi ke localStorage:', err);
  }

  return {
    success: true,
    progress: newProgress,
    addedPercent: 6,
    historyItem: newHistoryEntry,
    attendedCount: updatedOrders.length,
    message: `Presensi Pertemuan 0${orderNum} berhasil diverifikasi! Progres riwayat kehadiran bertambah +6%.`,
  };
};

// Reset presensi kelas (opsional untuk simulasi audit)
export const resetClassAttendance = (classId) => {
  if (!classId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${classId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartsa_attendance_updated', {
          detail: { classId, progress: 0 },
        })
      );
    }
  } catch (err) {
    console.warn('Gagal mereset data presensi:', err);
  }
};

