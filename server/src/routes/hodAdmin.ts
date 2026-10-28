import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { FacultyProfile } from '../models/FacultyProfile.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Subject } from '../models/Subject.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { StudentActivity } from '../models/StudentActivity.js';
import { MentorRecommendation } from '../models/MentorRecommendation.js';
import { ReviewRecord } from '../models/ReviewRecord.js';
import { RecordVersion } from '../models/RecordVersion.js';
import { assignMentor } from '../services/assignment.js';
import { audit } from '../services/audit.js';

export const hodAdmin = Router();
hodAdmin.use(authenticate, requireRole('hod'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const MAX_ROWS = 500;
const readCsv = (buf: Buffer): any[] => parse(buf, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: false });
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// ---------- Faculty directory ----------
// Reference data only: records never grant login, and email is never imported or invented.
const scopeDept = (req: any) => req.user.department;
hodAdmin.get('/faculty', async (req, res) => {
  const page = z.coerce.number().int().min(1).catch(1).parse(req.query.page); const f: any = { department: scopeDept(req) };
  const st = z.enum(['pending_review', 'approved', 'inactive']).safeParse(req.query.status); if (st.success) f.importStatus = st.data;
  const [items, total] = await Promise.all([FacultyProfile.find(f).sort('fullName').skip((page - 1) * 50).limit(50).lean(), FacultyProfile.countDocuments(f)]);
  res.json({ page, total, items });
});
const facIn = z.object({ fullName: z.string().trim().min(2).max(120), designation: z.string().trim().max(100).optional(), employeeId: z.string().trim().max(30).optional(),
  profileUrl: z.string().url().max(300).optional(), sourceUrl: z.string().url().max(300).optional(), lastChecked: z.coerce.date().optional() }).strict();
const dupe = async (dept: any, name: string, exceptId?: any) => (await FacultyProfile.find({ department: dept }).select('fullName').lean()).some((f) => norm(f.fullName) === norm(name) && String(f._id) !== String(exceptId));
hodAdmin.post('/faculty', async (req, res) => {
  const p = facIn.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Validation failed', details: p.error.flatten().fieldErrors });
  const dept = req.user.department; if (await dupe(dept, p.data.fullName)) return res.status(409).json({ error: 'Faculty member already exists in this department' });
  const f = await FacultyProfile.create({ ...p.data, department: dept, importStatus: 'approved' }); // added by the HOD directly, so already reviewed
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'faculty.create', recordType: 'FacultyProfile', recordId: String(f._id) }); res.status(201).json(f);
});
async function ownFaculty(req: any, res: any) {
  const id = oid.safeParse(req.params.id); const f = id.success ? await FacultyProfile.findOne({ _id: id.data, department: req.user.department }) : null;
  if (!f) res.status(404).json({ error: 'Not found' }); return f;
}
hodAdmin.put('/faculty/:id', async (req, res) => {
  const p = facIn.partial().safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Validation failed' });
  const f = await ownFaculty(req, res); if (!f) return;
  if (p.data.fullName && await dupe(f.department, p.data.fullName, f._id)) return res.status(409).json({ error: 'Faculty member already exists in this department' });
  const previous = { fullName: f.fullName, designation: f.designation }; f.set(p.data); await f.save();
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'faculty.update', recordType: 'FacultyProfile', recordId: String(f._id), previous, next: p.data }); res.json(f);
});
for (const [path, to, from] of [['approve', 'approved', ['pending_review', 'inactive']], ['deactivate', 'inactive', ['approved', 'pending_review']]] as const) {
  hodAdmin.post(`/faculty/:id/${path}`, async (req, res) => {
    const f = await ownFaculty(req, res); if (!f) return;
    if (!(from as readonly string[]).includes(f.importStatus)) return res.status(409).json({ error: `Cannot ${path} from ${f.importStatus}` });
    const previous = { importStatus: f.importStatus }; f.importStatus = to; await f.save();
    await audit({ actor: req.user._id, actorRole: 'hod', action: `faculty.${path}`, recordType: 'FacultyProfile', recordId: String(f._id), previous, next: { importStatus: to } }); res.json(f);
  });
}
// An HOD links a directory entry to a verified, active professor account in the same department. Nothing is auto-matched.
hodAdmin.post('/faculty/:id/map-user', async (req, res) => {
  const p = z.object({ userId: oid }).strict().safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Validation failed' });
  const f = await ownFaculty(req, res); if (!f) return;
  if (f.importStatus !== 'approved') return res.status(409).json({ error: 'Approve the directory entry first' });
  const u = await User.findOne({ _id: p.data.userId, role: 'professor', status: 'active', department: req.user.department });
  if (!u) return res.status(404).json({ error: 'Active professor not found in your department' });
  if (await FacultyProfile.exists({ user: u._id, _id: { $ne: f._id } })) return res.status(409).json({ error: 'That account is already mapped to another entry' });
  f.user = u._id; await f.save();
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'faculty.map_user', recordType: 'FacultyProfile', recordId: String(f._id), next: { user: String(u._id) } }); res.json(f);
});
// CSV import: columns full_name (required), designation, profile_url, source_url, last_checked, employee_id. Rows land as pending_review.
hodAdmin.post('/faculty/import', csvUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });
  let rows: any[]; try { rows = readCsv(req.file.buffer); } catch { return res.status(400).json({ error: 'Could not parse CSV' }); }
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `At most ${MAX_ROWS} rows per import` });
  const dept = req.user.department; const seen = new Set((await FacultyProfile.find({ department: dept }).select('fullName').lean()).map((f) => norm(f.fullName)));
  const result = { created: 0, skippedDuplicates: 0, invalid: [] as { row: number; error: string }[] };
  for (const [i, r] of rows.entries()) {
    const p = facIn.safeParse({ fullName: r.full_name, designation: r.designation || undefined, employeeId: r.employee_id || undefined, profileUrl: r.profile_url || undefined, sourceUrl: r.source_url || undefined, lastChecked: r.last_checked || undefined });
    if (!p.success) { result.invalid.push({ row: i + 2, error: Object.keys(p.error.flatten().fieldErrors).join(', ') + ' invalid' }); continue; }
    if (seen.has(norm(p.data.fullName))) { result.skippedDuplicates++; continue; }
    seen.add(norm(p.data.fullName)); await FacultyProfile.create({ ...p.data, department: dept, importStatus: 'pending_review' }); result.created++;
  }
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'faculty.import', recordType: 'FacultyProfile', next: { created: result.created, skipped: result.skippedDuplicates, invalid: result.invalid.length } });
  res.status(201).json(result);
});

