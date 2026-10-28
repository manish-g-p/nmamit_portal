import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { ensureReferenceData } from '../src/services/curriculum.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { StudentProfile } from '../src/models/StudentProfile.js';
import { AuditLog } from '../src/models/AuditLog.js';

const app = createApp(); const PW = 'Str0ngPassw0rd!'; const CODE = 'test-hod-access-code';
let deptA: any, deptB: any, hash: string;

const student = (over: any = {}) => ({ fullName: 'Test Student', email: 'nnm23is999@nmamit.in', usn: 'NNM23IS999', department: String(deptA._id), program: 'B.Tech', admissionYear: 2023,
  currentSemester: 5, firstYearGroup: 'I', section: 'A', password: PW, confirmPassword: PW, privacyAccepted: true, ...over });
const professor = (over: any = {}) => ({ fullName: 'Prof One', email: 'prof1@nmamit.in', department: String(deptA._id), designation: 'Assistant Professor', password: PW, confirmPassword: PW, ...over });
const hod = (over: any = {}) => ({ fullName: 'HOD One', email: 'hod1@nmamit.in', department: String(deptA._id), accessCode: CODE, password: PW, confirmPassword: PW, ...over });
async function login(email: string, password = PW, portal?: string) { const a = request.agent(app); const res = await a.post('/api/auth/login').send({ email, password, portal }); return { agent: a, res }; }

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!); await mongoose.connection.dropDatabase(); await ensureReferenceData();
  deptA = await Department.findOne({ code: 'IS' }); deptB = await Department.findOne({ code: 'CS' }); hash = await argon2.hash(PW, { type: argon2.argon2id });
});
beforeEach(async () => { for (const c of ['users', 'studentprofiles', 'auditlogs']) await mongoose.connection.collection(c).deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); });

describe('departments', () => {
  it('lists the 14 branches with their official codes for the sign-up forms', async () => {
    const d = (await request(app).get('/api/auth/departments')).body; expect(d).toHaveLength(14);
    expect(d.find((x: any) => x.code === 'IS').name).toBe('Information Science & Engineering'); expect(d.every((x: any) => x.degreeLabel === 'B.Tech')).toBe(true);
  });
});

describe('student sign-up and login (no email step)', () => {
  it('creates an active account, logs the student in immediately, and records their branch, group and derived year', async () => {
    const r = await request(app).post('/api/auth/register/student').send(student()); expect(r.status).toBe(201); expect(r.body.user.role).toBe('student');
    expect((r.headers['set-cookie'] as unknown as string[]).every((c) => /HttpOnly/i.test(c))).toBe(true);
    const u = (await User.findOne({ email: 'nnm23is999@nmamit.in' }))!; expect(u.status).toBe('active'); expect(String(u.department)).toBe(String(deptA._id));
    const p = (await StudentProfile.findOne({ user: u._id }))!; expect(p.currentYear).toBe(3); expect(p.firstYearGroup).toBe('I'); expect(p.usn).toBe('NNM23IS999');
    expect((await login('nnm23is999@nmamit.in')).res.status).toBe(200);
  });
  it('requires a branch and first-year group, and rejects bad email domains, weak or mismatched passwords, and missing consent', async () => {
    for (const over of [{ department: undefined }, { firstYearGroup: undefined }, { firstYearGroup: 'III' }, { email: 'x@gmail.com' }, { password: 'short', confirmPassword: 'short' }, { confirmPassword: 'Different1Password' }, { privacyAccepted: false }, { currentSemester: 9 }])
      expect((await request(app).post('/api/auth/register/student').send(student(over))).status).toBe(400);
    expect((await request(app).post('/api/auth/register/student').send(student({ department: '507f1f77bcf86cd799439011' }))).status).toBe(400); // unknown branch
  });
  it('rejects duplicate email and duplicate USN with clear messages', async () => {
    await request(app).post('/api/auth/register/student').send(student());
    expect((await request(app).post('/api/auth/register/student').send(student())).body.error).toMatch(/email already exists/);
    expect((await request(app).post('/api/auth/register/student').send(student({ email: 'other@nmamit.in' }))).body.error).toMatch(/USN already exists/);
  });
});

