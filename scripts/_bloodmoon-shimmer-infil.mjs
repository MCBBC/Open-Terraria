// 血月×微光湖坡面红浸润——定谳探针 v2(2026-09-27)。
// A. 世界数据:以太湖液体 cell 类型分布(湖底坡面邻液是水还是微光;水洼存在性)
// B. 血月 on/off(驱动 ≥45 帧过 wsDelay 30t 迟滞)→ census+批键(哪张水色表被用)
// C. 湖底坡面两侧分别注水洼/留微光 → 逐 cell 采样像素色(直接甄别"血月只染水")
// D. 血月下 liqgl on/off census(回归定位面)
// 运行:SW_ORIGIN=http://localhost:5233 node tools/run-diag.mjs --timeout=1200000 scripts/_bloodmoon-shimmer-infil.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5233';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- Part A ----
const scan = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const sx = g.world.shimmerX, sy = g.world.shimmerY;
  if (!sx || !sy) return { ok: false, why: 'no-shimmer-center' };
  const X0 = Math.max(0, sx - 140), X1 = Math.min(st.w - 1, sx + 140);
  const Y0 = Math.max(0, sy - 110), Y1 = Math.min(st.h - 1, sy + 110);
  const byType = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let shBot = -1, shL = -1, shR = -1, shTop = -1;
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) {
    const i = st.idx(x, y);
    if (st.liquid[i] <= 0) continue;
    const lt = st.liquidType[i] || 1;
    byType[lt] = (byType[lt] || 0) + 1;
    if (lt === 4) {
      if (shTop < 0 || y < shTop) shTop = y;
      if (y > shBot) shBot = y;
      if (shL < 0 || x < shL) shL = x;
      if (x > shR) shR = x;
    }
  }
  const bottomRows = {};
  for (let y = Math.max(Y0, shBot - 5); y <= shBot; y++) {
    const cnt = {};
    let n = 0;
    for (let x = Math.max(X0, shL - 10); x <= Math.min(X1, shR + 10); x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] <= 0) continue;
      const lt = st.liquidType[i] || 1;
      cnt[lt] = (cnt[lt] || 0) + 1; n++;
    }
    if (n) bottomRows[y] = cnt;
  }
  const slopeNbr = [];
  for (let y = Math.max(Y0, shBot - 8); y <= Math.min(Y1, shBot + 4); y++) {
    for (let x = Math.max(X0, shL - 10); x <= Math.min(X1, shR + 10); x++) {
      const i = st.idx(x, y);
      const sl = st.slope[i];
      if (sl < 1 || sl > 4) continue;
      const nb = [];
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) return;
        const ni = st.idx(nx, ny);
        if (st.liquid[ni] > 0) nb.push(st.liquid[ni] + ':' + (st.liquidType[ni] || 1));
      };
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
      if (nb.length) slopeNbr.push(x + ',' + y + ' s' + sl + ' nb=' + nb.join('|'));
    }
  }
  return {
    ok: true, shimmerCenter: [sx, sy], byType,
    shimmerBox: { top: shTop, bot: shBot, l: shL, r: shR },
    bottomRows, slopeNbrCount: slopeNbr.length, slopeNbrSample: slopeNbr.slice(0, 20),
  };
});
console.log('=== Part A 世界数据 ===');
console.log(JSON.stringify(scan));
if (!scan.ok) process.exit(1);

// ---- 场面:玩家站湖中央水面下 2 格,相机钉位 ----
const pose = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const sx = g.world.shimmerX, sy = g.world.shimmerY;
  let bot = sy;
  for (let y = sy; y < Math.min(st.h - 1, sy + 120); y++) {
    let has = false;
    for (let x = Math.max(0, sx - 60); x <= Math.min(st.w - 1, sx + 60); x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && (st.liquidType[i] || 1) === 4) { has = true; break; }
    }
    if (has) bot = y;
  }
  let surf = sy;
  for (let y = Math.max(0, sy - 60); y <= bot; y++) {
    const i = st.idx(sx, y);
    if (st.liquid[i] > 0 && (st.liquidType[i] || 1) === 4) { surf = y; break; }
  }
  // Part C 场面:湖底左半注水洼(液位 128 类型1),右半保持微光——两侧同域对照
  const bx0 = sx - 12, bx1 = sx - 4, by = bot;   // 左侧 9 格水洼(贴湖底行)
  const cx0 = sx + 4, cx1 = sx + 12;             // 右侧对照(微光)
  for (let x = bx0; x <= bx1; x++) st.setLiquid(x, by, 128, 1);
  // 打光:湖底两侧壁插火把(洞穴无光全黑——_amber-visual-close 判例)
  const torch = window.__swTiles?.['torch'] ?? 4;
  for (let y = surf - 6; y <= bot + 2; y += 4) {
    for (let x = sx - 34; x <= sx + 34; x += 10) st.setTileSilent(x, y, torch, 0, 0);
  }
  g.player.x = sx * 16; g.player.y = (surf + 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__liqglSet = (v) => window.__vlMod.liqglSetForTest(v);
  window.__sampleCells = () => {
    const r = g.renderer;
    const cam = g.camera;
    const cnv = r.canvas;
    const dpr = cnv.width / (cnv.clientWidth || cnv.width);
    const z = cam.zoom;
    const sxOf = (wx) => Math.round((wx - cam.x) * z * dpr + cnv.width / 2);
    const syOf = (wy) => Math.round((wy - cam.y) * z * dpr + cnv.height / 2);
    const lc = document.createElement('canvas');
    lc.width = cnv.width; lc.height = cnv.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(cnv, 0, 0);
    const img = lx.getImageData(0, 0, lc.width, lc.height);
    const px = (tx, ty) => {
      const X = sxOf(tx * 16 + 8), Y = syOf(ty * 16 + 8);
      const i = (Y * lc.width + X) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    return {
      dpr, z, W: cnv.width, H: cnv.height, cam: [cam.x, cam.y],
      waterCells: [[bx0, by], [Math.floor((bx0 + bx1) / 2), by], [bx1, by]].map(([x, y]) => ({ x, y, rgb: px(x, y) })),
      shimmerCells: [[cx0, by - 1], [Math.floor((cx0 + cx1) / 2), by - 1], [cx1, by - 1]].map(([x, y]) => ({ x, y, rgb: px(x, y) })),
      waterStyle: r.waterStyle,
      shoreRef: px(sx - 24, surf - 6),
    };
  };
  window.__renderState = () => {
    const r = g.renderer;
    return {
      waterStyle: r.waterStyle, acc: r._accMode, bloodMoon: g.world.clock.bloodMoon, isDay: g.world.clock.isDay,
      wsDelay: r.wsDelay, fountain: r.scene?.fountainColor ?? -1, capturePass: !!r._capturePass,
      zoneShimmer: !!r.scene?.zoneShimmer,
    };
  };
  return { bot, surf, sx, sy, waterStrip: [bx0, bx1, by] };
});
console.log('pose:', JSON.stringify(pose));

