// ★BJ317 复现探针 v2：池水贴屏幕边缘被渲染成"瀑布下流/边缘变体"样式（用户实报）。
// 机制假说（已由 v1 draw 记录实锤）：液体管线 P2-P7 只跑液面包围盒（钳到内窗），
//  内窗边缘水格的窗外邻格 hasVisA 恒 0（P1 无、P2 不算）→ P4 误判"该侧无可见液体"
//  → 误用边缘变体带（sx=0/32 + oy 16/32 = 瀑布侧柱纹理；表面格还丢 1280 静态带）。
// 本探针：no-op camera.follow 全手动摆机位，四边缘（左右上下）+ 各自内移 8 格对照；
//  hook drawImage 记录 48×1360（水体）/512×40（瀑布条）源矩形 → 按世界 tile 分桶对比。
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

// ---- 建池 + 玩家移出 + 相机 follow no-op + 确定性套件 ----
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player, st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  for (let dx = -70; dx <= 70; dx++) for (let dy = -24; dy <= 20; dy++) st.setTile(bx + dx, by + dy, 0);
  for (let dx = -70; dx <= 70; dx++) for (let dy = 6; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
  for (let dx = -42; dx <= 42; dx++) for (let dy = 0; dy <= 5; dy++) st.setLiquid(bx + dx, by + dy, 255, 1);
  for (const wx of [-44, -43, 43, 44]) for (let dy = -2; dy <= 6; dy++) st.setTile(bx + wx, by + dy, 1);
  // 玩家移出池区（右侧地面上站定）
  p.x = (bx + 60) * 16 + 8; p.y = (by + 6) * 16 - p.h - 2; p.vx = 0; p.vy = 0;
  // 相机 follow 停用（Game.ts:10961 每帧调——实例级 no-op 掩蔽）
  g.camera.follow = () => {};
  // 天气钉死
  try {
    const w = g.world.weather;
    if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
    const fx = g.renderer.weatherFx;
    if (fx) { (fx.pool || []).forEach((d) => { d.active = false; }); (fx.snow || []).forEach((d) => { d.active = false; }); (fx.sand || []).forEach((d) => { d.active = false; }); }
  } catch { /* 容忍 */ }
  return { bx, by, surfY: by * 16 };
});
console.log('[probe] scene', JSON.stringify(scene));
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
// ★真实 rAF 等待：pump 直泵 fixedUpdate 不渲染——场景 build 的脏 chunk 队列要靠
//  真实渲染帧逐个重绘（首拍 tile 层空=chunk 队列未排干,截图只剩天空的病根）
for (let i = 0; i < 60; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

// ---- drawImage 取证钩子 ----
await page.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (globalThis.__wf317) return;
  const recs = [];
  const stat = { nAll: 0 };
  let armed = false;
  const orig = proto.drawImage;
  // ★恒 9 参转发会把 3/5 参调用变成 sw=0 静默 no-op（bisect2 实锤:世界层整消失）
  //  ——必须按实参原样 apply
  proto.drawImage = function (...args) {
    try {
      stat.nAll++;
      const img = args[0];
      if (armed && img && img.width === 48 && img.height === 1360) {
        recs.push({ k: 'body', sx: args[1], sy: args[2], sw: args[3], sh: args[4], dx: args[5], dy: args[6], dw: args[7], dh: args[8] });
      } else if (armed && img && img.width === 512 && img.height === 40) {
        recs.push({ k: 'strip', sx: args[1], sy: args[2], sw: args[3], sh: args[4], dx: args[5], dy: args[6], dw: args[7], dh: args[8] });
      }
    } catch { /* 忽略 */ }
    return orig.apply(this, args);
  };
  globalThis.__wf317 = {
    arm(v) { armed = !!v; if (v) { recs.length = 0; stat.nAll = 0; } },
    dump() { return { recs: recs.slice(), nAll: stat.nAll }; },
    cam() {
      const g = window.__swGame, cam = g.camera;
      return { camX: cam.x, camY: cam.y, zoom: cam.zoom, dpr: window.devicePixelRatio,
        vw: cam.viewW, vh: cam.viewH };
    },
    setCam(x, y) { const c = window.__swGame.camera; c.x = x; c.y = y; },
    geom() {
      const cam = window.__swGame.camera;
      return { halfW: cam.viewW / 2 / cam.zoom, halfH: cam.viewH / 2 / cam.zoom };
    },
  };
});
const geom = await page.evaluate(() => globalThis.__wf317.geom());
console.log('[probe] geom', JSON.stringify(geom));

