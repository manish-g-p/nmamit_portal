import { User } from '../models/User.js';
import { isActiveMentorOf } from './scope.js';
// One place that answers: may this user view this student's non-private records?
export async function canViewStudent(user: any, studentId: any): Promise<boolean> {
  if (user.role === 'student') return String(user._id) === String(studentId);
  if (user.role === 'professor') return isActiveMentorOf(user._id, studentId);
  if (user.role === 'hod') return !!(await User.exists({ _id: studentId, role: 'student', department: user.department }));
  return false;
}
