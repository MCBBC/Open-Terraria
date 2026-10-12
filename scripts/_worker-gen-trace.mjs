// ★626d worker 生成追踪:mod pass 逐个点名+完成时刻+地形扫描(无 BackgroundPump 噪声)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});

const p1 = await browser.newPage();
await p1.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 15; i++) {
  await new Promise(r => setTimeout(r, 2000));
  if (await p1.evaluate(() => !!window.__swMods?.install).catch(() => false)) break;
}
await p1.evaluate(async () => {
  const buf = await fetch('mods/dist/calamity.swmod').then(r => r.arrayBuffer());
  await window.__swMods.install(new Uint8Array(buf));
});
await p1.close();

const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR:', String(e?.stack ?? e).slice(0, 300)));
page.on('console', m => {
  const t = m.text();
  if (/卡死|回退|mod gen|worker\]|PAGEERR|mod pass/.test(t)) console.log(`  [c] ${t.slice(0, 220)}`);
});
await page.evaluateOnNewDocument(() => {
  window.__ev = [];
  window.__done = false;
  const dsc = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage');
  const origAdd = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function(type, fn, opts) {
    if (type === 'message') return origAdd.call(this, type, (ev) => { rec(ev.data); return fn(ev); }, opts);
    return origAdd.call(this, type, fn, opts);
  };
  Object.defineProperty(Worker.prototype, 'onmessage', {
    get() { return dsc.get.call(this); },
    set(fn) {
      dsc.set.call(this, fn);
      origAdd.call(this, 'message', (ev) => rec(ev.data));
    },
  });
  const rec = (d) => {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'progress' && d.phase === 'generate') {
      const key = `${d.label ?? ''}`;
      const last = window.__ev[window.__ev.length - 1];
      if (!last || last.key !== key || d.p - last.p > 0.05) window.__ev.push({ t: performance.now() / 1000, key, p: d.p });
      if (window.__ev.length > 500) window.__ev.splice(0, 250);
    }
    if (d.type === 'result') window.__done = true;
  };
});
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });

let lastLen = 0, lastP = -1;
for (let i = 1; i <= 40; i++) {
  await new Promise(r => setTimeout(r, 10000));
  const r = await Promise.race([
    page.evaluate(() => ({ done: window.__done, ev: window.__ev.slice(-6), inGame: !!(window.__swGame && window.__swGame.world) })).catch(e => ({ err: String(e).slice(0, 60) })),
    new Promise(res => setTimeout(() => res({ frozen: true }), 3000)),
  ]);
  if (r.err || r.frozen) { console.log(`t+${i * 10}s:`, JSON.stringify(r)); continue; }
  const tail = r.ev[r.ev.length - 1];
  const moved = r.ev.length !== lastLen || (tail && tail.p !== lastP);
  if (moved || r.done) {
    console.log(`t+${i * 10}s done=${r.done} inGame=${r.inGame} | ` + r.ev.map(e => `${e.key}@${(e.p * 100).toFixed(0)}%`).join(' → '));
    lastLen = r.ev.length; lastP = tail ? tail.p : lastP;
  }
  if (r.done || r.inGame) {
    // 地形扫描
    const scan = await page.evaluate(async () => {
      const g = window.__swGame;
      const store = g.world.store;
      const tiles = await import('/src/data/tiles.ts');
      const keys = ['sulphurous_sand', 'abyss_stone', 'brimstone_slag', 'infernal_suevite', 'voidstone', 'astral_dirt', 'aerialite_ore'];
      const out = {};
      for (const k of keys) {
        const id = tiles.TILE_BY_KEY['mod_calamity_' + k] ?? -1;
        let c = 0;
        if (id >= 0) { for (let i = 0; i < store.type.length; i += 2) if (store.type[i] === id) c++; c *= 2; }
        out[k] = c;
      }
      return { out, w: store.w, h: store.h, chests: g.world.chests?.length ?? -1 };
    });
    console.log('SCAN:', JSON.stringify(scan));
    await page.screenshot({ path: '/tmp/worker-gen-final.png' });
    break;
  }
}
await browser.close();
