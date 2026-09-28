// ★shineslice（?shineslice=1 缺省关）像素对拍+上传字节/帧对照（2026-09-28 登记债清算;
// _rain-gl-ab 范式）。A 臂=shineslice 关（动态支逐格 uploadScratchNow:6.4KB/格/帧上传
// +同量 getImageData 读回）;B 臂=shineslice 开（逐 (格内容,动画相位) 稳定键切片——
// 首见上传,稳态零传零读回;delta 走 quad tint）。场景=叶绿素农场模拟:视区内 300 格
// 脉动矿（sheet 211）直写 store（paused=无 spread/无演化;双臂同格同帧）。
// 判据：
//   SA  同帧 A≡B census 有界（GL f32 tint×预乘纹理 vs 2D multiply 8bit 烘焙——
//       ±1LSB 舍入域 census 登记（尘对合并/雨批同族）;n%<1%/maxd≤8/bbox 落矿区）;
//   SB  上传字节/帧前后（A=cells×6400B 上传+cells 次 getImageData 读回 → B 稳态 0
//       上传 0 读回;首见窗除外——计数面 uploadScratchNow vs uploadShineSlice 实传）;
//   SC  B 臂键账稳态（第 2 帧起零新纹理 texFromImage 调用;键数=变体数≪格数）;
//   SD  页面零错误+shim 链零降级（fallback=0/replays=0）。
// 运行:SW_ORIGIN=http://localhost:5248 node tools/run-diag.mjs --timeout=1200000 scripts/_shine-slice-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/shine-slice-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面静化 + 农场铺设 + 仪器钩 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  g.player.vx = 0; g.player.vy = 0;
  const w = g.world.weather;
  try { w.startRain(false, 0); } catch { /* 域差异 */ }
  w.raining = false;
  const hk = g.weatherHooks;
  if (hk) { hk.zoneRain = false; hk.surfaceAtmospherics = false; hk.shimmerAlpha = 0; }

  // 叶绿素农场:视区中央 20×15=300 格直写 store（paused=零演化;type=repo 叶绿素 id,
  // flags bit0=active;frame 置 0=blend 框架链现场算帧）。返回铺设数。
  window.__plantFarm = async () => {
    const td = (await import('/src/data/tiles.ts')).TILE_DEFS;
    const chloroId = td.findIndex((d) => d?.vanilla?.sheet === 211);
    if (chloroId < 0) return -1;
    const st = g.world.store;
    const cam = g.camera;
    const c = r.canvas;
    const vW = c.width / (cam.zoom || 1), vH = c.height / (cam.zoom || 1);
    const cx = Math.floor(cam.x / 16), cy = Math.floor(cam.y / 16);
    const W = 20, H = 15;
    const x0 = cx - W / 2, y0 = cy - H / 2;
    let n = 0;
    for (let y = y0; y < y0 + H; y++) {
      for (let x = x0; x < x0 + W; x++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        st.type[i] = chloroId;
        st.flags[i] = 1;          // bit0=active（hasTile 消费位）
        st.frameX[i] = 0; st.frameY[i] = 0; st.paint[i] = 0;
        n++;
      }
    }
    window.__farmN = n;
    return n;
  };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__shimStats = () => r.bglShimStats();
  // 仪器:实例级 wrap（warmup 后 bglEntShim 已建）——A 臂计 shineCell 键上传笔数,
  // B 臂计 uploadShineSlice 笔数+GL 纹理实际建键（texFromImage 实传=texFromRegion miss）
  window.__instCount = () => {
    const sh = r.bglEntShim;
    if (!sh || sh.__shineWrapped) return !!sh;
    sh.__shineWrapped = true;
    window.__cnt = { oldUploads: 0, sliceCalls: 0, sliceKeys: new Set() };
    const oU = sh.uploadScratchNow.bind(sh);
    sh.uploadScratchNow = function (img, key, ...rest) {
      if (key && String(key).startsWith('shineCell:')) window.__cnt.oldUploads++;
      return oU(img, key, ...rest);
    };
    const oS = sh.uploadShineSlice.bind(sh);
    sh.uploadShineSlice = function (img, key, tint) {
      const ok = oS(img, key, tint);
      if (ok) { window.__cnt.sliceCalls++; window.__cnt.sliceKeys.add(key); }
      return ok;
    };
    return true;
  };
  // GL 层实际建键字节（prototype wrap:texRefresh=全幅重传/texFromImage=新键首传）
  window.__glBytes = async () => {
    const mod = await import('/src/render/GLSpriteLayer.ts');
    const P = mod.GLSpriteLayer.prototype;
    if (!P.__shineWrapped) {
      P.__shineWrapped = true;
      window.__glb = { refresh: 0, fresh: 0, refreshN: 0, freshN: 0 };
      const oR = P.texRefresh;
      P.texRefresh = function (key, img) {
        const e = oR.apply(this, [key, img]);
        if (String(key).startsWith('shineCell:')) {
          window.__glb.refresh += (img.width ?? 0) * (img.height ?? 0) * 4;
          window.__glb.refreshN++;
        }
        return e;
      };
      const oF = P.texFromImage;
      P.texFromImage = function (key, img) {
        const had = this.texs ? this.texs.has(key) : true;
        const e = oF.apply(this, [key, img]);
        if (!had && String(key).startsWith('shineSlice:') && e) {
          window.__glb.fresh += e.w * e.h * 4;
          window.__glb.freshN++;
        }
        return e;
      };
    }
  };
  window.__cntReset = () => {
    window.__cnt.oldUploads = 0; window.__cnt.sliceCalls = 0;
    window.__glb.refresh = 0; window.__glb.refreshN = 0; window.__glb.fresh = 0; window.__glb.freshN = 0;
  };
  window.__sliceSet = async (v) => {
    const tm = await import('/src/render/TileShine.ts');
    tm.shineSliceGlSetForTest(v);
  };
});

