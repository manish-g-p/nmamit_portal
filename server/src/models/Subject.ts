import { Schema, model, Types } from 'mongoose';
// A student's registration for one course in one semester. Created only from the curriculum, so code and title always match the syllabus.
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true },
  semester: { type: Number, min: 1, max: 8, required: true },
  academicYear: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  facultyName: { type: String, trim: true, maxlength: 120 },
  course: { type: Types.ObjectId, ref: 'CurriculumCourse' },
  category: String, credits: Number, slot: String,
  hasMse: { type: Boolean, default: false }, // true: MSE1, MSE2 and TASK1-3 apply. false: a single CIE mark applies.
  cieMax: Number,
}, { timestamps: true });
schema.index({ student: 1, semester: 1, code: 1 }, { unique: true });
export const Subject = model('Subject', schema);
