import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { User } from '../models/User.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { Subject } from '../models/Subject.js';
import { Notification } from '../models/Notification.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/assessments.js';
import { reviewAssessment } from '../services/assessments.js';

export const mentorRouter = Router();
mentorRouter.use(authenticate, requireRole('professor'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);

const myMenteeIds = async (mentorId: any) => (await MentorAssignment.find({ mentor: mentorId, active: true })).map((a) => a.student);

const menteeCard = async (ids: any[]) => {
  const [users, profiles] = await Promise.all([User.find({ _id: { $in: ids } }).select('fullName email').sort('fullName').lean(), StudentProfile.find({ user: { $in: ids } }).lean()]);
  return users.map((u) => { const p = profiles.find((x) => String(x.user) === String(u._id)); return { ...u, usn: p?.usn, section: p?.section, semester: p?.currentSemester }; });
};
mentorRouter.get('/mentees', async (req, res) => res.json(await menteeCard(await myMenteeIds(req.user._id))));

// Faculty pick their own mentees from students of THEIR OWN branch who do not have a mentor yet. Only minimal details are shown before choosing.
mentorRouter.get('/available-students', async (req, res) => {
  const q = z.object({ q: z.string().trim().max(60).optional(), semester: z.coerce.number().int().min(1).max(8).optional() }).safeParse(req.query);
  const taken = (await MentorAssignment.find({ active: true, department: req.user.department }).lean()).map((a) => a.student);
  const users = await User.find({ role: 'student', status: 'active', department: req.user.department, _id: { $nin: taken } }).select('fullName').sort('fullName').limit(500).lean();
  const profiles = await StudentProfile.find({ user: { $in: users.map((u) => u._id) } }).lean();
  const needle = q.success ? (q.data.q ?? '').toLowerCase() : ''; const sem = q.success ? q.data.semester : undefined;
  res.json(users.map((u) => { const p = profiles.find((x) => String(x.user) === String(u._id)); return { _id: u._id, fullName: u.fullName, usn: p?.usn, section: p?.section, semester: p?.currentSemester, admissionYear: p?.admissionYear }; })
    .filter((s) => (!needle || `${s.fullName} ${s.usn}`.toLowerCase().includes(needle)) && (!sem || s.semester === sem)).slice(0, 100));
});
mentorRouter.post('/mentees', async (req, res) => {
  const p = z.object({ student: oid }).strict().safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Choose a student.' });
  // The department is part of the query: a student from another branch simply cannot be found.
  const student = await User.findOne({ _id: p.data.student, role: 'student', status: 'active', department: req.user.department });
  if (!student) return res.status(404).json({ error: 'Student not found in your branch.' });
  if (await MentorAssignment.exists({ student: student._id, active: true })) return res.status(409).json({ error: 'This student already has a mentor.' });
  const a = await MentorAssignment.create({ student: student._id, mentor: req.user._id, department: req.user.department, assignedBy: req.user._id });
  await audit({ actor: req.user._id, actorRole: 'professor', action: 'assignment.self_select', recordType: 'MentorAssignment', recordId: String(a._id), next: { student: String(student._id) } });
  await notify(student._id, `${req.user.fullName} is now your mentor.`);
  res.status(201).json({ ok: true });
});
// A mentor can step back from a mentee; the student becomes available to other mentors. History is kept.
mentorRouter.delete('/mentees/:studentId', async (req, res) => {
  const id = oid.safeParse(req.params.studentId);
  const a = id.success ? await MentorAssignment.findOne({ student: id.data, mentor: req.user._id, active: true }) : null;
  if (!a) return res.status(404).json({ error: 'Not found' });
  a.active = false; a.endedAt = new Date(); await a.save();
  await audit({ actor: req.user._id, actorRole: 'professor', action: 'assignment.release', recordType: 'MentorAssignment', recordId: String(a._id), next: { student: String(a.student) } });
  await notify(a.student, `${req.user.fullName} is no longer your mentor. You can be chosen by another mentor in your branch.`);
  res.json({ ok: true });
});

mentorRouter.get('/mentees/:studentId/assessments', async (req, res) => {
  const id = oid.safeParse(req.params.studentId);
  const ids = await myMenteeIds(req.user._id);
  if (!id.success || !ids.some((s) => String(s) === id.data)) return res.status(404).json({ error: 'Not found' }); // not your mentee
  const recs = await AssessmentRecord.find({ student: id.data }).lean();
  const subjects = await Subject.find({ student: id.data }).lean();
  res.json(recs.map((r) => ({ ...r, subject: subjects.find((s) => String(s._id) === String(r.subject)) })));
});

mentorRouter.post('/assessments/:id/review', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const p = z.object({ decision: z.enum(['verify', 'request_changes', 'reject']), version: z.number().int().min(1), comment: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return res.status(400).json({ error: 'Validation failed' });
  const rec = await AssessmentRecord.findById(id.data);
  const ids = await myMenteeIds(req.user._id);
  if (!rec || !ids.some((s) => String(s) === String(rec.student))) return res.status(404).json({ error: 'Not found' });
  const r = await reviewAssessment(req.user, 'mentor', rec, p.data.decision, p.data.version, p.data.comment);
  if (r.error) return res.status(r.code ?? 500).json({ error: r.error });
  res.json({ status: r.rec!.status });
});

mentorRouter.get('/notifications', async (req, res) => {
  res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(50).lean());
});
