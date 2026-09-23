// BJ314 实机性能探针：永夜刃 273 挥砍连发（autoReuse 按住左键）帧时定谳。
// 判据链（BJ255 范式）：GPU 页不挂 profiler——只外测 rAF 间隔 + 微基准四面对照。
// 怀疑面（源码锚）：
//   A. SwingArc.drawArcLayers→tintedFrame 每层每帧 3-pass 烘焙（972 锚弧 5 层
//      + NightsEdgeFly 5 层 = 10 烘焙/帧,arcTintScratch GPU-backed）
//   B. 烘焙结果 drawImage 进 worldCanvas（willReadFrequently=CPU 面）→
//      GPU→CPU 回读同步 ×10/帧（软像素感+卡顿双嫌疑）
//   C. 10 次旋转最近邻放大 blit（CPU 光栅）
// 微基准四面：MB-A 现行路径（GPU scratch 烘焙+CPU 面 blit）/ MB-B CPU scratch
// / MB-C 缓存命中路径（烘焙一次+纯 blit）/ MB-D 纯烘焙 / MB-E 纯 blit。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => String(v)).catch(() => '<unser>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail/i.test(line)) console.log('[console]', line.slice(0, 300));
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ314探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj314probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 场地：开阔平地+玩家居中；授予 273+挂观测
const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) + 4;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) void 0;
  for (let dx = -420; dx <= 420; dx++) {
    for (let dy = -36; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp;
  // 白昼定谳面（BJ313 同款）：时间钉正午（光照 fv 恒 1 面）
  try { g.world.time = 27000 / 3600 * g.world.dayLength ?? g.world.time; } catch { /* 时间面按默认 */ }
  // 273 入热栏 0
  const items = await import('/src/data/items.ts');
  let idx273 = -1;
  items.ITEM_DEFS.forEach((d, i) => { if (d && d.vid === 273) idx273 = i; });
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx273, stack: 1 };
  // 观测：SwingArc/NightsEdgeFly draw 计数+时长
  const arcMod = await import('/src/entities/SwingArc.ts');
  window.__arcMod = arcMod;
  const counters = { arcDraw: 0, arcDrawMs: 0, flyDraw: 0, flyDrawMs: 0 };
  const oArc = arcMod.SwingArc.prototype.draw;
  arcMod.SwingArc.prototype.draw = function (r) {
    const t0 = performance.now();
    oArc.call(this, r);
    counters.arcDraw++;
    counters.arcDrawMs += performance.now() - t0;
  };
  const oFly = arcMod.NightsEdgeFly.prototype.draw;
  arcMod.NightsEdgeFly.prototype.draw = function (r) {
    const t0 = performance.now();
    oFly.call(this, r);
    counters.flyDraw++;
    counters.flyDrawMs += performance.now() - t0;
  };
  window.__bj314c = counters;
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  return {
    idx273, autoReuse: (await import('/src/data/vanillaItemCombat.ts')).itemCombat(273)?.autoReuse,
    worldLayerEnabled: g.renderer.worldLayerEnabled,
    composePath: g.renderer.composePathUsed ?? 'n/a',
    cpuRender: g.renderer.isCpuRender(),
    glfx: (() => { const f = g.renderer.glfx; return f ? { present: true, unavailable: f.unavailable } : { present: false }; })(),
    worldCanvasWillRead: (() => { try { return !!g.renderer.worldCtxLayer; } catch { return false; } })(),
  };
});
console.log('[prep]', JSON.stringify(prep));

// GL/画布面信息
const env = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl2');
  let renderer = 'n/a';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'masked';
  }
  return { webgl2: !!gl, renderer };
});
console.log('[env]', JSON.stringify(env));

