// 千人容量实测探针（B6a 架构）：真实 serverAuth 房（SimHost）+ N 假人按真实频率
// 上报 msg13，直接量测：人均下行 KB/s（bot 收字节）+ /stats 服务器出向 + 主进程与
// roomHost worker 的 CPU%。两场景：聚集（AOI 扇出最坏）与分散（常态）。
// 用法：node tools/run-diag.mjs scripts/_load-probe.mjs [bot数] [场景 spread|cluster] [秒]
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { WebSocket, Writer, PROTO_MAGIC, PROTO_VER, Msg } from './_netfake.mjs';

const NBOT = parseInt(process.argv[2] ?? '60', 10);
const SCENE = process.argv[3] ?? 'spread';   // spread=全图分散 | cluster=出生点聚集(最坏)
const DUR = parseInt(process.argv[4] ?? '60', 10);
const PORT = 7961;
const LOBBY = PORT + 1;
const M = { ...Msg };

// 起服务器（2 worker——多工拓扑）
const srv = spawn('npx', ['tsx', 'src/index.ts', '--port', String(PORT), '--workers', '2', '--max-rooms', '8'], {
  cwd: new URL('../../server/', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
const log = [];
srv.stdout.on('data', (d) => log.push(d.toString()));
srv.stderr.on('data', (d) => log.push(d.toString()));
srv.killGroup = () => { try { srv.kill('SIGTERM'); } catch { } setTimeout(() => { try { process.kill(-srv.pid, 'SIGKILL'); } catch { } }, 6000).unref?.(); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
while (Date.now() - t0 < 120000 && !log.join('').includes(`ws://0.0.0.0:${PORT}`)) await sleep(400);
console.log(`server up（workers=2）`);

// 真实 4200×1200 档（spawn 附近有地表）
const save = fs.readFileSync(new URL('../../server/worlds/auto-1786375290718.json', import.meta.url), 'utf8');
const res = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'load', public: true, save, rules: { serverAuth: true } }),
}).then((r) => r.json());
if (!res.ok) { console.log('FAIL 建房', res); srv.killGroup(); process.exit(1); }
console.log(`房 ${res.code}（serverAuth, SimHost 活跃）`);

