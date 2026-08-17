// 服务器权威房（SimHost）端到端验证（v8，docs/server-room-plan.md B1-B3 验收）：
//   ① POST /rooms {rules.serverAuth} → 返回 gmToken；② 握手进房 → RoomPolicy ruleBits
//   含 serverAuth；③ 假人持续上报位置 → SimHost 刷怪 → 收到 msg23 服务器源 NPC 快照；
//   ④ /rules 命令回显；⑤ forbidBreak：TileBatch 破坏 op → 权威纠正帧回弹；
//   ⑥ PATCH /rules 热更 peaceMode → RoomPolicy 重播（bit6）；⑦ SummonIntent 脏 key 拒。
// 用法：node tools/run-diag.mjs scripts/_sr-probe.mjs
import {
  WebSocket, Writer, PROTO_MAGIC, PROTO_VER, Msg, makeTinySave, spawnServer,
} from './_netfake.mjs';
import { spawn, execSync } from 'node:child_process';

const PORT = 7921; // ws（探针专用段，避让 _roomprobe 79xx）
const LOBBY = PORT + 1;

// _netfake Msg 表缺的号（本地扩展,不动共享文件）
const M = { ...Msg, TileBatch: 17, NetModules: 82, SyncItem: 21, SummonIntent: 202, SetTime: 18 };

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => { const s = d.toString(); serverLog.push(s); if (s.includes('[dbg]') || s.includes('[sim]')) process.stdout.write(s); });
server.stderr.on('data', (d) => serverLog.push(d.toString()));
const waitServer = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    if (serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简帧客户端：hello → slot → 世界 → 进场；收集各号帧 */
class FakeClient {
  constructor(url) {
    this.frames = [];          // { id, r: Buffer 载荷(不含 3B 头) }
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'nodebuffer';
    this.open = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.buf = Buffer.alloc(0);
    this.ws.on('message', (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      for (;;) {
        if (this.buf.length < 3) break;
        const len = this.buf.readUInt16LE(0);
        if (this.buf.length < len) break;
        this.frames.push({ id: this.buf[2], r: this.buf.subarray(3, len) });
        this.buf = this.buf.subarray(len);
      }
    });
  }
  send(w) { this.ws.send(w.finish()); }
  async wait(id, ms, pred) {
    const t0 = Date.now();
    for (;;) {
      const f = this.frames.find((x) => x.id === id && (!pred || pred(x)));
      if (f) return f;
      if (Date.now() - t0 > ms) return null;
      await sleep(50);
    }
  }
}

// 载荷读手（小端）
const R = {
  u8: (b, o) => [b[o], 1],
  u16: (b, o) => [b.readUInt16LE(o), 2],
  i16: (b, o) => [b.readInt16LE(o), 2],
  u32: (b, o) => [b.readUInt32LE(o), 4],
  i32: (b, o) => [b.readInt32LE(o), 4],
  f32: (b, o) => [b.readFloatLE(o), 4],
  f64: (b, o) => [b.readDoubleLE(o), 8],
};

try {
  if (!(await waitServer())) throw new Error('服务器启动超时\n' + serverLog.slice(-8).join(''));
  console.log('server up');

  // ---- ① 建服务器房（rules.serverAuth + forbidBreak） ----
  const res = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'sr探针', public: true, save: makeTinySave(200), rules: { serverAuth: true, forbidBreak: true } }),
  }).then((r) => r.json());
  check('① 建房成功', !!res.ok && /^\d{6}$/.test(res.code), `code=${res.code}`);
  check('① 返回 gmToken', typeof res.gmToken === 'string' && res.gmToken.length > 10);
  check('① rules 回显 serverAuth', !!res.rules?.serverAuth);

  // ---- ② 握手进房 ----
  const c = new FakeClient(`ws://127.0.0.1:${PORT}/${res.code}`);
  await c.open;
  c.send(new Writer(M.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str('srBot').str(''));
  const slotF = await c.wait(M.PlayerSlot, 5000);
  check('② PlayerSlot', !!slotF);
  c.send(new Writer(M.RequestWorldData));
  const wd = await c.wait(M.WorldData, 5000);
  check('② WorldData', !!wd);
  // spawnX/Y：f64 time + u32 dayCount + u16 w + u16 h 之后
  const [, s1] = R.f64(wd.r, 0); const [, s2] = R.u32(wd.r, s1); const [, s3] = R.u16(wd.r, s2); const [, s4] = R.u16(wd.r, s3);
  const [spawnX, s5] = R.i32(wd.r, s4); const [spawnY] = R.i32(wd.r, s5);
  c.send(new Writer(M.SpawnTileData).i32(spawnX).i32(spawnY));
  const pol = await c.wait(M.RoomPolicy, 5000);
  check('② 进场 RoomPolicy', !!pol);
  // RoomPolicy: code str + name str + bool isHost + bool ×2 + u16 max + u8 pvp + u8 ruleBits
  {
    let o = 0;
    const [codeL, a] = R.u16(pol.r, o); o += a + codeL;
    const [nameL, b] = R.u16(pol.r, o); o += b + nameL;
    const isHost = pol.r[o]; o += 3; // isHost + protect×2
    const [, c1] = R.u16(pol.r, o); o += c1;
    const pvp = pol.r[o]; o += 1;
    const ruleBits = pol.r[o];
    check('② serverAuth 房客户端非房主', isHost === 0, `isHost=${isHost}`);
    check('② ruleBits.bit0=serverAuth', (ruleBits & 1) === 1, `bits=${ruleBits}`);
    check('② ruleBits.bit2=forbidBreak', (ruleBits & 4) === 4);
  }
  await c.wait(M.PlayerSpawn, 8000);
  // 等 strip 流完（进场 state=10 后收 PlayerSpawn 即在局）
  await sleep(500);

  // ---- ③ 假人持续上报位置 + 确定性召唤 → SimHost → msg23 ----
  const px = spawnX * 16 + 8, py = spawnY * 16 + 8;
  const stateTimer = setInterval(() => {
    c.send(new Writer(M.PlayerState).u8(slotF.r[0]).u8(0).u8(0).u8(0).f32(px).f32(py).f32(0).f32(0).u8(0));
  }, 100);
  c.send(new Writer(M.PlayerLifeMana).u8(slotF.r[0]).i16(400).i16(400));
  // ③a 确定性管线验证：SummonIntent 召史莱姆王 → SimHost 生成 → msg23 下发
  //    （全空气微型世界的自然刷怪不保证命中——spawner 条件依赖地形,只作观察项）
  c.send(new Writer(M.SummonIntent).str('king_slime').f32(px).f32(py - 100).f32(0).f32(0));
  console.log('③ 等待 SimHost 召唤下发（最多 10s）…');
  const npcF = await c.wait(M.SyncNPC, 10000);
  check('③ msg23 服务器源 NPC 快照到达', !!npcF, npcF ? `首帧 ${npcF.r.length}B` : '10s 无 NPC');
  const total23 = c.frames.filter((f) => f.id === M.SyncNPC).length;
  await sleep(3000);
  const total23b = c.frames.filter((f) => f.id === M.SyncNPC).length;
  check('③ NPC 快照持续下发（模拟在跑）', total23b > total23 || total23b > 5, `${total23}→${total23b} 帧`);

  // ---- ④ /rules 命令 ----
  c.send(new Writer(M.NetModules).u16(1).str('/rules'));
  const rulesMsg = await c.wait(M.NetModules, 4000, (f) => {
    if (f.r.readUInt16LE(0) !== 1) return false;
    return f.r[2] === 255; // author=255 服务器公告
  });
  check('④ /rules 回显', !!rulesMsg, rulesMsg ? `${rulesMsg.r.length}B` : '无回显');

  // ---- ⑤ forbidBreak：破坏 op → 权威纠正回弹 ----
  // writeTileBatch 线序：u16 count + [u8 action + i32 x + i32 y + u16 v + (SetTile: u16 fx + u16 fy)]
  const framesBefore = c.frames.length;
  c.send(new Writer(M.TileBatch).u16(1).u8(0).i32(spawnX).i32(spawnY).u16(0).u16(0).u16(0));
  await sleep(800);
  const newFrames = c.frames.slice(framesBefore).filter((f) => f.id === M.TileBatch);
  check('⑤ 禁破坏:权威纠正帧回弹', newFrames.length > 0, `${newFrames.length} 帧纠正`);
  // 纠正帧 = 当前格状态（全空气世界 → type 0；但纠正帧本身到达即证明拒绝路径）

  // ---- ⑥ PATCH 规则热更 peaceMode → RoomPolicy 重播 ----
  const patch = await fetch(`http://127.0.0.1:${LOBBY}/rooms/${res.code}/rules?token=${res.gmToken}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peaceMode: true }),
  }).then((r) => r.json());
  check('⑥ PATCH 热更成功', !!patch.ok && patch.rules.peaceMode === true);
  const pol2 = await c.wait(M.RoomPolicy, 4000, (f) => f !== pol);
  check('⑥ RoomPolicy 重播', !!pol2);
  {
    let o = 0;
    const [codeL, a] = R.u16(pol2.r, o); o += a + codeL;
    const [nameL, b] = R.u16(pol2.r, o); o += b + nameL;
    o += 3; const [, c1] = R.u16(pol2.r, o); o += c1 + 1;
    const ruleBits = pol2.r[o];
    check('⑥ peaceMode 位下发', (ruleBits & 64) === 64, `bits=${ruleBits}`);
  }

  // ---- ⑦ SummonIntent 脏 key 拒（静默丢弃,连接不断） ----
  c.send(new Writer(M.SummonIntent).str('not_a_real_npc').f32(px).f32(py).f32(0).f32(0));
  await sleep(500);
  check('⑦ 脏 key 意图静默丢弃（连接存活）', c.ws.readyState === 1);

  // ---- ⑧ 服务器进程健康（SimHost 未崩溃） ----
  check('⑧ 服务器进程存活', server.exitCode === null);
  const errs = serverLog.join('').split('\n').filter((l) => l.includes('Error') || l.includes('TypeError'));
  check('⑧ 无异常日志', errs.length === 0, errs.slice(0, 3).join(' | ').slice(0, 200));
  if (fail > 0) console.log('--- server log tail ---\n' + serverLog.slice(-25).join(''));

  clearInterval(stateTimer);
  c.ws.close();
} catch (e) {
  console.log('FAIL: 异常中断 —', e instanceof Error ? e.message : e);
  fail++;
} finally {
  console.log(`\n===== _sr-probe 结果: ${pass} PASS / ${fail} FAIL =====`);
  server.killGroup();
  if (fail > 0) process.exitCode = 1;
}
