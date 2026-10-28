// DEVELOPMENT ONLY. Creates entirely fictional users so every role can be tried locally, using the REAL ISE syllabus courses.
// Emails use the reserved ".invalid" TLD so they can never belong to a real person. Refuses to run in production.
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { env, isProd } from '../config/env.js';
import { Department } from '../models/Department.js';
import { User } from '../models/User.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Subject } from '../models/Subject.js';
import { StudentActivity } from '../models/StudentActivity.js';
import { StudentGoal } from '../models/StudentGoal.js';
import { MentorRecommendation } from '../models/MentorRecommendation.js';
import { MentorMeeting } from '../models/MentorMeeting.js';
import { MentorNote } from '../models/MentorNote.js';
import { AcademicCalendarEvent } from '../models/AcademicCalendarEvent.js';
import { ensureReferenceData, chooseElective, curriculumFor, loadSemester } from '../services/curriculum.js';
import { assignMentor } from '../services/assignment.js';
import { saveAssessment, submitAssessment, reviewAssessment } from '../services/assessments.js';
import { saveVersioned, submitVersioned, reviewVersioned } from '../services/records.js';

if (isProd) { console.error('Refusing to seed demo data in production.'); process.exit(1); }
export const DEMO_PASSWORD = 'DevOnly-ChangeMe-123!'; // documented in the README; never reuse it anywhere real
const D = '@demo.invalid';

await mongoose.connect(env.MONGODB_URI);
await ensureReferenceData();
const dept = (await Department.findOne({ code: 'IS' }))!;
const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
const mk = async (email: string, fullName: string, role: any) =>
  (await User.findOne({ email: email + D })) ?? User.create({ email: email + D, fullName, role, status: 'active', department: dept._id, passwordHash: hash });

const hod = (await mk('demo.hod', 'Demo HOD (fictional)', 'hod'))!;
const p1 = (await mk('demo.mentor1', 'Demo Mentor One (fictional)', 'professor'))!;
const p2 = (await mk('demo.mentor2', 'Demo Mentor Two (fictional)', 'professor'))!;
const students: any[] = [];
for (const [i, name] of ['Demo Student A', 'Demo Student B', 'Demo Student C'].entries()) {
  const s = (await mk(`demo.student${i + 1}`, `${name} (fictional)`, 'student'))!;
  await StudentProfile.updateOne({ user: s._id }, { $setOnInsert: { user: s._id, usn: `DEMO00${i + 1}`, admissionYear: 2023, currentYear: 3, currentSemester: 5, firstYearGroup: i === 1 ? 'II' : 'I', section: 'A' } }, { upsert: true });
  students.push(s);
}
if (!(await Subject.exists({ student: students[0]._id }))) {
  await assignMentor(hod, students[0]._id, p1._id); await assignMentor(hod, students[1]._id, p1._id); // Student C is deliberately left without a mentor
  for (const [si, stu] of students.entries()) {
    const prof = (await StudentProfile.findOne({ user: stu._id }).lean())!;
    const ctx = { _id: stu._id, department: stu.department, admissionYear: prof.admissionYear, firstYearGroup: prof.firstYearGroup as 'I' | 'II', lateralEntry: false };
    for (let sem = 1; sem <= 5; sem++) await loadSemester(ctx, sem);
    const view = await curriculumFor(ctx);
    const pick = async (slot: string, nth = 0) => { const sl = view.semesters.flatMap((s) => s.slots).find((x) => x.slot === slot)!; await chooseElective(ctx, slot, String(sl.options[nth]._id)); };
    await pick('VEC'); await pick('PEC-I', si); await pick('AEC-P', si);
    const owner = p1;
    for (const sub of await Subject.find({ student: stu._id }).sort('semester code')) {
      const base = 8 + ((sub.semester * 3 + sub.code.length * 2 + si * 4) % 9);
      const input: any = sub.hasMse ? { mse1: base, mse2: Math.min(base + 2, 20), task1: 3, task2: 4, task3: 2 } : { cieMarks: Math.round((sub.cieMax ?? 50) * (0.7 + 0.05 * si)) };
      const r: any = await saveAssessment(stu, sub, input);
      if (si < 2 && sub.semester <= 4) { // earlier semesters (for students who have a mentor) carry a full verification history
        await submitAssessment(stu, r.rec); await reviewAssessment(owner, 'mentor', r.rec, 'verify', 1);
        if (sub.semester <= 3) await reviewAssessment(hod, 'hod', r.rec, 'endorse', 1);
      }
    }
  }
  const act: any = await saveVersioned(StudentActivity, 'StudentActivity', new StudentActivity({ student: students[0]._id }), { semester: 4, category: 'hackathon', name: 'Demo Hackathon', achievement: 'Finalist (fictional)', skills: ['Teamwork'] }, students[0], ['name', 'achievement']);
  await submitVersioned('StudentActivity', act.rec, students[0]); await reviewVersioned('StudentActivity', p1, 'mentor', act.rec, 'verify', 1);
  const goal = await StudentGoal.create({ student: students[0]._id, title: 'Improve OS marks', category: 'improve_mse', priority: 'high', targetDate: new Date(Date.now() + 30 * 864e5), successCriteria: 'MSE2 above MSE1', progress: 40, status: 'in_progress', relatedSemester: 5 });
  await MentorRecommendation.create({ student: students[0]._id, mentor: p1._id, title: 'Practise past MSE papers', reason: 'Build exam confidence', priority: 'medium', deadline: new Date(Date.now() + 10 * 864e5), followUpDate: new Date(Date.now() + 5 * 864e5), relatedGoal: goal._id });
  await MentorNote.create({ student: students[0]._id, author: p1._id, type: 'student_visible', text: 'Nice steady progress this semester (fictional).' });
  await MentorMeeting.create({ student: students[0]._id, mentor: p1._id, scheduledAt: new Date(Date.now() + 3 * 864e5), agenda: 'Review MSE results' });
  await AcademicCalendarEvent.create({ department: dept._id, title: 'MSE1 (demo date)', type: 'mse', date: new Date(Date.now() + 14 * 864e5), semester: 5, createdBy: hod._id });
}
console.log(`Demo data ready. Department: ${dept.name}\nLogin emails (password in README): demo.hod${D}, demo.mentor1${D}, demo.mentor2${D}, demo.student1${D} ... demo.student3${D}\nDemo Student C has no mentor yet, so a faculty member can pick them under Find mentees.`);
await mongoose.disconnect();
