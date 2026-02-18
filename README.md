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
- Claude Codeステータス検知 (処理中/入力待ち/承認待ち) をタブ・ヘッダーに表示
- **Zero-config security**: auto-verifies connections via `tailscale whois`
- Optional IP allowlist for additional restriction
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
│ [^C][^D][^Z][↑][↓][Tab][^L] [A-][A+]│  ← shortcut keys + font size
└─────────────────────────────────────┘
```

## Prerequisites

- A Linux/macOS server running tmux
- [Node.js](https://nodejs.org/) 20+ (or Docker)
- [Tailscale](https://tailscale.com/) installed on both server and phone

## Quick Start

### macOS (ローカル開発・実行)

macOSではDocker DesktopがLinux VM上で動作するため、ホストのtmux/TailscaleのUnixソケットにコンテナからアクセスできない。**Dockerを使わず直接起動する。**

```bash
git clone https://github.com/ibukimatsubara/phone-code.git
cd phone-code
npm install
npm run build && node server/index.js
```

開発モード (Vite HMR + サーバー同時起動):

```bash
npm run dev
```

### Linux サーバー (本番: Docker)

Linuxではネイティブ Docker が動くため、`network_mode: host` でホストのtmux・Tailscaleに直接アクセスできる。

```bash
git clone https://github.com/ibukimatsubara/phone-code.git
cd phone-code
NETWORK_MODE=host docker compose up -d --build
```

リモートデプロイ:

```bash
ssh home "cd phone-code && git pull && NETWORK_MODE=host docker compose up -d --build"
```

アプリURLはログに表示される:

```bash
docker compose logs
#   phone-code is running!
#
#   Local:      http://localhost:3000
#   Tailscale:  http://100.x.x.x:3000
#   Tailscale:  http://your-server.tailnet.ts.net:3000
```

Open the Tailscale URL on your phone.

## Security

### Default: Tailscale whois (zero config)

By default, phone-code uses `tailscale whois` to verify that every connection comes from a device on **your Tailscale network**. No configuration needed.

```
Phone connects → server runs `tailscale whois <ip>`
  → Same tailnet? ✅ Allow
  → Unknown?      ❌ Block (403 Forbidden)
```

The server logs show who connected:

```
[ws] connected: 100.100.1.23 (Tailscale: John (iphone))
[security] Blocked HTTP from 192.168.1.50: not a Tailscale peer
```

### Optional: Restrict to specific devices

To limit access to specific Tailscale devices, create `config.json`:

```bash
cp config.example.json config.json
```

```json
{
  "allowedIps": ["100.100.1.23", "100.100.1.45"]
}
```

Find your phone's Tailscale IP:

```bash
tailscale status
```

### Enable HTTPS

Generate TLS certificates for your server's Tailscale hostname:

```bash
tailscale cert your-server.tailnet.ts.net
```

Add to `config.json`:

```json
{
  "tlsCert": "/path/to/your-server.tailnet.ts.net.crt",
  "tlsKey": "/path/to/your-server.tailnet.ts.net.key"
}
```

Access via `https://your-server.tailnet.ts.net:3000`.

### Tailscale ACL (additional layer)

For defense-in-depth, restrict access at the network level via [Tailscale ACLs](https://tailscale.com/kb/1018/acls/).

## Configuration

`config.json` is **optional**. Create it only if you need additional settings:

```json
{
  "allowedIps": [],
  "tlsCert": "",
  "tlsKey": "",
  "port": 3000
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `allowedIps` | `[]` | Restrict to specific Tailscale IPs. Empty = all tailnet peers allowed. |
| `tlsCert` | `""` | Path to TLS certificate file. |
| `tlsKey` | `""` | Path to TLS private key file. |
| `port` | `3000` | Server port. |

## How It Works

```
Phone Browser                    Node.js Server                tmux
     │                                │                          │
     │  connect                       │                          │
     │ ──────────────────────────────→│                          │
     │                                │  tailscale whois (auth)  │
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

- **Auth**: `tailscale whois` verifies connections are from your tailnet
- **Output**: `tmux capture-pane -p -e` polled every 150ms, sent only on change
- **Input**: `tmux send-keys -l` for text, `tmux send-keys` for special keys
- **Rendering**: xterm.js with `convertEol: true`, font auto-scaled to match pane width
- **No SSH required**: runs on the same machine as tmux, uses `child_process.execFile`

## Development

```bash
npm install
npm run dev    # Starts Vite dev server + Node.js backend concurrently
```

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
https://server-a.tailnet.ts.net:3000
https://server-b.tailnet.ts.net:3000
```

## License

MIT
