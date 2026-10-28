import { cloneElement, forwardRef, useId, type ReactElement, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export const Card = ({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`rounded-lg border border-navy-100 bg-white p-4 sm:p-5 ${className}`}>
    {(title || action) && <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-navy-900">{title}</h2>{action}</div>}
    {children}
  </section>
);
const variants = { primary: 'bg-navy-900 text-white hover:bg-navy-800', teal: 'bg-teal-600 text-white hover:bg-teal-700', ghost: 'bg-white text-navy-900 border border-navy-100 hover:bg-navy-50', danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50' };
export function Button({ variant = 'primary', busy, children, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; busy?: boolean }) {
  return <button {...p} disabled={p.disabled || busy} className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${variants[variant]} ${className}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</button>;
}
export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactElement<any> }) {
  const id = useId(); const describedBy = [hint && !error ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1 block font-medium text-navy-900">{label}</label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && <span id={`${id}-hint`} className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span id={`${id}-err`} role="alert" className="mt-1 block text-xs text-red-700">{error}</span>}
    </div>);
}
const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-teal-600';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((p, r) => <input ref={r} {...p} className={`${inputCls} ${p.className ?? ''}`} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>((p, r) => <select ref={r} {...p} className={`${inputCls} ${p.className ?? ''}`} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((p, r) => <textarea ref={r} rows={3} {...p} className={`${inputCls} ${p.className ?? ''}`} />);
Input.displayName = 'Input'; Select.displayName = 'Select'; Textarea.displayName = 'Textarea';

// Verification status is always shown as text plus colour, never colour alone.
const STATUS: Record<string, [string, string]> = {
  draft: ['Draft · student-entered', 'bg-slate-100 text-slate-700'], awaiting_mentor_review: ['Awaiting mentor review', 'bg-amber-100 text-amber-800'],
  changes_requested: ['Changes requested', 'bg-orange-100 text-orange-800'], pending_hod_endorsement: ['Mentor verified · awaiting HOD', 'bg-sky-100 text-sky-800'],
  hod_endorsed: ['HOD endorsed', 'bg-teal-100 text-teal-800'], officially_verified: ['Officially verified', 'bg-emerald-100 text-emerald-800'], rejected: ['Rejected', 'bg-red-100 text-red-800'],
  proposed: ['Proposed', 'bg-slate-100 text-slate-700'], accepted: ['Accepted', 'bg-sky-100 text-sky-800'], in_progress: ['In progress', 'bg-amber-100 text-amber-800'],
  evidence_submitted: ['Evidence submitted', 'bg-sky-100 text-sky-800'], completed: ['Completed', 'bg-teal-100 text-teal-800'], declined: ['Declined', 'bg-slate-200 text-slate-700'], closed: ['Closed', 'bg-slate-200 text-slate-700'],
  not_started: ['Not started', 'bg-slate-100 text-slate-700'], dropped: ['Dropped', 'bg-slate-200 text-slate-700'], scheduled: ['Scheduled', 'bg-sky-100 text-sky-800'], cancelled: ['Cancelled', 'bg-slate-200 text-slate-700'],
  approved: ['Approved', 'bg-teal-100 text-teal-800'], pending_review: ['Pending review', 'bg-amber-100 text-amber-800'], inactive: ['Inactive', 'bg-slate-200 text-slate-700'] };
export const StatusBadge = ({ status }: { status: string }) => { const [t, c] = STATUS[status] ?? [status.replace(/_/g, ' '), 'bg-slate-100 text-slate-700']; return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{t}</span>; };
export const Spinner = () => <div role="status" className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading…</div>;
export const ErrorBox = ({ message, retry }: { message: string; retry?: () => void }) => <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message} {retry && <button onClick={retry} className="font-medium underline">Try again</button>}</div>;
export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-md border border-dashed border-navy-100 p-4 text-sm text-slate-500">{children}</p>;
export const Notice = ({ tone = 'ok', children }: { tone?: 'ok' | 'err'; children: ReactNode }) => <p role={tone === 'err' ? 'alert' : 'status'} className={`rounded-md p-3 text-sm ${tone === 'err' ? 'bg-red-50 text-red-800' : 'bg-teal-100 text-teal-800'}`}>{children}</p>;
export const Stat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' }) => <div className="rounded-lg border border-navy-100 bg-white p-4"><div className={`text-2xl font-semibold ${tone === 'warn' ? 'text-orange-700' : 'text-navy-900'}`}>{value}</div><div className="mt-1 text-sm text-slate-600">{label}</div></div>;
export const fmt = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
