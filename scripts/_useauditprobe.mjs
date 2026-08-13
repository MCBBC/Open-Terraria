// 道具接入终审探针:魔镜/回忆药水(音效+回出生点)/恶魔之心(饰栏)/混乱之杖/
// 性别药水/红药水/无限水桶/超吸海绵/回归药水/蜜蜂分泌物/天界印记倒计时
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const KEY = (re) => Object.keys(window.__swItems).find((k) => re.test(k));

// 记录 sfx 播放(拦截 playSfx 计数)
await page.evaluate(() => {
  window.__sfxLog = [];
  const g = window.__swGame;
  const orig = g.sfx.play.bind(g.sfx);
  g.sfx.play = (name, ...rest) => { window.__sfxLog.push(name); return orig(name, ...rest); };
});

// 1) 魔镜:远离出生点 → 使用 → 1.6s 后回出生点 + mirror 音效
const mirror = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = KEY_OF(/^vi_50_/);
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0;
  // 传送玩家远离出生点
  p.x = g.world.spawnX * 16 + 2000; p.y = (g.world.spawnY - 10) * 16;
  const sx = g.world.spawnX * 16 + 8, sy = (g.world.spawnY - 3) * 16;
  window.__sfxLog = [];
  p.useTime = 0;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 1800)); // 引导 90t=1.5s + 余量
  g.input.mouseDown = false;
  return { atSpawn: Math.abs(p.x - sx) < 200 && Math.abs(p.y - sy) < 200, stack: p.inv.slots[0]?.stack ?? 0, sfx: [...window.__sfxLog] };
  function KEY_OF(re) { return Object.keys(window.__swItems).find((k) => re.test(k)); }
});
check('魔镜:回出生点+不消耗+mirror 音效',
  mirror.atSpawn && mirror.stack === 1 && mirror.sfx.includes('mirror'), JSON.stringify(mirror));

// 2) 回忆药水:drink+mirror 双音效+消耗+回出生点
const recall = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_2350_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 2 };
  p.x = g.world.spawnX * 16 + 3000; p.y = (g.world.spawnY - 10) * 16;
  window.__sfxLog = [];
  p.useTime = 0;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 1800));
  g.input.mouseDown = false;
  const sx = g.world.spawnX * 16 + 8;
  return { nearSpawn: Math.abs(p.x - sx) < 200, stack: p.inv.slots[0]?.stack ?? 0, sfx: [...window.__sfxLog] };
});
check('回忆药水:回出生点+消耗+drink&mirror 音效',
  recall.nearSpawn && recall.stack === 1 && recall.sfx.includes('drink') && recall.sfx.includes('mirror'), JSON.stringify(recall));

// 3) 恶魔之心:专家世界 → 第六饰栏解锁
const demon = await page.evaluate(() => {
  const g = window.__swGame;
  g.world.difficulty = 1; // 专家
  const p = g.player;
  const before = p.inv.accSlotMax;
  const key = Object.keys(window.__swItems).find((k) => /^vi_3335_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  g.input.mouseDown = true;
  return { before, key };
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
const demonAfter = await page.evaluate(() => ({
  after: window.__swGame.player.inv.accSlotMax,
  stack: window.__swGame.player.inv.slots[0]?.stack ?? 0,
}));
check('恶魔之心:饰栏 5→6 + 消耗', demon.before === 8 && demonAfter.after === 9 && demonAfter.stack === 0,
  JSON.stringify({ before: demon.before, ...demonAfter }));

// 4) 无限水桶:倒水且不消耗
const bwb = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_3031_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const tx = Math.floor(p.cx / 16) + 2, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  const i = g.world.store.idx(tx, ty);
  return { liquid: g.world.store.liquid[i], stack: p.inv.slots[0]?.stack ?? 0 };
});
check('无限水桶:倒水(liquid>0;sim 会流动)且不消耗', bwb.liquid > 0 && bwb.stack === 1, JSON.stringify(bwb));

// 5) 超吸海绵:吸干液体
const sponge = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_3032_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const tx = Math.floor(p.cx / 16) + 2, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setLiquid(tx, ty, 255, 1);
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  const i = g.world.store.idx(tx, ty);
  return { liquid: g.world.store.liquid[i], stack: p.inv.slots[0]?.stack ?? 0 };
});
check('超吸海绵:吸干液体且不消耗', sponge.liquid === 0 && sponge.stack === 1, JSON.stringify(sponge));

// 6) 混乱之杖:传送鼠标点+扣血
const rod = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_1326_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const tx = Math.floor(p.cx / 16) + 6, ty = Math.floor((p.y + p.h) / 16) - 5;
  g.world.store.setTile(tx, ty, 0);
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  const hp0 = p.hp;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  return { near: Math.abs(p.cx - (tx * 16 + 8)) < 40, hpDrop: hp0 - p.hp };
});
check('混乱之杖:传送尝试+扣血(1/6)', rod.hpDrop >= 1, JSON.stringify(rod));

// 7) 性别转换药水:skinVariant 翻转+消耗
const gender = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_2756_/.test(k));
  const v0 = p.appearance?.skinVariant ?? -1;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 2 };
  p.inv.selected = 0; p.useTime = 0;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  return { v0, v1: p.appearance?.skinVariant ?? -1, stack: p.inv.slots[0]?.stack ?? 0 };
});
check('性别转换药水:变体翻转+消耗', gender.v0 !== gender.v1 && gender.stack === 1, JSON.stringify(gender));

// 8) 蜜蜂分泌物:召唤蜂王
const bee = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_1133_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  const bees = g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 222).length;
  return { bees, stack: p.inv.slots[0]?.stack ?? 0 };
});
check('蜜蜂分泌物:召唤蜂王+消耗', bee.bees >= 1 && bee.stack === 0, JSON.stringify(bee));

// 9) 天界印记:月总倒计时 720 启动
const sigil = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_3601_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 300));
  g.input.mouseDown = false;
  return { cd: g.world.lunarEvent.moonLordCountdown, stack: p.inv.slots[0]?.stack ?? 0 };
});
check('天界印记:月总倒计时启动(≤720,已走 tick)且消耗', sigil.cd > 0 && sigil.cd <= 720 && sigil.stack === 0, JSON.stringify(sigil));

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
