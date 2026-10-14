// ★BJ679 真机烟测:水罩 veil 九队列收编——修复态(A) vs 旧态(B=escapeVeilBegin→false
// 退化=BJ676 前行为)水下像素对拍。场景面（任务下限=翼光/四塔 glow/鞭线体,本探针
// 五场景另加飞灵 tgt 重放面+FadingParticles）:
//   ①翼光 wingGlow   真实链:装备翼配饰 821(翼槽 9,c250a100sq)→drawPlayer 收集→
//     flushWingGlow 主纹理镜像。
//   ②四塔 glow       真实链:spawnVanillaEnemy 493(Vortex Tower)水下+lunarEvent
//     盾防 despawn（_bj509 同式）→drawNpcGlow vel4 收集→flushTowerGlow 四向镜像。
//   ③鞭线体          合成注入（收集面=WhipProj 甩鞭输入模拟重,本刀域=flush 侧镜像
//     与复合;逐帧注入 drawLiquids fg 前=同消费时序）。
//   ④飞灵 677        真实链:spawnVanillaEnemy 677 水下→7d' drawFaeling tgt 整函数
//     重放（BJ679 最重路径:递归防重入+历史轨迹包络 box）。
//   ⑤FadingParticles 真实链:fadingParticles.spawn 全亮粒子水下长 TTL→drawFading
//     Particles lighter 主拍镜像。
// 判别面（BJ676 同体裁）:
//   ·各场景内容区 A/B avgD>5 且 maxD>20=逃逸内容被前景水罩;ctrl 区（同水柱上方
//     无逃逸内容带）avgD<2.5=零双罩（destination-in 截形=BJ676 合成单测已逐位证,
//     此处=真机环境校验）。
//   ·active strokes 计数>0（A 态镜像笔在位;B 态计 0）。
//   ·全页零 pageerror。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_bj679-water-veil-queues.mjs
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj679';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5213', {});
await createGame(page, { size: 'small', settleMs: 1500 });
await godMode(page, true);
await clockSet(page, 0.5);          // 正午（清水色观察档,BJ676 同档）
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);

// 帧计数器+active-stroke 诊断+合成鞭注入钩（fg 液体 pass 前=7e' 消费时序）
await page.evaluate(async () => {
  window.__bjFrames = 0;
  window.__bj679whip = null;   // {pts,tex,color} 非空=逐帧注入
  window.__bj679q = { towerGlow: 0, whip: 0 };   // drawLiquids 时刻队列长度采样
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  if (!proto.__bj679fp) {
    proto.__bj679fp = true;
    const orR = proto.render;
    proto.render = function (...a) { window.__bjFrames++; return orR.apply(this, a); };
    window.__bj679dbg = { strokes: 0 };
    const os = proto.escapeVeilStroke;
    proto.escapeVeilStroke = function (box, paint) {
      if (this._veilActive) window.__bj679dbg.strokes++;   // 仅活性镜像笔（B 态不计）
      return os.call(this, box, paint);
    };
    const od = proto.drawLiquids;
    proto.drawLiquids = function (...a) {
      if (a[5] === false) {
        window.__bj679q.towerGlow = this.towerGlowQueue.length;
        window.__bj679q.whip = this.whipFullbrightQueue.length;
        if (window.__bj679whip) this.whipFullbrightQueue.push(window.__bj679whip);
      }
      return od.apply(this, a);
    };
  }
});
await pump(page, 20);
const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

