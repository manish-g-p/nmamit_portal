import { Schema, model, Types } from 'mongoose';
// Files live outside the web root under a random key; the original name is metadata only. Removal is a soft delete so history is preserved.
const schema = new Schema({
  owner: { type: Types.ObjectId, ref: 'User', required: true },
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  recordType: { type: String, enum: ['AssessmentRecord', 'StudentActivity'], required: true },
  recordId: { type: Types.ObjectId, required: true, index: true },
  originalName: { type: String, maxlength: 200 }, mime: String, size: Number, sha256: String,
  storageKey: { type: String, required: true, unique: true },
  deletedAt: Date, deletedBy: { type: Types.ObjectId, ref: 'User' },
}, { timestamps: true });
export const UploadedDocument = model('UploadedDocument', schema);
