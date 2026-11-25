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
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'student_04', role: 'student' });

    const classRef = { id: 'subj_pbo' };
    const memberRef = { id: 'subj_pbo_student_04' };
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
          if (ref === memberRef) {
            return { exists: false };
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
    expect(data.memberId).toBe('subj_pbo_student_04');
    expect(data.classId).toBe('subj_pbo');
    expect(data.classData.enrolledCount).toBe(11);

    expect(txSet).toHaveBeenCalledWith(
      memberRef,
      expect.objectContaining({
        memberId: 'subj_pbo_student_04',
        classId: 'subj_pbo',
        uid: 'student_04',
        role: 'student',
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
});
