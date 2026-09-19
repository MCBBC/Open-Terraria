// 探针（SW-BJ15 2026-09-07；★SW-BJ120 2026-09-19 定谳重产）：地图打开链回归。
// BJ120 定谳：小地图【点击开图】面已摘除（自创面——原版 minimap 支 Main.cs:56340-56381
// 无点击处理、MinimapFrame 只在缩放钮上 mouseInterface=MinimapFrame.cs:148-166，
// 点击穿透到世界；开图=专用键 M Player.cs:25163-25176 / 背包态地图钮 / 右键晶塔）。
// 断言：小地图点击不开图+穿透、M 开图链（缓动/居中/不误触传送）/拖拽/传送语义。
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

// 1a) ★SW-BJ120：小地图【点击】不开图（原版无此面）+ 点击穿透（本体裁不掉 minimapUiHover）
const pos = await mmCenter();
const clickNoOpen = async () => {
  for (let i = 0; i < 2; i++) {   // 瞬时 DOM 覆盖（toast 等）可能吞掉一次点击——重试消歧
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
  }
  return page.evaluate(() => ({
    open: window.__swGame.renderer.fullMap.open,
    uiHover: window.__swGame.renderer.minimapUiHover,
  }));
};
const noOpen = await clickNoOpen();
check('小地图点击不开图（BJ120 摘面）', noOpen.open === false);
check('小地图本体不置 UI 悬停（原版穿透面）', noOpen.uiHover === false);

// 1a2) ★BJ120 刀②行为面：缩放钮上点击 = mouseInterface 让位——小地图缩放生效、
//      世界使用事件【被吞】（原版 MinimapFrame.cs:148-166 钮上 mouseInterface=true;
//      TriggersSet.cs:835-841 !mouseInterface 门拦 controlUseItem）。
//      仪器：包一层 g.useSwing 计数（同 _inp-firstclick-verify.mjs）。
await page.evaluate(() => {
  const g = window.__swGame;
  window.__useN = 0;
  const orig = g.useSwing.bind(g);
  g.useSwing = function (...a) { window.__useN++; return orig(...a); };
  window.__swGame.renderer.minimapZoom = 1.5;   // 任意钮都会改值（in/out/reset 三态）
});
const zoomBtn = await (async () => {
  const r = await page.evaluate(() => window.__swGame.renderer.minimapRect);
  // 框【底】条带扫到 minimapUiHover=true 的点（MINIMAP_SKINS by≈234-248=框底沿;
  // 步距 6px 足够命中 22×22 命中盒）
  for (let dy = Math.max(0, r.h - 60); dy <= r.h; dy += 6) {
    for (let dx = 0; dx <= r.w; dx += 6) {
      const x = r.x + dx, y = r.y + dy;
      await page.mouse.move(x, y);
      await sleep(30);   // 等一个渲染拍（drawMinimap 写 minimapUiHover）
      if (await page.evaluate(() => window.__swGame.renderer.minimapUiHover)) return { x, y };
    }
  }
  return null;
})();
if (zoomBtn) {
  const z0 = await page.evaluate(() => window.__swGame.renderer.minimapZoom);
  const n0 = await page.evaluate(() => window.__useN);
  await page.mouse.move(zoomBtn.x, zoomBtn.y); await sleep(80);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
  await sleep(250);
  const z1 = await page.evaluate(() => window.__swGame.renderer.minimapZoom);
  const useDelta = (await page.evaluate(() => window.__useN)) - n0;
  const openAfter = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
  check('缩放钮点击仍缩放小地图（钮面保留）', Math.abs(z1 - z0) > 1e-6, `zoom ${z0.toFixed(3)}→${z1.toFixed(3)}`);
  check('缩放钮上世界使用被让位（mouseInterface 等价）', useDelta === 0 && openAfter === false, `useN+${useDelta}`);
} else {
  check('未扫到缩放钮（布点变更?）', false, 'sweep 56px strip');
}

// 1b) M 键开图（原版 Map Full Screen 专用键）：首开即主角居中（缓动收敛后 |off| < 2px）
await page.keyboard.press('KeyM');
await sleep(300);
check('M 键打开全图', await page.evaluate(() => window.__swGame.renderer.fullMap.open));
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
check('M 开图态保持打开', opened.open === true);
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
