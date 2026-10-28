import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { CurriculumCourse } from '../models/CurriculumCourse.js';
import { audit } from '../services/audit.js';
import { hasMseFor } from '../services/curriculum.js';

// HODs keep their own branch's curriculum: add courses, deactivate them, copy a batch's scheme to the next batch, or import a CSV.
export const hodCurriculum = Router();
hodCurriculum.use(authenticate, requireRole('hod'));
const oid = z.string().regex(/^[a-f\d]{24}$/i);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
const num = z.coerce.number().min(0).max(1000);
const courseIn = z.object({
  admissionYear: z.coerce.number().int().min(2000).max(2100), code: z.string().trim().min(3).max(20), title: z.string().trim().min(2).max(200), category: z.string().trim().min(2).max(20),
  l: num.default(0), t: num.default(0), p: num.default(0), credits: num.max(30), cie: num.max(500), see: num.max(500).default(0),
  semester: z.coerce.number().int().min(1).max(8), slot: z.string().max(20).optional(), group: z.enum(['G1', 'G2']).optional(), stream: z.string().max(100).optional(), note: z.string().max(300).optional(),
}).strict();

hodCurriculum.get('/curriculum', async (req, res) => {
  const y = z.coerce.number().int().safeParse(req.query.admissionYear);
  const f: any = { department: req.user.department }; if (y.success) f.admissionYear = y.data;
  const items = await CurriculumCourse.find(f).sort('admissionYear semester table code').lean();
  res.json({ years: [...new Set((await CurriculumCourse.find({ department: req.user.department }).select('admissionYear').lean()).map((c) => c.admissionYear))].sort(), items });
});
hodCurriculum.post('/curriculum', async (req, res) => {
  const p = courseIn.safeParse(req.body); if (!p.success) return res.status(400).json({ error: 'Validation failed', details: p.error.flatten().fieldErrors });
  const code = p.data.code.toUpperCase();
  if (await CurriculumCourse.exists({ admissionYear: p.data.admissionYear, department: req.user.department, code })) return res.status(409).json({ error: 'This course code already exists for that batch.' });
  const c = await CurriculumCourse.create({ ...p.data, code, department: req.user.department, hasMse: hasMseFor(p.data) });
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'curriculum.add_course', recordType: 'CurriculumCourse', recordId: String(c._id), next: { code, admissionYear: p.data.admissionYear } });
  res.status(201).json(c);
});
for (const action of ['activate', 'deactivate'] as const) {
  hodCurriculum.post(`/curriculum/:id/${action}`, async (req, res) => {
    const id = oid.safeParse(req.params.id); const c = id.success ? await CurriculumCourse.findOne({ _id: id.data, department: req.user.department }) : null;
    if (!c) return res.status(404).json({ error: 'Not found' });
    c.active = action === 'activate'; await c.save();
    await audit({ actor: req.user._id, actorRole: 'hod', action: `curriculum.${action}`, recordType: 'CurriculumCourse', recordId: String(c._id) });
    res.json(c);
  });
}
// Start a new batch from an existing one (then adjust). Students are not affected until they load a semester.
hodCurriculum.post('/curriculum/copy', async (req, res) => {
  const p = z.object({ fromYear: z.number().int().min(2000).max(2100), toYear: z.number().int().min(2000).max(2100) }).strict().safeParse(req.body);
  if (!p.success || p.data.fromYear === p.data.toYear) return res.status(400).json({ error: 'Choose two different batch years.' });
  if (await CurriculumCourse.exists({ admissionYear: p.data.toYear, department: req.user.department })) return res.status(409).json({ error: `A curriculum for ${p.data.toYear} already exists.` });
  const src = await CurriculumCourse.find({ admissionYear: p.data.fromYear, department: req.user.department }).lean();
  if (!src.length) return res.status(404).json({ error: `No curriculum found for ${p.data.fromYear}.` });
  await CurriculumCourse.insertMany(src.map(({ _id, createdAt, updatedAt, ...c }) => ({ ...c, admissionYear: p.data.toYear })));
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'curriculum.copy_batch', recordType: 'CurriculumCourse', next: p.data });
  res.status(201).json({ copied: src.length });
});
// CSV columns: code,title,category,semester,credits,l,t,p,cie,see  (core courses; electives are added one by one)
hodCurriculum.post('/curriculum/import', upload.single('file'), async (req, res) => {
  const y = z.coerce.number().int().min(2000).max(2100).safeParse(req.body?.admissionYear);
  if (!req.file || !y.success) return res.status(400).json({ error: 'Choose a CSV file and a batch year.' });
  let rows: any[]; try { rows = parse(req.file.buffer, { columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true }); } catch { return res.status(400).json({ error: 'Could not read that CSV.' }); }
  if (rows.length > 300) return res.status(400).json({ error: 'At most 300 rows per import.' });
  const out = { created: 0, skipped: 0, invalid: [] as number[] };
  for (const [i, r] of rows.entries()) {
    const p = courseIn.safeParse({ admissionYear: y.data, code: r.code, title: r.title, category: r.category, semester: r.semester, credits: r.credits, l: r.l || 0, t: r.t || 0, p: r.p || 0, cie: r.cie, see: r.see || 0 });
    if (!p.success) { out.invalid.push(i + 2); continue; }
    const code = p.data.code.toUpperCase();
    if (await CurriculumCourse.exists({ admissionYear: y.data, department: req.user.department, code })) { out.skipped++; continue; }
    await CurriculumCourse.create({ ...p.data, code, department: req.user.department, hasMse: hasMseFor(p.data) }); out.created++;
  }
  await audit({ actor: req.user._id, actorRole: 'hod', action: 'curriculum.import', recordType: 'CurriculumCourse', next: { ...out, invalid: out.invalid.length } });
  res.status(201).json(out);
});
