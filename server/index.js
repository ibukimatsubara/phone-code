import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import * as tmux from './tmux.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Track subscriptions: ws -> { target, interval, lastOutput }
const subscriptions = new Map();

wss.on('connection', (ws) => {
  console.log('[ws] client connected');

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    try {
      await handleMessage(ws, msg);
    } catch (err) {
      ws.send(
        JSON.stringify({ type: 'error', message: err.message || String(err) })
      );
    }
  });

  ws.on('close', () => {
    console.log('[ws] client disconnected');
    clearSubscription(ws);
  });
});

function clearSubscription(ws) {
  const sub = subscriptions.get(ws);
  if (sub) {
    clearInterval(sub.interval);
    subscriptions.delete(ws);
  }
}

async function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'sessions': {
      const data = await tmux.listSessions();
      send(ws, { type: 'sessions', data });
      break;
    }

    case 'panes': {
      if (!msg.session) throw new Error('session is required');
      const data = await tmux.listPanes(msg.session);
      send(ws, { type: 'panes', session: msg.session, data });
      break;
    }

    case 'subscribe': {
      if (!msg.target) throw new Error('target is required');
      clearSubscription(ws);

      let lastOutput = '';

      // Send initial capture
      try {
        const output = await tmux.capturePane(msg.target);
        lastOutput = output;
        send(ws, { type: 'output', target: msg.target, data: output });
      } catch (err) {
        send(ws, { type: 'error', message: `capture failed: ${err.message}` });
        return;
      }

      // Start polling
      const interval = setInterval(async () => {
        try {
          const output = await tmux.capturePane(msg.target);
          if (output !== lastOutput) {
            lastOutput = output;
            send(ws, { type: 'output', target: msg.target, data: output });
          }
        } catch {
          // pane may have closed, ignore
        }
      }, 150);

      subscriptions.set(ws, { target: msg.target, interval, lastOutput });
      break;
    }

    case 'unsubscribe': {
      clearSubscription(ws);
      break;
    }

    case 'input': {
      if (!msg.target || msg.data === undefined) {
        throw new Error('target and data are required');
      }
      await tmux.sendKeys(msg.target, msg.data);
      break;
    }

    case 'key': {
      if (!msg.target || !msg.key) {
        throw new Error('target and key are required');
      }
      await tmux.sendSpecialKey(msg.target, msg.key);
      break;
    }

    default:
      send(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
  }
}

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`phone-code running on http://0.0.0.0:${PORT}`);
});
