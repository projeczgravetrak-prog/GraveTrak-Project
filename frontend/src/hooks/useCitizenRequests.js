import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCitizenRequests } from '../api.js';

export default function useCitizenRequests(enabled) {
  const token = enabled ? (localStorage.getItem('authToken') || localStorage.getItem('token')) : null;
  const [state, setState] = useState({ token: null, rows: [], error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const currentToken = useRef(token);
  currentToken.current = token;
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || document.hidden || controller.signal.aborted) return;
      pending = true;
      try {
        const rows = await fetchCitizenRequests({ signal: controller.signal });
        if (!Array.isArray(rows)) throw new Error('Unexpected inbox response.');
        if (!controller.signal.aborted && currentToken.current === token) setState({ token, rows, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ token,
          rows: previous.token === token ? previous.rows : [], error: error.message }));
      } finally { pending = false; }
    };
    load();
    const timer = setInterval(load, 15000);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); };
  }, [token, revision]);
  return { rows: state.token === token && token ? state.rows : [],
    error: state.token === token ? state.error : '', refresh };
}
