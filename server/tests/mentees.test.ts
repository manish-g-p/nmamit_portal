import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { ensureReferenceData } from '../src/services/curriculum.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { StudentProfile } from '../src/models/StudentProfile.js';
import { MentorAssignment } from '../src/models/MentorAssignment.js';
import { Notification } from '../src/models/Notification.js';
import { AuditLog } from '../src/models/AuditLog.js';

const app = createApp(); const PW = 'Str0ngPassw0rd!'; let deptA: any, deptB: any, hash: string; const ids: Record<string, any> = {};
async function mk(key: string, role: any, dept: any, extra: any = {}) {
  ids[key] = await User.create({ email: `${key}@nmamit.in`, fullName: key, role, status: 'active', department: dept._id, passwordHash: hash, ...extra });
  if (role === 'student') await StudentProfile.create({ user: ids[key]._id, usn: `NNM23${key.toUpperCase()}`, admissionYear: 2023, currentYear: 3, currentSemester: Number(extra.sem ?? 5), firstYearGroup: 'I', section: 'A' });
}
async function as(key: string) { const a = request.agent(app); expect((await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW })).status).toBe(200); return a; }
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await mongoose.connection.dropDatabase(); await ensureReferenceData();
  deptA = await Department.findOne({ code: 'IS' }); deptB = await Department.findOne({ code: 'CS' }); hash = await argon2.hash(PW, { type: argon2.argon2id }); });
beforeEach(async () => {
  for (const c of ['users', 'studentprofiles', 'mentorassignments', 'notifications', 'auditlogs', 'subjects', 'assessmentrecords']) await mongoose.connection.collection(c).deleteMany({});
  await mk('anita', 'student', deptA); await mk('bharat', 'student', deptA, { sem: 3 }); await mk('chitra', 'student', deptA); await mk('cs1', 'student', deptB);
  await mk('profA', 'professor', deptA); await mk('profA2', 'professor', deptA); await mk('profB', 'professor', deptB); await mk('hodA', 'hod', deptA);
});
afterAll(async () => { await mongoose.disconnect(); });

