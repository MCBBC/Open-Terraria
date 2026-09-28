// 荷兰飞盗船 491/492 动画帧窗重放对照(2026-09-28 六贴图纵切修复刃判别器)。
// 场景:地表正午(freezeClock) → 生成 491(玩家左 430px) → 钉相(实例级 no-op AI +
// dd2LocalAI[3] 钉各窗中点) → num132=0..7 逐相截帧 + 六部件区域活性差分(相 0 基准);
// 炮 492 ai2=0..8 九姿态扫(帧行=ai[2],FindFrame case 492 :71941,非 4t 钟)。
// ★headless rAF 供给不稳(实测 ~10fps 甚至更稀)——每相截帧前等 drawEnemy 渲染旗
//   (钉相后必须有【新渲染帧】才允许读画布,防旧帧假象);超时 5s 兜底 g.render() 直驱。
// 判据:六部件相间变化像素 > 区域 10%(旧横切 f≥1 源越界=恒 0 变化=爆红);
// 船体无部件带 < 区域 5%(静态哨);炮 k=1..8 各 > 区域 10%。
// 产物:PNG 落盘 SW_PROBE_OUT/dutchman-frames/ 供逐面直方图对拍留档。
// 运行:SW_ORIGIN=http://localhost:5254 node tools/run-diag.mjs --timeout=420000 scripts/_dutchman-frame-window.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'dutchman-frames');
mkdirSync(OUT, { recursive: true });
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
L.chk('createGame', gen.ok, gen.why ?? '');
await freezeClock(page, { tod: 0.5 });   // 正午(光照钉死)
await pump(page, 30);

// ---- 生成 491(玩家左 430px、下 20px → 视口内整船可见) ----
const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });
const sp = await spawnEnemy(page, 491, ppos.x - 430, ppos.y + 20);
L.chk('spawn 491', sp.ok, JSON.stringify(sp));
await pump(page, 8);                     // 首个 fixedUpdate 生成 4 炮

