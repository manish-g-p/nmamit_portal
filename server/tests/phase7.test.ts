import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.js';
import { seedDepartments } from '../src/seed/departments.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { StudentProfile } from '../src/models/StudentProfile.js';
import { FacultyProfile } from '../src/models/FacultyProfile.js';
import { MentorAssignment } from '../src/models/MentorAssignment.js';
import { subjectFor } from './helpers.js';

const app = createApp(); const PW = 'Str0ngPassw0rd!'; let deptA: any, deptB: any, hash: string; const ids: Record<string, any> = {};
async function mk(key: string, role: any, dept: any, extra: any = {}) {
  ids[key] = await User.create({ email: `${key}@nmamit.in`, fullName: key, role, status: 'active', department: dept._id, passwordHash: hash, ...extra });
  if (role === 'student') await StudentProfile.create({ user: ids[key]._id, usn: key.toUpperCase(), admissionYear: 2023, currentYear: 3, currentSemester: 5, firstYearGroup: 'I' });
}
async function as(key: string) { const a = request.agent(app); expect((await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW })).status).toBe(200); return a; }
async function world() {
  for (const c of ['users', 'studentprofiles', 'facultyprofiles', 'mentorassignments', 'subjects', 'assessmentrecords', 'studentactivities', 'mentornotes', 'recordversions', 'reviewrecords', 'endorsements', 'notifications', 'mentorrecommendations', 'auditlogs'])
    await mongoose.connection.collection(c).deleteMany({});
  await Department.updateMany({}, { $set: { active: true } });
  await mk('stu1', 'student', deptA); await mk('stu2', 'student', deptA); await mk('stu3', 'student', deptA); await mk('profA', 'professor', deptA); await mk('profA2', 'professor', deptA);
  await mk('hodA', 'hod', deptA); await mk('hodB', 'hod', deptB);
}
const csv = (s: string) => Buffer.from(s);
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await mongoose.connection.dropDatabase(); await seedDepartments();
  const d = await Department.find().sort('name'); deptA = d[0]; deptB = d[1]; hash = await argon2.hash(PW, { type: argon2.argon2id }); });
beforeEach(world); afterAll(async () => { await mongoose.disconnect(); });

describe('faculty directory', () => {
  it('adds, updates, blocks duplicates (case/space-insensitive), and never stores an email or creates an account', async () => {
    const h = await as('hodA'); const before = await User.countDocuments();
    const f = (await h.post('/api/hod/faculty').send({ fullName: 'Dr. Test Faculty', designation: 'Professor', sourceUrl: 'https://nitte.edu.in/nmamit/', lastChecked: '2026-10-18' })).body;
    expect(f.importStatus).toBe('approved'); expect(f.email).toBeUndefined();
    expect((await h.post('/api/hod/faculty').send({ fullName: '  dr.  TEST faculty ' })).status).toBe(409);
    expect((await h.put(`/api/hod/faculty/${f._id}`).send({ designation: 'Dean' })).body.designation).toBe('Dean');
    expect((await h.post('/api/hod/faculty').send({ fullName: 'X', email: 'a@b.c' })).status).toBe(400);
    expect(await User.countDocuments()).toBe(before);
  });
  it('CSV import lands rows as pending_review, skips duplicates, reports invalid rows, and rejects non-HODs', async () => {
    const h = await as('hodA');
    const file = 'full_name,designation,profile_url,source_url,last_checked\nDr. A One,Professor,,https://nitte.edu.in/x,2026-10-18\nDr. A One,Professor,,,\nDr. B Two,Associate Professor,not-a-url,,\n,Lecturer,,,\n';
    const r = await h.post('/api/hod/faculty/import').attach('file', csv(file), 'f.csv');
    expect(r.status).toBe(201); expect(r.body.created).toBe(1); expect(r.body.skippedDuplicates).toBe(1); expect(r.body.invalid.map((i: any) => i.row)).toEqual([4, 5]);
    expect((await FacultyProfile.findOne({ fullName: 'Dr. A One' }))!.importStatus).toBe('pending_review');
    expect((await (await as('profA')).post('/api/hod/faculty/import').attach('file', csv(file), 'f.csv')).status).toBe(403);
    expect((await h.post('/api/hod/faculty/import').attach('file', Buffer.from('a'.repeat(3 * 1024 * 1024)), 'big.csv')).status).toBe(413);
  });
  it('review flow: approve, then map to a verified professor account in the same department only', async () => {
    const h = await as('hodA');
    await h.post('/api/hod/faculty/import').attach('file', csv('full_name\nDr. Map Me\n'), 'f.csv');
    const f = await FacultyProfile.findOne({ fullName: 'Dr. Map Me' });
    expect((await h.post(`/api/hod/faculty/${f!._id}/map-user`).send({ userId: String(ids.profA._id) })).status).toBe(409); // not approved yet
    expect((await h.post(`/api/hod/faculty/${f!._id}/approve`)).body.importStatus).toBe('approved');
    expect((await h.post(`/api/hod/faculty/${f!._id}/map-user`).send({ userId: String(ids.stu1._id) })).status).toBe(404); // not a professor
    expect((await h.post(`/api/hod/faculty/${f!._id}/map-user`).send({ userId: String(ids.profA._id) })).status).toBe(200);
    expect((await h.post('/api/hod/faculty').send({ fullName: 'Dr. Second' })).status).toBe(201);
    const g = await FacultyProfile.findOne({ fullName: 'Dr. Second' });
    expect((await h.post(`/api/hod/faculty/${g!._id}/map-user`).send({ userId: String(ids.profA._id) })).status).toBe(409); // one account, one entry
    expect((await h.post(`/api/hod/faculty/${f!._id}/deactivate`)).body.importStatus).toBe('inactive');
  });
  it("another department's HOD cannot see or change the entries", async () => {
    const f = (await (await as('hodA')).post('/api/hod/faculty').send({ fullName: 'Dr. Private Dept' })).body; const b = await as('hodB');
    expect((await b.get('/api/hod/faculty')).body.items).toHaveLength(0);
    expect((await b.put(`/api/hod/faculty/${f._id}`).send({ designation: 'x' })).status).toBe(404);
    expect((await b.post(`/api/hod/faculty/${f._id}/approve`)).status).toBe(404);
  });
});

