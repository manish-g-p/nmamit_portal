import { Schema, model, Types } from 'mongoose';
export const ROLES = ['student', 'professor', 'hod'] as const;
export type Role = (typeof ROLES)[number];
// Students and HODs are active immediately; professors wait for their department's HOD.
export const STATUSES = ['awaiting_approval', 'active', 'suspended'] as const;
export type Status = (typeof STATUSES)[number];

const schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  role: { type: String, enum: ROLES, required: true },
  status: { type: String, enum: STATUSES, required: true },
  department: { type: Types.ObjectId, ref: 'Department', required: true },
  mustChangePassword: { type: Boolean, default: false }, // set when an HOD or the operator issues a temporary password
  failedLogins: { type: Number, default: 0 },
  lockedUntil: Date,
  tokenVersion: { type: Number, default: 0 }, // bump to invalidate every session
}, { timestamps: true });
schema.index({ role: 1, department: 1, status: 1 });
export const User = model('User', schema);
