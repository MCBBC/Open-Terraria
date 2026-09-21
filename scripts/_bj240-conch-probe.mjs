// ★BJ240 实机探针：物证地图 /tmp/bj240-evidence.wld 导入 → 海螺海洋传送定谳验证。
// 断言：①右洋尝试 requestMagicConchTeleportPosition(true)=null（InWorld40 边界,原版忠实）
//      ②左洋尝试落左缘浸水甲板 (40,311) ③左半场 fire ocean → 落左洋（右败回退臂）
//      ④右半场 fire ocean → 落左洋（首选即左洋）——「只能传到左海洋」=原版本相。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });

const buf = readFileSync('/tmp/bj240-evidence.wld');
const b64 = buf.toString('base64');
console.log('WLD bytes:', buf.length);

const boot = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const flow = window.__swFlow;
  if (!flow) return { ok: false, why: 'no __swFlow' };
  await flow.importWld(arr);
  return { ok: true };
}, b64);
console.log('IMPORT:', JSON.stringify(boot));
if (!boot.ok) { await browser.close(); process.exit(1); }

await page.waitForFunction(() => window.__swGame?.player && window.__swGame?.world, { timeout: 120000 });
// 兼容报告弹窗dismiss（若有）
await page.evaluate(() => {
  const btns = document.querySelectorAll('.sw-panel button');
  if (btns.length) btns[btns.length - 1].click();
});

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const w = g.world;
  const st = w.store;
  const r = {
    world: { w: st.w, h: st.h, groundLevel: w.groundLevel },
    playerAt: { x: p.x, y: p.y },
    rightTry: g.requestMagicConchTeleportPosition(true),
    leftTry: g.requestMagicConchTeleportPosition(false),
    tileDeck: st.flags[st.idx(st.w - 40, 414)],      // 右缘甲板（起点列 w-40）
    tileLeftDeck: st.flags[st.idx(40, 312)],          // 左缘浸水甲板
  };
  return r;
});
console.log('STATE:', JSON.stringify(out));

const TILE = 16;
const expectLeft = { x: 40 * TILE + 8 - 10, y: 311 * TILE + 16 - 42 };

// ①右洋尝试（真实游戏实体上）
console.log('ASSERT rightTry null:', out.rightTry === null ? 'PASS' : `FAIL ${JSON.stringify(out.rightTry)}`);
// ②左洋尝试落左甲板
console.log('ASSERT leftTry left-deck:',
  out.leftTry && Math.abs(out.leftTry.x - expectLeft.x) < 2 && Math.abs(out.leftTry.y - expectLeft.y) < 2 ? 'PASS' : `FAIL ${JSON.stringify(out.leftTry)} expect ${JSON.stringify(expectLeft)}`);

// ③左半场 fire ocean → 落左洋（右败→回退左洋=用户实报路径）
const fire1 = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = 40 * 16; p.y = 310 * 16; p.vx = 0; p.vy = 0;
  g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  return { x: p.x, y: p.y, vy: p.vy };
});
console.log('FIRE from-left-ocean:', JSON.stringify(fire1));
console.log('ASSERT lands-left-deck:', Math.abs(fire1.x - expectLeft.x) < 2 && Math.abs(fire1.y - expectLeft.y) < 2 ? 'PASS' : 'FAIL');

// ④右半场 fire ocean → 首选即左洋 → 也落左洋（「从哪都只能到左洋」）
const fire2 = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = 3900 * 16; p.y = 300 * 16; p.vx = 0; p.vy = 0;
  g.fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  return { x: p.x, y: p.y };
});
console.log('FIRE from-right-half:', JSON.stringify(fire2));
console.log('ASSERT lands-left-deck:', Math.abs(fire2.x - expectLeft.x) < 2 && Math.abs(fire2.y - expectLeft.y) < 2 ? 'PASS' : 'FAIL');

// 截图：落位左缘甲板现场（dismiss WelcomeAnnounce（BJ144 探针坑）→ 等黑幕淡出）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = 40 * 16; p.y = 310 * 16;
  const btns = [...document.querySelectorAll('button')];
  const ack = btns.find((b) => (b.textContent ?? '').includes('我已知晓'));
  if (ack) ack.click();
});
await new Promise((r) => setTimeout(r, 3500));
await page.screenshot({ path: '/tmp/bj240-left-ocean-landing.png' });
console.log('SCREENSHOT /tmp/bj240-left-ocean-landing.png');

await browser.close();
