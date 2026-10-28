import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { seedDepartments } from '../src/seed/departments.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { StudentProfile } from '../src/models/StudentProfile.js';
import { Endorsement } from '../src/models/Endorsement.js';
import { RecordVersion } from '../src/models/RecordVersion.js';
import { ReviewRecord } from '../src/models/ReviewRecord.js';
import { Notification } from '../src/models/Notification.js';
import { MentorAssignment } from '../src/models/MentorAssignment.js';
import { subjectFor } from './helpers.js';

const app = createApp();
const PW = 'Str0ngPassw0rd!';
let deptA: any, deptB: any, hash: string;
const ids: Record<string, any> = {};

async function mk(key: string, role: 'student' | 'professor' | 'hod', dept: any, extra: any = {}) {
  const u = await User.create({ email: `${key}@nmamit.in`, fullName: key, role, status: 'active', department: dept._id, passwordHash: hash, ...extra });
  if (role === 'student') await StudentProfile.create({ user: u._id, usn: key.toUpperCase(), admissionYear: 2023, currentYear: 3, currentSemester: 5, firstYearGroup: 'I' });
  ids[key] = u; return u;
}
async function as(key: string) {
  const a = request.agent(app);
  const r = await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW });
  expect(r.status).toBe(200); return a;
}
async function seedWorld() {
  for (const c of ['users', 'studentprofiles', 'subjects', 'assessmentrecords', 'recordversions', 'reviewrecords', 'endorsements', 'notifications', 'mentorassignments', 'assessmentschemes', 'auditlogs'])
    await mongoose.connection.collection(c).deleteMany({});
  await mk('stu1', 'student', deptA); await mk('stu2', 'student', deptA);
  await mk('profA', 'professor', deptA); await mk('profA2', 'professor', deptA);
  await mk('hodA', 'hod', deptA); await mk('hodB', 'hod', deptB);
  const hod = await as('hodA');
  await hod.post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA._id) }).expect(201);
}
const subj = { semester: 5, academicYear: '2025-26', code: 'cs501', name: 'Operating Systems' };
async function newAssessment(stu: any, marks: any = { mse1: 18, task1: 3, task2: 4, task3: 2 }) {
  const s = { body: await subjectFor(stu, subj) };
  const a = await stu.put(`/api/student/subjects/${s.body._id}/assessment`).send(marks);
  return { subjectId: s.body._id, res: a };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await mongoose.connection.dropDatabase();
  await seedDepartments();
  const d = await Department.find().sort('name'); deptA = d[0]; deptB = d[1];
  hash = await argon2.hash(PW, { type: argon2.argon2id });
});
beforeEach(seedWorld);
afterAll(async () => { await mongoose.disconnect(); });

describe('assessment validation (server-side)', () => {
  it('stores marks and derives the task subtotal out of 10', async () => {
    const { res } = await newAssessment(await as('stu1'));
    expect(res.status).toBe(200); expect(res.body.taskSubtotal).toBe(9); expect(res.body.status).toBe('draft'); expect(res.body.version).toBe(1);
  });
  it('enforces TASK1<=4, TASK2<=4, TASK3<=2, and rejects negatives', async () => {
    const stu = await as('stu1');
    const s = await subjectFor(stu, subj);
    for (const bad of [{ task1: 5 }, { task2: 4.5 }, { task3: 3 }, { task1: -1 }, { mse1: -2 }, { task1: 'x' }]) {
      expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send(bad)).status).toBe(400);
    }
    expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ task1: 4, task2: 4, task3: 2 })).body.taskSubtotal).toBe(10);
  });
  it('enforces the syllabus default MSE maximum of 20, and the HOD of the department can change it', async () => {
    const stu = await as('stu1');
    const s = await subjectFor(stu, subj);
    expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ mse1: 21 })).status).toBe(400);
    expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ mse1: 20 })).status).toBe(200);
    const hod = await as('hodA');
    expect((await hod.put('/api/hod/scheme').send({ mse1Max: 25 })).status).toBe(200);
    expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ mse1: 25 })).status).toBe(200);
    expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ mse1: 26 })).status).toBe(400);
    expect((await hod.get('/api/hod/scheme')).body.mse1Max).toBe(25);
  });
  it('only the HOD changes assessment rules, and only for their own department', async () => {
    for (const who of ['profA', 'stu1']) expect((await (await as(who)).put('/api/hod/scheme').send({ mse1Max: 25 })).status).toBe(403);
    expect((await (await as('hodB')).put('/api/hod/scheme').send({ mse1Max: 30 })).status).toBe(200);
    const stu = await as('stu1'); const s = await subjectFor(stu, subj);
    expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ mse1: 21 })).status).toBe(400); // department B's change does not leak into A
  });
  it('rejects mass-assignment of status, version, student and taskSubtotal', async () => {
    const stu = await as('stu1');
    const s = await subjectFor(stu, subj);
    for (const extra of [{ status: 'hod_endorsed' }, { version: 99 }, { student: String(ids.stu2._id) }, { taskSubtotal: 10 }])
      expect((await stu.put(`/api/student/subjects/${s._id}/assessment`).send({ task1: 1, ...extra })).status).toBe(400);
  });
});

