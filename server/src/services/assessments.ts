import { z } from 'zod';
import { AssessmentScheme } from '../models/AssessmentScheme.js';
import { AssessmentRecord } from '../models/AssessmentRecord.js';
import { RecordVersion } from '../models/RecordVersion.js';
import { ReviewRecord } from '../models/ReviewRecord.js';
import { Endorsement } from '../models/Endorsement.js';
import { Notification } from '../models/Notification.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { audit } from './audit.js';

export const marksInput = z.object({
  mse1: z.number().min(0).nullable().optional(), mse2: z.number().min(0).nullable().optional(),
  task1: z.number().min(0).nullable().optional(), task2: z.number().min(0).nullable().optional(), task3: z.number().min(0).nullable().optional(),
  cieMarks: z.number().min(0).nullable().optional(),
  comments: z.string().max(1000).optional(), improvementAreas: z.string().max(1000).optional(),
}).strict(); // unknown keys (status, version, student...) are rejected, so mass-assignment is impossible

export async function getScheme(department: any) {
  // Defaults from the Regulations 2023 (Appendix B): MSE out of 20 each; tasks 4 + 4 + 2 = 10.
  return (await AssessmentScheme.findOne({ department }).lean()) ?? { mse1Max: 20, mse2Max: 20, task1Max: 4, task2Max: 4, task3Max: 2 };
}

// Returns an error message, or null when valid. `course` says which marks apply: theory courses (hasMse) use MSE1, MSE2 and three tasks;
// labs, internships, projects and CIE-only courses use a single CIE mark with the course's own maximum.
export function validateMarks(m: Record<string, any>, s: any, course?: { hasMse?: boolean; cieMax?: number | null }): string | null {
  const hasMse = course?.hasMse ?? true;
  const keys = hasMse ? ['mse1', 'mse2', 'task1', 'task2', 'task3'] : ['cieMarks'];
  for (const k of ['mse1', 'mse2', 'task1', 'task2', 'task3', 'cieMarks']) if (!keys.includes(k) && m[k] != null) return hasMse ? 'This course uses MSE and task marks, not a single CIE mark.' : 'This course has no MSEs or tasks. Enter its CIE marks instead.';
  const limits: [string, number | null | undefined][] = hasMse ? [['mse1', s.mse1Max], ['mse2', s.mse2Max], ['task1', s.task1Max], ['task2', s.task2Max], ['task3', s.task3Max]] : [['cieMarks', course?.cieMax]];
  for (const [k, max] of limits) {
    const v = m[k];
    if (v == null) continue;
    if (!Number.isFinite(v) || v < 0) return `${k} must be a non-negative number`;
    if (max != null && v > max) return `${k} cannot exceed ${max}`;
  }
  return null;
}

export const subtotal = (r: any) => (r.task1 ?? 0) + (r.task2 ?? 0) + (r.task3 ?? 0);

export async function snapshot(rec: any, by: any, role: string) {
  await RecordVersion.create({ recordType: 'AssessmentRecord', recordId: rec._id, version: rec.version, status: rec.status,
    createdBy: by, createdByRole: role,
    snapshot: { mse1: rec.mse1, mse2: rec.mse2, task1: rec.task1, task2: rec.task2, task3: rec.task3, cieMarks: rec.cieMarks, taskSubtotal: rec.taskSubtotal,
      comments: rec.comments, improvementAreas: rec.improvementAreas } });
}

export async function notify(user: any, message: string, link?: string) { await Notification.create({ user, message, link }); }

export async function activeMentorOf(studentId: any) {
  return MentorAssignment.findOne({ student: studentId, active: true });
}

