// 真存档复现探针 v4：正式世界槽 IDB 写入 + 完整 UI 流（sp→新建角色→创建→世界列表→进入）。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-savedworld-v4.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = needInput(join(DOWNLOADS, 'map-Starter_World (38).json'));
const saveJson = readFileSync(SAVE, 'utf8');
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1540,920'] });
const page = (await browser.pages())[0] ?? await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL + '/?v4=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);

// ---- ① IDB 写入正式世界槽 ----
await page.evaluate(async (txt) => {
  const meta = [{ id: 999, name: 'Starter World', seed: '1295198809', w: 6400, h: 1800, difficulty: 0, evil: -1, createdAt: 1791307396374, lastPlayed: 1791307396374, playTimeMs: 133133322, favorite: false }];
  const put = (key, val) => new Promise((res, rej) => {
    const req = indexedDB.open('sandboxworld', 2);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => { db.close(); res(1); };
      tx.onerror = () => rej(tx.error);
    };
    req.onerror = () => rej(req.error);
  });
  const idxRaw = await new Promise((res) => {
    const req = indexedDB.open('sandboxworld', 2);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction('kv', 'readonly');
        const g = tx.objectStore('kv').get('sandboxworld.worlds.index');
        g.onsuccess = () => { db.close(); res(typeof g.result === 'string' ? g.result : null); };
        g.onerror = () => { db.close(); res(null); };
      } catch { db.close(); res(null); }
    };
    req.onerror = () => res(null);
  });
  let idx = [];
  try { idx = JSON.parse(idxRaw ?? '[]'); if (!Array.isArray(idx)) idx = []; } catch { idx = []; }
  if (!idx.some((m) => m.id === 999)) idx.push(meta[0]); else idx = idx.map((m) => (m.id === 999 ? meta[0] : m));
  await put('sandboxworld.world.999', txt);
  await put('sandboxworld.worlds.index', JSON.stringify(idx));
  return idx.length;
}, saveJson);
console.log('① 世界槽 999 已写入 IDB（Starter World）');

// ---- ② reload + UI 流 ----
await page.goto(URL + '/?v4b=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);
const clickAct = async (act) => {
  const ok = await page.evaluate((a) => {
    const el = document.querySelector(`[data-act=${a}]`);
    if (el) { el.click(); return true; }
    return false;
  }, act);
  console.log(`点击 [data-act=${act}] → ${ok}`);
  return ok;
};
await clickAct('sp'); await sleep(1200);           // 单人 → 角色列表
// 角色列表：若有现成角色点第一项；否则新建
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-vitem'));
if (!hasChar) {
  console.log('无角色 → 新建');
  await clickAct('new'); await sleep(1200);        // CharCreation
  await clickAct('create'); await sleep(1200);     // 缺省名+外观创建
}
// 创建后可能回角色列表（新角色项）或直接进世界列表
await clickActIfVitemFirst(); await sleep(1200);
async function clickActIfVitemFirst() {
  const ok = await page.evaluate(() => {
    const it = document.querySelector('.sw-vitem');
    if (it) { it.click(); return (it.textContent ?? '').trim().slice(0, 20); }
    return null;
  });
  if (ok) console.log(`点击列表首项: ${ok}`);
  return ok;
}
// 世界列表：点含 Starter World 的项
const picked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.sw-vitem')];
  const it = items.find((e) => /Starter World/.test(e.textContent ?? '')) ?? items[0];
  if (it) { it.click(); return (it.textContent ?? '').trim().slice(0, 30); }
  return null;
});
console.log(`世界项点击: ${picked}`);
await sleep(1500);
// 若有确认钮
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button, [data-act]')].find((e) => /进入|开始|创建/.test(e.textContent ?? ''));
  if (el) el.click();
});
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
console.log('=== 已进入世界 ===');
await sleep(3000);
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn, div')].find((e) => /我已知晓|已知/.test(e.textContent ?? '') && e.children.length === 0);
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }
console.log(await page.evaluate(() => {
  const g = window.__swGame;
  return JSON.stringify({ w: g.world.store.w, h: g.world.store.h, night: !g.world.clock.isDay, player: [Math.round(g.player.x / 16), Math.round(g.player.y / 16)] });
}));

// ---- ③ 采样 ----
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
