import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { CORE, ELECTIVES, OPEN_ELECTIVES, SLOTS, FIRST_YEAR } from '../src/seed/curriculum.is.2023.js';
import { DEPARTMENTS } from '../src/seed/departments.data.js';
import { ensureReferenceData } from '../src/services/curriculum.js';
import { Department } from '../src/models/Department.js';
import { CurriculumCourse } from '../src/models/CurriculumCourse.js';
import { User } from '../src/models/User.js';
import { StudentProfile } from '../src/models/StudentProfile.js';
import { Subject } from '../src/models/Subject.js';
import { spawnSync } from 'node:child_process';

const app = createApp(); const PW = 'Str0ngPassw0rd!';

describe('syllabus data integrity (ISE, Regulations 2023)', () => {
  const all = [...CORE, ...ELECTIVES, ...OPEN_ELECTIVES];
  it('has no duplicate course codes: every course appears exactly once', () => {
    const codes = all.map((c) => c.code); expect(codes.filter((c, i) => codes.indexOf(c) !== i)).toEqual([]);
  });
  it('keeps one entry for each subject the syllabus repeats (Internship-I, Research Methodology, Kannada)', () => {
    expect(all.filter((c) => c.code === 'UC1001-1')).toHaveLength(1); expect(CORE.find((c) => c.code === 'UC1001-1')!.semester).toBe(4);
    expect(all.filter((c) => /research methodology/i.test(c.title))).toHaveLength(1); expect(all.some((c) => c.code === 'ME1659-1')).toBe(false);
    expect(all.filter((c) => c.code === 'HU1003-1')).toHaveLength(1);
  });
  it('does not offer open electives that duplicate mandatory ISE courses, or ISE\'s own offerings, to ISE students', () => {
    const forIS = OPEN_ELECTIVES.filter((c) => !c.notFor!.includes('IS')).map((c) => c.code);
    for (const dup of ['HU1502-1', 'MA2501-1', 'CS2502-1', 'IS2501-1', 'IS2504-1']) expect(forIS).not.toContain(dup);
  });
  it('reproduces the credit totals printed in the syllabus, semester by semester (161 in total)', () => {
    const sum = (xs: { credits: number }[]) => xs.reduce((a, c) => a + c.credits, 0);
    const slotCredits = (sem: number) => Object.values(SLOTS).filter((s) => s.semester === sem).reduce((a, s) => a + s.credits, 0);
    const regular = (c: any) => c.audience !== 'lateral';
    const A = sum(CORE.filter((c) => c.table === 'A')), B = sum(CORE.filter((c) => c.table === 'B'));
    expect([A, B]).toEqual([19, 21]);
    const sem = (n: number) => sum(CORE.filter((c) => c.semester === n && regular(c))) + slotCredits(n);
    expect([3, 4, 5, 6, 7, 8].map(sem)).toEqual([20, 24, 20, 21, 20, 16]);
    expect(A + B + [3, 4, 5, 6, 7, 8].map(sem).reduce((a, b) => a + b, 0)).toBe(161);
  });
  it('marks MSE courses correctly: theory with an SEE has MSEs; labs, projects and CIE-only courses do not', () => {
    const f = (code: string) => all.find((c) => c.code === code)!; const has = (c: any) => c.l > 0 && c.see > 0;
    expect(has(f('CS2001-1'))).toBe(true); expect(has(f('IS3101-1'))).toBe(true); expect(has(f('IS1604-1'))).toBe(false); expect(has(f('UC3002-1'))).toBe(false); expect(has(f('HU1002-1'))).toBe(false);
  });
  it('covers all 14 branches with their official codes', () => {
    expect(DEPARTMENTS.map((d) => d.code).sort()).toEqual(['AC', 'AD', 'AM', 'BT', 'CB', 'CC', 'CS', 'CV', 'EC', 'EE', 'IS', 'ME', 'RI', 'VT']);
  });
  it('first-year groups swap tables A and B between semesters 1 and 2', () => { expect(FIRST_YEAR.I).toEqual({ A: 1, B: 2 }); expect(FIRST_YEAR.II).toEqual({ A: 2, B: 1 }); });
});