describe('people lists', () => {
  it('HODs list only their own department, and nobody else can', async () => {
    await (await as('hodA')).post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA._id) });
    const h = await as('hodA');
    expect((await h.get('/api/hod/professors')).body.map((p: any) => p.email).sort()).toEqual(['profa2@nmamit.in', 'profa@nmamit.in']);
    const st = (await h.get('/api/hod/students')).body; expect(st).toHaveLength(3); expect(st.find((x: any) => x.email === 'stu1@nmamit.in').mentor).toBe(String(ids.profA._id));
    expect((await (await as('hodB')).get('/api/hod/students')).body).toHaveLength(0);
    expect((await (await as('profA')).get('/api/hod/students')).status).toBe(403);
  });
});

describe('bulk mentor assignment', () => {
  it('assigns valid rows, reports bad ones, and respects department scope', async () => {
    const h = await as('hodA');
    const r = await h.post('/api/hod/assignments/bulk').attach('file', csv('student_email,mentor_email\nstu1@nmamit.in,profA@nmamit.in\nstu2@nmamit.in,profA@nmamit.in\nnobody@nmamit.in,profA@nmamit.in\n'), 'a.csv');
    expect(r.body.assigned).toBe(2); expect(r.body.failed).toHaveLength(1); expect(r.body.failed[0].row).toBe(4);
    expect((await h.get('/api/hod/students/unassigned')).body.map((s: any) => s.email)).toEqual(['stu3@nmamit.in']);
    const again = await h.post('/api/hod/assignments/bulk').attach('file', csv('student_email,mentor_email\nstu1@nmamit.in,profA2@nmamit.in\n'), 'a.csv');
    expect(again.body.assigned).toBe(1); expect(await MentorAssignment.countDocuments({ student: ids.stu1._id })).toBe(2);
    expect((await (await as('hodB')).post('/api/hod/assignments/bulk').attach('file', csv('student_email,mentor_email\nstu3@nmamit.in,profA@nmamit.in\n'), 'a.csv')).body.assigned).toBe(0);
  });
});

