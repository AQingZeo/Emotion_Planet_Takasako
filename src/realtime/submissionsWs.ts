/**
 * WebSocket: server broadcasts submissions_changed; client refetches via GET.
 */

export function connectSubmissionsSocket(onChange: () => void): () => void {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
  ws.onmessage = (ev: MessageEvent) => {
    try {
      const d = JSON.parse(String(ev.data)) as { type?: string };
      if (d.type === 'submissions_changed') onChange();
    } catch {
      /* ignore */
    }
  };
  return () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}
