// SW-BJ11 2026-09-07 头/身分离定谳探针 v2:
//  A) 注入 appearance(真实链)→ 裸肤/铜甲/铁甲 实机站姿放大截图
//  B) appearance 移除 → legacy 路径截图(对照)
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
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(2000);
// 关欢迎弹窗(若有)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /我已知晓|知道/.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(800);

// 注入外观 + 站平 + 相机放大
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.appearance = { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 120, g: 80, b: 40 }, skinColor: { r: 255, g: 219, b: 172 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 187, g: 79, b: 60 },
    undershirtColor: { r: 130, g: 130, b: 130 }, pantsColor: { r: 95, g: 105, b: 200 },
    shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 };
  p.vx = 0; p.vy = 0; p.facing = 1;
  try { p.itemAnimation = 0; p.itemAnimationMax = 0; p.itemTime = 0; } catch {}
  g.camera.zoom = 6; g.camera.zoomTarget = 6;
});
await sleep(600);

async function shotPlayer(tag) {
  await sleep(400);
  const crop = await page.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { x: Math.max(0, Math.round(sx - 160)), y: Math.max(0, Math.round(sy - 190)), width: 320, height: 380 };
  });
  await page.screenshot({ path: `${OUT}/${tag}.png`, clip: crop });
}
function setArmor(h, b, l) {
  return page.evaluate(([hh, bb, ll]) => {
    const p = window.__swGame.player;
    p.inv.armor[0] = hh == null ? null : { id: hh, stack: 1 };
    p.inv.armor[1] = bb == null ? null : { id: bb, stack: 1 };
    p.inv.armor[2] = ll == null ? null : { id: ll, stack: 1 };
    p.vx = 0; p.vy = 0;
    return { assigned: [p.inv.armor[0]?.id, p.inv.armor[1]?.id, p.inv.armor[2]?.id],
      disp: p.inv.displayArmor(), ptype: p.inv.armor[0]?.constructor?.name };
  }, [h, b, l]);
}

// 按贴图槽位(hs/bs/ls)扫铜甲(=1)三件内部 id
const copperIds = await page.evaluate(async () => {
  const m = await import('/src/data/vanillaItemStats.ts');
  const want = { h: null, b: null, l: null };
  for (let id = 0; id < 8000; id++) {
    const s = m.statOfInternal(id);
    if (!s || !s.s) continue;
    if (s.s === 'h' && s.hs === 1 && want.h === null) want.h = id;
    if (s.s === 'b' && s.bs === 1 && want.b === null) want.b = id;
    if (s.s === 'l' && s.ls === 1 && want.l === null) want.l = id;
  }
  return want;
});
console.log('COPPER-IIDS:', JSON.stringify(copperIds));

// 1) 裸肤
console.log('BARE-DISPLAY:', JSON.stringify(await setArmor(null, null, null)));
await shotPlayer('live-bare');
// 2) 铜甲
console.log('COPPER-DISPLAY:', JSON.stringify(await setArmor(copperIds.h, copperIds.b, copperIds.l)));
await sleep(1200);
await shotPlayer('live-copper');
// 3) legacy 对照(appearance 移除,铜甲保留)
await page.evaluate(() => { window.__swGame.player.appearance = undefined; });
await sleep(800);
await shotPlayer('live-legacy');
console.log('PROBE-DONE');
await browser.close();