async function seedData() {
  await (await as('hodA')).post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA._id) });
  const s = await as('stu1');
  const sub = await subjectFor(s, { code: 'CS501', name: '=HYPERLINK("http://evil","click")' });
  const a = (await s.put(`/api/student/subjects/${sub._id}/assessment`).send({ mse1: 20, task1: 4, task2: 3, task3: 2 })).body;
  await s.post(`/api/student/assessments/${a._id}/submit`);
  await (await as('profA')).post(`/api/mentor/assessments/${a._id}/review`).send({ decision: 'verify', version: 1 });
  await s.post('/api/student/activities').send({ semester: 5, category: 'hackathon', name: 'SIH' });
  await (await as('profA')).post('/api/mentor/notes').send({ student: String(ids.stu1._id), type: 'private', text: 'PRIVATE-SECRET-NOTE' });
  await (await as('profA')).post('/api/mentor/recommendations').send({ student: String(ids.stu1._id), title: 'Late', deadline: new Date(Date.now() - 86400000).toISOString() });
}

describe('HOD dashboard', () => {
  it('reports real, exact numbers from the database', async () => {
    await seedData(); const d = (await (await as('hodA')).get('/api/hod/dashboard')).body;
    expect(d.students).toBe(3); expect(d.professors).toBe(2); expect(d.unassignedStudents).toBe(2); expect(d.mentorsAssigned).toBe(1);
    expect(d.pendingHodEndorsements).toBe(1); expect(d.pendingMentorReviews).toBe(0); expect(d.portfolioCompletionPct).toBe(Math.round(100 / 24));
    expect(d.extracurricularParticipation).toEqual({ studentsWithActivity: 1, totalActivities: 1 }); expect(d.studentsNeedingSupportiveFollowUp).toBe(1);
    expect(d.studentsByCurrentSemester['5']).toBe(3); expect(d.reviewTurnaroundHoursAvg).toBeGreaterThanOrEqual(0);
    expect((await (await as('hodB')).get('/api/hod/dashboard')).body.students).toBe(0);
    expect((await (await as('stu1')).get('/api/hod/dashboard')).status).toBe(403);
  });
  it('mentor-wise report is HOD-only and department-scoped', async () => {
    await seedData(); const r = (await (await as('hodA')).get('/api/reports/mentor-wise')).body;
    expect(r.find((m: any) => m.mentor === 'profA')).toMatchObject({ mentees: 1, overdueRecommendations: 1 });
    expect((await (await as('profA')).get('/api/reports/mentor-wise')).status).toBe(403);
  });
});

async function readXlsx(buf: Buffer) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any); const rows: any[][] = []; wb.worksheets[0].eachRow((r) => rows.push((r.values as any[]).slice(1))); return rows; }
const bin = (res: any) => { res.buffer = true; };

describe('exports', () => {
  const xl = async (who: string) => { const a = await as(who); return a.get('/api/reports/assessments.xlsx').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }); };
  it('Excel export is scoped by role, labels verification status, neutralises formulas, and excludes private notes', async () => {
    await seedData();
    const hod = await readXlsx((await xl('hodA')).body); expect(hod).toHaveLength(2); // header + stu1's row only
    expect(hod[1][11]).toMatch(/Mentor verified; pending HOD endorsement/); expect(hod[1][10]).toBe(9);
    expect(String(hod[1][4]).startsWith("'=")).toBe(true); // formula neutralised
    expect(JSON.stringify(hod)).not.toContain('PRIVATE-SECRET');
    expect(await readXlsx((await xl('stu1')).body)).toHaveLength(2);
    expect(await readXlsx((await xl('stu2')).body)).toHaveLength(1); // header only: sees nobody else's data
    expect(await readXlsx((await xl('profA2')).body)).toHaveLength(1);
    expect(await readXlsx((await xl('hodB')).body)).toHaveLength(1);
    expect((await request(app).get('/api/reports/assessments.xlsx')).status).toBe(401);
  });
  it('PDF portfolio is a real PDF for permitted viewers and 404 for everyone else', async () => {
    await seedData(); const url = `/api/reports/portfolio/${ids.stu1._id}.pdf`;
    for (const who of ['stu1', 'profA', 'hodA']) {
      const r = await (await as(who)).get(url).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
      expect(r.status).toBe(200); expect(r.headers['content-type']).toBe('application/pdf'); expect((r.body as Buffer).subarray(0, 4).toString()).toBe('%PDF'); expect((r.body as Buffer).includes('PRIVATE-SECRET')).toBe(false);
    }
    for (const who of ['stu2', 'profA2', 'hodB']) expect((await (await as(who)).get(url)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });
});
