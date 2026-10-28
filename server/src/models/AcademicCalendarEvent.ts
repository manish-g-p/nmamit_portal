import { Schema, model, Types } from 'mongoose';
const schema = new Schema({
  department: { type: Types.ObjectId, ref: 'Department' }, // null = institution-wide
  title: { type: String, required: true, maxlength: 150 },
  type: { type: String, enum: ['mse', 'task', 'assignment', 'meeting_window', 'holiday', 'other'], required: true },
  date: { type: Date, required: true, index: true }, semester: { type: Number, min: 1, max: 8 },
  description: { type: String, maxlength: 1000 }, createdBy: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });
export const AcademicCalendarEvent = model('AcademicCalendarEvent', schema);
