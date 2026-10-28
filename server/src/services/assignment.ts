import { User } from '../models/User.js';
import { MentorAssignment } from '../models/MentorAssignment.js';
import { audit } from './audit.js';
// Single implementation of mentor (re)assignment, used by the single and bulk routes. Old assignments are ended, never deleted.
export async function assignMentor(hod: any, studentId: any, mentorId: any): Promise<{ ok: true; id: any } | { ok: false; code: number; error: string }> {
  const dept = hod.department;
  const student = await User.findOne({ _id: studentId, role: 'student', status: 'active', department: dept });
  const mentor = await User.findOne({ _id: mentorId, role: 'professor', status: 'active', department: dept });
  if (!student || !mentor) return { ok: false, code: 404, error: 'Student or mentor not found in your department' };
  const current = await MentorAssignment.findOne({ student: student._id, active: true });
  if (current && String(current.mentor) === String(mentor._id)) return { ok: false, code: 409, error: 'Already assigned to this mentor' };
  if (current) { current.active = false; current.endedAt = new Date(); await current.save(); }
  const a = await MentorAssignment.create({ student: student._id, mentor: mentor._id, department: dept, assignedBy: hod._id });
  await audit({ actor: hod._id, actorRole: 'hod', action: current ? 'assignment.reassign' : 'assignment.create', recordType: 'MentorAssignment', recordId: String(a._id),
    previous: current ? { mentor: String(current.mentor) } : null, next: { mentor: String(mentor._id), student: String(student._id) } });
  return { ok: true, id: a._id };
}
