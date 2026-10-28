import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env, isProd } from '../config/env.js';

const ACCESS_TTL_S = 15 * 60;       // short-lived access token
const REFRESH_TTL_S = 7 * 24 * 3600; // renewable session

export type SessionPayload = { sub: string; tv: number; typ: 'access' | 'refresh' };

const sign = (p: SessionPayload, ttl: number) => jwt.sign(p, env.SESSION_SECRET, { expiresIn: ttl, algorithm: 'HS256' });
export const verify = (t: string): SessionPayload =>
  jwt.verify(t, env.SESSION_SECRET, { algorithms: ['HS256'] }) as SessionPayload;

const base = { httpOnly: true, secure: isProd, sameSite: 'lax' as const, path: '/' };

export function setSessionCookies(res: Response, userId: string, tokenVersion: number) {
  res.cookie('access', sign({ sub: userId, tv: tokenVersion, typ: 'access' }, ACCESS_TTL_S), { ...base, maxAge: ACCESS_TTL_S * 1000 });
  res.cookie('refresh', sign({ sub: userId, tv: tokenVersion, typ: 'refresh' }, REFRESH_TTL_S), { ...base, path: '/api/auth', maxAge: REFRESH_TTL_S * 1000 });
}
export function clearSessionCookies(res: Response) {
  res.clearCookie('access', base);
  res.clearCookie('refresh', { ...base, path: '/api/auth' });
}