await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.9 });
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__liqKeys = new Map();
  const orig = r.emitLiquidQuadBatch.bind(r);
  r.emitLiquidQuadBatch = function (img, key, data, quads, replay) {
    if (key.startsWith('liq:')) {
      const e = window.__liqKeys.get(key) || { quads: 0 };
      e.quads += quads;
      window.__liqKeys.set(key, e);
    }
    return orig(img, key, data, quads, replay);
  };
  window.__liqKeysReset = () => window.__liqKeys.clear();
});
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
await page.evaluate(() => window.__drive(5));

async function snapPNG(path) { await page.screenshot({ path }); return path; }
async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, sum = 0;
    const W = a.w;
    const hot = new Map();
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++; sum += dd; if (dd > maxd) maxd = dd;
        const bx = (((i >> 2) % W) / 16) | 0, by = ((i >> 2) / W | 0) / 16 | 0;
        const k = bx + ',' + by;
        hot.set(k, (hot.get(k) || 0) + 1);
      }
    }
    const top = [...hot.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 10).map(([k, v]) => k + ':' + v);
    return { n, maxd, mean: n ? sum / n : 0, top };
  }, { a: aFin, b: bFin });
}
const driveK = async (K) => {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
};

console.log('=== Part B:血月 on/off ===');
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await driveK(130);   // wsDelay 30t 迟滞 + 60t 冷却窗(暖机期提交会吃掉切换窗——130 帧双保险)
console.log('BM state:', JSON.stringify(await page.evaluate(() => window.__renderState())));
await page.evaluate(() => window.__liqKeysReset());
await driveK(3);
const keysBM = await page.evaluate(() => [...window.__liqKeys.entries()].map(([k, v]) => k + ' x' + v.quads));
console.log('liqgl 批键(血月):', keysBM.join('  ') || '(none)');
const sBM = await page.evaluate(() => window.__sampleCells());
console.log('BM 逐 cell 采样:', JSON.stringify(sBM));
const finBM = await snapFin();
await snapPNG('/tmp/bm-shimmer-on.png');

await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = false; });
await driveK(130);
console.log('noBM state:', JSON.stringify(await page.evaluate(() => window.__renderState())));
await page.evaluate(() => window.__liqKeysReset());
await driveK(3);
const keysNo = await page.evaluate(() => [...window.__liqKeys.entries()].map(([k, v]) => k + ' x' + v.quads));
console.log('liqgl 批键(无血月):', keysNo.join('  ') || '(none)');
const sNo = await page.evaluate(() => window.__sampleCells());
console.log('noBM 逐 cell 采样:', JSON.stringify(sNo));
const finNo = await snapFin();
await snapPNG('/tmp/bm-shimmer-off.png');
const c1 = await census(finNo, finBM);
console.log('血月 on/off census:', JSON.stringify(c1));

console.log('=== Part D:血月下 liqgl A/B ===');
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await driveK(130);
await page.evaluate(() => { window.__liqglSet(false); });
await driveK(5);
const finA = await snapFin();
const md5A = createHash('md5').update(Buffer.from(finA.b64, 'base64')).digest('hex');
await snapPNG('/tmp/bm-shimmer-liqgl0.png');
await page.evaluate(() => { window.__liqglSet(true); });
await driveK(5);
const finB = await snapFin();
const md5B = createHash('md5').update(Buffer.from(finB.b64, 'base64')).digest('hex');
await snapPNG('/tmp/bm-shimmer-liqgl1.png');
const c2 = await census(finA, finB);
console.log('liqgl on/off census(血月):', JSON.stringify(c2), `md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)}`);

writeFileSync('/tmp/bm-shimmer-scan.json', JSON.stringify({ scan, pose, sBM, sNo, c1, c2 }, null, 1));
console.log('== DONE ==');
process.exit(0);
