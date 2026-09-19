// ★信息栏 DOM 化(2026-09-19)A/B 帧时计量 + 观感对拍截图。
// 场景:贝壳电话(全 12 门禁)→ 12 行全显。臂序 OFF(canvas 旧路径)/ON(DOM 层)
// 交替 ×3 复现,每臂 600 渲染帧,renderer.render 实例包裹计量(主线程同步段),
// 附加归因包裹 infoAccs.draw(canvas 臂)/InfoAccsDOM.prototype.update(DOM 臂)。
// 截图矩阵:base/hover/gold/long(215 钳制)/en/inventory 双臂成对,clip 信息列区域。
import { launchBrowser, openPage, bootstrap, createGame, front, ledger } from '../tools/probe/lib/index.mjs';

const L = ledger();
const FRAMES = 600;
const REPS = 3;

const browser = await launchBrowser({});
const page = await openPage(browser, { errors: L.fails });
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: 'small' });

// ---- 装备贝壳电话(ALL_IN_ONE:全 12 门禁)→ 12 行全显 ----
// (bridge 竞态防抖:__swFlow/__swGame 晚到时轮询等待,上次直取偶发 undefined)
const equip = await page.evaluate(async () => {
  for (let i = 0; i < 60 && !(window.__swFlow?.itemByVid && window.__swGame?.player?.inv?.armor); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const g = window.__swGame;
  const flow = window.__swFlow;
  if (!flow?.itemByVid || !g?.player?.inv?.armor) return { ok: false, why: 'no-bridge' };
  const vid = [3124, 5358, 3123].find((v) => flow.itemByVid(v) != null);
  if (vid == null) return { ok: false, why: 'no-allinone-vid' };
  const iid = flow.itemByVid(vid);
  g.player.inv.armor[3] = { id: iid, stack: 1 };
  return { ok: true, vid, iid };
});
L.chk('装备全门禁饰品(armor[3])', equip.ok, JSON.stringify(equip));
await new Promise((r) => setTimeout(r, 600));
const gates = await page.evaluate(() => {
  const gi = window.__swGame.player.equipStats.infoAccs;
  return {
    accWatch: gi.accWatch, accCompass: gi.accCompass, accDepthMeter: gi.accDepthMeter,
    accCalendar: gi.accCalendar, accFishFinder: gi.accFishFinder, accWeatherRadio: gi.accWeatherRadio,
    accThirdEye: gi.accThirdEye, accJarOfSouls: gi.accJarOfSouls, accCritterGuide: gi.accCritterGuide,
    accStopwatch: gi.accStopwatch, accOreFinder: gi.accOreFinder, accDreamCatcher: gi.accDreamCatcher,
  };
});
const gateCount = Object.values(gates).filter(Boolean).length;
L.chk('12 门禁全开', gateCount === 12, JSON.stringify(gates));

// ---- 计量 instrumentation(render 包裹 + 归因包裹) ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const P = window.__swInfoPerf = { cur: null, frames: [], attr: {} };
  if (!window.__swInfoPerfWrapped) {
    window.__swInfoPerfWrapped = true;
    const origRender = r.render.bind(r);
    r.render = function (...a) {
      const t0 = performance.now();
      try { return origRender(...a); }
      finally {
        const Q = window.__swInfoPerf;
        if (Q.cur) {
          Q.frames.push(performance.now() - t0);
          const n = Q.cur;
          if (Q.attr[n]) Q.attr[n].n++;
        }
      }
    };
    // 归因:canvas 臂 = infoAccs.draw;DOM 臂 = InfoAccsDOM.prototype.update
    const origDraw = r.infoAccs.draw.bind(r.infoAccs);
    r.infoAccs.draw = function (...a) {
      const t0 = performance.now();
      try { return origDraw(...a); }
      finally {
        const Q = window.__swInfoPerf;
        if (Q.cur === 'canvas') { const e = Q.attr.canvasLayer ??= { ms: 0, n: 0 }; e.ms += performance.now() - t0; }
      }
    };
    const DOM = await import('/src/render/InfoAccsDOM.ts');
    const proto = DOM.InfoAccsDOM.prototype;
    const origUpdate = proto.update;
    proto.update = function (...a) {
      const t0 = performance.now();
      try { return origUpdate.apply(this, a); }
      finally {
        const Q = window.__swInfoPerf;
        if (Q.cur === 'dom') { const e = Q.attr.domLayer ??= { ms: 0, n: 0 }; e.ms += performance.now() - t0; }
      }
    };
  }
});

