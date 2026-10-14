// _director-diag —— 直诊：mod 内部态 / 引擎读点 / ws 错误流
import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';

const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null;
const rx = [];
wss.on('connection', ws => {
  mod = ws;
  ws.on('message', d => { try { rx.push(JSON.parse(d)); } catch {} });
});

// 共享 5199 优先（并行会话 WIP 会堵新 vite 的 l10n 闸;5199 已在跑且 HMR 携最新码）
let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} });
  ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  page.on('pageerror', e => console.log('[pageerror]', e.message.split('\n')[0]));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || t.includes('director') || t.includes('导演')) console.log('[console]', t.slice(0, 200)); });
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
    return { loaded: r2.loaded.map(x => x.manifest?.id), errors: r2.errors.map(e => e.error) };
  });
  console.log('装载:', JSON.stringify(inst));
  L.chk('装载 director', inst.loaded.includes('director'), JSON.stringify(inst.errors));

  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2500 });
  L.chk('世界', gen.ok, gen.why);
  await new Promise(r => setTimeout(r, 1500));

  // 引擎读点直查
  // 基线：无导演命令时的世界渲染
  await import('../tools/probe/lib/index.mjs').then(m => m.front(page));
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/tmp/probe-out/_director-diag/baseline.png' });

  const eng = await page.evaluate(async () => {
    const dir = await import('/src/mods/director.ts');
    const g = window.__swGame;
    return {
      hostRegistered: typeof dir.directorCamTarget === 'function',
      camTarget: dir.directorCamTarget(),
      cam: { x: g.camera.x / 16, y: g.camera.y / 16, z: g.camera.zoom, zt: g.camera.zoomTarget },
      player: { x: g.player.cx / 16, y: (g.player.y + g.player.h / 2) / 16 },
    };
  });
  console.log('引擎读点(命令前):', JSON.stringify(eng));

  // 单命令 camSnap
  rx.length = 0;
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'camSnap', x: 2095, y: 340, zoom: 1.7 } }));
  await new Promise(r => setTimeout(r, 700));
  const eng2 = await page.evaluate(async () => {
    const dir = await import('/src/mods/director.ts');
    const g = window.__swGame;
    return { camTarget: dir.directorCamTarget(), cam: { x: g.camera.x / 16, y: g.camera.y / 16, z: g.camera.zoom, zt: g.camera.zoomTarget } };
  });
  console.log('引擎读点(camSnap 后):', JSON.stringify(eng2));
  console.log('ws 回包:', JSON.stringify(rx.map(m => ({ op: m.op, c: m.c, msg: m.msg })).slice(0, 6)));
  await new Promise(r => setTimeout(r, 1200));
  const eng3 = await page.evaluate(async () => {
    const g = window.__swGame;
    return { cam: { x: g.camera.x / 16, y: g.camera.y / 16, z: g.camera.zoom, zt: g.camera.zoomTarget } };
  });
  console.log('1.2s 后相机:', JSON.stringify(eng3));

  // 二分：①只 time 冻结 ②再加 camSnap ③再加 subtitle
  const shot = async (name) => {
    await import('../tools/probe/lib/index.mjs').then(m => m.front(page));
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: `/tmp/probe-out/_director-diag/${name}.png` });
  };
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'time', tod: 0.35, freeze: true } }));
  await new Promise(r => setTimeout(r, 1200)); await shot('bisect-time');
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'camSnap', x: 2095, y: 322, zoom: 1.3 } }));
  await new Promise(r => setTimeout(r, 1500)); await shot('bisect-cam');
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'subtitle', text: '导演模式 · 白天地表', dur: 8 } }));
  await new Promise(r => setTimeout(r, 800)); await shot('bisect-sub');
  await page.screenshot({ path: '/tmp/probe-out/_director-diag/day-surface.png' });
} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300));
  await wss.close();
  try { vite && vite.stop(); } catch {}
}
process.exit(L.exitCode());
