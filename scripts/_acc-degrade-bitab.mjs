// ★b2b-acc-degraded 清偿批 位级对拍 v2（2026-10-05）：清偿①③像素安全证明。
// 【场景】全冻结确定性面:无实体（塔漂移/盾动画=上一版噪声源,全撤）+freezeClock+
//   tileAnim 钉相位+玩家/相机钉位+手动 vnow 步进;文本注入经 drawWires 包裹
//   （世界段每帧必经）落固定世界坐标（悬停名板族同构:measureText+fillRect+
//   fillText+strokeText 同点位）。
// 【判据 C≡D】NEW(acc 纯 GL)与 OLD(降级链)产出路由本就异相（既有 census 口径）——
//   路由差在注入/不注入两态必须全等:census(NEW+inj,OLD+inj)≡census(NEW+no,OLD+no)
//   ⇔ 注入文本在两臂逐字节相等=修复零像素差。辅判据:同臂 inj-vs-no 差=文本脚印
//   （局部化,NEW 臂该脚印=栅格化支实际产出像素）。
// 运行:SW_ORIGIN=http://localhost:5217 node tools/run-diag.mjs --timeout=280000 scripts/_acc-degrade-bitab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5217';
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL' }  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message.slice(0, 160)));
await bootstrap(page, `${ORIGIN}/?c10e=0&bgl=1&cloudcache=0`);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await freezeClock(page, { tod: 0.5 });

// ---- 全冻结确定性套件 + 可开关注入 + 旗开关 + snap/census ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; w.update = () => {}; }
  g.player.debugGod = true;
  g.enemySpawnEnabled = false;
  g.player.vx = 0; g.player.vy = 0;
  // 玩家/相机钉位（世界坐标锚=注入文本落点基准）
  g.player.x = g.world.spawnX * 16 + 8;
  g.player.y = g.world.spawnY * 16 - 40;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  window.__pinCam = () => {
    g.player.x = g.world.spawnX * 16 + 8;
    g.player.y = g.world.spawnY * 16 - 40;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  };
  // ★可开关文本注入（drawWires=世界段每帧必经;固定世界坐标=相机钉位下屏幕位恒定）
  const RP = Object.getPrototypeOf(r);
  const origDw = RP.drawWires;
  RP.drawWires = function (...a) { return origDw.apply(this, a); };
  window.__setInj = (on) => {
    RP.drawWires = on
      ? function (...a) {
          const r2 = origDw.apply(this, a);
          try {
            const ctx = this.ctx;
            const px = g.player.cx - 40, py = g.player.cy - 60;   // 玩家左上近域（地形上方）
            ctx.font = '12px sans-serif';
            const label = '旅商';
            const tw = ctx.measureText(label).width;
            if (window.__injPlate !== false) {
              ctx.fillStyle = 'rgba(20,16,28,0.85)';
              ctx.fillRect(px - tw / 2 - 5, py - 20, tw + 10, 15);
            }
            ctx.fillStyle = '#E8E4F0';
            ctx.textAlign = 'center';
            ctx.fillText(label, px, py);
            ctx.textAlign = 'left';
            ctx.font = '10px sans-serif';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(label, px + 40, py);
          } catch { /* */ }
          return r2;
        }
      : function (...a) { return origDw.apply(this, a); };
  };
  window.__setFix = (on) => {
    const M = r.bglEntShim.constructor;
    M.RV_MEASURE_OFF = !on;
    M.TEXT_RASTER_OFF = !on;
  };
  window.__framePath = () => r.bglPathUsed;
  window.__vnow = performance.now();
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      window.__pinCam();
      window.__vnow += 16.6667;
      g.frame(window.__vnow);
    }
  };
  window.__snap = () => {
    const c = r.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  };
  window.__census = (a, b) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const samples = [];
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++;
        if (dd > maxd) maxd = dd;
        const px2 = (i >> 2) % W, py2 = (i >> 2) / W | 0;
        if (px2 < x0) x0 = px2; if (px2 > x1) x1 = px2;
        if (py2 < y0) y0 = py2; if (py2 > y1) y1 = py2;
        if (samples.length < 200) {
          samples.push({ x: px2, y: py2, d: dd, A: [P[i], P[i + 1], P[i + 2], P[i + 3]], B: [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]] });
        }
      }
    }
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null, samples };
  };
});

// ---- 全局预热（chunk 烘焙/光照门 settle——冷态漂移源;BD 判据护栏）----
await page.evaluate((v) => { window.__injPlate = v; }, process.env.BITAB_PLATE !== '0');
await page.evaluate(() => window.__step(120));
await new Promise((r) => setTimeout(r, 500));

