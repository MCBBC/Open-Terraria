// ★A3 灯笼夜帧回收 活机探针 v2（2026-10-01）
// 验证面:
//  ①帧分类:灯夜激活帧 _c10eFrame 恒 true（farInterlayerActive lantern 项摘除=帧头
//    不再整帧打回 F-inter）且 _c10eWorldToHud 恒 false（worldRoute lantern 项摘除
//    =世界 over present,零全幅 blit）
//  ②far 带 stash 桥:flushFarLanternGL 每帧到达且 plans>0;replayFarLantern2D 恒 0
//  ③near 带 'lantern' 会话:emitLanternQuads 到达（near 桶）
//  ④定向像素证据:记录近灯主贴图 quad 屏心 → glCanvas 读回该位 9×9 暖度(r−b)，
//    on vs off 同位对比（世界 present 之后的合成面=最终呈现面）
//  ⑤层序目检:整页截图（灯于透明洞区可见/世界不透明区覆盖灯=背景语义）
import { launchBrowser, openPage, bootstrap, createGame, freezeClock, savePageShot } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MODE = process.env.A3_MODE || 'on';   // on=c10e 开(桥) / off=c10e 关(2D 全旧路径)
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, ORIGIN + (MODE === 'on' ? '/?c10e=1&' : '/?c10e=0&'));
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
const fr = await freezeClock(page, { tod: 22 / 24 });   // 夜 22:00（暗天空=灯可见度最大）
if (!fr.ok) { console.log(JSON.stringify({ ok: false, why: 'freeze-clock' })); process.exit(1); }
// ★灯笼带生成于 fx.surfaceY−900..surfaceY（≈5776 基线,比 spawn 实际地面 ~4383 深
//  ~1400px,scripts/_a3-lantern-state.mjs 定谳）——真灯夜要爬 10-20s 才入视野,
//  探针直接把灯散布到相机可视天区（只动世界态,不触渲染路径）
const groundY = await page.evaluate(() => {
  const g = window.__swGame, sky = g.renderer.sky;
  const gy = g.player.y;   // spawn 地面
  for (const l of sky.lanterns) if (l.active) l.y = gy - 900 + Math.random() * 700;
  return gy;
});
await new Promise((r) => setTimeout(r, 300));

// 挂装:桥计数器 + 主 quad 屏心记录（far/near 分桶）
await page.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  window.__a3 = { flush: 0, flushPlans: 0, replay2D: 0, nearCalls: 0, farCalls: 0,
    farMains: [], nearMains: [], inFar: false };
  sky.flushFarLanternGL = ((orig) => function (...a) {
    const d = sky.farLanternDeferred;
    window.__a3.flush++;
    window.__a3.flushPlans += (d?.plans?.length ?? 0);
    window.__a3.inFar = true;
    const out = orig.apply(this, a);
    window.__a3.inFar = false;
    return out;
  })(sky.flushFarLanternGL);
  sky.replayFarLantern2D = ((orig) => function (...a) {
    window.__a3.replay2D++;
    return orig.apply(this, a);
  })(sky.replayFarLantern2D);
  sky.drawLanternsNear = ((orig) => function (...a) {
    window.__a3.nearCalls++;
    return orig.apply(this, a);
  })(sky.drawLanternsNear);
  sky.drawLanterns = ((orig) => function (...a) {
    if (a[6] === undefined || a[6] === 'far' || a[6] === null) window.__a3.farCalls++;
    return orig.apply(this, a);
  })(sky.drawLanterns);
  sky.emitLanternQuads = ((orig) => function (gl, entry, s, p) {
    const bucket = window.__a3.inFar ? window.__a3.farMains : window.__a3.nearMains;
    if (bucket.length < 400) {
      bucket.push([Math.round(s.m[0] * p.sx + s.m[2] * p.sy + s.m[4]),
                   Math.round(s.m[1] * p.sx + s.m[3] * p.sy + s.m[5])]);
    }
    return orig.call(this, gl, entry, s, p);
  })(sky.emitLanternQuads);
});

// glCanvas 读回+像素证据（preserveDrawingBuffer:true → scratch 2D 中转恒可读;
// 采样在页内完成=零大数据过线）:
//  ①全帧暖像素普查（r−b>25;夜空 r<b 恒负不计数;灯=暖橙大正值;1/4 步进）
//    ——漂移免疫（on/off 同世界态相减,残差=灯+动画噪声）
//  ②定点 41×41 窗 r−b 最大值（记录屏心 ± 灯漂移余量;对照=off 同位）
const glWarmCensus = (positions) => page.evaluate((pts) => {
  const r = window.__swGame.renderer;
  const cv = (new URLSearchParams(location.search).get('c10e') !== '0')
    ? (r.glCanvasEl ?? r.swPipe?.canvas)
    : r.canvas;   // c10e 关=灯 2D 直画主画布
  if (!cv || !cv.width) return null;
  const s = document.createElement('canvas');
  s.width = cv.width; s.height = cv.height;
  const sc = s.getContext('2d');
  sc.drawImage(cv, 0, 0);
  const d = sc.getImageData(0, 0, cv.width, cv.height).data;
  let nonZero = 0, warm = 0, warmTop = 0;
  for (let i = 0, p = 0; i < d.length; i += 16, p += 4) {
    if (d[i + 3] > 8) nonZero++;
    // 灯=预乘低 α 暖橙（远带主 α≈0.12 → 合成 r≈45-65;夜空 r<b 恒负不误报）
    if (d[i] - d[i + 2] > 18 && d[i] > 38 && d[i + 3] > 12) {
      warm++;
      if (p < cv.width * 220) warmTop++;
    }
  }
  const winMax = pts.map(([x, y]) => {
    let mx = -999;
    for (let dy = -20; dy <= 20; dy += 2) for (let dx = -20; dx <= 20; dx += 2) {
      const px = Math.min(cv.width - 1, Math.max(0, x + dx));
      const py = Math.min(cv.height - 1, Math.max(0, y + dy));
      const i2 = (py * cv.width + px) * 4;
      const v = d[i2] - d[i2 + 2];
      if (v > mx) mx = v;
    }
    return mx;
  });
  return { nonZero, warm, warmTop, winMax };
}, positions);

