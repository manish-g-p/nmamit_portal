import { Router } from 'express';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Department } from '../models/Department.js';
import { allowedDomains, env } from '../config/env.js';
import { audit } from '../services/audit.js';
import { clearSessionCookies, setSessionCookies, verify } from '../services/session.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 5000 : 40, standardHeaders: true, legacyHeaders: false });

const email = z.string().trim().toLowerCase().email().refine((e) => allowedDomains.includes(e.split('@')[1]), { message: 'Use your institutional email address' });
export const password = z.string().min(10, 'At least 10 characters').max(128).regex(/[a-z]/, 'Needs a lowercase letter').regex(/[A-Z]/, 'Needs an uppercase letter').regex(/\d/, 'Needs a digit');
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const name = z.string().trim().min(2).max(120);
const match = (d: { password: string; confirmPassword: string }) => d.password === d.confirmPassword;
const mismatch = { path: ['confirmPassword'], message: 'Passwords do not match' };
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

const studentSchema = z.object({
  fullName: name, email, usn: z.string().trim().min(5).max(20), department: objectId, program: z.string().default('B.Tech'),
  admissionYear: z.number().int().min(2000).max(2100), currentSemester: z.number().int().min(1).max(8), firstYearGroup: z.enum(['I', 'II']),
  lateralEntry: z.boolean().optional(), section: z.string().trim().max(10).optional(),
  password, confirmPassword: z.string(), privacyAccepted: z.literal(true),
}).strict().refine(match, mismatch);
const professorSchema = z.object({ fullName: name, email, department: objectId, designation: z.string().trim().max(80).optional(), employeeId: z.string().trim().max(30).optional(), password, confirmPassword: z.string() }).strict().refine(match, mismatch);
const hodSchema = z.object({ fullName: name, email, department: objectId, employeeId: z.string().trim().max(30).optional(), accessCode: z.string().min(1).max(200), password, confirmPassword: z.string() }).strict().refine(match, mismatch);

const fail = (res: any, p: any) => res.status(400).json({ error: 'Please fix the highlighted fields.', details: p.error.flatten().fieldErrors });
const sameCode = (a: string, b: string) => { const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest(); return crypto.timingSafeEqual(x, y); };
const publicUser = (u: any) => ({ id: u._id, fullName: u.fullName, role: u.role, department: u.department, mustChangePassword: !!u.mustChangePassword });

authRouter.get('/departments', async (_req, res) => {
  res.json(await Department.find({ active: true }).select('name code degreeLabel').sort('name').lean());
});

authRouter.post('/register/student', limiter, async (req, res) => {
  const p = studentSchema.safeParse(req.body); if (!p.success) return fail(res, p);
  const d = p.data;
  if (!(await Department.exists({ _id: d.department, active: true }))) return res.status(400).json({ error: 'Choose your branch from the list.' });
  const usn = d.usn.toUpperCase();
  if (await User.exists({ email: d.email })) return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  if (await StudentProfile.exists({ usn })) return res.status(409).json({ error: 'An account with this USN already exists. Try logging in.' });
  const user = await User.create({ email: d.email, fullName: d.fullName, role: 'student', status: 'active', department: d.department, passwordHash: await hash(d.password) });
  await StudentProfile.create({ user: user._id, usn, program: d.program, admissionYear: d.admissionYear, currentYear: Math.ceil(d.currentSemester / 2), currentSemester: d.currentSemester,
    firstYearGroup: d.firstYearGroup, lateralEntry: d.lateralEntry ?? false, section: d.section });
  await audit({ actor: user._id, actorRole: 'student', action: 'student.register', recordType: 'User', recordId: String(user._id) });
  setSessionCookies(res, String(user._id), user.tokenVersion);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/register/professor', limiter, async (req, res) => {
  const p = professorSchema.safeParse(req.body); if (!p.success) return fail(res, p);
  const d = p.data;
  if (!(await Department.exists({ _id: d.department, active: true }))) return res.status(400).json({ error: 'Choose your department from the list.' });
  if (await User.exists({ email: d.email })) return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  const user = await User.create({ email: d.email, fullName: d.fullName, role: 'professor', status: 'awaiting_approval', department: d.department, passwordHash: await hash(d.password) });
  await audit({ actor: user._id, actorRole: 'professor', action: 'professor.request_access', recordType: 'User', recordId: String(user._id), next: { designation: d.designation, employeeId: d.employeeId } });
  res.status(201).json({ pendingApproval: true, message: 'Account created. Your department HOD must approve it before you can log in.' });
});

