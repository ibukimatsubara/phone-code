import { execFile } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

function findTmuxSocket() {
  // Explicit env var takes priority
  if (process.env.TMUX_SOCKET_PATH) {
    return process.env.TMUX_SOCKET_PATH;
  }

  // Auto-detect: scan /tmp/tmux-* for sockets
  try {
    const entries = readdirSync('/tmp').filter((e) => e.startsWith('tmux-'));
    for (const entry of entries) {
      const socketPath = path.join('/tmp', entry, 'default');
      if (existsSync(socketPath)) {
        console.log(`[tmux] auto-detected socket: ${socketPath}`);
        return socketPath;
      }
    }
  } catch {
    // /tmp scan failed, use default
  }

  return null;
}

const socketPath = findTmuxSocket();

function tmux(...args) {
  return new Promise((resolve, reject) => {
    const fullArgs = socketPath ? ['-S', socketPath, ...args] : args;
    execFile('tmux', fullArgs, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function listSessions() {
  try {
    const stdout = await tmux(
      'list-sessions',
      '-F',
      '#{session_name}\t#{session_windows}\t#{session_attached}'
    );
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, windows, attached] = line.split('\t');
        return {
          name,
          windows: parseInt(windows, 10),
          attached: attached === '1',
        };
      });
  } catch {
    return [];
  }
}

export async function listPanes(session) {
  const stdout = await tmux(
    'list-panes',
    '-t',
    session,
    '-F',
    '#{window_index}.#{pane_index}\t#{pane_current_command}\t#{pane_width}x#{pane_height}\t#{pane_active}'
  );
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [target, command, size, active] = line.split('\t');
      return {
        target,
        command,
        size,
        active: active === '1',
      };
    });
}

export async function capturePane(target) {
  return await tmux('capture-pane', '-p', '-t', target, '-e');
}

export async function sendKeys(target, keys) {
  if (!keys) return;
  await tmux('send-keys', '-t', target, '-l', keys);
}

export async function sendSpecialKey(target, key) {
  if (!key) return;
  const allowed = [
    'Enter',
    'Tab',
    'Escape',
    'Up',
    'Down',
    'Left',
    'Right',
    'BSpace',
    'DC',
    'C-c',
    'C-d',
    'C-z',
    'C-a',
    'C-e',
    'C-l',
    'C-u',
    'C-k',
    'C-w',
    'C-r',
  ];
  if (!allowed.includes(key)) {
    throw new Error(`Key not allowed: ${key}`);
  }
  await tmux('send-keys', '-t', target, key);
}
