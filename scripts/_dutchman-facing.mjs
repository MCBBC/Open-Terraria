// 荷兰飞盗船 491 朝向定谳探针(2026-09-29,左右双向对照)。
// 判据:修复后 facing=vanilla spriteDirection(sd=-sign(vx)),翻面⟺facing==1
// (Main.cs:23357-23361 + NPC.cs:41012);底图未翻态船首在贴图右侧(md5
// 0bcb71a1f1e2ceb29bfc4482069ad0d1 与 terraria-assets 全等)。
// 场景:地表正午(freezeClock) → 相机抬升 700px 全亮天幕 → 生成 491 钉死 AI/物理 →
//   状态 A:玩家在右 450px,ship.facing=-1(不翻面) → 截 facing-A-player-right.png
//   状态 B:玩家在左 450px,ship.facing=+1(翻面)   → 截 facing-B-player-left.png
// 数判:①镜像差分 B区 ≈ hmirror(A区)(失配像素 < max(2%区积,4×漂移底)——
//   证明渲染门随 facing 真翻转);②船舷伸差:不翻面态 bowsprit(桅伸 +382)在玩家侧
//   → rightExtent>leftExtent,翻面态反号(阈 >max(30·z, 3×漂移))。
// 视判:PNG 落盘 SW_PROBE_OUT/dutchman-facing/ 供骷髅船首 vs 玩家方位目验留档。
// 运行:SW_ORIGIN=http://localhost:5261 node tools/run-diag.mjs --timeout=300000 scripts/_dutchman-facing.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'dutchman-facing');
mkdirSync(OUT, { recursive: true });
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260929 });
L.chk('createGame', gen.ok, gen.why ?? '');
await freezeClock(page, { tod: 0.5 });   // 正午
await pump(page, 30);

// ---- 生成 491(出生即抬升至地表上空 700px 全亮天幕) ----
const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });
const sp = await spawnEnemy(page, 491, ppos.x, ppos.y - 700);
L.chk('spawn 491', sp.ok, JSON.stringify(sp));
await pump(page, 8);                     // 首个 fixedUpdate 生成 4 炮

