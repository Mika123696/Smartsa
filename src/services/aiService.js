// Abstraksi Layanan Google Gemini AI untuk Smartsa LMS

export const AI_STATUS = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  READY_BACKEND: 'READY_BACKEND',
  ACTIVE: 'ACTIVE',
};

// Simulasi respons asistensi cerdas jika API key backend belum dimasukkan
const MOCK_AI_RESPONSES = {
  learning: [
    "Clean Architecture memisahkan kode menjadi lapisan domain, use case, dan presentation. Tujuannya adalah agar aturan bisnis inti tidak bergantung pada framework UI atau database eksternal.",
    "Perbedaan mendasar antara SQL dan Firestore (NoSQL): SQL terstruktur dalam tabel dan relasi skema ketat, sedangkan Firestore menyimpan data dalam dokumen JSON yang dikelompokkan ke dalam koleksi, sangat optimal untuk sinkronisasi real-time.",
    "Dalam implementasi Firebase Security Rules, fungsi helper `isAuthenticated()` memastikan pengguna memiliki token valid dan email telah terverifikasi sebelum membaca data kelas.",
  ],
  teaching: [
    "DRAF SOAL PRETEST (Taksonomi Bloom C3 - Aplikasi):\n1. Manakah dari skenario berikut yang paling tepat menggunakan Cloud Firestore dibandingkan database relasional?\n   A. Transaksi akuntansi ganda perbankan\n   B. Aplikasi obrolan kolaboratif real-time dengan akses offline (Kunci)\n   C. Query analitik OLAP multi-tabel\n   D. Penyimpanan log biner terkompresi",
    "DRAF RANGKUMAN MATERI:\n- Pokok Bahasan: Middleware Serverless Functions pada Vercel\n- Tujuan Pembelajaran: Mahasiswa mampu membangun endpoint API yang memvalidasi JWT token Firebase Admin sebelum mengakses resource privat.",
  ],
};

export async function askAIAssistant({ mode = 'learning', prompt, context = '', isExamActive = false }) {
  // ATURAN KEAMANAN INTI: Kunci total AI jika sesi evaluasi/ujian sedang aktif
  if (isExamActive) {
    throw new Error('AKSES DITOLAK: Asisten AI dinonaktifkan secara otomatis selama sesi ujian (Pretest/Post-test) berlangsung.');
  }

  if (!prompt || !prompt.trim()) {
    throw new Error('Pertanyaan atau prompt tidak boleh kosong.');
  }

  // Cek apakah endpoint backend Vercel /api/ai tersedia
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, prompt, context }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        text: data.response_text,
        isLive: true,
        tokens: data.tokens_consumed || 150,
      };
    }
  } catch {
    // Backend API belum di-deploy di Vercel atau belum memiliki GEMINI_API_KEY
  }

  // Respon Fallback Cerdas (DEMO Mode) dengan label yang transparan
  await new Promise((resolve) => setTimeout(resolve, 800)); // Latensi alami
  const pool = mode === 'teaching' ? MOCK_AI_RESPONSES.teaching : MOCK_AI_RESPONSES.learning;
  const randomIndex = Math.floor(Math.random() * pool.length);

  return {
    text: pool[randomIndex],
    isLive: false,
    note: 'Mode Demonstrasi (Backend API Key Gemini belum dikonfigurasi di Vercel Environment Variables).',
  };
}

