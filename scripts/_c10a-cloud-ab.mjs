// ★C10a 云会话 GLPipeline 后端像素对拍（2026-09-24;_a2-pixel-ab 页内翻面范式）。
// cloudpipe=运行时可翻旗（renderer.setCloudPipeForTest）:A(旧 glfx 会话)→B(管线后端)
// →C(翻回)三态捕获,判据:
//   B==A 逐字节(md5+diff==0)——一期零视觉语义:同 quads 同 blend 同 RGBA8 面,
//        FBO→present 为 texel 中心 1:1 LINEAR 拷贝(零重量化)→ 无 ±1-2LSB 预算
//        (±1-2LSB 备案口径属 cloudbatch 合并的量化分组差异,本刀不适用);
//   C==A  翻回恢复(翻面无残留)+各捕获内连续帧恒等(确定性哨兵);
//   仪器:cloudPathUsed A='glfx'/B='cloudpipe';GLStats 云纹理账页归 cloudpipe。
// 确定性:暂停世界(g.paused——蝴蝶/落叶/粒子/物理全停)+freezeClock+sky.draw dt=0+
//         天气钉死冻结+云集钉死。云从冻结态绘制(drawCloudsNear 无暂停门)。
//         (差面定谳史:紫闪点=紫皇蝴蝶 NPC 随机飞+树摆计数器与钟面无关,均被暂停覆盖)
// 场景:晴天(60 云)/阴天(200+cloudAlpha 染灰)/雨(风暴族 18-21)×缩放/相机相位。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=420000 scripts/_c10a-cloud-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    window.__cloudFrames = [];   // 帧界:收集本帧全部云会话层(pass1 远景+pass2/3 批)
    const r = origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0:云漂移/旋转/淡出全停
    window.__cloudFramesStr = (window.__cloudFrames || []).join('|');
    return r;
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__cloudUnpin = () => { delete sky.maintainClouds; };
  window.__weatherSet = ({ raining, alpha, numClouds }) => {
    const w = g.world.weather;
    if (!w) return false;
    if (raining !== undefined) w.raining = raining;
    if (alpha !== undefined) { w.cloudAlpha = alpha; w.maxRaining = alpha; }
    if (numClouds !== undefined) w.numClouds = numClouds;
    w.lightning = 0;
    return true;
  };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
  window.__pause = (v) => { g.paused = v; };
  const lc = document.createElement('canvas');
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  window.__snapB64 = () => {
    const c = g.renderer.canvas;
    if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.drawImage(c, 0, 0);
    const d = lctx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
  window.__cloudpipeSet = (v) => window.__swGame.renderer.setCloudPipeForTest(v);
  window.__cloudPath = () => window.__swGame.renderer.cloudPathUsed;
  // ★云层快照钩子:cloudBlitRect 尾=会话已 end/present,layer.canvas 恰只含本帧云
  //  (A=glfx 画布,B=pipeline 画布——清屏+云 quads,预合成纯云面,主画布环境噪声
  //  ±1LSB 不入面)。抓 2D 侧 getImageData → b64。
  const clc = document.createElement('canvas');
  const clctx = clc.getContext('2d', { willReadFrequently: true });
  window.__cloudFrames = [];
  const snapLayer = (layer) => {
    const src = layer.canvas;
    if (clc.width !== src.width || clc.height !== src.height) { clc.width = src.width; clc.height = src.height; }
    clctx.clearRect(0, 0, clc.width, clc.height);
    clctx.drawImage(src, 0, 0);
    const d = clctx.getImageData(0, 0, clc.width, clc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
  const origBlit = proto.cloudBlitRect;
  sky.cloudBlitRect = function (ctx, layer) {
    const r = origBlit.call(this, ctx, layer);
    try { (window.__cloudFrames || []).push(snapLayer(layer)); }
    catch (e) { (window.__cloudFrames || []).push('ERR:' + e.message); }
    return r;
  };
});
await freezeClock(page, { tod: 0.5 });   // 正午
// ★风摆+水面波纹关停(差面定谳:出生点水面涟漪为渲染侧逐帧演化,不受暂停门约束;
//  waveQuality=0 → waterWaves.disable——A/B 同走静态水面,与云刀面无涉)
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 160);                    // 云集初始化+收敛窗
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
await page.evaluate(() => window.__pause(true));   // 暂停世界:蝴蝶/落叶/粒子/物理全停
await pump(page, 120);   // ★暂停后收敛窗(暂停 dim/慢速 ease 落定;实测定谳 6 帧全等)

async function capture(label) {
  await pump(page, 6);
  const c1 = await page.evaluate(() => window.__cloudFramesStr);
  await pump(page, 1);
  const c2 = await page.evaluate(() => window.__cloudFramesStr);
  const m1 = md5(c1), m2 = md5(c2);
  chk(`[${label}] 云层面连续帧确定性`, m1 === m2, m1 === m2 ? '' : `随机面在场 m1=${m1.slice(0, 6)} m2=${m2.slice(0, 6)} n=${c1.split('|').length}/${c2.split('|').length}`);
  const path = await page.evaluate(() => window.__cloudPath());
  return { m1, b64: c1, path };
}

