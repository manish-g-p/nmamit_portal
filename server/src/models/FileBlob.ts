import { Schema, model } from 'mongoose';
// File bytes for the "mongo" storage driver. Only ever read through the authenticated download route.
const schema = new Schema({ key: { type: String, required: true, unique: true }, data: { type: Buffer, required: true } }, { timestamps: { createdAt: true, updatedAt: false } });
export const FileBlob = model('FileBlob', schema);
