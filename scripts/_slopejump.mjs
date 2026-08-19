// 坡面/半砖地形半空跳复现：真实地形（斜坡+半砖+平台）跳跃中再按跳，观察 onGround 是否滞留 true。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  const dirt = TILE_DEFS.findIndex(d => d?.vanilla?.sheet === 0);
  // 建斜坡地形：左→右阶梯下降+坡面（setTile 带 slope 3）
  for (let dx = -80; dx <= 80; dx++) for (let dy = -50; dy <= 6; dy++) st.setTile(bx + dx, by + dy, 0);
  for (let dx = -40; dx <= 40; dx++) {
    const h = Math.max(0, Math.floor(Math.abs(dx) / 6));   // V 形谷坡
    for (let dy = 1; dy <= 6 + h; dy++) st.setTile(bx + dx, by + dy, dirt, dx < 0 ? 2 : 1, 0);
  }
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by - 2) * 16; p.vx = 0; p.vy = 0; p.onGround = true;
  await new Promise(r => setTimeout(r, 400));
  // 起跳（地面）→ 上升/下落各阶段按跳 → 记录每次 vy 反应
  const results = [];
  const press = (ms) => new Promise(res => {
    g.input.keys.add('Space');
    setTimeout(() => { g.input.keys.delete('Space'); res(); }, ms);
  });
  // 阶段1: 地面跳
  await press(80);
  // 阶段2: 20t 后（上升中）再按
  await new Promise(r => setTimeout(r, 300));
  const vyMidRise = +p.vy.toFixed(2), gMidRise = p.onGround;
  await press(80);
  await new Promise(r => setTimeout(r, 100));
  results.push({ phase: 'rise', vyAtPress: vyMidRise, groundAtPress: gMidRise, vyAfter: +p.vy.toFixed(2), groundAfter: p.onGround, y: Math.round(p.y) });
  // 等落地
  await new Promise(r => setTimeout(r, 1200));
  // 阶段3: 再跳一次，下落中（vy>2）再按
  await press(80);
  await new Promise(r => setTimeout(r, 450));
  const vyFall = +p.vy.toFixed(2), gFall = p.onGround;
  await press(80);
  await new Promise(r => setTimeout(r, 120));
  results.push({ phase: 'fall', vyAtPress: vyFall, groundAtPress: gFall, vyAfter: +p.vy.toFixed(2), groundAfter: p.onGround, y: Math.round(p.y) });
  await new Promise(r => setTimeout(r, 1000));
  results.push({ phase: 'final', ground: p.onGround, y: Math.round(p.y) });
  return { results, baseY: by * 16, onSlope: true };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