// rAF 间隔采样（外测）
async function sampleFrames(label, frames, hold) {
  await page.evaluate((n, h) => {
    const g = window.__swGame;
    g.input.mouseX = g.renderer.canvas.width / 2 + 200;
    g.input.mouseY = g.renderer.canvas.height / 2;
    g.input.mouseDown = h; g.input.mouseHeld = h;
    const c = window.__bj314c;
    c.arcDraw = 0; c.arcDrawMs = 0; c.flyDraw = 0; c.flyDrawMs = 0;
    window.__bj314s = { times: [], n, last: 0, done: false };
    const loop = () => {
      const now = performance.now();
      const s = window.__bj314s;
      if (s.last) s.times.push(now - s.last);
      s.last = now;
      if (s.times.length >= s.n) { s.done = true; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, frames, hold);
  await page.waitForFunction(() => window.__bj314s?.done, { timeout: 120000, polling: 200 });
  const stats = await page.evaluate((lb) => {
    const g = window.__swGame;
    const ts = window.__bj314s.times.slice(2).sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))];
    const c = window.__bj314c;
    const alive = (g.entities.projectiles ?? []).filter((p) => (p.projId === 972) && !p.dead)
      .map((p) => p.constructor.name);
    return {
      label: lb, n: ts.length, avg: +(ts.reduce((s, v) => s + v, 0) / ts.length).toFixed(2),
      p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +ts[ts.length - 1].toFixed(2),
      arcDraw: c.arcDraw, arcDrawMs: +c.arcDrawMs.toFixed(1),
      flyDraw: c.flyDraw, flyDrawMs: +c.flyDrawMs.toFixed(1),
      arcMsPerCall: c.arcDraw ? +(c.arcDrawMs / c.arcDraw).toFixed(3) : 0,
      flyMsPerCall: c.flyDraw ? +(c.flyDrawMs / c.flyDraw).toFixed(3) : 0,
      alive972: alive,
    };
  }, label);
  console.log('[frames]', JSON.stringify(stats));
  return stats;
}

await page.evaluate(() => { window.__swGame.paused = false; });
const base = await sampleFrames('baseline-noswing', 300, false);
const swing = await sampleFrames('swing-hold', 600, true);
await page.screenshot({ path: '/tmp/bj314-swing.png' });
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  g.paused = true;
});
await new Promise((r) => setTimeout(r, 300));

// ---- 微基准四面（暂停态,隔离测量烘焙/回读/blit 成本）----
const mb = await page.evaluate(async () => {
  const { projSprite } = await import('/src/entities/Arrow.ts');
  const img = projSprite(972);
  const fw = img.width, fh = img.height / 4;
  const mkCtx = (w, h, cpu) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d', cpu ? { willReadFrequently: true } : undefined);
  };
  const target = mkCtx(1280, 800, true);   // worldCanvas 同款 CPU 面
  // 与 SwingArc.tintedFrame 逐指令同配方
  const bake = (scratch) => {
    const c = scratch;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, fw, fh);
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgb(40,20,60)';
    c.fillRect(0, 0, fw, fh);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
    c.globalCompositeOperation = 'source-over';
  };
  const blit = (src, ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.translate(400, 300);
    ctx.rotate(0.7);
    ctx.drawImage(src, 0, 0, fw, fh, -fw * 0.55, -fh * 0.55, fw * 1.1, fh * 1.1);
    ctx.restore();
  };
  const bench = (fn, iters) => {
    fn();   // 预热
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    return (performance.now() - t0) / iters;
  };
  const gpuScratch = mkCtx(fw, fh, false).canvas;
  const gpuCtx = gpuScratch.getContext('2d');
  const cpuScratchC = mkCtx(fw, fh, true).canvas;
  const cpuCtx = cpuScratchC.getContext('2d', { willReadFrequently: true });
  const IT = 40;
  // MB-A 现行路径：GPU scratch 烘焙 ×10 → CPU 面 blit ×10（含旋转）
  const mbA = bench(() => {
    for (let i = 0; i < 10; i++) { bake(gpuCtx); blit(gpuScratch, target); }
  }, IT);
  // MB-B CPU scratch：烘焙面同 CPU（消回读）
  const mbB = bench(() => {
    for (let i = 0; i < 10; i++) { bake(cpuCtx); blit(cpuScratchC, target); }
  }, IT);
  // MB-C 缓存路径：烘焙一次（CPU 面）→ 纯 blit ×10
  bake(cpuCtx);
  const mbC = bench(() => {
    for (let i = 0; i < 10; i++) blit(cpuScratchC, target);
  }, IT);
  // MB-D 纯烘焙 ×10（GPU scratch）
  const mbD = bench(() => {
    for (let i = 0; i < 10; i++) bake(gpuCtx);
  }, IT);
  // MB-E 纯烘焙 ×10（CPU scratch）
  const mbE = bench(() => {
    for (let i = 0; i < 10; i++) bake(cpuCtx);
  }, IT);
  return {
    frameWH: [fw, fh],
    mbA_gpuBake_cpuBlit_x10: +mbA.toFixed(3),
    mbB_cpuBake_cpuBlit_x10: +mbB.toFixed(3),
    mbC_cacheBlitOnly_x10: +mbC.toFixed(3),
    mbD_gpuBakeOnly_x10: +mbD.toFixed(3),
    mbE_cpuBakeOnly_x10: +mbE.toFixed(3),
  };
});
console.log('[microbench]', JSON.stringify(mb));
console.log('shot: /tmp/bj314-swing.png');
console.log(JSON.stringify({ base, swing, mb }, null, 1));
await browser.close();
process.exit(0);