// ---------- Bulk mentor assignment (CSV: student_email, mentor_email) ----------
hodAdmin.post('/assignments/bulk', csvUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });
  let rows: any[]; try { rows = readCsv(req.file.buffer); } catch { return res.status(400).json({ error: 'Could not parse CSV' }); }
  if (rows.length > MAX_ROWS) return res.status(400).json({ error: `At most ${MAX_ROWS} rows per import` });
  const out: { row: number; ok: boolean; error?: string }[] = [];
  for (const [i, r] of rows.entries()) {
    const [s, m] = await Promise.all([User.findOne({ email: String(r.student_email ?? '').toLowerCase(), role: 'student' }), User.findOne({ email: String(r.mentor_email ?? '').toLowerCase(), role: 'professor' })]);
    if (!s || !m) { out.push({ row: i + 2, ok: false, error: 'Unknown student or mentor email' }); continue; }
    const a = await assignMentor(req.user, s._id, m._id); out.push(a.ok ? { row: i + 2, ok: true } : { row: i + 2, ok: false, error: a.error });
  }
  res.json({ assigned: out.filter((o) => o.ok).length, failed: out.filter((o) => !o.ok), total: out.length });
});
hodAdmin.get('/students/unassigned', async (req, res) => {
  const assigned = (await MentorAssignment.find({ active: true, department: req.user.department }).lean()).map((a) => a.student);
  res.json(await User.find({ role: 'student', status: 'active', department: req.user.department, _id: { $nin: assigned } }).select('fullName email').lean());
});
hodAdmin.get('/assignments', async (req, res) => {
  const f: any = { department: req.user.department }; if (req.query.active === 'false') f.active = false; else f.active = true;
  res.json(await MentorAssignment.find(f).sort('-effectiveFrom').limit(500).lean());
});