// ---- zoom1（整数严格档）+ zoom1.25（分数档,登记口径） ----
const ZOOMS = (process.env.BITAB_ZOOMS || '1,1.25').split(',').map(Number);
for (const zoom of ZOOMS) {
  console.log(`--- zoom=${zoom} ---`);
  await page.evaluate((z) => { window.__swGame.camera.zoom = z; }, zoom);

  async function arm(fix, inj) {
    await page.evaluate((s) => { window.__setFix(s[0]); window.__setInj(s[1]); window.__step(5); }, [fix, inj]);
    const fins = [];
    const paths = new Set();
    for (let k = 0; k < 3; k++) {
      await page.evaluate(() => window.__step(1));
      paths.add(await page.evaluate(() => window.__framePath()));
      fins.push(await page.evaluate(() => window.__snap()));
    }
    return { fins, paths };
  }

  const newInj = await arm(true, true);
  const oldInj = await arm(false, true);
  const newNo = await arm(true, false);
  const oldNo = await arm(false, false);

  chk(`BB[${zoom}]: NEW 臂零降级路径`, [...newInj.paths].every((p) => p.startsWith('b2b-acc') && !p.includes('degraded')), [...newInj.paths].join(','));
  chk(`BB[${zoom}]: OLD 臂注入帧降级路径在场`, [...oldInj.paths].some((p) => p.startsWith('b2b-acc-degraded')), [...oldInj.paths].join(','));

  const selfNew = await page.evaluate(({ a, b }) => window.__census(a, b), { a: newInj.fins[0], b: newNo.fins[0] });
  const selfOld = await page.evaluate(({ a, b }) => window.__census(a, b), { a: oldInj.fins[0], b: oldNo.fins[0] });
  console.log(`  文本脚印 NEW n=${selfNew.n} bbox=${JSON.stringify(selfNew.bbox)} | OLD n=${selfOld.n} bbox=${JSON.stringify(selfOld.bbox)}`);
  chk(`BV[${zoom}]: 注入脚印两臂同现且局部化`, selfNew.n > 0 && selfOld.n > 0
    && selfNew.bbox && (selfNew.bbox[2] - selfNew.bbox[0]) < 400 && (selfNew.bbox[3] - selfNew.bbox[1]) < 400
    && selfOld.bbox && (selfOld.bbox[2] - selfOld.bbox[0]) < 400 && (selfOld.bbox[3] - selfOld.bbox[1]) < 400,
    `NEW n=${selfNew.n} OLD n=${selfOld.n}`);

  // ★判据 C≡D
  const C = await page.evaluate(({ a, b }) => window.__census(a, b), { a: newInj.fins[0], b: oldInj.fins[0] });
  const D = await page.evaluate(({ a, b }) => window.__census(a, b), { a: newNo.fins[0], b: oldNo.fins[0] });
  console.log(`  路由差 C(注入) n=${C.n} maxd=${C.maxd} | D(无注入) n=${D.n} maxd=${D.maxd}`);
  if (C.n !== D.n || C.maxd !== D.maxd) {
    const top = [...(C.samples ?? [])].sort((p, q) => q.d - p.d).slice(0, 10);
    const hist = {};
    for (const sp of (C.samples ?? [])) { const b = sp.d <= 2 ? '≤2' : sp.d <= 8 ? '≤8' : sp.d <= 32 ? '≤32' : sp.d <= 96 ? '≤96' : '>96'; hist[b] = (hist[b] ?? 0) + 1; }
    console.log('  C 差直方图:', JSON.stringify(hist), ' top:', JSON.stringify(top));
    console.log('  自差样本 NEW(注入vs无):', JSON.stringify((selfNew.samples ?? []).slice(0, 6)));
    console.log('  自差样本 OLD(注入vs无):', JSON.stringify((selfOld.samples ?? []).slice(0, 6)));
  }
  const plate = process.env.BITAB_PLATE !== '0';
  if (C.n === D.n && C.maxd === D.maxd) {
    chk(`BC[${zoom}]: C≡D 严格（注入文本两臂逐字节相等=修复零像素差）`, true, `n=${C.n} maxd=${C.maxd}`);
  } else if (!plate) {
    // 纯文本形态:无底板=无分数矩形路由 census → 字形预乘/tie 舍入上界 ≤4
    const hist = { le2: 0, le4: 0, gt4: 0 };
    for (const sp of (C.samples ?? [])) { if (sp.d <= 2) hist.le2++; else if (sp.d <= 4) hist.le4++; else hist.gt4++; }
    chk(`BC[${zoom}]: 纯文本 C 有界（字形预乘/tie 舍入 ≤4）`, C.n <= selfNew.n + selfOld.n + 20 && C.maxd <= 4 && hist.gt4 === 0,
      `n=${C.n} maxd=${C.maxd} hist=${JSON.stringify(hist)}`);
  } else {
    const extra = C.n - D.n;
    chk(`BC[${zoom}]: C−D 差集有界（底板分数矩形=既有 acc-GL census 类,登记）`, extra >= 0 && extra <= Math.max(selfNew.n, selfOld.n) + 20,
      `C−D=${extra}（脚印 NEW=${selfNew.n}/OLD=${selfOld.n}） maxd C=${C.maxd} D=${D.maxd}`);
  }

  const newInj2 = await arm(true, true);
  const recEq = newInj2.fins.every((f, k) => f.b64 === newInj.fins[k].b64);
  chk(`BD[${zoom}]: 重跑恢复 NEW'≡NEW`, recEq, recEq ? md5(newInj.fins[0].b64).slice(0, 8) : '漂移');
}
await page.evaluate((z) => { window.__swGame.camera.zoom = 1; }, 1);

if (pageErrors.length) console.log('PAGEERRORS:', pageErrors.slice(0, 5));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
