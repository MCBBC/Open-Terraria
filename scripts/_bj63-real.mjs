// SW-BJ63 2026-09-11 取证探针 final（一次性,经 tools/probe.mjs 运行）:
// 真世界生成宝箱(BuriedChestsPass 产物)×智能交互高亮对拍。
// v3 已证手摆宝箱链路绿;本探针消灭最后差异面=worldgen 真箱(style 帧值/
// world.chests 注册/暗洞光照),并按 toggle 语义取纯鼠标态(第二次 Ctrl 沿才关)。
import { launchBrowser, openPage, bootstrap, createGame, waitForGame, ledger } from '../tools/probe/lib/index.mjs';
import fs from 'node:fs';

const L = ledger();
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
await waitForGame(page, { log: (m) => console.log(m) });

// ---- 找真世界宝箱 + 开挖取光 + 仪表 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const chestSheets = new Set([21, 467]);
  // 全图扫真宝箱(取第一个,记录 frame/style)
  let found = null;
  for (let x = 20; x < st.w - 20 && !found; x += 1) {
    for (let y = 20; y < st.h - 20 && !found; y += 1) {
      const si = st.idx(x, y);
      if (!(st.flags[si] & 1)) continue;
      const d = tiles.TILE_DEFS[st.type[si]];
      if (d?.vanilla && chestSheets.has(d.vanilla.sheet)) {
        found = { x, y, type: st.type[si], sheet: d.vanilla.sheet, fx: st.frameX[si], fy: st.frameY[si] };
      }
    }
  }
  window.__bj63chest = found;
  if (!found) return;
  const { x: cx, y: cy } = found;
  // 开挖 3×4 净空+地板+火把(暗洞取光;原版 avg>10 门语义保留)
  for (let i = cx - 3; i <= cx + 3; i++) for (let j = cy - 2; j <= cy + 2; j++) {
    const si = st.idx(i, j);
    if (i >= cx && i < cx + 2 && j >= cy && j < cy + 2) continue;   // 保箱体
    st.setTileSilent(i, j, 0, 0, 0); st.setWallSilent(i, j, 0);
  }
  for (let i = cx - 3; i <= cx + 3; i++) st.setTileSilent(i, cy + 2, 1, 0, 0);   // 石地板
  const torchId = (tiles.TILE_BY_KEY ?? {})['torch'] ?? 12;
  st.setTileSilent(cx - 2, cy + 1, torchId, 0, 0);
  g.chunks.markDirtyArea(cx - 4, cy - 3, cx + 4, cy + 4);
  // 玩家落位箱旁
  const pl = g.player;
  pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.respawnTimer = 0;
  pl.x = (cx - 2) * 16; pl.y = (cy + 2) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  g.world.spawnX = cx - 2; g.world.spawnY = cy + 1;

  const { Renderer } = await import('/src/render/Renderer.ts');
  window.__bj63draws = 0;
  if (!Renderer.prototype.__bj63wrapped) {
    const orig = Renderer.prototype.drawSmartInteractTileHighlights;
    Renderer.prototype.drawSmartInteractTileHighlights = function (...a) {
      window.__bj63draws++;
      return orig.apply(this, a);
    };
    Renderer.prototype.__bj63wrapped = true;
  }
  const m = await import('/src/core/SmartInteractTiles.ts');
  window.__bj63frame = () => {
    const f = m.smartInteractTileFrame;
    return { tileWon: f.tileWon, n: f.coords.length, sel: [...f.selected] };
  };
  window.__bj63screenOf = (tx, ty) => {
    const c = g.camera;
    const [sx, sy] = c.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    const cvs = [...document.querySelectorAll('canvas')];
    const vis = cvs.find((cv) => { const r = cv.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const r = vis ? vis.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    return { cx: r.left + sx, cy: r.top + sy };
  };
  window.__bj63diag = () => {
    const g2 = window.__swGame;
    const chest = window.__bj63chest;
    const si = g2.world.store.idx(chest.x, chest.y);
    const [mwx, mwy] = g2.camera.screenToWorld(g2.input.mouseX, g2.input.mouseY);
    const light = g2.lighting.lightAt(chest.x, chest.y);
    return {
      chest, chestEntry: g2.world.chests.find((c) => Math.abs(c.x - chest.x) <= 1 && Math.abs(c.y - chest.y) <= 1) ?? null,
      active: !!(g2.world.store.flags[si] & 1),
      wanted: g2.smartCursor.wanted,
      light, avg: Math.floor((light[0] + light[1] + light[2]) / 3),
      mouseW: [Math.round(mwx), Math.round(mwy)],
      mouseTile: [Math.floor(mwx / 16), Math.floor(mwy / 16)],
    };
  };
});
await page.waitForFunction(() => !!window.__bj63frame, { timeout: 30000 });
const chest = await page.evaluate(() => window.__bj63chest);
if (!chest) { console.log('BJ63: 本世界无真宝箱(小世界 420x220 可能无 BuriedChests 产物)——改跑手摆箱对拍已由 v3 覆盖'); await browser.close(); process.exit(0); }
console.log('BJ63 realChest', JSON.stringify(chest));

