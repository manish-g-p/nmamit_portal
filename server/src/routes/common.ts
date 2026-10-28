import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { StudentActivity } from '../models/StudentActivity.js';
import { RecordVersion } from '../models/RecordVersion.js';
import { ReviewRecord } from '../models/ReviewRecord.js';
import { Endorsement } from '../models/Endorsement.js';
import { UploadedDocument } from '../models/UploadedDocument.js';
import { AcademicCalendarEvent } from '../models/AcademicCalendarEvent.js';
import { canViewStudent } from '../services/access.js';
import { getFile, putFile, sniff } from '../services/storage.js';
import { audit } from '../services/audit.js';

export const commonRouter = Router();
commonRouter.use(['/notifications', '/timeline', '/audit', '/documents', '/calendar'], authenticate);
const oid = z.string().regex(/^[a-f\d]{24}$/i);
const MODELS: Record<string, any> = { AssessmentRecord, StudentActivity };

// ---- Notifications ----
commonRouter.get('/notifications', async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort('-createdAt').limit(50).lean();
  res.json({ unread: items.filter((n) => !n.readAt).length, items });
});
commonRouter.post('/notifications/read-all', async (req, res) => { await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } }); res.json({ ok: true }); });
commonRouter.post('/notifications/:id/read', async (req, res) => {
  const id = oid.safeParse(req.params.id); if (!id.success) return res.status(400).json({ error: 'Invalid id' });
  const n = await Notification.findOneAndUpdate({ _id: id.data, user: req.user._id }, { $set: { readAt: new Date() } }, { returnDocument: 'after' });
  n ? res.json({ ok: true }) : res.status(404).json({ error: 'Not found' });
});

// ---- Timeline for one record: versions, reviews, endorsements ----
commonRouter.get('/timeline/:recordType/:id', async (req, res) => {
  const Model = MODELS[req.params.recordType]; const id = oid.safeParse(req.params.id);
  if (!Model || !id.success) return res.status(404).json({ error: 'Not found' });
  const rec = await Model.findById(id.data).lean();
  if (!rec || !(await canViewStudent(req.user, rec.student))) return res.status(404).json({ error: 'Not found' });
  const staff = req.user.role !== 'student';
  const [versions, reviews, endorsements] = await Promise.all([RecordVersion.find({ recordId: rec._id }).sort('version').lean(),
    ReviewRecord.find({ recordId: rec._id }).sort('createdAt').lean(), Endorsement.find({ recordId: rec._id }).sort('createdAt').lean()]);
  const names = new Map((await User.find({ _id: { $in: [...reviews.map((r) => r.reviewer), ...endorsements.map((e) => e.endorser)] } }).select('fullName').lean()).map((u) => [String(u._id), u.fullName]));
  const events = [...versions.map((v) => ({ at: v.createdAt, kind: 'version', version: v.version, status: v.status, by: v.createdByRole })),
    ...reviews.map((r) => ({ at: r.createdAt, kind: 'review', version: r.version, level: r.level, decision: r.decision, comment: r.comment, ...(staff ? { reviewer: names.get(String(r.reviewer)) } : {}) })),
    ...endorsements.map((e) => ({ at: e.createdAt, kind: 'endorsement', version: e.version, level: e.level, ...(staff ? { endorser: names.get(String(e.endorser)) } : {}) }))]
    .sort((a, b) => +new Date(a.at as any) - +new Date(b.at as any));
  res.json({ record: rec, events });
});

// ---- Audit: users read their own actions; HODs read their department's (institution managers read all) ----
commonRouter.get('/audit/mine', async (req, res) => {
  res.json(await AuditLog.find({ actor: req.user._id }).sort('-createdAt').limit(100).select('action recordType recordId createdAt').lean());
});
commonRouter.get('/audit', async (req, res) => {
  if (req.user.role !== 'hod') return res.status(403).json({ error: 'Forbidden' });
  const page = z.coerce.number().int().min(1).catch(1).parse(req.query.page); const limit = 50;
  const filter: any = {};
  filter.actor = { $in: (await User.find({ department: req.user.department }).select('_id').lean()).map((u) => u._id) };
  res.json({ page, items: await AuditLog.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit).lean() });
});

