import { Schema, model, Types } from 'mongoose';
const schema = new Schema({
  student: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  semester: { type: Number, min: 1, max: 8 },
  text: { type: String, required: true, maxlength: 3000 },
}, { timestamps: true });
export const StudentReflection = model('StudentReflection', schema);
