import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { seedDepartments } from '../src/seed/departments.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { MentorNote } from '../src/models/MentorNote.js';
import { Endorsement } from '../src/models/Endorsement.js';

const app = createApp(); const PW = 'Str0ngPassw0rd!';
let deptA: any, deptB: any, hash: string; const ids: Record<string, any> = {};
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
async function mk(key: string, role: any, dept: any, extra: any = {}) {
  ids[key] = await User.create({ email: `${key}@nmamit.in`, fullName: key, role, status: 'active', department: dept._id, passwordHash: hash, ...extra });
}
async function as(key: string) { const a = request.agent(app); expect((await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW })).status).toBe(200); return a; }
async function world() {
  for (const c of ['users', 'mentorassignments', 'studentactivities', 'studentgoals', 'mentorrecommendations', 'mentornotes', 'adminnotes', 'studentreflections', 'mentormeetings', 'recordversions', 'reviewrecords', 'endorsements', 'notifications', 'auditlogs'])
    await mongoose.connection.collection(c).deleteMany({});
  await mk('stu1', 'student', deptA); await mk('stu2', 'student', deptA); await mk('profA', 'professor', deptA); await mk('profA2', 'professor', deptA);
  await mk('hodA', 'hod', deptA); await mk('hodB', 'hod', deptB);
  const hod = await as('hodA');
  await hod.post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA._id) }).expect(201);
}
const act = { semester: 5, category: 'hackathon', name: 'Smart India Hackathon', achievement: 'Finalist', skills: ['React'] };
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await mongoose.connection.dropDatabase(); await seedDepartments();
  const d = await Department.find().sort('name'); deptA = d[0]; deptB = d[1]; hash = await argon2.hash(PW, { type: argon2.argon2id }); });
beforeEach(world); afterAll(async () => { await mongoose.disconnect(); });

describe('activities', () => {
  it('validates category and semester; rejects mass-assignment of status', async () => {
    const s = await as('stu1');
    for (const bad of [{ category: 'nope' }, { semester: 9 }, { status: 'hod_endorsed' }, { version: 5 }, { name: '' }])
      expect((await s.post('/api/student/activities').send({ ...act, ...bad })).status).toBe(400);
    expect((await s.post('/api/student/activities').send(act)).status).toBe(201);
  });
  it('runs the full verify/endorse pipeline and keeps the endorsed version when later edited', async () => {
    const s = await as('stu1'); const a = (await s.post('/api/student/activities').send(act)).body;
    await s.post(`/api/student/activities/${a._id}/submit`).expect(200);
    expect((await (await as('profA')).post(`/api/mentor/activities/${a._id}/review`).send({ decision: 'verify', version: 1 })).body.status).toBe('pending_hod_endorsement');
    expect((await (await as('hodA')).post(`/api/hod/activities/${a._id}/review`).send({ decision: 'endorse', version: 1 })).body.status).toBe('hod_endorsed');
    const e = (await s.put(`/api/student/activities/${a._id}`).send({ ...act, achievement: 'Winner' })).body;
    expect(e.version).toBe(2); expect(e.status).toBe('awaiting_mentor_review');
    const h = (await s.get(`/api/student/activities/${a._id}/history`)).body;
    expect(h.versions[0].snapshot.achievement).toBe('Finalist'); expect(h.versions[1].snapshot.achievement).toBe('Winner');
    expect(await Endorsement.countDocuments({ recordId: a._id, version: 1 })).toBe(2);
  });
  it('blocks other students, unassigned mentors and other-department HODs', async () => {
    const s = await as('stu1'); const a = (await s.post('/api/student/activities').send(act)).body;
    await s.post(`/api/student/activities/${a._id}/submit`);
    expect((await (await as('stu2')).put(`/api/student/activities/${a._id}`).send(act)).status).toBe(404);
    expect((await (await as('profA2')).post(`/api/mentor/activities/${a._id}/review`).send({ decision: 'verify', version: 1 })).status).toBe(404);
    expect((await (await as('profA2')).get(`/api/mentor/mentees/${ids.stu1._id}/activities`)).status).toBe(404);
    await (await as('profA')).post(`/api/mentor/activities/${a._id}/review`).send({ decision: 'verify', version: 1 });
    expect((await (await as('hodB')).post(`/api/hod/activities/${a._id}/review`).send({ decision: 'endorse', version: 1 })).status).toBe(404);
  });
});

describe('goals', () => {
  it('creates, validates, tracks progress updates, and is private to the owning student', async () => {
    const s = await as('stu1');
    expect((await s.post('/api/student/goals').send({ title: 'DSA', category: 'bogus' })).status).toBe(400);
    const g = (await s.post('/api/student/goals').send({ title: 'Solve 100 DSA problems', category: 'coding_practice', priority: 'high', relatedSemester: 5 })).body;
    const u = await s.post(`/api/student/goals/${g._id}/updates`).send({ text: 'Halfway', progress: 50 });
    expect(u.body.progress).toBe(50); expect(u.body.status).toBe('in_progress');
    expect((await s.post(`/api/student/goals/${g._id}/updates`).send({ text: 'Done', progress: 100 })).body.status).toBe('completed');
    expect((await (await as('stu2')).put(`/api/student/goals/${g._id}`).send({ title: 'Hijacked title' })).status).toBe(404);
    expect((await (await as('stu2')).get('/api/student/goals')).body).toHaveLength(0);
    expect((await (await as('profA')).get(`/api/mentor/mentees/${ids.stu1._id}/goals`)).body).toHaveLength(1);
    expect((await (await as('profA2')).get(`/api/mentor/mentees/${ids.stu1._id}/goals`)).status).toBe(404);
  });
});

