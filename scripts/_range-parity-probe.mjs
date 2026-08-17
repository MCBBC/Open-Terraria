// 一次性探针:触及盒/箭速两修复的行为级验证
//  A. inTileRange:射程配饰 X+3/Y+2 分轴(修前两轴同+3 → 竖向多 1 格)
//  B. 弓速链:Hellwing(6)+木箭(3)=9 → 射手buff ×1.2=10.8(钳 20 门内)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&rngpar=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1000));

const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const { BuffType } = await import('/src/stats/Buffs.ts');
  const p = g.player;
  p.dead = false;
  // ---- A. 触及盒分轴 ----
  const es = p.equipStats;
  const probeBounds = () => {
    // 二分上/右边界:inTileRange 为私有,运行期可直接调
    const ptx = Math.floor((p.x + p.w / 2) / 16), pty = Math.floor((p.y + p.h / 2) / 16);
    let hiY = pty; while (g.inTileRange(ptx, hiY + 1)) hiY++;
    let hiX = ptx; while (g.inTileRange(hiX + 1, pty)) hiX++;
    return { hiX, hiY, ptx, pty };
  };
  const wasRange = es.tileRange;
  es.tileRange = false;
  const b0 = probeBounds();
  es.tileRange = true;
  const b1 = probeBounds();
  es.tileRange = wasRange;
  const reach = { dx: b1.hiX - b0.hiX, dy: b1.hiY - b0.hiY };
  // ---- B. 弓速链 ----
  const bowId = ITEM_BY_KEY['vi_3019_hellwing_bow'];
  const arrowId = ITEM_BY_KEY['vi_40_wooden_arrow'];
  if (!bowId || !arrowId) return { err: '物品缺', reach };
  p.inv.slots[0] = { id: bowId, stack: 1 };
  p.inv.slots[54] = { id: arrowId, stack: 99 };
  p.inv.selected = 0;
  for (const e of [...g.entities.enemies]) e.dead = true;
  g.entities.enemies.length = 0;
  const shotSpeed = async () => {
    g.entities.projectiles.length = 0;
    p.useTime = 0;
    g.swing = null;
    // 屏幕中心右 200px 处开火
    g.input.mouseX = 640 + 200; g.input.mouseY = 400;
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    const projs = g.entities.projectiles.filter((q) => typeof q.vx === 'number');
    if (!projs.length) return null;
    return Math.hypot(projs[0].vx, projs[0].vy);
  };
  const noBuff = await shotSpeed();
  p.buffs.apply(BuffType.Archery, 10 * 60);
  const withBuff = await shotSpeed();
  return { reach, noBuff, withBuff };
});
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('probe-ok', !r.err, r);
if (!r.err) {
  ok('配饰 X 轴 +3', r.reach.dx === 3, r.reach);
  ok('配饰 Y 轴 +2(修前+3)', r.reach.dy === 2, r.reach);
  ok('箭速 无buff 9±0.15(Hellwing6+木箭3)', r.noBuff > 8.85 && r.noBuff < 9.15, { noBuff: r.noBuff });
  ok('箭速 射手buff ×1.2=10.8±0.2', r.withBuff > 10.6 && r.withBuff < 11.0, { withBuff: r.withBuff });
}
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, r, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
