import { Schema, model, Types } from 'mongoose';
// Immutable snapshot of a record after every save. Endorsements reference these version numbers.
const schema = new Schema({
  recordType: { type: String, required: true },
  recordId: { type: Types.ObjectId, required: true },
  version: { type: Number, required: true },
  snapshot: Schema.Types.Mixed,
  status: String,
  createdBy: { type: Types.ObjectId, ref: 'User' },
  createdByRole: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ recordType: 1, recordId: 1, version: 1 }, { unique: true });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'] as const)
  schema.pre(op as any, function () { throw new Error('RecordVersion is append-only'); });
export const RecordVersion = model('RecordVersion', schema);