// ---- 钉死:AI/物理/玩家全冻结 + 相机/船/玩家摆位 + 渲染帧旗 + 几何 ----
const pin = await page.evaluate(async () => {
  const g = window.__swGame;
  const ship = g.entities.enemies.find((e) => e.vanillaId === 491 && !e.dead);
  if (!ship) return { ok: false, why: 'no-ship' };
  const cannons = g.entities.enemies.filter((e) => e.vanillaId === 492 && !e.dead);
  if (cannons.length !== 4) return { ok: false, why: 'cannons=' + cannons.length };
  ship.fixedUpdate = () => {};
  for (const c of cannons) c.fixedUpdate = () => {};
  if (g.player) { try { g.player.fixedUpdate = () => {}; } catch { /* 域差异 */ } }
  // 相机不钉:Game.fixedUpdate 每帧 follow(玩家)=0.15 缓动+黑幕硬吸合旁路——钉自身
  // 必被拉回(实测两跑均弹回玩家位)。改为让【玩家站位=相机收敛点】:
  // 玩家钉在船旁 (X0±420, 船心上方 80) → follow 自然收敛到该点,船整船入画
  // (船心屏 x=±420 偏移 → 舷伸 [−208,+382] 全入;sy=+80 → 纵跨 [−460,+74] 全入)。
  ship.vx = 0; ship.vy = 0; ship.visAngle = 0; ship.spawnAlpha = 0;
  // 渲染旗(drawEnemy 计数增长=有新帧)
  const R = Object.getPrototypeOf(g.renderer);
  if (!window.__fdFlag) {
    window.__fdFlag = { n: 0 };
    const oe = R.drawEnemy;
    R.drawEnemy = function (...a) { window.__fdFlag.n++; return oe.apply(this, a); };
  }
  // 几何:世界→canvas backing px(同 _dutchman-frame-window 口径)
  const cam = g.camera, c = g.renderer.canvas;
  const kx = c.width / cam.viewW, ky = c.height / cam.viewH;
  const z = cam.zoom * ((kx + ky) / 2);
  const sxOf = (wx) => (wx - cam.x) * cam.zoom * kx + c.width / 2;
  const syOf = (wy) => (wy - cam.y) * cam.zoom * ky + c.height / 2;
  // 摆位:船心 X0=出生 x、天幕高度=当前玩家 cy−700(出生位);玩家=相机收敛点。
  // side=±1:玩家在船旁 ±420(船心上方 80)→ 相机收敛后船心屏位 640∓420(视觉对);
  // side=0:玩家钉船心轴上 → 相机收敛=船心(640)判读区 ±400 全不裁(镜像数判对)。
  const X0 = ship.cx, skyY = g.player.cy - 700;
  window.__fdPlace = (side, facing) => {
    ship.x = X0 - ship.w / 2; ship.y = skyY - ship.h / 2;
    const p = g.player;
    p.x = X0 + 420 * side - p.w / 2; p.y = skyY - 80 - p.h / 2;
    ship.facing = facing ?? (side > 0 ? -1 : 1);
    ship.visAngle = 0; ship.vx = 0; ship.spawnAlpha = 0;
  };
  window.__fdWaitFrame = async (minN) => {
    const t0 = performance.now();
    while (window.__fdFlag.n < minN) {
      await new Promise((r) => requestAnimationFrame(r));
      if (performance.now() - t0 > 5000) { g.render(); window.__fdFlag.n++; return 'manual-render'; }
    }
    return 'natural';
  };
  // 判读区:船心 ±400·z × 纵 [-470,+90]·z(锚 y=460;玩家 ±420 起在区外——半宽 410>400)
  window.__fdGeo = () => {
    const sx = sxOf(ship.cx), sy = syOf(ship.cy);
    const x0 = Math.max(0, Math.round(sx - 400 * z)), x1 = Math.min(c.width, Math.round(sx + 400 * z));
    const y0 = Math.max(0, Math.round(sy - 470 * z)), y1 = Math.min(c.height, Math.round(sy + 90 * z));
    return { sx, sy, z, x0, y0, w: x1 - x0, h: y1 - y0, cw: c.width, ch: c.height };
  };
  // 捕获:全画布 PNG + 判读区灰度差分器(基准=传入的先前区位图)
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  window.__fdShot = async () => {
    const geo = window.__fdGeo(), cv = g.renderer.canvas;
    await window.__fdWaitFrame(window.__fdFlag.n + 1);
    sctx.canvas.width = geo.w; sctx.canvas.height = geo.h;
    sctx.drawImage(cv, geo.x0, geo.y0, geo.w, geo.h, 0, 0, geo.w, geo.h);
    return { url: cv.toDataURL('image/png'), data: sctx.getImageData(0, 0, geo.w, geo.h).data, geo };
  };
  return { ok: true, geo: window.__fdGeo() };
});
L.chk('pin', pin.ok, JSON.stringify(pin));

