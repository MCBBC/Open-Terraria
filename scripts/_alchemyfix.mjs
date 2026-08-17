// 炼金台贴图故障修复·终版探针（2026-08-17）：
// ①扫自然生成的 355/354 足迹（生成端帧 = Place3x3 矩阵）
// ②传送至该处，视觉逐格 3×3 采样：塌碎失败模式 = 9 格同一碎片；正常 ≥6 种 + 动画
// ③零帧化（= 用户存量存档形态）→ invalidate → 再验一轮
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
// 并行会话在写 TownNPC 社交系统（socialUpdate :970 已调用、方法未落地，首 tick 即抛
// 且打断渲染循环）。★不可 document-start 直 import TownNPC（抢模块图首执行权，
// 循环依赖 TDZ 'AVOIDED_BY_NPC_SHEETS' 炸启动）——改为轮询等 __swGame 出现
//（游戏模块图已执行完，同 URL import 只取缓存），世界生成尚需数秒，桩必先落地
await page.evaluateOnNewDocument(() => {
  const poll = () => {
    if (window.__swGame) {
      import('/src/entities/TownNPC.ts').then((m) => {
        if (m?.TownNPC && typeof m.TownNPC.prototype.socialUpdate !== 'function') {
          m.TownNPC.prototype.socialUpdate = function () { return false; };
        }
      }).catch(() => {});
      return;
    }
    setTimeout(poll, 20);
  };
  poll();
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
} catch {
  const dbg = await page.evaluate(() => ({
    hasGame: !!window.__swGame,
    keys: window.__swGame ? Object.keys(window.__swGame).slice(0, 15) : null,
    hasPlayer: !!(window.__swGame && window.__swGame.player),
    loading: !!document.querySelector('.loading, #loading'),
  })).catch(e => ({ evalFail: String(e).slice(0, 120) }));
  console.log('BOOT-FAIL', JSON.stringify({ dbg, errors: errors.slice(0, 5) }, null, 1));
  await browser.close();
  process.exit(2);
}
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  // 并行会话在写 TownNPC 社交系统（socialUpdate 尚未落地，:970 调用即抛）——
  // 探针侧中性桩绕开（false=非社交态→照常游走），不动仓库文件
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (typeof TownNPC.prototype.socialUpdate !== 'function') {
    TownNPC.prototype.socialUpdate = function () { return false; };
  }
  const { tileAnim } = await import('/src/render/TileAnim.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const ALCHEMY = TILE_BY_KEY['v_355_alchemy_table'];
  const BEWITCH = TILE_BY_KEY['v_354_bewitching_table'];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ---- ① 自然足迹扫描 ----
  let found = null;
  const anchors = [];
  for (let y = 0; y < st.h && !found; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || (st.type[i] !== ALCHEMY && st.type[i] !== BEWITCH)) continue;
      // 锚点 = 左上格（左/上无同类）
      const l = st.idx(x - 1, y), u = st.idx(x, y - 1);
      if (st.type[l] === st.type[i] || st.type[u] === st.type[i]) continue;
      const frames = [];
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        const ii = st.idx(x + dx, y + dy);
        frames.push([st.frameX[ii], st.frameY[ii]]);
      }
      const matrixOK = frames.every(([fx, fy], k) => fx === (k % 3) * 18 && fy === Math.floor(k / 3) * 18);
      anchors.push({ x, y, t: st.type[i] === ALCHEMY ? 'alch' : 'bew', matrixOK });
      found ??= { x, y, matrixOK, frames };
      break;   // 记录首个，继续扫计数无必要
    }
  }
  if (!found) return { noTable: true };

  // ---- ② 传送 + 视觉采样 ----
  const cam = g.camera, cv = g.renderer.canvas;
  const spx = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const hash = (d) => { let h = 0; for (let i = 0; i < d.length; i += 12) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; return h; };
  const cellsHash = () => {
    const z = cam.zoom, s = Math.max(2, Math.round(12 * z));
    const cells = [];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const [sx, sy] = spx((found.x + dx) * 16 + 2, (found.y + dy) * 16 + 2);
      cells.push(hash(g.renderer.ctx.getImageData(sx, sy, s, s).data));
    }
    return cells;
  };
  p.x = found.x * 16 + 24; p.y = (found.y + 1) * 16 - p.h; p.vx = 0; p.vy = 0;
  await wait(1200);   // 相机跟随 + 素材懒加载 + 烘焙
  const c1 = cellsHash();
  await wait(400);
  const c2 = cellsHash();
  const naturalVis = { cells: c1, distinct: new Set(c1).size, coherent: new Set(c1).size >= 6, animating: JSON.stringify(c1) !== JSON.stringify(c2) };

  // ---- ③ 零帧 legacy（用户存量存档形态） ----
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const ii = st.idx(found.x + dx, found.y + dy);
    st.frameX[ii] = 0; st.frameY[ii] = 0;
  }
  const cc = g.renderer.chunkCache ?? g.renderer.chunks;
  if (cc?.invalidateAll) cc.invalidateAll();
  else for (const k of Object.keys(g.renderer)) { const v = g.renderer[k]; if (v?.invalidateAll) v.invalidateAll(); }
  await wait(1000);
  const z1 = cellsHash();
  await wait(400);
  const z2 = cellsHash();
  const legacyVis = { cells: z1, distinct: new Set(z1).size, coherent: new Set(z1).size >= 6, animating: JSON.stringify(z1) !== JSON.stringify(z2) };

  return { anchors: anchors.length, first: found, naturalVis, legacyVis };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 4)));
const v = out.naturalVis ?? {};
const l = out.legacyVis ?? {};
await browser.close();
process.exit(errors.length || !(v.coherent && v.animating && l.coherent && l.animating) ? 1 : 0);
