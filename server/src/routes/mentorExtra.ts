import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { StudentActivity } from '../models/StudentActivity.js';
import { StudentGoal } from '../models/StudentGoal.js';
import { StudentReflection } from '../models/StudentReflection.js';
import { MentorRecommendation } from '../models/MentorRecommendation.js';
import { MentorNote } from '../models/MentorNote.js';
import { MentorMeeting } from '../models/MentorMeeting.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { isActiveMentorOf, menteeIds } from '../services/scope.js';
import { reviewVersioned } from '../services/records.js';
import { notify } from '../services/assessments.js';
import { audit } from '../services/audit.js';

export const mentorExtra = Router();
mentorExtra.use(authenticate, requireRole('professor'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);
const bad = (res: any, p?: any) => res.status(400).json({ error: 'Validation failed', details: p?.error?.flatten().fieldErrors });
const OPEN = ['proposed', 'accepted', 'in_progress', 'evidence_submitted'];

// Returns the student id only if the caller is that student's ACTIVE mentor; otherwise answers 404 (no existence leak).
async function mentee(req: any, res: any, raw: string): Promise<string | null> {
  const id = oid.safeParse(raw);
  if (!id.success || !(await isActiveMentorOf(req.user._id, id.data))) { res.status(404).json({ error: 'Not found' }); return null; }
  return id.data;
}

mentorExtra.get('/mentees/:studentId/activities', async (req, res) => { const s = await mentee(req, res, req.params.studentId); if (s) res.json(await StudentActivity.find({ student: s }).sort('semester').lean()); });
mentorExtra.get('/mentees/:studentId/goals', async (req, res) => { const s = await mentee(req, res, req.params.studentId); if (s) res.json(await StudentGoal.find({ student: s }).lean()); });
mentorExtra.get('/mentees/:studentId/reflections', async (req, res) => { const s = await mentee(req, res, req.params.studentId); if (s) res.json(await StudentReflection.find({ student: s }).sort('-createdAt').lean()); });
// Private notes: only this mentor's own, and only while they are the active mentor. Other mentors' private notes are never returned.
mentorExtra.get('/mentees/:studentId/notes', async (req, res) => {
  const s = await mentee(req, res, req.params.studentId); if (!s) return;
  res.json(await MentorNote.find({ student: s, $or: [{ type: 'student_visible' }, { type: 'private', author: req.user._id }] }).sort('-createdAt').lean());
});

mentorExtra.post('/activities/:id/review', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const p = z.object({ decision: z.enum(['verify', 'request_changes', 'reject']), version: z.number().int().min(1), comment: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return bad(res, p);
  const rec = await StudentActivity.findById(id.data);
  if (!rec || !(await isActiveMentorOf(req.user._id, rec.student))) return res.status(404).json({ error: 'Not found' });
  const r: any = await reviewVersioned('StudentActivity', req.user, 'mentor', rec, p.data.decision, p.data.version, p.data.comment);
  r.error ? res.status(r.code).json({ error: r.error }) : res.json({ status: r.rec.status });
});

// ---- Notes ----
mentorExtra.post('/notes', async (req, res) => {
  const p = z.object({ student: oid, type: z.enum(['private', 'student_visible']), text: z.string().trim().min(1).max(3000) }).strict().safeParse(req.body); if (!p.success) return bad(res, p);
  const s = await mentee(req, res, p.data.student); if (!s) return;
  const n = await MentorNote.create({ student: s, author: req.user._id, type: p.data.type, text: p.data.text });
  await audit({ actor: req.user._id, actorRole: 'professor', action: `note.${p.data.type}.create`, recordType: 'MentorNote', recordId: String(n._id) }); // note text is never copied into the audit log
  if (p.data.type === 'student_visible') await notify(s, 'Your mentor shared new feedback.');
  res.status(201).json({ id: n._id });
});

// ---- Recommendations ----
mentorExtra.post('/recommendations', async (req, res) => {
  const p = z.object({ student: oid, title: z.string().trim().min(2).max(150), description: z.string().max(2000).optional(), reason: z.string().max(1000).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(), deadline: z.coerce.date().optional(), followUpDate: z.coerce.date().optional(),
    suggestedResources: z.array(z.string().max(300)).max(10).optional(), expectedOutcome: z.string().max(500).optional(), relatedGoal: oid.optional() }).strict().safeParse(req.body);
  if (!p.success) return bad(res, p);
  const s = await mentee(req, res, p.data.student); if (!s) return;
  if (p.data.relatedGoal && !(await StudentGoal.exists({ _id: p.data.relatedGoal, student: s }))) return res.status(400).json({ error: 'Related goal does not belong to this student' });
  const r = await MentorRecommendation.create({ ...p.data, student: s, mentor: req.user._id });
  await audit({ actor: req.user._id, actorRole: 'professor', action: 'recommendation.create', recordType: 'MentorRecommendation', recordId: String(r._id), next: { title: r.title } });
  await notify(s, `New recommendation from your mentor: ${r.title}`);
  res.status(201).json(r);
});
mentorExtra.get('/recommendations', async (req, res) => {
  const ids = await menteeIds(req.user._id); const now = new Date();
  const recs = await MentorRecommendation.find({ student: { $in: ids } }).sort('deadline').lean();
  res.json(recs.map((r: any) => ({ ...r, overdue: !!r.deadline && r.deadline < now && OPEN.includes(r.status) })));
});
const MRULES: Record<string, { from: string[]; to?: string; needsComment?: boolean }> = {
  add_feedback: { from: [...OPEN, 'completed'], needsComment: true }, request_further_action: { from: ['evidence_submitted', 'completed'], to: 'in_progress', needsComment: true }, close: { from: ['completed'], to: 'closed' } };
mentorExtra.post('/recommendations/:id/action', async (req, res) => {
  const id = oid.safeParse(req.params.id); const p = z.object({ action: z.enum(['add_feedback', 'request_further_action', 'close']), comment: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return bad(res, p);
  const rec = await MentorRecommendation.findById(id.data);
  if (!rec || !(await isActiveMentorOf(req.user._id, rec.student))) return res.status(404).json({ error: 'Not found' });
  const rule = MRULES[p.data.action]; const c = p.data.comment?.trim();
  if (!rule.from.includes(rec.status)) return res.status(409).json({ error: `Cannot ${p.data.action} from status ${rec.status}` });
  if (rule.needsComment && !c) return res.status(400).json({ error: 'A comment is required for this action' });
  const previous = { status: rec.status }; if (c) rec.mentorFeedback.push({ text: c } as any); if (rule.to) rec.status = rule.to as any; await rec.save();
  await audit({ actor: req.user._id, actorRole: 'professor', action: `recommendation.${p.data.action}`, recordType: 'MentorRecommendation', recordId: String(rec._id), previous, next: { status: rec.status }, reason: c });
  await notify(rec.student, `Your mentor updated "${rec.title}": ${p.data.action.replace(/_/g, ' ')}.`);
  res.json(rec);
});

// ---- Meetings ----
mentorExtra.post('/meetings', async (req, res) => {
  const p = z.object({ student: oid, scheduledAt: z.coerce.date(), agenda: z.string().max(1000).optional() }).strict().safeParse(req.body); if (!p.success) return bad(res, p);
  const s = await mentee(req, res, p.data.student); if (!s) return;
  const m = await MentorMeeting.create({ ...p.data, student: s, mentor: req.user._id }); await notify(s, 'A mentoring meeting was scheduled.'); res.status(201).json(m);
});
mentorExtra.get('/meetings', async (req, res) => res.json(await MentorMeeting.find({ mentor: req.user._id, student: { $in: await menteeIds(req.user._id) } }).sort('-scheduledAt').lean()));
mentorExtra.post('/meetings/:id/complete', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const p = z.object({ summary: z.string().trim().min(1).max(3000), actionItems: z.array(z.object({ text: z.string().max(500), dueDate: z.coerce.date().optional() })).max(20).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return bad(res, p);
  const m = await MentorMeeting.findOne({ _id: id.data, mentor: req.user._id, status: 'scheduled' });
  if (!m || !(await isActiveMentorOf(req.user._id, m.student))) return res.status(404).json({ error: 'Not found' });
  m.summary = p.data.summary; m.status = 'completed'; m.set('actionItems', p.data.actionItems ?? []); await m.save(); res.json(m);
});

// ---- Dashboard ----
mentorExtra.get('/dashboard', async (req, res) => {
  const ids = await menteeIds(req.user._id); const now = new Date(); const week = new Date(Date.now() + 7 * 86400000);
  const [aw, ac, recs, meetings] = await Promise.all([AssessmentRecord.countDocuments({ student: { $in: ids }, status: 'awaiting_mentor_review' }),
    StudentActivity.countDocuments({ student: { $in: ids }, status: 'awaiting_mentor_review' }), MentorRecommendation.find({ student: { $in: ids }, status: { $in: OPEN } }).lean(),
    MentorMeeting.find({ mentor: req.user._id, student: { $in: ids }, status: 'scheduled', scheduledAt: { $gte: now } }).sort('scheduledAt').limit(5).lean()]);
  res.json({ mentees: ids.length, awaitingReview: { assessments: aw, activities: ac }, overdueRecommendations: recs.filter((r: any) => r.deadline && r.deadline < now),
    followUpsDue: recs.filter((r: any) => r.followUpDate && r.followUpDate <= week), upcomingMeetings: meetings });
});
