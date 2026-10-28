import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
export type Me = { id: string; fullName: string; email: string; role: 'student' | 'professor' | 'hod'; department: string; mustChangePassword: boolean };
type Ctx = { user: Me | null; loading: boolean; expired: boolean; refresh: () => Promise<Me | null>; logout: () => Promise<void> };
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null); const [loading, setLoading] = useState(true); const [expired, setExpired] = useState(false);
  const refresh = useCallback(async () => { try { const me = await api<Me>('/api/auth/me'); setUser(me); setExpired(false); return me; } catch { setUser(null); return null; } finally { setLoading(false); } }, []);
  useEffect(() => { refresh(); const h = () => { setUser(null); setExpired(true); }; window.addEventListener('session-expired', h); return () => window.removeEventListener('session-expired', h); }, [refresh]);
  const logout = async () => { try { await api('/api/auth/logout', { method: 'POST', body: {} }); } finally { setUser(null); } };
  return <AuthCtx.Provider value={{ user, loading, expired, refresh, logout }}>{children}</AuthCtx.Provider>;
}
export const homeFor = (r: Me['role']) => (r === 'student' ? '/student' : r === 'professor' ? '/mentor' : '/hod');
export const PORTALS = {
  student: { label: 'Student', blurb: 'Keep your marks, activities and goals in one place and follow your mentor’s advice.' },
  faculty: { label: 'Faculty', blurb: 'Choose mentees from your branch, review their records and guide their progress.' },
  hod: { label: 'HOD', blurb: 'Approve faculty, review and endorse records, and manage your department.' },
} as const;
export type PortalKey = keyof typeof PORTALS;
