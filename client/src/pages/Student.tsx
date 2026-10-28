import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { Button, Card, Empty, ErrorBox, Field, Input, Notice, Select, Spinner, Stat, StatusBadge, Textarea, fmt } from '../components/ui';
import { Timeline } from '../components/Timeline';

export function StudentDashboard() {
  const d = useFetch<any>('/api/student/dashboard'); const subs = useFetch<any[]>('/api/student/subjects');
  if (d.loading || subs.loading) return <Spinner />; if (d.error) return <ErrorBox message={d.error} retry={d.reload} />;
  const x = d.data;
  const bySem = new Map<number, { m1: number[]; m2: number[] }>();
  for (const s of subs.data ?? []) { const a = s.assessment; if (!a) continue; const e = bySem.get(s.semester) ?? { m1: [], m2: [] }; if (a.mse1 != null) e.m1.push(a.mse1); if (a.mse2 != null) e.m2.push(a.mse2); bySem.set(s.semester, e); }
  const avg = (v: number[]) => (v.length ? Math.round((v.reduce((p, c) => p + c, 0) / v.length) * 10) / 10 : null);
  const chart = [...bySem.entries()].sort((a, b) => a[0] - b[0]).map(([sem, e]) => ({ semester: `Sem ${sem}`, MSE1: avg(e.m1), MSE2: avg(e.m2) }));
  const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return (<>
    <h1 className="text-xl font-semibold text-navy-900">Your dashboard</h1>
    {!x.hasMentor && <Notice tone="err">You do not have a mentor yet. Your HOD assigns mentors; your records stay private to you until then.</Notice>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Pending submissions" value={x.pendingSubmissions} /><Stat label="Active goals" value={x.activeGoals} /><Stat label="Overdue actions" value={x.overdueRecommendations.length} tone={x.overdueRecommendations.length ? 'warn' : undefined} /><Stat label="Records endorsed by HOD" value={`${x.assessmentStatuses.hod_endorsed ?? 0} of ${total(x.assessmentStatuses)}`} />
    </div>
    <Card title="Average MSE marks by semester (student-entered)">{chart.length ? <div className="h-64"><ResponsiveContainer><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="#E4EAF4" /><XAxis dataKey="semester" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="MSE1" stroke="#0F2147" strokeWidth={2} connectNulls /><Line type="monotone" dataKey="MSE2" stroke="#0F8B8D" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div> : <Empty>Add subjects and marks in your academic portfolio to see your trend.</Empty>}</Card>
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Upcoming deadlines">{x.upcomingDeadlines.length ? <ul className="space-y-2 text-sm">{x.upcomingDeadlines.map((u: any, i: number) => <li key={i} className="flex justify-between"><span>{u.title}</span><span className="text-slate-500">{fmt(u.date)}</span></li>)}</ul> : <Empty>Nothing due in the next 14 days.</Empty>}</Card>
      <Card title="Overdue actions">{x.overdueRecommendations.length ? <ul className="space-y-2 text-sm">{x.overdueRecommendations.map((r: any) => <li key={r._id} className="flex justify-between"><span>{r.title}</span><span className="text-orange-700">Due {fmt(r.deadline)}</span></li>)}</ul> : <Empty>You are up to date.</Empty>}</Card>
      <Card title="Recent mentor feedback">{x.recentFeedback.length ? <ul className="space-y-2 text-sm">{x.recentFeedback.map((f: any, i: number) => <li key={i}>{f.text}<div className="text-xs text-slate-500">{fmt(f.createdAt)}</div></li>)}</ul> : <Empty>No feedback yet.</Empty>}</Card>
      <Card title="Upcoming meetings">{x.upcomingMeetings.length ? <ul className="space-y-2 text-sm">{x.upcomingMeetings.map((m: any) => <li key={m._id}>{fmt(m.scheduledAt)} — {m.agenda || 'Mentoring meeting'}</li>)}</ul> : <Empty>No meetings scheduled.</Empty>}</Card>
    </div></>);
}

type Rules = { mse1Max: number; mse2Max: number; task1Max: number; task2Max: number; task3Max: number };
const optNum = (max: number | null | undefined, label: string) => z.union([z.literal(''), z.coerce.number().min(0, `${label} cannot be negative`).refine((n) => max == null || n <= max, `${label} is out of ${max}`)]);
const num = (v: any) => (v === '' || v == null ? null : Number(v));
const DEFAULT_RULES: Rules = { mse1Max: 20, mse2Max: 20, task1Max: 4, task2Max: 4, task3Max: 2 };

export function SubjectCard({ s, onChange, rules = DEFAULT_RULES }: { s: any; onChange: () => void; rules?: Rules }) {
  const a = s.assessment; const locked = a?.status === 'awaiting_mentor_review'; const theory = s.hasMse !== false;
  const schema = theory
    ? z.object({ mse1: optNum(rules.mse1Max, 'MSE1'), mse2: optNum(rules.mse2Max, 'MSE2'), task1: optNum(rules.task1Max, 'TASK1'), task2: optNum(rules.task2Max, 'TASK2'), task3: optNum(rules.task3Max, 'TASK3'), comments: z.string().max(1000).optional(), improvementAreas: z.string().max(1000).optional() })
    : z.object({ cieMarks: optNum(s.cieMax, 'CIE marks'), comments: z.string().max(1000).optional(), improvementAreas: z.string().max(1000).optional() });
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<any>({ resolver: zodResolver(schema as any), defaultValues: { mse1: a?.mse1 ?? '', mse2: a?.mse2 ?? '', task1: a?.task1 ?? '', task2: a?.task2 ?? '', task3: a?.task3 ?? '', cieMarks: a?.cieMarks ?? '', comments: a?.comments ?? '', improvementAreas: a?.improvementAreas ?? '' } });
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null); const [hist, setHist] = useState(false);
  const docs = useFetch<any[]>(a ? `/api/documents?recordType=AssessmentRecord&recordId=${a._id}` : null);
  const sub = (['task1', 'task2', 'task3'] as const).reduce((p, k) => p + (Number(watch(k)) || 0), 0);
  const theoryCie = (Number(watch('mse1')) || 0) + (Number(watch('mse2')) || 0) + sub;
  const save = handleSubmit(async (v: any) => {
    setMsg(null);
    try { await api(`/api/student/subjects/${s._id}/assessment`, { method: 'PUT', body: theory ? { mse1: num(v.mse1), mse2: num(v.mse2), task1: num(v.task1), task2: num(v.task2), task3: num(v.task3), comments: v.comments || undefined, improvementAreas: v.improvementAreas || undefined } : { cieMarks: num(v.cieMarks), comments: v.comments || undefined, improvementAreas: v.improvementAreas || undefined } }); setMsg({ t: 'ok', m: 'Saved.' }); onChange(); }
    catch (e) { setMsg({ t: 'err', m: errMsg(e) }); }
  });
  const e = (k: string) => (errors as any)[k]?.message as string | undefined;
  return (
    <Card title={`${s.code} · ${s.name}`} action={a && <StatusBadge status={a.status} />}>
      <p className="-mt-2 mb-3 text-xs text-slate-500">{s.category} · {s.credits} credit{s.credits === 1 ? '' : 's'}{s.slot ? ` · elective (${s.slot})` : ''}</p>
      <form onSubmit={save} className="space-y-3" noValidate>
        <fieldset disabled={locked} className="space-y-3">
          {theory ? (<>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label={`MSE1 (max ${rules.mse1Max})`} error={e('mse1')}><Input inputMode="decimal" {...register('mse1')} /></Field><Field label={`MSE2 (max ${rules.mse2Max})`} error={e('mse2')}><Input inputMode="decimal" {...register('mse2')} /></Field>
              <Field label={`TASK1 (max ${rules.task1Max})`} error={e('task1')}><Input inputMode="decimal" {...register('task1')} /></Field><Field label={`TASK2 (max ${rules.task2Max})`} error={e('task2')}><Input inputMode="decimal" {...register('task2')} /></Field><Field label={`TASK3 (max ${rules.task3Max})`} error={e('task3')}><Input inputMode="decimal" {...register('task3')} /></Field>
            </div>
            <p className="text-sm text-slate-600">Task subtotal: <b>{sub}</b> / {rules.task1Max + rules.task2Max + rules.task3Max} · MSE1 + MSE2 + tasks so far: <b>{theoryCie}</b> / {rules.mse1Max + rules.mse2Max + rules.task1Max + rules.task2Max + rules.task3Max}</p></>) : (<>
            <div className="max-w-xs"><Field label={`CIE marks (max ${s.cieMax})`} error={e('cieMarks')} hint="This course has no MSEs or tasks. Enter your continuous internal evaluation marks."><Input inputMode="decimal" {...register('cieMarks')} /></Field></div></>)}
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Comments"><Textarea {...register('comments')} /></Field><Field label="Areas to improve"><Textarea {...register('improvementAreas')} /></Field></div>
        </fieldset>
        {locked && <Notice>This record is with your mentor. You can edit it again after they respond.</Notice>}
        {a?.status === 'hod_endorsed' && <Notice>Editing an endorsed record keeps the endorsed version and sends your change for review again.</Notice>}
        {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={isSubmitting} disabled={locked}>Save marks</Button>
          {a && ['draft', 'changes_requested'].includes(a.status) && <Button type="button" variant="teal" onClick={async () => { try { await api(`/api/student/assessments/${a._id}/submit`, { body: {} }); onChange(); } catch (x) { setMsg({ t: 'err', m: errMsg(x) }); } }}>Submit for mentor review</Button>}
          {a && <Button type="button" variant="ghost" onClick={() => setHist(!hist)}>{hist ? 'Hide history' : 'View history'}</Button>}
        </div>
      </form>
      {a && <div className="mt-3 border-t border-navy-100 pt-3 text-sm"><div className="mb-2 font-medium text-navy-900">Supporting evidence</div>
        {docs.data?.map((d) => <div key={d._id} className="flex items-center gap-3 py-1"><a className="text-teal-700 underline" href={`/api/documents/${d._id}/download`}>{d.originalName}</a><button className="text-xs text-red-700 underline" onClick={async () => { await api(`/api/documents/${d._id}`, { method: 'DELETE' }); docs.reload(); }}>Remove</button></div>)}
        <label className="mt-1 inline-block text-sm text-teal-700 underline"><input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={async (ev) => { const f = ev.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('recordType', 'AssessmentRecord'); fd.append('recordId', a._id); fd.append('file', f); try { await api('/api/documents', { body: fd }); docs.reload(); } catch (x) { setMsg({ t: 'err', m: errMsg(x) }); } ev.target.value = ''; }} />Attach a PDF, PNG or JPEG (5 MB max)</label></div>}
      {hist && a && <div className="mt-3"><Timeline type="AssessmentRecord" id={a._id} /></div>}
    </Card>);
}

function SlotPicker({ slot, onDone }: { slot: any; onDone: () => void }) {
  const [pick, setPick] = useState(''); const [err, setErr] = useState('');
  const groups = new Map<string, any[]>(); for (const o of slot.options) { const k = o.stream ?? (o.offeredBy ? `Offered by ${o.offeredBy}` : 'Courses'); groups.set(k, [...(groups.get(k) ?? []), o]); }
  return (
    <div className="rounded-md border border-navy-100 p-3">
      <p className="text-sm font-medium text-navy-900">{slot.label} <span className="font-normal text-slate-500">· {slot.credits} credits</span></p>
      {slot.chosen ? <p className="mt-1 text-sm text-teal-700">Chosen: {slot.chosen.code} · {slot.chosen.name}</p> : (<>
        {err && <Notice tone="err">{err}</Notice>}
        <div className="mt-2 flex flex-wrap items-end gap-2"><div className="min-w-[16rem] flex-1"><Field label="Choose one"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Select a course</option>
          {[...groups.entries()].map(([g, os]) => <optgroup key={g} label={g}>{os.map((o) => <option key={o._id} value={o._id}>{o.code} · {o.title} ({o.credits} cr)</option>)}</optgroup>)}</Select></Field></div>
          <Button disabled={!pick} onClick={async () => { setErr(''); try { await api('/api/student/curriculum/elective', { body: { slot: slot.slot, courseId: pick } }); onDone(); } catch (e) { setErr(errMsg(e)); } }}>Add</Button></div>
        <p className="mt-1 text-xs text-slate-500">You can change an elective until you enter marks for it.</p></>)}
    </div>);
}

function GroupCard({ current, onSaved }: { current: 'I' | 'II' | null; onSaved: () => void }) {
  const [g, setG] = useState<string>(current ?? ''); const [err, setErr] = useState('');
  return (
    <Card title="First-year group">
      <p className="mb-2 text-sm text-slate-600">Group I takes table A in semester 1 and table B in semester 2; Group II takes the reverse. Use the group from your first-year timetable. You can change it until you add first-year subjects.</p>
      {err && <Notice tone="err">{err}</Notice>}
      <div className="flex flex-wrap items-end gap-2"><div className="w-44"><Field label="Your group"><Select value={g} onChange={(e) => setG(e.target.value)}><option value="" disabled>Select</option><option value="I">Group I</option><option value="II">Group II</option></Select></Field></div>
        <Button disabled={!g || g === current} onClick={async () => { setErr(''); try { await api('/api/student/profile', { method: 'PUT', body: { firstYearGroup: g } }); onSaved(); } catch (e) { setErr(errMsg(e)); } }}>Save group</Button></div>
    </Card>);
}

export function Portfolio() {
  const [sem, setSem] = useState(1); const sems = useFetch<any[]>('/api/student/semesters'); const cur = useFetch<any>('/api/student/curriculum'); const rules = useFetch<Rules>('/api/student/assessment-rules');
  const subs = useFetch<any[]>(`/api/student/subjects?semester=${sem}`); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const refreshAll = () => { subs.reload(); sems.reload(); cur.reload(); };
  const info = cur.data?.available ? cur.data.semesters[sem - 1] : null;
  return (<>
    <h1 className="text-xl font-semibold text-navy-900">Academic portfolio</h1>
    <div role="tablist" aria-label="Semesters" className="flex flex-wrap gap-2">{Array.from({ length: 8 }, (_, i) => i + 1).map((n) => { const c = sems.data?.[n - 1]; return <button key={n} role="tab" aria-selected={sem === n} onClick={() => setSem(n)} className={`rounded-md border px-3 py-1.5 text-sm ${sem === n ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-100 bg-white'}`}>Sem {n}{c?.subjects ? ` (${c.subjects})` : ''}</button>; })}</div>
    {cur.loading ? <Spinner /> : cur.error ? <ErrorBox message={cur.error} retry={cur.reload} /> : !cur.data.available ? (
      <Notice tone="err">The syllabus for your branch and batch has not been added yet, so subjects cannot be registered. Ask your HOD to add the curriculum, then come back.</Notice>
    ) : (<>
      {err && <Notice tone="err">{err}</Notice>}
      {cur.data.needsGroup && <Notice tone="err">We do not have your first-year group yet. Choose it below so your first-year subjects fall in the right semester.</Notice>}
      {(cur.data.needsGroup || (sem <= 2 && cur.data.canChangeGroup)) && <GroupCard current={cur.data.firstYearGroup} onSaved={refreshAll} />}
      {info.core.length > 0 && !info.loaded && (
        <Card title={`Semester ${sem} subjects`}>
          <p className="mb-2 text-sm text-slate-600">These are the courses in your syllabus for semester {sem}. Add them all in one step.</p>
          <ul className="mb-3 grid gap-1 text-sm sm:grid-cols-2">{info.core.map((c: any) => <li key={c.code}>{c.code} · {c.title} <span className="text-slate-500">({c.credits} cr)</span></li>)}</ul>
          <Button busy={busy} onClick={async () => { setErr(''); setBusy(true); try { await api('/api/student/curriculum/load', { body: { semester: sem } }); refreshAll(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } }}>Add semester {sem} subjects</Button>
        </Card>)}
      {info.slots.length > 0 && <Card title={`Electives for semester ${sem}`}><div className="space-y-3">{info.slots.map((sl: any) => <SlotPicker key={sl.slot + (sl.chosen?.code ?? '')} slot={sl} onDone={refreshAll} />)}</div></Card>}
      {info.core.length === 0 && info.slots.length === 0 && <Empty>No courses are defined for semester {sem}.</Empty>}
    </>)}
    {subs.loading ? <Spinner /> : subs.error ? <ErrorBox message={subs.error} retry={subs.reload} /> : subs.data!.map((s) => <SubjectCard key={s._id + (s.assessment?.version ?? 0) + (s.assessment?.status ?? '')} s={s} rules={rules.data ?? DEFAULT_RULES} onChange={refreshAll} />)}
  </>);
}

const CATS = ['internship', 'project', 'hackathon', 'coding_competition', 'workshop', 'certification', 'online_course', 'research', 'publication', 'paper_presentation', 'open_source', 'technical_club', 'cultural', 'sports', 'volunteering', 'leadership', 'entrepreneurship', 'placement_preparation', 'mock_interview', 'resume'];
export const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export function Activities() {
  const list = useFetch<any[]>('/api/student/activities'); const { register, handleSubmit, reset } = useForm<any>({ defaultValues: { semester: 5, category: 'project' } }); const [err, setErr] = useState(''); const [open, setOpen] = useState<string | null>(null);
  return (<>
    <h1 className="text-xl font-semibold text-navy-900">Activities and professional development</h1>
    <Card title="Add an activity">{err && <Notice tone="err">{err}</Notice>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api('/api/student/activities', { body: { semester: Number(v.semester), category: v.category, name: v.name, description: v.description || undefined, date: v.date || undefined, organizer: v.organizer || undefined, role: v.role || undefined, achievement: v.achievement || undefined, skills: v.skills ? String(v.skills).split(',').map((x: string) => x.trim()).filter(Boolean) : undefined } }); reset({ semester: v.semester, category: v.category }); list.reload(); } catch (e) { setErr(errMsg(e)); } })}>
        <Field label="Activity name"><Input required {...register('name')} /></Field><Field label="Category"><Select {...register('category')}>{CATS.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
        <Field label="Semester"><Input type="number" min={1} max={8} required {...register('semester')} /></Field><Field label="Date"><Input type="date" {...register('date')} /></Field>
        <Field label="Organizer"><Input {...register('organizer')} /></Field><Field label="Your role"><Input {...register('role')} /></Field>
        <Field label="Achievement"><Input {...register('achievement')} /></Field><Field label="Skills developed" hint="Comma-separated"><Input {...register('skills')} /></Field>
        <div className="sm:col-span-2"><Field label="Description"><Textarea {...register('description')} /></Field></div><div className="sm:col-span-2"><Button type="submit">Save as draft</Button></div>
      </form></Card>
    {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} retry={list.reload} /> : list.data!.length ? list.data!.map((a) => (
      <Card key={a._id} title={a.name} action={<StatusBadge status={a.status} />}>
        <p className="text-sm text-slate-600">{pretty(a.category)} · Semester {a.semester} · {fmt(a.date)}{a.achievement ? ` · ${a.achievement}` : ''}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['draft', 'changes_requested'].includes(a.status) && <Button variant="teal" onClick={async () => { try { await api(`/api/student/activities/${a._id}/submit`, { body: {} }); list.reload(); } catch (e) { setErr(errMsg(e)); } }}>Submit for mentor review</Button>}
          <Button variant="ghost" onClick={() => setOpen(open === a._id ? null : a._id)}>{open === a._id ? 'Hide history' : 'View history'}</Button></div>
        {open === a._id && <div className="mt-3"><Timeline type="StudentActivity" id={a._id} /></div>}
      </Card>)) : <Empty>No activities yet. Add internships, projects, hackathons and more above.</Empty>}
  </>);
}

