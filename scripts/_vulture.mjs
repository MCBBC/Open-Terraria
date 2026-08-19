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
  let col = -1, gy = -1;
  for (let x = 300; x < 3900 && col < 0; x++) {
    for (let y = 60; y < 400; y++) {
      if (st.isSolid(x, y)) {
        if (st.isSolid(x - 1, y) && st.isSolid(x + 1, y)
          && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) { col = x; gy = y; }
        break;
      }
    }
  }
  if (col < 0) return { why: 'no flat' };
  return import('/src/entities/Enemy.ts').then((m) => {
    const v = m.Enemy.fromVanilla(61, col * 16 + 8, gy * 16);
    if (!v) return { why: 'null' };
    // 修复后 Game 落位（新扫描序平地 → 底贴地）
    v.y = (gy - 1) * 16 + 16 - v.h;
    v.id = g.entities.nextId++;
    g.entities.add(v, 'enemies');
    // 玩家 500px 外
    g.player.x = (col - 31) * 16; g.player.y = (gy - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    // 300t 静置 → 应保持 ai0=0
    const idle = [];
    for (let t = 0; t < 300; t++) {
      g.fixedUpdate(1 / 60);
      if (t % 100 === 0) idle.push([t, v.ai0, Math.round(v.y)]);
    }
    // 玩家走近（150px 内）→ 应唤醒 ai0=1 且升空
    g.player.x = (col - 7) * 16;   // 112px < 124px 唤醒盒
    let woke = -1;
    for (let t = 0; t < 120; t++) {
      g.fixedUpdate(1 / 60);
      if (woke < 0 && v.ai0 === 1) woke = t;
    }
    return { idle, wokeAt: woke, finalAi0: v.ai0, vyAfter: Math.round(v.vy * 10) / 10 };
  });
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
