// 联机探针共享的线协议最小实现（与 game/src/net/protocol.ts 同构；探针专用，勿入 src/）。
// _roomprobe.mjs（满员 Kick 等断言）与 _loadprobe.mjs（压测）共用。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
export const { WebSocket } = require('ws');
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const PROTO_MAGIC = 'SW1';
export const PROTO_VER = 4;
export const Msg = {
  Hello: 1, Kick: 2, PlayerSlot: 3, SyncPlayer: 4, RequestWorldData: 6, WorldData: 7,
  SpawnTileData: 8, StatusText: 9, TileSection: 10, PlayerSpawn: 12, PlayerState: 13,
  SyncNPC: 23, SyncProjectile: 27, Ping: 154,
};

export class Writer {
  constructor(msgId) { this.buf = Buffer.alloc(256); this.len = 3; this.buf[2] = msgId; }
  need(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + n) cap *= 2;
    const nb = Buffer.alloc(cap);
    this.buf.copy(nb, 0, 0, this.len);
    this.buf = nb;
  }
  u8(v) { this.need(1); this.buf.writeUInt8(v & 255, this.len); this.len += 1; return this; }
  u16(v) { this.need(2); this.buf.writeUInt16LE(v & 0xffff, this.len); this.len += 2; return this; }
  i16(v) { this.need(2); this.buf.writeInt16LE(v, this.len); this.len += 2; return this; }
  u32(v) { this.need(4); this.buf.writeUInt32LE(v >>> 0, this.len); this.len += 4; return this; }
  i32(v) { this.need(4); this.buf.writeInt32LE(v, this.len); this.len += 4; return this; }
  f32(v) { this.need(4); this.buf.writeFloatLE(v, this.len); this.len += 4; return this; }
  str(s) { const b = Buffer.from(s, 'utf8'); this.u16(b.length); this.need(b.length); b.copy(this.buf, this.len); this.len += b.length; return this; }
  finish() {
    if (this.len > 65535) throw new Error('frame too large');
    this.buf.writeUInt16LE(this.len, 0);
    return this.buf.subarray(0, this.len);
  }
}

/** LEB128 varint（存档 RLE 用；对齐 save/serialize.ts） */
export function varint(v) {
  const out = [];
  let n = v;
  for (;;) {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
    if (n === 0) return out;
  }
}

/** 构造全空气小世界存档（n×n）：一条 RLE run 覆盖全图 */
export function makeTinySave(n = 200) {
  const rle = Buffer.from([...varint(n * n - 1), ...varint(0)]).toString('base64');
  return JSON.stringify({
    format: 'sandboxworld.save', version: 3,
    header: {
      name: '探针世界', seed: 20260812, width: n, height: n,
      spawn: [Math.floor(n / 2), Math.floor(n / 2)], groundLevel: Math.floor(n * 0.3),
      rockLevel: Math.floor(n * 0.5), lavaLine: n - 20,
      created: Date.now(), playTimeMs: 0,
    },
    clock: { timeOfDay: 0.3, dayCount: 1 },
    tiles: rle, walls: rle, liquid: rle, liquidType: rle,
    chests: [], player: { hp: 100, x: 1600, y: 1600, inventory: [], selected: 0 },
    npcs: [], flags: {},
  });
}

/** 起 server 子进程（detached 进程组，防"杀 npx 包装留 tsx 孤儿"——2026-08 实踩） */
export function spawnServer(port, extraArgs = [], serverDir = null) {
  const { spawn } = require('node:child_process');
  const path = require('node:path');
  const cwd = serverDir ?? path.join(ROOT, 'server');
  const server = spawn('npx', ['tsx', 'src/index.ts', '--port', String(port), ...extraArgs], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  server.killGroup = () => {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* 已退 */ } }
  };
  return server;
}
