import { useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/LanguageContext';
import {
  MessageSquare,
  ThumbsUp,
  Send,
  CornerDownRight,
} from 'lucide-react';
import { DEMO_DISCUSSIONS } from '../../services/mockData';

export default function DiscussionTab() {
  const { userProfile } = useAuth();
  const { t, language } = useLanguage();
  const [discussions, setDiscussions] = useState(DEMO_DISCUSSIONS);
  const [questionInput, setQuestionInput] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('Pemrograman Berorientasi Objek');

  const handlePostQuestion = (e) => {
    e.preventDefault();
    if (!questionInput.trim()) return;

    const newDisc = {
      id: `disc_${Date.now()}`,
      author: userProfile?.displayName || (language === 'en' ? 'Demo Student' : 'Mahasiswa Demo'),
      avatar: userProfile?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
      subject: selectedTopic,
      time: language === 'en' ? 'Just now' : 'Baru saja',
      content: questionInput.trim(),
      likes: 0,
      replies: [],
    };

    setDiscussions([newDisc, ...discussions]);
    setQuestionInput('');
  };

  const handleLike = (id) => {
    setDiscussions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, likes: d.likes + 1 } : d))
    );
  };

  return (
    <div className="space-y-6">
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
            className="text-xs border border-slate-700 rounded-lg px-2 py-1 bg-[#18212e] text-slate-200 focus:outline-none focus:border-[#f59e0b] font-mono"
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
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {language === 'en' ? 'Post Question' : 'Kirim Pertanyaan'}
            </button>
          </div>
        </form>
      </div>

      {/* Daftar Diskusi */}
      <div className="space-y-4">
        {discussions.map((d) => (
          <div
            key={d.id}
            className="bg-[#121822] p-5 rounded-2xl border border-[#232f42] shadow-xs space-y-3 text-slate-100"
          >
            {/* Header Pertanyaan */}
            <div className="flex items-center justify-between">
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
              <span className="text-[11px] text-slate-400 font-mono">{d.time}</span>
            </div>

            {/* Isi Pertanyaan */}
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-11">
              {d.content}
            </p>

            {/* Actions: Likes & Replies count */}
            <div className="pl-11 pt-1 flex items-center gap-4 text-xs text-slate-400 font-mono">
              <button
                onClick={() => handleLike(d.id)}
                className="flex items-center gap-1.5 hover:text-[#f59e0b] transition"
              >
                <ThumbsUp className="w-3.5 h-3.5" />
                <span>{d.likes} {language === 'en' ? 'Likes' : 'Suka'}</span>
              </button>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{d.replies.length} {language === 'en' ? 'Replies' : 'Balasan'}</span>
              </span>
            </div>

            {/* Jawaban Dosen / Rekan */}
            {d.replies.length > 0 && (
              <div className="ml-11 mt-3 pt-3 border-t border-[#1f2937] space-y-2.5">
                {d.replies.map((r, rIdx) => (
                  <div key={rIdx} className="bg-[#17202d] p-3 rounded-xl border border-[#232f42] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 flex items-center gap-1">
                        <CornerDownRight className="w-3 h-3 text-[#f59e0b]" />
                        {r.author}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{r.time}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pl-4">
                      {r.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}