describe('cross-student access prevention', () => {
  it("student 2 cannot edit, submit or read student 1's records", async () => {
    const s1 = await as('stu1'); const s2 = await as('stu2');
    const { subjectId, res } = await newAssessment(s1);
    expect((await s2.put(`/api/student/subjects/${subjectId}/assessment`).send({ task1: 1 })).status).toBe(404);
    expect((await s2.post(`/api/student/assessments/${res.body._id}/submit`)).status).toBe(404);
    expect((await s2.get(`/api/student/assessments/${res.body._id}/history`)).status).toBe(404);
    expect((await s2.get('/api/student/subjects')).body).toHaveLength(0);
  });
  it('unauthenticated users get 401; a professor cannot use student routes', async () => {
    expect((await request(app).get('/api/student/subjects')).status).toBe(401);
    expect((await (await as('profA')).get('/api/student/subjects')).status).toBe(403);
  });
});

describe('verification and endorsement workflow', () => {
  async function submitted() {
    const stu = await as('stu1'); const { res } = await newAssessment(stu);
    await stu.post(`/api/student/assessments/${res.body._id}/submit`).expect(200);
    return { stu, id: res.body._id };
  }
  it('runs draft -> mentor verified -> HOD endorsed, recording reviews, endorsements and notifications', async () => {
    const { stu, id } = await submitted();
    const prof = await as('profA');
    expect((await prof.post(`/api/mentor/assessments/${id}/review`).send({ decision: 'verify', version: 1 })).body.status).toBe('pending_hod_endorsement');
    const hod = await as('hodA');
    expect((await hod.get('/api/hod/endorsements/pending')).body).toHaveLength(1);
    expect((await hod.post(`/api/hod/assessments/${id}/review`).send({ decision: 'endorse', version: 1 })).body.status).toBe('hod_endorsed');
    const h = (await stu.get(`/api/student/assessments/${id}/history`)).body;
    expect(h.record.status).toBe('hod_endorsed');
    expect(h.reviews.map((r: any) => r.decision)).toEqual(['verified', 'endorsed']);
    expect(h.endorsements.map((e: any) => e.level)).toEqual(['mentor', 'hod']);
    expect(h.reviews[0].reviewer).toBeUndefined(); // reviewer ids are not exposed to students
    expect(await Notification.countDocuments({ user: ids.profA._id })).toBe(1);
    expect(await Notification.countDocuments({ user: ids.stu1._id })).toBe(2);
  });
  it('HOD cannot endorse before mentor verification; mentor cannot skip to HOD level', async () => {
    const { id } = await submitted();
    expect((await (await as('hodA')).post(`/api/hod/assessments/${id}/review`).send({ decision: 'endorse', version: 1 })).status).toBe(409);
  });
  it('requesting changes needs a comment, returns the record to the student, and allows resubmission', async () => {
    const { stu, id } = await submitted(); const prof = await as('profA');
    expect((await prof.post(`/api/mentor/assessments/${id}/review`).send({ decision: 'request_changes', version: 1 })).status).toBe(400);
    expect((await prof.post(`/api/mentor/assessments/${id}/review`).send({ decision: 'request_changes', version: 1, comment: 'Please attach the marks sheet.' })).body.status).toBe('changes_requested');
    await stu.put(`/api/student/subjects/${(await stu.get('/api/student/subjects')).body[0]._id}/assessment`).send({ mse1: 19 }).expect(200);
    expect((await stu.post(`/api/student/assessments/${id}/submit`)).status).toBe(200);
  });
  it('locks the record against student edits while awaiting mentor review', async () => {
    const { stu } = await submitted();
    const sid = (await stu.get('/api/student/subjects')).body[0]._id;
    expect((await stu.put(`/api/student/subjects/${sid}/assessment`).send({ mse1: 1 })).status).toBe(409);
  });
  it('rejects a review of a stale version', async () => {
    const { id } = await submitted();
    expect((await (await as('profA')).post(`/api/mentor/assessments/${id}/review`).send({ decision: 'verify', version: 7 })).status).toBe(409);
  });
  it('editing after endorsement preserves the endorsed version, creates a new version, and resets review', async () => {
    const { stu, id } = await submitted();
    await (await as('profA')).post(`/api/mentor/assessments/${id}/review`).send({ decision: 'verify', version: 1 });
    await (await as('hodA')).post(`/api/hod/assessments/${id}/review`).send({ decision: 'endorse', version: 1 });
    const sid = (await stu.get('/api/student/subjects')).body[0]._id;
    const edited = await stu.put(`/api/student/subjects/${sid}/assessment`).send({ mse1: 19 });
    expect(edited.body.version).toBe(2); expect(edited.body.status).toBe('awaiting_mentor_review');
    const h = (await stu.get(`/api/student/assessments/${id}/history`)).body;
    expect(h.versions).toHaveLength(2);
    expect(h.versions[0].snapshot.mse1).toBe(18); expect(h.versions[0].status).toBe('draft');
    expect(h.endorsements.map((e: any) => e.version)).toEqual([1, 1]); // old endorsements remain, tied to v1
    expect(await Notification.countDocuments({ user: ids.profA._id, message: /edited an endorsed/ })).toBe(1);
  });
  it('version snapshots, reviews and endorsements are append-only', async () => {
    const { id } = await submitted();
    await (await as('profA')).post(`/api/mentor/assessments/${id}/review`).send({ decision: 'verify', version: 1 });
    await expect(RecordVersion.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(ReviewRecord.updateOne({}, { comment: 'x' })).rejects.toThrow(/append-only/);
    await expect(Endorsement.deleteOne({})).rejects.toThrow(/append-only/);
  });
});

describe('mentor and HOD scoping', () => {
  it('a professor who is not the assigned mentor cannot list, read or review the mentee', async () => {
    const stu = await as('stu1'); const { res } = await newAssessment(stu);
    await stu.post(`/api/student/assessments/${res.body._id}/submit`);
    const other = await as('profA2');
    expect((await other.get('/api/mentor/mentees')).body).toHaveLength(0);
    expect((await other.get(`/api/mentor/mentees/${ids.stu1._id}/assessments`)).status).toBe(404);
    expect((await other.post(`/api/mentor/assessments/${res.body._id}/review`).send({ decision: 'verify', version: 1 })).status).toBe(404);
  });
  it('the assigned mentor can read the mentee records', async () => {
    await newAssessment(await as('stu1'));
    const r = await (await as('profA')).get(`/api/mentor/mentees/${ids.stu1._id}/assessments`);
    expect(r.status).toBe(200); expect(r.body[0].subject.code).toBe('CS501');
  });
  it('a student cannot call mentor review; a mentor cannot call HOD review', async () => {
    const stu = await as('stu1'); const { res } = await newAssessment(stu);
    expect((await stu.post(`/api/mentor/assessments/${res.body._id}/review`).send({ decision: 'verify', version: 1 })).status).toBe(403);
    expect((await (await as('profA')).post(`/api/hod/assessments/${res.body._id}/review`).send({ decision: 'endorse', version: 1 })).status).toBe(403);
  });
  it("a HOD of another department cannot endorse or see the department's pending records", async () => {
    const stu = await as('stu1'); const { res } = await newAssessment(stu);
    await stu.post(`/api/student/assessments/${res.body._id}/submit`);
    await (await as('profA')).post(`/api/mentor/assessments/${res.body._id}/review`).send({ decision: 'verify', version: 1 });
    const other = await as('hodB');
    expect((await other.get('/api/hod/endorsements/pending')).body).toHaveLength(0);
    expect((await other.post(`/api/hod/assessments/${res.body._id}/review`).send({ decision: 'endorse', version: 1 })).status).toBe(404);
  });
  it('reassignment ends the old assignment (history kept) and revokes the old mentor access', async () => {
    const hod = await as('hodA');
    expect((await hod.post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA._id) })).status).toBe(409);
    await hod.post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA2._id) }).expect(201);
    expect(await MentorAssignment.countDocuments({ student: ids.stu1._id })).toBe(2);
    expect(await MentorAssignment.countDocuments({ student: ids.stu1._id, active: true })).toBe(1);
    expect((await (await as('profA')).get(`/api/mentor/mentees/${ids.stu1._id}/assessments`)).status).toBe(404);
    expect((await (await as('profA2')).get(`/api/mentor/mentees/${ids.stu1._id}/assessments`)).status).toBe(200);
  });
  it('a HOD cannot assign across departments', async () => {
    const hodB = await as('hodB');
    expect((await hodB.post('/api/hod/assignments').send({ student: String(ids.stu2._id), mentor: String(ids.profA._id) })).status).toBe(404);
  });
});
