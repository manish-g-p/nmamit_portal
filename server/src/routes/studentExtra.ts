import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { StudentActivity, ACTIVITY_CATEGORIES } from '../models/StudentActivity.js';
import { StudentGoal, GOAL_CATEGORIES } from '../models/StudentGoal.js';
import { MentorRecommendation } from '../models/MentorRecommendation.js';
import { MentorNote } from '../models/MentorNote.js';
import { StudentReflection } from '../models/StudentReflection.js';
import { MentorMeeting } from '../models/MentorMeeting.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { RecordVersion } from '../models/RecordVersion.js';
import { ReviewRecord } from '../models/ReviewRecord.js';
import { Endorsement } from '../models/Endorsement.js';
import { saveVersioned, submitVersioned } from '../services/records.js';
import { activeMentorOf, notify } from '../services/assessments.js';
import { audit } from '../services/audit.js';

export const studentExtra = Router();
studentExtra.use(authenticate, requireRole('student'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);
const bad = (res: any, p: any) => res.status(400).json({ error: 'Validation failed', details: p?.error?.flatten().fieldErrors });
const OPEN = ['proposed', 'accepted', 'in_progress', 'evidence_submitted'];

// ---- Activities (versioned, reviewed) ----
const activityIn = z.object({ semester: z.number().int().min(1).max(8), category: z.enum(ACTIVITY_CATEGORIES), name: z.string().trim().min(2).max(150),
  description: z.string().max(2000).optional(), date: z.coerce.date().optional(), organizer: z.string().max(150).optional(), role: z.string().max(100).optional(),
  achievement: z.string().max(300).optional(), skills: z.array(z.string().max(50)).max(20).optional() }).strict();
const ACT_FIELDS = ['semester', 'category', 'name', 'description', 'date', 'organizer', 'role', 'achievement', 'skills'];

studentExtra.post('/activities', async (req, res) => {
  const p = activityIn.safeParse(req.body); if (!p.success) return bad(res, p);
  const r: any = await saveVersioned(StudentActivity, 'StudentActivity', new StudentActivity({ student: req.user._id }), p.data, req.user, ACT_FIELDS);
  r.error ? res.status(r.code).json({ error: r.error }) : res.status(201).json(r.rec);
});
studentExtra.get('/activities', async (req, res) => {
  const f: any = { student: req.user._id }; const s = z.coerce.number().int().min(1).max(8).safeParse(req.query.semester); if (s.success) f.semester = s.data;
  res.json(await StudentActivity.find(f).sort('semester -date').lean());
});
studentExtra.put('/activities/:id', async (req, res) => {
  const id = oid.safeParse(req.params.id); const p = activityIn.safeParse(req.body); if (!id.success || !p.success) return bad(res, p);
  const rec = await StudentActivity.findOne({ _id: id.data, student: req.user._id }); if (!rec) return res.status(404).json({ error: 'Not found' });
  const r: any = await saveVersioned(StudentActivity, 'StudentActivity', rec, p.data, req.user, ACT_FIELDS);
  r.error ? res.status(r.code).json({ error: r.error }) : res.json(r.rec);
});
studentExtra.post('/activities/:id/submit', async (req, res) => {
  const id = oid.safeParse(req.params.id); const rec = id.success ? await StudentActivity.findOne({ _id: id.data, student: req.user._id }) : null;
  if (!rec) return res.status(404).json({ error: 'Not found' });
  const r: any = await submitVersioned('StudentActivity', rec, req.user); r.error ? res.status(r.code).json({ error: r.error }) : res.json(r.rec);
});
studentExtra.get('/activities/:id/history', async (req, res) => {
  const id = oid.safeParse(req.params.id); const rec = id.success ? await StudentActivity.findOne({ _id: id.data, student: req.user._id }).lean() : null;
  if (!rec) return res.status(404).json({ error: 'Not found' });
  const [versions, reviews, endorsements] = await Promise.all([RecordVersion.find({ recordType: 'StudentActivity', recordId: rec._id }).sort('version').lean(),
    ReviewRecord.find({ recordId: rec._id }).sort('createdAt').select('-reviewer').lean(), Endorsement.find({ recordId: rec._id }).sort('createdAt').select('-endorser').lean()]);
  res.json({ record: rec, versions, reviews, endorsements });
});

// ---- Goals ----
const goalIn = z.object({ title: z.string().trim().min(2).max(150), description: z.string().max(2000).optional(), category: z.enum(GOAL_CATEGORIES),
  targetDate: z.coerce.date().optional(), priority: z.enum(['low', 'medium', 'high']).optional(), successCriteria: z.string().max(1000).optional(),
  relatedSemester: z.number().int().min(1).max(8).optional(), status: z.enum(['not_started', 'in_progress', 'completed', 'dropped']).optional() }).strict();
studentExtra.post('/goals', async (req, res) => {
  const p = goalIn.safeParse(req.body); if (!p.success) return bad(res, p);
  res.status(201).json(await StudentGoal.create({ ...p.data, student: req.user._id }));
});
studentExtra.get('/goals', async (req, res) => res.json(await StudentGoal.find({ student: req.user._id }).sort('-createdAt').lean()));
studentExtra.put('/goals/:id', async (req, res) => {
  const id = oid.safeParse(req.params.id); const p = goalIn.partial().safeParse(req.body); if (!id.success || !p.success) return bad(res, p);
  const g = await StudentGoal.findOneAndUpdate({ _id: id.data, student: req.user._id }, { $set: p.data }, { returnDocument: 'after' });
  g ? res.json(g) : res.status(404).json({ error: 'Not found' });
});
studentExtra.post('/goals/:id/updates', async (req, res) => {
  const id = oid.safeParse(req.params.id); const p = z.object({ text: z.string().trim().min(1).max(1000), progress: z.number().min(0).max(100).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return bad(res, p);
  const g = await StudentGoal.findOne({ _id: id.data, student: req.user._id }); if (!g) return res.status(404).json({ error: 'Not found' });
  g.updates.push(p.data as any); if (p.data.progress != null) { g.progress = p.data.progress; if (g.status === 'not_started') g.status = 'in_progress'; if (p.data.progress === 100) g.status = 'completed'; }
  await g.save(); res.json(g);
});

// ---- Recommendations (student side) ----
studentExtra.get('/recommendations', async (req, res) => {
  const recs = await MentorRecommendation.find({ student: req.user._id }).sort('deadline').lean(); const now = new Date();
  res.json(recs.map((r: any) => ({ ...r, overdue: !!r.deadline && r.deadline < now && OPEN.includes(r.status) })));
});
const RULES: Record<string, { from: string[]; to?: string; needsNote?: boolean }> = {
  accept: { from: ['proposed'], to: 'accepted' }, start: { from: ['accepted'], to: 'in_progress' },
  decline: { from: ['proposed', 'accepted', 'in_progress'], to: 'declined', needsNote: true },
  submit_evidence: { from: ['in_progress'], to: 'evidence_submitted', needsNote: true }, complete: { from: ['evidence_submitted'], to: 'completed' },
  add_note: { from: ['proposed', 'accepted', 'in_progress', 'evidence_submitted', 'completed'], needsNote: true } };
studentExtra.post('/recommendations/:id/action', async (req, res) => {
  const id = oid.safeParse(req.params.id); const p = z.object({ action: z.enum(['accept', 'start', 'decline', 'submit_evidence', 'complete', 'add_note']), note: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!id.success || !p.success) return bad(res, p);
  const rec = await MentorRecommendation.findOne({ _id: id.data, student: req.user._id }); if (!rec) return res.status(404).json({ error: 'Not found' });
  const rule = RULES[p.data.action]; const note = p.data.note?.trim();
  if (!rule.from.includes(rec.status)) return res.status(409).json({ error: `Cannot ${p.data.action} from status ${rec.status}` });
  if (rule.needsNote && !note) return res.status(400).json({ error: 'A note is required for this action' });
  const previous = { status: rec.status };
  if (p.data.action === 'decline') rec.declineReason = note; if (p.data.action === 'submit_evidence') rec.evidenceNote = note;
  if (note) rec.studentNotes.push({ text: note } as any);
  if (rule.to) rec.status = rule.to as any;
  await rec.save();
  await audit({ actor: req.user._id, actorRole: 'student', action: `recommendation.${p.data.action}`, recordType: 'MentorRecommendation', recordId: String(rec._id), previous, next: { status: rec.status }, reason: note });
  await notify(rec.mentor, `${req.user.fullName}: recommendation "${rec.title}" is now ${rec.status.replace('_', ' ')}.`);
  res.json(rec);
});

// ---- Reflections, feedback, meetings ----
studentExtra.post('/reflections', async (req, res) => {
  const p = z.object({ text: z.string().trim().min(1).max(3000), semester: z.number().int().min(1).max(8).optional() }).strict().safeParse(req.body); if (!p.success) return bad(res, p);
  res.status(201).json(await StudentReflection.create({ ...p.data, student: req.user._id }));
});
studentExtra.get('/reflections', async (req, res) => res.json(await StudentReflection.find({ student: req.user._id }).sort('-createdAt').lean()));
// Only student-visible feedback is ever returned here; the type filter is fixed server-side.
studentExtra.get('/feedback', async (req, res) => res.json(await MentorNote.find({ student: req.user._id, type: 'student_visible' }).sort('-createdAt').select('text createdAt').lean()));
studentExtra.get('/meetings', async (req, res) => res.json(await MentorMeeting.find({ student: req.user._id }).sort('-scheduledAt').lean()));

// ---- Dashboard (real data) ----
studentExtra.get('/dashboard', async (req, res) => {
  const now = new Date(); const soon = new Date(Date.now() + 14 * 86400000); const sid = req.user._id;
  const [recs, goals, assess, acts, feedback, meetings] = await Promise.all([
    MentorRecommendation.find({ student: sid, status: { $in: OPEN } }).lean(), StudentGoal.find({ student: sid, status: { $in: ['not_started', 'in_progress'] } }).lean(),
    AssessmentRecord.find({ student: sid }).lean(), StudentActivity.find({ student: sid }).lean(),
    MentorNote.find({ student: sid, type: 'student_visible' }).sort('-createdAt').limit(3).select('text createdAt').lean(),
    MentorMeeting.find({ student: sid, status: 'scheduled', scheduledAt: { $gte: now } }).sort('scheduledAt').limit(3).lean()]);
  const tally = (xs: any[]) => xs.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] ?? 0) + 1 }), {} as Record<string, number>);
  res.json({ overdueRecommendations: recs.filter((r: any) => r.deadline && r.deadline < now), upcomingDeadlines: [
      ...recs.filter((r: any) => r.deadline && r.deadline >= now && r.deadline <= soon).map((r: any) => ({ type: 'recommendation', title: r.title, date: r.deadline })),
      ...goals.filter((g) => g.targetDate && g.targetDate >= now && g.targetDate <= soon).map((g) => ({ type: 'goal', title: g.title, date: g.targetDate }))],
    activeGoals: goals.length, pendingSubmissions: [...assess, ...acts].filter((r: any) => ['draft', 'changes_requested'].includes(r.status)).length,
    assessmentStatuses: tally(assess), activityStatuses: tally(acts), recentFeedback: feedback, upcomingMeetings: meetings, hasMentor: !!(await activeMentorOf(sid)) });
});
