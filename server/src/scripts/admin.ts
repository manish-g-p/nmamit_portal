// Operator tool for the rare cases the app cannot handle itself (for example a HOD who forgot their password).
// Run from the server folder with the production MONGODB_URI in the environment:
//   npm run admin -- reset-password --email hod@nmamit.in
//   npm run admin -- set-status --email someone@nmamit.in --status suspended|active
import mongoose from 'mongoose';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.js';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const [cmd, email] = [process.argv[2], arg('email')?.toLowerCase()];
if (!cmd || !email) { console.error('Usage: admin <reset-password|set-status> --email <email> [--status active|suspended]'); process.exit(1); }
await mongoose.connect(env.MONGODB_URI);
const user = await User.findOne({ email }).select('+passwordHash');
if (!user) { console.error('No user with that email.'); process.exit(1); }
if (cmd === 'reset-password') {
  const temp = crypto.randomBytes(9).toString('base64url') + 'aA1';
  user.passwordHash = await argon2.hash(temp, { type: argon2.argon2id }); user.mustChangePassword = true; user.tokenVersion += 1; user.failedLogins = 0; user.lockedUntil = undefined; await user.save();
  await audit({ action: 'password.reset_by_operator', recordType: 'User', recordId: String(user._id) });
  console.log(`Temporary password for ${email}: ${temp}\nThey must choose a new password at the next login.`);
} else if (cmd === 'set-status') {
  const st = arg('status'); if (st !== 'active' && st !== 'suspended') { console.error('--status must be active or suspended'); process.exit(1); }
  user.status = st; user.tokenVersion += 1; await user.save();
  await audit({ action: `user.status_${st}_by_operator`, recordType: 'User', recordId: String(user._id) });
  console.log(`${email} is now ${st}.`);
} else { console.error('Unknown command.'); process.exit(1); }
await mongoose.disconnect();
