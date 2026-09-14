// ★SW-FX21 信息饰品行标签层序探针(2026-09-14 用户实报:悬停行图标 → 标签「移动速度」
// 被下方行文字叠写压住)。修复 = cursorItemIconText 文本支自 drawCursorItemIcon(层 40
// 域,步骤 7b')迁 drawMouseTextLayer(render() 尾步骤 13,DrawPendingMouseText 层序)。
// 断言:①标签 claim(cursorItemIconText=行 label);②同帧 fillText 序:标签本体晚于
// 全部信息行文本(=画在其上);③标签实锚 mouse+20(MouseTextInner :20379+20386);
// ④下一行压暗 0.34 保持(:46629-46632);⑤光标移开 → 零标签填充(cursorItemIconText
 // ==='' 门);⑥截图 /tmp/fx21-label.png 人工核对(随光标+最上层)。
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
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('FX21标签');
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

// fillText 全局录制(原型补丁;记 文本/globalAlpha/x/y/序)。装在入包前,日志截尾防膨。
await page.evaluate(() => {
  const log = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
    if (log.length > 6000) log.splice(0, 3000);
    log.push({ s: String(s), a: this.globalAlpha, x, y });
    return orig.call(this, s, x, y);
  };
  window.__fx21Fills = log;
});

// 入包五件信息族(信息放背包即生效——UpdateEquips 全格扫;同 _infoaccs-probe)
await page.evaluate(() => {
  const g = window.__swGame;
  const keys = ['vi_17_gold_watch', 'vi_18_depth_meter', 'vi_393_compass', 'vi_3119_dps_meter', 'vi_3099_stopwatch'];
  keys.forEach((k, i) => { g.player.inv.slots[40 + i] = { id: window.__swItems[k], stack: 1 }; });
});
await new Promise((r) => setTimeout(r, 1200));

// 定位速度行(用户实报「0 mph」行;label=「移动速度」)
const speed = await page.evaluate(() => {
  const g = window.__swGame;
  const rects = g.renderer.infoAccs.state.iconRects;
  const rows = g.renderer.infoAccs.state.rows;
  const idx = rects.findIndex((r) => /速度/.test(r.row.label ?? '') || /mph|mi\/h/.test(r.row.text ?? ''));
  return {
    idx, n: rects.length,
    labels: rows.map((r) => r.label), texts: rows.map((r) => r.text),
    rect: idx >= 0 ? { x: rects[idx].x + 5, y: rects[idx].y + 5 } : null,
    nextText: idx >= 0 && idx + 1 < rows.length ? rows[idx + 1].text : null,
  };
});
check('速度行定位', speed.idx >= 0, JSON.stringify({ idx: speed.idx, labels: speed.labels, texts: speed.texts }));
if (speed.idx < 0) { console.log(`${pass} PASS / ${fail} FAIL`); await browser.close(); process.exit(1); }

// 真实鼠标移到速度行图标 → 完整 claim 链(hitTest→infoAccHover→cursorItemIconText=label)
await page.mouse.move(speed.rect.x, speed.rect.y);
await new Promise((r) => setTimeout(r, 400));
const claim = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    text: g.player.cursorItemIconText, hover: g.renderer.infoAccHover,
    mx: g.input.mouseX, my: g.input.mouseY,
  };
});
check('悬停 claim:cursorItemIconText=行标签(随光标,MouseTextNoOverride :48175)',
  claim.text === speed.labels[speed.idx] && claim.hover === speed.idx,
  JSON.stringify({ text: claim.text, hover: claim.hover, expect: speed.labels[speed.idx] }));

// 同帧 fillText 序:清日志 → 两帧后读 → 标签本体序 > 全部行文本序(=压不住,画在其上)
await page.evaluate(() => { window.__fx21Fills.length = 0; });
await new Promise((r) => setTimeout(r, 120));
const frame = await page.evaluate(() => {
  const log = window.__fx21Fills;
  const rows = window.__swGame.renderer.infoAccs.state.rows;
  const rowTexts = rows.map((r) => r.text);
  const label = window.__swGame.player.cursorItemIconText;
  const seq = (pred) => log.reduce((acc, f, i) => (pred(f) ? i : acc), -1);
  const lastRowSeq = seq((f) => rowTexts.includes(f.s));
  const lastLabelSeq = seq((f) => f.s === label);
  // 下一行压暗:悬停数组位+1 行文本的 fill globalAlpha ≈ 0.34(:46629-46632 ÷3)
  const nextText = rows[(window.__swGame.renderer.infoAccHover) + 1]?.text ?? null;
  const nextAlphas = log.filter((f) => f.s === nextText).map((f) => f.a);
  const labelFills = log.filter((f) => f.s === label);
  return { label, lastRowSeq, lastLabelSeq, nextText, nextAlphas, labelFills, n: log.length };
});
check('同帧层序:标签晚于全部行文本(drawMouseTextLayer=步骤 13 最上层)',
  frame.lastLabelSeq > frame.lastRowSeq && frame.lastLabelSeq >= 0,
  JSON.stringify({ lastRowSeq: frame.lastRowSeq, lastLabelSeq: frame.lastLabelSeq, n: frame.n }));
check('下一行压暗 0.34 保持(hover+1 行 globalAlpha≈0.34)',
  frame.nextAlphas.some((a) => Math.abs(a - 0.34) < 0.01) && frame.nextAlphas.every((a) => a < 0.5),
  JSON.stringify({ nextText: frame.nextText, alphas: [...new Set(frame.nextAlphas)] }));
check('标签实锚 mouse+20(MouseTextInner :20379 +14 + ThickMouse +6,无收边)',
  frame.labelFills.some((f) => Math.abs(f.x - (claim.mx + 20)) < 0.6 && Math.abs(f.y - (claim.my + 20)) < 0.6),
  JSON.stringify({ fills: frame.labelFills.slice(-1), mx: claim.mx, my: claim.my }));

// 截图(右上域:图标列+悬停高亮+随光标标签)供人工核对;另存鼠标邻域放大图
const clip = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  return { w: Math.min(1280, cv.clientWidth), h: Math.min(800, cv.clientHeight) };
});
await page.screenshot({ path: '/tmp/fx21-label.png', clip: { x: clip.w - 460, y: 0, width: 460, height: 460 } });
await page.screenshot({ path: '/tmp/fx21-label-zoom.png',
  clip: { x: Math.max(0, speed.rect.x - 60), y: Math.max(0, speed.rect.y - 40), width: 260, height: 160 } });

// 光标移开 → claim 清零 + 零标签填充(cursorItemIconText==='' 门)
await page.mouse.move(speed.rect.x - 300, speed.rect.y + 260);
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => { window.__fx21Fills.length = 0; });
await new Promise((r) => setTimeout(r, 120));
const away = await page.evaluate(() => {
  const g = window.__swGame;
  return { text: g.player.cursorItemIconText, hover: g.renderer.infoAccHover,
    labelFills: window.__fx21Fills.filter((f) => f.s === g.player.cursorItemIconText && f.s !== '').length,
    rowsStill: g.renderer.infoAccs.state.rows.length };
});
check('移开:claim 清零+零标签填充(门 cursorItemIconText===\'\')',
  away.text === '' && away.hover === -1 && away.labelFills === 0 && away.rowsStill > 0,
  JSON.stringify(away));

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
