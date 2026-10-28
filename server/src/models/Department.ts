import { Schema, model } from 'mongoose';
const schema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  alias: { type: String, trim: true },
  code: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
  degreeLabel: { type: String, default: 'B.Tech' },
  active: { type: Boolean, default: true },
}, { timestamps: true });
export const Department = model('Department', schema);
