// 真存档复现探针 v3（2026-10-07）：quicksave 直写 + ?quickload 直进世界。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-savedworld-v3.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-Starter_World (38).json';
const saveJson = readFileSync(SAVE, 'utf8');
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1540,920'] });
const page = (await browser.pages())[0] ?? await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
await page.goto(URL + '/?seedkv=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// 写 quicksave（IndexedDB sandboxworld/kv）
await page.evaluate(async (txt) => {
  await new Promise((res, rej) => {
    const req = indexedDB.open('sandboxworld', 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(txt, 'sandboxworld.quicksave');
      tx.oncomplete = () => { db.close(); res(1); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
}, saveJson);
console.log('quicksave 已写入 IDB');

// ?quickload 直进
await page.goto(URL + '/?quickload=1&swperf=0&v3=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
console.log('=== 已进入世界 ===');
await new Promise((r) => setTimeout(r, 3000));
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn, div')].find((e) => /我已知晓|已知/.test(e.textContent ?? '') && e.children.length === 0);
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }
console.log(await page.evaluate(() => {
  const g = window.__swGame;
  return JSON.stringify({ w: g.world.store.w, h: g.world.store.h, night: !g.world.clock.isDay, player: [Math.round(g.player.x / 16), Math.round(g.player.y / 16)], spawn: g.world.spawnX });
}));

// shim 账 + 采样
await page.evaluate(`(window.__shimSnap = () => {
  const r = window.__swGame.renderer, out = [];
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v && v.constructor && v.constructor.degradeOps) {
      out.push({ f: k, fb: v.stats?.fallback ?? 0, fl: v.stats?.flushes ?? 0, dr: v.stats?.draws ?? 0,
        ops: { ...v.constructor.degradeOps }, callers: { ...v.constructor.degradeCallers } });
    }
  }
  return out;
})()`);
const fpsFor = (ms) => `new Promise((res) => { let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else res({ n, ms: performance.now() - t0 }); };
  requestAnimationFrame(tick); })`;
const diffAgg = (a, b) => {
  const d = {}; let tot = 0;
  for (let i = 0; i < a.length; i++) {
    for (const op of new Set([...Object.keys(a[i]?.ops ?? {}), ...Object.keys(b[i]?.ops ?? {})])) {
      const dv = (b[i]?.ops?.[op] ?? 0) - (a[i]?.ops?.[op] ?? 0);
      if (dv > 0) { d[op] = (d[op] ?? 0) + dv; tot += dv; }
    }
  }
  return { d, tot };
};
const s0 = await page.evaluate('window.__shimSnap()');
for (let w = 0; w < 6; w++) {
  const f = await page.evaluate(fpsFor(1000));
  console.log(`静止 t=${w + 1}s fps=${f.n}`);
}
const s1 = await page.evaluate('window.__shimSnap()');
const sd = diffAgg(s0, s1);
console.log(`静止段 degradeΔ(${sd.tot}):`, JSON.stringify(sd.d));

// 行走 20s：向右。玩家就位出生点
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.x = g.world.spawnX * 16; p.y = g.world.spawnY * 16 - 42; p.vx = 0; p.vy = 0;
  g.input.keys.add('ArrowRight'); g.input.keys.add('KeyD');
});
for (let w = 0; w < 20; w++) {
  const f = await page.evaluate(fpsFor(1000));
  const sNow = await page.evaluate('window.__shimSnap()');
  const { d, tot } = diffAgg(s1, sNow);
  const fl = sNow.reduce((a, x) => a + x.fl, 0) - s1.reduce((a, x) => a + x.fl, 0);
  const fb = sNow.reduce((a, x) => a + x.fb, 0) - s1.reduce((a, x) => a + x.fb, 0);
  const pos = await page.evaluate('JSON.stringify({x:Math.round(window.__swGame.player.x/16), y:Math.round(window.__swGame.player.y/16)})');
  const dstr = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
  console.log(`行走 t=${w + 1}s fps=${f.n} p=${pos} flushΔ=${fl} fbΔ=${fb} degradeΔ(${tot})=${dstr}`);
}
const sEnd = await page.evaluate('window.__shimSnap()');
console.log('\n=== degradeCallers 终账 ===');
for (const sh of sEnd) {
  const top = Object.entries(sh.callers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of top) console.log(`[${sh.f}] ${k} = ${v}`);
}
console.log('\npageerrors:', errors.slice(0, 6));
await browser.close();
