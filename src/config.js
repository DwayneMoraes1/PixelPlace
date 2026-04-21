import 'dotenv/config';

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const val = Number.parseInt(raw, 10);
  return Number.isFinite(val) ? val : fallback;
}

export const config = Object.freeze({
  port: intFromEnv('PORT', 3000),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pixelplace',
  boardWidth: intFromEnv('BOARD_WIDTH', 200),
  boardHeight: intFromEnv('BOARD_HEIGHT', 200),
  cooldownMs: intFromEnv('COOLDOWN_MS', 10_000),
  snapshotLimit: intFromEnv('SNAPSHOT_LIMIT', 50_000)
});

