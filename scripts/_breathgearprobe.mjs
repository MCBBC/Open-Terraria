// 呼吸族装备入库冒烟：9 件新物品 __swItems 可解析 + dev 全道具入包 + 装备生效
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 3000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const KEYS = ['vi_250_fish_bowl', 'vi_4275_gold_goldfish_bowl', 'vi_268_diving_helmet',
  'vi_394_diving_gear', 'vi_1860_jellyfish_diving_gear', 'vi_1861_arctic_diving_gear',
  'vi_497_neptune_s_shell', 'vi_861_moon_shell', 'vi_3110_celestial_shell'];

// 1) __swItems 全部可解析
const gear = await page.evaluate((keys) => {
  const g = window.__swGame;
  const ids = keys.map((k) => window.__swItems[k]);
  return { ids, slotCount: g.player.inv.slots.filter(Boolean).length };
}, KEYS);
check('9 件呼吸族物品 __swItems 全可解析', gear.ids.every((id) => typeof id === 'number'), JSON.stringify(gear.ids));

// 2) 装备链：268 头盔 → breathCDMax 42；497 配饰 → merman 免淹
const equip = await page.evaluate((ids) => {
  const p = window.__swGame.player;
  const [bowl250, , helm268, , , , shell497] = ids;
  const out = { base: p.breathCDMax };
  p.inv.armor[0] = { id: helm268, stack: 1 };
  out.helm = p.breathCDMax;
  p.inv.armor[3] = { id: shell497, stack: 1 };
  out.merman = p.equipStats.merman;
  // 鱼缸替换头盔 → 陆上 breathCDMax 应回 7 且陆上开始淹
  p.inv.armor[0] = { id: bowl250, stack: 1 };
  out.bowlCDMax = p.breathCDMax;
  out.arctic = p.equipStats.arcticDivingGear === false; // 未穿 1861
  p.inv.armor[0] = null; p.inv.armor[3] = null;
  return out;
}, gear.ids);
check('268 潜水头盔 → breathCDMax 7→42', equip.base === 7 && equip.helm === 42, JSON.stringify(equip));
check('497 海神贝壳 → accMerman', equip.merman === true, JSON.stringify(equip));
check('鱼缸 250 不含 divingHelm（breathCDMax 回 7）', equip.bowlCDMax === 7, JSON.stringify(equip));

// 3) 鱼缸 250 陆上恒淹
const bowl = await page.evaluate((ids) => {
  const g = window.__swGame;
  const p = g.player;
  p.inv.armor[0] = { id: ids[0], stack: 1 };
  const b0 = p.breath;
  return new Promise((res) => setTimeout(() => res({ b0, b1: p.breath }), 1500));
}, gear.ids);
check('鱼缸 250 陆上 1.5s breath 递减', bowl.b1 < bowl.b0, JSON.stringify(bowl));
await page.evaluate(() => { window.__swGame.player.inv.armor[0] = null; });

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
