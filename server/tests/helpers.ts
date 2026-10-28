import { Subject } from '../src/models/Subject.js';
// Registers a subject for the student behind an authenticated agent, as the curriculum loader would.
export async function subjectFor(agent: any, over: { semester?: number; code?: string; name?: string; hasMse?: boolean; cieMax?: number; [k: string]: any } = {}) {
  const me = (await agent.get('/api/auth/me')).body.id;
  const sub = await Subject.create({ student: me, semester: 5, academicYear: '2025-26', code: 'CS501', name: 'Operating Systems', hasMse: true, cieMax: 50, ...over });
  return { ...sub.toObject(), _id: String(sub._id) };
}
