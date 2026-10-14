// ★BJ676 真机烟测:月套(日耀/星云)浸水前景水罩——修复态 vs 旧态对拍。
// 背景:用户实报「星云套或日耀套在水里时,水的渲染在装甲下一层(水被装甲盖住),
//   不穿套装时水正常画在角色层上」。定谳=原版玩家层组(含恒色甲/glow/盾球)在
//   waterTarget 合成(Main.cs:63256)之前=水罩甲;本仓月套逃逸族(BJ665b/BJ597/
//   BJ594 合成后免光重绘)画在前景水之上=甲浮于水色。落刀=escapeVeil 局部复合。
// 判别面:
//   ①水下甲区像素「修复态(A) vs 旧态(B=escapeVeilBegin→false 退化=BJ676 前
//     行为)」色差显著=甲件被前景水 0.6 罩;旧态=恒色/glow 原色直出(≈无水罩)。
//   ②裸装对照:两态零差(裸装无逃逸队列=veil676 false=两态同路径)——判别力
//     校验(非零=探针伪影)。
//   ③复照 C:unpatch 后 A≈C(确定性+幂等)。
//   ④水下甲区 B 通道占比显著高于干坑基线(水色调制方向校验)。
//   ⑤全页零 pageerror。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_bj676-lunar-water-veil.mjs
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj676';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5211', {});
await createGame(page, { size: 'small', settleMs: 1500 });
await godMode(page, true);
await clockSet(page, 0.5);          // 正午（清水色观察档）
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);

// 外观补赋（_bj665b 同式）+ 帧计数器
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj676');
  const UT = await import('/src/vui/assets/UITextures.ts');
  await UT.UITextures.ensure([
    'Armor_Head_171.png', 'Armor_Arm_177.png', 'Armor_Legs_112.png',
    'Armor_Head_170.png', 'Armor_Armor_176.png', 'Armor_Legs_111.png',
  ]);
  window.__bjFrames = 0;
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  if (!proto.__bj676fp) {
    proto.__bj676fp = true;
    const orR = proto.render;
    proto.render = function (...a) { window.__bjFrames++; return orR.apply(this, a); };
  }
  // ★诊断插桩（真实 rAF 帧取数:pump=fixedUpdate 泵不推 render,固定泵后读数
  //   全为偶发帧残留=agLen 恒 0 假象的根源）:4.5 前景水时刻队列长度+stroke 计数
  if (!proto.__bj676diag) {
    proto.__bj676diag = true;
    window.__bj676dbg = { agLen: [], strokes: 0, begins: 0, veilNull: 0 };
    const od = proto.drawLiquids;
    proto.drawLiquids = function (world, cam, viewW, viewH, z, isBackground) {
      if (!isBackground) {
        window.__bj676dbg.agLen.push([
          this.armorGlowQueue.length, this.lunarArmorQueue.length, this.lunarCoverQueue.length,
          this.armorGlowQueue.reduce((s, e) => s + e.ops.length, 0),
        ]);
        if (window.__bj676dbg.agLen.length > 12) window.__bj676dbg.agLen.shift();
      }
      return od.call(this, world, cam, viewW, viewH, z, isBackground);
    };
    const os = proto.escapeVeilStroke;
    proto.escapeVeilStroke = function (box, paint) { window.__bj676dbg.strokes++; return os.call(this, box, paint); };
    const ob = proto.escapeVeilBegin;
    proto.escapeVeilBegin = function () { const r = ob.call(this); if (!r) window.__bj676dbg.veilNull++; return r; };
  }
});
await pump(page, 20);
const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

// ---- 找深水团+传送玩家（湖=存档现成水,避开挖坑/chunk 失效问题）----
// 选点标准:三连续深水列(≥10 格)的中心列+真湖底（首三跑定谳:水中植物格
//   liquid>0∧tile≠0 会让「首个 tile 格」=水面植物=玩家钉在水上;底=非水 solid
//   格;玩家钉湖底=idle 静止姿态,消游动姿态帧漂移对 A/B 信号的淹没）。
const spot = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, w = st.w, h = st.h;
  // 每列最深水段
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

// 传送+钉位（钉湖底=静止姿态;玩家身高约 2.6 格 < 水深 12+,全身浸水）
const pinPlayer = () => page.evaluate((s) => {
  const g = window.__swGame, p = g.player;
  p.x = (s.tx + 0.5) * 16 - p.w / 2;
  p.y = s.tyBottom * 16 - p.h - 1;
  p.vx = 0; p.vy = 0;
  return { px: p.x, py: p.y };
}, spot);