class Bot {
  constructor(i) {
    this.i = i;
    this.inBytes = 0;
    this.rx = 0; this.ry = 0;
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/${res.code}`);
    this.ws.binaryType = 'nodebuffer';
    this.buf = Buffer.alloc(0);
    this.slot = -1;
    this.open = new Promise((r) => this.ws.on('open', r));
    this.ws.on('message', (d) => {
      this.inBytes += d.length;
      this.buf = Buffer.concat([this.buf, d]);
      for (;;) {
        if (this.buf.length < 3) break;
        const len = this.buf.readUInt16LE(0);
        if (this.buf.length < len) break;
        if (this.buf[2] === M.PlayerSlot && this.slot < 0) this.slot = this.buf[3];
        this.buf = this.buf.subarray(len);
      }
    });
  }
}

const bots = [];
for (let i = 0; i < NBOT; i++) bots.push(new Bot(i));
await Promise.all(bots.map((b) => b.open));
console.log(`${NBOT} bot 已连`);

// 握手 + 进场（错峰 5ms 防 sync 洪峰）
for (const b of bots) {
  b.ws.send(new Writer(M.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str(`bot${b.i}`).str('').finish());
  b.ws.send(new Writer(M.RequestWorldData));
  await sleep(5);
}
// 世界数据到达后（房主位 msg7）→ SpawnTileData（分散场景各 bot 错开 200+px 网格）
await sleep(3000);
// spawn ≈ (2100,237) tile → px(33600,3792)。分散:全图 4200×1200 抽样;聚集:±600px
let placed = 0;
for (const b of bots) {
  let px, py;
  if (SCENE === 'cluster') {
    px = 33600 + (b.i % 12) * 60 - 300;
    py = 3792 + Math.floor(b.i / 12) * 60 - 300;
  } else {
    // 分散在可站立地表带（y 200-400 tile 行内随机列;行走模拟不检碰撞——位置上报本身驱动 AOI/密度)
    px = 400 + ((b.i * 379) % 4000) * 16 + 200;
    py = 3792;
  }
  b.rx = px; b.ry = py;
  b.ws.send(new Writer(M.SpawnTileData).i32(Math.floor(px / 16)).i32(Math.floor(py / 16)));
  b.ws.send(new Writer(M.PlayerLifeMana).u8(b.slot < 0 ? 0 : b.slot).i16(400).i16(400));
  placed++;
  await sleep(4);
}
console.log(`${placed} bot 进场（${SCENE}）`);

// 周期任务：bot 10Hz msg13 游走 + CPU 采样 + /stats 采样
const cpuSample = () => {
  try {
    const out = execSync(`ps -o pid,%cpu,rss -p ${srv.pid} $(pgrep -P ${srv.pid} | tr '\\n' ' ') 2>/dev/null || true`, { encoding: 'utf8' });
    return out.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
};
const statSamples = [];
const cpuSamples = [];
let walkT = 0;
const tick13 = setInterval(() => {
  walkT++;
  for (const b of bots) {
    // 游走：±2px/帧 水平往返（msg13 ~10Hz 真实节拍）
    const dx = Math.sin((walkT + b.i * 13) / 40) * 3;
    b.rx += dx;
    b.ws.send(new Writer(M.PlayerState).u8(b.slot).u8(0).u8(0).u8(0)
      .f32(b.rx).f32(b.ry).f32(0).f32(0).u8(0));
  }
}, 100);

// 稳态预热 15s 后开始采样
await sleep(15000);
const inBytes0 = bots.map((b) => b.inBytes);
for (let s = 0; s < Math.max(1, Math.floor(DUR / 5)); s++) {
  await sleep(5000);
  const st = await fetch(`http://127.0.0.1:${LOBBY}/stats`).then((r) => r.json()).catch(() => null);
  if (st) statSamples.push({ online: st.total?.online, outKbS: st.total?.outKbS });
  cpuSamples.push(cpuSample());
  process.stdout.write('.');
}
console.log('');

// ===== 汇总 =====
const dt = 5 * statSamples.length;
const perBot = bots.map((b, i) => (b.inBytes - inBytes0[i]) / dt); // KB/s per bot（下行）
const avgKBs = perBot.reduce((a, b) => a + b, 0) / perBot.length;
const maxKBs = Math.max(...perBot);
const srvOutKbS = statSamples.reduce((a, s) => a + (s.outKbS ?? 0), 0) / statSamples.length;
const online = statSamples.length ? statSamples[statSamples.length - 1].online : 0;
// CPU：末 3 次采样平均（ps 输出行序 = [主进程, ...worker 子进程]）
const lastCpu = cpuSamples.slice(-3).flat();
const byPid = new Map();
for (const line of lastCpu) {
  const [pid, cpu] = line.split(/\s+/);
  byPid.set(pid, (byPid.get(pid) ?? 0) + parseFloat(cpu));
}
const cpuRows = [...byPid.entries()].map(([pid, c]) => ({ pid, cpu: +(c / 3).toFixed(1) }));
const mainCpu = cpuRows[0]?.cpu ?? 0;
const workerCpu = cpuRows.slice(1).reduce((a, r) => a + r.cpu, 0);

console.log('\n========== 千人容量实测 ==========');
console.log(`场景=${SCENE}  bot=${NBOT}  在线(服务器口径)=${online}  采样=${statSamples.length}×5s`);
console.log(`人均下行: avg=${avgKBs.toFixed(2)} KB/s  max=${maxKBs.toFixed(2)} KB/s`);
console.log(`服务器出向(/stats): ${srvOutKbS.toFixed(1)} KB/s ≈ ${(srvOutKbS / NBOT).toFixed(2)} KB/s/人`);
console.log(`CPU(%) 主进程=${mainCpu}  workers合计=${workerCpu}  (${cpuRows.map((r) => `pid${r.pid}:${r.cpu}%`).join(' ')})`);
if (avgKBs > 0) {
  const gbps = (avgKBs * 1000 / 1024 / 1024 * 8);
  console.log(`\n--- 外推 1000 人(线性) ---`);
  console.log(`带宽: ${gbps.toFixed(1)} Gbps | ${((avgKBs * 1000) / 1024).toFixed(1)} MB/s | 月流量(24h×30d): ${((avgKBs * 1000 * 2592000) / 1024 / 1024 / 1024).toFixed(1)} TB`);
  console.log(`CPU: 主进程 ${((mainCpu / NBOT) * 1000 / 100).toFixed(1)} 核 | workers ${((workerCpu / NBOT) * 1000 / 100).toFixed(1)} 核`);
}
const errs = log.join('').split('\n').filter((l) => l.includes('TypeError') || l.includes('uncaught') || l.includes('异常'));
console.log(`异常日志: ${errs.length}${errs.length ? ' — ' + errs.slice(0, 2).join('|').slice(0, 160) : ''}`);

for (const b of bots) try { b.ws.close(); } catch { }
srv.killGroup();
process.exit(errs.length ? 1 : 0);