// ---- 机位：edgeCutWorldX = 屏缘切在哪个世界 px（左缘：leftPx=该值）----
async function captureCase(name, camX, camY, shot) {
  await page.evaluate(({ x, y }) => globalThis.__wf317.setCam(x, y), { x: camX, y: camY });
  await pump(page, 4);
  const cam0 = await page.evaluate(() => globalThis.__wf317.cam());
  await page.evaluate(() => globalThis.__wf317.arm(true));
  await pump(page, 12);
  const { recs, nAll } = await page.evaluate(() => globalThis.__wf317.dump());
  const cam = await page.evaluate(() => globalThis.__wf317.cam());
  await page.evaluate(() => globalThis.__wf317.arm(false));
  const drift = Math.abs(cam.camX - cam0.camX) + Math.abs(cam.camY - cam0.camY);
  if (shot) {
    // ★直读 renderer.canvas（page.screenshot 会被 z=60 的 sw-credits 覆盖层挡成天空）
    const b64 = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
    writeFileSync(`${OUT}/bj317-${shot}.png`, Buffer.from(b64.split(',')[1], 'base64'));
  }
  // device px → world tile 分桶
  const s = cam.zoom * cam.dpr, leftPx = cam.camX - cam.vw / 2 / cam.zoom, topPx = cam.camY - cam.vh / 2 / cam.zoom;
  for (const r of recs) {
    r.tx = Math.floor((r.dx / s + leftPx) / 16);
    r.ty = Math.floor((r.dy / s + topPx) / 16);
  }
  writeFileSync(`${OUT}/recs-${name}.json`, JSON.stringify({ cam, recs }, null, 1));
  console.log(`[probe] ${name}: recs=${recs.length} nAll=${nAll} drift=${drift.toFixed(1)} cam=(${cam.camX.toFixed(0)},${cam.camY.toFixed(0)})`);
  return recs;
}

const { bx, by } = scene;
const hw = geom.halfW, hh = geom.halfH;
const CUT = 8;   // 切列偏移（-8px：切在列中间,避免边界取整歧义）
// 左缘：leftPx = (bx+10)*16 - 8
const recsL = await captureCase('L-edge', (bx + 10) * 16 - CUT + hw, (by + 3) * 16, 'L-edge');
const recsLi = await captureCase('L-inset', (bx + 10) * 16 - CUT + hw - 8 * 16, (by + 3) * 16, 'L-inset');
// 右缘：rightPx = (bx+34)*16 + 8
const recsR = await captureCase('R-edge', (bx + 34) * 16 + CUT - hw, (by + 3) * 16, 'R-edge');
const recsRi = await captureCase('R-inset', (bx + 34) * 16 + CUT - hw + 8 * 16, (by + 3) * 16, null);
// 上缘：topPx = (by+2)*16 - 8（表面行 by/by+1 全在屏上方,顶可见水行 = 池体行 by+2）
const recsT = await captureCase('T-edge', (bx + 10) * 16 - CUT + hw, (by + 2) * 16 - CUT + hh, 'T-edge');
const recsTi = await captureCase('T-inset', (bx + 10) * 16 - CUT + hw, (by + 2) * 16 - CUT + hh - 8 * 16, null);
// 下缘：bottomPx = (by+4)*16 + 8（池底行 by+5 贴屏底）
const recsB = await captureCase('B-edge', (bx + 10) * 16 - CUT + hw, (by + 4) * 16 + CUT - hh, 'B-edge');
const recsBi = await captureCase('B-inset', (bx + 10) * 16 - CUT + hw, (by + 4) * 16 + CUT - hh + 8 * 16, null);

// ---- 对比：edge vs inset 的同世界格 (tx,ty) 源带集合 ----
function perCell(recs) {
  const m = {};
  for (const r of recs) {
    if (r.k !== 'body') continue;
    (m[`${r.tx},${r.ty}`] ??= new Set()).add(`sx${r.sx},sy${r.sy % 80},sh${r.sh},dh${r.dh}`);
  }
  return m;
}
function compare(name, edge, inset) {
  const a = perCell(edge), b = perCell(inset);
  let diffs = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    const va = [...(a[k] ?? [])].sort().join(';');
    const vb = [...(b[k] ?? [])].sort().join(';');
    if (va !== vb) {
      diffs++;
      if (diffs <= 6) console.log(`[probe] ${name} DIFF @${k}\n    edge: ${va || '(none)'}\n   inset: ${vb || '(none)'}`);
    }
  }
  console.log(`[probe] ${name}: diffCells=${diffs}`);
  return diffs;
}
const rows = [by, by + 1, by + 2, by + 3, by + 4];
const colFilter = (recs, lo, hi) => recs.filter((r) => r.tx >= lo && r.tx <= hi && rows.includes(r.ty));
console.log('[probe] === 四边缘判别（只比池区行列） ===');
const dL = compare('LEFT ', colFilter(recsL, bx + 8, bx + 60), colFilter(recsLi, bx + 8, bx + 60));
const dR = compare('RIGHT', colFilter(recsR, bx - 10, bx + 36), colFilter(recsRi, bx - 10, bx + 36));
const dT = compare('TOP  ', colFilter(recsT, bx + 10, bx + 60), colFilter(recsTi, bx + 10, bx + 60));
const dB = compare('BOT  ', colFilter(recsB, bx + 10, bx + 60), colFilter(recsBi, bx + 10, bx + 60));
console.log(`[probe] VERDICT left=${dL} right=${dR} top=${dT} bottom=${dB}（>0=该边缘复现）`);
await browser.close();
console.log('[probe] done');
