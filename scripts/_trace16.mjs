// 尘16 来源回溯：monkey-patch spawn 记录 type=16 时的调用栈。
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
  // 打桩
  const stacks = [];
  const vd = g.vanillaDust;
  const orig = vd.spawn.bind(vd);
  vd.spawn = function (...args) {
    if (args[4] === 16 && stacks.length < 3) {
      stacks.push(new Error('t').stack?.split('\n').slice(1, 5).join('\n'));
    }
    return orig(...args);
  };
  // 平地 + 裸装跑
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  for (let dx = -80; dx <= 80; dx++) for (let dy = -12; dy <= 2; dy++) st.setTile(bx + dx, by + dy, dy === 2 ? 1 : 0);
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 300));
  g.input.touchKeys.add('KeyD');
  await new Promise(r => setTimeout(r, 2500));
  g.input.touchKeys.delete('KeyD');
  vd.spawn = orig;
  return { vx: +p.vx.toFixed(2), stacks };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
