// 地狱亮度验证:深处背景/瓦片亮度+色偏(红橙环境)+脉动(两采样差)
import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wlhell',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  const h = g.world.store.h;
  g.player.x = 2000 * 16; g.player.y = (h - 80) * 16;   // 地狱中部
  g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.5;
});
await new Promise((r) => setTimeout(r, 3000));
const sample = () => page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const W = r.canvas.width, H = r.canvas.height, ctx = r.ctx;
  const avg = (x, y, w, h2) => {
    const d = ctx.getImageData(x, y, w, h2).data;
    let R = 0, G = 0, Bv = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bv += d[i + 2]; n++; }
    return [Math.round(R / n), Math.round(G / n), Math.round(Bv / n)];
  };
  return { mid: avg(W / 2 - 60 | 0, H / 2 - 40 | 0, 120, 80), wl: r.worldLayerActive };
});
const s1 = await sample();
await new Promise((r) => setTimeout(r, 1700));   // 脉动半周期≈1.57s
const s2 = await sample();
const delta = s1.mid.map((v, i) => Math.abs(v - s2.mid[i]));
console.log('t0:', JSON.stringify(s1), 't+1.7s:', JSON.stringify(s2), 'delta:', JSON.stringify(delta));
await browser.close();
