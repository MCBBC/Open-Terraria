// 裸装半空再跳验证：高台走落 → 下落中按跳 → 观察是否 vy 重置（错误）或继续下落（正确）。
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
  const eq = p.equipStats;
  // 真空箱：±80 列 × 上下 60 行全清（下面 60 行也无地面 → 纯自由落体）
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  for (let dx = -80; dx <= 80; dx++) for (let dy = -60; dy <= 60; dy++) st.setTile(bx + dx, by + dy, 0);
  await new Promise(r => setTimeout(r, 200));
  // 空中投放自由落体
  p.x = bx * 16 + 8; p.y = (by - 30) * 16; p.vx = 0; p.vy = 0; p.onGround = false; p.fallStartY = p.y;
  await new Promise(r => setTimeout(r, 300));
  const samples = [];
  const t0 = g.tickCount;
  // 等下落到 vy>2 时按跳一次
  let jumped = false, vyBeforeJump = 0;
  const sampler = setInterval(() => {
    if (!jumped && p.vy > 2 && !p.onGround) {
      jumped = true; vyBeforeJump = +p.vy.toFixed(2);
      g.input.keys.add('Space');
      setTimeout(() => g.input.keys.delete('Space'), 120);
    }
    samples.push({ t: g.tickCount - t0, y: Math.round(p.y), vy: +p.vy.toFixed(2), ground: p.onGround, hold: p.jumpHold });
  }, 50);
  await new Promise(r => setTimeout(r, 1800));
  clearInterval(sampler);
  const after = samples.filter(s => Math.abs(s.vy - vyBeforeJump) < 0.01).length;
  return {
    jumpOpts: eq.jumpOpts, wing: !!eq.wing, dash: eq.dash,
    jumped, vyBeforeJump,
    vyAfterJump: samples.slice(samples.findIndex(s => Math.abs(s.vy - vyBeforeJump) < 0.01 && s.vy === vyBeforeJump) + 1, +8).map(s => s.vy),
    samples: samples.slice(0, 36),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
