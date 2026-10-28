import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Department } from '../models/Department.js';
import { CurriculumCourse } from '../models/CurriculumCourse.js';
import { ensureReferenceData } from '../services/curriculum.js';
export async function seedDepartments() { await ensureReferenceData(); }
if (import.meta.url === `file://${process.argv[1]}`) {
  await mongoose.connect(env.MONGODB_URI);
  await ensureReferenceData();
  console.log(`Reference data ready: ${await Department.countDocuments()} departments, ${await CurriculumCourse.countDocuments()} curriculum courses`);
  await mongoose.disconnect();
}