// ---- Private documents ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
commonRouter.post('/documents', upload.single('file'), async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  const p = z.object({ recordType: z.enum(['AssessmentRecord', 'StudentActivity']), recordId: oid }).safeParse(req.body);
  if (!p.success || !req.file) return res.status(400).json({ error: 'File, recordType and recordId are required' });
  const rec = await MODELS[p.data.recordType].findOne({ _id: p.data.recordId, student: req.user._id }); // must be the student's own record
  if (!rec) return res.status(404).json({ error: 'Not found' });
  const mime = sniff(req.file.buffer); // trust the bytes, not the client's Content-Type
  if (!mime) return res.status(415).json({ error: 'Only PDF, PNG or JPEG files are allowed' });
  const key = await putFile(req.file.buffer);
  const d = await UploadedDocument.create({ owner: req.user._id, student: req.user._id, recordType: p.data.recordType, recordId: rec._id, originalName: req.file.originalname.slice(0, 200),
    mime, size: req.file.size, sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'), storageKey: key });
  await audit({ actor: req.user._id, actorRole: 'student', action: 'document.upload', recordType: p.data.recordType, recordId: String(rec._id), next: { documentId: String(d._id), size: d.size } });
  res.status(201).json({ id: d._id, name: d.originalName, mime, size: d.size });
});
commonRouter.get('/documents', async (req, res) => {
  const p = z.object({ recordType: z.enum(['AssessmentRecord', 'StudentActivity']), recordId: oid }).safeParse(req.query);
  if (!p.success) return res.status(400).json({ error: 'Validation failed' });
  const rec = await MODELS[p.data.recordType].findById(p.data.recordId).lean();
  if (!rec || !(await canViewStudent(req.user, rec.student))) return res.status(404).json({ error: 'Not found' });
  res.json(await UploadedDocument.find({ recordId: rec._id, deletedAt: null }).select('originalName mime size createdAt').lean());
});
commonRouter.get('/documents/:id/download', async (req, res) => {
  const id = oid.safeParse(req.params.id); const d = id.success ? await UploadedDocument.findOne({ _id: id.data, deletedAt: null }) : null;
  if (!d || !(await canViewStudent(req.user, d.student))) return res.status(404).json({ error: 'Not found' });
  await audit({ actor: req.user._id, actorRole: req.user.role, action: 'document.download', recordType: 'UploadedDocument', recordId: String(d._id) });
  res.set({ 'Content-Type': d.mime!, 'Content-Disposition': `attachment; filename="document-${d._id}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  res.send(await getFile(d.storageKey)); // authorized every time; there is no permanent public link
});
commonRouter.delete('/documents/:id', async (req, res) => {
  const id = oid.safeParse(req.params.id); const d = id.success ? await UploadedDocument.findOne({ _id: id.data, student: req.user._id, deletedAt: null }) : null;
  if (!d || req.user.role !== 'student') return res.status(404).json({ error: 'Not found' });
  d.deletedAt = new Date(); d.deletedBy = req.user._id; await d.save();
  await audit({ actor: req.user._id, actorRole: 'student', action: 'document.remove', recordType: 'UploadedDocument', recordId: String(d._id) });
  res.json({ ok: true });
});

// ---- Academic calendar ----
commonRouter.get('/calendar', async (req, res) => {
  res.json(await AcademicCalendarEvent.find({ department: req.user.department }).sort('date').lean());
});
commonRouter.post('/calendar', async (req, res) => {
  if (req.user.role !== 'hod') return res.status(403).json({ error: 'Forbidden' });
  const p = z.object({ title: z.string().trim().min(2).max(150), type: z.enum(['mse', 'task', 'assignment', 'meeting_window', 'holiday', 'other']), date: z.coerce.date(),
    semester: z.number().int().min(1).max(8).optional(), description: z.string().max(1000).optional() }).strict().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Validation failed' });
  const e = await AcademicCalendarEvent.create({ ...p.data, department: req.user.department, createdBy: req.user._id });
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'calendar.create', recordType: 'AcademicCalendarEvent', recordId: String(e._id) });
  res.status(201).json(e);
});
