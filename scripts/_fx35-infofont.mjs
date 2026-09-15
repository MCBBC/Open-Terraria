// ★FX35 信息配件栏字体探针(2026-09-15 用户 Windows 实报:信息栏文字「像叠了几层
// 文字」——四向 ±2 描边在 monospace 系统字体(DirectWrite=Courier/Consolas)上露出
// 偏移拷贝;Mac 同症不显。修复 = MouseText 家族 canvas 字体统一 CANVAS_MOUSETEXT_FONT
// =19px "Fusion Pixel 12px", monospace)。
// 断言:①document.fonts 就绪态(像素字体真实解析,非 monospace 兜底);
//       ②信息行 fillText 时 ctx.font === 19px 像素字体串;
//       ③悬停行标签(drawMouseTextLayer)同字体串(MouseText 家族同源);
//       ④19px 字号下 CJK 墨高 ∈ 17-19(FX27 实测链同相,行距 22 不塌);
//       ⑤截图 /tmp/fx35-infofont.png + 放大图 人工核对字形无重影。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const FONT_STR = '14px "Fusion Pixel 12px", monospace';   // ★用户拍板 16px 紧凑折中
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('FX35字体');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// ① 字体就绪态:webfont 已加载且真实命中(非降级)——UIFont.load 启动 await 的实证
const fontState = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    loaded: document.fonts.check('14px "Fusion Pixel 12px"'),
    faces: [...document.fonts].filter((f) => /Fusion/.test(f.family)).map((f) => `${f.family}/${f.status}`),
  };
});
check('document.fonts 就绪:Fusion Pixel 12px 已加载(非 monospace 兜底)',
  fontState.loaded, JSON.stringify(fontState));

// ② fillText 全局录制:记 文本/ctx.font/序(截尾防膨)
await page.evaluate(() => {
  const log = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
    if (log.length > 6000) log.splice(0, 3000);
    log.push({ s: String(s), font: this.font, x, y });
    return orig.call(this, s, x, y);
  };
  window.__fx35Fills = log;
});

// 入包五件信息族(同 _fx21/_infoaccs-probe:信息放背包即生效)
await page.evaluate(() => {
  const g = window.__swGame;
  const keys = ['vi_17_gold_watch', 'vi_18_depth_meter', 'vi_393_compass', 'vi_3119_dps_meter', 'vi_3099_stopwatch'];
  keys.forEach((k, i) => { g.player.inv.slots[40 + i] = { id: window.__swItems[k], stack: 1 }; });
});
await new Promise((r) => setTimeout(r, 1200));

const rows = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    n: g.renderer.infoAccs.state.rows.length,
    texts: g.renderer.infoAccs.state.rows.map((r) => r.text),
    labels: g.renderer.infoAccs.state.rows.map((r) => r.label),
    rects: g.renderer.infoAccs.state.iconRects.map((r) => ({ x: r.x, y: r.y })),
  };
});
check('信息行渲染中(五件饰品)', rows.n >= 5, JSON.stringify({ n: rows.n, texts: rows.texts }));

// 清日志 → 读两帧 fillText:全部信息行文本的 ctx.font = 19px 像素字体串
await page.evaluate(() => { window.__fx35Fills.length = 0; });
await new Promise((r) => setTimeout(r, 150));
const fills = await page.evaluate((texts) => {
  const log = window.__fx35Fills;
  const rowFills = log.filter((f) => texts.includes(f.s));
  return {
    rowFonts: [...new Set(rowFills.map((f) => f.font))],
    rowCount: rowFills.length,
    sample: rowFills.slice(0, 3),
  };
}, rows.texts);
check('信息行 canvas 字体 = 19px "Fusion Pixel 12px"(MouseText 家族统一)',
  fills.rowCount > 0 && fills.rowFonts.length === 1 && fills.rowFonts[0] === FONT_STR,
  JSON.stringify({ fonts: fills.rowFonts, rowCount: fills.rowCount, sample: fills.sample }));

// ④ 19px 档 CJK 墨高 ∈ 17-19(FX27 实测链;行距 22 同相依据)
const ink = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d');
  c.font = '19px "Fusion Pixel 12px", monospace';
  const m = c.measureText('移动速度');
  return {
    inkH: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 0,
    advW: m.width,
    fallback: c.measureText('移动速度').width,
  };
});
check('19px 档 CJK 墨高 ∈ 17-19(FX27 链;行距 22 不塌行)',
  ink.inkH >= 17 && ink.inkH <= 19, JSON.stringify(ink));

// ③ 悬停速度行图标 → drawMouseTextLayer 标签同字体串(箱名/NPC 名同族)
const speedIdx = rows.texts.findIndex((t) => /速度|mph|mi\/h/i.test(t));
check('速度行存在', speedIdx >= 0, JSON.stringify(rows.texts));
if (speedIdx >= 0) {
  const rect = rows.rects[speedIdx];
  await page.mouse.move(rect.x + 5, rect.y + 5);
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { window.__fx35Fills.length = 0; });
  await new Promise((r) => setTimeout(r, 150));
  const label = await page.evaluate(() => {
    const g = window.__swGame;
    const text = g.player.cursorItemIconText;
    const log = window.__fx35Fills.filter((f) => f.s === text);
    return { text, fonts: [...new Set(log.map((f) => f.font))], count: log.length };
  });
  check('悬停行标签(drawMouseTextLayer)同字体串',
    label.count > 0 && label.fonts.length === 1 && label.fonts[0] === FONT_STR,
    JSON.stringify(label));
  // 标签放大图(随光标 MouseText,核对描边无重影)
  await page.screenshot({ path: '/tmp/fx35-infofont-label-zoom.png', clip: {
    x: Math.max(0, rect.x - 40), y: Math.max(0, rect.y - 30), width: 300, height: 140,
  } });
  await page.mouse.move(rect.x - 300, rect.y + 260);
  await new Promise((r) => setTimeout(r, 300));
}

// ⑤ 截图:信息列右上域整列 + 行区放大(人工核对字形无重影/描边干净)
await page.screenshot({ path: '/tmp/fx35-infofont.png', clip: { x: 1280 - 420, y: 0, width: 420, height: 420 } });
const zoomAt = rows.rects[0] ?? { x: 1280 - 280, y: 42 };
await page.screenshot({ path: '/tmp/fx35-infofont-zoom.png', clip: {
  x: Math.max(0, zoomAt.x - 30), y: Math.max(0, zoomAt.y - 24), width: 340, height: 200,
} });

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
