import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { api, errMsg } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { Button, Card, Empty, ErrorBox, Field, Input, Notice, Select, Spinner, Stat, StatusBadge, Textarea, fmt } from '../components/ui';
import { Timeline } from '../components/Timeline';
import { pretty } from './Student';

export function MentorDashboard() {
  const { data: d, loading, error, reload } = useFetch<any>('/api/mentor/dashboard');
  if (loading) return <Spinner />; if (error) return <ErrorBox message={error} retry={reload} />;
  return (<>
    <h1 className="text-xl font-semibold text-navy-900">Mentor dashboard</h1>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Assigned mentees" value={d.mentees} /><Stat label="Assessments awaiting review" value={d.awaitingReview.assessments} /><Stat label="Activities awaiting review" value={d.awaitingReview.activities} /><Stat label="Overdue recommendations" value={d.overdueRecommendations.length} tone={d.overdueRecommendations.length ? 'warn' : undefined} /></div>
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Follow-ups due this week">{d.followUpsDue.length ? <ul className="space-y-2 text-sm">{d.followUpsDue.map((r: any) => <li key={r._id} className="flex justify-between"><Link className="text-teal-700 underline" to={`/mentor/mentees/${r.student}`}>{r.title}</Link><span>{fmt(r.followUpDate)}</span></li>)}</ul> : <Empty>No follow-ups due.</Empty>}</Card>
      <Card title="Upcoming meetings">{d.upcomingMeetings.length ? <ul className="space-y-2 text-sm">{d.upcomingMeetings.map((m: any) => <li key={m._id}><Link className="text-teal-700 underline" to={`/mentor/mentees/${m.student}`}>{fmt(m.scheduledAt)}</Link> — {m.agenda || 'Mentoring meeting'}</li>)}</ul> : <Empty>Nothing scheduled.</Empty>}</Card>
    </div>
    {d.overdueRecommendations.length > 0 && <Card title="Students who may want a supportive check-in"><ul className="space-y-1 text-sm">{d.overdueRecommendations.map((r: any) => <li key={r._id}>{r.title} was due {fmt(r.deadline)}</li>)}</ul></Card>}
  </>);
}

export function Mentees() {
  const { data, loading, error, reload } = useFetch<any[]>('/api/mentor/mentees'); const [err, setErr] = useState('');
  return (<><h1 className="text-xl font-semibold text-navy-900">My mentees</h1>{err && <Notice tone="err">{err}</Notice>}
    {loading ? <Spinner /> : error ? <ErrorBox message={error} retry={reload} /> : data!.length ? <Card><ul className="divide-y divide-navy-100">{data!.map((m) => (
      <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><b>{m.fullName}</b> <span className="text-slate-500">{m.usn} · Semester {m.semester}{m.section ? ` · Section ${m.section}` : ''}</span></span>
        <span className="flex gap-3"><Link className="text-teal-700 underline" to={`/mentor/mentees/${m._id}`}>Open profile</Link>
          <button className="text-red-700 underline" onClick={async () => { if (!confirm(`Stop mentoring ${m.fullName}? They become available to other mentors in your branch.`)) return; try { await api(`/api/mentor/mentees/${m._id}`, { method: 'DELETE' }); reload(); } catch (e) { setErr(errMsg(e)); } }}>Release</button></span></li>))}</ul></Card>
      : <Empty>You have no mentees yet. Use <Link className="text-teal-700 underline" to="/mentor/find">Find mentees</Link> to choose students from your branch.</Empty>}</>);
}

export function FindMentees() {
  const [q, setQ] = useState(''); const [sem, setSem] = useState(''); const path = `/api/mentor/available-students?${new URLSearchParams({ ...(q ? { q } : {}), ...(sem ? { semester: sem } : {}) })}`;
  const f = useFetch<any[]>(path); const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  return (<><h1 className="text-xl font-semibold text-navy-900">Find mentees</h1>
    <Notice>You can only see students from your own branch who do not have a mentor yet. Choosing a student makes you their mentor and gives you access to their records.</Notice>
    {msg && <Notice tone={msg.t}>{msg.m}</Notice>}
    <Card><div className="mb-3 grid gap-3 sm:grid-cols-[1fr_160px]"><Field label="Search by name or USN"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. NNM23IS093" /></Field>
      <Field label="Semester"><Select value={sem} onChange={(e) => setSem(e.target.value)}><option value="">All</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field></div>
      {f.loading ? <Spinner /> : f.error ? <ErrorBox message={f.error} retry={f.reload} /> : f.data!.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-navy-100"><th className="py-2">Student</th><th>USN</th><th>Semester</th><th>Section</th><th></th></tr></thead><tbody>
        {f.data!.map((s) => <tr key={s._id} className="border-b border-navy-50"><td className="py-2">{s.fullName}</td><td>{s.usn}</td><td>{s.semester}</td><td>{s.section ?? '—'}</td>
          <td className="text-right"><Button onClick={async () => { try { await api('/api/mentor/mentees', { body: { student: s._id } }); setMsg({ t: 'ok', m: `${s.fullName} is now your mentee.` }); f.reload(); } catch (e) { setMsg({ t: 'err', m: errMsg(e) }); f.reload(); } }}>Add as mentee</Button></td></tr>)}</tbody></table></div>
        : <Empty>No students without a mentor match. Students appear here after they sign up with your branch.</Empty>}</Card></>);
}

