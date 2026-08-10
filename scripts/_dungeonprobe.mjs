// 地牢刷怪验证：传送玩家进地牢内部 → 跑 tick → 统计出怪
// 模式1 downedSkeletron=false → 应只出地牢守卫(68)
// 模式2 downedSkeletron=true  → 应出常规池(31/294/295/296/32/34/70/71/72/-13/-14 变体)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1000));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const dX = g.world.dungeonX, dY = g.world.dungeonY || Math.floor(g.world.groundLevel);
  const isDW = (w) => w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99);
  // 找地牢内部落脚点：本人格有地牢墙 + 下方实心 + 上方 3 格净空
  let spot = null;
  outer:
  for (let dy = 45; dy < Math.floor(g.world.rockLevel) + 100 - dY; dy++) {
    for (let dx = -120; dx <= 120; dx++) {
      const x = dX + dx, y = dY + dy;
      if (x < 2 || y < 2 || x > st.w - 3 || y > st.h - 3) continue;
      if (!isDW(st.wall[st.idx(x, y)])) continue;
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        spot = { x, y };
        break outer;
      }
    }
  }
  if (!spot) return { spot: 0, dX, dY };

  function runTicks(n) {
    for (let i = 0; i < n; i++) {
      g.fixedUpdate(1 / 60);
      if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    }
  }
  function countDungeon() {
    const ids = [68, 31, 294, 295, 296, 32, 34, 70, 71, 72];
    const found = [];
    for (const e of g.entities.enemies) {
      if (ids.includes(e.vanillaId)) found.push(e.vanillaId);
    }
    return found;
  }

  // 模式1：未杀骷髅王 → 守卫
  g.player.x = (spot.x + 0.5) * 16 - g.player.w / 2;
  g.player.y = (spot.y - 3) * 16;
  g.world.flags.downedSkeletron = false;
  for (const e of g.entities.enemies) e.dead = true;
  g.entities.enemies.length = 0;
  runTicks(1800); // 30s：spawnRate=10 时高频
  const guardian = countDungeon();
  const scene1 = { zoneDungeon: g.scene?.zoneDungeon, dungeonY: g.world.dungeonY, spot };

  // 模式2：杀过骷髅王 → 常规池
  for (const e of g.entities.enemies) e.dead = true;
  g.entities.enemies.length = 0;
  g.world.flags.downedSkeletron = true;
  runTicks(3600); // 60s 常规速率
  const normal = countDungeon();

  return { spot: 1, dX, dY, scene1, guardian, normal };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