describe('recommendations and follow-up', () => {
  const rec = () => ({ student: String(ids.stu1._id), title: 'Practice OS numericals', reason: 'MSE1 gap', priority: 'high', deadline: day(7), followUpDate: day(3) });
  it('only the assigned mentor can create; goal must belong to the student', async () => {
    expect((await (await as('profA2')).post('/api/mentor/recommendations').send(rec())).status).toBe(404);
    expect((await (await as('stu1')).post('/api/mentor/recommendations').send(rec())).status).toBe(403);
    const otherRes = await (await as('stu2')).post('/api/student/goals').send({ title: 'Other student goal', category: 'project' });
    expect(otherRes.status).toBe(201); const other = otherRes.body;
    expect((await (await as('profA')).post('/api/mentor/recommendations').send({ ...rec(), relatedGoal: other._id })).status).toBe(400);
  });
  it('walks accept -> start -> evidence -> complete -> close with notes, feedback and notifications', async () => {
    const m = await as('profA'); const s = await as('stu1');
    const r = (await m.post('/api/mentor/recommendations').send(rec())).body;
    const act = (a: string, note?: string) => s.post(`/api/student/recommendations/${r._id}/action`).send({ action: a, note });
    expect((await act('start')).status).toBe(409);
    expect((await act('accept')).body.status).toBe('accepted');
    expect((await act('start')).body.status).toBe('in_progress');
    expect((await act('submit_evidence')).status).toBe(400);
    expect((await act('submit_evidence', 'Solved 20 numericals')).body.status).toBe('evidence_submitted');
    expect((await act('complete')).body.status).toBe('completed');
    expect((await m.post(`/api/mentor/recommendations/${r._id}/action`).send({ action: 'close' })).body.status).toBe('closed');
    expect((await act('add_note', 'late note')).status).toBe(409);
    expect((await s.get('/api/student/recommendations')).body[0].studentNotes).toHaveLength(1);
  });
  it('requires a reason to decline, and lets the mentor send it back for more work', async () => {
    const m = await as('profA'); const s = await as('stu1'); const r = (await m.post('/api/mentor/recommendations').send(rec())).body;
    expect((await s.post(`/api/student/recommendations/${r._id}/action`).send({ action: 'decline' })).status).toBe(400);
    await s.post(`/api/student/recommendations/${r._id}/action`).send({ action: 'accept' });
    await s.post(`/api/student/recommendations/${r._id}/action`).send({ action: 'start' });
    await s.post(`/api/student/recommendations/${r._id}/action`).send({ action: 'submit_evidence', note: 'done' });
    expect((await m.post(`/api/mentor/recommendations/${r._id}/action`).send({ action: 'request_further_action' })).status).toBe(400);
    expect((await m.post(`/api/mentor/recommendations/${r._id}/action`).send({ action: 'request_further_action', comment: 'Add worked solutions' })).body.status).toBe('in_progress');
  });
  it("another student cannot act on a recommendation; a non-mentor cannot act as mentor", async () => {
    const r = (await (await as('profA')).post('/api/mentor/recommendations').send(rec())).body;
    expect((await (await as('stu2')).post(`/api/student/recommendations/${r._id}/action`).send({ action: 'accept' })).status).toBe(404);
    expect((await (await as('profA2')).post(`/api/mentor/recommendations/${r._id}/action`).send({ action: 'add_feedback', comment: 'x' })).status).toBe(404);
  });
  it('flags overdue items and surfaces them on both dashboards from real data', async () => {
    const m = await as('profA'); const s = await as('stu1');
    await m.post('/api/mentor/recommendations').send({ ...rec(), title: 'Late one', deadline: day(-2) });
    await m.post('/api/mentor/recommendations').send({ ...rec(), title: 'Soon one', deadline: day(5) });
    const sd = (await s.get('/api/student/dashboard')).body;
    expect(sd.overdueRecommendations.map((r: any) => r.title)).toEqual(['Late one']);
    expect(sd.upcomingDeadlines.map((d: any) => d.title)).toEqual(['Soon one']);
    const md = (await m.get('/api/mentor/dashboard')).body;
    expect(md.mentees).toBe(1); expect(md.overdueRecommendations).toHaveLength(1); expect(md.followUpsDue.length).toBeGreaterThan(0);
  });
});

