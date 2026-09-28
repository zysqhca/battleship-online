// 海战棋 · 远程双人对战服务器
// 职责：静态文件服务 + WebSocket 房间中继（不校验游戏逻辑，游戏规则全部在客户端）
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 静态文件服务 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 房间管理 ----------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 0/O/1/I
function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}
// code -> { code, players:[ws|null, ws|null], first:0|1 }
const rooms = new Map();

const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let room = null;
  let myIdx = -1;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'create') {
      if (room) return;
      let code;
      do { code = makeCode(); } while (rooms.has(code));
      room = { code, players: [ws, null], first: crypto.randomInt(2) };
      myIdx = 0;
      rooms.set(code, room);
      send(ws, { type: 'assigned', room: code, you: 0 });
    } else if (msg.type === 'join') {
      if (room) return;
      const code = String(msg.room || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) { send(ws, { type: 'error', message: '房间不存在，请检查房间号' }); return; }
      if (r.players[1]) { send(ws, { type: 'error', message: '房间已满' }); return; }
      r.players[1] = ws;
      room = r;
      myIdx = 1;
      send(ws, { type: 'assigned', room: code, you: 1 });
      send(r.players[0], { type: 'started', first: r.first });
      send(r.players[1], { type: 'started', first: r.first });
    } else if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
    } else {
      // 其余消息一律转发给对手
      if (room && myIdx >= 0) send(room.players[1 - myIdx], msg);
    }
  });

  ws.on('close', () => {
    if (room && myIdx >= 0) {
      send(room.players[1 - myIdx], { type: 'peerLeft' });
      rooms.delete(room.code);
    }
  });
  ws.on('error', () => {});
});

// 心跳，清理死连接
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 30000);

server.listen(PORT, () => {
  console.log('海战棋服务器已启动，端口 ' + PORT);
});
