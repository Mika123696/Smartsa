import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import { askAIAssistant, subscribeActiveExamStatus } from '../../services/aiService';
import {
  Sparkles,
  Send,
  ShieldAlert,
  ShieldCheck,
  Bot,
  User,
  Cpu,
} from 'lucide-react';

export default function AIAssistantView() {
  const { role, currentUser } = useAuth();
  const { t, language } = useLanguage();
  const isTeacher = role === ROLES.LECTURER || role === ROLES.ADMIN;
  const assistantTitle = isTeacher ? t('sidebar_ai_lecturer') : t('sidebar_ai_student');

  const [inputPrompt, setInputPrompt] = useState('');
  const [examLock, setExamLock] = useState({ isExamActive: false, activeAttempt: null });
  const [assistantMode, setAssistantMode] = useState('local_frozen');
  const [loading, setLoading] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState(18);

  useEffect(() => {
    const unsubscribe = subscribeActiveExamStatus((status) => {
      setExamLock(status);
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: isTeacher
        ? (language === 'en'
            ? 'Hello Educator! I am Smartsa LMS Teaching Assistant (Local Assistant Mode). I can help draft syllabi, Bloom taxonomy questions, and task rubrics.'
            : 'Halo Bapak/Ibu Pendidik! Saya Teaching Assistant Smartsa LMS (Mode Asisten Lokal). Saya dapat membantu menyusun draf silabus, bank soal berbasis Taksonomi Bloom, dan rubrik tugas.')
        : (language === 'en'
            ? 'Hello! I am Smartsa LMS Learning Assistant (Local Assistant Mode). Ask about programming concepts, Firestore architecture, or request simple analogies.'
            : 'Halo! Saya Learning Assistant Smartsa LMS (Mode Asisten Lokal). Tanyakan konsep pemrograman, arsitektur Firestore, atau mintalah analogi sederhana untuk memahami materi kuliah.'),
      note:
        language === 'en'
          ? 'Local Assistant Mode active (Live Google Gemini LLM integration temporarily paused).'
          : 'Mode Asisten Lokal aktif (Integrasi live Google Gemini LLM ditunda sementara).',
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
        context: language === 'en' ? 'Smartsa LMS Learning Assistant' : 'Asisten Pembelajaran Smartsa LMS',
        isExamActive: examLock.isExamActive,
      });

      if (result.isLive) {
        setAssistantMode('gemini_live');
      } else {
        setAssistantMode('local_frozen');
      }

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
    ? language === 'en'
      ? [
          'Draft 2 multiple-choice pretest questions on Cloud Firestore NoSQL.',
          'Create a group project grading rubric for Clean Architecture.',
          'Summarize serverless architecture topics into a 2-meeting syllabus.',
        ]
      : [
          'Buatkan 2 butir soal pretest pilihan ganda tentang Cloud Firestore NoSQL.',
          'Buat draf rubrik penilaian proyek kelompok Clean Architecture.',
          'Rangkum pokok bahasan arsitektur serverless menjadi silabus 2 pertemuan.',
        ]
    : language === 'en'
    ? [
        'Explain the key differences between SQL and Cloud Firestore NoSQL.',
        'How does Clean Architecture work inside a mobile application?',
        'Why must exam answer keys never be stored on the client side?',
      ]
    : [
        'Jelaskan perbedaan mendasar antara SQL dan NoSQL Firestore.',
        'Bagaimana alur kerja Clean Architecture dalam sebuah aplikasi mobile?',
        'Mengapa kunci jawaban ujian tidak boleh disimpan di aplikasi sisi klien?',
      ];

  const isLocked = examLock.isExamActive;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs px-3 py-1 rounded-full font-semibold">
                <Cpu className="w-3.5 h-3.5" />
                {assistantMode === 'gemini_live'
                  ? 'Google Gemini LLM (Live)'
                  : language === 'en'
                  ? 'Local Assistant Mode (Gemini Paused)'
                  : 'Mode Asisten Lokal (Gemini Ditunda)'}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs px-3 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                Grounding Smartsa LMS
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">{assistantTitle}</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              {language === 'en'
                ? 'The learning assistant runs in safe local mode while live Gemini API integration is paused, verifying active exam status in Cloud Firestore (exam_attempts).'
                : 'Asisten pembelajaran berjalan dalam mode lokal aman selama integrasi Gemini API dibekukan, dengan verifikasi status ujian aktif di Cloud Firestore (exam_attempts).'}
            </p>
          </div>

          {/* Real-time Firestore Exam Lockout Status Card */}
          <div className="bg-white/10 border border-white/20 p-3.5 rounded-xl text-xs space-y-1.5 self-start md:self-auto min-w-[220px]">
            <span className="font-semibold text-slate-200 block">
              {language === 'en' ? 'Exam Integrity Status (Live):' : 'Status Integritas Ujian (Nyata):'}
            </span>
            <div className="flex items-center gap-2">
              {isLocked ? (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-rose-300 font-bold">
                    {language === 'en' ? 'Active Exam Session (AI Locked)' : 'Sesi Ujian Aktif (AI Terkunci)'}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-emerald-300 font-bold">
                    {language === 'en' ? 'Normal Study Mode' : 'Mode Belajar Normal'}
                  </span>
                </>
              )}
            </div>
            <span className="text-[10px] text-slate-300 block">
              {currentUser
                ? language === 'en'
                  ? 'Auto-synced with Firestore exam_attempts'
                  : 'Tersinkron otomatis dengan koleksi exam_attempts Firestore'
                : language === 'en'
                ? 'Monitoring active evaluation sessions locally'
                : 'Memantau sesi evaluasi aktif di perangkat'}
            </span>
          </div>
        </div>
      </div>

      {/* Security Status Alert if Locked */}
      {isLocked && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-200 rounded-2xl text-xs flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-rose-800 dark:text-rose-300">
              {language === 'en' ? 'ACADEMIC INTEGRITY POLICY ACTIVE:' : 'ATURAN INTEGRITAS AKADEMIK AKTIF:'}
            </strong>
            <p className="mt-0.5">
              {language === 'en'
                ? `Active exam session detected${examLock.activeAttempt?.classId ? ` (${examLock.activeAttempt.classId})` : ''}. The AI assistant and /api/ai endpoint automatically return 403 Forbidden until you submit the exam.`
                : `Sistem mendeteksi Anda sedang memiliki sesi ujian aktif${examLock.activeAttempt?.classId ? ` (${examLock.activeAttempt.classId})` : ''}. Asisten AI dan endpoint /api/ai otomatis menolak akses dengan status 403 Forbidden hingga ujian selesai dikumpulkan.`}
            </p>
          </div>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="bg-white dark:bg-[#121822] rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs flex flex-col h-[520px] overflow-hidden">
        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
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
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
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
                    ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-rose-900 dark:text-rose-200 rounded-tl-xs'
                    : 'bg-slate-50 dark:bg-[#161d2a] border border-slate-200 dark:border-[#232f42] text-slate-800 dark:text-slate-200 rounded-tl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.note && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[#232f42] text-[11px] text-amber-700 dark:text-amber-400 italic">
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
              <div className="bg-slate-50 dark:bg-[#161d2a] border border-slate-200 dark:border-[#232f42] p-3 rounded-2xl text-xs text-slate-500 dark:text-slate-400">
                {language === 'en'
                  ? 'Local assistant is processing learning context...'
                  : 'Asisten lokal sedang memproses konteks materi pembelajaran...'}
              </div>
            </div>
          )}
        </div>

        {/* Quick Sample Prompts */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50/80 dark:bg-[#161d2a] border-t border-slate-100 dark:border-[#232f42] flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium shrink-0">
            {language === 'en' ? 'Quick Prompts:' : 'Contoh Cepat:'}
          </span>
          {samplePrompts.map((promptText, i) => (
            <button
              key={i}
              type="button"
              disabled={isLocked || loading}
              onClick={() => handleSend(promptText)}
              className="bg-white dark:bg-[#18212e] border border-slate-200 dark:border-[#2b3a4f] hover:border-blue-400 dark:hover:border-[#f59e0b] text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full text-[11px] shrink-0 transition disabled:opacity-50"
            >
              {promptText.slice(0, 38)}...
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <div className="p-4 bg-white dark:bg-[#121822] border-t border-slate-200 dark:border-[#232f42]">
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
                isLocked
                  ? language === 'en'
                    ? 'Assistant locked during active exam...'
                    : 'Asisten terkunci selama ujian aktif...'
                  : language === 'en'
                  ? 'Type your question or request here...'
                  : 'Ketik pertanyaan atau permintaan pembuatan silabus/soal di sini...'
              }
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={loading || isLocked}
              className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-[#0b0f17] border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 dark:focus:border-[#f59e0b] disabled:bg-slate-100 dark:disabled:bg-slate-900"
            />
            <button
              type="submit"
              aria-label={language === 'en' ? 'Send message' : 'Kirim pesan'}
              disabled={loading || !inputPrompt.trim() || isLocked}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl shadow-md transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2 px-1 flex-wrap gap-1">
            <span>
              {t('ai_quota_left')}: {remainingQuota} / 20
            </span>
            <span>{t('ai_local_status')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
