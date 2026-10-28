import { AuditLog } from '../models/AuditLog.js';
const SECRET_KEYS = /pass|token|secret|hash/i;
const scrub = (o: any): any => {
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : scrub(v)]));
};
export async function audit(e: { actor?: any; actorRole?: string; action: string; recordType?: string; recordId?: string; previous?: any; next?: any; reason?: string; version?: number }) {
  await AuditLog.create({ ...e, previous: scrub(e.previous), next: scrub(e.next) });
}
