// 探针（SW-TPMARK 2026-09-17）：F10 传送调试面预选标记坐标文本目视验证。
// 流程：进世界 → 显式开启 mapClickTeleportEnabled（Shift+F10 确认门等价终态）→
// 开全图 → 点底图设标记 → 截图（标记+坐标文本可读）；再点右缘 → 翻左布局截图。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199');
const SHOT = (n) => `/tmp/tpmark-${n}.png`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(URL + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.renderer, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1800));
await page.evaluate(() => {
  const w = document.getElementById('sw-welcome-announce');
  if (!w) return;
  const btn = [...w.querySelectorAll('button')].find((b) => /确|开|关|知道|进入/.test(b.textContent || ''));
  (btn ?? w.querySelector('button'))?.click();
  if (document.getElementById('sw-welcome-announce')) w.remove();
});
await new Promise((r) => setTimeout(r, 300));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  [' + detail + ']' : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 显式开启传送调试旗（=Shift+F10 门确认后的终态）并直开全图
await page.evaluate(() => {
  const g = window.__swGame;
  g.mapClickTeleportEnabled = true;
  g.renderer.fullMap.open = true;   // 直开（zoom=0.5 静态,免缓动等待）
});
await sleep(600);
check('全图已开 + 旗开启', await page.evaluate(() =>
  window.__swGame.renderer.fullMap.open && window.__swGame.mapClickTeleportEnabled));

// 2) 底图点击 (500,350) → 预选标记 + 坐标文本
const clickMap = async (x, y) => {
  await page.mouse.move(x, y);
  await sleep(150);
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();
  await sleep(350);
};
await clickMap(500, 350);
const mark1 = await page.evaluate(() => {
  const g = window.__swGame, fm = g.renderer.fullMap;
  const cx0 = g.renderer.canvas.width / 2 - (g.world.w * fm.zoom) / 2 + fm.panX;
  const cy0 = g.renderer.canvas.height / 2 - (g.world.h * fm.zoom) / 2 + fm.panY;
  const tp = g.renderer.tpMark;
  return { tp, mx: tp ? cx0 + (tp.x + 0.5) * fm.zoom : null, my: tp ? cy0 + (tp.y + 0.5) * fm.zoom : null };
});
check('底图点击设预选标记 (tile)', mark1.tp !== null, `tpMark=(${mark1.tp?.x}, ${mark1.tp?.y})`);
check('标记屏幕位 ≈ 点击位', mark1.tp && Math.abs(mark1.mx - 500) < 2 && Math.abs(mark1.my - 350) < 2,
  `screen=(${mark1.mx?.toFixed(1)}, ${mark1.my?.toFixed(1)})`);
await page.screenshot({ path: SHOT(1) });
await sleep(400);
await page.screenshot({ path: SHOT('1b') });   // 另一闪烁相位

// 3) 重设到右缘 (1270,400) → 文本翻左（world 右缘钳制面）+ 标记同步新点
await clickMap(1270, 400);
const mark2 = await page.evaluate(() => {
  const g = window.__swGame, fm = g.renderer.fullMap;
  const cx0 = g.renderer.canvas.width / 2 - (g.world.w * fm.zoom) / 2 + fm.panX;
  const cy0 = g.renderer.canvas.height / 2 - (g.world.h * fm.zoom) / 2 + fm.panY;
  const tp = g.renderer.tpMark;
  return { tp, mx: tp ? cx0 + (tp.x + 0.5) * fm.zoom : null, my: tp ? cy0 + (tp.y + 0.5) * fm.zoom : null };
});
check('标记重设同步新点', mark2.tp && (mark2.tp.x !== mark1.tp.x || mark2.tp.y !== mark1.tp.y),
  `tpMark=(${mark2.tp?.x}, ${mark2.tp?.y})`);
check('右缘标记屏幕位 ≈ 1270', mark2.tp && Math.abs(mark2.mx - 1270) < 2, `mx=${mark2.mx?.toFixed(1)}`);
await page.screenshot({ path: SHOT(2) });

console.log(`\n${pass} passed, ${fail} failed; shots: ${SHOT(1)} ${SHOT('1b')} ${SHOT(2)}`);
await browser.close();
process.exit(fail ? 1 : 0);