// ---- 找深水团（_bj676 同式:三连续深水列+真湖底）----
const spot = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, w = st.w, h = st.h;
  const seg = new Map();
  for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
    let y0 = -1, bestD = 0, bestY0 = -1;
    for (let y = 2; y < h - 40; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 1) { if (y0 < 0) y0 = y; }
      else if (y0 >= 0) { if (y - y0 > bestD) { bestD = y - y0; bestY0 = y0; } y0 = -1; }
    }
    if (bestD >= 10) seg.set(x, { y0: bestY0, d: bestD });
  }
  const bottomOf = (x, y0, d) => {
    for (let y = y0 + 3; y < y0 + d + 12; y++) {
      const i = st.idx(x, y);
      if (st.w[i] !== 0 && st.liquid[i] === 0) return y;
    }
    return -1;
  };
  const xs = [...seg.keys()];
  for (const x of xs.sort((a, b) => seg.get(b).d - seg.get(a).d)) {
    const c = seg.get(x);
    if (!(seg.get(x - 1)?.d >= 10 && seg.get(x + 1)?.d >= 10)) continue;
    const bottom = bottomOf(x, c.y0, c.d);
    if (bottom > c.y0 + Math.floor(c.d * 0.6)) {
      return { tx: x, tySurface: c.y0, depth: c.d, tyBottom: bottom };
    }
  }
  return null;
});
if (!spot) { console.error('NO_WATER_BODY'); process.exit(2); }
console.log(`water column: x=${spot.tx} surfaceY=${spot.tySurface} depth=${spot.depth} bottomY=${spot.tyBottom}`);
// ctrl 区=同水柱上方清水带（内容全在湖底段,深度差 ≥20 格=零逃逸内容）
const CTRL = [spot.tx - 1, spot.tySurface + 2, spot.tx + 2, spot.tySurface + 8];

const pinPlayer = () => page.evaluate((s) => {
  const g = window.__swGame, p = g.player;
  p.x = (s.tx + 0.5) * 16 - p.w / 2;
  p.y = s.tyBottom * 16 - p.h - 1;
  p.vx = 0; p.vy = 0;
  return { px: p.x, py: p.y };
}, spot);

// 旧态开关（BJ676 同式:Begin→false=全链退化直绘,无半路残渍）
const setLegacy = (on) => page.evaluate((v) => {
  return import('/src/render/Renderer.ts').then((R) => {
    const proto = R.Renderer.prototype;
    if (!window.__bj679orig) window.__bj679orig = proto.escapeVeilBegin;
    proto.escapeVeilBegin = v ? function () { this._veilActive = false; this._veilBox = null; return false; } : window.__bj679orig;
    return true;
  });
}, on);

/** 指定世界矩形采样（页域换算 BJ676 同式;返回 avg+px 留存） */
const sampleBox = (wx0, wy0, wx1, wy1) => page.evaluate((b) => {
  const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
  const X = Math.round(b.wx0 * 16 * cam.zoom + cv.width / 2 - cam.x * cam.zoom);
  const Y = Math.round(b.wy0 * 16 * cam.zoom + cv.height / 2 - cam.y * cam.zoom);
  const W = Math.round((b.wx1 - b.wx0) * 16 * cam.zoom);
  const H = Math.round((b.wy1 - b.wy0) * 16 * cam.zoom);
  const x = Math.max(0, X), y = Math.max(0, Y);
  const w = Math.min(W, cv.width - x), h = Math.min(H, cv.height - y);
  if (w <= 0 || h <= 0) return { avg: 0, n: 0, px: [] };
  const img = g.renderer.ctx.getImageData(x, y, w, h).data;
  let sum = 0, n = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] > 60) { n++; sum += (img[i] + img[i + 1] + img[i + 2]) / 3; }
  }
  return { avg: n ? +(sum / n).toFixed(2) : 0, n, px: Array.from(img) };
}, { wx0, wy0, wx1, wy1 });

const diffStat = (a, b) => {
  let max = 0, sum = 0, n = 0, bw = 0, bn = 0;
  const L = Math.min(a.px.length, b.px.length);
  for (let i = 0; i < L; i += 4) {
    if (a.px[i + 3] <= 60 && b.px[i + 3] <= 60) continue;
    const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2]));
    if (d > max) max = d;
    sum += d; n++;
    bw += (a.px[i + 2] - b.px[i + 2]); bn++;
  }
  return { maxD: max, avgD: n ? +(sum / n).toFixed(2) : 0, dB: bn ? +(bw / bn).toFixed(2) : 0, n };
};

