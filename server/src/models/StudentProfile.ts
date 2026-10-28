import { Schema, model, Types } from 'mongoose';
const schema = new Schema({
  user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
  usn: { type: String, required: true, unique: true, uppercase: true, trim: true },
  program: { type: String, default: 'B.Tech' },
  admissionYear: { type: Number, required: true, min: 2000, max: 2100 },
  currentYear: { type: Number, min: 1, max: 4, required: true }, // derived from the semester
  currentSemester: { type: Number, min: 1, max: 8, required: true },
  firstYearGroup: { type: String, enum: ['I', 'II'], required: true }, // decides which first-year courses fall in semester 1 and 2
  lateralEntry: { type: Boolean, default: false },
  section: { type: String, trim: true },
  identityVerified: { type: Boolean, default: false },
}, { timestamps: true });
export const StudentProfile = model('StudentProfile', schema);
