import crypto from 'node:crypto';

export function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export function wsSend(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(obj));
}

export function makeUserId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

export function normalizeColor(input) {
  if (typeof input !== 'string') return null;
  const c = input.trim();
  if (c.length === 0 || c.length > 32) return null;

  // allow hex colors (#RGB, #RRGGBB) or simple names
  if (/^#[0-9a-fA-F]{3}$/.test(c) || /^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(c)) return c;
  return null;
}