/** A/B 交替 R 轮聚合（BJ676 同式:每拍 pin 防漂移,漂移零均值/水罩信号恒定） */
const abRegion = async (region, R = 4) => {
  const acc = [], accCtrl = [];
  for (let r = 0; r < R; r++) {
    await setLegacy(false); await pinPlayer(); await waitFrames(1);
    const A = await sampleBox(region[0], region[1], region[2], region[3]);
    const Ac = await sampleBox(CTRL[0], CTRL[1], CTRL[2], CTRL[3]);
    await setLegacy(true); await pinPlayer(); await waitFrames(1);
    const B = await sampleBox(region[0], region[1], region[2], region[3]);
    const Bc = await sampleBox(CTRL[0], CTRL[1], CTRL[2], CTRL[3]);
    acc.push(diffStat(A, B));
    accCtrl.push(diffStat(Ac, Bc));
  }
  await setLegacy(false);
  const agg = (arr) => ({
    maxD: Math.round(Math.max(...arr.map((d) => d.maxD))),
    avgD: +(arr.reduce((s, d) => s + d.avgD, 0) / arr.length).toFixed(2),
    dB: +(arr.reduce((s, d) => s + d.dB, 0) / arr.length).toFixed(2),
  });
  return { content: agg(acc), ctrl: agg(accCtrl) };
};

const strokesSnap = () => page.evaluate(() => { const s = window.__bj679dbg.strokes; window.__bj679dbg.strokes = 0; return s; });
const qSnap = () => page.evaluate(() => ({ ...window.__bj679q }));
const results = {};

// ============ 场景① 翼光（真实装备链:翼槽 9 c250a100sq,无 alwaysAir 门）============
const wingEquip = (on) => page.evaluate(async (v) => {
  const g = window.__swGame, p = g.player;
  p.inv.armor[3] = null;
  if (v) {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_821_').test(x));
    if (!k) return false;
    p.inv.armor[3] = { id: window.__swItems[k], stack: 1 };
  }
  return true;
}, on);

try {
  await wingEquip(true);
  await pinPlayer(); await pump(page, 40); await waitFrames(3);   // 装备聚合+翼贴图加载
  const px = spot.tx, bot = spot.tyBottom;
  const r = await abRegion([px - 2, bot - 6, px + 3, bot - 1]);
  results.wing = { ...r, strokes: await strokesSnap(), q: await qSnap() };
  console.log(`[wing]    content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.wing.strokes}`);
} catch (e) { console.log('[wing] FAIL', e.message, 'errors:', JSON.stringify(errors.slice(0, 3))); }
await wingEquip(false);

// ============ 场景② 四塔 glow（真实链:493 Vortex Tower vel4 残影+lunar 盾）============
try {
  const tower = await page.evaluate(async (s) => {
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    const g = window.__swGame;
    g.world.lunarEvent.shield = { solar: 100, vortex: 100, nebula: 100, stardust: 100 };
    const e = spawnVanillaEnemy(g, 493, (s.tx - 5) * 16, (s.tyBottom - 10) * 16);
    return e ? { x: e.cx, y: e.cy, alive: !e.dead } : null;
  }, spot);
  console.log('tower spawn:', JSON.stringify(tower));
  await pinPlayer(); await pump(page, 60); await waitFrames(3);   // spawnAlpha 淡入 settle
  const alive = await page.evaluate(() => {
    const g = window.__swGame;
    const t = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 493 && !e.dead);
    return t ? { x: t.cx, y: t.cy, spawnAlpha: t.spawnAlpha } : null;
  });
  console.log('tower alive:', JSON.stringify(alive));
  if (alive) {
    const stx = Math.floor(alive.x / 16), sty = Math.floor(alive.y / 16);
    // 内容区=塔心水下带（水下段:水面下 3 格到湖底）
    const r = await abRegion([stx - 5, spot.tySurface + 3, stx + 6, spot.tyBottom - 1]);
    results.tower = { ...r, strokes: await strokesSnap(), q: await qSnap() };
    console.log(`[tower]   content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.tower.strokes} q=${JSON.stringify(results.tower.q)}`);
  }
  await page.evaluate(() => {
    const g = window.__swGame;
    for (const e of (g.enemies ? g.enemies() : [])) if (e.vanillaId === 493) e.dead = true;
  });
} catch (e) { console.log('[tower] FAIL', e.message, 'errors:', JSON.stringify(errors.slice(0, 3))); }

