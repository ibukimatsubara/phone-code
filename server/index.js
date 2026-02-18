import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import * as tmux from './tmux.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config ---
const config = loadConfig();
const PORT = config.port || process.env.PORT || 3000;
const allowedIps = config.allowedIps || [];

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (err) {
      console.error('[config] Failed to parse config.json:', err.message);
    }
  }
  return {};
}

// --- IP allowlist ---
function normalizeIp(ip) {
  // Strip IPv6-mapped IPv4 prefix
  return ip?.replace(/^::ffff:/, '') || '';
}

function isAllowed(ip) {
  const normalized = normalizeIp(ip);
  // Always allow localhost
  if (['127.0.0.1', '::1'].includes(normalized)) return true;
  // If no allowlist configured, allow all (with warning)
  if (allowedIps.length === 0) return true;
  return allowedIps.includes(normalized);
}

if (allowedIps.length === 0) {
  console.warn('[security] WARNING: No allowedIps configured. All connections are accepted.');
  console.warn('[security] Set allowedIps in config.json to restrict access.');
} else {
  console.log(`[security] Allowed IPs: ${allowedIps.join(', ')}`);
}

// --- Express ---
const app = express();

// IP check middleware
app.use((req, res, next) => {
  if (!isAllowed(req.ip)) {
    console.warn(`[security] Blocked HTTP from ${req.ip}`);
    res.status(403).send('Forbidden');
    return;
  }
  next();
});

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// --- Server (HTTP or HTTPS) ---
let server;
const tlsCert = config.tlsCert || process.env.TLS_CERT || '';
const tlsKey = config.tlsKey || process.env.TLS_KEY || '';

if (tlsCert && tlsKey && existsSync(tlsCert) && existsSync(tlsKey)) {
  server = createHttpsServer(
    {
      cert: readFileSync(tlsCert),
      key: readFileSync(tlsKey),
    },
    app
  );
  console.log('[tls] HTTPS enabled');
} else {
  server = createServer(app);
  if (tlsCert || tlsKey) {
    console.warn('[tls] Certificate files not found, falling back to HTTP');
  }
}

// --- WebSocket ---
const wss = new WebSocketServer({ server, path: '/ws' });

// Track subscriptions: ws -> { target, interval, lastOutput }
const subscriptions = new Map();

wss.on('connection', (ws, req) => {
  const ip = normalizeIp(req.socket.remoteAddress);

  if (!isAllowed(ip)) {
    console.warn(`[security] Blocked WebSocket from ${ip}`);
    ws.close(4003, 'Forbidden');
    return;
  }

  console.log(`[ws] client connected from ${ip}`);

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
    console.log(`[ws] client disconnected from ${ip}`);
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

const protocol = tlsCert && tlsKey && existsSync(tlsCert) ? 'https' : 'http';
server.listen(PORT, '0.0.0.0', () => {
  console.log(`phone-code running on ${protocol}://0.0.0.0:${PORT}`);
});
