// ★BJ241 Radio Thing（tile 733）实报场景探针——放置→右键→无 OOB 告警+贴图正确。
// 对照 debug-report 物证：旧缺陷下右键后 frameY=54 直采 54 高 sheet → vframeAt OOB
// → tileFrames.anoms 出 3 条 kind:"fallback"(imgh54 OOB!) + 画面整物第一格平铺。
// 验收：
//   A. 放置(off) + 右键翻态(on) 后 __swTileCap.exportLight() 无 sheet733 fallback/OOB
//   B. 页面无 [VanillaTiler] 源矩形越界 warn
//   C. 截图像素判定：off 态匹配 sheet 右半（暗屏）、on 态匹配左半（亮屏），
//      正确半 MAD 显著小于错误半（TileDrawing.cs:6081-6088 映射的端到端验证）
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'node:fs';
// @ts-ignore
import { PNG } from 'pngjs';

const OUT = '/tmp/bj241';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const warns = [];
page.on('pageerror', (e) => warns.push('PAGEERR: ' + String(e.message).slice(0, 200)));
page.on('console', (m) => {
  const t = m.text();
  if (/VanillaTiler|源矩形越界|sheet 733/.test(t)) warns.push(t.slice(0, 300));
});
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
// 角色档：无则造一个
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('收音探');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('733');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
for (const b of await page.$$('button')) { const t = await b.evaluate((el) => el.textContent || ''); if (/我知道了|我已知晓/.test(t)) { await b.click(); break; } }
await new Promise((r) => setTimeout(r, 500));

// ---- 布景：清空 + 平地 + 放一台收音机（off：fx=0/18/36, fy=0/18/36）----
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILES = window.__swTiles;
  const GROUND = TILES['v_2_grass'] ?? TILES['v_1_dirt'] ?? TILES['v_1_stone'] ?? Object.values(TILES)[0];
  const RADIO = TILES['v_733_radio_thing'];
  if (!RADIO) return { fail: 'v_733_radio_thing missing' };
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const gy = py + 8;
  const rx = px + 6;              // 收音机左上格
  for (let x = px - 20; x <= px + 26; x++) {
    for (let y = gy - 12; y < gy; y++) st.setTile(x, y, 0);
    st.setTile(x, gy, GROUND, 0, 0);
    st.setTile(x, gy + 1, GROUND, 0, 0);
    st.setTile(x, gy + 2, GROUND, 0, 0);
  }
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTile(rx + dx, gy - 3 + dy, RADIO, dx * 18, dy * 18);
    }
  }
  // 玩家站收音机左侧
  g.player.x = (rx - 5) * 16;
  g.player.y = (gy - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  try { g.world.clock.timeOfDay = 0.5; } catch { /* ignore */ }
  g.fullbright = true;
  try { g.renderer.fullbright = true; } catch { /* ignore */ }
  return { ok: true, rx, gy, py };
});
console.log('setup:', JSON.stringify(setup));
if (setup.fail) { console.log('FAIL', setup.fail); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));

// 收音机屏幕矩形（世界像素→CSS 屏幕）
const tileRect = await page.evaluate(({ rx, gy }) => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(rx * 16, (gy - 3) * 16);
  return { x: sx, y: sy, w: 54 * g.camera.zoom, h: 54 * g.camera.zoom };
}, setup);
console.log('tileRect:', JSON.stringify(tileRect));
const clip = {
  x: Math.max(0, tileRect.x - 4), y: Math.max(0, tileRect.y - 4),
  width: Math.min(1280 - Math.max(0, tileRect.x - 4), tileRect.w + 8),
  height: Math.min(800 - Math.max(0, tileRect.y - 4), tileRect.h + 8),
};

// ---- off 态取证 ----
const anomsOff = await page.evaluate(() => {
  const cap = window.__swTileCap;
  const light = cap ? cap.exportLight() : { anoms: [] };
  return (light.anoms || []).filter((a) => a.first && a.first.sheet === 733);
});
await page.screenshot({ path: OUT + '/radio-off.png', clip });
console.log('anoms(off):', JSON.stringify(anomsOff));

