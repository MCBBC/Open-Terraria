// 天顶剑 GL 化验证：①GL 路径激活（trailStrip 被调用）②CPU 像素层未走 ③帧率量测
// ④色彩量级数值采样（非截图判读）。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5216') + '/?traildbg=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
// ★SW 模块陈旧缓存清扫：本仓 SW 对 JS 也是 cache-first——编辑后不换版本键的
// 模块会被供旧 bundle（实验现象：同代码两次运行 981 strips vs 0 strips）。
// 探针先注销 SW + 清全部 CacheStorage 再重载，保证执行最新源码。
{
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 500));
  }
}
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
if (!boot.ok) { console.log(JSON.stringify(boot)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.player.x = 3185 * 16 + 8 - g.player.w / 2;
  g.player.y = 381 * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  await wait(600);
  // 鼠标居中：剑群绕玩家可见
  {
    const inp = g.input;
    inp.mouseX = Math.round((g.renderer.canvas?.width ?? 1280) / 2) - 60;
    inp.mouseY = Math.round((g.renderer.canvas?.height ?? 800) / 2);
  }
  // 仪器：GL trailStrip 计数 + TrailShader CPU 路径探测
  const cc = g.renderer.acquireGL();
  const glfx = cc;
  if (!glfx) return { fail: 'no glfx' };
  // ZenithSword.draw 调用计数（验证实体绘制链）
  {
    const zsProto = Object.getPrototypeOf(g.entities.projectiles.find?.(() => false) ?? Object);
    void zsProto;
  }
  const proto = Object.getPrototypeOf(glfx);
  if (!proto.__stripWrapped) {
    const orig = proto.trailStrip;
    window.__stripCount = { n: 0, verts: 0 };
    proto.trailStrip = function (...args) {
      const t0 = performance.now();
      const r = orig.apply(this, args);
      const w = window.__stripCount;
      w.n++; w.verts = args[2].length / 9;
      w.ms = (w.ms ?? 0) + (performance.now() - t0);
      return r;
    };
    proto.__stripWrapped = true;
  }
  // 连续 6 秒：每 20 tick 直接调用 fireZenithSword（绕开输入/物品持握链，仅验渲染）
  try {
    const { ZenithSword } = await import('/src/entities/SwingArc.ts');
    const dp = Object.getPrototypeOf(new ZenithSword(g.player, g.player.cx, g.player.cy, 190, 4956));
    if (!dp.__swDrawWrapped) {
      const od = dp.draw;
      window.__zsDrawCount = { n: 0 };
      dp.draw = function (r, cam) { window.__zsDrawCount.n++; return od.call(this, r, cam); };
      dp.__swDrawWrapped = true;
    }
  } catch (e) { window.__zsDrawErr = String(e); }
  const t0 = performance.now();
  let frames = 0, maxDt = 0, last = t0;
  let steadyDtSum = 0, steadyN = 0;
  const tickHook = () => { frames++; const now = performance.now(); const dt = now - last; if (dt > maxDt) maxDt = dt; if (now - t0 > 3000) { steadyDtSum += dt; steadyN++; } last = now; };
  const raf = () => { tickHook(); if (performance.now() - t0 < 6000) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  g.paused = false;   // headless 隐藏页 autoPause 会停 fixedUpdate（trail 不积累）
  let spawned = 0;
  while (performance.now() - t0 < 6000) {
    g.fireZenithSword(0, { useTime: 10, fired: 0, vid: 4956, dmg: 190, crit: 4, pen: 2 });
    // 手动步进 9 tick：保证 trail 积累/生命衰减不依赖 RAF 节奏
    for (let k = 0; k < 9; k++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
    if (spawned++ > 40) break;
    await wait(120);
  }
  await wait(2500);   // 等剑群生命周期过半（trail 铺满）
  // 帧率统计（剔除前 30 帧热身）
  // 色彩量级：从主画布取玩家右上 160×120 区域（拖尾活跃区）统计 RGBA 分布
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const sc = document.createElement('canvas');
  sc.width = 160; sc.height = 120;
  const scc = sc.getContext('2d', { willReadFrequently: true });
  const px = Math.round(cv.width / 2), py = Math.round(cv.height / 2);
  scc.drawImage(cv, px - 200, py - 220, 160, 120, 0, 0, 160, 120);
  const d = scc.getImageData(0, 0, 160, 120).data;
  let gHigh = 0, total = d.length / 4;
  for (let i = 1; i < d.length; i += 4) if (d[i] > 200 && d[i] >= d[i - 1] * 1.5) gHigh++;
  // 诊断：实体存活数与 draw 调用计数
  const alive = (g.entities?.projectiles ?? []).filter((e) => !e.dead).length;
  const diag = { alive, hasSwHook: !!window.__stripCount };
  // 合成条带直测（绕开游戏实体链）
  try {
    const mod = await import('/src/fx/TrailShader.ts');
    const g2 = window.__swGame;
    const pts = [];
    for (let i = 0; i < 30; i++) {
      pts.push({ x: g2.player.cx - 200 + i * 14, y: g2.player.cy - 100 + Math.sin(i / 3) * 40,
        hw: 43, rot: Math.PI / 2, r: 0.7, g: 1, b: 0.7, a: 1 });
    }
    const okDraw = mod.drawStripTrail(g2.renderer.ctx, g2.renderer,
      { set: 'FinalFractal', pts, opacity: 1, time: 1.5 });
    (window.__synth = window.__synth ?? {}).okDraw = okDraw;
    (window.__synth).dbg = g2.renderer.__trailDbgTop ? { ...g2.renderer.__trailDbgTop } : null;
  } catch (e) { (window.__synth ??= {}).err = (e && e.stack ? e.stack : String(e)).slice(0, 500); }
  // 游戏渲染循环活性：包装 renderer.render 计数（zsDraws=0 的判别：游戏帧循环死?）
  const gR = window.__swGame.renderer;
  if (!gR.__swRenderWrapped) {
    const or0 = gR.render.bind(gR);
    window.__renderCount = { n: 0 };
    gR.render = (...a) => { window.__renderCount.n++; return or0(...a); };
    gR.__swRenderWrapped = true;
  }
  await new Promise((r) => setTimeout(r, 600));
  const renderCount = window.__renderCount.n;
  const glInfo = (() => {
    try {
      const t = document.createElement('canvas');
      const gg = t.getContext('webgl2');
      const ext = gg.getExtension('WEBGL_debug_renderer_info');
      return ext ? gg.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gg.getParameter(gg.RENDERER);
    } catch { return 'n/a'; }
  })();
  const steadyFps = steadyN > 0 ? +(1000 / (steadyDtSum / steadyN)).toFixed(1) : 0;
  // 终局诊断：渲染器实际持有的 atlas 实例上，两图是否已落地
  const ratlas = window.__swGame?.renderer?.atlas;
  const land1 = ratlas ? !!ratlas.ensureVImage('vanilla/Extra_201.png') : null;
  await new Promise((r) => setTimeout(r, 1200));
  const land2 = ratlas ? !!ratlas.ensureVImage('vanilla/Extra_201.png') : null;
  const rfailed = ratlas ? ratlas.failedVImages().slice(0, 6) : null;
  const trailDbg = window.__swGame?.renderer?.__trailDbg ?? null;
  const trailDbgTop = window.__swGame?.renderer?.__trailDbgTop ?? null;
  const trailDbgErr = window.__trailDbgErr ?? null;
  return {
    zsDraws: window.__zsDrawCount?.n ?? null,
    zsErr: window.__zsDrawErr ?? null,
    synth: window.__synth ?? null,
    land1, land2, rfailed,
    trailDbgTop,
    trailDbg,
    trailDbgErr,
    diag,
    aliveNow: (g.entities?.projectiles ?? []).filter((e) => !e.dead).length,
    steadyFps,
    stripMs: +(window.__stripCount.ms ?? 0).toFixed(1),
    glInfo,
    stripDraws: window.__stripCount.n,
    lastVerts: window.__stripCount.verts,
    spawned,
    avgFps: steadyFps,
    maxFrameMs: +maxDt.toFixed(1),
    greenHeavyRatio: +(gHigh / total * 100).toFixed(2),
  };
});
console.log(JSON.stringify(out, null, 1));
try { await page.screenshot({ path: '/tmp/zenith-after.png' }); } catch {}
await browser.close();
const ok = out.stripDraws > 5 && out.avgFps > 45;
console.log(ok ? '✅ GL 路径生效且帧率健康' : '⚠️ 检查 GL 激活/帧率');
process.exit(ok ? 0 : 1);
