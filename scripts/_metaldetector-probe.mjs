// 金属探测器(Metal Detector 3102)实况探针:玩家旁摆 叶绿矿+生命水晶+火把 场景,
// 断言宝藏行(icon 10)显示 叶绿矿(优先级 700 > 550,wiki 说法;SceneMetrics.UpdateOreFinder
// 1:1)——实报 bug(叶绿矿旁显示生命水晶,根因=火把内部12 撞 sheet12 生命水晶幻影)
// 的用户视角复现+修复验证。三场景:A 并存→叶绿矿 / B 去叶绿→生命水晶 / C 只剩火把→
// 不再出「生命水晶」(旧 build 此处必现幻影)。截图右上信息列。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('探测器');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 入包金属探测器(信息族放背包即生效)
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[40] = { id: window.__swItems['vi_3102_metal_detector'], stack: 1 };
});
await new Promise((r) => setTimeout(r, 1000));
const gate = await page.evaluate(() => window.__swGame.player.equipStats.infoAccs.accOreFinder);
check('门禁点亮 accOreFinder', gate === true, `gate=${gate}`);

// ---- 场景 A:叶绿矿(+6,+1) + 生命水晶(-2,0) + 火把两支贴身 ----
const sceneA = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const CHLORO = TILE_BY_KEY['ore_chlorophyte'], HEART = TILE_BY_KEY['crystal_heart'], TORCH = TILE_BY_KEY['torch'];
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  st.setTileSilent(px + 6, py + 1, CHLORO, 0, 0);
  st.setTileSilent(px - 2, py, HEART, 0, 0);
  st.setTileSilent(px + 1, py - 1, TORCH, 0, 0);
  st.setTileSilent(px - 1, py + 1, TORCH, 0, 0);
  await new Promise((r) => setTimeout(r, 1500));   // 等场景重扫(15t 周期)
  const ctx = g.renderer.infoAccCtx, sc = g.renderer.scene;
  const row = (g.renderer.infoAccs?.state?.rows ?? []).find((r) => r.icon === 10);
  return {
    px, py, oreText: ctx?.oreText ?? null, rowText: row?.text ?? '',
    sheet: sc?.bestOreSheet ?? -1, bx: sc?.bestOreX ?? -1, by: sc?.bestOreY ?? -1,
    expect: { cx: px + 6, cy: py + 1 },
  };
});
check('A:宝藏行文本=叶绿矿', /叶绿/.test(sceneA.oreText ?? ''), JSON.stringify(sceneA).slice(0, 200));
check('A:bestOreSheet=211(叶绿 sheet)', sceneA.sheet === 211, `sheet=${sceneA.sheet}`);
check('A:bestOre 位=叶绿矿格(优先级胜距离)', sceneA.bx === sceneA.expect.cx && sceneA.by === sceneA.expect.cy,
  `got=(${sceneA.bx},${sceneA.by}) want=(${sceneA.expect.cx},${sceneA.expect.cy})`);
await page.screenshot({ path: '/tmp/metaldetector-A-chlorophyte.png', clip: { x: 900, y: 0, width: 380, height: 500 } });

// ---- 场景 B:挖掉叶绿矿 → 应显 生命水晶 ----
const sceneB = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  st.setTileSilent(px + 6, py + 1, 0, 0, 0);
  await new Promise((r) => setTimeout(r, 1500));
  const ctx = g.renderer.infoAccCtx, sc = g.renderer.scene;
  return { oreText: ctx?.oreText ?? null, sheet: sc?.bestOreSheet ?? -1, bx: sc?.bestOreX ?? -1, by: sc?.bestOreY ?? -1,
    expect: { hx: px - 2, hy: py } };
});
check('B:宝藏行文本=生命水晶', /生命水晶/.test(sceneB.oreText ?? ''), JSON.stringify(sceneB).slice(0, 200));
check('B:bestOre 位=生命水晶格', sceneB.bx === sceneB.expect.hx && sceneB.by === sceneB.expect.hy,
  `got=(${sceneB.bx},${sceneB.by}) want=(${sceneB.expect.hx},${sceneB.expect.hy})`);

// ---- 场景 C:挖掉生命水晶 → 只剩火把/天然矿:不得再报「生命水晶」 ----
// (旧 build:火把内部12 撞 sheet12 → 优先级 550 幻影,本场景必现「生命水晶」)
const sceneC = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  st.setTileSilent(px - 2, py, 0, 0, 0);
  await new Promise((r) => setTimeout(r, 1500));
  const ctx = g.renderer.infoAccCtx, sc = g.renderer.scene;
  const row = (g.renderer.infoAccs?.state?.rows ?? []).find((r) => r.icon === 10);
  return { oreText: ctx?.oreText ?? null, sheet: sc?.bestOreSheet ?? -1, rowText: row?.text ?? '', grayed: row?.grayed };
});
check('C:不再报「生命水晶」(火把幻影清除)', !/生命水晶/.test(sceneC.oreText ?? '') && sceneC.sheet !== 12,
  JSON.stringify(sceneC).slice(0, 200));
check('C:火把(sheet4)本身不可探', sceneC.sheet !== 4, `sheet=${sceneC.sheet}`);
await page.screenshot({ path: '/tmp/metaldetector-C-no-crystal.png', clip: { x: 900, y: 0, width: 380, height: 500 } });

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
