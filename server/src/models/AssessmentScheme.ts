import { Schema, model, Types } from 'mongoose';
// Per-department rules, editable by that department's HOD.
// Defaults come from the Regulations 2023 (Appendix B): each MSE is out of 20; the three tasks total 10 (4/4/2).
const schema = new Schema({
  department: { type: Types.ObjectId, ref: 'Department', required: true, unique: true },
  mse1Max: { type: Number, default: 20, min: 0 },
  mse2Max: { type: Number, default: 20, min: 0 },
  task1Max: { type: Number, default: 4, min: 0 },
  task2Max: { type: Number, default: 4, min: 0 },
  task3Max: { type: Number, default: 2, min: 0 },
  updatedBy: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });
export const AssessmentScheme = model('AssessmentScheme', schema);
