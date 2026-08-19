// worldLayer A/B 截图:昼/夜 × ?worldlayer={1,0} 四象限。同一存档同点位同史莱姆,
// 视觉对齐 2026-08-19 用户报"史莱姆染色/透明不对+夜地面剪影+远景云异常"。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.env.OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp/wl-ab';
fs.mkdirSync(OUT, { recursive: true });
const B = process.env.T || 'http://localhost:4173';

async function shot(mode, tod, tag) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: `/Users/vinlic/.claude/jobs/8405c930/tmp/wlab-${mode}`,
    args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
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
    g.player.x = 383 * 16; g.player.y = 228 * 16;   // 地表
    g.player.debugGod = true;
    const c = g.world.clock; if (c) c.timeOfDay = t;
    // 玩家右侧放两只史莱姆(一只裸地/一只近景)
    g.spawnEnemy('slime_blue', (383 + 4) * 16, 229 * 16);
    g.spawnEnemy('slime_green', (383 + 7) * 16, 229 * 16);
  }, tod);
  // 稳定几帧(贴图/光照/烘焙就位)
  await new Promise((r) => setTimeout(r, 3500));
  const file = `${OUT}/${tag}-${mode}.png`;
  await page.screenshot({ path: file });
  // 史莱姆区像素采样(玩家右侧屏幕区)
  const slimeStats = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, ctx = r.ctx;
    const z = g.camera.zoom;
    const out = [];
    for (const e of g.entities.enemies) {
      if (!/slime/.test(String(e.npcKey ?? e.key ?? '')) && !(e.def?.key ?? '').includes('slime')) continue;
      const sx = (e.cx - g.camera.x) * z + r.canvas.width / 2;
      const sy = (e.cy - g.camera.y) * z + r.canvas.height / 2;
      if (sx < 0 || sy < 0 || sx > r.canvas.width || sy > r.canvas.height) continue;
      const pad = 6, w = Math.max(4, Math.round(e.w * z)) + pad, h = Math.max(4, Math.round(e.h * z)) + pad;
      const d = ctx.getImageData(Math.round(sx - w / 2), Math.round(sy - h / 2), w, h).data;
      let op = 0, semi = 0, r0 = 0, g0 = 0, b0 = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 200) { op++; r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; }
        else if (d[i + 3] > 16 && d[i + 3] <= 200) semi++;
      }
      out.push({ key: e.def?.key ?? e.npcKey, opaque: op, semi, avg: op ? [r0 / op | 0, g0 / op | 0, b0 / op | 0] : null });
    }
    return out;
  });
  console.log(tag, mode, JSON.stringify(slimeStats));
  await browser.close();
}

await shot('on', 0.4, 'day');    // 白天
await shot('off', 0.4, 'day');
await shot('on', 0.85, 'night'); // 夜里
await shot('off', 0.85, 'night');
console.log('DONE →', OUT);