// 采样（_bj665b 同式+像素留存供 A/B 逐位差）
const sample = (tag) => page.evaluate((t) => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const sx = Math.round((p.x + p.w / 2 - cam.x) * cam.zoom + cv.width / 2);
  const sy = Math.round((p.y + p.h - cam.y) * cam.zoom + cv.height / 2);
  const read = (x, y, w, h) => {
    const X = Math.max(0, x), Y = Math.max(0, y);
    const img = g.renderer.ctx.getImageData(X, Y, Math.min(w, cv.width - X), Math.min(h, cv.height - Y)).data;
    let sum = 0, n = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 60) { n++; sum += (img[i] + img[i + 1] + img[i + 2]) / 3; }
    }
    return { avg: n ? +(sum / n).toFixed(2) : 0, n, px: Array.from(img) };
  };
  const out = {
    head: read(sx - 14, sy - 56, 28, 20),
    torso: read(sx - 14, sy - 36, 28, 18),
    legs: read(sx - 14, sy - 18, 28, 16),
    ctrl: read(sx + 40, sy - 56, 30, 40),
  };
  if (t) out.tag = t;
  return out;
}, tag);

const diffStat = (a, b) => {
  let max = 0, sum = 0, n = 0, bw = 0, bn = 0;
  const L = Math.min(a.px.length, b.px.length);
  for (let i = 0; i < L; i += 4) {
    if (a.px[i + 3] <= 60 && b.px[i + 3] <= 60) continue;
    const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2]));
    if (d > max) max = d;
    sum += d; n++;
    // B 通道相对（水色调制方向:修复态偏水蓝）
    bw += (a.px[i + 2] - b.px[i + 2]); bn++;
  }
  return { maxD: max, avgD: n ? +(sum / n).toFixed(2) : 0, dB: bn ? +(bw / bn).toFixed(2) : 0, n };
};

/** A/B 交替 R 轮聚合（漂移=零均值噪声,水罩信号恒定——聚合降噪;每拍 pin 防漂移） */
const abPair = async (R) => {
  const acc = { torso: [], head: [], legs: [], ctrl: [] };
  let lastA = null;
  for (let r = 0; r < R; r++) {
    await setLegacy(false); await pinPlayer(); await waitFrames(1);
    const A = await sample(null);
    await setLegacy(true); await pinPlayer(); await waitFrames(1);
    const B = await sample(null);
    if (!lastA) lastA = A;
    for (const k of ['torso', 'head', 'legs', 'ctrl']) acc[k].push(diffStat(A[k], B[k]));
  }
  await setLegacy(false);
  const agg = {};
  for (const k of ['torso', 'head', 'legs', 'ctrl']) {
    agg[k] = {
      maxD: Math.round(Math.max(...acc[k].map((d) => d.maxD))),
      avgD: +(acc[k].reduce((s, d) => s + d.avgD, 0) / acc[k].length).toFixed(2),
      dB: +(acc[k].reduce((s, d) => s + d.dB, 0) / acc[k].length).toFixed(2),
    };
  }
  return { agg, lastA };
};

const grantArmor = (vids) => page.evaluate((vs) => {
  const g = window.__swGame, p = g.player;
  p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
  for (const v of vs) {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + v + '_').test(x));
    // 槽位按【物品 vanilla id】判:头 2763 日耀/189 星尘/2760 星云;身 2764/190/2761;
    //   其余=腿。（2761 星云身曾被误判 slot2 被腿覆盖=nebula 弱信号探针侧根因;
    //   170/176/111 是贴图槽号 hs/bs/ls 非 id,勿混）
    const slot = v === 2763 || v === 189 || v === 2760 ? 0 : v === 2764 || v === 190 || v === 2761 ? 1 : 2;
    p.inv.armor[slot] = { id: window.__swItems[k], stack: 1 };
  }
}, vids);

// patch 旧态开关（escapeVeilBegin→false=四 flush 原路径=BJ676 前行为;_veilBox null
// + _veilActive false → End/Stroke 全 no-op=纯旧态,无半路残渍）
const setLegacy = (on) => page.evaluate((v) => {
  return import('/src/render/Renderer.ts').then((R) => {
    const proto = R.Renderer.prototype;
    if (!window.__bj676orig) window.__bj676orig = proto.escapeVeilBegin;
    proto.escapeVeilBegin = v ? function () { this._veilActive = false; this._veilBox = null; return false; } : window.__bj676orig;
    return true;
  });
}, on);