async function runArm(flag) {
  await page.evaluate((f) => {
    window.__swInfoDom.set(f);
    window.__swInfoPerf.cur = f ? 'dom' : 'canvas';
    window.__swInfoPerf.frames = [];
    window.__swInfoPerf.attr[f ? 'dom' : 'canvas'] = { ms: 0, n: 0 };
  }, flag);
  await page.evaluate((n) => new Promise((res) => {
    const g = window.__swGame;
    const t0 = g.renderer.animTick;
    const iv = setInterval(() => { if (g.renderer.animTick - t0 >= n) { clearInterval(iv); res(); } }, 25);
  }), FRAMES);
  return page.evaluate(() => {
    const Q = window.__swInfoPerf;
    const frames = Q.frames;
    Q.frames = [];
    return { frames, attr: JSON.parse(JSON.stringify(Q.attr[Q.cur])) };
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };

// 预热(DOM 首建/atlas dataURL 烤/字体就绪后)再进正式计量
await runArm(true);
await runArm(false);

const pools = { canvas: [], dom: [] };
const attrAcc = { canvas: { ms: 0, n: 0 }, dom: { ms: 0, n: 0 } };
for (let rep = 0; rep < REPS; rep++) {
  for (const flag of [false, true]) {
    await front(page);
    const { frames, attr } = await runArm(flag);
    const arm = flag ? 'dom' : 'canvas';
    pools[arm].push({ mean: mean(frames), p95: p95(frames), n: frames.length });
    attrAcc[arm].ms += attr.ms; attrAcc[arm].n += attr.n;
  }
}
for (const arm of ['canvas', 'dom']) {
  const ms = pools[arm].map((p) => p.mean);
  const ps = pools[arm].map((p) => p.p95);
  L.say(`render ${arm}: mean ${mean(ms).toFixed(3)}ms/f (reps ${ms.map((x) => x.toFixed(3)).join('/')}), p95 ${mean(ps).toFixed(3)}ms/f, frames=${pools[arm][0]?.n}`);
}
L.say(`render dom/canvas mean 比 = ${(mean(pools.dom.map((p) => p.mean)) / mean(pools.canvas.map((p) => p.mean))).toFixed(3)}×`);
// ★headless performance.now 钳制(~100µs,非 crossOriginIsolated)→ 逐帧归因不可
//   分辨,改批量微基准:同帧参数连调 N 次取均值(总时长 >> 钳制窗)
const micro = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const args = [r.ctx, r.canvas.width, r.canvas.height, r.infoAccCtx,
    g.player.hideInfo, r.playerInventory, r.mapStyle === 1 && !!r.minimap, -1, 0, 0];
  window.__swInfoPerf.cur = null;
  // canvas 臂:infoAccs.draw ×600(旗关态)
  window.__swInfoDom.set(false);
  r.infoAccs.draw(...args);   // 预热烘焙缓存
  let t0 = performance.now();
  for (let k = 0; k < 600; k++) r.infoAccs.draw(...args);
  const canvasPer = (performance.now() - t0) / 600;
  // DOM 臂:update ×600(旗开态;稳态 diff)
  window.__swInfoDom.set(true);
  const dom = r.infoAccDom;
  const hr = window.__swGame.renderer.infoAccHover;
  const dargs = [r.canvas.width, r.canvas.height, r.infoAccCtx,
    g.player.hideInfo, r.playerInventory, r.mapStyle === 1 && !!r.minimap, hr, -1, -1];
  dom.update(...dargs);   // 预热
  t0 = performance.now();
  for (let k = 0; k < 600; k++) dom.update(...dargs);
  const domPer = (performance.now() - t0) / 600;
  window.__swInfoDom.set(false);
  return { canvasPer, domPer };
});
L.say(`微基准 层内稳态开销: canvas infoAccs.draw=${(micro.canvasPer * 1000).toFixed(1)}µs/帧, DOM update=${(micro.domPer * 1000).toFixed(1)}µs/帧`);

