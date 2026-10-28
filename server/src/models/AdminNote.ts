import { Schema, model, Types } from 'mongoose';
// Administrative review notes: readable only by institution-manager HODs.
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  author: { type: Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 3000 },
}, { timestamps: true });
export const AdminNote = model('AdminNote', schema);
