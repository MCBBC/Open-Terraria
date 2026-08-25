// 一次性:主角持械层级取证——挥舞中截图,验证武器在身体之上(不再被本体挡住)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1500);
// 给主角一把剑并连续挥舞:直接写 swing 状态(Game.useSwing 语义)——找 swing 字段
const info = await p.evaluate(() => {
  const g = window.__swGame;
  const p1 = g.player;
  // 找一把宽刃剑放手上(铁宽剑 6? vanillaId)
  const swingKeys = Object.keys(p1).filter((k) => /swing/i.test(k));
  return { swingKeys, inv: p1.inv?.heldItem?.() ? 'has' : 'none' };
});
console.log('INFO:', JSON.stringify(info));
// 连续触发挥舞:每 200ms 调一次左键使用路径(模拟 UseItem)——直接驱动 Game 的使用入口
const ok = await p.evaluate(() => {
  const g = window.__swGame;
  // 直接驱动 useSwing(铜镐=手上一件)连续挥
  g.__swingPin = setInterval(() => {
    const held = g.player.inv.heldItem();
    const def = held ? (window.__ITEM_DEFS_REF || g.ITEM_DEFS || null) : null;
    g.useSwing ? g.useSwing(null, -0.5) : null;
  }, 250);
  return { hasUseSwing: typeof g.useSwing };
});
console.log('MOUSE:', JSON.stringify(ok));
await sleep(300);
// 挥舞窗口内连拍 4 张
for (let i = 0; i < 4; i++) {
  await p.screenshot({ path: `${OUT}/held-swing-${i}.png` });
  await sleep(180);
  await p.evaluate(() => {
    const g = window.__swGame;
    if (g.mouse) g.mouse.left = true;
  });
}
await b.close();
console.log('DONE →', OUT);