// ---- 行数/DOM 结构断言(12 行) ----
const struct = await page.evaluate(async () => {
  window.__swInfoDom.set(true);
  await new Promise((r) => setTimeout(r, 300));
  const g = window.__swGame;
  const dom = g.renderer.infoAccDom;
  return {
    rows: g.renderer.infoAccs.state.rows.length,
    domRows: dom ? dom.el.querySelectorAll('.sw-inf-row').length : -1,
    mounted: !!dom?.el.parentElement,
    disp: dom ? dom.el.style.display : null,
  };
});
L.chk('DOM 层 12 行挂载', struct.rows === 12 && struct.domRows === 12 && struct.mounted && struct.disp === 'block', JSON.stringify(struct));

// ---- 截图矩阵(双臂成对;clip 信息列区域——小地图开=+261 偏移,行带 y≈308..572) ----
const view = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
const CLIP = { x: view.w - 300, y: 280, width: 300, height: 340 };

async function shot(tag, flag) {
  await page.evaluate((f) => {
    window.__swInfoDom.set(f);
    window.__swInfoPerf.cur = null;   // 截图期停计量
  }, flag);
  await new Promise((r) => setTimeout(r, 400));
  await front(page);
  const name = tag === 'base' ? (flag ? 'perf4-infodom' : 'perf4-infocanvas') : `perf4-matrix-${flag ? 'dom' : 'canvas'}-${tag}`;
  await page.screenshot({ path: `/tmp/${name}.png`, clip: CLIP });
}

// gold/long 文本覆盖:tickInfoAccs 实例影子——原调用后改写 ctx 字段
await page.evaluate(() => {
  const g = window.__swGame;
  if (!g.__origTickInfoAccs) {
    g.__origTickInfoAccs = g.tickInfoAccs;
    g.__infoAccOverride = null;
    g.tickInfoAccs = function () {
      g.__origTickInfoAccs.call(g);
      const o = g.__infoAccOverride;
      if (o && g.renderer.infoAccCtx) Object.assign(g.renderer.infoAccCtx, o);
    };
  }
});

await shot('base', false);
await shot('base', true);
// 全幅两张(层序上下文:信息列 vs 小地图/资源条/画布面板)
await page.evaluate(() => { window.__swInfoDom.set(false); });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/perf4-full-canvas.png' });
await page.evaluate(() => { window.__swInfoDom.set(true); });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/perf4-full-dom.png' });

// hover:DOM 臂移鼠标到行 2 图标(真 mouseenter);canvas 臂同坐标(hitTest 命中)
const hoverXY = await page.evaluate(() => {
  const g = window.__swGame;
  const dom = g.renderer.infoAccDom;
  const el = dom?.el.querySelector('.sw-inf-row[data-row="2"] img');
  if (el) { const r = el.getBoundingClientRect(); return { x: r.left + 7, y: r.top + 7, src: 'dom' }; }
  const rect = g.renderer.infoAccs.state.iconRects[2];
  return rect ? { x: rect.x + 7, y: rect.y + 7, src: 'canvas' } : null;
});
if (hoverXY) {
  await page.mouse.move(hoverXY.x, hoverXY.y);
  await new Promise((r) => setTimeout(r, 300));
  const hv = await page.evaluate(() => window.__swGame.renderer.infoAccHover);
  L.chk('悬停行命中(infoAccHover=2)', hv === 2, `hover=${hv} src=${hoverXY.src}`);
  await shot('hover', true);
  await shot('hover', false);
  await page.mouse.move(10, 500);
  await new Promise((r) => setTimeout(r, 200));
} else {
  L.chk('悬停坐标可得', false, 'no-row-2');
}

// gold 行(金兔 vid 443 ∈ GoldCrittersCollection)+ 降灰行已在 base(无宝藏/无怪)
await page.evaluate(() => { window.__swGame.__infoAccOverride = { rareText: '金色兔子', rareVid: 443 }; });
await new Promise((r) => setTimeout(r, 200));
await shot('gold', true);
await shot('gold', false);