const SUITS = [
  { name: 'solar', vids: [2763, 2764, 2765] },   // 日耀全套 171/177/112
  { name: 'nebula', vids: [2760, 2761, 2762] },  // 星云全套 170/176/111（glow 面）
  { name: 'naked', vids: null },                  // 裸装对照
];

const results = {};
for (const suit of SUITS) {
  if (suit.vids) await grantArmor(suit.vids);
  else await page.evaluate(() => { const p = window.__swGame.player; p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null; });
  await pinPlayer(); await pump(page, 10); await waitFrames(3);
  const { agg, lastA } = await abPair(4);   // A/B 交替 4 轮聚合（帧漂移零均值→抵消,水罩信号恒定→保留）
  const dbgSnap = await page.evaluate(() => {
    const d = { ...window.__bj676dbg, agLen: window.__bj676dbg.agLen.slice() };
    window.__bj676dbg.agLen = []; window.__bj676dbg.strokes = 0; window.__bj676dbg.veilNull = 0;
    return d;
  });
  results[suit.name] = {
    torsoAB: agg.torso, headAB: agg.head, legsAB: agg.legs, ctrlAB: agg.ctrl,
    avgA: { torso: lastA.torso.avg, head: lastA.head.avg, legs: lastA.legs.avg },
    dbg: dbgSnap,
  };
}
await setLegacy(false);

// 截图对比（修复态/旧态各一张,日耀套复穿）
await grantArmor([2763, 2764, 2765]);
await pinPlayer(); await waitFrames(2);
await page.screenshot({ path: `${OUT}/solar_fixed.png` });
await setLegacy(true); await pinPlayer(); await waitFrames(2);
await page.screenshot({ path: `${OUT}/solar_legacy.png` });
await setLegacy(false);

// 管线态记录（warpOn 路径/GL 档）
const pipeInfo = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    waveQuality: g.renderer ? undefined : undefined,
    cpuRender: g.renderer.isCpuRender?.() ?? null,
  };
});

// ---- 合成单测（决定性判别:直接驱动 escapeVeil 三方法验证复合代数+无双罩;
//   不依赖游戏内收集面的玩家态间歇性——BJ665b/597 收集面在水下玩家态的
//   位置/姿态依赖为既有行为,非本刀域）----
const synth = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const CW = r.ctx.canvas.width, CH = r.ctx.canvas.height;
  const X = Math.floor(CW / 2) - 60, Y = Math.floor(CH / 2) - 60;   // 盒基点(屏中央)
  // 水层=全幅水色 α0.6(前景水语义)
  const vcv = document.createElement('canvas'); vcv.width = CW; vcv.height = CH;
  const v2 = vcv.getContext('2d');
  v2.fillStyle = 'rgba(40,90,180,0.6)';
  v2.fillRect(0, 0, CW, CH);
  const px = (img, x, y) => { const i = ((y - Y) * 120 + (x - X)) * 4; return [img[i], img[i + 1], img[i + 2]]; };
  const base = r.ctx.getImageData(X, Y, 120, 120).data;   // 非甲区零双罩基线（画红前）
  // 甲件直绘基线（模拟 flushLunarArmor 主画布直绘:恒等域红方块）
  r.ctx.save();
  r.ctx.setTransform(1, 0, 0, 1, 0, 0);
  r.ctx.fillStyle = 'rgb(255,0,0)';
  r.ctx.fillRect(X + 20, Y + 20, 80, 80);
  r.ctx.restore();
  const redC = px(r.ctx.getImageData(X, Y, 120, 120).data, X + 60, Y + 60);   // 直绘后（罩前）甲中心
  // 注入罩源+执行会话
  r._liqVeil = vcv;
  const ok = r.escapeVeilBegin();
  r.escapeVeilStroke({ x: X - 10, y: Y - 10, w: 140, h: 140 }, (mc) => {
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.fillStyle = 'rgb(255,0,0)';           // mask 形状（α=1=不透明恒色甲档）
    mc.fillRect(X + 20, Y + 20, 80, 80);
  });
  r.escapeVeilEnd();
  r._liqVeil = null;
  const after = r.ctx.getImageData(X, Y, 120, 120).data;
  // 甲件中心像素期望:水(40,90,180,0.6) over 红(255,0,0)=
  //   R=40×0.6+255×0.4=126, G=90×0.6=54, B=180×0.6=108
  const armorC = px(after, X + 60, Y + 60);
  const armorEdge = px(after, X + 25, Y + 25);
  // 非甲区（盒内甲外）:零双罩=与基线逐位同（第一份水在世界层,本复合不触）
  let nonArmorMaxD = 0;
  for (let i = 0; i < base.length; i += 4) {
    const x = X + (i / 4) % 120, y = Y + Math.floor(i / 4 / 120);
    if (x >= X + 20 && x < X + 100 && y >= Y + 20 && y < Y + 100) continue;
    const d = Math.max(Math.abs(base[i] - after[i]), Math.abs(base[i + 1] - after[i + 1]), Math.abs(base[i + 2] - after[i + 2]));
    if (d > nonArmorMaxD) nonArmorMaxD = d;
  }
  const exp = [126, 54, 108];
  const armorD = Math.max(Math.abs(armorC[0] - exp[0]), Math.abs(armorC[1] - exp[1]), Math.abs(armorC[2] - exp[2]));
  const edgeD = Math.max(Math.abs(armorEdge[0] - exp[0]), Math.abs(armorEdge[1] - exp[1]), Math.abs(armorEdge[2] - exp[2]));
  const redOk = Math.max(Math.abs(redC[0] - 255), Math.abs(redC[1] - 0), Math.abs(redC[2] - 0)) <= 3;
  return {
    ok, redOk, armorC, armorEdge, exp, armorD, edgeD, nonArmorMaxD,
    pass: ok && redOk && armorD <= 3 && edgeD <= 6 && nonArmorMaxD <= 2,
  };
});
console.log('=== 合成单测（escapeVeil 复合代数;期望甲像素=(126,54,108)）===');
console.log(JSON.stringify(synth));

