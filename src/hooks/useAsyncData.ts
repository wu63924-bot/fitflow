import { useCallback, useEffect, useState } from 'react';

export function useAsyncData<T>(load: () => Promise<T>, deps: readonly unknown[] = []) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取数据失败');
    } finally {
      setLoading(false);
    }
  // The caller controls refresh dependencies through deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh, setData };
}
