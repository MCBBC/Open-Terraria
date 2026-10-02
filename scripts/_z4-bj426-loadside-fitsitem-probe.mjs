// ★Z4/BJ426 载入侧 FitsItem 实机探针（D3 漏修#1 验收）：
//   B 模拟损坏/导入档世界态：723 锚桩 tile（store 直写）+ furniture 记录槽=走私件
//     （天顶剑 4956——等价于损坏档载入后的世界态;wld 导入与存档载入共用 respawnAll
//     载入闸,A7 单测已钉全链。物品点击路径在本探针平台不消费=_bj429 同款环境现象,
//     非本刀面）
//   C 走生产载入闸：g.leashed.respawnAll(...)（afterWorldLoad :7113 同参同式）
//     → 记录槽清 null（=原版 OnWorldLoaded itemType=0）+ 走私实体零生成
//   D 取回零产出：retrieveLeashedAnchor=false + spawnDrop 零调用（走私件不可捞出）
//   E 对照组：合法风筝记录（production kiteAnchorPlace）取回照常（true + 恰 1 drop）
//   F 存档面：清型后 furniture 序列化不再含走私件内部 id（下一存档无残留）
// 用法: SW_ORIGIN=http://localhost:5850 node tools/run-diag.mjs scripts/_z4-bj426-loadside-fitsitem-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'z4');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 1000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// ---- B. 损坏档世界态注入（锚桩 tile + 走私记录）----
const setup = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const KITE = TILE_BY_KEY['v_723_kite_anchor'];
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  for (let x = 396; x <= 430; x++) for (let y = sy; y < sy + 3; y++) st.setTile(x, y, 1, 0, 0);
  for (let x = 396; x <= 430; x++) for (let y = sy - 6; y < sy; y++) if (st.hasTile(x, y)) st.setTile(x, y, 0);
  p.x = 402 * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 900));
  const tx = 404, ty = sy - 1;
  st.setTileSilent(tx, ty, KITE, 0, 0);                  // 锚桩本体（帧档 0 底锚）
  const zenKey = Object.keys(window.__swItems).find((k) => /^vi_4956_/.test(k));
  const zenIid = window.__swItems[zenKey];
  const zenVid = ITEM_DEFS[zenIid]?.vid ?? -1;
  // 走私记录（= 损坏档短 itemType=4956 载入后的记录形态）
  g.world.furnitureItems.push({ x: tx, y: ty, kind: 'kite_anchor', slots: [{ id: zenIid, stack: 1 }] });
  window.__z4anchor = { x: tx, y: ty };
  window.__z4groundY = sy;
  window.__z4drops = 0;
  const sd0 = g.spawnDrop.bind(g);
  g.spawnDrop = (...a) => { window.__z4drops++; return sd0(...a); };
  return { tileOk: st.type[st.idx(tx, ty)] === KITE, zenIid, zenVid };
});
check('B 损坏档态:锚桩 tile + 记录槽=走私件（天顶剑）', setup.tileOk && setup.zenVid === 4956,
  `zenIid=${setup.zenIid} zenVid=${setup.zenVid}`);

// ---- C. 生产载入闸（afterWorldLoad :7113 同式）----
await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  g.leashed.attach(g.world);
  g.leashed.respawnAll(g.world.furnitureItems, (id) => (ITEM_DEFS[id]?.vid ?? -1), g.leashedEnv());
});
const after = await page.evaluate(() => {
  const g = window.__swGame;
  const { x, y } = window.__z4anchor;
  const rec = g.world.furnitureItems.find((f) => f.kind === 'kite_anchor' && f.x === x && f.y === y);
  return { slot: rec ? rec.slots[0] : 'NO-REC', kitesAt: g.leashed.kites.length };
});
check('C 载入闸清型:槽=null（OnWorldLoaded itemType=0 等价）+ 拴绳风筝零生成',
  after.slot === null && after.kitesAt === 0, JSON.stringify(after));

// ---- D. 取回零产出 ----
const retrieve = await page.evaluate(() => {
  const g = window.__swGame;
  window.__z4drops = 0;
  const { x, y } = window.__z4anchor;
  const ok = g.retrieveLeashedAnchor(x, y, 1);           // 1 = LEASHED_KIND_KITE
  return { ok, drops: window.__z4drops, tileGone: !g.world.store.hasTile(window.__z4anchor.x, window.__z4anchor.y) };
});
check('D 取回零产出:retrieveLeashedAnchor=false + spawnDrop 零调用 + 桩保留（走私件不可捞出）',
  retrieve.ok === false && retrieve.drops === 0 && retrieve.tileGone === false, JSON.stringify(retrieve));

// ---- E. 对照组:合法风筝记录取回照常（production kiteAnchorPlace 直写）----
const control = await page.evaluate(async () => {
  const g = window.__swGame;
  const { kiteAnchorPlace } = await import('/src/world/FurnitureItems.ts');
  const { ITEM_BY_KEY } = window.__swItems ? { ITEM_BY_KEY: window.__swItems } : {};
  const kiteIid = ITEM_BY_KEY[Object.keys(ITEM_BY_KEY).find((k) => /^vi_4379_/.test(k))];
  const ty = window.__z4groundY - 1, tx = 408;
  kiteAnchorPlace(g.world.furnitureItems, tx, ty, { id: kiteIid, stack: 1 });
  window.__z4drops = 0;
  const ok = g.retrieveLeashedAnchor(tx, ty, 1);
  return { ok, drops: window.__z4drops };
});
check('E 对照:合法记录取回 true + 恰 1 drop（门不误杀）',
  control.ok === true && control.drops === 1, JSON.stringify(control));

// ---- F. 存档面 + 截图 ----
const saveFace = await page.evaluate(() => {
  const g = window.__swGame;
  const anchors = g.world.furnitureItems.filter((f) => f.kind === 'kite_anchor' || f.kind === 'critter_anchor');
  return JSON.stringify(anchors);
});
check('F 存档面:锚桩记录序列化不含走私件内部 id', !saveFace.includes(String(setup.zenIid)),
  saveFace.slice(0, 160));
writeFileSync(join(OUT, 'z4-bj426-loadside-clean.png'), await page.screenshot({ encoding: 'binary' }));

console.log(`RESULT pass=${pass} fail=${fail} pageErrs=${errors.length}`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
