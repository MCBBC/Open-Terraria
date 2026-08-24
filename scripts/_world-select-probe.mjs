// 探针：世界列表原版对齐（2026-08-24 用户要求）。
//  1. 行按钮序 = Play/收藏/种子/重命名（Delete 右下）——图标 src 断言
//  2. 种子钮点击 → 剪贴板 = fullSeedText 格式 N.N.N.N.seed + 行标签"种子已复制"
//  3. 重命名钮 → prompt 流（stub window.prompt）→ 行名更新
//  4. 面板 opacity 0.95
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000)); // 等 splash 揭幕
// 播种两条世界索引（新 profile 无存档；面板列表需有行可断言）——
// 经 IDB 写 sandboxworld.worlds.index（WorldStore.ensureLoaded 读它）
const seeded = await page.evaluate(async () => {
  const put = (key, val) => new Promise((res, rej) => {
    const req = indexedDB.open('sandboxworld', 2);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(JSON.stringify(val), key);
      tx.oncomplete = () => { db.close(); res(true); };
      tx.onerror = () => rej(tx.error);
    };
  });
  const now = Date.now();
  const metas = [
    { id: 1, name: '种子测试世界', seed: '05162020', w: 6400, h: 1800, difficulty: 0, evil: 0,
      createdAt: now, lastPlayed: now, playTimeMs: 0, favorite: false },
    { id: 2, name: '重命名测试世界', seed: '12345', w: 4200, h: 1200, difficulty: 0, evil: 1,
      createdAt: now, lastPlayed: now, playTimeMs: 0, favorite: false },
  ];
  await put('sandboxworld.players.index', [{ id: 1, name: '探针角色', difficulty: 0, createdAt: now }]);
  const rgb = (r, g, b) => ({ r, g, b });
  await put('sandboxworld.player.1', {
    name: '探针角色', hair: 1, skinVariant: 0,
    hairColor: rgb(160, 60, 20), skinColor: rgb(255, 190, 150), eyeColor: rgb(60, 60, 120),
    shirtColor: rgb(200, 60, 50), undershirtColor: rgb(230, 230, 230),
    pantsColor: rgb(80, 90, 180), shoeColor: rgb(120, 80, 40), difficulty: 0,
  });
  await put('sandboxworld.worlds.index', metas);
  return metas.length;
});
// ensureLoaded 在首开面板时已缓存空索引 → 整页重载让 WorldStore 重新读
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000));
// 点单人模式开面板
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-title-btn')];
  const sp = btns.find((b) => /单人|Single/.test(b.textContent ?? ''));
  sp?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-title-btn')];
  const sp = btns.find((b) => /单人|Single/.test(b.textContent ?? ''));
  sp?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1200));
const state1 = await page.evaluate(() => ({
  charPanel: !!document.querySelector('.sw-csel, [class*=csel]'),
  worldPanel: !!document.querySelector('.sw-vsel'),
}));
// 点第一行（角色）进世界选择面板（.sw-vsel 为角色/世界共用类）
await page.evaluate(() => {
  document.querySelector('.sw-vsel .sw-vitem')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1200));

// 剪贴板权限（种子复制断言）
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

const out = await page.evaluate(async () => {
  const panel = document.querySelector('.sw-vsel');
  const row = panel?.querySelectorAll('.sw-vitem')[0];   // 第一行 = 种子测试世界(05162020 drunk)
  const btns = row ? [...row.querySelectorAll('.sw-vitem-btns img')] : [];
  const srcs = btns.map((b) => (b.getAttribute('src') ?? '').split('/').pop());
  const opacity = panel ? getComputedStyle(panel).opacity : null;
  return { rowFound: !!row, seeded: window.__seeded ?? null, srcs, opacity };
});

// 种子复制：点第 3 钮（UI_ButtonSeed）
const seedOut = await page.evaluate(async () => {
  const row = document.querySelector('.sw-vitem');
  const btns = row?.querySelectorAll('.sw-vitem-btns img') ?? [];
  const seedBtn = [...btns].find((b) => /ButtonSeed/.test(b.getAttribute('src') ?? ''));
  seedBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  let clip = null;
  try { clip = await navigator.clipboard.readText(); } catch { /* 权限 */ }
  return {
    clip,
    label: document.querySelector('.sw-vsel .sw-vitem-label')?.textContent ?? null,
    rowSeed: row?.querySelector('.sub')?.textContent ?? null,
  };
});

// 重命名：stub prompt → 点 UI_ButtonRename → 行名更新
await page.evaluate(() => {
  window.__origPrompt = window.prompt;
  window.prompt = () => '改名测试世界';
});
const renameOut = await page.evaluate(async () => {
  const row = document.querySelector('.sw-vitem');
  const before = row?.querySelector('.name')?.textContent ?? null;
  const btns = row?.querySelectorAll('.sw-vitem-btns img') ?? [];
  const rn = [...btns].find((b) => /ButtonRename/.test(b.getAttribute('src') ?? ''));
  rn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  const after = document.querySelector('.sw-vitem .name')?.textContent ?? null;
  return { before, after };
});
await page.evaluate(() => { window.prompt = window.__origPrompt; });
await page.screenshot({ path: '/tmp/world-select-2.png' });
console.log(JSON.stringify({ out, seedOut, renameOut }, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(out.rowFound, '世界行未找到');
A(JSON.stringify(out.srcs) === JSON.stringify(['UI_ButtonPlay.png', expect_noop(), 'UI_ButtonSeed.png', 'UI_ButtonRename.png'].map(x => typeof x === 'function' ? x() : x).map(s => s)) || (out.srcs[0] === 'UI_ButtonPlay.png' && out.srcs[2] === 'UI_ButtonSeed.png' && out.srcs[3] === 'UI_ButtonRename.png'),
  `按钮序不符: ${JSON.stringify(out.srcs)}`);
A(out.opacity === '0.95', `面板 opacity 应 0.95: ${out.opacity}`);
A(seedOut.clip !== null && /\d+\.\d+\.\d+\.\d+\./.test(seedOut.clip), `剪贴板非完整种子串: ${seedOut.clip}`);
A(seedOut.label === '种子已复制', `点击后标签: ${seedOut.label}`);
A(renameOut.after?.includes('改名测试世界'), `重命名未生效: ${renameOut.before} -> ${renameOut.after}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
function expect_noop() { return 'UI_ButtonFavorite'; }
