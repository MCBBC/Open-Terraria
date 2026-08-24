// 信息显示列(DrawInfoAccs)实况探针:入包五件信息饰品 → 门禁点亮 → 行文本/图标
// 绘制断言 + 右上截图。覆盖:时间(表)/深度计/罗盘/DPS 计/秒表 五行。
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
  await page.keyboard.type('信息列');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
// 进第一个存档(角色/世界两级选择器同构)
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

// 基线:空背包时门禁全零、无行
const base = await page.evaluate(() => {
  const g = window.__swGame;
  const gates = g.player.equipStats.infoAccs;
  return {
    watch: gates.accWatch, depth: gates.accDepthMeter,
    any: Object.values(gates).some((v) => (typeof v === 'number' ? v > 0 : v === true)),
    ctxNull: g.renderer.infoAccCtx === null || g.renderer.infoAccCtx === undefined,
  };
});
check('基线:未带饰品门禁全零', !base.any, JSON.stringify(base));

// 入包五件(信息族放背包即生效——UpdateEquips 全格扫)
await page.evaluate(() => {
  const g = window.__swGame;
  const keys = ['vi_17_gold_watch', 'vi_18_depth_meter', 'vi_393_compass', 'vi_3119_dps_meter', 'vi_3099_stopwatch'];
  keys.forEach((k, i) => { g.player.inv.slots[40 + i] = { id: window.__swItems[k], stack: 1 }; });
});
await new Promise((r) => setTimeout(r, 1200));
const after = await page.evaluate(() => {
  const g = window.__swGame;
  const gt = g.player.equipStats.infoAccs;
  const ctx = g.renderer.infoAccCtx;
  const rows = (g.renderer.infoAccs?.state?.rows ?? []).map((r) => ({ icon: r.icon, text: r.text }));
  return {
    watch: gt.accWatch, depth: gt.accDepthMeter, compass: gt.accCompass,
    dps: gt.accDreamCatcher, speed: gt.accStopwatch,
    ctxTime: ctx ? Math.round(ctx.mainTime) : -1,
    rows,
  };
});
check('门禁点亮:表=3 深度=1 罗盘=1 DPS=真 秒表=真',
  after.watch === 3 && after.depth === 1 && after.compass === 1 && after.dps === true && after.speed === true,
  JSON.stringify(after).slice(0, 160));
check('infoAccCtx 已注入(mainTime>0)', after.ctxTime > 0, `mainTime=${after.ctxTime}`);
const texts = after.rows.map((r) => r.text).join(' | ');
console.log('  行文本:', texts);
check('≥5 行(时/深/罗/DPS/速)', after.rows.length >= 5, `n=${after.rows.length}`);
check('时间行含 AM/PM(或上午/下午)', /(AM|PM|上午|下午)/.test(texts), texts.slice(0, 40));
check('深度行含层名+英尺', /(Layer|层|Surface|Underground|英尺|ft)/.test(texts), '');
check('DPS 行存在(icon12;0 值 = NoDPS「无」)', after.rows.some((r) => r.icon === 12), '');
check('罗盘行存在(icon3;东西向英尺)', after.rows.some((r) => r.icon === 3), '');

// 截图右上区域供目检(图标列+对角文本)
await page.screenshot({ path: '/tmp/infoaccs-shot.png', clip: { x: 900, y: 0, width: 380, height: 320 } });

// 几何:+261 偏移生效 → 首行图标在小地图框之下(Main.cs:46675 mapStyle==1 门)
const geo = await page.evaluate(() => {
  const g = window.__swGame;
  const rects = g.renderer.infoAccs.state.iconRects;
  const mm = g.renderer.minimapRect;
  return { firstY: rects[0]?.y ?? -1, mmBottom: mm ? mm.y + mm.h : -1 };
});
check('首行图标在小地图框之下(+261)', geo.firstY > geo.mmBottom, JSON.stringify(geo));

// DPS 端到端:addDPS 累计 → ctx.dps > 0 → 行文本出数值(停手 3s 后回「无」)
const dps = await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.addDPS(50); g.player.addDPS(50);
  await new Promise((r) => setTimeout(r, 300));
  const row = g.renderer.infoAccs.state.rows.find((r) => r.icon === 12);
  return { ctxDps: g.renderer.infoAccCtx.dps, text: row?.text ?? '' };
});
check('DPS 行累计显示(100 伤 → ≥50/s)', dps.ctxDps >= 50 && /(\d+ ?DPS|每秒\s*\d+\s*伤害)/.test(dps.text), JSON.stringify(dps));

// hideInfo 隐藏语义:全置真 → 行清空(背包关时隐藏行不画图标不画文本)
const hidden = await page.evaluate(async () => {
  const g = window.__swGame;
  for (let i = 0; i < 13; i++) g.player.hideInfo[i] = true;
  await new Promise((r) => setTimeout(r, 400));
  const n = g.renderer.infoAccs.state.rows.length;
  for (let i = 0; i < 13; i++) g.player.hideInfo[i] = false;
  return n;
});
check('hideInfo 全隐藏 → 0 行(背包关)', hidden === 0, `n=${hidden}`);

// canShow 门:NPC 对话/开箱时不画(Main.cs:3099-3110)
const canShow = await page.evaluate(() => {
  const layer = window.__swGame.renderer.infoAccs;
  return { talk: layer.canShow(true, false, false), chest: layer.canShow(false, true, false), ok: layer.canShow(false, false, false) };
});
check('canShow 门:NPC 对话/开箱抑制', !canShow.talk && !canShow.chest && canShow.ok, JSON.stringify(canShow));

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
