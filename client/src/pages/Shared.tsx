import { api } from '../lib/api';
import { useFetch } from '../lib/useFetch';
import { Button, Card, Empty, ErrorBox, Spinner, fmt } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useState } from 'react';
import { Field, Input, Notice, Select } from '../components/ui';
import { errMsg } from '../lib/api';

export function Notifications() {
  const { data, loading, error, reload } = useFetch<{ unread: number; items: any[] }>('/api/notifications');
  if (loading) return <Spinner />; if (error) return <ErrorBox message={error} retry={reload} />;
  return (<><div className="flex items-center justify-between"><h1 className="text-xl font-semibold text-navy-900">Notifications</h1><Button variant="ghost" onClick={async () => { await api('/api/notifications/read-all', { body: {} }); reload(); }}>Mark all as read</Button></div>
    <Card>{data!.items.length ? <ul className="divide-y divide-navy-100">{data!.items.map((n) => <li key={n._id} className="flex justify-between gap-3 py-2 text-sm"><span className={n.readAt ? 'text-slate-500' : 'font-medium'}>{n.message}</span><span className="shrink-0 text-xs text-slate-500">{fmt(n.createdAt)}</span></li>)}</ul> : <Empty>You have no notifications.</Empty>}</Card></>);
}
export function Calendar() {
  const { user } = useAuth(); const { data, loading, error, reload } = useFetch<any[]>('/api/calendar'); const [f, setF] = useState({ title: '', type: 'mse', date: '' }); const [err, setErr] = useState('');
  return (<><h1 className="text-xl font-semibold text-navy-900">Academic calendar</h1>
    {user?.role === 'hod' && <Card title="Add an event">{err && <Notice tone="err">{err}</Notice>}<div className="grid gap-3 sm:grid-cols-4"><Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{['mse', 'task', 'assignment', 'meeting_window', 'holiday', 'other'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</Select></Field><Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <div className="flex items-end gap-2"><Button onClick={async () => { setErr(''); try { await api('/api/calendar', { body: f }); setF({ ...f, title: '' }); reload(); } catch (e) { setErr(errMsg(e)); } }} disabled={!f.title || !f.date}>Add</Button></div></div></Card>}
    {loading ? <Spinner /> : error ? <ErrorBox message={error} retry={reload} /> : <Card>{data!.length ? <ul className="divide-y divide-navy-100">{data!.map((e) => <li key={e._id} className="flex justify-between py-2 text-sm"><span>{e.title} <span className="text-slate-500">· {e.type.replace('_', ' ')}{e.semester ? ` · Sem ${e.semester}` : ''}</span></span><span>{fmt(e.date)}</span></li>)}</ul> : <Empty>No events scheduled.</Empty>}</Card>}</>);
}