const GCATS = ['improve_mse', 'subject_fundamentals', 'coding_practice', 'technical_skill', 'certification', 'project', 'hackathon', 'internship_prep', 'communication', 'placement_prep', 'research'];
function RecCard({ r, reload }: { r: any; reload: () => void }) {
  const [note, setNote] = useState(''); const [err, setErr] = useState('');
  const act = async (action: string) => { setErr(''); try { await api(`/api/student/recommendations/${r._id}/action`, { body: { action, note: note || undefined } }); setNote(''); reload(); } catch (e) { setErr(errMsg(e)); } };
  const btns: Record<string, [string, string][]> = { proposed: [['accept', 'Accept'], ['decline', 'Decline (add reason)']], accepted: [['start', 'Mark in progress'], ['decline', 'Decline (add reason)']], in_progress: [['submit_evidence', 'Submit evidence (add note)'], ['decline', 'Decline (add reason)']], evidence_submitted: [['complete', 'Mark completed']] };
  return (<Card title={r.title} action={<StatusBadge status={r.status} />}>
    <p className="text-sm text-slate-600">{r.description}{r.reason ? ` Why: ${r.reason}` : ''}</p>
    <p className="mt-1 text-sm">Deadline: <span className={r.overdue ? 'font-medium text-orange-700' : ''}>{fmt(r.deadline)}{r.overdue ? ' (overdue, let your mentor know if you need more time)' : ''}</span>{r.followUpDate ? ` · Follow-up ${fmt(r.followUpDate)}` : ''}</p>
    {r.mentorFeedback?.map((f: any, i: number) => <p key={i} className="mt-1 rounded bg-navy-50 p-2 text-sm">Mentor: {f.text}</p>)}
    {err && <Notice tone="err">{err}</Notice>}
    {!['completed', 'declined', 'closed'].includes(r.status) && <div className="mt-3 space-y-2"><Field label="Progress note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">{(btns[r.status] ?? []).map(([a, l]) => <Button key={a} variant={a === 'decline' ? 'danger' : 'teal'} onClick={() => act(a)}>{l}</Button>)}<Button variant="ghost" onClick={() => act('add_note')}>Add note</Button></div></div>}
  </Card>);
}
export function Goals() {
  const goals = useFetch<any[]>('/api/student/goals'); const recs = useFetch<any[]>('/api/student/recommendations'); const { register, handleSubmit, reset } = useForm<any>({ defaultValues: { category: 'coding_practice', priority: 'medium' } }); const [err, setErr] = useState('');
  return (<>
    <h1 className="text-xl font-semibold text-navy-900">Goals and mentor recommendations</h1>
    <Card title="Mentor recommendations">{recs.loading ? <Spinner /> : recs.error ? <ErrorBox message={recs.error} retry={recs.reload} /> : recs.data!.length ? <div className="space-y-3">{recs.data!.map((r) => <RecCard key={r._id + r.status + (r.studentNotes?.length ?? 0)} r={r} reload={recs.reload} />)}</div> : <Empty>No recommendations yet. Your mentor can suggest next steps here.</Empty>}</Card>
    <Card title="Set a goal">{err && <Notice tone="err">{err}</Notice>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api('/api/student/goals', { body: { title: v.title, category: v.category, priority: v.priority, description: v.description || undefined, targetDate: v.targetDate || undefined, successCriteria: v.successCriteria || undefined, relatedSemester: v.relatedSemester ? Number(v.relatedSemester) : undefined } }); reset({ category: v.category, priority: v.priority }); goals.reload(); } catch (e) { setErr(errMsg(e)); } })}>
        <Field label="Title"><Input required {...register('title')} /></Field><Field label="Category"><Select {...register('category')}>{GCATS.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
        <Field label="Priority"><Select {...register('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field><Field label="Target date"><Input type="date" {...register('targetDate')} /></Field>
        <Field label="Related semester (optional)"><Input type="number" min={1} max={8} {...register('relatedSemester')} /></Field><Field label="Success criteria"><Input {...register('successCriteria')} /></Field>
        <div className="sm:col-span-2"><Field label="Description"><Textarea {...register('description')} /></Field></div><div className="sm:col-span-2"><Button type="submit">Add goal</Button></div></form></Card>
    {goals.loading ? <Spinner /> : goals.data!.map((g) => <GoalCard key={g._id + g.progress} g={g} reload={goals.reload} />)}
  </>);
}
function GoalCard({ g, reload }: { g: any; reload: () => void }) {
  const [text, setText] = useState(''); const [p, setP] = useState(g.progress); const [err, setErr] = useState('');
  return (<Card title={g.title} action={<StatusBadge status={g.status} />}>
    <div className="h-2 w-full overflow-hidden rounded bg-navy-100" role="progressbar" aria-valuenow={g.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress"><div className="h-full bg-teal-600" style={{ width: `${g.progress}%` }} /></div>
    <p className="mt-2 text-sm text-slate-600">{pretty(g.category)} · {g.priority} priority · Target {fmt(g.targetDate)} · {g.progress}%</p>
    {g.updates?.slice(-2).map((u: any, i: number) => <p key={i} className="mt-1 text-sm text-slate-600">{fmt(u.at)}: {u.text}</p>)}
    {err && <Notice tone="err">{err}</Notice>}
    {!['completed', 'dropped'].includes(g.status) && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end"><Field label="Progress update"><Input value={text} onChange={(e) => setText(e.target.value)} /></Field><Field label="Progress %"><Input type="number" min={0} max={100} value={p} onChange={(e) => setP(Number(e.target.value))} /></Field><Button onClick={async () => { try { await api(`/api/student/goals/${g._id}/updates`, { body: { text, progress: p } }); setText(''); reload(); } catch (e) { setErr(errMsg(e)); } }} disabled={!text.trim()}>Post update</Button></div>}
  </Card>);
}

export function Feedback() {
  const fb = useFetch<any[]>('/api/student/feedback'); const rf = useFetch<any[]>('/api/student/reflections'); const { register, handleSubmit, reset } = useForm<{ text: string; semester: string }>(); const [err, setErr] = useState('');
  return (<>
    <h1 className="text-xl font-semibold text-navy-900">Feedback and reflections</h1>
    <Card title="Feedback from your mentor">{fb.loading ? <Spinner /> : fb.data!.length ? <ul className="space-y-3 text-sm">{fb.data!.map((f, i) => <li key={i}>{f.text}<div className="text-xs text-slate-500">{fmt(f.createdAt)}</div></li>)}</ul> : <Empty>No feedback shared yet.</Empty>}<p className="mt-3 text-xs text-slate-500">Only feedback your mentor chose to share appears here.</p></Card>
    <Card title="Your reflections">{err && <Notice tone="err">{err}</Notice>}
      <form className="space-y-3" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api('/api/student/reflections', { body: { text: v.text, semester: v.semester ? Number(v.semester) : undefined } }); reset(); rf.reload(); } catch (e) { setErr(errMsg(e)); } })}>
        <Field label="What went well, and what would you change?"><Textarea required {...register('text')} /></Field><Field label="Semester (optional)"><Input type="number" min={1} max={8} {...register('semester')} /></Field><Button type="submit">Save reflection</Button></form>
      <ul className="mt-4 space-y-2 text-sm">{rf.data?.map((r) => <li key={r._id} className="rounded bg-navy-50 p-2">{r.text}<div className="text-xs text-slate-500">{fmt(r.createdAt)}{r.semester ? ` · Semester ${r.semester}` : ''}</div></li>)}</ul></Card>
  </>);
}
