// _director-iso —— 终极隔离：世界→基线→单 camSnap(无 zoom)→单 zoom→对比+控制台监听
import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
import { mkdirSync } from 'node:fs';

mkdirSync('/tmp/probe-out/_director-iso', { recursive: true });
const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null;
wss.on('connection', ws => { mod = ws; });

let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} });
  ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  page.on('pageerror', e => console.log('[pageerror]', e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 220)); });
  await gotoApp(page, ORIGIN, { tries: 40 });
  const inst = await page.evaluate(async () => {
    const res = await fetch('/mods/dist/director.swmod');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { ModStore } = await import('/src/mods/store.ts');
    const { readModPack } = await import('/src/mods/pack.ts');
    const { loadModsPhase1 } = await import('/src/mods/loader.ts');
    const storage = {
      reg: JSON.stringify([]), zips: new Map(),
      async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
      async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
      async deleteZip(id) { this.zips.delete(id); }
    };
    const store = new ModStore(storage);
    const pack = readModPack(bytes);
    await store.install(pack.manifest, bytes, null);
    const r2 = await loadModsPhase1(storage);
    return r2.loaded.map(x => x.manifest?.id);
  });
  L.chk('装载', inst.includes('director'), JSON.stringify(inst));
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2500 });
  L.chk('世界', gen.ok, gen.why);
  await new Promise(r => setTimeout(r, 1500));

  const shot = async n => { await front(page); await new Promise(r => setTimeout(r, 500)); await page.screenshot({ path: `/tmp/probe-out/_director-iso/${n}.png` }); };
  const camState = () => page.evaluate(() => {
    const g = window.__swGame;
    return { cam: { x: +(g.camera.x / 16).toFixed(1), y: +(g.camera.y / 16).toFixed(1), z: g.camera.zoom } };
  });

  await shot('A-baseline');
  console.log('A:', JSON.stringify(await camState()));

  // B：只挪相机（无 zoom、无其它）
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'camSnap', x: 2095, y: 322 } }));
  await new Promise(r => setTimeout(r, 2000));
  await shot('B-cam-only');
  console.log('B:', JSON.stringify(await camState()));

  // C：真实地表演出（出生点上空缓推 + 字幕 + 遮幅）——导演成片画面的正确形态
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'bars', on: true } }));
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'subtitle', text: '导演模式 · 真实地表演出', dur: 10 } }));
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'cam', x: 2135, y: 228, zoom: 1.6, dur: 4 } }));
  await new Promise(r => setTimeout(r, 2500));
  await shot('C-surface-show');
  console.log('C:', JSON.stringify(await camState()));
} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300));
  await wss.close();
  try { vite && vite.stop(); } catch {}
}
process.exit(L.exitCode());
