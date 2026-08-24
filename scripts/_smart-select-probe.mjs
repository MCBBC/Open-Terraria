// 探针：Shift 智能选取（SmartSelect）行为画像（2026-08-24 用户报"有时火把有时
// 第一位镐子"）。方法：进世界开 dev 全道具 → 玩家周边采样空气格/实心格网格 →
// 派发 mousemove+ShiftLeft 按住 → 读 smartSelect.strategy/slot 与 inv.selected。
// 判据（=1457 Player.cs:17739 策略表）：
//   空气格 → 策略 0（或超距 5）→ 选中槽应为火把
//   实心格(镐距内) → 策略 3 → 选中槽 = 游戏自选的 pick 槽（记录用）
//   空气格选中非火把 = 用户报的 bug 复现
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 2000));

// dev 全道具（火把入包）+ 采集玩家/相机状态
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g) return { ok: false };
  g.setupDevMode();
  // dev 发物按 ITEM_DEFS 序可能溢出 50 槽（火把被挤出）——显式补火把到槽 8
  // （键 = VANILLA_ITEM_KEY_BY_ID[8] 驼峰权威，运行时扫 vi_8_ 前缀）
  const torchKey = Object.keys(window.__swItems).find((k) => /^vi_8_/.test(k));
  const torchId = torchKey ? window.__swItems[torchKey] : null;   // ITEM_BY_KEY 值=内部 id 数字
  if (torchId) { g.player.inv.slots[8] = { id: torchId, stack: 99 }; }
  window.__torchId = torchId;
  const p = g.player;
  return {
    ok: true,
    px: p.x, py: p.y, pw: p.w, ph: p.h,
    cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom, viewW: g.camera.viewW, viewH: g.camera.viewH },
    canvasRect: (() => { const r = g.renderer.canvas.getBoundingClientRect(); return { l: r.left, t: r.top }; })(),
  };
});
if (!setup.ok) { console.error('FAIL: __swGame 缺失'); process.exitCode = 1; await browser.close(); process.exit(1); }
console.log('setup ok');


// —— 外层逐格驱动（每格 2 帧等待）——
const grid = await page.evaluate((setup) => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const ptx = Math.floor((p.x + p.w / 2) / 16);
  const pty = Math.floor((p.y + p.h / 2) / 16);
  window.__ssCases = [];
  const canvas = g.renderer.canvas;
  for (let dy = -4; dy <= 2; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const tx = ptx + dx, ty = pty + dy;
      if (!st.inBounds(tx, ty)) continue;
      const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
      window.__ssCases.push({ tx, ty, sx, sy });
    }
  }
  return window.__ssCases.length;
}, setup);

const results = [];
for (let i = 0; i < grid; i++) {
  await page.evaluate((i) => {
    const g = window.__swGame;
    const c = window.__ssCases[i];
    const canvas = g.renderer.canvas;
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + c.sx, clientY: r.top + c.sy, bubbles: true }));
    if (!window.__ssShift) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift', bubbles: true }));
      window.__ssShift = true;
    }
  }, i);
  await new Promise((r) => setTimeout(r, 60)); // ~3-4 帧
  results.push(await page.evaluate((i) => {
    const g = window.__swGame;
    const c = window.__ssCases[i];
    const st = g.world.store;
    const sel = g.player.inv.selected;
    const it = g.player.inv.slots[sel];
    void it;
    return {
      tx: c.tx, ty: c.ty,
      tile: st.get(c.tx, c.ty),
      strategy: g.smartSelect.strategy,
      slot: g.smartSelect.slot,
      selected: sel,
      selName: document.querySelector('.sw-hotbar-name')?.textContent ?? null,
    };
  }, i));
}
// 松 Shift 还原检查
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift', bubbles: true }));
  window.__ssShift = false;
});
await new Promise((r) => setTimeout(r, 120));
const restored = await page.evaluate(() => ({ selected: window.__swGame.player.inv.selected }));

// 分析：空气格 → 选中应为火把
const air = results.filter((s) => s.tile === 0);
const solid = results.filter((s) => s.tile !== 0);
const airBad = air.filter((s) => !/火把|Torch/i.test(s.selName ?? ''));
console.log(JSON.stringify({
  airCount: air.length, solidCount: solid.length,
  airStrategies: [...new Set(air.map((s) => s.strategy))],
  solidStrategies: [...new Set(solid.map((s) => s.strategy))],
  airSelNames: [...new Set(air.map((s) => s.selName))],
  solidSelNames: [...new Set(solid.map((s) => s.selName))],
  airBadCount: airBad.length,
  airBadSample: airBad.slice(0, 6),
  restoredSelected: restored.selected,
  errs: errs.slice(0, 3),
}, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };

A(air.length > 0, '无空气采样');
A(airBad.length === 0, `空气格选中非火把 ${airBad.length} 例（用户报的 bug）: ${JSON.stringify(airBad.slice(0, 3))}`);
const solidPicks = solid.filter((s) => /镐/.test(s.selName ?? ''));
console.log('solid 选中镐的比例:', solidPicks.length, '/', solid.length);
A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
