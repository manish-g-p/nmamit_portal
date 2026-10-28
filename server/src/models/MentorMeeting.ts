import { Schema, model, Types } from 'mongoose';
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  mentor: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  scheduledAt: { type: Date, required: true }, agenda: { type: String, maxlength: 1000 }, summary: { type: String, maxlength: 3000 },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
  actionItems: [{ text: { type: String, maxlength: 500 }, dueDate: Date, done: { type: Boolean, default: false } }],
}, { timestamps: true });
export const MentorMeeting = model('MentorMeeting', schema);
