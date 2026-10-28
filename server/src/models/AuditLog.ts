import { Schema, model, Types } from 'mongoose';
// Append-only at the application layer: no update/delete routes exist, and the hooks below block them.
const schema = new Schema({
  actor: { type: Types.ObjectId, ref: 'User' },
  actorRole: String,
  action: { type: String, required: true },
  recordType: String,
  recordId: String,
  previous: Schema.Types.Mixed,
  next: Schema.Types.Mixed,
  reason: String,
  version: Number,
}, { timestamps: { createdAt: true, updatedAt: false } });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'] as const) {
  schema.pre(op as any, function () { throw new Error('AuditLog is append-only'); });
}
export const AuditLog = model('AuditLog', schema);
