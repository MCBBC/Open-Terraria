// ★626b 冻结定位:页内心跳+实时 console 流+worker 创建日志
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
  if (/\[worker\]|\[worldGen\]|\[gen\]|mod|Mod|世界|生成|进度/.test(t)) console.log(`  [console.${m.type()}] ${t.slice(0, 240)}`);
});
await page.evaluateOnNewDocument(() => {
  window.__hb = 0;
  setInterval(() => { window.__hb++; }, 500);
  window.__genEvents = [];
  window.__workers = [];
  const OrigWorker = window.Worker;
  function SpyWorker(...args) {
    const w = new OrigWorker(...args);
    window.__workers.push(String(args[0]).split('/').pop());
    const origAdd = w.addEventListener.bind(w);
    const record = (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.type === 'progress' || d.type === 'error' || d.type === 'result' || d.type === 'aborted') {
        window.__genEvents.push({ t: Math.round(performance.now() / 100) / 10, type: d.type, phase: d.phase, label: d.label, p: d.p });
        if (window.__genEvents.length > 3000) window.__genEvents.splice(0, 1500);
      }
    };
    w.addEventListener = function(type, fn, opts) {
      if (type === 'message') origAdd(type, (ev) => record(ev.data));
      return origAdd(type, fn, opts);
    };
    let om = null;
    Object.defineProperty(w, 'onmessage', {
      get: () => om,
      set: (fn) => { om = fn; origAdd('message', (ev) => record(ev.data)); },
    });
    return w;
  }
  SpyWorker.prototype = OrigWorker.prototype;
  window.Worker = SpyWorker;
});

const hbSample = async (tag) => {
  const r = await Promise.race([
    page.evaluate(() => ({ hb: window.__hb, workers: window.__workers.length, evs: (window.__genEvents ?? []).length,
      last: (window.__genEvents ?? []).slice(-3), inGame: !!(window.__swGame && window.__swGame.world) })).catch(e => ({ err: String(e).slice(0, 80) })),
    new Promise(res => setTimeout(() => res({ frozen: true }), 4000)),
  ]);
  console.log(`HB ${tag}:`, JSON.stringify(r));
  return r;
};

await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
let frozenRounds = 0, lastHb = -1;
for (let i = 1; i <= 30; i++) {
  await new Promise(r => setTimeout(r, 10000));
  const r = await hbSample(`t+${i * 10}s`);
  if (r.frozen) { frozenRounds++; console.log(`  → main thread FROZEN (round ${frozenRounds})`); if (frozenRounds >= 3) break; }
  else { frozenRounds = 0; if (r.hb === lastHb) console.log('  → heartbeat STALLED (event loop busy)'); lastHb = r.hb; }
  if (r.inGame) { console.log('IN GAME'); break; }
}
await page.screenshot({ path: '/tmp/gen-stall2.png' }).catch(() => {});
await browser.close();
