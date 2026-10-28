import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Subject } from '../models/Subject.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { StudentActivity } from '../models/StudentActivity.js';
import { StudentGoal } from '../models/StudentGoal.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { MentorRecommendation } from '../models/MentorRecommendation.js';
import { canViewStudent } from '../services/access.js';
import { menteeIds } from '../services/scope.js';
import { audit } from '../services/audit.js';

export const reportsRouter = Router();
reportsRouter.use('/reports', authenticate);
const LABEL: Record<string, string> = { draft: 'Draft (student-entered)', awaiting_mentor_review: 'Awaiting mentor review', changes_requested: 'Changes requested', pending_hod_endorsement: 'Mentor verified; pending HOD endorsement',
  hod_endorsed: 'HOD endorsed', officially_verified: 'Officially verified', rejected: 'Rejected' };
// Reports contain student-entered data labelled with its verification status. Private mentor notes, reflections and admin notes are never included.
const safeCell = (v: any) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v); // blocks spreadsheet formula injection

reportsRouter.get('/reports/assessments.xlsx', async (req, res) => {
  const u = req.user; let studentIds: any[];
  if (u.role === 'student') studentIds = [u._id];
  else if (u.role === 'professor') studentIds = await menteeIds(u._id);
  else studentIds = (await User.find({ role: 'student', department: u.department }).select('_id').lean()).map((x) => x._id);
  const [users, subjects, recs] = await Promise.all([User.find({ _id: { $in: studentIds } }).select('fullName email').lean(), Subject.find({ student: { $in: studentIds } }).lean(), AssessmentRecord.find({ student: { $in: studentIds } }).lean()]);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Assessments');
  ws.columns = ['Student', 'Email', 'Semester', 'Subject code', 'Subject', 'MSE1', 'MSE2', 'TASK1', 'TASK2', 'TASK3', 'Task subtotal', 'Verification status', 'Version'].map((header) => ({ header, width: 18 }));
  ws.getRow(1).font = { bold: true };
  for (const r of recs) { const s = subjects.find((x) => String(x._id) === String(r.subject)); const us = users.find((x) => String(x._id) === String(r.student));
    ws.addRow([us?.fullName, us?.email, r.semester, s?.code, s?.name, r.mse1, r.mse2, r.task1, r.task2, r.task3, r.taskSubtotal, LABEL[r.status] ?? r.status, r.version].map(safeCell)); }
  await audit({ actor: u._id, actorRole: u.role, action: 'report.assessments_xlsx', next: { rows: recs.length } });
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="assessments.xlsx"', 'Cache-Control': 'private, no-store' });
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

reportsRouter.get('/reports/portfolio/:studentId.pdf', async (req, res) => {
  const id = z.string().regex(/^[a-f\d]{24}$/i).safeParse(req.params.studentId);
  if (!id.success || !(await canViewStudent(req.user, id.data))) return res.status(404).json({ error: 'Not found' });
  const [stu, prof, subjects, recs, acts, goals] = await Promise.all([User.findById(id.data).lean(), StudentProfile.findOne({ user: id.data }).lean(), Subject.find({ student: id.data }).sort('semester code').lean(),
    AssessmentRecord.find({ student: id.data }).lean(), StudentActivity.find({ student: id.data }).sort('semester').lean(), StudentGoal.find({ student: id.data }).lean()]);
  const doc = new PDFDocument({ margin: 50 }); const chunks: Buffer[] = []; doc.on('data', (c) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on('end', () => r()));
  doc.fontSize(18).text('Student Portfolio', { align: 'center' }).fontSize(9).fillColor('#555').text('Independent project; not an official institutional record. Statuses show how each entry was verified.', { align: 'center' }).fillColor('#000').moveDown();
  doc.fontSize(12).text(`${stu?.fullName}  (${prof?.usn ?? '-'})`).fontSize(10).text(`Semester ${prof?.currentSemester ?? '-'} | Admission year ${prof?.admissionYear ?? '-'}`).moveDown();
  for (let sem = 1; sem <= 8; sem++) {
    const subs = subjects.filter((s) => s.semester === sem); const as = acts.filter((a) => a.semester === sem); if (!subs.length && !as.length) continue;
    doc.fontSize(13).text(`Semester ${sem}`, { underline: true });
    for (const s of subs) { const r = recs.find((x) => String(x.subject) === String(s._id)); doc.fontSize(10).text(`${s.code} ${s.name}: MSE1 ${r?.mse1 ?? '-'}, MSE2 ${r?.mse2 ?? '-'}, Tasks ${r?.task1 ?? '-'}/${r?.task2 ?? '-'}/${r?.task3 ?? '-'} (subtotal ${r?.taskSubtotal ?? '-'}) [${LABEL[r?.status ?? 'draft']}]`); }
    for (const a of as) doc.fontSize(10).text(`Activity: ${a.name} (${a.category.replace(/_/g, ' ')}) [${LABEL[a.status]}]`);
    doc.moveDown(0.5);
  }
  if (goals.length) { doc.fontSize(13).text('Goals', { underline: true }); for (const g of goals) doc.fontSize(10).text(`${g.title} - ${g.status.replace('_', ' ')}, ${g.progress}%`); }
  doc.end(); await done;
  await audit({ actor: req.user._id, actorRole: req.user.role, action: 'report.portfolio_pdf', recordType: 'User', recordId: id.data });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="portfolio.pdf"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.send(Buffer.concat(chunks));
});

reportsRouter.get('/reports/mentor-wise', async (req, res) => {
  if (req.user.role !== 'hod') return res.status(403).json({ error: 'Forbidden' });
  const mentors = await User.find({ role: 'professor', status: 'active', department: req.user.department }).select('fullName email').lean(); const now = new Date();
  res.json(await Promise.all(mentors.map(async (m) => { const ids = await menteeIds(m._id);
    const [aw, ac, recs] = await Promise.all([AssessmentRecord.countDocuments({ student: { $in: ids }, status: 'awaiting_mentor_review' }), StudentActivity.countDocuments({ student: { $in: ids }, status: 'awaiting_mentor_review' }),
      MentorRecommendation.find({ student: { $in: ids }, status: { $in: ['proposed', 'accepted', 'in_progress', 'evidence_submitted'] } }).lean()]);
    return { mentor: m.fullName, email: m.email, mentees: ids.length, awaitingReview: aw + ac, overdueRecommendations: recs.filter((r: any) => r.deadline && r.deadline < now).length }; })));
});
