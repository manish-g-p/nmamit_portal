import { Schema, model, Types } from 'mongoose';
export const GOAL_CATEGORIES = ['improve_mse', 'subject_fundamentals', 'coding_practice', 'technical_skill', 'certification', 'project',
  'hackathon', 'internship_prep', 'communication', 'placement_prep', 'research'] as const;
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 }, description: { type: String, maxlength: 2000 },
  category: { type: String, enum: GOAL_CATEGORIES, required: true },
  targetDate: Date, priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  successCriteria: { type: String, maxlength: 1000 },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  status: { type: String, enum: ['not_started', 'in_progress', 'completed', 'dropped'], default: 'not_started' },
  relatedSemester: { type: Number, min: 1, max: 8 },
  updates: [{ text: { type: String, maxlength: 1000 }, progress: Number, at: { type: Date, default: Date.now } }],
}, { timestamps: true });
export const StudentGoal = model('StudentGoal', schema);