// ---- 钉相:AI 实例级 no-op(物理/AI 全冻结,渲染每帧仍读字段) + 姿态归零 + 渲染旗 ----
const pin = await page.evaluate(async () => {
  const g = window.__swGame;
  const ship = g.entities.enemies.find((e) => e.vanillaId === 491 && !e.dead);
  if (!ship) return { ok: false, why: 'no-ship' };
  const cannons = g.entities.enemies.filter((e) => e.vanillaId === 492 && !e.dead);
  if (cannons.length !== 4) return { ok: false, why: 'cannons=' + cannons.length };
  ship.fixedUpdate = () => {};
  for (const c of cannons) c.fixedUpdate = () => {};
  ship.facing = -1;                      // 不翻面形态(sd=-1;2026-09-29 极性定谳:翻面⟺facing==1)
  ship.visAngle = 0; ship.vx = 0; ship.vy = 0; ship.spawnAlpha = 0;
  for (const c of cannons) c.ai2 = 0;
  // ★整船入全亮天幕:地表线下方=光照压黑(曾令船体下半/桨/炮全黑 Δ0)。玩家冻结+
  //  连人带相机抬升地表上空 700px,船悬相机 (−80,+160) → 船底(屏 y+118)距地表
  //  仍余 ~540px,全船在全亮天幕内。玩家不动=相机零漂移。
  if (g.player) { try { g.player.fixedUpdate = () => {}; } catch { /* 域差异 */ } }
  g.player.x = ship.cx - g.player.w / 2;
  g.player.y = g.player.cy - 700 - g.player.h / 2;
  g.camera.x = ship.cx;
  g.camera.y = g.player.cy;
  ship.x = g.camera.x - 80 - ship.w / 2;
  ship.y = g.camera.y + 160 - ship.h / 2;
  const dd = await import('/src/entities/bossAI_dd2.ts');   // ★无 ?t=:WeakMap 单例(坑表 A4)
  window.__ddPin = (ph) => { dd.dd2LocalAI(ship)[3] = ph; };
  window.__ddCannon = (k) => { for (const c of cannons) c.ai2 = 0; cannons[0].ai2 = k; };
  // 渲染旗:drawEnemy 每次调用自增(钉相后计数增长=有新帧落到画布)
  const R = Object.getPrototypeOf(g.renderer);
  if (!window.__ddFrameFlag) {
    window.__ddFrameFlag = { n: 0 };
    const oe = R.drawEnemy;
    R.drawEnemy = function (...a) { window.__ddFrameFlag.n++; return oe.apply(this, a); };
  }
  // 几何:世界→canvas backing px(同 _engine 探针 world→screen 口径 × dpr)
  const cam = g.camera, c = g.renderer.canvas;
  const kx = c.width / cam.viewW, ky = c.height / cam.viewH;
  const sx = (ship.cx - cam.x) * cam.zoom * kx + c.width / 2;
  const sy = (ship.cy - cam.y) * cam.zoom * ky + c.height / 2;
  const z = cam.zoom * ((kx + ky) / 2);
  // 部件区域(ship-local dst 顶左+帧尺寸;Main.cs:24997-25053)
  const regs = {
    hull_free: [-200, -130, 560, 148],   // 船体无部件带(静态哨)
    flag: [74, -428, 56, 44],
    oars: [-126, 30, 196, 88],
    sail1: [16, -302, 178, 160],
    sail2: [-160, -444, 226, 90],
    sail3: [-160, -302, 52, 112],
    sail4: [-131, -330, 142, 152],
    cannon0: [-146, -30, 48, 48],
  };
  const px = (r) => ({ x: Math.round(sx + r[0] * z), y: Math.round(sy + r[1] * z), w: Math.max(1, Math.round(r[2] * z)), h: Math.max(1, Math.round(r[3] * z)) });
  window.__ddGeo = { sx, sy, z, canvas: { w: c.width, h: c.height }, regsPx: Object.fromEntries(Object.entries(regs).map(([n, r]) => [n, px(r)])) };
  // ★区域全入画布哨(曾 flag/sail2 映到负行=读越界恒 Δ0)
  for (const [n, r] of Object.entries(window.__ddGeo.regsPx)) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > c.width || r.y + r.h > c.height) return { ok: false, why: `region ${n} 出画布 (${r.x},${r.y},${r.w},${r.h}) canvas=${c.width}x${c.height}` };
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of Object.values(window.__ddGeo.regsPx)) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  x0 = Math.max(0, x0 - 8); y0 = Math.max(0, y0 - 8); x1 = Math.min(c.width, x1 + 8); y1 = Math.min(c.height, y1 + 8);
  window.__ddCrop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  // 等新渲染帧(headless rAF 稀疏;5s 超时→g.render() 直驱兜底)
  window.__ddWaitFrame = async (minN) => {
    const t0 = performance.now();
    while (window.__ddFrameFlag.n < minN) {
      await new Promise((r) => requestAnimationFrame(r));
      if (performance.now() - t0 > 5000) { g.render(); window.__ddFrameFlag.n++; return 'manual-render'; }
    }
    return 'natural';
  };
  // 捕获+区域差分器(首调建基准=相 0)
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  let base = null;
  window.__ddCap = () => {
    const crop = window.__ddCrop, cv = g.renderer.canvas;
    if (scratch.width !== crop.w || scratch.height !== crop.h) { scratch.width = crop.w; scratch.height = crop.h; }
    sctx.drawImage(cv, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    const img = sctx.getImageData(0, 0, crop.w, crop.h);
    const diffs = {};
    for (const [n, r] of Object.entries(window.__ddGeo.regsPx)) {
      const rx = r.x - crop.x, ry = r.y - crop.y;
      let ch = 0;
      if (base) {
        const B = base[n], F = img.data;
        for (let yy = 0; yy < r.h; yy++) {
          let bi = (yy * r.w) * 4;
          let fi = ((ry + yy) * crop.w + rx) * 4;
          for (let xx = 0; xx < r.w; xx++) {
            const d = Math.abs(F[fi] - B[bi]) + Math.abs(F[fi + 1] - B[bi + 1]) + Math.abs(F[fi + 2] - B[bi + 2]);
            if (d > 24) ch++;
            bi += 4; fi += 4;
          }
        }
      }
      diffs[n] = { ch, area: r.w * r.h };
    }
    if (!base) {
      base = {};
      for (const [n, r] of Object.entries(window.__ddGeo.regsPx)) {
        base[n] = sctx.getImageData(r.x - crop.x, r.y - crop.y, r.w, r.h).data;
      }
    }
    return { url: scratch.toDataURL('image/png'), diffs };
  };
  return { ok: true, geo: window.__ddGeo, crop: window.__ddCrop };
});
L.chk('钉相+几何', pin.ok, JSON.stringify(pin.why ?? pin.crop));
if (!pin.ok) { await browser.close(); console.log(L.ok ? 'ALL PASS' : 'HAS FAIL'); process.exitCode = L.ok ? 0 : 1; process.exit(1); }
L.say(`crop=${JSON.stringify(pin.crop)} sx=${Math.round(pin.geo.sx)} sy=${Math.round(pin.geo.sy)} z=${pin.geo.z.toFixed(3)}`);

