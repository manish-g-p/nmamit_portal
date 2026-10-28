// DEVELOPMENT ONLY. Creates production-ready data with real user roles and marks.
// Uses real names: Manisha GP (HOD), Tejas BN (Faculty), Aditya SN, Nagaraj CE, Raghu NC (Students)
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
import { FacultyProfile } from '../models/FacultyProfile.js';
import { ensureReferenceData, chooseElective, curriculumFor, loadSemester } from '../services/curriculum.js';
import { assignMentor } from '../services/assignment.js';
import { saveAssessment, submitAssessment, reviewAssessment } from '../services/assessments.js';
import { saveVersioned, submitVersioned, reviewVersioned } from '../services/records.js';

if (isProd) { console.error('Refusing to seed demo data in production.'); process.exit(1); }

const PRODUCTION_PASSWORD = 'Nmamit@2024'; // Change this to a secure password in production

await mongoose.connect(env.MONGODB_URI);
await ensureReferenceData();

// Get or create ISE department
const dept = (await Department.findOne({ code: 'IS' }))!;

console.log('🔄 Clearing existing user data...');
// Clear user-related data
await User.deleteMany({});
await StudentProfile.deleteMany({});
await Subject.deleteMany({});
await StudentActivity.deleteMany({});
await StudentGoal.deleteMany({});
await MentorRecommendation.deleteMany({});
await MentorMeeting.deleteMany({});
await MentorNote.deleteMany({});
await FacultyProfile.deleteMany({});
console.log('✅ Database cleared');

const hash = await argon2.hash(PRODUCTION_PASSWORD, { type: argon2.argon2id });

// Create users helper function
const createUser = async (email: string, fullName: string, role: 'student' | 'professor' | 'hod') => {
  const user = await User.create({
    email: email.toLowerCase().trim(),
    fullName,
    role,
    status: 'active',
    department: dept._id,
    passwordHash: hash
  });
  return user;
};

console.log('👤 Creating users...');

// Create HOD
const hod = await createUser('manisha.gp@nmamit.in', 'Manisha GP', 'hod');
console.log(`✅ HOD created: ${hod.fullName}`);

// Create Faculty Member
const faculty = await createUser('tejas.bn@nmamit.in', 'Tejas BN', 'professor');
console.log(`✅ Faculty created: ${faculty.fullName}`);

// Create Faculty Profile for Tejas
await FacultyProfile.create({
  user: faculty._id,
  fullName: 'Tejas BN',
  designation: 'Assistant Professor',
  department: dept._id,
  employeeId: 'NMAMIT-F001',
  importStatus: 'approved'
});

// Create Students
const studentsData = [
  { email: 'aditya.sn@nmamit.in', name: 'Aditya SN', usn: 'NMA23CS001', year: 3, semester: 5, group: 'I' },
  { email: 'nagaraj.ce@nmamit.in', name: 'Nagaraj CE', usn: 'NMA23CS002', year: 3, semester: 5, group: 'II' },
  { email: 'raghu.nc@nmamit.in', name: 'Raghu NC', usn: 'NMA23CS003', year: 3, semester: 5, group: 'I' }
];

const students: any[] = [];
for (const studentData of studentsData) {
  const student = await createUser(studentData.email, studentData.name, 'student');

  // Create student profile
  await StudentProfile.create({
    user: student._id,
    usn: studentData.usn,
    program: 'B.Tech',
    admissionYear: 2023,
    currentYear: studentData.year,
    currentSemester: studentData.semester,
    firstYearGroup: studentData.group,
    section: 'A',
    identityVerified: true
  });

  students.push(student);
  console.log(`✅ Student created: ${student.fullName} (${studentData.usn})`);
}

// Assign mentor
console.log('\n📚 Assigning mentors...');
for (const student of students) {
  await assignMentor(hod, student._id, faculty._id);
  console.log(`✅ ${student.fullName} assigned to ${faculty.fullName}`);
}

