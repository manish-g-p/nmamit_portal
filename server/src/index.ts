import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureReferenceData } from './services/curriculum.js';
await mongoose.connect(env.MONGODB_URI);
await ensureReferenceData(); // departments and the syllabus; safe to run on every start
createApp().listen(env.PORT, () => console.log(`NMAMIT Mentor-Mentee Portal listening on :${env.PORT}`));
