import { Schema, model, Types } from 'mongoose';
import { RECORD_STATUSES } from './AssessmentRecord.js';
export const ACTIVITY_CATEGORIES = ['internship', 'project', 'hackathon', 'coding_competition', 'workshop', 'certification', 'online_course',
  'research', 'publication', 'paper_presentation', 'open_source', 'technical_club', 'cultural', 'sports', 'volunteering', 'leadership',
  'entrepreneurship', 'placement_preparation', 'mock_interview', 'resume'] as const;
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  semester: { type: Number, min: 1, max: 8, required: true },
  category: { type: String, enum: ACTIVITY_CATEGORIES, required: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, maxlength: 2000 },
  date: Date, organizer: { type: String, maxlength: 150 }, role: { type: String, maxlength: 100 },
  achievement: { type: String, maxlength: 300 }, skills: [{ type: String, maxlength: 50 }],
  status: { type: String, enum: RECORD_STATUSES, default: 'draft' },
  version: { type: Number, default: 1 },
}, { timestamps: true });
export const StudentActivity = model('StudentActivity', schema);
