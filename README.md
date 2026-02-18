# phone-code

Control your tmux sessions from your phone. Built for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) instances running on home servers.

```
┌────────────┐   Tailscale (HTTPS)   ┌───────────────────────┐
│  Phone     │ ───────────────────→  │  Home Server          │
│  (Chrome)  │                       │  Node.js              │
└────────────┘                       │  ├─ Web UI            │
                                     │  ├─ WebSocket         │
                                     │  └─ tmux (direct)     │
                                     └───────────────────────┘
```

## Features

- Browse tmux sessions and panes from a mobile-optimized web UI
- Real-time terminal output via `capture-pane` polling (~150ms)
- Send keyboard input, special keys (Ctrl+C, Ctrl+D, arrows, Tab, etc.)
- Sidebar for session switching, tabs + swipe for pane switching
- Auto-adjusts font size to match pane column width for accurate rendering
- Tailscale IP allowlist for access control
- HTTPS support via Tailscale certificates

## Mobile UI

```
┌─────────────────────────────────────┐
│  ☰  session:main           ● 接続中 │
├─────────────────────────────────────┤
│ [ pane:0 ✦ ] [ pane:1 ] [ pane:2 ] │  ← tabs / swipe
├─────────────────────────────────────┤
│                                     │
│  ~/project $ claude                 │
│  ● Claude Code                      │
│  I'll fix the auth bug...           │
│                                     │  ← xterm.js
│                                     │
├─────────────────────────────────────┤
│ [^C] [^D] [^Z] [↑] [↓] [Tab] [^L] │  ← shortcut keys
├─────────────────────────────────────┤
│ [Input...                        ⏎] │  ← text input
└─────────────────────────────────────┘
```

## Prerequisites

- A Linux/macOS server running tmux
- [Node.js](https://nodejs.org/) 20+ (or Docker)
- [Tailscale](https://tailscale.com/) installed on both server and phone

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/ibukimatsubara/phone-code.git
cd phone-code

# Create config
cp config.example.json config.json
# Edit config.json to add your phone's Tailscale IP (see Security section)

# Start
docker compose up -d

# Open in phone browser
# http://<your-server-tailscale-ip>:3000
```

### Without Docker

```bash
git clone https://github.com/ibukimatsubara/phone-code.git
cd phone-code

npm install
npm run build
cp config.example.json config.json

npm start
# → phone-code running on http://0.0.0.0:3000
```

## Configuration

Create `config.json` from the example:

```bash
cp config.example.json config.json
```

```json
{
  "allowedIps": ["100.64.x.x"],
  "tlsCert": "",
  "tlsKey": "",
  "port": 3000
}
```

| Field | Description |
|-------|-------------|
| `allowedIps` | Array of Tailscale IPs allowed to connect. Empty = allow all (not recommended). |
| `tlsCert` | Path to TLS certificate file (from `tailscale cert`). |
| `tlsKey` | Path to TLS private key file. |
| `port` | Server port. Default: `3000`. |

## Security

### Find your phone's Tailscale IP

On your phone, open the Tailscale app and note your device's IP address (e.g., `100.100.x.x`).

Or from any Tailscale device:

```bash
tailscale status
```

Add it to `config.json`:

```json
{
  "allowedIps": ["100.100.1.23"]
}
```

Multiple devices:

```json
{
  "allowedIps": ["100.100.1.23", "100.100.1.45"]
}
```

### Enable HTTPS with Tailscale

Generate TLS certificates for your server's Tailscale hostname:

```bash
tailscale cert <your-machine-name>.<tailnet>.ts.net
# Creates: <hostname>.crt and <hostname>.key
```

Update `config.json`:

```json
{
  "allowedIps": ["100.100.1.23"],
  "tlsCert": "/path/to/<hostname>.crt",
  "tlsKey": "/path/to/<hostname>.key"
}
```

Now access via:

```
https://<your-machine-name>.<tailnet>.ts.net:3000
```

### Tailscale ACL (additional layer)

You can also restrict access at the network level via [Tailscale ACLs](https://tailscale.com/kb/1018/acls/). This provides defense-in-depth on top of the app-level IP allowlist.

## How It Works

```
Phone Browser                    Node.js Server                tmux
     │                                │                          │
     │ WebSocket: { subscribe }       │                          │
     │ ──────────────────────────────→│                          │
     │                                │  exec: capture-pane      │
     │                                │ ────────────────────────→│
     │                                │  (every 150ms, diff)     │
     │    { output: "terminal..." }   │←─────────────────────────│
     │ ←──────────────────────────────│                          │
     │                                │                          │
     │ xterm.js renders               │                          │
     │                                │                          │
     │ { input: "ls\n" }              │                          │
     │ ──────────────────────────────→│  exec: send-keys         │
     │                                │ ────────────────────────→│
```

- **Output**: `tmux capture-pane -p -e` polled every 150ms, sent to client only on change
- **Input**: `tmux send-keys -l` for text, `tmux send-keys` for special keys
- **Rendering**: xterm.js with `convertEol: true`, font auto-scaled to match pane width
- **No SSH required**: server runs on the same machine as tmux, uses `child_process.execFile`

## Development

```bash
npm install
npm run dev    # Starts Vite dev server + Node.js backend concurrently
```

The Vite dev server proxies WebSocket requests to the backend (port 3000).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + xterm.js |
| Backend | Node.js + Express + ws |
| Terminal | xterm.js + @xterm/addon-fit |
| Deployment | Docker Compose |

## Multi-Server Setup

Deploy phone-code on each server. Switch between servers by navigating to different URLs:

```
https://server-a.<tailnet>.ts.net:3000
https://server-b.<tailnet>.ts.net:3000
```

## License

MIT
