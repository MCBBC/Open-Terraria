// ★626 gen 卡死定位探针:worker message 间谍+全量 progress 事件流→找出停摆 pass
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});

// ① 装 mod(首页 install)
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

// ② fresh page + worker 间谍 → 创建世界
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + String(e?.stack ?? e).slice(0, 400)));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') errs.push('CON: ' + t.slice(0, 300));
  if (/\[worker\]|mod gen|registerGenPass|gen pass|mod pass/.test(t)) errs.push('GENLOG: ' + t.slice(0, 300));
});
await page.evaluateOnNewDocument(() => {
  window.__genEvents = [];
  window.__genDone = false;
  const OrigWorker = window.Worker;
  function SpyWorker(...args) {
    const w = new OrigWorker(...args);
    const tag = String(args[0]).split('/').pop();
    const origAdd = w.addEventListener.bind(w);
    const record = (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.type === 'progress' || d.type === 'error' || d.type === 'result' || d.type === 'aborted' || d.type === 'preview') {
        window.__genEvents.push({
          t: Math.round(performance.now() / 100) / 10, w: tag, type: d.type,
          phase: d.phase, label: d.label, p: d.p, msg: d.type === 'error' ? d.message : undefined,
        });
        if (d.type === 'result') window.__genDone = true;
        if (window.__genEvents.length > 4000) window.__genEvents.splice(0, 2000);
      }
    };
    w.addEventListener = function(type, fn, opts) {
      if (type === 'message') origAdd(type, (ev) => record(ev.data));
      return origAdd(type, fn, opts);
    };
    let om = null;
    Object.defineProperty(w, 'onmessage', {
      get: () => om,
      set: (fn) => {
        om = fn;
        origAdd('message', (ev) => { record(ev.data); });
      },
    });
    return w;
  }
  SpyWorker.prototype = OrigWorker.prototype;
  window.Worker = SpyWorker;
});
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });

// ③ 采样进度(最多 240s;每 15s 打印事件流尾部)
let done = false;
for (let i = 0; i < 16; i++) {
  await new Promise(r => setTimeout(r, 15000));
  const evs = await page.evaluate(() => window.__genEvents ?? []).catch(() => []);
  done = await page.evaluate(() => window.__genDone === true).catch(() => false);
  const inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.world.store)).catch(() => false);
  console.log(`--- t+${(i + 1) * 15}s done=${done} inGame=${inGame} events=${evs.length}`);
  // 打印最近 8 个 progress 事件(跳过 preview 噪声)
  const tail = evs.filter(e => e.type === 'progress' || e.type === 'error' || e.type === 'aborted').slice(-8);
  for (const e of tail) console.log(`  [${e.t}s] ${e.type} ${e.phase ?? ''} ${e.label ?? ''} p=${e.p ?? ''} ${e.msg ?? ''}`);
  if (done || inGame) break;
}

// ④ 终态:mod tile 扫描
const inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.world.store)).catch(() => false);
if (inGame) {
  const r = await page.evaluate(async () => {
    const g = window.__swGame;
    const store = g.world.store;
    const tiles = await import('/src/data/tiles.ts');
    const keys = ['sulphurous_sand', 'abyss_stone', 'brimstone_slag', 'voidstone', 'astral_dirt', 'infernal_suevite'];
    const counts = {};
    for (const k of keys) counts[k] = tiles.TILE_BY_KEY['mod_calamity_' + k] ?? -1;
    const ids = Object.values(counts);
    const cnt = {};
    for (const k in counts) {
      const id = counts[k];
      let c = 0;
      if (id >= 0) for (let i = 0; i < store.type.length; i++) if (store.type[i] === id) c++;
      cnt[k] = c;
    }
    return { ids: counts, counts: cnt, w: store.w, h: store.h };
  });
  console.log('TILES:', JSON.stringify(r));
  await page.screenshot({ path: '/tmp/gen-stall-final.png' });
} else {
  console.log('NOT IN GAME after window');
}
console.log('GENLOG/errs (top 12):');
for (const e of errs.slice(0, 12)) console.log(' ', e);
await browser.close();
