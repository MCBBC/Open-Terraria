// ★BJ317 复现探针：池水贴屏幕边缘被渲染成"瀑布下流样式"（用户实报两截图）。
// 场景：4200×1200 世界，手工宽池（81 格 × 6 行满液 255），两机位：
//   A（边缘）池右段恰被屏幕右缘切开；B（对照）相机左移 8 格 → 同一批世界格进屏内。
// 取证：hook CanvasRenderingContext2D.drawImage，源 48×1360 = Misc_water_N（液体本体）、
//   512×40 = Waterfall_N（独立瀑布条）——记录 (sx,sy,sw,sh,dx,dy) + 相机态，
//   离线按世界 tile 列分桶：表面带 sy=1280 vs 池体/下流带 sy=48+80k。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj317-waterfall-edge.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const OUT = '/tmp/bj317-out';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
console.log('[probe] createGame', JSON.stringify(gen));
if (!gen.ok) { await browser.close(); process.exit(1); }

// ---- 建池 + 确定性套件（天气钉死/正午）----
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player, st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  // 清场：dx∈[-70,70] dy∈[-24,20]
  for (let dx = -70; dx <= 70; dx++) for (let dy = -24; dy <= 20; dy++) st.setTile(bx + dx, by + dy, 0);
  // 地面：行 by+6..by+16 实心
  for (let dx = -70; dx <= 70; dx++) for (let dy = 6; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
  // 池：水行 by..by+5（255 满），壁 [-44,-43]/[43,44] 行 by-2..by+6
  for (let dx = -42; dx <= 42; dx++) for (let dy = 0; dy <= 5; dy++) st.setLiquid(bx + dx, by + dy, 255, 1);
  for (const wx of [-44, -43, 43, 44]) for (let dy = -2; dy <= 6; dy++) st.setTile(bx + wx, by + dy, 1);
  // 两个玩家立柱（A/B 机位脚下）：列 bx+30 与 bx+22，行 by-2..by+5
  for (const px2 of [30, 22]) for (let dy = -2; dy <= 5; dy++) st.setTile(bx + px2, by + dy, 1);
  // 天气钉死
  try {
    const w = g.world.weather;
    if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
    const fx = g.renderer.weatherFx;
    if (fx) { (fx.pool || []).forEach((d) => { d.active = false; }); (fx.snow || []).forEach((d) => { d.active = false; }); (fx.sand || []).forEach((d) => { d.active = false; }); }
  } catch { /* 域差异容忍 */ }
  return { bx, by, surfY: by * 16 };
});
console.log('[probe] scene', JSON.stringify(scene));
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);   // 液体沉降收敛

// ---- drawImage 取证钩子（源 48×1360=水体 / 512×40=瀑布条）----
await page.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (globalThis.__wf317) return;
  const recs = [];
  let armed = false;
  const orig = proto.drawImage;
  proto.drawImage = function (img, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
      if (armed && img && img.width === 48 && img.height === 1360) {
        recs.push({ k: 'body', sx: a1, sy: a2, sw: a3, sh: a4, dx: a5, dy: a6, dw: a7, dh: a8 });
      } else if (armed && img && img.width === 512 && img.height === 40) {
        recs.push({ k: 'strip', sx: a1, sy: a2, sw: a3, sh: a4, dx: a5, dy: a6, dw: a7, dh: a8 });
      } else if (armed && img && img.width === 306 && img.height === 16) {
        recs.push({ k: 'band', sx: a1, sy: a2, sw: a3, sh: a4, dx: a5, dy: a6, dw: a7, dh: a8 });
      }
    } catch { /* 忽略 */ }
    return orig.call(this, img, a1, a2, a3, a4, a5, a6, a7, a8);
  };
  globalThis.__wf317 = {
    arm(v) { armed = !!v; if (v) recs.length = 0; },
    dump() { return recs.slice(); },
    cam() {
      const g = window.__swGame, cam = g.camera;
      const dpr = window.devicePixelRatio;
      const halfW = cam.viewW / 2 / cam.zoom, halfH = cam.viewH / 2 / cam.zoom;
      return { camX: cam.x, camY: cam.y, zoom: cam.zoom, dpr, halfW, halfH,
        vw: cam.viewW, vh: cam.viewH, cw: g.renderer.canvas.width, ch: g.renderer.canvas.height };
    },
  };
});

// ---- 机位函数：把世界列 tx 对到屏幕右缘（edge）或屏内（inset 格数）----
async function parkCamera(txAtRightEdge, insetTiles, pedestalX) {
  await page.evaluate(({ txAtRightEdge, insetTiles, pedestalX }) => {
    const g = window.__swGame, cam = g.camera, p = g.player;
    const halfW = cam.viewW / 2 / cam.zoom, halfH = cam.viewH / 2 / cam.zoom;
    // A 机位：列 txAtRightEdge 的右边界=屏幕右缘；B 机位：左移 insetTiles 格
    const wx = (txAtRightEdge + 1) * 16 - halfW - insetTiles * 16;
    cam.x = wx + halfW;   // cam.x=视口中心
    // 玩家钉在立柱顶（防相机 follow 拉回）
    p.x = pedestalX * 16 + 8; p.vx = 0; p.vy = 0;
    p.y = 16 * (window.__wf317by - 2) - p.h - 0.5;
    cam.y = 16 * (window.__wf317by + 3);
    p.y = cam.y + halfH - 16 * 7 - p.h;   // 立柱顶（行 by-2 上沿）再减身高
  }, { txAtRightEdge, insetTiles, pedestalX });
  // 玩家物理沉降稳定 + 相机 follow 收敛（玩家与相机同位 → 不漂）
  await pump(page, 30);
}