// Load curriculum and add marks
console.log('\n📖 Loading curriculum and adding marks...');
for (const [idx, student] of students.entries()) {
  const prof = (await StudentProfile.findOne({ user: student._id }).lean())!;
  const ctx = { _id: student._id, department: student.department, admissionYear: prof.admissionYear, firstYearGroup: prof.firstYearGroup as 'I' | 'II', lateralEntry: false };

  // Load semesters 1-5
  for (let sem = 1; sem <= 5; sem++) {
    await loadSemester(ctx, sem);
  }

  const view = await curriculumFor(ctx);

  // Choose electives
  const pick = async (slot: string, nth = 0) => {
    const sl = view.semesters.flatMap((s) => s.slots).find((x) => x.slot === slot)!;
    if (sl && sl.options[nth]) {
      await chooseElective(ctx, slot, String(sl.options[nth]._id));
    }
  };

  try {
    await pick('VEC');
    await pick('PEC-I', idx);
    await pick('AEC-P', idx);
  } catch (e) {
    console.log(`⚠️ Note: Some electives may not be available for ${student.fullName}`);
  }

  // Add marks for subjects
  for (const sub of await Subject.find({ student: student._id }).sort('semester code')) {
    // Generate realistic marks based on semester and student performance
    const baseMarks = 15 + (idx * 2); // Students have slightly different performance levels
    const semesterMultiplier = Math.max(0.7, 1 - (sub.semester - 5) * 0.1); // Better marks in later semesters

    const input: any = sub.hasMse
      ? {
          mse1: Math.round(baseMarks * semesterMultiplier),
          mse2: Math.round(Math.min(baseMarks + 3, 20) * semesterMultiplier),
          task1: 3,
          task2: 4,
          task3: 2
        }
      : {
          cieMarks: Math.round((sub.cieMax ?? 50) * (0.65 + 0.08 * idx) * semesterMultiplier)
        };

    const r: any = await saveAssessment(student, sub, input);

    // Submit and review assessments for earlier semesters
    if (idx < 2 && sub.semester <= 4) {
      await submitAssessment(student, r.rec);
      await reviewAssessment(faculty, 'mentor', r.rec, 'verify', 1);
      if (sub.semester <= 3) {
        await reviewAssessment(hod, 'hod', r.rec, 'endorse', 1);
      }
    }
  }

  console.log(`✅ Added marks for ${student.fullName}`);
}

// Add activities and goals
console.log('\n🎯 Adding student activities and goals...');
for (const student of students) {
  // Add an activity
  const act: any = await saveVersioned(StudentActivity, 'StudentActivity', new StudentActivity({ student: student._id }), {
    semester: 5,
    category: 'hackathon',
    name: 'Tech Innovation Hackathon 2024',
    achievement: 'Winner',
    skills: ['Problem Solving', 'Teamwork', 'Full Stack Development']
  }, student, ['name', 'achievement']);

  await submitVersioned('StudentActivity', act.rec, student);
  await reviewVersioned('StudentActivity', faculty, 'mentor', act.rec, 'verify', 1);

  // Add a goal
  const goal = await StudentGoal.create({
    student: student._id,
    title: 'Achieve excellent marks in Semester 5',
    category: 'improve_mse',
    priority: 'high',
    targetDate: new Date(Date.now() + 60 * 864e5),
    successCriteria: 'Score above 16 in both MSEs',
    progress: 65,
    status: 'in_progress',
    relatedSemester: 5
  });

  // Add mentor recommendation
  await MentorRecommendation.create({
    student: student._id,
    mentor: faculty._id,
    title: 'Focus on advanced concepts',
    reason: 'Build strong foundation for internships',
    priority: 'high',
    deadline: new Date(Date.now() + 20 * 864e5),
    followUpDate: new Date(Date.now() + 10 * 864e5),
    relatedGoal: goal._id
  });

  // Add mentor note
  await MentorNote.create({
    student: student._id,
    author: faculty._id,
    type: 'student_visible',
    text: `Excellent progress in semester 5! Keep up the momentum. Your projects show great technical depth and good understanding of core concepts.`
  });

  // Schedule a mentor meeting
  await MentorMeeting.create({
    student: student._id,
    mentor: faculty._id,
    scheduledAt: new Date(Date.now() + 7 * 864e5),
    agenda: 'Review semester 5 progress and plan for internship applications'
  });

  console.log(`✅ Added activities and goals for ${student.fullName}`);
}

// Create academic calendar events
console.log('\n📅 Creating academic calendar events...');
const events = [
  { title: 'MSE1 - Semester 5', type: 'mse' as const, daysFromNow: 14 },
  { title: 'MSE2 - Semester 5', type: 'mse' as const, daysFromNow: 35 },
  { title: 'Project Submission', type: 'assignment' as const, daysFromNow: 42 },
  { title: 'Semester 5 Final Evaluation', type: 'meeting_window' as const, daysFromNow: 60 },
  { title: 'Internship Mentoring Period', type: 'other' as const, daysFromNow: 70 }
];

for (const event of events) {
  await AcademicCalendarEvent.create({
    department: dept._id,
    title: event.title,
    type: event.type,
    date: new Date(Date.now() + event.daysFromNow * 864e5),
    semester: 5,
    createdBy: hod._id
  });
  console.log(`✅ Event created: ${event.title}`);
}

console.log('\n✅ Production data seeded successfully!\n');
console.log('📋 Login Credentials:');
console.log(`   HOD: manisha.gp@nmamit.in / ${PRODUCTION_PASSWORD}`);
console.log(`   Faculty: tejas.bn@nmamit.in / ${PRODUCTION_PASSWORD}`);
console.log(`   Student 1: aditya.sn@nmamit.in / ${PRODUCTION_PASSWORD}`);
console.log(`   Student 2: nagaraj.ce@nmamit.in / ${PRODUCTION_PASSWORD}`);
console.log(`   Student 3: raghu.nc@nmamit.in / ${PRODUCTION_PASSWORD}`);
console.log('\n🎓 Department: Information Systems (IS)');
console.log('📊 All students are in Semester 5 with realistic marks and activities');
console.log('🔐 Remember to change the password in production!\n');

await mongoose.disconnect();
