// BJ255 视觉定量探针：直线巡航单弹（BJ247 cruise 同款,速度 20=长带）。
// 逐 face 读回主画布彩虹带像素计数（饱和度>60 的像素数/带宽剖面）——GL vs CPU 兜底
// 观感定量对拍（不只截图目测）。★GPU 页禁 trace,不挂 profiler。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?traildbg', { waitUntil: 'domcontentloaded', timeout: 90000 });
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
  await page.keyboard.type('BJ255V');
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
  await page.keyboard.type('bj255vis');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 场地+弹
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 44;
  for (let dx = -500; dx <= 500; dx++) {
    for (let dy = -40; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const y0 = g.player.cy - 56;
  const m = new MagicMissileProj(g.player.cx - 160, y0, 20, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => false, aimCb: () => ({ x: g.player.cx + 8000, y: y0 }),
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  window.__bj255m = m;
  g.paused = false;
  for (let k = 0; k < 34; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
});
await new Promise((r) => setTimeout(r, 900));   // 贴图落地
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  g.camera.x = window.__bj255m.cx; g.camera.y = window.__bj255m.cy;
});
await new Promise((r) => setTimeout(r, 300));

// 读回：主画布彩虹带定量（饱和像素数+行剖面）
async function measure(label) {
  const r = await page.evaluate((lb) => {
    const cvs = [...document.querySelectorAll('#game-root canvas')]
      .filter((c) => c.width >= 1280 && c.height >= 800);
    let best = null;
    for (const cv of cvs) {
      const sc = document.createElement('canvas');
      sc.width = cv.width; sc.height = cv.height;
      const c2 = sc.getContext('2d', { willReadFrequently: true });
      c2.drawImage(cv, 0, 0);
      const rows = [];
      let total = 0;
      for (let dy = -48; dy <= 48; dy += 4) {
        const d = c2.getImageData(0, 400 + dy, sc.width, 1).data;
        let n = 0, x0 = -1, x1 = -1;
        for (let x = 0; x < sc.width; x++) {
          const i = x * 4, rr = d[i], gg = d[i + 1], bb = d[i + 2];
          if (Math.max(rr, gg, bb) - Math.min(rr, gg, bb) > 60) { n++; if (x0 < 0) x0 = x; x1 = x; }
        }
        if (n > 0) { rows.push({ dy, n }); total += n; }
      }
      if (!best || total > best.total) best = { total, rows: rows.length, span: rows.length ? [rows[0].dy, rows[rows.length - 1].dy] : null };
    }
    const g = window.__swGame;
    return { label: lb, ...best, strip: window.__bj255m?.strip?.length, dead: window.__bj255m?.dead,
      dbg: g.renderer?.__trailDbg ?? null };
  }, label);
  console.log('[measure]', JSON.stringify(r));
  return r;
}

await measure('GL');
await page.screenshot({ path: '/tmp/bj255-vis-gl.png', clip: { x: 200, y: 160, width: 880, height: 480 } });

// 切 CPU 兜底（pushState 免重载）
await page.evaluate(() => { window.history.pushState({}, '', '/?traildbg&trailgl=0'); });
await page.evaluate(() => {
  const g = window.__swGame;
  // 弹已死（撞墙）——重生一条再测
  return (async () => {
    const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
    const g2 = window.__swGame;
    const y0 = g2.player.cy - 56;
    const m = new MagicMissileProj(g2.player.cx - 160, y0, 20, 0, {
      projId: 79, damage: 50, knockback: 5, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: g2.player.cx + 8000, y: y0 }),
      payMana: () => true,
    });
    m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
    g2.entities.add(m, 'projectiles');
    window.__bj255m = m;
    g2.paused = false;
    for (let k = 0; k < 34; k++) g2.fixedUpdate(1 / 60);
    g2.camera.x = m.cx; g2.camera.y = m.cy;
    for (let k = 0; k < 2; k++) g2.fixedUpdate(1 / 60);
    g2.paused = true;
  })();
});
await new Promise((r) => setTimeout(r, 300));
await measure('CPU-fallback');
await page.screenshot({ path: '/tmp/bj255-vis-cpu.png', clip: { x: 200, y: 160, width: 880, height: 480 } });

console.log('shots: /tmp/bj255-vis-gl.png /tmp/bj255-vis-cpu.png');
await browser.close();
process.exit(0);
