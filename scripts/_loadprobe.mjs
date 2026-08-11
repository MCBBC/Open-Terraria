#!/usr/bin/env node
/**
 * 多人联机容量压测探针（P0.5）：Node 原生实现线协议（[u16 len][u8 msgId][payload]），
 * 起 K 个假客户端做真实握手（Hello→RequestWorldData→SpawnTileData）后按 15Hz 发
 * msg13 玩家状态 + msg27 弹幕快照，房主角色额外发 msg23 NPC 快照；
 * 结束时抓 /stats 输出带宽/背压/缓存命中对比表。
 *
 * 用法（自管生命周期，仿 _roomprobe——不经 run-diag，其 0.5s 强退不适合分钟级压测；
 * 内置总时长看门狗 + server 子进程 kill，保证不孤儿）：
 *   node scripts/_loadprobe.mjs [--clients=16] [--seconds=20] [--density=calm|boss]
 *                               [--spread] [--port=7911] [--max-players=255]
 *   --spread：一半客户端放在 5000px 外（对比 AOI 收益：无 AOI 时流量应相同，有 AOI 时大幅下降）
 *
 * 输出：逐房 outKbS / 总出带宽 / sendDrops / msg 直方图 / strip 缓存命中——
 * 优化项落地前后各跑一次，把数字记入 docs/multiplayer-design.md §8。
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../../server/package.json', import.meta.url));
const { WebSocket } = require('ws');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER_DIR = path.join(ROOT, 'server');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const CLIENTS = Math.max(2, parseInt(opt('clients', '16'), 10));
const SECONDS = Math.max(5, parseInt(opt('seconds', '20'), 10));
const DENSITY = opt('density', 'calm');           // calm: 2 发弹幕/人/批  boss: 10 发/人/批
const SPREAD = argv.includes('--spread');
const PORT = parseInt(opt('port', '7911'), 10);
const LOBBY = PORT + 1;
const MAX_PLAYERS = parseInt(opt('max-players', '255'), 10);

// ---------- 线协议（与 game/src/net/protocol.ts 同构的最小实现） ----------
const PROTO_MAGIC = 'SW1';
const PROTO_VER = 4;
const Msg = { Hello: 1, PlayerSlot: 3, SyncPlayer: 4, RequestWorldData: 6, WorldData: 7, SpawnTileData: 8, StatusText: 9, TileSection: 10, PlayerSpawn: 12, PlayerState: 13, SyncNPC: 23, SyncProjectile: 27, Ping: 154 };

class Writer {
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
function varint(v) {
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

/** 构造全空气小世界存档（200×200）：一条 RLE run 覆盖全图 */
function makeTinySave() {
  const n = 200 * 200;
  const rle = Buffer.from([...varint(n - 1), ...varint(0)]);
  return JSON.stringify({
    format: 'sandboxworld.save', version: 3,
    header: {
      name: '压测世界', seed: 20260812, width: 200, height: 200,
      spawn: [100, 100], groundLevel: 60, rockLevel: 100, lavaLine: 180,
      created: Date.now(), playTimeMs: 0,
    },
    clock: { timeOfDay: 0.3, dayCount: 1 },
    tiles: rle.toString('base64'),
    walls: rle.toString('base64'),
    liquid: rle.toString('base64'),
    liquidType: rle.toString('base64'),
    chests: [],
    player: { hp: 100, x: 1600, y: 1600, inventory: [], selected: 0 },
    npcs: [],
    flags: {},
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 总看门狗：无论如何 SECONDS+30s 内必退（防孤儿，含 server 进程组击杀） ----------
const watchdog = setTimeout(() => {
  console.error('[loadprobe] 总看门狗触发，强制退出（exit 2）');
  killServer();
  process.exit(2);
}, (SECONDS + 30) * 1000);
watchdog.unref?.();

// ---------- 起 server（detached 进程组：防"杀 npx 包装留 tsx 孤儿"——2026-08 实踩） ----------
const server = spawn('npx', ['tsx', 'src/index.ts', '--port', String(PORT), '--max-players', String(MAX_PLAYERS)], {
  cwd: SERVER_DIR, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
/** 整组击杀（npx → tsx → node 链）；失败兜底单杀 */
function killServer() {
  try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch { /* 已退 */ } }
}
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d.toString(); });
server.stderr.on('data', (d) => { serverOut += d.toString(); });
const waitServer = async () => {
  const t0 = Date.now();
  for (;;) {
    if (serverOut.includes(`ws://0.0.0.0:${PORT}`)) return;
    if (server.exitCode !== null) throw new Error(`server 启动失败:\n${serverOut.slice(-2000)}`);
    if (Date.now() - t0 > 60_000) throw new Error('server 启动超时');
    await sleep(200);
  }
};

// ---------- 主流程 ----------
try {
  await waitServer();
  // 建房（拿 hostToken → 客户端 0 为房主 = NPC 权威源）
  const created = await (await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '压测房', public: true, save: makeTinySave(), maxPlayers: MAX_PLAYERS }),
  })).json();
  if (!created.ok) throw new Error(`建房失败: ${created.error}`);
  const code = created.code, hostToken = created.hostToken;
  console.log(`[loadprobe] 房间 ${code}  clients=${CLIENTS} density=${DENSITY} spread=${SPREAD} seconds=${SECONDS}`);

  const fakes = [];
  for (let i = 0; i < CLIENTS; i++) {
    const far = SPREAD && i >= Math.ceil(CLIENTS / 2);
    const baseX = 1600 + (i % 8) * 60;         // 近距簇：±420px 内互在视野
    const baseY = 1600 + Math.floor(i / 8) * 60;
    const x0 = far ? baseX + 5000 : baseX;      // 远距组：5000px 外（AOI 外）
    const y0 = far ? baseY : baseY;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${code}${i === 0 ? `?token=${encodeURIComponent(hostToken)}` : ''}`);
    ws.binaryType = 'nodebuffer';
    const st = { ws, i, slot: -1, joined: false, x0, y0, framesIn: 0, bytesIn: 0 };
    ws.on('open', () => {
      // Hello（URL 已带 token：路由层注入 urlToken 优先——消息内兜底传空）
      ws.send(new Writer(Msg.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str(`压测${i}`).str('').finish());
    });
    ws.on('message', (data) => {
      st.bytesIn += data.length;
      st.framesIn++;
      let p = 0;
      const buf = data;
      while (p + 3 <= buf.length) {
        const len = buf.readUInt16LE(p);
        const msgId = buf[p + 2];
        if (msgId === Msg.PlayerSlot && st.slot < 0) {
          st.slot = buf[p + 3];
          // 对齐真实客户端：SyncPlayer → RequestWorldData
          ws.send(new Writer(Msg.SyncPlayer).u8(st.slot).str('{"hair":0}').finish());
          ws.send(new Writer(Msg.RequestWorldData).finish());
        } else if (msgId === Msg.WorldData) {
          ws.send(new Writer(Msg.SpawnTileData).i32(100).i32(100).finish());
        } else if (msgId === Msg.PlayerSpawn) {
          st.joined = true;
        }
        if (len < 3) break;
        p += len;
      }
    });
    fakes.push(st);
  }
  await sleep(4000);
  const joined = fakes.filter((f) => f.joined).length;
  console.log(`[loadprobe] 握手完成 ${joined}/${CLIENTS}`);
  if (joined < CLIENTS) throw new Error('部分客户端握手失败');

  // ---------- 负载注入：15Hz msg13（圆周走动）+ msg27（密度档）+ 房主 msg23 ----------
  const projPerBatch = DENSITY === 'boss' ? 10 : 2;
  const t1 = Date.now();
  while (Date.now() - t1 < SECONDS * 1000) {
    const t = (Date.now() - t1) / 1000;
    for (const f of fakes) {
      const ang = t * 1.2 + f.i;
      const x = f.x0 + Math.cos(ang) * 120;
      const y = f.y0 + Math.sin(ang) * 120;
      f.ws.send(new Writer(Msg.PlayerState)
        .u8(f.slot).u8(8).u8(4).u8(0)
        .f32(x).f32(y).f32(Math.cos(ang) * 2).f32(Math.sin(ang) * 2)
        .finish());
      // msg27：各自的弹幕互播（netId = slot<<24 | k，防撞号）
      const w = new Writer(Msg.SyncProjectile);
      w.u16(projPerBatch);
      for (let k = 0; k < projPerBatch; k++) {
        w.u32(((f.slot & 0xff) << 24) | (k & 0xffffff));
        w.u8(0); w.str('1');
        w.i16(10); w.i16(0);
        w.f32(x + k * 8); w.f32(y + k * 8); w.f32(3); w.f32(0);
      }
      f.ws.send(w.finish());
      // 房主 msg23：24 条 NPC 快照（真实房主每批上限同值）
      if (f.i === 0) {
        const w23 = new Writer(Msg.SyncNPC);
        w23.u16(24);
        for (let k = 0; k < 24; k++) {
          w23.u32(k + 1); w23.str(`v_${k + 100}`);
          w23.f32(x + k * 16); w23.f32(y + k * 16); w23.f32(1); w23.f32(0);
          w23.i16(100); w23.i16(100); w23.u16(0); w23.u8(0);
        }
        f.ws.send(w23.finish());
      }
    }
    await sleep(66); // ≈15Hz
  }

  // ---------- /stats 汇总 ----------
  await sleep(1200); // 等 1s outBps 采样窗口
  const stats = await (await fetch(`http://127.0.0.1:${LOBBY}/stats`)).json();
  const room = stats.rooms[0];
  const inbound = fakes.reduce((s, f) => s + f.bytesIn, 0);
  console.log('\n===== /stats 汇总 =====');
  console.log(`总出带宽      : ${stats.total.outKbS} KB/s（${(stats.total.outKbS / 1024).toFixed(2)} MB/s）`);
  console.log(`每客户端均摊  : ${(stats.total.outKbS / Math.max(1, CLIENTS)).toFixed(2)} KB/s`);
  console.log(`客户端总入站  : ${(inbound / 1024).toFixed(1)} KB（${(inbound / SECONDS / 1024).toFixed(2)} KB/s）`);
  console.log(`背压丢弃      : ${stats.total.sendDrops} 帧`);
  console.log(`strip 缓存    : hit=${room.stripHit} miss=${room.stripMiss}`);
  console.log('msg 出流量Top5:', room.topMsgs.map((m) => `${m.msg}(${m.kb}KB×${m.n})`).join('  '));
  console.log(`stalePos 计数 : ${room.stalePos}`);
  const expect = SPREAD ? '（spread 模式：AOI 生效时近距簇内流量应远低于无 AOI 基线）' : '';
  console.log(`\n[loadprobe] 完成。把本表数字记入 docs/multiplayer-design.md §8 ${expect}`);

  server.kill('SIGTERM'); // 走优雅退出（SIGTERM 落盘）；1s 未退则整组击杀
  setTimeout(() => killServer(), 1000).unref?.();
  setTimeout(() => process.exit(0), 300);
} catch (e) {
  console.error('[loadprobe] 失败:', e.message);
  killServer();
  setTimeout(() => process.exit(1), 300);
}
