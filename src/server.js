import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { config } from './config.js';
import { connectDb, getConnectionState } from './db.js';
import { Pixel } from './models/Pixel.js';
import { User } from './models/User.js';
import { makeUserId, normalizeColor, safeJsonParse, wsSend } from './ws.js';

function clampInt(n) {
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? n : Math.trunc(n);
}

function withinBoard(x, y) {
  return x >= 0 && y >= 0 && x < config.boardWidth && y < config.boardHeight;
}

async function ensureUser(userId) {
  await User.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true });
}

async function tryConsumeCooldown(userId) {
  const now = new Date();
  const threshold = new Date(now.getTime() - config.cooldownMs);

  const updated = await User.findOneAndUpdate(
    { userId, $or: [{ lastPlacedAt: null }, { lastPlacedAt: { $lte: threshold } }] },
    { $set: { lastPlacedAt: now } },
    { new: true }
  );

  if (updated) {
    return { ok: true, now };
  }

  const user = await User.findOne({ userId }).lean();
  const last = user?.lastPlacedAt ? new Date(user.lastPlacedAt) : null;
  const retryAt = last ? new Date(last.getTime() + config.cooldownMs) : now;
  const retryInMs = Math.max(0, retryAt.getTime() - now.getTime());
  return { ok: false, retryInMs, retryAt };
}

async function getSnapshot() {
  const pixels = await Pixel.find({}, { _id: 0, x: 1, y: 1, color: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .limit(config.snapshotLimit)
    .lean();

  // Return oldest-first so clients can apply in order.
  pixels.reverse();
  return pixels.map((p) => ({
    x: p.x,
    y: p.y,
    color: p.color,
    updatedAt: new Date(p.updatedAt).toISOString()
  }));
}

async function upsertPixel({ x, y, color, placedBy }) {
  const doc = await Pixel.findOneAndUpdate(
    { x, y },
    { $set: { color, placedBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    x: doc.x,
    y: doc.y,
    color: doc.color,
    placedBy: doc.placedBy,
    updatedAt: new Date(doc.updatedAt).toISOString()
  };
}

async function main() {
  await connectDb(config.mongodbUri);

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const publicDir = path.resolve(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      db: getConnectionState(),
      board: { width: config.boardWidth, height: config.boardHeight },
      cooldownMs: config.cooldownMs
    });
  });

  app.get('/board', async (req, res) => {
    const sinceRaw = typeof req.query.since === 'string' ? req.query.since : null;
    const since = sinceRaw ? new Date(sinceRaw) : null;
    const sinceOk = since && !Number.isNaN(since.getTime());

    const query = sinceOk ? { updatedAt: { $gt: since } } : {};
    const pixels = await Pixel.find(query, { _id: 0, x: 1, y: 1, color: 1, updatedAt: 1 })
      .sort({ updatedAt: 1 })
      .limit(config.snapshotLimit)
      .lean();

    res.json({
      board: { width: config.boardWidth, height: config.boardHeight },
      cooldownMs: config.cooldownMs,
      pixels: pixels.map((p) => ({
        x: p.x,
        y: p.y,
        color: p.color,
        updatedAt: new Date(p.updatedAt).toISOString()
      }))
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const clients = new Map(); // ws -> { userId }

  function broadcast(obj) {
    for (const ws of clients.keys()) wsSend(ws, obj);
  }

  wss.on('connection', async (ws) => {
    let userId = makeUserId();
    clients.set(ws, { userId });

    wsSend(ws, {
      type: 'welcome',
      userId,
      board: { width: config.boardWidth, height: config.boardHeight },
      cooldownMs: config.cooldownMs
    });

    ws.on('message', async (data) => {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      const parsed = safeJsonParse(text);
      if (!parsed.ok) {
        wsSend(ws, { type: 'error', code: 'BAD_JSON', message: 'Invalid JSON.' });
        return;
      }

      const msg = parsed.value;
      if (!msg || typeof msg !== 'object') {
        wsSend(ws, { type: 'error', code: 'BAD_MSG', message: 'Message must be a JSON object.' });
        return;
      }

      if (msg.type === 'hello') {
        // Optional: client can resume a previous userId
        const requested = typeof msg.userId === 'string' ? msg.userId.trim() : '';
        if (requested && requested.length <= 64) userId = requested;
        clients.set(ws, { userId });
        await ensureUser(userId);
        wsSend(ws, { type: 'hello_ack', userId });
        return;
      }

      if (msg.type === 'placePixel') {
        const x = clampInt(msg.x);
        const y = clampInt(msg.y);
        const color = normalizeColor(msg.color);

        if (x == null || y == null || !withinBoard(x, y)) {
          wsSend(ws, { type: 'place_rejected', reason: 'OUT_OF_BOUNDS' });
          return;
        }
        if (!color) {
          wsSend(ws, { type: 'place_rejected', reason: 'BAD_COLOR' });
          return;
        }

        await ensureUser(userId);
        const cd = await tryConsumeCooldown(userId);
        if (!cd.ok) {
          wsSend(ws, { type: 'place_rejected', reason: 'COOLDOWN', retryInMs: cd.retryInMs });
          return;
        }

        try {
          const pixel = await upsertPixel({ x, y, color, placedBy: userId });
          broadcast({ type: 'pixel', pixel });
        } catch (err) {
          wsSend(ws, { type: 'place_rejected', reason: 'SERVER_ERROR' });
        }
        return;
      }

      wsSend(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: 'Unknown message type.' });
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    // Send snapshot after welcome so client can render immediately.
    // Important: the message handler is already registered so early client messages aren't dropped.
    (async () => {
      try {
        const pixels = await getSnapshot();
        wsSend(ws, { type: 'snapshot', pixels });
      } catch (err) {
        wsSend(ws, { type: 'error', code: 'SNAPSHOT_FAILED', message: 'Failed to load board snapshot.' });
      }
    })();
  });

  server.listen(config.port, () => {
    // Keep server output minimal; users can curl /health to verify.
    console.log(`PixelPlace listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