describe('student curriculum registration', () => {
  let hash: string; const ids: Record<string, any> = {};
  async function student(key: string, over: any = {}, dept?: string) {
    const d = (await Department.findOne({ code: dept ?? 'IS' }))!;
    ids[key] = await User.create({ email: `${key}@nmamit.in`, fullName: key, role: 'student', status: 'active', department: d._id, passwordHash: hash });
    await StudentProfile.create({ user: ids[key]._id, usn: key.toUpperCase(), admissionYear: 2023, currentYear: 3, currentSemester: 5, firstYearGroup: 'I', ...over });
    const a = request.agent(app); expect((await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW })).status).toBe(200); return a;
  }
  beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await mongoose.connection.dropDatabase(); await ensureReferenceData(); hash = await argon2.hash(PW, { type: argon2.argon2id }); });
  beforeEach(async () => { for (const c of ['users', 'studentprofiles', 'subjects', 'assessmentrecords', 'auditlogs']) await mongoose.connection.collection(c).deleteMany({}); });
  afterAll(async () => { await mongoose.disconnect(); });

  it('loads on startup and is idempotent (running again adds nothing)', async () => {
    const before = await CurriculumCourse.countDocuments(); await ensureReferenceData(); expect(await CurriculumCourse.countDocuments()).toBe(before);
    expect(await Department.countDocuments()).toBe(14); expect((await Department.findOne({ code: 'IS' }))!.name).toBe('Information Science & Engineering');
  });
  it('registers a semester\'s core courses once, with real codes, credits and the right academic year', async () => {
    const s = await student('stu1');
    expect((await s.post('/api/student/curriculum/load').send({ semester: 5 })).body).toEqual({ added: 7, total: 7 });
    expect((await s.post('/api/student/curriculum/load').send({ semester: 5 })).body).toEqual({ added: 0, total: 7 }); // no duplicates
    const subs = (await s.get('/api/student/subjects?semester=5')).body;
    expect(subs.map((x: any) => x.code).sort()).toEqual(['HU1006-1', 'HU1007-1', 'IS1604-1', 'IS2002-1', 'IS3001-1', 'IS3101-1', 'UM1003-1']);
    expect(subs.find((x: any) => x.code === 'IS3001-1')).toMatchObject({ name: 'Data Communication and Networking', credits: 4, hasMse: true, academicYear: '2025-26' });
    expect(subs.find((x: any) => x.code === 'IS1604-1')).toMatchObject({ hasMse: false, cieMax: 50 });
  });
  it('puts first-year courses in the right semester for Group I and Group II', async () => {
    const g1 = await student('grp1', { firstYearGroup: 'I' }); const g2 = await student('grp2', { firstYearGroup: 'II' });
    for (const a of [g1, g2]) { await a.post('/api/student/curriculum/load').send({ semester: 1 }); await a.post('/api/student/curriculum/load').send({ semester: 2 }); }
    const codes = async (a: any, n: number) => (await a.get(`/api/student/subjects?semester=${n}`)).body.map((x: any) => x.code);
    expect(await codes(g1, 1)).toContain('MA1002-1'); expect(await codes(g1, 2)).toContain('MA1007-1');
    expect(await codes(g2, 1)).toContain('MA1007-1'); expect(await codes(g2, 2)).toContain('MA1002-1');
    expect(await codes(g1, 1)).not.toContain('UC1001-1'); // Internship-I is credited in semester 4 only
  });
  it('lateral-entry bridge courses appear only for lateral-entry students', async () => {
    const reg = await student('reg1'); const lat = await student('lat1', { lateralEntry: true, firstYearGroup: 'I' });
    const has = async (a: any) => (await a.get('/api/student/curriculum')).body.semesters[2].core.some((c: any) => c.code === 'MA1012-1');
    expect(await has(reg)).toBe(false); expect(await has(lat)).toBe(true);
  });
  it('enforces elective slots: one per slot, right group, no repeats, no free text', async () => {
    const s = await student('stu2'); const cur = (await s.get('/api/student/curriculum')).body;
    const slot = (n: string) => cur.semesters.flatMap((x: any) => x.slots).find((x: any) => x.slot === n);
    const pecI = slot('PEC-I'); expect(pecI.options.length).toBe(20); // all Group 1 electives (5 streams x 4)
    const pick = (sl: string, opt: any) => s.post('/api/student/curriculum/elective').send({ slot: sl, courseId: opt._id });
    expect((await pick('PEC-I', pecI.options[0])).status).toBe(201);
    expect((await pick('PEC-I', pecI.options[1])).status).toBe(409); // slot already filled
    const g2 = slot('PEC-III').options[0]; expect((await pick('PEC-I', g2)).status).toBe(400); // a Group 2 course is not a valid option for a Group 1 slot
    expect((await pick('PEC-II', g2)).status).toBe(400); // Group 2 course in a Group 1 slot
    expect((await pick('PEC-II', pecI.options[0])).status).toBe(409); // same elective twice
    expect((await pick('PEC-III', g2)).status).toBe(201);
    expect((await pick('NOPE', g2)).status).toBe(400);
    expect((await s.post('/api/student/subjects').send({ semester: 5, academicYear: '2025-26', code: 'FAKE1', name: 'Invented' })).status).toBe(404); // free-text subjects no longer exist
  });
  it('open electives exclude the student\'s own department and duplicates of core courses', async () => {
    const s = await student('stu3'); const cur = (await s.get('/api/student/curriculum')).body;
    const codes = cur.semesters[5].slots.find((x: any) => x.slot === 'OEC-I').options.map((o: any) => o.code);
    expect(codes).toContain('HU1507-1'); for (const no of ['IS2501-1', 'HU1502-1', 'MA2501-1', 'CS2502-1']) expect(codes).not.toContain(no);
  });
  it('an elective can be changed only before marks are entered', async () => {
    const s = await student('stu4'); const cur = (await s.get('/api/student/curriculum')).body; const vec = cur.semesters[3].slots.find((x: any) => x.slot === 'VEC');
    const sub = (await s.post('/api/student/curriculum/elective').send({ slot: 'VEC', courseId: vec.options[0]._id })).body;
    expect((await s.delete(`/api/student/subjects/${sub._id}`)).status).toBe(200);
    const again = (await s.post('/api/student/curriculum/elective').send({ slot: 'VEC', courseId: vec.options[1]._id })).body;
    await s.put(`/api/student/subjects/${again._id}/assessment`).send({ cieMarks: 40 }).expect(200);
    expect((await s.delete(`/api/student/subjects/${again._id}`)).status).toBe(409);
    const core = (await s.post('/api/student/curriculum/load').send({ semester: 5 })); const sub5 = (await Subject.findOne({ student: ids.stu4._id, code: 'IS3001-1' }))!;
    expect((await s.delete(`/api/student/subjects/${sub5._id}`)).status).toBe(409); expect(core.status).toBe(200);
  });
  it('a branch or batch without a loaded curriculum gets a clear message instead of a broken page', async () => {
    const cs = await student('cs1', {}, 'CS'); const body = (await cs.get('/api/student/curriculum')).body; expect(body.available).toBe(false);
    expect((await cs.post('/api/student/curriculum/load').send({ semester: 5 })).status).toBe(404);
    const old = await student('old1', { admissionYear: 2022 }); expect((await old.get('/api/student/curriculum')).body.available).toBe(false);
  });
  it('MSE courses accept MSE/task marks (MSE max 20, tasks 4/4/2); no-MSE courses accept only a CIE mark up to their maximum', async () => {
    const s = await student('stu5'); await s.post('/api/student/curriculum/load').send({ semester: 5 });
    const subs = (await s.get('/api/student/subjects?semester=5')).body; const theory = subs.find((x: any) => x.code === 'IS3001-1'); const lab = subs.find((x: any) => x.code === 'IS1604-1');
    const put = (id: string, body: any) => s.put(`/api/student/subjects/${id}/assessment`).send(body);
    expect((await put(theory._id, { mse1: 21 })).status).toBe(400); expect((await put(theory._id, { mse1: 20, mse2: 20, task1: 4, task2: 4, task3: 2 })).body.taskSubtotal).toBe(10);
    expect((await put(theory._id, { task1: 5 })).status).toBe(400); expect((await put(theory._id, { cieMarks: 30 })).status).toBe(400);
    expect((await put(lab._id, { mse1: 10 })).status).toBe(400); expect((await put(lab._id, { cieMarks: 51 })).status).toBe(400); expect((await put(lab._id, { cieMarks: 50 })).status).toBe(200);
  });
});