describe('notes: four types and their permissions', () => {
  async function seedNotes() {
    const m = await as('profA');
    await m.post('/api/mentor/notes').send({ student: String(ids.stu1._id), type: 'private', text: 'PRIVATE-SECRET-OBSERVATION' }).expect(201);
    await m.post('/api/mentor/notes').send({ student: String(ids.stu1._id), type: 'student_visible', text: 'Great progress this month.' }).expect(201);
    await (await as('stu1')).post('/api/student/reflections').send({ text: 'I struggled with OS.', semester: 5 }).expect(201);
    await (await as('hodA')).post(`/api/hod/admin-notes/${ids.stu1._id}`).send({ text: 'ADMIN-ONLY-REVIEW' }).expect(201);
    return m;
  }
  it('students see reflections and student-visible feedback but never private or admin notes', async () => {
    await seedNotes(); const s = await as('stu1');
    const fb = JSON.stringify((await s.get('/api/student/feedback')).body);
    expect(fb).toContain('Great progress'); expect(fb).not.toContain('PRIVATE-SECRET');
    const everything = JSON.stringify([(await s.get('/api/student/dashboard')).body, (await s.get('/api/student/reflections')).body, (await s.get('/api/student/recommendations')).body]);
    expect(everything).not.toContain('PRIVATE-SECRET'); expect(everything).not.toContain('ADMIN-ONLY');
    expect((await s.get(`/api/hod/admin-notes/${ids.stu1._id}`)).status).toBe(403);
    expect((await s.post('/api/mentor/notes').send({ student: String(ids.stu1._id), type: 'private', text: 'x' })).status).toBe(403);
  });
  it('the authoring mentor sees their private note; other mentors never do, even if later assigned', async () => {
    const m = await seedNotes();
    expect(JSON.stringify((await m.get(`/api/mentor/mentees/${ids.stu1._id}/notes`)).body)).toContain('PRIVATE-SECRET');
    await (await as('hodA')).post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA2._id) }).expect(201);
    const newMentor = await as('profA2');
    const seen = JSON.stringify((await newMentor.get(`/api/mentor/mentees/${ids.stu1._id}/notes`)).body);
    expect(seen).toContain('Great progress'); expect(seen).not.toContain('PRIVATE-SECRET');
    expect((await m.get(`/api/mentor/mentees/${ids.stu1._id}/notes`)).status).toBe(404); // former mentor loses access to the sealed note
  });
  it('HODs get student-visible feedback only; admin notes belong to the HOD of the student\'s own department', async () => {
    await seedNotes(); const hod = await as('hodA');
    const fb = JSON.stringify((await hod.get(`/api/hod/students/${ids.stu1._id}/feedback`)).body);
    expect(fb).toContain('Great progress'); expect(fb).not.toContain('PRIVATE-SECRET');
    expect((await (await as('hodB')).get(`/api/hod/admin-notes/${ids.stu1._id}`)).status).toBe(404); // another department's HOD
    expect((await (await as('profA')).get(`/api/hod/admin-notes/${ids.stu1._id}`)).status).toBe(403);
    expect(JSON.stringify((await (await as('hodA')).get(`/api/hod/admin-notes/${ids.stu1._id}`)).body)).toContain('ADMIN-ONLY');
    expect((await (await as('hodB')).get(`/api/hod/students/${ids.stu1._id}/feedback`)).status).toBe(404);
  });
  it('note text never reaches the audit log, and admin-note reads are themselves audited', async () => {
    await seedNotes(); await (await as('hodA')).get(`/api/hod/admin-notes/${ids.stu1._id}`);
    const all = JSON.stringify(await AuditLog.find().lean());
    expect(all).not.toContain('PRIVATE-SECRET'); expect(all).not.toContain('ADMIN-ONLY');
    expect(await AuditLog.countDocuments({ action: 'adminnote.read' })).toBe(1);
    expect(await MentorNote.countDocuments({ type: 'private' })).toBe(1);
  });
  it("mentors only see reflections of their own mentees", async () => {
    await seedNotes();
    expect(JSON.stringify((await (await as('profA')).get(`/api/mentor/mentees/${ids.stu1._id}/reflections`)).body)).toContain('struggled');
    expect((await (await as('profA2')).get(`/api/mentor/mentees/${ids.stu1._id}/reflections`)).status).toBe(404);
  });
});

describe('meetings', () => {
  it('schedules, completes with summary and action items; student reads only their own', async () => {
    const m = await as('profA'); const s = await as('stu1');
    expect((await (await as('profA2')).post('/api/mentor/meetings').send({ student: String(ids.stu1._id), scheduledAt: day(2) })).status).toBe(404);
    const mt = (await m.post('/api/mentor/meetings').send({ student: String(ids.stu1._id), scheduledAt: day(2), agenda: 'MSE review' })).body;
    expect((await s.get('/api/student/dashboard')).body.upcomingMeetings).toHaveLength(1);
    const done = await m.post(`/api/mentor/meetings/${mt._id}/complete`).send({ summary: 'Reviewed MSE1', actionItems: [{ text: 'Redo Q3', dueDate: day(5) }] });
    expect(done.body.status).toBe('completed'); expect(done.body.actionItems).toHaveLength(1);
    expect((await s.get('/api/student/meetings')).body).toHaveLength(1);
    expect((await (await as('stu2')).get('/api/student/meetings')).body).toHaveLength(0);
  });
});
