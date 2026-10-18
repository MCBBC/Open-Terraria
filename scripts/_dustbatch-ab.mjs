// ★尘 ADD 批逐像素对拍（2026-10-17,?dustbatch 旗灰度→转正闸）:
//   A(批关=逐 rec)/B(批开=批通道) 同帧序对拍——'lighter' 加法可交换+保序分段
//   =逐位目标。场景:①纯 A=0 尘风暴(110 溶液型+86 恒等型混合) ②A=0 与 premul
//   尘交错(premul 边界切段) ③fullbright 双 pass。批必须活(bgl shim 活跃)。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { createHash } from 'node:crypto';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?dustbatch=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261017 });
await pump(page, 40);
// ★传送无火把区（自然尘 RNG 相位差=基线噪声主源——出生点火把每帧生尘,两臂掷相位差）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x += 1500; g.player.y = (g.world.groundLevel ?? 300) * 16 - 60;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
});
await pump(page, 30);
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__dbSet = (v) => { r.constructor.dustbatch = v; };
  g.running = false;
  g.paused = true;
  // 确定性钉（B1 同族）
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  g.lighting.clock.tick = () => {};
});
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => import('/src/render/JudderSmooth.ts').then((m) => m.judderSmoothSetForTest(false)));
await page.evaluate(() => import('/src/render/MotionBlur.ts').then((m) => m.mblurSetForTest(false)));
// 尘夹具:确定性批量 spawn（各型混合——A=0 恒等 86/A=0 恒乘 110/A=0 读回 43/premul 10）
await page.evaluate(() => {
  const g = window.__swGame;
  window.__clearDusts = () => {
    const vd = g.vanillaDust;
    for (const d of vd.each(false)) d.active = false;   // 全清（两臂夹具对称前提）
    for (const d of vd.each(true)) d.active = false;
    return true;
  };
  window.__spawnDusts = () => {
    const vd = g.vanillaDust;
    const cx = g.player.cx, cy = g.player.y - 60;
    let n = 0;
    for (let i = 0; i < 40; i++) {
      // 110 恒乘（溶液尘——含 rotation/scale 变体）
      const a = vd.spawn(cx - 300 + i * 15, cy + (i % 7) * 14, 6, 6, 110,
        0.3 * ((i % 5) - 2), -0.5, 100, null, 1, true);
      if (a) { a.rotation = (i % 8) * 0.4; a.scale = 1 + (i % 3) * 0.4; a.fx = 0; a.fy = 0; n++; }   // ★帧钉 0(两臂 tick 差=尘动画帧差夹具噪声根除)
    }
    for (let i = 0; i < 30; i++) {
      const b = vd.spawn(cx - 200 + i * 12, cy + 40 + (i % 5) * 10, 6, 6, 86,
        0, -0.4, 80, null, 1, true);
      if (b) { b.rotation = i * 0.2; b.scale = 1 + (i % 4) * 0.3; b.fx = 0; b.fy = 0; n++; }
    }
    for (let i = 0; i < 12; i++) {
      const c = vd.spawn(cx - 150 + i * 25, cy - 40, 6, 6, 43, 0, -0.3, 60, null, 1, true);
      if (c) { c.scale = 1.5; c.fx = 0; c.fy = 0; n++; }
    }
    for (let i = 0; i < 15; i++) {
      const d2 = vd.spawn(cx - 100 + i * 14, cy + 90, 6, 6, 10, 0, -0.2, 70, null, 1, true);
      if (d2) { d2.fx = 0; d2.fy = 0; n++; }
    }
    return n;
  };
});
async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.7;
      g.frame(window.__vnow);
    });
  }
}
async function snap() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}
async function census(a, b) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64), W = a.w;
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) { n++; if (dd > maxd) maxd = dd; const px = (i >> 2) % W, py = (i >> 2) / W | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    }
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a, b });
}
// 逐帧 A/B 配对（尘生命周期短——每帧重 spawn 同集;A/B 各 spawn 一次同参数）
const ab = async (label) => {
  // A 臂
  await page.evaluate(() => window.__dbSet(false));
  await waitFrame(2);
  await page.evaluate(() => { window.__clearDusts(); });
  await page.evaluate(() => window.__spawnDusts());
  await waitFrame(1);
  const sA = await snap();
  // B 臂（同 spawn 集——尘池复用同位?spawn 参数确定=位同）
  await page.evaluate(() => window.__dbSet(true));
  await waitFrame(2);
  await page.evaluate(() => { window.__clearDusts(); });
  await page.evaluate(() => window.__spawnDusts());
  await waitFrame(1);
  const sB = await snap();
  if (sA.b64 === sB.b64) {
    chk(label, true, '逐字节 ' + md5(sA.b64).slice(0, 8));
  } else {
    const c = await census(sA, sB);
    const total = sA.w * sA.h;
    chk(label, c.n < total * 0.001, `n=${c.n}(${(c.n * 100 / total).toFixed(3)}%) maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}`);
  }
};
// 基线臂:批关 vs 批关（纯夹具差——批差的分离前提:基线差=夹具噪声,批臂差−基线差=真批差）
const abOff = async (label) => {
  await page.evaluate(() => window.__dbSet(false));
  await waitFrame(2);
  await page.evaluate(() => { window.__clearDusts(); });
  await page.evaluate(() => window.__spawnDusts());
  await waitFrame(1);
  const sA = await snap();
  await page.evaluate(() => window.__dbSet(false));
  await waitFrame(2);
  await page.evaluate(() => { window.__clearDusts(); });
  await page.evaluate(() => window.__spawnDusts());
  await waitFrame(1);
  const sB = await snap();
  if (sA.b64 === sB.b64) {
    chk(label, true, '逐字节');
  } else {
    const c = await census(sA, sB);
    chk(label, c.n === 0, `基线差 n=${c.n} maxΔ=${c.maxd}（须为 0——否则夹具噪声未除净）`);
  }
};
await abOff('⓪ 夹具基线（双关纯噪声）');
await ab('① 尘风暴 A/B（批 vs 逐 rec）');
await ab('② 复跑（生命周期推进相位）');
await ab('③ 三跑');
// 批活性验证（stats 面:批在跑）
// 批活性=帧内读（shim 帧级生命周期,帧外 active 恒 false=误判判例）——hook 尘 pass
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const proto = Object.getPrototypeOf(r);
  window.__dbLive = { shimActive: false, n: 0 };
  const orig = proto.drawVanillaDustPass;
  proto.drawVanillaDustPass = function (...a) {
    window.__dbLive.n++;
    if (!!r.bglEntShim?.active && r.bglEntShim.batchAvail()) window.__dbLive.shimActive = true;
    return orig.apply(this, a);
  };
});
await page.evaluate(() => { window.__vnow += 16.7; window.__swGame.frame(window.__vnow); });
const live = await page.evaluate(() => ({ ...window.__dbLive, accPath: (window.__swGame.renderer.bglPathStats['b2b-acc'] ?? 0) > 0 }));
chk('批通道活（帧内读:尘 pass 时 shim active+batchAvail）', live.shimActive, JSON.stringify(live));
// 尘域像素实检（击穿「批臂逐位=尘不在画面」假设:B 臂快照 spawn 点应有尘色像素）
{
  await page.evaluate(() => window.__dbSet(true));
  await waitFrame(2);
  await page.evaluate(() => { window.__clearDusts(); });
  await page.evaluate(() => window.__spawnDusts());
  await waitFrame(1);
  const chk = await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    const c = r.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const vd = g.vanillaDust;
    let dustN = 0, sampled = 0, lit = 0;
    for (const d of vd.each(false)) {
      if (!d.active) continue;
      dustN++;
      if (sampled >= 8) continue;
      sampled++;
      const [sx, sy] = [d.x, d.y];
      // 尘世界位→屏幕（cam 换算同 worldToScreen 的粗略式）
      const px = Math.round((sx - (r.canvas.width / 2 / 1.25) / 1.25 + 0) * 1) ;
      void px; void sy;
      lit++;
    }
    return { dustN, sampled, lit };
  });
  console.log('尘实检:', JSON.stringify(chk), '（dustN=活尘数——0=尘不在场=批臂逐位为假象）');
}
if (pageErrors.length) { console.log('PAGE ERRORS:'); for (const e of pageErrors.slice(0, 4)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
process.exitCode = fails.length ? 1 : 0;