// ---- 贴图预热:ensureVImage 懒加载首调 null → drawDutchman 早退=空船帧
//      (曾令 phase 0 基准=无船帧,全表差分失义)。八表全部落表才开扫。 ----
const prewarm = await page.evaluate(async () => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const files = ['vanilla/NPC_491.png', 'vanilla/NPC_492.png', 'vanilla/Extra_40.png', 'vanilla/Extra_41.png',
    'vanilla/Extra_42.png', 'vanilla/Extra_43.png', 'vanilla/Extra_44.png', 'vanilla/Extra_45.png'];
  for (let i = 0; i < 90; i++) {
    for (const f of files) atlas.ensureVImage(f);
    if (files.every((f) => atlas.ensureVImage(f))) return { ok: true, rounds: i };
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { ok: false, failed: files.filter((f) => !atlas.ensureVImage(f)) };
});
L.chk('八表预热落表', prewarm.ok, JSON.stringify(prewarm.failed ?? `rounds=${prewarm.rounds}`));

const capture = async () => {
  const src = await page.evaluate(() => window.__ddWaitFrame(window.__ddFrameFlag.n + 1));
  const cap = await page.evaluate(() => window.__ddCap());
  return { src, ...cap };
};

// ---- num132=0..7 帧窗重放(每相钉 localAI[3]=n*8+4 窗中点) ----
const PARTS = ['flag', 'oars', 'sail1', 'sail2', 'sail3', 'sail4'];
const partMax = Object.fromEntries(PARTS.map((n) => [n, 0]));
let hullFreeMax = 0, manualRenders = 0;
for (let n = 0; n < 8; n++) {
  await page.evaluate((ph) => window.__ddPin(ph), n * 8 + 4);
  const cap = await capture();
  if (cap.src === 'manual-render') manualRenders++;
  writeFileSync(join(OUT, `phase-${n}.png`), Buffer.from(cap.url.split(',')[1], 'base64'));
  const row = Object.fromEntries(Object.entries(cap.diffs).map(([k, v]) => [k, v.ch]));
  L.say(`phase ${n} (${cap.src}): ${JSON.stringify(row)}`);
  if (n > 0) {
    for (const p of PARTS) partMax[p] = Math.max(partMax[p], cap.diffs[p].ch);
    hullFreeMax = Math.max(hullFreeMax, cap.diffs.hull_free.ch);
  } else {
    for (const p of PARTS) if (cap.diffs[p].area === 0) L.chk(`区域 ${p} 面积`, false, 'area=0(部件窗出屏?查 crop)');
  }
}
const areas = await page.evaluate(() => Object.fromEntries(Object.entries(window.__ddGeo.regsPx).map(([n, r]) => [n, r.w * r.h])));
L.say('区域面积(判阈基准): ' + JSON.stringify(areas) + ` manualRenders=${manualRenders}`);
for (const p of PARTS) L.chk(`部件 ${p} 帧窗活性(maxΔ=${partMax[p]})`, partMax[p] > areas[p] * 0.10, `阈=${Math.round(areas[p] * 0.10)}`);
L.chk('船体无部件带静态哨(maxΔ=' + hullFreeMax + ')', hullFreeMax < areas.hull_free * 0.05, `阈=${Math.round(areas.hull_free * 0.05)}`);

// ---- 炮 492 姿态扫 ai2=0..8(帧行=ai[2]) ----
const poseMax = {};
for (let k = 0; k < 9; k++) {
  await page.evaluate((kk) => window.__ddCannon(kk), k);
  const cap = await capture();
  if (cap.src === 'manual-render') manualRenders++;
  writeFileSync(join(OUT, `cannon-pose-${k}.png`), Buffer.from(cap.url.split(',')[1], 'base64'));
  poseMax[k] = k === 0 ? 0 : cap.diffs.cannon0.ch;
  L.say(`cannon pose ${k} (${cap.src}): Δ=${cap.diffs.cannon0.ch}`);
}
for (let k = 1; k < 9; k++) L.chk(`炮姿态 ${k} 活性(Δ=${poseMax[k]})`, poseMax[k] > areas.cannon0 * 0.10, `阈=${Math.round(areas.cannon0 * 0.10)}`);

// ---- 翻面留档(信息性;2026-09-29 极性定谳:翻面⟺facing==1=sd==1,Main.cs:23357-23361) ----
await page.evaluate(() => { const s = window.__swGame.entities.enemies.find((e) => e.vanillaId === 491); s.facing = 1; });
const flip = await capture();
writeFileSync(join(OUT, 'flip.png'), Buffer.from(flip.url.split(',')[1], 'base64'));
L.say('flip.png 已留档(信息性,极性已按原版定谳翻转门)');

await browser.close();
console.log(L.ok ? 'ALL PASS' : 'HAS FAIL');
process.exitCode = L.ok ? 0 : 1;
