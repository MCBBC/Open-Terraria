// worldLayer 夜景重写后 A/B 量化 v2:采样窗锚定真实地面(扫描实心格)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.env.OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp/wl-ab3';
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.T || 'http://localhost:4173';

async function shot(mode, tod, tag) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: `/Users/vinlic/.claude/jobs/8405c930/tmp/wlab3-${mode}`,
    args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
  page.setDefaultTimeout(200000);
  await page.goto(B + '/' + (mode === 'off' ? '?worldlayer=0' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
  await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
  await page.evaluate((t) => {
    const g = window.__swGame;
    g.player.x = 383 * 16; g.player.y = 228 * 16;
    g.player.debugGod = true;
    const c = g.world.clock; if (c) c.timeOfDay = t;
    g.spawnEnemy('slime_blue', (383 + 4) * 16, 229 * 16);
    g.spawnEnemy('slime_green', (383 + 7) * 16, 229 * 16);
  }, tod);
  await new Promise((r) => setTimeout(r, 3500));
  const file = `${OUT}/${tag}-${mode}.png`;
  await page.screenshot({ path: file });
  const stats = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const z = g.camera.zoom, W = r.canvas.width, H = r.canvas.height;
    const ctx = r.ctx;
    const avg = (x, y, w, h) => {
      x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
      const d = ctx.getImageData(x, y, Math.min(w, W - x), Math.min(h, H - y)).data;
      let R = 0, G = 0, Bc = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; Bc += d[i + 2]; n++; }
      return n ? [Math.round(R / n), Math.round(G / n), Math.round(Bc / n)] : null;
    };
    const st = g.world.store;
    // 真实地面:玩家列向下扫第一个实心格
    let gy = 230;
    while (gy < 300 && !st.isSolid(383, gy)) gy++;
    const sx = (383 * 16 - g.camera.x) * z + W / 2, sy = (gy * 16 + 24 - g.camera.y) * z + H / 2;
    const out = {
      glActive: !!(r.worldLight && !r.worldLight.diedAt && !r.worldLight.unavailable),
      skyTop: avg(W / 2 - 100, 4, 200, 30),
      groundTileY: gy,
      ground: avg(sx, sy, 120, 36),
      slimes: [],
    };
    const wc = r.worldCanvas;
    for (const e of g.entities.enemies) {
      const k = String(e.def?.key ?? e.npcKey ?? '');
      if (!k.includes('slime')) continue;
      const ex = (e.cx - g.camera.x) * z + W / 2, ey = (e.cy - g.camera.y) * z + H / 2;
      if (ex < 0 || ey < 0 || ex > W || ey > H) continue;
      const bw = Math.max(8, Math.round(e.w * z)), bh = Math.max(8, Math.round(e.h * z));
      let layerSemi = 0, aSum = 0;
      if (wc) {
        const wctx = wc.getContext('2d');
        const d = wctx.getImageData(Math.round(ex - bw / 2), Math.round(ey - bh / 2), bw, bh).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 16 && d[i] <= 235) { layerSemi++; aSum += d[i]; }
      }
      out.slimes.push({ k, eY: Math.round(e.y / 16), layerSemi, layerAvgA: layerSemi ? Math.round(aSum / layerSemi) : -1, main: avg(ex - bw / 2, ey - bh / 2, bw, bh) });
    }
    return out;
  });
  console.log(tag, mode, JSON.stringify(stats));
  await browser.close();
}

await shot('on', 0.4, 'day');
await shot('off', 0.4, 'day');
await shot('on', 0.85, 'night');
await shot('off', 0.85, 'night');
console.log('DONE →', OUT);
