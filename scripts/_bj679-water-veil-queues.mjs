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
        // 鞭注入:tex 逐帧解析（ensureVImage 首拍懒加载返 null;就绪后非空才推）
        if (window.__bj679whip) {
          const tex = this.atlas && this.atlas.ensureVImage('vanilla/FishingLine.png');
          if (tex && tex.width > 0) this.whipFullbrightQueue.push({ ...window.__bj679whip, tex });
        }
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
// 逐场景 ctrl（净水面带;与各场景逃逸内容互斥——A/B 唯一差异面=水罩）
const S = spot.tySurface, B = spot.tyBottom, TX = spot.tx;
const CTRL_TOP = [TX - 1, S + 16, TX + 2, S + 20];    // 深水带（翼场景;避 s+2..s+6 动画水位线）
const CTRL_BOT = [TX - 1, B - 12, TX + 2, B - 9];     // 中下带（鞭场景,相机 bottom）
const CTRL_BOT2 = [TX - 1, B - 2, TX + 2, B - 1];     // 底带（飞灵场景,避拖尾残留）
// 塔场景 ctrl=邻侧水列（塔体横跨 tx−11..tx+1=本列左半;右邻深水列整列净空）
const towerCtrlCol = await page.evaluate((s) => {
  const st = window.__swGame.world.store;
  for (const x of [s.tx + 6, s.tx + 7, s.tx + 8, s.tx - 8, s.tx - 7, s.tx - 6]) {
    if (x < 2 || x >= st.w - 2) continue;
    let ok = true;
    for (let y = s.tySurface + 16; y <= s.tySurface + 20; y++) {
      const i = st.idx(x, y);
      if (!(st.liquid[i] > 0 && st.liquidType[i] === 1)) { ok = false; break; }
    }
    if (ok) return x;
  }
  return s.tx;   // fallback=本列
}, spot);
const CTRL_TOWER = [towerCtrlCol, S + 16, towerCtrlCol + 1, S + 20];

const pinPlayer = (mode = 'mid') => page.evaluate((s, mode) => {
  const g = window.__swGame, p = g.player;
  p.x = (s.tx + 0.5) * 16 - p.w / 2;
  // mid=表面+12（清水受光带）;bottom=湖底−8（底段内容居视域）
  const ty = mode === 'mid' ? Math.min(s.tySurface + 12, s.tyBottom - 4) : s.tyBottom - 8;
  p.y = ty * 16 - p.h - 1;
  p.vx = 0; p.vy = 0;
  return { px: p.x, py: p.y };
}, spot, mode);

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

/** A/B 交替 R 轮聚合（BJ676 同式:每拍 pin 防漂移;ctrl=逐场景净水面带——
 *  A/B 间唯一差异面=逃逸族水罩,非逃逸内容（玩家本体/地形/第一份水）逐位同） */