describe('data written by earlier versions', () => {
  let hash: string; const PW2 = 'Str0ngPassw0rd!';
  beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); hash = await argon2.hash(PW2, { type: argon2.argon2id }); });
  beforeEach(async () => { await mongoose.connection.dropDatabase(); await ensureReferenceData(); });
  afterAll(async () => { await mongoose.disconnect(); });
  const legacyStudent = async (key: string) => { // a profile saved before first-year groups existed
    const d = (await Department.findOne({ code: 'IS' }))!;
    const u = await User.create({ email: `${key}@nmamit.in`, fullName: key, role: 'student', status: 'active', department: d._id, passwordHash: hash });
    await StudentProfile.collection.insertOne({ user: u._id, usn: key.toUpperCase(), program: 'B.Tech', admissionYear: 2023, currentYear: 3, currentSemester: 5 });
    const a = request.agent(app); expect((await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW2 })).status).toBe(200); return a;
  };
  it('a student without a saved first-year group still sees the app, and is asked to choose one', async () => {
    const s = await legacyStudent('old1'); const v = (await s.get('/api/student/curriculum')).body;
    expect(v.available).toBe(true); expect(v.needsGroup).toBe(true); expect(v.canChangeGroup).toBe(true); expect(v.semesters[0].core).toEqual([]); // first-year courses wait for the group
    expect((await s.post('/api/student/curriculum/load').send({ semester: 5 })).body.added).toBe(7); // later semesters are unaffected
    const early = await s.post('/api/student/curriculum/load').send({ semester: 1 }); expect(early.status).toBe(400); expect(early.body.error).toMatch(/first-year group/);
    expect((await s.put('/api/student/profile').send({ firstYearGroup: 'II' })).status).toBe(200);
    expect((await s.post('/api/student/curriculum/load').send({ semester: 1 })).status).toBe(200);
    expect((await s.get('/api/student/subjects?semester=1')).body.map((x: any) => x.code)).toContain('MA1007-1'); // Group II takes table B in semester 1
  });
  it('the group can be corrected until first-year subjects are registered, and then it is locked', async () => {
    const s = await legacyStudent('old2');
    for (const g of ['I', 'II', 'I']) expect((await s.put('/api/student/profile').send({ firstYearGroup: g })).status).toBe(200);
    expect((await s.put('/api/student/profile').send({ firstYearGroup: 'III' })).status).toBe(400); expect((await s.put('/api/student/profile').send({ firstYearGroup: 'I', extra: 1 })).status).toBe(400);
    await s.post('/api/student/curriculum/load').send({ semester: 2 });
    const locked = await s.put('/api/student/profile').send({ firstYearGroup: 'II' }); expect(locked.status).toBe(409); expect((await s.get('/api/student/curriculum')).body.canChangeGroup).toBe(false);
  });
  it('only students can set the group', async () => {
    const d = (await Department.findOne({ code: 'IS' }))!; await User.create({ email: 'p@nmamit.in', fullName: 'p', role: 'professor', status: 'active', department: d._id, passwordHash: hash });
    const a = request.agent(app); await a.post('/api/auth/login').send({ email: 'p@nmamit.in', password: PW2 }); expect((await a.put('/api/student/profile').send({ firstYearGroup: 'I' })).status).toBe(403);
  });
  it('startup repairs older records: hand-typed subjects use MSE marks, unverified students become active, professors wait for approval; and it is repeatable', async () => {
    const d = (await Department.findOne({ code: 'IS' }))!; const stu = await User.create({ email: 'o3@nmamit.in', fullName: 'o3', role: 'student', status: 'active', department: d._id, passwordHash: hash });
    await Subject.collection.insertOne({ student: stu._id, semester: 1, academicYear: '2023-24', code: 'IS-2344', name: 'DSA' }); // no hasMse field, as in older versions
    await User.collection.insertMany([{ email: 'v@nmamit.in', fullName: 'v', role: 'student', status: 'email_verified', department: d._id, passwordHash: 'x' }, { email: 'pp@nmamit.in', fullName: 'pp', role: 'professor', status: 'registration_pending', department: d._id, passwordHash: 'x' }]);
    await ensureReferenceData(); await ensureReferenceData();
    expect((await Subject.collection.findOne({ code: 'IS-2344' }))!.hasMse).toBe(true);
    expect((await User.collection.findOne({ email: 'v@nmamit.in' }))!.status).toBe('active'); expect((await User.collection.findOne({ email: 'pp@nmamit.in' }))!.status).toBe('awaiting_approval');
  });
});