// 停 rAF + 静化 + 农场铺设
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
  m.options.data.renderScale = 1;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
const planted = await page.evaluate(() => window.__plantFarm());
console.log(`叶绿素农场铺设=${planted} 格`);
await page.evaluate(() => window.__drive(3));        // 暖机（chunk/shine 缓存首烘）
await page.evaluate(() => window.__instCount());
await page.evaluate(() => window.__glBytes());
await page.evaluate(() => window.__drive(2));        // 二次暖机（切片首见窗出清）

// ---- snapFin/census（_rain-gl-ab 同式） ----
async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++; sum += dd;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, mean: n ? sum / n : 0, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}

// ---- SA/SB/SC:同帧配对 ×2（双臂同格同帧;计数=单帧窗） ----
const pairs = [];
for (let k = 0; k < 2; k++) {
  // A 臂（逐格上传真值）
  await page.evaluate(() => { window.__cntReset(); window.__sliceSet(false); });
  await page.evaluate(() => window.__drive(1));
  const finA = await snapFin();
  const cntA = await page.evaluate(() => ({ old: window.__cnt.oldUploads, up: window.__glb.refresh, upN: window.__glb.refreshN }));
  const stA = await page.evaluate(() => window.__shimStats());
  const md5A = md5fin(`A${k}`, finA);
  // B 臂（切片+quad tint）
  await page.evaluate(() => { window.__cntReset(); window.__sliceSet(true); });
  await page.evaluate(() => window.__drive(1));
  const finB = await snapFin();
  const cntB = await page.evaluate(() => ({ calls: window.__cnt.sliceCalls, keys: window.__cnt.sliceKeys.size, fresh: window.__glb.fresh, freshN: window.__glb.freshN }));
  const stB = await page.evaluate(() => window.__shimStats());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  pairs.push({ k, c, md5A, md5B, cntA, cntB, stA, stB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(4)}%) maxd=${c.maxd} mean=${c.mean.toFixed(3)} bbox=${JSON.stringify(c.bbox)} | A: uploads=${cntA.old}(${(cntA.up / 1024).toFixed(0)}KB)+readbacks=${cntA.old} | B: sliceCalls=${cntB.calls} keys=${cntB.keys} freshUp=${cntB.freshN}(${(cntB.fresh / 1024).toFixed(0)}KB) | B stats fb=${stB?.stats?.fallback} rp=${stB?.stats?.replays}`);
}

const farmN = await page.evaluate(() => window.__farmN);
const area = await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height);
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
chk('SA shine census 有界（n%<1% 且 maxd≤8=±1LSB 舍入域+AA 边族）', nPct < 1 && worstMaxd <= 8, `n=${tot} (${nPct.toFixed(4)}%) maxd=${worstMaxd}`);
chk('SB1 A 臂逐格上传在位（uploads=格数,字节≈格数×6.4KB/帧）',
  pairs.every((p) => p.cntA.old >= farmN * 0.9),
  `A uploads/帧=${pairs[0]?.cntA.old}（≈${(pairs[0]?.cntA.up / 1024).toFixed(0)}KB/帧+同量读回）`);
chk('SB2 B 臂稳态零上传（第 2 配对帧 freshN=0 上传字节=0）',
  pairs[1] ? pairs[1].cntB.freshN === 0 && pairs[1].cntB.fresh === 0 : pairs[0].cntB.freshN <= 1,
  `B fresh 帧1=${pairs[0]?.cntB.freshN} 帧2=${pairs[1]?.cntB.freshN}（首见窗一次,稳态零传）`);
chk('SC B 臂键账稳态（keys=变体数≪格数;调用数=格数）',
  pairs.every((p) => p.cntB.keys < farmN * 0.5 && p.cntB.calls >= farmN * 0.9),
  `keys=${pairs[0]?.cntB.keys} calls=${pairs[0]?.cntB.calls} 格=${farmN}`);
chk('SD shim 链零降级（fb=0/rp=0 双臂）',
  pairs.every((p) => p.stB?.stats?.fallback === 0 && p.stB?.stats?.replays === 0 && p.stA?.stats?.fallback === 0),
  `fbB=${pairs[0]?.stB?.stats?.fallback}`);

// 截图留档
await page.evaluate(() => { window.__sliceSet(true); });
await page.evaluate(() => window.__drive(1));
await page.screenshot({ path: '/tmp/shine-slice-B.png' });
await page.evaluate(() => { window.__sliceSet(false); });
await page.evaluate(() => window.__drive(1));
await page.screenshot({ path: '/tmp/shine-slice-A.png' });

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
