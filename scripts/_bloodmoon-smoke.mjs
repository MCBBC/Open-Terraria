// 血月系统冒烟（scripts/_bloodmoon-smoke.mjs）：
//   1. BloodMoon 滤镜激活（MonolithFilters.state('BloodMoon').active，自然血月）
//   2. 小动物腐化（血月中兔 → 腐化兔 47 敌怪）
//   3. 血泪 4271：夜用 → bloodMoon=true + 新月拨 5 + misc[8] 公告；血月中再用 → 无效
//   4. 钓鱼威力乘区（满月夜 ×1.1×0.8 前半夜…抽测 multiplier 纯函数在页面导入）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
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
  await page.keyboard.type('血月测试');
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
  // 入夜 + 放一只兔（小动物）在玩家旁
  w.clock.timeOfDay = 0.9; // 夜（19:30 后）
  await new Promise(r => setTimeout(r, 300));
  w.clock.bloodMoon = true;
  await new Promise(r => setTimeout(r, 400));
  // 1) 滤镜激活
  const st = g.renderer.monoFilters.state('BloodMoon');
  res.filterActive = !!st?.active;
  res.filterOpacity = st ? Math.round(st.opacity * 100) / 100 : null;
  // 2) 腐化变换：直造 NPC 46（兔）敌怪实例 → 一个 tick 内 transformTo(47)
  const bunny = (await import('/src/entities/Enemy.ts')).Enemy.fromVanilla(46, g.player.cx, g.player.y - 60); // 头顶净空防嵌入拒绝
  g.entities.add(bunny, 'enemies');
  await new Promise(r => setTimeout(r, 200)); // 数个 fixed tick
  res.bunnyTransformed = bunny.vanillaId === 47;
  res.bunnyDead = bunny.dead;
  res.bunnyHp = bunny.hp;
  bunny.dead = true;
  // 3) 血泪：血月中应无效；清掉血月后在夜用 → 生效
  const inv = g.player.inv;
  const tearId = g.itemId('vi_4271_BloodMoonStarter');
  res.tearIdValid = typeof tearId === 'number' && tearId > 0;
  inv.slots[inv.selected] = { id: tearId, stack: 3 };
  g.player.useTime = 0;
  g.input.mouseDown = true;
  g.updateUse(1 / 60);
  g.input.mouseDown = false;
  res.tearIgnoredDuringBloodMoon = inv.slots[inv.selected]?.stack === 3;
  w.clock.bloodMoon = false;
  w.clock.moonPhase = 4; // 新月 → 应拨 5
  await new Promise(r => setTimeout(r, 150));
  g.player.useTime = 0;
  g.input.mouseDown = true;
  // 中间态采样：为何未生效
  res.dbg = {
    heldKey: g.player.inv.heldDef()?.key,
    isDay: w.clock.isDay,
    tod: w.clock.timeOfDay,
    bm: w.clock.bloodMoon,
    useTime: g.player.useTime,
    mouseDown: g.input.mouseDown,
    uiBlocking: g.input.uiBlocking,
    fullMap: g.renderer.fullMap.open,
  };
  g.updateUse(1 / 60);
  g.input.mouseDown = false;
  await new Promise(r => setTimeout(r, 150));
  res.dbgAfter = { stack: inv.slots[inv.selected]?.stack, bm: w.clock.bloodMoon, phase: w.clock.moonPhase, useTime: g.player.useTime };
  res.tearConsumed = inv.slots[inv.selected] == null || inv.slots[inv.selected]?.stack === 2;
  res.tearBloodMoon = w.clock.bloodMoon;
  res.tearPhaseBumped = w.clock.moonPhase === 5;
  // 4) 钓鱼乘区纯函数
  const { fishingPowerMultiplier } = await import('/src/data/vanillaFishing.ts');
  res.multFullMoonNight = fishingPowerMultiplier({ raining: false, cloudBGAlpha: 0, dayTime: false, time: 10000, moonPhase: 0, bloodMoon: false });
  w.clock.bloodMoon = false;
  return res;
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', JSON.stringify(errs));
await browser.close();