function ReviewBox({ url, record, verb }: { url: string; record: any; verb: 'verify' | 'endorse' }) {
  const [decision, setDecision] = useState(verb); const [comment, setComment] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  if (done) return <Notice>Decision recorded.</Notice>;
  return (<div className="mt-3 space-y-2 rounded-md bg-navy-50 p-3"><div className="grid gap-2 sm:grid-cols-[200px_1fr]"><Field label="Decision"><Select value={decision} onChange={(e) => setDecision(e.target.value as any)}><option value={verb}>{verb === 'verify' ? 'Verify' : 'Endorse'}</option><option value="request_changes">Request changes</option><option value="reject">Reject</option></Select></Field><Field label={verb === 'verify' || decision === verb ? 'Comment (optional)' : 'Comment (required)'}><Input value={comment} onChange={(e) => setComment(e.target.value)} /></Field></div>
    {err && <Notice tone="err">{err}</Notice>}<Button onClick={async () => { setErr(''); try { await api(url, { body: { decision, version: record.version, comment: comment || undefined } }); setDone(true); } catch (e) { setErr(errMsg(e)); } }}>Submit decision for version {record.version}</Button></div>);
}
export { ReviewBox };

type Tab = 'assessments' | 'activities' | 'recommendations' | 'notes' | 'meetings' | 'goals';
export function MenteePage() {
  const { id } = useParams(); const [tab, setTab] = useState<Tab>('assessments');
  const tabs: [Tab, string][] = [['assessments', 'Assessments'], ['activities', 'Activities'], ['recommendations', 'Recommendations'], ['notes', 'Notes'], ['meetings', 'Meetings'], ['goals', 'Goals & reflections']];
  return (<>
    <Link to="/mentor/mentees" className="text-sm text-teal-700 underline">All mentees</Link>
    <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold text-navy-900">Mentee profile</h1><a className="text-sm text-teal-700 underline" href={`/api/reports/portfolio/${id}.pdf`}>Download portfolio PDF</a></div>
    <div role="tablist" className="flex flex-wrap gap-2">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md border px-3 py-1.5 text-sm ${tab === k ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-100 bg-white'}`}>{l}</button>)}</div>
    {tab === 'assessments' && <MenteeAssessments id={id!} />}{tab === 'activities' && <MenteeActivities id={id!} />}{tab === 'recommendations' && <MenteeRecs id={id!} />}
    {tab === 'notes' && <MenteeNotes id={id!} />}{tab === 'meetings' && <MenteeMeetings id={id!} />}{tab === 'goals' && <MenteeGoals id={id!} />}
  </>);
}
const Load = ({ f, children }: { f: ReturnType<typeof useFetch>; children: (d: any) => any }) => f.loading ? <Spinner /> : f.error ? <ErrorBox message={f.error} retry={f.reload} /> : children(f.data);

function MenteeAssessments({ id }: { id: string }) {
  const f = useFetch<any[]>(`/api/mentor/mentees/${id}/assessments`); const [open, setOpen] = useState<string | null>(null);
  return <Load f={f}>{(d: any[]) => d.length ? <>{d.map((a) => (
    <Card key={a._id + a.status} title={`Sem ${a.semester} · ${a.subject?.code} ${a.subject?.name}`} action={<StatusBadge status={a.status} />}>
      <p className="text-sm">{a.cieMarks != null ? `CIE marks ${a.cieMarks}` : `MSE1 ${a.mse1 ?? '—'} · MSE2 ${a.mse2 ?? '—'} · TASK ${a.task1 ?? '—'}/${a.task2 ?? '—'}/${a.task3 ?? '—'} · Subtotal ${a.taskSubtotal}/10`} · Version {a.version}</p>
      {a.comments && <p className="mt-1 text-sm text-slate-600">Student comment: {a.comments}</p>}{a.improvementAreas && <p className="text-sm text-slate-600">Areas to improve: {a.improvementAreas}</p>}
      <button className="mt-2 text-sm text-teal-700 underline" onClick={() => setOpen(open === a._id ? null : a._id)}>{open === a._id ? 'Hide history' : 'View history'}</button>{open === a._id && <div className="mt-2"><Timeline type="AssessmentRecord" id={a._id} /></div>}
      {a.status === 'awaiting_mentor_review' && <ReviewBox url={`/api/mentor/assessments/${a._id}/review`} record={a} verb="verify" />}
    </Card>))}</> : <Empty>This student has not entered assessments yet.</Empty>}</Load>;
}
function MenteeActivities({ id }: { id: string }) {
  const f = useFetch<any[]>(`/api/mentor/mentees/${id}/activities`);
  return <Load f={f}>{(d: any[]) => d.length ? d.map((a) => (<Card key={a._id + a.status} title={a.name} action={<StatusBadge status={a.status} />}><p className="text-sm text-slate-600">{pretty(a.category)} · Semester {a.semester} · {a.achievement || 'No achievement listed'}</p>{a.status === 'awaiting_mentor_review' && <ReviewBox url={`/api/mentor/activities/${a._id}/review`} record={a} verb="verify" />}</Card>)) : <Empty>No activities recorded yet.</Empty>}</Load>;
}
function MenteeRecs({ id }: { id: string }) {
  const f = useFetch<any[]>('/api/mentor/recommendations'); const { register, handleSubmit, reset } = useForm<any>({ defaultValues: { priority: 'medium' } }); const [err, setErr] = useState(''); const [c, setC] = useState<Record<string, string>>({});
  const act = async (rid: string, action: string) => { setErr(''); try { await api(`/api/mentor/recommendations/${rid}/action`, { body: { action, comment: c[rid] || undefined } }); setC({ ...c, [rid]: '' }); f.reload(); } catch (e) { setErr(errMsg(e)); } };
  return (<>
    <Card title="New recommendation">{err && <Notice tone="err">{err}</Notice>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api('/api/mentor/recommendations', { body: { student: id, title: v.title, description: v.description || undefined, reason: v.reason || undefined, priority: v.priority, deadline: v.deadline || undefined, followUpDate: v.followUpDate || undefined, expectedOutcome: v.expectedOutcome || undefined, suggestedResources: v.resources ? String(v.resources).split('\n').map((x: string) => x.trim()).filter(Boolean) : undefined } }); reset({ priority: v.priority }); f.reload(); } catch (e) { setErr(errMsg(e)); } })}>
        <Field label="Title"><Input required {...register('title')} /></Field><Field label="Priority"><Select {...register('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
        <Field label="Deadline"><Input type="date" {...register('deadline')} /></Field><Field label="Follow-up date"><Input type="date" {...register('followUpDate')} /></Field>
        <Field label="Reason"><Input {...register('reason')} /></Field><Field label="Expected outcome"><Input {...register('expectedOutcome')} /></Field>
        <div className="sm:col-span-2"><Field label="Description"><Textarea {...register('description')} /></Field></div><div className="sm:col-span-2"><Field label="Suggested resources" hint="One per line"><Textarea {...register('resources')} /></Field></div><div className="sm:col-span-2"><Button type="submit">Send recommendation</Button></div></form></Card>
    <Load f={f}>{(d: any[]) => { const mine = d.filter((r) => r.student === id); return mine.length ? mine.map((r) => (
      <Card key={r._id + r.status} title={r.title} action={<StatusBadge status={r.status} />}>
        <p className="text-sm">Deadline {fmt(r.deadline)}{r.overdue ? ' · overdue' : ''} · Follow-up {fmt(r.followUpDate)}</p>
        {r.evidenceNote && <p className="mt-1 rounded bg-navy-50 p-2 text-sm">Student evidence: {r.evidenceNote}</p>}{r.declineReason && <p className="mt-1 rounded bg-navy-50 p-2 text-sm">Student reason for declining: {r.declineReason}</p>}
        {r.studentNotes?.map((n: any, i: number) => <p key={i} className="mt-1 text-sm text-slate-600">Student note: {n.text}</p>)}
        {!['declined', 'closed'].includes(r.status) && <div className="mt-3 space-y-2"><Field label="Feedback or request"><Input value={c[r._id] ?? ''} onChange={(e) => setC({ ...c, [r._id]: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => act(r._id, 'add_feedback')}>Send feedback</Button>{['evidence_submitted', 'completed'].includes(r.status) && <Button variant="ghost" onClick={() => act(r._id, 'request_further_action')}>Request further action</Button>}{r.status === 'completed' && <Button variant="teal" onClick={() => act(r._id, 'close')}>Close follow-up</Button>}</div></div>}
      </Card>)) : <Empty>No recommendations for this student yet.</Empty>; }}</Load></>);
}
function MenteeNotes({ id }: { id: string }) {
  const f = useFetch<any[]>(`/api/mentor/mentees/${id}/notes`); const { register, handleSubmit, reset } = useForm<any>({ defaultValues: { type: 'student_visible' } }); const [err, setErr] = useState('');
  return (<>
    <Card title="Add a note">{err && <Notice tone="err">{err}</Notice>}<form className="space-y-3" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api('/api/mentor/notes', { body: { student: id, type: v.type, text: v.text } }); reset({ type: v.type }); f.reload(); } catch (e) { setErr(errMsg(e)); } })}>
      <Field label="Visibility"><Select {...register('type')}><option value="student_visible">Shared with the student</option><option value="private">Private — only you can read this</option></Select></Field>
      <Field label="Note"><Textarea required {...register('text')} /></Field><Button type="submit">Save note</Button></form></Card>
    <Load f={f}>{(d: any[]) => d.length ? d.map((n) => <Card key={n._id}><span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${n.type === 'private' ? 'bg-navy-900 text-white' : 'bg-teal-100 text-teal-800'}`}>{n.type === 'private' ? 'Private (only you)' : 'Shared with student'}</span><p className="text-sm">{n.text}</p><p className="text-xs text-slate-500">{fmt(n.createdAt)}</p></Card>) : <Empty>No notes yet.</Empty>}</Load></>);
}
function MenteeMeetings({ id }: { id: string }) {
  const f = useFetch<any[]>('/api/mentor/meetings'); const { register, handleSubmit, reset } = useForm<any>(); const [err, setErr] = useState(''); const [sum, setSum] = useState<Record<string, string>>({});
  return (<>
    <Card title="Schedule a meeting">{err && <Notice tone="err">{err}</Notice>}<form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit(async (v) => { setErr(''); try { await api('/api/mentor/meetings', { body: { student: id, scheduledAt: new Date(v.when).toISOString(), agenda: v.agenda || undefined } }); reset(); f.reload(); } catch (e) { setErr(errMsg(e)); } })}>
      <Field label="Date and time"><Input type="datetime-local" required {...register('when')} /></Field><Field label="Agenda"><Input {...register('agenda')} /></Field><div className="sm:col-span-2"><Button type="submit">Schedule</Button></div></form></Card>
    <Load f={f}>{(d: any[]) => { const mine = d.filter((m) => m.student === id); return mine.length ? mine.map((m) => (<Card key={m._id + m.status} title={`${fmt(m.scheduledAt)} — ${m.agenda || 'Mentoring meeting'}`} action={<StatusBadge status={m.status} />}>
      {m.summary && <p className="text-sm">{m.summary}</p>}{m.actionItems?.map((a: any, i: number) => <p key={i} className="text-sm text-slate-600">Action: {a.text}{a.dueDate ? ` (due ${fmt(a.dueDate)})` : ''}</p>)}
      {m.status === 'scheduled' && <div className="mt-2 space-y-2"><Field label="Meeting summary"><Textarea value={sum[m._id] ?? ''} onChange={(e) => setSum({ ...sum, [m._id]: e.target.value })} /></Field><Button disabled={!sum[m._id]?.trim()} onClick={async () => { try { await api(`/api/mentor/meetings/${m._id}/complete`, { body: { summary: sum[m._id] } }); f.reload(); } catch (e) { setErr(errMsg(e)); } }}>Mark completed</Button></div>}</Card>)) : <Empty>No meetings with this student yet.</Empty>; }}</Load></>);
}
function MenteeGoals({ id }: { id: string }) {
  const g = useFetch<any[]>(`/api/mentor/mentees/${id}/goals`); const r = useFetch<any[]>(`/api/mentor/mentees/${id}/reflections`);
  return (<><Card title="Goals"><Load f={g}>{(d: any[]) => d.length ? <ul className="space-y-2 text-sm">{d.map((x) => <li key={x._id} className="flex items-center justify-between"><span>{x.title} · {x.progress}%</span><StatusBadge status={x.status} /></li>)}</ul> : <Empty>No goals set yet.</Empty>}</Load></Card>
    <Card title="Student reflections"><Load f={r}>{(d: any[]) => d.length ? <ul className="space-y-2 text-sm">{d.map((x) => <li key={x._id} className="rounded bg-navy-50 p-2">{x.text}<div className="text-xs text-slate-500">{fmt(x.createdAt)}</div></li>)}</ul> : <Empty>No reflections yet.</Empty>}</Load></Card></>);
}

export function MentorReports() {
  return (<><h1 className="text-xl font-semibold text-navy-900">Reports</h1><Card title="Exports"><p className="mb-3 text-sm text-slate-600">Exports include only your assigned mentees. Private notes are never included.</p><a className="text-teal-700 underline" href="/api/reports/assessments.xlsx">Download mentee assessments (Excel)</a></Card></>);
}
