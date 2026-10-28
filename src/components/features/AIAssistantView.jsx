import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import { ROLES } from '../../constants/roles';
import { askAIAssistant } from '../../services/aiService';
import {
  Sparkles,
  Send,
  ShieldAlert,
  Bot,
  User,
} from 'lucide-react';

export default function AIAssistantView() {
  const { role } = useAuth();
  const { t, language } = useLanguage();
  const isTeacher = role === ROLES.TEACHER || role === ROLES.LECTURER || role === ROLES.ADMIN;
  const assistantTitle = isTeacher ? 'Teaching Assistant AI' : 'Learning Assistant AI';

  const [inputPrompt, setInputPrompt] = useState('');
  const [isExamSimulated, setIsExamSimulated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState(18);

  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: isTeacher
        ? (language === 'en'
            ? 'Hello Educator! I am Smartsa LMS Teaching Assistant. I can help design syllabus drafts, Bloom taxonomy question banks, and task rubrics.'
            : 'Halo Bapak/Ibu Pendidik! Saya Teaching Assistant Smartsa LMS. Saya dapat membantu menyusun draf silabus, bank soal berbasis Taksonomi Bloom, dan rubrik tugas.')
        : (language === 'en'
            ? 'Hello! I am Smartsa LMS Learning Assistant. Feel free to ask about programming concepts, course materials, or request simple analogies.'
            : 'Halo! Saya Learning Assistant Smartsa LMS. Tanyakan konsep pemrograman, materi perkuliahan, atau mintalah analogi sederhana untuk memahami materi yang sedang dipelajari.'),
      note: null,
    },
  ]);

  const handleSend = async (customPrompt) => {
    const textToSend = customPrompt || inputPrompt;
    if (!textToSend.trim() || loading) return;

    const userMessage = { sender: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setLoading(true);

    try {
      const mode = isTeacher ? 'teaching' : 'learning';
      const result = await askAIAssistant({
        mode,
        prompt: textToSend,
        context: 'Materi Kuliah Rekayasa Perangkat Lunak Smartsa LMS',
        isExamActive: isExamSimulated,
      });

      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: result.text,
          note: result.note,
        },
      ]);
      setRemainingQuota((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `⚠️ ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = isTeacher
    ? [
        'Buatkan 2 butir soal pretest pilihan ganda tentang Cloud Firestore NoSQL.',
        'Buat draf rubrik penilaian proyek kelompok Clean Architecture.',
        'Rangkum pokok bahasan arsitektur serverless menjadi silabus 2 pertemuan.',
      ]
    : [
        'Jelaskan perbedaan mendasar antara SQL dan NoSQL Firestore.',
        'Bagaimana alur kerja Clean Architecture dalam sebuah aplikasi mobile?',
        'Mengapa kunci jawaban ujian tidak boleh disimpan di aplikasi sisi klien?',
      ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs px-3 py-1 rounded-full mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Model Fondasi: Google Gemini LLM
            </span>
            <h2 className="text-xl sm:text-2xl font-bold">{assistantTitle}</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Asisten kecerdasan buatan terisolasi dengan pembatasan konteks materi (*grounding context*) dan proteksi API key terpusat di serverless backend.
            </p>
          </div>

          {/* Exam Lockout Toggle (Simulasi Pengujian Keamanan) */}
          <div className="bg-white/10 border border-white/20 p-3 rounded-xl text-xs space-y-1.5 self-start md:self-auto">
            <span className="font-semibold text-slate-200 block">Simulasi Keamanan Ujian:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isExamSimulated}
                onChange={(e) => setIsExamSimulated(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500"
              />
              <span className={isExamSimulated ? 'text-rose-300 font-bold' : 'text-slate-300'}>
                {isExamSimulated ? 'Sesi Ujian Aktif (AI Terkunci)' : 'Mode Belajar Normal'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Security Status Alert if Locked */}
      {isExamSimulated && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-rose-800">ATURAN INTEGRITAS AKADEMIK AKTIF:</strong>
            <p className="mt-0.5">
              Ketika pengguna terdeteksi sedang berada dalam sesi ujian (Pretest / Post-test), endpoint <code className="font-mono bg-rose-100 px-1 py-0.5 rounded">/api/ai</code> secara otomatis menolak permintaan dengan status <strong>403 Forbidden</strong> untuk mencegah kecurangan.
            </p>
          </div>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[520px] overflow-hidden">
        {/* Messages Scroll Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 ${
                msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.isError
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {msg.sender === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>

              <div
                className={`max-w-xl p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-xs font-medium'
                    : msg.isError
                    ? 'bg-rose-50 border border-rose-200 text-rose-900 rounded-tl-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.note && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-amber-700 italic">
                    ℹ️ {msg.note}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-xs text-slate-500">
                AI sedang menganalisis konteks materi pembelajaran...
              </div>
            </div>
          )}
        </div>

        {/* Quick Sample Prompts */}
        <div className="px-6 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[11px] text-slate-400 font-medium shrink-0">Contoh Cepat:</span>
          {samplePrompts.map((promptText, i) => (
            <button
              key={i}
              onClick={() => handleSend(promptText)}
              className="bg-white border border-slate-200 hover:border-blue-400 text-slate-700 px-3 py-1 rounded-full text-[11px] shrink-0 transition"
            >
              {promptText.slice(0, 38)}...
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              placeholder={
                isExamSimulated
                  ? (language === 'en' ? 'Assistant locked during active exam...' : 'Asisten terkunci selama ujian aktif...')
                  : (language === 'en' ? 'Type your question or request here...' : 'Ketik pertanyaan atau permintaan pembuatan silabus/soal di sini...')
              }
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={loading || isExamSimulated}
              className="flex-1 px-4 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={loading || !inputPrompt.trim() || isExamSimulated}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl shadow-md transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
            <span>Sisa Kuota Permintaan: {remainingQuota} / 20</span>
            <span>Kerahasiaan API Key: Terlindungi 100% di Serverless Backend</span>
          </div>
        </div>
      </div>
    </div>
  );
}