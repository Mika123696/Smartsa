import { useState, useEffect } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  subscribeDiscussions,
  createDiscussionTopic,
  toggleLikeDiscussion,
  addDiscussionReply,
  deleteDiscussionReply,
  deleteDiscussionTopic,
} from '../../services/lmsFirestoreService';
import { AccessibleDialog } from '../common/AccessibleDialog';
import {
  MessageSquare,
  ThumbsUp,
  Send,
  CornerDownRight,
  Trash2,
  Reply,
  AlertCircle,
} from 'lucide-react';

const TOPIC_TO_CLASS_ID = {
  'Pemrograman Berorientasi Objek': 'subj_pbo',
  'Basis Data': 'subj_bd',
  'Pemrograman Web dan Perangkat Bergerak': 'subj_pwmb',
  'Pemrograman Dasar & Algoritma': 'subj_pda',
  'Desain Industri & UI/UX': 'subj_uiux',
  'Pemodelan Perangkat Lunak': 'subj_ppl',
};

export default function DiscussionTab() {
  const { userProfile, currentUser, role } = useAuth();
  const { t, language } = useLanguage();

  const currentKey = currentUser?.uid || 'demo';
  const [discussions, setDiscussions] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [questionInput, setQuestionInput] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('Pemrograman Berorientasi Objek');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyInputs, setReplyInputs] = useState({});
  const [posting, setPosting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loading = loadedKey !== currentKey;

  useEffect(() => {
    const unsubscribe = subscribeDiscussions((res) => {
      setDiscussions(res.discussions || []);
      setErrorMsg(res.error || null);
      setLoadedKey(currentKey);
    });
    return () => unsubscribe();
  }, [currentKey]);

  const activeAuthorName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    (language === 'en' ? 'Demo Student' : 'Mahasiswa Demo');

  const activeAvatar =
    userProfile?.photoURL ||
    currentUser?.photoURL ||
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';

  const handlePostQuestion = async (e) => {
    e.preventDefault();
    if (!questionInput.trim() || posting) return;
    setErrorMsg(null);

    if (!currentUser) {
      const now = new Date();
      const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')} WIB`;
      const demoItem = {
        id: `disc_demo_${Date.now()}`,
        classId: TOPIC_TO_CLASS_ID[selectedTopic] || 'subj_pbo',
        subject: selectedTopic,
        authorUid: 'demo_user',
        author: activeAuthorName,
        avatar: activeAvatar,
        time: `${language === 'en' ? 'Today' : 'Hari ini'}, ${timeFormatted} (Demo)`,
        content: questionInput.trim(),
        likes: 0,
        likedBy: [],
        replies: [],
      };
      setDiscussions((prev) => [demoItem, ...prev]);
      setQuestionInput('');
      return;
    }

    setPosting(true);
    try {
      await createDiscussionTopic({
        classId: TOPIC_TO_CLASS_ID[selectedTopic] || 'subj_pbo',
        subject: selectedTopic,
        content: questionInput.trim(),
        authorName: activeAuthorName,
        avatar: activeAvatar,
      });
      setQuestionInput('');
    } catch (err) {
      setErrorMsg(err.message || 'Gagal mengirim topik diskusi ke Firestore.');
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (disc) => {
    setErrorMsg(null);
    if (!currentUser) {
      setDiscussions((prev) =>
        prev.map((d) => (d.id === disc.id ? { ...d, likes: Number(d.likes || 0) + 1 } : d))
      );
      return;
    }

    try {
      await toggleLikeDiscussion(disc);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memperbarui suka diskusi.');
    }
  };

  const executeConfirmedDelete = async () => {
    if (!deleteConfirm) return;
    setErrorMsg(null);

    if (deleteConfirm.type === 'topic') {
      const { discId } = deleteConfirm;
      if (!currentUser) {
        setDiscussions((prev) => prev.filter((d) => d.id !== discId));
        setDeleteConfirm(null);
        return;
      }
      try {
        await deleteDiscussionTopic(discId);
      } catch (err) {
        setErrorMsg(err.message || 'Anda tidak memiliki izin untuk menghapus topik diskusi ini.');
      } finally {
        setDeleteConfirm(null);
      }
    } else if (deleteConfirm.type === 'reply') {
      const { disc, replyIndex } = deleteConfirm;
      if (!currentUser) {
        setDiscussions((prev) =>
          prev.map((d) =>
            d.id === disc.id
              ? { ...d, replies: (d.replies || []).filter((_, idx) => idx !== replyIndex) }
              : d
          )
        );
        setDeleteConfirm(null);
        return;
      }
      try {
        await deleteDiscussionReply(disc, replyIndex);
      } catch (err) {
        setErrorMsg(err.message || 'Gagal menghapus balasan diskusi.');
      } finally {
        setDeleteConfirm(null);
      }
    }
  };

  const handleAddReply = async (disc) => {
    const text = replyInputs[disc.id]?.trim();
    if (!text) return;
    setErrorMsg(null);

    if (!currentUser) {
      const now = new Date();
      const timeFormatted = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')} WIB`;
      const newReply = {
        id: `rep_${Date.now()}`,
        authorUid: 'demo_user',
        author: activeAuthorName,
        time: `${language === 'en' ? 'Today' : 'Hari ini'}, ${timeFormatted}`,
        content: text,
      };
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === disc.id ? { ...d, replies: [...(d.replies || []), newReply] } : d
        )
      );
      setReplyInputs((prev) => ({ ...prev, [disc.id]: '' }));
      setActiveReplyId(null);
      return;
    }

    try {
      await addDiscussionReply(disc, text, activeAuthorName);
      setReplyInputs((prev) => ({ ...prev, [disc.id]: '' }));
      setActiveReplyId(null);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal mengirim balasan diskusi ke Firestore.');
    }
  };

  const isPrivileged = role === ROLES.LECTURER || role === ROLES.ADMIN;

  return (
    <div className="space-y-6 font-sans">
      <AccessibleDialog
        isOpen={Boolean(deleteConfirm)}
        variant="danger"
        title={t('dialog_confirm')}
        message={
          deleteConfirm?.type === 'reply'
            ? t('confirm_delete_reply')
            : t('confirm_delete_topic')
        }
        confirmLabel={t('dialog_confirm')}
        cancelLabel={t('dialog_cancel')}
        onConfirm={executeConfirmedDelete}
        onClose={() => setDeleteConfirm(null)}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            {t('discussion_title')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('discussion_subtitle')}
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border bg-sky-50 dark:bg-[#121822] border-sky-200 dark:border-[#232f42] text-sky-700 dark:text-[#00e5ff] shrink-0">
          {currentUser ? 'FIRESTORE LIVE' : 'MODE DEMO'}
        </span>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 rounded-xl text-xs font-mono text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* New Topic Form */}
      <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-3 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-amber-600 dark:text-[#f59e0b] font-mono">
            {language === 'en' ? '// START A NEW TOPIC' : '// MULAI TOPIK DISKUSI BARU'}
          </span>
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-[#18212e] text-slate-900 dark:text-slate-200 focus:outline-none focus:border-[#f59e0b] font-mono"
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
            className="w-full text-xs sm:text-sm p-3 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0b0f17] rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!questionInput.trim() || posting}
              className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              {posting
                ? language === 'en'
                  ? 'Posting...'
                  : 'Mengirim...'
                : language === 'en'
                ? 'Post Question'
                : 'Kirim Pertanyaan'}
            </button>
          </div>
        </form>
      </div>

      {/* Discussions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center bg-white dark:bg-[#121822] rounded-2xl border border-slate-200 dark:border-[#232f42] text-slate-500 dark:text-slate-400 text-xs font-mono">
            {language === 'en'
              ? 'Loading discussion forum from Cloud Firestore...'
              : 'Memuat forum diskusi dari Cloud Firestore...'}
          </div>
        ) : discussions.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-[#121822] rounded-2xl border border-slate-200 dark:border-[#232f42] text-slate-500 dark:text-slate-400 space-y-2">
            <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-[#182230] text-[#f59e0b] flex items-center justify-center mx-auto mb-2 border border-amber-200 dark:border-[#232f42]">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
              {language === 'en' ? 'No discussion messages yet' : 'Belum ada pesan diskusi'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              {language === 'en'
                ? 'Type your question or message in the form above to start a discussion!'
                : 'Ketik pertanyaan atau pesan Anda pada formulir di atas untuk memulai diskusi!'}
            </p>
          </div>
        ) : (
          discussions.map((d) => {
            const canDeleteTopic = !currentUser || d.authorUid === currentUser.uid || isPrivileged;
            const hasLiked = Boolean(
              currentUser && Array.isArray(d.likedBy) && d.likedBy.includes(currentUser.uid)
            );

            return (
              <div
                key={d.id}
                className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-3 text-slate-900 dark:text-slate-100 relative group"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={d.avatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-[#f59e0b]/40"
                    />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                        {d.author}
                      </h4>
                      <span className="text-[10px] text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#f59e0b]/10 border border-amber-200 dark:border-[#f59e0b]/30 px-2 py-0.5 rounded-md font-semibold font-mono">
                        {d.subject}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {d.time}
                    </span>
                    {canDeleteTopic && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ type: 'topic', discId: d.id })}
                        title={language === 'en' ? 'Delete topic' : 'Hapus pesan ini'}
                        aria-label={language === 'en' ? 'Delete topic' : 'Hapus pesan ini'}
                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-11">
                  {d.content}
                </p>

                {/* Actions */}
                <div className="pl-11 pt-1 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                  <button
                    type="button"
                    onClick={() => handleLike(d)}
                    className={`flex items-center gap-1.5 transition cursor-pointer ${
                      hasLiked
                        ? 'text-amber-600 dark:text-[#f59e0b] font-bold'
                        : 'hover:text-amber-600 dark:hover:text-[#f59e0b]'
                    }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>
                      {d.likes} {language === 'en' ? 'Likes' : 'Suka'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveReplyId(activeReplyId === d.id ? null : d.id)}
                    className="flex items-center gap-1.5 hover:text-sky-600 dark:hover:text-[#00e5ff] transition cursor-pointer"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>
                      {d.replies?.length || 0} {language === 'en' ? 'Replies' : 'Balasan'}
                    </span>
                  </button>
                </div>

                {/* Reply Form */}
                {activeReplyId === d.id && (
                  <div className="ml-11 mt-2 p-3 bg-slate-50 dark:bg-[#0a0f18] rounded-xl border border-slate-200 dark:border-[#232f42] space-y-2">
                    <textarea
                      rows="2"
                      placeholder={
                        language === 'en' ? 'Write a reply...' : 'Tulis balasan untuk diskusi ini...'
                      }
                      value={replyInputs[d.id] || ''}
                      onChange={(e) =>
                        setReplyInputs((prev) => ({ ...prev, [d.id]: e.target.value }))
                      }
                      className="w-full text-xs p-2.5 bg-white dark:bg-[#121822] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
                    />
                    <div className="flex justify-end gap-2 font-mono">
                      <button
                        type="button"
                        onClick={() => setActiveReplyId(null)}
                        className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                      >
                        {language === 'en' ? 'Cancel' : 'Batal'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddReply(d)}
                        disabled={!replyInputs[d.id]?.trim()}
                        className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-1 rounded-md transition disabled:opacity-50 cursor-pointer"
                      >
                        {language === 'en' ? 'Reply' : 'Kirim Balasan'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Replies */}
                {d.replies && d.replies.length > 0 && (
                  <div className="ml-11 mt-3 pt-3 border-t border-slate-200 dark:border-[#1f2937] space-y-2.5">
                    {d.replies.map((r, rIdx) => {
                      const canDeleteReply =
                        !currentUser ||
                        r.authorUid === currentUser.uid ||
                        d.authorUid === currentUser.uid ||
                        isPrivileged;
                      return (
                        <div
                          key={r.id || rIdx}
                          className="bg-slate-50 dark:bg-[#17202d] p-3 rounded-xl border border-slate-200 dark:border-[#232f42] space-y-1 relative group/rep"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3 text-[#f59e0b]" />
                              {r.author}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {r.time}
                              </span>
                              {canDeleteReply && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirm({ type: 'reply', disc: d, replyIndex: rIdx })
                                  }
                                  title={language === 'en' ? 'Delete reply' : 'Hapus balasan ini'}
                                  aria-label={language === 'en' ? 'Delete reply' : 'Hapus balasan ini'}
                                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer p-0.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pl-4">
                            {r.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
