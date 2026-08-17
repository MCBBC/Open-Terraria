// 炸弹(28)绘制对齐探针:拦截 drawImage 断言贴图落点。
// 原版依据 Main.cs:29560(28→num143=8)+ :34040 通用绘制:
//   anchor=(盒左+num145+num144, 盒上+盒高/2), origin=(num145, 盒高/2+num143)
//   → 贴图左上角应落于 (盒左, 盒上−8):引线 y=0-7 全在盒外,弹体 y=8-29 恰填 22×22 盒。
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

// 拦截 drawImage 记录 22×30 调用(炸弹贴图原生尺寸;ImageBitmap 无 src,按尺寸+位置过滤)
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const rec = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (img, dx, dy, dw, dh, ...rest) {
    if (dw > 21 && dw < 23 && dh > 29 && dh < 31 && !rest.length) rec.push({ dx, dy, t: this.getTransform() });
    return orig.call(this, img, dx, dy, dw, dh, ...rest);
  };
  try {
    // 投掷炸弹 vi_166
    const key = Object.keys(window.__swItems).find((k) => /^vi_166_/.test(k));
    p.inv.slots[0] = { id: window.__swItems[key], stack: 5 };
    p.inv.selected = 0;
    p.useTime = 0;
    g.input.mouseDown = true;
    g.input.mouseX = g.renderer.canvas.width / 2 + 80;
    g.input.mouseY = g.renderer.canvas.height / 2 - 40;
    await new Promise((r) => setTimeout(r, 120));
    g.input.mouseDown = false;
    const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
    if (!proj || proj.constructor.name !== 'GrenadeProj') return { err: 'no GrenadeProj: ' + proj?.constructor?.name };
    // 钉死旋转与速度(速度 0 → rot 不变),引信拉满防爆炸
    proj.vx = 0; proj.vy = 0; proj.rot = 0; proj.fuse = 99999;
    await new Promise((r) => setTimeout(r, 400));   // 等若干帧绘制
    const b = { x: proj.x, y: proj.y, w: proj.w, h: proj.h, projId: proj.projId };
    const calls = rec.slice(-4);                    // 最后几次(含可能的残影)
    return { b, calls };
  } finally {
    proto.drawImage = orig;
  }
});
if (res.err) { check('生成炸弹', false, res.err); }
else {
  check('炸弹盒 22×22', res.b.w === 22 && res.b.h === 22, JSON.stringify(res.b));
  check('projId=28', res.b.projId === 28, String(res.b.projId));
  const last = res.calls[res.calls.length - 1];
  check('捕到 22×30 贴图绘制调用', !!last, JSON.stringify(res.calls));
  if (last) {
    // drawProj 在 translate(anchor)→rotate 后 drawImage(-num145·s, -(h/2+num143)·s, …)
    // → 局部坐标 dx 应 = −num145 = −(贴图宽+盒宽)/2, dy 应 = −(盒高/2 + num143)。
    // 盒 22×22 贴图 22×30:dx=−22, dy=−(11+8)=−19 ⇔ 贴图左上角落于 (盒左, 盒上−8)。
    check('origin X = −num143 公式(dx=−22)', Math.abs(last.dx + 22) < 0.51, `got ${last.dx.toFixed(2)}`);
    check('origin Y 含 num143=8(dy=−19,引线出盒/弹体填盒)', Math.abs(last.dy + 19) < 0.51, `got ${last.dy.toFixed(2)}`);
  }
}
check('无页面错误', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
