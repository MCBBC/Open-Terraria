// 裸装跑动尘复现：无装备草地跑 → 尘类型分布 + bootFx/触发门状态。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1800));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  // 清装备（保险）
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  // 平整草地（泥土+草顶）长跑道
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  const grass = window.__swTiles ? Object.entries(window.__swTiles).find(([k]) => k.includes('v_2_grass'))?.[1] : null;
  for (let dx = -80; dx <= 80; dx++) {
    for (let dy = -12; dy <= 2; dy++) {
      if (dy === 2) st.setTile(bx + dx, by + dy, grass ?? 2);
      else st.setTile(bx + dx, by + dy, 0);
    }
  }
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 300));
  g.input.touchKeys.add('KeyD');
  await new Promise(r => setTimeout(r, 3000));
  const pool = g.vanillaDust.pool.filter(c => c.active);
  const types = pool.reduce((m, c) => { m[c.type] = (m[c.type] ?? 0) + 1; return m; }, {});
  const res = { vx: +p.vx.toFixed(2), bootFx: p.equipStats.bootFx, runSpeed: p.equipStats.accRunSpeed,
    floorTileT: p.floorTileT, types, sample: pool.slice(0, 3).map(c => ({ t: c.type, x: Math.round(c.x), y: Math.round(c.y), py: Math.round(p.y) })) };
  g.input.touchKeys.delete('KeyD');
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