// HOD registration is protected by an access code that only the institution holds, and each department can have one active HOD.
authRouter.post('/register/hod', limiter, async (req, res) => {
  if (!env.HOD_ACCESS_CODE) return res.status(503).json({ error: 'HOD registration is not enabled on this server.' });
  const p = hodSchema.safeParse(req.body); if (!p.success) return fail(res, p);
  const d = p.data;
  if (!sameCode(d.accessCode, env.HOD_ACCESS_CODE)) { await audit({ action: 'hod.register_bad_code', recordType: 'User', next: { email: d.email } }); return res.status(403).json({ error: 'The HOD access code is not correct.' }); }
  if (!(await Department.exists({ _id: d.department, active: true }))) return res.status(400).json({ error: 'Choose your department from the list.' });
  if (await User.exists({ email: d.email })) return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  if (await User.exists({ role: 'hod', department: d.department, status: { $ne: 'suspended' } })) return res.status(409).json({ error: 'This department already has an HOD account. Contact the institution operator if it needs to change.' });
  const user = await User.create({ email: d.email, fullName: d.fullName, role: 'hod', status: 'active', department: d.department, passwordHash: await hash(d.password) });
  await audit({ actor: user._id, actorRole: 'hod', action: 'hod.register', recordType: 'User', recordId: String(user._id), next: { employeeId: d.employeeId } });
  setSessionCookies(res, String(user._id), user.tokenVersion);
  res.status(201).json({ user: publicUser(user) });
});

const PORTALS = { student: 'student', faculty: 'professor', hod: 'hod' } as const;
authRouter.post('/login', limiter, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase(), password: z.string().max(128), portal: z.enum(['student', 'faculty', 'hod']).optional() }).strict().safeParse(req.body);
  const generic = { error: 'Invalid email or password' };
  if (!parsed.success) return res.status(400).json(generic);
  const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
  if (!user) { await argon2.hash(parsed.data.password); return res.status(401).json(generic); } // equalize timing
  if (user.lockedUntil && user.lockedUntil > new Date()) return res.status(429).json({ error: 'Too many wrong attempts. Try again in 15 minutes.' });
  if (!(await argon2.verify(user.passwordHash, parsed.data.password))) {
    user.failedLogins += 1;
    if (user.failedLogins >= 5) { user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); user.failedLogins = 0; }
    await user.save();
    return res.status(401).json(generic);
  }
  user.failedLogins = 0; user.lockedUntil = undefined; await user.save();
  if (parsed.data.portal && PORTALS[parsed.data.portal] !== user.role) {
    const right = user.role === 'professor' ? 'Faculty' : user.role === 'hod' ? 'HOD' : 'Student';
    return res.status(403).json({ error: `This is a ${right} account. Use the ${right} login.`, code: 'WRONG_PORTAL' });
  }
  if (user.status === 'awaiting_approval') return res.status(403).json({ error: 'Your account is waiting for approval from your department HOD.', status: user.status });
  if (user.status !== 'active') return res.status(403).json({ error: 'This account has been suspended. Contact your HOD.', status: user.status });
  setSessionCookies(res, String(user._id), user.tokenVersion);
  res.json({ user: publicUser(user) });
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const p = verify(req.cookies?.refresh);
    const user = await User.findById(p.sub);
    if (p.typ !== 'refresh' || !user || user.tokenVersion !== p.tv || user.status !== 'active') throw new Error();
    setSessionCookies(res, String(user._id), user.tokenVersion);
    res.json({ ok: true });
  } catch { clearSessionCookies(res); res.status(401).json({ error: 'Session expired' }); }
});

authRouter.post('/logout', authenticate, async (req, res) => {
  req.user.tokenVersion += 1; // server-side invalidation of every session for this user
  await req.user.save();
  clearSessionCookies(res);
  res.json({ ok: true });
});

authRouter.get('/me', authenticate, (req, res) => {
  const u = req.user;
  res.json({ id: u._id, fullName: u.fullName, email: u.email, role: u.role, department: u.department, mustChangePassword: !!u.mustChangePassword });
});

// Works for everyone, including users who must replace a temporary password.
authRouter.post('/change-password', limiter, authenticate, async (req, res) => {
  const p = z.object({ currentPassword: z.string().max(128), newPassword: password }).strict().safeParse(req.body); if (!p.success) return fail(res, p);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await argon2.verify(user.passwordHash, p.data.currentPassword))) return res.status(400).json({ error: 'Your current password is not correct.' });
  if (p.data.currentPassword === p.data.newPassword) return res.status(400).json({ error: 'Choose a password different from the current one.' });
  user.passwordHash = await hash(p.data.newPassword); user.mustChangePassword = false; user.tokenVersion += 1; await user.save(); // other sessions end
  await audit({ actor: user._id, actorRole: user.role, action: 'password.change', recordType: 'User', recordId: String(user._id) });
  setSessionCookies(res, String(user._id), user.tokenVersion);
  res.json({ ok: true });
});