describe('role escalation', () => {
  it('rejects role, status and unknown fields on student and professor sign-up', async () => {
    for (const extra of [{ role: 'hod' }, { status: 'active' }, { institutionManager: true }, { mustChangePassword: false }]) {
      expect((await request(app).post('/api/auth/register/student').send(student(extra))).status).toBe(400);
      expect((await request(app).post('/api/auth/register/professor').send(professor(extra))).status).toBe(400);
    }
    expect(await User.countDocuments()).toBe(0);
  });
  it('HOD sign-up needs the institution access code', async () => {
    expect((await request(app).post('/api/auth/register/hod').send(hod({ accessCode: 'guess' }))).status).toBe(403);
    expect((await request(app).post('/api/auth/register/hod').send({ ...hod(), accessCode: undefined })).status).toBe(400);
    expect(await User.countDocuments({ role: 'hod' })).toBe(0); expect(await AuditLog.countDocuments({ action: 'hod.register_bad_code' })).toBe(1);
    const ok = await request(app).post('/api/auth/register/hod').send(hod()); expect(ok.status).toBe(201); expect(ok.body.user.role).toBe('hod');
    expect((await User.findOne({ email: 'hod1@nmamit.in' }))!.status).toBe('active');
  });
  it('a department can have only one active HOD, but a second department can register its own', async () => {
    await request(app).post('/api/auth/register/hod').send(hod());
    expect((await request(app).post('/api/auth/register/hod').send(hod({ email: 'hod2@nmamit.in' }))).status).toBe(409);
    expect((await request(app).post('/api/auth/register/hod').send(hod({ email: 'hodb@nmamit.in', department: String(deptB._id) }))).status).toBe(201);
    await User.updateOne({ email: 'hod1@nmamit.in' }, { status: 'suspended' }); // the operator can free a department
    expect((await request(app).post('/api/auth/register/hod').send(hod({ email: 'hod2@nmamit.in' }))).status).toBe(201);
  });
  it('a student can never call HOD or mentor endpoints; unauthenticated and forged requests get 401', async () => {
    await request(app).post('/api/auth/register/student').send(student()); const { agent } = await login('nnm23is999@nmamit.in');
    for (const p of ['/api/hod/professors/pending', '/api/hod/dashboard', '/api/mentor/available-students']) expect((await agent.get(p)).status).toBe(403);
    expect((await request(app).get('/api/hod/dashboard')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', 'access=forged.jwt.value')).status).toBe(401);
  });
  it('blocks NoSQL operator injection in login', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } })).status).toBe(400);
  });
  it('there is no public signup for any removed email route', async () => {
    for (const p of ['/api/auth/verify-email', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/resend-verification']) expect((await request(app).post(p).send({})).status).toBe(404);
  });
});

describe('faculty sign-up and HOD approval', () => {
  it('faculty cannot log in until their own department\'s HOD approves', async () => {
    const r = await request(app).post('/api/auth/register/professor').send(professor()); expect(r.status).toBe(201); expect(r.body.pendingApproval).toBe(true); expect(r.headers['set-cookie']).toBeUndefined();
    const blocked = await login('prof1@nmamit.in'); expect(blocked.res.status).toBe(403); expect(blocked.res.body.error).toMatch(/waiting for approval/);
    await request(app).post('/api/auth/register/hod').send(hod()); const h = await login('hod1@nmamit.in');
    const pending = (await h.agent.get('/api/hod/professors/pending')).body; expect(pending).toHaveLength(1);
    expect((await h.agent.post(`/api/hod/professors/${pending[0]._id}/approve`).send({})).status).toBe(200);
    expect((await login('prof1@nmamit.in')).res.status).toBe(200);
  });
  it('another department\'s HOD cannot see or approve them', async () => {
    await request(app).post('/api/auth/register/professor').send(professor()); await request(app).post('/api/auth/register/hod').send(hod({ email: 'hodb@nmamit.in', department: String(deptB._id) }));
    const b = await login('hodb@nmamit.in'); expect((await b.agent.get('/api/hod/professors/pending')).body).toHaveLength(0);
    const id = (await User.findOne({ email: 'prof1@nmamit.in' }))!._id; expect((await b.agent.post(`/api/hod/professors/${id}/approve`).send({})).status).toBe(404);
  });
  it('suspension signs out an already-open session immediately', async () => {
    await request(app).post('/api/auth/register/professor').send(professor()); await request(app).post('/api/auth/register/hod').send(hod()); const h = await login('hod1@nmamit.in');
    const id = (await User.findOne({ email: 'prof1@nmamit.in' }))!._id; await h.agent.post(`/api/hod/professors/${id}/approve`).send({});
    const p = await login('prof1@nmamit.in'); expect((await p.agent.get('/api/auth/me')).status).toBe(200);
    await h.agent.post(`/api/hod/professors/${id}/suspend`).send({ reason: 'test' }); expect((await p.agent.get('/api/auth/me')).status).toBe(401);
    expect((await login('prof1@nmamit.in')).res.body.error).toMatch(/suspended/);
  });
});

