import { Schema, model, Types } from 'mongoose';
// History is preserved: reassignment sets endedAt on the old row and creates a new one.
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true },
  mentor: { type: Types.ObjectId, ref: 'User', required: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true },
  assignedBy: { type: Types.ObjectId, ref: 'User', required: true },
  effectiveFrom: { type: Date, default: Date.now },
  endedAt: Date,
  active: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ student: 1, active: 1 });
schema.index({ mentor: 1, active: 1 });
export const MentorAssignment = model('MentorAssignment', schema);
