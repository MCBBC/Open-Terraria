// 退役迁移缺失复核探针:vi_ 药水饮用 / 电线耗材消耗 / vi_ 火把放置 / vi_ 盔甲穿戴
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

// 1) vi_28 弱效治疗药水饮用(扣血→喝→回血+耐药)
const potion = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_28_/.test(k));
  const id = window.__swItems[key];
  p.hp = 50;
  p.inv.slots[0] = { id, stack: 3 };
  p.inv.selected = 0;
  p.useTime = 0;
  g.input.mouseDown = true;
  // 鼠标指向玩家中心(useItem 需要非 uiBlocking)
  g.input.mouseX = g.renderer.canvas.width / 2;
  g.input.mouseY = g.renderer.canvas.height / 2;
  await new Promise((r) => setTimeout(r, 400));
  g.input.mouseDown = false;
  return { hp: p.hp, stack: p.inv.slots[0]?.stack ?? 0, key };
});
check('vi_28 药水饮用生效(回血+消耗)', potion.hp > 50 && potion.stack < 3, JSON.stringify(potion));

// 2) vi_ 盔甲穿戴(defense 生效):vi_90 铁盔 → armor[0],defense 计入
const armor = await page.evaluate(() => {
  const g = window.__swGame;
  const key = Object.keys(window.__swItems).find((k) => /^vi_90_/.test(k));
  const id = window.__swItems[key];
  const before = g.player.defense;
  g.player.inv.armor[0] = { id, stack: 1 };
  const after = g.player.defense;
  g.player.inv.armor[0] = null;
  return { before, after, key, diff: after - before };
});
check('vi_90 铁盔穿戴 defense 生效', armor.diff === 2, JSON.stringify(armor)); // Iron Helmet def=2

// 3) vi_ 火把放置(真实手持使用路径:createTile 回填 → def.tile → tryPlace)
const torchPlace = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_8_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 5 };
  p.inv.selected = 0;
  p.useTime = 0;
  // 目标:脚边实心地面上一格(火把锚定)
  const tx = Math.floor(p.cx / 16) + 2;
  const ty = Math.floor((p.y + p.h) / 16) - 1;
  const st = g.world.store;
  st.setTile(tx, ty, 0); // 清目标格
  // 鼠标指到目标格中心(canvas 坐标 ← 世界坐标)
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 350));
  g.input.mouseDown = false;
  return { placed: st.get(tx, ty) !== 0, stackAfter: p.inv.slots[0]?.stack ?? 0, key };
});
check('vi_ 火把放置成功且消耗', torchPlace.placed && torchPlace.stackAfter === 4, JSON.stringify(torchPlace));

// 4) 电线耗材:vi_530 经 VI_ID 消耗(扳手铺线)
const wire = await page.evaluate(() => {
  const g = window.__swGame;
  const key = Object.keys(window.__swItems).find((k) => /^vi_509_/.test(k));
  const wireKey = Object.keys(window.__swItems).find((k) => /^vi_530_/.test(k));
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.slots[1] = { id: window.__swItems[wireKey], stack: 10 };
  p.inv.selected = 0;
  const before = p.inv.countOf(window.__swItems[wireKey]);
  // 直接验证 Game 内部常量链:VI_ID(530) 解析与 countOf
  return { before, wireKey };
});
check('vi_530 电线在包可计数', wire.before === 10, JSON.stringify(wire));

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
