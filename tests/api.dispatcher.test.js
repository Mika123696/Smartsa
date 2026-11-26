import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyIdToken = vi.fn();
const mockCollection = vi.fn();
const mockRunTransaction = vi.fn();

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(() => ({})),
  cert: vi.fn((c) => c),
  getApps: vi.fn(() => [{ name: '[DEFAULT]' }]),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    increment: vi.fn((n) => `INCREMENT_${n}`),
  },
}));

import handler from '../api/index.js';
import {
  ACCOUNT_TYPES,
  classifyAccountByEmail,
  getAccountTypeFromEmail,
  isAutoApprovedDomain,
  matchesDomainBoundary,
  parseEmailAddress,
  resolveEmailDomain,
} from '../lib/domains.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(chunk = '') {
      this.body = chunk;
    },
    json() {
      return this.body ? JSON.parse(this.body) : null;
    },
  };
  return res;
}

describe('Backend API Dispatcher (api/index.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it('returns 401 Unauthorized when Authorization Bearer token is missing', async () => {
    const req = {
      method: 'POST',
      url: '/api/ai',
      headers: {},
      body: { prompt: 'Halo AI' },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/Missing or invalid Authorization Bearer token/i);
  });

  it('returns 401 Unauthorized when Firebase ID token verification fails', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('invalid token'));
    const req = {
      method: 'POST',
      url: '/api/grade',
      headers: { authorization: 'Bearer invalid-token' },
      body: { classId: 'subj_pbo', answers: {} },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/Invalid or expired Firebase ID token/i);
  });

  it('returns 403 EXAM_LOCKOUT on POST /api/ai when exam_attempts has active exam', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_01', role: 'student' });

    mockCollection.mockImplementation((name) => {
      if (name === 'exam_attempts') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({
              docs: [
                {
                  data: () => ({
                    uid: 'student_01',
                    status: 'in_progress',
                    examActive: true,
                    examExpiresAt: Date.now() + 60_000,
                  }),
                },
              ],
            })),
          })),
        };
      }
      return {};
    });

    const req = {
      method: 'POST',
      url: '/api/ai',
      headers: { authorization: 'Bearer valid-token' },
      body: { mode: 'learning', prompt: 'Berikan jawaban nomor 1', isExamActive: false },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EXAM_LOCKOUT');
  });

  it('returns 200 OK local_frozen fallback on POST /api/ai when GEMINI_API_KEY is empty', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_02', role: 'student' });

    mockCollection.mockImplementation((name) => {
      if (name === 'exam_attempts') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
          })),
        };
      }
      return {};
    });

    const req = {
      method: 'POST',
      url: '/api/ai',
      headers: { authorization: 'Bearer valid-token' },
      body: { mode: 'learning', prompt: 'Jelaskan Clean Architecture', isExamActive: false },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.mode).toBe('local_frozen');
    expect(data.is_live).toBe(false);
    expect(data.response_text).toContain('Clean Architecture');
  });

  it('calculates exam score server-side on POST /api/grade using Firestore exam_keys', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_03', role: 'student' });

    const mockSetAttempt = vi.fn(async () => {});

    mockCollection.mockImplementation((name) => {
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({
                pretest: { q1: 1, q2: 2, q3: 1, q4: 1 },
              }),
            })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn(() => ({
            set: mockSetAttempt,
          })),
        };
      }
      return {};
    });

    const req = {
      method: 'POST',
      url: '/api/grade',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        action: 'submit',
        classId: 'subj_pbo',
        examType: 'pretest',
        answers: { q1: 1, q2: 2, q3: 1, q4: 0 }, // 3 of 4 correct => 75
      },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.score).toBe(75);
    expect(data.correctCount).toBe(3);
    expect(data.totalQuestions).toBe(4);
    expect(data.passed).toBe(true);
    expect(data.status).toBe('submitted');
    expect(data.examActive).toBe(false);
    expect(mockSetAttempt).toHaveBeenCalledTimes(1);
    expect(mockSetAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'subj_pbo_m1_pretest_student_03',
        meetingNo: 1,
        examType: 'pretest',
        score: 75,
        passed: true,
        examActive: false,
      }),
      { merge: true }
    );
  });

  it('isolates per-meeting posttest attemptId from meeting 1 pretest on POST /api/grade', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_03', role: 'student' });

    const mockDocIds = [];
    const mockSetAttempt = vi.fn(async () => {});

    mockCollection.mockImplementation((name) => {
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({
                posttest: { q1: 1, q2: 2, q3: 1, q4: 1 },
              }),
            })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn((docId) => {
            mockDocIds.push(docId);
            return { set: mockSetAttempt };
          }),
        };
      }
      return {};
    });

    const req = {
      method: 'POST',
      url: '/api/grade',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        action: 'submit',
        classId: 'subj_pbo',
        meetingNo: 2,
        examType: 'posttest',
        answers: { q1: 1, q2: 2, q3: 1, q4: 1 }, // 4/4 => 100
      },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockDocIds).toEqual(['subj_pbo_m2_posttest_student_03']);
    expect(mockSetAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'subj_pbo_m2_posttest_student_03',
        meetingNo: 2,
        examType: 'posttest',
        score: 100,
      }),
      { merge: true }
    );
  });

  it('writes deterministic class_members/{classId}_{uid} doc on POST /api/join-class', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'student_04',
      email: 'student_04@kampus.ac.id',
      email_verified: true,
      role: 'student',
    });

    const classRef = { id: 'subj_pbo' };
    const memberRef = { id: 'subj_pbo_student_04' };
    const rateRef = { id: 'join_class_student_04' };
    const txSet = vi.fn();
    const txUpdate = vi.fn();

    mockCollection.mockImplementation((name) => {
      if (name === 'classes') {
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: false,
                docs: [{ id: 'subj_pbo', ref: classRef }],
              })),
            })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn((docId) => {
            expect(docId).toBe('subj_pbo_student_04');
            return memberRef;
          }),
        };
      }
      if (name === 'rate_limits') {
        return {
          doc: vi.fn(() => rateRef),
        };
      }
      return {};
    });

    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          if (ref === classRef) {
            return {
              exists: true,
              data: () => ({
                code: 'PBO101',
                title: 'Pemrograman Berorientasi Objek',
                enrolledCount: 10,
                maxStudents: 40,
                isActive: true,
              }),
            };
          }
          return { exists: false };
        }),
        set: txSet,
        update: txUpdate,
      };
      return callback(tx);
    });

    const req = {
      method: 'POST',
      url: '/api/join-class',
      headers: { authorization: 'Bearer valid-token' },
      body: { classCode: 'pbo101' },
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.joined).toBe(true);
    expect(data.alreadyMember).toBe(false);
    expect(data.status).toBe('approved');
    expect(data.pendingApproval).toBe(false);
    expect(data.memberId).toBe('subj_pbo_student_04');
    expect(data.classId).toBe('subj_pbo');
    expect(data.classData.enrolledCount).toBe(11);

    expect(txSet).toHaveBeenCalledTimes(1);
    expect(txSet).toHaveBeenCalledWith(
      memberRef,
      expect.objectContaining({
        memberId: 'subj_pbo_student_04',
        classId: 'subj_pbo',
        uid: 'student_04',
        role: 'student',
        status: 'approved',
        autoApproved: true,
      })
    );
    expect(txUpdate).toHaveBeenCalledWith(
      classRef,
      expect.objectContaining({
        enrolledCount: 'INCREMENT_1',
      })
    );
  });

  it('denies instructor_keys for student and returns server exam_keys for verified lecturer/admin on POST /api/grade', async () => {
    // 1. Student caller must receive 403
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_09', email: 'mhs@gmail.com', role: 'student' });
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'student' }) })),
          })),
        };
      }
      return {};
    });

    const studentReq = {
      method: 'POST',
      url: '/api/grade',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'instructor_keys', classId: 'subj_pbo', examType: 'pretest' },
    };
    const studentRes = createMockRes();
    await handler(studentReq, studentRes);
    expect(studentRes.statusCode).toBe(403);
    expect(studentRes.json().code).toBe('FORBIDDEN_ROLE');

    // 2. Institutional @smartsa.edu lecturer caller must receive 200 + answerKey
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_01', email: 'dosen@smartsa.edu' });
    mockCollection.mockImplementation((name) => {
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ pretest: { q1: 1, q2: 2, q3: 1, q4: 1 } }),
            })),
          })),
        };
      }
      return {};
    });

    const lecReq = {
      method: 'POST',
      url: '/api/grade',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'instructor_keys', classId: 'subj_pbo', examType: 'pretest' },
    };
    const lecRes = createMockRes();
    await handler(lecReq, lecRes);
    expect(lecRes.statusCode).toBe(200);
    expect(lecRes.json().answerKey).toEqual({ q1: 1, q2: 2, q3: 1, q4: 1 });
  });

  it('enforces class ownership on POST /api/grade action save_exam and writes exams + exam_keys atomically', async () => {
    // 1. Student cannot call save_exam
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_01', role: 'student' });
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'student' }) })),
          })),
        };
      }
      return {};
    });

    const studentRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'save_exam',
          classId: 'cls_custom_01',
          meetingNo: 2,
          examType: 'pretest',
          questions: [{ id: 'q1', question: 'Q1?', options: ['A', 'B'] }],
          answerKey: { q1: 0 },
        },
      },
      studentRes
    );
    expect(studentRes.statusCode).toBe(403);
    expect(studentRes.json().code).toBe('FORBIDDEN_ROLE');

    // 2. Non-owner lecturer cannot save_exam for another lecturer's class
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_other', email: 'other@smartsa.edu' });
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'lecturer' }) })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_custom_01', lecturerId: 'lec_owner' }),
            })),
          })),
        };
      }
      return {};
    });

    const nonOwnerRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'save_exam',
          classId: 'cls_custom_01',
          meetingNo: 2,
          examType: 'pretest',
          questions: [{ id: 'q1', question: 'Q1?', options: ['A', 'B'] }],
          answerKey: { q1: 0 },
        },
      },
      nonOwnerRes
    );
    expect(nonOwnerRes.statusCode).toBe(403);
    expect(nonOwnerRes.json().code).toBe('FORBIDDEN_CLASS_OWNER');

    // 3. Owning lecturer saves exam atomically to exams/{id} (no keys) and exam_keys/{classId}
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'owner@smartsa.edu' });
    const examRef = { id: 'cls_custom_01_m2_pretest' };
    const keyRef = { id: 'cls_custom_01' };
    const txSet = vi.fn();

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'lecturer' }) })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_custom_01', lecturerId: 'lec_owner' }),
            })),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn((docId) => {
            expect(docId).toBe('cls_custom_01_m2_pretest');
            return examRef;
          }),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn((docId) => {
            expect(docId).toBe('cls_custom_01');
            return keyRef;
          }),
        };
      }
      return {};
    });

    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          if (ref === keyRef) {
            return {
              exists: true,
              data: () => ({
                classId: 'cls_custom_01',
                meetings: {
                  1: { pretest: { q1: 0 } },
                },
              }),
            };
          }
          return { exists: false };
        }),
        set: txSet,
      };
      return callback(tx);
    });

    const okRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'save_exam',
          classId: 'cls_custom_01',
          meetingNo: 2,
          examType: 'pretest',
          title: 'Pretest Pertemuan 2',
          questions: [
            {
              id: 'q1',
              question: 'Apa kompleksitas pencarian biner?',
              options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
              answerKey: 99,
            },
          ],
          answerKey: { q1: 1 },
        },
      },
      okRes
    );

    expect(okRes.statusCode).toBe(200);
    expect(okRes.json()).toMatchObject({
      saved: true,
      examId: 'cls_custom_01_m2_pretest',
      classId: 'cls_custom_01',
      meetingNo: 2,
      examType: 'pretest',
      questionsCount: 1,
    });

    expect(txSet).toHaveBeenCalledTimes(2);
    const [writtenExamRef, writtenExamPayload] = txSet.mock.calls[0];
    expect(writtenExamRef).toBe(examRef);
    expect(writtenExamPayload.questions).toEqual([
      {
        id: 'q1',
        question: 'Apa kompleksitas pencarian biner?',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n^2)'],
      },
    ]);
    expect(writtenExamPayload.questions[0]).not.toHaveProperty('answerKey');

    const [writtenKeyRef, writtenKeyPayload] = txSet.mock.calls[1];
    expect(writtenKeyRef).toBe(keyRef);
    expect(writtenKeyPayload.meetings).toEqual({
      1: { pretest: { q1: 0 } },
      2: { pretest: { q1: 1 } },
    });
  });

  it('returns 404 EXAM_NOT_CONFIGURED on start/submit when exam_keys for class/meeting are missing', async () => {
    mockCollection.mockImplementation((name) => {
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: false })),
          })),
        };
      }
      return {};
    });

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_05', role: 'student' });
    const startRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'start',
          classId: 'cls_empty_99',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      startRes
    );
    expect(startRes.statusCode).toBe(404);
    expect(startRes.json().code).toBe('EXAM_NOT_CONFIGURED');

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_05', role: 'student' });
    const submitRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_empty_99',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 1 },
        },
      },
      submitRes
    );
    expect(submitRes.statusCode).toBe(404);
    expect(submitRes.json().code).toBe('EXAM_NOT_CONFIGURED');

    // instructor_keys should cleanly report isConfigured: false with empty map
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_01', email: 'dosen@smartsa.edu' });
    const keysRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'instructor_keys',
          classId: 'cls_empty_99',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      keysRes
    );
    expect(keysRes.statusCode).toBe(200);
    expect(keysRes.json()).toMatchObject({
      answerKey: {},
      isConfigured: false,
    });
  });

  it('returns 400 CLASS_ID_REQUIRED when POST /api/grade is called with empty or missing classId', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_06', role: 'student' });
    const missingRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 1 },
        },
      },
      missingRes
    );
    expect(missingRes.statusCode).toBe(400);
    expect(missingRes.json().code).toBe('CLASS_ID_REQUIRED');

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_06', role: 'student' });
    const emptyRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'start',
          classId: '   ',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      emptyRes
    );
    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.json().code).toBe('CLASS_ID_REQUIRED');
  });

  it('resolves institutional domains, label boundaries, email verification states, and invalid inputs safely in lib/domains.js', () => {
    // 1. Case-insensitive + extra whitespace + valid subdomains
    expect(resolveEmailDomain('  Mhs.Baru@KAMPUS.AC.ID  ')).toMatchObject({
      valid: true,
      email: 'mhs.baru@kampus.ac.id',
      domain: 'kampus.ac.id',
      accountType: ACCOUNT_TYPES.MAHASISWA,
      role: 'student',
      autoApprove: true,
      isInstitutional: true,
    });
    expect(resolveEmailDomain('user@ft.kampus.ac.id')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.MAHASISWA,
      autoApprove: true,
    });
    expect(resolveEmailDomain('andi@Farlean.Edu')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.MAHASISWA,
      autoApprove: true,
    });

    // 2. Lecturer domain precedence (dosen.kampus.ac.id > kampus.ac.id) & Smartsa roles
    expect(resolveEmailDomain('Dosen1@DOSEN.KAMPUS.AC.ID')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.DOSEN,
      role: 'lecturer',
      autoApprove: true,
      isInstitutional: true,
    });
    expect(resolveEmailDomain('kaprodi@if.dosen.kampus.ac.id')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.DOSEN,
      role: 'lecturer',
      autoApprove: true,
    });
    expect(resolveEmailDomain('pengajar@dosen.farlean.edu')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.DOSEN,
      role: 'lecturer',
      autoApprove: true,
    });
    expect(resolveEmailDomain('dosen.andi@smartsa.edu')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.DOSEN,
      role: 'lecturer',
      autoApprove: true,
    });
    expect(resolveEmailDomain('admin@smartsa.edu')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.DOSEN,
      role: 'admin',
      autoApprove: true,
    });
    expect(resolveEmailDomain('mhs@smartsa.edu')).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.MAHASISWA,
      role: 'student',
      autoApprove: true,
    });

    // 3. Strict label boundary prevents spoofing + public domains map to UMUM
    expect(matchesDomainBoundary('evilkampus.ac.id', 'kampus.ac.id')).toBe(false);
    expect(matchesDomainBoundary('kampus.ac.id.evil.com', 'kampus.ac.id')).toBe(false);
    expect(matchesDomainBoundary('ft.kampus.ac.id', 'kampus.ac.id')).toBe(true);

    for (const externalEmail of [
      'pengguna@gmail.com',
      'spoof@evilkampus.ac.id',
      'fake@my-farlean.edu',
      'phish@kampus.ac.id.evil.com',
    ]) {
      expect(resolveEmailDomain(externalEmail)).toMatchObject({
        valid: true,
        accountType: ACCOUNT_TYPES.UMUM,
        role: 'student',
        autoApprove: false,
        isInstitutional: false,
      });
    }

    // 4. requireVerified enforces UMUM until email is verified
    expect(
      classifyAccountByEmail('budi@kampus.ac.id', { requireVerified: true, emailVerified: false })
    ).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.UMUM,
      domainAccountType: ACCOUNT_TYPES.MAHASISWA,
      autoApprove: false,
      emailVerified: false,
    });
    expect(
      classifyAccountByEmail('budi@kampus.ac.id', { requireVerified: true, emailVerified: true })
    ).toMatchObject({
      valid: true,
      accountType: ACCOUNT_TYPES.MAHASISWA,
      autoApprove: true,
      emailVerified: true,
    });

    // 5. Defensive handling for empty, invalid, and non-string inputs without throwing
    for (const invalidInput of [
      null,
      undefined,
      12345,
      {},
      '',
      '   ',
      'invalid-email',
      'user@',
      '@kampus.ac.id',
      'a@b@kampus.ac.id',
      'bad user@kampus.ac.id',
      'user@localhost',
      'user@bad..kampus.ac.id',
      'user@-bad.kampus.ac.id',
      '.dot@kampus.ac.id',
    ]) {
      expect(() => resolveEmailDomain(invalidInput)).not.toThrow();
      expect(parseEmailAddress(invalidInput).valid).toBe(false);
      expect(getAccountTypeFromEmail(invalidInput)).toBe(ACCOUNT_TYPES.UMUM);
      expect(isAutoApprovedDomain(invalidInput)).toBe(false);
    }
  });

  it('applies standardized CORS headers consistently on OPTIONS preflight, ALLOWED_ORIGINS, 2xx responses, and all error codes', async () => {
    // 1. Preflight OPTIONS from local dev origin
    const localOptionsRes = createMockRes();
    await handler(
      {
        method: 'OPTIONS',
        url: '/api/ai',
        headers: { origin: 'http://localhost:5173' },
      },
      localOptionsRes
    );
    expect(localOptionsRes.statusCode).toBe(204);
    expect(localOptionsRes.headers).toMatchObject({
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      Vary: 'Origin',
    });
    expect(mockVerifyIdToken).not.toHaveBeenCalled();

    // 2. Preflight OPTIONS from Vercel preview HTTPS origin
    const previewOptionsRes = createMockRes();
    await handler(
      {
        method: 'OPTIONS',
        url: '/api/grade',
        headers: { Origin: 'https://smartsa-git-hardening-team.vercel.app' },
      },
      previewOptionsRes
    );
    expect(previewOptionsRes.statusCode).toBe(204);
    expect(previewOptionsRes.headers['Access-Control-Allow-Origin']).toBe(
      'https://smartsa-git-hardening-team.vercel.app'
    );

    // 3. Disallowed external & spoofed origins never receive Access-Control-Allow-Origin
    process.env.ALLOWED_ORIGINS = 'https://lms.smartsa.edu, https://portal.smartsa.edu';
    for (const untrustedOrigin of [
      'https://evil.example.com',
      'https://vercel.app.evil.com',
      'http://insecure.vercel.app',
    ]) {
      const deniedOriginRes = createMockRes();
      await handler(
        {
          method: 'OPTIONS',
          url: '/api/ai',
          headers: { origin: untrustedOrigin },
        },
        deniedOriginRes
      );
      expect(deniedOriginRes.statusCode).toBe(204);
      expect(deniedOriginRes.headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(deniedOriginRes.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
      expect(deniedOriginRes.headers['Access-Control-Allow-Headers']).toBe('Authorization, Content-Type');
      expect(deniedOriginRes.headers.Vary).toBe('Origin');
    }

    // 4. Configured ALLOWED_ORIGINS works on 2xx (/api/ai frozen local fallback)
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_cors', role: 'student' });
    mockCollection.mockImplementation((name) => {
      if (name === 'exam_attempts') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
          })),
        };
      }
      return {};
    });
    const okRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: {
          origin: 'https://portal.smartsa.edu',
          authorization: 'Bearer valid-token',
        },
        body: { mode: 'learning', prompt: 'Jelaskan Firestore', isExamActive: false },
      },
      okRes
    );
    expect(okRes.statusCode).toBe(200);
    expect(okRes.headers).toMatchObject({
      'Access-Control-Allow-Origin': 'https://portal.smartsa.edu',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      Vary: 'Origin',
    });

    // 5. Consistent CORS headers on 405, 400, 401, 403, 404, and 500 error responses
    const expectedOriginHeaders = {
      'Access-Control-Allow-Origin': 'https://lms.smartsa.edu',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      Vary: 'Origin',
    };

    const methodErrRes = createMockRes();
    await handler(
      { method: 'GET', url: '/api/ai', headers: { origin: 'https://lms.smartsa.edu' } },
      methodErrRes
    );
    expect(methodErrRes.statusCode).toBe(405);
    expect(methodErrRes.headers).toMatchObject(expectedOriginHeaders);

    const urlErrRes = createMockRes();
    await handler(
      { method: 'POST', url: 'http://[::1', headers: { origin: 'https://lms.smartsa.edu' } },
      urlErrRes
    );
    expect(urlErrRes.statusCode).toBe(400);
    expect(urlErrRes.headers).toMatchObject(expectedOriginHeaders);

    const authErrRes = createMockRes();
    await handler(
      { method: 'POST', url: '/api/ai', headers: { origin: 'https://lms.smartsa.edu' }, body: {} },
      authErrRes
    );
    expect(authErrRes.statusCode).toBe(401);
    expect(authErrRes.headers).toMatchObject(expectedOriginHeaders);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_cors', role: 'student' });
    const forbiddenErrRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: { origin: 'https://lms.smartsa.edu', authorization: 'Bearer valid-token' },
        body: { prompt: 'Test', isExamActive: true },
      },
      forbiddenErrRes
    );
    expect(forbiddenErrRes.statusCode).toBe(403);
    expect(forbiddenErrRes.headers).toMatchObject(expectedOriginHeaders);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_cors', role: 'student' });
    const notFoundErrRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/nonexistent-route',
        headers: { origin: 'https://lms.smartsa.edu', authorization: 'Bearer valid-token' },
        body: {},
      },
      notFoundErrRes
    );
    expect(notFoundErrRes.statusCode).toBe(404);
    expect(notFoundErrRes.headers).toMatchObject(expectedOriginHeaders);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_cors', role: 'student' });
    const jsonParseErrRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: { origin: 'https://lms.smartsa.edu', authorization: 'Bearer valid-token' },
        body: '{invalid-json',
      },
      jsonParseErrRes
    );
    expect(jsonParseErrRes.statusCode).toBe(500);
    expect(jsonParseErrRes.headers).toMatchObject(expectedOriginHeaders);
  });

  it('provisions new users across MAHASISWA, DOSEN, UMUM, and unverified emails via POST /api/bootstrap', async () => {
    // 1. Unauthenticated caller must receive 401
    const unauthRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/bootstrap',
        headers: { origin: 'http://localhost:5173' },
        body: {},
      },
      unauthRes
    );
    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');

    const scenarios = [
      {
        label: 'verified student domain',
        token: {
          uid: 'u_mhs_1',
          email: '  Budi@KAMPUS.AC.ID ',
          email_verified: true,
          name: 'Budi Kampus',
        },
        expectedRole: 'student',
        expectedAccountType: 'MAHASISWA',
        expectedInstitutional: true,
      },
      {
        label: 'verified lecturer domain',
        token: {
          uid: 'u_dosen_1',
          email: 'Siti@DOSEN.KAMPUS.AC.ID',
          email_verified: true,
          name: 'Dr. Siti',
        },
        expectedRole: 'lecturer',
        expectedAccountType: 'DOSEN',
        expectedInstitutional: true,
      },
      {
        label: 'verified public domain',
        token: {
          uid: 'u_umum_1',
          email: 'warga@gmail.com',
          email_verified: true,
          name: 'Warga Umum',
        },
        expectedRole: 'student',
        expectedAccountType: 'UMUM',
        expectedInstitutional: false,
      },
      {
        label: 'unverified institutional email must stay UMUM',
        token: {
          uid: 'u_unverified_1',
          email: 'baru@kampus.ac.id',
          email_verified: false,
          name: 'Mahasiswa Belum Verifikasi',
        },
        expectedRole: 'student',
        expectedAccountType: 'UMUM',
        expectedInstitutional: false,
      },
    ];

    for (const s of scenarios) {
      mockVerifyIdToken.mockResolvedValueOnce(s.token);
      const userRef = { id: s.token.uid };
      const txSet = vi.fn();

      mockCollection.mockImplementation((name) => {
        if (name === 'users') {
          return {
            doc: vi.fn((docId) => {
              expect(docId).toBe(s.token.uid);
              return userRef;
            }),
          };
        }
        return {};
      });

      mockRunTransaction.mockImplementationOnce(async (callback) => {
        const tx = {
          get: vi.fn(async () => ({ exists: false })),
          set: txSet,
        };
        return callback(tx);
      });

      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/bootstrap',
          headers: { authorization: 'Bearer valid-token' },
          body: {},
        },
        res
      );

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.isNewUser).toBe(true);
      expect(data.profile).toMatchObject({
        uid: s.token.uid,
        role: s.expectedRole,
        accountType: s.expectedAccountType,
        isInstitutional: s.expectedInstitutional,
        emailVerified: Boolean(s.token.email_verified),
      });

      expect(txSet).toHaveBeenCalledWith(
        userRef,
        expect.objectContaining({
          uid: s.token.uid,
          role: s.expectedRole,
          accountType: s.expectedAccountType,
          isInstitutional: s.expectedInstitutional,
          createdAt: 'SERVER_TIMESTAMP',
          last_active: 'SERVER_TIMESTAMP',
        })
      );
    }
  });

  it('prevents role/accountType downgrade for admin/lecturer with public email and preserves custom user fields idempotently on POST /api/bootstrap', async () => {
    // 1. Existing admin with public @gmail.com email must NEVER be downgraded
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_admin_public',
      email: 'admin.pribadi@gmail.com',
      email_verified: true,
    });
    const adminRef = { id: 'uid_admin_public' };
    const adminTxSet = vi.fn();

    mockCollection.mockImplementation((name) =>
      name === 'users' ? { doc: vi.fn(() => adminRef) } : {}
    );
    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async () => ({
          exists: true,
          data: () => ({
            uid: 'uid_admin_public',
            email: 'admin.pribadi@gmail.com',
            name: 'Admin Kustom',
            displayName: 'Admin Kustom',
            photoURL: 'https://cdn.smartsa.edu/admin.png',
            role: 'admin',
            accountType: 'DOSEN',
            isInstitutional: true,
            createdAt: '2025-01-01T00:00:00.000Z',
          }),
        })),
        set: adminTxSet,
      })
    );

    const adminRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/bootstrap',
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      },
      adminRes
    );
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json().profile).toMatchObject({
      role: 'admin',
      accountType: 'DOSEN',
      isInstitutional: true,
    });

    // 2. Existing lecturer (DB role + custom claim) with public email must NEVER be downgraded,
    //    AND custom name/displayName/photoURL/createdAt are preserved while last_active updates.
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_lec_public',
      email: 'dosen.pribadi@gmail.com',
      email_verified: true,
      name: 'Token Name Should Not Overwrite',
      picture: 'https://evil-or-new.example/avatar.png',
    });
    const lecRef = { id: 'uid_lec_public' };
    const lecTxSet = vi.fn();

    mockCollection.mockImplementation((name) =>
      name === 'users' ? { doc: vi.fn(() => lecRef) } : {}
    );
    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async () => ({
          exists: true,
          data: () => ({
            uid: 'uid_lec_public',
            email: 'dosen.pribadi@gmail.com',
            name: 'Dr. Budi Kustom',
            displayName: 'Dr. Budi Kustom',
            photoURL: 'https://cdn.smartsa.edu/budi-custom.png',
            role: 'lecturer',
            accountType: 'DOSEN',
            isInstitutional: true,
            createdAt: '2025-02-15T10:00:00.000Z',
            password: 'legacy-hash-must-be-stripped',
          }),
        })),
        set: lecTxSet,
      })
    );

    const lecRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/bootstrap',
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      },
      lecRes
    );

    expect(lecRes.statusCode).toBe(200);
    const lecData = lecRes.json();
    expect(lecData.isNewUser).toBe(false);
    expect(lecData.profile).toMatchObject({
      uid: 'uid_lec_public',
      name: 'Dr. Budi Kustom',
      displayName: 'Dr. Budi Kustom',
      photoURL: 'https://cdn.smartsa.edu/budi-custom.png',
      role: 'lecturer',
      accountType: 'DOSEN',
      isInstitutional: true,
      createdAt: '2025-02-15T10:00:00.000Z',
    });
    expect(lecData.profile).not.toHaveProperty('password');

    expect(lecTxSet).toHaveBeenCalledTimes(1);
    const [writtenRef, writtenPatch, writtenOpts] = lecTxSet.mock.calls[0];
    expect(writtenRef).toBe(lecRef);
    expect(writtenOpts).toEqual({ merge: true });
    expect(writtenPatch).toMatchObject({
      role: 'lecturer',
      accountType: 'DOSEN',
      isInstitutional: true,
      emailVerified: true,
      last_active: 'SERVER_TIMESTAMP',
    });
    expect(writtenPatch).not.toHaveProperty('displayName');
    expect(writtenPatch).not.toHaveProperty('name');
    expect(writtenPatch).not.toHaveProperty('photoURL');
    expect(writtenPatch).not.toHaveProperty('createdAt');

    // 3. Previously UMUM unverified student upgrades to MAHASISWA once email_verified becomes true
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_upgrade_1',
      email: 'baru@kampus.ac.id',
      email_verified: true,
    });
    const upgRef = { id: 'uid_upgrade_1' };
    const upgTxSet = vi.fn();

    mockCollection.mockImplementation((name) =>
      name === 'users' ? { doc: vi.fn(() => upgRef) } : {}
    );
    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async () => ({
          exists: true,
          data: () => ({
            uid: 'uid_upgrade_1',
            email: 'baru@kampus.ac.id',
            name: 'Nama Pilihan Mahasiswa',
            displayName: 'Nama Pilihan Mahasiswa',
            photoURL: null,
            role: 'student',
            accountType: 'UMUM',
            isInstitutional: false,
            emailVerified: false,
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
        })),
        set: upgTxSet,
      })
    );

    const upgRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/bootstrap',
        headers: { authorization: 'Bearer valid-token' },
        body: {},
      },
      upgRes
    );

    expect(upgRes.statusCode).toBe(200);
    expect(upgRes.json().profile).toMatchObject({
      role: 'student',
      accountType: 'MAHASISWA',
      isInstitutional: true,
      emailVerified: true,
      displayName: 'Nama Pilihan Mahasiswa',
      photoURL: null,
    });
  });

  it('enforces lecturer/admin authorization and persistent 10 req/15m rate limit on POST /api/upload-sign', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'smartsa-cloud';
    process.env.CLOUDINARY_API_KEY = 'cloud-key';
    process.env.CLOUDINARY_API_SECRET = 'cloud-secret';

    const rateLimitsDb = new Map();
    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'student' }) })),
          })),
        };
      }
      if (name === 'rate_limits') {
        return {
          doc: vi.fn((docId) => ({ _col: 'rate_limits', id: docId })),
        };
      }
      return {};
    });

    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          if (ref?._col === 'rate_limits') {
            const existing = rateLimitsDb.get(ref.id);
            return existing ? { exists: true, data: () => existing } : { exists: false };
          }
          return { exists: false };
        }),
        set: vi.fn((ref, data) => {
          if (ref?._col === 'rate_limits') {
            const prev = rateLimitsDb.get(ref.id) || {};
            rateLimitsDb.set(ref.id, { ...prev, ...data });
          }
        }),
      };
      return callback(tx);
    });

    // 1. Student caller MUST be rejected with 403 FORBIDDEN_ROLE (never touches Cloudinary or rate limit)
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_mhs_upload',
      email: 'mhs@kampus.ac.id',
      role: 'student',
    });
    const mhsRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { origin: 'http://localhost:5173', authorization: 'Bearer valid-token' },
        body: { category: 'document' },
      },
      mhsRes
    );
    expect(mhsRes.statusCode).toBe(403);
    expect(mhsRes.json().code).toBe('FORBIDDEN_ROLE');
    expect(mhsRes.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');

    // 2. Lecturer caller succeeds for requests 1..10
    for (let i = 1; i <= 10; i += 1) {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_lec_upload',
        email: 'dosen@smartsa.edu',
      });
      const okRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/upload-sign',
          headers: { origin: 'http://localhost:5173', authorization: 'Bearer valid-token' },
          body: { category: 'document' },
        },
        okRes
      );
      expect(okRes.statusCode).toBe(200);
      expect(okRes.json().folder).toBe('smartsa/documents');
      expect(typeof okRes.json().signature).toBe('string');
    }

    // 3. 11th request within 15m hits 429 RATE_LIMIT_EXCEEDED + Retry-After + CORS
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_lec_upload',
      email: 'dosen@smartsa.edu',
    });
    const limitedRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { origin: 'http://localhost:5173', authorization: 'Bearer valid-token' },
        body: { category: 'document' },
      },
      limitedRes
    );
    expect(limitedRes.statusCode).toBe(429);
    expect(limitedRes.json().code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(limitedRes.headers['Retry-After'])).toBeGreaterThan(0);
    expect(limitedRes.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');

    // 4. Expired window resets cleanly and allows next request
    rateLimitsDb.set('upload_sign_uid_lec_upload', {
      count: 10,
      windowStartMs: Date.now() - 20 * 60 * 1000,
      resetAtMs: Date.now() - 1000,
    });
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_lec_upload',
      email: 'dosen@smartsa.edu',
    });
    const resetRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { authorization: 'Bearer valid-token' },
        body: { category: 'image' },
      },
      resetRes
    );
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().folder).toBe('smartsa/images');
  });

  it('enforces 6-12 uppercase alphanumeric code, 5-failure/15m rate limit, and lib/domains approval policy on POST /api/join-class', async () => {
    const rateLimitsDb = new Map();
    const classRef = { _col: 'classes', id: 'cls_pbo' };
    let classLookupEmpty = true;

    mockCollection.mockImplementation((name) => {
      if (name === 'rate_limits') {
        return {
          doc: vi.fn((docId) => ({ _col: 'rate_limits', id: docId })),
        };
      }
      if (name === 'classes') {
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () =>
                classLookupEmpty
                  ? { empty: true, docs: [] }
                  : { empty: false, docs: [{ id: 'cls_pbo', ref: classRef }] }
              ),
            })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn((docId) => ({ _col: 'class_members', id: docId })),
        };
      }
      return {};
    });

    const memberWrites = [];
    const classUpdates = [];
    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          if (ref?._col === 'rate_limits') {
            const existing = rateLimitsDb.get(ref.id);
            return existing ? { exists: true, data: () => existing } : { exists: false };
          }
          if (ref === classRef) {
            return {
              exists: true,
              data: () => ({
                code: 'SMPBO101',
                title: 'PBO Lanjut',
                enrolledCount: 5,
                maxStudents: 40,
                isActive: true,
              }),
            };
          }
          return { exists: false };
        }),
        set: vi.fn((ref, data) => {
          if (ref?._col === 'rate_limits') {
            const prev = rateLimitsDb.get(ref.id) || {};
            rateLimitsDb.set(ref.id, { ...prev, ...data });
            return;
          }
          if (ref?._col === 'class_members') {
            memberWrites.push({ id: ref.id, data });
          }
        }),
        update: vi.fn((ref, data) => {
          classUpdates.push({ ref, data });
        }),
      };
      return callback(tx);
    });

    // 1. 4 invalid format failures (<6 chars, >12 chars, non-alphanumeric, blank) + 1 not-found = 5 failures
    const badCodes = ['AB12', 'TOOLONGCODE123', 'BAD@999', ''];
    for (const badCode of badCodes) {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_brute',
        email: 'brute@kampus.ac.id',
        email_verified: true,
      });
      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/join-class',
          headers: { origin: 'http://localhost:5173', authorization: 'Bearer valid-token' },
          body: { classCode: badCode },
        },
        res
      );
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('INVALID_CLASS_CODE');
    }

    // 5th failure: valid code format but class does not exist -> 404
    classLookupEmpty = true;
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_brute',
      email: 'brute@kampus.ac.id',
      email_verified: true,
    });
    const fifthFailRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/join-class',
        headers: { origin: 'http://localhost:5173', authorization: 'Bearer valid-token' },
        body: { classCode: 'NOTFND12' },
      },
      fifthFailRes
    );
    expect(fifthFailRes.statusCode).toBe(404);
    expect(fifthFailRes.json().code).toBe('CLASS_NOT_FOUND');

    // 6th attempt (even with valid existing class) MUST return 429 RATE_LIMIT_EXCEEDED + Retry-After + CORS
    classLookupEmpty = false;
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_brute',
      email: 'brute@kampus.ac.id',
      email_verified: true,
    });
    const blockedRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/join-class',
        headers: { origin: 'http://localhost:5173', authorization: 'Bearer valid-token' },
        body: { classCode: 'SMPBO101' },
      },
      blockedRes
    );
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.json().code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(blockedRes.headers['Retry-After'])).toBeGreaterThan(0);
    expect(blockedRes.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');

    // 2. Successful join from institutional user trims/uppercases code, auto-approves, and burns 0 failure quota
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_mhs_inst',
      email: 'ani@kampus.ac.id',
      email_verified: true,
    });
    const approvedRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/join-class',
        headers: { authorization: 'Bearer valid-token' },
        body: { classCode: '  smpbo101  ' },
      },
      approvedRes
    );
    expect(approvedRes.statusCode).toBe(200);
    expect(approvedRes.json()).toMatchObject({
      joined: true,
      pendingApproval: false,
      status: 'approved',
      accountType: 'MAHASISWA',
    });
    expect(rateLimitsDb.has('join_class_uid_mhs_inst')).toBe(false);
    expect(classUpdates).toHaveLength(1);

    // 3. Public @gmail.com user gets status: 'pending', autoApproved: false, and does NOT increment enrolledCount
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_mhs_umum',
      email: 'warga@gmail.com',
      email_verified: true,
    });
    const pendingRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/join-class',
        headers: { authorization: 'Bearer valid-token' },
        body: { classCode: 'SMPBO101' },
      },
      pendingRes
    );
    expect(pendingRes.statusCode).toBe(200);
    expect(pendingRes.json()).toMatchObject({
      joined: false,
      pendingApproval: true,
      status: 'pending',
      accountType: 'UMUM',
    });
    expect(memberWrites[1].data).toMatchObject({
      status: 'pending',
      autoApproved: false,
      accountType: 'UMUM',
      isInstitutional: false,
    });
    expect(classUpdates).toHaveLength(1);
  });

  it('validates exam status (draft/archived/published) and deadline/expiresAt +60s grace tolerance on POST /api/grade', async () => {
    let examDocMock = null;
    let attemptDocMock = null;
    const savedAttempts = [];

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'lecturer' }) })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_grade_sec', lecturerId: 'lec_owner' }),
            })),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () =>
              examDocMock ? { exists: true, data: () => examDocMock } : { exists: false }
            ),
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({
                meetings: { 1: { pretest: { q1: 1, q2: 0 } } },
              }),
            })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () =>
              attemptDocMock ? { exists: true, data: () => attemptDocMock } : { exists: false }
            ),
            set: vi.fn(async (data) => {
              savedAttempts.push(data);
            }),
          })),
        };
      }
      return {};
    });

    // 1. save_exam persists default published status + custom duration & deadline
    const futureDeadlineIso = new Date(Date.now() + 3600_000).toISOString();
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const txSet = vi.fn();
    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async () => ({ exists: false })),
        set: txSet,
      })
    );
    const saveRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'save_exam',
          classId: 'cls_grade_sec',
          meetingNo: 1,
          examType: 'pretest',
          durationMinutes: 25,
          deadline: futureDeadlineIso,
          questions: [{ id: 'q1', question: 'Test?', options: ['A', 'B'] }],
          answerKey: { q1: 1 },
        },
      },
      saveRes
    );
    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.json()).toMatchObject({
      saved: true,
      status: 'published',
      durationMinutes: 25,
      deadline: futureDeadlineIso,
    });
    expect(txSet.mock.calls[0][1]).toMatchObject({
      status: 'published',
      durationMinutes: 25,
      deadline: futureDeadlineIso,
    });

    // 2. Draft exam rejects both start & submit with 403 EXAM_NOT_PUBLISHED
    examDocMock = { status: 'draft', durationMinutes: 15 };
    for (const actionName of ['start', 'submit']) {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_1', role: 'student' });
      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/grade',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: actionName, classId: 'cls_grade_sec', meetingNo: 1, examType: 'pretest' },
        },
        res
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('EXAM_NOT_PUBLISHED');
    }

    // 3. Archived exam rejects start & submit with 403 EXAM_ARCHIVED
    examDocMock = { status: 'archived', durationMinutes: 15 };
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_1', role: 'student' });
    const archivedRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'submit', classId: 'cls_grade_sec', meetingNo: 1, examType: 'pretest' },
      },
      archivedRes
    );
    expect(archivedRes.statusCode).toBe(403);
    expect(archivedRes.json().code).toBe('EXAM_ARCHIVED');

    // 4. Published exam within +60s grace tolerance (+45s past deadline) SUCCEEDS (200)
    examDocMock = { status: 'published', deadline: Date.now() - 45_000 };
    attemptDocMock = { examExpiresAt: Date.now() - 30_000 };
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_1', role: 'student' });
    const graceRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_grade_sec',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 1, q2: 0 },
        },
      },
      graceRes
    );
    expect(graceRes.statusCode).toBe(200);
    expect(graceRes.json().score).toBe(100);
    expect(savedAttempts).toHaveLength(1);

    // 5. Published exam past +60s grace tolerance (+65s past deadline) FAILS with 403 EXAM_DEADLINE_EXCEEDED
    examDocMock = { status: 'published', deadline: Date.now() - 65_000 };
    attemptDocMock = { examExpiresAt: Date.now() + 600_000 };
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_1', role: 'student' });
    const lateExamRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_grade_sec',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 1, q2: 0 },
        },
      },
      lateExamRes
    );
    expect(lateExamRes.statusCode).toBe(403);
    expect(lateExamRes.json().code).toBe('EXAM_DEADLINE_EXCEEDED');

    // 6. Attempt examExpiresAt past +60s grace tolerance also FAILS with 403 EXAM_DEADLINE_EXCEEDED
    examDocMock = { status: 'published', deadline: Date.now() + 600_000 };
    attemptDocMock = { examExpiresAt: Date.now() - 70_000 };
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_1', role: 'student' });
    const lateAttemptRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_grade_sec',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 1, q2: 0 },
        },
      },
      lateAttemptRes
    );
    expect(lateAttemptRes.statusCode).toBe(403);
    expect(lateAttemptRes.json().code).toBe('EXAM_DEADLINE_EXCEEDED');
  });
});