describe('dev reset script', () => {
  const run = (args: string[], env: Record<string, string> = {}) => spawnSync('npx', ['tsx', 'src/scripts/resetDevDb.ts', ...args], { env: { ...process.env, ...env }, encoding: 'utf8', shell: process.platform === 'win32' });
  const uri = 'mongodb://127.0.0.1:27017/nmamit_resettest';
  it('refuses without --yes and in production, and with --yes empties the database', async () => {
    const conn = await mongoose.createConnection(uri).asPromise(); await conn.collection('things').insertOne({ a: 1 });
    expect(run([], { MONGODB_URI: uri, NODE_ENV: 'development' }).status).not.toBe(0); expect(await conn.collection('things').countDocuments()).toBe(1);
    const prod = run(['--yes'], { MONGODB_URI: uri, NODE_ENV: 'production', HOD_ACCESS_CODE: '' }); expect(prod.status).not.toBe(0); expect(`${prod.stderr}${prod.stdout}`).toMatch(/Refusing to reset a production database/); expect(await conn.collection('things').countDocuments()).toBe(1);
    expect(run(['--yes'], { MONGODB_URI: uri, NODE_ENV: 'development' }).status).toBe(0); expect(await conn.collection('things').countDocuments()).toBe(0);
    await conn.dropDatabase(); await conn.close();
  }, 60000);
});
