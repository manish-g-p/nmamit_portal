import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { homeFor, useAuth, type Me } from './lib/auth';
import Layout from './components/Layout';
import { Card } from './components/ui';
import { ChangePasswordForm, ForcedChangePassword, Landing, Login, NotFound, Signup, Unauthorized } from './pages/Auth';
import { Activities, Feedback, Goals, Portfolio, StudentDashboard } from './pages/Student';
import { FindMentees, MenteePage, Mentees, MentorDashboard, MentorReports } from './pages/Mentor';
import { Approvals, Assignments, Audit, Curriculum, Endorsements, Faculty, HodDashboard, HodReports, People, Settings } from './pages/Hod';
import { Calendar, Notifications } from './pages/Shared';

// This guard only improves the experience. Every API route enforces roles again on the server.
export function Guard({ role, children }: { role?: Me['role']; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-6 text-sm">Loading…</p>;
  if (!user) return <Navigate to="/" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (role && user.role !== role) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
const Account = () => (<><h1 className="text-xl font-semibold text-navy-900">Account</h1><Card title="Change your password"><div className="max-w-md"><ChangePasswordForm /></div></Card></>);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} /><Route path="/login/:portal" element={<Login />} /><Route path="/signup/:portal" element={<Signup />} />
      <Route path="/login" element={<Navigate to="/" replace />} /><Route path="/change-password" element={<ForcedChangePassword />} /><Route path="/unauthorized" element={<Unauthorized />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route path="/student" element={<Guard role="student"><StudentDashboard /></Guard>} /><Route path="/student/portfolio" element={<Guard role="student"><Portfolio /></Guard>} /><Route path="/student/activities" element={<Guard role="student"><Activities /></Guard>} />
        <Route path="/student/goals" element={<Guard role="student"><Goals /></Guard>} /><Route path="/student/feedback" element={<Guard role="student"><Feedback /></Guard>} />
        <Route path="/mentor" element={<Guard role="professor"><MentorDashboard /></Guard>} /><Route path="/mentor/find" element={<Guard role="professor"><FindMentees /></Guard>} /><Route path="/mentor/mentees" element={<Guard role="professor"><Mentees /></Guard>} /><Route path="/mentor/mentees/:id" element={<Guard role="professor"><MenteePage /></Guard>} /><Route path="/mentor/reports" element={<Guard role="professor"><MentorReports /></Guard>} />
        <Route path="/hod" element={<Guard role="hod"><HodDashboard /></Guard>} /><Route path="/hod/approvals" element={<Guard role="hod"><Approvals /></Guard>} /><Route path="/hod/users" element={<Guard role="hod"><People /></Guard>} /><Route path="/hod/assignments" element={<Guard role="hod"><Assignments /></Guard>} /><Route path="/hod/endorsements" element={<Guard role="hod"><Endorsements /></Guard>} />
        <Route path="/hod/curriculum" element={<Guard role="hod"><Curriculum /></Guard>} /><Route path="/hod/faculty" element={<Guard role="hod"><Faculty /></Guard>} /><Route path="/hod/reports" element={<Guard role="hod"><HodReports /></Guard>} /><Route path="/hod/audit" element={<Guard role="hod"><Audit /></Guard>} /><Route path="/hod/settings" element={<Guard role="hod"><Settings /></Guard>} />
        <Route path="/calendar" element={<Calendar />} /><Route path="/notifications" element={<Notifications />} /><Route path="/account" element={<Account />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>);
}
