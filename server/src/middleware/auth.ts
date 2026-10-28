import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import type { Role } from '../models/User.js';
import { verify } from '../services/session.js';

declare module 'express-serve-static-core' {
  interface Request { user?: any }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.access;
    if (!raw) return res.status(401).json({ error: 'Not authenticated' });
    const p = verify(raw);
    if (p.typ !== 'access') return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(p.sub);
    // Status and tokenVersion are re-checked on every request, so suspension, logout and password changes take effect immediately.
    if (!user || user.tokenVersion !== p.tv) return res.status(401).json({ error: 'Session expired' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account not active' });
    // A temporary password must be replaced before anything else is allowed.
    if (user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) return res.status(403).json({ error: 'Choose a new password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) =>
  req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });
