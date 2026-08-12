// 依赖子系统冒烟（scripts/_subsys-smoke.mjs）：
//   1. 月相商店分档：骷髅商 phase0 vs phase4 专柜差异 + 树妖盆栽 + 画家月相画
//   2. 自然 Boss 召唤：人造入夜 → spawnEyePending 概率门（强制条件 + 桩随机）
//   3. 血月钓鱼 682/618 收竿（reelBobber 直调）
//   4. drunkWorld 黎明翻转 + seedFlags 持久化链
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
  await page.keyboard.type('子系统测试');
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

  // 1) 月相商店：骷髅商 phase0 vs phase4
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const skel = new TownNPC('skeleton_merchant', g.player.cx, g.player.cy);
  w.clock.moonPhase = 0;
  let stock0 = priv('shopStockFor', skel).map((e) => e[0]);
  w.clock.moonPhase = 4;
  let stock4 = priv('shopStockFor', skel).map((e) => e[0]);
  res.skelP0Has = { boomerang: stock0.includes(284), aglet: stock0.includes(285) === false, magicLantern: false };
  res.skelP4Has = { aglet: stock4.includes(285), boomerang: stock4.includes(284) === false };
  w.clock.moonPhase = 0; w.clock.isDay = false; Object.defineProperty(w.clock, 'isDay', { get: () => false, configurable: true });
  stock0 = priv('shopStockFor', skel).map((e) => e[0]);
  res.skelFullMoonNightLantern = stock0.includes(3043);
  // 树妖盆栽（phase0 → 4430 组）
  const dryad = new TownNPC('dryad', g.player.cx, g.player.cy);
  w.clock.moonPhase = 0;
  const dry0 = priv('shopStockFor', dryad).map((e) => e[0]);
  w.clock.moonPhase = 6;
  const dry6 = priv('shopStockFor', dryad).map((e) => e[0]);
  res.dryadP0Pot = dry0.includes(4430);
  res.dryadP6Pot = dry6.includes(4439);
  res.dryadP0NoP6 = !dry0.includes(4439);
  // 画家月相画（phase0-1 → 1481）
  const painter = new TownNPC('painter', g.player.cx, g.player.cy);
  w.clock.moonPhase = 1;
  const paint1 = priv('shopStockFor', painter).map((e) => e[0]);
  w.clock.moonPhase = 5;
  const paint5 = priv('shopStockFor', painter).map((e) => e[0]);
  res.painterP1 = paint1.includes(1481);
  res.painterP5 = paint5.includes(1483) && !paint5.includes(1481);

  // 2) 自然 Boss：满足条件人造入夜（townCount>=4 造 4 个 + hp/def 拉满 + 桩随机命中）
  w.clock.moonPhase = 2;
  for (let i = 0; i < 4; i++) g.entities.add(new TownNPC('merchant', g.player.cx + i * 40, g.player.cy - 80), 'npcs');
  g.player.baseMaxHp = 400; g.player.hp = 400;
  const realRand = Math.random;
  Math.random = () => 0; // 命中 1/3 与 1/10
  w.clock.timeOfDay = 0.9; // 入夜穿越（_lastClockT 由真实 tick 保存的旧昼值 → crossed 成立）
  await new Promise(r => setTimeout(r, 60)); // 让一个 fixed tick 在桩随机下跑
  Math.random = realRand;
  res.eocRolled = g.spawnEyePending === true || g.spawnHardBossPending > 0; // 满足全部门+桩随机→其一必中
  g.spawnEyePending = false; g.spawnHardBossPending = 0;
  for (const n of [...g.entities.npcs]) if (n.npcKey === 'merchant') n.dead = true;

  // 3) 血月钓鱼 682（直调 reelBobber）与 618 偏移
  const { Bobber } = await import('/src/entities/Bobber.ts');
  const bob = new Bobber(g.player.cx, g.player.cy, 0, 0, 20, 0, 10, () => g.player);
  bob.floating = true; bob.biteT = 10; bob.catchEnemy = 682;
  priv('reelBobber', bob);
  res.slime682Flag = w.flags.unlockedSlimeRedSpawn === true;
  res.slime682Spawned = g.entities.npcs.some((n) => n.npcKey === 'town_slime_red' && !n.dead);
  const bob2 = new Bobber(g.player.cx, g.player.cy, 0, 0, 20, 0, 10, () => g.player);
  bob2.floating = true; bob2.biteT = 10; bob2.catchEnemy = 618;
  priv('reelBobber', bob2);
  const nautilus = g.entities.enemies.find((e) => e.vanillaId === 618 && !e.dead);
  res.nautilusSpawned = !!nautilus;

  // 4) drunk 黎明翻转（timeOfDay 连续推进跨越 DAWN——不跨午夜数字跳变）
  w.seedFlags = { drunkWorld: true };
  w.clock.timeOfDay = 0.18;
  await new Promise(r => setTimeout(r, 400)); // 自然推进越过 0.1875 DAWN
  res.drunkFlipped = w.crimson === true; // 新世界默认 false → 翻一次
  w.seedFlags = {};
  return res;
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', JSON.stringify(errs));
await browser.close();
