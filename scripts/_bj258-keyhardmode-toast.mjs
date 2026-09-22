// ★BJ258 实机探针：非困难世界放光明钥匙关箱 → 拒绝 toast（用户明令分歧拍板 B，
// 回滚口 Game.KEY_HARDMODE_TOAST；原版=静默拒绝 NPC.cs:78320，BJ213 定谳）。
// 面A：非困难 + 钥匙箱关箱 → .sw-toast 出现「钥匙仅在困难模式…」+ 箱/钥匙零消耗 + 无召唤；
// 面B（同箱翻 hardMode）：再关箱 → 无 toast + 召唤 475 + 箱消耗（BJ213 正常面回归）。
// 跑法（私有 vite 习语）：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj258-keyhardmode-toast.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });

let ready = false;
for (let i = 0; i < 240 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 500));
  ready = await page.evaluate(() => !!(window.__swGame?.world));
}
if (!ready) { console.log('[probe] FAIL world not ready in 120s'); await browser.close(); process.exit(1); }
console.log('[probe] world ready');
await new Promise((r) => setTimeout(r, 1500));
// 收欢迎横幅（BJ144 探针坑：WelcomeAnnounce z-60 拦界面;点「我已知晓」收掉再取证）
try {
  const btns = await page.$$('button');
  for (const b of btns) {
    const t = await b.evaluate((el) => el.textContent);
    if (t && t.includes('我已知晓')) { await b.click(); console.log('[probe] welcome acked'); break; }
  }
} catch { /* 无横幅=直接过 */ }
await new Promise((r) => setTimeout(r, 600));

// ── 面A：非困难 + 恰 1 堆叠光明钥匙空箱 → 关箱拍 toast ──
const A = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const w = g.world;
  if (w.flags.hardMode) return { fail: 'world unexpectedly hardmode' };
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const CHEST = TILE_BY_KEY['chest'];
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const keyIid = invIndexOfVanilla(3092);
  if (keyIid < 0) return { fail: 'key of light (3092) not in ITEM_DEFS' };
  const st = w.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  let cx = -1, cy = -1;
  outer:
  for (let dy = -4; dy <= 8; dy++) for (let dx = 3; dx <= 12; dx++) {
    const x = px + dx, y = py + dy;
    if (!st.inBounds(x, y) || !st.inBounds(x + 1, y + 1)) continue;
    let clear = true;
    for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) if (st.type[st.idx(x + a, y + b)] !== 0) { clear = false; break; }
    if (clear) { cx = x; cy = y; break outer; }
  }
  if (cx < 0) return { fail: 'no clear 2x2 spot near spawn' };
  st.setTile(cx, cy, CHEST, 0, 0); st.setTile(cx + 1, cy, CHEST, 18, 0);
  st.setTile(cx, cy + 1, CHEST, 0, 18); st.setTile(cx + 1, cy + 1, CHEST, 18, 18);
  const chest = { x: cx, y: cy, items: [{ id: keyIid, stack: 1 }] };
  w.chests.push(chest);
  const enemiesBefore = g.entities.enemies.length;
  g.lastChestOpen = { x: cx, y: cy };          // 关箱拍：面板全关 + lastChest≥0 → 下一 tick 触发
  let toastText = null;
  for (let i = 0; i < 40; i++) {
    await wait(100);
    const t = document.querySelector('.sw-toast');
    if (t && t.textContent) { toastText = t.textContent; break; }
  }
  return {
    spot: [cx, cy], hardMode: w.flags.hardMode, toastText,
    chestIntact: w.chests.includes(chest),
    keyIntact: !!chest.items[0] && chest.items[0].stack === 1,
    enemiesBefore, enemiesAfter: g.entities.enemies.length,
    mimic475: g.entities.enemies.filter((e) => e.vanillaId === 475).length,
  };
});
console.log('[probe] A', JSON.stringify(A));
if (A.fail) { console.log('[probe] FAIL phase A'); await browser.close(); process.exit(1); }

const TOAST_ZH = '钥匙仅在困难模式（击败血肉墙）后生效';
if (A.toastText !== TOAST_ZH) console.log('[probe] WARN toast text mismatch:', A.toastText);
await page.screenshot({ path: '/tmp/bj258-toast-phaseA.png' });
console.log('[probe] screenshot A -> /tmp/bj258-toast-phaseA.png');

// toast 存活 2.5s+0.5s 淡出——等干净再进面B
await new Promise((r) => setTimeout(r, 3400));

// ── 面B：同箱翻 hardMode → 再关箱 = 正常召唤（BJ213 正常面回归,无 toast）──
const B = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const w = g.world;
  const target = w.chests.find((c) => c.items.length === 1 && c.items[0] && c.items[0].stack === 1);
  if (!target) return { fail: 'keyed chest not found' };
  w.flags.hardMode = true;                     // 翻困难（仅探针页内存,不落档）
  const enemiesBefore = g.entities.enemies.length;
  g.lastChestOpen = { x: target.x, y: target.y };
  let chestGone = false;
  let toastDuringB = null;
  for (let i = 0; i < 60; i++) {
    await wait(100);
    if (!w.chests.includes(target)) { chestGone = true; break; }
    const t = document.querySelector('.sw-toast');
    if (t && t.textContent && toastDuringB === null) toastDuringB = t.textContent;
  }
  await wait(400);
  return {
    hardMode: w.flags.hardMode, chestGone, toastDuringB,
    enemiesBefore, enemiesAfter: g.entities.enemies.length,
    mimic475: g.entities.enemies.filter((e) => e.vanillaId === 475).length,
  };
});
console.log('[probe] B', JSON.stringify(B));
await page.screenshot({ path: '/tmp/bj258-toast-phaseB.png' });

console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});

const aOk = A.toastText === TOAST_ZH && A.chestIntact && A.keyIntact && A.mimic475 === 0;
const bOk = B.hardMode === true && B.chestGone && !B.toastDuringB && B.mimic475 === 1;
console.log(`[probe] VERDICT A=${aOk ? 'OK' : 'FAIL'} B=${bOk ? 'OK' : 'FAIL'}`);
process.exit(aOk && bOk && errs.length === 0 ? 0 : 1);
