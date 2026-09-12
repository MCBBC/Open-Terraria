// SW-FX40 反重力波5 运行时冒烟：落地/行走/跳顶/边界/触碰格清单 快照验证。
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
  const hp0 = p.hp;
  // 落地态
  await new Promise(r => setTimeout(r, 400));
  const landed = { onGround: p.onGround, vy: +p.vy.toFixed(3), gField: +(p.gField ?? -1).toFixed(4) };
  // 行走 2s：看 touchedTiles 采集（草面无地板尘=原版允许集不含 2,尘面由单测钉）
  g.input.keys.add('ArrowRight');
  await new Promise(r => setTimeout(r, 2000));
  g.input.keys.delete('ArrowRight');
  const walked = { touchedTilesLen: (p.touchedTiles ?? []).length };
  // 跳顶：搭天花板罩头，起跳上撞 → 帧采样 hitHead（瞬态,须逐帧抓）
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  for (let dx = -4; dx <= 4; dx++) for (let dy = -6; dy <= -4; dy++) st.setTile(bx + dx, by + dy, 1);
  await new Promise(r => setTimeout(r, 200));
  let hitHeadSeen = false, minVyAfterBump = 99;
  const sampler = setInterval(() => { if (p.hitHead) hitHeadSeen = true; if (!p.onGround && p.vy < minVyAfterBump) minVyAfterBump = +p.vy.toFixed(2); }, 8);
  g.input.keys.add('Space');
  await new Promise(r => setTimeout(r, 150));
  g.input.keys.delete('Space');
  await new Promise(r => setTimeout(r, 1200));
  clearInterval(sampler);
  const headBump = { hitHeadSeen, minVyAfterBump };
  // 边界：底部不杀（普通世界）
  const hpAfter = p.hp;
  return {
    hp0, hpAfter, alive: hpAfter > 0,
    landed, walked, headBump,
    touchedIsArray: Array.isArray(p.touchedTiles),
    jumpSpeedField: +(p.jumpSpeedField ?? -1).toFixed(3),
  };
});
console.log(JSON.stringify(out, null, 1));
const ok = out.alive && out.landed.onGround && out.landed.gField === 0.4
  && out.headBump.hitHeadSeen && out.touchedIsArray
  && out.jumpSpeedField === 5.01;
console.log(ok ? 'SMOKE-GREEN' : 'SMOKE-RED');
await browser.close();
process.exit(ok ? 0 : 2);
