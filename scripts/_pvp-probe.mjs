// PvP 协议端到端验证（v7，不起浏览器——纯 WS 协议层）：
//   ① RoomPolicy 尾部 pvpAllowed（pvp 房=1 / 普通房=0）
//   ② msg13 v7：hostile(flagBits[7]) + 尾部 team 中继保真
//   ③ msg27 kind bit6（玩家 PvP 弹）：pvp 房透传 / 普通房剥离（墙）
//   ④ msg27 kind bit7（NPC 敌弹）：访客置位仍剥离（v5 反作弊回归）
//   ⑤ msg44 StrikePlayer：pvp 房定向转发 + dmg 9999 钳位 + 尾部 fromSlot 回填；
//      普通房直接丢弃
// 用法：node scripts/_pvp-probe.mjs
import { WebSocket, Writer, PROTO_MAGIC, PROTO_VER, Msg, makeTinySave, spawnServer } from './_netfake.mjs';

const PORT = 7905;
const LOBBY = PORT + 1;

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => { const s = d.toString(); serverLog.push(s); if (s.includes('[dbg]')) process.stdout.write(s); });
server.stderr.on('data', (d) => serverLog.push(d.toString()));
const waitServer = async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    if (serverLog.join('').includes(`ws://0.0.0.0:${PORT}`)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};
if (!(await waitServer())) {
  console.log('FAIL: 服务器启动超时\n' + serverLog.slice(-10).join(''));
  server.killGroup();
  process.exit(1);
}
console.log('server up');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 原始 WS 客户端：Hello v7 + 帧收集（u16 长度前缀分帧） ----
class FakeClient {
  constructor(code, name) {
    this.name = name;
    this.frames = [];       // {id, body: Buffer}
    this.slot = -1;
    this.policy = null;
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/${code}`);
    this.ready = new Promise((res, rej) => {
      this.ws.on('open', () => {
        this.ws.send(new Writer(Msg.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str(name).str('').finish());
      });
      this.ws.on('message', (data) => {
        const buf = Buffer.from(data);
        let p = 0;
        while (p + 3 <= buf.length) {
          const len = buf.readUInt16LE(p);
          if (len < 3 || p + len > buf.length) break;
          const id = buf[p + 2];
          const body = buf.subarray(p + 3, p + len);
          this.frames.push({ id, body });
          if (id === Msg.PlayerSlot) {
            this.slot = body[0];
            // msg8 请求周围 strip（触发 PlayerSpawn + RoomPolicy 下发 + 在场玩家快照）
            this.ws.send(new Writer(8).i32(100).i32(100).finish());
          }
          if (id === Msg.RoomPolicy) this.policy = body;
          p += len;
        }
        if (this.slot >= 0 && this.policy) res();
      });
      this.ws.on('error', (e) => rej(e));
      setTimeout(() => rej(new Error('join timeout')), 90000);
    });
  }
  send(w) { this.ws.send(w); }
  /** 等 condition(frames) 为真（最多 ms） */
  async wait(cond, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = cond(this.frames, this);
      if (hit) return hit;
      await sleep(50);
    }
    return null;
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

// ---- ① 建 pvp 房 + 普通房 ----
const pvpRoom = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'pvp房', public: false, pvpAllowed: true, save: makeTinySave() }),
}).then((r) => r.json());
check('pvpAllowed 房创建成功', !!pvpRoom.ok, pvpRoom.error ?? '');
const normRoom = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '普通房', public: false, save: makeTinySave() }),
}).then((r) => r.json());
check('普通房创建成功', !!normRoom.ok, normRoom.error ?? '');

// RoomPolicy 尾部解析：str code + str name + bool×3 + u16 maxPlayers + u8 pvpAllowed
const parsePolicy = (body) => {
  let q = 0;
  const str = () => { const n = body.readUInt16LE(q); q += 2; const s = body.toString('utf8', q, q + n); q += n; return s; };
  str(); str();
  const isHost = !!body[q]; q += 1;
  const protectTiles = !!body[q]; q += 1;
  const protectItems = !!body[q]; q += 1;
  const maxPlayers = body.readUInt16LE(q); q += 2;
  const pvpAllowed = body.length > q ? !!body[q] : false;
  return { isHost, protectTiles, protectItems, maxPlayers, pvpAllowed };
};

// ---- pvp 房：房主 + 访客 ----
const host = new FakeClient(pvpRoom.code, '房主');
const guest = new FakeClient(pvpRoom.code, '访客');
await Promise.all([host.ready, guest.ready]).catch((e) => {
  console.log('FAIL: 进房失败', e.message);
  console.log('server log tail:', serverLog.slice(-6).join(''));
  console.log('host frames:', host.frames.map((f) => f.id)); console.log('guest frames:', guest.frames.map((f) => f.id));
  server.killGroup();
  process.exit(1);
});
check('pvp 房：房主 slot=0 + 访客 slot=1', host.slot === 0 && guest.slot === 1, `slots=${host.slot},${guest.slot}`);
check('① pvp 房 RoomPolicy.pvpAllowed=1', host.policy ? parsePolicy(host.policy).pvpAllowed === true : false);

// ---- ② msg13 hostile + team 中继（双方先报位防盲端门） ----
const pos13 = (flag, team) =>
  new Writer(Msg.PlayerState).u8(0).u8(0).u8(flag).u8(0)
    .f32(1600).f32(400).f32(0).f32(0).u8(team).finish();
host.send(pos13(4, 1));
guest.send(pos13(4 | 128, 3));
const got13 = await host.wait((fr) => fr.find((f) => f.id === Msg.PlayerState && f.body.length > 0 && f.body[0] === 1));
let hostileOk = false, teamOk = false;
if (got13) {
  const b = got13.body;
  // slot + ctrl + flag + sel + x,y,vx,vy(16B) + tail team → team 在 b[20]
  const flag = b[2];
  const tailTeam = b.length > 20 ? b[20] : -1;
  hostileOk = !!(flag & 128);
  teamOk = tailTeam === 3;
}
check('② msg13 hostile(flagBits[7]) 中继保真', hostileOk);
check('② msg13 尾部 team=3 中继保真', teamOk);

// ---- ③ pvp 房 msg27 bit6 透传 ----
guest.send(new Writer(Msg.SyncProjectile).u16(1)
  .u32((1 << 24) + 7).u8(0x40 | 0).str('5').i16(25).i16(0)
  .f32(1600).f32(400).f32(1).f32(0).finish());
const gotProj = await host.wait((fr) => fr.find((f) => f.id === Msg.SyncProjectile));
let bit6Ok = false; let b0count = -1, b0hi = -1, b0kind = -1;
if (gotProj) {
  const b = gotProj.body;
  const count = b.readUInt16LE(0);
  let q = 2;
  const netId = b.readUInt32LE(q); q += 4;
  const kind = b[q]; q += 1;
  bit6Ok = count === 1 && (netId >>> 24) === 1 && kind === 0x40;
}
check('③ pvp 房 msg27 bit6（PvP 弹）透传', bit6Ok,
  gotProj ? `count=${b0count} netIdHi=${b0hi} kind=${b0kind}` : 'no msg27 frame received');

// ---- ④ 访客伪造 bit7 敌弹仍剥离（v5 反作弊回归） ----
guest.send(new Writer(Msg.SyncProjectile).u16(1)
  .u32((1 << 24) + 8).u8(0x80 | 2).str('0').i16(50).i16(0)
  .f32(1600).f32(400).f32(1).f32(0).finish());
await sleep(600);
const projFrames = host.frames.filter((f) => f.id === Msg.SyncProjectile);
let strippedOk = false;
if (projFrames.length >= 2) {
  const b = projFrames[projFrames.length - 1].body;
  let q = 2; q += 4;
  strippedOk = (b[q] & 0x80) === 0 && (b[q] & 0x7f) === 2;
}
check('④ 访客 bit7 敌弹剥离（反作弊回归）', strippedOk, JSON.stringify(projFrames.map((f) => f.body.subarray(2, 7))));

// ---- ⑤ pvp 房 msg44 定向转发 + 钳位 + fromSlot ----
// 先刷新双方位置（blindAbuser 门：lastPosAt 超 15s 即拒/踢）
host.send(pos13(4, 1));
guest.send(pos13(4 | 128, 3));
await sleep(200);
guest.send(new Writer(Msg.StrikePlayer).u8(0).i16(30000).i16(1).i16(0).u16(5).u8(3).finish());
const got44 = await host.wait((fr) => fr.find((f) => f.id === Msg.StrikePlayer));
let ok44 = false;
if (got44) {
  const b = got44.body;
  const targetSlot = b[0];
  const dmg = b.readInt16LE(1);
  const kbx = b.readInt16LE(3), kby = b.readInt16LE(5);
  const weaponId = b.readUInt16LE(7);
  const flags = b[9];
  const fromSlot = b.length > 10 ? b[10] : -1;
  ok44 = targetSlot === 0 && dmg === 9999 && kbx === 1 && kby === 0 && weaponId === 5 && flags === 3 && fromSlot === 1;
  check('⑤ msg44 转发：target/dmg钳9999/kb/weapon/flags', true, `dmg=${dmg} from=${fromSlot}`);
}
check('⑤ msg44 尾部 fromSlot=服务器回填(访客 slot 1)', ok44,
  `${got44 ? 'received' : 'NOT received'} kick=${!!guest.frames.find((f) => f.id === Msg.Kick)} log=${serverLog.filter((l) => l.includes('踢') || l.includes('kick') || l.includes('断')).slice(-2).join('|')}`);
// 访客不应收到自己的 msg44
await sleep(400);
check('⑤ msg44 不回环给发送者', !guest.frames.some((f) => f.id === Msg.StrikePlayer));

// ---- 普通房：墙 + 丢弃 ----
const host2 = new FakeClient(normRoom.code, '房主2');
const guest2 = new FakeClient(normRoom.code, '访客2');
await Promise.all([host2.ready, guest2.ready]).catch((e) => { console.log('FAIL: 普通房进房失败', e.message); server.killGroup(); process.exit(1); });
check('① 普通房 RoomPolicy.pvpAllowed=0', host2.policy ? parsePolicy(host2.policy).pvpAllowed === false : false);
host2.send(pos13(4, 0));
guest2.send(pos13(4, 0));
await sleep(300);
guest2.send(new Writer(Msg.SyncProjectile).u16(1)
  .u32((1 << 24) + 9).u8(0x40 | 0).str('5').i16(25).i16(0)
  .f32(1600).f32(400).f32(1).f32(0).finish());
const gotProj2 = await host2.wait((fr) => fr.find((f) => f.id === Msg.SyncProjectile));
let wallOk = false;
if (gotProj2) {
  const b = gotProj2.body;
  wallOk = (b[6] & 0x40) === 0 && (b[6] & 0x7f) === 0;   // kind 位被剥净
}
check('③ 普通房 msg27 bit6 剥离（墙）', wallOk);

guest2.send(new Writer(Msg.StrikePlayer).u8(0).i16(30).i16(1).i16(0).u16(5).u8(1).finish());
await sleep(800);
check('⑤ 普通房 msg44 丢弃（不转发）', !host2.frames.some((f) => f.id === Msg.StrikePlayer));

// ---- 清理 ----
for (const c of [host, guest, host2, guest2]) c.close();
try {
  await fetch(`http://127.0.0.1:${LOBBY}/rooms/${pvpRoom.code}`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:${LOBBY}/rooms/${normRoom.code}`, { method: 'DELETE' });
} catch { /* noop */ }
await sleep(300);
server.killGroup();

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