// Student saves marks. Edits after review/endorsement create a new version that needs fresh review.
export async function saveAssessment(student: any, subject: any, input: z.infer<typeof marksInput>) {
  let rec = await AssessmentRecord.findOne({ subject: subject._id });
  const isNew = !rec;
  if (!rec) rec = new AssessmentRecord({ student: student._id, subject: subject._id, semester: subject.semester, academicYear: subject.academicYear });
  if (rec.status === 'awaiting_mentor_review') return { error: 'Record is under review. Wait for the mentor decision before editing.', code: 409 as const };
  if (rec.status === 'officially_verified') return { error: 'Officially verified records cannot be edited here.', code: 409 as const };
  const previous = isNew ? null : { version: rec.version, status: rec.status, taskSubtotal: rec.taskSubtotal };
  const wasReviewed = ['pending_hod_endorsement', 'hod_endorsed'].includes(rec.status);
  Object.assign(rec, input);
  rec.taskSubtotal = subtotal(rec);
  if (!isNew) rec.version += 1;
  if (wasReviewed) rec.status = 'awaiting_mentor_review';
  else if (rec.status === 'rejected') rec.status = 'draft';
  await rec.save();
  await snapshot(rec, student._id, 'student');
  await audit({ actor: student._id, actorRole: 'student', action: isNew ? 'assessment.create' : 'assessment.edit', recordType: 'AssessmentRecord',
    recordId: String(rec._id), previous, next: { version: rec.version, status: rec.status, taskSubtotal: rec.taskSubtotal }, version: rec.version });
  if (wasReviewed) {
    const a = await activeMentorOf(student._id);
    if (a) await notify(a.mentor, `${student.fullName} edited an endorsed assessment; it needs review again.`, `/mentor/assessments/${rec._id}`);
  }
  return { rec };
}

export async function submitAssessment(student: any, rec: any) {
  if (!['draft', 'changes_requested'].includes(rec.status)) return { error: `Cannot submit from status ${rec.status}`, code: 409 as const };
  const previous = { status: rec.status };
  rec.status = 'awaiting_mentor_review';
  await rec.save();
  await audit({ actor: student._id, actorRole: 'student', action: 'assessment.submit', recordType: 'AssessmentRecord', recordId: String(rec._id), previous, next: { status: rec.status }, version: rec.version });
  const a = await activeMentorOf(student._id);
  if (a) await notify(a.mentor, `${student.fullName} submitted an assessment for review.`, `/mentor/assessments/${rec._id}`);
  return { rec };
}

const TRANSITIONS = {
  mentor: { from: 'awaiting_mentor_review', verify: ['pending_hod_endorsement', 'verified'], request_changes: ['changes_requested', 'changes_requested'], reject: ['rejected', 'rejected'] },
  hod: { from: 'pending_hod_endorsement', endorse: ['hod_endorsed', 'endorsed'], request_changes: ['changes_requested', 'changes_requested'], reject: ['rejected', 'rejected'] },
} as const;

export async function reviewAssessment(reviewer: any, level: 'mentor' | 'hod', rec: any, decision: string, version: number, comment?: string) {
  const t: any = TRANSITIONS[level];
  const target = t[decision];
  if (!target || decision === 'from') return { error: 'Unknown decision', code: 400 as const };
  if (rec.version !== version) return { error: 'This record changed since you opened it. Reload and review the latest version.', code: 409 as const };
  if (rec.status !== t.from) return { error: `Record is not awaiting ${level} review (status: ${rec.status})`, code: 409 as const };
  if (decision !== 'verify' && decision !== 'endorse' && !comment?.trim()) return { error: 'A comment is required when requesting changes or rejecting', code: 400 as const };
  const [newStatus, reviewDecision] = target;
  const previous = { status: rec.status };
  rec.status = newStatus; await rec.save();
  await ReviewRecord.create({ recordType: 'AssessmentRecord', recordId: rec._id, version: rec.version, level, decision: reviewDecision, reviewer: reviewer._id, comment });
  if (reviewDecision === 'verified' || reviewDecision === 'endorsed')
    await Endorsement.create({ recordType: 'AssessmentRecord', recordId: rec._id, version: rec.version, level, endorser: reviewer._id });
  await audit({ actor: reviewer._id, actorRole: reviewer.role, action: `assessment.${level}.${reviewDecision}`, recordType: 'AssessmentRecord', recordId: String(rec._id), previous, next: { status: newStatus }, reason: comment, version: rec.version });
  await notify(rec.student, `Your assessment was ${reviewDecision.replace('_', ' ')} by your ${level === 'hod' ? 'HOD' : 'mentor'}.`, `/student/assessments/${rec._id}`);
  return { rec };
}
