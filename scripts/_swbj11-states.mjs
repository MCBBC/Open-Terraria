// SW-BJ11 2026-09-07 定谳探针 v7:多状态实机截图(染发剂+盔甲 / 女/异发 / 使用中 / 行走)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj11';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj11-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(2000);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /我已知晓|知道/.test(x.textContent || ''));
  if (b) b.click();
  const g = window.__swGame;
  g.camera.zoom = 8; g.camera.zoomTarget = 8;
  g.world.clock.timeOfDay = 0.25;
});
await sleep(600);

async function shotPlayer(tag) {
  await sleep(500);
  const crop = await page.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { x: Math.max(0, Math.round(sx - 160)), y: Math.max(0, Math.round(sy - 190)), width: 320, height: 380 };
  });
  await page.screenshot({ path: `${OUT}/${tag}.png`, clip: crop });
}
function setup(fnName, arg) {
  return page.evaluate(([fn, a]) => {
    const g = window.__swGame, p = g.player;
    if (fn === 'appearance') {
      p.appearance = JSON.parse(a);
    } else if (fn === 'armor') {
      const [h, b2, l] = JSON.parse(a);
      p.inv.armor[0] = h == null ? null : { id: h, stack: 1 };
      p.inv.armor[1] = b2 == null ? null : { id: b2, stack: 1 };
      p.inv.armor[2] = l == null ? null : { id: l, stack: 1 };
    } else if (fn === 'dye') {
      p.hairDye = a;   // 发色剂槽
    } else if (fn === 'hold') {
      p.inv.slots[0] = { id: a, stack: 1 };
      p.inv.selected = 0;
    }
    p.vx = 0; p.vy = 0;
  }, [fnName, arg]);
}

const female = JSON.stringify({ name: 'probe2', hair: 8, skinVariant: 4,
  hairColor: { r: 190, g: 60, b: 60 }, skinColor: { r: 255, g: 219, b: 172 },
  eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 60, g: 120, b: 210 },
  undershirtColor: { r: 240, g: 240, b: 240 }, pantsColor: { r: 95, g: 105, b: 200 },
  shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 });

// 1) 女 + 银甲(3) — 无染发剂
await setup('appearance', female);
console.log('SILVER:', JSON.stringify(await page.evaluate(async () => {
  const m = await import('/src/data/vanillaItemStats.ts');
  const want = { h: null, b: null, l: null };
  for (let id = 0; id < 8000; id++) {
    const s = m.statOfInternal(id);
    if (!s || !s.s) continue;
    if (s.s === 'h' && s.hs === 3 && want.h === null) want.h = id;
    if (s.s === 'b' && s.bs === 3 && want.b === null) want.b = id;
    if (s.s === 'l' && s.ls === 3 && want.l === null) want.l = id;
  }
  const p = window.__swGame.player;
  p.inv.armor[0] = { id: want.h, stack: 1 }; p.inv.armor[1] = { id: want.b, stack: 1 }; p.inv.armor[2] = { id: want.l, stack: 1 };
  return want;
})));
await shotPlayer('live-f-silver');
// 2) 同态 + 发色剂(红) → hairSplit 拆层
await page.evaluate(() => { window.__swGame.player.hairDye = 1; });
await shotPlayer('live-f-silver-dye');
await page.evaluate(() => { window.__swGame.player.hairDye = 0; });
// 3) 使用中(挥剑 739? 用镐 3502?) — 铜镐已选,模拟 itemAnimation
await page.evaluate(() => {
  const p = window.__swGame.player;
  p.itemAnimation = 10; p.itemAnimationMax = 20;
});
await shotPlayer('live-use');
await page.evaluate(() => { const p = window.__swGame.player; p.itemAnimation = 0; p.itemAnimationMax = 0; });
// 4) 行走(vx 推进)
await page.evaluate(() => { window.__swGame.player.vx = 2.5; });
await shotPlayer('live-walk');
await page.evaluate(() => { window.__swGame.player.vx = 0; });
// 5) 跳跃帧(vy≠0)
await page.evaluate(() => { window.__swGame.player.vy = -3; });
await shotPlayer('live-jump');
await page.evaluate(() => { window.__swGame.player.vy = 0; });
console.log('PROBE-DONE');
await browser.close();
