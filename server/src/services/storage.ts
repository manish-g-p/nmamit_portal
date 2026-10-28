import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { FileBlob } from '../models/FileBlob.js';
// Storage adapter. "disk" is for local development. "mongo" keeps files in the database, which survives restarts on hosts with ephemeral
// filesystems (e.g. Render free web services). Default: mongo in production, disk otherwise. Add a Cloudinary/S3 driver here if volume grows.
const driver = () => process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === 'production' ? 'mongo' : 'disk');
const dir = () => path.resolve(process.env.UPLOAD_DIR ?? './uploads');
export async function putFile(buf: Buffer) {
  const key = crypto.randomUUID();
  if (driver() === 'mongo') await FileBlob.create({ key, data: buf });
  else { await fs.mkdir(dir(), { recursive: true }); await fs.writeFile(path.join(dir(), key), buf, { mode: 0o600 }); }
  return key;
}
export async function getFile(key: string): Promise<Buffer> {
  if (driver() === 'mongo') { const b = await FileBlob.findOne({ key }).lean(); if (!b) throw new Error('File missing'); return Buffer.from((b.data as any).buffer ?? b.data); }
  return fs.readFile(path.join(dir(), path.basename(key))); // basename blocks path traversal
}
export const sniff = (b: Buffer): string | null =>
  b.subarray(0, 4).toString('latin1') === '%PDF' ? 'application/pdf' : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
  : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : null;
