import express from 'express';
import http from 'http';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { execFile } from 'child_process';
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

// --- Tailscale local API ---
const TAILSCALE_SOCK = '/var/run/tailscale/tailscaled.sock';

function tailscaleLocalAPI(apiPath) {
  return new Promise((resolve) => {
    const req = http.get(
      { socketPath: TAILSCALE_SOCK, path: apiPath },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            console.warn(`[tailscale-api] ${apiPath} → HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            console.warn(`[tailscale-api] ${apiPath} → invalid JSON: ${data.slice(0, 200)}`);
            resolve(null);
          }
        });
      }
    );
    req.on('error', (err) => {
      console.warn(`[tailscale-api] socket error: ${err.message}`);
      resolve(null);
    });
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function tailscaleWhoisCLI(ip) {
  return new Promise((resolve) => {
    execFile('tailscale', ['whois', '--json', ip], { timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
  });
}

// --- Tailscale whois ---
// Cache: ip -> { allowed: bool, user: string, expiry: timestamp }
const whoisCache = new Map();
const CACHE_TTL = 60_000; // 1 minute
const hasTailscaleSock = existsSync(TAILSCALE_SOCK);
let tailscaleAvailable = null; // null = not checked yet

async function checkTailscaleAvailability() {
  // Try local API
  if (hasTailscaleSock) {
    const status = await tailscaleLocalAPI('/localapi/v0/status');
    if (status) return 'socket';
  }
  // Try CLI
  const cliStatus = await getTailscaleStatusCLI();
  if (cliStatus) return 'cli';
  return false;
}

async function tailscaleWhois(ip) {
  if (!tailscaleAvailable) return null;

  // Try local API via Unix socket first (works in Docker on Linux)
  if (tailscaleAvailable === 'socket') {
    const result = await tailscaleLocalAPI(`/localapi/v0/whois?addr=${ip}:1`);
    if (result) return result;
  }
  // Fall back to CLI (works on host directly)
  return tailscaleWhoisCLI(ip);
}

async function isTailscalePeer(ip) {
  // Check cache
  const cached = whoisCache.get(ip);
  if (cached && cached.expiry > Date.now()) {
    return cached;
  }

  const info = await tailscaleWhois(ip);
  const result = {
    allowed: info !== null,
    user: info?.UserProfile?.DisplayName || info?.UserProfile?.LoginName || 'unknown',
    node: info?.Node?.Name || 'unknown',
    expiry: Date.now() + CACHE_TTL,
  };

  whoisCache.set(ip, result);
  return result;
}

// --- Access control ---
function normalizeIp(ip) {
  return ip?.replace(/^::ffff:/, '') || '';
}

async function isAllowed(ip) {
  const normalized = normalizeIp(ip);

  // Always allow localhost
  if (['127.0.0.1', '::1'].includes(normalized)) {
    return { allowed: true, reason: 'localhost' };
  }

  // If Tailscale is not available, allow all (dev/fallback mode)
  if (!tailscaleAvailable) {
    return { allowed: true, reason: 'no-auth (Tailscale unavailable)' };
  }

  // Check Tailscale whois (primary auth)
  const peer = await isTailscalePeer(normalized);
  if (!peer.allowed) {
    return { allowed: false, reason: 'not a Tailscale peer' };
  }

  // If allowedIps is set, further restrict to specific devices
  if (allowedIps.length > 0 && !allowedIps.includes(normalized)) {
    return { allowed: false, reason: `Tailscale peer ${peer.node} not in allowedIps` };
  }

  return { allowed: true, reason: `Tailscale: ${peer.user} (${peer.node})` };
}

// --- Startup log (Tailscale check is async, done in server.listen) ---

// --- Express ---
const app = express();

// IP check middleware
app.use(async (req, res, next) => {
  const ip = normalizeIp(req.ip);
  const result = await isAllowed(req.ip);
  if (!result.allowed) {
    console.warn(`[security] Blocked HTTP from ${ip}: ${result.reason}`);
    res.status(403).send('Forbidden');
    return;
  }
  console.log(`[security] Allowed HTTP from ${ip} (${result.reason})`);
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

wss.on('connection', async (ws, req) => {
  const ip = normalizeIp(req.socket.remoteAddress);
  const result = await isAllowed(ip);

  if (!result.allowed) {
    console.warn(`[security] Blocked WebSocket from ${ip}: ${result.reason}`);
    ws.close(4003, 'Forbidden');
    return;
  }

  console.log(`[ws] connected: ${ip} (${result.reason})`);

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
    console.log(`[ws] disconnected: ${ip}`);
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

// --- Get Tailscale hostname for startup URL ---
function getTailscaleStatusCLI() {
  return new Promise((resolve) => {
    execFile('tailscale', ['status', '--json'], { timeout: 3000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
  });
}

async function getTailscaleHostname() {
  // Try local API first, fall back to CLI
  let status = hasTailscaleSock
    ? await tailscaleLocalAPI('/localapi/v0/status')
    : null;
  if (!status) {
    status = await getTailscaleStatusCLI();
  }
  if (!status) return null;

  const self = status.Self;
  const dnsName = self?.DNSName?.replace(/\.$/, '') || null;
  const tailscaleIp = self?.TailscaleIPs?.[0] || null;
  return { dnsName, tailscaleIp };
}

const protocol = tlsCert && tlsKey && existsSync(tlsCert) ? 'https' : 'http';
server.listen(PORT, '0.0.0.0', async () => {
  // Check Tailscale availability
  tailscaleAvailable = await checkTailscaleAvailability();
  if (tailscaleAvailable) {
    console.log(`[security] Tailscale authentication enabled (via ${tailscaleAvailable})`);
    if (allowedIps.length > 0) {
      console.log(`[security] Additional IP restriction: ${allowedIps.join(', ')}`);
    } else {
      console.log('[security] All Tailscale peers on your tailnet are allowed');
    }
  } else {
    console.warn('[security] WARNING: Tailscale not available - all connections allowed!');
    console.warn('[security] Install Tailscale for authentication');
  }

  console.log('');
  console.log('  phone-code is running!');
  console.log('');
  console.log(`  Local:      ${protocol}://localhost:${PORT}`);

  const ts = await getTailscaleHostname();
  if (ts) {
    if (ts.tailscaleIp) {
      console.log(`  Tailscale:  ${protocol}://${ts.tailscaleIp}:${PORT}`);
    }
    if (ts.dnsName) {
      console.log(`  Tailscale:  ${protocol}://${ts.dnsName}:${PORT}`);
    }
  }
  console.log('');
});
