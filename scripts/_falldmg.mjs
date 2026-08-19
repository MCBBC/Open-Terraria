// 摔伤结算验证：40 格坠落 → 落地掉血量（对照：按跳 vs 不按）。
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
  await new Promise(r => setTimeout(r, 300));
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  // 井筒：±6 列清到 by-50，地板在 by+6
  for (let dx = -6; dx <= 6; dx++) for (let dy = -52; dy <= 6; dy++) st.setTile(bx + dx, by + dy, 0);
  for (let dx = -6; dx <= 6; dx++) st.setTile(bx + dx, by + 6, 1);
  await new Promise(r => setTimeout(r, 200));
  // 场景 C：地面起跳后长落（jumpHold 期走出井筒边沿→自由长落→半空再按跳）
  // 井筒改宽塔：清 ±3 列、地板 by+6，玩家从地板起跳后横移出沿
  const drop3 = async () => {
    p.hp = p.maxHp; p.dead = false;
    p.x = bx * 16 + 8; p.y = (by + 5) * 16 - p.h; p.vx = 0; p.vy = 0;
    p.onGround = true; p.fallStartY = null; p.iframes = 0;
    await new Promise(r => setTimeout(r, 200));
    const startY = p.y;
    // 起跳 + 持续按住右走出 ±3 列筒沿（3 列=48px，1s 内走出）
    g.input.keys.add('Space');
    setTimeout(() => g.input.keys.delete('Space'), 80);
    g.input.touchKeys.add('KeyD');
    setTimeout(() => g.input.touchKeys.delete('KeyD'), 800);
    // 半空（vy>6）再按跳一次
    setTimeout(() => { g.input.keys.add('Space'); setTimeout(() => g.input.keys.delete('Space'), 100); }, 1400);
    await new Promise(r => setTimeout(r, 3200));
    return { hp: p.hp, y: Math.round(p.y), fallTiles: Math.round((p.y - startY) / 16), ground: p.onGround };
  };
  const c = await drop3();
  return { scenarioC: c, maxHp: p.maxHp };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