describe('login, logout, lockout, portals', () => {
  beforeEach(async () => { await request(app).post('/api/auth/register/student').send(student()); });
  it('logout invalidates the session server-side (old cookie no longer works)', async () => {
    const { agent, res } = await login('nnm23is999@nmamit.in'); const old = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    expect((await agent.post('/api/auth/logout')).status).toBe(200); expect((await request(app).get('/api/auth/me').set('Cookie', old)).status).toBe(401);
  });
  it('gives the same error for a wrong password and an unknown email', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'nnm23is999@nmamit.in', password: 'WrongPassw0rd!' }); const b = await request(app).post('/api/auth/login').send({ email: 'nobody@nmamit.in', password: 'WrongPassw0rd!' });
    expect(a.status).toBe(401); expect(b.status).toBe(401); expect(a.body).toEqual(b.body);
  });
  it('locks the account after 5 failed attempts, even for the right password', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ email: 'nnm23is999@nmamit.in', password: 'WrongPassw0rd!' });
    expect((await login('nnm23is999@nmamit.in')).res.status).toBe(429);
  });
  it('the portal chosen at login must match the account type, with a helpful message', async () => {
    expect((await login('nnm23is999@nmamit.in', PW, 'student')).res.status).toBe(200);
    for (const wrong of ['faculty', 'hod']) { const r = await login('nnm23is999@nmamit.in', PW, wrong); expect(r.res.status).toBe(403); expect(r.res.body.error).toMatch(/Student account/); expect(r.res.headers['set-cookie']).toBeUndefined(); }
  });
});

describe('change password and HOD-issued temporary passwords', () => {
  it('a user can change their own password; old sessions end and the old password stops working', async () => {
    await request(app).post('/api/auth/register/student').send(student()); const { agent } = await login('nnm23is999@nmamit.in'); const other = await login('nnm23is999@nmamit.in');
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: 'Wrong1Password!', newPassword: 'BrandNewPassw0rd!' })).status).toBe(400);
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: PW, newPassword: 'weak' })).status).toBe(400);
    expect((await agent.post('/api/auth/change-password').send({ currentPassword: PW, newPassword: 'BrandNewPassw0rd!' })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200); expect((await other.agent.get('/api/auth/me')).status).toBe(401);
    expect((await login('nnm23is999@nmamit.in', PW)).res.status).toBe(401); expect((await login('nnm23is999@nmamit.in', 'BrandNewPassw0rd!')).res.status).toBe(200);
  });
  it('HOD resets a student\'s password: shown once, never logged, forced change at next login', async () => {
    await request(app).post('/api/auth/register/student').send(student()); await request(app).post('/api/auth/register/hod').send(hod()); const h = await login('hod1@nmamit.in');
    const stuId = (await User.findOne({ email: 'nnm23is999@nmamit.in' }))!._id; const open = await login('nnm23is999@nmamit.in');
    const r = await h.agent.post(`/api/hod/users/${stuId}/reset-password`).send({}); expect(r.status).toBe(200); const temp = r.body.temporaryPassword; expect(temp).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/);
    expect((await open.agent.get('/api/auth/me')).status).toBe(401); // existing session ended
    expect((await login('nnm23is999@nmamit.in', PW)).res.status).toBe(401);
    const t = await login('nnm23is999@nmamit.in', temp); expect(t.res.status).toBe(200); expect(t.res.body.user.mustChangePassword).toBe(true);
    expect((await t.agent.get('/api/student/dashboard')).body.code).toBe('PASSWORD_CHANGE_REQUIRED'); // blocked until changed
    expect((await t.agent.post('/api/auth/change-password').send({ currentPassword: temp, newPassword: 'MyOwnPassw0rd!99' })).status).toBe(200);
    expect((await t.agent.get('/api/student/dashboard')).status).toBe(200);
    expect(JSON.stringify(await AuditLog.find().lean())).not.toContain(temp); expect(await AuditLog.countDocuments({ action: 'password.reset_by_hod' })).toBe(1);
  });
  it('an HOD can reset only students and faculty of their own department, never another HOD', async () => {
    await request(app).post('/api/auth/register/student').send(student()); await request(app).post('/api/auth/register/hod').send(hod());
    await request(app).post('/api/auth/register/hod').send(hod({ email: 'hodb@nmamit.in', department: String(deptB._id) })); const b = await login('hodb@nmamit.in');
    const stuId = (await User.findOne({ email: 'nnm23is999@nmamit.in' }))!._id; const hodId = (await User.findOne({ email: 'hod1@nmamit.in' }))!._id;
    expect((await b.agent.post(`/api/hod/users/${stuId}/reset-password`).send({})).status).toBe(404); // other department
    const a = await login('hod1@nmamit.in'); expect((await a.agent.post(`/api/hod/users/${hodId}/reset-password`).send({})).status).toBe(404); // not another HOD (or themselves)
    await request(app).post('/api/auth/register/student').send(student({ email: 's2@nmamit.in', usn: 'NNM23IS998' })); const s = await login('s2@nmamit.in');
    expect((await s.agent.post(`/api/hod/users/${stuId}/reset-password`).send({})).status).toBe(403);
  });
});

describe('audit log', () => {
  it('is append-only and never stores passwords', async () => {
    await request(app).post('/api/auth/register/student').send(student()); const entry = await AuditLog.findOne({ action: 'student.register' }); expect(entry).toBeTruthy();
    await expect(AuditLog.updateOne({ _id: entry!._id }, { action: 'x' })).rejects.toThrow(/append-only/); await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    expect(JSON.stringify(entry)).not.toContain(PW);
  });
});
