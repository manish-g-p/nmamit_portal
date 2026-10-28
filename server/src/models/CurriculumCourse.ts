import { Schema, model, Types } from 'mongoose';
// One row per course per batch. department = null means an institution-wide open-elective pool entry.
const schema = new Schema({
  admissionYear: { type: Number, required: true },
  department: { type: Types.ObjectId, ref: 'Department', default: null },
  code: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  category: { type: String, required: true },
  l: { type: Number, default: 0 }, t: { type: Number, default: 0 }, p: { type: Number, default: 0 },
  credits: { type: Number, required: true, min: 0 },
  cie: { type: Number, required: true, min: 0 }, see: { type: Number, default: 0, min: 0 },
  hasMse: { type: Boolean, default: false },   // theory course with two mid-semester exams and 10 marks of tasks
  semester: { type: Number, min: 1, max: 8 },  // fixed semester (core, years 2-4)
  table: { type: String, enum: ['A', 'B'] },   // first-year course tables; semester depends on the student's group
  audience: { type: String, enum: ['all', 'lateral'], default: 'all' },
  slot: String, group: { type: String, enum: ['G1', 'G2'] }, stream: String,
  offeredBy: String, notFor: [String], note: String,
  active: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ admissionYear: 1, department: 1, code: 1 }, { unique: true });
export const CurriculumCourse = model('CurriculumCourse', schema);
