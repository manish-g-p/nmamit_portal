import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { hodRouter } from './routes/hod.js';
import { studentRouter } from './routes/student.js';
import { mentorRouter } from './routes/mentor.js';
import { studentExtra } from './routes/studentExtra.js';
import { mentorExtra } from './routes/mentorExtra.js';
import { hodExtra } from './routes/hodExtra.js';
import { commonRouter } from './routes/common.js';
import { hodAdmin } from './routes/hodAdmin.js';
import { hodCurriculum } from './routes/hodCurriculum.js';
import { reportsRouter } from './routes/reports.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// The web app is served by this same server, so session cookies are first-party and no CORS is needed.
const clientDist = env.CLIENT_DIST ? path.resolve(env.CLIENT_DIST) : [path.resolve(here, '../../client/dist'), path.resolve(here, '../../../client/dist')].find((d) => fs.existsSync(d));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], frameAncestors: ["'none'"], objectSrc: ["'none'"] } } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // Reject operator-style keys ($ / .) anywhere in the body to block NoSQL operator injection.
  app.use((req, res, next) => {
    const bad = (o: any): boolean => !!o && typeof o === 'object' && Object.entries(o).some(([k, v]) => k.startsWith('$') || k.includes('.') || bad(v));
    return bad(req.body) || bad(req.query) ? res.status(400).json({ error: 'Invalid request' }) : next();
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/hod', hodRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/mentor', mentorRouter);
  app.use('/api/student', studentExtra);
  app.use('/api/mentor', mentorExtra);
  app.use('/api/hod', hodExtra);
  app.use('/api/hod', hodAdmin);
  app.use('/api/hod', hodCurriculum);
  app.use('/api', commonRouter);
  app.use('/api', reportsRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  if (clientDist) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h', setHeaders: (res, file) => { if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store'); } }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err?.name === 'MulterError') return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (5 MB maximum)' : 'Invalid upload' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