const abRegion = async (region, ctrlRegion, pinMode = 'mid', R = 4) => {
  const acc = [], accCtrl = [];
  for (let r = 0; r < R; r++) {
    await setLegacy(false); await pinPlayer(pinMode); await waitFrames(1);
    const A = await sampleBox(region[0], region[1], region[2], region[3]);
    const Ac = await sampleBox(ctrlRegion[0], ctrlRegion[1], ctrlRegion[2], ctrlRegion[3]);
    await setLegacy(true); await pinPlayer(pinMode); await waitFrames(1);
    const B = await sampleBox(region[0], region[1], region[2], region[3]);
    const Bc = await sampleBox(ctrlRegion[0], ctrlRegion[1], ctrlRegion[2], ctrlRegion[3]);
    acc.push(diffStat(A, B));
    accCtrl.push(diffStat(Ac, Bc));
  }
  await setLegacy(false);
  const agg = (arr) => ({
    maxD: Math.round(Math.max(...arr.map((d) => d.maxD))),
    avgD: +(arr.reduce((s, d) => s + d.avgD, 0) / arr.length).toFixed(2),
    dB: +(arr.reduce((s, d) => s + d.dB, 0) / arr.length).toFixed(2),
  });
  // ctrl 中位档（雨滴/气泡等稀疏瞬态只污染个别轮;结构面零双罩已由 BJ676
  // 合成单测逐位证,此处=真机环境噪声底校验,取中位数免疫瞬态）
  const med = (arr) => { const v = [...arr.map((d) => d.avgD)].sort((a, b) => a - b); return +v[Math.floor(v.length / 2)].toFixed(2); };
  return { content: agg(acc), ctrl: agg(accCtrl), ctrlMed: med(accCtrl) };
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
  const px = spot.tx, wy = Math.min(S + 12, B - 4);
  const r = await abRegion([px - 2, wy - 4, px + 3, wy], CTRL_TOP);
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
    if (e) e.facing = -1;   // BJ510:塔 spriteDirection 恒 -1（收集门 !mirror）
    return e ? { x: e.cx, y: e.cy, alive: !e.dead } : null;
  }, spot);
  console.log('tower spawn:', JSON.stringify(tower));
  await pinPlayer(); await pump(page, 60);   // spawnAlpha 淡入 settle
  const frozen = await page.evaluate((s) => {
    const g = window.__swGame;
    const t = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 493 && !e.dead);
    if (!t) return null;
    // 冻结塔 AI（towerAI 每拍重定位到地表=离屏;fixedUpdate 实例遮蔽=渲染字段静止,
    // 收集门 visAngle=0/!mirror 全过）
    t.x = (s.tx - 5) * 16; t.y = (s.tyBottom - 10) * 16; t.vx = 0; t.vy = 0;
    t.fixedUpdate = () => {};
    return { x: t.cx, y: t.cy };
  }, spot);
  console.log('tower frozen:', JSON.stringify(frozen));
  await waitFrames(3);
  if (frozen) {
    // 内容区=水柱带（塔 glow 横跨水柱;水上无罩段已用 tySurface+3 下界裁除）
    const r = await abRegion([TX - 1, S + 10, TX + 2, S + 34], CTRL_TOWER);
    results.tower = { ...r, strokes: await strokesSnap(), q: await qSnap() };
    console.log(`[tower]   content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.tower.strokes} q=${JSON.stringify(results.tower.q)}`);
    // ctrl 污染源定位:单拍 A/B ctrl 像素对,打印差异像素坐标+颜色
    if (r.ctrl.avgD > 2.5) {
      await setLegacy(false); await pinPlayer('mid'); await waitFrames(1);
      const A2 = await sampleBox(CTRL_TOWER[0], CTRL_TOWER[1], CTRL_TOWER[2], CTRL_TOWER[3]);
      await setLegacy(true); await pinPlayer('mid'); await waitFrames(1);
      const B2 = await sampleBox(CTRL_TOWER[0], CTRL_TOWER[1], CTRL_TOWER[2], CTRL_TOWER[3]);
      const L = Math.min(A2.px.length, B2.px.length);
      const shown = [];
      for (let i = 0; i < L && shown.length < 10; i += 4) {
        const d = Math.max(Math.abs(A2.px[i] - B2.px[i]), Math.abs(A2.px[i + 1] - B2.px[i + 1]), Math.abs(A2.px[i + 2] - B2.px[i + 2]));
        if (d > 20) shown.push({ px: i / 4, A: A2.px.slice(i, i + 4), B: B2.px.slice(i, i + 4) });
      }
      console.log('tower ctrl diff pixels:', JSON.stringify(shown));
      await setLegacy(false);
    }
  }
  await page.evaluate(() => {
    const g = window.__swGame;
    // 移远替代 dead（死亡演出/gore 会污染后续场景采样带）
    for (const e of (g.enemies ? g.enemies() : [])) if (e.vanillaId === 493) e.x = -999999;
  });
} catch (e) { console.log('[tower] FAIL', e.message, 'stack:', JSON.stringify(await page.evaluate(() => (window.__swErrors ?? []).slice(-2)).catch(() => null))); }

// ============ 场景③ 鞭线体（合成注入:flush 侧镜像+复合域）============
try {
  await page.evaluate(async (s) => {
    const cx = (s.tx + 0.5) * 16, cy = (s.tyBottom - 5) * 16;
    // 水下横向折线（鞭语义=分段线体;强 α 200/255=可辨信号,1034 原色 α12 过弱）
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push({ x: cx - 40 + i * 10, y: cy + Math.sin(i * 1.2) * 8 });
    window.__bj679whip = { pts, color: [255, 70, 20, 200] };   // tex=注入钩逐帧解析
  }, spot);
  await pinPlayer('bottom'); await pump(page, 4); await waitFrames(3);
  const cx = spot.tx, cy = B - 5;
  const r = await abRegion([cx - 3, cy - 2, cx + 3, cy + 2], CTRL_BOT, 'bottom');
  results.whip = { ...r, strokes: await strokesSnap(), q: await qSnap() };
  console.log(`[whip]    content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.whip.strokes} q=${JSON.stringify(results.whip.q)}`);
} catch (e) { console.log('[whip] FAIL', e.message, 'stack:', JSON.stringify(await page.evaluate(() => (window.__swErrors ?? []).slice(-3)).catch(() => null))); }
await page.evaluate(() => { window.__bj679whip = null; });