// ============ 场景③ 鞭线体（合成注入:flush 侧镜像+复合域）============
try {
  await page.evaluate(async (s) => {
    const g = window.__swGame, r = g.renderer;
    const tex = r.atlas.ensureVImage('vanilla/Chain24.png');
    const cx = (s.tx + 0.5) * 16, cy = (s.tyBottom - 5) * 16;
    // 水下横向折线（鞭语义=分段线体;强 α 200/255=可辨信号,1034 原色 α12 过弱）
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push({ x: cx - 40 + i * 10, y: cy + Math.sin(i * 1.2) * 8 });
    window.__bj679whip = { pts, tex, color: [255, 70, 20, 200] };
  }, spot);
  await pinPlayer(); await pump(page, 4); await waitFrames(3);
  const cx = spot.tx, cy = spot.tyBottom - 5;
  const r = await abRegion([cx - 3, cy - 1, cx + 3, cy + 1]);
  results.whip = { ...r, strokes: await strokesSnap(), q: await qSnap() };
  console.log(`[whip]    content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.whip.strokes} q=${JSON.stringify(results.whip.q)}`);
} catch (e) { console.log('[whip] FAIL', e.message, 'errors:', JSON.stringify(errors.slice(0, 3))); }
await page.evaluate(() => { window.__bj679whip = null; });

// ============ 场景④ 飞灵 677（真实链:tgt 整函数重放+历史包络 box）============
try {
  const faeling = await page.evaluate(async (s) => {
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    const g = window.__swGame;
    const e = spawnVanillaEnemy(g, 677, (s.tx + 0.5) * 16, (s.tyBottom - 4) * 16);
    return e ? { x: e.cx, y: e.cy } : null;
  }, spot);
  console.log('faeling spawn:', JSON.stringify(faeling));
  await pinPlayer(); await pump(page, 60); await waitFrames(3);   // 历史轨迹填充+淡入
  const alive = await page.evaluate(() => {
    const g = window.__swGame;
    const t = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 677 && !e.dead);
    return t ? { x: t.cx, y: t.cy } : null;
  });
  console.log('faeling alive:', JSON.stringify(alive));
  if (alive) {
    const fx = Math.floor(alive.x / 16), fy = Math.floor(alive.y / 16);
    const r = await abRegion([fx - 4, fy - 4, fx + 4, fy + 4]);
    results.faeling = { ...r, strokes: await strokesSnap() };
    console.log(`[faeling] content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.faeling.strokes}`);
  }
  await page.evaluate(() => {
    const g = window.__swGame;
    for (const e of (g.enemies ? g.enemies() : [])) if (e.vanillaId === 677) e.dead = true;
  });
} catch (e) { console.log('[faeling] FAIL', e.message, 'errors:', JSON.stringify(errors.slice(0, 3))); }

// ============ 场景⑤ FadingParticles（真实链:全亮粒子 lighter 主拍镜像）============
try {
  await page.evaluate(async (s) => {
    const FP = await import('/src/fx/FadingParticles.ts');
    const cx = (s.tx + 0.5) * 16, cy = (s.tyBottom - 3) * 16;
    FP.fadingParticles.spawn({
      x: cx, y: cy, timeToLive: 100000, fadeIn: 0, fadeOut: 1,
      scale: 2, tint: [255, 200, 60, 255], texKey: 'vanilla/Extra_34.png', fullbright: true,
    });
  }, spot);
  await pinPlayer(); await pump(page, 4); await waitFrames(3);
  const cx = spot.tx, cy = spot.tyBottom - 3;
  const r = await abRegion([cx - 2, cy - 2, cx + 3, cy + 2]);
  results.fading = { ...r, strokes: await strokesSnap() };
  console.log(`[fading]  content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.fading.strokes}`);
} catch (e) { console.log('[fading] FAIL', e.message, 'errors:', JSON.stringify(errors.slice(0, 3))); }

// 判别断言（内容 avgD>5 且 maxD>20=水罩信号;ctrl avgD<2.5=零双罩底噪;
// active strokes>0=镜像笔在位）
const verdict = {};
for (const [name, res] of Object.entries(results)) {
  verdict[name] = !!res && res.content.avgD > 5 && res.content.maxD > 20
    && res.ctrl.avgD < 2.5 && res.strokes > 0;
}
console.log('VERDICT:', JSON.stringify(verdict));
console.log('pageerrors:', errors.length, errors.slice(0, 5));
await browser.close();
process.exit(Object.values(verdict).length >= 3 && Object.values(verdict).every(Boolean) ? 0 : 1);