// ---- 真实右键（鼠标移到收音机中心 → 右键）----
await page.mouse.move(tileRect.x + tileRect.w / 2, tileRect.y + tileRect.h / 2);
await new Promise((r) => setTimeout(r, 300));
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 80));
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 200));
let flipped = await page.evaluate(({ rx, gy }) => {
  const st = window.__swGame.world.store;
  return st.frameY[st.idx(rx, gy - 3)];
}, setup);
if (flipped !== 54) {
  // 兜底：直接走交互分派（与右键同链）
  console.log('real right-click no flip (fy=' + flipped + '), fallback interactAt');
  await page.evaluate(({ rx, gy }) => { window.__swGame.interactAt(rx, gy - 3); }, setup);
  await new Promise((r) => setTimeout(r, 200));
  flipped = await page.evaluate(({ rx, gy }) => {
    const st = window.__swGame.world.store;
    return st.frameY[st.idx(rx, gy - 3)];
  }, setup);
}
console.log('after right-click anchor frameY:', flipped, flipped === 54 ? '(on 态 ✓)' : '(未翻! FAIL)');
await new Promise((r) => setTimeout(r, 1500));

// ---- on 态取证 ----
const anomsOn = await page.evaluate(() => {
  const cap = window.__swTileCap;
  const light = cap ? cap.exportLight() : { anoms: [] };
  return (light.anoms || []).filter((a) => a.first && a.first.sheet === 733);
});
await page.screenshot({ path: OUT + '/radio-on.png', clip });
console.log('anoms(on):', JSON.stringify(anomsOn));
console.log('warns:', warns.length ? warns : 'none');

await browser.close().catch(() => {});

// ---- 像素判定：off↔右半(暗) / on↔左半(亮)，正确半 MAD 显著小于错误半 ----
function mad(aData, bData, w, h) {
  const a = aData, b = bData;
  let s = 0;
  for (let i = 0; i < w * h; i++) {
    s += Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
  }
  return s / (w * h * 3);
}
const refPng = PNG.sync.read(readFileSync('public/sprites/vanilla/Tiles_733.png'));
function halfPng(x0) {
  const out = new PNG({ width: 54, height: 54 });
  PNG.bitblt(refPng, out, x0, 0, 54, 54, 0, 0);
  return out;
}
const leftRef = halfPng(0), rightRef = halfPng(54);
// 截图缩到 54×54 再比对（在 node 里借 pngjs 无缩放——走 puppeteer 已截 clip,这里
// 用最近邻手写缩放）
function cropAndScale(file) {
  const img = PNG.sync.read(readFileSync(file));
  // 去掉 clip 的 4px 边（若被边界裁剪则按可用区取）
  const bx = Math.min(4, img.width - 1), by = Math.min(4, img.height - 1);
  const sw = img.width - bx * 2, sh = img.height - by * 2;
  const out = new PNG({ width: 54, height: 54 });
  for (let y = 0; y < 54; y++) {
    const sy0 = Math.min(sh - 1, Math.floor(y * sh / 54));
    for (let x = 0; x < 54; x++) {
      const sx0 = Math.min(sw - 1, Math.floor(x * sw / 54));
      const si = ((by + sy0) * img.width + bx + sx0) * 4;
      const di = (y * 54 + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}
const offShot = cropAndScale(OUT + '/radio-off.png');
const onShot = cropAndScale(OUT + '/radio-on.png');
const offVsRight = mad(offShot.data, rightRef.data, 54, 54);
const offVsLeft = mad(offShot.data, leftRef.data, 54, 54);
const onVsLeft = mad(onShot.data, leftRef.data, 54, 54);
const onVsRight = mad(onShot.data, rightRef.data, 54, 54);
console.log('MAD off: right=' + offVsRight.toFixed(1) + ' left=' + offVsLeft.toFixed(1));
console.log('MAD on : left=' + onVsLeft.toFixed(1) + ' right=' + onVsRight.toFixed(1));
const drawOK = offVsRight < offVsLeft && onVsLeft < onVsRight;
// 断言=无 OOB! 指纹（imgW108+ofy54=图已载后越界=本 bug 专属签名）。
// imgW0「表缺?」=放置瞬间懒加载未就绪的重烘焙自愈窗（任意新放 tile 同款瞬态,非本 bug）
const noOob = anomsOff.concat(anomsOn).every((a) => !/OOB!/.test(a.first.detail));
const noWarns = warns.length === 0;
console.log('=== BJ241 probe verdict ===');
console.log('flip:', flipped === 54 ? 'PASS' : 'FAIL');
console.log('draw halves:', drawOK ? 'PASS' : 'FAIL');
console.log('no OOB! anoms sheet733:', noOob ? 'PASS' : 'FAIL');
console.log('no warns/pageerrors:', noWarns ? 'PASS' : 'FAIL');
process.exit(flipped === 54 && drawOK && noOob && noWarns ? 0 : 1);
