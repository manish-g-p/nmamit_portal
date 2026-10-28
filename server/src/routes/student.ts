import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Subject } from '../models/Subject.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { RecordVersion } from '../models/RecordVersion.js';
import { ReviewRecord } from '../models/ReviewRecord.js';
import { Endorsement } from '../models/Endorsement.js';
import { Notification } from '../models/Notification.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { audit } from '../services/audit.js';
import { curriculumFor, loadSemester, chooseElective } from '../services/curriculum.js';
import { getScheme, marksInput, saveAssessment, submitAssessment, validateMarks } from '../services/assessments.js';

export const studentRouter = Router();
studentRouter.use(authenticate, requireRole('student'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);

studentRouter.get('/semesters', async (req, res) => {
  const subjects = await Subject.find({ student: req.user._id }).lean();
  const recs = await AssessmentRecord.find({ student: req.user._id }).lean();
  res.json(Array.from({ length: 8 }, (_, i) => {
    const sem = i + 1; const subs = subjects.filter((s) => s.semester === sem);
    const statuses: Record<string, number> = {};
    for (const r of recs.filter((r) => r.semester === sem)) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    return { semester: sem, subjects: subs.length, statuses };
  }));
});

// The limits the student's form should enforce (set by their department's HOD; defaults from the Regulations 2023).
studentRouter.get('/assessment-rules', async (req, res) => res.json(await getScheme(req.user.department)));

// Subjects come only from the official curriculum, so codes, titles and credits always match the syllabus.
async function studentContext(req: any) {
  const prof = await StudentProfile.findOne({ user: req.user._id }).lean();
  return prof ? { _id: req.user._id, department: req.user.department, admissionYear: prof.admissionYear, firstYearGroup: (prof.firstYearGroup as 'I' | 'II' | undefined), lateralEntry: !!prof.lateralEntry } : null;
}
studentRouter.get('/curriculum', async (req, res) => {
  const st = await studentContext(req); if (!st) return res.status(404).json({ error: 'Student profile not found' });
  res.json(await curriculumFor(st));
});
// A student can set or correct their first-year group until they have registered first-year subjects.
studentRouter.put('/profile', async (req, res) => {
  const p = z.object({ firstYearGroup: z.enum(['I', 'II']) }).strict().safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Choose Group I or Group II.' });
  if (await Subject.exists({ student: req.user._id, semester: { $lte: 2 } })) return res.status(409).json({ error: 'You have already added first-year subjects, so the group cannot be changed. Ask your HOD.' });
  const prof = await StudentProfile.findOneAndUpdate({ user: req.user._id }, { $set: { firstYearGroup: p.data.firstYearGroup } }, { returnDocument: 'before' });
  if (!prof) return res.status(404).json({ error: 'Student profile not found' });
  await audit({ actor: req.user._id, actorRole: 'student', action: 'profile.set_first_year_group', recordType: 'User', recordId: String(req.user._id), previous: { firstYearGroup: prof.firstYearGroup ?? null }, next: { firstYearGroup: p.data.firstYearGroup } });
  res.json({ firstYearGroup: p.data.firstYearGroup });
});
studentRouter.post('/curriculum/load', async (req, res) => {
  const p = z.object({ semester: z.number().int().min(1).max(8) }).strict().safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Choose a semester from 1 to 8.' });
  const st = await studentContext(req); if (!st) return res.status(404).json({ error: 'Student profile not found' });
  const r = await loadSemester(st, p.data.semester);
  if ('error' in r) return res.status(r.code ?? 400).json({ error: r.error });
  await audit({ actor: req.user._id, actorRole: 'student', action: 'curriculum.load_semester', recordType: 'User', recordId: String(req.user._id), next: { semester: p.data.semester, added: r.added } });
  res.json(r);
});
studentRouter.post('/curriculum/elective', async (req, res) => {
  const p = z.object({ slot: z.string().max(20), courseId: oid }).strict().safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Choose an elective from the list.' });
  const st = await studentContext(req); if (!st) return res.status(404).json({ error: 'Student profile not found' });
  const r = await chooseElective(st, p.data.slot, p.data.courseId);
  if ('error' in r) return res.status(r.code ?? 400).json({ error: r.error });
  await audit({ actor: req.user._id, actorRole: 'student', action: 'curriculum.choose_elective', recordType: 'Subject', recordId: String(r.subject._id), next: { slot: p.data.slot, code: r.subject.code } });
  res.status(201).json(r.subject);
});
// An elective can be changed only before any marks have been entered for it.
studentRouter.delete('/subjects/:id', async (req, res) => {
  const id = oid.safeParse(req.params.id); const sub = id.success ? await Subject.findOne({ _id: id.data, student: req.user._id }) : null;
  if (!sub) return res.status(404).json({ error: 'Not found' });
  if (!sub.slot) return res.status(409).json({ error: 'Core courses cannot be removed.' });
  if (await AssessmentRecord.exists({ subject: sub._id })) return res.status(409).json({ error: 'Marks have already been entered for this elective, so it cannot be changed. Ask your HOD.' });
  await sub.deleteOne();
  await audit({ actor: req.user._id, actorRole: 'student', action: 'curriculum.remove_elective', recordType: 'Subject', recordId: String(sub._id), previous: { code: sub.code } });
  res.json({ ok: true });
});

studentRouter.get('/subjects', async (req, res) => {
  const sem = z.coerce.number().int().min(1).max(8).safeParse(req.query.semester);
  const filter: any = { student: req.user._id }; if (sem.success) filter.semester = sem.data;
  const subjects = await Subject.find(filter).sort('semester code').lean();
  const recs = await AssessmentRecord.find({ subject: { $in: subjects.map((s) => s._id) } }).lean();
  res.json(subjects.map((s) => ({ ...s, assessment: recs.find((r) => String(r.subject) === String(s._id)) ?? null })));
});

studentRouter.put('/subjects/:id/assessment', async (req, res) => {
  const id = oid.safeParse(req.params.id); const p = marksInput.safeParse(req.body);
  if (!id.success || !p.success) return res.status(400).json({ error: 'Validation failed', details: p.success ? undefined : p.error.flatten().fieldErrors });
  const subject = await Subject.findOne({ _id: id.data, student: req.user._id }); // ownership in the query
  if (!subject) return res.status(404).json({ error: 'Not found' });
  const err = validateMarks(p.data, await getScheme(req.user.department), { hasMse: subject.hasMse, cieMax: subject.cieMax });
  if (err) return res.status(400).json({ error: err });
  const r = await saveAssessment(req.user, subject, p.data);
  if (r.error) return res.status(r.code ?? 500).json({ error: r.error });
  res.json(r.rec!);
});

studentRouter.post('/assessments/:id/submit', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const rec = id.success ? await AssessmentRecord.findOne({ _id: id.data, student: req.user._id }) : null;
  if (!rec) return res.status(404).json({ error: 'Not found' });
  const r = await submitAssessment(req.user, rec);
  if (r.error) return res.status(r.code ?? 500).json({ error: r.error });
  res.json(r.rec!);
});

studentRouter.get('/assessments/:id/history', async (req, res) => {
  const id = oid.safeParse(req.params.id);
  const rec = id.success ? await AssessmentRecord.findOne({ _id: id.data, student: req.user._id }).lean() : null;
  if (!rec) return res.status(404).json({ error: 'Not found' });
  const [versions, reviews, endorsements] = await Promise.all([
    RecordVersion.find({ recordType: 'AssessmentRecord', recordId: rec._id }).sort('version').lean(),
    ReviewRecord.find({ recordId: rec._id }).sort('createdAt').select('-reviewer').lean(),
    Endorsement.find({ recordId: rec._id }).sort('createdAt').select('-endorser').lean()]);
  res.json({ record: rec, versions, reviews, endorsements });
});

studentRouter.get('/notifications', async (req, res) => {
  res.json(await Notification.find({ user: req.user._id }).sort('-createdAt').limit(50).lean());
});
