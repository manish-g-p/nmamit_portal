import { Schema, model, Types } from 'mongoose';
export const RECORD_STATUSES = ['draft', 'awaiting_mentor_review', 'changes_requested', 'pending_hod_endorsement',
  'hod_endorsed', 'officially_verified', 'rejected'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];
const mark = { type: Number, default: null, min: 0 };
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  subject: { type: Types.ObjectId, ref: 'Subject', required: true, unique: true },
  semester: { type: Number, min: 1, max: 8, required: true },
  academicYear: String,
  mse1: mark, mse2: mark, task1: mark, task2: mark, task3: mark,
  cieMarks: mark, // for courses without MSEs (labs, internships, projects, CIE-only courses)
  taskSubtotal: { type: Number, default: 0 }, // derived from the three tasks only (max 10 under default scheme)
  comments: { type: String, maxlength: 1000 },
  improvementAreas: { type: String, maxlength: 1000 },
  status: { type: String, enum: RECORD_STATUSES, default: 'draft' },
  version: { type: Number, default: 1 },
}, { timestamps: true });
export const AssessmentRecord = model('AssessmentRecord', schema);