// hold 灯夜（LanternNight.manualLanterns 页内不可达=持 lanternOpacity;
// up=false 衰减 −0.01/帧 → 周期回填 0.9;灯升顶漂出视窗 → 随手再散布）
const hold = setInterval(() => {
  page.evaluate(() => {
    const sky = window.__swGame.renderer.sky, gy = window.__swGame.player.y;
    sky.lanternOpacity = 0.9;
    for (const l of sky.lanterns) if (l.active && Math.random() < 0.35) l.y = gy - 900 + Math.random() * 700;
  }).catch(() => {});
}, 130);

// 采样 60 帧:帧分类 + 桥计数（每帧清零）
await page.evaluate(() => { Object.assign(window.__a3, { flush: 0, flushPlans: 0, replay2D: 0, nearCalls: 0, farCalls: 0 }); });
await page.evaluate(() => { window.__swGame.renderer.sky.lanternOpacity = 0.9; });
const rows = [];
for (let i = 0; i < 60; i++) {
  rows.push(await page.evaluate(() => {
    const r = window.__swGame.renderer, a = window.__a3;
    const row = {
      pure: r._c10eFrame === true, w2h: r._c10eWorldToHud === true,
      op: +r.sky.lanternOpacity.toFixed(2),
      flush: a.flush, flushPlans: a.flushPlans, replay2D: a.replay2D,
      near: a.nearCalls, far: a.farCalls, nearMains: a.nearMains.length,
    };
    a.flush = 0; a.flushPlans = 0; a.replay2D = 0; a.nearCalls = 0; a.farCalls = 0;
    a.farMains.length = 0; a.nearMains.length = 0;
    return row;
  }));
  await new Promise((r) => setTimeout(r, 33));
  await page.evaluate(() => { window.__swGame.renderer.sky.lanternOpacity = 0.9; });
}

// off 基线（opacity=0 → 各带早退,零灯 quad）+ 恢复 on 采像素证据
await page.evaluate(() => { window.__swGame.renderer.sky.lanternOpacity = 0; });
await new Promise((r) => setTimeout(r, 400));
const lastNear = await page.evaluate(() => window.__a3.nearMains.slice(-30));
const glOff = await glWarmCensus(lastNear);
await page.evaluate(() => { window.__swGame.renderer.sky.lanternOpacity = 0.9; });
await new Promise((r) => setTimeout(r, 300));
// on 读数:取【最新】屏心（恢复后重录,灯漂移落 41×41 窗内）
const freshNear = await page.evaluate(() => window.__a3.nearMains.slice(-30));
const glOn = await glWarmCensus(freshNear.length ? freshNear : lastNear);
await savePageShot(page, MODE === 'on' ? '/tmp/a3-lantern-on.png' : '/tmp/a3-lantern-off.png');

clearInterval(hold);
// 定位对比:记录屏心 41×41 窗 r−b 最大值 on−off（>0=该窗内出现灯像素）
let sampled = 0, warmGain = 0, gainSum = 0;
if (glOff && glOn && lastNear.length) {
  for (let i = 0; i < glOn.winMax.length; i++) {
    const d = glOn.winMax[i] - glOff.winMax[i];
    if (d > 8) warmGain++;
    gainSum += d;
    sampled++;
  }
}
const pureTrue = rows.filter((x) => x.pure).length;
const w2hTrue = rows.filter((x) => x.w2h).length;
const flushFrames = rows.filter((x) => x.flush > 0).length;
const plansSum = rows.reduce((s, x) => s + x.flushPlans, 0);
const nearFrames = rows.filter((x) => x.near > 0).length;
const farFrames = rows.filter((x) => x.far > 0).length;
const replaySum = rows.reduce((s, x) => s + x.replay2D, 0);
const warmDelta = glOn && glOff ? glOn.warm - glOff.warm : -1;
const warmTopDelta = glOn && glOff ? glOn.warmTop - glOff.warmTop : -1;
const bridgeGate = MODE === 'on';
const out = {
  mode: MODE,
  ok: (!bridgeGate || (pureTrue === rows.length && w2hTrue === 0
    && flushFrames >= rows.length * 0.9 && plansSum > 0 && replaySum === 0))
    && (!bridgeGate || (nearFrames >= rows.length * 0.9 && farFrames >= rows.length * 0.9))
    && warmDelta > 100,   // 两模式共同判据:on−off 全帧灯暖像素差（off=2D 旧路径基线）
  frames: rows.length,
  pureTrue, w2hTrue, flushFrames, plansSum, nearFrames, farFrames, replaySum,
  glReadback: { offNonZero: glOff?.nonZero ?? -1, onNonZero: glOn?.nonZero ?? -1 },
  warm: { off: glOff?.warm ?? -1, on: glOn?.warm ?? -1, delta: warmDelta, topDelta: warmTopDelta },
  lanternPixels: { sampled, warmGain, gainSum: +gainSum.toFixed(1) },
  errs,
  shot: MODE === 'on' ? '/tmp/a3-lantern-on.png' : '/tmp/a3-lantern-off.png',
};
console.log(JSON.stringify(out));
await browser.close();
process.exit(out.ok ? 0 : 2);
