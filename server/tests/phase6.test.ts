import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import argon2 from 'argon2';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nmamit-uploads-'));
import { createApp } from '../src/app.js';
import { seedDepartments } from '../src/seed/departments.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { UploadedDocument } from '../src/models/UploadedDocument.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { subjectFor } from './helpers.js';

const app = createApp(); const PW = 'Str0ngPassw0rd!'; let deptA: any, deptB: any, hash: string; const ids: Record<string, any> = {};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
async function mk(key: string, role: any, dept: any, extra: any = {}) { ids[key] = await User.create({ email: `${key}@nmamit.in`, fullName: key, role, status: 'active', department: dept._id, passwordHash: hash, ...extra }); }
async function as(key: string) { const a = request.agent(app); expect((await a.post('/api/auth/login').send({ email: `${key}@nmamit.in`, password: PW })).status).toBe(200); return a; }
async function world() {
  for (const c of ['users', 'mentorassignments', 'subjects', 'assessmentrecords', 'studentactivities', 'recordversions', 'reviewrecords', 'endorsements', 'notifications', 'uploadeddocuments', 'fileblobs', 'academiccalendarevents', 'auditlogs'])
    await mongoose.connection.collection(c).deleteMany({});
  await mk('stu1', 'student', deptA); await mk('stu2', 'student', deptA); await mk('profA', 'professor', deptA); await mk('profA2', 'professor', deptA);
  await mk('hodA', 'hod', deptA); await mk('hodB', 'hod', deptB);
  await (await as('hodA')).post('/api/hod/assignments').send({ student: String(ids.stu1._id), mentor: String(ids.profA._id) }).expect(201);
}
async function newAssessment(s: any) {
  const sub = await subjectFor(s, { code: 'CS501', name: 'OS' });
  return (await s.put(`/api/student/subjects/${sub._id}/assessment`).send({ mse1: 18, task1: 3 })).body;
}
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await mongoose.connection.dropDatabase(); await seedDepartments();
  const d = await Department.find().sort('name'); deptA = d[0]; deptB = d[1]; hash = await argon2.hash(PW, { type: argon2.argon2id }); });
beforeEach(world); afterAll(async () => { await mongoose.disconnect(); });

describe('notifications', () => {
  it('lists own notifications, marks read, and cannot touch someone else\'s', async () => {
    const s = await as('stu1'); const a = await newAssessment(s); await s.post(`/api/student/assessments/${a._id}/submit`);
    const m = await as('profA'); const list = (await m.get('/api/notifications')).body;
    expect(list.unread).toBe(1);
    expect((await (await as('profA2')).post(`/api/notifications/${list.items[0]._id}/read`)).status).toBe(404);
    expect((await m.post(`/api/notifications/${list.items[0]._id}/read`)).status).toBe(200);
    expect((await m.get('/api/notifications')).body.unread).toBe(0);
  });
  it('requires login', async () => { expect((await request(app).get('/api/notifications')).status).toBe(401); });
});

