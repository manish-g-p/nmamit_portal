import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  // Institutional email domains accepted at sign-up (comma-separated). Confirm the real list with your administrator.
  ALLOWED_EMAIL_DOMAINS: z.string().default('nmamit.in,nitte.edu.in'),
  // Secret that HODs must enter to register. Give it only to the HODs. If empty, HOD registration is disabled.
  HOD_ACCESS_CODE: z.string().default(''),
  // Reverse proxies in front of the API: 0 locally, 1 on Render.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Where the built web app lives (served by this same server, so cookies are first-party).
  CLIENT_DIST: z.string().optional(),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
export const allowedDomains = env.ALLOWED_EMAIL_DOMAINS.split(',').map((d) => d.trim().toLowerCase());
if (isProd && env.HOD_ACCESS_CODE && env.HOD_ACCESS_CODE.length < 8) throw new Error('HOD_ACCESS_CODE must be at least 8 characters in production');
