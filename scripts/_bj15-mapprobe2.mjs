// 探针（SW-BJ15 2026-09-07）：小地图点击开图链回归（_mapprobe.mjs 的现代版——
// 旧探针依赖已废弃的 select+button 启动 UI）。断言打开链/拖拽/误触传送语义。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(URL + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.renderer, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1800));
// 欢迎公告弹窗（#sw-welcome-announce,fixed 全屏 z60）会吞掉小地图点击——先关掉
await page.evaluate(() => {
  const w = document.getElementById('sw-welcome-announce');
  if (!w) return;
  const btn = [...w.querySelectorAll('button')].find((b) => /确|开|关|知道|进入/.test(b.textContent || ''));
  (btn ?? w.querySelector('button'))?.click();
  if (document.getElementById('sw-welcome-announce')) w.remove();   // 探针兜底
});
await new Promise((r) => setTimeout(r, 300));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  [' + detail + ']' : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mmCenter = () => page.evaluate(() => {
  const r = window.__swGame.renderer.minimapRect;
  return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
});

// 1) 小地图点击开图：首开即主角居中（缓动收敛后 |off| < 2px）
const pos = await mmCenter();
const clickOpen = async () => {
  for (let i = 0; i < 3; i++) {   // 瞬时 DOM 覆盖（toast 等）可能吞掉一次点击——重试
    const over = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.tagName + '.' + (el.className || '') : 'none';
    }, pos);
    if (over !== 'canvas' && over !== 'none') console.log(`  (点击位被覆盖: ${over}，重试)`);
    await page.mouse.move(pos.x, pos.y);
    await sleep(150);
    await page.mouse.down();
    await sleep(100);
    await page.mouse.up();
    await sleep(300);
    if (await page.evaluate(() => window.__swGame.renderer.fullMap.open)) return true;
  }
  return false;
};
check('小地图点击打开全图', await clickOpen());
await sleep(2300);   // 缓动 0.5→2 收敛（~40 帧）
const opened = await page.evaluate(() => {
  const g = window.__swGame, fm = g.renderer.fullMap;
  const cx0 = g.renderer.canvas.width / 2 - (g.world.w * fm.zoom) / 2 + fm.panX;
  const cy0 = g.renderer.canvas.height / 2 - (g.world.h * fm.zoom) / 2 + fm.panY;
  return {
    open: fm.open, zoom: fm.zoom,
    offX: Math.round(cx0 + (g.player.cx / 16) * fm.zoom - g.renderer.canvas.width / 2),
    offY: Math.round(cy0 + (g.player.cy / 16) * fm.zoom - g.renderer.canvas.height / 2),
    tpMark: g.renderer.tpMark ?? null,
  };
});
check('小地图点击打开全图', opened.open === true);
check('开图缩放缓动收敛到 2', Math.abs(opened.zoom - 2) < 0.01, `zoom=${opened.zoom}`);
check('首开主角居中（|off|<2px）', Math.abs(opened.offX) < 2 && Math.abs(opened.offY) < 2, `off=(${opened.offX},${opened.offY})`);
check('开图点击不误触传送预选', opened.tpMark === null);

// 2) 拖动 150px：pan 生效、不预选传送
const panBefore = await page.evaluate(() => ({ x: window.__swGame.renderer.fullMap.panX, y: window.__swGame.renderer.fullMap.panY }));
await page.mouse.move(640, 400);
await page.mouse.down();
await sleep(120);
await page.mouse.move(790, 550, { steps: 8 });
await sleep(200);
const dragTp = await page.evaluate(() => window.__swGame.renderer.tpMark ?? null);
await page.mouse.up();
await sleep(200);
const panAfter = await page.evaluate(() => ({ x: window.__swGame.renderer.fullMap.panX, y: window.__swGame.renderer.fullMap.panY }));
check('拖动平移生效（pan 变化 >50px）', Math.abs(panAfter.x - panBefore.x) > 50 && Math.abs(panAfter.y - panBefore.y) > 50,
  `d=(${Math.round(panAfter.x - panBefore.x)},${Math.round(panAfter.y - panBefore.y)})`);
check('拖动不误触传送预选', dragTp === null);

// 3) ★SW-BJ15 新门：全图打开状态点右上小地图区域不再重置视图
const panStable = await page.evaluate(() => ({ x: window.__swGame.renderer.fullMap.panX, y: window.__swGame.renderer.fullMap.panY, z: window.__swGame.renderer.fullMap.zoom }));
const pos2 = await mmCenter();
await page.mouse.move(pos2.x, pos2.y);
await sleep(100);
await page.mouse.down();
await sleep(100);
await page.mouse.up();
await sleep(300);
const afterCornerClick = await page.evaluate(() => ({ x: window.__swGame.renderer.fullMap.panX, y: window.__swGame.renderer.fullMap.panY, z: window.__swGame.renderer.fullMap.zoom, open: window.__swGame.renderer.fullMap.open }));
check('开图状态点小地图区域不重置视图（新 !open 门）',
  afterCornerClick.open === true && Math.abs(afterCornerClick.z - panStable.z) < 0.01
  && Math.abs(afterCornerClick.x - panStable.x) < 0.5 && Math.abs(afterCornerClick.y - panStable.y) < 0.5,
  `z ${panStable.z.toFixed(3)}->${afterCornerClick.z.toFixed(3)}`);

// 4) 原地点击两次 → 预选+传送并关图（Game 链不受影响）。
//    注：普通选点传送 = 自造调试功能，2026-08-27 起默认禁用（mapClickTeleportEnabled
//    =false,Shift 键组切换）——旧 _mapprobe.mjs 的该断言即因此失效,此处显式开启再验
await page.evaluate(() => { window.__swGame.mapClickTeleportEnabled = true; });
await page.mouse.move(640, 400);
await page.mouse.down(); await sleep(100); await page.mouse.up();   // 预选（第一次点击=拖后原地 <6px）
await sleep(300);
const tp1 = await page.evaluate(() => window.__swGame.renderer.tpMark ?? null);
check('原地点击预选传送点', tp1 !== null);
await page.mouse.down(); await sleep(100); await page.mouse.up();
await sleep(300);
const fin = await page.evaluate(() => ({ open: window.__swGame.renderer.fullMap.open, tpMark: window.__swGame.renderer.tpMark ?? null }));
check('同点二次点击传送并关图', fin.open === false && fin.tpMark === null);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
