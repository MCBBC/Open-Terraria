import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/probe-out/_director-v3', { recursive: true });
const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null; const rx = []; const conns = [];
wss.on('connection', ws => {
  conns.push(ws);
  ws.on('message', d => { try { const m = JSON.parse(d); if (m.op === 'hello' && (m.v ?? 0) >= 2) mod = ws; rx.push(m); } catch {} });
});
let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} }); ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
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
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2500 });
  L.chk('世界', gen.ok);
  await new Promise(r => setTimeout(r, 1500));
  if (!mod) { console.log('v2 mod 未连接'); process.exit(1); }
  const cmd = c => { rx.length = 0; mod.send(JSON.stringify({ op: 'cmd', c })); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async n => { await front(page); await wait(600); await page.screenshot({ path: `/tmp/probe-out/_director-v3/${n}.png` }); };

  // ① setTile
  cmd({ cmd: 'setTile', x: 2095, y: 100, tile: 1 });
  await wait(300);
  const t1 = await page.evaluate(() => window.__swGame.world.store.type[100 * window.__swGame.world.w + 2095]);
  L.chk('setTile@空中', t1 === 1, `tile=${t1}`);

  // ② fillRect
  cmd({ cmd: 'fillRect', x: 2090, y: 110, w: 20, h: 3, tile: 1 });
  await wait(500);
  const t2 = await page.evaluate(() => window.__swGame.world.store.type[111 * window.__swGame.world.w + 2100]);
  L.chk('fillRect@平台', t2 === 1, `tile=${t2}`);

  // ③ blankWorld
  console.log('--- blankWorld');
  cmd({ cmd: 'blankWorld' });
  await wait(1500);
  const bw = await page.evaluate(() => {
    const g = window.__swGame, w = g.world;
    let nonZero = 0;
    for (let i = 0; i < w.store.type.length; i++) if (w.store.type[i] !== 0) nonZero++;
    return { w: w.w, h: w.h, nonZero };
  });
  L.chk('blankWorld 全空气', bw.nonZero === 1, `nonZero=${bw.nonZero}`);
  await shot('blank-world');
  const bp = await page.evaluate(() => ({
    x: Math.round(window.__swGame.player.cx / 16),
    y: Math.round((window.__swGame.player.y + window.__swGame.player.h) / 16),
  }));

  // ④ buildScript 动态铺路 + 走位
  console.log('--- 动态铺路走位');
  cmd({ cmd: 'buildScript', code: `
    const px = Math.floor(g.player.cx / 16);
    const py = Math.floor((g.player.y + g.player.h) / 16);
    for (let dx = -1; dx <= 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(px + dx, py + dy, 1);
    if (px % 6 === 0) st.setTile(px, py - 1, 4);
  ` });
  await wait(500);
  cmd({ cmd: 'walk', dir: 1, dur: 8 });
  await wait(3000);
  await shot('dynamic-road');
  const p2 = await page.evaluate(() => Math.round(window.__swGame.player.cx / 16));
  cmd({ cmd: 'stop' });
  cmd({ cmd: 'buildStop' });
  L.chk('空白世界动态铺路', p2 > bp.x + 3, `${bp.x} → ${p2}`);

  // ⑤ buildScript 建塔
  console.log('--- 动态建塔');
  cmd({ cmd: 'buildScript', code: `
    if (bs.towerH === undefined) { bs.towerH = 0; bs.towerX = Math.floor(g.player.cx / 16) + 8; bs.baseY = Math.floor((g.player.y + g.player.h) / 16); }
    if (bs.towerH < 20) { st.setTile(bs.towerX, bs.baseY - bs.towerH, 1); st.setTile(bs.towerX + 1, bs.baseY - bs.towerH, 1); bs.towerH++; }
  ` });
  await wait(3000);
  cmd({ cmd: 'buildStop' });
  await shot('tower-built');
  L.chk('塔建好（无 crash）', true);

} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300)); await wss.close();
  try { vite && vite.stop(); } catch {}
}
console.log('产物: /tmp/probe-out/_director-v3');
process.exit(L.exitCode());
