// 海战棋 · 远程双人对战（Cloudflare Workers + Durable Objects）
// 职责：静态资源 + WebSocket 房间中继；游戏规则全部在客户端（public/index.html）
import { DurableObject } from "cloudflare:workers";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆的 0/O/1/I

function makeCode() {
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

// 单个全局 Hub 对象承载所有房间。
// 每个连接用 attachment 记录 { room, idx, first }，随 WebSocket 一起休眠/恢复，
// 因此不依赖内存状态，天然支持 Hibernation。
export class Hub extends DurableObject {
  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // 初始状态：尚未加入任何房间
    server.serializeAttachment({ room: null, idx: -1, first: 0 });
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  allSockets() {
    return this.ctx.getWebSockets();
  }

  codeTaken(code) {
    for (const w of this.allSockets()) {
      const a = w.deserializeAttachment();
      if (a && a.room === code) return true;
    }
    return false;
  }

  findByRoom(code, idx) {
    for (const w of this.allSockets()) {
      const a = w.deserializeAttachment();
      if (a && a.room === code && a.idx === idx) return w;
    }
    return null;
  }

  peerOf(ws) {
    const me = ws.deserializeAttachment();
    if (!me || me.idx < 0 || !me.room) return null;
    return this.findByRoom(me.room, 1 - me.idx);
  }

  send(ws, obj) {
    try {
      if (ws) ws.send(JSON.stringify(obj));
    } catch {}
  }

  async webSocketMessage(ws, message) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "create") {
      const me = ws.deserializeAttachment();
      if (me && me.room) return; // 已在房间
      let code;
      do {
        code = makeCode();
      } while (this.codeTaken(code));
      const first = Math.random() < 0.5 ? 0 : 1;
      ws.serializeAttachment({ room: code, idx: 0, first });
      this.send(ws, { type: "assigned", room: code, you: 0 });
    } else if (msg.type === "join") {
      const me = ws.deserializeAttachment();
      if (me && me.room) return; // 已在房间
      const code = String(msg.room || "").toUpperCase().trim();
      const host = this.findByRoom(code, 0);
      if (!host) {
        this.send(ws, { type: "error", message: "房间不存在，请检查房间号" });
        return;
      }
      if (this.findByRoom(code, 1)) {
        this.send(ws, { type: "error", message: "房间已满" });
        return;
      }
      const first = host.deserializeAttachment().first;
      ws.serializeAttachment({ room: code, idx: 1, first });
      this.send(ws, { type: "assigned", room: code, you: 1 });
      this.send(host, { type: "started", first });
      this.send(ws, { type: "started", first });
    } else if (msg.type === "ping") {
      this.send(ws, { type: "pong" });
    } else {
      // 其余消息一律转发给对手
      const peer = this.peerOf(ws);
      if (peer) this.send(peer, msg);
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    const peer = this.peerOf(ws);
    if (peer) this.send(peer, { type: "peerLeft" });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      // 所有 WebSocket 连接都路由到同一个全局 Hub
      const stub = env.HUB.getByName("hub");
      return stub.fetch(request);
    }
    // 其余请求交给静态资源（public/index.html）
    return env.ASSETS.fetch(request);
  },
};