// 长行 215 钳制(金属探测器行文本超 215px → scaleX 压缩)
await page.evaluate(() => {
  window.__swGame.__infoAccOverride = {
    oreText: '超长矿脉名称压行实验'.repeat(8),
    rareText: '金色兔子', rareVid: 443,
  };
});
await page.evaluate(() => { window.__swInfoDom.set(true); });   // 查验须在 DOM 臂(DOM 更新中)
await new Promise((r) => setTimeout(r, 300));
const clampInfo = await page.evaluate(() => {
  const spans = [...(window.__swGame.renderer.infoAccDom?.el.querySelectorAll('.sw-inf-row span') ?? [])];
  const hit = spans.find((s) => s.style.transform.includes('scale('));
  return hit ? { tf: hit.style.transform, text: hit.textContent.slice(0, 24) } : { tf: null, n: spans.length };
});
L.chk('长行钳制 transform scale 生效', !!(clampInfo && clampInfo.tf), JSON.stringify(clampInfo));
await shot('long', true);
await shot('long', false);

// 英文面(Lang 切 en-US;文本数据源=装配层,零涉及)
await page.evaluate(() => { window.__swGame.__infoAccOverride = null; });
const langInfo = await page.evaluate(async () => {
  const m = await import('/src/i18n/Lang.ts');
  const Lang = m.Lang;
  const prev = Lang.activeCultureName;
  if (typeof Lang.setLanguage === 'function') await Lang.setLanguage('en-US');
  else if (typeof Lang.set === 'function') Lang.set('en-US');
  return { prev, now: Lang.activeCultureName, api: typeof Lang.setLanguage === 'function' ? 'setLanguage' : 'set' };
});
await new Promise((r) => setTimeout(r, 200));
L.say(`lang: ${JSON.stringify(langInfo)}`);
await shot('en', true);
await shot('en', false);
await page.evaluate(async () => {
  const m = await import('/src/i18n/Lang.ts');
  const Lang = m.Lang;
  if (typeof Lang.setLanguage === 'function') await Lang.setLanguage('zh-Hans');
  else if (typeof Lang.set === 'function') Lang.set('zh-Hans');
});

// 背包开(横排图标;DOM 横排支)。★renderer.playerInventory 每帧被 Game.render
// 从 __swUI.inventoryOpen 回写(Game.ts:47040);inventoryOpen 是 getter(读面板
// display,UI.ts:3053)——直写无效。为免 DOM 背包面板(.sw-vinv z10)盖住信息列
// 造成双臂不公平对比,实例属性影子 getter 钉 true(纯几何面,不建面板)
await page.evaluate(() => {
  Object.defineProperty(window.__swUI, 'inventoryOpen', { get: () => true, configurable: true });
  window.__swInfoDom.set(true);
});
await new Promise((r) => setTimeout(r, 300));
const invInfo = await page.evaluate(() => {
  const g = window.__swGame;
  const dom = g.renderer.infoAccDom;
  return { domRows: dom?.el.querySelectorAll('.sw-inf-row').length ?? -1 };
});
L.chk('背包横排 DOM 行', invInfo.domRows === 12, JSON.stringify(invInfo));
await shot('inv', true);
await shot('inv', false);
await page.evaluate(() => {
  delete window.__swUI.inventoryOpen;   // 摘实例影子,原型 getter 复原
  window.__swInfoDom.set(false);
});

// 旗关回退收尾:DOM 元素应收起、canvas 路径恢复
await page.evaluate(() => { window.__swInfoDom.set(false); });
await new Promise((r) => setTimeout(r, 200));
const offState = await page.evaluate(() => {
  const g = window.__swGame;
  return { disp: g.renderer.infoAccDom?.el.style.display, rows: g.renderer.infoAccs.state.rows.length };
});
L.chk('旗关回退:DOM 收起', offState.disp === 'none' && offState.rows === 12, JSON.stringify(offState));

console.log('[infodom] done');
process.exit(L.exitCode());
