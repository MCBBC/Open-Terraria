// v3 测试：setTile / fillRect / blankWorld / buildScript 动态铺地形
import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
import { mkdirSync } from 'node:fs';

mkdirSync('/tmp/probe-out/_director-v3', { recursive: true });
const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null; const rx = [];
wss.on('connection', ws => {
  ws.on('message', d => { try { const m = JSON.parse(d); if (m.op === 'hello' && (m.v ?? 0) >= 2) mod = ws; } catch {} });
  if (!mod) mod = ws;  // 首个兜底 ws.on('message', d => { try { rx.push(JSON.parse(d)); } catch {} }); });

let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} }); ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  page.on('pageerror', e => console.log('[pageerror]', e.message.split('\n')[0]));
  await gotoApp(page, ORIGIN, { tries: 40 });
  await page.evaluate(async () => {
    const res = await fetch('/mods/dist/director.swmod?t=' + Date.now());
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { ModStore } = await import('/src/mods/store.ts');
    const { readModPack } = await import('/src/mods/pack.ts');
    const { loadModsPhase1 } = await import('/src/mods/loader.ts');
    const storage = { reg: JSON.stringify([]), zips: new Map(),
      async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
      async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
      async deleteZip(id) { this.zips.delete(id); } };
    const store = new ModStore(storage);
    const pack = readModPack(bytes);
    await store.install(pack.manifest, bytes, null);
    await loadModsPhase1(storage);
  });
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2000 });
  L.chk('世界', gen.ok);
  await new Promise(r => setTimeout(r, 1000));

  const cmd = c => { rx.length = 0; mod.send(JSON.stringify({ op: 'cmd', c })); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async n => { await front(page); await wait(500); await page.screenshot({ path: `/tmp/probe-out/_director-v3/${n}.png` }); };
  const tileAt = (x, y) => page.evaluate(([tx, ty]) => window.__swGame.world.store.type[ty * window.__swGame.world.w + tx], [x, y]);
  const pPos = () => page.evaluate(() => ({ x: Math.round(window.__swGame.player.cx / 16), y: Math.round(window.__swGame.player.cy / 16) }));

  // ① setTile 单格
  const p = await pPos();
  cmd({ cmd: 'setTile', x: p.x + 3, y: p.y, tile: 1 });   // 石头
  await wait(300);
  const t1 = await tileAt(p.x + 3, p.y);
  L.chk('setTile 石头', t1 === 1, `tile=${t1}`);

  // ② fillRect 铺平台
  cmd({ cmd: 'fillRect', x: p.x - 10, y: p.y + 5, w: 20, h: 3, tile: 1 });  // 石头平台
  await wait(500);
  const t2 = await tileAt(p.x, p.y + 6);
  L.chk('fillRect 平台', t2 === 1, `tile=${t2}`);
  await shot('platform');

  // ③ clearRect 挖洞
  cmd({ cmd: 'clearRect', x: p.x + 2, y: p.y + 4, w: 4, h: 5 });
  await wait(300);
  const t3 = await tileAt(p.x + 3, p.y + 5);
  L.chk('clearRect 挖洞', t3 === 0, `tile=${t3}`);

  // ④ buildScript 动态铺地形——「脚下只有一格，往前走持续铺路」
  console.log('--- buildScript 动态铺路测试');
  cmd({ cmd: 'buildScript', code: `
    // 玩家脚下和前方 3 格持续铺石头（保证不掉下去）
    const px = Math.floor(g.player.cx / 16), py = Math.floor((g.player.y + g.player.h) / 16);
    for (let dx = -2; dx <= 4; dx++) {
      st.setTileSilent(px + dx, py, 1);
      st.setTileSilent(px + dx, py + 1, 1);
    }
    return;
  ` });
  await wait(500);

  // 走路——buildScript 应该持续铺路
  cmd({ cmd: 'walkTo', x: p.x + 30, y: p.y, dur: 10 });
  await wait(2000);
  await shot('dynamic-build-walk');
  const p2 = await pPos();
  L.chk('动态铺路走位', p2.x > p.x + 5, `${p.x} → ${p2.x}`);
  cmd({ cmd: 'stop' });
  cmd({ cmd: 'buildStop' });

  // ⑤ blankWorld 空白画布
  console.log('--- blankWorld 测试');
  cmd({ cmd: 'blankWorld' });
  await wait(2000);
  const ws = await page.evaluate(() => {
    const g = window.__swGame, w = g.world;
    let solid = 0;
    for (let i = 0; i < w.store.type.length; i += 100) if (w.store.type[i] !== 0) solid++;
    return { w: w.w, h: w.h, solidSamples: solid, player: { x: Math.round(g.player.cx / 16), y: Math.round(g.player.cy / 16) } };
  });
  L.chk('blankWorld 几乎空白', ws.solidSamples <= 3, `solid=${ws.solidSamples}/${Math.floor(ws.w * ws.h / 100)}`);
  await shot('blank-world');

  // ⑥ 在空白世界上 buildScript 铺一条无限延伸的路
  console.log('--- 空白世界动态铺路');
  const wp = await pPos();
  cmd({ cmd: 'buildScript', code: `
    // 从出生点向右铺一条宽 3 格的路，每 tick 铺 2 格
    if (bs.nextX === undefined) bs.nextX = Math.floor(g.player.cx / 16) - 2;
    const py = Math.floor((g.player.y + g.player.h) / 16);
    for (let i = 0; i < 2; i++) {
      const x = bs.nextX + i;
      for (let dy = 0; dy < 3; dy++) st.setTile(x, py + dy, 1);
    }
    bs.nextX += 2;
    // 路边偶尔放火把（tile 4）
    if (bs.nextX % 8 === 0) st.setTile(bs.nextX, py - 1, 4);
  ` });
  await wait(3000);
  cmd({ cmd: 'walk', dir: 1, dur: 5 });   // 往右走
  await wait(3000);
  await shot('blank-world-road');
  cmd({ cmd: 'stop' });
  cmd({ cmd: 'buildStop' });
  const p3 = await pPos();
  L.chk('空白世界走位', p3.x > wp.x + 5, `${wp.x} → ${p3.x}`);

} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300)); await wss.close();
  try { vite && vite.stop(); } catch {}
}
console.log('产物: /tmp/probe-out/_director-v3');
process.exit(L.exitCode());
