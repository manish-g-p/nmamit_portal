import { Schema, model, Types } from 'mongoose';
// Every review decision (including change requests and rejections), tied to the exact version reviewed.
const schema = new Schema({
  recordType: { type: String, required: true },
  recordId: { type: Types.ObjectId, required: true, index: true },
  version: { type: Number, required: true },
  level: { type: String, enum: ['mentor', 'hod'], required: true },
  decision: { type: String, enum: ['verified', 'endorsed', 'changes_requested', 'rejected'], required: true },
  reviewer: { type: Types.ObjectId, ref: 'User', required: true },
  comment: { type: String, maxlength: 1000 },
}, { timestamps: { createdAt: true, updatedAt: false } });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'] as const)
  schema.pre(op as any, function () { throw new Error('ReviewRecord is append-only'); });
export const ReviewRecord = model('ReviewRecord', schema);
