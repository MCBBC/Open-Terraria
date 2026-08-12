// 594 风气球渲染检查:直接生成 594 → 截图量精灵宽度
// 正常:单气球 ≈32×scale;修复前:整条 8 变体横条 256 宽("完整逐帧贴图")
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 大风天地表自然生成 594(刷怪端 2/3 分支:windyDay+下风侧+上格无墙)
await page.evaluate(() => {
  const g = window.__swGame;
  const wd = g.world.weather;
  wd.windSpeedTarget = 1.0; wd.windSpeedCurrent = 1.0;
  // 站地表白天
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 2;
  while (gy < st.h - 10 && !st.isSolid(px, gy)) gy++;
  g.player.x = px * 16; g.player.y = (gy - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
let balloon = null;
for (let i = 0; i < 90 && !balloon; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  balloon = await page.evaluate(() => {
    const g = window.__swGame;
    for (const e of g.enemies()) {
      if (e.vanillaId === 594 && !e.dead) return { id: e.id, ai2: e.ai2, x: e.cx, y: e.cy };
    }
    return null;
  });
}
if (!balloon) {
  check('大风天生成 594 风气球', false, '90 秒未生成');
} else {
  check('大风天生成 594 风气球', true, JSON.stringify(balloon));
  await new Promise((r) => setTimeout(r, 500));
  // 重新读位置(气球在移动),立即截图
  const pos = await page.evaluate((id) => {
    const g = window.__swGame;
    const e = g.enemies().find((n) => n.id === id);
    if (!e) return null;
    return { sx: Math.round(e.cx - g.camera.x + 640), sy: Math.round(e.y - g.camera.y + 400), netId: e.vanillaNetId };
  }, balloon.id);
  if (!pos) {
    check('气球存活定位', false, '已消失(爆了?)');
  } else {
    const png = PNG.sync.read(await page.screenshot({}));
    // 量精灵横向跨度:在 sy 上下 ±30 内逐列统计不透明
    let left = -1, right = -1;
    for (let dx = -140; dx <= 140; dx++) {
      const xx = Math.max(0, Math.min(png.width - 1, pos.sx + dx));
      let opaque = 0;
      for (let dy = -40; dy <= 40; dy++) {
        const yy = Math.max(0, Math.min(png.height - 1, pos.sy + dy));
        const i = (yy * png.width + xx) * 4;
        if (png.data[i + 3] > 100) opaque++;
      }
      if (opaque > 2) { if (left < 0) left = dx; right = dx; }
    }
    const w = right - left + 1;
    check('气球精灵宽度(单气球≈32-40,整条=256)', w > 20 && w < 90, `宽度 ${w}px (left=${left} right=${right})`);
    await page.screenshot({ path: '/tmp/windy-balloon.png' });
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
