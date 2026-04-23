const el = (id) => document.getElementById(id);

const statusEl = el('status');
const cooldownEl = el('cooldown');
const selectedColorEl = el('selectedColor');
const userIdEl = el('userId');
const logEl = el('log');
const paletteEl = el('palette');
const randomBtn = el('randomBtn');

const canvas = el('board');
const ctx = canvas.getContext('2d', { alpha: false });

let boardWidth = 200;
let boardHeight = 200;
let cooldownMs = 10_000;

let userId = null;
let selectedColor = '#ff4500';
let cooldownUntil = 0;

const palette = [
  '#6D001A',
  '#BE0039',
  '#FF4500',
  '#FFA800',
  '#FFD635',
  '#FFF8B8',
  '#00A368',
  '#00CC78',
  '#7EED56',
  '#00756F',
  '#009EAA',
  '#00CCC0',
  '#2450A4',
  '#3690EA',
  '#51E9F4',
  '#493AC1',
  '#6A5CFF',
  '#94B3FF',
  '#811E9F',
  '#B44AC0',
  '#E4ABFF',
  '#DE107F',
  '#FF3881',
  '#FF99AA',
  '#6D482F',
  '#9C6926',
  '#FFB470',
  '#000000',
  '#515252',
  '#898D90',
  '#D4D7D9',
  '#FFFFFF'
];

function log(line) {
  const t = new Date().toISOString().slice(11, 19);
  const div = document.createElement('div');
  div.textContent = `[${t}] ${line}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(ok, text) {
  statusEl.textContent = text;
  statusEl.classList.toggle('ok', ok);
  statusEl.classList.toggle('bad', !ok);
}ws 

function setSelectedColor(c) {
  selectedColor = c;
  selectedColorEl.textContent = c;
  for (const btn of paletteEl.querySelectorAll('button[data-color]')) {
    btn.classList.toggle('selected', btn.dataset.color === c);
  }
}

function renderPalette() {
  paletteEl.innerHTML = '';
  for (const c of palette) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.style.background = c;
    btn.dataset.color = c;
    btn.title = c;
    btn.addEventListener('click', () => setSelectedColor(c));
    paletteEl.appendChild(btn);
  }
  setSelectedColor(selectedColor);
}

function resizeCanvasToBoard() {
  // Keep the canvas fixed-size in CSS pixels (already 800x800),
  // but draw in board coordinates using transforms.
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPixel(x, y, color) {
  const scaleX = canvas.width / boardWidth;
  const scaleY = canvas.height / boardHeight;
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x * scaleX), Math.floor(y * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
}

function canvasToBoardXY(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  const x = Math.floor(px * boardWidth);
  const y = Math.floor(py * boardHeight);
  return { x, y };
}

function updateCooldownUI() {
  const now = Date.now();
  const remaining = Math.max(0, cooldownUntil - now);
  if (remaining === 0) {
    cooldownEl.textContent = `Cooldown: ready`;
  } else {
    cooldownEl.textContent = `Cooldown: ${(remaining / 1000).toFixed(1)}s`;
  }
}

renderPalette();
resizeCanvasToBoard();
setSelectedColor(selectedColor);
setInterval(updateCooldownUI, 100);

randomBtn.addEventListener('click', () => {
  const c = palette[Math.floor(Math.random() * palette.length)];
  setSelectedColor(c);
});

let ws = null;
let reconnectTimer = null;

function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = 'wss://your-backend-host.onrender.com';
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    setStatus(true, 'Connected');
    log('WebSocket connected');

    const saved = localStorage.getItem('pixelplace:userId');
    if (saved) {
      ws.send(JSON.stringify({ type: 'hello', userId: saved }));
    }
  });

  ws.addEventListener('close', () => {
    setStatus(false, 'Disconnected');
    log('WebSocket disconnected (reconnecting...)');
    reconnectTimer = setTimeout(connect, 800);
  });

  ws.addEventListener('error', () => {
    // close handler will handle reconnect
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.type === 'welcome') {
      userId = msg.userId;
      boardWidth = msg.board?.width ?? boardWidth;
      boardHeight = msg.board?.height ?? boardHeight;
      cooldownMs = msg.cooldownMs ?? cooldownMs;
      userIdEl.textContent = userId;
      localStorage.setItem('pixelplace:userId', userId);
      resizeCanvasToBoard();
      log(`Welcome userId=${userId} board=${boardWidth}x${boardHeight} cooldownMs=${cooldownMs}`);
      return;
    }

    if (msg.type === 'hello_ack') {
      userId = msg.userId;
      userIdEl.textContent = userId;
      localStorage.setItem('pixelplace:userId', userId);
      log(`Resumed userId=${userId}`);
      return;
    }

    if (msg.type === 'snapshot') {
      resizeCanvasToBoard();
      const pixels = Array.isArray(msg.pixels) ? msg.pixels : [];
      for (const p of pixels) {
        if (typeof p?.x === 'number' && typeof p?.y === 'number' && typeof p?.color === 'string') {
          drawPixel(p.x, p.y, p.color);
        }
      }
      log(`Snapshot applied (${pixels.length} pixels)`);
      return;
    }

    if (msg.type === 'pixel') {
      const p = msg.pixel;
      if (typeof p?.x === 'number' && typeof p?.y === 'number' && typeof p?.color === 'string') {
        drawPixel(p.x, p.y, p.color);
      }
      return;
    }

    if (msg.type === 'place_rejected') {
      if (msg.reason === 'COOLDOWN' && typeof msg.retryInMs === 'number') {
        cooldownUntil = Date.now() + Math.max(0, msg.retryInMs);
      }
      log(`Rejected: ${msg.reason}${msg.retryInMs ? ` (retry ${Math.ceil(msg.retryInMs / 1000)}s)` : ''}`);
      return;
    }

    if (msg.type === 'error') {
      log(`Error: ${msg.code ?? 'UNKNOWN'} ${msg.message ?? ''}`.trim());
    }
  });
}

canvas.addEventListener('click', (ev) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (Date.now() < cooldownUntil) return;

  const { x, y } = canvasToBoardXY(ev.clientX, ev.clientY);
  ws.send(JSON.stringify({ type: 'placePixel', x, y, color: selectedColor }));

  // optimistic UI: assume accepted; server will broadcast actual pixel
  drawPixel(x, y, selectedColor);
  cooldownUntil = Date.now() + cooldownMs;
});

connect();

