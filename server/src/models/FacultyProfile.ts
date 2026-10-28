import { Schema, model, Types } from 'mongoose';
const schema = new Schema({
  user: { type: Types.ObjectId, ref: 'User', unique: true, sparse: true },
  fullName: { type: String, required: true, trim: true },
  designation: { type: String, trim: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true },
  employeeId: { type: String, trim: true },
  profileUrl: String,
  sourceUrl: String,
  lastChecked: Date,
  importStatus: { type: String, enum: ['pending_review', 'approved', 'inactive'], default: 'pending_review' },
}, { timestamps: true });
schema.index({ department: 1, fullName: 1 }, { unique: true });
export const FacultyProfile = model('FacultyProfile', schema);
