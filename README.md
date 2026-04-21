# PixelPlace
A collaborative area where multiple clients can collaborate or break off to create unique illustrations using a limited set of colors and pixels

## WebSocket + MongoDB backend

This repo now includes a Node.js service that behaves like Reddit’s r/Place:

- Multiple clients connect over WebSockets
- The server sends a board snapshot on connect
- Clients can place **1 pixel per 10 seconds** (configurable)
- Pixel placements are persisted in MongoDB and broadcast to all clients

## Requirements

- Node.js 18+ (recommended 20+)
- MongoDB (local or remote)

## Setup

```bash
npm install
copy .env.example .env
```

Edit `.env` as needed:

- `MONGODB_URI`: MongoDB connection string
- `PORT`: HTTP + WS port
- `BOARD_WIDTH`, `BOARD_HEIGHT`: board dimensions
- `COOLDOWN_MS`: per-user placement cooldown (default 10000)
- `SNAPSHOT_LIMIT`: max pixels returned in snapshots

## Run

```bash
npm run dev
```

Or on Windows, use the helper script:

```powershell
.\start.ps1
```

If port 3000 is taken:

```powershell
$env:PORT=3010; .\start.ps1
```

Health check:

- `GET /health`
- `GET /board` (optional `?since=<ISO timestamp>`)

## WebSocket protocol

Connect to the same host/port as HTTP (example `ws://localhost:3000`).

### Server → client

- `welcome`

```json
{ "type": "welcome", "userId": "...", "board": { "width": 200, "height": 200 }, "cooldownMs": 10000 }
```

- `snapshot`

```json
{ "type": "snapshot", "pixels": [ { "x": 1, "y": 2, "color": "#ff00aa", "updatedAt": "2026-01-01T00:00:00.000Z" } ] }
```

- `pixel` (broadcast when anyone places)

```json
{ "type": "pixel", "pixel": { "x": 1, "y": 2, "color": "#ff00aa", "placedBy": "user-id", "updatedAt": "..." } }
```

- `place_rejected`

```json
{ "type": "place_rejected", "reason": "COOLDOWN", "retryInMs": 7321 }
```

### Client → server

- `hello` (optional; resume an existing `userId`)

```json
{ "type": "hello", "userId": "previous-user-id" }
```

- `placePixel`

```json
{ "type": "placePixel", "x": 10, "y": 20, "color": "#00ff00" }
```

Color validation:
- Hex `#RGB` / `#RRGGBB` is accepted
- Simple names like `red`, `blue-2`, `my_color` are accepted

