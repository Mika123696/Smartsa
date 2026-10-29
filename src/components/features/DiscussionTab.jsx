import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import {
  MessageSquare,
  ThumbsUp,
  Send,
  CornerDownRight,
  Trash2,
  Reply,
  Sparkles,
} from 'lucide-react';
import { DEMO_DISCUSSIONS } from '../../services/mockData';

const STORAGE_KEY = 'smartsa_discussions';

export default function DiscussionTab() {
  const { userProfile } = useAuth();
  const { t, language } = useLanguage();

  // Load chat dari localStorage, filter chat lama Ahmad Faiz & Dewi Lestari
  const [discussions, setDiscussions] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (d) =>
              d.author !== 'Ahmad Faiz' &&
              d.author !== 'Dewi Lestari' &&
              d.id !== 'disc_01' &&
              d.id !== 'disc_02'
          );
        }
      }
    } catch (e) {
      console.error('Failed to load discussions from localStorage', e);
    }
    return DEMO_DISCUSSIONS || [];
  });

  const [questionInput, setQuestionInput] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('Pemrograman Berorientasi Objek');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyInputs, setReplyInputs] = useState({});

  // Simpan setiap perubahan chat ke localStorage agar tidak hilang saat direfresh
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(discussions));
    } catch (e) {
      console.error('Failed to save discussions to localStorage', e);
    }
  }, [discussions]);

  const handlePostQuestion = (e) => {
    e.preventDefault();
    if (!questionInput.trim()) return;

    const now = new Date();
    const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`;

    const newDisc = {
      id: `disc_${Date.now()}`,
      author: userProfile?.displayName || (language === 'en' ? 'Demo Student' : 'Mahasiswa Demo'),
      avatar: userProfile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
      subject: selectedTopic,
      time: `${language === 'en' ? 'Today' : 'Hari ini'}, ${timeFormatted}`,
      content: questionInput.trim(),
      likes: 0,
      replies: [],
    };

    setDiscussions((prev) => [newDisc, ...prev]);
    setQuestionInput('');
  };

  const handleLike = (id) => {
    setDiscussions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, likes: d.likes + 1 } : d))
    );
  };

  // Fitur Hapus Chat Diskusi
  const handleDeleteDiscussion = (discId) => {
    if (window.confirm(language === 'en' ? 'Are you sure you want to delete this discussion topic?' : 'Apakah Anda yakin ingin menghapus pesan diskusi ini?')) {
      setDiscussions((prev) => prev.filter((d) => d.id !== discId));
    }
  };

  // Fitur Tambah Balasan Chat
  const handleAddReply = (discId) => {
    const text = replyInputs[discId]?.trim();
    if (!text) return;

    const now = new Date();
    const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`;

    const newReply = {
      id: `rep_${Date.now()}`,
      author: userProfile?.displayName || (language === 'en' ? 'Demo Student' : 'Mahasiswa Demo'),
      time: `${language === 'en' ? 'Today' : 'Hari ini'}, ${timeFormatted}`,
      content: text,
    };

    setDiscussions((prev) =>
      prev.map((d) =>
        d.id === discId
          ? { ...d, replies: [...(d.replies || []), newReply] }
          : d
      )
    );

    setReplyInputs((prev) => ({ ...prev, [discId]: '' }));
    setActiveReplyId(null);
  };

  // Fitur Hapus Balasan Tertentu
  const handleDeleteReply = (discId, replyIndex) => {
    if (window.confirm(language === 'en' ? 'Delete this reply?' : 'Hapus balasan ini?')) {
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === discId
            ? { ...d, replies: d.replies.filter((_, idx) => idx !== replyIndex) }
            : d
        )
      );
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">
          {t('discussion_title')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          {t('discussion_subtitle')}
        </p>
      </div>

      {/* Form Ajukan Pertanyaan */}
      <div className="bg-[#121822] p-5 rounded-2xl border border-[#232f42] shadow-xs space-y-3 text-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#f59e0b] font-mono">
            {language === 'en' ? '// START A NEW TOPIC' : '// MULAI TOPIK DISKUSI BARU'}
          </span>
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 bg-[#18212e] text-slate-200 focus:outline-none focus:border-[#f59e0b] font-mono"
          >
            <option value="Pemrograman Berorientasi Objek">PBO</option>
            <option value="Basis Data">Basis Data</option>
            <option value="Pemrograman Web dan Perangkat Bergerak">PWPB</option>
            <option value="Pemrograman Dasar & Algoritma">Algoritma</option>
            <option value="Desain Industri & UI/UX">UI/UX</option>
            <option value="Pemodelan Perangkat Lunak">PPL</option>
          </select>
        </div>

        <form onSubmit={handlePostQuestion} className="space-y-3">
          <textarea
            rows="2"
            placeholder={t('comment_placeholder')}
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            className="w-full text-xs sm:text-sm p-3 border border-slate-700 bg-[#0b0f17] rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
          ></textarea>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!questionInput.trim()}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              {language === 'en' ? 'Post Question' : 'Kirim Pertanyaan'}
            </button>
          </div>
        </form>
      </div>

      {/* Daftar Diskusi */}
      <div className="space-y-4">
        {discussions.length === 0 ? (
          <div className="p-8 text-center bg-[#121822] rounded-2xl border border-[#232f42] text-slate-400 space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#182230] text-[#f59e0b] flex items-center justify-center mx-auto mb-2 border border-[#232f42]">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-200">
              {language === 'en' ? 'No discussion messages yet' : 'Belum ada pesan diskusi'}
            </p>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              {language === 'en'
                ? 'Type your question or message in the form above to start a discussion!'
                : 'Ketik pertanyaan atau pesan Anda pada formulir di atas untuk memulai diskusi!'}
            </p>
          </div>
        ) : (
          discussions.map((d) => (
            <div
              key={d.id}
              className="bg-[#121822] p-5 rounded-2xl border border-[#232f42] shadow-xs space-y-3 text-slate-100 relative group"
            >
              {/* Header Pertanyaan */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src={d.avatar}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover ring-2 ring-[#f59e0b]/40"
                  />
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-100">{d.author}</h4>
                    <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-2 py-0.5 rounded-md font-semibold font-mono">
                      {d.subject}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">{d.time}</span>
                  {/* Tombol Hapus Chat */}
                  <button
                    onClick={() => handleDeleteDiscussion(d.id)}
                    title={language === 'en' ? 'Delete topic' : 'Hapus pesan ini'}
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Isi Pertanyaan */}
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-11">
                {d.content}
              </p>

              {/* Actions: Likes, Replies count, & Reply Toggle */}
              <div className="pl-11 pt-1 flex items-center gap-4 text-xs text-slate-400 font-mono">
                <button
                  onClick={() => handleLike(d.id)}
                  className="flex items-center gap-1.5 hover:text-[#f59e0b] transition cursor-pointer"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>{d.likes} {language === 'en' ? 'Likes' : 'Suka'}</span>
                </button>
                <button
                  onClick={() => setActiveReplyId(activeReplyId === d.id ? null : d.id)}
                  className="flex items-center gap-1.5 hover:text-[#00e5ff] transition cursor-pointer"
                >
                  <Reply className="w-3.5 h-3.5" />
                  <span>{d.replies?.length || 0} {language === 'en' ? 'Replies' : 'Balasan'}</span>
                </button>
              </div>

              {/* Form Input Balasan (Jika Aktif) */}
              {activeReplyId === d.id && (
                <div className="ml-11 mt-2 p-3 bg-[#0a0f18] rounded-xl border border-[#232f42] space-y-2">
                  <textarea
                    rows="2"
                    placeholder={language === 'en' ? 'Write a reply...' : 'Tulis balasan untuk diskusi ini...'}
                    value={replyInputs[d.id] || ''}
                    onChange={(e) =>
                      setReplyInputs((prev) => ({ ...prev, [d.id]: e.target.value }))
                    }
                    className="w-full text-xs p-2.5 bg-[#121822] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                  ></textarea>
                  <div className="flex justify-end gap-2 font-mono">
                    <button
                      type="button"
                      onClick={() => setActiveReplyId(null)}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white transition cursor-pointer"
                    >
                      {language === 'en' ? 'Cancel' : 'Batal'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddReply(d.id)}
                      disabled={!replyInputs[d.id]?.trim()}
                      className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-1 rounded-md transition disabled:opacity-50 cursor-pointer"
                    >
                      {language === 'en' ? 'Reply' : 'Kirim Balasan'}
                    </button>
                  </div>
                </div>
              )}

              {/* Jawaban Dosen / Rekan */}
              {d.replies && d.replies.length > 0 && (
                <div className="ml-11 mt-3 pt-3 border-t border-[#1f2937] space-y-2.5">
                  {d.replies.map((r, rIdx) => (
                    <div key={r.id || rIdx} className="bg-[#17202d] p-3 rounded-xl border border-[#232f42] space-y-1 relative group/rep">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-200 flex items-center gap-1">
                          <CornerDownRight className="w-3 h-3 text-[#f59e0b]" />
                          {r.author}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">{r.time}</span>
                          <button
                            onClick={() => handleDeleteReply(d.id, rIdx)}
                            title={language === 'en' ? 'Delete reply' : 'Hapus balasan ini'}
                            className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pl-4">
                        {r.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Spacer ekstra di bawah agar nyaman di-scroll */}
      <div className="h-28 w-full" aria-hidden="true" />
    </div>
  );
}