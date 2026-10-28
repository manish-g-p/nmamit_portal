import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GraduationCap, Presentation, Building2 } from 'lucide-react';
import { api, ApiError, errMsg } from '../lib/api';
import { homeFor, PORTALS, useAuth, type PortalKey } from '../lib/auth';
import { Button, Field, Input, Notice, Select } from '../components/ui';

const Shell = ({ title, sub, children, wide }: { title: string; sub?: string; children: ReactNode; wide?: boolean }) => (
  <div className="flex min-h-screen items-center justify-center bg-navy-900 p-4">
    <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-xl bg-white p-6 shadow-lg sm:p-8`}>
      <h1 className="text-xl font-semibold text-navy-900">{title}</h1>{sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
      <div className="mt-5 space-y-4">{children}</div>
      <p className="mt-6 border-t border-navy-100 pt-3 text-xs text-slate-500">NMAMIT Mentor–Mentee Portal is an independent project and is not an officially approved institutional system.</p>
    </div></div>);

const ICONS = { student: GraduationCap, faculty: Presentation, hod: Building2 } as const;
export function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={user.mustChangePassword ? '/change-password' : homeFor(user.role)} replace />;
  return (
    <Shell title="NMAMIT Mentor–Mentee Portal" sub="Choose how you want to continue." wide>
      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(PORTALS) as PortalKey[]).map((k) => { const Icon = ICONS[k]; return (
          <section key={k} className="flex flex-col rounded-lg border border-navy-100 p-4">
            <Icon className="h-6 w-6 text-teal-600" aria-hidden /><h2 className="mt-2 font-semibold text-navy-900">{PORTALS[k].label}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">{PORTALS[k].blurb}</p>
            <div className="mt-4 flex flex-col gap-2"><Link to={`/login/${k}`} className="rounded-md bg-navy-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-navy-800">{PORTALS[k].label} login</Link>
              <Link to={`/signup/${k}`} className="rounded-md border border-navy-100 px-4 py-2 text-center text-sm font-medium text-navy-900 hover:bg-navy-50">{PORTALS[k].label} sign up</Link></div>
          </section>); })}
      </div></Shell>);
}

export function Login() {
  const { portal } = useParams(); const key = (portal && portal in PORTALS ? portal : 'student') as PortalKey;
  const { user, refresh, expired } = useAuth(); const nav = useNavigate(); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const { register, handleSubmit } = useForm<{ email: string; password: string }>();
  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : homeFor(user.role)} replace />;
  return (
    <Shell title={`${PORTALS[key].label} login`} sub="Use your institutional email and password.">
      {expired && <Notice tone="err">Your session expired. Log in again to continue.</Notice>}
      {err && <Notice tone="err">{err}</Notice>}
      <form className="space-y-4" onSubmit={handleSubmit(async (v) => { setBusy(true); setErr(''); try { const r = await api('/api/auth/login', { body: { ...v, portal: key } }); const me = await refresh(); nav(r.user.mustChangePassword || me?.mustChangePassword ? '/change-password' : homeFor(r.user.role)); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } })}>
        <Field label="Institutional email"><Input type="email" autoComplete="username" required {...register('email')} /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" required {...register('password')} /></Field>
        <Button type="submit" busy={busy} className="w-full">Log in</Button>
      </form>
      <div className="flex flex-col gap-1 text-sm text-teal-700"><Link to={`/signup/${key}`}>New here? {PORTALS[key].label} sign up</Link><Link to="/">Choose a different role</Link></div>
      <p className="text-xs text-slate-500">Forgot your password? {key === 'hod' ? 'Contact the institution operator.' : 'Ask your department HOD to issue a temporary one.'}</p>
    </Shell>);
}

const pw = z.string().min(10, 'At least 10 characters').regex(/[a-z]/, 'Add a lowercase letter').regex(/[A-Z]/, 'Add an uppercase letter').regex(/\d/, 'Add a digit');
const base = { fullName: z.string().min(2, 'Enter your full name'), email: z.string().email('Enter a valid email'), department: z.string().min(1, 'Choose your branch'), password: pw, confirmPassword: z.string() };
const same = { path: ['confirmPassword'], message: 'Passwords do not match', when: () => true };
const studentSchema = z.object({ ...base, usn: z.string().min(5, 'Enter your USN'), admissionYear: z.coerce.number().int().min(2000).max(2100), currentSemester: z.coerce.number().int().min(1).max(8), firstYearGroup: z.enum(['I', 'II'], { message: 'Choose your first-year group' }), section: z.string().optional(), lateralEntry: z.boolean().optional(), privacyAccepted: z.literal(true, { message: 'You must accept the privacy notice' }) }).refine((d) => d.password === d.confirmPassword, same);
const facultySchema = z.object({ ...base, designation: z.string().optional(), employeeId: z.string().optional() }).refine((d) => d.password === d.confirmPassword, same);
const hodSchema = z.object({ ...base, accessCode: z.string().min(1, 'Enter the HOD access code'), employeeId: z.string().optional() }).refine((d) => d.password === d.confirmPassword, same);
const SCHEMAS = { student: studentSchema, faculty: facultySchema, hod: hodSchema } as const;
const ENDPOINT = { student: '/api/auth/register/student', faculty: '/api/auth/register/professor', hod: '/api/auth/register/hod' } as const;

function useDepartments() { const [d, setD] = useState<{ _id: string; name: string }[]>([]); useEffect(() => { api('/api/auth/departments').then(setD).catch(() => {}); }, []); return d; }

export function Signup() {
  const { portal } = useParams(); const key = (portal && portal in PORTALS ? portal : 'student') as PortalKey;
  const { user, refresh } = useAuth(); const nav = useNavigate(); const depts = useDepartments(); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<any>({ resolver: zodResolver(SCHEMAS[key] as any), defaultValues: { admissionYear: 2023, currentSemester: 1, firstYearGroup: '', department: '' } });
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  if (done) return <Shell title="Request received"><Notice>Your faculty account is created. Your department HOD must approve it before you can log in.</Notice><Link className="text-sm text-teal-700" to="/login/faculty">Go to faculty login</Link></Shell>;
  const e = (k: string) => (errors as any)[k]?.message as string | undefined;
  const submit = async (v: any) => {
    setErr('');
    try {
      const body: any = { ...v }; for (const k of Object.keys(body)) if (body[k] === '' || body[k] === undefined) delete body[k];
      if (key === 'student') body.lateralEntry = !!v.lateralEntry; if (key !== 'student') delete body.privacyAccepted;
      const r = await api(ENDPOINT[key], { body });
      if (r.pendingApproval) setDone(true); else { const me = await refresh(); nav(homeFor(r.user.role)); void me; }
    } catch (x) { setErr(x instanceof ApiError && x.details ? Object.entries(x.details).map(([k, m]) => `${k}: ${m.join(', ')}`).join('. ') : errMsg(x)); }
  };
  return (
    <Shell title={`${PORTALS[key].label} sign up`} sub={key === 'hod' ? 'HOD sign-up needs the access code your institution gave you.' : key === 'faculty' ? 'A department HOD approves each faculty account.' : 'Create your portfolio account. Your branch decides which mentors can find you.'}>
      {err && <Notice tone="err">{err}</Notice>}
      <form className="space-y-3" onSubmit={handleSubmit(submit)} noValidate>
        <Field label="Full name" error={e('fullName')}><Input autoComplete="name" {...register('fullName')} /></Field>
        <Field label="Institutional email" error={e('email')} hint="Example: nnm23is093@nmamit.in"><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label={key === 'student' ? 'Your branch' : 'Your department'} error={e('department')}><Select {...register('department')}><option value="" disabled>Select</option>{depts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select></Field>
        {key === 'student' && (<>
          <Field label="USN" error={e('usn')}><Input {...register('usn')} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Admission year" error={e('admissionYear')}><Input type="number" {...register('admissionYear')} /></Field>
            <Field label="Current semester" error={e('currentSemester')}><Select {...register('currentSemester')}>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field></div>
          <Field label="First-year group" error={e('firstYearGroup')} hint="Group I or II, as given in your first-year timetable. It decides which first-year subjects fall in semester 1 and 2."><Select {...register('firstYearGroup')}><option value="" disabled>Select</option><option value="I">Group I</option><option value="II">Group II</option></Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Section (optional)"><Input {...register('section')} /></Field>
            <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" {...register('lateralEntry')} />Lateral entry (diploma)</label></div></>)}
        {key === 'faculty' && (<><Field label="Designation (optional)"><Input {...register('designation')} /></Field><Field label="Employee ID (optional)"><Input {...register('employeeId')} /></Field></>)}
        {key === 'hod' && (<><Field label="HOD access code" error={e('accessCode')}><Input type="password" autoComplete="off" {...register('accessCode')} /></Field><Field label="Employee ID (optional)"><Input {...register('employeeId')} /></Field></>)}
        <Field label="Password" error={e('password')} hint="10+ characters with upper and lower case letters and a digit"><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Confirm password" error={e('confirmPassword')}><Input type="password" autoComplete="new-password" {...register('confirmPassword')} /></Field>
        {key === 'student' && <div><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" {...register('privacyAccepted')} />I accept the privacy notice: my academic records are visible to my mentor and my department HOD.</label>{e('privacyAccepted') && <span role="alert" className="text-xs text-red-700">{e('privacyAccepted')}</span>}</div>}
        <Button type="submit" busy={isSubmitting} className="w-full">Create account</Button>
      </form>
      <div className="flex flex-col gap-1 text-sm text-teal-700"><Link to={`/login/${key}`}>Already have an account? Log in</Link><Link to="/">Choose a different role</Link></div>
    </Shell>);
}

export function ChangePasswordForm({ forced }: { forced?: boolean }) {
  const { refresh } = useAuth(); const nav = useNavigate(); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<{ currentPassword: string; newPassword: string; confirm: string }>({ resolver: zodResolver(z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: pw, confirm: z.string() }).refine((d) => d.newPassword === d.confirm, { path: ['confirm'], message: 'Passwords do not match', when: () => true })) });
  return (
    <form className="space-y-3" onSubmit={handleSubmit(async (v) => { setErr(''); setOk(false); try { await api('/api/auth/change-password', { body: { currentPassword: v.currentPassword, newPassword: v.newPassword } }); const me = await refresh(); reset(); setOk(true); if (forced && me) nav(homeFor(me.role)); } catch (x) { setErr(errMsg(x)); } })} noValidate>
      {err && <Notice tone="err">{err}</Notice>}{ok && <Notice>Password changed. Your other sessions were signed out.</Notice>}
      <Field label={forced ? 'Temporary password' : 'Current password'} error={errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...register('currentPassword')} /></Field>
      <Field label="New password" error={errors.newPassword?.message} hint="10+ characters with upper and lower case letters and a digit"><Input type="password" autoComplete="new-password" {...register('newPassword')} /></Field>
      <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
      <Button type="submit" busy={isSubmitting}>Change password</Button>
    </form>);
}
export function ForcedChangePassword() {
  const { user, loading } = useAuth(); if (!loading && !user) return <Navigate to="/" replace />;
  return <Shell title="Choose a new password" sub="Your account is using a temporary password. Choose your own to continue."><ChangePasswordForm forced /></Shell>;
}
export const NotFound = () => <Shell title="Page not found"><Link className="text-sm text-teal-700" to="/">Go to the start page</Link></Shell>;
export const Unauthorized = () => <Shell title="No access"><Notice tone="err">Your account does not have permission to view that page.</Notice><Link className="text-sm text-teal-700" to="/">Go to your dashboard</Link></Shell>;
