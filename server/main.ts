/**
 * Local Express API + WebSocket + SQLite. Serves Vite build in production.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from 'dotenv';
import { getDb, insertSubmission, listSubmissions, getSubmission, replaceAllSubmissions } from './db';
import type { SubmissionRecord } from '../src/data/types';
import { classifyEmotion } from '../src/ai/axisAgent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

config({ path: path.join(ROOT, '.env.local') });
config({ path: path.join(ROOT, '.env') });

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.BIND_HOST ?? '127.0.0.1';

getDb();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '80mb' }));

function broadcastSubmissionsChanged(wss: WebSocketServer): void {
  const msg = JSON.stringify({ type: 'submissions_changed' });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

const wss = new WebSocketServer({ noServer: true });

/** In dev, port 4000 is API-only; Vite serves the app on 3000. Avoid confusing "Cannot GET /". */
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (_req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Emotion Planet API</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;max-width:520px;line-height:1.5">
  <h1 style="margin-top:0">API is running</h1>
  <p>This port serves the <strong>REST API</strong> and <strong>WebSocket</strong> only during <code>npm run dev</code>.</p>
  <p><strong>Open the app here:</strong> <a href="http://127.0.0.1:3000/">http://127.0.0.1:3000/</a> (Vite)</p>
  <p>Quick check: <a href="/api/health"><code>/api/health</code></a></p>
</body></html>`);
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/classify', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    const { result, rawJson } = await classifyEmotion(text);
    res.json({ result, rawJson });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/submissions', (_req, res) => {
  try {
    const records = listSubmissions(400);
    res.json(records);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/submissions/:entryId', (req, res) => {
  try {
    const rec = getSubmission(req.params.entryId);
    if (!rec) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(rec);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/submissions', (req, res) => {
  try {
    const body = req.body as SubmissionRecord;
    if (!body?.entry_id || !body.ai_result || !body.matrix_render || !body.paint_result) {
      res.status(400).json({ error: 'invalid submission body' });
      return;
    }
    insertSubmission(body);
    broadcastSubmissionsChanged(wss);
    res.status(201).json({ ok: true, entry_id: body.entry_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.put('/api/submissions', (req, res) => {
  try {
    const body = req.body as unknown;
    if (!Array.isArray(body)) {
      res.status(400).json({ error: 'expected JSON array' });
      return;
    }
    replaceAllSubmissions(body as SubmissionRecord[]);
    broadcastSubmissionsChanged(wss);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

const distPath = path.join(ROOT, 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = http.createServer(app);

server.on('upgrade', (request, socket, head) => {
  if (request.url?.split('?')[0] === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[emotion-planet] API http://${HOST}:${PORT}  WS ws://${HOST}:${PORT}/ws`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`[emotion-planet] serving static from dist`);
  }
});
