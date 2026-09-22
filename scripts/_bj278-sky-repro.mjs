// BJ278 黑影复现探针：正午露天，弹悬开阔天空（世界画布透明域）→ 预期光环区负增量。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TAG = process.env.TAG ?? 'sky-gl';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

const url = TAG.endsWith('cpu') ? `${ORIGIN}/?trailgl=0` : `${ORIGIN}/`;
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ278天');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj278probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 正午 + 玩家置于地表 + 弹悬露天（地表上方 300px 纯天空域）
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;                    // 正午
  g.entities.drops.length = 0;
  g.entities.enemies.length = 0;
  g.entities.critters.length = 0;
  g.entities.projectiles.length = 0;
  const gy = Math.floor(g.world.groundLevel);
  // 玩家放地表上方一点（露天）
  g.player.x = Math.floor(g.player.cx / 16) * 16;
  g.player.y = (gy - 6) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  for (let k = 0; k < 20; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  return { gy, pcy: Math.round(g.player.cy), tod: g.world.clock.timeOfDay, isDay: g.world.clock.isDay };
});
console.log('prep', JSON.stringify(prep));

await new Promise((r) => setTimeout(r, 900));      // 相机收敛
await page.screenshot({ path: `/tmp/bj278-${TAG}-base.png` });
await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width >= 1280 && c.height >= 800);
  window.__bj278Base = {};
  cvs.forEach((cv, ci) => {
    const sc = document.createElement('canvas');
    sc.width = cv.width; sc.height = cv.height;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    window.__bj278Base[`c${ci}`] = c2.getImageData(0, 0, sc.width, sc.height).data.slice();
  });
});

// 悬停弹：玩家上方 220px（纯天空,弹头+光环无任何墙/地物遮挡）
const hover = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const cx0 = g.player.cx, cy0 = g.player.cy - 220;
  const m = new MagicMissileProj(cx0, cy0, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: m0.cx, y: m0.cy }),
    payMana: () => true,
  });
  const m0 = m;
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (let k = 0; k < 40; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  window.__hv79 = { x: m.cx, y: m.cy };
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length };
});
console.log('hover', JSON.stringify(hover));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `/tmp/bj278-${TAG}-hover.png` });

const diff = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width >= 1280 && c.height >= 800);
  const out = [];
  cvs.forEach((cv, ci) => {
    const base = window.__bj278Base?.[`c${ci}`];
    if (!base) return;
    const sc = document.createElement('canvas');
    sc.width = cv.width; sc.height = cv.height;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    const now = c2.getImageData(0, 0, sc.width, sc.height).data;
    let neg = 0, negBig = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, worst = 0, worstPx = null;
    for (let y = 0; y < sc.height; y++) {
      for (let x = 0; x < sc.width; x++) {
        if (x > 980 && y < 340) continue;
        const i = (y * sc.width + x) * 4;
        const dr = Math.max(base[i] - now[i], base[i + 1] - now[i + 1], base[i + 2] - now[i + 2]);
        if (dr > 2) {
          neg++;
          if (dr > 30) {
            negBig++;
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
            if (dr > worst) { worst = dr; worstPx = { x, y, base: [base[i], base[i + 1], base[i + 2]], now: [now[i], now[i + 1], now[i + 2]] }; }
          }
        }
      }
    }
    out.push({ canvas: `c${ci}`, neg, negBig, bbox: negBig ? [minX, minY, maxX, maxY] : null, worst, worstPx });
  });
  return out;
});
// BJ278 附加：世界画布 α 直读（露天域,星心±16px 盒最大 α——头部修后应=0）
const wcRead = await page.evaluate(() => {
  const g = window.__swGame;
  const wc = g.renderer['worldCanvas'];
  if (!wc) return { fatal: 'no worldCanvas' };
  const z = 1;
  const camRX = Math.round(g.camera.x * z) / z;
  const camRY = Math.round(g.camera.y * z) / z;
  const sx = Math.round((window.__hv79.x - camRX) * z + wc.width / 2);
  const sy = Math.round((window.__hv79.y - camRY) * z + wc.height / 2);
  const d = wc.getContext('2d', { willReadFrequently: true }).getImageData(sx - 16, sy - 16, 33, 33).data;
  let maxA = 0, litN = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > maxA) maxA = d[i + 3];
    if (d[i + 3] > 8) litN++;
  }
  return { starCanvasPx: [sx, sy], maxAlpha: maxA, litPixels: litN, boxPx: 33 * 33 };
});
console.log('diff', JSON.stringify(diff));
console.log('worldcanvas-alpha', JSON.stringify(wcRead));
console.log('diff', JSON.stringify(diff));
console.log(`shots: /tmp/bj278-${TAG}-base.png /tmp/bj278-${TAG}-hover.png`);
await browser.close();
process.exit(0);
