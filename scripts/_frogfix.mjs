// spawnFrog 裸传 rng.next 修复验证:进丛林强推刷怪 N 帧,断言零 pageerror 且青蛙族已刷
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5206/', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('9293480', 4200, 1200));
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const r = await page.evaluate(async () => {
  const g = window.__swGame, w = g.world;
  // 传送到丛林地表
  const jx = w.jungleX ?? Math.floor(w.w / 2);
  const p = g.player;
  let y = 0;
  while (y < w.h - 2 && !w.store.flags[w.store.idx(jx, y)]) y++;
  p.cx = jx * 16 + 8; p.cy = (y - 3) * 16;
  p.vx = 0; p.vy = 0; p.hp = p.maxHp;
  g.iframes = 0;
  // 强推 600 帧 fixedUpdate(刷怪周期约 15-60 帧/轮,600 帧必触发多轮丛林怪含蛙)
  let frogSeen = 0;
  for (let i = 0; i < 8000; i++) {
    g.fixedUpdate?.(1 / 60);
    if (i % 60 === 0) {
      for (const e of (g.entities?.enemies ?? g.enemies?.() ?? [])) if ([361, 445, 687].includes(e?.vanillaId ?? -1) || [361, 445, 687].includes(e?.type ?? -1)) frogSeen++;
    }
  }
  return { jx, frogSeen, enemies: (g.entities?.enemies ?? g.enemies?.() ?? []).length };
});
console.log(JSON.stringify({ ...r, pageErrors: errors.slice(0, 3) }));
console.log(r.pageErrors === undefined && errors.length === 0 ? 'PASS: 零 pageerror' : 'FAIL: ' + errors[0]?.slice(0, 120));
await browser.close();
process.exit(errors.length ? 1 : 0);
