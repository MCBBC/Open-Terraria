/**
 * SW-BJ547 探针：永恒水晶 548 本体过曝复验。
 * 用户复报（BJ546 复报）：本仓水晶本体全白过曝（只有轮廓）+紫晕环在；
 * 原版=紫色晶体细节清晰+白色高光点缀。
 * 取证面：
 *  ① drawImage 顺序账——源矩形 58×44（NPC_548 帧）的绘制序/composite/globalAlpha：
 *     定谳「内光环 4 份（lighter）是否画在本体（source-over）之后=叠在本体上」。
 *  ② 本体核心区像素直读——紫细节像素占比（b−g≥50 且 b≥150）vs 过曝白占比
 *     (min(r,g,b)≥225)；过曝=白占比压倒紫占比。
 *  ③ 光照值——lighting.lightAt(水晶心格)（AddLight 1.3/0.5/1.5 自发光面）。
 *  ④ 二次复绘排查——同帧 58×44 源绘制总数（本体 1 + 内环 4 + 外环 4 = 9 正常；
 *     白提亮队列/516 恒量支不含 548=静态已核）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, spawnEnemy, teleport, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj547';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj547Recs = [];
window.__bj547On = false;
window.__bj547Install = () => {
  let n = 0;
  for (const proto of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
    if (proto.__bj547p) continue;
    proto.__bj547p = true;
    const oi = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        if (window.__bj547On && a.length === 9 && a[3] === 58 && a[4] === 44 && window.__bj547Recs.length < 400) {
          window.__bj547Recs.push({
            comp: this.globalCompositeOperation,
            alpha: +this.globalAlpha.toFixed(4),
            dx: Math.round(a[5]), dy: Math.round(a[6]),
            caller: (new Error().stack.split('\\n')[2] || '').trim().slice(0, 110),
          });
        }
      } catch (e) {}
      return oi.apply(this, a);
    };
    n++;
  }
  return 'installed x' + n;
};
'ok';
`;

const PIXEL_READ = `(() => {
  const g = window.__swGame;
  const es = (g.entities.enemies ?? []).filter((e) => e.vanillaId === 548);
  if (!es.length) return { why: 'no-crystal' };
  const e = es[0];
  const cam = g.camera;
  const cv = g.renderer.canvas;
  // 本体贴图中心 = 盒中心+(1,-18)（BJ546 bodyAddY 锚）;取 40×28 内核（避开轮廓边）
  const bcx = e.cx + 1, bcy = e.cy - 18;
  const [px, py] = cam.worldToScreen(bcx, bcy);
  const z = cam.zoom;
  const W = Math.round(40 * z), H = Math.round(28 * z);
  const sx = Math.round(px - W / 2), sy = Math.round(py - H / 2);
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const cx2 = c2.getContext('2d', { willReadFrequently: true });
  cx2.drawImage(cv, sx, sy, W, H, 0, 0, W, H);
  const d = cx2.getImageData(0, 0, W, H).data;
  let purple = 0, blown = 0, mid = 0, dark = 0, total = 0;
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 8) continue;
    total++;
    sr += r; sg += gg; sb += b; sn++;
    const mn = Math.min(r, gg, b);
    if (mn >= 225) blown++;
    else if (b - gg >= 50 && b >= 150 && r >= gg - 20) purple++;
    else if (r + gg + b < 90) dark++;
    else mid++;
  }
  // 光照值（水晶心格）
  let light = null;
  try {
    const lt = g.renderer.lighting?.lightAt?.(Math.floor(e.cx / 16), Math.floor(e.cy / 16));
    if (lt) light = lt.map((v) => +Number(v).toFixed(3));
  } catch (err) {}
  return {
    why: null, total, purple, blown, mid, dark,
    purplePct: +(purple / Math.max(1, total) * 100).toFixed(1),
    blownPct: +(blown / Math.max(1, total) * 100).toFixed(1),
    meanRGB: sn ? [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)] : null,
    light,
    spawnAlpha: e.spawnAlpha, ai1: e.ai1, cx: Math.round(e.cx), cy: Math.round(e.cy),
  };
})()`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 30, { clearEnemies: true });

  // 出生点附近空域放水晶（中心锚,坑表 I1）
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy - 24) };
  });
  await teleport(page, spot.x, spot.y);
  await pump(page, 10, { clearEnemies: true });

  const inst = await page.evaluate(INSTALL);
  L.say(`hook: ${inst}`);
  await page.evaluate(() => { window.__bj547Recs.length = 0; window.__bj547On = true; });
  const sp = await spawnEnemy(page, 548, spot.x, spot.y - 40);
  L.chk('spawn548', sp.ok, JSON.stringify(sp).slice(0, 140));
  await pump(page, 4);
  for (let i = 0; i < 3; i++) await nextFrame(page);

  const px = await page.evaluate(PIXEL_READ);
  L.say(`pixel(full): ${JSON.stringify(px)}`);
  // 波形相位逐拍波动（n131 光柱脉冲/n122 呼吸）→ 6 帧聚合抗单拍偏差
  const agg = { purple: 0, blown: 0, total: 0 };
  for (let k = 0; k < 6; k++) {
    await pump(page, 3);
    const p = await page.evaluate(PIXEL_READ);
    if (p && !p.why) { agg.purple += p.purple; agg.blown += p.blown; agg.total += p.total; }
  }
  const aggPurplePct = +(agg.purple / Math.max(1, agg.total) * 100).toFixed(1);
  const aggBlownPct = +(agg.blown / Math.max(1, agg.total) * 100).toFixed(1);
  L.say(`agg(full): purple=${aggPurplePct}% blown=${aggBlownPct}%`);

  // ---- 逐层剥离（活体原型 patch——GL 桥不走 2D drawImage,层序账改由剥层归因）----
  const strip = await page.evaluate(`(() => {
    const g = window.__swGame;
    const proto = Object.getPrototypeOf(g.renderer);
    const out = {};
    const origGlow = proto.drawNpcGlow;
    const origOv = proto.draw548CrystalOverlays;
    out.hasGlow = typeof origGlow === 'function';
    out.hasOv = typeof origOv === 'function';
    window.__bj547Orig = { glow: origGlow, ov: origOv };
    proto.drawNpcGlow = function (e, ...rest) {
      if (e && e.vanillaId === 548) return;               // 摘内光环（本体后槽旧挂点）
      return origGlow.call(this, e, ...rest);
    };
    return JSON.stringify(out);
  })()`);
  L.say(`strip1 install: ${strip}`);
  await pump(page, 2);
  const pxNoHalo = await page.evaluate(PIXEL_READ);
  L.say(`pixel(no inner halo): ${JSON.stringify({ purplePct: pxNoHalo.purplePct, blownPct: pxNoHalo.blownPct, meanRGB: pxNoHalo.meanRGB })}`);

  // 再摘外光环/环/光柱叠层（draw548CrystalOverlays）→ 纯本体参照相
  await page.evaluate(`(() => {
    const g = window.__swGame;
    const proto = Object.getPrototypeOf(g.renderer);
    proto.draw548CrystalOverlays = function () { return; };
  })()`);
  await pump(page, 2);
  const pxBodyOnly = await page.evaluate(PIXEL_READ);
  L.say(`pixel(body only): ${JSON.stringify({ purplePct: pxBodyOnly.purplePct, blownPct: pxBodyOnly.blownPct, meanRGB: pxBodyOnly.meanRGB })}`);

  // 还原双钩（防污染后续会话页面状态;页面随探针销毁,双保险）
  await page.evaluate(`(() => {
    const g = window.__swGame;
    const proto = Object.getPrototypeOf(g.renderer);
    proto.drawNpcGlow = window.__bj547Orig.glow;
    proto.draw548CrystalOverlays = window.__bj547Orig.ov;
  })()`);
  const recs = await page.evaluate(() => { window.__bj547On = false; return window.__bj547Recs; });

  await saveCanvasShot(page, `${OUT}/bj547-crystal.png`).catch(() => {});
  writeFileSync(`${OUT}/bj547-result.json`, JSON.stringify({ px, pxNoHalo, pxBodyOnly, recs }, null, 2));

  // 判读①：修复后全层相 = 紫细节压倒过曝白（6 帧聚合;剩余 blown=光柱核心亮斑
  //   =原版「白色高光点缀」,Extra_89 径向盘中心最亮区）
  L.chk('crystal-body-purple-dominant(full)', agg.total > 0 && aggPurplePct > 50 && aggPurplePct > aggBlownPct * 1.5,
    `agg purple=${aggPurplePct}% blown=${aggBlownPct}%`);
  // 判读②：内环在本体之下（原版 :24266→:24283 层序）——挂回本体之上的回归签名
  //   = +1.5×texel 加算把 blown 顶到 70%+（Δblown≥30）;正常相=轮廓透出小差
  //   （半透明 texel 透出内环,原版同相）+ 两拍读窗相位噪声（±8%）→ 阈值 20
  L.chk('inner-halo-under-body', pxNoHalo && !pxNoHalo.why &&
    (px.blownPct - pxNoHalo.blownPct) < 20,
    `blown ${px.blownPct}% → 摘内环 ${pxNoHalo.blownPct}%`);
  // 判读③：纯本体相 = 紫细节为主（原版相基准;本体=贴图×光,贴图紫色系）
  L.chk('body-only-purple-dominant', pxBodyOnly && !pxBodyOnly.why && pxBodyOnly.purplePct > pxBodyOnly.blownPct,
    `purple=${pxBodyOnly?.purplePct}% blown=${pxBodyOnly?.blownPct}% mean=${JSON.stringify(pxBodyOnly?.meanRGB)}`);
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
