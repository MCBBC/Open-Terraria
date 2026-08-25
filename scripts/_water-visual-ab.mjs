// 落水涟漪视觉 A/B（简化版）：入水后 +3/+8/+15 tick 各截一帧，玩家 vs 僵尸。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_water-visual-ab.mjs --timeout=90000
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 520 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 120)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5232', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16) + 10;
  const gy = Math.floor(g.player.y / 16) + 2;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = gy; y <= gy + 3; y++) st.setTile(x, y, 0);
    for (let y = gy + 1; y <= gy + 3; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;
    }
  }
  for (let x = px - 3; x <= px + 3; x++) st.setTile(x, gy + 4, 1);
  for (let y = gy; y <= gy + 4; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  g.world.clock.timeOfDay = 0.5;
  return { px, gy };
});
await page.evaluate((s) => {
  const g = window.__swGame;
  g.camera.x = s.px * 16 + 8;
  g.camera.y = (s.gy + 2) * 16;
}, setup);
await new Promise((r) => setTimeout(r, 500));

// 预泵：把僵尸/玩家放到水面上方，泵 tick 直到入水翻转，返回翻转后 tick 计数
const prepAndEnter = async (npcMode) => {
  return page.evaluate(async ({ s, npcMode }) => {
    const g = window.__swGame;
    g.paused = true;
    g.entities.enemies.length = 0;
    g.player.wetCount = 0;
    g.player.inWater = false;
    let z = null;
    if (npcMode) {
      const { Enemy } = await import('/src/entities/Enemy.ts');
      z = Enemy.fromVanilla(3, s.px * 16, (s.gy + 1) * 16 - 200);
      if (z) { z.x = s.px * 16 - z.w / 2 + 8; z.y = (s.gy + 1) * 16 - 200 - z.h; g.entities.add(z, 'enemies'); }
    } else {
      g.player.x = s.px * 16 - g.player.w / 2 + 8;
      g.player.y = (s.gy + 1) * 16 - 200 - g.player.h;
      g.player.vx = 0; g.player.vy = 0;
    }
    const t = z ?? g.player;
    const wetOf = () => (z ? z.wet : g.player.inWater);
    let entered = -1;
    for (let k = 0; k < 120; k++) {
      g.fixedUpdate(1 / 60);
      if (wetOf() && entered < 0) { entered = k; break; }
    }
    return entered;
  }, { s: setup, npcMode });
};

const shoot = async (name, npcMode) => {
  const entered = await prepAndEnter(npcMode);
  console.log(`${name} 入水翻转 @${entered}`);
  for (const after of [3, 8, 15]) {
    // 泵到 entered+after（prep 已泵到 entered，再补 after-已泵数）
    await page.evaluate(({ npcMode, after }) => {
      const g = window.__swGame;
      void npcMode;
      for (let k = 0; k < 1; k++) g.fixedUpdate(1 / 60);
      void after;
    }, { npcMode, after });
    await new Promise((r) => setTimeout(r, 120));   // 等几帧渲染让波形缓冲呈现
    const file = `/tmp/water-${name}-${after}.png`;
    await page.screenshot({ path: file });
    console.log(`  +${after} -> ${file}`);
  }
};

await shoot('player', false);
await shoot('zombie', true);
await browser.close();
console.log('done');