/** 单相位 A/B/C 三态捕获+等价判 */
async function phase(label) {
  await page.evaluate(() => window.__cloudpipeSet(false));
  const A = await capture(`${label} A 旧glfx会话`);
  await page.evaluate(() => window.__cloudpipeSet(true));
  await pump(page, 8);                   // 管线层建+纹理冷上传窗
  const B = await capture(`${label} B 管线后端`);
  await page.evaluate(() => window.__cloudpipeSet(false));
  const C = await capture(`${label} C 翻回`);
  chk(`[${label}] A 态实走 glfx 会话`, A.path === 'glfx', '实际=' + A.path);
  chk(`[${label}] B 态实走 cloudpipe`, B.path === 'cloudpipe', '实际=' + B.path);
  chk(`[${label}] B==A 云层面逐字节（管线后端零视觉语义）`, A.m1 === B.m1, `A=${A.m1.slice(0, 8)} B=${B.m1.slice(0, 8)}`);
  if (A.m1 !== B.m1) {
    const d = await page.evaluate(({ x, y }) => {
      const dec = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
      const P = dec(x), Q = dec(y);
      let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      const W = window.__swGame.renderer.canvas.width;
      for (let i = 0; i < P.length; i++) { const dd = Math.abs(P[i] - Q[i]); if (dd > 0) { n++; if (dd > maxd) maxd = dd; const px = (i >> 2) % W, py = (i >> 2) / W | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; } }
      return { n, maxd, bbox: [x0, y0, x1, y1] };
    }, { x: A.b64, y: B.b64 });
    console.log(`  [${label}] diff=${d.n} maxΔ=${d.maxd} bbox=${JSON.stringify(d.bbox)}`);
  }
  chk(`[${label}] C==A 翻回恢复（无残留）`, A.m1 === C.m1, `C=${C.m1.slice(0, 8)}`);
}

/** 相位准备:解暂停→天气/云集/相机参数→收敛→冻结+暂停 */
async function prepare({ raining, alpha, numClouds, zoom = null, camShift = 0 }) {
  await page.evaluate(() => window.__pause(false));
  await page.evaluate(() => window.__cloudUnpin());
  await page.evaluate((p) => window.__weatherSet(p), { raining, alpha, numClouds });
  if (zoom !== null) await page.evaluate((z) => { window.__swGame.camera.zoom = z; }, zoom);
  if (camShift) {
    // ★水平视差位移:玩家+相机同移后只解暂停 6 拍(玩家未及回落,云视差横移已发生)
    await page.evaluate((d) => { const g = window.__swGame; g.camera.x += d; if (g.player) g.player.x += d; }, camShift);
  }
  await pump(page, camShift ? 6 : 50);
  await page.evaluate(() => window.__weatherFreeze());
  await page.evaluate(() => window.__cloudPin());
  await page.evaluate(() => window.__pause(true));
  await pump(page, 120);   // ★同上:暂停后慢速 ease 收敛窗
}

// ---- 相位 1:晴天正午 ----
await phase('晴天');
// ---- 相位 2:阴天(云量 200+cloudAlpha 0.5 染灰) ----
await prepare({ raining: false, alpha: 0.5, numClouds: 200 });
await phase('阴天');
// ---- 相位 3:雨(风暴云族 18-21) ----
await prepare({ raining: true, alpha: 0.8, numClouds: 200 });
await phase('雨');
// ---- 相位 4:晴天+缩放(z=1.5625) ----
await prepare({ raining: false, alpha: 0, numClouds: 60, zoom: 1.5625 });
await phase('缩放');
// ---- 相位 5:晴天+相机上移 224px(云视差重排后冻结) ----
await prepare({ raining: false, alpha: 0, numClouds: 60, zoom: 1.25, camShift: 320 });
await phase('相机移动');

// ---- GLStats 账页连续性:云纹理记账归 cloudpipe ----
await page.evaluate(() => window.__cloudpipeSet(true));
await page.evaluate(() => window.__pause(false));
await pump(page, 10);
await page.evaluate(() => window.__pause(true));
const led = await page.evaluate(() => {
  const s = window.__swGPULog?.snapshot?.();
  if (!s) return null;
  return {
    cloudpipe: s.ctxs.cloudpipe ?? null,
    glfx: s.ctxs.glfx ?? null,
    cloudPath: window.__swGame.renderer.cloudPathUsed,
    stats: window.__swGame.renderer.cloudPathStats,
  };
});
chk('[账页] cloudpipe 账页在场且 liveMB>0（云纹理迁入）', !!led?.cloudpipe && led.cloudpipe.liveMB > 0,
  JSON.stringify(led?.cloudpipe ?? null));
chk('[账页] B 态后 cloudPathUsed=cloudpipe', led?.cloudPath === 'cloudpipe', '实际=' + led?.cloudPath);
console.log('[账页] cloudPathStats:', JSON.stringify(led?.stats ?? {}));
console.log('[账页] cloudpipe:', JSON.stringify(led?.cloudpipe ?? null), ' glfx:', JSON.stringify(led?.glfx ?? null));

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
process.exitCode = fails.length ? 1 : 0;