// ---- 素材预热:八贴图懒解码齐活前不入判(冷 SW_CACHE 实测 P1 缺帆/旗层=镜像差假红) ----
const warm = await page.evaluate(async () => {
  const g = window.__swGame;
  const names = ['NPC_491', 'NPC_492', 'Extra_40', 'Extra_41', 'Extra_42', 'Extra_43', 'Extra_44', 'Extra_45'];
  const t0 = performance.now();
  while (performance.now() - t0 < 10000) {
    const ok = names.every((n) => (g.renderer.atlas.ensureVImage('vanilla/' + n + '.png')?.width ?? 0) > 0);
    if (ok) { g.render(); return { ok: true, ms: Math.round(performance.now() - t0) }; }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { ok: false, why: 'images not decoded in 10s' };
});
L.chk('素材预热八贴图', warm.ok, JSON.stringify(warm));

// ---- 数判对 P1/P2:玩家钉船心轴(相机收敛=船心,判读区不裁),仅翻 facing ----
await page.evaluate(() => { window.__fdPlace(0, -1); });
await pump(page, 70);                    // follow 0.15 缓动收敛(~30t <0.01px)
const P1 = await page.evaluate(() => window.__fdShot());
writeFileSync(join(OUT, 'facing-P1-c0.png'), Buffer.from(P1.url.split(',')[1], 'base64'));
// 无船底版:船平移出画布(相机随玩家不动→同窗纯背景)取船体掩码,剔山体/minimap/HUD
const BG = await page.evaluate(async () => {
  const s = window.__swGame.entities.enemies.find((e) => e.vanillaId === 491);
  const ox = s.x; s.x = window.__swGame.camera.x - 4000;
  const r = await window.__fdShot();
  s.x = ox;
  return r;
});
await page.evaluate(() => { window.__fdPlace(0, 1); });
await pump(page, 5);                     // 相机已收敛,仅等新渲染帧
const P2 = await page.evaluate(() => window.__fdShot());
writeFileSync(join(OUT, 'facing-P2-c1.png'), Buffer.from(P2.url.split(',')[1], 'base64'));

// ---- 状态 A:玩家在右,facing=-1(不翻面) ----
await page.evaluate(() => { window.__fdPlace(1); });
await pump(page, 70);
const A = await page.evaluate(() => window.__fdShot());
writeFileSync(join(OUT, 'facing-A-player-right.png'), Buffer.from(A.url.split(',')[1], 'base64'));

// ---- 状态 B:玩家在左,facing=+1(翻面) ----
await page.evaluate(() => { window.__fdPlace(-1); });
await pump(page, 70);
const B = await page.evaluate(() => window.__fdShot());
writeFileSync(join(OUT, 'facing-B-player-left.png'), Buffer.from(B.url.split(',')[1], 'base64'));

// ---- 漂移底:P1 复拍(相机/船/玩家同位) ----
await page.evaluate(() => { window.__fdPlace(0, -1); });
await pump(page, 70);
const P1b = await page.evaluate(() => window.__fdShot());
writeFileSync(join(OUT, 'facing-P1b-drift.png'), Buffer.from(P1b.url.split(',')[1], 'base64'));

// ---- 数判:镜像差分 + 舷伸差分(page 外做像素账,数据已带出) ----
// 两态相机收敛点=玩家位(±420)→船心屏位 S_A=640−D/S_B=640+D 对称:镜像对映
// B_x = (S_A+S_B) − A_x;两判读区各被画布边对称裁 180px → 有效重叠区按映射逐像素对。
function mismatch(d1, d2, g1, g2, mirrorBase = null) {
  const w1 = g1.w, w2 = g2.w, h = Math.min(g1.h, g2.h);
  let n = 0, valid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w2; x++) {
      let x1;
      if (mirrorBase == null) x1 = x - (g2.x0 - g1.x0);           // 同位直拍:A2 vs A
      else x1 = mirrorBase - (g2.x0 + x) - g1.x0;                 // 镜像:B_x ↔ (S_A+S_B)−B_x
      if (x1 < 0 || x1 >= w1) continue;
      valid++;
      const i = (y * w2 + x) * 4, j = (y * w1 + x1) * 4;
      const d = Math.abs(d1[i] - d2[j]) + Math.abs(d1[i + 1] - d2[j + 1]) + Math.abs(d1[i + 2] - d2[j + 2]);
      if (d > 24) n++;
    }
  }
  return { n, valid };
}
function shipPx(d, geo, x, y) {
  const w = geo.w;
  const i = (y * w + x) * 4;
  const sxL = Math.round(geo.sx - geo.x0);
  const k = (x < sxL ? 2 : w - 3) * 4 + y * w * 4;
  const s = d[i] + d[i + 1] + d[i + 2];
  const sky = d[k] + d[k + 1] + d[k + 2];
  return Math.abs(s - sky) > 90;         // 暗木/白帆/骨白 vs 山雾/天——行内缘取样为本地背景
}
function extents(d, geo) {
  const { w, h } = geo, sxL = Math.round(geo.sx - geo.x0);
  let minX = 1e9, maxX = -1e9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (shipPx(d, geo, x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
  }
  if (minX > maxX) return { left: -1, right: -1 };
  return { left: sxL - minX, right: maxX - sxL };
}
{
  const drift = mismatch(P1.data, P1b.data, P1.geo, P1b.geo);
  const dRate = drift.n / Math.max(1, drift.valid);
  // 镜像对映(船体掩码内):P1 像素 x ↔ P2 像素 2·sx−x;仅计【两态皆判为船体】的像素,
  // 且限船壳纵带 [sy−180, sy+80](云/山雾不入;船不透明处两态皆船)——BG 底版因船体
  // 光源全局改曝光(实测 97% 像素联动)不可作掩码,故用双态光度分类。
  const g1 = P1.geo, w = g1.w, h = g1.h;
  const syL = Math.round(g1.sy - g1.y0);
  const y0 = Math.max(0, syL - 180), y1 = Math.min(h, syL + 80);
  const base = Math.round(2 * P1.geo.sx);
  let mm = 0, maskN = 0;
  const colBucket = {};
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const xm = base - (g1.x0 + x) - g1.x0;
      if (xm < 0 || xm >= w) continue;
      if (!shipPx(P1.data, g1, x, y) || !shipPx(P2.data, P2.geo, xm, y)) continue;
      maskN++;
      const i = (y * w + x) * 4, j = (y * P2.geo.w + xm) * 4;
      const d = Math.abs(P2.data[j] - P1.data[i]) + Math.abs(P2.data[j + 1] - P1.data[i + 1]) + Math.abs(P2.data[j + 2] - P1.data[i + 2]);
      if (d > 24) {
        mm++;
        const b = Math.floor((x - sxL) / 40) * 40;   // 船心相对坐标分桶(40px)
        colBucket[b] = (colBucket[b] ?? 0) + 1;
      }
    }
  }
  const mRate = mm / Math.max(1, maskN);
  const buckets = Object.entries(colBucket).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
  L.chk('镜像差分 P2≈hmirror(P1)(船壳带掩码内)', mRate < Math.max(0.02, dRate * 4 + 0.01), `mm=${(100 * mRate).toFixed(2)}% 掩码=${maskN} 全域漂移=${(100 * dRate).toFixed(2)}%`);
  L.say(`失配列分布(船心相对px:count) ${buckets}`);
  const eA = extents(A.data, A.geo), eB = extents(B.data, B.geo);
  const thr = 30 * A.geo.z;
  L.chk('不翻面态舷伸:右(玩家侧)>左', eA.right - eA.left > thr, `A right=${eA.right} left=${eA.left} 阈=${thr.toFixed(0)}`);
  L.chk('翻面态舷伸:左(玩家侧)>右', eB.left - eB.right > thr, `B left=${eB.left} right=${eB.right} 阈=${thr.toFixed(0)}`);
  L.say(`geo z=${A.geo.z.toFixed(3)} 区=${A.geo.w}x${A.geo.h} 掩码=${maskN} mm=${(100 * mRate).toFixed(2)}% 漂移=${(100 * dRate).toFixed(2)}% A右/左=${eA.right}/${eA.left} B左/右=${eB.left}/${eB.right}`);
}

await browser.close();
console.log(L.ok ? 'ALL PASS' : 'HAS FAIL');
process.exitCode = L.ok ? 0 : 1;
