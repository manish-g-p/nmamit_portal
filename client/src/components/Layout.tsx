import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Bell, BookOpen, CalendarDays, ClipboardCheck, FileText, GraduationCap, KeyRound, LayoutDashboard, LibraryBig, LogOut, Menu, MessageSquare, ScrollText, Settings, Target, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/useFetch';

const NAV = {
  student: [['/student', 'Dashboard', LayoutDashboard], ['/student/portfolio', 'Academic portfolio', BookOpen], ['/student/activities', 'Activities', GraduationCap], ['/student/goals', 'Goals & recommendations', Target], ['/student/feedback', 'Feedback & reflections', MessageSquare], ['/calendar', 'Calendar', CalendarDays], ['/notifications', 'Notifications', Bell], ['/account', 'Account', KeyRound]],
  professor: [['/mentor', 'Dashboard', LayoutDashboard], ['/mentor/find', 'Find mentees', UserPlus], ['/mentor/mentees', 'My mentees', Users], ['/mentor/reports', 'Reports', FileText], ['/calendar', 'Calendar', CalendarDays], ['/notifications', 'Notifications', Bell], ['/account', 'Account', KeyRound]],
  hod: [['/hod', 'Dashboard', LayoutDashboard], ['/hod/approvals', 'Faculty approvals', UserCheck], ['/hod/users', 'People & passwords', KeyRound], ['/hod/assignments', 'Mentor assignments', Users], ['/hod/endorsements', 'Endorsements', ClipboardCheck], ['/hod/curriculum', 'Curriculum', LibraryBig], ['/hod/faculty', 'Faculty directory', ScrollText], ['/hod/reports', 'Reports & exports', FileText], ['/hod/audit', 'Audit log', ScrollText], ['/calendar', 'Calendar', CalendarDays], ['/notifications', 'Notifications', Bell], ['/hod/settings', 'Assessment rules', Settings], ['/account', 'Account', KeyRound]],
} as const;

export default function Layout() {
  const { user, logout } = useAuth(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  const { data: n } = useFetch<{ unread: number }>('/api/notifications');
  if (!user) return null;
  const items: readonly (readonly [string, string, any])[] = NAV[user.role];
  const links = (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {items.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end={to.split('/').length === 2} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-medium text-white' : 'text-navy-100 hover:bg-white/10'}`}>
          <Icon className="h-4 w-4" aria-hidden />{label}{to === '/notifications' && !!n?.unread && <span className="ml-auto rounded-full bg-teal-500 px-2 text-xs text-white">{n.unread}</span>}
        </NavLink>))}
    </nav>);
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 bg-navy-900 lg:block"><div className="p-5 text-white"><div className="font-semibold">NMAMIT Mentor–Mentee Portal</div><div className="mt-1 text-xs text-navy-100">Independent project, not an official institutional system</div></div>{links}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} /><aside className="absolute left-0 top-0 h-full w-64 bg-navy-900"><button className="absolute right-3 top-3 text-white" aria-label="Close menu" onClick={() => setOpen(false)}><X /></button><div className="p-5 text-white font-semibold">Menu</div>{links}</aside></div>}
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-navy-100 bg-white px-4 py-3">
          <button className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu /></button>
          <div className="text-sm text-slate-600"><span className="font-medium text-navy-900">{user.fullName}</span> · {user.role === 'hod' ? 'HOD' : user.role === 'professor' ? 'Mentor' : 'Student'}</div>
          <button onClick={async () => { await logout(); nav('/'); }} className="flex items-center gap-2 text-sm text-navy-800 hover:underline"><LogOut className="h-4 w-4" aria-hidden />Log out</button>
        </header>
        <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>);
}
