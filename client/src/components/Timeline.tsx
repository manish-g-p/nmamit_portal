import { useFetch } from '../lib/useFetch';
import { ErrorBox, Spinner, fmt } from './ui';
const label = (e: any) => e.kind === 'version' ? `Version ${e.version} saved by ${e.by} (${String(e.status).replace(/_/g, ' ')})`
  : e.kind === 'review' ? `${e.level === 'hod' ? 'HOD' : 'Mentor'} ${String(e.decision).replace(/_/g, ' ')} version ${e.version}${e.reviewer ? ` · ${e.reviewer}` : ''}${e.comment ? ` — “${e.comment}”` : ''}`
  : `${e.level === 'hod' ? 'HOD endorsement' : 'Mentor verification'} recorded for version ${e.version}${e.endorser ? ` · ${e.endorser}` : ''}`;
export function Timeline({ type, id }: { type: 'AssessmentRecord' | 'StudentActivity'; id: string }) {
  const { data, error, loading, reload } = useFetch<{ events: any[] }>(`/api/timeline/${type}/${id}`);
  if (loading) return <Spinner />; if (error) return <ErrorBox message={error} retry={reload} />;
  return <ol className="space-y-2 border-l-2 border-navy-100 pl-4 text-sm">{data!.events.map((e, i) => <li key={i}><span className="text-xs text-slate-500">{fmt(e.at)}</span><div>{label(e)}</div></li>)}</ol>;
}
