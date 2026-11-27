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

import handler, {
  base32Decode,
  base32Encode,
  generateTotpAtStep,
} from '../api/index.js';
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
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
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

    const rateLimitsDb = new Map();
    mockCollection.mockImplementation((name) => {
      if (name === 'exam_attempts') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
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
    mockRunTransaction.mockImplementation(async (callback) =>
      callback({
        get: vi.fn(async (ref) => {
          const existing = rateLimitsDb.get(ref.id);
          return existing ? { exists: true, data: () => existing } : { exists: false };
        }),
        set: vi.fn((ref, data) => {
          rateLimitsDb.set(ref.id, { ...(rateLimitsDb.get(ref.id) || {}), ...data });
        }),
      })
    );

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
    expect(data.remaining_quota).toBe(19);
    expect(data.response_text).toContain('Clean Architecture');
  });

  it('calculates exam score server-side on POST /api/grade using Firestore exam_keys', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_03', role: 'student' });

    const mockSetAttempt = vi.fn(async () => {});

    mockCollection.mockImplementation((name) => {
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ classId: 'subj_pbo', uid: 'student_03', status: 'approved' }),
            })),
          })),
        };
      }
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
            get: vi.fn(async () => ({ exists: false })),
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
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ classId: 'subj_pbo', uid: 'student_03', status: 'approved' }),
            })),
          })),
        };
      }
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
            return {
              get: vi.fn(async () => ({ exists: false })),
              set: mockSetAttempt,
            };
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
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'subj_pbo', lecturerId: 'lec_01' }),
            })),
          })),
        };
      }
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
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_empty_99', lecturerId: 'lec_01' }),
            })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ classId: 'cls_empty_99', uid: 'student_05', status: 'approved' }),
            })),
          })),
        };
      }
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
    const corsRateDb = new Map();
    mockCollection.mockImplementation((name) => {
      if (name === 'exam_attempts') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
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
    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async (ref) => {
          const existing = corsRateDb.get(ref.id);
          return existing ? { exists: true, data: () => existing } : { exists: false };
        }),
        set: vi.fn((ref, data) => {
          corsRateDb.set(ref.id, { ...(corsRateDb.get(ref.id) || {}), ...data });
        }),
      })
    );
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
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ classId: 'cls_grade_sec', uid: 'mhs_1', status: 'approved' }),
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

  it('enforces class ownership on POST /api/grade instructor_keys (403 FORBIDDEN_CLASS_ACCESS, 404 CLASS_NOT_FOUND)', async () => {
    const rolesByUid = {
      lec_owner: 'lecturer',
      lec_other: 'lecturer',
      adm_owner: 'admin',
    };

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn((uid) => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ role: rolesByUid[uid] || 'student' }),
            })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn((classId) => ({
            get: vi.fn(async () =>
              classId === 'cls_own'
                ? { exists: true, data: () => ({ id: 'cls_own', lecturerId: 'lec_owner' }) }
                : { exists: false }
            ),
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ pretest: { q1: 2, q2: 0 } }),
            })),
          })),
        };
      }
      return {};
    });

    // 1. Different lecturer cannot inspect another lecturer's answer keys
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_other', email: 'other@smartsa.edu' });
    const otherLecturerRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'instructor_keys',
          classId: 'cls_own',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      otherLecturerRes
    );
    expect(otherLecturerRes.statusCode).toBe(403);
    expect(otherLecturerRes.json().code).toBe('FORBIDDEN_CLASS_ACCESS');

    // 2. Missing class returns 404 CLASS_NOT_FOUND
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'owner@smartsa.edu' });
    const missingClassRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'instructor_keys',
          classId: 'cls_missing',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      missingClassRes
    );
    expect(missingClassRes.statusCode).toBe(404);
    expect(missingClassRes.json().code).toBe('CLASS_NOT_FOUND');

    // 3. Class owner receives 200 + answerKey
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'owner@smartsa.edu' });
    const ownerRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'instructor_keys',
          classId: 'cls_own',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      ownerRes
    );
    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.json().answerKey).toEqual({ q1: 2, q2: 0 });

    // 4. Admin can inspect keys regardless of lecturerId
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'adm_owner', role: 'admin' });
    const adminRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'instructor_keys',
          classId: 'cls_own',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      adminRes
    );
    expect(adminRes.statusCode).toBe(200);
    expect(adminRes.json().answerKey).toEqual({ q1: 2, q2: 0 });
  });

  it('enforces approved class_members status on POST /api/grade start and submit (403 NOT_CLASS_MEMBER)', async () => {
    const membersByDocId = {
      cls_mem_uid_pending: { exists: true, data: () => ({ classId: 'cls_mem', uid: 'uid_pending', status: 'pending' }) },
      cls_mem_uid_approved: { exists: true, data: () => ({ classId: 'cls_mem', uid: 'uid_approved', status: 'approved' }) },
      cls_mem_uid_active: { exists: true, data: () => ({ classId: 'cls_mem', uid: 'uid_active', status: 'active' }) },
      cls_mem_uid_legacy: { exists: true, data: () => ({ classId: 'cls_mem', uid: 'uid_legacy' }) },
    };
    const mockSetAttempt = vi.fn(async () => {});

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn((uid) => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ role: uid === 'adm_bypass' ? 'admin' : 'student' }),
            })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_mem', lecturerId: 'lec_01' }),
            })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn((docId) => ({
            get: vi.fn(async () => membersByDocId[docId] || { exists: false }),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ status: 'published' }) })),
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ pretest: { q1: 1, q2: 2 } }) })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: false })),
            set: mockSetAttempt,
          })),
        };
      }
      return {};
    });

    // 1. Non-member rejected on start & submit
    for (const action of ['start', 'submit']) {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_nonmember', role: 'student' });
      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/grade',
          headers: { authorization: 'Bearer valid-token' },
          body: {
            action,
            classId: 'cls_mem',
            meetingNo: 1,
            examType: 'pretest',
            answers: { q1: 1, q2: 2 },
          },
        },
        res
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_CLASS_MEMBER');
    }

    // 2. Pending member rejected on start & submit
    for (const action of ['start', 'submit']) {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_pending', role: 'student' });
      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/grade',
          headers: { authorization: 'Bearer valid-token' },
          body: {
            action,
            classId: 'cls_mem',
            meetingNo: 1,
            examType: 'pretest',
            answers: { q1: 1, q2: 2 },
          },
        },
        res
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_CLASS_MEMBER');
    }

    // 3. Approved, active, legacy (missing status), and admin callers are permitted
    for (const caller of [
      { uid: 'uid_approved', role: 'student' },
      { uid: 'uid_active', role: 'student' },
      { uid: 'uid_legacy', role: 'student' },
      { uid: 'adm_bypass', role: 'admin' },
    ]) {
      mockVerifyIdToken.mockResolvedValueOnce(caller);
      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/grade',
          headers: { authorization: 'Bearer valid-token' },
          body: {
            action: 'start',
            classId: 'cls_mem',
            meetingNo: 1,
            examType: 'pretest',
          },
        },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('in_progress');
    }
  });

  it('enforces strict idempotency on POST /api/grade start and submit without overwriting submitted attempts or resetting active timers', async () => {
    const existingStartedAt = Date.now() - 120_000;
    const existingExpiresAt = Date.now() + 1_680_000;
    let attemptDocMock = {
      status: 'in_progress',
      startedAt: existingStartedAt,
      examExpiresAt: existingExpiresAt,
      meetingNo: 1,
      examType: 'pretest',
    };
    const mockSetAttempt = vi.fn(async () => {});

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'student' }) })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_idem', lecturerId: 'lec_01' }),
            })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ classId: 'cls_idem', uid: 'mhs_idem', status: 'approved' }),
            })),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ status: 'published', durationMinutes: 30 }),
            })),
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ pretest: { q1: 1, q2: 1 } }),
            })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => attemptDocMock })),
            set: mockSetAttempt,
          })),
        };
      }
      return {};
    });

    // 1. Existing active in_progress attempt preserves startedAt & examExpiresAt
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_idem', role: 'student' });
    const resumeRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'start',
          classId: 'cls_idem',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      resumeRes
    );
    expect(resumeRes.statusCode).toBe(200);
    expect(resumeRes.json().startedAt).toBe(existingStartedAt);
    expect(resumeRes.json().examExpiresAt).toBe(existingExpiresAt);
    if (mockSetAttempt.mock.calls.length > 0) {
      expect(mockSetAttempt.mock.calls[0][0].startedAt).toBe(existingStartedAt);
      expect(mockSetAttempt.mock.calls[0][0].examExpiresAt).toBe(existingExpiresAt);
    }

    // 2. Submitted attempt blocks second start with 409 EXAM_ALREADY_SUBMITTED
    attemptDocMock = {
      status: 'submitted',
      score: 85,
      correctCount: 17,
      totalQuestions: 20,
      submittedAt: existingStartedAt + 60_000,
    };
    mockSetAttempt.mockClear();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_idem', role: 'student' });
    const restartRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'start',
          classId: 'cls_idem',
          meetingNo: 1,
          examType: 'pretest',
        },
      },
      restartRes
    );
    expect(restartRes.statusCode).toBe(409);
    expect(restartRes.json().code).toBe('EXAM_ALREADY_SUBMITTED');
    expect(restartRes.json().score).toBe(85);
    expect(mockSetAttempt).not.toHaveBeenCalled();

    // 3. Duplicate submit returns 200 idempotently with saved score and never overwrites
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_idem', role: 'student' });
    const dupSubmitRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_idem',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 0, q2: 0 },
        },
      },
      dupSubmitRes
    );
    expect(dupSubmitRes.statusCode).toBe(200);
    expect(dupSubmitRes.json().idempotent).toBe(true);
    expect(dupSubmitRes.json().score).toBe(85);
    expect(mockSetAttempt).not.toHaveBeenCalled();
  });

  it('persists studentName and studentEmail in exam_attempts during POST /api/grade start and submit', async () => {
    const writtenAttempts = [];

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({
                role: 'student',
                displayName: 'Nadia Kusuma',
                email: 'nadia@univ.ac.id',
              }),
            })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_ident', lecturerId: 'lec_01' }),
            })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ classId: 'cls_ident', uid: 'uid_nadia', status: 'approved' }),
            })),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ status: 'published', durationMinutes: 20 }),
            })),
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ meetings: { 2: { posttest: { q1: 1, q2: 0 } } } }),
            })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: false })),
            set: vi.fn(async (data) => {
              writtenAttempts.push(data);
            }),
          })),
        };
      }
      return {};
    });

    // 1. start stores studentName and studentEmail from profile/token
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_nadia',
      email: 'nadia@univ.ac.id',
      name: 'Nadia Token',
    });
    const startRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'start', classId: 'cls_ident', meetingNo: 2, examType: 'posttest' },
      },
      startRes
    );
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json()).toMatchObject({
      studentName: 'Nadia Kusuma',
      studentEmail: 'nadia@univ.ac.id',
    });
    expect(writtenAttempts[0]).toMatchObject({
      uid: 'uid_nadia',
      studentName: 'Nadia Kusuma',
      studentEmail: 'nadia@univ.ac.id',
      status: 'in_progress',
    });

    // 2. submit preserves/stores studentName and studentEmail on submitted attempt
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'uid_nadia',
      email: 'nadia@univ.ac.id',
      name: 'Nadia Token',
    });
    const submitRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_ident',
          meetingNo: 2,
          examType: 'posttest',
          answers: { q1: 1, q2: 0 },
        },
      },
      submitRes
    );
    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json()).toMatchObject({
      score: 100,
      studentName: 'Nadia Kusuma',
      studentEmail: 'nadia@univ.ac.id',
    });
    expect(writtenAttempts[1]).toMatchObject({
      uid: 'uid_nadia',
      studentName: 'Nadia Kusuma',
      studentEmail: 'nadia@univ.ac.id',
      status: 'submitted',
    });
  });

  it('enforces class ownership for archive_exam and delete_exam actions on POST /api/grade', async () => {
    const examSetMock = vi.fn(async () => {});
    const txSetMock = vi.fn();
    const txDeleteMock = vi.fn();
    let examExists = true;

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn((uid) => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ role: uid === 'lec_other' ? 'lecturer' : 'lecturer' }),
            })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ id: 'cls_arc', lecturerId: 'lec_owner' }),
            })),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn((docId) => ({
            id: docId,
            get: vi.fn(async () => ({ exists: examExists, data: () => ({ status: 'published' }) })),
            set: examSetMock,
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn((docId) => ({ id: docId })),
        };
      }
      return {};
    });

    // 1. Non-owner lecturer cannot archive or delete
    for (const action of ['archive_exam', 'delete_exam']) {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_other', email: 'other@smartsa.edu' });
      const forbiddenRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/grade',
          headers: { authorization: 'Bearer valid-token' },
          body: { action, classId: 'cls_arc', meetingNo: 1, examType: 'pretest' },
        },
        forbiddenRes
      );
      expect(forbiddenRes.statusCode).toBe(403);
      expect(forbiddenRes.json().code).toBe('FORBIDDEN_CLASS_OWNER');
    }

    // 2. Owner lecturer archives exam
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'owner@smartsa.edu' });
    const archiveRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'archive_exam', classId: 'cls_arc', meetingNo: 1, examType: 'pretest' },
      },
      archiveRes
    );
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json()).toMatchObject({ archived: true, status: 'archived' });
    expect(examSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' }),
      { merge: true }
    );

    // 3. Owner lecturer deletes exam and cleans meeting answerKey from exam_keys atomically
    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async () => ({
          exists: true,
          data: () => ({
            classId: 'cls_arc',
            meetings: {
              1: { pretest: { q1: 0 }, posttest: { q1: 1 } },
            },
          }),
        })),
        set: txSetMock,
        delete: txDeleteMock,
      })
    );
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'owner@smartsa.edu' });
    const deleteRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'delete_exam', classId: 'cls_arc', meetingNo: 1, examType: 'pretest' },
      },
      deleteRes
    );
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toMatchObject({
      deleted: true,
      examId: 'cls_arc_m1_pretest',
    });
    expect(txDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'cls_arc_m1_pretest' }));
    expect(txSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cls_arc' }),
      expect.objectContaining({
        meetings: {
          1: { posttest: { q1: 1 } },
        },
      })
    );
  });

  it('enforces persistent rate limiting, gemini-4-hydrogen live execution with context/history, and upstream error reporting on POST /api/ai', async () => {
    process.env.GEMINI_API_KEY = 'secret-gemini-key';
    const rateLimitsDb = new Map();

    mockCollection.mockImplementation((name) => {
      if (name === 'exam_attempts') {
        return {
          where: vi.fn(() => ({
            get: vi.fn(async () => ({ docs: [] })),
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
    mockRunTransaction.mockImplementation(async (callback) =>
      callback({
        get: vi.fn(async (ref) => {
          const existing = rateLimitsDb.get(ref.id);
          return existing ? { exists: true, data: () => existing } : { exists: false };
        }),
        set: vi.fn((ref, data) => {
          rateLimitsDb.set(ref.id, { ...(rateLimitsDb.get(ref.id) || {}), ...data });
        }),
      })
    );

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Penjelasan Firestore NoSQL akurat.' }] } }],
        usageMetadata: { totalTokenCount: 210 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    // 1. Overly long prompt hits 400 PROMPT_TOO_LONG without invoking Gemini or burning quota
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_ai_live', role: 'student' });
    const tooLongRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: { authorization: 'Bearer valid-token' },
        body: { prompt: 'x'.repeat(2005) },
      },
      tooLongRes
    );
    expect(tooLongRes.statusCode).toBe(400);
    expect(tooLongRes.json().code).toBe('PROMPT_TOO_LONG');
    expect(fetchMock).not.toHaveBeenCalled();

    // 2. Valid live Gemini request with context & multi-turn history uses default gemini-4-hydrogen
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_ai_live', role: 'student' });
    const liveRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          mode: 'learning',
          prompt: 'Apa beda subcollection dan dokumen?',
          context: 'Mata Kuliah: Basis Data Cloud',
          history: [
            { role: 'user', text: 'Halo AI' },
            { role: 'ai', text: 'Halo! Ada yang bisa dibantu?' },
          ],
        },
      },
      liveRes
    );
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json()).toMatchObject({
      response_text: 'Penjelasan Firestore NoSQL akurat.',
      mode: 'gemini_live',
      is_live: true,
      model: 'gemini-4-hydrogen',
      tokens_consumed: 210,
      remaining_quota: 19,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain('/models/gemini-4-hydrogen:generateContent');
    const parsedGeminiBody = JSON.parse(calledInit.body);
    expect(parsedGeminiBody.systemInstruction.parts[0].text).toContain('Basis Data Cloud');
    expect(parsedGeminiBody.contents).toHaveLength(3);
    expect(parsedGeminiBody.contents[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Halo! Ada yang bisa dibantu?' }],
    });

    // 3. GEMINI_MODEL env override & upstream 503 maps to 502 GEMINI_UPSTREAM_ERROR
    process.env.GEMINI_MODEL = 'gemini-2.5-pro';
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: { message: 'Model overloaded' } }),
    });
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_ai_live', role: 'student' });
    const upstreamErrRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: { authorization: 'Bearer valid-token' },
        body: { prompt: 'Test error upstream' },
      },
      upstreamErrRes
    );
    expect(upstreamErrRes.statusCode).toBe(502);
    expect(upstreamErrRes.json().code).toBe('GEMINI_UPSTREAM_ERROR');
    expect(upstreamErrRes.json().error).toContain('Model overloaded');
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-2.5-pro:generateContent');

    // 4. Exhausted persistent rate limit (20 requests) returns 429 RATE_LIMIT_EXCEEDED + Retry-After
    rateLimitsDb.set('ai_uid_ai_live', {
      count: 20,
      windowStartMs: Date.now() - 1000,
      resetAtMs: Date.now() + 60_000,
    });
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_ai_live', role: 'student' });
    const limitedRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/ai',
        headers: { authorization: 'Bearer valid-token' },
        body: { prompt: 'Prompt ke-21' },
      },
      limitedRes
    );
    expect(limitedRes.statusCode).toBe(429);
    expect(limitedRes.json().code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(limitedRes.headers['Retry-After'])).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('allows verified student limited category submission Cloudinary sign with locked folder while rejecting unsafe files and document/image roles', async () => {
    const { createHash } = await import('node:crypto');
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
      if (name === 'assignments') {
        return {
          doc: vi.fn((docId) => ({
            get: vi.fn(async () =>
              docId === 'asg_valid'
                ? { exists: true, data: () => ({ id: 'asg_valid', classId: 'cls_sub' }) }
                : { exists: false }
            ),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn((memberId) => ({
            get: vi.fn(async () => {
              if (memberId === 'cls_sub_uid_mhs_ok') {
                return { exists: true, data: () => ({ classId: 'cls_sub', uid: 'uid_mhs_ok', status: 'approved' }) };
              }
              if (memberId === 'cls_sub_uid_mhs_pending') {
                return { exists: true, data: () => ({ classId: 'cls_sub', uid: 'uid_mhs_pending', status: 'pending' }) };
              }
              return { exists: false };
            }),
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

    mockRunTransaction.mockImplementation(async (callback) =>
      callback({
        get: vi.fn(async (ref) => {
          const existing = rateLimitsDb.get(ref.id);
          return existing ? { exists: true, data: () => existing } : { exists: false };
        }),
        set: vi.fn((ref, data) => {
          rateLimitsDb.set(ref.id, { ...(rateLimitsDb.get(ref.id) || {}), ...data });
        }),
      })
    );

    // 1. Student remains blocked (403 FORBIDDEN_ROLE) on category 'document' & 'image'
    for (const forbiddenCat of ['document', 'image']) {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mhs_ok', role: 'student' });
      const res = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/upload-sign',
          headers: { authorization: 'Bearer valid-token' },
          body: { category: forbiddenCat },
        },
        res
      );
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('FORBIDDEN_ROLE');
    }

    // 2. Non-member or pending student gets 403 NOT_CLASS_MEMBER
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mhs_pending', role: 'student' });
    const pendingRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          category: 'submission',
          classId: 'cls_sub',
          assignmentId: 'asg_valid',
          fileName: 'tugas.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
        },
      },
      pendingRes
    );
    expect(pendingRes.statusCode).toBe(403);
    expect(pendingRes.json().code).toBe('NOT_CLASS_MEMBER');

    // 3. Disallowed extension (.exe) & oversized file (>15MB) rejected cleanly
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mhs_ok', role: 'student' });
    const badExtRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          category: 'submission',
          classId: 'cls_sub',
          assignmentId: 'asg_valid',
          fileName: 'payload.exe',
          mimeType: 'application/x-msdownload',
          fileSize: 2048,
        },
      },
      badExtRes
    );
    expect(badExtRes.statusCode).toBe(400);
    expect(badExtRes.json().code).toBe('INVALID_FILE_TYPE');

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mhs_ok', role: 'student' });
    const bigFileRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          category: 'submission',
          classId: 'cls_sub',
          assignmentId: 'asg_valid',
          fileName: 'arsip.zip',
          mimeType: 'application/zip',
          fileSize: 20 * 1024 * 1024,
        },
      },
      bigFileRes
    );
    expect(bigFileRes.statusCode).toBe(413);
    expect(bigFileRes.json().code).toBe('FILE_TOO_LARGE');

    // 4. Approved student with valid PDF receives folder-locked HMAC signature
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mhs_ok', role: 'student' });
    const okRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          category: 'submission',
          classId: 'cls_sub',
          assignmentId: 'asg_valid',
          fileName: 'laporan_akhir.pdf',
          mimeType: 'application/pdf',
          fileSize: 512_000,
        },
      },
      okRes
    );
    expect(okRes.statusCode).toBe(200);
    const signPayload = okRes.json();
    expect(signPayload.folder).toBe('smartsa/submissions/cls_sub/asg_valid/uid_mhs_ok');
    const expectedSig = createHash('sha1')
      .update(`folder=smartsa/submissions/cls_sub/asg_valid/uid_mhs_ok&timestamp=${signPayload.timestamp}cloud-secret`)
      .digest('hex');
    expect(signPayload.signature).toBe(expectedSig);

    // 5. Rate limit after 10 requests returns 429 RATE_LIMIT_EXCEEDED
    rateLimitsDb.set('upload_sign_submission_uid_mhs_ok', {
      count: 10,
      windowStartMs: Date.now() - 500,
      resetAtMs: Date.now() + 30_000,
    });
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mhs_ok', role: 'student' });
    const rateRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/upload-sign',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          category: 'submission',
          classId: 'cls_sub',
          assignmentId: 'asg_valid',
          fileName: 'laporan_akhir.pdf',
          mimeType: 'application/pdf',
          fileSize: 512_000,
        },
      },
      rateRes
    );
    expect(rateRes.statusCode).toBe(429);
    expect(rateRes.json().code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(rateRes.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('persists and returns consistent pointsPerQuestion (100 / totalQuestions) across save_exam, submit, and idempotent re-submit on POST /api/grade', async () => {
    let savedExamDoc = null;
    let savedAttemptDoc = null;
    let savedKeyDoc = null;

    mockCollection.mockImplementation((name) => {
      if (name === 'users') {
        return {
          doc: vi.fn((uid) => ({
            get: vi.fn(async () => ({
              exists: true,
              data: () => ({ role: uid === 'lec_ppq' ? 'lecturer' : 'student', displayName: 'Tester PPQ' }),
            })),
          })),
        };
      }
      if (name === 'classes') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ id: 'cls_ppq', lecturerId: 'lec_ppq' }) })),
          })),
        };
      }
      if (name === 'class_members') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: true, data: () => ({ classId: 'cls_ppq', uid: 'mhs_ppq', status: 'approved' }) })),
          })),
        };
      }
      if (name === 'exams') {
        return {
          doc: vi.fn((id) => ({
            id,
            get: vi.fn(async () => (savedExamDoc ? { exists: true, data: () => savedExamDoc } : { exists: false })),
          })),
        };
      }
      if (name === 'exam_keys') {
        return {
          doc: vi.fn((id) => ({
            id,
            get: vi.fn(async () => (savedKeyDoc ? { exists: true, data: () => savedKeyDoc } : { exists: false })),
          })),
        };
      }
      if (name === 'exam_attempts') {
        return {
          doc: vi.fn((id) => ({
            id,
            get: vi.fn(async () => (savedAttemptDoc ? { exists: true, data: () => savedAttemptDoc } : { exists: false })),
            set: vi.fn(async (data) => {
              savedAttemptDoc = { ...(savedAttemptDoc || {}), ...data };
            }),
          })),
        };
      }
      return {};
    });

    mockRunTransaction.mockImplementationOnce(async (callback) =>
      callback({
        get: vi.fn(async () => ({ exists: false })),
        set: vi.fn((ref, data) => {
          if (ref.id === 'cls_ppq_m1_pretest') savedExamDoc = data;
          if (ref.id === 'cls_ppq') savedKeyDoc = data;
        }),
      })
    );

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_ppq', email: 'dosen@smartsa.edu' });
    const saveRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'save_exam',
          classId: 'cls_ppq',
          meetingNo: 1,
          examType: 'pretest',
          questions: [
            { id: 'q1', question: 'Q1?', options: ['A', 'B', 'C', 'D', 'E'] },
            { id: 'q2', question: 'Q2?', options: ['A', 'B', 'C', 'D', 'E'] },
            { id: 'q3', question: 'Q3?', options: ['A', 'B', 'C', 'D', 'E'] },
          ],
          answerKey: { q1: 0, q2: 2, q3: 4 },
        },
      },
      saveRes
    );
    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.json()).toMatchObject({ totalQuestions: 3, pointsPerQuestion: 33.33 });
    expect(savedExamDoc.pointsPerQuestion).toBe(33.33);

    // Student submits 2 correct answers out of 3
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_ppq', role: 'student' });
    const submitRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_ppq',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 0, q2: 2, q3: 1 },
        },
      },
      submitRes
    );
    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json()).toMatchObject({
      score: 67,
      correctCount: 2,
      totalQuestions: 3,
      pointsPerQuestion: 33.33,
      status: 'submitted',
    });

    // Idempotent second submit preserves pointsPerQuestion
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'mhs_ppq', role: 'student' });
    const idemRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/grade',
        headers: { authorization: 'Bearer valid-token' },
        body: {
          action: 'submit',
          classId: 'cls_ppq',
          meetingNo: 1,
          examType: 'pretest',
          answers: { q1: 0, q2: 2, q3: 4 },
        },
      },
      idemRes
    );
    expect(idemRes.statusCode).toBe(200);
    expect(idemRes.json()).toMatchObject({
      idempotent: true,
      score: 67,
      totalQuestions: 3,
      pointsPerQuestion: 33.33,
    });
  });

  it('implements RFC 6238 TOTP MFA lifecycle (setup, confirm, bootstrap mfaRequired, verify anti-replay, one-time backup codes, disable)', async () => {
    // Verify Base32 round-trip and RFC 6238 test vector (SHA-1 secret "12345678901234567890")
    const rfcSecret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
    expect(base32Decode(rfcSecret).toString('ascii')).toBe('12345678901234567890');
    // RFC 6238 Table 1 step = 1 (59s / 30s = 1) -> 287082 (6 LSB digits of 94287082)
    expect(generateTotpAtStep(rfcSecret, 1)).toBe('287082');

    // Unauthenticated call must fail with 401
    const unauthRes = createMockRes();
    await handler(
      { method: 'POST', url: '/api/mfa', headers: {}, body: { action: 'status' } },
      unauthRes
    );
    expect(unauthRes.statusCode).toBe(401);

    const stores = {
      user_mfa: new Map(),
      users: new Map([
        [
          'uid_mfa_1',
          {
            uid: 'uid_mfa_1',
            email: 'budi@kampus.ac.id',
            role: 'student',
            accountType: 'MAHASISWA',
            isInstitutional: true,
            displayName: 'Budi MFA',
            name: 'Budi MFA',
          },
        ],
      ]),
      rate_limits: new Map(),
    };

    const makeRef = (col, id) => ({
      _col: col,
      id,
      get: vi.fn(async () => {
        const data = stores[col].get(id);
        return { exists: Boolean(data), data: () => data };
      }),
      set: vi.fn(async (data, opts) => {
        const existing = opts?.merge ? stores[col].get(id) || {} : {};
        stores[col].set(id, { ...existing, ...data });
      }),
    });

    mockCollection.mockImplementation((name) => ({
      doc: vi.fn((docId) => makeRef(name, docId)),
    }));
    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          const data = stores[ref._col]?.get(ref.id);
          return { exists: Boolean(data), data: () => data };
        }),
        set: vi.fn((ref, data, opts) => {
          const existing = opts?.merge ? stores[ref._col]?.get(ref.id) || {} : {};
          stores[ref._col].set(ref.id, { ...existing, ...data });
        }),
      };
      return callback(tx);
    });

    let mockedNow = 1_700_000_010_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => mockedNow);

    try {
      // 1. Status starts disabled
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_mfa_1',
        email: 'budi@kampus.ac.id',
        auth_time: 1000,
      });
      const statusInitRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'status' },
        },
        statusInitRes
      );
      expect(statusInitRes.statusCode).toBe(200);
      expect(statusInitRes.json()).toMatchObject({
        enabled: false,
        mfaRequired: false,
        backupCodesRemaining: 0,
      });

      // 2. Setup generates Base32 key + otpauth://totp URI into pendingSecret (still disabled)
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_mfa_1',
        email: 'budi@kampus.ac.id',
        auth_time: 1000,
      });
      const setupRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'setup' },
        },
        setupRes
      );
      expect(setupRes.statusCode).toBe(200);
      const setupBody = setupRes.json();
      expect(setupBody.manualKey).toMatch(/^[A-Z2-7]{32}$/);
      expect(setupBody.otpauthUri).toContain(`secret=${setupBody.manualKey}`);
      expect(setupBody.otpauthUri).toContain('otpauth://totp/Smartsa%20LMS');
      expect(stores.user_mfa.get('uid_mfa_1').enabled).not.toBe(true);
      expect(stores.user_mfa.get('uid_mfa_1').pendingSecret).toBe(setupBody.manualKey);

      // 3. Confirm with valid 6-digit TOTP activates MFA + creates 6 hashed backup codes + sets users.mfaEnabled
      const step0 = Math.floor(mockedNow / 1000 / 30);
      const otp0 = generateTotpAtStep(setupBody.manualKey, step0);
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_mfa_1',
        email: 'budi@kampus.ac.id',
        auth_time: 1000,
      });
      const confirmRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'confirm', code: otp0 },
        },
        confirmRes
      );
      expect(confirmRes.statusCode).toBe(200);
      const confirmBody = confirmRes.json();
      expect(confirmBody.enabled).toBe(true);
      expect(confirmBody.mfaRequired).toBe(false);
      expect(confirmBody.backupCodes).toHaveLength(6);
      expect(confirmBody.backupCodesRemaining).toBe(6);

      const mfaDocAfterConfirm = stores.user_mfa.get('uid_mfa_1');
      expect(mfaDocAfterConfirm.enabled).toBe(true);
      expect(mfaDocAfterConfirm.pendingSecret).toBeNull();
      expect(mfaDocAfterConfirm.verifiedAuthTime).toBe(1000);
      expect(mfaDocAfterConfirm.lastUsedStep).toBe(step0);
      expect(mfaDocAfterConfirm.backupCodeHashes).toHaveLength(6);
      expect(JSON.stringify(mfaDocAfterConfirm.backupCodeHashes)).not.toContain(
        confirmBody.backupCodes[0]
      );
      expect(stores.users.get('uid_mfa_1').mfaEnabled).toBe(true);

      // 4. Bootstrap in same session (auth_time: 1000) does NOT require MFA challenge
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_mfa_1',
        email: 'budi@kampus.ac.id',
        email_verified: true,
        auth_time: 1000,
      });
      const bootSameRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/bootstrap',
          headers: { authorization: 'Bearer valid-token' },
          body: {},
        },
        bootSameRes
      );
      expect(bootSameRes.statusCode).toBe(200);
      expect(bootSameRes.json()).toMatchObject({ mfaEnabled: true, mfaRequired: false });

      // 5. Bootstrap on NEW login session (auth_time: 2000) MUST require MFA challenge
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'uid_mfa_1',
        email: 'budi@kampus.ac.id',
        email_verified: true,
        auth_time: 2000,
      });
      const bootNewRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/bootstrap',
          headers: { authorization: 'Bearer valid-token' },
          body: {},
        },
        bootNewRes
      );
      expect(bootNewRes.statusCode).toBe(200);
      expect(bootNewRes.json()).toMatchObject({ mfaEnabled: true, mfaRequired: true });

      // 6. Replaying same step0 TOTP MUST be rejected (TOTP_REPLAYED)
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_1', auth_time: 2000 });
      const replayRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'verify', code: otp0 },
        },
        replayRes
      );
      expect(replayRes.statusCode).toBe(400);
      expect(replayRes.json().code).toBe('TOTP_REPLAYED');

      // 7. Advancing clock by +30s (step0 + 1) allows TOTP verification and clears mfaRequired
      mockedNow += 30_000;
      const otp1 = generateTotpAtStep(setupBody.manualKey, step0 + 1);
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_1', auth_time: 2000 });
      const verifyOkRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'verify', code: otp1 },
        },
        verifyOkRes
      );
      expect(verifyOkRes.statusCode).toBe(200);
      expect(verifyOkRes.json()).toMatchObject({
        verified: true,
        method: 'totp',
        mfaRequired: false,
      });
      expect(stores.user_mfa.get('uid_mfa_1').verifiedAuthTime).toBe(2000);

      // 8. One-time backup code works on new auth_time=3000 session and cannot be reused at auth_time=4000
      const backup0 = confirmBody.backupCodes[0];
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_1', auth_time: 3000 });
      const backupUseRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'verify', backupCode: backup0 },
        },
        backupUseRes
      );
      expect(backupUseRes.statusCode).toBe(200);
      expect(backupUseRes.json()).toMatchObject({
        verified: true,
        method: 'backup_code',
        backupCodesRemaining: 5,
        mfaRequired: false,
      });

      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_1', auth_time: 4000 });
      const backupReuseRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'verify', backupCode: backup0 },
        },
        backupReuseRes
      );
      expect(backupReuseRes.statusCode).toBe(400);
      expect(backupReuseRes.json().code).toBe('INVALID_MFA_CODE');

      // 9. Disable requires active OTP or remaining backup code, then clears MFA metadata
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_1', auth_time: 4000 });
      const disableFailRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'disable', code: '000000' },
        },
        disableFailRes
      );
      expect(disableFailRes.statusCode).toBe(400);

      mockedNow += 30_000;
      const otp2 = generateTotpAtStep(setupBody.manualKey, step0 + 2);
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_1', auth_time: 4000 });
      const disableOkRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'disable', code: otp2 },
        },
        disableOkRes
      );
      expect(disableOkRes.statusCode).toBe(200);
      expect(disableOkRes.json()).toMatchObject({
        enabled: false,
        mfaRequired: false,
        backupCodesRemaining: 0,
      });
      expect(stores.user_mfa.get('uid_mfa_1').enabled).toBe(false);
      expect(stores.user_mfa.get('uid_mfa_1').secret).toBeNull();
      expect(stores.users.get('uid_mfa_1').mfaEnabled).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('enforces 5-attempt persistent rate limit (429 RATE_LIMIT_EXCEEDED) on POST /api/mfa verification failures', async () => {
    const rateStore = new Map();
    const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
    const mfaDoc = {
      uid: 'uid_mfa_rl',
      enabled: true,
      secret,
      backupCodeHashes: [],
    };

    mockCollection.mockImplementation((name) => ({
      doc: vi.fn((docId) => ({ _col: name, id: docId })),
    }));
    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          if (ref._col === 'rate_limits') {
            const d = rateStore.get(ref.id);
            return { exists: Boolean(d), data: () => d };
          }
          if (ref._col === 'user_mfa') {
            return { exists: true, data: () => mfaDoc };
          }
          return { exists: false };
        }),
        set: vi.fn((ref, data, opts) => {
          if (ref._col === 'rate_limits') {
            const prev = opts?.merge ? rateStore.get(ref.id) || {} : {};
            rateStore.set(ref.id, { ...prev, ...data });
          }
        }),
      };
      return callback(tx);
    });

    // 5 failed attempts return 400
    for (let i = 0; i < 5; i += 1) {
      mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_rl', auth_time: 1000 });
      const failRes = createMockRes();
      await handler(
        {
          method: 'POST',
          url: '/api/mfa',
          headers: { authorization: 'Bearer valid-token' },
          body: { action: 'verify', code: '999999' },
        },
        failRes
      );
      expect(failRes.statusCode).toBe(400);
    }

    // 6th attempt (even with valid code!) MUST return 429 RATE_LIMIT_EXCEEDED
    const validOtp = generateTotpAtStep(secret, Math.floor(Date.now() / 1000 / 30));
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid_mfa_rl', auth_time: 1000 });
    const blockedRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/mfa',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'verify', code: validOtp },
      },
      blockedRes
    );
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.json().code).toBe('RATE_LIMIT_EXCEEDED');
    expect(Number(blockedRes.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('serves live server health configuration on authenticated GET /api/health and enforces GET method + Bearer auth', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    // 1. Unauthenticated GET /api/health rejected with 401
    const unauthRes = createMockRes();
    await handler(
      {
        method: 'GET',
        url: '/api/health',
        headers: { origin: 'http://localhost:5173' },
      },
      unauthRes
    );
    expect(unauthRes.statusCode).toBe(401);
    expect(unauthRes.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');

    // 2. POST /api/health rejected with 405
    const methodRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/health',
        headers: { origin: 'http://localhost:5173' },
      },
      methodRes
    );
    expect(methodRes.statusCode).toBe(405);

    // 3. Authenticated request with missing env vars reports false flags and default gemini-4-hydrogen
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'adm_health', role: 'admin' });
    const unconfiguredRes = createMockRes();
    await handler(
      {
        method: 'GET',
        url: '/api/health',
        headers: { authorization: 'Bearer valid-token', origin: 'http://localhost:5173' },
      },
      unconfiguredRes
    );
    expect(unconfiguredRes.statusCode).toBe(200);
    expect(unconfiguredRes.json()).toMatchObject({
      success: true,
      firestore: true,
      cloudinaryConfigured: false,
      geminiConfigured: false,
      geminiModel: 'gemini-4-hydrogen',
    });

    // 4. Configured Cloudinary & Gemini env vars reflect true + GEMINI_MODEL override
    process.env.CLOUDINARY_CLOUD_NAME = 'smartsa-cloud';
    process.env.CLOUDINARY_API_KEY = 'cloud-key';
    process.env.CLOUDINARY_API_SECRET = 'cloud-secret';
    process.env.GEMINI_API_KEY = 'gem-live-key';
    process.env.GEMINI_MODEL = 'gemini-4-hydrogen-custom';

    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_health', role: 'student' });
    const configuredRes = createMockRes();
    await handler(
      {
        method: 'GET',
        url: '/api/health',
        headers: { authorization: 'Bearer valid-token' },
      },
      configuredRes
    );
    expect(configuredRes.statusCode).toBe(200);
    expect(configuredRes.json()).toMatchObject({
      success: true,
      firestore: true,
      cloudinaryConfigured: true,
      geminiConfigured: true,
      geminiModel: 'gemini-4-hydrogen-custom',
    });
  });

  it('manages pending/active class_members atomically via POST /api/manage-members (approve, reject, remove, capacity & ownership)', async () => {
    const classStore = new Map([
      [
        'cls_mem',
        {
          id: 'cls_mem',
          lecturerId: 'lec_owner',
          enrolledCount: 1,
          maxStudents: 2,
        },
      ],
    ]);
    const memberStore = new Map([
      ['cls_mem_u_pend1', { uid: 'u_pend1', classId: 'cls_mem', status: 'pending' }],
      ['cls_mem_u_pend2', { uid: 'u_pend2', classId: 'cls_mem', status: 'pending' }],
      ['cls_mem_u_pend3', { uid: 'u_pend3', classId: 'cls_mem', status: 'pending' }],
      ['cls_mem_u_act1', { uid: 'u_act1', classId: 'cls_mem', status: 'approved' }],
      ['cls_mem_u_act2', { uid: 'u_act2', classId: 'cls_mem', status: 'active' }],
    ]);
    const rolesByUid = {
      student_1: 'student',
      lec_other: 'lecturer',
      lec_owner: 'lecturer',
      adm_1: 'admin',
    };

    const makeRef = (col, id) => ({
      _col: col,
      id,
      get: vi.fn(async () => {
        if (col === 'users') {
          return rolesByUid[id]
            ? { exists: true, data: () => ({ role: rolesByUid[id] }) }
            : { exists: false };
        }
        const map = col === 'classes' ? classStore : memberStore;
        const data = map.get(id);
        return { exists: Boolean(data), data: () => data };
      }),
    });

    mockCollection.mockImplementation((name) => ({
      doc: vi.fn((docId) => makeRef(name, docId)),
    }));
    mockRunTransaction.mockImplementation(async (callback) => {
      const tx = {
        get: vi.fn(async (ref) => {
          const map = ref._col === 'classes' ? classStore : memberStore;
          const data = map.get(ref.id);
          return { exists: Boolean(data), data: () => data };
        }),
        set: vi.fn((ref, data, opts) => {
          const map = ref._col === 'classes' ? classStore : memberStore;
          const prev = opts?.merge ? map.get(ref.id) || {} : {};
          map.set(ref.id, { ...prev, ...data });
        }),
        update: vi.fn((ref, data) => {
          const map = ref._col === 'classes' ? classStore : memberStore;
          const prev = map.get(ref.id) || {};
          map.set(ref.id, { ...prev, ...data });
        }),
        delete: vi.fn((ref) => {
          const map = ref._col === 'classes' ? classStore : memberStore;
          map.delete(ref.id);
        }),
      };
      return callback(tx);
    });

    // 1. Unauthenticated -> 401
    const unauthRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: {},
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend1' },
      },
      unauthRes
    );
    expect(unauthRes.statusCode).toBe(401);

    // 2. Student -> 403 FORBIDDEN_ROLE
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_1', role: 'student' });
    const stuRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend1' },
      },
      stuRes
    );
    expect(stuRes.statusCode).toBe(403);
    expect(stuRes.json().code).toBe('FORBIDDEN_ROLE');

    // 3. Non-owner lecturer -> 403 FORBIDDEN_CLASS_ACCESS
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_other', email: 'other@smartsa.edu' });
    const otherLecRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend1' },
      },
      otherLecRes
    );
    expect(otherLecRes.statusCode).toBe(403);
    expect(otherLecRes.json().code).toBe('FORBIDDEN_CLASS_ACCESS');

    // 4. Owner lecturer approves pending member -> status approved & enrolledCount 1 -> 2
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const approveRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend1' },
      },
      approveRes
    );
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json()).toMatchObject({
      success: true,
      idempotent: false,
      action: 'approve',
      status: 'approved',
      enrolledCount: 2,
    });
    expect(memberStore.get('cls_mem_u_pend1').status).toBe('approved');
    expect(classStore.get('cls_mem').enrolledCount).toBe(2);

    // 5. Idempotent second approve does not double-count
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const idempRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend1' },
      },
      idempRes
    );
    expect(idempRes.statusCode).toBe(200);
    expect(idempRes.json().idempotent).toBe(true);
    expect(classStore.get('cls_mem').enrolledCount).toBe(2);

    // 6. Capacity guard blocks approve when enrolledCount >= maxStudents (2)
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const fullRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend2' },
      },
      fullRes
    );
    expect(fullRes.statusCode).toBe(409);
    expect(fullRes.json().code).toBe('CLASS_FULL');
    expect(memberStore.get('cls_mem_u_pend2').status).toBe('pending');

    // 7. Reject pending member deletes doc without decrementing enrolledCount
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const rejectRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'reject', classId: 'cls_mem', memberUid: 'u_pend2' },
      },
      rejectRes
    );
    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.json()).toMatchObject({
      success: true,
      action: 'reject',
      deleted: true,
      enrolledCount: 2,
    });
    expect(memberStore.has('cls_mem_u_pend2')).toBe(false);
    expect(classStore.get('cls_mem').enrolledCount).toBe(2);

    // 8. Remove active approved member deletes doc and decrements enrolledCount 2 -> 1
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const removeRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'remove', classId: 'cls_mem', memberUid: 'u_act1' },
      },
      removeRes
    );
    expect(removeRes.statusCode).toBe(200);
    expect(removeRes.json()).toMatchObject({
      success: true,
      action: 'remove',
      deleted: true,
      previousStatus: 'approved',
      enrolledCount: 1,
    });
    expect(memberStore.has('cls_mem_u_act1')).toBe(false);
    expect(classStore.get('cls_mem').enrolledCount).toBe(1);

    // 9. Admin can approve now that slot reopened & removing active member when enrolledCount=0 clamps to 0
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'adm_1', role: 'admin' });
    const admApproveRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'approve', classId: 'cls_mem', memberUid: 'u_pend3' },
      },
      admApproveRes
    );
    expect(admApproveRes.statusCode).toBe(200);
    expect(admApproveRes.json().enrolledCount).toBe(2);

    classStore.get('cls_mem').enrolledCount = 0;
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'adm_1', role: 'admin' });
    const clampRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'remove', classId: 'cls_mem', memberUid: 'u_act2' },
      },
      clampRes
    );
    expect(clampRes.statusCode).toBe(200);
    expect(clampRes.json().enrolledCount).toBe(0);

    // 10. Non-existent member returns 404 MEMBER_NOT_FOUND
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'lec_owner', email: 'dosen@smartsa.edu' });
    const missingRes = createMockRes();
    await handler(
      {
        method: 'POST',
        url: '/api/manage-members',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'remove', classId: 'cls_mem', memberUid: 'u_missing' },
      },
      missingRes
    );
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.json().code).toBe('MEMBER_NOT_FOUND');
  });
});
