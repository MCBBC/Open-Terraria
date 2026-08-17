// B5 AOI 网格索引正确性探针（broadcastAt 网格桶化——近收/远不收/移近恢复/观战兜底）：
//   中继房（共享路径）+ 3-4 假人：A(近C,远B) 发 msg13 → C 收 B 不收;
//   B 移近(重入格) → 恢复接收;D 远程观战 A → 兜底线性段命中。
// 用法：node tools/run-diag.mjs scripts/_aoi-probe.mjs
import { WebSocket, Writer, PROTO_MAGIC, PROTO_VER, Msg, makeTinySave, spawnServer } from './_netfake.mjs';

const PORT = 7941;
const LOBBY = PORT + 1;
const M = { ...Msg, SetTime: 18, SpectateFocus: 150 };

const server = spawnServer(PORT);
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
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

class FC {
  constructor(url) {
    this.frames = [];
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
  countFrom(slot) { // msg13 帧中 slot 字节匹配数（msg13 payload[0]=slot）
    return this.frames.filter((f) => f.id === M.PlayerState && f.r.length >= 1 && f.r[0] === slot).length;
  }
}

try {
  if (!(await waitServer())) throw new Error('服务器启动超时');
  const res = await fetch(`http://127.0.0.1:${LOBBY}/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'aoi', public: true, save: makeTinySave(200) }),
  }).then((r) => r.json());
  check('建房', !!res.ok && /^\d{6}$/.test(res.code));

  const mk = async (name) => {
    const c = new FC(`ws://127.0.0.1:${PORT}/${res.code}?token=${encodeURIComponent(res.hostToken)}`);
    await c.open;
    c.send(new Writer(M.Hello).str(PROTO_MAGIC).u16(PROTO_VER).str(name).str(res.hostToken));
    const slotF = await c.wait(M.PlayerSlot, 5000);
    c.slot = slotF.r[0];
    c.send(new Writer(M.RequestWorldData));
    await c.wait(M.WorldData, 5000);
    const tx = c.slot * 5 + 40, ty = 100; // 各自错开的进场点（0..3200px 界内）
    c.send(new Writer(M.SpawnTileData).i32(tx).i32(ty));
    await c.wait(M.PlayerSpawn, 8000);
    await sleep(300);
    return c;
  };
  const A = await mk('A'); const C = await mk('C'); const B = await mk('B'); const D = await mk('D');

  const pos = (c, x, y) => c.send(new Writer(M.PlayerState).u8(c.slot).u8(0).u8(0).u8(0).f32(x).f32(y).f32(0).f32(0).u8(0));
  // 布阵：A(640,1600) C(900,1600) 近;B(3050,1600) 远(A-B 2410>1920);D(3050,2400) 远
  for (const [c, x, y] of [[A, 640, 1600], [C, 900, 1600], [B, 3050, 1600], [D, 3050, 2400]]) {
    for (let i = 0; i < 3; i++) { pos(c, x, y); await sleep(60); }
  }
  await sleep(300);

  // ---- ① A 发位置：C 收，B/D 不收（网格筛除） ----
  const cBefore = C.countFrom(A.slot), bBefore = B.countFrom(A.slot), dBefore = D.countFrom(A.slot);
  pos(A, 640, 1600);
  await sleep(800);
  check('① 近端 C 收到 A 的 msg13', C.countFrom(A.slot) > cBefore, `${cBefore}→${C.countFrom(A.slot)}`);
  check('① 远端 B 未收到（网格筛除）', B.countFrom(A.slot) === bBefore, `${bBefore}→${B.countFrom(A.slot)}`);
  check('① 远端 D 未收到', D.countFrom(A.slot) === dBefore, `${dBefore}→${D.countFrom(A.slot)}`);

  // ---- ② B 移近（msg13 重入格）→ 恢复接收 ----
  const bBefore2 = B.countFrom(A.slot);
  for (let i = 0; i < 3; i++) { pos(B, 700, 1600); await sleep(60); } // 移到 A 附近
  await sleep(200);
  pos(A, 640, 1600);
  await sleep(800);
  check('② B 移近后恢复接收（重入格）', B.countFrom(A.slot) > bBefore2, `${bBefore2}→${B.countFrom(A.slot)}`);

  // ---- ③ D 远程观战 A（msg150）→ 兜底线性段命中 ----
  const dBefore3 = D.countFrom(A.slot);
  D.send(new Writer(M.SpectateFocus).i16(A.slot));
  await sleep(200);
  pos(A, 640, 1600);
  await sleep(800);
  check('③ 观战 D 收到 A 区域广播（兜底段）', D.countFrom(A.slot) > dBefore3, `${dBefore3}→${D.countFrom(A.slot)}`);

  // ---- ④ 断开后无残留（网格清理） ----
  B.ws.close();
  await sleep(400);
  check('④ 服务器存活', server.exitCode === null);
  const errs = serverLog.join('').split('\n').filter((l) => l.includes('TypeError') || l.includes('uncaught'));
  check('④ 无异常日志', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 150));

  for (const c of [A, C, D]) c.ws.close();
} catch (e) {
  console.log('FAIL: 异常中断 —', e instanceof Error ? e.message : e);
  fail++;
} finally {
  console.log(`\n===== _aoi-probe 结果: ${pass} PASS / ${fail} FAIL =====`);
  if (fail > 0) console.log(serverLog.slice(-20).join(''));
  server.killGroup();
  if (fail > 0) process.exitCode = 1;
}
