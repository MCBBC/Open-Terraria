// 秃鹫唤醒门探针：地表生成 → ai0 序列（应保持 0 栖息直到玩家进 200px 盒）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto('http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const r = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  // 找一处地表沙列
  let col = -1, gy = -1;
  outer: for (let x = 100; x < 4200; x++) {
    for (let y = 10; y < 400; y++) {
      if (st.isSolid(x, y)) {
        // 上两格空 + 是沙
        const i1 = st.idx(x, y - 1), i2 = st.idx(x, y - 2);
        if (!st.flags[i1] && !st.flags[i2]) { col = x; gy = y; break outer; }   // 任一地表即可
      }
    }
  }
  if (col < 0) return { why: 'no sand col' };
  // 走 Enemy.fromVanilla + entities.add（模拟 spawner 产出链）
  return import('/src/entities/Enemy.ts').then((m) => {
    const v = m.Enemy.fromVanilla(61, col * 16 + 8, gy * 16);
    if (!v) return { why: 'fromVanilla null' };
    v.y = gy * 16 - v.h;           // spawnNPC 同锚（底贴格顶）
    v.id = g.entities.nextId++;
    g.entities.add(v, 'enemies');
    // 玩家放远（400px 外）
    g.player.x = (col - 25) * 16; g.player.y = (gy - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    const seq = [];
    for (let t = 0; t < 120; t++) {
      g.fixedUpdate(1 / 60);
      if (t % 20 === 0) seq.push([t, v.ai0, Math.round(v.vy * 100) / 100, Math.round(v.y)]);
    }
    return { col, gy, aiStyle: v.vanilla?.aiStyle, seq, dead: v.dead, finalY: Math.round(v.y) };
  });
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
