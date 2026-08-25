// _prism-mana-probe:终极棱镜魔力不足链路实测
// 原版语义(Player.cs CheckMana :53215 + AI_075 633 :67656-67682):
//   ①空蓝不断链(ManaV2 :53241-53256 statMana=0+slowMagicUse=true 照常施法)
//   ②slowMagicUse 效果:632 束淡化(1458 厚×0.7/透明×0.25)+免疫窗 5→12t(:14058)
//   ③CheckMana 入口复位(:53217)——蓝回够下一节拍即还原(曾缺=永久淡化)
//   ④魔力花自动喝蓝(:53226-53239)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const log = {};
  const key = Object.keys(window.__swItems).find((k) => /^vi_3541_/.test(k));
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0;
  p.useTime = 0;
  g.input.mouseX = g.renderer.canvas.width / 2 + 120;
  g.input.mouseY = g.renderer.canvas.height / 2 - 60;
  const sample = () => {
    const pr = g.entities.projectiles.find((q) => q.constructor.name === 'PrismProj' || q.projId === 633);
    const prong = g.entities.projectiles.find((q) => q.projId === 632);
    return {
      alive: !!pr && !pr.dead,
      charge: pr ? Math.round(pr.charge) : null,
      slow: p.slowMagicUse === true,
      mana: Math.round(p.mana),
      prongFade: prong ? prong.slowFade : null,
    };
  };
  // 阶段A:满蓝正常充能 0.2s(首拍扣魔在 tick30=0.5s,采样点应在扣魔前)
  p.baseMaxMana = 400;   // maxMana 是 getter(baseMaxMana 派生)——探针角色默认 20 续不起棱镜
  p.mana = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  await new Promise((r) => setTimeout(r, 200));
  log.A_full = sample();
  // 阶段B:清空魔力 → 空蓝续充 1.5s(应不断链+slowMagicUse=true+mana 贴地)
  p.mana = 0;
  await new Promise((r) => setTimeout(r, 1500));
  log.B_empty = sample();
  // 阶段C:回蓝 → 下一节拍(充能期 cadence 5t)应复位 slowMagicUse=false(曾缺=永久 true)
  p.mana = 400;
  await new Promise((r) => setTimeout(r, 400));
  log.C_refill = sample();
  g.input.mouseDown = false; g.input.mouseHeld = false;
  return log;
});
console.log('实测:', JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
check('A 满蓝:slowMagicUse=false 正常充能', out.A_full?.alive && out.A_full?.slow === false, JSON.stringify(out.A_full));
check('B 空蓝:不断链+slowMagicUse=true+mana 贴地(ManaV2,涓流回蓝≤2)', out.B_empty?.alive && out.B_empty?.slow === true && out.B_empty?.mana <= 2, JSON.stringify(out.B_empty));
check('B 空蓝:光棱 slowFade 生效(束淡化)', out.B_empty?.prongFade === true);
check('C 回蓝:下一节拍复位 slowMagicUse=false(束还原)', out.C_refill?.alive && out.C_refill?.slow === false, JSON.stringify(out.C_refill));
console.log(`\n${pass} pass / ${fail} fail`);
if (errors.length) console.log('[pageerror]', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
