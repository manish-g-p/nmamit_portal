// DEVELOPMENT ONLY. Deletes EVERYTHING in the database named by MONGODB_URI so you can start clean (for example after upgrading from an older version).
// Usage: npm run reset:dev -- --yes
import mongoose from 'mongoose';
import { env, isProd } from '../config/env.js';
if (isProd) { console.error('Refusing to reset a production database.'); process.exit(1); }
if (!process.argv.includes('--yes')) { console.error('This deletes ALL data in the database from MONGODB_URI. Run again with --yes to confirm.'); process.exit(1); }
await mongoose.connect(env.MONGODB_URI);
const name = mongoose.connection.name; await mongoose.connection.dropDatabase();
console.log(`Database "${name}" is now empty. Start the server, or run: npm run seed:demo`);
await mongoose.disconnect();
