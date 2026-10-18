// 回归基线+月亮点检:默认路径(无参)夜景 vs ?worldlayer=1;采样月亮屏位/天空顶/地面带/史莱姆
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const OUT = join(HOME, '.claude/jobs/8405c930/tmp/wl-final');
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.T || 'http://localhost:4173';
async function shot(qs, tag) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: `${HOME}/.claude/jobs/8405c930/tmp/wlf${tag}`,
    args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
  page.setDefaultTimeout(200000);
  await page.goto(B + '/' + qs, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
  await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.x = 383 * 16; g.player.y = 228 * 16;
    g.player.debugGod = true;
    const c = g.world.clock; if (c) { c.timeOfDay = 0.05; c.moonPhase = 0; }
    g.spawnEnemy('slime_blue', (383 + 4) * 16, 229 * 16);
    g.spawnEnemy('slime_green', (383 + 7) * 16, 229 * 16);
  });
  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: `${OUT}/${tag}.png` });
  const st = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const W = r.canvas.width, H = r.canvas.height, ctx = r.ctx;
    const avg = (x, y, w, h) => {
      x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
      const d = ctx.getImageData(x, y, Math.min(w, W - x), Math.min(h, H - y)).data;
      let R = 0, G = 0, Bc = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bc += d[i + 2]; n++; }
      return n ? [Math.round(R / n), Math.round(G / n), Math.round(Bc / n)] : null;
    };
    const mg = r.sky.moonScreen;
    const out = {
      worldLayerOn: r.worldLayerActive,
      moon: mg ? { x: Math.round(mg.x), y: Math.round(mg.y), r: Math.round(mg.r) } : null,
      moonPx: null, skyTop: avg(W / 2 - 100, 4, 200, 30),
      slimes: [], groundBand: null,
    };
    if (mg) {
      // 月心 3×3 最亮像素(取 max 而非均值,月亮是盘)
      const d = ctx.getImageData(Math.round(mg.x) - 30, Math.round(mg.y) - 30, 60, 60).data;
      let best = 0, bi = 0;
      for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s > best) { best = s; bi = i; } }
      out.moonPx = [d[bi], d[bi + 1], d[bi + 2]];
    }
    for (const e of g.entities.enemies) {
      const k = String(e.def?.key ?? '');
      if (!k.includes('slime')) continue;
      const z = g.camera.zoom;
      const ex = (e.cx - g.camera.x) * z + W / 2, ey = (e.cy - g.camera.y) * z + H / 2;
      if (ex < 0 || ey < 0 || ex > W || ey > H) continue;
      out.slimes.push({ k, px: avg(ex - 12, ey - 12, 24, 24) });
    }
    // 地面带:世界层关时,直接取屏幕下 1/3 非天空带(地形剪影区)
    out.groundBand = avg(W / 2 - 150, H - 180, 300, 60);
    return out;
  });
  console.log(tag, JSON.stringify(st));
  await browser.close();
}
await shot('', 'night-default');
await shot('?worldlayer=1', 'night-wl1');
console.log('DONE →', OUT);