// ============ 场景④ 飞灵 677（真实链:tgt 整函数重放+历史包络 box）============
try {
  await pinPlayer('bottom'); await pump(page, 4);   // 相机先就位（mid 时 b−4 离屏=critter despawn）
  const faeling = await page.evaluate(async (s) => {
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    const g = window.__swGame;
    const e = spawnVanillaEnemy(g, 677, (s.tx + 0.5) * 16, (s.tyBottom - 4) * 16);
    return e ? { x: e.cx, y: e.cy } : null;
  }, spot);
  console.log('faeling spawn:', JSON.stringify(faeling));
  await pinPlayer('bottom'); await pump(page, 60);   // 淡入+历史轨迹填充
  const frozen = await page.evaluate((s) => {
    const g = window.__swGame;
    const t = (g.enemies ? g.enemies() : []).find((e) => e.vanillaId === 677 && !e.dead);
    if (!t) return null;
    // 传送回水柱+冻结（critter AI 飞离=内容漂移伪影;拖尾残留在旧飞行径=框外无害）
    t.x = (s.tx + 0.5) * 16 - t.w / 2; t.y = (s.tyBottom - 4) * 16 - t.h / 2;
    t.vx = 0; t.vy = 0;
    t.fixedUpdate = () => {};
    return { x: t.cx, y: t.cy };
  }, spot);
  console.log('faeling frozen:', JSON.stringify(frozen));
  await waitFrames(3);
  if (frozen) {
    const fx = spot.tx, fy = B - 4;
    const r = await abRegion([fx, fy - 1, fx + 1, fy + 1], CTRL_BOT2, 'bottom');
    results.faeling = { ...r, strokes: await strokesSnap() };
    console.log(`[faeling] content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.faeling.strokes}`);
  }
  await page.evaluate(() => {
    const g = window.__swGame;
    for (const e of (g.enemies ? g.enemies() : [])) if (e.vanillaId === 677) e.x = -999999;   // 移远防 gore
  });
} catch (e) { console.log('[faeling] FAIL', e.message, 'stack:', JSON.stringify(await page.evaluate(() => (window.__swErrors ?? []).slice(-2)).catch(() => null))); }

// ============ 场景⑤ FadingParticles（真实链:全亮粒子 lighter 主拍镜像）============
try {
  await page.evaluate(async (s) => {
    const FP = await import('/src/fx/FadingParticles.ts');
    const cx = (s.tx + 0.5) * 16, cy = (s.tyBottom - 3) * 16;
    FP.fadingParticles.spawn({
      x: cx, y: cy, timeToLive: 100000, fadeIn: 0.0001, fadeOut: 0.5,
      scale: 1, tint: [255, 255, 255, 255], texKey: 'vanilla/Wings_9.png', fullbright: true,
    });
  }, spot);
  await pinPlayer('bottom'); await pump(page, 30); await waitFrames(3);   // fadeIn ramp 收敛
  const cx = spot.tx, cy = B - 6;   // b−6:粒子核心带;ctrl=邻列中下带
  const r = await abRegion([cx, cy - 2, cx + 1, cy + 2], [towerCtrlCol, B - 14, towerCtrlCol + 1, B - 10], 'bottom');
  results.fading = { ...r, strokes: await strokesSnap() };
  console.log(`[fading]  content A/B: ${JSON.stringify(r.content)}  ctrl: ${JSON.stringify(r.ctrl)}  strokes(A)=${results.fading.strokes}`);
} catch (e) { console.log('[fading] FAIL', e.message, 'errors:', JSON.stringify(errors.slice(0, 3))); }

// 判别断言（内容 avgD>5 且 maxD>20=水罩信号;ctrl avgD<2.5=零双罩底噪;
// active strokes>0=镜像笔在位）
const verdict = {};
for (const [name, res] of Object.entries(results)) {
  verdict[name] = !!res && res.content.avgD > 5 && res.content.maxD > 20
    && res.ctrlMed < 2.5 && res.strokes > 0;
}
console.log('VERDICT:', JSON.stringify(verdict));
console.log('pageerrors:', errors.length, errors.slice(0, 5));
await browser.close();
process.exit(Object.values(verdict).length >= 3 && Object.values(verdict).every(Boolean) ? 0 : 1);