// ---------- Department dashboard (all numbers computed from the database) ----------
hodAdmin.get('/dashboard', async (req, res) => {
  const dept = req.user.department;
  const students = await User.find({ role: 'student', status: 'active', department: dept }).select('_id').lean(); const sids = students.map((s) => s._id);
  const [profs, assigned, pendM, pendH, subs, acts, recs, profiles] = await Promise.all([User.countDocuments({ role: 'professor', status: 'active', department: dept }),
    MentorAssignment.find({ active: true, department: dept }).lean(),
    Promise.all([AssessmentRecord.countDocuments({ student: { $in: sids }, status: 'awaiting_mentor_review' }), StudentActivity.countDocuments({ student: { $in: sids }, status: 'awaiting_mentor_review' })]),
    Promise.all([AssessmentRecord.countDocuments({ student: { $in: sids }, status: 'pending_hod_endorsement' }), StudentActivity.countDocuments({ student: { $in: sids }, status: 'pending_hod_endorsement' })]),
    Subject.find({ student: { $in: sids } }).select('student semester').lean(), StudentActivity.find({ student: { $in: sids } }).select('student').lean(),
    MentorRecommendation.find({ student: { $in: sids }, status: { $in: ['proposed', 'accepted', 'in_progress', 'evidence_submitted'] } }).lean(), StudentProfile.find({ user: { $in: sids } }).lean()]);
  const now = new Date(); const assignedSet = new Set(assigned.map((a) => String(a.student)));
  const semsCovered = new Map<string, Set<number>>(); for (const s of subs) { const k = String(s.student); (semsCovered.get(k) ?? semsCovered.set(k, new Set()).get(k)!).add(s.semester); }
  const turnaround = await mentorTurnaroundHours(sids);
  const bySem: Record<string, number> = {}; for (const p of profiles) bySem[p.currentSemester] = (bySem[p.currentSemester] ?? 0) + 1;
  res.json({ students: sids.length, professors: profs, studentsByCurrentSemester: bySem, mentorsAssigned: new Set(assigned.map((a) => String(a.mentor))).size, unassignedStudents: sids.length - assignedSet.size,
    pendingMentorReviews: pendM[0] + pendM[1], pendingHodEndorsements: pendH[0] + pendH[1], reviewTurnaroundHoursAvg: turnaround,
    portfolioCompletionPct: sids.length ? Math.round((100 * [...semsCovered.values()].reduce((a, s) => a + s.size, 0)) / (sids.length * 8)) : 0,
    extracurricularParticipation: { studentsWithActivity: new Set(acts.map((a) => String(a.student))).size, totalActivities: acts.length },
    studentsNeedingSupportiveFollowUp: [...new Set(recs.filter((r: any) => r.deadline && r.deadline < now).map((r: any) => String(r.student)))].length });
});
async function mentorTurnaroundHours(sids: any[]) {
  const recs = await AssessmentRecord.find({ student: { $in: sids } }).select('_id').lean(); const ids = recs.map((r) => r._id);
  const reviews = await ReviewRecord.find({ recordId: { $in: ids }, level: 'mentor' }).lean(); if (!reviews.length) return null;
  const versions = await RecordVersion.find({ recordId: { $in: ids } }).lean(); const vm = new Map(versions.map((v) => [`${v.recordId}-${v.version}`, +v.createdAt]));
  const diffs = reviews.map((r) => (+r.createdAt - (vm.get(`${r.recordId}-${r.version}`) ?? +r.createdAt)) / 3600000);
  return Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
}

// ---------- People lists for the assignment screens (own department only) ----------
hodAdmin.get('/professors', async (req, res) => {
  const st = z.enum(['active', 'awaiting_approval', 'suspended']).catch('active').parse(req.query.status);
  res.json(await User.find({ role: 'professor', status: st, department: req.user.department }).select('fullName email status').sort('fullName').lean());
});
hodAdmin.get('/students', async (req, res) => {
  const students = await User.find({ role: 'student', status: 'active', department: req.user.department }).select('fullName email').sort('fullName').limit(1000).lean();
  const as = await MentorAssignment.find({ active: true, student: { $in: students.map((s) => s._id) } }).lean(); const profiles = await StudentProfile.find({ user: { $in: students.map((s) => s._id) } }).lean();
  res.json(students.map((s) => ({ ...s, mentor: as.find((a) => String(a.student) === String(s._id))?.mentor ?? null, usn: profiles.find((p) => String(p.user) === String(s._id))?.usn, semester: profiles.find((p) => String(p.user) === String(s._id))?.currentSemester })));
});
