import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { StudentActivity } from '../models/StudentActivity.js';
import { MentorNote } from '../models/MentorNote.js';
import { AdminNote } from '../models/AdminNote.js';
import { User } from '../models/User.js';
import { inDepartment } from '../services/scope.js';
import { reviewVersioned } from '../services/records.js';
import { audit } from '../services/audit.js';

export const hodExtra = Router();
hodExtra.use(authenticate, requireRole('hod'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);

hodExtra.get('/activities/pending', async (req, res) => {
  const ids = (await User.find({ role: 'student', department: req.user.department }).select('_id').lean()).map((u) => u._id);
  res.json(await StudentActivity.find({ status: 'pending_hod_endorsement', student: { $in: ids } }).lean());
});
hodExtra.post('/activities/:id/review', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const p = z.object({ decision: z.enum(['endorse', 'request_changes', 'reject']), version: z.number().int().min(1), comment: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return res.status(400).json({ error: 'Validation failed' });
  const rec = await StudentActivity.findById(id.data);
  if (!rec || !(await inDepartment(rec.student, req.user.department))) return res.status(404).json({ error: 'Not found' });
  const r: any = await reviewVersioned('StudentActivity', req.user, 'hod', rec, p.data.decision, p.data.version, p.data.comment);
  r.error ? res.status(r.code).json({ error: r.error }) : res.json({ status: r.rec.status });
});
// HODs see student-visible feedback only. Private mentor notes are never exposed to them.
hodExtra.get('/students/:id/feedback', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  if (!id.success || !(await inDepartment(id.data, req.user.department))) return res.status(404).json({ error: 'Not found' });
  res.json(await MentorNote.find({ student: id.data, type: 'student_visible' }).sort('-createdAt').select('text createdAt').lean());
});

// Administrative notes: written and read only by the HOD of the student's department. Access is audited, and note text never enters the audit log.
hodExtra.post('/admin-notes/:studentId', async (req, res) => {
  const id = oid.safeParse(req.params.studentId); const p = z.object({ text: z.string().trim().min(1).max(3000) }).strict().safeParse(req.body);
  if (!id.success || !p.success) return res.status(400).json({ error: 'Validation failed' });
  if (!(await inDepartment(id.data, req.user.department))) return res.status(404).json({ error: 'Not found' });
  const n = await AdminNote.create({ student: id.data, author: req.user._id, text: p.data.text });
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'adminnote.create', recordType: 'AdminNote', recordId: String(n._id) });
  res.status(201).json({ id: n._id });
});
hodExtra.get('/admin-notes/:studentId', async (req, res) => {
  const id = oid.safeParse(req.params.studentId);
  if (!id.success || !(await inDepartment(id.data, req.user.department))) return res.status(404).json({ error: 'Not found' });
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'adminnote.read', recordType: 'User', recordId: id.data });
  res.json(await AdminNote.find({ student: id.data }).sort('-createdAt').lean());
});
