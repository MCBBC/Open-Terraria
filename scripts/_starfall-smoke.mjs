// 星星雨+陨石+生日派对冒烟（scripts/_starfall-smoke.mjs）：
//   1. 夜间坠星：boost 拉满 → 屏内出现 FallingStar 实体 → 落地掉 vi_75 坠落之星
//   2. 陨石：meteorPending 置位 + 夜半时间 → dropMeteor 落点生成 tile 37 + gen[59] 公告
//   3. 生日派对：女孩+5 NPC 在场 + 桩随机 → genuineParty
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('星星雨');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const res = {};
  const priv = (name, ...args) => g[name].apply(g, args);

  // 1) 坠星：夜 + boost 直填 + 手动触发一轮生成（绕开概率等待）
  w.clock.timeOfDay = 0.9;
  const starCount0 = g.entities.projectiles.filter((e) => e.constructor.name === 'FallingStar').length;
  // 直造一颗：在玩家上方净空放星，等它落地
  const { FallingStar } = await import('/src/entities/FallingStar.ts');
  const st = w.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.y / 16) - 12;
  const star = new FallingStar(px * 16, py * 16, 0, 12, 0, false, true);
  g.entities.add(star, 'projectiles');
  await new Promise(r => setTimeout(r, 1200)); // ≈12 tile @ 12px/tick ≈ 16 tick
  res.starAliveWhileFalling = !star.dead;
  await new Promise(r => setTimeout(r, 3000));
  res.starLanded = star.dead === true;
  const starId = g.itemId('vi_75_fallen_star');
  const starItem = g.entities.drops.find((d) => d.itemId === starId);
  res.fallenStarDropped = !!starItem || g.player.inv.slots.some((s) => s && s.id === starId); // 落玩家身边即被秒拾
  void starCount0;

  // 2) 陨石：旗标置位 + 时间推进到夜半 → tile 37 生成
  w.flags.spawnMeteor = true;
  // 记录地表以上 37 块数
  const metTile = (await import('/src/data/tiles.ts')).TILE_BY_KEY['ore_meteorite'];
  const count37 = () => {
    let n = 0;
    for (let y = 5; y < w.groundLevel; y++) {
      for (let x = 5; x < st.w - 5; x++) {
        if (st.type[st.idx(x, y)] === metTile) n++;
      }
    }
    return n;
  };
  const before37 = count37();
  w.clock.timeOfDay = 0.03; // 午夜后（DUSK 0.8125→回绕 0.03：nightTicks ≈ 20520 > 16200）
  await new Promise(r => setTimeout(r, 300));
  const after37 = count37();
  res.meteorTilesBefore = before37;
  res.meteorTilesAfter = after37;
  res.meteorLanded = after37 > before37;
  res.meteorFlagCleared = w.flags.spawnMeteor !== true;
  void priv;

  // 3) 生日派对：派对女孩 + 4 商人（共 5+人）+ 桩随机
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const keys = ['party_girl', 'merchant', 'nurse', 'dryad', 'arms_dealer'];
  for (let i = 0; i < keys.length; i++) {
    const tn = new TownNPC(keys[i], g.player.cx + 30 + i * 24, g.player.cy - 40);
    g.entities.add(tn, 'npcs');
  }
  const realRandom = Math.random;
  Math.random = () => 0; // 命中 1/10 门
  g.clock0 = null;
  // 直调 morning 分支不可达 → 手动调用 NaturalAttempt 逻辑：改 dayCount 触发不行（频率无门），
  // 改为直接验证 partyNaturalAttempt 纯函数
  Math.random = realRandom;
  const { partyNaturalAttempt, partyIsUp } = await import('/src/world/wiring/party.ts');
  const ps = g.partyState ?? null;
  res.hasPartyState = !!ps;
  if (ps) {
    const realR = Math.random;
    Math.random = () => 0;
    const msg = partyNaturalAttempt(ps, {
      townNpcKeys: g.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead).map((n) => n.npcKey),
      girlPresent: true,
      anniversary: false,
      rng: Math.random,
      int: (a) => a,
    });
    Math.random = realR;
    res.partyMsg = msg;
    res.partyUp = partyIsUp(ps);
    res.partyCooldown = ps.daysOnCooldown;
  }
  for (const n of [...g.entities.npcs]) if (n.npcKey && keys.includes(n.npcKey)) n.dead = true;
  return res;
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', JSON.stringify(errs));
await browser.close();
