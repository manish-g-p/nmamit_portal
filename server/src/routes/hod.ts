import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { AssessmentScheme } from '../models/AssessmentScheme.js';
import { Subject } from '../models/Subject.js';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { reviewAssessment } from '../services/assessments.js';
import { assignMentor } from '../services/assignment.js';

export const hodRouter = Router();
const oid = z.string().regex(/^[a-f\d]{24}$/i);
hodRouter.use(authenticate, requireRole('hod'));

// Pending professor requests, scoped to the HOD's own department.
hodRouter.get('/professors/pending', async (req, res) => {
  res.json(await User.find({ role: 'professor', status: 'awaiting_approval', department: req.user.department })
    .select('fullName email createdAt').lean());
});

async function setProfessorStatus(req: any, res: any, to: 'active' | 'suspended', allowedFrom: string[], action: string) {
  const id = z.string().regex(/^[a-f\d]{24}$/i).safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid id' });
  // Department scope is part of the query: another department's professor simply "doesn't exist" here.
  const target = await User.findOne({ _id: id.data, role: 'professor', department: req.user.department });
  if (!target) return res.status(404).json({ error: 'Not found' });
  if (!allowedFrom.includes(target.status)) return res.status(409).json({ error: `Cannot change from ${target.status}` });
  const previous = { status: target.status };
  target.status = to;
  if (to === 'suspended') target.tokenVersion += 1; // kills existing sessions immediately
  await target.save();
  await audit({ actor: req.user._id, actorRole: 'hod', action, recordType: 'User', recordId: String(target._id),
    previous, next: { status: to }, reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : undefined });
  res.json({ status: target.status });
}

hodRouter.post('/professors/:id/approve', (req, res) => setProfessorStatus(req, res, 'active', ['awaiting_approval', 'suspended'], 'professor.approve'));
hodRouter.post('/professors/:id/suspend', (req, res) => setProfessorStatus(req, res, 'suspended', ['active'], 'professor.suspend'));

// Assign (or reassign) a primary mentor. Previous assignment is ended, not deleted, so history is kept.
hodRouter.post('/assignments', async (req, res) => {
  const p = z.object({ student: oid, mentor: oid }).strict().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Validation failed' });
  const r = await assignMentor(req.user, p.data.student, p.data.mentor);
  r.ok ? res.status(201).json({ id: r.id }) : res.status(r.code).json({ error: r.error });
});

hodRouter.get('/endorsements/pending', async (req, res) => {
  const studentIds = (await User.find({ role: 'student', department: req.user.department }).select('_id').lean()).map((u) => u._id);
  const recs = await AssessmentRecord.find({ status: 'pending_hod_endorsement', student: { $in: studentIds } }).lean();
  const subjects = await Subject.find({ _id: { $in: recs.map((r) => r.subject) } }).lean();
  res.json(recs.map((r) => ({ ...r, subject: subjects.find((s) => String(s._id) === String(r.subject)) })));
});

hodRouter.post('/assessments/:id/review', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const p = z.object({ decision: z.enum(['endorse', 'request_changes', 'reject']), version: z.number().int().min(1), comment: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return res.status(400).json({ error: 'Validation failed' });
  const rec = await AssessmentRecord.findById(id.data);
  const owner = rec && await User.findOne({ _id: rec.student, department: req.user.department }); // department scope
  if (!rec || !owner) return res.status(404).json({ error: 'Not found' });
  const r = await reviewAssessment(req.user, 'hod', rec, p.data.decision, p.data.version, p.data.comment);
  if (r.error) return res.status(r.code ?? 500).json({ error: r.error });
  res.json({ status: r.rec!.status });
});

// Each HOD sets the assessment limits for their own department. Defaults follow the Regulations 2023 (MSE out of 20; tasks 4 + 4 + 2).
hodRouter.get('/scheme', async (req, res) => {
  res.json((await AssessmentScheme.findOne({ department: req.user.department }).lean()) ?? { mse1Max: 20, mse2Max: 20, task1Max: 4, task2Max: 4, task3Max: 2 });
});
hodRouter.put('/scheme', async (req, res) => {
  const n = z.number().min(0).max(1000);
  const p = z.object({ mse1Max: n.optional(), mse2Max: n.optional(), task1Max: n.optional(), task2Max: n.optional(), task3Max: n.optional() }).strict().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Validation failed' });
  const department = req.user.department;
  const previous = await AssessmentScheme.findOne({ department }).lean();
  const scheme = await AssessmentScheme.findOneAndUpdate({ department }, { $set: { ...p.data, updatedBy: req.user._id } }, { upsert: true, returnDocument: 'after' });
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'scheme.update', recordType: 'AssessmentScheme', recordId: String(scheme._id), previous, next: p.data });
  res.json(scheme);
});

// Password help without email: the HOD issues a one-time temporary password for a student or professor in their own department.
const tempPassword = () => { const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789']; const all = sets.join('');
  const pick = (cs: string) => cs[crypto.randomInt(cs.length)]; const chars = [...sets.map(pick), ...Array.from({ length: 9 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; } return chars.join(''); };
hodRouter.post('/users/:id/reset-password', async (req, res) => {
  const id = oid.safeParse(req.params.id); if (!id.success) return res.status(400).json({ error: 'Invalid id' });
  const target = await User.findOne({ _id: id.data, role: { $in: ['student', 'professor'] }, department: req.user.department }).select('+passwordHash'); // never another HOD, never another department
  if (!target) return res.status(404).json({ error: 'Not found' });
  const temp = tempPassword();
  target.passwordHash = await argon2.hash(temp, { type: argon2.argon2id }); target.mustChangePassword = true; target.tokenVersion += 1; target.failedLogins = 0; target.lockedUntil = undefined;
  await target.save();
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'password.reset_by_hod', recordType: 'User', recordId: String(target._id) }); // the password itself is never logged
  res.json({ temporaryPassword: temp, note: 'Share this once. They must choose a new password at their next login.' });
});