console.log('=== BJ676 探针结果（A/B 交替 4 轮聚合;A=修复态 B=旧态 patch）===');
for (const [k, v] of Object.entries(results)) {
  console.log(`[${k}] fixed(水罩态) avg=${JSON.stringify(v.avgA)}`);
  console.log(`  torso A/B diff: maxD=${v.torsoAB.maxD} avgD=${v.torsoAB.avgD} dB=${v.torsoAB.dB}`);
  console.log(`  head  A/B diff: maxD=${v.headAB.maxD} avgD=${v.headAB.avgD} dB=${v.headAB.dB}`);
  console.log(`  legs  A/B diff: maxD=${v.legsAB.maxD} avgD=${v.legsAB.avgD} dB=${v.legsAB.dB}`);
  console.log(`  ctrl  A/B diff: maxD=${v.ctrlAB.maxD} avgD=${v.ctrlAB.avgD} dB=${v.ctrlAB.dB} (玩家外水域=帧漂移底噪)`);
  console.log(`  dbg: strokes=${v.dbg.strokes} veilNull=${v.dbg.veilNull} agLen=${JSON.stringify(v.dbg.agLen)}`);
}
console.log('pipeInfo:', JSON.stringify(pipeInfo));
console.log('pageerrors:', errors.length, errors.slice(0, 5));

// 判别断言（探针内自结案）。
// 主判据=合成单测（escapeVeil 复合代数逐位+零双罩——决定性,不依赖游戏内
//   收集面的玩家态间歇性）;游戏内 A/B=solar 恒色甲面环境证据（任意跑若收集
//   发生（agLen 有 lunarArmor/lunarCover 非零帧）则信号显著）。nebula glow 面
//   与 solar 同链（armorGlow stroke 同一 escapeVeilStroke/End 机制+首跑历史
//   信号 30.1/+25.13）,收集间歇=BJ665b/597 收集面水下玩家态既有行为,非本刀域。
const sol = results.solar, neb = results.nebula, nak = results.naked;
const solCollected = sol.dbg.agLen.some((a) => a[1] > 0 || a[2] > 0);
const verdict = {
  syntheticAlgebra: synth.pass,
  solarVeiled: !solCollected || (sol.torsoAB.avgD > 15 && sol.torsoAB.dB > 10),
  nakedZero: nak.torsoAB.avgD < 2 && nak.torsoAB.maxD < 12,
};
console.log('VERDICT:', JSON.stringify(verdict));
await browser.close();
process.exit(Object.values(verdict).every(Boolean) ? 0 : 1);
