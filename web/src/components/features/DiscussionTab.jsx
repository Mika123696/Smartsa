import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/useAuth';
import { useLanguage } from '../../context/useLanguage';
import { ROLES } from '../../constants/roles';
import {
  fetchClassesForUser,
  subscribeDiscussions,
  createDiscussionTopic,
  updateDiscussionTopicContent,
  toggleLikeDiscussion,
  addDiscussionReply,
  editDiscussionReply,
  deleteDiscussionReply,
  deleteDiscussionTopic,
  toggleVerifyDiscussionReply,
} from '../../services/lmsFirestoreService';
import { AccessibleDialog } from '../common/AccessibleDialog';
import SafeImage from '../common/SafeImage';
import {
  MessageSquare,
  ThumbsUp,
  Send,
  CornerDownRight,
  Trash2,
  Edit3,
  Reply,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

export default function DiscussionTab({
  embedded = false,
  classId: propClassId = null,
  classNameTitle = '',
  meetingNo: propMeetingNo = null,
  meetingTitle = '',
} = {}) {
  const { userProfile, currentUser, role } = useAuth();
  const { t, language } = useLanguage();

  const [availableClasses, setAvailableClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(Boolean(propClassId));
  const [selectedClassId, setSelectedClassId] = useState('');
  const [discussions, setDiscussions] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [questionInput, setQuestionInput] = useState('');
  const [postMeetingNo, setPostMeetingNo] = useState(() => Number(propMeetingNo || 1));
  const [filterMeetingNo, setFilterMeetingNo] = useState('all');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [replyInputs, setReplyInputs] = useState({});
  const [editingTopic, setEditingTopic] = useState(null);
  const [editingReply, setEditingReply] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const classReqIdRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const reqId = ++classReqIdRef.current;

    const resetTransientDiscussionInputs = () => {
      setQuestionInput('');
      setReplyInputs({});
      setActiveReplyId(null);
      setEditingTopic(null);
      setEditingReply(null);
      setDeleteConfirm(null);
      setFilterMeetingNo('all');
      if (propMeetingNo) {
        setPostMeetingNo(Number(propMeetingNo));
      }
    };

    if (propClassId) {
      Promise.resolve().then(() => {
        if (!mounted || reqId !== classReqIdRef.current) return;
        resetTransientDiscussionInputs();
        setClassesLoaded(true);
      });
      return () => {
        mounted = false;
      };
    }

    if (!currentUser?.uid) {
      Promise.resolve().then(() => {
        if (!mounted || reqId !== classReqIdRef.current) return;
        setAvailableClasses([]);
        setSelectedClassId('');
        resetTransientDiscussionInputs();
        setClassesLoaded(true);
      });
      return () => {
        mounted = false;
      };
    }

    fetchClassesForUser({ uid: currentUser.uid, role })
      .then((res) => {
        if (!mounted || reqId !== classReqIdRef.current) return;
        const list = res.classes || [];
        setAvailableClasses(list);
        setSelectedClassId((prev) =>
          prev && list.some((c) => c.id === prev) ? prev : list[0]?.id || ''
        );
        resetTransientDiscussionInputs();
      })
      .finally(() => {
        if (mounted && reqId === classReqIdRef.current) setClassesLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [propClassId, propMeetingNo, currentUser?.uid, role]);

  const effectiveClassId = propClassId || selectedClassId || '';
  const selectedClassObj = availableClasses.find((c) => c.id === effectiveClassId) || null;
  const availableMeetings =
    Array.isArray(selectedClassObj?.meetings) && selectedClassObj.meetings.length > 0
      ? selectedClassObj.meetings
      : [];
  const currentKey = `${currentUser?.uid || 'demo'}_${effectiveClassId || 'none'}_${propMeetingNo || 'all'}`;
  const loading = !classesLoaded || (Boolean(effectiveClassId) && loadedKey !== currentKey);
  const effectiveMeetingNo = propMeetingNo ? Number(propMeetingNo) : Number(postMeetingNo || 1);
  const effectiveSubject = propClassId
    ? classNameTitle || 'Kelas Smartsa'
    : selectedClassObj?.name || selectedClassObj?.title || '';

  useEffect(() => {
    if (!classesLoaded || !effectiveClassId) return undefined;

    const unsubscribe = subscribeDiscussions(
      (res) => {
        setDiscussions(res.discussions || []);
        setErrorMsg(res.error || null);
        setLoadedKey(currentKey);
      },
      effectiveClassId,
      propClassId && propMeetingNo ? Number(propMeetingNo) : null
    );
    return () => unsubscribe();
  }, [classesLoaded, currentKey, effectiveClassId, propClassId, propMeetingNo]);

  const activeAuthorName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    (language === 'en' ? 'Smartsa User' : 'Pengguna Smartsa');

  const activeAvatar = userProfile?.photoURL || currentUser?.photoURL || '';

  const handlePostQuestion = async (e) => {
    e.preventDefault();
    if (!effectiveClassId) {
      setErrorMsg(
        language === 'en'
          ? 'Join or create a class before starting a discussion topic.'
          : 'Buat atau gabung kelas terlebih dahulu sebelum membuat topik diskusi.'
      );
      return;
    }
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
        classId: effectiveClassId,
        meetingNo: effectiveMeetingNo,
        subject: effectiveSubject,
        authorUid: 'demo_user',
        author: activeAuthorName,
        avatar: activeAvatar,
        time: `${language === 'en' ? 'Today' : 'Hari ini'}, ${timeFormatted} (Demo)`,
        content: questionInput.trim(),
        likes: 0,
        likedBy: [],
        replies: [],
        isVerifiedAnswer: false,
        verifiedBy: '',
        verifiedReplyId: '',
      };
      setDiscussions((prev) => [demoItem, ...prev]);
      setQuestionInput('');
      return;
    }

    setPosting(true);
    try {
      await createDiscussionTopic({
        classId: effectiveClassId,
        meetingNo: effectiveMeetingNo,
        subject: effectiveSubject,
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
      const { disc, replyId, replyIndex } = deleteConfirm;
      if (!currentUser) {
        setDiscussions((prev) =>
          prev.map((d) =>
            d.id === disc.id
              ? {
                  ...d,
                  replies: (d.replies || []).filter((r, idx) =>
                    replyId && r?.id ? r.id !== replyId : idx !== replyIndex
                  ),
                }
              : d
          )
        );
        setDeleteConfirm(null);
        return;
      }
      try {
        await deleteDiscussionReply(disc, { replyId, replyIndex });
      } catch (err) {
        setErrorMsg(err.message || 'Gagal menghapus balasan diskusi.');
      } finally {
        setDeleteConfirm(null);
      }
    }
  };

  const handleSaveTopicEdit = async (e) => {
    e.preventDefault();
    if (!editingTopic || savingEdit) return;
    const nextText = String(editingTopic.content || '').trim();
    if (!nextText) return;
    setErrorMsg(null);

    if (!currentUser) {
      setDiscussions((prev) =>
        prev.map((d) => (d.id === editingTopic.id ? { ...d, content: nextText } : d))
      );
      setEditingTopic(null);
      return;
    }

    setSavingEdit(true);
    try {
      await updateDiscussionTopicContent(editingTopic.id, nextText);
      setEditingTopic(null);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memperbarui topik diskusi.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveReplyEdit = async (e) => {
    e.preventDefault();
    if (!editingReply || savingEdit) return;
    const nextText = String(editingReply.content || '').trim();
    if (!nextText) return;
    setErrorMsg(null);

    if (!currentUser) {
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === editingReply.discId
            ? {
                ...d,
                replies: (d.replies || []).map((r, idx) =>
                  editingReply.replyId && r?.id
                    ? r.id === editingReply.replyId
                      ? { ...r, content: nextText }
                      : r
                    : idx === editingReply.replyIndex
                      ? { ...r, content: nextText }
                      : r
                ),
              }
            : d
        )
      );
      setEditingReply(null);
      return;
    }

    setSavingEdit(true);
    try {
      await editDiscussionReply(editingReply.discId, {
        replyId: editingReply.replyId,
        replyIndex: editingReply.replyIndex,
        content: nextText,
      });
      setEditingReply(null);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memperbarui balasan diskusi.');
    } finally {
      setSavingEdit(false);
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

  const handleToggleVerify = async (disc, replyId = null) => {
    if (!isPrivileged) return;
    setErrorMsg(null);

    const isAlreadyVerifiedForTarget =
      Boolean(disc.isVerifiedAnswer) &&
      (replyId ? disc.verifiedReplyId === replyId : !disc.verifiedReplyId);

    const nextDemoState = isAlreadyVerifiedForTarget
      ? { isVerifiedAnswer: false, verifiedBy: '', verifiedReplyId: '' }
      : {
          isVerifiedAnswer: true,
          verifiedBy: currentUser?.uid || 'demo_lecturer',
          verifiedReplyId: replyId || '',
        };

    if (!currentUser) {
      setDiscussions((prev) =>
        prev.map((d) => (d.id === disc.id ? { ...d, ...nextDemoState } : d))
      );
      return;
    }

    try {
      await toggleVerifyDiscussionReply(disc, replyId);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memperbarui status verifikasi jawaban dosen.');
    }
  };

  const scopedDiscussions = effectiveClassId ? discussions : [];
  const visibleDiscussions = embedded
    ? scopedDiscussions
    : filterMeetingNo === 'all'
    ? scopedDiscussions
    : scopedDiscussions.filter((d) => Number(d.meetingNo || 1) === Number(filterMeetingNo));

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
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-[#1b263b]">
          <div>
            <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-[#f59e0b] uppercase tracking-wider">
              {language === 'en'
                ? `// CONTEXTUAL DISCUSSION — MEETING ${String(effectiveMeetingNo).padStart(2, '0')}`
                : `// DISKUSI KONTEKSTUAL — PERTEMUAN ${String(effectiveMeetingNo).padStart(2, '0')}`}
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {meetingTitle || `${effectiveSubject} — Pertemuan ${effectiveMeetingNo}`}
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded border bg-sky-50 dark:bg-[#121822] border-sky-200 dark:border-[#232f42] text-sky-700 dark:text-[#00e5ff] shrink-0">
            {currentUser ? 'FIRESTORE LIVE' : 'MODE DEMO'}
          </span>
        </div>
      ) : (
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
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 rounded-xl text-xs font-mono text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* New Topic Form */}
      <div className="bg-white dark:bg-[#121822] p-5 rounded-2xl border border-slate-200 dark:border-[#232f42] shadow-xs space-y-3 text-slate-900 dark:text-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-amber-600 dark:text-[#f59e0b] font-mono">
            {language === 'en' ? '// START A NEW TOPIC' : '// MULAI TOPIK DISKUSI BARU'}
          </span>
          {!embedded && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedClassId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedClassId(nextId);
                  const nextCls = availableClasses.find((c) => c.id === nextId);
                  const firstOrder = Number(nextCls?.meetings?.[0]?.order || 1);
                  setPostMeetingNo(firstOrder);
                }}
                disabled={availableClasses.length === 0}
                aria-label={language === 'en' ? 'Select Course' : 'Pilih Mata Kuliah'}
                className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-[#18212e] text-slate-900 dark:text-slate-200 focus:outline-none focus:border-[#f59e0b] font-mono disabled:opacity-50"
              >
                {availableClasses.length === 0 ? (
                  <option value="">
                    {language === 'en' ? 'No classes available' : 'Belum ada kelas'}
                  </option>
                ) : (
                  availableClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name || cls.title} ({cls.code})
                    </option>
                  ))
                )}
              </select>
              <select
                value={postMeetingNo}
                onChange={(e) => setPostMeetingNo(Number(e.target.value))}
                disabled={availableClasses.length === 0}
                aria-label={language === 'en' ? 'Select Meeting' : 'Pilih Pertemuan'}
                className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-[#18212e] text-slate-900 dark:text-slate-200 focus:outline-none focus:border-[#f59e0b] font-mono disabled:opacity-50"
              >
                {availableMeetings.length > 0 ? (
                  availableMeetings.map((m) => (
                    <option key={m.order} value={m.order}>
                      P{m.order < 10 ? `0${m.order}` : m.order}: {m.title}
                    </option>
                  ))
                ) : (
                  <option value={1}>{language === 'en' ? 'Meeting 01' : 'Pertemuan 01'}</option>
                )}
              </select>
            </div>
          )}
        </div>

        {!embedded && classesLoaded && availableClasses.length === 0 && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f17] border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? 'No classes found in your account. Join or create a class before posting discussion topics.'
              : 'Belum ada kelas tersedia untuk forum diskusi. Buat atau ikuti kelas terlebih dahulu untuk membuat topik.'}
          </div>
        )}

        <form onSubmit={handlePostQuestion} className="space-y-3">
          <textarea
            rows="2"
            disabled={!effectiveClassId}
            placeholder={
              !effectiveClassId
                ? language === 'en'
                  ? 'Select or join a class first...'
                  : 'Buat atau pilih kelas terlebih dahulu...'
                : t('comment_placeholder')
            }
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            className="w-full text-xs sm:text-sm p-3 border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0b0f17] rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-[#f59e0b] disabled:opacity-50"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!effectiveClassId || !questionInput.trim() || posting}
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

      {/* Standalone Meeting Filter */}
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <span className="text-slate-500 dark:text-slate-400">
            {language === 'en'
              ? `Showing ${visibleDiscussions.length} discussion topics`
              : `Menampilkan ${visibleDiscussions.length} topik diskusi`}
          </span>
          <select
            value={filterMeetingNo}
            onChange={(e) => setFilterMeetingNo(e.target.value)}
            aria-label={language === 'en' ? 'Filter by Meeting' : 'Filter Pertemuan'}
            className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#121822] text-slate-900 dark:text-slate-200 focus:outline-none focus:border-[#f59e0b]"
          >
            <option value="all">{language === 'en' ? 'All Meetings' : 'Semua Pertemuan'}</option>
            {(availableMeetings.length > 0
              ? availableMeetings.map((m) => ({
                  order: Number(m.order || 1),
                  label: `P${String(Number(m.order || 1)).padStart(2, '0')}: ${m.title || ''}`.trim(),
                }))
              : Array.from(new Set(scopedDiscussions.map((d) => Number(d.meetingNo || 1))))
                  .sort((a, b) => a - b)
                  .map((num) => ({
                    order: num,
                    label: `${language === 'en' ? 'Meeting' : 'Pertemuan'} ${String(num).padStart(2, '0')}`,
                  }))
            ).map((opt) => (
              <option key={opt.order} value={String(opt.order)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Discussions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center bg-white dark:bg-[#121822] rounded-2xl border border-slate-200 dark:border-[#232f42] text-slate-500 dark:text-slate-400 text-xs font-mono">
            {language === 'en'
              ? 'Loading discussion forum from Cloud Firestore...'
              : 'Memuat forum diskusi dari Cloud Firestore...'}
          </div>
        ) : visibleDiscussions.length === 0 ? (
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
          visibleDiscussions.map((d) => {
            const canEditTopic = !currentUser || d.authorUid === currentUser.uid;
            const canDeleteTopic = !currentUser || d.authorUid === currentUser.uid || isPrivileged;
            const hasLiked = Boolean(
              currentUser && Array.isArray(d.likedBy) && d.likedBy.includes(currentUser.uid)
            );
            const isThreadVerified = Boolean(d.isVerifiedAnswer);

            return (
              <div
                key={d.id}
                className={`bg-white dark:bg-[#121822] p-5 rounded-2xl border shadow-xs space-y-3 text-slate-900 dark:text-slate-100 relative group ${
                  isThreadVerified
                    ? 'border-emerald-300 dark:border-emerald-500/50'
                    : 'border-slate-200 dark:border-[#232f42]'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <SafeImage
                      src={d.avatar}
                      alt={d.author}
                      fallbackLabel={d.author}
                      variant="avatar"
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-[#f59e0b]/40 shrink-0"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                          {d.author}
                        </h4>
                        {isThreadVerified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-500/40 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            {language === 'en' ? 'Lecturer Verified Answer' : 'Jawaban Terverifikasi Dosen'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-amber-700 dark:text-[#f59e0b] bg-amber-50 dark:bg-[#f59e0b]/10 border border-amber-200 dark:border-[#f59e0b]/30 px-2 py-0.5 rounded-md font-semibold font-mono">
                          {d.subject}
                        </span>
                        <span className="text-[10px] text-sky-700 dark:text-[#00e5ff] bg-sky-50 dark:bg-[#00e5ff]/10 border border-sky-200 dark:border-[#00e5ff]/30 px-2 py-0.5 rounded-md font-semibold font-mono">
                          {language === 'en' ? 'Meeting' : 'Pertemuan'} {String(d.meetingNo || 1).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {d.time}
                    </span>
                    {canEditTopic && (
                      <button
                        type="button"
                        onClick={() => setEditingTopic({ id: d.id, content: d.content })}
                        title={language === 'en' ? 'Edit topic' : 'Edit topik diskusi'}
                        aria-label={language === 'en' ? 'Edit topic' : 'Edit topik diskusi'}
                        className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-[#f59e0b] hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
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

                {/* Content or Edit Form */}
                {editingTopic?.id === d.id ? (
                  <form onSubmit={handleSaveTopicEdit} className="pl-11 space-y-2">
                    <textarea
                      rows="2"
                      required
                      aria-label={language === 'en' ? 'Edit topic content' : 'Ubah isi topik diskusi'}
                      value={editingTopic.content}
                      onChange={(e) =>
                        setEditingTopic((prev) => ({ ...prev, content: e.target.value }))
                      }
                      className="w-full text-xs p-2.5 bg-slate-50 dark:bg-[#0a0f18] border border-amber-400 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                    <div className="flex justify-end gap-2 font-mono">
                      <button
                        type="button"
                        onClick={() => setEditingTopic(null)}
                        className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      >
                        {language === 'en' ? 'Cancel' : 'Batal'}
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit || !editingTopic.content.trim()}
                        className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-xs font-bold px-3 py-1 rounded-md disabled:opacity-50"
                      >
                        {language === 'en' ? 'Save Topic' : 'Simpan Topik'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-11">
                    {d.content}
                  </p>
                )}

                {/* Actions */}
                <div className="pl-11 pt-1 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
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
                  {isPrivileged && (
                    <button
                      type="button"
                      onClick={() => void handleToggleVerify(d, null)}
                      className={`flex items-center gap-1.5 transition cursor-pointer ${
                        isThreadVerified && !d.verifiedReplyId
                          ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'hover:text-emerald-600 dark:hover:text-emerald-400'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>
                        {isThreadVerified && !d.verifiedReplyId
                          ? language === 'en'
                            ? 'Unverify Thread'
                            : 'Batal Verifikasi'
                          : language === 'en'
                          ? 'Mark Verified'
                          : 'Verifikasi Diskusi'}
                      </span>
                    </button>
                  )}
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
                      const canEditReply = !currentUser || r.authorUid === currentUser.uid;
                      const canDeleteReply =
                        !currentUser || r.authorUid === currentUser.uid || isPrivileged;
                      const isThisReplyVerified =
                        Boolean(d.isVerifiedAnswer) && Boolean(r.id) && d.verifiedReplyId === r.id;
                      const isEditingThisReply =
                        editingReply?.discId === d.id &&
                        (editingReply.replyId && r.id
                          ? editingReply.replyId === r.id
                          : editingReply.replyIndex === rIdx);

                      return (
                        <div
                          key={r.id || rIdx}
                          className={`p-3 rounded-xl border space-y-1 relative group/rep ${
                            isThisReplyVerified
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-500/50'
                              : 'bg-slate-50 dark:bg-[#17202d] border-slate-200 dark:border-[#232f42]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-900 dark:text-slate-200 flex items-center gap-1">
                                <CornerDownRight className="w-3 h-3 text-[#f59e0b]" />
                                {r.author}
                              </span>
                              {isThisReplyVerified && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-500/40 px-1.5 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  {language === 'en' ? 'Verified' : 'Jawaban Terverifikasi Dosen'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                {r.time}{r.editedAt ? ` (${r.editedAt})` : ''}
                              </span>
                              {isPrivileged && (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleVerify(d, r.id || `rep_${rIdx}`)}
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition cursor-pointer ${
                                    isThisReplyVerified
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white dark:bg-[#121822] text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-50'
                                  }`}
                                >
                                  {isThisReplyVerified
                                    ? language === 'en'
                                      ? 'Verified ✓'
                                      : 'Terverifikasi ✓'
                                    : language === 'en'
                                    ? 'Verify Answer'
                                    : 'Verifikasi Jawaban'}
                                </button>
                              )}
                              {canEditReply && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingReply({
                                      discId: d.id,
                                      replyId: r.id || null,
                                      replyIndex: rIdx,
                                      content: r.content,
                                    })
                                  }
                                  title={language === 'en' ? 'Edit reply' : 'Edit balasan ini'}
                                  aria-label={language === 'en' ? 'Edit reply' : 'Edit balasan ini'}
                                  className="text-slate-400 hover:text-amber-600 dark:hover:text-[#f59e0b] transition cursor-pointer p-0.5"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              {canDeleteReply && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirm({
                                      type: 'reply',
                                      disc: d,
                                      replyId: r.id || null,
                                      replyIndex: rIdx,
                                    })
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
                          {isEditingThisReply ? (
                            <form onSubmit={handleSaveReplyEdit} className="pl-4 pt-1 space-y-1.5">
                              <textarea
                                rows="2"
                                required
                                aria-label={
                                  language === 'en' ? 'Edit reply content' : 'Ubah isi balasan diskusi'
                                }
                                value={editingReply.content}
                                onChange={(e) =>
                                  setEditingReply((prev) => ({ ...prev, content: e.target.value }))
                                }
                                className="w-full text-xs p-2 bg-white dark:bg-[#0a0f18] border border-amber-400 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none"
                              />
                              <div className="flex justify-end gap-2 font-mono">
                                <button
                                  type="button"
                                  onClick={() => setEditingReply(null)}
                                  className="px-2.5 py-0.5 text-[11px] text-slate-500 dark:text-slate-400"
                                >
                                  {language === 'en' ? 'Cancel' : 'Batal'}
                                </button>
                                <button
                                  type="submit"
                                  disabled={savingEdit || !editingReply.content.trim()}
                                  className="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[11px] font-bold px-2.5 py-0.5 rounded disabled:opacity-50"
                                >
                                  {language === 'en' ? 'Save Reply' : 'Simpan Balasan'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed pl-4">
                              {r.content}
                            </p>
                          )}
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
