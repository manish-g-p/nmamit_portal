import { Schema, model, Types } from 'mongoose';
const schema = new Schema({
  user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, required: true, maxlength: 300 },
  link: String,
  readAt: Date,
}, { timestamps: true });
export const Notification = model('Notification', schema);
