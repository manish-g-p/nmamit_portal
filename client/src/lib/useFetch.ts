import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from './api';
export function useFetch<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(!!path);
  const reload = useCallback(async () => { if (!path) return; setLoading(true); try { setData(await api<T>(path)); setError(null); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); } }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}