describe('faculty choose mentees from their own branch', () => {
  it('lists only unassigned students of the faculty member\'s own branch, with minimal details', async () => {
    const list = (await (await as('profA')).get('/api/mentor/available-students')).body;
    expect(list.map((s: any) => s.fullName).sort()).toEqual(['anita', 'bharat', 'chitra']); // not the CS student
    expect(Object.keys(list[0]).sort()).toEqual(['_id', 'admissionYear', 'fullName', 'section', 'semester', 'usn']); // no email, no marks, nothing else
    const b = (await (await as('profB')).get('/api/mentor/available-students')).body; expect(b.map((s: any) => s.fullName)).toEqual(['cs1']);
  });
  it('searches by name or USN and filters by semester', async () => {
    const a = await as('profA');
    expect((await a.get('/api/mentor/available-students?q=ANI')).body.map((s: any) => s.fullName)).toEqual(['anita']);
    expect((await a.get('/api/mentor/available-students?q=NNM23BHARAT')).body).toHaveLength(1);
    expect((await a.get('/api/mentor/available-students?semester=3')).body.map((s: any) => s.fullName)).toEqual(['bharat']);
  });
  it('picking a student makes them a mentee, notifies the student, and removes them from everyone else\'s list', async () => {
    const a = await as('profA'); expect((await a.post('/api/mentor/mentees').send({ student: String(ids.anita._id) })).status).toBe(201);
    expect((await a.get('/api/mentor/mentees')).body).toMatchObject([{ fullName: 'anita', usn: 'NNM23ANITA', semester: 5 }]);
    expect((await a.get('/api/mentor/available-students')).body.map((s: any) => s.fullName).sort()).toEqual(['bharat', 'chitra']);
    expect((await (await as('profA2')).get('/api/mentor/available-students')).body.map((s: any) => s.fullName)).not.toContain('anita');
    expect(await Notification.countDocuments({ user: ids.anita._id, message: /is now your mentor/ })).toBe(1); expect(await AuditLog.countDocuments({ action: 'assignment.self_select' })).toBe(1);
  });
  it('a student who already has a mentor cannot be taken by another faculty member', async () => {
    await (await as('profA')).post('/api/mentor/mentees').send({ student: String(ids.anita._id) });
    expect((await (await as('profA2')).post('/api/mentor/mentees').send({ student: String(ids.anita._id) })).status).toBe(409);
    expect(await MentorAssignment.countDocuments({ student: ids.anita._id, active: true })).toBe(1);
  });
  it('faculty can never pick a student from another branch (they simply cannot be found)', async () => {
    const r = await (await as('profA')).post('/api/mentor/mentees').send({ student: String(ids.cs1._id) }); expect(r.status).toBe(404);
    expect(await MentorAssignment.countDocuments()).toBe(0);
    expect((await (await as('profB')).post('/api/mentor/mentees').send({ student: String(ids.anita._id) })).status).toBe(404);
  });
  it('picking gives access to that student\'s records; before picking there is none', async () => {
    const a = await as('profA'); expect((await a.get(`/api/mentor/mentees/${ids.anita._id}/assessments`)).status).toBe(404);
    await a.post('/api/mentor/mentees').send({ student: String(ids.anita._id) }); expect((await a.get(`/api/mentor/mentees/${ids.anita._id}/assessments`)).status).toBe(200);
    expect((await (await as('profA2')).get(`/api/mentor/mentees/${ids.anita._id}/assessments`)).status).toBe(404);
  });
  it('a mentor can release a mentee; the student becomes available again, history is kept, access ends', async () => {
    const a = await as('profA'); await a.post('/api/mentor/mentees').send({ student: String(ids.anita._id) });
    expect((await (await as('profA2')).delete(`/api/mentor/mentees/${ids.anita._id}`)).status).toBe(404); // someone else's mentee
    expect((await a.delete(`/api/mentor/mentees/${ids.anita._id}`)).status).toBe(200);
    expect((await a.get(`/api/mentor/mentees/${ids.anita._id}/assessments`)).status).toBe(404);
    expect(await MentorAssignment.countDocuments({ student: ids.anita._id })).toBe(1); expect(await MentorAssignment.countDocuments({ student: ids.anita._id, active: true })).toBe(0);
    expect((await (await as('profA2')).post('/api/mentor/mentees').send({ student: String(ids.anita._id) })).status).toBe(201);
  });
  it('students, HODs and unapproved faculty cannot use mentee selection; the HOD can still reassign', async () => {
    expect((await (await as('anita')).get('/api/mentor/available-students')).status).toBe(403);
    expect((await (await as('hodA')).post('/api/mentor/mentees').send({ student: String(ids.anita._id) })).status).toBe(403);
    await User.create({ email: 'pending@nmamit.in', fullName: 'pending', role: 'professor', status: 'awaiting_approval', department: deptA._id, passwordHash: hash });
    expect((await request(app).post('/api/auth/login').send({ email: 'pending@nmamit.in', password: PW })).status).toBe(403);
    await (await as('profA')).post('/api/mentor/mentees').send({ student: String(ids.anita._id) });
    expect((await (await as('hodA')).post('/api/hod/assignments').send({ student: String(ids.anita._id), mentor: String(ids.profA2._id) })).status).toBe(201);
    expect((await (await as('profA')).get(`/api/mentor/mentees/${ids.anita._id}/assessments`)).status).toBe(404);
  });
  it('rejects malformed requests', async () => {
    const a = await as('profA');
    for (const body of [{}, { student: 'nope' }, { student: String(ids.anita._id), extra: 1 }]) expect((await a.post('/api/mentor/mentees').send(body)).status).toBe(400);
  });
});
