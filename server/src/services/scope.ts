import { MentorAssignment } from '../models/MentorAssignment.js';
import { User } from '../models/User.js';

export const menteeIds = async (mentorId: any) => (await MentorAssignment.find({ mentor: mentorId, active: true }).lean()).map((a) => String(a.student));
export const isActiveMentorOf = async (mentorId: any, studentId: any) => !!(await MentorAssignment.exists({ mentor: mentorId, student: studentId, active: true }));
export const inDepartment = async (studentId: any, department: any) => !!(await User.exists({ _id: studentId, role: 'student', department }));