// 相机 settle + 指针到箱上
await new Promise((r) => setTimeout(r, 1500));
const pos = await page.evaluate(() => window.__bj63screenOf(window.__bj63chest.x + 0, window.__bj63chest.y + 0));
await page.mouse.move(pos.cx, pos.cy, { steps: 4 });
await new Promise((r) => setTimeout(r, 800));

const visibleCanvas = async () => {
  const handles = await page.$$('canvas');
  for (const h of handles) { const bb = await h.boundingBox(); if (bb && bb.width > 0 && bb.height > 0) return h; }
  return handles[0];
};
const shot = async (name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const el = await visibleCanvas();
  await el.screenshot({ path: `/tmp/probe-out/_bj63/${name}.png` });
  return fs.readFileSync(`/tmp/probe-out/_bj63/${name}.png`);
};
fs.mkdirSync('/tmp/probe-out/_bj63', { recursive: true });
const diffBytes = (a, b) => { let n = 0; const m = Math.min(a.length, b.length); for (let i = 0; i < m; i++) if (a[i] !== b[i]) n++; return n; };

// 确保智能光标初始 OFF:若 wanted=true 先按一次 Ctrl 关掉
let pre = await page.evaluate(() => window.__bj63diag());
if (pre.wanted) { await page.keyboard.press('Control'); await new Promise((r) => setTimeout(r, 400)); pre = await page.evaluate(() => window.__bj63diag()); }

// ---- 态A:真箱 × 纯鼠标(智能光标 OFF —— 预期无高亮=原版) ----
const bufA = await shot('realA-off');
const sA = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws, diag: window.__bj63diag() }));

// ---- 态B:Ctrl toggle ON(按住 200ms 跨帧——★down/up 同帧沿会丢,探针 v4 伪影)----
await page.keyboard.down('Control');
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.up('Control');
await new Promise((r) => setTimeout(r, 800));
const bufB = await shot('realB-on');
const sB = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws, diag: window.__bj63diag() }));

// ---- 态C:Ctrl 再按(toggle OFF)—— 预期高亮消失 ----
await page.keyboard.down('Control');
await new Promise((r) => setTimeout(r, 200));
await page.keyboard.up('Control');
await new Promise((r) => setTimeout(r, 600));
const bufC = await shot('realC-off');
const sC = await page.evaluate(() => ({ frame: window.__bj63frame(), draws: window.__bj63draws, diag: window.__bj63diag() }));

L.chk('真箱在场+active+光照 avg>10（火把场）', !!chest && sA.diag.active && sA.diag.avg > 10,
  `chest=${JSON.stringify(chest)} avg=${sA.diag.avg} active=${sA.diag.active}`);
L.chk('态A 智能光标 OFF:无候选（原版本相,真箱同）', sA.frame.tileWon === false && sA.frame.n === 0, JSON.stringify({ f: sA.frame, wanted: sA.diag.wanted }));
L.chk('态B Ctrl toggle ON:tileWon+候选≥4', sB.frame.tileWon === true && sB.frame.n >= 4, JSON.stringify({ f: sB.frame, wanted: sB.diag.wanted, mouseTile: sB.diag.mouseTile }));
// ★真世界画面有动画（火把闪/水/小怪）——像素 diff 在此仅作留档,不作断言（v3 手摆场已证像素可视）
L.chk('态B 截图留档', bufB.length > 0, `bytes=${bufB.length} diffAB(留档)=${diffBytes(bufA, bufB)}`);
L.chk('态C toggle OFF:候选清空', sC.frame.tileWon === false && sC.frame.n === 0, JSON.stringify({ f: sC.frame, wanted: sC.diag.wanted }));

console.log('BJ63 SUM', JSON.stringify({ sA: { ...sA, diag: undefined, d: sA.diag }, sB: { ...sB, d: sB.diag }, sC: { ...sC, d: sC.diag }, diffs: { AB: diffBytes(bufA, bufB), AC: diffBytes(bufA, bufC) } }));
await browser.close();
process.exit(L.exitCode());