// 立柱顶 y 基准给页内（简化：直接由 scene.by 推）
await page.evaluate((by) => { window.__wf317by = by; }, scene.by);

const camInfo0 = await page.evaluate(() => {
  const cam = window.__swGame.camera;
  return { halfW: cam.viewW / 2 / cam.zoom, zoom: cam.zoom, vw: cam.viewW, vh: cam.viewH };
});
console.log('[probe] camInfo', JSON.stringify(camInfo0));

// ---- 机位 A：池右段切屏幕右缘（边缘列 = bx+30）----
await parkCamera(scene.bx + 30, 0, scene.bx + 30);
await page.evaluate(() => globalThis.__wf317.arm(true));
await pump(page, 8);
const recsA = await page.evaluate(() => globalThis.__wf317.dump());
const camA = await page.evaluate(() => globalThis.__wf317.cam());
await page.evaluate(() => globalThis.__wf317.arm(false));
const shotA = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
writeFileSync(`${OUT}/bj317-edge.png`, Buffer.from(shotA.split(',')[1], 'base64'));

// ---- 机位 B：相机左移 8 格（同批世界格进屏内）----
await parkCamera(scene.bx + 30, 8, scene.bx + 22);
await page.evaluate(() => globalThis.__wf317.arm(true));
await pump(page, 8);
const recsB = await page.evaluate(() => globalThis.__wf317.dump());
const camB = await page.evaluate(() => globalThis.__wf317.cam());
await page.evaluate(() => globalThis.__wf317.arm(false));
const shotB = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
writeFileSync(`${OUT}/bj317-inset.png`, Buffer.from(shotB.split(',')[1], 'base64'));

// ---- 离线分桶：按世界 tile 列聚合表面行（by 行）的 sy 带 ----
function bucketize(recs, cam) {
  const s = cam.zoom * cam.dpr;
  const leftPx = cam.camX - cam.halfW;
  const topPx = cam.camY - cam.halfH;
  const out = [];
  for (const r of recs) {
    // device px → world px（主循环=恒等变换设备坐标；dx/dy 为设备 px）
    const wx = r.dx / s + leftPx, wy = r.dy / s + topPx;
    const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
    out.push({ ...r, tx, ty, wxy: [Math.round(wx), Math.round(wy)] });
  }
  return out;
}
const bA = bucketize(recsA, camA), bB = bucketize(recsB, camB);
writeFileSync(`${OUT}/recsA.json`, JSON.stringify({ cam: camA, recs: bA }, null, 1));
writeFileSync(`${OUT}/recsB.json`, JSON.stringify({ cam: camB, recs: bB }, null, 1));

const surf = scene.by;
function summarize(b, label) {
  const byCol = {};
  for (const r of b) {
    if (r.ty !== surf && r.ty !== surf + 1) continue;
    const key = `${r.ty}`;
    (byCol[r.tx] ??= {})[key] ??= new Set();
    byCol[r.tx][key].add(`${r.k}:sx${r.sx},sy${r.sy},sh${r.sh},dw${r.dw},dh${r.dh}`);
  }
  const lines = [];
  for (const tx of Object.keys(byCol).map(Number).sort((a, b2) => a - b2)) {
    for (const [ty, set] of Object.entries(byCol[tx])) {
      lines.push(`${label} col=${tx} row=${ty} → ${[...set].join(' | ')}`);
    }
  }
  return lines;
}
const linesA = summarize(bA, 'A-edge');
const linesB = summarize(bB, 'B-inset');
console.log('[probe] === A (edge) surface-row bands ===');
console.log(linesA.slice(0, 60).join('\n'));
console.log('[probe] === B (inset) surface-row bands ===');
console.log(linesB.slice(0, 60).join('\n'));

// 差异判别：同一世界列在 A/B 的 sy 带集合
const norm = (lines) => {
  const m = {};
  for (const ln of lines) {
    const col = Number(ln.match(/col=(\d+)/)[1]);
    const rest = ln.split('→')[1].trim();
    (m[col] ??= new Set()).add(rest);
  }
  return m;
};
const mA = norm(linesA), mB = norm(linesB);
let diffs = 0;
for (const col of Object.keys(mA)) {
  const a = [...(mA[col] ?? [])].sort().join(';');
  const b = [...(mB[col] ?? [])].sort().join(';');
  if (a !== b) { diffs++; console.log(`[probe] DIFF col=${col}\n  A: ${a}\n  B: ${b}`); }
}
console.log(`[probe] verdict: recsA=${recsA.length} recsB=${recsB.length} diffCols=${diffs}`);
console.log(`[probe] strips A=${recsA.filter((r) => r.k === 'strip').length} B=${recsB.filter((r) => r.k === 'strip').length}`);
await browser.close();
console.log('[probe] done');
