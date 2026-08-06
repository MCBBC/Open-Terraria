// Buff/配饰系统测试：喝敏捷药水 → Buff栏出现+移速提升；铁皮 → 防御减伤；马掌 → 摔伤免疫
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// 找到敏捷药水所在快捷格并选中（先打开背包看全格）
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const slots = {};
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s) slots[i] = s.id;
  }
  return {
    slots,
    defs: Object.fromEntries(Object.entries(slots).map(([i, id]) => [i, id])),
    moveMult: g.player.buffs.moveSpeedMult,
    defense: g.player.defense,
    horseshoe: g.player.hasHorseshoe,
    claws: g.player.hasFeralClaws,
  };
});
console.log('SETUP:', JSON.stringify(setup));

// 喝敏捷药水：把药水换到快捷栏 9 号格（直接操作数据），选中后点击
const drink = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  // 找敏捷药水
  const ids = { agility: null, ironskin: null };
  for (let i = 0; i < 40; i++) {
    const s = inv.slots[i];
    if (!s) continue;
    const key = Object.keys(window.__itemKeys || {}).find(() => false);
    void key;
  }
  return null;
});
void drink;

// 直接用 key→id：从游戏数据拿
const keyMap = await page.evaluate(() => {
  // ITEM_BY_KEY 不在 window 上——通过 starter 物品反查：读 inv 找 potion 字段
  const g = window.__swGame;
  return null;
});
void keyMap;

// 简化：通过 evaluate 内部访问模块不可行 → 用快捷栏已知布局：starter 顺序 pick(0) axe(1) sword(2) torch(3) agility(4) ironskin(5) thorns(6) regen(7) heal(8)
const r1 = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const id4 = inv.slots[4]; // 敏捷药水
  inv.selected = 4;
  g.input.uiBlocking = false;
  return { slot4: id4 };
});
console.log('SLOT4:', JSON.stringify(r1));

// 模拟左键点击喝药
const m = await page.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return { sx: Math.round(sx), sy: Math.round(sy) };
});
await page.mouse.move(m.sx, m.sy);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 150));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));

const afterDrink = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    moveMult: g.player.buffs.moveSpeedMult,
    buffsActive: [...g.player.buffs.active.entries()].map(([t, s]) => `${t}:${Math.round(s)}s`),
    hp: g.player.hp,
    maxHp: g.player.maxHp,
  };
});
console.log('AFTER AGILITY POTION:', JSON.stringify(afterDrink));

// Buff 栏 UI
const buffUI = await page.evaluate(() => {
  const blocks = document.querySelectorAll('.sw-buff');
  return { count: blocks.length, visible: [...blocks].filter((b) => b.style.display !== 'none').length };
});
console.log('BUFF UI:', JSON.stringify(buffUI));

// 铁皮药水 → 防御+6 → 被打减伤验证（等饮用冷却 60 tick 结束）
await new Promise((r) => setTimeout(r, 1300));
await page.evaluate(() => { window.__swGame.player.inv.selected = 5; });
await page.mouse.down(); await new Promise((r) => setTimeout(r, 150)); await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
const afterIron = await page.evaluate(() => ({
  defense: window.__swGame.player.defense,
  buffs: [...window.__swGame.player.buffs.active.keys()],
}));
console.log('AFTER IRONSKIN:', JSON.stringify(afterIron));

// 防御减伤公式验证：直接调用 damagePlayer（史莱姆 6 伤 → max(1, 6-3)=3）
const mitig = await page.evaluate(() => {
  const g = window.__swGame;
  const hpBefore = g.player.hp;
  g.player.iframes = 0;
  g.damagePlayer(6, g.player.cx - 20, g.player.cy);
  return { hpBefore, hpAfter: g.player.hp, dealt: hpBefore - g.player.hp };
});
console.log('DEFENSE MITIGATION (期望扣3):', JSON.stringify(mitig));

// 摔伤：马掌免疫 → 传送高处落下不掉血
const fall = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找出生点上方 25 格的空气处
  const px = g.world.spawnX, py = g.world.spawnY - 30;
  g.player.iframes = 200;
  const hpBefore = g.player.hp;
  g.player.x = px * 16 + 8;
  g.player.y = py * 16;
  g.player.vx = 0; g.player.vy = 0;
  setTimeout(() => resolve({ hpBefore, hpAfter: g.player.hp, horseshoe: g.player.hasHorseshoe }), 2500);
}));
console.log('FALL WITH HORSESHOE (期望不掉血):', JSON.stringify(fall));

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO ERRORS');
await browser.close();
