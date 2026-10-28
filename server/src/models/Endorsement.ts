import { Schema, model, Types } from 'mongoose';
// Positive endorsements only (mentor verification, HOD endorsement); kept forever, even after later edits.
const schema = new Schema({
  recordType: { type: String, required: true },
  recordId: { type: Types.ObjectId, required: true, index: true },
  version: { type: Number, required: true },
  level: { type: String, enum: ['mentor', 'hod'], required: true },
  endorser: { type: Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'] as const)
  schema.pre(op as any, function () { throw new Error('Endorsement is append-only'); });
export const Endorsement = model('Endorsement', schema);
