import { Schema, model, Types } from 'mongoose';
export const REC_STATUSES = ['proposed', 'accepted', 'in_progress', 'evidence_submitted', 'completed', 'declined', 'closed'] as const;
const entry = { text: { type: String, maxlength: 1000 }, at: { type: Date, default: Date.now } };
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  mentor: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 }, description: { type: String, maxlength: 2000 },
  reason: { type: String, maxlength: 1000 }, priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  deadline: Date, followUpDate: Date, suggestedResources: [{ type: String, maxlength: 300 }], expectedOutcome: { type: String, maxlength: 500 },
  relatedGoal: { type: Types.ObjectId, ref: 'StudentGoal' },
  status: { type: String, enum: REC_STATUSES, default: 'proposed' },
  declineReason: String, evidenceNote: String,
  studentNotes: [entry], mentorFeedback: [entry],
}, { timestamps: true });
export const MentorRecommendation: any = model('MentorRecommendation', schema);
