import { RecordVersion } from '../models/RecordVersion.js';
import { ReviewRecord } from '../models/ReviewRecord.js';
import { Endorsement } from '../models/Endorsement.js';
import { audit } from './audit.js';
import { activeMentorOf, notify } from './assessments.js';

// Generic versioned save + submit + review for student-entered records that follow the standard verification pipeline.
export async function saveVersioned(Model: any, recordType: string, rec: any, input: any, student: any, snapshotFields: string[]) {
  const isNew = rec.isNew;
  if (rec.status === 'awaiting_mentor_review') return { error: 'Record is under review. Wait for the mentor decision before editing.', code: 409 };
  if (rec.status === 'officially_verified') return { error: 'Officially verified records cannot be edited here.', code: 409 };
  const previous = isNew ? null : { version: rec.version, status: rec.status };
  const wasReviewed = ['pending_hod_endorsement', 'hod_endorsed'].includes(rec.status);
  rec.set(input);
  if (!isNew) rec.version += 1;
  if (wasReviewed) rec.status = 'awaiting_mentor_review'; else if (rec.status === 'rejected') rec.status = 'draft';
  await rec.save();
  await RecordVersion.create({ recordType, recordId: rec._id, version: rec.version, status: rec.status, createdBy: student._id, createdByRole: 'student',
    snapshot: Object.fromEntries(snapshotFields.map((f) => [f, rec.get(f)])) });
  await audit({ actor: student._id, actorRole: 'student', action: `${recordType}.${isNew ? 'create' : 'edit'}`, recordType, recordId: String(rec._id), previous, next: { version: rec.version, status: rec.status }, version: rec.version });
  if (wasReviewed) { const a = await activeMentorOf(student._id); if (a) await notify(a.mentor, `${student.fullName} edited an endorsed record; it needs review again.`); }
  return { rec };
}

export async function submitVersioned(recordType: string, rec: any, student: any) {
  if (!['draft', 'changes_requested'].includes(rec.status)) return { error: `Cannot submit from status ${rec.status}`, code: 409 };
  const previous = { status: rec.status }; rec.status = 'awaiting_mentor_review'; await rec.save();
  await audit({ actor: student._id, actorRole: 'student', action: `${recordType}.submit`, recordType, recordId: String(rec._id), previous, next: { status: rec.status }, version: rec.version });
  const a = await activeMentorOf(student._id); if (a) await notify(a.mentor, `${student.fullName} submitted a record for review.`);
  return { rec };
}

export async function reviewVersioned(recordType: string, reviewer: any, level: 'mentor' | 'hod', rec: any, decision: string, version: number, comment?: string) {
  const map: any = {
    mentor: { from: 'awaiting_mentor_review', verify: ['pending_hod_endorsement', 'verified'], request_changes: ['changes_requested', 'changes_requested'], reject: ['rejected', 'rejected'] },
    hod: { from: 'pending_hod_endorsement', endorse: ['hod_endorsed', 'endorsed'], request_changes: ['changes_requested', 'changes_requested'], reject: ['rejected', 'rejected'] } };
  const target = decision === 'from' ? undefined : map[level][decision];
  if (!target) return { error: 'Unknown decision', code: 400 };
  if (rec.version !== version) return { error: 'This record changed since you opened it. Reload and review the latest version.', code: 409 };
  if (rec.status !== map[level].from) return { error: `Record is not awaiting ${level} review (status: ${rec.status})`, code: 409 };
  if (!['verify', 'endorse'].includes(decision) && !comment?.trim()) return { error: 'A comment is required when requesting changes or rejecting', code: 400 };
  const [status, d] = target as [string, string]; const previous = { status: rec.status };
  rec.status = status; await rec.save();
  await ReviewRecord.create({ recordType, recordId: rec._id, version: rec.version, level, decision: d as any, reviewer: reviewer._id, comment });
  if (d === 'verified' || d === 'endorsed') await Endorsement.create({ recordType, recordId: rec._id, version: rec.version, level, endorser: reviewer._id });
  await audit({ actor: reviewer._id, actorRole: reviewer.role, action: `${recordType}.${level}.${d}`, recordType, recordId: String(rec._id), previous, next: { status }, reason: comment, version: rec.version });
  await notify(rec.student, `Your record was ${d.replace('_', ' ')} by your ${level === 'hod' ? 'HOD' : 'mentor'}.`);
  return { rec };
}
