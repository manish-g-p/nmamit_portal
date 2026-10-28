import { Schema, model, Types } from 'mongoose';
// type 'private': readable only by its author while the author is the student's active mentor. Never exposed to students, other mentors, HODs or exports.
// type 'student_visible': feedback the student can read.
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  author: { type: Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['private', 'student_visible'], required: true },
  text: { type: String, required: true, maxlength: 3000 },
}, { timestamps: true });
export const MentorNote = model('MentorNote', schema);
