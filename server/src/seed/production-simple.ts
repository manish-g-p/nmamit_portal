// DEVELOPMENT ONLY. Creates production-ready data with real user roles - simplified version.
// Uses real names: Manisha GP (HOD), Tejas BN (Faculty), Aditya SN, Nagaraj CE, Raghu NC (Students)
import mongoose from 'mongoose';
import argon2 from 'argon2';
import { env, isProd } from '../config/env.js';
import { Department } from '../models/Department.js';
import { User } from '../models/User.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { FacultyProfile } from '../models/FacultyProfile.js';
import { AcademicCalendarEvent } from '../models/AcademicCalendarEvent.js';
import { MentorNote } from '../models/MentorNote.js';
import { MentorMeeting } from '../models/MentorMeeting.js';
import { StudentGoal } from '../models/StudentGoal.js';
import { assignMentor } from '../services/assignment.js';

if (isProd) { console.error('Refusing to seed data in production.'); process.exit(1); }

const PRODUCTION_PASSWORD = 'Nmamit@2024'; // Change in production

await mongoose.connect(env.MONGODB_URI);

console.log('🔄 Clearing existing user data...');
// Clear user-related data
await User.deleteMany({});
await StudentProfile.deleteMany({});
await StudentGoal.deleteMany({});
await MentorNote.deleteMany({});
await MentorMeeting.deleteMany({});
await AcademicCalendarEvent.deleteMany({});
await FacultyProfile.deleteMany({});
console.log('✅ Database cleared');

const dept = (await Department.findOne({ code: 'IS' }))!;
const hash = await argon2.hash(PRODUCTION_PASSWORD, { type: argon2.argon2id });

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

// Create Faculty Profile
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

// Assign mentors
console.log('\n📚 Assigning mentors...');
for (const student of students) {
  await assignMentor(hod, student._id, faculty._id);
  console.log(`✅ ${student.fullName} assigned to ${faculty.fullName}`);
}

// Add mentor notes and meetings
console.log('\n💬 Adding mentor communications...');
for (const student of students) {
  await MentorNote.create({
    student: student._id,
    author: faculty._id,
    type: 'student_visible',
    text: `Welcome to mentorship for Semester 5! Let's work together on your academic goals and career development. I'm here to support you in your studies and professional growth.`
  });

  await MentorMeeting.create({
    student: student._id,
    mentor: faculty._id,
    scheduledAt: new Date(Date.now() + 7 * 864e5),
    agenda: 'Semester 5 orientation and goal setting'
  });

  await StudentGoal.create({
    student: student._id,
    title: 'Achieve excellent grades in Semester 5',
    category: 'improve_mse',
    priority: 'high',
    targetDate: new Date(Date.now() + 60 * 864e5),
    successCriteria: 'Score above 75% in all subjects',
    progress: 0,
    status: 'not_started',
    relatedSemester: 5
  });

  console.log(`✅ Mentor communications added for ${student.fullName}`);
}

// Create academic calendar events
console.log('\n📅 Creating academic calendar events...');
const events = [
  { title: 'MSE1 - Semester 5', type: 'mse' as const, daysFromNow: 14 },
  { title: 'MSE2 - Semester 5', type: 'mse' as const, daysFromNow: 35 },
  { title: 'Programming Assignment 1', type: 'assignment' as const, daysFromNow: 10 },
  { title: 'Data Structures Project', type: 'assignment' as const, daysFromNow: 28 },
  { title: 'Semester 5 Mentoring Review', type: 'meeting_window' as const, daysFromNow: 60 },
  { title: 'Internship Preparation Week', type: 'other' as const, daysFromNow: 75 }
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
  console.log(`✅ ${event.title}`);
}

console.log('\n' + '='.repeat(60));
console.log('✅ PRODUCTION DATA SEEDED SUCCESSFULLY!');
console.log('='.repeat(60));
console.log('\n📋 Login Credentials:\n');
console.log('   👨‍💼 HOD (Manisha GP)');
console.log('      Email: manisha.gp@nmamit.in');
console.log('      Password: ' + PRODUCTION_PASSWORD);
console.log('\n   👨‍🏫 Faculty (Tejas BN)');
console.log('      Email: tejas.bn@nmamit.in');
console.log('      Password: ' + PRODUCTION_PASSWORD);
console.log('\n   👨‍🎓 Students (Semester 5)');
console.log('      1. Aditya SN (NMA23CS001) - aditya.sn@nmamit.in');
console.log('      2. Nagaraj CE (NMA23CS002) - nagaraj.ce@nmamit.in');
console.log('      3. Raghu NC (NMA23CS003) - raghu.nc@nmamit.in');
console.log('      Password (all): ' + PRODUCTION_PASSWORD);
console.log('\n🎓 Department: Information Systems (IS)');
console.log('📊 Ready for demonstrations and testing!');
console.log('🔐 Remember to change passwords in production!\n');

await mongoose.disconnect();
