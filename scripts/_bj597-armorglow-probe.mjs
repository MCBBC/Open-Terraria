// ★BJ597 真机烟测（终版）：补 appearance（?play=small 直进世界跳过 mainFlow 赋值面）
//  + 星旋三件套 A/B（无甲/全甲）暗场采样 + 截图。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5207') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
for (const sel of ['button']) {
  const btns = await page.$$(sel);
  for (const b of btns) {
    const t = await b.evaluate((el) => el.textContent ?? '');
    if (t.includes('我已知晓')) { await b.click(); break; }
  }
}
await new Promise(r => setTimeout(r, 600));
const grant = async (vids) => {
  await page.evaluate((vs) => {
    const g = window.__swGame, p = g.player;
    p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
    for (const v of vs) {
      const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + v + '_').test(x));
      const slot = v === 2757 ? 0 : v === 2758 ? 1 : 2;
      p.inv.armor[slot] = { id: window.__swItems[k], stack: 1 };
    }
  }, vids);
  await new Promise(r => setTimeout(r, 700));
};
const sampleAndShoot = async (tag) => {
  const s = await page.evaluate(() => {
    const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
    const sx = Math.round((p.x + p.w / 2 - cam.x) * cam.zoom + cv.width / 2);
    const sy = Math.round((p.y + p.h - cam.y) * cam.zoom + cv.height / 2);
    const read = (x, y, w, h) => {
      const img = g.renderer.ctx.getImageData(Math.max(0, x), Math.max(0, y), w, h).data;
      let bright = 0, sum = 0, n = 0;
      for (let i = 0; i < img.length; i += 4) {
        if (img[i + 3] > 60) { n++; sum += img[i] + img[i + 1] + img[i + 2]; if (img[i] + img[i + 1] + img[i + 2] > 420) bright++; }
      }
      return { bright, avg: n ? +(sum / n / 3).toFixed(2) : 0 };
    };
    return { head: read(sx - 16, sy - 56, 32, 44), ctrl: read(sx + 44, sy - 56, 32, 44) };
  });
  await page.screenshot({ path: `/tmp/bj597_${tag}.png` });
  return s;
};
// appearance 补赋（mainFlow 面等价）
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj597');
  p.appearance.pantsColor = { r: 255, g: 220, b: 120 };
});
await new Promise(r => setTimeout(r, 400));
await grant([]);
const baseline = await sampleAndShoot('a_naked');
await grant([2757, 2758, 2759]);   // 星旋全套（head169/body175/legs110 → glow 15/13+18?/199）
const vortex = await sampleAndShoot('b_vortex');
const diag = await page.evaluate(() => {
  const R = window.__swGame.renderer, p = window.__swGame.player;
  const Rm = window.__bj597diag ?? null;
  return { appearanceSet: !!p.appearance, armorHead: p.inv.armor[0]?.id ?? null };
});
console.log(JSON.stringify({ baseline, vortex, diag, verdict: {
  glowPresent: vortex.head.bright - baseline.head.bright > 15,
  noSideLeak: vortex.ctrl.bright <= vortex.head.bright,
} }, null, 1));
await browser.close();
