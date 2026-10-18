// 地下背景光照修复验证:深处未点燃区域背景应暗(世界层=旧路径≈同暗)
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const OUT = join(HOME, '.claude/jobs/8405c930/tmp/wl-cave');
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.T || 'http://localhost:4173';
async function shot(qs, tag) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: `${HOME}/.claude/jobs/8405c930/tmp/wlcave-${tag}`,
    args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', tag, String(e.message).slice(0, 120)));
  await page.goto(B + '/' + qs, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
  await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__swGame;
    // 深处大洞(找一块实心围成的空腔上空域):放 y=700 附近,清掉玩家光干扰用 debugGod
    g.player.x = 2000; g.player.y = 700 * 16;
    g.player.debugGod = true;
    g.world.clock.timeOfDay = 0.5;
  });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const st = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const W = r.canvas.width, H = r.canvas.height, ctx = r.ctx;
    const avg = (x, y, w, h) => {
      const d = ctx.getImageData(x, y, w, h).data;
      let R = 0, G = 0, Bv = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bv += d[i + 2]; n++; }
      return [Math.round(R / n), Math.round(G / n), Math.round(Bv / n)];
    };
    return {
      wl: r.worldLayerActive,
      corner: avg(8, 8, 120, 80),       // 屏角(远处背景)
      mid: avg(W / 2 - 60 | 0, H / 2 - 40 | 0, 120, 80),
      bot: avg(W / 2 - 60 | 0, H - 100, 120, 80),
    };
  });
  console.log(tag, JSON.stringify(st));
  await browser.close();
}
await shot('', 'cave-wl1');
await shot('?worldlayer=0', 'cave-wl0');
console.log('DONE →', OUT);