describe('timeline', () => {
  it('is visible to the owner, active mentor and department HOD, and hidden from everyone else', async () => {
    const s = await as('stu1'); const a = await newAssessment(s); await s.post(`/api/student/assessments/${a._id}/submit`);
    await (await as('profA')).post(`/api/mentor/assessments/${a._id}/review`).send({ decision: 'verify', version: 1 });
    const url = `/api/timeline/AssessmentRecord/${a._id}`;
    const own = (await s.get(url)).body; expect(own.events.map((e: any) => e.kind)).toEqual(['version', 'review', 'endorsement']);
    expect(JSON.stringify(own)).not.toContain('profA'); // reviewer identity hidden from students
    expect(JSON.stringify((await (await as('profA')).get(url)).body)).toContain('profA');
    expect((await (await as('hodA')).get(url)).status).toBe(200);
    for (const who of ['stu2', 'profA2', 'hodB']) expect((await (await as(who)).get(url)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe('audit access', () => {
  it('users see only their own; HODs see department scope; students and professors cannot read the full log', async () => {
    const s = await as('stu1'); await newAssessment(s);
    expect((await s.get('/api/audit/mine')).body.length).toBeGreaterThan(0);
    expect((await s.get('/api/audit')).status).toBe(403); expect((await (await as('profA')).get('/api/audit')).status).toBe(403);
    expect((await (await as('hodA')).get('/api/audit')).body.items.some((i: any) => i.action === 'assessment.create')).toBe(true);
    expect((await (await as('hodB')).get('/api/audit')).body.items.some((i: any) => i.action === 'assessment.create')).toBe(false);
  });
});

describe('documents', () => {
  async function upload(s: any, a: any, buf = PDF, name = 'marks.pdf') {
    return s.post('/api/documents').field('recordType', 'AssessmentRecord').field('recordId', String(a._id)).attach('file', buf, name);
  }
  it('stores a PDF privately and serves it only to authorised viewers via authenticated download', async () => {
    const s = await as('stu1'); const a = await newAssessment(s); const up = await upload(s, a); expect(up.status).toBe(201);
    const doc = await UploadedDocument.findById(up.body.id); expect(doc!.storageKey).not.toContain('marks'); // random key, not the filename
    const dl = await s.get(`/api/documents/${up.body.id}/download`);
    expect(dl.status).toBe(200); expect(dl.headers['content-disposition']).toMatch(/attachment/); expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(dl.body).equals(PDF)).toBe(true);
    expect((await (await as('profA')).get(`/api/documents/${up.body.id}/download`)).status).toBe(200);
    expect((await (await as('hodA')).get(`/api/documents/${up.body.id}/download`)).status).toBe(200);
    for (const who of ['stu2', 'profA2', 'hodB']) expect((await (await as(who)).get(`/api/documents/${up.body.id}/download`)).status).toBe(404);
    expect((await request(app).get(`/api/documents/${up.body.id}/download`)).status).toBe(401);
  });
  it('rejects non-allowed content even when the filename or header claims PDF; enforces the 5 MB limit', async () => {
    const s = await as('stu1'); const a = await newAssessment(s);
    expect((await upload(s, a, Buffer.from('<script>alert(1)</script>'), 'evil.pdf')).status).toBe(415);
    expect((await upload(s, a, Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024 + 10)]), 'big.pdf')).status).toBe(413);
  });
  it("a student cannot attach files to another student's record; staff cannot upload", async () => {
    const a = await newAssessment(await as('stu1'));
    expect((await upload(await as('stu2'), a)).status).toBe(404);
    expect((await upload(await as('profA'), a)).status).toBe(403);
  });
  it('removal is a soft delete that is audited and blocks further download', async () => {
    const s = await as('stu1'); const a = await newAssessment(s); const up = await upload(s, a);
    expect((await (await as('stu2')).delete(`/api/documents/${up.body.id}`)).status).toBe(404);
    expect((await s.delete(`/api/documents/${up.body.id}`)).status).toBe(200);
    expect((await s.get(`/api/documents/${up.body.id}/download`)).status).toBe(404);
    expect(await UploadedDocument.countDocuments({ _id: up.body.id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'document.remove' })).toBe(1);
  });
  it('lists documents only for viewers allowed to see the record', async () => {
    const s = await as('stu1'); const a = await newAssessment(s); await upload(s, a);
    const q = `/api/documents?recordType=AssessmentRecord&recordId=${a._id}`;
    expect((await s.get(q)).body).toHaveLength(1); expect((await (await as('stu2')).get(q)).status).toBe(404);
  });
});

describe('database storage driver (for hosts with ephemeral disks)', () => {
  it('stores and serves files from MongoDB, with the same permission checks', async () => {
    process.env.STORAGE_DRIVER = 'mongo';
    try {
      const s = await as('stu1'); const a = await newAssessment(s);
      const up = await s.post('/api/documents').field('recordType', 'AssessmentRecord').field('recordId', String(a._id)).attach('file', PDF, 'marks.pdf'); expect(up.status).toBe(201);
      const doc = await UploadedDocument.findById(up.body.id); expect(await mongoose.connection.collection('fileblobs').countDocuments({ key: doc!.storageKey })).toBe(1);
      expect(fs.existsSync(path.join(process.env.UPLOAD_DIR!, doc!.storageKey))).toBe(false); // nothing written to disk
      const dl = await s.get(`/api/documents/${up.body.id}/download`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
      expect(dl.status).toBe(200); expect((dl.body as Buffer).equals(PDF)).toBe(true);
      expect((await (await as('stu2')).get(`/api/documents/${up.body.id}/download`)).status).toBe(404);
    } finally { delete process.env.STORAGE_DRIVER; }
  });
});

describe('academic calendar', () => {
  it('HODs publish events for their own department; everyone sees only their department\'s events', async () => {
    const ev = { title: 'MSE1', type: 'mse', date: '2026-11-10', semester: 5 };
    expect((await (await as('hodA')).post('/api/calendar').send(ev)).status).toBe(201);
    expect((await (await as('hodA')).post('/api/calendar').send({ ...ev, institutionWide: true })).status).toBe(400); // no institution-wide events
    for (const who of ['stu1', 'profA']) expect((await (await as(who)).post('/api/calendar').send(ev)).status).toBe(403);
    expect((await (await as('stu1')).get('/api/calendar')).body.map((e: any) => e.title)).toEqual(['MSE1']);
    expect((await (await as('hodB')).get('/api/calendar')).body).toEqual([]); // no leakage of department A's event
  });
});
